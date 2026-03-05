/**
 * Mock data for FlinkDB development
 */

let nextId = 7;

export const initialProjects = [
  {
    id: '1',
    standortName: 'Rewe Markt Berlin-Mitte',
    standortId: 'STD-001',
    step: 'vorschlag',
    displayCount: 3,
    displayPositions: [
      { id: 'p1', beschreibung: 'Eingangsbereich links', typ: '55 Zoll', etage: 'EG' },
      { id: 'p2', beschreibung: 'Kassenbereich', typ: '43 Zoll', etage: 'EG' },
      { id: 'p3', beschreibung: 'Backwarentheke', typ: '32 Zoll', etage: 'EG' },
    ],
    feedback: [],
    freigabe: null,
    hubTeam: null,
    integrator: null,
    createdAt: '2026-02-28T10:00:00Z',
    updatedAt: '2026-02-28T10:00:00Z',
  },
  {
    id: '2',
    standortName: 'Edeka Center Hamburg-Altona',
    standortId: 'STD-002',
    step: 'feedback',
    displayCount: 2,
    displayPositions: [
      { id: 'p4', beschreibung: 'Eingangsbereich', typ: '55 Zoll', etage: 'EG' },
      { id: 'p5', beschreibung: 'Obst & Gemüse', typ: '43 Zoll', etage: 'EG' },
    ],
    feedback: [
      { id: 'f1', autor: 'Max Müller', text: 'Position am Eingang ist gut, aber bitte weiter rechts.', datum: '2026-03-01T14:00:00Z' },
    ],
    freigabe: null,
    hubTeam: null,
    integrator: null,
    createdAt: '2026-02-25T09:00:00Z',
    updatedAt: '2026-03-01T14:00:00Z',
  },
  {
    id: '3',
    standortName: 'Penny Markt München-Sendling',
    standortId: 'STD-003',
    step: 'freigabe',
    displayCount: 1,
    displayPositions: [
      { id: 'p6', beschreibung: 'Kassenbereich', typ: '43 Zoll', etage: 'EG' },
    ],
    feedback: [
      { id: 'f2', autor: 'Lisa Schmidt', text: 'Alles passt.', datum: '2026-02-27T11:00:00Z' },
    ],
    freigabe: { status: 'pending', freigegebenVon: null, datum: null, kommentar: null },
    hubTeam: null,
    integrator: null,
    createdAt: '2026-02-20T08:00:00Z',
    updatedAt: '2026-02-27T11:00:00Z',
  },
  {
    id: '4',
    standortName: 'Aldi Süd Köln-Ehrenfeld',
    standortId: 'STD-004',
    step: 'hub_team',
    displayCount: 4,
    displayPositions: [
      { id: 'p7', beschreibung: 'Eingang', typ: '55 Zoll', etage: 'EG' },
      { id: 'p8', beschreibung: 'Gang 1', typ: '43 Zoll', etage: 'EG' },
      { id: 'p9', beschreibung: 'Gang 3', typ: '43 Zoll', etage: 'EG' },
      { id: 'p10', beschreibung: 'Ausgang', typ: '32 Zoll', etage: 'EG' },
    ],
    feedback: [
      { id: 'f3', autor: 'Tom Weber', text: 'Bitte Display in Gang 2 statt Gang 3.', datum: '2026-02-22T09:30:00Z' },
      { id: 'f4', autor: 'Anna Braun', text: 'Angepasst, Gang 2 bestätigt.', datum: '2026-02-23T10:00:00Z' },
    ],
    freigabe: { status: 'approved', freigegebenVon: 'Julia Keller', datum: '2026-02-24T15:00:00Z', kommentar: 'Alles geprüft und genehmigt.' },
    hubTeam: { kontaktName: '', kontaktTelefon: '', kontaktEmail: '', notizen: '', standortInformiert: false },
    integrator: null,
    createdAt: '2026-02-18T07:00:00Z',
    updatedAt: '2026-02-24T15:00:00Z',
  },
  {
    id: '5',
    standortName: 'Lidl Filiale Frankfurt-Bockenheim',
    standortId: 'STD-005',
    step: 'integrator',
    displayCount: 2,
    displayPositions: [
      { id: 'p11', beschreibung: 'Eingangsbereich', typ: '55 Zoll', etage: 'EG' },
      { id: 'p12', beschreibung: 'Kassenbereich', typ: '43 Zoll', etage: 'EG' },
    ],
    feedback: [
      { id: 'f5', autor: 'Sarah Lang', text: 'Passt so.', datum: '2026-02-15T13:00:00Z' },
    ],
    freigabe: { status: 'approved', freigegebenVon: 'Michael Braun', datum: '2026-02-16T10:00:00Z', kommentar: 'Freigegeben.' },
    hubTeam: { kontaktName: 'Peter Hoffmann', kontaktTelefon: '+49 69 12345678', kontaktEmail: 'p.hoffmann@lidl.de', notizen: 'Schlüssel beim Filialleiter abholen', standortInformiert: true },
    integrator: { firmaName: 'TechInstall GmbH', ansprechpartner: 'Klaus Richter', telefon: '+49 170 9876543', terminDatum: null, terminBestaetigt: false, installationsStatus: null, notizen: '' },
    createdAt: '2026-02-10T06:00:00Z',
    updatedAt: '2026-02-20T16:00:00Z',
  },
  {
    id: '6',
    standortName: 'Netto Marken-Discount Dresden',
    standortId: 'STD-006',
    step: 'vorschlag',
    displayCount: 2,
    displayPositions: [
      { id: 'p13', beschreibung: 'Eingang rechts', typ: '43 Zoll', etage: 'EG' },
      { id: 'p14', beschreibung: 'Tiefkühlbereich', typ: '32 Zoll', etage: 'EG' },
    ],
    feedback: [],
    freigabe: null,
    hubTeam: null,
    integrator: null,
    createdAt: '2026-03-03T11:00:00Z',
    updatedAt: '2026-03-03T11:00:00Z',
  },
];

export function generateId() {
  return String(nextId++);
}
