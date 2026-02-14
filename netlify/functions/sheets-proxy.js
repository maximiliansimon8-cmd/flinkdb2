/**
 * Netlify Function: Google Sheets CSV Proxy
 * Proxies the Google Sheets CSV export through Netlify's CDN for faster loading.
 *
 * Security: Origin validation, restricted CORS.
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  safeErrorResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

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

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`sheets-proxy:${clientIP}`, 30, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  try {
    const apiStart = Date.now();
    const response = await fetch(SHEET_CSV_URL, {
      headers: { 'User-Agent': 'JET-Dashboard/2.0' },
    });

    if (!response.ok) {
      console.error(`[sheets-proxy] Google Sheets error: ${response.status}`);
      return safeErrorResponse(502, 'Google Sheets nicht erreichbar', origin);
    }

    const csvData = await response.text();

    logApiCall({
      functionName: 'sheets-proxy',
      service: 'google-sheets',
      method: 'GET',
      endpoint: '/export',
      durationMs: Date.now() - apiStart,
      statusCode: response.ok ? 200 : response.status,
      success: response.ok,
      bytesTransferred: csvData.length,
    });

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
    logApiCall({
      functionName: 'sheets-proxy',
      service: 'google-sheets',
      method: 'GET',
      endpoint: '/export',
      success: false,
      errorMessage: err.message,
    });
    return safeErrorResponse(500, 'Sheets-Anfrage fehlgeschlagen', origin, err);
  }
};

// Route is configured via _redirects:
//   /api/sheets → /.netlify/functions/sheets-proxy
