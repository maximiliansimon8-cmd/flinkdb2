/**
 * Netlify Function: Vistar → Supabase Sync
 *
 * Fetches data from Vistar SSP APIs and syncs to Supabase tables.
 * Triggered via cron or manual call: /api/vistar-sync?type=all|networks|report
 *
 * Environment variables:
 *   VISTAR_EMAIL, VISTAR_PASSWORD – API credentials
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY – Supabase admin access
 */

import { createClient } from '@supabase/supabase-js';
import { logApiCall, logApiCalls, estimateAirtableCost } from './shared/apiLogger.js';
import { checkRateLimit, getClientIP } from './shared/security.js';

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
  if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL not configured');
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/* ─── Sync: Networks ─── */
async function syncNetworks(supabase) {
  const cookie = await getSession();
  const res = await fetch(`${VISTAR_PLATFORM}/networks`, {
    headers: { Cookie: cookie },
  });

  if (!res.ok) throw new Error(`Networks fetch failed: ${res.status}`);
  const data = await res.json();
  const networks = data.networks || data || [];

  if (!Array.isArray(networks)) {
    console.log('[vistar-sync] Networks response:', JSON.stringify(data).slice(0, 500));
    return 0;
  }

  for (const net of networks) {
    await supabase.from('vistar_networks').upsert({
      id: net.id,
      name: net.name,
      api_key: net.api_key || null,
      raw_data: net,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  console.log(`[vistar-sync] Synced ${networks.length} networks`);
  return networks.length;
}

/* ─── Sync: Exchange Report (SSP programmatic data per venue per day) ─── */
async function syncExchangeReport(supabase, days = 7) {
  const cookie = await getSession();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

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

  // Transform columnar format to row-based
  // Vistar returns: { rows: { col1: [...], col2: [...] }, aggregations: {...} }
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
    console.log(`[vistar-sync] Transformed ${rowCount} rows from columnar format`);
  } else if (Array.isArray(rawData)) {
    rows = rawData;
  } else {
    console.log('[vistar-sync] Unexpected report format:', JSON.stringify(rawData).slice(0, 500));
    return 0;
  }

  // First ensure all venues exist in vistar_venues
  const venuesSeen = new Map();
  for (const row of rows) {
    const venueId = row.partner_venue_id || row.venue_id;
    const venueName = row.venue_name || row.venue || '';
    if (venueId && !venuesSeen.has(venueId)) {
      venuesSeen.set(venueId, venueName);
    }
  }

  // Batch upsert venues (minimal record)
  const now = new Date().toISOString();
  const venueBatch = Array.from(venuesSeen).map(([venueId, venueName]) => ({
    id: venueId,
    partner_venue_id: venueId,
    name: venueName || venueId,
    is_active: true,
    synced_at: now,
  }));

  // Upsert venues in batches of 200
  for (let i = 0; i < venueBatch.length; i += 200) {
    const batch = venueBatch.slice(i, i + 200);
    const { error } = await supabase.from('vistar_venues').upsert(batch, { onConflict: 'id' });
    if (error) console.error('[vistar-sync] Venue batch error:', error.message);
  }
  console.log(`[vistar-sync] Upserted ${venueBatch.length} venues`);

  // Aggregate per venue per day
  const dayVenueMap = new Map();
  for (const row of rows) {
    const venueId = row.partner_venue_id || row.venue_id;
    // Date comes as "2026-02-04 00:00:00" — extract YYYY-MM-DD
    const rawDate = row.date || '';
    const date = rawDate.split(' ')[0] || rawDate;
    if (!venueId || !date) continue;

    const key = `${venueId}::${date}`;
    if (!dayVenueMap.has(key)) {
      dayVenueMap.set(key, {
        venue_id: venueId,
        report_date: date,
        spots: 0,
        impressions: 0,
        partner_revenue: 0,
        partner_profit: 0,
        ecpmSum: 0,
        ecpmCount: 0,
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

  // Batch upsert health records (batches of 200)
  const healthBatch = Array.from(dayVenueMap.values()).map((agg) => ({
    venue_id: agg.venue_id,
    report_date: agg.report_date,
    is_requesting: agg.spots > 0,
    requested_spots: agg.spots,
    spent_spots: agg.spots,
    impressions: Math.round(agg.impressions * 100) / 100,
    partner_revenue: Math.round(agg.partner_revenue * 100) / 100,
    partner_profit: Math.round(agg.partner_profit * 100) / 100,
    partner_ecpm: agg.ecpmCount > 0
      ? Math.round((agg.ecpmSum / agg.ecpmCount) * 100) / 100
      : 0,
    synced_at: now,
  }));

  let synced = 0;
  for (let i = 0; i < healthBatch.length; i += 200) {
    const batch = healthBatch.slice(i, i + 200);
    const { error } = await supabase.from('vistar_venue_health').upsert(batch, {
      onConflict: 'venue_id,report_date',
    });
    if (error) {
      console.error(`[vistar-sync] Health batch error (batch ${i}):`, error.message);
    } else {
      synced += batch.length;
    }
  }

  console.log(`[vistar-sync] Synced ${synced} venue-day records from ${rows.length} report rows`);
  return synced;
}

/* ─── Log sync result ─── */
async function logSync(supabase, syncType, status, count, startTime, errorMsg) {
  await supabase.from('vistar_sync_log').insert({
    sync_type: syncType,
    status,
    records_synced: count,
    error_message: errorMsg || null,
    duration_ms: Date.now() - startTime,
    started_at: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
  });
}

/* ─── Main handler ─── */
export default async (request) => {
  const url = new URL(request.url);
  const syncType = url.searchParams.get('type') || 'all';
  const days = parseInt(url.searchParams.get('days') || '90', 10);

  // ── Auth: require SYNC_SECRET via header only (not query param — leaks in logs) ──
  const SYNC_SECRET = process.env.SYNC_SECRET;
  if (SYNC_SECRET) {
    const headerKey = request.headers.get('x-sync-key');
    if (headerKey !== SYNC_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Rate limiting ──
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`vistar-sync:${clientIP}`, 5, 60_000);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[vistar-sync] SUPABASE_SERVICE_ROLE_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Server-Konfigurationsfehler' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = getSupabase();
  const startTime = Date.now();
  let totalRecords = 0;
  const results = {};

  try {
    if (syncType === 'all' || syncType === 'networks') {
      const count = await syncNetworks(supabase);
      totalRecords += count;
      results.networks = count;
      await logSync(supabase, 'networks', 'success', count, startTime);
    }

    if (syncType === 'all' || syncType === 'report') {
      const count = await syncExchangeReport(supabase, days);
      totalRecords += count;
      results.report = count;
      await logSync(supabase, 'report', 'success', count, startTime);
    }

    const durationMs = Date.now() - startTime;

    logApiCall({
      functionName: 'vistar-sync',
      service: 'vistar',
      method: 'POST',
      endpoint: '/report',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalRecords,
      metadata: { syncType, days, ...results },
    });

    logApiCall({
      functionName: 'vistar-sync',
      service: 'supabase',
      method: 'POST',
      endpoint: '/upsert-vistar',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalRecords,
    });

    return new Response(
      JSON.stringify({
        success: true,
        records_synced: totalRecords,
        results,
        duration_ms: durationMs,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[vistar-sync] Error:', err);
    await logSync(supabase, syncType, 'error', 0, startTime, err.message);

    logApiCall({
      functionName: 'vistar-sync',
      service: 'vistar',
      method: 'POST',
      endpoint: '/report',
      durationMs: Date.now() - startTime,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    return new Response(
      JSON.stringify({ success: false, error: 'Vistar-Sync fehlgeschlagen' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
