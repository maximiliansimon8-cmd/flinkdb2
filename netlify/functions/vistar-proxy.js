/**
 * Netlify Function: Vistar SSP API Proxy
 *
 * Handles session auth (cached ~7h) and proxies requests to:
 *   - Ad Platform Reporting API (SSP Exchange reports)
 *   - Networks API
 *
 * Environment variables required (set in Netlify dashboard):
 *   VISTAR_EMAIL    – API user email
 *   VISTAR_PASSWORD – API user password
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

/* ─── Session cache (in-memory, lives for the function instance) ─── */
let sessionCookie = null;
let sessionExpires = 0;
const SESSION_TTL = 7 * 60 * 60 * 1000; // 7 hours (Vistar sessions last 8h)

const VISTAR_PLATFORM = 'https://platform-api.vistarmedia.com';
const VISTAR_TRAFFICKING = 'https://trafficking.vistarmedia.com';

/**
 * Authenticate and cache the session cookie.
 */
async function ensureSession() {
  if (sessionCookie && Date.now() < sessionExpires) {
    return sessionCookie;
  }

  const email = process.env.VISTAR_EMAIL;
  const password = process.env.VISTAR_PASSWORD;
  if (!email || !password) {
    throw new Error('VISTAR_EMAIL / VISTAR_PASSWORD not configured');
  }

  const res = await fetch(`${VISTAR_PLATFORM}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vistar auth failed (${res.status}): ${text}`);
  }

  // Extract session cookie from Set-Cookie header
  const setCookie = res.headers.get('set-cookie') || '';
  // Vistar uses "tr-development=..." or similar cookie name
  const cookieMatch = setCookie.match(/([^;]+)/);
  if (!cookieMatch) {
    throw new Error('No session cookie in Vistar response');
  }

  sessionCookie = cookieMatch[1];
  sessionExpires = Date.now() + SESSION_TTL;
  console.log('[vistar-proxy] Authenticated successfully');
  return sessionCookie;
}

/**
 * Force re-auth on 401/403.
 */
function invalidateSession() {
  sessionCookie = null;
  sessionExpires = 0;
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`vistar-proxy:${clientIP}`, 30, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  try {
    const url = new URL(request.url);
    // Strip proxy prefix: /api/vistar/report → /report
    const path = url.pathname
      .replace(/^\/?\.netlify\/functions\/vistar-proxy\/?/, '')
      .replace(/^\/?api\/vistar\/?/, '');

    const apiStart = Date.now();
    const cookie = await ensureSession();

    let targetUrl;
    let method = request.method;
    let body = null;

    if (path === 'networks' || path.startsWith('networks/')) {
      // Networks API → platform-api
      targetUrl = `${VISTAR_PLATFORM}/${path}`;
    } else if (path === 'report' || path.startsWith('report')) {
      // Reporting API → trafficking
      targetUrl = `${VISTAR_TRAFFICKING}/${path}`;
    } else if (path === 'reports' || path.startsWith('reports')) {
      targetUrl = `${VISTAR_TRAFFICKING}/${path}`;
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown vistar path: ${path}` }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Forward body for POST/PUT
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await request.text();
      } catch {}
    }

    const fetchOpts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
    };
    if (body) fetchOpts.body = body;

    let res = await fetch(targetUrl, fetchOpts);

    // Retry once on auth failure
    if (res.status === 401 || res.status === 403) {
      console.log('[vistar-proxy] Session expired, re-authenticating...');
      invalidateSession();
      const newCookie = await ensureSession();
      fetchOpts.headers.Cookie = newCookie;
      res = await fetch(targetUrl, fetchOpts);
    }

    const rawText = await res.text();

    logApiCall({
      functionName: 'vistar-proxy',
      service: 'vistar',
      method,
      endpoint: path,
      durationMs: Date.now() - apiStart,
      statusCode: res.status,
      success: res.ok,
      bytesTransferred: rawText.length,
    });

    // Transform columnar Vistar response to row-based format for report endpoints
    let responseData = rawText;
    if ((path === 'report' || path.startsWith('report')) && res.ok) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed.rows && typeof parsed.rows === 'object' && !Array.isArray(parsed.rows)) {
          // Columnar format: { rows: { col1: [...], col2: [...] } }
          // Transform to: [ { col1: val, col2: val }, ... ]
          const columns = Object.keys(parsed.rows);
          const rowCount = columns.length > 0 ? parsed.rows[columns[0]].length : 0;
          const rows = [];
          for (let i = 0; i < rowCount; i++) {
            const row = {};
            for (const col of columns) {
              row[col] = parsed.rows[col][i];
            }
            rows.push(row);
          }
          responseData = JSON.stringify(rows);
          console.log(`[vistar-proxy] Transformed ${rowCount} rows from columnar format`);
        }
      } catch {
        // If parsing fails, return raw response
      }
    }

    return new Response(responseData, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // 5 min cache
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    logApiCall({
      functionName: 'vistar-proxy',
      service: 'vistar',
      method: request.method,
      endpoint: 'unknown',
      success: false,
      errorMessage: err.message,
    });
    console.error('[vistar-proxy] Error:', err.message);
    return safeErrorResponse(500, 'Vistar-Anfrage fehlgeschlagen', origin, err);
  }
};
