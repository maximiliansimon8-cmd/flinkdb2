import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  getStatusColor,
  getStatusLabel,
  formatDate,
  formatDuration,
  formatDateTime,
} from '../utils/dataProcessing';

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
          <span className="text-xs font-mono text-slate-400 bg-slate-50/80 px-2 py-0.5 rounded">
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
            className="p-1 rounded hover:bg-slate-50/80 text-slate-400 hover:text-slate-600 transition-colors"
            title="Webhook konfigurieren"
          >
            {webhookUrl ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          {expanded ? (
            <ChevronUp size={14} className="text-slate-400" />
          ) : (
            <ChevronDown size={14} className="text-slate-400" />
          )}
        </div>
      </div>

      {/* Webhook config panel */}
      {showWebhookConfig && (
        <div className="px-4 py-3 border-t border-slate-200/60 bg-slate-50/40">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 flex-shrink-0">Webhook URL:</label>
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
          <p className="text-[10px] text-slate-400 mt-1.5">
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
                <span className="text-[10px] font-medium text-[#ef4444] uppercase tracking-wider">
                  Benötigt Aufmerksamkeit
                </span>
              </div>
              {problemDisplays.map((d) => (
                <WatchlistRow key={d.displayId} display={d} onClick={() => onSelectDisplay(d)} />
              ))}
            </div>
          )}

          {/* Healthy displays */}
          {healthyDisplays.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-green-50/40 border-b border-t border-slate-200/60">
                <span className="text-[10px] font-medium text-[#22c55e] uppercase tracking-wider">
                  Läuft stabil
                </span>
              </div>
              {healthyDisplays.map((d) => (
                <WatchlistRow key={d.displayId} display={d} onClick={() => onSelectDisplay(d)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WatchlistRow({ display: d, onClick }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-200/40 cursor-pointer transition-colors ${
        d.needsAttention ? 'hover:bg-red-50/60' : 'hover:bg-white/80'
      }`}
      onClick={onClick}
    >
      {/* Status + Score */}
      <StatusDot status={d.status} />
      <ScoreBadge score={d.healthScore} />

      {/* Display info */}
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-900 truncate">
            {d.displayId}
          </span>
          <span className="text-xs text-slate-400 truncate hidden md:inline">
            {d.displayName || d.locationName}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-400 font-mono">
            {d.city}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded">
            <Clock size={9} className="text-slate-400" />
            {formatDate(d.firstSeen)} ({d.ageDays}d)
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 flex-shrink-0 text-[10px] font-mono">
        <div className="text-center hidden lg:block">
          <div className={d.uptimeRate < 70 ? 'text-[#ef4444]' : d.uptimeRate < 90 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}>
            {d.uptimeRate}%
          </div>
          <div className="text-slate-400">Uptime</div>
        </div>
        <div className="text-center hidden lg:block">
          <div className={d.offlineEpisodes > 3 ? 'text-[#ef4444]' : 'text-slate-600'}>
            {d.offlineEpisodes}
          </div>
          <div className="text-slate-400">Ausfälle</div>
        </div>
        <div className="text-center">
          <div style={{ color: getStatusColor(d.status) }}>
            {d.offlineHours != null && d.offlineHours >= 24 ? formatDuration(d.offlineHours) : getStatusLabel(d.status)}
          </div>
          <div className="text-slate-400">Aktuell</div>
        </div>
      </div>
    </div>
  );
}
