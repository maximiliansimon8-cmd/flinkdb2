/**
 * Netlify Function: User Management Proxy
 * Uses Supabase service_role key to bypass RLS for user CRUD operations.
 *
 * Endpoints (via POST /api/users):
 *   POST   /api/users/add     – Create new user (app_users entry + optional Supabase Auth)
 *   PATCH  /api/users/update  – Update user group
 *   DELETE /api/users/delete  – Delete user
 *   POST   /api/users/reset   – Reset user password
 *
 * Environment: SUPABASE_SERVICE_ROLE_KEY
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, isValidEmail, isValidUUID, safeErrorResponse,
} from './shared/security.js';

const SUPABASE_URL = 'https://hvgjdosdejnwkuyivnrq.supabase.co';

function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
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

    return new Response(JSON.stringify({ error: 'Unbekannter Endpunkt' }), { status: 404, headers });
  } catch (err) {
    console.error('[user-management] Unhandled error:', err.message);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler' }), { status: 500, headers });
  }
}

async function handleAddUser({ name, email, groupId, password }, headers) {
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
  const pw = password || 'Dimension2025!'; // default password

  try {
    // Step 1: Create Supabase Auth user
    const authUser = await supabaseAuthAdmin('users', {
      method: 'POST',
      body: JSON.stringify({
        email: cleanEmail,
        password: pw,
        email_confirm: true, // auto-confirm email
        user_metadata: { name: cleanName },
      }),
    });

    // Step 2: Create app_users entry with auth_id link
    const profile = await supabaseAdmin('app_users', {
      method: 'POST',
      body: JSON.stringify({
        name: cleanName,
        email: cleanEmail,
        group_id: group,
        active: true,
        auth_id: authUser.id,
      }),
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

async function handleUpdateUser({ userId, groupId }, headers) {
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
    await supabaseAdmin(`app_users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ group_id: safeGroupId }),
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
    const pw = newPassword || 'Dimension2025!';
    await supabaseAuthAdmin(`users/${user.auth_id}`, {
      method: 'PUT',
      body: JSON.stringify({ password: pw }),
    });

    return new Response(JSON.stringify({ success: true, message: 'Passwort erfolgreich zurückgesetzt' }), { status: 200, headers });
  } catch (err) {
    console.error('[user-management] handleResetPassword error:', err.message);
    return new Response(JSON.stringify({ error: 'Fehler beim Zurücksetzen des Passworts' }), { status: 500, headers });
  }
}
