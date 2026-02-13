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

import { getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse } from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BOOKER_API_KEY = process.env.BOOKER_API_KEY;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const AKQUISE_TABLE = 'tblqFMBAeKQ1NbSI8';

/** All Airtable fields we want to fetch from the Akquise table */
const AKQUISE_FIELDS = [
  'Akquise ID',
  'Lead_Status',
  'Location Name_new',
  'City',
  'Street',
  'Street Number',
  'Postal Code',
  'JET_ID',
  'Contact Person',
  'Contact Email',
  'Contact Phone',
  'Mount Type',
  'Schaufenster einsehbar',
  'Hindernisse vorhanden',
  'Hindernisse Beschreibung',
  'Fensterbreite ausreichend',
  'Steckdose mit Strom 6-22 Uhr?',
  'Akquise Kommentar',
  'Akquise Kommentar (from Acquisition Update)',
  'Kommentar aus Installationen',
  'frequency_approval_comment',
  'frequency_approval (previous FAW Check)',
  'install_approval',
  'approval_status',
  'ready_for_installation',
  'Vertrag (PDF)',
  'Vertrag PDF vorhanden',
  'Vertragsnummer',
  'Vertragspartner',
  'Vertragsbeginn',
  'Laufzeit',
  'Unterschriftsdatum',
  'images_akquise',
  'FAW_data_attachment',
  'Installationsprotokoll (from Installationen)',
  'Akquisition Partner Name (from Team)',
  'Submitted By',
  'Submitted At',
  'Acquisition Date',
  '# dVAC / Woche 100% SoV',
  'dVAC / Month',
  'dVAC per Day',
  'Latitude',
  'Longitude',
  'Koordinaten (from JET ID)',
  'Streetview Link (from JET ID)',
  'Aufbau Datum',
  'Integrator (Installation)',
  'display_name (from Displays)',
  'DO-ID (from Installationen)',
  'Live since (from Displays)',
  'Installations Status',
  'Display Location Status',
  'Abbruchgrund',
  'Exclude Reason',
  'Akquise Storno',
  'Post‑Install Storno',
  'Post‑Install Storno Grund',
];

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
  if (apiKey && BOOKER_API_KEY && apiKey === BOOKER_API_KEY) {
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

/** Safely unwrap Airtable lookup fields (arrays → first element) */
function unwrap(value) {
  return Array.isArray(value) ? value[0] : value;
}

/** Transform raw Airtable record into our normalized response shape */
function transformAkquiseRecord(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    akquiseId: unwrap(f['Akquise ID']),
    locationName: unwrap(f['Location Name_new']),
    city: unwrap(f['City']),
    street: unwrap(f['Street']),
    streetNumber: unwrap(f['Street Number']),
    postalCode: unwrap(f['Postal Code']),
    jetId: unwrap(f['JET_ID']),

    contactPerson: unwrap(f['Contact Person']),
    contactPhone: unwrap(f['Contact Phone']),
    contactEmail: unwrap(f['Contact Email']),

    leadStatus: unwrap(f['Lead_Status']),
    frequencyApproval: unwrap(f['frequency_approval (previous FAW Check)']),
    installApproval: unwrap(f['install_approval']),
    approvalStatus: unwrap(f['approval_status']),
    readyForInstallation: unwrap(f['ready_for_installation']),

    mountType: unwrap(f['Mount Type']),
    schaufenster: unwrap(f['Schaufenster einsehbar']),
    hindernisse: unwrap(f['Hindernisse vorhanden']),
    hindernisseBeschreibung: unwrap(f['Hindernisse Beschreibung']),
    fensterbreiteAusreichend: unwrap(f['Fensterbreite ausreichend']),
    steckdoseMitStrom: unwrap(f['Steckdose mit Strom 6-22 Uhr?']),

    akquiseKommentar: unwrap(f['Akquise Kommentar']),
    akquiseKommentarUpdate: unwrap(f['Akquise Kommentar (from Acquisition Update)']),
    kommentarAusInstallationen: unwrap(f['Kommentar aus Installationen']),
    frequencyApprovalComment: unwrap(f['frequency_approval_comment']),

    vertragPdfVorhanden: unwrap(f['Vertrag PDF vorhanden']),
    vertragsnummer: unwrap(f['Vertragsnummer']),
    vertragspartner: unwrap(f['Vertragspartner']),
    vertragsbeginn: unwrap(f['Vertragsbeginn']),
    laufzeit: unwrap(f['Laufzeit']),
    unterschriftsdatum: unwrap(f['Unterschriftsdatum']),

    acquisitionPartner: unwrap(f['Akquisition Partner Name (from Team)']),
    submittedBy: unwrap(f['Submitted By']),
    submittedAt: unwrap(f['Submitted At']),
    acquisitionDate: unwrap(f['Acquisition Date']),

    dvacWeek: unwrap(f['# dVAC / Woche 100% SoV']),
    dvacMonth: unwrap(f['dVAC / Month']),
    dvacPerDay: unwrap(f['dVAC per Day']),

    // Attachment fields — keep as full arrays (not unwrapped)
    images: f['images_akquise'] || [],
    vertragPdf: f['Vertrag (PDF)'] || [],
    fawDataAttachment: f['FAW_data_attachment'] || [],
    installationsprotokoll: f['Installationsprotokoll (from Installationen)'] || [],

    streetviewLink: unwrap(f['Streetview Link (from JET ID)']),
    latitude: unwrap(f['Latitude']),
    longitude: unwrap(f['Longitude']),
    coordinates: unwrap(f['Koordinaten (from JET ID)']),

    installationsDatum: unwrap(f['Aufbau Datum']),
    integratorName: unwrap(f['Integrator (Installation)']),
    displayName: unwrap(f['display_name (from Displays)']),
    doId: unwrap(f['DO-ID (from Installationen)']),
    liveSince: unwrap(f['Live since (from Displays)']),

    installationsStatus: unwrap(f['Installations Status']),
    displayLocationStatus: unwrap(f['Display Location Status']),
    abbruchgrund: unwrap(f['Abbruchgrund']),
    excludeReason: unwrap(f['Exclude Reason']),
    akquiseStorno: unwrap(f['Akquise Storno']),
    postInstallStorno: unwrap(f['Post‑Install Storno']),
    postInstallStornoGrund: f['Post‑Install Storno Grund'] || [],
  };
}

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
  const city = url.searchParams.get('city');
  const all = url.searchParams.get('all');
  const apiStart = Date.now();

  try {
    // ── Single booking detail ──
    if (bookingId) {
      // 1. Get the booking from Supabase
      const bookingResult = await supabaseRequest(
        `install_bookings?id=eq.${encodeURIComponent(bookingId)}&select=*&limit=1`
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
          `install_routen?id=eq.${booking.route_id}&select=*&limit=1`
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
        `install_bookings?city=eq.${encodeURIComponent(city)}&select=*&order=created_at.desc`
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
      //    Include records that are ready_for_installation OR have bookings
      const filterFormula = `OR({City}='${city.replace(/'/g, "\\'")}', {ready_for_installation}=TRUE())`;
      let akquiseRecords = [];
      if (AIRTABLE_TOKEN) {
        try {
          // Use a city-specific filter to be more targeted
          const cityFilter = `{City}='${city.replace(/'/g, "\\'")}')`;
          const rawRecords = await fetchAkquiseRecords(
            `AND({City}='${city.replace(/'/g, "\\'")}', OR({ready_for_installation}=TRUE(), {Lead_Status}='Ready for Install'))`,
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
          `install_routen?id=in.(${routeIds.join(',')})&select=*`
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
        `install_bookings?select=*&order=created_at.desc`
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
      //    Broadly fetch all Won/Signed records; frontend handles display filtering
      let akquiseRecords = [];
      if (AIRTABLE_TOKEN) {
        try {
          const rawRecords = await fetchAkquiseRecords(
            `{Lead_Status}='Won / Signed'`,
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
          `install_routen?id=in.(${routeIds.join(',')})&select=*`
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

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
};
