import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Plus, ChevronLeft, ChevronRight, Trash2, Edit2, X, MapPin, Users, Clock,
  Settings, Loader2, AlertCircle, CheckCircle, List, LayoutGrid,
} from 'lucide-react';
import { INSTALL_API, toDateString, formatDateShort as formatDate, mergeAirtableTermine } from '../utils/installUtils';
import { fetchAllInstallationstermine } from '../utils/airtableService';

const CITY_COLORS = {
  Berlin: '#3b82f6', Hamburg: '#22c55e', München: '#f59e0b', Frankfurt: '#ef4444',
  Köln: '#8b5cf6', Düsseldorf: '#ec4899', Stuttgart: '#14b8a6', Hannover: '#f97316',
  Leipzig: '#6366f1', Dresden: '#84cc16', Nürnberg: '#06b6d4', Bremen: '#a855f7',
};

const DEFAULT_TIME_SLOTS = ['09:00', '11:00', '14:00', '16:00'];

function getCityColor(city) {
  return CITY_COLORS[city] || '#64748b';
}

function groupByKey(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}

function RouteStatusBadge({ status }) {
  let className = 'bg-gray-100 text-gray-600';
  if (status === 'open') className = 'bg-green-100 text-green-700';
  else if (status === 'full') className = 'bg-red-100 text-red-700';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {status === 'open' ? 'Offen' : status === 'full' ? 'Voll' : status}
    </span>
  );
}

function CapacityBar({ booked, capacity }) {
  if (capacity <= 0 || booked <= 0) return null;
  const pct = Math.min(100, Math.round((booked / capacity) * 100));
  let barColor = 'bg-green-400';
  if (pct >= 100) barColor = 'bg-red-400';
  else if (pct >= 70) barColor = 'bg-amber-400';
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Get all days of a month */
function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];
  // Pad with previous month days for alignment (week starts Monday)
  const startPad = (firstDay.getDay() + 6) % 7;
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, isCurrentMonth: false });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  // Pad to fill last week
  const endPad = 7 - (days.length % 7);
  if (endPad < 7) {
    for (let i = 1; i <= endPad; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
  }
  return days;
}

// ── Team Management Modal ──
function TeamManageModal({ teams, onClose, onRefresh, showToast }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#FF8000');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const TEAM_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#FF8000'];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${INSTALL_API.SCHEDULE}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor, description: newDesc.trim() || null }),
      });
      if (res.ok) {
        setNewName('');
        setNewDesc('');
        onRefresh();
        showToast?.('Team erfolgreich erstellt.');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Fehler beim Erstellen');
      }
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Team wirklich löschen?')) return;
    const res = await fetch(`${INSTALL_API.SCHEDULE}/teams/${id}`, { method: 'DELETE' });
    onRefresh();
    if (res.ok) showToast?.('Team geloescht.');
    else showToast?.('Fehler beim Loeschen.', 'error');
  };

  const handleToggle = async (team) => {
    const res = await fetch(`${INSTALL_API.SCHEDULE}/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !team.is_active }),
    });
    onRefresh();
    if (res.ok) showToast?.(`Team "${team.name}" ${!team.is_active ? 'aktiviert' : 'deaktiviert'}.`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users size={20} className="text-orange-500" /> Teams verwalten
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Existing Teams */}
          {teams.length === 0 ? (
            <div className="text-center text-gray-400 py-4 text-sm">
              Noch keine Teams angelegt. Erstelle dein erstes Team!
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: t.color || '#FF8000' }} />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${t.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                      {t.name}
                    </div>
                    {t.description && <div className="text-xs text-gray-400 truncate">{t.description}</div>}
                  </div>
                  <button
                    onClick={() => handleToggle(t)}
                    className={`px-2 py-0.5 rounded text-xs font-medium border ${
                      t.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}
                  >
                    {t.is_active ? 'Aktiv' : 'Inaktiv'}
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Create New */}
          <div className="border-t pt-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Neues Team</div>
            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Teamname (z.B. Team Alpha)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Beschreibung (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Farbe:</span>
                {TEAM_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${newColor === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {error && (
                <div className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </div>
              )}
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim()}
                className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Team erstellen
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t">
          <button onClick={onClose} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create/Edit Modal ──
function ScheduleModal({ route, onSave, onClose, cities, teams }) {
  const [form, setForm] = useState({
    city: route?.city || '',
    schedule_date: route?.schedule_date || '',
    date_end: route?.schedule_date || '', // for batch creation
    installer_team: route?.installer_team || '',
    max_capacity: route?.max_capacity || 4,
    time_slots: route?.time_slots || DEFAULT_TIME_SLOTS,
    notes: route?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const isEdit = !!route?.id;

  const activeTeams = (teams || []).filter(t => t.is_active);

  const handleSave = async () => {
    if (!form.city || !form.schedule_date) return;
    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        // Update single route
        const res = await fetch(`${INSTALL_API.SCHEDULE}/${route.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          onSave('Route erfolgreich aktualisiert.');
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.message || data.error || 'Fehler beim Speichern');
        }
      } else {
        // Create one or batch (date range)
        const start = new Date(form.schedule_date);
        const end = form.date_end ? new Date(form.date_end) : start;
        const current = new Date(start);
        let failCount = 0;
        let successCount = 0;

        while (current <= end) {
          // Skip weekends
          if (includeWeekends || (current.getDay() !== 0 && current.getDay() !== 6)) {
            const res = await fetch(INSTALL_API.SCHEDULE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...form,
                schedule_date: toDateString(current),
              }),
            });
            if (res.ok) {
              successCount++;
            } else {
              failCount++;
              const data = await res.json().catch(() => ({}));
              if (failCount === 1) setError(data.message || 'Einige Routen konnten nicht erstellt werden');
            }
          }
          current.setDate(current.getDate() + 1);
        }

        if (failCount === 0) {
          onSave(`${successCount} Route${successCount > 1 ? 'n' : ''} erfolgreich erstellt.`);
        } else if (successCount > 0) {
          onSave(`${successCount} Route${successCount > 1 ? 'n' : ''} erstellt, ${failCount} fehlgeschlagen.`);
        }
      }
    } catch (e) {
      console.error('Save failed:', e);
      setError('Netzwerkfehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">{isEdit ? 'Route bearbeiten' : 'Neue Route(n) anlegen'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stadt</label>
            <select
              value={form.city}
              onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
            >
              <option value="">Stadt wählen...</option>
              {Object.keys(CITY_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
              {form.city && !CITY_COLORS[form.city] && <option value={form.city}>{form.city}</option>}
            </select>
          </div>

          {/* Date(s) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isEdit ? 'Datum' : 'Von'}
              </label>
              <input
                type="date"
                value={form.schedule_date}
                onChange={(e) => setForm(f => ({ ...f, schedule_date: e.target.value, date_end: f.date_end || e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
              />
            </div>
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                <input
                  type="date"
                  value={form.date_end}
                  onChange={(e) => setForm(f => ({ ...f, date_end: e.target.value }))}
                  min={form.schedule_date}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
                />
              </div>
            )}
          </div>

          {/* Include Weekends */}
          {!isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeWeekends}
                onChange={(e) => setIncludeWeekends(e.target.checked)}
                className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
              />
              <span className="text-sm text-gray-700">Samstag & Sonntag einbeziehen</span>
            </label>
          )}

          {/* Team (Dropdown) & Capacity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Installer Team</label>
              <select
                value={form.installer_team}
                onChange={(e) => setForm(f => ({ ...f, installer_team: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
              >
                <option value="">Team wählen...</option>
                {activeTeams.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
                {form.installer_team && !activeTeams.some(t => t.name === form.installer_team) && (
                  <option value={form.installer_team}>{form.installer_team} (alt)</option>
                )}
              </select>
              {activeTeams.length === 0 && (
                <p className="text-[10px] text-amber-500 mt-0.5">Noch keine Teams. Bitte zuerst Teams anlegen!</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kapazität/Tag</label>
              <input
                type="number"
                value={form.max_capacity}
                onChange={(e) => setForm(f => ({ ...f, max_capacity: parseInt(e.target.value) || 4 }))}
                min={1}
                max={20}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {/* Time Slots */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zeitslots</label>
            <div className="flex flex-wrap gap-2">
              {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(t => (
                <button
                  key={t}
                  onClick={() => setForm(f => ({
                    ...f,
                    time_slots: f.time_slots.includes(t) ? f.time_slots.filter(s => s !== t) : [...f.time_slots, t].sort(),
                  }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.time_slots.includes(t)
                      ? 'bg-orange-100 border-orange-300 text-orange-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 h-16 resize-none focus:outline-none focus:border-orange-400"
              placeholder="Interne Notizen..."
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.city || !form.schedule_date}
            className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? 'Speichert...' : isEdit ? 'Speichern' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Calendar Component ──
export default function InstallationCalendar({ filterCity }) {
  const [routes, setRoutes] = useState([]);
  const [teams, setTeams] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [airtableTermine, setAirtableTermine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [showModal, setShowModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editRoute, setEditRoute] = useState(null);
  const [filterTeam, setFilterTeam] = useState(''); // '' = alle Teams
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(`${INSTALL_API.SCHEDULE}/teams`);
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch teams:', e);
    }
  }, []);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
      const res = await fetch(`${INSTALL_API.SCHEDULE}?from=${from}&to=${to}`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch routes:', e);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  // Fetch bookings for current month
  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch(INSTALL_API.BOOKINGS);
      if (!res.ok) return;
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch bookings:', e);
    }
  }, []);

  const fetchTermine = useCallback(async () => {
    try {
      const data = await fetchAllInstallationstermine();
      setAirtableTermine(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch AT termine:', e);
    }
  }, []);

  useEffect(() => { fetchTeams(); fetchTermine(); }, [fetchTeams, fetchTermine]);
  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);
  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const teamColorMap = useMemo(() => {
    const map = new Map();
    for (const t of teams) map.set(t.name, t.color);
    return map;
  }, [teams]);

  const getTeamColor = (teamName) => teamColorMap.get(teamName) || null;

  const allBookings = useMemo(() => mergeAirtableTermine(airtableTermine, bookings, routes), [airtableTermine, bookings, routes]);
  const bookingsByDate = useMemo(() => groupByKey(allBookings, b => b.booked_date), [allBookings]);

  // Apply city + team filter
  const filteredRoutes = useMemo(() => {
    let result = routes;
    if (filterCity) result = result.filter(r => (r.city || '') === filterCity);
    if (filterTeam) result = result.filter(r => (r.installer_team || '') === filterTeam);
    return result;
  }, [routes, filterCity, filterTeam]);

  const routesByDate = useMemo(() => groupByKey(filteredRoutes, r => r.schedule_date), [filteredRoutes]);

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  const monthLabel = new Date(year, month).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const handleNextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const handleDelete = async (routeId) => {
    if (!confirm('Route wirklich löschen?')) return;
    await fetch(`${INSTALL_API.SCHEDULE}/${routeId}`, { method: 'DELETE' });
    fetchRoutes();
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditRoute(null);
  };

  const handleModalSave = (msg) => {
    handleModalClose();
    fetchRoutes();
    showToast(msg || 'Route gespeichert.');
  };

  const activeTeams = useMemo(() => teams.filter(t => t.is_active), [teams]);

  // Stats
  const totalRoutes = filteredRoutes.length;
  const totalCapacity = filteredRoutes.reduce((s, r) => s + (r.max_capacity || 0), 0);
  const uniqueCities = [...new Set(filteredRoutes.map(r => r.city))].length;

  // Count bookings for current month (booked/confirmed only)
  const monthBookings = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return bookings.filter(b =>
      b.booked_date?.startsWith(prefix) &&
      ['booked', 'confirmed', 'completed'].includes(b.status) &&
      (!filterCity || b.city === filterCity)
    ).length;
  }, [bookings, year, month, filterCity]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 hover:bg-white/20 rounded">
            <X size={14} />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Installations-Routen</h2>
          <p className="text-gray-500 mt-1">Planen Sie, wann welches Team in welcher Stadt ist.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Team Filter */}
          <div className="relative">
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="appearance-none pl-8 pr-8 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 font-medium text-sm cursor-pointer focus:outline-none focus:border-orange-400"
            >
              <option value="">Alle Teams</option>
              {activeTeams.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            <Users size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {/* View Mode Toggle */}
          <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-orange-50 text-orange-600' : 'text-gray-400 hover:bg-gray-50'}`}
              title="Kalenderansicht"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2.5 transition-colors ${viewMode === 'list' ? 'bg-orange-50 text-orange-600' : 'text-gray-400 hover:bg-gray-50'}`}
              title="Listenansicht"
            >
              <List size={16} />
            </button>
          </div>
          <button
            onClick={() => setShowTeamModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 font-medium text-sm"
          >
            <Settings size={16} /> Teams ({activeTeams.length})
          </button>
          <button
            onClick={() => { setEditRoute(filterCity ? { city: filterCity } : null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
          >
            <Plus size={18} /> Neue Route
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Routen diesen Monat</div>
          <div className="text-2xl font-bold text-gray-900">{totalRoutes}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Gesamt-Kapazität</div>
          <div className="text-2xl font-bold text-gray-900">{totalCapacity}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Buchungen</div>
          <div className="text-2xl font-bold text-gray-900">{monthBookings}</div>
          {totalCapacity > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">{Math.round(monthBookings / totalCapacity * 100)}% belegt</div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Städte</div>
          <div className="text-2xl font-bold text-gray-900">{uniqueCities}</div>
        </div>
      </div>

      {/* Month Navigation (always visible) */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Month Nav */}
        <div className="flex items-center justify-between p-4 border-b">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <h3 className="text-lg font-semibold text-gray-900 capitalize">{monthLabel}</h3>
          <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Weekday Headers + Day Grid (grid mode only) */}
        {viewMode === 'grid' && (<>
        <div className="grid grid-cols-7 border-b">
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
          ))}
        </div>

        {/* Day Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Lädt...</div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map(({ date, isCurrentMonth }, i) => {
              const dateStr = toDateString(date);
              const dayRoutes = routesByDate.get(dateStr) || [];
              const dayBookings = bookingsByDate.get(dateStr) || [];
              const bookedCount = dayBookings.filter(b => ['booked', 'confirmed'].includes(b.status)).length;
              const pendingCount = dayBookings.filter(b => b.status === 'pending').length;
              const dayCapacity = dayRoutes.reduce((s, r) => s + (r.max_capacity || 0), 0);
              const isToday = toDateString(new Date()) === dateStr;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              return (
                <div
                  key={i}
                  className={`min-h-[80px] border-b border-r p-1 ${
                    !isCurrentMonth ? 'bg-gray-50' : isWeekend ? 'bg-gray-50/50' : 'bg-white'
                  } ${isCurrentMonth && dayRoutes.length === 0 ? 'cursor-pointer hover:bg-orange-50/30' : ''}`}
                  onClick={() => { if (isCurrentMonth && dayRoutes.length === 0) { setEditRoute({ schedule_date: dateStr, city: filterCity || '' }); setShowModal(true); } }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className={`text-xs font-medium ${
                      isToday ? 'bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center' :
                      !isCurrentMonth ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      {date.getDate()}
                    </div>
                    {/* Booking indicators */}
                    {(bookedCount > 0 || pendingCount > 0) && (
                      <div className="flex items-center gap-0.5">
                        {bookedCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-green-500 text-white text-[9px] font-bold" title={`${bookedCount} bestaetigt`}>
                            {bookedCount}
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-yellow-400 text-white text-[9px] font-bold" title={`${pendingCount} offen`}>
                            {pendingCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {dayRoutes.map(r => {
                    const teamColor = getTeamColor(r.installer_team) || getCityColor(r.city);
                    // Count bookings for this specific route (matching route_id or fallback to city)
                    const routeBookings = dayBookings.filter(b => b.route_id === r.id || (!b.route_id && b.city === r.city));
                    const routeBooked = routeBookings.filter(b => ['booked', 'confirmed'].includes(b.status)).length;
                    return (
                      <div
                        key={r.id}
                        onClick={(e) => { e.stopPropagation(); setEditRoute(r); setShowModal(true); }}
                        className="group cursor-pointer text-xs rounded px-1 py-0.5 mb-0.5 truncate flex items-center gap-1"
                        style={{ backgroundColor: teamColor + '20', color: teamColor }}
                      >
                        <MapPin size={10} />
                        <span className="truncate font-medium">{r.city}</span>
                        {r.installer_team && (
                          <span className="opacity-60 truncate text-[9px]">{r.installer_team.replace('Team ', '')}</span>
                        )}
                        <span className="ml-auto flex items-center gap-0.5">
                          {routeBooked > 0 && <span className="text-green-600 font-bold">{routeBooked}/</span>}
                          <span className="opacity-70">{r.max_capacity}</span>
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    );
                  })}
                  {dayCapacity > 0 && bookedCount > 0 && (
                    <div className="mt-0.5">
                      <CapacityBar booked={bookedCount} capacity={dayCapacity} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </>)}
      </div>

      {/* ── List View ── */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              Routen chronologisch{filterCity ? ` — ${filterCity}` : ''}{filterTeam ? ` — ${filterTeam}` : ''}
            </h3>
            <span className="text-xs text-gray-400">{filteredRoutes.length} Routen</span>
          </div>
          {filteredRoutes.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">Keine Routen fuer diesen Monat geplant.</div>
          ) : (
            <div className="divide-y">
              {[...filteredRoutes].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date)).map(r => {
                const teamColor = getTeamColor(r.installer_team);
                const dayBookings = bookingsByDate.get(r.schedule_date) || [];
                const routeBookings = dayBookings.filter(b => b.route_id === r.id || (!b.route_id && b.city === r.city));
                const routeBooked = routeBookings.filter(b => ['booked', 'confirmed'].includes(b.status)).length;
                const routePending = routeBookings.filter(b => b.status === 'pending').length;
                const capacityPct = r.max_capacity > 0 ? Math.round(routeBooked / r.max_capacity * 100) : 0;

                return (
                  <div key={r.id} className="flex items-center justify-between p-4 hover:bg-gray-50 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 text-center w-12">
                        <div className="text-lg font-bold text-gray-900">{new Date(r.schedule_date + 'T00:00:00').getDate()}</div>
                        <div className="text-[10px] text-gray-400 uppercase">
                          {new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short' })}
                        </div>
                      </div>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: teamColor || getCityColor(r.city) }} />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {r.city}
                          {r.installer_team && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: (teamColor || '#64748b') + '15', color: teamColor || '#64748b' }}>
                              {r.installer_team}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                          <span>{r.time_slots?.length || 0} Slots</span>
                          <span className="font-medium">
                            {routeBooked}/{r.max_capacity} gebucht
                            {routePending > 0 && <span className="text-yellow-600 ml-1">({routePending} offen)</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {r.max_capacity > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2">
                            <CapacityBar booked={routeBooked} capacity={r.max_capacity} />
                          </div>
                          <span className={`text-xs font-semibold ${capacityPct >= 100 ? 'text-red-600' : capacityPct >= 70 ? 'text-amber-600' : 'text-green-600'}`}>
                            {capacityPct}%
                          </span>
                        </div>
                      )}
                      <RouteStatusBadge status={r.status} />
                      <button
                        onClick={() => { setEditRoute(r); setShowModal(true); }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Route Details (Grid view only, below calendar) */}
      {viewMode === 'grid' && filteredRoutes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-900">Routen-Details{filterCity ? ` (${filterCity})` : ''}{filterTeam ? ` (${filterTeam})` : ''}</h3>
          </div>
          <div className="divide-y">
            {filteredRoutes.map(r => {
              const teamColor = getTeamColor(r.installer_team);
              const dayBookings = bookingsByDate.get(r.schedule_date) || [];
              const routeBookings = dayBookings.filter(b => b.route_id === r.id || (!b.route_id && b.city === r.city));
              const routeBooked = routeBookings.filter(b => ['booked', 'confirmed'].includes(b.status)).length;
              return (
              <div key={r.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: teamColor || getCityColor(r.city) }} />
                  <div>
                    <div className="font-medium text-gray-900">{r.city}</div>
                    <div className="text-xs text-gray-500">
                      {formatDate(r.schedule_date)} · <span style={{ color: teamColor || undefined }} className="font-medium">{r.installer_team || 'Kein Team'}</span> · {routeBooked}/{r.max_capacity} gebucht
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RouteStatusBadge status={r.status} />
                  <button
                    onClick={() => { setEditRoute(r); setShowModal(true); }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Route Modal */}
      {showModal && (
        <ScheduleModal
          route={editRoute}
          onSave={handleModalSave}
          onClose={handleModalClose}
          cities={Object.keys(CITY_COLORS)}
          teams={teams}
        />
      )}

      {/* Team Management Modal */}
      {showTeamModal && (
        <TeamManageModal
          teams={teams}
          onClose={() => setShowTeamModal(false)}
          onRefresh={fetchTeams}
          showToast={showToast}
        />
      )}
    </div>
  );
}
