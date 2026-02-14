import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Calendar, Clock, MapPin, Phone, User, Filter, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Send, ChevronDown, Search,
  Plus, PhoneCall, RotateCcw, X, ArrowUpDown, ArrowUp, ArrowDown,
  Loader2, Inbox, Eye, ChevronRight, History, MessageSquare,
  AlertTriangle, ExternalLink, Copy, Check,
} from 'lucide-react';

const API_BASE = '/api/install-booker/status';
const SCHEDULE_API = '/api/install-schedule';

/* ── Status Configuration ── */
const STATUS_CONFIG = {
  pending:    { label: 'Eingeladen',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500', icon: Send,        order: 1 },
  booked:     { label: 'Gebucht',       color: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-500',   icon: Calendar,    order: 2 },
  confirmed:  { label: 'Bestaetigt',    color: 'bg-green-100 text-green-700 border-green-200',     dot: 'bg-green-500',  icon: CheckCircle, order: 3 },
  completed:  { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle, order: 4 },
  cancelled:  { label: 'Storniert',     color: 'bg-red-100 text-red-700 border-red-200',           dot: 'bg-red-500',    icon: XCircle,     order: 5 },
  no_show:    { label: 'No-Show',       color: 'bg-gray-100 text-gray-700 border-gray-200',        dot: 'bg-gray-500',   icon: AlertCircle, order: 6 },
};

const PIPELINE_STEPS = ['pending', 'booked', 'confirmed', 'completed'];

function StatusPill({ status, size = 'sm' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const sizeClasses = size === 'lg'
    ? 'px-3 py-1.5 text-sm gap-1.5'
    : 'px-2.5 py-1 text-xs gap-1';
  return (
    <span className={`inline-flex items-center rounded-full font-medium border ${cfg.color} ${sizeClasses}`}>
      <Icon size={size === 'lg' ? 14 : 12} /> {cfg.label}
    </span>
  );
}

function SourceBadge({ source }) {
  const cfg = {
    whatsapp_agent: { label: 'WhatsApp', color: 'bg-green-50 text-green-600 border-green-200', icon: MessageSquare },
    self_booking:   { label: 'Selbstbuchung', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: ExternalLink },
    phone:          { label: 'Telefon', color: 'bg-purple-50 text-purple-600 border-purple-200', icon: PhoneCall },
    manual:         { label: 'Manuell', color: 'bg-orange-50 text-orange-600 border-orange-200', icon: User },
    test:           { label: 'Test', color: 'bg-gray-50 text-gray-500 border-gray-200', icon: AlertCircle },
  };
  const c = cfg[source] || { label: source || '--', color: 'bg-gray-50 text-gray-500 border-gray-200', icon: AlertCircle };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${c.color}`}>
      <Icon size={10} /> {c.label}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '--';
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return '--';
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function formatDateTime(d) {
  if (!d) return '--';
  return new Date(d).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `vor ${days}d`;
  if (hours > 0) return `vor ${hours}h`;
  return 'gerade eben';
}

/** Determine if a booking is overdue based on business rules */
function getOverdueInfo(booking) {
  const now = Date.now();
  // Pending (invited) > 48h without booking
  if (booking.status === 'pending' && booking.whatsapp_sent_at) {
    const sentAt = new Date(booking.whatsapp_sent_at).getTime();
    const hoursSince = (now - sentAt) / (1000 * 60 * 60);
    if (hoursSince > 48) {
      return { isOverdue: true, reason: `Eingeladen vor ${Math.floor(hoursSince)}h ohne Buchung`, severity: 'warning' };
    }
  }
  // Booked but not confirmed, install date within 24h
  if (booking.status === 'booked' && booking.booked_date) {
    const installDate = new Date(booking.booked_date + 'T00:00:00').getTime();
    const hoursUntil = (installDate - now) / (1000 * 60 * 60);
    if (hoursUntil < 24 && hoursUntil > -24) {
      return { isOverdue: true, reason: 'Termin in <24h, nicht bestaetigt', severity: 'critical' };
    }
  }
  return { isOverdue: false };
}


/* ── Pipeline KPI Card ── */
function PipelineCard({ status, count, total, isActive, onClick, overdueCount }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`relative bg-white/60 backdrop-blur-xl border rounded-2xl p-4 text-left transition-all hover:bg-white/80 hover:shadow-md ${
        isActive ? 'ring-2 ring-orange-400 border-orange-200 bg-white/80' : 'border-slate-200/60'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color.split(' ')[0]}`}>
          <Icon size={16} className={cfg.color.split(' ')[1]} />
        </div>
        {overdueCount > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
            <AlertTriangle size={10} /> {overdueCount}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{count}</div>
      <div className="text-xs text-gray-500 font-medium">{cfg.label}</div>
      {total > 0 && (
        <div className="mt-2">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${cfg.dot}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{pct}%</div>
        </div>
      )}
    </button>
  );
}


/* ── Booking Detail Slide-over ── */
function BookingDetailPanel({ booking, onClose, onStatusChange, actionLoading, onReinvite }) {
  if (!booking) return null;

  const overdueInfo = getOverdueInfo(booking);

  // Build timeline from available data
  const timeline = [];
  if (booking.created_at) timeline.push({ date: booking.created_at, label: 'Erstellt', icon: Plus });
  if (booking.whatsapp_sent_at) timeline.push({ date: booking.whatsapp_sent_at, label: 'WhatsApp gesendet', icon: Send });
  if (booking.booked_at) timeline.push({ date: booking.booked_at, label: 'Termin gebucht', icon: Calendar });
  if (booking.confirmed_at) timeline.push({ date: booking.confirmed_at, label: 'Bestaetigt', icon: CheckCircle });
  timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

  const [copied, setCopied] = useState(false);
  const copyPhone = () => {
    if (booking.contact_phone) {
      navigator.clipboard.writeText(booking.contact_phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end animate-fade-in" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slide-in-right 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-xl border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-lg truncate">{booking.location_name || 'Unbekannt'}</h3>
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <MapPin size={13} className="shrink-0" /> {booking.city || '--'}
              {booking.jet_id && <span className="text-gray-300">|</span>}
              {booking.jet_id && <span className="font-mono text-xs">{booking.jet_id}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status + Overdue Warning */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusPill status={booking.status} size="lg" />
              <SourceBadge source={booking.booking_source} />
            </div>
            {overdueInfo.isOverdue && (
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium ${
                overdueInfo.severity === 'critical'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                <AlertTriangle size={16} className="shrink-0" />
                {overdueInfo.reason}
              </div>
            )}
          </div>

          {/* Appointment Info */}
          {booking.booked_date && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
              <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2 mb-3">
                <Calendar size={16} /> Termin
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-blue-500 mb-0.5">Datum</div>
                  <div className="text-blue-900 font-semibold">{formatDate(booking.booked_date)}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-500 mb-0.5">Uhrzeit</div>
                  <div className="text-blue-900 font-semibold">{booking.booked_time || '--'} - {booking.booked_end_time || '--'} Uhr</div>
                </div>
              </div>
              {booking.route && (
                <div className="mt-3 pt-3 border-t border-blue-200/50 text-xs text-blue-600">
                  Route: {booking.route.city} | Team: {booking.route.installer_team || '--'} | Kapazitaet: {booking.route.max_capacity}
                </div>
              )}
            </div>
          )}

          {/* Contact Info */}
          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <User size={16} /> Kontakt
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Name</div>
                <div className="text-gray-900 font-medium">{booking.contact_name || '--'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Telefon</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-900 font-medium font-mono text-sm">{booking.contact_phone || '--'}</span>
                  {booking.contact_phone && (
                    <button onClick={copyPhone} className="p-1 hover:bg-gray-200 rounded transition-colors" title="Nummer kopieren">
                      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} className="text-gray-400" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {booking.notes && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-xs text-gray-400 mb-0.5">Anmerkungen</div>
                <div className="text-sm text-gray-700">{booking.notes}</div>
              </div>
            )}
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
                <History size={16} /> Verlauf
              </h4>
              <div className="relative">
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200" />
                <div className="space-y-4">
                  {timeline.map((entry, i) => {
                    const EntryIcon = entry.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 relative">
                        <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center shrink-0 z-10">
                          <EntryIcon size={14} className="text-gray-500" />
                        </div>
                        <div className="pt-1">
                          <div className="text-sm font-medium text-gray-900">{entry.label}</div>
                          <div className="text-xs text-gray-400">{formatDateTime(entry.date)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Booking Link */}
          {booking.booking_token && (
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <a
                href={`/book/${booking.booking_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <ExternalLink size={14} /> Buchungsseite oeffnen
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Aktionen</div>
            <div className="grid grid-cols-2 gap-2">
              {booking.status === 'booked' && (
                <button
                  onClick={() => onStatusChange(booking.id, 'confirmed')}
                  disabled={actionLoading === booking.id}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-green-500 text-white rounded-xl hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle size={16} /> Bestaetigen
                </button>
              )}
              {(booking.status === 'confirmed' || booking.status === 'booked') && (
                <>
                  <button
                    onClick={() => onStatusChange(booking.id, 'completed')}
                    disabled={actionLoading === booking.id}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle size={16} /> Abschliessen
                  </button>
                  <button
                    onClick={() => onStatusChange(booking.id, 'cancelled')}
                    disabled={actionLoading === booking.id}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <XCircle size={16} /> Stornieren
                  </button>
                </>
              )}
              {booking.status === 'confirmed' && (
                <button
                  onClick={() => onStatusChange(booking.id, 'no_show')}
                  disabled={actionLoading === booking.id}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  <AlertCircle size={16} /> No-Show
                </button>
              )}
              {(booking.status === 'cancelled' || booking.status === 'no_show') && booking.contact_phone && (
                <button
                  onClick={() => onReinvite(booking)}
                  disabled={actionLoading === booking.id}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors col-span-2"
                >
                  <RotateCcw size={16} /> Neu einladen
                </button>
              )}
              {booking.contact_phone && (
                <a
                  href={`tel:${booking.contact_phone}`}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors"
                >
                  <Phone size={16} /> Anrufen
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ── Phone Booking Modal ── */
function PhoneBookingModal({ onClose, onSuccess, routes }) {
  const [form, setForm] = useState({
    locationName: '', city: '', contactName: '', contactPhone: '',
    jetId: '', bookedDate: '', bookedTime: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const availableCities = useMemo(() =>
    [...new Set((routes || []).map(r => r.city))].sort(),
  [routes]);

  const availableDates = useMemo(() => {
    if (!form.city) return [];
    return (routes || [])
      .filter(r => r.city === form.city && r.status === 'open')
      .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
  }, [routes, form.city]);

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
      if (key === 'city') { next.bookedDate = ''; next.bookedTime = ''; }
      if (key === 'bookedDate') { next.bookedTime = ''; }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
              <PhoneCall size={18} className="text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Telefonische Buchung</h3>
              <p className="text-xs text-gray-400">Termin direkt im System erfassen</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Stadt *</label>
            <select value={form.city} onChange={e => update('city', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all">
              <option value="">Stadt waehlen...</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Date */}
          {form.city && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Datum *</label>
              <select value={form.bookedDate} onChange={e => update('bookedDate', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all">
                <option value="">Datum waehlen...</option>
                {availableDates.map(r => (
                  <option key={r.schedule_date} value={r.schedule_date}>
                    {new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                    {r.installer_team ? ` -- ${r.installer_team}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time */}
          {form.bookedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Uhrzeit *</label>
              <div className="grid grid-cols-4 gap-2">
                {availableTimes.map(t => (
                  <button key={t}
                    onClick={() => update('bookedTime', t)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      form.bookedTime === t
                        ? 'bg-purple-100 border-purple-400 text-purple-700 ring-2 ring-purple-400/30'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
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
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">JET-ID</label>
              <input type="text" value={form.jetId}
                onChange={e => update('jetId', e.target.value)}
                placeholder="z.B. FFM-123"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kontaktperson</label>
              <input type="text" value={form.contactName}
                onChange={e => update('contactName', e.target.value)}
                placeholder="Name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
              <input type="tel" value={form.contactPhone}
                onChange={e => update('contactPhone', e.target.value)}
                placeholder="+49..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all font-mono" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Anmerkungen</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
              rows={2} placeholder="Besondere Hinweise..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all resize-none" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSubmit} disabled={submitting || !form.city || !form.bookedDate || !form.bookedTime}
            className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />}
            Termin buchen
          </button>
        </div>
      </div>
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationBookingsDashboard({ onNavigateToDetail }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let url = API_BASE + '?';
      if (filterCity) url += `city=${encodeURIComponent(filterCity)}&`;
      const res = await fetch(url);
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch bookings:', e);
      showToast('Buchungen konnten nicht geladen werden.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterCity, showToast]);

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

  // Sort + filter
  const filtered = useMemo(() => {
    let list = bookings;

    // Status filter
    if (filterStatus) {
      if (filterStatus === 'overdue') {
        list = list.filter(b => getOverdueInfo(b).isOverdue);
      } else {
        list = list.filter(b => b.status === filterStatus);
      }
    }

    // Search
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(b =>
        (b.location_name || '').toLowerCase().includes(s) ||
        (b.contact_name || '').toLowerCase().includes(s) ||
        (b.city || '').toLowerCase().includes(s) ||
        (b.jet_id || '').toLowerCase().includes(s) ||
        (b.contact_phone || '').includes(s)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'location_name': valA = (a.location_name || '').toLowerCase(); valB = (b.location_name || '').toLowerCase(); break;
        case 'city': valA = (a.city || ''); valB = (b.city || ''); break;
        case 'booked_date': valA = a.booked_date || ''; valB = b.booked_date || ''; break;
        case 'status': valA = STATUS_CONFIG[a.status]?.order || 99; valB = STATUS_CONFIG[b.status]?.order || 99; break;
        default: valA = a.created_at || ''; valB = b.created_at || '';
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [bookings, filterStatus, search, sortField, sortDir]);

  // KPIs
  const kpis = useMemo(() => {
    const all = bookings;
    const overdueBookings = all.filter(b => getOverdueInfo(b).isOverdue);
    return {
      total: all.length,
      pending: all.filter(b => b.status === 'pending').length,
      booked: all.filter(b => b.status === 'booked').length,
      confirmed: all.filter(b => b.status === 'confirmed').length,
      completed: all.filter(b => b.status === 'completed').length,
      cancelled: all.filter(b => b.status === 'cancelled').length,
      noShow: all.filter(b => b.status === 'no_show').length,
      overdue: overdueBookings.length,
    };
  }, [bookings]);

  // Unique cities
  const cities = useMemo(() =>
    [...new Set(bookings.map(b => b.city).filter(Boolean))].sort(),
  [bookings]);

  // Sortable column header
  const SortableHeader = ({ field, children, className = '' }) => {
    const isActive = sortField === field;
    return (
      <th
        className={`text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
        onClick={() => {
          if (isActive) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
          else { setSortField(field); setSortDir('asc'); }
        }}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {isActive ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-30" />}
        </span>
      </th>
    );
  };

  // Actions
  const handleStatusChange = async (bookingId, newStatus) => {
    setActionLoading(bookingId);
    try {
      const res = await fetch(`${API_BASE}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const statusLabels = { confirmed: 'bestaetigt', completed: 'abgeschlossen', cancelled: 'storniert', no_show: 'als No-Show markiert' };
        showToast(`Buchung erfolgreich ${statusLabels[newStatus] || 'aktualisiert'}.`);
        fetchBookings();
        // Update detail panel if open
        if (selectedBooking?.id === bookingId) {
          setSelectedBooking(prev => prev ? { ...prev, status: newStatus } : null);
        }
      } else {
        showToast('Status-Update fehlgeschlagen.', 'error');
      }
    } catch (e) {
      console.error('Status update failed:', e);
      showToast('Verbindungsfehler beim Status-Update.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

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
      if (res.ok) {
        showToast('Neue Einladung erfolgreich gesendet.');
        fetchBookings();
      } else {
        showToast('Einladung konnte nicht gesendet werden.', 'error');
      }
    } catch (e) {
      console.error('Re-invite failed:', e);
      showToast('Verbindungsfehler.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 hover:bg-white/20 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Buchungsuebersicht</h2>
          <p className="text-gray-500 mt-1">Alle Installationstermin-Buchungen verwalten.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPhoneModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium text-sm transition-colors shadow-sm"
          >
            <PhoneCall size={16} /> Telefonische Buchung
          </button>
          <button
            onClick={() => { fetchBookings(); fetchRoutes(); }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Pipeline KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {PIPELINE_STEPS.map(status => {
          const overdueForStatus = bookings.filter(b => b.status === status && getOverdueInfo(b).isOverdue).length;
          return (
            <PipelineCard
              key={status}
              status={status}
              count={kpis[status === 'no_show' ? 'noShow' : status]}
              total={kpis.total}
              isActive={filterStatus === status}
              onClick={() => setFilterStatus(prev => prev === status ? '' : status)}
              overdueCount={overdueForStatus}
            />
          );
        })}
        {/* Cancelled */}
        <PipelineCard
          status="cancelled"
          count={kpis.cancelled}
          total={kpis.total}
          isActive={filterStatus === 'cancelled'}
          onClick={() => setFilterStatus(prev => prev === 'cancelled' ? '' : 'cancelled')}
        />
        <PipelineCard
          status="no_show"
          count={kpis.noShow}
          total={kpis.total}
          isActive={filterStatus === 'no_show'}
          onClick={() => setFilterStatus(prev => prev === 'no_show' ? '' : 'no_show')}
        />
        {/* Overdue special card */}
        {kpis.overdue > 0 && (
          <button
            onClick={() => setFilterStatus(prev => prev === 'overdue' ? '' : 'overdue')}
            className={`relative bg-white/60 backdrop-blur-xl border rounded-2xl p-4 text-left transition-all hover:bg-white/80 hover:shadow-md ${
              filterStatus === 'overdue' ? 'ring-2 ring-red-400 border-red-200 bg-white/80' : 'border-red-200/60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-100">
                <AlertTriangle size={16} className="text-red-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600">{kpis.overdue}</div>
            <div className="text-xs text-red-500 font-medium">Ueberfaellig</div>
          </button>
        )}
      </div>

      {/* Quick Filters + Search */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Quick filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterStatus('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !filterStatus ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Alle ({kpis.total})
          </button>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = key === 'no_show' ? kpis.noShow : kpis[key];
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(prev => prev === key ? '' : key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[220px] ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Standort, Kontakt, Stadt, Telefon..."
            className="w-full pl-10 pr-4 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 text-sm transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* City filter */}
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        >
          <option value="">Alle Staedte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Results Count */}
      <div className="text-xs text-gray-400 font-mono">
        {filtered.length} Buchung{filtered.length !== 1 ? 'en' : ''} angezeigt
        {filterStatus && ` | Filter: ${filterStatus === 'overdue' ? 'Ueberfaellig' : STATUS_CONFIG[filterStatus]?.label || filterStatus}`}
      </div>

      {/* Bookings Table */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <Loader2 size={24} className="animate-spin text-orange-500" />
            <p className="text-sm">Buchungen werden geladen...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Inbox size={32} className="text-gray-300" />
            </div>
            <div className="text-center">
              <p className="font-medium text-gray-600">Keine Buchungen gefunden</p>
              <p className="text-xs text-gray-400 mt-1">
                {search ? 'Versuche andere Suchbegriffe.' : filterStatus ? 'Kein Eintrag mit diesem Status.' : 'Noch keine Buchungen vorhanden.'}
              </p>
            </div>
            {(search || filterStatus || filterCity) && (
              <button
                onClick={() => { setSearch(''); setFilterStatus(''); setFilterCity(''); }}
                className="px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
              >
                Filter zuruecksetzen
              </button>
            )}
            {!search && !filterStatus && !filterCity && (
              <button
                onClick={() => setShowPhoneModal(true)}
                className="px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors flex items-center gap-2"
              >
                <PhoneCall size={14} /> Erste Buchung anlegen
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <SortableHeader field="location_name">Standort</SortableHeader>
                  <SortableHeader field="city">Stadt</SortableHeader>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakt</th>
                  <SortableHeader field="booked_date">Termin</SortableHeader>
                  <SortableHeader field="status">Status</SortableHeader>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quelle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aktionen</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(b => {
                  const overdueInfo = getOverdueInfo(b);
                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-white/80 transition-colors cursor-pointer ${overdueInfo.isOverdue ? 'bg-red-50/30' : ''}`}
                      onClick={() => setSelectedBooking(b)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {overdueInfo.isOverdue && (
                            <AlertTriangle size={14} className={overdueInfo.severity === 'critical' ? 'text-red-500' : 'text-amber-500'} title={overdueInfo.reason} />
                          )}
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{b.location_name || '--'}</div>
                            {b.jet_id && <div className="text-xs text-gray-400 font-mono">{b.jet_id}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <MapPin size={13} className="text-gray-400 shrink-0" /> {b.city || '--'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{b.contact_name || '--'}</div>
                        {b.contact_phone && (
                          <div className="text-xs text-gray-400 flex items-center gap-1 font-mono">
                            <Phone size={10} /> {b.contact_phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {b.booked_date ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">{formatDateShort(b.booked_date)}</div>
                            <div className="text-xs text-gray-500">{b.booked_time} - {b.booked_end_time || '--'} Uhr</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Noch nicht gebucht</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={b.status} />
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge source={b.booking_source} />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 flex-wrap">
                          {b.status === 'booked' && (
                            <button
                              onClick={() => handleStatusChange(b.id, 'confirmed')}
                              disabled={actionLoading === b.id}
                              className="px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading === b.id ? <Loader2 size={10} className="animate-spin" /> : 'Bestaetigen'}
                            </button>
                          )}
                          {(b.status === 'confirmed' || b.status === 'booked') && (
                            <button
                              onClick={() => handleStatusChange(b.id, 'completed')}
                              disabled={actionLoading === b.id}
                              className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                            >
                              Abschliessen
                            </button>
                          )}
                          {(b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone && (
                            <button
                              onClick={() => handleReinvite(b)}
                              disabled={actionLoading === b.id}
                              className="px-2.5 py-1 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1 transition-colors"
                            >
                              <RotateCcw size={10} /> Neu einladen
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <ChevronRight size={16} className="text-gray-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Slide-over */}
      {selectedBooking && (
        <BookingDetailPanel
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onStatusChange={handleStatusChange}
          actionLoading={actionLoading}
          onReinvite={handleReinvite}
        />
      )}

      {/* Phone Booking Modal */}
      {showPhoneModal && (
        <PhoneBookingModal
          onClose={() => setShowPhoneModal(false)}
          onSuccess={() => { fetchBookings(); fetchRoutes(); showToast('Telefonische Buchung erfolgreich erstellt.'); }}
          routes={routes}
        />
      )}
    </div>
  );
}
