import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Cpu, Monitor, Wifi, HardDrive, Package, Search, Filter,
  Loader2, RefreshCw, ArrowLeftRight, PackageX, ChevronDown, ChevronUp,
  Landmark, AlertTriangle, CheckCircle2, Clock, MapPin, Hash,
  TrendingUp, ArrowUpRight, ArrowDownRight, Shield, ShieldAlert,
  ShieldCheck, Calendar, Wrench, Eye, CreditCard, SlidersHorizontal,
  History, ClipboardCheck, Truck, HelpCircle, XCircle, Radio,
  Database, Pencil,
} from 'lucide-react';

const DataQualityDashboard = React.lazy(() => import('./DataQualityDashboard'));
import HardwareComponentDetail from './HardwareComponentDetail';
import {
  fetchAllOpsInventory,
  fetchAllLeasingData,
  fetchAllSwaps,
  fetchAllDeinstalls,
  fetchAllDisplayLocations,
  fetchAllInstallationen,
  fetchAllSimInventory,
  fetchAllDisplayInventory,
} from '../utils/airtableService';

/* ──────────────────────── STATUS COLORS ──────────────────────── */

const STATUS_CONFIG = {
  'active':              { label: 'Active',            color: '#22c55e', bg: '#22c55e15', icon: '🟢' },
  'defect':              { label: 'Defekt',            color: '#ef4444', bg: '#ef444415', icon: '🔴' },
  'prep/ warehouse':     { label: 'Lager',             color: '#64748b', bg: '#64748b15', icon: '⚫' },
  'out for installation':{ label: 'Out for Install',   color: '#3b82f6', bg: '#3b82f615', icon: '🔵' },
  'test device':         { label: 'Test',              color: '#8b5cf6', bg: '#8b5cf615', icon: '🟣' },
  'to be deinstalled':   { label: 'Deinstall geplant', color: '#f97316', bg: '#f9731615', icon: '🟠' },
  'deinstalled':         { label: 'Deinstalliert',     color: '#f97316', bg: '#f9731615', icon: '🟠' },
  'to be swapped':       { label: 'Tausch geplant',    color: '#eab308', bg: '#eab30815', icon: '🟡' },
};

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || { label: status || '–', color: '#64748b', bg: '#64748b15', icon: '⚪' };
}

/* ──────────────────────── DERIVED HARDWARE STATUS ──────────────────────── */

const HW_STATUS_ICONS = { CheckCircle2, Package, Truck, XCircle, MapPin, HelpCircle, Radio };

function deriveHardwareStatus(ops) {
  const status = (ops.status || '').toLowerCase();
  const hasLocation = !!ops.displayLocationId;
  const locationStatus = (ops._onlineStatus || ops.locationOnlineStatus || '').toLowerCase();

  if (status.includes('deinstall') && !status.includes('to be'))
    return { key: 'deinstalled', label: 'Deinstalliert', color: '#ef4444', bg: '#ef444415', iconName: 'XCircle' };
  if (status.includes('to be deinstall'))
    return { key: 'to_be_deinstalled', label: 'Deinstall geplant', color: '#f97316', bg: '#f9731615', iconName: 'XCircle' };
  if (hasLocation && (locationStatus.includes('live') || locationStatus.includes('online')))
    return { key: 'live', label: 'Live', color: '#22c55e', bg: '#22c55e15', iconName: 'Radio' };
  if (status.includes('defect'))
    return { key: 'defect', label: 'Defekt', color: '#ef4444', bg: '#ef444415', iconName: 'AlertTriangle' };
  if (status.includes('prep') || status.includes('warehouse') || status.includes('lager'))
    return { key: 'warehouse', label: 'Lager', color: '#3b82f6', bg: '#3b82f615', iconName: 'Package' };
  if (status.includes('out for') || status.includes('installation') || status.includes('monteur'))
    return { key: 'installer', label: 'Beim Monteur', color: '#f59e0b', bg: '#f59e0b15', iconName: 'Truck' };
  if (status.includes('to be swap'))
    return { key: 'to_be_swapped', label: 'Tausch geplant', color: '#eab308', bg: '#eab30815', iconName: 'ArrowLeftRight' };
  if (status.includes('test'))
    return { key: 'test', label: 'Test-Gerät', color: '#8b5cf6', bg: '#8b5cf615', iconName: 'Monitor' };
  if (hasLocation)
    return { key: 'assigned', label: 'Zugeordnet', color: '#8b5cf6', bg: '#8b5cf615', iconName: 'MapPin' };
  if (status === 'active' && !hasLocation)
    return { key: 'warehouse', label: 'Lager', color: '#3b82f6', bg: '#3b82f615', iconName: 'Package' };
  return { key: 'unknown', label: 'Unbekannt', color: '#64748b', bg: '#64748b15', iconName: 'HelpCircle' };
}

/* ──────────────────────── KPI CARD ──────────────────────── */

function KpiCard({ label, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}12` }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-800 font-mono">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

/* ──────────────────────── MAIN COMPONENT ──────────────────────── */

export default function HardwareDashboard({ comparisonData, rawData }) {
  const [opsData, setOpsData] = useState([]);
  const [leaseData, setLeaseData] = useState({ chg: [], bank: [] });
  const [swaps, setSwaps] = useState([]);
  const [deinstalls, setDeinstalls] = useState([]);
  const [displayLocations, setDisplayLocations] = useState([]);
  const [installationen, setInstallationen] = useState([]);
  const [simInventory, setSimInventory] = useState([]);
  const [displayInventory, setDisplayInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [leasingFilter, setLeasingFilter] = useState('');
  const [completenessFilter, setCompletenessFilter] = useState('');
  const [activeSection, setActiveSection] = useState('ops');
  const [opsPage, setOpsPage] = useState(0);
  const [expandedOps, setExpandedOps] = useState(null);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [mietscheinFilter, setMietscheinFilter] = useState('');
  const [selectedHwComponent, setSelectedHwComponent] = useState(null);
  const OPS_PAGE_SIZE = 50;

  /* Load data */
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    try {
      const [ops, lease, sw, deinst, dispLoc, inst, sims, dispInv] = await Promise.all([
        fetchAllOpsInventory(),
        fetchAllLeasingData(),
        fetchAllSwaps().catch(() => []),
        fetchAllDeinstalls().catch(() => []),
        fetchAllDisplayLocations().catch(() => []),
        fetchAllInstallationen().catch(() => []),
        fetchAllSimInventory().catch(() => []),
        fetchAllDisplayInventory().catch(() => []),
      ]);
      setOpsData(ops || []);
      setLeaseData(lease || { chg: [], bank: [] });
      setSwaps(sw || []);
      setDeinstalls(deinst || []);
      setDisplayLocations(dispLoc || []);
      setInstallationen(inst || []);
      setSimInventory(sims || []);
      setDisplayInventory(dispInv || []);
    } catch (err) {
      console.error('[HardwareDashboard] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ─── Location Lookup Map ─── */
  const locationMap = useMemo(() => {
    const map = new Map();
    for (const loc of displayLocations) {
      map.set(loc.id, loc);
    }
    return map;
  }, [displayLocations]);

  /* ─── Leasing Lookup Maps ─── */
  const leasingByJetId = useMemo(() => {
    const map = new Map();
    for (const chg of (leaseData.chg || [])) {
      if (chg.jetIdLocation) {
        if (!map.has(chg.jetIdLocation)) map.set(chg.jetIdLocation, []);
        map.get(chg.jetIdLocation).push(chg);
      }
    }
    return map;
  }, [leaseData.chg]);

  const leasingBySn = useMemo(() => {
    const map = new Map();
    for (const bank of (leaseData.bank || [])) {
      if (bank.serialNumber) {
        map.set(bank.serialNumber, bank);
      }
    }
    return map;
  }, [leaseData.bank]);

  /* ─── OPS per location count map ─── */
  const opsPerLocation = useMemo(() => {
    const map = new Map();
    for (const ops of opsData) {
      if (ops.displayLocationId) {
        if (!map.has(ops.displayLocationId)) map.set(ops.displayLocationId, []);
        map.get(ops.displayLocationId).push(ops);
      }
    }
    return map;
  }, [opsData]);

  /* ─── Enriched OPS with location + leasing + derived status ─── */
  const enrichedOps = useMemo(() => {
    return opsData.map(ops => {
      const location = ops.displayLocationId ? locationMap.get(ops.displayLocationId) : null;
      const jetId = location?.jetId || '';
      const chgRecords = jetId ? (leasingByJetId.get(jetId) || []) : [];
      const bankRecord = ops.opsSn ? leasingBySn.get(ops.opsSn) : null;
      const onlineStatus = location?.onlineStatus || ops.locationOnlineStatus || '';
      const siblingOps = ops.displayLocationId ? (opsPerLocation.get(ops.displayLocationId) || []) : [];
      const enriched = {
        ...ops,
        _location: location,
        _locationName: location?.locationName || '',
        _city: location?.city || '',
        _jetId: jetId,
        _onlineStatus: onlineStatus,
        _chgRecords: chgRecords,
        _bankRecord: bankRecord,
        _hasLeasing: chgRecords.length > 0 || !!bankRecord,
        _siblingOpsCount: siblingOps.length,
        _siblingOps: siblingOps,
      };
      enriched._hwStatus = deriveHardwareStatus(enriched);
      return enriched;
    });
  }, [opsData, locationMap, leasingByJetId, leasingBySn, opsPerLocation]);

  /* ─── Filter Option Lists ─── */
  const cities = useMemo(() => {
    const citySet = new Set();
    enrichedOps.forEach(ops => {
      if (ops._city) citySet.add(ops._city);
    });
    return Array.from(citySet).sort();
  }, [enrichedOps]);

  const hardwareTypes = useMemo(() => {
    const typeSet = new Set();
    enrichedOps.forEach(ops => {
      if (ops.hardwareType) typeSet.add(ops.hardwareType);
    });
    return Array.from(typeSet).sort();
  }, [enrichedOps]);

  /* KPIs — derived hardware status */
  const kpis = useMemo(() => {
    const total = enrichedOps.length;
    // Raw status breakdown (for filter dropdown)
    const byStatus = {};
    enrichedOps.forEach(o => {
      const s = o.status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    // Derived status breakdown
    const byHwStatus = {};
    enrichedOps.forEach(o => {
      const key = o._hwStatus.key;
      byHwStatus[key] = (byHwStatus[key] || 0) + 1;
    });
    return {
      total,
      active: byStatus['active'] || 0,
      warehouse: byStatus['prep/ warehouse'] || 0,
      defect: byStatus['defect'] || 0,
      outForInstall: byStatus['out for installation'] || 0,
      testDevice: byStatus['test device'] || 0,
      byStatus,
      byHwStatus,
      live: byHwStatus['live'] || 0,
      hwWarehouse: byHwStatus['warehouse'] || 0,
      hwInstaller: byHwStatus['installer'] || 0,
      hwDeinstalled: byHwStatus['deinstalled'] || 0,
      hwDefect: byHwStatus['defect'] || 0,
      hwAssigned: byHwStatus['assigned'] || 0,
    };
  }, [enrichedOps]);

  /* Filtered OPS list */
  const filteredOps = useMemo(() => {
    let result = [...enrichedOps];

    if (statusFilter !== 'all') {
      result = result.filter(o => o._hwStatus.key === statusFilter);
    }

    if (cityFilter) {
      result = result.filter(o => o._city === cityFilter);
    }

    if (typeFilter) {
      result = result.filter(o => o.hardwareType === typeFilter);
    }

    if (leasingFilter === 'with') {
      result = result.filter(o => o._hasLeasing);
    } else if (leasingFilter === 'without') {
      result = result.filter(o => !o._hasLeasing);
    }

    if (completenessFilter === 'complete') {
      result = result.filter(o => o.opsSn && o.simId && o.displaySn);
    } else if (completenessFilter === 'incomplete') {
      result = result.filter(o => !o.opsSn || !o.simId || !o.displaySn);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(o =>
        (o.opsNr && o.opsNr.toLowerCase().includes(term)) ||
        (o.opsSn && o.opsSn.toLowerCase().includes(term)) ||
        (o.displaySn && o.displaySn.toLowerCase().includes(term)) ||
        (o.simId && String(o.simId).includes(term)) ||
        (o._locationName && o._locationName.toLowerCase().includes(term)) ||
        (o._city && o._city.toLowerCase().includes(term)) ||
        (o._jetId && o._jetId.toLowerCase().includes(term))
      );
    }

    return result;
  }, [enrichedOps, statusFilter, cityFilter, typeFilter, leasingFilter, completenessFilter, searchTerm]);

  // Reset page on filter change
  useEffect(() => { setOpsPage(0); }, [searchTerm, statusFilter, cityFilter, typeFilter, leasingFilter, completenessFilter]);

  const pagedOps = useMemo(() => {
    const start = opsPage * OPS_PAGE_SIZE;
    return filteredOps.slice(start, start + OPS_PAGE_SIZE);
  }, [filteredOps, opsPage]);

  const opsTotalPages = Math.ceil(filteredOps.length / OPS_PAGE_SIZE);

  /* OPS Serial Number lookup — for matching bank leasing records to OPS */
  const opsSnSet = useMemo(() => {
    const set = new Set();
    for (const ops of opsData) {
      if (ops.displaySn) set.add(ops.displaySn);
    }
    return set;
  }, [opsData]);

  /* Mietschein options for filter dropdown */
  const mietscheinOptions = useMemo(() => {
    const bank = leaseData.bank || [];
    const certSet = new Set();
    for (const b of bank) {
      if (b.rentalCertificate) certSet.add(b.rentalCertificate);
    }
    return Array.from(certSet).sort();
  }, [leaseData.bank]);

  /* Contract status breakdown */
  const contractStatusBreakdown = useMemo(() => {
    const bank = leaseData.bank || [];
    const map = {};
    for (const b of bank) {
      const status = b.contractStatus || 'Unbekannt';
      map[status] = (map[status] || 0) + 1;
    }
    return map;
  }, [leaseData.bank]);

  /* Lease KPIs */
  const leaseKpis = useMemo(() => {
    const bank = leaseData.bank || [];
    const chg = leaseData.chg || [];
    const totalMonthly = bank.reduce((sum, b) => sum + (b.monthlyPrice || 0), 0);
    const activeContracts = bank.filter(b => b.contractStatus === 'In Miete').length;
    const certificates = [...new Set(bank.map(b => b.rentalCertificate).filter(Boolean))];
    const matchedOps = bank.filter(b => b.serialNumber && opsSnSet.has(b.serialNumber)).length;
    const unmatchedOps = bank.length - matchedOps;
    return {
      bankAssets: bank.length,
      chgRecords: chg.length,
      totalMonthly,
      activeContracts,
      certificates: certificates.length,
      matchedOps,
      unmatchedOps,
    };
  }, [leaseData, opsSnSet]);

  /* Open orders */
  const openSwaps = useMemo(() => swaps.filter(s => s.status !== 'Done' && s.status !== 'Abgeschlossen'), [swaps]);
  const openDeinstalls = useMemo(() => deinstalls.filter(d => d.status !== 'Abgeschlossen'), [deinstalls]);

  /* ─── Filtered Leasing List ─── */
  const filteredLeaseBank = useMemo(() => {
    let result = leaseData.bank || [];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(b =>
        (b.assetId && b.assetId.toLowerCase().includes(term)) ||
        (b.serialNumber && b.serialNumber.toLowerCase().includes(term)) ||
        (b.rentalCertificate && b.rentalCertificate.toLowerCase().includes(term)) ||
        (b.designation && b.designation.toLowerCase().includes(term)) ||
        (b.city && b.city.toLowerCase().includes(term)) ||
        (b.installationLocation && b.installationLocation.toLowerCase().includes(term))
      );
    }
    if (cityFilter) {
      result = result.filter(b => b.city === cityFilter);
    }
    if (mietscheinFilter) {
      result = result.filter(b => b.rentalCertificate === mietscheinFilter);
    }
    return result;
  }, [leaseData.bank, searchTerm, cityFilter, mietscheinFilter]);

  /* ─── Filtered Swaps + Deinstalls ─── */
  const filteredSwaps = useMemo(() => {
    let result = swaps;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s =>
        (s.swapId && s.swapId.toLowerCase().includes(term)) ||
        (s.locationName && s.locationName.toLowerCase().includes(term)) ||
        (s.city && s.city.toLowerCase().includes(term)) ||
        (s.swapReason && s.swapReason.toLowerCase().includes(term))
      );
    }
    if (cityFilter) {
      result = result.filter(s => s.city === cityFilter);
    }
    return result;
  }, [swaps, searchTerm, cityFilter]);

  const filteredDeinstalls = useMemo(() => {
    let result = deinstalls;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(d =>
        (d.deinstallId && d.deinstallId.toLowerCase().includes(term)) ||
        (d.locationName && d.locationName.toLowerCase().includes(term)) ||
        (d.city && d.city.toLowerCase().includes(term)) ||
        (d.reason && d.reason.toLowerCase().includes(term))
      );
    }
    if (cityFilter) {
      result = result.filter(d => d.city === cityFilter);
    }
    return result;
  }, [deinstalls, searchTerm, cityFilter]);

  /* ─── Active filter count (for reset button) ─── */
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (statusFilter !== 'all') count++;
    if (cityFilter) count++;
    if (typeFilter) count++;
    if (leasingFilter) count++;
    if (completenessFilter) count++;
    if (mietscheinFilter) count++;
    return count;
  }, [searchTerm, statusFilter, cityFilter, typeFilter, leasingFilter, completenessFilter, mietscheinFilter]);

  const resetAllFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setCityFilter('');
    setTypeFilter('');
    setLeasingFilter('');
    setCompletenessFilter('');
    setMietscheinFilter('');
  }, []);

  /* ─── Completeness Analysis ─── */
  const completeness = useMemo(() => {
    const liveLocations = displayLocations.filter(l => l.onlineStatus === 'Live');
    const opsMap = new Map(); // displayLocationId → ops
    for (const ops of enrichedOps) {
      if (ops.displayLocationId) {
        if (!opsMap.has(ops.displayLocationId)) opsMap.set(ops.displayLocationId, []);
        opsMap.get(ops.displayLocationId).push(ops);
      }
    }

    const rows = liveLocations.map(loc => {
      const locationOps = opsMap.get(loc.id) || [];
      const hasOps = locationOps.length > 0;
      const hasSim = locationOps.some(o => !!o.simId);
      const hasDisplay = locationOps.some(o => !!o.displaySn);
      const jetId = loc.jetId || '';
      const hasLeasing = (jetId && leasingByJetId.has(jetId)) ||
        locationOps.some(o => o.opsSn && leasingBySn.has(o.opsSn));
      const complete = hasOps && hasSim && hasDisplay;

      return {
        ...loc,
        opsRecords: locationOps,
        hasOps, hasSim, hasDisplay, hasLeasing, complete,
      };
    });

    const total = rows.length;
    const completeCount = rows.filter(r => r.complete).length;
    const withoutOps = rows.filter(r => !r.hasOps).length;
    const withoutSim = rows.filter(r => !r.hasSim).length;
    const withoutDisplay = rows.filter(r => !r.hasDisplay).length;
    const withoutLeasing = rows.filter(r => !r.hasLeasing).length;

    return { rows, total, completeCount, withoutOps, withoutSim, withoutDisplay, withoutLeasing };
  }, [displayLocations, enrichedOps, leasingByJetId, leasingBySn]);

  /* ─── Timeline Events ─── */
  const timelineEvents = useMemo(() => {
    const events = [];

    for (const inst of installationen) {
      if (inst.installDate) {
        events.push({
          type: 'installation',
          date: inst.installDate,
          opsNr: inst.opsNr || '',
          displayIds: inst.displayIds || [],
          details: `${inst.installationType || 'Installation'} — ${inst.integrator || 'Unbekannt'}`,
          status: inst.status || '',
          icon: Wrench,
          color: '#22c55e',
        });
      }
    }

    for (const swap of swaps) {
      if (swap.swapDate) {
        events.push({
          type: 'swap',
          date: swap.swapDate,
          opsNr: '',
          locationName: swap.locationName || '',
          city: swap.city || '',
          details: `${(swap.swapType || []).join(', ')}${swap.swapReason ? ' — ' + swap.swapReason : ''}`,
          status: swap.status || '',
          icon: ArrowLeftRight,
          color: '#f59e0b',
        });
      }
    }

    for (const d of deinstalls) {
      if (d.deinstallDate) {
        events.push({
          type: 'deinstall',
          date: d.deinstallDate,
          opsNr: '',
          locationName: d.locationName || '',
          city: d.city || '',
          details: `${d.reason || 'Deinstallation'}${d.hardwareCondition ? ' — Zustand: ' + d.hardwareCondition : ''}`,
          status: d.status || '',
          icon: PackageX,
          color: '#ef4444',
        });
      }
    }

    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    return events;
  }, [installationen, swaps, deinstalls]);

  /* ─── Hardware Cross-System Mismatch Detection (all locations) ─── */
  const hwMismatches = useMemo(() => {
    const issues = [];

    // ═══ Build lookup maps ═══
    const chgByJetId = new Map();
    for (const chg of (leaseData.chg || [])) {
      if (chg.jetIdLocation) chgByJetId.set(chg.jetIdLocation, chg);
    }
    const bankBySn = new Map();
    const bankByAssetId = new Map();
    const bankByOrder = new Map();
    for (const bank of (leaseData.bank || [])) {
      if (bank.serialNumber) bankBySn.set(bank.serialNumber, bank);
      if (bank.assetId) bankByAssetId.set(bank.assetId, bank);
      if (bank.orderNumber) bankByOrder.set(bank.orderNumber, bank);
    }

    // SIM inventory lookup by record ID and by SIM-ID
    const simById = new Map();
    const simBySimId = new Map();
    for (const sim of simInventory) {
      simById.set(sim.id, sim);
      if (sim.simId) simBySimId.set(sim.simId, sim);
    }

    // Display inventory lookup by record ID and by serial number
    const displayById = new Map();
    const displayBySn = new Map();
    for (const disp of displayInventory) {
      displayById.set(disp.id, disp);
      if (disp.displaySerialNumber) displayBySn.set(disp.displaySerialNumber, disp);
    }

    // Group enriched OPS by displayLocationId (only those with a location)
    const opsByLocation = new Map();
    for (const ops of enrichedOps) {
      if (ops.displayLocationId && ops._location) {
        if (!opsByLocation.has(ops.displayLocationId)) {
          opsByLocation.set(ops.displayLocationId, []);
        }
        opsByLocation.get(ops.displayLocationId).push(ops);
      }
    }

    // Build display location navori lookup
    const locationNavoriMap = new Map();
    for (const loc of displayLocations) {
      if (loc.navoriVenueId) locationNavoriMap.set(loc.id, loc.navoriVenueId);
    }

    // ═══ Iterate over each location's OPS records ═══
    for (const [locId, locationOps] of opsByLocation) {
      const loc = locationMap.get(locId);
      if (!loc) continue;

      const locationName = loc.locationName || '';
      const city = loc.city || '';
      const jetId = loc.jetId || '';
      const locationNavoriId = locationNavoriMap.get(locId) || '';

      for (const ops of locationOps) {
        const hwDisplaySn = ops.displaySn || '';
        const hwOpsSn = ops.opsSn || '';
        const opsNavoriId = ops.navoriVenueId || '';
        const isActive = (ops.status || '').toLowerCase() === 'active';

        // Get CHG record for this JET ID
        const chg = jetId ? chgByJetId.get(jetId) : null;
        const chgDisplaySn = chg?.displaySn || '';
        const chgAssetId = chg?.assetId || '';

        // Get Bank record for this display SN
        const bank = hwDisplaySn ? bankBySn.get(hwDisplaySn) : null;
        const bankSerial = bank?.serialNumber || '';

        // Also try bank match by OPS SN (some bank records use OPS SN)
        const bankByOpsSn = hwOpsSn ? bankBySn.get(hwOpsSn) : null;

        // Try bank match by JET ID (order_number can match JET ID)
        const bankByJet = jetId ? bankByOrder.get(jetId) : null;

        // Get linked SIM record
        const linkedSim = ops.simRecordId ? simById.get(ops.simRecordId) : null;

        // Get linked Display record
        const linkedDisplay = ops.displayRecordId ? displayById.get(ops.displayRecordId) : null;

        // ════════════════════════════════════════════════════
        // DISPLAY-SN CROSS-CHECKS
        // ════════════════════════════════════════════════════

        // ── 1) CHG Display-SN ≠ OPS Display-SN
        if (chgDisplaySn && hwDisplaySn && chgDisplaySn !== hwDisplaySn) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Display-SN',
            source1: 'hardware_ops',
            field1: 'display_sn',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: hwDisplaySn,
            source2: 'chg_approvals',
            field2: 'display_sn',
            sourceLabel2: 'CHG Leasing',
            value2: chgDisplaySn,
          });
        }

        // ── 2) Bank Serial ≠ OPS Display-SN
        if (bank && bankSerial && hwDisplaySn && bankSerial !== hwDisplaySn) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Display-SN',
            source1: 'hardware_ops',
            field1: 'display_sn',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: hwDisplaySn,
            source2: 'bank_leasing',
            field2: 'serial_number',
            sourceLabel2: 'Bank TESMA Leasing',
            value2: bankSerial,
          });
        }

        // ── 3) CHG Display-SN ≠ Bank Serial
        if (chgDisplaySn && bankSerial && chgDisplaySn !== bankSerial) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Display-SN',
            source1: 'chg_approvals',
            field1: 'display_sn',
            sourceLabel1: 'CHG Leasing',
            value1: chgDisplaySn,
            source2: 'bank_leasing',
            field2: 'serial_number',
            sourceLabel2: 'Bank TESMA Leasing',
            value2: bankSerial,
          });
        }

        // ── 4) OPS Display-SN ≠ Display Inventory SN (linked record)
        if (linkedDisplay && linkedDisplay.displaySerialNumber && hwDisplaySn
            && linkedDisplay.displaySerialNumber !== hwDisplaySn) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Display-SN',
            source1: 'hardware_ops',
            field1: 'display_sn',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: hwDisplaySn,
            source2: 'hardware_displays',
            field2: 'display_serial_number',
            sourceLabel2: 'Display Inventory (Airtable)',
            value2: linkedDisplay.displaySerialNumber,
          });
        }

        // ════════════════════════════════════════════════════
        // SIM-ID CROSS-CHECKS
        // ════════════════════════════════════════════════════

        // ── 5) OPS SIM-ID ≠ SIM Inventory SIM-ID (linked record)
        if (linkedSim && linkedSim.simId && ops.simId
            && linkedSim.simId !== ops.simId) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'SIM-ID',
            source1: 'hardware_ops',
            field1: 'sim_id',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: ops.simId,
            source2: 'hardware_sim',
            field2: 'sim_id',
            sourceLabel2: 'SIM Inventory (Airtable)',
            value2: linkedSim.simId,
          });
        }

        // ── 6) OPS aktiv, hat SIM-Link, aber SIM-Record existiert nicht
        if (isActive && ops.simRecordId && !linkedSim) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'SIM-Zuordnung',
            source1: 'hardware_ops',
            field1: 'sim_record_id',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: `Link: ${ops.simRecordId.substring(0, 12)}...`,
            source2: 'hardware_sim',
            field2: 'id',
            sourceLabel2: 'SIM Inventory (Airtable)',
            value2: '(nicht gefunden)',
          });
        }

        // ── 7) OPS aktiv, aber keine SIM-ID zugeordnet
        if (isActive && !ops.simId && ops.displayLocationId) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Fehlende SIM',
            source1: 'hardware_ops',
            field1: 'sim_id',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: '(leer)',
            source2: 'hardware_ops',
            field2: 'status',
            sourceLabel2: 'OPS Status',
            value2: 'active — ohne SIM',
          });
        }

        // ── 8) SIM-Record zeigt auf anderen OPS (Rückverweis-Check)
        if (linkedSim && linkedSim.opsRecordId && linkedSim.opsRecordId !== ops.id) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'SIM-Zuordnung',
            source1: 'hardware_ops',
            field1: 'id → sim_record_id',
            sourceLabel1: 'OPS → SIM Link',
            value1: `OPS-${ops.opsNr}`,
            source2: 'hardware_sim',
            field2: 'ops_record_id',
            sourceLabel2: 'SIM → OPS Rückverweis',
            value2: `zeigt auf anderes OPS`,
          });
        }

        // ════════════════════════════════════════════════════
        // DISPLAY LINKAGE CROSS-CHECKS
        // ════════════════════════════════════════════════════

        // ── 9) OPS aktiv, hat Display-Link, aber Display-Record existiert nicht
        if (isActive && ops.displayRecordId && !linkedDisplay) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Display-Zuordnung',
            source1: 'hardware_ops',
            field1: 'display_record_id',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: `Link: ${ops.displayRecordId.substring(0, 12)}...`,
            source2: 'hardware_displays',
            field2: 'id',
            sourceLabel2: 'Display Inventory (Airtable)',
            value2: '(nicht gefunden)',
          });
        }

        // ── 10) Display-Record zeigt auf anderen OPS (Rückverweis-Check)
        if (linkedDisplay && linkedDisplay.opsRecordId && linkedDisplay.opsRecordId !== ops.id) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Display-Zuordnung',
            source1: 'hardware_ops',
            field1: 'id → display_record_id',
            sourceLabel1: 'OPS → Display Link',
            value1: `OPS-${ops.opsNr}`,
            source2: 'hardware_displays',
            field2: 'ops_record_id',
            sourceLabel2: 'Display → OPS Rückverweis',
            value2: `zeigt auf anderes OPS`,
          });
        }

        // ════════════════════════════════════════════════════
        // JET-ID & ASSET-ID CROSS-CHECKS
        // ════════════════════════════════════════════════════

        // ── 11) CHG Asset-ID ≠ Bank Asset-ID (gleicher Standort)
        if (chgAssetId && bank) {
          const bankAssetId = bank.assetId || '';
          if (bankAssetId && chgAssetId !== bankAssetId) {
            issues.push({
              locationId: locId, locationName, city, jetId,
              opsNr: ops.opsNr || '',
              type: 'Asset-ID',
              source1: 'chg_approvals',
              field1: 'asset_id',
              sourceLabel1: 'CHG Leasing',
              value1: chgAssetId,
              source2: 'bank_leasing',
              field2: 'asset_id',
              sourceLabel2: 'Bank TESMA Leasing',
              value2: bankAssetId,
            });
          }
        }

        // ── 12) Bank order_number (JET-ID) ≠ Location JET-ID
        if (bank && bank.orderNumber && jetId && bank.orderNumber !== jetId) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'JET-ID',
            source1: 'airtable_displays',
            field1: 'jet_id',
            sourceLabel1: 'Display Locations (Airtable)',
            value1: jetId,
            source2: 'bank_leasing',
            field2: 'order_number',
            sourceLabel2: 'Bank TESMA Leasing',
            value2: bank.orderNumber,
          });
        }

        // ── 13) Bank matched by JET-ID has different Display-SN
        if (bankByJet && hwDisplaySn && bankByJet.serialNumber
            && bankByJet.serialNumber !== hwDisplaySn && bankByJet !== bank) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'JET-ID → SN',
            source1: 'hardware_ops',
            field1: 'display_sn',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: hwDisplaySn,
            source2: 'bank_leasing',
            field2: `serial_number (via order_number=${jetId})`,
            sourceLabel2: 'Bank TESMA (per JET-ID)',
            value2: bankByJet.serialNumber,
          });
        }

        // ════════════════════════════════════════════════════
        // NAVORI VENUE-ID CHECKS
        // ════════════════════════════════════════════════════

        // ── 14) Navori Venue ID: Display-Tabelle ≠ OPS-Tabelle
        if (locationNavoriId && opsNavoriId && locationNavoriId !== opsNavoriId) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Navori Venue-ID',
            source1: 'airtable_displays',
            field1: 'navori_venue_id',
            sourceLabel1: 'Display Locations (Airtable)',
            value1: locationNavoriId,
            source2: 'hardware_ops',
            field2: 'navori_venue_id',
            sourceLabel2: 'OPS Inventory (Airtable)',
            value2: opsNavoriId,
          });
        }

        // ── 15) OPS hat Navori-ID, aber Location nicht
        if (opsNavoriId && !locationNavoriId && ops.displayLocationId) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Fehlende Venue-ID',
            source1: 'hardware_ops',
            field1: 'navori_venue_id',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: opsNavoriId,
            source2: 'airtable_displays',
            field2: 'navori_venue_id',
            sourceLabel2: 'Display Locations (Airtable)',
            value2: '(leer)',
          });
        }

        // ════════════════════════════════════════════════════
        // FEHLENDE DATEN CHECKS
        // ════════════════════════════════════════════════════

        // ── 16) OPS aktiv, aber kein CHG-Leasing vorhanden
        if (hwDisplaySn && isActive && jetId && !chg) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Fehlendes Leasing',
            source1: 'hardware_ops',
            field1: 'status = active',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: `OPS-${ops.opsNr || '?'} aktiv`,
            source2: 'chg_approvals',
            field2: 'jet_id_location',
            sourceLabel2: 'CHG Leasing',
            value2: '(kein Eintrag)',
          });
        }

        // ── 17) OPS aktiv, aber kein Bank-Leasing vorhanden
        if (hwDisplaySn && isActive && !bank && !bankByOpsSn) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Fehlendes Leasing',
            source1: 'hardware_ops',
            field1: 'status = active, display_sn',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: `SN: ${hwDisplaySn}`,
            source2: 'bank_leasing',
            field2: 'serial_number',
            sourceLabel2: 'Bank TESMA Leasing',
            value2: '(kein Eintrag)',
          });
        }

        // ── 18) Display-SN leer obwohl OPS aktiv
        if (!hwDisplaySn && isActive) {
          issues.push({
            locationId: locId, locationName, city, jetId,
            opsNr: ops.opsNr || '',
            type: 'Fehlende SN',
            source1: 'hardware_ops',
            field1: 'display_sn',
            sourceLabel1: 'OPS Inventory (Airtable)',
            value1: '(leer)',
            source2: 'hardware_ops',
            field2: 'status',
            sourceLabel2: 'OPS Status',
            value2: 'active',
          });
        }
      }
    }

    return issues;
  }, [enrichedOps, leaseData, displayLocations, locationMap, simInventory, displayInventory]);

  /* ─── Fehler tab state ─── */
  const [fehlerSearch, setFehlerSearch] = useState('');
  const [fehlerTypeFilter, setFehlerTypeFilter] = useState('');
  const [expandedLocations, setExpandedLocations] = useState(new Set());

  const fehlerStats = useMemo(() => {
    const byType = {};
    const locationSet = new Set();
    for (const m of hwMismatches) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      locationSet.add(m.locationId);
    }
    return {
      total: hwMismatches.length,
      byType,
      locationsAffected: locationSet.size,
      types: Object.keys(byType).sort(),
    };
  }, [hwMismatches]);

  const filteredMismatches = useMemo(() => {
    let result = hwMismatches;
    if (fehlerTypeFilter) {
      result = result.filter(m => m.type === fehlerTypeFilter);
    }
    if (fehlerSearch) {
      const term = fehlerSearch.toLowerCase();
      result = result.filter(m =>
        (m.locationName && m.locationName.toLowerCase().includes(term)) ||
        (m.jetId && m.jetId.toLowerCase().includes(term)) ||
        (m.city && m.city.toLowerCase().includes(term)) ||
        (m.opsNr && m.opsNr.toLowerCase().includes(term)) ||
        (m.value1 && m.value1.toLowerCase().includes(term)) ||
        (m.value2 && m.value2.toLowerCase().includes(term))
      );
    }
    return result;
  }, [hwMismatches, fehlerTypeFilter, fehlerSearch]);

  /* ─── Group mismatches by location ─── */
  const groupedByLocation = useMemo(() => {
    const groups = new Map();
    for (const m of filteredMismatches) {
      const key = m.locationId || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          locationId: m.locationId,
          locationName: m.locationName,
          city: m.city,
          jetId: m.jetId,
          issues: [],
          typeSet: new Set(),
        });
      }
      const group = groups.get(key);
      group.issues.push(m);
      group.typeSet.add(m.type);
    }
    // Convert to sorted array (most errors first)
    return Array.from(groups.values())
      .sort((a, b) => b.issues.length - a.issues.length);
  }, [filteredMismatches]);

  /* ─── Filtered Completeness Rows ─── */
  const filteredCompletenessRows = useMemo(() => {
    let result = completeness.rows;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        (r.locationName && r.locationName.toLowerCase().includes(term)) ||
        (r.jetId && r.jetId.toLowerCase().includes(term)) ||
        (r.city && r.city.toLowerCase().includes(term))
      );
    }
    if (cityFilter) {
      result = result.filter(r => r.city === cityFilter);
    }
    if (completenessFilter === 'complete') {
      result = result.filter(r => r.complete);
    } else if (completenessFilter === 'incomplete') {
      result = result.filter(r => !r.complete);
    }
    return result;
  }, [completeness.rows, searchTerm, cityFilter, completenessFilter]);

  /* ─── Filtered Timeline Events ─── */
  const filteredTimeline = useMemo(() => {
    let result = timelineEvents;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(e =>
        (e.opsNr && e.opsNr.toLowerCase().includes(term)) ||
        (e.locationName && e.locationName.toLowerCase().includes(term)) ||
        (e.city && e.city.toLowerCase().includes(term)) ||
        (e.details && e.details.toLowerCase().includes(term))
      );
    }
    if (cityFilter) {
      result = result.filter(e => e.city && e.city === cityFilter);
    }
    return result;
  }, [timelineEvents, searchTerm, cityFilter]);

  const fmtDate = (d) => {
    if (!d) return '–';
    try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        <span className="ml-2 text-sm text-slate-500">Lade Hardware-Daten...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <HardDrive size={20} className="text-slate-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Hardware Inventory</h1>
            <p className="text-xs text-slate-500">{kpis.total} OPS-Einheiten &bull; {leaseKpis.bankAssets} Leasing-Assets &bull; {completeness.total} Live-Standorte</p>
          </div>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/60 border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white transition-colors"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      {/* KPI Cards — Derived Hardware Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Gesamt" value={kpis.total} icon={HardDrive} color="#3b82f6" />
        <KpiCard label="Live" value={kpis.live} icon={Radio} color="#22c55e" subtitle={`${kpis.total ? Math.round(kpis.live / kpis.total * 100) : 0}%`} />
        <KpiCard label="Lager" value={kpis.hwWarehouse} icon={Package} color="#3b82f6" />
        <KpiCard label="Beim Monteur" value={kpis.hwInstaller} icon={Truck} color="#f59e0b" />
        <KpiCard label="Defekt" value={kpis.hwDefect} icon={AlertTriangle} color="#ef4444" />
        <KpiCard label="Deinstalliert" value={kpis.hwDeinstalled} icon={XCircle} color="#f97316" />
        <KpiCard label="Vollst." value={`${completeness.completeCount}/${completeness.total}`} icon={ShieldCheck} color="#22c55e" subtitle={completeness.total > 0 ? `${Math.round(completeness.completeCount / completeness.total * 100)}% komplett` : ''} />
        <KpiCard label="Leasing" value={`${leaseKpis.totalMonthly.toLocaleString('de-DE', { maximumFractionDigits: 0 })}€/mo`} icon={Landmark} color="#8b5cf6" subtitle={`${leaseKpis.certificates} Mietscheine`} />
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-0 bg-white/40 backdrop-blur-sm border border-slate-200/60 rounded-xl p-1 overflow-x-auto">
        {[
          { id: 'ops', label: 'OPS Inventory', icon: Cpu, count: kpis.total },
          { id: 'completeness', label: 'Vollst.', icon: ClipboardCheck, count: completeness.withoutOps + completeness.withoutSim + completeness.withoutDisplay },
          { id: 'leasing', label: 'Leasing', icon: Landmark, count: leaseKpis.bankAssets },
          { id: 'orders', label: 'Auftr.', icon: ArrowLeftRight, count: openSwaps.length + openDeinstalls.length },
          { id: 'timeline', label: 'Timeline', icon: History, count: timelineEvents.length },
          { id: 'fehler', label: 'Fehler', icon: ShieldAlert, count: hwMismatches.length || null },
          { id: 'data-quality', label: 'Datenqualität', icon: Database, count: null },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center whitespace-nowrap ${
                isActive
                  ? 'bg-white shadow-sm text-slate-800 border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-600'
              }`}
            >
              <Icon size={13} />
              {tab.label}
              {tab.count !== null && (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-slate-100 text-slate-600' : 'bg-transparent text-slate-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ GLOBAL FILTER BAR ═══ */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03] overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="OPS-Nr, SN, SIM-ID, Standort, Stadt..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none"
          >
            <option value="all">Alle Status</option>
            {Object.entries(kpis.byHwStatus).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
              const statusInfo = {
                live: 'Live', warehouse: 'Lager', installer: 'Beim Monteur',
                defect: 'Defekt', deinstalled: 'Deinstalliert',
                to_be_deinstalled: 'Deinstall geplant', to_be_swapped: 'Tausch geplant',
                test: 'Test-Gerät', assigned: 'Zugeordnet', unknown: 'Unbekannt',
              };
              return <option key={key} value={key}>{statusInfo[key] || key} ({count})</option>;
            })}
          </select>
          {/* City */}
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none"
          >
            <option value="">Alle Städte</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* Hardware Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none"
          >
            <option value="">Alle Typen</option>
            {hardwareTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Leasing */}
          <select
            value={leasingFilter}
            onChange={(e) => setLeasingFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none"
          >
            <option value="">Leasing: Alle</option>
            <option value="with">Mit Leasing</option>
            <option value="without">Ohne Leasing</option>
          </select>
          {/* Completeness */}
          <select
            value={completenessFilter}
            onChange={(e) => setCompletenessFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none"
          >
            <option value="">Vollst.: Alle</option>
            <option value="complete">Komplett (OPS+SIM+Display)</option>
            <option value="incomplete">Unvollständig</option>
          </select>
          {/* Mietschein filter — shown on Leasing tab */}
          {activeSection === 'leasing' && mietscheinOptions.length > 0 && (
            <select
              value={mietscheinFilter}
              onChange={(e) => setMietscheinFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/40 text-xs focus:outline-none text-amber-700"
            >
              <option value="">Alle Mietscheine</option>
              {mietscheinOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {/* Result count + Reset */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-500 font-mono">
              {activeSection === 'ops' ? `${filteredOps.length} OPS` :
               activeSection === 'completeness' ? `${filteredCompletenessRows.length} Standorte` :
               activeSection === 'leasing' ? `${filteredLeaseBank.length} Assets` :
               activeSection === 'orders' ? `${filteredSwaps.length + filteredDeinstalls.length} Aufträge` :
               activeSection === 'timeline' ? `${filteredTimeline.length} Events` :
               activeSection === 'fehler' ? `${filteredMismatches.length} Fehler` : ''}
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={resetAllFilters}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors border border-red-200"
              >
                <XCircle size={11} />
                {activeFilterCount} Filter zurücksetzen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ OPS INVENTORY TABLE ═══ */}
      {activeSection === 'ops' && (
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03] overflow-hidden">

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/40">
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">OPS-Nr</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Standort</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Stadt</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">JET-ID</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">OPS-SN</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">SIM</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Display</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Leasing</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Online</th>
                </tr>
              </thead>
              <tbody>
                {pagedOps.map((ops) => {
                  const hwStatus = ops._hwStatus;
                  const isExpanded = expandedOps === ops.id;
                  return (
                    <React.Fragment key={ops.id}>
                      <tr
                        className={`border-b border-slate-100/60 hover:bg-slate-50/40 transition-colors cursor-pointer ${isExpanded ? 'bg-slate-50/60' : ''}`}
                        onClick={() => setExpandedOps(isExpanded ? null : ops.id)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {isExpanded ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                            <span className="font-mono font-semibold text-slate-700">{ops.opsNr || '–'}</span>
                            {ops._siblingOpsCount > 1 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                                {ops._siblingOpsCount} OPS
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: hwStatus.bg, color: hwStatus.color, border: `1px solid ${hwStatus.color}33` }}
                          >
                            {hwStatus.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-[150px] truncate" title={ops._locationName}>
                          {ops._locationName || <span className="text-slate-500">–</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 text-sm">{ops._city || '–'}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500 text-sm">{ops._jetId || '–'}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500 text-sm">{ops.opsSn || '–'}</td>
                        <td className="px-3 py-2.5">
                          {ops.simId ? (
                            ops.simIdImprecise
                              ? <span className="text-amber-500 text-xs" title="ICCID ungenau">⚠</span>
                              : <CheckCircle2 size={12} className="text-emerald-500" />
                          ) : <span className="text-slate-500 text-xs">✗</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {ops.displaySn
                            ? <CheckCircle2 size={12} className="text-emerald-500" />
                            : <span className="text-slate-500 text-xs">✗</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {ops._hasLeasing
                            ? <CreditCard size={12} className="text-violet-500" />
                            : <span className="text-slate-500 text-xs">–</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {ops._onlineStatus ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                              ops._onlineStatus === 'Live' ? 'text-emerald-600' : 'text-slate-500'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                ops._onlineStatus === 'Live' ? 'bg-emerald-500' : 'bg-slate-300'
                              }`} />
                              {ops._onlineStatus}
                            </span>
                          ) : (
                            <span className="text-slate-500">–</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={10} className="px-4 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {/* Hardware Info */}
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Hardware</div>
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Status:</span>
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                      style={{ backgroundColor: hwStatus.bg, color: hwStatus.color, border: `1px solid ${hwStatus.color}33` }}
                                    >
                                      {hwStatus.label}
                                    </span>
                                  </div>
                                  <div className="flex justify-between"><span className="text-slate-500">Airtable-Status:</span><span className="font-mono text-slate-500 text-xs">{ops.status || '–'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">OPS-SN:</span><span className="font-mono text-slate-700">{ops.opsSn || '–'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Typ:</span><span className="text-slate-700">{ops.hardwareType || '–'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Display-SN:</span><span className="font-mono text-slate-700">{ops.displaySn || '–'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">SIM-ID:</span><span className="font-mono text-slate-700">{ops.simId ? (ops.simIdImprecise ? '⚠ ungenau' : ops.simId) : '–'}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Navori Venue:</span><span className="font-mono text-slate-700">{ops.navoriVenueId || '–'}</span></div>
                                  {ops.note && <div className="mt-1 p-2 bg-amber-50 rounded-lg text-amber-700 text-xs">{ops.note}</div>}
                                </div>
                              </div>

                              {/* Location Info */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Standort</div>
                                  {ops._siblingOpsCount > 1 && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                                      {ops._siblingOpsCount} OPS an diesem Standort
                                    </span>
                                  )}
                                </div>
                                {ops._location ? (
                                  <div className="space-y-1">
                                    <div className="flex justify-between"><span className="text-slate-500">Name:</span><span className="text-slate-700 font-medium">{ops._location.locationName || '–'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Stadt:</span><span className="text-slate-700">{ops._location.city || '–'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">JET-ID:</span><span className="font-mono text-slate-700">{ops._location.jetId || '–'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Adresse:</span><span className="text-slate-700">{[ops._location.street, ops._location.streetNumber].filter(Boolean).join(' ') || '–'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">PLZ:</span><span className="font-mono text-slate-700">{ops._location.postalCode || '–'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Live seit:</span><span className="text-slate-700">{fmtDate(ops._location.liveSince)}</span></div>
                                    {/* List all OPS at this location when multiple */}
                                    {ops._siblingOpsCount > 1 && (
                                      <div className="mt-2 p-2 bg-amber-50/60 rounded-lg border border-amber-200/50">
                                        <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Alle OPS an diesem Standort</div>
                                        <div className="flex flex-wrap gap-1">
                                          {ops._siblingOps.map(sibling => (
                                            <span
                                              key={sibling.id}
                                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${
                                                sibling.id === ops.id
                                                  ? 'bg-amber-200 text-amber-800 font-bold'
                                                  : 'bg-white text-slate-600 border border-slate-200'
                                              }`}
                                            >
                                              {sibling.opsNr || sibling.opsSn || '–'}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-slate-500 text-xs">Kein Standort zugeordnet</div>
                                )}
                              </div>

                              {/* Leasing Info */}
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Leasing</div>
                                {ops._chgRecords.length > 0 ? (
                                  <div className="space-y-1">
                                    {ops._chgRecords.map((chg, i) => (
                                      <div key={i} className="p-2 bg-violet-50/50 rounded-lg space-y-0.5">
                                        <div className="flex justify-between"><span className="text-slate-500">Asset-ID:</span><span className="font-mono text-slate-700">{chg.assetId || '–'}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-500">Mietschein:</span><span className="font-mono text-slate-700">{chg.chgCertificate || '–'}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-500">Laufzeit:</span><span className="text-slate-700">{fmtDate(chg.rentalStart)} → {fmtDate(chg.rentalEnd)}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-500">Status:</span><span className="text-slate-700">{chg.status || '–'}</span></div>
                                      </div>
                                    ))}
                                  </div>
                                ) : ops._bankRecord ? (
                                  <div className="p-2 bg-violet-50/50 rounded-lg space-y-0.5">
                                    <div className="flex justify-between"><span className="text-slate-500">Asset:</span><span className="font-mono text-slate-700">{ops._bankRecord.assetId || '–'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Mietschein:</span><span className="font-mono text-slate-700">{ops._bankRecord.rentalCertificate || '–'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">€/Monat:</span><span className="font-mono text-slate-700 font-medium">{ops._bankRecord.monthlyPrice ? `${ops._bankRecord.monthlyPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}€` : '–'}</span></div>
                                  </div>
                                ) : (
                                  <div className="text-slate-500 text-xs">Kein Leasing-Eintrag gefunden</div>
                                )}
                              </div>
                            </div>
                            {/* Edit Button */}
                            <div className="mt-3 pt-3 border-t border-slate-200/40 flex justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowEditWarning(true); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                              >
                                <Pencil size={12} />
                                Bearbeiten
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {opsTotalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/40">
              <span className="text-xs text-slate-500 font-mono">
                Seite {opsPage + 1} von {opsTotalPages} ({filteredOps.length} Eintr.)
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setOpsPage(Math.max(0, opsPage - 1))}
                  disabled={opsPage === 0}
                  className="px-3 py-1 text-xs font-mono rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Zurück
                </button>
                <button
                  onClick={() => setOpsPage(Math.min(opsTotalPages - 1, opsPage + 1))}
                  disabled={opsPage >= opsTotalPages - 1}
                  className="px-3 py-1 text-xs font-mono rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Weiter →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ COMPLETENESS CHECK ═══ */}
      {activeSection === 'completeness' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Live Standorte" value={completeness.total} icon={MapPin} color="#3b82f6" />
            <KpiCard label="Vollständig" value={completeness.completeCount} icon={ShieldCheck} color="#22c55e" subtitle={completeness.total > 0 ? `${Math.round(completeness.completeCount / completeness.total * 100)}%` : ''} />
            <KpiCard label="Ohne OPS" value={completeness.withoutOps} icon={Cpu} color="#ef4444" />
            <KpiCard label="Ohne SIM" value={completeness.withoutSim} icon={Wifi} color="#f59e0b" />
            <KpiCard label="Ohne Display" value={completeness.withoutDisplay} icon={Monitor} color="#f97316" />
            <KpiCard label="Ohne Leasing" value={completeness.withoutLeasing} icon={CreditCard} color="#8b5cf6" />
          </div>

          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/40">
              <h3 className="text-sm font-semibold text-slate-700">Hardware-Vollständigkeit pro Live-Standort</h3>
              <p className="text-xs text-slate-500">Jeder Live-Standort benötigt: OPS + SIM + Display. Leasing wird als Bonus geprüft.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/40">
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Standort</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">JET-ID</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Stadt</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase">OPS</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase">SIM</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase">Display</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase">Leasing</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompletenessRows
                    .sort((a, b) => (a.complete === b.complete ? 0 : a.complete ? 1 : -1))
                    .map((row) => (
                      <tr key={row.id} className="border-b border-slate-100/60 hover:bg-slate-50/40">
                        <td className="px-3 py-2 text-slate-700 font-medium max-w-[180px] truncate">{row.locationName || '–'}</td>
                        <td className="px-3 py-2 font-mono text-slate-500 text-sm">{row.jetId || '–'}</td>
                        <td className="px-3 py-2 text-slate-500">{row.city || '–'}</td>
                        <td className="px-3 py-2 text-center">
                          {row.hasOps ? (
                            <div className="inline-flex flex-col items-center gap-0.5">
                              {row.opsRecords.length > 1 ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                                  {row.opsRecords.length} OPS
                                </span>
                              ) : (
                                <CheckCircle2 size={14} className="text-emerald-500 inline" />
                              )}
                            </div>
                          ) : (
                            <AlertTriangle size={14} className="text-red-500 inline" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasSim
                            ? <CheckCircle2 size={14} className="text-emerald-500 inline" />
                            : <AlertTriangle size={14} className="text-amber-500 inline" />}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasDisplay
                            ? <CheckCircle2 size={14} className="text-emerald-500 inline" />
                            : <AlertTriangle size={14} className="text-orange-500 inline" />}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasLeasing
                            ? <CheckCircle2 size={14} className="text-violet-500 inline" />
                            : <span className="text-slate-500 text-xs">–</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.complete ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Komplett
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                              Lückenhaft
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LEASING OVERVIEW ═══ */}
      {activeSection === 'leasing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCard label="Bank-Assets" value={leaseKpis.bankAssets} icon={Landmark} color="#8b5cf6" />
            <KpiCard label="Aktive Verträge" value={leaseKpis.activeContracts} icon={CheckCircle2} color="#22c55e" subtitle={`${leaseKpis.bankAssets > 0 ? Math.round(leaseKpis.activeContracts / leaseKpis.bankAssets * 100) : 0}% aktiv`} />
            <KpiCard label="Monatliche Kosten" value={`${leaseKpis.totalMonthly.toLocaleString('de-DE', { maximumFractionDigits: 0 })}€`} icon={CreditCard} color="#f59e0b" subtitle="Gesamt pro Monat" />
            <KpiCard label="Mietscheine" value={leaseKpis.certificates} icon={Hash} color="#3b82f6" />
            <KpiCard label="OPS-Match" value={leaseKpis.matchedOps} icon={CheckCircle2} color="#22c55e" subtitle={`${leaseKpis.unmatchedOps} ohne OPS`} />
            <KpiCard label="CHG Records" value={leaseKpis.chgRecords} icon={Monitor} color="#8b5cf6" />
          </div>

          {/* Contract Status Breakdown */}
          {Object.keys(contractStatusBreakdown).length > 1 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(contractStatusBreakdown).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <span key={status} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  status === 'In Miete' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : status === 'Zurückgegeben' ? 'bg-slate-50 text-slate-500 border-slate-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className="font-bold font-mono">{count}</span>
                  {status}
                </span>
              ))}
            </div>
          )}

          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/40">
              <h3 className="text-sm font-semibold text-slate-700">Bank/CHG Leasing-Assets</h3>
              <p className="text-xs text-slate-500">
                {filteredLeaseBank.length} von {leaseKpis.bankAssets} Assets
                {mietscheinFilter && <span className="text-amber-600"> &bull; Mietschein: {mietscheinFilter}</span>}
                {' '}&bull; Gesamt {leaseKpis.totalMonthly.toLocaleString('de-DE', { minimumFractionDigits: 2 })}€/Monat
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/40">
                    <th className="text-center px-2 py-2 text-xs font-medium text-slate-500 uppercase" title="OPS-Match">OPS</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Seriennummer</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Installationsort</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Mietschein</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-slate-500 uppercase">€/Monat</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Mietbeginn</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Gepl. Ende</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase">Vertragsstatus</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaseBank.slice(0, 150).map((item, i) => {
                    const hasOps = item.serialNumber && opsSnSet.has(item.serialNumber);
                    const isExpiring = item.rentalEndPlanned && new Date(item.rentalEndPlanned) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                    return (
                      <tr key={item.assetId || i} className={`border-b border-slate-100/60 hover:bg-slate-50/40 ${isExpiring && item.contractStatus === 'In Miete' ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-2 py-2 text-center">
                          {hasOps ? (
                            <CheckCircle2 size={13} className="text-emerald-500 inline" />
                          ) : (
                            <span className="text-red-400 font-bold text-xs">✗</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-slate-700">{item.serialNumber || '–'}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={item.installationLocation}>
                          {item.installationLocation || '–'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-500">{item.rentalCertificate || '–'}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700 font-medium">
                          {item.monthlyPrice ? `${item.monthlyPrice.toLocaleString('de-DE', { minimumFractionDigits: 2 })}€` : '–'}
                        </td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-sm">{fmtDate(item.rentalStart)}</td>
                        <td className="px-3 py-2 font-mono text-sm">
                          <span className={isExpiring && item.contractStatus === 'In Miete' ? 'text-amber-600 font-medium' : 'text-slate-500'}>
                            {fmtDate(item.rentalEndPlanned)}
                            {isExpiring && item.contractStatus === 'In Miete' && (
                              <AlertTriangle size={10} className="inline ml-1 text-amber-500" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.contractStatus === 'In Miete'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : item.contractStatus === 'Zurückgegeben'
                                ? 'bg-slate-50 text-slate-500 border border-slate-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {item.contractStatus || '–'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredLeaseBank.length > 150 && (
              <div className="px-4 py-2.5 text-center text-xs text-slate-500 border-t border-slate-200/40">
                Zeige 150 von {filteredLeaseBank.length} Assets
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ORDERS (Swaps + Deinstalls) ═══ */}
      {activeSection === 'orders' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Offene Tausch-Aufträge" value={openSwaps.length} icon={ArrowLeftRight} color="#f59e0b" subtitle={`${swaps.length} gesamt`} />
            <KpiCard label="Offene Deinstallationen" value={openDeinstalls.length} icon={PackageX} color="#ef4444" subtitle={`${deinstalls.length} gesamt`} />
          </div>

          {/* Swaps */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/40 flex items-center gap-2">
              <ArrowLeftRight size={14} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-700">Hardware-Tausch Aufträge</h3>
              <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{filteredSwaps.length}</span>
            </div>
            {filteredSwaps.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">Keine Tausch-Aufträge vorhanden</div>
            ) : (
              <div className="divide-y divide-slate-100/60">
                {filteredSwaps.map((swap) => {
                  const isDone = swap.status === 'Done' || swap.status === 'Abgeschlossen';
                  return (
                    <div key={swap.id} className={`px-4 py-3 ${isDone ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-slate-700">{swap.swapId || swap.id?.substring(0, 8)}</span>
                          {swap.locationName && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <MapPin size={10} /> {swap.locationName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">{fmtDate(swap.swapDate)}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            isDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>{swap.status || '–'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {(swap.swapType || []).join(', ')}{swap.swapReason ? ` — ${swap.swapReason}` : ''}
                      </div>
                      {swap.defectDescription && (
                        <div className="text-xs text-slate-500 mt-0.5">{swap.defectDescription}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Deinstalls */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/40 flex items-center gap-2">
              <PackageX size={14} className="text-red-500" />
              <h3 className="text-sm font-semibold text-slate-700">Deinstallationen</h3>
              <span className="text-xs font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{filteredDeinstalls.length}</span>
            </div>
            {filteredDeinstalls.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">Keine Deinstallationen vorhanden</div>
            ) : (
              <div className="divide-y divide-slate-100/60">
                {filteredDeinstalls.map((d) => {
                  const isDone = d.status === 'Abgeschlossen';
                  return (
                    <div key={d.id} className={`px-4 py-3 ${isDone ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-slate-700">{d.deinstallId || d.id?.substring(0, 8)}</span>
                          {d.locationName && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <MapPin size={10} /> {d.locationName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500">{fmtDate(d.deinstallDate)}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            isDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : d.status === 'In Bearbeitung' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>{d.status || '–'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        {d.reason}{d.hardwareCondition ? ` — Zustand: ${d.hardwareCondition}` : ''}
                      </div>
                      {d.conditionDescription && (
                        <div className="text-xs text-slate-500 mt-0.5">{d.conditionDescription}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TIMELINE ═══ */}
      {activeSection === 'timeline' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Installationen" value={installationen.length} icon={Wrench} color="#22c55e" />
            <KpiCard label="Tausch-Aufträge" value={swaps.length} icon={ArrowLeftRight} color="#f59e0b" />
            <KpiCard label="Deinstallationen" value={deinstalls.length} icon={PackageX} color="#ef4444" />
          </div>

          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/40">
              <h3 className="text-sm font-semibold text-slate-700">Hardware-Bewegungen</h3>
              <p className="text-xs text-slate-500">Alle Installationen, Tausch-Aufträge und Deinstallationen chronologisch</p>
            </div>

            {filteredTimeline.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">Keine Events vorhanden</div>
            ) : (
              <div className="divide-y divide-slate-100/60">
                {filteredTimeline.slice(0, 100).map((event, i) => {
                  const EventIcon = event.icon;
                  return (
                    <div key={i} className="px-4 py-3 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: `${event.color}15` }}>
                        <EventIcon size={14} style={{ color: event.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-700 capitalize">{event.type === 'installation' ? 'Installation' : event.type === 'swap' ? 'Tausch' : 'Deinstallation'}</span>
                            {event.opsNr && <span className="text-xs font-mono text-slate-500">OPS {event.opsNr}</span>}
                            {event.locationName && <span className="text-xs text-slate-500 flex items-center gap-0.5"><MapPin size={9} /> {event.locationName}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-500">{fmtDate(event.date)}</span>
                            {event.status && (
                              <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{event.status}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{event.details}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredTimeline.length > 100 && (
              <div className="px-4 py-2.5 text-center text-xs text-slate-500 border-t border-slate-200/40">
                Zeige 100 von {filteredTimeline.length} Events
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ FEHLER (Hardware SN Mismatch Detection) ═══ */}
      {activeSection === 'fehler' && (
        <div className="space-y-4">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Gesamt Fehler"
              value={fehlerStats.total}
              icon={ShieldAlert}
              color="#ef4444"
              subtitle={`${fehlerStats.locationsAffected} Standorte betroffen`}
            />
            {fehlerStats.types.map(type => {
              const typeColor = type === 'Display-SN' ? '#f59e0b'
                : type === 'Navori Venue-ID' ? '#8b5cf6'
                : type === 'SIM-ID' ? '#06b6d4'
                : type === 'SIM-Zuordnung' ? '#0891b2'
                : type === 'Display-Zuordnung' ? '#a855f7'
                : type === 'Asset-ID' ? '#ec4899'
                : type === 'JET-ID' ? '#6366f1'
                : type === 'JET-ID → SN' ? '#4f46e5'
                : type.includes('Fehlend') ? '#f97316'
                : '#3b82f6';
              const typeIcon = type === 'Display-SN' ? Monitor
                : type === 'Navori Venue-ID' ? Database
                : type.includes('SIM') ? Wifi
                : type.includes('Display-Zuordnung') ? Monitor
                : type.includes('Asset') ? CreditCard
                : type.includes('JET') ? Landmark
                : type.includes('Leasing') ? CreditCard
                : type.includes('SN') ? Hash
                : AlertTriangle;
              return (
                <KpiCard
                  key={type}
                  label={type}
                  value={fehlerStats.byType[type]}
                  icon={typeIcon}
                  color={typeColor}
                />
              );
            })}
            <KpiCard
              label="Standorte"
              value={fehlerStats.locationsAffected}
              icon={MapPin}
              color="#3b82f6"
              subtitle={`von ${displayLocations.length} gesamt`}
            />
          </div>

          {/* Filter bar for Fehler */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03] overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={fehlerSearch}
                  onChange={(e) => setFehlerSearch(e.target.value)}
                  placeholder="Standort, JET-ID, SN suchen..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <select
                value={fehlerTypeFilter}
                onChange={(e) => setFehlerTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none"
              >
                <option value="">Alle Fehlertypen</option>
                {fehlerStats.types.map(t => (
                  <option key={t} value={t}>{t} ({fehlerStats.byType[t]})</option>
                ))}
              </select>
              <span className="text-xs text-slate-500 font-mono ml-auto">
                {filteredMismatches.length} Fehler
              </span>
              {(fehlerSearch || fehlerTypeFilter) && (
                <button
                  onClick={() => { setFehlerSearch(''); setFehlerTypeFilter(''); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors border border-red-200"
                >
                  <XCircle size={11} />
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>

          {/* Grouped Mismatch List by Location */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/40 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Hardware-Abweichungen pro Standort</h3>
                <p className="text-xs text-slate-500">
                  Cross-System: Display-SN, SIM-ID, JET-ID, Asset-ID, Venue-ID — gruppiert nach Location
                </p>
              </div>
              {groupedByLocation.length > 0 && (
                <button
                  onClick={() => {
                    if (expandedLocations.size === groupedByLocation.length) {
                      setExpandedLocations(new Set());
                    } else {
                      setExpandedLocations(new Set(groupedByLocation.map(g => g.locationId)));
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                >
                  {expandedLocations.size === groupedByLocation.length ? 'Alle zuklappen' : 'Alle aufklappen'}
                </button>
              )}
            </div>

            {groupedByLocation.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
                <div className="text-sm font-medium text-emerald-600">Keine Abweichungen gefunden</div>
                <div className="text-xs text-slate-500 mt-1">Alle Hardware-Daten sind konsistent</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100/60">
                {groupedByLocation.map((group) => {
                  const isExpanded = expandedLocations.has(group.locationId);
                  const typeCounts = {};
                  for (const iss of group.issues) {
                    typeCounts[iss.type] = (typeCounts[iss.type] || 0) + 1;
                  }
                  const getBadgeClass = (type) =>
                    type === 'Display-SN' ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : type === 'Navori Venue-ID' ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : type === 'SIM-ID' || type === 'SIM-Zuordnung' || type === 'Fehlende SIM' ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                    : type === 'Display-Zuordnung' ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : type === 'Asset-ID' ? 'bg-pink-50 text-pink-700 border-pink-200'
                    : type.includes('JET-ID') ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : type.includes('Fehlend') ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200';

                  return (
                    <div key={group.locationId}>
                      {/* Location Header Row — always visible */}
                      <button
                        onClick={() => {
                          setExpandedLocations(prev => {
                            const next = new Set(prev);
                            if (next.has(group.locationId)) next.delete(group.locationId);
                            else next.add(group.locationId);
                            return next;
                          });
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors text-left"
                      >
                        {/* Expand/Collapse icon */}
                        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                          <ChevronDown size={14} className="text-slate-400" />
                        </div>

                        {/* Error count badge */}
                        <div className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-red-600">{group.issues.length}</span>
                        </div>

                        {/* Location info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 truncate">{group.locationName || '\u2013'}</span>
                            {group.city && (
                              <span className="text-xs text-slate-400 flex-shrink-0">{group.city}</span>
                            )}
                          </div>
                          {group.jetId && (
                            <span className="text-xs font-mono text-slate-400">{group.jetId}</span>
                          )}
                        </div>

                        {/* Type summary badges */}
                        <div className="flex flex-wrap gap-1 justify-end max-w-[400px]">
                          {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                            <span
                              key={type}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${getBadgeClass(type)}`}
                            >
                              {type} {count > 1 ? `\u00d7${count}` : ''}
                            </span>
                          ))}
                        </div>
                      </button>

                      {/* Expanded detail rows */}
                      {isExpanded && (
                        <div className="bg-slate-50/40 border-t border-slate-100/60">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-200/30">
                                <th className="text-left px-4 py-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider w-16">OPS</th>
                                <th className="text-left px-3 py-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Fehlertyp</th>
                                <th className="text-left px-3 py-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Quelle 1</th>
                                <th className="text-left px-3 py-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Wert 1</th>
                                <th className="text-left px-3 py-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Quelle 2</th>
                                <th className="text-left px-3 py-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Wert 2</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.issues.map((m, idx) => (
                                <tr key={`${m.type}-${m.source1}-${idx}`} className="border-b border-slate-100/40 hover:bg-white/60 transition-colors">
                                  <td className="px-4 py-2 font-mono text-slate-500">{m.opsNr || '\u2013'}</td>
                                  <td className="px-3 py-2">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${getBadgeClass(m.type)}`}>
                                      {m.type}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-col">
                                      <span className="text-slate-600 font-medium">{m.sourceLabel1}</span>
                                      <span className="font-mono text-slate-400 text-[10px]">{m.source1}.{m.field1}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-red-600 font-medium max-w-[160px] truncate" title={m.value1}>
                                    {m.value1 || '\u2013'}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-col">
                                      <span className="text-slate-600 font-medium">{m.sourceLabel2}</span>
                                      <span className="font-mono text-slate-400 text-[10px]">{m.source2}.{m.field2}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-red-600 font-medium max-w-[160px] truncate" title={m.value2}>
                                    {m.value2 || '\u2013'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DATA QUALITY (embedded sub-tab) ═══ */}
      {activeSection === 'data-quality' && (
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /><span className="ml-2 text-sm text-slate-500">Lade Datenqualität...</span></div>}>
          <DataQualityDashboard comparisonData={comparisonData} rawData={rawData} />
        </React.Suspense>
      )}

      {/* Edit Warning Modal (Test-Modus) */}
      {showEditWarning && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-md border border-amber-200 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">Bearbeitung (Test-Modus)</h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Die Bearbeitung von Hardware-Daten ist aktuell nur zu Testzwecken verfügbar.
              Änderungen werden NICHT gespeichert und nicht nach Airtable synchronisiert.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowEditWarning(false)} className="flex-1 px-4 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
