import React from 'react';
import { RefreshCw, Database, LogOut, Key } from 'lucide-react';

export function ContentHeader({
  pageTitle,
  displayRawData,
  totalRowsGlobal,
  onRefresh,
  onSync,
  syncing,
  syncResult,
  rangeStart,
  rangeEnd,
  dataEarliest,
  dataLatest,
  onRangeChange,
  rangeLabel,
  displayTabs,
  activeMainTab,
  DateRangePicker,
  formatDateTime,
  comparisonData,
  onPasswordChange,
  onLogout,
  currentUser,
  userGroup,
  getInitials,
  sidebarCollapsed,
}) {
  const dataAgeHours = displayRawData?.latestTimestamp
    ? (Date.now() - new Date(displayRawData.latestTimestamp).getTime()) / (1000 * 60 * 60)
    : Infinity;
  const isStale = dataAgeHours > 24;

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-border-secondary bg-surface-primary shrink-0">
      {/* Left: Page Title */}
      <h1 className="text-[17px] font-semibold text-text-primary tracking-[-0.4px]">
        {pageTitle}
      </h1>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Data points badge */}
        <div className="hidden lg:flex items-center gap-1.5 bg-status-online/8 border border-status-online/20 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-status-online animate-pulse" />
          <span className="text-[13px] font-mono font-medium text-status-online">
            {(displayRawData?.displays?.length || 0) + (comparisonData?.dayn?.total || 0)}
          </span>
        </div>

        {/* Date Range Picker */}
        {displayTabs?.includes(activeMainTab) && DateRangePicker && (
          <DateRangePicker
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            dataEarliest={dataEarliest}
            dataLatest={dataLatest}
            onRangeChange={onRangeChange}
          />
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="p-2 rounded-xl hover:bg-surface-secondary text-text-muted hover:text-text-primary transition-colors"
          title="Daten neu laden"
        >
          <RefreshCw size={16} />
        </button>

        {/* Sync */}
        <button
          onClick={onSync}
          disabled={syncing}
          className={`p-2 rounded-xl transition-colors ${
            syncing
              ? 'bg-accent/10 text-accent'
              : syncResult?.success
                ? 'bg-status-online/10 text-status-online'
                : 'hover:bg-surface-secondary text-text-muted hover:text-text-primary'
          }`}
          title={syncing ? 'Sync läuft...' : 'Airtable → Supabase Sync'}
        >
          <Database size={16} className={syncing ? 'animate-pulse' : ''} />
        </button>

        {/* User actions */}
        {currentUser && (
          <div className="flex items-center gap-1">
            <button
              onClick={onPasswordChange}
              className="p-2 rounded-xl hover:bg-surface-secondary text-text-muted hover:text-text-primary transition-colors"
              title="Passwort ändern"
            >
              <Key size={15} />
            </button>
            <button
              onClick={onLogout}
              className="p-2 rounded-xl hover:bg-status-offline/10 text-text-muted hover:text-status-offline transition-colors"
              title="Abmelden"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
