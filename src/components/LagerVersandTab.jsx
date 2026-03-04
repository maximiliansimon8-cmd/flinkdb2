import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Warehouse, Send, Truck, RotateCcw, Plus, Search, Filter,
  Loader2, RefreshCw, CheckCircle2, AlertTriangle, X, Eye, Pencil,
  Trash2, ArrowRight, Hash, Calendar, MapPin, ClipboardCheck, Clock,
  ChevronDown, ChevronUp, Link2, Box, ShoppingCart, Cpu, Monitor,
  Grip, AlertCircle,
} from 'lucide-react';
import { supabase } from '../utils/authService';

// ─── Constants ───
const COMPONENT_TYPES = {
  ops:     { label: 'OPS Player', icon: Cpu,     color: '#007AFF' },
  display: { label: 'Display',   icon: Monitor, color: '#AF52DE' },
  sim:     { label: 'SIM-Karte', icon: Hash,    color: '#34C759' },
  mount:   { label: 'Halterung', icon: Grip,    color: '#FF9500' },
};

const SHIPPING_STATUS = {
  kommissioniert: { label: 'Kommissioniert', color: '#64748b', bg: '#64748b15' },
  verpackt:       { label: 'Verpackt',       color: '#007AFF', bg: '#007AFF15' },
  versendet:      { label: 'Versendet',      color: '#FF9500', bg: '#FF950015' },
  zugestellt:     { label: 'Zugestellt',      color: '#34C759', bg: '#34C75915' },
  problem:        { label: 'Problem',         color: '#FF3B30', bg: '#FF3B3015' },
};

const RETURN_STATUS = {
  erwartet:    { label: 'Erwartet',    color: '#64748b', bg: '#64748b15' },
  eingegangen: { label: 'Eingegangen', color: '#007AFF', bg: '#007AFF15' },
  geprueft:    { label: 'Gepr\u00fcft',      color: '#FF9500', bg: '#FF950015' },
  entschieden: { label: 'Entschieden', color: '#34C759', bg: '#34C75915' },
};

const RETURN_REASONS = [
  { value: 'defekt', label: 'Defekt' },
  { value: 'tausch', label: 'Tausch' },
  { value: 'vertragsende', label: 'Vertragsende' },
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const ITEM_CONDITIONS = [
  { value: 'ok', label: 'OK', color: '#34C759' },
  { value: 'beschaedigt', label: 'Besch\u00e4digt', color: '#FF9500' },
  { value: 'defekt', label: 'Defekt', color: '#FF3B30' },
];

// ─── Helper: StatusBadge ───
function StatusBadge({ status, config }) {
  const s = config[status] || { label: status || '\u2013', color: '#64748b', bg: '#64748b15' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.color}33` }}
    >
      {s.label}
    </span>
  );
}

// ─── Helper: KPI Card ───
function KpiCard({ label, value, color }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-xl p-3 shadow-card">
      <div className="text-[10px] text-text-muted uppercase font-mono tracking-wider">{label}</div>
      <div className="text-xl font-bold font-mono mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}


// =================================================================
// SUB-TAB 1: LAGERBESTAND (Stock Overview)
// =================================================================

function LagerbestandTab() {
  const [stockData, setStockData] = useState([]);
  const [defectCounts, setDefectCounts] = useState({});
  const [reservedCounts, setReservedCounts] = useState({});
  const [loading, setLoading] = useState(true);

  // Warehouse Locations
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locationForm, setLocationForm] = useState({
    warehouse: 'Hauptlager', zone: '', shelf: '', name: '', capacity: 50, current_count: 0, type: 'allgemein',
  });
  const [savingLocation, setSavingLocation] = useState(false);

  // Stock Alerts
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertForm, setAlertForm] = useState({
    component_type: 'ops', warehouse: 'Hauptlager', min_stock: 5,
  });
  const [savingAlert, setSavingAlert] = useState(false);

  // ─── Load stock data ───
  const loadStock = useCallback(async (signal) => {
    setLoading(true);
    try {
      // Fetch available stock (position = lager)
      let lagerQuery = supabase
        .from('hardware_positions')
        .select('component_type')
        .eq('is_current', true)
        .eq('position', 'lager');
      if (signal) lagerQuery = lagerQuery.abortSignal(signal);
      const { data: lagerData, error: lagerErr } = await lagerQuery;

      if (signal?.aborted) return;
      if (lagerErr) throw lagerErr;

      // Count by component_type
      const counts = {};
      (lagerData || []).forEach(item => {
        const t = item.component_type || 'unknown';
        counts[t] = (counts[t] || 0) + 1;
      });

      // Build stock array
      const stock = Object.entries(COMPONENT_TYPES).map(([key, info]) => ({
        type: key,
        label: info.label,
        color: info.color,
        available: counts[key] || 0,
      }));
      setStockData(stock);

      // Fetch defect items (position = reparatur)
      let defectQuery = supabase
        .from('hardware_positions')
        .select('component_type')
        .eq('is_current', true)
        .eq('position', 'reparatur');
      if (signal) defectQuery = defectQuery.abortSignal(signal);
      const { data: defectData } = await defectQuery;

      if (signal?.aborted) return;
      const dCounts = {};
      (defectData || []).forEach(item => {
        const t = item.component_type || 'unknown';
        dCounts[t] = (dCounts[t] || 0) + 1;
      });
      setDefectCounts(dCounts);

      // Fetch reserved items (position = versand, still pending)
      let reservedQuery = supabase
        .from('hardware_positions')
        .select('component_type')
        .eq('is_current', true)
        .eq('position', 'versand');
      if (signal) reservedQuery = reservedQuery.abortSignal(signal);
      const { data: reservedData } = await reservedQuery;

      if (signal?.aborted) return;
      const rCounts = {};
      (reservedData || []).forEach(item => {
        const t = item.component_type || 'unknown';
        rCounts[t] = (rCounts[t] || 0) + 1;
      });
      setReservedCounts(rCounts);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[Lagerbestand] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // ─── Load warehouse locations ───
  const loadLocations = useCallback(async (signal) => {
    setLoadingLocations(true);
    try {
      let query = supabase
        .from('warehouse_locations')
        .select('*')
        .order('warehouse', { ascending: true });
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setLocations(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[Lagerpl\u00e4tze] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoadingLocations(false);
    }
  }, []);

  // ─── Load stock alerts ───
  const loadAlerts = useCallback(async (signal) => {
    setLoadingAlerts(true);
    try {
      let query = supabase
        .from('stock_alerts')
        .select('*')
        .order('created_at', { ascending: false });
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setAlerts(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[Stock Alerts] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadStock(controller.signal);
    loadLocations(controller.signal);
    loadAlerts(controller.signal);
    return () => controller.abort();
  }, [loadStock, loadLocations, loadAlerts]);

  // ─── Save warehouse location ───
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    setSavingLocation(true);
    try {
      const { error } = await supabase.from('warehouse_locations').insert({
        warehouse: locationForm.warehouse,
        zone: locationForm.zone || null,
        shelf: locationForm.shelf || null,
        name: locationForm.name || null,
        capacity: locationForm.capacity,
        current_count: locationForm.current_count,
        type: locationForm.type,
      });
      if (error) throw error;
      setShowLocationForm(false);
      setLocationForm({ warehouse: 'Hauptlager', zone: '', shelf: '', name: '', capacity: 50, current_count: 0, type: 'allgemein' });
      loadLocations();
    } catch (e) {
      alert('Fehler beim Speichern: ' + e.message);
    } finally {
      setSavingLocation(false);
    }
  };

  // ─── Save stock alert ───
  const handleSaveAlert = async (e) => {
    e.preventDefault();
    setSavingAlert(true);
    try {
      const { error } = await supabase.from('stock_alerts').insert({
        component_type: alertForm.component_type,
        warehouse: alertForm.warehouse,
        min_stock: alertForm.min_stock,
      });
      if (error) throw error;
      setShowAlertForm(false);
      setAlertForm({ component_type: 'ops', warehouse: 'Hauptlager', min_stock: 5 });
      loadAlerts();
    } catch (e) {
      alert('Fehler beim Speichern: ' + e.message);
    } finally {
      setSavingAlert(false);
    }
  };

  // ─── Delete stock alert ───
  const deleteAlert = async (id) => {
    if (!confirm('Alert l\u00f6schen?')) return;
    await supabase.from('stock_alerts').delete().eq('id', id);
    loadAlerts();
  };

  // Compute current stock for alert comparison
  const currentStockByTypeWarehouse = useMemo(() => {
    const map = {};
    stockData.forEach(s => {
      map[`${s.type}_Hauptlager`] = s.available;
    });
    return map;
  }, [stockData]);

  return (
    <div className="space-y-6">
      {/* ─── Stock Dashboard Grid ─── */}
      <div className="bg-surface-primary border border-border-secondary rounded-xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Package size={16} className="text-accent" />
            Aktueller Lagerbestand
          </h3>
          <button
            onClick={() => { loadStock(); loadLocations(); loadAlerts(); }}
            className="p-2 rounded-lg border border-border-secondary hover:bg-surface-secondary text-text-muted transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="text-accent animate-spin" />
            <span className="ml-2 text-xs text-text-muted">Lade Lagerbestand...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-secondary">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Typ</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium">Verf\u00fcgbar</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium">Defekt</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium">Reserviert</th>
                  <th className="text-center py-2 px-3 text-text-muted font-medium">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {stockData.map(s => {
                  const defect = defectCounts[s.type] || 0;
                  const reserved = reservedCounts[s.type] || 0;
                  const total = s.available + defect + reserved;
                  return (
                    <tr key={s.type} className="border-b border-border-secondary hover:bg-surface-secondary/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: s.color + '15', color: s.color, border: `1px solid ${s.color}33` }}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono font-bold text-status-online">{s.available}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-mono font-bold ${defect > 0 ? 'text-status-offline' : 'text-text-muted'}`}>{defect}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-mono font-bold ${reserved > 0 ? 'text-status-warning' : 'text-text-muted'}`}>{reserved}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono font-bold text-text-primary">{total}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Warehouse Locations ─── */}
      <div className="bg-surface-primary border border-border-secondary rounded-xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Warehouse size={16} className="text-accent" />
            Lagerpl\u00e4tze
          </h3>
          <button
            onClick={() => setShowLocationForm(!showLocationForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent text-white text-xs font-medium transition-colors shadow-sm"
          >
            <Plus size={14} />
            Lagerplatz
          </button>
        </div>

        {/* Add location form */}
        {showLocationForm && (
          <form onSubmit={handleSaveLocation} className="border border-border-secondary rounded-lg p-4 mb-4 space-y-3 bg-surface-primary">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Lager *</label>
                <input type="text" value={locationForm.warehouse}
                  onChange={e => setLocationForm({ ...locationForm, warehouse: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                  required />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Zone</label>
                <input type="text" value={locationForm.zone}
                  onChange={e => setLocationForm({ ...locationForm, zone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="z.B. A, B, C..." />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Regal</label>
                <input type="text" value={locationForm.shelf}
                  onChange={e => setLocationForm({ ...locationForm, shelf: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="z.B. R1, R2..." />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Name</label>
                <input type="text" value={locationForm.name}
                  onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                  placeholder="Bezeichnung" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Kapazit\u00e4t</label>
                <input type="number" min="1" value={locationForm.capacity}
                  onChange={e => setLocationForm({ ...locationForm, capacity: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20" />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Aktuell belegt</label>
                <input type="number" min="0" value={locationForm.current_count}
                  onChange={e => setLocationForm({ ...locationForm, current_count: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20" />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Typ</label>
                <select value={locationForm.type}
                  onChange={e => setLocationForm({ ...locationForm, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20">
                  <option value="allgemein">Allgemein</option>
                  <option value="ops">OPS Player</option>
                  <option value="display">Displays</option>
                  <option value="sim">SIM-Karten</option>
                  <option value="mount">Halterungen</option>
                  <option value="zubehoer">Zubeh\u00f6r</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={savingLocation}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent disabled:opacity-50 text-white text-xs font-medium transition-colors">
                {savingLocation ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Speichern
              </button>
              <button type="button" onClick={() => setShowLocationForm(false)}
                className="px-4 py-2 rounded-lg border border-border-secondary text-xs text-text-muted hover:bg-surface-secondary transition-colors">
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {loadingLocations ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="text-accent animate-spin" />
          </div>
        ) : locations.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-xs">Noch keine Lagerpl\u00e4tze definiert</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-secondary">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Lager</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Zone</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Regal</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Typ</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Belegung</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => {
                  const pct = loc.capacity > 0 ? Math.round((loc.current_count / loc.capacity) * 100) : 0;
                  const barColor = pct > 90 ? '#FF3B30' : pct > 70 ? '#FF9500' : '#34C759';
                  return (
                    <tr key={loc.id} className="border-b border-border-secondary hover:bg-surface-secondary/50 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-text-primary">{loc.warehouse}</td>
                      <td className="py-2.5 px-3 text-text-secondary">{loc.zone || '\u2013'}</td>
                      <td className="py-2.5 px-3 text-text-secondary">{loc.shelf || '\u2013'}</td>
                      <td className="py-2.5 px-3 text-text-secondary">{loc.name || '\u2013'}</td>
                      <td className="py-2.5 px-3 text-text-muted">{loc.type || 'allgemein'}</td>
                      <td className="py-2.5 px-3 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                          </div>
                          <span className="text-[10px] font-mono text-text-muted w-16 text-right">{loc.current_count}/{loc.capacity}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Stock Alerts ─── */}
      <div className="bg-surface-primary border border-border-secondary rounded-xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <AlertTriangle size={16} className="text-status-warning" />
            Bestandswarnungen
          </h3>
          <button
            onClick={() => setShowAlertForm(!showAlertForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-secondary hover:bg-surface-secondary text-xs font-medium text-text-secondary transition-colors"
          >
            <Plus size={14} />
            Alert konfigurieren
          </button>
        </div>

        {/* Alert form */}
        {showAlertForm && (
          <form onSubmit={handleSaveAlert} className="border border-border-secondary rounded-lg p-4 mb-4 space-y-3 bg-surface-primary">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Komponententyp</label>
                <select value={alertForm.component_type}
                  onChange={e => setAlertForm({ ...alertForm, component_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20">
                  {Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Lager</label>
                <input type="text" value={alertForm.warehouse}
                  onChange={e => setAlertForm({ ...alertForm, warehouse: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20" />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Mindestbestand</label>
                <input type="number" min="1" value={alertForm.min_stock}
                  onChange={e => setAlertForm({ ...alertForm, min_stock: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={savingAlert}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-warning hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium transition-colors">
                {savingAlert ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Alert speichern
              </button>
              <button type="button" onClick={() => setShowAlertForm(false)}
                className="px-4 py-2 rounded-lg border border-border-secondary text-xs text-text-muted hover:bg-surface-secondary transition-colors">
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {loadingAlerts ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="text-accent animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-4 text-text-muted text-xs">Keine Bestandswarnungen konfiguriert</div>
        ) : (
          <div className="space-y-2">
            {alerts.map(alert => {
              const typeInfo = COMPONENT_TYPES[alert.component_type] || { label: alert.component_type, color: '#64748b' };
              const currentStock = currentStockByTypeWarehouse[`${alert.component_type}_${alert.warehouse}`] || 0;
              const isLow = currentStock < alert.min_stock;
              return (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
                    isLow
                      ? 'bg-status-offline/10/80 border-status-offline/20 shadow-sm shadow-red-500/5'
                      : 'bg-surface-primary border-border-secondary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isLow && <AlertTriangle size={14} className="text-status-offline flex-shrink-0" />}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: typeInfo.color + '15', color: typeInfo.color, border: `1px solid ${typeInfo.color}33` }}
                    >
                      {typeInfo.label}
                    </span>
                    <span className="text-xs text-text-secondary">{alert.warehouse}</span>
                    <span className="text-xs text-text-muted">|</span>
                    <span className={`text-xs font-mono font-bold ${isLow ? 'text-status-offline' : 'text-status-online'}`}>
                      {currentStock}
                    </span>
                    <span className="text-xs text-text-muted">/ Min: {alert.min_stock}</span>
                  </div>
                  <button onClick={() => deleteAlert(alert.id)}
                    className="p-1 rounded hover:bg-surface-secondary text-text-muted hover:text-status-offline transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// =================================================================
// SUB-TAB 2: VERSAND (Shipping)
// =================================================================

function VersandTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Shipping form
  const [form, setForm] = useState({
    destination_type: 'installation',
    destination_name: '',
    destination_address: '',
    carrier: 'DHL',
    packaging_type: 'Paket',
    notes: '',
    created_by: '',
  });
  const [formItems, setFormItems] = useState([
    { component_type: 'ops', serial_number: '', qr_code: '' },
  ]);

  // Tracking modal
  const [trackingModal, setTrackingModal] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState('');

  // ─── Load shipping orders ───
  const loadOrders = useCallback(async (signal) => {
    setLoading(true);
    try {
      let query = supabase
        .from('shipping_orders')
        .select('*, shipping_order_items(count)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setOrders(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[Versand] Load error:', e);
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
  const kpis = useMemo(() => {
    const total = orders.length;
    const komm = orders.filter(o => o.status === 'kommissioniert').length;
    const versendet = orders.filter(o => o.status === 'versendet' || o.status === 'verpackt').length;
    const zugestellt = orders.filter(o => o.status === 'zugestellt').length;
    return { total, komm, versendet, zugestellt };
  }, [orders]);

  // ─── Filtered orders ───
  const filtered = useMemo(() => {
    if (!searchTerm) return orders;
    const q = searchTerm.toLowerCase();
    return orders.filter(o =>
      (o.shipping_id || '').toLowerCase().includes(q) ||
      (o.destination_name || '').toLowerCase().includes(q) ||
      (o.carrier || '').toLowerCase().includes(q) ||
      (o.tracking_number || '').toLowerCase().includes(q)
    );
  }, [orders, searchTerm]);

  // ─── Create shipping order ───
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (formItems.length === 0 || !formItems[0].serial_number) {
      alert('Mindestens ein Artikel mit Seriennummer erforderlich.');
      return;
    }
    setSaving(true);
    try {
      // 1. Generate shipping ID
      const { data: shippingId } = await supabase.rpc('generate_shipping_id');
      const sid = shippingId || `VS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

      // 2. Insert shipping order
      const { data: orderData, error: orderErr } = await supabase.from('shipping_orders').insert({
        shipping_id: sid,
        destination_type: form.destination_type,
        destination_name: form.destination_name,
        destination_address: form.destination_address,
        carrier: form.carrier,
        packaging_type: form.packaging_type,
        notes: form.notes || null,
        created_by: form.created_by || null,
        status: 'kommissioniert',
      }).select('id').single();
      if (orderErr) throw orderErr;

      // 3. Insert items
      const items = formItems
        .filter(it => it.serial_number.trim())
        .map(it => ({
          shipping_order_id: orderData.id,
          component_type: it.component_type,
          serial_number: it.serial_number.trim(),
          qr_code: it.qr_code || null,
          pick_status: false,
        }));

      if (items.length > 0) {
        const { error: itemsErr } = await supabase.from('shipping_order_items').insert(items);
        if (itemsErr) throw itemsErr;
      }

      // Reset form
      setShowForm(false);
      setForm({
        destination_type: 'installation',
        destination_name: '',
        destination_address: '',
        carrier: 'DHL',
        packaging_type: 'Paket',
        notes: '',
        created_by: '',
      });
      setFormItems([{ component_type: 'ops', serial_number: '', qr_code: '' }]);
      loadOrders();
    } catch (e) {
      console.error('[Versand] Create error:', e);
      alert('Fehler beim Erstellen: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Add / remove form items ───
  const addFormItem = () => {
    setFormItems([...formItems, { component_type: 'ops', serial_number: '', qr_code: '' }]);
  };
  const removeFormItem = (index) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };
  const updateFormItem = (index, field, value) => {
    setFormItems(formItems.map((it, i) => i === index ? { ...it, [field]: value } : it));
  };

  // ─── Open detail modal ───
  const openDetail = async (order) => {
    setDetailOrder(order);
    setLoadingDetail(true);
    try {
      const { data, error } = await supabase
        .from('shipping_order_items')
        .select('*')
        .eq('shipping_order_id', order.id)
        .order('created_at', { ascending: true });
      if (!error) setDetailItems(data || []);
    } catch (e) {
      console.error('[Detail] Load error:', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  // ─── Toggle pick status ───
  const togglePickStatus = async (itemId, currentStatus) => {
    await supabase.from('shipping_order_items').update({ pick_status: !currentStatus }).eq('id', itemId);
    setDetailItems(prev => prev.map(it => it.id === itemId ? { ...it, pick_status: !currentStatus } : it));
  };

  // ─── Mark as versendet ───
  const markAsVersendet = async () => {
    if (!trackingNumber.trim()) {
      alert('Bitte Tracking-Nummer eingeben.');
      return;
    }
    try {
      await supabase.from('shipping_orders').update({
        status: 'versendet',
        tracking_number: trackingNumber.trim(),
        shipped_at: new Date().toISOString(),
      }).eq('id', trackingModal.id);

      // Update hardware positions to 'versand'
      for (const item of detailItems) {
        await supabase.from('hardware_positions')
          .update({ is_current: false })
          .eq('serial_number', item.serial_number)
          .eq('is_current', true);

        await supabase.from('hardware_positions').insert({
          component_type: item.component_type,
          serial_number: item.serial_number,
          position: 'versand',
          sub_position: trackingModal.carrier || null,
          moved_by: 'Versand-System',
          move_reason: 'shipping',
          reference_id: trackingModal.shipping_id,
          is_current: true,
        });
      }

      setTrackingModal(null);
      setTrackingNumber('');
      setDetailOrder(prev => prev ? { ...prev, status: 'versendet', tracking_number: trackingNumber.trim() } : null);
      loadOrders();
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  };

  // ─── Mark as zugestellt ───
  const markAsZugestellt = async () => {
    if (!detailOrder) return;
    try {
      await supabase.from('shipping_orders').update({
        status: 'zugestellt',
        delivered_at: new Date().toISOString(),
      }).eq('id', detailOrder.id);

      // Update hardware positions
      const targetPosition = detailOrder.destination_type === 'partner-lager' ? 'lager' : 'standort';
      for (const item of detailItems) {
        await supabase.from('hardware_positions')
          .update({ is_current: false })
          .eq('serial_number', item.serial_number)
          .eq('is_current', true);

        await supabase.from('hardware_positions').insert({
          component_type: item.component_type,
          serial_number: item.serial_number,
          position: targetPosition,
          sub_position: detailOrder.destination_name || null,
          moved_by: 'Versand-System',
          move_reason: 'delivery',
          reference_id: detailOrder.shipping_id,
          is_current: true,
        });
      }

      setDetailOrder(prev => prev ? { ...prev, status: 'zugestellt' } : null);
      loadOrders();
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gesamt" value={kpis.total} color="#007AFF" />
        <KpiCard label="Kommissioniert" value={kpis.komm} color="#64748b" />
        <KpiCard label="Versendet" value={kpis.versendet} color="#FF9500" />
        <KpiCard label="Zugestellt" value={kpis.zugestellt} color="#34C759" />
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="VS-ID, Ziel, Spediteur, Tracking..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-secondary bg-surface-primary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20" />
          </div>
          <button onClick={loadOrders} className="p-2 rounded-lg border border-border-secondary hover:bg-surface-secondary text-text-muted" title="Aktualisieren">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent text-white text-xs font-medium transition-colors shadow-sm">
          <Plus size={14} />
          Neue Sendung
        </button>
      </div>

      {/* ─── New Shipping Order Form ─── */}
      {showForm && (
        <form onSubmit={handleCreateOrder} className="bg-surface-primary border border-border-secondary rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Send size={16} className="text-accent" />
            Neue Versandbestellung
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Zieltyp *</label>
              <select value={form.destination_type}
                onChange={e => setForm({ ...form, destination_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20">
                <option value="installation">Installation</option>
                <option value="partner-lager">Partner-Lager</option>
                <option value="ruecksendung">R\u00fccksendung</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Ziel-Name *</label>
              <input type="text" value={form.destination_name}
                onChange={e => setForm({ ...form, destination_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Name des Ziels" required />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Ziel-Adresse</label>
              <input type="text" value={form.destination_address}
                onChange={e => setForm({ ...form, destination_address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Stra\u00dfe, PLZ Ort" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Spediteur</label>
              <select value={form.carrier}
                onChange={e => setForm({ ...form, carrier: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20">
                <option value="DHL">DHL</option>
                <option value="UPS">UPS</option>
                <option value="DPD">DPD</option>
                <option value="Hermes">Hermes</option>
                <option value="Selbstabholung">Selbstabholung</option>
                <option value="Sonstiges">Sonstiges</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Verpackungsart</label>
              <select value={form.packaging_type}
                onChange={e => setForm({ ...form, packaging_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20">
                <option value="Paket">Paket</option>
                <option value="Palette">Palette</option>
                <option value="Express">Express</option>
                <option value="Sonstiges">Sonstiges</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Erstellt von</label>
              <input type="text" value={form.created_by}
                onChange={e => setForm({ ...form, created_by: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Dein Name" />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">Notizen</label>
            <textarea value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
              rows={2} placeholder="Optionale Anmerkungen..." />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-secondary font-semibold">Artikel</label>
              <button type="button" onClick={addFormItem}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-accent hover:bg-accent-light border border-accent/20/50 transition-colors">
                <Plus size={12} />
                Artikel hinzuf\u00fcgen
              </button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 border border-border-secondary rounded-lg bg-surface-primary/60">
                  <select value={item.component_type}
                    onChange={e => updateFormItem(idx, 'component_type', e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-border-secondary text-xs w-32">
                    {Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input type="text" value={item.serial_number}
                    onChange={e => updateFormItem(idx, 'serial_number', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-border-secondary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
                    placeholder="Seriennummer *" />
                  <input type="text" value={item.qr_code}
                    onChange={e => updateFormItem(idx, 'qr_code', e.target.value)}
                    className="w-32 px-2 py-1.5 rounded-lg border border-border-secondary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
                    placeholder="QR-Code" />
                  {formItems.length > 1 && (
                    <button type="button" onClick={() => removeFormItem(idx)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-status-offline hover:bg-status-offline/10 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent disabled:opacity-50 text-white text-xs font-medium transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Sendung erstellen
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-border-secondary text-xs text-text-muted hover:bg-surface-secondary transition-colors">
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* ─── Shipping Orders Table ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-accent animate-spin" />
          <span className="ml-2 text-xs text-text-muted">Lade Versandauftr\u00e4ge...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-xs">
          {orders.length === 0 ? 'Noch keine Versandauftr\u00e4ge' : 'Keine Treffer f\u00fcr die Suche'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-secondary">
                <th className="text-left py-2 px-3 text-text-muted font-medium">VS-ID</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Datum</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Ziel</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Spediteur</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Tracking</th>
                <th className="text-center py-2 px-3 text-text-muted font-medium">Items</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Status</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const itemCount = order.shipping_order_items?.[0]?.count || 0;
                return (
                  <tr key={order.id} className="border-b border-border-secondary hover:bg-surface-secondary/50 transition-colors cursor-pointer"
                    onClick={() => openDetail(order)}>
                    <td className="py-2 px-3 font-mono text-accent font-medium">{order.shipping_id}</td>
                    <td className="py-2 px-3 font-mono text-text-secondary">{new Date(order.created_at).toLocaleDateString('de-DE')}</td>
                    <td className="py-2 px-3 text-text-primary">
                      <div>{order.destination_name}</div>
                      <div className="text-[10px] text-text-muted">{order.destination_type}</div>
                    </td>
                    <td className="py-2 px-3 text-text-secondary">{order.carrier || '\u2013'}</td>
                    <td className="py-2 px-3 font-mono text-text-secondary text-[11px]">{order.tracking_number || '\u2013'}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-text-secondary">{itemCount}</td>
                    <td className="py-2 px-3">
                      <StatusBadge status={order.status} config={SHIPPING_STATUS} />
                    </td>
                    <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openDetail(order)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-surface-secondary text-text-secondary hover:bg-surface-secondary border border-border-secondary transition-colors">
                        <Eye size={10} />
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Detail Modal ─── */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setDetailOrder(null)}>
          <div className="bg-surface-primary rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-surface-primary border-b border-border-secondary px-5 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Send size={16} className="text-accent" />
                  Versandauftrag {detailOrder.shipping_id}
                </h3>
                <div className="text-xs text-text-muted mt-0.5">
                  Erstellt am {new Date(detailOrder.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button onClick={() => setDetailOrder(null)} className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-muted">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Order info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-text-muted">Zieltyp:</span>
                  <span className="ml-2 text-text-primary font-medium">{detailOrder.destination_type}</span>
                </div>
                <div>
                  <span className="text-text-muted">Ziel:</span>
                  <span className="ml-2 text-text-primary font-medium">{detailOrder.destination_name}</span>
                </div>
                <div>
                  <span className="text-text-muted">Adresse:</span>
                  <span className="ml-2 text-text-primary">{detailOrder.destination_address || '\u2013'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Spediteur:</span>
                  <span className="ml-2 text-text-primary">{detailOrder.carrier || '\u2013'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Tracking:</span>
                  <span className="ml-2 text-text-primary font-mono">{detailOrder.tracking_number || '\u2013'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Status:</span>
                  <span className="ml-2"><StatusBadge status={detailOrder.status} config={SHIPPING_STATUS} /></span>
                </div>
                <div>
                  <span className="text-text-muted">Verpackung:</span>
                  <span className="ml-2 text-text-primary">{detailOrder.packaging_type || '\u2013'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Erstellt von:</span>
                  <span className="ml-2 text-text-primary">{detailOrder.created_by || '\u2013'}</span>
                </div>
              </div>

              {detailOrder.notes && (
                <div className="text-xs bg-surface-secondary p-3 rounded-lg border border-border-secondary">
                  <span className="text-text-muted font-medium">Notizen: </span>
                  <span className="text-text-primary">{detailOrder.notes}</span>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="text-xs font-semibold text-text-primary mb-2">Artikel</h4>
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={14} className="text-accent animate-spin" />
                  </div>
                ) : detailItems.length === 0 ? (
                  <div className="text-xs text-text-muted text-center py-4">Keine Artikel</div>
                ) : (
                  <div className="space-y-1.5">
                    {detailItems.map(item => {
                      const typeInfo = COMPONENT_TYPES[item.component_type] || { label: item.component_type, color: '#64748b' };
                      return (
                        <div key={item.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                            item.pick_status ? 'bg-status-online/10/50 border-status-online/20/60' : 'bg-surface-primary border-border-secondary'
                          }`}
                        >
                          <button onClick={() => togglePickStatus(item.id, item.pick_status)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                              item.pick_status
                                ? 'bg-status-online border-status-online text-white'
                                : 'border-border-primary hover:border-blue-400'
                            }`}>
                            {item.pick_status && <CheckCircle2 size={12} />}
                          </button>
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ backgroundColor: typeInfo.color + '15', color: typeInfo.color, border: `1px solid ${typeInfo.color}33` }}
                          >
                            {typeInfo.label}
                          </span>
                          <span className="font-mono text-xs text-text-primary">{item.serial_number}</span>
                          {item.qr_code && (
                            <span className="font-mono text-[10px] text-text-muted">{item.qr_code}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-border-secondary">
                {(detailOrder.status === 'kommissioniert' || detailOrder.status === 'verpackt') && (
                  <button onClick={() => { setTrackingModal(detailOrder); setTrackingNumber(detailOrder.tracking_number || ''); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-warning hover:bg-amber-600 text-white text-xs font-medium transition-colors">
                    <Truck size={14} />
                    Als versendet markieren
                  </button>
                )}
                {detailOrder.status === 'versendet' && (
                  <button onClick={markAsZugestellt}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-status-online hover:bg-status-online text-white text-xs font-medium transition-colors">
                    <CheckCircle2 size={14} />
                    Als zugestellt markieren
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Tracking Number Modal ─── */}
      {trackingModal && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4" onClick={() => setTrackingModal(null)}>
          <div className="bg-surface-primary rounded-xl max-w-md w-full p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
              <Truck size={16} className="text-status-warning" />
              Tracking-Nummer eingeben
            </h3>
            <div className="text-xs text-text-muted mb-4">
              Sendung <span className="font-mono text-accent font-medium">{trackingModal.shipping_id}</span> als versendet markieren
            </div>
            <input type="text" value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/20 mb-4"
              placeholder="Tracking-Nummer eingeben" autoFocus />
            <div className="flex items-center gap-2">
              <button onClick={markAsVersendet} disabled={!trackingNumber.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-status-warning hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium transition-colors">
                Best\u00e4tigen
              </button>
              <button onClick={() => setTrackingModal(null)}
                className="px-4 py-2 rounded-lg border border-border-secondary text-xs text-text-muted hover:bg-surface-secondary transition-colors">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// =================================================================
// SUB-TAB 3: RUECKSENDUNGEN (Returns)
// =================================================================

function RuecksendungenTab() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Detail / inspection modal
  const [detailReturn, setDetailReturn] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [inspecting, setInspecting] = useState(false);

  // Return form
  const [form, setForm] = useState({
    source_type: 'standort',
    source_name: '',
    reason: 'defekt',
    reference: '',
    carrier: '',
    tracking_number: '',
  });
  const [formItems, setFormItems] = useState([
    { component_type: 'ops', serial_number: '', qr_code: '' },
  ]);

  // ─── Load returns ───
  const loadReturns = useCallback(async (signal) => {
    setLoading(true);
    try {
      let query = supabase
        .from('return_orders')
        .select('*, return_order_items(count)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (signal?.aborted) return;
      if (!error) setReturns(data || []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error('[R\u00fccksendungen] Load error:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadReturns(controller.signal);
    return () => controller.abort();
  }, [loadReturns]);

  // ─── KPIs ───
  const kpis = useMemo(() => {
    const total = returns.length;
    const erwartet = returns.filter(r => r.status === 'erwartet').length;
    const eingegangen = returns.filter(r => r.status === 'eingegangen').length;
    const geprueft = returns.filter(r => r.status === 'geprueft' || r.status === 'entschieden').length;
    return { total, erwartet, eingegangen, geprueft };
  }, [returns]);

  // ─── Filtered ───
  const filtered = useMemo(() => {
    if (!searchTerm) return returns;
    const q = searchTerm.toLowerCase();
    return returns.filter(r =>
      (r.return_id || '').toLowerCase().includes(q) ||
      (r.source_name || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q)
    );
  }, [returns, searchTerm]);

  // ─── Create return order ───
  const handleCreateReturn = async (e) => {
    e.preventDefault();
    if (formItems.length === 0 || !formItems[0].serial_number) {
      alert('Mindestens ein Artikel mit Seriennummer erforderlich.');
      return;
    }
    setSaving(true);
    try {
      // 1. Generate return ID
      const { data: returnId } = await supabase.rpc('generate_return_id');
      const rid = returnId || `RMA-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

      // 2. Insert return order
      const { data: orderData, error: orderErr } = await supabase.from('return_orders').insert({
        return_id: rid,
        source_type: form.source_type,
        source_name: form.source_name,
        reason: form.reason,
        reference: form.reference || null,
        carrier: form.carrier || null,
        tracking_number: form.tracking_number || null,
        status: 'erwartet',
      }).select('id').single();
      if (orderErr) throw orderErr;

      // 3. Insert items
      const items = formItems
        .filter(it => it.serial_number.trim())
        .map(it => ({
          return_order_id: orderData.id,
          component_type: it.component_type,
          serial_number: it.serial_number.trim(),
          qr_code: it.qr_code || null,
          condition: null,
          condition_notes: null,
        }));

      if (items.length > 0) {
        const { error: itemsErr } = await supabase.from('return_order_items').insert(items);
        if (itemsErr) throw itemsErr;
      }

      // 4. Create position entries
      for (const it of formItems.filter(it => it.serial_number.trim())) {
        await supabase.from('hardware_positions')
          .update({ is_current: false })
          .eq('serial_number', it.serial_number.trim())
          .eq('is_current', true);

        await supabase.from('hardware_positions').insert({
          component_type: it.component_type,
          serial_number: it.serial_number.trim(),
          position: 'ruecksendung',
          moved_by: 'R\u00fccksendung-System',
          move_reason: 'return',
          reference_id: rid,
          is_current: true,
        });
      }

      // Reset form
      setShowForm(false);
      setForm({
        source_type: 'standort',
        source_name: '',
        reason: 'defekt',
        reference: '',
        carrier: '',
        tracking_number: '',
      });
      setFormItems([{ component_type: 'ops', serial_number: '', qr_code: '' }]);
      loadReturns();
    } catch (e) {
      console.error('[R\u00fccksendungen] Create error:', e);
      alert('Fehler beim Erstellen: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Form item management ───
  const addFormItem = () => {
    setFormItems([...formItems, { component_type: 'ops', serial_number: '', qr_code: '' }]);
  };
  const removeFormItem = (index) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };
  const updateFormItem = (index, field, value) => {
    setFormItems(formItems.map((it, i) => i === index ? { ...it, [field]: value } : it));
  };

  // ─── Open detail / inspection ───
  const openDetail = async (ret) => {
    setDetailReturn(ret);
    setLoadingDetail(true);
    try {
      const { data, error } = await supabase
        .from('return_order_items')
        .select('*')
        .eq('return_order_id', ret.id)
        .order('created_at', { ascending: true });
      if (!error) setDetailItems(data || []);
    } catch (e) {
      console.error('[Detail] Load error:', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  // ─── Update item condition (inspection) ───
  const updateItemCondition = async (itemId, field, value) => {
    await supabase.from('return_order_items').update({ [field]: value }).eq('id', itemId);
    setDetailItems(prev => prev.map(it => it.id === itemId ? { ...it, [field]: value } : it));
  };

  // ─── Mark return as eingegangen ───
  const markAsEingegangen = async () => {
    if (!detailReturn) return;
    try {
      await supabase.from('return_orders').update({
        status: 'eingegangen',
        received_at: new Date().toISOString(),
      }).eq('id', detailReturn.id);
      setDetailReturn(prev => prev ? { ...prev, status: 'eingegangen' } : null);
      loadReturns();
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  };

  // ─── Complete inspection ───
  const completeInspection = async (inspectionResult) => {
    if (!detailReturn) return;
    setInspecting(true);
    try {
      await supabase.from('return_orders').update({
        status: 'geprueft',
        inspection_result: inspectionResult,
        inspected_at: new Date().toISOString(),
      }).eq('id', detailReturn.id);
      setDetailReturn(prev => prev ? { ...prev, status: 'geprueft', inspection_result: inspectionResult } : null);
      loadReturns();
    } catch (e) {
      alert('Fehler: ' + e.message);
    } finally {
      setInspecting(false);
    }
  };

  // ─── Decision actions ───
  const handleDecision = async (decision) => {
    if (!detailReturn) return;
    try {
      await supabase.from('return_orders').update({
        status: 'entschieden',
        decision,
        decided_at: new Date().toISOString(),
      }).eq('id', detailReturn.id);

      // Update positions based on decision
      const positionMap = {
        lager: 'lager',
        reparatur: 'reparatur',
        entsorgung: 'entsorgung',
        lieferant: 'zulieferung',
      };
      const targetPosition = positionMap[decision] || 'lager';

      for (const item of detailItems) {
        await supabase.from('hardware_positions')
          .update({ is_current: false })
          .eq('serial_number', item.serial_number)
          .eq('is_current', true);

        await supabase.from('hardware_positions').insert({
          component_type: item.component_type,
          serial_number: item.serial_number,
          position: targetPosition,
          moved_by: 'R\u00fccksendung-System',
          move_reason: `return_decision_${decision}`,
          reference_id: detailReturn.return_id,
          is_current: true,
        });
      }

      setDetailReturn(prev => prev ? { ...prev, status: 'entschieden', decision } : null);
      loadReturns();
    } catch (e) {
      alert('Fehler: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Gesamt" value={kpis.total} color="#007AFF" />
        <KpiCard label="Erwartet" value={kpis.erwartet} color="#64748b" />
        <KpiCard label="Eingegangen" value={kpis.eingegangen} color="#007AFF" />
        <KpiCard label="Gepr\u00fcft" value={kpis.geprueft} color="#34C759" />
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="RMA-ID, Quelle, Grund..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-secondary bg-surface-primary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20" />
          </div>
          <button onClick={loadReturns} className="p-2 rounded-lg border border-border-secondary hover:bg-surface-secondary text-text-muted" title="Aktualisieren">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent text-white text-xs font-medium transition-colors shadow-sm">
          <Plus size={14} />
          Neue R\u00fccksendung
        </button>
      </div>

      {/* ─── New Return Form ─── */}
      {showForm && (
        <form onSubmit={handleCreateReturn} className="bg-surface-primary border border-border-secondary rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <RotateCcw size={16} className="text-accent" />
            Neue R\u00fccksendung erfassen
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Quelle *</label>
              <select value={form.source_type}
                onChange={e => setForm({ ...form, source_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20">
                <option value="standort">Standort</option>
                <option value="partner">Partner</option>
                <option value="techniker">Techniker</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Quell-Name *</label>
              <input type="text" value={form.source_name}
                onChange={e => setForm({ ...form, source_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Name / Bezeichnung" required />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Grund *</label>
              <select value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20">
                {RETURN_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Referenz</label>
              <input type="text" value={form.reference}
                onChange={e => setForm({ ...form, reference: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Swap/Deinstall-ID" />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Spediteur</label>
              <input type="text" value={form.carrier}
                onChange={e => setForm({ ...form, carrier: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="DHL, UPS, ..." />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Tracking</label>
              <input type="text" value={form.tracking_number}
                onChange={e => setForm({ ...form, tracking_number: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="Tracking-Nummer" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-text-secondary font-semibold">Artikel</label>
              <button type="button" onClick={addFormItem}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-accent hover:bg-accent-light border border-accent/20/50 transition-colors">
                <Plus size={12} />
                Artikel hinzuf\u00fcgen
              </button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 border border-border-secondary rounded-lg bg-surface-primary/60">
                  <select value={item.component_type}
                    onChange={e => updateFormItem(idx, 'component_type', e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-border-secondary text-xs w-32">
                    {Object.entries(COMPONENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input type="text" value={item.serial_number}
                    onChange={e => updateFormItem(idx, 'serial_number', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-border-secondary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
                    placeholder="Seriennummer *" />
                  <input type="text" value={item.qr_code}
                    onChange={e => updateFormItem(idx, 'qr_code', e.target.value)}
                    className="w-32 px-2 py-1.5 rounded-lg border border-border-secondary text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/20"
                    placeholder="QR-Code" />
                  {formItems.length > 1 && (
                    <button type="button" onClick={() => removeFormItem(idx)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-status-offline hover:bg-status-offline/10 transition-colors">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent disabled:opacity-50 text-white text-xs font-medium transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              R\u00fccksendung erstellen
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-border-secondary text-xs text-text-muted hover:bg-surface-secondary transition-colors">
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* ─── Returns Table ─── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="text-accent animate-spin" />
          <span className="ml-2 text-xs text-text-muted">Lade R\u00fccksendungen...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-xs">
          {returns.length === 0 ? 'Noch keine R\u00fccksendungen' : 'Keine Treffer f\u00fcr die Suche'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-secondary">
                <th className="text-left py-2 px-3 text-text-muted font-medium">RMA-ID</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Datum</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Quelle</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Grund</th>
                <th className="text-center py-2 px-3 text-text-muted font-medium">Items</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Status</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Pr\u00fcfergebnis</th>
                <th className="text-left py-2 px-3 text-text-muted font-medium">Entscheidung</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ret => {
                const itemCount = ret.return_order_items?.[0]?.count || 0;
                const reasonInfo = RETURN_REASONS.find(r => r.value === ret.reason);
                return (
                  <tr key={ret.id} className="border-b border-border-secondary hover:bg-surface-secondary/50 transition-colors cursor-pointer"
                    onClick={() => openDetail(ret)}>
                    <td className="py-2 px-3 font-mono text-accent font-medium">{ret.return_id}</td>
                    <td className="py-2 px-3 font-mono text-text-secondary">{new Date(ret.created_at).toLocaleDateString('de-DE')}</td>
                    <td className="py-2 px-3 text-text-primary">
                      <div>{ret.source_name}</div>
                      <div className="text-[10px] text-text-muted">{ret.source_type}</div>
                    </td>
                    <td className="py-2 px-3 text-text-secondary">{reasonInfo?.label || ret.reason}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-text-secondary">{itemCount}</td>
                    <td className="py-2 px-3">
                      <StatusBadge status={ret.status} config={RETURN_STATUS} />
                    </td>
                    <td className="py-2 px-3 text-text-secondary text-[11px]">{ret.inspection_result || '\u2013'}</td>
                    <td className="py-2 px-3 text-text-secondary text-[11px]">{ret.decision || '\u2013'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Detail / Inspection Modal ─── */}
      {detailReturn && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setDetailReturn(null)}>
          <div className="bg-surface-primary rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-surface-primary border-b border-border-secondary px-5 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <RotateCcw size={16} className="text-accent" />
                  R\u00fccksendung {detailReturn.return_id}
                </h3>
                <div className="text-xs text-text-muted mt-0.5">
                  <StatusBadge status={detailReturn.status} config={RETURN_STATUS} />
                </div>
              </div>
              <button onClick={() => setDetailReturn(null)} className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-muted">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Return info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-text-muted">Quelle:</span>
                  <span className="ml-2 text-text-primary font-medium">{detailReturn.source_name} ({detailReturn.source_type})</span>
                </div>
                <div>
                  <span className="text-text-muted">Grund:</span>
                  <span className="ml-2 text-text-primary font-medium">{RETURN_REASONS.find(r => r.value === detailReturn.reason)?.label || detailReturn.reason}</span>
                </div>
                <div>
                  <span className="text-text-muted">Referenz:</span>
                  <span className="ml-2 text-text-primary font-mono">{detailReturn.reference || '\u2013'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Spediteur:</span>
                  <span className="ml-2 text-text-primary">{detailReturn.carrier || '\u2013'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Tracking:</span>
                  <span className="ml-2 text-text-primary font-mono">{detailReturn.tracking_number || '\u2013'}</span>
                </div>
                {detailReturn.inspection_result && (
                  <div>
                    <span className="text-text-muted">Pr\u00fcfergebnis:</span>
                    <span className="ml-2 text-text-primary font-medium">{detailReturn.inspection_result}</span>
                  </div>
                )}
                {detailReturn.decision && (
                  <div>
                    <span className="text-text-muted">Entscheidung:</span>
                    <span className="ml-2 text-text-primary font-medium capitalize">{detailReturn.decision}</span>
                  </div>
                )}
              </div>

              {/* Items with inspection */}
              <div>
                <h4 className="text-xs font-semibold text-text-primary mb-2">
                  Artikel {detailReturn.status === 'eingegangen' && '(Pr\u00fcfung)'}
                </h4>
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={14} className="text-accent animate-spin" />
                  </div>
                ) : detailItems.length === 0 ? (
                  <div className="text-xs text-text-muted text-center py-4">Keine Artikel</div>
                ) : (
                  <div className="space-y-2">
                    {detailItems.map(item => {
                      const typeInfo = COMPONENT_TYPES[item.component_type] || { label: item.component_type, color: '#64748b' };
                      const condInfo = ITEM_CONDITIONS.find(c => c.value === item.condition);
                      return (
                        <div key={item.id} className="p-3 border border-border-secondary rounded-lg bg-surface-primary space-y-2">
                          <div className="flex items-center gap-3">
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                              style={{ backgroundColor: typeInfo.color + '15', color: typeInfo.color, border: `1px solid ${typeInfo.color}33` }}
                            >
                              {typeInfo.label}
                            </span>
                            <span className="font-mono text-xs text-text-primary">{item.serial_number}</span>
                            {item.qr_code && (
                              <span className="font-mono text-[10px] text-text-muted">{item.qr_code}</span>
                            )}
                            {condInfo && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ml-auto"
                                style={{ backgroundColor: condInfo.color + '15', color: condInfo.color, border: `1px solid ${condInfo.color}33` }}
                              >
                                {condInfo.label}
                              </span>
                            )}
                          </div>

                          {/* Inspection fields (only for eingegangen status) */}
                          {(detailReturn.status === 'eingegangen' || detailReturn.status === 'geprueft') && (
                            <div className="flex items-center gap-3 pt-1">
                              <select
                                value={item.condition || ''}
                                onChange={e => updateItemCondition(item.id, 'condition', e.target.value)}
                                className="px-2 py-1 rounded-lg border border-border-secondary text-xs"
                              >
                                <option value="">Zustand w\u00e4hlen...</option>
                                {ITEM_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                              <input
                                type="text"
                                value={item.condition_notes || ''}
                                onChange={e => updateItemCondition(item.id, 'condition_notes', e.target.value)}
                                className="flex-1 px-2 py-1 rounded-lg border border-border-secondary text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                                placeholder="Anmerkungen..."
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-secondary">
                {detailReturn.status === 'erwartet' && (
                  <button onClick={markAsEingegangen}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent text-white text-xs font-medium transition-colors">
                    <Package size={14} />
                    Als eingegangen markieren
                  </button>
                )}

                {detailReturn.status === 'eingegangen' && (
                  <>
                    <button onClick={() => completeInspection('ok')} disabled={inspecting}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-online hover:bg-status-online disabled:opacity-50 text-white text-xs font-medium transition-colors">
                      <CheckCircle2 size={14} />
                      Pr\u00fcfung: OK
                    </button>
                    <button onClick={() => completeInspection('teilweise_defekt')} disabled={inspecting}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-warning hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium transition-colors">
                      <AlertTriangle size={14} />
                      Teilweise defekt
                    </button>
                    <button onClick={() => completeInspection('defekt')} disabled={inspecting}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-offline hover:bg-status-offline disabled:opacity-50 text-white text-xs font-medium transition-colors">
                      <AlertCircle size={14} />
                      Komplett defekt
                    </button>
                  </>
                )}

                {detailReturn.status === 'geprueft' && (
                  <>
                    <span className="text-xs text-text-muted mr-1">Entscheidung:</span>
                    <button onClick={() => handleDecision('lager')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent hover:bg-accent text-white text-xs font-medium transition-colors">
                      <ArrowRight size={12} />
                      Lager
                    </button>
                    <button onClick={() => handleDecision('reparatur')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-warning hover:bg-amber-600 text-white text-xs font-medium transition-colors">
                      <ArrowRight size={12} />
                      Reparatur
                    </button>
                    <button onClick={() => handleDecision('entsorgung')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-status-offline hover:bg-status-offline text-white text-xs font-medium transition-colors">
                      <ArrowRight size={12} />
                      Entsorgung
                    </button>
                    <button onClick={() => handleDecision('lieferant')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-secondary0 hover:bg-surface-tertiary text-white text-xs font-medium transition-colors">
                      <ArrowRight size={12} />
                      An Lieferant
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// =================================================================
// MAIN COMPONENT: LagerVersandTab
// =================================================================

const SUB_TABS = [
  { id: 'lager',          label: 'Lagerbestand',     icon: Package },
  { id: 'versand',        label: 'Versand',          icon: Truck },
  { id: 'ruecksendungen', label: 'R\u00fccksendungen',   icon: RotateCcw },
];

export default function LagerVersandTab() {
  const [activeSubTab, setActiveSubTab] = useState('lager');

  return (
    <div className="space-y-4">
      {/* Sub-tab pills */}
      <div className="flex items-center gap-0 bg-surface-primary border border-border-secondary rounded-xl p-1 overflow-x-auto">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center whitespace-nowrap ${
                isActive
                  ? 'bg-surface-primary shadow-sm text-text-primary border border-border-secondary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'lager' && <LagerbestandTab />}
      {activeSubTab === 'versand' && <VersandTab />}
      {activeSubTab === 'ruecksendungen' && <RuecksendungenTab />}
    </div>
  );
}
