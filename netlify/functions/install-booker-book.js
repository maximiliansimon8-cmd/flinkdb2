/**
 * Netlify Function: Install Booker – Book Appointment
 *
 * Public endpoint (token-based auth). Called by the booking page.
 * Books a specific date + time slot for an installation.
 *
 * POST /api/install-booker/book
 * Body: { token, date, time, notes? }
 */

import { logApiCall } from './shared/apiLogger.js';
import {
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString,
} from './shared/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const AKQUISE_TABLE = 'tblqFMBAeKQ1NbSI8';
const INSTALLATIONEN_TABLE = 'tblKznpAOAMvEfX8u';

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

/** Calculate end time (1.5 hours after start) */
function calculateEndTime(startTime) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = minutes + 90;
  const endHours = hours + Math.floor(endMinutes / 60);
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  // Rate limiting — public endpoint, stricter limit
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-book:${clientIP}`, 10, 60_000);
  if (!limit.allowed) {
    const retryAfterSec = Math.ceil(limit.retryAfterMs / 1000);
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec), ...PUBLIC_CORS } }
    );
  }

  const apiStart = Date.now();

  try {
    const body = await request.json();
    const { token, date, time, notes: rawNotes } = body;
    const notes = rawNotes ? sanitizeString(rawNotes, 500) : null;

    if (!token || !date || !time) {
      return new Response(JSON.stringify({ error: 'token, date, and time are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // Validate input formats
    if (typeof token !== 'string' || token.length > 100) {
      return new Response(JSON.stringify({ error: 'Ungültiges Token-Format' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Ungültiges Datumsformat (YYYY-MM-DD erwartet)' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return new Response(JSON.stringify({ error: 'Ungültiges Zeitformat (HH:MM erwartet)' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // 1. Validate token exists and is still pending
    const bookingResult = await supabaseRequest(
      `install_bookings?booking_token=eq.${encodeURIComponent(token)}&select=*&limit=1`
    );

    if (!bookingResult.ok || !bookingResult.data?.length) {
      return new Response(JSON.stringify({ error: 'invalid_token', message: 'Buchungslink nicht gefunden.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const booking = bookingResult.data[0];

    if (booking.status !== 'pending') {
      return new Response(JSON.stringify({
        error: 'already_booked',
        message: 'Dieser Termin wurde bereits gebucht.',
        bookedDate: booking.booked_date,
        bookedTime: booking.booked_time,
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // 2. Verify slot is still available
    const routeResult = await supabaseRequest(
      `install_routen?city=eq.${encodeURIComponent(booking.city)}&schedule_date=eq.${date}&status=eq.open&select=*&limit=1`
    );

    if (!routeResult.ok || !routeResult.data?.length) {
      return new Response(JSON.stringify({ error: 'slot_unavailable', message: 'Dieser Termin ist leider nicht mehr verfügbar.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const route = routeResult.data[0];

    // Check capacity
    const existingBookings = await supabaseRequest(
      `install_bookings?city=eq.${encodeURIComponent(booking.city)}&booked_date=eq.${date}&booked_time=eq.${encodeURIComponent(time)}&status=in.(booked,confirmed)&select=id`
    );

    if (existingBookings.data?.length > 0) {
      return new Response(JSON.stringify({ error: 'slot_taken', message: 'Diese Uhrzeit ist leider bereits vergeben. Bitte wählen Sie eine andere Zeit.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // Check total capacity for the day
    const dayBookings = await supabaseRequest(
      `install_bookings?city=eq.${encodeURIComponent(booking.city)}&booked_date=eq.${date}&status=in.(booked,confirmed)&select=id`
    );

    if ((dayBookings.data?.length || 0) >= route.max_capacity) {
      return new Response(JSON.stringify({ error: 'day_full', message: 'Dieser Tag ist leider ausgebucht. Bitte wählen Sie einen anderen Tag.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const endTime = calculateEndTime(time);

    // 3. Update booking in Supabase
    const updateResult = await supabaseRequest(
      `install_bookings?id=eq.${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          booked_date: date,
          booked_time: time,
          booked_end_time: endTime,
          route_id: route.id,
          status: 'booked',
          booked_at: new Date().toISOString(),
          notes: notes || null,
        }),
      }
    );

    if (!updateResult.ok) {
      throw new Error('Failed to update booking');
    }

    // 4. Create Airtable record in existing Installationen table
    let terminAirtableId = null;
    if (AIRTABLE_TOKEN) {
      try {
        const installFields = {
          'Installationsstart': `${date}T${time}:00.000Z`,
          'Status Installation': 'Termin gebucht',
          'Aufbau Datum': date,
          'Installationsart': 'Wandmontage',
          'Allgemeine Bemerkungen': [
            `Selbst-Buchung via Install Date Booker`,
            `Zeitfenster: ${time} – ${endTime} Uhr`,
            route.installer_team ? `Team: ${route.installer_team}` : '',
            notes ? `Anmerkung Standort: ${notes}` : '',
          ].filter(Boolean).join('\n'),
        };

        // Link to Akquise record if we have one
        if (booking.akquise_airtable_id) {
          installFields['Akquise'] = [booking.akquise_airtable_id];
        }

        const terminRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${INSTALLATIONEN_TABLE}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ records: [{ fields: installFields }] }),
        });
        const terminData = await terminRes.json();
        terminAirtableId = terminData.records?.[0]?.id;

        // Store the Airtable ID back in Supabase
        if (terminAirtableId) {
          await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ termin_airtable_id: terminAirtableId }),
          });
        }
      } catch (e) {
        console.error('[install-booker-book] Airtable Installationen create failed:', e.message);
      }
    }

    // 5. Update Airtable Akquise record
    if (AIRTABLE_TOKEN && booking.akquise_airtable_id) {
      try {
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${booking.akquise_airtable_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              'Booking Status': 'booked',
              'Booking Date': date,
              'Booking Time': time,
            },
          }),
        });
      } catch (e) {
        console.error('[install-booker-book] Airtable Akquise update failed:', e.message);
      }
    }

    // 6. Send WhatsApp confirmation via SuperChat
    if (SUPERCHAT_API_KEY && booking.contact_phone) {
      try {
        const formattedDate = new Date(date).toLocaleDateString('de-DE', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
        const confirmationText = [
          `Vielen Dank${booking.contact_name ? `, ${booking.contact_name}` : ''}!`,
          '',
          `Ihr Installationstermin wurde bestätigt:`,
          `Datum: ${formattedDate}`,
          `Uhrzeit: ${time} - ${endTime} Uhr`,
          `Standort: ${booking.location_name || booking.city}`,
          '',
          `Unser Team wird sich am Installationstag bei Ihnen melden.`,
          '',
          `Bei Fragen oder Änderungswünschen antworten Sie einfach auf diese Nachricht.`,
          '',
          `Ihr JET Germany Team`,
        ].join('\n');

        await fetch('https://api.superchat.com/v1.0/messages', {
          method: 'POST',
          headers: {
            'X-API-KEY': SUPERCHAT_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            contactHandle: booking.contact_phone,
            channelType: 'whats_app',
            body: confirmationText,
          }),
        });
      } catch (e) {
        console.error('[install-booker-book] WhatsApp confirmation failed:', e.message);
      }
    }

    logApiCall({
      functionName: 'install-booker-book',
      service: 'mixed',
      method: 'POST',
      endpoint: 'book',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
    });

    return new Response(JSON.stringify({
      success: true,
      booking: {
        date,
        time,
        endTime,
        locationName: booking.location_name,
        city: booking.city,
        contactName: booking.contact_name,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-booker-book',
      service: 'mixed',
      method: 'POST',
      endpoint: 'book',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      error: err.message,
    });

    return new Response(JSON.stringify({ error: 'Buchung fehlgeschlagen. Bitte versuchen Sie es erneut.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }
};
