/**
 * Expected-monetary-value (EMV) / go–no-go decision engine for IVD programs.
 *
 * Turns a program's readiness into a probability of regulatory success and
 * combines it with market value, cost-to-complete, and time-to-market into an
 * expected (and discounted) value, a break-even probability, and a go/no-go
 * recommendation — plus a two-branch decision tree (submit now vs complete the
 * evidence first).
 *
 * Deterministic; no I/O. Financial inputs are caller-supplied; the engine does
 * not invent revenue.
 */

export type ReviewVerdict = 'likely_acceptance' | 'additional_information_likely' | 'not_substantially_complete';

/**
 * Map submission readiness + reviewer verdict to a probability of regulatory
 * success. Heuristic and transparent: readiness sets the base, the verdict
 * scales it, clamped to a defensible (0.02–0.97) band.
 */
export function readinessToApprovalProbability(readinessScore: number, verdict: ReviewVerdict): number {
  const base = Math.max(0, Math.min(1, readinessScore / 100));
  const mult = verdict === 'likely_acceptance' ? 1.0 : verdict === 'additional_information_likely' ? 0.85 : 0.55;
  return Math.round(Math.max(0.02, Math.min(0.97, base * mult)) * 1000) / 1000;
}

export interface EmvInput {
  /** Net value (e.g., risk-adjusted NPV of the approved product), USD. */
  marketValueUsd: number;
  /** Probability of regulatory success (0–1). */
  probabilityOfSuccess: number;
  /** Remaining cost to complete the evidence/submission, USD. */
  costToCompleteUsd: number;
  /** Years until the value is realized (for discounting). Default 0. */
  timeToMarketYears?: number;
  /** Annual discount rate (e.g., 0.12). Default 0.12. */
  discountRate?: number;
}

export interface EmvResult {
  expectedValueUsd: number;
  /** Discounted expected value (time-adjusted). */
  expectedNpvUsd: number;
  /** Probability at which EMV breaks even (cost / value). */
  breakevenProbability: number;
  recommendation: 'go' | 'no_go';
  rationale: string;
}

const round = (n: number): number => Math.round(n);

/** Compute expected (and discounted) monetary value and a go/no-go call. */
export function expectedMonetaryValue(input: EmvInput): EmvResult {
  const { marketValueUsd, costToCompleteUsd } = input;
  const p = Math.max(0, Math.min(1, input.probabilityOfSuccess));
  const years = Math.max(0, input.timeToMarketYears ?? 0);
  const rate = Math.max(0, input.discountRate ?? 0.12);
  if (marketValueUsd < 0 || costToCompleteUsd < 0) {
    throw new Error('marketValueUsd and costToCompleteUsd must be non-negative.');
  }

  const discounted = marketValueUsd / Math.pow(1 + rate, years);
  const expectedValueUsd = p * marketValueUsd - costToCompleteUsd;
  const expectedNpvUsd = p * discounted - costToCompleteUsd;
  const breakevenProbability = marketValueUsd > 0
    ? Math.round((costToCompleteUsd / marketValueUsd) * 1000) / 1000
    : 1;

  const go = expectedNpvUsd > 0;
  return {
    expectedValueUsd: round(expectedValueUsd),
    expectedNpvUsd: round(expectedNpvUsd),
    breakevenProbability,
    recommendation: go ? 'go' : 'no_go',
    rationale: go
      ? `Expected NPV is positive ($${round(expectedNpvUsd).toLocaleString()}); success probability ${(p * 100).toFixed(0)}% exceeds the ${(breakevenProbability * 100).toFixed(0)}% break-even.`
      : `Expected NPV is non-positive ($${round(expectedNpvUsd).toLocaleString()}); success probability ${(p * 100).toFixed(0)}% is below the ${(breakevenProbability * 100).toFixed(0)}% break-even.`,
  };
}

export interface InvestmentBranchInput {
  marketValueUsd: number;
  discountRate?: number;
  /** "Submit now" branch. */
  now: { readinessScore: number; verdict: ReviewVerdict; costToCompleteUsd?: number; timeToMarketYears?: number };
  /** "Complete the evidence first" branch. */
  afterEvidence: { readinessScore: number; verdict: ReviewVerdict; costToCompleteUsd: number; timeToMarketYears?: number };
}

export interface InvestmentBranchResult {
  submitNow: EmvResult & { probabilityOfSuccess: number };
  completeEvidence: EmvResult & { probabilityOfSuccess: number };
  recommendedBranch: 'submit_now' | 'complete_evidence' | 'no_go';
  upliftNpvUsd: number;
}

/**
 * Two-branch decision tree: is it worth completing more evidence (higher success
 * probability, more cost/time) before submitting, or submit now?
 */
export function compareInvestmentBranches(input: InvestmentBranchInput): InvestmentBranchResult {
  const pNow = readinessToApprovalProbability(input.now.readinessScore, input.now.verdict);
  const pAfter = readinessToApprovalProbability(input.afterEvidence.readinessScore, input.afterEvidence.verdict);

  const submitNow = {
    ...expectedMonetaryValue({
      marketValueUsd: input.marketValueUsd,
      probabilityOfSuccess: pNow,
      costToCompleteUsd: input.now.costToCompleteUsd ?? 0,
      timeToMarketYears: input.now.timeToMarketYears,
      discountRate: input.discountRate,
    }),
    probabilityOfSuccess: pNow,
  };
  const completeEvidence = {
    ...expectedMonetaryValue({
      marketValueUsd: input.marketValueUsd,
      probabilityOfSuccess: pAfter,
      costToCompleteUsd: input.afterEvidence.costToCompleteUsd,
      timeToMarketYears: input.afterEvidence.timeToMarketYears,
      discountRate: input.discountRate,
    }),
    probabilityOfSuccess: pAfter,
  };

  const upliftNpvUsd = completeEvidence.expectedNpvUsd - submitNow.expectedNpvUsd;
  let recommendedBranch: InvestmentBranchResult['recommendedBranch'];
  if (submitNow.expectedNpvUsd <= 0 && completeEvidence.expectedNpvUsd <= 0) recommendedBranch = 'no_go';
  else recommendedBranch = completeEvidence.expectedNpvUsd >= submitNow.expectedNpvUsd ? 'complete_evidence' : 'submit_now';

  return { submitNow, completeEvidence, recommendedBranch, upliftNpvUsd: round(upliftNpvUsd) };
}
