/**
 * Netlify Function: Install Monteur – Daily Route View
 *
 * Dual-auth endpoint: Supabase JWT (persistent login) OR HMAC-token (legacy links).
 * Returns the daily route for a team: all bookings with Akquise details.
 *
 * Endpoints:
 *   GET  /api/install-monteur?token=X&team=Y&date=Z   → Daily route (HMAC auth)
 *   GET  /api/install-monteur (with Bearer JWT header)  → Daily route (JWT auth, team from profile)
 *   POST /api/install-monteur/link                      → Generate a signed monteur link (auth required)
 */

import { logApiCall } from './shared/apiLogger.js';
import { checkRateLimit, getClientIP } from './shared/security.js';
import { AIRTABLE_BASE, TABLES, FETCH_FIELDS } from './shared/airtableFields.js';
import { transformAkquiseDetail } from './shared/airtableMappers.js';
import { calculateEndTime } from './shared/slotUtils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const MONTEUR_SECRET = process.env.MONTEUR_SECRET;
if (!MONTEUR_SECRET) console.error('[install-monteur] CRITICAL: MONTEUR_SECRET not configured!');

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

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
 * Generate HMAC-SHA256 token for monteur link authentication.
 * Token = first 16 hex chars of HMAC-SHA256(secret, "team|date")
 */
async function generateToken(team, date) {
  const crypto = await import('node:crypto');
  return crypto.createHmac('sha256', MONTEUR_SECRET)
    .update(`${team}|${date}`)
    .digest('hex')
    .substring(0, 16);
}

/** Validate HMAC token (constant-time comparison to prevent timing attacks) */
async function validateToken(token, team, date) {
  if (!MONTEUR_SECRET) return false;
  const expected = await generateToken(team, date);
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

/** Authenticate user via Supabase JWT (for link generation — any dashboard user) */
async function authenticateUser(request) {
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

/**
 * Authenticate monteur via Supabase JWT.
 * Returns { authenticated, team, userName } on success.
 * Looks up installer_team from app_users profile.
 */
async function authenticateMonteur(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false };
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    // Validate JWT with Supabase
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_KEY,
      },
    });
    if (!authRes.ok) return { authenticated: false };
    const authUser = await authRes.json();

    // Fetch monteur profile with team assignment
    const profileRes = await supabaseRequest(
      `app_users?auth_id=eq.${authUser.id}&select=id,name,installer_team,group_id,active&limit=1`
    );
    if (!profileRes.ok || !profileRes.data?.length) {
      return { authenticated: false, error: 'Kein Profil gefunden' };
    }

    const profile = profileRes.data[0];
    if (!profile.active) {
      return { authenticated: false, error: 'Account deaktiviert' };
    }
    if (!profile.installer_team) {
      return { authenticated: false, error: 'Kein Team zugewiesen. Bitte Administrator kontaktieren.' };
    }

    return {
      authenticated: true,
      team: profile.installer_team,
      userName: profile.name,
      userId: profile.id,
      groupId: profile.group_id,
    };
  } catch {
    return { authenticated: false };
  }
}

/** Build Airtable fields query param string */
function buildFieldsParams() {
  return FETCH_FIELDS.acquisitionDetail.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
}

/** Fetch a single Akquise record from Airtable by record ID */
async function fetchAkquiseRecord(recordId) {
  const fieldsParams = buildFieldsParams();
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.ACQUISITION}/${recordId}?${fieldsParams}`,
    { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-monteur:${clientIP}`, 30, 60_000);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)), ...PUBLIC_CORS } }
    );
  }

  const apiStart = Date.now();
  const url = new URL(request.url);
  const path = url.pathname;

  // ── POST /api/install-monteur/link → Generate signed link (auth required) ──
  if (request.method === 'POST' && path.endsWith('/link')) {
    const auth = await authenticateUser(request);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const { team, date } = body;
    if (!team || !date) {
      return new Response(JSON.stringify({ error: 'team and date are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const token = await generateToken(team, date);
    const baseUrl = url.origin || 'https://tools.dimension-outdoor.com';
    const monteurUrl = `${baseUrl}/monteur?token=${token}&team=${encodeURIComponent(team)}&date=${date}`;

    logApiCall({
      functionName: 'install-monteur',
      service: 'internal',
      method: 'POST',
      endpoint: 'link',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
    });

    return new Response(JSON.stringify({ url: monteurUrl, token }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  // ── GET /api/install-monteur → Daily route ──
  // Supports two auth methods:
  //   1. JWT (Bearer header) — persistent monteur login, team from profile, date = today
  //   2. HMAC (URL params) — legacy daily links: ?token=X&team=Y&date=Z
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  let team, date, authMethod = 'hmac';

  // Try JWT auth first (persistent monteur login)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const monteurAuth = await authenticateMonteur(request);
    if (monteurAuth.authenticated) {
      team = monteurAuth.team;
      // Use date from query param if provided, otherwise today
      date = url.searchParams.get('date') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
      authMethod = 'jwt';
    } else if (monteurAuth.error) {
      return new Response(JSON.stringify({ error: monteurAuth.error }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
    // If JWT fails silently (no specific error), fall through to HMAC
  }

  // Fallback: HMAC token auth (legacy links)
  if (!team) {
    const token = url.searchParams.get('token');
    team = url.searchParams.get('team');
    date = url.searchParams.get('date');

    if (!token || !team || !date) {
      return new Response(JSON.stringify({ error: 'Authentifizierung erforderlich. Bitte einloggen oder gültigen Link verwenden.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // Validate inputs
    if (token.length > 20 || team.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Invalid parameter format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // Validate HMAC token
    const isValid = await validateToken(token, team, date);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({ error: 'Invalid date format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  // ── Week mode: return booking counts per day for a 7-day range ──
  const mode = url.searchParams.get('mode');
  if (mode === 'week') {
    try {
      // Calculate Monday of the week containing `date`
      const d = new Date(date + 'T00:00:00');
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const startDate = monday.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
      const endDate = sunday.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

      // Fetch booking counts for the whole week (route-based + direct team assignment)
      const [routeResult, directResult, atResult] = await Promise.all([
        supabaseRequest(
          `install_routen?installer_team=eq.${encodeURIComponent(team)}&schedule_date=gte.${startDate}&schedule_date=lte.${endDate}&select=id,schedule_date,city`
        ),
        supabaseRequest(
          `install_bookings?installer_team=eq.${encodeURIComponent(team)}&booked_date=gte.${startDate}&booked_date=lte.${endDate}&status=neq.cancelled&select=id,booked_date`
        ),
        supabaseRequest(
          `installationstermine?installationsdatum_nur_datum=gte.${startDate}&installationsdatum_nur_datum=lte.${endDate}&select=id,installationsdatum_nur_datum,integrator,city,akquise_links`
        ),
      ]);

      const routes = routeResult.data || [];
      const directBookings = directResult.data || [];

      // Build route city lookup for the week
      const weekRouteCities = new Map(); // date → Set<city>
      for (const r of routes) {
        const d = r.schedule_date;
        if (!weekRouteCities.has(d)) weekRouteCities.set(d, new Set());
        if (r.city) weekRouteCities.get(d).add(r.city.toLowerCase().trim());
      }

      // Collect all booking akquise IDs to avoid double-counting
      const allBookingAkqIds = new Set();
      for (const b of directBookings) {
        if (b.akquise_airtable_id) allBookingAkqIds.add(b.akquise_airtable_id);
      }

      // Filter Airtable termine for this team (dynamic, not hardcoded)
      const weekTeamLower = team.toLowerCase().trim();
      const atTermine = (atResult.data || []).filter(t => {
        // Skip if already covered by install_bookings
        const akqLinks = Array.isArray(t.akquise_links) ? t.akquise_links : [];
        if (akqLinks.some(id => allBookingAkqIds.has(id))) return false;

        // Match by integrator
        const integrators = Array.isArray(t.integrator) ? t.integrator.join(' ').toLowerCase() : (t.integrator || '').toLowerCase();
        if (integrators.includes(weekTeamLower) || weekTeamLower.includes(integrators)) return true;
        // Fuzzy: extract core team name (e.g. "e-systems" from "e-systems Team 1")
        const coreTeam = weekTeamLower.replace(/\s*team\s*\d+$/i, '').trim();
        if (coreTeam && integrators.includes(coreTeam)) return true;

        // Match by city (if route exists for this date)
        const tDate = t.installationsdatum_nur_datum;
        const citiesForDate = weekRouteCities.get(tDate);
        if (citiesForDate) {
          const tCities = Array.isArray(t.city) ? t.city : (t.city ? [t.city] : []);
          if (tCities.some(c => citiesForDate.has((c || '').toLowerCase().trim()))) return true;
        }

        return false;
      });

      // Also fetch route-based bookings
      let routeBookings = [];
      if (routes.length > 0) {
        const rbResult = await supabaseRequest(
          `install_bookings?route_id=in.(${routes.map(r => r.id).join(',')})&booked_date=gte.${startDate}&booked_date=lte.${endDate}&status=neq.cancelled&select=id,booked_date`
        );
        routeBookings = rbResult.data || [];
      }

      // Merge and count per day
      const allIds = new Set();
      const dayCounts = {};
      for (let i = 0; i < 7; i++) {
        const dd = new Date(monday);
        dd.setDate(monday.getDate() + i);
        dayCounts[dd.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })] = 0;
      }

      for (const b of [...routeBookings, ...directBookings]) {
        if (allIds.has(b.id)) continue;
        allIds.add(b.id);
        const d = b.booked_date;
        if (d && dayCounts[d] !== undefined) dayCounts[d]++;
      }

      // Add Airtable termine
      for (const t of atTermine) {
        const d = t.installationsdatum_nur_datum;
        if (d && dayCounts[d] !== undefined) dayCounts[d]++;
      }

      const days = Object.entries(dayCounts).map(([d, count]) => ({ date: d, count }));

      return new Response(JSON.stringify({ team, weekStart: startDate, weekEnd: endDate, days }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', ...PUBLIC_CORS },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Week mode failed: ' + e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
  }

  try {
    // 1. Get route for this team + date
    const routeResult = await supabaseRequest(
      `install_routen?installer_team=eq.${encodeURIComponent(team)}&schedule_date=eq.${date}&select=id,city,schedule_date,installer_team,max_capacity,status,time_slots,notes&limit=500`
    );

    const routes = routeResult.data || [];
    const routeCities = routes.map(r => (r.city || '').toLowerCase().trim()).filter(Boolean);

    // 2. Get all bookings for this team + date (via route_id)
    let bookings = [];
    if (routes.length > 0) {
      const bookingsResult = await supabaseRequest(
        `install_bookings?route_id=in.(${routes.map(r => r.id).join(',')})&booked_date=eq.${date}&select=id,booking_token,akquise_airtable_id,location_name,city,street,street_number,postal_code,contact_name,contact_phone,contact_email,jet_id,booked_date,booked_time,booked_end_time,booked_window,route_id,installer_team,status,notes&order=booked_time.asc&limit=1000`
      );
      bookings = bookingsResult.data || [];
    }

    // Also fetch bookings by team + date directly (covers bookings not linked to a route)
    const directBookingsResult = await supabaseRequest(
      `install_bookings?installer_team=eq.${encodeURIComponent(team)}&booked_date=eq.${date}&select=id,booking_token,akquise_airtable_id,location_name,city,street,street_number,postal_code,contact_name,contact_phone,contact_email,jet_id,booked_date,booked_time,booked_end_time,booked_window,route_id,installer_team,status,notes&order=booked_time.asc&limit=1000`
    );
    const directBookings = directBookingsResult.data || [];
    // Merge without duplicates
    const bookingIds = new Set(bookings.map(b => b.id));
    for (const db of directBookings) {
      if (!bookingIds.has(db.id)) {
        bookings.push(db);
        bookingIds.add(db.id);
      }
    }

    // 3. Fetch Airtable Installationstermine for this date (from Supabase cache)
    //    These are Airtable-sourced appointments that may not have install_bookings records.
    const termineResult = await supabaseRequest(
      `installationstermine?installationsdatum_nur_datum=eq.${date}&select=id,airtable_id,installationsdatum_nur_datum,installationszeit,terminstatus,status_installation,akquise_links,integrator,city,location_name,street,street_number,postal_code,contact_email,contact_phone,contact_person,jet_id_links,grund_notiz&limit=500`
    );
    const allTermine = termineResult.data || [];

    // Filter termine for this team's cities OR matching integrator
    const teamLower = team.toLowerCase().trim();
    const coreTeamName = teamLower.replace(/\s*team\s*\d+$/i, '').trim(); // "e-systems team 1" → "e-systems"
    const bookingAkqIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));

    // If no routes exist for today, fetch ALL routes for this team to get known cities
    let teamCities = [...routeCities];
    if (teamCities.length === 0) {
      try {
        const allRoutesResult = await supabaseRequest(
          `install_routen?installer_team=eq.${encodeURIComponent(team)}&select=city&limit=200`
        );
        const allTeamCities = new Set();
        for (const r of (allRoutesResult.data || [])) {
          if (r.city) allTeamCities.add(r.city.toLowerCase().trim());
        }
        teamCities = [...allTeamCities];
      } catch (e) {
        console.warn('[install-monteur] Team cities fallback failed:', e.message);
      }
    }

    const atTermine = [];
    for (const t of allTermine) {
      // Skip if already covered by an install_booking (same akquise link)
      const akqLinks = t.akquise_links || [];
      if (akqLinks.some(id => bookingAkqIds.has(id))) {
        // But enrich the existing booking with Airtable data
        const matchingAkqId = akqLinks.find(id => bookingAkqIds.has(id));
        const existingBooking = bookings.find(b => b.akquise_airtable_id === matchingAkqId);
        if (existingBooking) {
          // Transfer status_installation from Airtable Installationen-DB lookup
          // This is the real installation outcome (e.g. "Installiert", "Abgebrochen")
          const statusInst = Array.isArray(t.status_installation) ? t.status_installation[0] : (t.status_installation || '');
          if (statusInst) existingBooking._statusInstallation = statusInst;
          if (t.terminstatus) existingBooking._terminStatus = t.terminstatus;
          // Do NOT upgrade booking.status from terminstatus — the _statusInstallation
          // field from the Installationen DB is the source of truth for install outcome.
        }
        continue;
      }

      // Check if termin belongs to this team:
      // 1. Integrator field matches team name (exact or core name)
      const integrators = Array.isArray(t.integrator) ? t.integrator : (t.integrator ? [t.integrator] : []);
      const integratorMatch = integrators.some(i => {
        const iLower = (i || '').toLowerCase();
        return iLower.includes(teamLower) || teamLower.includes(iLower) ||
               (coreTeamName && (iLower.includes(coreTeamName) || coreTeamName.includes(iLower)));
      });

      // 2. City matches route cities (today's routes OR team's known cities)
      const tCities = Array.isArray(t.city) ? t.city : (t.city ? [t.city] : []);
      const cityMatch = teamCities.length > 0 && tCities.some(c => teamCities.includes((c || '').toLowerCase().trim()));

      if (!integratorMatch && !cityMatch) continue;

      // Convert Airtable termin to booking-like format
      const tCity = tCities[0] || '';
      const tName = Array.isArray(t.location_name) ? t.location_name[0] : (t.location_name || '');
      const tStreet = Array.isArray(t.street) ? t.street[0] : (t.street || '');
      const tStreetNr = Array.isArray(t.street_number) ? t.street_number[0] : (t.street_number || '');
      const tPostal = Array.isArray(t.postal_code) ? t.postal_code[0] : (t.postal_code || '');
      const tEmail = Array.isArray(t.contact_email) ? t.contact_email[0] : (t.contact_email || '');
      const tPhone = Array.isArray(t.contact_phone) ? t.contact_phone[0] : (t.contact_phone || '');
      const tPerson = Array.isArray(t.contact_person) ? t.contact_person[0] : (t.contact_person || '');
      const rawJetId = Array.isArray(t.jet_id_links) ? t.jet_id_links[0] : (t.jet_id_links || '');
      const tJetId = rawJetId && !rawJetId.startsWith('rec') ? rawJetId : '';

      // Parse time
      let zeit = '';
      const rawZeit = t.installationszeit || '';
      if (rawZeit) {
        const isoMatch = rawZeit.match(/T(\d{2}:\d{2})/);
        if (isoMatch) zeit = isoMatch[1];
        else {
          const timeMatch = rawZeit.match(/^(\d{1,2}:\d{2})/);
          if (timeMatch) zeit = timeMatch[1];
        }
      }
      if (!zeit || zeit === '00:00') zeit = '08:00';

      // Map terminstatus to booking status
      const tsLower = (t.terminstatus || '').toLowerCase();
      let mappedStatus = 'booked';
      if (tsLower === 'durchgeführt' || tsLower === 'durchgefuehrt') mappedStatus = 'completed';
      else if (tsLower === 'abgesagt') mappedStatus = 'cancelled';
      else if (tsLower === 'bestätigt' || tsLower === 'bestaetigt' || tsLower === 'confirmed') mappedStatus = 'confirmed';
      else if (tsLower === 'no-show' || tsLower === 'no show') mappedStatus = 'no_show';
      else if (tsLower === 'verschoben') mappedStatus = 'pending';

      const statusInst = Array.isArray(t.status_installation) ? t.status_installation[0] : (t.status_installation || '');

      atTermine.push({
        id: `at-${t.id}`,
        location_name: tName || 'Airtable-Termin',
        city: tCity,
        street: tStreet,
        street_number: tStreetNr,
        postal_code: tPostal,
        contact_name: tPerson,
        contact_phone: tPhone,
        contact_email: tEmail,
        jet_id: tJetId,
        booked_time: zeit,
        booked_end_time: calculateEndTime(zeit),
        status: mappedStatus,
        notes: t.grund_notiz || '',
        akquise_airtable_id: akqLinks[0] || null,
        _isAirtable: true,
        _terminStatus: t.terminstatus || '',
        _statusInstallation: statusInst,
      });
    }

    // Merge: install_bookings + Airtable-only termine
    const allBookings = [...bookings, ...atTermine];
    // Sort by time
    allBookings.sort((a, b) => (a.booked_time || '99:99').localeCompare(b.booked_time || '99:99'));

    // 4. Enrich with Akquise details + Installationen status from Supabase
    const akquiseIds = allBookings
      .map(b => b.akquise_airtable_id)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    // 4a. Fetch Akquise records from Supabase
    let akquiseMap = new Map();
    if (akquiseIds.length > 0) {
      try {
        const akquiseResult = await supabaseRequest(
          `acquisition?airtable_id=in.(${akquiseIds.map(id => `"${id}"`).join(',')})&select=airtable_id,images,vertrag_pdf,akquise_kommentar,kommentar_installationen,frequency_approval_comment,mount_type,schaufenster,hindernisse,hindernisse_beschreibung,fensterbreite,steckdose,latitude,longitude,street,street_number,postal_code,contact_person,contact_phone,contact_email,jet_id&limit=1000`
        );
        for (const row of (akquiseResult.data || [])) {
          akquiseMap.set(row.airtable_id, row);
        }
      } catch (e) {
        console.error('[install-monteur] Akquise fetch failed:', e.message);
      }
    }

    // 4b. Fetch Installationen records from Supabase (for real-time install status)
    //     Match via akquise_links (JSONB array) or jet_id
    let installByAkquise = new Map();
    let installByJetId = new Map();
    try {
      let installationen = [];

      // akquise_links is JSONB, so we can't use PostgREST ov. operator.
      // Instead, query one-by-one for each akquise ID using cs. (contains) operator.
      // Or better: fetch all installationen that match any of the akquise IDs via individual cs queries.
      // Most efficient: use RPC or fetch relevant installationen by akquise_links containing any of our IDs.
      // PostgREST JSONB containment: akquise_links=cs.["recXXX"] checks if array contains the value
      for (const akqId of akquiseIds) {
        try {
          const result = await supabaseRequest(
            `installationen?akquise_links=cs.["${akqId}"]&select=id,status,akquise_links,jet_id`
          );
          for (const inst of (result.data || [])) {
            if (!installationen.some(i => i.id === inst.id)) {
              installationen.push(inst);
            }
          }
        } catch { /* skip individual failures */ }
      }

      // Also try matching by jet_id for bookings that have a numeric jet_id
      const jetIds = allBookings
        .map(b => b.jet_id || '')
        .filter(j => j && !j.startsWith('rec'))
        .filter((v, i, a) => a.indexOf(v) === i);
      if (jetIds.length > 0) {
        const jetInstResult = await supabaseRequest(
          `installationen?jet_id=in.(${jetIds.map(j => `"${j}"`).join(',')})&select=id,status,akquise_links,jet_id`
        );
        for (const inst of (jetInstResult.data || [])) {
          if (!installationen.some(i => i.id === inst.id)) {
            installationen.push(inst);
          }
        }
      }

      // Build lookup maps
      for (const inst of installationen) {
        if (inst.akquise_links?.length) {
          for (const link of inst.akquise_links) {
            if (link && !installByAkquise.has(link)) installByAkquise.set(link, inst);
          }
        }
        if (inst.jet_id && !inst.jet_id.startsWith('rec')) {
          if (!installByJetId.has(inst.jet_id)) installByJetId.set(inst.jet_id, inst);
        }
      }
      console.log(`[install-monteur] Installationen lookup: ${installByAkquise.size} by akquise, ${installByJetId.size} by jetId (from ${installationen.length} records)`);
    } catch (e) {
      console.error('[install-monteur] Installationen fetch failed:', e.message);
    }

    // ── Resolve attachment URLs: attachment_cache (permanent) → Airtable API (fresh fallback) ──
    // Supabase acquisition.images stores Airtable URLs that expire after 2h.
    // attachment_cache has permanent Supabase Storage URLs but may not cover all records.
    // For uncached records, we fetch fresh URLs directly from Airtable API.
    const attachmentUrlMap = new Map(); // recordId|field → { filename → url }
    try {
      if (akquiseIds.length > 0) {
        // Step 1: Check attachment_cache for permanent URLs
        const cacheResult = await supabaseRequest(
          `attachment_cache?airtable_record_id=in.(${akquiseIds.map(id => `"${id}"`).join(',')})&airtable_field=in.("images_akquise","Vertrag (PDF)")&select=airtable_record_id,airtable_field,original_filename,public_url`
        );
        const cachedCount = cacheResult.data?.length || 0;
        for (const row of (cacheResult.data || [])) {
          const key = `${row.airtable_record_id}|${row.airtable_field}`;
          if (!attachmentUrlMap.has(key)) attachmentUrlMap.set(key, {});
          attachmentUrlMap.get(key)[row.original_filename] = row.public_url;
        }

        // Step 2: Identify records that have images/PDFs in Supabase but NO cache entries
        const uncachedIds = akquiseIds.filter(id => {
          const akq = akquiseMap.get(id);
          if (!akq) return false;
          const hasImages = Array.isArray(akq.images) && akq.images.length > 0;
          const hasPdfs = Array.isArray(akq.vertrag_pdf) && akq.vertrag_pdf.length > 0;
          if (!hasImages && !hasPdfs) return false;
          // Check if ANY image/pdf is missing from cache
          const imgCache = attachmentUrlMap.get(`${id}|images_akquise`);
          const pdfCache = attachmentUrlMap.get(`${id}|Vertrag (PDF)`);
          const allImagesCached = !hasImages || (imgCache && akq.images.every(img => imgCache[img.filename]));
          const allPdfsCached = !hasPdfs || (pdfCache && akq.vertrag_pdf.every(pdf => pdfCache[pdf.filename]));
          return !allImagesCached || !allPdfsCached;
        });

        // Step 3: Fetch fresh attachment URLs from Airtable for uncached records
        if (uncachedIds.length > 0) {
          console.log(`[install-monteur] Fetching fresh Airtable URLs for ${uncachedIds.length} uncached records`);
          const BATCH_SIZE = 10; // Airtable filterByFormula limit
          for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
            const batch = uncachedIds.slice(i, i + BATCH_SIZE);
            const formula = batch.length === 1
              ? `RECORD_ID()='${batch[0]}'`
              : `OR(${batch.map(id => `RECORD_ID()='${id}'`).join(',')})`;
            try {
              const atUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.ACQUISITION}?filterByFormula=${encodeURIComponent(formula)}&fields[]=${encodeURIComponent('images_akquise')}&fields[]=${encodeURIComponent('Vertrag (PDF)')}`;
              const atRes = await fetch(atUrl, {
                headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` },
              });
              if (atRes.ok) {
                const atData = await atRes.json();
                for (const rec of (atData.records || [])) {
                  const f = rec.fields || {};
                  // Fresh image URLs
                  const freshImages = f['images_akquise'] || [];
                  if (freshImages.length > 0) {
                    const key = `${rec.id}|images_akquise`;
                    if (!attachmentUrlMap.has(key)) attachmentUrlMap.set(key, {});
                    const existing = attachmentUrlMap.get(key);
                    for (const att of freshImages) {
                      if (att.filename && att.url && !existing[att.filename]) {
                        existing[att.filename] = att.url;
                      }
                    }
                  }
                  // Fresh PDF URLs
                  const freshPdfs = f['Vertrag (PDF)'] || [];
                  if (freshPdfs.length > 0) {
                    const key = `${rec.id}|Vertrag (PDF)`;
                    if (!attachmentUrlMap.has(key)) attachmentUrlMap.set(key, {});
                    const existing = attachmentUrlMap.get(key);
                    for (const att of freshPdfs) {
                      if (att.filename && att.url && !existing[att.filename]) {
                        existing[att.filename] = att.url;
                      }
                    }
                  }
                }
                logApiCall({
                  functionName: 'install-monteur', service: 'airtable', method: 'GET',
                  endpoint: `attachment-fallback batch ${Math.floor(i / BATCH_SIZE) + 1}`,
                  durationMs: 0, statusCode: 200, success: true, recordsCount: batch.length,
                });
              }
            } catch (atErr) {
              console.warn(`[install-monteur] Airtable attachment fallback failed for batch:`, atErr.message);
            }
          }
        }

        console.log(`[install-monteur] Attachment resolution: ${cachedCount} from cache, ${uncachedIds.length} from Airtable API`);
      }
    } catch (e) {
      console.warn('[install-monteur] Attachment resolution failed (non-fatal):', e.message);
    }

    const enrichedBookings = allBookings.map(booking => {
      const akq = booking.akquise_airtable_id ? akquiseMap.get(booking.akquise_airtable_id) : null;

      // Resolve _statusInstallation: first from termin enrichment, then from installationen table
      let statusInstallation = booking._statusInstallation || '';
      if (!statusInstallation) {
        const matchedInstall = (booking.akquise_airtable_id && installByAkquise.get(booking.akquise_airtable_id))
          || (booking.jet_id && !booking.jet_id.startsWith('rec') && installByJetId.get(booking.jet_id))
          || null;
        if (matchedInstall?.status) {
          statusInstallation = matchedInstall.status;
        }
      }

      // Resolve image/PDF URLs: prefer attachment_cache (permanent), then Airtable API (fresh)
      const resolveImageUrl = (img) => {
        if (!img) return '';
        const cachedUrls = booking.akquise_airtable_id
          ? attachmentUrlMap.get(`${booking.akquise_airtable_id}|images_akquise`) : null;
        return cachedUrls?.[img.filename] || '';
      };
      const resolvePdfUrl = (pdf) => {
        if (!pdf) return '';
        const cachedUrls = booking.akquise_airtable_id
          ? attachmentUrlMap.get(`${booking.akquise_airtable_id}|Vertrag (PDF)`) : null;
        return cachedUrls?.[pdf.filename] || '';
      };

      return {
        id: booking.id,
        akquiseAirtableId: booking.akquise_airtable_id || null,
        locationName: booking.location_name,
        city: booking.city,
        street: booking.street || akq?.street || '',
        streetNumber: booking.street_number || akq?.street_number || '',
        postalCode: booking.postal_code || akq?.postal_code || '',
        contactName: booking.contact_name || akq?.contact_person || '',
        contactPhone: booking.contact_phone || akq?.contact_phone || '',
        contactEmail: booking.contact_email || akq?.contact_email || '',
        jetId: booking.jet_id || akq?.jet_id || '',
        bookedTime: booking.booked_time,
        bookedEndTime: booking.booked_end_time || (booking.booked_time ? calculateEndTime(booking.booked_time) : ''),
        bookedWindow: booking.booked_window,
        status: booking.status,
        notes: booking.notes,
        _statusInstallation: statusInstallation,
        _terminStatus: booking._terminStatus || '',
        _isAirtable: booking._isAirtable || false,
        akquise: akq ? {
          images: (akq.images || []).map(img => ({
            url: resolveImageUrl(img),
            filename: img.filename || '',
          })).filter(img => img.url), // Only include images with valid URLs
          vertragPdf: (akq.vertrag_pdf || []).map(pdf => ({
            url: resolvePdfUrl(pdf),
            filename: pdf.filename || '',
          })).filter(pdf => pdf.url), // Only include PDFs with valid URLs
          akquiseKommentar: akq.akquise_kommentar || '',
          kommentarAusInstallationen: akq.kommentar_installationen || '',
          frequencyApprovalComment: akq.frequency_approval_comment || '',
          mountType: akq.mount_type || '',
          schaufenster: akq.schaufenster || '',
          hindernisse: akq.hindernisse || '',
          hindernisseBeschreibung: akq.hindernisse_beschreibung || '',
          fensterbreiteAusreichend: akq.fensterbreite || '',
          steckdoseMitStrom: akq.steckdose || '',
          streetviewLink: '',
          latitude: akq.latitude || null,
          longitude: akq.longitude || null,
        } : null,
      };
    });

    logApiCall({
      functionName: 'install-monteur',
      service: 'supabase+airtable',
      method: 'GET',
      endpoint: `route/${team}/${date}`,
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
      recordsCount: enrichedBookings.length,
    });

    return new Response(JSON.stringify({
      team,
      date,
      authMethod,
      routeCount: routes.length,
      bookingCount: enrichedBookings.length,
      routes: routes.map(r => ({
        id: r.id,
        city: r.city,
        maxCapacity: r.max_capacity,
        status: r.status,
      })),
      bookings: enrichedBookings,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...PUBLIC_CORS,
      },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-monteur',
      service: 'supabase+airtable',
      method: 'GET',
      endpoint: `route/${team}/${date}`,
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    console.error('[install-monteur] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Routendaten konnten nicht geladen werden' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }
};
