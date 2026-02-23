/**
 * Netlify Function: Install Booker – Booking Status & Management
 *
 * Dashboard endpoint for viewing and managing bookings.
 *
 * GET  /api/install-booker/status          → List bookings (filters: city, status, from, to)
 * PATCH /api/install-booker/status/{id}    → Update booking status (confirm, cancel, complete, no_show)
 */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
  sanitizeString, isValidUUID, normalizePhone,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { calculateEndTime, normalizeCity } from './shared/slotUtils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const AKQUISE_TABLE = 'tblqFMBAeKQ1NbSI8';
const TASKS_TABLE = 'tblcKHWJg77mgIQ9l';

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

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const cors = corsHeaders(origin);
  const url = new URL(request.url);
  const apiStart = Date.now();

  // Rate limiting
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-status:${clientIP}`, 60, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  // Extract booking ID from path
  const pathParts = url.pathname
    .replace(/^\/?(\.netlify\/functions\/install-booker-status\/?|api\/install-booker\/status\/?)/, '')
    .split('/').filter(Boolean);
  const bookingId = pathParts[0] || null;

  // Validate bookingId format if present (prevents injection into Supabase query)
  if (bookingId && !isValidUUID(bookingId) && !/^\d+$/.test(bookingId)) {
    return new Response(JSON.stringify({ error: 'Invalid booking ID format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    // ── GET: List bookings ──
    if (request.method === 'GET') {
      const city = url.searchParams.get('city');
      const status = url.searchParams.get('status');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const olderThan = url.searchParams.get('olderThan'); // e.g. "48h" for follow-up

      let query = 'install_bookings?select=*&order=created_at.desc';
      if (city) query += `&city=eq.${encodeURIComponent(city)}`;
      if (status) {
        // Support comma-separated statuses — sanitize each value
        if (status.includes(',')) {
          const validStatuses = ['pending', 'booked', 'confirmed', 'cancelled', 'completed', 'no_show'];
          const parts = status.split(',').map(s => s.trim()).filter(s => validStatuses.includes(s));
          if (parts.length > 0) {
            query += `&status=in.(${parts.join(',')})`;
          }
        } else {
          query += `&status=eq.${encodeURIComponent(status)}`;
        }
      }
      // Validate date format (YYYY-MM-DD) before interpolating into query
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (from) {
        if (!dateRegex.test(from)) {
          return new Response(JSON.stringify({ error: 'Invalid "from" date format. Use YYYY-MM-DD.' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        query += `&booked_date=gte.${from}`;
      }
      if (to) {
        if (!dateRegex.test(to)) {
          return new Response(JSON.stringify({ error: 'Invalid "to" date format. Use YYYY-MM-DD.' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
        query += `&booked_date=lte.${to}`;
      }

      // Support "olderThan" for follow-up queries (e.g. "48h")
      if (olderThan) {
        const match = olderThan.match(/^(\d+)h$/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
          query += `&whatsapp_sent_at=lt.${cutoff}`;
        }
      }

      const result = await supabaseRequest(query);

      // Enrich with route info if needed
      let enrichedData = result.data || [];
      if (enrichedData.length > 0) {
        const routeIds = [...new Set(enrichedData.filter(b => b.route_id).map(b => b.route_id))];
        if (routeIds.length > 0) {
          const routesResult = await supabaseRequest(
            `install_routen?id=in.(${routeIds.join(',')})&select=id,city,schedule_date,installer_team,max_capacity`
          );
          const routeMap = new Map((routesResult.data || []).map(r => [r.id, r]));
          enrichedData = enrichedData.map(b => {
            const route = b.route_id ? routeMap.get(b.route_id) || null : null;
            return {
              ...b,
              route,
              // Use booking's own team, fallback to route's team
              installer_team: b.installer_team || route?.installer_team || null,
            };
          });
        }
      }

      logApiCall({
        functionName: 'install-booker-status',
        service: 'supabase',
        method: 'GET',
        endpoint: 'install_bookings',
        durationMs: Date.now() - apiStart,
        statusCode: result.status,
        success: result.ok,
      });

      return new Response(JSON.stringify(enrichedData), {
        status: result.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          ...cors,
        },
      });
    }

    // ── PATCH: Update booking status OR reschedule ──
    if (request.method === 'PATCH' && bookingId) {
      const body = await request.json();
      const { status: newStatus, notes, action, newDate, newTime } = body;

      // Get current booking
      const currentResult = await supabaseRequest(`install_bookings?id=eq.${bookingId}&select=*&limit=1`);
      if (!currentResult.ok || !currentResult.data?.length) {
        return new Response(JSON.stringify({ error: 'Booking not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const currentBooking = currentResult.data[0];

      // ── SUPPRESS_REMINDER action ──
      // Sets reminder_count=1 so no automatic reminder is sent.
      // Optionally updates notes. Used when customer responded or deferred install.
      if (action === 'suppress_reminder') {
        const newNotes = body.notes
          ? [currentBooking.notes || '', body.notes].filter(Boolean).join('\n')
          : currentBooking.notes;

        const updates = {
          reminder_count: 1,
          updated_at: new Date().toISOString(),
        };
        if (body.notes) updates.notes = newNotes;
        if (body.earliest_date) updates.earliest_date = body.earliest_date;

        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(updates),
        });
        const patchData = await patchRes.json();
        console.log(`[install-booker-status] Reminder suppressed for booking ${bookingId}`);

        return new Response(JSON.stringify({
          success: true,
          action: 'suppress_reminder',
          booking: patchData[0] || patchData,
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
      }

      // ── UPDATE_NOTES action ──
      // Updates notes field on a booking without changing status.
      if (action === 'update_notes') {
        const newNotes = body.notes || '';
        const updates = {
          notes: newNotes,
          updated_at: new Date().toISOString(),
        };

        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(updates),
        });
        const patchData = await patchRes.json();

        return new Response(JSON.stringify({
          success: true,
          action: 'update_notes',
          booking: patchData[0] || patchData,
        }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });
      }

      // ── CANCEL_AND_REOPEN action ──
      // Cancels the booking and resets to 'pending' so the booking link works again.
      // Used when sending the "install_reschedule" WA template (Termin verschieben).
      if (action === 'cancel_and_reopen') {
        const oldDate = currentBooking.booked_date;
        const oldTime = currentBooking.booked_time;

        // Reset booking to pending: clear date/time, keep token intact
        const reopenUpdates = {
          status: 'pending',
          booked_date: null,
          booked_time: null,
          booked_end_time: null,
          booked_at: null,
          confirmed_at: null,
          route_id: null,
          installer_team: null,
          reminder_sent_at: null,
          reminder_count: 0,
          notes: [
            currentBooking.notes || '',
            `Storniert & Link reaktiviert: ${oldDate || '—'} ${oldTime || '—'} (${new Date().toLocaleString('de-DE')})`,
          ].filter(Boolean).join('\n'),
          updated_at: new Date().toISOString(),
        };

        const updateResult = await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          body: JSON.stringify(reopenUpdates),
        });

        // Update Airtable Installationstermine status → Abgebrochen
        if (updateResult.ok && currentBooking.termin_airtable_id && AIRTABLE_TOKEN) {
          try {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblKznpAOAMvEfX8u/${currentBooking.termin_airtable_id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fields: { 'Status Installation': 'Abgebrochen' },
              }),
            });
          } catch (e) {
            console.error('[install-booker-status] Airtable Installationen cancel_and_reopen failed:', e.message);
          }
        }

        // Update Akquise Booking Status → pending (so it shows as "ausstehend" again)
        if (updateResult.ok && currentBooking.akquise_airtable_id && AIRTABLE_TOKEN) {
          try {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${currentBooking.akquise_airtable_id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: { 'Booking Status': 'pending' } }),
            });
          } catch (e) {
            console.error('[install-booker-status] Airtable Akquise cancel_and_reopen failed:', e.message);
          }
        }

        // Clear the old termin_airtable_id so the next booking creates a fresh one
        if (updateResult.ok && currentBooking.termin_airtable_id) {
          await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
            method: 'PATCH',
            body: JSON.stringify({ termin_airtable_id: null }),
          });
        }

        console.log(`[install-booker-status] Booking ${bookingId} cancelled & reopened. Old: ${oldDate} ${oldTime}. Token still active.`);

        logApiCall({
          functionName: 'install-booker-status',
          service: 'supabase',
          method: 'PATCH',
          endpoint: 'install_bookings (cancel_and_reopen)',
          durationMs: Date.now() - apiStart,
          statusCode: updateResult.status,
          success: updateResult.ok,
        });

        return new Response(JSON.stringify({
          success: true,
          action: 'cancel_and_reopen',
          booking: updateResult.data?.[0],
          bookingToken: currentBooking.booking_token,
          bookingLink: `${process.env.BOOKING_BASE_URL || 'https://tools.dimension-outdoor.com/book'}/${currentBooking.booking_token}`,
          oldDate,
          oldTime,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // ── RESCHEDULE action ──
      if (action === 'reschedule') {
        if (!newDate || !newTime) {
          return new Response(JSON.stringify({ error: 'newDate and newTime are required for reschedule' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }

        // Calculate new end time (90 min) — uses shared calculateEndTime (clamped to 23:59)
        const newEndTime = calculateEndTime(newTime);

        // Find matching route (ilike for city name variants like "Frankfurt" vs "Frankfurt am Main")
        const reschedCityBase = normalizeCity(currentBooking.city);
        const routeResult = await supabaseRequest(
          `install_routen?city=ilike.${encodeURIComponent(reschedCityBase)}*&schedule_date=eq.${newDate}&status=eq.open&select=id&limit=1`
        );
        const newRouteId = routeResult.data?.[0]?.id || currentBooking.route_id;

        const oldDate = currentBooking.booked_date;
        const oldTime = currentBooking.booked_time;

        // Update Supabase booking
        const rescheduleUpdates = {
          booked_date: newDate,
          booked_time: newTime,
          booked_end_time: newEndTime,
          route_id: newRouteId,
          status: 'confirmed', // Buchung = bestätigt, kein extra Bestätigungs-Step
          confirmed_at: new Date().toISOString(),
          notes: [
            currentBooking.notes || '',
            `Umgebucht: ${oldDate} ${oldTime} → ${newDate} ${newTime} (${new Date().toLocaleString('de-DE')})`,
          ].filter(Boolean).join('\n'),
          updated_at: new Date().toISOString(),
        };

        const updateResult = await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          body: JSON.stringify(rescheduleUpdates),
        });

        // Update Airtable Installationen record
        if (updateResult.ok && currentBooking.termin_airtable_id && AIRTABLE_TOKEN) {
          try {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblKznpAOAMvEfX8u/${currentBooking.termin_airtable_id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: {
                  'Aufbau Datum': newDate,
                  'Installationsstart': `${newDate}T${newTime}:00.000Z`,
                  'Status Installation': 'Termin bestätigt',
                  'Allgemeine Bemerkungen': `Umgebucht von ${oldDate} ${oldTime} auf ${newDate} ${newTime}`,
                },
              }),
            });
          } catch (e) {
            console.error('[install-booker-status] Airtable reschedule update failed:', e.message);
          }
        }

        // Update Akquise Booking Status back to booked
        if (updateResult.ok && currentBooking.akquise_airtable_id && AIRTABLE_TOKEN) {
          try {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${currentBooking.akquise_airtable_id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: { 'Booking Status': 'confirmed' } }),
            });
          } catch (e) {
            console.error('[install-booker-status] Airtable Akquise reschedule update failed:', e.message);
          }
        }

        console.log(`[install-booker-status] Booking ${bookingId} rescheduled: ${oldDate} ${oldTime} → ${newDate} ${newTime}`);

        logApiCall({
          functionName: 'install-booker-status',
          service: 'supabase',
          method: 'PATCH',
          endpoint: 'install_bookings (reschedule)',
          durationMs: Date.now() - apiStart,
          statusCode: updateResult.status,
          success: updateResult.ok,
        });

        return new Response(JSON.stringify({
          success: true,
          action: 'rescheduled',
          booking: updateResult.data?.[0],
          oldDate, oldTime,
          newDate, newTime: newTime,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // ── Phone number update ──
      if (body.contact_phone !== undefined) {
        const normalizedPhone = normalizePhone(body.contact_phone);
        const phoneUpdates = { contact_phone: normalizedPhone, updated_at: new Date().toISOString() };
        const phoneResult = await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          body: JSON.stringify(phoneUpdates),
        });

        // Also sync to Airtable Akquise
        if (phoneResult.ok && currentBooking.akquise_airtable_id && AIRTABLE_TOKEN) {
          try {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${currentBooking.akquise_airtable_id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: { 'Contact Phone': body.contact_phone } }),
            });
          } catch (e) {
            console.error('[install-booker-status] Airtable phone update failed:', e.message);
          }
        }

        if (!newStatus) {
          // Phone-only update, return early
          return new Response(JSON.stringify(phoneResult.data), {
            status: phoneResult.status,
            headers: { 'Content-Type': 'application/json', ...cors },
          });
        }
      }

      // ── Team assignment update ──
      if (body.installer_team !== undefined && !newStatus && !body.contact_phone) {
        const teamUpdates = {
          installer_team: body.installer_team || null,
          updated_at: new Date().toISOString(),
        };
        const teamResult = await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
          method: 'PATCH',
          body: JSON.stringify(teamUpdates),
        });
        console.log(`[install-booker-status] Booking ${bookingId} team assigned: ${body.installer_team || 'none'}`);
        return new Response(JSON.stringify(teamResult.data), {
          status: teamResult.status,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // ── Regular status update ──
      const validStatuses = ['pending', 'booked', 'confirmed', 'cancelled', 'completed', 'no_show'];
      if (newStatus && !validStatuses.includes(newStatus)) {
        return new Response(JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const updates = { updated_at: new Date().toISOString() };
      if (newStatus) updates.status = newStatus;
      if (notes !== undefined) updates.notes = notes;
      if (body.installer_team !== undefined) updates.installer_team = body.installer_team || null;

      if (newStatus === 'confirmed') updates.confirmed_at = new Date().toISOString();

      const updateResult = await supabaseRequest(`install_bookings?id=eq.${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      // Sync status to Airtable Installationen table (tblKznpAOAMvEfX8u)
      if (updateResult.ok && currentBooking.termin_airtable_id && AIRTABLE_TOKEN) {
        try {
          const atStatusMap = {
            confirmed: 'Termin bestätigt',
            cancelled: 'Abgebrochen',
            completed: 'Abgeschlossen',
            no_show: 'Abgebrochen - Vorort',
          };
          if (atStatusMap[newStatus]) {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblKznpAOAMvEfX8u/${currentBooking.termin_airtable_id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: { 'Status Installation': atStatusMap[newStatus] },
              }),
            });
          }
        } catch (e) {
          console.error('[install-booker-status] Airtable Installationen update failed:', e.message);
        }
      }

      // Also update Akquise Booking Status
      if (updateResult.ok && currentBooking.akquise_airtable_id && AIRTABLE_TOKEN) {
        try {
          const akquiseStatusMap = {
            confirmed: 'confirmed',
            cancelled: 'cancelled',
            completed: 'completed',
          };
          if (akquiseStatusMap[newStatus]) {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${currentBooking.akquise_airtable_id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: { 'Booking Status': akquiseStatusMap[newStatus] },
              }),
            });
          }
        } catch (e) {
          console.error('[install-booker-status] Airtable Akquise update failed:', e.message);
        }
      }

      // ── Storno → Auto-Task for "Installation Disponent" ──
      if (updateResult.ok && (newStatus === 'cancelled' || newStatus === 'no_show') && AIRTABLE_TOKEN) {
        try {
          const taskTitle = newStatus === 'cancelled'
            ? `Stornierung nachfassen: ${currentBooking.location_name || currentBooking.city}`
            : `No-Show nachfassen: ${currentBooking.location_name || currentBooking.city}`;

          const taskDescription = [
            newStatus === 'cancelled'
              ? `Der Installationstermin für "${currentBooking.location_name || 'Unbekannt'}" in ${currentBooking.city} wurde storniert.`
              : `Der Standort "${currentBooking.location_name || 'Unbekannt'}" in ${currentBooking.city} ist nicht zum Termin erschienen.`,
            '',
            `Bitte anrufen und neuen Termin vereinbaren.`,
            '',
            `Kontakt: ${currentBooking.contact_name || '—'}`,
            `Telefon: ${currentBooking.contact_phone || '—'}`,
            `JET-ID: ${currentBooking.jet_id || '—'}`,
            currentBooking.booked_date ? `Ursprünglicher Termin: ${currentBooking.booked_date} ${currentBooking.booked_time || ''} Uhr` : '',
            notes ? `Notiz: ${notes}` : '',
          ].filter(Boolean).join('\n');

          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 1); // Follow-up next business day

          const taskFields = {
            'Task Title': taskTitle,
            'Description': taskDescription,
            'Status': 'New',
            'Priority': newStatus === 'no_show' ? 'Urgent' : 'High',
            'Due Date': dueDate.toISOString().split('T')[0],
          };

          // Link to Akquise/Location if available
          if (currentBooking.akquise_airtable_id) {
            taskFields['Locations'] = [currentBooking.akquise_airtable_id];
          }

          await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${TASKS_TABLE}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records: [{ fields: taskFields }] }),
          });

          console.log(`[install-booker-status] Auto-task created for ${newStatus}: ${taskTitle}`);
        } catch (e) {
          console.error('[install-booker-status] Auto-task creation failed:', e.message);
        }
      }

      // ── Cancel/No-Show → WhatsApp notification (only if feature flag enabled) ──
      if (updateResult.ok && (newStatus === 'cancelled' || newStatus === 'no_show') && SUPERCHAT_API_KEY && currentBooking.contact_phone) {
        // Check feature flag before sending WhatsApp
        let scEnabled = false;
        let scTestPhone = null;
        try {
          const flagRes = await fetch(`${SUPABASE_URL}/rest/v1/feature_flags?key=in.(superchat_enabled,superchat_test_phone)&select=*`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          });
          if (flagRes.ok) {
            const flags = await flagRes.json();
            const enabledFlag = flags.find(f => f.key === 'superchat_enabled');
            const testPhoneFlag = flags.find(f => f.key === 'superchat_test_phone');
            scEnabled = enabledFlag?.enabled === true;
            scTestPhone = testPhoneFlag?.enabled ? (testPhoneFlag.description || null) : null;
          }
        } catch (_) { /* flag check failed, keep disabled */ }

        if (!scEnabled) {
          console.log('[install-booker-status] WhatsApp cancel notification SKIPPED — superchat_enabled=false');
        } else {
          try {
            // Test mode: override recipient phone
            const actualPhone = normalizePhone(scTestPhone || currentBooking.contact_phone);
            if (scTestPhone) {
              console.log(`[install-booker-status] TEST MODE — redirecting WA cancel from ${currentBooking.contact_phone} to ${scTestPhone}`);
            }

            const cancelText = newStatus === 'cancelled'
              ? [
                  `Hallo ${currentBooking.contact_name || 'Standortinhaber/in'},`,
                  '',
                  `Ihr Installationstermin${currentBooking.booked_date ? ` am ${new Date(currentBooking.booked_date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''} wurde storniert.`,
                  '',
                  `Wir melden uns in Kürze bei Ihnen, um einen neuen Termin zu vereinbaren.`,
                  '',
                  `Bei Fragen antworten Sie einfach auf diese Nachricht.`,
                  '',
                  `Ihr JET Germany Team`,
                ].join('\n')
              : null; // No WhatsApp for no_show (internal handling)

            if (cancelText) {
              await fetch('https://api.superchat.com/v1.0/messages', {
                method: 'POST',
                headers: {
                  'X-API-KEY': SUPERCHAT_API_KEY,
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify({
                  to: [{ identifier: actualPhone }],
                  from: { channel_id: process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb' },
                  content: { type: 'text', body: cancelText },
                }),
              });
              console.log(`[install-booker-status] WhatsApp cancel notification sent to ${actualPhone}`);
            }
          } catch (e) {
            console.error('[install-booker-status] WhatsApp cancel notification failed:', e.message);
          }
        }
      }

      // Activity log for status changes (fire-and-forget)
      if (updateResult.ok && newStatus) {
        const actionMap = {
          cancelled: 'booking_cancelled', completed: 'booking_completed',
          no_show: 'status_changed', confirmed: 'status_changed',
          booked: 'status_changed', pending: 'status_changed',
        };
        writeActivityLog({
          user_id:             body.created_by_user_id   || null,
          user_name:           body.created_by_user_name || 'System',
          action:              actionMap[newStatus] || 'status_changed',
          booking_id:          bookingId,
          akquise_airtable_id: currentBooking.akquise_airtable_id || null,
          location_name:       currentBooking.location_name,
          city:                currentBooking.city,
          source:              'portal',
          detail: { new_status: newStatus, old_status: currentBooking.status, notes: notes || null },
        });
      }

      logApiCall({
        functionName: 'install-booker-status',
        service: 'supabase',
        method: 'PATCH',
        endpoint: 'install_bookings',
        durationMs: Date.now() - apiStart,
        statusCode: updateResult.status,
        success: updateResult.ok,
      });

      return new Response(JSON.stringify(updateResult.data), {
        status: updateResult.status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── POST: Manual/Phone Booking (create booking without invite flow) ──
    if (request.method === 'POST') {
      const body = await request.json();
      const { akquiseAirtableId, locationName, city, contactName, contactPhone, jetId, bookedDate, bookedTime, notes, bookingSource,
        created_by_user_id, created_by_user_name } = body;

      if (!city || !bookedDate || !bookedTime) {
        return new Response(JSON.stringify({ error: 'city, bookedDate, and bookedTime are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // Calculate end time (90 minutes) — uses shared calculateEndTime (clamped to 23:59)
      const endTime = calculateEndTime(bookedTime);

      // Find matching route for this city+date (use ilike for city name variants)
      const manualCityBase = normalizeCity(city);
      const routeResult = await supabaseRequest(
        `install_routen?city=ilike.${encodeURIComponent(manualCityBase)}*&schedule_date=eq.${bookedDate}&status=eq.open&select=id&limit=1`
      );
      const routeId = routeResult.data?.[0]?.id || null;

      // Create the booking directly as "booked"
      const bookingToken = crypto.randomUUID();
      const bookingResult = await supabaseRequest('install_bookings', {
        method: 'POST',
        body: JSON.stringify({
          booking_token: bookingToken,
          akquise_airtable_id: akquiseAirtableId || null,
          location_name: locationName || '',
          city,
          contact_name: contactName || '',
          contact_phone: contactPhone || '',
          jet_id: jetId || '',
          booked_date: bookedDate,
          booked_time: bookedTime,
          booked_end_time: endTime,
          route_id: routeId,
          status: 'confirmed',
          booking_source: bookingSource || 'phone',
          booked_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          notes: notes || null,
          created_by_user_id: created_by_user_id || null,
          created_by_user_name: created_by_user_name || null,
        }),
      });

      if (!bookingResult.ok) {
        return new Response(JSON.stringify({ error: 'Buchung konnte nicht erstellt werden' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // Create Airtable Installationen record
      let terminAirtableId = null;
      if (AIRTABLE_TOKEN) {
        try {
          const installFields = {
            'Installationsstart': `${bookedDate}T${bookedTime}:00.000Z`,
            'Status Installation': 'Termin bestätigt',
            'Aufbau Datum': bookedDate,
            'Allgemeine Bemerkungen': [
              `Telefonische Buchung via Dashboard`,
              `Zeitfenster: ${bookedTime} – ${endTime} Uhr`,
              notes ? `Anmerkung: ${notes}` : '',
            ].filter(Boolean).join('\n'),
          };
          if (akquiseAirtableId) {
            installFields['Akquise'] = [akquiseAirtableId];
          }
          const terminRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblKznpAOAMvEfX8u`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: [{ fields: installFields }] }),
          });
          const terminData = await terminRes.json();
          terminAirtableId = terminData.records?.[0]?.id;
          if (terminAirtableId) {
            await supabaseRequest(`install_bookings?id=eq.${bookingResult.data[0].id}`, {
              method: 'PATCH', body: JSON.stringify({ termin_airtable_id: terminAirtableId }),
            });
          }
        } catch (e) {
          console.error('[install-booker-status] Airtable Installationen create failed:', e.message);
        }
      }

      // Update Akquise Booking Status
      if (AIRTABLE_TOKEN && akquiseAirtableId) {
        try {
          await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AKQUISE_TABLE}/${akquiseAirtableId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Booking Status': 'confirmed' } }),
          });
        } catch (e) {
          console.error('[install-booker-status] Airtable Akquise update failed:', e.message);
        }
      }

      // Activity log for phone/manual booking (fire-and-forget)
      writeActivityLog({
        user_id:             created_by_user_id || null,
        user_name:           created_by_user_name || 'System',
        action:              'booking_created',
        booking_id:          bookingResult.data?.[0]?.id || null,
        akquise_airtable_id: akquiseAirtableId || null,
        location_name:       locationName,
        city,
        source:              'portal',
        detail: { booked_date: bookedDate, booked_time: bookedTime, booking_source: bookingSource || 'phone' },
      });

      logApiCall({
        functionName: 'install-booker-status',
        service: 'supabase',
        method: 'POST',
        endpoint: 'install_bookings (manual)',
        durationMs: Date.now() - apiStart,
        statusCode: 201,
        success: true,
      });

      return new Response(JSON.stringify({
        success: true,
        booking: bookingResult.data[0],
        terminAirtableId,
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-booker-status',
      service: 'supabase',
      method: request.method,
      endpoint: 'install_bookings',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    console.error('[install-booker-status] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Status-Anfrage fehlgeschlagen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
};
