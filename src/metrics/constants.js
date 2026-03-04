/**
 * Shared constants for KPI metrics and installation module.
 *
 * Centralizes magic numbers and configuration that were previously
 * scattered across multiple components.
 */

/**
 * Overdue thresholds (in hours) used to flag bookings that need attention.
 */
export const OVERDUE_THRESHOLDS = {
  /** Pending invite with no response after this many hours */
  PENDING_NO_RESPONSE_HOURS: 48,
  /** Unconfirmed booking within this many hours before the install date */
  UNCONFIRMED_BEFORE_INSTALL_HOURS: 24,
  /** Follow-up confirmation call needed when install is within this many hours */
  CONFIRMATION_CALL_WITHIN_HOURS: 72,
};

/**
 * Status thresholds for display-status categories.
 * Maps booking statuses to severity levels for visual grouping.
 */
export const STATUS_THRESHOLDS = {
  /** Statuses considered "active" (in progress) */
  ACTIVE_STATUSES: ['pending', 'booked', 'confirmed'],
  /** Statuses considered "completed" (finished) */
  COMPLETED_STATUSES: ['completed'],
  /** Statuses considered "negative" (lost / did not happen) */
  NEGATIVE_STATUSES: ['cancelled', 'no_show'],
};

/**
 * Booking status configuration: colors and labels for each booking status.
 * Used consistently across Executive Dashboard, Bookings Dashboard, etc.
 */
export const BOOKING_STATUS_CONFIG = {
  pending:   { color: '#eab308', label: 'Eingeladen' },
  booked:    { color: '#34C759', label: 'Eingebucht' },
  confirmed: { color: '#34C759', label: 'Eingebucht' },
  completed: { color: '#10b981', label: 'Abgeschlossen' },
  cancelled: { color: '#FF3B30', label: 'Storniert' },
  no_show:   { color: '#6b7280', label: 'No-Show' },
};

/**
 * Weekly build target — number of installations to aim for per week.
 */
export const WEEKLY_BUILD_TARGET = 25;
