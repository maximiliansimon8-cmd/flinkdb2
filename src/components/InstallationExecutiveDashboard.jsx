import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Calendar, MapPin, Clock,
  CheckCircle, AlertCircle, RefreshCw,
  ArrowRight, Building, CalendarCheck, Timer, Loader2, Inbox,
  AlertTriangle,
} from 'lucide-react';
import { fetchAllAcquisition, fetchAllInstallationstermine } from '../utils/airtableService';
import { isStorno, isAlreadyInstalled, isReadyForInstall, isPendingApproval, OVERDUE_THRESHOLDS } from '../metrics';
import { INSTALL_API, STATUS_HEX as STATUS_COLORS, STATUS_LABELS, formatDateShort as formatDate, formatDateTime, triggerSyncAndReload } from '../utils/installUtils';
import InstallationLiveticker from './InstallationLiveticker';

/* ── Custom Tooltip ── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl p-3 shadow-lg">
      <div className="text-xs font-semibold text-gray-700 mb-1.5">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-bold text-gray-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── KPI Card ── */
function KPICard({ label, value, subtitle, icon: Icon, color, bgColor, trend }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 text-left transition-all hover:bg-white/80 hover:shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
          <Icon size={20} className={color} />
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-mono flex items-center gap-0.5 ${
            trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 font-medium mt-0.5">{label}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationExecutiveDashboard({ filterCity }) {
  const [bookingsRaw, setBookings] = useState([]);
  const [routesRaw, setRoutes] = useState([]);
  const [acquisitionDataRaw, setAcquisitionData] = useState([]);
  const [termineRaw, setTermine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Recharts: Dynamic import to avoid large synchronous bundle ──
  // Recharts is 321KB+ and loaded dynamically so the initial render is fast.
  // The __vitePreload polyfill has been replaced with a pass-through in vite.config.js,
  // so Vite's modulepreload no longer causes TDZ issues with Recharts' CartesianChart chunk.
  // We let Vite resolve the import normally (no @vite-ignore) so it produces a valid
  // chunk path in production instead of an unresolvable bare "recharts" specifier.
  const [RC, setRC] = useState(null);
  useEffect(() => {
    let cancelled = false;
    import('recharts').then(m => {
      if (!cancelled) setRC(m);
    }).catch(err => {
      console.warn('[InstallExecutive] Recharts load failed:', err.message);
    });
    return () => { cancelled = true; };
  }, []);

  // Apply global city filter
  const bookings = useMemo(() => {
    if (!filterCity) return bookingsRaw;
    return bookingsRaw.filter(b => (b.city || '') === filterCity);
  }, [bookingsRaw, filterCity]);

  const routes = useMemo(() => {
    if (!filterCity) return routesRaw;
    return routesRaw.filter(r => (r.city || '') === filterCity);
  }, [routesRaw, filterCity]);

  const acquisitionData = useMemo(() => {
    if (!filterCity) return acquisitionDataRaw;
    return acquisitionDataRaw.filter(a => {
      const cities = Array.isArray(a.city) ? a.city : (a.city ? [a.city] : []);
      return cities.includes(filterCity);
    });
  }, [acquisitionDataRaw, filterCity]);

  const termine = useMemo(() => {
    if (!filterCity) return termineRaw;
    return termineRaw.filter(t => {
      const tCity = Array.isArray(t.city) ? t.city[0] : (t.city || '');
      return tCity === filterCity;
    });
  }, [termineRaw, filterCity]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookRes, routeRes, acqData, terminData] = await Promise.all([
        fetch(INSTALL_API.BOOKINGS + '?').then(r => r.json()).then(d => Array.isArray(d) ? d : []).catch(() => []),
        fetch(INSTALL_API.SCHEDULE + '?').then(r => r.json()).then(d => Array.isArray(d) ? d : []).catch(() => []),
        fetchAllAcquisition().catch(() => []),
        fetchAllInstallationstermine().catch(() => []),
      ]);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
      setRoutes(Array.isArray(routeRes) ? routeRes : []);
      setAcquisitionData(Array.isArray(acqData) ? acqData : []);
      setTermine(Array.isArray(terminData) ? terminData : []);
    } catch (e) {
      console.error('Failed to load executive data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    await triggerSyncAndReload(loadData, showToast);
    setSyncing(false);
  }, [loadData, showToast]);

  // Compute KPIs
  const kpis = useMemo(() => {
    const now = Date.now();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Status counts (booked and confirmed are unified as the same status)
    const pending = bookings.filter(b => b.status === 'pending').length;
    const booked = bookings.filter(b => b.status === 'booked' || b.status === 'confirmed').length;
    const completed = bookings.filter(b => b.status === 'completed').length;
    const cancelled = bookings.filter(b => b.status === 'cancelled').length;
    const noShow = bookings.filter(b => b.status === 'no_show').length;

    // This week
    const thisWeek = bookings.filter(b => new Date(b.created_at) >= oneWeekAgo).length;

    // Conversion rates — all bookings were invited, so total = all statuses
    const totalInvited = bookings.length; // pending + booked + completed + cancelled + no_show
    const totalBooked = booked + completed;
    const conversionInviteToBook = totalInvited > 0 ? Math.round((totalBooked / totalInvited) * 100) : 0;
    const noShowRate = (completed + noShow) > 0 ? Math.round((noShow / (completed + noShow)) * 100) : 0;

    // Average time invite to booking
    const bookedWithTimes = bookings.filter(b => b.whatsapp_sent_at && b.booked_at);
    let avgTimeToBook = 0;
    if (bookedWithTimes.length > 0) {
      const totalHours = bookedWithTimes.reduce((sum, b) => {
        return sum + (new Date(b.booked_at) - new Date(b.whatsapp_sent_at)) / (1000 * 60 * 60);
      }, 0);
      avgTimeToBook = Math.round(totalHours / bookedWithTimes.length);
    }

    // Capacity utilization — count future bookings + Airtable-only termine
    const today = new Date().toISOString().split('T')[0];
    const futureOpenRoutes = routes.filter(r => r.status === 'open' && r.schedule_date >= today);
    const totalCapacity = futureOpenRoutes.reduce((sum, r) => sum + (r.max_capacity || 4), 0);
    const futureRouteIds = new Set(futureOpenRoutes.map(r => r.id));
    const bookedSlotsFromBookings = bookings.filter(b =>
      b.route_id && futureRouteIds.has(b.route_id)
      && ['booked', 'confirmed', 'completed'].includes(b.status)
      && b.booked_date && b.booked_date >= today
    ).length;
    // Airtable-only termine that match future open routes (not already in bookings)
    const bookingAkqIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));
    let atOnlySlots = 0;
    for (const r of futureOpenRoutes) {
      const routeCity = (r.city || '').toLowerCase().replace(/ am main$/i, '').trim();
      atOnlySlots += termine.filter(t => {
        const tStatus = (t.terminstatus || '').toLowerCase();
        if (tStatus !== 'geplant') return false;
        const tDatum = t.installationsdatumNurDatum || '';
        if (tDatum !== r.schedule_date) return false;
        const tCity = (Array.isArray(t.city) ? t.city[0] : (t.city || '')).toLowerCase().replace(/ am main$/i, '').trim();
        if (tCity !== routeCity) return false;
        return !(t.akquiseLinks || []).some(id => bookingAkqIds.has(id));
      }).length;
    }
    const bookedSlots = bookedSlotsFromBookings + atOnlySlots;
    const capacityUtil = totalCapacity > 0 ? Math.round((bookedSlots / totalCapacity) * 100) : 0;

    // Overdue: only pending invites without response (booked = auto-confirmed, no longer overdue)
    const overdue = bookings.filter(b => {
      if (b.status === 'pending' && b.whatsapp_sent_at) {
        return (now - new Date(b.whatsapp_sent_at).getTime()) > OVERDUE_THRESHOLDS.PENDING_NO_RESPONSE_HOURS * 60 * 60 * 1000;
      }
      return false;
    }).length;

    // Ready to invite — predicates imported from src/metrics
    // "Pipeline" = Offene Prüfungen: Won/Signed + approval pending (In review / Info required / not started)
    const bookingIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));
    const notStornNotInstalled = acquisitionData.filter(a => !isStorno(a) && !isAlreadyInstalled(a));
    const readyForInstallCount = notStornNotInstalled.filter(a =>
      isReadyForInstall(a) && !bookingIds.has(a.id)
    ).length;
    const inReviewCount = notStornNotInstalled.filter(a =>
      isPendingApproval(a) && !bookingIds.has(a.id)
    ).length;

    // Week-over-week trend
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const lastWeek = bookings.filter(b => {
      const d = new Date(b.created_at);
      return d >= twoWeeksAgo && d < oneWeekAgo;
    }).length;
    const weekTrend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

    return {
      total: bookings.length, thisWeek,
      pending, booked, completed, cancelled, noShow,
      conversionInviteToBook, totalBooked, totalInvited, noShowRate, avgTimeToBook,
      capacityUtil, totalCapacity, bookedSlots, overdue,
      readyForInstallCount, inReviewCount, weekTrend,
    };
  }, [bookings, routes, acquisitionData, termine]);

  // Chart Data: Status distribution (Pie)
  // Merge booked+confirmed into the 'booked' / 'Eingebucht' slice
  const statusPieData = useMemo(() => {
    return Object.entries(STATUS_LABELS)
      .map(([key, label]) => ({
        name: label,
        value: key === 'booked'
          ? bookings.filter(b => b.status === 'booked' || b.status === 'confirmed').length
          : bookings.filter(b => b.status === key).length,
        color: STATUS_COLORS[key],
      }))
      .filter(d => d.value > 0);
  }, [bookings]);

  // Chart Data: Bookings over time (last 14 days)
  const timelineData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayCreated = bookings.filter(b => (b.created_at || '').startsWith(dateStr));
      const dayBooked = bookings.filter(b => (b.booked_at || '').startsWith(dateStr));
      days.push({
        date: formatDate(dateStr),
        einladungen: dayCreated.length,
        buchungen: dayBooked.length,
      });
    }
    return days;
  }, [bookings]);

  // Chart Data: City comparison (booked+confirmed merged into booked)
  const cityChartData = useMemo(() => {
    const cityMap = {};
    bookings.forEach(b => {
      const city = b.city || 'Unbekannt';
      if (!cityMap[city]) cityMap[city] = { city, pending: 0, booked: 0, completed: 0, cancelled: 0 };
      const status = b.status === 'confirmed' ? 'booked' : b.status;
      if (cityMap[city][status] !== undefined) cityMap[city][status]++;
    });
    return Object.values(cityMap).sort((a, b) => {
      const totalA = a.pending + a.booked + a.completed;
      const totalB = b.pending + b.booked + b.completed;
      return totalB - totalA;
    });
  }, [bookings]);

  // Chart Data: Route capacity (bookings + Airtable termine)
  const capacityData = useMemo(() => {
    // Build set of akquise IDs already represented by bookings (to avoid double-counting)
    const bookingAkqIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));

    return routes
      .filter(r => r.status === 'open')
      .sort((a, b) => (a.schedule_date || '').localeCompare(b.schedule_date || ''))
      .slice(0, 10)
      .map(r => {
        // Count from our booking system
        const routeBookings = bookings.filter(b =>
          b.route_id === r.id && ['booked', 'confirmed', 'completed'].includes(b.status)
        ).length;

        // Count Airtable-only termine that match this route's city + date
        const routeCity = (r.city || '').toLowerCase().replace(/ am main$/i, '').trim();
        const atTermineCount = termine.filter(t => {
          const tStatus = (t.terminstatus || '').toLowerCase();
          if (tStatus !== 'geplant') return false;
          const tDatum = t.installationsdatumNurDatum || '';
          if (tDatum !== r.schedule_date) return false;
          const tCity = (Array.isArray(t.city) ? t.city[0] : (t.city || '')).toLowerCase().replace(/ am main$/i, '').trim();
          if (tCity !== routeCity) return false;
          // Skip if already represented by a booking
          return !(t.akquiseLinks || []).some(id => bookingAkqIds.has(id));
        }).length;

        const totalBelegt = routeBookings + atTermineCount;
        return {
          name: `${(r.city || '').substring(0, 3)} ${formatDate(r.schedule_date)}`,
          belegt: totalBelegt,
          frei: Math.max(0, (r.max_capacity || 4) - totalBelegt),
        };
      });
  }, [routes, bookings, termine]);

  // NOTE: funnelData moved AFTER historicalStats to avoid TDZ
  // (historicalStats must be declared before it can be referenced)

  // Upcoming installations (next 7 days) — combine bookings + Airtable termine
  const upcoming = useMemo(() => {
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const weekOut = new Date(now);
    weekOut.setDate(now.getDate() + 7);
    const weekOutDate = weekOut.toISOString().split('T')[0];
    const items = [];
    // From our booking system — use string comparison for date-only fields
    bookings
      .filter(b => b.booked_date && b.status !== 'cancelled' && b.status !== 'no_show'
        && b.booked_date >= todayDate && b.booked_date <= weekOutDate)
      .forEach(b => items.push({
        id: b.id, date: b.booked_date, time: b.booked_time, endTime: b.booked_end_time,
        name: b.location_name || 'Unbekannt', city: b.city || '', status: b.status,
        source: 'booking',
      }));
    // From Airtable installationstermine (Geplant only, avoid duplicates)
    const bookingAkqIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));
    termine
      .filter(t => {
        const s = (t.terminstatus || '').toLowerCase();
        if (s !== 'geplant') return false;
        const tDatum = t.installationsdatumNurDatum || t.installationsdatum || '';
        if (!tDatum) return false;
        if (tDatum < todayDate || tDatum > weekOutDate) return false;
        // Skip if already represented by a booking
        return !(t.akquiseLinks || []).some(id => bookingAkqIds.has(id));
      })
      .forEach(t => {
        const tDatum = t.installationsdatumNurDatum || t.installationsdatum || '';
        const tName = Array.isArray(t.locationName) ? t.locationName[0] : (t.locationName || '');
        const tCity = Array.isArray(t.city) ? t.city[0] : (t.city || '');
        items.push({
          id: t.id, date: tDatum, time: t.installationszeit || '', endTime: '',
          name: tName || 'Unbekannt', city: tCity, status: 'geplant_at',
          source: 'airtable',
        });
      });
    return items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [bookings, termine]);

  // Pending follow-ups (invited >48h), deduplicated by akquise_airtable_id (keep latest per location)
  const pendingFollowups = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);
    const candidates = bookings
      .filter(b => b.status === 'pending' && b.whatsapp_sent_at && new Date(b.whatsapp_sent_at) < cutoff)
      .sort((a, b) => new Date(b.whatsapp_sent_at) - new Date(a.whatsapp_sent_at)); // newest first
    // Deduplicate: keep only the latest booking per akquise_airtable_id (or location_name if no akquise ID)
    const seen = new Set();
    const deduped = [];
    for (const b of candidates) {
      const key = b.akquise_airtable_id || b.location_name || b.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(b);
      }
    }
    return deduped.sort((a, b) => new Date(a.whatsapp_sent_at) - new Date(b.whatsapp_sent_at));
  }, [bookings]);

  // Historical installation data from Airtable (synced to Supabase)
  // IMPORTANT: This useMemo must be ABOVE all conditional returns to satisfy Rules of Hooks
  const historicalStats = useMemo(() => {
    // IMPORTANT: Declare `now` at the top of this useMemo to avoid TDZ in production.
    const now = new Date();
    // todayStr for date-only comparisons (avoids excluding today's termine because
    // new Date('2026-02-17T00:00:00') < new Date() when it's afternoon)
    const todayStr = now.toISOString().split('T')[0];
    const in7 = new Date(now); in7.setDate(now.getDate() + 7);
    const in7Str = in7.toISOString().split('T')[0];
    const in30 = new Date(now); in30.setDate(now.getDate() + 30);
    const in30Str = in30.toISOString().split('T')[0];

    // Installationen from acquisition data (NO storno filter — these are factual counts)
    const installed = acquisitionData.filter(a => {
      const statuses = Array.isArray(a.installationsStatus) ? a.installationsStatus : [];
      return statuses.some(s => (s || '').toLowerCase().includes('installiert'));
    });
    const live = acquisitionData.filter(a => {
      const ds = Array.isArray(a.displayLocationStatus) ? a.displayLocationStatus : [];
      return ds.some(s => (s || '').toLowerCase().includes('live'));
    });
    // Active: not storno, not already installed
    const activeAcq = acquisitionData.filter(a => !isStorno(a) && !isAlreadyInstalled(a));
    // Use canonical predicate: Won/Signed + Approved + Vertrag vorhanden
    const ready = activeAcq.filter(a => isReadyForInstall(a));
    // Pipeline = Offene Prüfungen: Won/Signed + approval pending (In review / Info required / not started)
    const inReview = activeAcq.filter(a => isPendingApproval(a));

    // Build lookup: akquise ID → has active appointment (from bookings OR Airtable termine)
    const bookingAkquiseIds = new Set(
      bookings
        .filter(b => b.akquise_airtable_id && !['cancelled', 'no_show'].includes(b.status))
        .map(b => b.akquise_airtable_id)
    );
    // Airtable installationstermine: akquise links with Geplant/Durchgeführt status
    const terminAkquiseIds = new Set();
    for (const t of termine) {
      const status = (t.terminstatus || '').toLowerCase();
      if (status === 'geplant' || status === 'durchgeführt' || status === 'durchgefuehrt') {
        for (const akqId of (t.akquiseLinks || [])) {
          terminAkquiseIds.add(akqId);
        }
      }
    }
    const allTerminiertIds = new Set([...bookingAkquiseIds, ...terminAkquiseIds]);
    // Only count future appointments for "Terminiert" to match Geplant 7T/30T logic
    // NOTE: Use string comparison (>= todayStr) for date-only fields to avoid
    // timezone issues where midnight today < current time today would exclude today's entries.
    const futureBookingIds = new Set(
      bookings
        .filter(b => b.akquise_airtable_id && !['cancelled', 'no_show'].includes(b.status) && b.booked_date && b.booked_date >= todayStr)
        .map(b => b.akquise_airtable_id)
    );
    const futureTerminIds = new Set();
    for (const t of termine) {
      const status = (t.terminstatus || '').toLowerCase();
      if (status !== 'geplant') continue;
      const tDatum = t.installationsdatumNurDatum || t.installationsdatum || '';
      if (!tDatum) continue;
      if (tDatum >= todayStr) {
        for (const akqId of (t.akquiseLinks || [])) futureTerminIds.add(akqId);
      }
    }
    const allFutureTerminIds = new Set([...futureBookingIds, ...futureTerminIds]);

    // Terminiert: Count UNIQUE future Geplant Installationstermine directly
    // (matches Airtable's own count: Terminstatus = "Geplant" AND date >= today)
    // This includes termine with AND without akquiseLinks, since some may not be linked yet.
    // We also include future bookings (booked/confirmed) that don't overlap with Airtable termine.
    const futureGeplantTermine = new Set();
    for (const t of termine) {
      const status = (t.terminstatus || '').toLowerCase();
      if (status !== 'geplant') continue;
      const tDatum = t.installationsdatumNurDatum || t.installationsdatum || '';
      if (!tDatum) continue;
      if (tDatum >= todayStr) {
        futureGeplantTermine.add(t.id); // count unique termine, not akquise links
      }
    }
    // Also count future bookings (booked/confirmed) that aren't already represented by an Airtable Termin
    const terminAkqIdSet = new Set();
    for (const t of termine) {
      for (const akqId of (t.akquiseLinks || [])) terminAkqIdSet.add(akqId);
    }
    const extraBookingTerminiert = bookings.filter(b =>
      b.akquise_airtable_id
      && (b.status === 'booked' || b.status === 'confirmed')
      && b.booked_date && b.booked_date >= todayStr
      && !terminAkqIdSet.has(b.akquise_airtable_id) // not already in an Airtable Termin
    );
    const totalTerminiertCount = futureGeplantTermine.size + extraBookingTerminiert.length;

    // For "ohne Termin": still use akquise-based logic to identify ready locations without any appointment
    const readyOhneTermin = ready.filter(a => !allTerminiertIds.has(a.id));

    // Upcoming installations (next 7 / 30 days) — combine bookings + Airtable termine
    // (now, in7, in30 declared at top of useMemo)
    // From our booking system — use string comparison for date-only fields
    const activeBookings = bookings.filter(b =>
      b.booked_date && !['cancelled', 'no_show'].includes(b.status)
    );
    const bookingDates7 = new Set();
    const bookingDates30 = new Set();
    activeBookings.forEach(b => {
      if (b.booked_date >= todayStr && b.booked_date <= in7Str) bookingDates7.add(b.akquise_airtable_id || b.id);
      if (b.booked_date >= todayStr && b.booked_date <= in30Str) bookingDates30.add(b.akquise_airtable_id || b.id);
    });
    // From Airtable installationstermine (only Geplant — Durchgeführt is past)
    for (const t of termine) {
      const status = (t.terminstatus || '').toLowerCase();
      if (status !== 'geplant') continue;
      const tDatum = t.installationsdatumNurDatum || t.installationsdatum || '';
      if (!tDatum) continue;
      const key = (t.akquiseLinks || [])[0] || t.id;
      if (tDatum >= todayStr && tDatum <= in7Str && !bookingDates7.has(key)) bookingDates7.add(key);
      if (tDatum >= todayStr && tDatum <= in30Str && !bookingDates30.has(key)) bookingDates30.add(key);
    }
    const next7 = bookingDates7.size;
    const next30 = bookingDates30.size;

    // By city
    const byCity = {};
    installed.forEach(a => {
      const city = Array.isArray(a.city) ? a.city[0] : (a.city || 'Unbekannt');
      byCity[city] = (byCity[city] || 0) + 1;
    });
    const cityData = Object.entries(byCity)
      .map(([city, count]) => ({ city, installiert: count }))
      .sort((a, b) => b.installiert - a.installiert);

    // "Aufbau bereit" per city: total vs. bereits terminiert
    const readyByCity = {};
    ready.forEach(a => {
      const city = Array.isArray(a.city) ? a.city[0] : (a.city || 'Unbekannt');
      if (!city) return;
      if (!readyByCity[city]) readyByCity[city] = { total: 0, terminiert: 0 };
      readyByCity[city].total++;
      if (allTerminiertIds.has(a.id)) {
        readyByCity[city].terminiert++;
      }
    });
    const readyCityData = Object.entries(readyByCity)
      .map(([city, counts]) => ({
        city,
        gesamt: counts.total,
        terminiert: counts.terminiert,
        offen: counts.total - counts.terminiert,
      }))
      .sort((a, b) => b.gesamt - a.gesamt);

    return {
      totalInstalled: installed.length,
      totalLive: live.length,
      totalReady: ready.length,
      totalReadyOhneTermin: readyOhneTermin.length,
      totalTerminiert: totalTerminiertCount,
      totalInReview: inReview.length,
      totalAcquisition: acquisitionData.length,
      next7,
      next30,
      cityData,
      readyCityData,
    };
  }, [acquisitionData, bookings, termine]);

  // Funnel — represents actual installation pipeline
  // IMPORTANT: This useMemo MUST be AFTER historicalStats to avoid TDZ.
  // "Installiert" uses the real count from Airtable/Stammdaten (installationsStatus contains 'installiert'),
  // NOT the booking-system's 'completed' status.
  const funnelData = useMemo(() => {
    return [
      { stage: 'Bereit f. Aufbau', value: historicalStats.totalReady, color: '#06b6d4' },
      { stage: 'Eingeladen', value: kpis.pending, color: '#eab308' },
      { stage: 'Terminiert', value: historicalStats.totalTerminiert, color: '#6366f1' },
      { stage: 'Installiert', value: historicalStats.totalInstalled, color: '#10b981' },
    ];
  }, [kpis, historicalStats]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 size={24} className="animate-spin text-orange-500" />
        <p className="text-sm">Dashboard wird geladen...</p>
      </div>
    );
  }

  // Show dashboard even without bookings — use acquisition/historical data
  if (bookings.length === 0 && routes.length === 0 && acquisitionData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
        <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
          <BarChart3 size={40} className="text-gray-300" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-gray-600">Noch keine Installationsdaten</p>
          <p className="text-sm text-gray-400 mt-1">Erstelle Routen und sende Einladungen, um hier Kennzahlen zu sehen.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={syncing}
          className="px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded-xl hover:bg-orange-100 flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Daten laden
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="text-orange-500" size={24} /> Installations-Dashboard
            {filterCity && <span className="text-base font-medium text-orange-500 ml-1">({filterCity})</span>}
          </h2>
          <p className="text-gray-500 mt-1">
            {filterCity ? `KPI fuer ${filterCity}` : 'Gesamtuebersicht aller Installationstermine und Buchungen.'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Aktualisieren
        </button>
      </div>

      {/* Historical Overview (from Airtable data) */}
      {historicalStats.totalAcquisition > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-2">
            <Building size={16} /> Gesamtbestand
          </h3>
          <div className="flex items-end gap-2 flex-wrap">
            {/* Pipeline — Offene Prüfungen */}
            <div className="bg-amber-100/70 border border-amber-300 rounded-xl px-3 py-2 text-center min-w-[60px]">
              <div className="text-lg font-bold text-amber-700">{historicalStats.totalInReview}</div>
              <div className="text-[9px] text-amber-600 font-medium leading-tight">Pipeline</div>
              <div className="text-[8px] text-amber-500 leading-tight">Offene Prüfungen</div>
            </div>
            {/* Main KPIs */}
            {[
              { label: 'Aufbaubereit', sub: `${historicalStats.totalReadyOhneTermin} ohne Termin`, value: historicalStats.totalReady, color: 'text-blue-700' },
              { label: 'Terminiert', sub: 'zukuenftig', value: historicalStats.totalTerminiert, color: 'text-indigo-700' },
              { label: 'Geplant 7T', value: historicalStats.next7, color: 'text-orange-600' },
              { label: 'Geplant 30T', value: historicalStats.next30, color: 'text-orange-500' },
              { label: 'Installiert', value: historicalStats.totalInstalled, color: 'text-emerald-700' },
              { label: 'Live', value: historicalStats.totalLive, color: 'text-green-700' },
            ].map(k => (
              <div key={k.label} className="text-center flex-1 min-w-[70px]">
                <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-[10px] text-gray-500 font-medium">{k.label}</div>
                {k.sub && <div className="text-[8px] text-gray-400">{k.sub}</div>}
              </div>
            ))}
          </div>
          {historicalStats.cityData.length > 0 && RC && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-orange-700 mb-2">Installationen nach Stadt</h4>
              <div className="h-40">
                <RC.ResponsiveContainer width="100%" height="100%">
                  <RC.BarChart data={historicalStats.cityData.slice(0, 8)} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
                    <RC.XAxis dataKey="city" tick={{ fontSize: 10 }} />
                    <RC.YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RC.Tooltip content={<CustomTooltip />} />
                    <RC.Bar dataKey="installiert" name="Installiert" fill="#FF8000" radius={[4, 4, 0, 0]} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              </div>
            </div>
          )}
          {historicalStats.readyCityData?.length > 0 && RC && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-orange-700 mb-2">Aufbau bereit nach Stadt</h4>
              <div className="h-48">
                <RC.ResponsiveContainer width="100%" height="100%">
                  <RC.BarChart data={historicalStats.readyCityData.slice(0, 8)} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="#fed7aa" />
                    <RC.XAxis dataKey="city" tick={{ fontSize: 10 }} />
                    <RC.YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RC.Tooltip content={<CustomTooltip />} />
                    <RC.Bar dataKey="terminiert" name="Gebucht / Terminiert" fill="#22c55e" stackId="ready" radius={[0, 0, 0, 0]} />
                    <RC.Bar dataKey="offen" name="Noch offen" fill="#06b6d4" stackId="ready" radius={[4, 4, 0, 0]} />
                    <RC.Legend wrapperStyle={{ fontSize: '11px' }} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="Terminiert"
          value={historicalStats.totalTerminiert}
          subtitle={`${historicalStats.next7} in 7 Tagen`}
          icon={CalendarCheck}
          color="text-indigo-600"
          bgColor="bg-indigo-100"
        />
        <KPICard
          label="Konversionsrate"
          value={`${kpis.conversionInviteToBook}%`}
          subtitle={`${kpis.totalBooked} von ${kpis.totalInvited} gebucht`}
          icon={TrendingUp}
          color="text-green-600"
          bgColor="bg-green-100"
        />
        <KPICard
          label="No-Show Rate"
          value={`${kpis.noShowRate}%`}
          subtitle={`${kpis.noShow} No-Shows`}
          icon={AlertTriangle}
          color="text-amber-600"
          bgColor="bg-amber-100"
        />
        <KPICard
          label="Avg. Buchungszeit"
          value={kpis.avgTimeToBook > 0 ? `${kpis.avgTimeToBook}h` : '--'}
          subtitle="Einladung bis Buchung"
          icon={Timer}
          color="text-purple-600"
          bgColor="bg-purple-100"
        />
        <KPICard
          label="Auslastung"
          value={`${kpis.capacityUtil}%`}
          subtitle={`${kpis.bookedSlots}/${kpis.totalCapacity} Slots`}
          icon={Building}
          color="text-indigo-600"
          bgColor="bg-indigo-100"
        />
        <KPICard
          label="Abgeschlossen"
          value={kpis.completed}
          subtitle={`${kpis.booked} gebucht`}
          icon={CheckCircle}
          color="text-emerald-600"
          bgColor="bg-emerald-100"
        />
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-gray-400" /> Installations-Funnel
        </h3>
        <div className="flex items-center gap-1">
          {funnelData.map((stage, i) => {
            const maxVal = Math.max(...funnelData.map(s => s.value));
            const width = maxVal > 0 ? Math.max(15, (stage.value / maxVal) * 100) : 15;
            return (
              <React.Fragment key={stage.stage}>
                <div className="flex-1 text-center">
                  <div
                    className="mx-auto rounded-xl transition-all duration-500"
                    style={{
                      width: `${width}%`,
                      minWidth: '40px',
                      height: '48px',
                      backgroundColor: stage.color,
                      opacity: 0.8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span className="text-white font-bold text-sm">{stage.value}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1.5 font-medium">{stage.stage}</div>
                </div>
                {i < funnelData.length - 1 && (
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Timeline Chart */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" /> Verlauf (letzte 14 Tage)
          </h3>
          <div className="h-64">
            {RC ? (
              <RC.ResponsiveContainer width="100%" height="100%">
                <RC.AreaChart data={timelineData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <RC.CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <RC.XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <RC.YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RC.Tooltip content={<CustomTooltip />} />
                  <RC.Area type="monotone" dataKey="einladungen" name="Einladungen" stroke="#eab308" fill="#eab308" fillOpacity={0.15} strokeWidth={2} />
                  <RC.Area type="monotone" dataKey="buchungen" name="Buchungen" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                  <RC.Legend wrapperStyle={{ fontSize: '11px' }} />
                </RC.AreaChart>
              </RC.ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-300">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Status Pie */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-gray-400" /> Status-Verteilung
          </h3>
          <div className="h-64 flex items-center">
            {RC ? (
              <RC.ResponsiveContainer width="60%" height="100%">
                <RC.PieChart>
                  <RC.Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, i) => (
                      <RC.Cell key={i} fill={entry.color} />
                    ))}
                  </RC.Pie>
                  <RC.Tooltip content={<CustomTooltip />} />
                </RC.PieChart>
              </RC.ResponsiveContainer>
            ) : (
              <div className="w-[60%] h-full flex items-center justify-center text-gray-300">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              {statusPieData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-600 text-xs">{d.name}</span>
                  <span className="font-bold text-gray-900 ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* City Comparison */}
        {cityChartData.length > 0 && (
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-gray-400" /> Buchungen nach Stadt
            </h3>
            <div className="h-64">
              {RC ? (
                <RC.ResponsiveContainer width="100%" height="100%">
                  <RC.BarChart data={cityChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <RC.XAxis dataKey="city" tick={{ fontSize: 10 }} />
                    <RC.YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RC.Tooltip content={<CustomTooltip />} />
                    <RC.Bar dataKey="completed" name="Abgeschlossen" fill={STATUS_COLORS.completed} stackId="stack" />
                    <RC.Bar dataKey="booked" name="Eingebucht" fill={STATUS_COLORS.booked} stackId="stack" />
                    <RC.Bar dataKey="pending" name="Eingeladen" fill={STATUS_COLORS.pending} stackId="stack" />
                    <RC.Legend wrapperStyle={{ fontSize: '11px' }} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-300">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Route Capacity */}
        {capacityData.length > 0 && (
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Building size={16} className="text-gray-400" /> Routen-Auslastung
            </h3>
            <div className="h-64">
              {RC ? (
                <RC.ResponsiveContainer width="100%" height="100%">
                  <RC.BarChart data={capacityData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <RC.XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} />
                    <RC.YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <RC.Tooltip content={<CustomTooltip />} />
                    <RC.Bar dataKey="belegt" name="Belegt" fill="#3b82f6" stackId="cap" />
                    <RC.Bar dataKey="frei" name="Frei" fill="#e2e8f0" stackId="cap" />
                    <RC.Legend wrapperStyle={{ fontSize: '11px' }} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-300">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Upcoming + Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Installations */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-green-500" /> Anstehende Installationen (7 Tage)
          </h3>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
              <Inbox size={28} className="text-gray-300" />
              <p className="text-sm">Keine Termine in den naechsten 7 Tagen</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {upcoming.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                    item.source === 'airtable' ? 'bg-purple-50 border-purple-100' : 'bg-green-50 border-green-100'
                  }`}>
                    <div className={`text-[9px] font-medium leading-none ${
                      item.source === 'airtable' ? 'text-purple-600' : 'text-green-600'
                    }`}>
                      {new Date(item.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short' })}
                    </div>
                    <div className={`text-sm font-bold leading-none ${
                      item.source === 'airtable' ? 'text-purple-700' : 'text-green-700'
                    }`}>
                      {new Date(item.date + 'T00:00:00').getDate()}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                    <div className="text-xs text-gray-400">
                      {item.city}{item.time ? ` | ${item.time}${item.endTime ? `-${item.endTime}` : ''} Uhr` : ''}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    item.source === 'airtable'
                      ? 'bg-purple-100 text-purple-700 border-purple-200'
                      : 'bg-green-100 text-green-700 border-green-200'
                  }`}>
                    {item.source === 'airtable' ? 'Airtable' : 'Eingebucht'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Follow-ups */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Follow-ups noetig
            {pendingFollowups.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                {pendingFollowups.length}
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-400 mb-3">Eingeladen vor &gt;48h, noch nicht gebucht</p>
          {pendingFollowups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
              <CheckCircle size={28} className="text-green-400" />
              <p className="text-sm">Alle Einladungen aktuell</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pendingFollowups.map(b => {
                const hoursSince = Math.round((Date.now() - new Date(b.whatsapp_sent_at).getTime()) / (1000 * 60 * 60));
                return (
                  <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-amber-50/50 transition-colors">
                    <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 border border-amber-100">
                      <Clock size={16} className="text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                      <div className="text-xs text-gray-400">
                        {String(b.city || '')} | {String(b.contact_name || '')} | {String(b.contact_phone || '')}
                      </div>
                    </div>
                    <span className="text-xs text-amber-600 font-mono whitespace-nowrap">
                      vor {hoursSince}h
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Liveticker / Event-Feed */}
      <InstallationLiveticker filterCity={filterCity} />

      {/* Pipeline Status Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {[
          { key: 'pending', label: 'Eingeladen', value: kpis.pending },
          { key: 'booked', label: 'Eingebucht', value: kpis.booked },
          { key: 'completed', label: 'Abgeschlossen', value: kpis.completed },
          { key: 'cancelled', label: 'Storniert', value: kpis.cancelled },
          { key: 'no_show', label: 'No-Show', value: kpis.noShow },
        ].map(item => (
          <div key={item.key} className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-3 text-center">
            <div className="w-3 h-3 rounded-full mx-auto mb-1.5" style={{ backgroundColor: STATUS_COLORS[item.key] }} />
            <div className="text-xl font-bold text-gray-900">{item.value}</div>
            <div className="text-[10px] text-gray-500 font-medium">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
            toast.type === 'error' ? 'bg-red-600 text-white' :
            toast.type === 'info' ? 'bg-blue-600 text-white' :
            'bg-green-600 text-white'
          }`}>
            {toast.type === 'info' && <Loader2 size={14} className="animate-spin" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
