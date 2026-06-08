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
  const validationErrors = Number.isFinite(input.validationErrors) ? input.validationErrors : 0;
  const shadowCriticals = Number.isFinite(input.unacknowledgedShadowCriticals) ? input.unacknowledgedShadowCriticals : 0;

  if (validationErrors > 0) {
    blockers.push(`${validationErrors} open error-severity validation finding(s) must be resolved before dispatch.`);
  }
  if (shadowCriticals > 0) {
    blockers.push(`${shadowCriticals} unacknowledged Shadow Review critical(s) must be acknowledged or fixed before dispatch.`);
  }
  return { cleared: blockers.length === 0, blockers };
}

export default { evaluateDispatchGate };
