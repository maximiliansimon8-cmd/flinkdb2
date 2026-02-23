/**
 * Netlify Function: Feature Flags
 *
 * GET  /api/feature-flags         → List all flags
 * GET  /api/feature-flags/:key    → Get single flag
 * PATCH /api/feature-flags/:key   → Update flag (authenticated)
 * POST /api/feature-flags/init    → Initialize table (service_role, idempotent)
 *
 * Auth: Origin-based (shared security module) for dashboard calls
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  safeErrorResponse,
} from './shared/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Supabase REST helper */
async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`feature-flags:${clientIP}`, 60, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  const cors = corsHeaders(origin);
  const url = new URL(request.url);
  const pathParts = url.pathname
    .replace(/^\/?(\.netlify\/functions\/feature-flags\/?|api\/feature-flags\/?)/, '')
    .split('/').filter(Boolean);
  const flagKey = pathParts[0] || null;

  try {
    // POST /api/feature-flags/init — Initialize table (idempotent)
    if (request.method === 'POST' && flagKey === 'init') {
      const testResult = await supabaseRequest('feature_flags?select=key&limit=1');
      if (testResult.ok) {
        return new Response(JSON.stringify({ status: 'table_exists', message: 'Feature flags table already exists' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      return new Response(JSON.stringify({
        status: 'table_missing',
        message: 'Feature flags table needs to be created. Run sql/add-feature-flags.sql in Supabase SQL Editor.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // GET — Read flags
    if (request.method === 'GET') {
      const path = flagKey
        ? `feature_flags?key=eq.${encodeURIComponent(flagKey)}&select=*`
        : 'feature_flags?select=*&order=key.asc';

      const result = await supabaseRequest(path);

      if (!result.ok) {
        if (result.status === 404 || (result.data?.code === '42P01')) {
          return new Response(JSON.stringify({
            flags: {},
            _tableExists: false,
            _message: 'Feature flags table not yet created. Run sql/add-feature-flags.sql',
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        throw new Error('Failed to read feature flags');
      }

      const flags = {};
      (result.data || []).forEach(f => {
        flags[f.key] = {
          enabled: f.enabled,
          description: f.description,
          updatedAt: f.updated_at,
          updatedBy: f.updated_by,
        };
      });

      return new Response(JSON.stringify({ flags, _tableExists: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // PATCH — Update flag (requires auth — already origin-checked above)
    if (request.method === 'PATCH') {
      if (!flagKey) {
        return new Response(JSON.stringify({ error: 'Flag key required: PATCH /api/feature-flags/:key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const body = await request.json();
      if (typeof body.enabled !== 'boolean') {
        return new Response(JSON.stringify({ error: '"enabled" must be a boolean' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const updateData = {
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
        updated_by: body.updatedBy || 'dashboard',
      };

      // Allow updating description (for test phone number etc.)
      if (body.description !== undefined) {
        updateData.description = body.description;
      }

      const result = await supabaseRequest(
        `feature_flags?key=eq.${encodeURIComponent(flagKey)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }
      );

      if (!result.ok || !result.data?.length) {
        return new Response(JSON.stringify({
          error: `Flag "${flagKey}" not found or update failed`,
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      console.log(`[FEATURE_FLAG] ${flagKey} set to ${body.enabled} by ${updateData.updated_by}`);

      return new Response(JSON.stringify({
        success: true,
        flag: {
          key: flagKey,
          enabled: result.data[0].enabled,
          updatedAt: result.data[0].updated_at,
          updatedBy: result.data[0].updated_by,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

  } catch (err) {
    console.error('[feature-flags] Error:', err.message);
    return safeErrorResponse(500, 'Feature-Flag Anfrage fehlgeschlagen', origin, err);
  }
};

// Routing handled by _redirects:
// /api/feature-flags      → /.netlify/functions/feature-flags   200!
// /api/feature-flags/*    → /.netlify/functions/feature-flags   200!
