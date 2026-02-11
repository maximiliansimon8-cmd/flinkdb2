/**
 * Netlify Function: Google Sheets CSV Proxy
 * Proxies the Google Sheets CSV export through Netlify's CDN for faster loading.
 *
 * Security: Origin validation, restricted CORS.
 */

import { getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse } from './shared/security.js';

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/export?format=csv&gid=0';

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  try {
    const response = await fetch(SHEET_CSV_URL, {
      headers: { 'User-Agent': 'JET-Dashboard/2.0' },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Google Sheets returned ${response.status}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    const csvData = await response.text();

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Sheets proxy error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
    );
  }
};

// Route is configured via _redirects:
//   /api/sheets → /.netlify/functions/sheets-proxy
