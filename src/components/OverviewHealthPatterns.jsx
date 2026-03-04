import React, { useMemo, useState, useRef, useEffect } from 'react';
import { CalendarDays, Sun, BarChart3 } from 'lucide-react';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function rateColor(rate) {
  if (rate == null) return '#cbd5e1';
  if (rate >= 80) return '#34C759';
  if (rate >= 60) return '#FF9500';
  if (rate >= 40) return '#f97316';
  return '#FF3B30';
}

function rateBg(rate) {
  if (rate == null) return '#94a3b820';
  if (rate >= 80) return '#34C75915';
  if (rate >= 60) return '#FF950015';
  if (rate >= 40) return '#f9731615';
  return '#FF3B3015';
}

/**
 * Interpolate trendData to fill gaps between snapshots.
 * If a snapshot exists at 11:45 and the next at 13:15, we create
 * a synthetic entry at 12:00 using the earlier snapshot's values.
 * This ensures every full hour between two real snapshots has data,
 * avoiding empty cells in hour-based and heatmap charts.
 *
 * Key improvement: Instead of stepping by whole hours from the snapshot time,
 * we enumerate every full clock-hour between two snapshots and fill any that
 * don't already have data. This handles cases like 11:45→13:15 where the
 * hour "12" would otherwise be missed.
 *
 * Max gap to fill: 12 hours (beyond that it's likely a real data gap).
 */
function interpolateTrendData(trendData) {
  if (!trendData || trendData.length < 2) return trendData;

  const sorted = [...trendData].sort((a, b) => a.timestamp - b.timestamp);

  // Build a set of hours already covered by real snapshots (keyed as "YYYY-MM-DD-HH")
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

      // Only interpolate gaps up to 12 hours
      if (diffHours > 0.5 && diffHours <= 12) {
        // Find the first full hour after the current snapshot
        const startHour = new Date(snap.timestamp);
        startHour.setMinutes(0, 0, 0);
        startHour.setHours(startHour.getHours() + 1); // next full hour

        // Find the hour of the next snapshot (don't fill that one, it has real data)
        const endTime = next.timestamp.getTime();

        // Fill every full clock-hour in between
        let cursor = new Date(startHour);
        while (cursor.getTime() < endTime) {
          const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}-${cursor.getHours()}`;
          if (!coveredHours.has(key)) {
            result.push({
              ...snap,
              timestamp: new Date(cursor),
              _interpolated: true,
            });
            coveredHours.add(key);
          }
          cursor.setHours(cursor.getHours() + 1);
        }
      }
    }
  }

  return result;
}

/**
 * Custom tooltip component that follows the mouse on hover.
 */
function HeatmapTooltip({ data, position }) {
  if (!data) return null;
  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: position.x + 12, top: position.y - 10 }}
    >
      <div className="bg-surface-primary border border-white/60 rounded-lg px-3 py-2 text-xs font-mono shadow-lg">
        <div className="text-text-secondary font-medium mb-1">{data.label}</div>
        {data.rate != null ? (
          <>
            <div className="font-bold mb-0.5" style={{ color: rateColor(data.rate) }}>
              {data.rate}% Health Rate
            </div>
            <div className="text-text-muted">
              Ø {data.avgOnline} / {data.avgDisplays} Displays online
            </div>
            <div className="text-text-muted">
              {data.realSnapshots != null ? data.realSnapshots : data.snapshots} Datenpunkte{data.interpolatedCount > 0 ? ` (+${data.interpolatedCount} interpoliert)` : ''}
            </div>
          </>
        ) : (
          <div className="text-text-muted">Keine Daten</div>
        )}
      </div>
    </div>
  );
}

/**
 * Compute network-wide health rate grouped by weekday.
 * Includes interpolated data for continuous coverage between snapshots.
 * Method: Use uptime-based healthRate from each snapshot (consistent with KPI cards),
 * then average those rates per weekday. This avoids the mismatch between
 * KPI health rate (uptime-based) and pattern health rate (online/total ratio).
 */
function computeWeekdayHealth(trendData) {
  // Collect per-snapshot health rates grouped by weekday
  const days = Array.from({ length: 7 }, () => ({
    rates: [],
    totalOnline: 0,
    totalDisplays: 0,
    snapshots: 0,
  }));

  trendData.forEach((snap) => {
    const jsDay = snap.timestamp.getDay();
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
    days[dayIdx].totalOnline += snap.online;
    days[dayIdx].totalDisplays += snap.total;
    days[dayIdx].snapshots++;
    if (snap.total > 0) {
      // Use uptime-based healthRate if available, fallback to online/total ratio
      const rate = snap.healthRate != null ? snap.healthRate / 100 : snap.online / snap.total;
      days[dayIdx].rates.push(rate);
    }
  });

  return days.map((d, i) => ({
    label: WEEKDAY_LABELS[i],
    // Average of per-snapshot uptime-based health rates (consistent with KPI cards)
    rate:
      d.rates.length > 0
        ? Math.round((d.rates.reduce((a, b) => a + b, 0) / d.rates.length) * 1000) / 10
        : null,
    snapshots: d.snapshots,
    avgDisplays: d.snapshots > 0 ? Math.round(d.totalDisplays / d.snapshots) : 0,
    avgOnline: d.snapshots > 0 ? Math.round(d.totalOnline / d.snapshots) : 0,
  }));
}

/**
 * Compute network-wide health rate grouped by hour of day.
 * Includes interpolated data: if a display is online at 06:00 and 09:00,
 * it's assumed online for 07:00 and 08:00 as well (cumulative fill).
 * Method: Average of per-snapshot uptime-based health rates per hour.
 */
function computeHourHealth(trendData) {
  const hours = Array.from({ length: 24 }, () => ({
    rates: [],
    totalOnline: 0,
    totalDisplays: 0,
    snapshots: 0,
  }));

  trendData.forEach((snap) => {
    const h = snap.timestamp.getHours();
    hours[h].totalOnline += snap.online;
    hours[h].totalDisplays += snap.total;
    hours[h].snapshots++;
    if (snap.total > 0) {
      // Use uptime-based healthRate if available, fallback to online/total ratio
      const rate = snap.healthRate != null ? snap.healthRate / 100 : snap.online / snap.total;
      hours[h].rates.push(rate);
    }
  });

  return hours.map((d, i) => ({
    label: String(i).padStart(2, '0'),
    // Average of per-snapshot uptime-based health rates (consistent with KPI cards)
    rate:
      d.rates.length > 0
        ? Math.round((d.rates.reduce((a, b) => a + b, 0) / d.rates.length) * 1000) / 10
        : null,
    snapshots: d.snapshots,
    avgDisplays: d.snapshots > 0 ? Math.round(d.totalDisplays / d.snapshots) : 0,
    avgOnline: d.snapshots > 0 ? Math.round(d.totalOnline / d.snapshots) : 0,
  }));
}

/**
 * Compute a weekday x hour heatmap (7x24 grid) with full detail data.
 * All data (real + interpolated) is treated equally — between two snapshots
 * where a display is online, it's assumed online for the hours in between.
 * Uses uptime-based healthRate (consistent with KPI cards).
 */
function computeHeatmap(trendData) {
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({
      totalOnline: 0,
      totalDisplays: 0,
      snapshots: 0,
      rates: [],
    }))
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
      // Use uptime-based healthRate if available, fallback to online/total ratio
      const rate = snap.healthRate != null ? snap.healthRate / 100 : snap.online / snap.total;
      cell.rates.push(rate);
    }
  });

  return grid.map((dayRow, dayIdx) =>
    dayRow.map((cell, hourIdx) => {
      let rate = null;
      let avgOnline = 0;
      let avgDisplays = 0;

      if (cell.rates.length > 0) {
        rate = Math.round((cell.rates.reduce((a, b) => a + b, 0) / cell.rates.length) * 1000) / 10;
        avgOnline = Math.round(cell.totalOnline / cell.snapshots);
        avgDisplays = Math.round(cell.totalDisplays / cell.snapshots);
      }

      return {
        rate,
        avgOnline,
        avgDisplays,
        snapshots: cell.snapshots,
        realSnapshots: cell.snapshots,
        interpolatedCount: 0,
        label: `${WEEKDAY_LABELS[dayIdx]} ${String(hourIdx).padStart(2, '0')}:00`,
      };
    })
  );
}

function WeekdayBar({ stats, rangeLabel }) {
  const minRate = Math.min(
    ...stats.filter((s) => s.rate != null).map((s) => s.rate)
  );
  const worstDay = stats.find((s) => s.rate === minRate);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={14} className="text-text-muted" />
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Health Rate nach Wochentag
          {rangeLabel && (
            <span className="text-text-muted normal-case ml-1">({rangeLabel})</span>
          )}
        </h3>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {stats.map((day) => {
          const barH = day.rate != null ? Math.max(8, (day.rate / 100) * 80) : 0;
          return (
            <div key={day.label} className="flex flex-col items-center">
              <div className="h-[80px] w-full flex items-end justify-center">
                <div
                  className="w-full max-w-[40px] rounded-t transition-all"
                  style={{
                    height: `${barH}px`,
                    backgroundColor: rateColor(day.rate),
                    opacity: 0.8,
                  }}
                />
              </div>
              <div className="text-[11px] font-mono text-text-muted mt-1.5 font-medium">
                {day.label}
              </div>
              <div
                className="text-[11px] font-mono font-bold"
                style={{ color: day.rate != null ? rateColor(day.rate) : '#94a3b8' }}
              >
                {day.rate != null ? `${day.rate}%` : '\u2013'}
              </div>
              <div className="text-[9px] font-mono text-text-muted">
                {day.snapshots > 0
                  ? `~${day.avgOnline}/${day.avgDisplays}`
                  : ''}
              </div>
            </div>
          );
        })}
      </div>
      {worstDay && worstDay.rate != null && worstDay.rate < 85 && (
        <div className="mt-3 px-3 py-2 rounded bg-surface-secondary/60 border border-border-secondary">
          <span className="text-[10px] text-text-muted">
            Schwächster Tag:{' '}
            <span
              className="font-bold"
              style={{ color: rateColor(worstDay.rate) }}
            >
              {worstDay.label} ({worstDay.rate}%)
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function HourBar({ stats, rangeLabel }) {
  // Only show hours 6-23 (skip 0-5 as irrelevant)
  const visibleStats = stats.filter((_, i) => i >= 6);
  const problemHours = visibleStats.filter((s) => s.rate != null && s.rate < 75);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sun size={14} className="text-text-muted" />
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Health Rate nach Tageszeit
          {rangeLabel && (
            <span className="text-text-muted normal-case ml-1">({rangeLabel})</span>
          )}
        </h3>
      </div>
      <div className="grid grid-cols-9 gap-1">
        {visibleStats.map((hour) => (
          <div
            key={hour.label}
            className="flex flex-col items-center rounded p-1.5"
            style={{ backgroundColor: rateBg(hour.rate) }}
            title={`${hour.label}:00 \u2013 ${hour.rate != null ? hour.rate + '% Health Rate' : 'keine Daten'} (${hour.snapshots} Snapshots, Ø ${hour.avgOnline}/${hour.avgDisplays})`}
          >
            <div
              className="text-[11px] font-mono font-bold"
              style={{
                color: hour.rate != null ? rateColor(hour.rate) : '#94a3b8',
              }}
            >
              {hour.rate != null ? `${Math.round(hour.rate)}` : '\u2013'}
            </div>
            <div className="text-[9px] font-mono text-text-muted">
              {hour.label}h
            </div>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#34C759]" />
          <span className="text-[9px] text-text-muted">&ge;80%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#FF9500]" />
          <span className="text-[9px] text-text-muted">60–80%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316]" />
          <span className="text-[9px] text-text-muted">40–60%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#FF3B30]" />
          <span className="text-[9px] text-text-muted">&lt;40%</span>
        </div>
      </div>
      {problemHours.length > 0 && (
        <div className="mt-3 px-3 py-2 rounded bg-surface-secondary/60 border border-border-secondary">
          <span className="text-[10px] text-text-muted">
            Schwache Zeiten:{' '}
            {problemHours.map((h, i) => (
              <span key={h.label}>
                {i > 0 && ', '}
                <span
                  className="font-bold"
                  style={{ color: rateColor(h.rate) }}
                >
                  {h.label}:00 ({h.rate}%)
                </span>
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function Heatmap({ grid, rangeLabel }) {
  const [tooltip, setTooltip] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Only show hours 6-23 (skip 0-5 as irrelevant)
  const HOUR_START = 6;
  const HOUR_END = 24; // exclusive, so 6..23
  const visibleHours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

  const handleMouseEnter = (cell) => {
    setTooltip(cell);
  };

  const handleMouseMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-text-muted" />
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          Wochentag × Tageszeit Heatmap
          {rangeLabel && (
            <span className="text-text-muted normal-case ml-1">({rangeLabel})</span>
          )}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-[9px] font-mono text-text-muted w-8" />
              {visibleHours.map((h) => (
                <th
                  key={h}
                  className="text-[8px] font-mono text-text-muted px-0 py-1 text-center"
                >
                  {String(h).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((dayRow, dayIdx) => (
              <tr key={dayIdx}>
                <td className="text-[10px] font-mono text-text-muted font-medium pr-1 py-0.5 text-right">
                  {WEEKDAY_LABELS[dayIdx]}
                </td>
                {visibleHours.map((hourIdx) => {
                  const cell = dayRow[hourIdx];
                  return (
                    <td
                      key={hourIdx}
                      className="px-0 py-0.5"
                      onMouseEnter={() => handleMouseEnter(cell)}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    >
                      <div
                        className="w-full h-4 rounded-[2px] mx-auto transition-opacity hover:opacity-100"
                        style={{
                          backgroundColor:
                            cell.rate != null ? rateColor(cell.rate) : '#cbd5e1',
                          opacity: cell.rate != null ? 0.85 : 0.3,
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
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#34C759]" />
          <span className="text-[9px] text-text-muted">&ge;80%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#FF9500]" />
          <span className="text-[9px] text-text-muted">60–80%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316]" />
          <span className="text-[9px] text-text-muted">40–60%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#FF3B30]" />
          <span className="text-[9px] text-text-muted">&lt;40%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-surface-tertiary opacity-30" />
          <span className="text-[9px] text-text-muted">keine Daten</span>
        </div>
      </div>

      <HeatmapTooltip data={tooltip} position={mousePos} />
    </div>
  );
}

export default function OverviewHealthPatterns({ trendData, rangeLabel }) {
  // Interpolate gaps between snapshots so hour/heatmap charts are continuous
  const interpolated = useMemo(
    () => interpolateTrendData(trendData),
    [trendData]
  );
  const weekdayStats = useMemo(
    () => computeWeekdayHealth(interpolated),
    [interpolated]
  );
  const hourStats = useMemo(
    () => computeHourHealth(interpolated),
    [interpolated]
  );
  const heatmapGrid = useMemo(
    () => computeHeatmap(interpolated),
    [interpolated]
  );

  if (!trendData || trendData.length === 0) return null;

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeekdayBar stats={weekdayStats} rangeLabel={rangeLabel} />
        <HourBar stats={hourStats} rangeLabel={rangeLabel} />
      </div>
      <Heatmap grid={heatmapGrid} rangeLabel={rangeLabel} />
    </div>
  );
}
