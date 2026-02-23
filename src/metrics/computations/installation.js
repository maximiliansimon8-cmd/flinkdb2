/**
 * Computation functions for installation booking metrics.
 *
 * Pure functions that derive KPI values from raw booking data.
 * No side effects, no React dependencies — testable in isolation.
 */

import { OVERDUE_THRESHOLDS } from '../constants.js';

/**
 * Counts bookings by status.
 *
 * @param {Array<Object>} bookings - Array of booking records
 * @returns {{ total: number, pending: number, booked: number, confirmed: number, completed: number, cancelled: number, noShow: number }}
 */
export function computeBookingStatusCounts(bookings) {
  const counts = {
    total: 0,
    pending: 0,
    booked: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
  };

  for (const b of bookings) {
    counts.total++;
    switch (b.status) {
      case 'pending':   counts.pending++;   break;
      case 'booked':    counts.booked++;    break;
      case 'confirmed': counts.confirmed++; break;
      case 'completed': counts.completed++; break;
      case 'cancelled': counts.cancelled++; break;
      case 'no_show':   counts.noShow++;    break;
      default: break;
    }
  }

  return counts;
}

/**
 * Determines whether a booking is overdue and why.
 *
 * Two conditions:
 *   1. Pending + WhatsApp sent > PENDING_NO_RESPONSE_HOURS ago
 *   2. Booked + install date within UNCONFIRMED_BEFORE_INSTALL_HOURS
 *
 * @param {Object} booking - A booking record
 * @param {number} [now=Date.now()] - Current timestamp (injectable for testing)
 * @returns {{ isOverdue: boolean, reason: string|null, severity: 'warning'|'critical'|null }}
 */
export function getOverdueInfo(booking, now = Date.now()) {
  const { PENDING_NO_RESPONSE_HOURS, UNCONFIRMED_BEFORE_INSTALL_HOURS } = OVERDUE_THRESHOLDS;

  if (booking.status === 'pending' && booking.whatsapp_sent_at) {
    const sentAt = new Date(booking.whatsapp_sent_at).getTime();
    const hoursSinceSent = (now - sentAt) / (1000 * 60 * 60);
    if (hoursSinceSent > PENDING_NO_RESPONSE_HOURS) {
      return {
        isOverdue: true,
        reason: `Keine Antwort seit ${Math.round(hoursSinceSent)}h (Schwelle: ${PENDING_NO_RESPONSE_HOURS}h)`,
        severity: 'warning',
      };
    }
  }

  // "Booked" is treated as confirmed — no separate confirmation step needed.
  // Previously flagged unconfirmed bookings near install date, but bookings
  // are now auto-confirmed on creation.

  return { isOverdue: false, reason: null, severity: null };
}

/**
 * Computes invite-to-booking conversion rate.
 *
 * Formula: (booked + confirmed + completed) / (pending + booked + confirmed + completed) * 100
 *
 * Cancelled and no-show are excluded from the denominator because they
 * represent records that left the funnel entirely.
 *
 * @param {Array<Object>} bookings - Array of booking records
 * @returns {number} Percentage (0-100), rounded to nearest integer
 */
export function computeConversionRate(bookings) {
  const counts = computeBookingStatusCounts(bookings);
  const denominator = counts.pending + counts.booked + counts.confirmed + counts.completed;
  const numerator = counts.booked + counts.confirmed + counts.completed;
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

/**
 * Computes no-show rate.
 *
 * Formula: noShow / (completed + noShow) * 100
 *
 * Only considers bookings that reached the appointment stage.
 *
 * @param {Array<Object>} bookings - Array of booking records
 * @returns {number} Percentage (0-100), rounded to nearest integer
 */
export function computeNoShowRate(bookings) {
  const counts = computeBookingStatusCounts(bookings);
  const denominator = counts.completed + counts.noShow;
  return denominator > 0 ? Math.round((counts.noShow / denominator) * 100) : 0;
}
