/**
 * InstallApp — Standalone Installations-Tool
 *
 * Eigenständiger Zugang unter /install mit eigenem Login.
 * Zeigt nur das InstallationsDashboard (5 Sub-Tabs).
 * Enthält den WhatsApp Freigabe-Toggle.
 *
 * Verwendet Supabase Auth (gleiche Accounts wie Haupt-Dashboard).
 */

import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { supabase, isAdmin as checkIsAdmin } from './utils/authService';
import {
  Wrench, LogOut, Loader2, MessageCircle, Lock,
  ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw,
} from 'lucide-react';

/* ── Lieferando CI ── */
const BRAND = {
  orange: '#FF8000',
  orangeDark: '#E67300',
  orangeLight: '#FFF3E6',
  bg: '#FFFAF5',
};

/* ── Lieferando Logo (inline SVG — same as booking page) ── */
function LieferandoLogo({ className = '', compact = false }) {
  if (compact) {
    return (
      <svg viewBox="0 0 70 70" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <g fill={BRAND.orange}>
          <path d="M35 8C34 8 33 8.5 32.3 9.3L5 36c-1.5 1.5-0.5 4 1.7 4H13v28c0 2.2 1.8 4 4 4h6V52c0-2.2 1.8-4 4-4h16c2.2 0 4 1.8 4 4v20h6c2.2 0 4-1.8 4-4V40h6.3c2.2 0 3.2-2.5 1.7-4L37.7 9.3C37 8.5 36 8 35 8z"/>
          <path d="M29 28V18h3v10h-3zm5 0V18h3v10h-3zm-10 0V18h3v10h-3zm2 2c0 3 2 5.5 5 6v12h3V36c3-0.5 5-3 5-6H26z"/>
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 520 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <g fill={BRAND.orange}>
        <path d="M35 8C34 8 33 8.5 32.3 9.3L5 36c-1.5 1.5-0.5 4 1.7 4H13v28c0 2.2 1.8 4 4 4h6V52c0-2.2 1.8-4 4-4h16c2.2 0 4 1.8 4 4v20h6c2.2 0 4-1.8 4-4V40h6.3c2.2 0 3.2-2.5 1.7-4L37.7 9.3C37 8.5 36 8 35 8z"/>
        <path d="M29 28V18h3v10h-3zm5 0V18h3v10h-3zm-10 0V18h3v10h-3zm2 2c0 3 2 5.5 5 6v12h3V36c3-0.5 5-3 5-6H26z"/>
      </g>
      <g fill={BRAND.orange}>
        <text x="80" y="50" fontFamily="system-ui, -apple-system, sans-serif" fontSize="42" fontWeight="700" letterSpacing="-0.5">Lieferando</text>
        <text x="80" y="85" fontFamily="system-ui, -apple-system, sans-serif" fontSize="30" fontWeight="400" fill={BRAND.orangeDark}>Display Netzwerk</text>
      </g>
    </svg>
  );
}

const InstallationsDashboard = lazy(() => import('./components/InstallationsDashboard'));

const SESSION_KEY = 'install_tool_user';
const SESSION_TS_KEY = 'install_tool_session_ts';
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

/* ─── Session Management (localStorage for cross-tab persistence) ─── */
function getSession() {
  try {
    // Migrate from old sessionStorage if present
    const oldRaw = sessionStorage.getItem(SESSION_KEY);
    if (oldRaw && !localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, oldRaw);
      const oldTs = sessionStorage.getItem(SESSION_TS_KEY);
      if (oldTs) localStorage.setItem(SESSION_TS_KEY, oldTs);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_TS_KEY);
    }

    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const ts = localStorage.getItem(SESSION_TS_KEY);
    if (ts && Date.now() - parseInt(ts, 10) > SESSION_TIMEOUT_MS) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_TS_KEY);
      return null;
    }
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  localStorage.setItem(SESSION_TS_KEY, Date.now().toString());
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_TS_KEY);
  // Clean up legacy sessionStorage
  try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_TS_KEY); } catch {}
}

/** Recover session from Supabase Auth if localStorage session is missing */
async function recoverInstallSession() {
  const existing = getSession();
  if (existing) return existing;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data: profile } = await supabase
      .from('app_users')
      .select('id, name, email, group_id, active')
      .eq('auth_id', session.user.id)
      .single();

    if (!profile || profile.active === false) return null;

    const user = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      groupId: profile.group_id,
    };
    saveSession(user);
    console.log('[InstallApp] Session recovered from Supabase Auth for:', user.name);
    return user;
  } catch {
    return null;
  }
}

/* ─── Login Screen ─── */
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('E-Mail und Passwort erforderlich'); return; }
    setLoading(true);
    setError('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError('Ungültige E-Mail oder Passwort');
        setLoading(false);
        return;
      }

      // Fetch user profile
      const { data: profile } = await supabase
        .from('app_users')
        .select('id, name, email, group_id, active')
        .eq('auth_id', data.user.id)
        .single();

      if (!profile || profile.active === false) {
        setError('Kein aktives Benutzerprofil gefunden.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      const user = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        groupId: profile.group_id,
      };
      saveSession(user);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Login fehlgeschlagen');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: BRAND.bg }}>
      <div className="bg-surface-primary rounded-2xl shadow-xl p-8 w-full max-w-md" style={{ borderColor: BRAND.orangeLight, borderWidth: 1 }}>
        {/* Header — Lieferando Logo */}
        <div className="text-center mb-8">
          <LieferandoLogo className="h-16 mx-auto mb-4" />
          <div className="flex items-center justify-center gap-2 mt-2">
            <Wrench size={16} style={{ color: BRAND.orange }} />
            <span className="text-sm font-semibold text-text-primary">Installations-Tool</span>
          </div>
          <p className="text-xs text-text-muted mt-1">Routenplanung & Terminvereinbarung</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-border-secondary rounded-xl text-sm outline-none transition-all"
              style={{ '--tw-ring-color': BRAND.orange }}
              onFocus={(e) => { e.target.style.borderColor = BRAND.orange; e.target.style.boxShadow = `0 0 0 2px ${BRAND.orange}33`; }}
              onBlur={(e) => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
              placeholder="name@jet-germany.de"
              autoComplete="email"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-border-secondary rounded-xl text-sm outline-none transition-all"
              onFocus={(e) => { e.target.style.borderColor = BRAND.orange; e.target.style.boxShadow = `0 0 0 2px ${BRAND.orange}33`; }}
              onBlur={(e) => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-status-offline bg-status-offline/10 px-3 py-2 rounded-lg text-sm">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-white rounded-xl font-medium text-sm disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            style={{ background: BRAND.orange }}
            onMouseEnter={(e) => e.target.style.background = BRAND.orangeDark}
            onMouseLeave={(e) => e.target.style.background = BRAND.orange}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={14} />}
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <p className="text-xs text-text-muted text-center mt-6">
          Gleiche Zugangsdaten wie beim FlinkDB Dashboard
        </p>
      </div>
    </div>
  );
}

/* ─── WhatsApp Toggle ─── */
function WhatsAppToggle({ enabled, loading, onToggle }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClick = () => {
    if (enabled) {
      // Disabling is safe — no confirmation needed
      onToggle(false);
    } else {
      // Enabling requires confirmation
      setConfirmOpen(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
          enabled
            ? 'bg-status-online/10 text-green-700 border-status-online/20 hover:bg-status-online/10'
            : 'bg-status-offline/10 text-status-offline border-status-offline/20 hover:bg-status-offline/10'
        } ${loading ? 'opacity-50' : ''}`}
        title={enabled ? 'WhatsApp aktiv — Klicken zum Deaktivieren' : 'WhatsApp deaktiviert — Klicken zum Aktivieren'}
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : enabled ? (
          <ShieldCheck size={14} />
        ) : (
          <ShieldAlert size={14} />
        )}
        <MessageCircle size={14} />
        <span>{enabled ? 'WhatsApp aktiv' : 'WhatsApp aus'}</span>
      </button>

      {/* Confirmation Dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4">
          <div className="bg-surface-primary rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-status-warning/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-status-warning" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">WhatsApp aktivieren?</h3>
                <p className="text-xs text-text-muted">Diese Aktion hat Konsequenzen</p>
              </div>
            </div>
            <div className="bg-status-warning/10 border border-status-warning/20 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>Achtung:</strong> Wenn du WhatsApp aktivierst, werden <strong>echte Nachrichten</strong> an echte Kunden gesendet.
                Einladungen und Buchungsbestätigungen gehen direkt über SuperChat raus.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 px-4 py-2 border border-border-secondary rounded-lg text-sm font-medium text-text-primary hover:bg-surface-secondary"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { setConfirmOpen(false); onToggle(true); }}
                className="flex-1 px-4 py-2 bg-status-online text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Ja, aktivieren
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main App ─── */
export default function InstallApp() {
  const [user, setUser] = useState(() => getSession());
  const [recovering, setRecovering] = useState(!getSession()); // only recover if no session yet
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  // On mount: attempt session recovery from Supabase Auth
  useEffect(() => {
    if (!user) {
      recoverInstallSession().then(recovered => {
        if (recovered) setUser(recovered);
        setRecovering(false);
      });
    } else {
      setRecovering(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load feature flags
  const loadFlags = useCallback(async () => {
    try {
      const res = await fetch('/api/feature-flags');
      if (!res.ok) throw new Error('Failed to load flags');
      const data = await res.json();
      if (data.flags?.superchat_enabled) {
        setWhatsappEnabled(data.flags.superchat_enabled.enabled);
      }
      setFlagsLoaded(true);
    } catch (err) {
      console.warn('[InstallApp] Could not load feature flags:', err.message);
      setFlagsLoaded(true); // Still show UI, just default to OFF
    }
  }, []);

  useEffect(() => {
    if (user) loadFlags();
  }, [user, loadFlags]);

  // Refresh flags periodically (every 30s)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(loadFlags, 30000);
    return () => clearInterval(interval);
  }, [user, loadFlags]);

  // Keep session alive on activity
  useEffect(() => {
    if (!user) return;
    const onActivity = () => localStorage.setItem(SESSION_TS_KEY, Date.now().toString());
    window.addEventListener('click', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('click', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [user]);

  const handleLogin = useCallback((u) => setUser(u), []);

  const handleLogout = useCallback(async () => {
    clearSession();
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
  }, []);

  const handleToggleWhatsApp = useCallback(async (enabled) => {
    setWhatsappLoading(true);
    try {
      const res = await fetch('/api/feature-flags/superchat_enabled', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, updatedBy: user?.name || 'unknown' }),
      });
      if (!res.ok) throw new Error('Failed to update flag');
      const data = await res.json();
      setWhatsappEnabled(data.flag?.enabled ?? enabled);
    } catch (err) {
      console.error('[InstallApp] Failed to toggle WhatsApp:', err);
      alert('Fehler beim Umschalten: ' + err.message);
    }
    setWhatsappLoading(false);
  }, [user]);

  // Recovering session from Supabase Auth → show loading spinner
  if (recovering) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND.bg }}>
        <div className="text-center">
          <LieferandoLogo compact className="w-12 h-12 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-text-muted">Session wird wiederhergestellt…</p>
        </div>
      </div>
    );
  }

  // Not logged in → Show login
  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Logged in → Show app
  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Header */}
      <header className="bg-surface-primary border-b border-border-secondary sticky top-0 z-50 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Left: Lieferando Branding */}
          <div className="flex items-center gap-3">
            <LieferandoLogo compact className="w-8 h-8" />
            <div>
              <h1 className="text-sm font-bold text-text-primary leading-tight">
                <span style={{ color: BRAND.orange }}>Lieferando</span> Installations-Tool
              </h1>
              <p className="text-[10px] text-text-muted leading-tight">Routenplanung & Terminvereinbarung</p>
            </div>
          </div>

          {/* Center/Right: WhatsApp Toggle + User + Logout */}
          <div className="flex items-center gap-3">
            {/* WhatsApp Status */}
            {flagsLoaded && (
              <WhatsAppToggle
                enabled={whatsappEnabled}
                loading={whatsappLoading}
                onToggle={handleToggleWhatsApp}
              />
            )}
            {!flagsLoaded && (
              <div className="flex items-center gap-1 text-xs text-text-muted">
                <Loader2 size={12} className="animate-spin" />
                Flags...
              </div>
            )}

            {/* Refresh flags */}
            <button
              onClick={loadFlags}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-secondary transition-colors"
              title="Feature Flags aktualisieren"
            >
              <RefreshCw size={14} />
            </button>

            {/* Divider */}
            <div className="h-6 w-px bg-surface-tertiary" />

            {/* User info */}
            <span className="text-xs text-text-muted hidden sm:inline">{user.name}</span>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-status-offline hover:bg-status-offline/10 transition-colors"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-status-warning" />
            <span className="text-sm text-text-muted">Installations-Dashboard wird geladen...</span>
          </div>
        }>
          <InstallationsDashboard standalone isAdmin={user?.groupId === 'grp_admin' || checkIsAdmin()} />
        </Suspense>
      </main>
    </div>
  );
}
