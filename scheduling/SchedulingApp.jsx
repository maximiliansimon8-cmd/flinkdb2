import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import {
  BarChart3,
  Calendar,
  ClipboardList,
  Send,
  Phone,
  Building2,
  LogOut,
  Loader2,
  Lock,
  Mail,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  login,
  logout,
  getCurrentUser,
  touchSession,
  getSessionRemainingMs,
} from '../src/utils/authService.js';

/* ═══════════════════════════════════════════
   LAZY-LOADED TAB COMPONENTS
   ═══════════════════════════════════════════ */

const InstallationExecutiveDashboard = lazy(() =>
  import('../src/components/InstallationExecutiveDashboard')
);
const InstallationCalendar = lazy(() =>
  import('../src/components/InstallationCalendar')
);
const InstallationBookingsDashboard = lazy(() =>
  import('../src/components/InstallationBookingsDashboard')
);
const InstallationInviteManager = lazy(() =>
  import('../src/components/InstallationInviteManager')
);
const PhoneAcquisitionTab = lazy(() => import('./PhoneAcquisitionTab'));
const LocationDetailTab = lazy(() => import('./LocationDetailTab'));

/* ═══════════════════════════════════════════
   TAB DEFINITIONS
   ═══════════════════════════════════════════ */

const TABS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    component: InstallationExecutiveDashboard,
  },
  {
    id: 'calendar',
    label: 'Routen-Kalender',
    icon: Calendar,
    component: InstallationCalendar,
  },
  {
    id: 'bookings',
    label: 'Buchungen',
    icon: ClipboardList,
    component: InstallationBookingsDashboard,
  },
  {
    id: 'invites',
    label: 'Standorte einladen',
    icon: Send,
    component: InstallationInviteManager,
  },
  {
    id: 'phone',
    label: 'Telefonakquise',
    icon: Phone,
    component: PhoneAcquisitionTab,
  },
  {
    id: 'details',
    label: 'Aufbau-Details',
    icon: Building2,
    component: LocationDetailTab,
  },
];

/* ═══════════════════════════════════════════
   ALLOWED GROUP IDS
   ═══════════════════════════════════════════ */

const ALLOWED_GROUPS = ['grp_scheduling', 'grp_admin'];

/* ═══════════════════════════════════════════
   LOADING SPINNER (Suspense fallback)
   ═══════════════════════════════════════════ */

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <span className="text-sm text-gray-500">Wird geladen...</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SESSION TIMER HOOK
   ═══════════════════════════════════════════ */

function useSessionTimer(isLoggedIn) {
  const [remainingMs, setRemainingMs] = useState(() =>
    isLoggedIn ? getSessionRemainingMs() : 0
  );

  useEffect(() => {
    if (!isLoggedIn) return;

    const interval = setInterval(() => {
      const ms = getSessionRemainingMs();
      setRemainingMs(ms);
    }, 15_000); // update every 15 seconds

    // Initial update
    setRemainingMs(getSessionRemainingMs());

    return () => clearInterval(interval);
  }, [isLoggedIn]);

  return remainingMs;
}

/* ═══════════════════════════════════════════
   ACTIVITY TRACKER HOOK (debounced touchSession)
   ═══════════════════════════════════════════ */

function useActivityTracker(isLoggedIn) {
  const lastTouchRef = useRef(0);

  const handleActivity = useCallback(() => {
    if (!isLoggedIn) return;
    const now = Date.now();
    // Debounce: max once per 60 seconds
    if (now - lastTouchRef.current > 60_000) {
      lastTouchRef.current = now;
      touchSession();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [isLoggedIn, handleActivity]);
}

/* ═══════════════════════════════════════════
   FORMAT SESSION TIME
   ═══════════════════════════════════════════ */

function formatSessionTime(ms) {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/* ═══════════════════════════════════════════
   LOGIN SCREEN
   ═══════════════════════════════════════════ */

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // Check group access
      const user = result.user;
      if (!ALLOWED_GROUPS.includes(user.groupId)) {
        setError(
          'Kein Zugriff. Dieses Portal ist nur für das Terminierungs-Team zugänglich.'
        );
        await logout();
        setLoading(false);
        return;
      }

      onLogin(user);
    } catch {
      setError('Verbindungsfehler. Bitte versuche es erneut.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4 shadow-lg shadow-orange-500/25">
            <Calendar className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            JET Terminierung
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Installations-Scheduling Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                E-Mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@jet-germany.de"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
                             placeholder:text-gray-500 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passwort eingeben"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
                             placeholder:text-gray-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300
                         text-white font-medium text-sm rounded-xl transition-colors
                         focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:ring-offset-2
                         flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Anmelden...
                </>
              ) : (
                'Anmelden'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          JET Germany &middot; Internes Tool
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════ */

function Header({ user, remainingMs, onLogout }) {
  const isLow = remainingMs < 30 * 60 * 1000; // < 30 min

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 bg-orange-500 rounded-lg">
            <Calendar className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-base font-semibold text-gray-900 hidden sm:block">
            JET Terminierung
          </h1>
        </div>

        {/* Right: User info + session + logout */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Session timer */}
          <div
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              isLow
                ? 'bg-red-50 text-red-600'
                : 'bg-gray-100 text-gray-500'
            }`}
            title="Verbleibende Sitzungsdauer"
          >
            <Clock className="h-3 w-3" />
            <span>{formatSessionTime(remainingMs)}</span>
          </div>

          {/* User info */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm text-gray-700 font-medium">
              {user.name}
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: user.group?.color
                  ? `${user.group.color}18`
                  : '#f3f4f6',
                color: user.group?.color || '#6b7280',
              }}
            >
              {user.groupName}
            </span>
          </div>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600
                       hover:bg-red-50 rounded-lg transition-colors"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Abmelden</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════ */

function TabNavigation({ activeTab, onTabChange }) {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-14 z-40">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <div className="flex gap-0.5 overflow-x-auto scrollbar-hide -mb-px">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                           border-b-2 transition-colors shrink-0
                           ${
                             isActive
                               ? 'border-orange-500 text-orange-600'
                               : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                           }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════
   ERROR BOUNDARY
   ═══════════════════════════════════════════ */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-xl mb-4">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Fehler beim Laden
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Die Komponente konnte nicht geladen werden. Bitte lade die Seite
              neu.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium
                         rounded-lg transition-colors"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */

export default function SchedulingApp() {
  const [user, setUser] = useState(() => {
    const existing = getCurrentUser();
    // Only restore if user belongs to an allowed group
    if (existing && ALLOWED_GROUPS.includes(existing.groupId)) {
      return existing;
    }
    return null;
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  // Cross-tab navigation context: pass location info when switching to detail tab
  const [detailContext, setDetailContext] = useState(null);

  const isLoggedIn = !!user;
  const remainingMs = useSessionTimer(isLoggedIn);
  useActivityTracker(isLoggedIn);

  // Auto-logout when session expires
  useEffect(() => {
    if (isLoggedIn && remainingMs <= 0) {
      handleLogout();
    }
  }, [isLoggedIn, remainingMs]);

  const handleLogin = useCallback((loggedInUser) => {
    setUser(loggedInUser);
    setActiveTab('dashboard');
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
    setActiveTab('dashboard');
  }, []);

  const handleTabChange = useCallback((tabId) => {
    if (tabId !== 'details') setDetailContext(null);
    setActiveTab(tabId);
  }, []);

  // Navigate to detail tab with a specific location pre-selected
  const navigateToDetail = useCallback((locationId, locationName) => {
    setDetailContext({ locationId, locationName });
    setActiveTab('details');
  }, []);

  // Not logged in: show login screen
  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Find active tab component
  const activeTabDef = TABS.find((t) => t.id === activeTab) || TABS[0];
  const ActiveComponent = activeTabDef.component;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} remainingMs={remainingMs} onLogout={handleLogout} />
      <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        <ErrorBoundary key={activeTab}>
          <Suspense fallback={<LoadingSpinner />}>
            <ActiveComponent
              onNavigateToDetail={navigateToDetail}
              {...(activeTab === 'details' && detailContext ? {
                initialLocationId: detailContext.locationId,
                initialLocationName: detailContext.locationName,
                key: `details-${detailContext.locationId}`,
              } : {})}
            />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
