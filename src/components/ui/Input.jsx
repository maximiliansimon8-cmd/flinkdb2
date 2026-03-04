import React, { forwardRef } from 'react';
import { Search } from 'lucide-react';

export const Input = forwardRef(function Input({
  className = '',
  type = 'text',
  ...props
}, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={`w-full bg-surface-primary border border-border-primary rounded-[var(--radius-md)] px-3.5 py-2.5 text-[15px] text-text-primary placeholder-text-muted transition-colors duration-150 focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/12 ${className}`}
      {...props}
    />
  );
});

export const SearchInput = forwardRef(function SearchInput({
  className = '',
  placeholder = 'Suche...',
  ...props
}, ref) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        ref={ref}
        type="search"
        placeholder={placeholder}
        className={`w-full bg-surface-tertiary border-none rounded-[var(--radius-sm)] pl-9 pr-3 py-2 text-[13px] text-text-primary placeholder-text-muted transition-colors duration-150 focus:outline-none focus:bg-surface-primary focus:ring-2 focus:ring-accent/20 ${className}`}
        {...props}
      />
    </div>
  );
});
