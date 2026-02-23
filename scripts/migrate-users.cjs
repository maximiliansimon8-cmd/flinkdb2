/**
 * Migration script: Airtable external_team → Supabase Auth + app_users
 */
const { Client } = require('pg');
const https = require('https');

const SUPABASE_URL = 'https://hvgjdosdejnwkuyivnrq.supabase.co';
const SERVICE_KEY = '***REMOVED_SERVICE_ROLE_KEY***';
const AIRTABLE_TOKEN = '***REMOVED_AIRTABLE_PAT***';
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required. Set it before running this script.');
  process.exit(1);
}

const PG_URL = process.env.DATABASE_URL;

const ADMIN_EMAILS = ['max@dimension-outdoor.com', 'luca@dimension-outdoor.com'];
const DEFAULT_PASSWORD = '***REMOVED_DEFAULT_PW***';

function fetchJSON(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function run() {
  // 1. Fetch all users from Airtable
  console.log('📥 Fetching users from Airtable...');
  let allRecords = [];
  let offset = null;
  do {
    const url = `https://api.airtable.com/v0/apppFUWK829K6B3R2/tblPxz19KsF1TUkwr?pageSize=100${offset ? '&offset=' + offset : ''}`;
    const res = await fetchJSON(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    allRecords = allRecords.concat(res.data.records || []);
    offset = res.data.offset || null;
  } while (offset);

  console.log(`Found ${allRecords.length} Airtable records`);

  // 2. Connect to PostgreSQL
  const pg = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  console.log('Connected to PostgreSQL');

  // 3. Migrate each user
  let created = 0, skipped = 0, errors = 0;
  const seenEmails = new Set();

  for (const record of allRecords) {
    const f = record.fields;
    const name = (f.Name || '').trim();
    const email = (f['E-Mail'] || '').trim().toLowerCase();
    const phone = f.Phone || '';

    if (!email || !name) {
      console.log(`  ⏭ Skipping (no name/email): ${name || record.id}`);
      skipped++;
      continue;
    }

    if (seenEmails.has(email)) {
      console.log(`  ⏭ Duplicate email: ${email}`);
      skipped++;
      continue;
    }
    seenEmails.add(email);

    const groupId = ADMIN_EMAILS.includes(email) ? 'grp_admin' : 'grp_operations';

    try {
      // Create Supabase Auth user via Admin API
      const authRes = await fetchJSON(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          email: email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: { name: name },
        }),
      });

      let authId = null;
      if (authRes.status === 200 || authRes.status === 201) {
        authId = authRes.data.id;
      } else {
        const errMsg = JSON.stringify(authRes.data).substring(0, 150);
        console.log(`  ⚠ Auth note for ${email}: ${errMsg}`);
      }

      // Insert into app_users
      await pg.query(
        `INSERT INTO app_users (auth_id, name, email, phone, group_id, active, airtable_record_id)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           airtable_record_id = EXCLUDED.airtable_record_id,
           auth_id = COALESCE(EXCLUDED.auth_id, app_users.auth_id)`,
        [authId, name, email, phone, groupId, record.id],
      );

      created++;
      const authLabel = authId ? ` auth:${authId.substring(0, 8)}` : '';
      console.log(`  ✅ ${name} (${email}) → ${groupId}${authLabel}`);
    } catch (err) {
      console.log(`  ❌ Error for ${email}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n📊 Migration complete:');
  console.log(`   Created/Updated: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);

  // Verify
  const countRes = await pg.query('SELECT count(*) FROM app_users');
  const groupRes = await pg.query('SELECT group_id, count(*) FROM app_users GROUP BY group_id ORDER BY count DESC');
  console.log(`   Total in DB: ${countRes.rows[0].count}`);
  console.log('   By group:');
  for (const row of groupRes.rows) {
    console.log(`     ${row.group_id}: ${row.count}`);
  }

  await pg.end();
}

run().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
