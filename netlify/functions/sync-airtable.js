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
 * Fetch records from an Airtable table (paginated).
 * If sinceISO is provided, only fetches records modified after that timestamp.
 */
async function fetchAllAirtable(token, tableId, fields, sinceISO = null) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let filterParam = '';
  if (sinceISO) {
    // Airtable filterByFormula: only records modified since last sync
    const formula = `LAST_MODIFIED_TIME()>'${sinceISO}'`;
    filterParam = `&filterByFormula=${encodeURIComponent(formula)}`;
  }

  let allRecords = [];
  let offset = null;

  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}${filterParam}`;
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
 * Get the last sync timestamp for a table from Supabase sync_metadata.
 */
async function getLastSyncTime(supabaseUrl, serviceKey, tableName) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/sync_metadata?table_name=eq.${tableName}&select=last_sync_timestamp&limit=1`,
      { headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey } }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[sync] sync_metadata lookup failed for ${tableName}: ${res.status} ${errText.substring(0, 100)}`);
      return null;
    }
    const rows = await res.json();
    return rows.length > 0 ? rows[0].last_sync_timestamp : null;
  } catch (e) {
    console.warn(`[sync] sync_metadata error for ${tableName}:`, e.message);
    return null;
  }
}

/**
 * Update last sync timestamp for a table in Supabase sync_metadata.
 * Uses POST with merge-duplicates (upsert), falls back to PATCH if POST fails.
 */
async function updateSyncTime(supabaseUrl, serviceKey, tableName, fetched, upserted) {
  const payload = {
    table_name: tableName,
    last_sync_timestamp: new Date().toISOString(),
    records_fetched: fetched,
    records_upserted: upserted,
    last_sync_status: 'success',
    updated_at: new Date().toISOString(),
  };

  try {
    // Attempt 1: POST with upsert (works if row exists or not)
    const res = await fetch(`${supabaseUrl}/rest/v1/sync_metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`[sync] ✅ sync_metadata updated for ${tableName}: ${fetched} fetched, ${upserted} upserted`);
      return;
    }

    const errText = await res.text();
    console.warn(`[sync] POST sync_metadata failed for ${tableName}: ${res.status} ${errText.substring(0, 200)}`);

    // Attempt 2: PATCH (update existing row) — handles schema/conflict issues
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/sync_metadata?table_name=eq.${encodeURIComponent(tableName)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          last_sync_timestamp: payload.last_sync_timestamp,
          records_fetched: fetched,
          records_upserted: upserted,
          last_sync_status: 'success',
          updated_at: payload.updated_at,
        }),
      }
    );
    if (patchRes.ok) {
      console.log(`[sync] ✅ sync_metadata PATCH succeeded for ${tableName}`);
    } else {
      const patchErr = await patchRes.text();
      console.error(`[sync] ❌ sync_metadata PATCH also failed for ${tableName}: ${patchRes.status} ${patchErr.substring(0, 200)}`);
    }
  } catch (e) {
    console.error(`[sync] ❌ Failed to update sync_metadata for ${tableName}:`, e.message);
  }
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

  // ═══ HEALTH CHECK: Verify sync_metadata table ═══
  let syncMetadataAvailable = true;
  try {
    const metaCheck = await fetch(
      `${SUPABASE_URL}/rest/v1/sync_metadata?select=table_name&limit=1`,
      { headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'apikey': SUPABASE_SERVICE_KEY } }
    );
    if (!metaCheck.ok) {
      syncMetadataAvailable = false;
      console.warn(`[sync] ⚠️  sync_metadata table NOT accessible (${metaCheck.status}) — running FULL SYNC for all tables`);
    } else {
      const metaRows = await metaCheck.json();
      console.log(`[sync] sync_metadata OK — ${metaRows.length} table(s) tracked`);
    }
  } catch (e) {
    syncMetadataAvailable = false;
    console.warn(`[sync] ⚠️  sync_metadata check failed: ${e.message} — running FULL SYNC`);
  }

  try {
    // ═══ INCREMENTAL SYNC: Get last sync timestamps ═══
    const lastSync = {};
    if (syncMetadataAvailable) {
      for (const table of ['heartbeats', 'stammdaten', 'airtable_displays', 'tasks', 'acquisition', 'dayn_screens', 'installationen', 'hardware_ops', 'hardware_sim', 'hardware_displays', 'chg_approvals', 'hardware_swaps', 'hardware_deinstalls', 'communications']) {
        lastSync[table] = await getLastSyncTime(SUPABASE_URL, SUPABASE_SERVICE_KEY, table);
      }
      const trackedTables = Object.entries(lastSync).filter(([, ts]) => ts).length;
      console.log(`[sync] Incremental mode — ${trackedTables}/${Object.keys(lastSync).length} tables have previous sync timestamps`);
    } else {
      console.log('[sync] Full sync mode — sync_metadata unavailable, all tables will be fully synced');
    }

    // ═══ 1. GOOGLE SHEETS → display_heartbeats (incremental: skip old rows) ═══
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

        // Defensive: Verify required columns exist
        const requiredCols = ['Display ID', 'Timestamp', 'Status', 'Is Alive'];
        const missingCols = requiredCols.filter(c => colIdx[c] === undefined);
        if (missingCols.length > 0) {
          console.warn(`[sync] CSV missing columns: ${missingCols.join(', ')}. Available: ${headers.join(', ')}`);
        }
        console.log(`[sync] CSV parsed: ${lines.length} lines, ${headers.length} columns: ${headers.join(', ')}`);

        const cutoffTime = lastSync.heartbeats ? new Date(lastSync.heartbeats) : null;
        let skippedOld = 0;

        const heartbeatRows = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = parseCSVLine(line);
          const displayId = cols[colIdx['Display ID']] || '';
          const timestamp = cols[colIdx['Timestamp']] || '';
          if (!displayId || !timestamp) continue;

          // Incremental: skip rows older than last sync
          const parsedTs = parseGermanDateToISO(timestamp);
          if (cutoffTime && parsedTs) {
            const rowTime = new Date(parsedTs);
            if (rowTime <= cutoffTime) { skippedOld++; continue; }
          }

          const slashIdx = displayId.indexOf('/');
          const stableId = slashIdx >= 0 ? displayId.substring(0, slashIdx).trim() : displayId.trim();

          heartbeatRows.push({
            timestamp: timestamp || null,
            timestamp_parsed: parsedTs,
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

        const inserted = heartbeatRows.length > 0
          ? await insertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'display_heartbeats', heartbeatRows)
          : 0;
        results.heartbeats = { fetched: heartbeatRows.length, inserted, skippedOld };
        await updateSyncTime(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'heartbeats', heartbeatRows.length, inserted);
        console.log(`[sync] Heartbeats: ${heartbeatRows.length} new (${skippedOld} skipped old), ${inserted} inserted`);
      } else {
        console.error(`[sync] Google Sheets error: ${csvRes.status}`);
        results.heartbeats = { error: `HTTP ${csvRes.status}` };
      }
    } catch (sheetErr) {
      console.error('[sync] Sheets error:', sheetErr.message);
      results.heartbeats = { error: sheetErr.message };
    }

    // ═══ Helper: Sync an Airtable table (incremental if sync_metadata exists) ═══
    async function syncAirtableTable(tableName, tableId, fields, mapperFn, supabaseTable) {
      const since = lastSync[supabaseTable];
      console.log(`[sync] Fetching ${tableName}...${since ? ` (since ${since})` : ' (full)'}`);
      const records = await fetchAllAirtable(AIRTABLE_TOKEN, tableId, fields, since);
      const rows = records.map(mapperFn);
      const upserted = rows.length > 0
        ? await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, supabaseTable, rows)
        : 0;
      // Only run orphan detection on full syncs (no sinceISO = first run or forced)
      const deleted = !since
        ? await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, supabaseTable, records.map(r => r.id))
        : 0;
      await updateSyncTime(SUPABASE_URL, SUPABASE_SERVICE_KEY, supabaseTable, records.length, upserted);
      results[supabaseTable] = { fetched: records.length, upserted, deleted, incremental: !!since };
      console.log(`[sync] ${tableName}: ${records.length} fetched → ${upserted} upserted${deleted ? `, ${deleted} orphans deleted` : ''}${since ? ' (incremental)' : ' (full)'}`);
    }

    // ═══ 2. AIRTABLE: Stammdaten ═══
    await syncAirtableTable('Stammdaten', STAMMDATEN_TABLE, FETCH_FIELDS.stammdaten, mapStammdaten, 'stammdaten');

    // ═══ 2b. AIRTABLE: Live Display Locations (Displays) ═══
    await syncAirtableTable('Displays', DISPLAYS_TABLE, FETCH_FIELDS.displays, mapDisplay, 'airtable_displays');

    // ═══ 3. AIRTABLE: Tasks ═══
    await syncAirtableTable('Tasks', TASKS_TABLE, FETCH_FIELDS.tasks, mapTask, 'tasks');

    // ═══ 3b. AIRTABLE: Acquisition_DB ═══
    await syncAirtableTable('Acquisition', TABLES.ACQUISITION, FETCH_FIELDS.acquisition, mapAcquisition, 'acquisition');

    // ═══ 3c. AIRTABLE: Dayn Screens ═══
    await syncAirtableTable('Dayn Screens', DAYN_SCREENS_TABLE, FETCH_FIELDS.daynScreens, mapDaynScreen, 'dayn_screens');

    // ═══ 4. AIRTABLE: Installationen ═══
    await syncAirtableTable('Installationen', INSTALLATIONEN_TABLE, FETCH_FIELDS.installationen, mapInstallation, 'installationen');

    // ═══ 5. HARDWARE: OPS Player Inventory ═══
    await syncAirtableTable('OPS Inventory', OPS_INVENTORY_TABLE, FETCH_FIELDS.opsInventory, mapOpsInventory, 'hardware_ops');

    // ═══ 6. HARDWARE: SIM Card Inventory ═══
    await syncAirtableTable('SIM Inventory', SIM_INVENTORY_TABLE, FETCH_FIELDS.simInventory, mapSimInventory, 'hardware_sim');

    // ═══ 7. HARDWARE: Display Inventory ═══
    await syncAirtableTable('Display Inventory', DISPLAY_INVENTORY_TABLE, FETCH_FIELDS.displayInventory, mapDisplayInventory, 'hardware_displays');

    // ═══ 8. HARDWARE: CHG Approval (Leasing) ═══
    await syncAirtableTable('CHG Approval', CHG_APPROVAL_TABLE, FETCH_FIELDS.chgApproval, mapChgApproval, 'chg_approvals');

    // ═══ 9. HARDWARE: Hardware Swaps ═══
    try {
      await syncAirtableTable('Hardware Swaps', HARDWARE_SWAP_TABLE, FETCH_FIELDS.hardwareSwap, mapHardwareSwap, 'hardware_swaps');
    } catch (e) {
      console.warn('[sync] Hardware Swaps table not ready yet:', e.message);
      results.hardware_swaps = { fetched: 0, upserted: 0, error: e.message };
    }

    // ═══ 10. HARDWARE: Deinstallationen ═══
    try {
      await syncAirtableTable('Deinstallationen', DEINSTALL_TABLE, FETCH_FIELDS.deinstall, mapDeinstall, 'hardware_deinstalls');
    } catch (e) {
      console.warn('[sync] Deinstallationen table not ready yet:', e.message);
      results.hardware_deinstalls = { fetched: 0, upserted: 0, error: e.message };
    }

    // ═══ 11. AIRTABLE: Activity Log / Communications ═══
    await syncAirtableTable('Communications', ACTIVITY_LOG_TABLE, FETCH_FIELDS.communications, mapCommunication, 'communications');

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
// Navori schreibt um 06:05, 09:35, 13:05, 16:35, 20:05, 23:35 (alle 3h30m)
// Wir syncen alle 2h um :25 — max 2h Verzoegerung nach jedem Navori-Zyklus
export const config = {
  schedule: '25 */2 * * *',
};
