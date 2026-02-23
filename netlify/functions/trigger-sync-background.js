/**
 * Netlify Function: Manual Sync Trigger
 *
 * A lightweight HTTP-callable function that runs the same sync logic
 * as sync-airtable.js (which is a scheduled function and can't be called via HTTP).
 *
 * Usage: GET /api/trigger-sync
 */

import { logApiCall, estimateAirtableCost } from './shared/apiLogger.js';
import { AIRTABLE_BASE, TABLES, FETCH_FIELDS, SHEET_CSV_URL } from './shared/airtableFields.js';
import {
  mapStammdaten, mapDisplay, mapTask, mapAcquisition, mapDaynScreen,
  mapInstallation, mapOpsInventory, mapSimInventory, mapDisplayInventory,
  mapChgApproval, mapHardwareSwap, mapDeinstall, mapCommunication,
  mapInstallationstermin,
} from './shared/airtableMappers.js';
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
} from './shared/security.js';

/**
 * Fetch records from an Airtable table (paginated).
 * If sinceISO is provided, only fetches records modified after that timestamp
 * using Airtable's LAST_MODIFIED_TIME() formula filter.
 */
async function fetchAllAirtable(token, tableId, fields, sinceISO = null) {
  // If fields is null/empty, fetch ALL fields (no fields[] params → Airtable returns everything)
  const fieldParams = (fields && fields.length > 0)
    ? fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&')
    : '';
  let filterParam = '';
  if (sinceISO) {
    const formula = `LAST_MODIFIED_TIME()>'${sinceISO}'`;
    filterParam = `&filterByFormula=${encodeURIComponent(formula)}`;
  }
  let allRecords = [];
  let offset = null;
  let retryCount = 0;
  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const params = [fieldParams, `pageSize=100`, offsetParam.replace(/^&/, ''), filterParam.replace(/^&/, '')].filter(Boolean).join('&');
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    // Handle Airtable rate limiting (429) with exponential backoff
    if (res.status === 429) {
      retryCount++;
      const waitMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
      console.warn(`[trigger-sync] Rate limited on ${tableId}, waiting ${waitMs}ms (retry ${retryCount})...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue; // retry same page
    }
    // Reset retry count on successful request
    retryCount = 0;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Airtable error for table ${tableId}: ${res.status} ${errText.substring(0, 300)}`);
      throw new Error(`Airtable ${tableId}: ${res.status} — ${errText.substring(0, 200)}`);
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
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length > 0 ? rows[0].last_sync_timestamp : null;
  } catch (e) {
    console.warn(`[trigger-sync] sync_metadata error for ${tableName}:`, e.message);
    return null;
  }
}

async function deleteOrphansFromSupabase(supabaseUrl, serviceKey, table, validAirtableIds, idColumn = 'airtable_id') {
  if (!validAirtableIds.length) return 0;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${idColumn}`, {
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
    });
    if (!res.ok) return 0;
    const supabaseRows = await res.json();
    const supabaseIds = supabaseRows.map(r => r[idColumn]).filter(Boolean);
    const validSet = new Set(validAirtableIds);
    const orphanIds = supabaseIds.filter(id => !validSet.has(id));
    if (orphanIds.length === 0) return 0;
    let deleted = 0;
    const batchSize = 50;
    for (let i = 0; i < orphanIds.length; i += batchSize) {
      const batch = orphanIds.slice(i, i + batchSize);
      const idsParam = batch.map(id => `"${id}"`).join(',');
      const delRes = await fetch(`${supabaseUrl}/rest/v1/${table}?${idColumn}=in.(${idsParam})`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
      });
      if (delRes.ok) deleted += batch.length;
    }
    return deleted;
  } catch (err) {
    console.error(`[trigger-sync] deleteOrphans error (${table}):`, err.message);
    return 0;
  }
}

async function insertToSupabase(supabaseUrl, serviceKey, table, rows, onConflict = null) {
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    // Use merge-duplicates with on_conflict to avoid 409 errors on unique constraints
    const prefer = onConflict ? 'resolution=merge-duplicates' : 'resolution=ignore-duplicates';
    const conflictParam = onConflict ? `?on_conflict=${onConflict}` : '';
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}${conflictParam}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': prefer,
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
      // PostgREST PGRST204: "Could not find the 'col_name' column of 'table' in the schema cache"
      // Postgres: "column \"col_name\" of relation \"table\" does not exist"
      const colMatch = errText.match(/column\s+"?([^"]+)"?\s+(?:of relation|does not exist)/i) ||
                        errText.match(/Could not find[^']*'([^']+)'\s+column/i);
      if (colMatch && res.status === 400 && attempt < 3) {
        const badCol = colMatch[1];
        columnsToStrip.add(badCol);
        console.warn(`[trigger-sync] Column "${badCol}" incompatible in "${table}" — stripping and retrying (attempt ${attempt + 2}). Run sql/fix-tasks-missing-columns.sql to fix permanently.`);
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
    console.warn(`[trigger-sync] Stripped columns from "${table}" upsert: ${[...columnsToStrip].join(', ')}`);
  }

  return upserted;
}

/**
 * Update last sync timestamp for a table in Supabase sync_metadata.
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
    if (res.ok) return;
    // Fallback: PATCH existing row
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
    if (!patchRes.ok) {
      console.warn(`[trigger-sync] sync_metadata update failed for ${tableName}`);
    }
  } catch (e) {
    console.warn(`[trigger-sync] sync_metadata error for ${tableName}:`, e.message);
  }
}

function parseGermanDateToISO(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, d, m, y, h, min] = match;
    const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  const matchDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDate) {
    const [, d, m, y] = matchDate;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}T/)) {
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

/**
 * Generic incremental-capable sync function for Airtable tables.
 * Fetches only records modified since last sync (via LAST_MODIFIED_TIME filter).
 * Orphan cleanup only runs on full syncs.
 */
async function syncTable(token, supabaseUrl, serviceKey, { tableName, tableId, mapperFn, supabaseTable, idColumn = 'airtable_id', knownFields = null }) {
  // Get last sync time for incremental mode
  const since = await getLastSyncTime(supabaseUrl, serviceKey, supabaseTable);
  const isIncremental = !!since;
  console.log(`[trigger-sync] ${tableName}: ${isIncremental ? `incremental (since ${since})` : 'full'}...`);

  // Fetch ALL fields from Airtable (fields=null → no filter → all columns returned)
  const records = await fetchAllAirtable(token, tableId, null, since);
  // Map records + capture unmapped fields in extra_fields JSONB
  const knownSet = knownFields ? new Set(knownFields) : null;
  const rows = records.map(rec => {
    const mapped = mapperFn(rec);
    // Capture all fields NOT handled by the mapper into extra_fields
    if (knownSet && rec.fields) {
      const extra = {};
      for (const [key, val] of Object.entries(rec.fields)) {
        if (!knownSet.has(key) && val != null) {
          extra[key] = val;
        }
      }
      mapped.extra_fields = Object.keys(extra).length > 0 ? extra : null;
    }
    return mapped;
  });
  const upserted = rows.length > 0
    ? await upsertToSupabase(supabaseUrl, serviceKey, supabaseTable, rows)
    : 0;

  // Only run orphan detection on full syncs (incremental doesn't fetch all records)
  const deleted = !isIncremental
    ? await deleteOrphansFromSupabase(supabaseUrl, serviceKey, supabaseTable, records.map(r => r.id), idColumn)
    : 0;

  await updateSyncTime(supabaseUrl, serviceKey, supabaseTable, records.length, upserted);
  console.log(`[trigger-sync] ${tableName}: ${records.length} fetched → ${upserted} upserted${deleted ? `, ${deleted} orphans` : ''} (${isIncremental ? 'incremental' : 'full'})`);
  return { name: supabaseTable, fetched: records.length, upserted, deleted, incremental: isIncremental };
}

/**
 * Declarative sync configurations for all Airtable tables.
 * Each entry maps to a syncTable() call with the given parameters.
 * Tables with idColumn='id' use that instead of the default 'airtable_id'.
 */
const SYNC_CONFIGS = [
  { tableName: 'Displays',           tableId: TABLES.DISPLAYS,             mapperFn: mapDisplay,              supabaseTable: 'airtable_displays',    knownFields: FETCH_FIELDS.displays },
  { tableName: 'Acquisition',        tableId: TABLES.ACQUISITION,          mapperFn: mapAcquisition,          supabaseTable: 'acquisition',          knownFields: FETCH_FIELDS.acquisition },
  { tableName: 'Dayn Screens',       tableId: TABLES.DAYN_SCREENS,         mapperFn: mapDaynScreen,           supabaseTable: 'dayn_screens',         knownFields: FETCH_FIELDS.daynScreens },
  { tableName: 'OPS Inventory',      tableId: TABLES.OPS_INVENTORY,        mapperFn: mapOpsInventory,         supabaseTable: 'hardware_ops',         knownFields: FETCH_FIELDS.opsInventory,      idColumn: 'id' },
  { tableName: 'SIM Inventory',      tableId: TABLES.SIM_INVENTORY,        mapperFn: mapSimInventory,         supabaseTable: 'hardware_sim',         knownFields: FETCH_FIELDS.simInventory,      idColumn: 'id' },
  { tableName: 'Display Inventory',  tableId: TABLES.DISPLAY_INVENTORY,    mapperFn: mapDisplayInventory,     supabaseTable: 'hardware_displays',    knownFields: FETCH_FIELDS.displayInventory,  idColumn: 'id' },
  { tableName: 'CHG Approvals',      tableId: TABLES.CHG_APPROVAL,         mapperFn: mapChgApproval,          supabaseTable: 'chg_approvals',        knownFields: FETCH_FIELDS.chgApproval,       idColumn: 'id' },
  { tableName: 'Stammdaten',         tableId: TABLES.STAMMDATEN,           mapperFn: mapStammdaten,           supabaseTable: 'stammdaten',           knownFields: FETCH_FIELDS.stammdaten },
  { tableName: 'Tasks',              tableId: TABLES.TASKS,                mapperFn: mapTask,                 supabaseTable: 'tasks',                knownFields: FETCH_FIELDS.tasks },
  { tableName: 'Installationen',     tableId: TABLES.INSTALLATIONEN,       mapperFn: mapInstallation,         supabaseTable: 'installationen',       knownFields: FETCH_FIELDS.installationen },
  { tableName: 'Hardware Swaps',     tableId: TABLES.HARDWARE_SWAP,        mapperFn: mapHardwareSwap,         supabaseTable: 'hardware_swaps',       knownFields: FETCH_FIELDS.hardwareSwap,      idColumn: 'id' },
  { tableName: 'Deinstalls',         tableId: TABLES.DEINSTALL,            mapperFn: mapDeinstall,            supabaseTable: 'hardware_deinstalls',  knownFields: FETCH_FIELDS.deinstall,         idColumn: 'id' },
  { tableName: 'Installationstermine', tableId: TABLES.INSTALLATIONSTERMINE, mapperFn: mapInstallationstermin, supabaseTable: 'installationstermine', knownFields: FETCH_FIELDS.installationstermine },
  { tableName: 'Communications',     tableId: TABLES.ACTIVITY_LOG,         mapperFn: mapCommunication,        supabaseTable: 'communications',       knownFields: FETCH_FIELDS.communications },
];

async function syncHeartbeats(supabaseUrl, serviceKey) {
  const csvRes = await fetch(SHEET_CSV_URL, {
    headers: { 'User-Agent': 'JET-Dashboard-Sync/1.0' },
  });
  if (!csvRes.ok) throw new Error(`HTTP ${csvRes.status}`);
  const csvText = await csvRes.text();
  const lines = csvText.split('\n');
  const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const colIdx = {};
  csvHeaders.forEach((h, i) => { colIdx[h] = i; });
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
  // Use on_conflict to upsert on (display_id, timestamp) — avoids 409 duplicate key errors
  const inserted = await insertToSupabase(supabaseUrl, serviceKey, 'display_heartbeats', heartbeatRows, 'display_id,timestamp');
  await updateSyncTime(supabaseUrl, serviceKey, 'heartbeats', heartbeatRows.length, inserted);
  console.log(`[trigger-sync] Heartbeats: ${heartbeatRows.length} → ${inserted} upserted`);
  return { name: 'heartbeats', fetched: heartbeatRows.length, inserted };
}

/* ─── Main Handler ─── */

export default async (request) => {
  const startTime = Date.now();

  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  // Origin check
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
  };

  // Rate limiting — allow scheduled trigger every 5min + occasional manual triggers
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`trigger-sync:${clientIP}`, 15, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!AIRTABLE_TOKEN || !SUPABASE_SERVICE_KEY) {
    console.error('[trigger-sync] Missing required environment variables');
    return new Response(JSON.stringify({ error: 'Server-Konfigurationsfehler' }), { status: 500, headers });
  }

  try {
    // Run syncs in batches of 3 to avoid Airtable's 5 req/s rate limit.
    // Previously all 14 tables ran in parallel, causing massive 429s that
    // starved smaller tables (hardware_ops, hardware_sim, etc.) of data.
    console.log('[trigger-sync] Starting batched sync of all 14 tables (max 3 concurrent)...');

    // Batch layout: indices into SYNC_CONFIGS, grouped to stay under Airtable's 5 req/s limit
    const BATCH_LAYOUT = [
      [0, 1, 2],    // Batch 1: Displays, Acquisition, Dayn Screens
      [3, 4, 5],    // Batch 2: OPS, SIM, Display Inventory
      [6, 7, 8],    // Batch 3: CHG, Stammdaten, Tasks
      [9, 10, 11],  // Batch 4: Installationen, Swaps, Deinstalls
      [12, 13],     // Batch 5: Installationstermine, Communications
    ];

    const batches = [
      ...BATCH_LAYOUT.map(indices =>
        indices.map(i => () => syncTable(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, SYNC_CONFIGS[i]))
      ),
      // Batch 6: Heartbeats (Google Sheets, not Airtable)
      [() => syncHeartbeats(SUPABASE_URL, SUPABASE_SERVICE_KEY)],
    ];

    const allSettled = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[trigger-sync] Starting batch ${i + 1}/${batches.length} (${batch.length} tables)...`);
      const batchResults = await Promise.allSettled(batch.map(fn => fn()));
      allSettled.push(...batchResults);
      // Pause between batches to let Airtable rate limits reset
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const results = {};
    for (const r of allSettled) {
      if (r.status === 'fulfilled') {
        const { name, ...rest } = r.value;
        results[name] = rest;
      } else {
        const errMsg = r.reason?.message || String(r.reason);
        console.error('[trigger-sync] Job failed:', errMsg);
        results[`error_${Object.keys(results).length}`] = { error: errMsg };
      }
    }

    // ═══ RÜCKSYNC: installationen.status → install_bookings.status ═══
    // Quelle der Wahrheit: Tabelle "installationen" (NICHT installationstermine!)
    // Verhindert z.B. dass WhatsApp-Reminder an bereits aufgebaute Kunden gehen.
    try {
      console.log('[trigger-sync] Running installationen→install_bookings status sync...');
      const installRes = await fetch(
        `${SUPABASE_URL}/rest/v1/installationen?select=id,akquise_links,status,location_name&status=in.(Installiert,Abgebrochen,Storniert)`,
        { headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'apikey': SUPABASE_SERVICE_KEY } }
      );
      const installationen = installRes.ok ? await installRes.json() : [];

      if (installationen.length > 0) {
        const statusByAkquise = {};
        for (const inst of installationen) {
          const links = Array.isArray(inst.akquise_links) ? inst.akquise_links : [];
          for (const akqId of links) {
            if (inst.status === 'Installiert') statusByAkquise[akqId] = 'completed';
            else if (inst.status === 'Abgebrochen') statusByAkquise[akqId] = 'cancelled';
            else if (inst.status === 'Storniert') statusByAkquise[akqId] = 'cancelled';
          }
        }
        const openBookingsRes = await fetch(
          `${SUPABASE_URL}/rest/v1/install_bookings?select=id,akquise_airtable_id,status,location_name&status=in.(pending,booked,confirmed,invited)&akquise_airtable_id=not.is.null`,
          { headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'apikey': SUPABASE_SERVICE_KEY } }
        );
        const openBookings = openBookingsRes.ok ? await openBookingsRes.json() : [];
        let syncedCount = 0;
        for (const b of openBookings) {
          const newStatus = statusByAkquise[b.akquise_airtable_id];
          if (!newStatus) continue;
          const patchRes = await fetch(
            `${SUPABASE_URL}/rest/v1/install_bookings?id=eq.${b.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'apikey': SUPABASE_SERVICE_KEY, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
            }
          );
          if (patchRes.ok) {
            syncedCount++;
            const locName = Array.isArray(b.location_name) ? b.location_name[0] : b.location_name;
            console.log(`[trigger-sync] Rücksync: ${locName || b.id}: ${b.status} → ${newStatus}`);
          }
        }
        results['ruecksync'] = { synced: syncedCount, openChecked: openBookings.length };
        console.log(`[trigger-sync] Rücksync: ${syncedCount}/${openBookings.length} bookings updated`);
      }
    } catch (e) {
      console.warn('[trigger-sync] Rücksync failed (non-fatal):', e.message);
    }

    const succeeded = allSettled.filter(r => r.status === 'fulfilled').length;
    const failed = allSettled.filter(r => r.status === 'rejected').length;
    const durationMs = Date.now() - startTime;

    console.log(`[trigger-sync] Done in ${durationMs}ms — ${succeeded} succeeded, ${failed} failed`);

    // Summarize totals for API usage logging
    const totalFetched = Object.values(results).reduce((sum, r) => sum + (r?.fetched || 0), 0);
    const totalUpserted = Object.values(results).reduce((sum, r) => sum + (r?.upserted || r?.inserted || 0), 0);

    logApiCall({
      functionName: 'trigger-sync-background',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-all',
      durationMs,
      statusCode: 200,
      success: failed === 0,
      recordsCount: totalFetched,
      estimatedCostCents: estimateAirtableCost(totalFetched),
      metadata: { tablesProcessed: succeeded, tablesFailed: failed, totalRecords: totalFetched },
    });

    logApiCall({
      functionName: 'trigger-sync-background',
      service: 'supabase',
      method: 'POST',
      endpoint: '/upsert-all',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalUpserted,
    });

    return new Response(JSON.stringify({
      success: failed === 0,
      duration_ms: durationMs,
      tables_synced: succeeded,
      tables_failed: failed,
      results,
    }), { status: 200, headers });
  } catch (err) {
    console.error('[trigger-sync] Error:', err);

    logApiCall({
      functionName: 'trigger-sync-background',
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
    }), { status: 500, headers });
  }
};
