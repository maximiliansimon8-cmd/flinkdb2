import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Plus, ChevronLeft, ChevronRight, Trash2, Edit2, Save, X, MapPin, Users, Clock,
} from 'lucide-react';

const API_BASE = '/api/install-schedule';

const CITY_COLORS = {
  Berlin: '#3b82f6', Hamburg: '#22c55e', München: '#f59e0b', Frankfurt: '#ef4444',
  Köln: '#8b5cf6', Düsseldorf: '#ec4899', Stuttgart: '#14b8a6', Hannover: '#f97316',
  Leipzig: '#6366f1', Dresden: '#84cc16', Nürnberg: '#06b6d4', Bremen: '#a855f7',
};

const DEFAULT_TIME_SLOTS = ['09:00', '11:00', '14:00', '16:00'];

function getCityColor(city) {
  return CITY_COLORS[city] || '#64748b';
}

/** Format date for display */
function formatDate(d) {
  return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
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

function toDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Create/Edit Modal ──
function ScheduleModal({ route, onSave, onClose, cities }) {
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
  const isEdit = !!route?.id;

  const handleSave = async () => {
    if (!form.city || !form.schedule_date) return;
    setSaving(true);

    try {
      if (isEdit) {
        // Update single route
        const res = await fetch(`${API_BASE}/${route.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) onSave();
      } else {
        // Create one or batch (date range)
        const start = new Date(form.schedule_date);
        const end = form.date_end ? new Date(form.date_end) : start;
        const current = new Date(start);

        while (current <= end) {
          // Skip weekends
          if (current.getDay() !== 0 && current.getDay() !== 6) {
            await fetch(API_BASE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...form,
                schedule_date: toDateString(current),
              }),
            });
          }
          current.setDate(current.getDate() + 1);
        }
        onSave();
      }
    } catch (e) {
      console.error('Save failed:', e);
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

          {/* Team & Capacity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Installer Team</label>
              <input
                type="text"
                value={form.installer_team}
                onChange={(e) => setForm(f => ({ ...f, installer_team: e.target.value }))}
                placeholder="z.B. Team Alpha"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
              />
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
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.city || !form.schedule_date}
            className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium"
          >
            {saving ? 'Speichert...' : isEdit ? 'Speichern' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Calendar Component ──
export default function InstallationCalendar() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [showModal, setShowModal] = useState(false);
  const [editRoute, setEditRoute] = useState(null);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
      const res = await fetch(`${API_BASE}?from=${from}&to=${to}`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch routes:', e);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const routesByDate = useMemo(() => {
    const map = new Map();
    for (const r of routes) {
      const existing = map.get(r.schedule_date) || [];
      existing.push(r);
      map.set(r.schedule_date, existing);
    }
    return map;
  }, [routes]);

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
    await fetch(`${API_BASE}/${routeId}`, { method: 'DELETE' });
    fetchRoutes();
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditRoute(null);
  };

  const handleModalSave = () => {
    handleModalClose();
    fetchRoutes();
  };

  // Stats
  const totalRoutes = routes.length;
  const totalCapacity = routes.reduce((s, r) => s + (r.max_capacity || 0), 0);
  const uniqueCities = [...new Set(routes.map(r => r.city))].length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Installations-Routen</h2>
          <p className="text-gray-500 mt-1">Planen Sie, wann das Team in welcher Stadt ist.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
        >
          <Plus size={18} /> Neue Route
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Routen diesen Monat</div>
          <div className="text-2xl font-bold text-gray-900">{totalRoutes}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Gesamt-Kapazität</div>
          <div className="text-2xl font-bold text-gray-900">{totalCapacity}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Städte</div>
          <div className="text-2xl font-bold text-gray-900">{uniqueCities}</div>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Month Navigation */}
        <div className="flex items-center justify-between p-4 border-b">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <h3 className="text-lg font-semibold text-gray-900 capitalize">{monthLabel}</h3>
          <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Weekday Headers */}
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
              const isToday = toDateString(new Date()) === dateStr;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              return (
                <div
                  key={i}
                  className={`min-h-[80px] border-b border-r p-1 ${
                    !isCurrentMonth ? 'bg-gray-50' : isWeekend ? 'bg-gray-50/50' : 'bg-white'
                  }`}
                >
                  <div className={`text-xs font-medium mb-0.5 ${
                    isToday ? 'bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center' :
                    !isCurrentMonth ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {date.getDate()}
                  </div>
                  {dayRoutes.map(r => (
                    <div
                      key={r.id}
                      onClick={() => { setEditRoute(r); setShowModal(true); }}
                      className="group cursor-pointer text-xs rounded px-1 py-0.5 mb-0.5 truncate flex items-center gap-1"
                      style={{ backgroundColor: getCityColor(r.city) + '20', color: getCityColor(r.city) }}
                    >
                      <MapPin size={10} />
                      <span className="truncate font-medium">{r.city}</span>
                      <span className="ml-auto opacity-70">{r.max_capacity}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Route List (below calendar) */}
      {routes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-900">Routen-Details</h3>
          </div>
          <div className="divide-y">
            {routes.map(r => (
              <div key={r.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getCityColor(r.city) }} />
                  <div>
                    <div className="font-medium text-gray-900">{r.city}</div>
                    <div className="text-xs text-gray-500">
                      {formatDate(r.schedule_date)} · {r.installer_team || 'Kein Team'} · {r.max_capacity} Plätze
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    r.status === 'open' ? 'bg-green-100 text-green-700' :
                    r.status === 'full' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {r.status}
                  </span>
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
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ScheduleModal
          route={editRoute}
          onSave={handleModalSave}
          onClose={handleModalClose}
          cities={Object.keys(CITY_COLORS)}
        />
      )}
    </div>
  );
}
