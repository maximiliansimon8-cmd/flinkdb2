import React, { useState, useEffect } from 'react';
import { Search, X, PanelLeftClose, PanelLeft, Moon, Sun, Monitor as MonitorIcon, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'jet-sidebar-collapsed';

export function Sidebar({
  tabGroups,
  activeTab,
  onTabChange,
  currentUser,
  userGroup,
  globalSearch,
  onSearchChange,
  globalSearchOpen,
  globalSearchResults,
  onSearchResultClick,
  onSearchFocus,
  onSearchClear,
  globalSearchRef,
  isDark,
  onToggleTheme,
  onPasswordChange,
  onLogout,
  getInitials,
  // Sub-tab support
  activeSubTab,
  subTabs,
  onSubTabChange,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed);
  }, [collapsed]);

  // Determine which items have sub-tabs
  const tabsWithSubs = ['hardware', 'acquisition', 'installations'];

  const toggleGroup = (tabId) => {
    setExpandedGroups(prev => ({ ...prev, [tabId]: !prev[tabId] }));
  };

  return (
    <aside
      className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-all duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]
        bg-[#F6F6F8] border-r border-[#E5E5EA]
        ${collapsed ? 'w-[72px]' : 'w-[260px]'}`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 h-14 border-b border-border-secondary shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <img
          src="/dimension-outdoor-logo.png"
          alt="Dimension Outdoor"
          className="h-6 w-auto brightness-0 opacity-70 dark:invert dark:opacity-80 shrink-0"
        />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-text-primary tracking-wide truncate">JET GERMANY</div>
          </div>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-3 py-3 shrink-0" ref={globalSearchRef}>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Suche..."
              value={globalSearch}
              onChange={e => onSearchChange(e.target.value)}
              onFocus={onSearchFocus}
              className="w-full bg-surface-tertiary border-none rounded-lg pl-8 pr-8 py-2 text-[13px] text-text-primary placeholder-text-muted transition-colors duration-150 focus:outline-none focus:bg-surface-primary focus:ring-2 focus:ring-accent/20"
            />
            {globalSearch && (
              <button onClick={onSearchClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                <X size={12} />
              </button>
            )}
          </div>
          {/* Search Results */}
          {globalSearchOpen && globalSearchResults.length > 0 && (
            <div className="mt-1 bg-surface-elevated border border-border-secondary rounded-xl shadow-float z-50 max-h-72 overflow-y-auto">
              <div className="p-1.5">
                {globalSearchResults.map(r => (
                  <button
                    key={r.id}
                    onClick={() => onSearchResultClick(r)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-text-primary truncate">{r.label}</div>
                      <div className="text-[11px] text-text-muted truncate">{r.sublabel}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${r.type === 'display' ? 'bg-accent-light text-accent' : 'bg-surface-tertiary text-text-muted'}`}>
                      {r.type === 'display' ? 'Live' : 'Stamm'}
                    </span>
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 border-t border-border-secondary text-[11px] text-text-muted text-center">
                {globalSearchResults.length} Ergebnisse
              </div>
            </div>
          )}
          {globalSearchOpen && globalSearch.length >= 2 && globalSearchResults.length === 0 && (
            <div className="mt-1 bg-surface-elevated border border-border-secondary rounded-xl shadow-float z-50 p-4 text-center">
              <span className="text-[12px] text-text-muted">Keine Ergebnisse</span>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1 scrollbar-none">
        {tabGroups.map((group) => (
          <div key={group.group} className="mb-1">
            {/* Section Header */}
            {!collapsed && (
              <div className="px-3 pt-4 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {group.group}
                </span>
              </div>
            )}
            {collapsed && <div className="h-2" />}

            {/* Nav Items */}
            {group.tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const hasSubs = tabsWithSubs.includes(tab.id);
              const isExpanded = expandedGroups[tab.id];

              return (
                <div key={tab.id}>
                  <button
                    onClick={() => {
                      onTabChange(tab.id);
                      if (hasSubs && !collapsed) {
                        toggleGroup(tab.id);
                      }
                    }}
                    title={collapsed ? tab.label : undefined}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-150
                      ${isActive
                        ? 'bg-accent-light text-accent'
                        : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                      }
                      ${collapsed ? 'justify-center px-0' : ''}
                    `}
                  >
                    <Icon size={18} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left truncate">{tab.label}</span>
                        {hasSubs && (
                          <ChevronRight
                            size={14}
                            className={`shrink-0 text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        )}
                      </>
                    )}
                  </button>

                  {/* Sub-tabs (expanded inline) */}
                  {hasSubs && isExpanded && !collapsed && isActive && subTabs && subTabs.length > 0 && (
                    <div className="ml-7 mt-0.5 mb-1 space-y-0.5">
                      {subTabs.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => onSubTabChange(sub.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[12px] transition-colors duration-150
                            ${activeSubTab === sub.id
                              ? 'text-accent font-medium bg-accent-light/50'
                              : 'text-text-muted hover:text-text-primary hover:bg-surface-tertiary'
                            }`}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border-secondary px-3 py-3 space-y-2 shrink-0">
        {/* Dark Mode Toggle */}
        <button
          onClick={onToggleTheme}
          className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[13px] font-medium text-text-secondary hover:bg-surface-tertiary transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[13px] font-medium text-text-secondary hover:bg-surface-tertiary transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Einklappen</span>}
        </button>

        {/* User */}
        {currentUser && !collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: userGroup?.color || '#8E8E93' }}
            >
              {getInitials(currentUser.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-text-primary truncate">{currentUser.name}</div>
              <div className="text-[11px] text-text-muted truncate">{userGroup?.name || 'User'}</div>
            </div>
          </div>
        )}
        {currentUser && collapsed && (
          <div className="flex justify-center">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ backgroundColor: userGroup?.color || '#8E8E93' }}
              title={currentUser.name}
            >
              {getInitials(currentUser.name)}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
