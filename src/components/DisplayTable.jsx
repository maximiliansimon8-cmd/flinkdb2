import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, Filter, DollarSign, BarChart3, Eye, Database, Layers, AlertTriangle, CheckCircle2, RefreshCw, Shield } from 'lucide-react';
import {
  getStatusColor,
  getStatusLabel,
  formatDuration,
  formatDate,
  formatDateTime,
} from '../utils/dataProcessing';
import { hasPermission, isAdmin } from '../utils/authService';


function StatusBadge({ status }) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: color + '18', color, border: `1px solid ${color}33` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function VistarBadge({ matched, revenue }) {
  if (!matched) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-text-muted bg-surface-secondary/80 border border-border-secondary/40">
        –
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-violet-600 bg-violet-50/60 border border-violet-200/40">
      <DollarSign size={9} />
      {revenue != null ? `€${revenue.toFixed(2)}` : '✓'}
    </span>
  );
}

function fmtCompact(n) {
  if (n == null || n === 0) return '–';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString('de-DE');
}

export default function DisplayTable({ displays, onSelectDisplay, skipActiveFilter, vistarData, comparisonData }) {
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vistarFilter, setVistarFilter] = useState(''); // '', 'matched', 'unmatched'
  const [sortField, setSortField] = useState('offlineHours');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [masterListFilter, setMasterListFilter] = useState(''); // '', 'incomplete', 'complete'

  const hasVistar = vistarData && vistarData.size > 0;
  const canViewRevenue = hasPermission('view_revenue');

  // Build CHG/Bank leasing lookup sets from comparisonData
  const chgLookup = useMemo(() => {
    const bankSns = comparisonData?.bankLeasing?.serialNumbers || new Set();
    const chgSns = comparisonData?.chgApprovals?.displaySns || new Set();
    // Merge both sets — a display matches CHG if its serial number appears in either
    const combined = new Set([...bankSns, ...chgSns]);
    return combined;
  }, [comparisonData]);

  // Enrich displays with Vistar data + Airtable matching + CHG matching + geo data
  const geoLookup = comparisonData?.geoLookup;
  const enrichedDisplays = useMemo(() => {
    const airtableActiveIds = comparisonData?.airtable?.activeDisplayIds;
    // Helper: enrich a single display with screen data from geoLookup (geo + dayn fields + dvac impressions)
    const enrichWithScreenData = (d, normalizedSerial) => {
      const geo = geoLookup?.get(d.displayId) || geoLookup?.get(normalizedSerial) || null;
      return {
        // Geo
        geoAddress: geo?.address || null,
        geoCityLine: geo?.cityLine || null,
        geoLat: geo?.lat || null,
        geoLng: geo?.lng || null,
        // Screen specs
        venueType: geo?.venueType || null,
        floorCpm: geo?.floorCpm || null,
        screenWidthPx: geo?.screenWidthPx || null,
        screenHeightPx: geo?.screenHeightPx || null,
        screenType: geo?.screenType || null,
        screenInch: geo?.screenInch || null,
        maxVideoLength: geo?.maxVideoLength || null,
        minVideoLength: geo?.minVideoLength || null,
        staticDuration: geo?.staticDuration || null,
        staticSupported: geo?.staticSupported ?? null,
        videoSupported: geo?.videoSupported ?? null,
        // dVAC & Impressions (dvac × 6 spots per loop = impressions per display)
        dvacDay: geo?.dvacDay || null,
        dvacWeek: geo?.dvacWeek || null,
        dvacMonth: geo?.dvacMonth || null,
        impressionsPerSpot: geo?.impressionsPerSpot || null,
        impressionsDay: geo?.dvacDay ? Math.round(geo.dvacDay * 6) : null,
        impressionsWeek: geo?.dvacWeek ? Math.round(geo.dvacWeek * 6) : null,
        impressionsMonth: geo?.dvacMonth ? Math.round(geo.dvacMonth * 6) : null,
        // Meta
        installYear: geo?.installYear || null,
        region: geo?.region || null,
        daynScreenId: geo?.daynScreenId || null,
        screenStatus: geo?.screenStatus || null,
      };
    };

    if (!hasVistar) {
      // Still enrich with Airtable + CHG + screen data matching even without Vistar
      if (airtableActiveIds || chgLookup.size > 0 || geoLookup) {
        return displays.map((d) => {
          const normalizedSerial = d.serialNumber ? d.serialNumber.replace(/\s+/g, '') : '';
          return {
            ...d,
            airtableMatched: !!(d.displayId && airtableActiveIds && airtableActiveIds.has(d.displayId)),
            chgMatched: !!(normalizedSerial && chgLookup.has(normalizedSerial)) || !!(d.serialNumber && chgLookup.has(d.serialNumber)),
            ...enrichWithScreenData(d, normalizedSerial),
          };
        });
      }
      return displays;
    }
    let matched = 0, unmatched = 0;
    const result = displays.map((d) => {
      // Navori serialNumbers have spaces: "0131E - 6EAD5 - ..."
      // Vistar IDs don't: "0131E-6EAD5-..."
      // Normalize by removing spaces for matching
      const normalizedSerial = d.serialNumber ? d.serialNumber.replace(/\s+/g, '') : '';
      const vistar = vistarData.get(normalizedSerial)
        || vistarData.get(d.serialNumber)
        || vistarData.get(d.displayId)
        || null;
      if (vistar) matched++; else if (d.isActive) unmatched++;
      return {
        ...d,
        vistarMatched: !!vistar,
        vistarRevenue: vistar?.totalRevenue || 0,
        vistarImpressions: vistar?.totalImpressions || 0,
        vistarSpots: vistar?.totalSpots || 0,
        vistarECPM: vistar?.avgECPM || 0,
        airtableMatched: !!(airtableActiveIds && d.displayId && airtableActiveIds.has(d.displayId)),
        chgMatched: !!(normalizedSerial && chgLookup.has(normalizedSerial)) || !!(d.serialNumber && chgLookup.has(d.serialNumber)),
        ...enrichWithScreenData(d, normalizedSerial),
      };
    });
    console.log(`[DisplayTable] Vistar matching: ${matched} matched, ${unmatched} active unmatched. VistarMap keys: ${vistarData.size}`);
    return result;
  }, [displays, vistarData, hasVistar, comparisonData, chgLookup, geoLookup]);

  // Summary stats
  const vistarStats = useMemo(() => {
    if (!hasVistar) return null;
    const matched = enrichedDisplays.filter((d) => d.vistarMatched).length;
    const unmatched = enrichedDisplays.filter((d) => d.isActive && !d.vistarMatched).length;
    return { matched, unmatched, total: enrichedDisplays.length };
  }, [enrichedDisplays, hasVistar]);

  // ─── Data Source Comparison (loaded once in App.jsx, passed as props) ───
  const airtableData = comparisonData?.airtable || null;
  const daynScreensData = comparisonData?.dayn || null;
  const vistarVenues = comparisonData?.vistarVenues || null;

  // Cross-source matching analysis + detail lists
  const sourceComparison = useMemo(() => {
    if (!displays || displays.length === 0) return null;

    // Navori displays (from Google Sheet)
    const navoriDisplayIds = new Set();
    for (const d of displays) {
      if (d.displayId) navoriDisplayIds.add(d.displayId);
    }
    const activeDisplays = displays.filter(d => d.isActive);
    const inactiveDisplays = displays.filter(d => !d.isActive);

    // Airtable display IDs (active = not deinstalled)
    const airtableIds = airtableData?.activeDisplayIds || new Set();
    const airtableAllIds = airtableData?.allDisplayIds || new Set();
    const airtableDeinstalledCount = airtableData?.deinstalledIds?.size || 0;

    // Vistar: Build lookup sets from BOTH vistarVenues (DB) and vistarData (health Map)
    const vistarUniqueVenues = new Set();
    const vistarDisplayIds = new Set();
    // Primary: use vistarVenues from direct DB query (always available, not dependent on health data)
    const vistarLookupSet = new Set(); // all known Vistar keys for matching
    if (vistarVenues && vistarVenues.length > 0) {
      for (const v of vistarVenues) {
        if (v.id) { vistarUniqueVenues.add(v.id); vistarLookupSet.add(v.id); }
        if (v.partner_venue_id) vistarLookupSet.add(v.partner_venue_id);
        // Extract display ID from venue name (e.g. "DO-GER-BER-WD-55-362-25 | Name")
        if (v.name) {
          const namePart = v.name.split('|')[0]?.trim();
          if (namePart && namePart.match(/^[A-Z]{2}-/)) {
            vistarDisplayIds.add(namePart);
            vistarLookupSet.add(namePart);
          }
        }
      }
    }
    // Also add keys from vistarData (health-based Map) as secondary source
    if (vistarData && vistarData.size > 0) {
      vistarData.forEach((val) => {
        if (val.venueId) { vistarUniqueVenues.add(val.venueId); vistarLookupSet.add(val.venueId); }
        if (val.displayId) { vistarDisplayIds.add(val.displayId); vistarLookupSet.add(val.displayId); }
      });
    }

    // ─── Helper: check if a display is in Vistar ───
    const isInVistar = (d) => {
      if (vistarLookupSet.size === 0) return false;
      const normalizedSerial = d.serialNumber ? d.serialNumber.replace(/\s+/g, '') : '';
      return !!(vistarLookupSet.has(normalizedSerial) || vistarLookupSet.has(d.serialNumber) || vistarLookupSet.has(d.displayId));
    };

    // ─── Helper: check if a display is in Airtable ───
    const isInAirtable = (d) => d.displayId && airtableIds.has(d.displayId);

    // Match analysis per ACTIVE Navori displays only (not deinstalled)
    let inAll3 = 0, inNavoriAndVistar = 0, inNavoriAndAirtable = 0, onlyNavori = 0;
    const detailAll3 = [], detailNavoriVistar = [], detailNavoriAirtable = [], detailOnlyNavori = [];

    for (const d of activeDisplays) {
      if (!d.displayId) continue;
      const inAt = isInAirtable(d);
      const inVi = isInVistar(d);

      const entry = { displayId: d.displayId, locationName: d.displayName || d.locationName || '', city: d.cityCode, serialNumber: d.serialNumber || '' };
      if (inAt && inVi) { inAll3++; detailAll3.push(entry); }
      else if (!inAt && inVi) { inNavoriAndVistar++; detailNavoriVistar.push(entry); }
      else if (inAt && !inVi) { inNavoriAndAirtable++; detailNavoriAirtable.push(entry); }
      else { onlyNavori++; detailOnlyNavori.push(entry); }
    }

    // Airtable IDs not in Navori
    const detailAirtableOnly = [];
    for (const aid of airtableIds) {
      if (!navoriDisplayIds.has(aid)) {
        const loc = airtableData?.locationMap?.get(aid);
        const isDeinstalled = loc?.status && /deinstall/i.test(loc.status);
        detailAirtableOnly.push({
          displayId: aid,
          locationName: loc?.locationName || '',
          city: loc?.city || '',
          airtableStatus: loc?.status || '–',
          deinstallDate: loc?.deinstallDate || '',
          liveSince: loc?.liveSince || '',
          isDeinstalled,
        });
      }
    }
    // Sort: deinstalled ones at the bottom
    detailAirtableOnly.sort((a, b) => {
      if (a.isDeinstalled !== b.isDeinstalled) return a.isDeinstalled ? 1 : -1;
      return a.displayId.localeCompare(b.displayId);
    });

    // Count JET (DO-) vs Dayn (DM-) display IDs in Vistar
    let vistarJetCount = 0, vistarDaynCount = 0;
    for (const did of vistarDisplayIds) {
      if (did.startsWith('DO-')) vistarJetCount++;
      else if (did.startsWith('DM-')) vistarDaynCount++;
    }

    // ─── Navori Live ↔ Vistar Matching Detail (JET Network) ───
    // Build reverse lookup: key → vistar venue info
    const vistarReverseLookup = new Map(); // key → { venueId, name, doId, matchedVia }
    if (vistarVenues && vistarVenues.length > 0) {
      for (const v of vistarVenues) {
        const namePart = v.name ? v.name.split('|')[0]?.trim() : '';
        const isJet = namePart.startsWith('DO-');
        if (!isJet) continue; // Only JET venues for this check
        const info = { venueId: v.id, partnerVenueId: v.partner_venue_id || '', name: v.name || '', doId: namePart };
        if (v.id) vistarReverseLookup.set(v.id, { ...info, matchedVia: 'venue_id' });
        if (v.partner_venue_id) vistarReverseLookup.set(v.partner_venue_id, { ...info, matchedVia: 'partner_venue_id' });
        if (namePart) vistarReverseLookup.set(namePart, { ...info, matchedVia: 'do_id' });
      }
    }

    // Collect all JET venues from Vistar (DO- prefix) for bidirectional matching
    const vistarJetVenues = new Map(); // doId → venue info
    if (vistarVenues && vistarVenues.length > 0) {
      for (const v of vistarVenues) {
        const namePart = v.name ? v.name.split('|')[0]?.trim() : '';
        if (namePart.startsWith('DO-')) {
          vistarJetVenues.set(namePart, {
            venueId: v.id, partnerVenueId: v.partner_venue_id || '',
            name: v.name || '', doId: namePart,
            venueName: v.name ? (v.name.split('|')[1] || '').trim() : '',
            city: v.city || '',
          });
        }
      }
    }

    const navoriVistarJetDetail = [];
    let navoriVistarJetMatched = 0, navoriVistarJetUnmatched = 0;
    const matchedVistarDoIds = new Set(); // track which Vistar venues got matched

    for (const d of activeDisplays) {
      if (!d.displayId) continue;
      const normalizedSerial = d.serialNumber ? d.serialNumber.replace(/\s+/g, '') : '';
      // Try matching via different keys
      let matchInfo = vistarReverseLookup.get(normalizedSerial)
        || vistarReverseLookup.get(d.serialNumber)
        || vistarReverseLookup.get(d.displayId)
        || null;
      // Also check vistarData Map for health-based matches
      if (!matchInfo && vistarData) {
        const healthMatch = vistarData.get(normalizedSerial) || vistarData.get(d.serialNumber) || vistarData.get(d.displayId);
        if (healthMatch) {
          matchInfo = { venueId: healthMatch.venueId || '', partnerVenueId: '', name: healthMatch.venueName || '', doId: healthMatch.displayId || '', matchedVia: 'health_data' };
        }
      }

      const isMatched = !!matchInfo;
      if (isMatched) {
        navoriVistarJetMatched++;
        if (matchInfo.doId) matchedVistarDoIds.add(matchInfo.doId);
      } else {
        navoriVistarJetUnmatched++;
      }

      navoriVistarJetDetail.push({
        displayId: d.displayId || '',
        locationName: d.displayName || d.locationName || '',
        city: d.cityCode || '',
        serialNumber: d.serialNumber || '',
        vistarDoId: matchInfo?.doId || '',
        vistarVenueName: matchInfo?.name ? (matchInfo.name.split('|')[1] || '').trim() : '',
        source: isMatched ? 'both' : 'navori_only',
      });
    }

    // Find Vistar JET venues NOT matched to any Navori display
    let vistarJetOnlyCount = 0;
    for (const [doId, vInfo] of vistarJetVenues) {
      if (!matchedVistarDoIds.has(doId)) {
        vistarJetOnlyCount++;
        navoriVistarJetDetail.push({
          displayId: doId,
          locationName: vInfo.venueName || '',
          city: vInfo.city || '',
          serialNumber: '',
          vistarDoId: doId,
          vistarVenueName: vInfo.venueName || '',
          source: 'vistar_only',
        });
      }
    }

    // Sort: navori_only first (problem!), then vistar_only, then matched
    const sourceOrder = { navori_only: 0, vistar_only: 1, both: 2 };
    navoriVistarJetDetail.sort((a, b) => {
      const oa = sourceOrder[a.source] ?? 9;
      const ob = sourceOrder[b.source] ?? 9;
      if (oa !== ob) return oa - ob;
      return a.displayId.localeCompare(b.displayId);
    });

    // ─── Dayn Screens ↔ Vistar Matching ───
    // Build Dayn reverse lookup from Vistar venues with DM- prefix
    const vistarDaynLookup = new Map();
    if (vistarVenues && vistarVenues.length > 0) {
      for (const v of vistarVenues) {
        const namePart = v.name ? v.name.split('|')[0]?.trim() : '';
        const isDayn = namePart.startsWith('DM-');
        if (!isDayn) continue;
        const info = { venueId: v.id, partnerVenueId: v.partner_venue_id || '', name: v.name || '', dmId: namePart };
        if (v.id) vistarDaynLookup.set(v.id, { ...info, matchedVia: 'venue_id' });
        if (v.partner_venue_id) vistarDaynLookup.set(v.partner_venue_id, { ...info, matchedVia: 'partner_venue_id' });
        if (namePart) vistarDaynLookup.set(namePart, { ...info, matchedVia: 'dm_id' });
      }
    }

    const daynVistarDetail = [];
    let daynVistarMatched = 0, daynVistarUnmatched = 0, daynOfflineCount = 0;
    if (daynScreensData?.records) {
      for (const d of daynScreensData.records) {
        const screenId = d.dayn_screen_id || d.do_screen_id || '';
        if (!screenId) continue;
        const isOnline = d.screen_status && /online/i.test(d.screen_status);
        // Try matching via screen ID
        const matchInfo = vistarDaynLookup.get(screenId) || null;
        // Only count online screens in the matching stats
        if (isOnline) {
          if (matchInfo) daynVistarMatched++;
          else daynVistarUnmatched++;
        } else {
          daynOfflineCount++;
        }

        daynVistarDetail.push({
          screenId,
          doScreenId: d.do_screen_id || '',
          locationName: d.location_name || '',
          city: d.city || '',
          status: d.screen_status || '',
          isOnline,
          vistarVenueId: matchInfo?.venueId || '',
          vistarDmId: matchInfo?.dmId || '',
          vistarName: matchInfo?.name ? (matchInfo.name.split('|')[1] || '').trim() : '',
          matchedVia: matchInfo?.matchedVia || '',
          matched: matchInfo ? '✓' : '✗',
        });
      }
    }
    // Also add vistarVenueName to dayn details
    for (const d of daynVistarDetail) {
      if (!d.vistarVenueName) {
        d.vistarVenueName = d.vistarName || '';
      }
    }
    daynVistarDetail.sort((a, b) => {
      // Online first, offline last
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      if (a.matched !== b.matched) return a.matched === '✗' ? -1 : 1;
      return a.screenId.localeCompare(b.screenId);
    });

    // ─── Master List: ALL unique display IDs across all sources ───
    const masterMap = new Map(); // displayId → { navori, airtable, vistar, chg info }
    // 1. Add all Navori displays
    for (const d of displays) {
      if (!d.displayId) continue;
      const normalizedSerial = d.serialNumber ? d.serialNumber.replace(/\s+/g, '') : '';
      const hasChg = !!(normalizedSerial && chgLookup.has(normalizedSerial)) || !!(d.serialNumber && chgLookup.has(d.serialNumber));
      masterMap.set(d.displayId, {
        displayId: d.displayId,
        locationName: d.displayName || d.locationName || '',
        city: d.cityCode || '',
        navoriStatus: d.isActive ? 'Aktiv' : 'Inaktiv',
        airtableStatus: '',
        inVistar: '',
        inNavori: '✓',
        inAirtable: '–',
        inChg: hasChg ? '✓' : '–',
        network: d.displayId.startsWith('DM-') ? 'Dayn' : 'Flink',
        isActiveDisplay: d.isActive,
      });
    }
    // 2. Add/merge Airtable displays
    if (airtableData?.allDisplayIds) {
      for (const did of airtableData.allDisplayIds) {
        const loc = airtableData.locationMap?.get(did);
        const atStatus = loc?.status || (airtableData.activeDisplayIds?.has(did) ? 'Live' : 'Deinstalliert');
        const isAtActive = airtableData.activeDisplayIds?.has(did);
        if (masterMap.has(did)) {
          const existing = masterMap.get(did);
          existing.airtableStatus = atStatus;
          existing.inAirtable = '✓';
          if (!existing.locationName && loc?.locationName) existing.locationName = loc.locationName;
          if (!existing.city && loc?.city) existing.city = loc.city;
        } else {
          masterMap.set(did, {
            displayId: did,
            locationName: loc?.locationName || '',
            city: loc?.city || '',
            navoriStatus: '–',
            airtableStatus: atStatus,
            inVistar: '',
            inNavori: '–',
            inAirtable: '✓',
            inChg: '–',
            network: did.startsWith('DM-') ? 'Dayn' : 'Flink',
            isActiveDisplay: isAtActive && !/deinstall/i.test(atStatus),
          });
        }
      }
    }
    // 2b. Add/merge Dayn screens from dayn_screens table
    if (daynScreensData?.records) {
      for (const d of daynScreensData.records) {
        const screenId = d.dayn_screen_id || d.do_screen_id || '';
        if (!screenId) continue;
        const isOnline = d.screen_status && /online/i.test(d.screen_status);
        const daynStatus = d.screen_status || '–';
        if (masterMap.has(screenId)) {
          // Merge: update airtableStatus with Dayn screen status
          const existing = masterMap.get(screenId);
          if (!existing.airtableStatus) existing.airtableStatus = daynStatus;
          if (!existing.locationName && d.location_name) existing.locationName = d.location_name;
          if (!existing.city && d.city) existing.city = d.city;
          existing.network = 'Dayn';
        } else {
          masterMap.set(screenId, {
            displayId: screenId,
            locationName: d.location_name || '',
            city: d.city || '',
            navoriStatus: '–',
            airtableStatus: daynStatus,
            inVistar: '',
            inNavori: '–',
            inAirtable: '✓',
            inChg: '–',
            network: 'Dayn',
            isActiveDisplay: isOnline,
          });
        }
      }
    }

    // 3. Mark Vistar presence
    for (const [did, entry] of masterMap) {
      const normalizedDid = did.replace(/\s+/g, '');
      const inV = vistarLookupSet.has(did) || vistarLookupSet.has(normalizedDid);
      entry.inVistar = inV ? '✓' : '–';
    }

    // ─── Platform Completeness for active displays ───
    let completeCount = 0;
    let activeInMaster = 0;
    let chgMatchedCount = 0;
    for (const [, entry] of masterMap) {
      // Determine if this is an "active" display (not deinstalled)
      const isActive = entry.isActiveDisplay !== false && !/deinstall/i.test(entry.airtableStatus);
      entry.isActiveDisplay = isActive;
      entry.platformComplete = entry.inNavori === '✓' && entry.inAirtable === '✓' && entry.inVistar === '✓';
      if (isActive) {
        activeInMaster++;
        if (entry.platformComplete) completeCount++;
        if (entry.inChg === '✓') chgMatchedCount++;
      }
    }

    const masterList = Array.from(masterMap.values());
    masterList.sort((a, b) => {
      // Sort by network (JET first), then by navori status (aktiv first), then ID
      if (a.network !== b.network) return a.network === 'Flink' ? -1 : 1;
      const statusOrder = { 'Aktiv': 0, 'Inaktiv': 1, '–': 2 };
      const sa = statusOrder[a.navoriStatus] ?? 9;
      const sb = statusOrder[b.navoriStatus] ?? 9;
      if (sa !== sb) return sa - sb;
      return a.displayId.localeCompare(b.displayId);
    });

    // Count active vs deinstalled per source for the overview table
    const navoriActiveJet = activeDisplays.filter(d => !d.displayId?.startsWith('DM-')).length;
    const navoriInactiveCount = inactiveDisplays.length;

    // Airtable active vs deinstalled
    const airtableActiveCount = airtableIds.size;

    // Count active JET displays in master
    const masterActiveJet = masterList.filter(d => d.network === 'Flink' && d.isActiveDisplay).length;
    const masterActiveDayn = masterList.filter(d => d.network === 'Dayn' && d.isActiveDisplay).length;
    const masterActiveTotal = masterActiveJet + masterActiveDayn;
    const masterDeinstalledTotal = masterList.length - masterActiveTotal;

    return {
      navori: { total: displays.length, active: activeDisplays.length, deinstalled: inactiveDisplays.length, uniqueIds: navoriDisplayIds.size },
      airtable: {
        locations: airtableData?.locations || 0,
        displayIds: airtableIds.size,
        allIds: airtableAllIds.size,
        deinstalled: airtableDeinstalledCount,
        daynTotal: daynScreensData?.total || 0,
        daynOnline: daynScreensData?.activeIds?.size || 0,
      },
      vistar: { dbTotal: vistarVenues?.length || 0, uniqueInData: vistarUniqueVenues.size, withDisplayId: vistarDisplayIds.size, jetCount: vistarJetCount, daynCount: vistarDaynCount },
      vistarLookupSet,
      overlap: { inAll3, inNavoriAndVistar, inNavoriAndAirtable, onlyNavori, airtableOnly: detailAirtableOnly.length },
      navoriVistarJet: { matched: navoriVistarJetMatched, navoriOnly: navoriVistarJetUnmatched, vistarOnly: vistarJetOnlyCount, navoriTotal: activeDisplays.length, vistarJetTotal: vistarJetVenues.size },
      daynVistar: { matched: daynVistarMatched, unmatched: daynVistarUnmatched, offline: daynOfflineCount, total: daynScreensData?.total || 0, online: daynScreensData?.activeIds?.size || 0 },
      master: {
        total: masterMap.size, jetCount: masterList.filter(d => d.network === 'Flink').length, daynCount: masterList.filter(d => d.network === 'Dayn').length,
        activeTotal: masterActiveTotal, activeJet: masterActiveJet, activeDayn: masterActiveDayn, deinstalledTotal: masterDeinstalledTotal,
      },
      completeness: { complete: completeCount, activeTotal: activeInMaster },
      chg: { total: chgLookup.size, matchedActive: chgMatchedCount },
      details: { all3: detailAll3, navoriVistar: detailNavoriVistar, navoriAirtable: detailNavoriAirtable, onlyNavori: detailOnlyNavori, airtableOnly: detailAirtableOnly, navoriVistarJetDetail, daynVistarDetail, masterList },
    };
  }, [displays, airtableData, daynScreensData, vistarData, vistarVenues, chgLookup]);

  // Which source detail to show (null = none, 'navori', 'airtable', 'vistar', 'all3', 'onlyNavori', etc.)
  const [activeSourceTab, setActiveSourceTab] = useState(null);
  const [showSourceDetail, setShowSourceDetail] = useState(false);
  const [detailSortField, setDetailSortField] = useState(null);
  const [detailSortDir, setDetailSortDir] = useState('asc');

  // Reset detail sort when tab changes
  React.useEffect(() => { setDetailSortField(null); setDetailSortDir('asc'); }, [activeSourceTab]);

  // Derive unique cities and statuses
  const cities = useMemo(() => {
    const base = skipActiveFilter ? enrichedDisplays : enrichedDisplays.filter((d) => d.isActive);
    const citySet = new Set(base.map((d) => d.cityCode));
    return Array.from(citySet).sort();
  }, [enrichedDisplays, skipActiveFilter]);

  const statuses = useMemo(() => {
    const base = skipActiveFilter ? enrichedDisplays : enrichedDisplays.filter((d) => d.isActive);
    const statusSet = new Set(base.map((d) => d.status));
    const order = ['online', 'warning', 'critical', 'permanent_offline', 'never_online'];
    return order.filter((s) => statusSet.has(s));
  }, [enrichedDisplays, skipActiveFilter]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = skipActiveFilter ? [...enrichedDisplays] : enrichedDisplays.filter((d) => d.isActive);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.displayId.toLowerCase().includes(q) ||
          (d.displayName || '').toLowerCase().includes(q) ||
          d.locationName.toLowerCase().includes(q) ||
          (d.serialNumber || '').toLowerCase().includes(q) ||
          (d.geoAddress || '').toLowerCase().includes(q) ||
          (d.geoCityLine || '').toLowerCase().includes(q)
      );
    }

    if (cityFilter) {
      result = result.filter((d) => d.cityCode === cityFilter);
    }

    if (statusFilter) {
      result = result.filter((d) => d.status === statusFilter);
    }

    if (vistarFilter === 'matched') {
      result = result.filter((d) => d.vistarMatched);
    } else if (vistarFilter === 'unmatched') {
      result = result.filter((d) => !d.vistarMatched);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (aVal == null) aVal = sortDir === 'desc' ? -Infinity : Infinity;
      if (bVal == null) bVal = sortDir === 'desc' ? -Infinity : Infinity;
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal instanceof Date) aVal = aVal.getTime();
      if (bVal instanceof Date) bVal = bVal.getTime();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [enrichedDisplays, search, cityFilter, statusFilter, vistarFilter, sortField, sortDir, skipActiveFilter]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'offlineHours' || field === 'vistarRevenue' || field === 'vistarImpressions' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-20" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} className="text-[#007AFF]" />
    ) : (
      <ChevronDown size={12} className="text-[#007AFF]" />
    );
  };

  const getRowBg = (status) => {
    switch (status) {
      case 'permanent_offline': return 'bg-status-offline/10/80 hover:bg-status-offline/10/60';
      case 'critical': return 'bg-status-offline/10/60 hover:bg-status-offline/10/40';
      case 'warning': return 'bg-status-warning/10/60 hover:bg-status-warning/10/40';
      case 'never_online': return 'bg-surface-secondary/40 hover:bg-surface-secondary/60';
      default: return 'hover:bg-surface-secondary';
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Data Source Comparison Tiles (Admin only) ─── */}
      {isAdmin() && sourceComparison && (
        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-text-muted" />
              <h3 className="text-sm font-medium text-text-secondary">
                Datenquellen-Vergleich
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveSourceTab(activeSourceTab === 'masterList' ? null : 'masterList')}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${activeSourceTab === 'masterList' ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]' : 'text-text-muted hover:text-text-primary bg-surface-secondary/60 border-border-secondary/40'}`}
              >
                Alle Displays ({sourceComparison.master.total})
              </button>
              {activeSourceTab && (
                <button
                  onClick={() => setActiveSourceTab(null)}
                  className="text-xs text-status-offline hover:text-status-offline transition-colors px-2 py-0.5 rounded bg-status-offline/10/60 border border-status-offline/20/40"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ─── Network Overview Table ─── */}
          <div className="overflow-x-auto rounded-lg border border-border-secondary/40">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary/80">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-text-muted uppercase">Quelle</th>
                  <th className="text-center px-3 py-2 text-xs text-accent uppercase">JET</th>
                  <th className="text-center px-3 py-2 text-xs text-status-warning uppercase">Dayn</th>
                  <th className="text-center px-3 py-2 text-xs text-text-muted uppercase">Aktiv</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border-secondary/60 hover:bg-accent-light/20 cursor-pointer" onClick={() => setActiveSourceTab(activeSourceTab === 'navori' ? null : 'navori')}>
                  <td className="px-3 py-2 font-medium text-blue-700 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-accent"></div>Navori</td>
                  <td className="px-3 py-2 text-center font-bold text-blue-700">{sourceComparison.navori.active}</td>
                  <td className="px-3 py-2 text-center text-text-muted">–</td>
                  <td className="px-3 py-2 text-center font-bold">{sourceComparison.navori.active}</td>
                </tr>
                <tr className="border-t border-border-secondary/60 hover:bg-emerald-50/20 cursor-pointer" onClick={() => setActiveSourceTab(activeSourceTab === 'airtable' ? null : 'airtable')}>
                  <td className="px-3 py-2 font-medium text-emerald-700 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Airtable</td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-bold text-emerald-700">{sourceComparison.airtable.displayIds}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {sourceComparison.airtable.daynTotal > 0 ? (
                      <span className="font-bold text-status-warning">{sourceComparison.airtable.daynOnline}</span>
                    ) : <span className="text-text-muted">–</span>}
                  </td>
                  <td className="px-3 py-2 text-center font-bold">{sourceComparison.airtable.displayIds + sourceComparison.airtable.daynOnline}</td>
                </tr>
                <tr className="border-t border-border-secondary/60 hover:bg-violet-50/20 cursor-pointer" onClick={() => setActiveSourceTab(activeSourceTab === 'vistar' ? null : 'vistar')}>
                  <td className="px-3 py-2 font-medium text-violet-700 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-violet-500"></div>Vistar</td>
                  <td className="px-3 py-2 text-center font-bold text-violet-700">{sourceComparison.vistar.jetCount}</td>
                  <td className="px-3 py-2 text-center font-bold text-status-warning">{sourceComparison.vistar.daynCount}</td>
                  <td className="px-3 py-2 text-center font-bold">{sourceComparison.vistar.dbTotal}</td>
                </tr>
                {sourceComparison.chg && sourceComparison.chg.total > 0 && (
                  <tr className="border-t border-border-secondary/60 hover:bg-status-warning/10/20">
                    <td className="px-3 py-2 font-medium text-status-warning flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-status-warning"></div>CHG/Bank</td>
                    <td className="px-3 py-2 text-center font-bold text-status-warning">{sourceComparison.chg.matchedActive}</td>
                    <td className="px-3 py-2 text-center text-text-muted">–</td>
                    <td className="px-3 py-2 text-center font-bold">{sourceComparison.chg.total}</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-surface-secondary/60 border-t-2 border-border-secondary">
                <tr className="cursor-pointer hover:bg-surface-secondary/40" onClick={() => setActiveSourceTab(activeSourceTab === 'masterList' ? null : 'masterList')}>
                  <td className="px-3 py-2 font-bold text-text-primary flex items-center gap-1.5"><Layers size={12} className="text-text-muted" />Aktiv unique</td>
                  <td className="px-3 py-2 text-center font-bold text-text-primary">{sourceComparison.master.activeJet}</td>
                  <td className="px-3 py-2 text-center font-bold text-text-primary">{sourceComparison.master.activeDayn}</td>
                  <td className="px-3 py-2 text-center font-extrabold text-lg text-text-primary">{sourceComparison.master.activeTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deinstallierte — eigene Kachel */}
          {sourceComparison.master.deinstalledTotal > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setActiveSourceTab(activeSourceTab === 'deinstalled' ? null : 'deinstalled')}
                className={`w-full text-left border rounded-xl p-2.5 transition-all ${
                  activeSourceTab === 'deinstalled'
                    ? 'border-red-300 bg-status-offline/10/60 ring-1 ring-red-200/60'
                    : 'border-border-secondary/40 bg-surface-secondary/40 hover:border-border-primary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400"></div>
                    <span className="text-xs text-status-offline font-medium">
                      Deinstalliert / Inaktiv
                    </span>
                    <span className="text-xs font-bold text-status-offline">
                      {sourceComparison.master.deinstalledTotal}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {sourceComparison.navori.deinstalled > 0 && `Navori: ${sourceComparison.navori.deinstalled}`}
                    {sourceComparison.navori.deinstalled > 0 && sourceComparison.airtable.deinstalled > 0 && ' · '}
                    {sourceComparison.airtable.deinstalled > 0 && `AT: ${sourceComparison.airtable.deinstalled}`}
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* Completeness */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
            {sourceComparison.completeness && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-50/60 border border-emerald-200/40">
                <Shield size={10} className="text-emerald-500" />
                <span className="text-emerald-700 font-medium">Vollständigkeit:</span>
                <span className={`font-bold ${sourceComparison.completeness.complete === sourceComparison.completeness.activeTotal ? 'text-emerald-600' : 'text-status-warning'}`}>
                  {sourceComparison.completeness.complete}/{sourceComparison.completeness.activeTotal}
                </span>
                <span className="text-text-muted">aktive in allen 3 Plattformen</span>
              </span>
            )}
            {sourceComparison.chg && sourceComparison.chg.total > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-status-warning/10/60 border border-status-warning/20/40">
                <span className="text-status-warning font-medium">CHG/Bank:</span>
                <span className="font-bold text-status-warning">
                  {sourceComparison.chg.matchedActive}
                </span>
                <span className="text-text-muted">aktive mit Leasing-Vertrag</span>
                <span className="text-text-muted">|</span>
                <span className="text-text-muted">{sourceComparison.chg.total} SN gesamt</span>
              </span>
            )}
          </div>

          <div className="text-xs text-text-muted mt-1">
            Nur aktive Displays gezählt · Klick auf Zeile = Detail-Liste
          </div>

          {/* ─── Matching Summary Bar (active only) ─── */}
          {(() => {
            const activeBase = sourceComparison.navori.active;
            const matchPct = activeBase > 0
              ? Math.round((sourceComparison.overlap.inAll3 / activeBase) * 100)
              : 0;
            return (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-surface-secondary rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${(sourceComparison.overlap.inAll3 / Math.max(activeBase, 1)) * 100}%` }} title="In allen 3" />
                  <div className="bg-violet-400 h-full" style={{ width: `${(sourceComparison.overlap.inNavoriAndVistar / Math.max(activeBase, 1)) * 100}%` }} title="Navori+Vistar" />
                  <div className="bg-emerald-300 h-full" style={{ width: `${(sourceComparison.overlap.inNavoriAndAirtable / Math.max(activeBase, 1)) * 100}%` }} title="Navori+Airtable" />
                  <div className="bg-surface-tertiary h-full" style={{ width: `${(sourceComparison.overlap.onlyNavori / Math.max(activeBase, 1)) * 100}%` }} title="Nur Navori" />
                </div>
                <span className={`text-xs font-bold ${matchPct >= 80 ? 'text-emerald-600' : matchPct >= 50 ? 'text-status-warning' : 'text-status-offline'}`}>
                  {matchPct}%
                </span>
              </div>
            );
          })()}

          {/* Legend for bar */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            <button onClick={() => setActiveSourceTab('all3')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
              <div className="w-2 h-2 rounded-sm bg-emerald-500"></div>
              Alle 3 ({sourceComparison.overlap.inAll3})
            </button>
            <button onClick={() => setActiveSourceTab('navoriVistar')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
              <div className="w-2 h-2 rounded-sm bg-violet-400"></div>
              Navori+Vistar ({sourceComparison.overlap.inNavoriAndVistar})
            </button>
            <button onClick={() => setActiveSourceTab('navoriAirtable')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
              <div className="w-2 h-2 rounded-sm bg-emerald-300"></div>
              Navori+Airtable ({sourceComparison.overlap.inNavoriAndAirtable})
            </button>
            <button onClick={() => setActiveSourceTab('onlyNavori')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
              <div className="w-2 h-2 rounded-sm bg-surface-tertiary"></div>
              Nur Navori ({sourceComparison.overlap.onlyNavori})
            </button>
            {sourceComparison.overlap.airtableOnly > 0 && (
              <button onClick={() => setActiveSourceTab('airtableOnly')} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
                <div className="w-2 h-2 rounded-sm bg-amber-400"></div>
                Nur Airtable ({sourceComparison.overlap.airtableOnly})
              </button>
            )}
          </div>

          {/* ─── Vistar Matching per Network ─── */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* JET ↔ Vistar */}
            {(() => {
              const nv = sourceComparison.navoriVistarJet;
              const totalUnique = nv.matched + nv.navoriOnly + nv.vistarOnly;
              const matchPct = totalUnique > 0 ? Math.round((nv.matched / totalUnique) * 100) : 0;
              return (
                <button
                  onClick={() => setActiveSourceTab(activeSourceTab === 'navoriVistarJet' ? null : 'navoriVistarJet')}
                  className={`text-left border rounded-xl p-3 transition-all ${activeSourceTab === 'navoriVistarJet' ? 'border-blue-400 ring-2 ring-accent/20/60 bg-accent-light/60' : 'border-accent/20/40 bg-gradient-to-br from-blue-50/40 to-slate-50/40 hover:border-blue-300'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-accent"></div>
                      <span className="text-xs text-accent font-medium">Navori Live ↔ Vistar · JET</span>
                    </div>
                    <span className={`text-sm font-bold ${matchPct >= 90 ? 'text-emerald-600' : matchPct >= 70 ? 'text-status-warning' : 'text-status-offline'}`}>
                      {matchPct}%
                    </span>
                  </div>
                  {/* Stacked bar: matched | navori-only | vistar-only */}
                  <div className="h-2 bg-surface-secondary rounded-full overflow-hidden flex mb-2">
                    <div className="bg-accent h-full" style={{ width: `${(nv.matched / Math.max(totalUnique, 1)) * 100}%` }} title={`${nv.matched} matched`} />
                    <div className="bg-indigo-300 h-full" style={{ width: `${(nv.navoriOnly / Math.max(totalUnique, 1)) * 100}%` }} title={`${nv.navoriOnly} nur Navori`} />
                    <div className="bg-violet-300 h-full" style={{ width: `${(nv.vistarOnly / Math.max(totalUnique, 1)) * 100}%` }} title={`${nv.vistarOnly} nur Vistar`} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-1 text-xs text-accent">
                      <span className="w-2 h-2 rounded-sm bg-accent inline-block"></span>
                      {nv.matched} matched
                    </span>
                    {nv.navoriOnly > 0 && (
                      <span className="flex items-center gap-1 text-xs text-indigo-500">
                        <span className="w-2 h-2 rounded-sm bg-indigo-300 inline-block"></span>
                        {nv.navoriOnly} nur Navori
                      </span>
                    )}
                    {nv.vistarOnly > 0 && (
                      <span className="flex items-center gap-1 text-xs text-violet-500">
                        <span className="w-2 h-2 rounded-sm bg-violet-300 inline-block"></span>
                        {nv.vistarOnly} nur Vistar
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-text-muted">
                    Navori: {nv.navoriTotal} aktiv · Vistar: {nv.vistarJetTotal} JET Venues
                  </div>
                </button>
              );
            })()}

            {/* Dayn ↔ Vistar */}
            {sourceComparison.daynVistar.total > 0 && (() => {
              const dv = sourceComparison.daynVistar;
              const totalUnique = dv.matched + dv.unmatched;
              const matchPct = totalUnique > 0 ? Math.round((dv.matched / totalUnique) * 100) : 0;
              return (
                <button
                  onClick={() => setActiveSourceTab(activeSourceTab === 'daynVistar' ? null : 'daynVistar')}
                  className={`text-left border rounded-xl p-3 transition-all ${activeSourceTab === 'daynVistar' ? 'border-orange-400 ring-2 ring-orange-200/60 bg-status-warning/10/60' : 'border-status-warning/20/40 bg-gradient-to-br from-orange-50/40 to-slate-50/40 hover:border-orange-300'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-status-warning"></div>
                      <span className="text-xs text-status-warning font-medium">Dayn Screens ↔ Vistar</span>
                    </div>
                    <span className={`text-sm font-bold ${matchPct >= 90 ? 'text-emerald-600' : matchPct >= 70 ? 'text-status-warning' : 'text-status-offline'}`}>
                      {matchPct}%
                    </span>
                  </div>
                  <div className="h-2 bg-surface-secondary rounded-full overflow-hidden flex mb-2">
                    <div className="bg-status-warning h-full" style={{ width: `${(dv.matched / Math.max(totalUnique, 1)) * 100}%` }} />
                    <div className="bg-orange-200 h-full" style={{ width: `${(dv.unmatched / Math.max(totalUnique, 1)) * 100}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-1 text-xs text-status-warning">
                      <span className="w-2 h-2 rounded-sm bg-status-warning inline-block"></span>
                      {dv.matched} matched
                    </span>
                    {dv.unmatched > 0 && (
                      <span className="flex items-center gap-1 text-xs text-orange-400">
                        <span className="w-2 h-2 rounded-sm bg-orange-200 inline-block"></span>
                        {dv.unmatched} nicht gematcht
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-text-muted">
                    {dv.online} online · {dv.total} gesamt{dv.offline > 0 && ` · ${dv.offline} offline (nicht gezählt)`}
                  </div>
                </button>
              );
            })()}
          </div>

          {/* ─── Source Detail Table ─── */}
          {activeSourceTab && sourceComparison.details && (() => {
            let detailTitle = '';
            let detailList = [];
            let columns = ['displayId', 'locationName', 'city'];
            let colLabels = ['Display ID', 'Standort', 'Stadt'];

            switch (activeSourceTab) {
              case 'navori':
                detailTitle = `Navori Displays (${sourceComparison.navori.total})`;
                detailList = displays.map(d => ({ displayId: d.displayId, locationName: d.displayName || d.locationName || '', city: d.cityCode, serialNumber: d.serialNumber || '', status: d.isActive ? 'Aktiv' : 'Inaktiv' }));
                columns = ['displayId', 'locationName', 'city', 'serialNumber', 'status'];
                colLabels = ['Display ID', 'Standort', 'Stadt', 'Serial Number', 'Status'];
                break;
              case 'airtable':
                detailTitle = `Airtable — JET (${sourceComparison.airtable.allIds}) + Dayn (${sourceComparison.airtable.daynTotal}) = ${sourceComparison.airtable.allIds + sourceComparison.airtable.daynTotal} gesamt`;
                detailList = [];
                // JET displays from airtable_displays
                if (airtableData?.allDisplayIds) {
                  for (const did of airtableData.allDisplayIds) {
                    const loc = airtableData.locationMap?.get(did);
                    const inNavori = displays.some(d => d.displayId === did);
                    const isActive = airtableData.activeDisplayIds?.has(did);
                    detailList.push({
                      network: 'JET',
                      displayId: did,
                      locationName: loc?.locationName || '',
                      city: loc?.city || '',
                      airtableStatus: loc?.status || (isActive ? 'Aktiv' : 'Deinstalliert'),
                      inVistar: sourceComparison.vistarLookupSet?.has(did) ? '✓' : '–',
                    });
                  }
                }
                // Dayn screens from dayn_screens
                if (daynScreensData?.records) {
                  for (const d of daynScreensData.records) {
                    const screenId = d.dayn_screen_id || d.do_screen_id || '';
                    if (!screenId) continue;
                    const inV = sourceComparison.vistarLookupSet?.has(screenId) || false;
                    detailList.push({
                      network: 'Dayn',
                      displayId: screenId,
                      locationName: d.location_name || '',
                      city: d.city || '',
                      airtableStatus: d.screen_status || '–',
                      inVistar: inV ? '✓' : '–',
                    });
                  }
                }
                // Sort: JET first, then by status, then by displayId
                detailList.sort((a, b) => {
                  if (a.network !== b.network) return a.network === 'Flink' ? -1 : 1;
                  const aActive = /online|live|aktiv/i.test(a.airtableStatus) ? 0 : 1;
                  const bActive = /online|live|aktiv/i.test(b.airtableStatus) ? 0 : 1;
                  if (aActive !== bActive) return aActive - bActive;
                  return a.displayId.localeCompare(b.displayId);
                });
                columns = ['network', 'displayId', 'locationName', 'city', 'airtableStatus', 'inVistar'];
                colLabels = ['Netzwerk', 'Display ID', 'Standort', 'Stadt', 'Status', 'Vistar'];
                break;
              case 'vistar':
                detailTitle = `Vistar Venues (${sourceComparison.vistar.dbTotal})`;
                detailList = (vistarVenues || []).map(v => {
                  const parts = (v.name || '').split('|');
                  const doId = (parts[0] || '').trim();
                  const locName = (parts[1] || '').trim();
                  return { displayId: doId || v.id, locationName: locName, city: v.city || '', venueId: v.id };
                });
                columns = ['displayId', 'locationName', 'city', 'venueId'];
                colLabels = ['DO-ID / Venue', 'Name', 'Stadt', 'Venue ID'];
                break;
              case 'all3':
                detailTitle = `In allen 3 Quellen (${sourceComparison.overlap.inAll3})`;
                detailList = sourceComparison.details.all3;
                break;
              case 'overlap':
                detailTitle = `Matching-Übersicht (${sourceComparison.navori.total} Navori Displays)`;
                detailList = [
                  ...sourceComparison.details.all3.map(d => ({ ...d, matchGroup: 'Alle 3' })),
                  ...sourceComparison.details.navoriVistar.map(d => ({ ...d, matchGroup: 'Navori+Vistar' })),
                  ...sourceComparison.details.navoriAirtable.map(d => ({ ...d, matchGroup: 'Navori+Airtable' })),
                  ...sourceComparison.details.onlyNavori.map(d => ({ ...d, matchGroup: 'Nur Navori' })),
                ];
                columns = ['displayId', 'locationName', 'city', 'matchGroup'];
                colLabels = ['Display ID', 'Standort', 'Stadt', 'Quellen'];
                break;
              case 'navoriVistar':
                detailTitle = `Navori + Vistar, fehlt in Airtable (${sourceComparison.overlap.inNavoriAndVistar})`;
                detailList = sourceComparison.details.navoriVistar;
                break;
              case 'navoriAirtable':
                detailTitle = `Navori + Airtable, fehlt bei Vistar (${sourceComparison.overlap.inNavoriAndAirtable})`;
                detailList = sourceComparison.details.navoriAirtable;
                break;
              case 'onlyNavori':
                detailTitle = `Nur in Navori (${sourceComparison.overlap.onlyNavori})`;
                detailList = sourceComparison.details.onlyNavori;
                break;
              case 'airtableOnly':
                detailTitle = `Nur in Airtable, nicht in Navori (${sourceComparison.overlap.airtableOnly})`;
                detailList = sourceComparison.details.airtableOnly;
                columns = ['displayId', 'locationName', 'city', 'airtableStatus', 'deinstallDate'];
                colLabels = ['Display ID', 'Standort', 'Stadt', 'Status', 'Deinstalliert am'];
                break;
              case 'navoriVistarJet':
                detailTitle = `Navori Live ↔ Vistar · JET (${sourceComparison.navoriVistarJet.matched} matched · ${sourceComparison.navoriVistarJet.navoriOnly} nur Navori · ${sourceComparison.navoriVistarJet.vistarOnly} nur Vistar)`;
                detailList = sourceComparison.details.navoriVistarJetDetail || [];
                columns = ['source', 'displayId', 'locationName', 'city', 'vistarDoId', 'vistarVenueName'];
                colLabels = ['Quelle', 'Display ID', 'Standort', 'Stadt', 'Vistar DO-ID', 'Vistar Name'];
                break;
              case 'daynVistar':
                detailTitle = `Dayn Screens ↔ Vistar (${sourceComparison.daynVistar.matched} matched · ${sourceComparison.daynVistar.unmatched} nicht gematcht)`;
                detailList = sourceComparison.details.daynVistarDetail || [];
                columns = ['matched', 'screenId', 'locationName', 'city', 'status', 'vistarDmId', 'vistarVenueName'];
                colLabels = ['Match', 'Screen ID', 'Standort', 'Stadt', 'Status', 'Vistar DM-ID', 'Vistar Name'];
                break;
              case 'masterList': {
                const allMaster = sourceComparison.details.masterList || [];
                // Apply completeness filter
                let filteredMaster = allMaster;
                if (masterListFilter === 'incomplete') {
                  filteredMaster = allMaster.filter(d => d.isActiveDisplay && !d.platformComplete);
                } else if (masterListFilter === 'complete') {
                  filteredMaster = allMaster.filter(d => d.isActiveDisplay && d.platformComplete);
                } else if (masterListFilter === 'active') {
                  filteredMaster = allMaster.filter(d => d.isActiveDisplay);
                } else if (masterListFilter === 'deinstalled') {
                  filteredMaster = allMaster.filter(d => !d.isActiveDisplay);
                }
                detailTitle = `Alle Displays (${sourceComparison.master.activeTotal} aktiv · ${sourceComparison.master.deinstalledTotal} inaktiv — ${sourceComparison.master.jetCount} JET · ${sourceComparison.master.daynCount} Dayn)`;
                detailList = filteredMaster;
                columns = ['network', 'displayId', 'locationName', 'city', 'inNavori', 'inAirtable', 'inVistar', 'inChg', 'platformComplete'];
                colLabels = ['Netz', 'Display ID', 'Standort', 'Stadt', 'Navori', 'Airtable', 'Vistar', 'CHG', 'Komplett'];
                break;
              }
              case 'deinstalled': {
                const allMaster = sourceComparison.details.masterList || [];
                detailTitle = `Deinstallierte / Inaktive Displays (${sourceComparison.master.deinstalledTotal})`;
                detailList = allMaster.filter(d => !d.isActiveDisplay);
                columns = ['network', 'displayId', 'locationName', 'city', 'airtableStatus', 'inNavori', 'inAirtable', 'inVistar', 'inChg'];
                colLabels = ['Netz', 'Display ID', 'Standort', 'Stadt', 'Status', 'Navori', 'Airtable', 'Vistar', 'CHG'];
                break;
              }
              default:
                break;
            }

            if (detailList.length === 0 && activeSourceTab !== 'masterList') return null;

            return (
              <div className="mt-3 pt-3 border-t border-border-secondary/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-text-primary">{detailTitle}</span>
                  <div className="flex items-center gap-2">
                    {/* Filter bar for masterList */}
                    {activeSourceTab === 'masterList' && (
                      <div className="flex items-center gap-1">
                        {[
                          { key: '', label: 'Alle' },
                          { key: 'active', label: 'Aktiv' },
                          { key: 'incomplete', label: 'Unvollständig' },
                          { key: 'complete', label: 'Komplett' },
                          { key: 'deinstalled', label: 'Inaktiv' },
                        ].map(f => (
                          <button
                            key={f.key}
                            onClick={() => setMasterListFilter(f.key)}
                            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                              masterListFilter === f.key
                                ? 'bg-[#1D1D1F] text-white border-[#1D1D1F]'
                                : 'text-text-muted hover:text-text-primary bg-surface-secondary/60 border-border-secondary/40'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="text-xs text-text-muted">{detailList.length} Einträge</span>
                  </div>
                </div>
                {detailList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-text-muted bg-surface-secondary/40 rounded-lg border border-border-secondary/40">
                    Keine Einträge für diesen Filter
                  </div>
                ) : (
                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border-secondary/40">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-secondary/80 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-xs text-text-muted uppercase">#</th>
                        {colLabels.map((label, i) => (
                          <th
                            key={i}
                            className="text-left px-3 py-1.5 text-xs text-text-muted uppercase cursor-pointer hover:text-text-secondary select-none"
                            onClick={() => {
                              const col = columns[i];
                              if (detailSortField === col) {
                                setDetailSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
                              } else {
                                setDetailSortField(col);
                                setDetailSortDir('asc');
                              }
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              {detailSortField === columns[i] && (
                                detailSortDir === 'asc'
                                  ? <ChevronUp size={10} className="text-accent" />
                                  : <ChevronDown size={10} className="text-accent" />
                              )}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const sortedDetailList = detailSortField
                          ? [...detailList].sort((a, b) => {
                              let aVal = a[detailSortField] ?? '';
                              let bVal = b[detailSortField] ?? '';
                              if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                              if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                              if (typeof aVal === 'boolean') { aVal = aVal ? 1 : 0; bVal = bVal ? 1 : 0; }
                              if (aVal < bVal) return detailSortDir === 'asc' ? -1 : 1;
                              if (aVal > bVal) return detailSortDir === 'asc' ? 1 : -1;
                              return 0;
                            })
                          : detailList;
                        return sortedDetailList.slice(0, 500).map((item, idx) => (
                        <tr key={idx} className={`border-t border-border-secondary/60 hover:bg-surface-secondary/40 ${
                          item.source === 'navori_only' ? 'bg-indigo-50/30'
                          : item.source === 'vistar_only' ? 'bg-violet-50/30'
                          : !item.isActiveDisplay && activeSourceTab === 'masterList' ? 'bg-surface-secondary/40 opacity-60'
                          : ''
                        }`}>
                          <td className="px-3 py-1.5 text-text-muted">{idx + 1}</td>
                          {columns.map((col, i) => (
                            <td key={i} className={`px-3 py-1.5 ${
                              col === 'source'
                                ? '' // rendered as badge below
                              : col === 'matchGroup'
                                ? item[col] === 'Alle 3' ? 'text-emerald-600 font-medium'
                                : item[col] === 'Nur Navori' ? 'text-text-muted'
                                : 'text-text-secondary'
                              : col === 'inNavori' || col === 'inAirtable' || col === 'inChg' || col === 'matched'
                                ? item[col] === '✓' ? 'text-emerald-500 font-bold' : 'text-status-offline font-bold'
                              : col === 'status' || col === 'airtableStatus'
                                ? /online|aktiv|live/i.test(item[col] || '') ? 'text-emerald-500'
                                  : /deinstall|offline|closed|entfernt|signed/i.test(item[col] || '') ? 'text-status-offline'
                                  : 'text-text-muted'
                                : 'text-text-primary'
                            } ${col === 'locationName' || col === 'vistarVenueName' ? 'max-w-[200px] truncate' : ''} ${col === 'vistarVenueId' ? 'max-w-[120px] truncate text-xs' : ''}`}>
                              {col === 'source' ? (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold uppercase ${
                                  item[col] === 'both' ? 'bg-accent-light text-blue-700'
                                  : item[col] === 'navori_only' ? 'bg-indigo-100 text-indigo-700'
                                  : item[col] === 'vistar_only' ? 'bg-violet-100 text-violet-700'
                                  : 'bg-surface-secondary text-text-muted'
                                }`}>
                                  {item[col] === 'both' ? 'Beide' : item[col] === 'navori_only' ? 'Nur Navori' : item[col] === 'vistar_only' ? 'Nur Vistar' : item[col] || '–'}
                                </span>
                              ) : col === 'network' ? (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold uppercase ${
                                  item[col] === 'Flink' ? 'bg-accent-light text-blue-700' : 'bg-status-warning/10 text-orange-700'
                                }`}>{item[col]}</span>
                              ) : col === 'platformComplete' ? (
                                item[col] ? (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">
                                    <CheckCircle2 size={10} />
                                    Komplett
                                  </span>
                                ) : item.isActiveDisplay ? (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-status-warning/10 text-amber-700">
                                    <AlertTriangle size={10} />
                                    Lücken
                                  </span>
                                ) : (
                                  <span className="text-xs text-text-muted">–</span>
                                )
                              ) : col === 'inNavori' || col === 'inAirtable' || col === 'inChg' ? (
                                <span className={`font-bold ${item[col] === '✓' ? (col === 'inChg' ? 'text-status-warning' : 'text-emerald-500') : 'text-status-offline'}`}>{item[col] === '✓' ? '✓' : '✗'}</span>
                              ) : col === 'airtableStatus' ? (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                                  /online|aktiv|live/i.test(item[col] || '') ? 'bg-emerald-100 text-emerald-700'
                                  : /deinstall/i.test(item[col] || '') ? 'bg-status-offline/10 text-status-offline'
                                  : /offline/i.test(item[col] || '') ? 'bg-status-warning/10 text-amber-700'
                                  : 'bg-surface-secondary text-text-muted'
                                }`}>{item[col] || '–'}</span>
                              ) : col === 'deinstallDate' ? (
                                <span className={`text-xs ${item[col] ? 'text-status-offline font-medium' : 'text-text-muted'}`}>
                                  {item[col] ? new Date(item[col]).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'}
                                </span>
                              ) : col === 'liveSince' ? (
                                <span className="text-text-muted text-xs">
                                  {item[col] ? new Date(item[col]).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'}
                                </span>
                              ) : col === 'navoriStatus' ? (
                                <span className={`${item[col] === 'Aktiv' ? 'text-emerald-600' : item[col] === 'Inaktiv' ? 'text-status-warning' : 'text-text-muted'}`}>{item[col]}</span>
                              ) : col === 'inVistar' ? (
                                <span className={`font-bold ${item[col] === '✓' ? 'text-emerald-500' : 'text-status-offline'}`}>{item[col] === '✓' ? '✓' : '✗'}</span>
                              ) : (item[col] || '–')}
                            </td>
                          ))}
                        </tr>
                      ));
                      })()}
                    </tbody>
                  </table>
                  {detailList.length > 500 && (
                    <div className="p-2 text-center text-xs text-text-muted bg-surface-secondary/80">
                      ... und {detailList.length - 500} weitere
                    </div>
                  )}
                </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

    <div className="bg-surface-primary border border-border-secondary rounded-2xl">
      <div className="p-4 border-b border-border-secondary">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
          <h3 className="text-sm font-medium text-text-secondary flex-shrink-0">
            Display-Liste
          </h3>

          <div className="flex flex-wrap items-center gap-2 flex-grow">
            {/* Search */}
            <div className="relative flex-grow max-w-xs">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                placeholder="Display ID / Standort / Serial..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full bg-surface-secondary/80 border border-border-secondary rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF]"
              />
            </div>

            {/* City filter */}
            <select
              value={cityFilter}
              onChange={(e) => { setCityFilter(e.target.value); setPage(0); }}
              className="bg-surface-secondary/80 border border-border-secondary rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-[#007AFF]"
            >
              <option value="">Alle Städte</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="bg-surface-secondary/80 border border-border-secondary rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-[#007AFF]"
            >
              <option value="">Alle Status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{getStatusLabel(s)}</option>
              ))}
            </select>

            {/* Vistar filter */}
            {hasVistar && (
              <select
                value={vistarFilter}
                onChange={(e) => { setVistarFilter(e.target.value); setPage(0); }}
                className="bg-violet-50/60 border border-violet-200/40 rounded-md px-2 py-1.5 text-xs text-violet-700 focus:outline-none focus:border-violet-400"
              >
                <option value="">Vistar: Alle</option>
                <option value="matched">✓ Bei Vistar ({vistarStats?.matched})</option>
                <option value="unmatched">✗ Nicht bei Vistar ({vistarStats?.unmatched})</option>
              </select>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {hasVistar && vistarStats && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-violet-500">{vistarStats.matched} Vistar</span>
                <span className="text-text-muted">|</span>
                <span className="text-text-muted">{vistarStats.unmatched} fehlen</span>
              </div>
            )}
            <div className="text-xs text-text-muted">
              {filtered.length} Displays
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-secondary text-text-muted text-xs">
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-text-secondary">
                  Status <SortIcon field="status" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('displayId')} className="flex items-center gap-1 hover:text-text-secondary">
                  Display ID <SortIcon field="displayId" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('locationName')} className="flex items-center gap-1 hover:text-text-secondary">
                  Standort <SortIcon field="locationName" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('cityCode')} className="flex items-center gap-1 hover:text-text-secondary">
                  Stadt <SortIcon field="cityCode" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-text-muted">
                Adresse
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-text-muted text-xs">
                Venue
              </th>
              <th className="text-left px-3 py-2.5 font-medium">
                <button onClick={() => handleSort('floorCpm')} className="flex items-center gap-1 hover:text-text-secondary text-text-muted text-xs">
                  TKP € <SortIcon field="floorCpm" />
                </button>
              </th>
              <th className="text-left px-3 py-2.5 font-medium">
                <button onClick={() => handleSort('impressionsDay')} className="flex items-center gap-1 hover:text-text-secondary text-text-muted text-xs">
                  Imp./Tag <SortIcon field="impressionsDay" />
                </button>
              </th>
              <th className="text-center px-2 py-2.5 font-medium text-xs" title="In Navori">
                <span className="text-accent">Nav</span>
              </th>
              <th className="text-center px-2 py-2.5 font-medium text-xs" title="In Airtable">
                <span className="text-emerald-400">AT</span>
              </th>
              <th className="text-center px-2 py-2.5 font-medium text-xs" title="In Vistar">
                <span className="text-violet-400">Vis</span>
              </th>
              <th className="text-center px-2 py-2.5 font-medium text-xs" title="CHG/Bank Leasing">
                <span className="text-status-warning">CHG</span>
              </th>
              <th className="text-center px-2 py-2.5 font-medium" title="Hardware-Swap am Standort">
                <span className="flex items-center justify-center gap-1 text-text-muted">
                  <RefreshCw size={11} /> Swap
                </span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('offlineHours')} className="flex items-center gap-1 hover:text-text-secondary">
                  Offline <SortIcon field="offlineHours" />
                </button>
              </th>
              {hasVistar && canViewRevenue && (
                <th className="text-left px-4 py-2.5 font-medium">
                  <button onClick={() => handleSort('vistarRevenue')} className="flex items-center gap-1 hover:text-violet-600 text-violet-400">
                    Revenue (30d) <SortIcon field="vistarRevenue" />
                  </button>
                </th>
              )}
              {hasVistar && (
                <th className="text-left px-4 py-2.5 font-medium">
                  <button onClick={() => handleSort('vistarImpressions')} className="flex items-center gap-1 hover:text-accent text-accent">
                    Impressions <SortIcon field="vistarImpressions" />
                  </button>
                </th>
              )}
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('heartbeat')} className="flex items-center gap-1 hover:text-text-secondary">
                  Heartbeat <SortIcon field="heartbeat" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((display) => (
              <tr
                key={display.displayId}
                className={`border-b border-border-secondary/40 cursor-pointer transition-colors ${getRowBg(display.status)}`}
                onClick={() => onSelectDisplay(display)}
              >
                <td className="px-4 py-2">
                  <StatusBadge status={display.status} />
                </td>
                <td className="px-4 py-2 text-text-primary">
                  {display.displayId}
                </td>
                <td className="px-4 py-2 text-text-secondary max-w-[200px] truncate">
                  {display.displayName || display.locationName || '–'}
                </td>
                <td className="px-4 py-2 text-text-secondary">
                  {display.cityCode}
                </td>
                <td className="px-4 py-2 text-sm text-text-muted max-w-[180px]">
                  {display.geoAddress && (
                    <div className="truncate">{display.geoAddress}</div>
                  )}
                  {display.geoCityLine && (
                    <div className="truncate text-text-muted">{display.geoCityLine}</div>
                  )}
                  {display.geoLat && (
                    <div className="text-xs text-text-muted">
                      {display.geoLat.toFixed(4)}, {display.geoLng.toFixed(4)}
                    </div>
                  )}
                  {!display.geoAddress && !display.geoCityLine && !display.geoLat && (
                    <span className="text-text-muted">&ndash;</span>
                  )}
                </td>
                <td className="px-3 py-2 text-sm text-text-muted max-w-[80px] truncate" title={display.venueType || ''}>
                  {display.venueType || <span className="text-text-muted">&ndash;</span>}
                </td>
                <td className="px-3 py-2 text-sm text-text-secondary">
                  {display.floorCpm != null ? (
                    <span className="text-emerald-600">€{display.floorCpm.toFixed(2)}</span>
                  ) : (
                    <span className="text-text-muted">&ndash;</span>
                  )}
                </td>
                <td className="px-3 py-2 text-sm text-text-secondary">
                  {display.impressionsDay != null ? (
                    <span className="text-accent">{display.impressionsDay.toLocaleString('de-DE')}</span>
                  ) : (
                    <span className="text-text-muted">&ndash;</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <span className="text-accent font-bold text-xs">✓</span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className={`font-bold text-xs ${display.airtableMatched ? 'text-emerald-500' : 'text-status-offline'}`}>
                    {display.airtableMatched ? '✓' : '✗'}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className={`font-bold text-xs ${display.vistarMatched ? 'text-violet-500' : 'text-status-offline'}`}>
                    {display.vistarMatched ? '✓' : '✗'}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  <span className={`font-bold text-xs ${display.chgMatched ? 'text-status-warning' : 'text-status-offline'}`}>
                    {display.chgMatched ? '✓' : '✗'}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  {display.hasSwap ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-status-warning/10/60 text-status-warning" title="Hardware-Swap an diesem Standort">
                      <RefreshCw size={10} />
                    </span>
                  ) : (
                    <span className="text-text-muted">&ndash;</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {display.status === 'online' ? (
                    <span className="text-[#34C759]">–</span>
                  ) : display.status === 'never_online' ? (
                    <span className="text-text-muted">Nie</span>
                  ) : display.offlineHours != null ? (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold"
                      style={{
                        color: getStatusColor(display.status),
                        backgroundColor: getStatusColor(display.status) + '15',
                      }}
                    >
                      {formatDuration(display.offlineHours)}
                    </span>
                  ) : (
                    <span className="text-text-muted">–</span>
                  )}
                </td>
                {hasVistar && canViewRevenue && (
                  <td className="px-4 py-2">
                    {display.vistarMatched ? (
                      <span className="text-violet-600 font-medium">
                        €{display.vistarRevenue.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-text-muted">–</span>
                    )}
                  </td>
                )}
                {hasVistar && (
                  <td className="px-4 py-2">
                    {display.vistarMatched ? (
                      <span className="text-accent">
                        {fmtCompact(display.vistarImpressions)}
                      </span>
                    ) : (
                      <span className="text-text-muted">–</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-2 text-text-muted text-sm">
                  {formatDateTime(display.heartbeat)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-secondary">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-xs px-3 py-1 rounded bg-surface-secondary/80 border border-border-secondary text-text-secondary hover:border-[#007AFF] disabled:opacity-30 disabled:hover:border-border-secondary"
          >
            Zurück
          </button>
          <span className="text-xs text-text-muted">
            Seite {page + 1} von {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="text-xs px-3 py-1 rounded bg-surface-secondary/80 border border-border-secondary text-text-secondary hover:border-[#007AFF] disabled:opacity-30 disabled:hover:border-border-secondary"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
    </div>
  );
}
