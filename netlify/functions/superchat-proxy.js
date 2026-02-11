/**
 * Netlify Function: Superchat API Proxy
 * Forwards requests to the Superchat REST API with the API key injected server-side.
 *
 * Security: Origin validation, restricted CORS.
 * Environment variable required: SUPERCHAT_API_KEY (set in Netlify dashboard)
 */

import { getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse } from './shared/security.js';

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
  if (!SUPERCHAT_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'SUPERCHAT_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
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

    const response = await fetch(superchatUrl, fetchOpts);
    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Superchat proxy error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }
};

// Route is configured via _redirects:
//   /api/superchat/* → /.netlify/functions/superchat-proxy/:splat
