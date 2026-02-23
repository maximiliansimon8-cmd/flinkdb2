import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed, Search, Filter, MapPin,
  User, CheckCircle, Clock, AlertCircle, RefreshCw, Calendar,
  ChevronDown, ChevronRight, X, MessageSquare, ArrowRight, Loader2,
  FileText, CalendarClock, History, Bell, XCircle, Voicemail,
  StickyNote, RotateCcw, Edit3, Trash2, Plus,
} from 'lucide-react';
import { supabase, getCurrentUser } from '../src/utils/authService.js';

/* ===========================================================
   CONSTANTS
   =========================================================== */

const API_BASE = '/api/install-booker/status';

const PHONE_STATUS_CONFIG = {
  not_called:   { label: 'Nicht angerufen',   color: 'bg-gray-100 text-gray-600',     icon: Phone },
  not_reached:  { label: 'Nicht erreicht',    color: 'bg-yellow-100 text-yellow-700',  icon: PhoneMissed },
  reached:      { label: 'Erreicht',          color: 'bg-blue-100 text-blue-700',      icon: PhoneCall },
  callback:     { label: 'Wiedervorlage',     color: 'bg-purple-100 text-purple-700',  icon: CalendarClock },
  booked:       { label: 'Termin vereinbart', color: 'bg-green-100 text-green-700',    icon: CheckCircle },
  declined:     { label: 'Abgelehnt',         color: 'bg-red-100 text-red-700',        icon: XCircle },
  voicemail:    { label: 'Mailbox',           color: 'bg-orange-100 text-orange-700',  icon: Voicemail },
};

const CALL_STATUS_FILTERS = [
  { value: '',            label: 'Alle' },
  { value: 'not_called',  label: 'Nicht angerufen' },
  { value: 'not_reached', label: 'Nicht erreicht' },
  { value: 'callback',    label: 'Wiedervorlage' },
  { value: 'reached',     label: 'Erreicht' },
  { value: 'callbacks_due', label: 'Heute faellig' },
];

const CALL_OUTCOME_OPTIONS = [
  { value: 'not_reached', label: 'Nicht erreicht',    icon: PhoneMissed, color: 'border-yellow-300 bg-yellow-50 text-yellow-700' },
  { value: 'voicemail',   label: 'Mailbox',           icon: Voicemail,   color: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 'reached',     label: 'Erreicht',          icon: PhoneCall,   color: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: 'callback',    label: 'Wiedervorlage',     icon: CalendarClock, color: 'border-purple-300 bg-purple-50 text-purple-700' },
  { value: 'declined',    label: 'Kein Interesse',    icon: XCircle,     color: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'phone_book',  label: 'Termin buchen',     icon: Calendar,    color: 'border-green-300 bg-green-50 text-green-700' },
];

/* ===========================================================
   HELPERS
   =========================================================== */

function formatDate(d) {
  if (!d) return '---';
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return '---';
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
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

function isTodayOrPast(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T23:59:59');
  return d <= new Date();
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function daysFromNow(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

function timeAgo(d) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `vor ${days}d`;
  if (hours > 0) return `vor ${hours}h`;
  const mins = Math.floor(ms / (1000 * 60));
  if (mins > 0) return `vor ${mins}min`;
  return 'gerade eben';
}

/* ===========================================================
   STATUS BADGE
   =========================================================== */

function PhoneStatusBadge({ status }) {
  const cfg = PHONE_STATUS_CONFIG[status] || PHONE_STATUS_CONFIG.not_called;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

/* ===========================================================
   CALL LOG MODAL — Anrufprotokoll pro Standort
   =========================================================== */

function CallLogModal({ booking, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!booking?.id) return;
    setLoading(true);
    supabase
      .from('phone_call_logs')
      .select('*')
      .eq('booking_id', booking.id)
      .order('called_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setLogs(data || []);
        setLoading(false);
      });
  }, [booking?.id]);

  const outcomeLabel = (o) => {
    const map = {
      reached: 'Erreicht', not_reached: 'Nicht erreicht', booked: 'Termin gebucht',
      callback: 'Wiedervorlage', declined: 'Abgelehnt', wrong_number: 'Falsche Nr.', voicemail: 'Mailbox',
    };
    return map[o] || o;
  };

  const outcomeColor = (o) => {
    const map = {
      reached: 'text-blue-600', not_reached: 'text-yellow-600', booked: 'text-green-600',
      callback: 'text-purple-600', declined: 'text-red-600', wrong_number: 'text-gray-600', voicemail: 'text-orange-600',
    };
    return map[o] || 'text-gray-600';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <History size={20} className="text-orange-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Anrufprotokoll</h3>
              <p className="text-sm text-gray-500">{booking.location_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 size={20} className="animate-spin mr-2" /> Lade Anrufe...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Phone size={32} className="mb-2" />
              <p className="text-sm">Noch keine Anrufe protokolliert.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

              <div className="space-y-4">
                {logs.map((log, i) => (
                  <div key={log.id} className="relative pl-10">
                    {/* Timeline dot */}
                    <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                      log.outcome === 'booked' ? 'bg-green-500' :
                      log.outcome === 'callback' ? 'bg-purple-500' :
                      log.outcome === 'not_reached' ? 'bg-yellow-500' :
                      log.outcome === 'declined' ? 'bg-red-500' :
                      'bg-blue-500'
                    }`} />

                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium ${outcomeColor(log.outcome)}`}>
                          {outcomeLabel(log.outcome)}
                        </span>
                        <span className="text-xs text-gray-400">{formatDateTime(log.called_at)}</span>
                      </div>

                      {log.notes && (
                        <p className="text-sm text-gray-700 mt-1">{log.notes}</p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {log.caller_name && (
                          <span className="flex items-center gap-1">
                            <User size={10} /> {log.caller_name}
                          </span>
                        )}
                        {log.duration_seconds > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} /> {Math.floor(log.duration_seconds / 60)}:{String(log.duration_seconds % 60).padStart(2, '0')} min
                          </span>
                        )}
                        {log.callback_date && (
                          <span className="flex items-center gap-1 text-purple-500">
                            <CalendarClock size={10} /> Wiedervorlage: {formatDateShort(log.callback_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   CALL OUTCOME MODAL — Nach Anruf: Ergebnis + Notizen + Wiedervorlage
   =========================================================== */

function CallOutcomeModal({ booking, routes, onClose, onComplete }) {
  const [outcome, setOutcome] = useState(null);
  const [notes, setNotes] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // For phone booking sub-flow
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedTime, setSelectedTime] = useState('');

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

  // Preset callback date shortcuts
  const callbackShortcuts = [
    { label: 'Morgen', days: 1 },
    { label: 'In 2 Tagen', days: 2 },
    { label: 'In 1 Woche', days: 7 },
    { label: 'In 2 Wochen', days: 14 },
  ];

  const setCallbackFromDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    setCallbackDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = async () => {
    if (!outcome) { setError('Bitte Ergebnis auswählen.'); return; }
    if (outcome === 'callback' && !callbackDate) { setError('Bitte Wiedervorlage-Datum setzen.'); return; }
    if (outcome === 'phone_book' && (!selectedRoute || !selectedTime)) {
      setError('Bitte Route und Zeitfenster auswählen.'); return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const currentUser = getCurrentUser();

      // 1. Log the call
      const logEntry = {
        booking_id: booking.id,
        called_at: now,
        outcome: outcome === 'phone_book' ? 'booked' : outcome,
        notes: notes.trim() || null,
        callback_date: outcome === 'callback' ? callbackDate : null,
        caller_name: currentUser?.name || null,
      };

      const { error: logErr } = await supabase
        .from('phone_call_logs')
        .insert(logEntry);

      if (logErr) {
        console.warn('Call log insert failed (table may not exist yet):', logErr.message);
        // Continue anyway — the main booking update is more important
      }

      // Activity log: phone call (fire-and-forget)
      supabase.from('booking_activity_log').insert({
        user_id:             currentUser?.id   || null,
        user_name:           currentUser?.name || 'Unbekannt',
        action:              'phone_call',
        booking_id:          booking.id,
        akquise_airtable_id: booking.akquise_airtable_id || null,
        location_name:       booking.location_name || booking.contact_name || null,
        city:                booking.city || null,
        source:              'portal',
        detail: {
          outcome: outcome === 'phone_book' ? 'booked' : outcome,
          notes:   notes.trim() || null,
        },
      }).then(() => {}).catch(() => {});

      // 2. Update the booking
      const updateData = {
        phone_status: outcome === 'phone_book' ? 'booked' : outcome,
        phone_call_at: now,
        phone_notes: notes.trim() || booking.phone_notes || null,
      };

      if (outcome === 'callback') {
        updateData.callback_date = callbackDate;
        updateData.callback_reason = notes.trim() || null;
      } else {
        // Clear callback if resolved
        updateData.callback_date = null;
        updateData.callback_reason = null;
      }

      if (outcome === 'reached') {
        updateData.status = 'contacted';
      }

      if (outcome === 'declined') {
        updateData.status = 'cancelled';
      }

      // 3. If phone booking → do the booking first
      if (outcome === 'phone_book') {
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
        if (!data.success && !res.ok) {
          setError(data.error || 'Buchung fehlgeschlagen.');
          setSubmitting(false);
          return;
        }
        updateData.booking_source = 'phone';
      }

      const { error: updateErr } = await supabase
        .from('install_bookings')
        .update(updateData)
        .eq('id', booking.id);

      if (updateErr) throw updateErr;

      onComplete?.();
      onClose();
    } catch (e) {
      setError('Fehler: ' + e.message);
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
            <Phone size={20} className="text-orange-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-900">Anruf-Ergebnis</h3>
              <p className="text-sm text-gray-500">{booking.location_name} {booking.contact_name ? `(${booking.contact_name})` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Outcome selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Was ist passiert?</label>
            <div className="grid grid-cols-2 gap-2">
              {CALL_OUTCOME_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = outcome === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setOutcome(opt.value);
                      setError(null);
                      if (opt.value !== 'callback') setCallbackDate('');
                      if (opt.value !== 'phone_book') { setSelectedRoute(null); setSelectedTime(''); }
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all text-sm font-medium ${
                      selected ? opt.color + ' ring-1 ring-offset-1' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={16} /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Callback date picker */}
          {outcome === 'callback' && (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
              <label className="block text-sm font-medium text-purple-800 mb-2">
                <CalendarClock size={14} className="inline mr-1" />
                Wann erneut anrufen?
              </label>
              {/* Quick shortcuts */}
              <div className="flex flex-wrap gap-2 mb-3">
                {callbackShortcuts.map(s => (
                  <button
                    key={s.days}
                    onClick={() => setCallbackFromDays(s.days)}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-100 transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={callbackDate}
                min={todayISO()}
                onChange={e => setCallbackDate(e.target.value)}
                className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
              {callbackDate && (
                <p className="text-xs text-purple-600 mt-1.5">
                  Wiedervorlage am {formatDateShort(callbackDate)}
                </p>
              )}
            </div>
          )}

          {/* Phone booking sub-flow */}
          {outcome === 'phone_book' && (
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <label className="block text-sm font-medium text-green-800 mb-2">
                <Calendar size={14} className="inline mr-1" />
                Route und Zeitfenster waehlen ({booking.city})
              </label>

              {cityRoutes.length === 0 ? (
                <p className="text-sm text-green-600">Keine offenen Routen fuer {booking.city}.</p>
              ) : (
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {cityRoutes.map(route => {
                    const isSelected = selectedRoute?.id === route.id;
                    const dateFormatted = new Date(route.schedule_date + 'T00:00:00')
                      .toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
                    let slots = route.time_slots;
                    if (typeof slots === 'string') try { slots = JSON.parse(slots); } catch { slots = []; }
                    const slotCount = Array.isArray(slots) ? slots.length : 0;

                    return (
                      <button
                        key={route.id}
                        onClick={() => { setSelectedRoute(route); setSelectedTime(''); }}
                        className={`w-full text-left p-2.5 rounded-lg border transition-all text-sm ${
                          isSelected
                            ? 'border-green-400 bg-green-100'
                            : 'border-green-200 bg-white hover:bg-green-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{dateFormatted}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{slotCount} Slots</span>
                        </div>
                        {route.installer_team && <span className="text-xs text-gray-500">Team: {route.installer_team}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedRoute && availableTimes.length > 0 && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-green-800 mb-1.5">Zeitfenster</label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTimes.map(t => (
                      <button
                        key={t}
                        onClick={() => setSelectedTime(t)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          selectedTime === t
                            ? 'bg-green-200 border-green-400 text-green-800'
                            : 'bg-white border-green-200 text-gray-700 hover:bg-green-50'
                        }`}
                      >
                        {t} Uhr
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <StickyNote size={14} className="inline mr-1" />
              Notizen zum Anruf
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Was wurde besprochen? Besonderheiten? Kontaktinfos..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !outcome}
            className="px-5 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   CONTACT CARD — Enhanced with callback badge + notes + log
   =========================================================== */

function ContactCard({ booking, onCallOutcome, onShowLog, updatingId }) {
  const phoneStatus = booking.phone_status || 'not_called';
  const isUpdating = updatingId === booking.id;

  // Callback info
  const callbackDays = daysFromNow(booking.callback_date);
  const callbackDue = booking.callback_date && isTodayOrPast(booking.callback_date);
  const callbackSoon = callbackDays !== null && callbackDays >= 1 && callbackDays <= 2;

  return (
    <div className={`bg-white rounded-xl border p-4 hover:shadow-md transition-all ${
      isUpdating ? 'opacity-60 pointer-events-none' : ''
    } ${callbackDue ? 'border-purple-300 ring-1 ring-purple-200 bg-purple-50/30' :
        callbackSoon ? 'border-purple-200' : 'border-gray-200'
    }`}>
      {/* Callback due banner */}
      {callbackDue && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-100 px-2.5 py-1.5 rounded-lg mb-3 -mx-1 -mt-1">
          <Bell size={12} className="animate-pulse" />
          Wiedervorlage faellig — Heute anrufen!
          {booking.callback_reason && (
            <span className="font-normal text-purple-600 ml-1">({booking.callback_reason})</span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        {/* Left: Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate">
            {booking.location_name || 'Unbekannter Standort'}
          </h3>

          <div className="mt-1.5 space-y-1">
            {booking.contact_name && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <User size={13} className="text-gray-500 shrink-0" />
                <span className="truncate">{booking.contact_name}</span>
              </div>
            )}
            {booking.contact_phone && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <Phone size={13} className="text-gray-500 shrink-0" />
                <span className="font-mono text-xs">{booking.contact_phone}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin size={13} className="text-gray-500 shrink-0" />
              <span>{booking.city || '---'}</span>
            </div>
          </div>

          {/* WhatsApp info */}
          {booking.whatsapp_sent_at && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <MessageSquare size={11} />
              WhatsApp: {formatDateTime(booking.whatsapp_sent_at)}
            </div>
          )}

          {/* Last call + timeago */}
          {booking.phone_call_at && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
              <Clock size={11} />
              Letzter Anruf: {timeAgo(booking.phone_call_at)}
            </div>
          )}

          {/* Callback date (if not due — due shows banner above) */}
          {booking.callback_date && !callbackDue && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-purple-600">
              <CalendarClock size={11} />
              Wiedervorlage: {formatDateShort(booking.callback_date)}
              {callbackDays !== null && callbackDays > 0 && (
                <span className="text-purple-400">(in {callbackDays}d)</span>
              )}
            </div>
          )}

          {/* Phone notes */}
          {booking.phone_notes && (
            <div className="mt-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5 italic line-clamp-2">
              <StickyNote size={10} className="inline mr-1 text-gray-400" />
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
        <div className="flex items-center gap-2">
          {/* Call button */}
          {booking.contact_phone ? (
            <a
              href={`tel:${booking.contact_phone}`}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
              onClick={(e) => {
                // On desktop, also open outcome modal after a short delay
                if (!/Mobi|Android/i.test(navigator.userAgent)) {
                  e.preventDefault();
                  onCallOutcome(booking);
                }
              }}
            >
              <Phone size={14} /> Anrufen
            </a>
          ) : (
            <span className="text-xs text-gray-500 italic">Keine Nr.</span>
          )}

          {/* Log outcome button */}
          <button
            onClick={() => onCallOutcome(booking)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            title="Anruf-Ergebnis eintragen"
          >
            <Edit3 size={13} /> Ergebnis
          </button>
        </div>

        {/* Call history button */}
        <button
          onClick={() => onShowLog(booking)}
          className="flex items-center gap-1 px-2.5 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Anrufprotokoll anzeigen"
        >
          <History size={13} />
        </button>
      </div>
    </div>
  );
}

/* ===========================================================
   MAIN COMPONENT
   =========================================================== */

export default function PhoneAcquisitionTab() {
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCallStatus, setFilterCallStatus] = useState('');

  // Modals
  const [outcomeBooking, setOutcomeBooking] = useState(null);
  const [logBooking, setLogBooking] = useState(null);

  /* -- Data fetching ---------------------------------------- */

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('install_bookings')
        .select('*')
        .in('status', ['pending', 'contacted', 'cancelled'])
        .order('callback_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Sort: callbacks due first, then by created_at
      const sorted = (data || []).sort((a, b) => {
        const aDue = a.callback_date && isTodayOrPast(a.callback_date) ? 0 : 1;
        const bDue = b.callback_date && isTodayOrPast(b.callback_date) ? 0 : 1;
        if (aDue !== bDue) return aDue - bDue;

        // Then by callback_date (soonest first)
        if (a.callback_date && b.callback_date) return a.callback_date.localeCompare(b.callback_date);
        if (a.callback_date) return -1;
        if (b.callback_date) return 1;

        // Then by not_called first
        const aStatus = a.phone_status || 'not_called';
        const bStatus = b.phone_status || 'not_called';
        if (aStatus === 'not_called' && bStatus !== 'not_called') return -1;
        if (bStatus === 'not_called' && aStatus !== 'not_called') return 1;

        return new Date(b.created_at) - new Date(a.created_at);
      });

      setBookings(sorted);
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

  /* -- Stats ------------------------------------------------ */

  const stats = useMemo(() => {
    const all = bookings;
    const today = todayISO();
    return {
      total: all.length,
      calledToday: all.filter(b => isToday(b.phone_call_at)).length,
      confirmed: all.filter(b => b.phone_status === 'booked').length,
      notReached: all.filter(b => b.phone_status === 'not_reached' || b.phone_status === 'voicemail').length,
      callbacksDue: all.filter(b => b.callback_date && isTodayOrPast(b.callback_date)).length,
      callbacksTotal: all.filter(b => b.callback_date && !isTodayOrPast(b.callback_date)).length,
    };
  }, [bookings]);

  /* -- Filtering -------------------------------------------- */

  const cities = useMemo(() =>
    [...new Set(bookings.map(b => b.city).filter(Boolean))].sort(),
  [bookings]);

  const filtered = useMemo(() => {
    let result = bookings;

    // Search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(b =>
        (b.location_name || '').toLowerCase().includes(s) ||
        (b.contact_name || '').toLowerCase().includes(s) ||
        (b.city || '').toLowerCase().includes(s) ||
        (b.contact_phone || '').includes(s) ||
        (b.phone_notes || '').toLowerCase().includes(s)
      );
    }

    // City
    if (filterCity) {
      result = result.filter(b => b.city === filterCity);
    }

    // Status
    if (filterCallStatus) {
      if (filterCallStatus === 'not_called') {
        result = result.filter(b => !b.phone_status || b.phone_status === 'not_called');
      } else if (filterCallStatus === 'callbacks_due') {
        result = result.filter(b => b.callback_date && isTodayOrPast(b.callback_date));
      } else if (filterCallStatus === 'callback') {
        result = result.filter(b => b.phone_status === 'callback' || b.callback_date);
      } else {
        result = result.filter(b => b.phone_status === filterCallStatus);
      }
    }

    return result;
  }, [bookings, search, filterCity, filterCallStatus]);

  /* -- Handlers --------------------------------------------- */

  const handleCallOutcome = (booking) => {
    setOutcomeBooking(booking);
  };

  const handleShowLog = (booking) => {
    setLogBooking(booking);
  };

  const handleOutcomeComplete = () => {
    fetchBookings();
    fetchRoutes();
  };

  /* -- Render ----------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Telefonakquise</h2>
          <p className="text-gray-500 mt-1 text-sm">
            Standorte anrufen, Notizen festhalten & Wiedervorlagen planen.
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

      {/* Stats Bar — 5 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <Phone size={14} /> Offen
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <PhoneCall size={14} /> Heute angerufen
          </div>
          <div className="text-2xl font-bold text-orange-600">{stats.calledToday}</div>
        </div>
        <div
          className={`rounded-xl border p-4 cursor-pointer transition-colors ${
            stats.callbacksDue > 0
              ? 'bg-purple-50 border-purple-300 hover:bg-purple-100'
              : 'bg-white border-gray-200 hover:bg-gray-50'
          }`}
          onClick={() => setFilterCallStatus(filterCallStatus === 'callbacks_due' ? '' : 'callbacks_due')}
        >
          <div className="flex items-center gap-2 text-purple-600 text-xs font-medium mb-1">
            <Bell size={14} className={stats.callbacksDue > 0 ? 'animate-pulse' : ''} /> Heute faellig
          </div>
          <div className={`text-2xl font-bold ${stats.callbacksDue > 0 ? 'text-purple-700' : 'text-gray-400'}`}>
            {stats.callbacksDue}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <CheckCircle size={14} /> Gebucht
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
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Standort, Kontakt, Telefonnummer oder Notiz suchen..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-400 text-sm"
          />
        </div>

        <select
          value={filterCity}
          onChange={e => setFilterCity(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-orange-400 text-sm bg-white"
        >
          <option value="">Alle Staedte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
          {CALL_STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilterCallStatus(filterCallStatus === f.value ? '' : f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filterCallStatus === f.value
                  ? f.value === 'callbacks_due' ? 'bg-purple-500 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
              {f.value === 'callbacks_due' && stats.callbacksDue > 0 && (
                <span className="ml-1 bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {stats.callbacksDue}
                </span>
              )}
              {f.value === 'callback' && stats.callbacksTotal > 0 && (
                <span className="ml-1 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {stats.callbacksTotal}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contact List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">
          <Loader2 size={20} className="animate-spin mr-2" /> Kontakte werden geladen...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 bg-white rounded-xl border border-gray-200">
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
              onCallOutcome={handleCallOutcome}
              onShowLog={handleShowLog}
              updatingId={updatingId}
            />
          ))}
        </div>
      )}

      {/* Result count */}
      {!loading && filtered.length > 0 && (
        <div className="text-center text-xs text-gray-500">
          {filtered.length} von {bookings.length} Kontakten angezeigt
        </div>
      )}

      {/* Call Outcome Modal */}
      {outcomeBooking && (
        <CallOutcomeModal
          booking={outcomeBooking}
          routes={routes}
          onClose={() => setOutcomeBooking(null)}
          onComplete={handleOutcomeComplete}
        />
      )}

      {/* Call Log Modal */}
      {logBooking && (
        <CallLogModal
          booking={logBooking}
          onClose={() => setLogBooking(null)}
        />
      )}
    </div>
  );
}
