import { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy, Component } from 'react';
import { Calendar, List, Loader2, Send, BarChart3, PhoneCall, Map as MapIcon, MapPin, Database, CheckCircle2, ChevronDown, Users, Settings, AlertTriangle, RefreshCw, Shield, Wrench } from 'lucide-react';
import { fetchAllAcquisition } from '../utils/airtableService';

/** Error boundary that catches chunk-load failures for lazy-loaded sub-components. */
class ChunkErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[InstallationsDashboard ChunkError]', error, info?.componentStack); }
  componentDidUpdate(prevProps) {
    // Reset error state when the active tab changes so the user can navigate away
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }
  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.message?.includes('Loading chunk') ||
                           this.state.error?.message?.includes('Failed to fetch') ||
                           this.state.error?.message?.includes('dynamically imported module');
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            {isChunkError ? 'Modul konnte nicht geladen werden' : 'Ein Fehler ist aufgetreten'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md">
            {isChunkError
              ? 'Moeglicherweise liegt ein Netzwerkproblem vor. Bitte versuche es erneut.'
              : (this.state.error?.message || 'Unbekannter Fehler')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors"
          >
            <RefreshCw size={13} />
            Seite neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const InstallationCalendar = lazy(() => import('./InstallationCalendar'));
const InstallationBookingsDashboard = lazy(() => import('./InstallationBookingsDashboard'));
const InstallationInviteManager = lazy(() => import('./InstallationInviteManager'));
const InstallationExecutiveDashboard = lazy(() => import('./InstallationExecutiveDashboard'));
const InstallationPhoneWorkbench = lazy(() => import('./InstallationPhoneWorkbench'));
const InstallationMapView = lazy(() => import('./InstallationMapView'));
const InstallationTeamDashboard = lazy(() => import('./InstallationTeamDashboard'));
const InstallationDataDictionary = lazy(() => import('./InstallationDataDictionary'));
const InstallationReadyLocations = lazy(() => import('./InstallationReadyLocations'));
const MonteurManagement = lazy(() => import('./MonteurManagement'));
const AdminPanel = lazy(() => import('./AdminPanel'));
const TeamAnalyticsDashboard = lazy(() => import('./TeamAnalyticsDashboard'));
/* ── Menu Structure: 3 Main Categories ── */
const MENU_CATEGORIES = [
  {
    id: 'uebersicht',
    label: 'Uebersicht',
    icon: BarChart3,
    items: [
      { id: 'executive',   label: 'Dashboard',         icon: BarChart3 },
      { id: 'ready',       label: 'Aufbaubereit',      icon: CheckCircle2 },
    ],
  },
  {
    id: 'terminierung',
    label: 'Terminierung',
    icon: Calendar,
    items: [
      { id: 'bookings', label: 'Buchungen',              icon: List },
      { id: 'phone',    label: 'Telefon',                icon: PhoneCall },
      { id: 'invite',   label: 'WA-Einladungen',         icon: Send },
      { id: 'map',      label: 'Karte',                  icon: MapIcon },
      { id: 'calendar', label: 'Kalender',               icon: Calendar },
      { id: 'teamplan',  label: 'Team-Tagesplan',         icon: Users },
      { id: 'monteure',  label: 'Monteur-Zugaenge',      icon: Wrench },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Settings,
    adminOnly: true,
    items: [
      { id: 'team-analytics', label: 'Team-Auswertung', icon: BarChart3 },
      { id: 'users',    label: 'Benutzer',        icon: Shield },
      { id: 'data',     label: 'Data Dictionary', icon: Database },
    ],
  },
];

export default function InstallationsDashboard({ initialSection, onSectionChange, standalone = false, isAdmin = false }) {
  // Visible categories (filter out admin-only for non-admins)
  const visibleCategories = useMemo(() =>
    MENU_CATEGORIES.filter(c => !c.adminOnly || isAdmin),
    [isAdmin]
  );
  const visibleTabIds = useMemo(() =>
    visibleCategories.flatMap(c => c.items.map(i => i.id)),
    [visibleCategories]
  );

  // Cross-component campaign state: MapView → InviteManager
  const [campaignSelection, setCampaignSelection] = useState(null); // { ids: Set, source: 'map' }

  // Hash-based URL routing: read initial tab from URL hash (e.g. /install#phone)
  const initialTab = useMemo(() => {
    if (standalone) {
      const hash = window.location.hash.replace('#', '').split('/')[0];
      if (hash && visibleTabIds.includes(hash)) return hash;
    }
    return initialSection || 'executive';
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [activeSubTab, setActiveSubTabRaw] = useState(initialTab);
  const [selectedCity, setSelectedCity] = useState('');
  const [availableCities, setAvailableCities] = useState([]);
  const [openCategory, setOpenCategory] = useState(() => {
    // Auto-open the category containing the initial tab
    const cat = visibleCategories.find(c => c.items.some(i => i.id === initialTab));
    return cat?.id || 'uebersicht';
  });
  const menuRef = useRef(null);

  const setActiveSubTab = useCallback((tab) => {
    setActiveSubTabRaw(tab);
    onSectionChange?.(tab);
    // Update URL hash in standalone mode
    if (standalone) {
      window.history.replaceState(null, '', `#${tab}`);
    }
  }, [onSectionChange, standalone]);

  // Listen for browser back/forward navigation (hashchange)
  useEffect(() => {
    if (!standalone) return;
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '').split('/')[0];
      if (hash && visibleTabIds.includes(hash)) {
        setActiveSubTabRaw(hash);
        onSectionChange?.(hash);
        // Open parent category
        const cat = visibleCategories.find(c => c.items.some(i => i.id === hash));
        if (cat) setOpenCategory(cat.id);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [standalone, onSectionChange, visibleTabIds, visibleCategories]);

  // Load cities from acquisition data
  useEffect(() => {
    fetchAllAcquisition().then(data => {
      if (Array.isArray(data)) {
        const citySet = new Set();
        data.forEach(a => {
          const cities = Array.isArray(a.city) ? a.city : (a.city ? [a.city] : []);
          cities.forEach(c => { if (c && c.trim()) citySet.add(c.trim()); });
        });
        setAvailableCities([...citySet].sort());
      }
    }).catch(() => {});
  }, []);

  // Handler: MapView sends selected standorte to InviteManager
  const handleSendToInvite = useCallback((selectedIds) => {
    setCampaignSelection({ ids: selectedIds, source: 'map', ts: Date.now() });
    setActiveSubTab('invite');
    setOpenCategory('terminierung');
  }, [setActiveSubTab]);

  // Clear campaign selection once InviteManager has consumed it
  const handleCampaignConsumed = useCallback(() => {
    setCampaignSelection(null);
  }, []);

  // Find which category the active tab belongs to
  const activeCategoryId = useMemo(() => {
    const cat = visibleCategories.find(c => c.items.some(i => i.id === activeSubTab));
    return cat?.id || 'uebersicht';
  }, [activeSubTab, visibleCategories]);

  return (
    <div className="space-y-4">
      {/* Navigation: Category Tabs + Sub-Items + City Filter */}
      <div className="space-y-2">
        {/* Main Category Bar + City Filter */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit" ref={menuRef}>
            {visibleCategories.map(cat => {
              const CatIcon = cat.icon;
              const isCatActive = activeCategoryId === cat.id;
              const isCatOpen = openCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setOpenCategory(isCatOpen && openCategory === cat.id ? null : cat.id);
                    // If clicking a different category, switch to its first item
                    if (!isCatActive) {
                      setActiveSubTab(cat.items[0].id);
                      setOpenCategory(cat.id);
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    isCatActive
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <CatIcon size={16} />
                  {cat.label}
                  <ChevronDown size={13} className={`transition-transform duration-200 ${isCatOpen ? 'rotate-180' : ''}`} />
                </button>
              );
            })}
          </div>

          {/* Global City Filter */}
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="text-gray-400 shrink-0" />
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
            >
              <option value="">Alle Staedte</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {selectedCity && (
              <button
                onClick={() => setSelectedCity('')}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                title="Filter zuruecksetzen"
              >
                <span className="text-xs font-medium">&times;</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Items for Open Category */}
        {openCategory && (() => {
          const cat = visibleCategories.find(c => c.id === openCategory);
          if (!cat) return null;
          return (
            <div className="flex gap-1 pl-1 flex-wrap">
              {cat.items.map(item => {
                const Icon = item.icon;
                const isActive = activeSubTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSubTab(item.id);
                      setOpenCategory(cat.id);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-orange-50 text-orange-700 border border-orange-200 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <Icon size={13} className={isActive ? 'text-orange-500' : 'text-gray-400'} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Sub-Tab Content */}
      <ChunkErrorBoundary resetKey={activeSubTab}>
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            <span className="text-sm text-slate-500">Wird geladen...</span>
          </div>
        }>
          {activeSubTab === 'executive' && <InstallationExecutiveDashboard filterCity={selectedCity} />}
          {activeSubTab === 'ready' && <InstallationReadyLocations filterCity={selectedCity} />}
          {activeSubTab === 'bookings' && <InstallationBookingsDashboard filterCity={selectedCity} />}
          {activeSubTab === 'phone' && <InstallationPhoneWorkbench filterCity={selectedCity} />}
          {activeSubTab === 'invite' && <InstallationInviteManager filterCity={selectedCity} campaignSelection={campaignSelection} onCampaignConsumed={handleCampaignConsumed} />}
          {activeSubTab === 'map' && <InstallationMapView filterCity={selectedCity} onSendToInvite={handleSendToInvite} />}
          {activeSubTab === 'calendar' && <InstallationCalendar filterCity={selectedCity} />}
          {activeSubTab === 'teamplan' && <InstallationTeamDashboard filterCity={selectedCity} />}
          {activeSubTab === 'monteure' && <MonteurManagement />}
          {activeSubTab === 'team-analytics' && <TeamAnalyticsDashboard />}
          {activeSubTab === 'users' && <AdminPanel />}
          {activeSubTab === 'data' && <InstallationDataDictionary />}
        </Suspense>
      </ChunkErrorBoundary>
    </div>
  );
}
