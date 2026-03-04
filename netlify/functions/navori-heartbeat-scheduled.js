/**
 * Netlify Scheduled Function: Navori Heartbeat Trigger
 *
 * Runs every hour. During active hours (6:00-23:59 CET),
 * triggers navori-heartbeat-background to fetch display status
 * from the Navori QL API and store in Supabase.
 *
 * Schedule: 0 * * * * (every hour, top of the hour)
 */

const SITE_URL = process.env.URL || 'https://tools.dimension-outdoor.com';

export default async (req) => {
  try {
    const { next_run } = await req.json();

    // Check CET hour — only run 6:00-23:59
    const cetHour = new Date().toLocaleString('en-US', {
      hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin',
    });
    const hour = parseInt(cetHour, 10);

    if (hour < 6) {
      console.log(`[navori-heartbeat-scheduled] SKIPPED — CET hour ${hour} (before 6:00). Next: ${next_run}`);
      return;
    }

    console.log(`[navori-heartbeat-scheduled] Triggering background function (CET hour: ${hour}). Next: ${next_run}`);

    // Fire-and-forget POST to background function
    const res = await fetch(`${SITE_URL}/.netlify/functions/navori-heartbeat-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggered_at: new Date().toISOString(), cet_hour: hour }),
    });

    console.log(`[navori-heartbeat-scheduled] Background trigger response: ${res.status}`);
  } catch (err) {
    console.error('[navori-heartbeat-scheduled] Error:', err.message);
  }
};

export const config = {
  schedule: '0 * * * *',
};
