import { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import {
  Target, Search, Loader2, RefreshCw,
  MapPin, FileText, AlertTriangle,
  CheckCircle2, XCircle, TrendingUp, Building2,
  ChevronDown, ExternalLink, Zap, ArrowUpRight, ArrowDownRight,
  Bot, Link2, Copy, Check, Calendar, Bell, Inbox,
} from 'lucide-react';
import {
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, CartesianGrid,
  ComposedChart,
} from 'recharts';
import { fetchAllAcquisition } from '../utils/airtableService';
import { isStorno, isAlreadyInstalled, isReadyForInstall, WEEKLY_BUILD_TARGET } from '../metrics';
import { canAccessTab, supabase } from '../utils/authService';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const AkquiseAutomationDashboard = lazy(() => import('./AkquiseAutomationDashboard'));

/* ─── City Targets (Gesamtziele Live Displays) ─── */
const CITY_TARGETS = {
  'Berlin': 325,
  'Hamburg': 200,
  'München': 165,
  'Köln': 100,
  'Frankfurt': 80,
  'Düsseldorf': 70,
  'Stuttgart': 60,
  'Leipzig': 0,
  'Dortmund': 0,
  'Essen': 0,
  'Bremen': 0,
  'Dresden': 0,
  'Hannover': 0,
  'Nürnberg': 0,
  'Duisburg': 0,
  'Bochum': 0,
  'Wuppertal': 0,
  'Bielefeld': 0,
  'Bonn': 0,
  'Münster': 0,
};
const TOTAL_NETWORK_TARGET = Object.values(CITY_TARGETS).reduce((a, b) => a + b, 0);

/* ─── Status Config ─── */
const LEAD_STATUS_CONFIG = {
  'New Lead':           { label: 'Neuer Lead',       color: '#007AFF', bg: '#007AFF15', icon: '🔵' },
  'Contacted':          { label: 'Kontaktiert',      color: '#AF52DE', bg: '#AF52DE15', icon: '🟣' },
  'Frequency Check':    { label: 'Frequenz-Check',   color: '#FF9500', bg: '#FF950015', icon: '🟡' },
  'Approved':           { label: 'Genehmigt',        color: '#34C759', bg: '#34C75915', icon: '🟢' },
  'Ready for Install':  { label: 'Installationsbereit', color: '#06b6d4', bg: '#06b6d415', icon: '🔵' },
  'Installation':       { label: 'Installation',     color: '#f97316', bg: '#f9731615', icon: '🟠' },
  'Live':               { label: 'Live',             color: '#34C759', bg: '#34C75915', icon: '✅' },
  'On Hold':            { label: 'On Hold',          color: '#64748b', bg: '#64748b15', icon: '⏸️' },
  'Cancelled':          { label: 'Storniert',        color: '#FF3B30', bg: '#FF3B3015', icon: '❌' },
};

const getStatusConfig = (status) => {
  if (!status) return { label: status || '–', color: '#64748b', bg: '#64748b15', icon: '⚪' };
  // Try exact match first, then partial
  if (LEAD_STATUS_CONFIG[status]) return LEAD_STATUS_CONFIG[status];
  const lower = status.toLowerCase();
  for (const [key, val] of Object.entries(LEAD_STATUS_CONFIG)) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return { label: status, color: '#64748b', bg: '#64748b15', icon: '⚪' };
};

/* ─── City Normalization (merge duplicates like Frankfurt / Frankfurt am Main) ─── */
const CITY_ALIASES = {
  'Frankfurt am Main': 'Frankfurt',
  'Frankfurt a.M.': 'Frankfurt',
  'Frankfurt a. M.': 'Frankfurt',
  'Frankfurt/Main': 'Frankfurt',
  'Köln/Bonn': 'Köln',
};
const normalizeCity = (city) => CITY_ALIASES[city] || city;

/* ─── Record-Level Helpers ─── */
const recordIsApproved = (r) => {
  const ls = r.leadStatus || '';
  // Direct lead status match (definitive)
  if (ls === 'Approved' || ls === 'Ready for Install' || ls === 'Installation' || ls === 'Live') return true;
  // readyForInstallation flag — Airtable value is "checked" (string) or boolean true
  if (r.readyForInstallation === true || r.readyForInstallation === 'checked' || r.readyForInstallation === 'true') return true;
  // approvalStatus — real Airtable values: "Accepted", "Rejected", "In review", "Info required"
  // Only "Accepted" means truly approved
  const as = (r.approvalStatus || '').toLowerCase();
  if (as === 'accepted' || as === 'approved' || as === 'genehmigt') return true;
  return false;
};

/* recordIsInstalled → use isAlreadyInstalled from ../metrics (single source of truth) */
const recordIsInstalled = isAlreadyInstalled;

const recordIsSigned = (r) =>
  r.vertragVorhanden && r.vertragVorhanden !== 'false' && r.vertragVorhanden !== '';

const recordIsLive = (r) => (r.leadStatus || '') === 'Live';

/* ─── Reusable KPI Card ─── */
function KpiCard({ label, value, icon: Icon, color, subtitle, active, onClick }) {
  return (
    <div
      className={`bg-surface-primary border rounded-2xl p-4 shadow-card transition-all cursor-pointer hover:shadow-md ${active ? 'ring-2 ring-offset-1' : 'border-border-secondary'}`}
      style={active ? { borderColor: color, ringColor: color } : {}}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <div style={{ backgroundColor: `${color}12` }} className="w-7 h-7 rounded-lg flex items-center justify-center">
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      {subtitle && <div className="text-xs text-text-muted mt-1">{subtitle}</div>}
    </div>
  );
}

/* ─── Main Component ─── */
export default function AcquisitionDashboard({ onOpenAkquiseApp, initialSection, onSectionChange }) {
  const { isEnabled: isFeatureEnabled } = useFeatureFlags();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSectionRaw] = useState(initialSection || 'netzwerk');
  const setActiveSection = useCallback((sec) => {
    setActiveSectionRaw(sec);
    onSectionChange?.(sec);
  }, [onSectionChange]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [acquirerFilter, setAcquirerFilter] = useState('all');

  // FAW Link Generator state
  const [showFawDialog, setShowFawDialog] = useState(false);
  const [fawReviewer, setFawReviewer] = useState('');
  const [fawLoading, setFawLoading] = useState(false);
  const [fawLink, setFawLink] = useState(null);
  const [fawCopied, setFawCopied] = useState(false);
  const [installBookings, setInstallBookings] = useState([]);

  const handleGenerateFawLink = useCallback(async () => {
    if (!fawReviewer.trim()) return;
    setFawLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/faw-check-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'generate', reviewer: fawReviewer.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Fehler bei Token-Generierung');
      setFawLink(result);
    } catch (err) {
      console.error('[AcquisitionDashboard] FAW link generation failed:', err);
      alert('Fehler: ' + err.message);
    } finally {
      setFawLoading(false);
    }
  }, [fawReviewer]);

  const handleCopyFawLink = useCallback(() => {
    if (!fawLink?.url) return;
    navigator.clipboard.writeText(fawLink.url);
    setFawCopied(true);
    setTimeout(() => setFawCopied(false), 2000);
  }, [fawLink]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchAllAcquisition();
      setData(records);
    } catch (err) {
      console.error('[AcquisitionDashboard] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load install bookings summary for admin pipeline view
  const userIsAdmin = canAccessTab('admin');
  useEffect(() => {
    if (!userIsAdmin) return;
    (async () => {
      try {
        const { data: bookings } = await supabase
          .from('install_bookings')
          .select('status,reminder_count,booked_date,whatsapp_sent_at');
        setInstallBookings(bookings || []);
      } catch (err) {
        console.error('[AcquisitionDashboard] Install bookings load failed:', err);
      }
    })();
  }, [userIsAdmin]);

  /* ─── Derived Data ─── */
  const { cities, statuses, partners, acquirers } = useMemo(() => {
    const citySet = new Set();
    const statusSet = new Set();
    const partnerSet = new Set();
    const acquirerSet = new Set();
    for (const r of data) {
      (r.city || []).forEach(c => c && citySet.add(normalizeCity(c)));
      if (r.leadStatus) statusSet.add(r.leadStatus);
      if (r.acquisitionPartner) partnerSet.add(r.acquisitionPartner);
      if (r.submittedBy) acquirerSet.add(r.submittedBy);
    }
    return {
      cities: [...citySet].sort(),
      statuses: [...statusSet].sort(),
      partners: [...partnerSet].sort(),
      acquirers: [...acquirerSet].sort(),
    };
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (cityFilter !== 'all' && !(r.city || []).some(c => normalizeCity(c) === cityFilter)) return false;
      if (statusFilter !== 'all' && r.leadStatus !== statusFilter) return false;
      if (partnerFilter !== 'all' && r.acquisitionPartner !== partnerFilter) return false;
      if (acquirerFilter !== 'all' && r.submittedBy !== acquirerFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const searchable = [r.akquiseId, r.locationName, r.jetId, r.contactPerson, r.city?.join(' '), r.postalCode].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [data, cityFilter, statusFilter, partnerFilter, acquirerFilter, searchTerm]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const stornoAkquise = filtered.filter(r => r.akquiseStorno).length;
    const stornoPostInstall = filtered.filter(r => r.postInstallStorno).length;
    const stornoTotal = filtered.filter(r => isStorno(r)).length;
    const active = total - stornoTotal;
    const readyForInstall = filtered.filter(r => isReadyForInstall(r) && !isStorno(r) && !isAlreadyInstalled(r)).length;
    const vertrag = filtered.filter(r => r.vertragVorhanden && r.vertragVorhanden !== 'false' && r.vertragVorhanden !== '' && !isStorno(r)).length;
    const withApproval = filtered.filter(r => r.approvalStatus && !isStorno(r)).length;

    // Avg days since acquisition
    let avgDays = null;
    const datesValid = filtered.filter(r => r.acquisitionDate && !isStorno(r));
    if (datesValid.length > 0) {
      const now = Date.now();
      const totalDays = datesValid.reduce((sum, r) => {
        const d = new Date(r.acquisitionDate);
        return sum + (isNaN(d.getTime()) ? 0 : (now - d.getTime()) / (1000 * 60 * 60 * 24));
      }, 0);
      avgDays = Math.round(totalDays / datesValid.length);
    }

    return { total, active, stornoAkquise, stornoPostInstall, stornoTotal, readyForInstall, vertrag, withApproval, avgDays };
  }, [filtered]);

  /* ─── Weekly Sign Tracking (Target from metrics constants) ─── */
  const WEEKLY_SIGN_TARGET = WEEKLY_BUILD_TARGET;
  const weeklySignData = useMemo(() => {
    // Group signed leads by week (using vertragVorhanden + acquisitionDate or submittedAt)
    const weeks = {};
    const now = new Date();
    // Go back 12 weeks
    for (let w = 0; w < 12; w++) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 - w * 7); // Monday
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      const key = `${weekStart.getDate()}.${weekStart.getMonth() + 1}`;
      weeks[key] = { label: key, weekStart, weekEnd, signed: 0, target: WEEKLY_SIGN_TARGET };
    }

    for (const r of data) {
      if (isStorno(r)) continue;
      if (!r.vertragVorhanden || r.vertragVorhanden === 'false' || r.vertragVorhanden === '') continue;
      // Use submittedAt or acquisitionDate as best proxy for sign date
      const dateStr = r.submittedAt || r.acquisitionDate;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) continue;

      for (const wk of Object.values(weeks)) {
        if (d >= wk.weekStart && d <= wk.weekEnd) {
          wk.signed++;
          break;
        }
      }
    }

    return Object.values(weeks)
      .sort((a, b) => a.weekStart - b.weekStart);
  }, [data]);

  // Current week signed
  const currentWeekSigned = weeklySignData.length > 0 ? weeklySignData[weeklySignData.length - 1]?.signed || 0 : 0;
  const lastWeekSigned = weeklySignData.length > 1 ? weeklySignData[weeklySignData.length - 2]?.signed || 0 : 0;

  /* ─── City Performance ─── */
  const cityPerformance = useMemo(() => {
    const stats = {};
    for (const r of filtered) {
      if (isStorno(r)) continue;
      const cities = r.city || [];
      for (const rawCity of cities) {
        if (!rawCity) continue;
        const c = normalizeCity(rawCity);
        if (!stats[c]) stats[c] = { total: 0, signed: 0, accepted: 0, installed: 0, live: 0, readyForBuild: 0, newLeads: 0, churn: 0 };
        stats[c].total++;
        if (r.leadStatus === 'New Lead') stats[c].newLeads++;
        if (recordIsSigned(r)) stats[c].signed++;
        if (recordIsApproved(r)) stats[c].accepted++;
        if (recordIsLive(r)) stats[c].live++;
        if (recordIsInstalled(r)) stats[c].installed++;
        // Ready for Build = signed + approved but NOT yet installed
        if ((recordIsSigned(r) || recordIsApproved(r)) && !recordIsInstalled(r)) stats[c].readyForBuild++;
      }
    }
    // Add churn from cancelled records
    for (const r of filtered) {
      if (!r.postInstallStorno) continue;
      for (const rawCity of (r.city || [])) {
        if (!rawCity) continue;
        const c = normalizeCity(rawCity);
        if (!stats[c]) stats[c] = { total: 0, signed: 0, accepted: 0, installed: 0, live: 0, readyForBuild: 0, newLeads: 0, churn: 0 };
        stats[c].churn++;
      }
    }
    return Object.entries(stats)
      .map(([name, s]) => ({
        name,
        ...s,
        signRate: s.total > 0 ? Math.round(s.signed / s.total * 100) : 0,
        installRate: s.total > 0 ? Math.round(s.installed / s.total * 100) : 0,
        churnRate: (s.installed + s.churn) > 0 ? Math.round(s.churn / (s.installed + s.churn) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  /* ─── Conversion / Churn Metrics ─── */
  const conversionMetrics = useMemo(() => {
    // All leads (non-cancelled)
    const active = data.filter(r => !isStorno(r));
    const total = active.length;
    const signed = active.filter(r => recordIsSigned(r)).length;
    const approved = active.filter(r => recordIsApproved(r)).length;
    const installed = active.filter(r => recordIsInstalled(r)).length;
    const live = active.filter(r => recordIsLive(r)).length;
    const cancelledAkquise = data.filter(r => r.akquiseStorno).length;
    const cancelledPostInstall = data.filter(r => r.postInstallStorno).length;
    // Use isStorno predicate (covers akquiseStorno + postInstallStorno + leadStatus-based storno)
    const cancelledTotal = data.filter(r => isStorno(r)).length;

    // ─── Store-Besuche (alle Leads die über "New Lead" hinaus sind) ───
    const storeVisits = data.filter(r => {
      const ls = r.leadStatus || '';
      return ls !== 'New Lead' && ls !== '';
    }).length;
    // Erfolgreiche Besuche = signed ODER approved
    const successfulVisits = data.filter(r => {
      if (isStorno(r)) return false;
      return recordIsSigned(r) || recordIsApproved(r);
    }).length;
    const noInterest = cancelledAkquise;
    const stillInPipeline = storeVisits - successfulVisits - cancelledTotal;
    const visitSuccessRate = storeVisits > 0 ? successfulVisits / storeVisits : 0;
    const visitNoInterestRate = storeVisits > 0 ? noInterest / storeVisits : 0;

    // ─── Signed vs. Approved ───
    const signedNotApproved = active.filter(r => recordIsSigned(r) && !recordIsApproved(r)).length;
    const signedToApprovedRate = signed > 0 ? approved / signed : 0;

    // Conversion funnel:
    const akquiseToApprovedRate = total > 0 ? approved / total : 0;
    const approvedToInstalledRate = approved > 0 ? installed / approved : 0;
    const totalPipeline = total + cancelledTotal;
    const overallConversion = totalPipeline > 0 ? installed / totalPipeline : 0;

    // Churn Rate
    const totalEverInstalled = installed + cancelledPostInstall;
    const churnRate = totalEverInstalled > 0 ? cancelledPostInstall / totalEverInstalled : 0;

    const dropoutRate = totalPipeline > 0 ? cancelledTotal / totalPipeline : 0;

    const requiredWeeklyAcquisitions = overallConversion > 0
      ? Math.ceil(WEEKLY_BUILD_TARGET / overallConversion)
      : WEEKLY_BUILD_TARGET;

    // Per-city conversion metrics (with store visit data)
    const cityConversion = {};
    for (const r of data) {
      for (const rawCity of (r.city || [])) {
        if (!rawCity) continue;
        const c = normalizeCity(rawCity);
        if (!cityConversion[c]) cityConversion[c] = {
          total: 0, approved: 0, installed: 0, live: 0, signed: 0,
          storno: 0, churn: 0, storeVisits: 0, successfulVisits: 0, noInterest: 0,
        };
        const cc = cityConversion[c];
        const ls = r.leadStatus || '';
        const isCancelled = isStorno(r);

        // Store visit = not New Lead
        if (ls !== 'New Lead' && ls !== '') cc.storeVisits++;

        if (!isCancelled) {
          cc.total++;
          if (recordIsApproved(r)) cc.approved++;
          if (recordIsInstalled(r)) cc.installed++;
          if (recordIsLive(r)) cc.live++;
          if (recordIsSigned(r)) cc.signed++;
          if (recordIsSigned(r) || recordIsApproved(r)) cc.successfulVisits++;
        } else {
          cc.storno++;
          if (r.postInstallStorno) cc.churn++;
          if (r.akquiseStorno) cc.noInterest++;
        }
      }
    }
    const cityConversionList = Object.entries(cityConversion)
      .map(([name, cc]) => ({
        name,
        ...cc,
        akquiseToApproved: cc.total > 0 ? Math.round(cc.approved / cc.total * 100) : 0,
        approvedToInstalled: cc.approved > 0 ? Math.round(cc.installed / cc.approved * 100) : 0,
        signedToApproved: cc.signed > 0 ? Math.round(cc.approved / cc.signed * 100) : 0,
        visitSuccessRate: cc.storeVisits > 0 ? Math.round(cc.successfulVisits / cc.storeVisits * 100) : 0,
        churnRate: (cc.installed + cc.churn) > 0 ? Math.round(cc.churn / (cc.installed + cc.churn) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      total, signed, approved, installed, live, cancelledTotal, cancelledAkquise, cancelledPostInstall,
      // Store visit metrics
      storeVisits, successfulVisits, noInterest, stillInPipeline,
      visitSuccessRate: Math.round(visitSuccessRate * 100),
      visitNoInterestRate: Math.round(visitNoInterestRate * 100),
      // Signed vs Approved
      signedNotApproved,
      signedToApprovedRate: Math.round(signedToApprovedRate * 100),
      // Pipeline rates
      dropoutRate: Math.round(dropoutRate * 100),
      akquiseToApprovedRate: Math.round(akquiseToApprovedRate * 100),
      approvedToInstalledRate: Math.round(approvedToInstalledRate * 100),
      overallConversion: Math.round(overallConversion * 100),
      churnRate: Math.round(churnRate * 100),
      requiredWeeklyAcquisitions,
      WEEKLY_BUILD_TARGET,
      cityConversion: cityConversionList,
    };
  }, [data]);

  /* ─── Funnel Data ─── */
  const funnelData = useMemo(() => {
    const statusCounts = {};
    for (const r of filtered) {
      if (isStorno(r)) continue;
      const s = r.leadStatus || 'Unbekannt';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
    return Object.entries(statusCounts)
      .map(([name, count]) => ({ name, count, fill: getStatusConfig(name).color }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  /* ─── Partner Performance (excl. New Leads) ─── */
  const partnerData = useMemo(() => {
    const stats = {};
    for (const r of filtered) {
      if (isStorno(r)) continue;
      if (r.leadStatus === 'New Lead') continue;
      const p = r.acquisitionPartner || 'Unbekannt';
      if (!stats[p]) stats[p] = { total: 0, signed: 0, accepted: 0, installed: 0 };
      stats[p].total++;
      if (recordIsSigned(r)) stats[p].signed++;
      if (recordIsApproved(r)) stats[p].accepted++;
      if (recordIsInstalled(r)) stats[p].installed++;
    }
    return Object.entries(stats)
      .map(([name, s]) => ({
        name,
        ...s,
        signRate: s.total > 0 ? Math.round(s.signed / s.total * 100) : 0,
        installRate: s.total > 0 ? Math.round(s.installed / s.total * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filtered]);

  /* ─── Acquirer Performance (excl. New Leads) ─── */
  const acquirerData = useMemo(() => {
    const stats = {};
    for (const r of filtered) {
      if (isStorno(r)) continue;
      if (r.leadStatus === 'New Lead') continue;
      const a = r.submittedBy || 'Unbekannt';
      if (!stats[a]) stats[a] = { total: 0, signed: 0, accepted: 0, installed: 0 };
      stats[a].total++;
      if (recordIsSigned(r)) stats[a].signed++;
      if (recordIsApproved(r)) stats[a].accepted++;
      if (recordIsInstalled(r)) stats[a].installed++;
    }
    return Object.entries(stats)
      .map(([name, s]) => ({
        name,
        ...s,
        signRate: s.total > 0 ? Math.round(s.signed / s.total * 100) : 0,
        installRate: s.total > 0 ? Math.round(s.installed / s.total * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filtered]);

  /* ─── Storno Data ─── */
  const stornoReasons = useMemo(() => {
    const reasons = {};
    for (const r of filtered) {
      if (!r.postInstallStorno) continue;
      const grounds = r.postInstallStornoGrund || [];
      if (grounds.length === 0) {
        reasons['Kein Grund angegeben'] = (reasons['Kein Grund angegeben'] || 0) + 1;
      } else {
        for (const g of grounds) {
          reasons[g] = (reasons[g] || 0) + 1;
        }
      }
    }
    return Object.entries(reasons)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  /* ─── Recent Cancellations Analysis (last 7 + 30 days) ─── */
  const cancellationInsight = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);

    // All cancellations
    const allCancelled = data.filter(r => isStorno(r));

    // Recent cancellations (by acquisitionDate or submittedAt)
    const getDate = (r) => {
      const d = r.acquisitionDate || r.submittedAt || r.createdAt;
      if (!d) return null;
      const parsed = new Date(d);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const last7 = allCancelled.filter(r => { const d = getDate(r); return d && d >= sevenDaysAgo; });
    const last30 = allCancelled.filter(r => { const d = getDate(r); return d && d >= thirtyDaysAgo; });

    // Reason analysis for last 30 days
    const reasonCounts = {};
    const cityCounts = {};
    const partnerCounts = {};
    const typeBreakdown = { akquise: 0, postInstall: 0 };
    const recentItems = [];

    for (const r of last30) {
      // Type
      if (r.akquiseStorno) typeBreakdown.akquise++;
      if (r.postInstallStorno) typeBreakdown.postInstall++;

      // Reasons
      const reasons = r.postInstallStornoGrund || [];
      if (reasons.length === 0 && r.postInstallStorno) {
        reasonCounts['Kein Grund angegeben'] = (reasonCounts['Kein Grund angegeben'] || 0) + 1;
      }
      for (const g of reasons) {
        reasonCounts[g] = (reasonCounts[g] || 0) + 1;
      }

      // Cities
      for (const c of (r.city || [])) {
        if (c) cityCounts[c] = (cityCounts[c] || 0) + 1;
      }

      // Partners
      const p = r.acquisitionPartner || 'Unbekannt';
      partnerCounts[p] = (partnerCounts[p] || 0) + 1;

      // Detail items (last 30d)
      recentItems.push({
        id: r.id,
        name: r.locationName || r.akquiseId || '–',
        city: (r.city || []).join(', '),
        partner: r.acquisitionPartner || '–',
        type: r.postInstallStorno ? 'Post-Install' : 'Akquise',
        reasons: reasons.length > 0 ? reasons.join(', ') : (r.akquiseStorno ? 'Akquise-Storno' : 'Kein Grund'),
        date: r.acquisitionDate || r.submittedAt || null,
        leadStatus: r.leadStatus || '–',
      });
    }

    // Sort reasons/cities/partners
    const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topPartners = Object.entries(partnerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Generate AI-style insight text
    const insights = [];
    if (last7.length > 0) {
      insights.push(`${last7.length} Abbrüche in den letzten 7 Tagen`);
    } else {
      insights.push('Keine neuen Abbrüche in den letzten 7 Tagen');
    }

    if (last30.length > 0) {
      insights.push(`${last30.length} Abbrüche im letzten Monat`);
      if (typeBreakdown.postInstall > 0) {
        insights.push(`${typeBreakdown.postInstall} davon Post-Install (bereits aufgebaut → wieder abgebaut)`);
      }
      if (typeBreakdown.akquise > 0) {
        insights.push(`${typeBreakdown.akquise} Akquise-Stornos (vor Installation abgebrochen)`);
      }
      if (topReasons.length > 0 && topReasons[0][0] !== 'Kein Grund angegeben') {
        insights.push(`Hauptgrund: "${topReasons[0][0]}" (${topReasons[0][1]}x)`);
      }
      if (topCities.length > 0) {
        insights.push(`Meiste Abbrüche: ${topCities.map(([c, n]) => `${c} (${n})`).join(', ')}`);
      }
      if (topPartners.length > 0 && topPartners[0][0] !== 'Unbekannt') {
        insights.push(`Betroffene Partner: ${topPartners.map(([p, n]) => `${p} (${n})`).join(', ')}`);
      }

      // Trend comparison: last 7 vs prior 7 days
      const prior7DaysAgo = new Date(sevenDaysAgo); prior7DaysAgo.setDate(prior7DaysAgo.getDate() - 7);
      const prior7 = allCancelled.filter(r => { const d = getDate(r); return d && d >= prior7DaysAgo && d < sevenDaysAgo; });
      if (last7.length > prior7.length) {
        insights.push(`⚠️ Trend steigend: ${last7.length} vs. ${prior7.length} in der Vorwoche`);
      } else if (last7.length < prior7.length) {
        insights.push(`✅ Trend rückläufig: ${last7.length} vs. ${prior7.length} in der Vorwoche`);
      }
    }

    return {
      last7Count: last7.length,
      last30Count: last30.length,
      totalAll: allCancelled.length,
      typeBreakdown,
      topReasons,
      topCities,
      topPartners,
      insights,
      recentItems: recentItems.sort((a, b) => {
        const da = a.date ? new Date(a.date) : new Date(0);
        const db = b.date ? new Date(b.date) : new Date(0);
        return db - da;
      }).slice(0, 15),
    };
  }, [data]);

  const fmtDate = (d) => {
    if (!d) return '–';
    try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
  };

  /* ─── City Performance with Targets ─── */
  const cityPerformanceWithTargets = useMemo(() => {
    return cityPerformance.map(c => {
      const target = CITY_TARGETS[c.name] || 0;
      const remaining = Math.max(0, target - c.live);
      const progress = target > 0 ? Math.round(c.live / target * 100) : 0;
      return { ...c, target, remaining, progress };
    }).sort((a, b) => {
      // Sort: cities with targets first (by target desc), then rest by total desc
      if (a.target > 0 && b.target === 0) return -1;
      if (a.target === 0 && b.target > 0) return 1;
      if (a.target > 0 && b.target > 0) return b.target - a.target;
      return b.total - a.total;
    });
  }, [cityPerformance]);

  // Total live = only leadStatus "Live" (actually operational), no Installation or Stornos
  const totalLive = useMemo(() => data.filter(r => recordIsLive(r) && !isStorno(r)).length, [data]);

  const isUserAdmin = canAccessTab('admin');
  const showAutomation = (canAccessTab('akquise-automation') || isUserAdmin) && (isUserAdmin || isFeatureEnabled('tab_akquise_automation'));

  const sections = [
    { id: 'netzwerk', label: '🎯 Netzwerk-Aufbau' },
    { id: 'overview', label: 'Übersicht' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'storno', label: 'Storno' },
    ...(showAutomation ? [{ id: 'automation', label: '🤖 KI-Outreach' }] : []),
  ];

  // Defensive: catch render errors and show them inline
  const [renderError, setRenderError] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        <span className="ml-2 text-sm text-text-muted">Lade Akquise-Daten...</span>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="bg-status-offline/10 border border-status-offline/20 rounded-2xl p-6 m-4">
        <div className="text-status-offline font-bold mb-2">Render-Fehler in Akquise</div>
        <pre className="text-xs text-status-offline whitespace-pre-wrap mb-3">{renderError}</pre>
        <button onClick={() => { setRenderError(null); loadData(); }}
          className="px-4 py-2 bg-status-offline/10 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Gesamt" value={kpis.total} icon={Target} color="#007AFF" subtitle={`${kpis.active} aktiv`} />
        <KpiCard label="Aktive Leads" value={kpis.active} icon={TrendingUp} color="#34C759" subtitle={kpis.avgDays ? `Ø ${kpis.avgDays} Tage` : undefined} />
        <KpiCard label="Installationsbereit" value={kpis.readyForInstall} icon={CheckCircle2} color="#06b6d4" />
        <KpiCard label="Vertrag vorh." value={kpis.vertrag} icon={FileText} color="#AF52DE" />
        <KpiCard label="Storno Akquise" value={kpis.stornoAkquise} icon={XCircle} color="#FF3B30" />
        <KpiCard label="Storno Post-Install" value={kpis.stornoPostInstall} icon={AlertTriangle} color="#f97316" subtitle={kpis.total > 0 ? `${Math.round(kpis.stornoTotal / kpis.total * 100)}% Rate` : undefined} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Suche (Name, ID, Stadt, Kontakt...)"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-surface-primary border border-border-secondary rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          className="text-xs bg-surface-primary border border-border-secondary rounded-xl px-3 py-2">
          <option value="all">Alle Städte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-xs bg-surface-primary border border-border-secondary rounded-xl px-3 py-2">
          <option value="all">Alle Status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}
          className="text-xs bg-surface-primary border border-border-secondary rounded-xl px-3 py-2">
          <option value="all">Alle Partner</option>
          {partners.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={acquirerFilter} onChange={e => setAcquirerFilter(e.target.value)}
          className="text-xs bg-surface-primary border border-border-secondary rounded-xl px-3 py-2">
          <option value="all">Alle Akquisiteure</option>
          {acquirers.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-muted bg-surface-primary border border-border-secondary rounded-xl hover:bg-surface-secondary transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>

        <button
          onClick={() => { setShowFawDialog(true); setFawLink(null); setFawReviewer(''); }}
          className="flex items-center gap-1 px-3 py-2 bg-status-warning/10 text-amber-700 rounded-xl text-xs font-medium hover:bg-amber-200 transition-colors"
        >
          <Link2 size={12} /> FAW-Prueferlink
        </button>
      </div>

      {/* FAW Link Generation Dialog */}
      {showFawDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-primary rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
              <Link2 size={18} /> FAW-Prueferlink erstellen
            </h3>

            {!fawLink ? (
              <>
                <p className="text-sm text-text-secondary mb-4">
                  Erstellen Sie einen Link fuer einen externen Frequenzpruefer. Der Link ist 7 Tage gueltig.
                </p>

                <label className="block text-sm font-medium text-text-primary mb-1">Pruefer-Name *</label>
                <input
                  type="text"
                  value={fawReviewer}
                  onChange={e => setFawReviewer(e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="w-full p-2 border border-border-primary rounded-lg text-sm mb-4 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  onKeyDown={e => e.key === 'Enter' && handleGenerateFawLink()}
                />

                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowFawDialog(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
                    Abbrechen
                  </button>
                  <button
                    onClick={handleGenerateFawLink}
                    disabled={!fawReviewer.trim() || fawLoading}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {fawLoading ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Link erstellen
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-status-online/10 border border-status-online/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-2">
                    <CheckCircle2 size={16} /> Link erstellt
                  </div>
                  <p className="text-xs text-text-secondary mb-2">
                    Pruefer: <strong>{fawLink.reviewer}</strong> | Gueltig bis: <strong>{fawLink.expires}</strong>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={fawLink.url}
                      readOnly
                      className="flex-1 p-2 bg-surface-primary border border-border-primary rounded-lg text-xs truncate"
                    />
                    <button
                      onClick={handleCopyFawLink}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        fawCopied
                          ? 'bg-status-online text-white'
                          : 'bg-surface-secondary text-text-primary hover:bg-surface-tertiary'
                      }`}
                    >
                      {fawCopied ? <Check size={12} /> : <Copy size={12} />}
                      {fawCopied ? 'Kopiert!' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setShowFawDialog(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
                    Schliessen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-surface-secondary/60 rounded-xl p-1 w-fit">
          {sections.map(s => (
            <button key={s.id}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${activeSection === s.id ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
              onClick={() => setActiveSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        {onOpenAkquiseApp && (
          <button
            onClick={onOpenAkquiseApp}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#007AFF] text-white text-xs font-semibold rounded-xl shadow-sm hover:bg-[#0066DD] transition-colors"
          >
            <MapPin size={13} />
            Akquise-App öffnen
          </button>
        )}
      </div>

      {/* ─── Netzwerk-Aufbau Cockpit ─── */}
      {activeSection === 'netzwerk' && (
        <div className="space-y-5">

          {/* Hero KPIs: Network Build Progress */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Live vs Target */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white shadow-lg shadow-blue-600/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-blue-200">Netzwerk Live</span>
                <Zap size={16} className="text-blue-300" />
              </div>
              <div className="text-3xl font-black">{totalLive}</div>
              <div className="text-xs text-blue-200 mt-1">
                / {TOTAL_NETWORK_TARGET} Ziel
                <span className="ml-2 text-blue-100 font-bold">({TOTAL_NETWORK_TARGET > 0 ? Math.round(totalLive / TOTAL_NETWORK_TARGET * 100) : 0}%)</span>
              </div>
              <div className="mt-3 h-2 bg-blue-800/50 rounded-full overflow-hidden">
                <div className="h-full bg-surface-primary rounded-full transition-all duration-700" style={{ width: `${Math.min(100, TOTAL_NETWORK_TARGET > 0 ? totalLive / TOTAL_NETWORK_TARGET * 100 : 0)}%` }} />
              </div>
            </div>

            {/* This Week Signed */}
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-muted">Diese Woche</span>
                {currentWeekSigned >= WEEKLY_SIGN_TARGET ? (
                  <div className="w-7 h-7 rounded-lg bg-status-online/10 flex items-center justify-center"><ArrowUpRight size={14} className="text-status-online" /></div>
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-status-warning/10 flex items-center justify-center"><ArrowDownRight size={14} className="text-status-warning" /></div>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black ${currentWeekSigned >= WEEKLY_SIGN_TARGET ? 'text-status-online' : 'text-status-warning'}`}>{currentWeekSigned}</span>
                <span className="text-sm text-text-muted">/ {WEEKLY_SIGN_TARGET}</span>
              </div>
              <div className="text-xs text-text-muted mt-1">Signings diese Woche</div>
              <div className="mt-2 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${Math.min(100, WEEKLY_SIGN_TARGET > 0 ? currentWeekSigned / WEEKLY_SIGN_TARGET * 100 : 0)}%`,
                  backgroundColor: currentWeekSigned >= WEEKLY_SIGN_TARGET ? '#34C759' : currentWeekSigned >= WEEKLY_SIGN_TARGET * 0.6 ? '#FF9500' : '#FF3B30',
                }} />
              </div>
            </div>

            {/* Dropout Rate → Required Acquisitions */}
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-muted">Benötigte Akquisen/W</span>
                <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center"><Target size={14} className="text-violet-500" /></div>
              </div>
              <div className="text-3xl font-black text-violet-600">{conversionMetrics.requiredWeeklyAcquisitions}</div>
              <div className="text-xs text-text-muted mt-1">
                für {conversionMetrics.WEEKLY_BUILD_TARGET} Installs/W
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-text-muted">Dropout-Rate:</span>
                <span className={`font-mono font-bold ${conversionMetrics.dropoutRate > 30 ? 'text-status-offline' : conversionMetrics.dropoutRate > 15 ? 'text-status-warning' : 'text-status-online'}`}>
                  {conversionMetrics.dropoutRate}%
                </span>
              </div>
            </div>

            {/* Store-Besuche & Erfolgsquote */}
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-text-muted">Store-Besuche</span>
                <span className="text-lg font-black text-text-primary">{conversionMetrics.storeVisits}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center p-2 rounded-xl bg-status-online/10 border border-green-100">
                  <div className="text-lg font-bold text-green-700">{conversionMetrics.successfulVisits}</div>
                  <div className="text-xs text-status-online font-medium">Erfolgreich</div>
                </div>
                <div className="text-center p-2 rounded-xl bg-status-offline/10 border border-red-100">
                  <div className="text-lg font-bold text-status-offline">{conversionMetrics.noInterest}</div>
                  <div className="text-xs text-status-offline font-medium">Kein Interesse</div>
                </div>
                <div className="text-center p-2 rounded-xl bg-surface-secondary border border-border-secondary">
                  <div className="text-lg font-bold text-text-secondary">{conversionMetrics.stillInPipeline > 0 ? conversionMetrics.stillInPipeline : 0}</div>
                  <div className="text-xs text-text-muted font-medium">In Pipeline</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Erfolgsquote</span>
                  <span className="text-xs font-bold text-status-online">{conversionMetrics.visitSuccessRate}%</span>
                </div>
                <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden flex">
                  <div className="h-full bg-status-online rounded-l-full" style={{ width: `${conversionMetrics.visitSuccessRate}%` }} />
                  <div className="h-full bg-red-400" style={{ width: `${conversionMetrics.visitNoInterestRate}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-online" /> Erfolgreich</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Kein Interesse</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-surface-tertiary" /> Offen</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signed vs Approved KPI */}
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-text-muted">Signed vs. Approved</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-center p-3 rounded-xl bg-violet-50 border border-violet-100">
                  <div className="text-2xl font-bold text-violet-700">{conversionMetrics.signed}</div>
                  <div className="text-xs text-violet-600 font-medium mt-0.5">Signed (Vertrag)</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-accent-light border border-blue-100">
                  <div className="text-2xl font-bold text-blue-700">{conversionMetrics.approved}</div>
                  <div className="text-xs text-accent font-medium mt-0.5">Approved</div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Signed → Approved</span>
                  <span className="text-xs font-bold text-violet-600">{conversionMetrics.signedToApprovedRate}%</span>
                </div>
                <div className="h-1 bg-surface-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(conversionMetrics.signedToApprovedRate, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Warten auf Approval</span>
                  <span className="font-mono font-bold text-status-warning">{conversionMetrics.signedNotApproved}</span>
                </div>
              </div>
            </div>

            {/* Conversion Pipeline */}
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-text-muted">Conversion Pipeline</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Akquise → Approved</span>
                  <span className="text-xs font-bold text-accent">{conversionMetrics.akquiseToApprovedRate}%</span>
                </div>
                <div className="h-1 bg-surface-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${conversionMetrics.akquiseToApprovedRate}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Approved → Installiert</span>
                  <span className="text-xs font-bold text-status-online">{conversionMetrics.approvedToInstalledRate}%</span>
                </div>
                <div className="h-1 bg-surface-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-status-online rounded-full" style={{ width: `${conversionMetrics.approvedToInstalledRate}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Churn Rate (nach Install)</span>
                  <span className="text-xs font-bold text-status-offline">{conversionMetrics.churnRate}%</span>
                </div>
                <div className="h-1 bg-surface-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${conversionMetrics.churnRate}%` }} />
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border-secondary">
                  <span className="text-xs text-text-muted font-medium">Gesamt-Conversion</span>
                  <span className="text-xs font-bold text-text-primary">{conversionMetrics.overallConversion}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Sign Trend Chart */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Wöchentliche Signings</h3>
                <p className="text-xs text-text-muted mt-0.5">Ziel: {WEEKLY_SIGN_TARGET} Signings pro Woche · Letzte 12 Wochen</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm bg-accent" />
                  <span className="text-text-muted">Signings</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-0 border-t-2 border-dashed border-red-400" />
                  <span className="text-text-muted">Ziel ({WEEKLY_SIGN_TARGET})</span>
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={weeklySignData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fontFamily: 'monospace', fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, fontFamily: 'monospace', borderRadius: 12, border: '1px solid #e2e8f0' }}
                  formatter={(value, name) => [value, name === 'signed' ? 'Signings' : 'Ziel']}
                  labelFormatter={l => `KW ab ${l}`}
                />
                <ReferenceLine y={WEEKLY_SIGN_TARGET} stroke="#FF3B30" strokeDasharray="6 4" strokeWidth={2} label={{ value: `Ziel: ${WEEKLY_SIGN_TARGET}`, position: 'right', fontSize: 11, fill: '#FF3B30', fontFamily: 'monospace' }} />
                <Bar dataKey="signed" radius={[6, 6, 0, 0]} maxBarSize={40}>
                  {weeklySignData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.signed >= WEEKLY_SIGN_TARGET ? '#34C759' : entry.signed >= WEEKLY_SIGN_TARGET * 0.6 ? '#FF9500' : '#FF3B30'} opacity={idx === weeklySignData.length - 1 ? 1 : 0.7} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            {/* Week summary */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-secondary">
              <div className="text-xs text-text-muted">
                Ø letzte 12 Wochen: <span className="font-mono font-bold text-text-secondary">{weeklySignData.length > 0 ? Math.round(weeklySignData.reduce((s, w) => s + w.signed, 0) / weeklySignData.length) : 0}</span> Signings/W
              </div>
              <div className="text-xs text-text-muted">
                Wochen über Ziel: <span className="font-mono font-bold text-status-online">{weeklySignData.filter(w => w.signed >= WEEKLY_SIGN_TARGET).length}</span> / {weeklySignData.length}
              </div>
              {lastWeekSigned > 0 && (
                <div className="text-xs text-text-muted">
                  Letzte Woche: <span className="font-mono font-bold text-text-secondary">{lastWeekSigned}</span>
                </div>
              )}
            </div>
          </div>

          {/* City Performance with Targets */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Netzwerk-Aufbau nach Stadt</h3>
                <p className="text-xs text-text-muted mt-0.5">Live-Displays vs. Gesamtziel pro Stadt</p>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-text-primary">{totalLive} <span className="text-sm text-text-muted font-normal">/ {TOTAL_NETWORK_TARGET}</span></div>
                <div className="text-xs text-text-muted">Gesamt-Netzwerk</div>
              </div>
            </div>

            {/* City Grid */}
            <div className="space-y-1.5 overflow-x-auto">
              {/* Header */}
              <div className="grid grid-cols-[1fr_70px_50px_55px_55px_55px_50px_90px] gap-1.5 px-3 py-1.5 text-xs text-text-muted font-medium min-w-[700px]">
                <span>Stadt</span>
                <span className="text-center">Live / Ziel</span>
                <span className="text-center">Signed</span>
                <span className="text-center">Approved</span>
                <span className="text-center">Aufbau</span>
                <span className="text-center">Churn</span>
                <span className="text-center">%</span>
                <span>Fortschritt</span>
              </div>

              {cityPerformanceWithTargets.filter(c => c.target > 0 || c.total > 5).map(c => {
                const progressColor = c.progress >= 80 ? '#34C759' : c.progress >= 50 ? '#007AFF' : c.progress >= 25 ? '#FF9500' : '#FF3B30';
                return (
                  <div key={c.name}
                    className="grid grid-cols-[1fr_70px_50px_55px_55px_55px_50px_90px] gap-1.5 items-center bg-surface-secondary/60 border border-border-secondary/60 rounded-xl px-3 py-2.5 hover:bg-surface-secondary/60 transition-colors cursor-pointer min-w-[700px]"
                    onClick={() => { setCityFilter(cityFilter === c.name ? 'all' : c.name); setActiveSection('overview'); }}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin size={12} className="text-text-muted flex-shrink-0" />
                      <span className="text-xs font-semibold text-text-primary">{c.name}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold text-text-primary">{c.live}</span>
                      {c.target > 0 && <span className="text-xs text-text-muted"> / {c.target}</span>}
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold text-status-online">{c.signed}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold text-accent">{c.accepted}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold text-cyan-600">{c.readyForBuild || 0}</span>
                    </div>
                    <div className="text-center">
                      {c.churn > 0 ? (
                        <span className="text-xs font-bold text-status-offline">{c.churn} <span className="text-xs text-status-offline">({c.churnRate}%)</span></span>
                      ) : (
                        <span className="text-xs text-text-muted">–</span>
                      )}
                    </div>
                    <div className="text-center">
                      {c.target > 0 ? (
                        <span className="text-xs font-bold" style={{ color: progressColor }}>{c.progress}%</span>
                      ) : (
                        <span className="text-xs text-text-muted">–</span>
                      )}
                    </div>
                    <div>
                      {c.target > 0 ? (
                        <div className="w-full h-2 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, c.progress)}%`, backgroundColor: progressColor }} />
                        </div>
                      ) : (
                        <div className="w-full h-2 bg-surface-secondary rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-surface-tertiary" style={{ width: `${Math.min(100, c.total > 0 ? 30 : 0)}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* City Summary Footer */}
            <div className="flex items-center gap-6 mt-4 pt-3 border-t border-border-secondary text-xs text-text-muted">
              <div>Städte mit Ziel: <span className="font-mono font-bold text-text-secondary">{cityPerformanceWithTargets.filter(c => c.target > 0).length}</span></div>
              <div>Städte in Pipeline: <span className="font-mono font-bold text-text-secondary">{cityPerformanceWithTargets.filter(c => c.total > 0).length}</span></div>
              <div>Noch aufzubauen: <span className="font-mono font-bold text-status-offline">{Math.max(0, TOTAL_NETWORK_TARGET - totalLive)}</span> Displays</div>
              {conversionMetrics.overallConversion > 0 && (
                <div>Geschätzte Wochen bis Ziel: <span className="font-mono font-bold text-violet-600">
                  {conversionMetrics.requiredWeeklyAcquisitions > 0 ? Math.ceil((TOTAL_NETWORK_TARGET - totalLive) / conversionMetrics.WEEKLY_BUILD_TARGET) : '–'}
                </span></div>
              )}
            </div>
          </div>

          {/* Dropout Analysis */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Dropout-Analyse & Soll-Akquise</h3>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-accent-light/60 rounded-xl border border-blue-100">
                <div className="text-2xl font-black text-accent">{conversionMetrics.total}</div>
                <div className="text-xs text-accent mt-1">Aktive Leads</div>
              </div>
              <div className="text-center p-3 bg-status-online/10/60 rounded-xl border border-green-100">
                <div className="text-2xl font-black text-status-online">{conversionMetrics.signed}</div>
                <div className="text-xs text-status-online mt-1">Signed</div>
              </div>
              <div className="text-center p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <div className="text-2xl font-black text-emerald-600">{conversionMetrics.installed}</div>
                <div className="text-xs text-emerald-500 mt-1">Installiert</div>
              </div>
              <div className="text-center p-3 bg-status-offline/10/60 rounded-xl border border-red-100">
                <div className="text-2xl font-black text-status-offline">{conversionMetrics.cancelledTotal}</div>
                <div className="text-xs text-status-offline mt-1">
                  Storniert ({conversionMetrics.dropoutRate}%)
                </div>
                <div className="text-xs text-red-300 mt-0.5">
                  {conversionMetrics.cancelledAkquise} Akquise · {conversionMetrics.cancelledPostInstall} Post-Install
                </div>
              </div>
              <div className="text-center p-3 bg-violet-50/60 rounded-xl border border-violet-200">
                <div className="text-2xl font-black text-violet-600">{conversionMetrics.requiredWeeklyAcquisitions}</div>
                <div className="text-xs text-violet-500 mt-1 font-medium">Soll-Akquisen/W</div>
                <div className="text-xs text-violet-400 mt-0.5">
                  für {conversionMetrics.WEEKLY_BUILD_TARGET} Installs/W
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-surface-secondary rounded-xl text-xs text-text-muted">
              <span className="font-bold text-text-secondary">Rechenweg:</span> Bei {conversionMetrics.overallConversion}% Gesamt-Conversion (Akquise→Live) werden für {conversionMetrics.WEEKLY_BUILD_TARGET} Installationen/Woche mindestens <span className="font-bold text-violet-600">{conversionMetrics.requiredWeeklyAcquisitions} Akquisen/Woche</span> benötigt.
            </div>
          </div>

          {/* Stadt-Conversion Tabelle */}
          {conversionMetrics.cityConversion && conversionMetrics.cityConversion.length > 0 && (
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={14} className="text-text-muted" />
                <h3 className="text-sm font-semibold text-text-primary">Conversion & Besuche nach Stadt</h3>
              </div>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[1fr_50px_55px_55px_50px_55px_55px_55px_50px_50px] gap-1 text-xs text-text-muted mb-2 px-1 min-w-[750px]">
                  <div>Stadt</div>
                  <div className="text-center">Besuche</div>
                  <div className="text-center">Erfolg</div>
                  <div className="text-center">Kein Int.</div>
                  <div className="text-center">Erflg%</div>
                  <div className="text-center">Signed</div>
                  <div className="text-center">Approved</div>
                  <div className="text-center">Sig→App</div>
                  <div className="text-center">Inst.</div>
                  <div className="text-center">Churn</div>
                </div>
                <div className="space-y-0.5 min-w-[750px]">
                  {conversionMetrics.cityConversion.slice(0, 15).map(cc => (
                    <div key={cc.name} className="grid grid-cols-[1fr_50px_55px_55px_50px_55px_55px_55px_50px_50px] gap-1 items-center text-xs px-1 py-1.5 rounded-lg hover:bg-accent-light/40 transition-colors">
                      <div className="font-medium text-text-primary truncate">{cc.name}</div>
                      <div className="text-center text-text-secondary">{cc.storeVisits}</div>
                      <div className="text-center text-status-online">{cc.successfulVisits}</div>
                      <div className="text-center text-status-offline">{cc.noInterest}</div>
                      <div className="text-center">
                        <span className={`px-1 py-0.5 rounded text-xs ${cc.visitSuccessRate >= 40 ? 'bg-status-online/10 text-green-700' : cc.visitSuccessRate >= 20 ? 'bg-status-warning/10 text-amber-700' : 'bg-status-offline/10 text-red-700'}`}>
                          {cc.visitSuccessRate}%
                        </span>
                      </div>
                      <div className="text-center text-violet-600">{cc.signed}</div>
                      <div className="text-center text-accent">{cc.approved}</div>
                      <div className="text-center">
                        <span className={`px-1 py-0.5 rounded text-xs ${cc.signedToApproved >= 70 ? 'bg-status-online/10 text-green-700' : cc.signedToApproved >= 40 ? 'bg-status-warning/10 text-amber-700' : 'bg-status-offline/10 text-red-700'}`}>
                          {cc.signedToApproved}%
                        </span>
                      </div>
                      <div className="text-center text-status-online">{cc.installed}</div>
                      <div className="text-center">
                        <span className={`px-1 py-0.5 rounded text-xs ${cc.churnRate <= 5 ? 'bg-status-online/10 text-green-700' : cc.churnRate <= 15 ? 'bg-status-warning/10 text-amber-700' : 'bg-status-offline/10 text-red-700'}`}>
                          {cc.churnRate}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* KI-Analyse: Storno-Insights */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 shadow-lg text-white">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-sm">
                <Zap size={14} />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Storno-Analyse</h3>
                <p className="text-xs text-text-muted">Automatische Auswertung der Abbrüche</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${cancellationInsight.last7Count > 0 ? 'bg-status-offline/20 text-red-300' : 'bg-status-online/20 text-green-300'}`}>
                  {cancellationInsight.last7Count} letzte 7T
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-tertiary text-text-muted">
                  {cancellationInsight.last30Count} letzte 30T
                </span>
              </div>
            </div>

            {/* Insight Bullets */}
            <div className="space-y-1.5 mb-4">
              {cancellationInsight.insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-text-muted mt-0.5 flex-shrink-0">▸</span>
                  <span className="text-text-muted">{insight}</span>
                </div>
              ))}
            </div>

            {/* Detail Grid */}
            {cancellationInsight.last30Count > 0 && (
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border-primary">
                {/* Top Reasons */}
                <div>
                  <div className="text-xs text-text-muted mb-2 font-medium">Top Gründe</div>
                  <div className="space-y-1">
                    {cancellationInsight.topReasons.length > 0 ? cancellationInsight.topReasons.map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between">
                        <span className="text-xs text-text-muted truncate mr-2">{reason}</span>
                        <span className="text-xs text-status-offline font-bold flex-shrink-0">{count}</span>
                      </div>
                    )) : (
                      <span className="text-xs text-text-muted">Keine Gründe angegeben</span>
                    )}
                  </div>
                </div>

                {/* Top Cities */}
                <div>
                  <div className="text-xs text-text-muted mb-2 font-medium">Betroffene Städte</div>
                  <div className="space-y-1">
                    {cancellationInsight.topCities.map(([city, count]) => (
                      <div key={city} className="flex items-center justify-between">
                        <span className="text-xs text-text-muted">{city}</span>
                        <span className="text-xs text-amber-400 font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Partners */}
                <div>
                  <div className="text-xs text-text-muted mb-2 font-medium">Betroffene Partner</div>
                  <div className="space-y-1">
                    {cancellationInsight.topPartners.map(([partner, count]) => (
                      <div key={partner} className="flex items-center justify-between">
                        <span className="text-xs text-text-muted truncate mr-2">{partner}</span>
                        <span className="text-xs text-accent font-bold flex-shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recent Cancellations List */}
            {cancellationInsight.recentItems.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-primary">
                <div className="text-xs text-text-muted mb-2 font-medium">Letzte Abbrüche</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {cancellationInsight.recentItems.slice(0, 8).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg bg-surface-primary/50">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${item.type === 'Post-Install' ? 'bg-status-warning/20 text-orange-300' : 'bg-status-offline/20 text-red-300'}`}>
                        {item.type === 'Post-Install' ? 'PI' : 'AQ'}
                      </span>
                      <span className="text-text-muted truncate flex-1">{item.name}</span>
                      <span className="text-text-muted flex-shrink-0">{item.city}</span>
                      <span className="text-text-muted flex-shrink-0">{fmtDate(item.date)}</span>
                      <span className="text-text-muted truncate max-w-[120px]">{item.reasons}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Installations-Pipeline (Admin only) ─── */}
          {userIsAdmin && (
            <div className="bg-surface-primary border border-status-warning/20/60 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-status-warning/10 flex items-center justify-center">
                  <Calendar size={16} className="text-status-warning" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary">Installations-Pipeline</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-warning/10 text-status-warning">Admin</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Aufbaubereit */}
                <button
                  onClick={() => { window.location.hash = '#installations/ready'; }}
                  className="bg-cyan-50/80 rounded-xl px-4 py-3 text-left hover:bg-cyan-100/80 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={14} className="text-cyan-600" />
                    <p className="text-[11px] text-text-muted font-medium">Aufbaubereit</p>
                  </div>
                  <p className="text-2xl font-bold text-cyan-700">{kpis.readyForInstall}</p>
                  <p className="text-[10px] text-text-muted group-hover:text-cyan-600 transition-colors">→ Details anzeigen</p>
                </button>

                {/* Eingeladen / Ausstehend */}
                <button
                  onClick={() => { window.location.hash = '#installations/bookings'; }}
                  className="bg-status-warning/10/80 rounded-xl px-4 py-3 text-left hover:bg-status-warning/10/80 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Inbox size={14} className="text-status-warning" />
                    <p className="text-[11px] text-text-muted font-medium">Ausstehend</p>
                  </div>
                  <p className="text-2xl font-bold text-amber-700">
                    {installBookings.filter(b => b.status === 'pending').length}
                  </p>
                  <p className="text-[10px] text-text-muted group-hover:text-status-warning transition-colors">→ Buchungen anzeigen</p>
                </button>

                {/* Termine diese Woche */}
                {(() => {
                  const today = new Date();
                  const dayOfWeek = today.getDay();
                  const monday = new Date(today);
                  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
                  const sunday = new Date(monday);
                  sunday.setDate(monday.getDate() + 6);
                  const monStr = monday.toLocaleDateString('sv-SE');
                  const sunStr = sunday.toLocaleDateString('sv-SE');
                  const thisWeek = installBookings.filter(b =>
                    (b.status === 'booked' || b.status === 'confirmed') &&
                    b.booked_date && b.booked_date >= monStr && b.booked_date <= sunStr
                  ).length;
                  return (
                    <button
                      onClick={() => { window.location.hash = '#installations/calendar'; }}
                      className="bg-emerald-50/80 rounded-xl px-4 py-3 text-left hover:bg-emerald-100/80 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={14} className="text-emerald-600" />
                        <p className="text-[11px] text-text-muted font-medium">Termine diese Woche</p>
                      </div>
                      <p className="text-2xl font-bold text-emerald-700">{thisWeek}</p>
                      <p className="text-[10px] text-text-muted group-hover:text-emerald-600 transition-colors">→ Kalender anzeigen</p>
                    </button>
                  );
                })()}

                {/* Reminder fällig */}
                {(() => {
                  const cutoff = Date.now() - 22 * 60 * 60 * 1000;
                  const due = installBookings.filter(b =>
                    b.status === 'pending' && b.reminder_count === 0 && b.whatsapp_sent_at &&
                    new Date(b.whatsapp_sent_at).getTime() < cutoff
                  ).length;
                  return (
                    <button
                      onClick={() => { window.location.hash = '#installations/bookings'; }}
                      className="bg-status-offline/10/80 rounded-xl px-4 py-3 text-left hover:bg-status-offline/10/80 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Bell size={14} className="text-status-offline" />
                        <p className="text-[11px] text-text-muted font-medium">Reminder faellig</p>
                      </div>
                      <p className="text-2xl font-bold text-red-700">{due}</p>
                      <p className="text-[10px] text-text-muted group-hover:text-status-offline transition-colors">→ Buchungen anzeigen</p>
                    </button>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Overview Section ─── */}
      {activeSection === 'overview' && (
        <div className="space-y-5">
          {/* Lead-Status Kacheln */}
          <div>
            <h3 className="text-xs font-medium text-text-secondary mb-3">Lead-Status Verteilung</h3>
            {funnelData.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2.5">
                {Object.entries(LEAD_STATUS_CONFIG).map(([statusKey, cfg]) => {
                  const entry = funnelData.find(f => f.name === statusKey);
                  const count = entry?.count || 0;
                  const isActive = statusFilter === statusKey;
                  const pct = kpis.active > 0 ? Math.round(count / kpis.active * 100) : 0;
                  return (
                    <div
                      key={statusKey}
                      onClick={() => setStatusFilter(isActive ? 'all' : statusKey)}
                      className={`relative bg-surface-primary border rounded-xl p-3 shadow-card transition-all cursor-pointer hover:shadow-md ${isActive ? 'ring-2 ring-offset-1' : 'border-border-secondary'}`}
                      style={isActive ? { borderColor: cfg.color, '--tw-ring-color': cfg.color } : {}}
                    >
                      {/* Color accent bar */}
                      <div className="absolute top-0 left-3 right-3 h-[3px] rounded-b-full" style={{ backgroundColor: cfg.color, opacity: count > 0 ? 1 : 0.2 }} />
                      <div className="text-center pt-1">
                        <div className="text-lg font-bold text-text-primary">{count}</div>
                        <div className="text-xs font-medium text-text-muted mt-0.5 leading-tight">{cfg.label}</div>
                        {count > 0 && (
                          <div className="text-xs mt-1" style={{ color: cfg.color }}>{pct}%</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-text-muted text-center py-10">Keine Daten vorhanden</div>
            )}
          </div>

          {/* Partner Performance (excl. New Leads) */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-text-secondary">Partner Performance</h3>
              <span className="text-xs text-text-muted">ohne New Leads</span>
            </div>
            {partnerData.length > 0 ? (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-[1fr_60px_60px_60px_70px_70px] gap-2 px-3 py-1">
                  <span className="text-xs text-text-muted font-medium uppercase">Partner</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Leads</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Accepted</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Signed</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Install-Rate</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Sign-Rate</span>
                </div>
                {partnerData.map((p) => (
                  <div key={p.name} className="grid grid-cols-[1fr_60px_60px_60px_70px_70px] gap-2 items-center bg-surface-secondary/60 border border-border-secondary/60 rounded-xl px-3 py-2.5 hover:bg-surface-secondary/60 transition-colors">
                    <span className="text-xs font-medium text-text-primary truncate">{p.name}</span>
                    <span className="text-xs text-text-secondary text-center font-bold">{p.total}</span>
                    <div className="text-center">
                      <span className="text-xs text-violet-600 font-bold">{p.accepted}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-status-online font-bold">{p.signed}</span>
                    </div>
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-10 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${p.installRate}%`, backgroundColor: p.installRate >= 50 ? '#34C759' : p.installRate >= 25 ? '#FF9500' : '#FF3B30' }} />
                        </div>
                        <span className="text-xs text-text-muted">{p.installRate}%</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-10 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${p.signRate}%`, backgroundColor: p.signRate >= 50 ? '#34C759' : p.signRate >= 25 ? '#FF9500' : '#FF3B30' }} />
                        </div>
                        <span className="text-xs text-text-muted">{p.signRate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-muted text-center py-10">Keine Partner-Daten</div>
            )}
          </div>

          {/* Acquirer Performance (excl. New Leads) */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-text-secondary">Akquisiteur Performance</h3>
              <span className="text-xs text-text-muted">ohne New Leads</span>
            </div>
            {acquirerData.length > 0 ? (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-[1fr_60px_60px_60px_70px_70px] gap-2 px-3 py-1">
                  <span className="text-xs text-text-muted font-medium uppercase">Akquisiteur</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Leads</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Accepted</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Signed</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Install-Rate</span>
                  <span className="text-xs text-text-muted font-medium uppercase text-center">Sign-Rate</span>
                </div>
                {acquirerData.map((a) => (
                  <div key={a.name} className="grid grid-cols-[1fr_60px_60px_60px_70px_70px] gap-2 items-center bg-surface-secondary/60 border border-border-secondary/60 rounded-xl px-3 py-2.5 hover:bg-surface-secondary/60 transition-colors">
                    <span className="text-xs font-medium text-text-primary truncate">{a.name}</span>
                    <span className="text-xs text-text-secondary text-center font-bold">{a.total}</span>
                    <div className="text-center">
                      <span className="text-xs text-violet-600 font-bold">{a.accepted}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-status-online font-bold">{a.signed}</span>
                    </div>
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-10 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${a.installRate}%`, backgroundColor: a.installRate >= 50 ? '#34C759' : a.installRate >= 25 ? '#FF9500' : '#FF3B30' }} />
                        </div>
                        <span className="text-xs text-text-muted">{a.installRate}%</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-10 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${a.signRate}%`, backgroundColor: a.signRate >= 50 ? '#34C759' : a.signRate >= 25 ? '#FF9500' : '#FF3B30' }} />
                        </div>
                        <span className="text-xs text-text-muted">{a.signRate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-muted text-center py-10">Keine Akquisiteur-Daten</div>
            )}
          </div>
        </div>
      )}

      {/* ─── Pipeline Section ─── */}
      {activeSection === 'pipeline' && (
        <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border-secondary">
            <span className="text-xs font-medium text-text-muted">{filtered.filter(r => !isStorno(r)).length} aktive Leads</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-secondary">
                  {['Akquise-ID', 'Standort', 'Stadt', 'PLZ', 'Status', 'Partner', 'Akquisiteur', 'Datum', 'Vertrag', 'dVAC/W', 'Kontakt'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.filter(r => !isStorno(r)).map(r => {
                  const sc = getStatusConfig(r.leadStatus);
                  return (
                    <tr key={r.id} className="border-b border-border-secondary hover:bg-surface-secondary/50 transition-colors">
                      <td className="px-3 py-2 text-text-primary">{r.akquiseId || '–'}</td>
                      <td className="px-3 py-2 text-text-primary max-w-[200px] truncate">{r.locationName || '–'}</td>
                      <td className="px-3 py-2 text-text-muted">{(r.city || []).join(', ') || '–'}</td>
                      <td className="px-3 py-2 text-text-muted">{r.postalCode || '–'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.color}33` }}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-muted">{r.acquisitionPartner || '–'}</td>
                      <td className="px-3 py-2 text-text-muted">{r.submittedBy || '–'}</td>
                      <td className="px-3 py-2 text-text-muted">{fmtDate(r.acquisitionDate)}</td>
                      <td className="px-3 py-2 text-center">
                        {r.vertragVorhanden && r.vertragVorhanden !== 'false' && r.vertragVorhanden !== ''
                          ? <CheckCircle2 size={14} className="text-status-online inline" />
                          : <span className="text-text-muted">–</span>}
                      </td>
                      <td className="px-3 py-2 text-text-muted">{r.dvacWeek != null ? r.dvacWeek : '–'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {r.contactEmail && (
                            <a href={`mailto:${r.contactEmail}`} className="text-accent hover:text-blue-700" title={r.contactEmail}>
                              <ExternalLink size={12} />
                            </a>
                          )}
                          {r.contactPhone && (
                            <a href={`tel:${r.contactPhone}`} className="text-status-online hover:text-green-700" title={r.contactPhone}>
                              📞
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.filter(r => !isStorno(r)).length === 0 && (
            <div className="text-xs text-text-muted text-center py-10">Keine aktiven Leads gefunden</div>
          )}
        </div>
      )}

      {/* ─── Storno Section ─── */}
      {activeSection === 'storno' && (
        <div className="space-y-5">
          {/* Storno Reasons */}
          {stornoReasons.length > 0 && (
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-medium text-text-secondary mb-4">Post-Install Storno Gründe</h3>
              <ResponsiveContainer width="100%" height={Math.max(150, stornoReasons.length * 32)}>
                <BarChart data={stornoReasons} layout="vertical" margin={{ left: 160, right: 20, top: 5, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontFamily: 'monospace' }} width={150} />
                  <Tooltip contentStyle={{ fontSize: 11, fontFamily: 'monospace', borderRadius: 12 }} />
                  <Bar dataKey="count" fill="#FF3B30" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Storno Table */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border-secondary">
              <span className="text-xs font-medium text-text-muted">{kpis.stornoTotal} Stornierungen</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-secondary">
                    {['Akquise-ID', 'Standort', 'Stadt', 'Typ', 'Grund', 'Partner', 'Datum'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium text-text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.filter(r => isStorno(r)).map(r => (
                    <tr key={r.id} className="border-b border-border-secondary hover:bg-surface-secondary/50">
                      <td className="px-3 py-2 text-text-primary">{r.akquiseId || '–'}</td>
                      <td className="px-3 py-2 text-text-primary max-w-[200px] truncate">{r.locationName || '–'}</td>
                      <td className="px-3 py-2 text-text-muted">{(r.city || []).join(', ') || '–'}</td>
                      <td className="px-3 py-2">
                        {r.akquiseStorno && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-status-offline/10 text-status-offline border border-status-offline/20">
                            Akquise
                          </span>
                        )}
                        {r.postInstallStorno && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20 ml-1">
                            Post-Install
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-text-muted text-sm">{(r.postInstallStornoGrund || []).join(', ') || '–'}</td>
                      <td className="px-3 py-2 text-text-muted">{r.acquisitionPartner || '–'}</td>
                      <td className="px-3 py-2 text-text-muted">{fmtDate(r.acquisitionDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {kpis.stornoTotal === 0 && (
              <div className="text-xs text-text-muted text-center py-10">Keine Stornierungen</div>
            )}
          </div>
        </div>
      )}

      {/* KI-Akquise Automation */}
      {activeSection === 'automation' && showAutomation && (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade KI-Automation...</span></div>}>
          <AkquiseAutomationDashboard />
        </Suspense>
      )}
    </div>
  );
}
