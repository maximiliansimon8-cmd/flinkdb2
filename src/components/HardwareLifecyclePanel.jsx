import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, QrCode, MapPin, Plus, Search, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  Truck, Warehouse, Send, Building2, RotateCcw, Wrench, Trash2,
  Printer, Download, Filter, X, Cpu, Monitor, CardSim, Grip,
  ArrowRight, Clock, Hash, Calendar,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://hvgjdosdejnwkuyivnrq.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2Z2pkb3NkZWpud2t1eWl2bnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODUzMzcsImV4cCI6MjA4NjM2MTMzN30.eKY0Yyl0Dquqa7FQHjalAQvbqwtWsEFDA1eHgwDp7JQ'
);

// ─── Position Labels & Icons ───
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

// ═══════════════════════════════════════════════════════════════
// Wareneingang Tab
// ═══════════════════════════════════════════════════════════════

function WareneingangTab() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    supplier: '',
    deliveryNote: '',
    orderReference: '',
    carrier: '',
    componentType: 'ops',
    serialNumber: '',
    quantity: 1,
    condition: 'ok',
    conditionNotes: '',
    receivedBy: '',
    warehouse: 'Hauptlager',
  });

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('goods_receipts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error) setReceipts(data || []);
    } catch (e) {
      console.error('[Wareneingang] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Generate receipt ID
      const { data: receiptId } = await supabase.rpc('generate_receipt_id');
      const rid = receiptId || `WE-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

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
      });

      if (error) throw error;

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Suche nach WE-ID, Lieferant, SN..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button onClick={loadReceipts} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors" title="Aktualisieren">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors shadow-sm"
        >
          <Plus size={14} />
          Wareneingang
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200/60 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Package size={16} className="text-blue-500" />
            Neuer Wareneingang
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
              <label className="text-xs text-slate-500 mb-1 block">Seriennummer</label>
              <input type="text" value={form.serialNumber} onChange={e => setForm({...form, serialNumber: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="SN scannen oder eingeben" />
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
              Wareneingang erfassen
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
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Menge</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Zustand</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Lager</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const typeInfo = COMPONENT_TYPES[r.component_type] || { label: r.component_type, color: '#64748b' };
                const condInfo = CONDITIONS.find(c => c.value === r.condition) || CONDITIONS[0];
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
                    <td className="py-2 px-3 font-mono text-slate-600">{r.serial_number || '–'}</td>
                    <td className="py-2 px-3 text-slate-600">{r.quantity}</td>
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
// QR-Code Management Tab
// ═══════════════════════════════════════════════════════════════

function QRCodeTab() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [bulkCount, setBulkCount] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hardware_qr_codes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!error) setCodes(data || []);
    } catch (e) {
      console.error('[QR] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const generateBulk = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc('generate_qr_codes_bulk', {
        count: bulkCount,
        prefix: 'JET-HW',
      });
      if (error) throw error;
      loadCodes();
    } catch (e) {
      console.error('[QR] Generate error:', e);
      alert('Fehler beim Generieren: ' + e.message);
    } finally {
      setGenerating(false);
    }
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
    if (filterStatus) {
      list = list.filter(c => c.status === filterStatus);
    }
    return list;
  }, [codes, searchTerm, filterStatus]);

  const statusColors = {
    generated:   { bg: '#64748b15', text: '#64748b', label: 'Generiert' },
    assigned:    { bg: '#3b82f615', text: '#3b82f6', label: 'Zugewiesen' },
    printed:     { bg: '#8b5cf615', text: '#8b5cf6', label: 'Gedruckt' },
    active:      { bg: '#22c55e15', text: '#22c55e', label: 'Aktiv' },
    deactivated: { bg: '#ef444415', text: '#ef4444', label: 'Deaktiviert' },
  };

  const kpis = useMemo(() => ({
    total: codes.length,
    generated: codes.filter(c => c.status === 'generated').length,
    assigned: codes.filter(c => c.status === 'assigned').length,
    active: codes.filter(c => c.status === 'active').length,
    batches: [...new Set(codes.map(c => c.batch_id).filter(Boolean))].length,
  }), [codes]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Gesamt', value: kpis.total, color: '#3b82f6' },
          { label: 'Generiert', value: kpis.generated, color: '#64748b' },
          { label: 'Zugewiesen', value: kpis.assigned, color: '#8b5cf6' },
          { label: 'Aktiv', value: kpis.active, color: '#22c55e' },
          { label: 'Batches', value: kpis.batches, color: '#f59e0b' },
        ].map(k => (
          <div key={k.label} className="bg-white/60 border border-slate-200/60 rounded-xl p-3">
            <div className="text-[10px] text-slate-500 uppercase font-mono">{k.label}</div>
            <div className="text-xl font-bold font-mono" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="QR-Code, SN, Batch..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none">
            <option value="">Alle Status</option>
            {Object.entries(statusColors).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input type="number" min="1" max="100" value={bulkCount} onChange={e => setBulkCount(parseInt(e.target.value) || 10)}
            className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-xs text-center focus:outline-none" />
          <button onClick={generateBulk} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm">
            {generating ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
            QR-Codes generieren
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          {codes.length === 0 ? 'Noch keine QR-Codes generiert' : 'Keine Treffer'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">QR-Code</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Batch</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Status</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Typ</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">SN</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Zugewiesen</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const sc = statusColors[c.status] || statusColors.generated;
                const typeInfo = COMPONENT_TYPES[c.component_type];
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-mono text-blue-600 font-medium">{c.qr_code}</td>
                    <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{c.batch_id || '–'}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.text}33` }}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="py-2 px-3">{typeInfo ? typeInfo.label : c.component_type || '–'}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{c.serial_number || '–'}</td>
                    <td className="py-2 px-3 text-slate-600">{c.assigned_at ? new Date(c.assigned_at).toLocaleDateString('de-DE') : '–'}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{new Date(c.created_at).toLocaleDateString('de-DE')}</td>
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
// Positions-Tracking Tab
// ═══════════════════════════════════════════════════════════════

function PositionenTab() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosition, setFilterPosition] = useState('');

  const loadPositions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hardware_positions')
        .select('*')
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(500);
      if (!error) setPositions(data || []);
    } catch (e) {
      console.error('[Positionen] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPositions(); }, [loadPositions]);

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
    if (filterPosition) {
      list = list.filter(p => p.position === filterPosition);
    }
    return list;
  }, [positions, searchTerm, filterPosition]);

  // Position distribution
  const distribution = useMemo(() => {
    const counts = {};
    Object.keys(POSITIONS).forEach(k => counts[k] = 0);
    positions.forEach(p => {
      if (counts[p.position] !== undefined) counts[p.position]++;
      else counts[p.position] = 1;
    });
    return counts;
  }, [positions]);

  return (
    <div className="space-y-4">
      {/* Position Flow Visualization */}
      <div className="bg-white/60 border border-slate-200/60 rounded-xl p-4">
        <div className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-3">Hardware-Positionen</div>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {Object.entries(POSITIONS).map(([key, pos], idx) => {
            const Icon = pos.icon;
            const count = distribution[key] || 0;
            return (
              <React.Fragment key={key}>
                {idx > 0 && <ArrowRight size={14} className="text-slate-300 flex-shrink-0" />}
                <button
                  onClick={() => setFilterPosition(filterPosition === key ? '' : key)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all flex-shrink-0 min-w-[80px] ${
                    filterPosition === key
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200/60 hover:border-slate-300'
                  }`}
                >
                  <Icon size={16} style={{ color: pos.color }} />
                  <span className="text-[10px] text-slate-600 font-medium">{pos.label}</span>
                  <span className="text-sm font-bold font-mono" style={{ color: pos.color }}>{count}</span>
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
            <X size={12} />
            {POSITIONS[filterPosition]?.label || filterPosition}
          </button>
        )}
        <button onClick={loadPositions} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          {positions.length === 0 ? 'Noch keine Positionen erfasst' : 'Keine Treffer'}
        </div>
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
                    <td className="py-2 px-3 text-slate-700">
                      {p.location_name ? (
                        <span>{p.location_name}{p.city ? ` (${p.city})` : ''}</span>
                      ) : '–'}
                    </td>
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
// Main Export — Used by HardwareDashboard
// ═══════════════════════════════════════════════════════════════

export { WareneingangTab, QRCodeTab, PositionenTab };
export { POSITIONS, COMPONENT_TYPES, CONDITIONS };
