import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, ArrowRight, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../utils/authService';

const STATUS_LABELS = {
  online: 'Online',
  warning: 'Warnung',
  critical: 'Kritisch',
  permanent_offline: 'Dauerhaft Offline',
};

const STATUS_COLORS = {
  online: '#34C759',
  warning: '#FF9500',
  critical: '#FF3B30',
  permanent_offline: '#FF3B30',
};

function StatusBadge({ status }) {
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
      style={{
        color: STATUS_COLORS[status] || '#64748b',
        backgroundColor: `${STATUS_COLORS[status] || '#64748b'}15`,
      }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function classifyStatus(daysOffline) {
  const d = Number(daysOffline) || 0;
  if (d < 1) return 'online';
  if (d < 3) return 'warning';
  if (d < 7) return 'critical';
  return 'permanent_offline';
}

export default function DisplayTrends({ onSelectDisplay }) {
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [daysBack, setDaysBack] = useState(7);
  const [expandedSection, setExpandedSection] = useState('improved');

  useEffect(() => {
    loadTrends();
  }, [daysBack]);

  async function loadTrends() {
    setLoading(true);
    setError(null);
    try {
      // Fetch current snapshot (latest per display)
      const { data: currentRows, error: err1 } = await supabase
        .from('display_heartbeats')
        .select('display_id, raw_display_id, days_offline, location_name, display_status, timestamp_parsed')
        .order('timestamp_parsed', { ascending: false })
        .limit(2000);

      if (err1) throw err1;

      // Deduplicate to latest per display
      const currentMap = new Map();
      for (const row of currentRows || []) {
        if (row.display_id && !currentMap.has(row.display_id)) {
          currentMap.set(row.display_id, row);
        }
      }

      // Fetch historical snapshot (oldest heartbeat per display within the comparison window)
      // We get rows from around N days ago and pick the closest per display
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      const windowStart = new Date(cutoffDate);
      windowStart.setDate(windowStart.getDate() - 2); // 2-day window for data availability

      const { data: historicalRows, error: err2 } = await supabase
        .from('display_heartbeats')
        .select('display_id, days_offline, timestamp_parsed')
        .gte('timestamp_parsed', windowStart.toISOString())
        .lte('timestamp_parsed', new Date(cutoffDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString())
        .order('timestamp_parsed', { ascending: true })
        .limit(3000);

      if (err2) throw err2;

      // Deduplicate historical: pick earliest per display in the window (closest to N days ago)
      const historicalMap = new Map();
      for (const row of historicalRows || []) {
        if (row.display_id && !historicalMap.has(row.display_id)) {
          historicalMap.set(row.display_id, row);
        }
      }

      // Compare and classify trends
      const improved = [];
      const worsened = [];

      for (const [displayId, current] of currentMap) {
        const previous = historicalMap.get(displayId);
        if (!previous) continue;

        const currentStatus = classifyStatus(current.days_offline);
        const previousStatus = classifyStatus(previous.days_offline);

        if (currentStatus === previousStatus) continue;

        const statusOrder = { online: 0, warning: 1, critical: 2, permanent_offline: 3 };
        const currentRank = statusOrder[currentStatus];
        const previousRank = statusOrder[previousStatus];

        const entry = {
          displayId,
          rawDisplayId: current.raw_display_id,
          locationName: current.location_name || displayId,
          currentStatus,
          previousStatus,
          currentDaysOffline: Number(current.days_offline) || 0,
          previousDaysOffline: Number(previous.days_offline) || 0,
        };

        if (currentRank < previousRank) {
          improved.push(entry);
        } else {
          worsened.push(entry);
        }
      }

      // Sort: biggest change first
      improved.sort((a, b) => {
        const statusOrder = { online: 0, warning: 1, critical: 2, permanent_offline: 3 };
        const diffA = statusOrder[a.previousStatus] - statusOrder[a.currentStatus];
        const diffB = statusOrder[b.previousStatus] - statusOrder[b.currentStatus];
        return diffB - diffA;
      });

      worsened.sort((a, b) => {
        const statusOrder = { online: 0, warning: 1, critical: 2, permanent_offline: 3 };
        const diffA = statusOrder[a.currentStatus] - statusOrder[a.previousStatus];
        const diffB = statusOrder[b.currentStatus] - statusOrder[b.previousStatus];
        return diffB - diffA;
      });

      setTrends({ improved, worsened, totalTracked: currentMap.size });
    } catch (err) {
      console.error('[DisplayTrends] Error:', err.message);
      setError('Trends konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
        <span className="ml-2 text-sm text-text-muted">Lade Display-Trends...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-status-offline text-sm">{error}</div>
    );
  }

  if (!trends) return null;

  const { improved, worsened } = trends;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Display Status-Trends</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Veränderungen der letzten {daysBack} Tage · {trends.totalTracked} Displays überwacht
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            className="text-xs border border-border-secondary rounded-lg px-2 py-1 bg-surface-primary text-text-secondary"
          >
            <option value={3}>3 Tage</option>
            <option value={7}>7 Tage</option>
            <option value={14}>14 Tage</option>
            <option value={30}>30 Tage</option>
          </select>
          <button
            onClick={loadTrends}
            className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors"
            title="Neu laden"
          >
            <RefreshCw size={14} className="text-text-muted" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className={`bg-status-online/10/60 border rounded-xl p-3 cursor-pointer transition-all ${
            expandedSection === 'improved' ? 'border-green-300 ring-1 ring-green-200' : 'border-green-100'
          }`}
          onClick={() => setExpandedSection(expandedSection === 'improved' ? null : 'improved')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-status-online" />
              <span className="text-sm font-semibold text-green-700">Verbessert</span>
            </div>
            <span className="text-2xl font-mono font-bold text-status-online">{improved.length}</span>
          </div>
          <p className="text-[10px] text-status-online mt-1">
            {improved.filter(d => d.currentStatus === 'online').length} jetzt online
          </p>
        </div>
        <div
          className={`bg-status-offline/10/60 border rounded-xl p-3 cursor-pointer transition-all ${
            expandedSection === 'worsened' ? 'border-red-300 ring-1 ring-red-200' : 'border-red-100'
          }`}
          onClick={() => setExpandedSection(expandedSection === 'worsened' ? null : 'worsened')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown size={16} className="text-status-offline" />
              <span className="text-sm font-semibold text-red-700">Verschlechtert</span>
            </div>
            <span className="text-2xl font-mono font-bold text-status-offline">{worsened.length}</span>
          </div>
          <p className="text-[10px] text-status-offline mt-1">
            {worsened.filter(d => d.currentStatus === 'permanent_offline').length} dauerhaft offline
          </p>
        </div>
      </div>

      {/* Improved list */}
      {expandedSection === 'improved' && (
        <div className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border-secondary bg-status-online/10/30">
            <span className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
              <TrendingUp size={12} />
              Verbesserte Displays ({improved.length})
            </span>
          </div>
          {improved.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-text-muted">
              Keine Verbesserungen im gewählten Zeitraum
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
              {improved.map((d) => (
                <div
                  key={d.displayId}
                  className="px-3 py-2 flex items-center justify-between hover:bg-surface-secondary/50 cursor-pointer transition-colors"
                  onClick={() => onSelectDisplay?.(d.rawDisplayId || d.displayId)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-text-primary truncate">{d.locationName}</div>
                    <div className="text-[10px] text-text-muted font-mono">{d.rawDisplayId || d.displayId}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <StatusBadge status={d.previousStatus} />
                    <ArrowRight size={10} className="text-status-online" />
                    <StatusBadge status={d.currentStatus} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Worsened list */}
      {expandedSection === 'worsened' && (
        <div className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border-secondary bg-status-offline/10/30">
            <span className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
              <TrendingDown size={12} />
              Verschlechterte Displays ({worsened.length})
            </span>
          </div>
          {worsened.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-text-muted">
              Keine Verschlechterungen im gewählten Zeitraum
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
              {worsened.map((d) => (
                <div
                  key={d.displayId}
                  className="px-3 py-2 flex items-center justify-between hover:bg-surface-secondary/50 cursor-pointer transition-colors"
                  onClick={() => onSelectDisplay?.(d.rawDisplayId || d.displayId)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-text-primary truncate">{d.locationName}</div>
                    <div className="text-[10px] text-text-muted font-mono">{d.rawDisplayId || d.displayId}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <StatusBadge status={d.previousStatus} />
                    <ArrowRight size={10} className="text-status-offline" />
                    <StatusBadge status={d.currentStatus} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
