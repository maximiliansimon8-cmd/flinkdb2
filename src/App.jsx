import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { supabase } from './utils/authService';
import {
  Monitor,
  RefreshCw,
  Loader2,
  AlertCircle,
  LayoutDashboard,
  MapPin,
  ClipboardList,
  X,
  Lock,
  MessageSquare,
  Shield,
  LogOut,
  Mail,
  Key,
  AlertTriangle,
  BarChart3,
  Database,
  HardDrive,
  Target,
  Map as MapIcon,
  BookUser,
  Activity,
  Search,
  CalendarCheck,
  ChevronDown,
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
import { KPI_FILTERS } from './constants/kpiFilters';
import DateRangePicker from './components/DateRangePicker';

// Lazy-loaded components — split into separate chunks for faster initial load
const KPICards = lazy(() => import('./components/KPICards'));
const HealthTrendChart = lazy(() => import('./components/HealthTrendChart'));
const OfflineDistributionChart = lazy(() => import('./components/OfflineDistributionChart'));
const CityHealthChart = lazy(() => import('./components/CityHealthChart'));
const DisplayTable = lazy(() => import('./components/DisplayTable'));
const DisplayDetail = lazy(() => import('./components/DisplayDetail'));
const NewDisplayWatchlist = lazy(() => import('./components/NewDisplayWatchlist'));
const OverviewHealthPatterns = lazy(() => import('./components/OverviewHealthPatterns'));
const TaskDashboard = lazy(() => import('./components/TaskDashboard'));
const CommunicationDashboard = lazy(() => import('./components/CommunicationDashboard'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const ProgrammaticDashboard = lazy(() => import('./components/ProgrammaticDashboard'));
const HardwareDashboard = lazy(() => import('./components/HardwareDashboard'));
const DataQualityDashboard = lazy(() => import('./components/DataQualityDashboard'));
const AcquisitionDashboard = lazy(() => import('./components/AcquisitionDashboard'));
const DisplayMap = lazy(() => import('./components/DisplayMap'));
const ContactDirectory = lazy(() => import('./components/ContactDirectory'));
const CityDashboard = lazy(() => import('./components/CityDashboard'));
const ActivityFeed = lazy(() => import('./components/ActivityFeed'));
const ChatAssistant = lazy(() => import('./components/ChatAssistant'));
const AkquiseApp = lazy(() => import('./components/AkquiseApp'));
const InstallationsDashboard = lazy(() => import('./components/InstallationsDashboard'));
import { fetchVenuePerformance } from './utils/vistarService';
import useIsMobile from './hooks/useIsMobile';

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

/* ─── KPI Cache for Instant-Load ─── */
const CACHE_KEY = 'jet_dashboard_cache';
const CACHE_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

function saveToCache(data) {
  try {
    const cache = {
      timestamp: Date.now(),
      kpis: {
        healthRate: data.kpis.healthRate,
        totalActive: data.kpis.totalActive,
        onlineCount: data.kpis.onlineCount,
        warningCount: data.kpis.warningCount,
        criticalCount: data.kpis.criticalCount,
        permanentOfflineCount: data.kpis.permanentOfflineCount,
        neverOnlineCount: data.kpis.neverOnlineCount,
        newlyInstalled: data.kpis.newlyInstalled,
      },
      displayCount: data.displayCount,
      cityData: data.cityData?.slice(0, 20),
      latestTimestamp: data.latestTimestamp,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    // Silently fail — localStorage quota etc.
  }
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (Date.now() - cache.timestamp > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

class TabErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[TabError]', this.props?.name || 'unknown', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 m-4 text-center">
          <div className="text-red-600 font-bold mb-2">Fehler in "{this.props.name || 'Tab'}"</div>
          <div className="text-xs text-red-500 font-mono mb-3">Ein Fehler ist aufgetreten. Bitte versuche es erneut.</div>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">
            Erneut versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  /* ─── Cached KPI Snapshot (for instant loading screen) ─── */
  const [cachedSnapshot] = useState(() => loadFromCache());

  /* ─── Data State ─── */
  const [parsedRows, setParsedRows] = useState(null);
  const [dataEarliest, setDataEarliest] = useState(null);
  const [dataLatest, setDataLatest] = useState(null);
  const [globalFirstSeen, setGlobalFirstSeen] = useState(null);
  const [totalRowsGlobal, setTotalRowsGlobal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [selectedDisplay, setSelectedDisplay] = useState(null);
  // Hash-based routing: read initial tab from URL hash
  const getTabFromHash = () => {
    const hash = window.location.hash.replace('#', '').replace('/', '');
    const validTabs = ['overview', 'displays-list', 'tasks', 'communication', 'admin', 'programmatic', 'hardware', 'acquisition', 'map', 'contacts', 'cities', 'activities', 'installations', 'akquise-app'];
    return validTabs.includes(hash) ? hash : 'overview';
  };
  const [activeMainTab, setActiveMainTabRaw] = useState(getTabFromHash);
  const setActiveMainTab = useCallback((tab) => {
    setActiveMainTabRaw(tab);
    window.history.replaceState(null, '', `#${tab}`);
  }, []);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // kept for compat
  const [loadProgress, setLoadProgress] = useState('');

  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);

  const [kpiFilter, setKpiFilter] = useState(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  /* ─── Mobile Akquise App Overlay ─── */
  const isMobile = useIsMobile(768);
  const [showAkquiseApp, setShowAkquiseApp] = useState(false);
  const globalSearchRef = useRef(null);

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
   * Load heartbeat data from Supabase (OPTIMIZED: only last 90 days + globalFirstSeen).
   * Instead of loading ALL 170K rows, we:
   * 1. Fetch globalFirstSeen from the display_first_seen view (~350 rows)
   * 2. Fetch last 90 days of heartbeats (~30-45K rows)
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
          setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
          setLoading(false);
        }
      }, 20);
      return;
    }

    try {
      setLoadProgress('Lade Display-Daten...');

      // Step 1+2 PARALLEL: Fetch first-seen AND max timestamp at the same time
      const [firstSeenResult, maxTsResult] = await Promise.all([
        supabase.from('display_first_seen').select('display_id, first_seen'),
        supabase.from('display_heartbeats').select('timestamp_parsed').order('timestamp_parsed', { ascending: false }).limit(1),
      ]);

      const preloadedFirstSeen = {};
      if (!firstSeenResult.error && firstSeenResult.data) {
        for (const row of firstSeenResult.data) {
          if (row.first_seen) {
            preloadedFirstSeen[row.display_id] = new Date(row.first_seen);
          }
        }
        console.log(`[loadData] Loaded first-seen for ${Object.keys(preloadedFirstSeen).length} displays`);
      }

      let cutoffISO = null;
      if (!maxTsResult.error && maxTsResult.data && maxTsResult.data.length > 0 && maxTsResult.data[0].timestamp_parsed) {
        const latestDate = new Date(maxTsResult.data[0].timestamp_parsed);
        const cutoff = new Date(latestDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        cutoffISO = cutoff.toISOString();
        console.log(`[loadData] Loading heartbeats since ${cutoffISO} (90 days before ${maxTsResult.data[0].timestamp_parsed})`);
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
        setLoadProgress('Lade Displaydaten...');
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

        setLoadProgress('Daten werden verarbeitet...');
        csvCacheRef.current = mappedRows;
        csvCacheRef._firstSeen = preloadedFirstSeen;
        setTimeout(() => {
          try {
            processRawRows(mappedRows, preloadedFirstSeen);
          } catch (e) {
            setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
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
            setLoadProgress('Daten werden verarbeitet...');
            csvCacheRef.current = results.data;
            csvCacheRef._firstSeen = null;
            setTimeout(() => {
              try {
                processRawRows(results.data, null);
              } catch (e) {
                setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
                setLoading(false);
              }
            }, 50);
          } catch (e) {
            setError('Fehler beim Laden der Daten. Bitte neu laden.');
            setLoading(false);
          }
        },
        error: (err) => {
          setError('Verbindungsfehler. Bitte Internetverbindung prüfen und neu laden.');
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
          setError('Verbindungsfehler. Bitte Internetverbindung prüfen und neu laden.');
          setLoading(false);
        },
      });
    }
  }, []);

  /* ─── Sync Trigger (defined after loadData so the dep is available) ─── */
  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/trigger-sync');
      if (res.status === 202) {
        setSyncResult({ success: true, background: true });
        setTimeout(() => loadData(true), 30000);
      } else {
        const data = await res.json();
        if (data.success) {
          setSyncResult({
            success: true,
            displays: data.results?.displays?.upserted || 0,
            acquisition: data.results?.acquisition?.upserted || 0,
          });
          setTimeout(() => loadData(true), 1000);
        } else {
          setSyncResult({ success: false, error: data.error });
        }
      }
    } catch (err) {
      setSyncResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  }, [loadData]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  /* ─── URL Hash Routing (browser back/forward) ─── */
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '').replace('/', '');
      const validTabs = ['overview', 'displays-list', 'tasks', 'communication', 'admin', 'programmatic', 'hardware', 'acquisition', 'map', 'contacts', 'cities', 'activities', 'installations', 'akquise-app'];
      if (validTabs.includes(hash)) {
        setActiveMainTabRaw(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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

  // Compute comparison trend data: previous period of same duration.
  // Returns the full daily trendData from the prior period so the chart can
  // show a day-by-day comparison line (e.g. Mon vs Mon before).
  const comparisonTrendData = useMemo(() => {
    if (!parsedRows || !rawData || !rawData.trendData || rawData.trendData.length === 0) return null;
    const currentEnd = rangeEnd || rawData.latestTimestamp;
    const currentStart = rangeStart || (rawData.trendData.length > 0 ? rawData.trendData[0].timestamp : null);
    if (!currentEnd || !currentStart) return null;

    const rangeDuration = currentEnd.getTime() - currentStart.getTime();

    // Try real prior period first
    const compEnd = new Date(currentStart.getTime() - 1);
    const compStart = new Date(compEnd.getTime() - rangeDuration);

    if (dataEarliest && compEnd >= dataEarliest) {
      const compData = aggregateData(parsedRows, compStart, compEnd, globalFirstSeen);
      if (compData && compData.trendData && compData.trendData.length > 0) {
        return compData.trendData;
      }
    }

    return null;
  }, [parsedRows, rawData, rangeStart, rangeEnd, dataEarliest, globalFirstSeen]);

  // Keep the single average for the badge/label
  const comparisonHealthRate = useMemo(() => {
    if (!comparisonTrendData || comparisonTrendData.length === 0) return null;
    const totalOnline = comparisonTrendData.reduce((sum, s) => sum + (s.totalOnlineHours || 0), 0);
    const totalExpected = comparisonTrendData.reduce((sum, s) => sum + (s.totalExpectedHours || 0), 0);
    const avgHealth = totalExpected > 0 ? (totalOnline / totalExpected) * 100 : 0;
    return Math.round(avgHealth * 10) / 10;
  }, [comparisonTrendData]);

  // Comparison KPIs for Neu/Deinstalliert (previous period)
  const comparisonKPIs = useMemo(() => {
    if (!parsedRows || !rawData || !rawData.trendData || rawData.trendData.length === 0) return null;
    const currentEnd = rangeEnd || rawData.latestTimestamp;
    const currentStart = rangeStart || (rawData.trendData.length > 0 ? rawData.trendData[0].timestamp : null);
    if (!currentEnd || !currentStart) return null;

    const rangeDuration = currentEnd.getTime() - currentStart.getTime();
    const compEnd = new Date(currentStart.getTime() - 1);
    const compStart = new Date(compEnd.getTime() - rangeDuration);

    if (dataEarliest && compEnd >= dataEarliest) {
      const compData = aggregateData(parsedRows, compStart, compEnd, globalFirstSeen);
      if (compData && compData.latestTimestamp) {
        return computeKPIs(compData.displays, compData.latestTimestamp, globalFirstSeen, compData.trendData, compStart);
      }
    }
    return null;
  }, [parsedRows, rawData, rangeStart, rangeEnd, dataEarliest, globalFirstSeen]);

  const kpis = useMemo(() => {
    if (!rawData || !rawData.latestTimestamp) return null;
    // Cross-reference with stammdaten: mark confirmed-deinstalled displays as inactive
    // This prevents inflated city counts (e.g. Köln showing 104 instead of real active count)
    const deinstalledIds = comparisonData?.airtable?.deinstalledIds;
    let displays = rawData.displays;
    if (deinstalledIds && deinstalledIds.size > 0) {
      displays = rawData.displays.map(d =>
        deinstalledIds.has(d.displayId) ? { ...d, isActive: false } : d
      );
    }
    return computeKPIs(displays, rawData.latestTimestamp, globalFirstSeen, rawData.trendData, rangeStart);
  }, [rawData, globalFirstSeen, rangeStart, comparisonData?.airtable?.deinstalledIds]);

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

  // Save KPIs to localStorage cache for instant-load on next visit
  useEffect(() => {
    if (kpis && rawData) {
      saveToCache({
        kpis,
        displayCount: rawData.displays.length,
        cityData: rawData.cityData,
        latestTimestamp: rawData.latestTimestamp?.toISOString(),
      });
    }
  }, [kpis, rawData]);

  // Vistar venue performance data (loaded once, cached in service)
  const [vistarData, setVistarData] = useState(null);
  useEffect(() => {
    if (!rawData) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    fetchVenuePerformance(startStr, endStr)
      .then((data) => { if (data && data.size > 0) setVistarData(data); })
      .catch(() => {});
  }, [rawData]);

  // ── Comparison data: loaded ONCE in App, shared with all DisplayTable instances ──
  // This eliminates 3 redundant Supabase queries per DisplayTable mount
  const [comparisonData, setComparisonData] = useState(null);
  useEffect(() => {
    if (!rawData) return;
    async function loadComparisonData() {
      const startTime = Date.now();
      try {
        const [dispResult, vistarResult, daynResult, bankLeasingResult, chgResult] = await Promise.all([
          supabase.from('airtable_displays').select('display_id, display_name, online_status, location_name, city, street, street_number, postal_code, navori_venue_id, jet_id, live_since, deinstall_date, screen_type, screen_size, sov_partner_ad, updated_at').then(r => {
            if (r.error && /deinstall_date/.test(r.error.message || '')) {
              return supabase.from('airtable_displays').select('display_id, display_name, online_status, location_name, city, street, street_number, postal_code, navori_venue_id, jet_id, live_since, screen_type, screen_size, sov_partner_ad, updated_at');
            }
            return r;
          }),
          supabase.from('vistar_venues').select('id, name, partner_venue_id, is_active, city'),
          supabase.from('dayn_screens').select('dayn_screen_id, do_screen_id, screen_status, location_name, city, address, zip_code, venue_type, screen_type, screen_inch, latitude, longitude, region, country, floor_cpm, screen_width_px, screen_height_px, max_video_length, min_video_length, static_duration, static_supported, video_supported, dvac_week, dvac_month, dvac_day, impressions_per_spot, install_year'),
          supabase.from('bank_leasing').select('serial_number, asset_id, rental_certificate, contract_status, monthly_price, rental_start, rental_end_planned, installation_location, city'),
          supabase.from('chg_approvals').select('display_sn, asset_id, chg_certificate, status, rental_start, rental_end, jet_id_location, location_name, city'),
        ]);

        let airtable = null;
        if (!dispResult.error && dispResult.data && dispResult.data.length > 0) {
          const allDisplayIds = new Set();
          const activeDisplayIds = new Set();
          const deinstalledIds = new Set();
          const locationMap = new Map();
          for (const d of dispResult.data) {
            if (!d.display_id) continue;
            allDisplayIds.add(d.display_id);
            const isDeinstalled = d.online_status && /deinstall/i.test(d.online_status);
            if (isDeinstalled) { deinstalledIds.add(d.display_id); } else { activeDisplayIds.add(d.display_id); }
            locationMap.set(d.display_id, {
              locationName: d.location_name || d.display_name || '',
              city: d.city || '', street: d.street || '',
              streetNumber: d.street_number || '', postalCode: d.postal_code || '',
              status: d.online_status || '', navoriVenueId: d.navori_venue_id || '',
              jetId: d.jet_id || '', liveSince: d.live_since || '',
              deinstallDate: d.deinstall_date || '',
              screenType: d.screen_type || '', screenSize: d.screen_size || '',
              updatedAt: d.updated_at || '',
            });
          }
          airtable = { locations: 0, allDisplayIds, activeDisplayIds, deinstalledIds, locationMap, hasStatusField: true, source: 'airtable_displays' };
        }

        let vistarVenuesList = null;
        if (!vistarResult.error && vistarResult.data) vistarVenuesList = vistarResult.data;

        let dayn = null;
        if (!daynResult.error && daynResult.data && daynResult.data.length > 0) {
          const allIds = new Set();
          const activeIds = new Set();
          for (const d of daynResult.data) {
            const screenId = d.dayn_screen_id || d.do_screen_id;
            if (!screenId) continue;
            allIds.add(screenId);
            if (d.screen_status && /online/i.test(d.screen_status)) activeIds.add(screenId);
          }
          dayn = { records: daynResult.data, total: daynResult.data.length, allIds, activeIds };
        }

        // Build screen data lookup from dayn_screens + airtable_displays
        // Contains geo data + ALL dayn_screens fields (floor_cpm, dvac, venue_type, screen specs, etc.)
        const geoLookup = new Map();

        // First: airtable_displays (address data)
        if (!dispResult.error && dispResult.data) {
          for (const d of dispResult.data) {
            if (!d.display_id) continue;
            const addr = [d.street, d.street_number].filter(Boolean).join(' ');
            const cityLine = [d.postal_code, d.city].filter(Boolean).join(' ');
            geoLookup.set(d.display_id, {
              address: addr || null,
              cityLine: cityLine || null,
              postalCode: d.postal_code || null,
              city: d.city || null,
              lat: null,
              lng: null,
            });
          }
        }

        // Second: dayn_screens (lat/lng + ALL enrichment fields — overrides/supplements airtable)
        if (!daynResult.error && daynResult.data) {
          for (const s of daynResult.data) {
            const screenId = s.do_screen_id || s.dayn_screen_id;
            if (!screenId) continue;
            const lat = parseFloat(s.latitude);
            const lng = parseFloat(s.longitude);
            const hasCoords = !isNaN(lat) && !isNaN(lng);

            const existing = geoLookup.get(screenId) || {};
            geoLookup.set(screenId, {
              ...existing,
              lat: hasCoords ? lat : (existing.lat || null),
              lng: hasCoords ? lng : (existing.lng || null),
              address: existing.address || s.address || null,
              city: existing.city || s.city || null,
              postalCode: existing.postalCode || s.zip_code || null,
              cityLine: existing.cityLine || [s.zip_code, s.city].filter(Boolean).join(' ') || null,
              // ── Dayn Screen enrichment fields ──
              venueType: s.venue_type || null,
              floorCpm: s.floor_cpm != null ? Number(s.floor_cpm) : null,
              screenWidthPx: s.screen_width_px != null ? Number(s.screen_width_px) : null,
              screenHeightPx: s.screen_height_px != null ? Number(s.screen_height_px) : null,
              screenType: s.screen_type || null,
              screenInch: s.screen_inch || null,
              maxVideoLength: s.max_video_length != null ? Number(s.max_video_length) : null,
              minVideoLength: s.min_video_length != null ? Number(s.min_video_length) : null,
              staticDuration: s.static_duration != null ? Number(s.static_duration) : null,
              staticSupported: s.static_supported ?? null,
              videoSupported: s.video_supported ?? null,
              dvacWeek: s.dvac_week != null ? Number(s.dvac_week) : null,
              dvacMonth: s.dvac_month != null ? Number(s.dvac_month) : null,
              dvacDay: s.dvac_day != null ? Number(s.dvac_day) : null,
              impressionsPerSpot: s.impressions_per_spot != null ? Number(s.impressions_per_spot) : null,
              installYear: s.install_year || null,
              region: s.region || null,
              country: s.country || null,
              daynScreenId: s.dayn_screen_id || null,
              screenStatus: s.screen_status || null,
            });
          }
        }

        // Bank leasing data — build serial number lookup set for cross-system matching
        let bankLeasing = null;
        if (!bankLeasingResult.error && bankLeasingResult.data && bankLeasingResult.data.length > 0) {
          const serialNumbers = new Set();
          for (const b of bankLeasingResult.data) {
            if (b.serial_number) serialNumbers.add(b.serial_number);
          }
          bankLeasing = { records: bankLeasingResult.data, total: bankLeasingResult.data.length, serialNumbers };
        }

        // CHG approvals data — build display_sn lookup set
        let chgApprovals = null;
        if (!chgResult.error && chgResult.data && chgResult.data.length > 0) {
          const displaySns = new Set();
          for (const c of chgResult.data) {
            if (c.display_sn) displaySns.add(c.display_sn);
          }
          chgApprovals = { records: chgResult.data, total: chgResult.data.length, displaySns };
        }

        setComparisonData({ airtable, vistarVenues: vistarVenuesList, dayn, bankLeasing, chgApprovals, geoLookup });
        console.log(`[App] Comparison data loaded in ${Date.now() - startTime}ms`);
      } catch (e) {
        console.warn('[App] Comparison data load error:', e);
      }
    }
    loadComparisonData();
  }, [rawData]);

  const rangeLabel = useMemo(() => {
    if (!rangeStart && !rangeEnd) return 'Gesamter Zeitraum';
    if (rangeStart && !rangeEnd && dataLatest) {
      const diffDays = Math.round(
        (dataLatest.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 7) return '7 Tage';
      if (diffDays <= 14) return '14 Tage';
      if (diffDays <= 30) return '30 Tage';
      if (diffDays <= 60) return '60 Tage';
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

  /* ─── Global Search Results (must be before conditional returns) ─── */
  const globalSearchResults = useMemo(() => {
    if (!globalSearch || globalSearch.length < 2) return [];
    const q = globalSearch.toLowerCase().trim();
    const results = [];
    const seenIds = new Set();

    // Search active displays
    for (const d of (rawData?.displays || [])) {
      if (results.length >= 12) break;
      const match =
        d.displayId?.toLowerCase().includes(q) ||
        d.locationName?.toLowerCase().includes(q) ||
        d.serialNumber?.toLowerCase().includes(q) ||
        d.city?.toLowerCase().includes(q);
      if (match && !seenIds.has(d.displayId)) {
        seenIds.add(d.displayId);
        results.push({
          type: 'display',
          id: d.displayId,
          label: d.locationName || d.displayId,
          sublabel: `${d.city || '–'} · ${d.status === 'online' ? '🟢' : d.status === 'warning' ? '🟡' : '🔴'} ${d.status}`,
          display: d,
        });
      }
    }

    // Search Airtable stammdaten (JET IDs, addresses)
    if (comparisonData?.airtable?.locationMap) {
      for (const [did, loc] of comparisonData.airtable.locationMap) {
        if (results.length >= 12) break;
        if (seenIds.has(did)) continue;
        const match =
          (loc.jetId && loc.jetId.toLowerCase().includes(q)) ||
          (loc.locationName && loc.locationName.toLowerCase().includes(q)) ||
          (loc.street && loc.street.toLowerCase().includes(q)) ||
          (loc.postalCode && loc.postalCode.includes(q));
        if (match) {
          seenIds.add(did);
          const display = rawData?.displays?.find(d => d.displayId === did);
          results.push({
            type: display ? 'display' : 'stammdaten',
            id: did,
            label: loc.locationName || did,
            sublabel: `JET-ID: ${loc.jetId || '–'} · ${loc.city || '–'}${loc.screenType ? ' · ' + loc.screenType : ''}`,
            display: display || null,
            jetId: loc.jetId,
          });
        }
      }
    }

    return results;
  }, [globalSearch, rawData?.displays, comparisonData?.airtable?.locationMap]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target)) {
        setGlobalSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

          {/* Cached KPI preview — show last known data while loading */}
          {cachedSnapshot && (
            <div className="animate-slide-up mt-6 w-64 mx-auto" style={{ animationDelay: '0.5s', opacity: 0 }}>
              <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-3 text-center">
                <div className="text-[10px] font-mono text-slate-400 mb-1">Letzte bekannte Daten</div>
                <div className="flex items-center justify-center gap-3">
                  <div>
                    <div className="text-lg font-mono font-bold text-emerald-600">{cachedSnapshot.kpis?.healthRate}%</div>
                    <div className="text-[9px] font-mono text-slate-400">Health Rate</div>
                  </div>
                  <div className="w-px h-8 bg-slate-200" />
                  <div>
                    <div className="text-lg font-mono font-bold text-blue-600">{cachedSnapshot.displayCount}</div>
                    <div className="text-[9px] font-mono text-slate-400">Displays</div>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-slate-300 mt-1">
                  {cachedSnapshot.latestTimestamp ? `Stand: ${new Date(cachedSnapshot.latestTimestamp).toLocaleString('de-DE')}` : ''}
                </div>
              </div>
            </div>
          )}

          {/* Subtle grid pattern hint */}
          <div className="animate-slide-up mt-10" style={{ animationDelay: cachedSnapshot ? '0.7s' : '0.6s', opacity: 0 }}>
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
          <div className="text-slate-400 text-xs font-mono mb-4">{error || 'Ein unerwarteter Fehler ist aufgetreten.'}</div>
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

  /* ─── Standalone Akquise App Mode (/#akquise-app) ─── */
  if (activeMainTab === 'akquise-app') {
    return (
      <Suspense fallback={
        <div className="fixed inset-0 z-[10000] bg-[#F2F2F7] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
        </div>
      }>
        <AkquiseApp
          standalone
          onClose={() => setActiveMainTab('overview')}
        />
      </Suspense>
    );
  }

  /* ─── Tabs ─── */

  const userGroup = getCurrentGroup();

  const tabGroups = [
    {
      group: 'Monitoring',
      tabs: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard, access: 'displays' },
        { id: 'displays-list', label: 'Displays', icon: Monitor, access: 'displays' },
        { id: 'cities', label: 'Städte', icon: MapPin, access: 'displays' },
        { id: 'hardware', label: 'Hardware', icon: HardDrive, access: 'displays' },
      ],
    },
    {
      group: 'Vertrieb',
      tabs: [
        { id: 'acquisition', label: 'Akquise', icon: Target, access: 'displays' },
        { id: 'installations', label: 'Installationen', icon: CalendarCheck, access: 'installations' },
        { id: 'map', label: 'Karte', icon: MapIcon, access: 'displays' },
        { id: 'contacts', label: 'Kontakte', icon: BookUser, access: 'displays' },
      ],
    },
    {
      group: 'Analytics',
      tabs: [
        { id: 'programmatic', label: 'Programmatic', icon: BarChart3, access: 'displays' },
        { id: 'activities', label: 'Aktivitäten', icon: Activity, access: 'displays' },
      ],
    },
    {
      group: 'Betrieb',
      tabs: [
        { id: 'tasks', label: 'Tasks', icon: ClipboardList, access: 'tasks' },
        { id: 'communication', label: 'Kommunikation', icon: MessageSquare, access: 'communication' },
      ],
    },
    {
      group: 'Admin',
      tabs: [
        { id: 'admin', label: 'Admin', icon: Shield, access: 'admin' },
      ],
    },
  ];

  // Filter tabs by user permissions and remove empty groups
  const visibleGroups = tabGroups
    .map(g => ({ ...g, tabs: g.tabs.filter(t => canAccessTab(t.access)) }))
    .filter(g => g.tabs.length > 0);

  // Flat list for compatibility (used in hash routing validation etc.)
  const mainTabs = visibleGroups.flatMap(g => g.tabs);

  // Determine which group the active tab belongs to
  const activeGroup = visibleGroups.find(g => g.tabs.some(t => t.id === activeMainTab))?.group || visibleGroups[0]?.group;

  // Display-related tabs that need the date range picker
  const displayTabs = ['overview', 'displays-list', 'cities'];

  /* ─── Group Badge ─── */

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-200/60 bg-white/60 backdrop-blur-xl safe-top">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Left: Logo + Branding */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <img
                src="/dimension-outdoor-logo.png"
                alt="Dimension Outdoor"
                className="h-6 sm:h-8 w-auto brightness-0 opacity-80 shrink-0"
              />
              <div className="w-px h-5 sm:h-6 bg-slate-200 hidden sm:block" />
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Monitor size={18} className="text-[#3b82f6] shrink-0 hidden sm:block" />
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-wide truncate">
                    JET GERMANY
                  </h1>
                  <p className="text-[10px] sm:text-xs text-slate-400 font-mono hidden sm:block">
                    Display Network Monitor
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
              {/* API check + data points — desktop only */}
              <div className="text-right hidden lg:block">
                <div className="text-xs text-slate-400 font-mono">
                  Letzter API-Check
                </div>
                <div className="text-sm text-slate-600 font-mono">
                  {formatDateTime(rawData.latestTimestamp)}
                </div>
              </div>
              <div className="text-right hidden lg:block">
                <div className="text-xs text-slate-400 font-mono">
                  Datenpunkte
                </div>
                <div className="text-sm text-slate-600 font-mono">
                  {totalRowsGlobal.toLocaleString('de-DE')}
                </div>
              </div>

              {/* Display count badge — Navori + Dayn total */}
              <div className="flex items-center gap-1.5 sm:gap-2 bg-emerald-50/60 border border-emerald-200/40 rounded-full px-2 sm:px-3 py-1 sm:py-1.5">
                <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-[#22c55e] animate-pulse-glow" />
                <span className="text-xs sm:text-sm font-mono font-medium text-emerald-700">
                  {rawData.displays.length + (comparisonData?.dayn?.total || 0)}
                </span>
              </div>

              {/* Refresh + Sync — larger touch targets on mobile */}
              <button
                onClick={() => loadData(true)}
                className="p-2 sm:p-1.5 rounded-lg sm:rounded-md hover:bg-slate-100/60 text-slate-400 hover:text-slate-900 transition-colors"
                title="Daten neu laden"
              >
                <RefreshCw size={16} className="sm:w-[14px] sm:h-[14px]" />
              </button>
              <button
                onClick={triggerSync}
                disabled={syncing}
                className={`relative p-2 sm:p-1.5 rounded-lg sm:rounded-md transition-colors ${
                  syncing
                    ? 'bg-blue-50 text-blue-500'
                    : syncResult?.success
                      ? 'bg-emerald-50 text-emerald-500'
                      : syncResult && !syncResult.success
                        ? 'bg-red-50 text-red-500'
                        : 'hover:bg-blue-50/60 text-slate-400 hover:text-blue-600'
                }`}
                title={syncing ? 'Sync läuft...' : 'Airtable → Supabase Sync'}
              >
                <Database size={16} className={`sm:w-[14px] sm:h-[14px] ${syncing ? 'animate-pulse' : ''}`} />
                {syncResult?.success && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-[7px] text-white font-bold">✓</span>
                  </span>
                )}
              </button>

              {/* User Info + Logout */}
              {currentUser && (
                <>
                  <div className="w-px h-5 sm:h-6 bg-slate-200 hidden sm:block" />
                  <div className="flex items-center gap-1.5 sm:gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: userGroup?.color || '#64748b' }}
                    >
                      {getInitials(currentUser.name)}
                    </div>
                    <div className="hidden md:block text-right">
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
                      className="p-2 sm:p-1.5 rounded-lg sm:rounded-md hover:bg-amber-50/60 text-slate-400 hover:text-amber-600 transition-colors hidden sm:flex"
                      title="Passwort ändern"
                    >
                      <Key size={14} />
                    </button>
                    <button
                      onClick={handleLogout}
                      className="p-2 sm:p-1.5 rounded-lg sm:rounded-md hover:bg-red-50/60 text-slate-400 hover:text-red-500 transition-colors"
                      title="Abmelden"
                    >
                      <LogOut size={16} className="sm:w-[14px] sm:h-[14px]" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Navigation — 2-level grouped menu */}
      <nav className="border-b border-slate-200/60 bg-white/40 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-0 sm:px-4">
          {/* Level 1: Group headers */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex overflow-x-auto scrollbar-none snap-x snap-mandatory">
                {visibleGroups.map((g) => {
                  const isGroupActive = activeGroup === g.group;
                  return (
                    <button
                      key={g.group}
                      onClick={() => {
                        // Clicking a group switches to the first tab of that group
                        // (unless already in that group, then do nothing)
                        if (!isGroupActive) {
                          setActiveMainTab(g.tabs[0].id);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold transition-all border-b-[3px] whitespace-nowrap snap-start shrink-0 ${
                        isGroupActive
                          ? 'text-[#3b82f6] border-[#3b82f6] bg-white/30'
                          : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-white/20'
                      }`}
                    >
                      {g.group}
                      {g.tabs.length > 1 && (
                        <ChevronDown size={12} className={`transition-transform ${isGroupActive ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Global Search */}
              <div className="flex items-center gap-2 px-3 sm:px-0 py-1.5 sm:py-0">
              <div className="relative" ref={globalSearchRef}>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Standort, JET-ID, Display-ID..."
                    value={globalSearch}
                    onChange={e => { setGlobalSearch(e.target.value); setGlobalSearchOpen(true); }}
                    onFocus={() => globalSearch.length >= 2 && setGlobalSearchOpen(true)}
                    className="w-48 sm:w-64 pl-8 pr-3 py-1.5 text-xs font-mono bg-white/70 border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 placeholder:text-slate-300"
                  />
                  {globalSearch && (
                    <button onClick={() => { setGlobalSearch(''); setGlobalSearchOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                      <X size={12} />
                    </button>
                  )}
                </div>
                {/* Search Results Dropdown */}
                {globalSearchOpen && globalSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-80 sm:w-96 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto">
                    <div className="p-1.5">
                      {globalSearchResults.map(r => (
                        <button
                          key={r.id}
                          onClick={() => {
                            if (r.display) {
                              setSelectedDisplay(r.display);
                            } else {
                              // Stammdaten only — switch to display list tab
                              setActiveMainTab('displays-list');
                            }
                            setGlobalSearchOpen(false);
                            setGlobalSearch('');
                          }}
                          className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-blue-50/60 transition-colors text-left"
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {r.type === 'display' ? (
                              <Monitor size={14} className="text-blue-500" />
                            ) : (
                              <MapPin size={14} className="text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-700 truncate">{r.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">{r.sublabel}</div>
                          </div>
                          <div className="flex-shrink-0">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${r.type === 'display' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                              {r.type === 'display' ? 'Live' : 'Stamm'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 text-center">
                      {globalSearchResults.length} Ergebnisse
                    </div>
                  </div>
                )}
                {globalSearchOpen && globalSearch.length >= 2 && globalSearchResults.length === 0 && (
                  <div className="absolute top-full left-0 mt-1 w-80 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-xl z-50 p-4 text-center">
                    <span className="text-xs text-slate-400">Keine Ergebnisse für "{globalSearch}"</span>
                  </div>
                )}
              </div>

              {displayTabs.includes(activeMainTab) && (
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

            {/* Level 2: Sub-tabs within active group */}
            {visibleGroups.find(g => g.group === activeGroup)?.tabs.length > 1 && (
              <div className="flex overflow-x-auto scrollbar-none snap-x snap-mandatory border-t border-slate-100/60 bg-slate-50/30">
                {visibleGroups.find(g => g.group === activeGroup)?.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeMainTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveMainTab(tab.id)}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap snap-start shrink-0 border-b-2 ${
                        isActive
                          ? 'text-[#3b82f6] border-[#3b82f6] bg-white/50'
                          : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-white/30'
                      }`}
                    >
                      <Icon size={12} className="sm:w-3.5 sm:h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[1600px] mx-auto px-2 sm:px-4 py-3 sm:py-5 space-y-3 sm:space-y-5">
        {/* Overview */}
        {activeMainTab === 'overview' && (
          <TabErrorBoundary name="Overview">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Overview...</span></div>}>
            <KPICards
              kpis={kpis}
              activeFilter={kpiFilter}
              onFilterClick={handleKpiFilterClick}
              rangeLabel={rangeLabel}
              comparisonKPIs={comparisonKPIs}
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
                  comparisonData={comparisonData}
                />
              </div>
            )}

            {!kpiFilter && (
              <>
                {/* Visualizations first */}
                <HealthTrendChart trendData={rawData.trendData} rangeLabel={rangeLabel} comparisonHealthRate={comparisonHealthRate} comparisonTrendData={comparisonTrendData} />

                <OverviewHealthPatterns trendData={rawData.snapshotTrendData || rawData.trendData} rangeLabel={rangeLabel} />

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
                  comparisonData={comparisonData}
                />
              </>
            )}
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Displays List */}
        {activeMainTab === 'displays-list' && (
          <TabErrorBoundary name="Displays">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Displays...</span></div>}>
            <DisplayTable
              displays={rawData.displays}
              onSelectDisplay={setSelectedDisplay}
              vistarData={vistarData}
              comparisonData={comparisonData}
            />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Tasks Main Tab */}
        {activeMainTab === 'tasks' && (
          <TabErrorBoundary name="Tasks">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Tasks...</span></div>}>
            <TaskDashboard />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Installationen Main Tab */}
        {activeMainTab === 'installations' && (
          <TabErrorBoundary name="Installationen">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Installationen...</span></div>}>
            <InstallationsDashboard />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Kommunikation Main Tab */}
        {activeMainTab === 'communication' && (
          <TabErrorBoundary name="Kommunikation">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Kommunikation...</span></div>}>
            <CommunicationDashboard />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Admin Main Tab */}
        {activeMainTab === 'admin' && canAccessTab('admin') && (
          <TabErrorBoundary name="Admin">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Admin...</span></div>}>
            <AdminPanel />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Programmatic Dashboard */}
        {activeMainTab === 'programmatic' && (
          <TabErrorBoundary name="Programmatic">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Programmatic...</span></div>}>
            <ProgrammaticDashboard />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Hardware Dashboard (includes Datenqualität as sub-tab) */}
        {activeMainTab === 'hardware' && (
          <TabErrorBoundary name="Hardware">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Hardware...</span></div>}>
            <HardwareDashboard comparisonData={comparisonData} rawData={rawData} />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Acquisition Pipeline */}
        {activeMainTab === 'acquisition' && (
          <TabErrorBoundary name="Akquise">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Akquise...</span></div>}>
              <AcquisitionDashboard onOpenAkquiseApp={isMobile ? () => setShowAkquiseApp(true) : undefined} />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Display Map */}
        {activeMainTab === 'map' && (
          <TabErrorBoundary name="Karte">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Karte...</span></div>}>
              <DisplayMap rawData={rawData} comparisonData={comparisonData} onSelectDisplay={setSelectedDisplay} />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Contact Directory */}
        {activeMainTab === 'contacts' && (
          <TabErrorBoundary name="Kontakte">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Kontakte...</span></div>}>
              <ContactDirectory />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Cities */}
        {activeMainTab === 'cities' && (
          <TabErrorBoundary name="Staedte">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Staedte...</span></div>}>
              <CityDashboard
                cityData={rawData.cityData}
                displays={rawData.displays}
                trendData={rawData.trendData}
                onSelectDisplay={setSelectedDisplay}
              />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Activity Feed */}
        {activeMainTab === 'activities' && (
          <TabErrorBoundary name="Aktivitäten">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /><span className="ml-2 text-sm text-slate-500">Lade Aktivitäten...</span></div>}>
              <ActivityFeed rawData={rawData} />
            </Suspense>
          </TabErrorBoundary>
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

      {/* AI Chat Assistant — floating button, available on all tabs */}
      <Suspense fallback={null}>
        <ChatAssistant
          rawData={rawData}
          kpis={kpis}
          comparisonData={comparisonData}
          currentUser={currentUser}
        />
      </Suspense>

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
        <Suspense fallback={<div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}>
          <DisplayDetail
            display={selectedDisplay}
            onClose={() => setSelectedDisplay(null)}
          />
        </Suspense>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      {/* Mobile Akquise App Overlay (launched from Akquise tab on mobile) */}
      {showAkquiseApp && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[10000] bg-[#F2F2F7] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
          </div>
        }>
          <AkquiseApp onClose={() => setShowAkquiseApp(false)} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
