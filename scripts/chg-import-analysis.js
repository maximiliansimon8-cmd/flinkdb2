/**
 * One-time CHG Historical Import Analysis
 * Analyzes the TESMA export and matches against Supabase data.
 *
 * Usage: node scripts/chg-import-analysis.js
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// Load env from .env.local
import { readFileSync } from 'fs';
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen in .env.local gesetzt sein'); process.exit(1); }

function excelToDate(serial) {
  if (!serial) return null;
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // 1. Parse XLSX
  const wb = XLSX.readFile('/Users/maximiliansimon/Downloads/20260226_tesma-assets.xlsx');
  const data = XLSX.utils.sheet_to_json(wb.Sheets['Sheet']);
  console.log(`\n📊 CHG Export: ${data.length} Einträge`);

  const inMiete = data.filter(r => r['Vertragsstatus'] === 'In Miete');
  const ausstehend = data.filter(r => r['Vertragsstatus'] === 'Bestätigung ausstehend');
  console.log(`  ✅ In Miete (freigegeben): ${inMiete.length}`);
  console.log(`  ⏳ Bestätigung ausstehend: ${ausstehend.length}`);

  // 2. Get all serial numbers from export
  const allSerials = data.map(r => String(r['Seriennummer'] || '').trim()).filter(Boolean);
  console.log(`\n🔑 Seriennummern: ${allSerials.length}`);

  // 3. Query chg_approvals by display_sn
  console.log('\n🔍 Matching gegen chg_approvals.display_sn...');
  const chgApprovals = await supabaseQuery('chg_approvals?select=id,display_sn,asset_id,installation_id,location_name,status&limit=500');
  console.log(`  chg_approvals Einträge: ${chgApprovals.length}`);

  const chgBySn = new Map();
  for (const c of chgApprovals) {
    if (c.display_sn) chgBySn.set(c.display_sn.trim(), c);
  }

  let chgMatched = 0;
  let chgUnmatched = 0;
  const unmatchedSerials = [];
  const matchedInstallationIds = new Map(); // installation_id → { bestaetigungsdatum, ... }

  for (const row of inMiete) {
    const sn = String(row['Seriennummer'] || '').trim();
    const chg = chgBySn.get(sn);
    if (chg && chg.installation_id) {
      chgMatched++;
      const datum = excelToDate(row['Bestätigungsdatum']);
      matchedInstallationIds.set(chg.installation_id, {
        sn,
        datum,
        assetId: row['Asset ID'],
        location: row['Installationsort'],
        chgApprovalId: chg.id,
      });
    } else {
      chgUnmatched++;
      unmatchedSerials.push({ sn, location: row['Installationsort'], hasChg: !!chg, hasInstLink: chg?.installation_id });
    }
  }

  console.log(`\n📋 Matching-Ergebnis (nur "In Miete"):`);
  console.log(`  ✅ Matched (SN → CHG → Installation): ${chgMatched}`);
  console.log(`  ❌ Nicht gematched: ${chgUnmatched}`);

  if (unmatchedSerials.length > 0) {
    console.log(`\n  Nicht gematchte Seriennummern:`);
    for (const u of unmatchedSerials) {
      console.log(`    ${u.sn} → ${u.location} (CHG: ${u.hasChg ? 'ja' : 'nein'}, Install-Link: ${u.hasInstLink || 'fehlt'})`);
    }
  }

  // 4. Try alternative matching via location name for unmatched
  if (unmatchedSerials.length > 0) {
    console.log('\n🔍 Alternative: Matching über Installationsort...');
    const installationen = await supabaseQuery('installationen?select=airtable_id,location_name,display_ids,status&limit=500');
    console.log(`  installationen Einträge: ${installationen.length}`);

    const instByName = new Map();
    for (const inst of installationen) {
      const names = Array.isArray(inst.location_name) ? inst.location_name : [inst.location_name];
      for (const n of names) {
        if (n) instByName.set(n.toLowerCase().trim(), inst);
      }
    }

    let altMatched = 0;
    for (const u of unmatchedSerials) {
      const loc = (u.location || '').toLowerCase().trim();
      const inst = instByName.get(loc);
      if (inst) {
        altMatched++;
        matchedInstallationIds.set(inst.airtable_id, {
          sn: u.sn,
          datum: excelToDate(data.find(r => String(r['Seriennummer']).trim() === u.sn)?.['Bestätigungsdatum']),
          location: u.location,
          matchMethod: 'location_name',
        });
      }
    }
    console.log(`  Zusätzlich per Location Name gematched: ${altMatched}`);
  }

  // 5. Check current freigabe status
  const installationIds = [...matchedInstallationIds.keys()];
  console.log(`\n📊 Gesamt zu aktualisieren: ${installationIds.length} Installationen`);

  if (installationIds.length > 0) {
    // Check how many already have freigabe_chg
    const sample = installationIds.slice(0, 5);
    const existing = await supabaseQuery(`installationen?airtable_id=in.(${sample.join(',')})&select=airtable_id,freigabe_chg,freigabe_datum_chg,location_name`);
    console.log('\n  Stichprobe aktueller Status:');
    for (const e of existing) {
      const match = matchedInstallationIds.get(e.airtable_id);
      console.log(`    ${e.airtable_id}: freigabe_chg=${e.freigabe_chg}, datum=${e.freigabe_datum_chg}, location=${JSON.stringify(e.location_name)}, CHG-Datum=${match?.datum}`);
    }
  }

  // 6. Summary
  console.log('\n════════════════════════════════════');
  console.log('ZUSAMMENFASSUNG');
  console.log('════════════════════════════════════');
  console.log(`CHG Export Einträge:        ${data.length}`);
  console.log(`Davon "In Miete":           ${inMiete.length}`);
  console.log(`Matched → Installation:     ${matchedInstallationIds.size}`);
  console.log(`Nicht matched:              ${inMiete.length - matchedInstallationIds.size}`);
  console.log(`\nBereit für Import: ${matchedInstallationIds.size} Installationen mit freigabe_chg=true setzen`);
}

main().catch(e => {
  console.error('Fehler:', e.message);
  process.exit(1);
});
