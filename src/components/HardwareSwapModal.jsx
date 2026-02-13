import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Save, AlertCircle, Loader2, ArrowRightLeft, Cpu, Monitor, Wifi,
  Calendar, MessageSquare, Wrench, ChevronDown,
} from 'lucide-react';
import { createHardwareSwap, fetchAllOpsInventory } from '../utils/airtableService';

/* ──────────────────────── constants ──────────────────────── */

const SWAP_TYPE_OPTIONS = ['OPS', 'Display', 'SIM', 'Komplett-Set'];

const SWAP_REASON_OPTIONS = [
  { value: 'Defekt', label: 'Defekt', icon: '🔴' },
  { value: 'Upgrade', label: 'Upgrade', icon: '🔵' },
  { value: 'Kundenanfrage', label: 'Kundenanfrage', icon: '🟡' },
  { value: 'Sonstiges', label: 'Sonstiges', icon: '⚪' },
];

const SWAP_TYPE_ICONS = {
  OPS: Cpu,
  Display: Monitor,
  SIM: Wifi,
  'Komplett-Set': ArrowRightLeft,
};

/* ──────────────────────── component ──────────────────────── */

export default function HardwareSwapModal({
  isOpen,
  onClose,
  onSuccess,
  displayLocationId = null,
  locationName = '',
  city = '',
  currentHardware = null,   // { ops: [], sims: [], displays: [] }
}) {
  // Form state
  const [swapType, setSwapType] = useState([]);
  const [swapDate, setSwapDate] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [technician, setTechnician] = useState('');
  const [defectDescription, setDefectDescription] = useState('');
  const [selectedOldHardware, setSelectedOldHardware] = useState([]);
  const [selectedNewHardware, setSelectedNewHardware] = useState([]);
  const [errors, setErrors] = useState({});

  // Available hardware for "new" selection
  const [availableHardware, setAvailableHardware] = useState([]);
  const [hwLoading, setHwLoading] = useState(false);

  // Submit state
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const backdropRef = useRef(null);

  /* Reset form when modal opens */
  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split('T')[0];
      setSwapType([]);
      setSwapDate(today);
      setSwapReason('');
      setTechnician('');
      setDefectDescription('');
      setSelectedOldHardware([]);
      setSelectedNewHardware([]);
      setErrors({});
      setSubmitError(null);

      // Auto-select current hardware as "old"
      if (currentHardware?.ops?.length) {
        setSelectedOldHardware(currentHardware.ops.map(o => o.id).filter(Boolean));
      }

      // Load available hardware for swapping
      setHwLoading(true);
      fetchAllOpsInventory()
        .then((ops) => {
          // Filter to only warehouse/prep hardware (available for swap)
          const available = (ops || []).filter(o =>
            o.status === 'prep/ warehouse' || o.status === 'test device'
          );
          setAvailableHardware(available);
        })
        .catch(() => setAvailableHardware([]))
        .finally(() => setHwLoading(false));
    }
  }, [isOpen, currentHardware]);

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

  /* Toggle swap type */
  const toggleSwapType = (type) => {
    setSwapType(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  /* Validate */
  const validate = () => {
    const errs = {};
    if (!swapType.length) errs.swapType = 'Mindestens einen Tausch-Typ auswählen';
    if (!swapDate) errs.swapDate = 'Tausch-Datum erforderlich';
    if (!swapReason) errs.swapReason = 'Tausch-Grund auswählen';
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
      await createHardwareSwap({
        swapType,
        swapDate,
        swapReason,
        technician: technician || undefined,
        defectDescription: defectDescription || undefined,
        displayLocationId: displayLocationId || undefined,
        oldHardwareIds: selectedOldHardware.length ? selectedOldHardware : undefined,
        newHardwareIds: selectedNewHardware.length ? selectedNewHardware : undefined,
        status: 'Todo',
        locationName,
        city,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      setSubmitError(err.message || 'Fehler beim Erstellen des Tausch-Auftrags');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const oldOps = currentHardware?.ops || [];

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
      <div className="w-full max-w-lg bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-lg shadow-black/[0.08] animate-fade-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <ArrowRightLeft size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Hardware-Tausch</h2>
              {locationName && (
                <p className="text-xs text-slate-500">{locationName}{city ? `, ${city}` : ''}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100/80 transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* Tausch-Typ (multi-select chips) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">
                Tausch-Typ <span className="text-red-400">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SWAP_TYPE_OPTIONS.map((type) => {
                  const Icon = SWAP_TYPE_ICONS[type] || ArrowRightLeft;
                  const selected = swapType.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleSwapType(type)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selected
                          ? 'bg-amber-100 text-amber-700 border border-amber-300 shadow-sm'
                          : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Icon size={13} />
                      {type}
                    </button>
                  );
                })}
              </div>
              {errors.swapType && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.swapType}
                </p>
              )}
            </div>

            {/* Datum + Grund */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  <Calendar size={12} className="inline mr-1" />
                  Tausch-Datum <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={swapDate}
                  onChange={(e) => setSwapDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                />
                {errors.swapDate && (
                  <p className="text-xs text-red-500 mt-1">{errors.swapDate}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Tausch-Grund <span className="text-red-400">*</span>
                </label>
                <select
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                >
                  <option value="">Auswählen...</option>
                  {SWAP_REASON_OPTIONS.map(({ value, label, icon }) => (
                    <option key={value} value={value}>{icon} {label}</option>
                  ))}
                </select>
                {errors.swapReason && (
                  <p className="text-xs text-red-500 mt-1">{errors.swapReason}</p>
                )}
              </div>
            </div>

            {/* Aktuelle Hardware (old) */}
            {oldOps.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  Aktuelle Hardware am Standort
                </label>
                <div className="space-y-1.5">
                  {oldOps.map((ops) => (
                    <div
                      key={ops.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50/60 border border-red-100 text-xs"
                    >
                      <Cpu size={13} className="text-red-400" />
                      <span className="font-medium text-red-700">OPS {ops.opsNr}</span>
                      <span className="text-red-500">{ops.opsSn || '–'}</span>
                      {ops.displaySn && (
                        <>
                          <Monitor size={11} className="text-red-400 ml-2" />
                          <span className="text-red-500">{ops.displaySn}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Neue Hardware auswählen */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">
                Neue Hardware (Lager)
              </label>
              {hwLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <Loader2 size={14} className="animate-spin" />
                  Lade verfügbare Hardware...
                </div>
              ) : availableHardware.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">
                  Keine Hardware im Lager verfügbar
                </p>
              ) : (
                <select
                  value={selectedNewHardware[0] || ''}
                  onChange={(e) => setSelectedNewHardware(e.target.value ? [e.target.value] : [])}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                >
                  <option value="">Keine Zuweisung</option>
                  {availableHardware.map((hw) => (
                    <option key={hw.id} value={hw.id}>
                      OPS {hw.opsNr} — {hw.opsSn || 'ohne SN'} ({hw.status})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Techniker */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                <Wrench size={12} className="inline mr-1" />
                Techniker
              </label>
              <input
                type="text"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="Name des Technikers"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
              />
            </div>

            {/* Defekt-Beschreibung */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                <MessageSquare size={12} className="inline mr-1" />
                Defekt-Beschreibung / Bemerkung
              </label>
              <textarea
                value={defectDescription}
                onChange={(e) => setDefectDescription(e.target.value)}
                placeholder="z.B. Pixelfehler oben links, Bildschirm flackert..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 resize-none"
              />
            </div>

            {/* Error message */}
            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600">{submitError}</p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200/60">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100/80 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Erstelle...
              </>
            ) : (
              <>
                <Save size={14} />
                Tausch erstellen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
