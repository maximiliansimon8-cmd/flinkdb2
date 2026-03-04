import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Cpu, Wifi, Monitor, Loader2, MapPin, Hash, Calendar,
  Building2, FileText, CheckCircle2, TrendingUp, Landmark,
  Wrench, ArrowLeftRight, XCircle, Clock, AlertTriangle,
  HardDrive, ChevronRight,
} from 'lucide-react';
import { fetchComponentLifecycle } from '../utils/airtableService';

/* ────────── Helpers ────────── */

function fmtDate(d) {
  if (!d) return null;
  try {
    const date = new Date(Array.isArray(d) ? d[0] : d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('de-DE');
  } catch {
    return String(d);
  }
}

const STATUS_COLORS = {
  'active': { bg: '#34C75915', text: '#34C759', border: '#34C75933', label: 'Aktiv' },
  'defect': { bg: '#FF3B3015', text: '#FF3B30', border: '#FF3B3033', label: 'Defekt' },
  'prep/ warehouse': { bg: '#64748b15', text: '#64748b', border: '#64748b33', label: 'Lager' },
  'out for installation': { bg: '#FF950015', text: '#FF9500', border: '#FF950033', label: 'Unterwegs' },
  'test device': { bg: '#AF52DE15', text: '#AF52DE', border: '#AF52DE33', label: 'Test' },
  'deinstalled': { bg: '#f9731615', text: '#f97316', border: '#f9731633', label: 'Deinstalliert' },
  'to be deinstalled': { bg: '#f9731615', text: '#f97316', border: '#f9731633', label: 'Deinstall geplant' },
  'to be swapped': { bg: '#eab30815', text: '#eab308', border: '#eab30833', label: 'Tausch geplant' },
};

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  const c = STATUS_COLORS[s] || { bg: '#64748b15', text: '#64748b', border: '#64748b33', label: status || '\u2013' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium"
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {c.label}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon size={14} className="text-text-muted flex-shrink-0" />
      <span className="text-text-muted text-xs w-32 flex-shrink-0">{label}</span>
      <span className={`text-text-primary text-xs ${mono ? 'font-mono' : ''}`}>
        {value || '\u2013'}
      </span>
    </div>
  );
}

/* ────────── Timeline Event Config ────────── */

const TIMELINE_CONFIG = {
  installation:   { icon: Wrench,         color: '#34C759', bg: '#34C75915' },
  sim_activation: { icon: Wifi,           color: '#007AFF', bg: '#007AFF15' },
  swap_in:        { icon: ArrowLeftRight, color: '#FF9500', bg: '#FF950015' },
  swap_out:       { icon: ArrowLeftRight, color: '#f97316', bg: '#f9731615' },
  deinstall:      { icon: XCircle,        color: '#FF3B30', bg: '#FF3B3015' },
  leasing_start:  { icon: Landmark,       color: '#AF52DE', bg: '#AF52DE15' },
};

/* ────────── Component Type Config ────────── */

const TYPE_CONFIG = {
  ops:     { icon: Cpu,     color: '#007AFF', label: 'OPS Player' },
  sim:     { icon: Wifi,    color: '#34C759', label: 'SIM-Karte' },
  display: { icon: Monitor, color: '#AF52DE', label: 'Display' },
};

/* ═══════════════════════════════════════════════════════════
 *  MAIN MODAL COMPONENT
 * ═══════════════════════════════════════════════════════════ */

export default function HardwareComponentDetail({ componentType, componentId, onClose, onSelectComponent }) {
  const [lifecycle, setLifecycle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');

  // Fetch lifecycle data when component opens
  useEffect(() => {
    if (!componentId || !componentType) return;
    setLoading(true);
    setActiveTab('details');
    fetchComponentLifecycle(componentType, componentId).then((data) => {
      setLifecycle(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [componentType, componentId]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!componentId || !componentType) return null;

  const typeConf = TYPE_CONFIG[componentType] || TYPE_CONFIG.ops;
  const TypeIcon = typeConf.icon;

  // Build component identifier string
  const getIdentifier = () => {
    if (!lifecycle?.component) return '...';
    const c = lifecycle.component;
    if (componentType === 'ops') return `OPS-${c.opsNr || c.opsSn || '?'}`;
    if (componentType === 'sim') return `SIM ${c.simIdImprecise ? '(ungenau)' : (c.simId ? c.simId.substring(0, 12) + '...' : '?')}`;
    if (componentType === 'display') return `Display ${c.displaySerialNumber || '?'}`;
    return '?';
  };

  return (
    <div
      className="fixed inset-0 bg-black/25 z-[60] flex items-start justify-center pt-10 px-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-primary2xl border border-white/60 rounded-2xl shadow-2xl shadow-black/10 w-full max-w-3xl mb-12 animate-fade-in">
        {/* ──── Header ──── */}
        <div className="flex items-center justify-between p-5 border-b border-border-secondary">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: typeConf.color + '15' }}
            >
              <TypeIcon size={20} style={{ color: typeConf.color }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-mono font-bold text-text-primary">
                  {loading ? 'Lade...' : getIdentifier()}
                </h2>
                {!loading && lifecycle?.component && statusBadge(
                  lifecycle.component.status
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5">{typeConf.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-secondary/60 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ──── Tabs ──── */}
        <div className="flex border-b border-border-secondary">
          {[
            { id: 'details', label: 'Details' },
            { id: 'timeline', label: 'Lifecycle' },
            { id: 'leasing', label: 'Leasing' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ──── Content ──── */}
        <div className="p-5 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={24} className="text-accent animate-spin" />
              <span className="text-xs text-text-muted font-mono">Lade Lifecycle-Daten...</span>
            </div>
          ) : !lifecycle ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle size={24} className="text-amber-400" />
              <span className="text-sm text-text-muted">Keine Daten gefunden</span>
            </div>
          ) : (
            <>
              {activeTab === 'details' && (
                <DetailsTab
                  lifecycle={lifecycle}
                  componentType={componentType}
                  onSelectComponent={onSelectComponent}
                />
              )}
              {activeTab === 'timeline' && (
                <TimelineTab lifecycle={lifecycle} />
              )}
              {activeTab === 'leasing' && (
                <LeasingTab lifecycle={lifecycle} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  TAB 1: DETAILS
 * ═══════════════════════════════════════════════════════════ */

function DetailsTab({ lifecycle, componentType, onSelectComponent }) {
  const { component, opsRecord, relatedSims, relatedDisplays, location } = lifecycle;

  return (
    <div className="space-y-5">
      {/* Component fields */}
      <div>
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
          Komponenten-Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {componentType === 'ops' && (
            <>
              <InfoRow icon={Hash} label="OPS-Nr" value={component.opsNr} mono />
              <InfoRow icon={Hash} label="OPS-SN" value={component.opsSn} mono />
              <InfoRow icon={HardDrive} label="Hardware-Typ" value={component.hardwareType} />
              <InfoRow icon={Hash} label="Navori Venue-ID" value={component.navoriVenueId} mono />
              <InfoRow icon={CheckCircle2} label="Status" value={component.status} />
              <InfoRow icon={Hash} label="Display-SN" value={component.displaySn} mono />
              <InfoRow icon={Hash} label="SIM-ID" value={component.simIdImprecise ? '(ungenau)' : component.simId} mono />
              {component.note && (
                <div className="col-span-2 mt-2 p-2.5 bg-status-warning/10/80 border border-status-warning/20/50 rounded-lg text-xs text-amber-700">
                  {component.note}
                </div>
              )}
            </>
          )}
          {componentType === 'sim' && (
            <>
              <InfoRow
                icon={Hash}
                label="ICCID"
                value={component.simIdImprecise ? '(ungenau - Airtable Praezisionsverlust)' : component.simId}
                mono
              />
              <InfoRow icon={Calendar} label="Aktiv seit" value={fmtDate(component.activateDate)} />
              <InfoRow icon={CheckCircle2} label="Status" value={component.status} />
            </>
          )}
          {componentType === 'display' && (
            <>
              <InfoRow icon={Hash} label="Seriennummer" value={component.displaySerialNumber} mono />
              <InfoRow icon={MapPin} label="Standort-Ref" value={component.location} />
              <InfoRow icon={CheckCircle2} label="Status" value={component.status} />
            </>
          )}
        </div>
      </div>

      {/* Related Hardware Set */}
      {opsRecord && (
        <div>
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            Hardware-Set
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* OPS Card */}
            <button
              onClick={() => onSelectComponent?.({ type: 'ops', id: opsRecord.id })}
              className={`text-left bg-surface-secondary/60 border rounded-lg p-3 transition-all ${
                componentType === 'ops'
                  ? 'border-blue-300 ring-2 ring-blue-100'
                  : 'border-border-secondary/40 cursor-pointer hover:ring-2 hover:ring-accent/20'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu size={12} className="text-accent" />
                <span className="text-xs font-mono font-medium text-text-muted uppercase">OPS</span>
                {componentType !== 'ops' && <ChevronRight size={10} className="text-text-muted ml-auto" />}
              </div>
              <div className="text-xs font-mono text-text-primary">{opsRecord.opsNr || opsRecord.opsSn || '\u2013'}</div>
              <div className="mt-1">{statusBadge(opsRecord.status)}</div>
            </button>

            {/* SIM Card(s) */}
            {relatedSims.length > 0 ? relatedSims.map((sim) => (
              <button
                key={sim.id}
                onClick={() => onSelectComponent?.({ type: 'sim', id: sim.id })}
                className={`text-left bg-surface-secondary/60 border rounded-lg p-3 transition-all ${
                  componentType === 'sim' && component?.id === sim.id
                    ? 'border-green-300 ring-2 ring-green-100'
                    : 'border-border-secondary/40 cursor-pointer hover:ring-2 hover:ring-green-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Wifi size={12} className="text-status-online" />
                  <span className="text-xs font-mono font-medium text-text-muted uppercase">SIM</span>
                  {!(componentType === 'sim' && component?.id === sim.id) && <ChevronRight size={10} className="text-text-muted ml-auto" />}
                </div>
                <div className="text-xs font-mono text-text-primary">
                  {sim.simIdImprecise ? '(ungenau)' : (sim.simId ? sim.simId.substring(0, 14) + '...' : '\u2013')}
                </div>
                <div className="mt-1">{statusBadge(sim.status)}</div>
              </button>
            )) : (
              <div className="bg-surface-secondary/40 border border-dashed border-border-secondary rounded-lg p-3 flex items-center justify-center">
                <span className="text-xs text-text-muted">Keine SIM</span>
              </div>
            )}

            {/* Display Card(s) */}
            {relatedDisplays.length > 0 ? relatedDisplays.map((disp) => (
              <button
                key={disp.id}
                onClick={() => onSelectComponent?.({ type: 'display', id: disp.id })}
                className={`text-left bg-surface-secondary/60 border rounded-lg p-3 transition-all ${
                  componentType === 'display' && component?.id === disp.id
                    ? 'border-purple-300 ring-2 ring-purple-100'
                    : 'border-border-secondary/40 cursor-pointer hover:ring-2 hover:ring-purple-200'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Monitor size={12} className="text-brand-purple" />
                  <span className="text-xs font-mono font-medium text-text-muted uppercase">Display</span>
                  {!(componentType === 'display' && component?.id === disp.id) && <ChevronRight size={10} className="text-text-muted ml-auto" />}
                </div>
                <div className="text-xs font-mono text-text-primary">{disp.displaySerialNumber || '\u2013'}</div>
                <div className="mt-1">{statusBadge(disp.status)}</div>
              </button>
            )) : (
              <div className="bg-surface-secondary/40 border border-dashed border-border-secondary rounded-lg p-3 flex items-center justify-center">
                <span className="text-xs text-text-muted">Kein Display</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Location */}
      {location && (
        <div>
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
            Aktueller Standort
          </h3>
          <div className="bg-surface-secondary/60 border border-border-secondary/40 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <InfoRow icon={MapPin} label="Standort" value={location.locationName} />
              <InfoRow icon={MapPin} label="Stadt" value={location.city} />
              <InfoRow icon={Hash} label="JET-ID" value={location.jetId} mono />
              <InfoRow icon={MapPin} label="Adresse" value={[location.street, location.streetNumber].filter(Boolean).join(' ') || null} />
              <InfoRow icon={Hash} label="PLZ" value={location.postalCode} mono />
              <InfoRow icon={Calendar} label="Live seit" value={fmtDate(location.liveSince)} />
              <InfoRow icon={CheckCircle2} label="Online-Status" value={location.onlineStatus} />
            </div>
          </div>
        </div>
      )}

      {/* SN Cross-Reference check */}
      <SnCrossReference lifecycle={lifecycle} />
    </div>
  );
}

/* ────────── SN Cross-Reference ────────── */

function SnCrossReference({ lifecycle }) {
  const mismatches = useMemo(() => {
    const issues = [];
    const { opsRecord, relatedDisplays, leasing } = lifecycle;
    if (!opsRecord) return issues;

    const hwOpsSn = opsRecord.opsSn || '';
    const hwDisplaySn = relatedDisplays[0]?.displaySerialNumber || opsRecord.displaySn || '';
    const chgDisplaySn = leasing?.chg?.displaySn || '';
    const bankSerial = leasing?.bank?.serialNumber || '';

    if (chgDisplaySn && hwDisplaySn && chgDisplaySn !== hwDisplaySn) {
      issues.push({ label: 'Display-SN', source1: 'Hardware', value1: hwDisplaySn, source2: 'CHG Leasing', value2: chgDisplaySn });
    }
    if (bankSerial && hwDisplaySn && bankSerial !== hwDisplaySn) {
      issues.push({ label: 'Display-SN', source1: 'Hardware', value1: hwDisplaySn, source2: 'Bank Leasing', value2: bankSerial });
    }
    if (chgDisplaySn && bankSerial && chgDisplaySn !== bankSerial) {
      issues.push({ label: 'Display-SN', source1: 'CHG Leasing', value1: chgDisplaySn, source2: 'Bank Leasing', value2: bankSerial });
    }

    return issues;
  }, [lifecycle]);

  if (mismatches.length === 0) return null;

  return (
    <div className="bg-status-offline/10/80 border border-status-offline/20/60 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-status-offline" />
        <span className="text-sm font-bold text-red-800">SN-Abweichung</span>
        <span className="text-xs text-status-offline font-mono">({mismatches.length})</span>
      </div>
      <div className="space-y-2">
        {mismatches.map((m, i) => (
          <div key={i} className="text-xs bg-status-offline/10/50 rounded-lg px-3 py-2">
            <div className="text-red-700 font-semibold mb-1">{m.label}</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <span className="text-status-offline text-xs">{m.source1}:</span>
              <span className="font-mono text-red-800 text-xs break-all">{m.value1}</span>
              <span className="text-status-offline text-xs">{m.source2}:</span>
              <span className="font-mono text-red-800 text-xs break-all">{m.value2}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  TAB 2: LIFECYCLE TIMELINE
 * ═══════════════════════════════════════════════════════════ */

function TimelineTab({ lifecycle }) {
  const { timeline, component, opsRecord } = lifecycle;

  // Add current status as a "now" event at top
  const events = useMemo(() => {
    const items = [...timeline];
    // Add current status entry
    if (component) {
      items.unshift({
        date: null,
        type: 'current',
        label: `Aktueller Status: ${component.status || 'Unbekannt'}`,
        detail: opsRecord ? `OPS-${opsRecord.opsNr || opsRecord.opsSn || '?'}` : '',
      });
    }
    return items;
  }, [timeline, component, opsRecord]);

  if (events.length <= 1) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Clock size={24} className="text-text-muted" />
        <span className="text-sm text-text-muted">Keine Lifecycle-Ereignisse gefunden</span>
        <span className="text-xs text-text-muted">
          Tausch-, Installations- und Deinstallations-Daten werden hier angezeigt
        </span>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-4">
        Ereignis-Timeline
      </h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-3 bottom-3 w-px bg-surface-tertiary" />

        <div className="space-y-0">
          {events.map((event, idx) => {
            const conf = event.type === 'current'
              ? { icon: CheckCircle2, color: '#007AFF', bg: '#007AFF15' }
              : TIMELINE_CONFIG[event.type] || { icon: Clock, color: '#64748b', bg: '#64748b15' };
            const EventIcon = conf.icon;

            return (
              <div key={idx} className="relative flex items-start gap-4 py-3">
                {/* Icon dot */}
                <div
                  className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: conf.bg, border: `2px solid ${conf.color}33` }}
                >
                  <EventIcon size={14} style={{ color: conf.color }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-primary">{event.label}</span>
                    {event.date && (
                      <span className="text-xs font-mono text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
                        {fmtDate(event.date)}
                      </span>
                    )}
                    {!event.date && event.type === 'current' && (
                      <span className="text-xs font-mono text-accent bg-accent-light px-2 py-0.5 rounded">
                        Jetzt
                      </span>
                    )}
                  </div>
                  {event.detail && (
                    <p className="text-xs text-text-muted mt-0.5">{event.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  TAB 3: LEASING
 * ═══════════════════════════════════════════════════════════ */

function LeasingTab({ lifecycle }) {
  const { leasing } = lifecycle;

  if (!leasing || (!leasing.chg && !leasing.bank)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Landmark size={24} className="text-text-muted" />
        <span className="text-sm text-text-muted">Keine Leasing-Daten gefunden</span>
        <span className="text-xs text-text-muted">
          CHG Approval und Bank TESMA Daten werden hier angezeigt
        </span>
      </div>
    );
  }

  const bank = leasing.bank;
  const chg = leasing.chg;

  // Calculate lease progress
  let progress = null;
  const startRaw = bank?.rentalStart || chg?.rentalStart;
  const endRaw = bank?.rentalEndPlanned || chg?.rentalEnd;
  const start = startRaw ? new Date(Array.isArray(startRaw) ? startRaw[0] : startRaw) : null;
  const end = endRaw ? new Date(Array.isArray(endRaw) ? endRaw[0] : endRaw) : null;
  const startValid = start && !isNaN(start.getTime());
  const endValid = end && !isNaN(end.getTime());
  if (startValid && endValid) {
    const total = end.getTime() - start.getTime();
    if (total > 0) {
      progress = Math.min(100, Math.max(0, Math.round(((Date.now() - start.getTime()) / total) * 100)));
    }
  }

  let totalMonths = null;
  if (startValid && endValid) {
    totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Landmark size={14} className="text-[#007AFF]" />
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Leasing
        </h3>
        {bank?.contractStatus && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium"
            style={{ backgroundColor: '#34C75915', color: '#34C759', border: '1px solid #34C75933' }}
          >
            {bank.contractStatus}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <div>
          {(bank?.lessor || chg?.status) && (
            <InfoRow icon={Building2} label="Leasinggeber" value={bank?.lessor || '\u2013'} />
          )}
          {bank?.rentalCertificate && (
            <InfoRow icon={FileText} label="Mietschein" value={bank.rentalCertificate} mono />
          )}
          {(bank?.assetId || chg?.assetId) && (
            <InfoRow icon={Hash} label="Asset-ID" value={bank?.assetId || chg?.assetId} mono />
          )}
          {bank?.designation && (
            <InfoRow icon={Monitor} label="Produkt" value={bank.designation} />
          )}
        </div>
        <div>
          {startValid && (
            <InfoRow
              icon={Calendar}
              label="Laufzeit"
              value={`${fmtDate(startRaw)} \u2192 ${endValid ? fmtDate(endRaw) : '\u2013'}${totalMonths ? ` (${totalMonths} Mon.)` : ''}`}
              mono
            />
          )}
          {bank?.monthlyPrice != null && (
            <InfoRow icon={TrendingUp} label="Monatspreis" value={`${bank.monthlyPrice.toFixed(2).replace('.', ',')} \u20AC`} mono />
          )}
          {chg?.paymentReleasedOn && (
            <InfoRow icon={CheckCircle2} label="Zahlung freigeg." value={`${fmtDate(chg.paymentReleasedOn)}${chg.paymentReleasedBy ? ` von ${chg.paymentReleasedBy}` : ''}`} />
          )}
          {chg?.chgCertificate && (
            <InfoRow icon={FileText} label="CHG Zertifikat" value={chg.chgCertificate} mono />
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress !== null && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted font-mono">Laufzeit-Fortschritt</span>
            <span className="text-xs text-text-muted font-mono font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-surface-secondary rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${progress}%`,
                backgroundColor: progress > 80 ? '#FF9500' : '#007AFF',
              }}
            />
          </div>
        </div>
      )}

      {/* CHG Details */}
      {chg && (
        <div className="mt-3 pt-3 border-t border-border-secondary">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">CHG Approval</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <InfoRow icon={Hash} label="Display-SN" value={chg.displaySn} mono />
            <InfoRow icon={FileText} label="Rechnungs-Nr" value={chg.integratorInvoiceNo} mono />
            <InfoRow icon={Calendar} label="Rechnungsdatum" value={fmtDate(chg.invoiceDate)} />
            <InfoRow icon={CheckCircle2} label="Status" value={chg.status} />
          </div>
        </div>
      )}

      {/* Bank Details */}
      {bank && (
        <div className="mt-3 pt-3 border-t border-border-secondary">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Bank TESMA</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <InfoRow icon={Hash} label="Seriennummer" value={bank.serialNumber} mono />
            <InfoRow icon={Hash} label="Bestellnummer" value={bank.orderNumber} mono />
            <InfoRow icon={Building2} label="Kunde" value={bank.customer} />
            <InfoRow icon={MapPin} label="Install.-Ort" value={bank.installationLocation} />
            <InfoRow icon={MapPin} label="Stadt" value={bank.city} />
            <InfoRow icon={Hash} label="Kostenstelle" value={bank.costCenter} mono />
          </div>
        </div>
      )}
    </div>
  );
}
