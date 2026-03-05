/**
 * One-time CHG Historical Import — EXECUTE
 *
 * Matches CHG TESMA export to Supabase installationen via:
 *   1. Load installationen (Installiert) with akquise_links
 *   2. Resolve numeric JET IDs via akquise_links → acquisition.jet_id
 *   3. Match CHG Bestellnummer against numeric JET IDs
 *
 * ALL CHG entries are treated as freigegeben (both "In Miete" and
 * "Bestätigung ausstehend"), since CHG has already invoiced them.
 *
 * Handles multiple installations per JET-ID (e.g., Coffee Lories, Pizza Hut).
 *
 * Sets freigabe_chg + freigabe_datum_chg + freigabe_online_rate + freigabe_installation_vorort
 * in both Supabase (cache) and Airtable (source of truth).
 *
 * DRY RUN by default — pass --execute to actually write.
 *
 * Usage:
 *   node scripts/chg-import-execute.js           # Dry run
 *   node scripts/chg-import-execute.js --execute  # Actually write
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import { readFileSync } from 'fs';

// Load env
let env = {};
try {
  const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
} catch { /* no .env.local */ }

const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co';
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2Z2pkb3NkZWpud2t1eWl2bnJxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4NTMzNywiZXhwIjoyMDg2MzYxMzM3fQ.xiCcyalyFh3BDg_dABcpurfw5ygFnmucc17UiYLb8Y4';
const AIRTABLE_TOKEN = env.AIRTABLE_TOKEN || process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE = 'apppFUWK829K6B3R2';
const INSTALLATIONEN_TABLE = 'tblKznpAOAMvEfX8u';

const DRY_RUN = !process.argv.includes('--execute');

function excelToDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') return serial; // Already a date string
  const d = new Date((serial - 25569) * 86400 * 1000);
  return d.toISOString().split('T')[0];
}

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`Supabase GET ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabasePatch(table, airtableId, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?airtable_id=eq.${airtableId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${res.status}: ${await res.text()}`);
  return res.json();
}

async function airtablePatch(recordId, fields) {
  if (!AIRTABLE_TOKEN) throw new Error('AIRTABLE_TOKEN nicht gesetzt');
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${INSTALLATIONEN_TABLE}/${recordId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable PATCH ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log(DRY_RUN ? '\n🔍 DRY RUN — keine Schreiboperationen' : '\n🚀 EXECUTE MODE — Daten werden geschrieben!');
  console.log('═'.repeat(60));

  // 1. Parse XLSX — ALL entries (not just "In Miete")
  const wb = XLSX.readFile('/Users/maximiliansimon/Downloads/20260226_tesma-assets.xlsx');
  const chgData = XLSX.utils.sheet_to_json(wb.Sheets['Sheet']);
  const inMiete = chgData.filter(r => r['Vertragsstatus'] === 'In Miete');
  const ausstehend = chgData.filter(r => r['Vertragsstatus'] === 'Bestätigung ausstehend');
  console.log(`\n📊 CHG Export: ${chgData.length} gesamt`);
  console.log(`  In Miete: ${inMiete.length}`);
  console.log(`  Bestätigung ausstehend: ${ausstehend.length}`);
  console.log(`  → ALLE werden als freigegeben behandelt (CHG hat bereits abgerechnet)`);

  // 2. Load installationen (only "Installiert") — ~437 records, not 10k
  console.log('\n🔍 Lade installationen (Status: Installiert)...');
  const installationen = await supabaseQuery(
    'installationen?select=airtable_id,akquise_links,location_name,status,freigabe_chg,freigabe_datum_chg&status=eq.Installiert&limit=1000'
  );
  console.log(`  Installiert: ${installationen.length}`);

  // 3. Collect all akquise_links → query acquisition for numeric JET IDs
  const allAkquiseIds = [];
  for (const inst of installationen) {
    const links = Array.isArray(inst.akquise_links) ? inst.akquise_links : [];
    for (const l of links) {
      if (l) allAkquiseIds.push(l);
    }
  }
  const uniqueAkquiseIds = [...new Set(allAkquiseIds)];
  console.log(`\n🔍 Lade acquisition fuer ${uniqueAkquiseIds.length} Standorte...`);

  // Query acquisition in batches of 50
  const acquisitions = [];
  for (let i = 0; i < uniqueAkquiseIds.length; i += 50) {
    const batch = uniqueAkquiseIds.slice(i, i + 50);
    const result = await supabaseQuery(
      `acquisition?select=airtable_id,jet_id,location_name&airtable_id=in.(${batch.join(',')})&limit=200`
    );
    acquisitions.push(...result);
  }
  console.log(`  Acquisition Treffer: ${acquisitions.length}`);

  // Build acquisition lookup: airtable_id → { airtable_id, jet_id, location_name }
  const acqById = new Map();
  for (const a of acquisitions) {
    acqById.set(a.airtable_id, a);
  }

  // Build: numeric JET ID → installation(s) (supports multiple per JET ID)
  const instByJetId = new Map(); // jetId → [{ inst, acq }]
  for (const inst of installationen) {
    const links = Array.isArray(inst.akquise_links) ? inst.akquise_links : [];
    for (const link of links) {
      const acq = acqById.get(link);
      if (acq && acq.jet_id) {
        const jetId = String(acq.jet_id).trim();
        if (!instByJetId.has(jetId)) instByJetId.set(jetId, []);
        instByJetId.get(jetId).push({ inst, acq });
      }
    }
  }
  console.log(`  Installationen mit JET-ID: ${instByJetId.size} unique JET-IDs → ${[...instByJetId.values()].flat().length} Installationen`);

  // Show duplicates
  const dupes = [...instByJetId.entries()].filter(([, v]) => v.length > 1);
  if (dupes.length > 0) {
    console.log(`\n  📌 Mehrfach-Installationen (${dupes.length} JET-IDs):`);
    for (const [jetId, entries] of dupes) {
      console.log(`    JET-ID ${jetId}: ${entries.map(e => e.inst.location_name).join(', ')} (${entries.length}x)`);
    }
  }

  // 4. Match ALL CHG entries → installationen
  console.log('\n📋 Matching: CHG Bestellnummer → JET-ID → Installation(en)');
  const updates = new Map(); // installation.airtable_id → { datum, location, jetId, ... }
  const unmatched = [];

  for (const row of chgData) {
    const jetId = String(row['Bestellnummer'] || '').trim();
    const location = row['Installationsort'] || '';
    const datum = excelToDate(row['Bestätigungsdatum']);
    const vertragsstatus = row['Vertragsstatus'] || '';

    if (!jetId) {
      unmatched.push({ jetId: '(leer)', location, vertragsstatus, reason: 'Keine Bestellnummer' });
      continue;
    }

    const entries = instByJetId.get(jetId);
    if (!entries || entries.length === 0) {
      unmatched.push({ jetId, location, vertragsstatus, reason: 'Keine Installation mit JET-ID ' + jetId });
      continue;
    }

    // Match ALL installations for this JET ID (e.g., Coffee Lories has 2)
    // For "Bestätigung ausstehend" entries without a date, use today
    const effectiveDatum = datum || new Date().toISOString().split('T')[0];
    for (const { inst, acq } of entries) {
      updates.set(inst.airtable_id, {
        datum: effectiveDatum,
        location,
        jetId,
        vertragsstatus,
        locationName: inst.location_name,
        acqAirtableId: acq.airtable_id,
        assetId: row['Asset ID'],
        sn: String(row['Seriennummer'] || ''),
      });
    }
  }

  console.log(`\n  ✅ Matched: ${updates.size} Installationen (aus ${chgData.length} CHG-Eintraegen)`);
  console.log(`  ❌ Nicht matched: ${unmatched.length} CHG-Eintraege`);

  if (unmatched.length > 0) {
    console.log('\n  Nicht gematchte CHG-Eintraege:');
    for (const u of unmatched) {
      console.log(`    JET-ID ${u.jetId} → ${u.location} | ${u.vertragsstatus} | ${u.reason}`);
    }
  }

  // 5. Execute updates
  console.log('\n' + '─'.repeat(60));
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const [airtableId, info] of updates) {
    const existing = installationen.find(i => i.airtable_id === airtableId);

    // Skip if already set
    if (existing?.freigabe_chg === true) {
      skippedCount++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${airtableId} | JET-${info.jetId} | ${info.locationName || info.location} | ${info.vertragsstatus} | CHG-Datum: ${info.datum}`);
      successCount++;
    } else {
      try {
        // Update Supabase (cache)
        await supabasePatch('installationen', airtableId, {
          freigabe_chg: true,
          freigabe_datum_chg: info.datum,
          freigabe_online_rate: true,
          freigabe_installation_vorort: true,
        });

        // Update Airtable (Source of Truth)
        await airtablePatch(airtableId, {
          'Freigabe CHG?': true,
          'Freigabe-Datum CHG': info.datum,
          'Freigabe Installation (Online Rate)': true,
          'Freigabe Installation (Installation Vorort)': true,
        });

        console.log(`  ✅ ${airtableId} | JET-${info.jetId} | ${info.locationName || info.location} | ${info.datum}`);
        successCount++;

        // Rate limit: max 5 req/s for Airtable
        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        console.error(`  ❌ ${airtableId} | ${info.locationName || info.location}: ${e.message}`);
        errorCount++;
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('ERGEBNIS');
  console.log('═'.repeat(60));
  console.log(`CHG-Eintraege:     ${chgData.length} (${inMiete.length} In Miete + ${ausstehend.length} Bestätigung ausstehend)`);
  console.log(`Installationen:    ${installationen.length} (Status: Installiert)`);
  console.log(`Aktualisiert:      ${successCount}`);
  console.log(`Uebersprungen:     ${skippedCount} (bereits freigegeben)`);
  console.log(`Fehler:            ${errorCount}`);
  console.log(`Nicht matched:     ${unmatched.length}`);

  if (DRY_RUN) {
    console.log('\n⚠️  Das war ein DRY RUN. Zum Ausfuehren: node scripts/chg-import-execute.js --execute');
  }
}

main().catch(e => {
  console.error('Fehler:', e.message);
  process.exit(1);
});
