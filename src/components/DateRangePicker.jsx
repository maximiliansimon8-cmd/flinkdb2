import React from 'react';
import { Calendar } from 'lucide-react';

const PRESETS = [
  { label: '7T', days: 7 },
  { label: '14T', days: 14 },
  { label: '30T', days: 30 },
  { label: '60T', days: 60 },
  { label: '90T', days: 90 },
  { label: '180T', days: 180 },
  { label: '365T', days: 365 },
];

function toInputValue(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromInputValue(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DateRangePicker({
  rangeStart,
  rangeEnd,
  dataEarliest,
  dataLatest,
  onRangeChange,
}) {
  const activePreset = PRESETS.find((p) => {
    if (p.days === null) return !rangeStart && !rangeEnd;
    if (!rangeStart || !dataLatest) return false;
    const expected = new Date(dataLatest.getTime() - p.days * 24 * 60 * 60 * 1000);
    expected.setHours(0, 0, 0, 0);
    const actual = new Date(rangeStart);
    actual.setHours(0, 0, 0, 0);
    return actual.getTime() === expected.getTime() && !rangeEnd;
  });

  const handlePreset = (days) => {
    if (days === null) {
      onRangeChange(null, null);
    } else {
      const start = new Date(dataLatest.getTime() - days * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      onRangeChange(start, null);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar size={14} className="text-text-muted flex-shrink-0" />

      {/* Preset buttons */}
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p.days)}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              activePreset?.label === p.label
                ? 'bg-[#007AFF] text-white'
                : 'bg-surface-secondary/80 border border-border-secondary text-text-secondary hover:border-[#007AFF] hover:text-text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-surface-tertiary mx-1" />

      {/* Custom date inputs */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={toInputValue(rangeStart)}
          min={toInputValue(dataEarliest)}
          max={toInputValue(rangeEnd || dataLatest)}
          onChange={(e) => onRangeChange(fromInputValue(e.target.value), rangeEnd)}
          className="bg-surface-secondary/80 border border-border-secondary rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-[#007AFF] [color-scheme:light]"
        />
        <span className="text-text-muted text-xs">–</span>
        <input
          type="date"
          value={toInputValue(rangeEnd)}
          min={toInputValue(rangeStart || dataEarliest)}
          max={toInputValue(dataLatest)}
          onChange={(e) => onRangeChange(rangeStart, fromInputValue(e.target.value))}
          className="bg-surface-secondary/80 border border-border-secondary rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-[#007AFF] [color-scheme:light]"
        />
      </div>
    </div>
  );
}
