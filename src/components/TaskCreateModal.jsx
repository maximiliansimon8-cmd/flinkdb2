import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, AlertCircle, Loader2, Search, MapPin, User, Building2 } from 'lucide-react';
import { fetchAllStammdaten } from '../utils/airtableService';
import { getAllUsers } from '../utils/authService';

/* ──────────────────────── constants ──────────────────────── */

const TASK_TYPES = ['Internal', 'External', 'Lieferando'];

const STATUS_OPTIONS = [
  'New',
  'In Progress',
  'Follow Up',
  'On Hold',
  'In Review',
  'Completed',
];

const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];

const STATUS_COLORS = {
  'New':         '#3b82f6',
  'In Progress': '#f59e0b',
  'Follow Up':   '#a855f7',
  'On Hold':     '#64748b',
  'In Review':   '#06b6d4',
  'Completed':   '#22c55e',
};

const PRIORITY_COLORS = {
  'High':   '#ef4444',
  'Medium': '#f59e0b',
  'Low':    '#22c55e',
};

/* ──────────────────────── component ──────────────────────── */

export default function TaskCreateModal({ isOpen, onClose, onSave, loading = false, error: externalError = null }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState([]);
  const [status, setStatus] = useState('New');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  // New fields
  const [selectedLocation, setSelectedLocation] = useState(null); // { id, name, city, ... }
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState('');

  // Data sources
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [dashboardUsers, setDashboardUsers] = useState([]);

  const backdropRef = useRef(null);
  const titleInputRef = useRef(null);
  const locationDropdownRef = useRef(null);

  /* Load locations & users when modal opens */
  useEffect(() => {
    if (isOpen) {
      // Reset form
      setTitle('');
      setType([]);
      setStatus('New');
      setPriority('Medium');
      setDueDate('');
      setDescription('');
      setErrors({});
      setSelectedLocation(null);
      setLocationSearch('');
      setShowLocationDropdown(false);
      setAssignedUserId('');

      // Load data
      setDashboardUsers(getAllUsers());

      setLocationsLoading(true);
      fetchAllStammdaten()
        .then((data) => setLocations(data))
        .catch(() => setLocations([]))
        .finally(() => setLocationsLoading(false));

      setTimeout(() => titleInputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  /* Close location dropdown on outside click */
  useEffect(() => {
    if (!showLocationDropdown) return;
    const handleClickOutside = (e) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setShowLocationDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLocationDropdown]);

  /* Backdrop click */
  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  /* Type toggle */
  const toggleType = (t) => {
    setType((prev) =>
      prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t]
    );
  };

  /* Filtered locations for search */
  const filteredLocations = useMemo(() => {
    if (!locationSearch.trim()) return locations.slice(0, 50);
    const q = locationSearch.toLowerCase();
    return locations.filter(
      (loc) =>
        loc.name?.toLowerCase().includes(q) ||
        loc.city?.toLowerCase().includes(q) ||
        loc.jetIds?.some((j) => j.toLowerCase().includes(q)) ||
        loc.displayIds?.some((d) => d.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [locations, locationSearch]);

  /* Select a location */
  const handleSelectLocation = (loc) => {
    setSelectedLocation(loc);
    setLocationSearch('');
    setShowLocationDropdown(false);
    if (errors.location) setErrors((prev) => ({ ...prev, location: null }));
  };

  /* Clear location */
  const handleClearLocation = () => {
    setSelectedLocation(null);
    setLocationSearch('');
  };

  /* Validate & submit */
  const handleSubmit = (e) => {
    if (e) e.preventDefault();

    const newErrors = {};
    if (!title.trim()) {
      newErrors.title = 'Titel ist erforderlich';
    }
    if (!selectedLocation) {
      newErrors.location = 'Standort / Partner ist erforderlich';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const taskData = {
      title: title.trim(),
      type,
      status,
      priority,
      description: description.trim(),
    };

    // Only include dueDate if set (HTML date input gives YYYY-MM-DD)
    if (dueDate) {
      taskData.dueDate = dueDate;
    }

    // Add location (Airtable record ID for linked record)
    if (selectedLocation) {
      taskData.locations = [selectedLocation.id];
    }

    // Add assigned user name (for display / matching)
    if (assignedUserId) {
      const user = dashboardUsers.find((u) => u.id === assignedUserId);
      if (user) {
        taskData.assignedUserName = user.name;
      }
    }

    onSave(taskData);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.25)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* ──── Modal Card ──── */}
      <div className="w-full max-w-lg bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-lg shadow-black/[0.08] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200/60">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Neuen Task erstellen
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Aufgabe zum JET DooH Projekt hinzufügen
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100/80 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              Titel <span className="text-[#ef4444]">*</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: null }));
              }}
              placeholder="Task-Bezeichnung eingeben..."
              className={`w-full px-3 py-2.5 bg-slate-50/80 border rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                errors.title
                  ? 'border-[#ef4444] focus:border-[#ef4444]'
                  : 'border-slate-200/60 focus:border-[#3b82f6]'
              }`}
            />
            {errors.title && (
              <div className="flex items-center gap-1 mt-1.5 text-[#ef4444]">
                <AlertCircle size={11} />
                <span className="text-[10px]">{errors.title}</span>
              </div>
            )}
          </div>

          {/* Task Type (checkboxes) */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              Typ
            </label>
            <div className="flex flex-wrap gap-2">
              {TASK_TYPES.map((t) => {
                const selected = type.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      selected
                        ? 'bg-[#3b82f6]/10 border border-[#3b82f6]/40 text-[#3b82f6]'
                        : 'bg-slate-50/80 border border-slate-200/60 text-slate-500 hover:border-slate-300 hover:text-slate-600'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                        selected
                          ? 'bg-[#3b82f6] border-[#3b82f6]'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {selected && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path
                            d="M1.5 4L3.2 5.7L6.5 2.3"
                            stroke="white"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status & Priority row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Status
              </label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors pr-8"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                Priorität
              </label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors pr-8"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
                  style={{ backgroundColor: PRIORITY_COLORS[priority] }}
                />
              </div>
            </div>
          </div>

          {/* ── Standort / Location (searchable) ── */}
          <div ref={locationDropdownRef} className="relative">
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              <MapPin size={11} className="inline -mt-0.5 mr-1 text-slate-400" />
              Standort / Partner <span className="text-[#ef4444]">*</span>
            </label>

            {selectedLocation ? (
              /* Selected location pill */
              <div className="flex items-center gap-2 px-3 py-2.5 bg-[#3b82f6]/5 border border-[#3b82f6]/30 rounded-lg">
                <Building2 size={13} className="text-[#3b82f6] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-900 truncate">
                    {selectedLocation.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {selectedLocation.city}
                    {selectedLocation.jetIds?.length > 0 && ` · ${selectedLocation.jetIds[0]}`}
                    {selectedLocation.displayIds?.length > 0 && ` · ${selectedLocation.displayIds.length} Display${selectedLocation.displayIds.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="p-1 rounded hover:bg-slate-100/60 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              /* Search input */
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={locationSearch}
                  onChange={(e) => {
                    setLocationSearch(e.target.value);
                    setShowLocationDropdown(true);
                  }}
                  onFocus={() => setShowLocationDropdown(true)}
                  placeholder={locationsLoading ? 'Standorte laden...' : 'Standort suchen (Name, Stadt, JET ID)...'}
                  disabled={locationsLoading}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-50"
                />
                {locationsLoading && (
                  <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                )}
              </div>
            )}

            {/* Location dropdown */}
            {showLocationDropdown && !selectedLocation && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white/95 backdrop-blur-xl border border-slate-200/60 rounded-lg shadow-lg shadow-black/[0.08] max-h-[200px] overflow-y-auto">
                {filteredLocations.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">
                    {locationsLoading ? 'Laden...' : 'Kein Standort gefunden'}
                  </div>
                ) : (
                  filteredLocations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50/80 transition-colors border-b border-slate-200/30 last:border-b-0"
                    >
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {loc.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {loc.city}
                        </span>
                        {loc.jetIds?.length > 0 && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {loc.jetIds[0]}
                          </span>
                        )}
                        {loc.displayIds?.length > 0 && (
                          <span className="text-[9px] text-slate-400 bg-slate-100/80 px-1.5 py-0.5 rounded">
                            {loc.displayIds.length} Display{loc.displayIds.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {errors.location && (
              <div className="flex items-center gap-1 mt-1.5 text-[#ef4444]">
                <AlertCircle size={11} />
                <span className="text-[10px]">{errors.location}</span>
              </div>
            )}
          </div>

          {/* ── Zuständig / Assigned User ── */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              <User size={11} className="inline -mt-0.5 mr-1 text-slate-400" />
              Zuständig
            </label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full appearance-none px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors"
            >
              <option value="">– Nicht zugewiesen –</option>
              {dashboardUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.groupName})
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              Fälligkeitsdatum
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optionale Beschreibung der Aufgabe..."
              className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200/60 space-y-3">
          {externalError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-[#ef4444]/5 border border-[#ef4444]/20 rounded-lg">
              <AlertCircle size={13} className="text-[#ef4444] shrink-0" />
              <span className="text-[11px] text-[#ef4444] font-medium">{externalError}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100/80 hover:border-slate-300 transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-xs font-medium transition-colors shadow-sm shadow-[#3b82f6]/20 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Wird erstellt...
              </>
            ) : (
              <>
                <Save size={13} />
                Erstellen
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
