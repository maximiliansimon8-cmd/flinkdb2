import React from 'react';
import {
  Monitor,
  Activity,
  WifiOff,
  AlertTriangle,
  Clock,
  Skull,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

function TrendIndicator({ current, previous, inverted }) {
  if (previous == null || current == null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-slate-400">
        <Minus size={10} />
        <span>±0</span>
      </span>
    );
  }
  const isPositive = inverted ? diff < 0 : diff > 0;
  const color = isPositive ? '#22c55e' : '#ef4444';
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const sign = diff > 0 ? '+' : '';
  const displayDiff = Number.isInteger(diff) ? diff : diff.toFixed(1);

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-mono"
      style={{ color }}
    >
      <Icon size={10} />
      <span>{sign}{displayDiff}</span>
    </span>
  );
}

function KPICard({ label, value, icon: Icon, color, subtitle, large, onClick, active, trend, avgLabel }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white/60 backdrop-blur-xl border rounded-2xl p-4 shadow-sm shadow-black/[0.03] transition-all ${
        large ? 'col-span-1 md:col-span-2 lg:col-span-1' : ''
      } ${
        onClick ? 'cursor-pointer hover:bg-white/80' : ''
      } ${
        active
          ? 'border-[#3b82f6] ring-1 ring-[#3b82f6]/30'
          : 'border-slate-200/60'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
        <Icon size={16} style={{ color }} className="opacity-70" />
      </div>
      <div className="flex items-end gap-2">
        <div
          className={`font-mono font-bold ${large ? 'text-4xl' : 'text-2xl'}`}
          style={{ color }}
        >
          {value}
        </div>
        {trend}
      </div>
      {(subtitle || avgLabel) && (
        <div className="flex items-center gap-2 mt-1">
          {subtitle && (
            <span className="text-slate-400 text-xs">{subtitle}</span>
          )}
          {avgLabel && (
            <span className="text-slate-400 text-[10px] font-mono bg-slate-50/80 px-1.5 py-0.5 rounded">
              {avgLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Import from shared constants + re-export for backwards compatibility
import { KPI_FILTERS } from '../constants/kpiFilters';
export { KPI_FILTERS };

export default function KPICards({ kpis, activeFilter, onFilterClick, rangeLabel, comparisonKPIs, isRefreshing }) {
  const healthColor =
    kpis.healthRate >= 90
      ? '#22c55e'
      : kpis.healthRate >= 70
        ? '#f59e0b'
        : '#ef4444';

  const toggle = (filter) => {
    onFilterClick(activeFilter === filter ? null : filter);
  };

  const hasRange = kpis.snapshotCount >= 2;

  // When a date range is active, show avg values as main numbers
  // and current (live) values as subtitle context
  const useAvg = hasRange && kpis.avgOnline != null;

  return (
    <div className="relative">
      {isRefreshing && (
        <div className="flex items-center justify-center gap-2 mb-2 py-1.5 px-3 bg-blue-50/80 border border-blue-200/40 rounded-xl text-xs text-blue-600 font-mono animate-fade-in">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Aktualisiere Daten...
        </div>
      )}
      {kpis._cached && (
        <div className="flex items-center justify-center gap-1.5 mb-2 py-1 px-3 text-[10px] text-slate-400 font-mono">
          Letzte bekannte Daten{kpis._cachedTimestamp ? ` · ${new Date(kpis._cachedTimestamp).toLocaleString('de-DE')}` : ''}
        </div>
      )}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      <KPICard
        label="Health Rate"
        value={`${kpis.healthRate}%`}
        icon={Activity}
        color={healthColor}
        subtitle={kpis.snapshotCount > 0 ? `Ø ${kpis.snapshotCount} Tage · 06–22 Uhr` : undefined}
        avgLabel={rangeLabel || undefined}
        large
        trend={
          hasRange ? (
            <TrendIndicator
              current={kpis.healthRate}
              previous={kpis.firstHealthRate}
            />
          ) : null
        }
      />
      <KPICard
        label="Installierte Displays"
        value={useAvg ? kpis.avgTotal : (kpis.installed || kpis.totalActive)}
        icon={Monitor}
        color="#3b82f6"
        subtitle={
          useAvg
            ? `Aktuell: ${kpis.installed || kpis.totalActive}${kpis.daynTotal ? ` (${(kpis.installed || kpis.totalActive) - kpis.daynTotal} + ${kpis.daynTotal} Dayn)` : ''}`
            : (kpis.daynTotal
                ? `${kpis.heartbeatTotal || ((kpis.installed || kpis.totalActive) - (kpis.daynTotal || 0))} Navori + ${kpis.daynTotal} Dayn`
                : 'Laut Airtable')
        }
        avgLabel={useAvg ? `Ø ${rangeLabel}` : undefined}
        onClick={() => toggle(KPI_FILTERS.ACTIVE)}
        active={activeFilter === KPI_FILTERS.ACTIVE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={useAvg ? kpis.avgTotal : (kpis.installed || kpis.totalActive)}
              previous={kpis.firstTotal}
            />
          ) : null
        }
      />
      <KPICard
        label="Online"
        value={useAvg ? kpis.avgOnline : kpis.onlineCount}
        icon={Activity}
        color="#22c55e"
        subtitle={useAvg ? `Aktuell: ${kpis.onlineCount}` : '< 24h'}
        avgLabel={useAvg ? `Ø ${rangeLabel}` : undefined}
        onClick={() => toggle(KPI_FILTERS.ONLINE)}
        active={activeFilter === KPI_FILTERS.ONLINE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={useAvg ? kpis.avgOnline : kpis.onlineCount}
              previous={kpis.firstOnline}
            />
          ) : null
        }
      />
      <KPICard
        label="Warnung"
        value={useAvg ? kpis.avgWarning : kpis.warningCount}
        icon={Clock}
        color="#f59e0b"
        subtitle={useAvg ? `Aktuell: ${kpis.warningCount}` : '24–72h'}
        avgLabel={useAvg ? `Ø ${rangeLabel}` : undefined}
        onClick={() => toggle(KPI_FILTERS.WARNING)}
        active={activeFilter === KPI_FILTERS.WARNING}
        trend={
          hasRange ? (
            <TrendIndicator
              current={useAvg ? kpis.avgWarning : kpis.warningCount}
              previous={kpis.firstWarning}
              inverted
            />
          ) : null
        }
      />
      <KPICard
        label="Kritisch"
        value={useAvg ? kpis.avgCritical : kpis.criticalCount}
        icon={AlertTriangle}
        color="#ef4444"
        subtitle={useAvg ? `Aktuell: ${kpis.criticalCount}` : '72h – 7d'}
        avgLabel={useAvg ? `Ø ${rangeLabel}` : undefined}
        onClick={() => toggle(KPI_FILTERS.CRITICAL)}
        active={activeFilter === KPI_FILTERS.CRITICAL}
        trend={
          hasRange ? (
            <TrendIndicator
              current={useAvg ? kpis.avgCritical : kpis.criticalCount}
              previous={kpis.firstCritical}
              inverted
            />
          ) : null
        }
      />
      <KPICard
        label="Dauerhaft Offline"
        value={useAvg ? kpis.avgPermanentOffline : kpis.permanentOfflineCount}
        icon={Skull}
        color="#dc2626"
        subtitle={useAvg ? `Aktuell: ${kpis.permanentOfflineCount}` : '> 7 Tage'}
        avgLabel={useAvg ? `Ø ${rangeLabel}` : undefined}
        onClick={() => toggle(KPI_FILTERS.PERMANENT_OFFLINE)}
        active={activeFilter === KPI_FILTERS.PERMANENT_OFFLINE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={useAvg ? kpis.avgPermanentOffline : kpis.permanentOfflineCount}
              previous={kpis.firstPermanentOffline}
              inverted
            />
          ) : null
        }
      />
      <KPICard
        label="Nie Online"
        value={useAvg ? kpis.avgNeverOnline : kpis.neverOnlineCount}
        icon={WifiOff}
        color="#64748b"
        subtitle={useAvg ? `Aktuell: ${kpis.neverOnlineCount}` : 'Kein Heartbeat'}
        avgLabel={useAvg ? `Ø ${rangeLabel}` : undefined}
        onClick={() => toggle(KPI_FILTERS.NEVER_ONLINE)}
        active={activeFilter === KPI_FILTERS.NEVER_ONLINE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={useAvg ? kpis.avgNeverOnline : kpis.neverOnlineCount}
              previous={kpis.firstNeverOnline}
              inverted
            />
          ) : null
        }
      />
    </div>
    </div>
  );
}
