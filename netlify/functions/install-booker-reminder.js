/**
 * Netlify Scheduled Function: Install Booker – Multi-Stage Reminders
 *
 * Runs every hour. Sends up to 3 reminder stages for pending bookings
 * that haven't booked an appointment yet:
 *
 *   Stage 1: After 22h   (within WA 24h window)    — "Erinnerung: Bitte Termin buchen"
 *   Stage 2: After 3 days (from last reminder)      — "Freundliche Erinnerung"
 *   Stage 3: After 7 days (from last reminder)      — "Letzte Erinnerung"
 *
 * Each stage has its own feature flag for gradual rollout.
 * Template IDs are configurable per stage (falls back to stage 1 template).
 *
 * Uses feature flags:
 *   - install_reminder_enabled      (master switch)
 *   - install_reminder_2_enabled    (stage 2)
 *   - install_reminder_3_enabled    (stage 3)
 *   - superchat_enabled             (global WA gate)
 *   - superchat_test_phone          (test mode override)
 */

import { logApiCall } from './shared/apiLogger.js';
import { normalizePhone } from './shared/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPERCHAT_API_KEY = process.env.SUPERCHAT_API_KEY;
const BOOKING_BASE_URL = process.env.BOOKING_BASE_URL || 'https://tools.dimension-outdoor.com/book';
const SUPERCHAT_BASE = 'https://api.superchat.com/v1.0';

/**
 * Multi-stage reminder configuration.
 * Each stage defines:
 *   - count:      The current reminder_count value to match
 *   - delayHours: Minimum hours since last action before sending
 *   - timeField:  Which DB field to check for timing (whatsapp_sent_at or reminder_sent_at)
 *   - templateId: SuperChat template to use (approved WA template)
 *   - featureFlag: Which flag must be enabled (null = uses master switch only)
 *   - label:      Human-readable label for logging
 */
const REMINDER_STAGES = [
  {
    count: 0,
    delayHours: 22,
    timeField: 'whatsapp_sent_at',
    templateId: 'tn_d3S5yQ0A18EQ9mulWgNUb',   // Approved: Erinnerung
    featureFlag: null,                           // Uses master switch
    label: 'Reminder 1 (22h)',
  },
  {
    count: 1,
    delayHours: 72,                              // 3 Tage nach Reminder 1
    timeField: 'reminder_sent_at',
    templateId: 'tn_d3S5yQ0A18EQ9mulWgNUb',   // Same template until new one is approved
    featureFlag: 'install_reminder_2_enabled',
    label: 'Reminder 2 (3 Tage)',
  },
  {
    count: 2,
    delayHours: 168,                             // 7 Tage nach Reminder 2
    timeField: 'reminder_sent_at',
    templateId: 'tn_d3S5yQ0A18EQ9mulWgNUb',   // Same template until new one is approved
    featureFlag: 'install_reminder_3_enabled',
    label: 'Reminder 3 (7 Tage)',
  },
];

/** SuperChat contact attribute IDs */
const SC_BOOKING_LINK_ATTR_ID = 'ca_cb868yUGScrsohM7y2kwv';

/** Max bookings to process per stage per run */
const BATCH_LIMIT = 20;

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
    const flagKeys = [
      'superchat_enabled',
      'superchat_test_phone',
      'install_reminder_enabled',
      'install_reminder_2_enabled',
      'install_reminder_3_enabled',
    ];
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feature_flags?key=in.(${flagKeys.join(',')})&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return { reminderEnabled: false, superchatEnabled: false, testPhone: null, stageFlags: {} };
    const data = await res.json();

    const getFlag = (key) => data.find(f => f.key === key);
    const reminderFlag = getFlag('install_reminder_enabled');
    const scEnabledFlag = getFlag('superchat_enabled');
    const testPhoneFlag = getFlag('superchat_test_phone');

    // Stage-specific flags
    const stageFlags = {};
    for (const stage of REMINDER_STAGES) {
      if (stage.featureFlag) {
        const flag = getFlag(stage.featureFlag);
        stageFlags[stage.featureFlag] = flag?.enabled === true;
      }
    }

    return {
      reminderEnabled: reminderFlag?.enabled === true,
      superchatEnabled: scEnabledFlag?.enabled === true,
      testPhone: testPhoneFlag?.enabled ? (testPhoneFlag.description || null) : null,
      stageFlags,
    };
  } catch {
    return { reminderEnabled: false, superchatEnabled: false, testPhone: null, stageFlags: {} };
  }
}

/** Update the Install Booking Link attribute on a SuperChat contact */
async function updateContactBookingLink(phone, bookingUrl) {
  try {
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

    const updateResult = await superchatRequest(`contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        custom_attributes: [{ id: SC_BOOKING_LINK_ATTR_ID, value: bookingUrl }],
      }),
    });
    return updateResult.ok;
  } catch (e) {
    console.error(`[install-booker-reminder] Contact update failed for ${phone}:`, e.message);
    return false;
  }
}

/**
 * Process a single reminder stage.
 * Returns { sent, failed, skipped }
 */
async function processStage(stage, config) {
  const cutoff = new Date(Date.now() - stage.delayHours * 60 * 60 * 1000).toISOString();
  const WA_CHANNEL = process.env.SUPERCHAT_WA_CHANNEL_ID || 'mc_cy5HABDnpRhRtosxckRzb';

  // Query: status=pending, correct reminder_count, time field older than cutoff
  const query = `install_bookings?status=eq.pending`
    + `&reminder_count=eq.${stage.count}`
    + `&${stage.timeField}=lt.${cutoff}`
    + `&${stage.timeField}=not.is.null`
    + `&select=*&order=created_at.asc&limit=${BATCH_LIMIT}`;

  const result = await supabaseRequest(query);

  if (!result.ok) {
    console.error(`[install-booker-reminder] [${stage.label}] Query failed: ${result.status}`);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const bookings = result.data || [];
  if (bookings.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  console.log(`[install-booker-reminder] [${stage.label}] Found ${bookings.length} bookings`);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const newCount = stage.count + 1;

  for (const booking of bookings) {
    if (!booking.contact_phone) {
      console.warn(`[install-booker-reminder] [${stage.label}] Skipping ${booking.id} — no phone`);
      skipped++;
      continue;
    }

    const actualPhone = normalizePhone(config.testPhone || booking.contact_phone);
    if (config.testPhone) {
      console.log(`[install-booker-reminder] [${stage.label}] TEST MODE — ${booking.contact_phone} → ${config.testPhone}`);
    }

    try {
      // Ensure booking link is set on SC contact
      const bookingUrl = `${BOOKING_BASE_URL}/${booking.booking_token}`;
      const contactSearchPhone = normalizePhone(booking.contact_phone);
      await updateContactBookingLink(contactSearchPhone, bookingUrl);

      const firstName = booking.contact_name ? booking.contact_name.split(' ')[0] : 'Standortinhaber/in';

      // Send template
      const sendResult = await superchatRequest('messages', {
        method: 'POST',
        body: JSON.stringify({
          to: [{ identifier: actualPhone }],
          from: { channel_id: WA_CHANNEL },
          content: {
            type: 'whats_app_template',
            template_id: stage.templateId,
            variables: [
              { position: 1, value: firstName },
              { position: 2, value: bookingUrl },
            ],
          },
        }),
      });

      if (sendResult.ok) {
        await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            reminder_sent_at: new Date().toISOString(),
            reminder_count: newCount,
          }),
        });
        sent++;
        console.log(`[install-booker-reminder] [${stage.label}] ✓ ${booking.location_name} (${booking.id})`);

        writeActivityLog({
          user_name: 'WhatsApp Bot',
          action: 'reminder_sent',
          booking_id: booking.id,
          akquise_airtable_id: booking.akquise_airtable_id || null,
          location_name: booking.location_name,
          city: booking.city,
          source: 'bot',
          detail: { template_id: stage.templateId, reminder_count: newCount, stage: stage.label },
        });
      } else {
        failed++;
        console.error(`[install-booker-reminder] [${stage.label}] ✗ ${booking.location_name}:`, JSON.stringify(sendResult.data)?.slice(0, 300));

        // Mark as attempted so we don't retry forever
        await supabaseRequest(`install_bookings?id=eq.${booking.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ reminder_count: newCount }),
        });
      }
    } catch (e) {
      failed++;
      console.error(`[install-booker-reminder] [${stage.label}] Error for ${booking.location_name}:`, e.message);
    }
  }

  return { sent, failed, skipped };
}

// ═══════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════

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

    // 2. Process each stage
    const totals = { sent: 0, failed: 0, skipped: 0 };

    for (const stage of REMINDER_STAGES) {
      // Check stage-specific feature flag
      if (stage.featureFlag && !config.stageFlags[stage.featureFlag]) {
        console.log(`[install-booker-reminder] [${stage.label}] SKIPPED — ${stage.featureFlag}=false`);
        continue;
      }

      const result = await processStage(stage, config);
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.skipped += result.skipped;

      if (result.sent > 0 || result.failed > 0) {
        console.log(`[install-booker-reminder] [${stage.label}] Done: sent=${result.sent}, failed=${result.failed}`);
      }
    }

    console.log(`[install-booker-reminder] All stages done. Total sent=${totals.sent}, failed=${totals.failed}, skipped=${totals.skipped}`);

    logApiCall({
      functionName: 'install-booker-reminder',
      service: 'superchat',
      method: 'POST',
      endpoint: 'messages/reminder',
      durationMs: Date.now() - apiStart,
      statusCode: 200,
      success: true,
      metadata: totals,
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
