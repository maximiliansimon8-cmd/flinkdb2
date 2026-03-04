import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';

const PRESETS = [
  { label: '7T', days: 7 },
  { label: '14T', days: 14 },
  { label: '30T', days: 30 },
  { label: '60T', days: 60 },
  { label: '90T', days: 90 },
  { label: '180T', days: 180 },
  { label: '365T', days: 365 },
];

function toInputValue(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromInputValue(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-surface-elevated border border-border-secondary rounded-[var(--radius-md)] px-3.5 py-2.5 text-xs shadow-lg">
      <div className="text-text-muted mb-1 font-medium">{data.date}</div>
      <div className="text-accent font-bold text-[13px]">
        {data.healthRate}% Betriebszeit
      </div>
      <div className="text-text-secondary mt-0.5">
        {data.totalOnlineHours != null
          ? `${data.totalOnlineHours}h / ${data.totalExpectedHours}h (06\u201322 Uhr)`
          : `${data.online}/${data.total} Displays`}
      </div>
      <div className="text-text-secondary">
        {data.total} Displays
      </div>
      {data.compHealthRate != null && (
        <div className="text-status-purple mt-1.5 border-t border-border-secondary pt-1.5">
          {data.compDate && <span className="text-text-muted">{data.compDate}: </span>}
          Vorperiode: {data.compHealthRate}%
        </div>
      )}
    </div>
  );
}

export default function HealthTrendChart({
  trendData,
  rangeLabel = '30 Tage',
  comparisonHealthRate,
  comparisonTrendData,
  rangeStart,
  rangeEnd,
  dataEarliest,
  dataLatest,
  onRangeChange,
}) {
  const [showCustomDate, setShowCustomDate] = useState(false);

  // Determine which preset is active
  const activePreset = useMemo(() => {
    return PRESETS.find((p) => {
      if (!rangeStart || !dataLatest) return false;
      const expected = new Date(dataLatest.getTime() - p.days * 24 * 60 * 60 * 1000);
      expected.setHours(0, 0, 0, 0);
      const actual = new Date(rangeStart);
      actual.setHours(0, 0, 0, 0);
      return actual.getTime() === expected.getTime() && !rangeEnd;
    });
  }, [rangeStart, rangeEnd, dataLatest]);

  const isCustomActive = !activePreset && (rangeStart || rangeEnd);

  const handlePreset = (days) => {
    if (!onRangeChange || !dataLatest) return;
    const start = new Date(dataLatest.getTime() - days * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    onRangeChange(start, null);
    setShowCustomDate(false);
  };

  if (!trendData || trendData.length === 0) {
    return (
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-card">
        <h3 className="text-[13px] font-medium text-text-secondary mb-4">
          Health Trend ({rangeLabel})
        </h3>
        <div className="h-48 flex items-center justify-center text-text-muted">
          Keine Trenddaten verfügbar
        </div>
      </div>
    );
  }

  // Downsample if too many points: pick ~1 per day
  let chartData = trendData;
  if (trendData.length > 60) {
    const step = Math.ceil(trendData.length / 60);
    chartData = trendData.filter((_, i) => i % step === 0 || i === trendData.length - 1);
  }

  // Merge comparison data day-by-day aligned
  const mergedData = useMemo(() => {
    let compData = comparisonTrendData || [];
    if (compData.length > 60) {
      const step = Math.ceil(compData.length / 60);
      compData = compData.filter((_, i) => i % step === 0 || i === compData.length - 1);
    }

    return chartData.map((d, i) => {
      const entry = {
        ...d,
        ts: d.timestamp.getTime(),
      };

      if (compData.length > 0 && i < compData.length) {
        const comp = compData[i];
        entry.compHealthRate = comp.healthRate;
        const cd = comp.timestamp;
        entry.compDate = `${cd.getDate().toString().padStart(2, '0')}.${(cd.getMonth() + 1).toString().padStart(2, '0')}`;
      }

      return entry;
    });
  }, [chartData, comparisonTrendData]);

  // Compute trend summary: first vs last data point
  const trendSummary = useMemo(() => {
    if (mergedData.length < 2) return null;
    const first = mergedData[0];
    const last = mergedData[mergedData.length - 1];
    if (first.healthRate == null || last.healthRate == null) return null;
    const delta = Math.round((last.healthRate - first.healthRate) * 10) / 10;
    return {
      startRate: first.healthRate,
      endRate: last.healthRate,
      startDate: first.date,
      endDate: last.date,
      delta,
      isPositive: delta > 0,
      isNegative: delta < 0,
    };
  }, [mergedData]);

  // Dynamic Y-axis domain: auto-scale to data range with padding
  const yDomain = useMemo(() => {
    let min = 100, max = 0;
    for (const d of mergedData) {
      if (d.healthRate != null) {
        if (d.healthRate < min) min = d.healthRate;
        if (d.healthRate > max) max = d.healthRate;
      }
      if (d.compHealthRate != null) {
        if (d.compHealthRate < min) min = d.compHealthRate;
        if (d.compHealthRate > max) max = d.compHealthRate;
      }
    }
    // Round down/up to nearest 5 with padding
    const lower = Math.max(0, Math.floor((min - 5) / 5) * 5);
    const upper = Math.min(100, Math.ceil((max + 5) / 5) * 5);
    return [lower, upper];
  }, [mergedData]);

  // Format X-axis labels
  const formatXAxis = (val) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
  };

  // Compute the difference between current avg and comparison
  let diffLabel = null;
  if (comparisonHealthRate != null && trendData.length > 0) {
    const currentAvg = trendData.reduce((sum, s) => sum + s.healthRate, 0) / trendData.length;
    const diff = Math.round((currentAvg - comparisonHealthRate) * 10) / 10;
    if (diff > 0) diffLabel = `+${diff}%`;
    else if (diff < 0) diffLabel = `${diff}%`;
    else diffLabel = '\u00b10%';
  }

  const hasComparison = comparisonTrendData && comparisonTrendData.length > 0;

  // Read CSS custom properties for chart colors
  const accentColor = '#007AFF';
  const gridColor = '#E8E8ED';
  const tickColor = '#8E8E93';
  const greenColor = '#34C759';
  const orangeColor = '#FF9500';
  const purpleColor = '#AF52DE';

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-card">
      {/* Header row: title + comparison legend */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-medium text-text-secondary">
          Health Trend
        </h3>
        {/* Comparison legend - always show when data exists */}
        {comparisonHealthRate != null && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[2px] rounded-full" style={{ backgroundColor: accentColor }} />
              <span className="text-[11px] font-mono text-text-muted">Aktuell</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[2px] rounded-full opacity-60" style={{ backgroundImage: `repeating-linear-gradient(90deg, ${purpleColor} 0, ${purpleColor} 4px, transparent 4px, transparent 7px)` }} />
              <span className="text-[11px] font-mono text-status-purple font-medium">
                Vorperiode {'\u00D8'} {comparisonHealthRate}%
              </span>
            </div>
            {diffLabel && (
              <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                diffLabel.startsWith('+') ? 'text-status-online bg-status-online/10 border border-status-online/20' :
                diffLabel.startsWith('-') ? 'text-status-offline bg-status-offline/10 border border-status-offline/20' :
                'text-text-muted bg-surface-secondary border border-border-secondary'
              }`}>
                {diffLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Inline date range picker */}
      {onRangeChange && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <Calendar size={14} className="text-text-muted flex-shrink-0" />

          {/* Preset buttons */}
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p.days)}
                className={`px-2.5 py-1 rounded-lg text-[12px] font-mono transition-all duration-150 ${
                  activePreset?.label === p.label
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-surface-secondary border border-border-secondary text-text-secondary hover:border-accent hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
            {/* Custom button */}
            <button
              onClick={() => setShowCustomDate(!showCustomDate)}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-mono transition-all duration-150 ${
                isCustomActive || showCustomDate
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-surface-secondary border border-border-secondary text-text-secondary hover:border-accent hover:text-text-primary'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Custom date inputs */}
          {(showCustomDate || isCustomActive) && (
            <>
              <div className="w-px h-5 bg-border-secondary mx-1" />
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={toInputValue(rangeStart)}
                  min={toInputValue(dataEarliest)}
                  max={toInputValue(rangeEnd || dataLatest)}
                  onChange={(e) => onRangeChange(fromInputValue(e.target.value), rangeEnd)}
                  className="bg-surface-secondary border border-border-secondary rounded-lg px-2 py-1 text-[12px] font-mono text-text-primary focus:outline-none focus:border-accent"
                />
                <span className="text-text-muted text-xs">{'\u2013'}</span>
                <input
                  type="date"
                  value={toInputValue(rangeEnd)}
                  min={toInputValue(rangeStart || dataEarliest)}
                  max={toInputValue(dataLatest)}
                  onChange={(e) => onRangeChange(rangeStart, fromInputValue(e.target.value))}
                  className="bg-surface-secondary border border-border-secondary rounded-lg px-2 py-1 text-[12px] font-mono text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </>
          )}

          {/* Current range label */}
          <span className="text-[12px] font-mono text-text-muted ml-auto">
            {rangeLabel}
          </span>
        </div>
      )}

      {/* Trend summary banner */}
      {trendSummary && (
        <div className="flex items-center gap-3 mb-3 px-3.5 py-2.5 bg-surface-secondary rounded-xl border border-border-secondary">
          <div className="flex items-center gap-2 text-[13px] font-mono">
            <span className="text-text-muted">{trendSummary.startDate}</span>
            <span className="text-text-primary font-semibold">{trendSummary.startRate}%</span>
          </div>
          <div className="text-text-muted">{'\u2192'}</div>
          <div className="flex items-center gap-2 text-[13px] font-mono">
            <span className="text-text-muted">{trendSummary.endDate}</span>
            <span className="text-text-primary font-semibold">{trendSummary.endRate}%</span>
          </div>
          {trendSummary.delta !== 0 && (
            <div className={`flex items-center gap-1 ml-auto px-2.5 py-1 rounded-full text-[11px] font-mono font-bold ${
              trendSummary.isPositive
                ? 'text-status-online bg-status-online/10 border border-status-online/20'
                : 'text-status-offline bg-status-offline/10 border border-status-offline/20'
            }`}>
              {trendSummary.isPositive
                ? <TrendingUp size={14} />
                : <TrendingDown size={14} />
              }
              {trendSummary.isPositive ? '+' : ''}{trendSummary.delta}%
            </div>
          )}
        </div>
      )}

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mergedData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <defs>
              <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accentColor} stopOpacity={0.15} />
                <stop offset="95%" stopColor={accentColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(ts) => formatXAxis(ts)}
              tick={{ fill: tickColor, fontSize: 11 }}
              stroke={gridColor}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: tickColor, fontSize: 11 }}
              stroke={gridColor}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={90} stroke={greenColor} strokeDasharray="3 3" strokeOpacity={0.3} />
            <ReferenceLine y={70} stroke={orangeColor} strokeDasharray="3 3" strokeOpacity={0.3} />
            {/* Comparison period line (behind current) */}
            {hasComparison && (
              <Line
                type="monotone"
                dataKey="compHealthRate"
                stroke={purpleColor}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                strokeOpacity={0.5}
                dot={false}
                activeDot={{ r: 3, fill: purpleColor, stroke: '#ffffff', strokeWidth: 1.5 }}
                connectNulls
              />
            )}
            {/* Current period: area fill + line */}
            <Area
              type="monotone"
              dataKey="healthRate"
              stroke={accentColor}
              strokeWidth={2}
              fill="url(#healthGradient)"
              dot={false}
              activeDot={{ r: 4, fill: accentColor, stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
