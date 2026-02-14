/**
 * Netlify Scheduled Function: Attachment Sync (Every 30 minutes)
 *
 * Proactively syncs Airtable attachments to Supabase Storage so that
 * permanent URLs are always available (Airtable URLs expire after ~2h).
 *
 * Reuses the same attachment source definitions and sync logic as
 * the manual sync-attachments.js function.
 *
 * Schedule: Every 30 minutes (*/30 * * * *)
 *
 * Logs results to the `attachment_sync_log` table in Supabase for
 * status monitoring in the Admin Panel.
 *
 * Environment variables:
 *   - AIRTABLE_TOKEN
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { logApiCall, estimateAirtableCost } from './shared/apiLogger.js';
import {
  AIRTABLE_BASE, TABLES,
  ACQUISITION_DETAIL_FIELDS as ADF,
  INSTALLATION_FIELDS as IF_,
  TASK_FIELDS as TF,
} from './shared/airtableFields.js';

// ═══════════════════════════════════════════════
//  SCHEDULE CONFIG
// ═══════════════════════════════════════════════

export const config = {
  schedule: '*/30 * * * *',
};

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════

const STORAGE_BUCKET = 'attachments';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_PROCESSING_TIME_MS = 120_000; // 2 minutes (scheduled functions have 15min budget, be conservative)

const ATTACHMENT_SOURCES = [
  {
    name: 'acquisition_images',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.IMAGES,
    storageDirField: 'images_akquise',
    fetchFields: ['Akquise ID', ADF.IMAGES],
  },
  {
    name: 'acquisition_vertrag',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.VERTRAG_PDF,
    storageDirField: 'vertrag_pdf',
    fetchFields: ['Akquise ID', ADF.VERTRAG_PDF],
  },
  {
    name: 'acquisition_faw',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.FAW_DATA_ATTACHMENT,
    storageDirField: 'faw_data_attachment',
    fetchFields: ['Akquise ID', ADF.FAW_DATA_ATTACHMENT],
  },
  {
    name: 'installationen_protokoll',
    tableId: TABLES.INSTALLATIONEN,
    tableName: 'installationen',
    fieldName: IF_.PROTOCOL,
    storageDirField: 'installationsprotokoll',
    fetchFields: [IF_.INSTALL_DATE, IF_.PROTOCOL],
  },
  {
    name: 'tasks_attachments',
    tableId: TABLES.TASKS,
    tableName: 'tasks',
    fieldName: TF.ATTACHMENTS,
    storageDirField: 'attachments',
    fetchFields: [TF.TITLE, TF.ATTACHMENTS],
  },
];

// ═══════════════════════════════════════════════
//  AIRTABLE FETCH (paginated, with rate-limit retry)
// ═══════════════════════════════════════════════

async function fetchAllAirtable(token, tableId, fields) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let allRecords = [];
  let offset = null;
  let retryCount = 0;

  do {
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 429) {
      retryCount++;
      const waitMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
      console.warn(`[sync-attachments-scheduled] Rate limited on ${tableId}, waiting ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    retryCount = 0;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sync-attachments-scheduled] Airtable error ${tableId}: ${res.status} ${errText.substring(0, 200)}`);
      break;
    }

    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);

  return allRecords;
}

// ═══════════════════════════════════════════════
//  SUPABASE HELPERS
// ═══════════════════════════════════════════════

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

    const res = await fetch(`${supabaseUrl}/rest/v1/attachment_cache?${params}`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });

    if (!res.ok) {
      console.error(`[sync-attachments-scheduled] Failed to fetch cached keys: ${res.status}`);
      break;
    }

    const rows = await res.json();
    for (const row of rows) {
      cachedKeys.add(`${row.airtable_record_id}|${row.airtable_field}|${row.original_filename}`);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return cachedKeys;
}

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = await res.arrayBuffer();
  return { buffer, contentType, size: buffer.byteLength };
}

async function uploadToStorage(supabaseUrl, serviceKey, storagePath, buffer, contentType) {
  const url = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`;
  const res = await fetch(url, {
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
    throw new Error(`Storage upload failed: ${res.status} ${errText.substring(0, 200)}`);
  }

  return res.json();
}

function getPublicUrl(supabaseUrl, storagePath) {
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

async function insertCacheRecord(supabaseUrl, serviceKey, record) {
  const res = await fetch(`${supabaseUrl}/rest/v1/attachment_cache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(record),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cache insert failed: ${res.status} ${errText.substring(0, 200)}`);
  }
}

function sanitizeFilename(filename) {
  if (!filename) return 'unnamed';
  return filename
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.\-]/g, '')
    .substring(0, 200);
}

// ═══════════════════════════════════════════════
//  SYNC LOG — write results to attachment_sync_log
// ═══════════════════════════════════════════════

async function writeSyncLog(supabaseUrl, serviceKey, logEntry) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/attachment_sync_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(logEntry),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[sync-attachments-scheduled] Failed to write sync log: ${res.status} ${errText.substring(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[sync-attachments-scheduled] Sync log write error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
//  PROCESS A SINGLE SOURCE
// ═══════════════════════════════════════════════

async function processSource(source, token, supabaseUrl, serviceKey, cachedKeys, startTime) {
  const stats = {
    name: source.name,
    recordsFetched: 0,
    attachmentsFound: 0,
    alreadyCached: 0,
    uploaded: 0,
    skippedTooLarge: 0,
    errors: 0,
    errorDetails: [],
  };

  const records = await fetchAllAirtable(token, source.tableId, source.fetchFields);
  stats.recordsFetched = records.length;

  const toProcess = [];

  for (const rec of records) {
    const attachments = rec.fields[source.fieldName];
    if (!Array.isArray(attachments) || attachments.length === 0) continue;

    for (const att of attachments) {
      if (!att.url || !att.filename) continue;

      stats.attachmentsFound++;
      const cacheKey = `${rec.id}|${source.fieldName}|${att.filename}`;

      if (cachedKeys.has(cacheKey)) {
        stats.alreadyCached++;
        continue;
      }

      if (att.size && att.size > MAX_FILE_SIZE) {
        stats.skippedTooLarge++;
        continue;
      }

      toProcess.push({
        recordId: rec.id,
        attachment: att,
        source,
      });
    }
  }

  console.log(`[sync-attachments-scheduled] ${source.name}: ${stats.attachmentsFound} found, ${stats.alreadyCached} cached, ${toProcess.length} to upload`);

  let processed = 0;
  for (const item of toProcess) {
    if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
      console.log(`[sync-attachments-scheduled] Time budget exceeded, stopping. Processed ${processed}/${toProcess.length}`);
      break;
    }

    const { recordId, attachment, source: src } = item;
    const safeFilename = sanitizeFilename(attachment.filename);
    const storagePath = `${src.tableName}/${recordId}/${src.storageDirField}/${safeFilename}`;

    try {
      const { buffer, contentType, size } = await downloadFile(attachment.url);

      if (size > MAX_FILE_SIZE) {
        stats.skippedTooLarge++;
        continue;
      }

      await uploadToStorage(supabaseUrl, serviceKey, storagePath, buffer, contentType);
      const publicUrl = getPublicUrl(supabaseUrl, storagePath);

      await insertCacheRecord(supabaseUrl, serviceKey, {
        airtable_record_id: recordId,
        airtable_table: src.tableName,
        airtable_field: src.fieldName,
        original_filename: attachment.filename,
        original_url: attachment.url,
        storage_path: storagePath,
        public_url: publicUrl,
        file_size: size,
        mime_type: attachment.type || contentType,
      });

      stats.uploaded++;
      processed++;

      if (processed % 10 === 0) {
        console.log(`[sync-attachments-scheduled] ${src.name}: ${processed}/${toProcess.length} uploaded...`);
      }
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push({
        recordId,
        filename: attachment.filename,
        error: err.message,
      });
      console.error(`[sync-attachments-scheduled] Error uploading ${safeFilename} for ${recordId}: ${err.message}`);
    }
  }

  return stats;
}

// ═══════════════════════════════════════════════
//  MAIN HANDLER (Scheduled — no request/response)
// ═══════════════════════════════════════════════

export default async () => {
  const startTime = Date.now();
  console.log('[sync-attachments-scheduled] Starting scheduled attachment sync...');

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!AIRTABLE_TOKEN || !SUPABASE_SERVICE_KEY) {
    console.error('[sync-attachments-scheduled] Missing required environment variables');
    return;
  }

  try {
    // Fetch cached keys for all tables (deduplicated)
    const uniqueTables = [...new Set(ATTACHMENT_SOURCES.map(s => s.tableName))];
    const cachedKeysMap = {};
    for (const tableName of uniqueTables) {
      cachedKeysMap[tableName] = await fetchCachedKeys(SUPABASE_URL, SUPABASE_SERVICE_KEY, tableName);
      console.log(`[sync-attachments-scheduled] Loaded ${cachedKeysMap[tableName].size} cached keys for ${tableName}`);
    }

    // Process each source sequentially
    const results = [];
    for (const source of ATTACHMENT_SOURCES) {
      if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
        console.log('[sync-attachments-scheduled] Time budget exceeded, skipping remaining sources');
        break;
      }

      const cachedKeys = cachedKeysMap[source.tableName];
      const stats = await processSource(
        source, AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
        cachedKeys, startTime
      );
      results.push(stats);
    }

    const durationMs = Date.now() - startTime;

    // Aggregate totals
    const totals = {
      recordsFetched: results.reduce((s, r) => s + r.recordsFetched, 0),
      attachmentsFound: results.reduce((s, r) => s + r.attachmentsFound, 0),
      alreadyCached: results.reduce((s, r) => s + r.alreadyCached, 0),
      uploaded: results.reduce((s, r) => s + r.uploaded, 0),
      skippedTooLarge: results.reduce((s, r) => s + r.skippedTooLarge, 0),
      errors: results.reduce((s, r) => s + r.errors, 0),
    };

    console.log(`[sync-attachments-scheduled] Complete in ${(durationMs / 1000).toFixed(1)}s — ${totals.uploaded} uploaded, ${totals.alreadyCached} cached, ${totals.errors} errors`);

    // Write sync log to Supabase
    await writeSyncLog(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      sync_type: 'scheduled',
      status: totals.errors === 0 ? 'success' : 'partial',
      records_synced: totals.uploaded,
      attachments_found: totals.attachmentsFound,
      already_cached: totals.alreadyCached,
      errors_count: totals.errors,
      duration_ms: durationMs,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      error_message: totals.errors > 0
        ? results.flatMap(r => r.errorDetails).slice(0, 5).map(e => `${e.recordId}: ${e.error}`).join('; ')
        : null,
      details: JSON.stringify({
        sources: results.map(r => ({
          name: r.name,
          records: r.recordsFetched,
          found: r.attachmentsFound,
          cached: r.alreadyCached,
          uploaded: r.uploaded,
          errors: r.errors,
        })),
      }),
    });

    // API usage logging
    logApiCall({
      functionName: 'sync-attachments-scheduled',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-attachments-scheduled',
      durationMs,
      statusCode: 200,
      success: totals.errors === 0,
      recordsCount: totals.recordsFetched,
      estimatedCostCents: estimateAirtableCost(totals.recordsFetched),
      metadata: {
        uploaded: totals.uploaded,
        alreadyCached: totals.alreadyCached,
        errors: totals.errors,
      },
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error('[sync-attachments-scheduled] Fatal error:', err);

    // Log the failure
    await writeSyncLog(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      sync_type: 'scheduled',
      status: 'error',
      records_synced: 0,
      attachments_found: 0,
      already_cached: 0,
      errors_count: 1,
      duration_ms: durationMs,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      error_message: err.message,
      details: null,
    });

    logApiCall({
      functionName: 'sync-attachments-scheduled',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-attachments-scheduled',
      durationMs,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });
  }
};
