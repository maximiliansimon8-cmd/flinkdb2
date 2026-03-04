import React, { useState, useMemo } from 'react';
import { X, Phone, Calendar, Clock, FileText, CheckCircle2 } from 'lucide-react';

/* ──────────────────────── time slots ──────────────────────── */

function generateTimeSlots() {
  const slots = [];
  for (let h = 9; h <= 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 17) {
      slots.push(`${String(h).padStart(2, '0')}:30`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/* ──────────────────────── component ──────────────────────── */

export default function StimmcheckModal({ isOpen, onClose, locationName, locationAddress, onSuccess }) {
  const [date, setDate] = useState(getTomorrow);
  const [time, setTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Reset form when opened
  const handleClose = () => {
    setDate(getTomorrow());
    setTime('10:00');
    setNotes('');
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = () => {
    const entry = {
      type: 'stimmcheck',
      locationName: locationName || '–',
      locationAddress: locationAddress || '–',
      scheduledDate: date,
      scheduledTime: time,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    console.log('[Stimmcheck] Termin erstellt:', entry);

    setSubmitted(true);

    if (onSuccess) {
      onSuccess(entry);
    }

    // Auto-close after showing success
    setTimeout(() => {
      handleClose();
    }, 1800);
  };

  const formattedDate = useMemo(() => {
    if (!date) return '';
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [date]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-primary rounded-2xl shadow-xl border border-border-secondary w-full max-w-sm mx-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Phone size={14} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Stimmcheck planen
              </h3>
              <p className="text-xs text-text-muted">Sentiment-Anruf terminieren</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors"
          >
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        {/* Success state */}
        {submitted ? (
          <div className="px-5 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={24} className="text-emerald-500" />
            </div>
            <div className="text-sm font-medium text-text-primary mb-1">Termin erstellt</div>
            <div className="text-xs text-text-muted">
              Stimmcheck am {formattedDate} um {time} Uhr
            </div>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Location info (read-only) */}
              <div className="bg-surface-secondary/80 rounded-lg p-3 border border-border-secondary">
                <div className="text-xs text-text-muted uppercase tracking-wider mb-1">Standort</div>
                <div className="text-sm font-medium text-text-primary truncate">
                  {locationName || '–'}
                </div>
                {locationAddress && (
                  <div className="text-xs text-text-muted mt-0.5 truncate">
                    {locationAddress}
                  </div>
                )}
              </div>

              {/* Date picker */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  <Calendar size={12} />
                  Datum
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 bg-surface-primary border border-border-secondary rounded-lg text-sm text-text-primary focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
                />
              </div>

              {/* Time dropdown */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  <Clock size={12} />
                  Uhrzeit
                </label>
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-primary border border-border-secondary rounded-lg text-sm text-text-primary focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot} Uhr
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                  <FileText size={12} />
                  Notizen
                  <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="z.B. Ansprechpartner, besondere Hinweise..."
                  rows={3}
                  className="w-full px-3 py-2 bg-surface-primary border border-border-secondary rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border-secondary flex items-center justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                disabled={!date || !time}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
              >
                <Phone size={12} />
                Termin erstellen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
