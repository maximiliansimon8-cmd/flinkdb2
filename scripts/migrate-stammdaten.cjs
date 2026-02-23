/**
 * Migrate Stammdaten from Airtable to Supabase
 * - Creates stammdaten table in Supabase
 * - Fetches all records from Airtable
 * - Inserts into Supabase
 * - This is a one-time migration + sync script
 */

const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required. Set it before running this script.');
  process.exit(1);
}

const AIRTABLE_TOKEN = '***REMOVED_AIRTABLE_PAT***';
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const STAMMDATEN_TABLE = 'tblLJ1S7OUhc2w5Jw';
const TASKS_TABLE = 'tblcKHWJg77mgIQ9l';
const INSTALLATIONEN_TABLE = 'tblKznpAOAMvEfX8u';

const PG_URL = process.env.DATABASE_URL;

async function fetchAllAirtable(tableId, fields) {
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  let allRecords = [];
  let offset = null;
  let page = 0;

  do {
    page++;
    const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?${fieldParams}&pageSize=100${offsetParam}`;
    console.log(`  Page ${page}...`);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });
    if (!res.ok) {
      console.error(`  Error: ${res.status} ${await res.text()}`);
      break;
    }
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);

  console.log(`  Total: ${allRecords.length} records`);
  return allRecords;
}

async function run() {
  const pg = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  console.log('Connected to Supabase PostgreSQL\n');

  // ─── 1. Create stammdaten table ───
  console.log('=== Creating stammdaten table ===');
  await pg.query(`
    CREATE TABLE IF NOT EXISTS public.stammdaten (
      id TEXT PRIMARY KEY,
      jet_id TEXT,
      display_ids TEXT[] DEFAULT '{}',
      location_name TEXT,
      contact_person TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      location_email TEXT,
      location_phone TEXT,
      legal_entity TEXT,
      street TEXT,
      street_number TEXT,
      postal_code TEXT,
      city TEXT,
      lead_status TEXT[],
      airtable_id TEXT UNIQUE NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('  Table created\n');

  // ─── 2. Create tasks table ───
  console.log('=== Creating tasks table ===');
  await pg.query(`
    CREATE TABLE IF NOT EXISTS public.tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      task_type TEXT[] DEFAULT '{}',
      status TEXT,
      priority TEXT,
      due_date DATE,
      description TEXT,
      created_time TIMESTAMPTZ,
      responsible_user TEXT,
      assigned TEXT[] DEFAULT '{}',
      created_by TEXT,
      display_ids TEXT[] DEFAULT '{}',
      location_names TEXT[] DEFAULT '{}',
      overdue TEXT,
      completed_date TIMESTAMPTZ,
      completed_by TEXT,
      airtable_id TEXT UNIQUE NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('  Table created\n');

  // ─── 3. Create installationen table ───
  console.log('=== Creating installationen table ===');
  await pg.query(`
    CREATE TABLE IF NOT EXISTS public.installationen (
      id TEXT PRIMARY KEY,
      display_ids TEXT[] DEFAULT '{}',
      install_date DATE,
      status TEXT,
      installation_type TEXT,
      integrator TEXT,
      technicians TEXT[] DEFAULT '{}',
      protocol_url TEXT,
      protocol_filename TEXT,
      screen_type TEXT,
      screen_size TEXT,
      ops_nr TEXT,
      sim_id TEXT,
      install_start TIMESTAMPTZ,
      install_end TIMESTAMPTZ,
      remarks TEXT,
      partner_name TEXT,
      airtable_id TEXT UNIQUE NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('  Table created\n');

  // ─── 4. Enable RLS & set policies ───
  console.log('=== Setting up RLS ===');
  for (const table of ['stammdaten', 'tasks', 'installationen']) {
    await pg.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await pg.query(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);

    // Drop old policies if any
    await pg.query(`DROP POLICY IF EXISTS "${table}_select" ON public.${table}`);

    // SELECT for authenticated only
    await pg.query(`
      CREATE POLICY "${table}_select" ON public.${table}
      FOR SELECT TO authenticated USING (true)
    `);

    // Revoke anon
    await pg.query(`REVOKE ALL ON public.${table} FROM anon`);
    // Grant only SELECT to authenticated
    await pg.query(`GRANT SELECT ON public.${table} TO authenticated`);
  }
  console.log('  RLS enabled, anon locked out, authenticated SELECT only\n');

  // ─── 5. Fetch & insert Stammdaten ───
  console.log('=== Fetching Stammdaten from Airtable ===');
  const stammdatenRecords = await fetchAllAirtable(STAMMDATEN_TABLE, [
    'JET ID', 'Display ID', 'Location Name', 'Contact Person',
    'Contact Email', 'Contact Phone', 'Location Email', 'Location Phone',
    'Legal Entity', 'Street', 'Street Number', 'Postal Code', 'City',
    'Lead Status  (from Akquise)'
  ]);

  console.log('\n=== Inserting Stammdaten into Supabase ===');
  let sCount = 0;
  for (const rec of stammdatenRecords) {
    const f = rec.fields;
    const jetId = Array.isArray(f['JET ID']) ? f['JET ID'][0] : (f['JET ID'] || null);
    const displayIds = Array.isArray(f['Display ID']) ? f['Display ID'] : [];
    const leadStatus = Array.isArray(f['Lead Status  (from Akquise)']) ? f['Lead Status  (from Akquise)'] : [];

    await pg.query(`
      INSERT INTO public.stammdaten (id, jet_id, display_ids, location_name, contact_person,
        contact_email, contact_phone, location_email, location_phone,
        legal_entity, street, street_number, postal_code, city, lead_status, airtable_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (airtable_id) DO UPDATE SET
        jet_id = EXCLUDED.jet_id,
        display_ids = EXCLUDED.display_ids,
        location_name = EXCLUDED.location_name,
        contact_person = EXCLUDED.contact_person,
        contact_email = EXCLUDED.contact_email,
        contact_phone = EXCLUDED.contact_phone,
        location_email = EXCLUDED.location_email,
        location_phone = EXCLUDED.location_phone,
        legal_entity = EXCLUDED.legal_entity,
        street = EXCLUDED.street,
        street_number = EXCLUDED.street_number,
        postal_code = EXCLUDED.postal_code,
        city = EXCLUDED.city,
        lead_status = EXCLUDED.lead_status,
        updated_at = now()
    `, [
      rec.id, // use airtable ID as primary key
      jetId,
      displayIds,
      f['Location Name'] || null,
      f['Contact Person'] || null,
      f['Contact Email'] || null,
      f['Contact Phone'] || null,
      f['Location Email'] || null,
      f['Location Phone'] || null,
      f['Legal Entity'] || null,
      f['Street'] || null,
      f['Street Number'] || null,
      f['Postal Code'] || null,
      f['City'] || null,
      leadStatus,
      rec.id
    ]);
    sCount++;
  }
  console.log(`  Inserted/updated ${sCount} Stammdaten records\n`);

  // ─── 6. Fetch & insert Tasks ───
  console.log('=== Fetching Tasks from Airtable ===');
  const taskRecords = await fetchAllAirtable(TASKS_TABLE, [
    'Task Title', 'Task Type', 'Status', 'Priority', 'Due Date',
    'Description', 'Created time', 'Responsible User', 'Assigned',
    'Created by', 'Display ID (from Displays )', 'Location Name (from Locations)',
    'Overdue', 'completed_task_date', 'completed_task_by'
  ]);

  console.log('\n=== Inserting Tasks into Supabase ===');
  let tCount = 0;
  for (const rec of taskRecords) {
    const f = rec.fields;
    const assigned = Array.isArray(f['Assigned'])
      ? f['Assigned'].map(a => typeof a === 'object' ? a.name : a).filter(Boolean)
      : [];
    const createdBy = f['Created by']?.name || f['Created by'] || null;
    const responsibleUser = f['Responsible User']?.name || f['Responsible User'] || null;

    await pg.query(`
      INSERT INTO public.tasks (id, title, task_type, status, priority, due_date,
        description, created_time, responsible_user, assigned, created_by,
        display_ids, location_names, overdue, completed_date, completed_by, airtable_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (airtable_id) DO UPDATE SET
        title = EXCLUDED.title,
        task_type = EXCLUDED.task_type,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        due_date = EXCLUDED.due_date,
        description = EXCLUDED.description,
        responsible_user = EXCLUDED.responsible_user,
        assigned = EXCLUDED.assigned,
        display_ids = EXCLUDED.display_ids,
        location_names = EXCLUDED.location_names,
        overdue = EXCLUDED.overdue,
        completed_date = EXCLUDED.completed_date,
        completed_by = EXCLUDED.completed_by,
        updated_at = now()
    `, [
      rec.id,
      f['Task Title'] || null,
      f['Task Type'] || [],
      f['Status'] || null,
      f['Priority'] || null,
      f['Due Date'] || null,
      f['Description'] || null,
      f['Created time'] || null,
      responsibleUser,
      assigned,
      createdBy,
      f['Display ID (from Displays )'] || [],
      f['Location Name (from Locations)'] || [],
      f['Overdue'] || null,
      f['completed_task_date'] || null,
      f['completed_task_by'] || null,
      rec.id
    ]);
    tCount++;
  }
  console.log(`  Inserted/updated ${tCount} Task records\n`);

  // ─── 7. Fetch & insert Installationen ───
  console.log('=== Fetching Installationen from Airtable ===');
  const installRecords = await fetchAllAirtable(INSTALLATIONEN_TABLE, [
    'Aufbau Datum', 'Status Installation', 'Installationsart',
    'Company (from Integrator)', 'Name (from Technikers)',
    'Installationsprotokoll', 'Screen Art', 'Screen Size',
    'OPS Nr', 'SIM-ID', 'Installationsstart', 'Installationsabschluss',
    'Allgemeine Bemerkungen', 'Abnahme Partner (Name)',
    'Display Table ID (from Link to Display ID )'
  ]);

  console.log('\n=== Inserting Installationen into Supabase ===');
  let iCount = 0;
  for (const rec of installRecords) {
    const f = rec.fields;
    const integrator = Array.isArray(f['Company (from Integrator)'])
      ? f['Company (from Integrator)'].join(', ')
      : (f['Company (from Integrator)'] || null);
    const technicians = Array.isArray(f['Name (from Technikers)'])
      ? f['Name (from Technikers)']
      : [];
    const protocol = Array.isArray(f['Installationsprotokoll']) && f['Installationsprotokoll'][0]
      ? f['Installationsprotokoll'][0]
      : null;
    const displayIds = Array.isArray(f['Display Table ID (from Link to Display ID )'])
      ? f['Display Table ID (from Link to Display ID )']
      : [];

    await pg.query(`
      INSERT INTO public.installationen (id, display_ids, install_date, status, installation_type,
        integrator, technicians, protocol_url, protocol_filename, screen_type, screen_size,
        ops_nr, sim_id, install_start, install_end, remarks, partner_name, airtable_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (airtable_id) DO UPDATE SET
        display_ids = EXCLUDED.display_ids,
        install_date = EXCLUDED.install_date,
        status = EXCLUDED.status,
        installation_type = EXCLUDED.installation_type,
        integrator = EXCLUDED.integrator,
        technicians = EXCLUDED.technicians,
        protocol_url = EXCLUDED.protocol_url,
        protocol_filename = EXCLUDED.protocol_filename,
        screen_type = EXCLUDED.screen_type,
        screen_size = EXCLUDED.screen_size,
        ops_nr = EXCLUDED.ops_nr,
        sim_id = EXCLUDED.sim_id,
        install_start = EXCLUDED.install_start,
        install_end = EXCLUDED.install_end,
        remarks = EXCLUDED.remarks,
        partner_name = EXCLUDED.partner_name,
        updated_at = now()
    `, [
      rec.id,
      displayIds,
      f['Aufbau Datum'] || null,
      f['Status Installation'] || null,
      f['Installationsart'] || null,
      integrator,
      technicians,
      protocol?.url || null,
      protocol?.filename || null,
      f['Screen Art'] || null,
      f['Screen Size'] || null,
      f['OPS Nr'] || null,
      f['SIM-ID'] || null,
      f['Installationsstart'] || null,
      f['Installationsabschluss'] || null,
      f['Allgemeine Bemerkungen'] || null,
      f['Abnahme Partner (Name)'] || null,
      rec.id
    ]);
    iCount++;
  }
  console.log(`  Inserted/updated ${iCount} Installation records\n`);

  // ─── 8. Create indexes for fast lookups ───
  console.log('=== Creating indexes ===');
  await pg.query('CREATE INDEX IF NOT EXISTS idx_stammdaten_jet_id ON public.stammdaten (jet_id)');
  await pg.query('CREATE INDEX IF NOT EXISTS idx_stammdaten_display_ids ON public.stammdaten USING GIN (display_ids)');
  await pg.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status)');
  await pg.query('CREATE INDEX IF NOT EXISTS idx_tasks_display_ids ON public.tasks USING GIN (display_ids)');
  await pg.query('CREATE INDEX IF NOT EXISTS idx_tasks_created ON public.tasks (created_time DESC)');
  await pg.query('CREATE INDEX IF NOT EXISTS idx_install_display_ids ON public.installationen USING GIN (display_ids)');
  console.log('  Indexes created\n');

  // ─── Summary ───
  console.log('=== MIGRATION COMPLETE ===');
  console.log(`  Stammdaten: ${sCount} records`);
  console.log(`  Tasks: ${tCount} records`);
  console.log(`  Installationen: ${iCount} records`);
  console.log('\nAll data now in Supabase. Frontend can read from Supabase directly (zero Netlify Function calls!)');

  await pg.end();
}

run().catch(err => { console.error(err); process.exit(1); });
