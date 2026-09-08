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

// ── Release-signature gate (21 CFR Part 11 §11.70) ──────────────────────────

/**
 * The state of the release signature for the package about to be dispatched.
 *
 * `unsigned` and `undetermined` are deliberately DISTINCT. "No signature
 * exists" is a fact we established; "we could not find out" is not — and
 * collapsing the second into the first is the same class of bug the
 * non-finite-count branch above exists to prevent.
 */
export type ReleaseSignatureVerdict =
  /** An active, non-superseded signature verifies against the package. */
  | 'signed'
  /** No release signature has been applied. */
  | 'unsigned'
  /** Signing was started but no signature has been applied yet. */
  | 'awaiting'
  /** A signature exists but its integrity check FAILED (digest drift / bad seal). */
  | 'invalid'
  /** The signature was superseded or rolled back; no active one remains. */
  | 'revoked'
  /** The signature state could not be determined. Not the same as unsigned. */
  | 'undetermined';

export interface ReleaseSignatureGateInput {
  /**
   * Whether this submission type requires a release signature before transmit.
   * REQUIRED for the FDA/EMA-bound types that cross the §11.70 boundary.
   */
  required: boolean;
  verdict: ReleaseSignatureVerdict;
  /** Optional operator-facing detail from the resolver (e.g. which check failed). */
  detail?: string;
}

/**
 * Evaluate the release-signature dispatch gate.
 *
 * This is the transmit-time re-check the e-sig gate design reserves: the
 * orchestrator's `package.sign` step proves a signature was taken at build
 * time, but dispatch is a separate act that can happen later, from a different
 * code path, against a package that may have moved on. Nothing else in the
 * dispatch path looks at signatures at all.
 *
 * Two rules, and the second is the one that is easy to get wrong:
 *
 *   1. When a signature is REQUIRED, only `signed` clears. `unsigned`,
 *      `awaiting`, `revoked` and `undetermined` all block — an unsigned
 *      sequence is not signature-clean, it is unsigned, exactly as a
 *      never-Shadow-Reviewed sequence is not finding-clean but unassessed.
 *
 *   2. `invalid` blocks UNCONDITIONALLY, including when a signature is not
 *      required. A failed integrity check means a signature record exists and
 *      does not match its package — that is evidence of tampering, and
 *      "this submission type didn't need a signature anyway" is not a reason
 *      to transmit past it. Requiredness governs whether a signature must be
 *      PRESENT, never whether a broken one may be ignored.
 *
 * PURE: the caller resolves the verdict; this function only judges it.
 */
export function evaluateReleaseSignatureGate(
  input: ReleaseSignatureGateInput
): DispatchGateResult {
  const suffix = input.detail ? ` (${input.detail})` : '';

  // Rule 2 — an integrity failure blocks regardless of requiredness.
  if (input.verdict === 'invalid') {
    return {
      cleared: false,
      blockers: [
        `Dispatch is blocked because the release signature on record does not verify against the package` +
          `${suffix}. A signature that does not match its record is evidence of tampering and blocks ` +
          `dispatch whether or not this submission type requires one.`,
      ],
    };
  }

  if (!input.required) {
    return { cleared: true, blockers: [] };
  }

  switch (input.verdict) {
    case 'signed':
      return { cleared: true, blockers: [] };
    case 'unsigned':
      return {
        cleared: false,
        blockers: [
          `Dispatch is blocked because this submission type requires a 21 CFR Part 11 release ` +
            `signature and none has been applied${suffix}.`,
        ],
      };
    case 'awaiting':
      return {
        cleared: false,
        blockers: [
          `Dispatch is blocked because the release signature is still awaiting a signer${suffix}. ` +
            `Sign the release before dispatching.`,
        ],
      };
    case 'revoked':
      return {
        cleared: false,
        blockers: [
          `Dispatch is blocked because the release signature was superseded or rolled back${suffix}. ` +
            `Re-sign the release before dispatching.`,
        ],
      };
    case 'undetermined':
      return {
        cleared: false,
        blockers: [
          `Dispatch is blocked because the release-signature state could not be determined${suffix}. ` +
            `An undetermined signature state is not an absent requirement.`,
        ],
      };
  }
}

export default { evaluateDispatchGate, mergeDispatchGates, evaluateReleaseSignatureGate };
