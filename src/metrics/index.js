/**
 * KPI Metrics Dictionary — central module for metric definitions.
 *
 * Re-exports all predicates, constants, and computation functions
 * so consumers can import from a single entry point:
 *
 *   import { isStorno, isAlreadyInstalled, OVERDUE_THRESHOLDS } from '../metrics';
 */

// Predicates
export { isStorno, isAlreadyInstalled, isReadyForInstall, isPendingApproval } from './predicates.js';

// Constants
export {
  OVERDUE_THRESHOLDS,
  STATUS_THRESHOLDS,
  BOOKING_STATUS_CONFIG,
  WEEKLY_BUILD_TARGET,
} from './constants.js';

// Computation functions
export {
  computeBookingStatusCounts,
  getOverdueInfo,
  computeConversionRate,
  computeNoShowRate,
} from './computations/installation.js';
