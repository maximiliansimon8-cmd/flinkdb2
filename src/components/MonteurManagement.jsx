import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, UserPlus, Key, Trash2, X, AlertCircle, Search,
  ChevronDown, Check, Wrench, Eye, EyeOff, ToggleLeft, ToggleRight,
  RefreshCw, Loader2,
} from 'lucide-react';
import {
  fetchAllUsers, addUser, resetUserPassword, deleteUser,
  getCurrentUser, getInitials, supabase,
} from '../utils/authService';

/* ─── Add Monteur Modal ─── */

function AddMonteurModal({ onClose, onSave, installerTeams }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', installerTeam: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name und E-Mail sind Pflichtfelder');
      return;
    }
    if (!form.installerTeam) {
      setError('Bitte ein Team zuordnen');
      return;
    }
    setSaving(true);
    const result = await addUser({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      groupId: 'grp_monteur',
      password: form.password,
      installerTeam: form.installerTeam,
    });
    setSaving(false);
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
            <UserPlus size={18} className="text-orange-500" />
            <h3 className="text-sm font-semibold text-slate-900">Neuer Monteur</h3>
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
              className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">E-Mail / Benutzername</label>
            <input
              type="text"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }}
              placeholder="monteur@lieferando.de"
              className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Passwort</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Passwort eingeben (min. 8 Zeichen)"
                className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Monteur muss beim ersten Login das Passwort aendern.</p>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Installations-Team</label>
            <div className="relative">
              <select
                value={form.installerTeam}
                onChange={(e) => setForm({ ...form, installerTeam: e.target.value })}
                className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-orange-400 transition-colors appearance-none cursor-pointer"
              >
                <option value="">Team waehlen...</option>
                {(installerTeams || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
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
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Erstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export default function MonteurManagement() {
  const [monteurs, setMonteurs] = useState([]);
  const [installerTeams, setInstallerTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  const [toast, setToast] = useState(null);
  const currentUser = getCurrentUser();

  // Load monteur users + installer teams
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allUsers = await fetchAllUsers();
      const monteurUsers = (allUsers || []).filter(u => u.groupId === 'grp_monteur');
      setMonteurs(monteurUsers);

      // Load installer team names from routes
      try {
        const { data: routes } = await supabase
          .from('install_routen')
          .select('installer_team')
          .not('installer_team', 'is', null);
        const uniqueTeams = [...new Set((routes || []).map(r => r.installer_team).filter(Boolean))].sort();
        setInstallerTeams(uniqueTeams);
      } catch { /* non-critical */ }
    } catch (err) {
      console.error('[MonteurManagement] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleAddSaved = useCallback(() => {
    loadData();
    showToast('Monteur erfolgreich angelegt');
  }, [loadData, showToast]);

  const handleResetPassword = useCallback(async (userId) => {
    const result = await resetUserPassword(userId);
    setConfirmReset(null);
    if (result.success) {
      showToast(result.message || 'Passwort zurueckgesetzt');
    } else {
      showToast(result.error || 'Fehler', 'error');
    }
  }, [showToast]);

  const handleDelete = useCallback(async (userId) => {
    const result = await deleteUser(userId);
    setConfirmDelete(null);
    if (result.success) {
      loadData();
      showToast('Monteur geloescht');
    } else {
      showToast(result.error || 'Fehler', 'error');
    }
  }, [loadData, showToast]);

  const handleToggleActive = useCallback(async (user) => {
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ active: !user.active })
        .eq('id', user.id);
      if (error) throw error;
      loadData();
      showToast(user.active ? 'Monteur deaktiviert' : 'Monteur aktiviert');
    } catch {
      showToast('Fehler beim Aktualisieren', 'error');
    }
  }, [loadData, showToast]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return monteurs;
    const q = searchQuery.toLowerCase();
    return monteurs.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.installerTeam?.toLowerCase().includes(q)
    );
  }, [monteurs, searchQuery]);

  // Group by team
  const byTeam = useMemo(() => {
    const map = {};
    for (const m of filtered) {
      const team = m.installerTeam || 'Kein Team';
      if (!map[team]) map[team] = [];
      map[team].push(m);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        <span className="text-sm text-slate-500">Monteure werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Wrench size={20} className="text-orange-500" />
            Monteur-Verwaltung
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {monteurs.length} Monteur{monteurs.length !== 1 ? 'e' : ''} registriert
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors shadow-sm"
          >
            <UserPlus size={15} />
            Neuer Monteur
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suche nach Name, E-Mail, Team..."
          className="w-full bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-lg pl-9 pr-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        />
      </div>

      {/* Monteur List by Team */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Users size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {searchQuery ? 'Keine Monteure gefunden' : 'Noch keine Monteure angelegt'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {byTeam.map(([team, members]) => (
            <div key={team} className="bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-xl overflow-hidden">
              {/* Team Header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/40">
                <Users size={14} className="text-orange-500" />
                <span className="text-xs font-semibold text-slate-700">{team}</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                  {members.length}
                </span>
              </div>

              {/* Members */}
              <div className="divide-y divide-slate-100/80">
                {members.map((user) => (
                  <div key={user.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors ${!user.active ? 'opacity-50' : ''}`}>
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: user.active ? '#f97316' : '#94a3b8' }}
                    >
                      {getInitials(user.name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">{user.name}</span>
                        {!user.active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100">
                            Deaktiviert
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{user.email}</div>
                      {user.lastLogin && (
                        <div className="text-[10px] text-slate-300 mt-0.5">
                          Letzter Login: {new Date(user.lastLogin).toLocaleDateString('de-DE')}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle Active */}
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`p-1.5 rounded-lg transition-colors ${user.active ? 'text-green-500 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                        title={user.active ? 'Deaktivieren' : 'Aktivieren'}
                      >
                        {user.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>

                      {/* Reset Password */}
                      <button
                        onClick={() => setConfirmReset(user)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                        title="Passwort zuruecksetzen"
                      >
                        <Key size={14} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setConfirmDelete(user)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Loeschen"
                        disabled={user.id === currentUser?.id}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddMonteurModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddSaved}
          installerTeams={installerTeams}
        />
      )}

      {/* Confirm Reset Password */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <Key size={18} />
              <h3 className="text-sm font-semibold">Passwort zuruecksetzen</h3>
            </div>
            <p className="text-xs text-slate-600">
              Das Passwort von <strong>{confirmReset.name}</strong> wird auf den Standard zurueckgesetzt.
              Der Monteur muss beim naechsten Login ein neues Passwort vergeben.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReset(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleResetPassword(confirmReset.id)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Zuruecksetzen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 size={18} />
              <h3 className="text-sm font-semibold">Monteur loeschen</h3>
            </div>
            <p className="text-xs text-slate-600">
              <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) wird unwiderruflich geloescht.
              Der Zugang wird sofort gesperrt.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.id)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Loeschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
