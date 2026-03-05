/**
 * Vistar SSP Service – FlinkDB2 — Dimension Outdoor DOOH Dashboard
 *
 * Primary: reads from Supabase (vistar_venue_health) – fast, no API auth needed.
 * Fallback: calls Vistar API via Netlify proxy (/api/vistar/*).
 *
 * Key data per venue:
 *   - impressions (estimated views)
 *   - spots (ad plays)
 *   - partner_revenue (gross revenue)
 *   - partner_profit (net revenue)
 *   - partner_eCPM
 */

import { supabase } from './authService';

const VISTAR_BASE = '/api/vistar';

/* ─── Cache ─── */
const cache = {
  supabaseHealth: null,
  supabaseHealthTimestamp: null,
  exchangeReport: null,
  exchangeReportTimestamp: null,
};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Normalize a venue/serial ID by removing all spaces.
 * Navori Serial Numbers have spaces: "0131E - 6EAD5 - 5DF76 - ..."
 * Vistar partner_venue_ids don't: "0131E-6EAD5-5DF76-..."
 */
function normalizeVenueId(id) {
  return id ? id.replace(/\s+/g, '') : '';
}

/* ═══════════════════════════════════════════
   SUPABASE READS (primary data source)
   ═══════════════════════════════════════════ */

/**
 * Fetch venue health data from Supabase for a given venue and date range.
 * Returns array of daily records: { venue_id, report_date, impressions, ... }
 */
export async function fetchVenueHealthFromSupabase(venueId, startDate, endDate) {
  if (!venueId) return null;

  try {
    const { data, error } = await supabase
      .from('vistar_venue_health')
      .select('*') // All health metrics needed for venue detail view
      .eq('venue_id', venueId)
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date', { ascending: true })
      .limit(400);

    if (error) {
      console.warn('[vistarService] Supabase health query error:', error.message);
      return null;
    }

    return data && data.length > 0 ? data : null;
  } catch (err) {
    console.warn('[vistarService] Supabase health fetch error:', err);
    return null;
  }
}

/**
 * Extract the display ID from a Vistar venue_name.
 * e.g. "DO-GER-BER-WD-55-362-25 | BurgeesSmashburger" → "DO-GER-BER-WD-55-362-25"
 */
function extractDisplayIdFromVenueName(venueName) {
  if (!venueName) return null;
  // Split on " | " or just take the first DO-GER-... pattern
  const parts = venueName.split('|');
  const candidate = (parts[0] || '').trim();
  // Must look like a display ID: starts with DO-GER or DM- or similar
  if (candidate.match(/^[A-Z]{2}-/)) return candidate;
  return null;
}

/**
 * Fetch all venue health data from Supabase for a date range.
 * Returns Map keyed by displayId (extracted from venue name) → aggregated stats.
 */
export async function fetchAllVenueHealthFromSupabase(startDate, endDate) {
  const cacheKey = `${startDate}_${endDate}`;
  if (
    cache.supabaseHealth &&
    cache.supabaseHealthTimestamp &&
    cache.supabaseHealthTimestamp.key === cacheKey &&
    Date.now() - cache.supabaseHealthTimestamp.ts < CACHE_TTL
  ) {
    return cache.supabaseHealth;
  }

  try {
    // First: load venue lookup (venue id → name with displayId)
    const { data: venues, error: venueErr } = await supabase
      .from('vistar_venues')
      .select('id, name, partner_venue_id');

    // Build lookup: venue table id → { displayId, venueName, partnerVenueId }
    const venueNameMap = new Map();
    if (venues) {
      for (const v of venues) {
        const displayId = extractDisplayIdFromVenueName(v.name);
        venueNameMap.set(v.id, {
          displayId: displayId || null,
          venueName: v.name || '',
          partnerVenueId: v.partner_venue_id || v.id,
        });
      }
    }
    console.log(`[vistarService] Loaded ${venueNameMap.size} venues from vistar_venues`);

    // Then: load health data
    const { data, error } = await supabase
      .from('vistar_venue_health')
      .select('venue_id,report_date,impressions,requested_spots,partner_revenue,partner_profit,partner_ecpm,is_requesting')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date', { ascending: true })
      .limit(50000);

    if (error || !data || data.length === 0) {
      console.warn('[vistarService] No health data found for', startDate, '–', endDate, error?.message);
      return null;
    }

    // Aggregate per venue, keyed by venueId (the Vistar UUID)
    const venueMap = new Map();
    for (const row of data) {
      const vid = row.venue_id;
      const venueInfo = venueNameMap.get(vid);
      const displayId = venueInfo?.displayId || null;
      const venueName = venueInfo?.venueName || '';

      // Use venueId (UUID) as primary key for aggregation to avoid collisions
      if (!venueMap.has(vid)) {
        venueMap.set(vid, {
          venueId: vid,
          displayId,
          venueName,
          totalImpressions: 0,
          totalSpots: 0,
          totalRevenue: 0,
          totalProfit: 0,
          ecpmSum: 0,
          ecpmCount: 0,
          dailyData: [],
          activeDays: 0,
        });
      }
      const entry = venueMap.get(vid);
      entry.totalImpressions += Number(row.impressions) || 0;
      entry.totalSpots += Number(row.requested_spots) || 0;
      entry.totalRevenue += Number(row.partner_revenue) || 0;
      entry.totalProfit += Number(row.partner_profit) || 0;
      const ecpm = Number(row.partner_ecpm) || 0;
      if (ecpm > 0) { entry.ecpmSum += ecpm; entry.ecpmCount++; }
      if (row.is_requesting) entry.activeDays++;
      entry.dailyData.push({
        date: row.report_date,
        impressions: Number(row.impressions) || 0,
        spots: Number(row.requested_spots) || 0,
        revenue: Number(row.partner_revenue) || 0,
        profit: Number(row.partner_profit) || 0,
      });
    }

    // Finalize — key by venueId (UUID), displayId (DO-ID), AND partner_venue_id
    const result = new Map();
    let uniqueVenues = 0;
    venueMap.forEach((entry) => {
      uniqueVenues++;
      const record = {
        venueId: entry.venueId,
        displayId: entry.displayId,
        venueName: entry.venueName,
        totalImpressions: Math.round(entry.totalImpressions),
        totalSpots: entry.totalSpots,
        totalRevenue: Math.round(entry.totalRevenue * 100) / 100,
        totalProfit: Math.round(entry.totalProfit * 100) / 100,
        avgECPM: entry.ecpmCount > 0
          ? Math.round((entry.ecpmSum / entry.ecpmCount) * 100) / 100
          : 0,
        dailyData: entry.dailyData,
        activeDays: entry.activeDays,
      };

      // Key 1: venueId (UUID like 6859B-64CF2-73F60-...)
      result.set(entry.venueId, record);

      // Key 2: displayId (DO-GER-BER-WD-55-362-25) if available
      if (entry.displayId) {
        result.set(entry.displayId, record);
      }

      // Key 3: partner_venue_id from vistar_venues (might differ from id)
      const venueInfo = venueNameMap.get(entry.venueId);
      if (venueInfo?.partnerVenueId && venueInfo.partnerVenueId !== entry.venueId) {
        result.set(venueInfo.partnerVenueId, record);
      }
    });

    cache.supabaseHealth = result;
    cache.supabaseHealthTimestamp = { key: cacheKey, ts: Date.now() };
    console.log(`[vistarService] Supabase health: ${uniqueVenues} unique venues, ${result.size} lookup keys, ${data.length} rows`);
    return result;
  } catch (err) {
    console.warn('[vistarService] Supabase all-venue health error:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════
   VISTAR API (fallback / direct calls)
   ═══════════════════════════════════════════ */

/**
 * Run an SSP Exchange report grouped by venue + date for the given date range.
 * Returns raw array of { venue, partner_venue_id, date, impressions, spots, partner_revenue, ... }
 */
export async function fetchExchangeReport(startDate, endDate) {
  const cacheKey = `${startDate}_${endDate}`;
  if (
    cache.exchangeReport &&
    cache.exchangeReportTimestamp &&
    cache.exchangeReportTimestamp.key === cacheKey &&
    Date.now() - cache.exchangeReportTimestamp.ts < CACHE_TTL
  ) {
    return cache.exchangeReport;
  }

  const body = {
    report_type: 'ssp_exchange',
    timezone: 'Europe/Berlin',
    local_start: `${startDate}T00:00:00`,
    local_end: `${endDate}T23:59:59`,
    groups: ['venue', 'date'],
    metrics: [
      'impressions',
      'spots',
      'partner_revenue',
      'partner_profit',
      'partner_eCPM',
    ],
    filters: {},
  };

  try {
    const res = await fetch(`${VISTAR_BASE}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[vistarService] Exchange report error:', res.status, errText);
      return null;
    }

    const data = await res.json();
    cache.exchangeReport = data;
    cache.exchangeReportTimestamp = { key: cacheKey, ts: Date.now() };
    console.log(`[vistarService] Exchange report: ${Array.isArray(data) ? data.length : '?'} rows`);
    return data;
  } catch (err) {
    console.error('[vistarService] Exchange report fetch error:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════
   HIGH-LEVEL API (Supabase first → API fallback)
   ═══════════════════════════════════════════ */

/**
 * Fetch Vistar data for a single display/venue.
 * Tries bulk cache first, then Supabase direct query, then API fallback.
 *
 * @param {string} venueId – The Navori serial number / Vistar partner_venue_id
 * @param {string} startDate – YYYY-MM-DD
 * @param {string} endDate   – YYYY-MM-DD
 */
export async function fetchSingleVenueReport(venueId, startDate, endDate) {
  if (!venueId) return null;

  // Normalize: Navori serialNumbers have spaces ("0131E - 6EAD5 - ..."), Vistar IDs don't
  const normalizedId = normalizeVenueId(venueId);

  // Try 1: Check if bulk data is already cached (from ProgrammaticDashboard)
  if (cache.supabaseHealth && cache.supabaseHealth.size > 0) {
    const cached = cache.supabaseHealth.get(normalizedId) || cache.supabaseHealth.get(venueId);
    if (cached && cached.dailyData?.length > 0) {
      // Filter dailyData to requested date range and transform
      return cached.dailyData
        .filter(d => d.date >= startDate && d.date <= endDate)
        .map(d => ({
          partner_venue_id: cached.venueId,
          date: d.date,
          impressions: d.impressions || 0,
          spots: d.spots || 0,
          partner_revenue: d.revenue || 0,
          partner_profit: d.profit || 0,
          partner_eCPM: cached.avgECPM || 0,
        }));
    }
  }

  // Try 2: Direct Supabase query by venue_id (try normalized first)
  const supabaseData = await fetchVenueHealthFromSupabase(normalizedId, startDate, endDate)
    || (normalizedId !== venueId ? await fetchVenueHealthFromSupabase(venueId, startDate, endDate) : null);
  if (supabaseData) {
    return supabaseData.map(row => ({
      partner_venue_id: row.venue_id,
      date: row.report_date,
      impressions: Number(row.impressions) || 0,
      spots: Number(row.requested_spots) || 0,
      partner_revenue: Number(row.partner_revenue) || 0,
      partner_profit: Number(row.partner_profit) || 0,
      partner_eCPM: Number(row.partner_ecpm) || 0,
    }));
  }

  // Try 3: Look up venue by partner_venue_id in vistar_venues table
  try {
    const { data: venueMatch } = await supabase
      .from('vistar_venues')
      .select('id')
      .eq('partner_venue_id', venueId)
      .limit(1)
      .single();
    if (venueMatch?.id && venueMatch.id !== venueId) {
      const altData = await fetchVenueHealthFromSupabase(venueMatch.id, startDate, endDate);
      if (altData) {
        return altData.map(row => ({
          partner_venue_id: row.venue_id,
          date: row.report_date,
          impressions: Number(row.impressions) || 0,
          spots: Number(row.requested_spots) || 0,
          partner_revenue: Number(row.partner_revenue) || 0,
          partner_profit: Number(row.partner_profit) || 0,
          partner_eCPM: Number(row.partner_ecpm) || 0,
        }));
      }
    }
  } catch { /* venue not found, continue to API fallback */ }

  // Fallback: direct API call via proxy
  const body = {
    report_type: 'ssp_exchange',
    timezone: 'Europe/Berlin',
    local_start: `${startDate}T00:00:00`,
    local_end: `${endDate}T23:59:59`,
    groups: ['venue', 'date'],
    metrics: [
      'impressions',
      'spots',
      'partner_revenue',
      'partner_profit',
      'partner_eCPM',
    ],
    filters: {
      partner_venue_id: [venueId],
    },
  };

  try {
    const res = await fetch(`${VISTAR_BASE}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
}

/**
 * Fetch combined venue performance data.
 * Tries Supabase first, falls back to direct API calls.
 *
 * @param {string} startDate – YYYY-MM-DD
 * @param {string} endDate   – YYYY-MM-DD
 * @returns {Map<string, Object>} partner_venue_id → aggregated stats
 */
export async function fetchVenuePerformance(startDate, endDate) {
  // Try Supabase first
  const supabaseResult = await fetchAllVenueHealthFromSupabase(startDate, endDate);
  if (supabaseResult && supabaseResult.size > 0) {
    return supabaseResult;
  }

  // Fallback: direct API call
  const exchangeData = await fetchExchangeReport(startDate, endDate);
  if (!exchangeData || !Array.isArray(exchangeData)) return new Map();

  const venueMap = new Map();
  for (const row of exchangeData) {
    const venueId = row.partner_venue_id || '';
    const venueName = row.venue_name || row.venue || '';
    if (!venueId && !venueName) continue;

    const key = venueId || venueName;
    if (!venueMap.has(key)) {
      venueMap.set(key, {
        venueId,
        venueName,
        totalImpressions: 0,
        totalSpots: 0,
        totalRevenue: 0,
        totalProfit: 0,
        ecpmSum: 0,
        ecpmCount: 0,
        dailyData: [],
        activeDays: new Set(),
      });
    }

    const entry = venueMap.get(key);
    const impressions = Number(row.impressions) || 0;
    const spots = Number(row.spots) || 0;
    const revenue = Number(row.partner_revenue) || 0;
    const profit = Number(row.partner_profit) || 0;
    const ecpm = Number(row.partner_eCPM) || 0;
    const date = row.date || '';

    entry.totalImpressions += impressions;
    entry.totalSpots += spots;
    entry.totalRevenue += revenue;
    entry.totalProfit += profit;
    if (ecpm > 0) { entry.ecpmSum += ecpm; entry.ecpmCount++; }
    if (date && spots > 0) entry.activeDays.add(date);
    entry.dailyData.push({ date, impressions, spots, revenue, profit });

    if (venueName && !entry.venueName) entry.venueName = venueName;
    if (venueId && !entry.venueId) entry.venueId = venueId;
  }

  const result = new Map();
  venueMap.forEach((entry, key) => {
    result.set(key, {
      venueId: entry.venueId,
      venueName: entry.venueName,
      totalImpressions: Math.round(entry.totalImpressions),
      totalSpots: entry.totalSpots,
      totalRevenue: Math.round(entry.totalRevenue * 100) / 100,
      totalProfit: Math.round(entry.totalProfit * 100) / 100,
      avgECPM: entry.ecpmCount > 0
        ? Math.round((entry.ecpmSum / entry.ecpmCount) * 100) / 100
        : 0,
      dailyData: entry.dailyData.sort((a, b) => (a.date || '').localeCompare(b.date || '')),
      activeDays: entry.activeDays.size,
    });
  });

  return result;
}

/**
 * Fetch networks list from Vistar.
 */
export async function fetchNetworks() {
  try {
    const res = await fetch(`${VISTAR_BASE}/networks`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
