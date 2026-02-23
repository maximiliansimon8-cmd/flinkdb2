/**
 * Netlify Function: Install Booker – Get Available Slots
 *
 * Public endpoint (token-based auth). Called by the booking page.
 * Returns available dates and time slots for a booking token.
 *
 * GET /api/install-booker/slots?token={booking_token}
 */

import { logApiCall } from './shared/apiLogger.js';
import { checkRateLimit, getClientIP } from './shared/security.js';
import { slotsOverlap, normalizeCity, TIME_WINDOWS, getWindowForTime } from './shared/slotUtils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Supabase REST helper */
async function supabaseRequest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PUBLIC_CORS });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  // Rate limiting — public endpoint
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`install-slots:${clientIP}`, 30, 60_000);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)), ...PUBLIC_CORS } }
    );
  }

  const apiStart = Date.now();
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(JSON.stringify({ error: 'token parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  // Validate token format
  if (typeof token !== 'string' || token.length > 100) {
    return new Response(JSON.stringify({ error: 'Ungültiges Token-Format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  try {
    // 1. Look up booking by token
    const bookingResult = await supabaseRequest(
      `install_bookings?booking_token=eq.${encodeURIComponent(token)}&select=*&limit=1`
    );

    if (!bookingResult.ok || !bookingResult.data?.length) {
      return new Response(JSON.stringify({ error: 'invalid_token', message: 'Buchungslink nicht gefunden oder abgelaufen.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const booking = bookingResult.data[0];

    // Check if already booked or not in a bookable state
    // Align with book.js: only 'pending' status allows booking
    if (booking.status !== 'pending') {
      const isBooked = booking.status === 'booked' || booking.status === 'confirmed';
      return new Response(JSON.stringify({
        error: isBooked ? 'already_booked' : 'not_bookable',
        message: isBooked
          ? 'Ihr Termin wurde bereits gebucht.'
          : 'Dieser Buchungslink ist nicht mehr gültig.',
        ...(isBooked && { bookedDate: booking.booked_date, bookedTime: booking.booked_time }),
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // Check for expiration (14 days)
    const createdAt = new Date(booking.created_at);
    const now = new Date();
    const daysSinceCreated = (now - createdAt) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated > 14) {
      return new Response(JSON.stringify({
        error: 'expired',
        message: 'Dieser Buchungslink ist abgelaufen. Bitte kontaktieren Sie uns für einen neuen Link.',
      }), {
        status: 410,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // 2. Get available routes for this city
    //    Use ilike with wildcard to match city name variants
    //    e.g. "Frankfurt" matches "Frankfurt am Main" and vice versa
    const today = new Date().toISOString().split('T')[0];
    const cityBase = normalizeCity(booking.city);
    const routesResult = await supabaseRequest(
      `install_routen?city=ilike.${encodeURIComponent(cityBase)}*&schedule_date=gte.${today}&status=eq.open&order=schedule_date.asc`
    );

    if (!routesResult.ok || !routesResult.data?.length) {
      return new Response(JSON.stringify({
        error: 'no_slots',
        message: 'Aktuell sind keine Termine verfügbar. Wir informieren Sie, sobald neue Termine freigeschaltet werden.',
        locationName: booking.location_name,
        city: booking.city,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // 3. Aggregate slots from ALL routes per day (supports multiple teams per city/day)
    const routes = routesResult.data;

    // Group routes by date — multiple teams can serve the same city on the same day
    const routesByDate = {};
    for (const route of routes) {
      const d = route.schedule_date;
      if (!routesByDate[d]) routesByDate[d] = [];
      routesByDate[d].push(route);
    }

    // Get ALL booked times for this city in one query (more efficient than per-route)
    // Use ilike to match city name variants
    const allBookedResult = await supabaseRequest(
      `install_bookings?city=ilike.${encodeURIComponent(cityBase)}*&status=in.(booked,confirmed)&select=booked_date,booked_time,route_id`
    );
    const allBooked = allBookedResult.data || [];

    const availableDates = [];

    for (const [date, dateRoutes] of Object.entries(routesByDate)) {
      // Bookings for this date
      const dayBookings = allBooked.filter(b => b.booked_date === date);
      const dayBookedTimes = dayBookings.map(b => b.booked_time);

      // Collect all unique time slots from ALL routes on this date
      // Track which route offers each slot for assignment during booking
      const slotMap = new Map(); // time → { routeIds: [], available: bool }

      for (const route of dateRoutes) {
        // Count bookings specifically assigned to this route
        const routeBookings = dayBookings.filter(b => b.route_id === route.id);
        const routeBookedCount = routeBookings.length;
        const routeHasCapacity = routeBookedCount < route.max_capacity;

        if (!routeHasCapacity) continue; // This route is full for the day

        // Robust time_slots parsing (handles double-encoded JSON strings)
        let timeSlots = [];
        try {
          if (Array.isArray(route.time_slots)) {
            timeSlots = route.time_slots;
          } else if (typeof route.time_slots === 'string') {
            let parsed = JSON.parse(route.time_slots);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            timeSlots = Array.isArray(parsed) ? parsed : [];
          }
        } catch (e) {
          console.error(`[install-booker-slots] Failed to parse time_slots for route ${route.id}:`, e.message);
          timeSlots = [];
        }

        // Collect booked start times for this route to check overlaps
      const routeBookedTimes = routeBookings.map(b => b.booked_time);

      for (const time of timeSlots) {
          // Check if this slot overlaps with any existing booking (90min duration + 30min buffer)
          if (slotsOverlap(time, routeBookedTimes)) continue;

          if (!slotMap.has(time)) {
            slotMap.set(time, { routeIds: [], available: true });
          }
          // This time slot is available on this route
          slotMap.get(time).routeIds.push(route.id);
        }
      }

      // Convert slotMap to sorted array
      const slots = [...slotMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, info]) => ({
          time,
          available: true,
          routeId: info.routeIds[0], // Primary route for booking assignment
        }));

      if (slots.length > 0) {
        // Build time windows summary — group slots by window
        const windows = Object.entries(TIME_WINDOWS).map(([key, w]) => {
          const windowSlots = slots.filter(s => getWindowForTime(s.time) === key);
          return {
            key,
            label: w.label,
            range: `${w.start}–${w.end}`,
            rangeLabel: w.rangeLabel,
            available: windowSlots.length > 0,
            slotCount: windowSlots.length,
          };
        });

        availableDates.push({
          date,
          slots,
          windows,
          // Include all route IDs for this date (for booking assignment)
          routeIds: dateRoutes.map(r => r.id),
        });
      }
    }

    // Sort by date
    availableDates.sort((a, b) => a.date.localeCompare(b.date));

    logApiCall({
      functionName: 'install-booker-slots',
      service: 'supabase',
      method: 'GET',
      endpoint: 'slots',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
    });

    return new Response(JSON.stringify({
      locationName: booking.location_name,
      city: booking.city,
      contactName: booking.contact_name,
      availableDates,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=30, stale-while-revalidate=60',
        ...PUBLIC_CORS,
      },
    });

  } catch (err) {
    logApiCall({
      functionName: 'install-booker-slots',
      service: 'supabase',
      method: 'GET',
      endpoint: 'slots',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    console.error('[install-booker-slots] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Slot-Abfrage fehlgeschlagen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }
};
