import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';

export default function FeedbackPage({ project, addFeedback, moveToStep }) {
  const navigate = useNavigate();
  const [autor, setAutor] = useState('');
  const [text, setText] = useState('');

  if (!project) return <div className="text-gray-500">Projekt nicht gefunden.</div>;

  const handleAddFeedback = () => {
    if (!autor.trim() || !text.trim()) return;
    addFeedback(project.id, autor.trim(), text.trim());
    setAutor('');
    setText('');
  };

  const handleSubmitForApproval = () => {
    moveToStep(project.id, 'freigabe');
    navigate(`/projekt/${project.id}/freigabe`);
  };

  return (
    <div>
      <StepIndicator currentStep="feedback" />

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.standortName}</h1>
            <p className="text-sm text-gray-500">{project.standortId} — Feedback sammeln</p>
          </div>
          <span className="text-sm bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium">Schritt 2: Feedback</span>
        </div>

        {/* Display positions summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Vorgeschlagene Positionen</h3>
          <div className="space-y-1">
            {project.displayPositions.map(pos => (
              <div key={pos.id} className="text-sm text-gray-600">
                {pos.beschreibung} — {pos.typ}, {pos.etage}
              </div>
            ))}
          </div>
        </div>

        {/* Existing feedback */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Feedback ({project.feedback.length})
          </h2>
          {project.feedback.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">Noch kein Feedback vorhanden.</p>
          ) : (
            <div className="space-y-3">
              {project.feedback.map(fb => (
                <div key={fb.id} className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900">{fb.autor}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(fb.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{fb.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add feedback form */}
        <div className="border-t border-gray-100 pt-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Feedback hinzufügen</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Dein Name"
              value={autor}
              onChange={e => setAutor(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <textarea
              placeholder="Dein Feedback zum Vorschlag..."
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleAddFeedback}
              disabled={!autor.trim() || !text.trim()}
              className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Feedback senden
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-700">
            Zurück zum Board
          </button>
          <button
            onClick={handleSubmitForApproval}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            Zur Freigabe einreichen
          </button>
        </div>
      </div>
    </div>
  );
}
