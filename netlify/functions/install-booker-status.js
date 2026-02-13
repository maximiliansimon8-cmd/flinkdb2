/**
 * Netlify Function: Install Booker – Booking Status & Management
 *
 * Dashboard endpoint for viewing and managing bookings.
 *
 * GET  /api/install-booker/status          → List bookings (filters: city, status, from, to)
 * PATCH /api/install-booker/status/{id}    → Update booking status (confirm, cancel, complete, no_show)
 */

import { getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse } from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';

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

export default async (request, context) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const cors = corsHeaders(origin);
  const url = new URL(request.url);
  const apiStart = Date.now();

  // Extract booking ID from path
  const pathParts = url.pathname
    .replace(/^\/?(\.netlify\/functions\/install-booker-status\/?|api\/install-booker\/status\/?)/, '')
    .split('/').filter(Boolean);
  const bookingId = pathParts[0] || null;

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
        // Support comma-separated statuses
        if (status.includes(',')) {
          query += `&status=in.(${status})`;
        } else {
          query += `&status=eq.${encodeURIComponent(status)}`;
        }
      }
      if (from) query += `&booked_date=gte.${from}`;
      if (to) query += `&booked_date=lte.${to}`;

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
          enrichedData = enrichedData.map(b => ({
            ...b,
            route: b.route_id ? routeMap.get(b.route_id) || null : null,
          }));
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
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── PATCH: Update booking status ──
    if (request.method === 'PATCH' && bookingId) {
      const body = await request.json();
      const { status: newStatus, notes } = body;

      const validStatuses = ['pending', 'booked', 'confirmed', 'cancelled', 'completed', 'no_show'];
      if (newStatus && !validStatuses.includes(newStatus)) {
        return new Response(JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // Get current booking
      const currentResult = await supabaseRequest(`install_bookings?id=eq.${bookingId}&select=*&limit=1`);
      if (!currentResult.ok || !currentResult.data?.length) {
        return new Response(JSON.stringify({ error: 'Booking not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      const currentBooking = currentResult.data[0];
      const updates = {};
      if (newStatus) updates.status = newStatus;
      if (notes !== undefined) updates.notes = notes;

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

      // ── Cancel/No-Show → WhatsApp notification ──
      if (updateResult.ok && (newStatus === 'cancelled' || newStatus === 'no_show') && SUPERCHAT_API_KEY && currentBooking.contact_phone) {
        try {
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
                contactHandle: currentBooking.contact_phone,
                channelType: 'whats_app',
                body: cancelText,
              }),
            });
            console.log(`[install-booker-status] WhatsApp cancel notification sent to ${currentBooking.contact_phone}`);
          }
        } catch (e) {
          console.error('[install-booker-status] WhatsApp cancel notification failed:', e.message);
        }
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
      const { akquiseAirtableId, locationName, city, contactName, contactPhone, jetId, bookedDate, bookedTime, notes, bookingSource } = body;

      if (!city || !bookedDate || !bookedTime) {
        return new Response(JSON.stringify({ error: 'city, bookedDate, and bookedTime are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      // Calculate end time (90 minutes)
      const [h, m] = bookedTime.split(':').map(Number);
      const endMin = m + 90;
      const endTime = `${String(h + Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

      // Find matching route for this city+date
      const routeResult = await supabaseRequest(
        `install_routen?city=eq.${encodeURIComponent(city)}&schedule_date=eq.${bookedDate}&status=eq.open&select=id&limit=1`
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
          status: 'booked',
          booking_source: bookingSource || 'phone',
          booked_at: new Date().toISOString(),
          notes: notes || null,
        }),
      });

      if (!bookingResult.ok) {
        return new Response(JSON.stringify({ error: 'Failed to create booking', details: bookingResult.data }), {
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
            'Status Installation': 'Termin gebucht',
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
            body: JSON.stringify({ fields: { 'Booking Status': 'booked' } }),
          });
        } catch (e) {
          console.error('[install-booker-status] Airtable Akquise update failed:', e.message);
        }
      }

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
      error: err.message,
    });

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
};
