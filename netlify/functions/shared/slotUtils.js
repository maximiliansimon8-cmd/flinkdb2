/**
 * Shared constants and utilities for installation slot scheduling.
 *
 * Centralizes timing rules so that slot generation (install-booker-slots),
 * booking validation (install-booker-book), and route creation
 * (install-schedule) all use the same parameters.
 */

/** Duration of a single installation appointment in minutes */
export const SLOT_DURATION_MIN = 90;

/** Travel/buffer time between consecutive appointments in minutes */
export const BUFFER_MIN = 30;

/** Total blocked time per appointment: duration + buffer */
export const BLOCK_MIN = SLOT_DURATION_MIN + BUFFER_MIN; // 120

/** Earliest start time for installations */
export const WORK_START = '09:00';

/** Latest end-of-day (last appointment must finish before this) */
export const WORK_END = '22:00';

/** Default time slots for new routes (2h intervals fitting 90min + 30min buffer) */
export const DEFAULT_TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];

/**
 * Convert "HH:MM" string to minutes since midnight.
 * @param {string} t - Time in "HH:MM" format
 * @returns {number}
 */
export function timeToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check whether a proposed time slot overlaps with any already-booked slot
 * on the same route/team, accounting for appointment duration and travel buffer.
 *
 * A booked slot at 12:00 blocks the window 12:00 – 14:00 (90min install + 30min travel).
 * A proposed slot at 13:00 (ending 14:30) would overlap because 13:00 < 14:00.
 *
 * @param {string} proposedTime - "HH:MM" of the slot being checked
 * @param {string[]} bookedTimes - Array of "HH:MM" start times already booked
 * @returns {boolean} true if the proposed slot conflicts with any booking
 */
export function slotsOverlap(proposedTime, bookedTimes) {
  const proposed = timeToMin(proposedTime);
  const proposedEnd = proposed + SLOT_DURATION_MIN;

  for (const bt of bookedTimes) {
    const booked = timeToMin(bt);
    const bookedBlocked = booked + SLOT_DURATION_MIN + BUFFER_MIN;
    // Overlap: proposed starts before booked block ends AND proposed ends after booked starts
    if (proposed < bookedBlocked && proposedEnd > booked) return true;
  }
  return false;
}

/**
 * Calculate end time given a start time, clamped to 23:59.
 * @param {string} startTime - "HH:MM" format
 * @returns {string} "HH:MM" end time
 */
export function calculateEndTime(startTime) {
  const totalMin = timeToMin(startTime) + SLOT_DURATION_MIN;
  const clampedMin = Math.min(totalMin, 23 * 60 + 59); // cap at 23:59
  const h = Math.floor(clampedMin / 60);
  const m = clampedMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Normalize city name for fuzzy matching.
 * Strips common German suffixes like " am Main", " an der ".
 * @param {string} city
 * @returns {string}
 */
export function normalizeCity(city) {
  return (city || '').replace(/ am Main$/i, '').replace(/ an der /i, ' ').trim();
}

// ═══════════════════════════════════════════════════════════
//  TIME WINDOWS — Hybrid model: customers see windows, internal uses exact times
// ═══════════════════════════════════════════════════════════

/** Time windows definition with multilingual labels */
export const TIME_WINDOWS = {
  morning:   { start: '09:00', end: '12:00', label: { de: 'Vormittag',  en: 'Morning',   tr: 'Sabah',           ar: 'صباحاً' }, rangeLabel: { de: '9–12 Uhr', en: '9 AM–12 PM', tr: '9–12', ar: '٩–١٢' } },
  afternoon: { start: '12:00', end: '16:00', label: { de: 'Mittag',     en: 'Afternoon',  tr: 'Öğleden sonra',   ar: 'ظهراً' },  rangeLabel: { de: '12–16 Uhr', en: '12–4 PM', tr: '12–16', ar: '١٢–١٦' } },
  evening:   { start: '16:00', end: '22:00', label: { de: 'Abend',      en: 'Evening',    tr: 'Akşam',           ar: 'مساءً' },  rangeLabel: { de: '16–22 Uhr', en: '4–10 PM', tr: '16–22', ar: '١٦–٢٢' } },
};

/** All valid window keys */
export const TIME_WINDOW_KEYS = Object.keys(TIME_WINDOWS);

/**
 * Determine which time window a given "HH:MM" time falls into.
 * @param {string} time - "HH:MM" format
 * @returns {string|null} 'morning', 'afternoon', 'evening', or null
 */
export function getWindowForTime(time) {
  const mins = timeToMin(time);
  for (const [key, w] of Object.entries(TIME_WINDOWS)) {
    if (mins >= timeToMin(w.start) && mins < timeToMin(w.end)) return key;
  }
  return null;
}

/**
 * Find the best available slot within a time window, avoiding overlap with booked times.
 * Prefers earlier slots. Returns null if no slot is available in the window.
 *
 * @param {string} windowKey - 'morning', 'afternoon', or 'evening'
 * @param {string[]} bookedTimes - Array of "HH:MM" already booked on this route
 * @param {string[]} routeTimeSlots - The route's configured time slots (e.g. ['09:00','11:00',...])
 * @returns {string|null} "HH:MM" of the assigned slot, or null if window is full
 */
export function assignSlotInWindow(windowKey, bookedTimes, routeTimeSlots) {
  const window = TIME_WINDOWS[windowKey];
  if (!window) return null;

  const windowStart = timeToMin(window.start);
  const windowEnd = timeToMin(window.end);

  // Filter route slots to those within the window, then find one that doesn't overlap
  const candidates = (routeTimeSlots || DEFAULT_TIME_SLOTS)
    .filter(slot => {
      const slotMin = timeToMin(slot);
      return slotMin >= windowStart && slotMin < windowEnd;
    })
    .sort((a, b) => timeToMin(a) - timeToMin(b)); // earliest first

  for (const slot of candidates) {
    if (!slotsOverlap(slot, bookedTimes)) return slot;
  }
  return null; // all slots in window are taken
}
