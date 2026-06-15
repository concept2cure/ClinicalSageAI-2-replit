/**
 * Promotion Policy — where "no-touch" lives.
 *
 * The product owner configures this once (thresholds + which change kinds may
 * auto-promote). Every harvested KnowledgeCard is then routed by pure function,
 * not by a human reviewing each document:
 *
 *   - auto_promote  high-confidence, grounded, non-rule-changing updates
 *                   (e.g. an effective-date announcement, a press item) flow
 *                   straight into AnA's active knowledge.
 *   - review        anything that changes a rule, introduces a new standard,
 *                   withdraws one, or lands mid-confidence — held for a human.
 *   - quarantine    ungrounded or low-confidence output — never reaches clients.
 *
 * In a GxP / 21 CFR Part 11 product, true zero-touch on rule changes would be a
 * liability event. The defaults below deliberately keep new guidelines and
 * withdrawals in `review`, so the human gate guards exactly the changes that
 * carry regulatory weight — and nothing else.
 */

import type { CardChangeKind, KnowledgeCard } from './knowledge-card.js';

export type PromotionDecision = 'auto_promote' | 'review' | 'quarantine';

export interface PromotionPolicyConfig {
  /** At/above this confidence, an eligible card may auto-promote. */
  autoPromoteMinConfidence: number;
  /** At/above this confidence (but below auto), a card goes to review. */
  reviewMinConfidence: number;
  /** When true, an ungrounded card is quarantined regardless of confidence. */
  requireGrounded: boolean;
  /** Change kinds eligible for auto-promotion (the safe, non-rule-changing set). */
  autoPromoteChangeKinds: CardChangeKind[];
  /** Change kinds that ALWAYS require a human, regardless of confidence. */
  alwaysReviewChangeKinds: CardChangeKind[];
}

/** Conservative, regulated-domain-safe defaults. */
export const DEFAULT_POLICY: PromotionPolicyConfig = {
  autoPromoteMinConfidence: 0.85,
  reviewMinConfidence: 0.5,
  requireGrounded: true,
  autoPromoteChangeKinds: ['effective_date', 'press', 'revision'],
  alwaysReviewChangeKinds: ['new_guideline', 'withdrawal'],
};

function numFromEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : fallback;
}

function kindsFromEnv(name: string, fallback: CardChangeKind[]): CardChangeKind[] {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const valid: CardChangeKind[] = [
    'new_guideline',
    'revision',
    'draft_for_consultation',
    'effective_date',
    'withdrawal',
    'press',
    'other',
  ];
  const parsed = raw
    .split(',')
    .map(s => s.trim())
    .filter((s): s is CardChangeKind => (valid as string[]).includes(s));
  return parsed.length ? parsed : fallback;
}

/** Build the active policy from env overrides, falling back to safe defaults. */
export function policyFromEnv(): PromotionPolicyConfig {
  return {
    autoPromoteMinConfidence: numFromEnv('HORIZON_AUTOPROMOTE_MIN_CONFIDENCE', DEFAULT_POLICY.autoPromoteMinConfidence),
    reviewMinConfidence: numFromEnv('HORIZON_REVIEW_MIN_CONFIDENCE', DEFAULT_POLICY.reviewMinConfidence),
    requireGrounded: (process.env.HORIZON_REQUIRE_GROUNDED ?? 'true') !== 'false',
    autoPromoteChangeKinds: kindsFromEnv('HORIZON_AUTOPROMOTE_KINDS', DEFAULT_POLICY.autoPromoteChangeKinds),
    alwaysReviewChangeKinds: kindsFromEnv('HORIZON_ALWAYS_REVIEW_KINDS', DEFAULT_POLICY.alwaysReviewChangeKinds),
  };
}

export interface PolicyOutcome {
  decision: PromotionDecision;
  reason: string;
}

/**
 * Decide how a card is routed. Pure and deterministic — the same card + config
 * always yields the same outcome, which is what makes the audit trail defensible.
 */
export function decidePromotion(
  card: Pick<KnowledgeCard, 'confidence' | 'grounded' | 'changeKind'>,
  config: PromotionPolicyConfig = DEFAULT_POLICY,
): PolicyOutcome {
  if (config.requireGrounded && !card.grounded) {
    return { decision: 'quarantine', reason: 'Not grounded in source; held out of active knowledge.' };
  }
  if (config.alwaysReviewChangeKinds.includes(card.changeKind)) {
    return {
      decision: 'review',
      reason: `Change kind "${card.changeKind}" always requires human sign-off (rule-bearing).`,
    };
  }
  if (
    card.confidence >= config.autoPromoteMinConfidence &&
    config.autoPromoteChangeKinds.includes(card.changeKind)
  ) {
    return {
      decision: 'auto_promote',
      reason: `Confidence ${card.confidence.toFixed(2)} ≥ ${config.autoPromoteMinConfidence} and "${card.changeKind}" is auto-eligible.`,
    };
  }
  if (card.confidence >= config.reviewMinConfidence) {
    return { decision: 'review', reason: `Confidence ${card.confidence.toFixed(2)} below auto threshold; queued for review.` };
  }
  return { decision: 'quarantine', reason: `Confidence ${card.confidence.toFixed(2)} below review threshold ${config.reviewMinConfidence}.` };
}
