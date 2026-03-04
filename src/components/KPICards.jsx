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
      <span className="inline-flex items-center gap-0.5 text-[11px] font-mono text-text-muted">
        <Minus size={10} />
        <span>±0</span>
      </span>
    );
  }
  const isPositive = inverted ? diff < 0 : diff > 0;
  const color = isPositive ? 'var(--color-status-online)' : 'var(--color-status-offline)';
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const sign = diff > 0 ? '+' : '';
  const displayDiff = Number.isInteger(diff) ? diff : diff.toFixed(1);

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-mono"
      style={{ color }}
    >
      <Icon size={11} />
      <span>{sign}{displayDiff}</span>
    </span>
  );
}

function KPICard({ label, value, icon: Icon, color, subtitle, large, onClick, active, trend, avgLabel }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-primary border rounded-2xl p-5 shadow-card transition-all duration-150 ${
        large ? 'col-span-1 md:col-span-2 lg:col-span-1' : ''
      } ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } ${
        active
          ? 'border-accent border-l-[3px]'
          : 'border-border-secondary'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-text-secondary font-medium">
          {label}
        </span>
        <Icon size={16} className="text-text-muted" />
      </div>
      <div className="flex items-end gap-2">
        <div
          className={`font-mono font-bold tracking-tight ${large ? 'text-[34px] leading-none' : 'text-[28px] leading-none'}`}
          style={{ color }}
        >
          {value}
        </div>
        {trend}
      </div>
      {(subtitle || avgLabel) && (
        <div className="flex items-center gap-2 mt-2">
          {subtitle && (
            <span className="text-text-muted text-[12px]">{subtitle}</span>
          )}
          {avgLabel && (
            <span className="text-text-muted text-[11px] font-mono bg-surface-secondary px-1.5 py-0.5 rounded-md">
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
      ? 'var(--color-status-online)'
      : kpis.healthRate >= 70
        ? 'var(--color-status-warning)'
        : 'var(--color-status-offline)';

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
        <div className="flex items-center justify-center gap-2 mb-3 py-2 px-4 bg-accent/8 border border-accent/15 rounded-xl text-[13px] text-accent font-medium animate-fade-in">
          <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Aktualisiere Daten...
        </div>
      )}
      {kpis._cached && (
        <div className="flex items-center justify-center gap-1.5 mb-2 py-1 px-3 text-[11px] text-text-muted">
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
        color="var(--color-accent)"
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
        color="var(--color-status-online)"
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
        color="var(--color-status-warning)"
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
        color="var(--color-status-offline)"
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
        color="var(--color-status-offline)"
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
        color="var(--color-text-muted)"
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
