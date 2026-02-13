import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Loader2, RefreshCw, Users, Mail, Phone,
  Building2, MapPin, User, FileText, ExternalLink,
} from 'lucide-react';
import { fetchAllStammdaten } from '../utils/airtableService';

/* ─── KPI Card ─── */
function KpiCard({ label, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</span>
        <div style={{ backgroundColor: `${color}12` }} className="w-7 h-7 rounded-lg flex items-center justify-center">
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-800 font-mono">{value}</div>
      {subtitle && <div className="text-[10px] text-slate-400 mt-1 font-mono">{subtitle}</div>}
    </div>
  );
}

/* ─── Main Component ─── */
export default function ContactDirectory() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchAllStammdaten();
      setData(records || []);
    } catch (err) {
      console.error('[ContactDirectory] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ─── Derived Data ─── */
  const { cities, statuses } = useMemo(() => {
    const citySet = new Set();
    const statusSet = new Set();
    for (const r of data) {
      if (r.fields?.City) citySet.add(r.fields.City);
      if (r.fields?.Status) statusSet.add(r.fields.Status);
    }
    return {
      cities: [...citySet].sort(),
      statuses: [...statusSet].sort(),
    };
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      const f = r.fields || {};
      if (cityFilter !== 'all' && f.City !== cityFilter) return false;
      if (statusFilter !== 'all' && f.Status !== statusFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const searchable = [
          f['Location Name'], f['Contact Person'], f['JET ID'],
          f.City, f['Contact Email'], f['Contact Phone'],
          f['Legal Entity'], f['Postal Code'],
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [data, cityFilter, statusFilter, searchTerm]);

  const paged = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  /* ─── KPIs ─── */
  const kpis = useMemo(() => {
    const total = data.length;
    const withContact = data.filter(r => r.fields?.['Contact Person']).length;
    const withEmail = data.filter(r => r.fields?.['Contact Email']).length;
    const withPhone = data.filter(r => r.fields?.['Contact Phone'] || r.fields?.['Location Phone']).length;
    return { total, withContact, withEmail, withPhone };
  }, [data]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [searchTerm, cityFilter, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500 font-mono">Lade Kontaktdaten...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gesamt Standorte" value={kpis.total} icon={Building2} color="#3b82f6" />
        <KpiCard label="Mit Kontaktperson" value={kpis.withContact} icon={User} color="#22c55e" subtitle={kpis.total > 0 ? `${Math.round(kpis.withContact / kpis.total * 100)}%` : undefined} />
        <KpiCard label="Mit Email" value={kpis.withEmail} icon={Mail} color="#8b5cf6" />
        <KpiCard label="Mit Telefon" value={kpis.withPhone} icon={Phone} color="#f59e0b" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Suche (Name, Kontakt, JET-ID, Stadt, Email...)"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-white/60 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          className="text-xs font-mono bg-white/60 border border-slate-200/60 rounded-xl px-3 py-2">
          <option value="all">Alle Städte</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-xs font-mono bg-white/60 border border-slate-200/60 rounded-xl px-3 py-2">
          <option value="all">Alle Status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-slate-500 bg-white/60 border border-slate-200/60 rounded-xl hover:bg-slate-50 transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>

        <span className="text-[10px] text-slate-400 font-mono ml-auto">{filtered.length} Einträge</span>
      </div>

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                {['Standort', 'JET-ID', 'Stadt', 'PLZ', 'Adresse', 'Kontaktperson', 'Email', 'Telefon', 'Rechtsform', 'Status'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const f = r.fields || {};
                const contactEmail = f['Contact Email'] || f['Location Email'] || '';
                const contactPhone = f['Contact Phone'] || f['Location Phone'] || '';
                const statusColor = f.Status === 'Live' ? '#22c55e' : f.Status === 'Deinstalled' ? '#ef4444' : '#64748b';

                return (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2 text-slate-700 font-medium max-w-[200px] truncate">{f['Location Name'] || '–'}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{f['JET ID'] || '–'}</td>
                    <td className="px-3 py-2 text-slate-500">{f.City || '–'}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{f['Postal Code'] || '–'}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate">{[f.Street, f['Street Number']].filter(Boolean).join(' ') || '–'}</td>
                    <td className="px-3 py-2 text-slate-700">{f['Contact Person'] || '–'}</td>
                    <td className="px-3 py-2">
                      {contactEmail ? (
                        <a href={`mailto:${contactEmail}`} className="text-blue-500 hover:text-blue-700 flex items-center gap-1 max-w-[160px] truncate" title={contactEmail}>
                          <Mail size={11} className="shrink-0" />
                          <span className="truncate font-mono">{contactEmail}</span>
                        </a>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {contactPhone ? (
                        <a href={`tel:${contactPhone}`} className="text-green-600 hover:text-green-800 flex items-center gap-1" title={contactPhone}>
                          <Phone size={11} className="shrink-0" />
                          <span className="font-mono">{contactPhone}</span>
                        </a>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-[10px]">{f['Legal Entity'] || '–'}</td>
                    <td className="px-3 py-2">
                      {f.Status ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ backgroundColor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}33` }}>
                          {f.Status}
                        </span>
                      ) : (
                        <span className="text-slate-300">–</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-10">Keine Standorte gefunden</div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-[10px] text-slate-400 font-mono">
              Seite {page + 1} von {totalPages} ({filtered.length} Einträge)
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs font-mono rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Zurück
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs font-mono rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
