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
  const bgColor = isPositive ? 'rgba(52, 199, 89, 0.12)' : 'rgba(255, 59, 48, 0.12)';
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const sign = diff > 0 ? '+' : '';
  const displayDiff = Number.isInteger(diff) ? diff : diff.toFixed(1);

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, backgroundColor: bgColor }}
    >
      <Icon size={11} />
      <span>{sign}{displayDiff}</span>
    </span>
  );
}

function HeroCard({ label, value, icon: Icon, color, subtitle, onClick, active, trend, avgLabel }) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-6 transition-all duration-200 col-span-2 md:col-span-2 lg:col-span-2 ${
        onClick ? 'cursor-pointer hover:shadow-xl hover:-translate-y-0.5' : ''
      } ${
        active ? 'ring-2 ring-white/50 shadow-xl' : 'shadow-lg'
      }`}
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}DD)`,
      }}
    >
      {/* Decorative circle */}
      <div
        className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-15"
        style={{ background: 'white' }}
      />
      <div
        className="absolute -right-2 -bottom-8 w-24 h-24 rounded-full opacity-10"
        style={{ background: 'white' }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[14px] text-white/80 font-medium">
            {label}
          </span>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
            <Icon size={20} className="text-white" />
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="text-[42px] leading-none font-bold tracking-tight text-white">
            {value}
          </div>
          {trend && (
            <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white mb-1">
              {trend.props.current != null && trend.props.previous != null && (
                <>
                  {trend.props.current - trend.props.previous > 0 ? <TrendingUp size={12} /> : trend.props.current - trend.props.previous < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                  <span>
                    {trend.props.current - trend.props.previous > 0 ? '+' : ''}
                    {Number.isInteger(trend.props.current - trend.props.previous)
                      ? trend.props.current - trend.props.previous
                      : (trend.props.current - trend.props.previous).toFixed(1)}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
        {(subtitle || avgLabel) && (
          <div className="flex items-center gap-2 mt-3">
            {subtitle && (
              <span className="text-white/60 text-[13px]">{subtitle}</span>
            )}
            {avgLabel && (
              <span className="text-white/80 text-[12px] bg-white/15 px-2.5 py-0.5 rounded-full font-medium">
                {avgLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color, subtitle, onClick, active, trend, avgLabel }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-5 transition-all duration-200 border border-[#E8E8ED]/60 ${
        onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : ''
      } ${
        active ? 'ring-2 ring-[#007AFF] shadow-lg border-transparent' : 'shadow-card'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-[#86868B] font-medium">
          {label}
        </span>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="flex items-end gap-2">
        <div
          className="text-[28px] leading-none font-bold tracking-tight"
          style={{ color: '#1D1D1F' }}
        >
          {value}
        </div>
        {trend}
      </div>
      {(subtitle || avgLabel) && (
        <div className="flex items-center gap-2 mt-2.5">
          {subtitle && (
            <span className="text-[#AEAEB2] text-[12px]">{subtitle}</span>
          )}
          {avgLabel && (
            <span className="text-[#86868B] text-[11px] bg-[#F2F2F7] px-2 py-0.5 rounded-full font-medium">
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
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4">
      <HeroCard
        label="Health Rate"
        value={`${kpis.healthRate}%`}
        icon={Activity}
        color={healthColor}
        subtitle={kpis.snapshotCount > 0 ? `Ø ${kpis.snapshotCount} Tage` : undefined}
        avgLabel={rangeLabel || undefined}
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
            ? `Aktuell: ${kpis.installed || kpis.totalActive}`
            : (kpis.daynTotal
                ? `${kpis.heartbeatTotal || ((kpis.installed || kpis.totalActive) - (kpis.daynTotal || 0))} + ${kpis.daynTotal} Dayn`
                : undefined)
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
