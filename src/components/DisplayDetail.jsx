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
} from 'lucide-react';
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
} from '../utils/airtableService';

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon size={14} className="text-slate-400 flex-shrink-0" />
      <span className="text-slate-400 text-xs w-32 flex-shrink-0">{label}</span>
      <span className={`text-slate-900 text-xs ${mono ? 'font-mono' : ''}`}>
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
      <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-3">
        Tagesverlauf – Status pro Snapshot
      </h3>

      <div className="space-y-[3px] max-h-[400px] overflow-y-auto pr-1">
        {dayRows.map((row) => {
          const rateColor =
            row.rate == null
              ? '#64748b'
              : row.rate >= 90
                ? '#22c55e'
                : row.rate >= 70
                  ? '#f59e0b'
                  : row.rate >= 50
                    ? '#f97316'
                    : '#ef4444';

          return (
            <div key={row.dateKey} className="flex items-center gap-2">
              {/* Date label */}
              <div className="w-[72px] flex-shrink-0 text-[10px] font-mono text-slate-400 text-right">
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
                className="w-[42px] flex-shrink-0 text-[10px] font-mono font-bold text-right"
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
          <span className="w-3 h-2.5 rounded-sm bg-[#22c55e] opacity-75" />
          <span className="text-[10px] text-slate-400">Online (&lt;24h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-[#f59e0b]" />
          <span className="text-[10px] text-slate-400">Warnung (24–72h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-[#ef4444]" />
          <span className="text-[10px] text-slate-400">Kritisch (&gt;72h)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-[#dc2626]" />
          <span className="text-[10px] text-slate-400">Dauerhaft (&gt;7d)</span>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredSeg && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: mousePos.x + 14, top: mousePos.y - 8 }}
        >
          <div className="bg-white/90 backdrop-blur-xl border border-white/60 rounded-xl px-3 py-2 text-xs font-mono shadow-lg shadow-black/5">
            <div className="text-slate-600 mb-1">
              {formatDateTime(hoveredSeg.timestamp)}
            </div>
            <div className="font-bold" style={{ color: getStatusColor(hoveredSeg.status) }}>
              {getStatusLabel(hoveredSeg.status)}
            </div>
            {hoveredSeg.heartbeat && (
              <div className="text-slate-400 mt-0.5">
                Heartbeat: {formatDateTime(hoveredSeg.heartbeat)}
              </div>
            )}
            {hoveredSeg.offlineHours != null && hoveredSeg.offlineHours >= 1 && (
              <div className="text-slate-400">
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
    <div className="flex w-full h-5 rounded overflow-hidden border border-slate-200/60">
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
  if (rate >= 90) return '#22c55e';
  if (rate >= 70) return '#f59e0b';
  if (rate >= 50) return '#f97316';
  return '#ef4444';
}

function rateBg(rate) {
  if (rate == null) return '#cbd5e120';
  if (rate >= 90) return '#22c55e18';
  if (rate >= 70) return '#f59e0b18';
  if (rate >= 50) return '#f9731618';
  return '#ef444418';
}

function WeekdayChart({ segments }) {
  const stats = useMemo(() => computeWeekdayStats(segments), [segments]);
  const minRate = Math.min(...stats.filter((s) => s.rate != null).map((s) => s.rate));
  const worstDay = stats.find((s) => s.rate === minRate);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={14} className="text-slate-400" />
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">
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
              <div className="text-[10px] font-mono text-slate-400 mt-1">{day.label}</div>
              <div
                className="text-[10px] font-mono font-bold"
                style={{ color: day.rate != null ? statusRateColor(day.rate) : '#64748b' }}
              >
                {day.rate != null ? `${day.rate}%` : '–'}
              </div>
              <div className="text-[9px] font-mono text-slate-400">
                {day.total > 0 ? `n=${day.total}` : ''}
              </div>
            </div>
          );
        })}
      </div>
      {worstDay && worstDay.rate != null && worstDay.rate < 90 && (
        <div className="mt-3 px-3 py-2 rounded bg-slate-50/80 border border-slate-200/60">
          <span className="text-[10px] text-slate-400">
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

function HourChart({ segments }) {
  const stats = useMemo(() => computeHourStats(segments), [segments]);
  const problemHours = stats.filter((s) => s.rate != null && s.rate < 70);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Sun size={14} className="text-slate-400" />
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">
          Online-Rate nach Tageszeit
        </h3>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {stats.map((hour) => (
          <div
            key={hour.label}
            className="flex flex-col items-center rounded p-1"
            style={{ backgroundColor: rateBg(hour.rate) }}
            title={`${hour.label}:00 – ${hour.rate != null ? hour.rate + '%' : 'keine Daten'} (${hour.total} Checks)`}
          >
            <div
              className="text-[10px] font-mono font-bold"
              style={{ color: hour.rate != null ? statusRateColor(hour.rate) : '#64748b' }}
            >
              {hour.rate != null ? `${Math.round(hour.rate)}` : '–'}
            </div>
            <div className="text-[9px] font-mono text-slate-400">{hour.label}h</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" />
          <span className="text-[9px] text-slate-400">&ge;90%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" />
          <span className="text-[9px] text-slate-400">70–90%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316]" />
          <span className="text-[9px] text-slate-400">50–70%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" />
          <span className="text-[9px] text-slate-400">&lt;50%</span>
        </div>
      </div>
      {problemHours.length > 0 && (
        <div className="mt-3 px-3 py-2 rounded bg-slate-50/80 border border-slate-200/60">
          <span className="text-[10px] text-slate-400">
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

function ContactInfoPanel({ stammdaten, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#3b82f6] animate-spin" />
        <span className="text-xs text-slate-400 font-mono">Lade Standortdaten...</span>
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

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={14} className="text-[#3b82f6]" />
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">
          Standort-Informationen (Airtable)
        </h3>
        {stammdaten['JET ID'] && (
          <span className="text-[10px] font-mono bg-[#3b82f6]/15 text-[#3b82f6] px-2 py-0.5 rounded-full border border-[#3b82f6]/25">
            JET ID: {stammdaten['JET ID']}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
        {/* Left column – Contact */}
        <div>
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
        </div>

        {/* Right column – Address */}
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
    </div>
  );
}

// ─── Airtable: Tasks Panel ──────────────────────────────────────────────────────

function getTaskStatusIcon(status) {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'done':
    case 'erledigt':
      return <CheckCircle2 size={12} className="text-[#22c55e]" />;
    case 'in progress':
    case 'in bearbeitung':
      return <Circle size={12} className="text-[#3b82f6]" />;
    case 'blocked':
    case 'blockiert':
      return <AlertTriangle size={12} className="text-[#ef4444]" />;
    default:
      return <Circle size={12} className="text-[#64748b]" />;
  }
}

function getTaskStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'done':
    case 'erledigt':
      return { bg: '#22c55e15', text: '#22c55e', border: '#22c55e33' };
    case 'in progress':
    case 'in bearbeitung':
      return { bg: '#3b82f615', text: '#3b82f6', border: '#3b82f633' };
    case 'blocked':
    case 'blockiert':
      return { bg: '#ef444415', text: '#ef4444', border: '#ef444433' };
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
      return '#ef4444';
    case 'medium':
    case 'mittel':
      return '#f59e0b';
    case 'low':
    case 'niedrig':
      return '#22c55e';
    default:
      return '#64748b';
  }
}

function TasksPanel({ tasks, loading }) {
  const [expandedTask, setExpandedTask] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={14} className="text-[#3b82f6] animate-spin" />
        <span className="text-xs text-slate-400 font-mono">Lade Aufgaben...</span>
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
        className="bg-slate-50/80 rounded-lg border border-slate-200/60 overflow-hidden transition-colors hover:border-slate-300/40"
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
              <span className="text-xs text-slate-900 font-medium truncate">
                {task.title}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Status badge */}
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
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
                  className="text-[10px] font-mono font-bold"
                  style={{ color: getPriorityColor(task.priority) }}
                >
                  {task.priority}
                </span>
              )}

              {/* Assigned / Responsible */}
              {(task.responsibleUser || (task.assigned && task.assigned.length > 0)) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-600">
                  <User size={9} className="text-slate-400" />
                  {task.responsibleUser || task.assigned?.join(', ')}
                </span>
              )}

              {/* Task Type badges */}
              {task.type.length > 0 && task.type.map((t, i) => (
                <span
                  key={i}
                  className="text-[10px] font-mono text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-mono text-slate-400">
              {formatTaskDateTime(task.createdTime)}
            </span>
            {isExpanded ? (
              <ChevronDown size={12} className="text-slate-400" />
            ) : (
              <ChevronRight size={12} className="text-slate-400" />
            )}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-3 pb-3 pt-0 border-t border-slate-200/60 ml-6">
            <div className="space-y-1.5 mt-2">
              {task.description && (
                <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed bg-white/60 backdrop-blur-xl rounded p-2 max-h-32 overflow-y-auto">
                  {task.description}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-slate-400">
                {task.dueDate && (
                  <span>Fällig: <span className="text-slate-600">{formatTaskDate(task.dueDate)}</span></span>
                )}
                {task.responsibleUser && (
                  <span>Verantwortlich: <span className="text-slate-600">{task.responsibleUser}</span></span>
                )}
                {task.assigned && task.assigned.length > 0 && (
                  <span>Zugewiesen: <span className="text-slate-600">{task.assigned.join(', ')}</span></span>
                )}
                {task.createdBy && (
                  <span>Erstellt von: <span className="text-slate-600">{task.createdBy}</span></span>
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
        <ClipboardList size={14} className="text-[#3b82f6]" />
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">
          Aufgaben
        </h3>
        <span className="text-[10px] font-mono text-slate-400 bg-slate-50/80 px-2 py-0.5 rounded">
          {tasks.length} gesamt
        </span>
        {openTasks.length > 0 && (
          <span className="text-[10px] font-mono text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded border border-[#f59e0b]/25">
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
              <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider pt-2 pb-1">
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
        <Loader2 size={14} className="text-[#3b82f6] animate-spin" />
        <span className="text-xs text-slate-400 font-mono">Lade Installationsdaten...</span>
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
      'Installiert': { bg: '#22c55e15', text: '#22c55e', border: '#22c55e33' },
      'In Planung': { bg: '#3b82f615', text: '#3b82f6', border: '#3b82f633' },
      'Abgebrochen': { bg: '#ef444415', text: '#ef4444', border: '#ef444433' },
    };
    const c = colors[status] || { bg: '#64748b15', text: '#64748b', border: '#64748b33' };
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium"
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
        <Wrench size={14} className="text-[#3b82f6]" />
        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">
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
              <FileText size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-400 text-xs w-32 flex-shrink-0">Bemerkungen</span>
              <span className="text-slate-600 text-xs whitespace-pre-wrap leading-relaxed">
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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50/80 border border-slate-200/60 text-xs font-mono text-slate-600 hover:border-[#3b82f6] hover:text-slate-900 transition-colors"
          >
            <Download size={12} className="text-[#3b82f6]" />
            <span>Installationsprotokoll</span>
            <span className="text-slate-400">({protocolPdf.filename || 'PDF'})</span>
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main Detail component ────────────────────────────────────────────────────

export default function DisplayDetail({ display, onClose }) {
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

  useEffect(() => {
    let cancelled = false;
    const displayId = display.displayId;

    setStammdatenLoading(true);
    setTasksLoading(true);
    setInstallationLoading(true);

    fetchStammdatenByDisplayId(displayId).then((data) => {
      if (!cancelled) {
        setStammdaten(data);
        setStammdatenLoading(false);
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

    return () => { cancelled = true; };
  }, [display.displayId]);

  const statusColor = getStatusColor(display.status);
  const statusLabel = getStatusLabel(display.status);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-start justify-center pt-8 px-4 overflow-y-auto">
      <div className="bg-white/80 backdrop-blur-2xl border border-white/60 rounded-2xl shadow-2xl shadow-black/10 w-full max-w-4xl mb-12 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200/60">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold font-mono"
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
                <span className="text-xs font-mono" style={{ color: statusColor }}>
                  {formatDuration(display.offlineHours)} offline
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-mono font-bold text-slate-900">
                {display.displayId}
              </h2>
              {stammdaten?.['JET ID'] && (
                <span className="text-xs font-mono bg-[#3b82f6]/15 text-[#3b82f6] px-2.5 py-1 rounded-full border border-[#3b82f6]/25 font-bold">
                  JET {stammdaten['JET ID']}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-0.5">
              {stammdaten?.['Location Name'] || display.displayName || display.locationName || 'Unbekannter Standort'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100/60 text-slate-400 hover:text-slate-900 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top section: Info + Summary stats side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border-b border-slate-200/60">
          {/* Info Grid */}
          <div className="lg:col-span-2 p-5 border-b lg:border-b-0 lg:border-r border-slate-200/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <div>
                <InfoRow icon={Monitor} label="Display ID" value={display.displayId} mono />
                <InfoRow icon={MapPin} label="Standort" value={display.displayName || display.locationName} />
                <InfoRow icon={MapPin} label="Stadt" value={`${display.city} (${display.cityCode})`} />
                <InfoRow icon={Hash} label="Navori Venue ID" value={display.serialNumber} mono />
              </div>
              <div>
                <InfoRow icon={Calendar} label="Installiert" value={formatDate(display.firstSeen)} mono />
                <InfoRow icon={Calendar} label="Letzter Check" value={formatDateTime(display.lastSeen)} mono />
                <InfoRow icon={Clock} label="Letzter Heartbeat" value={formatDateTime(display.heartbeat)} mono />
                <InfoRow icon={TrendingUp} label="Uptime-Rate" value={`${timeline.uptimeRate}%`} mono />
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="p-5 flex flex-col justify-center gap-3">
            <div className="bg-slate-50/80 rounded-lg p-3 text-center">
              <div className="text-2xl font-mono font-bold" style={{ color: statusRateColor(timeline.uptimeRate) }}>
                {timeline.uptimeRate}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Uptime-Rate</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50/80 rounded-lg p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-slate-600">
                  {timeline.episodes.length}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Offline-Episoden</div>
              </div>
              <div className="bg-slate-50/80 rounded-lg p-2.5 text-center">
                <div className="text-lg font-mono font-bold text-[#ef4444]">
                  {timeline.longestEpisode
                    ? formatDuration(timeline.longestEpisode.durationHours)
                    : '–'}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">Längster Ausfall</div>
              </div>
            </div>
          </div>
        </div>

        {/* Airtable: Contact Info */}
        {(stammdatenLoading || stammdaten) && (
          <div className="p-5 border-b border-slate-200/60">
            <ContactInfoPanel stammdaten={stammdaten} loading={stammdatenLoading} />
          </div>
        )}

        {/* Airtable: Installation */}
        {(installationLoading || installation) && (
          <div className="p-5 border-b border-slate-200/60">
            <InstallationPanel installation={installation} loading={installationLoading} />
          </div>
        )}

        {/* Airtable: Tasks */}
        {(tasksLoading || tasks.length > 0) && (
          <div className="p-5 border-b border-slate-200/60">
            <TasksPanel tasks={tasks} loading={tasksLoading} />
          </div>
        )}

        {/* ★ Day-by-day detail chart — the main visual */}
        {timeline.segments.length > 0 && (
          <div className="p-5 border-b border-slate-200/60">
            <DayDetailChart segments={timeline.segments} />
          </div>
        )}

        {/* Compact overview timeline */}
        <div className="px-5 pt-4 pb-2 border-b border-slate-200/60">
          <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">
            Gesamtverlauf (kompakt)
          </h3>
          <TimelineBar segments={timeline.segments} />
          <div className="flex justify-between mt-1.5 text-[10px] font-mono text-slate-400">
            <span>{formatDate(timeline.segments[0]?.timestamp)}</span>
            <span>
              {formatDate(timeline.segments[timeline.segments.length - 1]?.timestamp)}
            </span>
          </div>
        </div>

        {/* Weekday + Time-of-day analysis */}
        {timeline.segments.length > 0 && (
          <div className="p-5 border-b border-slate-200/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <WeekdayChart segments={timeline.segments} />
              <HourChart segments={timeline.segments} />
            </div>
          </div>
        )}

        {/* Offline episodes */}
        {timeline.episodes.length > 0 && (
          <div className="p-5">
            <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-3">
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
                      className={`flex items-center justify-between px-3 py-2 rounded text-xs font-mono ${
                        isLongest
                          ? 'bg-red-50/60 border border-red-900/40'
                          : 'bg-slate-50/80'
                      }`}
                    >
                      <div className="text-slate-600">
                        {formatDateTime(ep.start)}
                        <span className="text-slate-400 mx-2">&rarr;</span>
                        {formatDateTime(ep.end)}
                      </div>
                      <div
                        className="font-bold"
                        style={{ color: isLongest ? '#ef4444' : '#94a3b8' }}
                      >
                        {formatDuration(ep.durationHours)}
                        {isLongest && (
                          <span className="text-[10px] ml-1.5 text-red-400 font-normal">
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
          <div className="text-[10px] text-slate-400 font-mono">
            {display.totalSnapshots} Datenpunkte &bull; Erste Erfassung{' '}
            {formatDate(display.firstSeen)} &bull; Letzte Erfassung{' '}
            {formatDate(display.lastSeen)}
          </div>
        </div>
      </div>
    </div>
  );
}
