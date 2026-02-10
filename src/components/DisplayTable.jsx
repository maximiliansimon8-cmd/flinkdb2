import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, Filter } from 'lucide-react';
import {
  getStatusColor,
  getStatusLabel,
  formatDuration,
  formatDate,
  formatDateTime,
} from '../utils/dataProcessing';

function StatusBadge({ status }) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium font-mono"
      style={{ backgroundColor: color + '18', color, border: `1px solid ${color}33` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export default function DisplayTable({ displays, onSelectDisplay, skipActiveFilter }) {
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('offlineHours');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Derive unique cities and statuses
  const cities = useMemo(() => {
    const base = skipActiveFilter ? displays : displays.filter((d) => d.isActive);
    const citySet = new Set(base.map((d) => d.cityCode));
    return Array.from(citySet).sort();
  }, [displays]);

  const statuses = useMemo(() => {
    const base = skipActiveFilter ? displays : displays.filter((d) => d.isActive);
    const statusSet = new Set(base.map((d) => d.status));
    // Preserve a logical order
    const order = ['online', 'warning', 'critical', 'permanent_offline', 'never_online'];
    return order.filter((s) => statusSet.has(s));
  }, [displays, skipActiveFilter]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = skipActiveFilter ? [...displays] : displays.filter((d) => d.isActive);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.displayId.toLowerCase().includes(q) ||
          (d.displayName || '').toLowerCase().includes(q) ||
          d.locationName.toLowerCase().includes(q)
      );
    }

    if (cityFilter) {
      result = result.filter((d) => d.cityCode === cityFilter);
    }

    if (statusFilter) {
      result = result.filter((d) => d.status === statusFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (aVal == null) aVal = sortDir === 'desc' ? -Infinity : Infinity;
      if (bVal == null) bVal = sortDir === 'desc' ? -Infinity : Infinity;
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal instanceof Date) aVal = aVal.getTime();
      if (bVal instanceof Date) bVal = bVal.getTime();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [displays, search, cityFilter, statusFilter, sortField, sortDir, skipActiveFilter]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'offlineHours' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-20" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={12} className="text-[#3b82f6]" />
    ) : (
      <ChevronDown size={12} className="text-[#3b82f6]" />
    );
  };

  const getRowBg = (status) => {
    switch (status) {
      case 'permanent_offline': return 'bg-red-50/80 hover:bg-red-100/60';
      case 'critical': return 'bg-red-50/60 hover:bg-red-100/40';
      case 'warning': return 'bg-amber-50/60 hover:bg-amber-100/40';
      case 'never_online': return 'bg-slate-100/40 hover:bg-slate-100/60';
      default: return 'hover:bg-white/80';
    }
  };

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl">
      <div className="p-4 border-b border-slate-200/60">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
          <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wider flex-shrink-0">
            Display-Liste
          </h3>

          <div className="flex flex-wrap items-center gap-2 flex-grow">
            {/* Search */}
            <div className="relative flex-grow max-w-xs">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Display ID / Standort..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full bg-slate-50/80 border border-slate-200/60 rounded-md pl-8 pr-3 py-1.5 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6]"
              />
            </div>

            {/* City filter */}
            <select
              value={cityFilter}
              onChange={(e) => { setCityFilter(e.target.value); setPage(0); }}
              className="bg-slate-50/80 border border-slate-200/60 rounded-md px-2 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#3b82f6]"
            >
              <option value="">Alle Städte</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="bg-slate-50/80 border border-slate-200/60 rounded-md px-2 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#3b82f6]"
            >
              <option value="">Alle Status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{getStatusLabel(s)}</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-400 font-mono flex-shrink-0">
            {filtered.length} Displays
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200/60 text-slate-400">
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-slate-600">
                  Status <SortIcon field="status" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('displayId')} className="flex items-center gap-1 hover:text-slate-600">
                  Display ID <SortIcon field="displayId" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('locationName')} className="flex items-center gap-1 hover:text-slate-600">
                  Standort <SortIcon field="locationName" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('cityCode')} className="flex items-center gap-1 hover:text-slate-600">
                  Stadt <SortIcon field="cityCode" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('heartbeat')} className="flex items-center gap-1 hover:text-slate-600">
                  Letzter Heartbeat <SortIcon field="heartbeat" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('offlineHours')} className="flex items-center gap-1 hover:text-slate-600">
                  Offline-Dauer <SortIcon field="offlineHours" />
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">
                <button onClick={() => handleSort('firstSeen')} className="flex items-center gap-1 hover:text-slate-600">
                  Installiert <SortIcon field="firstSeen" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((display) => (
              <tr
                key={display.displayId}
                className={`border-b border-slate-200/40 cursor-pointer transition-colors ${getRowBg(display.status)}`}
                onClick={() => onSelectDisplay(display)}
              >
                <td className="px-4 py-2">
                  <StatusBadge status={display.status} />
                </td>
                <td className="px-4 py-2 font-mono text-slate-900">
                  {display.displayId}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {display.displayName || display.locationName || '–'}
                </td>
                <td className="px-4 py-2 font-mono text-slate-600">
                  {display.cityCode}
                </td>
                <td className="px-4 py-2 font-mono text-slate-600">
                  {formatDateTime(display.heartbeat)}
                </td>
                <td className="px-4 py-2 font-mono">
                  {display.status === 'online' ? (
                    <span className="text-[#22c55e]">–</span>
                  ) : display.status === 'never_online' ? (
                    <span className="text-slate-400">Nie online</span>
                  ) : display.offlineHours != null ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded font-bold"
                      style={{
                        color: getStatusColor(display.status),
                        backgroundColor: getStatusColor(display.status) + '15',
                      }}
                    >
                      {formatDuration(display.offlineHours)} offline
                    </span>
                  ) : (
                    <span className="text-slate-400">–</span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-slate-400">
                  {formatDate(display.firstSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/60">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-xs font-mono px-3 py-1 rounded bg-slate-50/80 border border-slate-200/60 text-slate-600 hover:border-[#3b82f6] disabled:opacity-30 disabled:hover:border-slate-200/60"
          >
            Zurück
          </button>
          <span className="text-xs font-mono text-slate-400">
            Seite {page + 1} von {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="text-xs font-mono px-3 py-1 rounded bg-slate-50/80 border border-slate-200/60 text-slate-600 hover:border-[#3b82f6] disabled:opacity-30 disabled:hover:border-slate-200/60"
          >
            Weiter
          </button>
        </div>
      )}
    </div>
  );
}
