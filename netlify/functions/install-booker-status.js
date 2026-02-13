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
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const AKQUISE_TABLE = 'tblqFMBAeKQ1NbSI8';

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

      // Sync status to Airtable Installations_Termine
      if (updateResult.ok && currentBooking.termin_airtable_id && AIRTABLE_TOKEN) {
        try {
          const atStatusMap = {
            confirmed: 'confirmed',
            cancelled: 'cancelled',
            completed: 'completed',
            no_show: 'no_show',
          };
          if (atStatusMap[newStatus]) {
            await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/Installations_Termine/${currentBooking.termin_airtable_id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: { 'Status': atStatusMap[newStatus] },
              }),
            });
          }
        } catch (e) {
          console.error('[install-booker-status] Airtable Termin update failed:', e.message);
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
