const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:***REMOVED***@db.hvgjdosdejnwkuyivnrq.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Also revoke INSERT from anon on audit_log
  // Login audit entries are written AFTER successful auth (authenticated role)
  // Failed login attempts can be logged server-side or skipped
  await client.query('REVOKE INSERT ON public.audit_log FROM anon');
  await client.query('REVOKE SELECT ON public.audit_log FROM anon');
  console.log('Revoked anon INSERT+SELECT on audit_log');

  // Also revoke TRUNCATE, TRIGGER, REFERENCES from anon on all tables (cleanup)
  await client.query('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.app_users FROM anon');
  await client.query('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.groups FROM anon');
  await client.query('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.audit_log FROM anon');
  console.log('Revoked TRUNCATE/TRIGGER/REFERENCES from anon on all tables');

  // Also restrict authenticated: remove TRUNCATE, TRIGGER, REFERENCES
  await client.query('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.app_users FROM authenticated');
  await client.query('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.groups FROM authenticated');
  await client.query('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.audit_log FROM authenticated');
  console.log('Revoked TRUNCATE/TRIGGER/REFERENCES from authenticated on all tables');

  // Restrict authenticated on groups: no INSERT/UPDATE/DELETE (managed by service_role)
  await client.query('REVOKE INSERT, UPDATE, DELETE ON public.groups FROM authenticated');
  console.log('Revoked write permissions on groups from authenticated');

  // Restrict authenticated DELETE on audit_log (DSGVO: immutable)
  await client.query('REVOKE DELETE ON public.audit_log FROM authenticated');
  console.log('Revoked DELETE on audit_log from authenticated');

  // Restrict authenticated INSERT on app_users (only via service_role admin API)
  await client.query('REVOKE INSERT ON public.app_users FROM authenticated');
  console.log('Revoked INSERT on app_users from authenticated (use service_role for user creation)');

  // Final check
  const verifyResult = await client.query(`
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('app_users', 'groups', 'audit_log')
      AND grantee IN ('anon', 'authenticated')
    ORDER BY table_name, grantee, privilege_type;
  `);
  console.log('\n=== FINAL PERMISSIONS ===');
  let lastTable = '';
  verifyResult.rows.forEach(r => {
    if (r.table_name !== lastTable) { console.log(`\n  ${r.table_name}:`); lastTable = r.table_name; }
    console.log(`    ${r.grantee}: ${r.privilege_type}`);
  });

  await client.end();
  console.log('\n\nDone! Permissions are now minimal.');
}

run().catch(err => { console.error(err); process.exit(1); });
