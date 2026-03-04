import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${SUPABASE_URL}/rest/v1/airtable_displays?select=online_status&order=online_status`, {
  headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
});
const data = await res.json();
const counts = {};
data.forEach(d => { const s = d.online_status || '(null)'; counts[s] = (counts[s] || 0) + 1; });
console.log('online_status Werte in airtable_displays:');
Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${JSON.stringify(k)}: ${v}`));
console.log('Total:', data.length);
