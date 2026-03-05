/**
 * Programmatic KPI Dashboard
 * Shows Vistar SSP programmatic ad performance data
 * across all venues with revenue, impressions, eCPM metrics.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DollarSign,
  Eye,
  PlayCircle,
  TrendingUp,
  BarChart3,
  Activity,
  Calendar,
  Loader2,
  WifiOff,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  RefreshCw,
  Clock,
  Lock,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Cell,
} from 'recharts';
import { fetchVenuePerformance } from '../utils/vistarService';
import { hasPermission } from '../utils/authService';

/* ─── Helpers ─── */
function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '–';
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCurrency(n) {
  if (n == null || isNaN(n)) return '–';
  return n.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}

function toYMD(date) {
  return date.toISOString().split('T')[0];
}

/** Build preset date ranges. "Heute" = today only, "Gestern" = yesterday only. */
function buildPresetRange(label) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (label) {
    case 'Heute': {
      return { start: toYMD(today), end: toYMD(today), label };
    }
    case 'Gestern': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: toYMD(yesterday), end: toYMD(yesterday), label };
    }
    case '7 Tage': {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { start: toYMD(s), end: toYMD(today), label };
    }
    case '30 Tage': {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { start: toYMD(s), end: toYMD(today), label };
    }
    case '90 Tage': {
      const s = new Date(today);
      s.setDate(s.getDate() - 89);
      return { start: toYMD(s), end: toYMD(today), label };
    }
    default:
      return { start: toYMD(today), end: toYMD(today), label };
  }
}

/** Days between two YYYY-MM-DD strings (inclusive). */
function daysBetween(startStr, endStr) {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

/** Format a YYYY-MM-DD string as DD.MM.YYYY (German). */
function fmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

/** Human-readable "vor X Minuten / Stunden" from a timestamp. */
function timeAgo(ts) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  const days = Math.floor(hrs / 24);
  return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
}

const PRESETS = ['Heute', 'Gestern', '7 Tage', '30 Tage', '90 Tage'];

function TrendBadge({ current, previous, suffix = '', inverted = false, isCurrency = false }) {
  if (previous == null || current == null || previous === 0) return null;
  const pctChange = ((current - previous) / previous) * 100;
  if (Math.abs(pctChange) < 0.5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-text-muted">
        <Minus size={10} />
        <span>±0%</span>
      </span>
    );
  }
  const isPositive = inverted ? pctChange < 0 : pctChange > 0;
  const color = isPositive ? '#34C759' : '#FF3B30';
  const Icon = pctChange > 0 ? ArrowUpRight : ArrowDownRight;
  const sign = pctChange > 0 ? '+' : '';

  return (
    <span className="inline-flex items-center gap-0.5 text-xs" style={{ color }}>
      <Icon size={10} />
      <span>{sign}{pctChange.toFixed(1)}%</span>
    </span>
  );
}

/* ─── KPI Card ─── */
function KPICard({ label, value, subtitle, icon: Icon, color, trend }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-text-muted text-xs font-medium">
          {label}
        </span>
        <Icon size={16} style={{ color }} className="opacity-70" />
      </div>
      <div className="flex items-end gap-2">
        <div className="font-mono font-bold text-2xl" style={{ color }}>
          {value}
        </div>
        {trend}
      </div>
      {subtitle && (
        <div className="text-text-muted text-xs mt-1">{subtitle}</div>
      )}
    </div>
  );
}

/* ─── Custom Tooltip ─── */
function ChartTooltip({ active, payload, label, isCurrency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-xl px-3 py-2 shadow-lg">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      {payload.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-xs text-text-secondary">{item.name}:</span>
          <span className="text-xs font-medium text-text-primary">
            {isCurrency ? fmtCurrency(item.value) : fmt(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function ProgrammaticDashboard() {
  const canViewRevenue = hasPermission('view_revenue');
  const [dateRange, setDateRange] = useState(() => buildPresetRange('30 Tage'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSyncTs, setLastSyncTs] = useState(null);
  const [, setTick] = useState(0); // forces re-render for "vor X Min." updates

  // Update "vor X Min." every 30 seconds
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  // Derived: number of days in the selected range
  const rangeDays = useMemo(
    () => daysBetween(dateRange.start, dateRange.end),
    [dateRange],
  );

  // Handle preset click
  const selectPreset = useCallback((label) => {
    setShowCustom(false);
    setDateRange(buildPresetRange(label));
  }, []);

  // Handle custom range apply
  const applyCustomRange = useCallback(() => {
    if (!customStart || !customEnd) return;
    if (customStart > customEnd) return;
    setDateRange({ start: customStart, end: customEnd, label: 'Custom' });
  }, [customStart, customEnd]);

  // Manual refresh
  const handleRefresh = useCallback(() => {
    // Force re-fetch by setting a new dateRange object (same values, new ref)
    setDateRange((prev) => ({ ...prev }));
  }, []);

  // Fetch data for current period + previous period (for comparison)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const days = daysBetween(dateRange.start, dateRange.end);

        // Previous period: same duration immediately before start
        const prevEnd = new Date(dateRange.start + 'T00:00:00');
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - days + 1);

        const [currentData, previousData] = await Promise.all([
          fetchVenuePerformance(dateRange.start, dateRange.end),
          fetchVenuePerformance(toYMD(prevStart), toYMD(prevEnd)),
        ]);

        if (!cancelled) {
          setData(currentData);
          setPrevData(previousData);
          setLastSyncTs(Date.now());
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [dateRange]);

  // Helper: deduplicate venues from map (which has both displayId and venueId keys)
  function deduplicateVenues(map) {
    if (!map || map.size === 0) return [];
    const seenVenueIds = new Set();
    const seenDisplayIds = new Set();
    const list = [];
    map.forEach((venue) => {
      if (venue.venueId && seenVenueIds.has(venue.venueId)) return;
      if (venue.displayId && seenDisplayIds.has(venue.displayId)) return;
      if (venue.venueId) seenVenueIds.add(venue.venueId);
      if (venue.displayId) seenDisplayIds.add(venue.displayId);
      list.push(venue);
    });
    return list;
  }

  // Aggregate totals
  const totals = useMemo(() => {
    if (!data || data.size === 0) return null;
    const venues = deduplicateVenues(data);
    let impressions = 0, spots = 0, revenue = 0, profit = 0, ecpmSum = 0, ecpmCount = 0, activeVenues = 0;

    for (const venue of venues) {
      impressions += venue.totalImpressions;
      spots += venue.totalSpots;
      revenue += venue.totalRevenue;
      profit += venue.totalProfit;
      if (venue.avgECPM > 0) { ecpmSum += venue.avgECPM; ecpmCount++; }
      if (venue.totalSpots > 0) activeVenues++;
    }

    return {
      impressions,
      spots,
      revenue,
      profit,
      avgECPM: ecpmCount > 0 ? ecpmSum / ecpmCount : 0,
      activeVenues,
      totalVenues: venues.length,
    };
  }, [data]);

  const prevTotals = useMemo(() => {
    if (!prevData || prevData.size === 0) return null;
    const venues = deduplicateVenues(prevData);
    let impressions = 0, spots = 0, revenue = 0, profit = 0, ecpmSum = 0, ecpmCount = 0;

    for (const venue of venues) {
      impressions += venue.totalImpressions;
      spots += venue.totalSpots;
      revenue += venue.totalRevenue;
      profit += venue.totalProfit;
      if (venue.avgECPM > 0) { ecpmSum += venue.avgECPM; ecpmCount++; }
    }

    return {
      impressions,
      spots,
      revenue,
      profit,
      avgECPM: ecpmCount > 0 ? ecpmSum / ecpmCount : 0,
    };
  }, [prevData]);

  // Daily aggregation for charts
  const dailyData = useMemo(() => {
    if (!data || data.size === 0) return [];
    const dayMap = {};
    const venues = deduplicateVenues(data);

    for (const venue of venues) {
      (venue.dailyData || []).forEach((d) => {
        if (!d.date) return;
        if (!dayMap[d.date]) {
          dayMap[d.date] = { date: d.date, impressions: 0, spots: 0, revenue: 0, profit: 0 };
        }
        dayMap[d.date].impressions += d.impressions || 0;
        dayMap[d.date].spots += d.spots || 0;
        dayMap[d.date].revenue += d.revenue || 0;
        dayMap[d.date].profit += d.profit || 0;
      });
    }

    return Object.values(dayMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        label: new Date(d.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        revenue: Math.round(d.revenue * 100) / 100,
        profit: Math.round(d.profit * 100) / 100,
      }));
  }, [data]);

  // Top venues by revenue
  const topVenues = useMemo(() => {
    if (!data || data.size === 0) return [];
    // Deduplicate: data may have entries keyed by both displayId and venueId
    const unique = deduplicateVenues(data);
    return unique
      .filter((v) => v.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 15)
      .map((v) => {
        // Parse venue name: "DO-GER-BER-WD-55-362-25 | BurgeesSmashburger" → displayId + name
        const parts = (v.venueName || '').split('|');
        const doId = (parts[0] || '').trim();
        const locationName = (parts[1] || '').trim();
        // Extract city from DO-ID: DO-GER-BER-... → BER
        const idParts = doId.split('-');
        const city = idParts.length >= 3 ? idParts[2] : '';
        return {
          id: v.venueId || doId,
          doId: doId || v.displayId || v.venueId || '?',
          locationName: locationName || '',
          city,
          revenue: Math.round(v.totalRevenue * 100) / 100,
          impressions: v.totalImpressions,
          spots: v.totalSpots,
          ecpm: v.avgECPM,
        };
      });
  }, [data]);

  const maxRevenue = topVenues.length > 0 ? topVenues[0].revenue : 1;

  // Underperforming venues: active but low revenue per day
  const underperformers = useMemo(() => {
    if (!data || data.size === 0) return [];
    const unique = deduplicateVenues(data);

    // Only venues that are active (have spots > 0)
    const activeVenues = unique.filter(v => v.activeDays > 0 && v.totalSpots > 0);
    if (activeVenues.length === 0) return [];

    // Calculate average revenue/day across all active venues
    const avgRevenuePerDay = activeVenues.reduce((sum, v) => sum + (v.totalRevenue / Math.max(v.activeDays, 1)), 0) / activeVenues.length;

    // Find venues with revenue/day significantly below average (< 30% of avg)
    return activeVenues
      .map((v) => {
        const revenuePerDay = v.totalRevenue / Math.max(v.activeDays, 1);
        const spotsPerDay = v.totalSpots / Math.max(v.activeDays, 1);
        const parts = (v.venueName || '').split('|');
        const doId = (parts[0] || '').trim();
        const locationName = (parts[1] || '').trim();
        const idParts = doId.split('-');
        const city = idParts.length >= 3 ? idParts[2] : '';
        return {
          id: v.venueId || doId,
          doId: doId || v.displayId || v.venueId || '?',
          locationName: locationName || '',
          city,
          activeDays: v.activeDays,
          totalSpots: v.totalSpots,
          totalRevenue: Math.round(v.totalRevenue * 100) / 100,
          revenuePerDay: Math.round(revenuePerDay * 100) / 100,
          spotsPerDay: Math.round(spotsPerDay),
          ecpm: v.avgECPM,
          pctOfAvg: avgRevenuePerDay > 0 ? Math.round((revenuePerDay / avgRevenuePerDay) * 100) : 0,
        };
      })
      .filter(v => v.pctOfAvg < 30) // below 30% of average
      .sort((a, b) => a.revenuePerDay - b.revenuePerDay)
      .slice(0, 15);
  }, [data]);

  /* ─── No Data / Loading States ─── */
  const hasData = totals && totals.spots > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 rounded-full bg-violet-500" />
            <div>
              <h2 className="text-base font-bold text-text-primary">Programmatic Performance</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted">Vistar SSP · Exchange + Direct</span>
                {lastSyncTs && (
                  <>
                    <span className="text-text-muted">|</span>
                    <span className="text-xs text-text-muted">
                      Daten: {fmtDate(dateRange.start)} – {fmtDate(dateRange.end)}
                    </span>
                    <span className="text-text-muted">|</span>
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <Clock size={9} className="opacity-60" />
                      Geladen: {timeAgo(lastSyncTs)}
                    </span>
                    {Date.now() - lastSyncTs > 3600000 && (
                      <span className="inline-flex items-center gap-1 text-xs text-status-warning">
                        <AlertTriangle size={9} />
                        Daten evtl. veraltet
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-secondary/60 transition-colors disabled:opacity-40"
            title="Daten neu laden"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Date Range Picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-surface-primary border border-border-secondary rounded-xl p-1">
            {PRESETS.map((label) => (
              <button
                key={label}
                onClick={() => selectPreset(label)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  dateRange.label === label
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-secondary/60'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                setShowCustom((p) => !p);
                if (!showCustom) {
                  setCustomStart(dateRange.start);
                  setCustomEnd(dateRange.end);
                }
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                dateRange.label === 'Custom'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-secondary/60'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Custom Date Inputs */}
          {showCustom && (
            <div className="flex items-center gap-2 bg-surface-primary border border-border-secondary rounded-xl p-1.5">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 text-xs bg-surface-secondary/80 border border-border-secondary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <span className="text-xs text-text-muted">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 text-xs bg-surface-secondary/80 border border-border-secondary rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={applyCustomRange}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                OK
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-violet-400" />
          <span className="ml-3 text-sm text-text-muted">Programmatic-Daten laden...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-status-offline/10/60 border border-status-offline/20/40 rounded-2xl p-6 text-center">
          <WifiOff size={24} className="mx-auto text-status-offline mb-2" />
          <p className="text-sm text-status-offline">{error}</p>
        </div>
      )}

      {/* No Data Placeholder */}
      {!loading && !error && !hasData && (
        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-10 text-center">
          <BarChart3 size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary mb-1">Keine Programmatic-Daten verfügbar</p>
          <p className="text-xs text-text-muted">
            Vistar API-Zugangsdaten in Netlify konfigurieren und Sync ausführen.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50/60 border border-violet-200/40 rounded-lg text-xs text-violet-600">
            <Activity size={12} />
            /api/vistar-sync?type=all&days=30
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      {!loading && !error && hasData && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {canViewRevenue ? (
              <KPICard
                label="Revenue"
                value={fmtCurrency(totals.revenue)}
                icon={DollarSign}
                color="#AF52DE"
                subtitle={`Profit: ${fmtCurrency(totals.profit)}`}
                trend={<TrendBadge current={totals.revenue} previous={prevTotals?.revenue} />}
              />
            ) : (
              <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card flex items-center justify-center">
                <div className="flex items-center gap-1.5 text-text-muted text-xs">
                  <Lock size={14} />
                  <span>Revenue</span>
                </div>
              </div>
            )}
            <KPICard
              label="Impressions"
              value={fmt(totals.impressions)}
              icon={Eye}
              color="#007AFF"
              subtitle={`${fmt(Math.round(totals.impressions / (rangeDays || 1)))}/Tag`}
              trend={<TrendBadge current={totals.impressions} previous={prevTotals?.impressions} />}
            />
            <KPICard
              label="Ad Plays"
              value={fmt(totals.spots)}
              icon={PlayCircle}
              color="#06b6d4"
              subtitle={`${fmt(Math.round(totals.spots / (rangeDays || 1)))}/Tag`}
              trend={<TrendBadge current={totals.spots} previous={prevTotals?.spots} />}
            />
            {canViewRevenue ? (
              <KPICard
                label="Ø eCPM"
                value={fmtCurrency(totals.avgECPM)}
                icon={TrendingUp}
                color="#FF9500"
                trend={<TrendBadge current={totals.avgECPM} previous={prevTotals?.avgECPM} />}
              />
            ) : (
              <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card flex items-center justify-center">
                <div className="flex items-center gap-1.5 text-text-muted text-xs">
                  <Lock size={14} />
                  <span>eCPM</span>
                </div>
              </div>
            )}
            <KPICard
              label="Aktive Venues"
              value={fmt(totals.activeVenues)}
              icon={Activity}
              color="#34C759"
              subtitle={`von ${fmt(totals.totalVenues)} gesamt`}
            />
            <KPICard
              label="Zeitraum"
              value={dateRange.label === 'Custom' ? `${rangeDays}d` : dateRange.label}
              icon={Calendar}
              color="#64748b"
              subtitle={`${dailyData.length} Tage mit Daten`}
            />
          </div>

          {/* Revenue + Impressions Chart */}
          {dailyData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Revenue over Time */}
              {canViewRevenue ? (
                <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 rounded-full bg-violet-500" />
                    <h3 className="text-sm font-medium text-text-primary">Revenue / Tag</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyData}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#AF52DE" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#AF52DE" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                        axisLine={false}
                        tickLine={false}
                        interval={Math.max(0, Math.floor(dailyData.length / 8) - 1)}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `€${v}`}
                      />
                      <Tooltip content={<ChartTooltip isCurrency />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="#AF52DE"
                        fill="url(#revGrad)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 rounded-full bg-violet-500" />
                    <h3 className="text-sm font-medium text-text-primary">Revenue / Tag</h3>
                  </div>
                  <div className="flex items-center justify-center py-16 text-text-muted text-sm gap-2">
                    <Lock size={16} />
                    <span>Umsatzdaten nur mit Berechtigung sichtbar</span>
                  </div>
                </div>
              )}

              {/* Impressions over Time */}
              <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-4 rounded-full bg-accent" />
                  <h3 className="text-sm font-medium text-text-primary">Impressions / Tag</h3>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="impGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#007AFF" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#007AFF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                      interval={Math.max(0, Math.floor(dailyData.length / 8) - 1)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="impressions"
                      name="Impressions"
                      stroke="#007AFF"
                      fill="url(#impGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Ad Plays Bar Chart */}
          {dailyData.length > 0 && (
            <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 rounded-full bg-cyan-500" />
                <h3 className="text-sm font-medium text-text-primary">Ad Plays / Tag</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(0, Math.floor(dailyData.length / 10) - 1)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="spots"
                    name="Ad Plays"
                    fill="#06b6d4"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Venues by Revenue */}
          {topVenues.length > 0 && canViewRevenue && (
            <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card">
              <div className="flex items-center gap-2 p-5 pb-3">
                <div className="w-1 h-4 rounded-full bg-violet-500" />
                <h3 className="text-sm font-medium text-text-primary">Top Venues nach Revenue</h3>
                <span className="text-xs text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
                  {topVenues.length}
                </span>
              </div>

              <div className="px-5 pb-5 space-y-1.5">
                {topVenues.map((venue, i) => (
                  <div
                    key={venue.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface-secondary/60 transition-colors"
                  >
                    <span className="w-5 text-xs text-text-muted text-right">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-text-primary truncate">
                          {venue.doId}
                        </span>
                        {venue.locationName && (
                          <span className="text-xs text-text-muted truncate">
                            {venue.locationName}
                          </span>
                        )}
                        {venue.city && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-secondary/80 text-text-muted flex-shrink-0">
                            {venue.city}
                          </span>
                        )}
                      </div>
                      <div className="w-full h-1.5 bg-surface-secondary/80 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-500 transition-all"
                          style={{ width: `${(venue.revenue / maxRevenue) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-medium text-violet-600">
                          {fmtCurrency(venue.revenue)}
                        </div>
                        <div className="text-xs text-text-muted">
                          {fmt(venue.impressions)} imp
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-text-muted">
                          eCPM
                        </div>
                        <div className="text-xs font-medium text-status-warning">
                          {fmtCurrency(venue.ecpm)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {topVenues.length > 0 && !canViewRevenue && (
            <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 rounded-full bg-violet-500" />
                <h3 className="text-sm font-medium text-text-primary">Top Venues nach Revenue</h3>
              </div>
              <div className="flex items-center justify-center py-8 text-text-muted text-sm gap-2">
                <Lock size={16} />
                <span>Umsatzdaten nur mit Berechtigung sichtbar</span>
              </div>
            </div>
          )}

          {/* Underperforming Venues */}
          {underperformers.length > 0 && canViewRevenue && (
            <div className="bg-surface-primary border border-status-warning/20/40 rounded-2xl shadow-card">
              <div className="flex items-center gap-2 p-5 pb-3">
                <div className="w-1 h-4 rounded-full bg-status-warning" />
                <AlertTriangle size={14} className="text-status-warning" />
                <h3 className="text-sm font-medium text-text-primary">Underperforming Venues</h3>
                <span className="text-xs text-status-warning bg-status-warning/10/80 px-2 py-0.5 rounded">
                  {underperformers.length}
                </span>
                <span className="text-xs text-text-muted ml-1">
                  Aktiv aber &lt;30% des Ø Revenue/Tag
                </span>
              </div>

              <div className="px-5 pb-2">
                {/* Header */}
                <div className="flex items-center gap-3 py-1.5 px-3 text-xs text-text-muted border-b border-border-secondary/60">
                  <span className="w-5">#</span>
                  <span className="flex-1">Venue</span>
                  <span className="w-16 text-right">Tage</span>
                  <span className="w-20 text-right">Spots/Tag</span>
                  <span className="w-20 text-right">Rev/Tag</span>
                  <span className="w-20 text-right">Total Rev</span>
                  <span className="w-16 text-right">vs Ø</span>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-0.5">
                {underperformers.map((venue, i) => (
                  <div
                    key={venue.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-status-warning/10/40 transition-colors"
                  >
                    <span className="w-5 text-xs text-text-muted text-right">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text-primary truncate">
                          {venue.doId}
                        </span>
                        {venue.locationName && (
                          <span className="text-xs text-text-muted truncate">
                            {venue.locationName}
                          </span>
                        )}
                        {venue.city && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-secondary/80 text-text-muted flex-shrink-0">
                            {venue.city}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="w-16 text-xs text-text-muted text-right">
                      {venue.activeDays}d
                    </span>
                    <span className="w-20 text-xs text-text-muted text-right">
                      {fmt(venue.spotsPerDay)}
                    </span>
                    <span className="w-20 text-xs text-status-warning font-medium text-right">
                      {fmtCurrency(venue.revenuePerDay)}
                    </span>
                    <span className="w-20 text-xs text-text-muted text-right">
                      {fmtCurrency(venue.totalRevenue)}
                    </span>
                    <span className={`w-16 text-xs font-medium text-right ${
                      venue.pctOfAvg < 10 ? 'text-status-offline' : 'text-status-warning'
                    }`}>
                      {venue.pctOfAvg}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
