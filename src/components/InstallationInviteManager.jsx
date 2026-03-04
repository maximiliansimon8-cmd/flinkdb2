import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Send, Search, MapPin, Phone, CheckCircle, Clock, AlertCircle,
  ChevronDown, RefreshCw, Eye, Building,
  X, XCircle, Check, Loader2, Inbox, ChevronRight,
  CheckSquare, AlertTriangle, History, FileText,
  Map as MapIcon, Calendar,
} from 'lucide-react';
import { fetchAllAcquisition, fetchAllInstallationstermine } from '../utils/airtableService';
import { isStorno, isAlreadyInstalled, isReadyForInstall } from '../metrics';
import { INSTALL_API, formatDateYear as formatDate, formatDateTime, triggerSyncAndReload } from '../utils/installUtils';
import { getCurrentUser } from '../utils/authService';
import UnifiedStandortDetail from './UnifiedStandortDetail';

const MOUNT_TYPES = [
  { value: '', label: 'Alle Montagearten' },
  { value: 'Bodenmontage', label: 'Bodenmontage' },
  { value: 'Wandmontage', label: 'Wandmontage' },
  { value: 'Deckenmontage', label: 'Deckenmontage' },
];

const STATUS_BADGES = {
  not_invited:   { label: 'Nicht eingeladen', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock },
  invited:       { label: 'Eingeladen',       color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Send },
  pending:       { label: 'Eingeladen',       color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Send },
  invite_failed: { label: 'Senden fehlgeschlagen', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertCircle },
  booked:        { label: 'Eingebucht',       color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  confirmed:     { label: 'Eingebucht',       color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  completed:     { label: 'Abgeschlossen',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled:     { label: 'Storniert',        color: 'bg-red-100 text-red-700 border-red-200', icon: X },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGES[status] || STATUS_BADGES.not_invited;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}


/* ── Batch Invite Confirm Modal with Progress + Template Selection + Route Selection ── */
function BatchInviteModal({ selectedStandorte, onConfirm, onCancel, inviting, progress, templates, selectedTemplate, onTemplateChange, routes, selectedRouteId, onRouteChange }) {
  const withPhone = selectedStandorte.filter(s => s.contactPhone);
  const withoutPhone = selectedStandorte.filter(s => !s.contactPhone);
  const [showPreview, setShowPreview] = useState(false);
  const activeTemplate = templates?.find(t => t.id === selectedTemplate);

  // Format route label: "Frankfurt am Main - 17.02.2026 (e-Systems Team 1, 3/5 frei)"
  const formatRouteLabel = (route) => {
    const dateStr = route.schedule_date
      ? new Date(route.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '--';
    const team = route.installer_team || 'Kein Team';
    return `${route.city || 'Unbekannt'} - ${dateStr} (${team}, ${route.frei}/${route.capacity} frei)`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Einladungen senden</h3>
          <p className="text-sm text-gray-500 mt-1">
            {withPhone.length} von {selectedStandorte.length} Standorte koennen eingeladen werden.
          </p>
        </div>

        {/* Route/Tour Selector */}
        {routes && routes.length > 0 && (
          <div className="px-5 pt-4 pb-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <Calendar size={12} /> Route / Tour zuordnen
            </label>
            <select
              value={selectedRouteId || ''}
              onChange={(e) => onRouteChange(e.target.value)}
              disabled={inviting}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30 disabled:opacity-50"
            >
              <option value="">Keine Route zuordnen (optional)</option>
              {routes.map(r => (
                <option key={r.id} value={r.id}>{formatRouteLabel(r)}</option>
              ))}
            </select>
            {selectedRouteId && (() => {
              const sel = routes.find(r => r.id === parseInt(selectedRouteId) || r.id === selectedRouteId);
              if (!sel) return null;
              return (
                <div className="mt-2 flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <Calendar size={12} className="shrink-0" />
                  <span>
                    Standorte werden der Tour <strong>{sel.city}</strong> am{' '}
                    <strong>{new Date(sel.schedule_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</strong> zugeordnet.
                    {sel.frei < withPhone.length && (
                      <span className="text-amber-600 font-medium ml-1">
                        Achtung: Nur {sel.frei} Plaetze frei, aber {withPhone.length} ausgewaehlt!
                      </span>
                    )}
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Template Selector */}
        {templates && templates.length > 0 && (
          <div className="px-5 pt-4 pb-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">WhatsApp Template</label>
            <select
              value={selectedTemplate || ''}
              onChange={(e) => onTemplateChange(e.target.value)}
              disabled={inviting}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 disabled:opacity-50"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {activeTemplate && (
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-orange-600 hover:text-orange-700 mt-1.5 flex items-center gap-1"
              >
                <FileText size={10} />
                {showPreview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}
              </button>
            )}
            {showPreview && activeTemplate && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed whitespace-pre-wrap border border-gray-100">
                {(() => {
                  // Fill template placeholders with example values from first selected standort
                  const example = withPhone[0];
                  if (!example) return activeTemplate.body;
                  const firstName = example.contactPerson ? example.contactPerson.split(' ')[0] : 'Standortinhaber/in';
                  const city = (example.city || [])[0] || 'Stadt';
                  const locName = example.locationName || example.jetId || city;
                  const previewBody = activeTemplate.body
                    .replace(/\{\{1\}\}/g, firstName)
                    .replace(/\{\{2\}\}/g, city)
                    .replace(/\{\{3\}\}/g, locName)
                    .replace(/\{\{4\}\}/g, 'Verf. Termine')
                    .replace(/\{\{5\}\}/g, 'tools.dimension-outdoor.com/book/...');
                  return previewBody;
                })()}
                {withPhone.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] text-gray-400 italic">
                    Vorschau fuer: {withPhone[0].locationName} | {withPhone.length - 1} weitere werden individuell angepasst
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="p-5 space-y-3 max-h-60 overflow-y-auto">
          {withPhone.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <Check size={14} className="text-green-500 shrink-0" />
              <span className="text-gray-900 font-medium truncate">{s.locationName}</span>
              <span className="text-gray-400 text-xs ml-auto">{s.city?.[0]}</span>
            </div>
          ))}
          {withoutPhone.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <AlertCircle size={14} className="text-amber-500 shrink-0" />
              <span className="text-gray-400 truncate">{s.locationName}</span>
              <span className="text-xs text-amber-500 ml-auto">Keine Tel.</span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        {inviting && progress && (
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Sende Einladungen...</span>
              <span className="font-mono">{progress.sent}/{progress.total}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.failed > 0 && (
              <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle size={10} /> {progress.failed} fehlgeschlagen
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onCancel} disabled={inviting}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Abbrechen
          </button>
          <button
            onClick={() => onConfirm(withPhone)}
            disabled={inviting || withPhone.length === 0}
            className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {inviting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {inviting ? `${progress?.sent || 0}/${progress?.total || 0}` : `${withPhone.length} einladen`}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ── Einladungs-Historie (Invitation History) ── */
function InvitationHistorySection({ bookings, routes }) {
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [historySearch, setHistorySearch] = useState('');

  const routeMap = useMemo(() => {
    const map = new Map();
    for (const r of (routes || [])) {
      if (r.id) map.set(r.id, r);
    }
    return map;
  }, [routes]);

  // Group bookings that have whatsapp_sent_at by route_id (or city+booked_date fallback)
  const historyGroups = useMemo(() => {
    const sentBookings = (bookings || []).filter(b => b.whatsapp_sent_at);
    if (sentBookings.length === 0) return [];

    const groupMap = new Map();
    for (const b of sentBookings) {
      const route = b.route_id ? routeMap.get(b.route_id) : null;
      let groupKey, groupCity, groupDate, groupTeam;

      if (route) {
        groupKey = `route-${route.id}`;
        groupCity = route.city || b.city || 'Unbekannt';
        groupDate = route.schedule_date || b.booked_date || '';
        groupTeam = route.installer_team || b.installer_team || '';
      } else {
        const sentDate = b.whatsapp_sent_at ? b.whatsapp_sent_at.slice(0, 10) : '';
        groupCity = b.city || 'Unbekannt';
        groupDate = b.booked_date || sentDate;
        groupTeam = b.installer_team || '';
        groupKey = `${groupCity}-${groupDate}-${groupTeam}`;
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey, city: groupCity, date: groupDate,
          team: groupTeam, routeId: route?.id || null, items: [],
        });
      }
      groupMap.get(groupKey).items.push(b);
    }

    const groups = [...groupMap.values()].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
    for (const g of groups) {
      g.items.sort((a, b) => new Date(b.whatsapp_sent_at) - new Date(a.whatsapp_sent_at));
    }
    return groups;
  }, [bookings, routeMap]);

  const filteredGroups = useMemo(() => {
    if (!historySearch) return historyGroups;
    const q = historySearch.toLowerCase();
    return historyGroups.filter(g =>
      (g.city || '').toLowerCase().includes(q) ||
      (g.team || '').toLowerCase().includes(q) ||
      (g.date || '').includes(q) ||
      g.items.some(b =>
        (b.location_name || '').toLowerCase().includes(q) ||
        (b.contact_name || '').toLowerCase().includes(q) ||
        (b.contact_phone || '').includes(q)
      )
    );
  }, [historyGroups, historySearch]);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const expandAll = () => setExpandedGroups(new Set(filteredGroups.map(g => g.key)));
  const collapseAll = () => setExpandedGroups(new Set());

  const fmtDateDot = (dateStr) => {
    if (!dateStr) return '--';
    try {
      const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return dateStr; }
  };
  const fmtTime = (dateStr) => {
    if (!dateStr) return '--';
    try { return new Date(dateStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
    catch { return '--'; }
  };

  if (historyGroups.length === 0) {
    return (
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
            <History size={28} className="text-gray-300" />
          </div>
          <div className="text-center">
            <p className="font-medium text-gray-600">Keine Einladungs-Historie</p>
            <p className="text-xs text-gray-400 mt-1">Sobald Einladungen gesendet werden, erscheinen sie hier.</p>
          </div>
        </div>
      </div>
    );
  }

  const totalInvitations = historyGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
      {/* Section Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <History size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Einladungs-Historie</h3>
              <p className="text-xs text-gray-500">
                {totalInvitations} Einladung{totalInvitations !== 1 ? 'en' : ''} in {historyGroups.length} Tour{historyGroups.length !== 1 ? 'en' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={expandAll}
              className="px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
              Alle oeffnen
            </button>
            <button onClick={collapseAll}
              className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
              Alle schliessen
            </button>
          </div>
        </div>
        {/* History Search */}
        <div className="relative mt-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Historie durchsuchen (Stadt, Team, Standort...)"
            className="w-full pl-9 pr-4 py-2 bg-white/80 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 text-sm transition-all"
          />
          {historySearch && (
            <button onClick={() => setHistorySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Accordion Groups */}
      <div className="divide-y divide-gray-100">
        {filteredGroups.map(group => {
          const isExpanded = expandedGroups.has(group.key);
          const sCounts = {};
          for (const b of group.items) { sCounts[b.status || 'pending'] = (sCounts[b.status || 'pending'] || 0) + 1; }

          return (
            <div key={group.key}>
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 transition-colors text-left"
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${isExpanded ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  {isExpanded ? <ChevronDown size={14} className="text-indigo-600" /> : <ChevronRight size={14} className="text-gray-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{fmtDateDot(group.date)}</span>
                    <span className="text-sm text-gray-400">&mdash;</span>
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                      <MapPin size={12} className="text-gray-400 shrink-0" /> Tour {group.city}
                    </span>
                    {group.team && (
                      <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full font-medium">
                        {group.team}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(sCounts.booked || sCounts.confirmed) ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-medium">
                      <CheckCircle size={10} /> {(sCounts.booked || 0) + (sCounts.confirmed || 0)}
                    </span>
                  ) : null}
                  {sCounts.pending ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full text-[10px] font-medium">
                      <Clock size={10} /> {sCounts.pending}
                    </span>
                  ) : null}
                  {sCounts.cancelled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-medium">
                      <XCircle size={10} /> {sCounts.cancelled}
                    </span>
                  ) : null}
                  <span className="text-xs text-gray-400 font-mono ml-1">{group.items.length} Einl.</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4">
                  <div className="bg-gray-50/80 rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200/60">
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Standort</th>
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Stadt</th>
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Kontakt</th>
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Telefon</th>
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Eingeladen um</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.items.map(b => {
                          const stCfg = STATUS_BADGES[b.status] || STATUS_BADGES.not_invited;
                          const StIcon = stCfg.icon;
                          return (
                            <tr key={b.id} className="hover:bg-white/60 transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{b.location_name || 'Unbekannt'}</div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="text-sm text-gray-600 flex items-center gap-1">
                                  <MapPin size={11} className="text-gray-400 shrink-0" /> {b.city || '--'}
                                </div>
                              </td>
                              <td className="px-4 py-2.5"><div className="text-sm text-gray-700">{b.contact_name || '--'}</div></td>
                              <td className="px-4 py-2.5">
                                <div className="text-xs text-gray-500 font-mono flex items-center gap-1">
                                  <Phone size={10} className="text-gray-400" /> {b.contact_phone || '--'}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${stCfg.color}`}>
                                  <StIcon size={10} /> {stCfg.label}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <Calendar size={11} className="text-gray-400 shrink-0" />
                                  <span className="text-xs text-gray-500 font-mono">{fmtDateDot(b.whatsapp_sent_at?.slice(0, 10))}</span>
                                  <span className="text-xs text-gray-400 font-mono">{fmtTime(b.whatsapp_sent_at)}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {historySearch && filteredGroups.length === 0 && (
        <div className="px-5 py-8 text-center text-gray-400">
          <Search size={20} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Keine Ergebnisse fuer &quot;{historySearch}&quot;</p>
        </div>
      )}
    </div>
  );
}


/* ── Main Component ── */
export default function InstallationInviteManager({ onNavigateToDetail, filterCity: filterCityProp, campaignSelection, onCampaignConsumed }) {
  const [acquisitionData, setAcquisitionData] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [installationstermine, setInstallationstermine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('');

  // Sync global city filter from parent
  useEffect(() => {
    if (filterCityProp !== undefined) setFilterCity(filterCityProp);
  }, [filterCityProp]);
  const [filterMountType, setFilterMountType] = useState('');
  const [filterContract, setFilterContract] = useState('');
  const [filterStatus, setFilterStatus] = useState('not_invited'); // 'not_invited', 'invited', 'booked', 'reschedule' (Nachterminierung), 'all'
  const [selected, setSelected] = useState(new Set());
  const [campaignBanner, setCampaignBanner] = useState(null); // { count, source }

  // Consume campaign selection from MapView
  useEffect(() => {
    if (campaignSelection && campaignSelection.ids && campaignSelection.ids.size > 0) {
      setSelected(new Set(campaignSelection.ids));
      setFilterStatus('all'); // Show all so selected items are visible
      setCampaignBanner({ count: campaignSelection.ids.size, source: campaignSelection.source });
      onCampaignConsumed?.();
    }
  }, [campaignSelection]); // eslint-disable-line react-hooks/exhaustive-deps
  const [detailStandort, setDetailStandort] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteProgress, setInviteProgress] = useState(null);
  const [toast, setToast] = useState(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(null); // null = loading
  const [waTemplates, setWaTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [allRoutes, setAllRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');

  // Load WhatsApp feature flag + templates
  useEffect(() => {
    fetch(INSTALL_API.FLAGS)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.flags?.superchat_enabled) {
          setWhatsappEnabled(data.flags.superchat_enabled.enabled);
        } else {
          setWhatsappEnabled(false);
        }
      })
      .catch(() => setWhatsappEnabled(false));

    // Load available WhatsApp templates from SuperChat
    fetch(INSTALL_API.TEMPLATES)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const templates = data?.templates || [];
        setWaTemplates(templates);
        if (templates.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(templates[0].id);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const [syncing, setSyncing] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local tz (CET)
      const [acqData, bookRes, terminData, routeRes, allRouteRes] = await Promise.all([
        fetchAllAcquisition(),
        fetch(INSTALL_API.BOOKINGS).then(r => r.json()).catch(() => []),
        fetchAllInstallationstermine().catch(() => []),
        fetch(`${INSTALL_API.SCHEDULE}?from=${today}&status=open`).then(r => r.json()).catch(() => []),
        fetch(INSTALL_API.SCHEDULE).then(r => r.json()).catch(() => []),
      ]);
      setAcquisitionData(acqData || []);
      setBookings(Array.isArray(bookRes) ? bookRes : []);
      setInstallationstermine(Array.isArray(terminData) ? terminData : []);
      setAvailableRoutes(Array.isArray(routeRes) ? routeRes : []);
      setAllRoutes(Array.isArray(allRouteRes) ? allRouteRes : []);
    } catch (e) {
      console.error('Failed to load data:', e);
      showToast('Daten konnten nicht geladen werden.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    await triggerSyncAndReload(loadData, showToast);
    setSyncing(false);
  }, [loadData, showToast]);

  // Booking lookup
  const bookingByAkquise = useMemo(() => {
    // Bei mehreren Bookings pro Standort: das mit dem "aktivsten" Status gewinnt
    // Priorität: confirmed/booked > pending > cancelled/no_show > completed
    const STATUS_PRIORITY = { confirmed: 1, booked: 1, pending: 2, cancelled: 3, no_show: 3, completed: 4 };
    const map = new Map();
    for (const b of bookings) {
      if (!b.akquise_airtable_id) continue;
      const existing = map.get(b.akquise_airtable_id);
      if (!existing) {
        map.set(b.akquise_airtable_id, b);
      } else {
        // Behalte das Booking mit höherer Priorität (niedrigere Zahl = wichtiger)
        const existPrio = STATUS_PRIORITY[existing.status] ?? 99;
        const newPrio = STATUS_PRIORITY[b.status] ?? 99;
        if (newPrio < existPrio) map.set(b.akquise_airtable_id, b);
      }
    }
    return map;
  }, [bookings]);

  // Enrich routes with booking counts for dropdown display
  const enrichedRoutes = useMemo(() => {
    return availableRoutes.map(route => {
      const routeBookings = bookings.filter(
        b => b.route_id === route.id && ['booked', 'confirmed', 'completed', 'pending'].includes(b.status)
      );
      const booked = routeBookings.length;
      const capacity = route.max_capacity || 4;
      const frei = Math.max(0, capacity - booked);
      return { ...route, booked, capacity, frei };
    }).filter(r => r.frei > 0) // Only show routes with available slots
      .sort((a, b) => a.schedule_date.localeCompare(b.schedule_date) || (a.city || '').localeCompare(b.city || ''));
  }, [availableRoutes, bookings]);

  // Build a Set of akquise IDs that have an "active" Airtable Installationstermin.
  // Active means any non-storniert termin. This prevents re-inviting standorte
  // that already had a termin (even if "Geplant" is in the past — the status may
  // just not have been updated to "Durchgeführt" yet in Airtable).
  // Only explicitly "Storniert" termine are excluded.
  const activeTerminIds = useMemo(() => {
    const set = new Set();
    for (const t of installationstermine) {
      const status = (t.terminstatus || '').toLowerCase();
      // Only skip explicitly cancelled termine
      if (status === 'storniert' || status === 'cancelled') continue;
      // Everything else counts as active (Durchgeführt, Geplant, etc.)
      for (const akqId of (t.akquiseLinks || [])) {
        set.add(akqId);
      }
    }
    return set;
  }, [installationstermine]);

  // Map akquiseId → latest termin for detecting failures (Nachterminierung)
  const terminByAkquise = useMemo(() => {
    const map = new Map();
    for (const t of installationstermine) {
      for (const akqId of (t.akquiseLinks || [])) {
        const existing = map.get(akqId);
        // Keep the most recent termin
        if (!existing || (t.createdAt && existing.createdAt && t.createdAt > existing.createdAt)) {
          map.set(akqId, t);
        }
      }
    }
    return map;
  }, [installationstermine]);

  // Predicates imported from src/metrics (isStorno, isAlreadyInstalled, isReadyForInstall)

  // Build set of acquisition IDs for fast lookup
  const acquisitionIds = useMemo(() => new Set(acquisitionData.map(a => a.id)), [acquisitionData]);

  // Bookings whose akquise_airtable_id is NOT in acquisitionData (missing due to pagination, sync gaps, etc.)
  // We create minimal pseudo-acquisition records so they still appear in the filtered list.
  // SAFETY: Only include bookings that are still active (pending/booked/confirmed) — skip completed/cancelled
  // and skip those with an active Airtable Installationstermin (they're already handled).
  const orphanBookingRecords = useMemo(() => {
    return bookings
      .filter(b => b.akquise_airtable_id && !acquisitionIds.has(b.akquise_airtable_id))
      .filter(b => ['pending', 'booked', 'confirmed'].includes(b.status)) // only active bookings
      .filter(b => !activeTerminIds.has(b.akquise_airtable_id)) // skip if Airtable termin exists
      .map(b => ({
        id: b.akquise_airtable_id,
        locationName: b.location_name || 'Unbekannt',
        city: b.city ? [b.city] : [],
        contactName: b.contact_name || '',
        contactPhone: b.contact_phone || '',
        contactEmail: '',
        jetId: b.jet_id || '',
        street: '',
        streetNumber: '',
        postalCode: '',
        leadStatus: 'Won / Signed',
        approvalStatus: 'Accepted',
        vertragVorhanden: 'YES',
        installationsStatus: [],
        displayLocationStatus: [],
        akquiseStorno: false,
        postInstallStorno: false,
        _isOrphanBooking: true, // marker for debugging
      }));
  }, [bookings, acquisitionIds, activeTerminIds]);

  // Filter records
  // A standort counts as "invited" if it has an install_bookings entry OR if Airtable Booking Status is set
  const readyStandorte = useMemo(() => {
    // Merge real acquisition data with orphan booking records
    const allRecords = [...acquisitionData, ...orphanBookingRecords];
    return allRecords.filter(a => {
      if (isStorno(a)) return false;
      if (isAlreadyInstalled(a)) return false;
      const booking = bookingByAkquise.get(a.id);
      const ready = isReadyForInstall(a);
      const hasBooking = !!booking;
      const hasActiveTermin = activeTerminIds.has(a.id);
      // Airtable Booking Status fallback — standort was invited/booked outside of install_bookings
      const atBookingStatus = a.bookingStatus;
      const hasAirtableInvite = !!atBookingStatus && !hasBooking;
      // A booking is "done" if status is completed — standort should not appear in invite flow
      const bookingCompleted = hasBooking && booking.status === 'completed';
      if (bookingCompleted) return false; // always hide completed bookings from entire invite view

      if (filterStatus === 'not_invited') {
        if (hasActiveTermin) return false;
        if (!ready) return false; // must be aufbaubereit (Won/Signed + Approved + Vertrag)
        // If booking exists with booked/confirmed status → they HAVE an appointment, not "not invited"
        if (hasBooking && (booking.status === 'booked' || booking.status === 'confirmed')) return false;
        if (!hasBooking && !hasAirtableInvite) return true; // no booking at all → not invited
        if (hasBooking && booking.status === 'pending' && !booking.whatsapp_sent_at) return true; // booking but no WA
        if (hasBooking && booking.status === 'invite_failed') return true; // WhatsApp fehlgeschlagen → erneut einladen
        return false;
      }
      if (filterStatus === 'invited') return (hasBooking && booking.status === 'pending' && !!booking.whatsapp_sent_at) || (hasAirtableInvite && atBookingStatus === 'invited');
      if (filterStatus === 'booked') return (hasBooking && (booking.status === 'booked' || booking.status === 'confirmed')) || (hasAirtableInvite && (atBookingStatus === 'confirmed' || atBookingStatus === 'booked'));
      if (filterStatus === 'reschedule') {
        // Standort already has an active booking → doesn't need reschedule
        if (hasBooking && (booking.status === 'booked' || booking.status === 'confirmed')) return false;
        if (hasBooking && booking.status === 'pending' && booking.whatsapp_sent_at) return false;
        // Nachterminierung: booking cancelled/no_show OR Airtable termin with failure status
        if (hasBooking && (booking.status === 'cancelled' || booking.status === 'no_show')) return true;
        // Check Airtable termin for failure states
        const termin = terminByAkquise.get(a.id);
        if (termin) {
          const ts = (termin.terminstatus || '').toLowerCase();
          const si = Array.isArray(termin.statusInstallation)
            ? termin.statusInstallation.join(' ').toLowerCase()
            : (termin.statusInstallation || '').toLowerCase();
          if (ts === 'verschoben' || ts === 'no-show' || ts === 'abgesagt') return true;
          if (si.includes('abgebrochen') || si.includes('fehlgeschlagen') || si.includes('nacharbeit') || si.includes('storniert')) return true;
        }
        // Check Akquise installationsStatus (from linked Installationen table)
        const instStatus = (a.installationsStatus || []).join(' ').toLowerCase();
        if (instStatus.includes('abgebrochen') || instStatus.includes('fehlgeschlagen')
          || instStatus.includes('nacharbeit') || instStatus.includes('storniert')) return true;
        return false;
      }
      return ready || hasBooking || hasAirtableInvite;
    });
  }, [acquisitionData, orphanBookingRecords, bookingByAkquise, activeTerminIds, filterStatus, terminByAkquise]);

  // Apply search + filters
  const filtered = useMemo(() => {
    let list = readyStandorte;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.locationName || '').toLowerCase().includes(q) ||
        (s.contactPerson || '').toLowerCase().includes(q) ||
        (s.jetId || '').toLowerCase().includes(q) ||
        (s.postalCode || '').includes(q) ||
        (s.street || '').toLowerCase().includes(q) ||
        (s.city || []).some(c => c.toLowerCase().includes(q))
      );
    }
    if (filterCity) list = list.filter(s => (s.city || []).includes(filterCity));
    if (filterMountType) list = list.filter(s => (s.mountType || '').toLowerCase().includes(filterMountType.toLowerCase()));
    if (filterContract === 'yes') list = list.filter(s => s.vertragVorhanden === 'true' || s.vertragVorhanden === true || s.vertragVorhanden === 'YES' || s.vertragVorhanden === 'checked');
    else if (filterContract === 'no') list = list.filter(s => !s.vertragVorhanden || s.vertragVorhanden === 'false' || s.vertragVorhanden === false);
    return list;
  }, [readyStandorte, search, filterCity, filterMountType, filterContract]);

  // Cities — derived from all eligible acquisition data (not just current tab) for consistent filtering
  const cities = useMemo(() => {
    const set = new Set();
    acquisitionData
      .filter(a => !isStorno(a) && !isAlreadyInstalled(a))
      .forEach(s => (s.city || []).forEach(c => set.add(c)));
    return [...set].sort();
  }, [acquisitionData]);

  // KPIs
  const kpis = useMemo(() => {
    const eligible = acquisitionData.filter(a => !isStorno(a) && !isAlreadyInstalled(a));
    // "Bereit (gesamt)" = all aufbaubereit, regardless of booking/termin status
    const totalReady = eligible.filter(a => isReadyForInstall(a)).length;
    // Count unique Standorte (by akquise_airtable_id) per status — not total bookings
    const uniqueByStatus = (statusFilter) => {
      const seen = new Set();
      for (const b of bookings) {
        if (statusFilter(b) && b.akquise_airtable_id) seen.add(b.akquise_airtable_id);
      }
      return seen.size;
    };
    // "Eingeladen" = WhatsApp was sent, status still pending
    let invited = uniqueByStatus(b => b.status === 'pending' && !!b.whatsapp_sent_at);
    // "Gebucht" = all bookings with an active appointment (booked or confirmed)
    let booked = uniqueByStatus(b => b.status === 'booked' || b.status === 'confirmed');
    // "Nachterminierung" = cancelled/no_show bookings + Airtable termin failures
    // IMPORTANT: exclude standorte that already have an active re-booking (booked/confirmed/invited)
    let needsReschedule = 0;
    const rescheduleFromBookings = new Set();
    // Count standorte where the BEST booking is cancelled/no_show (not ones that were re-booked)
    for (const [akquiseId, bestBooking] of bookingByAkquise.entries()) {
      if (bestBooking.status === 'cancelled' || bestBooking.status === 'no_show') {
        needsReschedule++;
        rescheduleFromBookings.add(akquiseId);
      }
    }
    // Also count Airtable termin failures not covered by booking status
    for (const a of eligible) {
      if (rescheduleFromBookings.has(a.id)) continue; // already counted
      // Skip if standort has an active booking (re-invited / re-booked)
      const bk = bookingByAkquise.get(a.id);
      if (bk && (bk.status === 'booked' || bk.status === 'confirmed')) continue;
      if (bk && bk.status === 'pending' && bk.whatsapp_sent_at) continue;
      const termin = terminByAkquise.get(a.id);
      if (termin) {
        const ts = (termin.terminstatus || '').toLowerCase();
        const si = Array.isArray(termin.statusInstallation)
          ? termin.statusInstallation.join(' ').toLowerCase()
          : (termin.statusInstallation || '').toLowerCase();
        if (ts === 'verschoben' || ts === 'no-show' || ts === 'abgesagt'
          || si.includes('abgebrochen') || si.includes('fehlgeschlagen')
          || si.includes('nacharbeit') || si.includes('storniert')) {
          needsReschedule++;
          continue; // already counted, skip installationsStatus check below
        }
      }
      // Also check Akquise installationsStatus (from linked Installationen table)
      const instStatus = (a.installationsStatus || []).join(' ').toLowerCase();
      if (instStatus.includes('abgebrochen') || instStatus.includes('fehlgeschlagen')
        || instStatus.includes('nacharbeit') || instStatus.includes('storniert')) {
        needsReschedule++;
      }
    }
    // Also count Airtable-only invites (no install_bookings entry but Airtable Booking Status set)
    let airtableOnlyInvited = 0;
    let airtableOnlyBooked = 0;
    for (const a of eligible) {
      if (a.bookingStatus && !bookingByAkquise.has(a.id) && !activeTerminIds.has(a.id)) {
        if (a.bookingStatus === 'invited') airtableOnlyInvited++;
        else if (a.bookingStatus === 'confirmed' || a.bookingStatus === 'booked') airtableOnlyBooked++;
      }
    }
    invited += airtableOnlyInvited;
    booked += airtableOnlyBooked;
    // "Nicht eingeladen" = aufbaubereit but NO WhatsApp sent yet
    // Includes: (a) no booking at all + (b) booking exists but whatsapp_sent_at is null + (c) invite_failed
    const notInvited = eligible.filter(a => {
      if (!isReadyForInstall(a)) return false;
      if (activeTerminIds.has(a.id)) return false;
      const bk = bookingByAkquise.get(a.id);
      if (!bk && !a.bookingStatus) return true; // no booking, no Airtable status → not invited
      if (bk && bk.status === 'pending' && !bk.whatsapp_sent_at) return true; // booking but no WA sent
      if (bk && bk.status === 'invite_failed') return true; // WhatsApp fehlgeschlagen → erneut einladen
      return false;
    }).length;
    const withoutPhone = eligible.filter(a =>
      isReadyForInstall(a) && !bookingByAkquise.has(a.id) && !activeTerminIds.has(a.id) && !a.bookingStatus && !a.contactPhone
    ).length;
    return { totalReady, notInvited, invited, booked, reschedule: needsReschedule, noPhone: withoutPhone };
  }, [acquisitionData, bookings, bookingByAkquise, activeTerminIds, terminByAkquise]);

  // Recently sent invites
  const recentInvites = useMemo(() => {
    return bookings
      .filter(b => b.whatsapp_sent_at)
      .sort((a, b) => new Date(b.whatsapp_sent_at) - new Date(a.whatsapp_sent_at))
      .slice(0, 10);
  }, [bookings]);

  // Selection
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.id)));
    }
  };

  // Select all in a city
  const selectAllInCity = (city) => {
    const cityItems = filtered.filter(s => (s.city || []).includes(city)).map(s => s.id);
    setSelected(prev => {
      const next = new Set(prev);
      cityItems.forEach(id => next.add(id));
      return next;
    });
  };

  // Send invites with progress — only approved+ready Standorte
  const sendInvites = async (standorte, routeId) => {
    // Safety: filter out any non-approved Standorte
    const approvedStandorte = standorte.filter(s => isReadyForInstall(s));
    if (approvedStandorte.length < standorte.length) {
      console.warn(`[sendInvites] Filtered out ${standorte.length - approvedStandorte.length} non-approved Standorte`);
    }
    if (approvedStandorte.length === 0) {
      showToast('Keine aufbaubereiten Standorte ausgewählt (Approval/Vertrag fehlt).', 'error');
      return;
    }

    // Duplikat-Prüfung: Standorte mit offenen Bookings herausfiltern
    const alreadyInvited = approvedStandorte.filter(s => {
      const b = bookingByAkquise.get(s.id);
      return b && ['pending', 'booked', 'confirmed'].includes(b.status);
    });
    const freshStandorte = approvedStandorte.filter(s => {
      const b = bookingByAkquise.get(s.id);
      return !b || !['pending', 'booked', 'confirmed'].includes(b.status);
    });
    if (alreadyInvited.length > 0 && freshStandorte.length === 0) {
      showToast(`Alle ${alreadyInvited.length} Standorte haben bereits offene Einladungen. Keine neuen Einladungen gesendet.`, 'error');
      return;
    }
    if (alreadyInvited.length > 0) {
      const skipNames = alreadyInvited.map(s => s.locationName).join(', ');
      showToast(`${alreadyInvited.length} bereits eingeladene Standorte übersprungen: ${skipNames}`, 'error');
    }
    // Verwende nur die frischen Standorte für den Versand
    const toSend = freshStandorte.length > 0 ? freshStandorte : approvedStandorte;

    setInviting(true);
    setInviteResult(null);
    setInviteProgress({ sent: 0, total: toSend.length, failed: 0, failedItems: [] });

    const currentUser = getCurrentUser();
    let successCount = 0;
    let failCount = 0;
    const failedItems = [];

    for (let i = 0; i < toSend.length; i++) {
      const s = toSend[i];
      try {
        const res = await fetch(INSTALL_API.INVITE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            akquiseAirtableId: s.id,
            contactPhone: s.contactPhone,
            contactName: s.contactPerson || '',
            locationName: s.locationName || '',
            city: (s.city || [])[0] || '',
            jetId: s.jetId || '',
            templateId: selectedTemplateId || undefined,
            routeId: routeId || undefined,
            created_by_user_id: currentUser?.id || null,
            created_by_user_name: currentUser?.name || null,
          }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.whatsappSent) {
            successCount++;
          } else if (data.whatsappSkipped) {
            // Booking created but WhatsApp disabled
            successCount++;
          } else {
            // Booking created but WhatsApp failed
            failCount++;
            failedItems.push(`${s.locationName || s.id} (WhatsApp: ${data.whatsappError || 'Senden fehlgeschlagen'})`);
          }
        } else if (res.status === 409) {
          // Duplikat — bereits eingeladen
          const errData = await res.json().catch(() => ({}));
          failCount++;
          failedItems.push(`${s.locationName || s.id} (bereits eingeladen)`);
          console.warn(`[sendInvites] Duplikat: ${s.locationName}`, errData.message);
        } else {
          failCount++;
          const errData = await res.json().catch(() => ({}));
          failedItems.push(`${s.locationName || s.id}${errData.message ? ` (${errData.message})` : ''}`);
        }
      } catch {
        failCount++;
        failedItems.push(s.locationName || s.id);
      }
      setInviteProgress({ sent: i + 1, total: toSend.length, failed: failCount, failedItems });
    }

    setInviting(false);
    setShowBatchModal(false);
    setSelected(new Set());
    setSelectedRouteId('');
    setInviteResult({ success: successCount, failed: failCount, failedItems });
    setInviteProgress(null);

    if (failCount === 0) {
      showToast(`${successCount} Einladung${successCount !== 1 ? 'en' : ''} erfolgreich gesendet.`);
    } else {
      showToast(`${successCount} gesendet, ${failCount} fehlgeschlagen.`, 'error');
    }

    loadData();
  };

  const selectedStandorte = filtered.filter(s => selected.has(s.id));

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 hover:bg-white/20 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Standorte einladen</h2>
          <p className="text-gray-500 mt-1">Installationsbereite Standorte per WhatsApp zur Terminbuchung einladen.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-medium shadow-sm transition-colors"
            >
              <Send size={16} />
              {selected.size} einladen
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading || syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl hover:bg-white/80 text-gray-700 text-sm transition-colors disabled:opacity-50"
          >
            {(loading || syncing) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Aktualisieren
          </button>
        </div>
      </div>

      {/* Invite Result Banner */}
      {inviteResult && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border animate-fade-in ${
          inviteResult.failed === 0
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          <div className="shrink-0 mt-0.5">
            {inviteResult.failed === 0 ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          </div>
          <div>
            <div className="font-medium">
              {inviteResult.success} Einladung{inviteResult.success !== 1 ? 'en' : ''} gesendet
              {inviteResult.failed > 0 && ` | ${inviteResult.failed} fehlgeschlagen`}
            </div>
            {inviteResult.failedItems?.length > 0 && (
              <div className="text-xs mt-1 opacity-80">
                Fehlgeschlagen: {inviteResult.failedItems.join(', ')}
              </div>
            )}
          </div>
          <button onClick={() => setInviteResult(null)} className="ml-auto shrink-0 p-0.5 hover:bg-black/5 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* WhatsApp Status Banner */}
      {whatsappEnabled === false && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <div>
            <span className="font-medium text-amber-800">WhatsApp ist deaktiviert.</span>{' '}
            <span className="text-amber-700">Einladungen werden erstellt, aber <strong>keine WhatsApp-Nachrichten</strong> gesendet. Aktiviere WhatsApp im Header-Toggle.</span>
          </div>
        </div>
      )}
      {whatsappEnabled === true && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-sm">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span className="text-green-800"><strong>WhatsApp aktiv</strong> — Einladungen werden per WhatsApp an Kunden gesendet.</span>
        </div>
      )}

      {/* Campaign Banner (when locations imported from MapView) */}
      {campaignBanner && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <MapIcon size={16} className="text-indigo-600" />
            </div>
            <div>
              <span className="font-semibold text-indigo-800">{campaignBanner.count} Standorte aus Karte uebernommen</span>
              <span className="text-indigo-600 ml-2">— Klicke &quot;Kampagne starten&quot; um Einladungen zu senden</span>
            </div>
          </div>
          <button
            onClick={() => { setCampaignBanner(null); setSelected(new Set()); }}
            className="p-1.5 hover:bg-indigo-100 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors"
            title="Auswahl aufheben"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Bereit (gesamt)', value: kpis.totalReady, color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Building, onClick: () => setFilterStatus('all') },
          { label: 'Nicht eingeladen', value: kpis.notInvited, color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Clock, onClick: () => setFilterStatus('not_invited') },
          { label: 'Eingeladen', value: kpis.invited, color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Send, onClick: () => setFilterStatus('invited') },
          { label: 'Termin gebucht', value: kpis.booked, color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle, onClick: () => setFilterStatus('booked') },
          { label: 'Nachterminierung', value: kpis.reschedule, color: 'text-orange-600', bgColor: 'bg-orange-100', icon: History, onClick: () => setFilterStatus('reschedule'), highlight: kpis.reschedule > 0 },
          { label: 'Ohne Telefon', value: kpis.noPhone, color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertTriangle, onClick: () => {} },
        ].map(k => {
          const Icon = k.icon;
          return (
            <button
              key={k.label}
              onClick={k.onClick}
              className={`backdrop-blur-xl rounded-2xl p-4 text-left hover:shadow-md transition-all ${
                k.highlight ? 'bg-orange-50/80 border-2 border-orange-300 ring-1 ring-orange-200' : 'bg-white/60 border border-slate-200/60 hover:bg-white/80'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.bgColor}`}>
                  <Icon size={16} className={k.color} />
                </div>
              </div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-gray-500 font-medium">{k.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { id: 'not_invited', label: 'Nicht eingeladen', count: kpis.notInvited },
            { id: 'invited', label: 'Eingeladen', count: kpis.invited },
            { id: 'booked', label: 'Termin gebucht', count: kpis.booked },
            { id: 'reschedule', label: 'Nachterminierung', count: kpis.reschedule, warn: kpis.reschedule > 0 },
            { id: 'all', label: 'Alle' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setFilterStatus(tab.id); setSelected(new Set()); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1 ${tab.warn ? 'text-orange-600 font-bold' : 'opacity-60'}`}>({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Stadt, PLZ, JET-ID..."
            className="w-full pl-10 pr-4 py-2 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 text-sm transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* City filter with "select all" */}
        <div className="flex items-center gap-1">
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
          >
            <option value="">Alle Staedte</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {filterCity && filterStatus === 'ready' && (
            <button
              onClick={() => selectAllInCity(filterCity)}
              className="px-2.5 py-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors whitespace-nowrap"
              title={`Alle in ${filterCity} auswaehlen`}
            >
              <CheckSquare size={14} />
            </button>
          )}
        </div>

        {/* Mount type filter */}
        <select
          value={filterMountType}
          onChange={(e) => setFilterMountType(e.target.value)}
          className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        >
          {MOUNT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* Contract filter */}
        <select
          value={filterContract}
          onChange={(e) => setFilterContract(e.target.value)}
          className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        >
          <option value="">Alle Vertraege</option>
          <option value="yes">Mit Vertrag</option>
          <option value="no">Ohne Vertrag</option>
        </select>
      </div>

      {/* Results count + Selection actions */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400 font-mono">
          {filtered.length} Standorte gefunden
          {selected.size > 0 && ` | ${selected.size} ausgewaehlt`}
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X size={12} /> Auswahl aufheben
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <Loader2 size={24} className="animate-spin text-orange-500" />
            <p className="text-sm">Standorte werden geladen...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Inbox size={32} className="text-gray-300" />
            </div>
            <div className="text-center">
              <p className="font-medium text-gray-600">Keine Standorte gefunden</p>
              <p className="text-xs text-gray-400 mt-1">
                {filterStatus === 'ready' ? 'Alle Standorte wurden bereits eingeladen.' : 'Versuche andere Filter.'}
              </p>
            </div>
            {filterStatus === 'ready' && (
              <button
                onClick={() => setFilterStatus('all')}
                className="px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
              >
                Alle Standorte anzeigen
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Standort</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stadt</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakt</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Montage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vertrag</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(s => {
                  const booking = bookingByAkquise.get(s.id);
                  const bookStatus = booking?.status || 'not_invited';
                  const hasPhone = !!s.contactPhone;
                  const isSelected = selected.has(s.id);

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-white/80 cursor-pointer transition-colors ${isSelected ? 'bg-orange-50/50' : ''}`}
                      onClick={() => setDetailStandort(s)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(s.id)}
                          className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailStandort(s); }}
                          className="text-left group"
                        >
                          <div className="font-medium text-gray-900 text-sm truncate max-w-[200px] group-hover:text-orange-600 transition-colors">{s.locationName || '--'}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {s.street} {s.streetNumber}{s.postalCode ? `, ${s.postalCode}` : ''}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-gray-700">
                          <MapPin size={13} className="text-gray-400 shrink-0" />
                          {(s.city || []).join(', ') || '--'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">{s.contactPerson || '--'}</div>
                        {s.contactPhone ? (
                          <div className="text-xs text-gray-400 flex items-center gap-1 font-mono">
                            <Phone size={10} /> {s.contactPhone}
                          </div>
                        ) : (
                          <div className="text-xs text-red-400 flex items-center gap-1">
                            <AlertCircle size={10} /> Keine Nummer
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {s.mountType || '--'}
                      </td>
                      <td className="px-4 py-3">
                        {(s.vertragVorhanden === 'true' || s.vertragVorhanden === true || s.vertragVorhanden === 'YES' || s.vertragVorhanden === 'yes' || s.vertragVorhanden === 'checked') ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium">
                            <CheckCircle size={10} /> Ja
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Nein</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={bookStatus} />
                        {booking?.whatsapp_sent_at && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {formatDateTime(booking.whatsapp_sent_at)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {bookStatus === 'not_invited' && hasPhone && (
                          <button
                            onClick={(e) => { e.stopPropagation(); sendInvites([s]); }}
                            disabled={inviting}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
                          >
                            {inviting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Einladen
                          </button>
                        )}
                        {bookStatus !== 'not_invited' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailStandort(s); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <Eye size={12} /> Details
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Invites Section */}
      {recentInvites.length > 0 && filterStatus !== 'ready' && (
        <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <History size={16} className="text-gray-400" /> Letzte Einladungen
          </h3>
          <div className="space-y-2">
            {recentInvites.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  b.status === 'booked' || b.status === 'confirmed' ? 'bg-green-500' :
                  b.status === 'pending' ? 'bg-yellow-500' :
                  b.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-400'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{b.location_name || 'Unbekannt'}</div>
                  <div className="text-xs text-gray-400">{b.city} | {b.contact_name}</div>
                </div>
                <StatusBadge status={b.status} />
                <span className="text-[10px] text-gray-400 font-mono shrink-0">
                  {formatDateTime(b.whatsapp_sent_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Einladungs-Historie */}
      <InvitationHistorySection bookings={bookings} routes={allRoutes} />

      {/* Detail Drawer — Unified */}
      {detailStandort && (
        <UnifiedStandortDetail
          standort={detailStandort}
          booking={bookingByAkquise.get(detailStandort.id)}
          rawBooking={bookingByAkquise.get(detailStandort.id)}
          onClose={() => setDetailStandort(null)}
          showInviteButton
          onInvite={(s) => sendInvites([s])}
          showWhatsApp
          showPhoneEdit
          onPhoneUpdate={async (bookingId, newPhone) => {
            try {
              const user = getCurrentUser();
              if (bookingId) {
                // Booking exists — update via booking endpoint (syncs Supabase + Airtable)
                const res = await fetch(`${INSTALL_API.BOOKINGS}/${bookingId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contact_phone: newPhone,
                    created_by_user_id: user?.id || null,
                    created_by_user_name: user?.name || null,
                  }),
                });
                if (!res.ok) throw new Error('Update fehlgeschlagen');
              }
              setToast({ message: 'Telefonnummer aktualisiert.', type: 'success' });
              loadData();
            } catch (err) {
              console.error('[InviteManager] Phone update failed:', err);
              setToast({ message: 'Telefonnummer konnte nicht aktualisiert werden.', type: 'error' });
              throw err;
            }
          }}
        />
      )}

      {/* Batch Invite Modal */}
      {showBatchModal && (
        <BatchInviteModal
          selectedStandorte={selectedStandorte}
          onConfirm={(standorte) => sendInvites(standorte, selectedRouteId)}
          onCancel={() => { setShowBatchModal(false); setSelectedRouteId(''); }}
          inviting={inviting}
          progress={inviteProgress}
          templates={waTemplates}
          selectedTemplate={selectedTemplateId}
          onTemplateChange={setSelectedTemplateId}
          routes={enrichedRoutes}
          selectedRouteId={selectedRouteId}
          onRouteChange={setSelectedRouteId}
        />
      )}
    </div>
  );
}
