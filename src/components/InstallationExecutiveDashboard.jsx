import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Calendar, MapPin, Users, Clock,
  CheckCircle, XCircle, AlertCircle, Send, Target, RefreshCw,
  ArrowRight, Building, CalendarCheck, Timer, Loader2, Inbox,
  AlertTriangle, PhoneCall,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import { fetchAllAcquisition } from '../utils/airtableService';

const API_BASE = '/api/install-booker/status';
const SCHEDULE_API = '/api/install-schedule';

const STATUS_COLORS = {
  pending: '#eab308',
  booked: '#3b82f6',
  confirmed: '#22c55e',
  completed: '#10b981',
  cancelled: '#ef4444',
  no_show: '#6b7280',
};

const STATUS_LABELS = {
  pending: 'Eingeladen',
  booked: 'Gebucht',
  confirmed: 'Bestaetigt',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
  no_show: 'No-Show',
};

function formatDate(d) {
  if (!d) return '--';
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function formatDateTime(d) {
  if (!d) return '--';
  return new Date(d).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ── Custom Tooltip ── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl p-3 shadow-lg">
      <div className="text-xs font-semibold text-gray-700 mb-1.5">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-bold text-gray-900">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── KPI Card ── */
function KPICard({ label, value, subtitle, icon: Icon, color, bgColor, trend }) {
  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 text-left transition-all hover:bg-white/80 hover:shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
          <Icon size={20} className={color} />
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`text-xs font-mono flex items-center gap-0.5 ${
            trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 font-medium mt-0.5">{label}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationExecutiveDashboard() {
  const [bookings, setBookings] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bookRes, routeRes, acqData] = await Promise.all([
        fetch(API_BASE + '?').then(r => r.json()).catch(() => []),
        fetch(SCHEDULE_API + '?').then(r => r.json()).catch(() => []),
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

  // Compute KPIs
  const kpis = useMemo(() => {
    const now = Date.now();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Status counts
    const pending = bookings.filter(b => b.status === 'pending').length;
    const booked = bookings.filter(b => b.status === 'booked').length;
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;
    const completed = bookings.filter(b => b.status === 'completed').length;
    const cancelled = bookings.filter(b => b.status === 'cancelled').length;
    const noShow = bookings.filter(b => b.status === 'no_show').length;

    // This week
    const thisWeek = bookings.filter(b => new Date(b.created_at) >= oneWeekAgo).length;

    // Conversion rates
    const totalInvited = pending + booked + confirmed + completed;
    const totalBooked = booked + confirmed + completed;
    const conversionInviteToBook = totalInvited > 0 ? Math.round((totalBooked / totalInvited) * 100) : 0;
    const noShowRate = (completed + noShow) > 0 ? Math.round((noShow / (completed + noShow)) * 100) : 0;

    // Average time invite to booking
    const bookedWithTimes = bookings.filter(b => b.whatsapp_sent_at && b.booked_at);
    let avgTimeToBook = 0;
    if (bookedWithTimes.length > 0) {
      const totalHours = bookedWithTimes.reduce((sum, b) => {
        return sum + (new Date(b.booked_at) - new Date(b.whatsapp_sent_at)) / (1000 * 60 * 60);
      }, 0);
      avgTimeToBook = Math.round(totalHours / bookedWithTimes.length);
    }

    // Capacity utilization
    const totalCapacity = routes.reduce((sum, r) => sum + (r.max_capacity || 4), 0);
    const bookedSlots = bookings.filter(b => b.route_id && ['booked', 'confirmed', 'completed'].includes(b.status)).length;
    const capacityUtil = totalCapacity > 0 ? Math.round((bookedSlots / totalCapacity) * 100) : 0;

    // Overdue
    const overdue = bookings.filter(b => {
      if (b.status === 'pending' && b.whatsapp_sent_at) {
        return (now - new Date(b.whatsapp_sent_at).getTime()) > 48 * 60 * 60 * 1000;
      }
      if (b.status === 'booked' && b.booked_date) {
        const installDate = new Date(b.booked_date + 'T00:00:00').getTime();
        return (installDate - now) < 24 * 60 * 60 * 1000 && (installDate - now) > -24 * 60 * 60 * 1000;
      }
      return false;
    }).length;

    // Ready to invite
    const isStorno = (a) => {
      if (a.akquiseStorno === true || a.akquiseStorno === 'true') return true;
      if (a.postInstallStorno === true || a.postInstallStorno === 'true') return true;
      return (a.leadStatus || '').toLowerCase().includes('storno');
    };
    const isInstalled = (a) => {
      const statuses = Array.isArray(a.installationsStatus) ? a.installationsStatus : [];
      if (statuses.some(s => (s || '').toLowerCase().includes('installiert'))) return true;
      return (a.leadStatus || '').toLowerCase() === 'live';
    };
    // "Bereit für Aufbau" = readyForInstallation checked OR leadStatus contains "ready"
    const isReadyForInstall = (a) => {
      if (a.readyForInstallation === true || a.readyForInstallation === 'checked' || a.readyForInstallation === 'true') return true;
      const ls = (a.leadStatus || '').toLowerCase();
      return ls.includes('ready') || ls === 'ready for install';
    };
    // "Pipeline" = Approval in Review (won/signed but NOT yet accepted/ready)
    const isInReview = (a) => {
      const ls = (a.leadStatus || '').toLowerCase();
      const as = (a.approvalStatus || '').toLowerCase();
      return (ls === 'won / signed' || ls === 'won/signed' || ls === 'approved')
        && as !== 'accepted' && !isReadyForInstall(a);
    };
    const bookingIds = new Set(bookings.map(b => b.akquise_airtable_id).filter(Boolean));
    const notStornNotInstalled = acquisitionData.filter(a => !isStorno(a) && !isInstalled(a));
    const readyForInstallCount = notStornNotInstalled.filter(a =>
      isReadyForInstall(a) && !bookingIds.has(a.id)
    ).length;
    const inReviewCount = notStornNotInstalled.filter(a =>
      isInReview(a) && !bookingIds.has(a.id)
    ).length;

    // Week-over-week trend
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const lastWeek = bookings.filter(b => {
      const d = new Date(b.created_at);
      return d >= twoWeeksAgo && d < oneWeekAgo;
    }).length;
    const weekTrend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

    return {
      total: bookings.length, thisWeek,
      pending, booked, confirmed, completed, cancelled, noShow,
      conversionInviteToBook, noShowRate, avgTimeToBook,
      capacityUtil, totalCapacity, bookedSlots, overdue,
      readyForInstallCount, inReviewCount, weekTrend,
    };
  }, [bookings, routes, acquisitionData]);

  // Chart Data: Status distribution (Pie)
  const statusPieData = useMemo(() => {
    return Object.entries(STATUS_LABELS)
      .map(([key, label]) => ({
        name: label,
        value: bookings.filter(b => b.status === key).length,
        color: STATUS_COLORS[key],
      }))
      .filter(d => d.value > 0);
  }, [bookings]);

  // Chart Data: Bookings over time (last 14 days)
  const timelineData = useMemo(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayCreated = bookings.filter(b => (b.created_at || '').startsWith(dateStr));
      const dayBooked = bookings.filter(b => (b.booked_at || '').startsWith(dateStr));
      days.push({
        date: formatDate(dateStr),
        einladungen: dayCreated.length,
        buchungen: dayBooked.length,
      });
    }
    return days;
  }, [bookings]);

  // Chart Data: City comparison
  const cityChartData = useMemo(() => {
    const cityMap = {};
    bookings.forEach(b => {
      const city = b.city || 'Unbekannt';
      if (!cityMap[city]) cityMap[city] = { city, pending: 0, booked: 0, confirmed: 0, completed: 0, cancelled: 0 };
      if (cityMap[city][b.status] !== undefined) cityMap[city][b.status]++;
    });
    return Object.values(cityMap).sort((a, b) => {
      const totalA = a.pending + a.booked + a.confirmed + a.completed;
      const totalB = b.pending + b.booked + b.confirmed + b.completed;
      return totalB - totalA;
    });
  }, [bookings]);

  // Chart Data: Route capacity
  const capacityData = useMemo(() => {
    return routes
      .filter(r => r.status === 'open')
      .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))
      .slice(0, 10)
      .map(r => {
        const routeBookings = bookings.filter(b =>
          b.route_id === r.id && ['booked', 'confirmed', 'completed'].includes(b.status)
        ).length;
        return {
          name: `${(r.city || '').substring(0, 3)} ${formatDate(r.schedule_date)}`,
          belegt: routeBookings,
          frei: Math.max(0, (r.max_capacity || 4) - routeBookings),
        };
      });
  }, [routes, bookings]);

  // Funnel
  const funnelData = useMemo(() => {
    return [
      { stage: 'In Review', value: kpis.inReviewCount, color: '#94a3b8' },
      { stage: 'Bereit f. Aufbau', value: kpis.readyForInstallCount, color: '#06b6d4' },
      { stage: 'Eingeladen', value: kpis.pending + kpis.booked + kpis.confirmed + kpis.completed, color: '#eab308' },
      { stage: 'Gebucht', value: kpis.booked + kpis.confirmed + kpis.completed, color: '#3b82f6' },
      { stage: 'Bestätigt', value: kpis.confirmed + kpis.completed, color: '#22c55e' },
      { stage: 'Installiert', value: kpis.completed, color: '#10b981' },
    ];
  }, [kpis]);

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

  // Pending follow-ups (invited >48h)
  const pendingFollowups = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);
    return bookings
      .filter(b => b.status === 'pending' && b.whatsapp_sent_at && new Date(b.whatsapp_sent_at) < cutoff)
      .sort((a, b) => new Date(a.whatsapp_sent_at) - new Date(b.whatsapp_sent_at));
  }, [bookings]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 size={24} className="animate-spin text-orange-500" />
        <p className="text-sm">Dashboard wird geladen...</p>
      </div>
    );
  }

  if (bookings.length === 0 && routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
        <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
          <BarChart3 size={40} className="text-gray-300" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-gray-600">Noch keine Installationsdaten</p>
          <p className="text-sm text-gray-400 mt-1">Erstelle Routen und sende Einladungen, um hier Kennzahlen zu sehen.</p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded-xl hover:bg-orange-100 flex items-center gap-2 transition-colors"
        >
          <RefreshCw size={14} /> Daten laden
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="text-orange-500" size={24} /> Installations-Dashboard
          </h2>
          <p className="text-gray-500 mt-1">Gesamtuebersicht aller Installationstermine und Buchungen.</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors"
        >
          <RefreshCw size={16} /> Aktualisieren
        </button>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          label="Buchungen gesamt"
          value={kpis.total}
          subtitle={`${kpis.thisWeek} diese Woche`}
          icon={CalendarCheck}
          color="text-blue-600"
          bgColor="bg-blue-100"
          trend={kpis.weekTrend}
        />
        <KPICard
          label="Konversionsrate"
          value={`${kpis.conversionInviteToBook}%`}
          subtitle="Einladung -> Buchung"
          icon={TrendingUp}
          color="text-green-600"
          bgColor="bg-green-100"
        />
        <KPICard
          label="No-Show Rate"
          value={`${kpis.noShowRate}%`}
          subtitle={`${kpis.noShow} No-Shows`}
          icon={AlertTriangle}
          color="text-amber-600"
          bgColor="bg-amber-100"
        />
        <KPICard
          label="Avg. Buchungszeit"
          value={kpis.avgTimeToBook > 0 ? `${kpis.avgTimeToBook}h` : '--'}
          subtitle="Einladung bis Buchung"
          icon={Timer}
          color="text-purple-600"
          bgColor="bg-purple-100"
        />
        <KPICard
          label="Auslastung"
          value={`${kpis.capacityUtil}%`}
          subtitle={`${kpis.bookedSlots}/${kpis.totalCapacity} Slots`}
          icon={Building}
          color="text-indigo-600"
          bgColor="bg-indigo-100"
        />
        {kpis.overdue > 0 ? (
          <KPICard
            label="Ueberfaellig"
            value={kpis.overdue}
            subtitle="Aktion erforderlich"
            icon={AlertCircle}
            color="text-red-600"
            bgColor="bg-red-100"
          />
        ) : (
          <KPICard
            label="Abgeschlossen"
            value={kpis.completed}
            subtitle={`${kpis.confirmed} bestaetigt`}
            icon={CheckCircle}
            color="text-emerald-600"
            bgColor="bg-emerald-100"
          />
        )}
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-gray-400" /> Installations-Funnel
        </h3>
        <div className="flex items-center gap-1">
          {funnelData.map((stage, i) => {
            const maxVal = Math.max(...funnelData.map(s => s.value));
            const width = maxVal > 0 ? Math.max(15, (stage.value / maxVal) * 100) : 15;
            return (
              <React.Fragment key={stage.stage}>
                <div className="flex-1 text-center">
                  <div
                    className="mx-auto rounded-xl transition-all duration-500"
                    style={{
                      width: `${width}%`,
                      minWidth: '40px',
                      height: '48px',
                      backgroundColor: stage.color,
                      opacity: 0.8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span className="text-white font-bold text-sm">{stage.value}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1.5 font-medium">{stage.stage}</div>
                </div>
                {i < funnelData.length - 1 && (
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Timeline Chart */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" /> Verlauf (letzte 14 Tage)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="einladungen" name="Einladungen" stroke="#eab308" fill="#eab308" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="buchungen" name="Buchungen" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Pie */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-gray-400" /> Status-Verteilung
          </h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="60%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {statusPieData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-600 text-xs">{d.name}</span>
                  <span className="font-bold text-gray-900 ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* City Comparison */}
        {cityChartData.length > 0 && (
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-gray-400" /> Buchungen nach Stadt
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cityChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="city" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="completed" name="Abgeschlossen" fill={STATUS_COLORS.completed} stackId="stack" />
                  <Bar dataKey="confirmed" name="Bestaetigt" fill={STATUS_COLORS.confirmed} stackId="stack" />
                  <Bar dataKey="booked" name="Gebucht" fill={STATUS_COLORS.booked} stackId="stack" />
                  <Bar dataKey="pending" name="Eingeladen" fill={STATUS_COLORS.pending} stackId="stack" />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Route Capacity */}
        {capacityData.length > 0 && (
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Building size={16} className="text-gray-400" /> Routen-Auslastung
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={capacityData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="belegt" name="Belegt" fill="#3b82f6" stackId="cap" />
                  <Bar dataKey="frei" name="Frei" fill="#e2e8f0" stackId="cap" />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Upcoming + Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Installations */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-green-500" /> Anstehende Installationen (7 Tage)
          </h3>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
              <Inbox size={28} className="text-gray-300" />
              <p className="text-sm">Keine Termine in den naechsten 7 Tagen</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {upcoming.map(b => (
                <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-11 h-11 bg-green-50 rounded-xl flex flex-col items-center justify-center shrink-0 border border-green-100">
                    <div className="text-[9px] text-green-600 font-medium leading-none">
                      {new Date(b.booked_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short' })}
                    </div>
                    <div className="text-sm font-bold text-green-700 leading-none">
                      {new Date(b.booked_date + 'T00:00:00').getDate()}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                    <div className="text-xs text-gray-400">
                      {b.city} | {b.booked_time}-{b.booked_end_time} Uhr
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    b.status === 'confirmed'
                      ? 'bg-green-100 text-green-700 border-green-200'
                      : 'bg-blue-100 text-blue-700 border-blue-200'
                  }`}>
                    {b.status === 'confirmed' ? 'Bestaetigt' : 'Gebucht'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Follow-ups */}
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Follow-ups noetig
            {pendingFollowups.length > 0 && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                {pendingFollowups.length}
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-400 mb-3">Eingeladen vor &gt;48h, noch nicht gebucht</p>
          {pendingFollowups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
              <CheckCircle size={28} className="text-green-400" />
              <p className="text-sm">Alle Einladungen aktuell</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pendingFollowups.map(b => {
                const hoursSince = Math.round((Date.now() - new Date(b.whatsapp_sent_at).getTime()) / (1000 * 60 * 60));
                return (
                  <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-amber-50/50 transition-colors">
                    <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 border border-amber-100">
                      <Clock size={16} className="text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                      <div className="text-xs text-gray-400">
                        {b.city} | {b.contact_name} | {b.contact_phone}
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

      {/* Pipeline Status Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { key: 'pending', label: 'Eingeladen', value: kpis.pending },
          { key: 'booked', label: 'Gebucht', value: kpis.booked },
          { key: 'confirmed', label: 'Bestaetigt', value: kpis.confirmed },
          { key: 'completed', label: 'Abgeschlossen', value: kpis.completed },
          { key: 'cancelled', label: 'Storniert', value: kpis.cancelled },
          { key: 'no_show', label: 'No-Show', value: kpis.noShow },
        ].map(item => (
          <div key={item.key} className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl p-3 text-center">
            <div className="w-3 h-3 rounded-full mx-auto mb-1.5" style={{ backgroundColor: STATUS_COLORS[item.key] }} />
            <div className="text-xl font-bold text-gray-900">{item.value}</div>
            <div className="text-[10px] text-gray-500 font-medium">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
