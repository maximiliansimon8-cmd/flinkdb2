import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Database, Search, RefreshCw, Loader2, CheckCircle2, XCircle,
  Copy, Clock, BarChart3, CreditCard, MapPin, Layers,
  AlertTriangle, ArrowUpDown, Monitor, Link2, Eye, ChevronLeft,
  ChevronRight, Store, FileWarning, Zap, Wrench, Calendar,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/* ═══════════════════════════════════════════════════════════════════
   NocoDB Panel — Cached NocoDB data from Supabase
   Sub-tabs: Übersicht, Gesamtzuordnung, Vorbereitet, SIM-Karten,
             Vistar/Navori, Lieferando, Warnings
   ═══════════════════════════════════════════════════════════════════ */

const SUB_TABS = [
  { key: 'overview',      label: 'Übersicht',         icon: BarChart3 },
  { key: 'matching',      label: 'Gesamtzuordnung',   icon: Link2 },
  { key: 'vorbereitet',   label: 'Vorbereitet',       icon: Layers },
  { key: 'sim',           label: 'SIM-Karten',        icon: CreditCard },
  { key: 'vistar',        label: 'Vistar/Navori',     icon: Monitor },
  { key: 'lieferando',    label: 'Lieferando',        icon: Store },
  { key: 'warnings',      label: 'Datenqualität',     icon: FileWarning },
];

/* ─── Helpers ──────────────────────────────────────────────────── */

/** Strip NocoDB's {"..."} or {\"...\"} wrapping from display */
function clean(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/^\{\\?"/, '').replace(/\\?"\}$/, '');
  s = s.replace(/^\{"/, '').replace(/"\}$/, '');
  s = s.replace(/^"(.*)"$/, '$1');
  return s || null;
}

const PAGE_SIZE = 50;

/* ─── KPI Card ──────────────────────────────────────────────────── */

function KpiCard({ label, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      {subtitle && <div className="text-xs text-text-muted mt-1">{subtitle}</div>}
    </div>
  );
}

/* ─── Copyable Cell ─────────────────────────────────────────────── */

function CopyCell({ value, truncate }) {
  const [copied, setCopied] = useState(false);
  const display = truncate && value && value.length > truncate
    ? value.slice(0, truncate) + '…'
    : value || '–';

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span
      className="inline-flex items-center gap-1 cursor-pointer group"
      onClick={handleCopy}
      title={value || ''}
    >
      <span className="font-mono text-xs">{display}</span>
      {value && (
        copied
          ? <CheckCircle2 size={12} className="text-status-online" />
          : <Copy size={12} className="text-text-muted group-hover:text-text-muted transition-colors" />
      )}
    </span>
  );
}

/* ─── Boolean Badge ─────────────────────────────────────────────── */

function BoolBadge({ value }) {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'yes' || value === 'ja') {
    return <CheckCircle2 size={16} className="text-status-online" />;
  }
  return <XCircle size={16} className="text-text-muted" />;
}

/* ─── Source Badge ──────────────────────────────────────────────── */

function SourceBadge({ source }) {
  const config = {
    airtable: { label: 'Airtable', color: 'bg-accent-light text-blue-700' },
    nocodb: { label: 'NocoDB', color: 'bg-brand-purple/10 text-purple-700' },
    vorbereitet: { label: 'Vorbereitet', color: 'bg-indigo-100 text-indigo-700' },
    sim: { label: 'SIM', color: 'bg-violet-100 text-violet-700' },
    vistar: { label: 'Vistar', color: 'bg-status-warning/10 text-amber-700' },
    lieferando: { label: 'Lieferando', color: 'bg-status-offline/10 text-red-700' },
    hardware_ops: { label: 'HW-OPS', color: 'bg-status-online/10 text-green-700' },
  };
  const c = config[source] || { label: source, color: 'bg-surface-secondary text-text-secondary' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.color}`}>
      {c.label}
    </span>
  );
}

/* ─── Match Status Badge ───────────────────────────────────────── */

function MatchBadge({ matched, label }) {
  return matched ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-online/10 text-green-700">
      <CheckCircle2 size={10} /> {label || 'Matched'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-warning/10 text-amber-700">
      <AlertTriangle size={10} /> {label || 'Unmatched'}
    </span>
  );
}

/* ─── Search Bar ────────────────────────────────────────────────── */

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-surface-primary border border-border-secondary text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-blue-400 transition"
      />
    </div>
  );
}

/* ─── Filter Select ─────────────────────────────────────────────── */

function FilterSelect({ value, onChange, options, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-text-muted font-medium whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-lg text-xs bg-surface-primary border border-border-secondary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ─── Shared Sort Hook ─────────────────────────────────────────── */

function useSort(defaultCol) {
  const [sortCol, setSortCol] = useState(defaultCol || null);
  const [sortDir, setSortDir] = useState('asc');
  const toggle = (col) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };
  const apply = (rows) => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      const cmp = String(a[sortCol] ?? '').localeCompare(String(b[sortCol] ?? ''), 'de', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };
  return { sortCol, sortDir, toggle, apply };
}

/* ─── Sortable Header ──────────────────────────────────────────── */

function SortHeader({ col, sortCol, onToggle, children }) {
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted cursor-pointer hover:text-text-primary select-none"
      onClick={() => onToggle(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown size={10} className={sortCol === col ? 'text-accent' : 'text-text-muted'} />
      </span>
    </th>
  );
}

/* ─── Pagination ───────────────────────────────────────────────── */

function Pagination({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary/80 border-t border-border-secondary">
      <span className="text-xs text-text-muted">
        Seite {page + 1} von {totalPages} ({total} Einträge)
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="p-1 rounded hover:bg-surface-tertiary/60 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft size={16} className="text-text-secondary" />
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let pageNum;
          if (totalPages <= 7) pageNum = i;
          else if (page < 3) pageNum = i;
          else if (page > totalPages - 4) pageNum = totalPages - 7 + i;
          else pageNum = page - 3 + i;
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`w-7 h-7 rounded text-xs font-medium transition ${
                pageNum === page
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:bg-surface-tertiary/60'
              }`}
            >
              {pageNum + 1}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-1 rounded hover:bg-surface-tertiary/60 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight size={16} className="text-text-secondary" />
        </button>
      </div>
    </div>
  );
}

/* ─── Truthy Check ─────────────────────────────────────────────── */

function isTruthy(v) {
  return v === true || v === 'true' || v === 1 || v === '1' || v === 'yes' || v === 'ja';
}

/* ═══════════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════════════════════════════ */

function OverviewTab({ vorbereitet, simKunden, vistarNavori, lieferando, syncMeta, opsData, onSync, syncing }) {
  const totalVorbereitet = vorbereitet.length;
  const matchedOps = useMemo(() => {
    if (!opsData || opsData.length === 0) return 0;
    const opsSet = new Set(opsData.map((o) => String(o.ops_nr || o.opsNr || '')).filter(Boolean));
    return vorbereitet.filter((v) => opsSet.has(String(v.ops_nr || ''))).length;
  }, [vorbereitet, opsData]);
  const totalSim = simKunden.length;
  const totalVistar = vistarNavori.length;
  const totalLieferando = lieferando.length;

  const lastSync = (syncMeta?.last_sync_timestamp || syncMeta?.updated_at)
    ? new Date(syncMeta.last_sync_timestamp || syncMeta.updated_at).toLocaleString('de-DE')
    : 'Nie';

  const matchRate = totalVorbereitet > 0
    ? Math.round((matchedOps / totalVorbereitet) * 100)
    : 0;

  // Lieferando stats
  const lieferandoErfolgreich = lieferando.filter(l => {
    const s = clean(l.akquise_status);
    return s && s.toLowerCase().includes('erfolgreich');
  }).length;
  const lieferandoInstalliert = lieferando.filter(l => {
    const s = clean(l.standort_status);
    return s && s.toLowerCase().includes('installiert');
  }).length;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Vorbereitet" value={totalVorbereitet} icon={Layers} color="#007AFF" />
        <KpiCard label="Matched OPS" value={matchedOps} icon={CheckCircle2} color="#34C759" subtitle={`${matchRate}% Match-Rate`} />
        <KpiCard label="SIM-Karten" value={totalSim} icon={CreditCard} color="#AF52DE" />
        <KpiCard label="Vistar Venues" value={totalVistar} icon={Monitor} color="#FF9500" />
        <KpiCard label="Lieferando" value={totalLieferando} icon={Store} color="#FF3B30" subtitle={`${lieferandoErfolgreich} erfolgreich`} />
        <KpiCard label="Letzter Sync" value={lastSync === 'Nie' ? '–' : ''} icon={Clock} color="#64748b" subtitle={lastSync} />
      </div>

      {/* Sync Button */}
      <div className="bg-surface-primary border border-border-secondary rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">NocoDB Synchronisation</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Daten aus NocoDB werden gecached. Klicke Sync um die neuesten Daten abzurufen.
            </p>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/80 disabled:opacity-50 flex items-center gap-2 transition"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Synchronisiere...' : 'Sync jetzt'}
          </button>
        </div>
        {syncMeta?.last_sync_status && (
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <span className={`w-2 h-2 rounded-full ${syncMeta.last_sync_status === 'success' ? 'bg-green-400' : syncMeta.last_sync_status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-red-400'}`} />
            Status: {syncMeta.last_sync_status === 'success' ? 'Erfolgreich' : syncMeta.last_sync_status === 'running' ? 'Laufend...' : syncMeta.last_sync_status}
            {syncMeta.records_fetched != null && ` | ${syncMeta.records_fetched} Records`}
          </div>
        )}
      </div>

      {/* Matching Quality */}
      <div className="bg-surface-primary border border-border-secondary rounded-xl p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-accent" />
          Matching-Qualität
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Vorbereitet vs OPS */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Vorbereitet → OPS</span>
              <span className="font-medium text-text-primary">{matchedOps}/{totalVorbereitet}</span>
            </div>
            <div className="w-full h-2 bg-surface-secondary rounded-full overflow-hidden">
              <div className="h-full bg-status-online rounded-full transition-all duration-500" style={{ width: `${matchRate}%` }} />
            </div>
          </div>
          {/* Lieferando Erfolgreich */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Lieferando erfolgreich</span>
              <span className="font-medium text-text-primary">{lieferandoErfolgreich}/{totalLieferando}</span>
            </div>
            <div className="w-full h-2 bg-surface-secondary rounded-full overflow-hidden">
              <div className="h-full bg-status-offline rounded-full" style={{ width: `${totalLieferando > 0 ? Math.round((lieferandoErfolgreich / totalLieferando) * 100) : 0}%` }} />
            </div>
          </div>
          {/* Lieferando Installiert */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Standorte installiert</span>
              <span className="font-medium text-text-primary">{lieferandoInstalliert}/{totalLieferando}</span>
            </div>
            <div className="w-full h-2 bg-surface-secondary rounded-full overflow-hidden">
              <div className="h-full bg-status-warning rounded-full" style={{ width: `${totalLieferando > 0 ? Math.round((lieferandoInstalliert / totalLieferando) * 100) : 0}%` }} />
            </div>
          </div>
          {/* Vistar Venues */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Vistar/Navori Venues</span>
              <span className="font-medium text-text-primary">{totalVistar}</span>
            </div>
            <div className="w-full h-2 bg-surface-secondary rounded-full overflow-hidden">
              <div className="h-full bg-brand-purple rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GESAMTZUORDNUNG TAB — Complete matching overview
   Shows per-device: OPS-Nr, SN, JET-ID, Venue-ID, SIM, Standort + data sources
   ═══════════════════════════════════════════════════════════════════ */

function MatchingTab({ vorbereitet, simKunden, vistarNavori, lieferando, opsData }) {
  const [search, setSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState('all');
  const [page, setPage] = useState(0);
  const { sortCol, toggle, apply } = useSort('ops_nr');

  // Build a unified lookup from all data sources
  const mergedData = useMemo(() => {
    // Index maps
    const simByKartenNr = new Map();
    simKunden.forEach(s => { if (s.karten_nr) simByKartenNr.set(s.karten_nr, s); });

    const vistarByVenueId = new Map();
    vistarNavori.forEach(v => { if (v.venue_id) vistarByVenueId.set(v.venue_id, v); });

    const vistarByKundenId = new Map();
    vistarNavori.forEach(v => {
      const kid = clean(v.kunden_id);
      if (kid) vistarByKundenId.set(kid, v);
    });

    const lieferandoByKundenId = new Map();
    lieferando.forEach(l => {
      const kid = clean(l.kunden_id);
      if (kid) lieferandoByKundenId.set(kid, l);
    });

    const opsMap = new Map();
    (opsData || []).forEach(o => {
      if (o.ops_nr) opsMap.set(String(o.ops_nr), o);
    });

    // Start from Vorbereitet as base (every device should be there)
    const result = [];
    const seenOps = new Set();

    vorbereitet.forEach(v => {
      const opsNr = v.ops_nr ? String(v.ops_nr) : null;
      if (opsNr) seenOps.add(opsNr);

      const ops = opsNr ? opsMap.get(opsNr) : null;
      const sim = v.sim_id ? simByKartenNr.get(v.sim_id) : null;
      const vistar = v.venue_id ? vistarByVenueId.get(v.venue_id) : null;

      // Get KundenID from SIM → look up in Lieferando
      const kundenIdFromSim = sim ? clean(sim.kunden_id) : null;
      const kundenIdFromVorbereitet = v.kunden_nr ? clean(v.kunden_nr) : null;
      const kundenId = kundenIdFromSim || kundenIdFromVorbereitet || (vistar ? clean(vistar.kunden_id) : null);

      const lief = kundenId ? lieferandoByKundenId.get(kundenId) : null;
      // Also try vistar match by kunden_id
      const vistarByKid = kundenId && !vistar ? vistarByKundenId.get(kundenId) : null;
      const finalVistar = vistar || vistarByKid;

      // Sources tracking
      const sources = ['vorbereitet'];
      if (ops) sources.push('hardware_ops');
      if (sim) sources.push('sim');
      if (finalVistar) sources.push('vistar');
      if (lief) sources.push('lieferando');

      const completeness = sources.length;
      const maxCompleteness = 5;

      result.push({
        ops_nr: opsNr,
        ops_sn: v.ops_sn || (ops ? ops.serial_number || ops.sn : null) || null,
        hardware_type: ops?.hardware_type || ops?.type || null,
        ops_status: ops?.status || null,
        venue_id: v.venue_id || null,
        sim_id: v.sim_id || null,
        kunden_id: kundenId,
        jet_id: kundenId, // JET-ID = KundenID
        fertig: v.fertig,
        vorbereitet: v.vorbereitet,
        // Vistar data
        vistar_name: finalVistar?.name || null,
        do_id: finalVistar?.do_id || null,
        // Lieferando data
        restaurant: lief ? clean(lief.restaurant) : null,
        stadt: lief ? clean(lief.stadt) : null,
        strasse: lief ? clean(lief.strasse) : null,
        hausnummer: lief ? clean(lief.hausnummer) : null,
        akquise_status: lief ? clean(lief.akquise_status) : null,
        standort_status: lief ? clean(lief.standort_status) : null,
        // Matching
        sources,
        completeness,
        matchPct: Math.round((completeness / maxCompleteness) * 100),
        hasOps: !!ops,
        hasSim: !!sim,
        hasVistar: !!finalVistar,
        hasLieferando: !!lief,
      });
    });

    // Also add OPS that are NOT in Vorbereitet (orphans)
    (opsData || []).forEach(o => {
      const opsNr = o.ops_nr ? String(o.ops_nr) : null;
      if (!opsNr || seenOps.has(opsNr)) return;

      result.push({
        ops_nr: opsNr,
        ops_sn: o.serial_number || o.sn || null,
        hardware_type: o.hardware_type || o.type || null,
        ops_status: o.status || null,
        venue_id: null,
        sim_id: null,
        kunden_id: null,
        jet_id: null,
        fertig: false,
        vorbereitet: false,
        vistar_name: null,
        do_id: null,
        restaurant: null,
        stadt: null,
        strasse: null,
        hausnummer: null,
        akquise_status: null,
        standort_status: null,
        sources: ['hardware_ops'],
        completeness: 1,
        matchPct: 20,
        hasOps: true,
        hasSim: false,
        hasVistar: false,
        hasLieferando: false,
      });
    });

    return result;
  }, [vorbereitet, simKunden, vistarNavori, lieferando, opsData]);

  const filtered = useMemo(() => {
    let rows = mergedData;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        String(r.ops_nr || '').includes(q) ||
        String(r.ops_sn || '').toLowerCase().includes(q) ||
        String(r.venue_id || '').toLowerCase().includes(q) ||
        String(r.sim_id || '').toLowerCase().includes(q) ||
        String(r.kunden_id || '').toLowerCase().includes(q) ||
        String(r.restaurant || '').toLowerCase().includes(q) ||
        String(r.vistar_name || '').toLowerCase().includes(q) ||
        String(r.stadt || '').toLowerCase().includes(q)
      );
    }
    if (matchFilter === 'complete') rows = rows.filter(r => r.completeness >= 4);
    else if (matchFilter === 'partial') rows = rows.filter(r => r.completeness >= 2 && r.completeness < 4);
    else if (matchFilter === 'orphan') rows = rows.filter(r => r.completeness <= 1);
    else if (matchFilter === 'no-standort') rows = rows.filter(r => !r.hasLieferando && !r.hasVistar);

    return apply(rows);
  }, [mergedData, search, matchFilter, apply]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filter changes
  useEffect(() => { setPage(0); }, [search, matchFilter]);

  // Stats
  const completeCount = mergedData.filter(r => r.completeness >= 4).length;
  const partialCount = mergedData.filter(r => r.completeness >= 2 && r.completeness < 4).length;
  const orphanCount = mergedData.filter(r => r.completeness <= 1).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gesamt-Geräte" value={mergedData.length} icon={Layers} color="#007AFF" />
        <KpiCard label="Vollständig (4+)" value={completeCount} icon={CheckCircle2} color="#34C759" subtitle={`${mergedData.length > 0 ? Math.round((completeCount / mergedData.length) * 100) : 0}%`} />
        <KpiCard label="Teilweise (2-3)" value={partialCount} icon={AlertTriangle} color="#FF9500" />
        <KpiCard label="Nur 1 Quelle" value={orphanCount} icon={XCircle} color="#FF3B30" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="OPS-Nr, SN, Venue-ID, SIM, KundenID, Restaurant, Stadt..." />
        </div>
        <FilterSelect label="Status" value={matchFilter} onChange={setMatchFilter}
          options={[
            { value: 'all', label: `Alle (${mergedData.length})` },
            { value: 'complete', label: `Vollständig (${completeCount})` },
            { value: 'partial', label: `Teilweise (${partialCount})` },
            { value: 'orphan', label: `Nur 1 Quelle (${orphanCount})` },
            { value: 'no-standort', label: 'Kein Standort' },
          ]} />
      </div>

      <div className="text-xs text-text-muted">{filtered.length} Geräte</div>

      {/* Table */}
      <div className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-secondary/80 border-b border-border-secondary">
              <tr>
                <SortHeader col="ops_nr" sortCol={sortCol} onToggle={toggle}>OPS Nr.</SortHeader>
                <SortHeader col="ops_sn" sortCol={sortCol} onToggle={toggle}>Seriennummer</SortHeader>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">JET-ID</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Venue-ID</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">SIM (ICCID)</th>
                <SortHeader col="restaurant" sortCol={sortCol} onToggle={toggle}>Standort</SortHeader>
                <SortHeader col="stadt" sortCol={sortCol} onToggle={toggle}>Stadt</SortHeader>
                <SortHeader col="standort_status" sortCol={sortCol} onToggle={toggle}>Status</SortHeader>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-text-muted uppercase">Match</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Quellen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {pageRows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-text-muted">Keine Einträge gefunden</td></tr>
              ) : pageRows.map((row, i) => (
                <tr key={`${row.ops_nr}-${i}`} className="hover:bg-accent-light/30 transition-colors">
                  <td className="px-3 py-2 font-bold text-text-primary">{row.ops_nr || '–'}</td>
                  <td className="px-3 py-2"><CopyCell value={row.ops_sn} truncate={18} /></td>
                  <td className="px-3 py-2 text-text-secondary">{row.jet_id || '–'}</td>
                  <td className="px-3 py-2"><CopyCell value={row.venue_id} truncate={12} /></td>
                  <td className="px-3 py-2 text-text-muted">{row.sim_id ? '…' + String(row.sim_id).slice(-8) : '–'}</td>
                  <td className="px-3 py-2 text-text-primary font-medium max-w-[180px] truncate" title={row.restaurant || row.vistar_name || ''}>
                    {row.restaurant || row.vistar_name || '–'}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{row.stadt || '–'}</td>
                  <td className="px-3 py-2">
                    {row.standort_status ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        row.standort_status.toLowerCase().includes('installiert') ? 'bg-status-online/10 text-green-700' :
                        row.standort_status.toLowerCase().includes('klärung') ? 'bg-status-warning/10 text-amber-700' :
                        'bg-surface-secondary text-text-secondary'
                      }`}>
                        {row.standort_status}
                      </span>
                    ) : (row.akquise_status ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-light text-accent">
                        {row.akquise_status}
                      </span>
                    ) : '–')}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center gap-1 justify-center" title={`${row.completeness}/5 Quellen`}>
                      <div className="w-12 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            row.matchPct >= 80 ? 'bg-status-online' :
                            row.matchPct >= 40 ? 'bg-status-warning' :
                            'bg-status-offline'
                          }`}
                          style={{ width: `${row.matchPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted">{row.completeness}/5</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-0.5">
                      {row.sources.map(s => <SourceBadge key={s} source={s} />)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VORBEREITET TAB
   ═══════════════════════════════════════════════════════════════════ */

function VorbereitetTab({ data, opsData }) {
  const [search, setSearch] = useState('');
  const [fertigFilter, setFertigFilter] = useState('all');
  const [vorbereitetFilter, setVorbereitetFilter] = useState('all');
  const [page, setPage] = useState(0);
  const { sortCol, toggle, apply } = useSort();

  const opsSet = useMemo(() => {
    if (!opsData?.length) return new Set();
    return new Set(opsData.map((o) => String(o.ops_nr || o.opsNr || '')).filter(Boolean));
  }, [opsData]);

  const filtered = useMemo(() => {
    let rows = data;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        String(r.ops_nr || '').toLowerCase().includes(q) ||
        String(r.kunden_nr || '').toLowerCase().includes(q) ||
        String(r.sim_id || '').toLowerCase().includes(q) ||
        String(r.venue_id || '').toLowerCase().includes(q) ||
        String(r.ops_sn || '').toLowerCase().includes(q)
      );
    }
    if (fertigFilter !== 'all') {
      const want = fertigFilter === 'yes';
      rows = rows.filter((r) => isTruthy(r.fertig) === want);
    }
    if (vorbereitetFilter !== 'all') {
      const want = vorbereitetFilter === 'yes';
      rows = rows.filter((r) => isTruthy(r.vorbereitet) === want);
    }
    return apply(rows);
  }, [data, search, fertigFilter, vorbereitetFilter, apply]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, fertigFilter, vorbereitetFilter]);

  const thStatic = "px-3 py-2 text-left text-[10px] font-semibold text-text-muted";
  const thCenter = "px-3 py-2 text-center text-[10px] font-semibold text-text-muted";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="OpsNr, KundenNr, SimID, VenueID, SN..." />
        </div>
        <div className="flex items-center gap-3">
          <FilterSelect label="Fertig" value={fertigFilter} onChange={setFertigFilter}
            options={[{ value: 'all', label: 'Alle' }, { value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} />
          <FilterSelect label="Vorbereitet" value={vorbereitetFilter} onChange={setVorbereitetFilter}
            options={[{ value: 'all', label: 'Alle' }, { value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} />
        </div>
      </div>
      <div className="text-xs text-text-muted">{filtered.length} von {data.length} Einträgen</div>
      <div className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-secondary/80 border-b border-border-secondary">
              <tr>
                <SortHeader col="ops_nr" sortCol={sortCol} onToggle={toggle}>OPS Nr.</SortHeader>
                <SortHeader col="ops_sn" sortCol={sortCol} onToggle={toggle}>OPS-SN</SortHeader>
                <th className={thStatic}>Venue ID</th>
                <th className={thStatic}>SIM ID</th>
                <SortHeader col="kunden_nr" sortCol={sortCol} onToggle={toggle}>Kunden Nr.</SortHeader>
                <th className={thCenter}>Fertig</th>
                <th className={thCenter}>Vorbereitet</th>
                <th className={thCenter}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {pageRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted">Keine Einträge gefunden</td></tr>
              ) : pageRows.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-accent-light/30 transition-colors">
                  <td className="px-3 py-2 font-medium text-text-primary">{row.ops_nr || '–'}</td>
                  <td className="px-3 py-2 text-text-secondary">{row.ops_sn || '–'}</td>
                  <td className="px-3 py-2"><CopyCell value={row.venue_id} truncate={12} /></td>
                  <td className="px-3 py-2 text-text-secondary">{row.sim_id ? '…' + String(row.sim_id).slice(-6) : '–'}</td>
                  <td className="px-3 py-2 text-text-secondary">{row.kunden_nr || '–'}</td>
                  <td className="px-3 py-2 text-center"><BoolBadge value={row.fertig} /></td>
                  <td className="px-3 py-2 text-center"><BoolBadge value={row.vorbereitet} /></td>
                  <td className="px-3 py-2 text-center"><MatchBadge matched={opsSet.has(String(row.ops_nr || ''))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SIM-KARTEN TAB
   ═══════════════════════════════════════════════════════════════════ */

function SimKartenTab({ data, vorbereitet }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { sortCol, toggle, apply } = useSort();

  // Match SIM to vorbereitet via sim_id
  const simSet = useMemo(() => {
    if (!vorbereitet?.length) return new Set();
    return new Set(vorbereitet.map(v => v.sim_id).filter(Boolean));
  }, [vorbereitet]);

  const filtered = useMemo(() => {
    let rows = data;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        String(r.karten_nr || '').toLowerCase().includes(q) ||
        String(r.kunden_id || '').toLowerCase().includes(q)
      );
    }
    return apply(rows);
  }, [data, search, apply]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Karten Nr. oder KundenID..." />
        </div>
        <div className="text-xs text-text-muted flex items-center">
          {filtered.length} von {data.length} SIM-Karten
        </div>
      </div>
      <div className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-secondary/80 border-b border-border-secondary">
              <tr>
                <SortHeader col="karten_nr" sortCol={sortCol} onToggle={toggle}>Karten Nr. (ICCID)</SortHeader>
                <SortHeader col="kunden_id" sortCol={sortCol} onToggle={toggle}>KundenID (JET-ID)</SortHeader>
                <SortHeader col="aktivierungsdatum" sortCol={sortCol} onToggle={toggle}>Aktivierungsdatum</SortHeader>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-text-muted">Zugeordnet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {pageRows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-muted">Keine SIM-Karten gefunden</td></tr>
              ) : pageRows.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-accent-light/30 transition-colors">
                  <td className="px-3 py-2"><CopyCell value={row.karten_nr} /></td>
                  <td className="px-3 py-2 text-text-secondary">{clean(row.kunden_id) || '–'}</td>
                  <td className="px-3 py-2 text-text-secondary">
                    {row.aktivierungsdatum ? new Date(row.aktivierungsdatum).toLocaleDateString('de-DE') : '–'}
                  </td>
                  <td className="px-3 py-2 text-center"><MatchBadge matched={simSet.has(row.karten_nr)} label={simSet.has(row.karten_nr) ? 'Zugeordnet' : 'Frei'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VISTAR / NAVORI TAB
   ═══════════════════════════════════════════════════════════════════ */

function VistarNavoriTab({ data }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const { sortCol, toggle, apply } = useSort();

  const filtered = useMemo(() => {
    let rows = data;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        String(r.venue_id || '').toLowerCase().includes(q) ||
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.kunden_id || '').toLowerCase().includes(q) ||
        String(r.do_id || '').toLowerCase().includes(q)
      );
    }
    return apply(rows);
  }, [data, search, apply]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Venue ID, Name, Kunden ID, DO-ID..." />
        </div>
        <div className="text-xs text-text-muted flex items-center">
          {filtered.length} von {data.length} Venues
        </div>
      </div>
      <div className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-secondary/80 border-b border-border-secondary">
              <tr>
                <SortHeader col="venue_id" sortCol={sortCol} onToggle={toggle}>Venue ID</SortHeader>
                <SortHeader col="name" sortCol={sortCol} onToggle={toggle}>Name</SortHeader>
                <SortHeader col="kunden_id" sortCol={sortCol} onToggle={toggle}>Kunden ID</SortHeader>
                <SortHeader col="do_id" sortCol={sortCol} onToggle={toggle}>DO-ID</SortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {pageRows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-muted">Keine Venues gefunden</td></tr>
              ) : pageRows.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-accent-light/30 transition-colors">
                  <td className="px-3 py-2"><CopyCell value={row.venue_id} truncate={16} /></td>
                  <td className="px-3 py-2 text-text-primary font-medium">{row.name || '–'}</td>
                  <td className="px-3 py-2 text-text-secondary">{clean(row.kunden_id) || '–'}</td>
                  <td className="px-3 py-2"><CopyCell value={row.do_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LIEFERANDO TAB
   ═══════════════════════════════════════════════════════════════════ */

function LieferandoTab({ data, simKunden }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const { sortCol, toggle, apply } = useSort();

  // Build KundenID→SIM mapping to check if Lieferando location has a matched device
  const kundenIdSet = useMemo(() => {
    return new Set(simKunden.map(s => clean(s.kunden_id)).filter(Boolean));
  }, [simKunden]);

  const filtered = useMemo(() => {
    let rows = data;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        String(clean(r.restaurant) || '').toLowerCase().includes(q) ||
        String(clean(r.stadt) || '').toLowerCase().includes(q) ||
        String(clean(r.strasse) || '').toLowerCase().includes(q) ||
        String(clean(r.kunden_id) || '').toLowerCase().includes(q) ||
        String(clean(r.akquise_status) || '').toLowerCase().includes(q) ||
        String(clean(r.standort_status) || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'erfolgreich') rows = rows.filter(r => (clean(r.akquise_status) || '').toLowerCase().includes('erfolgreich'));
    else if (statusFilter === 'installiert') rows = rows.filter(r => (clean(r.standort_status) || '').toLowerCase().includes('installiert'));
    else if (statusFilter === 'offen') rows = rows.filter(r => !(clean(r.standort_status) || '').toLowerCase().includes('installiert'));
    else if (statusFilter === 'matched') rows = rows.filter(r => kundenIdSet.has(clean(r.kunden_id)));
    else if (statusFilter === 'unmatched') rows = rows.filter(r => !kundenIdSet.has(clean(r.kunden_id)));

    return apply(rows);
  }, [data, search, statusFilter, apply, kundenIdSet]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const erfolgreichCount = data.filter(r => (clean(r.akquise_status) || '').toLowerCase().includes('erfolgreich')).length;
  const installiertCount = data.filter(r => (clean(r.standort_status) || '').toLowerCase().includes('installiert')).length;
  const matchedCount = data.filter(r => kundenIdSet.has(clean(r.kunden_id))).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gesamt" value={data.length} icon={Store} color="#FF3B30" />
        <KpiCard label="Erfolgreich" value={erfolgreichCount} icon={CheckCircle2} color="#34C759" subtitle={`${data.length > 0 ? Math.round((erfolgreichCount / data.length) * 100) : 0}%`} />
        <KpiCard label="Installiert" value={installiertCount} icon={MapPin} color="#007AFF" />
        <KpiCard label="SIM-Matched" value={matchedCount} icon={Zap} color="#AF52DE" subtitle={`${data.length > 0 ? Math.round((matchedCount / data.length) * 100) : 0}%`} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Restaurant, Stadt, Straße, KundenID, Status..." />
        </div>
        <FilterSelect label="Filter" value={statusFilter} onChange={setStatusFilter}
          options={[
            { value: 'all', label: `Alle (${data.length})` },
            { value: 'erfolgreich', label: `Erfolgreich (${erfolgreichCount})` },
            { value: 'installiert', label: `Installiert (${installiertCount})` },
            { value: 'offen', label: 'Offen' },
            { value: 'matched', label: `SIM-Matched (${matchedCount})` },
            { value: 'unmatched', label: 'Unmatched' },
          ]} />
      </div>
      <div className="text-xs text-text-muted">{filtered.length} Standorte</div>

      <div className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-secondary/80 border-b border-border-secondary">
              <tr>
                <SortHeader col="restaurant" sortCol={sortCol} onToggle={toggle}>Restaurant</SortHeader>
                <SortHeader col="stadt" sortCol={sortCol} onToggle={toggle}>Stadt</SortHeader>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Adresse</th>
                <SortHeader col="kunden_id" sortCol={sortCol} onToggle={toggle}>JET-ID</SortHeader>
                <SortHeader col="akquise_status" sortCol={sortCol} onToggle={toggle}>Akquise</SortHeader>
                <SortHeader col="standort_status" sortCol={sortCol} onToggle={toggle}>Standort-Status</SortHeader>
                <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Rollout</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-text-muted uppercase">SIM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {pageRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted">Keine Standorte gefunden</td></tr>
              ) : pageRows.map((row, i) => {
                const kid = clean(row.kunden_id);
                const hasSimMatch = kid && kundenIdSet.has(kid);
                return (
                  <tr key={row.id || i} className="hover:bg-accent-light/30 transition-colors">
                    <td className="px-3 py-2 text-text-primary font-medium max-w-[200px] truncate" title={clean(row.restaurant) || ''}>
                      {clean(row.restaurant) || '–'}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{clean(row.stadt) || '–'}</td>
                    <td className="px-3 py-2 text-text-muted">
                      {[clean(row.strasse), clean(row.hausnummer)].filter(Boolean).join(' ') || '–'}
                      {clean(row.plz) && <span className="text-text-muted ml-1">{clean(row.plz)}</span>}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{kid || '–'}</td>
                    <td className="px-3 py-2">
                      {clean(row.akquise_status) ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          clean(row.akquise_status).toLowerCase().includes('erfolgreich') ? 'bg-status-online/10 text-green-700' :
                          clean(row.akquise_status).toLowerCase().includes('abgelehnt') ? 'bg-status-offline/10 text-red-700' :
                          'bg-surface-secondary text-text-secondary'
                        }`}>
                          {clean(row.akquise_status)}
                        </span>
                      ) : '–'}
                    </td>
                    <td className="px-3 py-2">
                      {clean(row.standort_status) ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          clean(row.standort_status).toLowerCase().includes('installiert') ? 'bg-status-online/10 text-green-700' :
                          clean(row.standort_status).toLowerCase().includes('klärung') ? 'bg-status-warning/10 text-amber-700' :
                          'bg-accent-light text-accent'
                        }`}>
                          {clean(row.standort_status)}
                        </span>
                      ) : '–'}
                    </td>
                    <td className="px-3 py-2 text-text-muted text-[10px]">{clean(row.rollout_info) || clean(row.einreichdatum) || '–'}</td>
                    <td className="px-3 py-2 text-center">
                      <MatchBadge matched={hasSimMatch} label={hasSimMatch ? 'Ja' : 'Nein'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   WARNINGS / DATA QUALITY TAB
   Each warning is expandable and shows full related records as a table.
   ═══════════════════════════════════════════════════════════════════ */

/** Detail row for a single record inside an expanded warning */
function WarningDetailRow({ label, value, mono }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[10px] font-semibold text-text-muted w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs text-text-primary ${mono ? 'font-mono' : ''} break-all`}>{String(value)}</span>
    </div>
  );
}

/** Card showing full details for one affected record */
function AffectedRecordCard({ record, type, vistarNavori, lieferando, simKunden, installationen, tasks }) {
  // Lookup related records based on the warning type
  const simMatch = record.sim_id ? simKunden.find(s => s.karten_nr === record.sim_id) : null;
  const vistarMatch = record.venue_id ? vistarNavori.find(v => v.venue_id === record.venue_id) : null;
  const kundenId = clean(simMatch?.kunden_id) || clean(record.kunden_nr);
  const liefMatch = kundenId ? lieferando.find(l => clean(l.kunden_id) === kundenId) : null;

  // Find installations for this OPS
  const opsNrStr = record.ops_nr ? String(record.ops_nr) : null;
  const instMatches = opsNrStr
    ? (installationen || []).filter(inst => String(inst.ops_nr || '') === opsNrStr)
    : [];

  // Find tasks linked to the same display_ids as the installations
  const relatedDisplayIds = new Set();
  instMatches.forEach(inst => {
    (Array.isArray(inst.display_ids) ? inst.display_ids : []).forEach(did => relatedDisplayIds.add(did));
  });
  const taskMatches = relatedDisplayIds.size > 0
    ? (tasks || []).filter(t =>
        (Array.isArray(t.display_ids) ? t.display_ids : []).some(did => relatedDisplayIds.has(did))
      )
    : [];

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-lg p-3 space-y-0.5">
      {/* OPS Info */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-text-primary">OPS {record.ops_nr || '–'}</span>
        {record.ops_sn && <span className="text-[10px] text-text-muted">{record.ops_sn}</span>}
        {record.status && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
            record.status === 'active' ? 'bg-status-online/10 text-green-700' :
            record.status === 'defect' ? 'bg-status-offline/10 text-red-700' :
            'bg-surface-secondary text-text-secondary'
          }`}>{record.status}</span>
        )}
        {instMatches.length > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700">
            <Wrench size={9} /> {instMatches.length} Installation{instMatches.length > 1 ? 'en' : ''}
          </span>
        )}
        {instMatches.length === 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-surface-secondary text-text-muted">
            Keine Installation
          </span>
        )}
      </div>

      {/* Vorbereitet Data */}
      <WarningDetailRow label="Venue-ID" value={record.venue_id} mono />
      <WarningDetailRow label="SIM-ID" value={record.sim_id} mono />
      <WarningDetailRow label="Kunden-Nr" value={record.kunden_nr} mono />
      <WarningDetailRow label="Fertig" value={record.fertig ? 'Ja' : 'Nein'} />
      <WarningDetailRow label="Vorbereitet" value={record.vorbereitet ? 'Ja' : 'Nein'} />

      {/* Installation Data from Airtable — enriched with DO-ID + Vistar/Navori status */}
      {instMatches.length > 0 && instMatches.map((inst, ii) => {
        // Determine display IDs from this installation
        const instDisplayIds = Array.isArray(inst.display_ids) ? inst.display_ids : [];

        // Check Vistar/Navori presence via venue_id from the Vorbereitet record
        const venueVistar = record.venue_id
          ? vistarNavori.find(v => v.venue_id === record.venue_id)
          : null;

        // Also try matching via kunden_id if venue_id didn't match
        const kundenVistar = !venueVistar && kundenId
          ? vistarNavori.find(v => clean(v.kunden_id) === kundenId)
          : null;
        const vistarEntry = venueVistar || kundenVistar;

        return (
          <div key={ii} className="mt-2 pt-2 border-t border-emerald-200/60">
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              <Wrench size={10} className="text-emerald-600" />
              <span className="text-[10px] font-bold text-emerald-700 uppercase">
                Installation {instMatches.length > 1 ? `#${ii + 1}` : ''} (Airtable)
              </span>
              {inst.status && (
                <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                  (inst.status || '').toLowerCase().includes('done') || (inst.status || '').toLowerCase().includes('erledigt') || (inst.status || '').toLowerCase().includes('install')
                    ? 'bg-status-online/10 text-green-700'
                    : (inst.status || '').toLowerCase().includes('cancel') || (inst.status || '').toLowerCase().includes('abge')
                    ? 'bg-status-offline/10 text-red-700'
                    : 'bg-accent-light text-accent'
                }`}>{inst.status}</span>
              )}
              {/* Vistar/Navori presence badge */}
              {vistarEntry ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-status-warning/10 text-amber-700">
                  <Monitor size={9} /> Vistar ✓
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-surface-secondary text-text-muted">
                  <Monitor size={9} /> Vistar ✗
                </span>
              )}
            </div>
            <WarningDetailRow label="Status" value={inst.status} />
            <WarningDetailRow label="Datum" value={inst.install_date ? new Date(inst.install_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null} />
            <WarningDetailRow label="Art" value={inst.installation_type} />
            <WarningDetailRow label="Integrator" value={inst.integrator} />
            <WarningDetailRow label="Techniker" value={Array.isArray(inst.technicians) ? inst.technicians.join(', ') : inst.technicians} />
            <WarningDetailRow label="Start" value={inst.install_start ? new Date(inst.install_start).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null} />
            <WarningDetailRow label="Ende" value={inst.install_end ? new Date(inst.install_end).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null} />
            <WarningDetailRow label="Screen" value={[inst.screen_type, inst.screen_size].filter(Boolean).join(' – ') || null} />
            <WarningDetailRow label="SIM (Install)" value={inst.sim_id} mono />
            {/* DO-IDs from installation */}
            {instDisplayIds.length > 0 && (
              <WarningDetailRow label="DO-ID (Install)" value={instDisplayIds.join(', ')} mono />
            )}
            {/* Vistar/Navori DO-ID if matched */}
            {vistarEntry && (
              <>
                <WarningDetailRow label="DO-ID (Vistar)" value={vistarEntry.do_id} mono />
                <WarningDetailRow label="Vistar Name" value={vistarEntry.name} />
                <WarningDetailRow label="Vistar KundenID" value={clean(vistarEntry.kunden_id)} mono />
              </>
            )}
            {!vistarEntry && (
              <WarningDetailRow label="Vistar/Navori" value="Kein Eintrag gefunden" />
            )}
            <WarningDetailRow label="Bemerkungen" value={inst.remarks} />
          </div>
        );
      })}

      {/* SIM Data */}
      {simMatch && (
        <div className="mt-2 pt-2 border-t border-border-secondary">
          <div className="flex items-center gap-1 mb-1">
            <CreditCard size={10} className="text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase">SIM-Karte</span>
          </div>
          <WarningDetailRow label="ICCID" value={simMatch.karten_nr} mono />
          <WarningDetailRow label="JET-ID" value={clean(simMatch.kunden_id)} mono />
          <WarningDetailRow label="Aktiviert" value={simMatch.aktivierungsdatum ? new Date(simMatch.aktivierungsdatum).toLocaleDateString('de-DE') : null} />
        </div>
      )}

      {/* Vistar Data */}
      {vistarMatch && (
        <div className="mt-2 pt-2 border-t border-border-secondary">
          <div className="flex items-center gap-1 mb-1">
            <Monitor size={10} className="text-status-warning" />
            <span className="text-[10px] font-bold text-status-warning uppercase">Vistar/Navori</span>
          </div>
          <WarningDetailRow label="Name" value={vistarMatch.name} />
          <WarningDetailRow label="Kunden-ID" value={clean(vistarMatch.kunden_id)} mono />
          <WarningDetailRow label="DO-ID" value={vistarMatch.do_id} mono />
        </div>
      )}

      {/* Lieferando Data */}
      {liefMatch && (
        <div className="mt-2 pt-2 border-t border-border-secondary">
          <div className="flex items-center gap-1 mb-1">
            <Store size={10} className="text-status-offline" />
            <span className="text-[10px] font-bold text-status-offline uppercase">Lieferando Standort</span>
          </div>
          <WarningDetailRow label="Restaurant" value={clean(liefMatch.restaurant)} />
          <WarningDetailRow label="Adresse" value={[clean(liefMatch.strasse), clean(liefMatch.hausnummer)].filter(Boolean).join(' ')} />
          <WarningDetailRow label="PLZ / Stadt" value={[clean(liefMatch.plz), clean(liefMatch.stadt)].filter(Boolean).join(' ')} />
          <WarningDetailRow label="Akquise" value={clean(liefMatch.akquise_status)} />
          <WarningDetailRow label="Standort" value={clean(liefMatch.standort_status)} />
          <WarningDetailRow label="Einreichdatum" value={clean(liefMatch.einreichdatum)} />
          <WarningDetailRow label="Rollout" value={clean(liefMatch.rollout_info)} />
          <WarningDetailRow label="Installation" value={clean(liefMatch.installationsart)} />
        </div>
      )}

      {/* Tasks linked to same Display IDs */}
      {taskMatches.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border-secondary">
          <div className="flex items-center gap-1 mb-1">
            <Calendar size={10} className="text-accent" />
            <span className="text-[10px] font-bold text-accent uppercase">
              Tasks ({taskMatches.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {taskMatches.slice(0, 5).map((task, ti) => (
              <div key={ti} className="flex items-start gap-2 py-1 px-2 bg-accent-light/50 rounded-md">
                <span className={`flex-shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                  task.status === 'Completed' ? 'bg-status-online' :
                  task.status === 'In Progress' ? 'bg-accent' :
                  task.priority === 'Urgent' ? 'bg-status-offline' :
                  task.priority === 'High' ? 'bg-status-warning' :
                  'bg-text-muted'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-medium text-text-primary truncate">{task.title}</span>
                    <span className={`inline-flex items-center px-1 py-0 rounded text-[8px] font-bold uppercase ${
                      task.status === 'Completed' ? 'bg-status-online/10 text-green-700' :
                      task.status === 'In Progress' ? 'bg-accent-light text-blue-700' :
                      task.status === 'Follow Up' ? 'bg-status-warning/10 text-amber-700' :
                      'bg-surface-secondary text-text-secondary'
                    }`}>{task.status}</span>
                    {task.priority && (
                      <span className={`inline-flex items-center px-1 py-0 rounded text-[8px] font-bold uppercase ${
                        task.priority === 'Urgent' ? 'bg-status-offline/10 text-red-700' :
                        task.priority === 'High' ? 'bg-status-warning/10 text-orange-700' :
                        'bg-surface-secondary text-text-muted'
                      }`}>{task.priority}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-muted">
                    {task.responsible_user && <span>Verantwortlich: {task.responsible_user}</span>}
                    {task.due_date && <span>Fällig: {new Date(task.due_date).toLocaleDateString('de-DE')}</span>}
                    {task.install_date && <span>Install: {new Date(task.install_date).toLocaleDateString('de-DE')}</span>}
                  </div>
                  {task.nacharbeit_kommentar && (
                    <p className="text-[10px] text-text-muted mt-0.5 italic">Nacharbeit: {task.nacharbeit_kommentar}</p>
                  )}
                  {task.install_remarks && (
                    <p className="text-[10px] text-text-muted mt-0.5 italic">Install-Bemerkung: {task.install_remarks}</p>
                  )}
                </div>
              </div>
            ))}
            {taskMatches.length > 5 && (
              <p className="text-[10px] text-text-muted italic px-2">+ {taskMatches.length - 5} weitere Tasks</p>
            )}
          </div>
        </div>
      )}

      {/* If no related data found at all */}
      {!simMatch && !vistarMatch && !liefMatch && instMatches.length === 0 && taskMatches.length === 0 && !record.venue_id && !record.sim_id && (
        <div className="text-[10px] text-text-muted italic mt-1">Keine verknüpften Daten gefunden</div>
      )}
    </div>
  );
}

function WarningsTab({ vorbereitet, simKunden, vistarNavori, lieferando, opsData, installationen, tasks }) {
  const [expanded, setExpanded] = useState({});

  const toggleExpand = (idx) => {
    setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Build lookup maps for enrichment
  const opsMap = useMemo(() => {
    const m = new Map();
    (opsData || []).forEach(o => { if (o.ops_nr) m.set(String(o.ops_nr), o); });
    return m;
  }, [opsData]);

  const vorbMap = useMemo(() => {
    const m = new Map();
    vorbereitet.forEach(v => { if (v.ops_nr) m.set(String(v.ops_nr), v); });
    return m;
  }, [vorbereitet]);

  const warnings = useMemo(() => {
    const w = [];

    // 1. Duplicate SIM assignments (same SIM in multiple Vorbereitet entries)
    const simCounts = new Map();
    vorbereitet.forEach(v => {
      if (v.sim_id) {
        if (!simCounts.has(v.sim_id)) simCounts.set(v.sim_id, []);
        simCounts.get(v.sim_id).push(v);
      }
    });
    simCounts.forEach((records, simId) => {
      if (records.length > 1) {
        w.push({
          type: 'duplicate_sim',
          severity: 'error',
          message: `SIM …${simId.slice(-8)} ist ${records.length} OPS zugeordnet`,
          detail: `OPS-Nummern: ${records.map(r => r.ops_nr).join(', ')} — gleiche SIM-Karte darf nur einem Gerät zugeordnet sein.`,
          records: records.map(r => ({
            ...r,
            status: opsMap.get(String(r.ops_nr))?.status || null,
            hardware_type: opsMap.get(String(r.ops_nr))?.hardware_type || null,
          })),
          affectedCount: records.length,
        });
      }
    });

    // 2. Duplicate Venue assignments (same Venue → multiple OPS)
    const venueCounts = new Map();
    vorbereitet.forEach(v => {
      if (v.venue_id) {
        if (!venueCounts.has(v.venue_id)) venueCounts.set(v.venue_id, []);
        venueCounts.get(v.venue_id).push(v);
      }
    });
    venueCounts.forEach((records, venueId) => {
      if (records.length > 1) {
        w.push({
          type: 'duplicate_venue',
          severity: 'warning',
          message: `Venue ${venueId.slice(0, 12)}… hat ${records.length} OPS-Geräte`,
          detail: `OPS-Nummern: ${records.map(r => r.ops_nr).join(', ')} — nur ein Gerät pro Venue erwartet.`,
          records: records.map(r => ({
            ...r,
            status: opsMap.get(String(r.ops_nr))?.status || null,
          })),
          affectedCount: records.length,
        });
      }
    });

    // 3. OPS in NocoDB (Vorbereitet) but not in Airtable (hardware_ops)
    const opsSet = new Set((opsData || []).map(o => String(o.ops_nr || '')).filter(Boolean));
    const unmatchedVorbereitet = vorbereitet.filter(v => v.ops_nr && !opsSet.has(String(v.ops_nr)));
    if (unmatchedVorbereitet.length > 0) {
      w.push({
        type: 'unmatched_ops',
        severity: 'warning',
        message: `${unmatchedVorbereitet.length} OPS in NocoDB aber nicht in Airtable`,
        detail: 'Diese Geräte existieren in NocoDB-Vorbereitet, haben aber keinen Eintrag in hardware_ops (Airtable).',
        records: unmatchedVorbereitet.slice(0, 20),
        affectedCount: unmatchedVorbereitet.length,
      });
    }

    // 4. OPS in Airtable but not in NocoDB
    const vorbOpsSet = new Set(vorbereitet.map(v => String(v.ops_nr || '')).filter(Boolean));
    const unmatchedHwOps = (opsData || []).filter(o => o.ops_nr && !vorbOpsSet.has(String(o.ops_nr)));
    if (unmatchedHwOps.length > 0) {
      w.push({
        type: 'unmatched_hw',
        severity: 'info',
        message: `${unmatchedHwOps.length} OPS in Airtable aber nicht in NocoDB`,
        detail: 'Diese Geräte existieren in hardware_ops (Airtable), haben aber keinen Eintrag in NocoDB-Vorbereitet.',
        records: unmatchedHwOps.slice(0, 20).map(o => ({
          ops_nr: o.ops_nr,
          ops_sn: o.serial_number || o.sn || null,
          status: o.status,
          hardware_type: o.hardware_type,
        })),
        affectedCount: unmatchedHwOps.length,
      });
    }

    // 5. Lieferando KundenID still dirty
    const dirtyLieferando = lieferando.filter(l => {
      const kid = String(l.kunden_id || '');
      return kid.includes('{') || kid.includes('"');
    });
    if (dirtyLieferando.length > 0) {
      w.push({
        type: 'dirty_kunden_id',
        severity: 'warning',
        message: `${dirtyLieferando.length} Lieferando-Einträge mit unsauberer KundenID`,
        detail: 'KundenID im Format {"..."} in der DB. Wird im Frontend bereinigt, sollte aber auch in der DB normalisiert werden.',
        records: dirtyLieferando.slice(0, 10).map(l => ({
          ops_nr: null,
          restaurant: clean(l.restaurant),
          stadt: clean(l.stadt),
          kunden_id_raw: l.kunden_id,
          kunden_id_clean: clean(l.kunden_id),
          standort_status: clean(l.standort_status),
        })),
        affectedCount: dirtyLieferando.length,
      });
    }

    // 6. Vorbereitet without SIM
    const noSim = vorbereitet.filter(v => !v.sim_id && v.ops_nr);
    if (noSim.length > 0) {
      w.push({
        type: 'missing_sim',
        severity: 'info',
        message: `${noSim.length} Vorbereitet-Einträge ohne SIM-ID`,
        detail: 'Diesen OPS-Geräten ist keine SIM-Karte zugeordnet.',
        records: noSim.slice(0, 20).map(v => ({
          ...v,
          status: opsMap.get(String(v.ops_nr))?.status || null,
        })),
        affectedCount: noSim.length,
      });
    }

    // 7. Vorbereitet without Venue
    const noVenue = vorbereitet.filter(v => !v.venue_id && v.ops_nr);
    if (noVenue.length > 0) {
      w.push({
        type: 'missing_venue',
        severity: 'info',
        message: `${noVenue.length} Vorbereitet-Einträge ohne Venue-ID`,
        detail: 'Diesen OPS-Geräten ist kein Standort (Venue) zugeordnet.',
        records: noVenue.slice(0, 20).map(v => ({
          ...v,
          status: opsMap.get(String(v.ops_nr))?.status || null,
        })),
        affectedCount: noVenue.length,
      });
    }

    // Sort: errors first, then warnings, then info
    const severityOrder = { error: 0, warning: 1, info: 2 };
    w.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return w;
  }, [vorbereitet, simKunden, vistarNavori, lieferando, opsData, opsMap]);

  const errorCount = warnings.filter(w => w.severity === 'error').length;
  const warnCount = warnings.filter(w => w.severity === 'warning').length;
  const infoCount = warnings.filter(w => w.severity === 'info').length;

  const severityConfig = {
    error: { bg: 'bg-status-offline/10 border-status-offline/20', bgExpanded: 'bg-status-offline/10/50', icon: XCircle, iconColor: 'text-status-offline', label: 'Fehler' },
    warning: { bg: 'bg-status-warning/10 border-status-warning/20', bgExpanded: 'bg-status-warning/10/50', icon: AlertTriangle, iconColor: 'text-status-warning', label: 'Warnung' },
    info: { bg: 'bg-accent-light border-accent/20', bgExpanded: 'bg-accent-light/50', icon: Eye, iconColor: 'text-accent', label: 'Info' },
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Fehler" value={errorCount} icon={XCircle} color="#FF3B30" />
        <KpiCard label="Warnungen" value={warnCount} icon={AlertTriangle} color="#FF9500" />
        <KpiCard label="Hinweise" value={infoCount} icon={Eye} color="#007AFF" />
      </div>

      {warnings.length === 0 ? (
        <div className="bg-status-online/10 border border-status-online/20 rounded-xl p-6 text-center">
          <CheckCircle2 size={32} className="text-status-online mx-auto mb-2" />
          <p className="text-sm font-medium text-green-700">Keine Datenqualitätsprobleme gefunden</p>
          <p className="text-xs text-status-online mt-1">Alle Zuordnungen sind konsistent.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {warnings.map((w, i) => {
            const cfg = severityConfig[w.severity];
            const WarnIcon = cfg.icon;
            const isExpanded = !!expanded[i];
            const isDuplicate = w.type === 'duplicate_sim' || w.type === 'duplicate_venue';
            const isDirtyKid = w.type === 'dirty_kunden_id';

            return (
              <div key={i} className={`${cfg.bg} border rounded-xl overflow-hidden`}>
                {/* Header — clickable */}
                <button
                  onClick={() => toggleExpand(i)}
                  className="w-full p-4 flex items-start gap-3 text-left hover:brightness-95 transition"
                >
                  <WarnIcon size={18} className={`${cfg.iconColor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold ${cfg.iconColor}`}>{cfg.label}</span>
                    </div>
                    <p className="text-sm font-medium text-text-primary">{w.message}</p>
                    <p className="text-xs text-text-muted mt-1">{w.detail}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-text-muted">{w.affectedCount} betroffen</span>
                    <ChevronRight size={16} className={`text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && w.records && w.records.length > 0 && (
                  <div className={`${cfg.bgExpanded} border-t border-border-secondary/40 px-4 pb-4 pt-3`}>
                    <p className="text-[10px] font-bold text-text-muted mb-3">
                      Betroffene Datensätze {w.affectedCount > w.records.length && `(${w.records.length} von ${w.affectedCount} angezeigt)`}
                    </p>

                    {/* For duplicate SIM / Venue: show each record as a detail card */}
                    {(isDuplicate || w.type === 'unmatched_ops' || w.type === 'missing_sim' || w.type === 'missing_venue') && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {w.records.map((rec, ri) => (
                          <AffectedRecordCard
                            key={ri}
                            record={rec}
                            type={w.type}
                            vistarNavori={vistarNavori}
                            lieferando={lieferando}
                            simKunden={simKunden}
                            installationen={installationen}
                            tasks={tasks}
                          />
                        ))}
                      </div>
                    )}

                    {/* For unmatched HW (Airtable only): simple table */}
                    {w.type === 'unmatched_hw' && (
                      <div className="bg-surface-primary border border-border-secondary rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-surface-secondary/80 border-b border-border-secondary">
                            <tr>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">OPS Nr.</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Seriennummer</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Status</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Typ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/60">
                            {w.records.map((rec, ri) => (
                              <tr key={ri} className="hover:bg-accent-light/30">
                                <td className="px-3 py-2 font-bold text-text-primary">{rec.ops_nr}</td>
                                <td className="px-3 py-2 text-text-secondary">{rec.ops_sn || '–'}</td>
                                <td className="px-3 py-2">
                                  {rec.status ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                      rec.status === 'active' ? 'bg-status-online/10 text-green-700' :
                                      rec.status === 'defect' ? 'bg-status-offline/10 text-red-700' :
                                      'bg-surface-secondary text-text-secondary'
                                    }`}>{rec.status}</span>
                                  ) : '–'}
                                </td>
                                <td className="px-3 py-2 text-text-secondary">{rec.hardware_type || '–'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* For dirty KundenIDs: show raw vs clean */}
                    {isDirtyKid && (
                      <div className="bg-surface-primary border border-border-secondary rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-surface-secondary/80 border-b border-border-secondary">
                            <tr>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Restaurant</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Stadt</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">KundenID (roh)</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">KundenID (bereinigt)</th>
                              <th className="px-3 py-2 text-left text-[10px] font-semibold text-text-muted uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/60">
                            {w.records.map((rec, ri) => (
                              <tr key={ri} className="hover:bg-accent-light/30">
                                <td className="px-3 py-2 text-text-primary font-medium">{rec.restaurant || '–'}</td>
                                <td className="px-3 py-2 text-text-secondary">{rec.stadt || '–'}</td>
                                <td className="px-3 py-2 text-status-offline text-[10px]">{rec.kunden_id_raw || '–'}</td>
                                <td className="px-3 py-2 text-green-700 text-[10px]">{rec.kunden_id_clean || '–'}</td>
                                <td className="px-3 py-2 text-text-muted">{rec.standort_status || '–'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════════ */

function EmptyState({ onSync, syncing }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Database size={48} className="text-text-muted mb-4" />
      <p className="text-text-muted text-sm mb-4 max-w-md">
        Noch keine NocoDB-Daten synchronisiert. Klicke &apos;Sync jetzt&apos; um die Daten abzurufen.
      </p>
      <button
        onClick={onSync}
        disabled={syncing}
        className="px-4 py-2 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/80 disabled:opacity-50 flex items-center gap-2"
      >
        {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        Sync jetzt
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function NocoDBPanel() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // Data state
  const [vorbereitet, setVorbereitet] = useState([]);
  const [simKunden, setSimKunden] = useState([]);
  const [vistarNavori, setVistarNavori] = useState([]);
  const [lieferando, setLieferando] = useState([]);
  const [syncMeta, setSyncMeta] = useState(null);
  const [opsData, setOpsData] = useState([]);
  const [installationen, setInstallationen] = useState([]);
  const [tasks, setTasks] = useState([]);

  /* ─── Load all data from Supabase ─────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Helper: fetch from proxy for RLS-blocked tables
      const fetchProxy = async (table, select, order) => {
        try {
          let url = `/api/supabase-proxy?table=${table}`;
          if (select) url += `&select=${encodeURIComponent(select)}`;
          if (order) url += `&order=${encodeURIComponent(order)}`;
          const res = await fetch(url);
          if (!res.ok) {
            console.warn(`[NocoDBPanel] Proxy ${table}: ${res.status}`);
            // Fallback to direct Supabase (works if RLS is fixed later)
            let q = supabase.from(table).select(select || '*').limit(5000);
            if (order) q = q.order(order.split('.')[0], { ascending: order.includes('.asc') });
            const { data } = await q;
            return data || [];
          }
          return await res.json();
        } catch (e) {
          console.warn(`[NocoDBPanel] Proxy ${table} error:`, e.message);
          return [];
        }
      };

      const results = await Promise.allSettled([
        supabase.from('nocodb_vorbereitet').select('*').order('ops_nr', { ascending: true }).limit(5000), // Full table load — all fields needed for NocoDB panel
        supabase.from('nocodb_sim_kunden').select('*').order('karten_nr', { ascending: true }).limit(5000), // Full table load — all fields needed for NocoDB panel
        supabase.from('nocodb_vistar_navori').select('*').order('name', { ascending: true }).limit(5000), // Full table load — all fields needed for NocoDB panel
        supabase.from('nocodb_lieferando').select('*').order('restaurant', { ascending: true }).limit(5000), // Full table load — all fields needed for NocoDB panel
        supabase.from('sync_metadata').select('table_name,updated_at,last_sync_timestamp,last_sync_status,records_fetched').eq('table_name', 'nocodb_all').order('updated_at', { ascending: false }).limit(1),
        supabase.from('hardware_ops').select('ops_nr,serial_number,status,hardware_type,display_location_id').limit(5000),
        fetchProxy('installationen', 'id,ops_nr,install_date,status,installation_type,integrator,technicians,sim_id,install_start,install_end,screen_type,screen_size,remarks,display_ids'),
        fetchProxy('tasks', 'title,status,priority,due_date,description,display_ids,location_names,responsible_user,created_time,install_date,install_remarks,nacharbeit_kommentar', 'created_time.desc'),
      ]);

      const extract = (result, label) => {
        if (result.status === 'fulfilled') return result.value;
        console.error(`[NocoDBPanel] Query "${label}" failed:`, result.reason);
        return null;
      };

      const vorbRes = extract(results[0], 'nocodb_vorbereitet');
      const simRes = extract(results[1], 'nocodb_sim_kunden');
      const vistarRes = extract(results[2], 'nocodb_vistar_navori');
      const liefRes = extract(results[3], 'nocodb_lieferando');
      const metaRes = extract(results[4], 'sync_metadata');
      const opsRes = extract(results[5], 'hardware_ops');
      const instData = extract(results[6], 'installationen');
      const taskData = extract(results[7], 'tasks');

      setVorbereitet(vorbRes?.data || []);
      setSimKunden(simRes?.data || []);
      setVistarNavori(vistarRes?.data || []);
      setLieferando(liefRes?.data || []);
      setSyncMeta(metaRes?.data?.[0] || null);
      setOpsData(opsRes?.data || []);
      setInstallationen(instData || []);
      setTasks(taskData || []);
    } catch (err) {
      console.error('[NocoDBPanel] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─── Trigger NocoDB Sync ─────────────────────────────────────── */
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/sync-nocodb');
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Sync fehlgeschlagen (${res.status})`);
      }
      // Reload data after sync
      await loadData();
    } catch (err) {
      console.error('[NocoDBPanel] Sync error:', err);
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  }, [loadData]);

  /* ─── Check if any data exists ─────────────────────────────────── */
  const hasData = vorbereitet.length > 0 || simKunden.length > 0 || vistarNavori.length > 0 || lieferando.length > 0;

  /* ─── Loading State ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-sm p-8">
        <div className="flex items-center justify-center gap-3 py-12">
          <Loader2 size={20} className="animate-spin text-accent" />
          <span className="text-sm text-text-muted">NocoDB-Daten werden geladen...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-sm">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Database size={18} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">NocoDB Daten</h2>
              <p className="text-xs text-text-muted">Vorbereitet, SIM, Vistar/Navori &amp; Lieferando</p>
            </div>
          </div>
          {syncError && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-status-offline/10 border border-status-offline/20 text-xs text-status-offline">
              <AlertTriangle size={12} />
              {syncError}
            </div>
          )}
        </div>

        {/* ─── Sub-Tab Navigation ─────────────────────────────────── */}
        <div className="flex gap-1 border-b border-border-secondary -mx-5 px-5 overflow-x-auto">
          {SUB_TABS.map(({ key, label, icon: TabIcon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`
                px-3 py-2 rounded-t-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap
                ${activeTab === key
                  ? 'bg-surface-primary text-accent border border-border-secondary border-b-white -mb-px'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-primary/60'
                }
              `}
            >
              <TabIcon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tab Content ────────────────────────────────────────── */}
      <div className="p-5">
        {!hasData && activeTab !== 'overview' ? (
          <EmptyState onSync={handleSync} syncing={syncing} />
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                vorbereitet={vorbereitet}
                simKunden={simKunden}
                vistarNavori={vistarNavori}
                lieferando={lieferando}
                syncMeta={syncMeta}
                opsData={opsData}
                onSync={handleSync}
                syncing={syncing}
              />
            )}
            {activeTab === 'matching' && (
              <MatchingTab
                vorbereitet={vorbereitet}
                simKunden={simKunden}
                vistarNavori={vistarNavori}
                lieferando={lieferando}
                opsData={opsData}
              />
            )}
            {activeTab === 'vorbereitet' && (
              <VorbereitetTab data={vorbereitet} opsData={opsData} />
            )}
            {activeTab === 'sim' && (
              <SimKartenTab data={simKunden} vorbereitet={vorbereitet} />
            )}
            {activeTab === 'vistar' && (
              <VistarNavoriTab data={vistarNavori} />
            )}
            {activeTab === 'lieferando' && (
              <LieferandoTab data={lieferando} simKunden={simKunden} />
            )}
            {activeTab === 'warnings' && (
              <WarningsTab
                vorbereitet={vorbereitet}
                simKunden={simKunden}
                vistarNavori={vistarNavori}
                lieferando={lieferando}
                opsData={opsData}
                installationen={installationen}
                tasks={tasks}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
