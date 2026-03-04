/**
 * Netlify Background Function: Install Verification
 *
 * Automatische Online-Rate-Prüfung nach Installation:
 *   - 3-Tage-Check: informational, Task bei < 80%
 *   - 10-Tage-Check: definitiv, setzt "Freigabe Installation (Online Rate)" bei >= 80%
 *   - Auto-setzt "Freigabe CHG?" wenn beide Freigabe-Checkboxen true
 *
 * Auth: Origin check (called by scheduled trigger)
 *
 * Data flow:
 *   installationen (Supabase) → display_ids[0] (Display Table ID)
 *     → JOIN airtable_displays ON display_table_id
 *     → display_id (e.g., "DO-GER-BER-WD-55-001-25")
 *     → JOIN display_heartbeats ON display_id
 *     → Filter to 6:00-23:59 CET → Calculate online_rate
 */
import {
  getAllowedOrigin, corsHeaders, handlePreflight, forbiddenResponse,
} from './shared/security.js';
import { logApiCall } from './shared/apiLogger.js';
import { AIRTABLE_BASE, TABLES, INSTALLATION_FIELDS as IF_ } from './shared/airtableFields.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const ONLINE_RATE_THRESHOLD = 80; // percent
const MAX_INSTALLATIONS_PER_RUN = 50;
const OPERATING_HOUR_START = 6;   // 06:00 CET
const OPERATING_HOUR_END = 24;    // 23:59 CET (inclusive)

/* ─── Helpers ─── */

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

function getLocalDateString(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

/**
 * Returns the hour (0-23) in Europe/Berlin timezone for a given ISO timestamp.
 */
function getBerlinHour(timestampISO) {
  const d = new Date(timestampISO);
  return parseInt(
    d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Berlin' }),
    10
  );
}

/**
 * Check if a heartbeat timestamp falls within operating hours (6:00-23:59 CET).
 */
function isOperatingHour(timestampISO) {
  const hour = getBerlinHour(timestampISO);
  return hour >= OPERATING_HOUR_START && hour < OPERATING_HOUR_END;
}

/**
 * Calculate online rate from heartbeat data for a specific display and period.
 */
async function calculateOnlineRate(displayId, periodStart, periodEnd) {
  const startISO = periodStart.toISOString();
  const endISO = periodEnd.toISOString();

  const result = await supabaseRequest(
    `display_heartbeats?display_id=eq.${encodeURIComponent(displayId)}` +
    `&timestamp_parsed=gte.${encodeURIComponent(startISO)}` +
    `&timestamp_parsed=lte.${encodeURIComponent(endISO)}` +
    `&select=timestamp_parsed,is_alive` +
    `&limit=5000`
  );

  if (!result.ok || !result.data?.length) {
    return { total: 0, alive: 0, rate: null, error: 'no_heartbeats' };
  }

  // Filter to operating hours only (6:00-23:59 CET)
  const opHours = result.data.filter(hb => hb.timestamp_parsed && isOperatingHour(hb.timestamp_parsed));

  if (opHours.length === 0) {
    return { total: 0, alive: 0, rate: null, error: 'no_operating_hours_heartbeats' };
  }

  // Count alive heartbeats — handle various string formats from CSV
  const aliveCount = opHours.filter(hb => {
    const v = hb.is_alive;
    if (v === true || v === 'true' || v === 'True') return true;
    if (typeof v === 'string') {
      const lower = v.toLowerCase().trim();
      return lower === 'yes' || lower === 'ja' || lower === '1' || lower === 'alive' || lower === 'online';
    }
    return false;
  }).length;

  const rate = Math.round((aliveCount / opHours.length) * 10000) / 100; // 2 decimal places

  return { total: opHours.length, alive: aliveCount, rate, error: null };
}

/**
 * Create an Airtable Task for failed online rate check.
 */
async function createVerificationTask(installation, checkType, onlineRate, displayId) {
  const locationName = installation.location_name || installation.city || 'Unbekannt';
  const rateStr = onlineRate != null ? `${Math.round(onlineRate)}%` : 'N/A';

  const taskTitle = checkType === '3_day'
    ? `3-Tage Online-Check: ${locationName} — ${rateStr}`
    : `10-Tage Online-Check FAILED: ${locationName} — ${rateStr}`;

  const taskDescription = [
    `Die automatische Online-Rate-Prüfung (${checkType === '3_day' ? '3 Tage' : '10 Tage'}) hat ergeben:`,
    '',
    `Display-ID: ${displayId || '—'}`,
    `JET-ID: ${installation.jet_id || '—'}`,
    `Standort: ${locationName}, ${installation.city || '—'}`,
    `Online-Rate: ${rateStr} (Schwellenwert: ${ONLINE_RATE_THRESHOLD}%)`,
    `Installationsdatum: ${installation.install_date || '—'}`,
    `Prüfzeitraum: ${checkType === '3_day' ? '3' : '10'} Tage, Betriebszeiten 6:00-23:59 Uhr`,
    '',
    `Bitte Display in Navori CMS prüfen und ggf. Techniker beauftragen.`,
  ].join('\n');

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (checkType === '3_day' ? 7 : 3));

  const taskFields = {
    'Task Title': taskTitle,
    'Description': taskDescription,
    'Status': 'New',
    'Priority': checkType === '10_day' ? 'High' : 'Medium',
    'Due Date': getLocalDateString(dueDate),
  };

  // Link to Akquise/Location if available
  if (installation.akquise_links?.[0]) {
    taskFields['Locations'] = [installation.akquise_links[0]];
  }

  const apiStart = Date.now();
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.TASKS}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ fields: taskFields }] }),
  });
  logApiCall('airtable', `POST Tasks (verification task)`, res.status, Date.now() - apiStart);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[install-verification] Task creation failed: ${res.status} ${errText.substring(0, 200)}`);
    return null;
  }

  const data = await res.json();
  return data.records?.[0]?.id || null;
}

/**
 * Set Freigabe Installation (Online Rate) in Airtable.
 */
async function setFreigabeOnlineRate(installationAirtableId) {
  const apiStart = Date.now();
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.INSTALLATIONEN}/${installationAirtableId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: { [IF_.FREIGABE_ONLINE_RATE]: true },
      }),
    }
  );
  logApiCall('airtable', `PATCH Installation Freigabe Online Rate`, res.status, Date.now() - apiStart);
  return res.ok;
}

/**
 * Set Freigabe CHG in Airtable (when both checks are passed).
 */
async function setFreigabeCHG(installationAirtableId) {
  const today = getLocalDateString();
  const apiStart = Date.now();
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TABLES.INSTALLATIONEN}/${installationAirtableId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          [IF_.FREIGABE_CHG]: true,
          [IF_.FREIGABE_DATUM_CHG]: today,
        },
      }),
    }
  );
  logApiCall('airtable', `PATCH Installation Freigabe CHG`, res.status, Date.now() - apiStart);
  return res.ok;
}

/**
 * Log a verification check result to install_verification_log (upsert).
 */
async function logVerificationCheck(entry) {
  return supabaseRequest('install_verification_log', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(entry),
  });
}

/* ─── Main Handler ─── */

export default async (request) => {
  if (request.method === 'OPTIONS') return handlePreflight(request);

  const origin = getAllowedOrigin(request);
  if (!origin) return forbiddenResponse();

  const cors = corsHeaders(origin);
  const startTime = Date.now();

  try {
    // ── 1. Feature flag check ──
    const flagResult = await supabaseRequest(
      'feature_flags?key=eq.install_verification_enabled&select=enabled&limit=1'
    );
    if (!flagResult.data?.[0]?.enabled) {
      console.log('[install-verification] SKIPPED — feature flag disabled');
      return new Response(JSON.stringify({ skipped: true, reason: 'feature_flag_disabled' }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Get candidate installations ──
    // Installiert or Nacharbeit notwendig, freigabe_online_rate not yet set, has install_date
    const installResult = await supabaseRequest(
      `installationen?status=in.(Installiert,Installiert - Nacharbeit notwendig)` +
      `&freigabe_online_rate=is.false` +
      `&install_date=not.is.null` +
      `&select=id,airtable_id,display_ids,install_date,status,location_name,city,jet_id,akquise_links,freigabe_installation_vorort,freigabe_chg` +
      `&order=install_date.asc` +
      `&limit=${MAX_INSTALLATIONS_PER_RUN}`
    );

    if (!installResult.ok || !installResult.data?.length) {
      console.log('[install-verification] No pending installations found');
      return new Response(JSON.stringify({ processed: 0, message: 'Keine offenen Installationen' }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const installations = installResult.data;
    const now = new Date();
    const todayStr = getLocalDateString(now);

    // ── 3. Separate into 3-day and 10-day candidates ──
    const candidates3Day = [];
    const candidates10Day = [];

    for (const inst of installations) {
      const installDate = new Date(inst.install_date);
      const daysSinceInstall = Math.floor((now - installDate) / (86400000));

      if (daysSinceInstall >= 10) {
        candidates10Day.push({ ...inst, daysSinceInstall });
      } else if (daysSinceInstall >= 3) {
        candidates3Day.push({ ...inst, daysSinceInstall });
      }
      // < 3 days: skip, too early
    }

    console.log(`[install-verification] Candidates: ${candidates3Day.length} (3-day), ${candidates10Day.length} (10-day)`);

    if (candidates3Day.length === 0 && candidates10Day.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'Alle Installationen zu frisch (< 3 Tage)' }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Filter out already-checked installations ──
    const allIds = [...candidates3Day, ...candidates10Day].map(i => i.airtable_id || i.id);
    const logResult = await supabaseRequest(
      `install_verification_log?installation_airtable_id=in.(${allIds.join(',')})` +
      `&select=installation_airtable_id,check_type`
    );
    const alreadyChecked = new Set();
    if (logResult.ok && logResult.data) {
      for (const entry of logResult.data) {
        alreadyChecked.add(`${entry.installation_airtable_id}_${entry.check_type}`);
      }
    }

    const pending3Day = candidates3Day.filter(i => !alreadyChecked.has(`${i.airtable_id || i.id}_3_day`));
    const pending10Day = candidates10Day.filter(i => !alreadyChecked.has(`${i.airtable_id || i.id}_10_day`));

    console.log(`[install-verification] After filter: ${pending3Day.length} (3-day), ${pending10Day.length} (10-day)`);

    // ── 5. Build display ID mapping ──
    const allDisplayTableIds = new Set();
    for (const inst of [...pending3Day, ...pending10Day]) {
      const dtid = Array.isArray(inst.display_ids) ? inst.display_ids[0] : inst.display_ids;
      if (dtid) allDisplayTableIds.add(dtid);
    }

    const displayMap = new Map(); // display_table_id → display_id
    if (allDisplayTableIds.size > 0) {
      const dtIds = [...allDisplayTableIds];
      // Query in batches of 50
      for (let i = 0; i < dtIds.length; i += 50) {
        const batch = dtIds.slice(i, i + 50);
        const displayResult = await supabaseRequest(
          `airtable_displays?display_table_id=in.(${batch.map(encodeURIComponent).join(',')})` +
          `&select=display_table_id,display_id`
        );
        if (displayResult.ok && displayResult.data) {
          for (const d of displayResult.data) {
            if (d.display_table_id && d.display_id) {
              displayMap.set(d.display_table_id, d.display_id);
            }
          }
        }
      }
    }

    console.log(`[install-verification] Display mapping: ${displayMap.size} resolved`);

    // ── 6. Process checks ──
    const results = { checked: 0, passed: 0, failed: 0, noDisplay: 0, noHeartbeats: 0, errors: 0, chgFreigabe: 0 };

    async function processCheck(inst, checkType) {
      const instId = inst.airtable_id || inst.id;
      const dtid = Array.isArray(inst.display_ids) ? inst.display_ids[0] : inst.display_ids;
      const displayId = dtid ? displayMap.get(dtid) : null;

      if (!displayId) {
        // No display linked or mapping failed
        await logVerificationCheck({
          installation_airtable_id: instId,
          display_id: null,
          check_type: checkType,
          passed: false,
          error_message: 'no_display_linked',
        });
        results.noDisplay++;

        // Create task for 10-day check only
        if (checkType === '10_day' && AIRTABLE_TOKEN) {
          await createVerificationTask(inst, checkType, null, dtid || '(kein Display)');
        }
        return;
      }

      // Calculate period
      const installDate = new Date(inst.install_date);
      const days = checkType === '3_day' ? 3 : 10;
      const periodEnd = new Date(installDate.getTime() + days * 86400000);

      const { total, alive, rate, error } = await calculateOnlineRate(displayId, installDate, periodEnd);

      if (error) {
        await logVerificationCheck({
          installation_airtable_id: instId,
          display_id: displayId,
          check_type: checkType,
          period_start: installDate.toISOString(),
          period_end: periodEnd.toISOString(),
          total_heartbeats: total,
          alive_heartbeats: alive,
          online_rate_pct: rate,
          passed: false,
          error_message: error,
        });
        results.noHeartbeats++;

        // Create task for 10-day check if no heartbeats
        if (checkType === '10_day' && AIRTABLE_TOKEN) {
          await createVerificationTask(inst, checkType, rate, displayId);
        }
        return;
      }

      const passed = rate >= ONLINE_RATE_THRESHOLD;
      results.checked++;

      let taskId = null;
      if (!passed && AIRTABLE_TOKEN) {
        // Failed — create task
        taskId = await createVerificationTask(inst, checkType, rate, displayId);
        results.failed++;
      } else if (passed) {
        results.passed++;
      }

      // 10-day check: set Freigabe if passed
      if (checkType === '10_day' && passed && AIRTABLE_TOKEN) {
        await setFreigabeOnlineRate(instId);
        console.log(`[install-verification] ✅ Freigabe Online Rate set for ${inst.location_name || instId} (${rate}%)`);
      }

      await logVerificationCheck({
        installation_airtable_id: instId,
        display_id: displayId,
        check_type: checkType,
        period_start: installDate.toISOString(),
        period_end: periodEnd.toISOString(),
        total_heartbeats: total,
        alive_heartbeats: alive,
        online_rate_pct: rate,
        passed,
        task_airtable_id: taskId,
      });

      // Small delay to respect Airtable rate limits (5 req/s)
      await new Promise(r => setTimeout(r, 250));
    }

    // Process 3-day checks
    for (const inst of pending3Day) {
      try {
        await processCheck(inst, '3_day');
      } catch (err) {
        console.error(`[install-verification] Error processing 3-day check for ${inst.id}: ${err.message}`);
        results.errors++;
      }
    }

    // Process 10-day checks
    for (const inst of pending10Day) {
      try {
        await processCheck(inst, '10_day');
      } catch (err) {
        console.error(`[install-verification] Error processing 10-day check for ${inst.id}: ${err.message}`);
        results.errors++;
      }
    }

    // ── 7. Auto-set "Freigabe CHG?" ──
    if (AIRTABLE_TOKEN) {
      const chgCandidates = await supabaseRequest(
        `installationen?freigabe_online_rate=is.true` +
        `&freigabe_installation_vorort=is.true` +
        `&freigabe_chg=is.false` +
        `&select=id,airtable_id,location_name` +
        `&limit=50`
      );

      if (chgCandidates.ok && chgCandidates.data?.length) {
        for (const inst of chgCandidates.data) {
          try {
            const instId = inst.airtable_id || inst.id;
            const ok = await setFreigabeCHG(instId);
            if (ok) {
              results.chgFreigabe++;
              console.log(`[install-verification] ✅ Freigabe CHG set for ${inst.location_name || instId}`);
            }
            await new Promise(r => setTimeout(r, 250)); // Rate limit
          } catch (err) {
            console.error(`[install-verification] CHG Freigabe error for ${inst.id}: ${err.message}`);
          }
        }
      }
    }

    // ── 8. Summary ──
    const durationMs = Date.now() - startTime;
    const summary = {
      ...results,
      durationMs,
      candidates: { threeDay: pending3Day.length, tenDay: pending10Day.length },
      displayMappings: displayMap.size,
    };

    console.log(`[install-verification] Done in ${durationMs}ms:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error(`[install-verification] Fatal error: ${err.message}`);
    return new Response(JSON.stringify({ error: 'Interner Fehler bei der Verifikation' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
};
