import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';

export default function FreigabePage({ project, setFreigabe }) {
  const navigate = useNavigate();
  const [freigegebenVon, setFreigegebenVon] = useState('');
  const [kommentar, setKommentar] = useState('');

  if (!project) return <div className="text-gray-500">Projekt nicht gefunden.</div>;

  const handleApprove = () => {
    if (!freigegebenVon.trim()) return;
    setFreigabe(project.id, 'approved', freigegebenVon.trim(), kommentar.trim());
    navigate(`/projekt/${project.id}/hub_team`);
  };

  const handleReject = () => {
    if (!freigegebenVon.trim()) return;
    setFreigabe(project.id, 'rejected', freigegebenVon.trim(), kommentar.trim());
    navigate('/');
  };

  const isAlreadyApproved = project.freigabe?.status === 'approved';
  const isAlreadyRejected = project.freigabe?.status === 'rejected';

  return (
    <div>
      <StepIndicator currentStep="freigabe" />

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.standortName}</h1>
            <p className="text-sm text-gray-500">{project.standortId} — Freigabe</p>
          </div>
          <span className="text-sm bg-purple-50 text-purple-700 px-3 py-1 rounded-full font-medium">Schritt 3: Freigabe</span>
        </div>

        {/* Approval gate badge */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">!</div>
            <span className="font-semibold text-sm text-purple-800">Freigabe-Gate</span>
          </div>
          <p className="text-sm text-purple-600">
            Dieser Schritt erfordert eine explizite Genehmigung, bevor das Projekt an das Hub Team weitergeleitet wird.
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Positionen</h3>
            {project.displayPositions.map(pos => (
              <div key={pos.id} className="text-sm text-gray-600">{pos.beschreibung} — {pos.typ}</div>
            ))}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Feedback ({project.feedback.length})</h3>
            {project.feedback.map(fb => (
              <div key={fb.id} className="text-sm text-gray-600 mb-1">
                <span className="font-medium">{fb.autor}:</span> {fb.text}
              </div>
            ))}
            {project.feedback.length === 0 && <p className="text-sm text-gray-400">Kein Feedback.</p>}
          </div>
        </div>

        {/* Already decided */}
        {(isAlreadyApproved || isAlreadyRejected) && (
          <div className={`rounded-lg p-4 mb-6 ${isAlreadyApproved ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className="text-sm font-semibold mb-1">{isAlreadyApproved ? 'Freigegeben' : 'Abgelehnt'}</p>
            <p className="text-sm text-gray-600">von {project.freigabe.freigegebenVon} am {new Date(project.freigabe.datum).toLocaleDateString('de-DE')}</p>
            {project.freigabe.kommentar && <p className="text-sm text-gray-600 mt-1">"{project.freigabe.kommentar}"</p>}
          </div>
        )}

        {/* Approval form */}
        {!isAlreadyApproved && !isAlreadyRejected && (
          <div className="border-t border-gray-100 pt-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Freigabe erteilen</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Dein Name (Freigeber)"
                value={freigegebenVon}
                onChange={e => setFreigegebenVon(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <textarea
                placeholder="Kommentar (optional)"
                value={kommentar}
                onChange={e => setKommentar(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={!freigegebenVon.trim()}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Freigeben
                </button>
                <button
                  onClick={handleReject}
                  disabled={!freigegebenVon.trim()}
                  className="bg-red-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Ablehnen (zurück zu Vorschlag)
                </button>
              </div>
            </div>
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
