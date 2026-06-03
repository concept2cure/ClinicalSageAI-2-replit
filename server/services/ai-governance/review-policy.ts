/**
 * AI groundedness → human-review policy.
 *
 * Pure decision logic that binds a capability's governance contract to a
 * computed groundedness/confidence score and decides whether human review is
 * required before AI-generated content can be approved. Mirrors the buyer
 * control: "every generated claim carries a groundedness score; below
 * threshold forces human review before it can be approved."
 *
 * @module server/services/ai-governance/review-policy
 */

import { governanceFor, type CapabilityGovernance } from './risk-tiers';

export type ReviewGate =
  | 'auto_approvable' // no review required
  | 'review_required' // a human must review before approval
  | 'approval_required'; // explicit human approval (e-sign) required

export interface ReviewEvaluation {
  requiresHumanReview: boolean;
  gate: ReviewGate;
  reason: string;
  riskTier: CapabilityGovernance['riskTier'];
  humanOversight: CapabilityGovernance['humanOversight'];
  groundednessThreshold: number;
  groundednessScore: number | null;
  /** True when a groundedness score was actually supplied and assessed. */
  groundednessAssessed: boolean;
}

export interface ReviewEvaluationInput {
  governance: CapabilityGovernance;
  /** 0..1 groundedness/confidence score from the scoring engine. null = not assessed. */
  groundednessScore?: number | null;
}

/** Decide whether AI output requires human review, from its governance + groundedness. */
export function evaluateReviewRequirement(input: ReviewEvaluationInput): ReviewEvaluation {
  const { governance } = input;
  const score = normalizeScore(input.groundednessScore);
  const assessed = score !== null;
  const belowThreshold = assessed && score < governance.groundednessThreshold;

  let gate: ReviewGate = 'auto_approvable';
  let reason = 'Within governance thresholds; no additional review required.';

  if (governance.humanOversight === 'requires_approval') {
    gate = 'approval_required';
    reason = `Capability "${governance.capabilityKey}" (risk ${governance.riskTier}) requires explicit human approval.`;
  } else if (belowThreshold) {
    gate = 'review_required';
    reason =
      `Groundedness ${score!.toFixed(2)} is below the ${governance.groundednessThreshold.toFixed(2)} ` +
      `threshold for "${governance.capabilityKey}"; human review required before approval.`;
  } else if (governance.humanOversight === 'requires_review') {
    gate = 'review_required';
    reason = `Capability "${governance.capabilityKey}" (risk ${governance.riskTier}) requires human review before approval.`;
  }

  return {
    requiresHumanReview: gate !== 'auto_approvable',
    gate,
    reason,
    riskTier: governance.riskTier,
    humanOversight: governance.humanOversight,
    groundednessThreshold: governance.groundednessThreshold,
    groundednessScore: score,
    groundednessAssessed: assessed,
  };
}

/** Coerce a raw score to 0..1, accepting either 0..1 or 0..100 inputs. */
function normalizeScore(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? Number(raw) : (raw as number);
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const v = n > 1 ? n / 100 : n;
  return Math.max(0, Math.min(1, v));
}

// ── Endpoint gate (accept-ai-suggestion) ──────────────────────────────────────

export interface AcceptGateResult {
  /** True when the accept must be blocked pending human review. */
  blocked: boolean;
  gate: ReviewGate;
  reason: string;
  riskTier: CapabilityGovernance['riskTier'];
  groundednessThreshold: number;
  groundednessScore: number | null;
  intendedUse: string;
  /** Payload enriched with the governance verdict, for the immutable audit ledger. */
  enrichedPayload: Record<string, unknown>;
}

/**
 * Gate for the `accept-ai-suggestion` mutation. Enforces the score-based rule
 * (block when a supplied groundedness score is below the capability threshold
 * and the caller has not recorded a human review acknowledgement). When no
 * score is supplied the accept proceeds but the ledger records that
 * groundedness was not assessed, so audits can surface it.
 *
 * The payload may carry: `capabilityKey`, `category`, `groundednessScore`
 * (or `confidence`/`confidenceScore`), and `groundednessReviewAck: true`.
 */
export function evaluateAcceptGate(payload: Record<string, unknown> | undefined): AcceptGateResult {
  const p = payload ?? {};
  const capabilityKey = typeof p.capabilityKey === 'string' ? p.capabilityKey : undefined;
  const category = typeof p.category === 'string' ? p.category : undefined;
  const rawScore =
    p.groundednessScore ?? p.groundedness ?? p.confidence ?? p.confidenceScore ?? null;
  const reviewAck = p.groundednessReviewAck === true || p.humanReviewed === true;

  const governance = governanceFor(capabilityKey, category, {
    intendedUse: typeof p.intendedUse === 'string' ? p.intendedUse : undefined,
  });
  const evaln = evaluateReviewRequirement({
    governance,
    groundednessScore: rawScore as number | null,
  });

  // Non-breaking enforcement: block only when groundedness was assessed and
  // falls below threshold without an explicit human-review acknowledgement.
  const blocked =
    evaln.groundednessAssessed &&
    evaln.groundednessScore !== null &&
    evaln.groundednessScore < governance.groundednessThreshold &&
    !reviewAck;

  const enrichedPayload: Record<string, unknown> = {
    ...p,
    aiGovernance: {
      capabilityKey: governance.capabilityKey,
      category: governance.category,
      riskTier: governance.riskTier,
      humanOversight: governance.humanOversight,
      groundednessThreshold: governance.groundednessThreshold,
      groundednessScore: evaln.groundednessScore,
      groundednessAssessed: evaln.groundednessAssessed,
      gate: evaln.gate,
      requiresHumanReview: evaln.requiresHumanReview,
      reviewAcknowledged: reviewAck,
      blocked,
      evaluatedAt: new Date().toISOString(),
    },
  };

  return {
    blocked,
    gate: evaln.gate,
    reason: evaln.reason,
    riskTier: governance.riskTier,
    groundednessThreshold: governance.groundednessThreshold,
    groundednessScore: evaln.groundednessScore,
    intendedUse: governance.intendedUse,
    enrichedPayload,
  };
}
