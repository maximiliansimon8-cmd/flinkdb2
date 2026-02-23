/**
 * Netlify Function: Sync Airtable Attachments → Supabase Storage
 *
 * Downloads attachment files (PDFs, photos) from Airtable and uploads them
 * to Supabase Storage, creating permanent URLs that never expire.
 *
 * OPTIMIZATIONS (v2):
 *   - mode=ready: Only sync attachments for aufbaubereite records (~47 statt 10.000+)
 *     Reads attachment URLs from SUPABASE (already synced JSONB), no Airtable API needed!
 *   - mode=supabase: Read all attachment URLs from Supabase JSONB columns (no Airtable API)
 *   - Parallel downloads: 8 concurrent download+upload operations
 *   - Self-chaining: If more work remains, triggers another invocation
 *
 * Usage:
 *   GET /api/sync-attachments?mode=ready   — only aufbaubereite records (FAST, ~47 records)
 *   GET /api/sync-attachments?mode=supabase — all records from Supabase (no Airtable API)
 *   GET /api/sync-attachments              — legacy: all from Airtable API (slow)
 *   GET /api/sync-attachments?table=tasks  — legacy: filter by table
 *   GET /api/sync-attachments?limit=50     — max attachments per invocation
 *   GET /api/sync-attachments?chain=true   — auto-trigger next batch if work remains
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
const PARALLEL_CONCURRENCY = 8;         // Concurrent download+upload operations

/**
 * Attachment source definitions (used for legacy Airtable-fetch mode).
 */
const ATTACHMENT_SOURCES = [
  {
    name: 'acquisition_images',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.IMAGES,
    storageDirField: 'images_akquise',
    supabaseColumn: 'images',
    supabaseFieldName: 'images_akquise',
    fetchFields: ['Akquise ID', ADF.IMAGES],
  },
  {
    name: 'acquisition_vertrag',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.VERTRAG_PDF,
    storageDirField: 'vertrag_pdf',
    supabaseColumn: 'vertrag_pdf',
    supabaseFieldName: 'Vertrag (PDF)',
    fetchFields: ['Akquise ID', ADF.VERTRAG_PDF],
  },
  {
    name: 'acquisition_faw',
    tableId: TABLES.ACQUISITION,
    tableName: 'acquisition',
    fieldName: ADF.FAW_DATA_ATTACHMENT,
    storageDirField: 'faw_data_attachment',
    supabaseColumn: 'faw_data_attachment',
    supabaseFieldName: 'FAW_data_attachment',
    fetchFields: ['Akquise ID', ADF.FAW_DATA_ATTACHMENT],
  },
  {
    name: 'installationen_protokoll',
    tableId: TABLES.INSTALLATIONEN,
    tableName: 'installationen',
    fieldName: IF_.PROTOCOL,
    storageDirField: 'installationsprotokoll',
    supabaseColumn: null, // not in Supabase JSONB yet
    fetchFields: [IF_.INSTALL_DATE, IF_.PROTOCOL],
  },
  {
    name: 'tasks_attachments',
    tableId: TABLES.TASKS,
    tableName: 'tasks',
    fieldName: TF.ATTACHMENTS,
    storageDirField: 'attachments',
    supabaseColumn: 'attachments',
    supabaseFieldName: 'Attachments',
    fetchFields: [TF.TITLE, TF.ATTACHMENTS],
  },
];

// ═══════════════════════════════════════════════
//  AIRTABLE FETCH (legacy, paginated)
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
 * Fetch cached keys from attachment_cache.
 * Returns a Set of "recordId|field|filename" strings.
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
 * Fetch aufbaubereite acquisition record IDs from Supabase.
 * Uses the same predicate logic as the frontend (isReadyForInstall + !isStorno + !isAlreadyInstalled).
 * Returns only airtable_ids — actual attachment URLs are fetched from Airtable (they expire!).
 */
async function fetchReadyRecordIds(supabaseUrl, serviceKey) {
  const params = new URLSearchParams({
    select: 'airtable_id,lead_status,approval_status,vertrag_vorhanden,akquise_storno,post_install_storno,installations_status,display_location_status',
    lead_status: 'in.("Won / Signed","Won/Signed")',
    approval_status: 'in.("Accepted","Approved","accepted","approved")',
    akquise_storno: 'neq.true',
    limit: '500',
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/acquisition?${params}`, {
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase query failed: ${res.status} ${errText.substring(0, 200)}`);
  }

  const rows = await res.json();

  // Apply additional filters that can't be done in PostgREST
  return rows.filter(r => {
    const vv = r.vertrag_vorhanden;
    if (!(vv === true || vv === 'true' || vv === 'checked' || vv === 'YES' || vv === 'yes')) return false;
    if (r.post_install_storno === true || r.post_install_storno === 'true') return false;
    const ls = (r.lead_status || '').toLowerCase();
    if (ls.includes('storno') || ls.includes('cancelled') || ls.includes('lost')) return false;
    const statuses = Array.isArray(r.installations_status) ? r.installations_status : [];
    if (statuses.some(s => {
      const sl = (s || '').toLowerCase();
      return sl.includes('installiert') || sl.includes('live') || sl.includes('abgebrochen');
    })) return false;
    if (ls === 'live' || ls === 'installation') return false;
    const displayNames = Array.isArray(r.display_location_status) ? r.display_location_status : [];
    if (displayNames.some(s => s && s.trim().length > 0)) return false;
    return true;
  }).map(r => r.airtable_id).filter(Boolean);
}

/**
 * Fetch attachment data from Airtable for specific record IDs.
 * Uses RECORD_ID() formula to fetch only the records we need.
 * Batches into chunks of 20 to avoid URL length limits.
 */
async function fetchAirtableByIds(token, tableId, fields, recordIds) {
  const allRecords = [];
  const CHUNK_SIZE = 20;

  for (let i = 0; i < recordIds.length; i += CHUNK_SIZE) {
    const chunk = recordIds.slice(i, i + CHUNK_SIZE);
    const formula = `OR(${chunk.map(id => `RECORD_ID()='${id}'`).join(',')})`;
    const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&filterByFormula=${encodeURIComponent(formula)}&pageSize=100`;

    let retryCount = 0;
    let success = false;
    while (!success) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 429) {
        retryCount++;
        const waitMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        console.error(`[sync-attachments] Airtable fetch error: ${res.status}`);
        break;
      }

      const data = await res.json();
      allRecords.push(...(data.records || []));
      success = true;
    }
  }

  return allRecords;
}

/**
 * Fetch ALL acquisition records from Supabase (for mode=supabase).
 * Much faster than Airtable API since data is already synced.
 */
async function fetchAllAcquisitionFromSupabase(supabaseUrl, serviceKey) {
  let allRows = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const params = new URLSearchParams({
      select: 'airtable_id,images,vertrag_pdf,faw_data_attachment',
      limit: String(pageSize),
      offset: String(offset),
    });

    const res = await fetch(`${supabaseUrl}/rest/v1/acquisition?${params}`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });

    if (!res.ok) break;
    const rows = await res.json();
    allRows = allRows.concat(rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
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
  // Use on_conflict to handle duplicate filenames for same record+field
  const res = await fetch(`${supabaseUrl}/rest/v1/attachment_cache?on_conflict=airtable_record_id,airtable_field,original_filename`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(record),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Ignore duplicate key errors (file was cached between our check and insert)
    if (res.status === 409) return;
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
//  PARALLEL BATCH PROCESSOR
// ═══════════════════════════════════════════════

/**
 * Process attachments in parallel batches.
 * Much faster than sequential — 8 concurrent ops instead of 1.
 */
async function processParallelBatch(items, supabaseUrl, serviceKey, startTime) {
  const stats = { uploaded: 0, errors: 0, errorDetails: [], skippedTooLarge: 0 };
  let idx = 0;

  while (idx < items.length) {
    // Check time budget
    if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
      console.log(`[sync-attachments] Time budget hit after ${stats.uploaded} uploads, ${items.length - idx} remaining`);
      break;
    }

    // Take next batch
    const batch = items.slice(idx, idx + PARALLEL_CONCURRENCY);
    idx += batch.length;

    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const { recordId, attachment, storageDirField, tableName, fieldName } = item;
        const safeFilename = sanitizeFilename(attachment.filename);
        const storagePath = `${tableName}/${recordId}/${storageDirField}/${safeFilename}`;

        // Download
        const { buffer, contentType, size } = await downloadFile(attachment.url);

        if (size > MAX_FILE_SIZE) {
          return { status: 'skipped', filename: safeFilename };
        }

        // Upload
        await uploadToStorage(supabaseUrl, serviceKey, storagePath, buffer, contentType);

        // Cache
        const publicUrl = getPublicUrl(supabaseUrl, storagePath);
        await insertCacheRecord(supabaseUrl, serviceKey, {
          airtable_record_id: recordId,
          airtable_table: tableName,
          airtable_field: fieldName,
          original_filename: attachment.filename,
          original_url: attachment.url,
          storage_path: storagePath,
          public_url: publicUrl,
          file_size: size,
          mime_type: attachment.type || contentType,
        });

        return { status: 'uploaded', filename: safeFilename };
      })
    );

    // Collect results
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        if (r.value.status === 'uploaded') stats.uploaded++;
        else if (r.value.status === 'skipped') stats.skippedTooLarge++;
      } else {
        stats.errors++;
        stats.errorDetails.push({
          recordId: batch[i].recordId,
          filename: batch[i].attachment.filename,
          error: r.reason?.message || 'Unknown error',
        });
      }
    }

    if (stats.uploaded % 20 === 0 && stats.uploaded > 0) {
      console.log(`[sync-attachments] Progress: ${stats.uploaded} uploaded, ${stats.errors} errors...`);
    }
  }

  return { ...stats, remaining: items.length - idx };
}

// ═══════════════════════════════════════════════
//  SUPABASE-BASED PROCESSING (no Airtable API!)
// ═══════════════════════════════════════════════

/**
 * Extract attachment items from Supabase rows (acquisition records).
 * The JSONB columns already contain the Airtable attachment data.
 */
function extractAttachmentsFromRows(rows, cachedKeys) {
  const FIELDS = [
    { supabaseColumn: 'images', storageDirField: 'images_akquise', fieldName: 'images_akquise' },
    { supabaseColumn: 'vertrag_pdf', storageDirField: 'vertrag_pdf', fieldName: 'Vertrag (PDF)' },
    { supabaseColumn: 'faw_data_attachment', storageDirField: 'faw_data_attachment', fieldName: 'FAW_data_attachment' },
  ];

  const toProcess = [];
  let totalFound = 0;
  let alreadyCached = 0;
  let skippedLarge = 0;

  for (const row of rows) {
    const recordId = row.airtable_id;
    if (!recordId) continue;

    for (const field of FIELDS) {
      const attachments = row[field.supabaseColumn];
      if (!Array.isArray(attachments) || attachments.length === 0) continue;

      for (const att of attachments) {
        if (!att.url || !att.filename) continue;
        totalFound++;

        const cacheKey = `${recordId}|${field.fieldName}|${att.filename}`;
        if (cachedKeys.has(cacheKey)) {
          alreadyCached++;
          continue;
        }

        if (att.size && att.size > MAX_FILE_SIZE) {
          skippedLarge++;
          continue;
        }

        toProcess.push({
          recordId,
          attachment: att,
          storageDirField: field.storageDirField,
          tableName: 'acquisition',
          fieldName: field.fieldName,
        });
      }
    }
  }

  return { toProcess, totalFound, alreadyCached, skippedLarge };
}

// ═══════════════════════════════════════════════
//  LEGACY: Process source from Airtable
// ═══════════════════════════════════════════════

async function processSourceLegacy(source, token, supabaseUrl, serviceKey, cachedKeys, startTime) {
  const stats = {
    name: source.name, recordsFetched: 0, attachmentsFound: 0,
    alreadyCached: 0, uploaded: 0, skippedTooLarge: 0, errors: 0, errorDetails: [],
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
      if (cachedKeys.has(cacheKey)) { stats.alreadyCached++; continue; }
      if (att.size && att.size > MAX_FILE_SIZE) { stats.skippedTooLarge++; continue; }

      toProcess.push({
        recordId: rec.id,
        attachment: att,
        storageDirField: source.storageDirField,
        tableName: source.tableName,
        fieldName: source.fieldName,
      });
    }
  }

  console.log(`[sync-attachments] ${source.name}: ${stats.attachmentsFound} found, ${stats.alreadyCached} cached, ${toProcess.length} to upload`);

  const result = await processParallelBatch(toProcess, supabaseUrl, serviceKey, startTime);
  stats.uploaded = result.uploaded;
  stats.errors = result.errors;
  stats.errorDetails = result.errorDetails;
  stats.skippedTooLarge += result.skippedTooLarge;

  return stats;
}

// ═══════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════

import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
  checkRateLimit, getClientIP, rateLimitResponse,
} from './shared/security.js';

export default async (request) => {
  const startTime = Date.now();

  if (request.method === 'OPTIONS') {
    return handlePreflight(request);
  }

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
  };

  const clientIP = getClientIP(request);
  const rl = checkRateLimit(`sync-attachments:${clientIP}`, 10, 60_000);
  if (!rl.allowed) {
    return rateLimitResponse(rl.retryAfterMs, origin);
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_SERVICE_KEY) {
    console.error('[sync-attachments] Missing SUPABASE_SERVICE_ROLE_KEY');
    return new Response(JSON.stringify({ error: 'Server-Konfigurationsfehler' }), {
      status: 500, headers,
    });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'legacy';  // ready | supabase | legacy
  const tableFilter = url.searchParams.get('table');
  const limitParam = parseInt(url.searchParams.get('limit') || '0', 10);
  const chain = url.searchParams.get('chain') === 'true';

  console.log(`[sync-attachments] Starting. mode=${mode}, table=${tableFilter || 'all'}, limit=${limitParam || 'none'}, chain=${chain}`);

  try {
    // ─── MODE: READY (aufbaubereite Records — IDs from Supabase, URLs from Airtable) ───
    if (mode === 'ready') {
      if (!AIRTABLE_TOKEN) {
        return new Response(JSON.stringify({ error: 'AIRTABLE_TOKEN missing (needed for fresh attachment URLs)' }), {
          status: 400, headers,
        });
      }

      const cachedKeys = await fetchCachedKeys(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'acquisition');
      console.log(`[sync-attachments] Loaded ${cachedKeys.size} cached keys`);

      // Step 1: Get aufbaubereite record IDs from Supabase (fast)
      const readyIds = await fetchReadyRecordIds(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      console.log(`[sync-attachments] Found ${readyIds.length} aufbaubereite record IDs`);

      // Step 2: Fetch fresh attachment URLs from Airtable (only for these ~49 records)
      const ACQU_SOURCES = ATTACHMENT_SOURCES.filter(s => s.tableName === 'acquisition');
      const allItems = [];
      let totalFound = 0, alreadyCached = 0, skippedLarge = 0;

      for (const source of ACQU_SOURCES) {
        const records = await fetchAirtableByIds(AIRTABLE_TOKEN, source.tableId, source.fetchFields, readyIds);

        for (const rec of records) {
          const attachments = rec.fields[source.fieldName];
          if (!Array.isArray(attachments)) continue;
          for (const att of attachments) {
            if (!att.url || !att.filename) continue;
            totalFound++;
            const cacheKey = `${rec.id}|${source.fieldName}|${att.filename}`;
            if (cachedKeys.has(cacheKey)) { alreadyCached++; continue; }
            if (att.size && att.size > MAX_FILE_SIZE) { skippedLarge++; continue; }
            allItems.push({
              recordId: rec.id, attachment: att,
              storageDirField: source.storageDirField,
              tableName: source.tableName, fieldName: source.fieldName,
            });
          }
        }
      }

      console.log(`[sync-attachments] ${totalFound} attachments found, ${alreadyCached} cached, ${allItems.length} to upload`);
      const items = limitParam > 0 ? allItems.slice(0, limitParam) : allItems;
      const toProcess = allItems;

      const result = await processParallelBatch(items, SUPABASE_URL, SUPABASE_SERVICE_KEY, startTime);
      const durationMs = Date.now() - startTime;

      const totals = {
        mode,
        recordsFetched: readyIds.length,
        attachmentsFound: totalFound,
        alreadyCached,
        uploaded: result.uploaded,
        skippedTooLarge: skippedLarge + result.skippedTooLarge,
        errors: result.errors,
        remaining: toProcess.length - items.length + result.remaining,
      };

      console.log(`[sync-attachments] Done in ${(durationMs / 1000).toFixed(1)}s — ${totals.uploaded} uploaded, ${totals.remaining} remaining`);

      // Write sync log
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/attachment_sync_log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            sync_type: 'ready_priority',
            status: result.errors === 0 ? 'success' : 'partial',
            records_synced: result.uploaded,
            attachments_found: totalFound,
            already_cached: alreadyCached,
            errors_count: result.errors,
            duration_ms: durationMs,
            started_at: new Date(startTime).toISOString(),
            completed_at: new Date().toISOString(),
            error_message: result.errors > 0
              ? result.errorDetails.slice(0, 5).map(e => `${e.recordId}: ${e.error}`).join('; ')
              : null,
            details: JSON.stringify({ mode, records: readyIds.length, remaining: totals.remaining }),
          }),
        });
      } catch (logErr) {
        console.warn('[sync-attachments] Failed to write sync log:', logErr.message);
      }

      return new Response(JSON.stringify({
        success: true,
        duration_ms: durationMs,
        mode,
        totals,
        error_details: result.errorDetails.length > 0 ? result.errorDetails.slice(0, 10) : undefined,
      }), { status: 200, headers });
    }

    // ─── MODE: SUPABASE (read URLs from Supabase JSONB — only works if URLs haven't expired) ───
    if (mode === 'supabase') {
      const cachedKeys = await fetchCachedKeys(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'acquisition');
      const rows = await fetchAllAcquisitionFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      console.log(`[sync-attachments] ${rows.length} records, ${cachedKeys.size} cached`);

      const { toProcess, totalFound, alreadyCached, skippedLarge } = extractAttachmentsFromRows(rows, cachedKeys);
      const items = limitParam > 0 ? toProcess.slice(0, limitParam) : toProcess;
      const result = await processParallelBatch(items, SUPABASE_URL, SUPABASE_SERVICE_KEY, startTime);
      const durationMs = Date.now() - startTime;

      return new Response(JSON.stringify({
        success: true, duration_ms: durationMs, mode,
        totals: {
          recordsFetched: rows.length, attachmentsFound: totalFound, alreadyCached,
          uploaded: result.uploaded, skippedTooLarge: skippedLarge + result.skippedTooLarge,
          errors: result.errors, remaining: toProcess.length - items.length + result.remaining,
        },
      }), { status: 200, headers });
    }

    // ─── MODE: LEGACY (Airtable API fetch) ───
    if (!AIRTABLE_TOKEN) {
      return new Response(JSON.stringify({ error: 'AIRTABLE_TOKEN missing (required for legacy mode). Use mode=ready or mode=supabase instead.' }), {
        status: 400, headers,
      });
    }

    let sources = ATTACHMENT_SOURCES;
    if (tableFilter) {
      sources = ATTACHMENT_SOURCES.filter(s =>
        s.tableName === tableFilter || s.name === tableFilter || s.name.startsWith(tableFilter)
      );
      if (sources.length === 0) {
        return new Response(JSON.stringify({
          error: `Unknown table filter: "${tableFilter}"`,
          validTables: ['acquisition', 'installationen', 'tasks'],
        }), { status: 400, headers });
      }
    }

    const uniqueTables = [...new Set(sources.map(s => s.tableName))];
    const cachedKeysMap = {};
    for (const tableName of uniqueTables) {
      cachedKeysMap[tableName] = await fetchCachedKeys(SUPABASE_URL, SUPABASE_SERVICE_KEY, tableName);
    }

    const results = [];
    for (const source of sources) {
      if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) break;
      const cachedKeys = cachedKeysMap[source.tableName];
      const stats = await processSourceLegacy(source, AIRTABLE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, cachedKeys, startTime);
      results.push(stats);
    }

    const durationMs = Date.now() - startTime;
    const totals = {
      recordsFetched: results.reduce((s, r) => s + r.recordsFetched, 0),
      attachmentsFound: results.reduce((s, r) => s + r.attachmentsFound, 0),
      alreadyCached: results.reduce((s, r) => s + r.alreadyCached, 0),
      uploaded: results.reduce((s, r) => s + r.uploaded, 0),
      skippedTooLarge: results.reduce((s, r) => s + r.skippedTooLarge, 0),
      errors: results.reduce((s, r) => s + r.errors, 0),
    };

    console.log(`[sync-attachments] Legacy complete in ${(durationMs / 1000).toFixed(1)}s — ${totals.uploaded} uploaded`);

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/attachment_sync_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          sync_type: 'manual',
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
            filter: tableFilter || 'all',
            sources: results.map(r => ({
              name: r.name, records: r.recordsFetched,
              found: r.attachmentsFound, cached: r.alreadyCached,
              uploaded: r.uploaded, errors: r.errors,
            })),
          }),
        }),
      });
    } catch (logErr) {
      console.warn('[sync-attachments] Failed to write sync log:', logErr.message);
    }

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
      metadata: { uploaded: totals.uploaded, alreadyCached: totals.alreadyCached, errors: totals.errors },
    });

    return new Response(JSON.stringify({
      success: true,
      duration_ms: durationMs,
      filter: tableFilter || 'all',
      totals,
      sources: results.map(r => ({
        name: r.name, records: r.recordsFetched, attachments: r.attachmentsFound,
        cached: r.alreadyCached, uploaded: r.uploaded, skipped_too_large: r.skippedTooLarge,
        errors: r.errors,
        error_details: r.errorDetails.length > 0 ? r.errorDetails.slice(0, 10) : undefined,
      })),
    }), { status: 200, headers });
  } catch (err) {
    console.error('[sync-attachments] Fatal error:', err);

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/attachment_sync_log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          sync_type: mode,
          status: 'error',
          records_synced: 0, attachments_found: 0, already_cached: 0, errors_count: 1,
          duration_ms: Date.now() - startTime,
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date().toISOString(),
          error_message: err.message,
          details: null,
        }),
      });
    } catch (_) {}

    return new Response(JSON.stringify({
      success: false,
      error: 'Attachment-Sync fehlgeschlagen',
      message: err.message,
      duration_ms: Date.now() - startTime,
    }), { status: 500, headers });
  }
};
