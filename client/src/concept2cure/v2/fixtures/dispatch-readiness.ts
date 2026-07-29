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

/** Compose the gate from an assessment (structural + external). */
export function dispatchGateFor(a: DispatchReadinessAssessment): DispatchGate {
  const structural = evaluateDispatchGate({
    validationErrors: a.validationErrors,
    unacknowledgedShadowCriticals: a.unacknowledgedShadowCriticals,
  });
  const external: DispatchGate = {
    cleared: a.externalValidation.cleared,
    blockers: a.externalValidation.blockers || [],
  };
  return mergeDispatchGates(structural, external);
}

/** Sample assessment for the BX-204 BLA 761123 sequence 0000.
 *  Coherent with the Shadow Review sample: fda_filing lens found 0 criticals,
 *  shadow gate clear; BLOCKED by 2 open structural validation errors. */
export const SAMPLE_DISPATCH_ASSESSMENT: DispatchReadinessAssessment = {
  sequenceId: 4204,
  region: 'fda',
  sequenceStatus: 'validated',
  validationErrors: 2,
  unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1,
  shadowReviewMissing: false,
  externalValidation: {
    configured: false,
    ran: false,
    errorCount: 0,
    cleared: true,
    blockers: [],
  },
  readiness: {
    errors: 2,
    warnings: 3,
    infos: 5,
    findings: [
      {
        severity: 'error',
        sectionCode: '1.3.4',
        message:
          'Financial disclosure (Form 3454/3455) set is incomplete for the pivotal-study investigators.',
      },
      {
        severity: 'error',
        sectionCode: '2.3',
        message:
          'Quality Overall Summary leaf is present but its lifecycle operation is unset (must be new|replace).',
      },
      {
        severity: 'warning',
        sectionCode: '2.5',
        message:
          'Clinical Overview cross-references use section numbers rather than eCTD leaf hyperlinks.',
      },
      {
        severity: 'warning',
        sectionCode: '3.2.S.4',
        message:
          'Comparability acceptance criteria justification is thin for the higher-order structure assays.',
      },
      {
        severity: 'warning',
        sectionCode: '1.0',
        message: 'Cover letter does not name the review division.',
      },
      {
        severity: 'info',
        sectionCode: '2.7.2',
        message: 'ADA sampling schedule summarized; full steady-state coverage recommended.',
      },
    ],
  },
  leafCount: 42,
};
