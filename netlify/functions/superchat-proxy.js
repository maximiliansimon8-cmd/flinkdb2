/**
 * Netlify Function: Superchat API Proxy
 * Forwards requests to the Superchat REST API with the API key injected server-side.
 *
 * Environment variable required in Netlify:
 *   SUPERCHAT_API_KEY = 16c33577-443e-4290-ac25-2493a5d6fd0e
 */

export default async (request, context) => {
  const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;

  if (!SUPERCHAT_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'SUPERCHAT_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    // Extract the Superchat path from the URL
    // Request URL: https://site.netlify.app/api/superchat/messages
    // We need:     https://api.superchat.com/v1.0/messages
    const url = new URL(request.url);
    const pathAndQuery =
      url.pathname.replace(/^\/?api\/superchat\/?/, '') + url.search;
    const superchatUrl = `https://api.superchat.com/v1.0/${pathAndQuery}`;

    const fetchOpts = {
      method: request.method,
      headers: {
        'X-API-KEY': SUPERCHAT_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    // Forward request body for POST/PATCH/DELETE
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const body = await request.text();
        if (body) fetchOpts.body = body;
      } catch (_) {
        /* no body */
      }
    }

    const response = await fetch(superchatUrl, fetchOpts);
    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Superchat proxy error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config = {
  path: '/api/superchat/*',
};
