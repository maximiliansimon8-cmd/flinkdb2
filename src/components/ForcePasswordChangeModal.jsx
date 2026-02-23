import { useState } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle, ShieldCheck, ShieldAlert, Timer, Check } from 'lucide-react';
import { changePassword } from '../utils/authService';

/**
 * Force Password Change Modal — shown when:
 * 1. First login (must_change_password = true)
 * 2. Password expired (password_expires_at < now)
 *
 * User CANNOT dismiss this modal — must change password to continue.
 * Glassmorphism V2 design, consistent with ChangePasswordModal.
 */
export default function ForcePasswordChangeModal({ reason, currentPassword, onSuccess }) {
  const [oldPassword, setOldPassword] = useState(currentPassword || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const isFirstLogin = reason === 'first_login';
  const isExpired = reason === 'expired';

  // Password strength indicator
  const strength = (() => {
    if (!newPassword) return { level: 0, label: '', color: '' };
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 1) return { level: 1, label: 'Schwach', color: '#ef4444' };
    if (score <= 2) return { level: 2, label: 'Mittel', color: '#f59e0b' };
    if (score <= 3) return { level: 3, label: 'Gut', color: '#22c55e' };
    return { level: 4, label: 'Stark', color: '#22c55e' };
  })();

  // Password requirements check
  const requirements = [
    { label: 'Mindestens 8 Zeichen', met: newPassword.length >= 8 },
    { label: 'Groß- und Kleinbuchstaben', met: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) },
    { label: 'Mindestens eine Zahl', met: /[0-9]/.test(newPassword) },
    { label: 'Sonderzeichen empfohlen', met: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Alle Felder sind Pflichtfelder');
      return;
    }

    if (newPassword === oldPassword) {
      setError('Neues Passwort darf nicht mit dem alten identisch sein');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    if (newPassword.length < 8) {
      setError('Neues Passwort muss mindestens 8 Zeichen haben');
      return;
    }

    setLoading(true);
    try {
      const result = await changePassword(oldPassword, newPassword);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => onSuccess(), 2000);
      } else {
        setError(result.error);
      }
    } catch {
      setError('Fehler beim Ändern des Passworts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md">
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
        {/* Header — different icon/color for first login vs expired */}
        <div className="px-6 py-5 border-b border-slate-200/60">
          <div className="flex items-center gap-3 mb-2">
            {isFirstLogin ? (
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <ShieldAlert size={20} className="text-blue-600" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Timer size={20} className="text-amber-600" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isFirstLogin ? 'Passwort ändern erforderlich' : 'Passwort abgelaufen'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isFirstLogin
                  ? 'Bitte ändere dein Passwort beim ersten Login.'
                  : 'Dein Passwort ist abgelaufen. Bitte setze ein neues Passwort.'}
              </p>
            </div>
          </div>

          {/* Security info */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50/80 border border-slate-100 mt-3">
            <AlertTriangle size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Aus Sicherheitsgründen muss das Passwort geändert werden, bevor du fortfahren kannst.
              Die letzten 5 Passwörter können nicht wiederverwendet werden.
              Passwörter laufen nach 90 Tagen ab.
            </p>
          </div>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={32} className="text-emerald-500" />
            </div>
            <h4 className="text-sm font-semibold text-slate-900 mb-1">Passwort erfolgreich geändert</h4>
            <p className="text-xs text-slate-400">Du wirst in wenigen Sekunden weitergeleitet...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50/80 border border-red-200/60 text-xs text-red-600">
                <AlertTriangle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Old Password */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">
                {isFirstLogin ? 'Temporäres Passwort' : 'Aktuelles Passwort'}
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => { setOldPassword(e.target.value); setError(''); }}
                  placeholder={isFirstLogin ? 'Temporäres Passwort...' : 'Aktuelles Passwort...'}
                  autoFocus={!currentPassword}
                  className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg pl-9 pr-10 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Neues Passwort</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                  placeholder="Neues Passwort (min. 8 Zeichen)..."
                  autoFocus={!!currentPassword}
                  className="w-full bg-slate-50/80 border border-slate-200/60 rounded-lg pl-9 pr-10 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#3b82f6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {/* Strength indicator */}
              {newPassword && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="flex-1 h-1 rounded-full transition-colors"
                        style={{
                          backgroundColor: i <= strength.level ? strength.color : '#e2e8f0',
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] font-mono" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                </div>
              )}

              {/* Requirements checklist */}
              {newPassword && (
                <div className="mt-2 space-y-1">
                  {requirements.map((req, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-full flex items-center justify-center ${req.met ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                        {req.met && <Check size={8} className="text-emerald-600" />}
                      </div>
                      <span className={`text-[10px] ${req.met ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Passwort bestätigen</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  placeholder="Neues Passwort wiederholen..."
                  className={`w-full bg-slate-50/80 border rounded-lg pl-9 pr-10 py-2.5 text-sm font-mono text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                    confirmPassword && confirmPassword !== newPassword
                      ? 'border-[#ef4444] focus:border-[#ef4444]'
                      : 'border-slate-200/60 focus:border-[#3b82f6]'
                  }`}
                />
                {confirmPassword && confirmPassword === newPassword && (
                  <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                )}
              </div>
            </div>

            {/* Submit — NO cancel button (forced) */}
            <button
              type="submit"
              disabled={loading || !oldPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 8}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Wird geändert...' : 'Passwort ändern & Fortfahren'}
            </button>

            <p className="text-[10px] text-slate-300 font-mono text-center">
              Passwort wird verschlüsselt gespeichert • Läuft nach 90 Tagen ab
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
