/**
 * Design-controls traceability semantics — 21 CFR 820.30 / ISO 13485 §7.3.
 *
 * ONE definition of "is this design input verified?", because there are two
 * consumers of the c2c_design_controls store and they disagreed:
 *
 *   client/src/concept2cure/v2/surfaces/DesignControls.tsx counted a row fully
 *   traced on `outputs.length && ver === 'pass' && val === 'pass'` — the
 *   recorded OUTCOME.
 *
 *   server/routes/mdx-engineering.ts labelled the same row `state: 'verified'`
 *   on `t.ver && t.val` — PRESENCE. `val` holds a status string, so the literal
 *   'pending' is truthy: a design input whose validation had not happened was
 *   reported as verified on a design history file traceability matrix, while
 *   the other surface, reading the identical row, reported it untraced.
 *
 * Presence is not outcome. A field that records "we have not validated this
 * yet" must never satisfy a verification obligation, so the predicate is
 * outcome-based and the pass value is named once, here.
 */

/** The only value of `ver` / `val` that discharges a 820.30 obligation. */
export const DESIGN_CONTROL_PASS = 'pass';

/** The verification/validation state of one design input. */
export type DesignControlTraceState = 'verified' | 'in-progress' | 'open';

/** Just the fields the traceability predicates read, so both the server row
 *  (snake_case, widened) and the client row can be adapted onto it. */
export interface DesignControlTraceFacts {
  ver: string | null;
  val: string | null;
  outputCount: number;
}

/** Verification AND validation both recorded as passed. Separate obligations
 *  under 820.30(f) and (g): one passing does not carry the other. */
export function isVerifiedAndValidated(f: DesignControlTraceFacts): boolean {
  return f.ver === DESIGN_CONTROL_PASS && f.val === DESIGN_CONTROL_PASS;
}

/**
 * Fully traced: a design output exists AND both activities passed. The output
 * leg is what makes it *traceability* rather than a pair of test results —
 * 820.30(c)→(d) requires the input to be realized in an output before
 * verification of that output means anything.
 */
export function isFullyTraced(f: DesignControlTraceFacts): boolean {
  return f.outputCount > 0 && isVerifiedAndValidated(f);
}

/**
 * The three-way state a traceability matrix renders per row.
 *
 * `in-progress` means an activity has been RECORDED (whatever its outcome) —
 * that is honest: something is underway. It is only `verified` when both
 * passed.
 */
export function designControlTraceState(f: DesignControlTraceFacts): DesignControlTraceState {
  if (isVerifiedAndValidated(f)) return 'verified';
  if (f.ver || f.val) return 'in-progress';
  return 'open';
}
