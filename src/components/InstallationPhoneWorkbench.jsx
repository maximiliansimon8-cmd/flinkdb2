import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed, Clock, MapPin, User, Calendar,
  CheckCircle, XCircle, AlertCircle, Search, RefreshCw, Loader2, ChevronRight,
  Send, RotateCcw, ArrowRight, Inbox, Building, X, Check, Copy,
  PlayCircle, PauseCircle, SkipForward, MessageSquare, CalendarCheck,
  PhoneForwarded, History, AlertTriangle, Timer, List, ChevronDown,
  Ban, RotateCw, FileText, Eye, EyeOff,
} from 'lucide-react';
import { fetchAllAcquisition } from '../utils/airtableService';
import { INSTALL_API, formatDateShortDE as formatDate, formatDateTime } from '../utils/installUtils';
import { isStorno, isAlreadyInstalled, isReadyForInstall, OVERDUE_THRESHOLDS } from '../metrics';
import { getCurrentUser } from '../utils/authService';
import SuperChatHistory from './SuperChatHistory';

/* ── Shared Helpers ── */
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

/* ── Call Outcome Options ── */
const CALL_OUTCOMES = [
  { id: 'booked', label: 'Termin vereinbart', icon: CalendarCheck, color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'reached', label: 'Erreicht', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'not_reached', label: 'Nicht erreicht', icon: PhoneMissed, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { id: 'mailbox', label: 'Mailbox', icon: MessageSquare, color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'callback', label: 'Rueckruf vereinbart', icon: PhoneForwarded, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'no_interest', label: 'Kein Interesse', icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200' },
  { id: 'wrong_number', label: 'Falsche Nummer', icon: PhoneOff, color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

/* ── Quick Outcome Buttons (for during active call) ── */
const QUICK_OUTCOMES = [
  { id: 'reached', label: 'Erreicht', color: 'bg-emerald-600 hover:bg-emerald-700' },
  { id: 'not_reached', label: 'Nicht erreicht', color: 'bg-yellow-600 hover:bg-yellow-700' },
  { id: 'mailbox', label: 'Mailbox', color: 'bg-orange-600 hover:bg-orange-700' },
  { id: 'booked', label: 'Termin vereinbart', color: 'bg-green-600 hover:bg-green-700' },
];

/* ── LocalStorage Key for Call Log ── */
const CALL_LOG_KEY = 'jet-install-call-log';

/* ── Format call duration ── */
function formatCallDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}


/* ── Standort Search / Autocomplete ── */
function StandortSearch({ readyStandorte, selectedStandort, onSelect, onClear }) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Filter standorte by query across multiple fields
  const filteredResults = useMemo(() => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase().trim();
    return readyStandorte
      .filter(a => {
        const name = (a.locationName || '').toLowerCase();
        const jetId = (a.jetId || '').toLowerCase();
        const street = (a.street || '').toLowerCase();
        const streetNum = (a.streetNumber || '').toLowerCase();
        const postal = (a.postalCode || '').toLowerCase();
        const cities = Array.isArray(a.city) ? a.city.map(c => c.toLowerCase()) : [];
        const contact = (a.contactPerson || '').toLowerCase();
        return (
          name.includes(q) ||
          jetId.includes(q) ||
          street.includes(q) ||
          (street + ' ' + streetNum).includes(q) ||
          postal.includes(q) ||
          cities.some(c => c.includes(q)) ||
          contact.includes(q)
        );
      })
      .slice(0, 10);
  }, [query, readyStandorte]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!showDropdown || filteredResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, filteredResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(filteredResults[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSelect = (standort) => {
    onSelect(standort);
    setQuery('');
    setShowDropdown(false);
    setHighlightIndex(-1);
  };

  // If a standort is already selected, show it as a chip
  if (selectedStandort) {
    const city = Array.isArray(selectedStandort.city) ? selectedStandort.city[0] : selectedStandort.city || '';
    const addr = [selectedStandort.street, selectedStandort.streetNumber].filter(Boolean).join(' ');
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <Building size={16} className="text-purple-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{selectedStandort.locationName || 'Unbekannt'}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                {selectedStandort.jetId && !selectedStandort.jetId.startsWith('rec') && <span className="font-mono text-purple-600">{selectedStandort.jetId}</span>}
                {selectedStandort.jetId && !selectedStandort.jetId.startsWith('rec') && city && <span className="text-gray-300">|</span>}
                {city && <><MapPin size={10} /> {city}</>}
                {addr && <span className="text-gray-300">|</span>}
                {addr && <span>{addr}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-purple-100 rounded-lg transition-colors shrink-0 ml-2"
            title="Auswahl aufheben"
          >
            <X size={16} className="text-purple-400" />
          </button>
        </div>
      </div>
    );
  }

  // Search input with dropdown
  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setShowDropdown(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => { if (query.length >= 1) setShowDropdown(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Standort suchen (Name, JET-ID, PLZ, Stadt, Adresse)..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && query.length >= 1 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-[340px] overflow-y-auto"
        >
          {filteredResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Kein Standort gefunden fuer &quot;{query}&quot;
            </div>
          ) : (
            filteredResults.map((a, idx) => {
              const city = Array.isArray(a.city) ? a.city[0] : a.city || '';
              const addr = [a.street, a.streetNumber].filter(Boolean).join(' ');
              return (
                <button
                  key={a.id}
                  onClick={() => handleSelect(a)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 last:border-b-0 ${
                    idx === highlightIndex ? 'bg-purple-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Building size={14} className="text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{a.locationName || 'Unbekannt'}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                      {a.jetId && !a.jetId.startsWith('rec') && <span className="font-mono text-purple-500">{a.jetId}</span>}
                      {a.jetId && !a.jetId.startsWith('rec') && <span className="text-gray-200">|</span>}
                      <MapPin size={10} /> {city}
                      {addr && <span className="text-gray-200">|</span>}
                      {addr && <span>{addr}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}


/* ── History Event Config ── */
const HISTORY_EVENT_TYPES = {
  created:       { label: 'Buchung erstellt',        icon: FileText,       color: 'bg-gray-100 text-gray-600 border-gray-200',    dotColor: 'bg-gray-400' },
  whatsapp_sent: { label: 'WhatsApp gesendet',       icon: Send,           color: 'bg-green-100 text-green-700 border-green-200',  dotColor: 'bg-green-500' },
  booked:        { label: 'Termin gebucht',            icon: CheckCircle,    color: 'bg-green-100 text-green-700 border-green-200',   dotColor: 'bg-green-500' },
  confirmed:     { label: 'Termin gebucht',           icon: CheckCircle,    color: 'bg-green-100 text-green-700 border-green-200',      dotColor: 'bg-green-500' },
  completed:     { label: 'Abgeschlossen',            icon: CheckCircle,    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dotColor: 'bg-emerald-600' },
  cancelled:     { label: 'Storniert',                icon: XCircle,        color: 'bg-red-100 text-red-700 border-red-200',        dotColor: 'bg-red-500' },
  no_show:       { label: 'No-Show',                  icon: Ban,            color: 'bg-orange-100 text-orange-700 border-orange-200', dotColor: 'bg-orange-500' },
  rescheduled:   { label: 'Umgebucht',                icon: RotateCw,       color: 'bg-indigo-100 text-indigo-700 border-indigo-200', dotColor: 'bg-indigo-500' },
  call_booked:   { label: 'Termin vereinbart (Anruf)', icon: CalendarCheck, color: 'bg-green-100 text-green-700 border-green-200',  dotColor: 'bg-green-600' },
  call_reached:  { label: 'Erreicht (Anruf)',         icon: PhoneCall,      color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dotColor: 'bg-emerald-500' },
  call_not_reached: { label: 'Nicht erreicht (Anruf)', icon: PhoneMissed,  color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dotColor: 'bg-yellow-500' },
  call_mailbox:  { label: 'Mailbox (Anruf)',          icon: MessageSquare,  color: 'bg-orange-100 text-orange-700 border-orange-200', dotColor: 'bg-orange-400' },
  call_callback: { label: 'Rueckruf vereinbart',      icon: PhoneForwarded, color: 'bg-blue-100 text-blue-700 border-blue-200',     dotColor: 'bg-blue-500' },
  call_no_interest: { label: 'Kein Interesse (Anruf)', icon: XCircle,      color: 'bg-red-100 text-red-700 border-red-200',         dotColor: 'bg-red-400' },
  call_wrong_number: { label: 'Falsche Nummer',       icon: PhoneOff,      color: 'bg-gray-100 text-gray-600 border-gray-200',     dotColor: 'bg-gray-500' },
};

/* ── Location History Component ── */
function LocationHistory({ akquiseRecordId, callLog }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Fetch all bookings for this acquisition ID from Supabase via existing API
  useEffect(() => {
    if (!akquiseRecordId) {
      setBookings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${INSTALL_API.BOOKINGS}?`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const all = Array.isArray(data) ? data : [];
        // Filter bookings for this specific location
        const locationBookings = all.filter(b => b.akquise_airtable_id === akquiseRecordId);
        setBookings(locationBookings);
      })
      .catch(() => {
        if (!cancelled) setBookings([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [akquiseRecordId]);

  // Build timeline events from booking data
  const timelineEvents = useMemo(() => {
    const events = [];

    // 1. Events from bookings (Supabase)
    for (const b of bookings) {
      // Created
      if (b.created_at) {
        events.push({
          date: b.created_at,
          type: 'created',
          detail: `Buchung erstellt | ${b.booking_source === 'whatsapp_agent' ? 'WhatsApp' : b.booking_source === 'phone' ? 'Telefon' : b.booking_source === 'self_booking' ? 'Selbstbuchung' : b.booking_source || 'Manuell'}`,
          bookingId: b.id,
        });
      }

      // WhatsApp sent
      if (b.whatsapp_sent_at) {
        events.push({
          date: b.whatsapp_sent_at,
          type: 'whatsapp_sent',
          detail: `Einladung per WhatsApp an ${b.contact_phone || '--'}`,
          bookingId: b.id,
        });
      }

      // Booked
      if (b.booked_at && b.booked_date) {
        const dateStr = new Date(b.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
        events.push({
          date: b.booked_at,
          type: 'booked',
          detail: `Termin gebucht fuer ${dateStr} ${b.booked_time || ''} Uhr`,
          bookingId: b.id,
        });
      }

      // Confirmed
      // confirmed_at no longer tracked — bookings are auto-confirmed

      // Status-based events (cancelled, no_show, completed)
      if (b.status === 'cancelled' && b.updated_at && b.updated_at !== b.created_at) {
        events.push({
          date: b.updated_at,
          type: 'cancelled',
          detail: b.booked_date
            ? `Termin am ${new Date(b.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} storniert`
            : 'Buchung storniert',
          bookingId: b.id,
        });
      }

      if (b.status === 'no_show' && b.updated_at && b.updated_at !== b.created_at) {
        events.push({
          date: b.updated_at,
          type: 'no_show',
          detail: b.booked_date
            ? `No-Show am ${new Date(b.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`
            : 'No-Show markiert',
          bookingId: b.id,
        });
      }

      if (b.status === 'completed' && b.updated_at && b.updated_at !== b.created_at) {
        events.push({
          date: b.updated_at,
          type: 'completed',
          detail: 'Installation abgeschlossen',
          bookingId: b.id,
        });
      }

      // Reschedule events (parsed from notes field)
      if (b.notes) {
        const rescheduleMatches = b.notes.match(/Umgebucht:.*?\(.*?\)/g);
        if (rescheduleMatches) {
          for (const match of rescheduleMatches) {
            // Try to extract the date from the parentheses
            const dateMatch = match.match(/\((.+?)\)/);
            const dateStr = dateMatch ? dateMatch[1] : null;
            let eventDate = b.updated_at || b.created_at;
            if (dateStr) {
              try {
                // Try parsing German date format from the notes
                const parsed = new Date(dateStr);
                if (!isNaN(parsed.getTime())) eventDate = parsed.toISOString();
              } catch { /* keep default */ }
            }
            events.push({
              date: eventDate,
              type: 'rescheduled',
              detail: match,
              bookingId: b.id,
            });
          }
        }
      }
    }

    // 2. Events from local call log
    if (callLog && callLog.length > 0) {
      const locationCallLogs = callLog.filter(l =>
        l.standortId === akquiseRecordId
      );
      for (const log of locationCallLogs) {
        const callType = `call_${log.outcome}`;
        const durationStr = log.duration ? ` (${Math.floor(log.duration / 60)}:${String(log.duration % 60).padStart(2, '0')})` : '';
        events.push({
          date: log.timestamp || new Date(log.id).toISOString(),
          type: HISTORY_EVENT_TYPES[callType] ? callType : 'call_reached',
          detail: `${HISTORY_EVENT_TYPES[callType]?.label || log.outcome}${durationStr}${log.notes ? ' -- ' + log.notes : ''}`,
          isCallLog: true,
        });
      }
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    return events;
  }, [bookings, callLog, akquiseRecordId]);

  if (!akquiseRecordId) return null;

  const hasHistory = timelineEvents.length > 0;

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
      {/* Header with toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History size={15} className="text-purple-500" />
          <span className="text-xs font-semibold text-gray-700">Standort-Historie</span>
          {hasHistory && (
            <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
              {timelineEvents.length}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Timeline content */}
      {expanded && (
        <div className="px-4 pb-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 justify-center text-gray-400 text-xs">
              <Loader2 size={14} className="animate-spin text-purple-400" />
              Historie wird geladen...
            </div>
          ) : !hasHistory ? (
            <div className="flex flex-col items-center py-4 text-gray-400 gap-1">
              <Inbox size={20} className="text-gray-300" />
              <span className="text-xs">Keine bisherigen Interaktionen</span>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" />

              <div className="space-y-3">
                {timelineEvents.map((event, i) => {
                  const cfg = HISTORY_EVENT_TYPES[event.type] || HISTORY_EVENT_TYPES.created;
                  const EventIcon = cfg.icon;
                  const eventDate = new Date(event.date);
                  const dateStr = eventDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
                  const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={`${event.type}-${event.date}-${i}`} className="flex items-start gap-3 relative">
                      {/* Timeline dot */}
                      <div className={`w-[20px] h-[20px] rounded-full flex items-center justify-center shrink-0 z-10 border-2 border-white ${cfg.dotColor}`}>
                        <EventIcon size={10} className="text-white" />
                      </div>

                      {/* Event content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">{dateStr} {timeStr}</span>
                        </div>
                        {event.detail && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{event.detail}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ── Active Call Panel with Call Tracker ── */
function ActiveCallPanel({ item, routes, onComplete, onSkip, isBookingItem, readyStandorte, callLog }) {
  const [outcome, setOutcome] = useState(null);
  const [bookingForm, setBookingForm] = useState({ city: '', bookedDate: '', bookedTime: '', notes: '', contactName: '', contactPhone: '', jetId: '', locationName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedStandort, setSelectedStandort] = useState(null);

  // ── Call Tracker State ──
  const [activeCall, setActiveCall] = useState(null); // { startedAt, standortId, contactName, phone }
  const [callElapsed, setCallElapsed] = useState(0);
  const [showEndCallForm, setShowEndCallForm] = useState(false);
  const timerRef = useRef(null);

  // Reset when item changes
  useEffect(() => {
    setOutcome(null);
    setCopied(false);
    setActiveCall(null);
    setCallElapsed(0);
    setShowEndCallForm(false);
    setFreeDate(false);
    if (timerRef.current) clearInterval(timerRef.current);

    if (item) {
      const ph = isBookingItem ? item.contact_phone : item.contactPhone;
      const nm = isBookingItem ? (item.contact_name || item.location_name) : (item.contactPerson || item.locationName);
      const ln = isBookingItem ? item.location_name : item.locationName;
      const ct = isBookingItem ? item.city : (item.city || [])[0] || '';
      const jid = isBookingItem ? item.jet_id : item.jetId;

      setBookingForm({
        city: ct,
        bookedDate: '',
        bookedTime: '',
        notes: '',
        contactName: nm || '',
        contactPhone: ph || '',
        jetId: jid || '',
        locationName: ln || '',
      });

      if (!isBookingItem && item.id) {
        const match = readyStandorte.find(s => s.id === item.id);
        setSelectedStandort(match || null);
      } else if (isBookingItem && item.akquise_airtable_id) {
        const match = readyStandorte.find(s => s.id === item.akquise_airtable_id);
        setSelectedStandort(match || null);
      } else {
        setSelectedStandort(null);
      }
    } else {
      setBookingForm({ city: '', bookedDate: '', bookedTime: '', notes: '', contactName: '', contactPhone: '', jetId: '', locationName: '' });
      setSelectedStandort(null);
    }
  }, [item?.id, isBookingItem, readyStandorte]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Call timer tick
  useEffect(() => {
    if (activeCall) {
      timerRef.current = setInterval(() => {
        setCallElapsed(Math.floor((Date.now() - activeCall.startedAt) / 1000));
      }, 1000);
      return () => clearInterval(timerRef.current);
    } else {
      setCallElapsed(0);
    }
  }, [activeCall]);

  if (!item) return null;

  const phone = bookingForm.contactPhone;
  const name = bookingForm.contactName;
  const locationName = bookingForm.locationName;
  const city = bookingForm.city;
  const jetId = bookingForm.jetId;
  const akquiseRecordId = selectedStandort?.id || (isBookingItem ? item.akquise_airtable_id : item.id);

  // ── Start a call ──
  const startCall = () => {
    setActiveCall({
      startedAt: Date.now(),
      standortId: akquiseRecordId,
      standortName: locationName,
      contactName: name,
      phone: phone,
      jetId: jetId,
    });
    setShowEndCallForm(false);
    setOutcome(null);
  };

  // ── End call (show outcome form) ──
  const endCall = () => {
    setShowEndCallForm(true);
  };

  // ── Quick outcome during call ──
  const handleQuickOutcome = (outcomeId) => {
    setOutcome(outcomeId);
    setShowEndCallForm(true);
    // If "Termin vereinbart", auto-open booking form
  };

  const handleStandortSelect = (standort) => {
    setSelectedStandort(standort);
    const ct = Array.isArray(standort.city) ? standort.city[0] : standort.city || '';
    setBookingForm(f => ({
      ...f,
      locationName: standort.locationName || '',
      jetId: standort.jetId || '',
      contactName: standort.contactPerson || '',
      contactPhone: standort.contactPhone || '',
      city: ct,
      bookedDate: '',
      bookedTime: '',
    }));
    // Reset call state when changing standort
    setActiveCall(null);
    setShowEndCallForm(false);
    setOutcome(null);
  };

  const handleStandortClear = () => {
    setSelectedStandort(null);
    setActiveCall(null);
    setShowEndCallForm(false);
    setOutcome(null);
    setBookingForm(f => ({
      ...f,
      locationName: '',
      jetId: '',
      contactName: '',
      contactPhone: '',
      city: '',
      bookedDate: '',
      bookedTime: '',
    }));
  };

  const copyPhone = () => {
    if (phone) {
      navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Free date input mode (no route needed)
  const [freeDate, setFreeDate] = useState(false);

  // Available dates for booking from routes
  const availableDates = useMemo(() => {
    const c = bookingForm.city;
    if (!c) return [];
    return (routes || [])
      .filter(r => r.city === c && r.status === 'open')
      .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
  }, [routes, bookingForm.city]);

  const availableTimes = useMemo(() => {
    if (!bookingForm.bookedDate) return [];
    if (freeDate) return []; // free time entry, no route slots
    const route = availableDates.find(r => r.schedule_date === bookingForm.bookedDate);
    if (!route) return [];
    let slots = route.time_slots;
    if (typeof slots === 'string') {
      try { slots = JSON.parse(slots); } catch { slots = []; }
      if (typeof slots === 'string') {
        try { slots = JSON.parse(slots); } catch { slots = []; }
      }
    }
    return Array.isArray(slots) ? slots : [];
  }, [availableDates, bookingForm.bookedDate, freeDate]);

  const availableCities = useMemo(() => {
    // Include cities from routes AND from readyStandorte
    const citySet = new Set();
    (routes || []).forEach(r => { if (r.city) citySet.add(r.city); });
    (readyStandorte || []).forEach(a => {
      const cities = Array.isArray(a.city) ? a.city : (a.city ? [a.city] : []);
      cities.forEach(c => { if (c) citySet.add(c); });
    });
    return [...citySet].sort();
  }, [routes, readyStandorte]);

  const handleBookAndComplete = async () => {
    if (outcome !== 'booked' || !bookingForm.bookedDate || !bookingForm.bookedTime) return;
    setSubmitting(true);
    try {
      const currentUser = getCurrentUser();
      const res = await fetch(INSTALL_API.BOOKINGS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          akquiseAirtableId: akquiseRecordId,
          locationName: locationName || '',
          city: bookingForm.city || '',
          contactName: name || '',
          contactPhone: phone || '',
          jetId: jetId || '',
          bookedDate: bookingForm.bookedDate,
          bookedTime: bookingForm.bookedTime,
          notes: bookingForm.notes || '',
          bookingSource: 'phone',
          created_by_user_id: currentUser?.id || null,
          created_by_user_name: currentUser?.name || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveCall(null);
        onComplete(item, 'booked', bookingForm.notes, callElapsed);
      }
    } catch (e) {
      console.error('Booking failed:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOutcomeComplete = () => {
    if (!outcome || outcome === 'booked') return;
    setActiveCall(null);
    onComplete(item, outcome, bookingForm.notes, callElapsed);
  };

  // Whether form fields below the search should be interactive
  const standortSelected = !!selectedStandort;
  const isInCall = !!activeCall;

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-purple-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className={`px-6 py-4 border-b transition-colors ${
        isInCall
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
          : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-100'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isInCall ? 'bg-green-100' : 'bg-purple-100'
            }`}>
              <PhoneCall size={20} className={isInCall ? 'text-green-600 animate-pulse' : 'text-purple-600'} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">{locationName || 'Standort waehlen...'}</h3>
              <p className="text-sm text-gray-500 flex items-center gap-2">
                {city ? <><MapPin size={13} /> {city}</> : <span className="text-gray-400">Bitte Standort suchen</span>}
                {jetId && !jetId.startsWith('rec') && <span className="text-gray-300">|</span>}
                {jetId && !jetId.startsWith('rec') && <span className="font-mono text-xs">{jetId}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live call timer */}
            {isInCall && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 rounded-lg border border-green-200">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <Timer size={14} className="text-green-600" />
                <span className="font-mono text-sm font-semibold text-green-700">{formatCallDuration(callElapsed)}</span>
              </div>
            )}
            <button
              onClick={() => onSkip(item)}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-1 transition-colors"
            >
              <SkipForward size={12} /> Ueberspringen
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Standort Search */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Standort suchen</label>
          <StandortSearch
            readyStandorte={readyStandorte}
            selectedStandort={selectedStandort}
            onSelect={handleStandortSelect}
            onClear={handleStandortClear}
          />
        </div>

        <div className={`transition-opacity ${standortSelected ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

          {/* ── Contact Info + Anrufen Button ── */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-5">
            <div className="text-xs text-gray-400 mb-2">Standort-Details</div>

            {/* JET-ID */}
            <div className="mb-2">
              <label className="block text-[10px] font-medium text-gray-400 mb-0.5">JET-ID</label>
              <input
                type="text"
                value={jetId}
                readOnly
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-500 font-mono cursor-not-allowed"
                tabIndex={-1}
              />
            </div>

            {/* Kontaktperson */}
            <div className="mb-2">
              <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Kontaktperson</label>
              <input
                type="text"
                value={bookingForm.contactName}
                onChange={e => setBookingForm(f => ({ ...f, contactName: e.target.value }))}
                placeholder="Name der Kontaktperson"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all"
              />
            </div>

            {/* Telefon + Copy */}
            <div className="mb-3">
              <label className="block text-[10px] font-medium text-gray-400 mb-0.5">Telefon</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bookingForm.contactPhone}
                  onChange={e => setBookingForm(f => ({ ...f, contactPhone: e.target.value }))}
                  placeholder="Telefonnummer"
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all"
                />
                {phone && (
                  <button onClick={copyPhone} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="Nummer kopieren">
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-400" />}
                  </button>
                )}
              </div>
            </div>

            {/* ── PRIMARY CTA: Anrufen / Anruf beenden ── */}
            {phone && !isInCall && (
              <a
                href={`tel:${phone}`}
                onClick={startCall}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm shadow-green-200"
              >
                <PhoneCall size={18} /> Anrufen
              </a>
            )}

            {isInCall && !showEndCallForm && (
              <div className="space-y-3">
                {/* Active call indicator */}
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-green-800">Anruf laeuft...</div>
                    <div className="text-xs text-green-600">{name} | {phone}</div>
                  </div>
                  <span className="font-mono text-lg font-bold text-green-700">{formatCallDuration(callElapsed)}</span>
                </div>

                {/* Quick outcome buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_OUTCOMES.map(qo => (
                    <button
                      key={qo.id}
                      onClick={() => handleQuickOutcome(qo.id)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-white rounded-xl font-medium text-xs transition-colors ${qo.color}`}
                    >
                      {qo.label}
                    </button>
                  ))}
                </div>

                {/* End call button */}
                <button
                  onClick={endCall}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  <PhoneOff size={16} /> Anruf beenden
                </button>
              </div>
            )}
          </div>

          {/* ── Location History (Bookings + Call Log) ── */}
          {akquiseRecordId && (
            <div className="mb-5">
              <LocationHistory
                akquiseRecordId={akquiseRecordId}
                callLog={callLog}
              />
            </div>
          )}

          {/* ── WhatsApp Chat History ── */}
          {phone && (
            <SuperChatHistory
              contactPhone={phone}
              contactName={name || locationName}
              collapsed={true}
              maxHeight="350px"
              className="mb-5"
            />
          )}

          {/* ── Post-call: Outcome + Notes + Booking (shown after call ends or quick outcome) ── */}
          {(showEndCallForm || (!isInCall && !activeCall)) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Outcome + Notes */}
              <div className="space-y-4">
                {/* Call summary (if we just ended a call) */}
                {showEndCallForm && isInCall && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <Phone size={16} className="text-gray-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-700">Anrufdauer</div>
                      <div className="text-xs text-gray-400">{name} | {phone}</div>
                    </div>
                    <span className="font-mono text-sm font-semibold text-gray-700">{formatCallDuration(callElapsed)}</span>
                  </div>
                )}

                {/* Call Outcome */}
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Ergebnis des Anrufs</div>
                  <div className="grid grid-cols-1 gap-2">
                    {CALL_OUTCOMES.map(o => {
                      const Icon = o.icon;
                      return (
                        <button
                          key={o.id}
                          onClick={() => setOutcome(o.id)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left ${
                            outcome === o.id
                              ? `${o.color} ring-2 ring-offset-1`
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <Icon size={18} />
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Anmerkungen</label>
                  <textarea
                    value={bookingForm.notes}
                    onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="z.B. Inhaber war interessiert, ruft zurueck..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 transition-all resize-none"
                  />
                </div>

                {/* Non-booking Complete */}
                {outcome && outcome !== 'booked' && (
                  <button
                    onClick={handleOutcomeComplete}
                    className="w-full px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Check size={16} /> Anruf abschliessen
                  </button>
                )}
              </div>

              {/* Right: Quick Book Form (shown when outcome = booked / Termin vereinbart) */}
              <div className={`space-y-4 transition-opacity ${outcome === 'booked' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <CalendarCheck size={16} className="text-green-600" /> Termin buchen
                  </div>
                  {/* Toggle: Route vs Free Date */}
                  <button
                    onClick={() => {
                      setFreeDate(!freeDate);
                      setBookingForm(f => ({ ...f, bookedDate: '', bookedTime: '' }));
                    }}
                    className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-all ${
                      freeDate
                        ? 'bg-orange-100 border-orange-300 text-orange-700'
                        : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {freeDate ? '← Routen-Termine' : 'Freies Datum'}
                  </button>
                </div>

                {/* City */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Stadt</label>
                  <select
                    value={bookingForm.city}
                    onChange={e => setBookingForm(f => ({ ...f, city: e.target.value, bookedDate: '', bookedTime: '' }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                  >
                    <option value="">Stadt waehlen...</option>
                    {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Date: Route-based or Free */}
                {!freeDate ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Datum (aus Routen)</label>
                    <select
                      value={bookingForm.bookedDate}
                      onChange={e => setBookingForm(f => ({ ...f, bookedDate: e.target.value, bookedTime: '' }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                    >
                      <option value="">Datum waehlen...</option>
                      {availableDates.map(r => (
                        <option key={r.schedule_date} value={r.schedule_date}>
                          {new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })}
                          {r.installer_team ? ` -- ${r.installer_team}` : ''}
                        </option>
                      ))}
                    </select>
                    {bookingForm.city && availableDates.length === 0 && (
                      <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                        <AlertTriangle size={10} /> Keine offenen Routen fuer {bookingForm.city}.
                        <button onClick={() => { setFreeDate(true); }} className="underline font-medium">Freies Datum nutzen</button>
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Datum (frei waehlen)</label>
                    <input
                      type="date"
                      value={bookingForm.bookedDate}
                      onChange={e => setBookingForm(f => ({ ...f, bookedDate: e.target.value, bookedTime: '' }))}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                    />
                  </div>
                )}

                {/* Time Slots (Route) or Free Time Input */}
                {bookingForm.bookedDate && !freeDate && availableTimes.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Uhrzeit</label>
                    <div className="grid grid-cols-3 gap-2">
                      {availableTimes.map(t => (
                        <button
                          key={t}
                          onClick={() => setBookingForm(f => ({ ...f, bookedTime: t }))}
                          className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                            bookingForm.bookedTime === t
                              ? 'bg-green-100 border-green-400 text-green-700 ring-2 ring-green-400/30'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {t} Uhr
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Free Time Input */}
                {bookingForm.bookedDate && freeDate && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Uhrzeit (frei waehlen)</label>
                    <input
                      type="time"
                      value={bookingForm.bookedTime}
                      onChange={e => setBookingForm(f => ({ ...f, bookedTime: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
                    />
                  </div>
                )}

                {/* Free date route match hint */}
                {freeDate && bookingForm.bookedDate && bookingForm.city && (
                  (() => {
                    const matchRoute = availableDates.find(r => r.schedule_date === bookingForm.bookedDate);
                    return matchRoute ? (
                      <p className="text-[10px] text-green-600 flex items-center gap-1">
                        <CheckCircle size={10} /> Route vorhanden: {matchRoute.installer_team || 'Kein Team'}
                      </p>
                    ) : (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={10} /> Keine Route an diesem Tag — Termin wird trotzdem erstellt
                      </p>
                    );
                  })()
                )}

                {/* Book Button */}
                {outcome === 'booked' && bookingForm.bookedDate && bookingForm.bookedTime && (
                  <button
                    onClick={handleBookAndComplete}
                    disabled={submitting}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
                    Termin buchen und Anruf abschliessen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ── Queue Item Component ── */
function QueueItem({ item, isActive, onClick, type, index }) {
  const isBooking = type === 'followup' || type === 'noResponse';
  const name = isBooking ? (item.location_name || item.contact_name) : (item.locationName || item.contactPerson);
  const city = isBooking ? item.city : (item.city || [])[0] || '';
  const phone = isBooking ? item.contact_phone : item.contactPhone;
  const timeInfo = type === 'noResponse' && item.whatsapp_sent_at
    ? timeAgo(item.whatsapp_sent_at)
    : type === 'followup' && item.booked_date
    ? formatDate(item.booked_date)
    : '';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
        isActive
          ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-300'
          : 'bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900 truncate">{name || 'Unbekannt'}</div>
        <div className="text-xs text-gray-400 flex items-center gap-1.5">
          <MapPin size={10} /> {city}
          {phone && (
            <>
              <span className="text-gray-200">|</span>
              <Phone size={10} /> <span className="font-mono">{phone}</span>
            </>
          )}
        </div>
      </div>
      {timeInfo && (
        <span className="text-[10px] text-gray-400 font-mono shrink-0">{timeInfo}</span>
      )}
      <ChevronRight size={14} className="text-gray-300 shrink-0" />
    </button>
  );
}


/* ── Call Log Entry ── */
function CallLogEntry({ entry }) {
  const outcomeConfig = CALL_OUTCOMES.find(o => o.id === entry.outcome) || CALL_OUTCOMES[2];
  const Icon = outcomeConfig.icon;
  const durationStr = entry.duration != null ? formatCallDuration(entry.duration) : null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${outcomeConfig.color.split(' ')[0]}`}>
        <Icon size={14} className={outcomeConfig.color.split(' ')[1]} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900 truncate">{entry.name}</div>
        <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
          {entry.city && <span>{entry.city}</span>}
          {entry.city && <span className="text-gray-200">|</span>}
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${outcomeConfig.color}`}>
            <Icon size={10} />
            {outcomeConfig.label}
          </span>
          {durationStr && (
            <>
              <span className="text-gray-200">|</span>
              <span className="flex items-center gap-0.5">
                <Timer size={10} className="text-gray-300" />
                {durationStr}
              </span>
            </>
          )}
        </div>
        {entry.notes && (
          <div className="text-[11px] text-gray-400 mt-0.5 truncate italic">{entry.notes}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className="text-[10px] text-gray-400 font-mono block">{entry.time}</span>
        {entry.phone && (
          <span className="text-[10px] text-gray-300 font-mono block">{entry.phone}</span>
        )}
      </div>
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationPhoneWorkbench({ filterCity: filterCityProp }) {
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const [activeItemType, setActiveItemType] = useState(null); // 'queue', 'noResponse', 'followup'
  const [callLog, setCallLog] = useState([]);
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'noResponse', 'followup', 'log'
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [acqData, bookRes, routeRes] = await Promise.all([
        fetchAllAcquisition(),
        fetch(INSTALL_API.BOOKINGS + '?').then(r => r.json()).catch(() => []),
        fetch(`${INSTALL_API.SCHEDULE}?from=${today}&status=open`).then(r => r.json()).catch(() => []),
      ]);
      setAcquisitionData(acqData || []);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
      setRoutes(Array.isArray(routeRes) ? routeRes : []);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load call log from localStorage (persists across sessions)
  useEffect(() => {
    const saved = localStorage.getItem(CALL_LOG_KEY);
    if (saved) {
      try { setCallLog(JSON.parse(saved)); } catch {}
    }
  }, []);

  const saveCallLog = useCallback((log) => {
    setCallLog(log);
    localStorage.setItem(CALL_LOG_KEY, JSON.stringify(log));
  }, []);

  // Build booking lookup
  const bookingByAkquise = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      if (b.akquise_airtable_id) map.set(b.akquise_airtable_id, b);
    }
    return map;
  }, [bookings]);

  // Predicates imported from src/metrics (isStorno, isAlreadyInstalled, isReadyForInstall)

  // QUEUE: Ready for installation, not yet invited, has phone number
  const callQueue = useMemo(() => {
    return acquisitionData.filter(a => {
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;
      if (!isReadyForInstall(a)) return false;
      if (!a.contactPhone) return false;
      if (bookingByAkquise.has(a.id)) return false;
      if (filterCityProp) {
        const cities = Array.isArray(a.city) ? a.city : (a.city ? [a.city] : []);
        if (!cities.includes(filterCityProp)) return false;
      }
      return true;
    });
  }, [acquisitionData, bookingByAkquise, filterCityProp]);

  // ALL ready standorte for the search/autocomplete (broader list: includes ones already booked or w/o phone)
  const readyStandorte = useMemo(() => {
    return acquisitionData.filter(a => {
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;
      if (!isReadyForInstall(a)) return false;
      return true;
    });
  }, [acquisitionData]);

  // NO RESPONSE: Invited >48h ago but not booked
  const noResponseQueue = useMemo(() => {
    const cutoff = Date.now() - OVERDUE_THRESHOLDS.PENDING_NO_RESPONSE_HOURS * 60 * 60 * 1000;
    return bookings.filter(b =>
      b.status === 'pending' &&
      b.whatsapp_sent_at &&
      new Date(b.whatsapp_sent_at).getTime() < cutoff &&
      b.contact_phone &&
      (!filterCityProp || (b.city || '') === filterCityProp)
    ).sort((a, b) => new Date(a.whatsapp_sent_at) - new Date(b.whatsapp_sent_at));
  }, [bookings, filterCityProp]);

  // FOLLOW-UP: Confirmation calls needed, no-shows to re-schedule
  const followUpQueue = useMemo(() => {
    const needsConfirmation = bookings.filter(b => {
      if (b.status !== 'booked' || !b.contact_phone) return false;
      if (!b.booked_date) return false;
      const installDate = new Date(b.booked_date + 'T00:00:00').getTime();
      const hoursUntil = (installDate - Date.now()) / (1000 * 60 * 60);
      return hoursUntil < OVERDUE_THRESHOLDS.CONFIRMATION_CALL_WITHIN_HOURS;
    });
    const noShows = bookings.filter(b => b.status === 'no_show' && b.contact_phone);
    const cancelled = bookings.filter(b => b.status === 'cancelled' && b.contact_phone);
    return [...needsConfirmation, ...noShows, ...cancelled]
      .sort((a, b) => {
        // Prioritize by urgency: no-shows first, then by date
        if (a.status === 'no_show' && b.status !== 'no_show') return -1;
        if (b.status === 'no_show' && a.status !== 'no_show') return 1;
        return (a.booked_date || '').localeCompare(b.booked_date || '');
      });
  }, [bookings]);

  // Today's call log
  const todayLog = useMemo(() => {
    const today = new Date().toDateString();
    return callLog.filter(l => new Date(l.timestamp).toDateString() === today);
  }, [callLog]);

  // Filter items based on search
  const filterItems = (items, isBooking) => {
    if (!search) return items;
    const s = search.toLowerCase();
    if (isBooking) {
      return items.filter(b =>
        (b.location_name || '').toLowerCase().includes(s) ||
        (b.contact_name || '').toLowerCase().includes(s) ||
        (b.city || '').toLowerCase().includes(s)
      );
    }
    return items.filter(a =>
      (a.locationName || '').toLowerCase().includes(s) ||
      (a.contactPerson || '').toLowerCase().includes(s) ||
      (a.city || []).some(c => c.toLowerCase().includes(s))
    );
  };

  // Handle call complete (now receives callDuration as 4th arg)
  const handleCallComplete = useCallback((item, outcome, notes, callDuration) => {
    const isBooking = activeItemType !== 'queue';
    const name = isBooking ? (item.location_name || item.contact_name) : (item.locationName || item.contactPerson);
    const city = isBooking ? item.city : (item.city || [])[0] || '';
    const phone = isBooking ? item.contact_phone : item.contactPhone;
    const jetId = isBooking ? item.jet_id : item.jetId;

    const logEntry = {
      id: Date.now(),
      name,
      city,
      phone: phone || '',
      jetId: jetId || '',
      standortId: isBooking ? item.akquise_airtable_id : item.id,
      outcome,
      notes,
      duration: callDuration || 0,
      time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString(),
    };

    const newLog = [logEntry, ...callLog];
    saveCallLog(newLog);

    const outcomeLabels = {
      booked: 'Termin vereinbart',
      reached: 'Erreicht',
      callback: 'Rueckruf',
      not_reached: 'Nicht erreicht',
      mailbox: 'Mailbox',
      no_interest: 'Kein Interesse',
      wrong_number: 'Falsche Nr.',
    };
    showToast(`${name}: ${outcomeLabels[outcome] || outcome}`);

    // Move to next item in the queue
    const currentQueue = activeTab === 'queue' ? callQueue : activeTab === 'noResponse' ? noResponseQueue : followUpQueue;
    const isBookingQueue = activeTab !== 'queue';
    const filteredQueue = filterItems(currentQueue, isBookingQueue);
    const currentIndex = filteredQueue.findIndex(i => i.id === item.id);
    const nextItem = filteredQueue[currentIndex + 1] || null;

    setActiveItem(nextItem);
    if (!nextItem) setActiveItemType(null);

    // Refresh data
    loadData();
  }, [activeItemType, callLog, saveCallLog, showToast, activeTab, callQueue, noResponseQueue, followUpQueue, search, loadData]);

  const handleSkip = useCallback((item) => {
    const currentQueue = activeTab === 'queue' ? callQueue : activeTab === 'noResponse' ? noResponseQueue : followUpQueue;
    const isBookingQueue = activeTab !== 'queue';
    const filteredQueue = filterItems(currentQueue, isBookingQueue);
    const currentIndex = filteredQueue.findIndex(i => i.id === item.id);
    const nextItem = filteredQueue[currentIndex + 1] || filteredQueue[0];
    if (nextItem && nextItem.id !== item.id) {
      setActiveItem(nextItem);
    }
  }, [activeTab, callQueue, noResponseQueue, followUpQueue, search]);

  // Tab counts
  const tabCounts = {
    queue: callQueue.length,
    noResponse: noResponseQueue.length,
    followup: followUpQueue.length,
    log: todayLog.length,
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 size={24} className="animate-spin text-purple-500" />
        <p className="text-sm">Telefon-Workbench wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PhoneCall className="text-purple-600" size={24} /> Telefon-Workbench
          </h2>
          <p className="text-gray-500 mt-1">Standorte anrufen, Termine buchen, Follow-ups durchfuehren.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Today's Stats */}
          <div className="flex items-center gap-4 px-4 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl">
            <div className="text-center">
              <div className="text-lg font-bold text-gray-900">{todayLog.length}</div>
              <div className="text-[10px] text-gray-400">Anrufe heute</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{todayLog.filter(l => l.outcome === 'booked').length}</div>
              <div className="text-[10px] text-gray-400">Termine</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-600">{todayLog.filter(l => l.outcome === 'reached' || l.outcome === 'booked').length}</div>
              <div className="text-[10px] text-gray-400">Erreicht</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{todayLog.filter(l => l.outcome === 'not_reached' || l.outcome === 'mailbox').length}</div>
              <div className="text-[10px] text-gray-400">Nicht err.</div>
            </div>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors"
          >
            <RefreshCw size={16} /> Aktualisieren
          </button>
        </div>
      </div>

      {/* Active Call Panel */}
      {activeItem && (
        <ActiveCallPanel
          item={activeItem}
          routes={routes}
          onComplete={handleCallComplete}
          onSkip={handleSkip}
          isBookingItem={activeItemType !== 'queue'}
          readyStandorte={readyStandorte}
          callLog={callLog}
        />
      )}

      {/* Queue Tabs + Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Queue Navigation */}
        <div className="lg:col-span-2">
          {/* Tab Navigation */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
            {[
              { id: 'queue', label: 'Anruf-Warteschlange', icon: List, count: tabCounts.queue },
              { id: 'noResponse', label: 'Keine Antwort', icon: PhoneMissed, count: tabCounts.noResponse },
              { id: 'followup', label: 'Follow-ups', icon: PhoneForwarded, count: tabCounts.followup },
              { id: 'log', label: 'Heute', icon: History, count: tabCounts.log },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === tab.id ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Warteschlange durchsuchen..."
              className="w-full pl-10 pr-4 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 text-sm transition-all"
            />
          </div>

          {/* Queue Content */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {activeTab === 'queue' && (
              <>
                {filterItems(callQueue, false).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
                      <CheckCircle size={28} className="text-green-400" />
                    </div>
                    <p className="font-medium text-gray-600">Warteschlange leer</p>
                    <p className="text-xs text-gray-400">Alle Standorte wurden bereits eingeladen.</p>
                  </div>
                ) : (
                  filterItems(callQueue, false).map((item, i) => (
                    <QueueItem
                      key={item.id}
                      item={item}
                      isActive={activeItem?.id === item.id}
                      onClick={() => { setActiveItem(item); setActiveItemType('queue'); }}
                      type="queue"
                      index={i}
                    />
                  ))
                )}
              </>
            )}

            {activeTab === 'noResponse' && (
              <>
                {filterItems(noResponseQueue, true).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
                      <CheckCircle size={28} className="text-green-400" />
                    </div>
                    <p className="font-medium text-gray-600">Alles aktuell</p>
                    <p className="text-xs text-gray-400">Keine ueberfaelligen Einladungen.</p>
                  </div>
                ) : (
                  filterItems(noResponseQueue, true).map((item, i) => (
                    <QueueItem
                      key={item.id}
                      item={item}
                      isActive={activeItem?.id === item.id}
                      onClick={() => { setActiveItem(item); setActiveItemType('noResponse'); }}
                      type="noResponse"
                      index={i}
                    />
                  ))
                )}
              </>
            )}

            {activeTab === 'followup' && (
              <>
                {filterItems(followUpQueue, true).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
                      <CheckCircle size={28} className="text-green-400" />
                    </div>
                    <p className="font-medium text-gray-600">Keine Follow-ups</p>
                    <p className="text-xs text-gray-400">Keine Buchungen benoetigen Bestaetigungsanrufe.</p>
                  </div>
                ) : (
                  filterItems(followUpQueue, true).map((item, i) => (
                    <QueueItem
                      key={item.id}
                      item={item}
                      isActive={activeItem?.id === item.id}
                      onClick={() => { setActiveItem(item); setActiveItemType('followup'); }}
                      type="followup"
                      index={i}
                    />
                  ))
                )}
              </>
            )}

            {activeTab === 'log' && (
              <>
                {todayLog.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <History size={28} className="text-gray-300" />
                    </div>
                    <p className="font-medium text-gray-600">Noch keine Anrufe heute</p>
                    <p className="text-xs text-gray-400">Waehle einen Standort aus der Warteschlange.</p>
                  </div>
                ) : (
                  todayLog.map(entry => (
                    <CallLogEntry key={entry.id} entry={entry} />
                  ))
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Quick Stats + Tips */}
        <div className="space-y-4">
          {/* Queue Overview Cards */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Warteschlangen</h4>
            <div className="space-y-3">
              <button
                onClick={() => setActiveTab('queue')}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  activeTab === 'queue' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Building size={14} className="text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">Neue Standorte</div>
                    <div className="text-[10px] text-gray-400">Bereit, noch nicht eingeladen</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-blue-600">{callQueue.length}</span>
              </button>

              <button
                onClick={() => setActiveTab('noResponse')}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  activeTab === 'noResponse' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <AlertTriangle size={14} className="text-amber-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">Keine Antwort</div>
                    <div className="text-[10px] text-gray-400">Eingeladen &gt;48h, keine Buchung</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-amber-600">{noResponseQueue.length}</span>
              </button>

              <button
                onClick={() => setActiveTab('followup')}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  activeTab === 'followup' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <PhoneForwarded size={14} className="text-red-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">Follow-ups</div>
                    <div className="text-[10px] text-gray-400">Bestaetigung, No-Shows, Stornos</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-red-600">{followUpQueue.length}</span>
              </button>
            </div>
          </div>

          {/* Quick Start */}
          {!activeItem && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-purple-900 mb-2">Bereit?</h4>
              <p className="text-xs text-purple-600 mb-4">
                Waehle einen Standort aus der Warteschlange oder starte direkt mit dem naechsten Anruf.
              </p>
              {callQueue.length > 0 && (
                <button
                  onClick={() => {
                    setActiveTab('queue');
                    setActiveItem(callQueue[0]);
                    setActiveItemType('queue');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium text-sm transition-colors"
                >
                  <PlayCircle size={16} /> Naechsten Standort anrufen
                </button>
              )}
              {callQueue.length === 0 && noResponseQueue.length > 0 && (
                <button
                  onClick={() => {
                    setActiveTab('noResponse');
                    setActiveItem(noResponseQueue[0]);
                    setActiveItemType('noResponse');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-medium text-sm transition-colors"
                >
                  <PhoneMissed size={16} /> Nicht-Antworten nachfassen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
