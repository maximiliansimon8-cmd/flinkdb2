/**
 * Quick check: installationen table status, jet_id coverage, freigabe status
 */
import { readFileSync } from 'fs';

let env = {};
try {
  const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
} catch { /* no .env.local */ }

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen in .env.local gesetzt sein'); process.exit(1); }

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/installationen?select=airtable_id,jet_id,status,location_name,freigabe_chg,freigabe_online_rate,freigabe_installation_vorort,freigabe_datum_chg,akquise_links&limit=1000`, {
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY }
  });
  const data = await res.json();
  console.log('Total installationen:', data.length);

  // Count by status
  const byStatus = {};
  for (const d of data) {
    byStatus[d.status || 'null'] = (byStatus[d.status || 'null'] || 0) + 1;
  }
  console.log('\nBy status:');
  for (const [s, c] of Object.entries(byStatus).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${s}: ${c}`);
  }

  // jet_id coverage
  const withJetId = data.filter(d => d.jet_id);
  const noJetId = data.filter(d => d.jet_id === null || d.jet_id === undefined || d.jet_id === '');
  console.log('\njet_id populated:', withJetId.length);
  console.log('jet_id missing:', noJetId.length);

  // Freigabe status
  console.log('\nFreigabe status (all):');
  console.log('  freigabe_chg=true:', data.filter(d => d.freigabe_chg === true).length);
  console.log('  freigabe_online_rate=true:', data.filter(d => d.freigabe_online_rate === true).length);
  console.log('  freigabe_installation_vorort=true:', data.filter(d => d.freigabe_installation_vorort === true).length);

  // Installiert details
  const installiert = data.filter(d => d.status === 'Installiert');
  console.log('\n--- Installiert ---');
  console.log('Total:', installiert.length);
  console.log('  mit jet_id:', installiert.filter(d => d.jet_id).length);
  console.log('  ohne jet_id:', installiert.filter(d => d.jet_id === null || d.jet_id === undefined || d.jet_id === '').length);
  console.log('  freigabe_chg=true:', installiert.filter(d => d.freigabe_chg === true).length);
  console.log('  freigabe_chg=false/null:', installiert.filter(d => d.freigabe_chg !== true).length);

  // Show ohne jet_id
  const ohneJetId = installiert.filter(d => d.jet_id === null || d.jet_id === undefined || d.jet_id === '');
  if (ohneJetId.length > 0) {
    console.log('\n  Installiert OHNE jet_id:');
    for (const d of ohneJetId) {
      console.log(`    ${d.airtable_id} | ${JSON.stringify(d.location_name)} | akquise=${JSON.stringify(d.akquise_links)}`);
    }
  }

  // Sample installiert with jet_id
  console.log('\n  Sample Installiert mit jet_id:');
  for (const d of installiert.filter(d => d.jet_id).slice(0, 10)) {
    console.log(`    jet_id=${d.jet_id} | ${JSON.stringify(d.location_name)} | chg=${d.freigabe_chg}`);
  }

  // Check for duplicate jet_ids (like Coffee Lories)
  const jetIdCounts = {};
  for (const d of installiert.filter(d => d.jet_id)) {
    jetIdCounts[d.jet_id] = (jetIdCounts[d.jet_id] || 0) + 1;
  }
  const duplicates = Object.entries(jetIdCounts).filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    console.log('\n  Duplicate jet_ids (multiple installations):');
    for (const [jetId, count] of duplicates) {
      const records = installiert.filter(d => d.jet_id === jetId);
      for (const r of records) {
        console.log(`    jet_id=${jetId} | ${r.airtable_id} | ${JSON.stringify(r.location_name)}`);
      }
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
