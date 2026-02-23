/**
 * Netlify Function: User Management Proxy
 * Uses Supabase service_role key to bypass RLS for user CRUD operations.
 *
 * Endpoints (via POST /api/users):
 *   POST   /api/users/add     – Create new user (app_users entry + optional Supabase Auth)
 *   PATCH  /api/users/update  – Update user group
 *   DELETE /api/users/delete  – Delete user
 *   POST   /api/users/reset   – Reset user password
 *   POST   /api/users/password-changed – Mark password as changed (update policy metadata)
 *   GET    /api/users/password-policy  – Get password policy for a user
 *
 * Environment: SUPABASE_SERVICE_ROLE_KEY
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, isValidEmail, isValidUUID, safeErrorResponse,
} from './shared/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) console.error('[user-management] CRITICAL: SUPABASE_URL not configured!');

function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Verify JWT token from Authorization header and check admin role.
 * Returns { valid: true, userId, email, groupId } or { valid: false, error }.
 */
async function verifyAdminAuth(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Authorization-Header fehlt' };
  }

  const token = authHeader.slice(7);
  const serviceKey = getServiceKey();
  if (!serviceKey) return { valid: false, error: 'Server-Konfigurationsfehler' };

  try {
    // Verify JWT by calling Supabase Auth API
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceKey,
      },
    });
    if (!res.ok) return { valid: false, error: 'Ungültiger Token' };

    const user = await res.json();
    if (!user?.id) return { valid: false, error: 'Ungültiger Token' };

    // Check admin role in app_users table
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/app_users?auth_id=eq.${user.id}&select=id,group_id,name,email`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      }
    );

    if (!profileRes.ok) return { valid: false, error: 'Benutzerprofil nicht gefunden' };
    const profiles = await profileRes.json();
    const profile = profiles?.[0];

    if (!profile) return { valid: false, error: 'Benutzerprofil nicht gefunden' };
    if (profile.group_id !== 'grp_admin') {
      return { valid: false, error: 'Nur Administratoren haben Zugriff' };
    }

    return { valid: true, userId: profile.id, email: profile.email, name: profile.name };
  } catch (err) {
    console.error('[user-management] JWT verification error:', err.message);
    return { valid: false, error: 'Token-Verifizierung fehlgeschlagen' };
  }
}

async function supabaseAdmin(path, options = {}) {
  const serviceKey = getServiceKey();
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');

  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    throw new Error(typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : text);
  }
  return data;
}

async function supabaseAuthAdmin(path, options = {}) {
  const serviceKey = getServiceKey();
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');

  const url = `${SUPABASE_URL}/auth/v1/admin/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    throw new Error(typeof data === 'object' ? (data.message || data.msg || JSON.stringify(data)) : text);
  }
  return data;
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };

  // Rate limiting — user management is sensitive
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`user-mgmt:${clientIP}`, 30, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/users\/?/, '').replace(/^\.netlify\/functions\/user-management\/?/, '');
    const body = request.method !== 'GET' ? await request.json().catch(() => ({})) : {};

    // Password-policy endpoints use auth_id from the JWT directly (self-service)
    const selfServicePaths = ['password-changed', 'password-policy', 'check-password-history'];
    const isSelfService = selfServicePaths.includes(path);

    // Admin-only operations require JWT + admin role verification
    if (!isSelfService) {
      const auth = await verifyAdminAuth(request);
      if (!auth.valid) {
        return new Response(JSON.stringify({ error: auth.error }), { status: 403, headers });
      }
    }

    // Route handling
    if (path === 'add' && request.method === 'POST') {
      return await handleAddUser(body, headers);
    }
    if (path === 'update' && request.method === 'PATCH') {
      return await handleUpdateUser(body, headers);
    }
    if ((path === 'delete' || path.startsWith('delete')) && request.method === 'DELETE') {
      return await handleDeleteUser(body, headers);
    }
    if (path === 'reset' && request.method === 'POST') {
      return await handleResetPassword(body, headers);
    }
    if (path === 'password-changed' && request.method === 'POST') {
      return await handlePasswordChanged(body, headers);
    }
    if (path === 'password-policy' && request.method === 'POST') {
      return await handleGetPasswordPolicy(body, headers);
    }
    if (path === 'check-password-history' && request.method === 'POST') {
      return await handleCheckPasswordHistory(body, headers);
    }

    return new Response(JSON.stringify({ error: 'Unbekannter Endpunkt' }), { status: 404, headers });
  } catch (err) {
    console.error('[user-management] Unhandled error:', err.message);
    return safeErrorResponse(500, 'Interner Serverfehler', origin, err);
  }
}

async function handleAddUser({ name, email, groupId, password, installerTeam }, headers) {
  if (!name || !email) {
    return new Response(JSON.stringify({ error: 'Name und E-Mail erforderlich' }), { status: 400, headers });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Ungültiges E-Mail-Format' }), { status: 400, headers });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = sanitizeString(name.trim(), 200);
  const group = groupId || 'grp_operations';
  if (!password || password.length < 8) {
    return new Response(JSON.stringify({ error: 'Passwort ist erforderlich (min. 8 Zeichen)' }), { status: 400, headers });
  }
  const pw = password;

  try {
    // Step 1: Create Supabase Auth user with password policy metadata
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days
    const authUser = await supabaseAuthAdmin('users', {
      method: 'POST',
      body: JSON.stringify({
        email: cleanEmail,
        password: pw,
        email_confirm: true, // auto-confirm email
        user_metadata: { name: cleanName },
        app_metadata: {
          provider: 'email',
          providers: ['email'],
          must_change_password: true, // Force password change on first login
          password_changed_at: null,
          password_expires_at: expiresAt,
          password_history: [], // Store hashes to prevent reuse
        },
      }),
    });

    // Step 2: Create app_users entry with auth_id link
    const profileData = {
      name: cleanName,
      email: cleanEmail,
      group_id: group,
      active: true,
      auth_id: authUser.id,
    };
    // Add installer_team for monteur users
    if (installerTeam) {
      profileData.installer_team = sanitizeString(installerTeam.trim(), 100);
    }
    const profile = await supabaseAdmin('app_users', {
      method: 'POST',
      body: JSON.stringify(profileData),
    });

    return new Response(JSON.stringify({ success: true, user: Array.isArray(profile) ? profile[0] : profile }), { status: 200, headers });
  } catch (err) {
    // Check for duplicate email
    if (err.message.includes('already') || err.message.includes('duplicate') || err.message.includes('23505')) {
      return new Response(JSON.stringify({ error: 'E-Mail existiert bereits' }), { status: 409, headers });
    }
    console.error('[user-management] handleAddUser error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Erstellen des Benutzers' }), { status: 500, headers });
  }
}

async function handleUpdateUser({ userId, groupId, installerTeam }, headers) {
  if (!userId || !groupId) {
    return new Response(JSON.stringify({ error: 'userId und groupId erforderlich' }), { status: 400, headers });
  }

  // Validate userId is UUID format
  if (!isValidUUID(userId)) {
    return new Response(JSON.stringify({ error: 'Ungültiges userId-Format' }), { status: 400, headers });
  }

  // Sanitize groupId
  const safeGroupId = sanitizeString(groupId, 50);

  try {
    const updateData = { group_id: safeGroupId };
    // Update installer_team if provided (for monteur users)
    if (installerTeam !== undefined) {
      updateData.installer_team = installerTeam ? sanitizeString(installerTeam.trim(), 100) : null;
    }
    await supabaseAdmin(`app_users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (err) {
    console.error('[user-management] handleUpdateUser error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Aktualisieren des Benutzers' }), { status: 500, headers });
  }
}

async function handleDeleteUser({ userId }, headers) {
  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId erforderlich' }), { status: 400, headers });
  }

  // Validate userId
  if (!isValidUUID(userId)) {
    return new Response(JSON.stringify({ error: 'Ungültiges userId-Format' }), { status: 400, headers });
  }

  try {
    // Get user's auth_id first so we can also delete the auth user
    const users = await supabaseAdmin(`app_users?id=eq.${encodeURIComponent(userId)}&select=auth_id,name,email`, {
      method: 'GET',
    });
    const user = Array.isArray(users) ? users[0] : null;

    // Delete app_users entry
    await supabaseAdmin(`app_users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });

    // Also delete the Supabase Auth user if auth_id exists
    if (user?.auth_id) {
      try {
        await supabaseAuthAdmin(`users/${user.auth_id}`, { method: 'DELETE' });
      } catch {
        // Non-critical: auth user may already be deleted
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (err) {
    console.error('[user-management] handleDeleteUser error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Löschen des Benutzers' }), { status: 500, headers });
  }
}

async function handleResetPassword({ userId, newPassword }, headers) {
  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId erforderlich' }), { status: 400, headers });
  }

  // Validate userId
  if (!isValidUUID(userId)) {
    return new Response(JSON.stringify({ error: 'Ungültiges userId-Format' }), { status: 400, headers });
  }

  try {
    // Get auth_id
    const users = await supabaseAdmin(`app_users?id=eq.${encodeURIComponent(userId)}&select=auth_id,email`, {
      method: 'GET',
    });
    const user = Array.isArray(users) ? users[0] : null;

    if (!user?.auth_id) {
      return new Response(JSON.stringify({ error: 'Kein Auth-Account verknüpft' }), { status: 404, headers });
    }

    // Reset password via Admin API
    if (!newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Neues Passwort ist erforderlich (min. 8 Zeichen)' }), { status: 400, headers });
    }
    const pw = newPassword;

    // Get current app_metadata to preserve existing fields
    const authUser = await supabaseAuthAdmin(`users/${user.auth_id}`, { method: 'GET' });
    const currentMeta = authUser?.app_metadata || {};

    await supabaseAuthAdmin(`users/${user.auth_id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password: pw,
        app_metadata: {
          ...currentMeta,
          must_change_password: true, // Force password change after admin reset
          password_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }),
    });

    return new Response(JSON.stringify({ success: true, message: 'Passwort erfolgreich zurückgesetzt. Benutzer muss Passwort beim nächsten Login ändern.' }), { status: 200, headers });
  } catch (err) {
    console.error('[user-management] handleResetPassword error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Zurücksetzen des Passworts' }), { status: 500, headers });
  }
}

/* ═══════════════════════════════════════════
   PASSWORD POLICY ENDPOINTS
   ═══════════════════════════════════════════ */

/**
 * Mark password as changed: clears must_change_password flag,
 * sets password_changed_at, renews expiry, adds to history.
 */
async function handlePasswordChanged({ authId, passwordHash }, headers) {
  if (!authId) {
    return new Response(JSON.stringify({ error: 'authId erforderlich' }), { status: 400, headers });
  }
  if (!isValidUUID(authId)) {
    return new Response(JSON.stringify({ error: 'Ungültiges authId-Format' }), { status: 400, headers });
  }

  try {
    // Get current metadata
    const authUser = await supabaseAuthAdmin(`users/${authId}`, { method: 'GET' });
    const meta = authUser?.app_metadata || {};
    const history = Array.isArray(meta.password_history) ? meta.password_history : [];

    // Add current password hash to history (keep last 5)
    if (passwordHash) {
      history.push({ hash: passwordHash, date: new Date().toISOString() });
      while (history.length > 5) history.shift();
    }

    // Update metadata
    await supabaseAuthAdmin(`users/${authId}`, {
      method: 'PUT',
      body: JSON.stringify({
        app_metadata: {
          ...meta,
          must_change_password: false,
          password_changed_at: new Date().toISOString(),
          password_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
          password_history: history,
        },
      }),
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (err) {
    console.error('[user-management] handlePasswordChanged error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Aktualisieren der Passwort-Policy' }), { status: 500, headers });
  }
}

/**
 * Get password policy status for a user (by authId).
 */
async function handleGetPasswordPolicy({ authId }, headers) {
  if (!authId) {
    return new Response(JSON.stringify({ error: 'authId erforderlich' }), { status: 400, headers });
  }
  if (!isValidUUID(authId)) {
    return new Response(JSON.stringify({ error: 'Ungültiges authId-Format' }), { status: 400, headers });
  }

  try {
    const authUser = await supabaseAuthAdmin(`users/${authId}`, { method: 'GET' });
    const meta = authUser?.app_metadata || {};

    return new Response(JSON.stringify({
      success: true,
      policy: {
        mustChangePassword: meta.must_change_password || false,
        passwordChangedAt: meta.password_changed_at || null,
        passwordExpiresAt: meta.password_expires_at || null,
        isExpired: meta.password_expires_at ? new Date(meta.password_expires_at) < new Date() : false,
        historyCount: Array.isArray(meta.password_history) ? meta.password_history.length : 0,
      },
    }), { status: 200, headers });
  } catch (err) {
    console.error('[user-management] handleGetPasswordPolicy error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Abrufen der Passwort-Policy' }), { status: 500, headers });
  }
}

/**
 * Check if a password hash exists in user's history (prevents reuse of last 5 passwords).
 */
async function handleCheckPasswordHistory({ authId, passwordHash }, headers) {
  if (!authId || !passwordHash) {
    return new Response(JSON.stringify({ error: 'authId und passwordHash erforderlich' }), { status: 400, headers });
  }
  if (!isValidUUID(authId)) {
    return new Response(JSON.stringify({ error: 'Ungültiges authId-Format' }), { status: 400, headers });
  }

  try {
    const authUser = await supabaseAuthAdmin(`users/${authId}`, { method: 'GET' });
    const meta = authUser?.app_metadata || {};
    const history = Array.isArray(meta.password_history) ? meta.password_history : [];

    const isReused = history.some(entry => entry.hash === passwordHash);

    return new Response(JSON.stringify({
      success: true,
      isReused,
      message: isReused ? 'Dieses Passwort wurde bereits verwendet. Bitte wähle ein anderes.' : null,
    }), { status: 200, headers });
  } catch (err) {
    console.error('[user-management] handleCheckPasswordHistory error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Prüfen der Passwort-Historie' }), { status: 500, headers });
  }
}
