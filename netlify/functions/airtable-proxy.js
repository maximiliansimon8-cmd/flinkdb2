/**
 * Netlify Function: Airtable API Proxy
 * Forwards requests to the Airtable REST API with the token injected server-side.
 *
 * Environment variable required in Netlify:
 *   AIRTABLE_TOKEN = ***REMOVED_AIRTABLE_PAT***
 */

export default async (request, context) => {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

  if (!AIRTABLE_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'AIRTABLE_TOKEN not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Extract the Airtable path from the URL
    // Request URL: https://site.netlify.app/api/airtable/BASE_ID/TABLE_ID?params
    // We need:     https://api.airtable.com/v0/BASE_ID/TABLE_ID?params
    const url = new URL(request.url);
    const pathAndQuery = url.pathname.replace(/^\/?api\/airtable\/?/, '') + url.search;
    const airtableUrl = `https://api.airtable.com/v0/${pathAndQuery}`;

    // Forward request body for POST/PATCH/DELETE
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
        if (body) fetchOpts.body = body;
      } catch (_) { /* no body */ }
    }

    const response = await fetch(airtableUrl, fetchOpts);

    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Airtable proxy error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config = {
  path: '/api/airtable/*',
};
