import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import {
  Monitor,
  RefreshCw,
  Loader2,
  AlertCircle,
  LayoutDashboard,
  List,
  MapPin,
  ClipboardList,
  X,
  Lock,
  MessageSquare,
  Shield,
  LogOut,
  Mail,
} from 'lucide-react';

import {
  parseRows,
  aggregateData,
  computeKPIs,
  computeOfflineDistribution,
  computeNewDisplayWatchlist,
  formatDateTime,
} from './utils/dataProcessing';
import {
  login,
  logout,
  getCurrentUser,
  isAdmin,
  isAuthenticated,
  hasPermission,
  canAccessTab,
  getInitials,
  getCurrentGroup,
} from './utils/authService';
import KPICards, { KPI_FILTERS } from './components/KPICards';
import HealthTrendChart from './components/HealthTrendChart';
import OfflineDistributionChart from './components/OfflineDistributionChart';
import CityHealthChart from './components/CityHealthChart';
import DisplayTable from './components/DisplayTable';
import DisplayDetail from './components/DisplayDetail';
import DateRangePicker from './components/DateRangePicker';
import NewDisplayWatchlist from './components/NewDisplayWatchlist';
import OverviewHealthPatterns from './components/OverviewHealthPatterns';
import TaskDashboard from './components/TaskDashboard';
import CommunicationDashboard from './components/CommunicationDashboard';
import AdminPanel from './components/AdminPanel';

const SHEET_URL_DIRECT =
  'https://docs.google.com/spreadsheets/d/1MGqJAGgROYohc_SwR3NhW-BEyJXixLKQZhS9yUOH8_s/export?format=csv&gid=0';
const SHEET_URL = import.meta.env.DEV ? '/api/sheets' : SHEET_URL_DIRECT;

const KPI_FILTER_LABELS = {
  [KPI_FILTERS.ACTIVE]: 'Aktive Displays',
  [KPI_FILTERS.ONLINE]: 'Online Displays (< 24h)',
  [KPI_FILTERS.WARNING]: 'Warnung (24-72h)',
  [KPI_FILTERS.CRITICAL]: 'Kritische Displays (> 72h)',
  [KPI_FILTERS.PERMANENT_OFFLINE]: 'Dauerhaft Offline (> 7 Tage)',
  [KPI_FILTERS.NEVER_ONLINE]: 'Nie Online (kein Heartbeat)',
  [KPI_FILTERS.NEW]: 'Neu installierte Displays (7 Tage)',
  [KPI_FILTERS.DEINSTALLED]: 'Deinstallierte Displays (30 Tage)',
};

function App() {
  /* ─── Auth State ─── */
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  /* ─── Data State ─── */
  const [parsedRows, setParsedRows] = useState(null);
  const [dataEarliest, setDataEarliest] = useState(null);
  const [dataLatest, setDataLatest] = useState(null);
  const [globalFirstSeen, setGlobalFirstSeen] = useState(null);
  const [totalRowsGlobal, setTotalRowsGlobal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDisplay, setSelectedDisplay] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState('displays');
  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [loadProgress, setLoadProgress] = useState('');

  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);

  const [kpiFilter, setKpiFilter] = useState(null);

  // Webhook URL for alert automation (persisted in localStorage)
  const [webhookUrl, setWebhookUrl] = useState(
    () => localStorage.getItem('dooh_webhook_url') || ''
  );
  const handleWebhookUrlChange = useCallback((url) => {
    setWebhookUrl(url);
    localStorage.setItem('dooh_webhook_url', url);
  }, []);

  /* ─── Data Loading ─── */

  // In-memory cache – survives re-renders but not page refresh.
  // Avoids localStorage size limits (CSV can be several MB).
  const csvCacheRef = useRef(null);

  function processRawRows(rawRows) {
    const { parsed, earliest, latest, globalFirstSeen: gfs, totalRows } = parseRows(rawRows);
    setParsedRows(parsed);
    setDataEarliest(earliest);
    setDataLatest(latest);
    setGlobalFirstSeen(gfs);
    setTotalRowsGlobal(totalRows);
    if (latest) {
      const start = new Date(latest.getTime() - 30 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      setRangeStart(start);
    }
    setRangeEnd(null);
    setLoading(false);
    setLoadProgress('');
  }

  const loadData = useCallback((forceRefresh = false) => {
    setLoading(true);
    setError(null);

    // Use in-memory cache if available and not forced refresh
    if (!forceRefresh && csvCacheRef.current) {
      setLoadProgress('Verarbeite gecachte Daten...');
      setTimeout(() => {
        try {
          processRawRows(csvCacheRef.current);
        } catch (e) {
          // Cache corrupted – clear and retry fresh
          csvCacheRef.current = null;
          setError(`Fehler bei Datenverarbeitung: ${e.message}`);
          setLoading(false);
        }
      }, 20);
      return;
    }

    setLoadProgress('Daten werden geladen...');

    Papa.parse(SHEET_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          setLoadProgress(`${results.data.length} Zeilen geladen. Verarbeite...`);
          // Keep in memory for fast re-renders (no localStorage size issues)
          csvCacheRef.current = results.data;
          setTimeout(() => {
            try {
              processRawRows(results.data);
            } catch (e) {
              setError(`Fehler bei Datenverarbeitung: ${e.message}`);
              setLoading(false);
            }
          }, 50);
        } catch (e) {
          setError(`Fehler beim Parsen: ${e.message}`);
          setLoading(false);
        }
      },
      error: (err) => {
        setError(`Fehler beim Laden der CSV: ${err.message}`);
        setLoading(false);
      },
    });
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  /* ─── Derived Data ─── */

  const rawData = useMemo(() => {
    if (!parsedRows) return null;
    return aggregateData(parsedRows, rangeStart, rangeEnd, globalFirstSeen);
  }, [parsedRows, rangeStart, rangeEnd, globalFirstSeen]);

  const kpis = useMemo(() => {
    if (!rawData || !rawData.latestTimestamp) return null;
    return computeKPIs(rawData.displays, rawData.latestTimestamp, globalFirstSeen, rawData.trendData);
  }, [rawData, globalFirstSeen]);

  const distribution = useMemo(() => {
    if (!rawData) return [];
    return computeOfflineDistribution(rawData.displays);
  }, [rawData]);

  const watchlist = useMemo(() => {
    if (!rawData || !rawData.latestTimestamp) return [];
    return computeNewDisplayWatchlist(rawData.displays, rawData.latestTimestamp);
  }, [rawData]);

  const kpiFilteredDisplays = useMemo(() => {
    if (!kpiFilter || !kpis?._lists) return null;
    return kpis._lists[kpiFilter] || null;
  }, [kpiFilter, kpis]);

  const rangeLabel = useMemo(() => {
    if (!rangeStart && !rangeEnd) return 'Gesamter Zeitraum';
    if (rangeStart && !rangeEnd && dataLatest) {
      const diffDays = Math.round(
        (dataLatest.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 7) return '7 Tage';
      if (diffDays <= 14) return '14 Tage';
      if (diffDays <= 30) return '30 Tage';
      if (diffDays <= 90) return '90 Tage';
      return `${diffDays} Tage`;
    }
    const fmtD = (d) =>
      `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
        .toString()
        .padStart(2, '0')}.${d.getFullYear()}`;
    const parts = [];
    if (rangeStart) parts.push(fmtD(rangeStart));
    parts.push('–');
    if (rangeEnd) parts.push(fmtD(rangeEnd));
    else if (dataLatest) parts.push(fmtD(dataLatest));
    return parts.join(' ');
  }, [rangeStart, rangeEnd, dataLatest]);

  const handleRangeChange = useCallback((start, end) => {
    setRangeStart(start);
    setRangeEnd(end);
    setKpiFilter(null);
  }, []);

  const handleKpiFilterClick = useCallback((filter) => {
    setKpiFilter(filter);
  }, []);

  /* ─── Auth Handlers ─── */

  const handleLogin = (e) => {
    e.preventDefault();

    const result = login(emailInput, passwordInput);

    if (result.success) {
      setAuthenticated(true);
      setCurrentUser(result.user);
      setAuthError('');
      setEmailInput('');
      setPasswordInput('');
    } else {
      setAuthError(result.error);
    }
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setCurrentUser(null);
    setActiveMainTab('displays');
  };

  /* ─── Login Screen ─── */

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-sm">
          <form onSubmit={handleLogin} className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-8 shadow-sm shadow-black/[0.03]">
            <div className="flex flex-col items-center mb-6">
              <img
                src="/dimension-outdoor-logo.png"
                alt="Dimension Outdoor"
                className="h-10 w-auto mb-4 brightness-0 opacity-80"
              />
              <h1 className="text-sm font-bold text-slate-900 tracking-wide">
                JET GERMANY
              </h1>
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Display Network Monitor
              </p>
            </div>

            <div className="space-y-4">
              {/* Email / Username Field */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">E-Mail / Benutzername</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setAuthError(''); }}
                    placeholder="name@dimension-outdoor.com"
                    autoFocus
                    className={`w-full bg-slate-50/80 border rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                      authError
                        ? 'border-[#ef4444] focus:border-[#ef4444]'
                        : 'border-slate-200/60 focus:border-[#3b82f6]'
                    }`}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Passwort</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }}
                    placeholder="Passwort eingeben..."
                    className={`w-full bg-slate-50/80 border rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                      authError
                        ? 'border-[#ef4444] focus:border-[#ef4444]'
                        : 'border-slate-200/60 focus:border-[#3b82f6]'
                    }`}
                  />
                </div>
                {authError && (
                  <p className="text-[#ef4444] text-xs mt-1.5 font-mono">
                    {authError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
              >
                Anmelden
              </button>

              <p className="text-[10px] text-slate-300 font-mono text-center mt-2">
                Kontakt: admin@dimension-outdoor.com
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ─── Loading Screen ─── */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-blue-200/20 rounded-full blur-3xl animate-float" />
          <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-violet-200/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
          <div className="absolute top-1/4 right-1/4 w-48 h-48 bg-sky-200/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '0.8s' }} />
        </div>

        <div className="text-center relative z-10">
          {/* Logo with float animation */}
          <div className="animate-slide-up">
            <div className="relative inline-block mb-6">
              <img
                src="/dimension-outdoor-logo.png"
                alt="Dimension Outdoor"
                className="h-14 w-auto brightness-0 opacity-80 mx-auto animate-float"
              />
              {/* Shimmer line under logo */}
              <div className="mt-3 h-px w-full animate-shimmer rounded-full" />
            </div>
          </div>

          {/* Title */}
          <div className="animate-slide-up" style={{ animationDelay: '0.15s', opacity: 0 }}>
            <h1 className="text-lg font-bold text-slate-900 tracking-wider mb-1">
              JET GERMANY
            </h1>
            <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">
              Display Network Monitor
            </p>
          </div>

          {/* Progress bar */}
          <div className="animate-slide-up mt-8 w-56 mx-auto" style={{ animationDelay: '0.3s', opacity: 0 }}>
            <div className="h-1 bg-slate-100/80 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 rounded-full animate-progress-glow"
                style={{ width: loadProgress?.includes('Verarbeite') ? '85%' : '45%', transition: 'width 1.5s ease-in-out' }}
              />
            </div>
          </div>

          {/* Status text with bouncing dots */}
          <div className="animate-slide-up mt-4" style={{ animationDelay: '0.45s', opacity: 0 }}>
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-xs text-slate-400 font-mono">
                {loadProgress || 'Initialisiere'}
              </span>
              <span className="flex gap-0.5">
                <span className="loading-dot w-1 h-1 bg-blue-400 rounded-full inline-block" />
                <span className="loading-dot w-1 h-1 bg-blue-400 rounded-full inline-block" />
                <span className="loading-dot w-1 h-1 bg-blue-400 rounded-full inline-block" />
              </span>
            </div>
          </div>

          {/* Subtle grid pattern hint */}
          <div className="animate-slide-up mt-10" style={{ animationDelay: '0.6s', opacity: 0 }}>
            <div className="flex items-center justify-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-8 h-1 rounded-full bg-slate-200/60"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    opacity: 0.3 + (i === 2 ? 0.4 : 0),
                  }}
                />
              ))}
            </div>
            <p className="text-[10px] text-slate-300 font-mono mt-2">
              powered by dimension outdoor
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Error Screen ─── */

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle size={40} className="text-[#ef4444] mx-auto mb-4" />
          <div className="text-slate-900 text-sm font-medium mb-2">
            Fehler beim Laden
          </div>
          <div className="text-slate-400 text-xs font-mono mb-4">{error}</div>
          <button
            onClick={() => loadData(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-lg text-xs text-slate-600 hover:border-[#3b82f6] transition-colors"
          >
            <RefreshCw size={14} />
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (!rawData || !kpis) return null;

  /* ─── Tabs ─── */

  const userGroup = getCurrentGroup();

  const allMainTabs = [
    { id: 'displays', label: 'Display Management', icon: Monitor },
    { id: 'tasks', label: 'Tasks', icon: ClipboardList },
    { id: 'communication', label: 'Kommunikation', icon: MessageSquare },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  const mainTabs = allMainTabs.filter((tab) => canAccessTab(tab.id));

  const subTabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'list', label: 'Displays', icon: List },
    { id: 'cities', label: 'Stadte', icon: MapPin },
  ];

  /* ─── Group Badge ─── */

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-200/60 bg-white/60 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/dimension-outdoor-logo.png"
                alt="Dimension Outdoor"
                className="h-8 w-auto brightness-0 opacity-80"
              />
              <div className="w-px h-6 bg-slate-200" />
              <div className="flex items-center gap-3">
                <Monitor size={20} className="text-[#3b82f6]" />
                <div>
                  <h1 className="text-base font-bold text-slate-900 tracking-wide">
                    JET GERMANY
                  </h1>
                  <p className="text-xs text-slate-400 font-mono">
                    Display Network Monitor
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-slate-400 font-mono">
                  Letzter API-Check
                </div>
                <div className="text-sm text-slate-600 font-mono">
                  {formatDateTime(rawData.latestTimestamp)}
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-xs text-slate-400 font-mono">
                  Datenpunkte
                </div>
                <div className="text-sm text-slate-600 font-mono">
                  {totalRowsGlobal.toLocaleString('de-DE')}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-emerald-50/60 border border-emerald-200/40 rounded-full px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse-glow" />
                <span className="text-sm font-mono font-medium text-emerald-700">
                  {kpis.totalActive} Displays
                </span>
              </div>
              <button
                onClick={() => loadData(true)}
                className="p-1.5 rounded-md hover:bg-slate-100/60 text-slate-400 hover:text-slate-900 transition-colors"
                title="Daten neu laden"
              >
                <RefreshCw size={14} />
              </button>

              {/* User Info + Logout */}
              {currentUser && (
                <>
                  <div className="w-px h-6 bg-slate-200 hidden sm:block" />
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: userGroup?.color || '#64748b' }}
                    >
                      {getInitials(currentUser.name)}
                    </div>
                    <div className="hidden sm:block text-right">
                      <div className="text-xs font-medium text-slate-900 leading-tight">
                        {currentUser.name}
                      </div>
                      <div
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                        style={{
                          color: userGroup?.color || '#64748b',
                          backgroundColor: (userGroup?.color || '#64748b') + '18',
                          borderColor: (userGroup?.color || '#64748b') + '40',
                        }}
                      >
                        {userGroup?.name || 'Unbekannt'}
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="p-1.5 rounded-md hover:bg-red-50/60 text-slate-400 hover:text-red-500 transition-colors"
                      title="Abmelden"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Navigation */}
      <nav className="border-b border-slate-200/60 bg-white/40 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-4">
          <div className="flex items-center justify-between flex-wrap gap-2 py-0">
            <div className="flex gap-0">
              {mainTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeMainTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveMainTab(tab.id)}
                    className={`flex items-center gap-2.5 px-5 py-3 text-sm font-semibold transition-all border-b-[3px] ${
                      isActive
                        ? 'text-[#3b82f6] border-[#3b82f6] bg-white/30'
                        : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-white/20'
                    }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeMainTab === 'displays' && (
              <DateRangePicker
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                dataEarliest={dataEarliest}
                dataLatest={dataLatest}
                onRangeChange={handleRangeChange}
              />
            )}
          </div>
        </div>
      </nav>

      {/* Sub Navigation for Display Management */}
      {activeMainTab === 'displays' && (
        <nav className="border-b border-slate-200/40 bg-white/20 backdrop-blur-sm">
          <div className="max-w-[1600px] mx-auto px-4">
            <div className="flex gap-0">
              {subTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all border-b-2 ${
                      isActive
                        ? 'text-[#3b82f6] border-[#3b82f6]'
                        : 'text-slate-400 border-transparent hover:text-slate-500'
                    }`}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* Content */}
      <main className="max-w-[1600px] mx-auto px-4 py-5 space-y-5">
        {/* Overview Sub-Tab (under Display Management) */}
        {activeMainTab === 'displays' && activeSubTab === 'overview' && (
          <>
            <KPICards
              kpis={kpis}
              activeFilter={kpiFilter}
              onFilterClick={handleKpiFilterClick}
            />

            {/* KPI Drill-Down Panel */}
            {kpiFilter && kpiFilteredDisplays && (
              <div className="bg-white/60 backdrop-blur-xl border border-blue-300/40 rounded-2xl shadow-sm shadow-black/[0.03] animate-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-[#3b82f6]" />
                    <h3 className="text-sm font-medium text-slate-900">
                      {KPI_FILTER_LABELS[kpiFilter]}
                    </h3>
                    <span className="text-xs font-mono text-slate-400 bg-slate-50/80 px-2 py-0.5 rounded">
                      {kpiFilteredDisplays.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setKpiFilter(null)}
                    className="p-1 rounded hover:bg-slate-100/60 text-slate-400 hover:text-slate-900 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <DisplayTable
                  displays={kpiFilteredDisplays}
                  onSelectDisplay={setSelectedDisplay}
                  skipActiveFilter
                />
              </div>
            )}

            {!kpiFilter && (
              <>
                {/* Visualizations first */}
                <HealthTrendChart trendData={rawData.trendData} rangeLabel={rangeLabel} />

                <OverviewHealthPatterns trendData={rawData.trendData} rangeLabel={rangeLabel} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <OfflineDistributionChart distribution={distribution} />
                  <CityHealthChart cityData={rawData.cityData} />
                </div>

                {/* Lists below visualizations */}
                <NewDisplayWatchlist
                  watchlist={watchlist}
                  onSelectDisplay={setSelectedDisplay}
                  webhookUrl={webhookUrl}
                  onWebhookUrlChange={handleWebhookUrlChange}
                />

                <DisplayTable
                  displays={rawData.displays}
                  onSelectDisplay={setSelectedDisplay}
                />
              </>
            )}
          </>
        )}

        {/* Displays List Sub-Tab */}
        {activeMainTab === 'displays' && activeSubTab === 'list' && (
          <DisplayTable
            displays={rawData.displays}
            onSelectDisplay={setSelectedDisplay}
          />
        )}

        {/* Tasks Main Tab */}
        {activeMainTab === 'tasks' && (
          <TaskDashboard />
        )}

        {/* Kommunikation Main Tab */}
        {activeMainTab === 'communication' && (
          <CommunicationDashboard />
        )}

        {/* Admin Main Tab */}
        {activeMainTab === 'admin' && canAccessTab('admin') && (
          <AdminPanel />
        )}

        {/* Cities Sub-Tab */}
        {activeMainTab === 'displays' && activeSubTab === 'cities' && (
          <div className="space-y-5">
            <CityHealthChart cityData={rawData.cityData} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {rawData.cityData.map((city) => {
                const healthColor =
                  city.healthRate >= 90
                    ? '#22c55e'
                    : city.healthRate >= 70
                      ? '#f59e0b'
                      : '#ef4444';
                return (
                  <div
                    key={city.code}
                    className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {city.name}
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          {city.code}
                        </div>
                      </div>
                      <div
                        className="text-xl font-mono font-bold"
                        style={{ color: healthColor }}
                      >
                        {city.healthRate}%
                      </div>
                    </div>

                    <div className="w-full h-2 bg-slate-50/80 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${city.healthRate}%`,
                          backgroundColor: healthColor,
                        }}
                      />
                    </div>

                    <div className="flex justify-between mt-2 text-[10px] font-mono text-slate-400">
                      <span>{city.online} online</span>
                      <span>{city.offline} offline</span>
                      <span>{city.total} gesamt</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Data summary footer */}
        <div className="text-center py-4">
          <div className="text-[10px] text-slate-400 font-mono">
            {rawData.totalParsedRows.toLocaleString('de-DE')} Datenpunkte •{' '}
            {rawData.displays.length} Displays erkannt •{' '}
            {rawData.trendData.length} Trend-Snapshots
          </div>
        </div>
      </main>

      {/* Display Detail Modal */}
      {selectedDisplay && (
        <DisplayDetail
          display={selectedDisplay}
          onClose={() => setSelectedDisplay(null)}
        />
      )}
    </div>
  );
}

export default App;
