/**
 * Netlify Background Function: Navori Heartbeat Sync
 *
 * Called by navori-heartbeat-scheduled.js (hourly, 6:00-23:59 CET).
 * Fetches all display players from Navori QL API and inserts
 * heartbeat rows into Supabase display_heartbeats.
 *
 * Flow:
 *   1. POST /gettoken → Auth token
 *   2. POST /getplayers { Filter: "GroupName=Live" } → PlayerList
 *   3. Map players to heartbeat rows
 *   4. Batch upsert into display_heartbeats (on_conflict: display_id,timestamp_parsed)
 *
 * Env:
 *   NAVORI_API_URL, NAVORI_LOGIN, NAVORI_PASSWORD
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Feature flag: navori_heartbeat_enabled
 */
import { logApiCall } from './shared/apiLogger.js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NAVORI_API_URL = process.env.NAVORI_API_URL || 'https://saas.navori.com/navoriservice/api';
const NAVORI_LOGIN   = process.env.NAVORI_LOGIN;
const NAVORI_PASSWORD = process.env.NAVORI_PASSWORD;

const BATCH_SIZE = 500;

// ─── Supabase helpers ────────────────────────────────────────────────────────

async function supabaseInsertBatch(table, rows, onConflict) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const conflictParam = onConflict ? `?on_conflict=${onConflict}` : '';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${conflictParam}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[navori-heartbeat] Supabase insert error: ${res.status} ${errText.substring(0, 300)}`);
    } else {
      inserted += batch.length;
    }
  }
  return inserted;
}

async function getFeatureFlag(key) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/feature_flags?key=eq.${key}&select=enabled`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data?.[0]?.enabled === true;
  } catch {
    return false;
  }
}

// ─── Navori API ──────────────────────────────────────────────────────────────

async function navoriGetToken() {
  const res = await fetch(`${NAVORI_API_URL}/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Login: NAVORI_LOGIN, Password: NAVORI_PASSWORD }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Navori GetToken failed: ${res.status} ${errText.substring(0, 200)}`);
  }
  const data = await res.json();
  // Response is { Token: "..." } or plain text
  return data.Token || data;
}

async function navoriGetPlayers(token) {
  const res = await fetch(`${NAVORI_API_URL}/getplayers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Token': token,
    },
    body: JSON.stringify({ Filter: 'GroupName=Live' }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Navori GetPlayers failed: ${res.status} ${errText.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.PlayerList || data;
}

// ─── Player → Heartbeat Row Mapping ─────────────────────────────────────────

function mapPlayerToHeartbeat(player, now) {
  // Name format from Navori: "DO-GER-BER-WD-55-001-25 | Standortname"
  const nameParts = (player.Name || '').split('|');
  const displayId = (nameParts[0] || '').trim();
  const locationName = (nameParts[1] || '').trim() || player.Description || null;

  // Parse LastNotify to calculate days_offline
  let lastOnlineDate = null;
  let daysOffline = null;
  let lastNotifyParsed = null;

  if (player.LastNotify) {
    // LastNotify can be ISO or various formats
    const d = new Date(player.LastNotify);
    if (!isNaN(d.getTime())) {
      lastNotifyParsed = d;
      lastOnlineDate = d.toISOString().split('T')[0]; // YYYY-MM-DD for storage
      daysOffline = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
      if (daysOffline < 0) daysOffline = 0;
    }
  }

  // Status logic (matches existing Sheets formula):
  // < 2 days = "live", 2-7 days = "zu beobachten", > 7 days = "offline"
  let heartbeat = 'offline';
  let isAlive = 'FALSE';
  if (daysOffline !== null) {
    if (daysOffline < 2) {
      heartbeat = 'live';
      isAlive = 'TRUE';
    } else if (daysOffline <= 7) {
      heartbeat = 'zu beobachten';
      isAlive = 'TRUE';
    }
  }

  // Timestamp: round to current hour for consistent grouping
  const hourTimestamp = new Date(now);
  hourTimestamp.setMinutes(0, 0, 0);
  const timestampStr = hourTimestamp.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });

  return {
    display_id: displayId || player.Name || 'UNKNOWN',
    raw_display_id: player.Name || null,
    timestamp: timestampStr,
    timestamp_parsed: hourTimestamp.toISOString(),
    location_name: locationName,
    serial_number: player.SerialNumber || null,
    heartbeat,
    is_alive: isAlive,
    display_status: player.Status || null,
    last_online_date: lastOnlineDate,
    days_offline: daysOffline,
    source: 'navori_api',
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default async (request) => {
  const apiStart = Date.now();

  try {
    console.log('[navori-heartbeat] Background function started');

    // 1. Check feature flag
    const enabled = await getFeatureFlag('navori_heartbeat_enabled');
    if (!enabled) {
      console.log('[navori-heartbeat] SKIPPED — navori_heartbeat_enabled=false');
      return;
    }

    // 2. Validate env
    if (!NAVORI_LOGIN || !NAVORI_PASSWORD) {
      console.error('[navori-heartbeat] SKIPPED — NAVORI_LOGIN or NAVORI_PASSWORD not set');
      return;
    }

    // 3. Get Navori auth token
    const tokenStart = Date.now();
    const token = await navoriGetToken();
    console.log(`[navori-heartbeat] Token acquired in ${Date.now() - tokenStart}ms`);

    logApiCall({
      functionName: 'navori-heartbeat',
      service: 'navori',
      method: 'POST',
      endpoint: '/gettoken',
      durationMs: Date.now() - tokenStart,
      statusCode: 200,
      success: true,
    });

    // 4. Get all players
    const playersStart = Date.now();
    const players = await navoriGetPlayers(token);
    console.log(`[navori-heartbeat] Got ${Array.isArray(players) ? players.length : 0} players in ${Date.now() - playersStart}ms`);

    logApiCall({
      functionName: 'navori-heartbeat',
      service: 'navori',
      method: 'POST',
      endpoint: '/getplayers',
      durationMs: Date.now() - playersStart,
      statusCode: 200,
      success: true,
      recordsCount: Array.isArray(players) ? players.length : 0,
    });

    if (!Array.isArray(players) || players.length === 0) {
      console.warn('[navori-heartbeat] No players returned from Navori API');
      return;
    }

    // 5. Map to heartbeat rows
    const now = new Date();
    const rows = players
      .map(p => mapPlayerToHeartbeat(p, now))
      .filter(r => r.display_id && r.display_id !== 'UNKNOWN');

    console.log(`[navori-heartbeat] Mapped ${rows.length} heartbeat rows`);

    // 6. Upsert to Supabase
    const insertStart = Date.now();
    const inserted = await supabaseInsertBatch(
      'display_heartbeats',
      rows,
      'display_id,timestamp_parsed'
    );

    console.log(`[navori-heartbeat] Upserted ${inserted}/${rows.length} rows in ${Date.now() - insertStart}ms`);

    logApiCall({
      functionName: 'navori-heartbeat',
      service: 'supabase',
      method: 'POST',
      endpoint: '/rest/v1/display_heartbeats',
      durationMs: Date.now() - insertStart,
      statusCode: 200,
      success: true,
      recordsCount: inserted,
    });

    // 7. Update sync metadata
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/sync_metadata?key=eq.heartbeats_navori`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          key: 'heartbeats_navori',
          last_sync: new Date().toISOString(),
          records_synced: rows.length,
          records_inserted: inserted,
        }),
      });
    } catch (e) {
      console.warn('[navori-heartbeat] sync_metadata update failed (non-fatal):', e.message);
    }

    const totalMs = Date.now() - apiStart;
    console.log(`[navori-heartbeat] Done in ${totalMs}ms — ${rows.length} players, ${inserted} upserted`);

    logApiCall({
      functionName: 'navori-heartbeat',
      service: 'mixed',
      method: 'BACKGROUND',
      endpoint: 'navori-heartbeat-background',
      durationMs: totalMs,
      statusCode: 200,
      success: true,
      metadata: { players: players.length, rows: rows.length, inserted },
    });

  } catch (err) {
    console.error('[navori-heartbeat] Fatal error:', err.message, err.stack);
    logApiCall({
      functionName: 'navori-heartbeat',
      service: 'mixed',
      method: 'BACKGROUND',
      endpoint: 'navori-heartbeat-background',
      durationMs: Date.now() - apiStart,
      statusCode: 500,
      success: false,
      errorMessage: err.message,
    });
  }
};
