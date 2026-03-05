import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';

export default function VorschlagPage({ project, addDisplayPosition, removeDisplayPosition, moveToStep }) {
  const navigate = useNavigate();
  const [newPos, setNewPos] = useState({ beschreibung: '', typ: '43 Zoll', etage: 'EG' });

  if (!project) return <div className="text-gray-500">Projekt nicht gefunden.</div>;

  const handleAdd = () => {
    if (!newPos.beschreibung.trim()) return;
    addDisplayPosition(project.id, newPos);
    setNewPos({ beschreibung: '', typ: '43 Zoll', etage: 'EG' });
  };

  const handleSubmit = () => {
    if (project.displayPositions.length === 0) return;
    moveToStep(project.id, 'feedback');
    navigate(`/projekt/${project.id}/feedback`);
  };

  return (
    <div>
      <StepIndicator currentStep="vorschlag" />

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.standortName}</h1>
            <p className="text-sm text-gray-500">{project.standortId} — Display-Positionen vorschlagen</p>
          </div>
          <span className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">Schritt 1: Vorschlag</span>
        </div>

        {/* Existing positions */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Display-Positionen ({project.displayPositions.length})
          </h2>
          {project.displayPositions.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Noch keine Positionen hinzugefügt.</p>
          ) : (
            <div className="space-y-2">
              {project.displayPositions.map(pos => (
                <div key={pos.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div>
                    <span className="font-medium text-sm text-gray-900">{pos.beschreibung}</span>
                    <span className="text-xs text-gray-500 ml-3">{pos.typ} — {pos.etage}</span>
                  </div>
                  <button
                    onClick={() => removeDisplayPosition(project.id, pos.id)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    Entfernen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add new position */}
        <div className="border-t border-gray-100 pt-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Neue Position hinzufügen</h3>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Beschreibung (z.B. Eingangsbereich)"
              value={newPos.beschreibung}
              onChange={e => setNewPos(p => ({ ...p, beschreibung: e.target.value }))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={newPos.typ}
              onChange={e => setNewPos(p => ({ ...p, typ: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option>32 Zoll</option>
              <option>43 Zoll</option>
              <option>55 Zoll</option>
              <option>65 Zoll</option>
            </select>
            <select
              value={newPos.etage}
              onChange={e => setNewPos(p => ({ ...p, etage: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option>UG</option>
              <option>EG</option>
              <option>OG1</option>
              <option>OG2</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!newPos.beschreibung.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hinzufügen
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-700">
            Zurück zum Board
          </button>
          <button
            onClick={handleSubmit}
            disabled={project.displayPositions.length === 0}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Weiter zu Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
