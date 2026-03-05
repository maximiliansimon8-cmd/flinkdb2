import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';

export default function HubTeamPage({ project, updateHubTeam, submitHubTeam }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    kontaktName: '',
    kontaktTelefon: '',
    kontaktEmail: '',
    notizen: '',
    standortInformiert: false,
  });

  useEffect(() => {
    if (project?.hubTeam) {
      setForm(project.hubTeam);
    }
  }, [project?.id]);

  if (!project) return <div className="text-gray-500">Projekt nicht gefunden.</div>;

  const handleChange = (field, value) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    updateHubTeam(project.id, updated);
  };

  const canSubmit = form.kontaktName.trim() && form.kontaktTelefon.trim() && form.standortInformiert;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitHubTeam(project.id, form);
    navigate(`/projekt/${project.id}/integrator`);
  };

  return (
    <div>
      <StepIndicator currentStep="hub_team" />

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.standortName}</h1>
            <p className="text-sm text-gray-500">{project.standortId} — Hub Team: Standort informieren</p>
          </div>
          <span className="text-sm bg-teal-50 text-teal-700 px-3 py-1 rounded-full font-medium">Schritt 4: Hub Team</span>
        </div>

        {/* Freigabe info */}
        {project.freigabe && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6 text-sm">
            Freigegeben von <strong>{project.freigabe.freigegebenVon}</strong> am{' '}
            {new Date(project.freigabe.datum).toLocaleDateString('de-DE')}
          </div>
        )}

        {/* Contact form */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700">Kontaktdaten vor Ort</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ansprechpartner *</label>
              <input
                type="text"
                value={form.kontaktName}
                onChange={e => handleChange('kontaktName', e.target.value)}
                placeholder="Name des Ansprechpartners"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefon *</label>
              <input
                type="tel"
                value={form.kontaktTelefon}
                onChange={e => handleChange('kontaktTelefon', e.target.value)}
                placeholder="+49 ..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">E-Mail</label>
              <input
                type="email"
                value={form.kontaktEmail}
                onChange={e => handleChange('kontaktEmail', e.target.value)}
                placeholder="email@standort.de"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notizen</label>
            <textarea
              value={form.notizen}
              onChange={e => handleChange('notizen', e.target.value)}
              placeholder="Besonderheiten zum Standort, Zugang, Schlüssel, etc."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.standortInformiert}
              onChange={e => handleChange('standortInformiert', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-700">Standort wurde informiert</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-700">
            Zurück zum Board
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Weiter an Integrator
          </button>
        </div>
      </div>
    </div>
  );
}
