import _ from 'lodash';

// City code mapping
const CITY_MAP = {
  'CGN': 'Köln',
  'BER': 'Berlin',
  'MUC': 'München',
  'HH': 'Hamburg',
  'DUS': 'Düsseldorf',
  'FRA': 'Frankfurt',
  'STR': 'Stuttgart',
  'DO': 'Dortmund',
  'LEJ': 'Leipzig',
  'DRS': 'Dresden',
  'HAM': 'Hamburg',
  'NUE': 'Nürnberg',
  'HAN': 'Hannover',
  'BRE': 'Bremen',
  'ESS': 'Essen',
  'DTM': 'Dortmund',
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
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

export function formatDateTime(date) {
  if (!date) return '–';
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
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
  const earliest = _.minBy(parsed, (r) => r.timestamp.getTime())?.timestamp ?? null;
  const latest = _.maxBy(parsed, (r) => r.timestamp.getTime())?.timestamp ?? null;

  // Pre-compute global first-seen per display (unaffected by date range filters)
  // Now grouped by stableId (displayId field)
  const byDisplay = _.groupBy(parsed, 'displayId');
  const globalFirstSeen = {};
  Object.entries(byDisplay).forEach(([id, rows]) => {
    globalFirstSeen[id] = _.minBy(rows, (r) => r.timestamp.getTime())?.timestamp ?? null;
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

  const byDisplay = _.groupBy(rows, 'displayId');

  const latestTimestamp = _.maxBy(rows, (r) => r.timestamp.getTime())?.timestamp;

  const snapshotTimestamps = _.uniqBy(
    rows.map((r) => r.timestamp),
    (d) => d.getTime()
  ).sort((a, b) => a - b);

  // Build display summaries
  const displays = Object.entries(byDisplay).map(([displayId, displayRows]) => {
    const sorted = _.sortBy(displayRows, (r) => r.timestamp.getTime());
    const firstSeen = sorted[0].timestamp;
    const lastSeen = sorted[sorted.length - 1].timestamp;
    const latestRow = sorted[sorted.length - 1];

    const isActive = latestRow.timestamp.getTime() === latestTimestamp.getTime();

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

  // Trend data – use all snapshot timestamps in the range
  // Includes per-snapshot category breakdown for KPI time-range averages
  const trendData = snapshotTimestamps.map((snapshotTime) => {
    const snapshotRows = rows.filter(
      (r) => r.timestamp.getTime() === snapshotTime.getTime()
    );
    const total = snapshotRows.length;

    // Categorize each display in this snapshot
    let onlineCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let permanentOfflineCount = 0;
    let neverOnlineCount = 0;

    snapshotRows.forEach((r) => {
      let offlineHours = null;
      if (r.heartbeat) {
        offlineHours = (snapshotTime.getTime() - r.heartbeat.getTime()) / (1000 * 60 * 60);
        if (offlineHours < 0) offlineHours = 0;
      }
      const neverOnline = !r.heartbeat;
      const cat = getStatusCategory(offlineHours, neverOnline);
      if (cat === 'online') onlineCount++;
      else if (cat === 'warning') warningCount++;
      else if (cat === 'critical') criticalCount++;
      else if (cat === 'permanent_offline') permanentOfflineCount++;
      else if (cat === 'never_online') neverOnlineCount++;
    });

    const healthRate = total > 0 ? (onlineCount / total) * 100 : 0;

    return {
      timestamp: snapshotTime,
      date: formatDateTime(snapshotTime),
      total,
      online: onlineCount,
      offline: total - onlineCount,
      healthRate: Math.round(healthRate * 10) / 10,
      warningCount,
      criticalCount,
      permanentOfflineCount,
      neverOnlineCount,
    };
  });

  // City aggregation (based on latest snapshot in range)
  const activeDisplays = displays.filter((d) => d.isActive);
  const cityGroups = _.groupBy(activeDisplays, 'cityCode');
  const cityData = Object.entries(cityGroups)
    .map(([code, cityDisplays]) => {
      const total = cityDisplays.length;
      const online = cityDisplays.filter(
        (d) => d.status === 'online'
      ).length;
      const healthRate = total > 0 ? (online / total) * 100 : 0;
      return {
        code,
        name: getCityFromDisplayId(`DO-GER-${code}-X`),
        total,
        online,
        offline: total - online,
        healthRate: Math.round(healthRate * 10) / 10,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    displays,
    latestTimestamp,
    trendData,
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
 * When trendData is provided, the health rate is computed as the average
 * across all snapshots in the selected date range (not just the last snapshot).
 *
 * Deinstalled = not seen in latest snapshot AND last seen within DEINSTALL_DAYS.
 * Deinstalled displays are excluded from totalActive and health calculation.
 */
export function computeKPIs(displays, latestTimestamp, globalFirstSeen, trendData) {
  // Deinstalled: not in latest snapshot, last seen within 30 days (for visibility)
  // but the "deinstalled" flag uses DEINSTALL_DAYS (3 days) for detection
  const deinstallCutoff = new Date(
    latestTimestamp.getTime() - DEINSTALL_DAYS * 24 * 60 * 60 * 1000
  );
  const thirtyDaysAgo = new Date(latestTimestamp.getTime() - 30 * 24 * 60 * 60 * 1000);
  const deinstalled = displays.filter(
    (d) => !d.isActive && d.lastSeen >= deinstallCutoff
  );
  const deinstalledRecent = displays.filter(
    (d) => !d.isActive && d.lastSeen >= thirtyDaysAgo
  );

  const active = displays.filter((d) => d.isActive);
  const totalActive = active.length;

  // Online: < 24h offline
  const onlineDisplays = active.filter((d) => d.status === 'online');

  // Health Rate: If trendData available, compute avg across all snapshots in range.
  // Otherwise fall back to current snapshot rate.
  let healthRate;
  if (trendData && trendData.length > 0) {
    const avgHealth =
      trendData.reduce((sum, snap) => sum + snap.healthRate, 0) / trendData.length;
    healthRate = avgHealth;
  } else {
    healthRate = totalActive > 0 ? (onlineDisplays.length / totalActive) * 100 : 0;
  }

  // Warnung: 24-72h
  const warningDisplays = active.filter((d) => d.status === 'warning');

  // Kritisch: >72h (includes permanent_offline)
  const criticalDisplays = active.filter(
    (d) => d.status === 'critical' || d.status === 'permanent_offline'
  );

  // Dauerhaft Offline: > 7 Tage
  const permanentOfflineDisplays = active.filter((d) => d.status === 'permanent_offline');

  // Nie Online: never had a heartbeat
  const neverOnlineDisplays = active.filter((d) => d.status === 'never_online');

  // Newly installed in last 7 days (use global first-seen, not filtered first-seen)
  const sevenDaysAgo = new Date(latestTimestamp.getTime() - 7 * 24 * 60 * 60 * 1000);
  const newlyInstalled = displays.filter((d) => {
    const gfs = globalFirstSeen?.[d.displayId];
    const effectiveFirstSeen = gfs || d.firstSeen;
    return effectiveFirstSeen >= sevenDaysAgo;
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
    firstCritical = (first.criticalCount ?? 0) + (first.permanentOfflineCount ?? 0);
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
    deinstalled: deinstalledRecent.length,
    avgOnline,
    avgTotal,
    avgWarning,
    avgCritical,
    avgPermanentOffline,
    avgNeverOnline,
    snapshotCount: trendData ? trendData.length : 0,
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
      deinstalled: deinstalledRecent,
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
 */
export function computeOfflineDistribution(displays) {
  const active = displays.filter((d) => d.isActive);
  const buckets = [
    { label: '0–24h', min: 0, max: 24, count: 0, color: '#22c55e' },
    { label: '24–72h', min: 24, max: 72, count: 0, color: '#f59e0b' },
    { label: '72h–7d', min: 72, max: 168, count: 0, color: '#ef4444' },
    { label: '>7d', min: 168, max: Infinity, count: 0, color: '#dc2626' },
  ];

  active.forEach((d) => {
    const h = d.offlineHours ?? 0;
    const bucket = buckets.find((b) => h >= b.min && h < b.max);
    if (bucket) bucket.count++;
  });

  return buckets;
}

/**
 * Compute online/offline timeline for a single display from its snapshots.
 */
export function computeDisplayTimeline(display) {
  const snapshots = display.snapshots;
  if (!snapshots || snapshots.length === 0) return { segments: [], uptimeRate: 0 };

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

  const onlineCount = segments.filter((s) => s.isOnline).length;
  const uptimeRate = segments.length > 0 ? (onlineCount / segments.length) * 100 : 0;

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

  const longestEpisode = _.maxBy(episodes, 'durationHours') || null;

  return {
    segments,
    uptimeRate: Math.round(uptimeRate * 10) / 10,
    episodes,
    longestEpisode,
  };
}
