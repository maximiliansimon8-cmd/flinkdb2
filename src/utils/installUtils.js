/**
 * Shared utilities for Installation components
 * Consolidates duplicated constants, API endpoints, and helper functions
 */

// Dynamic import to avoid circular dependency / TDZ issues between
// installUtils ↔ airtableService (airtableService is a 42KB chunk)
let _clearAirtableCache = null;
async function clearAirtableCache() {
  if (!_clearAirtableCache) {
    const mod = await import('./airtableService');
    _clearAirtableCache = mod.clearAirtableCache;
  }
  _clearAirtableCache();
}

// ─── API Endpoints ─────
export const INSTALL_API = {
  SCHEDULE: '/api/install-schedule',
  TEAMS:    '/api/install-schedule/teams',
  BOOKINGS: '/api/install-booker/status',
  DETAIL:   '/api/install-booker/detail',
  INVITE:   '/api/install-booker/invite',
  TEMPLATES:'/api/install-booker/templates',
  SLOTS:    '/api/install-booker/slots',
  FLAGS:    '/api/feature-flags',
  MONTEUR:       '/api/install-monteur',
  MONTEUR_LINK:  '/api/install-monteur/link',
  MONTEUR_STATUS:'/api/install-monteur/status',
};

// ─── Status Colors (Tailwind classes — TeamDashboard, BookingsDashboard) ─────
export const STATUS_COLORS = {
  confirmed:  { bg: 'bg-green-100',    text: 'text-green-700',    border: 'border-green-200',    dot: 'bg-green-500',    label: 'Bestätigt' },
  booked:     { bg: 'bg-green-100',    text: 'text-green-700',    border: 'border-green-200',    dot: 'bg-green-500',    label: 'Bestätigt' },
  pending:    { bg: 'bg-yellow-100',   text: 'text-yellow-700',   border: 'border-yellow-200',   dot: 'bg-yellow-500',   label: 'Ausstehend' },
  completed:  { bg: 'bg-emerald-100',  text: 'text-emerald-700',  border: 'border-emerald-200',  dot: 'bg-emerald-500',  label: 'Installiert \u2713' },
  cancelled:  { bg: 'bg-red-100',      text: 'text-red-700',      border: 'border-red-200',      dot: 'bg-red-500',      label: 'Storniert' },
  no_show:    { bg: 'bg-gray-100',     text: 'text-gray-700',     border: 'border-gray-200',     dot: 'bg-gray-500',     label: 'No-Show' },
};

// ─── Status Hex Colors (for Recharts — ExecutiveDashboard) ─────
export const STATUS_HEX = {
  pending:   '#eab308',
  booked:    '#22c55e',
  completed: '#10b981',
  cancelled: '#ef4444',
  no_show:   '#6b7280',
};

// ─── Status Labels ─────
export const STATUS_LABELS = {
  pending:    'Eingeladen',
  booked:     'Eingebucht',
  confirmed:  'Bestätigt',
  completed:  'Abgeschlossen',
  cancelled:  'Storniert',
  no_show:    'No-Show',
  not_invited:'Nicht eingeladen',
  invited:    'Eingeladen',
};

// ─── City Normalization ─────
/** Normalize city name for fuzzy matching — same logic as slotUtils.js */
export function normalizeCity(city) {
  return (city || '').replace(/ am Main$/i, '').replace(/ an der /i, ' ').trim();
}

// ─── Date Helpers ─────

/** YYYY-MM-DD from Date object */
export function toDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Montag, 3. März 2025" — full German date from date string */
export function formatDateDE(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** "Mo., 3. Mär." — short weekday + day + short month */
export function formatDateShortDE(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

/** "Mo., 3. Mär. 2025" — with weekday + year */
export function formatDateWeekdayYear(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** "3. Mär." — day + short month (no year) */
export function formatDateShort(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    day: 'numeric', month: 'short',
  });
}

/** "3. Mär. 2025" — day + short month + year */
export function formatDateYear(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** "3. Mär., 14:30" — day + short month + time (from ISO datetime) */
export function formatDateTime(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString('de-DE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Time Slot Parser ─────
export function parseTimeSlots(slots) {
  if (!slots) return [];
  if (typeof slots === 'string') {
    try { slots = JSON.parse(slots); } catch { return []; }
    if (typeof slots === 'string') {
      try { slots = JSON.parse(slots); } catch { return []; }
    }
  }
  return Array.isArray(slots) ? slots : [];
}

// ─── Merge Airtable Termine with Routes ─────

/**
 * Convert Airtable installationstermine into booking-like objects and link them
 * to routes via city + date matching. Used by BookingsDashboard, Calendar, and
 * TeamDashboard so the same AT termine appear everywhere consistently.
 *
 * @param {Array} airtableTermine - raw Airtable installationstermine records
 * @param {Array} bookings - existing Supabase install_bookings
 * @param {Array} routes - install_routen for route_id linking
 * @param {Object} [opts] - optional { filterCity }
 * @returns {Array} merged bookings (Supabase + converted AT termine)
 */
export function mergeAirtableTermine(airtableTermine, bookings, routes, opts = {}) {
  const merged = [...bookings];
  const bookingAkqIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));
  // Build index: akquise_airtable_id → index in merged array (for enrichment)
  const bookingByAkqId = new Map();
  merged.forEach((b, idx) => {
    if (b.akquise_airtable_id) bookingByAkqId.set(b.akquise_airtable_id, idx);
  });

  // Build a route lookup: "city|date" → route
  const routeLookup = new Map();
  for (const r of (routes || [])) {
    const key = `${normalizeCity(r.city).toLowerCase()}|${r.schedule_date || ''}`;
    if (!routeLookup.has(key)) routeLookup.set(key, r);
  }

  for (const t of (airtableTermine || [])) {
    const status = (t.terminstatus || '').toLowerCase();
    let mappedStatus;
    if (status === 'geplant') mappedStatus = 'booked';
    else if (status === 'durchgeführt' || status === 'durchgefuehrt') mappedStatus = 'completed';
    else if (status === 'abgesagt') mappedStatus = 'cancelled';
    else if (status === 'verschoben') mappedStatus = 'pending';
    else if (status === 'no-show' || status === 'no show') mappedStatus = 'no_show';
    else if (status === 'bestätigt' || status === 'bestaetigt' || status === 'confirmed') mappedStatus = 'confirmed';
    else {
      // Unknown status — still include as 'booked' so it's visible in TeamPlan
      console.warn(`[mergeAirtableTermine] Unknown terminstatus "${t.terminstatus}" — mapping to "booked"`);
      mappedStatus = 'booked';
    }

    const akqLinks = t.akquiseLinks || [];

    // If this Airtable termin has a matching install_booking (same akquise ID),
    // don't add it as a duplicate — but DO enrich the existing booking with
    // Airtable status data (_statusInstallation, terminstatus, status upgrade)
    const matchingAkqId = akqLinks.find(id => bookingAkqIds.has(id));
    if (matchingAkqId) {
      const existingIdx = bookingByAkqId.get(matchingAkqId);
      if (existingIdx !== undefined) {
        const existing = merged[existingIdx];
        // Transfer _statusInstallation from Airtable Installationstermine lookup
        const atStatusInstall = (Array.isArray(t.statusInstallation) ? t.statusInstallation[0] : t.statusInstallation) || '';
        if (atStatusInstall && !existing._statusInstallation) {
          existing._statusInstallation = atStatusInstall;
        }
        // Transfer _terminStatus
        if (t.terminstatus && !existing._terminStatus) {
          existing._terminStatus = t.terminstatus;
        }
        // Transfer _installationsart
        const atInstArt = (Array.isArray(t.installationsart) ? t.installationsart[0] : t.installationsart) || '';
        if (atInstArt && !existing._installationsart) {
          existing._installationsart = atInstArt;
        }
        // Transfer _integrator
        const atIntegrator = (Array.isArray(t.integrator) ? t.integrator[0] : t.integrator) || '';
        if (atIntegrator && !existing._integrator) {
          existing._integrator = atIntegrator;
        }
        // Transfer _technicians
        const atTechs = (Array.isArray(t.technicians) ? t.technicians.join(', ') : t.technicians) || '';
        if (atTechs && !existing._technicians) {
          existing._technicians = atTechs;
        }
        // Status-Upgrade aus ZWEI Quellen:
        // 1. Terminstatus (Installationstermine): Durchgeführt/Abgesagt/No-Show
        // 2. _statusInstallation (Installationen-Tabelle): "Installiert", "Abgebrochen" etc.
        const openStatuses = new Set(['pending', 'booked', 'confirmed']);
        if (openStatuses.has(existing.status)) {
          // Quelle 1: Terminstatus
          if (mappedStatus === 'completed' || mappedStatus === 'cancelled' || mappedStatus === 'no_show') {
            existing.status = mappedStatus;
          }
          // Quelle 2: _statusInstallation (greift auch wenn Terminstatus noch "Geplant")
          else if (atStatusInstall && /installiert|live|erfolgreich/i.test(atStatusInstall)) {
            existing.status = 'completed';
          } else if (atStatusInstall && /abgebrochen|fehlgeschlagen|storniert/i.test(atStatusInstall)) {
            existing.status = 'cancelled';
          }
        }
      }
      continue;
    }

    const tCity = (Array.isArray(t.city) ? t.city[0] : t.city) || '';
    const tName = (Array.isArray(t.locationName) ? t.locationName[0] : t.locationName) || '';
    const rawJetId = (Array.isArray(t.jetIdLinks) ? t.jetIdLinks[0] : t.jetIdLinks) || '';
    const tJetId = rawJetId && !rawJetId.startsWith('rec') ? rawJetId : '';

    if (opts.filterCity && normalizeCity(tCity).toLowerCase() !== normalizeCity(opts.filterCity).toLowerCase()) continue;

    // Calculate end time (start + 90 min)
    let endTime = '';
    const rawZeit = t.installationszeit || '';
    let zeit = '';
    if (rawZeit) {
      const isoMatch = rawZeit.match(/T(\d{2}:\d{2})/);
      if (isoMatch) zeit = isoMatch[1];
      else {
        const timeMatch = rawZeit.match(/^(\d{1,2}:\d{2})/);
        if (timeMatch) zeit = timeMatch[1];
        else zeit = rawZeit;
      }
    }
    // Default to 08:00 if no time parsed or time is 00:00
    if (!zeit || zeit === '00:00') zeit = '08:00';
    if (zeit) {
      const timeParts = zeit.match(/^(\d{1,2}):(\d{2})/);
      if (timeParts) {
        const startMins = parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);
        const endMins = startMins + 90;
        endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
      }
    }

    const tStreet = (Array.isArray(t.street) ? t.street[0] : t.street) || '';
    const tStreetNr = (Array.isArray(t.streetNumber) ? t.streetNumber[0] : t.streetNumber) || '';
    const tPostal = (Array.isArray(t.postalCode) ? t.postalCode[0] : t.postalCode) || '';
    const tEmail = (Array.isArray(t.contactEmail) ? t.contactEmail[0] : t.contactEmail) || '';
    // Normalize to date-only (YYYY-MM-DD) — installationsdatum can be full ISO timestamp
    const rawDate = t.installationsdatumNurDatum || t.installationsdatum || null;
    const bookedDate = rawDate ? rawDate.split('T')[0] : null;

    // Link to route via city + date (defensive: tCity could be empty)
    const routeKey = `${normalizeCity(tCity).toLowerCase()}|${bookedDate || ''}`;
    const matchingRoute = routeLookup.get(routeKey) || null;

    merged.push({
      id: `at-${t.id}`,
      akquise_airtable_id: akqLinks[0] || null,
      location_name: tName || 'Airtable-Termin',
      city: tCity,
      contact_name: '',
      contact_phone: '',
      contact_email: tEmail,
      jet_id: tJetId,
      street: tStreet,
      street_number: tStreetNr,
      postal_code: tPostal,
      booked_date: bookedDate,
      booked_time: (() => {
        const z = t.installationszeit || '';
        let parsed = '';
        if (z) {
          // If it looks like an ISO timestamp, extract time
          const isoMatch = z.match(/T(\d{2}:\d{2})/);
          if (isoMatch) parsed = isoMatch[1];
          else {
            // If it's already HH:MM or HH:MM:SS, normalize to HH:MM
            const timeMatch = z.match(/^(\d{1,2}:\d{2})/);
            if (timeMatch) parsed = timeMatch[1];
            else parsed = z;
          }
        }
        // Default to 08:00 if no time parsed or time is 00:00
        if (!parsed || parsed === '00:00') return '08:00';
        return parsed;
      })(),
      booked_end_time: endTime,
      status: mappedStatus,
      booking_source: 'airtable',
      created_at: t.installationsdatum || '',
      _isAirtable: true,
      _terminStatus: t.terminstatus,
      _statusInstallation: (Array.isArray(t.statusInstallation) ? t.statusInstallation[0] : t.statusInstallation) || '',
      _installationsart: (Array.isArray(t.installationsart) ? t.installationsart[0] : t.installationsart) || '',
      _integrator: (Array.isArray(t.integrator) ? t.integrator[0] : t.integrator) || '',
      _technicians: (Array.isArray(t.technicians) ? t.technicians.join(', ') : t.technicians) || '',
      // Route linking
      route_id: matchingRoute?.id || null,
      installer_team: matchingRoute?.installer_team || (Array.isArray(t.integrator) ? t.integrator[0] : t.integrator) || (Array.isArray(t.installationspartner) ? t.installationspartner[0] : '') || '',
    });
  }
  return merged;
}

// ─── Sync & Reload ─────

/**
 * Trigger Airtable → Supabase sync, invalidate frontend caches, then reload data.
 * Used by all Installation component "Aktualisieren" buttons.
 *
 * @param {Function} reloadFn - async function that re-fetches component data
 * @param {Function} [showToast] - optional toast callback (message, type) for UI feedback
 */
export async function triggerSyncAndReload(reloadFn, showToast) {
  showToast?.('Daten werden synchronisiert...', 'info');
  try {
    await fetch('/api/trigger-sync', { method: 'POST' });
  } catch (e) {
    console.warn('[triggerSyncAndReload] Sync trigger failed:', e.message);
  }
  // Invalidate all frontend caches so next fetch hits Supabase fresh
  clearAirtableCache();
  // Wait for background sync to propagate to Supabase
  await new Promise(r => setTimeout(r, 2500));
  await reloadFn();
}
