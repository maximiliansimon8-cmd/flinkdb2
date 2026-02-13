import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, Phone, User, Filter, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Send, ChevronDown, Search,
} from 'lucide-react';

const API_BASE = '/api/install-booker/status';

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

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function InstallationBookingsDashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

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

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Buchungsübersicht</h2>
          <p className="text-gray-500 mt-1">Alle Installationstermin-Buchungen verwalten.</p>
        </div>
        <button
          onClick={fetchBookings}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Aktualisieren
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Gesamt', value: kpis.total, color: 'text-gray-900' },
          { label: 'Eingeladen', value: kpis.pending, color: 'text-yellow-600' },
          { label: 'Gebucht', value: kpis.booked, color: 'text-blue-600' },
          { label: 'Bestätigt', value: kpis.confirmed, color: 'text-green-600' },
          { label: 'Abgeschlossen', value: kpis.completed, color: 'text-emerald-600' },
          { label: 'Storniert', value: kpis.cancelled, color: 'text-red-600' },
          { label: 'No-Show', value: kpis.noShow, color: 'text-gray-600' },
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
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Eingeladen</th>
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
                          <div className="text-xs text-gray-500">{b.booked_time} - {b.booked_end_time} Uhr</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Noch nicht gebucht</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDateTime(b.whatsapp_sent_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
