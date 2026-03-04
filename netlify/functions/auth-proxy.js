/**
 * Netlify Function: Auth Proxy
 * Server-side authentication against Airtable external_team table.
 *
 * Endpoints (via POST /api/auth):
 *   POST /api/auth/login          - Login with email + password
 *   POST /api/auth/change-password - Change own password
 *   POST /api/auth/reset-password  - Admin resets user password (requires adminId)
 *   POST /api/auth/audit-log       - Write audit log entry to activity_log
 *   GET  /api/auth/users           - List all users (admin)
 *   POST /api/auth/users           - Create user (admin)
 *   PATCH /api/auth/users/:id      - Update user (admin)
 *   DELETE /api/auth/users/:id     - Delete user (admin)
 *
 * Security: Origin validation, SHA-256 password hashing server-side,
 *           rate limiting, input sanitization, safe error responses.
 * Environment: AIRTABLE_TOKEN
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, sanitizeForAirtableFormula, isValidEmail, isValidAirtableId,
  safeErrorResponse,
} from './shared/security.js';
import { AIRTABLE_BASE, TABLES } from './shared/airtableFields.js';

const BASE_ID = AIRTABLE_BASE;
const TEAM_TABLE = 'tblPxz19KsF1TUkwr';      // external_team — not in shared TABLES constants
const ACTIVITY_LOG_TABLE = TABLES.ACTIVITY_LOG;
const AIRTABLE_API = 'https://api.airtable.com/v0';

/**
 * SHA-256 hash (server-side, using Web Crypto API available in Netlify Edge/Functions)
 */
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Timing-safe comparison of two hex hash strings.
 * Prevents timing attacks by using constant-time comparison.
 */
function hashesEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    const { timingSafeEqual } = require('node:crypto');
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    // Fallback: still do constant-time comparison via XOR
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

/**
 * Group definitions - kept on server for security.
 * Maps Group name (from Airtable Single Select) to permissions.
 */
const GROUP_CONFIG = {
  Admin: {
    id: 'grp_admin',
    tabs: ['displays', 'displays.overview', 'displays.list', 'displays.cities', 'tasks', 'communication', 'admin'],
    actions: ['view', 'export', 'create_task', 'edit_task', 'delete_task', 'send_message', 'view_messages', 'manage_users', 'manage_groups', 'settings'],
    color: '#3b82f6',
    icon: 'Shield',
  },
  Operations: {
    id: 'grp_operations',
    tabs: ['displays', 'displays.overview', 'displays.list', 'displays.cities', 'tasks', 'communication'],
    actions: ['view', 'export', 'create_task', 'edit_task', 'send_message', 'view_messages'],
    color: '#22c55e',
    icon: 'Wrench',
  },
  Sales: {
    id: 'grp_sales',
    tabs: ['displays', 'displays.overview', 'displays.list', 'displays.cities', 'communication'],
    actions: ['view', 'export', 'send_message', 'view_messages'],
    color: '#f59e0b',
    icon: 'TrendingUp',
  },
  Management: {
    id: 'grp_management',
    tabs: ['displays', 'displays.overview', 'displays.list', 'displays.cities', 'tasks'],
    actions: ['view', 'export'],
    color: '#a855f7',
    icon: 'BarChart3',
  },
  Tech: {
    id: 'grp_tech',
    tabs: ['displays', 'displays.overview', 'displays.list', 'displays.cities', 'tasks'],
    actions: ['view', 'export', 'create_task', 'edit_task'],
    color: '#06b6d4',
    icon: 'Code',
  },
};

// The Password field name in Airtable has a trailing space (legacy)
const PW_FIELD = 'Password ';

// Admin email addresses (users who get Admin group regardless)
const ADMIN_EMAILS = [
  'max@dimension-outdoor.com',
  'luca@dimension-outdoor.com',
];

// Legacy role mapping
function groupToRole(groupName) {
  const map = { Admin: 'admin', Operations: 'manager', Sales: 'manager', Management: 'viewer', Tech: 'manager' };
  return map[groupName] || 'viewer';
}

/**
 * Determine group for a user.
 */
function resolveGroup(record) {
  const f = record.fields;
  if (f.Group && GROUP_CONFIG[f.Group]) return f.Group;
  const email = (f['E-Mail'] || '').toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return 'Admin';
  return 'Operations';
}

/**
 * Airtable helper: fetch with auth header
 */
function airtableFetch(path, opts = {}) {
  const token = process.env.AIRTABLE_TOKEN;
  return fetch(`${AIRTABLE_API}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

/**
 * Find user by email in external_team.
 * SECURITY: Email is sanitized for Airtable formula injection prevention.
 */
async function findUserByEmail(email) {
  const safeEmail = sanitizeForAirtableFormula(email.toLowerCase());
  const filter = encodeURIComponent(`LOWER({E-Mail}) = "${safeEmail}"`);
  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}?filterByFormula=${filter}&maxRecords=1`);
  const data = await res.json();
  return data.records?.[0] || null;
}

/**
 * Find user by record ID.
 * SECURITY: Record ID is validated before use.
 */
async function findUserById(recordId) {
  if (!isValidAirtableId(recordId)) return null;
  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}/${recordId}`);
  if (!res.ok) return null;
  return await res.json();
}

/**
 * Update a user record in Airtable.
 * SECURITY: Record ID is validated before use.
 */
async function updateUser(recordId, fields) {
  if (!isValidAirtableId(recordId)) {
    throw new Error('Invalid record ID');
  }
  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  return res;
}

/**
 * Write audit log entry to activity_log table.
 * Inputs are sanitized before writing.
 */
async function writeAuditLog(action, detail, userId, userName) {
  try {
    await airtableFetch(`${BASE_ID}/${ACTIVITY_LOG_TABLE}`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Channel: 'System',
          Direction: 'Internal',
          Subject: sanitizeString(action, 200),
          Message: sanitizeString(detail, 1000),
          Timestamp: new Date().toISOString(),
          Status: 'Logged',
          'Sender': sanitizeString(userName || userId || 'system', 200),
        },
      }),
    });
  } catch {
    // Audit log failure should not break the main operation
  }
}

/**
 * Build safe user response object (no password hash!)
 */
function safeUserResponse(record) {
  const f = record.fields;
  const groupName = resolveGroup(record);
  const config = GROUP_CONFIG[groupName] || GROUP_CONFIG.Operations;

  return {
    id: record.id,
    name: f.Name || '',
    email: f['E-Mail'] || '',
    groupId: config.id,
    groupName: groupName,
    role: groupToRole(groupName),
    phone: f.Phone || '',
    forms: f.Forms || [],
    active: f.Active !== false,
    lastLogin: f['Last Login'] || null,
    group: {
      ...config,
      name: groupName,
    },
  };
}

// =============================================
//  ROUTE HANDLERS
// =============================================

async function handleLogin(body, origin, clientIP) {
  const { email, password } = body;
  if (!email || !password) {
    return jsonResponse(400, { error: 'E-Mail und Passwort erforderlich' }, origin);
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: 'Ungültiges E-Mail-Format' }, origin);
  }

  // Rate limit login attempts per IP (stricter: 10 per minute)
  const loginLimit = checkRateLimit(`login:${clientIP}`, 10, 60_000);
  if (!loginLimit.allowed) {
    await writeAuditLog('login_rate_limited', `Rate limit erreicht: ${email} von IP ${clientIP}`, 'system', 'system');
    return rateLimitResponse(loginLimit.retryAfterMs, origin);
  }

  const record = await findUserByEmail(email);
  if (!record) {
    await writeAuditLog('login_failed', `Fehlgeschlagener Login: ${email}`, 'anonymous', 'anonymous');
    return jsonResponse(401, { error: 'Ungueltige E-Mail oder Passwort' }, origin);
  }

  const f = record.fields;

  // Check if user is active
  if (f.Active === false) {
    await writeAuditLog('login_blocked', `Deaktivierter Account: ${email}`, record.id, f.Name);
    return jsonResponse(403, { error: 'Account deaktiviert. Kontaktiere den Administrator.' }, origin);
  }

  // Check password
  const storedHash = f[PW_FIELD] || '';
  const inputHash = await sha256(password);

  // Default password for initial migration (MUST be set via env var)
  const DEFAULT_PW = process.env.DEFAULT_LOGIN_PASSWORD;
  if (!DEFAULT_PW) {
    console.error('[auth-proxy] CRITICAL: DEFAULT_LOGIN_PASSWORD not configured');
    return jsonResponse(500, { error: 'Server-Konfigurationsfehler' }, origin);
  }
  const DEFAULT_PW_HASH = await sha256(DEFAULT_PW);

  if (storedHash) {
    if (!hashesEqual(inputHash, storedHash)) {
      await writeAuditLog('login_failed', `Falsches Passwort: ${email}`, record.id, f.Name);
      return jsonResponse(401, { error: 'Ungueltige E-Mail oder Passwort' }, origin);
    }
  } else {
    if (!hashesEqual(inputHash, DEFAULT_PW_HASH)) {
      await writeAuditLog('login_failed', `Falsches Passwort (kein Hash gesetzt): ${email}`, record.id, f.Name);
      return jsonResponse(401, { error: 'Ungueltige E-Mail oder Passwort' }, origin);
    }
    try { await updateUser(record.id, { [PW_FIELD]: DEFAULT_PW_HASH }); } catch {}
  }

  try { await updateUser(record.id, { 'Last Login': new Date().toISOString() }); } catch {}
  await writeAuditLog('login', `Login erfolgreich: ${f.Name} (${email})`, record.id, f.Name);

  return jsonResponse(200, {
    success: true,
    user: safeUserResponse(record),
  }, origin);
}

async function handleChangePassword(body, origin) {
  const { userId, oldPassword, newPassword } = body;
  if (!userId || !oldPassword || !newPassword) {
    return jsonResponse(400, { error: 'userId, oldPassword und newPassword erforderlich' }, origin);
  }

  // Validate userId format
  if (!isValidAirtableId(userId)) {
    return jsonResponse(400, { error: 'Ungueltiges Benutzer-ID-Format' }, origin);
  }

  if (newPassword.length < 8) {
    return jsonResponse(400, { error: 'Neues Passwort muss mindestens 8 Zeichen haben' }, origin);
  }

  if (newPassword.length > 128) {
    return jsonResponse(400, { error: 'Passwort darf maximal 128 Zeichen haben' }, origin);
  }

  const record = await findUserById(userId);
  if (!record) {
    return jsonResponse(404, { error: 'Benutzer nicht gefunden' }, origin);
  }

  const f = record.fields;
  const storedHash = f[PW_FIELD] || '';
  const oldHash = await sha256(oldPassword);

  if (!hashesEqual(oldHash, storedHash)) {
    await writeAuditLog('password_change_failed', `Falsches altes Passwort: ${f.Name}`, userId, f.Name);
    return jsonResponse(401, { error: 'Altes Passwort ist falsch' }, origin);
  }

  const newHash = await sha256(newPassword);
  if (hashesEqual(newHash, storedHash)) {
    return jsonResponse(400, { error: 'Neues Passwort muss sich vom alten unterscheiden' }, origin);
  }

  await updateUser(userId, { [PW_FIELD]: newHash });
  await writeAuditLog('password_changed', `Passwort geaendert: ${f.Name}`, userId, f.Name);

  return jsonResponse(200, { success: true }, origin);
}

async function handleResetPassword(body, origin) {
  const { userId, adminId } = body;
  if (!userId) {
    return jsonResponse(400, { error: 'userId erforderlich' }, origin);
  }

  // Validate IDs
  if (!isValidAirtableId(userId)) {
    return jsonResponse(400, { error: 'Ungueltiges Benutzer-ID-Format' }, origin);
  }

  // SECURITY: Require adminId to prevent unauthorized password resets
  if (!adminId || !isValidAirtableId(adminId)) {
    return jsonResponse(400, { error: 'adminId erforderlich' }, origin);
  }

  // Verify the adminId belongs to an actual admin user
  const adminRecord = await findUserById(adminId);
  if (!adminRecord) {
    return jsonResponse(403, { error: 'Nicht autorisiert' }, origin);
  }
  const adminGroup = resolveGroup(adminRecord);
  if (adminGroup !== 'Admin') {
    await writeAuditLog('unauthorized_reset_attempt', `Nicht-Admin versuchte Passwort-Reset: ${adminRecord.fields.Name}`, adminId, adminRecord.fields.Name);
    return jsonResponse(403, { error: 'Nur Administratoren koennen Passwoerter zuruecksetzen' }, origin);
  }

  const record = await findUserById(userId);
  if (!record) {
    return jsonResponse(404, { error: 'Benutzer nicht gefunden' }, origin);
  }

  const resetPw = process.env.DEFAULT_LOGIN_PASSWORD;
  if (!resetPw) {
    console.error('[auth-proxy] CRITICAL: DEFAULT_LOGIN_PASSWORD not configured');
    return jsonResponse(500, { error: 'Server-Konfigurationsfehler' }, origin);
  }
  const defaultHash = await sha256(resetPw);
  await updateUser(userId, { [PW_FIELD]: defaultHash });

  const f = record.fields;
  await writeAuditLog('password_reset', `Passwort zurueckgesetzt: ${f.Name} (${f['E-Mail']})`, adminId, 'Admin');

  return jsonResponse(200, { success: true }, origin);
}

async function handleListUsers(origin) {
  let allRecords = [];
  let offset = null;

  do {
    const url = `${BASE_ID}/${TEAM_TABLE}?pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const res = await airtableFetch(url);
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);

  const users = allRecords.map(safeUserResponse);
  return jsonResponse(200, { users }, origin);
}

async function handleCreateUser(body, origin) {
  const { name, email, group, password } = body;
  if (!name || !email) {
    return jsonResponse(400, { error: 'Name und E-Mail erforderlich' }, origin);
  }

  // Validate email
  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: 'Ungueltiges E-Mail-Format' }, origin);
  }

  // Sanitize name
  const safeName = sanitizeString(name, 200);
  if (!safeName) {
    return jsonResponse(400, { error: 'Name darf nicht leer sein' }, origin);
  }

  // Validate group if provided
  if (group && !GROUP_CONFIG[group]) {
    return jsonResponse(400, { error: 'Ungueltige Gruppe' }, origin);
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return jsonResponse(409, { error: 'E-Mail existiert bereits' }, origin);
  }

  const createPw = password || process.env.DEFAULT_LOGIN_PASSWORD;
  if (!createPw) {
    console.error('[auth-proxy] CRITICAL: DEFAULT_LOGIN_PASSWORD not configured');
    return jsonResponse(500, { error: 'Server-Konfigurationsfehler' }, origin);
  }
  const pwHash = await sha256(createPw);

  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        Name: safeName,
        'E-Mail': email.trim().toLowerCase(),
        [PW_FIELD]: pwHash,
      },
    }),
  });

  if (!res.ok) {
    console.error('[auth-proxy] Airtable create user error:', res.status);
    return jsonResponse(500, { error: 'Fehler beim Erstellen des Benutzers' }, origin);
  }

  const record = await res.json();
  await writeAuditLog('user_created', `Benutzer erstellt: ${safeName} (${email}) -> ${group || 'Operations'}`, body.adminId, 'Admin');

  return jsonResponse(201, { success: true, user: safeUserResponse(record) }, origin);
}

async function handleUpdateUser(recordId, body, origin) {
  // Validate record ID
  if (!isValidAirtableId(recordId)) {
    return jsonResponse(400, { error: 'Ungueltiges Benutzer-ID-Format' }, origin);
  }

  const fields = {};
  if (body.name !== undefined) fields.Name = sanitizeString(body.name, 200);
  if (body.email !== undefined) {
    if (!isValidEmail(body.email)) {
      return jsonResponse(400, { error: 'Ungueltiges E-Mail-Format' }, origin);
    }
    fields['E-Mail'] = body.email.trim().toLowerCase();
  }
  if (body.group !== undefined) {
    if (!GROUP_CONFIG[body.group]) {
      return jsonResponse(400, { error: 'Ungueltige Gruppe' }, origin);
    }
    fields.Group = body.group;
  }
  if (body.phone !== undefined) fields.Phone = sanitizeString(body.phone, 50);

  const res = await updateUser(recordId, fields);
  if (!res.ok) {
    console.error('[auth-proxy] Airtable update user error:', res.status);
    return jsonResponse(500, { error: 'Fehler beim Aktualisieren des Benutzers' }, origin);
  }

  const record = await res.json();
  const detail = body.group ? `Gruppe geaendert -> ${body.group}` : 'Benutzer aktualisiert';
  await writeAuditLog('user_updated', `${record.fields.Name}: ${detail}`, body.adminId, 'Admin');

  return jsonResponse(200, { success: true, user: safeUserResponse(record) }, origin);
}

async function handleDeleteUser(recordId, body, origin) {
  // Validate record ID
  if (!isValidAirtableId(recordId)) {
    return jsonResponse(400, { error: 'Ungueltiges Benutzer-ID-Format' }, origin);
  }

  const record = await findUserById(recordId);
  if (!record) {
    return jsonResponse(404, { error: 'Benutzer nicht gefunden' }, origin);
  }

  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}/${recordId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    return jsonResponse(500, { error: 'Loeschfehler' }, origin);
  }

  await writeAuditLog('user_deleted', `Benutzer geloescht: ${record.fields.Name} (${record.fields['E-Mail']})`, body?.adminId, 'Admin');

  return jsonResponse(200, { success: true }, origin);
}

async function handleWriteAuditLog(body, origin) {
  const { action, detail, userId, userName } = body;
  await writeAuditLog(action || 'unknown', detail || '', userId, userName);
  return jsonResponse(200, { success: true }, origin);
}

async function handleGetAuditLog(origin, url) {
  const limitParam = url.searchParams.get('limit') || '100';
  const limit = Math.min(Math.max(1, parseInt(limitParam, 10) || 100), 500); // Cap at 500
  const filter = encodeURIComponent(`{Channel} = "System"`);
  const res = await airtableFetch(
    `${BASE_ID}/${ACTIVITY_LOG_TABLE}?filterByFormula=${filter}&sort%5B0%5D%5Bfield%5D=Timestamp&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=${limit}`
  );
  const data = await res.json();

  const entries = (data.records || []).map(r => ({
    ts: r.fields.Timestamp || '',
    action: r.fields.Subject || '',
    detail: r.fields.Message || '',
    userName: r.fields.Sender || '',
    userId: r.id,
  }));

  return jsonResponse(200, { entries }, origin);
}

async function handleGetGroups(origin) {
  const groups = Object.entries(GROUP_CONFIG).map(([name, config]) => ({
    id: config.id,
    name,
    description: '',
    color: config.color,
    icon: config.icon,
    tabs: config.tabs,
    actions: config.actions,
  }));
  return jsonResponse(200, { groups }, origin);
}

// =============================================
//  HELPERS
// =============================================

function jsonResponse(status, data, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

// =============================================
//  MAIN HANDLER
// =============================================

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Global rate limiting per IP
  const clientIP = getClientIP(request);
  const globalLimit = checkRateLimit(`global:auth:${clientIP}`, 60, 60_000);
  if (!globalLimit.allowed) {
    return rateLimitResponse(globalLimit.retryAfterMs, origin);
  }

  // Check for AIRTABLE_TOKEN (do not reveal which env var is missing)
  if (!process.env.AIRTABLE_TOKEN) {
    console.error('[auth-proxy] AIRTABLE_TOKEN not configured');
    return jsonResponse(500, { error: 'Server-Konfigurationsfehler' }, origin);
  }

  try {
    const url = new URL(request.url);
    const pathParts = url.pathname
      .replace(/^\/?(\.netlify\/functions\/auth-proxy\/?|api\/auth\/?)/, '')
      .split('/')
      .filter(Boolean);

    const route = pathParts[0] || '';
    const subId = pathParts[1] || '';

    // Parse body for POST/PATCH/DELETE
    let body = {};
    if (request.method !== 'GET') {
      try {
        const text = await request.text();
        if (text) body = JSON.parse(text);
      } catch { /* no body */ }
    }

    // Route dispatch
    switch (route) {
      case 'login':
        if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, origin);
        return handleLogin(body, origin, clientIP);

      case 'change-password':
        if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, origin);
        return handleChangePassword(body, origin);

      case 'reset-password':
        if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, origin);
        return handleResetPassword(body, origin);

      case 'users':
        if (request.method === 'GET') return handleListUsers(origin);
        if (request.method === 'POST' && !subId) return handleCreateUser(body, origin);
        if (request.method === 'PATCH' && subId) return handleUpdateUser(subId, body, origin);
        if (request.method === 'DELETE' && subId) return handleDeleteUser(subId, body, origin);
        return jsonResponse(405, { error: 'Method not allowed' }, origin);

      case 'audit-log':
        if (request.method === 'GET') return handleGetAuditLog(origin, url);
        if (request.method === 'POST') return handleWriteAuditLog(body, origin);
        return jsonResponse(405, { error: 'Method not allowed' }, origin);

      case 'groups':
        if (request.method === 'GET') return handleGetGroups(origin);
        return jsonResponse(405, { error: 'Method not allowed' }, origin);

      default:
        return jsonResponse(404, { error: 'Not found' }, origin);
    }
  } catch (err) {
    console.error('[auth-proxy] Unhandled error:', err.message);
    return jsonResponse(500, { error: 'Interner Serverfehler' }, origin);
  }
};
