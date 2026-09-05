/**
 * Ordering for regulatory section codes.
 *
 * ── Why this is not `localeCompare(a, b, { numeric: true })` ─────────────────
 * That comparator was written inline at six sites in this repo, and it gets the
 * numbers right: it puts 2.7.3 before 2.7.10 and 5.6 before 5.10, which a
 * lexical sort does not.
 *
 * It gets Module 3 exactly backwards. The alphabetic segments of the CTD
 * quality module are not letters to be alphabetised — they are named parts with
 * a fixed order set by ICH M4Q:
 *
 *     3.2.S  Drug Substance
 *     3.2.P  Drug Product
 *     3.2.A  Appendices
 *     3.2.R  Regional Information
 *
 * Alphabetical gives A, P, R, S — drug product assembled ahead of drug
 * substance, appendices ahead of both. This repo's own canonical list
 * (CTD_SECTIONS in shared/regulatory/project-bootstrap.ts) is declared S, P, A,
 * and for an assembled dossier the order IS the deliverable
 * (MDX_WORK_ORDER W1-2).
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 * Compare segment by segment, left to right:
 *   • two numeric segments compare as numbers (so 10 follows 9, not 1);
 *   • two alphabetic segments compare by CTD rank where both are known parts,
 *     and alphabetically otherwise — an unknown letter is ordered predictably
 *     rather than silently ahead of everything;
 *   • a numeric segment sorts before an alphabetic one at the same depth;
 *   • a shorter code sorts before a longer one that extends it, so 5.1 precedes
 *     5.1.1 and a parent always precedes its children.
 *
 * @module shared/regulatory/section-code
 */

/**
 * Order of the named parts of CTD Module 3.2, per ICH M4Q. Lower sorts first.
 * A letter not listed here is ordered alphabetically after all of these, which
 * keeps an unrecognised code deterministic instead of arbitrary.
 */
const CTD_PART_RANK: Readonly<Record<string, number>> = Object.freeze({
  S: 0, // Drug Substance
  P: 1, // Drug Product
  A: 2, // Appendices
  R: 3, // Regional Information
});

interface Segment {
  num: number | null;
  text: string;
}

function segments(code: string): Segment[] {
  return String(code ?? '')
    .trim()
    .split('.')
    .filter((s) => s.length > 0)
    .map((s) => {
      const num = /^\d+$/.test(s) ? Number(s) : null;
      return { num, text: s.toUpperCase() };
    });
}

function compareSegment(a: Segment, b: Segment): number {
  if (a.num !== null && b.num !== null) return a.num - b.num;
  // A numeric segment is a level of the outline; an alphabetic one is a named
  // part hanging off it. Numbers first keeps 3.2.1 ahead of 3.2.S.
  if (a.num !== null) return -1;
  if (b.num !== null) return 1;

  const ra = CTD_PART_RANK[a.text];
  const rb = CTD_PART_RANK[b.text];
  if (ra !== undefined && rb !== undefined) return ra - rb;
  // A known CTD part sorts ahead of anything unrecognised, so an odd code
  // cannot displace drug substance.
  if (ra !== undefined) return -1;
  if (rb !== undefined) return 1;
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

/**
 * Compare two section codes for display and assembly order.
 * Suitable directly as an `Array.prototype.sort` comparator.
 */
export function compareSectionCode(a: string, b: string): number {
  const sa = segments(a);
  const sb = segments(b);
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    const c = compareSegment(sa[i], sb[i]);
    if (c !== 0) return c;
  }
  // One is a prefix of the other: the parent comes first.
  return sa.length - sb.length;
}

/** Sort a list of items by their section code, without mutating the input. */
export function sortBySectionCode<T>(items: readonly T[], codeOf: (item: T) => string): T[] {
  return [...items].sort((x, y) => compareSectionCode(codeOf(x), codeOf(y)));
}

/**
 * Where a new code belongs among an ORDERED list of existing codes.
 *
 * Returns the index of the first existing code that sorts after `code`, or the
 * list length when it belongs at the end. Deliberately relative: it reads the
 * order the list is already in rather than imposing code order over it, so a
 * document someone has deliberately reordered keeps that order and the new
 * section still lands somewhere sensible in it. A document nobody has reordered
 * converges on full code order one insert at a time.
 */
export function sectionInsertIndex(orderedCodes: readonly string[], code: string): number {
  for (let i = 0; i < orderedCodes.length; i++) {
    if (compareSectionCode(orderedCodes[i], code) > 0) return i;
  }
  return orderedCodes.length;
}

/**
 * Structural problems with a document's section codes.
 *
 * ── What is reported, and what deliberately is not ───────────────────────────
 * Two things are unambiguously wrong and are reported:
 *
 *   duplicateCodes  two sections filed under one code. The assembled dossier
 *                   then has two 3.2.S and a reviewer cannot tell which is
 *                   meant, or which one a cross-reference points at.
 *   outOfOrder      the stored order disagrees with the order the codes belong
 *                   in. New documents converge on code order as sections are
 *                   created, but every document created before that did so has
 *                   its sections at one index, so they render in whatever order
 *                   the database returns.
 *
 * MISSING codes are NOT reported, and the omission is deliberate. W1-2 asks for
 * "gaps", but a gap in a numeric sequence is not a defect here: CTD section
 * codes are not contiguous — a dossier legitimately holds 1.1, 1.2, 1.5 with no
 * 1.3 or 1.4 — so flagging every skipped integer would bury the two real
 * problems under noise a reader must dismiss every time. The useful sense of
 * "missing section" is a REQUIRED section with no content, which the readiness
 * engines already answer against each pathway's own requirements; duplicating
 * that judgement here from the codes alone would be a second, worse answer to a
 * question that already has one.
 */
export interface SectionStructureIssues {
  duplicateCodes: string[];
  /** True when the given order is not the order the codes belong in. */
  outOfOrder: boolean;
  /** The codes in the order they belong in — what a repair would apply. */
  suggestedOrder: string[];
}

/**
 * Inspect a document's section codes IN THEIR STORED ORDER.
 *
 * Order matters to the caller: pass the codes as the document currently renders
 * them, not sorted, or `outOfOrder` can only ever be false.
 */
export function sectionStructureIssues(orderedCodes: readonly string[]): SectionStructureIssues {
  const codes = orderedCodes.map((c) => String(c ?? '').trim()).filter((c) => c.length > 0);
  const suggestedOrder = [...codes].sort(compareSectionCode);
  const outOfOrder = codes.some((c, i) => c !== suggestedOrder[i]);
  return { duplicateCodes: duplicateSectionCodes(codes), outOfOrder, suggestedOrder };
}

/**
 * Duplicate codes in a document, in first-seen order.
 *
 * Two sections filed under one code is not a display problem: the assembled
 * dossier has two 3.2.S and a reviewer cannot tell which is meant.
 */
export function duplicateSectionCodes(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const raw of codes) {
    const key = String(raw ?? '').trim().toUpperCase();
    if (!key) continue;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return [...dupes];
}
