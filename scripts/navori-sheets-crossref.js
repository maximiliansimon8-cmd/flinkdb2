/**
 * Cross-Reference Script: Navori API vs Sheets Heartbeats
 *
 * Compares the latest heartbeat from each source for each display
 * and reports discrepancies in status, days_offline, is_alive.
 *
 * Usage: node scripts/navori-sheets-crossref.js
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env or .env.local
 */

import { readFileSync } from 'fs';

// Load .env.local manually (no dotenv dependency)
try {
  const envContent = readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function main() {
  console.log('=== Navori vs Sheets Heartbeat Cross-Reference ===\n');

  // 1. Get count overview
  const [navoriCount, sheetsCount] = await Promise.all([
    supabaseQuery('display_heartbeats?source=eq.navori_api&select=display_id&limit=1&order=timestamp_parsed.desc'),
    supabaseQuery('display_heartbeats?source=eq.sheets&select=display_id&limit=1&order=timestamp_parsed.desc'),
  ]);

  // 2. Get latest navori heartbeats (distinct per display)
  const navoriLatest = await supabaseQuery(
    'rpc/get_latest_heartbeats_by_source'
    + '?source_filter=navori_api'
  ).catch(async () => {
    // Fallback: manual query if RPC doesn't exist
    console.log('(RPC not available, using manual query)');
    const all = await supabaseQuery(
      'display_heartbeats?source=eq.navori_api&order=timestamp_parsed.desc&limit=1000'
      + '&select=display_id,heartbeat,is_alive,days_offline,timestamp_parsed,location_name'
    );
    // Deduplicate by display_id (first = latest)
    const seen = new Set();
    return all.filter(r => {
      if (seen.has(r.display_id)) return false;
      seen.add(r.display_id);
      return true;
    });
  });

  // 3. Get latest sheets heartbeats (distinct per display)
  const sheetsLatest = await supabaseQuery(
    'display_heartbeats?source=eq.sheets&order=timestamp_parsed.desc&limit=5000'
    + '&select=display_id,heartbeat,is_alive,days_offline,timestamp_parsed,location_name'
  ).then(all => {
    const seen = new Set();
    return all.filter(r => {
      if (seen.has(r.display_id)) return false;
      seen.add(r.display_id);
      return true;
    });
  });

  console.log(`Navori: ${navoriLatest.length} unique displays`);
  console.log(`Sheets: ${sheetsLatest.length} unique displays\n`);

  // 4. Build maps
  const navoriMap = new Map();
  for (const r of navoriLatest) navoriMap.set(r.display_id, r);

  const sheetsMap = new Map();
  for (const r of sheetsLatest) sheetsMap.set(r.display_id, r);

  // 5. Find displays only in one source
  const onlyNavori = [];
  const onlySheets = [];
  const inBoth = [];

  for (const [id] of navoriMap) {
    if (sheetsMap.has(id)) inBoth.push(id);
    else onlyNavori.push(id);
  }
  for (const [id] of sheetsMap) {
    if (!navoriMap.has(id)) onlySheets.push(id);
  }

  console.log(`In both sources: ${inBoth.length}`);
  console.log(`Only in Navori:  ${onlyNavori.length}`);
  console.log(`Only in Sheets:  ${onlySheets.length}\n`);

  // 6. Show displays only in Navori (new displays?)
  if (onlyNavori.length > 0) {
    console.log('--- Displays ONLY in Navori (neue Displays?) ---');
    for (const id of onlyNavori.slice(0, 20)) {
      const n = navoriMap.get(id);
      console.log(`  ${id} | ${n.location_name || '–'} | ${n.heartbeat} | days_offline=${n.days_offline}`);
    }
    if (onlyNavori.length > 20) console.log(`  ... und ${onlyNavori.length - 20} weitere`);
    console.log();
  }

  // 7. Show displays only in Sheets (deinstalliert / nicht in Navori?)
  if (onlySheets.length > 0) {
    console.log('--- Displays ONLY in Sheets (deinstalliert oder nicht in Navori?) ---');
    for (const id of onlySheets.slice(0, 20)) {
      const s = sheetsMap.get(id);
      console.log(`  ${id} | ${s.location_name || '–'} | ${s.heartbeat} | days_offline=${s.days_offline}`);
    }
    if (onlySheets.length > 20) console.log(`  ... und ${onlySheets.length - 20} weitere`);
    console.log();
  }

  // 8. Compare status for displays in BOTH sources
  const statusMismatches = [];
  const daysOfflineMismatches = [];

  for (const id of inBoth) {
    const n = navoriMap.get(id);
    const s = sheetsMap.get(id);

    // Classify status: <2d = live, 2-7d = zu beobachten, >7d = offline
    const classify = (days) => {
      const d = parseInt(days) || 0;
      if (d < 2) return 'live';
      if (d <= 7) return 'zu beobachten';
      return 'offline';
    };

    const nStatus = classify(n.days_offline);
    const sStatus = classify(s.days_offline);

    if (nStatus !== sStatus) {
      statusMismatches.push({ id, navori: n, sheets: s, nStatus, sStatus });
    }

    const nDays = parseInt(n.days_offline) || 0;
    const sDays = parseInt(s.days_offline) || 0;
    const diff = Math.abs(nDays - sDays);
    if (diff > 1) {
      daysOfflineMismatches.push({ id, nDays, sDays, diff, navori: n, sheets: s });
    }
  }

  console.log(`=== STATUS MISMATCHES (${statusMismatches.length}) ===`);
  if (statusMismatches.length === 0) {
    console.log('  Keine Abweichungen!\n');
  } else {
    for (const m of statusMismatches.slice(0, 30)) {
      console.log(`  ${m.id}`);
      console.log(`    Navori: ${m.nStatus} (days_offline=${m.navori.days_offline}, heartbeat=${m.navori.heartbeat})`);
      console.log(`    Sheets: ${m.sStatus} (days_offline=${m.sheets.days_offline}, heartbeat=${m.sheets.heartbeat})`);
    }
    if (statusMismatches.length > 30) console.log(`  ... und ${statusMismatches.length - 30} weitere`);
    console.log();
  }

  console.log(`=== DAYS_OFFLINE ABWEICHUNG > 1 Tag (${daysOfflineMismatches.length}) ===`);
  if (daysOfflineMismatches.length === 0) {
    console.log('  Keine signifikanten Abweichungen!\n');
  } else {
    daysOfflineMismatches.sort((a, b) => b.diff - a.diff);
    for (const m of daysOfflineMismatches.slice(0, 30)) {
      console.log(`  ${m.id} | Navori: ${m.nDays}d | Sheets: ${m.sDays}d | Diff: ${m.diff}d`);
    }
    if (daysOfflineMismatches.length > 30) console.log(`  ... und ${daysOfflineMismatches.length - 30} weitere`);
    console.log();
  }

  // 9. KPI comparison: calculate health rate from each source
  const calcHealthRate = (rows) => {
    let online = 0, total = rows.length;
    for (const r of rows) {
      const days = parseInt(r.days_offline) || 0;
      if (days < 1) online++;
    }
    return { online, total, rate: total > 0 ? Math.round((online / total) * 1000) / 10 : 0 };
  };

  const navoriHealth = calcHealthRate(navoriLatest);
  const sheetsHealth = calcHealthRate(sheetsLatest);

  console.log('=== HEALTH RATE VERGLEICH ===');
  console.log(`  Navori: ${navoriHealth.online}/${navoriHealth.total} online = ${navoriHealth.rate}%`);
  console.log(`  Sheets: ${sheetsHealth.online}/${sheetsHealth.total} online = ${sheetsHealth.rate}%`);
  console.log(`  Differenz: ${Math.abs(navoriHealth.rate - sheetsHealth.rate).toFixed(1)} Prozentpunkte\n`);

  // 10. Category breakdown
  const breakdown = (rows, label) => {
    let online = 0, warning = 0, critical = 0, permanent = 0;
    for (const r of rows) {
      const d = parseInt(r.days_offline) || 0;
      if (d < 1) online++;
      else if (d < 3) warning++;
      else if (d < 7) critical++;
      else permanent++;
    }
    console.log(`  ${label}: Online=${online} | Warnung=${warning} | Kritisch=${critical} | Dauerhaft Offline=${permanent}`);
  };

  console.log('=== KPI KATEGORIEN ===');
  breakdown(navoriLatest, 'Navori');
  breakdown(sheetsLatest, 'Sheets');
  console.log();

  // 11. Timestamp freshness
  const latestNavoriTs = navoriLatest.reduce((max, r) => r.timestamp_parsed > max ? r.timestamp_parsed : max, '');
  const latestSheetsTs = sheetsLatest.reduce((max, r) => r.timestamp_parsed > max ? r.timestamp_parsed : max, '');
  console.log('=== DATEN-AKTUALITÄT ===');
  console.log(`  Navori neuester Datenpunkt: ${latestNavoriTs}`);
  console.log(`  Sheets neuester Datenpunkt: ${latestSheetsTs}`);
  console.log();

  console.log('=== FAZIT ===');
  if (statusMismatches.length === 0 && onlyNavori.length === 0 && onlySheets.length === 0) {
    console.log('  Beide Quellen sind identisch — Sheets-Sync kann sicher abgelöst werden.');
  } else if (statusMismatches.length <= 5 && Math.abs(navoriHealth.rate - sheetsHealth.rate) < 5) {
    console.log('  Minimale Abweichungen — Sheets-Sync kann nach Prüfung abgelöst werden.');
    if (onlyNavori.length > 0) console.log(`  ${onlyNavori.length} neue Displays nur in Navori (prüfen!)`);
    if (onlySheets.length > 0) console.log(`  ${onlySheets.length} Displays nur in Sheets (evtl. deinstalliert)`);
  } else {
    console.log('  Signifikante Abweichungen — Parallelbetrieb beibehalten und Details prüfen!');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
