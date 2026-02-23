/**
 * Netlify Function: NocoDB -> Supabase Sync
 *
 * Syncs data from NocoDB tables into Supabase (READ-ONLY from NocoDB).
 * CRITICAL: This function ONLY READS from NocoDB. NEVER writes to NocoDB!
 *
 * Tables synced:
 *   1. Vorbereitet     -> nocodb_vorbereitet
 *   2. Vistar-Navori   -> nocodb_vistar_navori
 *   3. SIM-KundenID    -> nocodb_sim_kunden
 *   4. Lieferando       -> nocodb_lieferando
 *
 * After sync, enriches hardware_ops by matching OpsNr from nocodb_vorbereitet.
 *
 * Can be triggered manually via GET /.netlify/functions/sync-nocodb
 *
 * Environment variables:
 *   - NOCO_TOKEN            – NocoDB API token (xc-token header)
 *   - SUPABASE_SERVICE_ROLE_KEY – Supabase write access
 *   - SUPABASE_URL          – Supabase project URL (optional, has default)
 */

import { logApiCall } from './shared/apiLogger.js';
import { checkRateLimit, getClientIP } from './shared/security.js';

const NOCODB_HOST = 'https://nocodb.e-systems.de';
const NOCODB_BASE_ID = 'poh211rc5ugx525';

// NocoDB table IDs
const TABLES = {
  VORBEREITET: 'mhf9ikblt999oc7',
  VISTAR_NAVORI: 'm05307ev6i0fmen',
  SIM_KUNDEN: 'm2sbndo7ud73yj5',
  LIEFERANDO: 'mg1dhrlw6llhl30',
};

// Maximum time budget (ms) — leave 4s buffer before Netlify's 30s limit
const MAX_DURATION_MS = 26000;

/* ============================================================
   NocoDB Fetch — READ-ONLY, paginated
   ============================================================ */

/**
 * Fetch ALL records from a NocoDB table using pagination.
 * READ-ONLY: only performs GET requests, never POST/PUT/PATCH/DELETE.
 */
async function fetchAllNocoDB(token, tableId, startTime) {
  const PAGE_SIZE = 200;
  let allRecords = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Timeout guard
    if (Date.now() - startTime > MAX_DURATION_MS) {
      console.warn(`[nocodb-sync] Timeout guard triggered for table ${tableId} after ${allRecords.length} records`);
      break;
    }

    const url = `${NOCODB_HOST}/api/v2/tables/${tableId}/records?limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      method: 'GET', // READ-ONLY
      headers: {
        'xc-token': token,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[nocodb-sync] NocoDB error for table ${tableId}: ${res.status} ${errText.substring(0, 200)}`);
      break;
    }

    const data = await res.json();
    const records = data.list || [];
    allRecords = allRecords.concat(records);

    // Stop if: fewer records than page size, pageInfo says last page,
    // or next offset would exceed totalRows
    const pageInfo = data.pageInfo || {};
    const totalRows = pageInfo.totalRows || Infinity;
    const nextOffset = offset + PAGE_SIZE;

    if (records.length < PAGE_SIZE || pageInfo.isLastPage === true || nextOffset >= totalRows) {
      hasMore = false;
    } else {
      offset = nextOffset;
    }
  }

  return allRecords;
}

/* ============================================================
   Supabase helpers
   ============================================================ */

/**
 * Upsert records to Supabase via REST API (in batches of 200).
 */
async function upsertToSupabase(supabaseUrl, serviceKey, table, rows, onConflict) {
  const batchSize = 200;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Prefer': 'resolution=merge-duplicates',
    };

    // on_conflict query param tells Supabase which column to use for merge-duplicates
    const conflictParam = onConflict ? `?on_conflict=${onConflict}` : '';
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}${conflictParam}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    if (res.ok) {
      upserted += batch.length;
    } else {
      const errText = await res.text();
      console.error(`[nocodb-sync] Supabase upsert error (${table}, batch ${i}): ${res.status} ${errText.substring(0, 300)}`);
    }
  }

  return upserted;
}

/**
 * Update sync_metadata table with sync status.
 * Uses POST with merge-duplicates (upsert), falls back to PATCH.
 */
async function updateSyncMetadata(supabaseUrl, serviceKey, source, tableName, recordCount, status, errorMsg) {
  const fullTableName = `${source}_${tableName}`;
  const payload = {
    table_name: fullTableName,
    last_sync_timestamp: new Date().toISOString(),
    records_fetched: recordCount,
    records_upserted: recordCount,
    last_sync_status: status,
    updated_at: new Date().toISOString(),
  };

  if (errorMsg) {
    payload.error_message = errorMsg;
  }

  try {
    // Attempt 1: POST with upsert
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
      console.log(`[nocodb-sync] sync_metadata updated for ${payload.table_name}`);
      return;
    }

    const errText = await res.text();
    console.warn(`[nocodb-sync] POST sync_metadata failed: ${res.status} ${errText.substring(0, 200)}`);

    // Attempt 2: PATCH
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/sync_metadata?table_name=eq.${encodeURIComponent(payload.table_name)}`,
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
          records_fetched: recordCount,
          records_upserted: recordCount,
          last_sync_status: status,
          updated_at: payload.updated_at,
        }),
      }
    );

    if (patchRes.ok) {
      console.log(`[nocodb-sync] sync_metadata PATCH succeeded for ${payload.table_name}`);
    } else {
      const patchErr = await patchRes.text();
      console.error(`[nocodb-sync] sync_metadata PATCH also failed: ${patchRes.status} ${patchErr.substring(0, 200)}`);
    }
  } catch (e) {
    console.error(`[nocodb-sync] Failed to update sync_metadata for ${payload.table_name}:`, e.message);
  }
}

/* ============================================================
   Field mappers — NocoDB record -> Supabase row
   ============================================================ */

/**
 * Extract a clean numeric KundenID from the NocoDB linked record field.
 * Handles formats like:
 *   - { Id: 155, KundenID: "3780650" }
 *   - { Id: 215, KundenID: "{\"10112373\"}" }
 *   - [{ Id: 155, KundenID: "3780650" }]
 *   - "3780650" (plain string)
 *   - null / undefined
 */
function extractKundenId(field) {
  if (!field) return null;

  // If it's an array, take the first element
  let obj = field;
  if (Array.isArray(obj)) {
    obj = obj[0];
    if (!obj) return null;
  }

  // If it's a plain string/number, return it
  if (typeof obj === 'string') {
    const match = obj.match(/(\d+)/);
    return match ? match[1] : null;
  }
  if (typeof obj === 'number') return String(obj);

  // If it's an object with .KundenID
  if (typeof obj === 'object' && obj !== null) {
    const raw = obj.KundenID || obj.kunden_id || obj.kundenId;
    if (!raw) return null;

    const rawStr = String(raw);
    // Handle escaped JSON like "{\"10112373\"}"
    const match = rawStr.match(/(\d+)/);
    return match ? match[1] : null;
  }

  return null;
}

/**
 * Strip NocoDB's {"..."} or {\"...\"} wrapping from text fields.
 * Handles: "Erfolgreich", {"Erfolgreich"}, {\"Erfolgreich\"}, null/undefined.
 * Returns the clean string or null.
 */
function cleanNocoDbField(value) {
  if (value == null) return null;
  let str = String(value).trim();
  if (!str) return null;

  // Remove escaped-JSON wrapping: {\"...\"}
  str = str.replace(/^\{\\?"/, '').replace(/\\?"\}$/, '');
  // Remove plain JSON wrapping: {"..."}
  str = str.replace(/^\{"/, '').replace(/"\}$/, '');
  // Remove surrounding quotes if still present
  str = str.replace(/^"(.*)"$/, '$1');

  return str || null;
}

function mapVorbereitet(record) {
  return {
    nocodb_id: record.Id || record.id,
    ops_nr: record['OpsNr.'] != null ? Number(record['OpsNr.']) : null,
    venue_id: record['VenueID'] || null,
    sim_id: record['SimID'] || null,
    kunden_nr: record['KundenNr.'] ? String(record['KundenNr.']).replace(/[\r\s]+$/, '').trim() || null : null,
    fertig: record['Fertig'] === true || record['Fertig'] === 1,
    vorbereitet: record['Vorbereitet'] === true || record['Vorbereitet'] === 1,
    ops_sn: record['OPS-SN'] || null,
  };
}

function mapVistarNavori(record) {
  return {
    nocodb_id: record.Id || record.id,
    venue_id: record['venue_id'] || null,
    name: record['name'] || null,
    kunden_id: record['kunden_id'] || null,
    do_id: record['DO-ID'] || null,
  };
}

function mapSimKunden(record) {
  return {
    nocodb_id: record.Id || record.id,
    karten_nr: record['Karten Nr.'] || null,
    kunden_id: extractKundenId(record['KundenID']),
    aktivierungsdatum: record['Aktivierungsdatum'] || null,
  };
}

function mapLieferando(record) {
  return {
    nocodb_id: record.Id || record.id,
    kunden_id: extractKundenId(record['KundenID']),
    restaurant: cleanNocoDbField(record['Restaurant']),
    strasse: cleanNocoDbField(record['Strasse']),
    hausnummer: cleanNocoDbField(record['Hausnummer']),
    plz: cleanNocoDbField(record['PLZ']),
    stadt: cleanNocoDbField(record['Stadt']),
    akquise_status: cleanNocoDbField(record['AkquiseStatus']),
    standort_status: cleanNocoDbField(record['Standortstatus']),
    einreichdatum: cleanNocoDbField(record['Einreichdatum']),
    rollout_info: cleanNocoDbField(record['Rollout KW/Datum/Info'] || record['Rollout Info'] || record['Rollout KW']),
    installationsart: cleanNocoDbField(record['Installationsart']),
  };
}

/* ============================================================
   Enrichment: Update hardware_ops with NocoDB data
   ============================================================ */

/**
 * After syncing nocodb_vorbereitet, enrich the hardware_ops table by matching
 * ops_nr from nocodb_vorbereitet to hardware_ops.ops_nr.
 *
 * Uses a Supabase SQL RPC to do the enrichment in a single database call
 * instead of individual PATCH requests (which would timeout).
 */
async function enrichHardwareOps(supabaseUrl, serviceKey) {
  console.log('[nocodb-sync] Enriching hardware_ops from nocodb_vorbereitet...');

  try {
    // Use a direct SQL UPDATE via Supabase's /rest/v1/rpc endpoint
    // This does the entire enrichment in a single DB operation
    const sql = `
      UPDATE hardware_ops ho
      SET vistar_venue_id = nv.venue_id,
          nocodb_sim_id = nv.sim_id,
          nocodb_kunden_nr = nv.kunden_nr,
          nocodb_synced_at = NOW()
      FROM nocodb_vorbereitet nv
      WHERE nv.ops_nr IS NOT NULL
        AND ho.ops_nr IS NOT NULL
        AND nv.ops_nr::TEXT = ho.ops_nr
        AND (ho.vistar_venue_id IS DISTINCT FROM nv.venue_id
          OR ho.nocodb_sim_id IS DISTINCT FROM nv.sim_id
          OR ho.nocodb_kunden_nr IS DISTINCT FROM nv.kunden_nr)
    `;

    // Try RPC call first (if enrich_hardware_from_nocodb RPC exists)
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/enrich_hardware_from_nocodb`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({}),
    });

    if (rpcRes.ok) {
      const result = await rpcRes.json();
      console.log(`[nocodb-sync] Enrichment via RPC succeeded: ${JSON.stringify(result)}`);
      return result;
    }

    // Fallback: batch PATCH — fetch vorbereitet, group updates, do max 10 concurrent PATCHes
    console.log('[nocodb-sync] RPC not available, using batch PATCH fallback...');

    const vorbereitetRes = await fetch(
      `${supabaseUrl}/rest/v1/nocodb_vorbereitet?select=ops_nr,venue_id,sim_id,kunden_nr&ops_nr=not.is.null&limit=1000`,
      { headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey } }
    );

    if (!vorbereitetRes.ok) {
      console.error(`[nocodb-sync] Failed to fetch nocodb_vorbereitet: ${vorbereitetRes.status}`);
      return 0;
    }

    const vorbereitetRows = await vorbereitetRes.json();
    if (vorbereitetRows.length === 0) return 0;

    // Build ops_nr list for a single batch PATCH per unique ops_nr
    let enriched = 0;
    const batchSize = 20;

    for (let i = 0; i < vorbereitetRows.length; i += batchSize) {
      const batch = vorbereitetRows.slice(i, i + batchSize);

      // Fire batch in parallel
      const promises = batch.map(async (row) => {
        if (!row.ops_nr) return false;

        const updatePayload = { nocodb_synced_at: new Date().toISOString() };
        if (row.venue_id) updatePayload.vistar_venue_id = row.venue_id;
        if (row.sim_id) updatePayload.nocodb_sim_id = row.sim_id;
        if (row.kunden_nr) updatePayload.nocodb_kunden_nr = row.kunden_nr;

        const patchRes = await fetch(
          `${supabaseUrl}/rest/v1/hardware_ops?ops_nr=eq.${row.ops_nr}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
              'apikey': serviceKey,
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify(updatePayload),
          }
        );

        if (!patchRes.ok) {
          const errText = await patchRes.text();
          if (errText.includes('does not exist')) {
            console.warn('[nocodb-sync] Enrichment columns missing, skipping');
            return 'abort';
          }
        }
        return patchRes.ok;
      });

      const results = await Promise.all(promises);
      if (results.includes('abort')) break;
      enriched += results.filter(Boolean).length;
    }

    console.log(`[nocodb-sync] Enriched ${enriched} hardware_ops records via batch PATCH`);
    return enriched;
  } catch (e) {
    console.error('[nocodb-sync] Enrichment error:', e.message);
    return 0;
  }
}

/* ============================================================
   MAIN HANDLER
   ============================================================ */

export default async (request) => {
  const startTime = Date.now();

  // ── Auth: require SYNC_SECRET via header only (not query param — leaks in logs) ──
  const SYNC_SECRET = Netlify.env.get('SYNC_SECRET');
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
  const limit = checkRateLimit(`sync-nocodb:${clientIP}`, 5, 60_000);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }

  const NOCO_TOKEN = Netlify.env.get('NOCO_TOKEN');
  const SUPABASE_URL = Netlify.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_KEY = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL) {
    console.error('[nocodb-sync] Missing SUPABASE_URL environment variable');
    return new Response(JSON.stringify({ error: 'SUPABASE_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!NOCO_TOKEN) {
    console.error('[nocodb-sync] Missing NOCO_TOKEN environment variable');
    return new Response(JSON.stringify({ error: 'NOCO_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_SERVICE_KEY) {
    console.error('[nocodb-sync] Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
    return new Response(JSON.stringify({ error: 'Supabase key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = {};
  let totalFetched = 0;
  let totalUpserted = 0;

  // ==========================================
  // 1. Sync: Vorbereitet -> nocodb_vorbereitet
  // ==========================================
  try {
    console.log('[nocodb-sync] Fetching Vorbereitet...');
    const records = await fetchAllNocoDB(NOCO_TOKEN, TABLES.VORBEREITET, startTime);
    const rows = records.map(mapVorbereitet);
    const upserted = rows.length > 0
      ? await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb_vorbereitet', rows, 'nocodb_id')
      : 0;

    results.vorbereitet = { fetched: records.length, upserted };
    totalFetched += records.length;
    totalUpserted += upserted;

    await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'vorbereitet', records.length, 'success');
    console.log(`[nocodb-sync] Vorbereitet: ${records.length} fetched -> ${upserted} upserted`);
  } catch (e) {
    console.error('[nocodb-sync] Vorbereitet error:', e.message);
    results.vorbereitet = { error: e.message };
    await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'vorbereitet', 0, 'error', e.message);
  }

  // ==========================================
  // 2. Sync: Vistar-Navori -> nocodb_vistar_navori
  // ==========================================
  try {
    if (Date.now() - startTime < MAX_DURATION_MS) {
      console.log('[nocodb-sync] Fetching Vistar-Navori...');
      const records = await fetchAllNocoDB(NOCO_TOKEN, TABLES.VISTAR_NAVORI, startTime);
      const rows = records.map(mapVistarNavori);
      const upserted = rows.length > 0
        ? await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb_vistar_navori', rows, 'nocodb_id')
        : 0;

      results.vistar_navori = { fetched: records.length, upserted };
      totalFetched += records.length;
      totalUpserted += upserted;

      await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'vistar_navori', records.length, 'success');
      console.log(`[nocodb-sync] Vistar-Navori: ${records.length} fetched -> ${upserted} upserted`);
    } else {
      results.vistar_navori = { skipped: 'timeout_guard' };
      console.warn('[nocodb-sync] Skipping Vistar-Navori due to timeout guard');
    }
  } catch (e) {
    console.error('[nocodb-sync] Vistar-Navori error:', e.message);
    results.vistar_navori = { error: e.message };
    await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'vistar_navori', 0, 'error', e.message);
  }

  // ==========================================
  // 3. Sync: SIM-KundenID -> nocodb_sim_kunden
  // ==========================================
  try {
    if (Date.now() - startTime < MAX_DURATION_MS) {
      console.log('[nocodb-sync] Fetching SIM-KundenID...');
      const records = await fetchAllNocoDB(NOCO_TOKEN, TABLES.SIM_KUNDEN, startTime);
      const rows = records.map(mapSimKunden);
      const upserted = rows.length > 0
        ? await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb_sim_kunden', rows, 'nocodb_id')
        : 0;

      results.sim_kunden = { fetched: records.length, upserted };
      totalFetched += records.length;
      totalUpserted += upserted;

      await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'sim_kunden', records.length, 'success');
      console.log(`[nocodb-sync] SIM-KundenID: ${records.length} fetched -> ${upserted} upserted`);
    } else {
      results.sim_kunden = { skipped: 'timeout_guard' };
      console.warn('[nocodb-sync] Skipping SIM-KundenID due to timeout guard');
    }
  } catch (e) {
    console.error('[nocodb-sync] SIM-KundenID error:', e.message);
    results.sim_kunden = { error: e.message };
    await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'sim_kunden', 0, 'error', e.message);
  }

  // ==========================================
  // 4. Sync: Lieferando -> nocodb_lieferando
  // ==========================================
  try {
    if (Date.now() - startTime < MAX_DURATION_MS) {
      console.log('[nocodb-sync] Fetching Lieferando...');
      const records = await fetchAllNocoDB(NOCO_TOKEN, TABLES.LIEFERANDO, startTime);
      const rows = records.map(mapLieferando);
      const upserted = rows.length > 0
        ? await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb_lieferando', rows, 'nocodb_id')
        : 0;

      results.lieferando = { fetched: records.length, upserted };
      totalFetched += records.length;
      totalUpserted += upserted;

      await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'lieferando', records.length, 'success');
      console.log(`[nocodb-sync] Lieferando: ${records.length} fetched -> ${upserted} upserted`);
    } else {
      results.lieferando = { skipped: 'timeout_guard' };
      console.warn('[nocodb-sync] Skipping Lieferando due to timeout guard');
    }
  } catch (e) {
    console.error('[nocodb-sync] Lieferando error:', e.message);
    results.lieferando = { error: e.message };
    await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'lieferando', 0, 'error', e.message);
  }

  // ==========================================
  // 5. Enrich hardware_ops with NocoDB data
  // ==========================================
  try {
    if (Date.now() - startTime < MAX_DURATION_MS && results.vorbereitet && !results.vorbereitet.error) {
      const enriched = await enrichHardwareOps(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      results.hardware_ops_enriched = enriched;
    } else if (results.vorbereitet?.error) {
      results.hardware_ops_enriched = { skipped: 'vorbereitet_failed' };
    } else {
      results.hardware_ops_enriched = { skipped: 'timeout_guard' };
    }
  } catch (e) {
    console.error('[nocodb-sync] Enrichment error:', e.message);
    results.hardware_ops_enriched = { error: e.message };
  }

  // ==========================================
  // 6. Update overall sync_metadata
  // ==========================================
  try {
    await updateSyncMetadata(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'nocodb', 'all', totalFetched, 'success');
  } catch (e) {
    console.error('[nocodb-sync] Failed to update overall sync_metadata:', e.message);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[nocodb-sync] Complete in ${(durationMs / 1000).toFixed(1)}s — ${totalFetched} fetched, ${totalUpserted} upserted`);

  // Log API usage
  try {
    logApiCall({
      functionName: 'sync-nocodb',
      service: 'nocodb',
      method: 'GET',
      endpoint: '/api/v2/tables/*/records',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalFetched,
      metadata: { tablesProcessed: Object.keys(results).length, totalRecords: totalFetched },
    });

    logApiCall({
      functionName: 'sync-nocodb',
      service: 'supabase',
      method: 'POST',
      endpoint: '/upsert-nocodb',
      durationMs,
      statusCode: 200,
      success: true,
      recordsCount: totalUpserted,
    });
  } catch (e) {
    // Non-blocking — logger errors should never break the sync
    console.warn('[nocodb-sync] API logging error (non-fatal):', e.message);
  }

  return new Response(JSON.stringify({
    success: true,
    duration_ms: durationMs,
    total_fetched: totalFetched,
    total_upserted: totalUpserted,
    results,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  path: '/api/sync-nocodb',
};
