const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required. Set it before running this script.');
  process.exit(1);
}

const PG_URL = process.env.DATABASE_URL;
const AIRTABLE_TOKEN = '***REMOVED_AIRTABLE_PAT***';
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const ACTIVITY_LOG_TABLE = 'tblDk1dl4J3Ow3Qde';

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/export?format=csv&gid=0';

async function run() {
  const pg = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  console.log('Connected to Supabase PostgreSQL\n');

  // 1. Create display_heartbeats table
  console.log('=== Creating display_heartbeats table ===');
  await pg.query(`
    CREATE TABLE IF NOT EXISTS public.display_heartbeats (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ,
      display_id TEXT NOT NULL,
      raw_display_id TEXT,
      location_name TEXT,
      serial_number TEXT,
      registration_date TEXT,
      heartbeat TEXT,
      is_alive TEXT,
      display_status TEXT,
      last_online_date TEXT,
      days_offline INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_heartbeats_display_id ON public.display_heartbeats (display_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON public.display_heartbeats (timestamp DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_heartbeats_unique ON public.display_heartbeats (display_id, timestamp);
  `);
  console.log('  Table created\n');

  // 2. Create communications table
  console.log('=== Creating communications table ===');
  await pg.query(`
    CREATE TABLE IF NOT EXISTS public.communications (
      id TEXT PRIMARY KEY,
      channel TEXT,
      direction TEXT,
      subject TEXT,
      message TEXT,
      timestamp TIMESTAMPTZ,
      status TEXT,
      recipient_name TEXT,
      recipient_contact TEXT,
      sender TEXT,
      external_id TEXT,
      location_ids TEXT[] DEFAULT '{}',
      location_names TEXT[] DEFAULT '{}',
      display_ids TEXT[] DEFAULT '{}',
      jet_ids TEXT[] DEFAULT '{}',
      related_task TEXT[] DEFAULT '{}',
      airtable_id TEXT UNIQUE NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_comms_timestamp ON public.communications (timestamp DESC);
  `);
  console.log('  Table created\n');

  // 3. Enable RLS
  console.log('=== Setting up RLS ===');
  for (const table of ['display_heartbeats', 'communications']) {
    await pg.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await pg.query(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
    await pg.query(`DROP POLICY IF EXISTS "${table}_select" ON public.${table}`);
    await pg.query(`CREATE POLICY "${table}_select" ON public.${table} FOR SELECT TO authenticated USING (true)`);
    await pg.query(`REVOKE ALL ON public.${table} FROM anon`);
    await pg.query(`GRANT SELECT ON public.${table} TO authenticated`);
  }
  await pg.query(`GRANT USAGE, SELECT ON SEQUENCE display_heartbeats_id_seq TO authenticated`);
  console.log('  RLS enabled\n');

  // 4. Fetch & insert Google Sheets data
  console.log('=== Fetching Google Sheets CSV ===');
  const csvRes = await fetch(SHEET_CSV_URL, {
    headers: { 'User-Agent': 'JET-Dashboard-Migration/1.0' },
  });
  if (!csvRes.ok) {
    console.error('  Error fetching CSV:', csvRes.status);
  } else {
    const csvText = await csvRes.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    console.log('  Headers:', headers.join(', '));
    console.log('  Total rows: ' + (lines.length - 1) + '\n');

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

    const colIdx = {};
    headers.forEach((h, i) => { colIdx[h] = i; });
    console.log('  Column map:', JSON.stringify(colIdx));

    console.log('\n=== Inserting heartbeat data ===');
    let hCount = 0;
    let hErrors = 0;

    await pg.query('BEGIN');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      const displayId = cols[colIdx['Display ID']] || '';
      const timestamp = cols[colIdx['Timestamp']] || '';

      if (!displayId || !timestamp) continue;

      const slashIdx = displayId.indexOf('/');
      const stableId = slashIdx >= 0 ? displayId.substring(0, slashIdx).trim() : displayId.trim();

      try {
        await pg.query(`
          INSERT INTO public.display_heartbeats
            (timestamp, display_id, raw_display_id, location_name, serial_number,
             registration_date, heartbeat, is_alive, display_status, last_online_date, days_offline)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (display_id, timestamp) DO NOTHING
        `, [
          timestamp || null,
          stableId,
          displayId,
          cols[colIdx['Location Name']] || null,
          cols[colIdx['Serial Number']] || null,
          cols[colIdx['Date']] || null,
          cols[colIdx['Status']] || null,
          cols[colIdx['Is Alive']] || null,
          cols[colIdx['Display Status']] || null,
          cols[colIdx['Last Online Date']] || null,
          cols[colIdx['Days Offline']] ? parseInt(cols[colIdx['Days Offline']]) || null : null,
        ]);
        hCount++;
      } catch (e) {
        hErrors++;
        if (hErrors <= 3) console.error('  Row error:', e.message.substring(0, 100));
      }

      if (hCount % 5000 === 0) {
        await pg.query('COMMIT');
        await pg.query('BEGIN');
        console.log('  Progress: ' + hCount + ' rows...');
      }
    }
    await pg.query('COMMIT');
    console.log('  Heartbeats inserted: ' + hCount + ' (errors: ' + hErrors + ')\n');
  }

  // 5. Fetch & insert Activity Log from Airtable
  console.log('=== Fetching Activity Log from Airtable ===');
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
    if (page % 5 === 0 || page === 1) console.log('  Page ' + page + '...');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN } });
    if (!res.ok) { console.error('  Error: ' + res.status); break; }
    const data = await res.json();
    allComms = allComms.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  console.log('  Total communications: ' + allComms.length + '\n');

  console.log('=== Inserting communications ===');
  let cCount = 0;
  await pg.query('BEGIN');
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
      console.error('  Comm error:', e.message.substring(0, 100));
    }
  }
  await pg.query('COMMIT');
  console.log('  Communications inserted: ' + cCount + '\n');

  // Verify
  console.log('=== FINAL COUNTS ===');
  for (const t of ['display_heartbeats', 'communications', 'stammdaten', 'tasks', 'installationen']) {
    const res = await pg.query('SELECT COUNT(*) FROM public.' + t);
    console.log('  ' + t + ': ' + res.rows[0].count + ' records');
  }

  await pg.end();
  console.log('\nMigration complete!');
}

run().catch(err => { console.error(err); process.exit(1); });
