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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-xl w-full max-w-md mx-4 animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-status-warning" />
            <h3 className="text-sm font-semibold text-text-primary">Neuer Monteur</h3>
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
              className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1.5">E-Mail / Benutzername</label>
            <input
              type="text"
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }}
              placeholder="monteur@lieferando.de"
              className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1.5">Passwort</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Passwort eingeben (min. 8 Zeichen)"
                className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 pr-10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-orange-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-text-muted mt-1">Monteur muss beim ersten Login das Passwort aendern.</p>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1.5">Installations-Team</label>
            <div className="relative">
              <select
                value={form.installerTeam}
                onChange={(e) => setForm({ ...form, installerTeam: e.target.value })}
                className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-orange-400 transition-colors appearance-none cursor-pointer"
              >
                <option value="">Team waehlen...</option>
                {(installerTeams || []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

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
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-status-warning text-white hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
        <Loader2 className="w-6 h-6 animate-spin text-status-warning" />
        <span className="text-sm text-text-muted">Monteure werden geladen...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Wrench size={20} className="text-status-warning" />
            Monteur-Verwaltung
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            {monteurs.length} Monteur{monteurs.length !== 1 ? 'e' : ''} registriert
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 rounded-lg hover:bg-surface-secondary text-text-muted hover:text-text-secondary transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-status-warning text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors shadow-sm"
          >
            <UserPlus size={15} />
            Neuer Monteur
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suche nach Name, E-Mail, Team..."
          className="w-full bg-surface-primary border border-border-secondary rounded-lg pl-9 pr-3 py-2 text-sm placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all"
        />
      </div>

      {/* Monteur List by Team */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Users size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {searchQuery ? 'Keine Monteure gefunden' : 'Noch keine Monteure angelegt'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {byTeam.map(([team, members]) => (
            <div key={team} className="bg-surface-primary border border-border-secondary rounded-xl overflow-hidden">
              {/* Team Header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary/80 border-b border-border-secondary/40">
                <Users size={14} className="text-status-warning" />
                <span className="text-xs font-semibold text-text-primary">{team}</span>
                <span className="text-[10px] text-text-muted bg-surface-secondary px-1.5 py-0.5 rounded-full">
                  {members.length}
                </span>
              </div>

              {/* Members */}
              <div className="divide-y divide-slate-100/80">
                {members.map((user) => (
                  <div key={user.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary/60 transition-colors ${!user.active ? 'opacity-50' : ''}`}>
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
                        <span className="text-sm font-medium text-text-primary truncate">{user.name}</span>
                        {!user.active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-offline/10 text-status-offline border border-red-100">
                            Deaktiviert
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted truncate">{user.email}</div>
                      {user.lastLogin && (
                        <div className="text-[10px] text-text-muted mt-0.5">
                          Letzter Login: {new Date(user.lastLogin).toLocaleDateString('de-DE')}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle Active */}
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`p-1.5 rounded-lg transition-colors ${user.active ? 'text-status-online hover:bg-status-online/10' : 'text-text-muted hover:bg-surface-secondary'}`}
                        title={user.active ? 'Deaktivieren' : 'Aktivieren'}
                      >
                        {user.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>

                      {/* Reset Password */}
                      <button
                        onClick={() => setConfirmReset(user)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-status-warning hover:bg-status-warning/10 transition-colors"
                        title="Passwort zuruecksetzen"
                      >
                        <Key size={14} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setConfirmDelete(user)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-status-offline hover:bg-status-offline/10 transition-colors"
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
          toast.type === 'error' ? 'bg-status-offline text-white' : 'bg-status-online text-white'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-surface-primary rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-2 text-status-warning">
              <Key size={18} />
              <h3 className="text-sm font-semibold">Passwort zuruecksetzen</h3>
            </div>
            <p className="text-xs text-text-secondary">
              Das Passwort von <strong>{confirmReset.name}</strong> wird auf den Standard zurueckgesetzt.
              Der Monteur muss beim naechsten Login ein neues Passwort vergeben.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReset(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-surface-secondary text-text-secondary hover:bg-surface-tertiary transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleResetPassword(confirmReset.id)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-status-warning text-white hover:bg-amber-600 transition-colors"
              >
                Zuruecksetzen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-surface-primary rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-2 text-status-offline">
              <Trash2 size={18} />
              <h3 className="text-sm font-semibold">Monteur loeschen</h3>
            </div>
            <p className="text-xs text-text-secondary">
              <strong>{confirmDelete.name}</strong> ({confirmDelete.email}) wird unwiderruflich geloescht.
              Der Zugang wird sofort gesperrt.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-surface-secondary text-text-secondary hover:bg-surface-tertiary transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.id)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-status-offline text-white hover:bg-status-offline transition-colors"
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
