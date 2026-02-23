/**
 * MonteurView — Mobile-first daily route view for installation technicians.
 *
 * Two auth modes:
 *   1. Supabase JWT (persistent login) — monteur logs in once, stays logged in via localStorage
 *   2. HMAC token (legacy links) — /monteur?token=X&team=Y&date=Z
 *
 * iOS-App-Ready: Uses viewport meta, standalone detection, localStorage persistence,
 * and proper mobile touch handling for future Capacitor/PWA wrapping.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ── Supabase Client (same config as authService, but standalone for /monteur) ── */
const SUPABASE_URL = 'https://hvgjdosdejnwkuyivnrq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2Z2pkb3NkZWpud2t1eWl2bnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODUzMzcsImV4cCI6MjA4NjM2MTMzN30.eKY0Yyl0Dquqa7FQHjalAQvbqwtWsEFDA1eHgwDp7JQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── Brand Colors (matches BookingPage) ───────────────────── */
const BRAND = {
  orange: '#FF8000',
  orangeLight: '#FFF3E6',
  orangeMedium: '#FFE0B2',
  orangeDark: '#E67300',
  text: '#1A1A1A',
  textLight: '#666666',
  textMuted: '#999999',
  bg: '#F8FAFC',
  white: '#FFFFFF',
  green: '#22C55E',
  greenLight: '#ECFDF5',
  red: '#EF4444',
  redLight: '#FEF2F2',
  yellow: '#F59E0B',
  yellowLight: '#FFFBEB',
  blue: '#3B82F6',
  blueLight: '#EFF6FF',
};

const STATUS_COLORS = {
  booked:    { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Bestätigt' },
  confirmed: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Bestätigt' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Installiert' },
  cancelled: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Storniert' },
  no_show:   { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'No-Show' },
  pending:   { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Ausstehend' },
};

const MONTEUR_SESSION_KEY = 'monteur_auth';

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Create orange pin icon with time label for map markers */
function createMonteurPinIcon(time) {
  const svg = `<svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 28 16 28s16-16 16-28C32 7.16 24.84 0 16 0z"
          fill="#FF8000" stroke="#E67300" stroke-width="2"/>
    <circle cx="16" cy="16" r="7" fill="white" opacity="0.95"/>
    <text x="16" y="18" text-anchor="middle" fill="#FF8000" font-size="7" font-weight="bold" font-family="system-ui">${time || ''}</text>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: 'monteur-pin-icon',
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -44],
  });
}

/** Auto-fit map to markers */
function MapFitter({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [positions, map]);
  return null;
}

function formatDateDE(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Format a Date to YYYY-MM-DD using LOCAL timezone (not UTC) */
function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return localDateStr(new Date());
}

/* ── Login Screen Component ────────────────────────────────── */
function MonteurLoginScreen({ onLogin, loading: parentLoading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setError('E-Mail und Passwort erforderlich');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError('Ungültige E-Mail oder Passwort');
        setLoading(false);
        return;
      }

      // Fetch profile with team assignment
      const { data: profile, error: profileError } = await supabase
        .from('app_users')
        .select('*, groups(*)')
        .eq('auth_id', authData.user.id)
        .single();

      if (profileError || !profile) {
        setError('Kein Profil gefunden. Bitte Administrator kontaktieren.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (profile.active === false) {
        setError('Account deaktiviert. Bitte Administrator kontaktieren.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (!profile.installer_team) {
        setError('Kein Installations-Team zugewiesen. Bitte Administrator kontaktieren.');
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Save session to localStorage (persistent across browser closes)
      const session = {
        userId: profile.id,
        name: profile.name,
        email: profile.email,
        team: profile.installer_team,
        groupId: profile.group_id,
        authId: authData.user.id,
        accessToken: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
        expiresAt: authData.session.expires_at,
        savedAt: Date.now(),
      };
      localStorage.setItem(MONTEUR_SESSION_KEY, JSON.stringify(session));

      onLogin(session);
    } catch (err) {
      setError('Verbindungsfehler. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  }

  if (parentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BRAND.bg }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 rounded-full animate-spin"
            style={{ borderColor: BRAND.orangeMedium, borderTopColor: BRAND.orange }} />
          <p className="text-sm" style={{ color: BRAND.textLight }}>Session wird geprüft...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: BRAND.bg }}>
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ backgroundColor: BRAND.orange }}>
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold" style={{ color: BRAND.text }}>Monteur Login</h1>
          <p className="text-sm mt-1" style={{ color: BRAND.textLight }}>Lieferando Installations-Team</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border p-6 space-y-4" style={{ borderColor: '#E5E7EB' }}>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: BRAND.textLight }}>E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="monteur@lieferando.de"
              autoComplete="email"
              autoCapitalize="none"
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors"
              style={{ borderColor: '#D1D5DB' }}
              onFocus={(e) => e.target.style.borderColor = BRAND.orange}
              onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: BRAND.textLight }}>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort eingeben"
              autoComplete="current-password"
              className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors"
              style={{ borderColor: '#D1D5DB' }}
              onFocus={(e) => e.target.style.borderColor = BRAND.orange}
              onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg text-xs text-center" style={{ backgroundColor: BRAND.redLight, color: '#B91C1C' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{ backgroundColor: BRAND.orange, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center text-xs mt-4" style={{ color: BRAND.textMuted }}>
          Passwort vergessen? Bitte Administrator kontaktieren.
        </p>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────── */
export default function MonteurView() {
  const [authState, setAuthState] = useState('checking'); // 'checking' | 'login' | 'authenticated' | 'legacy'
  const [session, _setSession] = useState(null); // JWT session from localStorage
  const sessionRef = useRef(null);
  const setSession = useCallback((s) => { sessionRef.current = s; _setSession(s); }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const selectedDateRef = useRef(todayStr());
  const [expandedId, setExpandedId] = useState(null);
  const [gallery, setGallery] = useState({ open: false, images: [], index: 0 });
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'
  const [optimizedOrder, setOptimizedOrder] = useState(null); // sorted booking ids or null
  const [weekData, setWeekData] = useState(null); // { days: [{ date, count }] }
  const [sendingAction, setSendingAction] = useState(null);
  const [actionResult, setActionResult] = useState(null);

  // Extract legacy HMAC params from URL
  const legacyParams = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return {
      token: sp.get('token'),
      team: sp.get('team'),
      date: sp.get('date'),
    };
  }, []);

  // ── Check saved session on mount ──
  useEffect(() => {
    (async () => {
      // If URL has HMAC params, use legacy mode
      if (legacyParams.token && legacyParams.team && legacyParams.date) {
        setAuthState('legacy');
        return;
      }

      // Check localStorage for saved session
      try {
        const saved = localStorage.getItem(MONTEUR_SESSION_KEY);
        if (!saved) {
          setAuthState('login');
          return;
        }

        const parsed = JSON.parse(saved);
        if (!parsed.accessToken || !parsed.refreshToken) {
          localStorage.removeItem(MONTEUR_SESSION_KEY);
          setAuthState('login');
          return;
        }

        // Try to refresh the session
        const { data: refreshData, error: refreshError } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });

        if (refreshError || !refreshData?.session) {
          // Session expired — require re-login
          localStorage.removeItem(MONTEUR_SESSION_KEY);
          setAuthState('login');
          return;
        }

        // Update tokens in localStorage
        const updatedSession = {
          ...parsed,
          accessToken: refreshData.session.access_token,
          refreshToken: refreshData.session.refresh_token,
          expiresAt: refreshData.session.expires_at,
        };
        localStorage.setItem(MONTEUR_SESSION_KEY, JSON.stringify(updatedSession));
        setSession(updatedSession);
        setAuthState('authenticated');
      } catch {
        localStorage.removeItem(MONTEUR_SESSION_KEY);
        setAuthState('login');
      }
    })();
  }, [legacyParams]);

  // ── Auto-refresh token listener ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, supaSession) => {
      if (event === 'TOKEN_REFRESHED' && supaSession) {
        const saved = localStorage.getItem(MONTEUR_SESSION_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const updated = {
              ...parsed,
              accessToken: supaSession.access_token,
              refreshToken: supaSession.refresh_token,
              expiresAt: supaSession.expires_at,
            };
            localStorage.setItem(MONTEUR_SESSION_KEY, JSON.stringify(updated));
            setSession(updated);
          } catch { /* ignore */ }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load route data ──
  // Track current fetch to prevent race conditions
  const fetchIdRef = useRef(0);

  const loadRoute = useCallback(async (dateOverride) => {
    const date = dateOverride || selectedDateRef.current;
    const thisFetchId = ++fetchIdRef.current;
    console.log(`[MonteurView] loadRoute date=${date} fetchId=${thisFetchId}`);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      let res;

      if (authState === 'legacy') {
        // Legacy HMAC auth
        res = await fetch(
          `/api/install-monteur?token=${encodeURIComponent(legacyParams.token)}&team=${encodeURIComponent(legacyParams.team)}&date=${legacyParams.date}`,
          { cache: 'no-store' }
        );
      } else if (authState === 'authenticated' && sessionRef.current) {
        // JWT auth — always fetch fresh data (no browser cache)
        res = await fetch(
          `/api/install-monteur?date=${date}`,
          { headers: { 'Authorization': `Bearer ${sessionRef.current.accessToken}` }, cache: 'no-store' }
        );
      } else {
        setError('Nicht authentifiziert');
        setLoading(false);
        return;
      }

      // If a newer fetch was started, discard this result
      if (fetchIdRef.current !== thisFetchId) {
        console.log(`[MonteurView] Discarding stale fetch ${thisFetchId} (current=${fetchIdRef.current})`);
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // Session invalid — force re-login
          if (authState === 'authenticated') {
            localStorage.removeItem(MONTEUR_SESSION_KEY);
            setSession(null);
            setAuthState('login');
            return;
          }
        }
        setError(json.error || 'Fehler beim Laden der Routendaten.');
        setLoading(false);
        return;
      }

      // Only apply data if this fetch is still current
      if (fetchIdRef.current === thisFetchId) {
        setData(json);
      }
    } catch (e) {
      if (fetchIdRef.current === thisFetchId) {
        setError('Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung.');
      }
    } finally {
      if (fetchIdRef.current === thisFetchId) {
        setLoading(false);
      }
    }
  }, [authState, legacyParams]);

  // After data loads, resolve Airtable image URLs → permanent Supabase Storage URLs
  useEffect(() => {
    if (!data?.bookings?.length) return;
    const bookingsWithImages = data.bookings.filter(b => b.akquiseAirtableId && b.akquise?.images?.length > 0);
    const bookingsWithPdfs = data.bookings.filter(b => b.akquiseAirtableId && b.akquise?.vertragPdf?.length > 0);
    if (bookingsWithImages.length === 0 && bookingsWithPdfs.length === 0) return;

    (async () => {
      try {
        // Collect all record IDs for batch query
        const recordIds = [...new Set([...bookingsWithImages, ...bookingsWithPdfs].map(b => b.akquiseAirtableId))];

        // Batch fetch from attachment_cache: images + PDFs in one query
        const { data: cacheRows, error } = await supabase
          .from('attachment_cache')
          .select('airtable_record_id,airtable_field,original_filename,public_url')
          .in('airtable_record_id', recordIds)
          .in('airtable_field', ['images_akquise', 'Vertrag (PDF)']);

        if (error || !cacheRows?.length) return;

        // Build lookup: recordId|field → { filename → publicUrl }
        const lookup = new Map();
        for (const row of cacheRows) {
          const key = `${row.airtable_record_id}|${row.airtable_field}`;
          if (!lookup.has(key)) lookup.set(key, {});
          lookup.get(key)[row.original_filename] = row.public_url;
        }

        // Update bookings with resolved URLs
        const updatedBookings = data.bookings.map(b => {
          if (!b.akquiseAirtableId || !b.akquise) return b;

          const imgUrls = lookup.get(`${b.akquiseAirtableId}|images_akquise`) || {};
          const pdfUrls = lookup.get(`${b.akquiseAirtableId}|Vertrag (PDF)`) || {};

          const hasImageUpdates = b.akquise.images?.some(img => imgUrls[img.filename]);
          const hasPdfUpdates = b.akquise.vertragPdf?.some(pdf => pdfUrls[pdf.filename]);

          if (!hasImageUpdates && !hasPdfUpdates) return b;

          return {
            ...b,
            akquise: {
              ...b.akquise,
              images: b.akquise.images?.map(img => {
                const cachedUrl = imgUrls[img.filename];
                return cachedUrl ? { ...img, url: cachedUrl } : img;
              }) || [],
              vertragPdf: b.akquise.vertragPdf?.map(pdf => {
                const cachedUrl = pdfUrls[pdf.filename];
                return cachedUrl ? { ...pdf, url: cachedUrl } : pdf;
              }) || [],
            },
          };
        });

        // Only update if something actually changed
        if (updatedBookings.some((b, i) => b !== data.bookings[i])) {
          console.log(`[MonteurView] Resolved ${cacheRows.length} attachment URLs from Supabase Storage`);
          setData(prev => prev ? { ...prev, bookings: updatedBookings } : prev);
        }
      } catch (e) {
        console.warn('[MonteurView] Attachment resolution failed:', e.message);
      }
    })();
  }, [data?.bookings?.length, data?.date]); // Only when bookings change

  // Load data when auth state resolves
  useEffect(() => {
    if (authState === 'legacy' || authState === 'authenticated') {
      loadRoute();
    }
  }, [authState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gallery keyboard handler (ESC, arrow keys)
  useEffect(() => {
    if (!gallery.open) return;
    const handler = (e) => {
      if (e.key === 'Escape') setGallery(g => ({ ...g, open: false }));
      if (e.key === 'ArrowRight') setGallery(g => ({ ...g, index: (g.index + 1) % g.images.length }));
      if (e.key === 'ArrowLeft') setGallery(g => ({ ...g, index: (g.index - 1 + g.images.length) % g.images.length }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gallery.open, gallery.images.length]);

  // Load week overview (booking counts per day)
  const loadWeek = useCallback(async (dateForWeek) => {
    if (authState !== 'authenticated' || !sessionRef.current) return;
    try {
      const res = await fetch(
        `/api/install-monteur?date=${dateForWeek}&mode=week`,
        { headers: { 'Authorization': `Bearer ${sessionRef.current.accessToken}` }, cache: 'no-store' }
      );
      if (res.ok) {
        const json = await res.json();
        setWeekData(json);
      }
    } catch { /* silent */ }
  }, [authState]);

  // Load week data when day data loads
  useEffect(() => {
    if (data && authState === 'authenticated') {
      loadWeek(selectedDateRef.current);
    }
  }, [data?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Date change handler (JWT only)
  function handleDateChange(newDate) {
    console.log(`[MonteurView] handleDateChange: ${selectedDateRef.current} → ${newDate}`);
    selectedDateRef.current = newDate;
    setSelectedDate(newDate);
    setOptimizedOrder(null);
    loadRoute(newDate);
  }

  // Login callback
  function handleLogin(newSession) {
    setSession(newSession);
    setAuthState('authenticated');
  }

  // Logout
  async function handleLogout() {
    localStorage.removeItem(MONTEUR_SESSION_KEY);
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
    setData(null);
    setAuthState('login');
  }

  // WhatsApp action handler
  async function handleAction(bookingId, action, delayMinutes) {
    setSendingAction({ bookingId, action });
    setActionResult(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      const body = { bookingId, action };

      if (action === 'delay') body.delayMinutes = delayMinutes || 30;

      if (authState === 'authenticated' && sessionRef.current) {
        headers['Authorization'] = `Bearer ${sessionRef.current.accessToken}`;
      } else {
        // Legacy HMAC auth
        body.token = legacyParams.token;
        body.team = legacyParams.team;
        body.date = legacyParams.date;
      }

      const res = await fetch('/api/install-monteur/status', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const json = await res.json();
      setActionResult({
        bookingId,
        action,
        success: json.success,
        message: json.message || json.error || 'Unbekannter Fehler',
      });
    } catch (e) {
      setActionResult({
        bookingId,
        action,
        success: false,
        message: 'Verbindungsfehler. Bitte versuchen Sie es erneut.',
      });
    } finally {
      setSendingAction(null);
    }
  }

  // Google Maps URL builder
  function mapsUrl(booking) {
    const parts = [booking.street, booking.streetNumber, booking.postalCode, booking.city].filter(Boolean);
    if (parts.length === 0) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(' '))}`;
  }

  // Nearest-neighbor TSP optimization
  function optimizeRoute() {
    if (!data?.bookings?.length) return;
    const withCoords = data.bookings.filter(b => b.akquise?.latitude && b.akquise?.longitude);
    if (withCoords.length < 2) return;

    const visited = new Set();
    const order = [];
    // Start with the first booking (by time)
    let current = withCoords[0];
    visited.add(current.id);
    order.push(current.id);

    while (visited.size < withCoords.length) {
      let nearest = null;
      let nearestDist = Infinity;
      for (const b of withCoords) {
        if (visited.has(b.id)) continue;
        const d = haversineKm(current.akquise.latitude, current.akquise.longitude, b.akquise.latitude, b.akquise.longitude);
        if (d < nearestDist) { nearestDist = d; nearest = b; }
      }
      if (nearest) { visited.add(nearest.id); order.push(nearest.id); current = nearest; }
    }
    // Also add bookings without coords at the end
    for (const b of data.bookings) {
      if (!order.includes(b.id)) order.push(b.id);
    }
    setOptimizedOrder(order);
  }

  // Build Google Maps multi-waypoint URL from current booking order
  function buildGoogleMapsRouteUrl(bookings) {
    const addresses = bookings
      .map(b => [b.street, b.streetNumber, b.postalCode, b.city].filter(Boolean).join(' '))
      .filter(a => a.length > 3);
    if (addresses.length < 2) return null;
    // Google Maps Directions: origin / waypoints / destination
    const origin = encodeURIComponent(addresses[0]);
    const destination = encodeURIComponent(addresses[addresses.length - 1]);
    const waypoints = addresses.slice(1, -1).map(a => encodeURIComponent(a)).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    url += '&travelmode=driving';
    return url;
  }

  /* ── Show Login Screen if not authenticated ────────────── */
  if (authState === 'checking') {
    return <MonteurLoginScreen onLogin={handleLogin} loading={true} />;
  }

  if (authState === 'login') {
    return <MonteurLoginScreen onLogin={handleLogin} loading={false} />;
  }

  /* ── Main Route View ────────────────────────────────────── */
  const isJWT = authState === 'authenticated';
  const displayDate = isJWT ? selectedDate : (data?.date || legacyParams.date);
  const displayTeam = isJWT ? session?.team : (data?.team || legacyParams.team);

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.bg }}>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b px-4 py-3 shadow-sm" style={{ backgroundColor: BRAND.white, borderColor: BRAND.orangeMedium }}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold" style={{ color: BRAND.orange }}>
                Lieferando Monteur
              </h1>
              <p className="text-xs mt-0.5" style={{ color: BRAND.textLight }}>
                {isJWT ? `${session?.name} — Team: ${displayTeam}` : `Team: ${displayTeam}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-xs font-medium" style={{ color: BRAND.text }}>
                  {formatDateDE(displayDate)}
                </p>
                {data && (
                  <p className="text-xs mt-0.5" style={{ color: BRAND.textLight }}>
                    {data.bookingCount} {data.bookingCount === 1 ? 'Termin' : 'Termine'}
                  </p>
                )}
              </div>
              {isJWT && (
                <button
                  onClick={handleLogout}
                  className="ml-2 p-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: '#D1D5DB' }}
                  title="Abmelden"
                >
                  <svg className="w-4 h-4" style={{ color: BRAND.textMuted }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Week Calendar Strip (JWT mode only) */}
          {isJWT && (() => {
            // Calculate Monday of the week containing selectedDate
            const sel = new Date(selectedDate + 'T00:00:00');
            const dow = sel.getDay(); // 0=Sun
            const mondayOffset = dow === 0 ? -6 : 1 - dow;
            const monday = new Date(sel);
            monday.setDate(sel.getDate() + mondayOffset);
            const today = todayStr();
            const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

            // Build 7 days starting from Monday
            const days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(monday);
              d.setDate(monday.getDate() + i);
              const dateStr = localDateStr(d);
              const weekDay = weekData?.days?.find(wd => wd.date === dateStr);
              return { date: dateStr, day: d.getDate(), label: dayLabels[i], count: weekDay?.count ?? null };
            });

            // Week navigation: shift by 7 days
            const prevWeek = () => {
              const d = new Date(monday);
              d.setDate(d.getDate() - 7);
              const newDate = localDateStr(d);
              handleDateChange(newDate);
              loadWeek(newDate);
            };
            const nextWeek = () => {
              const d = new Date(monday);
              d.setDate(d.getDate() + 7);
              const newDate = localDateStr(d);
              handleDateChange(newDate);
              loadWeek(newDate);
            };

            return (
              <div className="mt-2">
                {/* Week nav row */}
                <div className="flex items-center justify-between mb-1">
                  <button onClick={prevWeek} className="p-1 rounded-lg" style={{ color: BRAND.textLight }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { handleDateChange(today); loadWeek(today); }}
                    className="text-xs font-medium px-2 py-0.5 rounded-lg transition-colors"
                    style={{
                      color: selectedDate === today ? BRAND.white : BRAND.orange,
                      backgroundColor: selectedDate === today ? BRAND.orange : 'transparent',
                    }}
                  >
                    Heute
                  </button>
                  <button onClick={nextWeek} className="p-1 rounded-lg" style={{ color: BRAND.textLight }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                  {days.map(d => {
                    const isSelected = d.date === selectedDate;
                    const isToday = d.date === today;
                    const hasBookings = d.count !== null && d.count > 0;

                    return (
                      <button
                        key={d.date}
                        onClick={() => handleDateChange(d.date)}
                        className="flex flex-col items-center py-1.5 rounded-lg transition-all"
                        style={{
                          backgroundColor: isSelected ? BRAND.orange : isToday ? BRAND.orangeLight : 'transparent',
                          color: isSelected ? BRAND.white : BRAND.text,
                        }}
                      >
                        <span className="text-[10px] font-medium" style={{
                          color: isSelected ? 'rgba(255,255,255,0.8)' : BRAND.textMuted,
                        }}>
                          {d.label}
                        </span>
                        <span className="text-sm font-bold leading-tight">{d.day}</span>
                        {d.count !== null && (
                          <span className="text-[9px] font-semibold leading-tight mt-0.5" style={{
                            color: isSelected ? 'rgba(255,255,255,0.9)' : hasBookings ? BRAND.orange : BRAND.textMuted,
                          }}>
                            {d.count}
                          </span>
                        )}
                        {d.count === null && weekData && (
                          <span className="text-[9px] leading-tight mt-0.5" style={{ color: BRAND.textMuted }}>-</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 rounded-full animate-spin"
              style={{ borderColor: BRAND.orangeMedium, borderTopColor: BRAND.orange }} />
            <p className="mt-4 text-sm" style={{ color: BRAND.textLight }}>Route wird geladen...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-center" style={{ borderColor: '#FEE2E2' }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: BRAND.redLight }}>
              <svg className="w-8 h-8" style={{ color: BRAND.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: BRAND.textLight }}>{error}</p>
            {isJWT && (
              <button onClick={() => loadRoute()} className="mt-3 px-4 py-2 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: BRAND.orange }}>
                Erneut versuchen
              </button>
            )}
          </div>
        )}

        {/* No bookings */}
        {data && data.bookingCount === 0 && !loading && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-center" style={{ borderColor: BRAND.orangeMedium }}>
            <p className="text-lg font-bold" style={{ color: BRAND.text }}>Keine Termine</p>
            <p className="text-sm mt-1" style={{ color: BRAND.textLight }}>
              {isJWT ? `Für ${formatDateDE(selectedDate)} sind keine Installationstermine geplant.` : 'Für heute sind keine Installationstermine geplant.'}
            </p>
          </div>
        )}

        {/* View Toggle + Booking Cards / Map */}
        {data && data.bookings && data.bookings.length > 0 && (
          <div>
            {/* List / Map Toggle */}
            <div className="flex gap-1 mb-3 bg-white rounded-lg p-1 border" style={{ borderColor: '#E5E7EB' }}>
              <button
                onClick={() => setViewMode('list')}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: viewMode === 'list' ? BRAND.orange : 'transparent',
                  color: viewMode === 'list' ? BRAND.white : BRAND.textLight,
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Liste
              </button>
              <button
                onClick={() => setViewMode('map')}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: viewMode === 'map' ? BRAND.orange : 'transparent',
                  color: viewMode === 'map' ? BRAND.white : BRAND.textLight,
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Karte
              </button>
            </div>

            {/* ── Map View ── */}
            {viewMode === 'map' && (() => {
              const bookingsWithCoords = data.bookings.filter(b =>
                b.akquise?.latitude && b.akquise?.longitude
              );
              const positions = bookingsWithCoords.map(b => [b.akquise.latitude, b.akquise.longitude]);

              if (bookingsWithCoords.length === 0) {
                return (
                  <div className="bg-white rounded-xl border p-6 text-center" style={{ borderColor: '#E5E7EB' }}>
                    <p className="text-sm" style={{ color: BRAND.textLight }}>
                      Keine Koordinaten verfügbar. Bitte zur Listenansicht wechseln.
                    </p>
                  </div>
                );
              }

              return (
                <div className="rounded-xl overflow-hidden border shadow-sm" style={{ borderColor: '#E5E7EB', height: '60vh' }}>
                  <MapContainer
                    center={positions[0]}
                    zoom={12}
                    style={{ width: '100%', height: '100%' }}
                    zoomControl={false}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapFitter positions={positions} />
                    {bookingsWithCoords.map((b, idx) => (
                      <Marker
                        key={b.id}
                        position={[b.akquise.latitude, b.akquise.longitude]}
                        icon={createMonteurPinIcon(b.bookedTime?.slice(0, 5))}
                      >
                        <Popup>
                          <div className="text-sm min-w-[180px]">
                            <p className="font-bold" style={{ color: BRAND.orange }}>{b.bookedTime || '--:--'}</p>
                            <p className="font-semibold mt-0.5">{b.locationName || 'Unbekannt'}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {[b.street, b.streetNumber].filter(Boolean).join(' ')}, {b.postalCode} {b.city}
                            </p>
                            {b.contactName && <p className="text-xs mt-1">{b.contactName}</p>}
                            {b.contactPhone && (
                              <a href={`tel:${b.contactPhone}`} className="text-xs underline" style={{ color: BRAND.blue }}>
                                {b.contactPhone}
                              </a>
                            )}
                            {mapsUrl(b) && (
                              <a href={mapsUrl(b)} target="_blank" rel="noopener noreferrer"
                                className="block mt-1 text-xs underline" style={{ color: BRAND.blue }}>
                                Route anzeigen
                              </a>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              );
            })()}

            {/* ── List View ── */}
            {viewMode === 'list' && (() => {
              // Helper: is this booking already installed/completed?
              const isDone = (b) =>
                b.status === 'completed' ||
                /installiert|live|erfolgreich/i.test(b._statusInstallation || '');

              // Apply optimized order if active, then sort installed to bottom
              let displayBookings = optimizedOrder
                ? [...data.bookings].sort((a, b) => optimizedOrder.indexOf(a.id) - optimizedOrder.indexOf(b.id))
                : [...data.bookings];

              // Sort: open bookings first, installed/completed at the bottom
              displayBookings.sort((a, b) => {
                const aDone = isDone(a) ? 1 : 0;
                const bDone = isDone(b) ? 1 : 0;
                return aDone - bDone;
              });

              // Calculate total route distance
              const totalKm = (() => {
                let total = 0;
                for (let i = 1; i < displayBookings.length; i++) {
                  const prev = displayBookings[i - 1];
                  const curr = displayBookings[i];
                  if (prev.akquise?.latitude && prev.akquise?.longitude && curr.akquise?.latitude && curr.akquise?.longitude) {
                    total += haversineKm(prev.akquise.latitude, prev.akquise.longitude, curr.akquise.latitude, curr.akquise.longitude);
                  }
                }
                return total;
              })();

              const routeUrl = buildGoogleMapsRouteUrl(displayBookings);

              return (
          <div className="space-y-0">
            {/* Route Optimization Bar */}
            {data.bookings.some(b => b.akquise?.latitude && b.akquise?.longitude) && (
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => optimizedOrder ? setOptimizedOrder(null) : optimizeRoute()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition-colors"
                  style={{
                    borderColor: optimizedOrder ? BRAND.green : BRAND.orange,
                    backgroundColor: optimizedOrder ? BRAND.greenLight : BRAND.orangeLight,
                    color: optimizedOrder ? '#15803D' : BRAND.orangeDark,
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  {optimizedOrder ? `Optimiert (${totalKm.toFixed(1)} km)` : 'Route optimieren'}
                </button>
                {routeUrl && (
                  <a
                    href={routeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-white"
                    style={{ backgroundColor: BRAND.blue }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Maps
                  </a>
                )}
              </div>
            )}

            {/* Separator before "done" section */}
            {(() => {
              const firstDoneIdx = displayBookings.findIndex(b => isDone(b));
              const hasOpen = firstDoneIdx > 0 || (firstDoneIdx === -1 && displayBookings.length > 0);
              const hasDone = firstDoneIdx >= 0;
              if (hasOpen && hasDone) {
                return { firstDoneIdx };
              }
              return null;
            })() && null /* separator is rendered inline below */}

            {displayBookings.map((b, idx) => {
              const isExpanded = expandedId === b.id;
              const statusStyle = STATUS_COLORS[b.status] || STATUS_COLORS.pending;
              const address = [b.street, b.streetNumber].filter(Boolean).join(' ');
              const fullAddress = [address, b.postalCode, b.city].filter(Boolean).join(', ');
              const mapLink = mapsUrl(b);
              const isSending = sendingAction?.bookingId === b.id;
              const result = actionResult?.bookingId === b.id ? actionResult : null;
              const bookingDone = isDone(b);
              // Check if this is the first "done" booking → show separator
              const isFirstDone = bookingDone && (idx === 0 || !isDone(displayBookings[idx - 1]));

              // Distance to previous booking
              const prevBooking = idx > 0 ? displayBookings[idx - 1] : null;
              const distanceInfo = (() => {
                if (!prevBooking) return null;
                const lat1 = prevBooking.akquise?.latitude;
                const lon1 = prevBooking.akquise?.longitude;
                const lat2 = b.akquise?.latitude;
                const lon2 = b.akquise?.longitude;
                if (!lat1 || !lon1 || !lat2 || !lon2) return null;
                const km = haversineKm(lat1, lon1, lat2, lon2);
                const mins = Math.round(km / 30 * 60); // ~30km/h city traffic
                return { km: km.toFixed(1), mins };
              })();

              return (
                <React.Fragment key={b.id}>
                {/* "Erledigt" separator before first done booking */}
                {isFirstDone && idx > 0 && (
                  <div className="flex items-center gap-3 py-3 mt-2">
                    <div className="flex-1 h-px bg-gray-300" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">✓ Erledigt</span>
                    <div className="flex-1 h-px bg-gray-300" />
                  </div>
                )}
                {/* Distance divider */}
                {distanceInfo && !isFirstDone && (
                  <div className="flex items-center justify-center py-1.5">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
                      style={{ backgroundColor: BRAND.blueLight, color: BRAND.blue }}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      {distanceInfo.km} km · ~{distanceInfo.mins} min
                    </div>
                  </div>
                )}
                {!distanceInfo && idx > 0 && !isFirstDone && <div className="h-3" />}
                <div className={`rounded-xl shadow-sm border overflow-hidden ${bookingDone ? 'opacity-50' : ''}`}
                  style={{
                    borderColor: bookingDone ? '#D1D5DB' : '#E5E7EB',
                    backgroundColor: bookingDone ? '#F9FAFB' : '#FFFFFF',
                  }}>
                  {/* Card Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Time + Number */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: bookingDone ? '#F3F4F6' : BRAND.orangeLight,
                              color: bookingDone ? '#9CA3AF' : BRAND.orange,
                              textDecoration: bookingDone ? 'line-through' : 'none',
                            }}>
                            {b.bookedTime || '--:--'}
                          </span>
                          <span className="text-xs" style={{ color: BRAND.textMuted }}>
                            bis {b.bookedEndTime || '--:--'}
                          </span>
                          <span className="text-xs" style={{ color: BRAND.textMuted }}>
                            #{idx + 1}
                          </span>
                        </div>

                        {/* Location Name */}
                        <h3 className="text-base font-semibold truncate" style={{ color: BRAND.text }}>
                          {b.locationName || 'Unbekannter Standort'}
                        </h3>

                        {/* Address — clickable to Maps */}
                        {fullAddress && (
                          mapLink ? (
                            <a href={mapLink} target="_blank" rel="noopener noreferrer"
                              className="text-sm underline flex items-center gap-1 mt-0.5"
                              style={{ color: BRAND.blue }}>
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {fullAddress}
                            </a>
                          ) : (
                            <p className="text-sm mt-0.5" style={{ color: BRAND.textLight }}>{fullAddress}</p>
                          )
                        )}

                        {/* Contact */}
                        {b.contactName && (
                          <p className="text-sm mt-1 flex items-center gap-1" style={{ color: BRAND.textLight }}>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {b.contactName}
                          </p>
                        )}
                        {b.contactPhone && (
                          <p className="text-sm mt-0.5 flex items-center gap-1" style={{ color: BRAND.textLight }}>
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <a href={`tel:${b.contactPhone}`} className="underline" style={{ color: BRAND.blue }}>
                              {b.contactPhone}
                            </a>
                          </p>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                          {statusStyle.label}
                        </span>
                        {b._statusInstallation && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            /installiert|live|erfolgreich/i.test(b._statusInstallation)
                              ? 'bg-emerald-100 text-emerald-700'
                              : /abgebrochen|fehlgeschlagen/i.test(b._statusInstallation)
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {/installiert|live|erfolgreich/i.test(b._statusInstallation) ? '✓' : 'ℹ'} {b._statusInstallation}
                          </span>
                        )}
                        {!b._statusInstallation && b.status === 'completed' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            ✓ Installiert
                          </span>
                        )}
                        {b._isAirtable && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">AT</span>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons: Navigate + Call (hidden for done bookings) */}
                    {!bookingDone && (
                    <div className="flex gap-2 mt-2">
                      {mapLink && (
                        <a href={mapLink} target="_blank" rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white"
                          style={{ backgroundColor: BRAND.blue }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Route anzeigen
                        </a>
                      )}
                      {b.contactPhone && (
                        <a href={`tel:${b.contactPhone}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white"
                          style={{ backgroundColor: BRAND.green }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          Anrufen
                        </a>
                      )}
                    </div>
                    )}

                    {/* Notes */}
                    {b.notes && (
                      <div className="mt-2 p-2 rounded-lg text-xs" style={{ backgroundColor: BRAND.yellowLight, color: '#92400E' }}>
                        {b.notes}
                      </div>
                    )}

                    {/* Expand/collapse button */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      className="mt-2 flex items-center gap-1 text-xs font-medium"
                      style={{ color: BRAND.orange }}
                    >
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      {isExpanded ? 'Details ausblenden' : 'Details & Akquise anzeigen'}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 space-y-3" style={{ backgroundColor: '#FAFBFC', borderColor: '#E5E7EB' }}>
                      {/* Akquise Images */}
                      {b.akquise?.images?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-1.5" style={{ color: BRAND.textLight }}>Fotos ({b.akquise.images.length})</p>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {b.akquise.images.map((img, i) => (
                              <button key={i}
                                onClick={() => setGallery({ open: true, images: b.akquise.images, index: i })}
                                className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border bg-gray-50 cursor-pointer hover:ring-2 hover:ring-orange-400 transition-all">
                                <img src={img.url} alt={img.filename || `Foto ${i + 1}`}
                                  className="w-full h-full object-cover" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Contract PDF */}
                      {b.akquise?.vertragPdf?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-1" style={{ color: BRAND.textLight }}>Vertrag</p>
                          {b.akquise.vertragPdf.map((pdf, i) => (
                            <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm underline"
                              style={{ color: BRAND.blue }}>
                              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              {pdf.filename || 'Vertrag.pdf'}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Installation Info */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {b.akquise?.mountType && (
                          <div>
                            <span style={{ color: BRAND.textMuted }}>Montage:</span>
                            <span className="ml-1 font-medium" style={{ color: BRAND.text }}>{b.akquise.mountType}</span>
                          </div>
                        )}
                        {b.akquise?.schaufenster && (
                          <div>
                            <span style={{ color: BRAND.textMuted }}>Schaufenster:</span>
                            <span className="ml-1 font-medium" style={{ color: BRAND.text }}>{b.akquise.schaufenster}</span>
                          </div>
                        )}
                        {b.akquise?.steckdoseMitStrom && (
                          <div>
                            <span style={{ color: BRAND.textMuted }}>Steckdose:</span>
                            <span className="ml-1 font-medium" style={{ color: BRAND.text }}>{b.akquise.steckdoseMitStrom}</span>
                          </div>
                        )}
                        {b.akquise?.fensterbreiteAusreichend && (
                          <div>
                            <span style={{ color: BRAND.textMuted }}>Fensterbreite:</span>
                            <span className="ml-1 font-medium" style={{ color: BRAND.text }}>{b.akquise.fensterbreiteAusreichend}</span>
                          </div>
                        )}
                      </div>

                      {/* Hindernisse */}
                      {b.akquise?.hindernisse && b.akquise.hindernisse !== 'Nein' && (
                        <div className="p-2 rounded-lg text-xs border" style={{ backgroundColor: BRAND.redLight, borderColor: '#FECACA' }}>
                          <span className="font-semibold" style={{ color: BRAND.red }}>Hindernisse: </span>
                          <span style={{ color: '#B91C1C' }}>{b.akquise.hindernisseBeschreibung || b.akquise.hindernisse}</span>
                        </div>
                      )}

                      {/* Akquise Comments */}
                      {(b.akquise?.akquiseKommentar || b.akquise?.kommentarAusInstallationen || b.akquise?.frequencyApprovalComment) && (
                        <div>
                          <p className="text-xs font-semibold mb-1" style={{ color: BRAND.textLight }}>Kommentare</p>
                          <div className="space-y-1 text-xs" style={{ color: BRAND.text }}>
                            {b.akquise.akquiseKommentar && <p>{b.akquise.akquiseKommentar}</p>}
                            {b.akquise.kommentarAusInstallationen && <p>{b.akquise.kommentarAusInstallationen}</p>}
                            {b.akquise.frequencyApprovalComment && <p>{b.akquise.frequencyApprovalComment}</p>}
                          </div>
                        </div>
                      )}

                      {/* Streetview Link */}
                      {b.akquise?.streetviewLink && (
                        <a href={b.akquise.streetviewLink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs underline" style={{ color: BRAND.blue }}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Google Street View
                        </a>
                      )}

                      {/* WhatsApp Action Buttons (hidden for completed/installed bookings) */}
                      {!bookingDone && (
                      <div className="pt-2 border-t" style={{ borderColor: '#E5E7EB' }}>
                        {/* Primary: "Auf dem Weg" Button — full width, prominent */}
                        <button
                          onClick={() => {
                            if (confirm(`"Auf dem Weg"-Nachricht an ${b.contactName || b.locationName || 'Standort'} senden?`)) handleAction(b.id, 'on_the_way');
                          }}
                          disabled={isSending}
                          className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold border-2 transition-all mb-2"
                          style={{
                            borderColor: '#22C55E',
                            color: '#fff',
                            backgroundColor: isSending && sendingAction?.action === 'on_the_way' ? '#86EFAC' : '#22C55E',
                            opacity: isSending && sendingAction?.action !== 'on_the_way' ? 0.5 : 1,
                          }}
                        >
                          {isSending && sendingAction?.action === 'on_the_way' ? '⏳ Wird gesendet...' : '🚗 Auf dem Weg — WhatsApp senden'}
                        </button>

                        {/* Secondary Actions */}
                        <p className="text-xs font-semibold mb-2" style={{ color: BRAND.textLight }}>
                          Weitere Aktionen
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const mins = prompt('Verspätung in Minuten:', '30');
                              if (mins !== null) handleAction(b.id, 'delay', parseInt(mins) || 30);
                            }}
                            disabled={isSending}
                            className="flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors"
                            style={{
                              borderColor: BRAND.yellow,
                              color: '#92400E',
                              backgroundColor: BRAND.yellowLight,
                              opacity: isSending ? 0.5 : 1,
                            }}
                          >
                            {isSending && sendingAction?.action === 'delay' ? '...' : '\u{1F552} Verspätung'}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Verschiebung per WhatsApp ankündigen?')) handleAction(b.id, 'reschedule');
                            }}
                            disabled={isSending}
                            className="flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors"
                            style={{
                              borderColor: BRAND.blue,
                              color: '#1E40AF',
                              backgroundColor: BRAND.blueLight,
                              opacity: isSending ? 0.5 : 1,
                            }}
                          >
                            {isSending && sendingAction?.action === 'reschedule' ? '...' : '\u{1F4C5} Verschieben'}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Absage per WhatsApp ankündigen? Dies kann nicht rückgängig gemacht werden.')) handleAction(b.id, 'cancel');
                            }}
                            disabled={isSending}
                            className="flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors"
                            style={{
                              borderColor: BRAND.red,
                              color: '#B91C1C',
                              backgroundColor: BRAND.redLight,
                              opacity: isSending ? 0.5 : 1,
                            }}
                          >
                            {isSending && sendingAction?.action === 'cancel' ? '...' : '\u2716 Absage'}
                          </button>
                        </div>

                        {/* Action Result */}
                        {result && (
                          <div className={`mt-2 p-2 rounded-lg text-xs text-center ${
                            result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {result.success ? '\u2705 ' : '\u274C '}{result.message}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  )}
                </div>
                </React.Fragment>
              );
            })}
          </div>
              );
            })()}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 pb-8">
          <p className="text-xs" style={{ color: BRAND.textMuted }}>
            Lieferando Installations-Team — powered by JET Germany
          </p>
          {isJWT && (
            <p className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
              Eingeloggt als {session?.name}
            </p>
          )}
        </div>
      </main>

      {/* ── Fullscreen Image Gallery Overlay ── */}
      {gallery.open && gallery.images.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
          onClick={() => setGallery(g => ({ ...g, open: false }))}
        >
          {/* Close button */}
          <button
            onClick={() => setGallery(g => ({ ...g, open: false }))}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full text-white/80 text-sm font-medium" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            {gallery.index + 1} / {gallery.images.length}
          </div>

          {/* Previous button */}
          {gallery.images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setGallery(g => ({ ...g, index: (g.index - 1 + g.images.length) % g.images.length })); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Main image */}
          <img
            src={gallery.images[gallery.index]?.url}
            alt={gallery.images[gallery.index]?.filename || ''}
            className="max-w-full max-h-full object-contain select-none"
            style={{ maxHeight: 'calc(100vh - 80px)', maxWidth: 'calc(100vw - 80px)' }}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />

          {/* Next button */}
          {gallery.images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setGallery(g => ({ ...g, index: (g.index + 1) % g.images.length })); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Thumbnail strip at bottom */}
          {gallery.images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-3 py-2 rounded-2xl" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              {gallery.images.map((img, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setGallery(g => ({ ...g, index: i })); }}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                    i === gallery.index ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
