/**
 * Einmaliger Import: Google Sheets Heartbeat-Daten → Supabase display_heartbeats
 *
 * Füllt die Datenlücke (Nov 2025 – Jan 2026) indem ALLE Rows aus dem Sheet
 * importiert werden. Bereits vorhandene Einträge werden per ON CONFLICT
 * aktualisiert (merge-duplicates).
 *
 * Usage: node scripts/import-sheets-heartbeats.js
 *        (benötigt .env mit SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 */
// Env-Variablen: via `node --env-file=.env.local scripts/import-sheets-heartbeats.js`
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/gviz/tq?tqx=out:csv&gid=0';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen in .env gesetzt sein');
  process.exit(1);
}

// ── Parsing-Utilities (identisch zu trigger-sync-background.js) ──

function parseGermanDateToISO(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  // DD.MM.YYYY HH:MM
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, d, m, y, h, min] = match;
    const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  // DD.MM.YYYY
  const matchDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDate) {
    const [, d, m, y] = matchDate;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  // ISO pass-through
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}T/)) {
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

// ── Main Import ──

async function main() {
  console.log('📡 Lade CSV von Google Sheets...');
  const startTime = Date.now();

  const csvRes = await fetch(SHEET_CSV_URL, {
    headers: { 'User-Agent': 'JET-Dashboard-Import/1.0' },
  });
  if (!csvRes.ok) {
    console.error(`❌ Google Sheets Fehler: HTTP ${csvRes.status}`);
    process.exit(1);
  }

  const csvText = await csvRes.text();
  const lines = csvText.split('\n');
  console.log(`📄 ${lines.length} Zeilen geladen (${(csvText.length / 1024 / 1024).toFixed(1)} MB)`);

  // Parse headers
  const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const colIdx = {};
  csvHeaders.forEach((h, i) => { colIdx[h] = i; });

  const requiredCols = ['Display ID', 'Timestamp'];
  for (const col of requiredCols) {
    if (colIdx[col] === undefined) {
      console.error(`❌ Fehlende Spalte: "${col}". Vorhandene Spalten:`, csvHeaders);
      process.exit(1);
    }
  }
  console.log('📋 Spalten:', csvHeaders.join(', '));

  // Parse all rows
  const heartbeatRows = [];
  let skipped = 0;
  let noTimestamp = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const displayId = cols[colIdx['Display ID']] || '';
    const timestamp = cols[colIdx['Timestamp']] || '';
    if (!displayId || !timestamp) { skipped++; continue; }

    const timestampParsed = parseGermanDateToISO(timestamp);
    if (!timestampParsed) { noTimestamp++; continue; }

    const slashIdx = displayId.indexOf('/');
    const stableId = slashIdx >= 0 ? displayId.substring(0, slashIdx).trim() : displayId.trim();

    heartbeatRows.push({
      timestamp: timestamp || null,
      timestamp_parsed: timestampParsed,
      display_id: stableId,
      raw_display_id: displayId,
      location_name: cols[colIdx['Location Name']] || null,
      serial_number: cols[colIdx['Serial Number']] || null,
      registration_date: cols[colIdx['Date']] || null,
      heartbeat: cols[colIdx['Status']] || null,
      is_alive: cols[colIdx['Is Alive']] || null,
      display_status: cols[colIdx['Display Status']] || null,
      last_online_date: cols[colIdx['Last Online Date']] || null,
      days_offline: cols[colIdx['Days Offline']] ? parseInt(cols[colIdx['Days Offline']]) || null : null,
      source: 'sheets',
    });
  }

  // Stats (kein spread um Stack Overflow bei 155K+ Rows zu vermeiden)
  let earliestMs = Infinity, latestMs = -Infinity;
  for (const r of heartbeatRows) {
    const t = new Date(r.timestamp_parsed).getTime();
    if (!isNaN(t)) {
      if (t < earliestMs) earliestMs = t;
      if (t > latestMs) latestMs = t;
    }
  }
  const earliest = earliestMs < Infinity ? new Date(earliestMs) : null;
  const latest = latestMs > -Infinity ? new Date(latestMs) : null;

  // Count by month
  const byMonth = {};
  heartbeatRows.forEach(r => {
    const d = new Date(r.timestamp_parsed);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] || 0) + 1;
  });

  console.log('\n📊 Zusammenfassung:');
  console.log(`   Geparste Rows: ${heartbeatRows.length}`);
  console.log(`   Übersprungen (leer): ${skipped}`);
  console.log(`   Ungültige Timestamps: ${noTimestamp}`);
  console.log(`   Zeitbereich: ${earliest?.toISOString().split('T')[0]} bis ${latest?.toISOString().split('T')[0]}`);
  console.log(`   Unique Displays: ${new Set(heartbeatRows.map(r => r.display_id)).size}`);
  console.log('\n   Rows pro Monat:');
  Object.entries(byMonth).sort().forEach(([month, count]) => {
    console.log(`     ${month}: ${count}`);
  });

  if (heartbeatRows.length === 0) {
    console.log('\n⚠️  Keine Rows zum Importieren.');
    process.exit(0);
  }

  // ── Batch Insert to Supabase ──
  console.log(`\n🚀 Starte Import: ${heartbeatRows.length} Rows → Supabase (500er Batches, ON CONFLICT merge)...\n`);

  const BATCH_SIZE = 500;
  let inserted = 0;
  let failed = 0;
  let batchNum = 0;
  const totalBatches = Math.ceil(heartbeatRows.length / BATCH_SIZE);

  for (let i = 0; i < heartbeatRows.length; i += BATCH_SIZE) {
    batchNum++;
    const batch = heartbeatRows.slice(i, i + BATCH_SIZE);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/display_heartbeats?on_conflict=display_id,timestamp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });

    if (res.ok) {
      inserted += batch.length;
    } else {
      const errText = await res.text();
      console.error(`   ❌ Batch ${batchNum}/${totalBatches} fehlgeschlagen: ${res.status} — ${errText.substring(0, 200)}`);
      failed += batch.length;
    }

    // Progress every 10 batches
    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      const pct = Math.round((batchNum / totalBatches) * 100);
      console.log(`   📦 ${batchNum}/${totalBatches} Batches (${pct}%) — ${inserted} upserted, ${failed} fehlgeschlagen`);
    }

    // Kurze Pause alle 50 Batches um Supabase nicht zu überlasten
    if (batchNum % 50 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Import abgeschlossen in ${elapsed}s:`);
  console.log(`   Upserted: ${inserted}`);
  console.log(`   Fehlgeschlagen: ${failed}`);
  console.log(`   Zeitbereich: ${earliest?.toISOString().split('T')[0]} bis ${latest?.toISOString().split('T')[0]}`);
}

main().catch(err => {
  console.error('❌ Import-Fehler:', err);
  process.exit(1);
});
