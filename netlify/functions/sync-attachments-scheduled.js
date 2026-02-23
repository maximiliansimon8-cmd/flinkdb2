/**
 * Netlify Scheduled Function: Attachment Sync Trigger (every 15 min)
 *
 * Lightweight trigger that delegates to trigger-sync-attachments-background
 * (a Background Function with 15min timeout) for actual processing.
 *
 * WHY: Netlify Scheduled Functions have a 30-second execution limit,
 * but syncing ~5000 attachments from Airtable to Supabase Storage takes minutes.
 * The -background suffix gives us up to 15 min.
 *
 * Full sync: every 4th run (hourly at :00)
 * Incremental: all other runs
 */

export default async () => {
  const startTime = Date.now();
  // Determine mode: every 4th run (~hourly) = full, otherwise incremental
  const runIndex = Math.floor(Date.now() / (15 * 60 * 1000));
  const mode = runIndex % 4 === 0 ? 'full' : 'incremental';

  console.log(`[sync-attachments-scheduled] Triggering ${mode} attachment sync...`);

  try {
    const siteUrl = process.env.URL || 'https://tools.dimension-outdoor.com';
    const res = await fetch(`${siteUrl}/.netlify/functions/trigger-sync-attachments-background`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': siteUrl,
      },
      body: JSON.stringify({
        source: 'scheduled',
        mode,
        triggered_at: new Date().toISOString(),
      }),
    });

    const durationMs = Date.now() - startTime;
    if (res.status === 202) {
      console.log(`[sync-attachments-scheduled] Background sync triggered (${mode}, 202) in ${durationMs}ms`);
    } else {
      const text = await res.text().catch(() => '');
      console.error(`[sync-attachments-scheduled] Trigger failed: ${res.status} ${text.substring(0, 200)}`);
    }
  } catch (err) {
    console.error(`[sync-attachments-scheduled] Failed to trigger: ${err.message}`);
  }
};

export const config = {
  schedule: '*/15 * * * *',
};
