import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  WifiOff,
  ChevronDown,
  ChevronUp,
  ClipboardPlus,
  MapPin,
  Clock,
  Filter,
} from 'lucide-react';

/**
 * Health pattern categories based on per-display snapshot analysis.
 *
 * Each display is classified by analyzing its snapshots across the selected date range:
 * - How consistently it's online during operating hours (06:00-22:00)
 * - Whether it's online in the morning (06:00-09:00) or comes online late
 */
const PATTERNS = [
  {
    id: 'excellent',
    label: 'Ganztags + Morgens OK',
    icon: '✓✓',
    color: '#34C759',
    bg: '#34C75910',
    border: '#34C75930',
    description: 'Stabil online, inkl. morgens ab 06:00',
  },
  {
    id: 'good',
    label: 'Ganztags OK',
    icon: '✓',
    color: '#007AFF',
    bg: '#007AFF10',
    border: '#007AFF30',
    description: 'Online tagsüber, vereinzelte Aussetzer',
  },
  {
    id: 'late_morning',
    label: 'Ganztags OK, Morgens spät',
    icon: '✓⚠',
    color: '#FF9500',
    bg: '#FF950010',
    border: '#FF950030',
    description: 'Tagsüber OK, aber morgens verzögerter Start',
  },
  {
    id: 'offline',
    label: 'Offline',
    icon: '✗',
    color: '#FF3B30',
    bg: '#FF3B3010',
    border: '#FF3B3030',
    description: 'Kritisch offline oder dauerhaft nicht erreichbar',
  },
  {
    id: 'never_online',
    label: 'Nie Online',
    icon: '—',
    color: '#64748b',
    bg: '#64748b10',
    border: '#64748b30',
    description: 'Kein Heartbeat seit Installation',
  },
];

/**
 * Classify a display into a health pattern based on its snapshots.
 *
 * Logic:
 * - never_online: no heartbeat ever
 * - offline: current status is critical or permanent_offline (>72h offline)
 * - excellent: online + majority of morning snapshots (06-09) show online
 * - late_morning: online overall but morning snapshots show late start
 * - good: online but not enough morning data to classify
 */
function classifyDisplay(display) {
  if (display.status === 'never_online') return 'never_online';
  if (display.status === 'permanent_offline') return 'offline';
  if (display.status === 'critical') return 'offline';

  // For online/warning displays, analyze snapshot patterns
  const snapshots = display.snapshots || [];
  if (snapshots.length === 0) {
    return display.status === 'online' ? 'good' : 'offline';
  }

  // Analyze morning availability (06:00-09:00)
  let morningSnapshots = 0;
  let morningOnline = 0;
  // Analyze all-day availability (06:00-22:00)
  let daySnapshots = 0;
  let dayOnline = 0;

  snapshots.forEach((snap) => {
    const hour = snap.timestamp.getHours();
    if (hour < 6 || hour > 22) return;

    daySnapshots++;
    const isOnline =
      snap.heartbeat &&
      (snap.timestamp.getTime() - snap.heartbeat.getTime()) / (1000 * 60 * 60) < 24;

    if (isOnline) dayOnline++;

    if (hour >= 6 && hour <= 9) {
      morningSnapshots++;
      if (isOnline) morningOnline++;
    }
  });

  // If currently in warning state, classify based on pattern
  if (display.status === 'warning') {
    // Warning = 24-72h offline. If most daytime was OK, it's late_morning pattern
    if (daySnapshots > 0 && dayOnline / daySnapshots > 0.5) {
      return 'late_morning';
    }
    return 'offline';
  }

  // Online display — classify by morning pattern
  if (daySnapshots === 0) return 'good';

  const dayRate = dayOnline / daySnapshots;
  if (dayRate < 0.5) return 'offline';

  // Check morning pattern
  if (morningSnapshots >= 2) {
    const morningRate = morningOnline / morningSnapshots;
    if (morningRate >= 0.7) return 'excellent';
    if (morningRate >= 0.3) return 'late_morning';
    return 'late_morning';
  }

  // Not enough morning data — classify as good if generally online
  return dayRate >= 0.8 ? 'excellent' : 'good';
}

function DisplayRow({ display, onCreateTask }) {
  const offlineLabel = display.offlineHours != null
    ? display.offlineHours < 1
      ? '< 1h'
      : display.offlineHours < 24
        ? `${Math.round(display.offlineHours)}h`
        : `${Math.round(display.offlineHours / 24)}d`
    : '—';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary/60 transition-colors border-b border-border-secondary/60 last:border-b-0">
      <div className="flex-shrink-0">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: display.status === 'online' ? '#34C759' : display.status === 'warning' ? '#FF9500' : display.status === 'critical' ? '#FF3B30' : '#64748b' }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-primary truncate">
            {display.locationName || display.displayId}
          </span>
          {display.city && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-muted font-mono flex-shrink-0">
              <MapPin size={9} />
              {display.city}
            </span>
          )}
        </div>
        <div className="text-[10px] text-text-muted font-mono truncate">
          {display.displayId}
          {display.displayName && display.displayName !== display.displayId ? ` · ${display.displayName}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="flex items-center gap-1 text-[10px] font-mono text-text-muted">
          <Clock size={9} />
          {offlineLabel}
        </span>
        {onCreateTask && (display.status === 'critical' || display.status === 'permanent_offline' || display.status === 'warning') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateTask(display);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-accent bg-accent-light hover:bg-accent-light transition-colors"
            title="Task erstellen"
          >
            <ClipboardPlus size={10} />
            Task
          </button>
        )}
      </div>
    </div>
  );
}

export default function OverviewDisplayHealth({ displays, onSelectDisplay, onCreateTask }) {
  const [activePattern, setActivePattern] = useState(null);
  const [cityFilter, setCityFilter] = useState(null);

  // Classify all active displays into health patterns
  const classified = useMemo(() => {
    if (!displays || displays.length === 0) return {};
    const active = displays.filter((d) => d.isActive);
    const groups = {};
    PATTERNS.forEach((p) => {
      groups[p.id] = [];
    });
    active.forEach((d) => {
      const pattern = classifyDisplay(d);
      if (groups[pattern]) {
        groups[pattern].push(d);
      }
    });
    return groups;
  }, [displays]);

  // Get all cities from active pattern for city filter
  const cities = useMemo(() => {
    if (!activePattern || !classified[activePattern]) return [];
    const citySet = new Set();
    classified[activePattern].forEach((d) => {
      if (d.city) citySet.add(d.city);
    });
    return [...citySet].sort();
  }, [activePattern, classified]);

  // Filtered display list
  const filteredDisplays = useMemo(() => {
    if (!activePattern || !classified[activePattern]) return [];
    let list = classified[activePattern];
    if (cityFilter) {
      list = list.filter((d) => d.city === cityFilter);
    }
    // Sort: worst first (most offline hours)
    return [...list].sort((a, b) => (b.offlineHours || 0) - (a.offlineHours || 0));
  }, [activePattern, classified, cityFilter]);

  const totalActive = useMemo(() => {
    return Object.values(classified).reduce((sum, arr) => sum + arr.length, 0);
  }, [classified]);

  if (!displays || displays.length === 0) return null;

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Display Health Patterns
          </h3>
          <span className="text-[10px] font-mono text-text-muted bg-surface-secondary/80 px-1.5 py-0.5 rounded">
            {totalActive} aktive Displays
          </span>
        </div>
        {activePattern && (
          <button
            onClick={() => { setActivePattern(null); setCityFilter(null); }}
            className="text-[10px] text-text-muted hover:text-text-primary font-medium transition-colors"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Pattern cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {PATTERNS.map((pattern) => {
          const count = classified[pattern.id]?.length || 0;
          const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
          const isActive = activePattern === pattern.id;

          return (
            <button
              key={pattern.id}
              onClick={() => {
                setActivePattern(isActive ? null : pattern.id);
                setCityFilter(null);
              }}
              className={`relative text-left rounded-xl p-3 transition-all border ${
                isActive
                  ? 'ring-1 shadow-sm'
                  : 'hover:shadow-sm'
              }`}
              style={{
                backgroundColor: isActive ? pattern.bg : 'transparent',
                borderColor: isActive ? pattern.border : 'rgba(148,163,184,0.2)',
                ...(isActive ? { ringColor: pattern.border } : {}),
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm font-mono font-bold" style={{ color: pattern.color }}>
                  {pattern.icon}
                </span>
                <span className="text-[10px] font-medium text-text-secondary leading-tight">
                  {pattern.label}
                </span>
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-lg font-mono font-bold" style={{ color: pattern.color }}>
                  {count}
                </span>
                <span className="text-[10px] font-mono text-text-muted mb-0.5">
                  {pct}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1 rounded-full bg-surface-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: pattern.color,
                    opacity: 0.6,
                  }}
                />
              </div>
              {isActive && (
                <ChevronUp size={12} className="absolute top-2 right-2 text-text-muted" />
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded detail panel */}
      {activePattern && filteredDisplays.length > 0 && (
        <div className="mt-4 border border-border-secondary rounded-xl overflow-hidden animate-fade-in">
          {/* City filter row */}
          {cities.length > 1 && (
            <div className="flex items-center gap-1.5 px-4 py-2 bg-surface-secondary/60 border-b border-border-secondary/60 overflow-x-auto scrollbar-none">
              <span className="text-[10px] text-text-muted font-medium flex-shrink-0">Stadt:</span>
              <button
                onClick={() => setCityFilter(null)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex-shrink-0 ${
                  !cityFilter
                    ? 'bg-[#1D1D1F] text-white'
                    : 'bg-surface-primary text-text-secondary hover:bg-surface-secondary border border-border-secondary'
                }`}
              >
                Alle ({classified[activePattern]?.length || 0})
              </button>
              {cities.map((city) => {
                const cityCount = classified[activePattern]?.filter((d) => d.city === city).length || 0;
                return (
                  <button
                    key={city}
                    onClick={() => setCityFilter(cityFilter === city ? null : city)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex-shrink-0 ${
                      cityFilter === city
                        ? 'bg-[#1D1D1F] text-white'
                        : 'bg-surface-primary text-text-secondary hover:bg-surface-secondary border border-border-secondary'
                    }`}
                  >
                    {city} ({cityCount})
                  </button>
                );
              })}
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary/40 border-b border-border-secondary/60">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold" style={{ color: PATTERNS.find((p) => p.id === activePattern)?.color }}>
                {PATTERNS.find((p) => p.id === activePattern)?.icon}
              </span>
              <span className="text-xs font-medium text-text-primary">
                {PATTERNS.find((p) => p.id === activePattern)?.label}
              </span>
              <span className="text-[10px] font-mono text-text-muted bg-surface-secondary/80 px-1.5 py-0.5 rounded">
                {filteredDisplays.length} Displays
              </span>
            </div>
            <span className="text-[10px] text-text-muted">
              {PATTERNS.find((p) => p.id === activePattern)?.description}
            </span>
          </div>

          {/* Display list */}
          <div className="max-h-[400px] overflow-y-auto">
            {filteredDisplays.map((d) => (
              <div
                key={d.displayId}
                onClick={() => onSelectDisplay?.(d)}
                className="cursor-pointer"
              >
                <DisplayRow display={d} onCreateTask={onCreateTask} />
              </div>
            ))}
          </div>
        </div>
      )}

      {activePattern && filteredDisplays.length === 0 && (
        <div className="mt-4 text-center py-8 text-xs text-text-muted">
          Keine Displays in dieser Kategorie
        </div>
      )}
    </div>
  );
}
