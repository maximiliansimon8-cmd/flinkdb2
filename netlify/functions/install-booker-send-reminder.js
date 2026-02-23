/**
 * Manual Reminder Trigger — Send WhatsApp reminder to all pending bookings
 *
 * GET  /api/install-booker-send-reminder?dryRun=true   → preview list only
 * POST /api/install-booker-send-reminder               → actually send
 * POST /api/install-booker-send-reminder?exclude=id1,id2  → send, skipping specific IDs
 *
 * Uses the approved SuperChat template for reminders.
 * Respects superchat_test_phone for test mode.
 */

import { logApiCall } from './shared/apiLogger.js';
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse, safeErrorResponse,
  normalizePhone,
} from './shared/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const BOOKER_API_KEY = process.env.BOOKER_API_KEY;
const BOOKING_BASE_URL = process.env.BOOKING_BASE_URL || 'https://tools.dimension-outdoor.com/book';
const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';

/** New approved WA template for reminders */
const REMINDER_TEMPLATE_ID = 'install_reminder_23249_1771364853';

/** SuperChat contact attribute IDs */
const SC_BOOKING_LINK_ATTR_ID = 'ca_cb868yUGScrsohM7y2kwv';

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

async function getConfig() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feature_flags?key=in.(superchat_enabled,superchat_test_phone)&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return { superchatEnabled: false, testPhone: null };
    const data = await res.json();
    const scEnabledFlag = data.find(f => f.key === 'superchat_enabled');
    const testPhoneFlag = data.find(f => f.key === 'superchat_test_phone');
    return {
      superchatEnabled: scEnabledFlag?.enabled === true,
      testPhone: testPhoneFlag?.enabled ? (testPhoneFlag.description || null) : null,
    };
  } catch {
    return { superchatEnabled: false, testPhone: null };
  }
}

async function updateContactBookingLink(phone, bookingUrl) {
  try {
    const searchResult = await superchatRequest('contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        query: { value: [{ field: 'phone', operator: '=', value: phone }] },
      }),
    });
    const contacts = searchResult.data?.results || searchResult.data;
    if (!Array.isArray(contacts) || contacts.length === 0) return false;
    const contactId = contacts[0].id;
    const updateResult = await superchatRequest(`contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        custom_attributes: [{ id: SC_BOOKING_LINK_ATTR_ID, value: bookingUrl }],
      }),
    });
    return updateResult.ok;
  } catch {
    return false;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return handlePreflight(req);

  // Auth: Origin check OR API key (for scheduled triggers / Make.com)
  const origin = getAllowedOrigin(req);
  const apiKey = req.headers.get('x-api-key');
  const isApiKeyValid = apiKey && BOOKER_API_KEY && apiKey === BOOKER_API_KEY;

  if (!origin && !isApiKeyValid) return forbiddenResponse();

  const cors = origin ? corsHeaders(origin) : {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Rate limit: max 5 calls per minute
  const clientIP = getClientIP(req);
  const limit = checkRateLimit(`send-reminder:${clientIP}`, 5, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);

  const apiStart = Date.now();
  const url = new URL(req.url);
  const isDryRun = req.method === 'GET' || url.searchParams.get('dryRun') === 'true';
  const excludeIds = (url.searchParams.get('exclude') || '').split(',').filter(Boolean);

  try {
    // Query ALL pending bookings with no reminder sent yet (no 22h filter — manual trigger)
    const pendingResult = await supabaseRequest(
      `install_bookings?status=eq.pending&reminder_count=eq.0&whatsapp_sent_at=not.is.null&select=*&order=whatsapp_sent_at.asc`
    );

    if (!pendingResult.ok) {
      return new Response(JSON.stringify({ error: 'Failed to query bookings' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const allPending = (pendingResult.data || []).filter(b => !excludeIds.includes(b.id));

    // Calculate hours since invite for each booking
    const now = Date.now();
    const bookingList = allPending.map(b => ({
      id: b.id,
      locationName: b.location_name,
      city: b.city,
      contactName: b.contact_name,
      contactPhone: b.contact_phone,
      jetId: b.jet_id,
      bookingToken: b.booking_token,
      whatsappSentAt: b.whatsapp_sent_at,
      hoursSinceInvite: Math.round((now - new Date(b.whatsapp_sent_at).getTime()) / (1000 * 60 * 60) * 10) / 10,
    }));

    // DRY RUN: Just return the list
    if (isDryRun) {
      return new Response(JSON.stringify({
        mode: 'dryRun',
        templateId: REMINDER_TEMPLATE_ID,
        totalRecipients: bookingList.length,
        recipients: bookingList,
      }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // SEND MODE
    const config = await getConfig();

    if (!config.superchatEnabled) {
      return new Response(JSON.stringify({ error: 'SuperChat is disabled (feature flag)' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    if (!SUPERCHAT_API_KEY) {
      return new Response(JSON.stringify({ error: 'No SUPERCHAT_API_KEY configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const WA_CHANNEL = process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb';
    const results = [];

    for (const booking of allPending) {
      if (!booking.contact_phone) {
        results.push({ id: booking.id, location: booking.location_name, status: 'skipped', reason: 'no phone' });
        continue;
      }

      const actualPhone = normalizePhone(config.testPhone || booking.contact_phone);
      const firstName = booking.contact_name ? booking.contact_name.split(' ')[0] : 'Standortinhaber/in';

      try {
        // Ensure booking link is set on SC contact
        const bookingUrl = `${BOOKING_BASE_URL}/${booking.booking_token}`;
        await updateContactBookingLink(normalizePhone(booking.contact_phone), bookingUrl);

        // Send the new template
        const sendResult = await superchatRequest('messages', {
          method: 'POST',
          body: JSON.stringify({
            to: [{ identifier: actualPhone }],
            from: { channel_id: WA_CHANNEL },
            content: {
              type: 'whats_app_template',
              template_id: REMINDER_TEMPLATE_ID,
              variables: [
                { position: 1, value: firstName },
              ],
            },
          }),
        });

        if (sendResult.ok) {
          await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              reminder_sent_at: new Date().toISOString(),
              reminder_count: 1,
            }),
          });
          results.push({ id: booking.id, location: booking.location_name, phone: actualPhone, status: 'sent' });
        } else {
          await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ reminder_count: 1 }),
          });
          results.push({ id: booking.id, location: booking.location_name, status: 'failed', error: JSON.stringify(sendResult.data)?.slice(0, 200) });
        }
      } catch (e) {
        results.push({ id: booking.id, location: booking.location_name, status: 'error', error: e.message });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status !== 'sent').length;

    logApiCall({
      functionName: 'install-booker-send-reminder',
      service: 'superchat',
      method: 'POST',
      endpoint: 'messages/manual-reminder',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
      metadata: { sent, failed, total: allPending.length, templateId: REMINDER_TEMPLATE_ID },
    });

    return new Response(JSON.stringify({
      mode: 'sent',
      templateId: REMINDER_TEMPLATE_ID,
      sent, failed,
      total: allPending.length,
      results,
    }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors },
    });

  } catch (err) {
    console.error('[send-reminder] Error:', err.message);
    return safeErrorResponse(500, 'Fehler beim Versenden der Erinnerungen', origin, err);
  }
};
