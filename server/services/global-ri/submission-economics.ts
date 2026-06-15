/**
 * Submission economics — combined fee + review-timeline projection per market.
 *
 * Planning a marketing submission means knowing both what it will cost and how
 * long the review will take. This composes the deterministic fee estimator and
 * review-timeline projector into one "submission economics" view per market —
 * the budget + schedule a program lead needs for a go decision.
 *
 * Pure / deterministic — composes the underlying deterministic services.
 *
 * @module server/services/global-ri/submission-economics
 */

import { estimateFees, type FeeEstimate, type FeeMarket } from './regulatory-fee-estimator';
import { projectReviewTimeline, type ReviewTimeline, type Region as TimelineRegion } from './global-review-timeline';

/** Markets supported by BOTH the fee estimator and the timeline projector. */
export type EconomicsMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA';

export interface SubmissionEconomicsInput {
  market: EconomicsMarket;
  /** Review procedure code understood by the timeline projector (e.g. 'NDA_STANDARD'). */
  procedure: string;
  /** Clock-zero date for the review timeline. */
  startDate: Date | string;
  /** Fee inputs. */
  requiresClinicalData?: boolean;
  orphan?: boolean;
  smallBusiness?: boolean;
  programYears?: number;
}

export interface SubmissionEconomics {
  market: EconomicsMarket;
  fees: FeeEstimate;
  timeline: ReviewTimeline;
  summary: {
    totalFee: number;
    currency: string;
    targetDecisionDate: string;
    /** Review duration in calendar days (start → decision). */
    reviewDays: number;
    feesWaived: boolean;
  };
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Project the combined fee + review-timeline economics for a submission.
 * Pure / deterministic. Propagates the timeline projector's error (unknown
 * region/procedure) to the caller.
 */
export function projectSubmissionEconomics(input: SubmissionEconomicsInput): SubmissionEconomics {
  const fees = estimateFees({
    market: input.market as FeeMarket,
    requiresClinicalData: input.requiresClinicalData,
    orphan: input.orphan,
    smallBusiness: input.smallBusiness,
    programYears: input.programYears,
  });
  const timeline = projectReviewTimeline({
    region: input.market as TimelineRegion,
    procedure: input.procedure,
    startDate: input.startDate,
  });

  const feesWaived = fees.lineItems.length > 0 && fees.lineItems.every((li) => li.waived);

  return {
    market: input.market,
    fees,
    timeline,
    summary: {
      totalFee: fees.total,
      currency: fees.currency,
      targetDecisionDate: timeline.targetDecisionDate,
      reviewDays: daysBetween(timeline.startDate, timeline.targetDecisionDate),
      feesWaived,
    },
  };
}
