// --- Native helper functions (replaces lodash) ---

/**
 * Returns the element in `arr` for which `fn(element)` is smallest.
 * Returns undefined for empty arrays.
 */
function minBy(arr, fn) {
  if (!arr || arr.length === 0) return undefined;
  let minVal = fn(arr[0]);
  let minItem = arr[0];
  for (let i = 1; i < arr.length; i++) {
    const val = fn(arr[i]);
    if (val < minVal) {
      minVal = val;
      minItem = arr[i];
    }
  }
  return minItem;
}

/**
 * Returns the element in `arr` for which `fn(element)` is largest.
 * Returns undefined for empty arrays.
 */
function maxBy(arr, fn) {
  if (!arr || arr.length === 0) return undefined;
  let maxVal = fn(arr[0]);
  let maxItem = arr[0];
  for (let i = 1; i < arr.length; i++) {
    const val = fn(arr[i]);
    if (val > maxVal) {
      maxVal = val;
      maxItem = arr[i];
    }
  }
  return maxItem;
}

/**
 * Groups elements of `arr` by a key.
 * `keyOrFn` can be a string (property name) or a function.
 * Returns a plain object with arrays as values.
 */
function groupBy(arr, keyOrFn) {
  const fn = typeof keyOrFn === 'function' ? keyOrFn : (item) => item[keyOrFn];
  const result = {};
  for (let i = 0; i < arr.length; i++) {
    const key = fn(arr[i]);
    if (!result[key]) result[key] = [];
    result[key].push(arr[i]);
  }
  return result;
}

/**
 * Returns a new sorted copy of `arr`, ordered by the value returned by `fn`.
 */
function sortBy(arr, fn) {
  return [...arr].sort((a, b) => {
    const va = fn(a);
    const vb = fn(b);
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  });
}

/**
 * Returns a new array with duplicates removed, where uniqueness is
 * determined by the value returned by `fn` for each element.
 * Keeps the first occurrence.
 */
function uniqBy(arr, fn) {
  const seen = new Set();
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const key = fn(arr[i]);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(arr[i]);
    }
  }
  return result;
}

// --- End native helpers ---

// City code mapping
// City code mapping — each city has ONE canonical code, duplicates removed.
// Previous duplicates: HH+HAM→Hamburg (kept HAM), DO+DTM→Dortmund (kept DTM)
const CITY_MAP = {
  'CGN': 'Köln',
  'BER': 'Berlin',
  'MUC': 'München',
  'HAM': 'Hamburg',
  'HH': 'Hamburg',       // alias → same city (both codes exist in data)
  'DUS': 'Düsseldorf',
  'FRA': 'Frankfurt',
  'STR': 'Stuttgart',
  'DTM': 'Dortmund',
  'DO': 'Dortmund',      // alias → same city (both codes exist in data)
  'LEJ': 'Leipzig',
  'DRS': 'Dresden',
  'NUE': 'Nürnberg',
  'HAN': 'Hannover',
  'BRE': 'Bremen',
  'ESS': 'Essen',
  'KA': 'Karlsruhe',
  'MS': 'Münster',
  'BI': 'Bielefeld',
  'WI': 'Wiesbaden',
  'MA': 'Mannheim',
  'AC': 'Aachen',
  'KI': 'Kiel',
  'ROS': 'Rostock',
};

export function getCityFromDisplayId(displayId) {
  if (!displayId) return 'Unbekannt';
  const parts = displayId.split('-');
  if (parts.length < 3) return 'Unbekannt';
  const code = parts[2];
  return CITY_MAP[code] || code;
}

export function getCityCodeFromDisplayId(displayId) {
  if (!displayId) return '???';
  const parts = displayId.split('-');
  return parts.length >= 3 ? parts[2] : '???';
}

// Parse DD.MM.YYYY HH:MM → Date (also accepts ISO 8601 from Supabase)
export function parseGermanDate(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  // ISO 8601: 2025-01-15T10:30:00+00:00 or 2025-01-15T10:30:00.000Z
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}T/)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD.MM.YYYY HH:MM
  const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, d, m, y, h, min] = match;
    return new Date(+y, +m - 1, +d, +h, +min);
  }
  // DD.MM.YYYY (no time)
  const matchDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (matchDate) {
    const [, d, m, y] = matchDate;
    return new Date(+y, +m - 1, +d);
  }
  return null;
}

// Parse MM/DD/YYYY → Date
export function parseUSDate(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return new Date(+y, +m - 1, +d);
  }
  return null;
}

// Status thresholds in hours
export const STATUS_THRESHOLDS = {
  ONLINE: 24,           // < 24h = online
  WARNING: 72,          // 24-72h = warnung
  CRITICAL: 72,         // > 72h = kritisch
  PERMANENT_OFFLINE: 168, // > 7 Tage (168h) = dauerhaft offline
};

// Operating hours for health rate calculation (6:00 - 22:00 = 16h/day)
export const OPERATING_HOURS = {
  START: 6,   // 06:00
  END: 22,    // 22:00
  DAILY_HOURS: 16, // 22 - 6 = 16 operating hours per day
};

// Deinstalled threshold: not seen in latest N snapshots (days)
export const DEINSTALL_DAYS = 3;

export function getStatusCategory(offlineHours, neverOnline) {
  if (neverOnline) return 'never_online';
  if (offlineHours == null || isNaN(offlineHours)) return 'unknown';
  if (offlineHours < STATUS_THRESHOLDS.ONLINE) return 'online';
  if (offlineHours < STATUS_THRESHOLDS.WARNING) return 'warning';
  if (offlineHours >= STATUS_THRESHOLDS.PERMANENT_OFFLINE) return 'permanent_offline';
  return 'critical';
}

export function getStatusColor(category) {
  switch (category) {
    case 'online': return '#22c55e';
    case 'warning': return '#f59e0b';
    case 'critical': return '#ef4444';
    case 'permanent_offline': return '#dc2626';
    case 'never_online': return '#64748b';
    default: return '#64748b';
  }
}

export function getStatusLabel(category) {
  switch (category) {
    case 'online': return 'Online';
    case 'warning': return 'Warnung';
    case 'critical': return 'Kritisch';
    case 'permanent_offline': return 'Dauerhaft Offline';
    case 'never_online': return 'Nie Online';
    default: return 'Unbekannt';
  }
}

export function formatDuration(hours) {
  if (hours == null || isNaN(hours)) return '–';
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) return `${days}d`;
  return `${days}d ${remainingHours}h`;
}

export function formatDate(date) {
  if (!date) return '–';
  // Support both Date objects and date strings
  const dt = date instanceof Date ? date : new Date(date);
  if (isNaN(dt.getTime())) return typeof date === 'string' ? date : '–';
  const d = dt.getDate().toString().padStart(2, '0');
  const m = (dt.getMonth() + 1).toString().padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}.${m}.${y}`;
}

export function formatDateTime(date) {
  if (!date) return '–';
  // Support both Date objects and date strings
  const dt = date instanceof Date ? date : new Date(date);
  if (isNaN(dt.getTime())) return typeof date === 'string' ? date : '–';
  const d = dt.getDate().toString().padStart(2, '0');
  const m = (dt.getMonth() + 1).toString().padStart(2, '0');
  const y = dt.getFullYear();
  const h = dt.getHours().toString().padStart(2, '0');
  const min = dt.getMinutes().toString().padStart(2, '0');
  return `${d}.${m}.${y} ${h}:${min}`;
}

/**
 * Extract the stable ID portion from a composite Display ID.
 * The raw Display ID in the CSV may look like "DO-GER-CGN-1234/Tankstelle Köln"
 * where the part after "/" is the location name which can change over time.
 * We use only the part before "/" as the stable identifier.
 */
function extractStableId(rawDisplayId) {
  if (!rawDisplayId) return { stableId: '', displayName: '' };
  const slashIdx = rawDisplayId.indexOf('/');
  if (slashIdx === -1) return { stableId: rawDisplayId, displayName: '' };
  return {
    stableId: rawDisplayId.substring(0, slashIdx).trim(),
    displayName: rawDisplayId.substring(slashIdx + 1).trim(),
  };
}

/**
 * Parse raw CSV rows into structured parsed records.
 * This is the expensive step – call once on load.
 *
 * IMPORTANT: The raw "Display ID" field may contain "StableID/LocationName".
 * The location name part can change over time while the stable ID stays the same.
 * We split these and always use the stable ID as the grouping key, keeping
 * the most recent name for each display.
 */
export function parseRows(rawRows) {
  const parsed = rawRows
    .map((row) => {
      const timestamp = parseGermanDate(row['Timestamp']);
      const rawDisplayId = (row['Display ID'] || '').trim();
      const { stableId, displayName } = extractStableId(rawDisplayId);
      const locationName = (row['Location Name'] || '').trim();
      const serialNumber = (row['Serial Number'] || '').trim();
      const registrationDate = parseGermanDate(row['Date']);
      const heartbeat = parseGermanDate(row['Status']);
      const isAlive = (row['Is Alive'] || '').trim();
      const displayStatus = (row['Display Status'] || '').trim();
      const lastOnlineDate = parseUSDate(row['Last Online Date']);
      const daysOffline = parseInt(row['Days Offline'], 10);

      if (!timestamp || !stableId) return null;

      return {
        timestamp,
        displayId: stableId,          // stable part before "/"
        rawDisplayId,                  // original full string for reference
        displayName,                   // name part after "/" (can change)
        locationName,
        serialNumber,
        registrationDate,
        heartbeat,
        isAlive,
        displayStatus,
        lastOnlineDate,
        daysOffline: isNaN(daysOffline) ? null : daysOffline,
      };
    })
    .filter(Boolean);

  // Pre-compute global bounds
  const earliest = minBy(parsed, (r) => r.timestamp.getTime())?.timestamp ?? null;
  const latest = maxBy(parsed, (r) => r.timestamp.getTime())?.timestamp ?? null;

  // Pre-compute global first-seen per display (unaffected by date range filters)
  // Now grouped by stableId (displayId field)
  const byDisplay = groupBy(parsed, 'displayId');
  const globalFirstSeen = {};
  Object.entries(byDisplay).forEach(([id, rows]) => {
    globalFirstSeen[id] = minBy(rows, (r) => r.timestamp.getTime())?.timestamp ?? null;
  });

  return { parsed, earliest, latest, globalFirstSeen, totalRows: parsed.length };
}

/**
 * Aggregate parsed rows into dashboard data, optionally filtered to a date range.
 * rangeStart / rangeEnd are Date objects (inclusive). Pass null for no bound.
 */
export function aggregateData(parsed, rangeStart, rangeEnd, globalFirstSeen) {
  // Filter rows by the selected date range (based on Timestamp column A)
  let rows = parsed;
  if (rangeStart) {
    rows = rows.filter((r) => r.timestamp >= rangeStart);
  }
  if (rangeEnd) {
    // Include the full end-day by comparing to end-of-day
    const endOfDay = new Date(rangeEnd);
    endOfDay.setHours(23, 59, 59, 999);
    rows = rows.filter((r) => r.timestamp <= endOfDay);
  }

  if (rows.length === 0) {
    return {
      displays: [],
      latestTimestamp: null,
      trendData: [],
      cityData: [],
      snapshotTimestamps: [],
      totalParsedRows: 0,
    };
  }

  const byDisplay = groupBy(rows, 'displayId');

  const latestTimestamp = maxBy(rows, (r) => r.timestamp.getTime())?.timestamp;

  const snapshotTimestamps = uniqBy(
    rows.map((r) => r.timestamp),
    (d) => d.getTime()
  ).sort((a, b) => a - b);

  // Build display summaries
  // A display is "active" (installed) if it appeared in a recent snapshot.
  // We allow a tolerance window: if a display was seen within 24 hours of the latest
  // snapshot, it's still considered active. This prevents displays that miss a single
  // system check (~3.5h intervals) from disappearing entirely.
  const ACTIVE_TOLERANCE_HOURS = 24;
  const activeCutoff = new Date(
    latestTimestamp.getTime() - ACTIVE_TOLERANCE_HOURS * 60 * 60 * 1000
  );

  const displays = Object.entries(byDisplay).map(([displayId, displayRows]) => {
    const sorted = sortBy(displayRows, (r) => r.timestamp.getTime());
    const firstSeen = sorted[0].timestamp;
    const lastSeen = sorted[sorted.length - 1].timestamp;
    const latestRow = sorted[sorted.length - 1];

    const isActive = latestRow.timestamp >= activeCutoff;

    let offlineHours = null;
    // Check if display was ever online (ever had a heartbeat across all snapshots)
    const everHadHeartbeat = sorted.some((snap) => snap.heartbeat != null);

    if (latestRow.heartbeat && latestRow.timestamp) {
      offlineHours =
        (latestRow.timestamp.getTime() - latestRow.heartbeat.getTime()) / (1000 * 60 * 60);
      if (offlineHours < 0) offlineHours = 0;
    }

    const cityCode = getCityCodeFromDisplayId(displayId);
    const city = getCityFromDisplayId(displayId);
    const neverOnline = !everHadHeartbeat;
    const status = getStatusCategory(offlineHours, neverOnline);

    // Use global first-seen if available (unaffected by date range filter)
    const installedDate = globalFirstSeen?.[displayId] || firstSeen;

    // Use the display name from the most recent snapshot (in case it changed)
    const latestDisplayName = latestRow.displayName || '';

    return {
      displayId,
      displayName: latestDisplayName,        // latest name from "ID/Name" composite
      locationName: latestRow.locationName,
      serialNumber: latestRow.serialNumber,
      cityCode,
      city,
      firstSeen: installedDate,
      lastSeen,
      isActive,
      heartbeat: latestRow.heartbeat,
      offlineHours,
      status,
      displayStatus: latestRow.displayStatus,
      registrationDate: latestRow.registrationDate,
      totalSnapshots: displayRows.length,
      snapshots: sorted,
    };
  });

  // --- Uptime-based Health Rate calculation ---
  // Health Rate = percentage of operating hours (6:00-22:00) that displays were actually online.
  // We group snapshots by calendar day and compute per-display daily uptime,
  // then aggregate across all displays and days.

  const { DAILY_HOURS } = OPERATING_HOURS;
  const CHECK_INTERVAL_HOURS = 3.5; // system checks every ~3.5h

  /**
   * Estimate how many of the 16 operating hours (06:00-22:00) a display was online on a given day.
   *
   * We use `offlineHours` (= snapshot_time - heartbeat_time) as our primary signal:
   * - offlineHours ≤ CHECK_INTERVAL (3.5h): Display is considered fully online → 16h
   *   (it was recently checked and confirmed alive; the gap is just the check interval)
   * - offlineHours > CHECK_INTERVAL and ≤ 16h: Partially online → max(0, 16 - offlineHours)
   *   (it went offline some hours ago, so we subtract those hours from the full day)
   * - offlineHours > 16h or no heartbeat: Offline all day → 0h
   */
  function estimateOperatingOnlineHours(offlineHours) {
    if (offlineHours == null || isNaN(offlineHours) || offlineHours < 0) return 0;

    // Within the check interval grace period → considered fully online
    if (offlineHours <= CHECK_INTERVAL_HOURS) return DAILY_HOURS;

    // Partially offline: subtract offline hours from full operating day
    if (offlineHours <= DAILY_HOURS) return Math.max(0, DAILY_HOURS - offlineHours);

    // Offline longer than a full operating day → 0
    return 0;
  }

  // Group rows by calendar day (YYYY-MM-DD)
  function getDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const rowsByDay = {};
  rows.forEach((r) => {
    const key = getDayKey(r.timestamp);
    if (!rowsByDay[key]) rowsByDay[key] = [];
    rowsByDay[key].push(r);
  });

  // For each day: compute per-display uptime and aggregate
  const dayKeys = Object.keys(rowsByDay).sort();
  const trendData = dayKeys.map((dayKey) => {
    const dayRows = rowsByDay[dayKey];
    // Use the latest snapshot per display for this day (most accurate heartbeat info)
    const byDisplayThisDay = groupBy(dayRows, 'displayId');
    const displayCount = Object.keys(byDisplayThisDay).length;

    let totalOnlineHours = 0;
    let totalExpectedHours = displayCount * DAILY_HOURS;

    // Also keep category counts (based on latest snapshot status for the day)
    let onlineCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let permanentOfflineCount = 0;
    let neverOnlineCount = 0;

    Object.entries(byDisplayThisDay).forEach(([displayId, dRows]) => {
      // Take the latest snapshot of the day for this display
      const latestSnap = maxBy(dRows, (r) => r.timestamp.getTime());

      // Compute offlineHours first (needed for both health rate and status category)
      let offlineHours = null;
      if (latestSnap.heartbeat) {
        offlineHours = (latestSnap.timestamp.getTime() - latestSnap.heartbeat.getTime()) / (1000 * 60 * 60);
        if (offlineHours < 0) offlineHours = 0;
      }
      // Use global display-level everHadHeartbeat to determine neverOnline,
      // not just this snapshot's heartbeat. A display that had heartbeats on
      // Monday but not Tuesday is "offline", NOT "never_online".
      const displayObj = byDisplay[displayId];
      const everHadHeartbeat = displayObj
        ? displayObj.some((snap) => snap.heartbeat != null)
        : !!latestSnap.heartbeat;
      const neverOnline = !everHadHeartbeat;

      // Estimate operating online hours for this display on this day
      const onlineHrs = neverOnline ? 0 : estimateOperatingOnlineHours(offlineHours);
      totalOnlineHours += onlineHrs;
      const cat = getStatusCategory(offlineHours, neverOnline);
      if (cat === 'online') onlineCount++;
      else if (cat === 'warning') warningCount++;
      else if (cat === 'critical') criticalCount++;
      else if (cat === 'permanent_offline') permanentOfflineCount++;
      else if (cat === 'never_online') neverOnlineCount++;
    });

    // Health rate for this day = online operating hours / expected operating hours
    const healthRate = totalExpectedHours > 0
      ? (totalOnlineHours / totalExpectedHours) * 100
      : 0;

    // Use the latest snapshot timestamp for this day as the "timestamp"
    const dayTimestamp = maxBy(dayRows, (r) => r.timestamp.getTime()).timestamp;

    return {
      timestamp: dayTimestamp,
      dayKey,
      date: dayKey.split('-').reverse().join('.'), // DD.MM.YYYY
      total: displayCount,
      online: onlineCount,
      offline: displayCount - onlineCount,
      healthRate: Math.round(healthRate * 10) / 10,
      totalOnlineHours: Math.round(totalOnlineHours * 10) / 10,
      totalExpectedHours,
      warningCount,
      criticalCount,
      permanentOfflineCount,
      neverOnlineCount,
    };
  });

  // --- Snapshot-based trend data (for heatmap / hourly analysis) ---
  // The day-grouped trendData above is used for KPIs and health rate.
  // For the heatmap and hourly health patterns, we need per-snapshot data.
  // Each snapshot now includes an uptime-based healthRate (same formula as daily KPIs)
  // to ensure consistency between KPI cards and OverviewHealthPatterns charts.
  const bySnapshot = groupBy(rows, (r) => r.timestamp.getTime());
  const snapshotTrendData = Object.entries(bySnapshot)
    .sort(([a], [b]) => +a - +b)
    .map(([tsKey, snapRows]) => {
      const ts = new Date(+tsKey);
      const byDisp = groupBy(snapRows, 'displayId');
      const total = Object.keys(byDisp).length;
      let onlineCount = 0;
      let totalOnlineHours = 0;
      const totalExpectedHours = total * DAILY_HOURS;

      Object.values(byDisp).forEach((dRows) => {
        const latest = maxBy(dRows, (r) => r.timestamp.getTime());
        let oh = null;
        if (latest.heartbeat) {
          oh = (latest.timestamp.getTime() - latest.heartbeat.getTime()) / (1000 * 60 * 60);
          if (oh < 0) oh = 0;
        }
        const neverOn = !latest.heartbeat;
        if (getStatusCategory(oh, neverOn) === 'online') onlineCount++;
        // Uptime-based: same formula as daily health rate calculation
        const onlineHrs = neverOn ? 0 : estimateOperatingOnlineHours(oh);
        totalOnlineHours += onlineHrs;
      });

      const healthRate = totalExpectedHours > 0
        ? Math.round((totalOnlineHours / totalExpectedHours) * 1000) / 10
        : 0;

      return {
        timestamp: ts,
        total,
        online: onlineCount,
        offline: total - onlineCount,
        healthRate,
      };
    });

  // City aggregation (based on latest snapshot in range, with uptime-based health)
  // Group by resolved city NAME (not code) to avoid duplicates like HH+HAM→Hamburg
  const activeDisplays = displays.filter((d) => d.isActive);
  const cityGroupsByName = {};
  activeDisplays.forEach((d) => {
    const cityName = d.city || 'Unbekannt';
    if (!cityGroupsByName[cityName]) cityGroupsByName[cityName] = { code: d.cityCode, displays: [] };
    cityGroupsByName[cityName].displays.push(d);
  });
  const cityData = Object.entries(cityGroupsByName)
    .map(([name, { code, displays: cityDisplays }]) => {
      const total = cityDisplays.length;
      const online = cityDisplays.filter(
        (d) => d.status === 'online'
      ).length;
      const warning = cityDisplays.filter((d) => d.status === 'warning').length;
      const critical = cityDisplays.filter((d) => d.status === 'critical').length;

      // Uptime-based health rate for this city: use offlineHours from each display
      let cityOnlineHours = 0;
      const cityExpectedHours = total * DAILY_HOURS;
      cityDisplays.forEach((d) => {
        if (d.offlineHours != null) {
          cityOnlineHours += estimateOperatingOnlineHours(d.offlineHours);
        }
        // displays with no heartbeat (never online) contribute 0h
      });
      const healthRate = cityExpectedHours > 0 ? (cityOnlineHours / cityExpectedHours) * 100 : 0;

      return {
        code,
        name,
        total,
        online,
        warning,
        critical,
        offline: total - online,
        healthRate: Math.round(healthRate * 10) / 10,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    displays,
    latestTimestamp,
    trendData,
    snapshotTrendData,   // per-snapshot data for heatmap / hourly analysis
    cityData,
    snapshotTimestamps,
    totalParsedRows: rows.length,
  };
}

/**
 * Legacy wrapper – parses + aggregates in one call (full range).
 */
export function processData(rawRows) {
  const { parsed, globalFirstSeen } = parseRows(rawRows);
  return aggregateData(parsed, null, null, globalFirstSeen);
}

/**
 * Compute KPI metrics from processed display data.
 * Also stores the actual display lists for drill-down.
 *
 * Health Rate is now uptime-based: total online operating hours (6:00-22:00)
 * divided by total expected operating hours across all displays and days.
 * Uses average display count (not max) to avoid distortion.
 *
 * Deinstalled = not seen in latest snapshot AND last seen within DEINSTALL_DAYS.
 * Deinstalled displays are excluded from totalActive and health calculation.
 */
export function computeKPIs(displays, latestTimestamp, globalFirstSeen, trendData, rangeStart) {
  // Deinstalled: not in latest snapshot, last seen within the selected range
  // "deinstalled" detection uses DEINSTALL_DAYS (3 days) for core detection
  const deinstallCutoff = new Date(
    latestTimestamp.getTime() - DEINSTALL_DAYS * 24 * 60 * 60 * 1000
  );
  // Use rangeStart for visibility window (instead of fixed 30d)
  const rangeStartDate = rangeStart || new Date(latestTimestamp.getTime() - 30 * 24 * 60 * 60 * 1000);
  const deinstalled = displays.filter(
    (d) => !d.isActive && d.lastSeen >= deinstallCutoff
  );
  const deinstalledInRange = displays.filter(
    (d) => !d.isActive && d.lastSeen >= rangeStartDate
  );

  const active = displays.filter((d) => d.isActive);
  const totalActive = active.length;

  // Online: < 24h offline
  const onlineDisplays = active.filter((d) => d.status === 'online');

  // Health Rate: uptime-based calculation using operating hours (6:00-22:00).
  // Sum total online operating hours and total expected operating hours across all days,
  // using average display count (not max) to avoid distortion.
  let healthRate;
  if (trendData && trendData.length > 0) {
    const totalOnlineHours = trendData.reduce((sum, day) => sum + (day.totalOnlineHours || 0), 0);
    const totalExpectedHours = trendData.reduce((sum, day) => sum + (day.totalExpectedHours || 0), 0);
    healthRate = totalExpectedHours > 0 ? (totalOnlineHours / totalExpectedHours) * 100 : 0;
  } else {
    healthRate = totalActive > 0 ? (onlineDisplays.length / totalActive) * 100 : 0;
  }

  // Warnung: 24-72h
  const warningDisplays = active.filter((d) => d.status === 'warning');

  // Kritisch: 72h - 7d (excludes permanent_offline to avoid double counting)
  const criticalDisplays = active.filter(
    (d) => d.status === 'critical'
  );

  // Dauerhaft Offline: > 7 Tage
  const permanentOfflineDisplays = active.filter((d) => d.status === 'permanent_offline');

  // Nie Online: never had a heartbeat
  const neverOnlineDisplays = active.filter((d) => d.status === 'never_online');

  // Newly installed within the selected range (use global first-seen, not filtered first-seen)
  const newlyInstalled = displays.filter((d) => {
    const gfs = globalFirstSeen?.[d.displayId];
    const effectiveFirstSeen = gfs || d.firstSeen;
    return effectiveFirstSeen >= rangeStartDate;
  });

  // Compute avg online / avg total / avg offline categories over the selected range
  let avgOnline = onlineDisplays.length;
  let avgTotal = totalActive;
  let avgWarning = warningDisplays.length;
  let avgCritical = criticalDisplays.length;
  let avgPermanentOffline = permanentOfflineDisplays.length;
  let avgNeverOnline = neverOnlineDisplays.length;

  if (trendData && trendData.length > 0) {
    avgOnline = Math.round(
      trendData.reduce((sum, s) => sum + s.online, 0) / trendData.length
    );
    avgTotal = Math.round(
      trendData.reduce((sum, s) => sum + s.total, 0) / trendData.length
    );
    if (trendData[0].warningCount !== undefined) {
      avgWarning = Math.round(
        trendData.reduce((sum, s) => sum + (s.warningCount || 0), 0) / trendData.length
      );
      avgCritical = Math.round(
        trendData.reduce((sum, s) => sum + (s.criticalCount || 0), 0) / trendData.length
      );
      avgPermanentOffline = Math.round(
        trendData.reduce((sum, s) => sum + (s.permanentOfflineCount || 0), 0) / trendData.length
      );
      avgNeverOnline = Math.round(
        trendData.reduce((sum, s) => sum + (s.neverOnlineCount || 0), 0) / trendData.length
      );
    }
  }

  // First-snapshot values for trend comparison (beginning vs end of range)
  let firstHealthRate = null;
  let firstOnline = null;
  let firstTotal = null;
  let firstWarning = null;
  let firstCritical = null;
  let firstPermanentOffline = null;
  let firstNeverOnline = null;
  if (trendData && trendData.length >= 2) {
    const first = trendData[0];
    firstHealthRate = first.healthRate;
    firstOnline = first.online;
    firstTotal = first.total;
    firstWarning = first.warningCount ?? null;
    firstCritical = first.criticalCount ?? 0;
    firstPermanentOffline = first.permanentOfflineCount ?? null;
    firstNeverOnline = first.neverOnlineCount ?? null;
  }

  return {
    totalActive,
    healthRate: Math.round(healthRate * 10) / 10,
    onlineCount: onlineDisplays.length,
    warningCount: warningDisplays.length,
    criticalCount: criticalDisplays.length,
    permanentOfflineCount: permanentOfflineDisplays.length,
    neverOnlineCount: neverOnlineDisplays.length,
    newlyInstalled: newlyInstalled.length,
    deinstalled: deinstalledInRange.length,
    avgOnline,
    avgTotal,
    avgWarning,
    avgCritical,
    avgPermanentOffline,
    avgNeverOnline,
    snapshotCount: trendData ? trendData.length : 0, // now = number of days

    firstHealthRate,
    firstOnline,
    firstTotal,
    firstWarning,
    firstCritical,
    firstPermanentOffline,
    firstNeverOnline,
    // Lists for drill-down
    _lists: {
      active,
      online: onlineDisplays,
      warning: warningDisplays,
      critical: criticalDisplays,
      permanent_offline: permanentOfflineDisplays,
      never_online: neverOnlineDisplays,
      new: newlyInstalled,
      deinstalled: deinstalledInRange,
    },
  };
}

/**
 * Compute a watchlist of newly installed displays (≤28 days) with health scoring.
 * Returns sorted array: most problematic first.
 */
export function computeNewDisplayWatchlist(displays, latestTimestamp) {
  const WATCHLIST_DAYS = 28;
  const cutoff = new Date(latestTimestamp.getTime() - WATCHLIST_DAYS * 24 * 60 * 60 * 1000);

  const newDisplays = displays.filter((d) => d.firstSeen >= cutoff);

  return newDisplays
    .map((d) => {
      const timeline = computeDisplayTimeline(d);
      const ageDays = Math.max(
        1,
        Math.round((latestTimestamp.getTime() - d.firstSeen.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Health score: 100 = perfect, 0 = terrible
      // Factors: uptime rate, current status, offline episode count relative to age
      let score = timeline.uptimeRate; // base: 0-100

      // Penalty for current offline status
      if (d.status === 'permanent_offline') score -= 40;
      else if (d.status === 'never_online') score -= 35;
      else if (d.status === 'critical') score -= 30;
      else if (d.status === 'warning') score -= 10;

      // Penalty for frequent offline episodes (more than 1 per 7 days is bad)
      const episodesPerWeek = (timeline.episodes.length / ageDays) * 7;
      if (episodesPerWeek > 2) score -= 15;
      else if (episodesPerWeek > 1) score -= 8;

      score = Math.max(0, Math.min(100, Math.round(score)));

      const needsAttention =
        score < 70 || d.status === 'critical' || d.status === 'permanent_offline' || d.status === 'never_online';

      return {
        ...d,
        ageDays,
        uptimeRate: timeline.uptimeRate,
        offlineEpisodes: timeline.episodes.length,
        longestOutageHours: timeline.longestEpisode?.durationHours ?? 0,
        healthScore: score,
        needsAttention,
      };
    })
    .sort((a, b) => a.healthScore - b.healthScore); // worst first
}

/**
 * Compute offline duration distribution buckets for active displays.
 * "Nie Online" displays get their own bucket instead of being falsely placed in 0-24h.
 */
export function computeOfflineDistribution(displays) {
  const active = displays.filter((d) => d.isActive);
  const buckets = [
    { label: '0–24h', min: 0, max: 24, count: 0, color: '#22c55e' },
    { label: '24–72h', min: 24, max: 72, count: 0, color: '#f59e0b' },
    { label: '72h–7d', min: 72, max: 168, count: 0, color: '#ef4444' },
    { label: '>7d', min: 168, max: Infinity, count: 0, color: '#dc2626' },
    { label: 'Nie Online', min: -1, max: -1, count: 0, color: '#64748b' },
  ];

  active.forEach((d) => {
    // Never-online displays go to separate bucket (not falsely in 0-24h)
    if (d.status === 'never_online') {
      buckets[4].count++;
      return;
    }
    const h = d.offlineHours ?? 0;
    const bucket = buckets.find((b) => h >= b.min && h < b.max);
    if (bucket) bucket.count++;
  });

  // Only include "Nie Online" bucket if there are any
  return buckets[4].count > 0 ? buckets : buckets.slice(0, 4);
}

/**
 * Compute online/offline timeline for a single display from its snapshots.
 * uptimeRate is now based on operating hours (6:00-22:00).
 */
export function computeDisplayTimeline(display) {
  const snapshots = display.snapshots;
  if (!snapshots || snapshots.length === 0) return { segments: [], uptimeRate: 0 };

  const { DAILY_HOURS } = OPERATING_HOURS;
  const CHECK_INTERVAL_HOURS = 3.5;

  const segments = snapshots.map((snap) => {
    let offlineHours = null;
    if (snap.heartbeat && snap.timestamp) {
      offlineHours = (snap.timestamp.getTime() - snap.heartbeat.getTime()) / (1000 * 60 * 60);
      if (offlineHours < 0) offlineHours = 0;
    }
    const status = getStatusCategory(offlineHours, false);
    return {
      timestamp: snap.timestamp,
      heartbeat: snap.heartbeat,
      offlineHours,
      status,
      isOnline: status === 'online',
    };
  });

  // Compute operating-hours-based uptime rate:
  // Group snapshots by day, compute online hours per day, then average
  const byDay = {};
  segments.forEach((seg) => {
    const d = seg.timestamp;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(seg);
  });

  let totalOnlineHours = 0;
  const totalDays = Object.keys(byDay).length;
  const totalExpectedHours = totalDays * DAILY_HOURS;

  Object.values(byDay).forEach((daySegs) => {
    // Use the latest segment of the day
    const latest = daySegs.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
    if (!latest.heartbeat) return; // never online → 0h

    // Use offlineHours-based estimation (same as aggregateData)
    let oh = latest.offlineHours;
    if (oh == null || isNaN(oh)) return;
    // Within check interval grace → full day online
    if (oh <= CHECK_INTERVAL_HOURS) {
      totalOnlineHours += DAILY_HOURS;
    } else if (oh <= DAILY_HOURS) {
      totalOnlineHours += Math.max(0, DAILY_HOURS - oh);
    }
    // else: offline longer than operating day → 0h
  });

  const uptimeRate = totalExpectedHours > 0 ? (totalOnlineHours / totalExpectedHours) * 100 : 0;

  // Compute offline episodes
  const episodes = [];
  let currentEpisode = null;

  segments.forEach((seg, idx) => {
    if (!seg.isOnline) {
      if (!currentEpisode) {
        currentEpisode = { start: seg.timestamp, end: seg.timestamp, segments: [seg] };
      } else {
        currentEpisode.end = seg.timestamp;
        currentEpisode.segments.push(seg);
      }
    } else {
      if (currentEpisode) {
        episodes.push(currentEpisode);
        currentEpisode = null;
      }
    }
  });
  if (currentEpisode) episodes.push(currentEpisode);

  // Calculate duration for each episode
  episodes.forEach((ep) => {
    ep.durationHours = (ep.end.getTime() - ep.start.getTime()) / (1000 * 60 * 60);
    // Minimum of one check interval (~3.5h) if single snapshot
    if (ep.segments.length === 1) ep.durationHours = 3.5;
  });

  const longestEpisode = maxBy(episodes, (ep) => ep.durationHours) || null;

  return {
    segments,
    uptimeRate: Math.round(uptimeRate * 10) / 10,
    episodes,
    longestEpisode,
  };
}
