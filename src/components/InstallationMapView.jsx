import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MapPin, Search, Filter, Loader2, RefreshCw, ChevronDown, User, Phone,
  Wrench, Building, CheckCircle, Clock, Send, CalendarCheck, Maximize2,
  Minimize2, Navigation, Layers, AlertTriangle, X, Route, Eye, Image,
  CheckSquare, Square, ExternalLink, XCircle, AlertCircle, Info,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchAllAcquisition, fetchAllInstallationstermine } from '../utils/airtableService';
import { isStorno, isAlreadyInstalled, isReadyForInstall } from '../metrics';
import { INSTALL_API } from '../utils/installUtils';
import UnifiedStandortDetail from './UnifiedStandortDetail';

/* ═══════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════ */

const GEOCODE_CACHE_KEY = 'jet-map-geocode-cache';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

// Pin colors by status
const PIN_COLORS = {
  ready:     { bg: '#007AFF', border: '#2563eb', label: 'Bereit',     icon: CheckCircle },
  invited:   { bg: '#FF9500', border: '#FF9500', label: 'Eingeladen', icon: Send },
  booked:    { bg: '#34C759', border: '#34C759', label: 'Bestätigt',  icon: CheckCircle },
};

/* ═══════════════════════════════════════════════════════════
 *  CUSTOM MARKER ICONS (SVG-based to avoid broken default icons)
 * ═══════════════════════════════════════════════════════════ */

function createPinIcon(color, borderColor) {
  const svg = `
    <svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z"
            fill="${color}" stroke="${borderColor}" stroke-width="2"/>
      <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'custom-pin-icon',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -40],
  });
}

const PIN_ICONS = {
  ready:     createPinIcon(PIN_COLORS.ready.bg, PIN_COLORS.ready.border),
  invited:   createPinIcon(PIN_COLORS.invited.bg, PIN_COLORS.invited.border),
  booked:    createPinIcon(PIN_COLORS.booked.bg, PIN_COLORS.booked.border),
  confirmed: createPinIcon(PIN_COLORS.booked.bg, PIN_COLORS.booked.border), // same as booked
};

// Cluster icon — with optional city label
function createClusterIcon(count, dominantColor, cityLabel) {
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  if (cityLabel && cityLabel.length <= 20) {
    // City-level cluster: bigger bubble with city name below
    const labelWidth = Math.max(size, cityLabel.length * 7 + 16);
    const totalHeight = size + 18;
    const svg = `
      <svg width="${labelWidth}" height="${totalHeight}" viewBox="0 0 ${labelWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${labelWidth / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${dominantColor}" opacity="0.85"
                stroke="white" stroke-width="2"/>
        <text x="${labelWidth / 2}" y="${size / 2}" text-anchor="middle" dy=".35em"
              fill="white" font-size="${count < 10 ? 14 : 12}" font-weight="bold" font-family="system-ui">${count}</text>
        <rect x="${(labelWidth - cityLabel.length * 6.5 - 10) / 2}" y="${size + 1}" width="${cityLabel.length * 6.5 + 10}" height="15" rx="4"
              fill="white" stroke="${dominantColor}" stroke-width="1" opacity="0.95"/>
        <text x="${labelWidth / 2}" y="${size + 11}" text-anchor="middle" fill="${dominantColor}"
              font-size="9" font-weight="600" font-family="system-ui">${cityLabel}</text>
      </svg>`;
    return L.divIcon({
      html: svg,
      className: 'custom-cluster-icon',
      iconSize: [labelWidth, totalHeight],
      iconAnchor: [labelWidth / 2, size / 2],
    });
  }
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${dominantColor}" opacity="0.85"
              stroke="white" stroke-width="2"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".35em"
            fill="white" font-size="${count < 10 ? 14 : 12}" font-weight="bold" font-family="system-ui">${count}</text>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'custom-cluster-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/* ═══════════════════════════════════════════════════════════
 *  GEOCODING HELPERS
 * ═══════════════════════════════════════════════════════════ */

function getGeoCache() {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setGeoCache(cache) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full, clear old entries
    try {
      localStorage.removeItem(GEOCODE_CACHE_KEY);
      localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
    } catch { /* ignore */ }
  }
}

function buildAddressString(standort) {
  const parts = [];
  if (standort.street) {
    parts.push(standort.street + (standort.streetNumber ? ' ' + standort.streetNumber : ''));
  }
  if (standort.postalCode) parts.push(standort.postalCode);
  const city = Array.isArray(standort.city) ? standort.city[0] : standort.city;
  if (city) parts.push(city);
  if (parts.length > 0) parts.push('Deutschland');
  return parts.join(', ');
}

async function geocodeAddress(address) {
  try {
    const url = `${NOMINATIM_BASE}?format=json&q=${encodeURIComponent(address)}&countrycodes=de&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JET-Dashboard/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodeBatch(standorte, onProgress) {
  const cache = getGeoCache();
  const results = new Map();
  const toGeocode = [];

  // Check cache first
  for (const s of standorte) {
    const addr = buildAddressString(s);
    if (!addr || addr === 'Deutschland') continue;
    const cacheKey = addr.toLowerCase().trim();
    if (cache[cacheKey]) {
      results.set(s.id, cache[cacheKey]);
    } else {
      toGeocode.push({ standort: s, address: addr, cacheKey });
    }
  }

  onProgress?.({ total: standorte.length, cached: results.size, remaining: toGeocode.length, done: 0 });

  // Geocode remaining with rate limiting (1 per second for Nominatim)
  for (let i = 0; i < toGeocode.length; i++) {
    const { standort, address, cacheKey } = toGeocode[i];
    const coords = await geocodeAddress(address);
    if (coords) {
      cache[cacheKey] = coords;
      results.set(standort.id, coords);
    }
    onProgress?.({ total: standorte.length, cached: results.size - (i + 1), remaining: toGeocode.length - (i + 1), done: i + 1 });

    // Rate limit: 1 request per second
    if (i < toGeocode.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }

  // Persist cache
  setGeoCache(cache);
  return results;
}

/* ═══════════════════════════════════════════════════════════
 *  SIMPLE CLIENT-SIDE CLUSTERING
 * ═══════════════════════════════════════════════════════════ */

function buildClusterEntry(group) {
  const lat = group.reduce((s, m) => s + m.lat, 0) / group.length;
  const lng = group.reduce((s, m) => s + m.lng, 0) / group.length;
  const statusCounts = {};
  for (const m of group) {
    statusCounts[m.pinStatus] = (statusCounts[m.pinStatus] || 0) + 1;
  }
  const dominantStatus = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0][0];
  // Collect city names for label
  const citySet = new Set();
  for (const m of group) {
    const c = Array.isArray(m.standort?.city) ? m.standort.city[0] : m.standort?.city;
    if (c) citySet.add(c);
  }
  return {
    isCluster: true,
    lat,
    lng,
    count: group.length,
    items: group,
    dominantStatus,
    dominantColor: PIN_COLORS[dominantStatus]?.bg || '#64748b',
    cityLabel: citySet.size === 1 ? [...citySet][0] : `${citySet.size} Staedte`,
  };
}

function clusterMarkers(markers, zoom) {
  // High zoom: individual pins
  if (zoom >= 13) return markers.map(m => ({ ...m, isCluster: false }));

  // Low zoom (< 10): cluster by city name for clean city-level bubbles
  if (zoom < 10) {
    const cityGroups = new Map();
    const noCity = [];

    for (const m of markers) {
      const city = Array.isArray(m.standort?.city) ? m.standort.city[0] : m.standort?.city;
      if (city) {
        if (!cityGroups.has(city)) cityGroups.set(city, []);
        cityGroups.get(city).push(m);
      } else {
        noCity.push(m);
      }
    }

    const result = [];
    for (const [, group] of cityGroups) {
      if (group.length === 1) {
        result.push({ ...group[0], isCluster: false });
      } else {
        result.push(buildClusterEntry(group));
      }
    }
    // Markers without city as individual pins
    for (const m of noCity) {
      result.push({ ...m, isCluster: false });
    }
    return result;
  }

  // Medium zoom (10-12): grid-based clustering with finer cells
  const cellSize = Math.max(0.005, 0.8 / Math.pow(2, zoom - 5));
  const grid = new Map();

  for (const m of markers) {
    const cellX = Math.floor(m.lat / cellSize);
    const cellY = Math.floor(m.lng / cellSize);
    const key = `${cellX}_${cellY}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(m);
  }

  const result = [];
  for (const [, group] of grid) {
    if (group.length === 1) {
      result.push({ ...group[0], isCluster: false });
    } else {
      result.push(buildClusterEntry(group));
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════
 *  MAP ZOOM TRACKER
 * ═══════════════════════════════════════════════════════════ */

function ZoomTracker({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  return null;
}

/* ═══════════════════════════════════════════════════════════
 *  FULLSCREEN TOGGLE
 * ═══════════════════════════════════════════════════════════ */

function FullscreenControl({ isFullscreen, onToggle }) {
  return (
    <div className="leaflet-top leaflet-right" style={{ zIndex: 1000 }}>
      <div className="leaflet-control">
        <button
          onClick={onToggle}
          className="bg-surface-primary hover:bg-surface-secondary border border-border-primary rounded-lg p-2 shadow-md transition-colors"
          title={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  LEGEND
 * ═══════════════════════════════════════════════════════════ */

function MapLegend({ counts }) {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-surface-primary border border-border-secondary rounded-xl p-3 shadow-lg">
      <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">Legende</div>
      {Object.entries(PIN_COLORS).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cfg.bg }} />
          <span className="text-[11px] text-text-secondary">{cfg.label}</span>
          <span className="text-[10px] text-text-muted font-mono ml-auto">{counts[key] || 0}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  GEOCODING PROGRESS BAR
 * ═══════════════════════════════════════════════════════════ */

function GeocodingProgress({ progress }) {
  if (!progress || progress.remaining === 0) return null;
  const pct = progress.total > 0
    ? Math.round(((progress.cached + progress.done) / progress.total) * 100)
    : 0;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] bg-surface-primary border border-border-secondary rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 min-w-[280px]">
      <Loader2 size={16} className="animate-spin text-status-warning shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary mb-1">
          Adressen werden geocodiert... ({progress.done}/{progress.remaining + progress.done})
        </div>
        <div className="w-full bg-surface-tertiary rounded-full h-1.5">
          <div
            className="bg-status-warning h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-[10px] font-mono text-text-muted">{pct}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  ASSIGN TO ROUTE DROPDOWN
 * ═══════════════════════════════════════════════════════════ */

function AssignRouteDropdown({ standort, routes, onAssign }) {
  const [selectedRoute, setSelectedRoute] = useState('');
  const city = Array.isArray(standort.city) ? standort.city[0] : standort.city;
  const cityRoutes = (routes || []).filter(r =>
    r.city === city && r.status === 'open'
  ).sort((a, b) => a.schedule_date.localeCompare(b.schedule_date));

  if (cityRoutes.length === 0) {
    return (
      <div className="text-[10px] text-text-muted mt-2 italic">
        Keine offenen Routen fuer {city || 'diese Stadt'}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <select
        value={selectedRoute}
        onChange={e => setSelectedRoute(e.target.value)}
        className="w-full text-[11px] border border-border-secondary rounded-lg px-2 py-1.5 bg-surface-primary focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
      >
        <option value="">Route waehlen...</option>
        {cityRoutes.map(r => (
          <option key={r.id} value={r.id}>
            {new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
            {' - '}{r.city} ({r.installer_team || 'Kein Team'})
          </option>
        ))}
      </select>
      {selectedRoute && (
        <button
          onClick={() => onAssign(standort, selectedRoute)}
          className="w-full text-[11px] font-medium px-2 py-1.5 bg-status-warning hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center gap-1"
        >
          <Route size={10} /> Zur Route zuweisen
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  STANDORT DETAIL DRAWER (Side Panel with images)
 * ═══════════════════════════════════════════════════════════ */

function StandortDetailDrawer({ standort, booking, onClose, onInvite, inviting }) {
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!standort) return;
    // Load details with images from API
    setLoadingDetail(true);
    fetch(`${INSTALL_API.DETAIL}?akquiseId=${standort.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setDetail(d); setLoadingDetail(false); })
      .catch(() => setLoadingDetail(false));
  }, [standort?.id]);

  if (!standort) return null;
  const city = Array.isArray(standort.city) ? standort.city[0] : standort.city;
  const mapsUrl = standort.street && city
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${standort.locationName || ''} ${standort.street} ${standort.streetNumber || ''}, ${standort.postalCode || ''} ${city}`
      )}`
    : null;

  const images = detail?.images || detail?.bilder || [];

  return (
    <div className="fixed inset-0 bg-black/40 z-[2000] flex justify-end animate-fade-in" onClick={onClose}>
      <div className="bg-surface-primary w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-surface-primary border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-text-primary text-lg truncate">{standort.locationName || 'Unbekannt'}</h3>
            <p className="text-sm text-text-muted flex items-center gap-1">
              <MapPin size={13} /> {city || '--'} | {standort.postalCode || ''} {standort.street} {standort.streetNumber}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-secondary rounded-xl text-text-muted transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Images */}
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-status-warning" />
              <span className="text-sm text-text-muted ml-2">Bilder laden...</span>
            </div>
          ) : images.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Image size={14} /> Bilder ({images.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {images.map((img, i) => (
                  <a key={i} href={img.url || img} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={img.thumbnails?.large?.url || img.url || img}
                      alt={img.filename || `Bild ${i + 1}`}
                      className="w-full h-32 object-cover rounded-xl border border-gray-100 hover:border-orange-300 transition-colors"
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* Quick Links */}
          <div className="flex items-center gap-2 flex-wrap">
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-accent bg-accent-light border border-accent/20 rounded-lg hover:bg-accent-light transition-colors">
                <MapPin size={11} /> Google Maps
              </a>
            )}
            {standort.contactPhone && (
              <a href={`tel:${standort.contactPhone}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-status-online bg-status-online/10 border border-status-online/20 rounded-lg hover:bg-status-online/10 transition-colors">
                <Phone size={11} /> {standort.contactPhone}
              </a>
            )}
          </div>

          {/* Contact */}
          <div className="bg-surface-secondary rounded-2xl p-4 space-y-2 border border-gray-100">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              <User size={14} /> Kontakt
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-text-muted text-xs">Name</div><div className="text-text-primary font-medium">{standort.contactPerson || '--'}</div></div>
              <div><div className="text-text-muted text-xs">JET ID</div><div className="text-text-primary font-mono text-sm">{standort.jetId || '--'}</div></div>
              <div><div className="text-text-muted text-xs">E-Mail</div><div className="text-text-primary truncate text-sm">{standort.contactEmail || '--'}</div></div>
              <div><div className="text-text-muted text-xs">Montage</div><div className="text-text-primary text-sm">{standort.mountType || '--'}</div></div>
            </div>
          </div>

          {/* Akquise Details */}
          <div className="bg-status-warning/10/50 rounded-2xl p-4 space-y-2 border border-orange-100">
            <h4 className="text-sm font-semibold text-orange-700 flex items-center gap-1.5">
              <Building size={14} /> Akquise-Daten
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-orange-400 text-xs">Lead Status</div><div className="text-text-primary font-medium">{standort.leadStatus || '--'}</div></div>
              <div><div className="text-orange-400 text-xs">Approval Status</div><div className="text-text-primary">{standort.approvalStatus || '--'}</div></div>
              <div><div className="text-orange-400 text-xs">Vertrag</div><div className="text-text-primary">{standort.vertragVorhanden === true || standort.vertragVorhanden === 'true' ? 'Ja' : 'Nein'}</div></div>
              <div><div className="text-orange-400 text-xs">Akquise-Partner</div><div className="text-text-primary">{standort.acquisitionPartner || '--'}</div></div>
            </div>
          </div>

          {/* Hindernisse */}
          {standort.hindernisse && (
            <div className="p-3 bg-status-warning/10 border border-status-warning/20 rounded-xl">
              <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
                <AlertCircle size={12} /> Hindernisse / Hinweise
              </div>
              <div className="text-xs text-status-warning mt-0.5 whitespace-pre-wrap">{standort.hindernisse}</div>
            </div>
          )}

          {/* Booking Info */}
          {booking && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 space-y-2 border border-blue-100">
              <h4 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                <CalendarCheck size={14} /> Buchung
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {booking.booked_date && <div><div className="text-accent text-xs">Termin</div><div className="text-blue-900 font-semibold">{new Date(booking.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>}
                {booking.booked_time && <div><div className="text-accent text-xs">Uhrzeit</div><div className="text-blue-900">{booking.booked_time} - {booking.booked_end_time || '--'}</div></div>}
                <div><div className="text-accent text-xs">Status</div><div className="text-blue-900 font-medium capitalize">{booking.status}</div></div>
              </div>
            </div>
          )}

          {/* Detail from API */}
          {detail?.kommentare && (
            <div className="bg-surface-secondary rounded-2xl p-4 border border-gray-100">
              <h4 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Info size={14} /> Kommentare
              </h4>
              <p className="text-xs text-text-secondary mt-1 whitespace-pre-wrap">{detail.kommentare}</p>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex gap-3">
            {!booking && standort.contactPhone && (
              <button
                onClick={() => onInvite(standort)}
                disabled={inviting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-status-warning text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 font-medium transition-colors"
              >
                {inviting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {inviting ? 'Wird gesendet...' : 'Einladung senden'}
              </button>
            )}
            {!standort.contactPhone && (
              <div className="flex items-center gap-2 text-sm text-status-warning bg-status-warning/10 px-4 py-2.5 rounded-xl w-full border border-status-warning/20">
                <AlertCircle size={16} /> Keine Telefonnummer hinterlegt
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  BATCH INVITE MODAL (for Kampagnen)
 * ═══════════════════════════════════════════════════════════ */

function MapBatchInviteModal({ standorte, onConfirm, onCancel, inviting, progress }) {
  const withPhone = standorte.filter(s => s.contactPhone);
  const withoutPhone = standorte.filter(s => !s.contactPhone);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2001] p-4 animate-fade-in">
      <div className="bg-surface-primary rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-text-primary">Kampagne: Einladungen senden</h3>
          <p className="text-sm text-text-muted mt-1">
            {withPhone.length} von {standorte.length} Standorte koennen eingeladen werden.
          </p>
        </div>
        <div className="p-5 space-y-2 max-h-60 overflow-y-auto">
          {withPhone.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <CheckCircle size={14} className="text-status-online shrink-0" />
              <span className="text-text-primary font-medium truncate">{s.locationName}</span>
              <span className="text-text-muted text-xs ml-auto">{(s.city || [])[0]}</span>
            </div>
          ))}
          {withoutPhone.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <AlertCircle size={14} className="text-status-warning shrink-0" />
              <span className="text-text-muted truncate">{s.locationName}</span>
              <span className="text-xs text-status-warning ml-auto">Keine Tel.</span>
            </div>
          ))}
        </div>
        {inviting && progress && (
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between text-xs text-text-muted mb-1">
              <span>Sende Einladungen...</span>
              <span className="font-mono">{progress.sent}/{progress.total}</span>
            </div>
            <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
              <div className="h-full bg-status-warning rounded-full transition-all duration-300" style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onCancel} disabled={inviting} className="flex-1 px-4 py-2.5 border border-border-secondary rounded-xl text-text-primary hover:bg-surface-secondary disabled:opacity-50">Abbrechen</button>
          <button onClick={() => onConfirm(withPhone)} disabled={inviting || withPhone.length === 0}
            className="flex-1 px-4 py-2.5 bg-status-warning text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 font-medium flex items-center justify-center gap-2">
            {inviting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {inviting ? `${progress?.sent || 0}/${progress?.total || 0}` : `${withPhone.length} einladen`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════ */

export default function InstallationMapView({ filterCity: filterCityProp, onSendToInvite }) {
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [termine, setTermine] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState(null);
  const [coordsMap, setCoordsMap] = useState(new Map());
  const [filterCity, setFilterCity] = useState(filterCityProp || '');
  // Sync global city filter from parent
  useEffect(() => {
    if (filterCityProp !== undefined) setFilterCity(filterCityProp);
  }, [filterCityProp]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(6);
  const containerRef = useRef(null);

  /* ── Detail Drawer + Selection + Batch Invite state ── */
  const [drawerStandort, setDrawerStandort] = useState(null);      // Standort for detail drawer
  const [drawerBooking, setDrawerBooking] = useState(null);        // Booking for detail drawer
  const [selectedIds, setSelectedIds] = useState(new Set());       // Selected standort IDs for Kampagne
  const [showBatchModal, setShowBatchModal] = useState(false);     // Batch invite modal visible
  const [inviting, setInviting] = useState(false);                 // Single invite in progress
  const [batchInviting, setBatchInviting] = useState(false);       // Batch invite in progress
  const [inviteProgress, setInviteProgress] = useState(null);      // { sent, total, errors }

  /* ── Data Loading ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [acqData, bookRes, routeRes, terminData] = await Promise.all([
        fetchAllAcquisition(),
        fetch(INSTALL_API.BOOKINGS + '?').then(r => r.json()).catch(() => []),
        fetch(INSTALL_API.SCHEDULE + '?').then(r => r.json()).catch(() => []),
        fetchAllInstallationstermine(),
      ]);
      setAcquisitionData(acqData || []);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
      setRoutes(Array.isArray(routeRes) ? routeRes : []);
      setTermine(terminData || []);
    } catch (e) {
      console.error('[InstallationMapView] Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Booking Lookup ── */
  const bookingByAkquise = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      if (b.akquise_airtable_id) map.set(b.akquise_airtable_id, b);
    }
    return map;
  }, [bookings]);

  /* ── Airtable Installationstermine Lookup ── */
  const terminByAkquise = useMemo(() => {
    const map = new Map();
    for (const t of termine) {
      const status = (t.terminstatus || '').toLowerCase();
      // Only consider active appointments (Geplant or Durchgeführt)
      if (status !== 'geplant' && status !== 'durchgeführt' && status !== 'durchgefuehrt') continue;
      const links = t.akquiseLinks || [];
      const datum = t.installationsdatumNurDatum || t.installationsdatum || '';
      for (const akqId of links) {
        // Keep the most recent one per acquisition
        const existing = map.get(akqId);
        const existDatum = existing ? (existing.installationsdatumNurDatum || existing.installationsdatum || '') : '';
        if (!existing || (datum && datum > existDatum)) {
          map.set(akqId, t);
        }
      }
    }
    return map;
  }, [termine]);

  /* ── Filter: Ready Standorte ── */
  // Predicates imported from src/metrics (isStorno, isAlreadyInstalled, isReadyForInstall)

  const readyStandorte = useMemo(() => {
    return acquisitionData.filter(a => {
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;
      return isReadyForInstall(a) || bookingByAkquise.has(a.id) || terminByAkquise.has(a.id);
    });
  }, [acquisitionData, bookingByAkquise, terminByAkquise]);

  /* ── Geocoding (only for standorte missing stored lat/lng) ── */
  useEffect(() => {
    if (readyStandorte.length === 0) return;

    // Only geocode standorte that don't have stored coordinates
    const needsGeocoding = readyStandorte.filter(s => !s.latitude || !s.longitude);
    if (needsGeocoding.length === 0) return;

    let cancelled = false;
    setGeocoding(true);

    geocodeBatch(needsGeocoding, (progress) => {
      if (!cancelled) setGeocodeProgress(progress);
    }).then(results => {
      if (!cancelled) {
        setCoordsMap(results);
        setGeocoding(false);
        setGeocodeProgress(null);
      }
    });

    return () => { cancelled = true; };
  }, [readyStandorte]);

  /* ── Cities ── */
  const cities = useMemo(() => {
    const set = new Set();
    readyStandorte.forEach(s => (s.city || []).forEach(c => set.add(c)));
    return [...set].sort();
  }, [readyStandorte]);

  /* ── Determine pin status for each standort ── */
  const getPinStatus = useCallback((standort) => {
    // 1. Check our own booking system first (takes priority)
    const booking = bookingByAkquise.get(standort.id);
    if (booking) {
      if (booking.status === 'confirmed' || booking.status === 'completed' || booking.status === 'booked') return 'booked';
      return 'invited'; // pending
    }
    // 2. Check Airtable Installationstermine
    const termin = terminByAkquise.get(standort.id);
    if (termin) {
      return 'booked'; // Any Airtable termin = has appointment = "Bestätigt"
    }
    return 'ready';
  }, [bookingByAkquise, terminByAkquise]);

  /* ── Build markers (prefer stored lat/lng, fall back to geocode cache) ── */
  const allMarkers = useMemo(() => {
    const markers = [];
    for (const s of readyStandorte) {
      const pinStatus = getPinStatus(s);
      const booking = bookingByAkquise.get(s.id);
      const termin = terminByAkquise.get(s.id) || null;

      // 1. Try stored coordinates from Supabase (synced from Airtable)
      if (s.latitude && s.longitude) {
        markers.push({
          id: s.id,
          lat: s.latitude,
          lng: s.longitude,
          standort: s,
          pinStatus,
          booking,
          termin,
        });
        continue;
      }

      // 2. Fall back to geocode cache (Nominatim results)
      const cached = coordsMap.get(s.id);
      if (cached) {
        markers.push({
          id: s.id,
          lat: cached.lat,
          lng: cached.lng,
          standort: s,
          pinStatus,
          booking,
          termin,
        });
      }
    }
    return markers;
  }, [readyStandorte, coordsMap, getPinStatus, bookingByAkquise, terminByAkquise]);

  /* ── Apply filters ── */
  const filteredMarkers = useMemo(() => {
    let list = allMarkers;

    if (filterCity) {
      list = list.filter(m => (m.standort.city || []).includes(filterCity));
    }
    if (filterStatus !== 'all') {
      list = list.filter(m => m.pinStatus === filterStatus);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        (m.standort.locationName || '').toLowerCase().includes(q) ||
        (m.standort.contactPerson || '').toLowerCase().includes(q) ||
        (m.standort.jetId || '').toLowerCase().includes(q) ||
        (m.standort.postalCode || '').includes(q) ||
        (m.standort.street || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [allMarkers, filterCity, filterStatus, search]);

  /* ── Clustered markers ── */
  const clusteredMarkers = useMemo(() => {
    return clusterMarkers(filteredMarkers, zoom);
  }, [filteredMarkers, zoom]);

  /* ── KPIs ── */
  const statusCounts = useMemo(() => {
    const counts = { ready: 0, invited: 0, booked: 0 };
    for (const m of allMarkers) {
      counts[m.pinStatus] = (counts[m.pinStatus] || 0) + 1;
    }
    return counts;
  }, [allMarkers]);

  /* ── Route assignment ── */
  const handleAssignRoute = useCallback(async (standort, routeId) => {
    // For now, this could create a booking or update an existing one
    // This matches the pattern from InstallationPhoneWorkbench
    try {
      const route = routes.find(r => r.id === parseInt(routeId));
      if (!route) return;

      const res = await fetch(INSTALL_API.INVITE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          akquiseAirtableId: standort.id,
          contactPhone: standort.contactPhone,
          contactName: standort.contactPerson || '',
          locationName: standort.locationName || '',
          jetId: standort.jetId || '',
          city: Array.isArray(standort.city) ? standort.city[0] : standort.city,
          routeId: route.id,
          installDate: route.schedule_date,
          mountType: standort.mountType || '',
        }),
      });
      if (res.ok) {
        // Reload bookings
        const bookRes = await fetch(INSTALL_API.BOOKINGS + '?').then(r => r.json()).catch(() => []);
        setBookings(Array.isArray(bookRes) ? bookRes : []);
      }
    } catch (e) {
      console.error('[InstallationMapView] Route assignment failed:', e);
    }
  }, [routes]);

  /* ── Fullscreen toggle ── */
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  /* ── Detail Drawer Handlers ── */
  const handleOpenDrawer = useCallback((standort, booking) => {
    setDrawerStandort(standort);
    setDrawerBooking(booking || null);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerStandort(null);
    setDrawerBooking(null);
  }, []);

  /* ── Selection Handlers (Kampagnen) ── */
  const handleToggleSelect = useCallback((standortId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(standortId)) {
        next.delete(standortId);
      } else {
        next.add(standortId);
      }
      return next;
    });
  }, []);

  const handleSelectCluster = useCallback((clusterItems) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = clusterItems.every(item => next.has(item.id));
      if (allSelected) {
        // Deselect all in cluster
        clusterItems.forEach(item => next.delete(item.id));
      } else {
        // Select all in cluster
        clusterItems.forEach(item => next.add(item.id));
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /* ── Single Invite Handler ── */
  const handleInviteSingle = useCallback(async (standort) => {
    const city = Array.isArray(standort.city) ? standort.city[0] : standort.city;
    if (!standort.contactPhone || !city) return;
    if (!isReadyForInstall(standort)) {
      console.warn('[InstallationMapView] Blocked invite for non-approved Standort:', standort.jetId);
      return;
    }

    setInviting(true);
    try {
      const res = await fetch(INSTALL_API.INVITE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          akquiseAirtableId: standort.id,
          contactPhone: standort.contactPhone,
          contactName: standort.contactPerson || '',
          locationName: standort.locationName || '',
          jetId: standort.jetId || '',
          city,
        }),
      });
      if (res.ok) {
        // Reload bookings to reflect new status
        const bookRes = await fetch(INSTALL_API.BOOKINGS + '?').then(r => r.json()).catch(() => []);
        setBookings(Array.isArray(bookRes) ? bookRes : []);
        handleCloseDrawer();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[InstallationMapView] Invite failed:', err);
      }
    } catch (e) {
      console.error('[InstallationMapView] Invite error:', e);
    } finally {
      setInviting(false);
    }
  }, [handleCloseDrawer]);

  /* ── Batch Invite Handler (Kampagne) ── */
  const handleBatchInvite = useCallback(async (standortList) => {
    // Safety: filter out non-approved Standorte
    const approved = standortList.filter(s => isReadyForInstall(s));
    if (approved.length === 0) return;

    setBatchInviting(true);
    setInviteProgress({ sent: 0, total: approved.length, errors: 0 });

    for (let i = 0; i < approved.length; i++) {
      const s = approved[i];
      const city = Array.isArray(s.city) ? s.city[0] : s.city;
      try {
        await fetch(INSTALL_API.INVITE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            akquiseAirtableId: s.id,
            contactPhone: s.contactPhone,
            contactName: s.contactPerson || '',
            locationName: s.locationName || '',
            jetId: s.jetId || '',
            city: city || '',
          }),
        });
        setInviteProgress(prev => ({ ...prev, sent: prev.sent + 1 }));
      } catch {
        setInviteProgress(prev => ({ ...prev, sent: prev.sent + 1, errors: prev.errors + 1 }));
      }
      // Small delay between requests to avoid rate limiting
      if (i < standortList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Reload bookings
    const bookRes = await fetch(INSTALL_API.BOOKINGS + '?').then(r => r.json()).catch(() => []);
    setBookings(Array.isArray(bookRes) ? bookRes : []);
    setBatchInviting(false);
    setShowBatchModal(false);
    setSelectedIds(new Set());
    setInviteProgress(null);
  }, []);

  /* ── Selected standorte as array (for batch modal) ── */
  const selectedStandorte = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return readyStandorte.filter(s => selectedIds.has(s.id));
  }, [selectedIds, readyStandorte]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-status-warning" />
        <span className="text-sm text-text-muted">Karte wird geladen...</span>
      </div>
    );
  }

  const noAddressCount = readyStandorte.length - allMarkers.length;

  return (
    <div
      ref={containerRef}
      className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-surface-primary p-4 overflow-hidden' : ''}`}
    >
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Standort, Name, JET-ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border-secondary rounded-xl bg-surface-primary focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-secondary rounded-full"
            >
              <X size={12} className="text-text-muted" />
            </button>
          )}
        </div>

        {/* City Filter */}
        <div className="relative">
          <select
            value={filterCity}
            onChange={e => setFilterCity(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-sm border border-border-secondary rounded-xl bg-surface-primary cursor-pointer hover:bg-surface-secondary focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
          >
            <option value="">Alle Staedte</option>
            {cities.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-0.5">
          {[
            { id: 'all', label: 'Alle' },
            { id: 'ready', label: 'Bereit' },
            { id: 'invited', label: 'Eingeladen' },
            { id: 'booked', label: 'Bestätigt' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filterStatus === f.id
                  ? 'bg-surface-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Refresh + Stats */}
        <div className="flex items-center gap-2 ml-auto">
          {noAddressCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-status-warning bg-status-warning/10 border border-status-warning/20 px-2 py-1 rounded-lg">
              <AlertTriangle size={10} /> {noAddressCount} ohne Koordinaten
            </span>
          )}
          <span className="text-[10px] font-mono text-text-muted">
            {filteredMarkers.length} / {allMarkers.length} Standorte
          </span>
          <button
            onClick={loadData}
            className="p-2 hover:bg-surface-secondary rounded-lg text-text-muted hover:text-text-secondary transition-colors"
            title="Daten neu laden"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(PIN_COLORS).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
              className={`bg-surface-primary border rounded-2xl p-3 shadow-sm text-left transition-all hover:shadow-md ${
                filterStatus === key ? 'border-orange-300 ring-1 ring-orange-200' : 'border-border-secondary'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{cfg.label}</span>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cfg.bg}18` }}>
                  <Icon size={12} style={{ color: cfg.bg }} />
                </div>
              </div>
              <div className="text-xl font-bold text-text-primary font-mono">{statusCounts[key] || 0}</div>
            </button>
          );
        })}
      </div>

      {/* Map Container */}
      <div
        className={`relative rounded-2xl overflow-hidden shadow-lg border border-gray-100 ${
          isFullscreen ? 'flex-1' : ''
        }`}
        style={{ height: isFullscreen ? 'calc(100vh - 220px)' : 'calc(100vh - 380px)', minHeight: '400px' }}
      >
        <MapContainer
          center={[51.1657, 10.4515]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ZoomTracker onZoomChange={setZoom} />

          {clusteredMarkers.map((m, i) => {
            if (m.isCluster) {
              return (
                <Marker
                  key={`cluster-${i}`}
                  position={[m.lat, m.lng]}
                  icon={createClusterIcon(m.count, m.dominantColor, m.cityLabel)}
                >
                  <Popup>
                    <div className="min-w-[180px]">
                      <div className="font-bold text-sm mb-0.5">{m.cityLabel || `${m.count} Standorte`}</div>
                      <div className="text-xs text-text-muted mb-2">{m.count} Standorte</div>
                      <div className="space-y-0.5">
                        {Object.entries(
                          m.items.reduce((acc, item) => {
                            acc[item.pinStatus] = (acc[item.pinStatus] || 0) + 1;
                            return acc;
                          }, {})
                        ).map(([status, count]) => (
                          <div key={status} className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIN_COLORS[status]?.bg }} />
                            <span className="text-text-secondary">{PIN_COLORS[status]?.label}</span>
                            <span className="font-mono font-bold text-text-primary ml-auto">{count}</span>
                          </div>
                        ))}
                      </div>
                      {/* Select all in cluster */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSelectCluster(m.items); }}
                        className={`w-full mt-2 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                          m.items.every(item => selectedIds.has(item.id))
                            ? 'bg-status-warning/10 text-orange-700 border-orange-300 hover:bg-status-warning/10'
                            : 'bg-surface-secondary hover:bg-surface-secondary text-text-primary border-border-secondary'
                        }`}
                      >
                        {m.items.every(item => selectedIds.has(item.id))
                          ? <><CheckSquare size={11} /> Alle abwaehlen</>
                          : <><Square size={11} /> Alle auswaehlen ({m.count})</>
                        }
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            }

            const s = m.standort;
            const booking = m.booking;
            const termin = m.termin;
            const city = Array.isArray(s.city) ? s.city[0] : s.city;
            const terminDate = booking?.booked_date || termin?.installationsdatumNurDatum || termin?.installationsdatum;

            return (
              <Marker
                key={m.id}
                position={[m.lat, m.lng]}
                icon={PIN_ICONS[m.pinStatus]}
              >
                <Popup maxWidth={300} minWidth={220}>
                  <div className="min-w-[200px] text-left">
                    {/* Header */}
                    <div className="font-bold text-sm text-text-primary mb-0.5">{s.locationName || 'Unbekannt'}</div>
                    <div className="text-xs text-text-muted mb-2">
                      {s.street} {s.streetNumber}, {s.postalCode} {city}
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: PIN_COLORS[m.pinStatus]?.bg }}
                      >
                        {PIN_COLORS[m.pinStatus]?.label}
                      </span>
                      {terminDate && (
                        <span className="text-[10px] text-text-muted font-mono">
                          {new Date(terminDate + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-2">
                      <div className="flex items-center gap-1 text-text-muted">
                        <Building size={10} /> <span className="font-medium text-text-primary">{s.jetId || '--'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-text-muted">
                        <User size={10} /> <span className="font-medium text-text-primary truncate">{s.contactPerson || '--'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-text-muted">
                        <Phone size={10} /> <span className="font-medium text-text-primary font-mono">{s.contactPhone || '--'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-text-muted">
                        <Wrench size={10} /> <span className="font-medium text-text-primary">{s.mountType || '--'}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-1.5 mt-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenDrawer(s, booking); }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-surface-secondary hover:bg-surface-secondary text-text-primary rounded-lg border border-border-secondary transition-colors"
                      >
                        <Eye size={11} /> Details
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleSelect(s.id); }}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                          selectedIds.has(s.id)
                            ? 'bg-status-warning/10 text-orange-700 border-orange-300 hover:bg-status-warning/10'
                            : 'bg-surface-secondary hover:bg-surface-secondary text-text-primary border-border-secondary'
                        }`}
                      >
                        {selectedIds.has(s.id)
                          ? <><CheckSquare size={11} /> Ausgewaehlt</>
                          : <><Square size={11} /> Auswaehlen</>
                        }
                      </button>
                    </div>

                    {/* Route Assignment (only for ready/not-yet-booked) */}
                    {m.pinStatus === 'ready' && (
                      <AssignRouteDropdown
                        standort={s}
                        routes={routes}
                        onAssign={handleAssignRoute}
                      />
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Geocoding progress overlay */}
        {geocoding && <GeocodingProgress progress={geocodeProgress} />}

        {/* Legend */}
        <MapLegend counts={statusCounts} />

        {/* Fullscreen toggle */}
        <div className="absolute top-4 right-4 z-[1000]">
          <button
            onClick={toggleFullscreen}
            className="bg-surface-primary hover:bg-surface-primary border border-border-secondary rounded-lg p-2 shadow-md transition-colors"
            title={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* ── Floating Selection Toolbar ── */}
        {selectedIds.size > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1001] bg-surface-primary border border-status-warning/20 rounded-2xl px-5 py-3 shadow-xl flex items-center gap-4 animate-slide-up">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-status-warning/10 flex items-center justify-center">
                <CheckSquare size={16} className="text-status-warning" />
              </div>
              <div>
                <div className="text-sm font-bold text-text-primary">{selectedIds.size} ausgewaehlt</div>
                <div className="text-[10px] text-text-muted">
                  {selectedStandorte.filter(s => s.contactPhone).length} mit Telefon
                </div>
              </div>
            </div>

            <div className="h-8 w-px bg-surface-tertiary" />

            <button
              onClick={() => setShowBatchModal(true)}
              disabled={selectedStandorte.filter(s => s.contactPhone).length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-status-warning text-white text-sm font-medium rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-status-warning transition-colors shadow-sm"
            >
              <Send size={14} /> Kampagne starten
            </button>

            {onSendToInvite && (
              <button
                onClick={() => onSendToInvite(new Set(selectedIds))}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white text-sm font-medium rounded-xl hover:bg-indigo-600 transition-colors shadow-sm"
                title="Auswahl im Einladungen-Tab oeffnen"
              >
                <Navigation size={14} /> In Einladungen
              </button>
            )}

            <button
              onClick={handleClearSelection}
              className="flex items-center gap-1 px-3 py-2 text-text-muted hover:text-text-primary text-sm hover:bg-surface-secondary rounded-xl transition-colors"
            >
              <X size={14} /> Aufheben
            </button>
          </div>
        )}
      </div>

      {/* ── Unified Standort Detail ── */}
      {drawerStandort && (
        <UnifiedStandortDetail
          standort={drawerStandort}
          booking={drawerBooking}
          onClose={handleCloseDrawer}
        />
      )}

      {/* ── Batch Invite Modal (Kampagne) ── */}
      {showBatchModal && (
        <MapBatchInviteModal
          standorte={selectedStandorte}
          onConfirm={handleBatchInvite}
          onCancel={() => { if (!batchInviting) { setShowBatchModal(false); } }}
          inviting={batchInviting}
          progress={inviteProgress}
        />
      )}
    </div>
  );
}
