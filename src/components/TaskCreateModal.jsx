import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Save, AlertCircle, Loader2, Search, MapPin, User, Building2, Briefcase,
  FileText, Paperclip, Calendar, Phone, Mail, Info, ExternalLink, Trash2,
  ClipboardList,
} from 'lucide-react';
import { fetchAllStammdaten, fetchInstallationByDisplayId } from '../utils/airtableService';
import { fetchAllUsers } from '../utils/authService';

/* ──────────────────────── constants ──────────────────────── */

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

/* ── Task-Vorlagen / Templates ── */
const TASK_TEMPLATES = [
  {
    id: 'display_stoerung',
    label: 'Display-Störung',
    title: 'Display-Störung – {standort}',
    description: `Display zeigt kein Signal bzw. ist nicht erreichbar.

Erforderliche Maßnahmen:
- Stromversorgung überprüfen
- Netzwerkverbindung testen (SIM / LAN)
- Remote-Zugriff auf OPS prüfen
- Bei Bedarf Techniker vor Ort beauftragen

{details}`,
    priority: 'High',
  },
  {
    id: 'wartung',
    label: 'Planmäßige Wartung',
    title: 'Planmäßige Wartung – {standort}',
    description: `Geplante Wartung am Standort.

Wartungsumfang:
- Hardware-Überprüfung (Screen, OPS, Verkabelung)
- Kühlsystem / Lüftung kontrollieren
- Software-/Firmware-Updates einspielen
- Reinigung des Display-Gehäuses
- Allgemeinen Zustand dokumentieren

{details}`,
    priority: 'Medium',
  },
  {
    id: 'techniker_einsatz',
    label: 'Techniker-Einsatz',
    title: 'Techniker-Einsatz erforderlich – {standort}',
    description: `Vor-Ort-Einsatz durch Techniker notwendig.

Grund: [bitte ergänzen]

Vorbereitung:
- Termin mit Standort-Kontakt abstimmen
- Zugangsinformationen prüfen
- Benötigtes Material / Werkzeug klären

{details}`,
    priority: 'High',
  },
  {
    id: 'display_austausch',
    label: 'Display-Austausch',
    title: 'Display-Austausch – {standort}',
    description: `Austausch des Displays erforderlich.

Grund: [bitte ergänzen]

Vorbereitung:
- Neues Display bestellen / bereitstellen
- Techniker-Termin koordinieren
- Rückgabe des defekten Displays organisieren

{details}`,
    priority: 'High',
  },
  {
    id: 'netzwerk_problem',
    label: 'Netzwerk / Konnektivität',
    title: 'Netzwerkproblem – {standort}',
    description: `Konnektivitätsproblem am Standort.

Symptome:
- Display meldet sich nicht / offline
- Heartbeat ausgeblieben seit: [Datum]

Zu prüfen:
- SIM-Karte Status
- Router / Switch vor Ort
- Firewall-Regeln beim Standort-Betreiber
- Ggf. alternative Verbindung (LAN ↔ SIM)

{details}`,
    priority: 'High',
  },
  {
    id: 'content_update',
    label: 'Content-Update',
    title: 'Content-Update – {standort}',
    description: `Neuer Content soll ausgespielt werden.

Details:
- Kampagne / Inhalt: [bitte ergänzen]
- Gewünschter Starttermin: [Datum]
- Laufzeit: [Zeitraum]

{details}`,
    priority: 'Medium',
  },
  {
    id: 'installation_neu',
    label: 'Neuinstallation',
    title: 'Neuinstallation Display – {standort}',
    description: `Neue Display-Installation am Standort.

Checkliste:
- Standort-Begehung durchgeführt
- Stromanschluss vorhanden
- Internetanschluss vorhanden (SIM / LAN)
- Montageart festgelegt
- Integrator beauftragt
- Installationstermin: [Datum]

{details}`,
    priority: 'Medium',
  },
  {
    id: 'reklamation',
    label: 'Reklamation / Beschwerde',
    title: 'Reklamation – {standort}',
    description: `Reklamation / Beschwerde vom Standort-Betreiber.

Anliegen: [bitte ergänzen]

Sofortmaßnahmen:
- Kontakt mit Standort aufnehmen
- Problem dokumentieren
- Lösungsvorschlag erarbeiten

{details}`,
    priority: 'High',
  },
];

const STATUS_OPTIONS = [
  'New',
  'In Progress',
  'Follow Up',
  'On Hold',
  'In Review',
  'Completed',
];

const PRIORITY_OPTIONS = ['Urgent', 'High', 'Medium', 'Low'];

const STATUS_COLORS = {
  'New':         '#3b82f6',
  'In Progress': '#f59e0b',
  'Follow Up':   '#a855f7',
  'On Hold':     '#64748b',
  'In Review':   '#06b6d4',
  'Completed':   '#22c55e',
};

const PRIORITY_COLORS = {
  'Urgent': '#dc2626',
  'High':   '#ef4444',
  'Medium': '#f59e0b',
  'Low':    '#22c55e',
};

/* ──────────────────────── component ──────────────────────── */

export default function TaskCreateModal({ isOpen, onClose, onSave, loading = false, error: externalError = null }) {
  const [title, setTitle] = useState('');
  const [partner, setPartner] = useState('');
  const [status, setStatus] = useState('New');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  // Location & user fields
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState('');

  // Data sources
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [dashboardUsers, setDashboardUsers] = useState([]);

  // Installation details (auto-loaded when location is selected)
  const [installationData, setInstallationData] = useState(null);
  const [installationLoading, setInstallationLoading] = useState(false);

  // File attachments
  const [pendingFiles, setPendingFiles] = useState([]);

  const backdropRef = useRef(null);
  const titleInputRef = useRef(null);
  const locationDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  /* Load locations & users when modal opens */
  useEffect(() => {
    if (isOpen) {
      // Reset form
      setTitle('');
      setPartner('');
      setStatus('New');
      setPriority('Medium');
      setDueDate('');
      setDescription('');
      setErrors({});
      setSelectedLocation(null);
      setLocationSearch('');
      setShowLocationDropdown(false);
      setAssignedUserId('');
      setInstallationData(null);
      setInstallationLoading(false);
      setPendingFiles([]);

      // Load data (fetchAllUsers is async - loads from Supabase)
      fetchAllUsers()
        .then((users) => setDashboardUsers(users || []))
        .catch(() => setDashboardUsers([]));

      setLocationsLoading(true);
      fetchAllStammdaten()
        .then((data) => setLocations(data))
        .catch(() => setLocations([]))
        .finally(() => setLocationsLoading(false));

      // Don't auto-focus title – location search is the first field now
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
    setInstallationData(null);
  };

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

  /* Format date as DD.MM.YYYY */
  const formatDateDE = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  /* Insert auto-details into description */
  const handleInsertDetails = () => {
    if (!selectedLocation) return;
    const loc = selectedLocation;
    const inst = installationData;

    const lines = [];
    lines.push(`📍 Standort: ${loc.name}`);
    if (loc.city) {
      const addr = [loc.street, loc.streetNumber].filter(Boolean).join(' ');
      lines.push(`Adresse: ${addr ? addr + ', ' : ''}${loc.postalCode || ''} ${loc.city}`.trim());
    }
    if (loc.jetIds?.[0]) lines.push(`JET ID: ${loc.jetIds[0]}`);
    if (loc.displayIds?.length) lines.push(`Display IDs: ${loc.displayIds.join(', ')}`);
    if (loc.contactPerson) lines.push(`Kontakt: ${loc.contactPerson}`);
    if (loc.contactPhone) lines.push(`Telefon: ${loc.contactPhone}`);
    if (loc.contactEmail) lines.push(`E-Mail: ${loc.contactEmail}`);
    if (inst?.installDate) lines.push(`Aufbaudatum: ${formatDateDE(inst.installDate)}`);
    if (inst?.status) lines.push(`Installations-Status: ${inst.status}`);
    if (inst?.integrator) lines.push(`Integrator: ${inst.integrator}`);
    if (inst?.protocol?.[0]?.url) lines.push(`Protokoll: ${inst.protocol[0].url}`);
    if (loc.leadStatus?.length) lines.push(`Akquise-Status: ${loc.leadStatus.join(', ')}`);

    const block = lines.join('\n');
    setDescription((prev) => (prev ? prev + '\n\n---\n' + block : block));
  };

  /* File handling */
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => f.size <= 10 * 1024 * 1024); // Max 10MB
    if (valid.length < files.length) {
      alert('Dateien über 10 MB werden übersprungen.');
    }
    setPendingFiles((prev) => [...prev, ...valid]);
    e.target.value = ''; // Reset input
  };

  const removePendingFile = (index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /* Apply a task template */
  const handleApplyTemplate = (templateId) => {
    if (!templateId) return;
    const tmpl = TASK_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;

    const standortName = selectedLocation?.name || '[Standort auswählen]';

    // Build details block from location + installation
    const detailLines = [];
    if (selectedLocation) {
      const loc = selectedLocation;
      const inst = installationData;
      if (loc.city) {
        const addr = [loc.street, loc.streetNumber].filter(Boolean).join(' ');
        detailLines.push(`Adresse: ${addr ? addr + ', ' : ''}${loc.postalCode || ''} ${loc.city}`.trim());
      }
      if (loc.jetIds?.[0]) detailLines.push(`JET ID: ${loc.jetIds[0]}`);
      if (loc.displayIds?.length) detailLines.push(`Display IDs: ${loc.displayIds.join(', ')}`);
      if (loc.contactPerson) detailLines.push(`Kontakt: ${loc.contactPerson}`);
      if (loc.contactPhone) detailLines.push(`Telefon: ${loc.contactPhone}`);
      if (inst?.installDate) detailLines.push(`Aufbaudatum: ${formatDateDE(inst.installDate)}`);
      if (inst?.integrator) detailLines.push(`Integrator: ${inst.integrator}`);
      if (inst?.screenType) detailLines.push(`Screen: ${inst.screenType}${inst.screenSize ? ` (${inst.screenSize})` : ''}`);
      if (inst?.opsNr) detailLines.push(`OPS Nr: ${inst.opsNr}`);
      if (inst?.simId) detailLines.push(`SIM-ID: ${inst.simId}`);
      if (inst?.protocol?.[0]?.url) detailLines.push(`Protokoll: ${inst.protocol[0].url}`);
    }

    const detailsBlock = detailLines.length > 0
      ? '--- Standort-Info ---\n' + detailLines.join('\n')
      : '';

    setTitle(tmpl.title.replace('{standort}', standortName));
    setDescription(tmpl.description.replace('{details}', detailsBlock).trim());
    setPriority(tmpl.priority || 'Medium');
    setErrors({});
  };

  /* Validate & submit */
  const handleSubmit = (e) => {
    if (e) e.preventDefault();

    const newErrors = {};
    if (!title.trim()) {
      newErrors.title = 'Titel ist erforderlich';
    }
    if (!selectedLocation) {
      newErrors.location = 'Standort ist erforderlich';
    }
    if (!partner) {
      newErrors.partner = 'Partner ist erforderlich';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const taskData = {
      title: title.trim(),
      partner,
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

    // Add assigned user (name for display, email for Airtable Collaborator field)
    if (assignedUserId) {
      const user = dashboardUsers.find((u) => u.id === assignedUserId);
      if (user) {
        taskData.assignedUserName = user.name;
        taskData.assignedUserEmail = user.email;
      }
    }

    // Include pending files for upload
    if (pendingFiles.length > 0) {
      taskData.pendingFiles = pendingFiles;
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
          {/* ── 1. Standort / Location (searchable) — first, so template can use details ── */}
          <div ref={locationDropdownRef} className="relative">
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              <MapPin size={11} className="inline -mt-0.5 mr-1 text-slate-400" />
              Standort <span className="text-[#ef4444]">*</span>
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
                  className={`w-full pl-9 pr-3 py-2.5 bg-slate-50/80 border rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors disabled:opacity-50 ${
                    errors.location
                      ? 'border-[#ef4444] focus:border-[#ef4444]'
                      : 'border-slate-200/60 focus:border-[#3b82f6]'
                  }`}
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

          {/* ── Vorlage / Template Selector (after location so details are available) ── */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              <ClipboardList size={11} className="inline -mt-0.5 mr-1 text-slate-400" />
              Vorlage verwenden
            </label>
            <select
              onChange={(e) => {
                handleApplyTemplate(e.target.value);
                e.target.value = ''; // reset select after applying
              }}
              className="w-full appearance-none px-3 py-2.5 bg-gradient-to-r from-slate-50/80 to-[#3b82f6]/[0.03] border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors"
            >
              <option value="">– Vorlage auswählen (optional) –</option>
              {TASK_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <p className="text-[9px] text-slate-400 mt-1">
              {selectedLocation
                ? 'Füllt Titel, Beschreibung & Priorität mit Standort-Details aus'
                : 'Erst Standort auswählen für vollständige Details'}
            </p>
          </div>

          {/* ── 3. Title ── */}
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

          {/* ── 4. Partner (required) ── */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              <Briefcase size={11} className="inline -mt-0.5 mr-1 text-slate-400" />
              Partner <span className="text-[#ef4444]">*</span>
            </label>
            <select
              value={partner}
              onChange={(e) => {
                setPartner(e.target.value);
                if (errors.partner) setErrors((prev) => ({ ...prev, partner: null }));
              }}
              className={`w-full appearance-none px-3 py-2.5 bg-slate-50/80 border rounded-lg text-xs text-slate-900 focus:outline-none transition-colors pr-8 ${
                errors.partner
                  ? 'border-[#ef4444] focus:border-[#ef4444]'
                  : 'border-slate-200/60 focus:border-[#3b82f6]'
              }`}
            >
              <option value="">– Partner auswählen –</option>
              {PARTNERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {errors.partner && (
              <div className="flex items-center gap-1 mt-1.5 text-[#ef4444]">
                <AlertCircle size={11} />
                <span className="text-[10px]">{errors.partner}</span>
              </div>
            )}
          </div>

          {/* ── 5. Status & Priority row ── */}
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

          {/* ── 6. Zuständig / Assigned User ── */}
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

          {/* Description + Auto-Details */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-medium text-slate-600">
                Beschreibung
              </label>
              {selectedLocation && (
                <button
                  type="button"
                  onClick={handleInsertDetails}
                  disabled={installationLoading}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3b82f6] hover:text-[#2563eb] transition-colors disabled:opacity-50"
                >
                  {installationLoading ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Info size={10} />
                  )}
                  Standort-Details einfügen
                </button>
              )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={description.split('\n').length > 4 ? 8 : 3}
              placeholder="Optionale Beschreibung der Aufgabe..."
              className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors resize-none"
            />
          </div>

          {/* ── Anhänge / Attachments ── */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
              <Paperclip size={11} className="inline -mt-0.5 mr-1 text-slate-400" />
              Anhänge
            </label>

            {/* File list */}
            {pendingFiles.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {pendingFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50/80 border border-slate-200/60 rounded-lg"
                  >
                    <FileText size={13} className="text-[#3b82f6] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-900 truncate">{file.name}</div>
                      <div className="text-[9px] text-slate-400">{formatFileSize(file.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="p-0.5 rounded hover:bg-slate-100/60 text-slate-400 hover:text-[#ef4444] transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50/80 border border-dashed border-slate-300/60 rounded-lg text-[10px] font-medium text-slate-500 hover:text-[#3b82f6] hover:border-[#3b82f6]/40 transition-colors"
            >
              <Paperclip size={11} />
              Datei anfügen
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFileSelect}
              accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.csv,.txt"
            />
            <p className="text-[9px] text-slate-400 mt-1">Max. 10 MB pro Datei · Bilder, PDF, Office-Dokumente</p>
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
