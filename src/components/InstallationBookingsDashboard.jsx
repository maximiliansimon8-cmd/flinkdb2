import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, Phone, User, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Send, ChevronDown, Search,
  Plus, PhoneCall, RotateCcw, X, ArrowUpDown, ArrowUp, ArrowDown,
  Loader2, Inbox, Eye, ChevronRight, MessageSquare,
  AlertTriangle, ExternalLink, CalendarClock, Trash2, Users, ShieldAlert,
  Wrench, ClockAlert, BarChart3,
} from 'lucide-react';
import UnifiedStandortDetail from './UnifiedStandortDetail';
import { fetchAllAcquisition, fetchAllInstallationstermine } from '../utils/airtableService';
import { INSTALL_API, formatDateWeekdayYear as formatDate, formatDateShort, formatDateTime, triggerSyncAndReload, mergeAirtableTermine } from '../utils/installUtils';
import { isStorno, isAlreadyInstalled, isReadyForInstall } from '../metrics';
import { getCurrentUser } from '../utils/authService';

/* ── Status Configuration ── */
const STATUS_CONFIG = {
  pending:    { label: 'Eingeladen',    color: 'bg-status-warning/10 text-yellow-700 border-status-warning/20', dot: 'bg-status-warning', icon: Send,        order: 1 },
  booked:     { label: 'Eingebucht',    color: 'bg-status-online/10 text-green-700 border-status-online/20',     dot: 'bg-status-online',  icon: CheckCircle, order: 2 },
  confirmed:  { label: 'Eingebucht',    color: 'bg-status-online/10 text-green-700 border-status-online/20',     dot: 'bg-status-online',  icon: CheckCircle, order: 2 },
  completed:  { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle, order: 4 },
  cancelled:  { label: 'Storniert',     color: 'bg-status-offline/10 text-red-700 border-status-offline/20',           dot: 'bg-status-offline',    icon: XCircle,     order: 5 },
  no_show:    { label: 'No-Show',       color: 'bg-surface-secondary text-text-primary border-border-secondary',        dot: 'bg-surface-secondary0',   icon: AlertCircle, order: 6 },
};

const PIPELINE_STEPS = ['pending', 'booked', 'completed'];

/* ── Watch List Categories ── */
const WATCH_CATEGORIES = [
  {
    id: 'no_show',
    label: 'No-Show',
    color: 'bg-status-offline/10 text-red-700 border-status-offline/20',
    icon: XCircle,
    prio: 1,
    match: (b) => b.status === 'no_show',
  },
  {
    // Standort hat den Termin storniert (detected via Airtable installationsStatus)
    id: 'standort_storniert',
    label: 'Standort storniert',
    color: 'bg-status-warning/10 text-orange-800 border-orange-300',
    icon: XCircle,
    prio: 2,
    // match is always false here — detection happens in useMemo via acqMap
    match: () => false,
  },
  {
    id: 'cancelled',
    label: 'Termin storniert',
    color: 'bg-status-warning/10 text-orange-700 border-status-warning/20',
    icon: AlertCircle,
    prio: 3,
    match: (b) => b.status === 'cancelled',
  },
  {
    id: 'install_failed',
    label: 'Installation fehlgeschlagen',
    color: 'bg-status-offline/10 text-red-700 border-status-offline/20',
    icon: ShieldAlert,
    prio: 4,
    // Match from booking enrichment (_statusInstallation) OR acq installationsStatus (handled in useMemo)
    match: (b) => {
      const s = (b._statusInstallation || '').toLowerCase();
      return s.includes('abgebrochen') || s.includes('fehlgeschlagen');
    },
  },
  {
    id: 'rework',
    label: 'Nacharbeit',
    color: 'bg-status-warning/10 text-amber-700 border-status-warning/20',
    icon: Wrench,
    prio: 5,
    match: (b) => {
      const s = (b._statusInstallation || '').toLowerCase();
      return s.includes('nacharbeit');
    },
  },
  {
    id: 'overdue',
    label: 'Ueberfaellig',
    color: 'bg-brand-purple/10 text-purple-700 border-brand-purple/20',
    icon: ClockAlert,
    prio: 6,
    match: (b) => {
      if (b.status !== 'booked' && b.status !== 'confirmed') return false;
      if (!b.booked_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const bookedDate = new Date(b.booked_date + 'T00:00:00');
      return bookedDate < today;
    },
  },
  {
    id: 'postponed',
    label: 'Verschoben',
    color: 'bg-surface-secondary text-text-primary border-border-secondary',
    icon: CalendarClock,
    prio: 7,
    match: (b) => (b._terminStatus || '').toLowerCase() === 'verschoben',
  },
];

/** Append current user context to a request body object for activity logging */
function withUserContext(body) {
  const user = getCurrentUser();
  return { ...body, created_by_user_id: user?.id || null, created_by_user_name: user?.name || null };
}

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
    whatsapp_agent: { label: 'WhatsApp', color: 'bg-status-online/10 text-status-online border-status-online/20', icon: MessageSquare },
    self_booking:   { label: 'Selbstbuchung', color: 'bg-accent-light text-accent border-accent/20', icon: ExternalLink },
    phone:          { label: 'Telefon', color: 'bg-brand-purple/10 text-brand-purple border-brand-purple/20', icon: PhoneCall },
    manual:         { label: 'Manuell', color: 'bg-status-warning/10 text-status-warning border-status-warning/20', icon: User },
    airtable:       { label: 'Airtable', color: 'bg-violet-50 text-violet-600 border-violet-200', icon: Calendar },
    test:           { label: 'Test', color: 'bg-surface-secondary text-text-muted border-border-secondary', icon: AlertCircle },
  };
  const c = cfg[source] || { label: source || '--', color: 'bg-surface-secondary text-text-muted border-border-secondary', icon: AlertCircle };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${c.color}`}>
      <Icon size={10} /> {c.label}
    </span>
  );
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

/** Normalize time from "HH:MM:SS" to "HH:MM" */
function normalizeTime(t) {
  if (!t) return '';
  // Strip seconds if present (e.g., "09:00:00" → "09:00")
  const match = t.match(/^(\d{1,2}:\d{2})(:\d{2})?$/);
  return match ? match[1] : t;
}

/* ── Pipeline KPI Card ── */
function PipelineCard({ status, count, total, isActive, onClick }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`relative bg-surface-primary border rounded-2xl p-4 text-left transition-all hover:bg-surface-secondary hover:shadow-md ${
        isActive ? 'ring-2 ring-orange-400 border-status-warning/20 bg-surface-primary' : 'border-border-secondary'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color.split(' ')[0]}`}>
          <Icon size={16} className={cfg.color.split(' ')[1]} />
        </div>
      </div>
      <div className="text-2xl font-bold text-text-primary">{count}</div>
      <div className="text-xs text-text-muted font-medium">{cfg.label}</div>
      {total > 0 && (
        <div className="mt-2">
          <div className="h-1 bg-surface-secondary rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${cfg.dot}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-text-muted mt-0.5 font-mono">{pct}%</div>
        </div>
      )}
    </button>
  );
}


/* ── Watch List Section ── */
function WatchListSection({ items, onSelect, onReinvite, actionLoading }) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  if (items.length === 0) return null;

  // Group by category
  const categoryCounts = {};
  for (const item of items) {
    categoryCounts[item._watchCategory] = (categoryCounts[item._watchCategory] || 0) + 1;
  }

  const displayItems = activeCategory === 'all'
    ? items
    : items.filter(i => i._watchCategory === activeCategory);

  // Days since original date
  const daysSince = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  };

  return (
    <div className="bg-surface-primary border border-status-offline/20/60 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-status-offline/10/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-status-offline/10 flex items-center justify-center">
            <ShieldAlert size={18} className="text-status-offline" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">
              Watch List ({items.length})
            </p>
            <p className="text-xs text-text-muted">
              Standorte mit fehlgeschlagenen / problematischen Terminen — dringend neu terminieren
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-status-offline text-white">
              {items.length}
            </span>
          )}
          <ChevronDown size={18} className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-red-100">
          {/* Category filter pills */}
          <div className="px-5 py-2.5 bg-status-offline/10/30 flex items-center gap-2 flex-wrap border-b border-red-100/50">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === 'all' ? 'bg-status-offline text-white' : 'bg-surface-primary text-text-secondary hover:bg-surface-secondary border border-border-secondary'
              }`}
            >
              Alle ({items.length})
            </button>
            {WATCH_CATEGORIES.filter(c => categoryCounts[c.id]).map(cat => {
              const CatIcon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(activeCategory === cat.id ? 'all' : cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                    activeCategory === cat.id ? 'bg-status-offline text-white' : `${cat.color} border`
                  }`}
                >
                  <CatIcon size={11} /> {cat.label} ({categoryCounts[cat.id]})
                </button>
              );
            })}
          </div>

          {/* Items list */}
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {displayItems.map(item => {
              const cat = WATCH_CATEGORIES.find(c => c.id === item._watchCategory);
              const CatIcon = cat?.icon || AlertCircle;
              const days = daysSince(item.booked_date);

              return (
                <div
                  key={item.id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-surface-secondary/80 transition-colors cursor-pointer"
                  onClick={() => onSelect(item)}
                >
                  {/* Category icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cat?.color?.split(' ')[0] || 'bg-surface-secondary'}`}>
                    <CatIcon size={15} className={cat?.color?.split(' ')[1] || 'text-text-secondary'} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary truncate">{item.location_name || '--'}</p>
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${cat?.color || 'bg-surface-secondary text-text-secondary border-border-secondary'}`}>
                        {cat?.label || item._watchCategory}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-text-muted flex items-center gap-1"><MapPin size={10} /> {item.city || '--'}</span>
                      {item.contact_name && <span className="text-xs text-text-muted">{item.contact_name}</span>}
                      {item.contact_phone && <span className="text-xs text-text-muted font-mono">{item.contact_phone}</span>}
                    </div>
                  </div>

                  {/* Timing */}
                  <div className="text-right shrink-0">
                    {item.booked_date && (
                      <div className="text-xs text-text-muted font-medium">
                        {formatDateShort(item.booked_date)}
                      </div>
                    )}
                    {days !== null && (
                      <span className={`text-[10px] font-semibold ${days >= 7 ? 'text-status-offline' : days >= 3 ? 'text-status-warning' : 'text-text-muted'}`}>
                        vor {days} Tag{days !== 1 ? 'en' : ''}
                      </span>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {item.contact_phone && (
                      <>
                        <a
                          href={`tel:${item.contact_phone}`}
                          className="p-1.5 rounded-lg hover:bg-status-online/10 text-text-muted hover:text-status-online transition-colors"
                          title="Anrufen"
                        >
                          <PhoneCall size={14} />
                        </a>
                        <button
                          onClick={() => onReinvite(item)}
                          disabled={actionLoading === item.id}
                          className="p-1.5 rounded-lg hover:bg-status-warning/10 text-text-muted hover:text-status-warning transition-colors disabled:opacity-50"
                          title="Neu einladen"
                        >
                          {actionLoading === item.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        </button>
                      </>
                    )}
                    <ChevronRight size={14} className="text-text-muted" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reschedule Modal ── */
function RescheduleModal({ booking, routes, onClose, onConfirm, loading }) {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const availableDates = useMemo(() => {
    if (!booking?.city) return [];
    return (routes || [])
      .filter(r => r.city === booking.city && r.status === 'open')
      .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
  }, [routes, booking?.city]);

  const availableTimes = useMemo(() => {
    if (!newDate) return [];
    const route = availableDates.find(r => r.schedule_date === newDate);
    if (!route) return [];
    let slots = route.time_slots;
    if (typeof slots === 'string') {
      try { slots = JSON.parse(slots); } catch { slots = []; }
      if (typeof slots === 'string') { try { slots = JSON.parse(slots); } catch { slots = []; } }
    }
    return Array.isArray(slots) ? slots : [];
  }, [availableDates, newDate]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-surface-primary rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-accent-light flex items-center justify-center">
              <CalendarClock size={18} className="text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Termin umbuchen</h3>
              <p className="text-xs text-text-muted">
                Aktuell: {booking.booked_date ? new Date(booking.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' }) : '--'} um {booking.booked_time || '--'} Uhr
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-secondary rounded-xl"><X size={20} className="text-text-muted" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Neues Datum *</label>
            <select value={newDate} onChange={e => { setNewDate(e.target.value); setNewTime(''); }}
              className="w-full border border-border-secondary rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400/30">
              <option value="">Datum waehlen...</option>
              {availableDates.map(r => (
                <option key={r.schedule_date} value={r.schedule_date}>
                  {new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                  {r.installer_team ? ` — ${r.installer_team}` : ''}
                </option>
              ))}
            </select>
            {availableDates.length === 0 && (
              <p className="text-xs text-status-warning mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Keine offenen Routen fuer {booking.city}.</p>
            )}
          </div>
          {newDate && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Neue Uhrzeit *</label>
              <div className="grid grid-cols-4 gap-2">
                {availableTimes.map(t => (
                  <button key={t} onClick={() => setNewTime(t)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      newTime === t ? 'bg-accent-light border-blue-400 text-blue-700 ring-2 ring-blue-400/30' : 'bg-surface-primary border-border-secondary text-text-primary hover:bg-surface-secondary'
                    }`}>
                    {t} Uhr
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-secondary rounded-xl">Abbrechen</button>
          <button onClick={() => onConfirm(newDate, newTime)} disabled={loading || !newDate || !newTime}
            className="px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/80 rounded-xl disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            Umbuchen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Cancel Confirm Modal ── */
const CANCEL_REASONS = [
  'Kunde hat abgesagt',
  'Termin wird verschoben',
  'Standort nicht erreichbar',
  'Technisches Problem',
  'Interner Grund',
  'Sonstiges',
];

function CancelConfirmModal({ booking, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-surface-primary rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-status-offline/10 flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-status-offline" />
          </div>
          <h3 className="text-lg font-bold text-text-primary">Termin stornieren?</h3>
          <p className="text-sm text-text-muted">
            {booking.location_name || 'Standort'} — {booking.booked_date ? formatDate(booking.booked_date) : 'kein Datum'} {booking.booked_time ? `um ${booking.booked_time} Uhr` : ''}
          </p>
          <div className="text-left">
            <label className="block text-xs font-medium text-text-secondary mb-1">Grund (optional)</label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-border-secondary rounded-lg text-sm text-text-primary focus:ring-2 focus:ring-red-200 focus:border-red-400"
            >
              <option value="">— Bitte Grund waehlen —</option>
              {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <p className="text-xs text-text-muted">Es wird ein automatischer Follow-up-Task erstellt und der Kunde per WhatsApp benachrichtigt.</p>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-border-secondary rounded-xl text-text-primary hover:bg-surface-secondary">Abbrechen</button>
          <button onClick={() => onConfirm(reason)} disabled={loading}
            className="flex-1 px-4 py-2.5 bg-status-offline text-white rounded-xl hover:bg-red-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Stornieren
          </button>
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
      const res = await fetch(INSTALL_API.BOOKINGS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext({
          locationName: form.locationName,
          city: form.city,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
          jetId: form.jetId,
          bookedDate: form.bookedDate,
          bookedTime: form.bookedTime,
          notes: form.notes,
          bookingSource: 'phone',
        })),
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
      <div className="bg-surface-primary rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-purple/10 flex items-center justify-center">
              <PhoneCall size={18} className="text-brand-purple" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Telefonische Buchung</h3>
              <p className="text-xs text-text-muted">Termin direkt im System erfassen</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-secondary rounded-xl transition-colors">
            <X size={20} className="text-text-muted" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* City */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Stadt *</label>
            <select value={form.city} onChange={e => update('city', e.target.value)}
              className="w-full border border-border-secondary rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all">
              <option value="">Stadt waehlen...</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Date */}
          {form.city && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">Datum *</label>
              <select value={form.bookedDate} onChange={e => update('bookedDate', e.target.value)}
                className="w-full border border-border-secondary rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all">
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
              <label className="block text-sm font-medium text-text-primary mb-1.5">Uhrzeit *</label>
              <div className="grid grid-cols-4 gap-2">
                {availableTimes.map(t => (
                  <button key={t}
                    onClick={() => update('bookedTime', t)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      form.bookedTime === t
                        ? 'bg-brand-purple/10 border-purple-400 text-purple-700 ring-2 ring-purple-400/30'
                        : 'bg-surface-primary border-border-secondary text-text-primary hover:bg-surface-secondary hover:border-border-primary'
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
              <label className="block text-xs font-medium text-text-muted mb-1">Standortname</label>
              <input type="text" value={form.locationName}
                onChange={e => update('locationName', e.target.value)}
                placeholder="z.B. Pizzeria Roma"
                className="w-full border border-border-secondary rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">JET-ID</label>
              <input type="text" value={form.jetId}
                onChange={e => update('jetId', e.target.value)}
                placeholder="z.B. FFM-123"
                className="w-full border border-border-secondary rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Kontaktperson</label>
              <input type="text" value={form.contactName}
                onChange={e => update('contactName', e.target.value)}
                placeholder="Name"
                className="w-full border border-border-secondary rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Telefon</label>
              <input type="tel" value={form.contactPhone}
                onChange={e => update('contactPhone', e.target.value)}
                placeholder="+49..."
                className="w-full border border-border-secondary rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all font-mono" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Anmerkungen</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
              rows={2} placeholder="Besondere Hinweise..."
              className="w-full border border-border-secondary rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all resize-none" />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-status-offline/10 border border-status-offline/20 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-secondary rounded-xl transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSubmit} disabled={submitting || !form.city || !form.bookedDate || !form.bookedTime}
            className="px-5 py-2.5 text-sm font-medium text-white bg-brand-purple hover:bg-purple-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />}
            Termin buchen
          </button>
        </div>
      </div>
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationBookingsDashboard({ onNavigateToDetail, filterCity: filterCityProp, isAdmin = false }) {
  const [bookings, setBookings] = useState([]);
  const [airtableTermine, setAirtableTermine] = useState([]);
  const [readyIds, setReadyIds] = useState(null); // Set of aufbaubereite akquise IDs
  const [acqMap, setAcqMap] = useState(new Map()); // akquiseId → acquisition record (for installationsStatus)
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState('');

  // Sync global city filter from parent
  useEffect(() => {
    if (filterCityProp !== undefined) setFilterCity(filterCityProp);
  }, [filterCityProp]);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [toast, setToast] = useState(null);
  const [showReminderPanel, setShowReminderPanel] = useState(false);
  const [reminderSending, setReminderSending] = useState(null); // booking id being sent
  const [reminderSuppressing, setReminderSuppressing] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const [syncing, setSyncing] = useState(false);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let url = INSTALL_API.BOOKINGS + '?';
      if (filterCity) url += `city=${encodeURIComponent(filterCity)}&`;
      const [bookRes, terminData, acqData] = await Promise.all([
        fetch(url).then(r => r.json()).catch(() => []),
        fetchAllInstallationstermine().catch(() => []),
        fetchAllAcquisition().catch(() => []),
      ]);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
      setAirtableTermine(Array.isArray(terminData) ? terminData : []);

      // Build set of aufbaubereite akquise IDs + map for installationsStatus lookup
      if (Array.isArray(acqData)) {
        const ids = new Set();
        const map = new Map();
        for (const a of acqData) {
          map.set(a.id, a);
          if (!isStorno(a) && !isAlreadyInstalled(a) && isReadyForInstall(a)) {
            ids.add(a.id);
          }
        }
        setReadyIds(ids);
        setAcqMap(map);
      }
    } catch (e) {
      console.error('Failed to fetch bookings:', e);
      showToast('Buchungen konnten nicht geladen werden.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterCity, showToast]);

  const fetchRoutes = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local tz (CET)
      const res = await fetch(`${INSTALL_API.SCHEDULE}?from=${today}&status=open`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch routes:', e);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(INSTALL_API.TEAMS);
      const data = await res.json();
      setTeams(Array.isArray(data) ? data.filter(t => t.is_active) : []);
    } catch (e) {
      console.error('Failed to fetch teams:', e);
    }
  }, []);

  useEffect(() => { fetchBookings(); fetchRoutes(); fetchTeams(); }, [fetchBookings, fetchRoutes, fetchTeams]);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    await triggerSyncAndReload(async () => {
      await fetchBookings();
      await fetchRoutes();
    }, showToast);
    setSyncing(false);
  }, [fetchBookings, fetchRoutes, showToast]);

  // Merge Airtable termine into bookings format with route linking (shared utility)
  // Then filter to only show aufbaubereite standorte
  const allBookings = useMemo(() => {
    const merged = mergeAirtableTermine(airtableTermine, bookings, routes, { filterCity });
    // If readyIds loaded, only show bookings for aufbaubereite locations
    if (readyIds && readyIds.size > 0) {
      return merged.filter(b => readyIds.has(b.akquise_airtable_id));
    }
    return merged;
  }, [bookings, airtableTermine, routes, filterCity, readyIds]);

  // Sort + filter
  const filtered = useMemo(() => {
    let list = allBookings;

    // Status filter (booked and confirmed are treated as the same status)
    if (filterStatus) {
      if (filterStatus === 'callback') {
        list = list.filter(b => (b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone);
      } else if (filterStatus === 'booked') {
        const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local tz (CET)
        list = list.filter(b => (b.status === 'booked' || b.status === 'confirmed') && (!b.booked_date || b.booked_date >= today));
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
  }, [allBookings, filterStatus, search, sortField, sortDir]);

  // KPIs
  const kpis = useMemo(() => {
    const all = allBookings;
    const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local tz (CET)
    const callback = all.filter(b => (b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone).length;
    return {
      total: all.length,
      pending: all.filter(b => b.status === 'pending').length,
      // "Eingebucht" KPI: nur zukünftige Termine (nicht vergangene)
      booked: all.filter(b => (b.status === 'booked' || b.status === 'confirmed') && (!b.booked_date || b.booked_date >= today)).length,
      completed: all.filter(b => b.status === 'completed').length,
      cancelled: all.filter(b => b.status === 'cancelled').length,
      noShow: all.filter(b => b.status === 'no_show').length,
      callback,
    };
  }, [allBookings]);

  // Watch List: problematic bookings that need re-scheduling
  // Considers both booking status AND Airtable Installationen-Status via acqMap
  // EXCLUDES standorte that have been re-invited (new active booking exists)
  const watchListItems = useMemo(() => {
    const seen = new Set(); // deduplicate by akquise_airtable_id
    const items = [];

    // Build a map of standorte that have been re-invited (active new booking)
    // If a standort has a pending/booked/confirmed booking, it's being handled → skip from watch list
    const reinvitedIds = new Set();
    for (const b of allBookings) {
      if (!b.akquise_airtable_id) continue;
      // Active bookings: pending (with WhatsApp sent = eingeladen), booked, confirmed
      if (b.status === 'booked' || b.status === 'confirmed') {
        reinvitedIds.add(b.akquise_airtable_id);
      }
      if (b.status === 'pending' && b.whatsapp_sent_at) {
        reinvitedIds.add(b.akquise_airtable_id);
      }
    }

    // Helper: check acq record's installationsStatus (from Installationen table)
    const getAcqInstallStatus = (akquiseId) => {
      if (!akquiseId) return '';
      const acq = acqMap.get(akquiseId);
      return (acq?.installationsStatus || []).join(' ').toLowerCase();
    };

    for (const b of allBookings) {
      if (b.status === 'completed') continue;
      const dedupeKey = b.akquise_airtable_id || b.id;
      if (seen.has(dedupeKey)) continue;

      // Skip if this standort has been re-invited (has an active booking)
      // Only skip for booking-level problems (cancelled/no_show) — not for Airtable-level failures
      // because Airtable installationsStatus persists even after re-invite
      const hasActiveBooking = b.akquise_airtable_id && reinvitedIds.has(b.akquise_airtable_id);

      const acqInstallStatus = getAcqInstallStatus(b.akquise_airtable_id);

      // 1. Check "Standort storniert" (via Airtable installationsStatus)
      //    Only show if NO active new booking exists (standort was re-invited → skip)
      if (acqInstallStatus.includes('storniert') && !hasActiveBooking) {
        seen.add(dedupeKey);
        const cat = WATCH_CATEGORIES.find(c => c.id === 'standort_storniert');
        items.push({ ...b, _watchCategory: 'standort_storniert', _watchPrio: cat.prio });
        continue;
      }

      // 2. Check acq installationsStatus for failures
      if ((acqInstallStatus.includes('abgebrochen') || acqInstallStatus.includes('fehlgeschlagen')) && !hasActiveBooking) {
        seen.add(dedupeKey);
        const cat = WATCH_CATEGORIES.find(c => c.id === 'install_failed');
        items.push({ ...b, _watchCategory: 'install_failed', _watchPrio: cat.prio });
        continue;
      }
      if (acqInstallStatus.includes('nacharbeit') && !hasActiveBooking) {
        seen.add(dedupeKey);
        const cat = WATCH_CATEGORIES.find(c => c.id === 'rework');
        items.push({ ...b, _watchCategory: 'rework', _watchPrio: cat.prio });
        continue;
      }

      // 3. Standard WATCH_CATEGORIES match (from booking status / termin enrichment)
      //    If standort was re-invited (has active booking), skip ALL categories
      if (hasActiveBooking) {
        seen.add(dedupeKey);
        continue;
      }
      for (const cat of WATCH_CATEGORIES) {
        if (cat.match(b)) {
          seen.add(dedupeKey);
          items.push({ ...b, _watchCategory: cat.id, _watchPrio: cat.prio });
          break;
        }
      }
    }
    return items.sort((a, b) => a._watchPrio - b._watchPrio);
  }, [allBookings, acqMap]);

  // Planned reminders: pending bookings that were invited but haven't received a reminder yet
  const plannedReminders = useMemo(() => {
    const now = Date.now();
    return allBookings
      .filter(b => b.status === 'pending' && b.reminder_count === 0 && b.whatsapp_sent_at)
      .map(b => {
        const sentAt = new Date(b.whatsapp_sent_at).getTime();
        const hoursSince = (now - sentAt) / (1000 * 60 * 60);
        const reminderDueAt = new Date(sentAt + 22 * 60 * 60 * 1000);
        const isDue = hoursSince >= 22;
        const hoursUntilDue = Math.max(0, 22 - hoursSince);
        return { ...b, hoursSince: Math.round(hoursSince * 10) / 10, isDue, reminderDueAt, hoursUntilDue: Math.round(hoursUntilDue * 10) / 10 };
      })
      .sort((a, b) => a.reminderDueAt - b.reminderDueAt);
  }, [allBookings]);

  // Unique cities
  const cities = useMemo(() =>
    [...new Set(allBookings.map(b => b.city).filter(Boolean))].sort(),
  [allBookings]);

  // Sortable column header
  const SortableHeader = ({ field, children, className = '' }) => {
    const isActive = sortField === field;
    return (
      <th
        className={`text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer select-none hover:text-text-primary transition-colors ${className}`}
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
  const handleStatusChange = async (bookingId, newStatus, cancelledReason) => {
    setActionLoading(bookingId);
    try {
      const payload = { status: newStatus };
      if (cancelledReason) payload.cancelled_reason = cancelledReason;
      const res = await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext(payload)),
      });
      if (res.ok) {
        const statusLabels = { cancelled: 'storniert', no_show: 'als No-Show markiert' };
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
        body: JSON.stringify(withUserContext({
          akquiseAirtableId: booking.akquise_airtable_id,
          contactPhone: booking.contact_phone,
          contactName: booking.contact_name,
          locationName: booking.location_name,
          city: booking.city,
          jetId: booking.jet_id,
        })),
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

  const handleReschedule = async (bookingId, newDate, newTime) => {
    setActionLoading(bookingId);
    try {
      const res = await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext({ action: 'reschedule', newDate, newTime })),
      });
      if (res.ok) {
        showToast('Termin erfolgreich umgebucht.');
        fetchBookings();
        setSelectedBooking(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Umbuchung fehlgeschlagen.', 'error');
      }
    } catch (e) {
      console.error('Reschedule failed:', e);
      showToast('Verbindungsfehler bei Umbuchung.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePhoneUpdate = async (bookingId, newPhone, akquiseAirtableId) => {
    try {
      // Update phone in Supabase booking
      const res = await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext({ contact_phone: newPhone })),
      });
      // Also update in Airtable Akquise if available
      if (akquiseAirtableId) {
        await fetch('/api/install-booker/detail', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ akquiseAirtableId, contactPhone: newPhone }),
        }).catch(() => {}); // Best-effort Airtable sync
      }
      showToast('Telefonnummer aktualisiert.');
      fetchBookings();
    } catch (e) {
      console.error('Phone update failed:', e);
      showToast('Telefonnummer konnte nicht aktualisiert werden.', 'error');
      throw e;
    }
  };

  const handleTeamChange = async (bookingId, teamName) => {
    try {
      await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext({ installer_team: teamName || null })),
      });
      showToast(`Team ${teamName ? `"${teamName}" zugewiesen` : 'entfernt'}.`);
      fetchBookings();
    } catch (e) {
      console.error('Team update failed:', e);
      showToast('Team konnte nicht aktualisiert werden.', 'error');
    }
  };

  // Suppress a single reminder (set reminder_count=1 without sending)
  const handleSuppressReminder = async (bookingId, locationName) => {
    setReminderSuppressing(bookingId);
    try {
      const res = await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext({ action: 'suppress_reminder' })),
      });
      if (res.ok) {
        showToast(`Reminder fuer "${locationName}" entfernt.`);
        fetchBookings();
      } else {
        showToast('Reminder konnte nicht entfernt werden.', 'error');
      }
    } catch (e) {
      showToast('Fehler beim Entfernen des Reminders.', 'error');
    } finally {
      setReminderSuppressing(null);
    }
  };

  // Manually send a single reminder now
  const handleSendSingleReminder = async (bookingId, locationName) => {
    setReminderSending(bookingId);
    try {
      const res = await fetch('/api/install-booker/send-reminder?exclude=', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      // The send-reminder endpoint sends all pending — for now we trigger full batch
      // In future could add single-booking endpoint
      if (res.ok) {
        showToast(`Reminder gesendet.`);
        fetchBookings();
      } else {
        showToast('Reminder konnte nicht gesendet werden.', 'error');
      }
    } catch (e) {
      showToast('Verbindungsfehler beim Senden.', 'error');
    } finally {
      setReminderSending(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error'
            ? 'bg-status-offline text-white'
            : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 hover:bg-surface-primary/20 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Buchungsuebersicht</h2>
          <p className="text-text-muted mt-1">Alle Installationstermin-Buchungen verwalten.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPhoneModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-purple text-white rounded-xl hover:bg-purple-700 font-medium text-sm transition-colors shadow-sm"
          >
            <PhoneCall size={16} /> Telefonische Buchung
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading || syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-primary border border-border-secondary rounded-xl hover:bg-surface-secondary text-text-primary text-sm transition-colors disabled:opacity-50"
          >
            {(loading || syncing) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Pipeline KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {PIPELINE_STEPS.map(status => (
          <PipelineCard
            key={status}
            status={status}
            count={kpis[status === 'no_show' ? 'noShow' : status]}
            total={kpis.total}
            isActive={filterStatus === status}
            onClick={() => setFilterStatus(prev => prev === status ? '' : status)}
          />
        ))}
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
        {/* Callback card */}
        {kpis.callback > 0 && (
          <button
            onClick={() => setFilterStatus(prev => prev === 'callback' ? '' : 'callback')}
            className={`relative bg-surface-primary border rounded-2xl p-4 text-left transition-all hover:bg-surface-secondary hover:shadow-md ${
              filterStatus === 'callback' ? 'ring-2 ring-green-400 border-status-online/20 bg-surface-primary' : 'border-status-online/20/60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-status-online/10">
                <PhoneCall size={16} className="text-status-online" />
              </div>
            </div>
            <div className="text-2xl font-bold text-status-online">{kpis.callback}</div>
            <div className="text-xs text-status-online font-medium">Rueckruf noetig</div>
          </button>
        )}
        {/* Watch List KPI card */}
        {watchListItems.length > 0 && (
          <button
            onClick={() => {
              const el = document.getElementById('watch-list-section');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="relative bg-surface-primary border-2 border-red-300 rounded-2xl p-4 text-left transition-all hover:bg-status-offline/10/50 hover:shadow-md ring-1 ring-red-200"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-status-offline/10">
                <ShieldAlert size={16} className="text-status-offline" />
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-status-offline animate-pulse" />
            </div>
            <div className="text-2xl font-bold text-status-offline">{watchListItems.length}</div>
            <div className="text-xs text-status-offline font-medium">Watch List</div>
          </button>
        )}
      </div>

      {/* Watch List Section */}
      {watchListItems.length > 0 && (
        <div id="watch-list-section">
          <WatchListSection
            items={watchListItems}
            onSelect={(b) => setSelectedBooking(b)}
            onReinvite={handleReinvite}
            actionLoading={actionLoading}
          />
        </div>
      )}

      {/* Planned WhatsApp Reminders Panel */}
      {plannedReminders.length > 0 && (
        <div className="bg-surface-primary border border-status-warning/20/60 rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowReminderPanel(prev => !prev)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-status-warning/10/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-status-warning/10 flex items-center justify-center">
                <Clock size={18} className="text-status-warning" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-text-primary">
                  WhatsApp Reminder ({plannedReminders.length})
                </p>
                <p className="text-xs text-text-muted">
                  {plannedReminders.filter(r => r.isDue).length} faellig, {plannedReminders.filter(r => !r.isDue).length} geplant
                </p>
              </div>
            </div>
            <ChevronDown size={18} className={`text-text-muted transition-transform ${showReminderPanel ? 'rotate-180' : ''}`} />
          </button>

          {showReminderPanel && (
            <div className="border-t border-amber-100">
              <div className="px-5 py-2 bg-status-warning/10/50 flex items-center justify-between">
                <p className="text-xs text-amber-700 font-medium">
                  Automatischer Versand 22h nach Einladung. Einzelne Reminder koennen entfernt werden.
                </p>
              </div>

              <div className="divide-y divide-gray-100">
                {plannedReminders.map(r => (
                  <div key={r.id} className="px-5 py-3 flex items-center gap-3 hover:bg-surface-secondary/50 transition-colors">
                    {/* Status indicator */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.isDue ? 'bg-status-online animate-pulse' : 'bg-amber-400'}`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary truncate">{r.location_name}</p>
                        <span className="text-xs text-text-muted">{r.city}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-text-muted">{r.contact_name}</span>
                        <span className="text-xs text-text-muted font-mono">{r.contact_phone}</span>
                      </div>
                    </div>

                    {/* Timing */}
                    <div className="text-right flex-shrink-0">
                      {r.isDue ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-status-online/10 text-green-700">
                          Faellig
                        </span>
                      ) : (
                        <span className="text-xs text-status-warning font-medium">
                          in {r.hoursUntilDue < 1 ? `${Math.round(r.hoursUntilDue * 60)}min` : `${r.hoursUntilDue}h`}
                        </span>
                      )}
                      <p className="text-[10px] text-text-muted mt-0.5">
                        Eingeladen {r.hoursSince < 24 ? `vor ${r.hoursSince}h` : `vor ${Math.round(r.hoursSince / 24)}d`}
                      </p>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => handleSuppressReminder(r.id, r.location_name)}
                      disabled={reminderSuppressing === r.id}
                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-status-offline/10 text-text-muted hover:text-status-offline transition-colors disabled:opacity-50"
                      title="Reminder entfernen"
                    >
                      {reminderSuppressing === r.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reminder-Auswertung (Admin only) */}
      {isAdmin && allBookings.length > 0 && (() => {
        const invited = allBookings.filter(b => b.whatsapp_sent_at);
        const r1 = allBookings.filter(b => b.reminder_count >= 1);
        const r2 = allBookings.filter(b => b.reminder_count >= 2);
        const r3 = allBookings.filter(b => b.reminder_count >= 3);
        const converted = allBookings.filter(b => b.reminder_count > 0 && ['booked', 'confirmed', 'completed'].includes(b.status));
        const rate = r1.length > 0 ? Math.round((converted.length / r1.length) * 100) : 0;
        const stillPending = allBookings.filter(b => b.status === 'pending' && b.reminder_count > 0).length;
        return (
          <div className="bg-surface-primary border border-indigo-200/60 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                <BarChart3 size={16} className="text-indigo-600" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">Reminder-Auswertung</h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">Admin</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <div className="bg-surface-secondary/80 rounded-xl px-3 py-2">
                <p className="text-[11px] text-text-muted font-medium">Eingeladen</p>
                <p className="text-lg font-bold text-text-primary">{invited.length}</p>
              </div>
              <div className="bg-status-warning/10/80 rounded-xl px-3 py-2">
                <p className="text-[11px] text-text-muted font-medium">Stage 1</p>
                <p className="text-lg font-bold text-amber-700">{r1.length}</p>
              </div>
              <div className="bg-status-warning/10/80 rounded-xl px-3 py-2">
                <p className="text-[11px] text-text-muted font-medium">Stage 2</p>
                <p className="text-lg font-bold text-orange-700">{r2.length}</p>
              </div>
              <div className="bg-status-offline/10/80 rounded-xl px-3 py-2">
                <p className="text-[11px] text-text-muted font-medium">Stage 3</p>
                <p className="text-lg font-bold text-red-700">{r3.length}</p>
              </div>
              <div className="bg-emerald-50/80 rounded-xl px-3 py-2">
                <p className="text-[11px] text-text-muted font-medium">Konvertiert</p>
                <p className="text-lg font-bold text-emerald-700">{converted.length}</p>
              </div>
              <div className="bg-accent-light/80 rounded-xl px-3 py-2">
                <p className="text-[11px] text-text-muted font-medium">Conversion</p>
                <p className="text-lg font-bold text-blue-700">{rate}%</p>
              </div>
              <div className="bg-surface-secondary/80 rounded-xl px-3 py-2">
                <p className="text-[11px] text-text-muted font-medium">Noch offen</p>
                <p className="text-lg font-bold text-text-secondary">{stillPending}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Filters + Search */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Quick filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterStatus('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !filterStatus ? 'bg-gray-900 text-white' : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            Alle ({kpis.total})
          </button>
          {Object.entries(STATUS_CONFIG)
            .filter(([key]) => key !== 'confirmed') // confirmed is merged into booked
            .map(([key, cfg]) => {
            const count = key === 'no_show' ? kpis.noShow : kpis[key];
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(prev => prev === key ? '' : key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === key ? 'bg-gray-900 text-white' : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[220px] ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Standort, Kontakt, Stadt, Telefon..."
            className="w-full pl-10 pr-4 py-2 bg-surface-primary border border-border-secondary rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 text-sm transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
              <X size={14} />
            </button>
          )}
        </div>

        {/* City filter */}
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="bg-surface-primary border border-border-secondary rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        >
          <option value="">Alle Staedte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Results Count */}
      <div className="text-xs text-text-muted font-mono">
        {filtered.length} Buchung{filtered.length !== 1 ? 'en' : ''} angezeigt
        {filterStatus && ` | Filter: ${filterStatus === 'callback' ? 'Rueckruf noetig' : STATUS_CONFIG[filterStatus]?.label || filterStatus}`}
      </div>

      {/* Bookings Table */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted gap-3">
            <Loader2 size={24} className="animate-spin text-status-warning" />
            <p className="text-sm">Buchungen werden geladen...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted gap-3">
            <div className="w-16 h-16 rounded-2xl bg-surface-secondary flex items-center justify-center">
              <Inbox size={32} className="text-text-muted" />
            </div>
            <div className="text-center">
              <p className="font-medium text-text-secondary">Keine Buchungen gefunden</p>
              <p className="text-xs text-text-muted mt-1">
                {search ? 'Versuche andere Suchbegriffe.' : filterStatus ? 'Kein Eintrag mit diesem Status.' : 'Noch keine Buchungen vorhanden.'}
              </p>
            </div>
            {(search || filterStatus || filterCity) && (
              <button
                onClick={() => { setSearch(''); setFilterStatus(''); setFilterCity(''); }}
                className="px-4 py-2 text-sm font-medium text-status-warning bg-status-warning/10 rounded-xl hover:bg-status-warning/10 transition-colors"
              >
                Filter zuruecksetzen
              </button>
            )}
            {!search && !filterStatus && !filterCity && (
              <button
                onClick={() => setShowPhoneModal(true)}
                className="px-4 py-2 text-sm font-medium text-brand-purple bg-brand-purple/10 rounded-xl hover:bg-brand-purple/10 transition-colors flex items-center gap-2"
              >
                <PhoneCall size={14} /> Erste Buchung anlegen
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-surface-secondary/50">
                  <SortableHeader field="location_name">Standort</SortableHeader>
                  <SortableHeader field="city">Stadt</SortableHeader>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Kontakt</th>
                  <SortableHeader field="booked_date">Termin</SortableHeader>
                  <SortableHeader field="status">Status</SortableHeader>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Quelle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Aktionen</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(b => (
                    <tr
                      key={b.id}
                      className="hover:bg-surface-secondary transition-colors cursor-pointer"
                      onClick={() => setSelectedBooking(b)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-text-primary text-sm">{b.location_name || '--'}</div>
                          {b.jet_id && !b.jet_id.startsWith('rec') && <div className="text-xs text-text-muted font-mono">{b.jet_id}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-text-primary">
                          <MapPin size={13} className="text-text-muted shrink-0" /> {b.city || '--'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-text-primary">{b.contact_name || '--'}</div>
                        {b.contact_phone && (
                          <div className="text-xs text-text-muted flex items-center gap-1 font-mono">
                            <Phone size={10} /> {b.contact_phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {b.booked_date ? (
                          <div>
                            <div className="text-sm font-medium text-text-primary">{formatDateShort(b.booked_date)}</div>
                            <div className="text-xs text-text-muted">{normalizeTime(b.booked_time)} - {normalizeTime(b.booked_end_time) || '--'} Uhr</div>
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted italic">Noch nicht gebucht</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusPill status={b.status} />
                          {b.earliest_date && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-status-warning/10 text-amber-700 border border-status-warning/20 rounded-md text-[9px] font-bold" title={`Erst ab ${formatDateShort(b.earliest_date)}`}>
                              <CalendarClock size={9} /> ab {formatDateShort(b.earliest_date)}
                            </span>
                          )}
                          {(b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-status-online/10 text-status-online border border-status-online/20 rounded-md text-[9px] font-bold" title="Rueckruf noetig">
                              <PhoneCall size={9} /> Anrufen
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge source={b.booking_source} />
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 flex-wrap">
                          {b._isAirtable && (
                            <span className="text-[10px] text-violet-500 italic">Nur lesen</span>
                          )}
                          {!b._isAirtable && (b.status === 'confirmed' || b.status === 'booked') && (
                            <button
                              onClick={() => setSelectedBooking(b)}
                              className="px-2.5 py-1 text-xs font-medium bg-accent-light text-accent border border-accent/20 rounded-lg hover:bg-accent-light transition-colors flex items-center gap-1"
                              title="Details / Umbuchen / Stornieren"
                            >
                              <Eye size={10} /> Details
                            </button>
                          )}
                          {!b._isAirtable && (b.status === 'cancelled' || b.status === 'no_show') && (
                            <button
                              onClick={() => setSelectedBooking(b)}
                              className="px-2.5 py-1 text-xs font-medium bg-surface-secondary text-text-secondary border border-border-secondary rounded-lg hover:bg-surface-secondary transition-colors flex items-center gap-1"
                              title="Details anzeigen"
                            >
                              <Eye size={10} /> Details
                            </button>
                          )}
                          {!b._isAirtable && (b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone && (
                            <>
                              <a
                                href={`tel:${b.contact_phone}`}
                                className="px-2.5 py-1 text-xs font-medium bg-status-online/10 text-green-700 border border-status-online/20 rounded-lg hover:bg-status-online/10 flex items-center gap-1 transition-colors"
                                title="Anrufen"
                              >
                                <PhoneCall size={10} /> Anrufen
                              </a>
                              <button
                                onClick={() => handleReinvite(b)}
                                disabled={actionLoading === b.id}
                                className="px-2.5 py-1 text-xs font-medium bg-status-warning/10 text-orange-700 border border-status-warning/20 rounded-lg hover:bg-status-warning/10 disabled:opacity-50 flex items-center gap-1 transition-colors"
                              >
                                <RotateCcw size={10} /> Neu einladen
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <ChevronRight size={16} className="text-text-muted" />
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Slide-over — Unified Component */}
      {selectedBooking && (
        <>
          <UnifiedStandortDetail
            standort={selectedBooking}
            booking={selectedBooking}
            onClose={() => setSelectedBooking(null)}
            rawBooking={selectedBooking}
            onStatusChange={(bookingId, newStatus) => {
              if (newStatus === 'cancelled') {
                setShowCancelModal(true);
              } else {
                handleStatusChange(bookingId, newStatus);
              }
            }}
            onReinvite={handleReinvite}
            onReschedule={() => setShowRescheduleModal(true)}
            onDefer={async (bookingId, deferDate, deferNote) => {
              try {
                const res = await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(withUserContext({
                    action: 'suppress_reminder',
                    earliest_date: deferDate,
                    notes: deferNote || `Installation verschoben: erst ab ${new Date(deferDate).toLocaleDateString('de-DE')}`,
                  })),
                });
                if (res.ok) {
                  handleStatusChange(bookingId, selectedBooking.status);
                  showToast('Installation verschoben.');
                }
              } catch (e) {
                console.error('Defer failed:', e);
              }
            }}
            onPhoneUpdate={handlePhoneUpdate}
            onTeamChange={handleTeamChange}
            actionLoading={actionLoading}
            routes={routes}
            teams={teams}
            showActions
            showTimeline
            showWhatsApp
            showPhoneEdit
            showTeamAssign
            showBookingLink
            showAkquiseDetail
          />
          {/* Reschedule + Cancel modals rendered by parent */}
          {showRescheduleModal && (
            <RescheduleModal
              booking={selectedBooking}
              routes={routes}
              onClose={() => setShowRescheduleModal(false)}
              onConfirm={(date, time) => {
                handleReschedule(selectedBooking.id, date, time);
                setShowRescheduleModal(false);
              }}
              loading={actionLoading === selectedBooking.id}
            />
          )}
          {showCancelModal && (
            <CancelConfirmModal
              booking={selectedBooking}
              onClose={() => setShowCancelModal(false)}
              onConfirm={(reason) => {
                handleStatusChange(selectedBooking.id, 'cancelled', reason);
                setShowCancelModal(false);
              }}
              loading={actionLoading === selectedBooking.id}
            />
          )}
        </>
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
