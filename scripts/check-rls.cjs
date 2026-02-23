const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_ANON_KEY) {
  console.error('ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY environment variables are required.');
  process.exit(1);
}

// Use service role to check RLS status
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Use anon key to test what anon can see
const supabaseAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function run() {
  console.log('=== RLS STATUS CHECK ===\n');

  // Check RLS via pg_tables
  const { data: rls, error: rlsErr } = await supabase.rpc('check_rls_status').select();

  // Fallback: query the tables directly
  console.log('--- Checking what ANON key can access (without login) ---\n');

  // 1. Try to read app_users with anon key (no auth)
  const { data: users, error: usersErr } = await supabaseAnon.from('app_users').select('*');
  console.log('app_users (anon, no auth):', users ? `${users.length} rows accessible` : `blocked: ${usersErr?.message}`);

  // 2. Try to read groups
  const { data: groups, error: groupsErr } = await supabaseAnon.from('groups').select('*');
  console.log('groups (anon, no auth):', groups ? `${groups.length} rows accessible` : `blocked: ${groupsErr?.message}`);

  // 3. Try to read audit_log
  const { data: audit, error: auditErr } = await supabaseAnon.from('audit_log').select('*').limit(5);
  console.log('audit_log (anon, no auth):', audit ? `${audit.length} rows accessible` : `blocked: ${auditErr?.message}`);

  // 4. Try to INSERT into app_users (should be blocked)
  const { error: insertErr } = await supabaseAnon.from('app_users').insert({
    name: 'HACKER', email: 'hacker@evil.com', group_id: 'grp_admin'
  });
  console.log('app_users INSERT (anon):', insertErr ? `BLOCKED: ${insertErr.message}` : 'ALLOWED (DANGER!)');

  // 5. Try to DELETE from app_users (should be blocked)
  const { error: deleteErr } = await supabaseAnon.from('app_users').delete().eq('email', 'max@dimension-outdoor.com');
  console.log('app_users DELETE (anon):', deleteErr ? `BLOCKED: ${deleteErr.message}` : 'ALLOWED (DANGER!)');

  // 6. Try to INSERT into audit_log (this should be allowed for logging)
  const { error: auditInsertErr } = await supabaseAnon.from('audit_log').insert({
    action: 'rls_test', detail: 'Testing RLS policy', user_name: 'test'
  });
  console.log('audit_log INSERT (anon):', auditInsertErr ? `BLOCKED: ${auditInsertErr.message}` : 'ALLOWED (expected for logging)');

  console.log('\n--- Checking what SERVICE ROLE can access ---\n');
  const { data: allUsers } = await supabase.from('app_users').select('id, name, email, group_id');
  console.log('app_users (service_role):', allUsers ? `${allUsers.length} rows` : 'error');
  if (allUsers) allUsers.forEach(u => console.log(`  - ${u.name} (${u.email}) [${u.group_id}]`));
}

run().catch(console.error);
