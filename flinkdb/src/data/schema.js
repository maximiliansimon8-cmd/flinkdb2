/**
 * FlinkDB Workflow Schema
 *
 * 5-Step Display Rollout Process:
 * 1. Vorschlag     - Display-Positionen vorschlagen
 * 2. Feedback      - Feedback sammeln
 * 3. Freigabe      - Genehmigung erteilen
 * 4. Hub Team      - Standort informieren, Kontaktdaten eintragen
 * 5. Integrator    - Termin abstimmen & installieren
 */

export const STEPS = [
  {
    id: 'vorschlag',
    label: 'Vorschlag',
    description: 'Display-Positionen vorschlagen',
    color: 'bg-blue-500',
    textColor: 'text-blue-700',
    bgLight: 'bg-blue-50',
    borderColor: 'border-blue-300',
  },
  {
    id: 'feedback',
    label: 'Feedback',
    description: 'Feedback zum Vorschlag',
    color: 'bg-amber-500',
    textColor: 'text-amber-700',
    bgLight: 'bg-amber-50',
    borderColor: 'border-amber-300',
  },
  {
    id: 'freigabe',
    label: 'Freigabe',
    description: 'Genehmigung erteilen',
    color: 'bg-purple-500',
    textColor: 'text-purple-700',
    bgLight: 'bg-purple-50',
    borderColor: 'border-purple-300',
    isApprovalGate: true,
  },
  {
    id: 'hub_team',
    label: 'Hub Team',
    description: 'Standort informieren & Kontaktdaten eintragen',
    color: 'bg-teal-500',
    textColor: 'text-teal-700',
    bgLight: 'bg-teal-50',
    borderColor: 'border-teal-300',
  },
  {
    id: 'integrator',
    label: 'Integrator',
    description: 'Termin abstimmen & Installation',
    color: 'bg-green-500',
    textColor: 'text-green-700',
    bgLight: 'bg-green-50',
    borderColor: 'border-green-300',
  },
];

export const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const INSTALLATION_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};
