import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Trash2, AlertCircle, Loader2, Search, MapPin, User, Building2 } from 'lucide-react';
import { fetchAllStammdaten } from '../utils/airtableService';
import { getAllUsers } from '../utils/authService';

const STATUS_OPTIONS = ['New', 'In Progress', 'Follow Up', 'On Hold', 'In Review', 'Completed'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];
const TYPE_OPTIONS = ['Internal', 'External', 'Lieferando'];

export default function TaskEditModal({ isOpen, onClose, onSave, onDelete, task, loading }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState([]);
  const [status, setStatus] = useState('New');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // New fields
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState('');

  // Data sources
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [dashboardUsers, setDashboardUsers] = useState([]);

  const locationDropdownRef = useRef(null);

  // Pre-fill form when task changes
  useEffect(() => {
    if (task && isOpen) {
      setTitle(task.title || '');
      setType(Array.isArray(task.type) ? [...task.type] : task.type ? [task.type] : []);
      setStatus(task.status || 'New');
      setPriority(task.priority || 'Medium');
      setDueDate(task.dueDate || '');
      setDescription(task.description || '');
      setShowDeleteConfirm(false);
      setLocationSearch('');
      setShowLocationDropdown(false);

      // Load data sources
      setDashboardUsers(getAllUsers());

      setLocationsLoading(true);
      fetchAllStammdaten()
        .then((data) => {
          setLocations(data);

          // Try to pre-select location from task data
          if (task.locationIds && task.locationIds.length > 0) {
            const match = data.find((loc) => task.locationIds.includes(loc.id));
            if (match) setSelectedLocation(match);
            else setSelectedLocation(null);
          } else if (task.locationNames && task.locationNames.length > 0) {
            const match = data.find((loc) => task.locationNames.includes(loc.name));
            if (match) setSelectedLocation(match);
            else setSelectedLocation(null);
          } else {
            setSelectedLocation(null);
          }
        })
        .catch(() => setLocations([]))
        .finally(() => setLocationsLoading(false));

      // Try to pre-select assigned user
      if (task.responsibleUser) {
        const users = getAllUsers();
        const match = users.find((u) => u.name === task.responsibleUser);
        setAssignedUserId(match?.id || '');
      } else {
        setAssignedUserId('');
      }
    }
  }, [task, isOpen]);

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

  if (!isOpen || !task) return null;

  const handleTypeToggle = (val) => {
    setType((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]
    );
  };

  /* Filtered locations for search */
  const filteredLocations = (() => {
    if (!locationSearch.trim()) return locations.slice(0, 50);
    const q = locationSearch.toLowerCase();
    return locations.filter(
      (loc) =>
        loc.name?.toLowerCase().includes(q) ||
        loc.city?.toLowerCase().includes(q) ||
        loc.jetIds?.some((j) => j.toLowerCase().includes(q)) ||
        loc.displayIds?.some((d) => d.toLowerCase().includes(q))
    ).slice(0, 50);
  })();

  const handleSelectLocation = (loc) => {
    setSelectedLocation(loc);
    setLocationSearch('');
    setShowLocationDropdown(false);
  };

  const handleClearLocation = () => {
    setSelectedLocation(null);
    setLocationSearch('');
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const updatedFields = {
      'Task Title': title.trim(),
      'Task Type': type,
      'Status': status,
      'Priority': priority,
      'Due Date': dueDate || null,
      'Description': description,
    };

    // Location linked record
    if (selectedLocation) {
      updatedFields['Locations'] = [selectedLocation.id];
    }

    // Assigned user
    if (assignedUserId) {
      const user = dashboardUsers.find((u) => u.id === assignedUserId);
      if (user) {
        updatedFields['Responsible User'] = user.name;
      }
    }

    onSave(task.id, updatedFields);
  };

  const handleDelete = () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    onDelete(task.id);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-lg shadow-black/[0.08]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200/60">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Task bearbeiten</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{task.id}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50/80 border border-slate-200/60 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Task Title */}
          <div>
            <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Aufgabentitel <span className="text-[#ef4444]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel der Aufgabe..."
              className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
            {!title.trim() && (
              <div className="flex items-center gap-1 mt-1">
                <AlertCircle size={10} className="text-[#ef4444]" />
                <span className="text-[10px] text-[#ef4444]">Titel ist erforderlich</span>
              </div>
            )}
          </div>

          {/* Task Type (multi-select checkboxes) */}
          <div>
            <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Aufgabentyp
            </label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all border ${
                    type.includes(opt)
                      ? 'bg-[#3b82f6]/10 border-[#3b82f6]/40 text-[#3b82f6]'
                      : 'bg-slate-50/80 border-slate-200/60 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={type.includes(opt)}
                    onChange={() => handleTypeToggle(opt)}
                    className="sr-only"
                  />
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      type.includes(opt)
                        ? 'bg-[#3b82f6] border-[#3b82f6]'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {type.includes(opt) && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {opt}
                </label>
              ))}
            </div>
          </div>

          {/* Status & Priority row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                Priorität
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Standort / Location (searchable) ── */}
          <div ref={locationDropdownRef} className="relative">
            <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              <MapPin size={10} className="inline -mt-0.5 mr-1" />
              Standort / Partner
            </label>

            {selectedLocation ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#3b82f6]/5 border border-[#3b82f6]/30 rounded-lg">
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
                  className="w-full pl-9 pr-3 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-50"
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
                        <span className="text-[10px] text-slate-400 font-mono">{loc.city}</span>
                        {loc.jetIds?.length > 0 && (
                          <span className="text-[10px] text-slate-400 font-mono">{loc.jetIds[0]}</span>
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
          </div>

          {/* ── Zuständig / Assigned User ── */}
          <div>
            <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              <User size={10} className="inline -mt-0.5 mr-1" />
              Zuständig
            </label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full appearance-none px-3 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
              }}
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
            <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Fälligkeitsdatum
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beschreibung der Aufgabe..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 space-y-3">
          {/* Save & Cancel */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!title.trim() || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3b82f6] text-white text-xs font-medium rounded-lg hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Speichern
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 bg-slate-50/80 border border-slate-200/60 text-xs text-slate-600 font-medium rounded-lg hover:border-slate-300 hover:text-slate-900 disabled:opacity-40 transition-colors"
            >
              Abbrechen
            </button>
          </div>

          {/* Delete */}
          <div className="pt-3 border-t border-slate-200/60">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-[#ef4444]">
                  <AlertCircle size={12} />
                  <span>Task wirklich löschen?</span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ef4444] text-white text-xs font-medium rounded-lg hover:bg-[#dc2626] disabled:opacity-40 transition-colors"
                >
                  {loading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  Ja, löschen
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Nein
                </button>
              </div>
            ) : (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#ef4444] hover:text-[#dc2626] hover:bg-[#ef4444]/5 rounded-lg disabled:opacity-40 transition-colors"
              >
                <Trash2 size={12} />
                Task löschen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
