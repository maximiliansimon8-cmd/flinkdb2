import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, CheckCircle, Clock, RefreshCw, Loader2, Building, X,
  CalendarCheck, AlertTriangle, ArrowUpDown,
  Filter, PhoneOff, Calendar, Send,
} from 'lucide-react';
import { fetchAllAcquisition, fetchAllInstallationstermine } from '../utils/airtableService';
import { INSTALL_API, formatDateYear as formatDate, triggerSyncAndReload } from '../utils/installUtils';
import { isStorno, isAlreadyInstalled, isReadyForInstall } from '../metrics';
import UnifiedStandortDetail from './UnifiedStandortDetail';

/* ── Status Badges ── */

const BOOKING_STATUS_BADGES = {
  none:      { label: 'Kein Termin',   color: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock },
  pending:   { label: 'Eingeladen',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Send },
  booked:    { label: 'Eingebucht',    color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  confirmed: { label: 'Eingebucht',    color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  completed: { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled: { label: 'Storniert',     color: 'bg-red-100 text-red-700 border-red-200', icon: X },
};

function BookingStatusBadge({ status }) {
  const cfg = BOOKING_STATUS_BADGES[status] || BOOKING_STATUS_BADGES.none;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

/* ── KPI Card ── */
function KPICard({ label, value, icon: Icon, color, bgColor, subtitle }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 text-left transition-all hover:bg-white/80 hover:shadow-md">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bgColor}`}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 font-medium mt-0.5">{label}</div>
      {subtitle && <div className="text-[10px] text-gray-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT: InstallationReadyLocations
   ════════════════════════════════════════════════════════════ */

export default function InstallationReadyLocations({ filterCity: filterCityProp }) {
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [termine, setTermine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterBookingStatus, setFilterBookingStatus] = useState(''); // '' | 'eingebucht' | 'eingeladen' | 'kein_termin'
  const [filterPhone, setFilterPhone] = useState(''); // '' | 'with' | 'without'
  const [sortField, setSortField] = useState('locationName');
  const [sortDir, setSortDir] = useState('asc');
  const [detailStandort, setDetailStandort] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load data — must be declared BEFORE handleRefresh (TDZ)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [acqData, bookRes, terminData] = await Promise.all([
        fetchAllAcquisition(),
        fetch(INSTALL_API.BOOKINGS + '?').then(r => r.json()).catch(() => []),
        fetchAllInstallationstermine().catch(() => []),
      ]);
      setAcquisitionData(Array.isArray(acqData) ? acqData : []);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
      setTermine(Array.isArray(terminData) ? terminData : []);
    } catch (e) {
      console.error('Failed to load ready locations data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    await triggerSyncAndReload(loadData, showToast);
    setSyncing(false);
  }, [loadData, showToast]);

  // Sync global city filter from parent
  useEffect(() => {
    if (filterCityProp !== undefined && filterCityProp !== '') {
      setFilterCity(filterCityProp);
    }
  }, [filterCityProp]);

  useEffect(() => { loadData(); }, [loadData]);

  // Booking lookup by akquise_airtable_id (install_bookings from our own system)
  // Only future or active bookings count as "mit Termin"
  const bookingByAkquise = useMemo(() => {
    const map = new Map();
    const today = new Date().toLocaleDateString('sv-SE');
    for (const b of bookings) {
      if (!b.akquise_airtable_id) continue;
      // Skip past bookings with booked status (already happened, not counted as upcoming)
      if ((b.status === 'booked' || b.status === 'confirmed') && b.booked_date && b.booked_date < today) continue;
      // Skip completed/cancelled/no_show — those aren't active appointments
      if (b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show') continue;
      map.set(b.akquise_airtable_id, b);
    }
    return map;
  }, [bookings]);

  // Installationstermine lookup by akquise record ID (from Airtable Installationstermine table)
  // Only count "Geplant" termine with future dates as active (past termine don't count as "mit Termin")
  const terminByAkquise = useMemo(() => {
    const map = new Map();
    const today = new Date().toLocaleDateString('sv-SE');
    for (const t of termine) {
      const links = t.akquiseLinks || [];
      const status = t.terminstatus || '';
      // "Durchgeführt" always counts (completed)
      const isDurchgefuehrt = status === 'Durchgeführt' || status === 'Durchgefuehrt';
      // "Geplant" only counts if date is in the future
      const isGeplant = status === 'Geplant' || !status;
      const terminDate = t.installationsdatumNurDatum || t.installationsdatum || '';
      const dateStr = terminDate ? terminDate.substring(0, 10) : '';
      const isFuture = dateStr >= today;

      if (isDurchgefuehrt || (isGeplant && isFuture)) {
        for (const akqId of links) {
          // Keep the latest termin per akquise
          const existing = map.get(akqId);
          if (!existing || (t.installationsdatum && (!existing.installationsdatum || t.installationsdatum > existing.installationsdatum))) {
            map.set(akqId, t);
          }
        }
      }
    }
    return map;
  }, [termine]);

  // Combined: has any kind of appointment (either booking or Airtable termin)
  const hasAppointment = useCallback((akquiseId) => {
    return bookingByAkquise.has(akquiseId) || terminByAkquise.has(akquiseId);
  }, [bookingByAkquise, terminByAkquise]);

  /**
   * Granular booking status for filtering:
   *  - 'eingebucht'    → has a confirmed/booked date (real appointment) OR Airtable termin
   *  - 'eingeladen'    → booking exists with status 'pending' (only invited, no date yet)
   *  - 'kein_termin'   → no booking and no termin at all
   */
  const getBookingCategory = useCallback((akquiseId) => {
    const booking = bookingByAkquise.get(akquiseId);
    const termin = terminByAkquise.get(akquiseId);
    // Airtable termin always means a real appointment
    if (termin) return 'eingebucht';
    if (!booking) return 'kein_termin';
    // Booking exists — check if actually booked or only invited
    if (booking.status === 'booked' || booking.status === 'confirmed') return 'eingebucht';
    if (booking.status === 'pending') return 'eingeladen';
    return 'kein_termin';
  }, [bookingByAkquise, terminByAkquise]);

  // All aufbaubereite standorte (ready for install, not storno, not already installed)
  // Uses canonical predicates from src/metrics/predicates.js — NO local test-entry filtering.
  // All AT "Aufbaubereit" records must appear here consistently.
  const readyStandorte = useMemo(() => {
    return acquisitionData.filter(a => {
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;
      if (!isReadyForInstall(a)) return false;
      return true;
    });
  }, [acquisitionData]);

  // KPIs
  const kpis = useMemo(() => {
    const total = readyStandorte.length;
    let eingebucht = 0, eingeladen = 0, keinTermin = 0;
    for (const a of readyStandorte) {
      const cat = getBookingCategory(a.id);
      if (cat === 'eingebucht') eingebucht++;
      else if (cat === 'eingeladen') eingeladen++;
      else keinTermin++;
    }
    const ohnePhone = readyStandorte.filter(a => !a.contactPhone).length;
    return { total, eingebucht, eingeladen, keinTermin, ohnePhone };
  }, [readyStandorte, getBookingCategory]);

  // Cities for filter
  const cities = useMemo(() => {
    const set = new Set();
    readyStandorte.forEach(s => {
      const c = Array.isArray(s.city) ? s.city : (s.city ? [s.city] : []);
      c.forEach(city => { if (city && city.trim()) set.add(city.trim()); });
    });
    return [...set].sort();
  }, [readyStandorte]);

  // Apply search + filters
  const filtered = useMemo(() => {
    let list = readyStandorte;

    // Search
    if (search) {
      const q = search.toLowerCase().trim();
      list = list.filter(s =>
        (s.locationName || '').toLowerCase().includes(q) ||
        (s.contactPerson || '').toLowerCase().includes(q) ||
        (s.contactPhone || '').includes(q) ||
        (s.jetId || '').toLowerCase().includes(q) ||
        (s.postalCode || '').includes(q) ||
        (s.street || '').toLowerCase().includes(q) ||
        (Array.isArray(s.city) ? s.city : []).some(c => c.toLowerCase().includes(q))
      );
    }

    // City filter
    if (filterCity) {
      list = list.filter(s => (Array.isArray(s.city) ? s.city : []).includes(filterCity));
    }

    // Booking status filter — granular: eingebucht / eingeladen / kein_termin
    if (filterBookingStatus) {
      list = list.filter(s => getBookingCategory(s.id) === filterBookingStatus);
    }

    // Phone filter
    if (filterPhone === 'with') {
      list = list.filter(s => !!s.contactPhone);
    } else if (filterPhone === 'without') {
      list = list.filter(s => !s.contactPhone);
    }

    // Sort
    list = [...list].sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'locationName':
          va = (a.locationName || '').toLowerCase();
          vb = (b.locationName || '').toLowerCase();
          break;
        case 'city':
          va = ((Array.isArray(a.city) ? a.city[0] : a.city) || '').toLowerCase();
          vb = ((Array.isArray(b.city) ? b.city[0] : b.city) || '').toLowerCase();
          break;
        case 'postalCode':
          va = a.postalCode || '';
          vb = b.postalCode || '';
          break;
        case 'contactPerson':
          va = (a.contactPerson || '').toLowerCase();
          vb = (b.contactPerson || '').toLowerCase();
          break;
        case 'bookingStatus': {
          const ba = bookingByAkquise.get(a.id);
          const bb = bookingByAkquise.get(b.id);
          va = ba ? ba.status : 'zzz';
          vb = bb ? bb.status : 'zzz';
          break;
        }
        default:
          va = (a.locationName || '').toLowerCase();
          vb = (b.locationName || '').toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [readyStandorte, search, filterCity, filterBookingStatus, filterPhone, sortField, sortDir, bookingByAkquise, hasAppointment, terminByAkquise]);

  // Toggle sort
  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Active filter count
  const activeFilterCount = [filterCity, filterBookingStatus, filterPhone].filter(Boolean).length;

  // Clear all filters
  const clearFilters = () => {
    setFilterCity('');
    setFilterBookingStatus('');
    setFilterPhone('');
    setSearch('');
  };

  // Detail booking + termin info
  const detailBooking = detailStandort ? bookingByAkquise.get(detailStandort.id) : null;
  const detailTermin = detailStandort ? terminByAkquise.get(detailStandort.id) : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
        <span className="text-sm text-slate-500">Aufbaubereite Standorte werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-100 flex items-center justify-center">
              <CheckCircle size={18} className="text-cyan-600" />
            </div>
            Aufbaubereite Standorte
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Standorte mit Status "Won / Signed", Genehmigung erteilt und Vertrag vorhanden
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 bg-white/60 border border-gray-200 rounded-xl hover:bg-white transition-colors disabled:opacity-50"
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Aktualisieren
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard
          label="Total aufbaubereit"
          value={kpis.total}
          icon={CheckCircle}
          color="text-cyan-600"
          bgColor="bg-cyan-100"
        />
        <KPICard
          label="Eingebucht"
          value={kpis.eingebucht}
          icon={CalendarCheck}
          color="text-green-600"
          bgColor="bg-green-100"
          subtitle={kpis.total > 0 ? `${Math.round((kpis.eingebucht / kpis.total) * 100)}% mit Termin` : undefined}
        />
        <KPICard
          label="Eingeladen"
          value={kpis.eingeladen}
          icon={Send}
          color="text-yellow-600"
          bgColor="bg-yellow-100"
          subtitle="Warten auf Terminwahl"
        />
        <KPICard
          label="Nicht eingeladen"
          value={kpis.keinTermin}
          icon={Clock}
          color="text-amber-600"
          bgColor="bg-amber-100"
          subtitle="Noch einladen oder anrufen"
        />
        <KPICard
          label="Ohne Telefonnummer"
          value={kpis.ohnePhone}
          icon={PhoneOff}
          color="text-red-500"
          bgColor="bg-red-100"
          subtitle="Koennen nicht angerufen werden"
        />
      </div>

      {/* Search + Filters */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche nach Name, Stadt, Kontakt, Strasse, PLZ, JET-ID..."
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Filter size={12} /> Filter:
          </div>

          {/* City */}
          <select
            value={filterCity}
            onChange={e => setFilterCity(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
              filterCity ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <option value="">Alle Staedte</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Booking Status */}
          <select
            value={filterBookingStatus}
            onChange={e => setFilterBookingStatus(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
              filterBookingStatus ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <option value="">Buchungsstatus</option>
            <option value="eingebucht">Eingebucht (Termin)</option>
            <option value="eingeladen">Eingeladen (kein Termin)</option>
            <option value="kein_termin">Nicht eingeladen</option>
          </select>

          {/* Phone */}
          <select
            value={filterPhone}
            onChange={e => setFilterPhone(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
              filterPhone ? 'bg-cyan-50 border-cyan-300 text-cyan-700' : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <option value="">Telefonnummer</option>
            <option value="with">Mit Telefon</option>
            <option value="without">Ohne Telefon</option>
          </select>

          {/* Active filter indicator + clear */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <X size={11} /> {activeFilterCount} Filter zuruecksetzen
            </button>
          )}

          {/* Result count */}
          <div className="ml-auto text-xs text-gray-400">
            {filtered.length} von {readyStandorte.length} Standorte
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Building size={24} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">Keine Standorte gefunden</p>
            <p className="text-xs text-gray-400">Passe die Filter an oder aendere die Suche</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <SortableHeader label="Standort" field="locationName" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <SortableHeader label="Stadt" field="city" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PLZ</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Strasse</th>
                  <SortableHeader label="Kontakt" field="contactPerson" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Telefon</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vertrag</th>
                  <SortableHeader label="Buchung" field="bookingStatus" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(standort => {
                  const booking = bookingByAkquise.get(standort.id);
                  const termin = terminByAkquise.get(standort.id);
                  const city = Array.isArray(standort.city) ? standort.city[0] : standort.city;
                  const hasHindernisse = !!standort.hindernisse;
                  const hasPhone = !!standort.contactPhone;

                  return (
                    <tr
                      key={standort.id}
                      onClick={() => setDetailStandort(standort)}
                      className="hover:bg-cyan-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 group-hover:text-cyan-700 transition-colors truncate max-w-[200px]">
                          {standort.locationName || 'Unbekannt'}
                        </div>
                        {standort.jetId && !standort.jetId.startsWith('rec') && (
                          <div className="text-[10px] text-gray-400 font-mono">{standort.jetId}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-600">{city || '--'}</td>
                      <td className="px-3 py-3 text-gray-500 font-mono text-xs">{standort.postalCode || '--'}</td>
                      <td className="px-3 py-3 text-gray-600 truncate max-w-[150px]">
                        {standort.street}{standort.streetNumber ? ` ${standort.streetNumber}` : ''}
                      </td>
                      <td className="px-3 py-3 text-gray-600 truncate max-w-[130px]">{standort.contactPerson || '--'}</td>
                      <td className="px-3 py-3">
                        {hasPhone ? (
                          <span className="text-gray-600 font-mono text-xs">{standort.contactPhone}</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-amber-500 text-[10px] font-medium">
                            <PhoneOff size={10} /> Keine Nr.
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(standort.vertragVorhanden === true || standort.vertragVorhanden === 'true' || standort.vertragVorhanden === 'YES' || standort.vertragVorhanden === 'checked') ? (
                          <CheckCircle size={14} className="text-green-500" />
                        ) : (
                          <span className="text-gray-300 text-xs">--</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {booking ? (
                          <BookingStatusBadge status={booking.status} />
                        ) : termin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-blue-100 text-blue-700 border-blue-200">
                            <Calendar size={10} /> {termin.terminstatus || 'Geplant'}
                            {termin.installationsdatum && (
                              <span className="ml-0.5 text-[10px] opacity-75">
                                {new Date(termin.installationsdatum).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <BookingStatusBadge status="none" />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {hasHindernisse && (
                          <AlertTriangle size={14} className="text-amber-500" title="Hindernisse vorhanden" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel — Unified */}
      {detailStandort && (
        <UnifiedStandortDetail
          standort={detailStandort}
          booking={detailBooking}
          termin={detailTermin}
          onClose={() => setDetailStandort(null)}
          showWhatsApp
        />
      )}

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


/* ── Sortable Table Header ── */
function SortableHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  return (
    <th
      className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 transition-colors"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={11} className={active ? 'text-cyan-500' : 'text-gray-300'} />
        {active && (
          <span className="text-[9px] text-cyan-500">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </div>
    </th>
  );
}
