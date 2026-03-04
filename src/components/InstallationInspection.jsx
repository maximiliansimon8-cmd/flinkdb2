/**
 * InstallationInspection — Protokollpruefungs-Workbench
 *
 * Zeigt alle installierten Displays zur Sichtpruefung an.
 * Der Pruefer sichtet Installationsfotos und gibt pauschal frei
 * oder erstellt einen Nacharbeit-Task fuer e-Systems.
 *
 * Freigabe-Flow:
 *   1. "Freigabe Installation (Online Rate)" — automatisch via install-verification-background
 *   2. "Freigabe Installation (Installation Vorort)" — manuell hier
 *   3. Wenn beide true → "Freigabe CHG?" wird automatisch gesetzt
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Eye, ChevronLeft, Loader2, Filter,
  Clock, AlertTriangle, Image, MapPin, Search, ExternalLink,
  ClipboardCheck, Send as SendIcon, RefreshCw, Link2, Copy, Check,
  FileText, Download,
} from 'lucide-react';
import { supabase } from '../utils/authService';
import { resolveRecordImages } from '../utils/attachmentResolver';

const INSTALL_API = {
  INSPECTION: '/.netlify/functions/install-inspection',
  TOKEN: '/.netlify/functions/install-inspection-token',
};

const NACHARBEIT_CATEGORIES = [
  { id: 'montage', label: 'Montage', desc: 'Position, Schraeglage, Befestigung' },
  { id: 'verkabelung', label: 'Verkabelung', desc: 'Sichtbare Kabel, Stromversorgung' },
  { id: 'display', label: 'Display', desc: 'Sticker, Passpartout, Zustand' },
  { id: 'software', label: 'Software', desc: 'Navori, CMS-Zuordnung, Content' },
  { id: 'sonstiges', label: 'Sonstiges', desc: 'Andere Probleme' },
];

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

/* ── Photo Gallery ── */
function isPdf(photo) {
  const fn = (photo?.filename || '').toLowerCase();
  const url = (photo?.url || '').toLowerCase();
  return fn.endsWith('.pdf') || url.endsWith('.pdf');
}

function PhotoGallery({ photos, loading }) {
  const [selectedIdx, setSelectedIdx] = useState(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted">
        <Loader2 size={20} className="animate-spin mr-2" /> Fotos werden geladen...
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted">
        <Image size={20} className="mr-2" /> Keine Protokollfotos vorhanden
      </div>
    );
  }

  // Separate PDFs and images
  const pdfs = photos.filter(p => isPdf(p));
  const images = photos.filter(p => !isPdf(p));

  return (
    <>
      {/* PDF files — show as embedded viewer / download links */}
      {pdfs.length > 0 && (
        <div className="space-y-2 mb-3">
          {pdfs.map((pdf, idx) => {
            const url = pdf.url || '';
            return (
              <div key={`pdf-${idx}`} className="border border-border-secondary rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-surface-secondary border-b border-border-secondary">
                  <div className="flex items-center gap-2 text-sm text-text-primary">
                    <FileText size={16} className="text-status-offline" />
                    <span className="font-medium truncate max-w-[200px]">{pdf.filename || 'Protokoll.pdf'}</span>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-accent hover:text-blue-800 font-medium"
                  >
                    <ExternalLink size={12} /> In neuem Tab oeffnen
                  </a>
                </div>
                {url && (
                  <iframe
                    src={url}
                    title={pdf.filename || 'Installationsprotokoll'}
                    className="w-full border-0"
                    style={{ height: '500px' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image files — show as grid with lightbox */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((photo, idx) => (
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
      )}

      {selectedIdx !== null && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={() => setSelectedIdx(null)}
        >
          <img
            src={images[selectedIdx]?.url || images[selectedIdx]?.thumbnails?.large?.url}
            alt={images[selectedIdx]?.filename || 'Foto'}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <div className="absolute top-4 right-4 text-white text-sm bg-black/50 px-3 py-1 rounded">
            {selectedIdx + 1} / {images.length} — Klicken zum Schliessen
          </div>
        </div>
      )}
    </>
  );
}

/* ── Detail Panel ── */
function InspectionDetail({ installation, onFreigabe, onNacharbeit, onClose, actionLoading, relatedTasks }) {
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(true);

  // Resolve installation photos
  useEffect(() => {
    setPhotosLoading(true);
    const instId = installation.airtable_id || installation.id;

    // Collect all photo fields from installation
    const allPhotos = [];

    // Protocol PDF/images
    if (installation.protocol_url) {
      allPhotos.push({ url: installation.protocol_url, filename: installation.protocol_filename || 'Protokoll' });
    }

    // Try resolving from attachment cache
    resolveRecordImages(instId, allPhotos.length > 0 ? allPhotos : [{ url: '' }], 'Installationsprotokoll')
      .then(resolved => {
        if (resolved && resolved.length > 0 && resolved[0]?.url) {
          setPhotos(resolved);
        } else {
          setPhotos(allPhotos);
        }
      })
      .catch(() => setPhotos(allPhotos))
      .finally(() => setPhotosLoading(false));
  }, [installation]);

  const hasCompletedTask = relatedTasks.some(t => t.status === 'Completed');
  const hasOpenTask = relatedTasks.some(t => t.status !== 'Completed');

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
        {/* Standort Info */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-text-primary">{installation.location_name || 'Unbekannt'}</h3>
          <div className="flex items-center gap-1 text-sm text-text-muted mt-1">
            <MapPin size={14} />
            {[installation.street, installation.street_number, installation.postal_code, installation.city].filter(Boolean).join(' ')}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-muted">
            <span>JET-ID: <strong>{installation.jet_id || '—'}</strong></span>
            <span>Display: <strong>{(installation.display_ids || [])[0] || '—'}</strong></span>
            <span>Integrator: <strong>{installation.integrator || '—'}</strong></span>
            <span>Installiert: <strong>{installation.install_date || '—'}</strong></span>
            <span>Status: <strong>{installation.status || '—'}</strong></span>
          </div>
        </div>

        {/* Fotos */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1">
            <Image size={14} /> Installationsfotos
          </h4>
          <PhotoGallery photos={photos} loading={photosLoading} />
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

/* ── Main Component ── */
export default function InstallationInspection({ filterCity }) {
  const [installations, setInstallations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showNacharbeitDialog, setShowNacharbeitDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, approved, rework
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkForm, setLinkForm] = useState({ inspector: '', city: '', integrator: '' });
  const [generatedLink, setGeneratedLink] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Generate External Inspector Link ──
  const handleGenerateLink = useCallback(async () => {
    if (!linkForm.inspector.trim()) return;
    setLinkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(INSTALL_API.TOKEN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: 'generate',
          inspector: linkForm.inspector.trim(),
          city: linkForm.city.trim() || undefined,
          integrator: linkForm.integrator.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedLink(data);
      } else {
        alert(data.error || 'Fehler beim Erstellen des Links');
      }
    } catch (err) {
      console.error('[InstallationInspection] Link generation error:', err.message);
      alert('Netzwerkfehler — bitte erneut versuchen');
    } finally {
      setLinkLoading(false);
    }
  }, [linkForm]);

  const handleCopyLink = useCallback(() => {
    if (!generatedLink?.url) return;
    navigator.clipboard.writeText(generatedLink.url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [generatedLink]);

  // ── Load Data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch installations with status Installiert (incl. Nacharbeit notwendig)
      const { data: instData, error: instErr } = await supabase
        .from('installationen')
        .select('id,airtable_id,display_ids,install_date,status,installation_type,integrator,technicians,protocol_url,protocol_filename,screen_type,screen_size,ops_nr,remarks,partner_name,akquise_links,jet_id,location_name,city,street,street_number,postal_code,freigabe_online_rate,freigabe_installation_vorort,freigabe_chg,freigabe_datum_chg')
        .in('status', ['Installiert', 'Installiert - Nacharbeit notwendig'])
        .order('install_date', { ascending: false })
        .limit(500);

      if (instErr) console.error('[InstallationInspection] Install fetch error:', instErr.message);
      setInstallations(instData || []);

      // Fetch related tasks (Nacharbeit tasks)
      const { data: taskData, error: taskErr } = await supabase
        .from('tasks')
        .select('id,title,status,priority,created_time,description,installation_status')
        .ilike('title', '%Nacharbeit%')
        .order('created_time', { ascending: false })
        .limit(200);

      if (taskErr) console.error('[InstallationInspection] Task fetch error:', taskErr.message);
      setTasks(taskData || []);
    } catch (err) {
      console.error('[InstallationInspection] Load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter & Search ──
  const filtered = useMemo(() => {
    let result = installations;

    // City filter
    if (filterCity) {
      result = result.filter(i => (i.city || '') === filterCity);
    }

    // Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(i =>
        (i.location_name || '').toLowerCase().includes(lower) ||
        (i.city || '').toLowerCase().includes(lower) ||
        (i.jet_id || '').toLowerCase().includes(lower) ||
        ((i.display_ids || [])[0] || '').toLowerCase().includes(lower)
      );
    }

    // Status filter
    if (statusFilter === 'pending') {
      result = result.filter(i => !i.freigabe_installation_vorort);
    } else if (statusFilter === 'approved') {
      result = result.filter(i => i.freigabe_installation_vorort);
    } else if (statusFilter === 'rework') {
      result = result.filter(i => !i.freigabe_installation_vorort);
      // Only those with related Nacharbeit tasks
      const taskLocationNames = new Set(tasks.filter(t => t.status !== 'Completed').map(t => {
        const match = t.title?.match(/Nacharbeit:\s*(.+?)\s*—/);
        return match?.[1]?.trim();
      }).filter(Boolean));
      result = result.filter(i => taskLocationNames.has(i.location_name));
    }

    return result;
  }, [installations, filterCity, searchTerm, statusFilter, tasks]);

  // ── KPI Stats ──
  const stats = useMemo(() => {
    const base = filterCity
      ? installations.filter(i => (i.city || '') === filterCity)
      : installations;
    return {
      total: base.length,
      pending: base.filter(i => !i.freigabe_installation_vorort).length,
      approved: base.filter(i => i.freigabe_installation_vorort).length,
      rework: base.filter(i => !i.freigabe_installation_vorort && !i.freigabe_chg).length,
      chgReady: base.filter(i => i.freigabe_online_rate && i.freigabe_installation_vorort).length,
    };
  }, [installations, filterCity]);

  // ── Get related tasks for an installation ──
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
      const res = await fetch(INSTALL_API.INSPECTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_freigabe_vorort',
          installation_airtable_id: instId,
        }),
      });

      if (res.ok) {
        // Update local state
        setInstallations(prev => prev.map(i =>
          (i.airtable_id || i.id) === instId
            ? { ...i, freigabe_installation_vorort: true }
            : i
        ));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fehler beim Setzen der Freigabe');
      }
    } catch (err) {
      console.error('[InstallationInspection] Freigabe error:', err.message);
      alert('Netzwerkfehler — bitte erneut versuchen');
    } finally {
      setActionLoading(false);
    }
  }, []);

  // ── Nacharbeit Task Creation ──
  const handleNacharbeitSubmit = useCallback(async (category, description) => {
    const installation = installations.find(i => (i.airtable_id || i.id) === selectedId);
    if (!installation) return;

    setSubmitting(true);
    try {
      const catLabel = NACHARBEIT_CATEGORIES.find(c => c.id === category)?.label || category;
      const res = await fetch(INSTALL_API.INSPECTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_nacharbeit_task',
          installation_airtable_id: installation.airtable_id || installation.id,
          category: catLabel,
          description,
          location_name: installation.location_name,
          city: installation.city,
          display_id: (installation.display_ids || [])[0],
          integrator: installation.integrator,
          install_date: installation.install_date,
          akquise_airtable_id: (installation.akquise_links || [])[0],
        }),
      });

      if (res.ok) {
        setShowNacharbeitDialog(false);
        // Reload tasks
        loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Fehler beim Erstellen des Tasks');
      }
    } catch (err) {
      console.error('[InstallationInspection] Task creation error:', err.message);
      alert('Netzwerkfehler — bitte erneut versuchen');
    } finally {
      setSubmitting(false);
    }
  }, [installations, selectedId, loadData]);

  const selected = selectedId
    ? installations.find(i => (i.airtable_id || i.id) === selectedId)
    : null;

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Loader2 size={24} className="animate-spin mr-3" />
        Installationen werden geladen...
      </div>
    );
  }

  // Detail view
  if (selected) {
    return (
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
    );
  }

  // List view
  return (
    <div className="space-y-4">
      {/* KPI Header */}
      <KPIHeader stats={stats} />

      {/* Filters + Link Button */}
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-text-muted">{filtered.length} von {installations.length}</span>
          <button
            onClick={() => { setShowLinkDialog(true); setGeneratedLink(null); setLinkForm({ inspector: '', city: '', integrator: '' }); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-status-warning/10 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-200 transition-colors"
          >
            <Link2 size={12} />
            Prueferlink erstellen
          </button>
        </div>
      </div>

      {/* Link Generation Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-primary rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
              <Link2 size={18} /> Prueferlink erstellen
            </h3>

            {!generatedLink ? (
              <>
                <p className="text-sm text-text-secondary mb-4">
                  Erstellen Sie einen Link fuer einen externen Pruefer. Der Link ist 7 Tage gueltig.
                </p>

                <label className="block text-sm font-medium text-text-primary mb-1">Pruefer-Name *</label>
                <input
                  type="text"
                  value={linkForm.inspector}
                  onChange={e => setLinkForm(f => ({ ...f, inspector: e.target.value }))}
                  placeholder="z.B. Max Mustermann"
                  className="w-full p-2 border border-border-primary rounded-lg text-sm mb-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />

                <label className="block text-sm font-medium text-text-primary mb-1">Stadt-Filter (optional)</label>
                <input
                  type="text"
                  value={linkForm.city}
                  onChange={e => setLinkForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="z.B. Berlin"
                  className="w-full p-2 border border-border-primary rounded-lg text-sm mb-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />

                <label className="block text-sm font-medium text-text-primary mb-1">Integrator-Filter (optional)</label>
                <input
                  type="text"
                  value={linkForm.integrator}
                  onChange={e => setLinkForm(f => ({ ...f, integrator: e.target.value }))}
                  placeholder="z.B. e-Systems"
                  className="w-full p-2 border border-border-primary rounded-lg text-sm mb-4 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />

                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowLinkDialog(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
                    Abbrechen
                  </button>
                  <button
                    onClick={handleGenerateLink}
                    disabled={!linkForm.inspector.trim() || linkLoading}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {linkLoading ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Link erstellen
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-status-online/10 border border-status-online/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-2">
                    <CheckCircle2 size={16} /> Link erstellt
                  </div>
                  <p className="text-xs text-text-secondary mb-2">
                    Pruefer: <strong>{generatedLink.inspector}</strong> | Gueltig bis: <strong>{generatedLink.expires}</strong>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={generatedLink.url}
                      readOnly
                      className="flex-1 p-2 bg-surface-primary border border-border-primary rounded-lg text-xs truncate"
                    />
                    <button
                      onClick={handleCopyLink}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        linkCopied
                          ? 'bg-status-online text-white'
                          : 'bg-surface-secondary text-text-primary hover:bg-surface-tertiary'
                      }`}
                    >
                      {linkCopied ? <Check size={12} /> : <Copy size={12} />}
                      {linkCopied ? 'Kopiert!' : 'Kopieren'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => setShowLinkDialog(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
                    Schliessen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
  );
}
