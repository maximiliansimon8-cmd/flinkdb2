/**
 * Netlify Function: Install Monteur – WhatsApp Status Messages
 *
 * Sends WhatsApp notifications to customers on behalf of monteur.
 * Five actions: on_the_way, delay, reschedule, cancel, complete.
 * The "complete" action marks the installation as done (status → completed) without sending WhatsApp.
 *
 * POST /api/install-monteur/status
 * Body: { token, team, date, bookingId, action: 'on_the_way'|'delay'|'reschedule'|'cancel'|'complete', delayMinutes? }
 *
 * Auth: Supabase JWT (persistent login) OR HMAC token (legacy links)
 *
 * SAFETY: Messages are NEVER auto-sent. The monteur must explicitly trigger each message.
 */

import { logApiCall } from './shared/apiLogger.js';
import { checkRateLimit, getClientIP } from './shared/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';
const WA_CHANNEL = process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb';
const MONTEUR_SECRET = process.env.MONTEUR_SECRET;
if (!MONTEUR_SECRET) console.error('[install-monteur-status] CRITICAL: MONTEUR_SECRET not configured!');
/** WA template for "Auf dem Weg" — SuperChat internal tn_ ID
 * NOTE: Template status is "submitted" (pending Meta approval). Until approved, template sends will fail
 * and the function falls back to text messages instead. */
const ON_THE_WAY_TEMPLATE_ID = process.env.SUPERCHAT_ON_THE_WAY_TEMPLATE_ID || 'tn_zzfvOxMPZiB3wpwAxC9hD';

const PUBLIC_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Validate HMAC token (constant-time comparison to prevent timing attacks) */
async function validateToken(token, team, date) {
  if (!MONTEUR_SECRET) return false;
  const crypto = await import('node:crypto');
  const expected = crypto.createHmac('sha256', MONTEUR_SECRET)
    .update(`${team}|${date}`)
    .digest('hex')
    .substring(0, 16);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Authenticate monteur via Supabase JWT.
 * Returns { authenticated, team, date } on success.
 */
async function authenticateMonteurJWT(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false };
  }
  const jwtToken = authHeader.replace('Bearer ', '');
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'apikey': SUPABASE_KEY,
      },
    });
    if (!authRes.ok) return { authenticated: false };
    const authUser = await authRes.json();

    // Fetch monteur profile
    const profileRes = await supabaseRequest(
      `app_users?auth_id=eq.${authUser.id}&select=id,name,installer_team,active&limit=1`
    );
    if (!profileRes.ok || !profileRes.data?.length) return { authenticated: false };

    const profile = profileRes.data[0];
    if (!profile.active || !profile.installer_team) return { authenticated: false };

    return {
      authenticated: true,
      team: profile.installer_team,
      date: new Date().toISOString().split('T')[0],
    };
  } catch {
    return { authenticated: false };
  }
}

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

/** SuperChat API helper */
async function superchatRequest(path, options = {}) {
  const res = await fetch(`${SUPERCHAT_BASE}/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': SUPERCHAT_API_KEY,
      ...options.headers,
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Message templates for text-based actions (plain text, no WhatsApp template needed).
 * "on_the_way" uses an approved Meta template instead (sent separately).
 */
const MESSAGES = {
  on_the_way: (contactName) =>
    `Hallo ${contactName || 'Guten Tag'},\n\nunser Installationsteam ist jetzt auf dem Weg zu Ihnen. Wir sind voraussichtlich innerhalb der nächsten 60 Minuten bei Ihnen.\n\nBitte stellen Sie sicher, dass der Zugang zum Schaufenster / Montageort frei ist.\n\nIhr Dimension Outdoor Installations-Team`,

  delay: (contactName, delayMinutes) =>
    `Hallo ${contactName || 'Guten Tag'},\n\nunser Installationsteam hat leider eine Verzögerung. Wir kommen ca. ${delayMinutes || 30} Minuten später als geplant.\n\nVielen Dank für Ihr Verständnis.\n\nIhr Dimension Outdoor Installations-Team`,

  reschedule: (contactName) =>
    `Hallo ${contactName || 'Guten Tag'},\n\nleider müssen wir Ihren heutigen Installationstermin verschieben. Wir melden uns in Kürze mit einem neuen Termin bei Ihnen.\n\nWir bitten um Entschuldigung für die Unannehmlichkeiten.\n\nIhr Dimension Outdoor Installations-Team`,

  cancel: (contactName) =>
    `Hallo ${contactName || 'Guten Tag'},\n\nleider müssen wir Ihren heutigen Installationstermin absagen. Wir melden uns schnellstmöglich bei Ihnen, um einen Ersatztermin zu vereinbaren.\n\nWir bitten vielmals um Entschuldigung.\n\nIhr Dimension Outdoor Installations-Team`,
};

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

  // Rate limiting — strict for WhatsApp sends
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`monteur-status:${clientIP}`, 10, 60_000);
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)), ...PUBLIC_CORS } }
    );
  }

  const apiStart = Date.now();

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  const { token, team: bodyTeam, date: bodyDate, bookingId, action, delayMinutes } = body;

  // Validate required fields (bookingId + action always required)
  if (!bookingId || !action) {
    return new Response(JSON.stringify({ error: 'bookingId and action are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  // Validate action
  if (!['on_the_way', 'delay', 'reschedule', 'cancel', 'complete'].includes(action)) {
    return new Response(JSON.stringify({ error: 'action must be on_the_way, delay, reschedule, cancel, or complete' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }

  // Dual auth: JWT first, then HMAC fallback
  let authenticated = false;

  // Try JWT auth
  const jwtAuth = await authenticateMonteurJWT(request);
  if (jwtAuth.authenticated) {
    authenticated = true;
  }

  // Fallback: HMAC token auth
  if (!authenticated) {
    if (!token || !bodyTeam || !bodyDate) {
      return new Response(JSON.stringify({ error: 'Authentifizierung erforderlich. Bitte einloggen oder gültigen Link verwenden.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
    const isValid = await validateToken(token, bodyTeam, bodyDate);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }
    authenticated = true;
  }

  try {
    // 1. Get the booking
    const bookingResult = await supabaseRequest(
      `install_bookings?id=eq.${encodeURIComponent(bookingId)}&select=*&limit=1`
    );

    if (!bookingResult.ok || !bookingResult.data?.length) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    const booking = bookingResult.data[0];

    // 2. Handle "complete" action — no WhatsApp, just status transition
    if (action === 'complete') {
      const timestamp = new Date().toISOString();
      const existingNotes = booking.notes || '';
      const logEntry = `[${timestamp}] Monteur: Installation abgeschlossen`;
      const updatedNotes = existingNotes ? `${existingNotes}\n${logEntry}` : logEntry;

      const patchRes = await supabaseRequest(
        `install_bookings?id=eq.${bookingId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'completed',
            notes: updatedNotes,
          }),
        }
      );

      if (!patchRes.ok) {
        console.error('[install-monteur-status] Failed to mark complete:', JSON.stringify(patchRes.data)?.slice(0, 500));
        return new Response(JSON.stringify({ error: 'Status-Update fehlgeschlagen' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
        });
      }

      // Log to booking_activity_log
      await supabaseRequest('booking_activity_log', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: bookingId,
          action: 'completed',
          details: `Installation abgeschlossen (Monteur)`,
          actor: 'monteur',
        }),
      });

      logApiCall({
        functionName: 'install-monteur-status',
        service: 'supabase',
        method: 'PATCH',
        endpoint: 'install_bookings/complete',
        durationMs: Date.now() - apiStart,
        statusCode: 200,
        success: true,
      });

      return new Response(JSON.stringify({
        success: true,
        action: 'complete',
        message: `Installation "${booking.location_name || booking.id}" als abgeschlossen markiert.`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // 3. Check if booking has a phone number (required for WhatsApp actions)
    if (!booking.contact_phone) {
      return new Response(JSON.stringify({
        error: 'no_phone',
        message: 'Kein Telefonnummer für diesen Standort hinterlegt.',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // 3. Check SuperChat is configured
    if (!SUPERCHAT_API_KEY) {
      return new Response(JSON.stringify({
        error: 'service_unavailable',
        message: 'WhatsApp-Nachrichtenversand ist momentan nicht konfiguriert.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

    // 4. Build message + normalize phone
    const contactName = booking.contact_name || '';
    const firstName = contactName ? contactName.split(' ')[0] : '';

    let phone = (booking.contact_phone || '').replace(/[^+\d]/g, '');
    if (phone.startsWith('0')) {
      phone = '+49' + phone.slice(1);
    } else if (!phone.startsWith('+')) {
      phone = '+49' + phone;
    }

    // 5. Send WhatsApp message via SuperChat
    let scRes;
    if (action === 'on_the_way' && ON_THE_WAY_TEMPLATE_ID) {
      // "Auf dem Weg" uses an approved Meta template (works outside 24h window)
      // Template "install_on_the_way" has 1 variable: {{1}} = First name
      console.log(`[install-monteur-status] Sending on_the_way template to ${phone} for ${booking.location_name || booking.id}`);
      scRes = await superchatRequest('messages', {
        method: 'POST',
        body: JSON.stringify({
          to: [{ identifier: phone }],
          from: { channel_id: WA_CHANNEL },
          content: {
            type: 'whats_app_template',
            template_id: ON_THE_WAY_TEMPLATE_ID,
            variables: [
              { position: 1, value: firstName || 'Standortinhaber/in' },
            ],
          },
        }),
      });
    } else {
      // Other actions (delay, reschedule, cancel) or on_the_way without template: send as plain text
      const message = MESSAGES[action](contactName, delayMinutes);
      scRes = await superchatRequest('messages', {
        method: 'POST',
        body: JSON.stringify({
          to: [{ identifier: phone }],
          from: { channel_id: WA_CHANNEL },
          content: { type: 'text', body: message },
        }),
      });
    }

    const success = scRes.ok;

    // 6. Log the action in the booking notes
    const timestamp = new Date().toISOString();
    const actionLabels = { on_the_way: 'Auf dem Weg', delay: 'Verspätung', reschedule: 'Verschiebung', cancel: 'Absage', complete: 'Abgeschlossen' };
    const logEntry = `[${timestamp}] Monteur: ${actionLabels[action]}${action === 'delay' ? ` (${delayMinutes || 30} Min.)` : ''} — WA ${success ? 'gesendet' : 'fehlgeschlagen'}`;

    // Append to existing notes
    const existingNotes = booking.notes || '';
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${logEntry}`
      : logEntry;

    await supabaseRequest(
      `install_bookings?id=eq.${bookingId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ notes: updatedNotes }),
      }
    );

    logApiCall({
      functionName: 'install-monteur-status',
      service: 'superchat',
      method: 'POST',
      endpoint: `status/${action}`,
      durationMs: Date.now() - apiStart,
      statusCode: success ? 200 : 502,
      success,
    });

    if (success) {
      return new Response(JSON.stringify({
        success: true,
        action,
        message: `${actionLabels[action]}-Nachricht an ${booking.contact_name || booking.location_name} gesendet.`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    } else {
      console.error(`[install-monteur-status] SuperChat send failed:`, JSON.stringify(scRes.data)?.slice(0, 500));
      return new Response(JSON.stringify({
        success: false,
        error: 'send_failed',
        message: 'WhatsApp-Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es erneut.',
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
      });
    }

  } catch (err) {
    logApiCall({
      functionName: 'install-monteur-status',
      service: 'superchat',
      method: 'POST',
      endpoint: `status/${action}`,
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    console.error('[install-monteur-status] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Status-Aktion fehlgeschlagen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...PUBLIC_CORS },
    });
  }
};
