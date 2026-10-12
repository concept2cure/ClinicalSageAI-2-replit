/**
 * How a submission-readiness figure may be spoken.
 *
 * The readiness evaluator does not always measure the same thing. When the
 * filing type has a resolved required-artifact matrix the score is a weighted
 * composite of section completion (60%) and artifact completion (40%). When it
 * does not — the common case, since there are 9 matrices against a much larger
 * application registry — the artifact half is not scored at all and the score
 * is section completion alone, with a `critical` gap raised to say so
 * (`ARTIFACT_REQUIREMENTS_NOT_MODELLED`, `ARTIFACT_APPLICABILITY_NOT_ASSESSED`
 * — server/services/.../readinessEvaluator.ts).
 *
 * The evaluator is honest about this. Every surface that printed the number was
 * not: a project whose sections are complete but whose type has no artifact
 * matrix arrives as `readiness: 100, criticalBlockerCount: 1, status:
 * 'missing'`, and the Reporting canvas read "BX-204 is 100% ready".
 *
 * That is the refuse-to-accept trap stated as reassurance. A sponsor who
 * believes the dossier is complete because the tool said 100% files, and is
 * refused on a requirement the tool never claimed to have checked. The number
 * was right; the sentence around it was not.
 *
 * So: **the word "ready" is reserved for a figure with no outstanding critical
 * gap.** Everything else states the score and what is still open, and never
 * both in the same breath as "ready". This module is the only place that
 * decision is made, so it cannot be made differently on the next surface.
 *
 * @module shared/regulatory/readiness-statement
 */

/** The facts a readiness figure arrives with. All three come from the server. */
export interface ReadinessFacts {
  /** The evaluator's score, or null when no run has computed one. */
  readiness: number | null | undefined;
  /** Promotion-blocking findings from the same run. Absent is not zero. */
  criticalBlockerCount?: number | null;
  /** The run's own verdict: 'ready' | 'partial' | 'missing', or anything the
   *  caller's read-model carries. Only used to corroborate, never to override
   *  an outstanding critical gap. */
  status?: string | null;
}

/**
 * What may truthfully be claimed about a readiness figure.
 *
 * - `not-computed` — no run, or a run whose score could not be read. Say so;
 *   never render it as 0% or as an absence of findings.
 * - `qualified` — a score with outstanding critical gaps. The score is real and
 *   may be shown; "ready" may not be said.
 * - `clear` — a score with no outstanding critical gap, as far as this run
 *   assessed. "Ready" is permitted.
 * - `gaps-unknown` — a score arrived with no gap count at all. Neither
 *   reassurance nor alarm is supported: state the score and that the gap count
 *   was not read.
 */
export type ReadinessClaim =
  | { kind: 'not-computed' }
  | { kind: 'qualified'; percent: number; criticalGaps: number }
  | { kind: 'clear'; percent: number }
  | { kind: 'gaps-unknown'; percent: number };

/** Whether a value is a readiness percentage this module will speak about. */
function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Classify a readiness figure. The single decision point.
 *
 * `criticalBlockerCount` absent or non-numeric is `gaps-unknown`, not zero — a
 * read-model that does not carry the count has not told us there are none.
 */
export function readinessClaim(facts: ReadinessFacts): ReadinessClaim {
  if (!isPercent(facts.readiness)) return { kind: 'not-computed' };
  const percent = facts.readiness;
  const gaps = facts.criticalBlockerCount;
  if (typeof gaps !== 'number' || !Number.isFinite(gaps)) {
    return { kind: 'gaps-unknown', percent };
  }
  if (gaps > 0) return { kind: 'qualified', percent, criticalGaps: Math.round(gaps) };
  return { kind: 'clear', percent };
}

/** "1 critical gap" / "3 critical gaps". */
export function criticalGapCountLabel(count: number): string {
  const n = Math.round(count);
  return `${n} critical gap${n === 1 ? '' : 's'}`;
}

/**
 * The predicate to attach to a program's name, with no leading name and no
 * trailing period: `${programName} ${readinessPredicate(facts)}`.
 *
 * Returns, in order of the claim kinds:
 * - "has no computed submission readiness"
 * - "scores 72% on submission readiness, with 1 critical gap outstanding"
 * - "is 72% ready"
 * - "scores 72% on submission readiness; its critical-gap count was not read"
 */
export function readinessPredicate(facts: ReadinessFacts): string {
  const claim = readinessClaim(facts);
  switch (claim.kind) {
    case 'not-computed':
      return 'has no computed submission readiness';
    case 'qualified':
      return (
        `scores ${claim.percent}% on submission readiness, with ` +
        `${criticalGapCountLabel(claim.criticalGaps)} outstanding`
      );
    case 'clear':
      return `is ${claim.percent}% ready`;
    case 'gaps-unknown':
      return `scores ${claim.percent}% on submission readiness; its critical-gap count was not read`;
  }
}

/**
 * A complete sentence, ending in a period.
 *
 * `name` is the program as a reader calls it — never a raw database id.
 */
export function readinessSentence(name: string, facts: ReadinessFacts): string {
  return `${name} ${readinessPredicate(facts)}.`;
}

/**
 * The short qualifier for a place that already shows the percentage on its own
 * (a ring, a metric tile, a table cell), or null when the figure needs none.
 *
 * "1 critical gap outstanding" / "critical-gap count not read" / "not computed".
 */
export function readinessQualifier(facts: ReadinessFacts): string | null {
  const claim = readinessClaim(facts);
  switch (claim.kind) {
    case 'not-computed':
      return 'not computed';
    case 'qualified':
      return `${criticalGapCountLabel(claim.criticalGaps)} outstanding`;
    case 'clear':
      return null;
    case 'gaps-unknown':
      return 'critical-gap count not read';
  }
}

/**
 * Whether a surface may describe this figure with the word "ready", or any
 * other reassurance ("on track", "complete", "clear").
 *
 * Use this at the call site rather than re-deriving `criticalBlockerCount === 0`:
 * the point of this module is that the test lives in one place.
 */
export function mayCallReady(facts: ReadinessFacts): boolean {
  return readinessClaim(facts).kind === 'clear';
}
