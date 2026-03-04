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
      <span className="inline-flex items-center gap-1 text-[13px] text-[#86868B]">
        <Minus size={12} />
        <span>±0</span>
      </span>
    );
  }
  const isPositive = inverted ? diff < 0 : diff > 0;
  const color = isPositive ? '#34C759' : '#FF3B30';
  const bgColor = isPositive ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)';
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const sign = diff > 0 ? '+' : '';
  const displayDiff = Number.isInteger(diff) ? diff : diff.toFixed(1);

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-semibold px-1.5 py-0.5 rounded-md"
      style={{ color, backgroundColor: bgColor }}
    >
      <Icon size={12} />
      <span>{sign}{displayDiff}</span>
    </span>
  );
}

function KPICard({ label, value, icon: Icon, color, subtitle, large, onClick, active, trend, avgLabel }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-primary rounded-2xl p-5 transition-all duration-200 ${
        large ? 'col-span-1 md:col-span-2 lg:col-span-1' : ''
      } ${
        onClick ? 'cursor-pointer hover:scale-[1.02] hover:shadow-lg' : ''
      } ${
        active
          ? 'ring-2 ring-[#007AFF] shadow-lg'
          : 'shadow-sm'
      }`}
      style={{
        border: active ? 'none' : '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[14px] text-[#86868B] font-medium">
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '14' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div className="flex items-end gap-2.5">
        <div
          className={`font-semibold tracking-tight ${large ? 'text-[36px] leading-none' : 'text-[30px] leading-none'}`}
          style={{ color: '#1D1D1F' }}
        >
          {value}
        </div>
        {trend}
      </div>
      {(subtitle || avgLabel) && (
        <div className="flex items-center gap-2 mt-2.5">
          {subtitle && (
            <span className="text-[#86868B] text-[13px]">{subtitle}</span>
          )}
          {avgLabel && (
            <span className="text-[#86868B] text-[12px] bg-[#F5F5F7] px-2 py-0.5 rounded-md font-medium">
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
      ? '#34C759'
      : kpis.healthRate >= 70
        ? '#FF9500'
        : '#FF3B30';

  const toggle = (filter) => {
    onFilterClick(activeFilter === filter ? null : filter);
  };

  const hasRange = kpis.snapshotCount >= 2;

  // When a date range is active, show avg values as main numbers
  const useAvg = hasRange && kpis.avgOnline != null;

  return (
    <div className="relative">
      {isRefreshing && (
        <div className="flex items-center justify-center gap-2 mb-3 py-2.5 px-4 bg-[#007AFF]/8 rounded-xl text-[14px] text-[#007AFF] font-medium animate-fade-in">
          <div className="w-4 h-4 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
          Daten werden aktualisiert
        </div>
      )}
      {kpis._cached && (
        <div className="flex items-center justify-center gap-1.5 mb-2 py-1 px-3 text-[13px] text-[#86868B]">
          Letzte bekannte Daten{kpis._cachedTimestamp ? ` · ${new Date(kpis._cachedTimestamp).toLocaleString('de-DE')}` : ''}
        </div>
      )}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      <KPICard
        label="Health Rate"
        value={`${kpis.healthRate}%`}
        icon={Activity}
        color={healthColor}
        subtitle={kpis.snapshotCount > 0 ? `Ø ${kpis.snapshotCount} Tage` : undefined}
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
        label="Displays"
        value={useAvg ? kpis.avgTotal : (kpis.installed || kpis.totalActive)}
        icon={Monitor}
        color="#007AFF"
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
        color="#34C759"
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
        color="#FF9500"
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
        color="#FF3B30"
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
        color="#FF3B30"
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
        color="#86868B"
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
