import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Package, QrCode, MapPin, Plus, Search, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  Truck, Warehouse, Send, Building2, RotateCcw, Wrench, Trash2,
  Printer, Download, Filter, X, Cpu, Monitor, CardSim, Grip,
  ArrowRight, Clock, Hash, Calendar, Upload, FileText, Link2,
  Check, Eye,
} from 'lucide-react';
import { supabase } from '../utils/authService';
import QRCodeLib from 'qrcode';

// ─── Constants ───
const POSITIONS = {
  zulieferung:  { label: 'Zulieferung',  icon: Truck,      color: '#8b5cf6' },
  lager:        { label: 'Lager',        icon: Warehouse,  color: '#3b82f6' },
  versand:      { label: 'Versand',      icon: Send,       color: '#f59e0b' },
  standort:     { label: 'Am Standort',  icon: Building2,  color: '#22c55e' },
  ruecksendung: { label: 'Rücksendung', icon: RotateCcw,  color: '#ef4444' },
  reparatur:    { label: 'Reparatur',    icon: Wrench,     color: '#f97316' },
  entsorgung:   { label: 'Entsorgung',   icon: Trash2,     color: '#64748b' },
};

const COMPONENT_TYPES = {
  ops:     { label: 'OPS Player', icon: Cpu,     color: '#3b82f6' },
  display: { label: 'Display',   icon: Monitor, color: '#8b5cf6' },
  sim:     { label: 'SIM-Karte', icon: CardSim, color: '#22c55e' },
  mount:   { label: 'Halterung', icon: Grip,    color: '#f59e0b' },
};

const CONDITIONS = [
  { value: 'ok', label: 'OK', color: '#22c55e' },
  { value: 'damaged', label: 'Beschädigt', color: '#f59e0b' },
  { value: 'defect', label: 'Defekt', color: '#ef4444' },
  { value: 'incomplete', label: 'Unvollständig', color: '#64748b' },
];

const QR_STATUS = {
  generated:   { bg: '#64748b15', text: '#64748b', label: 'Generiert' },
  assigned:    { bg: '#3b82f615', text: '#3b82f6', label: 'Zugewiesen' },
  printed:     { bg: '#8b5cf615', text: '#8b5cf6', label: 'Gedruckt' },
  active:      { bg: '#22c55e15', text: '#22c55e', label: 'Aktiv' },
  deactivated: { bg: '#ef444415', text: '#ef4444', label: 'Deaktiviert' },
};

// ─── Helpers ───
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect separator
  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

  // Check if first line looks like headers or data
  const hasHeaders = headers.some(h => /^(sn|serial|seriennummer|typ|type|lieferant|supplier)/i.test(h));

  const dataLines = hasHeaders ? lines.slice(1) : lines;
  const rows = dataLines.map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    if (hasHeaders) {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    }
    // Single column = just serial numbers
    return { sn: vals[0] || '' };
  });

  return { headers: hasHeaders ? headers : ['sn'], rows };
}

async function generateQRDataURL(text, size = 120) {
  try {
    return await QRCodeLib.toDataURL(text, {
      width: size,
      margin: 1,
      color: { dark: '#1e293b', light: '#ffffff' },
    });
  } catch {
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════
// Wareneingang Tab (with auto QR + SN Import)
// ═══════════════════════════════════════════════════════════════

function WareneingangTab() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    supplier: '', deliveryNote: '', orderReference: '', carrier: '',
    componentType: 'ops', serialNumber: '', quantity: 1,
    condition: 'ok', conditionNotes: '', receivedBy: '', warehouse: 'Hauptlager',
  });

  // Import state
  const [importData, setImportData] = useState(null);  // { headers, rows }
  const [importMapping, setImportMapping] = useState({ sn: '', type: '', supplier: '' });
  const [importConfig, setImportConfig] = useState({ componentType: 'ops', supplier: '', warehouse: 'Hauptlager' });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const loadReceipts = useCallback(async (signal) => {
    setLoading(true);
    try {
      let query = supabase
        .from('goods_receipts')
        .select('*, hardware_qr_codes!goods_receipts_qr_code_id_fkey(qr_code)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (error) {
        // Fallback without join if FK doesn't exist
        let fallback = supabase.from('goods_receipts').select('*').order('created_at', { ascending: false }).limit(200);
        if (signal) fallback = fallback.abortSignal(signal);
        const { data: d2 } = await fallback;
        if (!signal?.aborted) setReceipts(d2 || []);
      } else {
        setReceipts(data || []);
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[Wareneingang] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadReceipts(controller.signal);
    return () => controller.abort();
  }, [loadReceipts]);

  // ─── Single receipt + auto QR ───
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Generate receipt ID
      const { data: receiptId } = await supabase.rpc('generate_receipt_id');
      const rid = receiptId || `WE-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

      // 2. Generate QR code (auto-assign to SN)
      let qrCodeId = null;
      if (form.serialNumber) {
        const { data: qrCode } = await supabase.rpc('generate_qr_code', { prefix: 'JET-HW' });
        if (qrCode) {
          const { data: qrRow } = await supabase.from('hardware_qr_codes').insert({
            qr_code: qrCode,
            qr_prefix: 'JET-HW',
            batch_id: `WE-${rid}`,
            component_type: form.componentType,
            serial_number: form.serialNumber,
            status: 'assigned',
            assigned_at: new Date().toISOString(),
            assigned_by: 'wareneingang',
          }).select('id').single();
          qrCodeId = qrRow?.id || null;
        }
      }

      // 3. Create receipt
      const { error } = await supabase.from('goods_receipts').insert({
        receipt_id: rid,
        supplier: form.supplier || null,
        delivery_note: form.deliveryNote || null,
        order_reference: form.orderReference || null,
        carrier: form.carrier || null,
        component_type: form.componentType,
        serial_number: form.serialNumber || null,
        quantity: form.quantity,
        condition: form.condition,
        condition_notes: form.conditionNotes || null,
        received_by: form.receivedBy || null,
        warehouse: form.warehouse,
        qr_code_id: qrCodeId,
      });
      if (error) throw error;

      // 4. Auto-create position entry (lager)
      if (form.serialNumber) {
        await supabase.from('hardware_positions').insert({
          component_type: form.componentType,
          hardware_id: rid,
          serial_number: form.serialNumber,
          position: 'lager',
          sub_position: form.warehouse,
          moved_by: form.receivedBy || 'System',
          move_reason: 'receipt',
          reference_id: rid,
          is_current: true,
        });
      }

      setShowForm(false);
      setForm({
        supplier: '', deliveryNote: '', orderReference: '', carrier: '',
        componentType: 'ops', serialNumber: '', quantity: 1,
        condition: 'ok', conditionNotes: '', receivedBy: '', warehouse: 'Hauptlager',
      });
      loadReceipts();
    } catch (e) {
      console.error('[Wareneingang] Save error:', e);
      alert('Fehler beim Speichern: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── SN Import ───
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseCSV(text);
      setImportData(parsed);

      // Auto-detect column mapping
      const hdrs = parsed.headers.map(h => h.toLowerCase());
      setImportMapping({
        sn: hdrs.findIndex(h => /sn|serial|seriennummer|iccid|nummer/i.test(h)),
        type: hdrs.findIndex(h => /typ|type|art|component/i.test(h)),
        supplier: hdrs.findIndex(h => /lieferant|supplier|hersteller|vendor/i.test(h)),
      });
      setImportResult(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const runImport = async () => {
    if (!importData?.rows?.length) return;
    setImporting(true);
    const results = { imported: 0, errors: 0, duplicates: 0, details: [] };

    for (const row of importData.rows) {
      const sn = typeof row === 'string' ? row :
        importMapping.sn >= 0 ? Object.values(row)[importMapping.sn] :
        row.sn || Object.values(row)[0] || '';

      if (!sn || !sn.trim()) { results.errors++; continue; }

      try {
        // Check duplicate
        const { data: existing } = await supabase.from('goods_receipts')
          .select('id').eq('serial_number', sn.trim()).limit(1);
        if (existing?.length > 0) {
          results.duplicates++;
          results.details.push({ sn, status: 'duplikat' });
          continue;
        }

        // Generate IDs
        const { data: receiptId } = await supabase.rpc('generate_receipt_id');
        const rid = receiptId || `WE-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        const { data: qrCode } = await supabase.rpc('generate_qr_code', { prefix: 'JET-HW' });

        // Create QR code
        let qrCodeId = null;
        if (qrCode) {
          const { data: qrRow } = await supabase.from('hardware_qr_codes').insert({
            qr_code: qrCode, qr_prefix: 'JET-HW',
            batch_id: `IMPORT-${new Date().toISOString().slice(0, 10)}`,
            component_type: importConfig.componentType,
            serial_number: sn.trim(),
            status: 'assigned',
            assigned_at: new Date().toISOString(),
            assigned_by: 'import',
          }).select('id').single();
          qrCodeId = qrRow?.id || null;
        }

        // Create receipt
        const supplierVal = importMapping.supplier >= 0
          ? Object.values(row)[importMapping.supplier]
          : importConfig.supplier;

        await supabase.from('goods_receipts').insert({
          receipt_id: rid,
          component_type: importConfig.componentType,
          serial_number: sn.trim(),
          supplier: supplierVal || null,
          warehouse: importConfig.warehouse,
          condition: 'ok',
          quantity: 1,
          qr_code_id: qrCodeId,
        });

        // Create position
        await supabase.from('hardware_positions').insert({
          component_type: importConfig.componentType,
          hardware_id: rid, serial_number: sn.trim(),
          position: 'lager', sub_position: importConfig.warehouse,
          moved_by: 'Import', move_reason: 'receipt',
          reference_id: rid, is_current: true,
        });

        results.imported++;
        results.details.push({ sn, status: 'ok', qr: qrCode });
      } catch (e) {
        results.errors++;
        results.details.push({ sn, status: 'fehler', error: e.message });
      }
    }

    setImportResult(results);
    setImporting(false);
    loadReceipts();
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return receipts;
    const q = searchTerm.toLowerCase();
    return receipts.filter(r =>
      (r.receipt_id || '').toLowerCase().includes(q) ||
      (r.supplier || '').toLowerCase().includes(q) ||
      (r.serial_number || '').toLowerCase().includes(q) ||
      (r.delivery_note || '').toLowerCase().includes(q)
    );
  }, [receipts, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Suche nach WE-ID, Lieferant, SN..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <button onClick={loadReceipts} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500" title="Aktualisieren">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowImport(!showImport); setShowForm(false); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors">
            <Upload size={14} />
            SN-Import
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowImport(false); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors shadow-sm">
            <Plus size={14} />
            Wareneingang
          </button>
        </div>
      </div>

      {/* ─── SN Import Panel ─── */}
      {showImport && (
        <div className="bg-white border border-slate-200/60 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Upload size={16} className="text-blue-500" />
            Seriennummern importieren
          </h3>
          <p className="text-xs text-slate-500">CSV, TSV oder Textdatei mit Seriennummern hochladen. Eine SN pro Zeile oder als Spalte in CSV.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Komponententyp *</label>
              <select value={importConfig.componentType} onChange={e => setImportConfig({...importConfig, componentType: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs">
                {Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Lieferant</label>
              <input type="text" value={importConfig.supplier} onChange={e => setImportConfig({...importConfig, supplier: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs" placeholder="z.B. Philips, JWIPC..." />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Ziellager</label>
              <input type="text" value={importConfig.warehouse} onChange={e => setImportConfig({...importConfig, warehouse: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={handleFileSelect} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 text-xs text-slate-600 hover:text-blue-600 transition-colors">
              <FileText size={14} />
              Datei auswählen
            </button>
            {importData && (
              <span className="text-xs text-green-600 font-medium">
                <Check size={12} className="inline mr-1" />
                {importData.rows.length} Zeilen erkannt
              </span>
            )}
          </div>

          {/* Import Preview */}
          {importData && importData.rows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-slate-600">Vorschau (erste 10 Zeilen):</div>
              <div className="overflow-x-auto max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-1.5 px-3 text-slate-500 font-medium">#</th>
                      {importData.headers.map((h, i) => (
                        <th key={i} className="text-left py-1.5 px-3 text-slate-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importData.rows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1.5 px-3 text-slate-400">{i + 1}</td>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="py-1.5 px-3 font-mono text-slate-700">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={runImport} disabled={importing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors">
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {importing ? `Importiere...` : `${importData.rows.length} Seriennummern importieren`}
                </button>
                <button onClick={() => { setImportData(null); setImportResult(null); }}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">
                  Verwerfen
                </button>
              </div>
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <div className={`rounded-lg p-3 border ${importResult.errors > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                {importResult.errors > 0 ? <AlertTriangle size={14} className="text-amber-600" /> : <CheckCircle2 size={14} className="text-green-600" />}
                Import abgeschlossen
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-green-700"><strong>{importResult.imported}</strong> importiert</span>
                <span className="text-amber-600"><strong>{importResult.duplicates}</strong> Duplikate</span>
                <span className="text-red-600"><strong>{importResult.errors}</strong> Fehler</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Single Receipt Form ─── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200/60 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Package size={16} className="text-blue-500" />
            Neuer Wareneingang
            <span className="text-[10px] text-slate-400 font-normal ml-2">QR-Code wird automatisch generiert</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Lieferant</label>
              <input type="text" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="z.B. Philips, JWIPC, 1NCE..." />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Lieferschein-Nr</label>
              <input type="text" value={form.deliveryNote} onChange={e => setForm({...form, deliveryNote: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Spediteur</label>
              <input type="text" value={form.carrier} onChange={e => setForm({...form, carrier: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="z.B. DHL, UPS..." />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Komponententyp *</label>
              <select value={form.componentType} onChange={e => setForm({...form, componentType: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                {Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                <option value="accessory">Zubehör</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Seriennummer *</label>
              <input type="text" value={form.serialNumber} onChange={e => setForm({...form, serialNumber: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="SN scannen oder eingeben" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Anzahl</label>
              <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value) || 1})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Zustand</label>
              <select value={form.condition} onChange={e => setForm({...form, condition: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Empfangen von</label>
              <input type="text" value={form.receivedBy} onChange={e => setForm({...form, receivedBy: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Ziellager</label>
              <input type="text" value={form.warehouse} onChange={e => setForm({...form, warehouse: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Bestellnummer / PO</label>
              <input type="text" value={form.orderReference} onChange={e => setForm({...form, orderReference: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>

          {form.condition !== 'ok' && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Zustandsbeschreibung</label>
              <textarea value={form.conditionNotes} onChange={e => setForm({...form, conditionNotes: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                rows={2} placeholder="Beschreibung von Schäden etc." />
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Erfassen + QR generieren
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors">
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
          <span className="ml-2 text-xs text-slate-500">Lade Wareneingänge...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          {receipts.length === 0 ? 'Noch keine Wareneingänge erfasst' : 'Keine Treffer für die Suche'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">WE-ID</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Datum</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Typ</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Lieferant</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">SN</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">QR-Code</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Zustand</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Lager</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const typeInfo = COMPONENT_TYPES[r.component_type] || { label: r.component_type, color: '#64748b' };
                const condInfo = CONDITIONS.find(c => c.value === r.condition) || CONDITIONS[0];
                const qrCode = r.hardware_qr_codes?.qr_code || (r.qr_code_id ? `QR #${r.qr_code_id}` : null);
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="py-2 px-3 font-mono text-blue-600">{r.receipt_id}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{new Date(r.receipt_date).toLocaleDateString('de-DE')}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: typeInfo.color + '15', color: typeInfo.color, border: `1px solid ${typeInfo.color}33` }}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-700">{r.supplier || '–'}</td>
                    <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">{r.serial_number || '–'}</td>
                    <td className="py-2 px-3">
                      {qrCode ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-600 border border-blue-200/50 font-mono">
                          <QrCode size={10} />{qrCode}
                        </span>
                      ) : <span className="text-slate-300">–</span>}
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: condInfo.color + '15', color: condInfo.color, border: `1px solid ${condInfo.color}33` }}>
                        {condInfo.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{r.warehouse}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// QR-Code Management Tab (with Print + Assign)
// ═══════════════════════════════════════════════════════════════

function QRCodeTab() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [bulkCount, setBulkCount] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedForPrint, setSelectedForPrint] = useState(new Set());
  const [assignModal, setAssignModal] = useState(null); // { id, qr_code }
  const [assignSN, setAssignSN] = useState('');
  const [assignType, setAssignType] = useState('ops');
  const printFrameRef = useRef(null);

  const loadCodes = useCallback(async (signal) => {
    setLoading(true);
    try {
      let query = supabase
        .from('hardware_qr_codes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setCodes(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[QR] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadCodes(controller.signal);
    return () => controller.abort();
  }, [loadCodes]);

  const generateBulk = async () => {
    setGenerating(true);
    try {
      const { error } = await supabase.rpc('generate_qr_codes_bulk', { count: bulkCount, prefix: 'JET-HW' });
      if (error) throw error;
      loadCodes();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Print Labels ───
  const printLabels = async (codesToPrint) => {
    const labelData = await Promise.all(
      codesToPrint.map(async (c) => ({
        ...c,
        dataUrl: await generateQRDataURL(c.qr_code, 100),
      }))
    );

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) { alert('Popup-Blocker aktiv – bitte erlauben'); return; }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>QR-Labels</title>
    <style>
      @page { size: 62mm 29mm; margin: 0; }
      body { margin: 0; font-family: monospace; }
      .label { width: 62mm; height: 29mm; display: flex; align-items: center; padding: 2mm; box-sizing: border-box; page-break-after: always; border: 0.5px solid #ccc; }
      .label:last-child { page-break-after: auto; }
      .qr { width: 24mm; height: 24mm; flex-shrink: 0; }
      .qr img { width: 100%; height: 100%; }
      .info { margin-left: 2mm; font-size: 7pt; line-height: 1.4; overflow: hidden; }
      .code { font-weight: bold; font-size: 8pt; }
      .sn { color: #333; }
      .type { color: #666; font-size: 6pt; text-transform: uppercase; }
      .date { color: #999; font-size: 6pt; }
      @media screen { .label { margin: 4px; border: 1px solid #ddd; border-radius: 4px; } body { padding: 10px; } }
    </style></head><body>`);

    labelData.forEach(c => {
      const typeLabel = COMPONENT_TYPES[c.component_type]?.label || c.component_type || '';
      printWindow.document.write(`
        <div class="label">
          <div class="qr">${c.dataUrl ? `<img src="${c.dataUrl}" />` : '[QR]'}</div>
          <div class="info">
            <div class="code">${c.qr_code}</div>
            ${c.serial_number ? `<div class="sn">SN: ${c.serial_number}</div>` : ''}
            ${typeLabel ? `<div class="type">${typeLabel}</div>` : ''}
            <div class="date">${new Date(c.created_at).toLocaleDateString('de-DE')}</div>
          </div>
        </div>
      `);
    });

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);

    // Mark as printed
    const ids = codesToPrint.map(c => c.id);
    await supabase.from('hardware_qr_codes')
      .update({ status: 'printed', label_printed: true, label_printed_at: new Date().toISOString() })
      .in('id', ids);
    loadCodes();
    setSelectedForPrint(new Set());
  };

  // ─── Assign QR to SN ───
  const handleAssign = async () => {
    if (!assignModal || !assignSN.trim()) return;
    try {
      await supabase.from('hardware_qr_codes')
        .update({
          serial_number: assignSN.trim(),
          component_type: assignType,
          status: 'assigned',
          assigned_at: new Date().toISOString(),
          assigned_by: 'manuell',
        })
        .eq('id', assignModal.id);
      setAssignModal(null);
      setAssignSN('');
      loadCodes();
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  };

  const togglePrintSelect = (id) => {
    setSelectedForPrint(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let list = codes;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c =>
        (c.qr_code || '').toLowerCase().includes(q) ||
        (c.serial_number || '').toLowerCase().includes(q) ||
        (c.batch_id || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus) list = list.filter(c => c.status === filterStatus);
    return list;
  }, [codes, searchTerm, filterStatus]);

  const kpis = useMemo(() => ({
    total: codes.length,
    generated: codes.filter(c => c.status === 'generated').length,
    assigned: codes.filter(c => c.status === 'assigned').length,
    printed: codes.filter(c => c.status === 'printed').length,
    active: codes.filter(c => c.status === 'active').length,
  }), [codes]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Gesamt', value: kpis.total, color: '#3b82f6' },
          { label: 'Generiert', value: kpis.generated, color: '#64748b' },
          { label: 'Zugewiesen', value: kpis.assigned, color: '#8b5cf6' },
          { label: 'Gedruckt', value: kpis.printed, color: '#f59e0b' },
          { label: 'Aktiv', value: kpis.active, color: '#22c55e' },
        ].map(k => (
          <div key={k.label} className="bg-white/60 border border-slate-200/60 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase font-mono">{k.label}</div>
            <div className="text-xl font-bold font-mono" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="QR-Code, SN, Batch..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs">
            <option value="">Alle Status</option>
            {Object.entries(QR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {selectedForPrint.size > 0 && (
            <button onClick={() => printLabels(codes.filter(c => selectedForPrint.has(c.id)))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors">
              <Printer size={14} />
              {selectedForPrint.size} Labels drucken
            </button>
          )}
          <input type="number" min="1" max="100" value={bulkCount} onChange={e => setBulkCount(parseInt(e.target.value) || 10)}
            className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-xs text-center" />
          <button onClick={generateBulk} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
            Generieren
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 size={16} className="text-blue-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">{codes.length === 0 ? 'Noch keine QR-Codes' : 'Keine Treffer'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 px-2 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every(c => selectedForPrint.has(c.id))}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedForPrint(new Set(filtered.map(c => c.id)));
                      else setSelectedForPrint(new Set());
                    }}
                    className="rounded border-slate-300" />
                </th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">QR-Code</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Status</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Typ</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Seriennummer</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Batch</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const sc = QR_STATUS[c.status] || QR_STATUS.generated;
                const typeInfo = COMPONENT_TYPES[c.component_type];
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-2 px-2">
                      <input type="checkbox" checked={selectedForPrint.has(c.id)}
                        onChange={() => togglePrintSelect(c.id)} className="rounded border-slate-300" />
                    </td>
                    <td className="py-2 px-3 font-mono text-blue-600 font-medium">{c.qr_code}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.text}33` }}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="py-2 px-3">{typeInfo ? typeInfo.label : c.component_type || '–'}</td>
                    <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">{c.serial_number || <span className="text-slate-300 italic">nicht zugewiesen</span>}</td>
                    <td className="py-2 px-3 font-mono text-slate-500 text-[10px]">{c.batch_id || '–'}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        {!c.serial_number && (
                          <button onClick={() => { setAssignModal({ id: c.id, qr_code: c.qr_code }); setAssignSN(''); setAssignType('ops'); }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200/50"
                            title="SN zuweisen">
                            <Link2 size={10} /> Zuweisen
                          </button>
                        )}
                        <button onClick={() => printLabels([c])}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/50"
                          title="Label drucken">
                          <Printer size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setAssignModal(null)}>
          <div className="bg-white rounded-xl p-5 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Link2 size={16} className="text-blue-500" />
              QR-Code zuweisen
            </h3>
            <div className="text-xs text-slate-500 mb-4">
              <span className="font-mono text-blue-600 font-medium">{assignModal.qr_code}</span> einer Seriennummer zuweisen
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Seriennummer *</label>
                <input type="text" value={assignSN} onChange={e => setAssignSN(e.target.value)} autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Seriennummer eingeben oder scannen" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Komponententyp</label>
                <select value={assignType} onChange={e => setAssignType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs">
                  {Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={handleAssign} disabled={!assignSN.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium">
                Zuweisen
              </button>
              <button onClick={() => setAssignModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Positions-Tracking Tab (unchanged)
// ═══════════════════════════════════════════════════════════════

function PositionenTab() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosition, setFilterPosition] = useState('');

  const loadPositions = useCallback(async (signal) => {
    setLoading(true);
    try {
      let query = supabase
        .from('hardware_positions').select('*')
        .eq('is_current', true)
        .order('created_at', { ascending: false }).limit(500);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setPositions(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[Positionen] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadPositions(controller.signal);
    return () => controller.abort();
  }, [loadPositions]);

  const filtered = useMemo(() => {
    let list = positions;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        (p.serial_number || '').toLowerCase().includes(q) ||
        (p.hardware_id || '').toLowerCase().includes(q) ||
        (p.location_name || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q)
      );
    }
    if (filterPosition) list = list.filter(p => p.position === filterPosition);
    return list;
  }, [positions, searchTerm, filterPosition]);

  const distribution = useMemo(() => {
    const counts = {};
    Object.keys(POSITIONS).forEach(k => counts[k] = 0);
    positions.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });
    return counts;
  }, [positions]);

  return (
    <div className="space-y-4">
      {/* Position Flow */}
      <div className="bg-white/60 border border-slate-200/60 rounded-xl p-4">
        <div className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-3">Hardware-Positionen</div>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {Object.entries(POSITIONS).map(([key, pos], idx) => {
            const Icon = pos.icon;
            return (
              <React.Fragment key={key}>
                {idx > 0 && <ArrowRight size={14} className="text-slate-300 flex-shrink-0" />}
                <button onClick={() => setFilterPosition(filterPosition === key ? '' : key)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all flex-shrink-0 min-w-[80px] ${
                    filterPosition === key ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200/60 hover:border-slate-300'
                  }`}>
                  <Icon size={16} style={{ color: pos.color }} />
                  <span className="text-[10px] text-slate-600 font-medium">{pos.label}</span>
                  <span className="text-sm font-bold font-mono" style={{ color: pos.color }}>{distribution[key] || 0}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="SN, Hardware-ID, Standort..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        {filterPosition && (
          <button onClick={() => setFilterPosition('')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-600">
            <X size={12} />{POSITIONS[filterPosition]?.label}
          </button>
        )}
        <button onClick={loadPositions} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 size={16} className="text-blue-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">{positions.length === 0 ? 'Noch keine Positionen erfasst' : 'Keine Treffer'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Typ</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">SN / ID</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Position</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Detail</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Standort</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Bewegt von</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Grund</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Seit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const typeInfo = COMPONENT_TYPES[p.component_type] || { label: p.component_type, color: '#64748b' };
                const posInfo = POSITIONS[p.position] || { label: p.position, color: '#64748b' };
                const PosIcon = posInfo.icon || MapPin;
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: typeInfo.color + '15', color: typeInfo.color, border: `1px solid ${typeInfo.color}33` }}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700 text-[11px]">{p.serial_number || p.hardware_id}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <PosIcon size={12} style={{ color: posInfo.color }} />
                        <span style={{ color: posInfo.color }} className="font-medium">{posInfo.label}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{p.sub_position || '–'}</td>
                    <td className="py-2 px-3 text-slate-700">{p.location_name ? `${p.location_name}${p.city ? ` (${p.city})` : ''}` : '–'}</td>
                    <td className="py-2 px-3 text-slate-500">{p.moved_by || '–'}</td>
                    <td className="py-2 px-3 text-slate-500">{p.move_reason || '–'}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{new Date(p.created_at).toLocaleDateString('de-DE')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

export { WareneingangTab, QRCodeTab, PositionenTab };
export { POSITIONS, COMPONENT_TYPES, CONDITIONS };
