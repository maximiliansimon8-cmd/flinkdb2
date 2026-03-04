/**
 * Netlify Function: Install Booker – Akquise Detail
 *
 * Fetches detailed Akquise (acquisition) data from Airtable, including
 * photos, PDFs, and comments. Called from the Scheduling Interface's detail view.
 *
 * Endpoints:
 *   GET /api/install-booker/detail?bookingId=xxx  → Single booking + full Akquise record
 *   GET /api/install-booker/detail?city=xxx       → All Akquise records for a city
 *
 * Auth: Supabase JWT (Authorization header) or BOOKER_API_KEY (x-api-key header)
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, sanitizeForAirtableFormula, secureCompare,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { AIRTABLE_BASE, TABLES, FETCH_FIELDS, VALUES } from './shared/airtableFields.js';
import { transformAkquiseDetail } from './shared/airtableMappers.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BOOKER_API_KEY = process.env.BOOKER_API_KEY;
const AKQUISE_TABLE = TABLES.ACQUISITION;
const AKQUISE_FIELDS = FETCH_FIELDS.acquisitionDetail;

/** Supabase REST helper */
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

/**
 * Verify user authentication via Supabase JWT or API key.
 * Returns { authenticated: true, user } or { authenticated: false }.
 */
async function authenticateUser(request) {
  // Check API key first (for Make.com / external triggers)
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && BOOKER_API_KEY && secureCompare(apiKey, BOOKER_API_KEY)) {
    return { authenticated: true, user: { source: 'api-key' } };
  }

  // Check Supabase JWT
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false };
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_KEY,
      },
    });
    if (!res.ok) return { authenticated: false };
    const user = await res.json();
    return { authenticated: true, user };
  } catch {
    return { authenticated: false };
  }
}

/** Transform raw Airtable record — uses shared transformAkquiseDetail */
const transformAkquiseRecord = transformAkquiseDetail;

/** Build Airtable fields query param string */
function buildFieldsParams() {
  return AKQUISE_FIELDS.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
}

/** Fetch a single Akquise record from Airtable by record ID */
async function fetchAkquiseRecord(recordId) {
  const fieldsParams = buildFieldsParams();
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${recordId}?${fieldsParams}`,
    { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Airtable fetch failed (${res.status}): ${errText}`);
  }
  return res.json();
}

/** Fetch Akquise records from Airtable with a filter formula */
async function fetchAkquiseRecords(filterFormula, maxRecords = 100) {
  const fieldsParams = buildFieldsParams();
  const records = [];
  let offset = null;

  do {
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}?${fieldsParams}&pageSize=100&maxRecords=${maxRecords}`;
    if (filterFormula) url += `&filterByFormula=${encodeURIComponent(filterFormula)}`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Airtable list failed (${res.status}): ${errText}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset && records.length < maxRecords);

  return records;
}

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const cors = {
    ...corsHeaders(origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  };

  // Only GET is supported
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-detail:${clientIP}`, 30, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  // Authenticate — allow same-origin requests from our own domain
  // (CORS origin check above already ensures only allowed domains reach here)
  const auth = await authenticateUser(request);
  const isSameOrigin = origin && origin.includes('jet-dashboard-v2.netlify.app');
  if (!auth.authenticated && !isSameOrigin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const url = new URL(request.url);
  const bookingId = url.searchParams.get('bookingId');
  const akquiseId = url.searchParams.get('akquiseId');
  const city = url.searchParams.get('city');
  const all = url.searchParams.get('all');
  const apiStart = Date.now();

  try {
    // ── Direct Akquise lookup (for Airtable-sourced bookings) ──
    if (akquiseId && AIRTABLE_TOKEN) {
      try {
        const record = await fetchAkquiseRecord(akquiseId);
        const akquise = transformAkquiseRecord(record);
        logApiCall({
          functionName: 'install-booker-detail',
          service: 'airtable',
          method: 'GET',
          endpoint: `akquise/${akquiseId}`,
          durationMs: Date.now() - apiStart,
          statusCode: 200,
          success: true,
        });
        return new Response(JSON.stringify({ akquise }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      } catch (e) {
        console.error('[install-booker-detail] Direct Akquise fetch failed:', e.message);
        return new Response(JSON.stringify({ error: 'Akquise record not found', akquise: null }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
    }

    // ── Single booking detail ──
    if (bookingId) {
      // 1. Get the booking from Supabase
      const bookingResult = await supabaseRequest(
        `install_bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,booking_token,akquise_airtable_id,termin_airtable_id,location_name,city,contact_name,contact_phone,contact_email,jet_id,booked_date,booked_time,booked_end_time,booked_window,route_id,installer_team,status,booking_source,notes,whatsapp_sent_at,reminder_sent_at,reminder_count,booked_at,confirmed_at,created_at,updated_at&limit=1`
      );

      if (!bookingResult.ok || !bookingResult.data?.length) {
        return new Response(JSON.stringify({ error: 'Booking not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const booking = bookingResult.data[0];

      // 2. Fetch the Akquise record from Airtable
      let akquise = null;
      if (booking.akquise_airtable_id && AIRTABLE_TOKEN) {
        try {
          const record = await fetchAkquiseRecord(booking.akquise_airtable_id);
          akquise = transformAkquiseRecord(record);
        } catch (e) {
          console.error('[install-booker-detail] Airtable fetch failed:', e.message);
          // Continue — return booking even if Airtable fails
        }
      }

      // Enrich with route info
      let route = null;
      if (booking.route_id) {
        const routeResult = await supabaseRequest(
          `install_routen?id=eq.${booking.route_id}&select=id,city,schedule_date,installer_team,max_capacity,time_slots,status,notes&limit=1`
        );
        route = routeResult.data?.[0] || null;
      }

      logApiCall({
        functionName: 'install-booker-detail',
        service: 'airtable',
        method: 'GET',
        endpoint: `akquise/${booking.akquise_airtable_id}`,
        durationMs: Date.now() - apiStart,
        statusCode: 200,
        success: true,
      });

      return new Response(JSON.stringify({
        booking: { ...booking, route },
        akquise,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── City-level: all Akquise records for a city ──
    if (city) {
      // 1. Get all bookings for this city from Supabase
      const bookingsResult = await supabaseRequest(
        `install_bookings?city=eq.${encodeURIComponent(city)}&select=id,booking_token,akquise_airtable_id,termin_airtable_id,location_name,city,contact_name,contact_phone,contact_email,jet_id,booked_date,booked_time,booked_end_time,booked_window,route_id,installer_team,status,booking_source,notes,booked_at,confirmed_at,created_at,updated_at&order=created_at.desc&limit=1000`
      );
      const bookings = bookingsResult.ok ? bookingsResult.data || [] : [];

      // Build a map of akquise_airtable_id → booking
      const bookingsByAkquiseId = new Map();
      for (const b of bookings) {
        if (b.akquise_airtable_id) {
          bookingsByAkquiseId.set(b.akquise_airtable_id, b);
        }
      }

      // 2. Query Airtable for records matching this city
      //    Real values: Lead_Status="Won / Signed", approval_status="Accepted"
      let akquiseRecords = [];
      if (AIRTABLE_TOKEN) {
        try {
          // Fetch all Won/Signed + Approved records for this city (no Display yet)
          const safeCity = sanitizeForAirtableFormula(city);
          const rawRecords = await fetchAkquiseRecords(
            `AND({City}='${safeCity}', {Lead_Status}='${VALUES.LEAD_STATUS.WON_SIGNED}', {approval_status}='${VALUES.APPROVAL_STATUS.ACCEPTED}')`,
            500
          );
          akquiseRecords = rawRecords.map(transformAkquiseRecord);
        } catch (e) {
          console.error('[install-booker-detail] Airtable city fetch failed:', e.message);
        }
      }

      // 3. Enrich routes for bookings
      const routeIds = [...new Set(bookings.filter(b => b.route_id).map(b => b.route_id))];
      let routeMap = new Map();
      if (routeIds.length > 0) {
        const routesResult = await supabaseRequest(
          `install_routen?id=in.(${routeIds.join(',')})&select=id,city,schedule_date,installer_team,max_capacity,status&limit=500`
        );
        routeMap = new Map((routesResult.data || []).map(r => [r.id, r]));
      }

      // 4. Combine: merge akquise data with booking data
      const results = akquiseRecords.map(akquise => ({
        booking: bookingsByAkquiseId.has(akquise.id)
          ? { ...bookingsByAkquiseId.get(akquise.id), route: routeMap.get(bookingsByAkquiseId.get(akquise.id).route_id) || null }
          : null,
        akquise,
      }));

      logApiCall({
        functionName: 'install-booker-detail',
        service: 'airtable',
        method: 'GET',
        endpoint: `akquise?city=${city}`,
        durationMs: Date.now() - apiStart,
        statusCode: 200,
        success: true,
        recordsCount: akquiseRecords.length,
      });

      return new Response(JSON.stringify({
        city,
        total: results.length,
        bookingsCount: bookings.length,
        records: results,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── All ready-for-installation records (no city filter) ──
    if (all === 'ready') {
      // 1. Get all bookings from Supabase
      const bookingsResult = await supabaseRequest(
        `install_bookings?select=id,booking_token,akquise_airtable_id,termin_airtable_id,location_name,city,contact_name,contact_phone,contact_email,jet_id,booked_date,booked_time,booked_end_time,booked_window,route_id,installer_team,status,booking_source,notes,booked_at,confirmed_at,created_at,updated_at&order=created_at.desc&limit=1000`
      );
      const bookings = bookingsResult.ok ? bookingsResult.data || [] : [];

      // Build a map of akquise_airtable_id → booking
      const bookingsByAkquiseId = new Map();
      for (const b of bookings) {
        if (b.akquise_airtable_id) {
          bookingsByAkquiseId.set(b.akquise_airtable_id, b);
        }
      }

      // 2. Query Airtable for ALL relevant Akquise records
      //    Real Airtable values: Lead_Status="Won / Signed", approval_status="Accepted"
      //    Filter: Won/Signed + Approved — frontend further filters for no Display ID / no Installation
      let akquiseRecords = [];
      if (AIRTABLE_TOKEN) {
        try {
          const rawRecords = await fetchAkquiseRecords(
            `AND({Lead_Status}='${VALUES.LEAD_STATUS.WON_SIGNED}', {approval_status}='${VALUES.APPROVAL_STATUS.ACCEPTED}')`,
            1000
          );
          akquiseRecords = rawRecords.map(transformAkquiseRecord);
        } catch (e) {
          console.error('[install-booker-detail] Airtable all-ready fetch failed:', e.message);
        }
      }

      // 3. Enrich routes for bookings
      const routeIds = [...new Set(bookings.filter(b => b.route_id).map(b => b.route_id))];
      let routeMap = new Map();
      if (routeIds.length > 0) {
        const routesResult = await supabaseRequest(
          `install_routen?id=in.(${routeIds.join(',')})&select=id,city,schedule_date,installer_team,max_capacity,status&limit=500`
        );
        routeMap = new Map((routesResult.data || []).map(r => [r.id, r]));
      }

      // 4. Combine
      const results = akquiseRecords.map(akquise => ({
        booking: bookingsByAkquiseId.has(akquise.id)
          ? { ...bookingsByAkquiseId.get(akquise.id), route: routeMap.get(bookingsByAkquiseId.get(akquise.id).route_id) || null }
          : null,
        akquise,
      }));

      logApiCall({
        functionName: 'install-booker-detail',
        service: 'airtable',
        method: 'GET',
        endpoint: 'akquise?all=ready',
        durationMs: Date.now() - apiStart,
        statusCode: 200,
        success: true,
        recordsCount: akquiseRecords.length,
      });

      return new Response(JSON.stringify({
        total: results.length,
        bookingsCount: bookings.length,
        records: results,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // No valid query param provided
    return new Response(JSON.stringify({
      error: 'Missing required parameter: bookingId, city, or all',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-booker-detail',
      service: 'mixed',
      method: 'GET',
      endpoint: 'detail',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    console.error('[install-booker-detail] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Detailabfrage fehlgeschlagen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
};
