import React from 'react';

const variants = {
  default: 'bg-surface-primary border border-border-secondary shadow-card rounded-[var(--radius-lg)]',
  elevated: 'bg-surface-primary border border-border-secondary shadow-md rounded-[var(--radius-lg)]',
  flat: 'bg-surface-secondary border border-border-secondary rounded-[var(--radius-lg)]',
  ghost: 'rounded-[var(--radius-lg)]',
};

export function Card({ children, className = '', variant = 'default', padding = 'p-5', onClick, ...props }) {
  const base = variants[variant] || variants.default;
  const interactive = onClick ? 'cursor-pointer transition-shadow duration-150 hover:shadow-md' : '';

  return (
    <div
      className={`${base} ${padding} ${interactive} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '' }) {
  return (
    <h3 className={`text-[15px] font-semibold text-text-primary tracking-[-0.23px] ${className}`}>
      {children}
    </h3>
  );
}
