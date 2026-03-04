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
import { TrendingUp, TrendingDown } from 'lucide-react';

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-white border border-[#E8E8ED] rounded-xl px-4 py-3 shadow-lg">
      <div className="text-[#86868B] text-[13px] mb-1.5">{data.date}</div>
      <div className="text-[#007AFF] font-semibold text-[15px]">
        {data.healthRate}% Health Rate
      </div>
      <div className="text-[#636366] text-[13px] mt-1">
        {data.totalOnlineHours != null
          ? `${data.totalOnlineHours}h / ${data.totalExpectedHours}h`
          : `${data.online} / ${data.total} Displays online`}
      </div>
      {data.compHealthRate != null && (
        <div className="text-[#AF52DE] text-[13px] mt-2 pt-2 border-t border-[#E8E8ED]">
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
  if (!trendData || trendData.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-[#E8E8ED]">
        <h3 className="text-[15px] font-semibold text-[#1D1D1F] mb-4">
          Health Trend
        </h3>
        <div className="h-48 flex items-center justify-center text-[#86868B] text-[15px]">
          Keine Trenddaten verfügbar
        </div>
      </div>
    );
  }

  // Downsample if too many points
  let chartData = trendData;
  if (trendData.length > 60) {
    const step = Math.ceil(trendData.length / 60);
    chartData = trendData.filter((_, i) => i % step === 0 || i === trendData.length - 1);
  }

  // Merge comparison data
  const mergedData = useMemo(() => {
    let compData = comparisonTrendData || [];
    if (compData.length > 60) {
      const step = Math.ceil(compData.length / 60);
      compData = compData.filter((_, i) => i % step === 0 || i === compData.length - 1);
    }
    return chartData.map((d, i) => {
      const entry = { ...d, ts: d.timestamp.getTime() };
      if (compData.length > 0 && i < compData.length) {
        entry.compHealthRate = compData[i].healthRate;
      }
      return entry;
    });
  }, [chartData, comparisonTrendData]);

  // Trend summary
  const trendSummary = useMemo(() => {
    if (mergedData.length < 2) return null;
    const first = mergedData[0];
    const last = mergedData[mergedData.length - 1];
    if (first.healthRate == null || last.healthRate == null) return null;
    const delta = Math.round((last.healthRate - first.healthRate) * 10) / 10;
    return { startRate: first.healthRate, endRate: last.healthRate, startDate: first.date, endDate: last.date, delta, isPositive: delta > 0 };
  }, [mergedData]);

  // Y-axis domain
  const yDomain = useMemo(() => {
    let min = 100, max = 0;
    for (const d of mergedData) {
      if (d.healthRate != null) { min = Math.min(min, d.healthRate); max = Math.max(max, d.healthRate); }
      if (d.compHealthRate != null) { min = Math.min(min, d.compHealthRate); max = Math.max(max, d.compHealthRate); }
    }
    return [Math.max(0, Math.floor((min - 5) / 5) * 5), Math.min(100, Math.ceil((max + 5) / 5) * 5)];
  }, [mergedData]);

  const formatXAxis = (val) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const hasComparison = comparisonTrendData && comparisonTrendData.length > 0;

  return (
    <div className="bg-white rounded-2xl p-6 border border-[#E8E8ED]/60 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[17px] font-semibold text-[#1D1D1F]">
          Health Trend
        </h3>

        {/* Trend badge */}
        {trendSummary && trendSummary.delta !== 0 && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold ${
            trendSummary.isPositive
              ? 'text-[#34C759] bg-[#34C759]/10'
              : 'text-[#FF3B30] bg-[#FF3B30]/10'
          }`}>
            {trendSummary.isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trendSummary.isPositive ? '+' : ''}{trendSummary.delta}%
          </div>
        )}
      </div>

      {/* Summary line */}
      {trendSummary && (
        <div className="flex items-center gap-3 mb-4 text-[13px] text-[#86868B]">
          <span>{trendSummary.startDate}</span>
          <span className="font-semibold text-[#1D1D1F]">{trendSummary.startRate}%</span>
          <span>→</span>
          <span>{trendSummary.endDate}</span>
          <span className="font-semibold text-[#1D1D1F]">{trendSummary.endRate}%</span>
          {comparisonHealthRate != null && (
            <>
              <span className="mx-1">·</span>
              <span className="text-[#AF52DE]">Vorperiode Ø {comparisonHealthRate}%</span>
            </>
          )}
        </div>
      )}

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mergedData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <defs>
              <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#007AFF" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#007AFF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F7" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              tick={{ fill: '#AEAEB2', fontSize: 12, fontFamily: 'Inter' }}
              stroke="#E8E8ED"
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: '#AEAEB2', fontSize: 12, fontFamily: 'Inter' }}
              stroke="#E8E8ED"
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={90} stroke="#34C759" strokeDasharray="3 3" strokeOpacity={0.25} />
            <ReferenceLine y={70} stroke="#FF9500" strokeDasharray="3 3" strokeOpacity={0.25} />
            {hasComparison && (
              <Line
                type="monotone"
                dataKey="compHealthRate"
                stroke="#AF52DE"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                strokeOpacity={0.5}
                dot={false}
                activeDot={{ r: 3, fill: '#AF52DE', stroke: '#ffffff', strokeWidth: 1.5 }}
                connectNulls
              />
            )}
            <Area
              type="monotone"
              dataKey="healthRate"
              stroke="#007AFF"
              strokeWidth={2}
              fill="url(#healthGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#007AFF', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
