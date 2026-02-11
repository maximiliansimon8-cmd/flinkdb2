import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './utils/authService';
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
  Key,
  Clock,
  AlertTriangle,
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
  touchSession,
  getSessionRemainingMs,
  getSessionTimeoutMinutes,
  requestPasswordReset,
} from './utils/authService';
import ChangePasswordModal from './components/ChangePasswordModal';
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

// Heartbeat data now loaded from Supabase (fast, zero Netlify Function calls)
// Fallback to Google Sheets proxy if Supabase has no data
const SHEET_URL = '/api/sheets';

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
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState(''); // '', 'sending', 'sent', 'error'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);

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

  function processRawRows(rawRows, preloadedFirstSeen) {
    const { parsed, earliest, latest, globalFirstSeen: gfs, totalRows } = parseRows(rawRows);
    setParsedRows(parsed);
    setDataEarliest(earliest);
    setDataLatest(latest);
    // Merge preloaded first-seen (covers ALL data) with parsed first-seen (may be partial)
    const mergedFirstSeen = preloadedFirstSeen ? { ...gfs, ...preloadedFirstSeen } : gfs;
    setGlobalFirstSeen(mergedFirstSeen);
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

  /**
   * Load heartbeat data from Supabase (OPTIMIZED: only last 30 days + globalFirstSeen).
   * Instead of loading ALL 170K rows, we:
   * 1. Fetch globalFirstSeen from the display_first_seen view (~350 rows)
   * 2. Fetch only last 30 days of heartbeats (~10-15K rows)
   * Falls back to Google Sheets CSV proxy if Supabase has no data.
   */
  const loadData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    // Use in-memory cache if available and not forced refresh
    if (!forceRefresh && csvCacheRef.current) {
      setLoadProgress('Verarbeite gecachte Daten...');
      setTimeout(() => {
        try {
          processRawRows(csvCacheRef.current, csvCacheRef._firstSeen);
        } catch (e) {
          csvCacheRef.current = null;
          setError(`Fehler bei Datenverarbeitung: ${e.message}`);
          setLoading(false);
        }
      }, 20);
      return;
    }

    try {
      setLoadProgress('Lade Display-Daten...');

      // Step 1: Fetch globalFirstSeen from the precomputed view (fast, ~350 rows)
      const { data: firstSeenData, error: fsError } = await supabase
        .from('display_first_seen')
        .select('display_id, first_seen');

      const preloadedFirstSeen = {};
      if (!fsError && firstSeenData) {
        for (const row of firstSeenData) {
          if (row.first_seen) {
            preloadedFirstSeen[row.display_id] = new Date(row.first_seen);
          }
        }
        console.log(`[loadData] Loaded first-seen for ${Object.keys(preloadedFirstSeen).length} displays`);
      }

      // Step 2: Determine cutoff date (30 days before the latest heartbeat)
      // First get the max timestamp_parsed to calculate the cutoff
      const { data: maxRow, error: maxError } = await supabase
        .from('display_heartbeats')
        .select('timestamp_parsed')
        .order('timestamp_parsed', { ascending: false })
        .limit(1);

      let cutoffISO = null;
      if (!maxError && maxRow && maxRow.length > 0 && maxRow[0].timestamp_parsed) {
        const latestDate = new Date(maxRow[0].timestamp_parsed);
        const cutoff = new Date(latestDate.getTime() - 60 * 24 * 60 * 60 * 1000);
        cutoffISO = cutoff.toISOString();
        console.log(`[loadData] Loading heartbeats since ${cutoffISO} (60 days before ${maxRow[0].timestamp_parsed})`);
      }

      // Step 3: Fetch only recent heartbeat data (paginated, 1000 per page)
      setLoadProgress('Lade aktuelle Heartbeat-Daten...');
      let allRows = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from('display_heartbeats')
          .select('timestamp, display_id, raw_display_id, location_name, serial_number, registration_date, heartbeat, is_alive, display_status, last_online_date, days_offline')
          .order('timestamp_parsed', { ascending: false })
          .range(from, from + pageSize - 1);

        // Apply 30-day filter if we have a cutoff
        if (cutoffISO) {
          query = query.gte('timestamp_parsed', cutoffISO);
        }

        const { data, error: sbError } = await query;

        if (sbError) throw sbError;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        setLoadProgress(`${allRows.length} Zeilen geladen...`);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (allRows.length > 0) {
        // Map Supabase rows → parseRows()-compatible format (same as CSV headers)
        const mappedRows = allRows.map(row => ({
          'Timestamp': row.timestamp || '',
          'Display ID': row.raw_display_id || row.display_id || '',
          'Location Name': row.location_name || '',
          'Serial Number': row.serial_number || '',
          'Date': row.registration_date || '',
          'Status': row.heartbeat || '',
          'Is Alive': row.is_alive || '',
          'Display Status': row.display_status || '',
          'Last Online Date': row.last_online_date || '',
          'Days Offline': row.days_offline != null ? String(row.days_offline) : '',
        }));

        setLoadProgress(`${mappedRows.length} Zeilen geladen. Verarbeite...`);
        csvCacheRef.current = mappedRows;
        csvCacheRef._firstSeen = preloadedFirstSeen;
        setTimeout(() => {
          try {
            processRawRows(mappedRows, preloadedFirstSeen);
          } catch (e) {
            setError(`Fehler bei Datenverarbeitung: ${e.message}`);
            setLoading(false);
          }
        }, 50);
        return;
      }

      // Fallback: No data in Supabase yet → use Google Sheets CSV
      console.warn('[loadData] No Supabase heartbeat data, falling back to CSV');
      setLoadProgress('Fallback: Lade von Google Sheets...');
      const Papa = (await import('papaparse')).default;
      Papa.parse(SHEET_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            setLoadProgress(`${results.data.length} Zeilen geladen. Verarbeite...`);
            csvCacheRef.current = results.data;
            csvCacheRef._firstSeen = null;
            setTimeout(() => {
              try {
                processRawRows(results.data, null);
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
    } catch (err) {
      console.error('[loadData] Supabase error, falling back to CSV:', err);
      setLoadProgress('Fallback: Lade von Google Sheets...');
      const Papa = (await import('papaparse')).default;
      Papa.parse(SHEET_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          csvCacheRef.current = results.data;
          csvCacheRef._firstSeen = null;
          setTimeout(() => processRawRows(results.data, null), 50);
        },
        error: (csvErr) => {
          setError(`Fehler beim Laden: ${csvErr.message}`);
          setLoading(false);
        },
      });
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  /* ─── Session Timeout Monitoring ─── */

  useEffect(() => {
    if (!authenticated) return;

    // Check session validity every 60 seconds
    const interval = setInterval(() => {
      const remaining = getSessionRemainingMs();

      if (remaining <= 0) {
        // Session expired
        setAuthenticated(false);
        setCurrentUser(null);
        setActiveMainTab('displays');
        setSessionWarning(false);
        return;
      }

      // Show warning when less than 10 minutes remain
      if (remaining < 10 * 60 * 1000) {
        setSessionWarning(true);
      } else {
        setSessionWarning(false);
      }
    }, 60 * 1000); // check every minute

    return () => clearInterval(interval);
  }, [authenticated]);

  /* ─── Session Activity Tracking (touch on interaction) ─── */

  useEffect(() => {
    if (!authenticated) return;

    const onActivity = () => {
      touchSession();
      setSessionWarning(false);
    };

    // Refresh session timestamp on user interaction
    window.addEventListener('click', onActivity);
    window.addEventListener('keydown', onActivity);

    return () => {
      window.removeEventListener('click', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [authenticated]);

  /* ─── Derived Data ─── */

  const rawData = useMemo(() => {
    if (!parsedRows) return null;
    return aggregateData(parsedRows, rangeStart, rangeEnd, globalFirstSeen);
  }, [parsedRows, rangeStart, rangeEnd, globalFirstSeen]);

  // Compute comparison health rate: previous period of same duration.
  // If no prior data available, use first half of current range as comparison.
  const comparisonHealthRate = useMemo(() => {
    if (!parsedRows || !rawData || !rawData.trendData || rawData.trendData.length === 0) return null;
    const currentEnd = rangeEnd || rawData.latestTimestamp;
    const currentStart = rangeStart || (rawData.trendData.length > 0 ? rawData.trendData[0].timestamp : null);
    if (!currentEnd || !currentStart) return null;

    const rangeDuration = currentEnd.getTime() - currentStart.getTime();

    // Try real prior period first
    const compEnd = new Date(currentStart.getTime() - 1);
    const compStart = new Date(compEnd.getTime() - rangeDuration);

    if (dataEarliest && compEnd >= dataEarliest) {
      // Prior period data exists – use uptime-based weighted average
      const compData = aggregateData(parsedRows, compStart, compEnd, globalFirstSeen);
      if (compData && compData.trendData && compData.trendData.length > 0) {
        const totalOnline = compData.trendData.reduce((sum, s) => sum + (s.totalOnlineHours || 0), 0);
        const totalExpected = compData.trendData.reduce((sum, s) => sum + (s.totalExpectedHours || 0), 0);
        const avgHealth = totalExpected > 0 ? (totalOnline / totalExpected) * 100 : 0;
        return Math.round(avgHealth * 10) / 10;
      }
    }

    // Fallback: split current range in half → first half = comparison
    if (rawData.trendData.length >= 4) {
      const midIndex = Math.floor(rawData.trendData.length / 2);
      const firstHalf = rawData.trendData.slice(0, midIndex);
      const totalOnline = firstHalf.reduce((sum, s) => sum + (s.totalOnlineHours || 0), 0);
      const totalExpected = firstHalf.reduce((sum, s) => sum + (s.totalExpectedHours || 0), 0);
      const avgHealth = totalExpected > 0 ? (totalOnline / totalExpected) * 100 : 0;
      return Math.round(avgHealth * 10) / 10;
    }

    return null;
  }, [parsedRows, rawData, rangeStart, rangeEnd, dataEarliest, globalFirstSeen]);

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

  const handleLogin = async (e) => {
    e.preventDefault();

    const result = await login(emailInput, passwordInput);

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

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetStatus('sending');
    const result = await requestPasswordReset(resetEmail);
    setResetStatus(result.success ? 'sent' : 'error');
  };

  const handleLogout = async () => {
    await logout();
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

              <button
                type="button"
                onClick={() => { setShowResetForm(true); setResetEmail(emailInput); setResetStatus(''); }}
                className="w-full text-[11px] text-slate-400 hover:text-[#3b82f6] transition-colors mt-2 font-mono"
              >
                Passwort vergessen?
              </button>
            </div>
          </form>

          {/* Password Reset Modal */}
          {showResetForm && (
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center px-4">
              <div className="bg-white/90 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-6 shadow-lg shadow-black/5 w-full max-w-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-slate-900">Passwort zurücksetzen</h2>
                  <button
                    onClick={() => setShowResetForm(false)}
                    className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {resetStatus === 'sent' ? (
                  <div className="text-center py-4">
                    <div className="w-10 h-10 rounded-full bg-[#22c55e]/10 flex items-center justify-center mx-auto mb-3">
                      <Mail size={18} className="text-[#22c55e]" />
                    </div>
                    <p className="text-sm text-slate-700 font-medium mb-1">E-Mail gesendet!</p>
                    <p className="text-xs text-slate-400 font-mono leading-relaxed">
                      Falls ein Account mit dieser E-Mail existiert, erhältst du einen Link zum Zurücksetzen deines Passworts.
                    </p>
                    <button
                      onClick={() => setShowResetForm(false)}
                      className="mt-4 px-4 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      Schließen
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordReset}>
                    <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                      Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen deines Passworts.
                    </p>
                    <div className="relative mb-4">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="name@dimension-outdoor.com"
                        autoFocus
                        required
                        className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
                      />
                    </div>
                    {resetStatus === 'error' && (
                      <p className="text-[#ef4444] text-xs mb-3 font-mono">
                        Fehler beim Senden. Bitte versuche es erneut.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowResetForm(false)}
                        className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="submit"
                        disabled={resetStatus === 'sending'}
                        className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors disabled:opacity-50"
                      >
                        {resetStatus === 'sending' ? 'Sende...' : 'Link senden'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
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
                      onClick={() => setShowPasswordModal(true)}
                      className="p-1.5 rounded-md hover:bg-amber-50/60 text-slate-400 hover:text-amber-600 transition-colors"
                      title="Passwort ändern"
                    >
                      <Key size={14} />
                    </button>
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
              rangeLabel={rangeLabel}
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
                <HealthTrendChart trendData={rawData.trendData} rangeLabel={rangeLabel} comparisonHealthRate={comparisonHealthRate} />

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

      {/* Session Timeout Warning Banner */}
      {sessionWarning && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-xl bg-amber-50/95 backdrop-blur-xl border border-amber-200/60 shadow-lg animate-fade-in">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Session läuft bald ab</p>
            <p className="text-xs text-amber-600">Klicke irgendwo um die Session zu verlängern</p>
          </div>
          <button
            onClick={() => { touchSession(); setSessionWarning(false); }}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            Verlängern
          </button>
        </div>
      )}

      {/* Display Detail Modal */}
      {selectedDisplay && (
        <DisplayDetail
          display={selectedDisplay}
          onClose={() => setSelectedDisplay(null)}
        />
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}

export default App;
