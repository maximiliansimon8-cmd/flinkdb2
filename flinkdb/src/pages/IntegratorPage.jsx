import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import { INSTALLATION_STATUS } from '../data/schema';

export default function IntegratorPage({ project, updateIntegrator }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firmaName: '',
    ansprechpartner: '',
    telefon: '',
    terminDatum: '',
    terminBestaetigt: false,
    installationsStatus: null,
    notizen: '',
  });

  useEffect(() => {
    if (project?.integrator) {
      setForm({
        ...project.integrator,
        terminDatum: project.integrator.terminDatum || '',
      });
    }
  }, [project?.id]);

  if (!project) return <div className="text-gray-500">Projekt nicht gefunden.</div>;

  const handleChange = (field, value) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    updateIntegrator(project.id, updated);
  };

  const statusLabels = {
    [INSTALLATION_STATUS.SCHEDULED]: 'Geplant',
    [INSTALLATION_STATUS.IN_PROGRESS]: 'In Arbeit',
    [INSTALLATION_STATUS.COMPLETED]: 'Abgeschlossen',
    [INSTALLATION_STATUS.FAILED]: 'Fehlgeschlagen',
  };

  return (
    <div>
      <StepIndicator currentStep="integrator" />

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.standortName}</h1>
            <p className="text-sm text-gray-500">{project.standortId} — Integrator: Termin & Installation</p>
          </div>
          <span className="text-sm bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">Schritt 5: Integrator</span>
        </div>

        {/* Hub Team Info */}
        {project.hubTeam && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-teal-800 mb-2">Kontakt vor Ort</h3>
            <div className="grid grid-cols-3 gap-2 text-sm text-teal-700">
              <div><span className="text-teal-500">Name:</span> {project.hubTeam.kontaktName}</div>
              <div><span className="text-teal-500">Tel:</span> {project.hubTeam.kontaktTelefon}</div>
              {project.hubTeam.kontaktEmail && (
                <div><span className="text-teal-500">E-Mail:</span> {project.hubTeam.kontaktEmail}</div>
              )}
            </div>
            {project.hubTeam.notizen && (
              <p className="text-sm text-teal-600 mt-2 border-t border-teal-100 pt-2">{project.hubTeam.notizen}</p>
            )}
          </div>
        )}

        {/* Display positions */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Zu installierende Displays</h3>
          <div className="space-y-1">
            {project.displayPositions.map(pos => (
              <div key={pos.id} className="text-sm text-gray-600 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                {pos.beschreibung} — {pos.typ}, {pos.etage}
              </div>
            ))}
          </div>
        </div>

        {/* Integrator form */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700">Integrator-Daten (extern)</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Firma</label>
              <input
                type="text"
                value={form.firmaName}
                onChange={e => handleChange('firmaName', e.target.value)}
                placeholder="z.B. TechInstall GmbH"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ansprechpartner</label>
              <input
                type="text"
                value={form.ansprechpartner}
                onChange={e => handleChange('ansprechpartner', e.target.value)}
                placeholder="Name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
              <input
                type="tel"
                value={form.telefon}
                onChange={e => handleChange('telefon', e.target.value)}
                placeholder="+49 ..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Termin</label>
              <input
                type="date"
                value={form.terminDatum}
                onChange={e => handleChange('terminDatum', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={form.installationsStatus || ''}
                onChange={e => handleChange('installationsStatus', e.target.value || null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Kein Status —</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.terminBestaetigt}
              onChange={e => handleChange('terminBestaetigt', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Termin telefonisch bestätigt</span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notizen</label>
            <textarea
              value={form.notizen}
              onChange={e => handleChange('notizen', e.target.value)}
              placeholder="Anmerkungen zur Installation..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Installation complete */}
        {form.installationsStatus === INSTALLATION_STATUS.COMPLETED && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-sm text-green-700 font-medium">
            Installation abgeschlossen
          </div>
        )}

        <div className="flex justify-between">
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-700">
            Zurück zum Board
          </button>
        </div>
      </div>
    </div>
  );
}
