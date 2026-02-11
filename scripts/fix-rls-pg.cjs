const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:***REMOVED***@db.hvgjdosdejnwkuyivnrq.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Supabase PostgreSQL\n');

  // 1. Check current RLS status
  console.log('=== CURRENT RLS STATUS ===');
  const rlsResult = await client.query(`
    SELECT schemaname, tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('app_users', 'groups', 'audit_log')
    ORDER BY tablename;
  `);
  rlsResult.rows.forEach(r => console.log(`  ${r.tablename}: RLS ${r.rowsecurity ? 'ON' : 'OFF'}`));

  // 2. Check current policies
  console.log('\n=== CURRENT POLICIES ===');
  const polResult = await client.query(`
    SELECT pol.polname, tab.relname, pol.polcmd, pol.polroles::regrole[]
    FROM pg_policy pol
    JOIN pg_class tab ON pol.polrelid = tab.oid
    WHERE tab.relnamespace = 'public'::regnamespace
    ORDER BY tab.relname, pol.polname;
  `);
  polResult.rows.forEach(r => console.log(`  ${r.relname} → ${r.polname} [${r.polcmd}]`));

  // 3. Drop ALL existing policies
  console.log('\n=== DROPPING OLD POLICIES ===');
  for (const row of polResult.rows) {
    const sql = `DROP POLICY IF EXISTS "${row.polname}" ON public.${row.relname}`;
    await client.query(sql);
    console.log(`  Dropped: ${row.polname} on ${row.relname}`);
  }

  // 4. Ensure RLS is ON for all tables
  console.log('\n=== ENABLING RLS ===');
  await client.query('ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY');
  await client.query('ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY');
  await client.query('ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY');
  console.log('  RLS enabled on all 3 tables');

  // 5. Force RLS for table owners too (important! otherwise service_role bypasses are fine but owner bypass is not)
  await client.query('ALTER TABLE public.app_users FORCE ROW LEVEL SECURITY');
  await client.query('ALTER TABLE public.groups FORCE ROW LEVEL SECURITY');
  await client.query('ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY');
  console.log('  RLS forced on all 3 tables (even for owner)');

  // 6. Create new strict policies
  console.log('\n=== CREATING NEW STRICT POLICIES ===');

  const policies = [
    // ─── app_users ───
    // SELECT: only authenticated users can read (login needs to fetch profile)
    {
      name: 'Authenticated users can read all profiles',
      sql: `CREATE POLICY "auth_users_select" ON public.app_users
            FOR SELECT TO authenticated
            USING (true)`
    },
    // INSERT: NOBODY via client (only service_role, which bypasses RLS)
    // No INSERT policy = anon and authenticated cannot insert
    // UPDATE: user can update own row; admins can update anyone
    {
      name: 'Users can update own profile, admins can update all',
      sql: `CREATE POLICY "auth_users_update" ON public.app_users
            FOR UPDATE TO authenticated
            USING (
              auth.uid() = auth_id OR
              EXISTS (SELECT 1 FROM public.app_users au WHERE au.auth_id = auth.uid() AND au.group_id = 'grp_admin')
            )
            WITH CHECK (
              auth.uid() = auth_id OR
              EXISTS (SELECT 1 FROM public.app_users au WHERE au.auth_id = auth.uid() AND au.group_id = 'grp_admin')
            )`
    },
    // DELETE: only admins
    {
      name: 'Only admins can delete users',
      sql: `CREATE POLICY "auth_users_delete" ON public.app_users
            FOR DELETE TO authenticated
            USING (
              EXISTS (SELECT 1 FROM public.app_users au WHERE au.auth_id = auth.uid() AND au.group_id = 'grp_admin')
            )`
    },

    // ─── groups ───
    // SELECT: authenticated can read (needed for login + admin)
    {
      name: 'Authenticated users can read groups',
      sql: `CREATE POLICY "auth_groups_select" ON public.groups
            FOR SELECT TO authenticated
            USING (true)`
    },
    // No INSERT/UPDATE/DELETE policies → only service_role can modify groups

    // ─── audit_log ───
    // SELECT: authenticated can read
    {
      name: 'Authenticated users can read audit log',
      sql: `CREATE POLICY "auth_audit_select" ON public.audit_log
            FOR SELECT TO authenticated
            USING (true)`
    },
    // INSERT: authenticated can write (for fire-and-forget logging)
    {
      name: 'Authenticated users can insert audit entries',
      sql: `CREATE POLICY "auth_audit_insert" ON public.audit_log
            FOR INSERT TO authenticated
            WITH CHECK (true)`
    },
    // No UPDATE/DELETE policies → audit log is immutable (DSGVO)
  ];

  for (const p of policies) {
    await client.query(p.sql);
    console.log(`  Created: ${p.name}`);
  }

  // 7. Verify
  console.log('\n=== VERIFICATION ===');
  const verifyPol = await client.query(`
    SELECT pol.polname, tab.relname,
           CASE pol.polcmd
             WHEN 'r' THEN 'SELECT'
             WHEN 'a' THEN 'INSERT'
             WHEN 'w' THEN 'UPDATE'
             WHEN 'd' THEN 'DELETE'
             WHEN '*' THEN 'ALL'
           END as command
    FROM pg_policy pol
    JOIN pg_class tab ON pol.polrelid = tab.oid
    WHERE tab.relnamespace = 'public'::regnamespace
    ORDER BY tab.relname, pol.polname;
  `);
  verifyPol.rows.forEach(r => console.log(`  ${r.relname} → ${r.polname} [${r.command}]`));

  const verifyRls = await client.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('app_users', 'groups', 'audit_log');
  `);
  verifyRls.rows.forEach(r => console.log(`  ${r.tablename}: RLS ${r.rowsecurity ? 'ON ✅' : 'OFF ❌'}`));

  await client.end();
  console.log('\nDone! RLS is now properly configured.');
}

run().catch(err => { console.error(err); process.exit(1); });
