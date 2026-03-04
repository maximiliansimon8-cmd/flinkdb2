/**
 * Auth Service for JET Germany DOOH Dashboard
 * Powered by Supabase (Auth + PostgreSQL).
 *
 * Architecture:
 * - Supabase Auth handles login/logout/password (bcrypt, JWT)
 * - app_users table stores profile + group assignment
 * - groups table stores permission config
 * - audit_log table stores DSGVO-compliant activity log
 * - Session = Supabase JWT (auto-refresh) + local activity timeout
 *
 * Zero Netlify Function invocations for auth!
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hvgjdosdejnwkuyivnrq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2Z2pkb3NkZWpud2t1eWl2bnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODUzMzcsImV4cCI6MjA4NjM2MTMzN30.eKY0Yyl0Dquqa7FQHjalAQvbqwtWsEFDA1eHgwDp7JQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const SESSION_KEY = 'dooh_user';
const SESSION_TS_KEY = 'dooh_session_ts';

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8h (DSGVO-konform)

function roleFromGroupId(groupId) {
  if (groupId === 'grp_admin') return 'admin';
  if (groupId === 'grp_monteur') return 'monteur';
  return 'manager';
}

/**
 * Get headers with JWT Authorization for authenticated API calls.
 * Falls back to Content-Type only if no session exists.
 */
async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {
    // No session — will rely on origin check only
  }
  return headers;
}

/* ═══════════════════════════════════════════
   TAB & ACTION DEFINITIONS (for admin UI)
   ═══════════════════════════════════════════ */

export const ALL_TABS = [
  { id: 'displays',          label: 'Display Management',  parent: null },
  { id: 'displays.overview', label: 'Overview',            parent: 'displays' },
  { id: 'displays.list',     label: 'Displays',            parent: 'displays' },
  { id: 'displays.cities',   label: 'Städte',              parent: 'displays' },
  { id: 'hardware',                label: 'Hardware',              parent: null },
  { id: 'hardware.inventory',      label: 'Inventar',              parent: 'hardware' },
  { id: 'hardware.wareneingang',   label: 'Wareneingang',          parent: 'hardware' },
  { id: 'hardware.qr-codes',      label: 'QR-Codes',              parent: 'hardware' },
  { id: 'hardware.positionen',    label: 'Positionen',            parent: 'hardware' },
  { id: 'hardware.bestellwesen',  label: 'Bestellwesen',          parent: 'hardware' },
  { id: 'hardware.lager-versand', label: 'Lager & Versand',       parent: 'hardware' },
  { id: 'hardware.tracking',     label: 'Tracking',              parent: 'hardware' },
  { id: 'tasks',             label: 'Tasks',               parent: null },
  { id: 'communication',     label: 'Kommunikation',       parent: null },
  { id: 'installations',           label: 'Installationen',      parent: null },
  { id: 'installations.calendar',  label: 'Routen-Kalender',     parent: 'installations' },
  { id: 'installations.bookings',  label: 'Buchungen',           parent: 'installations' },
  { id: 'akquise-automation',      label: 'KI-Akquise Automation', parent: null },
  { id: 'admin',             label: 'Admin',               parent: null },
];

export const ALL_ACTIONS = [
  { id: 'view',           label: 'Dashboard anzeigen',     category: 'Allgemein' },
  { id: 'export',         label: 'Daten exportieren',      category: 'Allgemein' },
  { id: 'view_contacts',  label: 'Kontaktdaten einsehen',  category: 'Allgemein' },
  { id: 'view_revenue',   label: 'Umsätze einsehen',       category: 'Allgemein' },
  { id: 'create_task',    label: 'Task erstellen',         category: 'Tasks' },
  { id: 'edit_task',      label: 'Task bearbeiten',        category: 'Tasks' },
  { id: 'delete_task',    label: 'Task löschen',           category: 'Tasks' },
  { id: 'send_message',   label: 'Nachrichten senden',     category: 'Kommunikation' },
  { id: 'view_messages',  label: 'Nachrichten lesen',      category: 'Kommunikation' },
  { id: 'manage_schedule',     label: 'Routen verwalten',         category: 'Installationen' },
  { id: 'manage_bookings',    label: 'Buchungen verwalten',      category: 'Installationen' },
  { id: 'send_booking_invite', label: 'Buchungseinladung senden', category: 'Installationen' },
  { id: 'manage_hardware',     label: 'Hardware verwalten',        category: 'Hardware' },
  { id: 'manage_warehouse',    label: 'Wareneingang verwalten',    category: 'Hardware' },
  { id: 'manage_qr',           label: 'QR-Codes verwalten',        category: 'Hardware' },
  { id: 'manage_akquise_automation', label: 'KI-Akquise verwalten', category: 'Akquise' },
  { id: 'manage_users',   label: 'Benutzer verwalten',     category: 'Admin' },
  { id: 'manage_groups',  label: 'Gruppen verwalten',      category: 'Admin' },
  { id: 'settings',       label: 'Einstellungen ändern',   category: 'Admin' },
];

/* ═══════════════════════════════════════════
   IN-MEMORY CACHE  (avoid re-fetching)
   ═══════════════════════════════════════════ */

let _cachedGroups = null;
let _cachedUsers = null;
let _groupsPromise = null; // dedup parallel fetches

/* ═══════════════════════════════════════════
   SESSION MANAGEMENT
   ═══════════════════════════════════════════ */

function safeGetSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    // Activity-based timeout check
    const ts = localStorage.getItem(SESSION_TS_KEY);
    if (ts) {
      const elapsed = Date.now() - parseInt(ts, 10);
      if (elapsed > SESSION_TIMEOUT_MS) {
        const expired = JSON.parse(raw);
        writeAuditEntry('session_expired', `Automatischer Logout nach ${Math.round(elapsed / 60000)} Min.`, expired?.id, expired?.name);
        clearSession();
        return null;
      }
    }

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(user) {
  const data = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    groupId: user.groupId,
    groupName: user.groupName,
    group: user.group,
    authId: user.authId || null,
    installerTeam: user.installerTeam || null,
    mustChangePassword: user.mustChangePassword || false,
    passwordExpired: user.passwordExpired || false,
    passwordExpiresAt: user.passwordExpiresAt || null,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  localStorage.setItem(SESSION_TS_KEY, Date.now().toString());
}

export function touchSession() {
  if (localStorage.getItem(SESSION_KEY)) {
    localStorage.setItem(SESSION_TS_KEY, Date.now().toString());
  }
}

export function getSessionRemainingMs() {
  const ts = localStorage.getItem(SESSION_TS_KEY);
  if (!ts) return 0;
  return Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - parseInt(ts, 10)));
}

export function getSessionTimeoutMinutes() {
  return SESSION_TIMEOUT_MS / 60000;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_TS_KEY);
  // Clean up legacy sessionStorage entries (migration)
  try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_TS_KEY); } catch {}
}

/* ═══════════════════════════════════════════
   AUDIT LOG (direct Supabase insert – fast)
   ═══════════════════════════════════════════ */

/**
 * Write an audit log entry (fire-and-forget).
 * Exported so other components can log user actions too.
 */
export function writeAuditEntry(action, detail, userId, userName) {
  // Fire-and-forget – no await
  supabase.from('audit_log').insert({
    action,
    detail,
    user_id: userId || null,
    user_name: userName || '',
  }).then(() => {}).catch(() => {});
}

/** Convenience: log an action for the current user */
export function auditLog(action, detail) {
  const user = safeGetSession();
  writeAuditEntry(action, detail, user?.id, user?.name);
}

export async function getAuditLog(limit = 100) {
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(e => ({
      ts: e.created_at,
      action: e.action || '',
      detail: e.detail || '',
      userName: e.user_name || '',
      userId: e.user_id || '',
    }));
  } catch {
    return [];
  }
}

export function clearAuditLog() {
  // DSGVO: Audit log is permanent – intentional no-op
}

/* ═══════════════════════════════════════════
   AUTH – LOGIN / LOGOUT / PASSWORD
   ═══════════════════════════════════════════ */

/**
 * Login via Supabase Auth.
 * On success, fetches app_users profile + group config.
 */
export async function login(email, password) {
  if (!email || !password) {
    return { success: false, error: 'E-Mail und Passwort erforderlich' };
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      writeAuditEntry('login_failed', `Fehlgeschlagener Login: ${email}`, null, email);
      return { success: false, error: 'Ungültige E-Mail oder Passwort' };
    }

    // Fetch user profile from app_users + group config
    const { data: profile } = await supabase
      .from('app_users')
      .select('*, groups(*)')
      .eq('auth_id', authData.user.id)
      .single();

    if (!profile) {
      // Auth succeeded but no app_users entry – rare edge case
      writeAuditEntry('login_failed', `Kein Profil gefunden: ${email}`, null, email);
      await supabase.auth.signOut();
      return { success: false, error: 'Kein Benutzerprofil gefunden. Kontaktiere den Administrator.' };
    }

    // Check if active
    if (profile.active === false) {
      writeAuditEntry('login_blocked', `Deaktivierter Account: ${email}`, profile.id, profile.name);
      await supabase.auth.signOut();
      return { success: false, error: 'Account deaktiviert. Kontaktiere den Administrator.' };
    }

    // Update last login
    supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', profile.id).then(() => {});

    // Check password policy from Supabase Auth app_metadata
    const appMeta = authData.user?.app_metadata || {};
    const mustChangePassword = appMeta.must_change_password === true;
    const passwordExpiresAt = appMeta.password_expires_at ? new Date(appMeta.password_expires_at) : null;
    const passwordExpired = passwordExpiresAt ? passwordExpiresAt < new Date() : false;

    // Build user session object
    const group = profile.groups;
    const user = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: roleFromGroupId(profile.group_id),
      groupId: profile.group_id,
      groupName: group?.name || 'Operations',
      group: group ? {
        id: group.id,
        name: group.name,
        tabs: group.tabs || [],
        actions: group.actions || [],
        color: group.color || '#64748b',
        icon: group.icon || 'Users',
      } : null,
      authId: authData.user.id, // Supabase Auth ID for password policy updates
      installerTeam: profile.installer_team || null, // Monteur team assignment
      mustChangePassword,
      passwordExpired,
      passwordExpiresAt: passwordExpiresAt?.toISOString() || null,
    };

    saveSession(user);

    // Detailed audit logging
    if (mustChangePassword) {
      writeAuditEntry('login_force_pw_change', `Login (Passwort-Änderung erforderlich): ${user.name} (${email})`, profile.id, user.name);
    } else if (passwordExpired) {
      writeAuditEntry('login_pw_expired', `Login (Passwort abgelaufen): ${user.name} (${email})`, profile.id, user.name);
    } else {
      writeAuditEntry('login', `Login erfolgreich: ${user.name} (${email})`, profile.id, user.name);
    }

    return { success: true, user };
  } catch (err) {
    return { success: false, error: 'Verbindungsfehler. Bitte versuche es erneut.' };
  }
}

export async function logout() {
  const user = safeGetSession();
  if (user) {
    writeAuditEntry('logout', `Logout: ${user.name}`, user.id, user.name);
  }
  clearSession();
  await supabase.auth.signOut().catch(() => {});
}

/**
 * Simple hash function for password history comparison (client-side).
 * NOT for security — just to prevent obvious reuse without sending plaintext to server.
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_jet_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function changePassword(oldPassword, newPassword) {
  const session = safeGetSession();
  if (!session) return { success: false, error: 'Nicht angemeldet' };
  if (!oldPassword || !newPassword) return { success: false, error: 'Altes und neues Passwort erforderlich' };
  if (newPassword.length < 8) return { success: false, error: 'Neues Passwort muss mindestens 8 Zeichen haben' };

  // Check password strength
  let score = 0;
  if (newPassword.length >= 8) score++;
  if (newPassword.length >= 12) score++;
  if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score++;
  if (/[0-9]/.test(newPassword)) score++;
  if (/[^A-Za-z0-9]/.test(newPassword)) score++;
  if (score < 2) return { success: false, error: 'Passwort zu schwach. Verwende Groß-/Kleinbuchstaben, Zahlen und Sonderzeichen.' };

  try {
    // Hash the new password for history check
    const newHash = await hashPassword(newPassword);

    // Check password history (prevent reuse of last 5 passwords)
    if (session.authId) {
      try {
        const histRes = await fetch('/api/users/check-password-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authId: session.authId, passwordHash: newHash }),
        });
        const histData = await histRes.json();
        if (histData.isReused) {
          return { success: false, error: 'Dieses Passwort wurde bereits verwendet. Bitte wähle ein neues Passwort (letzte 5 werden geprüft).' };
        }
      } catch {
        // Non-critical: continue even if history check fails
      }
    }

    // Verify old password by re-authenticating
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: session.email,
      password: oldPassword,
    });
    if (verifyError) return { success: false, error: 'Altes Passwort ist falsch' };

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) return { success: false, error: updateError.message };

    // Update password policy metadata (mark as changed, add to history)
    if (session.authId) {
      try {
        await fetch('/api/users/password-changed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authId: session.authId, passwordHash: newHash }),
        });

        // Update session to reflect new policy state
        saveSession({
          ...session,
          mustChangePassword: false,
          passwordExpired: false,
          passwordExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch {
        // Non-critical
      }
    }

    let auditAction = 'password_changed';
    let auditDetail = `Passwort geändert: ${session.name}`;
    if (session.mustChangePassword) {
      auditAction = 'password_forced_change';
      auditDetail = `Pflicht-Passwortänderung (Erstlogin): ${session.name}`;
    } else if (session.passwordExpired) {
      auditAction = 'password_expired_change';
      auditDetail = `Passwort abgelaufen & geändert: ${session.name}`;
    }
    writeAuditEntry(auditAction, auditDetail, session.id, session.name);
    return { success: true };
  } catch {
    return { success: false, error: 'Verbindungsfehler' };
  }
}

/* ═══════════════════════════════════════════
   PASSWORD POLICY CHECKS
   ═══════════════════════════════════════════ */

/** Check if user needs to change their password (first login or expired) */
export function needsPasswordChange() {
  const session = safeGetSession();
  if (!session) return false;
  if (session.mustChangePassword) return true;
  if (session.passwordExpired) return true;
  if (session.passwordExpiresAt && new Date(session.passwordExpiresAt) < new Date()) return true;
  return false;
}

/** Get password policy reason (for UI display) */
export function getPasswordChangeReason() {
  const session = safeGetSession();
  if (!session) return null;
  if (session.mustChangePassword) return 'first_login';
  if (session.passwordExpired || (session.passwordExpiresAt && new Date(session.passwordExpiresAt) < new Date())) return 'expired';
  return null;
}

/** Get remaining days until password expires */
export function getPasswordExpiryDays() {
  const session = safeGetSession();
  if (!session?.passwordExpiresAt) return null;
  const diff = new Date(session.passwordExpiresAt) - new Date();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

/* ═══════════════════════════════════════════
   PASSWORD RESET (via Supabase magic link)
   ═══════════════════════════════════════════ */

/**
 * Send a password-reset email via Supabase Auth.
 * The user receives a link to set a new password.
 */
export async function requestPasswordReset(email) {
  if (!email) return { success: false, error: 'E-Mail-Adresse erforderlich' };

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/#reset` }
    );
    if (error) {
      // Don't reveal whether the email exists
      console.error('Password reset error:', error.message);
    }
    // Always show success to prevent email enumeration
    writeAuditEntry('password_reset_requested', `Reset angefordert: ${email}`, null, email);
    return { success: true };
  } catch {
    return { success: false, error: 'Verbindungsfehler. Bitte versuche es erneut.' };
  }
}

/* ═══════════════════════════════════════════
   SESSION RECOVERY (from Supabase Auth)
   ═══════════════════════════════════════════ */

/**
 * Attempt to recover an app session from an existing Supabase Auth session.
 * Called on app startup — if Supabase still has a valid JWT but our localStorage
 * session was lost (e.g. cleared by user), this re-fetches the profile and restores it.
 * Also handles migration from sessionStorage → localStorage.
 */
export async function recoverSession() {
  // 1) Migrate from old sessionStorage if present
  try {
    const oldRaw = sessionStorage.getItem(SESSION_KEY);
    if (oldRaw && !localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, oldRaw);
      const oldTs = sessionStorage.getItem(SESSION_TS_KEY);
      if (oldTs) localStorage.setItem(SESSION_TS_KEY, oldTs);
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_TS_KEY);
    }
  } catch {}

  // 2) If we already have a valid app session, just return it
  const existing = safeGetSession();
  if (existing) return existing;

  // 3) Check if Supabase Auth has a valid session (JWT in localStorage managed by Supabase)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    // Fetch user profile from app_users
    const { data: profile } = await supabase
      .from('app_users')
      .select('*, groups(*)')
      .eq('auth_id', session.user.id)
      .single();

    if (!profile || profile.active === false) return null;

    const group = profile.groups;
    const user = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: roleFromGroupId(profile.group_id),
      groupId: profile.group_id,
      groupName: group?.name || 'Operations',
      group: group ? {
        id: group.id,
        name: group.name,
        tabs: group.tabs || [],
        actions: group.actions || [],
        color: group.color || '#64748b',
        icon: group.icon || 'Users',
      } : null,
      authId: session.user.id,
      installerTeam: profile.installer_team || null,
      mustChangePassword: false,
      passwordExpired: false,
      passwordExpiresAt: null,
    };

    saveSession(user);
    return user;
  } catch (err) {
    console.warn('[Auth] Session recovery failed:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════
   PUBLIC API – SESSION QUERIES
   ═══════════════════════════════════════════ */

export function getCurrentUser() { return safeGetSession(); }
export function isAuthenticated() { return safeGetSession() !== null; }
export function isAdmin() { return safeGetSession()?.groupId === 'grp_admin'; }

/* ═══════════════════════════════════════════
   GROUP-BASED PERMISSIONS
   ═══════════════════════════════════════════ */

export function getCurrentGroup() {
  const user = safeGetSession();
  if (!user?.group) return null;
  return { ...user.group, id: user.groupId, name: user.groupName };
}

export function hasPermission(action) {
  // Admin always has all permissions
  if (isAdmin()) return true;
  return (getCurrentGroup()?.actions || []).includes(action);
}

export function canAccessTab(tabId) {
  // Admin always has access to all tabs
  if (isAdmin()) return true;
  return (getCurrentGroup()?.tabs || []).includes(tabId);
}

export function getVisibleTabs() { return getCurrentGroup()?.tabs || []; }
export function getAllowedActions() { return getCurrentGroup()?.actions || []; }

export function getPermissionsForRole(role) {
  const group = getCurrentGroup();
  if (!group) return [];
  return group.actions;
}

/* ═══════════════════════════════════════════
   GROUP MANAGEMENT (via Supabase)
   ═══════════════════════════════════════════ */

export async function fetchGroups() {
  if (_groupsPromise) return _groupsPromise;
  _groupsPromise = (async () => {
    try {
      const { data, error } = await supabase.from('groups').select('*').order('name');
      if (error) throw error;
      _cachedGroups = (data || []).map(g => ({
        id: g.id,
        name: g.name,
        description: g.description || '',
        color: g.color || '#64748b',
        icon: g.icon || 'Users',
        tabs: g.tabs || [],
        actions: g.actions || [],
        memberCount: 0,
      }));
      return _cachedGroups;
    } catch {
      return _cachedGroups || getDefaultGroups();
    } finally {
      _groupsPromise = null;
    }
  })();
  return _groupsPromise;
}

function getDefaultGroups() {
  return [
    { id: 'grp_admin', name: 'Admin', description: 'Vollzugriff', color: '#3b82f6', icon: 'Shield', tabs: [], actions: [], memberCount: 0 },
    { id: 'grp_operations', name: 'Operations', description: 'Display-Management & Tasks', color: '#22c55e', icon: 'Wrench', tabs: [], actions: [], memberCount: 0 },
    { id: 'grp_sales', name: 'Sales', description: 'Übersicht & Kommunikation', color: '#f59e0b', icon: 'TrendingUp', tabs: [], actions: [], memberCount: 0 },
    { id: 'grp_management', name: 'Management', description: 'Berichte', color: '#a855f7', icon: 'BarChart3', tabs: [], actions: [], memberCount: 0 },
    { id: 'grp_tech', name: 'Tech', description: 'Technische Tasks', color: '#06b6d4', icon: 'Code', tabs: [], actions: [], memberCount: 0 },
    { id: 'grp_scheduling', name: 'Terminierung', description: 'Installationstermine planen', color: '#f97316', icon: 'CalendarCheck', tabs: ['installations', 'installations.calendar', 'installations.bookings'], actions: ['manage_schedule', 'manage_bookings', 'send_booking_invite'], memberCount: 0 },
    { id: 'grp_partner', name: 'Partner / Logistik', description: 'Installations- und Hardware-Logistik Partner', color: '#10b981', icon: 'Truck', tabs: ['hardware', 'hardware.inventory', 'hardware.wareneingang', 'hardware.qr-codes', 'hardware.positionen', 'hardware.bestellwesen', 'hardware.lager-versand', 'hardware.tracking', 'installations', 'installations.calendar', 'installations.bookings'], actions: ['view', 'manage_hardware', 'manage_warehouse', 'manage_qr', 'manage_bookings'], memberCount: 0 },
    { id: 'grp_monteur', name: 'Monteur', description: 'Installations-Monteur — Tagesroute & Standort-Details', color: '#f97316', icon: 'Wrench', tabs: ['monteur'], actions: ['monteur:view_route', 'monteur:send_status'], memberCount: 0 },
  ];
}

export function getAllGroups() {
  return _cachedGroups || getDefaultGroups();
}

export function getGroupWithMembers(groupId) {
  const group = (_cachedGroups || []).find(g => g.id === groupId);
  if (!group) return null;
  const members = (_cachedUsers || []).filter(u => u.groupId === groupId);
  return { ...group, members };
}

// Groups are managed in DB – these show info messages
export function createGroup() { return { success: false, error: 'Gruppen werden in der Datenbank verwaltet' }; }
export function updateGroup() { return { success: false, error: 'Gruppen werden in der Datenbank verwaltet' }; }
export function deleteGroup() { return { success: false, error: 'Gruppen werden in der Datenbank verwaltet' }; }

/* ═══════════════════════════════════════════
   USER MANAGEMENT (via Supabase)
   ═══════════════════════════════════════════ */

export async function fetchAllUsers() {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*, groups(name, color, icon)')
      .order('name');
    if (error) throw error;

    _cachedUsers = (data || []).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      groupId: u.group_id,
      groupName: u.groups?.name || 'Operations',
      groupColor: u.groups?.color || '#64748b',
      groupIcon: u.groups?.icon || 'Users',
      active: u.active,
      lastLogin: u.last_login,
      authId: u.auth_id,
      installerTeam: u.installer_team || null,
    }));
    return _cachedUsers;
  } catch {
    return _cachedUsers || [];
  }
}

export function getAllUsers() {
  return _cachedUsers || [];
}

export async function addUser({ name, email, groupId, password, installerTeam }) {
  const currentUser = safeGetSession();

  try {
    // Use Netlify Function with service_role key (bypasses RLS)
    const res = await fetch('/api/users/add', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ name, email, groupId, password, installerTeam: installerTeam || null }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Fehler beim Erstellen' };
    }

    writeAuditEntry('user_created', `Benutzer erstellt: ${name} (${email})`, currentUser?.id, currentUser?.name);
    await fetchAllUsers();
    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, error: 'Verbindungsfehler' };
  }
}

export async function updateUserGroup(userId, newGroupId) {
  const currentUser = safeGetSession();

  try {
    const res = await fetch('/api/users/update', {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ userId, groupId: newGroupId }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Fehler beim Aktualisieren' };
    }

    writeAuditEntry('user_updated', `Gruppe geändert → ${newGroupId}`, currentUser?.id, currentUser?.name);
    await fetchAllUsers();

    // If updating own group, refresh session
    if (currentUser?.id === userId) {
      const groups = getAllGroups();
      const newGroup = groups.find(g => g.id === newGroupId);
      if (newGroup) {
        saveSession({ ...currentUser, groupId: newGroupId, groupName: newGroup.name, group: newGroup });
      }
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Verbindungsfehler' };
  }
}

export function updateUserRole(userId, newRole) {
  const roleGroupMap = { admin: 'grp_admin', manager: 'grp_operations', viewer: 'grp_management' };
  return updateUserGroup(userId, roleGroupMap[newRole] || 'grp_operations');
}

export async function resetUserPassword(userId) {
  const currentUser = safeGetSession();
  try {
    const user = (_cachedUsers || []).find(u => u.id === userId);
    if (!user) return { success: false, error: 'Benutzer nicht gefunden' };

    const res = await fetch('/api/users/reset', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Fehler beim Zurücksetzen' };
    }

    writeAuditEntry('password_reset', `Passwort zurückgesetzt: ${user.name} (${user.email})`, currentUser?.id, currentUser?.name);
    return { success: true, message: data.message || 'Passwort zurückgesetzt' };
  } catch {
    return { success: false, error: 'Verbindungsfehler' };
  }
}

export async function deleteUser(userId) {
  const currentUser = safeGetSession();
  if (currentUser?.id === userId) return { success: false, error: 'Eigenen Account kann man nicht löschen' };

  try {
    const user = (_cachedUsers || []).find(u => u.id === userId);

    const res = await fetch('/api/users/delete', {
      method: 'DELETE',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Fehler beim Löschen' };
    }

    writeAuditEntry('user_deleted', `Benutzer gelöscht: ${user?.name} (${user?.email})`, currentUser?.id, currentUser?.name);
    await fetchAllUsers();
    return { success: true };
  } catch {
    return { success: false, error: 'Verbindungsfehler' };
  }
}

/* ═══════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════ */

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}
