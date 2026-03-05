/**
 * Check how installationen.jet_id vs acquisition.jet_id work
 * and verify matching for CHG import
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
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

async function sq(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

function excelToDate(serial) {
  if (!serial) return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

async function main() {
  // 1. Check what installationen.jet_id looks like
  console.log('=== 1. installationen.jet_id Format ===');
  const sample = await sq('installationen?select=airtable_id,jet_id,akquise_links,location_name&status=eq.Installiert&limit=5');
  for (const s of sample) {
    console.log(`  inst=${s.airtable_id} | jet_id=${s.jet_id} | akquise=${JSON.stringify(s.akquise_links)} | loc=${s.location_name}`);
  }

  // 2. Check acquisition.jet_id format for those
  if (sample.length > 0) {
    const akqIds = sample.map(s => (s.akquise_links || [])[0]).filter(Boolean);
    if (akqIds.length > 0) {
      console.log('\n=== 2. Corresponding acquisition records ===');
      const acqs = await sq(`acquisition?select=airtable_id,jet_id,location_name&airtable_id=in.(${akqIds.join(',')})`);
      for (const a of acqs) {
        console.log(`  acq=${a.airtable_id} | jet_id=${a.jet_id} | loc=${a.location_name}`);
      }
    }
  }

  // 3. Parse CHG file - ALL entries, not just "In Miete"
  console.log('\n=== 3. CHG XLSX — ALL entries ===');
  const wb = XLSX.readFile('/Users/maximiliansimon/Downloads/20260226_tesma-assets.xlsx');
  const data = XLSX.utils.sheet_to_json(wb.Sheets['Sheet']);
  console.log(`Total: ${data.length}`);

  const byStatus = {};
  for (const r of data) {
    const s = r['Vertragsstatus'] || 'unknown';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  for (const [s, c] of Object.entries(byStatus)) {
    console.log(`  ${s}: ${c}`);
  }

  // 4. Get ALL unique Bestellnummern (JET IDs)
  const allJetIds = [...new Set(data.map(r => String(r['Bestellnummer'] || '').trim()).filter(Boolean))];
  console.log(`\nUnique Bestellnummern: ${allJetIds.length}`);

  // 5. Load ALL installationen (Installiert)
  console.log('\n=== 4. Loading installationen (Installiert) ===');
  const installationen = await sq('installationen?select=airtable_id,jet_id,akquise_links,location_name,status,freigabe_chg&status=eq.Installiert&limit=500');
  console.log(`Installiert: ${installationen.length}`);

  // 6. Get akquise_links from all installationen → look up acquisition for numeric jet_id
  const allAkquiseIds = [];
  for (const inst of installationen) {
    const links = Array.isArray(inst.akquise_links) ? inst.akquise_links : [];
    for (const l of links) {
      if (l) allAkquiseIds.push(l);
    }
  }
  const uniqueAkquiseIds = [...new Set(allAkquiseIds)];
  console.log(`Unique akquise_links: ${uniqueAkquiseIds.length}`);

  // Query acquisition in batches
  const acquisitions = [];
  for (let i = 0; i < uniqueAkquiseIds.length; i += 50) {
    const batch = uniqueAkquiseIds.slice(i, i + 50);
    const result = await sq(`acquisition?select=airtable_id,jet_id,location_name&airtable_id=in.(${batch.join(',')})&limit=200`);
    acquisitions.push(...result);
  }
  console.log(`Acquisition records found: ${acquisitions.length}`);

  // Build maps
  const acqByAirtableId = new Map();
  for (const a of acquisitions) {
    acqByAirtableId.set(a.airtable_id, a);
  }

  // Build: numeric jet_id → installation(s)
  const instByNumericJetId = new Map();
  for (const inst of installationen) {
    const links = Array.isArray(inst.akquise_links) ? inst.akquise_links : [];
    for (const link of links) {
      const acq = acqByAirtableId.get(link);
      if (acq && acq.jet_id) {
        const numericId = String(acq.jet_id).trim();
        if (!instByNumericJetId.has(numericId)) {
          instByNumericJetId.set(numericId, []);
        }
        instByNumericJetId.get(numericId).push({
          ...inst,
          numericJetId: numericId,
          acqAirtableId: acq.airtable_id,
        });
      }
    }
  }

  console.log(`Installiert with numeric JET ID: ${instByNumericJetId.size} unique JET IDs → ${[...instByNumericJetId.values()].flat().length} installations`);

  // 7. Match ALL CHG entries against installationen
  console.log('\n=== 5. Matching ALL CHG entries ===');
  const matched = [];
  const unmatched = [];

  for (const row of data) {
    const jetId = String(row['Bestellnummer'] || '').trim();
    const location = row['Installationsort'] || '';
    const datum = excelToDate(row['Bestätigungsdatum']);
    const vertragsstatus = row['Vertragsstatus'] || '';

    if (!jetId) {
      unmatched.push({ jetId: '(leer)', location, reason: 'Keine Bestellnummer' });
      continue;
    }

    const insts = instByNumericJetId.get(jetId);
    if (!insts || insts.length === 0) {
      unmatched.push({ jetId, location, vertragsstatus, reason: 'Keine Installation mit jet_id=' + jetId });
      continue;
    }

    // Match ALL installations for this JET ID (e.g., Coffee Lories has 2)
    for (const inst of insts) {
      matched.push({
        jetId,
        location,
        datum,
        vertragsstatus,
        installationAirtableId: inst.airtable_id,
        locationName: inst.location_name,
        acqAirtableId: inst.acqAirtableId,
      });
    }
  }

  console.log(`Matched: ${matched.length} (installations to update)`);
  console.log(`Unmatched CHG entries: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched:');
    for (const u of unmatched) {
      console.log(`  JET-ID ${u.jetId} | ${u.location} | ${u.vertragsstatus} | ${u.reason}`);
    }
  }

  // 8. Check: How many Installiert are NOT in CHG file?
  const matchedInstIds = new Set(matched.map(m => m.installationAirtableId));
  const notInChg = installationen.filter(i => !matchedInstIds.has(i.airtable_id));
  console.log(`\n=== 6. Installiert NOT in CHG file ===`);
  console.log(`In CHG file: ${matchedInstIds.size} installations`);
  console.log(`NOT in CHG file: ${notInChg.length} installations`);

  // Show some of the NOT in CHG
  if (notInChg.length > 0) {
    console.log('\nFirst 20 not in CHG:');
    for (const n of notInChg.slice(0, 20)) {
      const acq = n.akquise_links ? acqByAirtableId.get(n.akquise_links[0]) : null;
      console.log(`  ${n.airtable_id} | jet_id=${acq?.jet_id || 'N/A'} | ${n.location_name}`);
    }
  }

  // Duplicates detail
  const dupeJetIds = [...instByNumericJetId.entries()].filter(([, v]) => v.length > 1);
  if (dupeJetIds.length > 0) {
    console.log('\n=== 7. Duplicate JET IDs (multiple installations) ===');
    for (const [jetId, insts] of dupeJetIds) {
      console.log(`  JET-ID ${jetId}:`);
      for (const inst of insts) {
        console.log(`    ${inst.airtable_id} | ${inst.location_name}`);
      }
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
