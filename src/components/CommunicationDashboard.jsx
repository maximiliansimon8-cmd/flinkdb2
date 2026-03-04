import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  Clock,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  Inbox,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  X,
  Send,
  MapPin,
  Building2,
  Save,
} from 'lucide-react';
import {
  fetchAllCommunications,
  createCommunicationRecord,
  fetchAllStammdaten,
} from '../utils/airtableService';

/* ──────────────────────── KPI Card ──────────────────────── */

function KPICard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-text-muted text-xs font-medium">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="font-mono font-bold text-2xl" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/* ──────────────────────── Channel Badge ──────────────────────── */

function ChannelBadge({ channel }) {
  const config = {
    WhatsApp: { bg: 'bg-status-online/10 text-green-700', icon: MessageSquare, label: 'WhatsApp' },
    whatsapp: { bg: 'bg-status-online/10 text-green-700', icon: MessageSquare, label: 'WhatsApp' },
    Email: { bg: 'bg-accent-light text-blue-700', icon: Mail, label: 'Email' },
    email: { bg: 'bg-accent-light text-blue-700', icon: Mail, label: 'Email' },
    SMS: { bg: 'bg-status-warning/10 text-orange-700', icon: Phone, label: 'SMS' },
    sms: { bg: 'bg-status-warning/10 text-orange-700', icon: Phone, label: 'SMS' },
    Phone: { bg: 'bg-brand-purple/10 text-purple-700', icon: Phone, label: 'Telefon' },
    phone: { bg: 'bg-brand-purple/10 text-purple-700', icon: Phone, label: 'Telefon' },
  };
  const c = config[channel] || { bg: 'bg-surface-secondary text-text-secondary', icon: MessageSquare, label: channel || '–' };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`}>
      <Icon size={10} />
      {c.label}
    </span>
  );
}

/* ──────────────────────── Direction Badge ──────────────────────── */

function DirectionBadge({ direction }) {
  if (direction === 'Outbound') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-accent-light text-accent">
        <ArrowUpRight size={10} />
        Ausgehend
      </span>
    );
  }
  if (direction === 'Inbound') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-status-online/10 text-status-online">
        <ArrowDownLeft size={10} />
        Eingehend
      </span>
    );
  }
  return null;
}

/* ──────────────────────── Status Badge ──────────────────────── */

function StatusBadge({ status }) {
  const config = {
    Sent: { bg: 'bg-accent-light text-blue-700', label: 'Gesendet' },
    Delivered: { bg: 'bg-status-online/10 text-green-700', label: 'Zugestellt' },
    Read: { bg: 'bg-emerald-100 text-emerald-700', label: 'Gelesen' },
    Failed: { bg: 'bg-status-offline/10 text-red-700', label: 'Fehlgeschlagen' },
    Pending: { bg: 'bg-status-warning/10 text-amber-700', label: 'Wartend' },
  };
  const c = config[status] || { bg: 'bg-surface-secondary text-text-secondary', label: status || '–' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`}>
      {c.label}
    </span>
  );
}

/* ──────────────────────── Format date ──────────────────────── */

function formatCommDate(ts) {
  if (!ts) return '–';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

/* ──────────────────────── Communication Row ──────────────────────── */

function CommRow({ comm }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border-secondary/80 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-surface-primary/60 transition-colors text-left group"
      >
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          comm.direction === 'Outbound'
            ? 'bg-gradient-to-br from-blue-100 to-blue-50'
            : 'bg-gradient-to-br from-green-100 to-green-50'
        }`}>
          {comm.direction === 'Outbound' ? (
            <ArrowUpRight size={18} className="text-accent" />
          ) : (
            <ArrowDownLeft size={18} className="text-status-online" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <h4 className="text-sm font-semibold text-text-primary truncate">
              {comm.recipientName || comm.sender || 'Unbekannt'}
            </h4>
            <span className="text-xs text-text-muted flex-shrink-0 ml-2">
              {formatCommDate(comm.timestamp)}
            </span>
          </div>
          {comm.subject && (
            <p className="text-xs text-text-secondary truncate mb-1">{comm.subject}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <ChannelBadge channel={comm.channel} />
            <DirectionBadge direction={comm.direction} />
            {comm.status && <StatusBadge status={comm.status} />}
            {comm.locationNames?.length > 0 && (
              <span className="text-xs text-text-muted truncate max-w-[200px]">
                📍 {comm.locationNames.join(', ')}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-surface-secondary/40 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {comm.recipientContact && (
              <div>
                <span className="text-text-muted font-medium">Kontakt:</span>{' '}
                <span className="text-text-primary">{comm.recipientContact}</span>
              </div>
            )}
            {comm.sender && (
              <div>
                <span className="text-text-muted font-medium">Absender:</span>{' '}
                <span className="text-text-primary">{comm.sender}</span>
              </div>
            )}
            {comm.displayIds?.length > 0 && (
              <div>
                <span className="text-text-muted font-medium">Display IDs:</span>{' '}
                <span className="text-text-primary">{comm.displayIds.join(', ')}</span>
              </div>
            )}
            {comm.externalId && (
              <div>
                <span className="text-text-muted font-medium">External ID:</span>{' '}
                <span className="text-text-primary">{comm.externalId}</span>
              </div>
            )}
          </div>
          {comm.message && (
            <div className="mt-3 p-3 bg-surface-primary rounded-xl border border-border-secondary/40">
              <span className="text-xs text-text-muted font-medium block mb-1">Nachricht</span>
              <p className="text-xs text-text-primary whitespace-pre-wrap leading-relaxed">{comm.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── Create Communication Modal ──────────────────────── */

function CreateCommModal({ isOpen, onClose, onSaved }) {
  const [channel, setChannel] = useState('WhatsApp');
  const [direction, setDirection] = useState('Outbound');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientContact, setRecipientContact] = useState('');
  const [sender, setSender] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Location search
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const locationDropdownRef = useRef(null);
  const backdropRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setChannel('WhatsApp');
      setDirection('Outbound');
      setSubject('');
      setMessage('');
      setRecipientName('');
      setRecipientContact('');
      setSender('');
      setError(null);
      setSelectedLocation(null);
      setLocationSearch('');
      setShowLocationDropdown(false);

      setLocationsLoading(true);
      fetchAllStammdaten()
        .then((data) => setLocations(data))
        .catch(() => setLocations([]))
        .finally(() => setLocationsLoading(false));
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!showLocationDropdown) return;
    const handleClick = (e) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setShowLocationDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showLocationDropdown]);

  const filteredLocations = useMemo(() => {
    if (!locationSearch.trim()) return locations.slice(0, 30);
    const q = locationSearch.toLowerCase();
    return locations.filter((loc) =>
      loc.name?.toLowerCase().includes(q) ||
      loc.city?.toLowerCase().includes(q) ||
      loc.jetIds?.some((j) => j.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [locations, locationSearch]);

  const handleSave = async () => {
    if (!subject.trim() && !message.trim()) {
      setError('Betreff oder Nachricht ist erforderlich');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const commData = {
        channel,
        direction,
        subject: subject.trim(),
        message: message.trim(),
        recipientName: recipientName.trim(),
        recipientContact: recipientContact.trim(),
        sender: sender || undefined,
        status: direction === 'Outbound' ? 'Sent' : undefined,
      };
      if (selectedLocation) {
        commData.locationIds = [selectedLocation.id];
      }
      const result = await createCommunicationRecord(commData);
      if (result) {
        onSaved();
        onClose();
      } else {
        setError('Fehler beim Speichern. Bitte erneut versuchen.');
      }
    } catch (err) {
      setError(err.message || 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div className="w-full max-w-lg bg-surface-primary border border-white/60 rounded-2xl shadow-lg shadow-black/[0.08] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border-secondary">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Neue Kommunikation</h2>
            <p className="text-xs text-text-muted mt-0.5">Nachricht an Standort protokollieren</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-secondary/80 text-text-muted hover:text-text-secondary">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Channel & Direction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Kanal</label>
              <div className="flex flex-wrap gap-1.5">
                {['WhatsApp', 'Email', 'SMS', 'Phone'].map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannel(ch)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      channel === ch
                        ? 'bg-[#007AFF]/10 border-[#007AFF]/40 text-[#007AFF]'
                        : 'bg-surface-secondary/80 border-border-secondary text-text-muted hover:border-border-primary'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Richtung</label>
              <div className="flex gap-1.5">
                {[
                  { id: 'Outbound', label: 'Ausgehend', icon: ArrowUpRight },
                  { id: 'Inbound', label: 'Eingehend', icon: ArrowDownLeft },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDirection(d.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      direction === d.id
                        ? 'bg-[#007AFF]/10 border-[#007AFF]/40 text-[#007AFF]'
                        : 'bg-surface-secondary/80 border-border-secondary text-text-muted hover:border-border-primary'
                    }`}
                  >
                    <d.icon size={12} />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Standort */}
          <div ref={locationDropdownRef} className="relative">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              <MapPin size={11} className="inline -mt-0.5 mr-1 text-text-muted" />
              Standort
            </label>
            {selectedLocation ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[#007AFF]/5 border border-[#007AFF]/30 rounded-lg">
                <Building2 size={13} className="text-[#007AFF] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">{selectedLocation.name}</div>
                  <div className="text-xs text-text-muted truncate">{selectedLocation.city}</div>
                </div>
                <button type="button" onClick={() => setSelectedLocation(null)} className="p-1 rounded hover:bg-surface-secondary/60 text-text-muted hover:text-text-secondary">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={locationSearch}
                  onChange={(e) => { setLocationSearch(e.target.value); setShowLocationDropdown(true); }}
                  onFocus={() => setShowLocationDropdown(true)}
                  placeholder={locationsLoading ? 'Standorte laden...' : 'Standort suchen...'}
                  disabled={locationsLoading}
                  className="w-full pl-9 pr-3 py-2.5 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] disabled:opacity-50"
                />
              </div>
            )}
            {showLocationDropdown && !selectedLocation && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-primary border border-border-secondary rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                {filteredLocations.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-text-muted text-center">{locationsLoading ? 'Laden...' : 'Nicht gefunden'}</div>
                ) : (
                  filteredLocations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => { setSelectedLocation(loc); setLocationSearch(''); setShowLocationDropdown(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-surface-secondary/80 border-b border-border-secondary/30 last:border-0"
                    >
                      <div className="text-xs font-medium text-text-primary truncate">{loc.name}</div>
                      <div className="text-xs text-text-muted">{loc.city}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Empfänger & Kontakt */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Empfänger Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Name..."
                className="w-full px-3 py-2.5 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Kontakt (Tel/Email)</label>
              <input
                type="text"
                value={recipientContact}
                onChange={(e) => setRecipientContact(e.target.value)}
                placeholder="+49... oder email@..."
                className="w-full px-3 py-2.5 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF]"
              />
            </div>
          </div>

          {/* Sender */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Absender</label>
            <select
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF] appearance-none"
            >
              <option value="">– Absender wählen –</option>
              <option value="Anna Schmidt">Anna Schmidt</option>
              <option value="Thomas Weber">Thomas Weber</option>
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Betreff</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Betreff der Nachricht..."
              className="w-full px-3 py-2.5 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF]"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Nachricht</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Inhalt der Nachricht..."
              className="w-full px-3 py-2.5 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-status-offline/10 border border-status-offline/20 rounded-lg">
              <AlertCircle size={14} className="text-status-offline" />
              <span className="text-xs text-status-offline">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border-secondary">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs font-medium text-text-secondary hover:bg-surface-secondary/80 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-[#007AFF] hover:bg-[#2563eb] text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-60"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {saving ? 'Wird gespeichert...' : 'Protokollieren'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── Main Component ──────────────────────── */

export default function CommunicationDashboard() {
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  /* ─── Load data from Supabase ─── */
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const comms = await fetchAllCommunications();
      setCommunications(comms);
    } catch (err) {
      console.error('CommunicationDashboard load error:', err);
      setError('Fehler beim Laden der Kommunikationsdaten');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─── Filter communications ─── */
  const filteredComms = useMemo(() => {
    let result = communications;

    if (channelFilter !== 'all') {
      result = result.filter((c) => c.channel?.toLowerCase() === channelFilter.toLowerCase());
    }

    if (directionFilter !== 'all') {
      result = result.filter((c) => c.direction === directionFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        return (
          (c.recipientName || '').toLowerCase().includes(q) ||
          (c.sender || '').toLowerCase().includes(q) ||
          (c.subject || '').toLowerCase().includes(q) ||
          (c.locationNames || []).some(n => n.toLowerCase().includes(q)) ||
          (c.recipientContact || '').toLowerCase().includes(q) ||
          (c.displayIds || []).some(d => d.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [communications, channelFilter, directionFilter, search]);

  /* ─── KPIs ─── */
  const kpis = useMemo(() => {
    const total = communications.length;
    const outbound = communications.filter((c) => c.direction === 'Outbound').length;
    const inbound = communications.filter((c) => c.direction === 'Inbound').length;
    // Unique channels
    const channels = new Set(communications.map(c => c.channel).filter(Boolean));
    return { total, outbound, inbound, channels: channels.size };
  }, [communications]);

  /* ─── Main view ─── */
  return (
    <div className="space-y-5 animate-fade-in">
      {/* ═══════ Header ═══════ */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <MessageSquare size={20} className="text-[#007AFF]" />
            Kommunikation
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Kommunikationsprotokoll – Alle Nachrichten an Standorte
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#007AFF] text-white rounded-xl text-xs font-medium hover:bg-[#2563eb] transition-all shadow-sm"
          >
            <Plus size={14} />
            Neue Kommunikation
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface-primary border border-border-secondary rounded-xl text-xs font-medium text-text-secondary hover:bg-surface-secondary transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* ═══════ KPI Cards ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Gesamt"
          value={kpis.total}
          icon={Inbox}
          color="#007AFF"
        />
        <KPICard
          label="Ausgehend"
          value={kpis.outbound}
          icon={ArrowUpRight}
          color="#AF52DE"
        />
        <KPICard
          label="Eingehend"
          value={kpis.inbound}
          icon={ArrowDownLeft}
          color="#34C759"
        />
        <KPICard
          label="Kanäle"
          value={kpis.channels}
          icon={MessageSquare}
          color="#FF9500"
        />
      </div>

      {/* ═══════ Filters ═══════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kontakt, Standort oder Display suchen..."
            className="w-full pl-9 pr-3 py-2 bg-surface-primary border border-border-secondary rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-blue-400 transition-all"
          />
        </div>

        {/* Direction filter */}
        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: 'Alle' },
            { id: 'Outbound', label: 'Ausgehend' },
            { id: 'Inbound', label: 'Eingehend' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setDirectionFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                directionFilter === f.id
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-surface-primary border border-border-secondary text-text-muted hover:bg-surface-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Channel filter */}
        <div className="flex items-center gap-1.5">
          {[
            { id: 'all', label: 'Alle Kanäle' },
            { id: 'WhatsApp', label: 'WhatsApp' },
            { id: 'Email', label: 'Email' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setChannelFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                channelFilter === f.id
                  ? 'bg-[#1D1D1F] text-white shadow-sm'
                  : 'bg-surface-primary border border-border-secondary text-text-muted hover:bg-surface-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════ Communication List ═══════ */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-accent animate-spin" />
            <span className="ml-3 text-sm text-text-muted">
              Kommunikationsdaten werden geladen...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle size={20} className="text-status-offline mb-2" />
            <span className="text-sm text-status-offline mb-3">{error}</span>
            <button
              onClick={() => loadData(true)}
              className="text-xs text-accent hover:text-accent underline"
            >
              Erneut versuchen
            </button>
          </div>
        ) : filteredComms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-surface-secondary/80 flex items-center justify-center mb-4">
              <MessageSquare size={28} className="text-text-muted" />
            </div>
            <p className="text-sm font-medium text-text-muted mb-1">
              {search || channelFilter !== 'all' || directionFilter !== 'all'
                ? 'Keine Ergebnisse gefunden'
                : 'Noch keine Kommunikation vorhanden'}
            </p>
            <p className="text-xs text-text-muted">
              {search || channelFilter !== 'all' || directionFilter !== 'all'
                ? 'Versuchen Sie andere Filter'
                : 'Kommunikationsprotokolle werden in Airtable erfasst und automatisch synchronisiert'}
            </p>
          </div>
        ) : (
          <div>
            {filteredComms.map((comm) => (
              <CommRow key={comm.id} comm={comm} />
            ))}
          </div>
        )}
      </div>

      {/* ═══════ Total count ═══════ */}
      {!loading && !error && (
        <div className="text-center">
          <p className="text-xs text-text-muted">
            {filteredComms.length} von {communications.length} Einträgen angezeigt
          </p>
        </div>
      )}

      {/* ═══════ Create Modal ═══════ */}
      <CreateCommModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSaved={() => loadData(true)}
      />
    </div>
  );
}
