import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Home, Map as MapIcon, Navigation, User, ChevronLeft, Search, Filter, X,
  CheckCircle2, FileText, PenTool, MapPin, Phone, Mail, Building2,
  ChevronRight, Clock, Loader2, Check, AlertCircle, RotateCcw,
  ExternalLink, Eye, Star,
} from 'lucide-react';
import { fetchAllAcquisition } from '../utils/airtableService';
import SignaturePad from './SignaturePad';

/* ═══════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════ */

const CITIES = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Düsseldorf', 'Stuttgart'];

const DISPLAY_SIZES = ['32"', '43"', '55"'];
const MOUNT_TYPES = ['Wandhalterung', 'Standfuß', 'Decke'];

const CHECKLIST_ITEMS = [
  { id: 'streetview_ok', label: 'Schaufenster auf Google Street View geprüft', detail: 'Standort hat ein sichtbares Schaufenster für Passanten' },
  { id: 'display_size', label: 'Display-Größe abgestimmt', detail: '32" / 43" / 55" — passend für den Standort gewählt' },
  { id: 'position', label: 'Positionierung im Schaufenster bestätigt', detail: 'Optimale Sichtbarkeit für Passanten sichergestellt' },
  { id: 'power', label: 'Steckdose vorhanden und erreichbar', detail: 'Stromversorgung in max. 2m Entfernung verfügbar' },
  { id: 'window_size', label: 'Fenstergröße passt für Display', detail: 'Schaufenster bietet ausreichend Platz für gewählte Display-Größe' },
  { id: 'wifi', label: 'WLAN/Internet verfügbar', detail: 'Stabiles WLAN mit min. 10 Mbit/s Download' },
  { id: 'mount_type', label: 'Montage-Typ geklärt', detail: 'Wandhalterung / Standfuß / Decke — abgestimmt mit Vermieter' },
  { id: 'hours', label: 'Öffnungszeiten bestätigt (min. 12h/Tag)', detail: 'Display ist mindestens 12 Stunden pro Tag sichtbar' },
  { id: 'access', label: 'Zugang für Techniker gewährleistet', detail: 'Techniker kann bei Bedarf jederzeit zum Display gelangen' },
  { id: 'sunlight', label: 'Keine direkte Sonneneinstrahlung', detail: 'Direktes Sonnenlicht beeinträchtigt Lesbarkeit und Lebensdauer' },
  { id: 'landlord', label: 'Vermieter/Eigentümer informiert', detail: 'Genehmigung für Display-Installation liegt vor' },
];

/* ─── PLZ → approx. coordinates for map (Germany major areas) ─── */
const PLZ_COORDS = {
  '10': [52.52, 13.405], '12': [52.475, 13.44], '13': [52.57, 13.35],
  '14': [52.40, 13.08], '20': [53.55, 9.99], '21': [53.53, 10.02],
  '22': [53.57, 10.05], '40': [51.23, 6.77], '41': [51.19, 6.84],
  '42': [51.27, 7.17], '44': [51.51, 7.47], '45': [51.46, 7.01],
  '47': [51.43, 6.76], '48': [51.96, 7.63], '50': [50.94, 6.96],
  '51': [50.96, 7.01], '53': [50.73, 7.10], '55': [50.00, 8.27],
  '60': [50.11, 8.68], '61': [50.14, 8.74], '63': [50.10, 8.77],
  '65': [50.08, 8.24], '68': [49.49, 8.47], '69': [49.41, 8.69],
  '70': [48.78, 9.18], '71': [48.73, 9.12], '72': [48.52, 9.06],
  '73': [48.73, 9.32], '76': [49.01, 8.40], '80': [48.14, 11.58],
  '81': [48.11, 11.60], '82': [48.05, 11.50], '83': [47.86, 12.12],
  '85': [48.25, 11.65], '86': [48.37, 10.90], '90': [49.45, 11.08],
  '91': [49.50, 11.06],
};

function getCoordFromPLZ(plz) {
  if (!plz || plz.length < 2) return null;
  const prefix = plz.substring(0, 2);
  return PLZ_COORDS[prefix] || null;
}

const CITY_COORDS = {
  'Berlin': [52.52, 13.405], 'Hamburg': [53.5511, 9.9937],
  'München': [48.1351, 11.582], 'Köln': [50.9375, 6.9603],
  'Frankfurt': [50.1109, 8.6821], 'Düsseldorf': [51.2277, 6.7735],
  'Stuttgart': [48.7758, 9.1829], 'Leipzig': [51.3397, 12.3731],
  'Dortmund': [51.5136, 7.4653], 'Essen': [51.4556, 7.0116],
  'Hannover': [52.3759, 9.7320], 'Nürnberg': [49.4521, 11.0767],
  'Bremen': [53.0793, 8.8017], 'Dresden': [51.0504, 13.7373],
  'Mannheim': [49.4875, 8.4660], 'Augsburg': [48.3705, 10.8978],
  'Wiesbaden': [50.0782, 8.2398], 'Bonn': [50.7374, 7.0982],
};

/* ═══════════════════════════════════════════════════════════
 *  HELPER: Google Street View URL
 * ═══════════════════════════════════════════════════════════ */

function getStreetViewUrl(lead) {
  const parts = [lead.street, lead.streetNumber, lead.postalCode, lead.city?.[0] || ''].filter(Boolean);
  if (parts.length < 2) return null;
  const q = encodeURIComponent(parts.join(', ') + ', Deutschland');
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=0,0&pano=&query=${q}`;
}

function getGoogleMapsUrl(lead) {
  const parts = [lead.locationName, lead.street, lead.streetNumber, lead.postalCode, lead.city?.[0] || ''].filter(Boolean);
  return `https://www.google.com/maps/search/${encodeURIComponent(parts.join(', '))}`;
}

/* ═══════════════════════════════════════════════════════════
 *  BOTTOM TAB BAR
 * ═══════════════════════════════════════════════════════════ */

function BottomTabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'home', label: 'Leads', icon: Home },
    { id: 'map', label: 'Karte', icon: MapIcon },
    { id: 'route', label: 'Route', icon: Navigation },
    { id: 'profile', label: 'Profil', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[10002] bg-surface-primary border-t border-border-secondary/60 safe-bottom">
      <div className="flex items-center justify-around h-[50px]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
            >
              <Icon
                size={22}
                className={isActive ? 'text-[#007AFF]' : 'text-text-muted'}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span className={`text-[10px] mt-0.5 font-medium ${isActive ? 'text-[#007AFF]' : 'text-text-muted'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  iOS-STYLE TOGGLE SWITCH
 * ═══════════════════════════════════════════════════════════ */

function IOSToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-[#34C759]' : 'bg-surface-tertiary'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-[27px] w-[27px] transform rounded-full bg-surface-primary shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        } mt-[2px]`}
      />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  iOS NAV BAR
 * ═══════════════════════════════════════════════════════════ */

function NavBar({ title, onBack, rightAction }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[10003] bg-surface-primary border-b border-border-secondary/60 safe-top">
      <div className="flex items-center justify-between h-[44px] px-4">
        <div className="w-20">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-0.5 text-[#007AFF] text-[17px] font-normal -ml-1">
              <ChevronLeft size={22} className="text-[#007AFF]" />
              <span>Zurück</span>
            </button>
          )}
        </div>
        <h1 className="text-[17px] font-semibold text-black truncate max-w-[200px]">{title}</h1>
        <div className="w-20 flex justify-end">
          {rightAction}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  STEP INDICATOR
 * ═══════════════════════════════════════════════════════════ */

function StepIndicator({ currentStep, totalSteps }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < currentStep ? 'w-6 bg-[#007AFF]' :
            i === currentStep ? 'w-8 bg-[#007AFF]' :
            'w-6 bg-surface-tertiary'
          }`}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  STEP 1: LEAD-SUCHE (nur New Leads aus DB)
 * ═══════════════════════════════════════════════════════════ */

function StepSearch({ newLeads, onSelectLead }) {
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  const filtered = useMemo(() => {
    let list = newLeads || [];
    if (cityFilter) {
      list = list.filter(d => (d.city || []).some(c => c === cityFilter));
    }
    if (search.length >= 2) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.locationName || '').toLowerCase().includes(q) ||
        (d.street || '').toLowerCase().includes(q) ||
        (d.postalCode || '').toLowerCase().includes(q) ||
        (d.jetId || '').toLowerCase().includes(q) ||
        (d.contactPerson || '').toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50);
  }, [newLeads, search, cityFilter]);

  // City counts
  const cityCounts = useMemo(() => {
    const counts = {};
    for (const d of (newLeads || [])) {
      const c = d.city?.[0];
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [newLeads]);

  return (
    <div className="flex flex-col h-full">
      {/* Search + City Filter */}
      <div className="px-4 pb-3 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Standort, Straße, PLZ oder Kontakt suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface-secondary rounded-xl pl-10 pr-4 py-3 text-[15px] text-text-primary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
              <X size={16} />
            </button>
          )}
        </div>

        {/* City filter chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setCityFilter('')}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              !cityFilter ? 'bg-[#007AFF] text-white' : 'bg-surface-secondary text-text-secondary'
            }`}
          >
            Alle ({newLeads?.length || 0})
          </button>
          {CITIES.map(city => {
            const count = cityCounts[city] || 0;
            if (!count) return null;
            return (
              <button
                key={city}
                onClick={() => setCityFilter(cityFilter === city ? '' : city)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                  cityFilter === city ? 'bg-[#007AFF] text-white' : 'bg-surface-secondary text-text-secondary'
                }`}
              >
                {city} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Lead List */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide px-1 mb-2">
          {filtered.length} neue Leads {cityFilter ? `in ${cityFilter}` : ''}
        </div>

        <div className="space-y-2">
          {filtered.map(lead => (
            <button
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className="w-full bg-surface-primary rounded-2xl shadow-sm border border-gray-100 px-4 py-3.5 flex items-center gap-3 text-left active:bg-surface-secondary transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
                <Building2 size={18} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium text-text-primary truncate">{lead.locationName || 'Unbekannt'}</div>
                <div className="text-[12px] text-text-muted truncate">
                  {[lead.street, lead.streetNumber].filter(Boolean).join(' ')}
                  {lead.postalCode ? ` · ${lead.postalCode}` : ''}
                  {lead.city?.length > 0 ? ` · ${lead.city[0]}` : ''}
                </div>
                {lead.contactPerson && (
                  <div className="text-[11px] text-text-muted mt-0.5">{lead.contactPerson}</div>
                )}
              </div>
              <ChevronRight size={16} className="text-text-muted shrink-0" />
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <MapPin size={32} className="text-text-muted mx-auto mb-3" />
            <div className="text-[15px] text-text-muted">Keine neuen Leads gefunden</div>
            <div className="text-[13px] text-text-muted mt-1">
              {search ? 'Versuche einen anderen Suchbegriff' : 'Aktuell keine Leads mit Status "New Lead"'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  STEP 2: STANDORT-DETAILS (read-only + Street View)
 * ═══════════════════════════════════════════════════════════ */

function StepDetails({ lead, formData, onFormChange, onNext, onBack }) {
  const streetViewUrl = getStreetViewUrl(lead);
  const mapsUrl = getGoogleMapsUrl(lead);
  const address = [lead.street, lead.streetNumber].filter(Boolean).join(' ');
  const fullAddress = [address, lead.postalCode, lead.city?.[0]].filter(Boolean).join(', ');

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-32">
      <StepIndicator currentStep={0} totalSteps={4} />

      <div className="px-4 space-y-5">
        {/* Location Info (read-only from DB) */}
        <div>
          <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Standort-Information</div>
          <div className="bg-surface-primary rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-4 py-3.5 border-b border-border-secondary">
              <div className="text-[12px] text-text-muted mb-0.5">Restaurant / Standort</div>
              <div className="text-[16px] font-semibold text-text-primary">{lead.locationName || '–'}</div>
            </div>
            <div className="px-4 py-3 border-b border-border-secondary">
              <div className="text-[12px] text-text-muted mb-0.5">Adresse</div>
              <div className="text-[15px] text-text-primary">{fullAddress || '–'}</div>
            </div>
            {lead.jetId && (
              <div className="px-4 py-3 border-b border-border-secondary">
                <div className="text-[12px] text-text-muted mb-0.5">JET-ID</div>
                <div className="text-[14px] text-text-primary">{lead.jetId}</div>
              </div>
            )}
            {lead.acquisitionPartner && (
              <div className="px-4 py-3">
                <div className="text-[12px] text-text-muted mb-0.5">Akquise Partner</div>
                <div className="text-[14px] text-text-primary">{lead.acquisitionPartner}</div>
              </div>
            )}
          </div>
        </div>

        {/* Contact Info (read-only from DB) */}
        {(lead.contactPerson || lead.contactEmail || lead.contactPhone) && (
          <div>
            <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Kontaktdaten</div>
            <div className="bg-surface-primary rounded-2xl shadow-sm overflow-hidden border border-gray-100">
              {lead.contactPerson && (
                <div className="px-4 py-3 border-b border-border-secondary">
                  <div className="text-[12px] text-text-muted mb-0.5">Ansprechpartner</div>
                  <div className="text-[15px] text-text-primary">{lead.contactPerson}</div>
                </div>
              )}
              {lead.contactEmail && (
                <a href={`mailto:${lead.contactEmail}`} className="flex items-center gap-3 px-4 py-3 border-b border-border-secondary active:bg-surface-secondary">
                  <Mail size={16} className="text-[#007AFF] shrink-0" />
                  <div className="text-[15px] text-[#007AFF]">{lead.contactEmail}</div>
                </a>
              )}
              {lead.contactPhone && (
                <a href={`tel:${lead.contactPhone}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-secondary">
                  <Phone size={16} className="text-[#007AFF] shrink-0" />
                  <div className="text-[15px] text-[#007AFF]">{lead.contactPhone}</div>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Google Street View Check */}
        <div>
          <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">
            Schaufenster prüfen
          </div>
          <div className="bg-surface-primary rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            {streetViewUrl && (
              <a
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3.5 border-b border-border-secondary active:bg-accent-light transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
                  <Eye size={18} className="text-[#007AFF]" />
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-medium text-[#007AFF]">Google Street View öffnen</div>
                  <div className="text-[12px] text-text-muted">Schaufenster auf Eignung prüfen</div>
                </div>
                <ExternalLink size={16} className="text-text-muted" />
              </a>
            )}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 active:bg-accent-light transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <MapPin size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-medium text-emerald-700">Google Maps öffnen</div>
                <div className="text-[12px] text-text-muted">Standort & Umgebung ansehen</div>
              </div>
              <ExternalLink size={16} className="text-text-muted" />
            </a>
          </div>
        </div>

        {/* Schaufenster-Bewertung (editable) */}
        <div>
          <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Vor-Ort Bewertung</div>
          <div className="bg-surface-primary rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="px-4 py-3 border-b border-border-secondary">
              <div className="text-[12px] text-text-muted mb-1.5">Schaufenster geeignet?</div>
              <div className="flex gap-2">
                {['Ja, gut geeignet', 'Bedingt geeignet', 'Nicht geeignet'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => onFormChange({ ...formData, windowAssessment: opt })}
                    className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-colors ${
                      formData.windowAssessment === opt
                        ? opt.includes('Nicht') ? 'bg-status-offline text-white' : opt.includes('Bedingt') ? 'bg-status-warning text-white' : 'bg-[#34C759] text-white'
                        : 'bg-surface-secondary text-text-secondary'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[12px] text-text-muted mb-1.5">Bemerkung zur Eignung</div>
              <textarea
                value={formData.windowNotes || ''}
                onChange={e => onFormChange({ ...formData, windowNotes: e.target.value })}
                placeholder="z.B. Großes Schaufenster, gute Passantenfrequenz..."
                rows={2}
                className="w-full text-[14px] text-text-primary placeholder-gray-300 focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!formData.windowAssessment}
          className={`w-full py-3.5 rounded-2xl text-[16px] font-semibold transition-all ${
            formData.windowAssessment
              ? 'bg-[#007AFF] text-white active:bg-[#0066DD]'
              : 'bg-surface-tertiary text-text-muted cursor-not-allowed'
          }`}
        >
          {formData.windowAssessment?.includes('Nicht')
            ? 'Als ungeeignet markieren'
            : 'Weiter zur Checkliste'
          }
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  STEP 3: PRE-INSTALLATION CHECKLIST
 * ═══════════════════════════════════════════════════════════ */

function StepChecklist({ checkedItems, onToggle, onNext, onBack, formData, onFormChange }) {
  const allChecked = CHECKLIST_ITEMS.every(item => checkedItems[item.id]);
  const checkedCount = CHECKLIST_ITEMS.filter(item => checkedItems[item.id]).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-32">
      <StepIndicator currentStep={1} totalSteps={4} />

      <div className="px-4">
        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] font-semibold text-text-primary">Pre-Installation Checklist</span>
            <span className={`text-[13px] font-medium ${allChecked ? 'text-[#34C759]' : 'text-text-muted'}`}>
              {checkedCount}/{CHECKLIST_ITEMS.length}
            </span>
          </div>
          <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-[#34C759] rounded-full transition-all duration-500"
              style={{ width: `${(checkedCount / CHECKLIST_ITEMS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Display size selection */}
        <div className="mb-4">
          <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Display-Größe</div>
          <div className="flex gap-2">
            {DISPLAY_SIZES.map(size => (
              <button
                key={size}
                onClick={() => onFormChange({ ...formData, displaySize: size })}
                className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
                  formData.displaySize === size
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-surface-primary text-text-primary border border-border-secondary'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Mount type selection */}
        <div className="mb-4">
          <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Montage-Typ</div>
          <div className="flex gap-2">
            {MOUNT_TYPES.map(type => (
              <button
                key={type}
                onClick={() => onFormChange({ ...formData, mountType: type })}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                  formData.mountType === type
                    ? 'bg-[#007AFF] text-white'
                    : 'bg-surface-primary text-text-primary border border-border-secondary'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Checklist Items */}
        <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2 mt-6">
          Alle Punkte bestätigen
        </div>
        <div className="bg-surface-primary rounded-2xl shadow-sm overflow-hidden">
          {CHECKLIST_ITEMS.map((item, idx) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${idx < CHECKLIST_ITEMS.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-[15px] font-medium ${checkedItems[item.id] ? 'text-text-primary' : 'text-text-primary'}`}>
                  {item.label}
                </div>
                <div className="text-[12px] text-text-muted mt-0.5">{item.detail}</div>
              </div>
              <IOSToggle
                checked={!!checkedItems[item.id]}
                onChange={(val) => onToggle(item.id, val)}
              />
            </div>
          ))}
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!allChecked}
          className={`w-full py-3.5 rounded-2xl text-[16px] font-semibold mt-6 transition-all ${
            allChecked
              ? 'bg-[#007AFF] text-white active:bg-[#0066DD]'
              : 'bg-surface-tertiary text-text-muted cursor-not-allowed'
          }`}
        >
          {allChecked ? 'Weiter zum Vertrag' : `Noch ${CHECKLIST_ITEMS.length - checkedCount} Punkte offen`}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  STEP 4: VERTRAG (Contract / Signing)
 * ═══════════════════════════════════════════════════════════ */

function StepContract({ lead, formData, signature, onSignatureChange, onSign, onBack }) {
  const address = [lead.street, lead.streetNumber].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-32">
      <StepIndicator currentStep={2} totalSteps={4} />

      <div className="px-4 space-y-5">
        {/* Contract Preview */}
        <div>
          <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Vertragsvorschau</div>
          <div className="bg-surface-primary rounded-2xl shadow-sm p-5 border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center">
                <FileText size={20} className="text-[#007AFF]" />
              </div>
              <div>
                <div className="text-[16px] font-semibold text-text-primary">Standort-Vertrag</div>
                <div className="text-[12px] text-text-muted">JET Germany DOOH Netzwerk</div>
              </div>
            </div>

            <div className="space-y-3 text-[13px] text-text-secondary">
              <div className="flex justify-between py-2 border-b border-border-secondary">
                <span className="text-text-muted">Standort</span>
                <span className="font-medium text-text-primary">{lead.locationName || '–'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border-secondary">
                <span className="text-text-muted">Adresse</span>
                <span className="font-medium text-text-primary">{address || '–'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border-secondary">
                <span className="text-text-muted">PLZ / Stadt</span>
                <span className="font-medium text-text-primary">{[lead.postalCode, lead.city?.[0]].filter(Boolean).join(' ') || '–'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border-secondary">
                <span className="text-text-muted">Display</span>
                <span className="font-medium text-text-primary">{formData.displaySize || '–'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border-secondary">
                <span className="text-text-muted">Montage</span>
                <span className="font-medium text-text-primary">{formData.mountType || '–'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border-secondary">
                <span className="text-text-muted">Ansprechpartner</span>
                <span className="font-medium text-text-primary">{lead.contactPerson || '–'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border-secondary">
                <span className="text-text-muted">Schaufenster</span>
                <span className="font-medium text-text-primary">{formData.windowAssessment || '–'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-text-muted">Datum</span>
                <span className="font-medium text-text-primary">
                  {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-surface-secondary rounded-xl text-[11px] text-text-muted leading-relaxed">
              Hiermit bestätigt der Standortinhaber die Bereitstellung der Fläche für die Installation eines JET Germany DOOH-Displays gemäß den vereinbarten Konditionen. Der Standort erfüllt alle technischen Voraussetzungen laut Pre-Installation Checklist.
            </div>
          </div>
        </div>

        {/* Signature */}
        <div>
          <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Unterschrift</div>
          <SignaturePad
            onChange={onSignatureChange}
            height={160}
          />
        </div>

        {/* Sign Button */}
        <button
          onClick={onSign}
          disabled={!signature}
          className={`w-full py-3.5 rounded-2xl text-[16px] font-semibold flex items-center justify-center gap-2 transition-all ${
            signature
              ? 'bg-[#34C759] text-white active:bg-[#2EB050]'
              : 'bg-surface-tertiary text-text-muted cursor-not-allowed'
          }`}
        >
          <PenTool size={18} />
          Vertrag unterschreiben
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  STEP 5: BESTÄTIGUNG (Confirmation)
 * ═══════════════════════════════════════════════════════════ */

function StepConfirmation({ lead, formData, signatureHash, onReset }) {
  const [showAnimation, setShowAnimation] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowAnimation(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 pb-24">
      <div className={`mb-6 transition-all duration-700 ${showAnimation ? 'scale-100' : 'scale-90'}`}>
        <div className="w-20 h-20 rounded-full bg-[#34C759] flex items-center justify-center akquise-success-pulse">
          <Check size={40} className="text-white" strokeWidth={3} />
        </div>
      </div>

      <h2 className="text-[22px] font-bold text-text-primary mb-2">Vertrag unterschrieben!</h2>
      <p className="text-[15px] text-text-muted text-center mb-8">
        {lead.locationName} wurde erfolgreich erfasst und wird an das System übermittelt.
      </p>

      {/* Summary card */}
      <div className="w-full bg-surface-primary rounded-2xl shadow-sm p-5 mb-6 border border-gray-100">
        <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-3">Zusammenfassung</div>
        <div className="space-y-2.5 text-[14px]">
          <div className="flex justify-between">
            <span className="text-text-muted">Standort</span>
            <span className="font-medium text-text-primary">{lead.locationName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Stadt</span>
            <span className="font-medium text-text-primary">{lead.city?.[0] || '–'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Display</span>
            <span className="font-medium text-text-primary">{formData.displaySize || '–'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Schaufenster</span>
            <span className="font-medium text-text-primary">{formData.windowAssessment || '–'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Zeitstempel</span>
            <span className="font-mono text-[12px] text-text-secondary">
              {new Date().toLocaleString('de-DE')}
            </span>
          </div>
          {signatureHash && (
            <div className="flex justify-between">
              <span className="text-text-muted">Signatur-Hash</span>
              <span className="font-mono text-[11px] text-text-muted">{signatureHash}</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onReset}
        className="w-full py-3.5 bg-[#007AFF] text-white rounded-2xl text-[16px] font-semibold flex items-center justify-center gap-2 active:bg-[#0066DD] transition-colors"
      >
        <RotateCcw size={18} />
        Nächsten Standort bearbeiten
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  MAP TAB — PLZ-based geocoding
 * ═══════════════════════════════════════════════════════════ */

function MapTab({ newLeads, onSelectLead }) {
  const [MapComponents, setMapComponents] = useState(null);

  useEffect(() => {
    Promise.all([
      import('react-leaflet'),
      import('leaflet/dist/leaflet.css'),
    ]).then(([rl]) => {
      setMapComponents(rl);
    }).catch(() => {});
  }, []);

  // Create markers with PLZ-based positions + golden-ratio jitter for same PLZ
  const markers = useMemo(() => {
    const plzGroups = {};
    return (newLeads || []).map((lead) => {
      const cityName = lead.city?.[0] || '';
      // Try PLZ first, then city, then skip
      let base = getCoordFromPLZ(lead.postalCode);
      if (!base) base = CITY_COORDS[cityName];
      if (!base) return null;

      // Track PLZ group for jitter offset
      const plzKey = lead.postalCode || cityName;
      if (!plzGroups[plzKey]) plzGroups[plzKey] = 0;
      const idx = plzGroups[plzKey]++;

      // Golden angle jitter for uniform distribution within PLZ area
      const goldenAngle = 2.399963; // radians
      const angle = idx * goldenAngle;
      const radius = 0.002 + Math.sqrt(idx) * 0.001; // spread increases with count
      const lat = base[0] + Math.cos(angle) * radius;
      const lng = base[1] + Math.sin(angle) * radius * 1.5; // wider in longitude

      return { ...lead, lat, lng };
    }).filter(Boolean);
  }, [newLeads]);

  if (!MapComponents) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[#007AFF]" />
      </div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Popup } = MapComponents;

  return (
    <div className="h-full relative">
      <MapContainer
        center={[51.1657, 10.4515]}
        zoom={6}
        className="h-full w-full"
        style={{ height: 'calc(100vh - 94px)', zIndex: 0 }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        {markers.map((m, i) => (
          <CircleMarker
            key={m.id || i}
            center={[m.lat, m.lng]}
            radius={7}
            pathOptions={{
              fillColor: '#007AFF',
              color: '#fff',
              weight: 2,
              fillOpacity: 0.8,
            }}
            eventHandlers={{
              click: () => onSelectLead?.(m),
            }}
          >
            <Popup>
              <div className="text-[13px] min-w-[180px]">
                <div className="font-semibold text-text-primary">{m.locationName || 'Unbekannt'}</div>
                <div className="text-text-muted text-[11px] mt-0.5">
                  {[m.street, m.streetNumber].filter(Boolean).join(' ')}
                  {m.postalCode ? ` · ${m.postalCode}` : ''}
                  {m.city?.[0] ? ` · ${m.city[0]}` : ''}
                </div>
                {m.contactPerson && (
                  <div className="text-[11px] text-text-muted mt-1">Kontakt: {m.contactPerson}</div>
                )}
                {m.schaufenster && (
                  <div className="text-[11px] text-text-muted mt-0.5">Schaufenster: {m.schaufenster}</div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Stats overlay */}
      <div className="absolute top-3 left-3 right-3 z-[1000]">
        <div className="bg-surface-primary rounded-xl px-4 py-2.5 shadow-lg border border-gray-100 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-text-primary">{markers.length} neue Leads auf Karte</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  ROUTE TAB
 * ═══════════════════════════════════════════════════════════ */

function RouteTab({ newLeads }) {
  const routeStops = useMemo(() => {
    return (newLeads || [])
      .filter(d => d.locationName && d.street)
      .slice(0, 8)
      .map((d, i) => ({
        ...d,
        order: i + 1,
      }));
  }, [newLeads]);

  const openGoogleMaps = () => {
    const destinations = routeStops
      .map(s => encodeURIComponent(`${s.street || ''} ${s.streetNumber || ''}, ${s.postalCode || ''} ${s.city?.[0] || ''}`))
      .join('/');
    const url = `https://www.google.com/maps/dir/${destinations}`;
    window.open(url, '_blank');
  };

  return (
    <div className="h-full overflow-y-auto pb-24">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[20px] font-bold text-text-primary">Tagesroute</h2>
            <p className="text-[13px] text-text-muted">{routeStops.length} Stopps</p>
          </div>
          {routeStops.length > 0 && (
            <button
              onClick={openGoogleMaps}
              className="px-4 py-2 bg-[#007AFF] text-white rounded-xl text-[13px] font-semibold flex items-center gap-1.5 active:bg-[#0066DD]"
            >
              <Navigation size={14} />
              Starten
            </button>
          )}
        </div>
      </div>

      <div className="px-4">
        {routeStops.map((stop, idx) => (
          <div key={stop.id} className="relative">
            {idx < routeStops.length - 1 && (
              <div className="absolute left-5 top-14 bottom-0 w-0.5 bg-surface-tertiary z-0" />
            )}

            <div className="relative z-10 flex gap-3 pb-4">
              <div className="w-10 h-10 rounded-full bg-[#007AFF] text-white flex items-center justify-center text-[14px] font-bold shrink-0 shadow-sm">
                {stop.order}
              </div>

              <div className="flex-1 bg-surface-primary rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="text-[15px] font-semibold text-text-primary truncate">{stop.locationName}</div>
                <div className="text-[12px] text-text-muted mt-0.5">
                  {[stop.street, stop.streetNumber].filter(Boolean).join(' ')}
                  {stop.postalCode ? `, ${stop.postalCode}` : ''}
                  {stop.city?.[0] ? ` ${stop.city[0]}` : ''}
                </div>
                {stop.contactPerson && (
                  <div className="text-[12px] text-text-muted mt-1">
                    <span className="text-text-muted">Kontakt:</span> {stop.contactPerson}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {routeStops.length === 0 && (
          <div className="text-center py-16">
            <Navigation size={32} className="text-text-muted mx-auto mb-3" />
            <div className="text-[15px] text-text-muted">Keine Leads mit Adresse</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  PROFILE TAB
 * ═══════════════════════════════════════════════════════════ */

function ProfileTab({ totalLeads, newLeads }) {
  return (
    <div className="h-full overflow-y-auto pb-24 px-4 pt-4">
      <div className="bg-surface-primary rounded-2xl shadow-sm p-5 mb-5 text-center border border-gray-100">
        <div className="w-16 h-16 rounded-full bg-[#007AFF] flex items-center justify-center mx-auto mb-3">
          <span className="text-white text-[22px] font-bold">JG</span>
        </div>
        <div className="text-[18px] font-bold text-text-primary">JET Germany</div>
        <div className="text-[13px] text-text-muted">Akquise-Team</div>
      </div>

      <div className="text-[13px] font-medium text-text-muted uppercase tracking-wide mb-2">Akquise-Übersicht</div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-surface-primary rounded-2xl shadow-sm p-4 border border-gray-100">
          <div className="text-[24px] font-bold text-accent">{newLeads?.length || 0}</div>
          <div className="text-[12px] text-text-muted">Offene Leads</div>
        </div>
        <div className="bg-surface-primary rounded-2xl shadow-sm p-4 border border-gray-100">
          <div className="text-[24px] font-bold text-text-secondary">{totalLeads || 0}</div>
          <div className="text-[12px] text-text-muted">Gesamt in DB</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  MAIN APP COMPONENT
 * ═══════════════════════════════════════════════════════════ */

export default function AkquiseApp({ onClose, standalone = false }) {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navigation
  const [activeTab, setActiveTab] = useState('home');
  const [flowStep, setFlowStep] = useState(0); // 0=search, 1=details, 2=checklist, 3=contract, 4=confirmation
  const [selectedLead, setSelectedLead] = useState(null);

  // Form state
  const [formData, setFormData] = useState({});
  const [checkedItems, setCheckedItems] = useState({});
  const [signature, setSignature] = useState(null);
  const [signatureHash, setSignatureHash] = useState('');

  // Filter only "New Lead" records
  const newLeads = useMemo(() => {
    return (allData || []).filter(r => r.leadStatus === 'New Lead' && !r.akquiseStorno);
  }, [allData]);

  // Load data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchAllAcquisition();
        if (!cancelled) setAllData(data);
      } catch (e) {
        console.error('[AkquiseApp] Load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Navigation helpers
  const goToStep = useCallback((step) => {
    setFlowStep(step);
  }, []);

  const handleSelectLead = useCallback((lead) => {
    setSelectedLead(lead);
    setFormData({
      windowAssessment: '',
      windowNotes: '',
      displaySize: '',
      mountType: '',
    });
    setCheckedItems({});
    setSignature(null);
    setSignatureHash('');
    goToStep(1);
    // Switch to home tab if coming from map
    setActiveTab('home');
  }, [goToStep]);

  const handleToggleCheck = useCallback((id, value) => {
    setCheckedItems(prev => ({ ...prev, [id]: value }));
  }, []);

  const handleSign = useCallback(() => {
    const hash = `SIG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    setSignatureHash(hash);
    goToStep(4);
  }, [goToStep]);

  const handleReset = useCallback(() => {
    setSelectedLead(null);
    setFormData({});
    setCheckedItems({});
    setSignature(null);
    setSignatureHash('');
    setFlowStep(0);
  }, []);

  // Handle "not suitable" from step 2
  const handleStepDetailsNext = useCallback(() => {
    if (formData.windowAssessment === 'Nicht geeignet') {
      // Skip to confirmation with "not suitable" status
      goToStep(4);
    } else {
      goToStep(2);
    }
  }, [formData.windowAssessment, goToStep]);

  // Nav title
  const getNavTitle = () => {
    if (activeTab === 'map') return 'Karte';
    if (activeTab === 'route') return 'Route';
    if (activeTab === 'profile') return 'Profil';
    const titles = ['Neue Leads', 'Standort-Details', 'Checkliste', 'Vertrag', 'Bestätigung'];
    return titles[flowStep] || 'Akquise';
  };

  const getNavBack = () => {
    if (activeTab !== 'home') return () => setActiveTab('home');
    if (flowStep === 1) return () => goToStep(0);
    if (flowStep === 2) return () => goToStep(1);
    if (flowStep === 3) return () => goToStep(2);
    if (flowStep === 0 && !standalone) return onClose;
    return null;
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-[#F2F2F7] akquise-slide-in" style={{ width: '100vw', height: '100vh' }}>
      <NavBar
        title={getNavTitle()}
        onBack={getNavBack()}
        rightAction={
          activeTab === 'home' && flowStep === 0 ? (
            standalone ? (
              <button onClick={onClose} className="text-[#007AFF] text-[15px] font-normal flex items-center gap-1">
                <Home size={14} />
                Dashboard
              </button>
            ) : (
              <button onClick={onClose} className="text-[#007AFF] text-[15px] font-normal">
                Schließen
              </button>
            )
          ) : null
        }
      />

      <div
        className="overflow-hidden"
        style={{
          paddingTop: 'calc(44px + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(50px + env(safe-area-inset-bottom, 0px))',
          height: '100vh',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 size={32} className="animate-spin text-[#007AFF] mx-auto mb-3" />
              <div className="text-[15px] text-text-muted">Lade Akquise-Daten...</div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <div className="h-full" key={`step-${flowStep}`}>
                {flowStep === 0 && (
                  <StepSearch
                    newLeads={newLeads}
                    onSelectLead={handleSelectLead}
                  />
                )}
                {flowStep === 1 && selectedLead && (
                  <StepDetails
                    lead={selectedLead}
                    formData={formData}
                    onFormChange={setFormData}
                    onNext={handleStepDetailsNext}
                    onBack={() => goToStep(0)}
                  />
                )}
                {flowStep === 2 && (
                  <StepChecklist
                    checkedItems={checkedItems}
                    onToggle={handleToggleCheck}
                    onNext={() => goToStep(3)}
                    onBack={() => goToStep(1)}
                    formData={formData}
                    onFormChange={setFormData}
                  />
                )}
                {flowStep === 3 && selectedLead && (
                  <StepContract
                    lead={selectedLead}
                    formData={formData}
                    signature={signature}
                    onSignatureChange={setSignature}
                    onSign={handleSign}
                    onBack={() => goToStep(2)}
                  />
                )}
                {flowStep === 4 && selectedLead && (
                  <StepConfirmation
                    lead={selectedLead}
                    formData={formData}
                    signatureHash={signatureHash}
                    onReset={handleReset}
                  />
                )}
              </div>
            )}

            {activeTab === 'map' && (
              <MapTab newLeads={newLeads} onSelectLead={handleSelectLead} />
            )}

            {activeTab === 'route' && (
              <RouteTab newLeads={newLeads} />
            )}

            {activeTab === 'profile' && (
              <ProfileTab totalLeads={allData.length} newLeads={newLeads} />
            )}
          </>
        )}
      </div>

      <BottomTabBar activeTab={activeTab} onTabChange={(tab) => {
        setActiveTab(tab);
      }} />
    </div>
  );
}
