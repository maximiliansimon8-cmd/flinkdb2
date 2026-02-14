import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  X,
  ChevronRight,
  WifiOff,
  AlertTriangle,
  Monitor,
  Clock,
  Wifi,
  Skull,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/* ─── Status Classification (matches dataProcessing.js logic) ─── */
function getStatusFromOffline(offlineHours, neverOnline) {
  if (neverOnline) return 'never_online';
  if (offlineHours == null || isNaN(offlineHours)) return 'online';
  if (offlineHours < 24) return 'online';
  if (offlineHours < 72) return 'warning';
  if (offlineHours >= 168) return 'permanent_offline';
  return 'critical';
}

function getStatusColor(status) {
  switch (status) {
    case 'online': return '#22c55e';
    case 'warning': return '#f59e0b';
    case 'critical': return '#ef4444';
    case 'permanent_offline': return '#dc2626';
    case 'never_online': return '#64748b';
    default: return '#64748b';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'online': return 'Online';
    case 'warning': return 'Warnung';
    case 'critical': return 'Kritisch';
    case 'permanent_offline': return 'Dauerhaft';
    case 'never_online': return 'Nie Online';
    default: return 'Unbekannt';
  }
}

function formatDuration(hours) {
  if (hours == null) return '';
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.round(hours % 24)}h`;
}

// City code → City name mapping (same as dataProcessing.js)
const CITY_MAP = {
  'CGN': 'Köln', 'BER': 'Berlin', 'MUC': 'München', 'HAM': 'Hamburg', 'HH': 'Hamburg',
  'DUS': 'Düsseldorf', 'FRA': 'Frankfurt', 'STR': 'Stuttgart', 'DTM': 'Dortmund', 'DO': 'Dortmund',
  'LEJ': 'Leipzig', 'DRS': 'Dresden', 'NUE': 'Nürnberg', 'HAN': 'Hannover', 'BRE': 'Bremen',
  'ESS': 'Essen', 'KA': 'Karlsruhe', 'MS': 'Münster', 'BI': 'Bielefeld', 'WI': 'Wiesbaden',
  'MA': 'Mannheim', 'AC': 'Aachen', 'KI': 'Kiel', 'ROS': 'Rostock',
};

function getCityFromId(displayId) {
  if (!displayId) return '';
  const parts = displayId.split('-');
  if (parts.length < 3) return '';
  return CITY_MAP[parts[2]] || parts[2];
}

/* ─── Status Filter Chips ─── */
const STATUS_FILTERS = [
  { id: 'all', label: 'Alle', icon: Monitor, color: '#3b82f6' },
  { id: 'online', label: 'Online', icon: Wifi, color: '#22c55e' },
  { id: 'warning', label: 'Warnung', icon: Clock, color: '#f59e0b' },
  { id: 'critical', label: 'Kritisch', icon: AlertTriangle, color: '#ef4444' },
  { id: 'permanent_offline', label: 'Dauerhaft', icon: Skull, color: '#dc2626' },
  { id: 'never_online', label: 'Nie Online', icon: WifiOff, color: '#64748b' },
];

const PAGE_SIZE = 25;

/* ─── Display Card ─── */
function DisplayCard({ display, onTap, delay = 0 }) {
  const statusColor = getStatusColor(display.status);
  const statusLabel = getStatusLabel(display.status);

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
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColor }} />
        {display.status === 'online' && (
          <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ backgroundColor: statusColor }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-slate-800 truncate block">
          {display.locationName || display.displayId}
        </span>
        <span className="text-xs text-slate-500 truncate block mt-0.5">
          {display.city}
        </span>
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
          style={{ color: statusColor, backgroundColor: statusColor + '14' }}
        >
          {statusLabel}
        </span>
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════
   MobileDisplayCards
   ─ Loads displays directly from Supabase with
     server-side filtering + pagination.
     NO displays prop needed — self-contained.
   ═══════════════════════════════════════════════ */
export default function MobileDisplayCards({
  initialFilter,
  onSelectDisplay,
}) {
  const [displays, setDisplays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter || 'all');
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const pageRef = useRef(0);

  // Apply initial filter when prop changes
  useEffect(() => {
    if (initialFilter) setStatusFilter(initialFilter);
  }, [initialFilter]);

  /* ─── Fetch displays from Supabase ─── */
  const fetchDisplays = useCallback(async (page = 0, filter = statusFilter, searchQuery = search, append = false) => {
    if (page === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // We fetch from display_heartbeats with DISTINCT ON display_id
      // Since Supabase doesn't support DISTINCT ON in JS client,
      // we fetch recent data and deduplicate client-side
      let query = supabase
        .from('display_heartbeats')
        .select('display_id, raw_display_id, location_name, timestamp_parsed, heartbeat, days_offline, is_alive, display_status')
        .order('timestamp_parsed', { ascending: false })
        .gte('timestamp_parsed', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      // Search filter (server-side)
      if (searchQuery && searchQuery.length >= 2) {
        query = query.or(`location_name.ilike.%${searchQuery}%,display_id.ilike.%${searchQuery}%`);
      }

      // Status-based filtering (via days_offline for server-side pre-filtering)
      if (filter === 'critical') {
        query = query.gte('days_offline', 3).lt('days_offline', 7);
      } else if (filter === 'permanent_offline') {
        query = query.gte('days_offline', 7);
      } else if (filter === 'warning') {
        query = query.gte('days_offline', 1).lt('days_offline', 3);
      } else if (filter === 'online') {
        query = query.or('days_offline.is.null,days_offline.lt.1');
      }

      // Limit to get enough unique displays
      query = query.limit(PAGE_SIZE * 3);

      const { data, error } = await query;

      if (error) throw error;

      // Deduplicate: keep latest per display_id
      const seen = new Map();
      for (const row of (data || [])) {
        if (!seen.has(row.display_id)) {
          const offlineHours = row.heartbeat && row.timestamp_parsed
            ? (new Date(row.timestamp_parsed).getTime() - new Date(row.heartbeat).getTime()) / (1000 * 60 * 60)
            : null;

          const neverOnline = !row.heartbeat && !row.is_alive;
          const status = getStatusFromOffline(
            offlineHours != null && offlineHours >= 0 ? offlineHours : null,
            neverOnline
          );

          // Apply client-side filter for never_online (can't easily filter server-side)
          if (filter === 'never_online' && status !== 'never_online') continue;
          if (filter !== 'all' && filter !== 'never_online' && status !== filter) continue;

          seen.set(row.display_id, {
            displayId: row.display_id,
            locationName: row.location_name || '',
            city: getCityFromId(row.display_id),
            offlineHours: offlineHours != null ? Math.max(0, offlineHours) : null,
            status,
            daysOffline: row.days_offline,
          });
        }
      }

      // Sort: worst status first
      const statusOrder = { critical: 0, permanent_offline: 1, warning: 2, never_online: 3, online: 4 };
      const sorted = [...seen.values()].sort((a, b) => {
        const ao = statusOrder[a.status] ?? 5;
        const bo = statusOrder[b.status] ?? 5;
        if (ao !== bo) return ao - bo;
        return (b.offlineHours || 0) - (a.offlineHours || 0);
      });

      // Paginate
      const paged = sorted.slice(0, PAGE_SIZE);

      if (append) {
        setDisplays(prev => [...prev, ...paged]);
      } else {
        setDisplays(paged);
      }
      setHasMore(paged.length === PAGE_SIZE);
      setTotalCount(sorted.length);
      pageRef.current = page;
    } catch (e) {
      console.error('[MobileDisplayCards] Fetch error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter, search]);

  /* ─── Fetch status counts once ─── */
  useEffect(() => {
    async function fetchCounts() {
      try {
        const { data } = await supabase.rpc('get_mobile_kpis');
        if (data) {
          setStatusCounts({
            all: data.totalActive || 0,
            online: data.onlineCount || 0,
            warning: data.warningCount || 0,
            critical: data.criticalCount || 0,
            permanent_offline: data.permanentOfflineCount || 0,
            never_online: data.neverOnlineCount || 0,
          });
        }
      } catch {}
    }
    fetchCounts();
  }, []);

  /* ─── Initial fetch + re-fetch on filter change ─── */
  useEffect(() => {
    fetchDisplays(0, statusFilter, search, false);
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Debounced search ─── */
  useEffect(() => {
    if (search.length === 0 || search.length >= 2) {
      const timer = setTimeout(() => {
        fetchDisplays(0, statusFilter, search, false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Scroll to load more ─── */
  const handleScroll = useCallback((e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hasMore && !loadingMore) {
      fetchDisplays(pageRef.current + 1, statusFilter, search, true);
    }
  }, [hasMore, loadingMore, fetchDisplays, statusFilter, search]);

  return (
    <div className="flex flex-col h-full">
      {/* ─── Sticky Search Bar ─── */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl px-4 pt-3 pb-2 border-b border-slate-200/40">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Standort oder Display-ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="
              w-full pl-10 pr-9 py-2.5 rounded-xl
              bg-slate-50/80 border border-slate-200/60
              text-sm text-slate-800 placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300
              font-mono
            "
            style={{ fontSize: '16px' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-600">
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
                  transition-all duration-200 active:scale-95
                  ${isActive ? 'text-white shadow-sm' : 'bg-white/60 border border-slate-200/50 text-slate-600'}
                `}
                style={isActive ? { backgroundColor: f.color } : {}}
              >
                <f.icon size={12} />
                <span>{f.label}</span>
                {count > 0 && (
                  <span className={`text-[10px] font-mono px-1 py-0.5 rounded-md ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                )}
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
        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 size={24} className="animate-spin text-blue-500" />
            <span className="text-xs text-slate-400">Lade Displays...</span>
          </div>
        ) : (
          <>
            {/* Results count */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-mono">
                {displays.length} Displays
              </span>
              {search && (
                <span className="text-xs text-blue-600 font-mono">
                  Suche: "{search}"
                </span>
              )}
            </div>

            {/* Cards */}
            {displays.map((display, i) => (
              <DisplayCard
                key={display.displayId}
                display={display}
                onTap={onSelectDisplay}
                delay={Math.min(i * 30, 300)}
              />
            ))}

            {/* Loading more */}
            {loadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-blue-500 mr-2" />
                <span className="text-xs text-slate-400">Lade mehr...</span>
              </div>
            )}

            {/* Empty state */}
            {displays.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Monitor size={32} className="text-slate-300 mb-3" />
                <div className="text-sm font-medium text-slate-500">Keine Displays gefunden</div>
                <div className="text-xs text-slate-400 mt-1">
                  {search ? 'Versuche einen anderen Suchbegriff' : 'Kein Display mit diesem Status'}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
