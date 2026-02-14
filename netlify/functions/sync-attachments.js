/**
 * Netlify Function: Sync Airtable Attachments → Supabase Storage
 *
 * Downloads attachment files (PDFs, photos) from Airtable and uploads them
 * to Supabase Storage, creating permanent URLs that never expire.
 *
 * Airtable attachment URLs expire after ~2 hours, which breaks saved links,
 * cached pages, and any offline/delayed access. This function solves that by
 * mirroring all attachments into Supabase Storage.
 *
 * Tables & fields synced:
 *   - Acquisition_DB: images_akquise, Vertrag (PDF), FAW_data_attachment
 *   - Installationen: Installationsprotokoll
 *   - Tasks: Attachments
 *
 * Storage paths: {table}/{record_id}/{field}/{filename}
 * Bucket: "attachments" (public)
 *
 * Usage:
 *   GET /api/sync-attachments              — sync all tables
 *   GET /api/sync-attachments?table=tasks  — sync only tasks
 *   GET /api/sync-attachments?limit=50     — process max 50 attachments
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
//  CONSTANTS
// ═══════════════════════════════════════════════

const STORAGE_BUCKET = 'attachments';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_PROCESSING_TIME_MS = 22_000;  // Stop before 26s Netlify timeout

/**
 * Attachment source definitions.
 * Each entry describes which Airtable table/fields contain attachments.
 */
const ATTACHMENT_SOURCES = [
  {
    name: 'acquisition_images',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.IMAGES,                   // 'images_akquise'
    storageDirField: 'images_akquise',
    fetchFields: ['Akquise ID', ADF.IMAGES],
  },
  {
    name: 'acquisition_vertrag',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.VERTRAG_PDF,              // 'Vertrag (PDF)'
    storageDirField: 'vertrag_pdf',
    fetchFields: ['Akquise ID', ADF.VERTRAG_PDF],
  },
  {
    name: 'acquisition_faw',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.FAW_DATA_ATTACHMENT,      // 'FAW_data_attachment'
    storageDirField: 'faw_data_attachment',
    fetchFields: ['Akquise ID', ADF.FAW_DATA_ATTACHMENT],
  },
  {
    name: 'installationen_protokoll',
    tableId: TABLES.INSTALLATIONEN,
    tableName: 'installationen',
    fieldName: IF_.PROTOCOL,                 // 'Installationsprotokoll'
    storageDirField: 'installationsprotokoll',
    fetchFields: [IF_.INSTALL_DATE, IF_.PROTOCOL],
  },
  {
    name: 'tasks_attachments',
    tableId: TABLES.TASKS,
    tableName: 'tasks',
    fieldName: TF.ATTACHMENTS,               // 'Attachments'
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
      console.warn(`[sync-attachments] Rate limited on ${tableId}, waiting ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    retryCount = 0;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sync-attachments] Airtable error ${tableId}: ${res.status} ${errText.substring(0, 200)}`);
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

/**
 * Fetch all already-cached attachment keys from attachment_cache.
 * Returns a Set of "recordId|field|filename" strings for fast lookup.
 */
async function fetchCachedKeys(supabaseUrl, serviceKey, tableName) {
  const cachedKeys = new Set();
  let offset = 0;
  const pageSize = 1000;

  // Fetch in pages (Supabase default limit is 1000)
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
      console.error(`[sync-attachments] Failed to fetch cached keys: ${res.status}`);
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

/**
 * Download a file from a URL and return it as an ArrayBuffer with metadata.
 */
async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const buffer = await res.arrayBuffer();
  return { buffer, contentType, size: buffer.byteLength };
}

/**
 * Upload a file to Supabase Storage.
 * Uses the Storage REST API directly.
 */
async function uploadToStorage(supabaseUrl, serviceKey, storagePath, buffer, contentType) {
  const url = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': contentType,
      // x-upsert: true allows overwriting if file already exists
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

/**
 * Get the public URL for a file in Supabase Storage.
 */
function getPublicUrl(supabaseUrl, storagePath) {
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

/**
 * Insert a record into the attachment_cache table.
 */
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

// ═══════════════════════════════════════════════
//  FILENAME SANITIZATION
// ═══════════════════════════════════════════════

/**
 * Sanitize a filename for use in Storage paths.
 * Removes problematic characters but keeps the file extension.
 */
function sanitizeFilename(filename) {
  if (!filename) return 'unnamed';
  // Replace spaces with underscores, remove anything that's not alphanumeric, dash, underscore, or dot
  return filename
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.\-]/g, '')
    .substring(0, 200); // Limit length
}

// ═══════════════════════════════════════════════
//  MAIN SYNC LOGIC
// ═══════════════════════════════════════════════

/**
 * Process a single attachment source (one table + field combination).
 * Returns stats about what was processed.
 */
async function processSource(source, token, supabaseUrl, serviceKey, cachedKeys, limit, startTime) {
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

  // Fetch records from Airtable
  const records = await fetchAllAirtable(token, source.tableId, source.fetchFields);
  stats.recordsFetched = records.length;

  // Collect all attachments that need processing
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

      // Check file size from Airtable metadata
      if (att.size && att.size > MAX_FILE_SIZE) {
        stats.skippedTooLarge++;
        console.log(`[sync-attachments] Skipping ${att.filename} (${(att.size / 1024 / 1024).toFixed(1)}MB > 50MB limit)`);
        continue;
      }

      toProcess.push({
        recordId: rec.id,
        attachment: att,
        source,
      });
    }
  }

  console.log(`[sync-attachments] ${source.name}: ${stats.attachmentsFound} attachments found, ${stats.alreadyCached} already cached, ${toProcess.length} to upload`);

  // Process attachments (respect limit and time budget)
  let processed = 0;
  for (const item of toProcess) {
    // Check time budget
    if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
      console.log(`[sync-attachments] Time budget exceeded, stopping. Processed ${processed}/${toProcess.length}`);
      break;
    }

    // Check item limit
    if (limit > 0 && processed >= limit) {
      console.log(`[sync-attachments] Limit of ${limit} reached, stopping.`);
      break;
    }

    const { recordId, attachment, source: src } = item;
    const safeFilename = sanitizeFilename(attachment.filename);
    const storagePath = `${src.tableName}/${recordId}/${src.storageDirField}/${safeFilename}`;

    try {
      // Download from Airtable
      const { buffer, contentType, size } = await downloadFile(attachment.url);

      // Double-check actual size
      if (size > MAX_FILE_SIZE) {
        stats.skippedTooLarge++;
        console.log(`[sync-attachments] Skipping ${safeFilename} (actual ${(size / 1024 / 1024).toFixed(1)}MB > 50MB)`);
        continue;
      }

      // Upload to Supabase Storage
      await uploadToStorage(supabaseUrl, serviceKey, storagePath, buffer, contentType);

      // Get permanent public URL
      const publicUrl = getPublicUrl(supabaseUrl, storagePath);

      // Insert into cache table
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
        console.log(`[sync-attachments] ${src.name}: ${processed}/${toProcess.length} uploaded...`);
      }
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push({
        recordId,
        filename: attachment.filename,
        error: err.message,
      });
      console.error(`[sync-attachments] Error uploading ${safeFilename} for ${recordId}: ${err.message}`);
    }
  }

  return stats;
}

// ═══════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════

export default async (request) => {
  const startTime = Date.now();

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!AIRTABLE_TOKEN || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env vars (AIRTABLE_TOKEN, SUPABASE_SERVICE_ROLE_KEY)' }), {
      status: 500, headers,
    });
  }

  // Parse query parameters
  const url = new URL(request.url);
  const tableFilter = url.searchParams.get('table');  // e.g. "tasks", "acquisition", "installationen"
  const limitParam = parseInt(url.searchParams.get('limit') || '0', 10);

  console.log(`[sync-attachments] Starting. table=${tableFilter || 'all'}, limit=${limitParam || 'none'}`);

  try {
    // Determine which sources to process
    let sources = ATTACHMENT_SOURCES;
    if (tableFilter) {
      sources = ATTACHMENT_SOURCES.filter(s =>
        s.tableName === tableFilter || s.name === tableFilter || s.name.startsWith(tableFilter)
      );
      if (sources.length === 0) {
        return new Response(JSON.stringify({
          error: `Unknown table filter: "${tableFilter}"`,
          validTables: ['acquisition', 'installationen', 'tasks'],
          validNames: ATTACHMENT_SOURCES.map(s => s.name),
        }), { status: 400, headers });
      }
    }

    // Fetch cached keys for all relevant tables (deduplicated)
    const uniqueTables = [...new Set(sources.map(s => s.tableName))];
    const cachedKeysMap = {};
    for (const tableName of uniqueTables) {
      cachedKeysMap[tableName] = await fetchCachedKeys(SUPABASE_URL, SUPABASE_SERVICE_KEY, tableName);
      console.log(`[sync-attachments] Loaded ${cachedKeysMap[tableName].size} cached keys for ${tableName}`);
    }

    // Process each source sequentially (to respect time budget)
    const results = [];
    let totalLimit = limitParam;

    for (const source of sources) {
      // Check time budget before starting a new source
      if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
        console.log(`[sync-attachments] Time budget exceeded, skipping remaining sources`);
        break;
      }

      const cachedKeys = cachedKeysMap[source.tableName];
      const sourceLimit = totalLimit; // Each source can use remaining budget

      const stats = await processSource(
        source, AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
        cachedKeys, sourceLimit, startTime
      );

      results.push(stats);

      // Subtract uploaded from remaining limit
      if (totalLimit > 0) {
        totalLimit = Math.max(0, totalLimit - stats.uploaded);
        if (totalLimit === 0) break;
      }
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

    console.log(`[sync-attachments] Complete in ${(durationMs / 1000).toFixed(1)}s — ${totals.uploaded} uploaded, ${totals.alreadyCached} cached, ${totals.errors} errors`);

    logApiCall({
      functionName: 'sync-attachments',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-attachments',
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

    return new Response(JSON.stringify({
      success: true,
      duration_ms: durationMs,
      filter: tableFilter || 'all',
      totals,
      sources: results.map(r => ({
        name: r.name,
        records: r.recordsFetched,
        attachments: r.attachmentsFound,
        cached: r.alreadyCached,
        uploaded: r.uploaded,
        skipped_too_large: r.skippedTooLarge,
        errors: r.errors,
        error_details: r.errorDetails.length > 0 ? r.errorDetails.slice(0, 10) : undefined,
      })),
    }), { status: 200, headers });
  } catch (err) {
    console.error('[sync-attachments] Fatal error:', err);

    logApiCall({
      functionName: 'sync-attachments',
      service: 'airtable',
      method: 'GET',
      endpoint: '/sync-attachments',
      durationMs: Date.now() - startTime,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });

    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      duration_ms: Date.now() - startTime,
    }), { status: 500, headers });
  }
};
