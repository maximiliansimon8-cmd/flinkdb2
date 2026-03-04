import React, { useMemo, useState } from 'react';
import { CalendarDays, Sun, BarChart3 } from 'lucide-react';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function rateColor(rate) {
  if (rate == null) return '#D2D2D7';
  if (rate >= 80) return '#34C759';
  if (rate >= 60) return '#FF9500';
  if (rate >= 40) return '#FF9500';
  return '#FF3B30';
}

function rateBg(rate) {
  if (rate == null) return 'rgba(210,210,215,0.15)';
  if (rate >= 80) return 'rgba(52,199,89,0.1)';
  if (rate >= 60) return 'rgba(255,149,0,0.1)';
  if (rate >= 40) return 'rgba(255,149,0,0.1)';
  return 'rgba(255,59,48,0.1)';
}

function interpolateTrendData(trendData) {
  if (!trendData || trendData.length < 2) return trendData;
  const sorted = [...trendData].sort((a, b) => a.timestamp - b.timestamp);
  const coveredHours = new Set();
  sorted.forEach((snap) => {
    const t = snap.timestamp;
    coveredHours.add(`${t.getFullYear()}-${t.getMonth()}-${t.getDate()}-${t.getHours()}`);
  });
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    const snap = sorted[i];
    result.push(snap);
    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const diffMs = next.timestamp.getTime() - snap.timestamp.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours > 0.5 && diffHours <= 12) {
        const startHour = new Date(snap.timestamp);
        startHour.setMinutes(0, 0, 0);
        startHour.setHours(startHour.getHours() + 1);
        const endTime = next.timestamp.getTime();
        let cursor = new Date(startHour);
        while (cursor.getTime() < endTime) {
          const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}-${cursor.getHours()}`;
          if (!coveredHours.has(key)) {
            result.push({ ...snap, timestamp: new Date(cursor), _interpolated: true });
            coveredHours.add(key);
          }
          cursor.setHours(cursor.getHours() + 1);
        }
      }
    }
  }
  return result;
}

function computeWeekdayHealth(trendData) {
  const days = Array.from({ length: 7 }, () => ({ rates: [], totalOnline: 0, totalDisplays: 0, snapshots: 0 }));
  trendData.forEach((snap) => {
    const jsDay = snap.timestamp.getDay();
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
    days[dayIdx].totalOnline += snap.online;
    days[dayIdx].totalDisplays += snap.total;
    days[dayIdx].snapshots++;
    if (snap.total > 0) {
      const rate = snap.healthRate != null ? snap.healthRate / 100 : snap.online / snap.total;
      days[dayIdx].rates.push(rate);
    }
  });
  return days.map((d, i) => ({
    label: WEEKDAY_LABELS[i],
    rate: d.rates.length > 0 ? Math.round((d.rates.reduce((a, b) => a + b, 0) / d.rates.length) * 1000) / 10 : null,
    snapshots: d.snapshots,
    avgDisplays: d.snapshots > 0 ? Math.round(d.totalDisplays / d.snapshots) : 0,
    avgOnline: d.snapshots > 0 ? Math.round(d.totalOnline / d.snapshots) : 0,
  }));
}

function computeHourHealth(trendData) {
  const hours = Array.from({ length: 24 }, () => ({ rates: [], totalOnline: 0, totalDisplays: 0, snapshots: 0 }));
  trendData.forEach((snap) => {
    const h = snap.timestamp.getHours();
    hours[h].totalOnline += snap.online;
    hours[h].totalDisplays += snap.total;
    hours[h].snapshots++;
    if (snap.total > 0) {
      const rate = snap.healthRate != null ? snap.healthRate / 100 : snap.online / snap.total;
      hours[h].rates.push(rate);
    }
  });
  return hours.map((d, i) => ({
    label: String(i).padStart(2, '0'),
    rate: d.rates.length > 0 ? Math.round((d.rates.reduce((a, b) => a + b, 0) / d.rates.length) * 1000) / 10 : null,
    snapshots: d.snapshots,
    avgDisplays: d.snapshots > 0 ? Math.round(d.totalDisplays / d.snapshots) : 0,
    avgOnline: d.snapshots > 0 ? Math.round(d.totalOnline / d.snapshots) : 0,
  }));
}

function computeHeatmap(trendData) {
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ totalOnline: 0, totalDisplays: 0, snapshots: 0, rates: [] }))
  );
  trendData.forEach((snap) => {
    const jsDay = snap.timestamp.getDay();
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const h = snap.timestamp.getHours();
    const cell = grid[dayIdx][h];
    cell.totalOnline += snap.online;
    cell.totalDisplays += snap.total;
    cell.snapshots++;
    if (snap.total > 0) {
      const rate = snap.healthRate != null ? snap.healthRate / 100 : snap.online / snap.total;
      cell.rates.push(rate);
    }
  });
  return grid.map((dayRow, dayIdx) =>
    dayRow.map((cell, hourIdx) => {
      let rate = null, avgOnline = 0, avgDisplays = 0;
      if (cell.rates.length > 0) {
        rate = Math.round((cell.rates.reduce((a, b) => a + b, 0) / cell.rates.length) * 1000) / 10;
        avgOnline = Math.round(cell.totalOnline / cell.snapshots);
        avgDisplays = Math.round(cell.totalDisplays / cell.snapshots);
      }
      return { rate, avgOnline, avgDisplays, snapshots: cell.snapshots, label: `${WEEKDAY_LABELS[dayIdx]} ${String(hourIdx).padStart(2, '0')}:00` };
    })
  );
}

function HeatmapTooltip({ data, position }) {
  if (!data) return null;
  return (
    <div className="fixed z-50 pointer-events-none" style={{ left: position.x + 12, top: position.y - 10 }}>
      <div className="bg-white border border-[#E8E8ED] rounded-xl px-4 py-3 shadow-lg">
        <div className="text-[#636366] text-[13px] font-medium mb-1">{data.label}</div>
        {data.rate != null ? (
          <>
            <div className="font-semibold text-[15px] mb-0.5" style={{ color: rateColor(data.rate) }}>
              {data.rate}%
            </div>
            <div className="text-[#86868B] text-[12px]">
              {data.avgOnline} / {data.avgDisplays} online
            </div>
          </>
        ) : (
          <div className="text-[#86868B] text-[13px]">Keine Daten</div>
        )}
      </div>
    </div>
  );
}

function WeekdayBar({ stats, rangeLabel }) {
  const maxRate = Math.max(...stats.filter(s => s.rate != null).map(s => s.rate), 100);

  return (
    <div>
      <h3 className="text-[17px] font-semibold text-[#1D1D1F] mb-4">
        Nach Wochentag
        {rangeLabel && <span className="text-[#86868B] font-normal text-[13px] ml-2">{rangeLabel}</span>}
      </h3>
      <div className="grid grid-cols-7 gap-3">
        {stats.map((day) => {
          const barH = day.rate != null ? Math.max(8, (day.rate / maxRate) * 80) : 0;
          return (
            <div key={day.label} className="flex flex-col items-center">
              <div className="h-[80px] w-full flex items-end justify-center">
                <div
                  className="w-full max-w-[32px] rounded-lg transition-all"
                  style={{
                    height: `${barH}px`,
                    backgroundColor: rateColor(day.rate),
                    opacity: 0.75,
                  }}
                />
              </div>
              <div className="text-[12px] text-[#86868B] mt-2 font-medium">
                {day.label}
              </div>
              <div className="text-[13px] font-semibold" style={{ color: day.rate != null ? rateColor(day.rate) : '#D2D2D7' }}>
                {day.rate != null ? `${day.rate}%` : '–'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourGrid({ stats, rangeLabel }) {
  const visibleStats = stats.filter((_, i) => i >= 6);

  return (
    <div>
      <h3 className="text-[17px] font-semibold text-[#1D1D1F] mb-4">
        Nach Tageszeit
        {rangeLabel && <span className="text-[#86868B] font-normal text-[13px] ml-2">{rangeLabel}</span>}
      </h3>
      <div className="grid grid-cols-9 gap-1.5">
        {visibleStats.map((hour) => (
          <div
            key={hour.label}
            className="flex flex-col items-center rounded-lg p-2"
            style={{ backgroundColor: rateBg(hour.rate) }}
            title={`${hour.label}:00 – ${hour.rate != null ? hour.rate + '%' : 'keine Daten'}`}
          >
            <div className="text-[13px] font-semibold" style={{ color: hour.rate != null ? rateColor(hour.rate) : '#D2D2D7' }}>
              {hour.rate != null ? Math.round(hour.rate) : '–'}
            </div>
            <div className="text-[11px] text-[#AEAEB2]">
              {hour.label}h
            </div>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        {[
          { color: '#34C759', label: '≥ 80%' },
          { color: '#FF9500', label: '60–80%' },
          { color: '#FF3B30', label: '< 60%' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-[12px] text-[#86868B]">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ grid, rangeLabel }) {
  const [tooltip, setTooltip] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const HOUR_START = 6;
  const visibleHours = Array.from({ length: 24 - HOUR_START }, (_, i) => HOUR_START + i);

  return (
    <div>
      <h3 className="text-[17px] font-semibold text-[#1D1D1F] mb-4">
        Wochentag × Tageszeit
        {rangeLabel && <span className="text-[#86868B] font-normal text-[13px] ml-2">{rangeLabel}</span>}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-8" />
              {visibleHours.map((h) => (
                <th key={h} className="text-[11px] text-[#AEAEB2] px-0 py-1.5 text-center font-normal">
                  {String(h).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((dayRow, dayIdx) => (
              <tr key={dayIdx}>
                <td className="text-[12px] text-[#86868B] font-medium pr-2 py-1 text-right">
                  {WEEKDAY_LABELS[dayIdx]}
                </td>
                {visibleHours.map((hourIdx) => {
                  const cell = dayRow[hourIdx];
                  return (
                    <td
                      key={hourIdx}
                      className="px-0 py-0.5"
                      onMouseEnter={() => setTooltip(cell)}
                      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div
                        className="w-full h-5 rounded mx-auto transition-opacity hover:opacity-100"
                        style={{
                          backgroundColor: cell.rate != null ? rateColor(cell.rate) : '#D2D2D7',
                          opacity: cell.rate != null ? 0.7 : 0.15,
                          minWidth: '10px',
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HeatmapTooltip data={tooltip} position={mousePos} />
    </div>
  );
}

export default function OverviewHealthPatterns({ trendData, rangeLabel }) {
  const interpolated = useMemo(() => interpolateTrendData(trendData), [trendData]);
  const weekdayStats = useMemo(() => computeWeekdayHealth(interpolated), [interpolated]);
  const hourStats = useMemo(() => computeHourHealth(interpolated), [interpolated]);
  const heatmapGrid = useMemo(() => computeHeatmap(interpolated), [interpolated]);

  if (!trendData || trendData.length === 0) return null;

  return (
    <div className="bg-white border border-[#E8E8ED]/60 rounded-2xl p-6 space-y-8 shadow-card">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <WeekdayBar stats={weekdayStats} rangeLabel={rangeLabel} />
        <HourGrid stats={hourStats} rangeLabel={rangeLabel} />
      </div>
      <Heatmap grid={heatmapGrid} rangeLabel={rangeLabel} />
    </div>
  );
}
