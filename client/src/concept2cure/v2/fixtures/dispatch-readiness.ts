/**
 * Dispatch Readiness -- fixture data + deterministic gate logic.
 * Verbatim from concept2cure-v2 server/services/ectd/dispatch-gate.ts +
 * assess-dispatch-readiness.ts (kit dispatch-readiness-data.jsx).
 *
 * The non-negotiable, PROVABLE pre-transmit rule: nothing dispatches while
 * there is an open error-severity validation finding or an unacknowledged
 * Shadow Review critical. PURE + DETERMINISTIC -- no DB, no LLM.
 */

export interface DispatchGateInput {
  validationErrors: number;
  unacknowledgedShadowCriticals: number;
}

export interface DispatchGate {
  cleared: boolean;
  blockers: string[];
}

export interface ExternalValidation {
  configured: boolean;
  ran: boolean;
  errorCount: number;
  cleared: boolean;
  blockers: string[];
}

export interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  sectionCode: string;
  message: string;
}

export interface ReadinessSummary {
  errors: number;
  warnings: number;
  infos: number;
  findings: ReadinessFinding[];
}

export interface DispatchReadinessAssessment {
  sequenceId: number;
  region: string;
  sequenceStatus: string;
  validationErrors: number;
  unacknowledgedShadowCriticals: number;
  shadowReviewRunCount: number;
  shadowReviewMissing: boolean;
  externalValidation: ExternalValidation;
  readiness: ReadinessSummary;
  leafCount: number;
}

/* -- VERBATIM evaluateDispatchGate (server/services/ectd/dispatch-gate.ts) -- */
export function evaluateDispatchGate(input: DispatchGateInput): DispatchGate {
  const blockers: string[] = [];
  const ve = Number.isFinite(input.validationErrors) ? input.validationErrors : 0;
  const sc = Number.isFinite(input.unacknowledgedShadowCriticals)
    ? input.unacknowledgedShadowCriticals
    : 0;
  if (ve > 0)
    blockers.push(
      ve + ' open error-severity validation finding(s) must be resolved before dispatch.',
    );
  if (sc > 0)
    blockers.push(
      sc +
        ' unacknowledged Shadow Review critical(s) must be acknowledged or fixed before dispatch.',
    );
  return { cleared: blockers.length === 0, blockers };
}

/* VERBATIM mergeDispatchGates -- cleared only when EVERY gate is cleared. */
export function mergeDispatchGates(...gates: DispatchGate[]): DispatchGate {
  const blockers = gates.reduce<string[]>((a, g) => a.concat(g.blockers || []), []);
  return { cleared: gates.every((g) => g.cleared), blockers };
}


