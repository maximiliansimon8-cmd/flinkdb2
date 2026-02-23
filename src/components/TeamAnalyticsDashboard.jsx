import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, Calendar, Clock, Users, Phone, Send, MessageSquare,
  RefreshCw, Loader2, ArrowUp, ArrowDown, LogIn, CheckCircle,
  XCircle, AlertCircle, CalendarClock, Filter, ChevronDown,
  Activity, PhoneCall, Bot, ExternalLink,
} from 'lucide-react';
import { supabase, getCurrentUser } from '../utils/authService';

/* ── Farben für Quellen ── */
const SOURCE_COLORS = {
  bot:          '#3b82f6', // Blau — WhatsApp Bot
  self_booking: '#3b82f6',
  portal:       '#22c55e', // Grün — Telefon
  airtable:     '#22c55e', // Grün — Telefon (aus Airtable = auch Telefon)
  unknown:      '#6b7280', // Grau
};

const SOURCE_LABELS = {
  bot:          'WhatsApp Bot',
  self_booking: 'WhatsApp Bot',
  portal:       'Telefon',
  airtable:     'Telefon',
  unknown:      'Unbekannt',
};

/* ── Zeitraum-Optionen ── */
const RANGES = [
  { id: 'today', label: 'Heute',   days: 1 },
  { id: '7d',    label: '7 Tage',  days: 7 },
  { id: '30d',   label: '30 Tage', days: 30 },
  { id: '90d',   label: '90 Tage', days: 90 },
];

/* ── Action Icons ── */
const ACTION_ICONS = {
  invite_sent:             Send,
  reminder_sent:           Clock,
  phone_call:              PhoneCall,
  booking_created:         Calendar,
  booking_confirmed:       CheckCircle,
  booking_cancelled:       XCircle,
  booking_completed:       CheckCircle,
  booking_rescheduled:     CalendarClock,
  status_changed:          Activity,
  airtable_termin_created: ExternalLink,
};

const ACTION_LABELS = {
  invite_sent:             'WA-Einladung',
  reminder_sent:           'Erinnerung',
  phone_call:              'Anruf',
  booking_created:         'Termin erstellt',
  booking_confirmed:       'Termin bestätigt',
  booking_cancelled:       'Termin storniert',
  booking_completed:       'Termin abgeschlossen',
  booking_rescheduled:     'Termin umgebucht',
  status_changed:          'Status geändert',
  airtable_termin_created: 'Airtable-Termin',
};

const ACTION_COLORS = {
  invite_sent:             'text-blue-600 bg-blue-50',
  reminder_sent:           'text-amber-600 bg-amber-50',
  phone_call:              'text-green-600 bg-green-50',
  booking_created:         'text-emerald-600 bg-emerald-50',
  booking_confirmed:       'text-green-600 bg-green-50',
  booking_cancelled:       'text-red-600 bg-red-50',
  booking_completed:       'text-emerald-600 bg-emerald-50',
  booking_rescheduled:     'text-purple-600 bg-purple-50',
  status_changed:          'text-gray-600 bg-gray-50',
  airtable_termin_created: 'text-orange-600 bg-orange-50',
};

/* ── Hilfsfunktionen ── */
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatDateDE(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTimeDE(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function timeAgoShort(iso) {
  if (!iso) return '--';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'gerade';
  if (mins < 60) return `vor ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `vor ${days}d`;
}

/* ── KPI Card ── */
function KpiCard({ label, value, icon: Icon, color = 'text-gray-600', bgColor = 'bg-gray-50', sub }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 hover:bg-white/80 transition-all">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bgColor}`}>
          <Icon size={18} className={color} />
        </div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

/* ── Hauptkomponente ── */
export default function TeamAnalyticsDashboard() {
  // State
  const [rangeId, setRangeId] = useState('7d');
  const [cityFilter, setCityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Data
  const [activityLogs, setActivityLogs] = useState([]);
  const [loginLogs, setLoginLogs] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [cities, setCities] = useState([]);
  // Historische Daten (rückwirkend aus install_bookings + installationstermine)
  const [historicBookings, setHistoricBookings] = useState([]);
  const [historicTermine, setHistoricTermine] = useState([]);
  const [allPendingBookings, setAllPendingBookings] = useState([]);

  // Recharts (dynamisch)
  const [RC, setRC] = useState(null);
  useEffect(() => {
    let cancelled = false;
    import('recharts').then(m => {
      if (!cancelled) setRC(m);
    }).catch(err => {
      console.warn('[TeamAnalytics] Recharts load failed:', err.message);
    });
    return () => { cancelled = true; };
  }, []);

  const range = RANGES.find(r => r.id === rangeId) || RANGES[1];
  const since = useMemo(() => daysAgo(range.days), [range.days]);

  /* ── Daten laden ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 6 parallele Queries
      const [actRes, loginRes, usersRes, bookingsRes, termineRes, allPendingRes] = await Promise.all([
        // 1. booking_activity_log
        supabase
          .from('booking_activity_log')
          .select('*')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(2000),

        // 2. audit_log — nur Logins
        supabase
          .from('audit_log')
          .select('user_id, user_name, created_at')
          .eq('action', 'login')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(500),

        // 3. app_users
        supabase
          .from('app_users')
          .select('id, name, email, role, last_login, groups(name)')
          .order('name'),

        // 4. install_bookings (historisch — rückwirkend)
        // WICHTIG: akquise_airtable_id wird für Dedup mit installationstermine gebraucht!
        // booked_date wird für "Termine pro Tag" Chart gebraucht (Installationsdatum, nicht created_at)
        supabase
          .from('install_bookings')
          .select('id, booking_source, city, location_name, created_at, status, created_by_user_name, akquise_airtable_id, booked_date')
          .gte('created_at', since)
          .order('created_at', { ascending: false }),

        // 5. installationstermine (historisch — rückwirkend, Airtable-Only = Telefon)
        // Verwende installationsdatum_nur_datum als Termin-Datum (nicht created_at = Record-Erstellung)
        supabase
          .from('installationstermine')
          .select('id, akquise_links, city, location_name, created_at, created_by, installationsdatum, installationsdatum_nur_datum')
          .order('created_at', { ascending: false }),

        // 6. ALLE offenen Einladungen (unabhängig vom Zeitfilter!)
        supabase
          .from('install_bookings')
          .select('id, status, city, booking_source')
          .in('status', ['pending', 'invited']),
      ]);

      const activities = actRes.data || [];
      const logins = loginRes.data || [];
      const users = usersRes.data || [];
      const bookings = bookingsRes.data || [];
      const termine = termineRes.data || [];
      const allPending = allPendingRes.data || [];

      // Unique cities from all sources
      const allCities = [...new Set([
        ...activities.map(a => a.city),
        ...bookings.map(b => b.city),
        ...termine.map(t => Array.isArray(t.city) ? t.city[0] : t.city),
      ].filter(Boolean))].sort();

      setActivityLogs(activities);
      setLoginLogs(logins);
      setAppUsers(users);
      setHistoricBookings(bookings);
      setHistoricTermine(termine);
      setAllPendingBookings(allPending);
      setCities(allCities);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[TeamAnalytics] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [since]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Gefilterte Daten ── */
  const filteredLogs = useMemo(() => {
    if (!cityFilter) return activityLogs;
    return activityLogs.filter(a => a.city === cityFilter);
  }, [activityLogs, cityFilter]);

  /* ── Historische Bookings gefiltert ── */
  const filteredBookings = useMemo(() => {
    if (!cityFilter) return historicBookings;
    return historicBookings.filter(b => b.city === cityFilter);
  }, [historicBookings, cityFilter]);

  const filteredTermine = useMemo(() => {
    // Verwende installationsdatum_nur_datum für Zeitfilter (nicht created_at)
    let result = historicTermine;
    if (cityFilter) {
      result = result.filter(t => {
        const c = Array.isArray(t.city) ? t.city[0] : t.city;
        return c === cityFilter;
      });
    }
    // Zeitfilter basierend auf Installationsdatum — BEIDES: untere UND obere Grenze
    const sinceDate = since.split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    result = result.filter(t => {
      const datum = t.installationsdatum_nur_datum || t.installationsdatum;
      if (!datum) return false;
      const d = datum.split('T')[0]; // Falls ISO-Timestamp
      return d >= sinceDate && d <= today;
    });
    return result;
  }, [historicTermine, cityFilter, since]);

  /* ── KPIs berechnen (rückwirkend aus install_bookings + installationstermine) ── */
  const kpis = useMemo(() => {
    // Nur tatsächlich gebuchte Termine zählen (nicht pending/invited/cancelled)
    const bookedStatuses = new Set(['booked', 'confirmed', 'completed']);
    const botSources = new Set(['whatsapp_agent', 'self_booking']);
    const sinceDate = since.split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    // install_bookings: Filter nach booked_date IM Zeitraum (nicht created_at!)
    const actualBookings = filteredBookings.filter(b => {
      if (!bookedStatuses.has(b.status)) return false;
      // booked_date = wann der Termin stattfindet
      const bd = b.booked_date;
      if (!bd) return false;
      return bd >= sinceDate && bd <= today;
    });

    const botFromBookings = actualBookings.filter(b => botSources.has(b.booking_source));
    const phoneFromBookings = actualBookings.filter(b => !botSources.has(b.booking_source));

    // installationstermine: Finde Airtable-Only (kein matching install_booking)
    // ALLE historicBookings für Dedup nutzen (inkl. pending), damit kein Termin doppelt zählt
    const bookedAkquiseIds = new Set(historicBookings.map(b => b.akquise_airtable_id).filter(Boolean));
    const airtableOnly = filteredTermine.filter(t => {
      const links = Array.isArray(t.akquise_links) ? t.akquise_links : [];
      return links.length > 0 && !links.some(id => bookedAkquiseIds.has(id));
    });

    const totalBot = botFromBookings.length;
    const totalPhone = phoneFromBookings.length + airtableOnly.length;
    const totalBookings = totalBot + totalPhone;

    // Offene Einladungen — ALLE offenen, NICHT zeitgefiltert
    let pendingCount = allPendingBookings.length;
    if (cityFilter) {
      pendingCount = allPendingBookings.filter(b => b.city === cityFilter).length;
    }

    // Activity log basierte KPIs (Anrufe, Einladungen)
    const calls = filteredLogs.filter(a => a.action === 'phone_call');
    const callsReached = calls.filter(a => a.detail?.reached === true || a.detail?.outcome === 'reached');
    const invites = filteredLogs.filter(a => a.action === 'invite_sent');
    const logins = loginLogs.length;

    return {
      totalBookings,
      botBookings: totalBot,
      phoneBookings: totalPhone,
      pendingInvites: pendingCount,
      totalCalls: calls.length,
      callsReached: callsReached.length,
      invites: invites.length,
      logins,
    };
  }, [filteredBookings, filteredTermine, historicBookings, allPendingBookings, filteredLogs, loginLogs, cityFilter, since]);

  /* ── Chart-Daten: Termine pro Tag nach INSTALLATIONSDATUM ── */
  const chartData = useMemo(() => {
    const botSources = new Set(['whatsapp_agent', 'self_booking']);
    const bookedStatuses = new Set(['booked', 'confirmed', 'completed']);
    const bookedAkquiseIds = new Set(historicBookings.map(b => b.akquise_airtable_id).filter(Boolean));

    // Tage im Bereich
    const dayMap = {};
    for (let i = range.days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dayMap[key] = { date: key, label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), bot: 0, telefon: 0 };
    }

    // install_bookings — nach booked_date (= wann findet der Termin statt), nicht created_at!
    for (const b of filteredBookings) {
      if (!bookedStatuses.has(b.status)) continue;
      const day = b.booked_date; // Ist bereits YYYY-MM-DD (DATE Feld)
      if (!day || !dayMap[day]) continue;
      if (botSources.has(b.booking_source)) dayMap[day].bot++;
      else dayMap[day].telefon++;
    }

    // Airtable-Only Termine (= Telefon) — verwende Installationsdatum
    for (const t of filteredTermine) {
      const links = Array.isArray(t.akquise_links) ? t.akquise_links : [];
      if (links.length === 0 || links.some(id => bookedAkquiseIds.has(id))) continue;
      const day = (t.installationsdatum_nur_datum || t.installationsdatum || '').split('T')[0];
      if (!day || !dayMap[day]) continue;
      dayMap[day].telefon++;
    }

    return Object.values(dayMap);
  }, [filteredBookings, filteredTermine, historicBookings, range.days]);

  /* ── Chart-Daten: Termine ERSTELLT pro Tag (created_at, WA vs Telefon) ── */
  const createdPerDay = useMemo(() => {
    const botSources = new Set(['whatsapp_agent', 'self_booking']);
    const bookedAkquiseIds = new Set(historicBookings.map(b => b.akquise_airtable_id).filter(Boolean));

    const dayMap = {};
    for (let i = range.days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dayMap[key] = { date: key, label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), bot: 0, telefon: 0 };
    }

    const sinceDate = since.split('T')[0];

    const bookedStatuses = new Set(['booked', 'confirmed', 'completed']);

    // install_bookings nach created_at — nur tatsächlich gebuchte
    for (const b of filteredBookings) {
      if (!bookedStatuses.has(b.status)) continue;
      const day = b.created_at?.split('T')[0];
      if (!day || !dayMap[day]) continue;
      if (botSources.has(b.booking_source)) dayMap[day].bot++;
      else dayMap[day].telefon++;
    }

    // Airtable-Only Termine nach created_at (wann in Airtable erstellt)
    // WICHTIG: Hier NICHT filteredTermine nutzen (die filtern nach Installationsdatum),
    // sondern direkt historicTermine mit eigenem created_at-Filter
    for (const t of historicTermine) {
      // Stadt-Filter anwenden
      if (cityFilter) {
        const c = Array.isArray(t.city) ? t.city[0] : t.city;
        if (c !== cityFilter) continue;
      }
      // created_at Filter
      const createdDay = t.created_at?.split('T')[0];
      if (!createdDay || createdDay < sinceDate) continue;
      // Nur Airtable-Only (kein matching install_booking)
      const links = Array.isArray(t.akquise_links) ? t.akquise_links : [];
      if (links.length === 0 || links.some(id => bookedAkquiseIds.has(id))) continue;
      if (!dayMap[createdDay]) continue;
      dayMap[createdDay].telefon++;
    }

    return Object.values(dayMap);
  }, [filteredBookings, historicTermine, historicBookings, cityFilter, since, range.days]);

  /* ── Wochen-Chart: KW-basiert, WA vs Telefon ── */
  const weeklyData = useMemo(() => {
    const botSources = new Set(['whatsapp_agent', 'self_booking']);
    const bookedAkquiseIds = new Set(historicBookings.map(b => b.akquise_airtable_id).filter(Boolean));

    // Get ISO week number
    function getWeek(dateStr) {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
      const week1 = new Date(d.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
      return `KW${weekNum}`;
    }

    const bookedStatuses = new Set(['booked', 'confirmed', 'completed']);
    const weekMap = {};

    // install_bookings — nach booked_date (Installationsdatum), nicht created_at
    for (const b of filteredBookings) {
      if (!b.booked_date || !bookedStatuses.has(b.status)) continue;
      const kw = getWeek(b.booked_date);
      if (!weekMap[kw]) weekMap[kw] = { kw, bot: 0, telefon: 0 };
      if (botSources.has(b.booking_source)) weekMap[kw].bot++;
      else weekMap[kw].telefon++;
    }

    // Airtable-Only Termine — verwende Installationsdatum
    for (const t of filteredTermine) {
      const links = Array.isArray(t.akquise_links) ? t.akquise_links : [];
      if (links.length === 0 || links.some(id => bookedAkquiseIds.has(id))) continue;
      const datum = t.installationsdatum_nur_datum || t.installationsdatum;
      if (!datum) continue;
      const kw = getWeek(datum);
      if (!weekMap[kw]) weekMap[kw] = { kw, bot: 0, telefon: 0 };
      weekMap[kw].telefon++;
    }

    // Sort by KW number
    return Object.values(weekMap).sort((a, b) => {
      const numA = parseInt(a.kw.replace('KW', ''));
      const numB = parseInt(b.kw.replace('KW', ''));
      return numA - numB;
    });
  }, [filteredBookings, filteredTermine, historicBookings]);

  /* ── User-Tabelle ── */
  const userRows = useMemo(() => {
    const map = {};
    const botSources = new Set(['whatsapp_agent', 'self_booking']);
    const bookedStatuses = new Set(['booked', 'confirmed', 'completed']);

    // Init from appUsers
    for (const u of appUsers) {
      map[u.id] = {
        id: u.id,
        name: u.name || u.email,
        group: u.groups?.name || '--',
        calls: 0,
        invites: 0,
        bookings: 0,
        lastLogin: u.last_login,
      };
    }

    // Bot virtual row
    map['__bot__'] = {
      id: '__bot__',
      name: 'WhatsApp Bot',
      group: 'System',
      calls: 0,
      invites: 0,
      bookings: 0,
      lastLogin: null,
    };

    // Historische Buchungen aus install_bookings zuordnen (rückwirkend!)
    for (const b of filteredBookings) {
      if (!bookedStatuses.has(b.status)) continue;
      if (botSources.has(b.booking_source)) {
        map['__bot__'].bookings++;
      } else if (b.created_by_user_name) {
        // Finde User in map per Name-Matching
        const userEntry = Object.values(map).find(u => u.name === b.created_by_user_name);
        if (userEntry) {
          userEntry.bookings++;
        } else {
          // User mit Name aber ohne app_users-Eintrag
          const key = `name:${b.created_by_user_name}`;
          if (!map[key]) {
            map[key] = { id: key, name: b.created_by_user_name, group: '--', calls: 0, invites: 0, bookings: 0, lastLogin: null };
          }
          map[key].bookings++;
        }
      }
    }

    // Count from activity logs (ergänzt die historischen Daten)
    for (const a of filteredLogs) {
      const key = a.user_id || (a.user_name === 'WhatsApp Bot' || a.source === 'bot' ? '__bot__' : null);
      if (!key) continue;
      if (!map[key]) {
        map[key] = { id: key, name: a.user_name || 'Unbekannt', group: '--', calls: 0, invites: 0, bookings: 0, lastLogin: null };
      }
      if (a.action === 'phone_call') map[key].calls++;
      else if (a.action === 'invite_sent') map[key].invites++;
      // booking_created/confirmed aus Activity-Log NICHT zählen — schon via install_bookings oben
    }

    // Update logins from audit_log
    for (const l of loginLogs) {
      if (l.user_id && map[l.user_id]) {
        if (!map[l.user_id].lastLogin || new Date(l.created_at) > new Date(map[l.user_id].lastLogin)) {
          map[l.user_id].lastLogin = l.created_at;
        }
      }
    }

    // Filter out users with zero activity and no login in range
    return Object.values(map)
      .filter(u => u.calls > 0 || u.invites > 0 || u.bookings > 0 || u.lastLogin)
      .sort((a, b) => (b.calls + b.invites + b.bookings) - (a.calls + a.invites + a.bookings));
  }, [filteredBookings, filteredLogs, loginLogs, appUsers]);

  /* ── Activity Feed ── */
  const activityFeed = useMemo(() => {
    return filteredLogs.slice(0, 50);
  }, [filteredLogs]);

  /* ── Custom Tooltip ── */
  const CustomTooltip = useCallback(({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const total = payload.reduce((s, p) => s + (p.value || 0), 0);
    return (
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-xs shadow-lg">
        <div className="font-semibold text-gray-700 mb-1">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-gray-600">{p.name}: <strong>{p.value}</strong></span>
          </div>
        ))}
        <div className="mt-1 pt-1 border-t border-gray-100 font-semibold text-gray-800">Gesamt: {total}</div>
      </div>
    );
  }, []);

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header + Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 size={22} className="text-orange-500" /> Team-Auswertung
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Wer macht was? Termine, Anrufe & Aktivitäten im Überblick.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Zeitraum Pills */}
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            {RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setRangeId(r.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  rangeId === r.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Stadt Filter */}
          {cities.length > 0 && (
            <div className="relative">
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-xl pl-3 pr-8 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-300"
              >
                <option value="">Alle Städte</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Aktualisieren"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {lastRefresh && (
            <span className="text-[10px] text-gray-400">
              Aktualisiert: {formatTimeDE(lastRefresh.toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50/60 border border-blue-200/50 rounded-xl px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
        <AlertCircle size={14} className="shrink-0" />
        Termine und Wochen-Statistik basieren auf historischen Daten (install_bookings + Airtable). Activity-Feed zeigt nur Events seit Aktivierung.
      </div>

      {loading && !activityLogs.length ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Lade Daten...
        </div>
      ) : (
        <>
          {/* ── KPI Cards (2×4) ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Gebuchte Termine"
              value={kpis.totalBookings}
              icon={Calendar}
              color="text-gray-700"
              bgColor="bg-gray-100"
              sub="nach Installationsdatum im Zeitraum"
            />
            <KpiCard
              label="davon WhatsApp Bot"
              value={kpis.botBookings}
              icon={MessageSquare}
              color="text-blue-600"
              bgColor="bg-blue-50"
              sub={kpis.totalBookings > 0 ? `${Math.round(kpis.botBookings / kpis.totalBookings * 100)}%` : ''}
            />
            <KpiCard
              label="davon Telefon"
              value={kpis.phoneBookings}
              icon={PhoneCall}
              color="text-green-600"
              bgColor="bg-green-50"
              sub={kpis.totalBookings > 0 ? `${Math.round(kpis.phoneBookings / kpis.totalBookings * 100)}%` : ''}
            />
            <KpiCard
              label="Offene Einladungen"
              value={kpis.pendingInvites}
              icon={Send}
              color="text-amber-600"
              bgColor="bg-amber-50"
              sub="alle offenen (kein Zeitfilter)"
            />
            <KpiCard
              label="Anrufe Gesamt"
              value={kpis.totalCalls}
              icon={Phone}
              color="text-purple-600"
              bgColor="bg-purple-50"
            />
            <KpiCard
              label="Davon erreicht"
              value={kpis.callsReached}
              icon={CheckCircle}
              color="text-green-600"
              bgColor="bg-green-50"
              sub={kpis.totalCalls > 0 ? `${Math.round(kpis.callsReached / kpis.totalCalls * 100)}%` : ''}
            />
            <KpiCard
              label="WA-Einladungen"
              value={kpis.invites}
              icon={Send}
              color="text-blue-600"
              bgColor="bg-blue-50"
              sub="Activity-Log (seit Aktivierung)"
            />
            <KpiCard
              label="Logins"
              value={kpis.logins}
              icon={LogIn}
              color="text-gray-600"
              bgColor="bg-gray-100"
            />
          </div>

          {/* ── Stacked Bar Chart ── */}
          {RC && chartData.length > 0 && (
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <BarChart3 size={16} /> Termine pro Tag nach Quelle
              </h3>
              <div className="h-64">
                <RC.ResponsiveContainer width="100%" height="100%">
                  <RC.BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <RC.XAxis
                      dataKey="label"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      interval={range.days > 30 ? 6 : range.days > 14 ? 2 : 0}
                    />
                    <RC.YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                    <RC.Tooltip content={<CustomTooltip />} />
                    <RC.Bar dataKey="bot" name="WhatsApp Bot" stackId="a" fill={SOURCE_COLORS.bot} radius={[0, 0, 0, 0]} />
                    <RC.Bar dataKey="telefon" name="Telefon" stackId="a" fill={SOURCE_COLORS.portal} radius={[4, 4, 0, 0]} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              </div>
              {/* Legende */}
              <div className="flex items-center gap-4 mt-3 justify-center">
                {[
                  { key: 'bot', label: 'WhatsApp Bot', color: SOURCE_COLORS.bot },
                  { key: 'telefon', label: 'Telefon', color: SOURCE_COLORS.portal },
                ].map(l => (
                  <div key={l.key} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Created pro Tag: Wann wurden Termine erstellt? ── */}
          {RC && createdPerDay.length > 0 && (
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Activity size={16} /> Termine erstellt pro Tag
              </h3>
              <div className="h-64">
                <RC.ResponsiveContainer width="100%" height="100%">
                  <RC.BarChart data={createdPerDay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <RC.XAxis
                      dataKey="label"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      interval={range.days > 30 ? 6 : range.days > 14 ? 2 : 0}
                    />
                    <RC.YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                    <RC.Tooltip content={<CustomTooltip />} />
                    <RC.Bar dataKey="bot" name="WhatsApp Bot" stackId="a" fill={SOURCE_COLORS.bot} radius={[0, 0, 0, 0]} />
                    <RC.Bar dataKey="telefon" name="Telefon" stackId="a" fill={SOURCE_COLORS.portal} radius={[4, 4, 0, 0]} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-3 justify-center">
                {[
                  { key: 'bot', label: 'WhatsApp Bot', color: SOURCE_COLORS.bot },
                  { key: 'telefon', label: 'Telefon', color: SOURCE_COLORS.portal },
                ].map(l => (
                  <div key={l.key} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Wochen-Chart: WA vs Telefon nach KW ── */}
          {RC && weeklyData.length > 0 && (
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Calendar size={16} /> Termine pro Woche — WhatsApp Bot vs. Telefon
              </h3>
              <div className="h-64">
                <RC.ResponsiveContainer width="100%" height="100%">
                  <RC.BarChart data={weeklyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <RC.XAxis dataKey="kw" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <RC.YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                    <RC.Tooltip content={<CustomTooltip />} />
                    <RC.Bar dataKey="bot" name="WhatsApp Bot" stackId="a" fill={SOURCE_COLORS.bot} radius={[0, 0, 0, 0]} />
                    <RC.Bar dataKey="telefon" name="Telefon" stackId="a" fill={SOURCE_COLORS.portal} radius={[4, 4, 0, 0]} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-3 justify-center">
                {[
                  { key: 'bot', label: 'WhatsApp Bot', color: SOURCE_COLORS.bot },
                  { key: 'telefon', label: 'Telefon', color: SOURCE_COLORS.portal },
                ].map(l => (
                  <div key={l.key} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── User-Aktivitäts-Tabelle ── */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users size={16} /> Aktivität pro Nutzer
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50/50">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium text-center">Anrufe</th>
                    <th className="px-4 py-3 font-medium text-center">WA-Einladungen</th>
                    <th className="px-4 py-3 font-medium text-center">Buchungen</th>
                    <th className="px-4 py-3 font-medium text-right">Letzter Login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {userRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">Keine Aktivität im gewählten Zeitraum.</td></tr>
                  ) : userRows.map(u => (
                    <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${u.id === '__bot__' ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {u.id === '__bot__' ? (
                            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                              <MessageSquare size={14} className="text-blue-600" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                              <Users size={14} className="text-gray-500" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{u.name}</div>
                            <div className="text-[10px] text-gray-400">{u.group}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${u.calls > 0 ? 'text-green-600' : 'text-gray-300'}`}>{u.calls}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${u.invites > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{u.invites}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${u.bookings > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>{u.bookings}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {u.lastLogin ? timeAgoShort(u.lastLogin) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Activity Feed ── */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Activity size={16} /> Letzte Aktivitäten
              </h3>
            </div>
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {activityFeed.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Keine Aktivitäten im gewählten Zeitraum.</div>
              ) : activityFeed.map((a, i) => {
                const Icon = ACTION_ICONS[a.action] || Activity;
                const colorClasses = ACTION_COLORS[a.action] || 'text-gray-600 bg-gray-50';
                return (
                  <div key={a.id || i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClasses}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {ACTION_LABELS[a.action] || a.action}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium border"
                          style={{
                            color: SOURCE_COLORS[a.source] || SOURCE_COLORS.unknown,
                            backgroundColor: `${SOURCE_COLORS[a.source] || SOURCE_COLORS.unknown}15`,
                            borderColor: `${SOURCE_COLORS[a.source] || SOURCE_COLORS.unknown}30`,
                          }}
                        >
                          {SOURCE_LABELS[a.source] || a.source}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {a.user_name || 'System'} — {a.location_name || ''} {a.city ? `(${a.city})` : ''}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">
                      {formatDateDE(a.created_at)} {formatTimeDE(a.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
