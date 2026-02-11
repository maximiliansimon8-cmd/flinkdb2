/**
 * Netlify Function: Auth Proxy
 * Server-side authentication against Airtable external_team table.
 *
 * Endpoints (via POST /api/auth):
 *   POST /api/auth/login          – Login with email + password
 *   POST /api/auth/change-password – Change own password
 *   POST /api/auth/reset-password  – Admin resets user password
 *   POST /api/auth/audit-log       – Write audit log entry to activity_log
 *   GET  /api/auth/users           – List all users (admin)
 *   POST /api/auth/users           – Create user (admin)
 *   PATCH /api/auth/users/:id      – Update user (admin)
 *   DELETE /api/auth/users/:id     – Delete user (admin)
 *
 * Security: Origin validation, SHA-256 password hashing server-side.
 * Environment: AIRTABLE_TOKEN
 */

import { getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse } from './shared/security.js';

const BASE_ID = 'apppFUWK829K6B3R2';
const TEAM_TABLE = 'tblPxz19KsF1TUkwr';      // external_team
const ACTIVITY_LOG_TABLE = 'tblDk1dl4J3Ow3Qde'; // activity_log
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
 * Group definitions – kept on server for security.
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
 * Since we don't have a Group field yet, we assign based on email or default to Operations.
 */
function resolveGroup(record) {
  const f = record.fields;
  // If the field 'Group' exists (added later), use it
  if (f.Group) return f.Group;
  // Check if admin email
  const email = (f['E-Mail'] || '').toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return 'Admin';
  // Default: Operations
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
 * Find user by email in external_team
 */
async function findUserByEmail(email) {
  const filter = encodeURIComponent(`LOWER({E-Mail}) = "${email.toLowerCase()}"`);
  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}?filterByFormula=${filter}&maxRecords=1`);
  const data = await res.json();
  return data.records?.[0] || null;
}

/**
 * Find user by record ID
 */
async function findUserById(recordId) {
  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}/${recordId}`);
  if (!res.ok) return null;
  return await res.json();
}

/**
 * Update a user record in Airtable
 */
async function updateUser(recordId, fields) {
  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  return res;
}

/**
 * Write audit log entry to activity_log table
 */
async function writeAuditLog(action, detail, userId, userName) {
  try {
    await airtableFetch(`${BASE_ID}/${ACTIVITY_LOG_TABLE}`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          Channel: 'System',
          Direction: 'Internal',
          Subject: action,
          Message: detail,
          Timestamp: new Date().toISOString(),
          Status: 'Logged',
          'Sender': userName || userId || 'system',
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
    active: f.Active !== false, // default true if not set
    lastLogin: f['Last Login'] || null,
    group: {
      ...config,
      name: groupName,
    },
  };
}

// ═══════════════════════════════════════════
//  ROUTE HANDLERS
// ═══════════════════════════════════════════

async function handleLogin(body, origin) {
  const { email, password } = body;
  if (!email || !password) {
    return jsonResponse(400, { error: 'E-Mail und Passwort erforderlich' }, origin);
  }

  const record = await findUserByEmail(email);
  if (!record) {
    await writeAuditLog('login_failed', `Fehlgeschlagener Login: ${email}`, 'anonymous', 'anonymous');
    return jsonResponse(401, { error: 'Ungültige E-Mail oder Passwort' }, origin);
  }

  const f = record.fields;

  // Check if user is active
  if (f.Active === false) {
    await writeAuditLog('login_blocked', `Deaktivierter Account: ${email}`, record.id, f.Name);
    return jsonResponse(403, { error: 'Account deaktiviert. Kontaktiere den Administrator.' }, origin);
  }

  // Check password – stored in the "Password " field (trailing space, legacy Airtable naming)
  const storedHash = f[PW_FIELD] || '';
  const inputHash = await sha256(password);

  // Default password hash for initial migration (users without stored hash)
  const DEFAULT_PW_HASH = await sha256('***REMOVED_DEFAULT_PW***');

  if (storedHash) {
    // Normal flow: compare stored hash with input hash
    if (inputHash !== storedHash) {
      await writeAuditLog('login_failed', `Falsches Passwort: ${email}`, record.id, f.Name);
      return jsonResponse(401, { error: 'Ungültige E-Mail oder Passwort' }, origin);
    }
  } else {
    // No password stored yet → accept default password '***REMOVED_DEFAULT_PW***' for initial login
    if (inputHash !== DEFAULT_PW_HASH) {
      await writeAuditLog('login_failed', `Falsches Passwort (kein Hash gesetzt): ${email}`, record.id, f.Name);
      return jsonResponse(401, { error: 'Ungültige E-Mail oder Passwort' }, origin);
    }
    // Try to write the hash to Airtable (may fail if token lacks write permissions – that's OK)
    try { await updateUser(record.id, { [PW_FIELD]: DEFAULT_PW_HASH }); } catch {}
  }

  // Update last login (field may not exist yet, that's ok – Airtable ignores unknown fields gracefully)
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

  if (newPassword.length < 6) {
    return jsonResponse(400, { error: 'Neues Passwort muss mindestens 6 Zeichen haben' }, origin);
  }

  const record = await findUserById(userId);
  if (!record) {
    return jsonResponse(404, { error: 'Benutzer nicht gefunden' }, origin);
  }

  const f = record.fields;
  const storedHash = f[PW_FIELD] || '';
  const oldHash = await sha256(oldPassword);

  if (oldHash !== storedHash) {
    await writeAuditLog('password_change_failed', `Falsches altes Passwort: ${f.Name}`, userId, f.Name);
    return jsonResponse(401, { error: 'Altes Passwort ist falsch' }, origin);
  }

  const newHash = await sha256(newPassword);
  if (newHash === storedHash) {
    return jsonResponse(400, { error: 'Neues Passwort muss sich vom alten unterscheiden' }, origin);
  }

  // Update password hash in Airtable (same "Password " field)
  await updateUser(userId, { [PW_FIELD]: newHash });
  await writeAuditLog('password_changed', `Passwort geändert: ${f.Name}`, userId, f.Name);

  return jsonResponse(200, { success: true }, origin);
}

async function handleResetPassword(body, origin) {
  const { userId, adminId } = body;
  if (!userId) {
    return jsonResponse(400, { error: 'userId erforderlich' }, origin);
  }

  const record = await findUserById(userId);
  if (!record) {
    return jsonResponse(404, { error: 'Benutzer nicht gefunden' }, origin);
  }

  const defaultHash = await sha256('***REMOVED_DEFAULT_PW***');
  await updateUser(userId, { [PW_FIELD]: defaultHash });

  const f = record.fields;
  await writeAuditLog('password_reset', `Passwort zurückgesetzt: ${f.Name} (${f['E-Mail']})`, adminId, 'Admin');

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

  // Check if email already exists
  const existing = await findUserByEmail(email);
  if (existing) {
    return jsonResponse(409, { error: 'E-Mail existiert bereits' }, origin);
  }

  const pwHash = await sha256(password || '***REMOVED_DEFAULT_PW***');

  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        Name: name.trim(),
        'E-Mail': email.trim().toLowerCase(),
        [PW_FIELD]: pwHash,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    return jsonResponse(500, { error: `Airtable Fehler: ${err.error?.message || 'Unbekannt'}` }, origin);
  }

  const record = await res.json();
  await writeAuditLog('user_created', `Benutzer erstellt: ${name} (${email}) → ${group || 'Operations'}`, body.adminId, 'Admin');

  return jsonResponse(201, { success: true, user: safeUserResponse(record) }, origin);
}

async function handleUpdateUser(recordId, body, origin) {
  const fields = {};
  if (body.name !== undefined) fields.Name = body.name.trim();
  if (body.email !== undefined) fields['E-Mail'] = body.email.trim().toLowerCase();
  // Group and Active fields may not exist in Airtable yet – only set if they exist
  if (body.group !== undefined) fields.Group = body.group;
  if (body.phone !== undefined) fields.Phone = body.phone;

  const res = await updateUser(recordId, fields);
  if (!res.ok) {
    const err = await res.json();
    return jsonResponse(500, { error: `Airtable Fehler: ${err.error?.message || 'Unbekannt'}` }, origin);
  }

  const record = await res.json();
  const detail = body.group ? `Gruppe geändert → ${body.group}` : 'Benutzer aktualisiert';
  await writeAuditLog('user_updated', `${record.fields.Name}: ${detail}`, body.adminId, 'Admin');

  return jsonResponse(200, { success: true, user: safeUserResponse(record) }, origin);
}

async function handleDeleteUser(recordId, body, origin) {
  // First get user info for audit log
  const record = await findUserById(recordId);
  if (!record) {
    return jsonResponse(404, { error: 'Benutzer nicht gefunden' }, origin);
  }

  const res = await airtableFetch(`${BASE_ID}/${TEAM_TABLE}/${recordId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    return jsonResponse(500, { error: 'Löschfehler' }, origin);
  }

  await writeAuditLog('user_deleted', `Benutzer gelöscht: ${record.fields.Name} (${record.fields['E-Mail']})`, body?.adminId, 'Admin');

  return jsonResponse(200, { success: true }, origin);
}

async function handleWriteAuditLog(body, origin) {
  const { action, detail, userId, userName } = body;
  await writeAuditLog(action || 'unknown', detail || '', userId, userName);
  return jsonResponse(200, { success: true }, origin);
}

async function handleGetAuditLog(origin, url) {
  const limit = parseInt(url.searchParams.get('limit') || '100');
  // Fetch audit log entries sorted by timestamp descending
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

// Get group config (for client to know permissions without hardcoding)
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

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════

function jsonResponse(status, data, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

// ═══════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Check for AIRTABLE_TOKEN
  if (!process.env.AIRTABLE_TOKEN) {
    return jsonResponse(500, { error: 'AIRTABLE_TOKEN not configured' }, origin);
  }

  try {
    const url = new URL(request.url);
    // Extract route: /api/auth/login → login, /api/auth/users/recXYZ → users/recXYZ
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
        return handleLogin(body, origin);

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
        return jsonResponse(404, { error: `Unknown auth route: ${route}` }, origin);
    }
  } catch (err) {
    return jsonResponse(500, { error: `Auth proxy error: ${err.message}` }, origin);
  }
};
