/**
 * InspectionApp — Standalone external Protokollpruefung
 *
 * Eigenstaendige Mini-SPA fuer externe Pruefer.
 * Authentifizierung via HMAC-Token (URL-Parameter).
 * Reduzierter Funktionsumfang: Fotos pruefen, Freigabe erteilen, Nacharbeit-Task erstellen.
 * KEIN Zugriff auf Kontaktdaten, Adressen oder sensible Felder.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Eye, ChevronLeft, Loader2, Filter,
  Clock, Image, Search, ClipboardCheck, Send as SendIcon,
  RefreshCw, ShieldCheck, AlertTriangle, LogOut,
} from 'lucide-react';

const API_URL = '/.netlify/functions/install-inspection-token';

const NACHARBEIT_CATEGORIES = [
  { id: 'montage', label: 'Montage', desc: 'Position, Schraeglage, Befestigung' },
  { id: 'verkabelung', label: 'Verkabelung', desc: 'Sichtbare Kabel, Stromversorgung' },
  { id: 'display', label: 'Display', desc: 'Sticker, Passpartout, Zustand' },
  { id: 'software', label: 'Software', desc: 'Navori, CMS-Zuordnung, Content' },
  { id: 'sonstiges', label: 'Sonstiges', desc: 'Andere Probleme' },
];

/* ── Auth State from URL ── */
function getAuthFromURL() {
  const sp = new URLSearchParams(window.location.search);
  return {
    token: sp.get('token') || '',
    inspector: sp.get('inspector') || '',
    ts: sp.get('ts') || '',
    city: sp.get('city') || '',
    integrator: sp.get('integrator') || '',
  };
}

/* ── Status Badge ── */
function FreigabeBadge({ label, value }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      value ? 'bg-status-online/10 text-green-800' : 'bg-surface-secondary text-text-muted'
    }`}>
      {value ? <CheckCircle2 size={12} /> : <Clock size={12} />}
      {label}
    </span>
  );
}

/* ── KPI Cards ── */
function KPIHeader({ stats }) {
  const cards = [
    { label: 'Gesamt', value: stats.total, color: 'text-text-primary' },
    { label: 'Noch offen', value: stats.pending, color: 'text-status-warning' },
    { label: 'Freigegeben', value: stats.approved, color: 'text-status-online' },
    { label: 'Nacharbeit', value: stats.rework, color: 'text-status-offline' },
    { label: 'CHG bereit', value: stats.chgReady, color: 'text-accent' },
  ];
  return (
    <div className="grid grid-cols-5 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className="bg-surface-primary rounded-lg border border-border-secondary p-3 text-center">
          <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-text-muted mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Photo Gallery ── */
function PhotoGallery({ photos }) {
  const [selectedIdx, setSelectedIdx] = useState(null);

  if (!photos || photos.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted">
        <Image size={20} className="mr-2" /> Keine Protokollfotos vorhanden
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedIdx(idx)}
            className="relative aspect-square rounded-lg overflow-hidden border border-border-secondary hover:border-orange-400 transition-colors group"
          >
            <img
              src={photo.url || photo.thumbnails?.large?.url || photo.thumbnails?.small?.url}
              alt={photo.filename || `Foto ${idx + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Eye size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>

      {selectedIdx !== null && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={() => setSelectedIdx(null)}
        >
          <img
            src={photos[selectedIdx]?.url || photos[selectedIdx]?.thumbnails?.large?.url}
            alt={photos[selectedIdx]?.filename || 'Foto'}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <div className="absolute top-4 right-4 text-white text-sm bg-black/50 px-3 py-1 rounded">
            {selectedIdx + 1} / {photos.length} — Klicken zum Schliessen
          </div>
        </div>
      )}
    </>
  );
}

/* ── Nacharbeit Task Dialog ── */
function NacharbeitDialog({ installation, onSubmit, onClose, submitting }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-primary rounded-xl shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-bold text-text-primary mb-4">Nacharbeit-Task erstellen</h3>
        <p className="text-sm text-text-secondary mb-4">
          {installation.location_name || 'Unbekannt'} — {installation.city || ''}
        </p>

        <label className="block text-sm font-medium text-text-primary mb-1">Kategorie</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {NACHARBEIT_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`text-left p-2 rounded-lg border text-sm transition-colors ${
                category === cat.id
                  ? 'border-orange-500 bg-status-warning/10 text-orange-800'
                  : 'border-border-secondary hover:border-border-primary text-text-primary'
              }`}
            >
              <div className="font-medium">{cat.label}</div>
              <div className="text-xs text-text-muted">{cat.desc}</div>
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-text-primary mb-1">Beschreibung</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Was genau ist das Problem?"
          className="w-full p-3 border border-border-primary rounded-lg text-sm resize-none h-24 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Abbrechen
          </button>
          <button
            onClick={() => onSubmit(category, description)}
            disabled={!category || !description.trim() || submitting}
            className="px-4 py-2 bg-status-offline text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <SendIcon size={14} />}
            Task erstellen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Detail Panel ── */
function InspectionDetail({ installation, onFreigabe, onNacharbeit, onClose, actionLoading, relatedTasks }) {
  const hasCompletedTask = relatedTasks.some(t => t.status === 'Completed');
  const hasOpenTask = relatedTasks.some(t => t.status !== 'Completed');

  // Build photo list from protocol URL
  const photos = useMemo(() => {
    const result = [];
    if (installation.protocol_url) {
      result.push({ url: installation.protocol_url, filename: installation.protocol_filename || 'Protokoll' });
    }
    return result;
  }, [installation]);

  return (
    <div className="bg-surface-primary rounded-xl border border-border-secondary shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-surface-secondary">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
          <ChevronLeft size={16} /> Zurueck
        </button>
        <div className="flex items-center gap-2">
          <FreigabeBadge label="Online Rate" value={installation.freigabe_online_rate} />
          <FreigabeBadge label="Vorort" value={installation.freigabe_installation_vorort} />
          <FreigabeBadge label="CHG" value={installation.freigabe_chg} />
        </div>
      </div>

      <div className="p-4">
        {/* Standort Info (reduced — no full address for external) */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-text-primary">{installation.location_name || 'Unbekannt'}</h3>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-muted">
            <span>Stadt: <strong>{installation.city || '—'}</strong></span>
            <span>JET-ID: <strong>{installation.jet_id || '—'}</strong></span>
            <span>Display: <strong>{(installation.display_ids || [])[0] || '—'}</strong></span>
            <span>Integrator: <strong>{installation.integrator || '—'}</strong></span>
            <span>Installiert: <strong>{installation.install_date || '—'}</strong></span>
            <span>Typ: <strong>{installation.screen_type || '—'} {installation.screen_size || ''}</strong></span>
          </div>
        </div>

        {/* Fotos */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1">
            <Image size={14} /> Installationsfotos
          </h4>
          <PhotoGallery photos={photos} />
        </div>

        {/* Related Tasks (Feedback Loop) */}
        {relatedTasks.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-text-primary mb-2">Nacharbeit-Tasks</h4>
            <div className="space-y-2">
              {relatedTasks.map(task => (
                <div key={task.id} className={`p-3 rounded-lg border text-sm ${
                  task.status === 'Completed'
                    ? 'bg-status-online/10 border-status-online/20'
                    : 'bg-status-warning/10 border-status-warning/20'
                }`}>
                  <div className="font-medium">{task.title}</div>
                  <div className="text-xs text-text-muted mt-1">
                    Status: {task.status} | Prioritaet: {task.priority} | Erstellt: {task.created_time ? new Date(task.created_time).toLocaleDateString('de-DE') : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          {!installation.freigabe_installation_vorort && (
            <>
              <button
                onClick={onFreigabe}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-status-online text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Freigabe erteilen
              </button>
              <button
                onClick={onNacharbeit}
                disabled={actionLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-status-offline/10 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50 transition-colors"
              >
                <XCircle size={16} />
                Nacharbeit erforderlich
              </button>
            </>
          )}
          {installation.freigabe_installation_vorort && hasCompletedTask && (
            <button
              onClick={onFreigabe}
              disabled={actionLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={16} />
              Nachpruefung abgeschlossen
            </button>
          )}
          {installation.freigabe_installation_vorort && !hasOpenTask && (
            <div className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-status-online/10 text-green-700 rounded-lg text-sm font-medium">
              <CheckCircle2 size={16} />
              Vorort-Freigabe erteilt
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Auth Error Screen ── */
function AuthError({ message }) {
  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-4">
      <div className="bg-surface-primary rounded-xl shadow-lg max-w-md w-full p-8 text-center">
        <AlertTriangle size={48} className="mx-auto text-status-warning mb-4" />
        <h1 className="text-xl font-bold text-text-primary mb-2">Zugriff nicht moeglich</h1>
        <p className="text-sm text-text-secondary mb-6">{message}</p>
        <p className="text-xs text-text-muted">
          Bitte fordern Sie einen neuen Prueferlink vom Dashboard-Administrator an.
        </p>
      </div>
    </div>
  );
}

/* ── Loading Screen ── */
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-status-warning mx-auto mb-4" />
        <p className="text-sm text-text-muted">Pruefungsdaten werden geladen...</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   ██  Main Component
   ══════════════════════════════════════════════════════════════════════ */
export default function InspectionApp() {
  const [auth] = useState(getAuthFromURL);
  const [authStatus, setAuthStatus] = useState('loading'); // loading, valid, invalid
  const [installations, setInstallations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showNacharbeitDialog, setShowNacharbeitDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [errorMsg, setErrorMsg] = useState('');

  // ── API Call Helper ──
  const apiCall = useCallback(async (action, extra = {}) => {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        token: auth.token,
        inspector: auth.inspector,
        ts: auth.ts,
        ...extra,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API Error ${res.status}`);
    return data;
  }, [auth]);

  // ── Load Data ──
  const loadData = useCallback(async () => {
    try {
      const data = await apiCall('load_installations', {
        city: auth.city || undefined,
        integrator: auth.integrator || undefined,
      });
      setInstallations(data.installations || []);
      setTasks(data.tasks || []);
      setAuthStatus('valid');
    } catch (err) {
      console.error('[InspectionApp] Load error:', err.message);
      setErrorMsg(err.message);
      setAuthStatus('invalid');
    }
  }, [apiCall, auth]);

  useEffect(() => {
    // Check if we have token params
    if (!auth.token || !auth.inspector || !auth.ts) {
      setErrorMsg('Fehlende Token-Parameter in der URL. Bitte verwenden Sie den vollstaendigen Prueferlink.');
      setAuthStatus('invalid');
      return;
    }
    loadData();
  }, [auth, loadData]);

  // ── Filter & Search ──
  const filtered = useMemo(() => {
    let result = installations;

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(i =>
        (i.location_name || '').toLowerCase().includes(lower) ||
        (i.city || '').toLowerCase().includes(lower) ||
        (i.jet_id || '').toLowerCase().includes(lower) ||
        ((i.display_ids || [])[0] || '').toLowerCase().includes(lower)
      );
    }

    if (statusFilter === 'pending') {
      result = result.filter(i => !i.freigabe_installation_vorort);
    } else if (statusFilter === 'approved') {
      result = result.filter(i => i.freigabe_installation_vorort);
    } else if (statusFilter === 'rework') {
      result = result.filter(i => !i.freigabe_installation_vorort);
      const taskLocationNames = new Set(tasks.filter(t => t.status !== 'Completed').map(t => {
        const match = t.title?.match(/Nacharbeit:\s*(.+?)\s*—/);
        return match?.[1]?.trim();
      }).filter(Boolean));
      result = result.filter(i => taskLocationNames.has(i.location_name));
    }

    return result;
  }, [installations, searchTerm, statusFilter, tasks]);

  // ── KPI Stats ──
  const stats = useMemo(() => ({
    total: installations.length,
    pending: installations.filter(i => !i.freigabe_installation_vorort).length,
    approved: installations.filter(i => i.freigabe_installation_vorort).length,
    rework: installations.filter(i => !i.freigabe_installation_vorort && !i.freigabe_chg).length,
    chgReady: installations.filter(i => i.freigabe_online_rate && i.freigabe_installation_vorort).length,
  }), [installations]);

  // ── Get related tasks ──
  const getRelatedTasks = useCallback((installation) => {
    const locName = installation.location_name;
    if (!locName) return [];
    return tasks.filter(t => t.title?.includes(locName));
  }, [tasks]);

  // ── Freigabe Action ──
  const handleFreigabe = useCallback(async (installation) => {
    setActionLoading(true);
    try {
      const instId = installation.airtable_id || installation.id;
      await apiCall('set_freigabe_vorort', { installation_airtable_id: instId });
      setInstallations(prev => prev.map(i =>
        (i.airtable_id || i.id) === instId
          ? { ...i, freigabe_installation_vorort: true }
          : i
      ));
    } catch (err) {
      console.error('[InspectionApp] Freigabe error:', err.message);
      alert(err.message || 'Fehler beim Setzen der Freigabe');
    } finally {
      setActionLoading(false);
    }
  }, [apiCall]);

  // ── Nacharbeit Task ──
  const handleNacharbeitSubmit = useCallback(async (category, description) => {
    const installation = installations.find(i => (i.airtable_id || i.id) === selectedId);
    if (!installation) return;

    setSubmitting(true);
    try {
      const catLabel = NACHARBEIT_CATEGORIES.find(c => c.id === category)?.label || category;
      await apiCall('create_nacharbeit_task', {
        installation_airtable_id: installation.airtable_id || installation.id,
        category: catLabel,
        description,
        location_name: installation.location_name,
        city: installation.city,
        display_id: (installation.display_ids || [])[0],
        integrator: installation.integrator,
        install_date: installation.install_date,
        akquise_airtable_id: (installation.akquise_links || [])[0],
      });
      setShowNacharbeitDialog(false);
      loadData();
    } catch (err) {
      console.error('[InspectionApp] Task error:', err.message);
      alert(err.message || 'Fehler beim Erstellen des Tasks');
    } finally {
      setSubmitting(false);
    }
  }, [apiCall, installations, selectedId, loadData]);

  // ── Render: Auth States ──
  if (authStatus === 'loading') return <LoadingScreen />;
  if (authStatus === 'invalid') return <AuthError message={errorMsg} />;

  const selected = selectedId
    ? installations.find(i => (i.airtable_id || i.id) === selectedId)
    : null;

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Top Bar */}
      <div className="bg-surface-primary border-b border-border-secondary px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-status-warning" />
          <div>
            <h1 className="text-sm font-bold text-text-primary">JET Protokollpruefung</h1>
            <p className="text-xs text-text-muted">
              Pruefer: {auth.inspector}
              {auth.city && <> | Stadt: {auth.city}</>}
              {auth.integrator && <> | Integrator: {auth.integrator}</>}
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-muted hover:text-text-primary bg-surface-secondary rounded-lg hover:bg-surface-tertiary transition-colors"
        >
          <RefreshCw size={12} />
          Aktualisieren
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {/* Detail View */}
        {selected ? (
          <>
            <InspectionDetail
              installation={selected}
              onFreigabe={() => handleFreigabe(selected)}
              onNacharbeit={() => setShowNacharbeitDialog(true)}
              onClose={() => { setSelectedId(null); setShowNacharbeitDialog(false); }}
              actionLoading={actionLoading}
              relatedTasks={getRelatedTasks(selected)}
            />
            {showNacharbeitDialog && (
              <NacharbeitDialog
                installation={selected}
                onSubmit={handleNacharbeitSubmit}
                onClose={() => setShowNacharbeitDialog(false)}
                submitting={submitting}
              />
            )}
          </>
        ) : (
          /* List View */
          <div className="space-y-4">
            <KPIHeader stats={stats} />

            {/* Filters */}
            <div className="flex items-center gap-3 bg-surface-primary rounded-lg border border-border-secondary p-3">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Standort, Stadt, JET-ID..."
                  className="w-full pl-9 pr-3 py-2 border border-border-primary rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-1">
                <Filter size={14} className="text-text-muted" />
                {[
                  { id: 'all', label: 'Alle' },
                  { id: 'pending', label: 'Offen' },
                  { id: 'approved', label: 'Freigegeben' },
                  { id: 'rework', label: 'Nacharbeit' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      statusFilter === f.id
                        ? 'bg-status-warning/10 text-orange-800'
                        : 'text-text-muted hover:bg-surface-secondary'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto text-xs text-text-muted">
                {filtered.length} von {installations.length}
              </div>
            </div>

            {/* Installation List */}
            <div className="space-y-2">
              {filtered.length === 0 && (
                <div className="text-center py-12 text-text-muted">
                  <ClipboardCheck size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Keine Installationen gefunden</p>
                </div>
              )}
              {filtered.map(inst => {
                const relTasks = getRelatedTasks(inst);
                const hasOpenTask = relTasks.some(t => t.status !== 'Completed');
                const hasCompletedTask = relTasks.some(t => t.status === 'Completed');

                return (
                  <button
                    key={inst.id}
                    onClick={() => setSelectedId(inst.airtable_id || inst.id)}
                    className="w-full text-left bg-surface-primary rounded-lg border border-border-secondary p-4 hover:border-orange-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary truncate">
                            {inst.location_name || 'Unbekannt'}
                          </span>
                          {hasOpenTask && (
                            <span className="px-1.5 py-0.5 bg-status-warning/10 text-amber-700 rounded text-[10px] font-medium">
                              Nacharbeit offen
                            </span>
                          )}
                          {hasCompletedTask && !inst.freigabe_installation_vorort && (
                            <span className="px-1.5 py-0.5 bg-accent-light text-blue-700 rounded text-[10px] font-medium">
                              Nachpruefung noetig
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                          <span>{inst.city || '—'}</span>
                          <span>{inst.jet_id || '—'}</span>
                          <span>{inst.install_date || '—'}</span>
                          <span>{inst.integrator || '—'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <FreigabeBadge label="Online" value={inst.freigabe_online_rate} />
                        <FreigabeBadge label="Vorort" value={inst.freigabe_installation_vorort} />
                        {inst.freigabe_online_rate && inst.freigabe_installation_vorort && (
                          <FreigabeBadge label="CHG" value={inst.freigabe_chg} />
                        )}
                        <ChevronLeft size={16} className="text-text-muted rotate-180 group-hover:text-orange-400 transition-colors" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
