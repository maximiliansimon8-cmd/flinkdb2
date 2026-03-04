import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Monitor,
  Clock,
  Plus,
  Filter,
  ChevronDown,
  Loader2,
  WifiOff,
  ArrowUpRight,
  RefreshCw,
  MapPin,
  ClipboardList,
  Zap,
  X,
  CheckCheck,
} from 'lucide-react';
import { fetchAllTasks } from '../utils/airtableService';
import { supabase } from '../utils/authService';
import { isStorno, isAlreadyInstalled, isReadyForInstall } from '../metrics';
import { MapPin as MapPinIcon } from 'lucide-react';

/* ─── Shared "last read" timestamp (synced via localStorage with Mobile) ─── */
const LAST_READ_KEY = 'jet_liveticker_last_read';

function getLastReadTimestamp() {
  try {
    const ts = localStorage.getItem(LAST_READ_KEY);
    return ts ? new Date(ts) : null;
  } catch { return null; }
}

function markAllAsRead() {
  try {
    localStorage.setItem(LAST_READ_KEY, new Date().toISOString());
  } catch {}
}

/* ──────────────────────── Constants ──────────────────────── */

const ACTIVITY_TYPES = {
  NEU: 'neu',
  UPDATE: 'update',
  WARNUNG: 'warnung',
  KRITISCH: 'kritisch',
  SYSTEM: 'system',
};

const TYPE_CONFIG = {
  [ACTIVITY_TYPES.NEU]: {
    label: 'Neu',
    color: '#34C759',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    ring: 'ring-emerald-500/20',
    icon: Plus,
  },
  [ACTIVITY_TYPES.UPDATE]: {
    label: 'Update',
    color: '#007AFF',
    bg: 'bg-accent/15',
    text: 'text-accent',
    border: 'border-accent/30',
    ring: 'ring-accent/20',
    icon: ArrowUpRight,
  },
  [ACTIVITY_TYPES.WARNUNG]: {
    label: 'Warnung',
    color: '#FF9500',
    bg: 'bg-status-warning/15',
    text: 'text-amber-400',
    border: 'border-status-warning/30',
    ring: 'ring-amber-500/20',
    icon: AlertTriangle,
  },
  [ACTIVITY_TYPES.KRITISCH]: {
    label: 'Kritisch',
    color: '#FF3B30',
    bg: 'bg-status-offline/15',
    text: 'text-status-offline',
    border: 'border-status-offline/30',
    ring: 'ring-red-500/20',
    icon: WifiOff,
  },
  [ACTIVITY_TYPES.SYSTEM]: {
    label: 'System',
    color: '#a855f7',
    bg: 'bg-brand-purple/15',
    text: 'text-brand-purple',
    border: 'border-purple-500/30',
    ring: 'ring-purple-500/20',
    icon: Zap,
  },
};

const PAGE_SIZE = 50;

/* ──────────────────────── Helpers ──────────────────────── */

/**
 * Format a date as relative time in German.
 * e.g. "vor 2 Stunden", "Gestern", "vor 3 Tagen"
 */
function relativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Minute${diffMin !== 1 ? 'n' : ''}`;
  if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours !== 1 ? 'n' : ''}`;
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `vor ${weeks} Woche${weeks !== 1 ? 'n' : ''}`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `vor ${months} Monat${months !== 1 ? 'en' : ''}`;
  }
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format a date for the full timestamp tooltip.
 */
function formatFullDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get a date group label for timeline section headers.
 */
function getDateGroup(date) {
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDate.getTime() === today.getTime()) return 'Heute';
  if (itemDate.getTime() === yesterday.getTime()) return 'Gestern';

  const diffDays = Math.floor((today - itemDate) / 86400000);
  if (diffDays < 7) return 'Diese Woche';
  if (diffDays < 30) return 'Diesen Monat';

  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/* ──────────────────────── Activity Generation ──────────────────────── */

/**
 * Generate activity items from tasks.
 */
function generateTaskActivities(tasks) {
  if (!tasks || !Array.isArray(tasks)) return [];

  const activities = [];

  for (const task of tasks) {
    // "New task created" activity
    if (task.createdTime) {
      const locationLabel = task.locationNames?.length
        ? task.locationNames.slice(0, 2).join(', ')
        : task.partner || '';

      activities.push({
        id: `task-new-${task.id}`,
        type: ACTIVITY_TYPES.NEU,
        title: 'Neue Aufgabe erstellt',
        description: task.title + (locationLabel ? ` — ${locationLabel}` : ''),
        timestamp: new Date(task.createdTime),
        icon: ClipboardList,
        tag: task.priority || null,
        tagColor: task.priority === 'Urgent' ? '#FF3B30' : task.priority === 'High' ? '#FF9500' : null,
      });
    }

    // "Task completed" activity
    if (task.status === 'Completed' && task.completedDate) {
      activities.push({
        id: `task-done-${task.id}`,
        type: ACTIVITY_TYPES.UPDATE,
        title: 'Aufgabe erledigt',
        description: task.title + (task.completedBy ? ` (von ${task.completedBy})` : ''),
        timestamp: new Date(task.completedDate),
        icon: CheckCircle2,
        tag: 'Erledigt',
        tagColor: '#34C759',
      });
    }

    // "Task status change" for In Progress tasks (different from new)
    if (task.status === 'In Progress' && task.createdTime) {
      // We approximate the update time — use createdTime + 1ms to differentiate
      // In a real system this would come from an audit log
      activities.push({
        id: `task-progress-${task.id}`,
        type: ACTIVITY_TYPES.UPDATE,
        title: 'Aufgabe in Bearbeitung',
        description: task.title + (task.responsibleUser ? ` — ${task.responsibleUser}` : ''),
        timestamp: new Date(task.createdTime),
        icon: Clock,
        tag: 'In Bearbeitung',
        tagColor: '#FF9500',
      });
    }
  }

  return activities;
}

/**
 * Generate activity items from display data (offline warnings, new displays).
 */
function generateDisplayActivities(displays) {
  if (!displays || !Array.isArray(displays)) return [];

  const activities = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  for (const display of displays) {
    // New display (first seen within last 7 days)
    if (display.firstSeen && display.firstSeen >= sevenDaysAgo) {
      activities.push({
        id: `display-new-${display.displayId}`,
        type: ACTIVITY_TYPES.NEU,
        title: 'Neues Display',
        description: `${display.displayId} — ${display.locationName || 'Unbekannter Standort'}`,
        timestamp: display.firstSeen,
        icon: Monitor,
        tag: display.city || null,
        tagColor: '#007AFF',
      });
    }

    // Display offline warning (24-72h offline)
    if (display.status === 'warning' && display.offlineHours != null) {
      const offlineDate = display.heartbeat
        ? new Date(display.heartbeat)
        : display.lastSeen;

      activities.push({
        id: `display-warn-${display.displayId}`,
        type: ACTIVITY_TYPES.WARNUNG,
        title: 'Display offline',
        description: `${display.displayId} bei ${display.locationName || 'Unbekannt'} — seit ${Math.round(display.offlineHours)}h offline`,
        timestamp: offlineDate || now,
        icon: AlertTriangle,
        tag: display.city || null,
        tagColor: '#FF9500',
      });
    }

    // Display critical (>72h offline)
    if (display.status === 'critical' && display.offlineHours != null) {
      const offlineDate = display.heartbeat
        ? new Date(display.heartbeat)
        : display.lastSeen;

      activities.push({
        id: `display-crit-${display.displayId}`,
        type: ACTIVITY_TYPES.KRITISCH,
        title: 'Display kritisch offline',
        description: `${display.displayId} bei ${display.locationName || 'Unbekannt'} — seit ${Math.round(display.offlineHours)}h offline`,
        timestamp: offlineDate || now,
        icon: WifiOff,
        tag: `${Math.round(display.offlineHours)}h`,
        tagColor: '#FF3B30',
      });
    }

    // Display came back online recently (online with recent lastSeen and was previously offline)
    // We detect this if a display is online and lastSeen is very recent
    if (display.status === 'online' && display.lastSeen && display.lastSeen >= sevenDaysAgo) {
      // Only show for displays that have been around for a while (not brand new)
      if (display.firstSeen && display.firstSeen < sevenDaysAgo) {
        // Skip this — too noisy for established displays. Only add if coming from a snapshot change.
      }
    }
  }

  return activities;
}

/**
 * Generate system-level activities from rawData metadata.
 */
function generateSystemActivities(rawData) {
  const activities = [];

  if (rawData?.latestTimestamp) {
    activities.push({
      id: `system-sync-${rawData.latestTimestamp.getTime()}`,
      type: ACTIVITY_TYPES.SYSTEM,
      title: 'Daten synchronisiert',
      description: `${rawData.displays?.length || 0} Displays, ${rawData.totalParsedRows?.toLocaleString('de-DE') || 0} Datenpunkte geladen`,
      timestamp: rawData.latestTimestamp,
      icon: RefreshCw,
      tag: null,
      tagColor: null,
    });
  }

  // Add an activity for the trend data count
  if (rawData?.trendData?.length > 0) {
    const latestTrend = rawData.trendData[rawData.trendData.length - 1];
    if (latestTrend?.date) {
      activities.push({
        id: `system-trend-${latestTrend.date}`,
        type: ACTIVITY_TYPES.SYSTEM,
        title: 'Trend-Snapshot erstellt',
        description: `Health-Rate: ${latestTrend.healthRate?.toFixed(1) || '?'}% — ${latestTrend.totalActive || '?'} aktive Displays`,
        timestamp: new Date(latestTrend.date),
        icon: Activity,
        tag: null,
        tagColor: null,
      });
    }
  }

  return activities;
}

/**
 * Generate activity items for acquisition records that are ready-for-install.
 * Shows recently synced locations that became aufbaubereit (Won/Signed + Approved + Vertrag).
 * Uses `created_at` (Airtable record creation date) as event timestamp, capped to last 30 days.
 */
function generateReadyForInstallActivities(records) {
  if (!records || !Array.isArray(records)) return [];

  const activities = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  for (const rec of records) {
    // Normalize field names from Supabase snake_case to predicate camelCase
    const normalized = {
      leadStatus: rec.lead_status,
      approvalStatus: rec.approval_status,
      vertragVorhanden: rec.vertrag_vorhanden,
      akquiseStorno: rec.akquise_storno,
      postInstallStorno: rec.post_install_storno,
      installationsStatus: rec.installations_status || [],
      displayLocationStatus: rec.display_location_status || [],
    };

    // Apply canonical predicates
    if (isStorno(normalized) || isAlreadyInstalled(normalized) || !isReadyForInstall(normalized)) continue;

    // Use created_at as the best available "became ready" timestamp
    const ts = rec.created_at ? new Date(rec.created_at) : null;
    if (!ts || isNaN(ts.getTime()) || ts < thirtyDaysAgo) continue;

    const city = Array.isArray(rec.city) ? rec.city[0] : (rec.city || '');
    const name = rec.location_name || 'Unbekannter Standort';
    const suffix = city ? ` (${city})` : '';

    activities.push({
      id: `ready-install-${rec.airtable_id || rec.id}`,
      type: ACTIVITY_TYPES.NEU,
      title: 'Aufbaubereit',
      description: `${name}${suffix} — bereit für Installation`,
      timestamp: ts,
      icon: MapPinIcon,
      tag: city || null,
      tagColor: '#34C759',
    });
  }

  return activities;
}

/* ──────────────────────── Components ──────────────────────── */

/**
 * Single activity card in the feed.
 */
function ActivityCard({ activity, isLast, isUnread }) {
  const config = TYPE_CONFIG[activity.type] || TYPE_CONFIG[ACTIVITY_TYPES.SYSTEM];
  const IconComponent = activity.icon || config.icon;

  return (
    <div className="relative flex gap-4 group">
      {/* Timeline connector line */}
      {!isLast && (
        <div
          className="absolute left-[21px] top-[44px] bottom-0 w-px"
          style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }}
        />
      )}

      {/* Timeline dot/icon */}
      <div className="relative z-10 flex-shrink-0">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center ${config.bg} ring-2 ${config.ring} transition-all duration-200 group-hover:scale-110`}
        >
          <IconComponent size={18} style={{ color: config.color }} />
        </div>
        {isUnread && (
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-[#1D1D1F] shadow-sm shadow-blue-500/40" />
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0 pb-6">
        <div className="bg-surface-primary/60 rounded-xl border border-border-primary p-5 transition-all duration-200 group-hover:bg-surface-primary/80 group-hover:border-border-primary group-hover:shadow-lg group-hover:shadow-black/10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Type badge + Title */}
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${config.bg} ${config.text} ${config.border} border`}
                >
                  {config.label}
                </span>
                <h4 className="text-base font-semibold text-text-primary">
                  {activity.title}
                </h4>
              </div>

              {/* Description */}
              <p className="text-sm text-text-muted leading-relaxed line-clamp-3">
                {activity.description}
              </p>

              {/* Tag */}
              {activity.tag && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border"
                    style={{
                      color: activity.tagColor || '#94a3b8',
                      backgroundColor: `${activity.tagColor || '#94a3b8'}15`,
                      borderColor: `${activity.tagColor || '#94a3b8'}30`,
                    }}
                  >
                    {activity.tag}
                  </span>
                </div>
              )}
            </div>

            {/* Timestamp */}
            <div className="flex-shrink-0 text-right">
              <span
                className="text-xs text-text-muted font-medium whitespace-nowrap"
                title={formatFullDate(activity.timestamp)}
              >
                {relativeTime(activity.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Date group header for the timeline sections.
 */
function DateGroupHeader({ label }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-px flex-1 bg-surface-tertiary" />
      <span className="text-sm font-bold text-text-muted uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-surface-tertiary" />
    </div>
  );
}

/**
 * Filter pill button.
 */
function FilterPill({ type, active, count, onClick }) {
  const config = TYPE_CONFIG[type];
  if (!config) return null;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
        active
          ? `${config.bg} ${config.text} ${config.border}`
          : 'bg-surface-primary/40 text-text-muted border-border-secondary hover:bg-surface-primary/60 hover:text-text-muted'
      }`}
    >
      <config.icon size={12} />
      {config.label}
      {count > 0 && (
        <span
          className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
            active ? 'bg-white/10' : 'bg-surface-tertiary'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ──────────────────────── Summary Stats ──────────────────────── */

function SummaryStats({ activities }) {
  const counts = useMemo(() => {
    const c = {};
    for (const type of Object.values(ACTIVITY_TYPES)) {
      c[type] = 0;
    }
    for (const a of activities) {
      c[a.type] = (c[a.type] || 0) + 1;
    }
    return c;
  }, [activities]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      {Object.entries(TYPE_CONFIG).map(([type, config]) => (
        <div
          key={type}
          className={`${config.bg} border ${config.border} rounded-xl p-4 text-center transition-all duration-200 hover:scale-[1.02]`}
        >
          <div className={`text-3xl font-bold ${config.text}`}>
            {counts[type] || 0}
          </div>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mt-1">
            {config.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────── Main Component ──────────────────────── */

export default function ActivityFeed({ rawData }) {
  const [tasks, setTasks] = useState([]);
  const [acquisitionRecords, setAcquisitionRecords] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRead, setLastRead] = useState(() => getLastReadTimestamp());

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead();
    setLastRead(new Date());
  }, []);

  // Load tasks + acquisition data from Supabase
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const [allTasks, acqResult] = await Promise.all([
          fetchAllTasks(),
          supabase
            .from('acquisition')
            .select('id, airtable_id, lead_status, approval_status, vertrag_vorhanden, akquise_storno, post_install_storno, installations_status, display_location_status, location_name, city, created_at')
            .eq('lead_status', 'Won / Signed')
            .gte('created_at', thirtyDaysAgo)
            .limit(500),
        ]);
        if (!cancelled) {
          setTasks(allTasks);
          setAcquisitionRecords(acqResult.data || []);
        }
      } catch (err) {
        console.error('[ActivityFeed] Failed to load data:', err);
      } finally {
        if (!cancelled) setLoadingTasks(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Generate all activities from various data sources
  const allActivities = useMemo(() => {
    const taskActivities = generateTaskActivities(tasks);
    const displayActivities = generateDisplayActivities(rawData?.displays);
    const systemActivities = generateSystemActivities(rawData);
    const readyForInstallActivities = generateReadyForInstallActivities(acquisitionRecords);

    const combined = [...taskActivities, ...displayActivities, ...systemActivities, ...readyForInstallActivities];

    // Sort by timestamp descending (newest first)
    combined.sort((a, b) => {
      const ta = a.timestamp?.getTime() || 0;
      const tb = b.timestamp?.getTime() || 0;
      return tb - ta;
    });

    return combined;
  }, [tasks, rawData, acquisitionRecords]);

  // Compute per-type counts (always from full set, ignoring filters)
  const typeCounts = useMemo(() => {
    const counts = {};
    for (const a of allActivities) {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
    return counts;
  }, [allActivities]);

  // Apply filters and search
  const filteredActivities = useMemo(() => {
    let items = allActivities;

    // Type filter
    if (activeFilters.size > 0) {
      items = items.filter((a) => activeFilters.has(a.type));
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (a) =>
          (a.title && a.title.toLowerCase().includes(q)) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          (a.tag && a.tag.toLowerCase().includes(q))
      );
    }

    return items;
  }, [allActivities, activeFilters, searchQuery]);

  // Paginated slice
  const visibleActivities = useMemo(
    () => filteredActivities.slice(0, visibleCount),
    [filteredActivities, visibleCount]
  );

  // Group by date
  const groupedActivities = useMemo(() => {
    const groups = [];
    let currentGroup = null;

    for (const activity of visibleActivities) {
      const group = getDateGroup(activity.timestamp);
      if (group !== currentGroup) {
        groups.push({ type: 'header', label: group });
        currentGroup = group;
      }
      groups.push({ type: 'activity', data: activity });
    }

    return groups;
  }, [visibleActivities]);

  // Toggle filter
  const toggleFilter = useCallback((type) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setActiveFilters(new Set());
    setSearchQuery('');
    setVisibleCount(PAGE_SIZE);
  }, []);

  const hasMore = visibleCount < filteredActivities.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center ring-1 ring-accent/20">
            <Activity size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-text-primary">Aktivitäten</h2>
            <p className="text-sm text-text-muted">
              {allActivities.length} Aktivitäten insgesamt
              {(() => {
                const unread = lastRead ? allActivities.filter(a => a.timestamp > lastRead).length : allActivities.length;
                return unread > 0 ? <span className="text-accent font-medium"> · {unread} neu</span> : null;
              })()}
              {loadingTasks && ' — Lade Tasks...'}
            </p>
          </div>
          {(() => {
            const unread = lastRead ? allActivities.filter(a => a.timestamp > lastRead).length : allActivities.length;
            return unread > 0 ? (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-all"
              >
                <CheckCheck size={15} />
                Alle gelesen
              </button>
            ) : null;
          })()}
        </div>
      </div>

      {/* Summary stats */}
      <SummaryStats activities={allActivities} />

      {/* Filter bar */}
      <div className="mb-6 space-y-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Aktivitäten durchsuchen..."
            className="w-full bg-surface-primary/60 border border-border-primary rounded-xl px-4 py-3 text-base text-text-muted placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-muted transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-text-muted" />
          {Object.values(ACTIVITY_TYPES).map((type) => (
            <FilterPill
              key={type}
              type={type}
              active={activeFilters.has(type)}
              count={typeCounts[type] || 0}
              onClick={() => toggleFilter(type)}
            />
          ))}
          {(activeFilters.size > 0 || searchQuery) && (
            <button
              onClick={clearFilters}
              className="text-xs text-text-muted hover:text-text-muted underline underline-offset-2 ml-2 transition-colors"
            >
              Zurücksetzen
            </button>
          )}
        </div>

        {/* Result count */}
        {(activeFilters.size > 0 || searchQuery) && (
          <p className="text-sm text-text-muted">
            {filteredActivities.length} von {allActivities.length} Aktivitäten
          </p>
        )}
      </div>

      {/* Loading state */}
      {loadingTasks && allActivities.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          <span className="ml-2 text-base text-text-muted">Lade Aktivitäten...</span>
        </div>
      )}

      {/* Empty state */}
      {!loadingTasks && filteredActivities.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-surface-primary/60 flex items-center justify-center mx-auto mb-4">
            <Activity size={24} className="text-text-secondary" />
          </div>
          <h3 className="text-base font-semibold text-text-muted mb-1">
            Keine Aktivitäten gefunden
          </h3>
          <p className="text-sm text-text-muted">
            {searchQuery || activeFilters.size > 0
              ? 'Versuche andere Filter oder Suchbegriffe.'
              : 'Noch keine Aktivitäten vorhanden.'}
          </p>
        </div>
      )}

      {/* Timeline feed */}
      {groupedActivities.length > 0 && (
        <div className="relative">
          {groupedActivities.map((item, i) => {
            if (item.type === 'header') {
              return <DateGroupHeader key={`h-${item.label}-${i}`} label={item.label} />;
            }

            // Check if this is the last activity item
            const isLast = i === groupedActivities.length - 1 ||
              (i < groupedActivities.length - 1 && groupedActivities[i + 1].type === 'header' &&
                i + 1 === groupedActivities.length - 1);

            const isUnread = !lastRead || item.data.timestamp > lastRead;

            return (
              <ActivityCard
                key={item.data.id}
                activity={item.data}
                isLast={i === groupedActivities.length - 1}
                isUnread={isUnread}
              />
            );
          })}
        </div>
      )}

      {/* Load more button */}
      {hasMore && (
        <div className="text-center mt-6 mb-4">
          <button
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-primary/60 border border-border-primary text-base font-medium text-text-muted hover:bg-surface-primary/80 hover:border-border-primary hover:text-text-muted transition-all duration-200"
          >
            <ChevronDown size={14} />
            Mehr laden ({filteredActivities.length - visibleCount} weitere)
          </button>
        </div>
      )}
    </div>
  );
}
