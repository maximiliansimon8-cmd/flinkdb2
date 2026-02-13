import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Calendar, MapPin, Users, Clock,
  CheckCircle, XCircle, AlertCircle, Send, Truck, Target, RefreshCw,
  ArrowRight, Zap, Building,
} from 'lucide-react';
import { fetchAllAcquisition } from '../utils/airtableService';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function ProgressBar({ value, max, color = 'bg-orange-500', label }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">{label}</span>
          <span className="text-xs font-mono text-gray-700">{value}/{max} ({pct}%)</span>
        </div>
      )}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sublabel, trend, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color.replace('text-', 'bg-').replace(/\d00/, '50')}`}>
          <Icon size={16} className={color} />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
      {trend !== undefined && trend !== null && (
        <div className={`flex items-center gap-1 text-xs mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend >= 0 ? '+' : ''}{trend}% vs. Vorwoche
        </div>
      )}
    </div>
  );
}

export default function InstallationExecutiveDashboard() {
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookRes, routeRes, acqData] = await Promise.all([
        fetch('/api/install-booker/status?').then(r => r.json()).catch(() => []),
        fetch('/api/install-schedule?').then(r => r.json()).catch(() => []),
        fetchAllAcquisition(),
      ]);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
      setRoutes(Array.isArray(routeRes) ? routeRes : []);
      setAcquisitionData(acqData || []);
    } catch (e) {
      console.error('Failed to load executive data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // KPIs
  const kpis = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter(b => b.status === 'pending');
    const booked = bookings.filter(b => b.status === 'booked');
    const confirmed = bookings.filter(b => b.status === 'confirmed');
    const completed = bookings.filter(b => b.status === 'completed');
    const cancelled = bookings.filter(b => b.status === 'cancelled');
    const noShow = bookings.filter(b => b.status === 'no_show');

    // Helper: is this cancelled/storno?
    const isStorno = (a) => {
      if (a.akquiseStorno === true || a.akquiseStorno === 'true') return true;
      if (a.postInstallStorno === true || a.postInstallStorno === 'true') return true;
      const ls = (a.leadStatus || '').toLowerCase();
      return ls.includes('storno') || ls.includes('cancelled') || ls.includes('lost');
    };

    // Helper: is this already installed/live?
    const isInstalled = (a) => {
      const statuses = Array.isArray(a.installationsStatus) ? a.installationsStatus : [];
      if (statuses.some(s => (s || '').toLowerCase().includes('installiert') || (s || '').toLowerCase().includes('live'))) return true;
      return (a.leadStatus || '').toLowerCase() === 'live';
    };

    // Helper: is this ready for installation?
    const isReady = (a) => {
      // Airtable: readyForInstallation = "checked" or boolean true
      if (a.readyForInstallation === true || a.readyForInstallation === 'checked' || a.readyForInstallation === 'true') return true;
      // Won / Signed + Accepted = ready
      const ls = (a.leadStatus || '').toLowerCase();
      const as = (a.approvalStatus || '').toLowerCase();
      if ((ls === 'won / signed' || ls === 'won/signed') && as === 'accepted') return true;
      return ls.includes('ready') || ls.includes('installation');
    };

    // Ready for installation (not yet invited), exclude stornos & already installed
    const bookingIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));
    const readyToInvite = acquisitionData.filter(a =>
      !isStorno(a) && !isInstalled(a) && isReady(a) && !bookingIds.has(a.id)
    );

    // Conversion rates
    const convInviteToBook = pending.length + booked.length + confirmed.length + completed.length > 0
      ? Math.round(((booked.length + confirmed.length + completed.length) / (pending.length + booked.length + confirmed.length + completed.length)) * 100)
      : 0;

    const convBookToComplete = booked.length + confirmed.length + completed.length > 0
      ? Math.round((completed.length / (booked.length + confirmed.length + completed.length)) * 100)
      : 0;

    // Capacity utilization
    const totalCapacity = routes.reduce((s, r) => s + (r.max_capacity || 0), 0);
    const bookedSlots = bookings.filter(b => b.booked_date && b.status !== 'cancelled').length;
    const capacityUtil = totalCapacity > 0 ? Math.round((bookedSlots / totalCapacity) * 100) : 0;

    // Average booking time (invite to book)
    let avgBookingHours = null;
    const bookedWithTimes = bookings.filter(b => b.booked_at && b.whatsapp_sent_at);
    if (bookedWithTimes.length > 0) {
      const totalMs = bookedWithTimes.reduce((s, b) => {
        return s + (new Date(b.booked_at).getTime() - new Date(b.whatsapp_sent_at).getTime());
      }, 0);
      avgBookingHours = Math.round(totalMs / bookedWithTimes.length / (1000 * 60 * 60));
    }

    // Cities
    const cityBookings = {};
    bookings.forEach(b => {
      if (b.city) {
        if (!cityBookings[b.city]) cityBookings[b.city] = { total: 0, booked: 0, completed: 0, cancelled: 0 };
        cityBookings[b.city].total++;
        if (b.status === 'booked' || b.status === 'confirmed') cityBookings[b.city].booked++;
        if (b.status === 'completed') cityBookings[b.city].completed++;
        if (b.status === 'cancelled' || b.status === 'no_show') cityBookings[b.city].cancelled++;
      }
    });

    // Routes per city (capacity)
    const cityCapacity = {};
    routes.forEach(r => {
      if (r.city) {
        if (!cityCapacity[r.city]) cityCapacity[r.city] = { routes: 0, capacity: 0 };
        cityCapacity[r.city].routes++;
        cityCapacity[r.city].capacity += r.max_capacity || 0;
      }
    });

    // This week's bookings
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const thisWeekBookings = bookings.filter(b =>
      b.booked_date && new Date(b.booked_date) >= weekStart && new Date(b.booked_date) < weekEnd
    );

    // Last week comparison
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekBookings = bookings.filter(b =>
      b.booked_date && new Date(b.booked_date) >= lastWeekStart && new Date(b.booked_date) < weekStart
    );

    const weekTrend = lastWeekBookings.length > 0
      ? Math.round(((thisWeekBookings.length - lastWeekBookings.length) / lastWeekBookings.length) * 100)
      : null;

    return {
      total, readyToInvite: readyToInvite.length,
      pending: pending.length, booked: booked.length,
      confirmed: confirmed.length, completed: completed.length,
      cancelled: cancelled.length, noShow: noShow.length,
      convInviteToBook, convBookToComplete,
      totalCapacity, bookedSlots, capacityUtil,
      avgBookingHours,
      cityBookings, cityCapacity,
      thisWeek: thisWeekBookings.length, lastWeek: lastWeekBookings.length, weekTrend,
    };
  }, [bookings, routes, acquisitionData]);

  // Upcoming installations (next 7 days)
  const upcoming = useMemo(() => {
    const now = new Date();
    const weekOut = new Date(now);
    weekOut.setDate(now.getDate() + 7);
    return bookings
      .filter(b => b.booked_date && b.status !== 'cancelled' && b.status !== 'no_show'
        && new Date(b.booked_date) >= now && new Date(b.booked_date) <= weekOut)
      .sort((a, b) => new Date(a.booked_date) - new Date(b.booked_date));
  }, [bookings]);

  // Pending follow-ups (invited >48h ago, not yet booked)
  const pendingFollowups = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);
    return bookings
      .filter(b => b.status === 'pending' && b.whatsapp_sent_at && new Date(b.whatsapp_sent_at) < cutoff)
      .sort((a, b) => new Date(a.whatsapp_sent_at) - new Date(b.whatsapp_sent_at));
  }, [bookings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> Lade Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Installations-Management</h2>
          <p className="text-gray-500 mt-1">Übersicht über Terminierung, Buchungen und Kapazitäten.</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
        >
          <RefreshCw size={16} /> Aktualisieren
        </button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPICard icon={Target} label="Pipeline" value={kpis.readyToInvite} sublabel="Bereit zur Einladung" color="text-blue-600" />
        <KPICard icon={Send} label="Eingeladen" value={kpis.pending} sublabel="Warten auf Buchung" color="text-yellow-600" />
        <KPICard icon={Calendar} label="Gebucht" value={kpis.booked + kpis.confirmed} sublabel={`${kpis.confirmed} bestätigt`} color="text-green-600" />
        <KPICard icon={CheckCircle} label="Abgeschlossen" value={kpis.completed} color="text-emerald-600" />
        <KPICard icon={XCircle} label="Ausgefallen" value={kpis.cancelled + kpis.noShow} sublabel={`${kpis.noShow} No-Show`} color="text-red-500" />
        <KPICard icon={Truck} label="Diese Woche" value={kpis.thisWeek} trend={kpis.weekTrend} color="text-orange-600" />
      </div>

      {/* Funnel + Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-2">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 size={18} className="text-orange-500" /> Installations-Funnel
          </h3>
          <div className="space-y-3">
            <ProgressBar
              label="Pipeline → Eingeladen"
              value={kpis.pending + kpis.booked + kpis.confirmed + kpis.completed}
              max={kpis.readyToInvite + kpis.pending + kpis.booked + kpis.confirmed + kpis.completed}
              color="bg-yellow-500"
            />
            <ProgressBar
              label="Eingeladen → Gebucht"
              value={kpis.booked + kpis.confirmed + kpis.completed}
              max={kpis.pending + kpis.booked + kpis.confirmed + kpis.completed}
              color="bg-blue-500"
            />
            <ProgressBar
              label="Gebucht → Abgeschlossen"
              value={kpis.completed}
              max={kpis.booked + kpis.confirmed + kpis.completed}
              color="bg-emerald-500"
            />
            <ProgressBar
              label="Kapazitäts-Auslastung"
              value={kpis.bookedSlots}
              max={kpis.totalCapacity}
              color="bg-orange-500"
            />
          </div>

          {/* Conversion metrics */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{kpis.convInviteToBook}%</div>
              <div className="text-xs text-gray-400">Buchungsrate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{kpis.convBookToComplete}%</div>
              <div className="text-xs text-gray-400">Abschlussrate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {kpis.avgBookingHours !== null ? `${kpis.avgBookingHours}h` : '—'}
              </div>
              <div className="text-xs text-gray-400">Ø Buchungszeit</div>
            </div>
          </div>
        </div>

        {/* City Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin size={18} className="text-orange-500" /> Nach Stadt
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(kpis.cityBookings)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([city, data]) => {
                const cap = kpis.cityCapacity[city];
                return (
                  <div key={city} className="border-b border-gray-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{city}</span>
                      <span className="text-xs font-mono text-gray-400">{data.total} Buchungen</span>
                    </div>
                    <div className="flex gap-1.5 text-[10px]">
                      {data.booked > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{data.booked} offen</span>
                      )}
                      {data.completed > 0 && (
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded">{data.completed} ✓</span>
                      )}
                      {data.cancelled > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded">{data.cancelled} ✗</span>
                      )}
                      {cap && (
                        <span className="px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded ml-auto">
                          {cap.routes} Routen · {cap.capacity} Plätze
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            {Object.keys(kpis.cityBookings).length === 0 && (
              <div className="text-sm text-gray-400 text-center py-6">Noch keine Buchungen</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Upcoming + Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Installations */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar size={18} className="text-green-500" /> Anstehende Installationen (7 Tage)
          </h3>
          {upcoming.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">Keine Termine in den nächsten 7 Tagen</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {upcoming.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex flex-col items-center justify-center shrink-0">
                    <div className="text-[10px] text-green-600 font-medium">
                      {new Date(b.booked_date).toLocaleDateString('de-DE', { weekday: 'short' })}
                    </div>
                    <div className="text-sm font-bold text-green-700">
                      {new Date(b.booked_date).getDate()}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                    <div className="text-xs text-gray-400">
                      {b.city} · {b.booked_time}–{b.booked_end_time} Uhr
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    b.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {b.status === 'confirmed' ? 'Bestätigt' : 'Gebucht'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Follow-ups */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertCircle size={18} className="text-amber-500" /> Follow-ups nötig
            {pendingFollowups.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                {pendingFollowups.length}
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-400 mb-3">Eingeladen vor &gt;48h, noch nicht gebucht</p>
          {pendingFollowups.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">
              <CheckCircle size={24} className="mx-auto mb-2 text-green-400" />
              Alle Einladungen aktuell
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pendingFollowups.map(b => {
                const hoursSince = Math.round((Date.now() - new Date(b.whatsapp_sent_at).getTime()) / (1000 * 60 * 60));
                return (
                  <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-amber-50/50">
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                      <Clock size={16} className="text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                      <div className="text-xs text-gray-400">
                        {b.city} · {b.contact_name} · {b.contact_phone}
                      </div>
                    </div>
                    <span className="text-xs text-amber-600 font-mono whitespace-nowrap">
                      vor {hoursSince}h
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
