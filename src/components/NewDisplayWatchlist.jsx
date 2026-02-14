import React, { useState, useEffect } from 'react';
import {
  Baby,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingDown,
  Bell,
  BellOff,
  Send,
  ClipboardPlus,
  Loader2,
  Phone,
} from 'lucide-react';
import {
  getStatusColor,
  getStatusLabel,
  formatDate,
  formatDuration,
  formatDateTime,
} from '../utils/dataProcessing';
import { createTask, fetchAllStammdaten, fetchInstallationByDisplayId } from '../utils/airtableService';

function ScoreBadge({ score }) {
  let color, bg;
  if (score >= 80) { color = '#22c55e'; bg = '#22c55e18'; }
  else if (score >= 60) { color = '#f59e0b'; bg = '#f59e0b18'; }
  else if (score >= 40) { color = '#f97316'; bg = '#f9731618'; }
  else { color = '#ef4444'; bg = '#ef444418'; }

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold"
      style={{ color, backgroundColor: bg, border: `1px solid ${color}33` }}
    >
      {score}
    </span>
  );
}

function StatusDot({ status }) {
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: getStatusColor(status) }}
    />
  );
}

export default function NewDisplayWatchlist({
  watchlist,
  onSelectDisplay,
  webhookUrl,
  onWebhookUrlChange,
}) {
  const [expanded, setExpanded] = useState(true);
  const [alertSending, setAlertSending] = useState(false);
  const [alertResult, setAlertResult] = useState(null);
  const [showWebhookConfig, setShowWebhookConfig] = useState(false);
  const [webhookInput, setWebhookInput] = useState(webhookUrl || '');

  // Quick-task creation state – persisted via localStorage so "Erstellt" survives reloads
  const STORAGE_KEY = 'jet_watchlist_tasks_created';
  const loadCreatedTasks = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  };
  const [taskCreating, setTaskCreating] = useState(() => {
    // Initialize from localStorage: all previously created → 'success'
    const stored = loadCreatedTasks();
    const init = {};
    Object.keys(stored).forEach((id) => { init[id] = 'success'; });
    return init;
  });
  const [locations, setLocations] = useState(null);

  // Persist successful task creations to localStorage
  const markTaskCreated = (displayId) => {
    const stored = loadCreatedTasks();
    stored[displayId] = Date.now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch {}
  };

  // Load locations lazily (only when needed for task creation)
  const ensureLocations = async () => {
    if (locations) return locations;
    const data = await fetchAllStammdaten();
    setLocations(data);
    return data;
  };

  // Create a quick task for a display
  const handleCreateQuickTask = async (display) => {
    const displayId = display.displayId;
    setTaskCreating((prev) => ({ ...prev, [displayId]: 'loading' }));

    try {
      // Load locations to find the matching one
      const allLocs = await ensureLocations();
      const matchedLoc = allLocs.find(
        (loc) => loc.displayIds?.includes(displayId) || loc.name === display.locationName
      );

      // Load installation data for details
      let instData = null;
      try {
        instData = await fetchInstallationByDisplayId(displayId);
      } catch {}

      // Build description with offline rate and location info
      const lines = [];
      lines.push(`Klärungsbedarf für Display ${displayId} am Standort ${display.locationName || 'unbekannt'}.`);
      lines.push('');
      lines.push('--- Display-Status ---');
      lines.push(`Status: ${getStatusLabel(display.status)}`);
      lines.push(`Uptime Rate: ${display.uptimeRate}%`);
      lines.push(`Health Score: ${display.healthScore}`);
      lines.push(`Offline-Episoden: ${display.offlineEpisodes}`);
      if (display.offlineHours != null) {
        lines.push(`Offline seit: ${formatDuration(display.offlineHours)}`);
      }
      lines.push(`Alter: ${display.ageDays} Tage (seit ${formatDate(display.firstSeen)})`);

      if (matchedLoc) {
        lines.push('');
        lines.push('--- Standort-Info ---');
        lines.push(`Standort: ${matchedLoc.name}`);
        if (matchedLoc.city) {
          const addr = [matchedLoc.street, matchedLoc.streetNumber].filter(Boolean).join(' ');
          lines.push(`Adresse: ${addr ? addr + ', ' : ''}${matchedLoc.postalCode || ''} ${matchedLoc.city}`.trim());
        }
        if (matchedLoc.jetIds?.[0]) lines.push(`JET ID: ${matchedLoc.jetIds[0]}`);
        if (matchedLoc.contactPerson) lines.push(`Kontakt: ${matchedLoc.contactPerson}`);
        if (matchedLoc.contactPhone) lines.push(`Telefon: ${matchedLoc.contactPhone}`);
        if (matchedLoc.contactEmail) lines.push(`E-Mail: ${matchedLoc.contactEmail}`);
      }

      if (instData) {
        lines.push('');
        lines.push('--- Installation ---');
        if (instData.installDate) lines.push(`Aufbaudatum: ${instData.installDate}`);
        if (instData.status) lines.push(`Status: ${instData.status}`);
        if (instData.integrator) lines.push(`Integrator: ${instData.integrator}`);
        if (instData.screenType) lines.push(`Screen: ${instData.screenType}${instData.screenSize ? ` (${instData.screenSize})` : ''}`);
        if (instData.opsNr) lines.push(`OPS Nr: ${instData.opsNr}`);
        if (instData.simId) lines.push(`SIM-ID: ${instData.simId}`);
        if (instData.protocol?.[0]?.url) lines.push(`Protokoll: ${instData.protocol[0].url}`);
      }

      const taskData = {
        title: `Call zur Klärung – ${display.locationName || displayId}`,
        partner: 'Lieferando AM',
        status: 'New',
        priority: display.uptimeRate < 50 ? 'Urgent' : display.uptimeRate < 70 ? 'High' : 'Medium',
        description: lines.join('\n'),
      };

      // Add location reference if found
      if (matchedLoc?.id) {
        taskData.locations = [matchedLoc.id];
      }

      await createTask(taskData);
      setTaskCreating((prev) => ({ ...prev, [displayId]: 'success' }));
      markTaskCreated(displayId);
      // Success stays permanently visible – no timeout
    } catch (err) {
      console.error('Quick task creation failed:', err);
      setTaskCreating((prev) => ({ ...prev, [displayId]: 'error' }));
      // Error auto-clears after 5s so user can retry
      setTimeout(() => {
        setTaskCreating((prev) => ({ ...prev, [displayId]: null }));
      }, 5000);
    }
  };

  const problemDisplays = watchlist.filter((d) => d.needsAttention);
  const healthyDisplays = watchlist.filter((d) => !d.needsAttention);

  const sendAlert = async () => {
    if (!webhookUrl) {
      setShowWebhookConfig(true);
      return;
    }

    setAlertSending(true);
    setAlertResult(null);

    try {
      const payload = {
        timestamp: new Date().toISOString(),
        type: 'new_display_watchlist_alert',
        summary: `${problemDisplays.length} von ${watchlist.length} neuen Displays benötigen Aufmerksamkeit`,
        problemDisplays: problemDisplays.map((d) => ({
          displayId: d.displayId,
          locationName: d.locationName,
          city: d.city,
          status: d.status,
          healthScore: d.healthScore,
          uptimeRate: d.uptimeRate,
          offlineEpisodes: d.offlineEpisodes,
          ageDays: d.ageDays,
          lastHeartbeat: d.heartbeat?.toISOString(),
        })),
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setAlertResult('success');
      } else {
        setAlertResult('error');
      }
    } catch {
      setAlertResult('error');
    } finally {
      setAlertSending(false);
      setTimeout(() => setAlertResult(null), 4000);
    }
  };

  const saveWebhook = () => {
    onWebhookUrlChange(webhookInput);
    setShowWebhookConfig(false);
  };

  if (watchlist.length === 0) return null;

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/80 transition-colors rounded-t-2xl"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Baby size={16} className="text-[#3b82f6]" />
          <h3 className="text-sm font-medium text-slate-900">
            Neue Displays – Watchlist
          </h3>
          <span className="text-xs font-mono text-slate-500 bg-slate-50/80 px-2 py-0.5 rounded">
            {watchlist.length} displays (&le; 28 Tage)
          </span>
          {problemDisplays.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-mono text-[#ef4444] bg-[#ef444418] px-2 py-0.5 rounded border border-[#ef444433]">
              <AlertTriangle size={10} />
              {problemDisplays.length} auffällig
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Alert button */}
          {problemDisplays.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                sendAlert();
              }}
              disabled={alertSending}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                alertResult === 'success'
                  ? 'bg-green-50/60 text-green-600 border border-green-200/40'
                  : alertResult === 'error'
                    ? 'bg-red-50/60 text-red-500 border border-red-200/40'
                    : 'bg-slate-50/80 text-slate-600 border border-slate-200/60 hover:border-[#f59e0b] hover:text-[#f59e0b]'
              }`}
              title={webhookUrl ? 'Alert per Webhook senden' : 'Webhook konfigurieren'}
            >
              {alertResult === 'success' ? (
                <><CheckCircle2 size={12} /> Gesendet</>
              ) : alertResult === 'error' ? (
                <><XCircle size={12} /> Fehler</>
              ) : alertSending ? (
                <><Clock size={12} className="animate-spin" /> Sende...</>
              ) : (
                <><Send size={12} /> Alert senden</>
              )}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowWebhookConfig(!showWebhookConfig);
            }}
            className="p-1 rounded hover:bg-slate-50/80 text-slate-500 hover:text-slate-600 transition-colors"
            title="Webhook konfigurieren"
          >
            {webhookUrl ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          {expanded ? (
            <ChevronUp size={14} className="text-slate-500" />
          ) : (
            <ChevronDown size={14} className="text-slate-500" />
          )}
        </div>
      </div>

      {/* Webhook config panel */}
      {showWebhookConfig && (
        <div className="px-4 py-3 border-t border-slate-200/60 bg-slate-50/40">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 flex-shrink-0">Webhook URL:</label>
            <input
              type="url"
              value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              placeholder="https://n8n.example.com/webhook/..."
              className="flex-grow bg-slate-50/80 border border-slate-200/60 rounded px-2.5 py-1.5 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6]"
            />
            <button
              onClick={saveWebhook}
              className="px-3 py-1.5 rounded text-xs font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
            >
              Speichern
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Verbinde mit n8n, Zapier, Make oder jedem Webhook-fähigen Dienst. Es wird ein JSON-Payload mit den Problem-Displays gesendet.
          </p>
        </div>
      )}

      {/* Content */}
      {expanded && (
        <div className="border-t border-slate-200/60">
          {/* Problem displays */}
          {problemDisplays.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-red-50/40 border-b border-slate-200/60">
                <span className="text-xs font-medium text-[#ef4444] uppercase tracking-wider">
                  Benötigt Aufmerksamkeit
                </span>
              </div>
              {problemDisplays.map((d) => (
                <WatchlistRow
                  key={d.displayId}
                  display={d}
                  onClick={() => onSelectDisplay(d)}
                  onCreateTask={() => handleCreateQuickTask(d)}
                  taskState={taskCreating[d.displayId]}
                />
              ))}
            </div>
          )}

          {/* Healthy displays */}
          {healthyDisplays.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-green-50/40 border-b border-t border-slate-200/60">
                <span className="text-xs font-medium text-[#22c55e] uppercase tracking-wider">
                  Läuft stabil
                </span>
              </div>
              {healthyDisplays.map((d) => (
                <WatchlistRow
                  key={d.displayId}
                  display={d}
                  onClick={() => onSelectDisplay(d)}
                  onCreateTask={() => handleCreateQuickTask(d)}
                  taskState={taskCreating[d.displayId]}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WatchlistRow({ display: d, onClick, onCreateTask, taskState }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-200/40 transition-colors ${
        d.needsAttention ? 'hover:bg-red-50/60' : 'hover:bg-white/80'
      }`}
    >
      {/* Status + Score (clickable to open display detail) */}
      <div className="flex items-center gap-3 flex-grow min-w-0 cursor-pointer" onClick={onClick}>
        <StatusDot status={d.status} />
        <ScoreBadge score={d.healthScore} />

        {/* Display info */}
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-900 truncate">
              {d.displayId}
            </span>
            <span className="text-xs text-slate-500 truncate hidden md:inline">
              {d.displayName || d.locationName}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500 font-mono">
              {d.city}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded">
              <Clock size={9} className="text-slate-500" />
              {formatDate(d.firstSeen)} ({d.ageDays}d)
            </span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 flex-shrink-0 text-xs font-mono cursor-pointer" onClick={onClick}>
        <div className="text-center hidden lg:block">
          <div className={d.uptimeRate < 70 ? 'text-[#ef4444]' : d.uptimeRate < 90 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}>
            {d.uptimeRate}%
          </div>
          <div className="text-slate-500">Uptime</div>
        </div>
        <div className="text-center hidden lg:block">
          <div className={d.offlineEpisodes > 3 ? 'text-[#ef4444]' : 'text-slate-600'}>
            {d.offlineEpisodes}
          </div>
          <div className="text-slate-500">Ausfälle</div>
        </div>
        <div className="text-center">
          <div style={{ color: getStatusColor(d.status) }}>
            {d.offlineHours != null && d.offlineHours >= 24 ? formatDuration(d.offlineHours) : getStatusLabel(d.status)}
          </div>
          <div className="text-slate-500">Aktuell</div>
        </div>
      </div>

      {/* Quick Task Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!taskState) onCreateTask();
        }}
        disabled={!!taskState}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
          taskState === 'success'
            ? 'bg-green-50/60 text-green-600 border border-green-200/40'
            : taskState === 'error'
              ? 'bg-red-50/60 text-red-500 border border-red-200/40'
              : taskState === 'loading'
                ? 'bg-blue-50/60 text-blue-500 border border-blue-200/40'
                : 'bg-amber-50/60 text-amber-700 border border-amber-200/40 hover:bg-amber-100/60 hover:border-amber-300/60'
        }`}
        title="Task erstellen: Call zur Klärung (Lieferando AM)"
      >
        {taskState === 'success' ? (
          <><CheckCircle2 size={11} /> Erstellt</>
        ) : taskState === 'error' ? (
          <><XCircle size={11} /> Fehler</>
        ) : taskState === 'loading' ? (
          <><Loader2 size={11} className="animate-spin" /> Erstelle...</>
        ) : (
          <><Phone size={11} /> Call-Task</>
        )}
      </button>
    </div>
  );
}
