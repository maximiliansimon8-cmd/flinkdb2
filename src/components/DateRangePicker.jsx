import React from 'react';

const PRESETS = [
  { label: '7 Tage', days: 7 },
  { label: '14 Tage', days: 14 },
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
  { label: '1 Jahr', days: 365 },
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
    <div className="flex items-center gap-2">
      {/* Segmented control */}
      <div className="flex bg-[#F5F5F7] rounded-lg p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => handlePreset(p.days)}
            className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-200 ${
              activePreset?.label === p.label
                ? 'bg-white text-[#1D1D1F] shadow-sm'
                : 'text-[#86868B] hover:text-[#1D1D1F]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={toInputValue(rangeStart)}
          min={toInputValue(dataEarliest)}
          max={toInputValue(rangeEnd || dataLatest)}
          onChange={(e) => onRangeChange(fromInputValue(e.target.value), rangeEnd)}
          className="bg-white border border-[#E8E8ED] rounded-lg px-2.5 py-1.5 text-[13px] text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] [color-scheme:light]"
        />
        <span className="text-[#AEAEB2] text-[13px]">–</span>
        <input
          type="date"
          value={toInputValue(rangeEnd)}
          min={toInputValue(rangeStart || dataEarliest)}
          max={toInputValue(dataLatest)}
          onChange={(e) => onRangeChange(rangeStart, fromInputValue(e.target.value))}
          className="bg-white border border-[#E8E8ED] rounded-lg px-2.5 py-1.5 text-[13px] text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] [color-scheme:light]"
        />
      </div>
    </div>
  );
}
