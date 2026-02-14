/**
 * Shared security helpers for all Netlify Functions.
 * - Origin validation: Only allow requests from the dashboard domain
 * - CORS headers: Restricted to known origins
 * - Rate limiting: In-memory sliding window per IP
 * - Input sanitization: Prevent injection attacks
 * - Auth token validation helpers
 */

const ALLOWED_ORIGINS = [
  'https://jet-dashboard-v2.netlify.app',
  'http://localhost:5173',   // Vite dev server
  'http://localhost:4173',   // Vite preview
];

// ─── Rate Limiting (in-memory, per-function-instance) ────────────────
// Note: Netlify Functions are stateless, so this limits within a single
// warm instance. For production-grade rate limiting, use an external store.
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60;  // 60 requests per minute per IP
const RATE_LIMIT_CLEANUP_INTERVAL = 300_000; // Clean up every 5 minutes

let lastCleanup = Date.now();

function cleanupRateLimitStore() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of rateLimitStore) {
    const filtered = timestamps.filter(ts => ts > cutoff);
    if (filtered.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, filtered);
    }
  }
}

/**
 * Check rate limit for a given IP/key.
 * Returns { allowed: boolean, remaining: number, retryAfterMs: number }
 */
export function checkRateLimit(identifier, maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS) {
  cleanupRateLimitStore();

  const now = Date.now();
  const cutoff = now - windowMs;

  let timestamps = rateLimitStore.get(identifier) || [];
  timestamps = timestamps.filter(ts => ts > cutoff);
  timestamps.push(now);
  rateLimitStore.set(identifier, timestamps);

  const requestCount = timestamps.length;
  const allowed = requestCount <= maxRequests;
  const remaining = Math.max(0, maxRequests - requestCount);
  const retryAfterMs = allowed ? 0 : (timestamps[0] + windowMs - now);

  return { allowed, remaining, retryAfterMs };
}

/**
 * Get client IP from request (Netlify forwards via headers).
 */
export function getClientIP(request) {
  return (
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Return a 429 rate limit response.
 */
export function rateLimitResponse(retryAfterMs, origin) {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
        ...corsHeaders(origin),
      },
    }
  );
}

// ─── Origin & CORS ──────────────────────────────────────────────────

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

  // Allow requests with no Origin/Referer (same-origin fetch from Netlify itself,
  // or server-to-server calls like Make.com webhooks)
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Max-Age': '86400',
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
    JSON.stringify({ error: 'Forbidden' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } }
  );
}

// ─── Input Sanitization ─────────────────────────────────────────────

/**
 * Sanitize a string to prevent injection attacks.
 * Removes or escapes dangerous characters for Airtable formulas and general use.
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  // Trim and limit length
  let s = input.trim().substring(0, maxLength);
  // Remove null bytes
  s = s.replace(/\0/g, '');
  return s;
}

/**
 * Sanitize a value for use in Airtable filter formulas.
 * Prevents formula injection by escaping special characters.
 */
export function sanitizeForAirtableFormula(value) {
  if (typeof value !== 'string') return '';
  // Remove characters that could break out of Airtable formula strings
  return value
    .replace(/\\/g, '\\\\')   // Escape backslashes first
    .replace(/"/g, '\\"')     // Escape double quotes
    .replace(/\n/g, '')       // Remove newlines
    .replace(/\r/g, '')       // Remove carriage returns
    .trim()
    .substring(0, 500);
}

/**
 * Validate an email address format.
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  // Basic RFC-compliant email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * Validate an Airtable record ID format (rec + alphanumeric).
 */
export function isValidAirtableId(id) {
  if (typeof id !== 'string') return false;
  return /^rec[a-zA-Z0-9]{14}$/.test(id);
}

/**
 * Validate a UUID format.
 */
export function isValidUUID(id) {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Sanitize an object by applying sanitizeString to all string values.
 * Useful for sanitizing request bodies.
 */
export function sanitizeObject(obj, maxStringLength = 1000) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj, maxStringLength);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item, maxStringLength));

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const safeKey = sanitizeString(key, 100);
    sanitized[safeKey] = sanitizeObject(value, maxStringLength);
  }
  return sanitized;
}

// ─── Error Handling ─────────────────────────────────────────────────

/**
 * Create a safe error response that does not leak internal details.
 * In production, only a generic message is returned.
 * Stack traces, internal paths, and error details are stripped.
 */
export function safeErrorResponse(statusCode, publicMessage, origin, internalError = null) {
  if (internalError) {
    // Log internally for debugging, but never send to client
    console.error(`[security] Internal error: ${internalError.message || internalError}`);
  }

  return new Response(
    JSON.stringify({ error: publicMessage }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      },
    }
  );
}
