/**
 * Netlify Function: Manual Sync Trigger
 *
 * A lightweight HTTP-callable function that runs the same sync logic
 * as sync-airtable.js (which is a scheduled function and can't be called via HTTP).
 *
 * Usage: GET /api/trigger-sync
 */

import { logApiCall, logApiCalls, estimateAirtableCost } from './shared/apiLogger.js';
import {
  AIRTABLE_BASE, TABLES, FETCH_FIELDS, SHEET_CSV_URL,
} from './shared/airtableFields.js';
import {
  mapStammdaten, mapDisplay, mapTask, mapAcquisition, mapDaynScreen,
  mapInstallation, mapOpsInventory, mapSimInventory, mapDisplayInventory,
  mapChgApproval, mapHardwareSwap, mapDeinstall, mapCommunication,
} from './shared/airtableMappers.js';

// Local aliases for backward compat
const STAMMDATEN_TABLE = TABLES.STAMMDATEN;
const DISPLAYS_TABLE = TABLES.DISPLAYS;
const DAYN_SCREENS_TABLE = TABLES.DAYN_SCREENS;
const TASKS_TABLE = TABLES.TASKS;
const INSTALLATIONEN_TABLE = TABLES.INSTALLATIONEN;
const ACTIVITY_LOG_TABLE = TABLES.ACTIVITY_LOG;
const OPS_INVENTORY_TABLE = TABLES.OPS_INVENTORY;
const SIM_INVENTORY_TABLE = TABLES.SIM_INVENTORY;
const DISPLAY_INVENTORY_TABLE = TABLES.DISPLAY_INVENTORY;
const CHG_APPROVAL_TABLE = TABLES.CHG_APPROVAL;
const DEINSTALL_TABLE = TABLES.DEINSTALL;
const HARDWARE_SWAP_TABLE = TABLES.HARDWARE_SWAP;

async function fetchAllAirtable(token, tableId, fields) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let allRecords = [];
  let offset = null;
  let retryCount = 0;
  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}`;
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

/* ═══════════════════════════════════════════════
   MAPPER FUNCTIONS: imported from shared/airtableMappers.js
   ═══════════════════════════════════════════════ */


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

/* ─── Individual sync functions (each returns {name, result}) ─── */

async function syncDisplays(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DISPLAYS_TABLE, FETCH_FIELDS.displays);
  const rows = records.map(mapDisplay);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'airtable_displays', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'airtable_displays', records.map(r => r.id));
  await updateSyncTime(supabaseUrl, serviceKey, 'displays', records.length, upserted);
  console.log(`[trigger-sync] Displays: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'displays', fetched: records.length, upserted, deleted };
}

async function syncAcquisition(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, TABLES.ACQUISITION, FETCH_FIELDS.acquisition);
  const rows = records.map(mapAcquisition);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'acquisition', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'acquisition', records.map(r => r.id));
  await updateSyncTime(supabaseUrl, serviceKey, 'acquisition', records.length, upserted);
  console.log(`[trigger-sync] Acquisition: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'acquisition', fetched: records.length, upserted, deleted };
}

async function syncDaynScreens(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DAYN_SCREENS_TABLE, FETCH_FIELDS.daynScreens);
  const rows = records.map(mapDaynScreen);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'dayn_screens', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'dayn_screens', records.map(r => r.id));
  await updateSyncTime(supabaseUrl, serviceKey, 'dayn_screens', records.length, upserted);
  console.log(`[trigger-sync] Dayn Screens: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'dayn_screens', fetched: records.length, upserted, deleted };
}

async function syncOps(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, OPS_INVENTORY_TABLE, FETCH_FIELDS.opsInventory);
  const rows = records.map(mapOpsInventory);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_ops', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_ops', records.map(r => r.id), 'id');
  await updateSyncTime(supabaseUrl, serviceKey, 'hardware_ops', records.length, upserted);
  console.log(`[trigger-sync] OPS: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_ops', fetched: records.length, upserted, deleted };
}

async function syncSim(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, SIM_INVENTORY_TABLE, FETCH_FIELDS.simInventory);
  const rows = records.map(mapSimInventory);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_sim', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_sim', records.map(r => r.id), 'id');
  await updateSyncTime(supabaseUrl, serviceKey, 'hardware_sim', records.length, upserted);
  console.log(`[trigger-sync] SIM: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_sim', fetched: records.length, upserted, deleted };
}

async function syncDisplayInventory(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DISPLAY_INVENTORY_TABLE, FETCH_FIELDS.displayInventory);
  const rows = records.map(mapDisplayInventory);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_displays', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_displays', records.map(r => r.id), 'id');
  await updateSyncTime(supabaseUrl, serviceKey, 'hardware_displays', records.length, upserted);
  console.log(`[trigger-sync] Display Inv: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_displays', fetched: records.length, upserted, deleted };
}

async function syncChg(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, CHG_APPROVAL_TABLE, FETCH_FIELDS.chgApproval);
  console.log(`[trigger-sync] CHG: Fetched ${records.length} records from Airtable table ${CHG_APPROVAL_TABLE}`);
  const rows = records.map(mapChgApproval);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'chg_approvals', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'chg_approvals', records.map(r => r.id), 'id');
  await updateSyncTime(supabaseUrl, serviceKey, 'chg_approvals', records.length, upserted);
  console.log(`[trigger-sync] CHG: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'chg_approvals', fetched: records.length, upserted, deleted };
}

async function syncStammdaten(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, STAMMDATEN_TABLE, FETCH_FIELDS.stammdaten);
  const rows = records.map(mapStammdaten);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'stammdaten', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'stammdaten', records.map(r => r.id));
  await updateSyncTime(supabaseUrl, serviceKey, 'stammdaten', records.length, upserted);
  console.log(`[trigger-sync] Stammdaten: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'stammdaten', fetched: records.length, upserted, deleted };
}

async function syncTasks(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, TASKS_TABLE, FETCH_FIELDS.tasks);
  const rows = records.map(mapTask);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'tasks', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'tasks', records.map(r => r.id));
  await updateSyncTime(supabaseUrl, serviceKey, 'tasks', records.length, upserted);
  console.log(`[trigger-sync] Tasks: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'tasks', fetched: records.length, upserted, deleted };
}

async function syncInstallationen(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, INSTALLATIONEN_TABLE, FETCH_FIELDS.installationen);
  const rows = records.map(mapInstallation);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'installationen', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'installationen', records.map(r => r.id));
  await updateSyncTime(supabaseUrl, serviceKey, 'installationen', records.length, upserted);
  console.log(`[trigger-sync] Installationen: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'installationen', fetched: records.length, upserted, deleted };
}

async function syncSwaps(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, HARDWARE_SWAP_TABLE, FETCH_FIELDS.hardwareSwap);
  const rows = records.map(mapHardwareSwap);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_swaps', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_swaps', records.map(r => r.id), 'id');
  await updateSyncTime(supabaseUrl, serviceKey, 'hardware_swaps', records.length, upserted);
  console.log(`[trigger-sync] Swaps: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_swaps', fetched: records.length, upserted, deleted };
}

async function syncDeinstalls(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, DEINSTALL_TABLE, FETCH_FIELDS.deinstall);
  const rows = records.map(mapDeinstall);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'hardware_deinstalls', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'hardware_deinstalls', records.map(r => r.id), 'id');
  await updateSyncTime(supabaseUrl, serviceKey, 'hardware_deinstalls', records.length, upserted);
  console.log(`[trigger-sync] Deinstalls: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'hardware_deinstalls', fetched: records.length, upserted, deleted };
}

async function syncCommunications(token, supabaseUrl, serviceKey) {
  const records = await fetchAllAirtable(token, ACTIVITY_LOG_TABLE, FETCH_FIELDS.communications);
  const rows = records.map(mapCommunication);
  const upserted = await upsertToSupabase(supabaseUrl, serviceKey, 'communications', rows);
  const deleted = await deleteOrphansFromSupabase(supabaseUrl, serviceKey, 'communications', records.map(r => r.id));
  await updateSyncTime(supabaseUrl, serviceKey, 'communications', records.length, upserted);
  console.log(`[trigger-sync] Communications: ${records.length} → ${upserted} upserted, ${deleted} orphans`);
  return { name: 'communications', fetched: records.length, upserted, deleted };
}

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
  const inserted = await insertToSupabase(supabaseUrl, serviceKey, 'display_heartbeats', heartbeatRows);
  await updateSyncTime(supabaseUrl, serviceKey, 'heartbeats', heartbeatRows.length, inserted);
  console.log(`[trigger-sync] Heartbeats: ${heartbeatRows.length} → ${inserted} inserted`);
  return { name: 'heartbeats', fetched: heartbeatRows.length, inserted };
}

/* ─── Main Handler ─── */

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
} from './shared/security.js';

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

  // Rate limiting — sync is expensive, limit to 5/min per IP
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`trigger-sync:${clientIP}`, 5, 60_000);
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs, origin);
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co';
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

    const batches = [
      // Batch 1: Core display tables
      [
        () => syncDisplays(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncAcquisition(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncDaynScreens(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 2: Hardware inventory tables
      [
        () => syncOps(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncSim(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncDisplayInventory(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 3: Approvals, stammdaten, tasks
      [
        () => syncChg(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncStammdaten(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncTasks(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 4: Installations, swaps, deinstalls
      [
        () => syncInstallationen(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncSwaps(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncDeinstalls(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
      // Batch 5: Communications + heartbeats (heartbeats use Google Sheets, not Airtable)
      [
        () => syncCommunications(AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY),
        () => syncHeartbeats(SUPABASE_URL, SUPABASE_SERVICE_KEY),
      ],
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
