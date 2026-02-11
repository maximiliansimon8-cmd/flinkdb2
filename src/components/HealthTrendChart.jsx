import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

function CustomTooltip({ active, payload, comparisonHealthRate }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-300/40 rounded-lg px-3 py-2 text-xs font-mono shadow-sm shadow-black/[0.03]">
      <div className="text-slate-600 mb-1">{data.date}</div>
      <div className="text-[#22c55e] font-bold">
        {data.healthRate}% online
      </div>
      <div className="text-slate-400">
        {data.online}/{data.total} Displays
      </div>
      {comparisonHealthRate != null && (
        <div className="text-violet-600 mt-1 border-t border-slate-200/60 pt-1">
          Vorperiode Ø: {comparisonHealthRate}%
        </div>
      )}
    </div>
  );
}

function ComparisonLabel({ viewBox, value }) {
  if (!viewBox) return null;
  const labelWidth = 140;
  const labelHeight = 22;
  // Position the label at the right side of the chart
  const x = (viewBox.width || viewBox.x || 0) + (viewBox.x || 0) - labelWidth - 8;
  const y = (viewBox.y || 0) - labelHeight / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={labelWidth}
        height={labelHeight}
        rx={4}
        fill="#7c3aed"
        fillOpacity={0.9}
      />
      <text
        x={x + labelWidth / 2}
        y={y + labelHeight / 2 + 4}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={11}
        fontWeight="600"
        fontFamily="monospace"
      >
        Vorperiode Ø {value}%
      </text>
    </g>
  );
}

export default function HealthTrendChart({ trendData, rangeLabel = '30 Tage', comparisonHealthRate }) {
  if (!trendData || trendData.length === 0) {
    return (
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
        <h3 className="text-sm font-medium text-slate-600 mb-4 uppercase tracking-wider">
          Health Trend ({rangeLabel})
        </h3>
        <div className="h-48 flex items-center justify-center text-slate-400">
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

  // Format X-axis labels
  const formatXAxis = (val) => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;
  };

  const dataWithTs = chartData.map((d) => ({
    ...d,
    ts: d.timestamp.getTime(),
  }));

  // Compute the difference between current avg and comparison
  let diffLabel = null;
  if (comparisonHealthRate != null && trendData.length > 0) {
    const currentAvg = trendData.reduce((sum, s) => sum + s.healthRate, 0) / trendData.length;
    const diff = Math.round((currentAvg - comparisonHealthRate) * 10) / 10;
    if (diff > 0) diffLabel = `+${diff}%`;
    else if (diff < 0) diffLabel = `${diff}%`;
    else diffLabel = '±0%';
  }

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wider">
          Health Trend ({rangeLabel})
        </h3>
        {comparisonHealthRate != null && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[2px] bg-[#3b82f6] rounded-full" />
              <span className="text-xs font-mono text-slate-500">Aktuell</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-[3px] bg-violet-500 rounded-full opacity-80" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #8b5cf6 0, #8b5cf6 4px, transparent 4px, transparent 7px)' }} />
              <span className="text-xs font-mono text-violet-600 font-medium">
                Vorperiode Ø {comparisonHealthRate}%
              </span>
            </div>
            {diffLabel && (
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                diffLabel.startsWith('+') ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60' :
                diffLabel.startsWith('-') ? 'text-red-600 bg-red-50 border border-red-200/60' :
                'text-slate-500 bg-slate-50 border border-slate-200/60'
              }`}>
                {diffLabel}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataWithTs} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(ts) => formatXAxis(ts)}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              stroke="#e2e8f0"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              stroke="#e2e8f0"
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip comparisonHealthRate={comparisonHealthRate} />} />
            <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
            <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.3} />
            {comparisonHealthRate != null && (
              <ReferenceLine
                y={comparisonHealthRate}
                stroke="#7c3aed"
                strokeDasharray="8 4"
                strokeOpacity={0.9}
                strokeWidth={2.5}
                label={<ComparisonLabel value={comparisonHealthRate} />}
              />
            )}
            <Line
              type="monotone"
              dataKey="healthRate"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
