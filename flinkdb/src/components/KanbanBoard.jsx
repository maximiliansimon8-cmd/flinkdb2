import { STEPS } from '../data/schema';
import { useNavigate } from 'react-router-dom';

function KanbanCard({ project }) {
  const navigate = useNavigate();
  const step = STEPS.find(s => s.id === project.step);

  return (
    <div
      onClick={() => navigate(`/projekt/${project.id}/${project.step}`)}
      className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400">{project.standortId}</span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {project.displayCount} Display{project.displayCount !== 1 ? 's' : ''}
        </span>
      </div>
      <h3 className="font-semibold text-sm text-gray-900 mb-1">{project.standortName}</h3>
      <p className="text-xs text-gray-500">
        {new Date(project.updatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
      </p>
      {project.step === 'freigabe' && project.freigabe?.status === 'pending' && (
        <span className="inline-block mt-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
          Wartet auf Freigabe
        </span>
      )}
      {project.step === 'integrator' && project.integrator?.terminBestaetigt && (
        <span className="inline-block mt-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
          Termin bestätigt
        </span>
      )}
    </div>
  );
}

export default function KanbanBoard({ projects, getProjectsByStep }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full">
      {STEPS.map(step => {
        const stepProjects = getProjectsByStep(step.id);
        return (
          <div key={step.id} className="flex-shrink-0 w-72">
            <div className={`flex items-center gap-2 mb-3 px-1`}>
              <div className={`w-3 h-3 rounded-full ${step.color}`} />
              <h2 className="font-semibold text-sm text-gray-700">{step.label}</h2>
              <span className="text-xs text-gray-400 ml-auto">{stepProjects.length}</span>
            </div>
            {step.isApprovalGate && (
              <div className="mb-2 px-2 py-1.5 bg-purple-50 border border-purple-200 rounded text-xs text-purple-600">
                Freigabe erforderlich
              </div>
            )}
            <div className="space-y-3">
              {stepProjects.map(project => (
                <KanbanCard key={project.id} project={project} />
              ))}
              {stepProjects.length === 0 && (
                <div className="text-center py-8 text-gray-300 text-sm">
                  Keine Projekte
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
