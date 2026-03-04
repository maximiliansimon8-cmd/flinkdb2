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
  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-[#E8E8ED] bg-white/80 backdrop-blur-xl shrink-0">
      {/* Left: Page Title */}
      <h1 className="text-[17px] font-semibold text-[#1D1D1F] tracking-[-0.4px]">
        {pageTitle}
      </h1>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Live indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
          <span className="text-[13px] font-medium text-[#34C759]">
            {(displayRawData?.displays?.length || 0) + (comparisonData?.dayn?.total || 0)} Live
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

        <div className="w-px h-5 bg-[#E8E8ED]" />

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F] transition-colors"
          title="Daten neu laden"
        >
          <RefreshCw size={16} />
        </button>

        {/* Sync */}
        <button
          onClick={onSync}
          disabled={syncing}
          className={`p-2 rounded-lg transition-colors ${
            syncing
              ? 'bg-[#007AFF]/10 text-[#007AFF]'
              : syncResult?.success
                ? 'bg-[#34C759]/10 text-[#34C759]'
                : 'hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]'
          }`}
          title={syncing ? 'Sync läuft...' : 'Airtable → Supabase Sync'}
        >
          <Database size={16} className={syncing ? 'animate-pulse' : ''} />
        </button>

        {/* User actions */}
        {currentUser && (
          <>
            <div className="w-px h-5 bg-[#E8E8ED]" />
            <div className="flex items-center gap-0.5">
              <button
                onClick={onPasswordChange}
                className="p-2 rounded-lg hover:bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                title="Passwort ändern"
              >
                <Key size={15} />
              </button>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg hover:bg-[#FF3B30]/10 text-[#86868B] hover:text-[#FF3B30] transition-colors"
                title="Abmelden"
              >
                <LogOut size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
