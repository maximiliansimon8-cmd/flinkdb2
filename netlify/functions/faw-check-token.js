/**
 * Netlify Function: FAW Check Token
 *
 * Handles:
 *   - generate:  Creates HMAC token URL for FAW reviewers (JWT-secured)
 *
 * Auth: JWT (generate)
 */
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
  sanitizeString,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FAW_SECRET = process.env.FAW_CHECK_SECRET || process.env.INSPECTION_SECRET || process.env.MONTEUR_SECRET;

const TOKEN_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

if (!FAW_SECRET) console.error('[faw-check-token] CRITICAL: No secret configured (FAW_CHECK_SECRET / INSPECTION_SECRET / MONTEUR_SECRET)!');

// ── Token Generation ──
async function generateToken(reviewer, ts) {
  const crypto = await import('node:crypto');
  return crypto.createHmac('sha256', FAW_SECRET)
    .update(`faw|${reviewer}|${ts}`)
    .digest('hex')
    .substring(0, 24);
}

// ── Token Validation (exported for use by faw-check.js) ──
export async function validateFawToken(token, reviewer, ts) {
  if (!FAW_SECRET || !token || !reviewer || !ts) return false;

  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum) || Date.now() - tsNum > TOKEN_VALIDITY_MS) return false;

  const expected = await generateToken(reviewer, ts);
  try {
    const crypto = await import('node:crypto');
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`faw-check-token:${clientIP}`, 30, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);

  const cors = corsHeaders(origin);

  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const body = await request.json();
    const { action } = body;

    if (action !== 'generate') {
      return new Response(JSON.stringify({ error: 'Unbekannte Aktion' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ═══ Generate Token (JWT-secured) ═══
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'JWT erforderlich' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Verify JWT with Supabase
    const jwt = authHeader.substring(7);
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': SUPABASE_KEY },
    });
    if (!verifyRes.ok) {
      return new Response(JSON.stringify({ error: 'Ungueltige Sitzung' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const { reviewer } = body;
    if (!reviewer || typeof reviewer !== 'string' || reviewer.length < 2) {
      return new Response(JSON.stringify({ error: 'Pruefer-Name erforderlich (min. 2 Zeichen)' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const sanitizedReviewer = sanitizeString(reviewer).substring(0, 50);
    const ts = String(Date.now());
    const token = await generateToken(sanitizedReviewer, ts);

    const siteUrl = process.env.URL || 'https://tools.dimension-outdoor.com';
    const params = new URLSearchParams({ token, reviewer: sanitizedReviewer, ts });

    const fawUrl = `${siteUrl}/faw/?${params.toString()}`;
    const expiresAt = new Date(Date.now() + TOKEN_VALIDITY_MS).toLocaleDateString('de-DE');

    console.log(`[faw-check-token] Token generated for reviewer="${sanitizedReviewer}", expires=${expiresAt}`);
    logApiCall('faw-check-token', 'generate', Date.now(), true);

    return new Response(JSON.stringify({
      success: true,
      url: fawUrl,
      token,
      reviewer: sanitizedReviewer,
      expires: expiresAt,
    }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err) {
    console.error('[faw-check-token] Error:', err.message);
    return safeErrorResponse(500, 'Interner Fehler bei der Token-Generierung', origin, err);
  }
};
