import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Send, Search, Filter, MapPin, Phone, User, CheckCircle, Clock, AlertCircle,
  ChevronDown, ChevronUp, RefreshCw, Users, Eye, Image, Building, Wrench,
  CalendarCheck, ExternalLink, X, Check, Info, Loader2, Inbox, ChevronRight,
  CheckSquare, Square, AlertTriangle, ArrowRight, History,
} from 'lucide-react';
import { fetchAllAcquisition } from '../utils/airtableService';

const MOUNT_TYPES = [
  { value: '', label: 'Alle Montagearten' },
  { value: 'Bodenmontage', label: 'Bodenmontage' },
  { value: 'Wandmontage', label: 'Wandmontage' },
  { value: 'Deckenmontage', label: 'Deckenmontage' },
];

const STATUS_BADGES = {
  not_invited: { label: 'Nicht eingeladen', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock },
  invited:     { label: 'Eingeladen',       color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Send },
  pending:     { label: 'Eingeladen',       color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Send },
  booked:      { label: 'Gebucht',          color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CalendarCheck },
  confirmed:   { label: 'Bestaetigt',       color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  completed:   { label: 'Abgeschlossen',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled:   { label: 'Storniert',        color: 'bg-red-100 text-red-700 border-red-200', icon: X },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGES[status] || STATUS_BADGES.not_invited;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '--';
  return new Date(d).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ── Detail Drawer ── */
function StandortDetail({ standort, bookingInfo, onClose, onInvite, inviting }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-xl border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-lg truncate">{standort.locationName || 'Unbekannt'}</h3>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin size={13} /> {standort.city?.[0] || '--'} | {standort.postalCode || ''} {standort.street} {standort.streetNumber}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status */}
          <div className="flex items-center gap-3">
            <StatusBadge status={bookingInfo?.status || 'not_invited'} />
            {bookingInfo?.whatsapp_sent_at && (
              <span className="text-xs text-gray-400">
                WhatsApp: {formatDateTime(bookingInfo.whatsapp_sent_at)}
              </span>
            )}
          </div>

          {/* Contact */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <User size={14} /> Kontakt
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-400 text-xs">Name</div>
                <div className="text-gray-900 font-medium">{standort.contactPerson || '--'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Telefon</div>
                <div className="text-gray-900 font-mono text-sm">{standort.contactPhone || '--'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">E-Mail</div>
                <div className="text-gray-900 truncate text-sm">{standort.contactEmail || '--'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">JET ID</div>
                <div className="text-gray-900 font-mono text-sm">{standort.jetId || '--'}</div>
              </div>
            </div>
          </div>

          {/* Installation Details */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Wrench size={14} /> Installation
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-400 text-xs">Montage-Art</div>
                <div className="text-gray-900">{standort.mountType || 'Nicht angegeben'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Schaufenster</div>
                <div className="text-gray-900">{standort.schaufenster || '--'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Vertrag</div>
                <div className="text-gray-900">{standort.vertragVorhanden || '--'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Akquise-Partner</div>
                <div className="text-gray-900">{standort.acquisitionPartner || '--'}</div>
              </div>
            </div>
            {standort.hindernisse && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
                  <AlertCircle size={12} /> Hindernisse / Hinweise
                </div>
                <div className="text-xs text-amber-600 mt-0.5">{standort.hindernisse}</div>
              </div>
            )}
          </div>

          {/* Booking Info */}
          {bookingInfo && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 space-y-2 border border-blue-100">
              <h4 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                <CalendarCheck size={14} /> Buchung
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {bookingInfo.booked_date && (
                  <div>
                    <div className="text-blue-400 text-xs">Termin</div>
                    <div className="text-blue-900 font-semibold">{formatDate(bookingInfo.booked_date)}</div>
                  </div>
                )}
                {bookingInfo.booked_time && (
                  <div>
                    <div className="text-blue-400 text-xs">Uhrzeit</div>
                    <div className="text-blue-900">{bookingInfo.booked_time} - {bookingInfo.booked_end_time}</div>
                  </div>
                )}
                {bookingInfo.whatsapp_sent_at && (
                  <div>
                    <div className="text-blue-400 text-xs">WhatsApp gesendet</div>
                    <div className="text-blue-900">{formatDateTime(bookingInfo.whatsapp_sent_at)}</div>
                  </div>
                )}
                {bookingInfo.booked_at && (
                  <div>
                    <div className="text-blue-400 text-xs">Gebucht am</div>
                    <div className="text-blue-900">{formatDateTime(bookingInfo.booked_at)}</div>
                  </div>
                )}
              </div>
              {bookingInfo.booking_token && (
                <div className="mt-2">
                  <a href={`/book/${bookingInfo.booking_token}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <ExternalLink size={11} /> Buchungsseite oeffnen
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex gap-3">
            {(!bookingInfo || bookingInfo.status === 'not_invited') && standort.contactPhone && (
              <button
                onClick={() => onInvite([standort])}
                disabled={inviting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 font-medium transition-colors"
              >
                {inviting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {inviting ? 'Wird gesendet...' : 'Einladung senden'}
              </button>
            )}
            {!standort.contactPhone && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2.5 rounded-xl w-full border border-amber-200">
                <AlertCircle size={16} />
                Keine Telefonnummer hinterlegt
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Batch Invite Confirm Modal with Progress ── */
function BatchInviteModal({ selectedStandorte, onConfirm, onCancel, inviting, progress }) {
  const withPhone = selectedStandorte.filter(s => s.contactPhone);
  const withoutPhone = selectedStandorte.filter(s => !s.contactPhone);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Einladungen senden</h3>
          <p className="text-sm text-gray-500 mt-1">
            {withPhone.length} von {selectedStandorte.length} Standorte koennen eingeladen werden.
          </p>
        </div>

        <div className="p-5 space-y-3 max-h-60 overflow-y-auto">
          {withPhone.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <Check size={14} className="text-green-500 shrink-0" />
              <span className="text-gray-900 font-medium truncate">{s.locationName}</span>
              <span className="text-gray-400 text-xs ml-auto">{s.city?.[0]}</span>
            </div>
          ))}
          {withoutPhone.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <AlertCircle size={14} className="text-amber-500 shrink-0" />
              <span className="text-gray-400 truncate">{s.locationName}</span>
              <span className="text-xs text-amber-500 ml-auto">Keine Tel.</span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        {inviting && progress && (
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Sende Einladungen...</span>
              <span className="font-mono">{progress.sent}/{progress.total}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.failed > 0 && (
              <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle size={10} /> {progress.failed} fehlgeschlagen
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onCancel} disabled={inviting}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Abbrechen
          </button>
          <button
            onClick={() => onConfirm(withPhone)}
            disabled={inviting || withPhone.length === 0}
            className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {inviting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {inviting ? `${progress?.sent || 0}/${progress?.total || 0}` : `${withPhone.length} einladen`}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationInviteManager({ onNavigateToDetail }) {
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterMountType, setFilterMountType] = useState('');
  const [filterContract, setFilterContract] = useState('');
  const [filterStatus, setFilterStatus] = useState('ready'); // 'ready', 'invited', 'all'
  const [selected, setSelected] = useState(new Set());
  const [detailStandort, setDetailStandort] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteProgress, setInviteProgress] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [acqData, bookRes] = await Promise.all([
        fetchAllAcquisition(),
        fetch('/api/install-booker/status?').then(r => r.json()).catch(() => []),
      ]);
      setAcquisitionData(acqData || []);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
    } catch (e) {
      console.error('Failed to load data:', e);
      showToast('Daten konnten nicht geladen werden.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Booking lookup
  const bookingByAkquise = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      if (b.akquise_airtable_id) map.set(b.akquise_airtable_id, b);
    }
    return map;
  }, [bookings]);

  // Helpers
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

  // Filter records
  const readyStandorte = useMemo(() => {
    return acquisitionData.filter(a => {
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;
      const booking = bookingByAkquise.get(a.id);
      const ready = isReadyForInstall(a);
      const hasBooking = !!booking;
      if (filterStatus === 'ready') return ready && !hasBooking;
      if (filterStatus === 'invited') return hasBooking;
      return ready || hasBooking;
    });
  }, [acquisitionData, bookingByAkquise, filterStatus]);

  // Apply search + filters
  const filtered = useMemo(() => {
    let list = readyStandorte;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.locationName || '').toLowerCase().includes(q) ||
        (s.contactPerson || '').toLowerCase().includes(q) ||
        (s.jetId || '').toLowerCase().includes(q) ||
        (s.postalCode || '').includes(q) ||
        (s.street || '').toLowerCase().includes(q) ||
        (s.city || []).some(c => c.toLowerCase().includes(q))
      );
    }
    if (filterCity) list = list.filter(s => (s.city || []).includes(filterCity));
    if (filterMountType) list = list.filter(s => (s.mountType || '').toLowerCase().includes(filterMountType.toLowerCase()));
    if (filterContract === 'yes') list = list.filter(s => s.vertragVorhanden === 'true' || s.vertragVorhanden === true);
    else if (filterContract === 'no') list = list.filter(s => !s.vertragVorhanden || s.vertragVorhanden === 'false' || s.vertragVorhanden === false);
    return list;
  }, [readyStandorte, search, filterCity, filterMountType, filterContract]);

  // Cities
  const cities = useMemo(() => {
    const set = new Set();
    readyStandorte.forEach(s => (s.city || []).forEach(c => set.add(c)));
    return [...set].sort();
  }, [readyStandorte]);

  // KPIs
  const kpis = useMemo(() => {
    const eligible = acquisitionData.filter(a => !isStorno(a) && !isAlreadyInstalled(a));
    const ready = eligible.filter(a => isReadyForInstall(a) && !bookingByAkquise.has(a.id));
    const invited = bookings.filter(b => b.status === 'pending');
    const booked = bookings.filter(b => b.status === 'booked');
    const confirmed = bookings.filter(b => b.status === 'confirmed');
    const withoutPhone = ready.filter(a => !a.contactPhone);
    return { ready: ready.length, invited: invited.length, booked: booked.length, confirmed: confirmed.length, noPhone: withoutPhone.length };
  }, [acquisitionData, bookings, bookingByAkquise]);

  // Recently sent invites
  const recentInvites = useMemo(() => {
    return bookings
      .filter(b => b.whatsapp_sent_at)
      .sort((a, b) => new Date(b.whatsapp_sent_at) - new Date(a.whatsapp_sent_at))
      .slice(0, 10);
  }, [bookings]);

  // Selection
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.id)));
    }
  };

  // Select all in a city
  const selectAllInCity = (city) => {
    const cityItems = filtered.filter(s => (s.city || []).includes(city)).map(s => s.id);
    setSelected(prev => {
      const next = new Set(prev);
      cityItems.forEach(id => next.add(id));
      return next;
    });
  };

  // Send invites with progress
  const sendInvites = async (standorte) => {
    setInviting(true);
    setInviteResult(null);
    setInviteProgress({ sent: 0, total: standorte.length, failed: 0, failedItems: [] });

    let successCount = 0;
    let failCount = 0;
    const failedItems = [];

    for (let i = 0; i < standorte.length; i++) {
      const s = standorte[i];
      try {
        const res = await fetch('/api/install-booker/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            akquiseAirtableId: s.id,
            contactPhone: s.contactPhone,
            contactName: s.contactPerson || '',
            locationName: s.locationName || '',
            city: (s.city || [])[0] || '',
            jetId: s.jetId || '',
          }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
          failedItems.push(s.locationName || s.id);
        }
      } catch {
        failCount++;
        failedItems.push(s.locationName || s.id);
      }
      setInviteProgress({ sent: i + 1, total: standorte.length, failed: failCount, failedItems });
    }

    setInviting(false);
    setShowBatchModal(false);
    setSelected(new Set());
    setInviteResult({ success: successCount, failed: failCount, failedItems });
    setInviteProgress(null);

    if (failCount === 0) {
      showToast(`${successCount} Einladung${successCount !== 1 ? 'en' : ''} erfolgreich gesendet.`);
    } else {
      showToast(`${successCount} gesendet, ${failCount} fehlgeschlagen.`, 'error');
    }

    loadData();
  };

  const selectedStandorte = filtered.filter(s => selected.has(s.id));

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
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
          <h2 className="text-2xl font-bold text-gray-900">Standorte einladen</h2>
          <p className="text-gray-500 mt-1">Installationsbereite Standorte per WhatsApp zur Terminbuchung einladen.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-medium shadow-sm transition-colors"
            >
              <Send size={16} />
              {selected.size} einladen
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Invite Result Banner */}
      {inviteResult && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border animate-fade-in ${
          inviteResult.failed === 0
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          <div className="shrink-0 mt-0.5">
            {inviteResult.failed === 0 ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          </div>
          <div>
            <div className="font-medium">
              {inviteResult.success} Einladung{inviteResult.success !== 1 ? 'en' : ''} gesendet
              {inviteResult.failed > 0 && ` | ${inviteResult.failed} fehlgeschlagen`}
            </div>
            {inviteResult.failedItems?.length > 0 && (
              <div className="text-xs mt-1 opacity-80">
                Fehlgeschlagen: {inviteResult.failedItems.join(', ')}
              </div>
            )}
          </div>
          <button onClick={() => setInviteResult(null)} className="ml-auto shrink-0 p-0.5 hover:bg-black/5 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Bereit', value: kpis.ready, color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Building, onClick: () => setFilterStatus('ready') },
          { label: 'Eingeladen', value: kpis.invited, color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Send, onClick: () => setFilterStatus('invited') },
          { label: 'Gebucht', value: kpis.booked, color: 'text-indigo-600', bgColor: 'bg-indigo-100', icon: CalendarCheck, onClick: () => setFilterStatus('invited') },
          { label: 'Bestaetigt', value: kpis.confirmed, color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle, onClick: () => setFilterStatus('invited') },
          { label: 'Ohne Telefon', value: kpis.noPhone, color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertTriangle, onClick: () => {} },
        ].map(k => {
          const Icon = k.icon;
          return (
            <button
              key={k.label}
              onClick={k.onClick}
              className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 text-left hover:bg-white/80 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.bgColor}`}>
                  <Icon size={16} className={k.color} />
                </div>
              </div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-gray-500 font-medium">{k.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { id: 'ready', label: 'Bereit', count: kpis.ready },
            { id: 'invited', label: 'Eingeladen', count: kpis.invited + kpis.booked + kpis.confirmed },
            { id: 'all', label: 'Alle' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setFilterStatus(tab.id); setSelected(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="ml-1 opacity-60">({tab.count})</span>}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Stadt, PLZ, JET-ID..."
            className="w-full pl-10 pr-4 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 text-sm transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* City filter with "select all" */}
        <div className="flex items-center gap-1">
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
          >
            <option value="">Alle Staedte</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {filterCity && filterStatus === 'ready' && (
            <button
              onClick={() => selectAllInCity(filterCity)}
              className="px-2.5 py-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors whitespace-nowrap"
              title={`Alle in ${filterCity} auswaehlen`}
            >
              <CheckSquare size={14} />
            </button>
          )}
        </div>

        {/* Mount type filter */}
        <select
          value={filterMountType}
          onChange={(e) => setFilterMountType(e.target.value)}
          className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        >
          {MOUNT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Contract filter */}
        <select
          value={filterContract}
          onChange={(e) => setFilterContract(e.target.value)}
          className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        >
          <option value="">Alle Vertraege</option>
          <option value="yes">Mit Vertrag</option>
          <option value="no">Ohne Vertrag</option>
        </select>
      </div>

      {/* Results count + Selection actions */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400 font-mono">
          {filtered.length} Standorte gefunden
          {selected.size > 0 && ` | ${selected.size} ausgewaehlt`}
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X size={12} /> Auswahl aufheben
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <Loader2 size={24} className="animate-spin text-orange-500" />
            <p className="text-sm">Standorte werden geladen...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Inbox size={32} className="text-gray-300" />
            </div>
            <div className="text-center">
              <p className="font-medium text-gray-600">Keine Standorte gefunden</p>
              <p className="text-xs text-gray-400 mt-1">
                {filterStatus === 'ready' ? 'Alle Standorte wurden bereits eingeladen.' : 'Versuche andere Filter.'}
              </p>
            </div>
            {filterStatus === 'ready' && (
              <button
                onClick={() => setFilterStatus('all')}
                className="px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
              >
                Alle Standorte anzeigen
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Standort</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stadt</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakt</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Montage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vertrag</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(s => {
                  const booking = bookingByAkquise.get(s.id);
                  const bookStatus = booking?.status || 'not_invited';
                  const hasPhone = !!s.contactPhone;
                  const isSelected = selected.has(s.id);

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-white/80 cursor-pointer transition-colors ${isSelected ? 'bg-orange-50/50' : ''}`}
                      onClick={() => setDetailStandort(s)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(s.id)}
                          className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateToDetail?.(s.id, s.locationName); }}
                          className="text-left group"
                        >
                          <div className="font-medium text-gray-900 text-sm truncate max-w-[200px] group-hover:text-orange-600 transition-colors">{s.locationName || '--'}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {s.street} {s.streetNumber}{s.postalCode ? `, ${s.postalCode}` : ''}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <MapPin size={13} className="text-gray-400 shrink-0" />
                          {(s.city || []).join(', ') || '--'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{s.contactPerson || '--'}</div>
                        {s.contactPhone ? (
                          <div className="text-xs text-gray-400 flex items-center gap-1 font-mono">
                            <Phone size={10} /> {s.contactPhone}
                          </div>
                        ) : (
                          <div className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle size={10} /> Keine Nummer
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {s.mountType || '--'}
                      </td>
                      <td className="px-4 py-3">
                        {(s.vertragVorhanden === 'true' || s.vertragVorhanden === true) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium">
                            <CheckCircle size={10} /> Ja
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Nein</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={bookStatus} />
                        {booking?.whatsapp_sent_at && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {formatDateTime(booking.whatsapp_sent_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {bookStatus === 'not_invited' && hasPhone && (
                          <button
                            onClick={(e) => { e.stopPropagation(); sendInvites([s]); }}
                            disabled={inviting}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
                          >
                            {inviting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Einladen
                          </button>
                        )}
                        {bookStatus !== 'not_invited' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailStandort(s); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <Eye size={12} /> Details
                          </button>
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

      {/* Recent Invites Section */}
      {recentInvites.length > 0 && filterStatus !== 'ready' && (
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <History size={16} className="text-gray-400" /> Letzte Einladungen
          </h3>
          <div className="space-y-2">
            {recentInvites.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  b.status === 'booked' || b.status === 'confirmed' ? 'bg-green-500' :
                  b.status === 'pending' ? 'bg-yellow-500' :
                  b.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-400'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                  <div className="text-xs text-gray-400">{b.city} | {b.contact_name}</div>
                </div>
                <StatusBadge status={b.status} />
                <span className="text-[10px] text-gray-400 font-mono shrink-0">
                  {formatDateTime(b.whatsapp_sent_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {detailStandort && (
        <StandortDetail
          standort={detailStandort}
          bookingInfo={bookingByAkquise.get(detailStandort.id)}
          onClose={() => setDetailStandort(null)}
          onInvite={sendInvites}
          inviting={inviting}
        />
      )}

      {/* Batch Invite Modal */}
      {showBatchModal && (
        <BatchInviteModal
          selectedStandorte={selectedStandorte}
          onConfirm={sendInvites}
          onCancel={() => setShowBatchModal(false)}
          inviting={inviting}
          progress={inviteProgress}
        />
      )}
    </div>
  );
}
