/**
 * Deterministic dispatch gate (spec §6.8 / §7).
 *
 * The non-negotiable, PROVABLE pre-transmit rule: nothing dispatches while there
 * is an open error-severity validation finding or an unacknowledged Shadow
 * Review critical. The AI `dispatch-qc` task advises and predicts; this function
 * ENFORCES — the hard gate must never depend on a model verdict (spec §7: do not
 * generate where you can prove). The dispatch-qc route applies this as a floor
 * over the AI result, so `clearedToDispatch` can never be true when the gate
 * blocks.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/ectd/dispatch-gate
 */

export interface DispatchGateInput {
  /** Open error-severity validation findings. */
  validationErrors: number;
  /** Unacknowledged Shadow Review criticals. */
  unacknowledgedShadowCriticals: number;
}

export interface DispatchGateResult {
  /** True only when no hard blocker is present. */
  cleared: boolean;
  blockers: string[];
}

/** Evaluate the hard dispatch gate. Cleared only when every blocker is absent. */
export function evaluateDispatchGate(input: DispatchGateInput): DispatchGateResult {
  const blockers: string[] = [];

  /* A count that is not a finite number is not a count of zero — it is a count
     nobody has. NaN is what an arithmetic failure leaves behind, and undefined
     is what a read that did not happen leaves behind; both used to be coerced
     to 0, which CLEARS this gate. In the one function whose whole job is to be
     the provable pre-transmit rule, that made "we could not determine whether
     there are blockers" indistinguishable from "there are none", and sent the
     sequence to the agency.
     
     NOT reachable from any caller today, and each one was checked:
     AnaToolExecutor rejects a non-finite count before calling; the
     /dispatch-qc route parses with z.number().int().min(0); and
     assess-dispatch-readiness derives its counts from SQL count(*)::int. So
     this is the DIRECTION of a defensive default, not a live defect. It is
     worth inverting anyway: the repo's rule is fail closed, never fabricate,
     and the previous test asserted the open direction — which would have
     defended the landmine against anyone who tried to fix it later. */
  const unknown: string[] = [];
  if (!Number.isFinite(input.validationErrors)) {
    unknown.push('the count of open validation findings could not be determined');
  }
  if (!Number.isFinite(input.unacknowledgedShadowCriticals)) {
    unknown.push('the count of unacknowledged Shadow Review criticals could not be determined');
  }
  if (unknown.length > 0) {
    return {
      cleared: false,
      blockers: unknown.map(
        (what) => `Dispatch is blocked because ${what}. An undetermined count is not a count of zero.`,
      ),
    };
  }

  const validationErrors = input.validationErrors;
  const shadowCriticals = input.unacknowledgedShadowCriticals;

  if (validationErrors > 0) {
    blockers.push(`${validationErrors} open error-severity validation finding(s) must be resolved before dispatch.`);
  }
  if (shadowCriticals > 0) {
    blockers.push(`${shadowCriticals} unacknowledged Shadow Review critical(s) must be acknowledged or fixed before dispatch.`);
  }
  return { cleared: blockers.length === 0, blockers };
}

/**
 * Compose multiple gate verdicts into one (e.g. the structural+shadow gate with
 * the external-validation gate). Cleared only when EVERY gate is cleared; blockers
 * are the union, order-preserved for stable messaging. Pure.
 */
export function mergeDispatchGates(...gates: DispatchGateResult[]): DispatchGateResult {
  const blockers = gates.flatMap((g) => g.blockers);
  return { cleared: gates.every((g) => g.cleared), blockers };
}

export default { evaluateDispatchGate, mergeDispatchGates };
