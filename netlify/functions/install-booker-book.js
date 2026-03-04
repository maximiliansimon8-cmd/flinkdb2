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
  checkRateLimit, getClientIP,
  sanitizeString, normalizePhone,
} from './shared/security.js';
import { slotsOverlap, calculateEndTime, normalizeCity, TIME_WINDOWS, TIME_WINDOW_KEYS, assignSlotInWindow } from './shared/slotUtils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const AKQUISE_TABLE = 'tblqFMBAeKQ1NbSI8';
const INSTALLATIONSTERMINE_TABLE = 'tblZrFRRg3iKxlXFJ';

const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';

/** SuperChat contact attribute IDs */
const SC_BOOKING_LINK_ATTR_ID = 'ca_cb868yUGScrsohM7y2kwv';
const SC_BOOKING_DATE_ATTR_ID = 'ca_RU9o1ZWjIByskrY9mM9aK';

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

/** Fire-and-forget write to booking_activity_log (non-fatal) */
async function writeActivityLog(entry) {
  try {
    await supabaseRequest('booking_activity_log', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        user_id:             entry.user_id             || null,
        user_name:           entry.user_name            || 'System',
        action:              entry.action,
        booking_id:          entry.booking_id           || null,
        akquise_airtable_id: entry.akquise_airtable_id || null,
        location_name:       entry.location_name        || null,
        city:                entry.city                 || null,
        detail:              entry.detail               || {},
        source:              entry.source               || 'portal',
      }),
    });
  } catch (e) {
    console.warn('[writeActivityLog] Failed (non-fatal):', e.message);
  }
}

// calculateEndTime imported from shared/slotUtils.js

/** Check SuperChat flags: enabled + optional test phone override */
async function getSuperchatConfig() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/feature_flags?key=in.(superchat_enabled,superchat_test_phone)&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return { enabled: false, testPhone: null };
    const data = await res.json();
    const enabledFlag = data.find(f => f.key === 'superchat_enabled');
    const testPhoneFlag = data.find(f => f.key === 'superchat_test_phone');
    return {
      enabled: enabledFlag?.enabled === true,
      testPhone: testPhoneFlag?.enabled ? (testPhoneFlag.description || null) : null,
    };
  } catch { return { enabled: false, testPhone: null }; }
}

/** SuperChat API helper */
async function superchatRequest(path, options = {}) {
  const res = await fetch(`${SUPERCHAT_BASE}/${path}`, {
    ...options,
    headers: {
      'X-API-KEY': SUPERCHAT_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/** Format date as DD.MM.YYYY for SuperChat contact attribute */
function formatDateDE(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

/** Update Install Booking Date + Link attributes on a SuperChat contact */
async function updateContactAttributes(phone, bookingDate, bookingLink) {
  if (!SUPERCHAT_API_KEY || !phone) return;
  try {
    // Search for contact by phone
    const searchResult = await superchatRequest('contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        query: { value: [{ field: 'phone', operator: '=', value: phone }] },
      }),
    });
    const contacts = searchResult.data?.results || searchResult.data;
    if (!Array.isArray(contacts) || contacts.length === 0) {
      console.log(`[install-booker-book] No SuperChat contact found for ${phone}`);
      return;
    }
    const contactId = contacts[0].id;

    // Build attribute updates
    const customAttributes = [];
    if (SC_BOOKING_LINK_ATTR_ID && bookingLink) {
      customAttributes.push({ id: SC_BOOKING_LINK_ATTR_ID, value: bookingLink });
    }
    if (SC_BOOKING_DATE_ATTR_ID && bookingDate) {
      customAttributes.push({ id: SC_BOOKING_DATE_ATTR_ID, value: formatDateDE(bookingDate) });
    }

    if (customAttributes.length === 0) return;

    const updateResult = await superchatRequest(`contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ custom_attributes: customAttributes }),
    });
    console.log(`[install-booker-book] Updated SC contact ${contactId} attrs: ${updateResult.ok ? 'OK' : 'FAILED'}`);
  } catch (e) {
    console.error(`[install-booker-book] SC contact update failed for ${phone}:`, e.message);
  }
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
    const { token, date, notes: rawNotes } = body;
    let { time } = body;
    const windowKey = body.window || null; // 'morning', 'afternoon', 'evening'
    const notes = rawNotes ? sanitizeString(rawNotes, 500) : null;

    // Either time or window must be provided
    if (!token || !date || (!time && !windowKey)) {
      return new Response(JSON.stringify({ error: 'token, date, and either time or window are required' }), {
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
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return new Response(JSON.stringify({ error: 'Ungültiges Zeitformat (HH:MM erwartet)' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
    if (windowKey && !TIME_WINDOW_KEYS.includes(windowKey)) {
      return new Response(JSON.stringify({ error: 'Ungültiges Zeitfenster', validWindows: TIME_WINDOW_KEYS }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // Reject past dates
    const today = new Date().toLocaleDateString('sv-SE');
    if (date < today) {
      return new Response(JSON.stringify({ error: 'past_date', message: 'Termine in der Vergangenheit können nicht gebucht werden.' }), {
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

    // 2. Verify slot is still available — check ALL routes for this city+date
    //    Use ilike to match city name variants (e.g. "Frankfurt" vs "Frankfurt am Main")
    const cityBase = normalizeCity(booking.city);
    const routesResult = await supabaseRequest(
      `install_routen?city=ilike.${encodeURIComponent(cityBase)}*&schedule_date=eq.${date}&status=eq.open&select=*`
    );

    if (!routesResult.ok || !routesResult.data?.length) {
      return new Response(JSON.stringify({ error: 'slot_unavailable', message: 'Dieser Termin ist leider nicht mehr verfügbar.' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // Get all bookings for this city+date to check capacity across routes
    const dayBookingsResult = await supabaseRequest(
      `install_bookings?city=ilike.${encodeURIComponent(cityBase)}*&booked_date=eq.${date}&status=in.(booked,confirmed)&select=id,booked_time,route_id`
    );
    const dayBookings = dayBookingsResult.data || [];

    // Find a route that has capacity AND the requested time slot available
    let route = null;

    // If window-based booking: auto-assign the best slot within the window
    if (windowKey && !time) {
      for (const candidateRoute of routesResult.data) {
        let timeSlots = [];
        try {
          if (Array.isArray(candidateRoute.time_slots)) {
            timeSlots = candidateRoute.time_slots;
          } else if (typeof candidateRoute.time_slots === 'string') {
            let parsed = JSON.parse(candidateRoute.time_slots);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            timeSlots = Array.isArray(parsed) ? parsed : [];
          }
        } catch { timeSlots = []; }

        const routeBookings = dayBookings.filter(b => b.route_id === candidateRoute.id);
        if (routeBookings.length >= candidateRoute.max_capacity) continue;

        const routeBookedTimes = routeBookings.map(b => b.booked_time);
        const assignedSlot = assignSlotInWindow(windowKey, routeBookedTimes, timeSlots);
        if (assignedSlot) {
          time = assignedSlot;
          route = candidateRoute;
          break;
        }
      }
    } else {
      // Explicit time-based booking (legacy / internal)
      for (const candidateRoute of routesResult.data) {
        let timeSlots = [];
        try {
          if (Array.isArray(candidateRoute.time_slots)) {
            timeSlots = candidateRoute.time_slots;
          } else if (typeof candidateRoute.time_slots === 'string') {
            let parsed = JSON.parse(candidateRoute.time_slots);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            timeSlots = Array.isArray(parsed) ? parsed : [];
          }
        } catch { timeSlots = []; }

        if (!timeSlots.includes(time)) continue;

        const routeBookings = dayBookings.filter(b => b.route_id === candidateRoute.id);
        if (routeBookings.length >= candidateRoute.max_capacity) continue;

        const routeBookedTimes = routeBookings.map(b => b.booked_time);
        if (slotsOverlap(time, routeBookedTimes)) continue;

        route = candidateRoute;
        break;
      }
    }

    if (!route || !time) {
      const msg = windowKey
        ? `Im Zeitfenster "${TIME_WINDOWS[windowKey]?.label?.de || windowKey}" ist leider kein Termin mehr frei.`
        : 'Diese Uhrzeit ist leider bereits vergeben. Bitte wählen Sie eine andere Zeit.';
      return new Response(JSON.stringify({ error: 'slot_taken', message: msg }), {
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
          booked_window: windowKey || null,
          route_id: route.id,
          status: 'confirmed',
          booked_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          notes: notes || null,
        }),
      }
    );

    if (!updateResult.ok) {
      throw new Error('Failed to update booking');
    }

    // Activity log: self-booking by customer (fire-and-forget)
    writeActivityLog({
      user_id:             null,
      user_name:           'Selbst-Buchung (Kunde)',
      action:              'booking_confirmed',
      booking_id:          booking.id,
      akquise_airtable_id: booking.akquise_airtable_id || null,
      location_name:       booking.location_name,
      city:                booking.city,
      source:              'self_booking',
      detail: { booked_date: date, booked_time: time, booked_window: windowKey || null },
    });

    // 4. Create Airtable record in Installationstermine table
    let terminAirtableId = null;
    if (AIRTABLE_TOKEN) {
      try {
        const terminFields = {
          'Installationsdatum': `${date}T${time}:00.000Z`,
          'Terminstatus': 'Geplant',
          'Grund /Notiz': [
            `Selbst-Buchung via Install Date Booker`,
            `Zeitfenster: ${time} – ${endTime} Uhr`,
            route.installer_team ? `Team: ${route.installer_team}` : '',
            notes ? `Anmerkung Standort: ${notes}` : '',
          ].filter(Boolean).join('\n'),
        };

        // Link to Akquise record if we have one
        if (booking.akquise_airtable_id) {
          terminFields['Akquise'] = [booking.akquise_airtable_id];
        }

        const terminRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${INSTALLATIONSTERMINE_TABLE}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ records: [{ fields: terminFields }] }),
        });
        const terminData = await terminRes.json();

        if (terminData.error) {
          console.error('[install-booker-book] Airtable Installationstermine create error:', JSON.stringify(terminData.error));
        }

        terminAirtableId = terminData.records?.[0]?.id;

        // Store the Airtable ID back in Supabase
        if (terminAirtableId) {
          await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ termin_airtable_id: terminAirtableId }),
          });
        } else {
          console.error('[install-booker-book] No Airtable record ID returned. Response:', JSON.stringify(terminData));
        }
      } catch (e) {
        console.error('[install-booker-book] Airtable Installationstermine create failed:', e.message);
      }
    }

    // 5. Update Airtable Akquise record — set Lead_Status to reflect booking
    if (AIRTABLE_TOKEN && booking.akquise_airtable_id) {
      try {
        // Note: We only update fields that exist in Airtable Akquise table
        // Lead_Status is the status field, no custom Booking fields exist
        const akquiseRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${booking.akquise_airtable_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              'Lead_Status': 'Won / Signed',
            },
          }),
        });
        const akquiseData = await akquiseRes.json();
        if (akquiseData.error) {
          console.error('[install-booker-book] Airtable Akquise update error:', JSON.stringify(akquiseData.error));
        }
      } catch (e) {
        console.error('[install-booker-book] Airtable Akquise update failed:', e.message);
      }
    }

    // 6. Update SuperChat contact attributes FIRST (Install Booking Date + Link)
    //    Must happen BEFORE sending the template, because the template reads
    //    {{Install Booking Date}} from the contact attribute.
    const bookingLinkUrl = `${process.env.BOOKING_BASE_URL || 'https://tools.dimension-outdoor.com/book'}/${booking.booking_token}`;
    const actualPhoneForSC = normalizePhone(booking.contact_phone);
    if (actualPhoneForSC) {
      try {
        await updateContactAttributes(actualPhoneForSC, date, bookingLinkUrl);
      } catch (e) {
        console.error('[install-booker-book] SC contact attribute update failed:', e.message);
      }
    }

    // 7. Send WhatsApp booking confirmation via SuperChat approved template
    const CONFIRMATION_TEMPLATE_ID = 'tn_ZogGREMwedmaZwXJz6iyZ'; // install_booking_confirmation
    const WA_CHANNEL = process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb';
    const scConfig = await getSuperchatConfig();

    // Fallback: If booking has no contact_phone, try to fetch from Airtable Akquise record
    let confirmationPhone = booking.contact_phone;
    if (!confirmationPhone && AIRTABLE_TOKEN && booking.akquise_airtable_id) {
      try {
        const akqRes = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${booking.akquise_airtable_id}?fields%5B%5D=Telefon`,
          { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const akqData = await akqRes.json();
        confirmationPhone = akqData.fields?.Telefon || null;
        if (confirmationPhone) {
          console.log(`[install-booker-book] Fallback phone from Airtable: ${confirmationPhone}`);
          // Also update the booking record with this phone
          await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ contact_phone: confirmationPhone }),
          });
        }
      } catch (e) {
        console.error('[install-booker-book] Airtable phone fallback failed:', e.message);
      }
    }

    // Diagnostic logging for WA confirmation
    console.log('[install-booker-book] WA confirmation check:', {
      hasApiKey: !!SUPERCHAT_API_KEY,
      contactPhone: confirmationPhone || '(missing)',
      scEnabled: scConfig.enabled,
      testPhone: scConfig.testPhone || '(none)',
      templateId: CONFIRMATION_TEMPLATE_ID,
    });

    if (SUPERCHAT_API_KEY && confirmationPhone && scConfig.enabled) {
      try {
        // Test mode: override recipient phone with test number
        const actualPhone = normalizePhone(scConfig.testPhone || confirmationPhone);
        if (scConfig.testPhone) {
          console.log(`[install-booker-book] TEST MODE — redirecting WA confirmation from ${confirmationPhone} to ${scConfig.testPhone}`);
        }

        const firstName = booking.contact_name || 'Hallo';

        // Send approved template (variables: position 1 = FirstName static, position 2 = BookingDate contact_attribute)
        const templatePayload = {
          to: [{ identifier: actualPhone }],
          from: { channel_id: WA_CHANNEL },
          content: {
            type: 'whats_app_template',
            template: {
              id: CONFIRMATION_TEMPLATE_ID,
              variables: [
                { position: 1, value: firstName },
                // position 2 is contact_attribute (Install Booking Date) — SC reads automatically
              ],
            },
          },
        };

        const templateRes = await fetch('https://api.superchat.com/v1.0/messages', {
          method: 'POST',
          headers: {
            'X-API-KEY': SUPERCHAT_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(templatePayload),
        });

        const templateResult = await templateRes.json();
        if (templateRes.ok) {
          console.log(`[install-booker-book] WA confirmation template sent to ${actualPhone}`);
        } else {
          console.error(`[install-booker-book] WA confirmation template failed:`, JSON.stringify(templateResult));
        }
      } catch (e) {
        console.error('[install-booker-book] WhatsApp confirmation failed:', e.message);
      }
    } else if (!scConfig.enabled) {
      console.log('[install-booker-book] WhatsApp confirmation SKIPPED — superchat_enabled=false');
    }

    // 8. Notifications — Slack + Make.com (fire-and-forget)
    const bookingUrl = `${process.env.BOOKING_BASE_URL || 'https://tools.dimension-outdoor.com/book'}/${booking.booking_token}`;
    const notifPayload = {
      location_name: booking.location_name || '',
      jet_id: booking.jet_id || '',
      city: booking.city || '',
      booked_date: date,
      booked_time: time,
      booked_end_time: endTime,
      installer_team: route.installer_team || '',
      contact_name: booking.contact_name || '',
      contact_phone: booking.contact_phone || '',
      notes: notes || '',
      booking_url: bookingUrl,
      akquise_airtable_id: booking.akquise_airtable_id || '',
    };

    // 8a. Slack notification — direct webhook (no Make.com dependency)
    const SLACK_WEBHOOK = process.env.SLACK_INSTALL_WEBHOOK;
    if (SLACK_WEBHOOK) {
      try {
        const slackMsg = {
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `📅 Neuer Installationstermin`, emoji: true },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Standort:*\n${notifPayload.location_name}` },
                { type: 'mrkdwn', text: `*Stadt:*\n${notifPayload.city}` },
                { type: 'mrkdwn', text: `*Datum:*\n${notifPayload.booked_date}` },
                { type: 'mrkdwn', text: `*Zeit:*\n${notifPayload.booked_time} – ${notifPayload.booked_end_time}` },
                { type: 'mrkdwn', text: `*Kontakt:*\n${notifPayload.contact_name}` },
                { type: 'mrkdwn', text: `*Telefon:*\n${notifPayload.contact_phone}` },
              ],
            },
            ...(notifPayload.installer_team ? [{
              type: 'section',
              fields: [{ type: 'mrkdwn', text: `*Team:*\n${notifPayload.installer_team}` }],
            }] : []),
            ...(notifPayload.notes ? [{
              type: 'section',
              text: { type: 'mrkdwn', text: `*Anmerkung:*\n${notifPayload.notes}` },
            }] : []),
            {
              type: 'actions',
              elements: [{
                type: 'button',
                text: { type: 'plain_text', text: '🔗 Buchung ansehen', emoji: true },
                url: notifPayload.booking_url,
              }],
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `JET-ID: ${notifPayload.jet_id} | Gebucht: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` }],
            },
          ],
        };
        await fetch(SLACK_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackMsg),
        });
        console.log('[install-booker-book] Slack notification sent successfully');
      } catch (e) {
        console.error('[install-booker-book] Slack notification failed:', e.message);
      }
    } else {
      console.warn('[install-booker-book] SLACK_INSTALL_WEBHOOK not set — skipping Slack');
    }

    // 8b. Make.com webhook — E-Mail notification (optional, kept for backward compat)
    const MAKE_WEBHOOK_URL = process.env.MAKE_INSTALL_BOOKING_WEBHOOK;
    if (MAKE_WEBHOOK_URL) {
      try {
        await fetch(MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notifPayload),
        });
        console.log('[install-booker-book] Make.com webhook triggered successfully');
      } catch (e) {
        console.error('[install-booker-book] Make.com webhook failed:', e.message);
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

    // Build window info for response (if window-based booking)
    const windowInfo = windowKey && TIME_WINDOWS[windowKey] ? {
      window: windowKey,
      windowLabel: TIME_WINDOWS[windowKey].label,
      windowRange: TIME_WINDOWS[windowKey].rangeLabel,
    } : {};

    return new Response(JSON.stringify({
      success: true,
      booking: {
        date,
        time,
        endTime,
        locationName: booking.location_name,
        city: booking.city,
        contactName: booking.contact_name,
        ...windowInfo,
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
      errorMessage: err.message,
    });

    return new Response(JSON.stringify({ error: 'Buchung fehlgeschlagen. Bitte versuchen Sie es erneut.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }
};
