const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://hvgjdosdejnwkuyivnrq.supabase.co',
  '***REMOVED_SERVICE_ROLE_KEY***'
);

async function run() {
  // 1. First, delete the HACKER row
  console.log('1. Deleting HACKER user...');
  const { error: delErr } = await supabase.from('app_users').delete().eq('email', 'hacker@evil.com');
  console.log(delErr ? `   Error: ${delErr.message}` : '   Deleted!');

  // 2. Fix RLS policies via raw SQL
  console.log('\n2. Fixing RLS policies...');

  const sqlStatements = [
    // ─── Drop existing overly permissive policies ───
    `DROP POLICY IF EXISTS "app_users_select" ON public.app_users`,
    `DROP POLICY IF EXISTS "app_users_insert" ON public.app_users`,
    `DROP POLICY IF EXISTS "app_users_update" ON public.app_users`,
    `DROP POLICY IF EXISTS "app_users_delete" ON public.app_users`,
    `DROP POLICY IF EXISTS "groups_select" ON public.groups`,
    `DROP POLICY IF EXISTS "groups_insert" ON public.groups`,
    `DROP POLICY IF EXISTS "groups_update" ON public.groups`,
    `DROP POLICY IF EXISTS "groups_delete" ON public.groups`,
    `DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log`,
    `DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log`,
    `DROP POLICY IF EXISTS "audit_log_delete" ON public.audit_log`,

    // Also drop any policies created during initial migration
    `DROP POLICY IF EXISTS "Users can read own profile" ON public.app_users`,
    `DROP POLICY IF EXISTS "Admins can manage users" ON public.app_users`,
    `DROP POLICY IF EXISTS "Anyone can read groups" ON public.groups`,
    `DROP POLICY IF EXISTS "Anyone can read audit log" ON public.audit_log`,
    `DROP POLICY IF EXISTS "Authenticated users can insert audit entries" ON public.audit_log`,

    // ─── Ensure RLS is ON ───
    `ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY`,

    // ─── app_users policies ───
    // SELECT: authenticated users can read all users (needed for admin panel & login profile fetch)
    `CREATE POLICY "app_users_select" ON public.app_users FOR SELECT TO authenticated USING (true)`,
    // INSERT: only service_role (admin API) can create users - NO anon, NO regular authenticated
    // (users are created via Supabase Auth Admin API, not direct insert)
    // UPDATE: users can update their own profile; admins (matched by group_id) can update anyone
    `CREATE POLICY "app_users_update" ON public.app_users FOR UPDATE TO authenticated USING (
      auth.uid() = auth_id OR
      EXISTS (SELECT 1 FROM public.app_users au WHERE au.auth_id = auth.uid() AND au.group_id = 'grp_admin')
    )`,
    // DELETE: only admins
    `CREATE POLICY "app_users_delete" ON public.app_users FOR DELETE TO authenticated USING (
      EXISTS (SELECT 1 FROM public.app_users au WHERE au.auth_id = auth.uid() AND au.group_id = 'grp_admin')
    )`,

    // ─── groups policies ───
    // SELECT: authenticated users can read groups (needed for login, admin panel)
    `CREATE POLICY "groups_select" ON public.groups FOR SELECT TO authenticated USING (true)`,
    // INSERT/UPDATE/DELETE: nobody via client (managed via migrations or service_role)

    // ─── audit_log policies ───
    // SELECT: authenticated users can read audit log
    `CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT TO authenticated USING (true)`,
    // INSERT: authenticated users can write audit entries (fire-and-forget logging)
    `CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true)`,
    // DELETE: nobody (DSGVO: audit log is permanent)
  ];

  for (const sql of sqlStatements) {
    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
    if (error) {
      // rpc might not exist, try raw query via REST
      // Fallback: use the Supabase Management API or direct pg
      console.log(`   SQL: ${sql.substring(0, 60)}...`);
      console.log(`   Note: ${error.message}`);
    } else {
      console.log(`   OK: ${sql.substring(0, 60)}...`);
    }
  }

  console.log('\n3. Checking if we need pg module for direct SQL...');
}

run().catch(console.error);
