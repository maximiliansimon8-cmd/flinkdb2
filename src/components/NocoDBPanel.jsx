import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Database, Search, RefreshCw, Loader2, CheckCircle2, XCircle,
  Copy, Clock, BarChart3, CreditCard, MapPin, Layers,
  AlertTriangle, ArrowUpDown, Monitor,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/* ═══════════════════════════════════════════════════════════════════
   NocoDB Panel — Cached NocoDB data from Supabase
   Sub-tabs: Übersicht, Vorbereitet, SIM-Karten, Vistar/Navori
   ═══════════════════════════════════════════════════════════════════ */

const SUB_TABS = [
  { key: 'overview',    label: 'Übersicht',      icon: BarChart3 },
  { key: 'vorbereitet', label: 'Vorbereitet',     icon: Layers },
  { key: 'sim',         label: 'SIM-Karten',      icon: CreditCard },
  { key: 'vistar',      label: 'Vistar/Navori',   icon: Monitor },
];

/* ─── KPI Card ──────────────────────────────────────────────────── */

function KpiCard({ label, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-800 font-mono">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

/* ─── Empty State ───────────────────────────────────────────────── */

function EmptyState({ onSync, syncing }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Database size={48} className="text-slate-300 mb-4" />
      <p className="text-slate-500 text-sm mb-4 max-w-md">
        Noch keine NocoDB-Daten synchronisiert. Klicke &apos;Sync jetzt&apos; um die Daten abzurufen.
      </p>
      <button
        onClick={onSync}
        disabled={syncing}
        className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
      >
        {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        Sync jetzt
      </button>
    </div>
  );
}

/* ─── Copyable Cell ─────────────────────────────────────────────── */

function CopyCell({ value, truncate }) {
  const [copied, setCopied] = useState(false);
  const display = truncate && value && value.length > truncate
    ? value.slice(0, truncate) + '...'
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
          ? <CheckCircle2 size={12} className="text-green-500" />
          : <Copy size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
      )}
    </span>
  );
}

/* ─── Boolean Badge ─────────────────────────────────────────────── */

function BoolBadge({ value }) {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'yes' || value === 'ja') {
    return <CheckCircle2 size={16} className="text-green-500" />;
  }
  return <XCircle size={16} className="text-slate-300" />;
}

/* ─── Matched Badge ─────────────────────────────────────────────── */

function MatchBadge({ matched }) {
  return matched ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
      <CheckCircle2 size={10} /> Matched
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
      <AlertTriangle size={10} /> Unmatched
    </span>
  );
}

/* ─── Search Bar ────────────────────────────────────────────────── */

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 rounded-lg text-xs bg-white/60 backdrop-blur-sm border border-slate-200/60 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
      />
    </div>
  );
}

/* ─── Filter Select ─────────────────────────────────────────────── */

function FilterSelect({ value, onChange, options, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-lg text-xs bg-white/60 backdrop-blur-sm border border-slate-200/60 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ─── Shared Sort Hook ─────────────────────────────────────────── */

function useSort() {
  const [sortCol, setSortCol] = useState(null);
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
      className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none"
      onClick={() => onToggle(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown size={10} className={sortCol === col ? 'text-blue-500' : 'text-slate-300'} />
      </span>
    </th>
  );
}

/* ─── Table Overflow Footer ────────────────────────────────────── */

const MAX_ROWS = 200;

function TableOverflow({ total }) {
  if (total <= MAX_ROWS) return null;
  return (
    <div className="px-4 py-2 bg-slate-50/80 border-t border-slate-200/60 text-xs text-slate-500 text-center">
      Zeige {MAX_ROWS} von {total} Einträgen. Nutze die Suche zum Filtern.
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

function OverviewTab({ vorbereitet, simKunden, vistarNavori, syncMeta, opsData, onSync, syncing }) {
  const totalVorbereitet = vorbereitet.length;
  const matchedOps = useMemo(() => {
    if (!opsData || opsData.length === 0) return 0;
    const opsSet = new Set(opsData.map((o) => String(o.ops_nr || o.opsNr || '')).filter(Boolean));
    return vorbereitet.filter((v) => opsSet.has(String(v.ops_nr || ''))).length;
  }, [vorbereitet, opsData]);
  const totalSim = simKunden.length;
  const totalVistar = vistarNavori.length;

  const lastSync = syncMeta?.last_synced_at
    ? new Date(syncMeta.last_synced_at).toLocaleString('de-DE')
    : 'Nie';

  const matchRate = totalVorbereitet > 0
    ? Math.round((matchedOps / totalVorbereitet) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Vorbereitet" value={totalVorbereitet} icon={Layers} color="#3b82f6" />
        <KpiCard label="Matched OPS" value={matchedOps} icon={CheckCircle2} color="#22c55e" subtitle={`${matchRate}% Match-Rate`} />
        <KpiCard label="SIM-Karten" value={totalSim} icon={CreditCard} color="#8b5cf6" />
        <KpiCard label="Vistar Venues" value={totalVistar} icon={Monitor} color="#f59e0b" />
        <KpiCard
          label="Lieferando"
          value={vistarNavori.filter((v) => (v.name || '').toLowerCase().includes('lieferando')).length}
          icon={MapPin}
          color="#ef4444"
        />
        <KpiCard label="Letzter Sync" value={lastSync === 'Nie' ? '–' : ''} icon={Clock} color="#64748b" subtitle={lastSync} />
      </div>

      {/* Sync Button */}
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">NocoDB Synchronisation</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Daten aus NocoDB werden gecached. Klicke Sync um die neuesten Daten abzurufen.
            </p>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Synchronisiere...' : 'Sync jetzt'}
          </button>
        </div>
        {syncMeta?.status && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className={`w-2 h-2 rounded-full ${syncMeta.status === 'success' ? 'bg-green-400' : syncMeta.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-red-400'}`} />
            Status: {syncMeta.status === 'success' ? 'Erfolgreich' : syncMeta.status === 'running' ? 'Laufend...' : syncMeta.status}
            {syncMeta.records_synced != null && ` | ${syncMeta.records_synced} Records`}
          </div>
        )}
      </div>

      {/* Matching Quality */}
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-500" />
          Matching-Qualität
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Vorbereitet vs OPS */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Vorbereitet vs. OPS</span>
              <span className="font-medium text-slate-800">{matchedOps}/{totalVorbereitet}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${matchRate}%` }}
              />
            </div>
          </div>
          {/* SIM Matching */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">SIM-Karten zugeordnet</span>
              <span className="font-medium text-slate-800">{totalSim}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
          {/* Vistar Venues */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Vistar/Navori Venues</span>
              <span className="font-medium text-slate-800">{totalVistar}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
        </div>
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
        String(r.venue_id || '').toLowerCase().includes(q)
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

  const thStatic = "px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider";
  const thCenter = "px-3 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="OpsNr, KundenNr, SimID, VenueID..." />
        </div>
        <div className="flex items-center gap-3">
          <FilterSelect label="Fertig" value={fertigFilter} onChange={setFertigFilter}
            options={[{ value: 'all', label: 'Alle' }, { value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} />
          <FilterSelect label="Vorbereitet" value={vorbereitetFilter} onChange={setVorbereitetFilter}
            options={[{ value: 'all', label: 'Alle' }, { value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }]} />
        </div>
      </div>
      <div className="text-xs text-slate-500">{filtered.length} von {data.length} Einträgen</div>
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
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
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Keine Einträge gefunden</td></tr>
              ) : filtered.slice(0, MAX_ROWS).map((row, i) => (
                <tr key={row.id || i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2 font-mono font-medium text-slate-800">{row.ops_nr || '–'}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{row.ops_sn || '–'}</td>
                  <td className="px-3 py-2"><CopyCell value={row.venue_id} truncate={12} /></td>
                  <td className="px-3 py-2 font-mono text-slate-600">{row.sim_id ? '...' + String(row.sim_id).slice(-6) : '–'}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{row.kunden_nr || '–'}</td>
                  <td className="px-3 py-2 text-center"><BoolBadge value={row.fertig} /></td>
                  <td className="px-3 py-2 text-center"><BoolBadge value={row.vorbereitet} /></td>
                  <td className="px-3 py-2 text-center"><MatchBadge matched={opsSet.has(String(row.ops_nr || ''))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableOverflow total={filtered.length} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SIM-KARTEN TAB
   ═══════════════════════════════════════════════════════════════════ */

function SimKartenTab({ data, simInventory }) {
  const [search, setSearch] = useState('');
  const { sortCol, toggle, apply } = useSort();

  const simSet = useMemo(() => {
    if (!simInventory?.length) return new Set();
    return new Set(simInventory.map((s) => String(s.iccid || s.sim_id || s.kartenNr || '')).filter(Boolean));
  }, [simInventory]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Karten Nr. oder KundenID..." />
        </div>
        <div className="text-xs text-slate-500 flex items-center">
          {filtered.length} von {data.length} SIM-Karten
        </div>
      </div>
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <SortHeader col="karten_nr" sortCol={sortCol} onToggle={toggle}>Karten Nr. (ICCID)</SortHeader>
                <SortHeader col="kunden_id" sortCol={sortCol} onToggle={toggle}>KundenID</SortHeader>
                <SortHeader col="aktivierungsdatum" sortCol={sortCol} onToggle={toggle}>Aktivierungsdatum</SortHeader>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Matched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Keine SIM-Karten gefunden</td></tr>
              ) : filtered.slice(0, MAX_ROWS).map((row, i) => (
                <tr key={row.id || i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2"><CopyCell value={row.karten_nr} /></td>
                  <td className="px-3 py-2 font-mono text-slate-600">{row.kunden_id || '–'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.aktivierungsdatum ? new Date(row.aktivierungsdatum).toLocaleDateString('de-DE') : '–'}
                  </td>
                  <td className="px-3 py-2 text-center"><MatchBadge matched={simSet.has(String(row.karten_nr || ''))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableOverflow total={filtered.length} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VISTAR / NAVORI TAB
   ═══════════════════════════════════════════════════════════════════ */

function VistarNavoriTab({ data }) {
  const [search, setSearch] = useState('');
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Venue ID, Name, Kunden ID, DO-ID..." />
        </div>
        <div className="text-xs text-slate-500 flex items-center">
          {filtered.length} von {data.length} Venues
        </div>
      </div>
      <div className="bg-white/60 backdrop-blur-sm border border-slate-200/60 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/60">
              <tr>
                <SortHeader col="venue_id" sortCol={sortCol} onToggle={toggle}>Venue ID</SortHeader>
                <SortHeader col="name" sortCol={sortCol} onToggle={toggle}>Name</SortHeader>
                <SortHeader col="kunden_id" sortCol={sortCol} onToggle={toggle}>Kunden ID</SortHeader>
                <SortHeader col="do_id" sortCol={sortCol} onToggle={toggle}>DO-ID</SortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60">
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Keine Venues gefunden</td></tr>
              ) : filtered.slice(0, MAX_ROWS).map((row, i) => (
                <tr key={row.id || i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2"><CopyCell value={row.venue_id} truncate={16} /></td>
                  <td className="px-3 py-2 text-slate-800 font-medium">{row.name || '–'}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{row.kunden_id || '–'}</td>
                  <td className="px-3 py-2"><CopyCell value={row.do_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableOverflow total={filtered.length} />
      </div>
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
  const [syncMeta, setSyncMeta] = useState(null);
  const [opsData, setOpsData] = useState([]);

  /* ─── Load all data from Supabase ─────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vorbRes, simRes, vistarRes, metaRes, opsRes] = await Promise.all([
        supabase.from('nocodb_vorbereitet').select('*').order('created_at', { ascending: false }),
        supabase.from('nocodb_sim_kunden').select('*').order('created_at', { ascending: false }),
        supabase.from('nocodb_vistar_navori').select('*').order('name', { ascending: true }),
        supabase.from('sync_metadata').select('*').eq('source', 'nocodb').order('last_synced_at', { ascending: false }).limit(1),
        supabase.from('hardware_ops').select('ops_nr').limit(5000),
      ]);

      setVorbereitet(vorbRes.data || []);
      setSimKunden(simRes.data || []);
      setVistarNavori(vistarRes.data || []);
      setSyncMeta(metaRes.data?.[0] || null);
      setOpsData(opsRes.data || []);
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
      const res = await fetch('/.netlify/functions/sync-nocodb', { method: 'POST' });
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
  const hasData = vorbereitet.length > 0 || simKunden.length > 0 || vistarNavori.length > 0;

  /* ─── Loading State ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm p-8">
        <div className="flex items-center justify-center gap-3 py-12">
          <Loader2 size={20} className="animate-spin text-blue-500" />
          <span className="text-sm text-slate-500">NocoDB-Daten werden geladen...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Database size={18} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">NocoDB Daten</h2>
              <p className="text-xs text-slate-500">Vorbereitet, SIM-Karten &amp; Vistar/Navori</p>
            </div>
          </div>
          {syncError && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
              <AlertTriangle size={12} />
              {syncError}
            </div>
          )}
        </div>

        {/* ─── Sub-Tab Navigation ─────────────────────────────────── */}
        <div className="flex gap-1 border-b border-slate-200/60 -mx-5 px-5 overflow-x-auto">
          {SUB_TABS.map(({ key, label, icon: TabIcon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`
                px-3 py-2 rounded-t-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap
                ${activeTab === key
                  ? 'bg-white/80 text-blue-600 border border-slate-200/60 border-b-white -mb-px'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
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
                syncMeta={syncMeta}
                opsData={opsData}
                onSync={handleSync}
                syncing={syncing}
              />
            )}
            {activeTab === 'vorbereitet' && (
              <VorbereitetTab data={vorbereitet} opsData={opsData} />
            )}
            {activeTab === 'sim' && (
              <SimKartenTab data={simKunden} simInventory={[]} />
            )}
            {activeTab === 'vistar' && (
              <VistarNavoriTab data={vistarNavori} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
