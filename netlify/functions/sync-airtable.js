/**
 * Netlify Function: Full Data Sync → Supabase
 *
 * Syncs ALL data sources to Supabase (read cache):
 *   1. Airtable: Stammdaten, Tasks, Installationen, Activity Log
 *   2. Google Sheets: Display Heartbeat/Status data
 *
 * Can be triggered:
 *   - Manually via GET /api/sync (with sync-key header)
 *   - Scheduled via Netlify Scheduled Functions (every 15 min)
 *
 * Environment variables needed:
 *   - AIRTABLE_TOKEN
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SYNC_SECRET (optional, for manual trigger auth)
 */

import { logApiCall, logApiCalls, estimateAirtableCost } from './shared/apiLogger.js';
import { AIRTABLE_BASE, TABLES, FETCH_FIELDS, SHEET_CSV_URL } from './shared/airtableFields.js';
import {
  mapStammdaten, mapDisplay, mapTask, mapAcquisition, mapDaynScreen,
  mapInstallation, mapOpsInventory, mapSimInventory, mapDisplayInventory,
  mapChgApproval, mapHardwareSwap, mapDeinstall, mapCommunication,
} from './shared/airtableMappers.js';

// Local aliases for backward compat (used in fetchAllAirtable calls below)
const STAMMDATEN_TABLE = TABLES.STAMMDATEN;
const DISPLAYS_TABLE = TABLES.DISPLAYS;
const TASKS_TABLE = TABLES.TASKS;
const INSTALLATIONEN_TABLE = TABLES.INSTALLATIONEN;
const ACTIVITY_LOG_TABLE = TABLES.ACTIVITY_LOG;
const DAYN_SCREENS_TABLE = TABLES.DAYN_SCREENS;
const OPS_INVENTORY_TABLE = TABLES.OPS_INVENTORY;
const SIM_INVENTORY_TABLE = TABLES.SIM_INVENTORY;
const DISPLAY_INVENTORY_TABLE = TABLES.DISPLAY_INVENTORY;
const CHG_APPROVAL_TABLE = TABLES.CHG_APPROVAL;
const DEINSTALL_TABLE = TABLES.DEINSTALL;
const HARDWARE_SWAP_TABLE = TABLES.HARDWARE_SWAP;

/**
 * Fetch all records from an Airtable table (paginated).
 */
async function fetchAllAirtable(token, tableId, fields) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let allRecords = [];
  let offset = null;

  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      console.error(`Airtable error: ${res.status}`);
      break;
    }
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);

  return allRecords;
}

/**
 * Upsert records to Supabase via REST API (in batches of 500).
 * If a batch fails due to unknown/incompatible columns, automatically strips
 * the offending column(s) and retries (up to 3 times per batch).
 */
async function upsertToSupabase(supabaseUrl, serviceKey, table, rows) {
  const batchSize = 500;
  let upserted = 0;
  const columnsToStrip = new Set();

  for (let i = 0; i < rows.length; i += batchSize) {
    let batch = rows.slice(i, i + batchSize);

    // Strip any columns that failed in previous batches
    if (columnsToStrip.size > 0) {
      batch = batch.map(row => {
        const cleaned = { ...row };
        columnsToStrip.forEach(col => delete cleaned[col]);
        return cleaned;
      });
    }

    // Retry loop: handles multiple bad columns (one detected per attempt)
    let success = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(batch),
      });

      if (res.ok) {
        upserted += batch.length;
        success = true;
        break;
      }

      const errText = await res.text();

      // Detect "column X does not exist" or type mismatch errors
      const colMatch = errText.match(/column\s+"?([^"]+)"?\s+(?:of relation|does not exist)/i) ||
                        errText.match(/Could not find.*column\s+'([^']+)'/i);
      if (colMatch && res.status === 400 && attempt < 3) {
        const badCol = colMatch[1];
        columnsToStrip.add(badCol);
        console.warn(`[sync] Column "${badCol}" incompatible in "${table}" — stripping and retrying (attempt ${attempt + 2}). Run sql/fix-tasks-missing-columns.sql to fix permanently.`);
        batch = batch.map(row => {
          const cleaned = { ...row };
          columnsToStrip.forEach(col => delete cleaned[col]);
          return cleaned;
        });
        continue; // retry with stripped column
      }

      // Non-recoverable error
      console.error(`Supabase upsert error (${table}): ${res.status} ${errText.substring(0, 300)}`);
      break;
    }
  }

  if (columnsToStrip.size > 0) {
    console.warn(`[sync] Stripped columns from "${table}" upsert: ${[...columnsToStrip].join(', ')}`);
  }

  return upserted;
}

/**
 * Remove Supabase records whose airtable_id is NOT in the given set.
 * This cleans up records that were deleted directly in Airtable.
 */
async function deleteOrphansFromSupabase(supabaseUrl, serviceKey, table, validAirtableIds) {
  if (!validAirtableIds.length) return 0;

  try {
    // Fetch all airtable_ids from Supabase
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=airtable_id`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });

    if (!res.ok) {
      console.error(`[sync] Failed to fetch ${table} airtable_ids: ${res.status}`);
      return 0;
    }

    const supabaseRows = await res.json();
    const supabaseIds = supabaseRows.map(r => r.airtable_id).filter(Boolean);
    const validSet = new Set(validAirtableIds);
    const orphanIds = supabaseIds.filter(id => !validSet.has(id));

    if (orphanIds.length === 0) return 0;

    // Delete orphans in batches
    let deleted = 0;
    const batchSize = 50;
    for (let i = 0; i < orphanIds.length; i += batchSize) {
      const batch = orphanIds.slice(i, i + batchSize);
      const idsParam = batch.map(id => `"${id}"`).join(',');
      const delRes = await fetch(
        `${supabaseUrl}/rest/v1/${table}?airtable_id=in.(${idsParam})`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
          },
        }
      );
      if (delRes.ok) {
        deleted += batch.length;
      } else {
        console.error(`[sync] Delete orphans error (${table}): ${delRes.status}`);
      }
    }

    if (deleted > 0) {
      console.log(`[sync] Deleted ${deleted} orphaned records from ${table}`);
    }
    return deleted;
  } catch (err) {
    console.error(`[sync] deleteOrphans error (${table}):`, err.message);
    return 0;
  }
}

/**
 * Insert rows into Supabase (for heartbeats – append-only, no upsert).
 * Uses ON CONFLICT DO NOTHING via the Prefer header.
 */
async function insertToSupabase(supabaseUrl, serviceKey, table, rows) {
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Supabase insert error (${table}): ${res.status} ${errText.substring(0, 200)}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/* ═══════════════════════════════════════════════
   MAPPER FUNCTIONS: imported from shared/airtableMappers.js
   ═══════════════════════════════════════════════ */



/* ═══════════════════════════════════════════════
   DATE PARSER: German DD.MM.YYYY HH:MM → ISO 8601
   ═══════════════════════════════════════════════ */

function parseGermanDateToISO(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  // DD.MM.YYYY HH:MM
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, d, m, y, h, min] = match;
    const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  // DD.MM.YYYY (no time)
  const matchDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDate) {
    const [, d, m, y] = matchDate;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  // ISO 8601
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}T/)) {
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/* ═══════════════════════════════════════════════
   CSV PARSER (simple, no external deps)
   ═══════════════════════════════════════════════ */

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current.trim());
  return result;
}

/* ═══════════════════════════════════════════════
   MAIN HANDLER
   ═══════════════════════════════════════════════ */

export default async (request) => {
  const startTime = Date.now();

  // Auth check for manual trigger
  const syncSecret = process.env.SYNC_SECRET;
  if (syncSecret) {
    const providedKey = request.headers.get('x-sync-key') ||
      new URL(request.url).searchParams.get('key');
    if (providedKey !== syncSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!AIRTABLE_TOKEN || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-airtable] Missing required environment variables');
    return new Response(JSON.stringify({ error: 'Server-Konfigurationsfehler' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = {};

  try {
    // ═══ 1. GOOGLE SHEETS → display_heartbeats ═══
    console.log('[sync] Fetching Google Sheets CSV...');
    try {
      const csvRes = await fetch(SHEET_CSV_URL, {
        headers: { 'User-Agent': 'JET-Dashboard-Sync/1.0' },
      });
      if (csvRes.ok) {
        const csvText = await csvRes.text();
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const colIdx = {};
        headers.forEach((h, i) => { colIdx[h] = i; });

        const heartbeatRows = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = parseCSVLine(line);
          const displayId = cols[colIdx['Display ID']] || '';
          const timestamp = cols[colIdx['Timestamp']] || '';
          if (!displayId || !timestamp) continue;

          const slashIdx = displayId.indexOf('/');
          const stableId = slashIdx >= 0 ? displayId.substring(0, slashIdx).trim() : displayId.trim();

          heartbeatRows.push({
            timestamp: timestamp || null,
            timestamp_parsed: parseGermanDateToISO(timestamp),
            display_id: stableId,
            raw_display_id: displayId,
            location_name: cols[colIdx['Location Name']] || null,
            serial_number: cols[colIdx['Serial Number']] || null,
            registration_date: cols[colIdx['Date']] || null,
            heartbeat: cols[colIdx['Status']] || null,
            is_alive: cols[colIdx['Is Alive']] || null,
            display_status: cols[colIdx['Display Status']] || null,
            last_online_date: cols[colIdx['Last Online Date']] || null,
            days_offline: cols[colIdx['Days Offline']] ? parseInt(cols[colIdx['Days Offline']]) || null : null,
          });
        }

        results.heartbeats = {
          fetched: heartbeatRows.length,
          inserted: await insertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'display_heartbeats', heartbeatRows),
        };
        console.log(`[sync] Heartbeats: ${results.heartbeats.fetched} fetched, ${results.heartbeats.inserted} inserted`);
      } else {
        console.error(`[sync] Google Sheets error: ${csvRes.status}`);
        results.heartbeats = { error: `HTTP ${csvRes.status}` };
      }
    } catch (sheetErr) {
      console.error('[sync] Sheets error:', sheetErr.message);
      results.heartbeats = { error: sheetErr.message };
    }

    // ═══ 2. AIRTABLE: Stammdaten ═══
    console.log('[sync] Fetching Stammdaten...');
    const stammdatenRecords = await fetchAllAirtable(AIRTABLE_TOKEN, STAMMDATEN_TABLE, FETCH_FIELDS.stammdaten);
    const stammdatenRows = stammdatenRecords.map(mapStammdaten);
    results.stammdaten = {
      fetched: stammdatenRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'stammdaten', stammdatenRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'stammdaten', stammdatenRecords.map(r => r.id)),
    };
    console.log(`[sync] Stammdaten: ${results.stammdaten.fetched} → ${results.stammdaten.upserted} upserted, ${results.stammdaten.deleted} orphans deleted`);

    // ═══ 2b. AIRTABLE: Live Display Locations (Displays) ═══
    console.log('[sync] Fetching Live Display Locations...');
    const displayRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DISPLAYS_TABLE, FETCH_FIELDS.displays);
    const displayRows = displayRecords.map(mapDisplay);
    results.displays = {
      fetched: displayRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'airtable_displays', displayRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'airtable_displays', displayRecords.map(r => r.id)),
    };
    console.log(`[sync] Displays: ${results.displays.fetched} → ${results.displays.upserted} upserted, ${results.displays.deleted} orphans deleted`);

    // ═══ 3. AIRTABLE: Tasks (with expanded lookup fields) ═══
    console.log('[sync] Fetching Tasks...');
    const taskRecords = await fetchAllAirtable(AIRTABLE_TOKEN, TASKS_TABLE, FETCH_FIELDS.tasks);
    const taskRows = taskRecords.map(mapTask);
    results.tasks = {
      fetched: taskRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'tasks', taskRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'tasks', taskRecords.map(r => r.id)),
    };
    console.log(`[sync] Tasks: ${results.tasks.fetched} → ${results.tasks.upserted} upserted, ${results.tasks.deleted} orphans deleted`);

    // ═══ 3b. AIRTABLE: Acquisition_DB ═══
    console.log('[sync] Fetching Acquisition_DB...');
    const acqRecords = await fetchAllAirtable(AIRTABLE_TOKEN, TABLES.ACQUISITION, FETCH_FIELDS.acquisition);
    const acqRows = acqRecords.map(mapAcquisition);
    results.acquisition = {
      fetched: acqRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'acquisition', acqRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'acquisition', acqRecords.map(r => r.id)),
    };
    console.log(`[sync] Acquisition: ${results.acquisition.fetched} → ${results.acquisition.upserted} upserted, ${results.acquisition.deleted} orphans deleted`);

    // ═══ 3b. AIRTABLE: Dayn Screens ═══
    console.log('[sync] Fetching Dayn Screens...');
    const daynRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DAYN_SCREENS_TABLE, FETCH_FIELDS.daynScreens);
    const daynRows = daynRecords.map(mapDaynScreen);
    results.dayn_screens = {
      fetched: daynRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'dayn_screens', daynRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'dayn_screens', daynRecords.map(r => r.id)),
    };
    console.log(`[sync] Dayn Screens: ${results.dayn_screens.fetched} → ${results.dayn_screens.upserted} upserted, ${results.dayn_screens.deleted} orphans deleted`);

    // ═══ 4. AIRTABLE: Installationen ═══
    console.log('[sync] Fetching Installationen...');
    const installRecords = await fetchAllAirtable(AIRTABLE_TOKEN, INSTALLATIONEN_TABLE, FETCH_FIELDS.installationen);
    const installRows = installRecords.map(mapInstallation);
    results.installationen = {
      fetched: installRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'installationen', installRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'installationen', installRecords.map(r => r.id)),
    };
    console.log(`[sync] Installationen: ${results.installationen.fetched} → ${results.installationen.upserted} upserted, ${results.installationen.deleted} orphans deleted`);

    // ═══ 5. HARDWARE: OPS Player Inventory ═══
    console.log('[sync] Fetching OPS Player Inventory...');
    const opsRecords = await fetchAllAirtable(AIRTABLE_TOKEN, OPS_INVENTORY_TABLE, FETCH_FIELDS.opsInventory);
    const opsRows = opsRecords.map(mapOpsInventory);
    results.hardware_ops = {
      fetched: opsRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_ops', opsRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_ops', opsRecords.map(r => r.id)),
    };
    console.log(`[sync] OPS Inventory: ${results.hardware_ops.fetched} → ${results.hardware_ops.upserted} upserted, ${results.hardware_ops.deleted} orphans deleted`);

    // ═══ 6. HARDWARE: SIM Card Inventory ═══
    console.log('[sync] Fetching SIM Card Inventory...');
    const simRecords = await fetchAllAirtable(AIRTABLE_TOKEN, SIM_INVENTORY_TABLE, FETCH_FIELDS.simInventory);
    const simRows = simRecords.map(mapSimInventory);
    results.hardware_sim = {
      fetched: simRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_sim', simRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_sim', simRecords.map(r => r.id)),
    };
    console.log(`[sync] SIM Inventory: ${results.hardware_sim.fetched} → ${results.hardware_sim.upserted} upserted, ${results.hardware_sim.deleted} orphans deleted`);

    // ═══ 7. HARDWARE: Display Inventory ═══
    console.log('[sync] Fetching Display Inventory...');
    const dispInvRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DISPLAY_INVENTORY_TABLE, FETCH_FIELDS.displayInventory);
    const dispInvRows = dispInvRecords.map(mapDisplayInventory);
    results.hardware_displays = {
      fetched: dispInvRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_displays', dispInvRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_displays', dispInvRecords.map(r => r.id)),
    };
    console.log(`[sync] Display Inventory: ${results.hardware_displays.fetched} → ${results.hardware_displays.upserted} upserted, ${results.hardware_displays.deleted} orphans deleted`);

    // ═══ 8. HARDWARE: CHG Approval (Leasing) ═══
    console.log('[sync] Fetching CHG Approval...');
    const chgRecords = await fetchAllAirtable(AIRTABLE_TOKEN, CHG_APPROVAL_TABLE, FETCH_FIELDS.chgApproval);
    const chgRows = chgRecords.map(mapChgApproval);
    results.chg_approvals = {
      fetched: chgRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'chg_approvals', chgRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'chg_approvals', chgRecords.map(r => r.id)),
    };
    console.log(`[sync] CHG Approval: ${results.chg_approvals.fetched} → ${results.chg_approvals.upserted} upserted, ${results.chg_approvals.deleted} orphans deleted`);

    // ═══ 9. HARDWARE: Hardware Swaps ═══
    console.log('[sync] Fetching Hardware Swaps...');
    try {
      const swapRecords = await fetchAllAirtable(AIRTABLE_TOKEN, HARDWARE_SWAP_TABLE, FETCH_FIELDS.hardwareSwap);
      const swapRows = swapRecords.map(mapHardwareSwap);
      results.hardware_swaps = {
        fetched: swapRecords.length,
        upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_swaps', swapRows),
        deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_swaps', swapRecords.map(r => r.id)),
      };
      console.log(`[sync] Hardware Swaps: ${results.hardware_swaps.fetched} → ${results.hardware_swaps.upserted} upserted`);
    } catch (e) {
      console.warn('[sync] Hardware Swaps table not ready yet:', e.message);
      results.hardware_swaps = { fetched: 0, upserted: 0, error: e.message };
    }

    // ═══ 10. HARDWARE: Deinstallationen ═══
    console.log('[sync] Fetching Deinstallationen...');
    try {
      const deinstRecords = await fetchAllAirtable(AIRTABLE_TOKEN, DEINSTALL_TABLE, FETCH_FIELDS.deinstall);
      const deinstRows = deinstRecords.map(mapDeinstall);
      results.hardware_deinstalls = {
        fetched: deinstRecords.length,
        upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_deinstalls', deinstRows),
        deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'hardware_deinstalls', deinstRecords.map(r => r.id)),
      };
      console.log(`[sync] Deinstallationen: ${results.hardware_deinstalls.fetched} → ${results.hardware_deinstalls.upserted} upserted`);
    } catch (e) {
      console.warn('[sync] Deinstallationen table not ready yet:', e.message);
      results.hardware_deinstalls = { fetched: 0, upserted: 0, error: e.message };
    }

    // ═══ 11. AIRTABLE: Activity Log / Communications ═══
    console.log('[sync] Fetching Activity Log...');
    const commRecords = await fetchAllAirtable(AIRTABLE_TOKEN, ACTIVITY_LOG_TABLE, FETCH_FIELDS.communications);
    const commRows = commRecords.map(mapCommunication);
    results.communications = {
      fetched: commRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'communications', commRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'communications', commRecords.map(r => r.id)),
    };
    console.log(`[sync] Communications: ${results.communications.fetched} → ${results.communications.upserted} upserted, ${results.communications.deleted} orphans deleted`);

    const durationMs = Date.now() - startTime;
    console.log(`[sync] Complete in ${(durationMs / 1000).toFixed(1)}s`);

    // Summarize totals for API usage logging
    const tableKeys = Object.keys(results);
    const totalFetched = tableKeys.reduce((sum, k) => sum + (results[k]?.fetched || 0), 0);
    const totalUpserted = tableKeys.reduce((sum, k) => sum + (results[k]?.upserted || results[k]?.inserted || 0), 0);

    logApiCall({
      functionName: 'sync-airtable',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-all',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalFetched,
      estimatedCostCents: estimateAirtableCost(totalFetched),
      metadata: { tablesProcessed: tableKeys.length, totalRecords: totalFetched },
    });

    logApiCall({
      functionName: 'sync-airtable',
      service: 'supabase',
      method: 'POST',
      endpoint: '/upsert-all',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalUpserted,
    });

    return new Response(JSON.stringify({
      success: true,
      duration_ms: durationMs,
      results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[sync] Error:', err);

    logApiCall({
      functionName: 'sync-airtable',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-all',
      durationMs: Date.now() - startTime,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    return new Response(JSON.stringify({
      success: false,
      error: 'Sync fehlgeschlagen',
      results,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Netlify Scheduled Function config
// Runs every 2 hours (saves credits; manual sync via trigger-sync.js button)
export const config = {
  schedule: '0 */2 * * *',
};
