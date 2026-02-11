const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:***REMOVED***@db.hvgjdosdejnwkuyivnrq.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // The anon role DELETE "succeeded" because RLS SELECT returns 0 rows (nothing to delete).
  // But let's be explicit and also revoke DELETE on anon for defense in depth.

  // Check: does anon role have table-level DELETE permission?
  const permsResult = await client.query(`
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('app_users', 'groups', 'audit_log')
      AND grantee IN ('anon', 'authenticated')
    ORDER BY table_name, grantee, privilege_type;
  `);
  console.log('Current table grants:');
  permsResult.rows.forEach(r => console.log(`  ${r.grantee}: ${r.privilege_type}`));

  // Revoke all write operations from anon on these tables
  console.log('\nRevoking anon write permissions...');
  await client.query('REVOKE INSERT, UPDATE, DELETE ON public.app_users FROM anon');
  await client.query('REVOKE INSERT, UPDATE, DELETE ON public.groups FROM anon');
  await client.query('REVOKE UPDATE, DELETE ON public.audit_log FROM anon');
  // Keep SELECT on anon for Supabase auth flow (it checks if email exists during signup)
  // Actually, for full lockdown, revoke SELECT too since we only want authenticated access
  await client.query('REVOKE SELECT ON public.app_users FROM anon');
  await client.query('REVOKE SELECT ON public.groups FROM anon');
  await client.query('REVOKE SELECT ON public.audit_log FROM anon');
  console.log('Done revoking anon permissions.');

  // Verify
  const verifyResult = await client.query(`
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('app_users', 'groups', 'audit_log')
      AND grantee IN ('anon', 'authenticated')
    ORDER BY table_name, grantee, privilege_type;
  `);
  console.log('\nUpdated grants:');
  verifyResult.rows.forEach(r => console.log(`  ${r.table_name} → ${r.grantee}: ${r.privilege_type}`));

  await client.end();
  console.log('\nDone!');
}

run().catch(err => { console.error(err); process.exit(1); });
