import { useState, useMemo, useCallback } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Plus, Minus,
  ArrowRight, Search, ChevronDown, Loader2, MapPin, RefreshCw,
  Eye, X, Download, Database, Clock,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/** Fields to compare for change detection — all core data fields */
const COMPARE_FIELDS = [
  'name', 'street', 'street_number', 'postcode', 'city',
  'phone', 'email', 'contact_name', 'contact_email', 'contact_phone',
  'account_name', 'lega_entity_adress', 'location_categories', 'jet_chain',
  'restaurant_website', 'brands_listed',
  'latitude', 'longitude',
  'formatted_phone', 'superchat_id',
  'regular_open_time', 'regular_close_time_weekdays', 'regular_close_time_weekdend',
  'weekend_close_time', 'closed_days',
];

/** Labels for display */
const FIELD_LABELS = {
  name: 'Name', street: 'Strasse', street_number: 'Hausnr.', postcode: 'PLZ',
  city: 'Stadt', phone: 'Telefon', email: 'E-Mail', contact_name: 'Kontakt',
  contact_email: 'Kontakt-Email', contact_phone: 'Kontakt-Telefon',
  account_name: 'Firma/Entity', lega_entity_adress: 'Firmenadresse',
  location_categories: 'Kategorie', jet_chain: 'JET Chain',
  restaurant_website: 'Website', brands_listed: 'Marken',
  latitude: 'Breitengrad', longitude: 'Laengengrad',
  formatted_phone: 'Mobilnr. (DE)', superchat_id: 'SuperChat ID',
  regular_open_time: 'Oeffnungszeit', regular_close_time_weekdays: 'Schluss Mo-Fr',
  regular_close_time_weekdend: 'Schluss Sa-So', weekend_close_time: 'Schluss Wochenende',
  closed_days: 'Ruhetage',
};

/** Parse CSV text into array of objects */
function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect separator
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim());

  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === sep && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

/** Normalize string for comparison */
function norm(val) {
  if (val == null) return '';
  return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Normalize address for duplicate detection */
function addrKey(row) {
  const street = norm(row.street || row.Street || '');
  const nr = norm(row.street_number || row['Street Number'] || '');
  const plz = norm(row.postcode || row['Postal Code'] || '');
  const city = norm(row.city || row.City || '');
  return `${street}|${nr}|${plz}|${city}`;
}

/** Badge component */
function Badge({ color, children }) {
  const colors = {
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors[color] || colors.gray}`}>{children}</span>;
}

export default function StammdatenImport() {
  const [csvData, setCsvData] = useState(null);
  const [airtableData, setAirtableData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingAirtable, setLoadingAirtable] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const [expandedId, setExpandedId] = useState(null);
  const [fileName, setFileName] = useState('');

  /** Fetch all Stammdaten from Supabase (synced from Airtable every 5 min) */
  const fetchStammdaten = useCallback(async () => {
    setLoadingAirtable(true);
    setError(null);
    setSyncInfo(null);
    try {
      // 1. Check sync freshness
      const { data: syncMeta } = await supabase
        .from('sync_metadata')
        .select('last_sync_timestamp,last_sync_status,records_upserted')
        .eq('table_name', 'stammdaten')
        .single();

      if (syncMeta?.last_sync_timestamp) {
        const syncAge = Date.now() - new Date(syncMeta.last_sync_timestamp).getTime();
        const syncMinAgo = Math.round(syncAge / 60000);
        setSyncInfo({
          lastSync: syncMeta.last_sync_timestamp,
          minAgo: syncMinAgo,
          status: syncMeta.last_sync_status,
          fresh: syncMinAgo <= 10,
        });
      }

      // 2. Fetch all stammdaten from Supabase — all columns (paginated, 1000 per page)
      const allRows = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error: fetchErr } = await supabase
          .from('stammdaten')
          .select('*')
          .range(from, from + PAGE_SIZE - 1);
        if (fetchErr) throw new Error(`Supabase Fehler: ${fetchErr.message}`);
        allRows.push(...(data || []));
        hasMore = data?.length === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      // 3. Collect column names from first record for field overview
      const allColumns = allRows.length > 0 ? Object.keys(allRows[0]).sort() : [];
      setSyncInfo(prev => prev ? { ...prev, allColumns, totalRecords: allRows.length } : { allColumns, totalRecords: allRows.length });

      // 4. Map to comparison format keyed by JET ID
      const map = new Map();
      for (const row of allRows) {
        const jetId = row.jet_id;
        if (!jetId) continue;
        map.set(String(jetId), {
          airtable_id: row.airtable_id || '',
          id: String(jetId),
          // Core
          name: row.location_name || '',
          street: row.street || '',
          street_number: row.street_number || '',
          postcode: row.postal_code || '',
          city: row.city || '',
          // Contact
          phone: row.location_phone || '',
          email: row.location_email || '',
          contact_name: row.contact_person || '',
          contact_email: row.contact_email || '',
          contact_phone: row.contact_phone || '',
          formatted_phone: row.formatted_germany_mobile_phone || '',
          superchat_id: row.superchat_id || '',
          // Entity
          account_name: row.legal_entity || '',
          lega_entity_adress: row.lega_entity_adress || '',
          location_categories: row.location_categories || '',
          jet_chain: row.jet_chain || '',
          restaurant_website: row.restaurant_website || '',
          brands_listed: row.brands_listed || '',
          // Geo
          latitude: row.latitude != null ? String(row.latitude) : '',
          longitude: row.longitude != null ? String(row.longitude) : '',
          // Opening hours
          regular_open_time: row.regular_open_time || '',
          regular_close_time_weekdays: row.regular_close_time_weekdays || '',
          regular_close_time_weekdend: row.regular_close_time_weekdend || '',
          weekend_close_time: row.weekend_close_time || '',
          closed_days: row.closed_days || '',
          // Linked records (for display, not comparison)
          display_ids: row.display_ids || [],
          lead_status: row.lead_status || [],
          displays: row.displays || [],
          installationen: row.installationen || [],
          online_status_from_displays: row.online_status_from_displays || [],
        });
      }
      setAirtableData(map);
      return map;
    } catch (err) {
      setError(`Laden fehlgeschlagen: ${err.message}`);
      return null;
    } finally {
      setLoadingAirtable(false);
    }
  }, []);

  /** Handle CSV file upload */
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const rows = parseCSV(text);
        if (rows.length === 0) throw new Error('Keine Daten in der CSV gefunden');
        // Normalize: ensure id is string
        const normalized = rows.map(r => ({
          ...r,
          id: String(r.id || '').trim(),
        })).filter(r => r.id);
        setCsvData(normalized);
        setActiveTab('summary');
      } catch (err) {
        setError(`CSV-Fehler: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => { setError('Datei konnte nicht gelesen werden'); setLoading(false); };
    reader.readAsText(file, 'UTF-8');
  }, []);

  /** Run comparison */
  const comparison = useMemo(() => {
    if (!csvData || !airtableData) return null;

    const matched = [];      // Same ID, fields may differ
    const newEntries = [];   // In CSV but not in Airtable
    const missing = [];      // In Airtable but not in CSV
    const addrConflicts = []; // Same address, different ID

    const csvById = new Map();
    const csvByAddr = new Map();
    for (const row of csvData) {
      csvById.set(row.id, row);
      const ak = addrKey(row);
      if (ak !== '|||') {
        if (!csvByAddr.has(ak)) csvByAddr.set(ak, []);
        csvByAddr.get(ak).push(row);
      }
    }

    const atByAddr = new Map();
    for (const [id, rec] of airtableData) {
      const ak = addrKey(rec);
      if (ak !== '|||') {
        if (!atByAddr.has(ak)) atByAddr.set(ak, []);
        atByAddr.get(ak).push(rec);
      }
    }

    // 1. Match by ID
    for (const row of csvData) {
      const existing = airtableData.get(row.id);
      if (existing) {
        const changes = [];
        for (const field of COMPARE_FIELDS) {
          const csvVal = norm(row[field]);
          const atVal = norm(existing[field]);
          if (csvVal !== atVal) {
            changes.push({ field, label: FIELD_LABELS[field] || field, csvVal: row[field] || '', atVal: existing[field] || '' });
          }
        }
        matched.push({ id: row.id, csv: row, airtable: existing, changes, hasChanges: changes.length > 0 });
      } else {
        newEntries.push(row);
      }
    }

    // 2. Missing from CSV (in Airtable but not in CSV)
    for (const [id, rec] of airtableData) {
      if (!csvById.has(id)) {
        missing.push(rec);
      }
    }

    // 3. Address conflicts: same address but different IDs
    for (const [addr, csvRows] of csvByAddr) {
      const atRows = atByAddr.get(addr) || [];
      for (const csvRow of csvRows) {
        for (const atRow of atRows) {
          if (csvRow.id !== atRow.id) {
            addrConflicts.push({
              csvId: csvRow.id,
              airtableId: atRow.id,
              csvName: csvRow.name,
              airtableName: atRow.name,
              address: `${csvRow.street} ${csvRow.street_number}, ${csvRow.postcode} ${csvRow.city}`,
            });
          }
        }
      }
    }

    // Also check: new entries that share an address with existing Airtable records
    for (const row of newEntries) {
      const ak = addrKey(row);
      const atRows = atByAddr.get(ak) || [];
      for (const atRow of atRows) {
        // Already captured above, but let's ensure
        const alreadyFound = addrConflicts.some(c => c.csvId === row.id && c.airtableId === atRow.id);
        if (!alreadyFound) {
          addrConflicts.push({
            csvId: row.id,
            airtableId: atRow.id,
            csvName: row.name,
            airtableName: atRow.name,
            address: `${row.street} ${row.street_number}, ${row.postcode} ${row.city}`,
          });
        }
      }
    }

    const withChanges = matched.filter(m => m.hasChanges);
    const unchanged = matched.filter(m => !m.hasChanges);

    return { matched, withChanges, unchanged, newEntries, missing, addrConflicts };
  }, [csvData, airtableData]);

  /** Filter results by search */
  const filteredResults = useMemo(() => {
    if (!comparison) return null;
    if (!search) return comparison;
    const s = search.toLowerCase();
    const filter = (arr) => arr.filter(item => {
      const row = item.csv || item;
      return (row.name || row.location_name || '').toLowerCase().includes(s) ||
        (row.id || '').includes(s) ||
        (row.city || '').toLowerCase().includes(s) ||
        (row.street || '').toLowerCase().includes(s);
    });
    return {
      ...comparison,
      withChanges: filter(comparison.withChanges),
      newEntries: filter(comparison.newEntries),
      missing: filter(comparison.missing),
      addrConflicts: comparison.addrConflicts.filter(c =>
        c.address.toLowerCase().includes(s) || c.csvId.includes(s) || c.airtableId.includes(s)
      ),
    };
  }, [comparison, search]);

  /** Export diff as CSV */
  const exportDiff = useCallback(() => {
    if (!comparison) return;
    const lines = ['Typ;JET ID;Name;Feld;CSV-Wert;Airtable-Wert;Adresse'];
    for (const m of comparison.withChanges) {
      for (const c of m.changes) {
        lines.push(`Geaendert;${m.id};${m.csv.name};${c.label};${c.csvVal};${c.atVal};${m.csv.street} ${m.csv.street_number} ${m.csv.postcode} ${m.csv.city}`);
      }
    }
    for (const n of comparison.newEntries) {
      lines.push(`Neu;${n.id};${n.name};;;${n.street} ${n.street_number} ${n.postcode} ${n.city}`);
    }
    for (const m of comparison.missing) {
      lines.push(`Fehlend;${m.id};${m.name};;;${m.street} ${m.street_number} ${m.postcode} ${m.city}`);
    }
    for (const c of comparison.addrConflicts) {
      lines.push(`Adress-Konflikt;CSV:${c.csvId} / AT:${c.airtableId};${c.csvName} / ${c.airtableName};;;${c.address}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'stammdaten-diff.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [comparison]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Stammdaten Import / Abgleich</h2>
          <p className="text-xs text-gray-500 mt-0.5">JET Restaurant-Export mit Airtable Stammdaten abgleichen</p>
        </div>
      </div>

      {/* Upload + Airtable Load */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CSV Upload */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Upload size={16} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">1. JET Export CSV hochladen</h3>
          </div>
          <label className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
            <FileText size={24} className="text-slate-400" />
            <span className="text-sm text-slate-500">
              {fileName ? fileName : 'CSV-Datei auswaehlen...'}
            </span>
            {csvData && <span className="text-xs text-emerald-600 font-medium">{csvData.length} Eintraege geladen</span>}
            <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Supabase Load */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database size={16} className="text-orange-600" />
            <h3 className="text-sm font-semibold text-gray-900">2. Stammdaten laden</h3>
            <span className="text-[10px] text-gray-400 ml-auto">via Supabase (Airtable-Sync alle 5 Min)</span>
          </div>
          <button
            onClick={fetchStammdaten}
            disabled={loadingAirtable}
            className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-all disabled:opacity-50"
          >
            {loadingAirtable ? (
              <Loader2 size={24} className="text-orange-500 animate-spin" />
            ) : (
              <Database size={24} className="text-slate-400" />
            )}
            <span className="text-sm text-slate-500">
              {loadingAirtable ? 'Lade Stammdaten...' : airtableData ? `${airtableData.size} Stammdaten geladen` : 'Klicken zum Laden'}
            </span>
            {airtableData && <span className="text-xs text-emerald-600 font-medium">Bereit zum Abgleich</span>}
            {syncInfo && (
              <span className={`text-[10px] flex items-center gap-1 ${syncInfo.fresh ? 'text-emerald-600' : 'text-amber-600'}`}>
                <Clock size={10} />
                Letzter Sync: vor {syncInfo.minAgo} Min {!syncInfo.fresh && '(moeglicherweise veraltet)'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Field Overview — shows all columns after loading */}
      {syncInfo?.allColumns && (
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Supabase Spalten ({syncInfo.allColumns.length}) — {syncInfo.totalRecords} Records
          </h3>
          <div className="flex flex-wrap gap-1">
            {syncInfo.allColumns.filter(c => c !== 'extra_fields').map(f => (
              <span key={f} className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Run comparison button */}
      {csvData && airtableData && !comparison && (
        <div className="text-center text-sm text-gray-500">Abgleich wird berechnet...</div>
      )}

      {/* Results */}
      {comparison && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button onClick={() => setActiveTab('summary')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'summary' ? 'bg-gray-900 text-white' : 'bg-white/60 border border-slate-200/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Gesamt CSV</p>
              <p className="text-2xl font-bold">{csvData.length}</p>
            </button>
            <button onClick={() => setActiveTab('unchanged')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'unchanged' ? 'bg-emerald-600 text-white' : 'bg-emerald-50/80 border border-emerald-200/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Unveraendert</p>
              <p className={`text-2xl font-bold ${activeTab === 'unchanged' ? '' : 'text-emerald-700'}`}>{comparison.unchanged.length}</p>
            </button>
            <button onClick={() => setActiveTab('changed')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'changed' ? 'bg-amber-600 text-white' : 'bg-amber-50/80 border border-amber-200/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Geaendert</p>
              <p className={`text-2xl font-bold ${activeTab === 'changed' ? '' : 'text-amber-700'}`}>{comparison.withChanges.length}</p>
            </button>
            <button onClick={() => setActiveTab('new')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'new' ? 'bg-blue-600 text-white' : 'bg-blue-50/80 border border-blue-200/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Neu (nur CSV)</p>
              <p className={`text-2xl font-bold ${activeTab === 'new' ? '' : 'text-blue-700'}`}>{comparison.newEntries.length}</p>
            </button>
            <button onClick={() => setActiveTab('missing')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'missing' ? 'bg-red-600 text-white' : 'bg-red-50/80 border border-red-200/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Fehlend (nur AT)</p>
              <p className={`text-2xl font-bold ${activeTab === 'missing' ? '' : 'text-red-700'}`}>{comparison.missing.length}</p>
            </button>
            <button onClick={() => setActiveTab('conflicts')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'conflicts' ? 'bg-purple-600 text-white' : 'bg-purple-50/80 border border-purple-200/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Adress-Konflikte</p>
              <p className={`text-2xl font-bold ${activeTab === 'conflicts' ? '' : 'text-purple-700'}`}>{comparison.addrConflicts.length}</p>
            </button>
          </div>

          {/* Search + Export */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name, ID, Stadt, Strasse..."
                className="w-full pl-10 pr-4 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/30 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={exportDiff} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-medium text-gray-700 transition-colors">
              <Download size={14} /> Diff exportieren
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden">
            {/* Summary */}
            {activeTab === 'summary' && (
              <div className="p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Zusammenfassung</h3>
                <div className="text-sm text-gray-600 space-y-1.5">
                  <p><Badge color="gray">{csvData.length}</Badge> Eintraege im JET-Export</p>
                  <p><Badge color="gray">{airtableData.size}</Badge> Eintraege in Supabase (Airtable-Sync)</p>
                  <p><Badge color="green">{comparison.unchanged.length}</Badge> unveraendert (ID match, alle Felder identisch)</p>
                  <p><Badge color="amber">{comparison.withChanges.length}</Badge> mit Aenderungen (ID match, Felder weichen ab)</p>
                  <p><Badge color="blue">{comparison.newEntries.length}</Badge> neue Standorte (ID nur im CSV)</p>
                  <p><Badge color="red">{comparison.missing.length}</Badge> fehlend im Export (ID nur in Airtable)</p>
                  <p><Badge color="purple">{comparison.addrConflicts.length}</Badge> Adress-Konflikte (gleiche Anschrift, andere ID)</p>
                </div>
                {comparison.withChanges.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Haeufigste Aenderungen</h4>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const counts = {};
                        comparison.withChanges.forEach(m => m.changes.forEach(c => { counts[c.label] = (counts[c.label] || 0) + 1; }));
                        return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                          <span key={label} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-lg font-mono">
                            {label}: {count}x
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Changed entries */}
            {activeTab === 'changed' && (
              <div className="divide-y divide-slate-100">
                {filteredResults.withChanges.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">Keine geaenderten Eintraege</div>
                ) : filteredResults.withChanges.map(m => (
                  <div key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <button
                      onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left"
                    >
                      <Badge color="amber">{m.changes.length}</Badge>
                      <span className="text-xs font-mono text-gray-400 w-20 flex-shrink-0">{m.id}</span>
                      <span className="text-sm font-medium text-gray-900 flex-1 truncate">{m.csv.name}</span>
                      <span className="text-xs text-gray-400">{m.csv.city}</span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedId === m.id ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedId === m.id && (
                      <div className="px-4 pb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 uppercase">
                              <th className="text-left py-1 px-2 font-medium">Feld</th>
                              <th className="text-left py-1 px-2 font-medium">JET Export (neu)</th>
                              <th className="text-left py-1 px-2 font-medium">Airtable (aktuell)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.changes.map(c => (
                              <tr key={c.field} className="border-t border-slate-100">
                                <td className="py-1.5 px-2 font-medium text-gray-700">{c.label}</td>
                                <td className="py-1.5 px-2 text-blue-700 bg-blue-50/50 font-mono">{c.csvVal || <span className="text-gray-300 italic">leer</span>}</td>
                                <td className="py-1.5 px-2 text-gray-500 font-mono">{c.atVal || <span className="text-gray-300 italic">leer</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* New entries */}
            {activeTab === 'new' && (
              <div className="divide-y divide-slate-100">
                {filteredResults.newEntries.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">Keine neuen Eintraege</div>
                ) : filteredResults.newEntries.map(row => (
                  <div key={row.id} className="px-4 py-3 flex items-center gap-3 hover:bg-blue-50/30 transition-colors">
                    <Plus size={14} className="text-blue-500 flex-shrink-0" />
                    <span className="text-xs font-mono text-gray-400 w-20 flex-shrink-0">{row.id}</span>
                    <span className="text-sm font-medium text-gray-900 flex-1 truncate">{row.name}</span>
                    <span className="text-xs text-gray-500">{row.street} {row.street_number}</span>
                    <span className="text-xs text-gray-400">{row.postcode} {row.city}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Missing from CSV */}
            {activeTab === 'missing' && (
              <div className="divide-y divide-slate-100">
                {filteredResults.missing.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">Alle Airtable-Eintraege sind im CSV vorhanden</div>
                ) : filteredResults.missing.map(rec => (
                  <div key={rec.id} className="px-4 py-3 flex items-center gap-3 hover:bg-red-50/30 transition-colors">
                    <Minus size={14} className="text-red-500 flex-shrink-0" />
                    <span className="text-xs font-mono text-gray-400 w-20 flex-shrink-0">{rec.id}</span>
                    <span className="text-sm font-medium text-gray-900 flex-1 truncate">{rec.name}</span>
                    <span className="text-xs text-gray-500">{rec.street} {rec.street_number}</span>
                    <span className="text-xs text-gray-400">{rec.postcode} {rec.city}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Unchanged */}
            {activeTab === 'unchanged' && (
              <div className="divide-y divide-slate-100">
                {comparison.unchanged.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">Keine unveraenderten Eintraege</div>
                ) : comparison.unchanged.slice(0, 100).map(m => (
                  <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                    <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                    <span className="text-xs font-mono text-gray-400 w-20 flex-shrink-0">{m.id}</span>
                    <span className="text-sm text-gray-700 flex-1 truncate">{m.csv.name}</span>
                    <span className="text-xs text-gray-400">{m.csv.city}</span>
                  </div>
                ))}
                {comparison.unchanged.length > 100 && (
                  <div className="p-3 text-center text-xs text-gray-400">... und {comparison.unchanged.length - 100} weitere</div>
                )}
              </div>
            )}

            {/* Address Conflicts */}
            {activeTab === 'conflicts' && (
              <div className="divide-y divide-slate-100">
                {filteredResults.addrConflicts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">Keine Adress-Konflikte gefunden</div>
                ) : filteredResults.addrConflicts.map((c, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-purple-50/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <MapPin size={14} className="text-purple-500" />
                      <span className="text-xs font-medium text-gray-500">{c.address}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Badge color="blue">CSV</Badge>
                        <span className="font-mono text-gray-500">{c.csvId}</span>
                        <span className="text-gray-700">{c.csvName}</span>
                      </div>
                      <ArrowRight size={12} className="text-gray-300" />
                      <div className="flex items-center gap-1.5">
                        <Badge color="amber">Airtable</Badge>
                        <span className="font-mono text-gray-500">{c.airtableId}</span>
                        <span className="text-gray-700">{c.airtableName}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
