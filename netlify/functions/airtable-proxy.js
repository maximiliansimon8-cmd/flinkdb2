/**
 * Netlify Function: Airtable API Proxy
 * Forwards requests to the Airtable REST API with the token injected server-side.
 *
 * Security: Origin validation, restricted CORS.
 * Environment variable required: AIRTABLE_TOKEN (set in Netlify dashboard)
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Rate limiting per IP
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`airtable-proxy:${clientIP}`, 120, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  if (!AIRTABLE_TOKEN) {
    console.error('[airtable-proxy] AIRTABLE_TOKEN not configured');
    return safeErrorResponse(500, 'Server-Konfigurationsfehler', origin);
  }

  try {
    const url = new URL(request.url);
    const pathAndQuery = url.pathname
      .replace(/^\/?\.netlify\/functions\/airtable-proxy\/?/, '')
      .replace(/^\/?api\/airtable\/?/, '') + url.search;

    // Validate the path doesn't contain path traversal attempts
    if (pathAndQuery.includes('..') || pathAndQuery.includes('//')) {
      return safeErrorResponse(400, 'Ungültige Anfrage', origin);
    }

    const airtableUrl = `https://api.airtable.com/v0/${pathAndQuery}`;

    const fetchOpts = {
      method: request.method,
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const body = await request.text();
        // Limit body size (1MB max)
        if (body && body.length > 1_048_576) {
          return safeErrorResponse(413, 'Anfrage zu groß', origin);
        }
        if (body) fetchOpts.body = body;
      } catch (_) { /* no body */ }
    }

    const apiStart = Date.now();
    const response = await fetch(airtableUrl, fetchOpts);
    const data = await response.text();

    logApiCall({
      functionName: 'airtable-proxy',
      service: 'airtable',
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
        'Cache-Control': 'public, max-age=30',
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    logApiCall({
      functionName: 'airtable-proxy',
      service: 'airtable',
      method: request.method,
      endpoint: 'unknown',
      success: false,
      errorMessage: err.message,
    });
    return safeErrorResponse(500, 'Airtable-Anfrage fehlgeschlagen', origin, err);
  }
};

// Route is configured via _redirects:
//   /api/airtable/* → /.netlify/functions/airtable-proxy/:splat
