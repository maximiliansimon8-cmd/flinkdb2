/**
 * Netlify Scheduled Function: Install Booker – 22h Reminder
 *
 * Runs every hour. Checks for pending bookings older than 22h
 * that haven't received a reminder yet, and sends a WhatsApp
 * reminder via approved SuperChat template.
 *
 * Logic:
 *   1. Query install_bookings: status=pending, reminder_count=0,
 *      created_at older than 22h (within WA 24h window)
 *   2. For each booking, ensure booking link is set on SC contact
 *   3. Send the approved "install_reminder" WA template
 *   4. Update reminder_sent_at and reminder_count
 *
 * Uses feature flag "install_reminder_enabled" to enable/disable.
 * Respects superchat_test_phone for test mode.
 */

import { logApiCall } from './shared/apiLogger.js';
import { normalizePhone } from './shared/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const BOOKING_BASE_URL = process.env.BOOKING_BASE_URL || 'https://tools.dimension-outdoor.com/book';
const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';

/** Approved WA template for reminders — SuperChat internal tn_ ID */
const REMINDER_TEMPLATE_ID = 'tn_d3S5yQ0A18EQ9mulWgNUb';

/** SuperChat contact attribute IDs */
const SC_BOOKING_LINK_ATTR_ID = 'ca_cb868yUGScrsohM7y2kwv';

/** How many hours to wait before sending reminder (must be < 24 for WA window) */
const REMINDER_DELAY_HOURS = 22;

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

/** Get feature flags for reminder + superchat config */
async function getConfig() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feature_flags?key=in.(superchat_enabled,superchat_test_phone,install_reminder_enabled)&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return { reminderEnabled: false, superchatEnabled: false, testPhone: null };
    const data = await res.json();
    const reminderFlag = data.find(f => f.key === 'install_reminder_enabled');
    const scEnabledFlag = data.find(f => f.key === 'superchat_enabled');
    const testPhoneFlag = data.find(f => f.key === 'superchat_test_phone');
    return {
      reminderEnabled: reminderFlag?.enabled === true,
      superchatEnabled: scEnabledFlag?.enabled === true,
      testPhone: testPhoneFlag?.enabled ? (testPhoneFlag.description || null) : null,
    };
  } catch {
    return { reminderEnabled: false, superchatEnabled: false, testPhone: null };
  }
}

/** Update the Install Booking Link attribute on a SuperChat contact */
async function updateContactBookingLink(phone, bookingUrl) {
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
      console.log(`[install-booker-reminder] No SuperChat contact found for ${phone}`);
      return false;
    }
    const contactId = contacts[0].id;

    // Update booking link attribute
    const updateResult = await superchatRequest(`contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        custom_attributes: [{ id: SC_BOOKING_LINK_ATTR_ID, value: bookingUrl }],
      }),
    });
    console.log(`[install-booker-reminder] Updated booking link on contact ${contactId}: ${updateResult.ok ? 'OK' : 'FAILED'}`);
    return updateResult.ok;
  } catch (e) {
    console.error(`[install-booker-reminder] Contact update failed for ${phone}:`, e.message);
    return false;
  }
}

export default async (req) => {
  const apiStart = Date.now();

  try {
    const { next_run } = await req.json();
    console.log(`[install-booker-reminder] Running. Next invocation: ${next_run}`);

    // 1. Check feature flags
    const config = await getConfig();

    if (!config.reminderEnabled) {
      console.log('[install-booker-reminder] SKIPPED — install_reminder_enabled=false');
      return;
    }

    if (!config.superchatEnabled) {
      console.log('[install-booker-reminder] SKIPPED — superchat_enabled=false');
      return;
    }

    if (!SUPERCHAT_API_KEY) {
      console.log('[install-booker-reminder] SKIPPED — no SUPERCHAT_API_KEY');
      return;
    }

    // 2. Find pending bookings older than 22h with no reminder sent yet
    //    22h ensures we're still within the WA 24h service window from initial invite
    const cutoff = new Date(Date.now() - REMINDER_DELAY_HOURS * 60 * 60 * 1000).toISOString();

    const pendingResult = await supabaseRequest(
      `install_bookings?status=eq.pending&reminder_count=eq.0&whatsapp_sent_at=lt.${cutoff}&whatsapp_sent_at=not.is.null&select=*&order=created_at.asc&limit=20`
    );

    if (!pendingResult.ok) {
      console.error('[install-booker-reminder] Failed to query pending bookings:', pendingResult.status);
      return;
    }

    const pendingBookings = pendingResult.data || [];

    if (pendingBookings.length === 0) {
      console.log('[install-booker-reminder] No pending bookings need reminders.');
      return;
    }

    console.log(`[install-booker-reminder] Found ${pendingBookings.length} bookings needing reminders`);

    const WA_CHANNEL = process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb';
    let sent = 0;
    let failed = 0;

    // 3. Send reminders via approved template
    for (const booking of pendingBookings) {
      if (!booking.contact_phone) {
        console.warn(`[install-booker-reminder] Skipping booking ${booking.id} — no phone number`);
        continue;
      }

      // Test mode: override phone
      const actualPhone = normalizePhone(config.testPhone || booking.contact_phone);
      if (config.testPhone) {
        console.log(`[install-booker-reminder] TEST MODE — redirecting from ${booking.contact_phone} to ${config.testPhone}`);
      }

      try {
        // Ensure booking link is set on the SC contact (template uses contact_attribute)
        const bookingUrl = `${BOOKING_BASE_URL}/${booking.booking_token}`;
        const contactSearchPhone = normalizePhone(booking.contact_phone);
        await updateContactBookingLink(contactSearchPhone, bookingUrl);

        // Extract first name for the static template variable
        const firstName = booking.contact_name ? booking.contact_name.split(' ')[0] : 'Standortinhaber/in';

        // Send the approved template
        // Template "install_reminder" variables:
        //   {{1}} = First name (static — we provide the value)
        //   {{2}} = Install Booking Link (contact_attribute — SC reads from contact, but we also pass value)
        console.log(`[install-booker-reminder] Sending template to ${actualPhone} for ${booking.location_name || booking.id}`);
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
                { position: 2, value: bookingUrl },
              ],
            },
          }),
        });

        console.log(`[install-booker-reminder] Template result: ${sendResult.status} ${sendResult.ok ? 'OK' : 'FAILED'}`);

        // 4. Update booking with reminder tracking
        if (sendResult.ok) {
          await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              reminder_sent_at: new Date().toISOString(),
              reminder_count: 1,
            }),
          });
          sent++;
          console.log(`[install-booker-reminder] ✓ Reminder sent for ${booking.location_name} (${booking.id})`);

          // Activity log: reminder sent (fire-and-forget)
          writeActivityLog({
            user_id:             null,
            user_name:           'WhatsApp Bot',
            action:              'reminder_sent',
            booking_id:          booking.id,
            akquise_airtable_id: booking.akquise_airtable_id || null,
            location_name:       booking.location_name,
            city:                booking.city,
            source:              'bot',
            detail: { template_id: REMINDER_TEMPLATE_ID, reminder_count: 1 },
          });
        } else {
          failed++;
          console.error(`[install-booker-reminder] ✗ Failed for ${booking.location_name} (${booking.id}):`, JSON.stringify(sendResult.data)?.slice(0, 300));

          // Still mark as attempted so we don't retry forever
          await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              reminder_count: 1,
              // Don't set reminder_sent_at so we can distinguish success/failure
            }),
          });
        }
      } catch (e) {
        failed++;
        console.error(`[install-booker-reminder] Error for ${booking.location_name} (${booking.id}):`, e.message);
      }
    }

    console.log(`[install-booker-reminder] Done. Sent: ${sent}, Failed: ${failed}, Total: ${pendingBookings.length}`);

    logApiCall({
      functionName: 'install-booker-reminder',
      service: 'superchat',
      method: 'POST',
      endpoint: 'messages/reminder',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
      metadata: { sent, failed, total: pendingBookings.length },
    });

  } catch (err) {
    console.error('[install-booker-reminder] Fatal error:', err.message);
    logApiCall({
      functionName: 'install-booker-reminder',
      service: 'mixed',
      method: 'SCHEDULED',
      endpoint: 'reminder',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });
  }
};

export const config = {
  schedule: '@hourly',
};
