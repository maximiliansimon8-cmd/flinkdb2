import React from 'react';

const presets = {
  online:   { color: 'var(--color-status-online)',   bg: 'rgba(52, 199, 89, 0.12)' },
  warning:  { color: 'var(--color-status-warning)',  bg: 'rgba(255, 149, 0, 0.12)' },
  offline:  { color: 'var(--color-status-offline)',  bg: 'rgba(255, 59, 48, 0.12)' },
  critical: { color: 'var(--color-status-critical)', bg: 'rgba(255, 59, 48, 0.12)' },
  accent:   { color: 'var(--color-accent)',          bg: 'var(--color-accent-light)' },
  purple:   { color: 'var(--color-status-purple)',   bg: 'rgba(175, 82, 222, 0.12)' },
  muted:    { color: 'var(--color-text-muted)',      bg: 'var(--color-surface-tertiary)' },
};

export function Badge({
  children,
  status,
  color,
  bg,
  size = 'sm',
  dot = false,
  className = '',
}) {
  const preset = status ? presets[status] : null;
  const resolvedColor = color || preset?.color || 'var(--color-text-muted)';
  const resolvedBg = bg || preset?.bg || 'var(--color-surface-tertiary)';

  const sizeClass = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-[11px] px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full whitespace-nowrap ${sizeClass} ${className}`}
      style={{ color: resolvedColor, backgroundColor: resolvedBg }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: resolvedColor }}
        />
      )}
      {children}
    </span>
  );
}

export function StatusDot({ status, size = 8, className = '' }) {
  const preset = presets[status];
  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: preset?.color || 'var(--color-text-muted)',
      }}
    />
  );
}
