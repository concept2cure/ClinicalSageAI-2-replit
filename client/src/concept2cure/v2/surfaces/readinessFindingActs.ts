/**
 * What a readiness finding's act opens (F18, docs/design/FILING_SPINE.md §7.2).
 *
 * Submission Readiness's "Fix" sent a sentence into the chat. A finding is
 * fixed where its defect is: a section with nothing placed is placed in the
 * Builder; a placed leaf whose source or lifecycle is wrong is that leaf's row
 * in the Builder (a new placement would only add a second leaf beside it);
 * everything the Builder cannot change is read in Validation, which shows the
 * same findings for that sequence.
 *
 * This only routes. It computes no verdict and decides nothing about whether
 * the finding is right; an unknown code goes to Validation.
 *
 * The codes are the error-severity findings the server produces
 * (server/services/ectd/dispatch-readiness.ts, ind-program-findings.ts).
 * Warnings and infos get no act, as before.
 */
import type { ReadinessFinding } from './programSequence';

export type FindingAct =
  | { kind: 'place'; code: string | null; label: string }
  | { kind: 'leaf'; code: string; label: string }
  | { kind: 'validation'; label: string };

/** Nothing is placed where the finding points: placing a leaf clears it. */
const PLACE = new Set(['MISSING_REQUIRED_SECTION', 'IND_MODULE3_REQUIRED', 'EMPTY_SEQUENCE']);

/** The defect is on a placed leaf: its source, content or lifecycle operation. */
const LEAF = new Set([
  'UNRESOLVED_DOCUMENT',
  'DOCUMENT_CONTENT_MISMATCH',
  'UNPLACEABLE_DOCUMENT_TABLE',
  'EXTERNAL_DOCUMENT_NOT_MATERIALIZABLE',
  'INVALID_LIFECYCLE_OP',
  'LIFECYCLE_OP_IN_ORIGINAL',
]);

/** The act for an error finding, or null for a warning or info. A
 *  cross-reference letter, a sequence number or a regional format is not
 *  changed by a placement, so those go to Validation, never to a false fix. */
export function findingAct(f: Pick<ReadinessFinding, 'severity' | 'code' | 'sectionCode'>): FindingAct | null {
  if (f.severity !== 'error') return null;
  const code = typeof f.sectionCode === 'string' && f.sectionCode.trim() ? f.sectionCode.trim() : null;
  if (PLACE.has(f.code)) return { kind: 'place', code, label: code ? `Place a leaf at ${code}` : 'Place a leaf' };
  if (LEAF.has(f.code) && code) return { kind: 'leaf', code, label: `Open the leaf at ${code}` };
  return { kind: 'validation', label: 'Open in Validation' };
}
