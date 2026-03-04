import { useState, useMemo, useCallback, useEffect, useRef, Fragment, lazy, Suspense } from 'react';
import {
  Shield,
  Database,
  Users,
  UserPlus,
  Key,
  Trash2,
  Edit3,
  X,
  Check,
  AlertCircle,
  Search,
  ChevronDown,
  Activity,
  Crown,
  Eye,
  Layers,
  Plus,
  Code,
  TrendingUp,
  BarChart3,
  Wrench,
  Monitor,
  ClipboardList,
  MessageSquare,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Palette,
  FileText,
  Clock,
  Download,
  LogIn,
  LogOut as LogOutIcon,
  UserMinus,
  KeyRound,
  ShieldAlert,
  Lightbulb,
  Bug,
  HelpCircle,
  ArrowUpDown,
  Zap,
  DollarSign,
  RefreshCw,
  Wifi,
  Server,
  MapPin,
  Globe,
  Upload,
} from 'lucide-react';
import {
  getAllUsers,
  fetchAllUsers,
  fetchGroups,
  addUser,
  updateUserGroup,
  resetUserPassword,
  deleteUser,
  getCurrentUser,
  getInitials,
  getAllGroups,
  getGroupWithMembers,
  createGroup,
  updateGroup,
  deleteGroup,
  ALL_TABS,
  ALL_ACTIONS,
  getAuditLog,
  clearAuditLog,
  getSessionTimeoutMinutes,
  supabase,
} from '../utils/authService';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

const DataMappingPanel = lazy(() => import('./DataMappingPanel'));
const APIOverviewPanel = lazy(() => import('./APIOverviewPanel'));
const StammdatenImport = lazy(() => import('./StammdatenImport'));

/* ─── Group Icon Map ─── */

const GROUP_ICONS = {
  Shield, Wrench, TrendingUp, BarChart3, Code, Users, Crown, Monitor,
};

function getGroupIcon(iconName) {
  return GROUP_ICONS[iconName] || Users;
}

/* ─── Tab Icon Map ─── */

const TAB_ICONS = {
  displays: Monitor,
  'displays.overview': BarChart3,
  'displays.list': ClipboardList,
  'displays.cities': Users,
  tasks: ClipboardList,
  communication: MessageSquare,
  admin: Shield,
};

/* ─── Color Presets ─── */

const COLOR_PRESETS = [
  '#007AFF', '#34C759', '#FF9500', '#a855f7', '#06b6d4',
  '#FF3B30', '#ec4899', '#f97316', '#14b8a6', '#64748b',
];

/* ─── Group Badge ─── */

function GroupBadge({ group }) {
  const Icon = getGroupIcon(group.icon);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
      style={{
        backgroundColor: group.color + '15',
        color: group.color,
        borderColor: group.color + '30',
      }}
    >
      <Icon size={12} />
      {group.name}
    </span>
  );
}

/* ─── Add User Modal ─── */

function AddUserModal({ onClose, onSave, groups, installerTeams }) {
  const [form, setForm] = useState({ name: '', email: '', groupId: groups[0]?.id || '', password: '', installerTeam: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name und E-Mail sind Pflichtfelder');
      return;
    }
    const result = await addUser(form);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSave(result.user);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-xl w-full max-w-md mx-4 animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-[#007AFF]" />
            <h3 className="text-sm font-semibold text-text-primary">Neuer Benutzer</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-secondary/60 text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-status-offline/10/80 border border-status-offline/20/60 text-xs text-status-offline">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted block mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }}
              placeholder="Vor- und Nachname"
              autoFocus
              className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1.5">E-Mail / Benutzername</label>
            <input
              type="text"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }}
              placeholder="email@beispiel.de"
              className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1.5">Gruppe</label>
            <div className="relative">
              <select
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors appearance-none cursor-pointer"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1.5">Passwort</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Passwort eingeben (min. 8 Zeichen)"
              className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
            />
          </div>

          {/* Installer Team — only for Monteur group */}
          {form.groupId === 'grp_monteur' && (
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Installations-Team</label>
              <div className="relative">
                <select
                  value={form.installerTeam}
                  onChange={(e) => setForm({ ...form, installerTeam: e.target.value })}
                  className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors appearance-none cursor-pointer"
                >
                  <option value="">Team wählen...</option>
                  {(installerTeams || []).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
              <p className="text-[10px] text-text-muted mt-1">Monteur wird diesem Installations-Team zugeordnet.</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-surface-primary border border-border-secondary text-text-secondary hover:bg-surface-secondary transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#007AFF] text-white hover:bg-[#2563eb] transition-colors"
            >
              Erstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Group Edit Modal ─── */

function GroupEditModal({ group, onClose, onSave }) {
  const isNew = !group;
  const [form, setForm] = useState({
    name: group?.name || '',
    description: group?.description || '',
    color: group?.color || '#64748b',
    tabs: group?.tabs || ['displays', 'displays.overview'],
    actions: group?.actions || ['view'],
  });
  const [error, setError] = useState('');

  const toggleTab = (tabId) => {
    setForm((prev) => {
      let newTabs = prev.tabs.includes(tabId)
        ? prev.tabs.filter((t) => t !== tabId)
        : [...prev.tabs, tabId];

      // If a parent tab is unchecked, also remove its children
      const tab = ALL_TABS.find((t) => t.id === tabId);
      if (tab && !tab.parent && !newTabs.includes(tabId)) {
        newTabs = newTabs.filter((t) => {
          const childTab = ALL_TABS.find((at) => at.id === t);
          return childTab?.parent !== tabId;
        });
      }
      // If a child tab is checked, also add its parent
      if (tab?.parent && newTabs.includes(tabId) && !newTabs.includes(tab.parent)) {
        newTabs.push(tab.parent);
      }

      return { ...prev, tabs: newTabs };
    });
  };

  const toggleAction = (actionId) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.includes(actionId)
        ? prev.actions.filter((a) => a !== actionId)
        : [...prev.actions, actionId],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Gruppenname ist ein Pflichtfeld');
      return;
    }

    let result;
    if (isNew) {
      result = createGroup(form);
    } else {
      result = updateGroup(group.id, form);
    }

    if (!result.success) {
      setError(result.error);
      return;
    }

    onSave();
    onClose();
  };

  // Group actions by category
  const actionsByCategory = useMemo(() => {
    const cats = {};
    ALL_ACTIONS.forEach((a) => {
      if (!cats[a.category]) cats[a.category] = [];
      cats[a.category].push(a);
    });
    return cats;
  }, []);

  // Split tabs into main and sub
  const mainTabs = ALL_TABS.filter((t) => !t.parent);
  const getSubTabs = (parentId) => ALL_TABS.filter((t) => t.parent === parentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-xl w-full max-w-2xl mx-4 animate-fade-in max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#007AFF]" />
            <h3 className="text-sm font-semibold text-text-primary">
              {isNew ? 'Neue Gruppe erstellen' : `Gruppe bearbeiten: ${group.name}`}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-secondary/60 text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-status-offline/10/80 border border-status-offline/20/60 text-xs text-status-offline">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Name + Description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Gruppenname</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }}
                placeholder="z.B. Operations"
                autoFocus
                className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Beschreibung</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Kurze Beschreibung..."
                className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
              />
            </div>
          </div>

          {/* Color Picker */}
          <div>
            <label className="text-xs text-text-muted block mb-2">
              <Palette size={12} className="inline mr-1" />
              Gruppenfarbe
            </label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    form.color === c ? 'border-[#1D1D1F] scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div>
            <label className="text-xs text-text-muted block mb-2">
              <Monitor size={12} className="inline mr-1" />
              Sichtbare Tabs
            </label>
            <div className="space-y-2">
              {mainTabs.map((tab) => {
                const subs = getSubTabs(tab.id);
                const isChecked = form.tabs.includes(tab.id);
                const TabIcon = TAB_ICONS[tab.id] || Monitor;

                return (
                  <div key={tab.id} className="border border-border-secondary/40 rounded-xl p-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <button
                        type="button"
                        onClick={() => toggleTab(tab.id)}
                        className="shrink-0"
                      >
                        {isChecked ? (
                          <ToggleRight size={20} style={{ color: form.color }} />
                        ) : (
                          <ToggleLeft size={20} className="text-text-muted" />
                        )}
                      </button>
                      <TabIcon size={14} className={isChecked ? 'text-text-primary' : 'text-text-muted'} />
                      <span className={`text-sm font-medium ${isChecked ? 'text-text-primary' : 'text-text-muted'}`}>
                        {tab.label}
                      </span>
                    </label>

                    {subs.length > 0 && isChecked && (
                      <div className="ml-10 mt-2 flex flex-wrap gap-2">
                        {subs.map((sub) => {
                          const subChecked = form.tabs.includes(sub.id);
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => toggleTab(sub.id)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                subChecked
                                  ? 'border-accent/20 bg-accent-light/80 text-blue-700'
                                  : 'border-border-secondary bg-surface-secondary/60 text-text-muted hover:border-border-primary'
                              }`}
                            >
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div>
            <label className="text-xs text-text-muted block mb-2">
              <Key size={12} className="inline mr-1" />
              Erlaubte Aktionen
            </label>
            <div className="space-y-3">
              {Object.entries(actionsByCategory).map(([category, actions]) => (
                <div key={category} className="border border-border-secondary/40 rounded-xl p-3">
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    {category}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action) => {
                      const isActive = form.actions.includes(action.id);
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => toggleAction(action.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isActive
                              ? 'bg-emerald-50/80 text-emerald-700 border-emerald-200'
                              : 'bg-surface-secondary/60 text-text-muted border-border-secondary hover:border-border-primary'
                          }`}
                        >
                          {isActive && <Check size={10} className="inline mr-1" />}
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-surface-primary border border-border-secondary text-text-secondary hover:bg-surface-secondary transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#007AFF] text-white hover:bg-[#2563eb] transition-colors"
            >
              {isNew ? 'Erstellen' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Feature Flags Section ─── */

function FeatureFlagsSection({ featureFlags, setFeatureFlags, flagsLoading, setFlagsLoading, refetchFlags, showToast }) {
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setFlagsLoading(true);
    supabase
      .from('feature_flags')
      .select('key, enabled, description, updated_at, updated_by')
      .order('key')
      .then(({ data, error }) => {
        if (!cancelled) {
          if (error) {
            console.error('[FeatureFlags] Fetch error:', error.message);
            showToast('Fehler beim Laden der Feature Flags', 'error');
          } else {
            setFeatureFlags(data || []);
          }
          setFlagsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFlag = async (key, currentEnabled) => {
    setToggling(key);
    const currentUser = getCurrentUser();
    const { error } = await supabase
      .from('feature_flags')
      .update({
        enabled: !currentEnabled,
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.email || currentUser?.name || 'admin',
      })
      .eq('key', key);

    if (error) {
      console.error('[FeatureFlags] Toggle error:', error.message);
      showToast(`Fehler: ${error.message}`, 'error');
    } else {
      setFeatureFlags(prev =>
        prev.map(f => f.key === key ? { ...f, enabled: !currentEnabled, updated_at: new Date().toISOString(), updated_by: currentUser?.email || 'admin' } : f)
      );
      refetchFlags();
      showToast(`${key} ${!currentEnabled ? 'aktiviert' : 'deaktiviert'}`, 'success');
    }
    setToggling(null);
  };

  if (flagsLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw size={20} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Feature Flags steuern die Sichtbarkeit von Dashboard-Bereichen. Deaktivierte Features sind für alle Benutzer ausgeblendet.
        </p>
      </div>
      <div className="bg-surface-primary border border-border-secondary rounded-2xl divide-y divide-slate-100/60 shadow-card">
        {featureFlags.map((flag) => (
          <div key={flag.key} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary font-mono">{flag.key}</span>
                {flag.enabled ? (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/60">Aktiv</span>
                ) : (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-secondary text-text-muted border border-border-secondary">Aus</span>
                )}
              </div>
              <div className="text-xs text-text-muted mt-0.5">{flag.description || '—'}</div>
              {flag.updated_at && (
                <div className="text-[10px] text-text-muted mt-1 font-mono">
                  Aktualisiert: {new Date(flag.updated_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {flag.updated_by ? ` von ${flag.updated_by}` : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => toggleFlag(flag.key, flag.enabled)}
              disabled={toggling === flag.key}
              className="flex-shrink-0 transition-colors"
              title={flag.enabled ? 'Deaktivieren' : 'Aktivieren'}
            >
              {flag.enabled ? (
                <ToggleRight size={32} className={`text-emerald-500 ${toggling === flag.key ? 'opacity-50' : 'hover:text-emerald-600'}`} />
              ) : (
                <ToggleLeft size={32} className={`text-text-muted ${toggling === flag.key ? 'opacity-50' : 'hover:text-text-muted'}`} />
              )}
            </button>
          </div>
        ))}
        {featureFlags.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-text-muted">
            Keine Feature Flags vorhanden
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Admin Panel ─── */

export default function AdminPanel({ initialSection, onSectionChange }) {
  const { flags: featureFlagMap, refetch: refetchFlags } = useFeatureFlags();
  const [featureFlags, setFeatureFlags] = useState([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState(() => getAllGroups());
  const [activeSection, setActiveSectionRaw] = useState(initialSection || 'users');
  const setActiveSection = useCallback((sec) => {
    setActiveSectionRaw(sec);
    onSectionChange?.(sec);
  }, [onSectionChange]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [installerTeams, setInstallerTeams] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmGroupDelete, setConfirmGroupDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState('');

  // API Usage state
  const [apiUsageData, setApiUsageData] = useState([]);
  const [loadingApiUsage, setLoadingApiUsage] = useState(false);
  const [apiTimeRange, setApiTimeRange] = useState('24h'); // '24h' | '7d' | '30d'
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState('all');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('all');
  const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);

  // Attachment Sync state
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncTableFilter, setSyncTableFilter] = useState('all');
  const [syncError, setSyncError] = useState('');
  const [lastSyncLog, setLastSyncLog] = useState(null);
  const [loadingSyncLog, setLoadingSyncLog] = useState(false);

  const currentUser = getCurrentUser();

  // Initial data load from server
  useEffect(() => {
    async function loadData() {
      setLoadingUsers(true);
      try {
        const [fetchedUsers, fetchedGroups] = await Promise.all([
          fetchAllUsers(),
          fetchGroups(),
        ]);
        setUsers(fetchedUsers || []);
        if (fetchedGroups?.length) setGroups(fetchedGroups);

        // Load installer team names for Monteur group assignment
        try {
          const { data: routes } = await supabase
            .from('install_routen')
            .select('installer_team')
            .not('installer_team', 'is', null);
          const uniqueTeams = [...new Set((routes || []).map(r => r.installer_team).filter(Boolean))].sort();
          setInstallerTeams(uniqueTeams);
        } catch { /* non-critical */ }
      } catch (err) {
        console.error('Admin data load error:', err);
      } finally {
        setLoadingUsers(false);
      }
    }
    loadData();
  }, []);

  const refresh = useCallback(async () => {
    const fetchedUsers = await fetchAllUsers();
    setUsers(fetchedUsers || []);
    setGroups(getAllGroups());
  }, []);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ─── Stats ─── */

  const stats = useMemo(() => ({
    totalUsers: users.length,
    totalGroups: groups.length,
    groupBreakdown: groups.map((g) => ({
      ...g,
      count: users.filter((u) => u.groupId === g.id).length,
    })),
  }), [users, groups]);

  /* ─── Filtered users ─── */

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.groupName || '').toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  /* ─── Handlers ─── */

  const handleGroupChange = useCallback(async (userId, newGroupId) => {
    const result = await updateUserGroup(userId, newGroupId);
    if (result.success) {
      await refresh();
      setEditingGroupId(null);
      showToast('Gruppe aktualisiert');
    } else {
      showToast(result.error, 'error');
    }
  }, [refresh, showToast]);

  const handleResetPassword = useCallback(async (userId, userName) => {
    const result = await resetUserPassword(userId);
    if (result.success) {
      showToast(`Passwort für ${userName} zurückgesetzt`);
    } else {
      showToast(result.error, 'error');
    }
  }, [showToast]);

  const handleDeleteUser = useCallback(async (userId) => {
    const result = await deleteUser(userId);
    if (result.success) {
      await refresh();
      setConfirmDelete(null);
      showToast('Benutzer gelöscht');
    } else {
      showToast(result.error, 'error');
      setConfirmDelete(null);
    }
  }, [refresh, showToast]);

  const handleAddUser = useCallback(async () => {
    await refresh();
    showToast('Benutzer erstellt');
  }, [refresh, showToast]);

  const handleDeleteGroup = useCallback((groupId) => {
    const result = deleteGroup(groupId);
    if (result.success) {
      refresh();
      setConfirmGroupDelete(null);
      showToast('Gruppe gelöscht');
    } else {
      showToast(result.error, 'error');
      setConfirmGroupDelete(null);
    }
  }, [refresh, showToast]);

  const handleGroupSave = useCallback(async () => {
    await refresh();
    showToast(editingGroup ? 'Gruppe aktualisiert' : 'Gruppe erstellt');
  }, [refresh, showToast, editingGroup]);

  /* ─── Section Tabs ─── */

  /* ─── Audit Log ─── */

  const [auditLog, setAuditLog] = useState([]);
  const [auditFilter, setAuditFilter] = useState('');
  const [loadingAudit, setLoadingAudit] = useState(false);

  const refreshAuditLog = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const entries = await getAuditLog();
      setAuditLog(entries || []);
    } catch {
      setAuditLog([]);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  // Auto-refresh audit log when switching to audit tab
  useEffect(() => {
    if (activeSection === 'audit') {
      refreshAuditLog().catch(() => {});
    }
  }, [activeSection, refreshAuditLog]);

  const filteredAuditLog = useMemo(() => {
    if (!auditFilter.trim()) return auditLog;
    const q = auditFilter.toLowerCase();
    return auditLog.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        e.userName.toLowerCase().includes(q),
    );
  }, [auditLog, auditFilter]);

  const handleClearAuditLog = useCallback(async () => {
    clearAuditLog();
    await refreshAuditLog();
    showToast('Audit-Log: Permanentes Protokoll (DSGVO)');
  }, [refreshAuditLog, showToast]);

  const handleExportAuditLog = useCallback(() => {
    const csv = [
      'Zeitstempel,Benutzer,Aktion,Detail',
      ...auditLog.map((e) =>
        `"${e.ts}","${e.userName || ''}","${e.action || ''}","${(e.detail || '').replace(/"/g, '""')}"`,
      ),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audit-Log exportiert als CSV');
  }, [auditLog, showToast]);

  // Audit action icon mapping
  const auditActionIcon = (action) => {
    if (action.includes('login') && !action.includes('failed')) return LogIn;
    if (action.includes('login_failed')) return ShieldAlert;
    if (action.includes('logout') || action.includes('expired')) return LogOutIcon;
    if (action.includes('password')) return KeyRound;
    if (action.includes('user_created')) return UserPlus;
    if (action.includes('user_deleted')) return UserMinus;
    if (action.includes('group')) return Layers;
    return Activity;
  };

  const auditActionColor = (action) => {
    if (action.includes('login_failed') || action.includes('deleted')) return '#FF3B30';
    if (action.includes('login') || action.includes('created')) return '#34C759';
    if (action.includes('logout') || action.includes('expired')) return '#FF9500';
    if (action.includes('password')) return '#007AFF';
    if (action.includes('group') || action.includes('updated')) return '#a855f7';
    return '#64748b';
  };

  /* ─── Feedback ─── */

  const refreshFeedback = useCallback(async () => {
    setLoadingFeedback(true);
    try {
      const { data, error } = await supabase
        .from('feedback_requests')
        .select('id,user_id,user_name,type,title,description,priority,status,admin_notes,created_at,updated_at,resolved_at,resolved_by,click_x,click_y,url,component,viewport_width,viewport_height,user_agent,context_data')
        .order('created_at', { ascending: false });
      if (!error) setFeedbackItems(data || []);
    } catch (e) {
      console.error('[AdminPanel] feedback load error:', e);
    } finally {
      setLoadingFeedback(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'feedback') refreshFeedback();
  }, [activeSection, refreshFeedback]);

  const filteredFeedback = useMemo(() => {
    let items = feedbackItems;
    if (feedbackTypeFilter !== 'all') items = items.filter(i => i.type === feedbackTypeFilter);
    if (feedbackStatusFilter !== 'all') items = items.filter(i => i.status === feedbackStatusFilter);
    if (feedbackFilter.trim()) {
      const q = feedbackFilter.toLowerCase();
      items = items.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.user_name?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [feedbackItems, feedbackTypeFilter, feedbackStatusFilter, feedbackFilter]);

  async function updateFeedbackStatus(id, newStatus) {
    const { error } = await supabase
      .from('feedback_requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setFeedbackItems(prev => prev.map(item =>
        item.id === id ? { ...item, status: newStatus, updated_at: new Date().toISOString() } : item
      ));
    }
  }

  async function updateFeedbackPriority(id, newPriority) {
    const { error } = await supabase
      .from('feedback_requests')
      .update({ priority: newPriority, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setFeedbackItems(prev => prev.map(item =>
        item.id === id ? { ...item, priority: newPriority, updated_at: new Date().toISOString() } : item
      ));
    }
  }

  const feedbackStats = useMemo(() => ({
    open: feedbackItems.filter(i => i.status === 'open').length,
    in_review: feedbackItems.filter(i => i.status === 'in_review').length,
    planned: feedbackItems.filter(i => i.status === 'planned').length,
    done: feedbackItems.filter(i => i.status === 'done').length,
  }), [feedbackItems]);

  /* ─── API Usage ─── */

  const refreshApiUsage = useCallback(async () => {
    setLoadingApiUsage(true);
    try {
      const hoursMap = { '24h': 24, '7d': 168, '30d': 720 };
      const hours = hoursMap[apiTimeRange] || 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('api_usage_log')
        .select('id,created_at,function_name,service,method,endpoint,duration_ms,status_code,success,tokens_in,tokens_out,records_count,bytes_transferred,estimated_cost_cents,user_id,error_message')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (!error) setApiUsageData(data || []);
    } catch (e) {
      console.error('[AdminPanel] API usage load error:', e);
    } finally {
      setLoadingApiUsage(false);
    }
  }, [apiTimeRange]);

  useEffect(() => {
    if (activeSection === 'api-usage') refreshApiUsage();
  }, [activeSection, refreshApiUsage]);

  // ─── Attachment Sync Log Fetcher ───
  const fetchLastSyncLog = useCallback(async () => {
    setLoadingSyncLog(true);
    try {
      const { data, error } = await supabase
        .from('attachment_sync_log')
        .select('*')
        .order('completed_at', { ascending: false })
        .limit(5);
      if (!error && data?.length > 0) {
        setLastSyncLog(data);
      }
    } catch (err) {
      console.error('Failed to fetch sync log:', err);
    } finally {
      setLoadingSyncLog(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'attachments') fetchLastSyncLog();
  }, [activeSection, fetchLastSyncLog]);

  // ─── Attachment Sync Handler ───
  const handleSyncAttachments = useCallback(async () => {
    setSyncRunning(true);
    setSyncResult(null);
    setSyncError('');
    try {
      const params = new URLSearchParams();
      if (syncTableFilter !== 'all') params.set('table', syncTableFilter);
      const url = `/api/sync-attachments${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Fehler: HTTP ${res.status}`);
      }
      const data = await res.json();
      setSyncResult(data);
      showToast(`${data.totals?.uploaded || 0} Attachments hochgeladen, ${data.totals?.alreadyCached || 0} bereits gecached`);
      // Refresh sync log to show the new entry
      fetchLastSyncLog();
    } catch (err) {
      setSyncError(err.message || 'Unbekannter Fehler');
      showToast(err.message || 'Sync fehlgeschlagen', 'error');
    } finally {
      setSyncRunning(false);
    }
  }, [syncTableFilter, showToast, fetchLastSyncLog]);

  const apiStats = useMemo(() => {
    if (!apiUsageData.length) return { totalCalls: 0, byService: {}, byFunction: {}, errorCount: 0, totalCostCents: 0, totalTokensIn: 0, totalTokensOut: 0, avgDuration: 0 };

    const byService = {};
    const byFunction = {};
    let errorCount = 0;
    let totalCostCents = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const row of apiUsageData) {
      // By service
      const svc = row.service || 'unknown';
      if (!byService[svc]) byService[svc] = { calls: 0, errors: 0, cost: 0, tokensIn: 0, tokensOut: 0 };
      byService[svc].calls++;
      if (!row.success) byService[svc].errors++;
      byService[svc].cost += row.estimated_cost_cents || 0;
      byService[svc].tokensIn += row.tokens_in || 0;
      byService[svc].tokensOut += row.tokens_out || 0;

      // By function
      const fn = row.function_name || 'unknown';
      if (!byFunction[fn]) byFunction[fn] = { calls: 0, errors: 0, cost: 0, avgMs: 0, totalMs: 0 };
      byFunction[fn].calls++;
      if (!row.success) byFunction[fn].errors++;
      byFunction[fn].cost += row.estimated_cost_cents || 0;
      if (row.duration_ms) { byFunction[fn].totalMs += row.duration_ms; }

      if (!row.success) errorCount++;
      totalCostCents += row.estimated_cost_cents || 0;
      totalTokensIn += row.tokens_in || 0;
      totalTokensOut += row.tokens_out || 0;
      if (row.duration_ms) { totalDuration += row.duration_ms; durationCount++; }
    }

    // Calculate averages
    for (const fn of Object.values(byFunction)) {
      fn.avgMs = fn.calls > 0 ? Math.round(fn.totalMs / fn.calls) : 0;
    }

    return {
      totalCalls: apiUsageData.length,
      byService,
      byFunction,
      errorCount,
      totalCostCents: Math.round(totalCostCents * 100) / 100,
      totalTokensIn,
      totalTokensOut,
      avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    };
  }, [apiUsageData]);

  const primarySections = [
    { id: 'users', label: 'Benutzer', icon: Users, count: stats.totalUsers },
    { id: 'groups', label: 'Gruppen', icon: Layers, count: stats.totalGroups },
    { id: 'audit', label: 'Audit-Log', icon: FileText, count: auditLog.length },
    { id: 'feedback', label: 'Feedback', icon: Lightbulb, count: feedbackItems.length },
    { id: 'feature-flags', label: 'Feature Flags', icon: ToggleLeft, count: Object.keys(featureFlagMap).length || null },
    { id: 'stammdaten-import', label: 'Stammdaten Import', icon: Upload },
  ];

  const moreSections = [
    { id: 'api-usage', label: 'API Usage', icon: Zap, count: apiStats.totalCalls },
    { id: 'attachments', label: 'Attachments', icon: Server },
    { id: 'data-mapping', label: 'Data Mapping', icon: Database, count: 14 },
    { id: 'api-overview', label: 'API Overview', icon: Globe, count: 7 },
  ];

  const sections = [...primarySections, ...moreSections];
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef(null);
  const activeMoreSection = moreSections.find(s => s.id === activeSection);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border animate-fade-in ${
          toast.type === 'error'
            ? 'bg-status-offline/10/90 border-status-offline/20/60 text-red-700'
            : 'bg-emerald-50/90 border-emerald-200/60 text-emerald-700'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#007AFF]/10 flex items-center justify-center">
            <Shield size={20} className="text-[#007AFF]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Admin Panel</h2>
            <p className="text-xs text-text-muted font-mono">Benutzer- & Gruppenverwaltung</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeSection === 'users' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#007AFF] text-white hover:bg-[#2563eb] transition-colors"
            >
              <UserPlus size={16} />
              Benutzer hinzufügen
            </button>
          )}
          {activeSection === 'groups' && (
            <button
              onClick={() => { setEditingGroup(null); setShowGroupModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#007AFF] text-white hover:bg-[#2563eb] transition-colors"
            >
              <Plus size={16} />
              Neue Gruppe
            </button>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-surface-primary border border-border-secondary/40 rounded-xl p-1 overflow-x-auto">
        {primarySections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shrink-0 whitespace-nowrap justify-center ${
                isActive
                  ? 'bg-surface-primary text-text-primary shadow-sm border border-border-secondary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon size={16} />
              {sec.label}
              {sec.count != null && (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-accent-light text-accent' : 'bg-surface-secondary/60 text-text-muted'
                }`}>
                  {sec.count}
                </span>
              )}
            </button>
          );
        })}

        {/* Mehr-Dropdown */}
        <div className="relative shrink-0" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap justify-center ${
              activeMoreSection
                ? 'bg-surface-primary text-text-primary shadow-sm border border-border-secondary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {activeMoreSection ? (
              <>
                {(() => { const Icon = activeMoreSection.icon; return <Icon size={16} />; })()}
                {activeMoreSection.label}
              </>
            ) : (
              <>Mehr</>
            )}
            <ChevronDown size={14} className={`transition-transform ${showMoreMenu ? 'rotate-180' : ''}`} />
          </button>
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
              <div className="absolute top-full left-0 mt-1 z-50 bg-surface-primary rounded-xl shadow-lg border border-border-secondary py-1 min-w-[200px]">
                {moreSections.map((sec) => {
                  const Icon = sec.icon;
                  const isActive = activeSection === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => { setActiveSection(sec.id); setShowMoreMenu(false); }}
                      className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-accent-light text-blue-700'
                          : 'text-text-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <Icon size={16} />
                      {sec.label}
                      {sec.count != null && (
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ml-auto ${
                          isActive ? 'bg-accent-light text-accent' : 'bg-surface-secondary text-text-muted'
                        }`}>
                          {sec.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══════ USERS SECTION ═══════ */}
      {activeSection === 'users' && (
        <>
          {/* Group Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.groupBreakdown.map((g) => {
              const Icon = getGroupIcon(g.icon);
              return (
                <div
                  key={g.id}
                  className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: g.color + '15' }}>
                      <Icon size={16} style={{ color: g.color }} />
                    </div>
                  </div>
                  <div className="text-xl font-bold font-mono text-text-primary">{g.count}</div>
                  <div className="text-xs text-text-muted mt-0.5">{g.name}</div>
                </div>
              );
            })}
          </div>

          {/* User Table */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-[#007AFF]" />
                <h3 className="text-sm font-semibold text-text-primary">Benutzerverwaltung</h3>
                <span className="text-xs font-mono text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
                  {filteredUsers.length}
                </span>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Suchen..."
                  className="bg-surface-secondary/80 border border-border-secondary rounded-lg pl-9 pr-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors w-56"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-secondary/40">
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Benutzer</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">E-Mail</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Gruppe</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Letzter Login</th>
                    <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isSelf = currentUser?.id === user.id;
                    const isEditing = editingGroupId === user.id;
                    const userGroup = groups.find((g) => g.id === user.groupId);

                    return (
                      <tr
                        key={user.id}
                        className="border-b border-border-secondary/60 hover:bg-accent-light/30 transition-colors"
                      >
                        {/* Name + Avatar */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: userGroup?.color || '#64748b' }}
                            >
                              {getInitials(user.name)}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-text-primary">
                                {user.name}
                                {isSelf && (
                                  <span className="ml-2 text-xs font-mono text-text-muted">(Du)</span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-text-muted">{user.id}</div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-5 py-3">
                          <span className="text-sm font-mono text-text-secondary">{user.email}</span>
                        </td>

                        {/* Group */}
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <select
                                defaultValue={user.groupId}
                                onChange={(e) => handleGroupChange(user.id, e.target.value)}
                                className="bg-surface-secondary/80 border border-[#007AFF] rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none appearance-none cursor-pointer"
                                autoFocus
                              >
                                {groups.map((g) => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => setEditingGroupId(null)}
                                className="p-1 rounded hover:bg-surface-secondary/60 text-text-muted"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {userGroup ? <GroupBadge group={userGroup} /> : (
                                <span className="text-xs text-text-muted">–</span>
                              )}
                              {user.installerTeam && (
                                <span className="text-[10px] text-text-muted">Team: {user.installerTeam}</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Last Login */}
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-text-muted">
                            {user.lastLogin
                              ? new Date(user.lastLogin).toLocaleString('de-DE', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '–'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingGroupId(isEditing ? null : user.id)}
                              className="p-1.5 rounded-md hover:bg-accent-light/60 text-text-muted hover:text-[#007AFF] transition-colors"
                              title="Gruppe ändern"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleResetPassword(user.id, user.name)}
                              className="p-1.5 rounded-md hover:bg-status-warning/10/60 text-text-muted hover:text-status-warning transition-colors"
                              title="Passwort zurücksetzen"
                            >
                              <Key size={14} />
                            </button>
                            {confirmDelete === user.id ? (
                              <div className="flex items-center gap-1 ml-1">
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="px-2 py-1 rounded-md bg-status-offline text-white text-xs font-medium hover:bg-status-offline transition-colors"
                                >
                                  Löschen
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="p-1 rounded-md hover:bg-surface-secondary/60 text-text-muted"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(user.id)}
                                disabled={isSelf}
                                className={`p-1.5 rounded-md transition-colors ${
                                  isSelf
                                    ? 'text-text-muted cursor-not-allowed'
                                    : 'hover:bg-status-offline/10/60 text-text-muted hover:text-status-offline'
                                }`}
                                title={isSelf ? 'Eigenen Account nicht löschbar' : 'Benutzer löschen'}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {loadingUsers && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-accent/20 border-t-blue-500 rounded-full animate-spin" />
                          <span className="text-xs text-text-muted">Lade Benutzer...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingUsers && filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <div className="text-text-muted text-sm">Keine Benutzer gefunden</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════ GROUPS SECTION ═══════ */}
      {activeSection === 'groups' && (
        <div className="space-y-4">
          {groups.map((group) => {
            const Icon = getGroupIcon(group.icon);
            const groupDetail = getGroupWithMembers(group.id);
            const members = groupDetail?.members || [];
            const isDeleteConfirm = confirmGroupDelete === group.id;

            return (
              <div
                key={group.id}
                className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card overflow-hidden"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary/40">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: group.color + '15' }}
                    >
                      <Icon size={20} style={{ color: group.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary">{group.name}</h3>
                        <span className="text-xs font-mono text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
                          {group.memberCount} Mitglieder
                        </span>
                        {group.id === 'grp_admin' && (
                          <span className="text-xs font-mono text-accent bg-accent-light/80 px-2 py-0.5 rounded">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">{group.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingGroup(group); setShowGroupModal(true); }}
                      className="p-2 rounded-lg hover:bg-accent-light/60 text-text-muted hover:text-[#007AFF] transition-colors"
                      title="Gruppe bearbeiten"
                    >
                      <Edit3 size={14} />
                    </button>
                    {group.id !== 'grp_admin' && (
                      isDeleteConfirm ? (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            className="px-2 py-1 rounded-md bg-status-offline text-white text-xs font-medium hover:bg-status-offline transition-colors"
                          >
                            Löschen
                          </button>
                          <button
                            onClick={() => setConfirmGroupDelete(null)}
                            className="p-1 rounded-md hover:bg-surface-secondary/60 text-text-muted"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmGroupDelete(group.id)}
                          className="p-2 rounded-lg hover:bg-status-offline/10/60 text-text-muted hover:text-status-offline transition-colors"
                          title="Gruppe löschen"
                        >
                          <Trash2 size={14} />
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Group Details */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Tabs */}
                  <div>
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                      Sichtbare Tabs
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tabs.filter((t) => {
                        const tab = ALL_TABS.find((at) => at.id === t);
                        return tab && !tab.parent;
                      }).map((tabId) => {
                        const tab = ALL_TABS.find((t) => t.id === tabId);
                        const TabIcon = TAB_ICONS[tabId] || Monitor;
                        return (
                          <span
                            key={tabId}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-surface-secondary/80 text-text-secondary border border-border-secondary/40"
                          >
                            <TabIcon size={10} />
                            {tab?.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                      Aktionen
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.actions.map((actionId) => {
                        const action = ALL_ACTIONS.find((a) => a.id === actionId);
                        return (
                          <span
                            key={actionId}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50/80 text-emerald-600 border border-emerald-200/40"
                          >
                            <Check size={10} />
                            {action?.label || actionId}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Members */}
                  <div>
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                      Mitglieder
                    </div>
                    {members.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {members.map((m) => (
                          <div key={m.id} className="flex items-center gap-1.5">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                              style={{ backgroundColor: group.color }}
                            >
                              {getInitials(m.name)}
                            </div>
                            <span className="text-xs text-text-secondary">{m.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted italic">Keine Mitglieder</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ AUDIT LOG SECTION ═══════ */}
      {activeSection === 'audit' && (
        <div className="space-y-4">
          {/* Audit Header with actions */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-semibold text-text-primary">Aktivitätsprotokoll</h3>
                <span className="text-xs font-mono text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
                  {filteredAuditLog.length} Einträge
                </span>
                <span className="text-xs font-mono text-accent bg-accent-light/80 px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock size={10} />
                  Timeout: {getSessionTimeoutMinutes() / 60}h
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    placeholder="Log durchsuchen..."
                    className="bg-surface-secondary/80 border border-border-secondary rounded-lg pl-9 pr-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors w-48"
                  />
                </div>
                <button
                  onClick={handleExportAuditLog}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-primary border border-border-secondary text-text-secondary hover:border-[#007AFF] hover:text-[#007AFF] transition-colors"
                  title="Als CSV exportieren"
                >
                  <Download size={13} />
                  CSV Export
                </button>
                <button
                  onClick={async () => { await refreshAuditLog(); showToast('Audit-Log aktualisiert'); }}
                  className="p-2 rounded-lg hover:bg-surface-secondary/60 text-text-muted hover:text-text-secondary transition-colors"
                  title="Aktualisieren"
                >
                  <Activity size={14} />
                </button>
              </div>
            </div>

            {/* DSGVO Info */}
            <div className="px-5 py-3 bg-accent-light/40 border-b border-accent/20/30">
              <p className="text-xs text-accent flex items-center gap-1.5">
                <FileText size={12} />
                <strong>DSGVO §47 Nachweispflicht:</strong> Alle sicherheitsrelevanten Aktionen werden serverseitig in der Airtable-Datenbank protokolliert. Logs sind persistent und revisionssicher.
              </p>
            </div>

            {/* Log Entries */}
            <div className="max-h-[600px] overflow-y-auto">
              {loadingAudit ? (
                <div className="p-12 text-center">
                  <div className="w-6 h-6 border-2 border-accent/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs text-text-muted">Lade Audit-Log...</p>
                </div>
              ) : filteredAuditLog.length === 0 ? (
                <div className="p-12 text-center">
                  <Activity size={32} className="text-text-muted mx-auto mb-3" />
                  <p className="text-sm text-text-muted">Keine Log-Einträge vorhanden</p>
                  <p className="text-xs text-text-muted font-mono mt-1">
                    Aktionen werden ab jetzt protokolliert
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100/60">
                  {filteredAuditLog.slice(0, 100).map((entry, idx) => {
                    const Icon = auditActionIcon(entry.action);
                    const color = auditActionColor(entry.action);
                    const date = new Date(entry.ts);
                    const timeStr = date.toLocaleString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-3 px-5 py-3 hover:bg-surface-secondary/30 transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{ backgroundColor: color + '15' }}
                        >
                          <Icon size={14} style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-text-primary truncate">
                              {entry.detail}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs font-mono text-text-muted">
                              {timeStr}
                            </span>
                            <span
                              className="text-xs font-mono px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: color + '15',
                                color: color,
                              }}
                            >
                              {entry.action}
                            </span>
                            <span className="text-xs text-text-muted">
                              {entry.userName}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {filteredAuditLog.length > 100 && (
              <div className="px-5 py-3 border-t border-border-secondary/40 text-center">
                <p className="text-xs text-text-muted font-mono">
                  Zeige 100 von {filteredAuditLog.length} Einträgen. Exportiere CSV für vollständige Daten.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ FEEDBACK SECTION ═══════ */}
      {activeSection === 'feedback' && (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-status-warning/10">
                  <AlertCircle size={16} className="text-status-warning" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-text-primary">{feedbackStats.open}</div>
              <div className="text-xs text-text-muted mt-0.5">Offen</div>
            </div>
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent-light">
                  <Eye size={16} className="text-accent" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-text-primary">{feedbackStats.in_review}</div>
              <div className="text-xs text-text-muted mt-0.5">In Review</div>
            </div>
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand-purple/10">
                  <ClipboardList size={16} className="text-brand-purple" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-text-primary">{feedbackStats.planned}</div>
              <div className="text-xs text-text-muted mt-0.5">Geplant</div>
            </div>
            <div className="bg-surface-primary border border-border-secondary rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50">
                  <Check size={16} className="text-emerald-500" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-text-primary">{feedbackStats.done}</div>
              <div className="text-xs text-text-muted mt-0.5">Erledigt</div>
            </div>
          </div>

          {/* Feedback Table */}
          <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-status-warning" />
                <h3 className="text-sm font-semibold text-text-primary">Feedback & Anfragen</h3>
                <span className="text-xs font-mono text-text-muted bg-surface-secondary/80 px-2 py-0.5 rounded">
                  {filteredFeedback.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Type Filter */}
                <div className="flex gap-1 bg-surface-secondary/80 rounded-lg p-0.5 border border-border-secondary">
                  {[
                    { key: 'all', label: 'Alle' },
                    { key: 'feature', label: 'Features' },
                    { key: 'bug', label: 'Bugs' },
                    { key: 'feedback', label: 'Feedback' },
                    { key: 'question', label: 'Fragen' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setFeedbackTypeFilter(t.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        feedbackTypeFilter === t.key
                          ? 'bg-surface-primary shadow-sm text-text-primary border border-border-secondary'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* Status Filter */}
                <div className="relative">
                  <select
                    value={feedbackStatusFilter}
                    onChange={(e) => setFeedbackStatusFilter(e.target.value)}
                    className="bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors appearance-none cursor-pointer pr-7"
                  >
                    <option value="all">Alle Status</option>
                    <option value="open">Offen</option>
                    <option value="in_review">In Review</option>
                    <option value="planned">Geplant</option>
                    <option value="in_progress">In Bearbeitung</option>
                    <option value="done">Erledigt</option>
                    <option value="rejected">Abgelehnt</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={feedbackFilter}
                    onChange={(e) => setFeedbackFilter(e.target.value)}
                    placeholder="Suchen..."
                    className="bg-surface-secondary/80 border border-border-secondary rounded-lg pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors w-48"
                  />
                </div>
                <button
                  onClick={() => refreshFeedback()}
                  className="p-2 rounded-lg hover:bg-surface-secondary/60 text-text-muted hover:text-text-secondary transition-colors"
                  title="Aktualisieren"
                >
                  <Activity size={14} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-secondary/40">
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3 w-10">Typ</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Titel</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Benutzer</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Priorität</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-5 py-3">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedback.map((item) => {
                    const TypeIcon = item.type === 'feature' ? Lightbulb : item.type === 'bug' ? Bug : item.type === 'feedback' ? Lightbulb : HelpCircle;
                    const typeColor = item.type === 'feature' ? '#FF9500' : item.type === 'bug' ? '#FF3B30' : item.type === 'feedback' ? '#AF52DE' : '#007AFF';
                    const priorityConfig = {
                      low: { label: 'Low', bg: 'bg-surface-secondary/80', text: 'text-text-secondary', border: 'border-border-secondary' },
                      medium: { label: 'Medium', bg: 'bg-accent-light/80', text: 'text-accent', border: 'border-accent/20/60' },
                      high: { label: 'High', bg: 'bg-status-warning/10/80', text: 'text-status-warning', border: 'border-status-warning/20/60' },
                      critical: { label: 'Critical', bg: 'bg-status-offline/10/80', text: 'text-status-offline', border: 'border-status-offline/20/60' },
                    };
                    const prio = priorityConfig[item.priority] || priorityConfig.medium;
                    const isExpanded = expandedFeedbackId === item.id;
                    const hasContext = item.click_x != null || item.url || item.component || item.context_data;

                    return (
                      <Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedFeedbackId(isExpanded ? null : item.id)}
                        className={`border-b border-border-secondary/60 hover:bg-accent-light/30 transition-colors cursor-pointer ${isExpanded ? 'bg-accent-light/20' : ''}`}
                      >
                        {/* Type Icon */}
                        <td className="px-5 py-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: typeColor + '15' }}
                          >
                            <TypeIcon size={14} style={{ color: typeColor }} />
                          </div>
                        </td>

                        {/* Title */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight size={12} className={`text-text-muted transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-text-primary truncate max-w-xs">
                                {item.title}
                              </div>
                              {item.description && (
                                <div className="text-xs text-text-muted truncate max-w-xs mt-0.5">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* User */}
                        <td className="px-5 py-3">
                          <span className="text-sm text-text-secondary">{item.user_name || '–'}</span>
                        </td>

                        {/* Priority */}
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="relative inline-block">
                            <select
                              value={item.priority || 'medium'}
                              onChange={(e) => updateFeedbackPriority(item.id, e.target.value)}
                              className={`${prio.bg} ${prio.text} ${prio.border} border rounded-full px-2.5 py-1 text-xs font-medium focus:outline-none appearance-none cursor-pointer pr-6`}
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="critical">Critical</option>
                            </select>
                            <ArrowUpDown size={10} className={`absolute right-2 top-1/2 -translate-y-1/2 ${prio.text} pointer-events-none`} />
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="relative inline-block">
                            <select
                              value={item.status || 'open'}
                              onChange={(e) => updateFeedbackStatus(item.id, e.target.value)}
                              className="bg-surface-secondary/80 border border-border-secondary rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary focus:outline-none focus:border-[#007AFF] appearance-none cursor-pointer pr-7 transition-colors"
                            >
                              <option value="open">Offen</option>
                              <option value="in_review">In Review</option>
                              <option value="planned">Geplant</option>
                              <option value="in_progress">In Bearbeitung</option>
                              <option value="done">Erledigt</option>
                              <option value="rejected">Abgelehnt</option>
                            </select>
                            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                          </div>
                        </td>

                        {/* Created */}
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-text-muted">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleString('de-DE', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '–'}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr className="bg-surface-secondary/40">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Description */}
                              {item.description && (
                                <div className="md:col-span-2">
                                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Beschreibung</div>
                                  <div className="text-sm text-text-primary bg-surface-primary border border-border-secondary/40 rounded-xl p-3 whitespace-pre-wrap">
                                    {item.description}
                                  </div>
                                </div>
                              )}

                              {/* Click Position & Context */}
                              {hasContext && (
                                <div>
                                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Kontext</div>
                                  <div className="space-y-1.5 bg-surface-primary border border-border-secondary/40 rounded-xl p-3">
                                    {item.component && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <Monitor size={11} className="text-text-muted shrink-0" />
                                        <span className="text-text-muted">Komponente:</span>
                                        <span className="font-mono text-text-primary">{item.component}</span>
                                      </div>
                                    )}
                                    {item.url && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <Globe size={11} className="text-text-muted shrink-0" />
                                        <span className="text-text-muted">URL:</span>
                                        <span className="font-mono text-text-primary truncate">{item.url}</span>
                                      </div>
                                    )}
                                    {item.click_x != null && item.click_y != null && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <MapPin size={11} className="text-status-offline shrink-0" />
                                        <span className="text-text-muted">Klick-Position:</span>
                                        <span className="font-mono text-status-offline">({item.click_x}, {item.click_y})</span>
                                      </div>
                                    )}
                                    {item.viewport_width && item.viewport_height && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <Monitor size={11} className="text-text-muted shrink-0" />
                                        <span className="text-text-muted">Viewport:</span>
                                        <span className="font-mono text-text-primary">{item.viewport_width} x {item.viewport_height}</span>
                                      </div>
                                    )}
                                    {item.user_agent && (
                                      <div className="flex items-start gap-2 text-xs">
                                        <Globe size={11} className="text-text-muted shrink-0 mt-0.5" />
                                        <span className="text-text-muted shrink-0">Browser:</span>
                                        <span className="font-mono text-text-secondary text-xs break-all leading-relaxed">{item.user_agent.slice(0, 120)}{item.user_agent.length > 120 ? '...' : ''}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Extra context data */}
                              {item.context_data && (
                                <div>
                                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Zusatzdaten</div>
                                  <div className="bg-surface-primary border border-border-secondary/40 rounded-xl p-3 space-y-1.5">
                                    {item.context_data.activeFilters && item.context_data.activeFilters.length > 0 && (
                                      <div className="text-xs">
                                        <span className="text-text-muted">Aktive Filter: </span>
                                        {item.context_data.activeFilters.map((f, i) => (
                                          <span key={i} className="inline-flex px-1.5 py-0.5 bg-accent-light text-accent rounded font-mono text-xs mr-1">
                                            {f.label}: {f.value}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {item.context_data.elementAtClick && (
                                      <div className="text-xs">
                                        <span className="text-text-muted">Element: </span>
                                        <span className="font-mono text-text-secondary">
                                          &lt;{item.context_data.elementAtClick.tag}&gt;
                                          {item.context_data.elementAtClick.text ? ` "${item.context_data.elementAtClick.text.slice(0, 50)}"` : ''}
                                        </span>
                                      </div>
                                    )}
                                    {item.context_data.devicePixelRatio && (
                                      <div className="text-xs">
                                        <span className="text-text-muted">DPR: </span>
                                        <span className="font-mono text-text-secondary">{item.context_data.devicePixelRatio}x</span>
                                      </div>
                                    )}
                                    {item.context_data.screenWidth && (
                                      <div className="text-xs">
                                        <span className="text-text-muted">Bildschirm: </span>
                                        <span className="font-mono text-text-secondary">{item.context_data.screenWidth} x {item.context_data.screenHeight}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Admin Notes */}
                              {item.admin_notes && (
                                <div className="md:col-span-2">
                                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Admin Notizen</div>
                                  <div className="text-sm text-text-primary bg-status-warning/10/50 border border-status-warning/20/40 rounded-xl p-3">
                                    {item.admin_notes}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}

                  {loadingFeedback && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-accent/20 border-t-blue-500 rounded-full animate-spin" />
                          <span className="text-xs text-text-muted">Lade Feedback...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingFeedback && filteredFeedback.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <Lightbulb size={32} className="text-text-muted mx-auto mb-3" />
                        <div className="text-sm text-text-muted">Kein Feedback vorhanden</div>
                        <p className="text-xs text-text-muted font-mono mt-1">
                          Feedback wird hier angezeigt, sobald Benutzer Anfragen einreichen
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ API Usage Section ═══════ */}
      {activeSection === 'api-usage' && (
        <div className="space-y-5">
          {/* Time Range + Refresh */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-surface-primary border border-border-secondary/40 rounded-lg p-0.5">
              {[
                { id: '24h', label: '24h' },
                { id: '7d', label: '7 Tage' },
                { id: '30d', label: '30 Tage' },
              ].map((range) => (
                <button
                  key={range.id}
                  onClick={() => setApiTimeRange(range.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    apiTimeRange === range.id
                      ? 'bg-surface-primary shadow-sm text-text-primary border border-border-secondary'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button
              onClick={refreshApiUsage}
              disabled={loadingApiUsage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-secondary transition-colors"
            >
              <RefreshCw size={13} className={loadingApiUsage ? 'animate-spin' : ''} />
              Aktualisieren
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">API Calls</span>
                <div className="w-7 h-7 rounded-lg bg-accent-light flex items-center justify-center">
                  <Zap size={14} className="text-accent" />
                </div>
              </div>
              <div className="text-2xl font-bold text-text-primary font-mono">{apiStats.totalCalls.toLocaleString('de-DE')}</div>
              <div className="text-xs text-text-muted mt-1 font-mono">{apiTimeRange === '24h' ? 'Letzte 24 Stunden' : apiTimeRange === '7d' ? 'Letzte 7 Tage' : 'Letzte 30 Tage'}</div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Kosten (est.)</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <DollarSign size={14} className="text-emerald-500" />
                </div>
              </div>
              <div className="text-2xl font-bold text-text-primary font-mono">
                ${(apiStats.totalCostCents / 100).toFixed(2)}
              </div>
              <div className="text-xs text-text-muted mt-1 font-mono">
                {apiStats.totalTokensIn > 0 ? `${((apiStats.totalTokensIn + apiStats.totalTokensOut) / 1000).toFixed(0)}k Tokens` : 'Keine Token-Daten'}
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Fehler</span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${apiStats.errorCount > 0 ? 'bg-status-offline/10' : 'bg-emerald-50'}`}>
                  <AlertCircle size={14} className={apiStats.errorCount > 0 ? 'text-status-offline' : 'text-emerald-500'} />
                </div>
              </div>
              <div className={`text-2xl font-bold font-mono ${apiStats.errorCount > 0 ? 'text-status-offline' : 'text-emerald-600'}`}>
                {apiStats.errorCount}
              </div>
              <div className="text-xs text-text-muted mt-1 font-mono">
                {apiStats.totalCalls > 0 ? `${(apiStats.errorCount / apiStats.totalCalls * 100).toFixed(1)}% Error-Rate` : '—'}
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Ø Latenz</span>
                <div className="w-7 h-7 rounded-lg bg-status-warning/10 flex items-center justify-center">
                  <Clock size={14} className="text-status-warning" />
                </div>
              </div>
              <div className="text-2xl font-bold text-text-primary font-mono">{apiStats.avgDuration}ms</div>
              <div className="text-xs text-text-muted mt-1 font-mono">Durchschnittliche Antwortzeit</div>
            </div>
          </div>

          {/* Service Breakdown */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-secondary flex items-center gap-2">
              <Server size={14} className="text-text-muted" />
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Kosten nach Service</span>
            </div>
            <div className="divide-y divide-slate-100/80">
              {Object.entries(apiStats.byService)
                .sort((a, b) => b[1].cost - a[1].cost)
                .map(([service, data]) => {
                  const serviceColors = {
                    anthropic: { bg: 'bg-brand-purple/10', text: 'text-brand-purple', bar: 'bg-purple-400' },
                    airtable: { bg: 'bg-accent-light', text: 'text-accent', bar: 'bg-blue-400' },
                    supabase: { bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-400' },
                    vistar: { bg: 'bg-status-warning/10', text: 'text-status-warning', bar: 'bg-orange-400' },
                    'google-sheets': { bg: 'bg-status-online/10', text: 'text-status-online', bar: 'bg-green-400' },
                    superchat: { bg: 'bg-cyan-50', text: 'text-cyan-600', bar: 'bg-cyan-400' },
                  };
                  const colors = serviceColors[service] || { bg: 'bg-surface-secondary', text: 'text-text-secondary', bar: 'bg-text-muted' };
                  const costPct = apiStats.totalCostCents > 0 ? (data.cost / apiStats.totalCostCents * 100) : 0;

                  return (
                    <div key={service} className="px-5 py-3 flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                        <Wifi size={14} className={colors.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-text-primary capitalize">{service}</span>
                          <span className="text-xs font-mono text-text-muted">${(data.cost / 100).toFixed(3)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                            <div className={`h-full ${colors.bar} rounded-full transition-all`} style={{ width: `${Math.max(costPct, 1)}%` }} />
                          </div>
                          <span className="text-xs font-mono text-text-muted shrink-0">{data.calls} calls</span>
                        </div>
                        {data.tokensIn > 0 && (
                          <div className="text-xs font-mono text-text-muted mt-0.5">
                            {(data.tokensIn / 1000).toFixed(0)}k in / {(data.tokensOut / 1000).toFixed(0)}k out tokens
                          </div>
                        )}
                      </div>
                      {data.errors > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-status-offline/10 text-status-offline font-mono shrink-0">{data.errors} err</span>
                      )}
                    </div>
                  );
                })}
              {Object.keys(apiStats.byService).length === 0 && (
                <div className="px-5 py-8 text-center">
                  <Zap size={24} className="text-text-muted mx-auto mb-2" />
                  <div className="text-sm text-text-muted">Noch keine API-Daten</div>
                  <p className="text-xs text-text-muted font-mono mt-1">Daten werden erfasst sobald API-Calls stattfinden</p>
                </div>
              )}
            </div>
          </div>

          {/* Function Breakdown Table */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-secondary flex items-center gap-2">
              <Code size={14} className="text-text-muted" />
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Calls nach Function</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-text-muted font-medium">
                    <th className="px-5 py-2.5 text-left">Function</th>
                    <th className="px-3 py-2.5 text-right">Calls</th>
                    <th className="px-3 py-2.5 text-right">Errors</th>
                    <th className="px-3 py-2.5 text-right">Ø Latenz</th>
                    <th className="px-5 py-2.5 text-right">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {Object.entries(apiStats.byFunction)
                    .sort((a, b) => b[1].calls - a[1].calls)
                    .map(([fn, data]) => (
                      <tr key={fn} className="hover:bg-surface-primary/60 transition-colors">
                        <td className="px-5 py-2.5 text-sm font-mono text-text-primary">{fn}</td>
                        <td className="px-3 py-2.5 text-sm font-mono text-text-secondary text-right">{data.calls}</td>
                        <td className="px-3 py-2.5 text-right">
                          {data.errors > 0 ? (
                            <span className="text-xs font-mono text-status-offline">{data.errors}</span>
                          ) : (
                            <span className="text-xs font-mono text-emerald-500">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm font-mono text-text-muted text-right">{data.avgMs}ms</td>
                        <td className="px-5 py-2.5 text-sm font-mono text-text-secondary text-right">${(data.cost / 100).toFixed(3)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Calls Log */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-secondary flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-text-muted" />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Letzte API Calls</span>
              </div>
              <span className="text-xs font-mono text-text-muted">{apiUsageData.length} Einträge</span>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-surface-primary">
                  <tr className="text-xs uppercase tracking-wider text-text-muted font-medium">
                    <th className="px-4 py-2 text-left">Zeit</th>
                    <th className="px-3 py-2 text-left">Function</th>
                    <th className="px-3 py-2 text-left">Service</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Latenz</th>
                    <th className="px-4 py-2 text-right">Kosten</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {apiUsageData.slice(0, 100).map((row) => (
                    <tr key={row.id} className="hover:bg-surface-primary/40 transition-colors text-xs">
                      <td className="px-4 py-2 font-mono text-text-muted whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-3 py-2 font-mono text-text-primary">{row.function_name}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                          row.service === 'anthropic' ? 'bg-brand-purple/10 text-brand-purple' :
                          row.service === 'airtable' ? 'bg-accent-light text-accent' :
                          row.service === 'supabase' ? 'bg-emerald-50 text-emerald-600' :
                          row.service === 'vistar' ? 'bg-status-warning/10 text-status-warning' :
                          'bg-surface-secondary text-text-secondary'
                        }`}>
                          {row.service}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.success ? (
                          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center text-xs font-bold">{row.status_code || '✓'}</span>
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-status-offline/10 text-status-offline inline-flex items-center justify-center text-xs font-bold">{row.status_code || '✗'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-text-muted text-right">{row.duration_ms ? `${row.duration_ms}ms` : '—'}</td>
                      <td className="px-4 py-2 font-mono text-text-secondary text-right">{row.estimated_cost_cents ? `$${(row.estimated_cost_cents / 100).toFixed(4)}` : '—'}</td>
                    </tr>
                  ))}
                  {loadingApiUsage && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center">
                        <div className="flex items-center justify-center gap-2 text-text-muted">
                          <RefreshCw size={14} className="animate-spin" />
                          <span className="text-sm">Lade API-Daten...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingApiUsage && apiUsageData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <Zap size={32} className="text-text-muted mx-auto mb-3" />
                        <div className="text-sm text-text-muted">Keine API-Daten vorhanden</div>
                        <p className="text-xs text-text-muted font-mono mt-1">
                          API-Calls werden automatisch geloggt sobald die Tabelle erstellt ist
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ATTACHMENTS SYNC SECTION ═══════ */}
      {activeSection === 'attachments' && (
        <div className="space-y-5">
          {/* Info Banner */}
          <div className="glass-card rounded-xl p-5 border-l-4 border-l-blue-400">
            <div className="flex items-start gap-3">
              <Server size={18} className="text-accent mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">Attachment Storage (Supabase)</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Airtable-Attachment-URLs laufen nach ca. 2 Stunden ab. Dieser Sync kopiert alle Anhänge
                  (Fotos, PDFs, Verträge) in den permanenten Supabase Storage. Gecachte URLs werden
                  automatisch im Dashboard verwendet.
                </p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Attachment-Sync starten
              </h3>
            </div>

            <div className="flex items-center gap-3 mb-4">
              {/* Table filter */}
              <div className="relative flex-1 max-w-xs">
                <select
                  value={syncTableFilter}
                  onChange={(e) => setSyncTableFilter(e.target.value)}
                  disabled={syncRunning}
                  className="w-full appearance-none px-3 py-2.5 bg-surface-secondary/80 border border-border-secondary rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#007AFF] transition-colors disabled:opacity-50"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px center',
                  }}
                >
                  <option value="all">Alle Tabellen</option>
                  <option value="acquisition">Akquise (Fotos, Verträge, FAW)</option>
                  <option value="installationen">Installationen (Protokolle)</option>
                  <option value="tasks">Tasks (Anhänge)</option>
                </select>
              </div>

              {/* Sync button */}
              <button
                onClick={handleSyncAttachments}
                disabled={syncRunning}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  syncRunning
                    ? 'bg-surface-secondary text-text-muted cursor-not-allowed'
                    : 'bg-[#007AFF] text-white hover:bg-[#2563eb]'
                }`}
              >
                {syncRunning ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Synchronisiere...
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Attachments synchronisieren
                  </>
                )}
              </button>
            </div>

            {/* Error */}
            {syncError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-status-offline/10/80 border border-status-offline/20/60 text-xs text-status-offline mb-4">
                <AlertCircle size={14} />
                {syncError}
              </div>
            )}

            {/* Results */}
            {syncResult && (
              <div className="space-y-4">
                {/* Summary KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-emerald-50/60 border border-emerald-200/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-emerald-700">{syncResult.totals?.uploaded || 0}</div>
                    <div className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mt-0.5">Hochgeladen</div>
                  </div>
                  <div className="bg-accent-light/60 border border-accent/20/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-blue-700">{syncResult.totals?.alreadyCached || 0}</div>
                    <div className="text-[10px] font-medium text-accent uppercase tracking-wider mt-0.5">Bereits gecached</div>
                  </div>
                  <div className="bg-surface-secondary/60 border border-border-secondary/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-text-primary">{syncResult.totals?.attachmentsFound || 0}</div>
                    <div className="text-[10px] font-medium text-text-secondary uppercase tracking-wider mt-0.5">Attachments gefunden</div>
                  </div>
                  <div className={`${(syncResult.totals?.errors || 0) > 0 ? 'bg-status-offline/10/60 border-status-offline/20/40' : 'bg-emerald-50/60 border-emerald-200/40'} border rounded-xl p-3 text-center`}>
                    <div className={`text-xl font-bold font-mono ${(syncResult.totals?.errors || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{syncResult.totals?.errors || 0}</div>
                    <div className={`text-[10px] font-medium uppercase tracking-wider mt-0.5 ${(syncResult.totals?.errors || 0) > 0 ? 'text-status-offline' : 'text-emerald-600'}`}>Fehler</div>
                  </div>
                </div>

                {/* Duration + filter */}
                <div className="flex items-center gap-3 text-xs text-text-muted font-mono">
                  <span>Dauer: {((syncResult.duration_ms || 0) / 1000).toFixed(1)}s</span>
                  <span className="text-text-muted">|</span>
                  <span>Filter: {syncResult.filter || 'all'}</span>
                  <span className="text-text-muted">|</span>
                  <span>Records: {syncResult.totals?.recordsFetched || 0}</span>
                </div>

                {/* Per-source breakdown */}
                {syncResult.sources?.length > 0 && (
                  <div className="glass-card rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border-secondary">
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Details pro Quelle</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-text-muted uppercase tracking-wider font-medium border-b border-border-secondary">
                            <th className="px-4 py-2 text-left">Quelle</th>
                            <th className="px-3 py-2 text-right">Records</th>
                            <th className="px-3 py-2 text-right">Gefunden</th>
                            <th className="px-3 py-2 text-right">Gecached</th>
                            <th className="px-3 py-2 text-right">Hochgeladen</th>
                            <th className="px-3 py-2 text-right">Fehler</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {syncResult.sources.map((src) => (
                            <tr key={src.name} className="hover:bg-surface-primary/40 transition-colors">
                              <td className="px-4 py-2 font-mono font-medium text-text-primary">{src.name}</td>
                              <td className="px-3 py-2 font-mono text-text-muted text-right">{src.records}</td>
                              <td className="px-3 py-2 font-mono text-text-muted text-right">{src.attachments}</td>
                              <td className="px-3 py-2 font-mono text-accent text-right">{src.cached}</td>
                              <td className="px-3 py-2 font-mono text-emerald-600 text-right">{src.uploaded}</td>
                              <td className={`px-3 py-2 font-mono text-right ${src.errors > 0 ? 'text-status-offline font-bold' : 'text-text-muted'}`}>{src.errors}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Error details */}
                {syncResult.sources?.some(s => s.error_details?.length > 0) && (
                  <div className="glass-card rounded-xl p-4 border-l-4 border-l-red-400">
                    <h4 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">Fehler-Details</h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {syncResult.sources.flatMap(s => (s.error_details || []).map(e => (
                        <div key={`${e.recordId}-${e.filename}`} className="text-xs font-mono text-status-offline">
                          <span className="text-status-offline">{e.recordId}</span> / {e.filename}: {e.error}
                        </div>
                      )))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Setup Instructions */}
          <div className="glass-card rounded-xl p-5 border-l-4 border-l-amber-400">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="text-status-warning mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-text-primary mb-2">Voraussetzungen (einmalig)</h4>
                <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
                  <li>
                    <span className="font-medium">attachment_cache</span> Tabelle in Supabase SQL Editor erstellen
                    <span className="text-text-muted ml-1">(siehe sql/add-attachment-cache.sql)</span>
                  </li>
                  <li>
                    <span className="font-medium">attachments</span> Storage Bucket in Supabase Dashboard erstellen
                    <span className="text-text-muted ml-1">(Storage &rarr; New Bucket &rarr; &quot;attachments&quot; &rarr; Public: ON)</span>
                  </li>
                  <li>
                    <span className="font-medium">SUPABASE_SERVICE_ROLE_KEY</span> als Netlify Environment Variable setzen
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DATA MAPPING SECTION ═══════ */}
      {activeSection === 'data-mapping' && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={20} className="animate-spin text-text-muted" />
          </div>
        }>
          <DataMappingPanel />
        </Suspense>
      )}

      {/* ═══════ FEATURE FLAGS SECTION ═══════ */}
      {activeSection === 'feature-flags' && (
        <FeatureFlagsSection
          featureFlags={featureFlags}
          setFeatureFlags={setFeatureFlags}
          flagsLoading={flagsLoading}
          setFlagsLoading={setFlagsLoading}
          refetchFlags={refetchFlags}
          showToast={(msg, type) => { setToast({ message: msg, type }); setTimeout(() => setToast(null), 3000); }}
        />
      )}

      {activeSection === 'api-overview' && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={20} className="animate-spin text-text-muted" />
          </div>
        }>
          <APIOverviewPanel />
        </Suspense>
      )}

      {activeSection === 'stammdaten-import' && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={20} className="animate-spin text-text-muted" />
          </div>
        }>
          <StammdatenImport />
        </Suspense>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddUser}
          groups={groups}
          installerTeams={installerTeams}
        />
      )}

      {showGroupModal && (
        <GroupEditModal
          group={editingGroup}
          onClose={() => { setShowGroupModal(false); setEditingGroup(null); }}
          onSave={handleGroupSave}
        />
      )}
    </div>
  );
}
