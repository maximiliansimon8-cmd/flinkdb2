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

const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const STAMMDATEN_TABLE = 'tblLJ1S7OUhc2w5Jw';
const TASKS_TABLE = 'tblcKHWJg77mgIQ9l';
const INSTALLATIONEN_TABLE = 'tblKznpAOAMvEfX8u';
const ACTIVITY_LOG_TABLE = 'tblDk1dl4J3Ow3Qde';

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/export?format=csv&gid=0';

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
 */
async function upsertToSupabase(supabaseUrl, serviceKey, table, rows) {
  const batchSize = 500;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
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

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Supabase upsert error (${table}): ${res.status} ${errText.substring(0, 200)}`);
    } else {
      upserted += batch.length;
    }
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
   MAP FUNCTIONS: Airtable → Supabase row
   ═══════════════════════════════════════════════ */

function mapStammdaten(rec) {
  const f = rec.fields;
  const jetId = Array.isArray(f['JET ID']) ? f['JET ID'][0] : (f['JET ID'] || null);
  return {
    id: rec.id, airtable_id: rec.id, jet_id: jetId,
    display_ids: Array.isArray(f['Display ID']) ? f['Display ID'] : [],
    location_name: f['Location Name'] || null,
    contact_person: f['Contact Person'] || null,
    contact_email: f['Contact Email'] || null,
    contact_phone: f['Contact Phone'] || null,
    location_email: f['Location Email'] || null,
    location_phone: f['Location Phone'] || null,
    legal_entity: f['Legal Entity'] || null,
    street: f['Street'] || null,
    street_number: f['Street Number'] || null,
    postal_code: f['Postal Code'] || null,
    city: f['City'] || null,
    lead_status: Array.isArray(f['Lead Status  (from Akquise)']) ? f['Lead Status  (from Akquise)'] : [],
    updated_at: new Date().toISOString(),
  };
}

function mapTask(rec) {
  const f = rec.fields;
  const assigned = Array.isArray(f['Assigned'])
    ? f['Assigned'].map(a => typeof a === 'object' ? a.name : a).filter(Boolean)
    : [];
  return {
    id: rec.id, airtable_id: rec.id,
    title: f['Task Title'] || null,
    task_type: f['Task Type'] || [],
    status: f['Status'] || null,
    priority: f['Priority'] || null,
    due_date: f['Due Date'] || null,
    description: f['Description'] || null,
    created_time: f['Created time'] || null,
    responsible_user: f['Responsible User']?.name || f['Responsible User'] || null,
    assigned,
    created_by: f['Created by']?.name || f['Created by'] || null,
    display_ids: f['Display ID (from Displays )'] || [],
    location_names: f['Location Name (from Locations)'] || [],
    overdue: f['Overdue'] || null,
    completed_date: f['completed_task_date'] || null,
    completed_by: f['completed_task_by'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapInstallation(rec) {
  const f = rec.fields;
  const integrator = Array.isArray(f['Company (from Integrator)'])
    ? f['Company (from Integrator)'].join(', ')
    : (f['Company (from Integrator)'] || null);
  const technicians = Array.isArray(f['Name (from Technikers)'])
    ? f['Name (from Technikers)'] : [];
  const protocol = Array.isArray(f['Installationsprotokoll']) && f['Installationsprotokoll'][0]
    ? f['Installationsprotokoll'][0] : null;
  const displayIds = Array.isArray(f['Display Table ID (from Link to Display ID )'])
    ? f['Display Table ID (from Link to Display ID )'] : [];
  return {
    id: rec.id, airtable_id: rec.id,
    display_ids: displayIds,
    install_date: f['Aufbau Datum'] || null,
    status: f['Status Installation'] || null,
    installation_type: f['Installationsart'] || null,
    integrator, technicians,
    protocol_url: protocol?.url || null,
    protocol_filename: protocol?.filename || null,
    screen_type: f['Screen Art'] || null,
    screen_size: f['Screen Size'] || null,
    ops_nr: f['OPS Nr'] || null,
    sim_id: f['SIM-ID'] || null,
    install_start: f['Installationsstart'] || null,
    install_end: f['Installationsabschluss'] || null,
    remarks: f['Allgemeine Bemerkungen'] || null,
    partner_name: f['Abnahme Partner (Name)'] || null,
    updated_at: new Date().toISOString(),
  };
}

function mapCommunication(rec) {
  const f = rec.fields;
  return {
    id: rec.id, airtable_id: rec.id,
    channel: f['Channel'] || null,
    direction: f['Direction'] || null,
    subject: f['Subject'] || null,
    message: f['Message'] || null,
    timestamp: f['Timestamp'] || null,
    status: f['Status'] || null,
    recipient_name: f['Recipient Name'] || null,
    recipient_contact: f['Recipient Contact'] || null,
    sender: f['Sender'] || null,
    external_id: f['External ID'] || null,
    location_ids: f['Location'] || [],
    location_names: f['Location Name (from Location)'] || [],
    display_ids: f['Display ID (from Location)'] || [],
    jet_ids: f['JET ID (from Location)'] || [],
    related_task: f['Related Task'] || [],
    updated_at: new Date().toISOString(),
  };
}

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
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
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
    const stammdatenRecords = await fetchAllAirtable(AIRTABLE_TOKEN, STAMMDATEN_TABLE, [
      'JET ID', 'Display ID', 'Location Name', 'Contact Person',
      'Contact Email', 'Contact Phone', 'Location Email', 'Location Phone',
      'Legal Entity', 'Street', 'Street Number', 'Postal Code', 'City',
      'Lead Status  (from Akquise)'
    ]);
    const stammdatenRows = stammdatenRecords.map(mapStammdaten);
    results.stammdaten = {
      fetched: stammdatenRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'stammdaten', stammdatenRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'stammdaten', stammdatenRecords.map(r => r.id)),
    };
    console.log(`[sync] Stammdaten: ${results.stammdaten.fetched} → ${results.stammdaten.upserted} upserted, ${results.stammdaten.deleted} orphans deleted`);

    // ═══ 3. AIRTABLE: Tasks ═══
    console.log('[sync] Fetching Tasks...');
    const taskRecords = await fetchAllAirtable(AIRTABLE_TOKEN, TASKS_TABLE, [
      'Task Title', 'Task Type', 'Status', 'Priority', 'Due Date',
      'Description', 'Created time', 'Responsible User', 'Assigned',
      'Created by', 'Display ID (from Displays )', 'Location Name (from Locations)',
      'Overdue', 'completed_task_date', 'completed_task_by'
    ]);
    const taskRows = taskRecords.map(mapTask);
    results.tasks = {
      fetched: taskRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'tasks', taskRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'tasks', taskRecords.map(r => r.id)),
    };
    console.log(`[sync] Tasks: ${results.tasks.fetched} → ${results.tasks.upserted} upserted, ${results.tasks.deleted} orphans deleted`);

    // ═══ 4. AIRTABLE: Installationen ═══
    console.log('[sync] Fetching Installationen...');
    const installRecords = await fetchAllAirtable(AIRTABLE_TOKEN, INSTALLATIONEN_TABLE, [
      'Aufbau Datum', 'Status Installation', 'Installationsart',
      'Company (from Integrator)', 'Name (from Technikers)',
      'Installationsprotokoll', 'Screen Art', 'Screen Size',
      'OPS Nr', 'SIM-ID', 'Installationsstart', 'Installationsabschluss',
      'Allgemeine Bemerkungen', 'Abnahme Partner (Name)',
      'Display Table ID (from Link to Display ID )'
    ]);
    const installRows = installRecords.map(mapInstallation);
    results.installationen = {
      fetched: installRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'installationen', installRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'installationen', installRecords.map(r => r.id)),
    };
    console.log(`[sync] Installationen: ${results.installationen.fetched} → ${results.installationen.upserted} upserted, ${results.installationen.deleted} orphans deleted`);

    // ═══ 5. AIRTABLE: Activity Log / Communications ═══
    console.log('[sync] Fetching Activity Log...');
    const commRecords = await fetchAllAirtable(AIRTABLE_TOKEN, ACTIVITY_LOG_TABLE, [
      'Channel', 'Direction', 'Subject', 'Message', 'Timestamp',
      'Status', 'Recipient Name', 'Recipient Contact', 'Sender',
      'External ID', 'Location', 'Location Name (from Location)',
      'Display ID (from Location)', 'JET ID (from Location)',
      'Related Task',
    ]);
    const commRows = commRecords.map(mapCommunication);
    results.communications = {
      fetched: commRecords.length,
      upserted: await upsertToSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'communications', commRows),
      deleted: await deleteOrphansFromSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'communications', commRecords.map(r => r.id)),
    };
    console.log(`[sync] Communications: ${results.communications.fetched} → ${results.communications.upserted} upserted, ${results.communications.deleted} orphans deleted`);

    const durationMs = Date.now() - startTime;
    console.log(`[sync] Complete in ${(durationMs / 1000).toFixed(1)}s`);

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
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      results,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Netlify Scheduled Function config
// Runs every 15 minutes
export const config = {
  schedule: '*/15 * * * *',
};
