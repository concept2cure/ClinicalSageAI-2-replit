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

/* REMOVED: evaluateDispatchGate / mergeDispatchGates.
 *
 * These were a client-side copy of the server's dispatch gate, labelled
 * "VERBATIM". They were not, and could not stay, verbatim:
 *
 *  - the server composes FOUR gates (structural, external, shadowPresence,
 *    releaseSignature — assess-dispatch-readiness.ts); the copy merged two, so a
 *    sequence with zero completed Shadow Review runs, or no §11.70 release
 *    signature, rendered "cleared to dispatch" while the server said otherwise;
 *  - the copy still did `Number.isFinite(x) ? x : 0`, the coercion the server
 *    deliberately inverted (dispatch-gate.ts) because it made "could not
 *    determine" read as "none".
 *
 * A recomputed verdict cannot track a gate set that grows. DispatchReadiness.tsx
 * now consumes the server's composed `gate` and treats its absence as
 * unanswered, not cleared. One canonical implementation, server-side. */


