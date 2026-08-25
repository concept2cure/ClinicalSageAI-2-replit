/**
 * The three states a readiness narrative may speak from — and the one it may not.
 *
 * ── The defect this exists to make unrepresentable ───────────────────────────
 * The NDA/BLA filing cockpit told a reviewer, over a program with no content at
 * all:
 *
 *   "You're 0% ready to file — no Refuse-to-File blockers left, 0 items to tidy
 *    before you submit. The remaining items are administrative, not structural
 *    — close them out and the package is fileable. You're close."
 *
 * Every clause is literally true of an empty list and every clause is false of
 * the program. The code that produced it was a two-branch conditional:
 *
 *   highs.length ? <urgent copy> : <"no blockers left" copy>
 *
 * There is no third branch, so "we found nothing" and "we have not looked" are
 * the same expression. For Refuse-to-File that is not a wording problem. RtF is
 * the precise risk the surface exists to manage, and an unexamined program
 * asserting there are no RtF blockers is the most expensive sentence the
 * product can say to a regulatory director.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * An empty findings set is not a finding of "none". Clearance is a POSITIVE
 * claim and requires positive evidence that an assessment ran. Absence of
 * evidence is `not-assessed`, and `not-assessed` never borrows the vocabulary of
 * `assessed-clear`.
 *
 * The same reasoning already exists server-side, one layer down, in
 * server/routes/governed-intelligence-inconsistency-routes.ts: a findings READ
 * FAILURE must never degrade to "clean / ready to file". This module is that
 * rule applied to the narrative layer, where the read SUCCEEDS and returns
 * nothing — the case the server-side guard does not cover.
 *
 * ── Why `assessed-clear` needs `assessmentRan` and not `findings.length === 0`
 * A caller cannot reach `assessed-clear` by having no findings. It must pass
 * evidence that the evaluation happened — a completed shadow review, a recorded
 * assessment timestamp, a validation run. Where no such signal exists yet, the
 * honest state is `not-assessed`, and the narrative says so. That is why this
 * function takes the two facts separately instead of inferring one from the
 * other: the inference is exactly the bug.
 */

export type AssessmentState =
  /** The read has not settled. Say nothing about readiness yet. */
  | 'loading'
  /** The read failed. Never render a failure as an empty result. */
  | 'unreadable'
  /** There is nothing to assess, or nothing has assessed it. */
  | 'not-assessed'
  /** An assessment ran and returned findings. */
  | 'assessed-with-findings'
  /** An assessment ran and returned nothing. The only state that may reassure. */
  | 'assessed-clear';

export interface AssessmentInputs {
  /** The underlying read has not settled. */
  loading?: boolean;
  /** The underlying read failed. Distinct from "returned nothing". */
  unreadable?: boolean;
  /**
   * Is there a subject at all — a program, a submission, a sequence? False means
   * there is nothing an assessment could even have been run against.
   */
  scopeExists: boolean;
  /** How many findings the assessment produced. */
  findingCount: number;
  /**
   * POSITIVE evidence that an evaluation actually ran. Never derive this from
   * `findingCount === 0`; that is the defect. Pass `false` when the surface has
   * no signal for it — the narrative will then decline to claim clearance,
   * which is the correct outcome rather than a limitation.
   */
  assessmentRan: boolean;
}

export function assessmentState(x: AssessmentInputs): AssessmentState {
  if (x.loading) return 'loading';
  if (x.unreadable) return 'unreadable';
  if (!x.scopeExists) return 'not-assessed';
  if (x.findingCount > 0) return 'assessed-with-findings';
  return x.assessmentRan ? 'assessed-clear' : 'not-assessed';
}

/** The shape every live read in this shell returns (`useLiveRows`, `useLiveData`). */
export interface ReadState {
  loading: boolean;
  error?: string;
}

/**
 * The same judgment, taken directly from the read that produced the rows.
 *
 * ── Why this exists rather than callers passing the two flags themselves ─────
 * Because they did not. Four narratives on `BiopharmaSpecialty` — pediatric
 * PREA, orphan designations, lifecycle renewals and pharmacovigilance signals —
 * each derived their state from `rows` ALONE, having written `const prea =
 * livePrea.rows` and dropped `loading` and `error` on that line. Each surface
 * then passed those same two flags to the TABLE below the narrative, so the
 * table said "couldn't load" while the paragraph above it said the set was
 * empty.
 *
 * An empty array is what a live read holds in three different situations: the
 * request is in flight, the request FAILED, or the request succeeded and there
 * is genuinely nothing. Copy written off `rows.length === 0` cannot tell them
 * apart, and the third is the only one that may say "nothing is recorded".
 * Reporting a failed read as an empty result is the error CLAUDE.md names
 * outright — "an error is never rendered as an empty result".
 *
 * `assessmentState` already had `loading` and `unreadable` for exactly this.
 * The gap was the adapter, so every caller re-derived the mapping and all four
 * re-derived it wrongly by omission. There is one mapping now.
 */
export function assessmentStateFor(
  read: ReadState,
  x: Omit<AssessmentInputs, 'loading' | 'unreadable'>,
): AssessmentState {
  return assessmentState({ ...x, loading: read.loading, unreadable: Boolean(read.error) });
}

/**
 * Is this state one the surface may speak a substantive narrative from at all?
 *
 * `loading` and `unreadable` are not weaker versions of "nothing found" — they
 * are the absence of an answer, and a narrative that renders its
 * nothing-found paragraph in either is asserting a fact it does not have.
 */
export function hasAnswer(state: AssessmentState): boolean {
  return state !== 'loading' && state !== 'unreadable';
}

/**
 * May this state carry reassuring copy — "you're close", "building steadily",
 * "no blockers left"?
 *
 * Only one state may, and the extra `percentComplete` gate is the work order's
 * own criterion: a percentage-complete of 0 never co-occurs with reassuring
 * copy. The two can disagree — an assessment can come back clean against a
 * program that has assembled none of its content — and when they do, the
 * completeness figure is the one the reader is looking at.
 */
export function mayReassure(state: AssessmentState, percentComplete?: number): boolean {
  if (state !== 'assessed-clear') return false;
  return percentComplete === undefined || percentComplete > 0;
}
