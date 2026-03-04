import React, { useState, useMemo } from 'react';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  Filter,
  ArrowUpDown,
  Monitor,
  AlertTriangle,
  XCircle,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Building2,
  Activity,
  ShieldCheck,
  ShieldAlert,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHealthColor(rate) {
  if (rate >= 90) return { text: 'text-emerald-600', bg: 'bg-emerald-500', bar: '#34C759', ring: 'ring-emerald-200' };
  if (rate >= 70) return { text: 'text-status-warning', bg: 'bg-status-warning', bar: '#FF9500', ring: 'ring-amber-200' };
  return { text: 'text-status-offline', bg: 'bg-status-offline', bar: '#FF3B30', ring: 'ring-red-200' };
}

function getStatusColor(status) {
  switch (status) {
    case 'online': return 'text-emerald-600';
    case 'warning': return 'text-status-warning';
    case 'critical': return 'text-status-offline';
    case 'permanent_offline': return 'text-red-700';
    case 'never_online': return 'text-text-muted';
    default: return 'text-text-muted';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'online': return 'Online';
    case 'warning': return 'Warnung';
    case 'critical': return 'Kritisch';
    case 'permanent_offline': return 'Permanent Offline';
    case 'never_online': return 'Nie Online';
    default: return status;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPISummaryBar({ cities, avgHealth, goodCount, criticalCount }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={14} className="text-accent" />
          <span className="text-xs font-medium text-text-muted">Staedte</span>
        </div>
        <div className="text-2xl font-bold text-text-primary">{cities}</div>
      </div>
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <Activity size={14} className="text-accent" />
          <span className="text-xs font-medium text-text-muted">Avg. Health</span>
        </div>
        <div className="text-2xl font-bold text-accent">{avgHealth}%</div>
      </div>
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span className="text-xs font-medium text-text-muted">&gt;90% Health</span>
        </div>
        <div className="text-2xl font-bold text-emerald-600">{goodCount}</div>
      </div>
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={14} className="text-status-offline" />
          <span className="text-xs font-medium text-text-muted">&lt;70% Health</span>
        </div>
        <div className="text-2xl font-bold text-status-offline">{criticalCount}</div>
      </div>
    </div>
  );
}

function PodiumSection({ top3, bottom3 }) {
  // Podium order: 2nd, 1st, 3rd  (for visual effect)
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumHeights = ['h-20', 'h-28', 'h-16'];
  const medals = top3.length >= 3 ? ['\u{1F948}', '\u{1F947}', '\u{1F949}'] : ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
  const ranks = top3.length >= 3 ? ['#2', '#1', '#3'] : ['#1', '#2', '#3'];

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-card">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 3 Podium */}
        <div>
          <h3 className="text-xs font-medium text-text-muted mb-4">
            Top 3 — Beste Health Rates
          </h3>
          <div className="flex items-end justify-center gap-3">
            {podiumOrder.map((city, i) => {
              if (!city) return null;
              const colors = getHealthColor(city.healthRate);
              return (
                <div key={city.code} className="flex flex-col items-center">
                  <span className="text-2xl mb-1">{medals[i]}</span>
                  <div className="text-sm font-semibold text-text-primary">{city.name}</div>
                  <div className={`text-lg font-bold ${colors.text}`}>{city.healthRate}%</div>
                  <div className="text-xs text-text-muted">{city.total} Displays</div>
                  <div className={`${podiumHeights[i]} w-20 mt-2 rounded-t-xl ${colors.bg} opacity-20`} />
                  <div className="text-xs font-bold text-text-muted mt-1">{ranks[i]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom 3 Warning */}
        <div>
          <h3 className="text-xs font-medium text-text-muted mb-4">
            Bottom 3 — Brauchen Aufmerksamkeit
          </h3>
          <div className="space-y-2">
            {bottom3.map((city, i) => {
              const colors = getHealthColor(city.healthRate);
              return (
                <div
                  key={city.code}
                  className="flex items-center gap-3 p-3 bg-status-offline/10/50 border border-red-100/60 rounded-xl"
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-status-offline/10 text-status-offline text-xs font-bold">
                    {bottom3.length - i}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{city.name}</div>
                    <div className="text-xs text-text-muted">{city.code} &middot; {city.total} Displays</div>
                  </div>
                  <div className={`text-lg font-bold ${colors.text}`}>{city.healthRate}%</div>
                  <AlertTriangle size={14} className="text-status-offline shrink-0" />
                </div>
              );
            })}
            {bottom3.length === 0 && (
              <div className="text-sm text-text-muted text-center py-4">Alle Staedte sind gesund!</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CityCard({ city, breakdown, trendIndicator, onClick, isExpanded, displays }) {
  const colors = getHealthColor(city.healthRate);

  return (
    <div
      className={`bg-surface-primary border rounded-2xl shadow-card transition-all duration-200 cursor-pointer hover:shadow-md hover:border-accent/20/60 ${isExpanded ? 'border-blue-300/80 ring-2 ring-blue-100' : 'border-border-secondary'}`}
      onClick={onClick}
    >
      <div className="p-4">
        {/* Header: City Name + Health Rate */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={14} className="text-text-muted shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary truncate">{city.name}</div>
              <div className="text-xs text-text-muted">{city.code}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {trendIndicator === 'up' && <TrendingUp size={14} className="text-emerald-500" />}
            {trendIndicator === 'down' && <TrendingDown size={14} className="text-status-offline" />}
            {trendIndicator === 'stable' && <Minus size={14} className="text-text-muted" />}
            <div className={`text-2xl font-bold ${colors.text}`}>
              {city.healthRate}%
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2.5 bg-surface-secondary/80 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${city.healthRate}%`, backgroundColor: colors.bar }}
          />
        </div>

        {/* Display Count Badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Monitor size={12} className="text-accent" />
            <span className="text-xs font-semibold text-accent">{city.total} Displays</span>
          </div>
          {isExpanded ? (
            <ChevronUp size={14} className="text-text-muted" />
          ) : (
            <ChevronDown size={14} className="text-text-muted" />
          )}
        </div>

        {/* Status Breakdown Mini-Bar */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-text-muted">Online</span>
            <span className="text-xs font-bold text-emerald-600 ml-auto">{breakdown.online}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-warning" />
            <span className="text-xs text-text-muted">Warnung</span>
            <span className="text-xs font-bold text-status-warning ml-auto">{breakdown.warning}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-offline" />
            <span className="text-xs text-text-muted">Kritisch</span>
            <span className="text-xs font-bold text-status-offline ml-auto">{breakdown.critical}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-800" />
            <span className="text-xs text-text-muted">Perm. Off</span>
            <span className="text-xs font-bold text-red-700 ml-auto">{breakdown.permanentOffline}</span>
          </div>
        </div>
      </div>

      {/* Expanded: show display list */}
      {isExpanded && displays && displays.length > 0 && (
        <div className="border-t border-border-secondary px-4 py-3 bg-surface-secondary/40 rounded-b-2xl max-h-64 overflow-y-auto">
          <div className="text-xs font-medium text-text-muted mb-2">
            Displays in {city.name}
          </div>
          <div className="space-y-1">
            {displays
              .sort((a, b) => {
                const order = { online: 0, warning: 1, critical: 2, permanent_offline: 3, never_online: 4, unknown: 5 };
                return (order[a.status] ?? 5) - (order[b.status] ?? 5);
              })
              .map((d) => (
                <div
                  key={d.displayId}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-secondary transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    // onSelectDisplay could be wired here if needed
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        d.status === 'online' ? 'bg-emerald-500' :
                        d.status === 'warning' ? 'bg-status-warning' :
                        d.status === 'critical' ? 'bg-status-offline' :
                        d.status === 'permanent_offline' ? 'bg-red-800' :
                        'bg-surface-tertiary'
                      }`}
                    />
                    <span className="text-xs text-text-primary truncate">
                      {d.displayId}
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${getStatusColor(d.status)}`}>
                    {getStatusLabel(d.status)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CityDashboard Component
// ---------------------------------------------------------------------------

export default function CityDashboard({ cityData, displays, trendData, onSelectDisplay }) {
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState('all');
  const [sortBy, setSortBy] = useState('healthRate');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedCity, setExpandedCity] = useState(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Compute per-city breakdowns from displays array
  const cityBreakdowns = useMemo(() => {
    if (!displays || !displays.length) return {};
    const map = {};
    displays.forEach((d) => {
      if (!d.isActive || !d.cityCode) return;
      if (!map[d.cityCode]) {
        map[d.cityCode] = { online: 0, warning: 0, critical: 0, permanentOffline: 0, neverOnline: 0 };
      }
      const b = map[d.cityCode];
      switch (d.status) {
        case 'online': b.online++; break;
        case 'warning': b.warning++; break;
        case 'critical': b.critical++; break;
        case 'permanent_offline': b.permanentOffline++; break;
        case 'never_online': b.neverOnline++; break;
        default: break;
      }
    });
    return map;
  }, [displays]);

  // Compute city-level trend indicators from trendData
  // Compare the last two days' data to derive a simple per-city trend.
  // Since trendData is day-level and global (not per-city), we approximate:
  // If global health went up, cities near the edge benefit. For a simple approach,
  // we just mark all cities as "stable" unless we have per-city historical data.
  // A more precise version would require per-city historical snapshots.
  const cityTrends = useMemo(() => {
    // We don't have per-city trend data, so return empty (stable for all)
    return {};
  }, []);

  // Get displays per city
  const displaysByCity = useMemo(() => {
    if (!displays || !displays.length) return {};
    const map = {};
    displays.forEach((d) => {
      if (!d.isActive || !d.cityCode) return;
      if (!map[d.cityCode]) map[d.cityCode] = [];
      map[d.cityCode].push(d);
    });
    return map;
  }, [displays]);

  // Enriched + filtered + sorted cities
  const processedCities = useMemo(() => {
    if (!cityData || !cityData.length) return [];

    let result = [...cityData];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
      );
    }

    // Health filter
    if (healthFilter === 'critical') {
      result = result.filter((c) => c.healthRate < 70);
    } else if (healthFilter === 'warning') {
      result = result.filter((c) => c.healthRate >= 70 && c.healthRate < 90);
    } else if (healthFilter === 'good') {
      result = result.filter((c) => c.healthRate >= 90);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'healthRate':
          cmp = a.healthRate - b.healthRate;
          break;
        case 'total':
          cmp = a.total - b.total;
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name, 'de');
          break;
        case 'critical': {
          const aCrit = (cityBreakdowns[a.code]?.critical || 0) + (cityBreakdowns[a.code]?.permanentOffline || 0);
          const bCrit = (cityBreakdowns[b.code]?.critical || 0) + (cityBreakdowns[b.code]?.permanentOffline || 0);
          cmp = aCrit - bCrit;
          break;
        }
        default:
          cmp = a.healthRate - b.healthRate;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [cityData, search, healthFilter, sortBy, sortDir, cityBreakdowns]);

  // Summary KPIs
  const summary = useMemo(() => {
    if (!cityData || !cityData.length) return { total: 0, avg: 0, good: 0, critical: 0 };
    const total = cityData.length;
    const avg = Math.round((cityData.reduce((sum, c) => sum + c.healthRate, 0) / total) * 10) / 10;
    const good = cityData.filter((c) => c.healthRate >= 90).length;
    const critical = cityData.filter((c) => c.healthRate < 70).length;
    return { total, avg, good, critical };
  }, [cityData]);

  // Top 3 and Bottom 3
  const { top3, bottom3 } = useMemo(() => {
    if (!cityData || !cityData.length) return { top3: [], bottom3: [] };
    const sorted = [...cityData].sort((a, b) => b.healthRate - a.healthRate);
    return {
      top3: sorted.slice(0, 3),
      bottom3: sorted.slice(-3).reverse().filter((c) => c.healthRate < 90),
    };
  }, [cityData]);

  const filterButtons = [
    { key: 'all', label: 'Alle', count: cityData?.length || 0 },
    { key: 'critical', label: 'Kritisch', sublabel: '<70%', count: summary.critical, color: 'text-status-offline' },
    { key: 'warning', label: 'Warnung', sublabel: '70-90%', count: cityData?.filter((c) => c.healthRate >= 70 && c.healthRate < 90).length || 0, color: 'text-status-warning' },
    { key: 'good', label: 'Gut', sublabel: '>90%', count: summary.good, color: 'text-emerald-600' },
  ];

  const sortOptions = [
    { key: 'healthRate', label: 'Health Rate' },
    { key: 'total', label: 'Anzahl Displays' },
    { key: 'name', label: 'Stadt A-Z' },
    { key: 'critical', label: 'Kritische Displays' },
  ];

  if (!cityData || cityData.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted text-sm">
        Keine Staedtedaten verfuegbar.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI Summary Bar */}
      <KPISummaryBar
        cities={summary.total}
        avgHealth={summary.avg}
        goodCount={summary.good}
        criticalCount={summary.critical}
      />

      {/* City Ranking Podium */}
      <PodiumSection top3={top3} bottom3={bottom3} />

      {/* Filter + Search + Sort Toolbar */}
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={14} className="text-text-muted shrink-0" />
            {filterButtons.map((fb) => (
              <button
                key={fb.key}
                onClick={() => setHealthFilter(fb.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  healthFilter === fb.key
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-surface-secondary/80 text-text-secondary hover:bg-surface-tertiary/80'
                }`}
              >
                {fb.label}
                {fb.sublabel && <span className="ml-1 opacity-60">{fb.sublabel}</span>}
                <span className={`ml-1.5 ${healthFilter === fb.key ? 'text-blue-100' : (fb.color || 'text-text-muted')}`}>
                  {fb.count}
                </span>
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Stadt suchen..."
              className="pl-8 pr-8 py-1.5 w-full lg:w-48 rounded-lg border border-border-secondary bg-surface-primary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-blue-300 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-secondary bg-surface-primary text-xs text-text-secondary hover:bg-surface-secondary/80 transition-all"
            >
              <ArrowUpDown size={12} />
              <span>{sortOptions.find((o) => o.key === sortBy)?.label}</span>
              <ChevronDown size={12} className={`transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showSortDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSortDropdown(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-surface-primary border border-border-secondary rounded-xl shadow-lg shadow-black/5 py-1 min-w-[180px]">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        if (sortBy === opt.key) {
                          setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
                        } else {
                          setSortBy(opt.key);
                          setSortDir(opt.key === 'name' ? 'asc' : 'desc');
                        }
                        setShowSortDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                        sortBy === opt.key ? 'bg-accent-light text-blue-700 font-medium' : 'text-text-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {sortBy === opt.key && (
                        <span className="text-xs text-accent">
                          {sortDir === 'desc' ? 'absteigend' : 'aufsteigend'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sort direction toggle */}
          <button
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className="p-1.5 rounded-lg border border-border-secondary bg-surface-primary text-text-muted hover:bg-surface-secondary/80 transition-all"
            title={sortDir === 'desc' ? 'Absteigend' : 'Aufsteigend'}
          >
            {sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>

        {/* Result count */}
        <div className="mt-2 text-xs text-text-muted">
          {processedCities.length} von {cityData.length} Staedten
        </div>
      </div>

      {/* City Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {processedCities.map((city) => {
          const breakdown = cityBreakdowns[city.code] || {
            online: city.online,
            warning: 0,
            critical: 0,
            permanentOffline: 0,
            neverOnline: 0,
          };
          const trend = cityTrends[city.code] || null;
          const isExpanded = expandedCity === city.code;
          const cityDisplays = displaysByCity[city.code] || [];

          return (
            <CityCard
              key={city.code}
              city={city}
              breakdown={breakdown}
              trendIndicator={trend}
              isExpanded={isExpanded}
              displays={cityDisplays}
              onClick={() => setExpandedCity(isExpanded ? null : city.code)}
            />
          );
        })}
      </div>

      {/* Empty state after filtering */}
      {processedCities.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted">
          <Search size={32} className="mb-3 opacity-40" />
          <div className="text-sm font-medium">Keine Staedte gefunden</div>
          <div className="text-xs mt-1">Versuche einen anderen Filter oder Suchbegriff</div>
          <button
            onClick={() => { setSearch(''); setHealthFilter('all'); }}
            className="mt-3 px-4 py-1.5 rounded-lg bg-accent-light text-accent text-xs font-medium hover:bg-accent-light transition-colors"
          >
            Filter zuruecksetzen
          </button>
        </div>
      )}
    </div>
  );
}
