const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://hvgjdosdejnwkuyivnrq.supabase.co',
  '***REMOVED_SERVICE_ROLE_KEY***'
);

async function run() {
  const { data: groups, error } = await supabase.from('groups').select('*');
  if (error) { console.error(error); return; }

  console.log('Current groups:');
  for (const g of groups) {
    console.log(g.id, '-> actions:', JSON.stringify(g.actions));
  }

  for (const g of groups) {
    const currentActions = g.actions || [];
    if (currentActions.includes('view_contacts')) {
      console.log(g.id, 'already has view_contacts');
      continue;
    }
    // Only admin and operations get view_contacts by default
    if (['grp_admin', 'grp_operations'].includes(g.id)) {
      const newActions = [...currentActions, 'view_contacts'];
      const { error: updateErr } = await supabase
        .from('groups')
        .update({ actions: newActions })
        .eq('id', g.id);
      if (updateErr) console.error('Error updating', g.id, updateErr);
      else console.log('Added view_contacts to', g.id);
    }
  }

  // Verify
  const { data: updated } = await supabase.from('groups').select('id, actions');
  console.log('\nUpdated groups:');
  for (const g of updated) {
    console.log(g.id, '->', JSON.stringify(g.actions));
  }
}

run();
