import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Send, Search, Filter, MapPin, Phone, User, CheckCircle, Clock, AlertCircle,
  ChevronDown, ChevronUp, RefreshCw, Users, Eye, Image, Building, Wrench,
  CalendarCheck, ExternalLink, X, Check, Info,
} from 'lucide-react';
import { fetchAllAcquisition } from '../utils/airtableService';

const MOUNT_TYPES = [
  { value: '', label: 'Alle Montagearten' },
  { value: 'Bodenmontage', label: 'Bodenmontage' },
  { value: 'Wandmontage', label: 'Wandmontage' },
  { value: 'Deckenmontage', label: 'Deckenmontage' },
];

const STATUS_BADGES = {
  not_invited: { label: 'Nicht eingeladen', color: 'bg-gray-100 text-gray-600', icon: Clock },
  invited: { label: 'Eingeladen', color: 'bg-yellow-100 text-yellow-700', icon: Send },
  booked: { label: 'Gebucht', color: 'bg-blue-100 text-blue-700', icon: CalendarCheck },
  confirmed: { label: 'Bestätigt', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  completed: { label: 'Abgeschlossen', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  cancelled: { label: 'Storniert', color: 'bg-red-100 text-red-700', icon: X },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGES[status] || STATUS_BADGES.not_invited;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={11} /> {cfg.label}
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

// ── Detail Drawer ──
function StandortDetail({ standort, bookingInfo, onClose, onInvite, inviting }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{standort.locationName || 'Unbekannt'}</h3>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin size={13} /> {standort.city?.[0] || '—'} · {standort.postalCode || ''} {standort.street} {standort.streetNumber}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
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
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <User size={14} /> Kontakt
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-gray-400 text-xs">Name</div>
                <div className="text-gray-900">{standort.contactPerson || '—'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Telefon</div>
                <div className="text-gray-900">{standort.contactPhone || '—'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">E-Mail</div>
                <div className="text-gray-900 truncate">{standort.contactEmail || '—'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">JET ID</div>
                <div className="text-gray-900 font-mono">{standort.jetId || '—'}</div>
              </div>
            </div>
          </div>

          {/* Installation Details */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Wrench size={14} /> Installation
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-gray-400 text-xs">Montage-Art</div>
                <div className="text-gray-900">{standort.mountType || 'Nicht angegeben'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Schaufenster</div>
                <div className="text-gray-900">{standort.schaufenster || '—'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Vertrag</div>
                <div className="text-gray-900">{standort.vertragVorhanden || '—'}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Akquise-Partner</div>
                <div className="text-gray-900">{standort.acquisitionPartner || '—'}</div>
              </div>
            </div>
            {standort.hindernisse && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
                  <AlertCircle size={12} /> Hindernisse / Hinweise
                </div>
                <div className="text-xs text-amber-600 mt-0.5">{standort.hindernisse}</div>
              </div>
            )}
          </div>

          {/* Booking Info (if invited/booked) */}
          {bookingInfo && (
            <div className="bg-blue-50 rounded-xl p-4 space-y-2">
              <h4 className="text-sm font-medium text-blue-700 flex items-center gap-1.5">
                <CalendarCheck size={14} /> Buchung
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {bookingInfo.booked_date && (
                  <div>
                    <div className="text-blue-400 text-xs">Termin</div>
                    <div className="text-blue-900 font-medium">{formatDate(bookingInfo.booked_date)}</div>
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
                  <a
                    href={`/book/${bookingInfo.booking_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink size={11} /> Buchungsseite öffnen
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
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium"
              >
                <Send size={16} />
                {inviting ? 'Wird gesendet...' : 'Einladung senden'}
              </button>
            )}
            {!standort.contactPhone && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2.5 rounded-lg w-full">
                <AlertCircle size={16} />
                Keine Telefonnummer hinterlegt — Einladung nicht möglich
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Batch Invite Confirm Modal ──
function BatchInviteModal({ selectedStandorte, onConfirm, onCancel, inviting }) {
  const withPhone = selectedStandorte.filter(s => s.contactPhone);
  const withoutPhone = selectedStandorte.filter(s => !s.contactPhone);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Einladungen senden</h3>
          <p className="text-sm text-gray-500 mt-1">
            {withPhone.length} von {selectedStandorte.length} Standorte können eingeladen werden.
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

        <div className="flex gap-3 p-5 border-t">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Abbrechen
          </button>
          <button
            onClick={() => onConfirm(withPhone)}
            disabled={inviting || withPhone.length === 0}
            className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium"
          >
            {inviting ? 'Sende...' : `${withPhone.length} Einladung${withPhone.length !== 1 ? 'en' : ''} senden`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
export default function InstallationInviteManager() {
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

  // Load acquisition data + existing bookings
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Map bookings by akquise_airtable_id for quick lookup
  const bookingByAkquise = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      if (b.akquise_airtable_id) {
        map.set(b.akquise_airtable_id, b);
      }
    }
    return map;
  }, [bookings]);

  // Helper: is this record actually ready for installation?
  const isReadyForInstall = (a) => {
    // Explicit flag
    if (a.readyForInstallation === true || a.readyForInstallation === 'true') return true;
    // Or lead status indicates readiness
    const ls = (a.leadStatus || '').toLowerCase();
    if (ls.includes('ready') || ls.includes('installation')) return true;
    return false;
  };

  // Helper: is this record cancelled/storno?
  const isStorno = (a) => {
    if (a.akquiseStorno === true || a.akquiseStorno === 'true') return true;
    if (a.postInstallStorno === true || a.postInstallStorno === 'true') return true;
    const ls = (a.leadStatus || '').toLowerCase();
    if (ls.includes('storno') || ls.includes('cancelled') || ls.includes('lost')) return true;
    return false;
  };

  // Helper: is this already live/installed?
  const isAlreadyInstalled = (a) => {
    const statuses = Array.isArray(a.installationsStatus) ? a.installationsStatus : [];
    if (statuses.some(s => (s || '').toLowerCase().includes('installiert') || (s || '').toLowerCase().includes('live'))) return true;
    const ls = (a.leadStatus || '').toLowerCase();
    if (ls === 'live') return true;
    return false;
  };

  // Filter to relevant records
  const readyStandorte = useMemo(() => {
    return acquisitionData.filter(a => {
      // Always exclude stornos and already-installed
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;

      const booking = bookingByAkquise.get(a.id);
      const ready = isReadyForInstall(a);
      const hasBooking = !!booking;

      if (filterStatus === 'ready') {
        return ready && !hasBooking;
      } else if (filterStatus === 'invited') {
        return hasBooking;
      }
      // 'all' — show ready + with bookings
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

    if (filterCity) {
      list = list.filter(s => (s.city || []).includes(filterCity));
    }

    if (filterMountType) {
      list = list.filter(s => (s.mountType || '').toLowerCase().includes(filterMountType.toLowerCase()));
    }

    if (filterContract === 'yes') {
      list = list.filter(s => s.vertragVorhanden === 'true' || s.vertragVorhanden === true);
    } else if (filterContract === 'no') {
      list = list.filter(s => !s.vertragVorhanden || s.vertragVorhanden === 'false' || s.vertragVorhanden === false);
    }

    return list;
  }, [readyStandorte, search, filterCity, filterMountType, filterContract]);

  // Unique cities
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

  // Send invite
  const sendInvites = async (standorte) => {
    setInviting(true);
    setInviteResult(null);
    let successCount = 0;
    let failCount = 0;

    for (const s of standorte) {
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
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setInviting(false);
    setShowBatchModal(false);
    setSelected(new Set());
    setInviteResult({ success: successCount, failed: failCount });
    setTimeout(() => setInviteResult(null), 5000);
    loadData(); // Refresh
  };

  const selectedStandorte = filtered.filter(s => selected.has(s.id));

  return (
    <div className="space-y-6">
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
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
            >
              <Send size={16} />
              {selected.size} einladen
            </button>
          )}
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Aktualisieren
          </button>
        </div>
      </div>

      {/* Success/Error banner */}
      {inviteResult && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
          inviteResult.failed === 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {inviteResult.failed === 0 ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {inviteResult.success} Einladung{inviteResult.success !== 1 ? 'en' : ''} gesendet
          {inviteResult.failed > 0 && ` · ${inviteResult.failed} fehlgeschlagen`}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Bereit', value: kpis.ready, color: 'text-blue-600', onClick: () => setFilterStatus('ready') },
          { label: 'Eingeladen', value: kpis.invited, color: 'text-yellow-600', onClick: () => setFilterStatus('invited') },
          { label: 'Gebucht', value: kpis.booked, color: 'text-indigo-600', onClick: () => setFilterStatus('invited') },
          { label: 'Bestätigt', value: kpis.confirmed, color: 'text-green-600', onClick: () => setFilterStatus('invited') },
          { label: 'Ohne Telefon', value: kpis.noPhone, color: 'text-red-600', onClick: () => {} },
        ].map(k => (
          <button
            key={k.label}
            onClick={k.onClick}
            className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-gray-300 transition-colors"
          >
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { id: 'ready', label: 'Bereit' },
            { id: 'invited', label: 'Eingeladen' },
            { id: 'all', label: 'Alle' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setFilterStatus(tab.id); setSelected(new Set()); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterStatus === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
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
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-400 text-sm"
          />
        </div>

        {/* City filter */}
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        >
          <option value="">Alle Städte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Mount type filter */}
        <select
          value={filterMountType}
          onChange={(e) => setFilterMountType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        >
          {MOUNT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Contract filter */}
        <select
          value={filterContract}
          onChange={(e) => setFilterContract(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        >
          <option value="">Alle Verträge</option>
          <option value="yes">Mit Vertrag</option>
          <option value="no">Ohne Vertrag</option>
        </select>
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-400 font-mono">
        {filtered.length} Standorte gefunden
        {selected.size > 0 && ` · ${selected.size} ausgewählt`}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <RefreshCw size={20} className="animate-spin mr-2" /> Lade Standorte...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Building size={32} className="mb-2" />
            <p>Keine Standorte gefunden.</p>
            {filterStatus === 'ready' && (
              <p className="text-xs mt-1">Versuche "Alle" um alle Standorte zu sehen.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Standort</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Stadt</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Kontakt</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Montage</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vertrag</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Lead-Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(s => {
                  const booking = bookingByAkquise.get(s.id);
                  const bookStatus = booking?.status || 'not_invited';
                  const hasPhone = !!s.contactPhone;
                  const isSelected = selected.has(s.id);

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-orange-50/50' : ''}`}
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
                        <div className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{s.locationName || '—'}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {s.street} {s.streetNumber}{s.postalCode ? `, ${s.postalCode}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <MapPin size={13} className="text-gray-400" />
                          {(s.city || []).join(', ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{s.contactPerson || '—'}</div>
                        {s.contactPhone ? (
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <Phone size={10} /> {s.contactPhone}
                          </div>
                        ) : (
                          <div className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle size={10} /> Keine Nummer
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {s.mountType || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {(s.vertragVorhanden === 'true' || s.vertragVorhanden === true) ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium">
                            <CheckCircle size={10} /> Ja
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Nein</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600 truncate max-w-[100px] block">{s.leadStatus || '—'}</span>
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
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 disabled:opacity-50"
                          >
                            <Send size={12} /> Einladen
                          </button>
                        )}
                        {bookStatus !== 'not_invited' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailStandort(s); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"
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
        />
      )}
    </div>
  );
}
