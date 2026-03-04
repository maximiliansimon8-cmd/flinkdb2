import React, { useState, useEffect, useRef } from 'react';
import {
  X, Save, AlertCircle, Loader2, PackageX, Cpu, Monitor, Wifi,
  Calendar, MessageSquare, Wrench, CheckCircle2,
} from 'lucide-react';
import { createDeinstall } from '../utils/airtableService';

/* ──────────────────────── constants ──────────────────────── */

const REASON_OPTIONS = [
  { value: 'Kündigung', label: 'Kündigung', icon: '🔴', desc: 'Vertrag wurde gekündigt' },
  { value: 'Umbau', label: 'Umbau', icon: '🟡', desc: 'Standort wird umgebaut' },
  { value: 'Vertragsende', label: 'Vertragsende', icon: '🟠', desc: 'Vertrag läuft aus' },
  { value: 'Sonstiges', label: 'Sonstiges', icon: '⚪', desc: 'Anderer Grund' },
];

const CONDITION_OPTIONS = [
  { value: 'Einwandfrei', label: 'Einwandfrei', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'Beschädigt', label: 'Beschädigt', color: 'text-status-warning bg-status-warning/10 border-status-warning/20' },
  { value: 'Defekt', label: 'Defekt', color: 'text-status-offline bg-status-offline/10 border-status-offline/20' },
  { value: 'Prüfung nötig', label: 'Prüfung nötig', color: 'text-text-secondary bg-surface-secondary border-border-secondary' },
];

/* ──────────────────────── component ──────────────────────── */

export default function DeinstallModal({
  isOpen,
  onClose,
  onSuccess,
  displayLocationId = null,
  locationName = '',
  city = '',
  currentHardware = null,   // { ops: [], sims: [], displays: [] }
}) {
  // Form state
  const [deinstallDate, setDeinstallDate] = useState('');
  const [reason, setReason] = useState('');
  const [hardwareCondition, setHardwareCondition] = useState('');
  const [conditionDescription, setConditionDescription] = useState('');
  const [technician, setTechnician] = useState('');
  const [errors, setErrors] = useState({});

  // Submit state
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const backdropRef = useRef(null);

  /* Reset form when modal opens */
  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split('T')[0];
      setDeinstallDate(today);
      setReason('');
      setHardwareCondition('');
      setConditionDescription('');
      setTechnician('');
      setErrors({});
      setSubmitError(null);
    }
  }, [isOpen]);

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  /* Backdrop click */
  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  /* Validate */
  const validate = () => {
    const errs = {};
    if (!deinstallDate) errs.deinstallDate = 'Datum erforderlich';
    if (!reason) errs.reason = 'Grund auswählen';
    if (!hardwareCondition) errs.hardwareCondition = 'Zustand auswählen';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* Submit */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setSubmitError(null);

    try {
      const opsId = currentHardware?.ops?.[0]?.id || null;

      await createDeinstall({
        deinstallDate,
        reason,
        hardwareCondition,
        conditionDescription: [
          conditionDescription,
          technician ? `Techniker: ${technician}` : '',
        ].filter(Boolean).join('\n') || undefined,
        displayLocationId: displayLocationId || undefined,
        opsRecordId: opsId || undefined,
        status: 'Geplant',
        locationName,
        city,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'Fehler beim Erstellen des Deinstallations-Auftrags');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const ops = currentHardware?.ops || [];
  const sims = currentHardware?.sims || [];
  const displays = currentHardware?.displays || [];
  const hasHardware = ops.length > 0 || sims.length > 0 || displays.length > 0;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.25)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div className="w-full max-w-lg bg-surface-primary border border-white/60 rounded-2xl shadow-lg shadow-black/[0.08] animate-fade-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-status-offline/10 flex items-center justify-center">
              <PackageX size={18} className="text-status-offline" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Deinstallation</h2>
              {locationName && (
                <p className="text-xs text-text-muted">{locationName}{city ? `, ${city}` : ''}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary/80 transition-colors">
            <X size={18} className="text-text-muted" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* Hardware-Set am Standort */}
            {hasHardware && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  Hardware am Standort
                </label>
                <div className="space-y-1.5">
                  {ops.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary border border-border-secondary text-xs">
                      <Cpu size={13} className="text-text-muted" />
                      <span className="font-medium text-text-primary">OPS {o.opsNr}</span>
                      <span className="text-text-muted">{o.opsSn || '–'}</span>
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        o.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-secondary text-text-muted'
                      }`}>
                        {o.status || '–'}
                      </span>
                    </div>
                  ))}
                  {sims.map((s, i) => (
                    <div key={s.id || i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary border border-border-secondary text-xs">
                      <Wifi size={13} className="text-text-muted" />
                      <span className="font-medium text-text-primary">SIM</span>
                      <span className="text-text-muted font-mono">{s.simId || '–'}</span>
                    </div>
                  ))}
                  {displays.map((d, i) => (
                    <div key={d.id || i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-secondary border border-border-secondary text-xs">
                      <Monitor size={13} className="text-text-muted" />
                      <span className="font-medium text-text-primary">Display</span>
                      <span className="text-text-muted font-mono">{d.displaySerialNumber || '–'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Datum */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                <Calendar size={12} className="inline mr-1" />
                Deinstallationsdatum <span className="text-status-offline">*</span>
              </label>
              <input
                type="date"
                value={deinstallDate}
                onChange={(e) => setDeinstallDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary bg-surface-primary text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
              />
              {errors.deinstallDate && (
                <p className="text-xs text-status-offline mt-1">{errors.deinstallDate}</p>
              )}
            </div>

            {/* Grund */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Grund <span className="text-status-offline">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {REASON_OPTIONS.map(({ value, label, icon, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReason(value)}
                    className={`flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-all ${
                      reason === value
                        ? 'bg-status-offline/10 border-red-300 shadow-sm'
                        : 'bg-surface-primary/60 border-border-secondary hover:border-border-primary'
                    }`}
                  >
                    <span className="text-xs font-medium text-text-primary">
                      {icon} {label}
                    </span>
                    <span className="text-[10px] text-text-muted mt-0.5">{desc}</span>
                  </button>
                ))}
              </div>
              {errors.reason && (
                <p className="text-xs text-status-offline mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.reason}
                </p>
              )}
            </div>

            {/* Hardware-Zustand */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-2">
                Hardware-Zustand <span className="text-status-offline">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {CONDITION_OPTIONS.map(({ value, label, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHardwareCondition(value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      hardwareCondition === value
                        ? `${color} shadow-sm`
                        : 'bg-surface-primary/60 text-text-muted border-border-secondary hover:border-border-primary'
                    }`}
                  >
                    {hardwareCondition === value && <CheckCircle2 size={11} className="inline mr-1" />}
                    {label}
                  </button>
                ))}
              </div>
              {errors.hardwareCondition && (
                <p className="text-xs text-status-offline mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.hardwareCondition}
                </p>
              )}
            </div>

            {/* Techniker */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                <Wrench size={12} className="inline mr-1" />
                Techniker
              </label>
              <input
                type="text"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="Name des Technikers"
                className="w-full px-3 py-2 rounded-lg border border-border-secondary bg-surface-primary text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
              />
            </div>

            {/* Zustandsbeschreibung */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                <MessageSquare size={12} className="inline mr-1" />
                Zustandsbeschreibung / Bemerkungen
              </label>
              <textarea
                value={conditionDescription}
                onChange={(e) => setConditionDescription(e.target.value)}
                placeholder="z.B. Display einwandfrei, Gehäuse leicht verkratzt, alle Kabel vorhanden..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border-secondary bg-surface-primary text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none"
              />
            </div>

            {/* Error message */}
            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-status-offline/10 border border-red-100">
                <AlertCircle size={14} className="text-status-offline mt-0.5 shrink-0" />
                <p className="text-xs text-status-offline">{submitError}</p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-secondary">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-surface-secondary/80 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-status-offline hover:bg-status-offline text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Erstelle...
              </>
            ) : (
              <>
                <Save size={14} />
                Deinstallation erstellen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
