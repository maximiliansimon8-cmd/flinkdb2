import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Plus,
  WifiOff,
  ArrowUpRight,
  RefreshCw,
  ClipboardList,
  Zap,
  ChevronDown,
  Radio,
  CheckCheck,
} from 'lucide-react';
import { supabase } from '../utils/authService';
import { isStorno, isAlreadyInstalled, isReadyForInstall } from '../metrics';
import { MapPin as MapPinIcon } from 'lucide-react';

/* ─── Shared "last read" timestamp (synced via localStorage) ─── */
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

/* Mobile Activity Feed — Liveticker
   Mobile-optimierte Version des ActivityFeed.
   Laedt Daten direkt aus Supabase (kein rawData noetig). */

const ACTIVITY_TYPES = {
  NEU: 'neu',
  UPDATE: 'update',
  WARNUNG: 'warnung',
  KRITISCH: 'kritisch',
  SYSTEM: 'system',
};

const TYPE_CONFIG = {
  [ACTIVITY_TYPES.NEU]: { label: 'Neu', color: '#22c55e', bg: 'bg-emerald-500/12', text: 'text-emerald-600', icon: Plus },
  [ACTIVITY_TYPES.UPDATE]: { label: 'Update', color: '#3b82f6', bg: 'bg-blue-500/12', text: 'text-blue-600', icon: ArrowUpRight },
  [ACTIVITY_TYPES.WARNUNG]: { label: 'Warnung', color: '#f59e0b', bg: 'bg-amber-500/12', text: 'text-amber-600', icon: AlertTriangle },
  [ACTIVITY_TYPES.KRITISCH]: { label: 'Kritisch', color: '#ef4444', bg: 'bg-red-500/12', text: 'text-red-600', icon: WifiOff },
  [ACTIVITY_TYPES.SYSTEM]: { label: 'System', color: '#a855f7', bg: 'bg-purple-500/12', text: 'text-purple-600', icon: Zap },
};

const PAGE_SIZE = 30;

/* ─── Helpers ─── */

function relativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `vor ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays}d`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

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

function getPriorityColor(priority) {
  if (priority === 'Urgent') return '#ef4444';
  if (priority === 'High') return '#f59e0b';
  return null;
}

function getTaskLocationLabel(task) {
  if (Array.isArray(task.location_names) && task.location_names.length) {
    return task.location_names.slice(0, 2).join(', ');
  }
  if (Array.isArray(task.cities) && task.cities.length) {
    return task.cities[0];
  }
  return '';
}

/* ─── Data Loading ─── */

async function loadActivitiesFromSupabase() {
  const activities = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  try {
    // 1. Recent Tasks (parallel queries)
    const [tasksResult, heartbeatsResult, syncResult, acquisitionResult] = await Promise.all([
      // Tasks from last 30 days
      supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, created_time, responsible_user, completed_date, completed_by, location_names, task_type, cities')
        .gte('created_time', thirtyDaysAgo.toISOString())
        .order('created_time', { ascending: false })
        .limit(100),

      // Critical/Warning displays from heartbeats (latest per display)
      supabase
        .from('display_heartbeats')
        .select('display_id, location_name, days_offline, display_status, heartbeat, is_alive, timestamp_parsed')
        .gte('timestamp_parsed', sevenDaysAgo.toISOString())
        .order('timestamp_parsed', { ascending: false })
        .limit(500),

      // Sync metadata for system events
      supabase
        .from('sync_metadata')
        .select('table_name, last_sync_timestamp, last_sync_status, records_fetched, records_upserted')
        .order('last_sync_timestamp', { ascending: false })
        .limit(14),

      // Aufbaubereite Standorte (Won/Signed, recent)
      supabase
        .from('acquisition')
        .select('id, airtable_id, lead_status, approval_status, vertrag_vorhanden, akquise_storno, post_install_storno, installations_status, display_location_status, location_name, city, created_at')
        .eq('lead_status', 'Won / Signed')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .limit(500),
    ]);

    // Process Tasks → Activities
    const tasks = tasksResult.data || [];
    for (const task of tasks) {
      if (task.created_time) {
        const locationLabel = getTaskLocationLabel(task);

        activities.push({
          id: `task-new-${task.id}`,
          type: ACTIVITY_TYPES.NEU,
          title: 'Neue Aufgabe',
          description: task.title + (locationLabel ? ` \u2014 ${locationLabel}` : ''),
          timestamp: new Date(task.created_time),
          icon: ClipboardList,
          tag: task.priority || null,
          tagColor: getPriorityColor(task.priority),
        });
      }

      if (task.status === 'Completed' && task.completed_date) {
        activities.push({
          id: `task-done-${task.id}`,
          type: ACTIVITY_TYPES.UPDATE,
          title: 'Aufgabe erledigt',
          description: task.title + (task.completed_by ? ` (${task.completed_by})` : ''),
          timestamp: new Date(task.completed_date),
          icon: CheckCircle2,
          tag: 'Erledigt',
          tagColor: '#22c55e',
        });
      }
    }

    // Process Heartbeats → Display Activities (deduplicate by display_id)
    const seenDisplays = new Set();
    const heartbeats = heartbeatsResult.data || [];
    for (const hb of heartbeats) {
      if (seenDisplays.has(hb.display_id)) continue;
      seenDisplays.add(hb.display_id);

      const daysOffline = hb.days_offline || 0;

      if (daysOffline >= 3 && daysOffline < 7) {
        activities.push({
          id: `display-warn-${hb.display_id}`,
          type: ACTIVITY_TYPES.WARNUNG,
          title: 'Display offline',
          description: `${hb.display_id} bei ${hb.location_name || 'Unbekannt'} \u2014 ${daysOffline}d offline`,
          timestamp: hb.timestamp_parsed ? new Date(hb.timestamp_parsed) : now,
          icon: AlertTriangle,
          tag: `${daysOffline}d`,
          tagColor: '#f59e0b',
        });
      } else if (daysOffline >= 7) {
        activities.push({
          id: `display-crit-${hb.display_id}`,
          type: ACTIVITY_TYPES.KRITISCH,
          title: 'Display kritisch offline',
          description: `${hb.display_id} bei ${hb.location_name || 'Unbekannt'} \u2014 ${daysOffline}d offline`,
          timestamp: hb.timestamp_parsed ? new Date(hb.timestamp_parsed) : now,
          icon: WifiOff,
          tag: `${daysOffline}d`,
          tagColor: '#ef4444',
        });
      }
    }

    // Process Sync → System Activities
    const syncs = syncResult.data || [];
    if (syncs.length > 0 && syncs[0].last_sync_timestamp) {
      const latestSync = syncs[0];
      const totalFetched = syncs.reduce((sum, s) => sum + (s.records_fetched || 0), 0);
      const totalUpserted = syncs.reduce((sum, s) => sum + (s.records_upserted || 0), 0);
      const failedCount = syncs.filter(s => s.last_sync_status === 'error').length;

      activities.push({
        id: `system-sync-${latestSync.last_sync_timestamp}`,
        type: ACTIVITY_TYPES.SYSTEM,
        title: 'Daten synchronisiert',
        description: `${totalFetched} Records geholt, ${totalUpserted} aktualisiert${failedCount > 0 ? ` (${failedCount} Fehler)` : ''}`,
        timestamp: new Date(latestSync.last_sync_timestamp),
        icon: RefreshCw,
        tag: failedCount > 0 ? 'Fehler' : 'OK',
        tagColor: failedCount > 0 ? '#ef4444' : '#22c55e',
      });
    }

    // Process Acquisition → Ready-for-Install Activities
    const acqRecords = acquisitionResult.data || [];
    for (const rec of acqRecords) {
      const normalized = {
        leadStatus: rec.lead_status,
        approvalStatus: rec.approval_status,
        vertragVorhanden: rec.vertrag_vorhanden,
        akquiseStorno: rec.akquise_storno,
        postInstallStorno: rec.post_install_storno,
        installationsStatus: rec.installations_status || [],
        displayLocationStatus: rec.display_location_status || [],
      };
      if (isStorno(normalized) || isAlreadyInstalled(normalized) || !isReadyForInstall(normalized)) continue;

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
        tagColor: '#22c55e',
      });
    }

  } catch (e) {
    console.warn('[MobileActivityFeed] Error loading activities:', e);
  }

  // Sort by timestamp descending
  activities.sort((a, b) => b.timestamp - a.timestamp);
  return activities;
}

/* ─── Component ─── */

export default function MobileActivityFeed() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lastRead, setLastRead] = useState(() => getLastReadTimestamp());

  useEffect(() => {
    loadActivitiesFromSupabase().then(data => {
      setActivities(data);
      setLoading(false);
    });
  }, []);

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead();
    setLastRead(new Date());
    if (navigator.vibrate) navigator.vibrate(8);
  }, []);

  const unreadCount = useMemo(() => {
    if (!lastRead) return activities.length;
    return activities.filter(a => a.timestamp > lastRead).length;
  }, [activities, lastRead]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    if (navigator.vibrate) navigator.vibrate(8);
    const data = await loadActivitiesFromSupabase();
    setActivities(data);
    setRefreshing(false);
  }, [refreshing]);

  const filteredActivities = useMemo(
    () => activeFilter ? activities.filter(a => a.type === activeFilter) : activities,
    [activities, activeFilter],
  );

  const visibleActivities = useMemo(
    () => filteredActivities.slice(0, visibleCount),
    [filteredActivities, visibleCount],
  );

  // Grouped by date
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

  const typeCounts = useMemo(() => {
    const counts = {};
    for (const a of activities) {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
    return counts;
  }, [activities]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <div className="w-full space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex gap-3 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="w-9 h-9 rounded-full bg-slate-200/60 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-slate-200/60 rounded-full w-3/4" />
                <div className="h-2.5 bg-slate-200/40 rounded-full w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-2xl border-b border-slate-200/60 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <Radio size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Liveticker</h1>
              <p className="text-[11px] text-slate-400">
                {activities.length} Aktivitaeten{unreadCount > 0 && <span className="text-blue-500 font-semibold"> · {unreadCount} neu</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50/80 text-blue-600 text-[11px] font-semibold active:bg-blue-100/80 transition-colors"
              >
                <CheckCheck size={13} />
                Alle gelesen
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-9 h-9 rounded-xl bg-slate-100/80 flex items-center justify-center active:bg-slate-200/80 transition-colors"
            >
              <RefreshCw size={16} className={`text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 no-scrollbar">
          <FilterPill
            active={!activeFilter}
            onClick={() => setActiveFilter(null)}
            label="Alle"
            count={activities.length}
          />
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
            <FilterPill
              key={type}
              active={activeFilter === type}
              onClick={() => setActiveFilter(activeFilter === type ? null : type)}
              label={cfg.label}
              count={typeCounts[type] || 0}
              color={cfg.color}
            />
          ))}
        </div>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {groupedActivities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <Activity size={40} className="text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Keine Aktivitaeten gefunden</p>
          </div>
        )}

        <div className="px-4 py-2">
          {groupedActivities.map((item, i) => {
            if (item.type === 'header') {
              return (
                <div key={`h-${item.label}`} className="flex items-center gap-2 py-3 mt-1">
                  <div className="h-px flex-1 bg-slate-200/60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">{item.label}</span>
                  <div className="h-px flex-1 bg-slate-200/60" />
                </div>
              );
            }

            const a = item.data;
            const cfg = TYPE_CONFIG[a.type] || TYPE_CONFIG[ACTIVITY_TYPES.SYSTEM];
            const Icon = a.icon || cfg.icon;
            const isUnread = !lastRead || a.timestamp > lastRead;

            return (
              <div
                key={a.id}
                className={`flex gap-3 py-3 border-b border-slate-100/60 last:border-0 mobile-fade-in ${isUnread ? 'bg-blue-50/30 -mx-2 px-2 rounded-xl' : ''}`}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                <div className="relative shrink-0">
                  <div className={`w-9 h-9 rounded-full ${cfg.bg} flex items-center justify-center`}>
                    <Icon size={16} className={cfg.text} />
                  </div>
                  {isUnread && (
                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900 truncate">{a.title}</span>
                        {a.tag && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: (a.tagColor || cfg.color) + '18',
                              color: a.tagColor || cfg.color,
                            }}
                          >
                            {a.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.description}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap shrink-0 mt-0.5">
                      {relativeTime(a.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load More */}
          {visibleCount < filteredActivities.length && (
            <button
              onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
              className="w-full py-3 mt-2 text-sm font-medium text-blue-600 bg-blue-50/50 rounded-xl active:bg-blue-100/60 transition-colors flex items-center justify-center gap-1.5"
            >
              <ChevronDown size={14} />
              Mehr laden ({filteredActivities.length - visibleCount} weitere)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label, count, color }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'bg-slate-100/80 text-slate-500'
      }`}
    >
      {color && !active && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      {count > 0 && (
        <span className={`font-mono text-[10px] ${active ? 'text-white/60' : 'text-slate-400'}`}>
          {count}
        </span>
      )}
    </button>
  );
}
