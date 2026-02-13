/**
 * Netlify Scheduled Function: Vistar Sync (Daily Cron)
 * Calls vistar-sync internally to sync 90 days of data.
 * Runs daily at 03:00 UTC.
 */

import { createClient } from '@supabase/supabase-js';
import { logApiCall, logApiCalls, estimateAirtableCost } from './shared/apiLogger.js';

const VISTAR_PLATFORM = 'https://platform-api.vistarmedia.com';
const VISTAR_TRAFFICKING = 'https://trafficking.vistarmedia.com';

/* ─── Session cache ─── */
let sessionCookie = null;
let sessionExpires = 0;

async function getSession() {
  if (sessionCookie && Date.now() < sessionExpires) return sessionCookie;

  const email = process.env.VISTAR_EMAIL;
  const password = process.env.VISTAR_PASSWORD;
  if (!email || !password) throw new Error('VISTAR_EMAIL/PASSWORD not configured');

  const res = await fetch(`${VISTAR_PLATFORM}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error(`Vistar auth failed: ${res.status}`);

  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/([^;]+)/);
  if (!match) throw new Error('No session cookie');

  sessionCookie = match[1];
  sessionExpires = Date.now() + 7 * 3600 * 1000;
  return sessionCookie;
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export const config = {
  schedule: '0 3 * * *',
};

export default async () => {
  console.log('[vistar-sync-scheduled] Starting daily sync (90 days)...');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VISTAR_EMAIL) {
    console.error('[vistar-sync-scheduled] Missing env vars');
    return;
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  try {
    const cookie = await getSession();

    // Sync exchange report (90 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const body = {
      report_type: 'ssp_exchange',
      timezone: 'Europe/Berlin',
      local_start: startDate.toISOString().slice(0, 10) + 'T00:00:00',
      local_end: endDate.toISOString().slice(0, 10) + 'T23:59:59',
      groups: ['venue', 'date'],
      metrics: ['impressions', 'spots', 'partner_revenue', 'partner_profit', 'partner_eCPM'],
      filters: {},
    };

    const res = await fetch(`${VISTAR_TRAFFICKING}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Exchange report failed: ${res.status} ${errText.slice(0, 200)}`);
    }

    const rawData = await res.json();

    // Transform columnar format
    let rows;
    if (rawData.rows && typeof rawData.rows === 'object' && !Array.isArray(rawData.rows)) {
      const columns = Object.keys(rawData.rows);
      const rowCount = columns.length > 0 ? rawData.rows[columns[0]].length : 0;
      rows = [];
      for (let i = 0; i < rowCount; i++) {
        const row = {};
        for (const col of columns) {
          row[col] = rawData.rows[col][i];
        }
        rows.push(row);
      }
    } else if (Array.isArray(rawData)) {
      rows = rawData;
    } else {
      console.log('[vistar-sync-scheduled] Unexpected format');
      return;
    }

    // Upsert venues
    const venuesSeen = new Map();
    for (const row of rows) {
      const venueId = row.partner_venue_id || row.venue_id;
      const venueName = row.venue_name || row.venue || '';
      if (venueId && !venuesSeen.has(venueId)) venuesSeen.set(venueId, venueName);
    }

    const now = new Date().toISOString();
    const venueBatch = Array.from(venuesSeen).map(([venueId, venueName]) => ({
      id: venueId, partner_venue_id: venueId, name: venueName || venueId,
      is_active: true, synced_at: now,
    }));

    for (let i = 0; i < venueBatch.length; i += 200) {
      const batch = venueBatch.slice(i, i + 200);
      await supabase.from('vistar_venues').upsert(batch, { onConflict: 'id' });
    }

    // Aggregate per venue per day
    const dayVenueMap = new Map();
    for (const row of rows) {
      const venueId = row.partner_venue_id || row.venue_id;
      const rawDate = row.date || '';
      const date = rawDate.split(' ')[0] || rawDate;
      if (!venueId || !date) continue;

      const key = `${venueId}::${date}`;
      if (!dayVenueMap.has(key)) {
        dayVenueMap.set(key, {
          venue_id: venueId, report_date: date,
          spots: 0, impressions: 0, partner_revenue: 0, partner_profit: 0,
          ecpmSum: 0, ecpmCount: 0,
        });
      }
      const agg = dayVenueMap.get(key);
      agg.spots += Number(row.spots) || 0;
      agg.impressions += Number(row.impressions) || 0;
      agg.partner_revenue += Number(row.partner_revenue) || 0;
      agg.partner_profit += Number(row.partner_profit) || 0;
      const ecpm = Number(row.partner_eCPM) || 0;
      if (ecpm > 0) { agg.ecpmSum += ecpm; agg.ecpmCount++; }
    }

    const healthBatch = Array.from(dayVenueMap.values()).map((agg) => ({
      venue_id: agg.venue_id, report_date: agg.report_date,
      is_requesting: agg.spots > 0, requested_spots: agg.spots, spent_spots: agg.spots,
      impressions: Math.round(agg.impressions * 100) / 100,
      partner_revenue: Math.round(agg.partner_revenue * 100) / 100,
      partner_profit: Math.round(agg.partner_profit * 100) / 100,
      partner_ecpm: agg.ecpmCount > 0 ? Math.round((agg.ecpmSum / agg.ecpmCount) * 100) / 100 : 0,
      synced_at: now,
    }));

    let synced = 0;
    for (let i = 0; i < healthBatch.length; i += 200) {
      const batch = healthBatch.slice(i, i + 200);
      const { error } = await supabase.from('vistar_venue_health').upsert(batch, {
        onConflict: 'venue_id,report_date',
      });
      if (!error) synced += batch.length;
    }

    const durationMs = Date.now() - startTime;

    // Log
    await supabase.from('vistar_sync_log').insert({
      sync_type: 'scheduled_90d', status: 'success',
      records_synced: synced, duration_ms: durationMs,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

    logApiCall({
      functionName: 'vistar-sync-scheduled',
      service: 'vistar',
      method: 'POST',
      endpoint: '/report',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: rows.length,
      metadata: { days: 90, venueCount: venueBatch.length, venueHealthRecords: synced },
    });

    logApiCall({
      functionName: 'vistar-sync-scheduled',
      service: 'supabase',
      method: 'POST',
      endpoint: '/upsert-vistar',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: synced,
    });

    console.log(`[vistar-sync-scheduled] Synced ${synced} venue-day records (${rows.length} rows) in ${durationMs}ms`);
  } catch (err) {
    console.error('[vistar-sync-scheduled] Error:', err);
    await supabase.from('vistar_sync_log').insert({
      sync_type: 'scheduled_90d', status: 'error',
      records_synced: 0, error_message: err.message,
      duration_ms: Date.now() - startTime,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

    logApiCall({
      functionName: 'vistar-sync-scheduled',
      service: 'vistar',
      method: 'POST',
      endpoint: '/report',
      durationMs: Date.now() - startTime,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });
  }
};
