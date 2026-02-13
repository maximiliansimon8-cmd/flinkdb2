/**
 * Netlify Function: Install Booker – Send Invite
 *
 * Called by Make.com when a location becomes ready_for_installation.
 * 1. Checks if the city has available installation routes
 * 2. Generates a unique booking token
 * 3. Creates a pending booking in Supabase
 * 4. Sends WhatsApp message via SuperChat with booking link
 * 5. Updates Airtable Akquise record with Booking Status
 *
 * Auth: API-Key header (x-api-key)
 */

import { corsHeaders } from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BOOKER_API_KEY = process.env.BOOKER_API_KEY;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const AKQUISE_TABLE = 'tblqFMBAeKQ1NbSI8';
const BOOKING_BASE_URL = 'https://jet-dashboard-v2.netlify.app/book';

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

/** Format date range for WhatsApp message */
function formatDateRange(routes) {
  if (!routes.length) return '';
  const dates = routes.map(r => new Date(r.schedule_date));
  const fmt = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  if (dates.length === 1) return fmt(dates[0]);
  const sorted = dates.sort((a, b) => a - b);
  return `${fmt(sorted[0])} - ${fmt(sorted[sorted.length - 1])}`;
}

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Auth: API key only
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || !BOOKER_API_KEY || apiKey !== BOOKER_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiStart = Date.now();

  try {
    const body = await request.json();
    const { akquiseAirtableId, contactPhone, contactName, locationName, city, jetId } = body;

    if (!akquiseAirtableId || !contactPhone || !city) {
      return new Response(JSON.stringify({ error: 'akquiseAirtableId, contactPhone, and city are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Check if there are available routes in this city
    const today = new Date().toISOString().split('T')[0];
    const routesResult = await supabaseRequest(
      `install_routen?city=eq.${encodeURIComponent(city)}&schedule_date=gte.${today}&status=eq.open&order=schedule_date.asc`
    );

    if (!routesResult.ok || !routesResult.data?.length) {
      logApiCall({
        functionName: 'install-booker-invite',
        service: 'supabase',
        method: 'GET',
        endpoint: 'install_routen',
        durationMs: Date.now() - apiStart,
        statusCode: 404,
        success: false,
        error: `No available routes in ${city}`,
      });
      return new Response(JSON.stringify({
        error: 'no_routes_available',
        message: `Keine verfügbaren Installationstermine in ${city}`,
        city,
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const availableRoutes = routesResult.data;

    // 2. Generate booking token
    const bookingToken = crypto.randomUUID();

    // 3. Create pending booking in Supabase
    const bookingResult = await supabaseRequest('install_bookings', {
      method: 'POST',
      body: JSON.stringify({
        booking_token: bookingToken,
        akquise_airtable_id: akquiseAirtableId,
        location_name: locationName || '',
        city,
        contact_name: contactName || '',
        contact_phone: contactPhone,
        jet_id: jetId || '',
        status: 'pending',
        booking_source: 'whatsapp_agent',
        whatsapp_sent_at: new Date().toISOString(),
      }),
    });

    if (!bookingResult.ok) {
      throw new Error(`Failed to create booking: ${JSON.stringify(bookingResult.data)}`);
    }

    // 4. Send WhatsApp via SuperChat
    const bookingUrl = `${BOOKING_BASE_URL}/${bookingToken}`;
    const dateRange = formatDateRange(availableRoutes);

    // Build message text (template or plain text depending on SuperChat config)
    const messageText = [
      `Hallo ${contactName || 'Standortinhaber/in'},`,
      '',
      `wir planen demnächst Installationen in ${city} und würden gerne einen Termin für Ihren Standort${locationName ? ` ${locationName}` : ''} vereinbaren.`,
      '',
      `Verfügbare Termine: ${dateRange}`,
      '',
      `Buchen Sie hier Ihren Wunschtermin:`,
      bookingUrl,
      '',
      `Bei Fragen antworten Sie einfach auf diese Nachricht.`,
      '',
      `Ihr JET Germany Team`,
    ].join('\n');

    let whatsappResult = { ok: false };
    if (SUPERCHAT_API_KEY) {
      const scRes = await fetch('https://api.superchat.com/v1.0/messages', {
        method: 'POST',
        headers: {
          'X-API-KEY': SUPERCHAT_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          contactHandle: contactPhone,
          channelType: 'whats_app',
          body: messageText,
        }),
      });
      whatsappResult = { ok: scRes.ok, status: scRes.status, data: await scRes.json().catch(() => null) };
    }

    // 5. Update Airtable Akquise record
    if (AIRTABLE_TOKEN) {
      try {
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${akquiseAirtableId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              'Booking Status': 'invited',
              'Booking Token': bookingToken,
              'Booking Link Sent At': new Date().toISOString(),
            },
          }),
        });
      } catch (e) {
        console.error('[install-booker-invite] Airtable update failed:', e.message);
      }
    }

    logApiCall({
      functionName: 'install-booker-invite',
      service: 'superchat',
      method: 'POST',
      endpoint: 'messages',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
    });

    return new Response(JSON.stringify({
      success: true,
      bookingToken,
      bookingUrl,
      city,
      availableRoutes: availableRoutes.length,
      dateRange,
      whatsappSent: whatsappResult.ok,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-booker-invite',
      service: 'mixed',
      method: 'POST',
      endpoint: 'invite',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      error: err.message,
    });

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
