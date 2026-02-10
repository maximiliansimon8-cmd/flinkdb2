import React from 'react';
import {
  Monitor,
  Activity,
  WifiOff,
  AlertTriangle,
  PlusCircle,
  Clock,
  Skull,
} from 'lucide-react';

function KPICard({ label, value, icon: Icon, color, subtitle, large, onClick, active }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white/60 backdrop-blur-xl border rounded-2xl p-4 shadow-sm shadow-black/[0.03] transition-all ${
        large ? 'col-span-1 md:col-span-2 lg:col-span-1' : ''
      } ${
        onClick ? 'cursor-pointer hover:bg-white/80' : ''
      } ${
        active
          ? 'border-[#3b82f6] ring-1 ring-[#3b82f6]/30'
          : 'border-slate-200/60'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
        <Icon size={16} style={{ color }} className="opacity-70" />
      </div>
      <div
        className={`font-mono font-bold ${large ? 'text-4xl' : 'text-2xl'}`}
        style={{ color }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-slate-400 text-xs mt-1">{subtitle}</div>
      )}
    </div>
  );
}

// Filter keys that can be passed to the parent
export const KPI_FILTERS = {
  ACTIVE: 'active',
  ONLINE: 'online',
  WARNING: 'warning',
  CRITICAL: 'critical',
  PERMANENT_OFFLINE: 'permanent_offline',
  NEVER_ONLINE: 'never_online',
  NEW: 'new',
  DEINSTALLED: 'deinstalled',
};

export default function KPICards({ kpis, activeFilter, onFilterClick }) {
  const healthColor =
    kpis.healthRate >= 90
      ? '#22c55e'
      : kpis.healthRate >= 70
        ? '#f59e0b'
        : '#ef4444';

  const toggle = (filter) => {
    onFilterClick(activeFilter === filter ? null : filter);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
      <KPICard
        label="Health Rate"
        value={`${kpis.healthRate}%`}
        icon={Activity}
        color={healthColor}
        subtitle={kpis.snapshotCount > 0 ? `Ø ${kpis.snapshotCount} Snapshots` : undefined}
        large
      />
      <KPICard
        label="Aktive Displays"
        value={kpis.totalActive}
        icon={Monitor}
        color="#3b82f6"
        onClick={() => toggle(KPI_FILTERS.ACTIVE)}
        active={activeFilter === KPI_FILTERS.ACTIVE}
      />
      <KPICard
        label="Online"
        value={kpis.onlineCount}
        icon={Activity}
        color="#22c55e"
        subtitle="< 24h"
        onClick={() => toggle(KPI_FILTERS.ONLINE)}
        active={activeFilter === KPI_FILTERS.ONLINE}
      />
      <KPICard
        label="Warnung"
        value={kpis.warningCount}
        icon={Clock}
        color="#f59e0b"
        subtitle="24–72h"
        onClick={() => toggle(KPI_FILTERS.WARNING)}
        active={activeFilter === KPI_FILTERS.WARNING}
      />
      <KPICard
        label="Kritisch"
        value={kpis.criticalCount}
        icon={AlertTriangle}
        color="#ef4444"
        subtitle="> 72h"
        onClick={() => toggle(KPI_FILTERS.CRITICAL)}
        active={activeFilter === KPI_FILTERS.CRITICAL}
      />
      <KPICard
        label="Dauerhaft Offline"
        value={kpis.permanentOfflineCount}
        icon={Skull}
        color="#dc2626"
        subtitle="> 7 Tage"
        onClick={() => toggle(KPI_FILTERS.PERMANENT_OFFLINE)}
        active={activeFilter === KPI_FILTERS.PERMANENT_OFFLINE}
      />
      <KPICard
        label="Nie Online"
        value={kpis.neverOnlineCount}
        icon={WifiOff}
        color="#64748b"
        subtitle="Kein Heartbeat"
        onClick={() => toggle(KPI_FILTERS.NEVER_ONLINE)}
        active={activeFilter === KPI_FILTERS.NEVER_ONLINE}
      />
      <KPICard
        label="Neu / Deinstalliert"
        value={`+${kpis.newlyInstalled} / -${kpis.deinstalled}`}
        icon={PlusCircle}
        color="#94a3b8"
        subtitle="7d / 30d"
        onClick={() => toggle(KPI_FILTERS.NEW)}
        active={activeFilter === KPI_FILTERS.NEW}
      />
    </div>
  );
}
