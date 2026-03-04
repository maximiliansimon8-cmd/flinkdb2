import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Monitor, Wifi, WifiOff, AlertTriangle, Eye } from 'lucide-react';

/* ─── Status → Color mapping ─── */
const STATUS_COLORS = {
  online:    { fill: '#34C759', stroke: '#34C759', label: 'Online',    icon: '🟢' },
  warning:   { fill: '#FF9500', stroke: '#FF9500', label: 'Warning',   icon: '🟡' },
  critical:  { fill: '#FF3B30', stroke: '#FF3B30', label: 'Kritisch',  icon: '🔴' },
  offline:   { fill: '#FF3B30', stroke: '#b91c1c', label: 'Offline',   icon: '🔴' },
  'never-online': { fill: '#94a3b8', stroke: '#64748b', label: 'Nie Online', icon: '⚪' },
  unknown:   { fill: '#94a3b8', stroke: '#64748b', label: 'Unbekannt', icon: '⚪' },
};

const getColor = (status) => STATUS_COLORS[status] || STATUS_COLORS.unknown;

/* ─── KPI Card ─── */
function KpiCard({ label, value, color, icon: Icon }) {
  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{label}</span>
        <div style={{ backgroundColor: `${color}12` }} className="w-6 h-6 rounded-lg flex items-center justify-center">
          <Icon size={12} style={{ color }} />
        </div>
      </div>
      <div className="text-xl font-bold text-text-primary font-mono">{value}</div>
    </div>
  );
}

/* ─── Legend ─── */
function MapLegend() {
  const items = [
    { color: '#34C759', label: 'Online' },
    { color: '#FF9500', label: 'Warning' },
    { color: '#FF3B30', label: 'Offline/Kritisch' },
    { color: '#94a3b8', label: 'Unbekannt' },
  ];
  return (
    <div className="absolute bottom-4 right-4 z-[1000] bg-surface-primary border border-border-secondary rounded-xl p-3 shadow-lg">
      <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">Legende</div>
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-[11px] text-text-secondary">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ─── */
export default function DisplayMap({ rawData, comparisonData, onSelectDisplay }) {
  const [statusFilter, setStatusFilter] = useState('all');

  /* ─── Merge Dayn coordinates with display status ─── */
  const markers = useMemo(() => {
    if (!comparisonData?.dayn?.records || !rawData?.displays) return [];

    // Build a lookup: displayId → display heartbeat data
    const displayMap = new Map();
    for (const d of rawData.displays) {
      displayMap.set(d.displayId, d);
    }

    // Build a lookup: displayId → airtable location data
    const locationMap = comparisonData.airtable?.locationMap || new Map();

    const result = [];
    for (const screen of comparisonData.dayn.records) {
      const lat = parseFloat(screen.latitude);
      const lon = parseFloat(screen.longitude);
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;

      // Match screen to display by dayn_screen_id or do_screen_id
      const screenId = screen.dayn_screen_id || screen.do_screen_id || '';
      const display = displayMap.get(screenId);
      const location = locationMap.get(screenId);

      const status = display?.status || 'unknown';
      const colorInfo = getColor(status);

      result.push({
        lat,
        lon,
        displayId: screenId,
        locationName: location?.locationName || screen.location_name || screenId,
        city: location?.city || screen.city || '',
        status,
        colorInfo,
        display, // full display object for opening detail
        screenType: screen.screen_type || '',
        venueType: screen.venue_type || '',
      });
    }

    return result;
  }, [rawData, comparisonData]);

  const filteredMarkers = useMemo(() => {
    if (statusFilter === 'all') return markers;
    if (statusFilter === 'offline') return markers.filter(m => ['critical', 'offline', 'warning'].includes(m.status));
    return markers.filter(m => m.status === statusFilter);
  }, [markers, statusFilter]);

  /* ─── KPIs ─── */
  const kpis = useMemo(() => {
    const total = markers.length;
    const online = markers.filter(m => m.status === 'online').length;
    const offline = markers.filter(m => ['critical', 'offline', 'warning'].includes(m.status)).length;
    const noCoords = (comparisonData?.dayn?.records || []).length - markers.length;
    return { total, online, offline, noCoords };
  }, [markers, comparisonData]);

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Auf Karte" value={kpis.total} color="#007AFF" icon={MapPin} />
        <KpiCard label="Online" value={kpis.online} color="#34C759" icon={Wifi} />
        <KpiCard label="Offline/Warning" value={kpis.offline} color="#FF3B30" icon={WifiOff} />
        <KpiCard label="Ohne Koordinaten" value={kpis.noCoords} color="#FF9500" icon={AlertTriangle} />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-medium text-text-muted uppercase">Filter:</span>
        {[
          { id: 'all', label: 'Alle' },
          { id: 'online', label: 'Online' },
          { id: 'offline', label: 'Offline' },
          { id: 'unknown', label: 'Unbekannt' },
        ].map(f => (
          <button key={f.id}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${statusFilter === f.id ? 'bg-surface-primary text-text-primary shadow-sm border border-border-secondary' : 'text-text-muted hover:text-text-primary bg-surface-secondary/60'}`}
            onClick={() => setStatusFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <span className="text-[10px] text-text-muted font-mono ml-auto">{filteredMarkers.length} Standorte</span>
      </div>

      {/* Map */}
      <div className="relative bg-surface-primary border border-border-secondary rounded-2xl shadow-sm overflow-hidden" style={{ height: '600px' }}>
        <MapContainer
          center={[51.1657, 10.4515]}
          zoom={6}
          style={{ height: '100%', width: '100%', borderRadius: '1rem' }}
          scrollWheelZoom={true}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredMarkers.map((m, i) => (
            <CircleMarker
              key={`${m.displayId}-${i}`}
              center={[m.lat, m.lon]}
              radius={7}
              pathOptions={{
                fillColor: m.colorInfo.fill,
                color: m.colorInfo.stroke,
                weight: 2,
                fillOpacity: 0.8,
              }}
              eventHandlers={{
                click: () => {
                  if (m.display && onSelectDisplay) {
                    onSelectDisplay(m.display);
                  }
                },
              }}
            >
              <Popup>
                <div className="min-w-[180px]">
                  <div className="font-bold text-sm mb-1">{m.locationName}</div>
                  <div className="text-xs text-text-secondary mb-1">{m.city}</div>
                  <div className="flex items-center gap-1 text-xs mb-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: m.colorInfo.fill }} />
                    {m.colorInfo.label}
                  </div>
                  <div className="text-[10px] text-text-muted font-mono">{m.displayId}</div>
                  {m.screenType && <div className="text-[10px] text-text-muted">{m.screenType} | {m.venueType}</div>}
                  {m.display && (
                    <button
                      onClick={() => onSelectDisplay && onSelectDisplay(m.display)}
                      className="mt-2 text-[10px] text-accent hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <Eye size={10} /> Details anzeigen
                    </button>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        <MapLegend />
      </div>
    </div>
  );
}
