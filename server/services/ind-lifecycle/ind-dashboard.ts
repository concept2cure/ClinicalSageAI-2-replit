/**
 * IND submission dashboard combiner.
 *
 * Folds the three independent lifecycle views — the eCTD sequence summary
 * (ind-submission-overview), the filing-readiness verdict (ind-readiness-service)
 * and the regulatory clock / hold state (ind-regulatory-clock) — into a single
 * dashboard with a top-line headline. Pure / deterministic: the caller supplies
 * the already-computed parts; the route loads them.
 */

import type { SequenceSummary } from './ind-submission-overview';
import type { IndReadinessReport } from './ind-readiness-service';
import type { ClockState } from './ind-regulatory-clock';

export interface IndDashboardHeadline {
  /** Filing readiness (null when no readiness input was supplied). */
  ready: boolean | null;
  /** Active clinical hold (null when no clock input was supplied). */
  onHold: boolean | null;
  /** May the investigation proceed now (30 days elapsed, no hold)? null if unknown. */
  safeToProceed: boolean | null;
  /** Sequences with a failed validation that need attention. */
  openValidationFailures: number;
  /** Count of distinct blocking conditions across readiness + clock + validation. */
  blockerCount: number;
}

export interface IndDashboard {
  sequenceSummary: SequenceSummary;
  readiness: IndReadinessReport | null;
  clock: ClockState | null;
  headline: IndDashboardHeadline;
}

export interface IndDashboardParts {
  sequenceSummary: SequenceSummary;
  readiness?: IndReadinessReport | null;
  clock?: ClockState | null;
}

/**
 * Combine the parts into a dashboard and derive a headline. `blockerCount`
 * aggregates readiness blockers, an active hold, and validation failures so a
 * single number signals "is anything in the way".
 */
export function buildIndDashboard(parts: IndDashboardParts): IndDashboard {
  const readiness = parts.readiness ?? null;
  const clock = parts.clock ?? null;
  const openValidationFailures = parts.sequenceSummary.validationFailures;

  const onHold = clock ? clock.onHold : null;
  const blockerCount =
    (readiness ? readiness.blockers.length : 0) +
    (onHold === true ? 1 : 0) +
    openValidationFailures;

  const headline: IndDashboardHeadline = {
    ready: readiness ? readiness.ready : null,
    onHold,
    safeToProceed: clock ? clock.safeToProceed : null,
    openValidationFailures,
    blockerCount,
  };

  return { sequenceSummary: parts.sequenceSummary, readiness, clock, headline };
}
