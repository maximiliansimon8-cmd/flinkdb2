import { useState, useMemo, useCallback, useEffect, Fragment, lazy, Suspense } from 'react';
import {
  Shield,
  Database,
  Users,
  UserPlus,
  Settings,
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
  Briefcase,
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
  Trash,
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

const DataMappingPanel = lazy(() => import('./DataMappingPanel'));
const APIOverviewPanel = lazy(() => import('./APIOverviewPanel'));

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
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4',
  '#ef4444', '#ec4899', '#f97316', '#14b8a6', '#64748b',
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

function AddUserModal({ onClose, onSave, groups }) {
  const [form, setForm] = useState({ name: '', email: '', groupId: groups[0]?.id || '', password: '***REMOVED_DEFAULT_PW***' });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white/90 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-xl w-full max-w-md mx-4 animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-[#3b82f6]" />
            <h3 className="text-sm font-semibold text-slate-900">Neuer Benutzer</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100/60 text-slate-500 hover:text-slate-900 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50/80 border border-red-200/60 text-xs text-red-600">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }}
              placeholder="Vor- und Nachname"
              autoFocus
              className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">E-Mail / Benutzername</label>
            <input
              type="text"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }}
              placeholder="email@beispiel.de"
              className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Gruppe</label>
            <div className="relative">
              <select
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors appearance-none cursor-pointer"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Passwort</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Standard: ***REMOVED_DEFAULT_PW***"
              className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white/60 backdrop-blur-xl border border-slate-200/60 text-slate-600 hover:bg-white/80 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-xl w-full max-w-2xl mx-4 animate-fade-in max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#3b82f6]" />
            <h3 className="text-sm font-semibold text-slate-900">
              {isNew ? 'Neue Gruppe erstellen' : `Gruppe bearbeiten: ${group.name}`}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100/60 text-slate-500 hover:text-slate-900 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50/80 border border-red-200/60 text-xs text-red-600">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Name + Description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Gruppenname</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }}
                placeholder="z.B. Operations"
                autoFocus
                className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Beschreibung</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Kurze Beschreibung..."
                className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
            </div>
          </div>

          {/* Color Picker */}
          <div>
            <label className="text-xs text-slate-500 block mb-2">
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
                    form.color === c ? 'border-slate-900 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div>
            <label className="text-xs text-slate-500 block mb-2">
              <Monitor size={12} className="inline mr-1" />
              Sichtbare Tabs
            </label>
            <div className="space-y-2">
              {mainTabs.map((tab) => {
                const subs = getSubTabs(tab.id);
                const isChecked = form.tabs.includes(tab.id);
                const TabIcon = TAB_ICONS[tab.id] || Monitor;

                return (
                  <div key={tab.id} className="border border-slate-200/40 rounded-xl p-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <button
                        type="button"
                        onClick={() => toggleTab(tab.id)}
                        className="shrink-0"
                      >
                        {isChecked ? (
                          <ToggleRight size={20} style={{ color: form.color }} />
                        ) : (
                          <ToggleLeft size={20} className="text-slate-500" />
                        )}
                      </button>
                      <TabIcon size={14} className={isChecked ? 'text-slate-700' : 'text-slate-500'} />
                      <span className={`text-sm font-medium ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>
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
                                  ? 'border-blue-200 bg-blue-50/80 text-blue-700'
                                  : 'border-slate-200/60 bg-slate-50/60 text-slate-500 hover:border-slate-300'
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
            <label className="text-xs text-slate-500 block mb-2">
              <Key size={12} className="inline mr-1" />
              Erlaubte Aktionen
            </label>
            <div className="space-y-3">
              {Object.entries(actionsByCategory).map(([category, actions]) => (
                <div key={category} className="border border-slate-200/40 rounded-xl p-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
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
                              : 'bg-slate-50/60 text-slate-500 border-slate-200/60 hover:border-slate-300'
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
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white/60 backdrop-blur-xl border border-slate-200/60 text-slate-600 hover:bg-white/80 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
            >
              {isNew ? 'Erstellen' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Admin Panel ─── */

export default function AdminPanel({ initialSection, onSectionChange }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState(() => getAllGroups());
  const [activeSection, setActiveSectionRaw] = useState(initialSection || 'users');
  const setActiveSection = useCallback((sec) => {
    setActiveSectionRaw(sec);
    onSectionChange?.(sec);
  }, [onSectionChange]);
  const [showAddModal, setShowAddModal] = useState(false);
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
    if (action.includes('login_failed') || action.includes('deleted')) return '#ef4444';
    if (action.includes('login') || action.includes('created')) return '#22c55e';
    if (action.includes('logout') || action.includes('expired')) return '#f59e0b';
    if (action.includes('password')) return '#3b82f6';
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

  const sections = [
    { id: 'users', label: 'Benutzer', icon: Users, count: stats.totalUsers },
    { id: 'groups', label: 'Gruppen', icon: Layers, count: stats.totalGroups },
    { id: 'audit', label: 'Audit-Log', icon: FileText, count: auditLog.length },
    { id: 'feedback', label: 'Feedback', icon: Lightbulb, count: feedbackItems.length },
    { id: 'api-usage', label: 'API Usage', icon: Zap, count: apiStats.totalCalls },
    { id: 'attachments', label: 'Attachments', icon: Server },
    { id: 'data-mapping', label: 'Data Mapping', icon: Database, count: 14 },
    { id: 'api-overview', label: 'API Overview', icon: Globe, count: 7 },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg backdrop-blur-xl border animate-fade-in ${
          toast.type === 'error'
            ? 'bg-red-50/90 border-red-200/60 text-red-700'
            : 'bg-emerald-50/90 border-emerald-200/60 text-emerald-700'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/10 flex items-center justify-center">
            <Shield size={20} className="text-[#3b82f6]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Admin Panel</h2>
            <p className="text-xs text-slate-500 font-mono">Benutzer- & Gruppenverwaltung</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeSection === 'users' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
            >
              <UserPlus size={16} />
              Benutzer hinzufügen
            </button>
          )}
          {activeSection === 'groups' && (
            <button
              onClick={() => { setEditingGroup(null); setShowGroupModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
            >
              <Plus size={16} />
              Neue Gruppe
            </button>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-white/40 backdrop-blur-sm border border-slate-200/40 rounded-xl p-1">
        {sections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                isActive
                  ? 'bg-white/80 text-slate-900 shadow-sm border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-600'
              }`}
            >
              <Icon size={16} />
              {sec.label}
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                isActive ? 'bg-blue-50 text-blue-600' : 'bg-slate-50/60 text-slate-500'
              }`}>
                {sec.count}
              </span>
            </button>
          );
        })}
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
                  className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: g.color + '15' }}>
                      <Icon size={16} style={{ color: g.color }} />
                    </div>
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-900">{g.count}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{g.name}</div>
                </div>
              );
            })}
          </div>

          {/* User Table */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-[#3b82f6]" />
                <h3 className="text-sm font-semibold text-slate-900">Benutzerverwaltung</h3>
                <span className="text-xs font-mono text-slate-500 bg-slate-50/80 px-2 py-0.5 rounded">
                  {filteredUsers.length}
                </span>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Suchen..."
                  className="bg-slate-50/80 border border-slate-200/60 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors w-56"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/40">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Benutzer</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">E-Mail</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Gruppe</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Letzter Login</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Aktionen</th>
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
                        className="border-b border-slate-100/60 hover:bg-blue-50/30 transition-colors"
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
                              <div className="text-sm font-medium text-slate-900">
                                {user.name}
                                {isSelf && (
                                  <span className="ml-2 text-xs font-mono text-slate-500">(Du)</span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-slate-500">{user.id}</div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-5 py-3">
                          <span className="text-sm font-mono text-slate-600">{user.email}</span>
                        </td>

                        {/* Group */}
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <select
                                defaultValue={user.groupId}
                                onChange={(e) => handleGroupChange(user.id, e.target.value)}
                                className="bg-slate-50/80 border border-[#3b82f6] rounded-lg px-2 py-1.5 text-xs text-slate-900 focus:outline-none appearance-none cursor-pointer"
                                autoFocus
                              >
                                {groups.map((g) => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => setEditingGroupId(null)}
                                className="p-1 rounded hover:bg-slate-100/60 text-slate-500"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            userGroup ? <GroupBadge group={userGroup} /> : (
                              <span className="text-xs text-slate-500">–</span>
                            )
                          )}
                        </td>

                        {/* Last Login */}
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-slate-500">
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
                              className="p-1.5 rounded-md hover:bg-blue-50/60 text-slate-500 hover:text-[#3b82f6] transition-colors"
                              title="Gruppe ändern"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleResetPassword(user.id, user.name)}
                              className="p-1.5 rounded-md hover:bg-amber-50/60 text-slate-500 hover:text-amber-600 transition-colors"
                              title="Passwort zurücksetzen"
                            >
                              <Key size={14} />
                            </button>
                            {confirmDelete === user.id ? (
                              <div className="flex items-center gap-1 ml-1">
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="px-2 py-1 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                                >
                                  Löschen
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="p-1 rounded-md hover:bg-slate-100/60 text-slate-500"
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
                                    ? 'text-slate-200 cursor-not-allowed'
                                    : 'hover:bg-red-50/60 text-slate-500 hover:text-red-500'
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
                          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                          <span className="text-xs text-slate-500">Lade Benutzer...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingUsers && filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <div className="text-slate-500 text-sm">Keine Benutzer gefunden</div>
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
                className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03] overflow-hidden"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/40">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: group.color + '15' }}
                    >
                      <Icon size={20} style={{ color: group.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
                        <span className="text-xs font-mono text-slate-500 bg-slate-50/80 px-2 py-0.5 rounded">
                          {group.memberCount} Mitglieder
                        </span>
                        {group.id === 'grp_admin' && (
                          <span className="text-xs font-mono text-blue-500 bg-blue-50/80 px-2 py-0.5 rounded">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingGroup(group); setShowGroupModal(true); }}
                      className="p-2 rounded-lg hover:bg-blue-50/60 text-slate-500 hover:text-[#3b82f6] transition-colors"
                      title="Gruppe bearbeiten"
                    >
                      <Edit3 size={14} />
                    </button>
                    {group.id !== 'grp_admin' && (
                      isDeleteConfirm ? (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            className="px-2 py-1 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                          >
                            Löschen
                          </button>
                          <button
                            onClick={() => setConfirmGroupDelete(null)}
                            className="p-1 rounded-md hover:bg-slate-100/60 text-slate-500"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmGroupDelete(group.id)}
                          className="p-2 rounded-lg hover:bg-red-50/60 text-slate-500 hover:text-red-500 transition-colors"
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
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
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
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-50/80 text-slate-600 border border-slate-200/40"
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
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
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
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
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
                            <span className="text-xs text-slate-600">{m.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Keine Mitglieder</span>
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
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-900">Aktivitätsprotokoll</h3>
                <span className="text-xs font-mono text-slate-500 bg-slate-50/80 px-2 py-0.5 rounded">
                  {filteredAuditLog.length} Einträge
                </span>
                <span className="text-xs font-mono text-blue-400 bg-blue-50/80 px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock size={10} />
                  Timeout: {getSessionTimeoutMinutes() / 60}h
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    placeholder="Log durchsuchen..."
                    className="bg-slate-50/80 border border-slate-200/60 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors w-48"
                  />
                </div>
                <button
                  onClick={handleExportAuditLog}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white/60 border border-slate-200/60 text-slate-600 hover:border-[#3b82f6] hover:text-[#3b82f6] transition-colors"
                  title="Als CSV exportieren"
                >
                  <Download size={13} />
                  CSV Export
                </button>
                <button
                  onClick={async () => { await refreshAuditLog(); showToast('Audit-Log aktualisiert'); }}
                  className="p-2 rounded-lg hover:bg-slate-100/60 text-slate-500 hover:text-slate-600 transition-colors"
                  title="Aktualisieren"
                >
                  <Activity size={14} />
                </button>
              </div>
            </div>

            {/* DSGVO Info */}
            <div className="px-5 py-3 bg-blue-50/40 border-b border-blue-200/30">
              <p className="text-xs text-blue-600 flex items-center gap-1.5">
                <FileText size={12} />
                <strong>DSGVO §47 Nachweispflicht:</strong> Alle sicherheitsrelevanten Aktionen werden serverseitig in der Airtable-Datenbank protokolliert. Logs sind persistent und revisionssicher.
              </p>
            </div>

            {/* Log Entries */}
            <div className="max-h-[600px] overflow-y-auto">
              {loadingAudit ? (
                <div className="p-12 text-center">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs text-slate-500">Lade Audit-Log...</p>
                </div>
              ) : filteredAuditLog.length === 0 ? (
                <div className="p-12 text-center">
                  <Activity size={32} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Keine Log-Einträge vorhanden</p>
                  <p className="text-xs text-slate-500 font-mono mt-1">
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
                        className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/30 transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                          style={{ backgroundColor: color + '15' }}
                        >
                          <Icon size={14} style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {entry.detail}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs font-mono text-slate-500">
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
                            <span className="text-xs text-slate-500">
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
              <div className="px-5 py-3 border-t border-slate-200/40 text-center">
                <p className="text-xs text-slate-500 font-mono">
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
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50">
                  <AlertCircle size={16} className="text-amber-500" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900">{feedbackStats.open}</div>
              <div className="text-xs text-slate-500 mt-0.5">Offen</div>
            </div>
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50">
                  <Eye size={16} className="text-blue-500" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900">{feedbackStats.in_review}</div>
              <div className="text-xs text-slate-500 mt-0.5">In Review</div>
            </div>
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-50">
                  <ClipboardList size={16} className="text-purple-500" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900">{feedbackStats.planned}</div>
              <div className="text-xs text-slate-500 mt-0.5">Geplant</div>
            </div>
            <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl p-4 shadow-sm shadow-black/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50">
                  <Check size={16} className="text-emerald-500" />
                </div>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900">{feedbackStats.done}</div>
              <div className="text-xs text-slate-500 mt-0.5">Erledigt</div>
            </div>
          </div>

          {/* Feedback Table */}
          <div className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-sm shadow-black/[0.03]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900">Feedback & Anfragen</h3>
                <span className="text-xs font-mono text-slate-500 bg-slate-50/80 px-2 py-0.5 rounded">
                  {filteredFeedback.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Type Filter */}
                <div className="flex gap-1 bg-slate-50/80 rounded-lg p-0.5 border border-slate-200/60">
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
                          ? 'bg-white shadow-sm text-slate-900 border border-slate-200/60'
                          : 'text-slate-500 hover:text-slate-600'
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
                    className="bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors appearance-none cursor-pointer pr-7"
                  >
                    <option value="all">Alle Status</option>
                    <option value="open">Offen</option>
                    <option value="in_review">In Review</option>
                    <option value="planned">Geplant</option>
                    <option value="in_progress">In Bearbeitung</option>
                    <option value="done">Erledigt</option>
                    <option value="rejected">Abgelehnt</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={feedbackFilter}
                    onChange={(e) => setFeedbackFilter(e.target.value)}
                    placeholder="Suchen..."
                    className="bg-slate-50/80 border border-slate-200/60 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors w-48"
                  />
                </div>
                <button
                  onClick={() => refreshFeedback()}
                  className="p-2 rounded-lg hover:bg-slate-100/60 text-slate-500 hover:text-slate-600 transition-colors"
                  title="Aktualisieren"
                >
                  <Activity size={14} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/40">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3 w-10">Typ</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Titel</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Benutzer</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Priorität</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-3">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedback.map((item) => {
                    const TypeIcon = item.type === 'feature' ? Lightbulb : item.type === 'bug' ? Bug : item.type === 'feedback' ? Lightbulb : HelpCircle;
                    const typeColor = item.type === 'feature' ? '#f59e0b' : item.type === 'bug' ? '#ef4444' : item.type === 'feedback' ? '#8b5cf6' : '#3b82f6';
                    const priorityConfig = {
                      low: { label: 'Low', bg: 'bg-slate-50/80', text: 'text-slate-600', border: 'border-slate-200/60' },
                      medium: { label: 'Medium', bg: 'bg-blue-50/80', text: 'text-blue-600', border: 'border-blue-200/60' },
                      high: { label: 'High', bg: 'bg-amber-50/80', text: 'text-amber-600', border: 'border-amber-200/60' },
                      critical: { label: 'Critical', bg: 'bg-red-50/80', text: 'text-red-600', border: 'border-red-200/60' },
                    };
                    const prio = priorityConfig[item.priority] || priorityConfig.medium;
                    const isExpanded = expandedFeedbackId === item.id;
                    const hasContext = item.click_x != null || item.url || item.component || item.context_data;

                    return (
                      <Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedFeedbackId(isExpanded ? null : item.id)}
                        className={`border-b border-slate-100/60 hover:bg-blue-50/30 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/20' : ''}`}
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
                            <ChevronRight size={12} className={`text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900 truncate max-w-xs">
                                {item.title}
                              </div>
                              {item.description && (
                                <div className="text-xs text-slate-500 truncate max-w-xs mt-0.5">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* User */}
                        <td className="px-5 py-3">
                          <span className="text-sm text-slate-600">{item.user_name || '–'}</span>
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
                              className="bg-slate-50/80 border border-slate-200/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-[#3b82f6] appearance-none cursor-pointer pr-7 transition-colors"
                            >
                              <option value="open">Offen</option>
                              <option value="in_review">In Review</option>
                              <option value="planned">Geplant</option>
                              <option value="in_progress">In Bearbeitung</option>
                              <option value="done">Erledigt</option>
                              <option value="rejected">Abgelehnt</option>
                            </select>
                            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                          </div>
                        </td>

                        {/* Created */}
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-slate-500">
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
                        <tr className="bg-slate-50/40">
                          <td colSpan={6} className="px-5 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Description */}
                              {item.description && (
                                <div className="md:col-span-2">
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Beschreibung</div>
                                  <div className="text-sm text-slate-700 bg-white/60 border border-slate-200/40 rounded-xl p-3 whitespace-pre-wrap">
                                    {item.description}
                                  </div>
                                </div>
                              )}

                              {/* Click Position & Context */}
                              {hasContext && (
                                <div>
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Kontext</div>
                                  <div className="space-y-1.5 bg-white/60 border border-slate-200/40 rounded-xl p-3">
                                    {item.component && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <Monitor size={11} className="text-slate-400 shrink-0" />
                                        <span className="text-slate-500">Komponente:</span>
                                        <span className="font-mono text-slate-700">{item.component}</span>
                                      </div>
                                    )}
                                    {item.url && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <Globe size={11} className="text-slate-400 shrink-0" />
                                        <span className="text-slate-500">URL:</span>
                                        <span className="font-mono text-slate-700 truncate">{item.url}</span>
                                      </div>
                                    )}
                                    {item.click_x != null && item.click_y != null && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <MapPin size={11} className="text-red-400 shrink-0" />
                                        <span className="text-slate-500">Klick-Position:</span>
                                        <span className="font-mono text-red-600">({item.click_x}, {item.click_y})</span>
                                      </div>
                                    )}
                                    {item.viewport_width && item.viewport_height && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <Monitor size={11} className="text-slate-400 shrink-0" />
                                        <span className="text-slate-500">Viewport:</span>
                                        <span className="font-mono text-slate-700">{item.viewport_width} x {item.viewport_height}</span>
                                      </div>
                                    )}
                                    {item.user_agent && (
                                      <div className="flex items-start gap-2 text-xs">
                                        <Globe size={11} className="text-slate-400 shrink-0 mt-0.5" />
                                        <span className="text-slate-500 shrink-0">Browser:</span>
                                        <span className="font-mono text-slate-600 text-xs break-all leading-relaxed">{item.user_agent.slice(0, 120)}{item.user_agent.length > 120 ? '...' : ''}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Extra context data */}
                              {item.context_data && (
                                <div>
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Zusatzdaten</div>
                                  <div className="bg-white/60 border border-slate-200/40 rounded-xl p-3 space-y-1.5">
                                    {item.context_data.activeFilters && item.context_data.activeFilters.length > 0 && (
                                      <div className="text-xs">
                                        <span className="text-slate-500">Aktive Filter: </span>
                                        {item.context_data.activeFilters.map((f, i) => (
                                          <span key={i} className="inline-flex px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-mono text-xs mr-1">
                                            {f.label}: {f.value}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {item.context_data.elementAtClick && (
                                      <div className="text-xs">
                                        <span className="text-slate-500">Element: </span>
                                        <span className="font-mono text-slate-600">
                                          &lt;{item.context_data.elementAtClick.tag}&gt;
                                          {item.context_data.elementAtClick.text ? ` "${item.context_data.elementAtClick.text.slice(0, 50)}"` : ''}
                                        </span>
                                      </div>
                                    )}
                                    {item.context_data.devicePixelRatio && (
                                      <div className="text-xs">
                                        <span className="text-slate-500">DPR: </span>
                                        <span className="font-mono text-slate-600">{item.context_data.devicePixelRatio}x</span>
                                      </div>
                                    )}
                                    {item.context_data.screenWidth && (
                                      <div className="text-xs">
                                        <span className="text-slate-500">Bildschirm: </span>
                                        <span className="font-mono text-slate-600">{item.context_data.screenWidth} x {item.context_data.screenHeight}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Admin Notes */}
                              {item.admin_notes && (
                                <div className="md:col-span-2">
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Admin Notizen</div>
                                  <div className="text-sm text-slate-700 bg-amber-50/50 border border-amber-200/40 rounded-xl p-3">
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
                          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                          <span className="text-xs text-slate-500">Lade Feedback...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingFeedback && filteredFeedback.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <Lightbulb size={32} className="text-slate-200 mx-auto mb-3" />
                        <div className="text-sm text-slate-500">Kein Feedback vorhanden</div>
                        <p className="text-xs text-slate-500 font-mono mt-1">
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
            <div className="flex gap-1 bg-white/40 backdrop-blur-sm border border-slate-200/40 rounded-lg p-0.5">
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
                      ? 'bg-white shadow-sm text-slate-900 border border-slate-200/60'
                      : 'text-slate-500 hover:text-slate-600'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button
              onClick={refreshApiUsage}
              disabled={loadingApiUsage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-white/60 transition-colors"
            >
              <RefreshCw size={13} className={loadingApiUsage ? 'animate-spin' : ''} />
              Aktualisieren
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">API Calls</span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Zap size={14} className="text-blue-500" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-800 font-mono">{apiStats.totalCalls.toLocaleString('de-DE')}</div>
              <div className="text-xs text-slate-500 mt-1 font-mono">{apiTimeRange === '24h' ? 'Letzte 24 Stunden' : apiTimeRange === '7d' ? 'Letzte 7 Tage' : 'Letzte 30 Tage'}</div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Kosten (est.)</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <DollarSign size={14} className="text-emerald-500" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-800 font-mono">
                ${(apiStats.totalCostCents / 100).toFixed(2)}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                {apiStats.totalTokensIn > 0 ? `${((apiStats.totalTokensIn + apiStats.totalTokensOut) / 1000).toFixed(0)}k Tokens` : 'Keine Token-Daten'}
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fehler</span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${apiStats.errorCount > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                  <AlertCircle size={14} className={apiStats.errorCount > 0 ? 'text-red-500' : 'text-emerald-500'} />
                </div>
              </div>
              <div className={`text-2xl font-bold font-mono ${apiStats.errorCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {apiStats.errorCount}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                {apiStats.totalCalls > 0 ? `${(apiStats.errorCount / apiStats.totalCalls * 100).toFixed(1)}% Error-Rate` : '—'}
              </div>
            </div>

            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ø Latenz</span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock size={14} className="text-amber-500" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-800 font-mono">{apiStats.avgDuration}ms</div>
              <div className="text-xs text-slate-500 mt-1 font-mono">Durchschnittliche Antwortzeit</div>
            </div>
          </div>

          {/* Service Breakdown */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
              <Server size={14} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Kosten nach Service</span>
            </div>
            <div className="divide-y divide-slate-100/80">
              {Object.entries(apiStats.byService)
                .sort((a, b) => b[1].cost - a[1].cost)
                .map(([service, data]) => {
                  const serviceColors = {
                    anthropic: { bg: 'bg-purple-50', text: 'text-purple-600', bar: 'bg-purple-400' },
                    airtable: { bg: 'bg-blue-50', text: 'text-blue-600', bar: 'bg-blue-400' },
                    supabase: { bg: 'bg-emerald-50', text: 'text-emerald-600', bar: 'bg-emerald-400' },
                    vistar: { bg: 'bg-orange-50', text: 'text-orange-600', bar: 'bg-orange-400' },
                    'google-sheets': { bg: 'bg-green-50', text: 'text-green-600', bar: 'bg-green-400' },
                    superchat: { bg: 'bg-cyan-50', text: 'text-cyan-600', bar: 'bg-cyan-400' },
                  };
                  const colors = serviceColors[service] || { bg: 'bg-slate-50', text: 'text-slate-600', bar: 'bg-slate-400' };
                  const costPct = apiStats.totalCostCents > 0 ? (data.cost / apiStats.totalCostCents * 100) : 0;

                  return (
                    <div key={service} className="px-5 py-3 flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center shrink-0`}>
                        <Wifi size={14} className={colors.text} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-800 capitalize">{service}</span>
                          <span className="text-xs font-mono text-slate-500">${(data.cost / 100).toFixed(3)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${colors.bar} rounded-full transition-all`} style={{ width: `${Math.max(costPct, 1)}%` }} />
                          </div>
                          <span className="text-xs font-mono text-slate-500 shrink-0">{data.calls} calls</span>
                        </div>
                        {data.tokensIn > 0 && (
                          <div className="text-xs font-mono text-slate-500 mt-0.5">
                            {(data.tokensIn / 1000).toFixed(0)}k in / {(data.tokensOut / 1000).toFixed(0)}k out tokens
                          </div>
                        )}
                      </div>
                      {data.errors > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500 font-mono shrink-0">{data.errors} err</span>
                      )}
                    </div>
                  );
                })}
              {Object.keys(apiStats.byService).length === 0 && (
                <div className="px-5 py-8 text-center">
                  <Zap size={24} className="text-slate-200 mx-auto mb-2" />
                  <div className="text-sm text-slate-500">Noch keine API-Daten</div>
                  <p className="text-xs text-slate-500 font-mono mt-1">Daten werden erfasst sobald API-Calls stattfinden</p>
                </div>
              )}
            </div>
          </div>

          {/* Function Breakdown Table */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200/60 flex items-center gap-2">
              <Code size={14} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Calls nach Function</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500 font-medium">
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
                      <tr key={fn} className="hover:bg-white/40 transition-colors">
                        <td className="px-5 py-2.5 text-sm font-mono text-slate-800">{fn}</td>
                        <td className="px-3 py-2.5 text-sm font-mono text-slate-600 text-right">{data.calls}</td>
                        <td className="px-3 py-2.5 text-right">
                          {data.errors > 0 ? (
                            <span className="text-xs font-mono text-red-500">{data.errors}</span>
                          ) : (
                            <span className="text-xs font-mono text-emerald-500">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm font-mono text-slate-500 text-right">{data.avgMs}ms</td>
                        <td className="px-5 py-2.5 text-sm font-mono text-slate-600 text-right">${(data.cost / 100).toFixed(3)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Calls Log */}
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-slate-500" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Letzte API Calls</span>
              </div>
              <span className="text-xs font-mono text-slate-500">{apiUsageData.length} Einträge</span>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white/90 backdrop-blur-sm">
                  <tr className="text-xs uppercase tracking-wider text-slate-500 font-medium">
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
                    <tr key={row.id} className="hover:bg-white/30 transition-colors text-xs">
                      <td className="px-4 py-2 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-700">{row.function_name}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                          row.service === 'anthropic' ? 'bg-purple-50 text-purple-600' :
                          row.service === 'airtable' ? 'bg-blue-50 text-blue-600' :
                          row.service === 'supabase' ? 'bg-emerald-50 text-emerald-600' :
                          row.service === 'vistar' ? 'bg-orange-50 text-orange-600' :
                          'bg-slate-50 text-slate-600'
                        }`}>
                          {row.service}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.success ? (
                          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center text-xs font-bold">{row.status_code || '✓'}</span>
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-red-100 text-red-600 inline-flex items-center justify-center text-xs font-bold">{row.status_code || '✗'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500 text-right">{row.duration_ms ? `${row.duration_ms}ms` : '—'}</td>
                      <td className="px-4 py-2 font-mono text-slate-600 text-right">{row.estimated_cost_cents ? `$${(row.estimated_cost_cents / 100).toFixed(4)}` : '—'}</td>
                    </tr>
                  ))}
                  {loadingApiUsage && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-500">
                          <RefreshCw size={14} className="animate-spin" />
                          <span className="text-sm">Lade API-Daten...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingApiUsage && apiUsageData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <Zap size={32} className="text-slate-200 mx-auto mb-3" />
                        <div className="text-sm text-slate-500">Keine API-Daten vorhanden</div>
                        <p className="text-xs text-slate-500 font-mono mt-1">
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
              <Server size={18} className="text-blue-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Attachment Storage (Supabase)</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
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
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
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
                  className="w-full appearance-none px-3 py-2.5 bg-slate-50/80 border border-slate-200/60 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-50"
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
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-[#3b82f6] text-white hover:bg-[#2563eb]'
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
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50/80 border border-red-200/60 text-xs text-red-600 mb-4">
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
                  <div className="bg-blue-50/60 border border-blue-200/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-blue-700">{syncResult.totals?.alreadyCached || 0}</div>
                    <div className="text-[10px] font-medium text-blue-600 uppercase tracking-wider mt-0.5">Bereits gecached</div>
                  </div>
                  <div className="bg-slate-50/60 border border-slate-200/40 rounded-xl p-3 text-center">
                    <div className="text-xl font-bold font-mono text-slate-700">{syncResult.totals?.attachmentsFound || 0}</div>
                    <div className="text-[10px] font-medium text-slate-600 uppercase tracking-wider mt-0.5">Attachments gefunden</div>
                  </div>
                  <div className={`${(syncResult.totals?.errors || 0) > 0 ? 'bg-red-50/60 border-red-200/40' : 'bg-emerald-50/60 border-emerald-200/40'} border rounded-xl p-3 text-center`}>
                    <div className={`text-xl font-bold font-mono ${(syncResult.totals?.errors || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{syncResult.totals?.errors || 0}</div>
                    <div className={`text-[10px] font-medium uppercase tracking-wider mt-0.5 ${(syncResult.totals?.errors || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Fehler</div>
                  </div>
                </div>

                {/* Duration + filter */}
                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                  <span>Dauer: {((syncResult.duration_ms || 0) / 1000).toFixed(1)}s</span>
                  <span className="text-slate-300">|</span>
                  <span>Filter: {syncResult.filter || 'all'}</span>
                  <span className="text-slate-300">|</span>
                  <span>Records: {syncResult.totals?.recordsFetched || 0}</span>
                </div>

                {/* Per-source breakdown */}
                {syncResult.sources?.length > 0 && (
                  <div className="glass-card rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-200/60">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Details pro Quelle</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 uppercase tracking-wider font-medium border-b border-slate-100">
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
                            <tr key={src.name} className="hover:bg-white/30 transition-colors">
                              <td className="px-4 py-2 font-mono font-medium text-slate-700">{src.name}</td>
                              <td className="px-3 py-2 font-mono text-slate-500 text-right">{src.records}</td>
                              <td className="px-3 py-2 font-mono text-slate-500 text-right">{src.attachments}</td>
                              <td className="px-3 py-2 font-mono text-blue-600 text-right">{src.cached}</td>
                              <td className="px-3 py-2 font-mono text-emerald-600 text-right">{src.uploaded}</td>
                              <td className={`px-3 py-2 font-mono text-right ${src.errors > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{src.errors}</td>
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
                        <div key={`${e.recordId}-${e.filename}`} className="text-xs font-mono text-red-600">
                          <span className="text-red-400">{e.recordId}</span> / {e.filename}: {e.error}
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
              <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-slate-800 mb-2">Voraussetzungen (einmalig)</h4>
                <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside">
                  <li>
                    <span className="font-medium">attachment_cache</span> Tabelle in Supabase SQL Editor erstellen
                    <span className="text-slate-400 ml-1">(siehe sql/add-attachment-cache.sql)</span>
                  </li>
                  <li>
                    <span className="font-medium">attachments</span> Storage Bucket in Supabase Dashboard erstellen
                    <span className="text-slate-400 ml-1">(Storage &rarr; New Bucket &rarr; &quot;attachments&quot; &rarr; Public: ON)</span>
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
            <RefreshCw size={20} className="animate-spin text-slate-400" />
          </div>
        }>
          <DataMappingPanel />
        </Suspense>
      )}

      {activeSection === 'api-overview' && (
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={20} className="animate-spin text-slate-400" />
          </div>
        }>
          <APIOverviewPanel />
        </Suspense>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddUser}
          groups={groups}
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
