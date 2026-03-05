import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import KanbanBoard from './components/KanbanBoard';
import VorschlagPage from './pages/VorschlagPage';
import FeedbackPage from './pages/FeedbackPage';
import FreigabePage from './pages/FreigabePage';
import HubTeamPage from './pages/HubTeamPage';
import IntegratorPage from './pages/IntegratorPage';
import { useProjects } from './hooks/useProjects';

function ProjectRouter({ projectActions }) {
  const { id, step } = useParams();
  const project = projectActions.getProject(id);

  const stepPages = {
    vorschlag: (
      <VorschlagPage
        project={project}
        addDisplayPosition={projectActions.addDisplayPosition}
        removeDisplayPosition={projectActions.removeDisplayPosition}
        moveToStep={projectActions.moveToStep}
      />
    ),
    feedback: (
      <FeedbackPage
        project={project}
        addFeedback={projectActions.addFeedback}
        moveToStep={projectActions.moveToStep}
      />
    ),
    freigabe: (
      <FreigabePage
        project={project}
        setFreigabe={projectActions.setFreigabe}
      />
    ),
    hub_team: (
      <HubTeamPage
        project={project}
        updateHubTeam={projectActions.updateHubTeam}
        submitHubTeam={projectActions.submitHubTeam}
      />
    ),
    integrator: (
      <IntegratorPage
        project={project}
        updateIntegrator={projectActions.updateIntegrator}
      />
    ),
  };

  return stepPages[step] || <div className="text-gray-500">Unbekannter Schritt: {step}</div>;
}

export default function App() {
  const projectActions = useProjects();

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route
            path="/"
            element={
              <KanbanBoard
                projects={projectActions.projects}
                getProjectsByStep={projectActions.getProjectsByStep}
              />
            }
          />
          <Route
            path="/projekt/:id/:step"
            element={<ProjectRouter projectActions={projectActions} />}
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
