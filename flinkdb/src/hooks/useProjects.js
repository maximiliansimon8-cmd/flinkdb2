import { useState, useCallback } from 'react';
import { initialProjects, generateId } from '../data/mockData';
import { STEPS } from '../data/schema';

export function useProjects() {
  const [projects, setProjects] = useState(initialProjects);

  const updateProject = useCallback((id, updates) => {
    setProjects(prev =>
      prev.map(p => (p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p))
    );
  }, []);

  const moveToStep = useCallback((id, stepId) => {
    updateProject(id, { step: stepId });
  }, [updateProject]);

  const addFeedback = useCallback((projectId, autor, text) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          feedback: [...p.feedback, { id: generateId(), autor, text, datum: new Date().toISOString() }],
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, []);

  const setFreigabe = useCallback((projectId, status, freigegebenVon, kommentar) => {
    const updates = {
      freigabe: {
        status,
        freigegebenVon,
        datum: new Date().toISOString(),
        kommentar,
      },
    };
    if (status === 'approved') {
      updates.step = 'hub_team';
      updates.hubTeam = { kontaktName: '', kontaktTelefon: '', kontaktEmail: '', notizen: '', standortInformiert: false };
    } else if (status === 'rejected') {
      updates.step = 'vorschlag';
    }
    updateProject(projectId, updates);
  }, [updateProject]);

  const updateHubTeam = useCallback((projectId, hubData) => {
    updateProject(projectId, { hubTeam: hubData });
  }, [updateProject]);

  const submitHubTeam = useCallback((projectId, hubData) => {
    updateProject(projectId, {
      hubTeam: { ...hubData, standortInformiert: true },
      step: 'integrator',
      integrator: { firmaName: '', ansprechpartner: '', telefon: '', terminDatum: null, terminBestaetigt: false, installationsStatus: null, notizen: '' },
    });
  }, [updateProject]);

  const updateIntegrator = useCallback((projectId, integratorData) => {
    updateProject(projectId, { integrator: integratorData });
  }, [updateProject]);

  const addProject = useCallback((standortName, standortId) => {
    const newProject = {
      id: generateId(),
      standortName,
      standortId,
      step: 'vorschlag',
      displayCount: 0,
      displayPositions: [],
      feedback: [],
      freigabe: null,
      hubTeam: null,
      integrator: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProjects(prev => [...prev, newProject]);
    return newProject.id;
  }, []);

  const addDisplayPosition = useCallback((projectId, position) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id !== projectId) return p;
        const positions = [...p.displayPositions, { ...position, id: generateId() }];
        return { ...p, displayPositions: positions, displayCount: positions.length, updatedAt: new Date().toISOString() };
      })
    );
  }, []);

  const removeDisplayPosition = useCallback((projectId, positionId) => {
    setProjects(prev =>
      prev.map(p => {
        if (p.id !== projectId) return p;
        const positions = p.displayPositions.filter(pos => pos.id !== positionId);
        return { ...p, displayPositions: positions, displayCount: positions.length, updatedAt: new Date().toISOString() };
      })
    );
  }, []);

  const getProjectsByStep = useCallback((stepId) => {
    return projects.filter(p => p.step === stepId);
  }, [projects]);

  const getProject = useCallback((id) => {
    return projects.find(p => p.id === id);
  }, [projects]);

  return {
    projects,
    getProject,
    getProjectsByStep,
    addProject,
    updateProject,
    moveToStep,
    addFeedback,
    setFreigabe,
    updateHubTeam,
    submitHubTeam,
    updateIntegrator,
    addDisplayPosition,
    removeDisplayPosition,
  };
}
