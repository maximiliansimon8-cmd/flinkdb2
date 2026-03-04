import React, { useState, useEffect, useRef } from 'react';
import {
  X, Save, Trash2, AlertCircle, Loader2, Search, MapPin, User, Building2, Briefcase,
  ChevronDown, ChevronUp, Calendar, Phone, Mail, FileText, ExternalLink, Download,
  Info, Wrench, Paperclip,
} from 'lucide-react';
import { fetchAllStammdaten, fetchInstallationByDisplayId, resolveAttachmentUrls } from '../utils/airtableService';
import { fetchAllUsers, getAllUsers } from '../utils/authService';

const STATUS_OPTIONS = ['New', 'In Progress', 'Follow Up', 'On Hold', 'In Review', 'Completed'];
const PRIORITY_OPTIONS = ['Urgent', 'High', 'Medium', 'Low'];
const PARTNERS = [
  'Dimension Outdoor GmbH',
  'Inbound Lead',
  'Public Arte GmbH',
  'Lieferando AM',
  'e-Systems',
  'MediaAV',
  'DAYNMEDIA GmbH',
  'T-Ads / emetriq',
];

/* ── Helper: format date as DD.MM.YYYY ── */
function formatDateDE(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export default function TaskEditModal({ isOpen, onClose, onSave, onDelete, task, loading }) {
  const [title, setTitle] = useState('');
  const [partner, setPartner] = useState('');
  const [status, setStatus] = useState('New');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Location & user fields
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState('');

  // Data sources
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [dashboardUsers, setDashboardUsers] = useState([]);

  // Installation details for info box
  const [installationData, setInstallationData] = useState(null);
  const [installationLoading, setInstallationLoading] = useState(false);
  const [showInfoBox, setShowInfoBox] = useState(false);

  // Existing attachments from task
  const [existingAttachments, setExistingAttachments] = useState([]);

  const locationDropdownRef = useRef(null);

  // Pre-fill form when task changes
  useEffect(() => {
    if (task && isOpen) {
      setTitle(task.title || '');
      setPartner(task.partner || '');
      setStatus(task.status || 'New');
      setPriority(task.priority || 'Medium');
      setDueDate(task.dueDate || '');
      setDescription(task.description || '');
      setShowDeleteConfirm(false);
      setLocationSearch('');
      setShowLocationDropdown(false);
      setInstallationData(null);
      setInstallationLoading(false);
      setShowInfoBox(false);
      // Resolve cached attachment URLs (non-blocking)
      const rawAttachments = task.attachments || [];
      setExistingAttachments(rawAttachments);
      if (rawAttachments.length > 0 && task.id) {
        resolveAttachmentUrls(task.id, 'Attachments', rawAttachments)
          .then((resolved) => setExistingAttachments(resolved))
          .catch(() => { /* keep original URLs */ });
      }

      // Load data sources (fetchAllUsers is async - loads from Supabase)
      fetchAllUsers()
        .then((users) => {
          setDashboardUsers(users || []);
          if (task.responsibleUser) {
            const match = (users || []).find((u) => u.name === task.responsibleUser);
            setAssignedUserId(match?.id || '');
          } else {
            setAssignedUserId('');
          }
        })
        .catch(() => setDashboardUsers([]));

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

      // Fallback: if responsible user was already loaded via getAllUsers sync cache
      if (task.responsibleUser) {
        const cachedUsers = getAllUsers();
        if (cachedUsers.length > 0) {
          const match = cachedUsers.find((u) => u.name === task.responsibleUser);
          setAssignedUserId(match?.id || '');
        }
      } else {
        setAssignedUserId('');
      }
    }
  }, [task, isOpen]);

  /* Fetch installation data when location is selected */
  useEffect(() => {
    if (!selectedLocation?.displayIds?.length) {
      setInstallationData(null);
      return;
    }
    setInstallationLoading(true);
    fetchInstallationByDisplayId(selectedLocation.displayIds[0])
      .then((data) => setInstallationData(data))
      .catch(() => setInstallationData(null))
      .finally(() => setInstallationLoading(false));
  }, [selectedLocation]);

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
    setInstallationData(null);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const updatedFields = {
      'Task Title': title.trim(),
      'Status': status,
      'Priority': priority,
      'Due Date': dueDate || null,
      'Description': description,
    };

    // Location linked record
    if (selectedLocation) {
      updatedFields['Locations'] = [selectedLocation.id];
    }

    // Assigned user – Collaborator field needs { email: "..." }
    if (assignedUserId) {
      const user = dashboardUsers.find((u) => u.id === assignedUserId);
      if (user?.email) {
        updatedFields['Responsible User'] = { email: user.email };
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

  /* Check if there's location info to show */
  const hasLocationInfo = selectedLocation && (
    selectedLocation.contactPerson ||
    selectedLocation.contactPhone ||
    selectedLocation.contactEmail ||
    selectedLocation.city ||
    installationData
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface-primary border border-white/60 rounded-2xl shadow-lg shadow-black/[0.08]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border-secondary">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Task bearbeiten</h2>
            <p className="text-[10px] text-text-muted mt-0.5 font-mono">{task.id}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-secondary/80 border border-border-secondary text-text-muted hover:text-text-secondary hover:border-border-primary transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Task Title */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Aufgabentitel <span className="text-[#FF3B30]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel der Aufgabe..."
              className="w-full px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
            />
            {!title.trim() && (
              <div className="flex items-center gap-1 mt-1">
                <AlertCircle size={10} className="text-[#FF3B30]" />
                <span className="text-[10px] text-[#FF3B30]">Titel ist erforderlich</span>
              </div>
            )}
          </div>

          {/* ── Partner ── */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              <Briefcase size={10} className="inline -mt-0.5 mr-1" />
              Partner
            </label>
            <select
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
              className="w-full appearance-none px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
              }}
            >
              <option value="">– Partner auswählen –</option>
              {PARTNERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Status & Priority row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors appearance-none"
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
              <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                Priorität
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors appearance-none"
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
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              <MapPin size={10} className="inline -mt-0.5 mr-1" />
              Standort / Partner
            </label>

            {selectedLocation ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#007AFF]/5 border border-[#007AFF]/30 rounded-lg">
                <Building2 size={13} className="text-[#007AFF] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">
                    {selectedLocation.name}
                  </div>
                  <div className="text-[10px] text-text-muted font-mono truncate">
                    {selectedLocation.city}
                    {selectedLocation.jetIds?.length > 0 && ` · ${selectedLocation.jetIds[0]}`}
                    {selectedLocation.displayIds?.length > 0 && ` · ${selectedLocation.displayIds.length} Display${selectedLocation.displayIds.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="p-1 rounded hover:bg-surface-secondary/60 text-text-muted hover:text-text-secondary transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
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
                  className="w-full pl-9 pr-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors disabled:opacity-50"
                />
                {locationsLoading && (
                  <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" />
                )}
              </div>
            )}

            {/* Location dropdown */}
            {showLocationDropdown && !selectedLocation && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-primary border border-border-secondary rounded-lg shadow-lg shadow-black/[0.08] max-h-[200px] overflow-y-auto">
                {filteredLocations.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-text-muted text-center">
                    {locationsLoading ? 'Laden...' : 'Kein Standort gefunden'}
                  </div>
                ) : (
                  filteredLocations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-secondary/80 transition-colors border-b border-border-secondary/30 last:border-b-0"
                    >
                      <div className="text-xs font-medium text-text-primary truncate">
                        {loc.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-muted font-mono">{loc.city}</span>
                        {loc.jetIds?.length > 0 && (
                          <span className="text-[10px] text-text-muted font-mono">{loc.jetIds[0]}</span>
                        )}
                        {loc.displayIds?.length > 0 && (
                          <span className="text-[9px] text-text-muted bg-surface-secondary/80 px-1.5 py-0.5 rounded">
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

          {/* ═══════ STANDORT INFO-BOX (collapsible) ═══════ */}
          {hasLocationInfo && (
            <div className="border border-[#007AFF]/20 rounded-xl overflow-hidden">
              {/* Toggle header */}
              <button
                type="button"
                onClick={() => setShowInfoBox(!showInfoBox)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-[#007AFF]/5 hover:bg-[#007AFF]/10 transition-colors text-left"
              >
                <Info size={12} className="text-[#007AFF] shrink-0" />
                <span className="text-[10px] font-medium text-[#007AFF] flex-1">
                  Standort-Details
                  {installationLoading && <Loader2 size={10} className="inline ml-1 animate-spin" />}
                </span>
                {showInfoBox ? (
                  <ChevronUp size={12} className="text-[#007AFF]" />
                ) : (
                  <ChevronDown size={12} className="text-[#007AFF]" />
                )}
              </button>

              {/* Expandable content */}
              {showInfoBox && (
                <div className="px-3 py-3 space-y-3 bg-[#007AFF]/[0.02]">
                  {/* Location info */}
                  <div className="space-y-1.5">
                    {selectedLocation.city && (
                      <InfoRow
                        icon={<MapPin size={10} />}
                        label="Adresse"
                        value={`${[selectedLocation.street, selectedLocation.streetNumber].filter(Boolean).join(' ')}${selectedLocation.street ? ', ' : ''}${selectedLocation.postalCode || ''} ${selectedLocation.city}`.trim()}
                      />
                    )}
                    {selectedLocation.jetIds?.[0] && (
                      <InfoRow
                        icon={<span className="text-[8px] font-bold">ID</span>}
                        label="JET ID"
                        value={selectedLocation.jetIds[0]}
                        mono
                      />
                    )}
                    {selectedLocation.displayIds?.length > 0 && (
                      <InfoRow
                        icon={<span className="text-[8px] font-bold">D</span>}
                        label="Displays"
                        value={selectedLocation.displayIds.join(', ')}
                        mono
                      />
                    )}
                  </div>

                  {/* Contact info */}
                  {(selectedLocation.contactPerson || selectedLocation.contactPhone || selectedLocation.contactEmail) && (
                    <div className="pt-2 border-t border-[#007AFF]/10 space-y-1.5">
                      <div className="text-[9px] font-medium text-text-muted uppercase tracking-wider">Kontakt</div>
                      {selectedLocation.contactPerson && (
                        <InfoRow icon={<User size={10} />} label="Person" value={selectedLocation.contactPerson} />
                      )}
                      {selectedLocation.contactPhone && (
                        <InfoRow icon={<Phone size={10} />} label="Telefon" value={selectedLocation.contactPhone} />
                      )}
                      {selectedLocation.contactEmail && (
                        <InfoRow icon={<Mail size={10} />} label="E-Mail" value={selectedLocation.contactEmail} />
                      )}
                    </div>
                  )}

                  {/* Installation info */}
                  {installationData && (
                    <div className="pt-2 border-t border-[#007AFF]/10 space-y-1.5">
                      <div className="text-[9px] font-medium text-text-muted uppercase tracking-wider">Installation</div>
                      {installationData.installDate && (
                        <InfoRow icon={<Calendar size={10} />} label="Aufbaudatum" value={formatDateDE(installationData.installDate)} />
                      )}
                      {installationData.status && (
                        <InfoRow icon={<Info size={10} />} label="Status" value={installationData.status} />
                      )}
                      {installationData.integrator && (
                        <InfoRow icon={<Wrench size={10} />} label="Integrator" value={installationData.integrator} />
                      )}
                      {installationData.screenType && (
                        <InfoRow icon={<span className="text-[8px]">📺</span>} label="Screen" value={`${installationData.screenType}${installationData.screenSize ? ` (${installationData.screenSize})` : ''}`} />
                      )}
                      {installationData.protocol?.[0]?.url && (
                        <div className="flex items-center gap-2">
                          <div className="w-4 flex items-center justify-center text-text-muted"><FileText size={10} /></div>
                          <a
                            href={installationData.protocol[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-[#007AFF] hover:text-[#2563eb] transition-colors"
                          >
                            <Download size={9} />
                            {installationData.protocol[0].filename || 'Installationsprotokoll'}
                            <ExternalLink size={8} className="opacity-50" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Lead status */}
                  {selectedLocation.leadStatus?.length > 0 && (
                    <div className="pt-2 border-t border-[#007AFF]/10">
                      <div className="text-[9px] font-medium text-text-muted uppercase tracking-wider mb-1">Akquise-Status</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedLocation.leadStatus.map((s, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 bg-[#007AFF]/10 text-[#007AFF] rounded font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Zuständig / Assigned User ── */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              <User size={10} className="inline -mt-0.5 mr-1" />
              Zuständig
            </label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full appearance-none px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors"
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
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Fälligkeitsdatum
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beschreibung der Aufgabe..."
              rows={description.split('\n').length > 4 ? 8 : 3}
              className="w-full px-3 py-2 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors resize-none"
            />
          </div>

          {/* ── Existing Attachments ── */}
          {existingAttachments.length > 0 && (
            <div>
              <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                <Paperclip size={10} className="inline -mt-0.5 mr-1" />
                Anhänge ({existingAttachments.length})
              </label>
              <div className="space-y-1.5">
                {existingAttachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-secondary/80 border border-border-secondary rounded-lg hover:border-[#007AFF]/40 transition-colors group"
                  >
                    {att.type?.startsWith('image/') ? (
                      <img
                        src={att.thumbnails?.small?.url || att.url}
                        alt={att.filename}
                        className="w-8 h-8 rounded object-cover shrink-0"
                      />
                    ) : (
                      <FileText size={14} className="text-[#007AFF] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-text-primary truncate group-hover:text-[#007AFF] transition-colors">
                        {att.filename || 'Datei'}
                      </div>
                      {att.size > 0 && (
                        <div className="text-[9px] text-text-muted">
                          {att.size < 1024 * 1024 ? `${(att.size / 1024).toFixed(0)} KB` : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                        </div>
                      )}
                    </div>
                    <ExternalLink size={10} className="text-text-muted group-hover:text-[#007AFF] transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 space-y-3">
          {/* Save & Cancel */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!title.trim() || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#007AFF] text-white text-xs font-medium rounded-lg hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              className="px-4 py-2.5 bg-surface-secondary/80 border border-border-secondary text-xs text-text-secondary font-medium rounded-lg hover:border-border-primary hover:text-text-primary disabled:opacity-40 transition-colors"
            >
              Abbrechen
            </button>
          </div>

          {/* Delete */}
          <div className="pt-3 border-t border-border-secondary">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-[#FF3B30]">
                  <AlertCircle size={12} />
                  <span>Task wirklich löschen?</span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FF3B30] text-white text-xs font-medium rounded-lg hover:bg-[#FF3B30] disabled:opacity-40 transition-colors"
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
                  className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  Nein
                </button>
              </div>
            ) : (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#FF3B30] hover:text-[#FF3B30] hover:bg-[#FF3B30]/5 rounded-lg disabled:opacity-40 transition-colors"
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

/* ── Small reusable info row component ── */
function InfoRow({ icon, label, value, mono = false }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 flex items-center justify-center text-text-muted mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] text-text-muted">{label}</div>
        <div className={`text-[10px] text-text-primary ${mono ? 'font-mono' : ''} break-all`}>{value}</div>
      </div>
    </div>
  );
}
