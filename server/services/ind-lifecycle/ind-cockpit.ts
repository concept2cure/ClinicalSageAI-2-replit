/**
 * IND submission cockpit combiner.
 *
 * The single-call program view: the submission-level dashboard plus a
 * per-sequence dispatch-gate summary, with a roll-up of how many sequences are
 * dispatch-ready vs blocked. Pure / deterministic — the route does the loading
 * and per-sequence gate evaluation; this folds the results together.
 */

import type { IndDashboard } from './ind-dashboard';

export interface SequenceGateSummary {
  sequenceId: number;
  sequenceNumber: string;
  type: string;
  status: string;
  canDispatch: boolean;
  blockerCount: number;
  warningCount: number;
  /** Blocker codes (e.g. MISSING_CHECKSUMS) for a compact at-a-glance view. */
  blockerCodes: string[];
}

export interface IndCockpit {
  dashboard: IndDashboard;
  sequenceGates: SequenceGateSummary[];
  summary: {
    totalSequences: number;
    dispatchReady: number;
    blocked: number;
  };
}

/** Fold the dashboard + per-sequence gates into the cockpit with a roll-up. */
export function buildIndCockpit(input: {
  dashboard: IndDashboard;
  sequenceGates: SequenceGateSummary[];
}): IndCockpit {
  const dispatchReady = input.sequenceGates.filter((g) => g.canDispatch).length;
  return {
    dashboard: input.dashboard,
    sequenceGates: input.sequenceGates,
    summary: {
      totalSequences: input.sequenceGates.length,
      dispatchReady,
      blocked: input.sequenceGates.length - dispatchReady,
    },
  };
}
