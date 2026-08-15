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
