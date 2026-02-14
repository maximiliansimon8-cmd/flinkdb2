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

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

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
        if (body) fetchOpts.body = body;
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
