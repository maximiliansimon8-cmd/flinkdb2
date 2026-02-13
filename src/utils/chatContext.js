/**
 * Chat Context Utilities
 *
 * Builds compact context objects from dashboard data for the AI chat assistant.
 * Provides display search and query term extraction for contextual responses.
 *
 * SECURITY: Never include personal data (phone, email, contracts),
 * admin data, or revenue/Vistar data in any context sent to the AI.
 */

const CITY_NAMES = [
  'Berlin', 'Koeln', 'Köln', 'München', 'Muenchen',
  'Hamburg', 'Düsseldorf', 'Duesseldorf', 'Frankfurt',
  'Dortmund', 'Essen', 'Stuttgart', 'Bremen', 'Hannover',
  'Leipzig', 'Dresden', 'Nürnberg', 'Nuernberg', 'Bochum',
  'Wuppertal', 'Bielefeld', 'Bonn', 'Mannheim', 'Karlsruhe',
  'Augsburg', 'Wiesbaden', 'Mönchengladbach', 'Gelsenkirchen',
  'Aachen', 'Braunschweig', 'Kiel', 'Chemnitz', 'Halle',
  'Magdeburg', 'Freiburg', 'Krefeld', 'Mainz', 'Lübeck',
  'Erfurt', 'Rostock', 'Kassel', 'Hagen', 'Potsdam',
  'Saarbrücken', 'Oberhausen', 'Leverkusen', 'Oldenburg',
  'Osnabrück', 'Solingen', 'Heidelberg', 'Darmstadt',
  'Paderborn', 'Regensburg', 'Ingolstadt', 'Würzburg',
  'Wolfsburg', 'Ulm', 'Göttingen', 'Heilbronn', 'Reutlingen',
];

/* ─── City Aliases (common abbreviations → canonical name) ─── */
const CITY_ALIASES = {
  'ffm': 'Frankfurt', 'fra': 'Frankfurt', 'frankfurt am main': 'Frankfurt',
  'hh': 'Hamburg',
  'ber': 'Berlin', 'bln': 'Berlin',
  'muc': 'München', 'mü': 'München', 'muenchen': 'München',
  'cgn': 'Köln', 'koeln': 'Köln', 'cologne': 'Köln',
  'dus': 'Düsseldorf', 'duesseldorf': 'Düsseldorf', 'ddorf': 'Düsseldorf',
  'str': 'Stuttgart',
  'lei': 'Leipzig',
  'dor': 'Dortmund',
  'bre': 'Bremen',
  'han': 'Hannover',
  'dre': 'Dresden',
  'nue': 'Nürnberg', 'nuernberg': 'Nürnberg',
  'ess': 'Essen',
  'boc': 'Bochum',
  'bon': 'Bonn',
};

/**
 * Build a compact JSON context (~3-6KB) from the current dashboard data.
 * Sent with every chat message so the assistant knows the live state.
 *
 * INCLUDES: KPIs, city stats, hardware counts, trends, display performance,
 *           stammdaten summary, critical/offline display lists, performance deltas.
 * EXCLUDES: Revenue/Vistar data, personal contact info (phone, email, contracts),
 *           admin credentials, user management data, auth tokens.
 */
export function buildChatContext(rawData, kpis, comparisonData) {
  // ── Offline displays: top 15 worst offenders with details ──
  const offlineDisplays = (rawData?.displays || [])
    .filter(d => d.isActive && d.offlineHours != null && d.offlineHours > 3.5)
    .sort((a, b) => (b.offlineHours || 0) - (a.offlineHours || 0))
    .slice(0, 15)
    .map(d => ({
      id: d.displayId,
      location: d.locationName || 'Unbekannt',
      city: d.city,
      offlineH: Math.round(d.offlineHours * 10) / 10,
      status: d.status,
      lastSeen: d.lastSeen?.toISOString?.()?.substring(0, 16) || null,
      serialNumber: d.serialNumber || null,
    }));

  // ── Critical displays (status=critical or permanentOffline) ──
  const criticalDisplays = (rawData?.displays || [])
    .filter(d => d.isActive && (d.status === 'critical' || d.status === 'permanentOffline'))
    .slice(0, 20)
    .map(d => ({
      id: d.displayId,
      location: d.locationName || 'Unbekannt',
      city: d.city,
      status: d.status,
      offlineH: d.offlineHours != null ? Math.round(d.offlineHours * 10) / 10 : null,
      lastSeen: d.lastSeen?.toISOString?.()?.substring(0, 16) || null,
    }));

  // ── Warning displays (brief summary) ──
  const warningDisplays = (rawData?.displays || [])
    .filter(d => d.isActive && d.status === 'warning')
    .slice(0, 10)
    .map(d => ({
      id: d.displayId,
      location: d.locationName || 'Unbekannt',
      city: d.city,
      offlineH: d.offlineHours != null ? Math.round(d.offlineHours * 10) / 10 : null,
    }));

  // ── ALL active displays — compact list (id, location, city, status, offline hours) ──
  // Only include full list when context size allows; for large networks, use city aggregation
  const activeDisplays = (rawData?.displays || []).filter(d => d.isActive);
  let allDisplaysList;
  if (activeDisplays.length <= 150) {
    // Small enough to include full list
    allDisplaysList = activeDisplays.map(d => ({
      id: d.displayId,
      loc: d.locationName || 'Unbekannt',
      city: d.city,
      status: d.status,
      offH: d.offlineHours != null ? Math.round(d.offlineHours * 10) / 10 : null,
      sn: d.serialNumber || null,
    }));
  } else {
    // Large network: only include problematic displays + ID/location lookup via displayContext
    allDisplaysList = activeDisplays
      .filter(d => d.status !== 'online') // only non-online (warning, critical, permanentOffline)
      .map(d => ({
        id: d.displayId,
        loc: d.locationName || 'Unbekannt',
        city: d.city,
        status: d.status,
        offH: d.offlineHours != null ? Math.round(d.offlineHours * 10) / 10 : null,
        sn: d.serialNumber || null,
      }));
  }

  // ── City breakdown with full detail ──
  const cities = (rawData?.cityData || []).map(c => ({
    name: c.name,
    code: c.code,
    total: c.total,
    online: c.online,
    warning: c.warning || 0,
    critical: c.critical || 0,
    healthRate: c.healthRate != null ? Math.round(c.healthRate * 10) / 10 : null,
  }));

  // ── Stammdaten summary (counts only, NO personal data) ──
  const stammdatenSummary = {};
  if (comparisonData?.airtable?.allDisplayIds) {
    stammdatenSummary.totalLocations = comparisonData.airtable.allDisplayIds.size;
  }
  if (comparisonData?.airtable?.locationMap) {
    // Count by screen type (without personal details)
    const screenTypeCounts = {};
    for (const [, loc] of comparisonData.airtable.locationMap) {
      const type = loc.screenType || 'Unbekannt';
      screenTypeCounts[type] = (screenTypeCounts[type] || 0) + 1;
    }
    stammdatenSummary.screenTypes = screenTypeCounts;
  }

  // ── Status distribution ──
  const statusCounts = {};
  for (const d of (rawData?.displays || [])) {
    if (!d.isActive) continue;
    const s = d.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // ── Recently installed displays (last 30 days) ──
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentlyInstalled = (rawData?.displays || [])
    .filter(d => d.isActive && d.firstSeen && new Date(d.firstSeen) > thirtyDaysAgo)
    .map(d => ({
      id: d.displayId,
      location: d.locationName || 'Unbekannt',
      city: d.city,
      firstSeen: d.firstSeen?.toISOString?.()?.substring(0, 10) || null,
      status: d.status,
    }));

  // ── Task summary (from tasks prop, no personal data) ──
  const taskSummary = buildTaskSummary(rawData?.tasks);

  // ── Acquisition summary (pipeline stats only — NO personal data, contracts, provisions) ──
  const acquisitionSummary = buildAcquisitionSummary(rawData?.acquisition);

  // ── Rollout/Ops summary (from installationen + deinstalls tables) ──
  const rolloutSummary = buildRolloutSummary(rawData?.installationen, rawData?.deinstalls);

  // ── Pre-computed analytical insights ──
  const insights = buildPreComputedInsights(rawData, kpis, comparisonData, cities, offlineDisplays, taskSummary, acquisitionSummary);

  return {
    timestamp: new Date().toISOString(),
    overview: {
      totalDisplays: rawData?.displays?.length || 0,
      totalActive: kpis?.totalActive || 0,
      healthRate: kpis?.healthRate != null ? Math.round(kpis.healthRate * 10) / 10 : null,
      online: kpis?.onlineCount || 0,
      warning: kpis?.warningCount || 0,
      critical: kpis?.criticalCount || 0,
      permanentOffline: kpis?.permanentOfflineCount || 0,
      neverOnline: kpis?.neverOnlineCount || 0,
      newDisplays: kpis?.newlyInstalled || 0,
      deinstalled: kpis?.deinstalled || 0,
      avgOnline: kpis?.avgOnline || 0,
      avgTotal: kpis?.avgTotal || 0,
      snapshotDays: kpis?.snapshotCount || 0,
      statusDistribution: statusCounts,
    },
    performance: {
      healthRateTrend: kpis?.firstHealthRate != null ? {
        start: Math.round(kpis.firstHealthRate * 10) / 10,
        end: Math.round(kpis.healthRate * 10) / 10,
        change: Math.round((kpis.healthRate - kpis.firstHealthRate) * 10) / 10,
      } : null,
      avgWarning: kpis?.avgWarning || 0,
      avgCritical: kpis?.avgCritical || 0,
      avgPermanentOffline: kpis?.avgPermanentOffline || 0,
    },
    cities,
    offlineDisplays,
    criticalDisplays,
    warningDisplays,
    allDisplays: allDisplaysList,
    recentlyInstalled: recentlyInstalled.length > 0 ? recentlyInstalled : undefined,
    hardware: {
      opsCount: comparisonData?.opsData?.length || 0,
      simCount: comparisonData?.simData?.length || 0,
      bankLeasingCount: comparisonData?.bankLeasing?.records?.length || 0,
      chgCount: comparisonData?.chgApprovals?.records?.length || 0,
    },
    tasks: taskSummary,
    acquisition: acquisitionSummary,
    rollout: rolloutSummary,
    stammdaten: stammdatenSummary,
    recentTrend: (rawData?.trendData || []).slice(-7).map(d => ({
      date: d.date,
      healthRate: d.healthRate != null ? Math.round(d.healthRate * 10) / 10 : null,
      total: d.totalActive || d.total,
      online: d.totalOnline || d.online,
      warning: d.warningCount || 0,
      critical: d.criticalCount || 0,
      permanentOffline: d.permanentOfflineCount || 0,
    })),
    // Full daily trend for period comparisons (last 30 days)
    fullTrend: (rawData?.trendData || []).slice(-30).map(d => ({
      date: d.date,
      hr: d.healthRate != null ? Math.round(d.healthRate * 10) / 10 : null,
      t: d.totalActive || d.total,
      on: d.totalOnline || d.online,
      w: d.warningCount || 0,
      c: d.criticalCount || 0,
      po: d.permanentOfflineCount || 0,
    })),
    preComputedInsights: insights,
  };
}

/**
 * Pre-compute analytical insights from raw data.
 * These give the AI model ready-made analysis to build upon,
 * enabling CEO-level responses without heavy model reasoning.
 */
function buildPreComputedInsights(rawData, kpis, comparisonData, cities, offlineDisplays, taskSummary, acquisitionSummary) {
  const insights = {};

  // ── City Performance Ranking ──
  if (cities && cities.length > 0) {
    const ranked = [...cities].filter(c => c.total >= 3).sort((a, b) => (b.healthRate || 0) - (a.healthRate || 0));
    insights.cityRanking = {
      best: ranked.slice(0, 3).map(c => ({ name: c.name, healthRate: c.healthRate, total: c.total })),
      worst: ranked.slice(-3).reverse().map(c => ({ name: c.name, healthRate: c.healthRate, total: c.total, critical: c.critical })),
    };
    // Cities needing attention (low health or high critical)
    insights.citiesNeedingAttention = cities
      .filter(c => c.total >= 3 && (c.healthRate < 80 || c.critical >= 3))
      .map(c => ({ name: c.name, healthRate: c.healthRate, critical: c.critical, total: c.total }));
  }

  // ── Risk Displays (longest offline, most critical) ──
  const activeDisplays = (rawData?.displays || []).filter(d => d.isActive);
  const longOffline = activeDisplays.filter(d => d.offlineHours > 48).length;
  const veryLongOffline = activeDisplays.filter(d => d.offlineHours > 168).length; // >7 days
  insights.riskDisplays = {
    offline48hPlus: longOffline,
    offline7dPlus: veryLongOffline,
    offlineRatio: activeDisplays.length > 0
      ? Math.round(activeDisplays.filter(d => d.offlineHours > 3.5).length / activeDisplays.length * 1000) / 10 + '%'
      : '0%',
  };

  // ── Trend Direction (7-day) ──
  const trend = (rawData?.trendData || []).slice(-7);
  if (trend.length >= 2) {
    const first = trend[0];
    const last = trend[trend.length - 1];
    const hrFirst = first.healthRate ?? first.healthRatePercent ?? null;
    const hrLast = last.healthRate ?? last.healthRatePercent ?? null;
    if (hrFirst != null && hrLast != null) {
      const delta = Math.round((hrLast - hrFirst) * 10) / 10;
      insights.trendDirection = {
        healthRate7dChange: delta,
        direction: delta > 0.5 ? 'improving' : delta < -0.5 ? 'declining' : 'stable',
        startRate: Math.round(hrFirst * 10) / 10,
        endRate: Math.round(hrLast * 10) / 10,
      };
    }
  }

  // ── Task Health + Problem Analysis ──
  if (taskSummary) {
    const overdueRatio = taskSummary.open > 0
      ? Math.round(taskSummary.overdueCount / taskSummary.open * 100)
      : 0;
    insights.taskHealth = {
      openTotal: taskSummary.open,
      overdueCount: taskSummary.overdueCount,
      overdueRatio: overdueRatio + '%',
      urgentOrHigh: (taskSummary.byPriority?.High || 0) + (taskSummary.byPriority?.Urgent || 0),
      assessment: overdueRatio > 50 ? 'critical-backlog' : overdueRatio > 30 ? 'severe-backlog' : overdueRatio > 15 ? 'growing-backlog' : 'healthy',
      problemCategories: taskSummary.problemCategories || {},
      topLocationHotspots: (taskSummary.locationHotspots || []).slice(0, 5),
      worstPartners: (taskSummary.partnerPerformance || []).slice(0, 3),
      cityDistribution: (taskSummary.cityDistribution || []).slice(0, 5),
    };
  }

  // ── Pipeline Health ──
  if (acquisitionSummary) {
    const activeInPipeline = acquisitionSummary.total - (acquisitionSummary.stornoCount || 0);
    insights.pipelineHealth = {
      totalPipeline: acquisitionSummary.total,
      activePipeline: activeInPipeline,
      stornoRate: acquisitionSummary.total > 0
        ? Math.round(acquisitionSummary.stornoCount / acquisitionSummary.total * 1000) / 10 + '%'
        : '0%',
      readyForInstall: acquisitionSummary.readyForInstall,
      withContract: acquisitionSummary.withContract,
      last30DaysNew: acquisitionSummary.last30Days?.count || 0,
      last7DaysNew: acquisitionSummary.last7Days?.count || 0,
    };
  }

  // ── Network Growth ──
  if (kpis) {
    insights.networkGrowth = {
      newDisplays30d: kpis.newlyInstalled || 0,
      deinstalled30d: kpis.deinstalled || 0,
      netGrowth: (kpis.newlyInstalled || 0) - (kpis.deinstalled || 0),
      growthDirection: (kpis.newlyInstalled || 0) > (kpis.deinstalled || 0) ? 'growing' : (kpis.newlyInstalled || 0) < (kpis.deinstalled || 0) ? 'shrinking' : 'stable',
    };
  }

  return insights;
}

/**
 * Build comprehensive task summary for chat context.
 * INCLUDES: counts, partner breakdown, overdue tasks, ALL open tasks with FULL descriptions,
 *           pre-computed problem analysis (hotspots by location/partner/category).
 * EXCLUDES: personal data (emails), attachments.
 */
function buildTaskSummary(tasks) {
  if (!tasks || tasks.length === 0) return null;

  // Status counts
  const byStatus = {};
  const byPartner = {};
  const byPriority = {};
  const overdue = [];
  const allOpenTasks = [];

  // Problem analysis tracking
  const locationTaskCount = {};  // location → count
  const partnerTaskCount = {};   // partner → { total, overdue, categories }
  const problemCategories = {};  // category → count
  const cityTaskCount = {};      // city → { total, overdue }

  for (const t of tasks) {
    const s = t.status || 'Unbekannt';
    byStatus[s] = (byStatus[s] || 0) + 1;

    if (t.partner) {
      byPartner[t.partner] = (byPartner[t.partner] || 0) + 1;
    }

    const p = t.priority || 'Unbekannt';
    byPriority[p] = (byPriority[p] || 0) + 1;

    // Only analyze open tasks
    if (t.status !== 'Completed') {
      // ── Categorize problem type from title + description ──
      const textLower = ((t.title || '') + ' ' + (t.description || '')).toLowerCase();
      const category = categorizeTaskProblem(textLower);

      problemCategories[category] = (problemCategories[category] || 0) + 1;

      // ── Location hotspot tracking ──
      for (const loc of (t.locationNames || [])) {
        if (!loc) continue;
        if (!locationTaskCount[loc]) locationTaskCount[loc] = { total: 0, overdue: 0, categories: {} };
        locationTaskCount[loc].total++;
        if (t.overdue) locationTaskCount[loc].overdue++;
        locationTaskCount[loc].categories[category] = (locationTaskCount[loc].categories[category] || 0) + 1;
      }

      // ── Partner performance tracking ──
      if (t.partner) {
        if (!partnerTaskCount[t.partner]) partnerTaskCount[t.partner] = { total: 0, overdue: 0, categories: {} };
        partnerTaskCount[t.partner].total++;
        if (t.overdue) partnerTaskCount[t.partner].overdue++;
        partnerTaskCount[t.partner].categories[category] = (partnerTaskCount[t.partner].categories[category] || 0) + 1;
      }

      // ── City tracking (from first location or displayId) ──
      const taskCity = extractCityFromTask(t);
      if (taskCity) {
        if (!cityTaskCount[taskCity]) cityTaskCount[taskCity] = { total: 0, overdue: 0 };
        cityTaskCount[taskCity].total++;
        if (t.overdue) cityTaskCount[taskCity].overdue++;
      }

      // Overdue tasks
      if (t.overdue) {
        overdue.push({
          id: t.id,
          title: t.title?.substring(0, 100),
          partner: t.partner,
          priority: t.priority,
          dueDate: t.dueDate,
          status: t.status,
          category,
          locations: (t.locationNames || []).slice(0, 5),
          displayIds: (t.displayIds || []).slice(0, 5),
        });
      }

      // ALL open tasks with FULL description (no truncation limit)
      allOpenTasks.push({
        id: t.id,
        title: t.title || null,
        partner: t.partner,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        overdue: !!t.overdue,
        category,
        locations: (t.locationNames || []).slice(0, 5),
        displayIds: (t.displayIds || []).slice(0, 5),
        description: t.description || null,
      });
    }
  }

  const openCount = tasks.filter(t => t.status !== 'Completed').length;
  const completedCount = tasks.filter(t => t.status === 'Completed').length;

  // ── Build problem hotspots (top locations with most tasks) ──
  const locationHotspots = Object.entries(locationTaskCount)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15)
    .map(([loc, data]) => ({ location: loc, ...data }));

  // ── Build partner performance (sorted by overdue ratio) ──
  const partnerPerformance = Object.entries(partnerTaskCount)
    .filter(([, data]) => data.total >= 2)
    .sort((a, b) => (b[1].overdue / b[1].total) - (a[1].overdue / a[1].total))
    .slice(0, 10)
    .map(([name, data]) => ({
      partner: name,
      total: data.total,
      overdue: data.overdue,
      overdueRate: Math.round(data.overdue / data.total * 100) + '%',
      topCategory: Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    }));

  // ── City task distribution ──
  const cityDistribution = Object.entries(cityTaskCount)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([city, data]) => ({ city, ...data }));

  return {
    total: tasks.length,
    open: openCount,
    completed: completedCount,
    overdueCount: overdue.length,
    byStatus,
    byPartner,
    byPriority,
    // Problem analysis
    problemCategories,
    locationHotspots,
    partnerPerformance,
    cityDistribution,
    overdueTasks: overdue.slice(0, 20),
    allOpenTasks,
  };
}

/**
 * Categorize a task's problem type from its text content.
 * Returns a human-readable category string.
 */
function categorizeTaskProblem(textLower) {
  // Order matters — more specific patterns first
  if (/content|werbemittel|wm |wm-|creative|anzeige|motiv|bild|video|kampagne/.test(textLower)) return 'Content & Werbemittel';
  if (/offline|nicht online|kein signal|keine verbindung|heartbeat|disconnect/.test(textLower)) return 'Offline / Kein Signal';
  if (/install|montage|aufbau|lieferung|einbau|nachrüst/.test(textLower)) return 'Installation';
  if (/inspect|inspektion|check|prüf|qualität|follow.?up|nachkontrolle/.test(textLower)) return 'Inspektion / Follow-up';
  if (/strom|power|netzteil|kabel|elektr/.test(textLower)) return 'Stromversorgung';
  if (/temperatur|hitze|überhitz|cpu|lüfter|hardware|defekt|kaputt|display.?ausfall/.test(textLower)) return 'Hardware-Defekt';
  if (/position|umhäng|umpositionier|folie|fenster|mount|halterung|reposit/.test(textLower)) return 'Repositionierung';
  if (/deinstall|abbau|entfern|rückbau|storno/.test(textLower)) return 'Deinstallation';
  if (/akquise|lead|prospect|pipeline|neukunde/.test(textLower)) return 'Akquise';
  if (/vertrag|contract|unterschrift|genehmigung/.test(textLower)) return 'Vertrag / Genehmigung';
  return 'Sonstiges';
}

/**
 * Try to extract a city name from a task (via displayIds or locationNames).
 */
function extractCityFromTask(task) {
  // Try from displayId pattern: DO-GER-BER-... → BER → Berlin
  const CITY_CODE_MAP = {
    'BER': 'Berlin', 'KOE': 'Köln', 'MUE': 'München', 'HAM': 'Hamburg',
    'DUS': 'Düsseldorf', 'FRA': 'Frankfurt', 'DOR': 'Dortmund', 'ESS': 'Essen',
    'STU': 'Stuttgart', 'BRE': 'Bremen', 'HAN': 'Hannover', 'LEI': 'Leipzig',
    'DRE': 'Dresden', 'NUE': 'Nürnberg', 'BOC': 'Bochum', 'WUP': 'Wuppertal',
    'BON': 'Bonn', 'MAN': 'Mannheim', 'KAR': 'Karlsruhe', 'AUG': 'Augsburg',
    'AAC': 'Aachen', 'KIE': 'Kiel', 'ERF': 'Erfurt', 'ROS': 'Rostock',
    'KAS': 'Kassel', 'POT': 'Potsdam', 'OBE': 'Oberhausen',
  };

  for (const did of (task.displayIds || [])) {
    if (!did) continue;
    const parts = did.split('-');
    if (parts.length >= 3) {
      const code = parts[2];
      if (CITY_CODE_MAP[code]) return CITY_CODE_MAP[code];
    }
  }
  return null;
}

/**
 * Find tasks related to a specific display or location.
 * Uses multi-strategy matching: displayId, locationName, title, description, partner.
 * Also tries fuzzy partial matching for location names.
 */
export function findTasksForDisplay(query, tasks) {
  if (!query || !tasks || tasks.length === 0) return [];
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  // Split query into words for multi-word fuzzy matching
  const queryWords = q.split(/\s+/).filter(w => w.length >= 2);

  return tasks
    .filter(t => {
      if (t.status === 'Completed') return false;
      // Strategy 1: Match displayId
      const matchDisplay = (t.displayIds || []).some(id => id?.toLowerCase().includes(q));
      // Strategy 2: Match locationName (exact substring)
      const matchLocation = (t.locationNames || []).some(n => n?.toLowerCase().includes(q));
      // Strategy 3: Match title
      const matchTitle = t.title?.toLowerCase().includes(q);
      // Strategy 4: Match description
      const matchDescription = t.description?.toLowerCase().includes(q);
      // Strategy 5: Match partner name
      const matchPartner = t.partner?.toLowerCase().includes(q);
      // Strategy 6: Fuzzy — all query words appear somewhere in task text
      const taskText = [
        t.title, t.description, t.partner,
        ...(t.locationNames || []),
        ...(t.displayIds || []),
      ].filter(Boolean).join(' ').toLowerCase();
      const fuzzyMatch = queryWords.length > 0 && queryWords.every(w => taskText.includes(w));

      return matchDisplay || matchLocation || matchTitle || matchDescription || matchPartner || fuzzyMatch;
    })
    .slice(0, 15)
    .map(t => ({
      id: t.id,
      title: t.title,
      partner: t.partner,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      overdue: !!t.overdue,
      description: t.description?.substring(0, 150) || null,
      locations: t.locationNames?.slice(0, 5),
      displayIds: t.displayIds?.slice(0, 5),
    }));
}

/**
 * Build rollout/operations summary from installationen + deinstalls tables.
 * Provides temporal data the AI needs to answer questions like:
 * - "Wie viele wurden diese Woche aufgebaut?"
 * - "Wie viele Termine gab es?"
 * - "Wieso wurde abgebrochen?"
 * - "Welcher Integrator hat die meisten Installationen?"
 *
 * Each row in installationen = one installation attempt (successful or not).
 * Each row in deinstalls = one deinstallation event.
 */
function buildRolloutSummary(installationen, deinstalls) {
  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(now.getDate() - 90);

  // ── Installationen ──
  const installs = installationen || [];
  const totalInstalls = installs.length;

  // Parse dates and filter by time periods
  const withDate = installs.map(i => {
    const d = i.installDate ? new Date(i.installDate) : null;
    return { ...i, _date: d && !isNaN(d.getTime()) ? d : null };
  });

  const last7Installs = withDate.filter(i => i._date && i._date >= sevenDaysAgo);
  const last30Installs = withDate.filter(i => i._date && i._date >= thirtyDaysAgo);
  const last90Installs = withDate.filter(i => i._date && i._date >= ninetyDaysAgo);

  // Status breakdown (e.g. "Erfolgreich", "Abgebrochen", "Geplant" etc.)
  const byStatus = {};
  const byIntegrator = {};
  const byCity = {}; // from partner or display info
  const weeklyBreakdown = {}; // KW → count

  for (const i of withDate) {
    const s = i.status || 'Unbekannt';
    byStatus[s] = (byStatus[s] || 0) + 1;

    const integrator = i.integrator || i.partnerName || 'Unbekannt';
    if (!byIntegrator[integrator]) byIntegrator[integrator] = { total: 0, last30: 0 };
    byIntegrator[integrator].total++;
    if (i._date && i._date >= thirtyDaysAgo) byIntegrator[integrator].last30++;

    // Week number for weekly breakdown
    if (i._date) {
      const weekStart = new Date(i._date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      const kw = `KW${getISOWeek(weekStart)}`;
      weeklyBreakdown[kw] = (weeklyBreakdown[kw] || 0) + 1;
    }
  }

  // Last 7 days detail (for "diese Woche" questions)
  const last7Detail = last7Installs.map(i => ({
    date: i.installDate,
    status: i.status || 'Unbekannt',
    integrator: i.integrator || i.partnerName || '–',
    type: i.installationType || '–',
    displays: (i.displayIds || []).length,
  }));

  // Top integrators (sorted by total)
  const topIntegrators = Object.entries(byIntegrator)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, data]) => ({ name, ...data }));

  // Weekly trend (last 12 weeks)
  const weeklyTrend = Object.entries(weeklyBreakdown)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12);

  // ── Deinstallationen ──
  const deinstList = deinstalls || [];
  const totalDeinstalls = deinstList.length;

  const deinstWithDate = deinstList.map(d => {
    const dt = d.deinstallDate ? new Date(d.deinstallDate) : null;
    return { ...d, _date: dt && !isNaN(dt.getTime()) ? dt : null };
  });

  const last7Deinstalls = deinstWithDate.filter(d => d._date && d._date >= sevenDaysAgo);
  const last30Deinstalls = deinstWithDate.filter(d => d._date && d._date >= thirtyDaysAgo);

  // Deinstall reasons
  const deinstReasons = {};
  const deinstByCity = {};
  for (const d of deinstWithDate) {
    const reason = d.reason || 'Kein Grund';
    deinstReasons[reason] = (deinstReasons[reason] || 0) + 1;
    if (d.city) {
      deinstByCity[d.city] = (deinstByCity[d.city] || 0) + 1;
    }
  }

  // Last 7 days deinstalls detail
  const last7DeinstDetail = last7Deinstalls.map(d => ({
    date: d.deinstallDate,
    location: d.locationName || '–',
    city: d.city || '–',
    reason: d.reason || 'Kein Grund',
    status: d.status || '–',
  }));

  // Last 30 days reasons breakdown
  const last30DeinstReasons = {};
  for (const d of last30Deinstalls) {
    const reason = d.reason || 'Kein Grund';
    last30DeinstReasons[reason] = (last30DeinstReasons[reason] || 0) + 1;
  }

  return {
    hinweis: 'installationen = einzelne Installations-Termine/Versuche aus der Installationen-DB. deinstallationen = Abbau-Aufträge aus der Deinstallationen-DB. Jede Zeile = ein Termin.',
    installationen: {
      total: totalInstalls,
      letzte7Tage: last7Installs.length,
      letzte30Tage: last30Installs.length,
      letzte90Tage: last90Installs.length,
      byStatus,
      topIntegrators,
      weeklyTrend,
      letzte7Detail: last7Detail.length > 0 ? last7Detail : undefined,
    },
    deinstallationen: {
      total: totalDeinstalls,
      letzte7Tage: last7Deinstalls.length,
      letzte30Tage: last30Deinstalls.length,
      reasons: deinstReasons,
      letzte30TageReasons: Object.keys(last30DeinstReasons).length > 0 ? last30DeinstReasons : undefined,
      byCity: Object.keys(deinstByCity).length > 0 ? deinstByCity : undefined,
      letzte7Detail: last7DeinstDetail.length > 0 ? last7DeinstDetail : undefined,
    },
    // Net Rollout (last 30 days)
    nettoLetzten30Tage: last30Installs.length - last30Deinstalls.length,
  };
}

// Helper: ISO week number
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Build compact acquisition pipeline summary for chat context.
 * INCLUDES: Lead status counts, installation status, city distribution, storno stats.
 * Also includes time-based stats (last 7/30 days) so the AI can answer temporal questions.
 * EXCLUDES: Contact names, emails, phone numbers, contract details, provisions, partner commissions.
 */
function buildAcquisitionSummary(acquisition) {
  if (!acquisition || acquisition.length === 0) return null;

  const byLeadStatus = {};
  const byCity = {};
  const byCityDetail = {};  // NEW: per-city breakdown with signed/live/pipeline
  const byApprovalStatus = {};
  const byInstallStatus = {};
  let stornoCount = 0;
  let readyForInstall = 0;
  let withContract = 0;
  let gewonnenCount = 0;
  let abgerufenCount = 0;
  let pipelineCount = 0; // aktiv bearbeitete Leads (ohne New Leads, ohne Stornos)

  // Time-based tracking
  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  let last7Days = 0;
  let last30Days = 0;
  const last7ByStatus = {};
  const last30ByStatus = {};

  // Storno time tracking
  let stornoLast7 = 0;
  let stornoLast30 = 0;
  const stornoLast30Reasons = {};
  const stornoLast30ByCityArr = {};
  const stornoLast7Detail = [];

  // PLZ-level tracking (global overview)
  const plzGlobal = {};  // plz → { total, live, installed, storno, city }

  for (const a of acquisition) {
    // Lead status
    const ls = a.leadStatus || 'Unbekannt';
    byLeadStatus[ls] = (byLeadStatus[ls] || 0) + 1;

    const isCancelled = a.akquiseStorno || a.postInstallStorno;
    const isSigned = a.vertragVorhanden && a.vertragVorhanden !== 'false' && a.vertragVorhanden !== '';
    const isLive = ls === 'Live';
    // isInstalled: Live, Installation status, or installationsStatus with real values
    const isInstalled = isLive || ls === 'Installation' || (a.installationsStatus && a.installationsStatus.length > 0 &&
      a.installationsStatus.some(s => {
        const sl = (s || '').toLowerCase();
        return sl.includes('installiert') || sl.includes('abgerufen') || sl.includes('live');
      }));

    // Compute install timing (days from acquisitionDate to dvacWeek or when status became Live/Installation)
    const acqDate = a.acquisitionDate ? new Date(a.acquisitionDate) : null;
    const hasInstallTiming = acqDate && !isNaN(acqDate.getTime()) && isInstalled;

    // City + per-city detail
    for (const c of (a.city || [])) {
      if (!c) continue;
      byCity[c] = (byCity[c] || 0) + 1;

      // Per-city detailed stats
      if (!byCityDetail[c]) byCityDetail[c] = { total: 0, active: 0, pipeline: 0, signed: 0, live: 0, installed: 0, storno: 0, newLeads: 0, contacted: 0, approved: 0, readyForInstall: 0, inInstallation: 0, byStatus: {}, byPLZ: {}, _installDays: [] };
      const cd = byCityDetail[c];
      cd.total++;
      cd.byStatus[ls] = (cd.byStatus[ls] || 0) + 1;
      if (!isCancelled) {
        cd.active++;
        if (ls !== 'New Lead') cd.pipeline++; // Pipeline = aktiv bearbeitete Leads (ohne New Leads)
        if (isSigned) cd.signed++;
        if (isLive) cd.live++;
        if (isInstalled) cd.installed++;
        if (ls === 'New Lead') cd.newLeads++;
        if (ls === 'Contacted') cd.contacted++;
        if (ls === 'Approved') cd.approved++;
        if (ls === 'Ready for Install') cd.readyForInstall++;
        if (ls === 'Installation') cd.inInstallation++;
      } else {
        cd.storno++;
      }

      // PLZ breakdown within this city
      const plz = a.postalCode ? a.postalCode.trim() : '';
      if (plz) {
        if (!cd.byPLZ[plz]) cd.byPLZ[plz] = { total: 0, live: 0, installed: 0, storno: 0 };
        cd.byPLZ[plz].total++;
        if (isLive) cd.byPLZ[plz].live++;
        if (isInstalled && !isCancelled) cd.byPLZ[plz].installed++;
        if (isCancelled) cd.byPLZ[plz].storno++;

        // Global PLZ tracking
        if (!plzGlobal[plz]) plzGlobal[plz] = { total: 0, live: 0, installed: 0, storno: 0, city: c };
        plzGlobal[plz].total++;
        if (isLive) plzGlobal[plz].live++;
        if (isInstalled && !isCancelled) plzGlobal[plz].installed++;
        if (isCancelled) plzGlobal[plz].storno++;
      }

      // Install timing tracking (days from acquisition to now for installed leads)
      if (hasInstallTiming) {
        const daysSinceAcq = Math.round((now - acqDate) / (1000 * 60 * 60 * 24));
        cd._installDays.push(daysSinceAcq);
      }
    }

    // Approval status
    const as = a.approvalStatus || 'Unbekannt';
    byApprovalStatus[as] = (byApprovalStatus[as] || 0) + 1;

    // Installation status (can be array)
    const instArr = Array.isArray(a.installationsStatus) ? a.installationsStatus : (a.installationsStatus ? [a.installationsStatus] : []);
    for (const is of instArr) {
      if (is) byInstallStatus[is] = (byInstallStatus[is] || 0) + 1;
    }

    // Storno
    if (isCancelled) {
      stornoCount++;
      // Time-based storno tracking
      const stornoDate = a.submittedAt ? new Date(a.submittedAt) : (a.acquisitionDate ? new Date(a.acquisitionDate) : (a.createdAt ? new Date(a.createdAt) : null));
      if (stornoDate && !isNaN(stornoDate.getTime())) {
        if (stornoDate >= sevenDaysAgo) {
          stornoLast7++;
          stornoLast7Detail.push({
            location: a.locationName || a.akquiseId || '–',
            city: (a.city || []).join(', '),
            type: a.postInstallStorno ? 'Post-Install' : 'Akquise',
            reasons: (a.postInstallStornoGrund || []).join(', ') || (a.akquiseStorno ? 'Akquise-Storno' : '–'),
          });
        }
        if (stornoDate >= thirtyDaysAgo) {
          stornoLast30++;
          for (const reason of (a.postInstallStornoGrund || [])) {
            stornoLast30Reasons[reason] = (stornoLast30Reasons[reason] || 0) + 1;
          }
          if (a.akquiseStorno && (!a.postInstallStornoGrund || a.postInstallStornoGrund.length === 0)) {
            stornoLast30Reasons['Akquise-Storno (kein Grund)'] = (stornoLast30Reasons['Akquise-Storno (kein Grund)'] || 0) + 1;
          }
          for (const c of (a.city || [])) {
            if (c) stornoLast30ByCityArr[c] = (stornoLast30ByCityArr[c] || 0) + 1;
          }
        }
      }
    }

    // Pipeline = aktiv bearbeitete Leads (nicht New Lead, nicht storniert)
    if (!isCancelled && ls !== 'New Lead' && ls !== 'Unbekannt') pipelineCount++;

    // "Gewonnen" = Live status (successfully installed and running)
    if (isLive) gewonnenCount++;

    // "Abgerufen" = has installation and is actually live/deployed
    if (ls === 'Live' || ls === 'Installation') abgerufenCount++;

    // Ready for installation (only non-cancelled)
    if (a.readyForInstallation && !isCancelled) readyForInstall++;

    // Has contract (isSigned already checks vertragVorhanden correctly)
    if (isSigned && !isCancelled) withContract++;

    // Time-based stats (use createdAt as fallback for time-based counting)
    const timeDate = a.acquisitionDate ? new Date(a.acquisitionDate) : (a.createdAt ? new Date(a.createdAt) : null);
    if (timeDate && !isNaN(timeDate.getTime())) {
      if (timeDate >= sevenDaysAgo) {
        last7Days++;
        last7ByStatus[ls] = (last7ByStatus[ls] || 0) + 1;
      }
      if (timeDate >= thirtyDaysAgo) {
        last30Days++;
        last30ByStatus[ls] = (last30ByStatus[ls] || 0) + 1;
      }
    }
  }

  // Post-process byCityDetail: trim PLZ to top 10, compute installMetrics, remove temp data
  for (const [, cd] of Object.entries(byCityDetail)) {
    // Compute install metrics from collected timing data
    const days = cd._installDays || [];
    if (days.length > 0 && cd.pipeline > 0) {
      const avgDays = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
      cd.installMetrics = {
        installRate: Math.round(cd.installed / cd.pipeline * 1000) / 10 + '%',
        installRateBasis: 'pipeline (ohne New Leads)',
        avgDaysToInstall: avgDays,
        installedCount: cd.installed,
        pipelineCount: cd.pipeline,
      };
    }
    delete cd._installDays;

    // Trim byPLZ to top 10 by total count
    const plzEntries = Object.entries(cd.byPLZ);
    if (plzEntries.length > 10) {
      const top10 = plzEntries.sort((a, b) => b[1].total - a[1].total).slice(0, 10);
      cd.byPLZ = Object.fromEntries(top10);
    }
  }

  // Build global PLZ overview (top 20 PLZ across all cities)
  const byPLZOverview = Object.entries(plzGlobal)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 20)
    .map(([plz, data]) => ({ plz, ...data }));

  return {
    total: acquisition.length,
    hinweis: 'total = ALL-TIME Gesamtpool. pipeline = aktiv bearbeitete Leads OHNE New Leads (Contacted+Approved+ReadyForInstall+Installation+Live). newLeads = unbearbeitete Leads. Install-Rate wird auf pipeline berechnet, NICHT auf total. Für Pipeline-Fragen IMMER pipeline verwenden, NIEMALS total!',
    stornoCount,
    pipeline: pipelineCount,
    gewonnenLive: gewonnenCount,
    inInstallation: abgerufenCount - gewonnenCount,
    readyForInstall,
    withContract,
    byLeadStatus,
    byCity,
    byCityDetail,
    byPLZOverview,
    byApprovalStatus,
    byInstallStatus,
    // Time-based (neue Leads)
    last7Days: { count: last7Days, byLeadStatus: last7ByStatus },
    last30Days: { count: last30Days, byLeadStatus: last30ByStatus },
    // Time-based Stornos
    stornos: {
      gesamt: stornoCount,
      letzte7Tage: stornoLast7,
      letzte30Tage: stornoLast30,
      letzte30TageGruende: Object.keys(stornoLast30Reasons).length > 0 ? stornoLast30Reasons : undefined,
      letzte30TageByCity: Object.keys(stornoLast30ByCityArr).length > 0 ? stornoLast30ByCityArr : undefined,
      letzte7Detail: stornoLast7Detail.length > 0 ? stornoLast7Detail : undefined,
    },
  };
}

/**
 * Search displays by ID, name, serial number, city, or location name.
 * Returns max 8 matches with full operational fields + stammdaten.
 * Each field explicitly reports null when data is missing (so AI can tell user "keine Daten vorhanden").
 *
 * INCLUDES: Display status, offline hours, hardware info, stammdaten (screen type, JET ID, live since).
 * EXCLUDES: Revenue, personal contact info (phone, email), admin data.
 */
export function findDisplayContext(query, rawData, comparisonData) {
  if (!query || query.length < 2 || !rawData?.displays) return [];

  const q = query.toLowerCase();

  const matches = rawData.displays.filter(d =>
    d.displayId?.toLowerCase().includes(q) ||
    d.locationName?.toLowerCase().includes(q) ||
    d.serialNumber?.toLowerCase().includes(q) ||
    d.city?.toLowerCase().includes(q) ||
    d.displayName?.toLowerCase().includes(q)
  );

  return matches.slice(0, 8).map(d => {
    // Enrich with Airtable stammdaten (NO personal data: no phone, email)
    const airtableInfo = comparisonData?.airtable?.locationMap?.get(d.displayId);

    // Check OPS data for hardware info (no personal fields)
    const opsInfo = (comparisonData?.opsData || []).find(
      o => o.venueId === d.serialNumber || o.displayId === d.displayId
    );

    // Check SIM data
    const simInfo = (comparisonData?.simData || []).find(
      s => s.venueId === d.serialNumber || s.displayId === d.displayId
    );

    // Find acquisition data — try multiple matching strategies (NO personal contact data)
    let acqInfo = null;
    const acqRecords = rawData?.acquisition || [];

    // Strategy 1: Match by JET ID (most reliable)
    if (airtableInfo?.jetId) {
      acqInfo = acqRecords.find(a => a.jetId && a.jetId === airtableInfo.jetId);
    }

    // Strategy 2: Match by location name (fuzzy)
    if (!acqInfo) {
      const locLower = (d.locationName || '').toLowerCase().trim();
      if (locLower.length > 2) {
        acqInfo = acqRecords.find(a => {
          const acqLocLower = (a.locationName || '').toLowerCase().trim();
          if (!acqLocLower || acqLocLower.length < 2) return false;
          return locLower === acqLocLower ||
                 locLower.includes(acqLocLower) ||
                 acqLocLower.includes(locLower);
        });
      }
    }

    // Strategy 3: Match by akquiseId in displayId
    if (!acqInfo) {
      acqInfo = acqRecords.find(a => a.akquiseId && d.displayId && d.displayId.includes(a.akquiseId));
    }

    // Build address from stammdaten
    const addressParts = [airtableInfo?.street, airtableInfo?.streetNumber].filter(Boolean);
    const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : null;

    const result = {
      displayId: d.displayId,
      locationName: d.locationName || airtableInfo?.locationName || 'Unbekannt',
      city: d.city || airtableInfo?.city || null,
      status: d.status,
      isActive: d.isActive,
      offlineHours: d.offlineHours != null ? Math.round(d.offlineHours * 10) / 10 : null,
      lastSeen: d.lastSeen?.toISOString?.() || null,
      firstSeen: d.firstSeen?.toISOString?.() || null,
      serialNumber: d.serialNumber || null,
      // Stammdaten (operational only — no personal data)
      jetId: airtableInfo?.jetId || null,
      screenType: airtableInfo?.screenType || null,
      screenSize: airtableInfo?.screenSize || null,
      liveSince: airtableInfo?.liveSince || null,
      address: fullAddress,
      postalCode: airtableInfo?.postalCode || null,
      // Installation info — HINWEIS: integrator/installDate kommen aus der Installationen-Tabelle
      // und sind nur verfügbar wenn ein Installationsdatensatz existiert.
      // Wenn null: Keine Installationsdaten in der Datenbank hinterlegt.
      integrator: d.integrator || null,
      installDate: d.installDate || null,
      installRemarks: d.installRemarks || null,
      installDatenVorhanden: !!(d.integrator || d.installDate),
      // Hardware info (operational)
      hasOPS: !!opsInfo,
      opsNumber: opsInfo?.opsNumber || null,
      hasSIM: !!simInfo,
      simStatus: simInfo?.status || null,
      // Cross-reference IDs for account linking
      navoriVenueId: airtableInfo?.navoriVenueId || d.serialNumber || null,
    };

    // Add acquisition data if found (NO personal contact info)
    if (acqInfo) {
      result.akquiseDatenVorhanden = true;
      result.acquisition = {
        akquiseId: acqInfo.akquiseId || null,
        acquisitionPartner: acqInfo.acquisitionPartner || null,
        leadStatus: acqInfo.leadStatus || null,
        acquisitionDate: acqInfo.acquisitionDate || null,
        approvalStatus: acqInfo.approvalStatus || null,
        installationsStatus: acqInfo.installationsStatus || null,
        hindernisse: acqInfo.hindernisse || null,
        schaufenster: acqInfo.schaufenster || null,
        mountType: acqInfo.mountType || null,
        dvacWeek: acqInfo.dvacWeek || null,
        readyForInstallation: acqInfo.readyForInstallation || false,
        akquiseStorno: acqInfo.akquiseStorno || false,
        postInstallStorno: acqInfo.postInstallStorno || false,
        postInstallStornoGrund: acqInfo.postInstallStornoGrund || null,
        vertragVorhanden: acqInfo.vertragVorhanden || null,
        submittedBy: acqInfo.submittedBy || null,
        submittedAt: acqInfo.submittedAt || null,
        frequencyApproval: acqInfo.frequencyApproval || null,
        installApproval: acqInfo.installApproval || null,
      };
    } else {
      result.akquiseDatenVorhanden = false;
      result.acquisition = null;
    }

    return result;
  });
}

/**
 * Build cross-reference/account linking summary for a display.
 * Links display across: Navori (heartbeat), Airtable (stammdaten), Vistar (programmatic),
 * DAYN (screen), Bank-Leasing, CHG, Acquisition.
 */
export function buildAccountLinks(displayId, rawData, comparisonData) {
  if (!displayId) return null;

  const display = (rawData?.displays || []).find(d => d.displayId === displayId);
  if (!display) return null;

  const airtable = comparisonData?.airtable?.locationMap?.get(displayId);
  const serialNumber = display.serialNumber || airtable?.navoriVenueId || null;

  const links = {
    displayId,
    locationName: display.locationName || airtable?.locationName || null,
    // Navori (heartbeat system)
    navori: {
      linked: !!serialNumber,
      venueId: serialNumber,
    },
    // Airtable / Stammdaten
    airtable: {
      linked: !!airtable,
      jetId: airtable?.jetId || null,
      screenType: airtable?.screenType || null,
    },
    // Vistar (programmatic)
    vistar: {
      linked: false,
      venueId: null,
    },
    // DAYN screen
    dayn: {
      linked: false,
      screenId: null,
    },
    // Bank Leasing
    bankLeasing: {
      linked: false,
      assetId: null,
    },
    // CHG
    chg: {
      linked: false,
      assetId: null,
    },
    // Acquisition
    acquisition: {
      linked: false,
      akquiseId: null,
    },
  };

  // Vistar match
  const vistarVenue = (comparisonData?.vistarVenues || []).find(v =>
    v.partner_venue_id === serialNumber || v.name?.toLowerCase().includes((display.locationName || '').toLowerCase().slice(0, 10))
  );
  if (vistarVenue) {
    links.vistar = { linked: true, venueId: vistarVenue.partner_venue_id || vistarVenue.id };
  }

  // DAYN match
  const daynScreen = comparisonData?.dayn?.records?.find(d =>
    d.do_screen_id === displayId || d.dayn_screen_id === displayId
  );
  if (daynScreen) {
    links.dayn = { linked: true, screenId: daynScreen.dayn_screen_id || daynScreen.do_screen_id };
  }

  // Bank Leasing match
  const leasing = (comparisonData?.bankLeasing?.records || []).find(b =>
    b.serial_number === serialNumber
  );
  if (leasing) {
    links.bankLeasing = { linked: true, assetId: leasing.asset_id || null };
  }

  // CHG match
  const chg = (comparisonData?.chgApprovals?.records || []).find(c =>
    c.display_sn === serialNumber
  );
  if (chg) {
    links.chg = { linked: true, assetId: chg.asset_id || null };
  }

  // Acquisition match
  const acq = (rawData?.acquisition || []).find(a =>
    (a.jetId && airtable?.jetId && a.jetId === airtable.jetId) ||
    (a.locationName && display.locationName && a.locationName.toLowerCase().includes(display.locationName.toLowerCase().slice(0, 10)))
  );
  if (acq) {
    links.acquisition = { linked: true, akquiseId: acq.akquiseId || null };
  }

  // Summary
  const totalSystems = 7; // navori, airtable, vistar, dayn, bankLeasing, chg, acquisition
  const linkedCount = [links.navori, links.airtable, links.vistar, links.dayn, links.bankLeasing, links.chg, links.acquisition]
    .filter(s => s.linked).length;
  links.summary = { linkedSystems: linkedCount, totalSystems, completeness: Math.round(linkedCount / totalSystems * 100) + '%' };

  return links;
}

/**
 * Extract structured query terms from a user message.
 * Detects display IDs (DO-GER-*), city names, OPS numbers (ISS*),
 * and location/business name fragments for targeted searches.
 */
export function extractQueryTerms(message, rawData) {
  const terms = { displayQueries: [], cities: [], locationQueries: [], isSpecific: false };

  // Display ID patterns: DO-GER-BER-1234 or DO-GER-BER-WD-55-040-25
  const displayPattern = /DO-GER-[A-Z0-9-]{3,}/gi;
  const displayMatches = message.match(displayPattern);
  if (displayMatches) {
    terms.displayQueries.push(...displayMatches);
    terms.isSpecific = true;
  }

  // City names (exact match)
  for (const city of CITY_NAMES) {
    if (message.toLowerCase().includes(city.toLowerCase())) {
      terms.cities.push(city);
      terms.isSpecific = true;
    }
  }

  // City aliases (FFM→Frankfurt, HH→Hamburg, etc.)
  const msgWords = message.toLowerCase().split(/[\s,.:;!?()[\]{}]+/);
  for (const word of msgWords) {
    if (CITY_ALIASES[word] && !terms.cities.includes(CITY_ALIASES[word])) {
      terms.cities.push(CITY_ALIASES[word]);
      terms.isSpecific = true;
    }
  }

  // OPS numbers: ISS088...
  const opsPattern = /ISS\d{3}[A-Z0-9]+/gi;
  const opsMatches = message.match(opsPattern);
  if (opsMatches) {
    terms.displayQueries.push(...opsMatches);
    terms.isSpecific = true;
  }

  // JET IDs: JET-1234
  const jetIdPattern = /JET-\d{1,5}/gi;
  const jetIdMatches = message.match(jetIdPattern);
  if (jetIdMatches) {
    terms.displayQueries.push(...jetIdMatches);
    terms.isSpecific = true;
  }

  // Location name matching — check if any word(s) match a known location
  // Always try, even if already isSpecific (e.g., a city + location name)
  if (rawData?.displays) {
    const msgLower = message.toLowerCase();
    // Extract potential location keywords (3+ chars, not common words)
    const commonWords = new Set([
      // Deutsche Grundwörter
      'der', 'die', 'das', 'ein', 'eine', 'ist', 'wie', 'was', 'wir', 'und', 'oder',
      'bei', 'mit', 'von', 'zur', 'zum', 'den', 'dem', 'des', 'für', 'aus', 'nach',
      'über', 'gibt', 'gib', 'mir', 'mich', 'sich', 'sind', 'hat', 'haben', 'kann',
      'wird', 'wurde', 'war', 'noch', 'auch', 'aber', 'nicht', 'schon', 'sehr',
      'gerade', 'bitte', 'denn', 'dann', 'dort', 'hier', 'diese', 'dieser', 'dieses',
      'jetzt', 'immer', 'wenn', 'wann', 'warum', 'wieso', 'weil', 'doch', 'mal',
      'nur', 'kein', 'keine', 'keinen', 'mehr', 'viel', 'wenig', 'gut', 'schlecht',
      'groß', 'klein', 'lang', 'kurz', 'hoch', 'niedrig', 'alles', 'jede', 'jeder',
      'jedes', 'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'deren', 'dessen',
      'wer', 'wen', 'wem', 'dass', 'also', 'etwa', 'circa', 'rund', 'genau',
      // Dashboard/Business Begriffe (keine Standort-Suche auslösen)
      'display', 'displays', 'standort', 'standorte', 'status', 'online', 'offline',
      'task', 'tasks', 'offen', 'offene', 'offenen', 'alle', 'aktuell', 'aktuelle',
      'aktuellen', 'viele', 'welche', 'welcher', 'welches', 'neue', 'neuen', 'neuer',
      'health', 'rate', 'prozent', 'info', 'daten', 'zeige', 'zeig', 'sag', 'nenne',
      'liste', 'installiert', 'akquiriert', 'letzte', 'letzten', 'sieben', 'tage',
      'tagen', 'wochen', 'monat', 'monate', 'jahr', 'jahre', 'heute', 'gestern',
      'woche', 'installationen', 'installation', 'hardware', 'akquise', 'vertrag',
      'verträge', 'partner', 'integrator', 'datum', 'adresse', 'plz', 'stadt',
      'storno', 'stornos', 'pipeline', 'leads', 'lead', 'pool', 'total', 'anzahl',
      'briefing', 'report', 'übersicht', 'überblick', 'zusammenfassung', 'trend',
      'vergleich', 'wachstum', 'netzwerk', 'netto', 'brutto', 'rate', 'quote',
      'aufgebaut', 'abgebaut', 'abgebrochen', 'geplant', 'termine', 'termin',
      'deinstallation', 'deinstallationen', 'rollout', 'aufbau', 'abbau',
      'konversion', 'konversionsrate', 'performance', 'ranking', 'best', 'worst',
      'critical', 'warning', 'permanent', 'problem', 'probleme', 'grund', 'gründe',
      'kategorie', 'priorität', 'hoch', 'mittel', 'urgent', 'überfällig',
      'städte', 'stadt', 'region', 'gebiet', 'bereich', 'approval', 'approved',
      'contacted', 'ready', 'live', 'active', 'aktiv', 'aktive', 'inaktiv',
    ]);
    // Require 4+ chars for location matching to avoid false positives with short words
    const words = msgLower.split(/[\s,.:;!?()[\]{}]+/).filter(w => w.length >= 4 && !commonWords.has(w));

    // Also try 2-word combos for multi-word location names
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // Single word match
      const matchingDisplay = rawData.displays.find(d =>
        d.locationName?.toLowerCase().includes(word)
      );
      if (matchingDisplay && !terms.locationQueries.includes(word)) {
        terms.locationQueries.push(word);
        terms.isSpecific = true;
      }
      // Two-word combo (e.g., "souvlaki saranda")
      if (i < words.length - 1) {
        const combo = `${word} ${words[i + 1]}`;
        const comboMatch = rawData.displays.find(d =>
          d.locationName?.toLowerCase().includes(combo)
        );
        if (comboMatch && !terms.locationQueries.includes(combo)) {
          terms.locationQueries.push(combo);
          terms.isSpecific = true;
        }
      }
    }
  }

  return terms;
}
