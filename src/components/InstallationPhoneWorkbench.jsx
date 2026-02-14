import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed, Clock, MapPin, User, Calendar,
  CheckCircle, XCircle, AlertCircle, Search, RefreshCw, Loader2, ChevronRight,
  Send, RotateCcw, ArrowRight, Inbox, Building, X, Check, Copy,
  PlayCircle, PauseCircle, SkipForward, MessageSquare, CalendarCheck,
  PhoneForwarded, History, AlertTriangle, Timer, List,
} from 'lucide-react';
import { fetchAllAcquisition } from '../utils/airtableService';

const API_BASE = '/api/install-booker/status';
const SCHEDULE_API = '/api/install-schedule';

/* ── Shared Helpers ── */
function formatDate(d) {
  if (!d) return '--';
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
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
  const mins = Math.floor(ms / (1000 * 60));
  if (mins > 0) return `vor ${mins}min`;
  return 'gerade eben';
}

/* ── Call Outcome Options ── */
const CALL_OUTCOMES = [
  { id: 'booked', label: 'Termin gebucht', icon: CalendarCheck, color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'callback', label: 'Rueckruf vereinbart', icon: PhoneForwarded, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'not_reached', label: 'Nicht erreicht', icon: PhoneMissed, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { id: 'declined', label: 'Abgelehnt', icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200' },
  { id: 'wrong_number', label: 'Falsche Nummer', icon: PhoneOff, color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

/* ── Active Call Panel ── */
function ActiveCallPanel({ item, routes, onComplete, onSkip, isBookingItem }) {
  const [outcome, setOutcome] = useState(null);
  const [bookingForm, setBookingForm] = useState({ city: '', bookedDate: '', bookedTime: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [callStarted, setCallStarted] = useState(null);
  const [copied, setCopied] = useState(false);

  // Reset when item changes
  useEffect(() => {
    setOutcome(null);
    setBookingForm({ city: item?.city || '', bookedDate: '', bookedTime: '', notes: '' });
    setCallStarted(Date.now());
  }, [item?.id]);

  if (!item) return null;

  const phone = isBookingItem ? item.contact_phone : item.contactPhone;
  const name = isBookingItem ? (item.contact_name || item.location_name) : (item.contactPerson || item.locationName);
  const locationName = isBookingItem ? item.location_name : item.locationName;
  const city = isBookingItem ? item.city : (item.city || [])[0] || '';
  const jetId = isBookingItem ? item.jet_id : item.jetId;

  const copyPhone = () => {
    if (phone) {
      navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Available dates for booking
  const availableDates = useMemo(() => {
    const c = bookingForm.city || city;
    if (!c) return [];
    return (routes || [])
      .filter(r => r.city === c && r.status === 'open')
      .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));
  }, [routes, bookingForm.city, city]);

  const availableTimes = useMemo(() => {
    if (!bookingForm.bookedDate) return [];
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
  }, [availableDates, bookingForm.bookedDate]);

  const availableCities = useMemo(() =>
    [...new Set((routes || []).map(r => r.city))].sort(),
  [routes]);

  const handleBookAndComplete = async () => {
    if (outcome !== 'booked' || !bookingForm.bookedDate || !bookingForm.bookedTime) return;
    setSubmitting(true);
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          akquiseAirtableId: isBookingItem ? item.akquise_airtable_id : item.id,
          locationName: locationName || '',
          city: bookingForm.city || city,
          contactName: name || '',
          contactPhone: phone || '',
          jetId: jetId || '',
          bookedDate: bookingForm.bookedDate,
          bookedTime: bookingForm.bookedTime,
          notes: bookingForm.notes || '',
          bookingSource: 'phone',
        }),
      });
      const data = await res.json();
      if (data.success) {
        onComplete(item, 'booked', bookingForm.notes);
      }
    } catch (e) {
      console.error('Booking failed:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOutcomeComplete = () => {
    if (!outcome || outcome === 'booked') return;
    onComplete(item, outcome, bookingForm.notes);
  };

  const callDuration = callStarted ? Math.floor((Date.now() - callStarted) / 1000) : 0;
  const callMinutes = Math.floor(callDuration / 60);
  const callSeconds = callDuration % 60;

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-purple-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header with call indicator */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4 border-b border-purple-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <PhoneCall size={20} className="text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">{locationName || 'Unbekannt'}</h3>
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <MapPin size={13} /> {city}
                {jetId && <span className="text-gray-300">|</span>}
                {jetId && <span className="font-mono text-xs">{jetId}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 rounded-lg">
              <Timer size={14} className="text-purple-600" />
              <span className="font-mono text-sm text-purple-700">{callMinutes}:{String(callSeconds).padStart(2, '0')}</span>
            </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Contact Info + Call Actions */}
          <div className="space-y-4">
            {/* Phone Number */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="text-xs text-gray-400 mb-1">Kontakt</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{name || '--'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-lg font-bold text-purple-700">{phone || '--'}</span>
                    {phone && (
                      <button onClick={copyPhone} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="Nummer kopieren">
                        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-400" />}
                      </button>
                    )}
                  </div>
                </div>
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium text-sm transition-colors"
                  >
                    <Phone size={16} /> Anrufen
                  </a>
                )}
              </div>
            </div>

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
              <label className="block text-xs font-medium text-gray-500 mb-1">Notizen</label>
              <textarea
                value={bookingForm.notes}
                onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="z.B. Inhaber war interessiert, nennt sich zurueck..."
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

          {/* Right: Quick Book Form (shown when outcome = booked) */}
          <div className={`space-y-4 transition-opacity ${outcome === 'booked' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <CalendarCheck size={16} className="text-green-600" /> Termin buchen
            </div>

            {/* City */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Stadt</label>
              <select
                value={bookingForm.city || city}
                onChange={e => setBookingForm(f => ({ ...f, city: e.target.value, bookedDate: '', bookedTime: '' }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 focus:border-green-400 transition-all"
              >
                <option value="">Stadt waehlen...</option>
                {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Datum</label>
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
            </div>

            {/* Time Slots */}
            {bookingForm.bookedDate && (
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
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${outcomeConfig.color.split(' ')[0]}`}>
        <Icon size={14} className={outcomeConfig.color.split(' ')[1]} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900 truncate">{entry.name}</div>
        <div className="text-xs text-gray-400">{entry.city} | {outcomeConfig.label}</div>
      </div>
      <span className="text-[10px] text-gray-400 font-mono">{entry.time}</span>
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationPhoneWorkbench() {
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
        fetch(API_BASE + '?').then(r => r.json()).catch(() => []),
        fetch(`${SCHEDULE_API}?from=${today}&status=open`).then(r => r.json()).catch(() => []),
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

  // Load call log from session storage
  useEffect(() => {
    const saved = sessionStorage.getItem('phoneCallLog');
    if (saved) {
      try { setCallLog(JSON.parse(saved)); } catch {}
    }
  }, []);

  const saveCallLog = useCallback((log) => {
    setCallLog(log);
    sessionStorage.setItem('phoneCallLog', JSON.stringify(log));
  }, []);

  // Build booking lookup
  const bookingByAkquise = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      if (b.akquise_airtable_id) map.set(b.akquise_airtable_id, b);
    }
    return map;
  }, [bookings]);

  // Helper functions (same as InviteManager)
  const isReadyForInstall = (a) => {
    if (a.readyForInstallation === true || a.readyForInstallation === 'checked' || a.readyForInstallation === 'true') return true;
    const ls = (a.leadStatus || '').toLowerCase();
    const as = (a.approvalStatus || '').toLowerCase();
    if ((ls === 'won / signed' || ls === 'won/signed') && as === 'accepted') return true;
    if (ls.includes('ready') || ls.includes('installation')) return true;
    return false;
  };

  const isStorno = (a) => {
    if (a.akquiseStorno === true || a.akquiseStorno === 'true') return true;
    if (a.postInstallStorno === true || a.postInstallStorno === 'true') return true;
    const ls = (a.leadStatus || '').toLowerCase();
    return ls.includes('storno') || ls.includes('cancelled') || ls.includes('lost');
  };

  const isAlreadyInstalled = (a) => {
    const statuses = Array.isArray(a.installationsStatus) ? a.installationsStatus : [];
    if (statuses.some(s => (s || '').toLowerCase().includes('installiert') || (s || '').toLowerCase().includes('live'))) return true;
    return (a.leadStatus || '').toLowerCase() === 'live';
  };

  // QUEUE: Ready for installation, not yet invited, has phone number
  const callQueue = useMemo(() => {
    return acquisitionData.filter(a => {
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;
      if (!isReadyForInstall(a)) return false;
      if (!a.contactPhone) return false;
      if (bookingByAkquise.has(a.id)) return false;
      return true;
    });
  }, [acquisitionData, bookingByAkquise]);

  // NO RESPONSE: Invited >48h ago but not booked
  const noResponseQueue = useMemo(() => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return bookings.filter(b =>
      b.status === 'pending' &&
      b.whatsapp_sent_at &&
      new Date(b.whatsapp_sent_at).getTime() < cutoff &&
      b.contact_phone
    ).sort((a, b) => new Date(a.whatsapp_sent_at) - new Date(b.whatsapp_sent_at));
  }, [bookings]);

  // FOLLOW-UP: Confirmation calls needed, no-shows to re-schedule
  const followUpQueue = useMemo(() => {
    const needsConfirmation = bookings.filter(b => {
      if (b.status !== 'booked' || !b.contact_phone) return false;
      if (!b.booked_date) return false;
      const installDate = new Date(b.booked_date + 'T00:00:00').getTime();
      const hoursUntil = (installDate - Date.now()) / (1000 * 60 * 60);
      return hoursUntil < 72; // Within 3 days - needs confirmation call
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

  // Handle call complete
  const handleCallComplete = useCallback((item, outcome, notes) => {
    const isBooking = activeItemType !== 'queue';
    const name = isBooking ? (item.location_name || item.contact_name) : (item.locationName || item.contactPerson);
    const city = isBooking ? item.city : (item.city || [])[0] || '';

    const logEntry = {
      id: Date.now(),
      name,
      city,
      outcome,
      notes,
      time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString(),
    };

    const newLog = [logEntry, ...callLog];
    saveCallLog(newLog);

    const outcomeLabels = { booked: 'Termin gebucht', callback: 'Rueckruf', not_reached: 'Nicht erreicht', declined: 'Abgelehnt', wrong_number: 'Falsche Nr.' };
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
              <div className="text-[10px] text-gray-400">Gebucht</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{todayLog.filter(l => l.outcome === 'callback').length}</div>
              <div className="text-[10px] text-gray-400">Rueckruf</div>
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
