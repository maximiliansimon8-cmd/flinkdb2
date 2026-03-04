import { useState, useMemo, useCallback } from 'react';
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Plus, Minus,
  ArrowRight, Search, ChevronDown, Loader2, MapPin, RefreshCw,
  Eye, X, Download, Database, Clock, Shield, Zap, XCircle,
} from 'lucide-react';
import { supabase } from '../utils/authService';

/** Top 5 Grossstaedte fuer Akquise-Freigabe Filter */
const TOP5_CITIES = ['berlin', 'hamburg', 'münchen', 'muenchen', 'munich', 'köln', 'koeln', 'cologne', 'frankfurt'];

/** Critical fields — require individual review before import (Name, Chain) */
const CRITICAL_FIELDS = new Set([
  'name', 'jet_chain',
]);

/** All possible comparison fields */
const ALL_COMPARE_FIELDS = [
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

/** Map Airtable CSV header names → internal keys (covers JET SEARCH export) */
const CSV_HEADER_MAP = {
  'JET ID': 'id',
  'Location Name': 'name',
  'Street': 'street',
  'Street Number': 'street_number',
  'Postal Code': 'postcode',
  'City': 'city',
  'Location Phone': 'phone',
  'Location Email': 'email',
  'Contact Person': 'contact_name',
  'Contact Email': 'contact_email',
  'Contact Phone': 'contact_phone',
  'Legal Entity': 'account_name',
  'Lega Entity Adress': 'lega_entity_adress',
  'Location Categories': 'location_categories',
  'JET Chain': 'jet_chain',
  'Restaurant Website': 'restaurant_website',
  'Brands_listed': 'brands_listed',
  'Latitude': 'latitude',
  'Longitude': 'longitude',
  'Formatted Germany Mobile Phone': 'formatted_phone',
  'regular_open_time': 'regular_open_time',
  'regular_close_time_weekdays': 'regular_close_time_weekdays',
  'regular_close_time_weekdend': 'regular_close_time_weekdend',
  'weekend_close_time': 'weekend_close_time',
  'closed_days': 'closed_days',
  'superchat_id': 'superchat_id',
  'email': 'email',
  'phone': 'phone',
  // Also accept already-normalized keys (e.g. from a pre-mapped CSV)
  'id': 'id', 'name': 'name', 'street': 'street', 'street_number': 'street_number',
  'postcode': 'postcode', 'city': 'city', 'contact_name': 'contact_name',
  'contact_email': 'contact_email', 'contact_phone': 'contact_phone',
  'account_name': 'account_name', 'lega_entity_adress': 'lega_entity_adress',
  'location_categories': 'location_categories', 'jet_chain': 'jet_chain',
  'restaurant_website': 'restaurant_website', 'brands_listed': 'brands_listed',
  'latitude': 'latitude', 'longitude': 'longitude', 'formatted_phone': 'formatted_phone',
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

/** Normalize value for comparison — handles number precision, arrays, empty values */
function norm(val) {
  if (val == null || val === '' || val === 'null' || val === 'undefined') return '';
  // Arrays: sort and join for stable comparison
  if (Array.isArray(val)) {
    const filtered = val.map(v => norm(v)).filter(Boolean);
    return filtered.sort().join(', ');
  }
  let s = String(val).trim();
  if (s === '') return '';
  // Numbers: parse and compare as float to avoid precision differences (e.g. "52.52000800" vs "52.520008")
  const num = Number(s);
  if (!isNaN(num) && isFinite(num) && /^-?\d+(\.\d+)?$/.test(s.replace(/0+$/, '').replace(/\.$/, ''))) {
    return String(num);
  }
  return s.toLowerCase().replace(/\s+/g, ' ');
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
    red: 'bg-status-offline/10 text-red-700',
    amber: 'bg-status-warning/10 text-amber-700',
    blue: 'bg-accent-light text-blue-700',
    purple: 'bg-brand-purple/10 text-purple-700',
    gray: 'bg-surface-secondary text-text-secondary',
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

  // CSV fields actually present in the upload
  const [csvFields, setCsvFields] = useState(new Set());

  // Import flow state
  const [importStep, setImportStep] = useState(null); // null | 'validating' | 'review' | 'importing' | 'done'
  const [validationResult, setValidationResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importProgress, setImportProgress] = useState(null);

  // Selective approval state
  const [approvedNonCritical, setApprovedNonCritical] = useState(false); // bulk approve unkritische
  const [approvedCriticalIds, setApprovedCriticalIds] = useState(new Set()); // individual IDs approved

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
          // Akquise
          zur_akquise_freigegeben: row.zur_akquise_freigegeben || false,
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

        // Detect which CSV headers map to our internal keys
        const sampleKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
        const headerMapping = {};
        for (const csvKey of sampleKeys) {
          const mapped = CSV_HEADER_MAP[csvKey] || CSV_HEADER_MAP[csvKey.trim()];
          if (mapped) headerMapping[csvKey] = mapped;
        }

        // Normalize rows: remap headers + determine which compare fields exist
        const csvFieldsPresent = new Set();
        const normalized = rows.map(r => {
          const out = {};
          for (const [csvKey, intKey] of Object.entries(headerMapping)) {
            out[intKey] = r[csvKey] || '';
            if (intKey !== 'id' && ALL_COMPARE_FIELDS.includes(intKey)) {
              csvFieldsPresent.add(intKey);
            }
          }
          // Fallback: try direct keys if no mapping found
          if (!out.id) out.id = String(r.id || r['JET ID'] || '').trim();
          else out.id = String(out.id).trim();
          return out;
        }).filter(r => r.id);

        setCsvData(normalized);
        setCsvFields(csvFieldsPresent);
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

  /** Determine which fields to compare — only fields that actually exist in the CSV */
  const compareFields = useMemo(() => {
    if (csvFields.size === 0) return ALL_COMPARE_FIELDS; // fallback
    return ALL_COMPARE_FIELDS.filter(f => csvFields.has(f));
  }, [csvFields]);

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

    // 1. Match by ID — only compare fields present in CSV
    for (const row of csvData) {
      const existing = airtableData.get(row.id);
      if (existing) {
        const changes = [];
        for (const field of compareFields) {
          const csvVal = norm(row[field]);
          const atVal = norm(existing[field]);
          if (csvVal !== atVal) {
            const isCritical = CRITICAL_FIELDS.has(field);
            changes.push({
              field, label: FIELD_LABELS[field] || field,
              csvVal: row[field] || '', atVal: existing[field] || '',
              critical: isCritical,
            });
          }
        }
        const criticalChanges = changes.filter(c => c.critical);
        const nonCriticalChanges = changes.filter(c => !c.critical);
        matched.push({
          id: row.id, csv: row, airtable: existing,
          changes, criticalChanges, nonCriticalChanges,
          hasChanges: changes.length > 0,
          hasCritical: criticalChanges.length > 0,
        });
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

    // 3. Address conflicts: same address but different IDs — deduplicated (pair only once)
    const conflictSeen = new Set();
    for (const [addr, csvRows] of csvByAddr) {
      const atRows = atByAddr.get(addr) || [];
      for (const csvRow of csvRows) {
        for (const atRow of atRows) {
          if (csvRow.id !== atRow.id) {
            // Deduplicate: sort IDs so A↔B is same as B↔A
            const pairKey = [csvRow.id, atRow.id].sort().join('|');
            if (conflictSeen.has(pairKey)) continue;
            conflictSeen.add(pairKey);
            addrConflicts.push({
              csvId: csvRow.id,
              airtableId: atRow.id,
              csvName: csvRow.name,
              airtableName: atRow.name,
              address: `${csvRow.street || atRow.street} ${csvRow.street_number || atRow.street_number}, ${csvRow.postcode || atRow.postcode} ${csvRow.city || atRow.city}`,
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
        const pairKey = [row.id, atRow.id].sort().join('|');
        if (conflictSeen.has(pairKey)) continue;
        conflictSeen.add(pairKey);
        addrConflicts.push({
          csvId: row.id,
          airtableId: atRow.id,
          csvName: row.name,
          airtableName: atRow.name,
          address: `${row.street} ${row.street_number}, ${row.postcode} ${row.city}`,
        });
      }
    }

    // 4. Conflict check for new entries: match by address, email, or entity against Airtable
    const atByEmail = new Map();
    const atByEntity = new Map();
    for (const [id, rec] of airtableData) {
      const em = norm(rec.email);
      if (em) { if (!atByEmail.has(em)) atByEmail.set(em, []); atByEmail.get(em).push(rec); }
      const ent = norm(rec.account_name);
      if (ent) { if (!atByEntity.has(ent)) atByEntity.set(ent, []); atByEntity.get(ent).push(rec); }
    }

    const newWithConflicts = []; // new entries that have potential matches
    const newClean = [];         // new entries without conflicts
    for (const row of newEntries) {
      const hints = [];
      // Address match
      const ak = addrKey(row);
      if (ak !== '|||') {
        const atRows = atByAddr.get(ak) || [];
        for (const atRow of atRows) {
          hints.push({ type: 'address', atId: atRow.id, atName: atRow.name, detail: `${atRow.street} ${atRow.street_number}, ${atRow.postcode} ${atRow.city}` });
        }
      }
      // Email match
      const em = norm(row.email);
      if (em) {
        for (const atRow of (atByEmail.get(em) || [])) {
          if (!hints.some(h => h.atId === atRow.id)) {
            hints.push({ type: 'email', atId: atRow.id, atName: atRow.name, detail: row.email });
          }
        }
      }
      // Entity/Inhaber match
      const ent = norm(row.account_name);
      if (ent) {
        for (const atRow of (atByEntity.get(ent) || [])) {
          if (!hints.some(h => h.atId === atRow.id)) {
            hints.push({ type: 'entity', atId: atRow.id, atName: atRow.name, detail: row.account_name });
          }
        }
      }
      if (hints.length > 0) {
        newWithConflicts.push({ ...row, _conflictHints: hints });
      } else {
        newClean.push(row);
      }
    }

    const withChanges = matched.filter(m => m.hasChanges);
    const unchanged = matched.filter(m => !m.hasChanges);

    // Split: records with only non-critical changes vs those with critical
    const withCritical = withChanges.filter(m => m.hasCritical);
    const onlyNonCritical = withChanges.filter(m => !m.hasCritical);

    return { matched, withChanges, unchanged, newEntries, missing, addrConflicts, withCritical, onlyNonCritical, newWithConflicts, newClean };
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

  /** Build import records from comparison results — respects approval state */
  const buildImportRecords = useCallback(() => {
    if (!comparison) return [];
    const records = [];

    // Updates: only include approved changes
    for (const m of comparison.withChanges) {
      if (!m.airtable?.airtable_id) continue;
      const fields = {};

      for (const c of m.changes) {
        if (c.critical) {
          // Critical change: only include if individually approved
          if (approvedCriticalIds.has(`${m.id}:${c.field}`)) {
            fields[c.field] = c.csvVal;
          }
        } else {
          // Non-critical: include if bulk-approved
          if (approvedNonCritical) {
            fields[c.field] = c.csvVal;
          }
        }
      }

      // Only add record if there are approved fields to update
      if (Object.keys(fields).length > 0) {
        records.push({
          airtable_id: m.airtable.airtable_id,
          jet_id: m.id,
          mode: 'update',
          fields,
        });
      }
    }

    // Creates: new entries (no airtable match)
    for (const row of comparison.newEntries) {
      const fields = {};
      for (const field of compareFields) {
        if (row[field]) fields[field] = row[field];
      }
      records.push({
        jet_id: row.id,
        mode: 'create',
        fields,
      });
    }

    return records;
  }, [comparison]);

  /** Step 1: Validate records via backend */
  const runValidation = useCallback(async () => {
    const records = buildImportRecords();
    if (records.length === 0) {
      setError('Keine Aenderungen zum Importieren');
      return;
    }

    setImportStep('validating');
    setError(null);
    setValidationResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Nicht eingeloggt. Bitte zuerst anmelden.');
        setImportStep(null);
        return;
      }

      const res = await fetch('/.netlify/functions/stammdaten-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'validate', records }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Validierung fehlgeschlagen');

      setValidationResult(data);
      setImportStep('review');
    } catch (err) {
      setError(`Validierung fehlgeschlagen: ${err.message}`);
      setImportStep(null);
    }
  }, [buildImportRecords]);

  /** Step 2: Execute import after validation review */
  const runImport = useCallback(async () => {
    const records = buildImportRecords();
    if (records.length === 0) return;

    setImportStep('importing');
    setImportResult(null);
    setError(null);

    const totalBatches = Math.ceil(records.length / 10);
    setImportProgress({ current: 0, total: records.length, batches: totalBatches });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Session abgelaufen. Bitte neu einloggen.');
        setImportStep('review');
        return;
      }

      const res = await fetch('/.netlify/functions/stammdaten-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'import', records }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import fehlgeschlagen');

      setImportResult(data);
      setImportStep('done');
    } catch (err) {
      setError(`Import fehlgeschlagen: ${err.message}`);
      setImportStep('review');
    }
  }, [buildImportRecords]);

  /** Reset import flow */
  const resetImport = useCallback(() => {
    setImportStep(null);
    setValidationResult(null);
    setImportResult(null);
    setImportProgress(null);
    setApprovedNonCritical(false);
    setApprovedCriticalIds(new Set());
  }, []);

  // ── Akquise-Freigabe state ──
  const [freigabeStep, setFreigabeStep] = useState(null); // null | 'confirm' | 'running' | 'done'
  const [freigabeResult, setFreigabeResult] = useState(null);

  /** Records eligible for Akquise-Freigabe: non-chain + top 5 city + not already freigegeben */
  const freigabeEligible = useMemo(() => {
    if (!airtableData) return [];
    const eligible = [];
    for (const [id, rec] of airtableData) {
      // Skip if already freigegeben
      if (rec.zur_akquise_freigegeben) continue;
      // Non-chain only (empty jet_chain)
      if (rec.jet_chain && rec.jet_chain.trim() !== '') continue;
      // Top 5 city check
      const cityNorm = (rec.city || '').toLowerCase().trim();
      if (!TOP5_CITIES.some(c => cityNorm.includes(c))) continue;
      // Must have airtable_id
      if (!rec.airtable_id) continue;
      eligible.push(rec);
    }
    return eligible;
  }, [airtableData]);

  /** Run Akquise-Freigabe with double-verify */
  const runAkquiseFreigabe = useCallback(async () => {
    if (freigabeEligible.length === 0) return;

    setFreigabeStep('running');
    setFreigabeResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Nicht eingeloggt. Bitte zuerst anmelden.');
        setFreigabeStep('confirm');
        return;
      }

      const records = freigabeEligible.map(r => ({
        airtable_id: r.airtable_id,
        jet_id: r.id,
      }));

      const res = await fetch('/.netlify/functions/stammdaten-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'akquise-freigabe', records }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Freigabe fehlgeschlagen');

      setFreigabeResult(data);
      setFreigabeStep('done');
    } catch (err) {
      setError(`Akquise-Freigabe fehlgeschlagen: ${err.message}`);
      setFreigabeStep('confirm');
    }
  }, [freigabeEligible]);

  /** Count of importable records */
  const importableCount = useMemo(() => {
    if (!comparison) return { updates: 0, creates: 0, total: 0, hasApproval: false };
    const records = buildImportRecords();
    const updates = records.filter(r => r.mode === 'update').length;
    const creates = records.filter(r => r.mode === 'create').length;
    const hasApproval = approvedNonCritical || approvedCriticalIds.size > 0;
    return { updates, creates, total: updates + creates, hasApproval };
  }, [comparison, buildImportRecords, approvedNonCritical, approvedCriticalIds]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Stammdaten Import / Abgleich</h2>
          <p className="text-xs text-text-muted mt-0.5">JET Restaurant-Export mit Airtable Stammdaten abgleichen</p>
        </div>
      </div>

      {/* Upload + Airtable Load */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CSV Upload */}
        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Upload size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">1. JET Export CSV hochladen</h3>
          </div>
          <label className="flex flex-col items-center gap-2 border-2 border-dashed border-border-primary rounded-xl p-6 cursor-pointer hover:border-blue-400 hover:bg-accent-light/30 transition-all">
            <FileText size={24} className="text-text-muted" />
            <span className="text-sm text-text-muted">
              {fileName ? fileName : 'CSV-Datei auswaehlen...'}
            </span>
            {csvData && <span className="text-xs text-emerald-600 font-medium">{csvData.length} Eintraege geladen</span>}
            <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Supabase Load */}
        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database size={16} className="text-status-warning" />
            <h3 className="text-sm font-semibold text-text-primary">2. Stammdaten laden</h3>
            <span className="text-[10px] text-text-muted ml-auto">via Supabase (Airtable-Sync alle 5 Min)</span>
          </div>
          <button
            onClick={fetchStammdaten}
            disabled={loadingAirtable}
            className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-border-primary rounded-xl p-6 cursor-pointer hover:border-orange-400 hover:bg-status-warning/10/30 transition-all disabled:opacity-50"
          >
            {loadingAirtable ? (
              <Loader2 size={24} className="text-status-warning animate-spin" />
            ) : (
              <Database size={24} className="text-text-muted" />
            )}
            <span className="text-sm text-text-muted">
              {loadingAirtable ? 'Lade Stammdaten...' : airtableData ? `${airtableData.size} Stammdaten geladen` : 'Klicken zum Laden'}
            </span>
            {airtableData && <span className="text-xs text-emerald-600 font-medium">Bereit zum Abgleich</span>}
            {syncInfo && (
              <span className={`text-[10px] flex items-center gap-1 ${syncInfo.fresh ? 'text-emerald-600' : 'text-status-warning'}`}>
                <Clock size={10} />
                Letzter Sync: vor {syncInfo.minAgo} Min {!syncInfo.fresh && '(moeglicherweise veraltet)'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Field Overview — shows all columns after loading */}
      {syncInfo?.allColumns && (
        <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
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
        <div className="bg-status-offline/10 border border-status-offline/20 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Run comparison button */}
      {csvData && airtableData && !comparison && (
        <div className="text-center text-sm text-text-muted">Abgleich wird berechnet...</div>
      )}

      {/* Results */}
      {comparison && (
        <>
          {/* CSV-detected fields info */}
          {csvFields.size > 0 && (
            <div className="bg-accent-light/60 border border-accent/20/40 rounded-xl px-4 py-2 flex items-center gap-2 text-xs text-blue-700">
              <Eye size={12} />
              <span>Vergleiche {csvFields.size} Felder aus CSV: {[...csvFields].map(f => FIELD_LABELS[f] || f).join(', ')}</span>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <button onClick={() => setActiveTab('summary')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'summary' ? 'bg-gray-900 text-white' : 'bg-surface-primary border border-border-secondary'}`}>
              <p className="text-[11px] font-medium opacity-70">Gesamt CSV</p>
              <p className="text-2xl font-bold">{csvData.length}</p>
            </button>
            <button onClick={() => setActiveTab('unchanged')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'unchanged' ? 'bg-emerald-600 text-white' : 'bg-emerald-50/80 border border-emerald-200/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Unveraendert</p>
              <p className={`text-2xl font-bold ${activeTab === 'unchanged' ? '' : 'text-emerald-700'}`}>{comparison.unchanged.length}</p>
            </button>
            <button onClick={() => setActiveTab('noncritical')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'noncritical' ? 'bg-amber-600 text-white' : 'bg-status-warning/10/80 border border-status-warning/20/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Unkritisch</p>
              <p className={`text-2xl font-bold ${activeTab === 'noncritical' ? '' : 'text-amber-700'}`}>{comparison.onlyNonCritical.length}</p>
              <p className="text-[9px] opacity-60">Tel, Email, Geo...</p>
            </button>
            <button onClick={() => setActiveTab('critical')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'critical' ? 'bg-status-offline text-white' : 'bg-status-offline/10/80 border border-status-offline/20/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Kritisch</p>
              <p className={`text-2xl font-bold ${activeTab === 'critical' ? '' : 'text-red-700'}`}>{comparison.withCritical.length}</p>
              <p className="text-[9px] opacity-60">Name, Firma, Chain</p>
            </button>
            <button onClick={() => setActiveTab('new')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'new' ? 'bg-accent text-white' : 'bg-accent-light/80 border border-accent/20/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Neu (nur CSV)</p>
              <p className={`text-2xl font-bold ${activeTab === 'new' ? '' : 'text-blue-700'}`}>{comparison.newEntries.length}</p>
              {comparison.newWithConflicts.length > 0 && (
                <p className="text-[9px] opacity-60">{comparison.newWithConflicts.length} mit Konflikten</p>
              )}
            </button>
            <button onClick={() => setActiveTab('missing')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'missing' ? 'bg-gray-700 text-white' : 'bg-surface-secondary/80 border border-border-secondary/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Nur in DB</p>
              <p className={`text-2xl font-bold ${activeTab === 'missing' ? '' : 'text-text-primary'}`}>{comparison.missing.length}</p>
              <p className="text-[9px] opacity-60">Ohne Aenderungen</p>
            </button>
            <button onClick={() => setActiveTab('conflicts')} className={`rounded-xl px-4 py-3 text-left transition-colors ${activeTab === 'conflicts' ? 'bg-brand-purple text-white' : 'bg-brand-purple/10/80 border border-brand-purple/20/60'}`}>
              <p className="text-[11px] font-medium opacity-70">Adress-Konflikte</p>
              <p className={`text-2xl font-bold ${activeTab === 'conflicts' ? '' : 'text-purple-700'}`}>{comparison.addrConflicts.length}</p>
            </button>
          </div>

          {/* Search + Export */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Name, ID, Stadt, Strasse..."
                className="w-full pl-10 pr-4 py-2 bg-surface-primary border border-border-secondary rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/30 text-sm"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={exportDiff} className="flex items-center gap-1.5 px-3 py-2 bg-surface-secondary hover:bg-surface-tertiary rounded-xl text-xs font-medium text-text-primary transition-colors">
              <Download size={14} /> Diff exportieren
            </button>
          </div>

          {/* Tab Content */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl overflow-hidden">
            {/* Summary */}
            {activeTab === 'summary' && (
              <div className="p-5 space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">Zusammenfassung</h3>
                <div className="text-sm text-text-secondary space-y-1.5">
                  <p><Badge color="gray">{csvData.length}</Badge> Eintraege im JET-Export</p>
                  <p><Badge color="gray">{airtableData.size}</Badge> Eintraege in Supabase (Airtable-Sync)</p>
                  <p><Badge color="green">{comparison.unchanged.length}</Badge> unveraendert (ID match, alle Felder identisch)</p>
                  <p><Badge color="amber">{comparison.onlyNonCritical.length}</Badge> unkritische Aenderungen (Tel, Email, Kontakt, Geo — gesammelt freigeben)</p>
                  <p><Badge color="red">{comparison.withCritical.length}</Badge> kritische Aenderungen (Name, Firma, Chain — einzeln pruefen)</p>
                  <p><Badge color="blue">{comparison.newEntries.length}</Badge> neue Standorte (ID nur im CSV)</p>
                  <p><Badge color="gray">{comparison.missing.length}</Badge> in DB ohne Aenderungen (ID nur in Airtable, nicht im CSV)</p>
                  <p><Badge color="purple">{comparison.addrConflicts.length}</Badge> Adress-Konflikte (gleiche Anschrift, andere ID)</p>
                </div>
                {comparison.withChanges.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border-secondary">
                    <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">Haeufigste Aenderungen</h4>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const counts = {};
                        comparison.withChanges.forEach(m => m.changes.forEach(c => { counts[c.label] = (counts[c.label] || 0) + 1; }));
                        return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                          <span key={label} className="text-xs bg-status-warning/10 text-amber-700 px-2 py-1 rounded-lg font-mono">
                            {label}: {count}x
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Non-critical changes — bulk approvable */}
            {activeTab === 'noncritical' && (
              <div>
                {/* Bulk approve header */}
                <div className="px-4 py-3 bg-status-warning/10/80 border-b border-status-warning/20/40 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      {comparison.onlyNonCritical.length} Standorte mit unkritischen Aenderungen
                    </p>
                    <p className="text-[10px] text-status-warning">
                      Telefon, E-Mail, Kontakt, Geo, Oeffnungszeiten, Website — gesammelt freigeben
                    </p>
                  </div>
                  <button
                    onClick={() => setApprovedNonCritical(!approvedNonCritical)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      approvedNonCritical
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-amber-600 text-white hover:bg-amber-700'
                    }`}
                  >
                    {approvedNonCritical ? (
                      <><CheckCircle2 size={14} /> Freigegeben</>
                    ) : (
                      <><Shield size={14} /> Alle {comparison.onlyNonCritical.length} unkritischen freigeben</>
                    )}
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {comparison.onlyNonCritical.length === 0 ? (
                    <div className="p-8 text-center text-sm text-text-muted">Keine unkritischen Aenderungen</div>
                  ) : comparison.onlyNonCritical.slice(0, 200).map(m => (
                    <div key={m.id} className="hover:bg-surface-secondary/50 transition-colors">
                      <button
                        onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left"
                      >
                        <Badge color="amber">{m.changes.length}</Badge>
                        <span className="text-xs font-mono text-text-muted w-20 flex-shrink-0">{m.id}</span>
                        <span className="text-sm font-medium text-text-primary flex-1 truncate">{m.csv.name}</span>
                        <span className="text-xs text-text-muted">{m.csv.city}</span>
                        {approvedNonCritical && <CheckCircle2 size={14} className="text-emerald-500" />}
                        <ChevronDown size={14} className={`text-text-muted transition-transform ${expandedId === m.id ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedId === m.id && (
                        <div className="px-4 pb-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-text-muted uppercase">
                                <th className="text-left py-1 px-2 font-medium">Feld</th>
                                <th className="text-left py-1 px-2 font-medium">JET Export (neu)</th>
                                <th className="text-left py-1 px-2 font-medium">Airtable (aktuell)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.changes.map(c => (
                                <tr key={c.field} className="border-t border-border-secondary">
                                  <td className="py-1.5 px-2 font-medium text-text-primary">{c.label}</td>
                                  <td className="py-1.5 px-2 text-blue-700 bg-accent-light/50 font-mono">{c.csvVal || <span className="text-text-muted italic">leer</span>}</td>
                                  <td className="py-1.5 px-2 text-text-muted font-mono">{c.atVal || <span className="text-text-muted italic">leer</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  {comparison.onlyNonCritical.length > 200 && (
                    <div className="p-3 text-center text-xs text-text-muted">... und {comparison.onlyNonCritical.length - 200} weitere</div>
                  )}
                </div>
              </div>
            )}

            {/* Critical changes — individual approval */}
            {activeTab === 'critical' && (
              <div>
                <div className="px-4 py-3 bg-status-offline/10/80 border-b border-status-offline/20/40">
                  <p className="text-sm font-semibold text-red-800">
                    {comparison.withCritical.length} Standorte mit kritischen Aenderungen
                  </p>
                  <p className="text-[10px] text-status-offline">
                    Name, Firma/Entity, JET Chain — einzeln pruefen und freigeben
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {comparison.withCritical.length === 0 ? (
                    <div className="p-8 text-center text-sm text-text-muted">Keine kritischen Aenderungen</div>
                  ) : comparison.withCritical.map(m => (
                    <div key={m.id} className="hover:bg-surface-secondary/50 transition-colors">
                      <button
                        onClick={() => setExpandedId(expandedId === `crit-${m.id}` ? null : `crit-${m.id}`)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left"
                      >
                        <Badge color="red">{m.criticalChanges.length}</Badge>
                        {m.nonCriticalChanges.length > 0 && <Badge color="amber">+{m.nonCriticalChanges.length}</Badge>}
                        <span className="text-xs font-mono text-text-muted w-20 flex-shrink-0">{m.id}</span>
                        <span className="text-sm font-medium text-text-primary flex-1 truncate">{m.csv.name}</span>
                        <span className="text-xs text-text-muted">{m.csv.city}</span>
                        <ChevronDown size={14} className={`text-text-muted transition-transform ${expandedId === `crit-${m.id}` ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedId === `crit-${m.id}` && (
                        <div className="px-4 pb-3 space-y-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-text-muted uppercase">
                                <th className="text-left py-1 px-2 font-medium w-8"></th>
                                <th className="text-left py-1 px-2 font-medium">Feld</th>
                                <th className="text-left py-1 px-2 font-medium">JET Export (neu)</th>
                                <th className="text-left py-1 px-2 font-medium">Airtable (aktuell)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.criticalChanges.map(c => {
                                const approvalKey = `${m.id}:${c.field}`;
                                const isApproved = approvedCriticalIds.has(approvalKey);
                                return (
                                  <tr key={c.field} className="border-t border-red-100 bg-status-offline/10/30">
                                    <td className="py-1.5 px-2">
                                      <button
                                        onClick={() => {
                                          const next = new Set(approvedCriticalIds);
                                          if (isApproved) next.delete(approvalKey);
                                          else next.add(approvalKey);
                                          setApprovedCriticalIds(next);
                                        }}
                                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                          isApproved ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-red-300 hover:border-status-offline'
                                        }`}
                                      >
                                        {isApproved && <CheckCircle2 size={12} />}
                                      </button>
                                    </td>
                                    <td className="py-1.5 px-2 font-semibold text-red-700">{c.label}</td>
                                    <td className="py-1.5 px-2 text-blue-700 bg-accent-light/50 font-mono">{c.csvVal || <span className="text-text-muted italic">leer</span>}</td>
                                    <td className="py-1.5 px-2 text-text-muted font-mono">{c.atVal || <span className="text-text-muted italic">leer</span>}</td>
                                  </tr>
                                );
                              })}
                              {m.nonCriticalChanges.map(c => (
                                <tr key={c.field} className="border-t border-border-secondary">
                                  <td className="py-1.5 px-2">
                                    {approvedNonCritical ? <CheckCircle2 size={12} className="text-emerald-500" /> : <span className="text-[10px] text-text-muted">auto</span>}
                                  </td>
                                  <td className="py-1.5 px-2 font-medium text-text-primary">{c.label}</td>
                                  <td className="py-1.5 px-2 text-blue-700 bg-accent-light/50 font-mono">{c.csvVal || <span className="text-text-muted italic">leer</span>}</td>
                                  <td className="py-1.5 px-2 text-text-muted font-mono">{c.atVal || <span className="text-text-muted italic">leer</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New entries */}
            {activeTab === 'new' && (
              <div>
                {filteredResults.newEntries.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-muted">Keine neuen Eintraege</div>
                ) : (
                  <>
                    {/* New entries WITH potential conflicts */}
                    {comparison.newWithConflicts.length > 0 && (
                      <div>
                        <div className="px-4 py-3 bg-status-warning/10/80 border-b border-status-warning/20/40">
                          <p className="text-sm font-semibold text-amber-800">
                            {comparison.newWithConflicts.length} mit moeglichen Konflikten
                          </p>
                          <p className="text-[10px] text-status-warning">
                            Gleiche Adresse, Email oder Inhaber in Airtable gefunden — ID geaendert? Verkauft? Bitte pruefen.
                          </p>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {comparison.newWithConflicts.map(row => (
                            <div key={row.id} className="hover:bg-status-warning/10/30 transition-colors">
                              <button
                                onClick={() => setExpandedId(expandedId === `new-${row.id}` ? null : `new-${row.id}`)}
                                className="w-full px-4 py-3 flex items-center gap-3 text-left"
                              >
                                <AlertTriangle size={14} className="text-status-warning flex-shrink-0" />
                                <span className="text-xs font-mono text-text-muted w-20 flex-shrink-0">{row.id}</span>
                                <span className="text-sm font-medium text-text-primary flex-1 truncate">{row.name}</span>
                                <span className="text-xs text-text-muted">{row.street} {row.street_number}</span>
                                <span className="text-xs text-text-muted">{row.postcode} {row.city}</span>
                                <Badge color="amber">{row._conflictHints.length}</Badge>
                                <ChevronDown size={14} className={`text-text-muted transition-transform ${expandedId === `new-${row.id}` ? 'rotate-180' : ''}`} />
                              </button>
                              {expandedId === `new-${row.id}` && (
                                <div className="px-4 pb-3 space-y-1.5">
                                  {row._conflictHints.map((h, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 bg-status-warning/10 rounded-lg border border-status-warning/20/50">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        h.type === 'address' ? 'bg-brand-purple/10 text-purple-700' :
                                        h.type === 'email' ? 'bg-accent-light text-blue-700' :
                                        'bg-status-warning/10 text-orange-700'
                                      }`}>
                                        {h.type === 'address' ? 'Adresse' : h.type === 'email' ? 'Email' : 'Inhaber'}
                                      </span>
                                      <ArrowRight size={10} className="text-text-muted" />
                                      <span className="font-mono text-text-muted">{h.atId}</span>
                                      <span className="text-text-primary font-medium">{h.atName}</span>
                                      <span className="text-text-muted ml-auto">{h.detail}</span>
                                    </div>
                                  ))}
                                  <p className="text-[10px] text-text-muted pt-1">
                                    Moeglich: JET ID geaendert, Standort verkauft/neuer Vertragspartner, oder tatsaechlich neu.
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Clean new entries (no conflicts) */}
                    {comparison.newClean.length > 0 && (
                      <div>
                        {comparison.newWithConflicts.length > 0 && (
                          <div className="px-4 py-2 bg-emerald-50/80 border-b border-emerald-200/40 border-t border-border-secondary/40">
                            <p className="text-xs font-semibold text-emerald-700">{comparison.newClean.length} ohne Konflikte — bereit zum Anlegen</p>
                          </div>
                        )}
                        <div className="divide-y divide-slate-100">
                          {comparison.newClean.map(row => (
                            <div key={row.id} className="px-4 py-3 flex items-center gap-3 hover:bg-accent-light/30 transition-colors">
                              <Plus size={14} className="text-accent flex-shrink-0" />
                              <span className="text-xs font-mono text-text-muted w-20 flex-shrink-0">{row.id}</span>
                              <span className="text-sm font-medium text-text-primary flex-1 truncate">{row.name}</span>
                              <span className="text-xs text-text-muted">{row.street} {row.street_number}</span>
                              <span className="text-xs text-text-muted">{row.postcode} {row.city}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Missing from CSV */}
            {activeTab === 'missing' && (
              <div className="divide-y divide-slate-100">
                {filteredResults.missing.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-muted">Alle Airtable-Eintraege sind im CSV vorhanden</div>
                ) : filteredResults.missing.map(rec => (
                  <div key={rec.id} className="px-4 py-3 flex items-center gap-3 hover:bg-status-offline/10/30 transition-colors">
                    <Minus size={14} className="text-status-offline flex-shrink-0" />
                    <span className="text-xs font-mono text-text-muted w-20 flex-shrink-0">{rec.id}</span>
                    <span className="text-sm font-medium text-text-primary flex-1 truncate">{rec.name}</span>
                    <span className="text-xs text-text-muted">{rec.street} {rec.street_number}</span>
                    <span className="text-xs text-text-muted">{rec.postcode} {rec.city}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Unchanged */}
            {activeTab === 'unchanged' && (
              <div className="divide-y divide-slate-100">
                {comparison.unchanged.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-muted">Keine unveraenderten Eintraege</div>
                ) : comparison.unchanged.slice(0, 100).map(m => (
                  <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                    <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                    <span className="text-xs font-mono text-text-muted w-20 flex-shrink-0">{m.id}</span>
                    <span className="text-sm text-text-primary flex-1 truncate">{m.csv.name}</span>
                    <span className="text-xs text-text-muted">{m.csv.city}</span>
                  </div>
                ))}
                {comparison.unchanged.length > 100 && (
                  <div className="p-3 text-center text-xs text-text-muted">... und {comparison.unchanged.length - 100} weitere</div>
                )}
              </div>
            )}

            {/* Address Conflicts */}
            {activeTab === 'conflicts' && (
              <div className="divide-y divide-slate-100">
                {filteredResults.addrConflicts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-text-muted">Keine Adress-Konflikte gefunden</div>
                ) : filteredResults.addrConflicts.map((c, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-brand-purple/10/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <MapPin size={14} className="text-brand-purple" />
                      <span className="text-xs font-medium text-text-muted">{c.address}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Badge color="blue">CSV</Badge>
                        <span className="font-mono text-text-muted">{c.csvId}</span>
                        <span className="text-text-primary">{c.csvName}</span>
                      </div>
                      <ArrowRight size={12} className="text-text-muted" />
                      <div className="flex items-center gap-1.5">
                        <Badge color="amber">Airtable</Badge>
                        <span className="font-mono text-text-muted">{c.airtableId}</span>
                        <span className="text-text-primary">{c.airtableName}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Akquise-Freigabe Panel ── */}
          {airtableData && freigabeEligible.length > 0 && (
            <div className="bg-surface-primary border border-status-warning/20/60 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-status-warning" />
                  <h3 className="text-sm font-semibold text-text-primary">Akquise-Freigabe: Non-Chain + Top-5-Grossstaedte</h3>
                </div>
                {freigabeStep && freigabeStep !== 'done' && (
                  <button onClick={() => { setFreigabeStep(null); setFreigabeResult(null); }} className="text-xs text-text-muted hover:text-text-primary">Abbrechen</button>
                )}
              </div>

              {/* Pre-confirm: show eligible records */}
              {!freigabeStep && (
                <div className="space-y-3">
                  <div className="bg-status-warning/10/80 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-orange-800">{freigabeEligible.length} Standorte bereit zur Freigabe</p>
                      <div className="flex gap-1">
                        <Badge color="green">Non-Chain</Badge>
                        <Badge color="blue">Top 5 City</Badge>
                      </div>
                    </div>
                    <p className="text-[10px] text-status-warning">
                      Filter: Kein JET Chain + Stadt in Berlin/Hamburg/Muenchen/Koeln/Frankfurt + noch nicht freigegeben
                    </p>
                  </div>

                  {/* Preview list (max 20) */}
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-border-secondary">
                    {freigabeEligible.slice(0, 20).map(rec => (
                      <div key={rec.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                        <span className="font-mono text-text-muted w-16 flex-shrink-0">{rec.id}</span>
                        <span className="font-medium text-text-primary flex-1 truncate">{rec.name}</span>
                        <span className="text-text-muted">{rec.city}</span>
                        <span className="text-text-muted">{rec.street} {rec.street_number}</span>
                      </div>
                    ))}
                    {freigabeEligible.length > 20 && (
                      <div className="px-3 py-2 text-center text-[10px] text-text-muted">
                        ... und {freigabeEligible.length - 20} weitere
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setFreigabeStep('confirm')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Shield size={16} /> {freigabeEligible.length} Standorte zur Akquise freigeben
                  </button>
                </div>
              )}

              {/* Confirm step (double verify) */}
              {freigabeStep === 'confirm' && (
                <div className="bg-status-offline/10 border border-status-offline/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-status-offline mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Double-Verify Bestaetigung</p>
                      <p className="text-xs text-red-700 mt-1">
                        {freigabeEligible.length} Standorte werden in Airtable als "Zur Akquise freigegeben" markiert.
                        Jeder Record wird vor dem Schreiben nochmal gegen Airtable geprueft (Double-Verify):
                      </p>
                      <ul className="text-[10px] text-status-offline mt-1.5 space-y-0.5 list-disc list-inside">
                        <li>Nicht bereits freigegeben?</li>
                        <li>Wirklich kein Chain?</li>
                        <li>Record existiert in Airtable?</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={runAkquiseFreigabe}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-status-offline hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      <Zap size={14} /> Ja, {freigabeEligible.length} freigeben (Double-Verify)
                    </button>
                    <button
                      onClick={() => setFreigabeStep(null)}
                      className="px-4 py-2.5 bg-surface-secondary hover:bg-surface-tertiary rounded-lg text-sm font-medium text-text-primary transition-colors"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {/* Running */}
              {freigabeStep === 'running' && (
                <div className="flex items-center justify-center gap-3 py-6">
                  <Loader2 size={20} className="text-status-warning animate-spin" />
                  <span className="text-sm text-text-secondary">
                    Double-Verify + Freigabe fuer {freigabeEligible.length} Records...
                  </span>
                </div>
              )}

              {/* Done */}
              {freigabeStep === 'done' && freigabeResult && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800">Akquise-Freigabe abgeschlossen</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-surface-primary rounded-lg px-3 py-2 text-center">
                        <p className="font-bold text-emerald-700">{freigabeResult.summary.success}</p>
                        <p className="text-emerald-600">Freigegeben</p>
                      </div>
                      <div className={`bg-surface-primary rounded-lg px-3 py-2 text-center ${freigabeResult.summary.failed > 0 ? 'border border-status-offline/20' : ''}`}>
                        <p className={`font-bold ${freigabeResult.summary.failed > 0 ? 'text-red-700' : 'text-text-muted'}`}>{freigabeResult.summary.failed}</p>
                        <p className="text-text-secondary">Fehlgeschlagen</p>
                      </div>
                      <div className="bg-surface-primary rounded-lg px-3 py-2 text-center">
                        <p className="font-bold text-amber-700">{freigabeResult.summary.skipped}</p>
                        <p className="text-text-secondary">Double-Verify Skipped</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-2">
                      Von: {freigabeResult.user}
                    </p>
                  </div>

                  {/* Skipped details */}
                  {freigabeResult.skipped?.length > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      <p className="text-xs font-semibold text-amber-700">Double-Verify uebersprungen:</p>
                      {freigabeResult.skipped.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-status-warning/10 rounded-lg">
                          <AlertTriangle size={12} className="text-status-warning" />
                          <span className="font-mono text-text-secondary">{s.jet_id}</span>
                          <span className="text-amber-700">{s.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => { setFreigabeStep(null); setFreigabeResult(null); }}
                    className="w-full px-4 py-2 bg-surface-secondary hover:bg-surface-tertiary rounded-xl text-sm font-medium text-text-primary transition-colors"
                  >
                    Fertig
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Show count when no eligible records */}
          {airtableData && freigabeEligible.length === 0 && !comparison && (
            <div className="bg-surface-secondary/60 border border-border-secondary rounded-2xl p-4 text-center">
              <p className="text-xs text-text-muted">Keine Standorte fuer Akquise-Freigabe gefunden (Non-Chain + Top-5-Stadt + noch nicht freigegeben)</p>
            </div>
          )}

          {/* Approval hint when nothing approved yet */}
          {comparison && comparison.withChanges.length > 0 && !importableCount.hasApproval && !importStep && (
            <div className="bg-status-warning/10/80 border border-status-warning/20/60 rounded-2xl p-4 flex items-start gap-3">
              <Shield size={16} className="text-status-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Aenderungen muessen freigegeben werden</p>
                <p className="text-xs text-amber-700 mt-1">
                  Oeffne den Tab <strong>Unkritisch</strong> fuer Bulk-Freigabe (Tel, Email, Geo etc.) oder <strong>Kritisch</strong> fuer Einzelpruefung (Name, Firma, Chain).
                  Erst nach Freigabe kann der Import gestartet werden.
                </p>
              </div>
            </div>
          )}

          {/* ── Import Panel ── */}
          {importableCount.total > 0 && (
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-status-warning" />
                  <h3 className="text-sm font-semibold text-text-primary">3. Aenderungen nach Airtable schreiben</h3>
                </div>
                {importStep && importStep !== 'done' && (
                  <button onClick={resetImport} className="text-xs text-text-muted hover:text-text-primary">Abbrechen</button>
                )}
              </div>

              {/* Pre-import summary */}
              {!importStep && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-status-warning/10/80 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-status-warning font-medium uppercase">Updates</p>
                      <p className="text-lg font-bold text-amber-700">{importableCount.updates}</p>
                      <p className="text-[10px] text-status-warning">Bestehende Records aktualisieren</p>
                    </div>
                    <div className="bg-accent-light/80 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-accent font-medium uppercase">Neue Records</p>
                      <p className="text-lg font-bold text-blue-700">{importableCount.creates}</p>
                      <p className="text-[10px] text-accent">Neu in Airtable anlegen</p>
                    </div>
                    <div className="bg-surface-secondary/80 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-text-secondary font-medium uppercase">Gesamt</p>
                      <p className="text-lg font-bold text-text-primary">{importableCount.total}</p>
                      <p className="text-[10px] text-text-muted">Batches: ~{Math.ceil(importableCount.total / 10)}</p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {comparison.addrConflicts.length > 0 && (
                    <div className="bg-brand-purple/10 border border-brand-purple/20 rounded-xl p-3 flex items-start gap-2">
                      <AlertTriangle size={14} className="text-brand-purple mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-purple-700">
                        <p className="font-semibold">{comparison.addrConflicts.length} Adress-Konflikte erkannt</p>
                        <p>Neue Eintraege mit identischer Adresse koennten Duplikate sein. Bitte im Tab "Adress-Konflikte" pruefen.</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={runValidation}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Shield size={16} /> Validierung starten
                  </button>
                </div>
              )}

              {/* Validating spinner */}
              {importStep === 'validating' && (
                <div className="flex items-center justify-center gap-3 py-6">
                  <Loader2 size={20} className="text-status-warning animate-spin" />
                  <span className="text-sm text-text-secondary">Validiere {importableCount.total} Records...</span>
                </div>
              )}

              {/* Validation review */}
              {importStep === 'review' && validationResult && (
                <div className="space-y-3">
                  {/* Validation summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50/80 rounded-xl px-3 py-2 text-center">
                      <p className="text-lg font-bold text-emerald-700">{validationResult.summary.valid}</p>
                      <p className="text-[10px] text-emerald-600">Gueltig</p>
                    </div>
                    <div className={`rounded-xl px-3 py-2 text-center ${validationResult.summary.invalid > 0 ? 'bg-status-offline/10/80' : 'bg-surface-secondary/80'}`}>
                      <p className={`text-lg font-bold ${validationResult.summary.invalid > 0 ? 'text-red-700' : 'text-text-muted'}`}>{validationResult.summary.invalid}</p>
                      <p className={`text-[10px] ${validationResult.summary.invalid > 0 ? 'text-status-offline' : 'text-text-muted'}`}>Ungueltig (werden uebersprungen)</p>
                    </div>
                    <div className={`rounded-xl px-3 py-2 text-center ${validationResult.summary.withWarnings > 0 ? 'bg-status-warning/10/80' : 'bg-surface-secondary/80'}`}>
                      <p className={`text-lg font-bold ${validationResult.summary.withWarnings > 0 ? 'text-amber-700' : 'text-text-muted'}`}>{validationResult.summary.withWarnings}</p>
                      <p className={`text-[10px] ${validationResult.summary.withWarnings > 0 ? 'text-status-warning' : 'text-text-muted'}`}>Mit Warnungen</p>
                    </div>
                  </div>

                  {/* Show errors/warnings if any */}
                  {validationResult.results.filter(r => !r.valid || r.warnings.length > 0).length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {validationResult.results.filter(r => !r.valid || r.warnings.length > 0).map(r => (
                        <div key={r.index} className="flex items-start gap-2 text-xs px-3 py-1.5 rounded-lg bg-surface-secondary">
                          {!r.valid ? <XCircle size={12} className="text-status-offline mt-0.5 flex-shrink-0" /> : <AlertTriangle size={12} className="text-status-warning mt-0.5 flex-shrink-0" />}
                          <div>
                            <span className="font-mono text-text-muted">{r.jet_id}</span>
                            {r.errors.map((e, i) => <span key={i} className="text-status-offline ml-2">{e}</span>)}
                            {r.warnings.map((w, i) => <span key={i} className="text-status-warning ml-2">{w}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Import button */}
                  {validationResult.summary.valid > 0 && (
                    <div className="bg-status-offline/10 border border-status-offline/20 rounded-xl p-3">
                      <p className="text-xs text-red-700 font-semibold mb-2">
                        Achtung: {validationResult.summary.valid} Records werden direkt in Airtable geschrieben!
                      </p>
                      <p className="text-[10px] text-status-offline mb-3">
                        Dieser Vorgang kann nicht rueckgaengig gemacht werden. Supabase wird beim naechsten Sync (alle 5 Min) aktualisiert.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={runImport}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-status-offline hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          <Zap size={14} /> {validationResult.summary.valid} Records importieren
                        </button>
                        <button
                          onClick={resetImport}
                          className="px-4 py-2.5 bg-surface-secondary hover:bg-surface-tertiary rounded-lg text-sm font-medium text-text-primary transition-colors"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Importing progress */}
              {importStep === 'importing' && (
                <div className="py-6 space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 size={20} className="text-status-warning animate-spin" />
                    <span className="text-sm text-text-secondary">Importiere nach Airtable...</span>
                  </div>
                  {importProgress && (
                    <div>
                      <div className="w-full bg-surface-tertiary rounded-full h-2">
                        <div className="bg-status-warning h-2 rounded-full transition-all animate-pulse" style={{ width: '50%' }} />
                      </div>
                      <p className="text-[10px] text-text-muted text-center mt-1">
                        ~{importProgress.batches} Batches a 10 Records ({importProgress.total} gesamt)
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Import done */}
              {importStep === 'done' && importResult && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800">Import abgeschlossen</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-surface-primary rounded-lg px-3 py-2 text-center">
                        <p className="font-bold text-emerald-700">{importResult.summary.updates.success}</p>
                        <p className="text-emerald-600">Updates OK</p>
                      </div>
                      <div className="bg-surface-primary rounded-lg px-3 py-2 text-center">
                        <p className="font-bold text-emerald-700">{importResult.summary.creates.success}</p>
                        <p className="text-emerald-600">Neu angelegt</p>
                      </div>
                      <div className={`bg-surface-primary rounded-lg px-3 py-2 text-center ${(importResult.summary.updates.failed + importResult.summary.creates.failed) > 0 ? 'border border-status-offline/20' : ''}`}>
                        <p className={`font-bold ${(importResult.summary.updates.failed + importResult.summary.creates.failed) > 0 ? 'text-red-700' : 'text-text-muted'}`}>
                          {importResult.summary.updates.failed + importResult.summary.creates.failed}
                        </p>
                        <p className="text-text-secondary">Fehlgeschlagen</p>
                      </div>
                      <div className="bg-surface-primary rounded-lg px-3 py-2 text-center">
                        <p className="font-bold text-text-muted">{importResult.summary.skipped}</p>
                        <p className="text-text-secondary">Uebersprungen</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-600 mt-2">
                      Ausgefuehrt von: {importResult.user} — Supabase wird beim naechsten Sync aktualisiert.
                    </p>
                  </div>

                  {/* Show failed records if any */}
                  {[...(importResult.updateResults || []), ...(importResult.createResults || [])].filter(r => !r.ok).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-700">Fehlgeschlagene Records:</p>
                      {[...(importResult.updateResults || []), ...(importResult.createResults || [])].filter(r => !r.ok).map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 bg-status-offline/10 rounded-lg">
                          <XCircle size={12} className="text-status-offline" />
                          <span className="font-mono text-text-secondary">{r.jet_id}</span>
                          <span className="text-status-offline">{r.error}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={resetImport}
                    className="w-full px-4 py-2 bg-surface-secondary hover:bg-surface-tertiary rounded-xl text-sm font-medium text-text-primary transition-colors"
                  >
                    Fertig
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
