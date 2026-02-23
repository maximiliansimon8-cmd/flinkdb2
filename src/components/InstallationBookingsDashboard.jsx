import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Clock, MapPin, Phone, User, RefreshCw,
  CheckCircle, XCircle, AlertCircle, Send, ChevronDown, Search,
  Plus, PhoneCall, RotateCcw, X, ArrowUpDown, ArrowUp, ArrowDown,
  Loader2, Inbox, Eye, ChevronRight, History, MessageSquare,
  AlertTriangle, ExternalLink, Copy, Check, Edit3, Save, FileText,
  Image, MessageCircle, CalendarClock, Trash2, Users,
} from 'lucide-react';
import SuperChatHistory from './SuperChatHistory';
import { fetchAllAcquisition, fetchAllInstallationstermine } from '../utils/airtableService';
import { INSTALL_API, formatDateWeekdayYear as formatDate, formatDateShort, formatDateTime, triggerSyncAndReload, mergeAirtableTermine } from '../utils/installUtils';
import { isStorno, isAlreadyInstalled, isReadyForInstall } from '../metrics';
import { getCurrentUser } from '../utils/authService';

/* ── Status Configuration ── */
const STATUS_CONFIG = {
  pending:    { label: 'Eingeladen',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500', icon: Send,        order: 1 },
  booked:     { label: 'Eingebucht',    color: 'bg-green-100 text-green-700 border-green-200',     dot: 'bg-green-500',  icon: CheckCircle, order: 2 },
  confirmed:  { label: 'Eingebucht',    color: 'bg-green-100 text-green-700 border-green-200',     dot: 'bg-green-500',  icon: CheckCircle, order: 2 },
  completed:  { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle, order: 4 },
  cancelled:  { label: 'Storniert',     color: 'bg-red-100 text-red-700 border-red-200',           dot: 'bg-red-500',    icon: XCircle,     order: 5 },
  no_show:    { label: 'No-Show',       color: 'bg-gray-100 text-gray-700 border-gray-200',        dot: 'bg-gray-500',   icon: AlertCircle, order: 6 },
};

const PIPELINE_STEPS = ['pending', 'booked', 'completed'];

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
    whatsapp_agent: { label: 'WhatsApp', color: 'bg-green-50 text-green-600 border-green-200', icon: MessageSquare },
    self_booking:   { label: 'Selbstbuchung', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: ExternalLink },
    phone:          { label: 'Telefon', color: 'bg-purple-50 text-purple-600 border-purple-200', icon: PhoneCall },
    manual:         { label: 'Manuell', color: 'bg-orange-50 text-orange-600 border-orange-200', icon: User },
    airtable:       { label: 'Airtable', color: 'bg-violet-50 text-violet-600 border-violet-200', icon: Calendar },
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
      className={`relative bg-white/60 backdrop-blur-xl border rounded-2xl p-4 text-left transition-all hover:bg-white/80 hover:shadow-md ${
        isActive ? 'ring-2 ring-orange-400 border-orange-200 bg-white/80' : 'border-slate-200/60'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color.split(' ')[0]}`}>
          <Icon size={16} className={cfg.color.split(' ')[1]} />
        </div>
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <CalendarClock size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Termin umbuchen</h3>
              <p className="text-xs text-gray-400">
                Aktuell: {booking.booked_date ? new Date(booking.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' }) : '--'} um {booking.booked_time || '--'} Uhr
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Neues Datum *</label>
            <select value={newDate} onChange={e => { setNewDate(e.target.value); setNewTime(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400/30">
              <option value="">Datum waehlen...</option>
              {availableDates.map(r => (
                <option key={r.schedule_date} value={r.schedule_date}>
                  {new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                  {r.installer_team ? ` — ${r.installer_team}` : ''}
                </option>
              ))}
            </select>
            {availableDates.length === 0 && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Keine offenen Routen fuer {booking.city}.</p>
            )}
          </div>
          {newDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Neue Uhrzeit *</label>
              <div className="grid grid-cols-4 gap-2">
                {availableTimes.map(t => (
                  <button key={t} onClick={() => setNewTime(t)}
                    className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      newTime === t ? 'bg-blue-100 border-blue-400 text-blue-700 ring-2 ring-blue-400/30' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}>
                    {t} Uhr
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Abbrechen</button>
          <button onClick={() => onConfirm(newDate, newTime)} disabled={loading || !newDate || !newTime}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            Umbuchen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Cancel Confirm Modal ── */
function CancelConfirmModal({ booking, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Termin stornieren?</h3>
          <p className="text-sm text-gray-500">
            {booking.location_name || 'Standort'} — {booking.booked_date ? formatDate(booking.booked_date) : 'kein Datum'} {booking.booked_time ? `um ${booking.booked_time} Uhr` : ''}
          </p>
          <p className="text-xs text-gray-400">Es wird ein automatischer Follow-up-Task erstellt und der Kunde per WhatsApp benachrichtigt.</p>
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50">Abbrechen</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Stornieren
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Booking Detail Slide-over ── */
function BookingDetailPanel({ booking, onClose, onStatusChange, actionLoading, onReinvite, onReschedule, routes, onPhoneUpdate, teams, onTeamChange }) {
  if (!booking) return null;

  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState(booking.contact_phone || '');
  const [savingPhone, setSavingPhone] = useState(false);
  const [showDefer, setShowDefer] = useState(false);
  const [deferDate, setDeferDate] = useState(booking.earliest_date || '');
  const [deferNote, setDeferNote] = useState('');
  const [savingDefer, setSavingDefer] = useState(false);
  const [deferSuccess, setDeferSuccess] = useState(false);

  const handleDeferInstallation = async () => {
    if (!deferDate) return;
    setSavingDefer(true);
    try {
      const res = await fetch(`${INSTALL_API.BOOKINGS}/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext({
          action: 'suppress_reminder',
          earliest_date: deferDate,
          notes: deferNote || `Installation verschoben: erst ab ${new Date(deferDate).toLocaleDateString('de-DE')}`,
        })),
      });
      if (res.ok) {
        // Signal parent to refresh instead of mutating props directly
        onStatusChange?.(booking.id, booking.status);
        setDeferSuccess(true);
        setTimeout(() => { setShowDefer(false); setDeferSuccess(false); }, 1500);
      }
    } catch (e) {
      console.error('Defer failed:', e);
    } finally {
      setSavingDefer(false);
    }
  };

  // Airtable detail data (loaded on mount)
  const [akquiseDetail, setAkquiseDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!booking.akquise_airtable_id) return;
    const controller = new AbortController();
    setDetailLoading(true);
    setAkquiseDetail(null);
    // For Airtable-sourced bookings, use akquiseId param directly;
    // for Supabase bookings, use bookingId to look up the linked Akquise record
    const param = booking._isAirtable
      ? `akquiseId=${encodeURIComponent(booking.akquise_airtable_id)}`
      : `bookingId=${encodeURIComponent(booking.id)}`;
    fetch(`${INSTALL_API.DETAIL}?${param}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!controller.signal.aborted) setAkquiseDetail(data?.akquise || null); })
      .catch(e => { if (e.name !== 'AbortError') console.error('Detail fetch failed:', e); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [booking.id, booking.akquise_airtable_id, booking._isAirtable]);

  // Build timeline from available data
  const timeline = [];
  if (booking.created_at) timeline.push({ date: booking.created_at, label: 'Erstellt', icon: Plus });
  if (booking.whatsapp_sent_at) timeline.push({ date: booking.whatsapp_sent_at, label: 'WhatsApp gesendet', icon: Send });
  if (booking.booked_at) timeline.push({ date: booking.booked_at, label: 'Termin gebucht', icon: Calendar });
  timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

  const [copied, setCopied] = useState(false);
  const copyPhone = () => {
    if (booking.contact_phone) {
      navigator.clipboard.writeText(booking.contact_phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSavePhone = async () => {
    if (!phoneValue.trim() || phoneValue === booking.contact_phone) {
      setEditingPhone(false);
      return;
    }
    setSavingPhone(true);
    try {
      await onPhoneUpdate?.(booking.id, phoneValue.trim(), booking.akquise_airtable_id);
      setEditingPhone(false);
    } catch (e) {
      console.error('Phone save failed:', e);
    } finally {
      setSavingPhone(false);
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
              {booking.jet_id && !booking.jet_id.startsWith('rec') && <span className="text-gray-300">|</span>}
              {booking.jet_id && !booking.jet_id.startsWith('rec') && <span className="font-mono text-xs">{booking.jet_id}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3">
            <StatusPill status={booking.status} size="lg" />
            <SourceBadge source={booking.booking_source} />
          </div>

          {/* Appointment Info */}
          {booking.booked_date && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                  <Calendar size={16} /> Termin
                </h4>
                {(booking.status === 'booked' || booking.status === 'confirmed') && (
                  <button onClick={() => setShowReschedule(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 border border-blue-200 rounded-lg hover:bg-blue-200 transition-colors">
                    <CalendarClock size={12} /> Umbuchen
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-blue-500 mb-0.5">Datum</div>
                  <div className="text-blue-900 font-semibold">{formatDate(booking.booked_date)}</div>
                </div>
                <div>
                  <div className="text-xs text-blue-500 mb-0.5">Uhrzeit</div>
                  <div className="text-blue-900 font-semibold">{normalizeTime(booking.booked_time) || '--'} - {normalizeTime(booking.booked_end_time) || '--'} Uhr</div>
                </div>
              </div>
              {booking.route && (
                <div className="mt-3 pt-3 border-t border-blue-200/50 text-xs text-blue-600">
                  Route: {booking.route.city} | Kapazitaet: {booking.route.max_capacity}
                </div>
              )}
            </div>
          )}

          {/* Team Assignment */}
          {!booking._isAirtable && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-5 border border-purple-100">
              <h4 className="text-sm font-semibold text-purple-900 flex items-center gap-2 mb-3">
                <Users size={16} /> Team
              </h4>
              <select
                value={booking.installer_team || booking.route?.installer_team || ''}
                onChange={(e) => onTeamChange?.(booking.id, e.target.value)}
                className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-300"
              >
                <option value="">– Kein Team –</option>
                {(teams || []).map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Contact Info — with editable phone */}
          <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
              <User size={16} /> Kontakt
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Name</div>
                <div className="text-gray-900 font-medium">{booking.contact_name || akquiseDetail?.contactPerson || '--'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Telefon</div>
                {editingPhone ? (
                  <div className="flex items-center gap-1">
                    <input type="tel" value={phoneValue} onChange={e => setPhoneValue(e.target.value)}
                      className="w-full border border-blue-300 rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                      autoFocus onKeyDown={e => e.key === 'Enter' && handleSavePhone()} />
                    <button onClick={handleSavePhone} disabled={savingPhone}
                      className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                      {savingPhone ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    </button>
                    <button onClick={() => { setEditingPhone(false); setPhoneValue(booking.contact_phone || ''); }}
                      className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-900 font-medium font-mono text-sm">{booking.contact_phone || akquiseDetail?.contactPhone || '--'}</span>
                    {(booking.contact_phone || akquiseDetail?.contactPhone) && (
                      <button onClick={copyPhone} className="p-1 hover:bg-gray-200 rounded transition-colors" title="Nummer kopieren">
                        {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} className="text-gray-400" />}
                      </button>
                    )}
                    <button onClick={() => { setEditingPhone(true); setPhoneValue(booking.contact_phone || ''); }}
                      className="p-1 hover:bg-gray-200 rounded transition-colors" title="Nummer bearbeiten">
                      <Edit3 size={12} className="text-gray-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* Email (from Akquise) */}
            {akquiseDetail?.contactEmail && (
              <div className="col-span-2">
                <div className="text-xs text-gray-400 mb-0.5">E-Mail</div>
                <a href={`mailto:${akquiseDetail.contactEmail}`} className="text-sm text-blue-600 hover:underline">{akquiseDetail.contactEmail}</a>
              </div>
            )}
            {booking.notes && (
              <div className="col-span-2 mt-1 pt-3 border-t border-gray-200">
                <div className="text-xs text-gray-400 mb-0.5">Anmerkungen</div>
                <div className="text-sm text-gray-700 whitespace-pre-line">{booking.notes}</div>
              </div>
            )}
            {booking.earliest_date && (
              <div className="col-span-2 mt-1">
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <CalendarClock size={14} className="text-amber-600 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-amber-800">Installation erst ab {formatDate(booking.earliest_date)}</div>
                    <div className="text-[10px] text-amber-600">Kunde moechte erst ab diesem Datum installiert werden</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Address with Maps link */}
          {akquiseDetail && (akquiseDetail.street || akquiseDetail.city) && (
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                <MapPin size={16} /> Adresse
              </h4>
              <div className="text-sm text-gray-900">
                {[akquiseDetail.street, akquiseDetail.streetNumber].filter(Boolean).join(' ')}
                {akquiseDetail.street && <br />}
                {[akquiseDetail.postalCode, Array.isArray(akquiseDetail.city) ? akquiseDetail.city[0] : akquiseDetail.city].filter(Boolean).join(' ')}
              </div>
              {(akquiseDetail.street || akquiseDetail.latitude) && (
                <a
                  href={akquiseDetail.latitude
                    ? `https://www.google.com/maps/search/?api=1&query=${akquiseDetail.latitude},${akquiseDetail.longitude}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${akquiseDetail.street || ''} ${akquiseDetail.streetNumber || ''}, ${akquiseDetail.postalCode || ''} ${Array.isArray(akquiseDetail.city) ? akquiseDetail.city[0] : akquiseDetail.city || ''}`)}`
                  }
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <ExternalLink size={12} /> In Google Maps oeffnen
                </a>
              )}
            </div>
          )}

          {/* WhatsApp Chat History */}
          {booking.contact_phone && (
            <SuperChatHistory
              contactPhone={booking.contact_phone}
              contactName={booking.contact_name || booking.location_name}
              collapsed={true}
              maxHeight="300px"
            />
          )}

          {/* Akquise Details — Vertrag, Bilder, Kommentare */}
          {(detailLoading || akquiseDetail) && (
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-4">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText size={16} /> Akquise-Daten
              </h4>
              {detailLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> Lade Daten...
                </div>
              ) : akquiseDetail && (
                <>
                  {/* Contract PDF */}
                  {akquiseDetail.vertragPdf && akquiseDetail.vertragPdf.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><FileText size={11} /> Vertrag</div>
                      <div className="space-y-1">
                        {akquiseDetail.vertragPdf.map((att, i) => (
                          <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                            <FileText size={14} className="shrink-0" />
                            <span className="truncate">{att.filename || `Vertrag ${i + 1}`}</span>
                            <ExternalLink size={11} className="ml-auto shrink-0 text-gray-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Contract number / partner */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {akquiseDetail.vertragsnummer && (
                      <div>
                        <div className="text-xs text-gray-400">Vertragsnr.</div>
                        <div className="text-gray-900 font-mono text-xs">{akquiseDetail.vertragsnummer}</div>
                      </div>
                    )}
                    {akquiseDetail.unterschriftsdatum && (
                      <div>
                        <div className="text-xs text-gray-400">Unterschrieben</div>
                        <div className="text-gray-900 text-xs">{new Date(akquiseDetail.unterschriftsdatum).toLocaleDateString('de-DE')}</div>
                      </div>
                    )}
                  </div>
                  {/* Technical Details */}
                  {(akquiseDetail.mountType || akquiseDetail.hindernisse || akquiseDetail.hindernisseBeschreibung) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                      <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} /> Technische Details
                      </div>
                      {akquiseDetail.mountType && (
                        <div className="text-xs text-amber-800">Montageart: {akquiseDetail.mountType}</div>
                      )}
                      {(akquiseDetail.hindernisse || akquiseDetail.hindernisseBeschreibung) && (
                        <div className="text-xs text-amber-600">{akquiseDetail.hindernisseBeschreibung || akquiseDetail.hindernisse}</div>
                      )}
                    </div>
                  )}
                  {/* dVAC Statistics */}
                  {(akquiseDetail.dvacWeek || akquiseDetail.dvacMonth || akquiseDetail.dvac_per_week || akquiseDetail.dvac_per_month) && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-400">dVAC / Woche</div>
                        <div className="text-gray-900 font-semibold">
                          {Math.round(akquiseDetail.dvacWeek || akquiseDetail.dvac_per_week || 0).toLocaleString('de-DE')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">dVAC / Monat</div>
                        <div className="text-gray-900 font-semibold">
                          {Math.round(akquiseDetail.dvacMonth || akquiseDetail.dvac_per_month || 0).toLocaleString('de-DE')}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* FAW Status */}
                  {akquiseDetail.frequencyApproval && (
                    <div className="text-sm">
                      <div className="text-xs text-gray-400">FAW Status</div>
                      <div className="text-gray-900">{akquiseDetail.frequencyApproval}</div>
                    </div>
                  )}
                  {/* Acquisition Partner + Date */}
                  {(akquiseDetail.acquisitionPartner || akquiseDetail.acquisitionDate) && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {akquiseDetail.acquisitionPartner && (
                        <div>
                          <div className="text-xs text-gray-400">Akquise-Partner</div>
                          <div className="text-gray-900">{akquiseDetail.acquisitionPartner}</div>
                        </div>
                      )}
                      {akquiseDetail.acquisitionDate && (
                        <div>
                          <div className="text-xs text-gray-400">Akquise-Datum</div>
                          <div className="text-gray-900">{new Date(akquiseDetail.acquisitionDate).toLocaleDateString('de-DE')}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Akquise Images */}
                  {akquiseDetail.images && akquiseDetail.images.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Image size={11} /> Fotos ({akquiseDetail.images.length})</div>
                      <div className="grid grid-cols-3 gap-2">
                        {akquiseDetail.images.slice(0, 6).map((img, i) => (
                          <a key={i} href={img.url || img.thumbnails?.full?.url || '#'} target="_blank" rel="noopener noreferrer"
                            className="block aspect-square bg-gray-200 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all">
                            <img src={img.thumbnails?.large?.url || img.url || ''} alt={img.filename || `Foto ${i + 1}`}
                              className="w-full h-full object-cover" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Comments */}
                  {(akquiseDetail.akquiseKommentar || akquiseDetail.kommentarAusInstallationen || akquiseDetail.frequencyApprovalComment) && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><MessageCircle size={11} /> Kommentare</div>
                      <div className="space-y-2">
                        {akquiseDetail.akquiseKommentar && (
                          <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
                            <div className="text-[10px] text-gray-400 font-medium mb-0.5">Akquise</div>
                            <div className="whitespace-pre-line">{akquiseDetail.akquiseKommentar}</div>
                          </div>
                        )}
                        {akquiseDetail.kommentarAusInstallationen && (
                          <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
                            <div className="text-[10px] text-gray-400 font-medium mb-0.5">Installationen</div>
                            <div className="whitespace-pre-line">{akquiseDetail.kommentarAusInstallationen}</div>
                          </div>
                        )}
                        {akquiseDetail.frequencyApprovalComment && (
                          <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
                            <div className="text-[10px] text-gray-400 font-medium mb-0.5">FAW-Kommentar</div>
                            <div className="whitespace-pre-line">{akquiseDetail.frequencyApprovalComment}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Buchungslink</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 break-all select-all">
                  {`https://tools.dimension-outdoor.com/book/${booking.booking_token}`}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://tools.dimension-outdoor.com/book/${booking.booking_token}`);
                    const btn = document.activeElement;
                    const orig = btn.innerHTML;
                    btn.innerHTML = '✓';
                    setTimeout(() => { btn.innerHTML = orig; }, 1500);
                  }}
                  className="shrink-0 p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Link kopieren"
                >
                  <Copy size={14} />
                </button>
                <a
                  href={`/book/${booking.booking_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Buchungsseite oeffnen"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Aktionen</div>
            <div className="grid grid-cols-2 gap-2">
              {(booking.status === 'confirmed' || booking.status === 'booked') && (
                <>
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={actionLoading === booking.id}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <XCircle size={16} /> Stornieren
                  </button>
                  <button
                    onClick={() => setShowReschedule(true)}
                    disabled={actionLoading === booking.id}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors"
                  >
                    <CalendarClock size={16} /> Umbuchen
                  </button>
                  <button
                    onClick={() => onStatusChange(booking.id, 'no_show')}
                    disabled={actionLoading === booking.id}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    <AlertCircle size={16} /> No-Show
                  </button>
                </>
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
              {/* Defer installation — for customers who want to install later */}
              {booking.status === 'pending' && !booking.earliest_date && (
                <button
                  onClick={() => setShowDefer(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors col-span-2"
                >
                  <CalendarClock size={16} /> Auf spaeter verschieben
                </button>
              )}
              {booking.earliest_date && (
                <div className="col-span-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                  <CalendarClock size={14} className="text-amber-600 shrink-0" />
                  <span className="text-amber-800 font-medium">Erst ab {formatDate(booking.earliest_date)}</span>
                  <button onClick={() => setShowDefer(true)} className="ml-auto text-amber-600 hover:text-amber-800 text-[10px] font-medium underline">Aendern</button>
                </div>
              )}
            </div>

            {/* Defer Modal */}
            {showDefer && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                  <CalendarClock size={16} /> Installation verschieben
                </h4>
                <p className="text-xs text-amber-700">Kunde moechte erst ab einem bestimmten Datum installiert werden. Reminder wird unterdrueckt.</p>
                <div>
                  <label className="text-xs text-gray-600 font-medium">Fruehestes Datum</label>
                  <input
                    type="date"
                    value={deferDate}
                    onChange={e => setDeferDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 font-medium">Notiz (optional)</label>
                  <input
                    type="text"
                    value={deferNote}
                    onChange={e => setDeferNote(e.target.value)}
                    placeholder="z.B. Umbau im Laden, erst ab Maerz"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDefer(false)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleDeferInstallation}
                    disabled={!deferDate || savingDefer}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {savingDefer ? <Loader2 size={14} className="animate-spin" /> : deferSuccess ? <CheckCircle size={14} /> : <CalendarClock size={14} />}
                    {deferSuccess ? 'Gespeichert!' : 'Verschieben'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reschedule Modal */}
      {showReschedule && (
        <RescheduleModal
          booking={booking}
          routes={routes}
          onClose={() => setShowReschedule(false)}
          onConfirm={(date, time) => {
            onReschedule(booking.id, date, time);
            setShowReschedule(false);
          }}
          loading={actionLoading === booking.id}
        />
      )}

      {/* Cancel Confirm Modal */}
      {showCancelConfirm && (
        <CancelConfirmModal
          booking={booking}
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={() => {
            onStatusChange(booking.id, 'cancelled');
            setShowCancelConfirm(false);
          }}
          loading={actionLoading === booking.id}
        />
      )}
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
export default function InstallationBookingsDashboard({ onNavigateToDetail, filterCity: filterCityProp }) {
  const [bookings, setBookings] = useState([]);
  const [airtableTermine, setAirtableTermine] = useState([]);
  const [readyIds, setReadyIds] = useState(null); // Set of aufbaubereite akquise IDs
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

      // Build set of aufbaubereite akquise IDs
      if (Array.isArray(acqData)) {
        const ids = new Set();
        for (const a of acqData) {
          if (!isStorno(a) && !isAlreadyInstalled(a) && isReadyForInstall(a)) {
            ids.add(a.id);
          }
        }
        setReadyIds(ids);
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
      const today = new Date().toISOString().split('T')[0];
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
        const today = new Date().toISOString().split('T')[0];
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
    const today = new Date().toISOString().split('T')[0];
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
      const res = await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withUserContext({ status: newStatus })),
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
            onClick={handleRefresh}
            disabled={loading || syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors disabled:opacity-50"
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
            className={`relative bg-white/60 backdrop-blur-xl border rounded-2xl p-4 text-left transition-all hover:bg-white/80 hover:shadow-md ${
              filterStatus === 'callback' ? 'ring-2 ring-green-400 border-green-200 bg-white/80' : 'border-green-200/60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-100">
                <PhoneCall size={16} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-green-600">{kpis.callback}</div>
            <div className="text-xs text-green-600 font-medium">Rueckruf noetig</div>
          </button>
        )}
      </div>

      {/* Planned WhatsApp Reminders Panel */}
      {plannedReminders.length > 0 && (
        <div className="bg-white/60 backdrop-blur-xl border border-amber-200/60 rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setShowReminderPanel(prev => !prev)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-amber-50/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                <Clock size={18} className="text-amber-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">
                  WhatsApp Reminder ({plannedReminders.length})
                </p>
                <p className="text-xs text-gray-500">
                  {plannedReminders.filter(r => r.isDue).length} faellig, {plannedReminders.filter(r => !r.isDue).length} geplant
                </p>
              </div>
            </div>
            <ChevronDown size={18} className={`text-gray-400 transition-transform ${showReminderPanel ? 'rotate-180' : ''}`} />
          </button>

          {showReminderPanel && (
            <div className="border-t border-amber-100">
              <div className="px-5 py-2 bg-amber-50/50 flex items-center justify-between">
                <p className="text-xs text-amber-700 font-medium">
                  Automatischer Versand 22h nach Einladung. Einzelne Reminder koennen entfernt werden.
                </p>
              </div>

              <div className="divide-y divide-gray-100">
                {plannedReminders.map(r => (
                  <div key={r.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                    {/* Status indicator */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.isDue ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.location_name}</p>
                        <span className="text-xs text-gray-400">{r.city}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">{r.contact_name}</span>
                        <span className="text-xs text-gray-400 font-mono">{r.contact_phone}</span>
                      </div>
                    </div>

                    {/* Timing */}
                    <div className="text-right flex-shrink-0">
                      {r.isDue ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Faellig
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">
                          in {r.hoursUntilDue < 1 ? `${Math.round(r.hoursUntilDue * 60)}min` : `${r.hoursUntilDue}h`}
                        </span>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Eingeladen {r.hoursSince < 24 ? `vor ${r.hoursSince}h` : `vor ${Math.round(r.hoursSince / 24)}d`}
                      </p>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => handleSuppressReminder(r.id, r.location_name)}
                      disabled={reminderSuppressing === r.id}
                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
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
        {filterStatus && ` | Filter: ${filterStatus === 'callback' ? 'Rueckruf noetig' : STATUS_CONFIG[filterStatus]?.label || filterStatus}`}
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
                {filtered.map(b => (
                    <tr
                      key={b.id}
                      className="hover:bg-white/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedBooking(b)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{b.location_name || '--'}</div>
                          {b.jet_id && !b.jet_id.startsWith('rec') && <div className="text-xs text-gray-400 font-mono">{b.jet_id}</div>}
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
                            <div className="text-xs text-gray-500">{normalizeTime(b.booked_time)} - {normalizeTime(b.booked_end_time) || '--'} Uhr</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Noch nicht gebucht</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusPill status={b.status} />
                          {b.earliest_date && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[9px] font-bold" title={`Erst ab ${formatDateShort(b.earliest_date)}`}>
                              <CalendarClock size={9} /> ab {formatDateShort(b.earliest_date)}
                            </span>
                          )}
                          {(b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded-md text-[9px] font-bold" title="Rueckruf noetig">
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
                              className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"
                              title="Details / Umbuchen / Stornieren"
                            >
                              <Eye size={10} /> Details
                            </button>
                          )}
                          {!b._isAirtable && (b.status === 'cancelled' || b.status === 'no_show') && b.contact_phone && (
                            <>
                              <a
                                href={`tel:${b.contact_phone}`}
                                className="px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 flex items-center gap-1 transition-colors"
                                title="Anrufen"
                              >
                                <PhoneCall size={10} /> Anrufen
                              </a>
                              <button
                                onClick={() => handleReinvite(b)}
                                disabled={actionLoading === b.id}
                                className="px-2.5 py-1 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1 transition-colors"
                              >
                                <RotateCcw size={10} /> Neu einladen
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <ChevronRight size={16} className="text-gray-300" />
                      </td>
                    </tr>
                ))}
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
          onReschedule={handleReschedule}
          onPhoneUpdate={handlePhoneUpdate}
          routes={routes}
          teams={teams}
          onTeamChange={handleTeamChange}
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
