import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Activity,
  Monitor,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Minus,
  WifiOff,
  AlertTriangle,
  Clock,
  ChevronRight,
  RefreshCw,
  Loader2,
  Zap,
  Target,
  Wrench,
  ArrowRight,
} from 'lucide-react';
import {
  getStatusColor,
  formatDuration,
} from '../utils/dataProcessing';

/* ─── Mini Trend Arrow ─── */
function MiniTrend({ current, previous, inverted, suffix = '' }) {
  if (previous == null || current == null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) return null;
  const isPositive = inverted ? diff < 0 : diff > 0;
  const color = isPositive ? '#22c55e' : '#ef4444';
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const sign = diff > 0 ? '+' : '';
  const displayDiff = Number.isInteger(diff) ? diff : diff.toFixed(1);
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-mono" style={{ color }}>
      <Icon size={11} />
      <span>{sign}{displayDiff}{suffix}</span>
    </span>
  );
}

/* ─── Swipeable KPI Carousel ─── */
function KPICarousel({ items }) {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const idx = Math.round(el.scrollLeft / (cardWidth + 12));
    setActiveIndex(Math.min(idx, items.length - 1));
  }, [items.length]);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory px-4 pb-3"
        style={{ scrollPaddingLeft: '16px' }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            onClick={item.onTap}
            className={`
              snap-start shrink-0 w-[72%] rounded-2xl p-4
              border transition-all duration-300
              mobile-card-enter
              ${item.onTap ? 'cursor-pointer active:scale-[0.97]' : ''}
              ${item.highlight
                ? 'bg-gradient-to-br from-blue-500/10 to-indigo-500/8 border-blue-200/50'
                : 'bg-white/70 border-slate-200/50'
              }
            `}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <item.icon size={16} style={{ color: item.color }} className="opacity-80" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {item.label}
                </span>
              </div>
              {item.trend}
            </div>
            <div className="font-mono font-bold text-3xl tracking-tight" style={{ color: item.color }}>
              {item.value}
            </div>
            {item.subtitle && (
              <div className="text-xs text-slate-400 mt-1 font-mono">{item.subtitle}</div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination dots */}
      <div className="flex items-center justify-center gap-1.5 mt-1">
        {items.map((_, i) => (
          <div
            key={i}
            className={`
              h-1 rounded-full transition-all duration-300
              ${i === activeIndex ? 'w-5 bg-blue-500' : 'w-1.5 bg-slate-300'}
            `}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Attention Card ─── */
function AttentionCard({ icon: Icon, iconColor, title, subtitle, count, onTap, delay = 0 }) {
  return (
    <button
      onClick={() => { if (navigator.vibrate) navigator.vibrate(6); onTap?.(); }}
      className="
        w-full flex items-center gap-3 p-3.5 rounded-xl
        bg-white/60 backdrop-blur-sm border border-slate-200/50
        active:scale-[0.97] active:bg-white/80
        transition-all duration-200
        mobile-card-enter text-left
      "
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconColor + '14' }}
      >
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 truncate">{title}</div>
        <div className="text-xs text-slate-500 truncate">{subtitle}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {count != null && (
          <span
            className="text-sm font-bold font-mono px-2 py-0.5 rounded-lg"
            style={{ color: iconColor, backgroundColor: iconColor + '12' }}
          >
            {count}
          </span>
        )}
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  );
}

/* ─── Quick Action Chip ─── */
function QuickChip({ icon: Icon, label, onTap, delay = 0 }) {
  return (
    <button
      onClick={() => { if (navigator.vibrate) navigator.vibrate(6); onTap?.(); }}
      className="
        flex items-center gap-2 px-4 py-2.5 rounded-xl
        bg-white/60 border border-slate-200/50
        active:scale-[0.96] active:bg-white/80
        transition-all duration-200
        mobile-card-enter
        whitespace-nowrap shrink-0
      "
      style={{ animationDelay: `${delay}ms` }}
    >
      <Icon size={16} className="text-blue-500" />
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </button>
  );
}

/* ─── Main Component ─── */
export default function MobileDashboard({
  kpis,
  rawData,
  comparisonData,
  comparisonKPIs,
  onNavigate,
  onSelectDisplay,
  onRefresh,
  isRefreshing,
}) {
  /* ─── Pull to Refresh ─── */
  const containerRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (containerRef.current?.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = null;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (touchStartY.current == null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setPullDistance(Math.min(dy * 0.5, 80));
      setIsPulling(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance > 60) {
      onRefresh?.();
      if (navigator.vibrate) navigator.vibrate(15);
    }
    setPullDistance(0);
    setIsPulling(false);
    touchStartY.current = null;
  }, [pullDistance, onRefresh]);

  /* ─── Computed Attention Items ─── */
  const attentionItems = useMemo(() => {
    const items = [];
    if (!rawData || !kpis) return items;

    // Offline displays (critical + permanent)
    const offlineCount = (kpis.criticalCount || 0) + (kpis.permanentOfflineCount || 0);
    if (offlineCount > 0) {
      items.push({
        icon: WifiOff,
        iconColor: '#ef4444',
        title: 'Displays Offline',
        subtitle: `${kpis.criticalCount || 0} kritisch, ${kpis.permanentOfflineCount || 0} dauerhaft`,
        count: offlineCount,
        onTap: () => onNavigate?.('mobile-displays', 'critical'),
      });
    }

    // Warning displays
    if (kpis.warningCount > 0) {
      items.push({
        icon: AlertTriangle,
        iconColor: '#f59e0b',
        title: 'Warnung',
        subtitle: 'Displays 24-72h ohne Heartbeat',
        count: kpis.warningCount,
        onTap: () => onNavigate?.('mobile-displays', 'warning'),
      });
    }

    // Never online
    if (kpis.neverOnlineCount > 0) {
      items.push({
        icon: Clock,
        iconColor: '#64748b',
        title: 'Nie Online',
        subtitle: 'Displays ohne jemals einen Heartbeat',
        count: kpis.neverOnlineCount,
        onTap: () => onNavigate?.('mobile-displays', 'never_online'),
      });
    }

    // Hardware defects from comparison data
    const defectCount = comparisonData?.airtable?.locationMap
      ? [...comparisonData.airtable.locationMap.values()].filter(l =>
          l.status && /defect|defekt/i.test(l.status)
        ).length
      : 0;
    if (defectCount > 0) {
      items.push({
        icon: Wrench,
        iconColor: '#dc2626',
        title: 'Hardware-Fehler',
        subtitle: 'Geraete mit Defekt-Status',
        count: defectCount,
        onTap: () => onNavigate?.('mobile-hardware'),
      });
    }

    return items;
  }, [rawData, kpis, comparisonData, onNavigate]);

  /* ─── KPI Cards ─── */
  const healthColor = kpis?.healthRate >= 90 ? '#22c55e' : kpis?.healthRate >= 70 ? '#f59e0b' : '#ef4444';
  const hasRange = kpis?.snapshotCount >= 2;

  const kpiItems = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        label: 'Health Rate',
        value: `${kpis.healthRate}%`,
        icon: Activity,
        color: healthColor,
        subtitle: kpis.snapshotCount > 0 ? `${kpis.snapshotCount} Tage Durchschnitt` : undefined,
        highlight: true,
        trend: hasRange ? <MiniTrend current={kpis.healthRate} previous={kpis.firstHealthRate} suffix="%" /> : null,
      },
      {
        label: 'Displays',
        value: kpis.totalActive,
        icon: Monitor,
        color: '#3b82f6',
        subtitle: `${kpis.onlineCount} online`,
        trend: hasRange ? <MiniTrend current={kpis.totalActive} previous={kpis.firstTotal} /> : null,
        onTap: () => onNavigate?.('mobile-displays'),
      },
      {
        label: 'Kritisch',
        value: (kpis.criticalCount || 0) + (kpis.permanentOfflineCount || 0),
        icon: AlertTriangle,
        color: '#ef4444',
        subtitle: 'Offline > 72h',
        trend: hasRange ? <MiniTrend current={kpis.criticalCount} previous={kpis.firstCritical} inverted /> : null,
        onTap: () => onNavigate?.('mobile-displays', 'critical'),
      },
      {
        label: 'Neu / Deinstalliert',
        value: `+${kpis.newlyInstalled} / -${kpis.deinstalled}`,
        icon: TrendingUp,
        color: '#8b5cf6',
        subtitle: comparisonKPIs ? `Vorz. +${comparisonKPIs.newlyInstalled} / -${comparisonKPIs.deinstalled}` : 'Letzter Zeitraum',
      },
    ];
  }, [kpis, healthColor, hasRange, comparisonKPIs, onNavigate]);

  if (!kpis || !rawData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="h-full overflow-y-auto overflow-x-hidden pb-24"
    >
      {/* Pull to refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: isPulling ? pullDistance : 0 }}
      >
        <RefreshCw
          size={20}
          className={`text-blue-500 transition-transform duration-200 ${
            pullDistance > 60 ? 'rotate-180' : ''
          } ${isRefreshing ? 'animate-spin' : ''}`}
        />
      </div>

      {/* ─── Dark Gradient Header ─── */}
      <div className="relative overflow-hidden mx-4 mt-3 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-5 mobile-card-enter">
        {/* Decorative orbs */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/15 rounded-full blur-2xl" />
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl" />

        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <img
                src="/dimension-outdoor-logo.png"
                alt="Logo"
                className="h-5 w-auto brightness-0 invert opacity-60"
              />
              <span className="text-xs font-bold text-white/60 tracking-widest uppercase">JET Germany</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-glow" />
              <span className="text-xs font-mono text-emerald-400/80">Live</span>
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-xs text-white/40 font-medium uppercase tracking-wider mb-1">Network Health</div>
              <div className="text-5xl font-mono font-bold tracking-tight" style={{ color: healthColor }}>
                {kpis.healthRate}%
              </div>
            </div>
            <div className="text-right pb-1">
              <div className="text-xl font-mono font-bold text-white/90">{kpis.totalActive}</div>
              <div className="text-xs text-white/40">Displays aktiv</div>
            </div>
          </div>

          {/* Mini status bar */}
          <div className="mt-4 flex gap-1 h-1.5 rounded-full overflow-hidden bg-white/10">
            <div
              className="rounded-full bg-emerald-400 transition-all duration-700"
              style={{ width: `${(kpis.onlineCount / Math.max(kpis.totalActive, 1)) * 100}%` }}
            />
            <div
              className="rounded-full bg-amber-400 transition-all duration-700"
              style={{ width: `${(kpis.warningCount / Math.max(kpis.totalActive, 1)) * 100}%` }}
            />
            <div
              className="rounded-full bg-red-400 transition-all duration-700"
              style={{ width: `${((kpis.criticalCount + kpis.permanentOfflineCount) / Math.max(kpis.totalActive, 1)) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-emerald-400/70 font-mono">{kpis.onlineCount} online</span>
            <span className="text-[10px] text-amber-400/70 font-mono">{kpis.warningCount} warn</span>
            <span className="text-[10px] text-red-400/70 font-mono">{kpis.criticalCount + kpis.permanentOfflineCount} offline</span>
          </div>
        </div>
      </div>

      {/* ─── KPI Carousel ─── */}
      <div className="mt-5">
        <div className="flex items-center justify-between px-4 mb-2">
          <h2 className="text-sm font-bold text-slate-800">KPI Uebersicht</h2>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-slate-400 active:bg-slate-100 transition-colors"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <KPICarousel items={kpiItems} />
      </div>

      {/* ─── Braucht Aufmerksamkeit ─── */}
      {attentionItems.length > 0 && (
        <div className="mt-5 px-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-amber-500" />
            <h2 className="text-sm font-bold text-slate-800">Braucht Aufmerksamkeit</h2>
            <span className="text-xs font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg">
              {attentionItems.length}
            </span>
          </div>
          <div className="space-y-2">
            {attentionItems.map((item, i) => (
              <AttentionCard key={i} {...item} delay={300 + i * 80} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Quick Actions ─── */}
      <div className="mt-5 px-4">
        <h2 className="text-sm font-bold text-slate-800 mb-3">Schnellzugriff</h2>
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
          <QuickChip
            icon={Monitor}
            label="Alle Displays"
            onTap={() => onNavigate?.('mobile-displays')}
            delay={500}
          />
          <QuickChip
            icon={Target}
            label="Akquise"
            onTap={() => onNavigate?.('mobile-rollout')}
            delay={560}
          />
          <QuickChip
            icon={ClipboardList}
            label="Tasks"
            onTap={() => onNavigate?.('mobile-rollout', 'tasks')}
            delay={620}
          />
          <QuickChip
            icon={Wrench}
            label="Hardware"
            onTap={() => onNavigate?.('mobile-hardware')}
            delay={680}
          />
        </div>
      </div>

      {/* ─── Recent Offline Displays ─── */}
      {rawData?.displays && (
        <div className="mt-5 px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-800">Zuletzt Offline</h2>
            <button
              onClick={() => onNavigate?.('mobile-displays', 'critical')}
              className="text-xs font-medium text-blue-600 flex items-center gap-0.5 active:text-blue-800"
            >
              Alle anzeigen
              <ArrowRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {rawData.displays
              .filter(d => d.status === 'critical' || d.status === 'permanent_offline')
              .sort((a, b) => (b.offlineHours || 0) - (a.offlineHours || 0))
              .slice(0, 5)
              .map((display, i) => (
                <button
                  key={display.displayId}
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(6);
                    onSelectDisplay?.(display);
                  }}
                  className="
                    w-full flex items-center gap-3 p-3 rounded-xl
                    bg-white/50 border border-slate-200/40
                    active:scale-[0.98] active:bg-white/70
                    transition-all duration-200
                    mobile-card-enter text-left
                  "
                  style={{ animationDelay: `${600 + i * 60}ms` }}
                >
                  <div className={`
                    w-2.5 h-2.5 rounded-full shrink-0
                    ${display.status === 'permanent_offline' ? 'bg-red-700' : 'bg-red-500'}
                  `} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {display.locationName || display.displayId}
                    </div>
                    <div className="text-xs text-slate-500 font-mono truncate">
                      {display.city || ''} {display.offlineHours ? `-- ${formatDuration(display.offlineHours)}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 shrink-0" />
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
