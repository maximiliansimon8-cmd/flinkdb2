/**
 * Netlify Function: Install Booker – Get Available Slots
 *
 * Public endpoint (token-based auth). Called by the booking page.
 * Returns available dates and time slots for a booking token.
 *
 * GET /api/install-booker/slots?token={booking_token}
 */

import { logApiCall } from './shared/apiLogger.js';

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

  const apiStart = Date.now();
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response(JSON.stringify({ error: 'token parameter required' }), {
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

    // Check if already booked
    if (booking.status === 'booked' || booking.status === 'confirmed') {
      return new Response(JSON.stringify({
        error: 'already_booked',
        message: 'Ihr Termin wurde bereits gebucht.',
        bookedDate: booking.booked_date,
        bookedTime: booking.booked_time,
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
    const today = new Date().toISOString().split('T')[0];
    const routesResult = await supabaseRequest(
      `install_routen?city=eq.${encodeURIComponent(booking.city)}&schedule_date=gte.${today}&status=eq.open&order=schedule_date.asc`
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

    // 3. For each route, count existing bookings to determine remaining capacity
    const routes = routesResult.data;
    const availableDates = [];

    for (const route of routes) {
      // Count booked slots for this date in this city
      const bookedResult = await supabaseRequest(
        `install_bookings?city=eq.${encodeURIComponent(route.city)}&booked_date=eq.${route.schedule_date}&status=in.(booked,confirmed)&select=booked_time`
      );

      const bookedTimes = (bookedResult.data || []).map(b => b.booked_time);
      const timeSlots = Array.isArray(route.time_slots) ? route.time_slots : JSON.parse(route.time_slots || '[]');

      // Count bookings per time slot
      const slots = timeSlots.map(time => {
        const bookedCount = bookedTimes.filter(t => t === time).length;
        // Each time slot can have max 1 booking (1 installation per slot)
        return {
          time,
          available: bookedCount === 0,
        };
      });

      // Also check total capacity
      const totalBooked = bookedTimes.length;
      const hasCapacity = totalBooked < route.max_capacity;

      if (hasCapacity && slots.some(s => s.available)) {
        availableDates.push({
          date: route.schedule_date,
          routeId: route.id,
          installerTeam: route.installer_team,
          slots: slots.filter(s => s.available),
        });
      }
    }

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
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
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
      error: err.message,
    });

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }
};
