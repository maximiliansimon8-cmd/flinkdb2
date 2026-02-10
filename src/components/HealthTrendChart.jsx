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

function CustomTooltip({ active, payload }) {
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
    </div>
  );
}

export default function HealthTrendChart({ trendData, rangeLabel = '30 Tage' }) {
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

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
      <h3 className="text-sm font-medium text-slate-600 mb-4 uppercase tracking-wider">
        Health Trend ({rangeLabel})
      </h3>
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
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
            <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.3} />
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
