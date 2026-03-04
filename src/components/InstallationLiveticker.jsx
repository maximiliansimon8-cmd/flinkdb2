import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { INSTALL_API } from '../utils/installUtils';

/* ── Relative time formatter (German) ── */
function relativeTimeDE(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  if (diffMs < 0) return 'gleich';

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (hours < 24) return `vor ${hours}h`;

  // Check if it was yesterday
  const nowDate = new Date(now);
  const thenDate = new Date(then);
  const isYesterday =
    nowDate.getDate() - thenDate.getDate() === 1 &&
    nowDate.getMonth() === thenDate.getMonth() &&
    nowDate.getFullYear() === thenDate.getFullYear();
  if (isYesterday) return 'gestern';

  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wo.`;
  return `vor ${Math.floor(days / 30)} Mon.`;
}

/* ── Event type definitions ── */
const EVENT_TYPES = {
  completed: {
    icon: '\u2705',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    label: 'erfolgreich aufgebaut',
  },
  booked: {
    icon: '\ud83d\udcc5',
    color: 'text-blue-700',
    bgColor: 'bg-accent-light',
    borderColor: 'border-accent/20',
    label: 'Neuer Termin vereinbart',
  },
  confirmed: {
    icon: '\u2705',
    color: 'text-green-700',
    bgColor: 'bg-status-online/10',
    borderColor: 'border-status-online/20',
    label: 'Termin bestaetigt',
  },
  whatsapp_sent: {
    icon: '\ud83d\udce8',
    color: 'text-purple-700',
    bgColor: 'bg-brand-purple/10',
    borderColor: 'border-brand-purple/20',
    label: 'Einladung versendet',
  },
  route_created: {
    icon: '\ud83d\uddfa\ufe0f',
    color: 'text-orange-700',
    bgColor: 'bg-status-warning/10',
    borderColor: 'border-status-warning/20',
    label: 'Neue Route geplant',
  },
  cancelled: {
    icon: '\u274c',
    color: 'text-red-700',
    bgColor: 'bg-status-offline/10',
    borderColor: 'border-status-offline/20',
    label: 'Termin storniert',
  },
};

/* ── Derive events from bookings ── */
function deriveBookingEvents(bookings) {
  const events = [];
  if (!Array.isArray(bookings)) return events;

  for (const b of bookings) {
    const name = b.location_name || 'Unbekannt';
    const city = b.city || '';
    const suffix = city ? ` (${city})` : '';

    // Completed installation
    if (b.status === 'completed' && b.updated_at) {
      events.push({
        id: `completed-${b.id}`,
        type: 'completed',
        timestamp: b.updated_at,
        text: `${name}${suffix} ${EVENT_TYPES.completed.label}`,
      });
    }

    // Confirmed booking
    if ((b.status === 'confirmed' || b.status === 'booked') && b.confirmed_at) {
      events.push({
        id: `confirmed-${b.id}`,
        type: 'confirmed',
        timestamp: b.confirmed_at,
        text: `${name}${suffix} ${EVENT_TYPES.confirmed.label}`,
      });
    }

    // Booked (new appointment made) — use booked_at, skip if already counted as confirmed
    if ((b.status === 'booked' || b.status === 'confirmed') && b.booked_at && !b.confirmed_at) {
      const dateStr = b.booked_date
        ? new Date(b.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
        : '';
      events.push({
        id: `booked-${b.id}`,
        type: 'booked',
        timestamp: b.booked_at,
        text: `${EVENT_TYPES.booked.label}: ${name}${dateStr ? ' ' + dateStr : ''}`,
      });
    }

    // WhatsApp invitation sent
    if (b.whatsapp_sent_at) {
      events.push({
        id: `whatsapp-${b.id}`,
        type: 'whatsapp_sent',
        timestamp: b.whatsapp_sent_at,
        text: `Einladung an ${name}${suffix} versendet`,
      });
    }

    // Cancelled — with extra context
    if (b.status === 'cancelled' && b.updated_at) {
      const wasBooked = !!b.booked_date;
      const cancelledBy = b.cancelled_by_user_name || null;
      const reason = b.cancelled_reason || null;
      let detail = '';
      if (wasBooked) {
        const dateStr = new Date(b.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
        detail = ` (Termin ${dateStr}${b.booked_time ? ' ' + b.booked_time : ''})`;
      } else {
        detail = ' (kein Termin gebucht)';
      }
      const byStr = cancelledBy ? ` von ${cancelledBy}` : '';
      events.push({
        id: `cancelled-${b.id}`,
        type: 'cancelled',
        timestamp: b.cancelled_at || b.updated_at,
        text: `${name}${suffix} ${EVENT_TYPES.cancelled.label}${byStr}${detail}`,
        subtitle: reason || null,
      });
    }
  }

  return events;
}

/* ── Derive events from routes ── */
function deriveRouteEvents(routes) {
  const events = [];
  if (!Array.isArray(routes)) return events;

  for (const r of routes) {
    if (!r.created_at) continue;
    const city = r.city || '';
    const dateStr = r.schedule_date
      ? new Date(r.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
      : '';
    const team = r.installer_team || '';
    const parts = [city, dateStr].filter(Boolean).join(' ');
    events.push({
      id: `route-${r.id}`,
      type: 'route_created',
      timestamp: r.created_at,
      text: `Neue Route ${parts}${team ? ' (' + team + ')' : ''} geplant`,
    });
  }

  return events;
}

/* ── Single Event Row ── */
function EventRow({ event }) {
  const config = EVENT_TYPES[event.type] || EVENT_TYPES.booked;
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-surface-primary/60 transition-colors group">
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${config.bgColor} ${config.borderColor}`}>
        <span className="text-sm leading-none">{config.icon}</span>
      </div>
      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary leading-snug">{event.text}</p>
        {event.subtitle && (
          <p className="text-[11px] text-text-muted mt-0.5">Grund: {event.subtitle}</p>
        )}
      </div>
      {/* Time */}
      <span className="text-[11px] text-text-muted font-medium whitespace-nowrap shrink-0 pt-0.5">
        {relativeTimeDE(event.timestamp)}
      </span>
    </div>
  );
}

/* ── Main Liveticker Component ── */
export default function InstallationLiveticker({ filterCity, maxEvents = 20 }) {
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [bookRes, routeRes] = await Promise.all([
        fetch(INSTALL_API.BOOKINGS + '?')
          .then(r => r.json())
          .then(d => (Array.isArray(d) ? d : []))
          .catch(() => []),
        fetch(INSTALL_API.SCHEDULE + '?')
          .then(r => r.json())
          .then(d => (Array.isArray(d) ? d : []))
          .catch(() => []),
      ]);
      setBookings(bookRes);
      setRoutes(routeRes);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[Liveticker] Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Derive and sort events
  const events = useMemo(() => {
    // Apply city filter if set
    const filteredBookings = filterCity
      ? bookings.filter(b => (b.city || '') === filterCity)
      : bookings;
    const filteredRoutes = filterCity
      ? routes.filter(r => (r.city || '') === filterCity)
      : routes;

    const bookingEvents = deriveBookingEvents(filteredBookings);
    const routeEvents = deriveRouteEvents(filteredRoutes);

    const all = [...bookingEvents, ...routeEvents];

    // Sort by timestamp descending (newest first)
    all.sort((a, b) => {
      const tA = new Date(a.timestamp).getTime() || 0;
      const tB = new Date(b.timestamp).getTime() || 0;
      return tB - tA;
    });

    // Only keep events from the last 14 days to avoid noise
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recent = all.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return !isNaN(t) && t >= cutoff;
    });

    return recent.slice(0, maxEvents);
  }, [bookings, routes, filterCity, maxEvents]);

  if (loading) {
    return (
      <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-status-warning" />
          <h3 className="text-sm font-semibold text-text-primary">Liveticker</h3>
        </div>
        <div className="flex items-center justify-center py-8 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin text-orange-400" />
          <span className="text-sm">Lade Events...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-primary border border-border-secondary rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-status-online animate-pulse" />
          <Activity size={16} className="text-status-warning" />
          <h3 className="text-sm font-semibold text-text-primary">Liveticker</h3>
          {events.length > 0 && (
            <span className="text-[10px] text-text-muted font-medium">
              {events.length} Events
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-text-muted">
              {lastRefresh.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={loadData}
            className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-muted hover:text-text-secondary transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Event List */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-text-muted gap-2">
          <Activity size={24} className="text-text-muted" />
          <p className="text-sm">Keine aktuellen Events</p>
          <p className="text-xs text-text-muted">Events der letzten 14 Tage erscheinen hier</p>
        </div>
      ) : (
        <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
          {events.map(event => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
