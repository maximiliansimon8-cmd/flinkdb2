import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-300/40 rounded-lg px-3 py-2 text-xs font-mono shadow-sm shadow-black/[0.03]">
      <div className="text-slate-600 mb-1">
        {data.name} ({data.code})
      </div>
      <div className="text-[#22c55e]">{data.online} online</div>
      <div className="text-[#ef4444]">{data.offline} offline</div>
      <div className="text-[#3b82f6] font-bold">{data.healthRate}%</div>
    </div>
  );
}

export default function CityHealthChart({ cityData }) {
  if (!cityData || cityData.length === 0) return null;

  const getBarColor = (rate) => {
    if (rate >= 90) return '#22c55e';
    if (rate >= 70) return '#f59e0b';
    return '#ef4444';
  };

  // Show top 12 cities by display count
  const topCities = cityData.slice(0, 12);

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
      <h3 className="text-sm font-medium text-slate-600 mb-4 uppercase tracking-wider">
        Health nach Stadt
      </h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={topCities}
            layout="vertical"
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              stroke="#e2e8f0"
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="code"
              tick={{ fill: '#64748b', fontSize: 10 }}
              stroke="#e2e8f0"
              width={40}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
            <Bar dataKey="healthRate" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {topCities.map((entry, index) => (
                <Cell key={index} fill={getBarColor(entry.healthRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
