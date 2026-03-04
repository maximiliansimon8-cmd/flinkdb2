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
  Eye,
  TrendingUp,
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
  needsPasswordChange,
  getPasswordChangeReason,
  getPasswordExpiryDays,
  recoverSession,
} from './utils/authService';
import ChangePasswordModal from './components/ChangePasswordModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import { KPI_FILTERS } from './constants/kpiFilters';
import DateRangePicker from './components/DateRangePicker';
import { Sidebar } from './components/layout/Sidebar';
import { ContentHeader } from './components/layout/ContentHeader';
import { useTheme } from './hooks/useTheme';

// Lazy-loaded components — split into separate chunks for faster initial load
const KPICards = lazy(() => import('./components/KPICards'));
const HealthTrendChart = lazy(() => import('./components/HealthTrendChart'));
const OfflineDistributionChart = lazy(() => import('./components/OfflineDistributionChart'));
const CityHealthChart = lazy(() => import('./components/CityHealthChart'));
const DisplayTable = lazy(() => import('./components/DisplayTable'));
const DisplayDetail = lazy(() => import('./components/DisplayDetail'));
const NewDisplayWatchlist = lazy(() => import('./components/NewDisplayWatchlist'));
const OverviewHealthPatterns = lazy(() => import('./components/OverviewHealthPatterns'));
const OverviewDisplayHealth = lazy(() => import('./components/OverviewDisplayHealth'));
const TaskDashboard = lazy(() => import('./components/TaskDashboard'));
const CommunicationDashboard = lazy(() => import('./components/CommunicationDashboard'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const ProgrammaticDashboard = lazy(() => import('./components/ProgrammaticDashboard'));
const HardwareDashboard = lazy(() => import('./components/HardwareDashboard'));
const AcquisitionDashboard = lazy(() => import('./components/AcquisitionDashboard'));
const DisplayMap = lazy(() => import('./components/DisplayMap'));
const ContactDirectory = lazy(() => import('./components/ContactDirectory'));
const CityDashboard = lazy(() => import('./components/CityDashboard'));
const ActivityFeed = lazy(() => import('./components/ActivityFeed'));
const ChatAssistant = lazy(() => import('./components/ChatAssistant'));
const AkquiseApp = lazy(() => import('./components/AkquiseApp'));
const InstallationsDashboard = lazy(() => import('./components/InstallationsDashboard'));
const MobileDashboard = lazy(() => import('./components/MobileDashboard'));
const MobileDisplayCards = lazy(() => import('./components/MobileDisplayCards'));
const MobileActivityFeed = lazy(() => import('./components/MobileActivityFeed'));
const QRHardwareScanner = lazy(() => import('./components/QRHardwareScanner'));
const FAWCheckApp = lazy(() => import('./components/FAWCheckApp'));
const DisplayTrends = lazy(() => import('./components/DisplayTrends'));
const FeedbackWidget = lazy(() => import('./components/FeedbackWidget'));
// InstallationInspection moved to HardwareDashboard as sub-tab "Freigabe"
import MobileBottomNav from './components/MobileBottomNav';
import { fetchVenuePerformance } from './utils/vistarService';
import useIsMobile from './hooks/useIsMobile';
import { useFeatureFlags } from './hooks/useFeatureFlags';

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
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — stale KPIs shown instantly while fresh data loads in background

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
  const [authRecovering, setAuthRecovering] = useState(!isAuthenticated()); // try recover if not logged in
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState(''); // '', 'sending', 'sent', 'error'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(() => needsPasswordChange());
  const [passwordChangeReason, setPasswordChangeReason] = useState(() => getPasswordChangeReason());
  const [lastLoginPassword, setLastLoginPassword] = useState(''); // for pre-filling force change modal
  const [sessionWarning, setSessionWarning] = useState(false);

  // On mount: attempt session recovery from Supabase Auth (e.g. new tab)
  useEffect(() => {
    if (!authenticated) {
      recoverSession().then(recovered => {
        if (recovered) {
          setCurrentUser(recovered);
          setAuthenticated(true);
        }
        setAuthRecovering(false);
      });
    } else {
      setAuthRecovering(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Cached KPI Snapshot (for instant loading screen) ─── */
  const [cachedSnapshot] = useState(() => loadFromCache());

  /* ─── Mobile Fast-Path KPI State ─── */
  const [mobileKPIs, setMobileKPIs] = useState(() => {
    try {
      const raw = localStorage.getItem('jet_mobile_kpis');
      if (!raw) return null;
      const cached = JSON.parse(raw);
      // Accept cache up to 24 hours old for instant display on startup
      // (fresh data will be fetched in background via loadData)
      if (Date.now() - cached._ts > 24 * 60 * 60 * 1000) return null;
      return cached;
    } catch { return null; }
  });

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
  // Hash-based routing: read initial tab from URL hash (supports #main/sub format)
  const SUB_TAB_DEFAULTS = useMemo(() => ({
    admin:         { valid: ['users','groups','audit','feedback','api-usage','attachments','feature-flags','data-mapping','api-overview','stammdaten-import'], default: 'users' },
    hardware:      { valid: ['ops','completeness','leasing','orders','bestellwesen','wareneingang','lager-versand','qr-codes','positionen','tracking','nocodb','timeline','fehler','data-quality'], default: 'ops' },
    acquisition:   { valid: ['netzwerk','overview','pipeline','storno','automation'], default: 'netzwerk' },
    installations: { valid: ['executive','calendar','invite','phone','bookings'], default: 'executive' },
  }), []);
  const validTabs = useMemo(() => ['overview', 'displays-list', 'tasks', 'communication', 'admin', 'programmatic', 'hardware', 'acquisition', 'map', 'contacts', 'cities', 'activities', 'installations', 'akquise-app', 'display-trends', 'faw'], []);
  const parseHash = useCallback(() => {
    const raw = window.location.hash.replace('#', '');
    const [mainPart, subPart] = raw.split('/');
    const mainTab = validTabs.includes(mainPart) ? mainPart : 'overview';
    const subDef = SUB_TAB_DEFAULTS[mainTab];
    const subTab = subDef && subPart && subDef.valid.includes(subPart) ? subPart : (subDef?.default || null);
    return { mainTab, subTab };
  }, [validTabs, SUB_TAB_DEFAULTS]);
  const initialHash = useMemo(() => parseHash(), [parseHash]);
  const [activeMainTab, setActiveMainTabRaw] = useState(initialHash.mainTab);
  const [activeSubTab, setActiveSubTabRaw] = useState(initialHash.subTab);
  const setActiveMainTab = useCallback((tab, sub) => {
    setActiveMainTabRaw(tab);
    const subDef = SUB_TAB_DEFAULTS[tab];
    const resolvedSub = subDef && sub && subDef.valid.includes(sub) ? sub : (subDef?.default || null);
    setActiveSubTabRaw(resolvedSub);
    const hash = resolvedSub ? `#${tab}/${resolvedSub}` : `#${tab}`;
    window.history.replaceState(null, '', hash);
  }, [SUB_TAB_DEFAULTS]);
  const updateSubTab = useCallback((sub) => {
    setActiveSubTabRaw(sub);
    window.history.replaceState(null, '', `#${activeMainTab}/${sub}`);
  }, [activeMainTab]);
  const [loadProgress, setLoadProgress] = useState('');

  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);

  const [kpiFilter, setKpiFilter] = useState(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  /* ─── Mobile UI State ─── */
  const isMobile = useIsMobile(768);
  const { isEnabled: isFeatureEnabled } = useFeatureFlags();
  const [showAkquiseApp, setShowAkquiseApp] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [mobileTab, setMobileTab] = useState('mobile-home');
  const [mobileDisplayFilter, setMobileDisplayFilter] = useState(null);
  const [showMobileChat, setShowMobileChat] = useState(false);

  // Mobile navigation handler — supports deep-linking to filtered views
  const handleMobileNavigate = useCallback((tab, filter) => {
    if (navigator.vibrate) navigator.vibrate(8);
    setMobileTab(tab);
    if (filter) setMobileDisplayFilter(filter);
    else setMobileDisplayFilter(null);
    // If navigating to chat
    if (tab === 'mobile-jet') {
      setShowMobileChat(true);
    }
  }, []);

  // Mobile bottom nav handler
  const handleMobileTabChange = useCallback((tab) => {
    setMobileTab(tab);
    setMobileDisplayFilter(null);
    if (tab === 'mobile-jet') {
      setShowMobileChat(true);
    } else {
      setShowMobileChat(false);
    }
  }, []);
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
   * Load heartbeat data from Supabase (OPTIMIZED: only last 365 days + globalFirstSeen).
   * Instead of loading ALL 170K rows, we:
   * 1. Fetch globalFirstSeen from the display_first_seen view (~350 rows)
   * 2. Fetch last 365 days of heartbeats
   * Falls back to Google Sheets CSV proxy if Supabase has no data.
   */
  const loadData = useCallback(async (forceRefresh = false) => {
    /* ═══ MOBILE FAST PATH ═══════════════════════════════════════
       On mobile: single Supabase RPC call (~2KB) instead of
       loading 40K heartbeat rows. Result: instant with cache,
       < 500ms with fresh RPC call.
       ════════════════════════════════════════════════════════════ */
    if (isMobile) {
      setError(null);

      // 1. If we have ANY cached data, show it instantly (no loading spinner)
      const hasCachedData = mobileKPIs && mobileKPIs._ts;
      if (hasCachedData && !forceRefresh) {
        // Cache still fresh (< 5 min)? Don't even call RPC
        if (Date.now() - mobileKPIs._ts < 5 * 60 * 1000) {
          setLoading(false);
          return;
        }
        // Cache stale but exists → show it NOW, refresh in background
        setLoading(false);
      } else {
        setLoading(true);
      }

      // 2. Single RPC call — all KPIs computed server-side (get_dashboard_kpis)
      try {
        const rpcPromise = supabase.rpc('get_dashboard_kpis', { days_back: 14 });
        // Timeout after 8s to avoid endless spinner
        const timeoutPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('RPC timeout after 8s')), 8000)
        );

        const rpcResult = await Promise.race([rpcPromise, timeoutPromise]);
        let data = rpcResult.data;
        const rpcError = rpcResult.error;

        // Handle string response (PostgREST may return string for JSON functions)
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (_) { data = null; }
        }

        if (rpcError || !data) {
          console.warn('[mobile] RPC failed:', rpcError?.message || 'no data returned', rpcError?.code, rpcError?.hint);
          if (hasCachedData) {
            setLoading(false);
            return;
          }
        } else {
          console.log('[mobile] RPC SUCCESS:', { healthRate: data.healthRate, installed: data.installed });
          // Map get_dashboard_kpis response to mobile KPI format
          const trend = data.trend || [];
          const topOffline = (data.displays || [])
            .filter(d => d.status !== 'online')
            .sort((a, b) => (b.daysOffline || 0) - (a.daysOffline || 0))
            .slice(0, 10)
            .map(d => ({
              displayId: d.rawDisplayId || d.displayId,
              locationName: d.locationName || '–',
              city: '–',
              status: d.status,
              daysOffline: d.daysOffline || 0,
            }));

          const kpiData = {
            healthRate: data.healthRate || 0,
            installed: data.installed || 0,
            totalActive: (data.installed || 0) - (data.permanentOffline || 0),
            onlineCount: data.online || 0,
            warningCount: data.warning || 0,
            criticalCount: data.critical || 0,
            permanentOfflineCount: data.permanentOffline || 0,
            neverOnlineCount: 0,
            newlyInstalled: 0,
            deinstalled: 0,
            daynTotal: data.daynTotal || 0,
            daynOnline: data.daynOnline || 0,
            topOffline,
            byCity: {},
            trend: trend.map(t => ({
              date: t.day,
              total: t.total,
              online: t.online,
              healthRate: t.healthRate,
            })),
            _ts: Date.now(),
          };
          setMobileKPIs(kpiData);
          try { localStorage.setItem('jet_mobile_kpis', JSON.stringify(kpiData)); } catch {}
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn('[mobile] Fast-path error:', e.message);
        // If we have stale cache, keep showing it
        if (hasCachedData) {
          setLoading(false);
          return;
        }
      }

      // 3. Lightweight fallback: direct query when RPC doesn't exist yet
      // Instead of falling through to 40K-row desktop path, compute basic KPIs
      // from a small aggregated query (~500ms instead of 5-10s)
      try {
        console.warn('[mobile] RPC unavailable, using lightweight fallback query');
        // Fetch heartbeats AND dayn screens in parallel
        const [hbResult, daynResult] = await Promise.all([
          supabase
            .from('display_heartbeats')
            .select('display_id, days_offline, is_alive, display_status, location_name')
            .order('timestamp_parsed', { ascending: false })
            .limit(2000),
          supabase
            .from('dayn_screens')
            .select('dayn_screen_id, do_screen_id, screen_status')
        ]);

        const { data: hbRows, error: hbErr } = hbResult;

        if (!hbErr && hbRows && hbRows.length > 0) {
          // Deduplicate by display_id (keep first = latest)
          const seen = new Set();
          const unique = [];
          for (const row of hbRows) {
            if (row.display_id && !seen.has(row.display_id)) {
              seen.add(row.display_id);
              unique.push(row);
            }
          }

          // Classify heartbeat displays
          let onlineCount = 0, warningCount = 0, criticalCount = 0, permanentOfflineCount = 0;
          for (const d of unique) {
            const days = parseInt(d.days_offline) || 0;
            if (days < 1) onlineCount++;
            else if (days < 3) warningCount++;
            else if (days < 7) criticalCount++;
            else permanentOfflineCount++;
          }

          // Add Dayn screens (all installed Dayn = totalActive, online status = onlineCount)
          let daynTotal = 0, daynOnline = 0;
          if (!daynResult.error && daynResult.data && daynResult.data.length > 0) {
            daynTotal = daynResult.data.length;
            daynOnline = daynResult.data.filter(d => d.screen_status && /online/i.test(d.screen_status)).length;
          }

          const totalActive = unique.length + daynTotal;
          const totalOnline = onlineCount + daynOnline;
          const healthRate = totalActive > 0 ? Math.round((totalOnline / totalActive) * 1000) / 10 : 0;

          const fallbackKPIs = {
            healthRate,
            totalActive,
            onlineCount: totalOnline,
            warningCount,
            criticalCount,
            permanentOfflineCount,
            neverOnlineCount: 0,
            newlyInstalled: 0,
            deinstalled: 0,
            daynTotal,
            daynOnline,
            topOffline: unique
              .filter(d => (parseInt(d.days_offline) || 0) >= 3)
              .sort((a, b) => (parseInt(b.days_offline) || 0) - (parseInt(a.days_offline) || 0))
              .slice(0, 10)
              .map(d => ({
                displayId: d.display_id,
                locationName: d.location_name || '–',
                city: '–',
                status: (parseInt(d.days_offline) || 0) >= 7 ? 'permanent_offline' : 'critical',
                daysOffline: parseInt(d.days_offline) || 0,
              })),
            byCity: {},
            _fallback: true,
            _ts: Date.now(),
          };

          setMobileKPIs(fallbackKPIs);
          try { localStorage.setItem('jet_mobile_kpis', JSON.stringify(fallbackKPIs)); } catch {}
          setLoading(false);
          return;
        }
      } catch (fallbackErr) {
        console.warn('[mobile] Fallback query also failed:', fallbackErr.message);
      }

      // 4. Last resort: show error on mobile (NEVER fall through to desktop 40K path)
      setError('Dashboard konnte nicht geladen werden. Bitte erneut versuchen.');
      setLoading(false);
      return;
    }

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

    // Helper: build KPIs from dayn_screens (fast, always works) as lightweight desktop fallback
    const loadFromDaynScreens = async () => {
      setLoadProgress('Lade Screen-Daten...');
      try {
        const daynResult = await supabase
          .from('dayn_screens')
          .select('dayn_screen_id, do_screen_id, screen_status, location_name, city');

        if (daynResult.error || !daynResult.data || daynResult.data.length === 0) {
          console.warn('[loadData] dayn_screens also failed:', daynResult.error?.message);
          return false; // Signal that we need CSV fallback
        }

        const screens = daynResult.data;

        // Classify screens
        let onlineCount = 0, warningCount = 0, criticalCount = 0, permanentOfflineCount = 0;
        const cityMap = {};
        const offlineList = [];

        for (const s of screens) {
          const isOnline = s.screen_status && /online/i.test(s.screen_status);
          if (isOnline) {
            onlineCount++;
          } else {
            // Non-online screens — categorize (we don't have days_offline, so use status)
            const statusLower = (s.screen_status || '').toLowerCase();
            if (statusLower.includes('offline') || statusLower.includes('error') || statusLower === '') {
              criticalCount++;
              offlineList.push({
                displayId: s.do_screen_id || s.dayn_screen_id,
                locationName: s.location_name || '–',
                city: s.city || '–',
                status: 'critical',
                daysOffline: 0,
                screenStatus: s.screen_status || 'Unbekannt',
              });
            } else {
              warningCount++;
            }
          }

          // Aggregate by city
          const city = s.city || 'Unbekannt';
          if (!cityMap[city]) cityMap[city] = { total: 0, online: 0 };
          cityMap[city].total++;
          if (isOnline) cityMap[city].online++;
        }

        const totalActive = screens.length;
        const healthRate = totalActive > 0 ? Math.round((onlineCount / totalActive) * 1000) / 10 : 0;

        // Build fake parsed rows from dayn_screens so the dashboard can display
        const now = new Date();
        const timestamp = now.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const fakeRows = screens.map(s => ({
          'Timestamp': timestamp,
          'Display ID': s.do_screen_id || s.dayn_screen_id || '',
          'Location Name': s.location_name || '',
          'Serial Number': '',
          'Date': '',
          'Status': s.screen_status || '',
          'Is Alive': /online/i.test(s.screen_status || '') ? 'true' : 'false',
          'Display Status': s.screen_status || '',
          'Last Online Date': /online/i.test(s.screen_status || '') ? now.toLocaleDateString('en-US') : '',
          'Days Offline': /online/i.test(s.screen_status || '') ? '0' : '',
        }));

        setLoadProgress(`Verarbeite ${fakeRows.length} Screens...`);
        csvCacheRef.current = fakeRows;
        csvCacheRef._firstSeen = null;
        setTimeout(() => {
          try {
            processRawRows(fakeRows, null);
          } catch (e) {
            setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
            setLoading(false);
          }
        }, 50);
        return true; // Success
      } catch (e) {
        console.warn('[loadData] dayn_screens fallback error:', e.message);
        return false;
      }
    };

    // Helper: load & process CSV data from Google Sheets proxy (last resort, slow ~30s)
    const loadFromCSV = async (firstSeen) => {
      setLoadProgress('Lade Displaydaten von Google Sheets (kann 20s dauern)...');
      const Papa = (await import('papaparse')).default;
      return new Promise((resolve) => {
        Papa.parse(SHEET_URL, {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            try {
              setLoadProgress(`Verarbeite ${results.data.length.toLocaleString()} Datensätze...`);
              csvCacheRef.current = results.data;
              csvCacheRef._firstSeen = firstSeen || null;
              setTimeout(() => {
                try {
                  processRawRows(results.data, firstSeen || null);
                } catch (e) {
                  setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
                  setLoading(false);
                }
                resolve();
              }, 50);
            } catch (e) {
              setError('Fehler beim Laden der Daten. Bitte neu laden.');
              setLoading(false);
              resolve();
            }
          },
          error: (err) => {
            setError('Verbindungsfehler. Bitte Internetverbindung prüfen und neu laden.');
            setLoading(false);
            resolve();
          },
        });
      });
    };

    try {
      setLoadProgress('Lade Display-Daten...');

      // Fast path: Try server-side KPI aggregation (RPC) — returns ~5KB instead of 30MB
      // 180 Tage für Desktop damit alle Zeitraum-Buttons (7T bis 180T) Daten haben
      const RPC_DAYS = isMobile ? 14 : 180;
      const DATA_WINDOW_DAYS = isMobile ? 90 : 180;
      try {
        setLoadProgress('Lade KPI-Daten...');
        const rpcPromise = supabase.rpc('get_dashboard_kpis', { days_back: RPC_DAYS });
        const rpcTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('RPC timeout 15s')), 15000));
        const rpcResult = await Promise.race([rpcPromise, rpcTimeout]);
        if (rpcResult.error) {
          console.warn('[loadData] RPC get_dashboard_kpis error:', rpcResult.error.message, '| code:', rpcResult.error.code, '| hint:', rpcResult.error.hint, '| details:', rpcResult.error.details);
        }
        if (!rpcResult.error && rpcResult.data) {
          // Handle both parsed JSON and string responses (PostgREST may return string for JSON functions)
          let kpiData = rpcResult.data;
          if (typeof kpiData === 'string') {
            try { kpiData = JSON.parse(kpiData); } catch (e) {
              console.warn('[loadData] RPC returned unparseable string:', kpiData?.substring?.(0, 200));
              kpiData = null;
            }
          }
          if (!kpiData) {
            console.warn('[loadData] RPC returned null/empty data');
          }
          if (kpiData) {
            console.log('[loadData] RPC get_dashboard_kpis SUCCESS:', {
              installed: kpiData.installed,
              online: kpiData.online,
              healthRate: kpiData.healthRate,
              trendDays: kpiData.trend?.length,
              displays: kpiData.displays?.length,
            });
          // Convert RPC displays to the format processRawRows expects
          if (kpiData.displays && kpiData.displays.length > 0) {
            // Ensure timestamp is ISO 8601 with T (parseGermanDate requires it)
            const snapDate = kpiData.snapshotTimestamp;
            const isoTimestamp = snapDate
              ? (snapDate.includes('T') ? snapDate : snapDate + 'T12:00:00')
              : new Date().toISOString();

            // Build fake heartbeat timestamp for online displays
            const fakeHeartbeat = snapDate
              ? (snapDate.includes('T') ? snapDate.replace('T12:', 'T11:59:') : snapDate + 'T11:59:00')
              : new Date(Date.now() - 60000).toISOString();

            const fakeRows = kpiData.displays.map(d => {
              // Build a heartbeat timestamp based on the display's status:
              // - Online displays: heartbeat 1 min before snapshot → offlineHours ≈ 0
              // - Offline displays WITH daysOffline: heartbeat = snapshot - daysOffline*24h
              //   This ensures computeOfflineDistribution() places them in the correct bucket
              //   instead of classifying them all as "Nie Online"
              // - Never-online / unknown: no heartbeat → neverOnline = true
              let heartbeatTs = '';
              if (d.status === 'online') {
                heartbeatTs = fakeHeartbeat;
              } else if (d.daysOffline != null && d.daysOffline !== '' && Number(d.daysOffline) >= 0) {
                // Create a heartbeat timestamp that is daysOffline * 24 hours before snapshot
                const snapMs = new Date(isoTimestamp).getTime();
                const offlineMs = Number(d.daysOffline) * 24 * 60 * 60 * 1000;
                heartbeatTs = new Date(snapMs - offlineMs).toISOString();
              }
              // else: no heartbeat → never_online (displays without daysOffline and not online)

              return {
                'Timestamp': isoTimestamp,
                'Display ID': d.rawDisplayId || d.displayId || '',
                'Location Name': d.locationName || '',
                'Serial Number': '',
                'Date': '',
                'Status': heartbeatTs,
                'Is Alive': d.status === 'online' ? 'TRUE' : 'FALSE',
                'Display Status': d.displayStatus || '',
                'Last Online Date': '',
                'Days Offline': d.daysOffline != null ? String(d.daysOffline) : '',
              };
            });

            // Store the pre-computed trend data for KPI calculation
            const rpcTrendData = (kpiData.trend || []).map(t => ({
              dayKey: t.day,
              date: t.day ? t.day.split('-').reverse().join('.') : '',
              total: t.total || 0,
              online: t.online || 0,
              offline: (t.total || 0) - (t.online || 0),
              healthRate: t.healthRate || 0,
              warningCount: t.warning || 0,
              criticalCount: t.critical || 0,
              permanentOfflineCount: t.permanentOffline || 0,
            }));

            // Inject pre-computed RPC data so KPI calculation uses server-side values
            csvCacheRef._rpcTrendData = rpcTrendData;
            csvCacheRef._rpcByCity = null; // get_dashboard_kpis doesn't include byCity
            csvCacheRef._rpcSnapshot = {
              installed: kpiData.installed,
              online: kpiData.online,
              warning: kpiData.warning,
              critical: kpiData.critical,
              permanentOffline: kpiData.permanentOffline,
              healthRate: kpiData.healthRate,
              heartbeatTotal: kpiData.heartbeatTotal,
              daynTotal: kpiData.daynTotal,
              daynOnline: kpiData.daynOnline,
              totalOnlineHours: kpiData.totalOnlineHours,
              totalExpectedHours: kpiData.totalExpectedHours,
            };
            csvCacheRef.current = fakeRows;
            csvCacheRef._firstSeen = null;

            setLoadProgress(`Verarbeite ${fakeRows.length} Displays...`);
            setTimeout(() => {
              try {
                processRawRows(fakeRows, null);
              } catch (e) {
                console.error('[loadData] RPC data processing error:', e);
                setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
                setLoading(false);
              }
            }, 50);
            return;
          }
          } // end if (kpiData)
        }
        console.warn('[loadData] RPC get_dashboard_kpis unavailable, falling back to snapshot');
      } catch (rpcErr) {
        console.warn('[loadData] RPC failed:', rpcErr.message, '→ snapshot fallback');
      }

      // Fast fallback: lightweight snapshot (latest heartbeat per display, ~350 rows instead of 143K)
      // This replaces the slow full-pagination path with a single query + client-side dedup
      try {
        setLoadProgress('Lade Display-Snapshot...');
        const snapshotResult = await supabase
          .from('display_heartbeats')
          .select('display_id, raw_display_id, days_offline, is_alive, display_status, location_name, serial_number, heartbeat, last_online_date, timestamp')
          .order('timestamp_parsed', { ascending: false })
          .limit(2000);

        if (!snapshotResult.error && snapshotResult.data && snapshotResult.data.length > 0) {
          // Deduplicate by display_id (first occurrence = latest heartbeat)
          const seen = new Set();
          const uniqueDisplays = [];
          for (const row of snapshotResult.data) {
            if (row.display_id && !seen.has(row.display_id)) {
              seen.add(row.display_id);
              uniqueDisplays.push(row);
            }
          }

          console.log(`[loadData] Lightweight snapshot: ${uniqueDisplays.length} unique displays from ${snapshotResult.data.length} rows`);

          // Build fake rows in processRawRows format (same pattern as RPC fast path)
          const now = new Date();
          const isoTimestamp = now.toISOString();
          const fakeRows = uniqueDisplays.map(d => {
            const daysOffline = parseInt(d.days_offline) || 0;
            const isOnline = d.is_alive === 'TRUE' || d.is_alive === true || daysOffline < 1;

            // Build heartbeat timestamp for correct offline-bucket placement
            let heartbeatTs = '';
            if (isOnline) {
              heartbeatTs = new Date(now.getTime() - 60000).toISOString();
            } else if (daysOffline > 0) {
              heartbeatTs = new Date(now.getTime() - daysOffline * 24 * 60 * 60 * 1000).toISOString();
            }

            return {
              'Timestamp': isoTimestamp,
              'Display ID': d.raw_display_id || d.display_id || '',
              'Location Name': d.location_name || '',
              'Serial Number': d.serial_number || '',
              'Date': '',
              'Status': heartbeatTs,
              'Is Alive': isOnline ? 'TRUE' : 'FALSE',
              'Display Status': d.display_status || '',
              'Last Online Date': d.last_online_date || '',
              'Days Offline': d.days_offline != null ? String(d.days_offline) : '',
            };
          });

          csvCacheRef.current = fakeRows;
          csvCacheRef._firstSeen = null;
          csvCacheRef._rpcByCity = null;

          // ── Try to load trend data separately via simpler RPC ──
          // Without trend data, the dashboard shows "Ø 1 Tage" and empty charts.
          // get_daily_trend is a lightweight function (no display list, no health agg).
          let trendLoaded = false;
          try {
            setLoadProgress('Lade Trend-Daten...');
            const trendRpc = await Promise.race([
              supabase.rpc('get_daily_trend', { days_back: 30 }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('trend RPC timeout')), 10000)),
            ]);
            let trendArr = trendRpc.data;
            if (typeof trendArr === 'string') {
              try { trendArr = JSON.parse(trendArr); } catch (_) { trendArr = null; }
            }
            if (!trendRpc.error && trendArr && Array.isArray(trendArr) && trendArr.length > 0) {
              console.log('[loadData] get_daily_trend SUCCESS:', trendArr.length, 'days');
              csvCacheRef._rpcTrendData = trendArr.map(t => ({
                dayKey: t.day,
                date: t.day ? t.day.split('-').reverse().join('.') : '',
                total: t.total || 0,
                online: t.online || 0,
                offline: (t.total || 0) - (t.online || 0),
                healthRate: t.healthRate || 0,
                warningCount: t.warning || 0,
                criticalCount: t.critical || 0,
                permanentOfflineCount: t.permanentOffline || 0,
              }));
              trendLoaded = true;
            } else {
              console.warn('[loadData] get_daily_trend failed:', trendRpc.error?.message || 'no data');
              csvCacheRef._rpcTrendData = null;
            }
          } catch (trendErr) {
            console.warn('[loadData] Trend RPC failed:', trendErr.message);
            csvCacheRef._rpcTrendData = null;
          }

          // ── Try to load installed count + Dayn count for accurate KPIs ──
          try {
            const [installedResult, daynResult] = await Promise.all([
              supabase.from('airtable_displays').select('display_id', { count: 'exact', head: true })
                .in('online_status', ['Live', 'Installed & online']),
              supabase.from('dayn_screens').select('do_screen_id', { count: 'exact', head: true })
                .not('do_screen_id', 'is', null),
            ]);
            const installedCount = installedResult.count || 0;
            const daynCount = daynResult.count || 0;
            if (installedCount > 0 || daynCount > 0) {
              console.log('[loadData] Installed:', installedCount, '| Dayn:', daynCount);
              csvCacheRef._rpcSnapshot = {
                installed: installedCount,
                daynTotal: daynCount,
                daynOnline: Math.round(daynCount * 0.9),
              };
            } else {
              csvCacheRef._rpcSnapshot = null;
            }
          } catch (countErr) {
            console.warn('[loadData] Count queries failed:', countErr.message);
            csvCacheRef._rpcSnapshot = null;
          }

          setLoadProgress(`Verarbeite ${fakeRows.length} Displays...`);
          setTimeout(() => {
            try {
              processRawRows(fakeRows, null);
            } catch (e) {
              console.error('[loadData] Snapshot processing error:', e);
              setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
              setLoading(false);
            }
          }, 50);
          return;
        }
        console.warn('[loadData] Snapshot query empty, falling back to full pagination');
      } catch (snapErr) {
        console.warn('[loadData] Snapshot fallback error:', snapErr.message, '→ full pagination');
      }

      // Step 1: Quick permission check on heartbeats — try direct Supabase first, then proxy
      setLoadProgress('Prüfe Datenquelle...');
      let heartbeatsAvailable = false;
      let useProxy = false;
      try {
        const probePromise = supabase
          .from('display_heartbeats')
          .select('timestamp_parsed')
          .order('timestamp_parsed', { ascending: false })
          .limit(1);
        const timeoutPromise = new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Heartbeat probe timeout')), 5000)
        );
        const probeResult = await Promise.race([probePromise, timeoutPromise]);
        heartbeatsAvailable = !probeResult.error && probeResult.data && probeResult.data.length > 0;
        if (probeResult.error) {
          console.warn('[loadData] Heartbeats direct probe error:', probeResult.error.message, '→ trying proxy');
          // Try the proxy endpoint instead
          try {
            const proxyRes = await fetch('/api/supabase-proxy?table=display_heartbeats&select=timestamp_parsed&limit=1&order=timestamp_parsed.desc');
            if (proxyRes.ok) {
              const proxyData = await proxyRes.json();
              if (proxyData && proxyData.length > 0) {
                heartbeatsAvailable = true;
                useProxy = true;
                // Heartbeats available via proxy
              }
            }
          } catch (proxyErr) {
            console.warn('[loadData] Proxy probe also failed:', proxyErr.message);
          }
        }
      } catch (probeErr) {
        console.warn('[loadData] Heartbeats probe failed:', probeErr.message);
      }

      if (!heartbeatsAvailable) {
        const daynOk = await loadFromDaynScreens();
        if (!daynOk) {
          // dayn_screens also failed → last resort: CSV (slow but complete)
          console.warn('[loadData] dayn_screens failed, last resort: CSV');
          await loadFromCSV(null);
        }
        return;
      }

      // Step 2: Heartbeats available → fetch first-seen and compute cutoff
      let preloadedFirstSeen = {};
      try {
        const firstSeenPromise = supabase.from('display_first_seen').select('display_id, first_seen');
        const fsTimeout = new Promise((resolve) => setTimeout(() => resolve({ error: { message: 'timeout' } }), 5000));
        const firstSeenResult = await Promise.race([firstSeenPromise, fsTimeout]);
        if (!firstSeenResult.error && firstSeenResult.data) {
          for (const row of firstSeenResult.data) {
            if (row.first_seen) preloadedFirstSeen[row.display_id] = new Date(row.first_seen);
          }
          // first-seen loaded successfully
        }
      } catch (e) {
        console.warn('[loadData] first-seen load failed:', e.message);
      }

      // Helper: fetch heartbeat data (direct or via proxy)
      const fetchHeartbeats = async (select, params = {}) => {
        if (useProxy) {
          let url = `/api/supabase-proxy?table=display_heartbeats&select=${encodeURIComponent(select)}`;
          if (params.limit) url += `&limit=${params.limit}`;
          if (params.order) url += `&order=${encodeURIComponent(params.order)}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
          return { data: await res.json(), error: null };
        }
        let q = supabase.from('display_heartbeats').select(select);
        if (params.order) {
          const [col, dir] = params.order.split('.');
          q = q.order(col, { ascending: dir === 'asc' });
        }
        if (params.limit) q = q.limit(params.limit);
        if (params.gte) q = q.gte(params.gte[0], params.gte[1]);
        if (params.range) q = q.range(params.range[0], params.range[1]);
        return await q;
      };

      // Get the latest timestamp for cutoff calculation
      const maxTsResult = await fetchHeartbeats('timestamp_parsed', { order: 'timestamp_parsed.desc', limit: 1 });

      let cutoffISO = null;
      if (!maxTsResult.error && maxTsResult.data?.length > 0 && maxTsResult.data[0].timestamp_parsed) {
        const latestDate = new Date(maxTsResult.data[0].timestamp_parsed);
        const cutoff = new Date(latestDate.getTime() - DATA_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        cutoffISO = cutoff.toISOString();
      }

      // Step 3: Fetch heartbeat data paginated (via proxy or direct)
      setLoadProgress('Lade aktuelle Heartbeat-Daten...');
      let allRows = [];
      let from = 0;
      const pageSize = 1000;
      const hbSelect = 'timestamp,display_id,raw_display_id,location_name,serial_number,registration_date,heartbeat,is_alive,display_status,last_online_date,days_offline';

      while (true) {
        let data, sbError;
        if (useProxy) {
          let proxyUrl = `/api/supabase-proxy?table=display_heartbeats&select=${encodeURIComponent(hbSelect)}&limit=${pageSize}&offset=${from}&order=timestamp_parsed.desc`;
          if (cutoffISO) proxyUrl += `&filter=timestamp_parsed=gte.${encodeURIComponent(cutoffISO)}`;
          try {
            const res = await fetch(proxyUrl);
            if (!res.ok) { console.warn('[loadData] Proxy page error:', res.status); break; }
            data = await res.json();
          } catch (e) { console.warn('[loadData] Proxy fetch error:', e.message); break; }
        } else {
          let query = supabase
            .from('display_heartbeats')
            .select(hbSelect)
            .order('timestamp_parsed', { ascending: false })
            .range(from, from + pageSize - 1);
          if (cutoffISO) query = query.gte('timestamp_parsed', cutoffISO);
          const result = await query;
          data = result.data;
          sbError = result.error;
          if (sbError) { console.warn('[loadData] Heartbeat page error:', sbError.message); break; }
        }

        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        setLoadProgress(`Lade Displaydaten… ${allRows.length.toLocaleString()} Einträge`);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (allRows.length > 0) {
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

        setLoadProgress(`Verarbeite ${mappedRows.length.toLocaleString()} Datensätze...`);
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

      // Heartbeats returned 0 rows → fallback
      console.warn('[loadData] 0 heartbeat rows → dayn_screens fallback');
      const daynOk = await loadFromDaynScreens();
      if (!daynOk) await loadFromCSV(preloadedFirstSeen);

    } catch (err) {
      console.error('[loadData] Error:', err.message, '→ trying dayn_screens');
      const daynOk = await loadFromDaynScreens();
      if (!daynOk) {
        setLoadProgress('Lade Displaydaten von Google Sheets...');
        const Papa = (await import('papaparse')).default;
        Papa.parse(SHEET_URL, {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            csvCacheRef.current = results.data;
            csvCacheRef._firstSeen = null;
            setLoadProgress(`Verarbeite ${results.data.length.toLocaleString()} Datensätze...`);
            setTimeout(() => {
              try {
                processRawRows(results.data, null);
              } catch (e) {
                setError('Fehler bei der Datenverarbeitung. Bitte neu laden.');
                setLoading(false);
              }
            }, 50);
          },
          error: (csvErr) => {
            setError('Verbindungsfehler. Bitte Internetverbindung prüfen und neu laden.');
            setLoading(false);
          },
        });
      }
    }
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { mainTab, subTab } = parseHash();
      setActiveMainTabRaw(mainTab);
      setActiveSubTabRaw(subTab);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [parseHash]);

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

  // comparisonData state declared here (before kpis memo) so Dayn screens
  // can be included in KPI calculations. The useEffect that populates it
  // remains near its Supabase loading logic further below.
  const [comparisonData, setComparisonData] = useState(null);

  const rawData = useMemo(() => {
    if (!parsedRows) return null;
    const base = aggregateData(parsedRows, rangeStart, rangeEnd, globalFirstSeen);
    if (!base) return null;

    // ── Override trendData + cityData with RPC-computed values (if available) ──
    // The RPC computes health rate server-side with proper per-source logic.
    // The frontend fakeRows lack heartbeat/offline precision for airtable/dayn displays,
    // so the self-computed trendData would be inaccurate (e.g. 17% instead of 89%).
    const rpcTrend = csvCacheRef._rpcTrendData;
    const rpcByCity = csvCacheRef._rpcByCity;

    if (rpcTrend && rpcTrend.length > 0) {
      // Filter RPC trend data by selected date range (rangeStart/rangeEnd)
      // Without this, changing 7T/14T/30T/etc. has no effect on the displayed data.
      let filteredTrend = rpcTrend;
      if (rangeStart) {
        const startMs = rangeStart.getTime();
        filteredTrend = filteredTrend.filter(t => {
          const [y, m, d] = (t.dayKey || '').split('-').map(Number);
          return y && m && d && new Date(y, m - 1, d, 23, 59, 59).getTime() >= startMs;
        });
      }
      if (rangeEnd) {
        const endMs = rangeEnd.getTime();
        filteredTrend = filteredTrend.filter(t => {
          const [y, m, d] = (t.dayKey || '').split('-').map(Number);
          return y && m && d && new Date(y, m - 1, d).getTime() <= endMs;
        });
      }

      // Day-level trend data for HealthTrendChart and computeKPIs.
      // Each entry keeps its real totalOnlineHours/totalExpectedHours from the RPC.
      const dailyTrend = filteredTrend.map(t => {
        const [y, m, d] = (t.dayKey || '').split('-').map(Number);
        return {
          ...t,
          timestamp: y && m && d ? new Date(y, m - 1, d, 12, 0) : new Date(),
          // RPC trend provides per-day online hours via healthRate * total * 16h
          totalOnlineHours: t.healthRate != null && t.total
            ? (t.healthRate / 100) * t.total * 16
            : (t.online || 0) * 16,
          totalExpectedHours: (t.total || 0) * 16,
        };
      });
      base.trendData = dailyTrend;

      // Expanded hourly snapshots for OverviewHealthPatterns (heatmap, hour chart).
      // Each day is expanded into 17 hourly entries (06:00-22:00).
      const expandedForPatterns = [];
      filteredTrend.forEach(t => {
        const [y, m, d] = (t.dayKey || '').split('-').map(Number);
        if (!y || !m || !d) return;
        for (let hour = 6; hour <= 22; hour++) {
          expandedForPatterns.push({
            ...t,
            timestamp: new Date(y, m - 1, d, hour, 0),
          });
        }
      });
      base.snapshotTrendData = expandedForPatterns;

      // Store actual day count for correct "Ø X Tage" display
      base._rpcDayCount = filteredTrend.length;
    }

    if (rpcByCity && rpcByCity.length > 0) {
      // Override city data with RPC-computed values (includes airtable+dayn displays)
      base.cityData = rpcByCity.map(c => ({
        name: c.city,
        code: c.city,
        total: c.total || 0,
        online: c.online || 0,
        offline: c.offline || 0,
        healthRate: c.total > 0 ? Math.round((c.online / c.total) * 1000) / 10 : 0,
      }));
    }

    return base;
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

    // ── RPC path: use server-computed KPI values directly ──
    // The RPC computes health rate, status categories, and counts server-side
    // with proper per-source logic. The frontend fakeRows lack the precision
    // needed for correct offline-hours calculation (airtable/dayn displays
    // have no heartbeat data), so we override computeKPIs output with RPC values.
    const rpcSnapshot = csvCacheRef._rpcSnapshot;
    const rpcTrend = csvCacheRef._rpcTrendData;
    const isRpcPath = !!rpcSnapshot;
    // Full RPC = get_dashboard_kpis succeeded (has healthRate + totalExpectedHours)
    const isFullRpc = isRpcPath && rpcSnapshot.totalExpectedHours != null;

    const base = computeKPIs(rawData.displays, rawData.latestTimestamp, globalFirstSeen, rawData.trendData, rangeStart);
    if (!base) return null;

    // Fix snapshotCount: use actual day count from RPC trend data
    if (rawData._rpcDayCount != null) {
      base.snapshotCount = rawData._rpcDayCount;
    }

    if (isRpcPath) {
      const daynTotal = rpcSnapshot.daynTotal ?? 0;
      const daynOnline = rpcSnapshot.daynOnline ?? 0;

      if (isFullRpc) {
        // Full RPC path: use server-computed health rate with Dayn blending
        const hbHealthRate = rpcSnapshot.healthRate ?? base.healthRate;
        const hbExpected = rpcSnapshot.totalExpectedHours ?? 0;
        const hbOnline = rpcSnapshot.totalOnlineHours ?? 0;
        if (daynTotal > 0 && hbExpected > 0) {
          const hbTotal = rpcSnapshot.heartbeatTotal ?? 1;
          const avgRecordsPerDisplay = hbExpected / Math.max(hbTotal, 1);
          const daynExpectedScaled = daynTotal * avgRecordsPerDisplay;
          const daynOnlineScaled = daynOnline * avgRecordsPerDisplay;
          const blendedOnline = hbOnline + daynOnlineScaled;
          const blendedExpected = hbExpected + daynExpectedScaled;
          base.healthRate = blendedExpected > 0
            ? Math.round((blendedOnline / blendedExpected * 100) * 10) / 10
            : hbHealthRate;
        } else {
          base.healthRate = hbHealthRate;
        }
        base.onlineCount = rpcSnapshot.online ?? base.onlineCount;
        base.warningCount = rpcSnapshot.warning ?? base.warningCount;
        base.criticalCount = rpcSnapshot.critical ?? base.criticalCount;
        base.permanentOfflineCount = rpcSnapshot.permanentOffline ?? base.permanentOfflineCount;
      } else {
        // Partial RPC: snapshot fallback + trend data from get_daily_trend
        // Health rate is already computed by computeKPIs from expanded trendData
        // (which now has totalOnlineHours/totalExpectedHours set correctly).
        // Blend in Dayn screens proportionally.
        if (daynTotal > 0 && rpcTrend && rpcTrend.length > 0) {
          const hbOnline = rpcTrend.reduce((s, t) => s + (t.online || 0), 0);
          const hbTotal = rpcTrend.reduce((s, t) => s + (t.total || 0), 0);
          const days = rpcTrend.length;
          const totalOnlineWithDayn = hbOnline + (daynOnline * days);
          const totalWithDayn = hbTotal + (daynTotal * days);
          base.healthRate = totalWithDayn > 0
            ? Math.round((totalOnlineWithDayn / totalWithDayn * 100) * 10) / 10
            : base.healthRate;
        }
      }

      base.installed = rpcSnapshot.installed ?? base.totalActive;
      base.heartbeatTotal = rpcSnapshot.heartbeatTotal ?? (base.installed - daynTotal);
      base.totalActive = (rpcSnapshot.installed ?? base.totalActive) - (base.permanentOfflineCount ?? 0);
      // Compute neverOnlineCount from actual display data (not hardcoded to 0)
      base.neverOnlineCount = rawData.displays.filter(d => d.isActive && d.status === 'never_online').length;
      base.daynTotal = daynTotal;
      base.daynOnline = daynOnline;

      // WICHTIG: Online darf nicht > Installed sein!
      // Heartbeat-Displays können deinstallierte enthalten die noch senden.
      if (base.onlineCount > base.installed) {
        base.onlineCount = base.installed - (base.warningCount || 0) - (base.criticalCount || 0) - (base.permanentOfflineCount || 0);
        if (base.onlineCount < 0) base.onlineCount = 0;
      }
      // Also fix the display lists used for drill-down
      base.onlineDisplays = rawData.displays.filter(d => d.status === 'online');
      base.warningDisplays = rawData.displays.filter(d => d.status === 'warning');
      base.criticalDisplays = rawData.displays.filter(d => d.status === 'critical');
      base.permanentOfflineDisplays = rawData.displays.filter(d => d.status === 'permanent_offline');
      base.neverOnlineDisplays = rawData.displays.filter(d => d.status === 'never_online');
      // Averages from RPC trend data
      if (rpcTrend && rpcTrend.length > 0) {
        base.avgTotal = Math.round(rpcTrend.reduce((s, t) => s + (t.total || 0), 0) / rpcTrend.length);
        base.avgOnline = Math.round(rpcTrend.reduce((s, t) => s + (t.online || 0), 0) / rpcTrend.length);
        base.avgWarning = Math.round(rpcTrend.reduce((s, t) => s + (t.warningCount || 0), 0) / rpcTrend.length);
        base.avgCritical = Math.round(rpcTrend.reduce((s, t) => s + (t.criticalCount || 0), 0) / rpcTrend.length);
        base.avgPermanentOffline = Math.round(rpcTrend.reduce((s, t) => s + (t.permanentOfflineCount || 0), 0) / rpcTrend.length);
        base.avgNeverOnline = base.neverOnlineCount;
      }
    } else {
      // Non-RPC fallback: Dayn screens are separate, add them manually
      const daynTotal = comparisonData?.dayn?.total || 0;
      const daynOnline = comparisonData?.dayn?.activeIds?.size || 0;
      if (daynTotal > 0) {
        base.totalActive += daynTotal;
        base.onlineCount += daynOnline;
        if (rawData.trendData && rawData.trendData.length > 0) {
          const baseOnlineHours = rawData.trendData.reduce((sum, day) => sum + (day.totalOnlineHours || 0), 0);
          const baseExpectedHours = rawData.trendData.reduce((sum, day) => sum + (day.totalExpectedHours || 0), 0);
          const trendDays = rawData.trendData.length;
          const daynOnlineHours = daynOnline * 16.0 * trendDays;
          const daynExpectedHours = daynTotal * 16.0 * trendDays;
          const totalOnline = baseOnlineHours + daynOnlineHours;
          const totalExpected = baseExpectedHours + daynExpectedHours;
          base.healthRate = totalExpected > 0 ? Math.round((totalOnline / totalExpected) * 1000) / 10 : base.healthRate;
        } else {
          const totalOnline = base.onlineCount;
          const totalActive = base.totalActive;
          base.healthRate = totalActive > 0 ? Math.round((totalOnline / totalActive) * 1000) / 10 : 0;
        }
        base.avgTotal = (base.avgTotal || 0) + daynTotal;
        base.avgOnline = (base.avgOnline || 0) + daynOnline;
      }
    }

    return base;
  }, [rawData, globalFirstSeen, rangeStart, comparisonData]);

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
        displayCount: kpis.installed || kpis.totalActive || 0,
        cityData: rawData.cityData,
        latestTimestamp: rawData.latestTimestamp?.toISOString(),
      });
    }
  }, [kpis, rawData]);

  /* ─── Stale-While-Revalidate: show cached data instantly, refresh in background ─── */
  const isBackgroundRefreshing = loading && !!cachedSnapshot && !isMobile;
  const displayKpis = kpis || (cachedSnapshot?.kpis ? {
    ...cachedSnapshot.kpis,
    _cached: true,
    _cachedTimestamp: cachedSnapshot.timestamp,
    _lists: {},
  } : null);
  const displayRawData = rawData || (cachedSnapshot ? {
    latestTimestamp: cachedSnapshot.latestTimestamp ? new Date(cachedSnapshot.latestTimestamp) : new Date(),
    displays: [],
    trendData: [],
    cityData: cachedSnapshot.cityData || [],
    totalParsedRows: 0,
    snapshotTrendData: null,
    _cached: true,
  } : null);

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
  // (State declaration moved up before kpis memo for Dayn screen integration)
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
      } catch (e) {
        console.warn('[App] Comparison data load error:', e);
      }
    }
    loadComparisonData();
  }, [rawData]);

  const rangeLabel = useMemo(() => {
    if (!rangeStart && !rangeEnd) return 'Gesamter Zeitraum';
    if (rangeStart && !rangeEnd && dataLatest) {
      // Normalize to midnight to avoid ±1 day rounding errors
      // (rangeStart is midnight but dataLatest may have time like 19:00)
      const latestMidnight = new Date(dataLatest);
      latestMidnight.setHours(0, 0, 0, 0);
      const startMidnight = new Date(rangeStart);
      startMidnight.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (latestMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 7) return '7 Tage';
      if (diffDays <= 14) return '14 Tage';
      if (diffDays <= 30) return '30 Tage';
      if (diffDays <= 60) return '60 Tage';
      if (diffDays <= 90) return '90 Tage';
      if (diffDays <= 180) return '180 Tage';
      if (diffDays <= 365) return '365 Tage';
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

      // Check if password change is required (first login or expired)
      if (result.user.mustChangePassword || result.user.passwordExpired) {
        setLastLoginPassword(passwordInput);
        setPasswordChangeReason(result.user.mustChangePassword ? 'first_login' : 'expired');
        setForcePasswordChange(true);
      }

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

  // Session recovery in progress — show brief loading state
  if (authRecovering) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">Session wird geladen…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
        <div className="w-full max-w-[360px] px-6">
          <form onSubmit={handleLogin} className="bg-surface-primary border border-border-secondary rounded-2xl p-8 shadow-lg">
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center mb-5 shadow-md">
                <img
                  src="/dimension-outdoor-logo.png"
                  alt="Dimension Outdoor"
                  className="h-8 w-auto invert opacity-90"
                />
              </div>
              <h1 className="text-[20px] font-semibold text-text-primary tracking-[-0.4px]">
                JET Germany
              </h1>
              <p className="text-[13px] text-text-muted mt-1">
                Display Network Monitor
              </p>
            </div>

            <div className="space-y-4">
              {/* Email / Username Field */}
              <div>
                <label className="text-[13px] font-medium text-text-secondary block mb-1.5">E-Mail oder Benutzername</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); setAuthError(''); }}
                    placeholder="name@dimension-outdoor.com"
                    autoFocus
                    className={`w-full bg-surface-secondary border rounded-[var(--radius-md)] pl-10 pr-3.5 py-3 text-[15px] text-text-primary placeholder-text-muted focus:outline-none focus:ring-3 focus:ring-accent/12 transition-all ${
                      authError
                        ? 'border-status-offline focus:border-status-offline'
                        : 'border-border-primary focus:border-accent'
                    }`}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="text-[13px] font-medium text-text-secondary block mb-1.5">Passwort</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }}
                    placeholder="Passwort eingeben"
                    className={`w-full bg-surface-secondary border rounded-[var(--radius-md)] pl-10 pr-3.5 py-3 text-[15px] text-text-primary placeholder-text-muted focus:outline-none focus:ring-3 focus:ring-accent/12 transition-all ${
                      authError
                        ? 'border-status-offline focus:border-status-offline'
                        : 'border-border-primary focus:border-accent'
                    }`}
                  />
                </div>
                {authError && (
                  <p className="text-status-offline text-[13px] mt-2">
                    {authError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-[var(--radius-md)] text-[15px] font-semibold bg-accent text-white hover:bg-accent-hover active:brightness-90 transition-all shadow-sm"
              >
                Anmelden
              </button>

              <button
                type="button"
                onClick={() => { setShowResetForm(true); setResetEmail(emailInput); setResetStatus(''); }}
                className="w-full text-[13px] text-accent hover:text-accent-hover transition-colors mt-1"
              >
                Passwort vergessen?
              </button>
            </div>
          </form>

          {/* Password Reset Modal */}
          {showResetForm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
              <div className="bg-surface-primary border border-border-secondary rounded-[var(--radius-xl)] p-6 shadow-float w-full max-w-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-semibold text-text-primary">Passwort zurücksetzen</h2>
                  <button
                    onClick={() => setShowResetForm(false)}
                    className="w-7 h-7 rounded-full bg-surface-secondary flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {resetStatus === 'sent' ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-status-online/10 flex items-center justify-center mx-auto mb-3">
                      <Mail size={20} className="text-status-online" />
                    </div>
                    <p className="text-[15px] text-text-primary font-semibold mb-1">E-Mail gesendet!</p>
                    <p className="text-[13px] text-text-muted leading-relaxed">
                      Falls ein Account mit dieser E-Mail existiert, erhältst du einen Link zum Zurücksetzen deines Passworts.
                    </p>
                    <button
                      onClick={() => setShowResetForm(false)}
                      className="mt-4 px-5 py-2.5 rounded-[var(--radius-md)] text-[13px] font-semibold bg-surface-secondary text-text-secondary hover:bg-surface-tertiary transition-colors"
                    >
                      Schließen
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordReset}>
                    <p className="text-[13px] text-text-muted mb-4 leading-relaxed">
                      Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen deines Passworts.
                    </p>
                    <div className="relative mb-4">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="name@dimension-outdoor.com"
                        autoFocus
                        required
                        className="w-full bg-surface-secondary border border-border-primary rounded-[var(--radius-md)] pl-10 pr-3.5 py-3 text-[15px] text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/12 transition-all"
                      />
                    </div>
                    {resetStatus === 'error' && (
                      <p className="text-status-offline text-[13px] mb-3">
                        Fehler beim Senden. Bitte versuche es erneut.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowResetForm(false)}
                        className="flex-1 py-2.5 rounded-[var(--radius-md)] text-[13px] font-semibold bg-surface-secondary text-text-secondary hover:bg-surface-tertiary transition-colors"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="submit"
                        disabled={resetStatus === 'sending'}
                        className="flex-1 py-2.5 rounded-[var(--radius-md)] text-[13px] font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
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

  /* ═══ MOBILE: Skip desktop loading entirely ═══════════════════════════════
     Mobile uses mobileKPIs from a single RPC call (~2KB).
     If we have mobileKPIs (from cache or fresh RPC), jump DIRECTLY to
     the mobile layout section below — never show the desktop loader.
     ═══════════════════════════════════════════════════════════════════════ */
  if (isMobile && !mobileKPIs && loading) {
    // No data at all yet — show lightweight mobile skeleton (NOT desktop loader)
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex flex-col items-center justify-center p-6">
        <div className="text-center">
          <img src="/dimension-outdoor-logo.png" alt="Dimension Outdoor" className="h-10 w-auto brightness-0 opacity-60 mx-auto mb-4" />
          <div className="w-48 mx-auto">
            <div className="h-1 bg-surface-tertiary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full animate-progress-glow" style={{ width: '60%' }} />
            </div>
          </div>
          <p className="text-xs text-text-muted font-mono mt-3">Lade Dashboard...</p>
        </div>
      </div>
    );
  }

  if (isMobile && !mobileKPIs && error) {
    // Error + no cached data on mobile
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-text-primary mb-1">Verbindungsfehler</p>
          <p className="text-xs text-text-muted mb-4">{error}</p>
          <button onClick={() => loadData(true)} className="px-4 py-2 bg-blue-500 text-white text-sm rounded-xl">Erneut versuchen</button>
        </div>
      </div>
    );
  }

  // Mobile WITH mobileKPIs → skip everything below, go straight to mobile layout (line ~1365)
  // (this means: skip desktop loading screen, skip rawData/kpis null check)

  /* ─── DESKTOP Loading Screen (only when no cache available) ─── */

  if (loading && !isMobile && !cachedSnapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary">
        <div className="text-center">
          {/* Logo */}
          <div className="animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-6 shadow-md">
              <img
                src="/dimension-outdoor-logo.png"
                alt="Dimension Outdoor"
                className="h-8 w-auto invert opacity-90"
              />
            </div>
          </div>

          {/* Title */}
          <div className="animate-slide-up" style={{ animationDelay: '0.1s', opacity: 0 }}>
            <h1 className="text-[20px] font-semibold text-text-primary tracking-[-0.4px] mb-1">
              JET Germany
            </h1>
            <p className="text-[13px] text-text-muted">
              Display Network Monitor
            </p>
          </div>

          {/* Progress bar — thin Apple style */}
          <div className="animate-slide-up mt-8 w-48 mx-auto" style={{ animationDelay: '0.2s', opacity: 0 }}>
            <div className="h-[3px] bg-surface-tertiary rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-1000 ease-out"
                style={{ width: loadProgress?.includes('Verarbeite') ? '85%' : '45%' }}
              />
            </div>
            <p className="text-[12px] text-text-muted mt-3">
              {loadProgress || 'Laden...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Error Screen (Desktop only — mobile handled above) ─── */

  if (error && !isMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle size={40} className="text-status-offline mx-auto mb-4" />
          <div className="text-text-primary text-sm font-medium mb-2">
            Fehler beim Laden
          </div>
          <div className="text-text-muted text-xs font-mono mb-4">{error || 'Ein unerwarteter Fehler ist aufgetreten.'}</div>
          <button
            onClick={() => loadData(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-primary border border-border-secondary rounded-lg text-xs text-text-secondary hover:border-accent transition-colors"
          >
            <RefreshCw size={14} />
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  // Desktop needs rawData + kpis (or cached fallbacks). Mobile only needs mobileKPIs.
  if (!isMobile && (!displayRawData || !displayKpis)) return null;

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

  // Admin bypasses feature flags to see all features (for testing/review before rollout)
  const userIsAdmin = isAdmin();

  /* ─── Mobile Layout (Fast-Path: uses mobileKPIs from single RPC call) ─── */
  if (isMobile) {
    // Use mobile KPIs if available (from RPC), else fall back to desktop kpis
    const mk = mobileKPIs || kpis;

    // Compute badges from mobile KPIs (no heavy data needed)
    const mobileBadges = {};
    const offlineCount = (mk.criticalCount || 0) + (mk.permanentOfflineCount || 0);
    if (offlineCount > 0) mobileBadges['mobile-displays'] = offlineCount;
    // J.E.T. is now a floating button, no badge needed in nav

    return (
      <div className="min-h-screen flex flex-col mobile-app-container">
        {/* Mobile Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
              {/* Skeleton Loading — App-Feeling */}
              <div className="w-full flex gap-3 overflow-hidden">
                {[1,2,3].map(i => (
                  <div key={i} className="w-[72%] shrink-0 h-24 rounded-2xl bg-surface-tertiary animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
              {[1,2,3].map(i => (
                <div key={i} className="w-full h-16 rounded-xl bg-border-secondary/40 animate-pulse" style={{ animationDelay: `${(i + 3) * 80}ms` }} />
              ))}
            </div>
          }>
            {/* Home — Renders INSTANTLY with mobileKPIs (no rawData needed) */}
            {mobileTab === 'mobile-home' && (
              <MobileDashboard
                kpis={mk}
                topOffline={mobileKPIs?.topOffline || []}
                byCity={mobileKPIs?.byCity || {}}
                onNavigate={handleMobileNavigate}
                onSelectDisplay={setSelectedDisplay}
                onRefresh={() => loadData(true)}
                isRefreshing={loading}
              />
            )}

            {/* Displays — Lazy-loaded from Supabase with pagination */}
            {mobileTab === 'mobile-displays' && (
              <MobileDisplayCards
                initialFilter={mobileDisplayFilter}
                onSelectDisplay={setSelectedDisplay}
              />
            )}

            {/* Rollout — Lazy loaded only when tapped */}
            {mobileTab === 'mobile-rollout' && (
              <div className="flex-1 overflow-y-auto pb-24">
                <InstallationsDashboard isAdmin={isAdmin()} />
              </div>
            )}

            {/* Hardware — Lazy loaded only when tapped (needs Desktop data) */}
            {mobileTab === 'mobile-hardware' && (
              <div className="flex-1 overflow-y-auto pb-24">
                {/* QR Scanner Quick-Access */}
                <div className="px-4 pt-4 pb-2">
                  <button
                    onClick={() => setShowQRScanner(true)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 bg-blue-50/80 border border-blue-200/60 rounded-2xl active:bg-blue-100/80 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
                      <Search size={20} className="text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-semibold text-text-primary">QR / Barcode Scanner</div>
                      <div className="text-[11px] text-text-muted">Hardware per Kamera oder Seriennummer finden</div>
                    </div>
                    <ChevronDown size={16} className="text-text-muted -rotate-90" />
                  </button>
                </div>
                {rawData ? (
                  <HardwareDashboard comparisonData={comparisonData || {}} rawData={rawData} />
                ) : (
                  <div className="flex items-center justify-center h-64 text-text-muted text-sm">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />Daten werden geladen...
                  </div>
                )}
              </div>
            )}

            {/* Live — Liveticker / Activity Feed */}
            {mobileTab === 'mobile-live' && (
              <MobileActivityFeed />
            )}

            {/* J.E.T. Chat — handled via ChatAssistant overlay */}
            {mobileTab === 'mobile-jet' && (
              <div className="flex-1" />
            )}
          </Suspense>
        </div>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav
          activeTab={mobileTab}
          onTabChange={handleMobileTabChange}
          badges={mobileBadges}
          onJETPress={showMobileChat ? null : () => { setShowMobileChat(true); setMobileTab('mobile-jet'); }}
        />

        {/* QR Hardware Scanner Overlay */}
        {showQRScanner && (userIsAdmin || isFeatureEnabled('tab_qr_scanner')) && (
          <Suspense fallback={
            <div className="fixed inset-0 z-[9999] bg-black/20 backdrop-blur-sm flex items-end justify-center">
              <div className="w-full max-w-lg bg-surface-primary rounded-t-3xl p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            </div>
          }>
            <QRHardwareScanner onClose={() => setShowQRScanner(false)} />
          </Suspense>
        )}

        {/* AI Chat Assistant — opens as overlay on mobile when J.E.T. tab is active */}
        {(userIsAdmin || isFeatureEnabled('tab_chat_assistant')) && (
          <Suspense fallback={null}>
            <ChatAssistant
              rawData={rawData || { displays: [], cityData: [], tasks: [], trendData: [] }}
              kpis={kpis || mobileKPIs || {}}
              comparisonData={comparisonData || {}}
              currentUser={currentUser}
              forceOpen={showMobileChat}
              onClose={() => { setShowMobileChat(false); if (mobileTab === 'mobile-jet') setMobileTab('mobile-home'); }}
            />
          </Suspense>
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

        {/* Session Timeout Warning Banner */}
        {sessionWarning && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-xl bg-status-warning/10 border border-status-warning/20 shadow-lg animate-fade-in">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Session laeuft ab</p>
            </div>
            <button
              onClick={() => { touchSession(); setSessionWarning(false); }}
              className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white active:bg-amber-600 transition-colors"
            >
              Verlaengern
            </button>
          </div>
        )}

        {/* Mobile Akquise App Overlay */}
        {showAkquiseApp && (
          <Suspense fallback={
            <div className="fixed inset-0 z-[10000] bg-[#F2F2F7] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
            </div>
          }>
            <AkquiseApp onClose={() => setShowAkquiseApp(false)} />
          </Suspense>
        )}

        {/* Password Change Modal */}
        {showPasswordModal && (
          <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
        )}

        {/* Force Password Change Modal (first login / expired) */}
        {forcePasswordChange && (
          <ForcePasswordChangeModal
            reason={passwordChangeReason}
            currentPassword={lastLoginPassword}
            onSuccess={() => {
              setForcePasswordChange(false);
              setPasswordChangeReason(null);
              setLastLoginPassword('');
              setCurrentUser(getCurrentUser()); // refresh session data
            }}
          />
        )}

        {/* Dev Feedback Widget — Admin-only right-click context menu for coding feedback */}
        {userIsAdmin && (
          <Suspense fallback={null}>
            <FeedbackWidget />
          </Suspense>
        )}
      </div>
    );
  }

  const userGroup = getCurrentGroup();

  const tabGroups = [
    {
      group: 'Monitoring',
      tabs: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard, access: 'displays' },
        { id: 'displays-list', label: 'Displays', icon: Monitor, access: 'displays' },
        { id: 'display-trends', label: 'Trends', icon: TrendingUp, access: 'displays', featureFlag: 'tab_display_trends' },
        { id: 'cities', label: 'Städte', icon: MapPin, access: 'displays' },
        { id: 'hardware', label: 'Hardware', icon: HardDrive, access: 'hardware' },
      ],
    },
    {
      group: 'Vertrieb',
      tabs: [
        { id: 'acquisition', label: 'Akquise', icon: Target, access: 'displays' },
        { id: 'faw', label: 'FAW Check', icon: Eye, access: 'faw', featureFlag: 'tab_faw_check' },
        { id: 'installations', label: 'Installationen', icon: CalendarCheck, access: 'installations' },
        { id: 'map', label: 'Karte', icon: MapIcon, access: 'displays' },
        { id: 'contacts', label: 'Kontakte', icon: BookUser, access: 'displays' },
      ],
    },
    {
      group: 'Analytics',
      tabs: [
        { id: 'programmatic', label: 'Programmatic', icon: BarChart3, access: 'displays', featureFlag: 'tab_programmatic' },
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

  // Filter tabs by user permissions + feature flags, remove empty groups
  const visibleGroups = tabGroups
    .map(g => ({ ...g, tabs: g.tabs.filter(t =>
      canAccessTab(t.access) && (!t.featureFlag || userIsAdmin || isFeatureEnabled(t.featureFlag))
    ) }))
    .filter(g => g.tabs.length > 0);

  // Flat list for compatibility (used in hash routing validation etc.)
  const mainTabs = visibleGroups.flatMap(g => g.tabs);

  // Determine which group the active tab belongs to
  const activeGroup = visibleGroups.find(g => g.tabs.some(t => t.id === activeMainTab))?.group || visibleGroups[0]?.group;

  // Display-related tabs that need the date range picker
  const displayTabs = ['overview', 'displays-list', 'cities'];

  // Page title for content header
  const activeTabObj = mainTabs.find(t => t.id === activeMainTab);
  const pageTitle = activeTabObj?.label || 'Dashboard';

  // Theme hook
  const { isDark, toggleTheme } = useTheme();

  // Sidebar collapsed state (read from localStorage for content margin)
  const sidebarCollapsed = localStorage.getItem('jet-sidebar-collapsed') === 'true';

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Sidebar Navigation */}
      <Sidebar
        tabGroups={visibleGroups}
        activeTab={activeMainTab}
        onTabChange={setActiveMainTab}
        currentUser={currentUser}
        userGroup={userGroup}
        globalSearch={globalSearch}
        onSearchChange={(val) => { setGlobalSearch(val); setGlobalSearchOpen(true); }}
        globalSearchOpen={globalSearchOpen}
        globalSearchResults={globalSearchResults}
        onSearchResultClick={(r) => {
          if (r.display) {
            setSelectedDisplay(r.display);
          } else {
            const loc = comparisonData?.airtable?.locationMap?.get(r.id);
            setSelectedDisplay({
              displayId: r.id,
              locationName: r.label || r.id,
              city: loc?.city || '–',
              status: 'unknown',
              jetId: r.jetId || loc?.jetId || null,
              serialNumber: '',
              daysOffline: null,
              _stammdatenOnly: true,
            });
          }
          setGlobalSearchOpen(false);
          setGlobalSearch('');
        }}
        onSearchFocus={() => globalSearch.length >= 2 && setGlobalSearchOpen(true)}
        onSearchClear={() => { setGlobalSearch(''); setGlobalSearchOpen(false); }}
        globalSearchRef={globalSearchRef}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onPasswordChange={() => setShowPasswordModal(true)}
        onLogout={handleLogout}
        getInitials={getInitials}
      />

      {/* Content Area — offset by sidebar width */}
      <div className={`transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${sidebarCollapsed ? 'ml-[72px]' : 'ml-[260px]'}`}>
        {/* Content Header */}
        <ContentHeader
          pageTitle={pageTitle}
          displayRawData={displayRawData}
          totalRowsGlobal={totalRowsGlobal}
          onRefresh={() => loadData(true)}
          onSync={triggerSync}
          syncing={syncing}
          syncResult={syncResult}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          dataEarliest={dataEarliest}
          dataLatest={dataLatest}
          onRangeChange={handleRangeChange}
          rangeLabel={rangeLabel}
          displayTabs={displayTabs}
          activeMainTab={activeMainTab}
          DateRangePicker={DateRangePicker}
          formatDateTime={formatDateTime}
          comparisonData={comparisonData}
          onPasswordChange={() => setShowPasswordModal(true)}
          onLogout={handleLogout}
          currentUser={currentUser}
          userGroup={userGroup}
          getInitials={getInitials}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* Content */}
        <main className="px-5 py-5 space-y-5">
        {/* Overview */}
        {activeMainTab === 'overview' && (
          <TabErrorBoundary name="Overview">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Overview...</span></div>}>
            <KPICards
              kpis={displayKpis}
              activeFilter={kpiFilter}
              onFilterClick={handleKpiFilterClick}
              rangeLabel={rangeLabel}
              comparisonKPIs={comparisonKPIs}
              isRefreshing={isBackgroundRefreshing}
            />

            {/* KPI Drill-Down Panel */}
            {kpiFilter && kpiFilteredDisplays && (
              <div className="bg-surface-primary border border-accent/30 rounded-2xl shadow-card animate-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-secondary">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 rounded-full bg-accent" />
                    <h3 className="text-sm font-medium text-text-primary">
                      {KPI_FILTER_LABELS[kpiFilter]}
                    </h3>
                    <span className="text-xs font-mono text-text-muted bg-surface-secondary px-2 py-0.5 rounded">
                      {kpiFilteredDisplays.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setKpiFilter(null)}
                    className="p-1 rounded hover:bg-surface-secondary text-text-muted hover:text-text-primary transition-colors"
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
                {rawData ? (
                  <>
                    {/* Visualizations first */}
                    <HealthTrendChart
                      trendData={rawData.trendData}
                      rangeLabel={rangeLabel}
                      comparisonHealthRate={comparisonHealthRate}
                      comparisonTrendData={comparisonTrendData}
                    />

                    <OverviewHealthPatterns trendData={rawData.snapshotTrendData || rawData.trendData} rangeLabel={rangeLabel} />

                    <OverviewDisplayHealth
                      displays={rawData.displays}
                      onSelectDisplay={setSelectedDisplay}
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <OfflineDistributionChart distribution={distribution} />
                      <CityHealthChart cityData={rawData.cityData} />
                    </div>

                    {/* Neu installierte Displays Watchlist — nur Admin */}
                    {userIsAdmin && (
                      <NewDisplayWatchlist
                        watchlist={watchlist}
                        onSelectDisplay={setSelectedDisplay}
                        webhookUrl={webhookUrl}
                        onWebhookUrlChange={handleWebhookUrlChange}
                      />
                    )}

                    <DisplayTable
                      displays={rawData.displays}
                      onSelectDisplay={setSelectedDisplay}
                      comparisonData={comparisonData}
                    />
                  </>
                ) : isBackgroundRefreshing && (
                  <>
                    {/* Skeleton placeholders while fresh data loads */}
                    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-6 animate-pulse">
                      <div className="h-4 bg-surface-tertiary rounded w-48 mb-4" />
                      <div className="h-64 bg-surface-secondary rounded-xl" />
                    </div>
                    {displayRawData?.cityData?.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-6 animate-pulse">
                          <div className="h-4 bg-surface-tertiary rounded w-40 mb-4" />
                          <div className="h-48 bg-surface-secondary rounded-xl" />
                        </div>
                        <CityHealthChart cityData={displayRawData.cityData} />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Displays List */}
        {activeMainTab === 'displays-list' && (
          <TabErrorBoundary name="Displays">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Displays...</span></div>}>
            {rawData ? (
              <DisplayTable
                displays={rawData.displays}
                onSelectDisplay={setSelectedDisplay}
                vistarData={vistarData}
                comparisonData={comparisonData}
              />
            ) : (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
                <span className="ml-2 text-sm text-text-muted">Lade Display-Daten...</span>
              </div>
            )}
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Tasks Main Tab */}
        {activeMainTab === 'tasks' && (
          <TabErrorBoundary name="Tasks">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Tasks...</span></div>}>
            <TaskDashboard />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Installationen Main Tab */}
        {activeMainTab === 'installations' && (
          <TabErrorBoundary name="Installationen">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Installationen...</span></div>}>
            <InstallationsDashboard initialSection={activeSubTab} onSectionChange={updateSubTab} isAdmin={isAdmin()} />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Kommunikation Main Tab */}
        {activeMainTab === 'communication' && (
          <TabErrorBoundary name="Kommunikation">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Kommunikation...</span></div>}>
            <CommunicationDashboard />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Admin Main Tab */}
        {activeMainTab === 'admin' && canAccessTab('admin') && (
          <TabErrorBoundary name="Admin">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Admin...</span></div>}>
            <AdminPanel initialSection={activeSubTab} onSectionChange={updateSubTab} />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Programmatic Dashboard */}
        {activeMainTab === 'programmatic' && (
          <TabErrorBoundary name="Programmatic">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Programmatic...</span></div>}>
            <ProgrammaticDashboard />
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Hardware Dashboard (includes Datenqualität as sub-tab) */}
        {activeMainTab === 'hardware' && (
          <TabErrorBoundary name="Hardware">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Hardware...</span></div>}>
            {rawData ? (
              <HardwareDashboard comparisonData={comparisonData} rawData={rawData} initialSection={activeSubTab} onSectionChange={updateSubTab} />
            ) : (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Hardware-Daten...</span></div>
            )}
          </Suspense>
          </TabErrorBoundary>
        )}

        {/* Acquisition Pipeline */}
        {activeMainTab === 'acquisition' && (
          <TabErrorBoundary name="Akquise">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Akquise...</span></div>}>
              <AcquisitionDashboard onOpenAkquiseApp={isMobile ? () => setShowAkquiseApp(true) : undefined} initialSection={activeSubTab} onSectionChange={updateSubTab} />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* FAW Check (Frequency Approval) */}
        {activeMainTab === 'faw' && (
          <TabErrorBoundary name="FAW Check">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade FAW Check...</span></div>}>
              <FAWCheckApp />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Display Map */}
        {activeMainTab === 'map' && (
          <TabErrorBoundary name="Karte">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Karte...</span></div>}>
              {rawData ? (
                <DisplayMap rawData={rawData} comparisonData={comparisonData} onSelectDisplay={setSelectedDisplay} />
              ) : (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Kartendaten...</span></div>
              )}
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Contact Directory */}
        {activeMainTab === 'contacts' && (
          <TabErrorBoundary name="Kontakte">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Kontakte...</span></div>}>
              <ContactDirectory />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Display Trends */}
        {activeMainTab === 'display-trends' && (
          <TabErrorBoundary name="Display Trends">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Trends...</span></div>}>
              <DisplayTrends onSelectDisplay={setSelectedDisplay} />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Cities */}
        {activeMainTab === 'cities' && (
          <TabErrorBoundary name="Staedte">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Staedte...</span></div>}>
              <CityDashboard
                cityData={displayRawData.cityData}
                displays={displayRawData.displays}
                trendData={displayRawData.trendData}
                onSelectDisplay={setSelectedDisplay}
              />
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Activity Feed */}
        {activeMainTab === 'activities' && (
          <TabErrorBoundary name="Aktivitäten">
            <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Aktivitäten...</span></div>}>
              {rawData ? (
                <ActivityFeed rawData={rawData} />
              ) : (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /><span className="ml-2 text-sm text-text-muted">Lade Aktivitäten...</span></div>
              )}
            </Suspense>
          </TabErrorBoundary>
        )}

        {/* Data summary footer */}
        <div className="text-center py-4">
          <div className="text-xs text-text-muted font-mono">
            {rawData ? (
              <>
                {rawData.displays.length} Displays mit Heartbeat •{' '}
                {rawData.trendData.length} Tage Trend-Daten
              </>
            ) : isBackgroundRefreshing ? (
              <>Daten werden aktualisiert...</>
            ) : null}
          </div>
        </div>
      </main>
      </div>{/* end content area */}

      {/* AI Chat Assistant — floating button, available on all tabs */}
      {(userIsAdmin || isFeatureEnabled('tab_chat_assistant')) && (
        <Suspense fallback={null}>
          <ChatAssistant
            rawData={rawData || displayRawData}
            kpis={displayKpis}
            comparisonData={comparisonData}
            currentUser={currentUser}
          />
        </Suspense>
      )}

      {/* Session Timeout Warning Banner */}
      {sessionWarning && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-xl bg-status-warning/10 border border-status-warning/20 shadow-lg animate-fade-in">
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

      {/* Force Password Change Modal (first login / expired) */}
      {forcePasswordChange && (
        <ForcePasswordChangeModal
          reason={passwordChangeReason}
          currentPassword={lastLoginPassword}
          onSuccess={() => {
            setForcePasswordChange(false);
            setPasswordChangeReason(null);
            setLastLoginPassword('');
            setCurrentUser(getCurrentUser());
          }}
        />
      )}

      {/* Mobile Akquise App Overlay (launched from Akquise tab on mobile) */}
      {showAkquiseApp && (userIsAdmin || isFeatureEnabled('tab_akquise_app')) && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[10000] bg-[#F2F2F7] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
          </div>
        }>
          <AkquiseApp onClose={() => setShowAkquiseApp(false)} />
        </Suspense>
      )}

      {/* Dev Feedback Widget — Admin-only right-click context menu for coding feedback */}
      {userIsAdmin && (
        <Suspense fallback={null}>
          <FeedbackWidget />
        </Suspense>
      )}
    </div>
  );
}

export default App;
