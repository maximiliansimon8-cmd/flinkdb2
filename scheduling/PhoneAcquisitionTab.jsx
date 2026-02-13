import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed, Search, Filter, MapPin,
  User, CheckCircle, Clock, AlertCircle, RefreshCw, Calendar,
  ChevronDown, X, MessageSquare, ArrowRight, Loader2,
} from 'lucide-react';
import { supabase } from '../src/utils/authService.js';

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const API_BASE = '/api/install-booker/status';

const PHONE_STATUS_CONFIG = {
  not_called:   { label: 'Nicht angerufen',   color: 'bg-gray-100 text-gray-600',   icon: Phone },
  not_reached:  { label: 'Nicht erreicht',    color: 'bg-yellow-100 text-yellow-700', icon: PhoneMissed },
  reached:      { label: 'Erreicht',          color: 'bg-blue-100 text-blue-700',   icon: PhoneCall },
  booked:       { label: 'Termin vereinbart', color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

const CALL_STATUS_FILTERS = [
  { value: '',            label: 'Alle' },
  { value: 'not_called',  label: 'Nicht angerufen' },
  { value: 'not_reached', label: 'Nicht erreicht' },
  { value: 'reached',     label: 'Erreicht' },
];

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function formatDate(d) {
  if (!d) return '---';
  return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '---';
  return new Date(d).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

/* ═══════════════════════════════════════════
   STATUS BADGE
   ═══════════════════════════════════════════ */

function PhoneStatusBadge({ status }) {
  const cfg = PHONE_STATUS_CONFIG[status] || PHONE_STATUS_CONFIG.not_called;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

/* ═══════════════════════════════════════════
   PHONE BOOKING MODAL
   ═══════════════════════════════════════════ */

function PhoneBookingModal({ booking, routes, onClose, onSuccess }) {
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Filter routes by the booking's city
  const cityRoutes = useMemo(() => {
    if (!booking?.city) return routes || [];
    return (routes || []).filter(
      r => r.city?.toLowerCase() === booking.city.toLowerCase()
    );
  }, [routes, booking]);

  const availableTimes = useMemo(() => {
    if (!selectedRoute) return [];
    let slots = selectedRoute.time_slots;
    if (typeof slots === 'string') {
      try { slots = JSON.parse(slots); } catch { slots = []; }
      if (typeof slots === 'string') {
        try { slots = JSON.parse(slots); } catch { slots = []; }
      }
    }
    return Array.isArray(slots) ? slots : [];
  }, [selectedRoute]);

  const handleConfirm = async () => {
    if (!selectedRoute || !selectedTime) {
      setError('Bitte Route und Zeitfenster auswählen.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // Create booking via API
      const res = await fetch(API_BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: booking.id,
          action: 'confirm',
          booked_date: selectedRoute.schedule_date,
          booked_time: selectedTime,
          booking_source: 'phone',
        }),
      });
      const data = await res.json();

      if (data.success || res.ok) {
        // Also update phone status
        await supabase
          .from('install_bookings')
          .update({
            phone_status: 'booked',
            phone_call_at: new Date().toISOString(),
            booking_source: 'phone',
          })
          .eq('id', booking.id);

        onSuccess?.();
        onClose();
      } else {
        setError(data.error || 'Buchung fehlgeschlagen.');
      }
    } catch (e) {
      setError('Verbindungsfehler: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-orange-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Telefonische Buchung</h3>
              <p className="text-sm text-gray-500">{booking.location_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Available routes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verfügbare Routen ({booking.city})
            </label>
            {cityRoutes.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Calendar size={24} className="mx-auto mb-2" />
                <p className="text-sm">Keine offenen Routen für {booking.city}.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {cityRoutes.map(route => {
                  const isSelected = selectedRoute?.id === route.id;
                  const dateFormatted = new Date(route.schedule_date + 'T00:00:00')
                    .toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });

                  // Parse slots to count available
                  let slotCount = 0;
                  let slots = route.time_slots;
                  if (typeof slots === 'string') {
                    try { slots = JSON.parse(slots); } catch { slots = []; }
                  }
                  if (Array.isArray(slots)) slotCount = slots.length;

                  return (
                    <button
                      key={route.id}
                      onClick={() => { setSelectedRoute(route); setSelectedTime(''); }}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{dateFormatted}</div>
                          {route.installer_team && (
                            <div className="text-xs text-gray-500 mt-0.5">Team: {route.installer_team}</div>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {slotCount} Slots
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Time slots */}
          {selectedRoute && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Zeitfenster wählen</label>
              <div className="grid grid-cols-4 gap-2">
                {availableTimes.map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedTime(t)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      selectedTime === t
                        ? 'bg-orange-100 border-orange-400 text-orange-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t} Uhr
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Abbrechen
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || !selectedRoute || !selectedTime}
            className="px-5 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Termin buchen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STATUS DROPDOWN
   ═══════════════════════════════════════════ */

function StatusDropdown({ booking, onStatusChange, onPhoneBook }) {
  const [open, setOpen] = useState(false);

  const options = [
    { value: 'not_reached', label: 'Nicht erreicht', icon: PhoneMissed, color: 'text-yellow-600' },
    { value: 'reached',     label: 'Erreicht - kein Termin', icon: PhoneCall, color: 'text-blue-600' },
    { value: 'phone_book',  label: 'Telefonische Buchung', icon: Calendar, color: 'text-green-600' },
  ];

  const handleSelect = (value) => {
    setOpen(false);
    if (value === 'phone_book') {
      onPhoneBook(booking);
    } else {
      onStatusChange(booking.id, value);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
      >
        Status setzen <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 overflow-hidden">
            {options.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icon size={14} className={opt.color} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CONTACT CARD
   ═══════════════════════════════════════════ */

function ContactCard({ booking, onStatusChange, onPhoneBook, updatingId }) {
  const phoneStatus = booking.phone_status || 'not_called';
  const isUpdating = updatingId === booking.id;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow ${
      isUpdating ? 'opacity-60 pointer-events-none' : ''
    }`}>
      <div className="flex items-start justify-between gap-3">
        {/* Left: Info */}
        <div className="flex-1 min-w-0">
          {/* Location name */}
          <h3 className="font-semibold text-gray-900 text-sm truncate">
            {booking.location_name || 'Unbekannter Standort'}
          </h3>

          {/* Contact + Phone */}
          <div className="mt-1.5 space-y-1">
            {booking.contact_name && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <User size={13} className="text-gray-400 shrink-0" />
                <span className="truncate">{booking.contact_name}</span>
              </div>
            )}
            {booking.contact_phone && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <Phone size={13} className="text-gray-400 shrink-0" />
                <span className="font-mono text-xs">{booking.contact_phone}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin size={13} className="text-gray-400 shrink-0" />
              <span>{booking.city || '---'}</span>
            </div>
          </div>

          {/* WhatsApp sent date */}
          {booking.whatsapp_sent_at && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
              <MessageSquare size={11} />
              WhatsApp gesendet: {formatDateTime(booking.whatsapp_sent_at)}
            </div>
          )}

          {/* Last call info */}
          {booking.phone_call_at && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
              <Clock size={11} />
              Letzter Anruf: {formatDateTime(booking.phone_call_at)}
            </div>
          )}

          {/* Phone notes */}
          {booking.phone_notes && (
            <div className="mt-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 italic">
              {booking.phone_notes}
            </div>
          )}
        </div>

        {/* Right: Badge */}
        <div className="shrink-0">
          <PhoneStatusBadge status={phoneStatus} />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        {/* Call button */}
        {booking.contact_phone ? (
          <a
            href={`tel:${booking.contact_phone}`}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
          >
            <Phone size={14} /> Anrufen
          </a>
        ) : (
          <span className="text-xs text-gray-400 italic">Keine Telefonnummer</span>
        )}

        {/* Status dropdown */}
        <StatusDropdown
          booking={booking}
          onStatusChange={onStatusChange}
          onPhoneBook={onPhoneBook}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

export default function PhoneAcquisitionTab() {
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCallStatus, setFilterCallStatus] = useState('');

  // Modal
  const [bookingForModal, setBookingForModal] = useState(null);

  /* ── Data fetching ──────────────────────────────────── */

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('install_bookings')
        .select('*')
        .in('status', ['pending', 'contacted'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBookings(data || []);
    } catch (e) {
      console.error('Failed to fetch bookings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('install_routen')
        .select('*')
        .eq('status', 'open')
        .gte('schedule_date', today)
        .order('schedule_date', { ascending: true });

      if (error) throw error;
      setRoutes(data || []);
    } catch (e) {
      console.error('Failed to fetch routes:', e);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchRoutes();
  }, [fetchBookings, fetchRoutes]);

  /* ── Stats ──────────────────────────────────────────── */

  const stats = useMemo(() => {
    const all = bookings;
    return {
      total: all.length,
      calledToday: all.filter(b => isToday(b.phone_call_at)).length,
      confirmed: all.filter(b => b.phone_status === 'booked').length,
      notReached: all.filter(b => b.phone_status === 'not_reached').length,
    };
  }, [bookings]);

  /* ── Filtering ──────────────────────────────────────── */

  const cities = useMemo(() =>
    [...new Set(bookings.map(b => b.city).filter(Boolean))].sort(),
  [bookings]);

  const filtered = useMemo(() => {
    let result = bookings;

    // Search filter
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(b =>
        (b.location_name || '').toLowerCase().includes(s) ||
        (b.contact_name || '').toLowerCase().includes(s) ||
        (b.city || '').toLowerCase().includes(s) ||
        (b.contact_phone || '').includes(s)
      );
    }

    // City filter
    if (filterCity) {
      result = result.filter(b => b.city === filterCity);
    }

    // Call status filter
    if (filterCallStatus) {
      if (filterCallStatus === 'not_called') {
        result = result.filter(b => !b.phone_status || b.phone_status === 'not_called');
      } else {
        result = result.filter(b => b.phone_status === filterCallStatus);
      }
    }

    return result;
  }, [bookings, search, filterCity, filterCallStatus]);

  /* ── Actions ────────────────────────────────────────── */

  const handleStatusChange = async (bookingId, newPhoneStatus) => {
    setUpdatingId(bookingId);
    try {
      const updateData = {
        phone_status: newPhoneStatus,
        phone_call_at: new Date().toISOString(),
      };

      // If reached but no booking, update status to 'contacted'
      if (newPhoneStatus === 'reached') {
        updateData.status = 'contacted';
      }

      const { error } = await supabase
        .from('install_bookings')
        .update(updateData)
        .eq('id', bookingId);

      if (error) throw error;

      // Optimistic update
      setBookings(prev => prev.map(b =>
        b.id === bookingId
          ? { ...b, ...updateData }
          : b
      ));
    } catch (e) {
      console.error('Status update failed:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePhoneBook = (booking) => {
    setBookingForModal(booking);
  };

  const handleBookingSuccess = () => {
    fetchBookings();
    fetchRoutes();
  };

  /* ── Render ─────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Telefonakquise</h2>
          <p className="text-gray-500 mt-1 text-sm">
            Standorte anrufen und Installationstermine vereinbaren.
          </p>
        </div>
        <button
          onClick={() => { fetchBookings(); fetchRoutes(); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <Phone size={14} /> Total zu kontaktieren
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <PhoneCall size={14} /> Heute angerufen
          </div>
          <div className="text-2xl font-bold text-orange-600">{stats.calledToday}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <CheckCircle size={14} /> Termin vereinbart
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <PhoneOff size={14} /> Nicht erreicht
          </div>
          <div className="text-2xl font-bold text-yellow-600">{stats.notReached}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Standort, Kontakt oder Telefonnummer suchen..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-400 text-sm"
          />
        </div>

        {/* City filter */}
        <select
          value={filterCity}
          onChange={e => setFilterCity(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-orange-400 text-sm bg-white"
        >
          <option value="">Alle Städte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Call status filter tabs */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          {CALL_STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilterCallStatus(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterCallStatus === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contact List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Kontakte werden geladen...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 bg-white rounded-xl border border-gray-200">
          <Phone size={32} className="mb-2" />
          <p className="font-medium">Keine Kontakte gefunden</p>
          <p className="text-sm mt-1">
            {search || filterCity || filterCallStatus
              ? 'Versuche andere Filtereinstellungen.'
              : 'Derzeit keine offenen Kontakte fuer Telefonakquise.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(booking => (
            <ContactCard
              key={booking.id}
              booking={booking}
              onStatusChange={handleStatusChange}
              onPhoneBook={handlePhoneBook}
              updatingId={updatingId}
            />
          ))}
        </div>
      )}

      {/* Result count */}
      {!loading && filtered.length > 0 && (
        <div className="text-center text-xs text-gray-400">
          {filtered.length} von {bookings.length} Kontakten angezeigt
        </div>
      )}

      {/* Phone Booking Modal */}
      {bookingForModal && (
        <PhoneBookingModal
          booking={bookingForModal}
          routes={routes}
          onClose={() => setBookingForModal(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}
