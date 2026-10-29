/**
 * CSR saved evidence (2026-10-30, docs/design/CSR_END_TO_END_2026-10-29.md,
 * edited-section re-check): a medical writer edits a CSR section after import.
 * Its hash no longer matches the receipts, so the slice-5 verdict blocked it
 * forever (SECTION_VERSION_CHANGED). Instead, the edited section's CURRENT
 * text is re-reconciled against the claim receipts the import carried:
 *
 *   - a claimed cell still stated (verbatim, or every one of its numbers)
 *     passes, and the existing gate still compares the claim to the cell the
 *     retained run holds now (NUMERIC_MISMATCH when the source changed);
 *   - a figure written in the cell's shape (or an n/N with the cell's
 *     denominator) but with other numbers is FIGURE_CHANGED: it blocks, naming
 *     the figure as stated and the cell it was likely meant to be;
 *   - a claimed figure the edit removed is CLAIM_NOT_STATED, reported and not
 *     blocking: removing a figure states nothing false; the reviewer sees it;
 *   - every other number goes through the caller's unclaimed-figure check,
 *     which blocks in a results section exactly as for an unedited one.
 *
 * Pure. Nothing here decides approval; the verdict stays pending human review.
 */
import type { CsrCellClaim } from '../csr/csr-claim-receipts';

export type EditedClaimOutcome =
  | { state: 'stated' }
  | { state: 'changed'; stated: string }
  | { state: 'removed' };

const NUMBER = /\d+(?:\.\d+)?/g;
const RATIO = /(\d+)\s*(?:\/|of)\s*(\d+)/g;
const numbersOf = (s: string) => [...s.matchAll(NUMBER)].map(m => String(Number(m[0])));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The cell's text as a pattern: its numbers free, its punctuation fixed, its spacing loose. */
function cellShape(value: string): RegExp | null {
  const parts = squash(value).split(NUMBER);
  // One number alone has no shape to recognise; the unclaimed check covers it.
  if (parts.length < 3) return null;
  const body = parts.map(p => p.split(' ').map(escape).join('\\s+')).join('\\d+(?:\\.\\d+)?');
  return new RegExp(`(?<![\\d.])${body}(?![\\d.]*\\d)`, 'g');
}

/** A figure in the cell's shape whose numbers differ from the cell's, and are no other claimed cell's. */
function changedShape(text: string, value: string, claimedValues: Set<string>): string | null {
  const shape = cellShape(value);
  if (!shape) return null;
  const target = squash(value);
  const hits = [...text.matchAll(shape)].map(m => squash(m[0]));
  if (hits.includes(target)) return null;
  return hits.find(h => !claimedValues.has(h)) ?? null;
}

/** An n/N (or n of N) with the cell's denominator and another numerator, that no claimed cell states as n/N.
 * Review (2026-10-30): the exclusion is the claimed ratio, not any claimed number, so a numerator
 * another cell happens to carry (18 in 18/300) cannot hide 16/305 changed to 18 of 305. */
function changedRatio(text: string, value: string, claimed: Set<string>): string | null {
  for (const r of value.matchAll(RATIO)) {
    const hit = [...text.matchAll(RATIO)].find(m => m[2] === r[2] && m[1] !== r[1] && !claimed.has(`${Number(m[1])}/${Number(m[2])}`));
    if (hit) return hit[0];
  }
  return null;
}

/**
 * What an edited section's current text does with one claimed cell. `text` is
 * the accepted text with layout numbering removed; `claimedValues` the exact
 * cell texts every claim of the section carries.
 */
export function editedClaimOutcome(text: string, claim: Pick<CsrCellClaim, 'value'>, claimedValues: readonly string[]): EditedClaimOutcome {
  const values = new Set(claimedValues.map(squash));
  const shaped = changedShape(text, claim.value, values);
  if (shaped) return { state: 'changed', stated: shaped };
  const stated = new Set(numbersOf(text));
  if (numbersOf(claim.value).every(n => stated.has(n))) return { state: 'stated' };
  const claimedRatios = new Set(claimedValues.flatMap(v => [...v.matchAll(RATIO)].map(m => `${Number(m[1])}/${Number(m[2])}`)));
  const ratio = changedRatio(text, claim.value, claimedRatios);
  return ratio ? { state: 'changed', stated: ratio } : { state: 'removed' };
}
