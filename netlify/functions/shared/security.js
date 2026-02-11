/**
 * Shared security helpers for all Netlify Functions.
 * - Origin validation: Only allow requests from the dashboard domain
 * - CORS headers: Restricted to known origins
 */

const ALLOWED_ORIGINS = [
  'https://jet-dashboard-v2.netlify.app',
  'http://localhost:5173',   // Vite dev server
  'http://localhost:4173',   // Vite preview
];

/**
 * Check if the request comes from an allowed origin.
 * Returns the allowed origin string or null.
 */
export function getAllowedOrigin(request) {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Check Origin header first (most reliable for CORS)
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  // Fallback: check Referer header (same-origin requests from the dashboard)
  if (referer) {
    for (const allowed of ALLOWED_ORIGINS) {
      if (referer.startsWith(allowed)) return allowed;
    }
  }

  // Allow requests with no Origin/Referer (same-origin fetch from Netlify itself)
  // This handles the case where the browser doesn't send Origin for same-origin requests
  if (!origin && !referer) {
    return ALLOWED_ORIGINS[0];
  }

  return null;
}

/**
 * Build standard CORS response headers.
 */
export function corsHeaders(allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin || ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Handle CORS preflight (OPTIONS) request.
 */
export function handlePreflight(request) {
  const origin = getAllowedOrigin(request);
  if (!origin) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

/**
 * Create a 403 Forbidden response for unauthorized origins.
 */
export function forbiddenResponse() {
  return new Response(
    JSON.stringify({ error: 'Forbidden: unauthorized origin' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );
}
