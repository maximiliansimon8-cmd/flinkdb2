/**
 * Netlify Background Function: Attachment Sync
 *
 * Downloads Airtable attachments and uploads them to Supabase Storage
 * with permanent public URLs. Triggered by sync-attachments-scheduled.js.
 *
 * KEY DIFFERENCE from previous approach:
 *   - Fetches FRESH attachment URLs directly from Airtable API
 *   - Previous version read expired URLs from Supabase JSONB → downloads failed
 *   - Uses LAST_MODIFIED_TIME() for incremental sync (same pattern as trigger-sync-background.js)
 *
 * Supports 3 Airtable tables:
 *   - Acquisition: images_akquise, Vertrag (PDF), FAW_data_attachment
 *   - Tasks: Attachments
 *   - Installationen: Installationsprotokoll
 *
 * Auth: Origin check (internal trigger only)
 * Timeout: 15 minutes (background function)
 */

import { logApiCall } from './shared/apiLogger.js';
import { AIRTABLE_BASE, TABLES } from './shared/airtableFields.js';
import { getAllowedOrigin, forbiddenResponse, checkRateLimit, getClientIP, rateLimitResponse } from './shared/security.js';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STORAGE_BUCKET = 'attachments';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_PROCESSING_TIME_MS = 14 * 60 * 1000; // 14 min (leave 1 min safety)
const PARALLEL_CONCURRENCY = 8;
const INTER_TABLE_PAUSE_MS = 500;

/**
 * Attachment sources grouped by Airtable table.
 * Fields within the same table are fetched in one API call.
 */
const TABLE_GROUPS = [
  {
    name: 'acquisition',
    tableId: TABLES.ACQUISITION,
    syncMetadataKey: 'attachment_sync_acquisition',
    fetchFields: ['images_akquise', 'Vertrag (PDF)', 'FAW_data_attachment'],
    attachmentFields: [
      { airtableField: 'images_akquise', storageDir: 'images_akquise', cacheField: 'images_akquise' },
      { airtableField: 'Vertrag (PDF)', storageDir: 'vertrag_pdf', cacheField: 'Vertrag (PDF)' },
      { airtableField: 'FAW_data_attachment', storageDir: 'faw_data_attachment', cacheField: 'FAW_data_attachment' },
    ],
  },
  {
    name: 'installationen',
    tableId: TABLES.INSTALLATIONEN,
    syncMetadataKey: 'attachment_sync_installationen',
    fetchFields: ['Installationsprotokoll'],
    attachmentFields: [
      { airtableField: 'Installationsprotokoll', storageDir: 'installationsprotokoll', cacheField: 'Installationsprotokoll' },
    ],
  },
  {
    name: 'tasks',
    tableId: TABLES.TASKS,
    syncMetadataKey: 'attachment_sync_tasks',
    fetchFields: ['Attachments'],
    attachmentFields: [
      { airtableField: 'Attachments', storageDir: 'attachments', cacheField: 'Attachments' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  AIRTABLE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch records from Airtable with pagination and rate-limit handling.
 * If sinceISO is provided, only fetches records modified after that time.
 */
async function fetchFromAirtable(token, tableId, fields, sinceISO = null) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let filterParam = '';
  if (sinceISO) {
    filterParam = `&filterByFormula=${encodeURIComponent(`LAST_MODIFIED_TIME()>'${sinceISO}'`)}`;
  }

  const allRecords = [];
  let offset = null;
  let retryCount = 0;

  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}${filterParam}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 429) {
      retryCount++;
      const waitMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
      console.warn(`[att-sync] Rate limited on ${tableId}, waiting ${waitMs}ms (retry ${retryCount})...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    retryCount = 0;

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[att-sync] Airtable error ${tableId}: ${res.status} ${errText.substring(0, 200)}`);
      throw new Error(`Airtable ${res.status}`);
    }

    const data = await res.json();
    allRecords.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return allRecords;
}

// ═══════════════════════════════════════════════════════════════
//  SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════

async function supabaseFetch(supabaseUrl, serviceKey, path, options = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      ...options.headers,
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

async function getLastSyncTime(supabaseUrl, serviceKey, metadataKey) {
  try {
    const result = await supabaseFetch(supabaseUrl, serviceKey,
      `sync_metadata?table_name=eq.${metadataKey}&select=last_sync_timestamp,last_sync_status&limit=1`);
    if (!result.ok || !result.data?.length) return { timestamp: null, status: null };
    return {
      timestamp: result.data[0].last_sync_timestamp,
      status: result.data[0].last_sync_status,
    };
  } catch {
    return { timestamp: null, status: null };
  }
}

async function updateSyncMetadata(supabaseUrl, serviceKey, metadataKey, updates) {
  const payload = {
    table_name: metadataKey,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  // Try upsert first
  const res = await supabaseFetch(supabaseUrl, serviceKey, 'sync_metadata', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  // Fallback: PATCH
  await supabaseFetch(supabaseUrl, serviceKey,
    `sync_metadata?table_name=eq.${encodeURIComponent(metadataKey)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates),
    });
}

/**
 * Load all cached keys for a table from attachment_cache.
 * Returns a Set of "recordId|fieldName|filename" strings for O(1) lookup.
 */
async function fetchCachedKeys(supabaseUrl, serviceKey, tableName) {
  const cachedKeys = new Set();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const params = new URLSearchParams({
      select: 'airtable_record_id,airtable_field,original_filename',
      airtable_table: `eq.${tableName}`,
      limit: String(pageSize),
      offset: String(offset),
    });

    const result = await supabaseFetch(supabaseUrl, serviceKey, `attachment_cache?${params}`);
    if (!result.ok || !result.data?.length) break;

    for (const row of result.data) {
      cachedKeys.add(`${row.airtable_record_id}|${row.airtable_field}|${row.original_filename}`);
    }
    if (result.data.length < pageSize) break;
    offset += pageSize;
  }

  return cachedKeys;
}

// ═══════════════════════════════════════════════════════════════
//  DOWNLOAD & UPLOAD
// ═══════════════════════════════════════════════════════════════

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}`);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = await res.arrayBuffer();
  return { buffer, contentType, size: buffer.byteLength };
}

async function uploadToStorage(supabaseUrl, serviceKey, storagePath, buffer, contentType) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload ${res.status}: ${errText.substring(0, 100)}`);
  }
}

function sanitizeFilename(filename) {
  if (!filename) return 'unnamed';
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.\-]/g, '').substring(0, 200);
}

/**
 * Process items in parallel batches with time-boxing.
 */
async function processParallelBatch(items, supabaseUrl, serviceKey, startTime) {
  const stats = { uploaded: 0, errors: 0, skippedLarge: 0, errorDetails: [] };
  let idx = 0;

  while (idx < items.length) {
    if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
      console.log(`[att-sync] Time budget hit after ${stats.uploaded} uploads, ${items.length - idx} remaining`);
      break;
    }

    const batch = items.slice(idx, idx + PARALLEL_CONCURRENCY);
    idx += batch.length;

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const safe = sanitizeFilename(item.attachment.filename);
        const path = `${item.tableName}/${item.recordId}/${item.storageDir}/${safe}`;
        const { buffer, contentType, size } = await downloadFile(item.attachment.url);
        if (size > MAX_FILE_SIZE) return 'skipped';

        await uploadToStorage(supabaseUrl, serviceKey, path, buffer, contentType);
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;

        // Upsert cache entry
        await supabaseFetch(supabaseUrl, serviceKey,
          'attachment_cache?on_conflict=airtable_record_id,airtable_field,original_filename', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              airtable_record_id: item.recordId,
              airtable_table: item.tableName,
              airtable_field: item.cacheField,
              original_filename: item.attachment.filename,
              original_url: item.attachment.url,
              storage_path: path,
              public_url: publicUrl,
              file_size: size,
              mime_type: item.attachment.type || contentType,
            }),
          });

        return 'uploaded';
      })
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        if (r.value === 'uploaded') stats.uploaded++;
        else if (r.value === 'skipped') stats.skippedLarge++;
      } else {
        stats.errors++;
        if (stats.errorDetails.length < 10) {
          stats.errorDetails.push({
            record: batch[i].recordId,
            file: batch[i].attachment.filename,
            err: r.reason?.message,
          });
        }
      }
    }

    if (stats.uploaded > 0 && stats.uploaded % 50 === 0) {
      console.log(`[att-sync] Progress: ${stats.uploaded} uploaded, ${stats.errors} errors`);
    }
  }

  return { ...stats, remaining: Math.max(0, items.length - idx) };
}

// ═══════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export default async (request) => {
  // Auth: only allow internal triggers
  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  // Rate limit: max 5 triggers per minute
  const clientIP = getClientIP(request);
  const limit = checkRateLimit(`sync-attachments-bg:${clientIP}`, 5, 60_000);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterMs, origin);

  const startTime = Date.now();
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!AIRTABLE_TOKEN || !SUPABASE_KEY) {
    console.error('[att-sync] Missing AIRTABLE_TOKEN or SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Missing credentials', { status: 500 });
  }

  // Parse trigger body
  let mode = 'incremental';
  try {
    const body = await request.json();
    mode = body.mode || 'incremental';
    console.log(`[att-sync] Starting ${mode} sync (source: ${body.source || 'unknown'})`);
  } catch {
    console.log(`[att-sync] Starting ${mode} sync (no body)`);
  }

  const globalStats = {
    tablesProcessed: [],
    totalUploaded: 0,
    totalFound: 0,
    totalCached: 0,
    totalErrors: 0,
    totalRemaining: 0,
    perTable: {},
  };

  try {
    // Process each table group (Acquisition first — highest priority)
    for (const group of TABLE_GROUPS) {
      // Time check before starting a new table
      if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
        console.log(`[att-sync] Time budget exhausted, skipping ${group.name}`);
        break;
      }

      console.log(`[att-sync] ─── Processing ${group.name} ───`);
      const tableStart = Date.now();

      // 1. Get last sync timestamp
      const { timestamp: lastSync, status: lastStatus } = await getLastSyncTime(
        SUPABASE_URL, SUPABASE_KEY, group.syncMetadataKey
      );

      // Determine if this should be a full sync for this table
      const isInitialSync = !lastSync || lastStatus === 'initial_sync_in_progress';
      const isFullSync = mode === 'full' || isInitialSync;
      const sinceISO = isFullSync ? null : lastSync;

      console.log(`[att-sync] ${group.name}: ${isFullSync ? 'FULL' : 'incremental'} sync` +
        (sinceISO ? ` (since ${sinceISO})` : ' (all records)'));

      // 2. Fetch records from Airtable API (FRESH URLs!)
      let records;
      try {
        records = await fetchFromAirtable(AIRTABLE_TOKEN, group.tableId, group.fetchFields, sinceISO);
        console.log(`[att-sync] ${group.name}: ${records.length} records from Airtable`);

        logApiCall({
          functionName: 'trigger-sync-attachments-background',
          service: 'airtable',
          method: 'GET',
          endpoint: `${group.name} attachment fetch`,
          durationMs: Date.now() - tableStart,
          statusCode: 200,
          success: true,
          recordsCount: records.length,
        });
      } catch (err) {
        console.error(`[att-sync] ${group.name}: Airtable fetch failed: ${err.message}`);
        globalStats.perTable[group.name] = { error: err.message };
        continue;
      }

      // 3. Load cached keys for this table
      const cachedKeys = await fetchCachedKeys(SUPABASE_URL, SUPABASE_KEY, group.name);
      console.log(`[att-sync] ${group.name}: ${cachedKeys.size} already cached`);

      // 4. Extract uncached attachments
      const toProcess = [];
      let found = 0;
      let cached = 0;
      let skippedLarge = 0;

      for (const rec of records) {
        const fields = rec.fields || {};
        for (const af of group.attachmentFields) {
          const atts = fields[af.airtableField];
          if (!Array.isArray(atts)) continue;
          for (const att of atts) {
            if (!att.url || !att.filename) continue;
            found++;
            if (cachedKeys.has(`${rec.id}|${af.cacheField}|${att.filename}`)) { cached++; continue; }
            if (att.size && att.size > MAX_FILE_SIZE) { skippedLarge++; continue; }
            toProcess.push({
              recordId: rec.id,
              tableName: group.name,
              storageDir: af.storageDir,
              cacheField: af.cacheField,
              attachment: att,
            });
          }
        }
      }

      console.log(`[att-sync] ${group.name}: ${found} found, ${cached} cached, ${toProcess.length} to upload, ${skippedLarge} too large`);

      // 5. Download & upload
      let tableResult = { uploaded: 0, errors: 0, remaining: 0, errorDetails: [] };
      if (toProcess.length > 0) {
        tableResult = await processParallelBatch(toProcess, SUPABASE_URL, SUPABASE_KEY, startTime);
        console.log(`[att-sync] ${group.name}: ${tableResult.uploaded} uploaded, ${tableResult.errors} errors, ${tableResult.remaining} remaining`);
      }

      // 6. Update sync_metadata
      const allDone = toProcess.length === 0 || (tableResult.remaining === 0 && tableResult.errors === 0);
      if (isInitialSync && !allDone) {
        // Still catching up — don't set timestamp yet
        await updateSyncMetadata(SUPABASE_URL, SUPABASE_KEY, group.syncMetadataKey, {
          last_sync_status: 'initial_sync_in_progress',
          records_fetched: records.length,
          records_upserted: tableResult.uploaded,
        });
      } else {
        // Normal or completed initial sync
        await updateSyncMetadata(SUPABASE_URL, SUPABASE_KEY, group.syncMetadataKey, {
          last_sync_timestamp: new Date().toISOString(),
          last_sync_status: 'success',
          records_fetched: records.length,
          records_upserted: tableResult.uploaded,
        });
      }

      // Accumulate global stats
      globalStats.tablesProcessed.push(group.name);
      globalStats.totalUploaded += tableResult.uploaded;
      globalStats.totalFound += found;
      globalStats.totalCached += cached;
      globalStats.totalErrors += tableResult.errors;
      globalStats.totalRemaining += tableResult.remaining;
      globalStats.perTable[group.name] = {
        found, cached, uploaded: tableResult.uploaded,
        errors: tableResult.errors, remaining: tableResult.remaining,
      };

      // Pause between tables (Airtable rate limit awareness)
      if (TABLE_GROUPS.indexOf(group) < TABLE_GROUPS.length - 1) {
        await new Promise(r => setTimeout(r, INTER_TABLE_PAUSE_MS));
      }
    }

    const durationMs = Date.now() - startTime;
    const status = globalStats.totalErrors === 0
      ? (globalStats.totalRemaining === 0 ? 'success' : 'partial')
      : 'partial';

    console.log(`[att-sync] ═══ DONE in ${(durationMs / 1000).toFixed(1)}s ═══`);
    console.log(`[att-sync] Uploaded: ${globalStats.totalUploaded}, Cached: ${globalStats.totalCached}, Errors: ${globalStats.totalErrors}, Remaining: ${globalStats.totalRemaining}`);

    // Write sync log
    try {
      await supabaseFetch(SUPABASE_URL, SUPABASE_KEY, 'attachment_sync_log', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          sync_type: mode,
          status,
          tables_processed: globalStats.tablesProcessed,
          records_synced: globalStats.totalUploaded,
          attachments_found: globalStats.totalFound,
          already_cached: globalStats.totalCached,
          errors_count: globalStats.totalErrors,
          duration_ms: durationMs,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          error_message: globalStats.totalErrors > 0
            ? Object.entries(globalStats.perTable)
                .filter(([, v]) => v.errors > 0)
                .map(([k, v]) => `${k}: ${v.errors} errors`)
                .join('; ')
            : null,
          details: globalStats.perTable,
        }),
      });
    } catch (logErr) {
      console.warn('[att-sync] Sync log write failed:', logErr.message);
    }

    logApiCall({
      functionName: 'trigger-sync-attachments-background',
      service: 'supabase+airtable',
      method: 'POST',
      endpoint: '/trigger-sync-attachments-background',
      durationMs,
      statusCode: 200,
      success: status === 'success',
      recordsCount: globalStats.totalFound,
      metadata: {
        mode,
        uploaded: globalStats.totalUploaded,
        cached: globalStats.totalCached,
        errors: globalStats.totalErrors,
        remaining: globalStats.totalRemaining,
      },
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error('[att-sync] Fatal error:', err.message);

    try {
      await supabaseFetch(SUPABASE_URL, SUPABASE_KEY, 'attachment_sync_log', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          sync_type: mode,
          status: 'error',
          tables_processed: globalStats.tablesProcessed,
          records_synced: globalStats.totalUploaded,
          attachments_found: globalStats.totalFound,
          already_cached: globalStats.totalCached,
          errors_count: 1,
          duration_ms: durationMs,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          error_message: err.message,
          details: globalStats.perTable,
        }),
      });
    } catch (_) { /* silent */ }
  }

  return new Response('Accepted', { status: 202 });
};
