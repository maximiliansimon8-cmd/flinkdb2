/**
 * Auth Service for JET Germany DOOH Dashboard
 * Multi-user authentication with GROUP-BASED permissions.
 *
 * Architecture:
 * - Users belong to Groups (departments)
 * - Groups define which Tabs and Actions are visible
 * - No data-level filtering – everyone sees the same data
 * - Groups: Operations, Sales, Management, Tech, Admin
 *
 * Storage: sessionStorage (JSON user object + group info)
 * Migration path: Replace USERS/GROUPS arrays with Airtable fetch.
 */

const SESSION_KEY = 'dooh_user';
const LEGACY_KEY = 'dooh_auth';
const LEGACY_PASSWORD = 'jetdooh_2026';

/* ═══════════════════════════════════════════
   TAB & ACTION DEFINITIONS
   ═══════════════════════════════════════════ */

/**
 * All available tabs in the dashboard.
 * Each tab has an id, label, and optional parent for sub-tabs.
 */
export const ALL_TABS = [
  { id: 'displays',         label: 'Display Management',  parent: null },
  { id: 'displays.overview', label: 'Overview',           parent: 'displays' },
  { id: 'displays.list',    label: 'Displays',            parent: 'displays' },
  { id: 'displays.cities',  label: 'Städte',              parent: 'displays' },
  { id: 'tasks',            label: 'Tasks',                parent: null },
  { id: 'communication',    label: 'Kommunikation',       parent: null },
  { id: 'admin',            label: 'Admin',                parent: null },
];

/**
 * All available actions (fine-grained permissions).
 * Organized by category for the admin UI.
 */
export const ALL_ACTIONS = [
  // General
  { id: 'view',            label: 'Dashboard anzeigen',          category: 'Allgemein' },
  { id: 'export',          label: 'Daten exportieren',           category: 'Allgemein' },

  // Tasks
  { id: 'create_task',     label: 'Task erstellen',              category: 'Tasks' },
  { id: 'edit_task',       label: 'Task bearbeiten',             category: 'Tasks' },
  { id: 'delete_task',     label: 'Task löschen',                category: 'Tasks' },

  // Communication
  { id: 'send_message',    label: 'Nachrichten senden',          category: 'Kommunikation' },
  { id: 'view_messages',   label: 'Nachrichten lesen',           category: 'Kommunikation' },

  // Admin
  { id: 'manage_users',    label: 'Benutzer verwalten',          category: 'Admin' },
  { id: 'manage_groups',   label: 'Gruppen verwalten',           category: 'Admin' },
  { id: 'settings',        label: 'Einstellungen ändern',        category: 'Admin' },
];

/* ═══════════════════════════════════════════
   GROUP DEFINITIONS
   ═══════════════════════════════════════════ */

/**
 * Department-based groups.
 * Each group defines:
 * - tabs: which main tabs (and sub-tabs) are visible
 * - actions: which actions the user can perform
 * - color/icon: for UI display
 */
let GROUPS = [
  {
    id: 'grp_admin',
    name: 'Administration',
    description: 'Vollzugriff auf alle Bereiche und Einstellungen',
    color: '#3b82f6',
    icon: 'Shield',
    tabs: [
      'displays', 'displays.overview', 'displays.list', 'displays.cities',
      'tasks', 'communication', 'admin',
    ],
    actions: [
      'view', 'export',
      'create_task', 'edit_task', 'delete_task',
      'send_message', 'view_messages',
      'manage_users', 'manage_groups', 'settings',
    ],
  },
  {
    id: 'grp_operations',
    name: 'Operations',
    description: 'Display-Management, Tasks und Kommunikation',
    color: '#22c55e',
    icon: 'Wrench',
    tabs: [
      'displays', 'displays.overview', 'displays.list', 'displays.cities',
      'tasks', 'communication',
    ],
    actions: [
      'view', 'export',
      'create_task', 'edit_task',
      'send_message', 'view_messages',
    ],
  },
  {
    id: 'grp_sales',
    name: 'Sales',
    description: 'Display-Übersicht und Kommunikation',
    color: '#f59e0b',
    icon: 'TrendingUp',
    tabs: [
      'displays', 'displays.overview', 'displays.list', 'displays.cities',
      'communication',
    ],
    actions: [
      'view', 'export',
      'send_message', 'view_messages',
    ],
  },
  {
    id: 'grp_management',
    name: 'Management',
    description: 'Übersicht und Berichte – keine operativen Aktionen',
    color: '#a855f7',
    icon: 'BarChart3',
    tabs: [
      'displays', 'displays.overview', 'displays.list', 'displays.cities',
      'tasks',
    ],
    actions: [
      'view', 'export',
    ],
  },
  {
    id: 'grp_tech',
    name: 'Tech',
    description: 'Display-Management und technische Tasks',
    color: '#06b6d4',
    icon: 'Code',
    tabs: [
      'displays', 'displays.overview', 'displays.list', 'displays.cities',
      'tasks',
    ],
    actions: [
      'view', 'export',
      'create_task', 'edit_task',
    ],
  },
];

/* ═══════════════════════════════════════════
   USER STORE
   ═══════════════════════════════════════════ */

let USERS = [
  { id: 'us_0', email: 'max_test', name: 'Max Test', groupId: 'grp_admin', password: '123' },
  { id: 'us_1', email: 'max@dimension-outdoor.com', name: 'Maximilian Simon', groupId: 'grp_admin', password: '***REMOVED_DEFAULT_PW***' },
  { id: 'us_2', email: 'luca@dimension-outdoor.com', name: 'Luca Caspari', groupId: 'grp_admin', password: '***REMOVED_DEFAULT_PW***' },
  { id: 'us_3', email: 'xenia@dimension-outdoor.com', name: 'Xenia Glassen', groupId: 'grp_operations', password: '***REMOVED_DEFAULT_PW***' },
  { id: 'us_4', email: 'zellarit@gmail.com', name: 'Ruslan Idrysov', groupId: 'grp_tech', password: '***REMOVED_DEFAULT_PW***' },
  { id: 'us_5', email: 'sophie@dimension-outdoor.com', name: 'Sophie Schickling', groupId: 'grp_sales', password: '***REMOVED_DEFAULT_PW***' },
];

/* ═══════════════════════════════════════════
   LEGACY COMPAT – ROLE MAPPING
   ═══════════════════════════════════════════ */

/**
 * Map group IDs to legacy role names for backward compatibility.
 * Components that still use `user.role` will get a sensible value.
 */
function groupToRole(groupId) {
  const map = {
    grp_admin: 'admin',
    grp_operations: 'manager',
    grp_sales: 'manager',
    grp_management: 'viewer',
    grp_tech: 'manager',
  };
  return map[groupId] || 'viewer';
}

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

function safeGetSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(user) {
  const safe = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: groupToRole(user.groupId),
    groupId: user.groupId,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe));
  sessionStorage.setItem(LEGACY_KEY, 'true');
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(LEGACY_KEY);
}

/* ═══════════════════════════════════════════
   AUTO-LOGIN
   ═══════════════════════════════════════════ */

const AUTO_LOGIN = true;
const AUTO_LOGIN_USER_ID = 'us_0';

function ensureSession() {
  if (!AUTO_LOGIN) return;
  const existing = safeGetSession();
  if (existing) return;
  const user = USERS.find((u) => u.id === AUTO_LOGIN_USER_ID) || USERS[0];
  if (user) {
    user.lastLogin = new Date().toISOString();
    saveSession(user);
  }
}

ensureSession();

/* ═══════════════════════════════════════════
   PUBLIC API – AUTH
   ═══════════════════════════════════════════ */

export function login(email, password) {
  if ((!email || email.trim() === '') && password === LEGACY_PASSWORD) {
    const legacyUser = {
      id: 'us_legacy',
      name: 'Gast-Benutzer',
      email: 'guest@jet-dooh.de',
      role: 'viewer',
      groupId: 'grp_management',
    };
    saveSession(legacyUser);
    return { success: true, user: legacyUser };
  }

  const normalEmail = (email || '').trim().toLowerCase();
  const found = USERS.find(
    (u) => u.email.toLowerCase() === normalEmail && u.password === password,
  );

  if (!found) {
    return { success: false, error: 'Ungültige E-Mail oder Passwort' };
  }

  found.lastLogin = new Date().toISOString();
  saveSession(found);

  return {
    success: true,
    user: {
      id: found.id,
      name: found.name,
      email: found.email,
      role: groupToRole(found.groupId),
      groupId: found.groupId,
    },
  };
}

export function logout() {
  clearSession();
}

export function getCurrentUser() {
  return safeGetSession();
}

export function isAuthenticated() {
  return safeGetSession() !== null;
}

export function isAdmin() {
  const user = safeGetSession();
  return user?.groupId === 'grp_admin';
}

/* ═══════════════════════════════════════════
   PUBLIC API – GROUP-BASED PERMISSIONS
   ═══════════════════════════════════════════ */

/**
 * Get the group object for the current user.
 */
export function getCurrentGroup() {
  const user = safeGetSession();
  if (!user) return null;
  return GROUPS.find((g) => g.id === user.groupId) || null;
}

/**
 * Check whether the current user has a specific permission/action.
 */
export function hasPermission(action) {
  const group = getCurrentGroup();
  if (!group) return false;
  return group.actions.includes(action);
}

/**
 * Check whether the current user can see a specific tab.
 */
export function canAccessTab(tabId) {
  const group = getCurrentGroup();
  if (!group) return false;
  return group.tabs.includes(tabId);
}

/**
 * Get all visible tab IDs for the current user.
 */
export function getVisibleTabs() {
  const group = getCurrentGroup();
  if (!group) return [];
  return group.tabs;
}

/**
 * Get all allowed actions for the current user.
 */
export function getAllowedActions() {
  const group = getCurrentGroup();
  if (!group) return [];
  return group.actions;
}

/**
 * Get permissions for a specific role (legacy compat).
 * Now maps to group permissions.
 */
export function getPermissionsForRole(role) {
  // Find a group that maps to this role and return its actions
  const roleGroupMap = {
    admin: 'grp_admin',
    manager: 'grp_operations',
    viewer: 'grp_management',
  };
  const groupId = roleGroupMap[role];
  const group = GROUPS.find((g) => g.id === groupId);
  return group ? group.actions : [];
}

/* ═══════════════════════════════════════════
   PUBLIC API – GROUP MANAGEMENT (admin only)
   ═══════════════════════════════════════════ */

/**
 * Get all groups.
 */
export function getAllGroups() {
  return GROUPS.map((g) => ({
    ...g,
    memberCount: USERS.filter((u) => u.groupId === g.id).length,
  }));
}

/**
 * Get a single group by ID with its members.
 */
export function getGroupWithMembers(groupId) {
  const group = GROUPS.find((g) => g.id === groupId);
  if (!group) return null;
  const members = USERS.filter((u) => u.groupId === groupId).map(({ password, ...rest }) => rest);
  return { ...group, members };
}

/**
 * Create a new group.
 */
export function createGroup({ name, description, color, tabs, actions }) {
  if (GROUPS.find((g) => g.name.toLowerCase() === name.trim().toLowerCase())) {
    return { success: false, error: 'Gruppenname existiert bereits' };
  }
  const newGroup = {
    id: 'grp_' + Date.now().toString(36),
    name: name.trim(),
    description: (description || '').trim(),
    color: color || '#64748b',
    icon: 'Users',
    tabs: tabs || ['displays', 'displays.overview'],
    actions: actions || ['view'],
  };
  GROUPS.push(newGroup);
  return { success: true, group: newGroup };
}

/**
 * Update a group's configuration.
 */
export function updateGroup(groupId, updates) {
  const group = GROUPS.find((g) => g.id === groupId);
  if (!group) return { success: false, error: 'Gruppe nicht gefunden' };

  // Don't allow renaming to an existing group name
  if (updates.name && updates.name.trim().toLowerCase() !== group.name.toLowerCase()) {
    if (GROUPS.find((g) => g.name.toLowerCase() === updates.name.trim().toLowerCase())) {
      return { success: false, error: 'Gruppenname existiert bereits' };
    }
  }

  if (updates.name !== undefined) group.name = updates.name.trim();
  if (updates.description !== undefined) group.description = updates.description.trim();
  if (updates.color !== undefined) group.color = updates.color;
  if (updates.tabs !== undefined) group.tabs = updates.tabs;
  if (updates.actions !== undefined) group.actions = updates.actions;

  // Update session if current user is in this group
  const current = safeGetSession();
  if (current && current.groupId === groupId) {
    const user = USERS.find((u) => u.id === current.id);
    if (user) saveSession(user);
  }

  return { success: true };
}

/**
 * Delete a group. Cannot delete if it has members or is the admin group.
 */
export function deleteGroup(groupId) {
  if (groupId === 'grp_admin') {
    return { success: false, error: 'Admin-Gruppe kann nicht gelöscht werden' };
  }
  const members = USERS.filter((u) => u.groupId === groupId);
  if (members.length > 0) {
    return { success: false, error: `Gruppe hat noch ${members.length} Mitglieder` };
  }
  const idx = GROUPS.findIndex((g) => g.id === groupId);
  if (idx === -1) return { success: false, error: 'Gruppe nicht gefunden' };
  GROUPS.splice(idx, 1);
  return { success: true };
}

/* ═══════════════════════════════════════════
   PUBLIC API – USER MANAGEMENT (admin only)
   ═══════════════════════════════════════════ */

export function getAllUsers() {
  return USERS.map(({ password, ...rest }) => ({
    ...rest,
    role: groupToRole(rest.groupId),
    groupName: GROUPS.find((g) => g.id === rest.groupId)?.name || 'Unbekannt',
  }));
}

export function addUser({ name, email, groupId, password: pw }) {
  const normalEmail = email.trim().toLowerCase();
  if (USERS.find((u) => u.email.toLowerCase() === normalEmail)) {
    return { success: false, error: 'E-Mail existiert bereits' };
  }

  const validGroup = GROUPS.find((g) => g.id === groupId);
  if (!validGroup) {
    return { success: false, error: 'Ungültige Gruppe' };
  }

  const nextId = 'us_' + (USERS.length + 1) + '_' + Date.now().toString(36);
  const newUser = {
    id: nextId,
    email: normalEmail,
    name: name.trim(),
    groupId: groupId,
    password: pw || '***REMOVED_DEFAULT_PW***',
  };
  USERS.push(newUser);

  const { password: _, ...safe } = newUser;
  return {
    success: true,
    user: {
      ...safe,
      role: groupToRole(groupId),
      groupName: validGroup.name,
    },
  };
}

/**
 * Update a user's group assignment.
 */
export function updateUserGroup(userId, newGroupId) {
  const user = USERS.find((u) => u.id === userId);
  if (!user) return { success: false, error: 'Benutzer nicht gefunden' };

  const group = GROUPS.find((g) => g.id === newGroupId);
  if (!group) return { success: false, error: 'Ungültige Gruppe' };

  user.groupId = newGroupId;

  // If the currently logged-in user updates their own group, refresh the session
  const current = safeGetSession();
  if (current && current.id === userId) {
    saveSession(user);
  }

  return { success: true };
}

/**
 * Legacy compat: Update a user's role by mapping to a group.
 */
export function updateUserRole(userId, newRole) {
  const roleGroupMap = {
    admin: 'grp_admin',
    manager: 'grp_operations',
    viewer: 'grp_management',
  };
  const groupId = roleGroupMap[newRole];
  if (!groupId) return { success: false, error: 'Unbekannte Rolle' };
  return updateUserGroup(userId, groupId);
}

export function resetUserPassword(userId) {
  const user = USERS.find((u) => u.id === userId);
  if (!user) return { success: false, error: 'Benutzer nicht gefunden' };
  user.password = '***REMOVED_DEFAULT_PW***';
  return { success: true };
}

export function deleteUser(userId) {
  const current = safeGetSession();
  if (current && current.id === userId) {
    return { success: false, error: 'Eigenen Account kann man nicht löschen' };
  }
  const idx = USERS.findIndex((u) => u.id === userId);
  if (idx === -1) return { success: false, error: 'Benutzer nicht gefunden' };
  USERS.splice(idx, 1);
  return { success: true };
}

/* ═══════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════ */

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}
