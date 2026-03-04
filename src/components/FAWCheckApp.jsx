/**
 * FAWCheckApp — Frequenzpruefung (FAW Check) Dashboard Tab
 *
 * Eingebettet im Haupt-Dashboard. Zugriff ueber User-Login mit Rolle grp_faw_pruefer.
 * Pruefer bewerten Passantenfrequenz, laden INDA-Daten hoch,
 * setzen Status auf Accepted / Rejected / Info required.
 *
 * KEIN Zugriff auf Kontaktdaten, E-Mails, Vertraege oder sensible interne Felder.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckCircle2, XCircle, Eye, ChevronLeft, Loader2, Search,
  Clock, Image, MapPin, Upload, FileSpreadsheet, MessageSquare,
  AlertTriangle, RefreshCw, Info,
} from 'lucide-react';
import { parseIndaExport, calculateDvacMetrics, heatColor, fmtNum, DAYS } from '../utils/indaParser';
import { supabase } from '../utils/authService';

const API_URL = '/api/faw-check';

// ─── Auth: get JWT session token for API calls ─────────────────────────────

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht eingeloggt');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}

// ─── API helper ─────────────────────────────────────────────────────────────

async function fawApiCall(body) {
  const headers = await getAuthHeaders();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API-Fehler');
  return data;
}

// ─── KPI Header ──────────────────────────────────────────────────────────────

function KPIHeader({ stats }) {
  const cards = [
    { label: 'Offen', value: stats.open, color: 'text-status-warning' },
    { label: 'Accepted', value: stats.accepted, color: 'text-status-online' },
    { label: 'Rejected', value: stats.rejected, color: 'text-status-offline' },
    { label: 'Info Required', value: stats.infoRequired, color: 'text-accent' },
  ];
  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className="bg-surface-primary rounded-lg border border-border-secondary p-3 text-center">
          <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-text-muted mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    'In review': { bg: 'bg-status-warning/10 text-amber-800', icon: Clock },
    'Accepted': { bg: 'bg-status-online/10 text-green-800', icon: CheckCircle2 },
    'Rejected': { bg: 'bg-status-offline/10 text-red-800', icon: XCircle },
    'Info required': { bg: 'bg-accent-light text-blue-800', icon: Info },
  };
  const c = config[status] || config['In review'];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`}>
      <Icon size={12} /> {status || 'In review'}
    </span>
  );
}

// ─── Photo Gallery ───────────────────────────────────────────────────────────

function PhotoGallery({ images }) {
  const [selectedIdx, setSelectedIdx] = useState(null);

  if (!images || images.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted">
        <Image size={20} className="mr-2" /> Keine Fotos vorhanden
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {images.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedIdx(idx)}
            className="relative aspect-square rounded-lg overflow-hidden border border-border-secondary hover:border-amber-400 transition-colors group"
          >
            <img
              src={img.url || img.thumbnails?.large?.url || img.thumbnails?.small?.url}
              alt={img.filename || `Foto ${idx + 1}`}
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

// ─── Heatmap Table ───────────────────────────────────────────────────────────

function HeatmapTable({ hourlyData, label }) {
  if (!hourlyData) return null;

  return (
    <div className="overflow-x-auto">
      <div className="text-xs font-medium text-text-muted mb-1">{label}</div>
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr>
            <th className="text-left py-0.5 px-1 text-text-muted font-medium w-8">h</th>
            {DAYS.map(d => (
              <th key={d} className="text-center py-0.5 px-0.5 text-text-muted font-medium">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 24 }, (_, h) => (
            <tr key={h}>
              <td className="text-right py-0.5 px-1 text-text-muted">{String(h).padStart(2, '0')}</td>
              {DAYS.map(day => {
                const val = hourlyData[day]?.[h] ?? 0;
                return (
                  <td key={day} className={`text-center py-0.5 px-0.5 ${heatColor(val, hourlyData)}`}>
                    {val > 0 ? fmtNum(val) : '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── DVAC Summary Cards ─────────────────────────────────────────────────────

function DvacSummary({ data }) {
  if (!data?.dvac_gesamt) return null;

  const gesamt = calculateDvacMetrics(data.dvac_gesamt, data.sov_factor || 6);

  return (
    <div className="space-y-3">
      {/* Weekly totals */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Gesamt', value: data.dvac_gesamt },
          { label: 'Kfz', value: data.dvac_kfz },
          { label: 'OEPNV', value: data.dvac_oepnv },
          { label: 'Fussgaenger', value: data.dvac_fussgaenger },
        ].map(c => (
          <div key={c.label} className="bg-surface-secondary rounded p-2 text-center">
            <div className="text-sm font-bold text-text-primary">{fmtNum(c.value)}</div>
            <div className="text-[10px] text-text-muted">{c.label} / Wo</div>
          </div>
        ))}
      </div>

      {/* Derived metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-status-warning/10 rounded p-2">
          <div className="text-sm font-bold text-amber-700">{fmtNum(gesamt.dvacTag)}</div>
          <div className="text-[10px] text-text-muted">dVAC / Tag</div>
        </div>
        <div className="bg-status-warning/10 rounded p-2">
          <div className="text-sm font-bold text-amber-700">{fmtNum(gesamt.impressionsWoche)}</div>
          <div className="text-[10px] text-text-muted">Imp. / Wo ({data.sov_factor || 6}x SOV)</div>
        </div>
        <div className="bg-status-warning/10 rounded p-2">
          <div className="text-sm font-bold text-amber-700">{fmtNum(gesamt.impressionsMonat)}</div>
          <div className="text-[10px] text-text-muted">Imp. / Monat</div>
        </div>
      </div>

      {/* Metadata */}
      {(data.schaltung || data.vac_id || data.gkz) && (
        <div className="flex gap-3 text-[10px] text-text-muted">
          {data.schaltung && <span>Schaltung: {data.schaltung}</span>}
          {data.vac_id && <span>VAC-ID: {data.vac_id}</span>}
          {data.gkz && <span>GKZ: {data.gkz}</span>}
          {data.inda_version && <span>INDA: {data.inda_version}</span>}
        </div>
      )}
    </div>
  );
}

// ─── INDA Upload Section ─────────────────────────────────────────────────────

function IndaUploadSection({ akquiseId, onSaved }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = useCallback(async (f) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setParsing(true);
    try {
      const result = await parseIndaExport(f);
      setParsed(result);
    } catch (err) {
      setError(err.message);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleSave = useCallback(async () => {
    if (!parsed) return;
    setSaving(true);
    setError(null);
    try {
      const data = await fawApiCall({
        action: 'save_faw_data',
        akquise_airtable_id: akquiseId,
        dvac_gesamt: parsed.dvacGesamt,
        dvac_kfz: parsed.dvacKfz,
        dvac_oepnv: parsed.dvacOepnv,
        dvac_fussgaenger: parsed.dvacFussgaenger,
        hourly_gesamt: parsed.hourlyGesamt,
        hourly_kfz: parsed.hourlyKfz,
        hourly_oepnv: parsed.hourlyOepnv,
        hourly_fussgaenger: parsed.hourlyFussgaenger,
        schaltung: parsed.schaltung,
        sov_factor: parsed.sovFactor,
        vac_id: parsed.vacId,
        gkz: parsed.gkz,
        inda_version: parsed.indaVersion,
        data_source: parsed.dataSource,
        notes: notes || null,
      });

      onSaved?.(data.faw_data);
      setFile(null);
      setParsed(null);
      setNotes('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [parsed, akquiseId, notes, onSaved]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <FileSpreadsheet size={16} /> INDA Excel Import
      </div>

      {/* Drop zone */}
      {!parsed && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border-primary hover:border-amber-400 rounded-lg p-6 text-center cursor-pointer transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {parsing ? (
            <div className="flex items-center justify-center gap-2 text-text-muted">
              <Loader2 size={20} className="animate-spin" /> Wird geparst...
            </div>
          ) : (
            <>
              <Upload size={24} className="mx-auto text-text-muted mb-2" />
              <p className="text-sm text-text-muted">INDA .xlsx Datei hierher ziehen oder klicken</p>
              <p className="text-[10px] text-text-muted mt-1">dVAC-Basis Export mit Gesamt / Kfz / OEPNV / Fussgaenger</p>
            </>
          )}
        </div>
      )}

      {/* Parsed preview */}
      {parsed && (
        <div className="bg-status-online/10 border border-status-online/20 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-green-800">
              <CheckCircle2 size={14} className="inline mr-1" />
              {file?.name} erfolgreich geparst
            </span>
            <button
              onClick={() => { setFile(null); setParsed(null); setError(null); }}
              className="text-xs text-text-muted hover:text-status-offline"
            >
              Verwerfen
            </button>
          </div>

          {/* Preview values */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Gesamt', value: parsed.dvacGesamt },
              { label: 'Kfz', value: parsed.dvacKfz },
              { label: 'OEPNV', value: parsed.dvacOepnv },
              { label: 'Fussgaenger', value: parsed.dvacFussgaenger },
            ].map(c => (
              <div key={c.label} className="text-center">
                <div className="text-sm font-bold text-text-primary">{fmtNum(c.value)}</div>
                <div className="text-[10px] text-text-muted">{c.label} / Wo</div>
              </div>
            ))}
          </div>

          {/* Heatmap preview (only Gesamt) */}
          {parsed.hourlyGesamt && (
            <HeatmapTable hourlyData={parsed.hourlyGesamt} label="dVAC Gesamt (Stundenverteilung)" />
          )}

          {/* Notes */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anmerkungen (optional)..."
            className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm resize-none"
            rows={2}
          />

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-status-warning hover:bg-amber-600 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {saving ? 'Wird gespeichert...' : 'FAW-Daten speichern'}
          </button>
        </div>
      )}

      {error && (
        <div className="bg-status-offline/10 border border-status-offline/20 text-red-700 text-sm rounded-lg p-3">
          <AlertTriangle size={14} className="inline mr-1" /> {error}
        </div>
      )}
    </div>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function DetailView({ standort, onBack, onStatusChanged }) {
  const [detail, setDetail] = useState(null);
  const [fawEntries, setFawEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('fotos');

  // Load detail on mount
  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      setLoading(true);
      setError(null);
      try {
        const data = await fawApiCall({
          action: 'load_detail',
          akquise_airtable_id: standort.airtable_id,
        });
        if (!cancelled) {
          setDetail(data.standort);
          setFawEntries(data.faw_entries || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDetail();
    return () => { cancelled = true; };
  }, [standort.airtable_id]);

  const handleSetStatus = useCallback(async (status) => {
    if ((status === 'Rejected' || status === 'Info required') && !comment.trim()) {
      setError('Kommentar ist erforderlich bei "Rejected" und "Info required"');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await fawApiCall({
        action: 'set_status',
        akquise_airtable_id: standort.airtable_id,
        status,
        comment: comment.trim() || null,
      });

      onStatusChanged?.(standort.airtable_id, status);
      onBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [standort.airtable_id, comment, onStatusChanged, onBack]);

  const handleFawSaved = useCallback((newEntry) => {
    setFawEntries(prev => [newEntry, ...prev]);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-status-warning" />
        <span className="ml-2 text-text-muted">Standort wird geladen...</span>
      </div>
    );
  }

  const images = detail?.images || [];
  const latestFaw = fawEntries[0] || null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-surface-secondary rounded-lg transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-text-primary truncate">{detail?.location_name || standort.location_name}</h2>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <MapPin size={14} />
            {detail?.street && <span>{detail.street},</span>}
            {detail?.postal_code && <span>{detail.postal_code}</span>}
            <span>{detail?.city || standort.city}</span>
          </div>
        </div>
        <StatusBadge status={detail?.frequency_approval || standort.frequency_approval} />
      </div>

      {/* Info bar */}
      {standort.jet_id && (
        <div className="text-xs text-text-muted">JET-ID: {standort.jet_id}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-secondary rounded-lg p-1">
        {[
          { id: 'fotos', label: 'Fotos', icon: Image },
          { id: 'faw', label: 'FAW-Daten', icon: FileSpreadsheet },
          { id: 'kommentar', label: 'Bewertung', icon: MessageSquare },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-surface-primary text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'fotos' && (
        <div className="bg-surface-primary border border-border-secondary rounded-lg p-4">
          <PhotoGallery images={images} />
        </div>
      )}

      {activeTab === 'faw' && (
        <div className="space-y-4">
          {/* Existing FAW data */}
          {latestFaw && (
            <div className="bg-surface-primary border border-border-secondary rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">Aktuelle FAW-Daten</span>
                <span className="text-[10px] text-text-muted">
                  {latestFaw.reviewer_name && `${latestFaw.reviewer_name} — `}
                  {latestFaw.created_at && new Date(latestFaw.created_at).toLocaleDateString('de-DE')}
                </span>
              </div>
              <DvacSummary data={latestFaw} />

              {/* Heatmaps */}
              {latestFaw.hourly_gesamt && (
                <HeatmapTable hourlyData={latestFaw.hourly_gesamt} label="dVAC Gesamt" />
              )}
              {latestFaw.hourly_fussgaenger && (
                <HeatmapTable hourlyData={latestFaw.hourly_fussgaenger} label="dVAC Fussgaenger" />
              )}

              {latestFaw.notes && (
                <div className="text-xs text-text-muted bg-surface-secondary rounded p-2">
                  <strong>Anmerkungen:</strong> {latestFaw.notes}
                </div>
              )}
            </div>
          )}

          {/* Upload new INDA data */}
          <div className="bg-surface-primary border border-border-secondary rounded-lg p-4">
            <IndaUploadSection
              akquiseId={standort.airtable_id}
              onSaved={handleFawSaved}
            />
          </div>

          {/* History */}
          {fawEntries.length > 1 && (
            <div className="bg-surface-primary border border-border-secondary rounded-lg p-4">
              <div className="text-sm font-medium text-text-primary mb-2">Fruehere Eintraege</div>
              <div className="space-y-2">
                {fawEntries.slice(1).map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-text-muted bg-surface-secondary rounded p-2">
                    <span>{entry.data_source || 'Manuell'} — dVAC: {fmtNum(entry.dvac_gesamt)}</span>
                    <span>
                      {entry.reviewer_name && `${entry.reviewer_name}, `}
                      {new Date(entry.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'kommentar' && (
        <div className="space-y-4">
          {/* Existing comment */}
          {detail?.frequency_approval_comment && (
            <div className="bg-surface-secondary border border-border-secondary rounded-lg p-3">
              <div className="text-xs text-text-muted mb-1">Bisheriger Kommentar</div>
              <p className="text-sm text-text-primary">{detail.frequency_approval_comment}</p>
            </div>
          )}

          {/* Comment input */}
          <div className="bg-surface-primary border border-border-secondary rounded-lg p-4">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Bewertungskommentar
              <span className="text-[10px] text-text-muted ml-1">(Pflicht bei Rejected / Info required)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Bewertung der Passantenfrequenz, Sichtbarkeit, Empfehlung..."
              className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none"
              rows={4}
            />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleSetStatus('Accepted')}
              disabled={submitting}
              className="bg-status-online hover:bg-status-online disabled:bg-gray-300 text-white py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Accepted
            </button>
            <button
              onClick={() => handleSetStatus('Info required')}
              disabled={submitting}
              className="bg-accent hover:bg-accent disabled:bg-gray-300 text-white py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Info size={16} />}
              Info required
            </button>
            <button
              onClick={() => handleSetStatus('Rejected')}
              disabled={submitting}
              className="bg-status-offline hover:bg-status-offline disabled:bg-gray-300 text-white py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
              Rejected
            </button>
          </div>

          {error && (
            <div className="bg-status-offline/10 border border-status-offline/20 text-red-700 text-sm rounded-lg p-3">
              <AlertTriangle size={14} className="inline mr-1" /> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── List View ───────────────────────────────────────────────────────────────

function ListView({ standorte, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return standorte;
    const q = search.toLowerCase();
    return standorte.filter(s =>
      (s.location_name || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.jet_id || '').toLowerCase().includes(q)
    );
  }, [standorte, search]);

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Standort, Stadt oder JET-ID suchen..."
          className="w-full pl-9 pr-4 py-2 border border-border-secondary rounded-lg text-sm focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none"
        />
      </div>

      {/* Count */}
      <div className="text-xs text-text-muted">
        {filtered.length} Standort{filtered.length !== 1 ? 'e' : ''} zur Pruefung
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {filtered.map(s => (
          <button
            key={s.airtable_id}
            onClick={() => onSelect(s)}
            className="w-full text-left bg-surface-primary border border-border-secondary hover:border-amber-300 rounded-lg p-3 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface-secondary flex-shrink-0">
                {s.images?.[0] ? (
                  <img
                    src={s.images[0].thumbnails?.small?.url || s.images[0].url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted">
                    <Image size={20} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-text-primary truncate text-sm">{s.location_name || 'Unbekannt'}</div>
                <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                  <MapPin size={11} /> {s.city || 'Unbekannt'}
                  {s.jet_id && <span className="text-text-muted ml-1">({s.jet_id})</span>}
                </div>
                {s.faw_data?.dvac_gesamt && (
                  <div className="text-[10px] text-status-warning mt-1">
                    dVAC: {fmtNum(s.faw_data.dvac_gesamt)} / Woche
                  </div>
                )}
              </div>

              {/* Status */}
              <StatusBadge status={s.frequency_approval} />
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-text-muted text-sm">
            {search ? 'Keine Treffer' : 'Keine Standorte zur Pruefung vorhanden'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component (Dashboard Tab) ─────────────────────────────────────────

export default function FAWCheckApp() {
  const [standorte, setStandorte] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Load standorte
  const loadStandorte = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fawApiCall({ action: 'load_standorte' });
      setStandorte(data.standorte || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStandorte(); }, [loadStandorte]);

  // Handle status change from detail view
  const handleStatusChanged = useCallback((airtableId, newStatus) => {
    setStandorte(prev => prev.map(s =>
      s.airtable_id === airtableId
        ? { ...s, frequency_approval: newStatus }
        : s
    ));
  }, []);

  // KPI stats
  const stats = useMemo(() => {
    const s = { open: 0, accepted: 0, rejected: 0, infoRequired: 0 };
    for (const st of standorte) {
      switch (st.frequency_approval) {
        case 'In review': s.open++; break;
        case 'Accepted': s.accepted++; break;
        case 'Rejected': s.rejected++; break;
        case 'Info required': s.infoRequired++; break;
        default: s.open++;
      }
    }
    return s;
  }, [standorte]);

  // ── Loading ──
  if (loading && standorte.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-status-warning" />
        <span className="ml-2 text-text-muted">Standorte werden geladen...</span>
      </div>
    );
  }

  // ── Error ──
  if (error && standorte.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <AlertTriangle size={32} className="mx-auto text-status-offline mb-3" />
          <p className="text-sm text-status-offline mb-3">{error}</p>
          <button
            onClick={loadStandorte}
            className="px-4 py-2 bg-status-warning hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} className="inline mr-1" /> Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-text-primary">Frequenzpruefung (FAW Check)</h2>
          <p className="text-xs text-text-muted">Standorte mit frequency_approval = "In review" bewerten</p>
        </div>
        <button
          onClick={loadStandorte}
          disabled={loading}
          className="p-2 text-text-muted hover:text-status-warning transition-colors"
          title="Aktualisieren"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {selected ? (
        <DetailView
          standort={selected}
          onBack={() => setSelected(null)}
          onStatusChanged={handleStatusChanged}
        />
      ) : (
        <>
          <KPIHeader stats={stats} />
          <ListView standorte={standorte} onSelect={setSelected} />
        </>
      )}
    </div>
  );
}
