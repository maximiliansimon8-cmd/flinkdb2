/**
 * Netlify Scheduled Function: Sync Trigger (every 5 min)
 *
 * This is a lightweight scheduled function that triggers the actual sync
 * via trigger-sync-background (a Netlify Background Function with 15min timeout).
 *
 * WHY: Netlify Scheduled Functions have a 30-second execution limit,
 * but our full sync of 14+ Airtable tables takes several minutes.
 * The Background Function suffix (-background) gives us up to 15 min.
 *
 * Flow: Netlify Cron → sync-airtable (this file, 30s limit)
 *         → HTTP call to trigger-sync-background (15min limit)
 *           → actual Airtable/Supabase sync (incremental via LAST_MODIFIED_TIME)
 */

export default async () => {
  const startTime = Date.now();
  console.log('[sync-airtable] Scheduled trigger fired, calling trigger-sync-background...');

  try {
    // Get site URL from environment (Netlify provides this automatically)
    const siteUrl = process.env.URL || 'https://tools.dimension-outdoor.com';

    // Call the background function — it returns 202 immediately and runs async
    const res = await fetch(`${siteUrl}/.netlify/functions/trigger-sync-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': siteUrl,
      },
      body: JSON.stringify({ source: 'scheduled', triggered_at: new Date().toISOString() }),
    });

    const durationMs = Date.now() - startTime;

    if (res.status === 202) {
      console.log(`[sync-airtable] Background sync triggered successfully (202) in ${durationMs}ms`);
    } else {
      const text = await res.text().catch(() => '');
      console.error(`[sync-airtable] Background sync trigger failed: ${res.status} ${text.substring(0, 200)}`);
    }
  } catch (err) {
    console.error(`[sync-airtable] Failed to trigger background sync: ${err.message}`);
  }
};

// Netlify Scheduled Function config — every 5 minutes
export const config = {
  schedule: '*/5 * * * *',
};
