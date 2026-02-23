import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Users, Printer, FileDown,
  Loader2, RefreshCw, AlertTriangle, CheckCircle, Phone, User, Wrench,
  Info, ClipboardList, FileText, Smartphone, Check,
} from 'lucide-react';
import { fetchAllAcquisition, fetchAllInstallationstermine, fetchAllInstallationen } from '../utils/airtableService';
import { INSTALL_API, STATUS_COLORS, toDateString, formatDateDE, formatDateShortDE, parseTimeSlots, mergeAirtableTermine, normalizeCity } from '../utils/installUtils';
import { supabase } from '../utils/authService';

function StatusBadge({ status }) {
  const cfg = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function getJetId(booking, akquise) {
  const id = booking.jet_id;
  if (id && !id.startsWith('rec')) return id;
  return akquise?.jetId || '--';
}

function buildAddress(akquise) {
  if (!akquise) return '';
  return [akquise.street, akquise.streetNumber, akquise.postalCode, akquise.city?.[0]].filter(Boolean).join(' ');
}

function EmptyState({ icon: Icon, iconBg, title, subtitle }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
      <div className={`w-16 h-16 rounded-2xl ${iconBg} flex items-center justify-center`}>
        <Icon size={32} className={iconBg.includes('orange') ? 'text-orange-300' : 'text-gray-300'} />
      </div>
      <p className="font-medium text-gray-600">{title}</p>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════ */

export default function InstallationTeamDashboard() {
  // ── State ──
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));
  const [routes, setRoutes] = useState([]);
  const [weekRoutes, setWeekRoutes] = useState([]); // All routes for current week
  const [bookings, setBookings] = useState([]);
  const [airtableTermine, setAirtableTermine] = useState([]);
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadingAcquisition, setLoadingAcquisition] = useState(false);
  const [installationen, setInstallationen] = useState([]);
  const [monteurLinkCopied, setMonteurLinkCopied] = useState(false);
  const printRef = useRef(null);

  // ── Week Boundaries ──
  const weekInfo = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const dayOfWeek = d.getDay() || 7; // Mon=1, Sun=7
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek + 1);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(toDateString(day));
    }
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday: toDateString(monday), sunday: toDateString(sunday), days };
  }, [selectedDate]);

  // ── Fetch Teams ──
  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(INSTALL_API.TEAMS);
      const data = await res.json();
      const teamList = Array.isArray(data) ? data.filter(t => t.is_active !== false) : [];
      setTeams(teamList);
    } catch (e) {
      console.error('Failed to fetch teams:', e);
    }
  }, []);

  // ── Fetch Routes for entire week ──
  const fetchWeekRoutes = useCallback(async () => {
    try {
      const res = await fetch(`${INSTALL_API.SCHEDULE}?from=${weekInfo.monday}&to=${weekInfo.sunday}`);
      const data = await res.json();
      setWeekRoutes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch week routes:', e);
      setWeekRoutes([]);
    }
  }, [weekInfo.monday, weekInfo.sunday]);

  // ── Fetch Routes for selected date ──
  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${INSTALL_API.SCHEDULE}?from=${selectedDate}&to=${selectedDate}`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch routes:', e);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // ── Fetch Bookings (filtered by current week for performance) ──
  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true);
    try {
      const res = await fetch(`${INSTALL_API.BOOKINGS}?from=${weekInfo.monday}&to=${weekInfo.sunday}`);
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch bookings:', e);
      setBookings([]);
    } finally {
      setLoadingBookings(false);
    }
  }, [weekInfo.monday, weekInfo.sunday]);

  // ── Fetch Airtable Installationstermine ──
  const fetchTermine = useCallback(async () => {
    try {
      const data = await fetchAllInstallationstermine();
      setAirtableTermine(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch AT termine:', e);
    }
  }, []);

  // ── Fetch Acquisition Data ──
  const loadAcquisition = useCallback(async () => {
    setLoadingAcquisition(true);
    try {
      const data = await fetchAllAcquisition();
      setAcquisitionData(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch acquisition data:', e);
    } finally {
      setLoadingAcquisition(false);
    }
  }, []);

  // ── Fetch Installationen (for install status enrichment) ──
  const loadInstallationen = useCallback(async () => {
    try {
      const data = await fetchAllInstallationen();
      setInstallationen(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch installationen:', e);
    }
  }, []);

  // ── Initial data load ──
  useEffect(() => { fetchTeams(); fetchBookings(); fetchTermine(); loadAcquisition(); loadInstallationen(); }, [fetchTeams, fetchBookings, fetchTermine, loadAcquisition, loadInstallationen]);
  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);
  useEffect(() => { fetchWeekRoutes(); }, [fetchWeekRoutes]);

  // ── Auto-select team with most routes this week ──
  useEffect(() => {
    if (selectedTeam || teams.length === 0 || weekRoutes.length === 0) return;
    // Auto-select "Alle Teams" by default
    setSelectedTeam('__alle__');
  }, [teams, weekRoutes, selectedTeam]);

  // ── Merge AT termine with Supabase bookings ──
  const allBookings = useMemo(() => {
    // Combine week routes and day routes for linking
    const allRoutes = [...routes, ...weekRoutes.filter(wr => !routes.some(r => r.id === wr.id))];
    return mergeAirtableTermine(airtableTermine, bookings, allRoutes);
  }, [airtableTermine, bookings, routes, weekRoutes]);

  // ── Week overview: team routes per day ──
  const weekOverview = useMemo(() => {
    if (!selectedTeam) return [];
    const isAll = selectedTeam === '__alle__';
    return weekInfo.days.map(day => {
      const dayRoutes = weekRoutes.filter(r => r.schedule_date === day && (isAll || r.installer_team === selectedTeam));
      const cities = [...new Set(dayRoutes.map(r => r.city).filter(Boolean))];
      const totalCapacity = dayRoutes.reduce((sum, r) => sum + (r.max_capacity || 0), 0);
      const normalizedCities = cities.map(c => normalizeCity(c).toLowerCase());
      const dayBookingCount = allBookings.filter(b => {
        const bDate = b.booked_date || b.scheduled_date;
        if (bDate !== day) return false;
        const bCity = normalizeCity(b.city || '').toLowerCase();
        return normalizedCities.includes(bCity);
      }).length;
      return { date: day, routes: dayRoutes, cities, totalCapacity, bookingCount: dayBookingCount };
    });
  }, [weekInfo.days, weekRoutes, selectedTeam, allBookings]);

  // ── Team routes for selected day ──
  const teamRoutes = useMemo(() => {
    if (!selectedTeam) return [];
    if (selectedTeam === '__alle__') return routes;
    return routes.filter(r => r.installer_team === selectedTeam);
  }, [routes, selectedTeam]);

  // ── Cities on the team's routes ──
  const routeCities = useMemo(() => {
    return [...new Set(teamRoutes.map(r => r.city).filter(Boolean))];
  }, [teamRoutes]);

  // ── Bookings for the selected day matching route cities or team ──
  const dayBookings = useMemo(() => {
    const isAll = selectedTeam === '__alle__';
    if (routeCities.length === 0 && !selectedTeam) return [];
    const normalizedRouteCities = routeCities.map(c => normalizeCity(c).toLowerCase());
    return allBookings
      .filter(b => {
        const bookingDate = b.booked_date || b.scheduled_date;
        if (bookingDate !== selectedDate) return false;
        if (isAll) return true;
        if (b.installer_team === selectedTeam) return true;
        const bCity = normalizeCity(b.city || '').toLowerCase();
        if (normalizedRouteCities.includes(bCity)) return true;
        return false;
      })
      .sort((a, b) => {
        const timeA = a.booked_time || a.scheduled_time || '99:99';
        const timeB = b.booked_time || b.scheduled_time || '99:99';
        return timeA.localeCompare(timeB);
      });
  }, [allBookings, selectedDate, routeCities, selectedTeam]);

  // ── Map bookings to acquisition data + installation status ──
  const enrichedBookings = useMemo(() => {
    // Build lookup maps for installationen (by akquise_link and jet_id)
    const installByAkquise = new Map();
    const installByJetId = new Map();
    for (const inst of installationen) {
      if (inst.akquiseLinks?.length) {
        for (const link of inst.akquiseLinks) {
          if (link && !installByAkquise.has(link)) installByAkquise.set(link, inst);
        }
      }
      if (inst.jetId && !inst.jetId.startsWith('rec')) {
        if (!installByJetId.has(inst.jetId)) installByJetId.set(inst.jetId, inst);
      }
    }

    if (dayBookings.length > 0) {
      console.log(`[enrichedBookings] ${dayBookings.length} bookings, ${installationen.length} installationen, akquise-map: ${installByAkquise.size}, jetId-map: ${installByJetId.size}`);
    }

    return dayBookings.map(b => {
      const akquise = acquisitionData.find(a =>
        a.id === b.akquise_airtable_id || a.id === b.akquise_record_id
      ) || null;

      // Enrich with installation status from Supabase installationen table
      // Match via akquise_airtable_id or jet_id
      let statusInstallation = b._statusInstallation || '';
      if (!statusInstallation) {
        const matchedInstall = (b.akquise_airtable_id && installByAkquise.get(b.akquise_airtable_id))
          || (b.jet_id && !b.jet_id.startsWith('rec') && installByJetId.get(b.jet_id))
          || null;
        if (matchedInstall?.status) {
          statusInstallation = matchedInstall.status;
        }
      }

      return { ...b, akquise, _statusInstallation: statusInstallation || b._statusInstallation || '' };
    });
  }, [dayBookings, acquisitionData, installationen]);

  // ── Summary KPIs ──
  const summary = useMemo(() => {
    const total = enrichedBookings.length;
    const completed = enrichedBookings.filter(b => b.status === 'completed').length;
    const confirmed = enrichedBookings.filter(b => b.status === 'confirmed' || b.status === 'booked').length;
    const pending = enrichedBookings.filter(b => b.status === 'pending').length;
    const noShow = enrichedBookings.filter(b => b.status === 'no_show').length;
    const cancelled = enrichedBookings.filter(b => b.status === 'cancelled').length;
    const currentTeam = selectedTeam === '__alle__' ? null : teams.find(t => t.name === selectedTeam);
    return { total, completed, confirmed, pending, noShow, cancelled, cities: routeCities, teamDescription: currentTeam?.description || '' };
  }, [enrichedBookings, routeCities, teams, selectedTeam]);

  // ── Date Navigation ──
  const navigateDate = (offsetDays) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offsetDays);
    setSelectedDate(toDateString(d));
  };

  const goToToday = () => setSelectedDate(toDateString(new Date()));

  const refreshAll = () => {
    fetchTeams();
    fetchRoutes();
    fetchWeekRoutes();
    fetchBookings();
    fetchTermine();
    loadInstallationen();
    loadAcquisition();
  };

  // ── Monteur Link Generator ──
  const copyMonteurLink = useCallback(async () => {
    if (!selectedTeam || selectedTeam === '__alle__') return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert('Bitte zuerst einloggen.');
        return;
      }
      const res = await fetch('/api/install-monteur/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ team: selectedTeam, date: selectedDate }),
      });
      const data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        setMonteurLinkCopied(true);
        setTimeout(() => setMonteurLinkCopied(false), 3000);
      } else {
        alert('Monteur-Link konnte nicht erstellt werden.');
      }
    } catch (e) {
      console.error('[TeamDashboard] Monteur link error:', e);
      alert('Fehler beim Erstellen des Monteur-Links.');
    }
  }, [selectedTeam, selectedDate]);

  // ── Week Overview Export (CSV for print / Excel) ──
  const exportWeekOverview = useCallback(() => {
    if (!selectedTeam) return;
    const isAll = selectedTeam === '__alle__';
    const rows = [];
    for (const day of weekInfo.days) {
      const dayRoutes = weekRoutes.filter(r => r.schedule_date === day && (isAll || r.installer_team === selectedTeam));
      const cities = [...new Set(dayRoutes.map(r => r.city).filter(Boolean))];
      if (cities.length === 0) continue;

      const dayBookingsForExport = allBookings
        .filter(b => {
          const bookingDate = b.booked_date || b.scheduled_date;
          if (bookingDate !== day) return false;
          if (isAll) return cities.includes(b.city);
          return b.installer_team === selectedTeam || cities.includes(b.city);
        })
        .sort((a, b) => (a.booked_time || '99:99').localeCompare(b.booked_time || '99:99'));

      if (dayBookingsForExport.length === 0) {
        rows.push({
          team: isAll ? [...new Set(dayRoutes.map(r => r.installer_team).filter(Boolean))].join(', ') : selectedTeam,
          tag: formatDateShortDE(day),
          stadt: cities.join(', '),
          zeit: '--', standort: '--', jetId: '--', adresse: '--',
          kontakt: '--', telefon: '--', montage: '--', hinweise: 'Keine Termine',
        });
        continue;
      }

      for (const b of dayBookingsForExport) {
        const akq = acquisitionData.find(a => a.id === b.akquise_airtable_id || a.id === b.akquise_record_id) || null;
        rows.push({
          team: b.installer_team || '--',
          tag: formatDateShortDE(day),
          stadt: b.city || '',
          zeit: `${b.booked_time || '--'} - ${b.booked_end_time || '--'}`,
          standort: b.location_name || akq?.locationName || '--',
          jetId: getJetId(b, akq),
          adresse: buildAddress(akq) || b.city || '',
          kontakt: b.contact_name || akq?.contactPerson || '--',
          telefon: b.contact_phone || akq?.contactPhone || '--',
          montage: akq?.mountType || '--',
          hinweise: [b.notes, akq?.hindernisse].filter(Boolean).join(' | ') || '--',
        });
      }
    }

    if (rows.length === 0) return;

    const headers = isAll
      ? ['Team', 'Tag', 'Stadt', 'Zeit', 'Standort', 'JET-ID', 'Adresse', 'Kontakt', 'Telefon', 'Montage', 'Hinweise']
      : ['Tag', 'Stadt', 'Zeit', 'Standort', 'JET-ID', 'Adresse', 'Kontakt', 'Telefon', 'Montage', 'Hinweise'];
    const csvRows = [headers.join(';')];
    for (const r of rows) {
      const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
      const vals = isAll
        ? [r.team, r.tag, r.stadt, r.zeit, r.standort, r.jetId, r.adresse, r.kontakt, r.telefon, r.montage, r.hinweise]
        : [r.tag, r.stadt, r.zeit, r.standort, r.jetId, r.adresse, r.kontakt, r.telefon, r.montage, r.hinweise];
      csvRows.push(vals.map(escape).join(';'));
    }
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Wochenplan_${isAll ? 'Alle_Teams' : selectedTeam}_${weekInfo.monday}_${weekInfo.sunday}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedTeam, weekInfo, weekRoutes, allBookings, acquisitionData]);

  const todayStr = toDateString(new Date());
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toDateString(d); })();
  const isToday = selectedDate === todayStr;
  const isLoading = loading || loadingBookings;

  return (
    <>
      {/* Print-specific styles — professional Installations-Routenblatt */}
      <style>{`
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-container { padding: 0 !important; margin: 0 !important; }

          /* Page setup */
          @page { margin: 10mm 12mm 10mm 12mm; size: A4 portrait; }

          /* ── HEADER ── */
          .print-header-bar {
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 3px solid #FF8000; padding-bottom: 8px; margin-bottom: 12px;
          }
          .print-header-bar .ph-left h1 { font-size: 16px; font-weight: 800; margin: 0; color: #111; letter-spacing: -0.3px; }
          .print-header-bar .ph-left p { font-size: 10px; color: #6b7280; margin: 2px 0 0; }
          .print-header-bar .ph-right { text-align: right; font-size: 10px; color: #6b7280; }
          .print-header-bar .ph-right .ph-date { font-size: 13px; font-weight: 700; color: #111; }
          .print-header-bar .ph-brand { font-size: 11px; font-weight: 700; color: #FF8000; letter-spacing: 0.5px; }

          /* ── ROUTE INFO CARDS ── */
          .print-route-cards { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
          .print-route-card {
            flex: 1; min-width: 140px; border: 1.5px solid #e5e7eb; border-radius: 6px;
            padding: 6px 10px; font-size: 10px; background: #fafafa;
          }
          .print-route-card .prc-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; font-weight: 600; }
          .print-route-card .prc-value { font-size: 12px; font-weight: 700; color: #111; margin-top: 1px; }
          .print-route-card .prc-sub { font-size: 9px; color: #6b7280; }

          /* ── TABLE ── */
          .print-table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
          .print-table th {
            background: #1f2937 !important; color: white !important;
            padding: 5px 6px; text-align: left; font-size: 8px;
            text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700;
            border: none;
          }
          .print-table td {
            border-bottom: 1px solid #e5e7eb; padding: 6px 6px;
            vertical-align: top; line-height: 1.35;
          }
          .print-table tr:nth-child(even) td { background: #f9fafb; }
          .print-table .pt-nr { width: 20px; text-align: center; font-weight: 700; color: #FF8000; font-size: 11px; }
          .print-table .pt-time { font-family: monospace; font-weight: 700; font-size: 11px; white-space: nowrap; }
          .print-table .pt-name { font-weight: 700; font-size: 10px; }
          .print-table .pt-jet { font-family: monospace; font-size: 9px; color: #6b7280; }
          .print-table .pt-addr { font-size: 9px; color: #374151; max-width: 160px; }
          .print-table .pt-contact { font-size: 9.5px; font-weight: 600; }
          .print-table .pt-phone { font-family: monospace; font-size: 10px; font-weight: 700; color: #111; letter-spacing: 0.3px; }
          .print-table .pt-mount { font-size: 9px; }
          .print-table .pt-notes {
            font-size: 8.5px; color: #92400e; background: #fffbeb;
            padding: 2px 4px; border-radius: 2px; border-left: 2px solid #f59e0b;
            max-width: 200px;
          }
          .print-table .pt-status {
            display: inline-block; padding: 1px 5px; border-radius: 3px;
            font-size: 8px; font-weight: 700; text-transform: uppercase;
          }
          .print-table .pt-status-confirmed { background: #dcfce7; color: #166534; }
          .print-table .pt-status-completed { background: #d1fae5; color: #065f46; }
          .print-table .pt-status-pending { background: #fef9c3; color: #854d0e; }
          .print-table .pt-status-cancelled { background: #fee2e2; color: #991b1b; }
          .print-table .pt-status-no_show { background: #f3f4f6; color: #374151; }
          .print-table .pt-checkbox { width: 14px; height: 14px; border: 1.5px solid #d1d5db; border-radius: 2px; display: inline-block; vertical-align: middle; }

          /* ── FOOTER ── */
          .print-footer-bar {
            margin-top: 12px; padding-top: 6px; border-top: 1px solid #e5e7eb;
            display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af;
          }

          /* ── NOTES SECTION ── */
          .print-notes-section {
            margin-top: 14px; border: 1.5px solid #e5e7eb; border-radius: 6px; padding: 8px 10px;
          }
          .print-notes-section h4 { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin: 0 0 8px; letter-spacing: 0.4px; }
          .print-notes-line { border-bottom: 1px dotted #d1d5db; height: 22px; margin-bottom: 2px; }
        }
      `}</style>

      <div className="space-y-6 print-container" ref={printRef}>
        {/* ── Print Layout (hidden on screen, visible on print) ── */}
        <div className="print-only hidden">
          {/* Header Bar */}
          <div className="print-header-bar">
            <div className="ph-left">
              <div className="ph-brand">LIEFERANDO DISPLAY</div>
              <h1>Installations-Routenblatt</h1>
              <p>{enrichedBookings.length} Termine {summary.cities.length > 0 ? `in ${summary.cities.join(', ')}` : ''}</p>
            </div>
            <div className="ph-right">
              <div className="ph-date">{formatDateDE(selectedDate)}</div>
              <div>{selectedTeam === '__alle__' ? 'Alle Teams' : selectedTeam}</div>
            </div>
          </div>

          {/* Route Info Cards */}
          <div className="print-route-cards">
            {teamRoutes.map(route => {
              const slots = parseTimeSlots(route.time_slots);
              const routeBookingCount = enrichedBookings.filter(b => b.route_id === route.id || (!b.route_id && b.city === route.city)).length;
              return (
                <div key={route.id} className="print-route-card">
                  <div className="prc-label">Route</div>
                  <div className="prc-value">{route.city}</div>
                  <div className="prc-sub">
                    {route.installer_team || '--'} | {routeBookingCount}/{route.max_capacity || '--'} Termine | {slots.length > 0 ? `${slots[0]}–${slots[slots.length-1]}` : '--'}
                  </div>
                </div>
              );
            })}
            <div className="print-route-card">
              <div className="prc-label">Zusammenfassung</div>
              <div className="prc-value">{enrichedBookings.length} Termine</div>
              <div className="prc-sub">
                {summary.confirmed > 0 ? `${summary.confirmed} best.` : ''}{summary.completed > 0 ? ` ${summary.completed} install.` : ''}{summary.pending > 0 ? ` ${summary.pending} ausst.` : ''}
              </div>
            </div>
          </div>

          {/* Print Table */}
          <table className="print-table">
            <thead>
              <tr>
                <th style={{width: '20px'}}>#</th>
                <th>Zeit</th>
                <th>Standort / JET-ID</th>
                <th>Adresse</th>
                <th>Kontakt / Telefon</th>
                <th>Montage</th>
                <th>Hinweise / Kommentare</th>
                <th style={{width: '16px', textAlign: 'center'}}>&#10003;</th>
              </tr>
            </thead>
            <tbody>
              {enrichedBookings.map((b, idx) => {
                const time = b.booked_time || b.scheduled_time || '--';
                const endTime = b.booked_end_time || '';
                const akq = b.akquise;
                const contact = b.contact_name || akq?.contactPerson || '--';
                const phone = b.contact_phone || akq?.contactPhone || '--';
                const hindernisse = akq?.hindernisse || '';
                const bNotes = b.notes || '';
                const akqKommentar = akq?.akquiseKommentar || '';
                const allNotes = [hindernisse, akqKommentar, bNotes].filter(Boolean);
                const statusClass = `pt-status pt-status-${b.status || 'pending'}`;

                return (
                  <tr key={b.id || idx}>
                    <td className="pt-nr">{idx + 1}</td>
                    <td>
                      <div className="pt-time">{time}</div>
                      {endTime && <div style={{fontSize:'8px', color:'#9ca3af'}}>bis {endTime}</div>}
                    </td>
                    <td>
                      <div className="pt-name">{b.location_name || akq?.locationName || '--'}</div>
                      <div className="pt-jet">{getJetId(b, akq)}</div>
                      {b.installer_team && <div style={{fontSize:'8px', color:'#FF8000', fontWeight:600}}>{b.installer_team}</div>}
                    </td>
                    <td className="pt-addr">{buildAddress(akq) || b.city || '--'}</td>
                    <td>
                      <div className="pt-contact">{contact}</div>
                      <div className="pt-phone">{phone}</div>
                    </td>
                    <td className="pt-mount">{akq?.mountType || '--'}</td>
                    <td>
                      {allNotes.length > 0 ? (
                        <div className="pt-notes">{allNotes.join(' | ')}</div>
                      ) : (
                        <span style={{color:'#d1d5db'}}>—</span>
                      )}
                      <span className={statusClass} style={{marginTop: '3px', display: 'inline-block'}}>
                        {b.status === 'confirmed' || b.status === 'booked' ? 'Best.' : b.status === 'completed' ? 'Install.' : b.status === 'pending' ? 'Ausst.' : b.status === 'cancelled' ? 'Storno' : b.status === 'no_show' ? 'No-Show' : b.status || '—'}
                      </span>
                    </td>
                    <td style={{textAlign:'center'}}><span className="pt-checkbox"></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Notes Section — blank lines for handwritten notes */}
          <div className="print-notes-section">
            <h4>Notizen</h4>
            <div className="print-notes-line"></div>
            <div className="print-notes-line"></div>
            <div className="print-notes-line"></div>
          </div>

          {/* Footer */}
          <div className="print-footer-bar">
            <span>JET Germany GmbH — DOOH Installation</span>
            <span>Erstellt: {new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* ── Screen Header ── */}
        <div className="no-print flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Team-Tagesplan</h2>
            <p className="text-gray-500 mt-1">Tagesroute, Termine und Druckansicht fuer Installationsteams.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#FF8000] text-white rounded-xl hover:bg-[#e67300] font-medium text-sm transition-colors shadow-sm"
            >
              <Printer size={16} /> Drucken
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors"
            >
              <FileDown size={16} /> PDF speichern
            </button>
            <button
              onClick={refreshAll}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            </button>
            {selectedTeam && selectedTeam !== '__alle__' && (
              <button
                onClick={copyMonteurLink}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-sm ${
                  monteurLinkCopied
                    ? 'bg-green-500 text-white'
                    : 'bg-white/60 backdrop-blur-xl border border-slate-200/60 hover:bg-white/80 text-gray-700'
                }`}
                title="Monteur-Link fuer diesen Tag generieren und kopieren"
              >
                {monteurLinkCopied ? <Check size={16} /> : <Smartphone size={16} />}
                {monteurLinkCopied ? 'Link kopiert!' : 'Monteur-Link'}
              </button>
            )}
          </div>
        </div>

        {/* ── Team Selector + Date Navigation ── */}
        <div className="no-print flex flex-wrap items-center gap-3">
          {/* Team Dropdown */}
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#FF8000]" />
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all min-w-[180px]"
            >
              <option value="">Team waehlen...</option>
              <option value="__alle__">Alle Teams</option>
              {teams.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Date Quick Navigation */}
          <div className="flex items-center gap-1 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-1">
            <button
              onClick={() => navigateDate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Vorheriger Tag"
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[120px] text-center">
              {formatDateShortDE(selectedDate)}
            </span>
            <button
              onClick={() => navigateDate(1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Naechster Tag"
            >
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>

          {!isToday && (
            <button
              onClick={goToToday}
              className="px-3 py-2 text-xs font-medium text-[#FF8000] bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors"
            >
              Heute
            </button>
          )}

          <button
            onClick={() => setSelectedDate(tomorrowStr)}
            className={`px-3 py-2 text-xs font-medium rounded-xl transition-colors ${
              selectedDate === tomorrowStr
                ? 'bg-[#FF8000] text-white'
                : 'text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            Morgen
          </button>

          {/* Date picker (hidden, accessible) */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2 py-1.5 text-xs bg-white/60 border border-slate-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400/30"
          />
        </div>

        {/* ── Week Overview (click to jump to day) ── */}
        {selectedTeam && (
          <div className="no-print bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => navigateDate(-7)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronLeft size={16} className="text-gray-500" />
                </button>
                <h3 className="text-sm font-semibold text-gray-700">
                  Woche {formatDateShortDE(weekInfo.monday)} — {formatDateShortDE(weekInfo.sunday)}
                </h3>
                <button onClick={() => navigateDate(7)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <ChevronRight size={16} className="text-gray-500" />
                </button>
              </div>
              <button
                onClick={exportWeekOverview}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#FF8000] bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                title="Wochenplan als CSV exportieren"
              >
                <FileDown size={13} /> Woche exportieren
              </button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekOverview.map(day => {
                const isSelected = day.date === selectedDate;
                const isToday2 = day.date === toDateString(new Date());
                const hasRoutes = day.routes.length > 0;
                const isWeekend = new Date(day.date + 'T00:00:00').getDay() === 0 || new Date(day.date + 'T00:00:00').getDay() === 6;
                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`relative rounded-xl p-2 text-center transition-all border ${
                      isSelected
                        ? 'bg-[#FF8000] text-white border-[#e67300] shadow-md ring-2 ring-orange-300'
                        : hasRoutes
                        ? 'bg-orange-50 border-orange-200 hover:bg-orange-100 text-gray-900'
                        : isWeekend
                        ? 'bg-gray-50 border-gray-100 text-gray-300'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-400'
                    }`}
                  >
                    {/* Day label */}
                    <div className={`text-[10px] font-semibold uppercase ${isSelected ? 'text-white/80' : isToday2 ? 'text-[#FF8000]' : ''}`}>
                      {new Date(day.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short' })}
                    </div>
                    {/* Day number */}
                    <div className={`text-lg font-bold ${isSelected ? '' : isToday2 ? 'text-[#FF8000]' : ''}`}>
                      {new Date(day.date + 'T00:00:00').getDate()}
                    </div>
                    {/* Cities + booking count */}
                    {hasRoutes && (
                      <div className={`mt-1 space-y-0.5 ${isSelected ? 'text-white/90' : ''}`}>
                        {day.cities.map(c => (
                          <div key={c} className={`text-[9px] font-medium truncate ${isSelected ? '' : 'text-orange-700'}`}>
                            {c}
                          </div>
                        ))}
                        {day.bookingCount > 0 && (
                          <div className={`text-[9px] font-bold ${isSelected ? 'text-white' : 'text-blue-600'}`}>
                            {day.bookingCount} Termine
                          </div>
                        )}
                      </div>
                    )}
                    {/* Today dot */}
                    {isToday2 && !isSelected && (
                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#FF8000]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total Appointments */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#FFF0E0] flex items-center justify-center">
                <ClipboardList size={16} className="text-[#FF8000]" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
            <div className="text-xs text-gray-500 font-medium">Termine gesamt</div>
          </div>

          {/* Installiert (completed) */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-700">{summary.completed}</div>
            <div className="text-xs text-gray-500 font-medium">Installiert</div>
          </div>

          {/* Confirmed */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle size={16} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-green-700">{summary.confirmed}</div>
            <div className="text-xs text-gray-500 font-medium">Bestaetigt</div>
          </div>

          {/* Pending */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock size={16} className="text-yellow-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-yellow-700">{summary.pending}</div>
            <div className="text-xs text-gray-500 font-medium">Ausstehend</div>
          </div>

          {/* Cities */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <MapPin size={16} className="text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{summary.cities.length}</div>
            <div className="text-xs text-gray-500 font-medium truncate" title={summary.cities.join(', ')}>
              {summary.cities.length > 0 ? summary.cities.join(', ') : 'Keine Staedte'}
            </div>
          </div>
        </div>

        {/* ── Route Overview Cards ── */}
        {teamRoutes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider no-print">Routen</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamRoutes.map(route => {
                const slots = parseTimeSlots(route.time_slots);
                const routeBookingCount = enrichedBookings.filter(b => b.route_id === route.id || (!b.route_id && b.city === route.city)).length;
                return (
                  <div key={route.id} className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 hover:bg-white/80 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-[#FF8000]" />
                        <div>
                          <span className="font-semibold text-gray-900">{route.city}</span>
                          {route.installer_team && (
                            <div className="text-[10px] text-[#FF8000] font-semibold flex items-center gap-0.5">
                              <Users size={9} /> {route.installer_team}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        route.status === 'open'
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : route.status === 'full'
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}>
                        {route.status === 'open' ? 'Offen' : route.status === 'full' ? 'Voll' : route.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-gray-400" />
                        {slots.length > 0 ? `${slots[0]} - ${slots[slots.length - 1]} Uhr` : 'Keine Zeitfenster'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users size={12} className="text-gray-400" />
                        {routeBookingCount} / {route.max_capacity || '--'} Termine
                      </div>
                    </div>

                    {slots.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {slots.map(s => (
                          <span key={s} className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-[10px] font-mono border border-orange-200">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {route.notes && (
                      <div className="mt-2 text-xs text-gray-500 flex items-start gap-1">
                        <Info size={11} className="mt-0.5 shrink-0 text-gray-400" />
                        <span>{route.notes}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* (Print route info is now in the print-only header above) */}
          </div>
        )}

        {/* ── Timeline View ── */}
        {enrichedBookings.length > 0 && (
          <div className="no-print space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Tagesablauf</h3>
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 overflow-x-auto">
              <div className="flex gap-3 min-w-[600px]">
                {enrichedBookings.map((b, idx) => {
                  const statusCfg = STATUS_COLORS[b.status] || STATUS_COLORS.pending;
                  const time = b.booked_time || b.scheduled_time || '--';
                  const endTime = b.booked_end_time || '';
                  return (
                    <div key={b.id || idx} className="flex-shrink-0 w-52">
                      {/* Time indicator */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-3 h-3 rounded-full ${statusCfg.dot}`} />
                        <span className="text-sm font-bold text-gray-900 font-mono">{time}{endTime ? ` - ${endTime}` : ''}</span>
                      </div>
                      {/* Card */}
                      <div className={`border rounded-xl p-3 ${statusCfg.border} ${statusCfg.bg} bg-opacity-30`}>
                        <div className="text-sm font-semibold text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <MapPin size={10} /> {b.city}
                        </div>
                        {b.installer_team && (
                          <div className="text-[10px] text-[#FF8000] mt-0.5 flex items-center gap-1 font-semibold">
                            <Users size={10} /> {b.installer_team}
                          </div>
                        )}
                        {b.contact_name && (
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <User size={10} /> {b.contact_name}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <StatusBadge status={b.status} />
                          {b._statusInstallation && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              /installiert|live|erfolgreich/i.test(b._statusInstallation)
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : /abgebrochen|fehlgeschlagen/i.test(b._statusInstallation)
                                ? 'bg-red-100 text-red-700 border border-red-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {/installiert|live|erfolgreich/i.test(b._statusInstallation) ? '\u2713' : '\u2139'} {b._statusInstallation}
                            </span>
                          )}
                          {!b._statusInstallation && b.status === 'completed' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              &#10003; Installiert
                            </span>
                          )}
                          {b.status === 'no_show' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                              &#10007; No-Show
                            </span>
                          )}
                          {b.status === 'cancelled' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                              &#10007; Storniert
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Appointments Table ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider no-print">Terminliste</h3>

          {isLoading ? (
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
              <Loader2 size={24} className="animate-spin text-[#FF8000]" />
              <p className="text-sm">Daten werden geladen...</p>
            </div>
          ) : !selectedTeam ? (
            <EmptyState
              icon={Users}
              iconBg="bg-orange-50"
              title="Bitte ein Team auswaehlen"
              subtitle="Waehle oben ein Team, um den Tagesplan zu sehen."
            />
          ) : teamRoutes.length === 0 ? (
            <EmptyState
              icon={Calendar}
              iconBg="bg-gray-100"
              title="Keine Routen fuer diesen Tag"
              subtitle={`${selectedTeam === '__alle__' ? 'Alle Teams' : selectedTeam} hat am ${formatDateShortDE(selectedDate)} keine zugewiesenen Routen.`}
            />
          ) : enrichedBookings.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              iconBg="bg-orange-50"
              title="Keine Termine fuer diesen Tag"
              subtitle={`Es gibt noch keine Buchungen fuer die Routen von ${selectedTeam === '__alle__' ? 'Alle Teams' : selectedTeam} am ${formatDateShortDE(selectedDate)}.`}
            />
          ) : (
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full print-table">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Zeit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Standort</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">JET-ID</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Team / Tour</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Adresse</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakt</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Telefon</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Montage</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Hinweise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {enrichedBookings.map((b, idx) => {
                      const time = b.booked_time || b.scheduled_time || '--';
                      const endTime = b.booked_end_time || '';
                      const akq = b.akquise;
                      const contact = b.contact_name || akq?.contactPerson || '--';
                      const phone = b.contact_phone || akq?.contactPhone || '--';
                      const hindernisse = akq?.hindernisse || '';
                      const notes = b.notes || '';

                      return (
                        <tr key={b.id || idx} className="hover:bg-white/80 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Clock size={13} className="text-gray-400 shrink-0" />
                              <span className="font-mono text-sm font-semibold text-gray-900">
                                {time}{endTime ? ` - ${endTime}` : ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 text-sm">{b.location_name || akq?.locationName || '--'}</div>
                            <div className="text-xs text-gray-400 flex items-center gap-1">
                              <MapPin size={10} /> {b.city}
                            </div>
                            {b._statusInstallation && (
                              <span className={`inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                /installiert|live|erfolgreich/i.test(b._statusInstallation)
                                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                  : /abgebrochen|fehlgeschlagen/i.test(b._statusInstallation)
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : 'bg-blue-100 text-blue-700 border border-blue-200'
                              }`}>
                                {/installiert|live|erfolgreich/i.test(b._statusInstallation) ? '\u2713' : '\u2139'} {b._statusInstallation}
                              </span>
                            )}
                            {!b._statusInstallation && b.status === 'completed' && (
                              <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                &#10003; Installiert
                              </span>
                            )}
                            {b.status === 'no_show' && (
                              <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                &#10007; No-Show
                              </span>
                            )}
                            {b.status === 'cancelled' && (
                              <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                &#10007; Storniert
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-gray-600 font-mono">
                              {getJetId(b, akq)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {b.installer_team && (
                              <div className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                                <Users size={11} className="text-[#FF8000] shrink-0" />
                                {b.installer_team}
                              </div>
                            )}
                            {(() => {
                              const matchedRoute = teamRoutes.find(r => r.id === b.route_id) || teamRoutes.find(r => r.city === b.city);
                              return matchedRoute ? (
                                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                                  <MapPin size={9} className="text-gray-400 shrink-0" />
                                  {matchedRoute.city} Tour
                                </div>
                              ) : b.city ? (
                                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                                  <MapPin size={9} className="text-gray-400 shrink-0" />
                                  {b.city}
                                </div>
                              ) : null;
                            })()}
                            {!b.installer_team && (
                              <div className="text-[10px] text-gray-400 italic">Kein Team</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-700">{buildAddress(akq) || '--'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 flex items-center gap-1">
                              <User size={12} className="text-gray-400 shrink-0" />
                              {contact}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-700 font-mono flex items-center gap-1">
                              <Phone size={12} className="text-gray-400 shrink-0" />
                              {phone}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={b.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-700 flex items-center gap-1">
                              <Wrench size={12} className="text-gray-400 shrink-0" />
                              {akq?.mountType || '--'}
                            </div>
                            {(() => {
                              const proto = akq?.installationsprotokoll;
                              const protoUrl = Array.isArray(proto) && proto.length > 0 ? (proto[0]?.url || proto[0]) : null;
                              return protoUrl ? (
                                <a
                                  href={protoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                                >
                                  <FileText size={10} /> Protokoll
                                </a>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            {(hindernisse || notes) ? (
                              <div className="text-xs text-gray-500 max-w-[200px]">
                                {hindernisse && (
                                  <span className="inline-flex items-center gap-0.5 text-amber-600 mr-1">
                                    <AlertTriangle size={10} /> {hindernisse}
                                  </span>
                                )}
                                {notes && hindernisse && ' | '}
                                {notes && <span>{notes}</span>}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* (Print footer is now embedded in the print-only layout above) */}
      </div>
    </>
  );
}
