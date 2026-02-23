import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Truck, Send, Building2, RotateCcw, Wrench, Trash2,
  Warehouse, Search, Loader2, RefreshCw, QrCode, MapPin, Clock,
  ArrowRight, Cpu, Monitor, Wifi as CardSim, Grip, Eye,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, History,
  Hash, Calendar, Filter, X,
} from 'lucide-react';
import { supabase } from '../utils/authService';

// ─── Constants ───

const POSITIONS = {
  zulieferung:  { label: 'Zulieferung',  icon: Truck,      color: '#8b5cf6' },
  lager:        { label: 'Lager',        icon: Warehouse,  color: '#3b82f6' },
  versand:      { label: 'Versand',      icon: Send,       color: '#f59e0b' },
  standort:     { label: 'Am Standort',  icon: Building2,  color: '#22c55e' },
  ruecksendung: { label: 'Rücksendung', icon: RotateCcw,  color: '#ef4444' },
  reparatur:    { label: 'Reparatur',    icon: Wrench,     color: '#f97316' },
  entsorgung:   { label: 'Entsorgung',   icon: Trash2,     color: '#64748b' },
};

const COMPONENT_TYPES = {
  ops:     { label: 'OPS Player', icon: Cpu,     color: '#3b82f6' },
  display: { label: 'Display',    icon: Monitor, color: '#8b5cf6' },
  sim:     { label: 'SIM-Karte',  icon: CardSim, color: '#22c55e' },
  mount:   { label: 'Halterung',  icon: Grip,    color: '#f59e0b' },
};

// ─── Helpers ───

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `Vor ${diffMin} Min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `Vor ${diffHrs} Std`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `Vor ${diffDays} Tagen`;
  const diffMonths = Math.floor(diffDays / 30);
  return `Vor ${diffMonths} Monaten`;
}

function truncateSN(sn, maxLen = 12) {
  if (!sn) return '\u2013';
  return sn.length > maxLen ? sn.slice(0, maxLen) + '...' : sn;
}

function fmtDate(d) {
  if (!d) return '\u2013';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('de-DE');
  } catch {
    return String(d);
  }
}


// ═══════════════════════════════════════════════════════════════
// Section 1: LIVE HARDWARE TRACKING
// ═══════════════════════════════════════════════════════════════

function LiveTrackingSection({ positionCounts, total, activePosition, onPositionClick, loading }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-5 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Package size={16} className="text-blue-500" />
          Live Hardware-Tracking
        </h2>
        <span className="text-xs text-slate-400 font-mono">
          {total} Gesamt
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
          <span className="ml-2 text-xs text-slate-500">Lade Positionen...</span>
        </div>
      ) : total === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          Noch keine Hardware-Positionen erfasst
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(POSITIONS).map(([key, pos]) => {
            const Icon = pos.icon;
            const count = positionCounts[key] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const isActive = activePosition === key;

            return (
              <button
                key={key}
                onClick={() => onPositionClick(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer group ${
                  isActive
                    ? 'border-blue-300 bg-blue-50/80 shadow-sm'
                    : 'border-slate-200/60 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: pos.color + '15' }}
                >
                  <Icon size={16} style={{ color: pos.color }} />
                </div>

                <span className="text-xs font-medium text-slate-700 w-28 text-left flex-shrink-0">
                  {pos.label}
                </span>

                <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(pct, count > 0 ? 2 : 0)}%`,
                      backgroundColor: pos.color,
                      opacity: 0.75,
                    }}
                  />
                </div>

                <span
                  className="text-sm font-bold font-mono w-16 text-right flex-shrink-0"
                  style={{ color: pos.color }}
                >
                  {count} <span className="text-[10px] font-normal text-slate-400">Stk</span>
                </span>

                <ChevronRight
                  size={14}
                  className={`text-slate-300 flex-shrink-0 transition-transform ${
                    isActive ? 'rotate-90 text-blue-400' : 'group-hover:text-slate-400'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Section 2: BY COMPONENT TYPE
// ═══════════════════════════════════════════════════════════════

function ComponentTypeSection({ typeCounts, loading }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-5 shadow-sm shadow-black/[0.03]">
      <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
        <Cpu size={16} className="text-blue-500" />
        Nach Komponententyp
      </h2>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(COMPONENT_TYPES).map(([typeKey, typeConf]) => {
            const Icon = typeConf.icon;
            const data = typeCounts[typeKey] || {};
            const totalForType = Object.values(data).reduce((s, v) => s + v, 0);

            return (
              <div
                key={typeKey}
                className="bg-white/80 border border-slate-200/60 rounded-xl p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: typeConf.color + '15' }}
                  >
                    <Icon size={14} style={{ color: typeConf.color }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{typeConf.label}</span>
                </div>

                <div className="text-xl font-bold font-mono text-slate-800 mb-2">
                  {totalForType}
                  <span className="text-[10px] font-normal text-slate-400 ml-1">total</span>
                </div>

                <div className="space-y-1">
                  {Object.entries(POSITIONS).map(([posKey, posConf]) => {
                    const count = data[posKey] || 0;
                    if (count === 0 && posKey !== 'lager' && posKey !== 'standort') return null;
                    return (
                      <div key={posKey} className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">{posConf.label}</span>
                        <span
                          className="text-[10px] font-mono font-medium"
                          style={{ color: count > 0 ? posConf.color : '#94a3b8' }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Section 3: QR-CODE SCANNER / SEARCH
// ═══════════════════════════════════════════════════════════════

function SearchSection() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [error, setError] = useState(null);

  const performSearch = useCallback(async (searchQuery) => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setResult(null);
    setHistoryData([]);
    setError(null);

    const q = searchQuery.trim();
    let found = null;

    try {
      // 1. Search hardware_qr_codes
      {
        const { data } = await supabase
          .from('hardware_qr_codes')
          .select('*')
          .or(`qr_code.ilike.%${q}%,serial_number.ilike.%${q}%`)
          .limit(1);
        if (data?.length > 0) {
          found = {
            source: 'qr_code',
            qr_code: data[0].qr_code,
            serial_number: data[0].serial_number,
            component_type: data[0].component_type,
            raw: data[0],
          };
        }
      }

      // 2. Search hardware_positions (current)
      if (!found) {
        const { data } = await supabase
          .from('hardware_positions')
          .select('*')
          .eq('is_current', true)
          .or(`serial_number.ilike.%${q}%,hardware_id.ilike.%${q}%`)
          .limit(1);
        if (data?.length > 0) {
          found = {
            source: 'position',
            serial_number: data[0].serial_number,
            hardware_id: data[0].hardware_id,
            component_type: data[0].component_type,
            position: data[0].position,
            location_name: data[0].location_name,
            city: data[0].city,
            sub_position: data[0].sub_position,
            created_at: data[0].created_at,
            raw: data[0],
          };
        }
      }

      // 3. Search hardware_ops
      if (!found) {
        const { data } = await supabase
          .from('hardware_ops')
          .select('*')
          .or(`ops_sn.ilike.%${q}%,ops_nr.ilike.%${q}%`)
          .limit(1);
        if (data?.length > 0) {
          found = {
            source: 'ops',
            serial_number: data[0].ops_sn,
            hardware_id: data[0].ops_nr,
            component_type: 'ops',
            raw: data[0],
          };
        }
      }

      // 4. Search hardware_sim
      if (!found) {
        const { data } = await supabase
          .from('hardware_sim')
          .select('*')
          .ilike('sim_id', `%${q}%`)
          .limit(1);
        if (data?.length > 0) {
          found = {
            source: 'sim',
            serial_number: data[0].sim_id,
            component_type: 'sim',
            raw: data[0],
          };
        }
      }

      // 5. Search hardware_displays
      if (!found) {
        const { data } = await supabase
          .from('hardware_displays')
          .select('*')
          .ilike('display_serial_number', `%${q}%`)
          .limit(1);
        if (data?.length > 0) {
          found = {
            source: 'display',
            serial_number: data[0].display_serial_number,
            component_type: 'display',
            raw: data[0],
          };
        }
      }

      // 6. Search goods_receipts
      if (!found) {
        const { data } = await supabase
          .from('goods_receipts')
          .select('*')
          .or(`serial_number.ilike.%${q}%,receipt_id.ilike.%${q}%`)
          .limit(1);
        if (data?.length > 0) {
          found = {
            source: 'receipt',
            serial_number: data[0].serial_number,
            hardware_id: data[0].receipt_id,
            component_type: data[0].component_type,
            raw: data[0],
          };
        }
      }

      if (!found) {
        setError('Keine Hardware gefunden f\u00fcr: ' + q);
        setSearching(false);
        return;
      }

      // Enrich: get current position if not already found from positions
      if (found.source !== 'position') {
        const snToSearch = found.serial_number;
        const idToSearch = found.hardware_id;
        let posFilter = [];
        if (snToSearch) posFilter.push(`serial_number.ilike.%${snToSearch}%`);
        if (idToSearch) posFilter.push(`hardware_id.ilike.%${idToSearch}%`);

        if (posFilter.length > 0) {
          const { data: posData } = await supabase
            .from('hardware_positions')
            .select('*')
            .eq('is_current', true)
            .or(posFilter.join(','))
            .limit(1);
          if (posData?.length > 0) {
            found.position = posData[0].position;
            found.location_name = posData[0].location_name;
            found.city = posData[0].city;
            found.sub_position = posData[0].sub_position;
            found.created_at = posData[0].created_at;
          }
        }
      }

      // Enrich: get QR code if not already from qr_codes
      if (found.source !== 'qr_code' && found.serial_number) {
        const { data: qrData } = await supabase
          .from('hardware_qr_codes')
          .select('qr_code')
          .ilike('serial_number', `%${found.serial_number}%`)
          .limit(1);
        if (qrData?.length > 0) {
          found.qr_code = qrData[0].qr_code;
        }
      }

      // Enrich: get leasing info from raw data if available
      if (found.raw?.leasing_provider || found.raw?.leasing_end) {
        found.leasing_provider = found.raw.leasing_provider;
        found.leasing_end = found.raw.leasing_end;
      }

      setResult(found);

      // Fetch full history
      const snForHistory = found.serial_number;
      const idForHistory = found.hardware_id;
      let histFilter = [];
      if (snForHistory) histFilter.push(`serial_number.ilike.%${snForHistory}%`);
      if (idForHistory) histFilter.push(`hardware_id.ilike.%${idForHistory}%`);

      if (histFilter.length > 0) {
        const { data: histData } = await supabase
          .from('hardware_positions')
          .select('*')
          .or(histFilter.join(','))
          .order('created_at', { ascending: true });
        setHistoryData(histData || []);
      }
    } catch (e) {
      console.error('[Search] Error:', e);
      setError('Suchfehler: ' + e.message);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    performSearch(query);
  };

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-5 shadow-sm shadow-black/[0.03]">
      <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
        <QrCode size={16} className="text-blue-500" />
        QR-Code / Seriennummer suchen
      </h2>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="QR-Code / Seriennummer scannen oder eingeben..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-white/80 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:font-sans"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Suchen
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 mb-4">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="bg-white border border-slate-200/60 rounded-xl p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                {result.hardware_id && (
                  <span className="font-mono">{result.hardware_id}</span>
                )}
                {result.serial_number && (
                  <>
                    {result.hardware_id && <span className="text-slate-300">|</span>}
                    <span className="text-slate-500 font-normal text-xs">SN:</span>
                    <span className="font-mono text-xs">{result.serial_number}</span>
                  </>
                )}
              </div>
              {result.qr_code && (
                <div className="flex items-center gap-1.5 mt-1">
                  <QrCode size={12} className="text-blue-500" />
                  <span className="text-[11px] font-mono text-blue-600">{result.qr_code}</span>
                </div>
              )}
            </div>
            {result.component_type && COMPONENT_TYPES[result.component_type] && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: COMPONENT_TYPES[result.component_type].color + '15',
                  color: COMPONENT_TYPES[result.component_type].color,
                  border: `1px solid ${COMPONENT_TYPES[result.component_type].color}33`,
                }}
              >
                {React.createElement(COMPONENT_TYPES[result.component_type].icon, { size: 12 })}
                {COMPONENT_TYPES[result.component_type].label}
              </span>
            )}
          </div>

          {/* Position Info */}
          {result.position && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <MapPin size={13} className="text-slate-400" />
                <span className="text-xs text-slate-500">Position:</span>
                <span
                  className="text-xs font-medium"
                  style={{ color: POSITIONS[result.position]?.color || '#64748b' }}
                >
                  {POSITIONS[result.position]?.label || result.position}
                </span>
                {(result.location_name || result.city) && (
                  <span className="text-xs text-slate-600">
                    ({result.location_name}{result.city ? `, ${result.city}` : ''})
                  </span>
                )}
              </div>

              {result.created_at && (
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span className="text-xs text-slate-500">Seit:</span>
                  <span className="text-xs font-mono text-slate-700">{fmtDate(result.created_at)}</span>
                </div>
              )}

              {result.leasing_provider && (
                <div className="flex items-center gap-1.5">
                  <Hash size={13} className="text-slate-400" />
                  <span className="text-xs text-slate-500">Leasing:</span>
                  <span className="text-xs text-slate-700">
                    {result.leasing_provider}
                    {result.leasing_end && `, l\u00e4uft bis ${fmtDate(result.leasing_end)}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* History Timeline */}
          {historyData.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
                <History size={13} className="text-slate-400" />
                History
              </div>
              <div className="relative pl-5 space-y-0">
                {historyData.map((h, i) => {
                  const posConf = POSITIONS[h.position] || { label: h.position, color: '#64748b' };
                  const isLast = i === historyData.length - 1;
                  return (
                    <div key={h.id || i} className="relative pb-3">
                      {/* Vertical line */}
                      {!isLast && (
                        <div className="absolute left-[-13px] top-3 w-[2px] h-full bg-slate-200" />
                      )}
                      {/* Dot */}
                      <div
                        className="absolute left-[-16px] top-1.5 w-[8px] h-[8px] rounded-full border-2 border-white"
                        style={{ backgroundColor: posConf.color }}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium" style={{ color: posConf.color }}>
                          {posConf.label}
                        </span>
                        {h.sub_position && (
                          <span className="text-[10px] text-slate-500">
                            ({h.sub_position}{h.location_name ? `, ${h.location_name}` : ''})
                          </span>
                        )}
                        {!h.sub_position && h.location_name && (
                          <span className="text-[10px] text-slate-500">({h.location_name})</span>
                        )}
                        {h.reference_id && (
                          <span className="text-[10px] font-mono text-blue-500">
                            {h.reference_id}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-auto font-mono">
                          {fmtDate(h.created_at)}
                        </span>
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


// ═══════════════════════════════════════════════════════════════
// Section 4: RECENT MOVEMENTS (Live Feed)
// ═══════════════════════════════════════════════════════════════

function RecentMovementsSection({ movements, loading, onRefresh }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-5 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Clock size={16} className="text-blue-500" />
          Letzte Bewegungen
        </h2>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
          title="Aktualisieren"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
          <span className="ml-2 text-xs text-slate-500">Lade Bewegungen...</span>
        </div>
      ) : movements.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          Noch keine Bewegungen erfasst
        </div>
      ) : (
        <div className="space-y-1">
          {movements.map((m, i) => {
            const typeConf = COMPONENT_TYPES[m.component_type] || { icon: Package, color: '#64748b' };
            const TypeIcon = typeConf.icon;
            const toPos = POSITIONS[m.position] || { label: m.position, color: '#64748b' };
            const fromPos = m.moved_from ? (POSITIONS[m.moved_from] || { label: m.moved_from, color: '#94a3b8' }) : null;

            return (
              <div
                key={m.id || i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50/60 transition-colors border border-transparent hover:border-slate-200/60"
              >
                {/* Time */}
                <span className="text-[10px] text-slate-400 w-20 flex-shrink-0 font-mono">
                  <Clock size={10} className="inline mr-1 -mt-px" />
                  {relativeTime(m.created_at)}
                </span>

                {/* Component type + SN */}
                <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                  <TypeIcon size={13} style={{ color: typeConf.color }} />
                  <span className="text-[11px] font-mono text-slate-700 truncate">
                    {truncateSN(m.serial_number || m.hardware_id, 14)}
                  </span>
                </div>

                {/* Movement direction */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {fromPos ? (
                    <>
                      <span
                        className="text-[10px] font-medium whitespace-nowrap"
                        style={{ color: fromPos.color }}
                      >
                        {fromPos.label}
                      </span>
                      <ArrowRight size={12} className="text-slate-300 flex-shrink-0" />
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-slate-300 whitespace-nowrap">
                        \u2013
                      </span>
                      <ArrowRight size={12} className="text-slate-300 flex-shrink-0" />
                    </>
                  )}
                  <span
                    className="text-[10px] font-medium whitespace-nowrap"
                    style={{ color: toPos.color }}
                  >
                    {toPos.label}
                  </span>
                </div>

                {/* Moved by */}
                <span className="text-[10px] text-slate-400 w-20 text-right flex-shrink-0 truncate">
                  {m.moved_by || '\u2013'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function TrackingDashboard() {
  const [positions, setPositions] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [activePosition, setActivePosition] = useState(null);

  // ─── Load current positions ───
  const loadPositions = useCallback(async (signal) => {
    setLoadingPositions(true);
    try {
      let query = supabase
        .from('hardware_positions')
        .select('*')
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setPositions(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[TrackingDashboard] Load positions error:', e);
    } finally {
      if (!signal?.aborted) setLoadingPositions(false);
    }
  }, []);

  // ─── Load recent movements ───
  const loadMovements = useCallback(async (signal) => {
    setLoadingMovements(true);
    try {
      let query = supabase
        .from('hardware_positions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setMovements(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[TrackingDashboard] Load movements error:', e);
    } finally {
      if (!signal?.aborted) setLoadingMovements(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadPositions(controller.signal);
    loadMovements(controller.signal);
    return () => controller.abort();
  }, [loadPositions, loadMovements]);

  // ─── Derived: position counts ───
  const positionCounts = useMemo(() => {
    const counts = {};
    Object.keys(POSITIONS).forEach((k) => { counts[k] = 0; });
    positions.forEach((p) => {
      counts[p.position] = (counts[p.position] || 0) + 1;
    });
    return counts;
  }, [positions]);

  const totalHardware = useMemo(
    () => Object.values(positionCounts).reduce((s, v) => s + v, 0),
    [positionCounts]
  );

  // ─── Derived: component type x position counts ───
  const typeCounts = useMemo(() => {
    const map = {};
    Object.keys(COMPONENT_TYPES).forEach((t) => {
      map[t] = {};
      Object.keys(POSITIONS).forEach((p) => { map[t][p] = 0; });
    });
    positions.forEach((p) => {
      const t = p.component_type;
      if (map[t]) {
        map[t][p.position] = (map[t][p.position] || 0) + 1;
      }
    });
    return map;
  }, [positions]);

  // ─── Position filter click ───
  const handlePositionClick = useCallback((posKey) => {
    setActivePosition((prev) => (prev === posKey ? null : posKey));
  }, []);

  // ─── Handle refresh ───
  const handleRefreshAll = useCallback(() => {
    loadPositions();
    loadMovements();
  }, [loadPositions, loadMovements]);

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Eye size={18} className="text-blue-500" />
          Tracking-Dashboard
        </h1>
        <button
          onClick={handleRefreshAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw size={13} className={loadingPositions ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      {/* Section 1: Live Hardware Tracking */}
      <LiveTrackingSection
        positionCounts={positionCounts}
        total={totalHardware}
        activePosition={activePosition}
        onPositionClick={handlePositionClick}
        loading={loadingPositions}
      />

      {/* Filtered position detail table (shown when a position is selected) */}
      {activePosition && (
        <PositionDetailTable
          positions={positions}
          filterPosition={activePosition}
          onClose={() => setActivePosition(null)}
        />
      )}

      {/* Section 2: By Component Type */}
      <ComponentTypeSection typeCounts={typeCounts} loading={loadingPositions} />

      {/* Section 3: QR / Search */}
      <SearchSection />

      {/* Section 4: Recent Movements */}
      <RecentMovementsSection
        movements={movements}
        loading={loadingMovements}
        onRefresh={loadMovements}
      />
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Detail table shown when clicking a position bar
// ═══════════════════════════════════════════════════════════════

function PositionDetailTable({ positions, filterPosition, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');

  const posConf = POSITIONS[filterPosition] || { label: filterPosition, color: '#64748b' };
  const PosIcon = posConf.icon || MapPin;

  const filtered = useMemo(() => {
    let list = positions.filter((p) => p.position === filterPosition);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          (p.serial_number || '').toLowerCase().includes(q) ||
          (p.hardware_id || '').toLowerCase().includes(q) ||
          (p.location_name || '').toLowerCase().includes(q) ||
          (p.city || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [positions, filterPosition, searchTerm]);

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-4 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PosIcon size={16} style={{ color: posConf.color }} />
          <span className="text-sm font-semibold" style={{ color: posConf.color }}>
            {posConf.label}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {filtered.length} Eintr\u00e4ge
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtern..."
              className="w-48 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs">
          Keine Eintr\u00e4ge f\u00fcr diese Position
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Typ</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">SN / ID</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Detail</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Standort</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Bewegt von</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Grund</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Seit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const typeInfo = COMPONENT_TYPES[p.component_type] || {
                  label: p.component_type,
                  color: '#64748b',
                };
                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-2 px-3">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs"
                        style={{
                          backgroundColor: typeInfo.color + '15',
                          color: typeInfo.color,
                          border: `1px solid ${typeInfo.color}33`,
                        }}
                      >
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700 text-[11px]">
                      {p.serial_number || p.hardware_id}
                    </td>
                    <td className="py-2 px-3 text-slate-600">{p.sub_position || '\u2013'}</td>
                    <td className="py-2 px-3 text-slate-700">
                      {p.location_name
                        ? `${p.location_name}${p.city ? ` (${p.city})` : ''}`
                        : '\u2013'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{p.moved_by || '\u2013'}</td>
                    <td className="py-2 px-3 text-slate-500">{p.move_reason || '\u2013'}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">
                      {fmtDate(p.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
