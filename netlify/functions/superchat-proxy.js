/**
 * Netlify Function: Superchat API Proxy
 * Forwards requests to the Superchat REST API with the API key injected server-side.
 *
 * Security: Origin validation, restricted CORS.
 * Environment variable required: SUPERCHAT_API_KEY (set in Netlify dashboard)
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // ── Feature Flag: Only block WRITE operations (POST/PUT/PATCH) if superchat_enabled is false ──
  // GET requests (reading contacts, conversations, messages) are always allowed
  const isWriteOp = request.method !== 'GET' && request.method !== 'HEAD';
  let testPhoneOverride = null;  // Will be set if test mode is active
  if (isWriteOp) {
    try {
      const SUPABASE_URL = process.env.SUPABASE_URL;
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (SUPABASE_URL && SUPABASE_KEY) {
        const flagRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_flags?key=in.(superchat_enabled,superchat_test_phone)&select=key,enabled,description&limit=10`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        });
        if (flagRes.ok) {
          const flags = await flagRes.json();
          const enabledFlag = flags.find(f => f.key === 'superchat_enabled');
          const testPhoneFlag = flags.find(f => f.key === 'superchat_test_phone');
          if (!enabledFlag?.enabled) {
            console.log(`[superchat-proxy] BLOCKED write op (${request.method}) — superchat_enabled=false`);
            return new Response(JSON.stringify({
              error: 'SuperChat-Senden ist deaktiviert. Aktiviere den WhatsApp-Toggle im Installations-Tool.',
              featureFlag: false,
            }), {
              status: 503,
              headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
            });
          }
          // Test mode: capture override phone for use in request body rewriting
          if (testPhoneFlag?.enabled && testPhoneFlag.description) {
            testPhoneOverride = testPhoneFlag.description;
            console.log(`[superchat-proxy] TEST MODE — will redirect messages to ${testPhoneOverride}`);
          }
        }
      }
    } catch (e) {
      console.warn('[superchat-proxy] Could not check feature flag, blocking write by default:', e.message);
      return new Response(JSON.stringify({
        error: 'Feature Flag konnte nicht geprüft werden. SuperChat-Senden blockiert.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }
  }

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`superchat-proxy:${clientIP}`, 60, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
  if (!SUPERCHAT_API_KEY) {
    console.error('[superchat-proxy] SUPERCHAT_API_KEY not configured');
    return safeErrorResponse(500, 'Server-Konfigurationsfehler', origin);
  }

  try {
    const url = new URL(request.url);
    const pathAndQuery = url.pathname
      .replace(/^\/?\.netlify\/functions\/superchat-proxy\/?/, '')
      .replace(/^\/?api\/superchat\/?/, '') + url.search;
    const superchatUrl = `https://api.superchat.com/v1.0/${pathAndQuery}`;

    const fetchOpts = {
      method: request.method,
      headers: {
        'X-API-KEY': SUPERCHAT_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const body = await request.text();
        if (body) {
          // Test mode: rewrite recipient phone numbers in the request body
          if (testPhoneOverride) {
            try {
              const parsed = JSON.parse(body);
              // SuperChat message format: { to: [{ identifier: "phone" }], ... }
              if (parsed.to && Array.isArray(parsed.to)) {
                const originalPhone = parsed.to[0]?.identifier;
                parsed.to = parsed.to.map(t => ({ ...t, identifier: testPhoneOverride }));
                console.log(`[superchat-proxy] TEST MODE — rewrote recipient from ${originalPhone} to ${testPhoneOverride}`);
              }
              // Alternative format: { contactHandle: "phone", ... }
              if (parsed.contactHandle) {
                console.log(`[superchat-proxy] TEST MODE — rewrote contactHandle from ${parsed.contactHandle} to ${testPhoneOverride}`);
                parsed.contactHandle = testPhoneOverride;
              }
              fetchOpts.body = JSON.stringify(parsed);
            } catch (_parseErr) {
              // If body isn't valid JSON, forward as-is
              fetchOpts.body = body;
            }
          } else {
            fetchOpts.body = body;
          }
        }
      } catch (_) { /* no body */ }
    }

    const apiStart = Date.now();
    const response = await fetch(superchatUrl, fetchOpts);
    const data = await response.text();

    logApiCall({
      functionName: 'superchat-proxy',
      service: 'superchat',
      method: request.method,
      endpoint: pathAndQuery.split('?')[0],
      durationMs: Date.now() - apiStart,
      statusCode: response.status,
      success: response.ok,
      bytesTransferred: data.length,
    });

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    logApiCall({
      functionName: 'superchat-proxy',
      service: 'superchat',
      method: request.method,
      endpoint: 'unknown',
      success: false,
      errorMessage: err.message,
    });
    return safeErrorResponse(500, 'Superchat-Anfrage fehlgeschlagen', origin, err);
  }
};

// Route is configured via _redirects:
//   /api/superchat/* → /.netlify/functions/superchat-proxy/:splat
