import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  X,
  ChevronRight,
  WifiOff,
  AlertTriangle,
  Monitor,
  Clock,
  Filter,
  Wifi,
  Skull,
} from 'lucide-react';
import {
  getStatusColor,
  getStatusLabel,
  formatDuration,
} from '../utils/dataProcessing';

/* ─── Status Filter Chips ─── */
const STATUS_FILTERS = [
  { id: 'all', label: 'Alle', icon: Monitor, color: '#3b82f6' },
  { id: 'online', label: 'Online', icon: Wifi, color: '#22c55e' },
  { id: 'warning', label: 'Warnung', icon: Clock, color: '#f59e0b' },
  { id: 'critical', label: 'Kritisch', icon: AlertTriangle, color: '#ef4444' },
  { id: 'permanent_offline', label: 'Dauerhaft', icon: Skull, color: '#dc2626' },
  { id: 'never_online', label: 'Nie Online', icon: WifiOff, color: '#64748b' },
];

/* ─── Display Card ─── */
function DisplayCard({ display, onTap, comparisonData, delay = 0 }) {
  const statusColor = getStatusColor(display.status);
  const statusLabel = getStatusLabel(display.status);

  // Get enriched data
  const enriched = comparisonData?.airtable?.locationMap?.get(display.displayId);
  const jetId = enriched?.jetId;
  const city = enriched?.city || display.city || '';

  return (
    <button
      onClick={() => {
        if (navigator.vibrate) navigator.vibrate(6);
        onTap?.(display);
      }}
      className="
        w-full flex items-center gap-3 p-4 rounded-2xl
        bg-white/70 backdrop-blur-sm border border-slate-200/50
        active:scale-[0.98] active:bg-white/90
        transition-all duration-200
        mobile-card-enter text-left
      "
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Status Indicator */}
      <div className="relative shrink-0">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        {(display.status === 'online') && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-40"
            style={{ backgroundColor: statusColor }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate">
            {display.locationName || display.displayId}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-500 truncate">
            {city}
            {jetId ? ` -- ${jetId}` : ''}
          </span>
        </div>
        {display.offlineHours > 0 && display.status !== 'online' && (
          <div className="flex items-center gap-1 mt-1">
            <Clock size={10} className="text-slate-400" />
            <span className="text-[11px] font-mono text-slate-400">
              Offline seit {formatDuration(display.offlineHours)}
            </span>
          </div>
        )}
      </div>

      {/* Status Badge + Arrow */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg"
          style={{
            color: statusColor,
            backgroundColor: statusColor + '14',
          }}
        >
          {statusLabel}
        </span>
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  );
}

/* ─── Main Component ─── */
export default function MobileDisplayCards({
  displays,
  onSelectDisplay,
  comparisonData,
  initialFilter,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter || 'all');
  const [visibleCount, setVisibleCount] = useState(20);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(20);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [statusFilter, search]);

  // Apply initial filter
  useEffect(() => {
    if (initialFilter) setStatusFilter(initialFilter);
  }, [initialFilter]);

  // Filtered & sorted displays
  const filteredDisplays = useMemo(() => {
    let result = displays || [];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }

    // Search
    if (search.length >= 2) {
      const q = search.toLowerCase().trim();
      result = result.filter(d => {
        const enriched = comparisonData?.airtable?.locationMap?.get(d.displayId);
        return (
          d.displayId?.toLowerCase().includes(q) ||
          d.locationName?.toLowerCase().includes(q) ||
          d.city?.toLowerCase().includes(q) ||
          d.serialNumber?.toLowerCase().includes(q) ||
          enriched?.jetId?.toLowerCase().includes(q) ||
          enriched?.city?.toLowerCase().includes(q) ||
          enriched?.street?.toLowerCase().includes(q)
        );
      });
    }

    // Sort: offline first (by hours desc), then online
    result = [...result].sort((a, b) => {
      // Status priority: critical > permanent_offline > warning > never_online > online
      const statusOrder = { critical: 0, permanent_offline: 1, warning: 2, never_online: 3, online: 4 };
      const aOrder = statusOrder[a.status] ?? 5;
      const bOrder = statusOrder[b.status] ?? 5;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (b.offlineHours || 0) - (a.offlineHours || 0);
    });

    return result;
  }, [displays, statusFilter, search, comparisonData]);

  // Visible subset for virtualization
  const visibleDisplays = useMemo(() => {
    return filteredDisplays.slice(0, visibleCount);
  }, [filteredDisplays, visibleCount]);

  // Load more on scroll
  const handleScroll = useCallback((e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      setVisibleCount(prev => Math.min(prev + 20, filteredDisplays.length));
    }
  }, [filteredDisplays.length]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { all: displays?.length || 0 };
    (displays || []).forEach(d => {
      counts[d.status] = (counts[d.status] || 0) + 1;
    });
    return counts;
  }, [displays]);

  return (
    <div className="flex flex-col h-full">
      {/* ─── Sticky Search Bar ─── */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl px-4 pt-3 pb-2 border-b border-slate-200/40">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Standort, JET-ID, Display-ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="
              w-full pl-10 pr-9 py-2.5 rounded-xl
              bg-slate-50/80 border border-slate-200/60
              text-sm text-slate-800 placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300
              font-mono
            "
            style={{ fontSize: '16px' }} // Prevents iOS zoom
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-none pb-1">
          {STATUS_FILTERS.map(f => {
            const isActive = statusFilter === f.id;
            const count = statusCounts[f.id] || 0;
            return (
              <button
                key={f.id}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(6);
                  setStatusFilter(f.id);
                }}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full
                  text-xs font-medium whitespace-nowrap shrink-0
                  transition-all duration-200
                  active:scale-95
                  ${isActive
                    ? 'text-white shadow-sm'
                    : 'bg-white/60 border border-slate-200/50 text-slate-600'
                  }
                `}
                style={isActive ? { backgroundColor: f.color } : {}}
              >
                <f.icon size={12} />
                <span>{f.label}</span>
                <span className={`
                  text-[10px] font-mono px-1 py-0.5 rounded-md
                  ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}
                `}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Display List ─── */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-28"
      >
        {/* Results count */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 font-mono">
            {filteredDisplays.length} {filteredDisplays.length === 1 ? 'Display' : 'Displays'}
          </span>
          {search && (
            <span className="text-xs text-blue-600 font-mono">
              Suche: "{search}"
            </span>
          )}
        </div>

        {/* Cards */}
        {visibleDisplays.map((display, i) => (
          <DisplayCard
            key={display.displayId}
            display={display}
            onTap={onSelectDisplay}
            comparisonData={comparisonData}
            delay={Math.min(i * 30, 300)}
          />
        ))}

        {/* Load more indicator */}
        {visibleCount < filteredDisplays.length && (
          <div className="flex items-center justify-center py-4">
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="text-xs font-medium text-blue-600 bg-blue-50 px-4 py-2 rounded-xl active:bg-blue-100 transition-colors"
            >
              {filteredDisplays.length - visibleCount} weitere laden
            </button>
          </div>
        )}

        {/* Empty state */}
        {filteredDisplays.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Monitor size={32} className="text-slate-300 mb-3" />
            <div className="text-sm font-medium text-slate-500">Keine Displays gefunden</div>
            <div className="text-xs text-slate-400 mt-1">
              {search ? 'Versuche einen anderen Suchbegriff' : 'Kein Display mit diesem Status'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
