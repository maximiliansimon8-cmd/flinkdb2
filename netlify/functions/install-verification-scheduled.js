/**
 * Netlify Scheduled Function: Install Verification Trigger (every 6 hours)
 *
 * Lightweight scheduled trigger that delegates to
 * install-verification-background (Background Function, 15min timeout).
 *
 * Checks feature flag before triggering to avoid unnecessary invocations.
 *
 * Cron: 0 */6 * * * (every 6 hours: 00:00, 06:00, 12:00, 18:00 UTC)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async () => {
  const startTime = Date.now();
  console.log('[install-verification-scheduled] Trigger fired...');

  try {
    // Quick feature flag check before triggering background function
    if (SUPABASE_URL && SUPABASE_KEY) {
      const flagRes = await fetch(
        `${SUPABASE_URL}/rest/v1/feature_flags?key=eq.install_verification_enabled&select=enabled&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      if (flagRes.ok) {
        const flags = await flagRes.json();
        if (!flags[0]?.enabled) {
          console.log('[install-verification-scheduled] SKIPPED — install_verification_enabled=false');
          return;
        }
      }
    }

    const siteUrl = process.env.URL || 'https://tools.dimension-outdoor.com';
    const res = await fetch(`${siteUrl}/.netlify/functions/install-verification-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': siteUrl,
      },
      body: JSON.stringify({ source: 'scheduled', triggered_at: new Date().toISOString() }),
    });

    const durationMs = Date.now() - startTime;
    if (res.status === 202) {
      console.log(`[install-verification-scheduled] Background triggered (202) in ${durationMs}ms`);
    } else {
      const text = await res.text().catch(() => '');
      console.error(`[install-verification-scheduled] Trigger failed: ${res.status} ${text.substring(0, 200)}`);
    }
  } catch (err) {
    console.error(`[install-verification-scheduled] Error: ${err.message}`);
  }
};

export const config = {
  schedule: '0 */6 * * *',
};
