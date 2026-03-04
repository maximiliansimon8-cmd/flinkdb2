import { useState } from 'react';
import { Lock, Eye, EyeOff, X, AlertCircle, Check, ShieldCheck } from 'lucide-react';
import { changePassword, getPasswordExpiryDays } from '../utils/authService';

/**
 * Modal for users to voluntarily change their own password.
 * Requires old password verification + new password with min 8 chars.
 * Includes password history check (last 5 passwords cannot be reused).
 * Glassmorphism V2 design.
 */
export default function ChangePasswordModal({ onClose }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const expiryDays = getPasswordExpiryDays();

  // Password strength indicator
  const strength = (() => {
    if (!newPassword) return { level: 0, label: '', color: '' };
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 1) return { level: 1, label: 'Schwach', color: '#FF3B30' };
    if (score <= 2) return { level: 2, label: 'Mittel', color: '#FF9500' };
    if (score <= 3) return { level: 3, label: 'Gut', color: '#34C759' };
    return { level: 4, label: 'Stark', color: '#34C759' };
  })();

  // Requirements checklist
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
        setTimeout(() => onClose(), 2000);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-surface-primary border border-border-secondary rounded-2xl shadow-xl w-full max-w-md mx-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-secondary">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-[#007AFF]" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Passwort ändern</h3>
              {expiryDays !== null && (
                <p className="text-[10px] text-text-muted mt-0.5">
                  Passwort läuft in {expiryDays} Tagen ab
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-surface-secondary/60 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={32} className="text-emerald-500" />
            </div>
            <h4 className="text-sm font-semibold text-text-primary mb-1">Passwort geändert</h4>
            <p className="text-xs text-text-muted">Dein Passwort wurde erfolgreich aktualisiert. Es läuft in 90 Tagen ab.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-status-offline/10/80 border border-status-offline/20/60 text-xs text-status-offline">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Old Password */}
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Aktuelles Passwort</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => { setOldPassword(e.target.value); setError(''); }}
                  placeholder="Aktuelles Passwort..."
                  autoFocus
                  className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg pl-9 pr-10 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Neues Passwort</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                  placeholder="Neues Passwort (min. 8 Zeichen)..."
                  className="w-full bg-surface-secondary/80 border border-border-secondary rounded-lg pl-9 pr-10 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#007AFF] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {/* Strength indicator + requirements */}
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
                  <p className="text-[10px]" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                  <div className="space-y-0.5 mt-1">
                    {requirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full flex items-center justify-center ${req.met ? 'bg-emerald-100' : 'bg-surface-secondary'}`}>
                          {req.met && <Check size={8} className="text-emerald-600" />}
                        </div>
                        <span className={`text-[10px] ${req.met ? 'text-emerald-600' : 'text-text-muted'}`}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="text-xs text-text-muted block mb-1.5">Passwort bestätigen</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  placeholder="Neues Passwort wiederholen..."
                  className={`w-full bg-surface-secondary/80 border rounded-lg pl-9 pr-10 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none transition-colors ${
                    confirmPassword && confirmPassword !== newPassword
                      ? 'border-[#FF3B30] focus:border-[#FF3B30]'
                      : 'border-border-secondary focus:border-[#007AFF]'
                  }`}
                />
                {confirmPassword && confirmPassword === newPassword && (
                  <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                )}
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
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#007AFF] text-white hover:bg-[#2563eb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Wird geändert...' : 'Passwort ändern'}
              </button>
            </div>

            <p className="text-[10px] text-text-muted text-center">
              Passwort verschlüsselt gespeichert • Letzte 5 Passwörter nicht wiederverwendbar • Ablauf: 90 Tage
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
