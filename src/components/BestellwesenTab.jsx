import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Plus, Search, Filter, Loader2, RefreshCw,
  CheckCircle2, AlertTriangle, ChevronDown, X, Eye,
  Trash2, ShoppingCart, ClipboardList, Calendar, Truck,
  ArrowRight, Hash, FileText, DollarSign,
} from 'lucide-react';
import { supabase } from '../utils/authService';

// ─── Constants ───
const STATUS_CONFIG = {
  entwurf:       { label: 'Entwurf',       bg: 'bg-slate-100',  text: 'text-slate-700',  border: 'border-slate-200/50',  color: '#64748b' },
  bestellt:      { label: 'Bestellt',      bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200/50',   color: '#3b82f6' },
  teilgeliefert: { label: 'Teilgeliefert', bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200/50',  color: '#f59e0b' },
  'vollständig': { label: 'Vollständig',   bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200/50',  color: '#22c55e' },
  storniert:     { label: 'Storniert',     bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200/50',    color: '#ef4444' },
};

const STATUS_FLOW = ['entwurf', 'bestellt', 'teilgeliefert', 'vollständig'];

const COMPONENT_TYPES = [
  { value: 'ops',       label: 'OPS Player' },
  { value: 'display',   label: 'Display' },
  { value: 'sim',       label: 'SIM-Karte' },
  { value: 'mount',     label: 'Halterung' },
  { value: 'accessory', label: 'Zubehör' },
];

const EMPTY_ITEM = { component_type: 'ops', description: '', quantity: 1, unit_price: '' };


// ═══════════════════════════════════════════════════════════════
// BestellwesenTab
// ═══════════════════════════════════════════════════════════════

export default function BestellwesenTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [saving, setSaving] = useState(false);

  // ─── New PO Form state ───
  const [form, setForm] = useState({
    supplier: '',
    supplier_reference: '',
    expected_delivery: '',
    notes: '',
    created_by: '',
  });
  const [formItems, setFormItems] = useState([{ ...EMPTY_ITEM }]);

  // ─── Load orders ───
  const loadOrders = useCallback(async (signal) => {
    setLoading(true);
    try {
      let query = supabase
        .from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (error) {
        // Fallback without join
        let fallback = supabase
          .from('purchase_orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300);
        if (signal) fallback = fallback.abortSignal(signal);
        const { data: d2 } = await fallback;
        if (!signal?.aborted) setOrders(d2 || []);
      } else {
        setOrders(data || []);
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[Bestellwesen] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders]);

  // ─── KPIs ───
  const kpis = useMemo(() => ({
    total: orders.length,
    offen: orders.filter(o => o.status === 'entwurf' || o.status === 'bestellt').length,
    teilgeliefert: orders.filter(o => o.status === 'teilgeliefert').length,
    abgeschlossen: orders.filter(o => o.status === 'vollständig').length,
  }), [orders]);

  // ─── Filtered list ───
  const filtered = useMemo(() => {
    let list = orders;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(o =>
        (o.po_number || '').toLowerCase().includes(q) ||
        (o.supplier || '').toLowerCase().includes(q) ||
        (o.supplier_reference || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus) list = list.filter(o => o.status === filterStatus);
    return list;
  }, [orders, searchTerm, filterStatus]);

  // ─── Create PO ───
  const handleCreatePO = async (e) => {
    e.preventDefault();
    if (!form.supplier.trim()) return;

    const validItems = formItems.filter(it => it.quantity > 0);
    if (validItems.length === 0) { alert('Mindestens eine Position hinzufügen'); return; }

    setSaving(true);
    try {
      // 1. Generate PO number
      let poNumber;
      try {
        const { data } = await supabase.rpc('generate_po_number');
        poNumber = data;
      } catch {
        poNumber = null;
      }
      if (!poNumber) {
        poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      }

      // 2. Calculate totals
      const totalItems = validItems.reduce((sum, it) => sum + (parseInt(it.quantity) || 0), 0);
      const totalAmount = validItems.reduce((sum, it) => {
        const price = parseFloat(it.unit_price) || 0;
        const qty = parseInt(it.quantity) || 0;
        return sum + (price * qty);
      }, 0);

      // 3. Insert PO
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          supplier: form.supplier.trim(),
          supplier_reference: form.supplier_reference.trim() || null,
          expected_delivery: form.expected_delivery || null,
          notes: form.notes.trim() || null,
          created_by: form.created_by.trim() || null,
          status: 'entwurf',
          total_items: totalItems,
          received_items: 0,
          total_amount: totalAmount > 0 ? totalAmount : null,
        })
        .select('id')
        .single();

      if (poError) throw poError;

      // 4. Insert items
      const itemInserts = validItems.map((it, idx) => ({
        purchase_order_id: poData.id,
        line_number: idx + 1,
        component_type: it.component_type,
        description: it.description.trim() || null,
        quantity: parseInt(it.quantity) || 1,
        received_quantity: 0,
        unit_price: parseFloat(it.unit_price) || null,
      }));

      const { error: itemError } = await supabase
        .from('purchase_order_items')
        .insert(itemInserts);

      if (itemError) throw itemError;

      // Reset form
      setShowForm(false);
      setForm({ supplier: '', supplier_reference: '', expected_delivery: '', notes: '', created_by: '' });
      setFormItems([{ ...EMPTY_ITEM }]);
      loadOrders();
    } catch (e) {
      console.error('[Bestellwesen] Create error:', e);
      alert('Fehler beim Erstellen: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Item row helpers ───
  const addItem = () => setFormItems([...formItems, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== idx));
  };
  const updateItem = (idx, field, value) => {
    const updated = [...formItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormItems(updated);
  };

  // ─── Status change ───
  const changeStatus = async (orderId, newStatus) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);
      if (error) throw error;
      loadOrders();
      if (selectedPO && selectedPO.id === orderId) {
        setSelectedPO({ ...selectedPO, status: newStatus });
      }
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  };

  // ─── Receive items ───
  const receiveItems = async (itemId, receivedQty, orderId) => {
    try {
      // Update item
      const { error } = await supabase
        .from('purchase_order_items')
        .update({ received_quantity: receivedQty })
        .eq('id', itemId);
      if (error) throw error;

      // Recalculate PO totals
      const { data: allItems } = await supabase
        .from('purchase_order_items')
        .select('quantity, received_quantity')
        .eq('purchase_order_id', orderId);

      if (allItems) {
        const totalItems = allItems.reduce((s, it) => s + (it.quantity || 0), 0);
        const receivedItems = allItems.reduce((s, it) => s + (it.received_quantity || 0), 0);

        // Auto-determine status
        let newStatus;
        if (receivedItems === 0) {
          newStatus = 'bestellt';
        } else if (receivedItems >= totalItems) {
          newStatus = 'vollständig';
        } else {
          newStatus = 'teilgeliefert';
        }

        await supabase
          .from('purchase_orders')
          .update({
            total_items: totalItems,
            received_items: receivedItems,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);
      }

      loadOrders();
      // Reload detail
      const { data: refreshed } = await supabase
        .from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .eq('id', orderId)
        .single();
      if (refreshed) setSelectedPO(refreshed);
    } catch (e) {
      alert('Fehler beim Verbuchen: ' + e.message);
    }
  };

  // ─── Helper: get items count ───
  const getItemsCount = (order) => {
    if (order.purchase_order_items) return order.purchase_order_items.length;
    return 0;
  };

  return (
    <div className="space-y-4">
      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Gesamt',         value: kpis.total,         icon: ClipboardList, color: '#3b82f6' },
          { label: 'Offen',          value: kpis.offen,         icon: ShoppingCart,  color: '#8b5cf6' },
          { label: 'Teilgeliefert',  value: kpis.teilgeliefert, icon: Truck,         color: '#f59e0b' },
          { label: 'Abgeschlossen',  value: kpis.abgeschlossen, icon: CheckCircle2,  color: '#22c55e' },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white/60 border border-slate-200/60 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500 uppercase font-mono">{k.label}</span>
                <Icon size={14} style={{ color: k.color }} />
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: k.color }}>{k.value}</div>
            </div>
          );
        })}
      </div>

      {/* ─── Header: Search + Filter + Actions ─── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="PO-Nr, Lieferant suchen..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs"
          >
            <option value="">Alle Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {filterStatus && (
            <button
              onClick={() => setFilterStatus('')}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-600"
            >
              <X size={12} />{STATUS_CONFIG[filterStatus]?.label}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOrders}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500"
            title="Aktualisieren"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors shadow-sm"
          >
            <Plus size={14} />
            Neue Bestellung
          </button>
        </div>
      </div>

      {/* ─── New PO Form ─── */}
      {showForm && (
        <form onSubmit={handleCreatePO} className="bg-white border border-slate-200/60 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ShoppingCart size={16} className="text-blue-500" />
            Neue Bestellung anlegen
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Lieferant *</label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="z.B. Philips, JWIPC, 1NCE..."
                required
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Lieferanten-Referenz</label>
              <input
                type="text"
                value={form.supplier_reference}
                onChange={(e) => setForm({ ...form, supplier_reference: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Angebots-/Auftrags-Nr"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Geplantes Lieferdatum</label>
              <input
                type="date"
                value={form.expected_delivery}
                onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Notizen</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                rows={2}
                placeholder="Interne Notizen zur Bestellung..."
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Erstellt von</label>
              <input
                type="text"
                value={form.created_by}
                onChange={(e) => setForm({ ...form, created_by: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Name"
              />
            </div>
          </div>

          {/* ─── Dynamic item rows ─── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-600">Positionen</span>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-600 transition-colors"
              >
                <Plus size={12} />
                Position hinzufügen
              </button>
            </div>

            <div className="space-y-2">
              {/* Header */}
              <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] text-slate-500 uppercase font-mono px-1">
                <div className="col-span-3">Komponententyp</div>
                <div className="col-span-4">Beschreibung</div>
                <div className="col-span-2">Menge</div>
                <div className="col-span-2">Einzelpreis</div>
                <div className="col-span-1"></div>
              </div>

              {formItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                  <select
                    value={item.component_type}
                    onChange={(e) => updateItem(idx, 'component_type', e.target.value)}
                    className="md:col-span-3 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {COMPONENT_TYPES.map(ct => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    placeholder="Beschreibung (optional)"
                    className="md:col-span-4 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                    className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                    placeholder="EUR"
                    className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={formItems.length <= 1}
                    className="md:col-span-1 p-2 rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-slate-200 disabled:hover:text-slate-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Bestellung anlegen
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* ─── PO List Table ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-blue-500 animate-spin" />
          <span className="ml-2 text-xs text-slate-500">Lade Bestellungen...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs">
          {orders.length === 0 ? 'Noch keine Bestellungen vorhanden' : 'Keine Treffer für die Suche'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">PO-Nr</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Datum</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Lieferant</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Positionen</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Status</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Fortschritt</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.entwurf;
                const total = order.total_items || 0;
                const received = order.received_items || 0;
                const progress = total > 0 ? Math.round((received / total) * 100) : 0;
                const itemsCount = getItemsCount(order);

                return (
                  <tr
                    key={order.id}
                    className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
                    onClick={() => {
                      // Load full detail
                      supabase
                        .from('purchase_orders')
                        .select('*, purchase_order_items(*)')
                        .eq('id', order.id)
                        .single()
                        .then(({ data }) => {
                          if (data) setSelectedPO(data);
                          else setSelectedPO(order);
                        });
                    }}
                  >
                    <td className="py-2 px-3 font-mono text-blue-600 font-medium">{order.po_number}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">
                      {new Date(order.created_at).toLocaleDateString('de-DE')}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{order.supplier || '\u2013'}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200/50">
                        <Package size={10} />
                        {itemsCount}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <StatusDropdown
                        currentStatus={order.status}
                        onChangeStatus={(newStatus) => {
                          changeStatus(order.id, newStatus);
                        }}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: progress >= 100 ? '#22c55e' : progress > 0 ? '#f59e0b' : '#e2e8f0',
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                          {received}/{total}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            supabase
                              .from('purchase_orders')
                              .select('*, purchase_order_items(*)')
                              .eq('id', order.id)
                              .single()
                              .then(({ data }) => {
                                if (data) setSelectedPO(data);
                                else setSelectedPO(order);
                              });
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/50"
                          title="Details"
                        >
                          <Eye size={10} /> Details
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

      {/* ─── PO Detail Modal ─── */}
      {selectedPO && (
        <PODetailModal
          order={selectedPO}
          onClose={() => setSelectedPO(null)}
          onReceive={receiveItems}
          onChangeStatus={changeStatus}
        />
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Status Dropdown (click-to-change)
// ═══════════════════════════════════════════════════════════════

function StatusDropdown({ currentStatus, onChangeStatus }) {
  const [open, setOpen] = useState(false);
  const sc = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.entwurf;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border ${sc.bg} ${sc.text} ${sc.border} cursor-pointer hover:opacity-80 transition-opacity`}
      >
        {sc.label}
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[140px]">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={(e) => {
                  e.stopPropagation();
                  if (key !== currentStatus) onChangeStatus(key);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 ${
                  key === currentStatus ? 'font-medium' : ''
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: config.color }}
                />
                {config.label}
                {key === currentStatus && <CheckCircle2 size={10} className="ml-auto text-blue-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// PO Detail Modal
// ═══════════════════════════════════════════════════════════════

function PODetailModal({ order, onClose, onReceive, onChangeStatus }) {
  const [receiveMode, setReceiveMode] = useState(null); // item id being edited
  const [receiveQty, setReceiveQty] = useState('');

  const items = order.purchase_order_items || [];
  const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.entwurf;
  const total = order.total_items || 0;
  const received = order.received_items || 0;

  const handleReceiveSubmit = (item) => {
    const qty = parseInt(receiveQty);
    if (isNaN(qty) || qty < 0) return;
    const finalQty = Math.min(qty, item.quantity);
    onReceive(item.id, finalQty, order.id);
    setReceiveMode(null);
    setReceiveQty('');
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-5 max-w-3xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList size={16} className="text-blue-500" />
              Bestellung {order.po_number}
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
              Erstellt am {new Date(order.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {order.created_by && ` von ${order.created_by}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ─── Status Timeline ─── */}
        <div className="bg-slate-50 rounded-lg p-3 mb-4">
          <div className="text-[10px] text-slate-500 uppercase font-mono mb-2">Status-Verlauf</div>
          <div className="flex items-center gap-1">
            {STATUS_FLOW.map((step, idx) => {
              const stepConfig = STATUS_CONFIG[step];
              const isActive = step === order.status;
              const isPast = STATUS_FLOW.indexOf(order.status) > idx;
              const isCancelled = order.status === 'storniert';

              return (
                <React.Fragment key={step}>
                  {idx > 0 && (
                    <div className={`flex-1 h-0.5 rounded ${isPast ? 'bg-blue-400' : 'bg-slate-200'}`} />
                  )}
                  <button
                    onClick={() => {
                      if (step !== order.status) onChangeStatus(order.id, step);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                      isActive
                        ? `${stepConfig.bg} ${stepConfig.text} ${stepConfig.border} ring-2 ring-offset-1`
                        : isPast
                          ? 'bg-blue-50 text-blue-600 border-blue-200/50'
                          : 'bg-white text-slate-400 border-slate-200/50 hover:border-slate-300'
                    } ${isCancelled ? 'opacity-40' : ''}`}
                    style={isActive ? { '--tw-ring-color': stepConfig.color + '40' } : {}}
                  >
                    {isPast && !isActive ? <CheckCircle2 size={12} /> : null}
                    {stepConfig.label}
                  </button>
                </React.Fragment>
              );
            })}
            {/* Storniert as separate option */}
            {order.status === 'storniert' && (
              <>
                <div className="flex-1" />
                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-50 text-red-700 border border-red-200/50 ring-2 ring-offset-1"
                  style={{ '--tw-ring-color': '#ef444440' }}
                >
                  <AlertTriangle size={12} />
                  Storniert
                </span>
              </>
            )}
          </div>
        </div>

        {/* ─── PO Info ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-slate-200/60 rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase font-mono flex items-center gap-1">
              <Hash size={10} /> PO-Nummer
            </div>
            <div className="text-xs font-mono font-bold text-blue-600 mt-1">{order.po_number}</div>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase font-mono flex items-center gap-1">
              <Truck size={10} /> Lieferant
            </div>
            <div className="text-xs font-medium text-slate-700 mt-1">{order.supplier || '\u2013'}</div>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase font-mono flex items-center gap-1">
              <Calendar size={10} /> Lieferdatum
            </div>
            <div className="text-xs text-slate-700 mt-1">
              {order.expected_delivery
                ? new Date(order.expected_delivery).toLocaleDateString('de-DE')
                : '\u2013'}
            </div>
          </div>
          <div className="bg-white border border-slate-200/60 rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase font-mono flex items-center gap-1">
              <DollarSign size={10} /> Gesamtbetrag
            </div>
            <div className="text-xs font-mono font-bold text-slate-700 mt-1">
              {order.total_amount
                ? `${Number(order.total_amount).toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR`
                : '\u2013'}
            </div>
          </div>
        </div>

        {/* Supplier reference & notes */}
        {(order.supplier_reference || order.notes) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {order.supplier_reference && (
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] text-slate-500 uppercase font-mono mb-1">Lieferanten-Referenz</div>
                <div className="text-xs text-slate-700 font-mono">{order.supplier_reference}</div>
              </div>
            )}
            {order.notes && (
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] text-slate-500 uppercase font-mono mb-1">Notizen</div>
                <div className="text-xs text-slate-600">{order.notes}</div>
              </div>
            )}
          </div>
        )}

        {/* ─── Progress bar ─── */}
        <div className="bg-slate-50 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-500 uppercase font-mono">Lieferfortschritt</span>
            <span className="text-xs font-mono font-bold text-slate-700">
              {received} / {total} Stk.
            </span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: total > 0 ? `${Math.round((received / total) * 100)}%` : '0%',
                backgroundColor: received >= total && total > 0 ? '#22c55e' : received > 0 ? '#f59e0b' : '#e2e8f0',
              }}
            />
          </div>
        </div>

        {/* ─── Items list ─── */}
        <div className="mb-4">
          <div className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">
            Positionen ({items.length})
          </div>

          {items.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-xs">Keine Positionen vorhanden</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">#</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Typ</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Beschreibung</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Bestellt</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Erhalten</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Preis</th>
                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
                    .map((item) => {
                      const typeLabel = COMPONENT_TYPES.find(ct => ct.value === item.component_type)?.label || item.component_type || '\u2013';
                      const isComplete = (item.received_quantity || 0) >= (item.quantity || 0);

                      return (
                        <tr key={item.id} className={`border-b border-slate-100 ${isComplete ? 'bg-green-50/30' : ''}`}>
                          <td className="py-2 px-3 text-slate-400 font-mono">{item.line_number || '\u2013'}</td>
                          <td className="py-2 px-3 text-slate-700 font-medium">{typeLabel}</td>
                          <td className="py-2 px-3 text-slate-600">{item.description || '\u2013'}</td>
                          <td className="py-2 px-3 font-mono text-slate-700">{item.quantity}</td>
                          <td className="py-2 px-3">
                            <span className={`font-mono font-medium ${isComplete ? 'text-green-600' : 'text-amber-600'}`}>
                              {item.received_quantity || 0}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600">
                            {item.unit_price
                              ? `${Number(item.unit_price).toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR`
                              : '\u2013'}
                          </td>
                          <td className="py-2 px-3">
                            {receiveMode === item.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.quantity}
                                  value={receiveQty}
                                  onChange={(e) => setReceiveQty(e.target.value)}
                                  autoFocus
                                  className="w-16 px-2 py-1 rounded border border-blue-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  placeholder="Anz."
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleReceiveSubmit(item);
                                    if (e.key === 'Escape') { setReceiveMode(null); setReceiveQty(''); }
                                  }}
                                />
                                <button
                                  onClick={() => handleReceiveSubmit(item)}
                                  className="p-1 rounded bg-green-500 hover:bg-green-600 text-white transition-colors"
                                  title="Verbuchen"
                                >
                                  <CheckCircle2 size={12} />
                                </button>
                                <button
                                  onClick={() => { setReceiveMode(null); setReceiveQty(''); }}
                                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setReceiveMode(item.id);
                                  setReceiveQty(String(item.received_quantity || 0));
                                }}
                                disabled={isComplete}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
                                  isComplete
                                    ? 'bg-green-50 text-green-600 border border-green-200/50 cursor-default'
                                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200/50'
                                }`}
                                title={isComplete ? 'Vollständig' : 'Wareneingang verbuchen'}
                              >
                                {isComplete ? (
                                  <><CheckCircle2 size={10} /> Vollständig</>
                                ) : (
                                  <><Truck size={10} /> Wareneingang</>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ─── Footer actions ─── */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2">
            {order.status !== 'storniert' && order.status !== 'vollständig' && (
              <button
                onClick={() => onChangeStatus(order.id, 'storniert')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs transition-colors"
              >
                <AlertTriangle size={12} />
                Stornieren
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
