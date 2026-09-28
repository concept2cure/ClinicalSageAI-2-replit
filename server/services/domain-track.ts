/**
 * The one vocabulary for `domain_track` on the governance ledger.
 *
 * ## Why this module exists
 *
 * Two different vocabularies in this repository are both called
 * `domain_track`, and one service was passing one where the other was
 * required:
 *
 * - **Discipline** — the nine values below. This is what
 *   `assumption_records.domain_track` and `decision_records.domain_track`
 *   accept; both columns carry a CHECK constraint naming exactly these
 *   (db/migrations/20260323_assumption_decision_contradiction.sql).
 * - **Product modality** — `biotech | device | diagnostics | combination |
 *   biosimilar`, declared as `domainTrackEnum` in
 *   `shared/schema/operating-system.ts` and used on the governance
 *   boundary-rule table. A different column on a different table that
 *   happens to share the name.
 *
 * `operating-system-integration.ts` declared the modality set inline and
 * handed it to the assumption registry, and
 * `governed-decision-repository.ts` invented a tenth value, `governance`.
 * Both are rejected by the CHECK, and both writers swallowed the rejection
 * into a warning — so the governance ledger recorded nothing at all while
 * every caller was told the decision had been recorded.
 *
 * So: one exported list, one type, one assertion, imported by every writer.
 * A value outside the list now fails at the service boundary with a message
 * naming the allowed set, instead of surfacing as a constraint violation
 * inside somebody's catch block.
 *
 * Changing this list means changing the CHECK constraint in that migration
 * too — amended in place, per RULE 1. The list and the constraint are one
 * fact written twice, and `domain-track.test.ts` reads the migration to
 * prove they still agree.
 *
 * @module server/services/domain-track
 */

/**
 * The disciplines the governance ledger recognises, in the order the
 * migration's CHECK constraint lists them.
 */
export const DOMAIN_TRACKS = [
  'clinical',
  'nonclinical',
  'cmc',
  'biostatistics',
  'regulatory',
  'pharmacology',
  'safety',
  'labeling',
  'commercial',
] as const;

/** A discipline on the governance ledger. Never a product modality. */
export type DomainTrack = (typeof DOMAIN_TRACKS)[number];

/**
 * The track used when a decision cannot be attributed to a discipline.
 *
 * `regulatory`, matching the default `decisionRecordService.createDecision`
 * has always applied. A governed act with no CTD placement is a regulatory
 * act by default, not an unrecorded one.
 */
export const DEFAULT_DOMAIN_TRACK: DomainTrack = 'regulatory';

/** Whether a value is one of the nine disciplines. */
export function isDomainTrack(value: unknown): value is DomainTrack {
  return typeof value === 'string' && (DOMAIN_TRACKS as readonly string[]).includes(value);
}

/**
 * Refuse a value the ledger cannot store, at the boundary, naming the caller.
 *
 * The alternative is what this repository had: the value reaches the INSERT,
 * PostgreSQL raises 23514, and the writer's catch turns a total failure of
 * the governance ledger into a log line nobody reads.
 */
export function assertDomainTrack(value: unknown, context: string): DomainTrack {
  if (isDomainTrack(value)) return value;
  throw new Error(
    `${context}: domainTrack ${JSON.stringify(value)} is not a governance discipline. ` +
      `Allowed: ${DOMAIN_TRACKS.join(', ')}. ` +
      'Product modalities (biotech, device, diagnostics, combination, biosimilar) are a ' +
      'different vocabulary on a different table — see server/services/domain-track.ts.',
  );
}

/**
 * The discipline that owns a CTD section.
 *
 * The CTD's module numbering IS the discipline split, so a governed act on a
 * placed artifact can be attributed without asking anyone: Module 3 is
 * quality/CMC, Module 4 nonclinical, Module 5 clinical, Module 1 regional
 * administrative. Module 2's summaries follow the module they summarise
 * (2.3 quality, 2.4 and 2.6 nonclinical, 2.5 and 2.7 clinical).
 *
 * Anything unplaced or unrecognised is `regulatory` — the default above.
 * This function never guesses beyond the numbering.
 */
export function domainTrackForCtdSection(...candidates: Array<string | undefined | null>): DomainTrack {
  for (const raw of candidates) {
    if (!raw) continue;
    const code = String(raw).trim().toLowerCase().replace(/^module\s*/, '').replace(/^m/, '');
    if (!code) continue;
    if (code.startsWith('3')) return 'cmc';
    if (code.startsWith('4')) return 'nonclinical';
    if (code.startsWith('5')) return 'clinical';
    if (code.startsWith('2')) {
      if (code.startsWith('2.3')) return 'cmc';
      if (code.startsWith('2.4') || code.startsWith('2.6')) return 'nonclinical';
      if (code.startsWith('2.5') || code.startsWith('2.7')) return 'clinical';
      return DEFAULT_DOMAIN_TRACK;
    }
    if (code.startsWith('1')) return 'regulatory';
  }
  return DEFAULT_DOMAIN_TRACK;
}
