/**
 * Canonical predicate definitions for KPI metrics.
 *
 * These functions are the SINGLE SOURCE OF TRUTH for determining record states
 * across the entire Installation module. Every component must import from here
 * instead of defining its own local copy.
 *
 * Data origin: Airtable fields synced via src/utils/airtableService.js
 * into the `acquisition` table in Supabase.
 */

/**
 * Determines whether an acquisition record is cancelled / dropped out (storniert).
 *
 * Checks three independent conditions:
 *   1. akquiseStorno  — record was cancelled, aborted, or not approved during
 *                        the acquisition phase (catch-all boolean in Airtable)
 *   2. postInstallStorno — cancellation AFTER installation (Kuendigung / Abbau)
 *   3. leadStatus contains 'storno', 'cancelled', or 'lost' — status-based fallback
 *      (leadStatus is the Akquise pipeline status from the acquisition table, NOT from installations)
 *
 * Origin: Airtable fields synced via airtableService.js -> Supabase `acquisition`
 *
 * @param {Object} record - An acquisition record from Supabase/Airtable
 * @returns {boolean}
 */
export function isStorno(record) {
  if (record.akquiseStorno === true || record.akquiseStorno === 'true') return true;
  if (record.postInstallStorno === true || record.postInstallStorno === 'true') return true;
  const ls = (record.leadStatus || '').toLowerCase();
  return ls.includes('storno') || ls.includes('cancelled') || ls.includes('lost');
}

/**
 * Determines whether an acquisition record represents a location that is
 * already installed, live, or had an installation attempt (including aborted).
 *
 * KANONISCHE VERSION — union of all component variants:
 *   - installationsStatus contains 'installiert', 'live', or 'abgebrochen'
 *   - leadStatus === 'live' or 'installation'
 *   - displayLocationStatus has at least one non-empty entry
 *
 * NOTE: 'abgebrochen' (aborted installation) is included because these
 * locations already had an installation attempt and should NOT appear
 * in the "ready for install" queue again without manual re-evaluation.
 *
 * @param {Object} record - An acquisition record from Supabase/Airtable
 * @returns {boolean}
 */
export function isAlreadyInstalled(record) {
  const statuses = Array.isArray(record.installationsStatus) ? record.installationsStatus : [];
  if (statuses.some(s => {
    const sl = (s || '').toLowerCase();
    return sl.includes('installiert') || sl.includes('live') || sl.includes('abgebrochen');
  })) return true;
  if ((record.leadStatus || '').toLowerCase() === 'live') return true;
  if ((record.leadStatus || '').toLowerCase() === 'installation') return true;
  const displayNames = Array.isArray(record.displayLocationStatus) ? record.displayLocationStatus : [];
  return displayNames.some(s => s && s.trim().length > 0);
}

/**
 * Determines whether an acquisition record is ready for installation
 * (aufbaubereit).
 *
 * Business definition — ALL conditions must be true:
 *   1. leadStatus is "Won / Signed" (Vertrag unterschrieben)
 *   2. approvalStatus is "Accepted" or "Approved" (Genehmigung erteilt)
 *   3. vertragVorhanden — Vertrag PDF liegt vor
 *   4. NOT storniert (checked via isStorno)
 *   5. NOT already installed (checked via isAlreadyInstalled)
 *
 * NOTE: Conditions 4 + 5 are typically applied by the CALLER (e.g.
 * `notStornNotInstalled.filter(a => isReadyForInstall(a))`), so this
 * predicate only checks conditions 1 + 2 + 3 — the "positive" criteria.
 *
 * Previously this used the Airtable formula field `readyForInstallation`,
 * but that was opaque and did not always match the business definition.
 * The canonical check now uses the explicit fields.
 *
 * Origin: Airtable fields synced via airtableService.js -> Supabase `acquisition`
 *
 * @param {Object} record - An acquisition record from Supabase/Airtable
 * @returns {boolean}
 */
export function isReadyForInstall(record) {
  const ls = (record.leadStatus || '').toLowerCase();
  const isWonSigned = ls === 'won / signed' || ls === 'won/signed';

  const as = (record.approvalStatus || '').toLowerCase();
  const isApproved = as === 'accepted' || as === 'approved';

  // DB values: "YES", true, "true", "checked" — all mean contract exists
  const vv = record.vertragVorhanden;
  const hasVertrag = vv === true
    || vv === 'true'
    || vv === 'checked'
    || vv === 'YES'
    || vv === 'yes';

  return isWonSigned && isApproved && hasVertrag;
}

/**
 * Determines whether an acquisition record is in the "Offene Prüfungen"
 * pipeline — won/signed but approval is still pending.
 *
 * Matches the Airtable "Offene Prüfungen" view filter:
 *   1. leadStatus is "Won / Signed"
 *   2. approvalStatus is one of: "In review", "Info required", "not started"
 *      (also matches "not tarted" — known typo in Airtable data)
 *   3. NOT storniert (checked by caller)
 *   4. NOT already installed (checked by caller — Installationen is empty)
 *
 * NOTE: Unlike isReadyForInstall, this does NOT require vertragVorhanden.
 *
 * @param {Object} record - An acquisition record from Supabase/Airtable
 * @returns {boolean}
 */
export function isPendingApproval(record) {
  const ls = (record.leadStatus || '').toLowerCase();
  const isWonSigned = ls === 'won / signed' || ls === 'won/signed';

  const as = (record.approvalStatus || '').toLowerCase().trim();
  const isPending = as === 'in review'
    || as === 'info required'
    || as === 'not started'
    || as === 'not tarted';  // known Airtable typo

  return isWonSigned && isPending;
}
