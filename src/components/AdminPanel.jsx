import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Shield,
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
} from '../utils/authService';

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
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100/60 text-slate-400 hover:text-slate-900 transition-colors">
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
            <label className="text-xs text-slate-400 block mb-1.5">Name</label>
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
            <label className="text-xs text-slate-400 block mb-1.5">E-Mail / Benutzername</label>
            <input
              type="text"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }}
              placeholder="email@beispiel.de"
              className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Gruppe</label>
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
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Passwort</label>
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
          <button onClick={onClose} className="p-1 rounded-md hover:bg-slate-100/60 text-slate-400 hover:text-slate-900 transition-colors">
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
              <label className="text-xs text-slate-400 block mb-1.5">Gruppenname</label>
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
              <label className="text-xs text-slate-400 block mb-1.5">Beschreibung</label>
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
            <label className="text-xs text-slate-400 block mb-2">
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
            <label className="text-xs text-slate-400 block mb-2">
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
                          <ToggleLeft size={20} className="text-slate-300" />
                        )}
                      </button>
                      <TabIcon size={14} className={isChecked ? 'text-slate-700' : 'text-slate-300'} />
                      <span className={`text-sm font-medium ${isChecked ? 'text-slate-900' : 'text-slate-400'}`}>
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
                                  : 'border-slate-200/60 bg-slate-50/60 text-slate-400 hover:border-slate-300'
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
            <label className="text-xs text-slate-400 block mb-2">
              <Key size={12} className="inline mr-1" />
              Erlaubte Aktionen
            </label>
            <div className="space-y-3">
              {Object.entries(actionsByCategory).map(([category, actions]) => (
                <div key={category} className="border border-slate-200/40 rounded-xl p-3">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
                              : 'bg-slate-50/60 text-slate-400 border-slate-200/60 hover:border-slate-300'
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

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState(() => getAllGroups());
  const [activeSection, setActiveSection] = useState('users'); // 'users' | 'groups' | 'audit'
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmGroupDelete, setConfirmGroupDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);

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

  const sections = [
    { id: 'users', label: 'Benutzer', icon: Users, count: stats.totalUsers },
    { id: 'groups', label: 'Gruppen', icon: Layers, count: stats.totalGroups },
    { id: 'audit', label: 'Audit-Log', icon: FileText, count: auditLog.length },
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
            <p className="text-xs text-slate-400 font-mono">Benutzer- & Gruppenverwaltung</p>
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
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon size={16} />
              {sec.label}
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                isActive ? 'bg-blue-50 text-blue-600' : 'bg-slate-50/60 text-slate-400'
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
                  <div className="text-xs text-slate-400 mt-0.5">{g.name}</div>
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
                <span className="text-xs font-mono text-slate-400 bg-slate-50/80 px-2 py-0.5 rounded">
                  {filteredUsers.length}
                </span>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Benutzer</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">E-Mail</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Gruppe</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Letzter Login</th>
                    <th className="text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Aktionen</th>
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
                                  <span className="ml-2 text-[10px] font-mono text-slate-400">(Du)</span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">{user.id}</div>
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
                                className="p-1 rounded hover:bg-slate-100/60 text-slate-400"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            userGroup ? <GroupBadge group={userGroup} /> : (
                              <span className="text-xs text-slate-400">–</span>
                            )
                          )}
                        </td>

                        {/* Last Login */}
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-slate-400">
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
                              className="p-1.5 rounded-md hover:bg-blue-50/60 text-slate-400 hover:text-[#3b82f6] transition-colors"
                              title="Gruppe ändern"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleResetPassword(user.id, user.name)}
                              className="p-1.5 rounded-md hover:bg-amber-50/60 text-slate-400 hover:text-amber-600 transition-colors"
                              title="Passwort zurücksetzen"
                            >
                              <Key size={14} />
                            </button>
                            {confirmDelete === user.id ? (
                              <div className="flex items-center gap-1 ml-1">
                                <button
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-medium hover:bg-red-600 transition-colors"
                                >
                                  Löschen
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="p-1 rounded-md hover:bg-slate-100/60 text-slate-400"
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
                                    : 'hover:bg-red-50/60 text-slate-400 hover:text-red-500'
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
                          <span className="text-xs text-slate-400">Lade Benutzer...</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingUsers && filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <div className="text-slate-400 text-sm">Keine Benutzer gefunden</div>
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
                        <span className="text-xs font-mono text-slate-400 bg-slate-50/80 px-2 py-0.5 rounded">
                          {group.memberCount} Mitglieder
                        </span>
                        {group.id === 'grp_admin' && (
                          <span className="text-[10px] font-mono text-blue-500 bg-blue-50/80 px-2 py-0.5 rounded">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{group.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingGroup(group); setShowGroupModal(true); }}
                      className="p-2 rounded-lg hover:bg-blue-50/60 text-slate-400 hover:text-[#3b82f6] transition-colors"
                      title="Gruppe bearbeiten"
                    >
                      <Edit3 size={14} />
                    </button>
                    {group.id !== 'grp_admin' && (
                      isDeleteConfirm ? (
                        <div className="flex items-center gap-1 ml-1">
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            className="px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-medium hover:bg-red-600 transition-colors"
                          >
                            Löschen
                          </button>
                          <button
                            onClick={() => setConfirmGroupDelete(null)}
                            className="p-1 rounded-md hover:bg-slate-100/60 text-slate-400"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmGroupDelete(group.id)}
                          className="p-2 rounded-lg hover:bg-red-50/60 text-slate-400 hover:text-red-500 transition-colors"
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
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-50/80 text-slate-600 border border-slate-200/40"
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
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Aktionen
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.actions.map((actionId) => {
                        const action = ALL_ACTIONS.find((a) => a.id === actionId);
                        return (
                          <span
                            key={actionId}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-emerald-50/80 text-emerald-600 border border-emerald-200/40"
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
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Mitglieder
                    </div>
                    {members.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {members.map((m) => (
                          <div key={m.id} className="flex items-center gap-1.5">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: group.color }}
                            >
                              {getInitials(m.name)}
                            </div>
                            <span className="text-xs text-slate-600">{m.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 italic">Keine Mitglieder</span>
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
                <span className="text-xs font-mono text-slate-400 bg-slate-50/80 px-2 py-0.5 rounded">
                  {filteredAuditLog.length} Einträge
                </span>
                <span className="text-[10px] font-mono text-blue-400 bg-blue-50/80 px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock size={10} />
                  Timeout: {getSessionTimeoutMinutes() / 60}h
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                  className="p-2 rounded-lg hover:bg-slate-100/60 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Aktualisieren"
                >
                  <Activity size={14} />
                </button>
              </div>
            </div>

            {/* DSGVO Info */}
            <div className="px-5 py-3 bg-blue-50/40 border-b border-blue-200/30">
              <p className="text-[11px] text-blue-600 flex items-center gap-1.5">
                <FileText size={12} />
                <strong>DSGVO §47 Nachweispflicht:</strong> Alle sicherheitsrelevanten Aktionen werden serverseitig in der Airtable-Datenbank protokolliert. Logs sind persistent und revisionssicher.
              </p>
            </div>

            {/* Log Entries */}
            <div className="max-h-[600px] overflow-y-auto">
              {loadingAudit ? (
                <div className="p-12 text-center">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs text-slate-400">Lade Audit-Log...</p>
                </div>
              ) : filteredAuditLog.length === 0 ? (
                <div className="p-12 text-center">
                  <Activity size={32} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Keine Log-Einträge vorhanden</p>
                  <p className="text-xs text-slate-300 font-mono mt-1">
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
                            <span className="text-[10px] font-mono text-slate-400">
                              {timeStr}
                            </span>
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: color + '15',
                                color: color,
                              }}
                            >
                              {entry.action}
                            </span>
                            <span className="text-[10px] text-slate-400">
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
                <p className="text-xs text-slate-400 font-mono">
                  Zeige 100 von {filteredAuditLog.length} Einträgen. Exportiere CSV für vollständige Daten.
                </p>
              </div>
            )}
          </div>
        </div>
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
