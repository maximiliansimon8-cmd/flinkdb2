import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, Phone, User, Filter, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Send, ChevronDown, Search,
  Plus, PhoneCall, RotateCcw, X,
} from 'lucide-react';

const API_BASE = '/api/install-booker/status';
const SCHEDULE_API = '/api/install-schedule';

const STATUS_CONFIG = {
  pending:    { label: 'Eingeladen',  color: 'bg-yellow-100 text-yellow-700', icon: Send },
  booked:     { label: 'Gebucht',     color: 'bg-blue-100 text-blue-700',     icon: Calendar },
  confirmed:  { label: 'Bestätigt',   color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  completed:  { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  cancelled:  { label: 'Storniert',   color: 'bg-red-100 text-red-700',       icon: XCircle },
  no_show:    { label: 'No-Show',     color: 'bg-gray-100 text-gray-700',     icon: AlertCircle },
};

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

function SourceBadge({ source }) {
  const cfg = {
    whatsapp_agent: { label: 'WhatsApp', color: 'bg-green-50 text-green-600' },
    self_booking: { label: 'Selbstbuchung', color: 'bg-blue-50 text-blue-600' },
    phone: { label: 'Telefon', color: 'bg-purple-50 text-purple-600' },
    manual: { label: 'Manuell', color: 'bg-orange-50 text-orange-600' },
    test: { label: 'Test', color: 'bg-gray-50 text-gray-500' },
  };
  const c = cfg[source] || { label: source || '—', color: 'bg-gray-50 text-gray-500' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${c.color}`}>
      {c.label}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ── Phone Booking Modal ──────────────────────────────────── */
function PhoneBookingModal({ onClose, onSuccess, routes }) {
  const [form, setForm] = useState({
    locationName: '', city: '', contactName: '', contactPhone: '',
    jetId: '', bookedDate: '', bookedTime: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Available cities from routes
  const availableCities = useMemo(() =>
    [...new Set((routes || []).map(r => r.city))].sort(),
  [routes]);

  // Available dates for selected city
  const availableDates = useMemo(() => {
    if (!form.city) return [];
    return (routes || [])
      .filter(r => r.city === form.city && r.status === 'open')
      .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
  }, [routes, form.city]);

  // Available times for selected date
  const availableTimes = useMemo(() => {
    if (!form.bookedDate) return [];
    const route = availableDates.find(r => r.schedule_date === form.bookedDate);
    if (!route) return [];
    let slots = route.time_slots;
    if (typeof slots === 'string') {
      try { slots = JSON.parse(slots); } catch { slots = []; }
      if (typeof slots === 'string') {
        try { slots = JSON.parse(slots); } catch { slots = []; }
      }
    }
    return Array.isArray(slots) ? slots : [];
  }, [availableDates, form.bookedDate]);

  const handleSubmit = async () => {
    if (!form.city || !form.bookedDate || !form.bookedTime) {
      setError('Stadt, Datum und Uhrzeit sind Pflichtfelder.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationName: form.locationName,
          city: form.city,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
          jetId: form.jetId,
          bookedDate: form.bookedDate,
          bookedTime: form.bookedTime,
          notes: form.notes,
          bookingSource: 'phone',
        }),
      });
      const data = await res.json();
      if (data.success) {
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

  const update = (key, value) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Reset dependent fields
      if (key === 'city') { next.bookedDate = ''; next.bookedTime = ''; }
      if (key === 'bookedDate') { next.bookedTime = ''; }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <PhoneCall size={20} className="text-purple-600" />
            <h3 className="text-lg font-bold text-gray-900">Telefonische Buchung</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-500">
            Termin direkt im System erfassen, der telefonisch vereinbart wurde.
          </p>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stadt *</label>
            <select value={form.city} onChange={e => update('city', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-400">
              <option value="">Stadt wählen...</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Date */}
          {form.city && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
              <select value={form.bookedDate} onChange={e => update('bookedDate', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-400">
                <option value="">Datum wählen...</option>
                {availableDates.map(r => (
                  <option key={r.schedule_date} value={r.schedule_date}>
                    {new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                    {r.installer_team ? ` — ${r.installer_team}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time */}
          {form.bookedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Uhrzeit *</label>
              <div className="grid grid-cols-4 gap-2">
                {availableTimes.map(t => (
                  <button key={t}
                    onClick={() => update('bookedTime', t)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.bookedTime === t
                        ? 'bg-purple-100 border-purple-400 text-purple-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}>
                    {t} Uhr
                  </button>
                ))}
              </div>
            </div>
          )}

          <hr className="border-gray-100" />

          {/* Location + Contact info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Standortname</label>
              <input type="text" value={form.locationName}
                onChange={e => update('locationName', e.target.value)}
                placeholder="z.B. Pizzeria Roma"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">JET-ID</label>
              <input type="text" value={form.jetId}
                onChange={e => update('jetId', e.target.value)}
                placeholder="z.B. FFM-123"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kontaktperson</label>
              <input type="text" value={form.contactName}
                onChange={e => update('contactName', e.target.value)}
                placeholder="Name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
              <input type="tel" value={form.contactPhone}
                onChange={e => update('contactPhone', e.target.value)}
                placeholder="+49..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Anmerkungen</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
              rows={2} placeholder="Besondere Hinweise..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400 resize-none" />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Abbrechen
          </button>
          <button onClick={handleSubmit} disabled={submitting || !form.city || !form.bookedDate || !form.bookedTime}
            className="px-5 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {submitting ? <RefreshCw size={14} className="animate-spin" /> : <PhoneCall size={14} />}
            Termin buchen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────── */
export default function InstallationBookingsDashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [routes, setRoutes] = useState([]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let url = API_BASE + '?';
      if (filterCity) url += `city=${encodeURIComponent(filterCity)}&`;
      if (filterStatus) url += `status=${filterStatus}&`;
      const res = await fetch(url);
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch bookings:', e);
    } finally {
      setLoading(false);
    }
  }, [filterCity, filterStatus]);

  const fetchRoutes = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${SCHEDULE_API}?from=${today}&status=open`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch routes:', e);
    }
  }, []);

  useEffect(() => { fetchBookings(); fetchRoutes(); }, [fetchBookings, fetchRoutes]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search) return bookings;
    const s = search.toLowerCase();
    return bookings.filter(b =>
      (b.location_name || '').toLowerCase().includes(s) ||
      (b.contact_name || '').toLowerCase().includes(s) ||
      (b.city || '').toLowerCase().includes(s) ||
      (b.jet_id || '').toLowerCase().includes(s)
    );
  }, [bookings, search]);

  // KPIs
  const kpis = useMemo(() => {
    const all = bookings;
    return {
      total: all.length,
      pending: all.filter(b => b.status === 'pending').length,
      booked: all.filter(b => b.status === 'booked').length,
      confirmed: all.filter(b => b.status === 'confirmed').length,
      completed: all.filter(b => b.status === 'completed').length,
      cancelled: all.filter(b => b.status === 'cancelled').length,
      noShow: all.filter(b => b.status === 'no_show').length,
      phone: all.filter(b => b.booking_source === 'phone').length,
    };
  }, [bookings]);

  // Unique cities for filter
  const cities = useMemo(() =>
    [...new Set(bookings.map(b => b.city).filter(Boolean))].sort(),
  [bookings]);

  // Actions
  const handleStatusChange = async (bookingId, newStatus) => {
    setActionLoading(bookingId);
    try {
      const res = await fetch(`${API_BASE}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchBookings();
    } catch (e) {
      console.error('Status update failed:', e);
    } finally {
      setActionLoading(null);
    }
  };

  // Re-invite (reset cancelled to pending with new token)
  const handleReinvite = async (booking) => {
    setActionLoading(booking.id);
    try {
      const res = await fetch('/api/install-booker/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          akquiseAirtableId: booking.akquise_airtable_id,
          contactPhone: booking.contact_phone,
          contactName: booking.contact_name,
          locationName: booking.location_name,
          city: booking.city,
          jetId: booking.jet_id,
        }),
      });
      if (res.ok) fetchBookings();
    } catch (e) {
      console.error('Re-invite failed:', e);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Buchungsübersicht</h2>
          <p className="text-gray-500 mt-1">Alle Installationstermin-Buchungen verwalten.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPhoneModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm"
          >
            <PhoneCall size={16} /> Telefonische Buchung
          </button>
          <button
            onClick={fetchBookings}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Aktualisieren
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Gesamt', value: kpis.total, color: 'text-gray-900' },
          { label: 'Eingeladen', value: kpis.pending, color: 'text-yellow-600' },
          { label: 'Gebucht', value: kpis.booked, color: 'text-blue-600' },
          { label: 'Bestätigt', value: kpis.confirmed, color: 'text-green-600' },
          { label: 'Abgeschlossen', value: kpis.completed, color: 'text-emerald-600' },
          { label: 'Storniert', value: kpis.cancelled, color: 'text-red-600' },
          { label: 'No-Show', value: kpis.noShow, color: 'text-gray-600' },
          { label: 'Telefon', value: kpis.phone, color: 'text-purple-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Standort, Kontakt, Stadt..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-400"
          />
        </div>
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
        >
          <option value="">Alle Städte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
        >
          <option value="">Alle Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <RefreshCw size={20} className="animate-spin mr-2" /> Lädt...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Calendar size={32} className="mb-2" />
            <p>Keine Buchungen gefunden.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Standort</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Stadt</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kontakt</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Termin</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Quelle</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm">{b.location_name || '—'}</div>
                      {b.jet_id && <div className="text-xs text-gray-400">{b.jet_id}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <MapPin size={14} className="text-gray-400" /> {b.city}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{b.contact_name || '—'}</div>
                      {b.contact_phone && (
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          <Phone size={10} /> {b.contact_phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {b.booked_date ? (
                        <div>
                          <div className="text-sm font-medium text-gray-900">{formatDate(b.booked_date)}</div>
                          <div className="text-xs text-gray-500">{b.booked_time} – {b.booked_end_time || '—'} Uhr</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Noch nicht gebucht</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={b.booking_source} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {b.status === 'booked' && (
                          <button
                            onClick={() => handleStatusChange(b.id, 'confirmed')}
                            disabled={actionLoading === b.id}
                            className="px-2 py-1 text-xs font-medium bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                          >
                            Bestätigen
                          </button>
                        )}
                        {(b.status === 'confirmed' || b.status === 'booked') && (
                          <>
                            <button
                              onClick={() => handleStatusChange(b.id, 'completed')}
                              disabled={actionLoading === b.id}
                              className="px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Abschließen
                            </button>
                            <button
                              onClick={() => handleStatusChange(b.id, 'cancelled')}
                              disabled={actionLoading === b.id}
                              className="px-2 py-1 text-xs font-medium bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
                            >
                              Stornieren
                            </button>
                          </>
                        )}
                        {b.status === 'confirmed' && (
                          <button
                            onClick={() => handleStatusChange(b.id, 'no_show')}
                            disabled={actionLoading === b.id}
                            className="px-2 py-1 text-xs font-medium bg-gray-50 text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50"
                          >
                            No-Show
                          </button>
                        )}
                        {(b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone && (
                          <button
                            onClick={() => handleReinvite(b)}
                            disabled={actionLoading === b.id}
                            className="px-2 py-1 text-xs font-medium bg-orange-50 text-orange-700 rounded hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1"
                          >
                            <RotateCcw size={10} /> Neu einladen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Phone Booking Modal */}
      {showPhoneModal && (
        <PhoneBookingModal
          onClose={() => setShowPhoneModal(false)}
          onSuccess={() => { fetchBookings(); fetchRoutes(); }}
          routes={routes}
        />
      )}
    </div>
  );
}
