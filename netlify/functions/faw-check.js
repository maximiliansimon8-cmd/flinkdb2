/**
 * Netlify Function: FAW Check API
 *
 * API for frequency approval reviewers (FAW = Frequenzgenehmigung Antrag Werbung).
 * Supports two auth modes:
 *   1. JWT (logged-in dashboard users with grp_faw_pruefer or admin role)
 *   2. HMAC token (legacy external links — token/reviewer/ts URL params)
 *
 * Actions:
 *   - load_standorte:  List all locations currently "In review" for frequency approval
 *   - load_detail:     Load full detail for a single location (with resolved images)
 *   - set_status:      Set frequency_approval status on a location (Accepted/Rejected/Info required)
 *   - save_faw_data:   Save dVAC/traffic analysis data for a location
 *
 * Auth: JWT (Bearer) OR HMAC token (body params)
 * CORS: Origin-checked for JWT, public for HMAC
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight,
  checkRateLimit, getClientIP, rateLimitResponse,
  safeErrorResponse, sanitizeString, isValidAirtableId,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { validateFawToken } from './faw-check-token.js';
import { AIRTABLE_BASE, TABLES, ACQUISITION_FIELDS as AF, VALUES } from './shared/airtableFields.js';
import { getAttachmentUrls } from './shared/attachmentHelper.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[faw-check] CRITICAL: Supabase credentials not configured!');
}
if (!AIRTABLE_TOKEN) {
  console.error('[faw-check] CRITICAL: AIRTABLE_TOKEN not configured!');
}

// Public CORS — external reviewers access from arbitrary origins via token URLs
// Authorization header required for JWT auth mode (dashboard users)
const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Supabase REST helper ──────────────────────────────────────────────────

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

// ─── Airtable PATCH helper ─────────────────────────────────────────────────

async function airtablePatch(tableId, recordId, fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}/${recordId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

// ─── JSON response helper ──────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
}

function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
  });
}

// ─── Safe fields for public exposure ──────────────────────────────────────
// Never return internal/sensitive fields to external reviewers.

const SAFE_ACQUISITION_SELECT = [
  'airtable_id',
  'jet_id',
  'location_name',
  'street',
  'postal_code',
  'city',
  'images',
  'frequency_approval',
  'frequency_approval_comment',
  'faw_data_attachment',
  'created_at',
].join(',');

// ─── Action: load_standorte ────────────────────────────────────────────────

async function handleLoadStandorte() {
  const apiStart = Date.now();

  const result = await supabaseRequest(
    `acquisition?frequency_approval=eq.${VALUES.APPROVAL_STATUS.IN_REVIEW}&lead_status=eq.${VALUES.LEAD_STATUS.WON_SIGNED}&select=${SAFE_ACQUISITION_SELECT}&order=created_at.asc&limit=500`
  );

  logApiCall({
    functionName: 'faw-check',
    service: 'supabase',
    method: 'GET',
    endpoint: '/rest/v1/acquisition (load_standorte)',
    durationMs: Date.now() - apiStart,
    statusCode: result.status,
    success: result.ok,
    recordsCount: Array.isArray(result.data) ? result.data.length : null,
  });

  if (!result.ok) {
    console.error('[faw-check] load_standorte: Supabase query failed:', result.status, result.data);
    return errorResponse('Daten konnten nicht geladen werden', 502);
  }

  const standorte = result.data || [];

  // For each standort, fetch existing faw_data entries from Supabase
  // We do this in a single query to avoid N+1 queries.
  let fawDataMap = {};
  if (standorte.length > 0) {
    const airtableIds = standorte
      .map(s => s.airtable_id)
      .filter(Boolean)
      .map(id => `"${id}"`)
      .join(',');

    const fawStart = Date.now();
    const fawResult = await supabaseRequest(
      `faw_data?akquise_airtable_id=in.(${airtableIds})&select=akquise_airtable_id,dvac_gesamt,dvac_kfz,schaltung,sov_factor,reviewer_name,created_at&order=created_at.desc&limit=1000`
    );

    logApiCall({
      functionName: 'faw-check',
      service: 'supabase',
      method: 'GET',
      endpoint: '/rest/v1/faw_data (load_standorte batch)',
      durationMs: Date.now() - fawStart,
      statusCode: fawResult.status,
      success: fawResult.ok,
      recordsCount: Array.isArray(fawResult.data) ? fawResult.data.length : null,
    });

    if (fawResult.ok && Array.isArray(fawResult.data)) {
      // Keep only the most recent faw_data entry per standort (already sorted desc)
      for (const row of fawResult.data) {
        if (!fawDataMap[row.akquise_airtable_id]) {
          fawDataMap[row.akquise_airtable_id] = row;
        }
      }
    }
  }

  // Merge faw_data into standort objects
  const enriched = standorte.map(s => ({
    ...s,
    faw_data: fawDataMap[s.airtable_id] || null,
  }));

  return jsonResponse({ success: true, standorte: enriched, count: enriched.length });
}

// ─── Action: load_detail ───────────────────────────────────────────────────

async function handleLoadDetail(body) {
  const { akquise_airtable_id } = body;

  if (!akquise_airtable_id || !isValidAirtableId(akquise_airtable_id)) {
    return errorResponse('Ungültige oder fehlende akquise_airtable_id', 400);
  }

  const apiStart = Date.now();

  // Query acquisition record
  const result = await supabaseRequest(
    `acquisition?airtable_id=eq.${akquise_airtable_id}&select=${SAFE_ACQUISITION_SELECT}&limit=1`
  );

  logApiCall({
    functionName: 'faw-check',
    service: 'supabase',
    method: 'GET',
    endpoint: '/rest/v1/acquisition (load_detail)',
    durationMs: Date.now() - apiStart,
    statusCode: result.status,
    success: result.ok,
  });

  if (!result.ok) {
    console.error('[faw-check] load_detail: Supabase query failed:', result.status, result.data);
    return errorResponse('Standortdaten konnten nicht geladen werden', 502);
  }

  const records = result.data || [];
  if (records.length === 0) {
    return errorResponse('Standort nicht gefunden', 404);
  }

  const standort = records[0];

  // Resolve images via attachment cache (non-expiring Supabase Storage URLs)
  const imgStart = Date.now();
  let resolvedImages = {};
  try {
    resolvedImages = await getAttachmentUrls(SUPABASE_URL, SUPABASE_KEY, akquise_airtable_id, 'images_akquise');
  } catch (err) {
    console.error('[faw-check] load_detail: getAttachmentUrls failed:', err.message);
  }

  logApiCall({
    functionName: 'faw-check',
    service: 'supabase',
    method: 'GET',
    endpoint: '/rest/v1/attachment_cache (load_detail images)',
    durationMs: Date.now() - imgStart,
    success: true,
    recordsCount: Object.keys(resolvedImages).length,
  });

  // Enrich images array with cached URLs if standort has image data
  let images = standort.images || [];
  if (Array.isArray(images) && images.length > 0 && Object.keys(resolvedImages).length > 0) {
    images = images.map(img => {
      const cachedUrl = img.filename ? resolvedImages[img.filename] : null;
      return cachedUrl ? { ...img, url: cachedUrl, cached: true } : { ...img, cached: false };
    });
  }

  // Fetch all faw_data entries for this standort
  const fawStart = Date.now();
  const fawResult = await supabaseRequest(
    `faw_data?akquise_airtable_id=eq.${akquise_airtable_id}&select=*&order=created_at.desc&limit=50`
  );

  logApiCall({
    functionName: 'faw-check',
    service: 'supabase',
    method: 'GET',
    endpoint: '/rest/v1/faw_data (load_detail)',
    durationMs: Date.now() - fawStart,
    statusCode: fawResult.status,
    success: fawResult.ok,
    recordsCount: Array.isArray(fawResult.data) ? fawResult.data.length : null,
  });

  const fawEntries = (fawResult.ok && Array.isArray(fawResult.data)) ? fawResult.data : [];

  return jsonResponse({
    success: true,
    standort: { ...standort, images },
    faw_entries: fawEntries,
  });
}

// ─── Action: set_status ────────────────────────────────────────────────────

async function handleSetStatus(body) {
  const { akquise_airtable_id, status, comment, reviewer_name } = body;

  if (!akquise_airtable_id || !isValidAirtableId(akquise_airtable_id)) {
    return errorResponse('Ungültige oder fehlende akquise_airtable_id', 400);
  }

  const ALLOWED_STATUSES = [VALUES.APPROVAL_STATUS.ACCEPTED, VALUES.APPROVAL_STATUS.REJECTED, VALUES.APPROVAL_STATUS.INFO_REQUIRED];
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return errorResponse(`Ungültiger Status. Erlaubt: ${ALLOWED_STATUSES.join(', ')}`, 400);
  }

  // Comment is required for Rejected and Info required
  if ((status === 'Rejected' || status === 'Info required') && (!comment || !comment.trim())) {
    return errorResponse('Kommentar ist bei "Rejected" und "Info required" erforderlich', 400);
  }

  const sanitizedComment = comment ? sanitizeString(comment, 2000) : '';
  const sanitizedReviewer = reviewer_name ? sanitizeString(reviewer_name, 100) : '';

  // Build Airtable fields to patch
  const airtableFields = {
    [AF.FREQUENCY_APPROVAL]: status,
  };
  if (sanitizedComment) {
    airtableFields[AF.FREQUENCY_APPROVAL_COMMENT] = sanitizedComment;
  }

  // PATCH Airtable first (source of truth)
  const atStart = Date.now();
  const atResult = await airtablePatch(TABLES.ACQUISITION, akquise_airtable_id, airtableFields);

  logApiCall({
    functionName: 'faw-check',
    service: 'airtable',
    method: 'PATCH',
    endpoint: `/v0/${AIRTABLE_BASE}/${TABLES.ACQUISITION}/${akquise_airtable_id} (set_status)`,
    durationMs: Date.now() - atStart,
    statusCode: atResult.status,
    success: atResult.ok,
  });

  if (!atResult.ok) {
    console.error('[faw-check] set_status: Airtable PATCH failed:', atResult.status, atResult.data);
    return errorResponse('Status konnte nicht in Airtable gespeichert werden', 502);
  }

  // Also update Supabase cache immediately so the UI reflects the change without waiting for sync
  const supabaseFields = {
    frequency_approval: status,
  };
  if (sanitizedComment) {
    supabaseFields.frequency_approval_comment = sanitizedComment;
  }

  const sbStart = Date.now();
  const sbResult = await supabaseRequest(
    `acquisition?airtable_id=eq.${akquise_airtable_id}`,
    {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(supabaseFields),
    }
  );

  logApiCall({
    functionName: 'faw-check',
    service: 'supabase',
    method: 'PATCH',
    endpoint: '/rest/v1/acquisition (set_status cache update)',
    durationMs: Date.now() - sbStart,
    statusCode: sbResult.status,
    success: sbResult.ok,
  });

  if (!sbResult.ok) {
    // Non-fatal: Airtable is source of truth; next sync will correct Supabase
    console.error('[faw-check] set_status: Supabase cache update failed (non-fatal):', sbResult.status, sbResult.data);
  }

  console.log(
    `[faw-check] set_status: ${akquise_airtable_id} → "${status}"` +
    (sanitizedReviewer ? ` by ${sanitizedReviewer}` : '')
  );

  return jsonResponse({
    success: true,
    akquise_airtable_id,
    status,
    comment: sanitizedComment || null,
  });
}

// ─── Action: save_faw_data ─────────────────────────────────────────────────

async function handleSaveFawData(body) {
  const { akquise_airtable_id } = body;

  if (!akquise_airtable_id || !isValidAirtableId(akquise_airtable_id)) {
    return errorResponse('Ungültige oder fehlende akquise_airtable_id', 400);
  }

  // Build the faw_data row — only accept known fields, sanitize strings
  // Column names MUST match sql/add-faw-data.sql schema
  const sanitize = (v, max = 500) => (typeof v === 'string' ? sanitizeString(v, max) : v);
  const num = (v) => (v !== undefined && v !== null && !isNaN(Number(v)) ? Number(v) : null);
  const jsonb = (v) => (v && typeof v === 'object') ? v : null;

  const fawRow = {
    akquise_airtable_id,
    // Core dVAC weekly metrics
    dvac_gesamt:       num(body.dvac_gesamt),
    dvac_kfz:          num(body.dvac_kfz),
    dvac_oepnv:        num(body.dvac_oepnv),
    dvac_fussgaenger:  num(body.dvac_fussgaenger),
    // Hourly distribution (JSONB): {"Mo":[h0..h23],"Di":[...],...,"So":[...]}
    hourly_gesamt:     jsonb(body.hourly_gesamt),
    hourly_kfz:        jsonb(body.hourly_kfz),
    hourly_oepnv:      jsonb(body.hourly_oepnv),
    hourly_fussgaenger: jsonb(body.hourly_fussgaenger),
    // Schaltung / SOV
    schaltung:      sanitize(body.schaltung, 20),
    sov_factor:     num(body.sov_factor),
    // INDA metadata
    vac_id:         sanitize(body.vac_id, 50),
    gkz:            sanitize(body.gkz, 20),
    inda_version:   sanitize(body.inda_version, 50),
    // Source & reviewer
    data_source:    sanitize(body.data_source, 100),
    reviewer_name:  sanitize(body.reviewer_name, 100),
    notes:          sanitize(body.notes, 2000),
  };

  // Remove null values to keep the insert clean (let DB defaults apply)
  const cleanRow = Object.fromEntries(
    Object.entries(fawRow).filter(([, v]) => v !== null && v !== undefined && v !== '')
  );
  // Always include the FK even if null after filter — it's required
  cleanRow.akquise_airtable_id = akquise_airtable_id;

  const insertStart = Date.now();
  const insertResult = await supabaseRequest('faw_data', {
    method: 'POST',
    prefer: 'return=representation',
    body: JSON.stringify(cleanRow),
  });

  logApiCall({
    functionName: 'faw-check',
    service: 'supabase',
    method: 'POST',
    endpoint: '/rest/v1/faw_data (save_faw_data)',
    durationMs: Date.now() - insertStart,
    statusCode: insertResult.status,
    success: insertResult.ok,
  });

  if (!insertResult.ok) {
    console.error('[faw-check] save_faw_data: Supabase insert failed:', insertResult.status, insertResult.data);
    return errorResponse('FAW-Daten konnten nicht gespeichert werden', 502);
  }

  const insertedRow = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data;

  // If dvac_gesamt was provided, also write it back to Airtable field "# dVAC / Woche 100% SoV"
  if (cleanRow.dvac_gesamt != null && AIRTABLE_TOKEN) {
    const atStart = Date.now();
    const atResult = await airtablePatch(TABLES.ACQUISITION, akquise_airtable_id, {
      [AF.DVAC_WEEK]: cleanRow.dvac_gesamt,
    });

    logApiCall({
      functionName: 'faw-check',
      service: 'airtable',
      method: 'PATCH',
      endpoint: `/v0/${AIRTABLE_BASE}/${TABLES.ACQUISITION}/${akquise_airtable_id} (dvac_week update)`,
      durationMs: Date.now() - atStart,
      statusCode: atResult.status,
      success: atResult.ok,
    });

    if (!atResult.ok) {
      // Non-fatal: faw_data was saved; Airtable dVAC update is best-effort
      console.error('[faw-check] save_faw_data: Airtable dVAC PATCH failed (non-fatal):', atResult.status, atResult.data);
    } else {
      console.log(`[faw-check] save_faw_data: Airtable dVAC updated for ${akquise_airtable_id} → ${cleanRow.dvac_gesamt}`);
    }
  }

  console.log(
    `[faw-check] save_faw_data: saved for ${akquise_airtable_id}` +
    (cleanRow.reviewer_name ? ` by ${cleanRow.reviewer_name}` : '')
  );

  return jsonResponse({ success: true, faw_data: insertedRow });
}

// ─── JWT validation helper ────────────────────────────────────────────────

async function validateJWT(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const jwt = authHeader.substring(7);
  try {
    // Verify JWT with Supabase Auth
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${jwt}`, 'apikey': SUPABASE_KEY },
    });
    if (!verifyRes.ok) return null;
    const user = await verifyRes.json();
    if (!user?.id) return null;

    // Check app_users for group membership — only grp_faw_pruefer, grp_admin, grp_vollzugriff allowed
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/app_users?auth_id=eq.${user.id}&active=eq.true&select=name,group_id&limit=1`,
      { headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY } }
    );
    if (!profileRes.ok) return null;
    const profiles = await profileRes.json();
    if (!profiles || profiles.length === 0) return null;

    const profile = profiles[0];
    const ALLOWED_GROUPS = ['grp_faw_pruefer', 'grp_admin', 'grp_vollzugriff'];
    if (!ALLOWED_GROUPS.includes(profile.group_id)) return null;

    return { name: profile.name, groupId: profile.group_id };
  } catch (err) {
    console.error('[faw-check] JWT validation error:', err.message);
    return null;
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────

export default async (request, context) => {
  // Determine auth mode: JWT (origin-checked) or HMAC (public CORS)
  const authHeader = request.headers.get('Authorization');
  const isJWTMode = authHeader?.startsWith('Bearer ');

  // CORS: use origin-checked for JWT, public for HMAC
  if (request.method === 'OPTIONS') {
    if (isJWTMode) return handlePreflight(request);
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`faw-check:${clientIP}`, 60, 60_000);
  if (!limit.allowed) {
    const headers = isJWTMode
      ? { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)), ...corsHeaders(getAllowedOrigin(request) || '*') }
      : { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)), ...PUBLIC_CORS };
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }), { status: 429, headers });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Ungültiges JSON im Request-Body', 400);
  }

  const { action } = body;

  // ── Auth: Try JWT first, fall back to HMAC token ──
  let authUser = null;

  if (isJWTMode) {
    authUser = await validateJWT(request);
    if (!authUser) {
      return errorResponse('Ungültige Sitzung oder fehlende Berechtigung', 401);
    }
    // Set reviewer_name from JWT user if not provided in body
    if (!body.reviewer_name) {
      body.reviewer_name = authUser.name;
    }
  } else {
    // HMAC token validation (legacy external links)
    const { token, reviewer, ts } = body;
    if (!token || !reviewer || !ts) {
      return errorResponse('Authentifizierung erforderlich (JWT oder Token)', 401);
    }

    const isValidToken = await validateFawToken(
      sanitizeString(token, 64),
      sanitizeString(reviewer, 100),
      sanitizeString(ts, 20)
    );

    if (!isValidToken) {
      console.error(`[faw-check] Token validation failed for reviewer="${reviewer}", ts=${ts}, ip=${clientIP}`);
      return errorResponse('Ungültiger oder abgelaufener Zugriffslink', 401);
    }
    body.reviewer_name = body.reviewer_name || reviewer;
  }

  if (!action) {
    return errorResponse('Aktion erforderlich', 400);
  }

  try {
    switch (action) {
      case 'load_standorte':
        return await handleLoadStandorte();

      case 'load_detail':
        return await handleLoadDetail(body);

      case 'set_status':
        return await handleSetStatus(body);

      case 'save_faw_data':
        return await handleSaveFawData(body);

      default:
        return errorResponse(`Unbekannte Aktion: ${sanitizeString(action, 50)}`, 400);
    }
  } catch (err) {
    console.error('[faw-check] Unhandled error in action', action, ':', err.message, err.stack);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS } }
    );
  }
};
