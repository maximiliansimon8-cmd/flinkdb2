import React from 'react';
import {
  Monitor,
  Activity,
  WifiOff,
  AlertTriangle,
  PlusCircle,
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

export default function KPICards({ kpis, activeFilter, onFilterClick, rangeLabel, comparisonKPIs }) {
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
  const showAvg = hasRange;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
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
        label="Aktive Displays"
        value={kpis.totalActive}
        icon={Monitor}
        color="#3b82f6"
        subtitle={showAvg && kpis.avgTotal !== kpis.totalActive ? `Ø ${kpis.avgTotal}` : undefined}
        onClick={() => toggle(KPI_FILTERS.ACTIVE)}
        active={activeFilter === KPI_FILTERS.ACTIVE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={kpis.totalActive}
              previous={kpis.firstTotal}
            />
          ) : null
        }
      />
      <KPICard
        label="Online"
        value={kpis.onlineCount}
        icon={Activity}
        color="#22c55e"
        subtitle={showAvg && kpis.avgOnline !== kpis.onlineCount ? `Ø ${kpis.avgOnline}` : '< 24h'}
        onClick={() => toggle(KPI_FILTERS.ONLINE)}
        active={activeFilter === KPI_FILTERS.ONLINE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={kpis.onlineCount}
              previous={kpis.firstOnline}
            />
          ) : null
        }
      />
      <KPICard
        label="Warnung"
        value={kpis.warningCount}
        icon={Clock}
        color="#f59e0b"
        subtitle={showAvg && kpis.avgWarning !== kpis.warningCount ? `Ø ${kpis.avgWarning}` : '24–72h'}
        onClick={() => toggle(KPI_FILTERS.WARNING)}
        active={activeFilter === KPI_FILTERS.WARNING}
        trend={
          hasRange ? (
            <TrendIndicator
              current={kpis.warningCount}
              previous={kpis.firstWarning}
              inverted
            />
          ) : null
        }
      />
      <KPICard
        label="Kritisch"
        value={kpis.criticalCount}
        icon={AlertTriangle}
        color="#ef4444"
        subtitle={showAvg && kpis.avgCritical !== kpis.criticalCount ? `Ø ${kpis.avgCritical}` : '72h – 7d'}
        onClick={() => toggle(KPI_FILTERS.CRITICAL)}
        active={activeFilter === KPI_FILTERS.CRITICAL}
        trend={
          hasRange ? (
            <TrendIndicator
              current={kpis.criticalCount}
              previous={kpis.firstCritical}
              inverted
            />
          ) : null
        }
      />
      <KPICard
        label="Dauerhaft Offline"
        value={kpis.permanentOfflineCount}
        icon={Skull}
        color="#dc2626"
        subtitle={showAvg && kpis.avgPermanentOffline !== kpis.permanentOfflineCount ? `Ø ${kpis.avgPermanentOffline}` : '> 7 Tage'}
        onClick={() => toggle(KPI_FILTERS.PERMANENT_OFFLINE)}
        active={activeFilter === KPI_FILTERS.PERMANENT_OFFLINE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={kpis.permanentOfflineCount}
              previous={kpis.firstPermanentOffline}
              inverted
            />
          ) : null
        }
      />
      <KPICard
        label="Nie Online"
        value={kpis.neverOnlineCount}
        icon={WifiOff}
        color="#64748b"
        subtitle={showAvg && kpis.avgNeverOnline !== kpis.neverOnlineCount ? `Ø ${kpis.avgNeverOnline}` : 'Kein Heartbeat'}
        onClick={() => toggle(KPI_FILTERS.NEVER_ONLINE)}
        active={activeFilter === KPI_FILTERS.NEVER_ONLINE}
        trend={
          hasRange ? (
            <TrendIndicator
              current={kpis.neverOnlineCount}
              previous={kpis.firstNeverOnline}
              inverted
            />
          ) : null
        }
      />
      <KPICard
        label="Neu / Deinstalliert"
        value={`+${kpis.newlyInstalled} / -${kpis.deinstalled}`}
        icon={PlusCircle}
        color="#94a3b8"
        subtitle={rangeLabel || 'Zeitraum'}
        avgLabel={comparisonKPIs ? `Vorz. +${comparisonKPIs.newlyInstalled} / -${comparisonKPIs.deinstalled}` : undefined}
        onClick={() => {
          // Cycle: null → NEW → DEINSTALLED → null
          if (activeFilter === KPI_FILTERS.NEW) toggle(KPI_FILTERS.DEINSTALLED);
          else if (activeFilter === KPI_FILTERS.DEINSTALLED) onFilterClick(null);
          else toggle(KPI_FILTERS.NEW);
        }}
        active={activeFilter === KPI_FILTERS.NEW || activeFilter === KPI_FILTERS.DEINSTALLED}
        trend={
          comparisonKPIs ? (
            <TrendIndicator
              current={kpis.newlyInstalled - kpis.deinstalled}
              previous={comparisonKPIs.newlyInstalled - comparisonKPIs.deinstalled}
            />
          ) : null
        }
      />
    </div>
  );
}
