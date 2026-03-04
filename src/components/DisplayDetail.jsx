import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  Monitor,
  MapPin,
  Calendar,
  Clock,
  Hash,
  TrendingUp,
  CalendarDays,
  Sun,
  User,
  Mail,
  Phone,
  Building2,
  FileText,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Wrench,
  Download,
  Users,
  Cpu,
  Wifi,
  ExternalLink,
  Lock,
  UtensilsCrossed,
  HardDrive,
  CardSim,
  Landmark,
  ArrowLeftRight,
  Package,
  TriangleAlert,
  DollarSign,
  History,
  ArrowRight,
  MapPinned,
  Grip,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts';
import {
  computeDisplayTimeline,
  getStatusColor,
  getStatusLabel,
  formatDuration,
  formatDate,
  formatDateTime,
} from '../utils/dataProcessing';
import {
  fetchStammdatenByDisplayId,
  fetchTasksByDisplayId,
  fetchInstallationByDisplayId,
  fetchAllCommunications,
  fetchAirtableDisplayByDisplayId,
  fetchHardwareByLocationId,
  fetchHardwareByOpsNr,
  fetchLeaseByJetId,
  fetchSwapsByLocationId,
  fetchDeinstallsByLocationId,
  findHardwareReassignment,
  fetchHardwareMovementHistory,
} from '../utils/airtableService';
import { hasPermission } from '../utils/authService';
import { fetchSingleVenueReport } from '../utils/vistarService';
import HardwareSwapModal from './HardwareSwapModal';
import DeinstallModal from './DeinstallModal';
import StimmcheckModal from './StimmcheckModal';
import HardwareComponentDetail from './HardwareComponentDetail';

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon size={14} className="text-text-muted flex-shrink-0" />
      <span className="text-text-muted text-xs w-32 flex-shrink-0">{label}</span>
      <span className={`text-text-primary text-xs ${mono ? 'font-mono' : ''}`}>
        {value || '–'}
      </span>
    </div>
  );
}

// ─── Day-by-day detail chart ───────────────────────────────────────────────────
// Groups snapshots by calendar day and renders a row per day.
// Each row shows coloured blocks (one per snapshot) so you can immediately see
// which hours were online / offline and how the status evolved.

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function buildDayRows(segments) {
  // bucket by YYYY-MM-DD
  const map = new Map();
  segments.forEach((seg) => {
    const d = seg.timestamp;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(seg);
  });
  // sort chronologically
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, segs]) => {
      const d = segs[0].timestamp;
      const dayName = DAY_NAMES[d.getDay()];
      const label = `${dayName} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
      const onlineCount = segs.filter((s) => s.isOnline).length;
      const rate = segs.length > 0 ? Math.round((onlineCount / segs.length) * 1000) / 10 : null;
      return { dateKey, label, segs, onlineCount, rate };
    });
}

function DayDetailChart({ segments }) {
  const [hoveredSeg, setHoveredSeg] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const dayRows = useMemo(() => buildDayRows(segments), [segments]);

  if (dayRows.length === 0) return null;

  // Find the maximum snapshots in any single day for normalising widths
  const maxSnaps = Math.max(...dayRows.map((r) => r.segs.length));

  return (
    <div>
      <h3 className="text-xs font-medium text-text-secondary mb-3">
        Tagesverlauf – Status pro Snapshot
      </h3>

      <div className="space-y-[3px] max-h-[400px] overflow-y-auto pr-1">
        {dayRows.map((row) => {
          const rateColor =
            row.rate == null
              ? '#64748b'
              : row.rate >= 90
                ? '#34C759'
                : row.rate >= 70
                  ? '#FF9500'
                  : row.rate >= 50
                    ? '#f97316'
                    : '#FF3B30';

          return (
            <div key={row.dateKey} className="flex items-center gap-2">
              {/* Date label */}
              <div className="w-[72px] flex-shrink-0 text-xs text-text-muted text-right">
                {row.label}
              </div>

              {/* Status blocks */}
              <div className="flex-1 flex items-center gap-[2px] min-h-[14px]">
                {row.segs.map((seg, i) => (
                  <div
                    key={i}
                    className="h-[14px] rounded-[2px] cursor-crosshair transition-all hover:scale-y-150 hover:z-10"
                    style={{
                      flex: 1,
                      maxWidth: `${Math.max(100 / maxSnaps, 4)}%`,
                      backgroundColor: getStatusColor(seg.status),
                      opacity: seg.isOnline ? 0.75 : 1,
                    }}
                    onMouseEnter={() => setHoveredSeg(seg)}
                    onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHoveredSeg(null)}
                  />
                ))}
              </div>

              {/* Day rate */}
              <div
                className="w-[42px] flex-shrink-0 text-xs font-bold text-right"
                style={{ color: rateColor }}
              >
                {row.rate != null ? `${row.rate}%` : '–'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-[#34C759] opacity-75" />
          <span className="text-xs text-text-muted">Online (&lt;24h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-[#FF9500]" />
          <span className="text-xs text-text-muted">Warnung (24–72h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-[#FF3B30]" />
          <span className="text-xs text-text-muted">Kritisch (&gt;72h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-[#FF3B30]" />
          <span className="text-xs text-text-muted">Dauerhaft (&gt;7d)</span>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredSeg && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: mousePos.x + 14, top: mousePos.y - 8 }}
        >
          <div className="bg-surface-primary border border-white/60 rounded-xl px-3 py-2 text-xs shadow-lg shadow-black/5">
            <div className="text-text-secondary mb-1">
              {formatDateTime(hoveredSeg.timestamp)}
            </div>
            <div className="font-bold" style={{ color: getStatusColor(hoveredSeg.status) }}>
              {getStatusLabel(hoveredSeg.status)}
            </div>
            {hoveredSeg.heartbeat && (
              <div className="text-text-muted mt-0.5">
                Heartbeat: {formatDateTime(hoveredSeg.heartbeat)}
              </div>
            )}
            {hoveredSeg.offlineHours != null && hoveredSeg.offlineHours >= 1 && (
              <div className="text-text-muted">
                Offline seit {formatDuration(hoveredSeg.offlineHours)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini summary timeline bar (compact) ──────────────────────────────────────

function TimelineBar({ segments }) {
  if (!segments || segments.length === 0) return null;

  return (
    <div className="flex w-full h-5 rounded overflow-hidden border border-border-secondary">
      {segments.map((seg, i) => (
        <div
          key={i}
          className="h-full"
          style={{
            flex: 1,
            backgroundColor: getStatusColor(seg.status),
            opacity: seg.status === 'online' ? 0.8 : 1,
          }}
          title={`${formatDateTime(seg.timestamp)} – ${getStatusLabel(seg.status)}`}
        />
      ))}
    </div>
  );
}

// ─── Weekday + Hour analysis helpers ──────────────────────────────────────────

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOUR_LABELS = [
  '00', '01', '02', '03', '04', '05', '06', '07',
  '08', '09', '10', '11', '12', '13', '14', '15',
  '16', '17', '18', '19', '20', '21', '22', '23',
];

function computeWeekdayStats(segments) {
  const days = Array.from({ length: 7 }, () => ({ total: 0, online: 0 }));
  segments.forEach((seg) => {
    const jsDay = seg.timestamp.getDay();
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
    days[dayIdx].total++;
    if (seg.isOnline) days[dayIdx].online++;
  });
  return days.map((d, i) => ({
    label: WEEKDAY_LABELS[i],
    total: d.total,
    online: d.online,
    rate: d.total > 0 ? Math.round((d.online / d.total) * 1000) / 10 : null,
  }));
}

function computeHourStats(segments) {
  const hours = Array.from({ length: 24 }, () => ({ total: 0, online: 0 }));
  segments.forEach((seg) => {
    const h = seg.timestamp.getHours();
    hours[h].total++;
    if (seg.isOnline) hours[h].online++;
  });
  return hours.map((d, i) => ({
    label: HOUR_LABELS[i],
    total: d.total,
    online: d.online,
    rate: d.total > 0 ? Math.round((d.online / d.total) * 1000) / 10 : null,
  }));
}

function statusRateColor(rate) {
  if (rate == null) return '#cbd5e1';
  if (rate >= 90) return '#34C759';
  if (rate >= 70) return '#FF9500';
  if (rate >= 50) return '#f97316';
  return '#FF3B30';
}

function rateBg(rate) {
  if (rate == null) return '#cbd5e120';
  if (rate >= 90) return '#34C75918';
  if (rate >= 70) return '#FF950018';
  if (rate >= 50) return '#f9731618';
  return '#FF3B3018';
}

function WeekdayChart({ segments }) {
  const stats = useMemo(() => computeWeekdayStats(segments), [segments]);
  const minRate = Math.min(...stats.filter((s) => s.rate != null).map((s) => s.rate));
  const worstDay = stats.find((s) => s.rate === minRate);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={14} className="text-text-muted" />
        <h3 className="text-xs font-medium text-text-secondary">
          Online-Rate nach Wochentag
        </h3>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {stats.map((day) => {
          const barH = day.rate != null ? Math.max(8, (day.rate / 100) * 60) : 0;
          return (
            <div key={day.label} className="flex flex-col items-center">
              <div className="h-[60px] w-full flex items-end justify-center">
                <div
                  className="w-full max-w-[32px] rounded-t transition-all"
                  style={{
                    height: `${barH}px`,
                    backgroundColor: statusRateColor(day.rate),
                    opacity: 0.8,
                  }}
                />
              </div>
              <div className="text-xs text-text-muted mt-1">{day.label}</div>
              <div
                className="text-xs font-bold"
                style={{ color: day.rate != null ? statusRateColor(day.rate) : '#64748b' }}
              >
                {day.rate != null ? `${day.rate}%` : '–'}
              </div>
              <div className="text-xs text-text-muted">
                {day.total > 0 ? `n=${day.total}` : ''}
              </div>
            </div>
          );
        })}
      </div>
      {worstDay && worstDay.rate != null && worstDay.rate < 90 && (
        <div className="mt-3 px-3 py-2 rounded bg-surface-secondary/80 border border-border-secondary">
          <span className="text-xs text-text-muted">
            Schwächster Tag:{' '}
            <span className="font-bold" style={{ color: statusRateColor(worstDay.rate) }}>
              {worstDay.label} ({worstDay.rate}%)
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function HourChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-surface-primary border border-border-primary/40 rounded-lg px-3 py-2 text-xs shadow-card">
      <div className="text-text-secondary mb-1">{data.label}:00 Uhr</div>
      <div className="font-bold" style={{ color: data.rate != null ? statusRateColor(data.rate) : '#64748b' }}>
        {data.rate != null ? `${data.rate}%` : '–'} online
      </div>
      <div className="text-text-muted">
        {data.online}/{data.total} Checks
      </div>
    </div>
  );
}

function HourChart({ segments }) {
  const allStats = useMemo(() => computeHourStats(segments), [segments]);

  // Filter to 6–24h (indices 6..23)
  const stats = useMemo(() => allStats.filter((_, i) => i >= 6), [allStats]);

  const problemHours = stats.filter((s) => s.rate != null && s.rate < 70);
  const hasData = stats.some((s) => s.rate != null);

  // Compute average for the business hours
  const avgRate = useMemo(() => {
    const withData = stats.filter((s) => s.rate != null);
    if (withData.length === 0) return null;
    return Math.round(withData.reduce((sum, s) => sum + s.rate, 0) / withData.length * 10) / 10;
  }, [stats]);

  // Custom dot: color based on rate
  const renderDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload.rate == null || !cx || !cy) return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={statusRateColor(payload.rate)}
        stroke="#fff"
        strokeWidth={2}
      />
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sun size={14} className="text-text-muted" />
          <h3 className="text-xs font-medium text-text-secondary">
            Online-Rate nach Tageszeit
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
            06:00 – 23:00
          </span>
          {avgRate != null && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{
                backgroundColor: statusRateColor(avgRate) + '18',
                color: statusRateColor(avgRate),
              }}
            >
              Ø {avgRate}%
            </span>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[180px] flex items-center justify-center text-text-muted text-xs">
          Keine Stundendaten verfügbar
        </div>
      ) : (
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="hourRateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#007AFF" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#007AFF" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f033" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={(v) => `${v}h`}
                axisLine={{ stroke: '#e2e8f060' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                tickFormatter={(v) => `${v}%`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<HourChartTooltip />} />
              <ReferenceLine
                y={90}
                stroke="#34C759"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: '90%',
                  position: 'right',
                  style: { fontSize: 11, fill: '#34C759', fontFamily: 'monospace' },
                }}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke="#007AFF"
                strokeWidth={2.5}
                fill="url(#hourRateGradient)"
                dot={renderDot}
                activeDot={{ r: 6, stroke: '#007AFF', strokeWidth: 2, fill: '#fff' }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#34C759]" />
          <span className="text-xs text-text-muted">&ge;90%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#FF9500]" />
          <span className="text-xs text-text-muted">70–90%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316]" />
          <span className="text-xs text-text-muted">50–70%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#FF3B30]" />
          <span className="text-xs text-text-muted">&lt;50%</span>
        </div>
      </div>

      {/* Problem hours callout */}
      {problemHours.length > 0 && (
        <div className="mt-3 px-3 py-2 rounded bg-surface-secondary/80 border border-border-secondary">
          <span className="text-xs text-text-muted">
            Problemzeiten:{' '}
            {problemHours.map((h, i) => (
              <span key={h.label}>
                {i > 0 && ', '}
                <span className="font-bold" style={{ color: statusRateColor(h.rate) }}>
                  {h.label}:00 ({h.rate}%)
                </span>
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Airtable: Contact Info Panel ──────────────────────────────────────────────

/**
 * Build a Lieferando search URL for a given location.
 * Lieferando URLs are slug-based (no direct JET-ID lookup),
 * so we link to a Google "I'm feeling lucky" search which
 * reliably lands on the correct Lieferando page.
 */
function buildLieferandoSearchUrl(stammdaten) {
  const name = stammdaten['Location Name'] || '';
  const city = stammdaten['City'] || '';
  const jetId = stammdaten['JET ID'] || '';
  if (!name && !jetId) return null;
  // Build a search query that should uniquely identify the restaurant on Lieferando
  const query = [name, city, 'lieferando.de'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&btnI=1`;
}

function ContactInfoPanel({ stammdaten, loading, airtableDisplay, onStimmcheck }) {
  const canViewContacts = hasPermission('view_contacts');

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#007AFF] animate-spin" />
        <span className="text-xs text-text-muted">Lade Standortdaten...</span>
      </div>
    );
  }

  if (!stammdaten) return null;

  const address = [
    stammdaten['Street'],
    stammdaten['Street Number'],
  ].filter(Boolean).join(' ');

  const cityLine = [
    stammdaten['Postal Code'],
    stammdaten['City'],
  ].filter(Boolean).join(' ');

  const leadStatus = stammdaten['Lead Status  (from Akquise)'];
  const leadStatusLabel = Array.isArray(leadStatus) ? leadStatus.join(', ') : leadStatus;

  const lieferandoUrl = buildLieferandoSearchUrl(stammdaten);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Building2 size={14} className="text-[#007AFF]" />
        <h3 className="text-xs font-medium text-text-secondary">
          Standort-Informationen
        </h3>
        {stammdaten['JET ID'] && (
          <span className="text-xs bg-[#007AFF]/15 text-[#007AFF] px-2 py-0.5 rounded-full border border-[#007AFF]/25">
            JET ID: {stammdaten['JET ID']}
          </span>
        )}
        {lieferandoUrl && (
          <a
            href={lieferandoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-[#ff8000]/10 text-[#ff8000] px-2 py-0.5 rounded-full border border-[#ff8000]/25 hover:bg-[#ff8000]/20 transition-colors"
          >
            <UtensilsCrossed size={10} />
            Lieferando
            <ExternalLink size={9} />
          </a>
        )}
        {(() => {
          const parts = [
            stammdaten['Street'],
            stammdaten['Street Number'],
            stammdaten['Postal Code'],
            stammdaten['City'],
          ].filter(Boolean);
          if (parts.length < 2) return null;
          const query = parts.join(' ');
          const svUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=0,0&query=${encodeURIComponent(query)}`;
          return (
            <a
              href={svUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200/60 hover:bg-emerald-100 transition-colors"
            >
              <MapPinned size={10} />
              Street View
              <ExternalLink size={9} />
            </a>
          );
        })()}
        {onStimmcheck && (
          <button
            onClick={onStimmcheck}
            className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200/60 hover:bg-emerald-100 transition-colors"
          >
            <Phone size={10} />
            Stimmcheck planen
          </button>
        )}
        {!canViewContacts && (
          <span className="inline-flex items-center gap-1 text-xs text-text-muted bg-surface-secondary px-2 py-0.5 rounded-full">
            <Lock size={9} />
            Kontaktdaten eingeschränkt
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
        {/* Left column – Contact (permission-gated) */}
        <div>
          {canViewContacts ? (
            <>
              {stammdaten['Contact Person'] && (
                <InfoRow icon={User} label="Kontaktperson" value={stammdaten['Contact Person']} />
              )}
              {stammdaten['Contact Email'] && (
                <InfoRow icon={Mail} label="Kontakt E-Mail" value={stammdaten['Contact Email']} />
              )}
              {stammdaten['Contact Phone'] && (
                <InfoRow icon={Phone} label="Kontakt Telefon" value={stammdaten['Contact Phone']} />
              )}
              {stammdaten['Location Email'] && (
                <InfoRow icon={Mail} label="Standort E-Mail" value={stammdaten['Location Email']} />
              )}
              {stammdaten['Location Phone'] && (
                <InfoRow icon={Phone} label="Standort Telefon" value={stammdaten['Location Phone']} />
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 py-3">
              <Lock size={12} className="text-text-muted" />
              <span className="text-xs text-text-muted italic">
                Kontaktdaten nur für berechtigte Benutzer sichtbar
              </span>
            </div>
          )}
        </div>

        {/* Right column – Address (always visible) */}
        <div>
          {stammdaten['Legal Entity'] && (
            <InfoRow icon={Building2} label="Rechtseinheit" value={stammdaten['Legal Entity']} />
          )}
          {stammdaten['Location Name'] && (
            <InfoRow icon={MapPin} label="Standortname" value={stammdaten['Location Name']} />
          )}
          {address && (
            <InfoRow icon={MapPin} label="Adresse" value={address} />
          )}
          {cityLine && (
            <InfoRow icon={MapPin} label="Ort" value={cityLine} />
          )}
          {leadStatusLabel && (
            <InfoRow icon={FileText} label="Lead-Status" value={leadStatusLabel} />
          )}
        </div>
      </div>

      {/* ─── Airtable Display Enrichment (from airtable_displays) ─── */}
      {airtableDisplay && (
        <div className="mt-3 pt-3 border-t border-border-secondary">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
            <div>
              {airtableDisplay.online_status && (
                <div className="flex items-center gap-3 py-1.5">
                  <Monitor size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-text-muted text-xs w-32 flex-shrink-0">AT Status</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    /^live$/i.test(airtableDisplay.online_status)
                      ? 'bg-emerald-100 text-emerald-700'
                      : /deinstall/i.test(airtableDisplay.online_status)
                        ? 'bg-status-offline/10 text-red-700'
                        : 'bg-status-warning/10 text-amber-700'
                  }`}>
                    {airtableDisplay.online_status}
                  </span>
                </div>
              )}
              {airtableDisplay.screen_type && (
                <InfoRow icon={Monitor} label="Screen-Typ" value={airtableDisplay.screen_type} />
              )}
              {airtableDisplay.screen_size && (
                <InfoRow icon={Monitor} label="Screen-Größe" value={airtableDisplay.screen_size} />
              )}
              {airtableDisplay.rtb_venue_type && (
                <InfoRow icon={Building2} label="RTB Venue Type" value={airtableDisplay.rtb_venue_type} mono />
              )}
            </div>
            <div>
              {airtableDisplay.sov_partner_ad != null && airtableDisplay.sov_partner_ad > 0 && (
                <div className="flex items-center gap-3 py-1.5">
                  <TrendingUp size={14} className="text-text-muted flex-shrink-0" />
                  <span className="text-text-muted text-xs w-32 flex-shrink-0">SoV Partner Ad</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-surface-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#007AFF] rounded-full"
                        style={{ width: `${Math.min(100, airtableDisplay.sov_partner_ad)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-text-primary">
                      {airtableDisplay.sov_partner_ad}%
                    </span>
                  </div>
                </div>
              )}
              {airtableDisplay.live_since && (
                <InfoRow icon={Calendar} label="Live seit" value={formatDate(airtableDisplay.live_since)} />
              )}
              {airtableDisplay.screen_network_category && (
                <InfoRow icon={Wifi} label="Netzwerk-Kategorie" value={airtableDisplay.screen_network_category} />
              )}
              {airtableDisplay.navori_venue_id && (
                <InfoRow icon={Hash} label="Navori Venue ID" value={airtableDisplay.navori_venue_id} mono />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Airtable: Tasks Panel ──────────────────────────────────────────────────────

function getTaskStatusIcon(status) {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'done':
    case 'erledigt':
      return <CheckCircle2 size={12} className="text-[#34C759]" />;
    case 'in progress':
    case 'in bearbeitung':
      return <Circle size={12} className="text-[#007AFF]" />;
    case 'blocked':
    case 'blockiert':
      return <AlertTriangle size={12} className="text-[#FF3B30]" />;
    default:
      return <Circle size={12} className="text-[#64748b]" />;
  }
}

function getTaskStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'done':
    case 'erledigt':
      return { bg: '#34C75915', text: '#34C759', border: '#34C75933' };
    case 'in progress':
    case 'in bearbeitung':
      return { bg: '#007AFF15', text: '#007AFF', border: '#007AFF33' };
    case 'blocked':
    case 'blockiert':
      return { bg: '#FF3B3015', text: '#FF3B30', border: '#FF3B3033' };
    default:
      return { bg: '#64748b15', text: '#64748b', border: '#64748b33' };
  }
}

function getPriorityColor(priority) {
  switch (priority?.toLowerCase()) {
    case 'high':
    case 'hoch':
    case 'urgent':
    case 'dringend':
      return '#FF3B30';
    case 'medium':
    case 'mittel':
      return '#FF9500';
    case 'low':
    case 'niedrig':
      return '#34C759';
    default:
      return '#64748b';
  }
}

function TasksPanel({ tasks, loading }) {
  const [expandedTask, setExpandedTask] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#007AFF] animate-spin" />
        <span className="text-xs text-text-muted">Lade Aufgaben...</span>
      </div>
    );
  }

  if (!tasks || tasks.length === 0) return null;

  const openTasks = tasks.filter(
    (t) => !['completed', 'done', 'erledigt'].includes(t.status?.toLowerCase())
  );
  const completedTasks = tasks.filter(
    (t) => ['completed', 'done', 'erledigt'].includes(t.status?.toLowerCase())
  );

  const formatTaskDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  const formatTaskDateTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderTask = (task) => {
    const isExpanded = expandedTask === task.id;
    const statusColors = getTaskStatusColor(task.status);

    return (
      <div
        key={task.id}
        className="bg-surface-secondary/80 rounded-lg border border-border-secondary overflow-hidden transition-colors hover:border-border-primary/40"
      >
        <div
          className="flex items-start gap-3 px-3 py-2.5 cursor-pointer"
          onClick={() => setExpandedTask(isExpanded ? null : task.id)}
        >
          <div className="mt-0.5 flex-shrink-0">
            {getTaskStatusIcon(task.status)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-primary font-medium truncate">
                {task.title}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Status badge */}
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: statusColors.bg,
                  color: statusColors.text,
                  border: `1px solid ${statusColors.border}`,
                }}
              >
                {task.status || 'Offen'}
              </span>

              {/* Priority */}
              {task.priority && (
                <span
                  className="text-xs font-bold"
                  style={{ color: getPriorityColor(task.priority) }}
                >
                  {task.priority}
                </span>
              )}

              {/* Assigned / Responsible */}
              {(task.responsibleUser || (task.assigned && task.assigned.length > 0)) && (
                <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                  <User size={9} className="text-text-muted" />
                  {task.responsibleUser || task.assigned?.join(', ')}
                </span>
              )}

              {/* Partner badge */}
              {task.partner && (
                <span className="text-xs text-text-secondary bg-surface-tertiary px-1.5 py-0.5 rounded">
                  {task.partner}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-text-muted">
              {formatTaskDateTime(task.createdTime)}
            </span>
            {isExpanded ? (
              <ChevronDown size={12} className="text-text-muted" />
            ) : (
              <ChevronRight size={12} className="text-text-muted" />
            )}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-3 pb-3 pt-0 border-t border-border-secondary ml-6">
            <div className="space-y-1.5 mt-2">
              {task.description && (
                <div className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed bg-surface-primary rounded p-2 max-h-32 overflow-y-auto">
                  {task.description}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                {task.dueDate && (
                  <span>Fällig: <span className="text-text-secondary">{formatTaskDate(task.dueDate)}</span></span>
                )}
                {task.responsibleUser && (
                  <span>Verantwortlich: <span className="text-text-secondary">{task.responsibleUser}</span></span>
                )}
                {task.assigned && task.assigned.length > 0 && (
                  <span>Zugewiesen: <span className="text-text-secondary">{task.assigned.join(', ')}</span></span>
                )}
                {task.createdBy && (
                  <span>Erstellt von: <span className="text-text-secondary">{task.createdBy}</span></span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={14} className="text-[#007AFF]" />
        <h3 className="text-xs font-medium text-text-secondary">
          Aufgaben
        </h3>
        <span className="text-xs text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
          {tasks.length} gesamt
        </span>
        {openTasks.length > 0 && (
          <span className="text-xs text-[#FF9500] bg-[#FF9500]/10 px-2 py-0.5 rounded border border-[#FF9500]/25">
            {openTasks.length} offen
          </span>
        )}
      </div>

      <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
        {/* Open tasks first */}
        {openTasks.length > 0 && (
          <>
            {openTasks.map(renderTask)}
          </>
        )}

        {/* Then completed */}
        {completedTasks.length > 0 && (
          <>
            {openTasks.length > 0 && (
              <div className="text-xs text-text-muted pt-2 pb-1">
                Abgeschlossen ({completedTasks.length})
              </div>
            )}
            {completedTasks.map(renderTask)}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Airtable: Installation Panel ──────────────────────────────────────────────

function InstallationPanel({ installation, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#007AFF] animate-spin" />
        <span className="text-xs text-text-muted">Lade Installationsdaten...</span>
      </div>
    );
  }

  if (!installation) return null;

  const formatInstallDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };

  const getStatusBadge = (status) => {
    const colors = {
      'Installiert': { bg: '#34C75915', text: '#34C759', border: '#34C75933' },
      'In Planung': { bg: '#007AFF15', text: '#007AFF', border: '#007AFF33' },
      'Abgebrochen': { bg: '#FF3B3015', text: '#FF3B30', border: '#FF3B3033' },
    };
    const c = colors[status] || { bg: '#64748b15', text: '#64748b', border: '#64748b33' };
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      >
        {status}
      </span>
    );
  };

  // Protocol PDF – get the first attachment if available
  const protocolPdf = installation.protocol?.[0] || null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Wrench size={14} className="text-[#007AFF]" />
        <h3 className="text-xs font-medium text-text-secondary">
          Installation
        </h3>
        {installation.status && getStatusBadge(installation.status)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
        {/* Left column – Installation details */}
        <div>
          {installation.installDate && (
            <InfoRow icon={Calendar} label="Aufbaudatum" value={formatInstallDate(installation.installDate)} mono />
          )}
          {installation.integrator && (
            <InfoRow icon={Building2} label="Integrator" value={installation.integrator} />
          )}
          {installation.technicians.length > 0 && (
            <InfoRow icon={Users} label="Techniker" value={installation.technicians.join(', ')} />
          )}
          {installation.partnerName && (
            <InfoRow icon={User} label="Partner-Abnahme" value={installation.partnerName} />
          )}
          {installation.installationType && (
            <InfoRow icon={Wrench} label="Installationsart" value={installation.installationType} />
          )}
        </div>

        {/* Right column – Technical details */}
        <div>
          {(installation.screenType || installation.screenSize) && (
            <InfoRow
              icon={Monitor}
              label="Display-Typ"
              value={`${installation.screenSize}″ ${installation.screenType}`}
              mono
            />
          )}
          {installation.opsNr && (
            <InfoRow icon={Cpu} label="OPS Nr" value={installation.opsNr} mono />
          )}
          {installation.simId && (
            <InfoRow icon={Wifi} label="SIM-ID" value={installation.simId} mono />
          )}
          {installation.remarks && (
            <div className="flex items-start gap-3 py-1.5">
              <FileText size={14} className="text-text-muted flex-shrink-0 mt-0.5" />
              <span className="text-text-muted text-xs w-32 flex-shrink-0">Bemerkungen</span>
              <span className="text-text-secondary text-xs whitespace-pre-wrap leading-relaxed">
                {installation.remarks}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Protocol PDF download */}
      {protocolPdf && (
        <div className="mt-3 flex items-center gap-2">
          <a
            href={protocolPdf.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-secondary/80 border border-border-secondary text-xs text-text-secondary hover:border-[#007AFF] hover:text-text-primary transition-colors"
          >
            <Download size={12} className="text-[#007AFF]" />
            <span>Installationsprotokoll</span>
            <span className="text-text-muted">({protocolPdf.filename || 'PDF'})</span>
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Hardware Set Panel ──────────────────────────────────────────────────────

function HardwareSetPanel({ hardware, loading, reassignment, reassignmentLoading, onShowHistory, leaseData, installation, airtableDisplay, onSelectComponent }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#007AFF] animate-spin" />
        <span className="text-xs text-text-muted">Lade Hardware-Daten...</span>
      </div>
    );
  }

  if (!hardware || (hardware.ops.length === 0 && hardware.sims.length === 0 && hardware.displays.length === 0 && !installation)) {
    return null;
  }

  const statusBadge = (status) => {
    const colors = {
      'active': { bg: '#34C75915', text: '#34C759', border: '#34C75933', label: 'Aktiv' },
      'defect': { bg: '#FF3B3015', text: '#FF3B30', border: '#FF3B3033', label: 'Defekt' },
      'prep/ warehouse': { bg: '#64748b15', text: '#64748b', border: '#64748b33', label: 'Lager' },
      'out for installation': { bg: '#FF950015', text: '#FF9500', border: '#FF950033', label: 'Unterwegs' },
      'test device': { bg: '#AF52DE15', text: '#AF52DE', border: '#AF52DE33', label: 'Test' },
    };
    const c = colors[status] || { bg: '#64748b15', text: '#64748b', border: '#64748b33', label: status || '–' };
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      >
        {c.label}
      </span>
    );
  };

  // Build reassignment info per serial
  const reassignmentForSn = (snType, snValue) => {
    if (reassignmentLoading || !reassignment || !snValue) return null;
    const info = reassignment[snType];
    if (!info || !info.location) return null;
    const loc = info.location;
    return (
      <div className="mt-2 bg-accent-light/80 border border-accent/20/50 rounded-md px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <MapPinned size={10} className="text-accent flex-shrink-0" />
          <span className="text-xs text-blue-700 font-medium">Jetzt bei:</span>
          <span className="text-xs text-blue-800">
            {loc.locationName}{loc.city ? ` (${loc.city})` : ''}
          </span>
        </div>
        {info.opsRecord?.status && (
          <div className="text-xs text-accent mt-0.5 ml-4">
            Status: {info.opsRecord.status} · OPS {info.opsRecord.opsNr || info.opsRecord.opsSn}
          </div>
        )}
      </div>
    );
  };

  const historyButton = (snType, snValue, label) => {
    if (!snValue || !onShowHistory) return null;
    return (
      <button
        onClick={() => onShowHistory(snType, snValue, label)}
        className="mt-1.5 flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
        title={`Bewegungshistorie für ${label}`}
      >
        <History size={10} />
        <span>Historie</span>
      </button>
    );
  };

  // Check if any hardware has been reassigned
  const hasReassignment = reassignment && (reassignment.opsSn || reassignment.displaySn || reassignment.simId);

  // ─── SN Mismatch Detection ───────────────────────────────────────────
  // Compare serial numbers across sources: Hardware (Airtable), Leasing (Bank/CHG), Navori Venue ID
  const mismatches = useMemo(() => {
    const issues = [];
    const ops0 = hardware?.ops?.[0];
    const disp0 = hardware?.displays?.[0];
    const chg = leaseData?.chg;
    const bank = leaseData?.bank;
    const navoriVenueId = airtableDisplay?.navori_venue_id || '';

    // OPS-SN from hardware
    const hwOpsSn = ops0?.opsSn || '';
    // Display-SN from hardware_displays
    const hwDisplaySn = disp0?.displaySerialNumber || ops0?.displaySn || '';
    // Display-SN from CHG Leasing
    const chgDisplaySn = chg?.displaySn || '';
    // Serial from Bank Leasing
    const bankSerial = bank?.serialNumber || '';
    // Navori Venue ID from airtable_displays
    const navoriId = navoriVenueId;
    // Navori Venue ID from OPS
    const opsNavoriId = ops0?.navoriVenueId || '';

    // Check: CHG Display-SN ≠ Hardware Display-SN
    if (chgDisplaySn && hwDisplaySn && chgDisplaySn !== hwDisplaySn) {
      issues.push({
        label: 'Display-SN',
        source1: 'Hardware', value1: hwDisplaySn,
        source2: 'CHG Leasing', value2: chgDisplaySn,
      });
    }

    // Check: Bank Serial ≠ Hardware Display-SN
    if (bankSerial && hwDisplaySn && bankSerial !== hwDisplaySn) {
      issues.push({
        label: 'Display-SN',
        source1: 'Hardware', value1: hwDisplaySn,
        source2: 'Bank Leasing', value2: bankSerial,
      });
    }

    // Check: CHG Display-SN ≠ Bank Serial
    if (chgDisplaySn && bankSerial && chgDisplaySn !== bankSerial) {
      issues.push({
        label: 'Display-SN',
        source1: 'CHG Leasing', value1: chgDisplaySn,
        source2: 'Bank Leasing', value2: bankSerial,
      });
    }

    // Check: Navori Venue ID mismatch (airtable_displays vs OPS)
    // airtable_displays.navori_venue_id = CMS/Vistar Venue ID from Display Locations table
    // ops.navori_venue_id = CMS/Vistar Venue ID from OPS Player Inventory table
    if (navoriId && opsNavoriId && navoriId !== opsNavoriId) {
      issues.push({
        label: 'Navori Venue-ID (CMS/Vistar)',
        source1: 'Display-Tabelle', value1: navoriId,
        source2: 'OPS-Tabelle', value2: opsNavoriId,
      });
    }

    // Check: OPS-SN not matching bank serial (if bank tracks OPS)
    if (bankSerial && hwOpsSn && bankSerial === hwOpsSn) {
      // This is actually OK — bank serial IS the OPS-SN, not display-SN
      // Don't flag as mismatch
    }

    return issues;
  }, [hardware, leaseData, airtableDisplay]);

  // ─── Leasing Display-SN (for cross-reference) ────────────────────────
  const leasingDisplaySn = leaseData?.chg?.displaySn || leaseData?.bank?.serialNumber || '';

  // ─── Installation protocol SN for cross-reference ─────────────────────
  const installOpsSn = installation?.opsNr || '';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <HardDrive size={14} className="text-[#007AFF]" />
        <h3 className="text-xs font-medium text-text-secondary">
          Hardware-Set
        </h3>
        {reassignmentLoading && (
          <Loader2 size={10} className="text-accent animate-spin" />
        )}
      </div>

      {/* SN Mismatch Warnings */}
      {mismatches.length > 0 && (
        <div className="mb-3 bg-status-offline/10/80 border border-status-offline/20/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <TriangleAlert size={14} className="text-status-offline" />
            <span className="text-sm font-bold text-red-800">Abweichung</span>
            <span className="text-xs text-status-offline">({mismatches.length} {mismatches.length === 1 ? 'Fehler' : 'Fehler'})</span>
          </div>
          <div className="space-y-2">
            {mismatches.map((m, i) => (
              <div key={i} className="text-xs bg-status-offline/10/50 rounded-lg px-3 py-2">
                <div className="text-red-700 font-semibold mb-1">{m.label}</div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <span className="text-status-offline text-xs whitespace-nowrap">{m.source1}:</span>
                  <span className="font-mono text-red-800 text-xs break-all">{m.value1}</span>
                  <span className="text-status-offline text-xs whitespace-nowrap">{m.source2}:</span>
                  <span className="font-mono text-red-800 text-xs break-all">{m.value2}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-reference: Leasing + Installation SNs */}
      {(leasingDisplaySn || installOpsSn) && (
        <div className="mb-3 bg-surface-secondary/80 border border-border-secondary/40 rounded-lg px-3 py-2">
          <div className="text-xs text-text-muted uppercase mb-1">Abgleich-Referenz</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {leasingDisplaySn && (
              <div className="text-xs">
                <span className="text-text-muted">Leasing-SN: </span>
                <span className="font-mono text-text-secondary">{leasingDisplaySn}</span>
              </div>
            )}
            {installOpsSn && (
              <div className="text-xs">
                <span className="text-text-muted">Install-Protokoll OPS: </span>
                <span className="font-mono text-text-secondary">{installOpsSn}</span>
              </div>
            )}
            {installation?.simId && (
              <div className="text-xs">
                <span className="text-text-muted">Install-Protokoll SIM: </span>
                <span className="font-mono text-text-secondary">{installation.simId}</span>
              </div>
            )}
            {installation?.screenType && (
              <div className="text-xs">
                <span className="text-text-muted">Install Screen: </span>
                <span className="font-mono text-text-secondary">{installation.screenType} {installation.screenSize || ''}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reassignment Summary Banner */}
      {hasReassignment && (
        <div className="mb-3 bg-status-warning/10/80 border border-status-warning/20/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <ArrowRight size={12} className="text-status-warning" />
            <span className="text-xs font-medium text-amber-800">Hardware umgezogen</span>
          </div>
          <div className="space-y-1">
            {reassignment.opsSn?.location && (
              <div className="text-xs text-amber-700">
                <span className="text-status-warning">OPS-SN</span>
                <ArrowRight size={9} className="inline mx-1 text-amber-400" />
                <span className="font-mono">{reassignment.opsSn.location.locationName}</span>
                {reassignment.opsSn.location.city && <span className="text-status-warning"> ({reassignment.opsSn.location.city})</span>}
              </div>
            )}
            {reassignment.displaySn?.location && (
              <div className="text-xs text-amber-700">
                <span className="text-status-warning">Display-SN</span>
                <ArrowRight size={9} className="inline mx-1 text-amber-400" />
                <span className="font-mono">{reassignment.displaySn.location.locationName}</span>
                {reassignment.displaySn.location.city && <span className="text-status-warning"> ({reassignment.displaySn.location.city})</span>}
              </div>
            )}
            {reassignment.simId?.location && (
              <div className="text-xs text-amber-700">
                <span className="text-status-warning">SIM-ID</span>
                <ArrowRight size={9} className="inline mx-1 text-amber-400" />
                <span className="font-mono">{reassignment.simId.location.locationName}</span>
                {reassignment.simId.location.city && <span className="text-status-warning"> ({reassignment.simId.location.city})</span>}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* ── Display ── */}
        {hardware.displays.length > 0 ? hardware.displays.map((disp, i) => (
          <div
            key={disp.id || i}
            className="bg-surface-secondary/60 border border-border-secondary/40 rounded-lg p-3 cursor-pointer hover:ring-2 hover:ring-purple-200 transition-all"
            onClick={() => onSelectComponent?.({ type: 'display', id: disp.id })}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Monitor size={12} className="text-brand-purple" />
                <span className="text-xs font-medium text-text-muted uppercase">Display</span>
              </div>
              {statusBadge(disp.status)}
            </div>
            <div className="space-y-1">
              {disp.displaySerialNumber && <div className="text-xs"><span className="text-text-muted">SN: </span><span className="font-mono text-text-primary text-[11px]">{disp.displaySerialNumber}</span></div>}
              {(airtableDisplay?.screen_type || airtableDisplay?.screen_size) && (
                <div className="text-xs"><span className="text-text-muted">Typ: </span><span className="text-text-primary">{airtableDisplay.screen_size ? `${airtableDisplay.screen_size} ` : ''}{airtableDisplay.screen_type || ''}</span></div>
              )}
              {disp.location && <div className="text-xs"><span className="text-text-muted">Standort: </span><span className="text-text-primary">{disp.location}</span></div>}
            </div>
            {disp.displaySerialNumber && reassignmentForSn('displaySn', disp.displaySerialNumber)}
            <div onClick={(e) => e.stopPropagation()}>
              {disp.displaySerialNumber && historyButton('displaySn', disp.displaySerialNumber, `Display ${disp.displaySerialNumber}`)}
            </div>
          </div>
        )) : (
          <div className="bg-surface-secondary/40 border border-dashed border-border-secondary rounded-lg p-3 flex flex-col items-center justify-center text-center min-h-[80px]">
            <Monitor size={16} className="text-text-muted mb-1" />
            <span className="text-xs text-text-muted">Display</span>
            <span className="text-[10px] text-text-muted">nicht zugewiesen</span>
          </div>
        )}

        {/* ── OPS Player ── */}
        {hardware.ops.length > 0 ? hardware.ops.map((ops, i) => (
          <div
            key={ops.id || i}
            className="bg-surface-secondary/60 border border-border-secondary/40 rounded-lg p-3 cursor-pointer hover:ring-2 hover:ring-accent/20 transition-all"
            onClick={() => onSelectComponent?.({ type: 'ops', id: ops.id })}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Cpu size={12} className="text-accent" />
                <span className="text-xs font-medium text-text-muted uppercase">OPS Player</span>
              </div>
              <div className="flex items-center gap-1.5">
                {ops._enriched && (
                  <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] text-accent bg-accent-light border border-accent/20/50">NocoDB</span>
                )}
                {statusBadge(ops.status)}
              </div>
            </div>
            <div className="space-y-1">
              {ops.opsNr && <div className="text-xs"><span className="text-text-muted">Nr: </span><span className="font-mono text-text-primary">{ops.opsNr}</span></div>}
              {ops.opsSn && <div className="text-xs"><span className="text-text-muted">SN: </span><span className="font-mono text-text-primary text-[11px]">{ops.opsSn}</span></div>}
              {ops.hardwareType && <div className="text-xs"><span className="text-text-muted">Typ: </span><span className="text-text-primary">{ops.hardwareType}</span></div>}
              {ops.nocoKundenNr && <div className="text-xs"><span className="text-text-muted">Kunden-Nr: </span><span className="font-mono text-text-primary">{ops.nocoKundenNr}</span></div>}
            </div>
            {reassignmentForSn('opsSn', ops.opsSn)}
            <div onClick={(e) => e.stopPropagation()}>
              {historyButton('opsSn', ops.opsSn, `OPS ${ops.opsNr || ops.opsSn}`)}
            </div>
          </div>
        )) : installation?.opsNr ? (
          <div className="bg-status-warning/10/60 border border-status-warning/20/40 rounded-lg p-3 min-h-[80px]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Cpu size={12} className="text-status-warning" />
                <span className="text-xs font-medium text-status-warning uppercase">OPS Player</span>
              </div>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-status-warning/10 text-amber-700 border border-status-warning/20">aus Protokoll</span>
            </div>
            <div className="space-y-1">
              <div className="text-xs"><span className="text-status-warning">Nr: </span><span className="font-mono text-amber-800">{installation.opsNr}</span></div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-secondary/40 border border-dashed border-border-secondary rounded-lg p-3 flex flex-col items-center justify-center text-center min-h-[80px]">
            <Cpu size={16} className="text-text-muted mb-1" />
            <span className="text-xs text-text-muted">OPS Player</span>
            <span className="text-[10px] text-text-muted">nicht zugewiesen</span>
          </div>
        )}

        {/* ── SIM-Karte ── */}
        {hardware.sims.length > 0 ? hardware.sims.map((sim, i) => (
          <div
            key={sim.id || i}
            className="bg-surface-secondary/60 border border-border-secondary/40 rounded-lg p-3 cursor-pointer hover:ring-2 hover:ring-green-200 transition-all"
            onClick={() => onSelectComponent?.({ type: 'sim', id: sim.id })}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <CardSim size={12} className="text-status-online" />
                <span className="text-xs font-medium text-text-muted uppercase">SIM-Karte</span>
              </div>
              <div className="flex items-center gap-1.5">
                {sim._source === 'nocodb' && (
                  <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] text-accent bg-accent-light border border-accent/20/50">NocoDB</span>
                )}
                {statusBadge(sim.status)}
              </div>
            </div>
            <div className="space-y-1">
              {sim.simId && (
                <div className="text-xs">
                  <span className="text-text-muted">ICCID: </span>
                  {sim.simIdImprecise ? (
                    <span className="text-status-warning text-xs" title="ICCID ungenau – Airtable speichert als Zahl (Präzisionsverlust)">⚠ ungenau</span>
                  ) : (
                    <span className="font-mono text-text-primary text-[11px]">{sim.simId}</span>
                  )}
                </div>
              )}
              {sim.activateDate && <div className="text-xs"><span className="text-text-muted">Aktiv seit: </span><span className="font-mono text-text-primary">{new Date(sim.activateDate).toLocaleDateString('de-DE')}</span></div>}
              {sim.kundenId && <div className="text-xs"><span className="text-text-muted">Kunden-Nr: </span><span className="font-mono text-text-primary">{sim.kundenId}</span></div>}
            </div>
            {sim.simId && !sim.simIdImprecise && reassignmentForSn('simId', sim.simId)}
            <div onClick={(e) => e.stopPropagation()}>
              {sim.simId && !sim.simIdImprecise && historyButton('simId', sim.simId, `SIM ${sim.simId.substring(0, 10)}...`)}
            </div>
          </div>
        )) : installation?.simId ? (
          <div className="bg-status-warning/10/60 border border-status-warning/20/40 rounded-lg p-3 min-h-[80px]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <CardSim size={12} className="text-status-warning" />
                <span className="text-xs font-medium text-status-warning uppercase">SIM-Karte</span>
              </div>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-status-warning/10 text-amber-700 border border-status-warning/20">aus Protokoll</span>
            </div>
            <div className="space-y-1">
              <div className="text-xs"><span className="text-status-warning">ICCID: </span><span className="font-mono text-amber-800 text-[11px]">{installation.simId}</span></div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-secondary/40 border border-dashed border-border-secondary rounded-lg p-3 flex flex-col items-center justify-center text-center min-h-[80px]">
            <CardSim size={16} className="text-text-muted mb-1" />
            <span className="text-xs text-text-muted">SIM-Karte</span>
            <span className="text-[10px] text-text-muted">nicht zugewiesen</span>
          </div>
        )}

        {/* ── Mount / Halterung ── */}
        {(() => {
          const mountType = installation?.installationType || '';
          const screenInfo = installation ? `${installation.screenSize || ''}${installation.screenSize ? '″' : ''} ${installation.screenType || ''}`.trim() : '';
          const integrator = installation?.integrator || '';
          const installDate = installation?.installDate;
          const hasMountData = mountType || screenInfo || integrator || installDate;

          if (hasMountData) {
            return (
              <div className="bg-surface-secondary/60 border border-border-secondary/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Grip size={12} className="text-status-warning" />
                    <span className="text-xs font-medium text-text-muted uppercase">Halterung</span>
                  </div>
                  {mountType && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: '#FF950015', color: '#FF9500', border: '1px solid #FF950033' }}>
                      {mountType}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {screenInfo && <div className="text-xs"><span className="text-text-muted">Screen: </span><span className="text-text-primary">{screenInfo}</span></div>}
                  {integrator && <div className="text-xs"><span className="text-text-muted">Integrator: </span><span className="text-text-primary">{integrator}</span></div>}
                  {installDate && <div className="text-xs"><span className="text-text-muted">Aufbau: </span><span className="font-mono text-text-primary">{new Date(installDate).toLocaleDateString('de-DE')}</span></div>}
                </div>
              </div>
            );
          }
          return (
            <div className="bg-surface-secondary/40 border border-dashed border-border-secondary rounded-lg p-3 flex flex-col items-center justify-center text-center min-h-[80px]">
              <Grip size={16} className="text-text-muted mb-1" />
              <span className="text-xs text-text-muted">Halterung</span>
              <span className="text-[10px] text-text-muted">keine Daten</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Hardware Movement History Modal ──────────────────────────────────────────

function HardwareHistoryModal({ isOpen, onClose, snType, snValue, label }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !snValue) return;
    setLoading(true);
    fetchHardwareMovementHistory(snType, snValue).then((data) => {
      setTimeline(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, snType, snValue]);

  if (!isOpen) return null;

  const fmtDate = (d) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
  };

  const typeIcon = (type) => {
    switch (type) {
      case 'assignment': return <MapPinned size={11} className="text-accent" />;
      case 'installed': return <ArrowRight size={11} className="text-status-online" />;
      case 'removed': return <ArrowRight size={11} className="text-status-offline rotate-180" />;
      default: return <Circle size={11} className="text-text-muted" />;
    }
  };

  const typeBg = (type) => {
    switch (type) {
      case 'assignment': return 'border-l-blue-400';
      case 'installed': return 'border-l-green-400';
      case 'removed': return 'border-l-red-400';
      default: return 'border-l-slate-300';
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface-primary rounded-2xl shadow-xl border border-border-secondary w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <History size={14} className="text-[#007AFF]" />
              Hardware-Historie
            </h3>
            <p className="text-xs text-text-muted mt-0.5">{label}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Loader2 size={14} className="text-[#007AFF] animate-spin" />
              <span className="text-xs text-text-muted">Lade Historie...</span>
            </div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-8">
              <History size={20} className="text-text-muted mx-auto mb-2" />
              <p className="text-xs text-text-muted">Keine Bewegungshistorie gefunden</p>
            </div>
          ) : (
            <div className="space-y-0">
              {timeline.map((entry, i) => (
                <div key={i} className={`flex gap-3 pb-3 ${i < timeline.length - 1 ? 'border-l-2 ml-[5px] pl-4 ' + typeBg(entry.type) : 'ml-[5px] pl-4'}`}>
                  <div className="flex-shrink-0 -ml-[21px] mt-0.5 bg-surface-primary p-0.5 rounded-full">
                    {typeIcon(entry.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-text-primary truncate">
                        {entry.locationName}
                      </span>
                      {entry.city && (
                        <span className="text-xs text-text-muted">{entry.city}</span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {entry.detail}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {entry.date && (
                        <span className="text-xs text-text-muted">
                          {fmtDate(entry.date)}
                        </span>
                      )}
                      {entry.liveSince && !entry.date && (
                        <span className="text-xs text-text-muted">
                          Live seit {fmtDate(entry.liveSince)}
                        </span>
                      )}
                      {entry.status && (
                        <span className="text-xs text-text-muted bg-surface-secondary px-1 py-0.5 rounded">
                          {entry.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Leasing Panel ───────────────────────────────────────────────────────────

function LeasingPanel({ leaseData, loading, canViewFinancial }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#007AFF] animate-spin" />
        <span className="text-xs text-text-muted">Lade Leasing-Daten...</span>
      </div>
    );
  }

  if (!leaseData || (!leaseData.chg && !leaseData.bank)) return null;

  const bank = leaseData.bank;
  const chg = leaseData.chg;

  const fmtDate = (d) => {
    if (!d) return '–';
    try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
  };

  // Calculate lease progress
  let progress = null;
  const startRaw = bank?.rentalStart || chg?.rentalStart;
  const endRaw = bank?.rentalEndPlanned || chg?.rentalEnd;
  // Safely parse dates (could be strings, arrays, or invalid)
  const start = startRaw ? new Date(Array.isArray(startRaw) ? startRaw[0] : startRaw) : null;
  const end = endRaw ? new Date(Array.isArray(endRaw) ? endRaw[0] : endRaw) : null;
  const startValid = start && !isNaN(start.getTime());
  const endValid = end && !isNaN(end.getTime());
  if (startValid && endValid) {
    const total = end.getTime() - start.getTime();
    if (total > 0) {
      progress = Math.min(100, Math.max(0, Math.round(((Date.now() - start.getTime()) / total) * 100)));
    }
  }

  // Calculate months
  let totalMonths = null;
  if (startValid && endValid) {
    totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Landmark size={14} className="text-[#007AFF]" />
        <h3 className="text-xs font-medium text-text-secondary">
          Leasing
        </h3>
        {bank?.contractStatus && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: '#34C75915', color: '#34C759', border: '1px solid #34C75933' }}>
            {bank.contractStatus}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
        <div>
          {(bank?.lessor || chg?.status) && (
            <InfoRow icon={Building2} label="Leasinggeber" value={bank?.lessor || '–'} />
          )}
          {(bank?.rentalCertificate) && (
            <InfoRow icon={FileText} label="Mietschein" value={bank.rentalCertificate} mono />
          )}
          {(bank?.assetId || chg?.assetId) && (
            <InfoRow icon={Hash} label="Asset-ID" value={bank?.assetId || chg?.assetId} mono />
          )}
          {bank?.designation && (
            <InfoRow icon={Monitor} label="Produkt" value={bank.designation} />
          )}
        </div>
        <div>
          {startValid && (
            <InfoRow icon={Calendar} label="Laufzeit" value={`${fmtDate(startRaw)} → ${endValid ? fmtDate(endRaw) : '–'}${totalMonths ? ` (${totalMonths} Mon.)` : ''}`} mono />
          )}
          {canViewFinancial && bank?.monthlyPrice != null && (
            <InfoRow icon={TrendingUp} label="Monatspreis" value={`${bank.monthlyPrice.toFixed(2).replace('.', ',')}€`} mono />
          )}
          {canViewFinancial && chg?.paymentReleasedOn && (
            <InfoRow icon={CheckCircle2} label="Zahlung freigeg." value={`${fmtDate(chg.paymentReleasedOn)}${chg.paymentReleasedBy ? ` von ${chg.paymentReleasedBy}` : ''}`} />
          )}
          {chg?.chgCertificate && (
            <InfoRow icon={FileText} label="CHG Zertifikat" value={chg.chgCertificate} mono />
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted">Laufzeit-Fortschritt</span>
            <span className="text-xs text-text-muted font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-surface-secondary rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${progress}%`,
                backgroundColor: progress > 80 ? '#FF9500' : '#007AFF',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Swap History Panel ──────────────────────────────────────────────────────

function SwapHistoryPanel({ swaps, deinstalls, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#007AFF] animate-spin" />
        <span className="text-xs text-text-muted">Lade Hardware-Historie...</span>
      </div>
    );
  }

  const hasSwaps = swaps && swaps.length > 0;
  const hasDeinstalls = deinstalls && deinstalls.length > 0;
  if (!hasSwaps && !hasDeinstalls) return null;

  const fmtDate = (d) => {
    if (!d) return '–';
    try { return new Date(d).toLocaleDateString('de-DE'); } catch { return d; }
  };

  const statusColors = {
    'Geplant': { bg: '#007AFF15', text: '#007AFF', border: '#007AFF33' },
    'In Bearbeitung': { bg: '#FF950015', text: '#FF9500', border: '#FF950033' },
    'Abgeschlossen': { bg: '#34C75915', text: '#34C759', border: '#34C75933' },
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ArrowLeftRight size={14} className="text-[#007AFF]" />
        <h3 className="text-xs font-medium text-text-secondary">
          Hardware-Historie
        </h3>
      </div>

      {/* Swaps */}
      {hasSwaps && (
        <div className="mb-3">
          <div className="text-xs font-medium text-text-muted uppercase mb-2">Tausch-Aufträge</div>
          <div className="space-y-2">
            {swaps.map((swap) => {
              const sc = statusColors[swap.status] || statusColors['Geplant'];
              return (
                <div key={swap.id} className="bg-surface-secondary/60 border border-border-secondary/40 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-text-primary">{swap.swapId || swap.id?.substring(0, 8)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">{fmtDate(swap.swapDate)}</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                        {swap.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {swap.swapType?.join(', ')}{swap.swapReason ? ` — ${swap.swapReason}` : ''}
                  </div>
                  {swap.defectDescription && (
                    <div className="text-xs text-text-muted mt-1">{swap.defectDescription}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deinstalls */}
      {hasDeinstalls && (
        <div>
          <div className="text-xs font-medium text-text-muted uppercase mb-2">Deinstallationen</div>
          <div className="space-y-2">
            {deinstalls.map((d) => {
              const sc = statusColors[d.status] || statusColors['Geplant'];
              return (
                <div key={d.id} className="bg-surface-secondary/60 border border-border-secondary/40 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-text-primary">{d.deinstallId || d.id?.substring(0, 8)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">{fmtDate(d.deinstallDate)}</span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                        {d.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {d.reason}{d.hardwareCondition ? ` — Zustand: ${d.hardwareCondition}` : ''}
                  </div>
                  {d.conditionDescription && (
                    <div className="text-xs text-text-muted mt-1">{d.conditionDescription}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Communications Panel ────────────────────────────────────────────────────

function CommunicationsPanel({ communications, loading }) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#007AFF] animate-spin" />
        <span className="text-xs text-text-muted">Lade Kommunikation...</span>
      </div>
    );
  }

  if (!communications || communications.length === 0) return null;

  const formatTs = (ts) => {
    if (!ts) return '–';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  const channelIcon = (ch) => {
    if (ch === 'WhatsApp' || ch === 'whatsapp') return '💬';
    if (ch === 'Email' || ch === 'email') return '📧';
    if (ch === 'SMS' || ch === 'sms') return '📱';
    if (ch === 'Phone' || ch === 'phone') return '📞';
    return '💬';
  };

  const sorted = [...communications].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  const shown = expanded ? sorted : sorted.slice(0, 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-[#007AFF]" />
          <h3 className="text-xs font-medium text-text-secondary">
            Kommunikation
          </h3>
          <span className="text-xs text-text-muted bg-surface-secondary/80 px-1.5 py-0.5 rounded">
            {communications.length}
          </span>
        </div>
        {sorted.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-[#007AFF] hover:text-[#2563eb] font-medium"
          >
            {expanded ? 'Weniger' : `Alle ${sorted.length} anzeigen`}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {shown.map((comm) => (
          <div key={comm.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-secondary/60 border border-border-secondary/40">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-primary border border-border-secondary/40 shrink-0 text-sm">
              {channelIcon(comm.channel)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary truncate">
                    {comm.recipientName || comm.sender || 'Unbekannt'}
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                    comm.direction === 'Outbound' ? 'bg-accent-light text-accent' : 'bg-status-online/10 text-status-online'
                  }`}>
                    {comm.direction === 'Outbound' ? '→ Ausgehend' : '← Eingehend'}
                  </span>
                </div>
                <span className="text-xs text-text-muted shrink-0">
                  {formatTs(comm.timestamp)}
                </span>
              </div>
              {comm.subject && (
                <p className="text-xs text-text-secondary truncate mt-0.5">{comm.subject}</p>
              )}
              {comm.message && (
                <p className="text-xs text-text-muted truncate mt-0.5">{comm.message}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vistar Programmatic Performance Panel ────────────────────────────────────

function VistarPanel({ data, loading }) {
  const canViewRevenue = hasPermission('view_revenue');
  const hasData = data && data.length > 0;

  const formatNum = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(Math.round(n));
  };

  // Aggregate totals (or zeros)
  const totals = hasData
    ? data.reduce(
        (acc, row) => {
          acc.impressions += Number(row.impressions) || 0;
          acc.spots += Number(row.spots) || 0;
          acc.revenue += Number(row.partner_revenue) || 0;
          acc.profit += Number(row.partner_profit) || 0;
          return acc;
        },
        { impressions: 0, spots: 0, revenue: 0, profit: 0 }
      )
    : { impressions: 0, spots: 0, revenue: 0, profit: 0 };

  const activeDays = hasData
    ? new Set(data.filter((r) => (Number(r.spots) || 0) > 0).map((r) => r.date)).size
    : 0;
  const avgECPM = totals.impressions > 0
    ? Math.round((totals.revenue / totals.impressions) * 1000 * 100) / 100
    : 0;

  // Daily chart data
  const dailyMap = new Map();
  if (hasData) {
    data.forEach((row) => {
      const date = row.date || '';
      if (!date) return;
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { impressions: 0, spots: 0, revenue: 0 });
      }
      const d = dailyMap.get(date);
      d.impressions += Number(row.impressions) || 0;
      d.spots += Number(row.spots) || 0;
      d.revenue += Number(row.partner_revenue) || 0;
    });
  }

  const dailyChart = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      label: date.slice(5).replace('-', '.'),
      ...vals,
    }));

  const avgSpotsPerDay = activeDays > 0 ? Math.round(totals.spots / activeDays) : 0;
  const totalDays = dailyChart.length || 30;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <TrendingUp size={14} className="text-[#AF52DE]" />
        <h3 className="text-xs font-medium text-text-secondary">
          Programmatic Performance
        </h3>
        <span className="text-xs text-[#AF52DE] bg-[#AF52DE]/10 px-2 py-0.5 rounded-full border border-[#AF52DE]/25">
          Vistar SSP · 30 Tage
        </span>
        {!hasData && !loading && (
          <span className="text-xs text-text-muted bg-surface-secondary px-2 py-0.5 rounded-full">
            API nicht verbunden
          </span>
        )}
        {loading && (
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <Loader2 size={10} className="animate-spin" /> Lade...
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center">
          <div className={`text-lg font-bold ${hasData ? 'text-[#AF52DE]' : 'text-text-muted'}`}>
            {hasData ? formatNum(totals.impressions) : '–'}
          </div>
          <div className="text-xs text-text-muted mt-0.5">Impressions</div>
        </div>
        <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center">
          <div className={`text-lg font-bold ${hasData ? 'text-text-primary' : 'text-text-muted'}`}>
            {hasData ? formatNum(totals.spots) : '–'}
          </div>
          <div className="text-xs text-text-muted mt-0.5">Ad Plays</div>
        </div>
        {canViewRevenue ? (
          <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center">
            <div className={`text-lg font-bold ${hasData ? 'text-emerald-600' : 'text-text-muted'}`}>
              {hasData ? `${totals.revenue.toFixed(2)}€` : '–'}
            </div>
            <div className="text-xs text-text-muted mt-0.5">Revenue</div>
          </div>
        ) : (
          <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center flex items-center justify-center">
            <div className="flex items-center gap-1 text-text-muted">
              <Lock size={12} />
              <span className="text-xs">Revenue</span>
            </div>
          </div>
        )}
        {canViewRevenue ? (
          <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center">
            <div className={`text-lg font-bold ${hasData ? 'text-text-secondary' : 'text-text-muted'}`}>
              {hasData ? `${avgECPM.toFixed(2)}€` : '–'}
            </div>
            <div className="text-xs text-text-muted mt-0.5">Ø eCPM</div>
          </div>
        ) : (
          <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center flex items-center justify-center">
            <div className="flex items-center gap-1 text-text-muted">
              <Lock size={12} />
              <span className="text-xs">eCPM</span>
            </div>
          </div>
        )}
        <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center">
          <div className={`text-lg font-bold ${hasData ? 'text-text-secondary' : 'text-text-muted'}`}>
            {hasData ? <>{activeDays}<span className="text-xs text-text-muted">/{totalDays}</span></> : '–'}
          </div>
          <div className="text-xs text-text-muted mt-0.5">Active Days</div>
        </div>
      </div>

      {/* Daily bar chart or placeholder */}
      <div>
        <div className="text-xs text-text-muted mb-1.5">
          {hasData ? `Spots pro Tag (Ø ${avgSpotsPerDay}/Tag)` : 'Spots pro Tag'}
        </div>
        <div className="flex items-end gap-[2px] h-[60px]">
          {hasData && dailyChart.length > 0 ? (
            dailyChart.map((day) => {
              const maxSpots = Math.max(...dailyChart.map((d) => d.spots), 1);
              const h = Math.max(2, (day.spots / maxSpots) * 56);
              return (
                <div
                  key={day.date}
                  className="flex-1 rounded-t-sm transition-all hover:opacity-80"
                  style={{
                    height: `${h}px`,
                    backgroundColor: day.spots > 0 ? '#AF52DE' : '#e2e8f0',
                    opacity: day.spots > 0 ? 0.7 : 0.3,
                  }}
                  title={`${day.label}: ${day.spots} Spots, ${formatNum(day.impressions)} Impr.${canViewRevenue ? `, ${day.revenue.toFixed(2)}€` : ''}`}
                />
              );
            })
          ) : (
            // Placeholder bars (empty state)
            Array.from({ length: 30 }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${4 + Math.random() * 20}px`,
                  backgroundColor: '#e2e8f0',
                  opacity: 0.3,
                }}
              />
            ))
          )}
        </div>
        {dailyChart.length > 0 ? (
          <div className="flex justify-between mt-1 text-xs text-text-muted">
            <span>{dailyChart[0]?.label}</span>
            <span>{dailyChart[dailyChart.length - 1]?.label}</span>
          </div>
        ) : (
          <div className="text-center mt-2 text-xs text-text-muted">
            Vistar API-Credentials in Netlify hinterlegen um Live-Daten zu sehen
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Detail component ────────────────────────────────────────────────────

/* ── Error Boundary for DisplayDetail ── */
class DisplayDetailErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[DisplayDetail] Render crash:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-surface-primary rounded-2xl shadow-xl p-8 max-w-md text-center">
            <AlertTriangle size={32} className="text-status-offline mx-auto mb-3" />
            <h3 className="text-lg font-bold text-text-primary mb-2">Display-Detail Fehler</h3>
            <p className="text-xs text-text-muted mb-3">Ein Fehler ist beim Rendern aufgetreten:</p>
            <pre className="text-xs bg-status-offline/10 text-red-700 p-3 rounded-lg text-left overflow-auto max-h-32 mb-4">
              {this.state.error?.message || 'Unbekannter Fehler'}
            </pre>
            <button
              onClick={this.props.onClose}
              className="px-4 py-2 bg-surface-primary text-white rounded-lg text-sm font-medium hover:bg-surface-tertiary"
            >
              Schließen
            </button>
          </div>
        </div>
      );
    }
    return <DisplayDetailInner {...this.props} />;
  }
}

export default function DisplayDetail(props) {
  return <DisplayDetailErrorBoundary {...props} />;
}

function DisplayDetailInner({ display, onClose }) {
  const timeline = useMemo(
    () => computeDisplayTimeline(display),
    [display]
  );

  // Airtable data
  const [stammdaten, setStammdaten] = useState(null);
  const [stammdatenLoading, setStammdatenLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [installation, setInstallation] = useState(null);
  const [installationLoading, setInstallationLoading] = useState(true);
  const [communications, setCommunications] = useState([]);
  const [communicationsLoading, setCommunicationsLoading] = useState(true);

  // Airtable display record (from airtable_displays table)
  const [airtableDisplay, setAirtableDisplay] = useState(null);

  // Vistar programmatic data
  const [vistarData, setVistarData] = useState(null);
  const [vistarLoading, setVistarLoading] = useState(true);

  // Hardware inventory
  const [hardwareSet, setHardwareSet] = useState(null);
  const [hardwareLoading, setHardwareLoading] = useState(true);
  const [leaseData, setLeaseData] = useState(null);
  const [leaseLoading, setLeaseLoading] = useState(true);
  const [swapHistory, setSwapHistory] = useState([]);
  const [deinstallHistory, setDeinstallHistory] = useState([]);
  const [hwHistoryLoading, setHwHistoryLoading] = useState(true);

  // Hardware reassignment tracking
  const [hardwareReassignment, setHardwareReassignment] = useState(null);
  const [reassignmentLoading, setReassignmentLoading] = useState(false);

  // Hardware movement history modal
  const [hwHistoryModal, setHwHistoryModal] = useState({ open: false, snType: null, snValue: null, label: '' });

  // Hardware modals
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showDeinstallModal, setShowDeinstallModal] = useState(false);

  // Hardware component detail modal
  const [selectedHwComponent, setSelectedHwComponent] = useState(null);

  // Stimmcheck modal
  const [showStimmcheck, setShowStimmcheck] = useState(false);
  const [stimmcheckSuccess, setStimmcheckSuccess] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const displayId = display.displayId;

    setStammdatenLoading(true);
    setTasksLoading(true);
    setInstallationLoading(true);
    setCommunicationsLoading(true);

    fetchStammdatenByDisplayId(displayId).then((data) => {
      if (!cancelled) {
        setStammdaten(data);
        setStammdatenLoading(false);
      }
    });

    // Fetch enriched display data from airtable_displays, then load hardware
    setHardwareLoading(true);
    setLeaseLoading(true);
    setHwHistoryLoading(true);
    fetchAirtableDisplayByDisplayId(displayId).then((data) => {
      if (cancelled) return;
      setAirtableDisplay(data);

      // Use airtable record ID as Live Display Location ID for hardware queries
      const locationRecordId = data?.airtable_id || data?.id;
      if (locationRecordId) {
        // Load hardware set (OPS + SIM + Display), then check reassignment
        fetchHardwareByLocationId(locationRecordId).then((hw) => {
          if (!cancelled) {
            setHardwareSet(hw);
            setHardwareLoading(false);

            // For deinstalled displays: check where hardware is now
            const isDeinstalled = /deinstall/i.test(data?.online_status || '');
            if (isDeinstalled && hw && hw.ops.length > 0) {
              setReassignmentLoading(true);
              const ops0 = hw.ops[0];
              const serials = {
                opsSn: ops0.opsSn || undefined,
                displaySn: ops0.displaySn || (hw.displays[0]?.displaySerialNumber) || undefined,
                simId: ops0.simId || (hw.sims[0]?.simId) || undefined,
              };
              findHardwareReassignment(serials, locationRecordId).then((r) => {
                if (!cancelled) { setHardwareReassignment(r); setReassignmentLoading(false); }
              }).catch(() => {
                if (!cancelled) setReassignmentLoading(false);
              });
            }
          }
        }).catch(() => {
          if (!cancelled) { setHardwareLoading(false); }
        });

        // Load leasing data via jet_id (parallel, not dependent on hardware)
        const jetId = data?.jet_id;
        if (jetId) {
          fetchLeaseByJetId(jetId).then((lease) => {
            if (!cancelled) { setLeaseData(lease); setLeaseLoading(false); }
          }).catch(() => { if (!cancelled) setLeaseLoading(false); });
        } else {
          if (!cancelled) setLeaseLoading(false);
        }

        // Load swap + deinstall history
        Promise.all([
          fetchSwapsByLocationId(locationRecordId),
          fetchDeinstallsByLocationId(locationRecordId),
        ]).then(([swaps, deinstalls]) => {
          if (!cancelled) {
            setSwapHistory(swaps);
            setDeinstallHistory(deinstalls);
            setHwHistoryLoading(false);
          }
        }).catch(() => {
          if (!cancelled) setHwHistoryLoading(false);
        });
      } else {
        if (!cancelled) {
          setHardwareLoading(false);
          setLeaseLoading(false);
          setHwHistoryLoading(false);
        }
      }
    });

    fetchTasksByDisplayId(displayId).then((data) => {
      if (!cancelled) {
        setTasks(data);
        setTasksLoading(false);
      }
    });

    fetchInstallationByDisplayId(displayId).then((data) => {
      if (!cancelled) {
        setInstallation(data);
        setInstallationLoading(false);
      }
    });

    // Fetch Vistar programmatic data (last 30 days)
    setVistarLoading(true);
    const venueId = display.serialNumber;
    if (venueId) {
      const endDate = new Date().toISOString().slice(0, 10);
      const startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - 30);
      const startDate = startDateObj.toISOString().slice(0, 10);
      fetchSingleVenueReport(venueId, startDate, endDate).then((data) => {
        if (!cancelled) {
          setVistarData(data);
          setVistarLoading(false);
        }
      }).catch(() => {
        if (!cancelled) setVistarLoading(false);
      });
    } else {
      setVistarLoading(false);
    }

    // Fetch communications and filter by display/location
    fetchAllCommunications().then((allComms) => {
      if (!cancelled) {
        const relevant = allComms.filter((c) => {
          // Match by displayId in the comm's displayIds
          if (c.displayIds?.some((d) => d.includes(displayId) || displayId.includes(d))) return true;
          // Match by location name
          if (display.locationName && c.locationNames?.some((n) =>
            n.toLowerCase().includes(display.locationName.toLowerCase()) ||
            display.locationName.toLowerCase().includes(n.toLowerCase())
          )) return true;
          return false;
        });
        setCommunications(relevant);
        setCommunicationsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setCommunicationsLoading(false);
    });

    return () => { cancelled = true; };
  }, [display.displayId, display.locationName]);

  // Fallback: If hardware loaded with no OPS but installation has opsNr, try via OPS number
  useEffect(() => {
    if (hardwareLoading || installationLoading) return;
    if (!installation?.opsNr) return;
    if (hardwareSet && hardwareSet.ops.length > 0) return;

    let cancelled = false;
    setHardwareLoading(true);
    fetchHardwareByOpsNr(installation.opsNr).then((hwFallback) => {
      if (cancelled) return;
      if (hwFallback && hwFallback.ops.length > 0) {
        setHardwareSet((prev) => ({
          ops: hwFallback.ops,
          sims: hwFallback.sims.length > 0 ? hwFallback.sims : (prev?.sims || []),
          displays: hwFallback.displays.length > 0 ? hwFallback.displays : (prev?.displays || []),
          _fallbackSource: 'installation_ops_nr',
        }));
      }
      setHardwareLoading(false);
    }).catch(() => {
      if (!cancelled) setHardwareLoading(false);
    });
    return () => { cancelled = true; };
  }, [hardwareLoading, installationLoading, installation?.opsNr, hardwareSet?.ops?.length]);

  const statusColor = getStatusColor(display.status);
  const statusLabel = getStatusLabel(display.status);

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto">
      <div className="bg-surface-primary2xl border border-white/60 rounded-2xl shadow-2xl shadow-black/10 w-full max-w-4xl mb-12 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border-secondary">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: statusColor + '18',
                  color: statusColor,
                  border: `1px solid ${statusColor}33`,
                }}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    display.status === 'online' ? 'animate-pulse-glow' : ''
                  }`}
                  style={{ backgroundColor: statusColor }}
                />
                {statusLabel}
              </span>
              {display.offlineHours != null && display.offlineHours >= 24 && (
                <span className="text-xs" style={{ color: statusColor }}>
                  {formatDuration(display.offlineHours)} offline
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-text-primary">
                {display.displayId}
              </h2>
              {stammdaten?.['JET ID'] && (
                <span className="text-xs bg-[#007AFF]/15 text-[#007AFF] px-2.5 py-1 rounded-full border border-[#007AFF]/25 font-bold">
                  JET {stammdaten['JET ID']}
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-0.5">
              {stammdaten?.['Location Name'] || display.displayName || display.locationName || 'Unbekannter Standort'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-secondary/60 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top section: Info + Summary stats side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border-b border-border-secondary">
          {/* Info Grid */}
          <div className="lg:col-span-2 p-5 border-b lg:border-b-0 lg:border-r border-border-secondary">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <div>
                <InfoRow icon={Monitor} label="Display ID" value={display.displayId} mono />
                <InfoRow icon={MapPin} label="Standort" value={display.displayName || display.locationName} />
                <InfoRow icon={MapPin} label="Stadt" value={`${display.city} (${display.cityCode})`} />
                {display.geoAddress && (
                  <InfoRow icon={MapPin} label="Adresse" value={display.geoAddress} />
                )}
                {display.geoCityLine && !display.geoAddress && (
                  <InfoRow icon={MapPin} label="Ort" value={display.geoCityLine} />
                )}
                {display.geoLat && display.geoLng && (
                  <div className="flex items-center gap-3 py-1.5">
                    <MapPin size={14} className="text-text-muted flex-shrink-0" />
                    <span className="text-text-muted text-xs w-32 flex-shrink-0">Koordinaten</span>
                    <a
                      href={`https://www.google.com/maps?q=${display.geoLat},${display.geoLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent"
                    >
                      <ExternalLink size={10} />
                      {display.geoLat.toFixed(4)}, {display.geoLng.toFixed(4)}
                    </a>
                  </div>
                )}
                <InfoRow icon={Hash} label="Navori Venue ID" value={display.serialNumber} mono />
                {display.daynScreenId && (
                  <InfoRow icon={Hash} label="Dayn Screen ID" value={display.daynScreenId} mono />
                )}
              </div>
              <div>
                <InfoRow icon={Calendar} label="Installiert" value={formatDate(display.firstSeen)} mono />
                <InfoRow icon={Calendar} label="Letzter Check" value={formatDateTime(display.lastSeen)} mono />
                <InfoRow icon={Clock} label="Letzter Heartbeat" value={formatDateTime(display.heartbeat)} mono />
                <InfoRow icon={TrendingUp} label="Uptime-Rate" value={`${timeline.uptimeRate}%`} mono />
                {display.installYear && (
                  <InfoRow icon={Calendar} label="Install-Jahr" value={display.installYear} />
                )}
              </div>
            </div>
            {/* ── Screen-Daten & Impressions ── */}
            {(display.venueType || display.floorCpm != null || display.dvacDay != null || display.screenWidthPx) && (
              <div className="mt-3 pt-3 border-t border-border-secondary">
                <div className="text-xs font-medium text-text-muted mb-2">Screen-Daten</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-0">
                  {display.venueType && (
                    <InfoRow icon={Monitor} label="Venue Type" value={display.venueType} />
                  )}
                  {display.region && (
                    <InfoRow icon={MapPin} label="Region" value={display.region} />
                  )}
                  {display.floorCpm != null && (
                    <InfoRow icon={DollarSign} label="Floor CPM" value={`€${display.floorCpm.toFixed(2)}`} mono />
                  )}
                  {display.screenType && (
                    <InfoRow icon={Monitor} label="Screen-Typ" value={display.screenType} />
                  )}
                  {display.screenInch && (
                    <InfoRow icon={Monitor} label="Bildschirm" value={`${display.screenInch}"`} />
                  )}
                  {display.screenWidthPx && display.screenHeightPx && (
                    <InfoRow icon={Monitor} label="Auflösung" value={`${display.screenWidthPx} × ${display.screenHeightPx} px`} mono />
                  )}
                  {display.videoSupported != null && (
                    <InfoRow icon={Monitor} label="Video" value={display.videoSupported ? '✓ Ja' : '✗ Nein'} />
                  )}
                  {display.staticSupported != null && (
                    <InfoRow icon={Monitor} label="Statisch" value={display.staticSupported ? '✓ Ja' : '✗ Nein'} />
                  )}
                  {display.maxVideoLength != null && (
                    <InfoRow icon={Clock} label="Video max." value={`${display.maxVideoLength}s`} mono />
                  )}
                  {display.minVideoLength != null && (
                    <InfoRow icon={Clock} label="Video min." value={`${display.minVideoLength}s`} mono />
                  )}
                  {display.staticDuration != null && (
                    <InfoRow icon={Clock} label="Statisch-Dauer" value={`${display.staticDuration}s`} mono />
                  )}
                </div>
                {/* dVAC & Impressions */}
                {(display.dvacDay != null || display.dvacWeek != null || display.dvacMonth != null) && (
                  <div className="mt-2 pt-2 border-t border-border-secondary">
                    <div className="text-xs font-medium text-text-muted mb-2">dVAC & Impressions (dVAC × 6)</div>
                    <div className="grid grid-cols-3 gap-3">
                      {display.dvacDay != null && (
                        <div className="bg-accent-light/60 rounded-lg p-2.5 text-center">
                          <div className="text-sm font-bold text-blue-700">{display.impressionsDay?.toLocaleString('de-DE') || '–'}</div>
                          <div className="text-xs text-text-muted mt-0.5">Imp./Tag</div>
                          <div className="text-xs text-text-muted">dVAC: {display.dvacDay.toLocaleString('de-DE')}</div>
                        </div>
                      )}
                      {display.dvacWeek != null && (
                        <div className="bg-accent-light/60 rounded-lg p-2.5 text-center">
                          <div className="text-sm font-bold text-blue-700">{display.impressionsWeek?.toLocaleString('de-DE') || '–'}</div>
                          <div className="text-xs text-text-muted mt-0.5">Imp./Woche</div>
                          <div className="text-xs text-text-muted">dVAC: {display.dvacWeek.toLocaleString('de-DE')}</div>
                        </div>
                      )}
                      {display.dvacMonth != null && (
                        <div className="bg-accent-light/60 rounded-lg p-2.5 text-center">
                          <div className="text-sm font-bold text-blue-700">{display.impressionsMonth?.toLocaleString('de-DE') || '–'}</div>
                          <div className="text-xs text-text-muted mt-0.5">Imp./Monat</div>
                          <div className="text-xs text-text-muted">dVAC: {display.dvacMonth.toLocaleString('de-DE')}</div>
                        </div>
                      )}
                    </div>
                    {display.impressionsPerSpot != null && (
                      <div className="mt-1.5 text-xs text-text-muted text-center">
                        Impressions/Spot: <span className="font-mono font-medium text-text-secondary">{display.impressionsPerSpot.toLocaleString('de-DE')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary stats */}
          <div className="p-5 flex flex-col justify-center gap-3">
            <div className="bg-surface-secondary/80 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold" style={{ color: statusRateColor(timeline.uptimeRate) }}>
                {timeline.uptimeRate}%
              </div>
              <div className="text-xs text-text-muted mt-1">Uptime-Rate</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center">
                <div className="text-lg font-bold text-text-secondary">
                  {timeline.episodes.length}
                </div>
                <div className="text-xs text-text-muted mt-0.5">Offline-Episoden</div>
              </div>
              <div className="bg-surface-secondary/80 rounded-lg p-2.5 text-center">
                <div className="text-lg font-bold text-[#FF3B30]">
                  {timeline.longestEpisode
                    ? formatDuration(timeline.longestEpisode.durationHours)
                    : '–'}
                </div>
                <div className="text-xs text-text-muted mt-0.5">Längster Ausfall</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stimmcheck success toast */}
        {stimmcheckSuccess && (
          <div className="mx-5 mt-3 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200/60 rounded-xl animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <span className="text-xs font-medium text-emerald-700">
              Stimmcheck geplant: {stimmcheckSuccess.locationName} am{' '}
              {new Date(stimmcheckSuccess.scheduledDate).toLocaleDateString('de-DE')} um {stimmcheckSuccess.scheduledTime} Uhr
            </span>
            <button
              onClick={() => setStimmcheckSuccess(null)}
              className="ml-auto text-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Airtable: Contact Info */}
        {(stammdatenLoading || stammdaten) && (
          <div className="p-5 border-b border-border-secondary">
            <ContactInfoPanel stammdaten={stammdaten} loading={stammdatenLoading} airtableDisplay={airtableDisplay} onStimmcheck={() => setShowStimmcheck(true)} />
          </div>
        )}

        {/* Airtable: Installation */}
        {(installationLoading || installation) && (
          <div className="p-5 border-b border-border-secondary">
            <InstallationPanel installation={installation} loading={installationLoading} />
          </div>
        )}

        {/* Hardware Set (OPS + SIM + Display) */}
        {(hardwareLoading || hardwareSet || leaseData) && (
          <div className="p-5 border-b border-border-secondary">
            <HardwareSetPanel
              hardware={hardwareSet}
              loading={hardwareLoading}
              reassignment={hardwareReassignment}
              reassignmentLoading={reassignmentLoading}
              onShowHistory={(snType, snValue, label) => setHwHistoryModal({ open: true, snType, snValue, label })}
              leaseData={leaseData}
              installation={installation}
              airtableDisplay={airtableDisplay}
              onSelectComponent={(comp) => setSelectedHwComponent(comp)}
            />
          </div>
        )}

        {/* Leasing (CHG + Bank TESMA) — nur mit Berechtigung */}
        {hasPermission('view_leasing') && (leaseLoading || leaseData) && (
          <div className="p-5 border-b border-border-secondary">
            <LeasingPanel leaseData={leaseData} loading={leaseLoading} canViewFinancial={hasPermission('view_financial')} />
          </div>
        )}

        {/* Hardware-Historie (Tausch + Deinstall) + Action Buttons */}
        {(hwHistoryLoading || swapHistory.length > 0 || deinstallHistory.length > 0 || hardwareSet) && (
          <div className="p-5 border-b border-border-secondary">
            <SwapHistoryPanel swaps={swapHistory} deinstalls={deinstallHistory} loading={hwHistoryLoading} />
            {/* Hardware Action Buttons — nur mit Berechtigung */}
            {!hwHistoryLoading && airtableDisplay && (
              <div className="flex items-center gap-2 mt-3">
                {hasPermission('initiate_swap') && (
                  <button
                    onClick={() => setShowSwapModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-warning/10 hover:bg-status-warning/10 border border-status-warning/20 text-xs font-medium text-amber-700 transition-colors"
                  >
                    <ArrowLeftRight size={12} />
                    Tausch initiieren
                  </button>
                )}
                {hasPermission('initiate_deinstall') && (
                  <button
                    onClick={() => setShowDeinstallModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-offline/10 hover:bg-status-offline/10 border border-status-offline/20 text-xs font-medium text-status-offline transition-colors"
                  >
                    <Package size={12} />
                    Deinstallation
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Vistar: Programmatic Performance (always shown) */}
        <div className="p-5 border-b border-border-secondary">
          <VistarPanel data={vistarData} loading={vistarLoading} />
        </div>

        {/* Airtable: Tasks */}
        {(tasksLoading || tasks.length > 0) && (
          <div className="p-5 border-b border-border-secondary">
            <TasksPanel tasks={tasks} loading={tasksLoading} />
          </div>
        )}

        {/* Communications History */}
        {(communicationsLoading || communications.length > 0) && (
          <div className="p-5 border-b border-border-secondary">
            <CommunicationsPanel communications={communications} loading={communicationsLoading} />
          </div>
        )}

        {/* ★ Day-by-day detail chart — the main visual */}
        {timeline.segments.length > 0 && (
          <div className="p-5 border-b border-border-secondary">
            <DayDetailChart segments={timeline.segments} />
          </div>
        )}

        {/* Compact overview timeline */}
        <div className="px-5 pt-4 pb-2 border-b border-border-secondary">
          <h3 className="text-xs font-medium text-text-secondary mb-2">
            Gesamtverlauf (kompakt)
          </h3>
          <TimelineBar segments={timeline.segments} />
          <div className="flex justify-between mt-1.5 text-xs text-text-muted">
            <span>{formatDate(timeline.segments[0]?.timestamp)}</span>
            <span>
              {formatDate(timeline.segments[timeline.segments.length - 1]?.timestamp)}
            </span>
          </div>
        </div>

        {/* Weekday + Time-of-day analysis */}
        {timeline.segments.length > 0 && (
          <div className="p-5 border-b border-border-secondary">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <WeekdayChart segments={timeline.segments} />
              <HourChart segments={timeline.segments} />
            </div>
          </div>
        )}

        {/* Offline episodes */}
        {timeline.episodes.length > 0 && (
          <div className="p-5">
            <h3 className="text-xs font-medium text-text-secondary mb-3">
              Offline-Episoden
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {timeline.episodes
                .sort((a, b) => b.durationHours - a.durationHours)
                .map((ep, i) => {
                  const isLongest =
                    timeline.longestEpisode &&
                    ep.start.getTime() === timeline.longestEpisode.start.getTime();
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-3 py-2 rounded text-xs ${
                        isLongest
                          ? 'bg-status-offline/10/60 border border-red-900/40'
                          : 'bg-surface-secondary/80'
                      }`}
                    >
                      <div className="text-text-secondary">
                        {formatDateTime(ep.start)}
                        <span className="text-text-muted mx-2">&rarr;</span>
                        {formatDateTime(ep.end)}
                      </div>
                      <div
                        className="font-bold"
                        style={{ color: isLongest ? '#FF3B30' : '#64748b' }}
                      >
                        {formatDuration(ep.durationHours)}
                        {isLongest && (
                          <span className="text-xs ml-1.5 text-status-offline font-normal">
                            längster
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Data point count */}
        <div className="px-5 pb-4">
          <div className="text-xs text-text-muted">
            {display.totalSnapshots} Datenpunkte &bull; Erste Erfassung{' '}
            {formatDate(display.firstSeen)} &bull; Letzte Erfassung{' '}
            {formatDate(display.lastSeen)}
          </div>
        </div>
      </div>

      {/* ═══════ MODALS ═══════ */}
      <HardwareSwapModal
        isOpen={showSwapModal}
        onClose={() => setShowSwapModal(false)}
        onSuccess={() => {
          // Reload swap history
          const locId = airtableDisplay?.airtable_id || airtableDisplay?.id;
          if (locId) {
            setHwHistoryLoading(true);
            Promise.all([
              fetchSwapsByLocationId(locId),
              fetchDeinstallsByLocationId(locId),
            ]).then(([s, d]) => {
              setSwapHistory(s);
              setDeinstallHistory(d);
            }).finally(() => setHwHistoryLoading(false));
          }
        }}
        displayLocationId={airtableDisplay?.airtable_id || airtableDisplay?.id || null}
        locationName={display.locationName || airtableDisplay?.locationName || ''}
        city={display.city || airtableDisplay?.city || ''}
        currentHardware={hardwareSet}
      />
      <DeinstallModal
        isOpen={showDeinstallModal}
        onClose={() => setShowDeinstallModal(false)}
        onSuccess={() => {
          const locId = airtableDisplay?.airtable_id || airtableDisplay?.id;
          if (locId) {
            setHwHistoryLoading(true);
            Promise.all([
              fetchSwapsByLocationId(locId),
              fetchDeinstallsByLocationId(locId),
            ]).then(([s, d]) => {
              setSwapHistory(s);
              setDeinstallHistory(d);
            }).finally(() => setHwHistoryLoading(false));
          }
        }}
        displayLocationId={airtableDisplay?.airtable_id || airtableDisplay?.id || null}
        locationName={display.locationName || airtableDisplay?.locationName || ''}
        city={display.city || airtableDisplay?.city || ''}
        currentHardware={hardwareSet}
      />
      <HardwareHistoryModal
        isOpen={hwHistoryModal.open}
        onClose={() => setHwHistoryModal({ open: false, snType: null, snValue: null, label: '' })}
        snType={hwHistoryModal.snType}
        snValue={hwHistoryModal.snValue}
        label={hwHistoryModal.label}
      />
      {selectedHwComponent && (
        <HardwareComponentDetail
          componentType={selectedHwComponent.type}
          componentId={selectedHwComponent.id}
          onClose={() => setSelectedHwComponent(null)}
          onSelectComponent={(comp) => setSelectedHwComponent(comp)}
        />
      )}
      <StimmcheckModal
        isOpen={showStimmcheck}
        onClose={() => setShowStimmcheck(false)}
        locationName={
          stammdaten?.['Location Name'] ||
          display.locationName ||
          airtableDisplay?.locationName ||
          ''
        }
        locationAddress={
          [
            stammdaten?.['Street'],
            stammdaten?.['Street Number'],
            stammdaten?.['Postal Code'],
            stammdaten?.['City'],
          ].filter(Boolean).join(' ') || ''
        }
        onSuccess={(entry) => {
          setStimmcheckSuccess(entry);
          setTimeout(() => setStimmcheckSuccess(null), 5000);
        }}
      />
    </div>
  );
}
