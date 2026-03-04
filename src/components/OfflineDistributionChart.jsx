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
  LabelList,
} from 'recharts';

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-surface-primary border border-border-primary/40 rounded-lg px-3 py-2 text-xs shadow-card">
      <div className="text-text-secondary mb-1">{data.label}</div>
      <div style={{ color: data.color }} className="font-bold">
        {data.count} Displays
      </div>
    </div>
  );
}

export default function OfflineDistributionChart({ distribution }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
      <h3 className="text-sm font-medium text-text-secondary mb-4">
        Offline-Verteilung
      </h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution} margin={{ top: 20, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#e2e8f0"
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              stroke="#e2e8f0"
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {distribution.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                fill="#1e293b"
                fontSize={11}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
