/**
 * Final migration: Heartbeats (COPY FROM) + Communications -> Supabase
 * Uses pg COPY protocol for heartbeats (fastest bulk insert)
 * Uses individual INSERTs for communications (smaller dataset)
 */
const { Client } = require('pg');
const { Writable } = require('stream');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required. Set it before running this script.');
  process.exit(1);
}

const PG_URL = process.env.DATABASE_URL;
const AIRTABLE_TOKEN = '***REMOVED_AIRTABLE_PAT***';
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const ACTIVITY_LOG_TABLE = 'tblDk1dl4J3Ow3Qde';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/export?format=csv&gid=0';

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

// Escape value for COPY TSV format
function tsvEscape(val) {
  if (val === null || val === undefined || val === '') return '\\N';
  return String(val).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

async function migrateHeartbeats(pg) {
  console.log('\n========================================');
  console.log('=== HEARTBEAT MIGRATION (COPY) ===');
  console.log('========================================\n');

  // Check existing
  const existing = await pg.query('SELECT COUNT(*) FROM public.display_heartbeats');
  console.log('Existing rows: ' + existing.rows[0].count);

  if (parseInt(existing.rows[0].count) > 50000) {
    console.log('Already have enough rows, skipping heartbeat migration.');
    return;
  }

  // Clear existing partial data and start fresh
  console.log('Clearing existing partial data...');
  await pg.query('DELETE FROM public.display_heartbeats');
  console.log('Cleared.');

  // Fetch CSV
  console.log('Fetching Google Sheets CSV...');
  const csvRes = await fetch(SHEET_CSV_URL, {
    headers: { 'User-Agent': 'JET-Dashboard-Migration/1.0' },
  });
  if (!csvRes.ok) {
    console.error('Error fetching CSV:', csvRes.status);
    return;
  }
  const csvText = await csvRes.text();
  const lines = csvText.split('\n');
  const headers = parseCSVLine(lines[0]);
  console.log('Total CSV rows: ' + (lines.length - 1));

  const colIdx = {};
  headers.forEach((h, i) => { colIdx[h] = i; });

  // Parse all rows
  console.log('Parsing rows...');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const displayId = cols[colIdx['Display ID']] || '';
    const timestamp = cols[colIdx['Timestamp']] || '';
    if (!displayId || !timestamp) continue;

    const slashIdx = displayId.indexOf('/');
    const stableId = slashIdx >= 0 ? displayId.substring(0, slashIdx).trim() : displayId.trim();

    rows.push({
      timestamp,
      display_id: stableId,
      raw_display_id: displayId,
      location_name: cols[colIdx['Location Name']] || null,
      serial_number: cols[colIdx['Serial Number']] || null,
      registration_date: cols[colIdx['Date']] || null,
      heartbeat: cols[colIdx['Status']] || null,
      is_alive: cols[colIdx['Is Alive']] || null,
      display_status: cols[colIdx['Display Status']] || null,
      last_online_date: cols[colIdx['Last Online Date']] || null,
      days_offline: cols[colIdx['Days Offline']] || null,
    });
  }
  console.log('Parsed rows: ' + rows.length);

  // Deduplicate by (display_id, timestamp) - keep last occurrence
  console.log('Deduplicating...');
  const seen = new Map();
  for (const row of rows) {
    const key = row.display_id + '|' + row.timestamp;
    seen.set(key, row);
  }
  const uniqueRows = Array.from(seen.values());
  console.log('Unique rows: ' + uniqueRows.length + ' (removed ' + (rows.length - uniqueRows.length) + ' duplicates)');

  // Batch INSERT (100 rows per batch for optimal network/DB balance)
  console.log('Starting batch insert...');
  const BATCH = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < uniqueRows.length; i += BATCH) {
    const batch = uniqueRows.slice(i, i + BATCH);

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const row of batch) {
      const placeholders = [];
      for (const val of [
        row.timestamp, row.display_id, row.raw_display_id, row.location_name,
        row.serial_number, row.registration_date, row.heartbeat, row.is_alive,
        row.display_status, row.last_online_date, row.days_offline
      ]) {
        placeholders.push('$' + paramIdx);
        params.push(val);
        paramIdx++;
      }
      values.push('(' + placeholders.join(',') + ')');
    }

    try {
      const result = await pg.query(`
        INSERT INTO public.display_heartbeats
          (timestamp, display_id, raw_display_id, location_name, serial_number,
           registration_date, heartbeat, is_alive, display_status, last_online_date, days_offline)
        VALUES ${values.join(',')}
        ON CONFLICT (display_id, timestamp) DO NOTHING
      `, params);
      inserted += result.rowCount;
    } catch (e) {
      errors += batch.length;
      if (errors <= 5) console.error('  Batch error at row ' + i + ':', e.message.substring(0, 200));
    }

    if ((i + BATCH) % 5000 < BATCH) {
      console.log('  Progress: ' + Math.min(i + BATCH, uniqueRows.length) + '/' + uniqueRows.length + ' (inserted: ' + inserted + ', errors: ' + errors + ')');
    }
  }

  console.log('\nHeartbeat migration complete:');
  console.log('  Inserted: ' + inserted);
  console.log('  Errors: ' + errors);

  const final = await pg.query('SELECT COUNT(*) FROM public.display_heartbeats');
  console.log('  Total rows in table: ' + final.rows[0].count);
}

async function migrateCommunications(pg) {
  console.log('\n========================================');
  console.log('=== COMMUNICATIONS MIGRATION ===');
  console.log('========================================\n');

  const existing = await pg.query('SELECT COUNT(*) FROM public.communications');
  console.log('Existing rows: ' + existing.rows[0].count);

  // Fetch Activity Log from Airtable
  const fields = [
    'Channel', 'Direction', 'Subject', 'Message', 'Timestamp',
    'Status', 'Recipient Name', 'Recipient Contact', 'Sender',
    'External ID', 'Location', 'Location Name (from Location)',
    'Display ID (from Location)', 'JET ID (from Location)',
    'Related Task',
  ].map(f => 'fields[]=' + encodeURIComponent(f)).join('&');

  let allComms = [];
  let offset = null;
  let page = 0;
  do {
    page++;
    const offsetParam = offset ? '&offset=' + encodeURIComponent(offset) : '';
    const url = 'https://api.airtable.com/v0/' + AIRTABLE_BASE + '/' + ACTIVITY_LOG_TABLE + '?' + fields + '&pageSize=100' + offsetParam;
    if (page % 5 === 0 || page === 1) console.log('  Airtable page ' + page + '...');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN } });
    if (!res.ok) {
      const txt = await res.text();
      console.error('  Error: ' + res.status + ' ' + txt.substring(0, 200));
      break;
    }
    const data = await res.json();
    allComms = allComms.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  console.log('  Total communications from Airtable: ' + allComms.length + '\n');

  if (allComms.length === 0) {
    console.log('  No communications to migrate.');
    return;
  }

  let cCount = 0;
  let cErrors = 0;

  for (const rec of allComms) {
    const f = rec.fields;
    try {
      await pg.query(`
        INSERT INTO public.communications
          (id, channel, direction, subject, message, timestamp, status,
           recipient_name, recipient_contact, sender, external_id,
           location_ids, location_names, display_ids, jet_ids, related_task, airtable_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (airtable_id) DO UPDATE SET
          channel = EXCLUDED.channel, direction = EXCLUDED.direction,
          subject = EXCLUDED.subject, message = EXCLUDED.message,
          timestamp = EXCLUDED.timestamp, status = EXCLUDED.status,
          recipient_name = EXCLUDED.recipient_name, recipient_contact = EXCLUDED.recipient_contact,
          sender = EXCLUDED.sender, external_id = EXCLUDED.external_id,
          location_ids = EXCLUDED.location_ids, location_names = EXCLUDED.location_names,
          display_ids = EXCLUDED.display_ids, jet_ids = EXCLUDED.jet_ids,
          related_task = EXCLUDED.related_task, updated_at = now()
      `, [
        rec.id,
        f['Channel'] || null,
        f['Direction'] || null,
        f['Subject'] || null,
        f['Message'] || null,
        f['Timestamp'] || null,
        f['Status'] || null,
        f['Recipient Name'] || null,
        f['Recipient Contact'] || null,
        f['Sender'] || null,
        f['External ID'] || null,
        f['Location'] || [],
        f['Location Name (from Location)'] || [],
        f['Display ID (from Location)'] || [],
        f['JET ID (from Location)'] || [],
        f['Related Task'] || [],
        rec.id,
      ]);
      cCount++;
    } catch (e) {
      cErrors++;
      if (cErrors <= 5) console.error('  Comm error:', e.message.substring(0, 200));
    }

    if (cCount % 100 === 0 && cCount > 0) {
      console.log('  Inserted: ' + cCount + '/' + allComms.length);
    }
  }

  console.log('\nCommunications migration complete:');
  console.log('  Inserted: ' + cCount);
  console.log('  Errors: ' + cErrors);

  const final = await pg.query('SELECT COUNT(*) FROM public.communications');
  console.log('  Total rows in table: ' + final.rows[0].count);
}

async function run() {
  const pg = new Client({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000, // 60s per statement
  });
  await pg.connect();
  console.log('Connected to Supabase PostgreSQL');

  await migrateHeartbeats(pg);
  await migrateCommunications(pg);

  // Final summary
  console.log('\n========================================');
  console.log('=== FINAL COUNTS ===');
  console.log('========================================');
  for (const t of ['display_heartbeats', 'communications', 'stammdaten', 'tasks', 'installationen']) {
    const res = await pg.query('SELECT COUNT(*) FROM public.' + t);
    console.log('  ' + t + ': ' + res.rows[0].count);
  }

  await pg.end();
  console.log('\nAll migrations complete!');
}

run().catch(err => { console.error(err); process.exit(1); });
