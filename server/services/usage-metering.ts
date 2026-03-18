/**
 * @fileoverview Usage Metering Service
 * @module server/services/usage-metering
 *
 * Tracks credit-based usage for premium features (deep research, CSR builder,
 * CTD builder). Enforces per-tier quotas and integrates with Stripe metered billing.
 */

import { pool } from '../db.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UsageSummary {
  featureId: string;
  creditsUsed: number;
  creditsRemaining: number;
  creditsLimit: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface QuotaCheck {
  allowed: boolean;
  remaining: number;
  limit: number;
  upgradeRequired?: string;
}

// Credit limits per tier per feature (per billing period)
const TIER_CREDITS: Record<string, Record<string, number>> = {
  free: {
    deep_research: 5,
    csr_builder: 0,
    ctd_builder: 0,
  },
  standard: {
    deep_research: 50,
    csr_builder: 10,
    ctd_builder: 0,
  },
  professional: {
    deep_research: 200,
    csr_builder: 50,
    ctd_builder: 25,
  },
  enterprise: {
    deep_research: -1, // unlimited
    csr_builder: -1,
    ctd_builder: -1,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record a usage event for a premium feature.
 */
export async function recordUsage(
  organizationId: number,
  userId: number,
  featureId: string,
  credits: number = 1,
  metadata?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO usage_records (organization_id, user_id, feature_id, credits_used, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [organizationId, userId, featureId, credits, metadata ? JSON.stringify(metadata) : null]
  );
}

/**
 * Check if an organization has quota remaining for a feature.
 */
export async function checkQuota(
  organizationId: number,
  featureId: string
): Promise<QuotaCheck> {
  // Get org tier
  const orgResult = await pool.query(
    `SELECT tier, next_billing_date FROM organizations WHERE id = $1`,
    [organizationId]
  );

  if (orgResult.rows.length === 0) {
    return { allowed: false, remaining: 0, limit: 0 };
  }

  const tier = orgResult.rows[0].tier || 'free';
  const tierCredits = TIER_CREDITS[tier] || TIER_CREDITS.free;
  const limit = tierCredits[featureId] ?? 0;

  // Unlimited
  if (limit === -1) {
    return { allowed: true, remaining: -1, limit: -1 };
  }

  // Feature not available at this tier
  if (limit === 0) {
    const minTier = Object.entries(TIER_CREDITS).find(
      ([, credits]) => (credits[featureId] ?? 0) > 0
    );
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      upgradeRequired: minTier?.[0] || 'standard',
    };
  }

  // Calculate usage in current period
  const periodStart = getBillingPeriodStart(orgResult.rows[0].next_billing_date);
  const usageResult = await pool.query(
    `SELECT COALESCE(SUM(credits_used), 0) as total
     FROM usage_records
     WHERE organization_id = $1 AND feature_id = $2 AND created_at >= $3`,
    [organizationId, featureId, periodStart]
  );

  const used = parseInt(usageResult.rows[0].total, 10) || 0;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: remaining > 0,
    remaining,
    limit,
  };
}

/**
 * Get usage summary for all metered features for an organization.
 */
export async function getUsageSummary(organizationId: number): Promise<UsageSummary[]> {
  const orgResult = await pool.query(
    `SELECT tier, next_billing_date FROM organizations WHERE id = $1`,
    [organizationId]
  );

  if (orgResult.rows.length === 0) return [];

  const tier = orgResult.rows[0].tier || 'free';
  const tierCredits = TIER_CREDITS[tier] || TIER_CREDITS.free;
  const periodStart = getBillingPeriodStart(orgResult.rows[0].next_billing_date);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const features = Object.keys(tierCredits);
  const summaries: UsageSummary[] = [];

  for (const featureId of features) {
    const limit = tierCredits[featureId];
    const usageResult = await pool.query(
      `SELECT COALESCE(SUM(credits_used), 0) as total
       FROM usage_records
       WHERE organization_id = $1 AND feature_id = $2 AND created_at >= $3`,
      [organizationId, featureId, periodStart]
    );

    const used = parseInt(usageResult.rows[0].total, 10) || 0;

    summaries.push({
      featureId,
      creditsUsed: used,
      creditsRemaining: limit === -1 ? -1 : Math.max(0, limit - used),
      creditsLimit: limit,
      periodStart,
      periodEnd,
    });
  }

  return summaries;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getBillingPeriodStart(nextBillingDate: Date | null): Date {
  if (nextBillingDate) {
    const start = new Date(nextBillingDate);
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  // Default: first of current month
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default {
  recordUsage,
  checkQuota,
  getUsageSummary,
};
