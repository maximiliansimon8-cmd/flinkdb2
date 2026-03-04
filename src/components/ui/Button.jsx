import React from 'react';

const variants = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:brightness-90',
  secondary: 'bg-surface-secondary text-text-primary hover:bg-surface-tertiary border border-border-secondary',
  ghost: 'text-text-secondary hover:bg-surface-secondary',
  destructive: 'bg-status-offline text-white hover:brightness-90',
  accent: 'text-accent hover:bg-accent-light',
};

const sizes = {
  sm: 'px-3 py-1.5 text-[13px] rounded-[var(--radius-sm)]',
  md: 'px-4 py-2.5 text-[15px] rounded-[var(--radius-md)]',
  lg: 'px-6 py-3 text-[17px] rounded-[var(--radius-md)]',
  icon: 'w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  ...props
}) {
  const base = 'inline-flex items-center justify-center font-semibold transition-all duration-150 ease-out select-none';
  const disabledClass = disabled ? 'opacity-40 pointer-events-none' : '';

  return (
    <button
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${disabledClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
