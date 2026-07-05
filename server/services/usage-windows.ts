/**
 * @fileoverview Plan usage windows — Anthropic-style session + weekly limits.
 * @module server/services/usage-windows
 *
 * Mirrors how Anthropic/Claude presents plan usage:
 *   - a rolling SESSION window (5 hours from the first metered call of the
 *     session) with "resets in Xh Ym",
 *   - WEEKLY windows with an "All models" bucket plus a premium-model bucket
 *     (here: the Opus family), each with "% used" and "resets at".
 *
 * Usage comes from api_usage_logs (written by the AI gateway via
 * services/usage-recorder.ts). Budgets come from a per-tier grid
 * (PLAN_USAGE_BUDGETS); when the org has a configured weekly `cost_cents`
 * limit (services/weekly-usage-limits.ts) that configured limit overrides
 * the plan's weekly all-models budget — an explicit org setting always wins
 * over a plan default.
 *
 * Window math is PURE (currentSessionWindow, percentUsed) so it is
 * unit-testable without a DB; the snapshot function is a thin aggregator.
 */

import { pool } from '../db.js';
import { currentWeekWindow, getLimit } from './weekly-usage-limits.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('usage-windows');

export const SESSION_WINDOW_HOURS = 5;

/** SQL LIKE pattern for the premium model family bucket. */
const PREMIUM_MODEL_PATTERN = '%opus%';
const PREMIUM_BUCKET_LABEL = 'Premium models (Opus)';

// ─────────────────────────────────────────────────────────────────────────────
// Per-tier budgets (cents)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanUsageBudget {
  /** Spend budget for one rolling session window. */
  sessionCostCents: number;
  /** Weekly spend budget across all models. */
  weeklyCostCents: number;
  /** Weekly spend budget for the premium (Opus-family) bucket. */
  weeklyPremiumCostCents: number;
}

/**
 * Default plan budgets, keyed by organizations.tier. Deliberately modeled on
 * Anthropic's shape (session cap well below the weekly cap; premium bucket
 * roughly half the all-models bucket). Values are platform defaults — an
 * org-configured weekly cost_cents limit overrides the weekly budget.
 */
export const PLAN_USAGE_BUDGETS: Record<string, PlanUsageBudget> = {
  free:         { sessionCostCents: 200,   weeklyCostCents: 500,    weeklyPremiumCostCents: 250 },
  standard:     { sessionCostCents: 500,   weeklyCostCents: 2_500,  weeklyPremiumCostCents: 1_250 },
  professional: { sessionCostCents: 1_500, weeklyCostCents: 10_000, weeklyPremiumCostCents: 5_000 },
  enterprise:   { sessionCostCents: 5_000, weeklyCostCents: 50_000, weeklyPremiumCostCents: 25_000 },
};

export const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  standard: 'Standard',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

// ─────────────────────────────────────────────────────────────────────────────
// PURE window math
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionWindow {
  /** First metered event of the active session, or null when idle/expired. */
  start: Date | null;
  /** When the session window resets (start + 5h), or null when idle/expired. */
  resetsAt: Date | null;
}

/**
 * PURE: derive the CURRENT session window from event timestamps using the
 * discrete-session model (how Anthropic's plan sessions work): the first
 * event starts a session lasting exactly windowHours; events inside the
 * window belong to it; the first event AFTER the window ends starts the
 * next session with its own windowHours. The current session is the last
 * one in the chain — and it only counts while `now` is inside its window
 * (an expired session with no newer event → idle, usage resets to 0).
 * Future timestamps are ignored.
 */
export function currentSessionWindow(
  eventTimes: Date[],
  now: Date = new Date(),
  windowHours: number = SESSION_WINDOW_HOURS,
): SessionWindow {
  const windowMs = windowHours * 3_600_000;
  const times = eventTimes
    .map(t => t.getTime())
    .filter(ms => Number.isFinite(ms) && ms <= now.getTime())
    .sort((a, b) => a - b);
  if (times.length === 0) return { start: null, resetsAt: null };

  let start = times[0];
  for (const ms of times) {
    if (ms >= start + windowMs) start = ms; // window over → this event opens the next session
  }
  const resetsAt = start + windowMs;
  if (now.getTime() >= resetsAt) return { start: null, resetsAt: null }; // last session expired
  return { start: new Date(start), resetsAt: new Date(resetsAt) };
}

/**
 * PURE: integer percent of budget used. Budget 0 with any usage reads 100
 * (over), not Infinity; the value is not clamped so callers can surface
 * >100% overage honestly.
 */
export function percentUsed(used: number, budget: number): number {
  if (!Number.isFinite(used) || used <= 0) return 0;
  if (!Number.isFinite(budget) || budget <= 0) return 100;
  return Math.round((used / budget) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot
// ─────────────────────────────────────────────────────────────────────────────

export interface UsageWindowBucket {
  id: string;
  label: string;
  usedCostCents: number;
  usedTokens: number;
  budgetCostCents: number;
  pctUsed: number;
  resetsAt: string | null;
}

export interface UsageLimitsSnapshot {
  plan: string;
  planLabel: string;
  session: UsageWindowBucket & { windowHours: number };
  weekly: UsageWindowBucket[];
  lastUpdated: string;
}

/**
 * The Anthropic-Usage-page-shaped snapshot for an org: session window +
 * weekly all-models and premium buckets, each with % used and reset time.
 */
/** How far back the session chain is reconstructed. A session older than
 *  this whose chain is still unbroken is treated as starting at the horizon
 *  — a documented approximation that bounds the query to ≤ 1440 rows. */
const SESSION_LOOKBACK_HOURS = 24;

export async function getUsageLimitsSnapshot(
  organizationId: number,
  now: Date = new Date(),
): Promise<UsageLimitsSnapshot> {
  // Tier, configured weekly limit, and the session's minute buckets are
  // mutually independent — fetch them in parallel.
  const [orgRes, configured, minuteRes] = await Promise.all([
    pool.query<{ tier: string | null }>(
      `SELECT tier FROM organizations WHERE id = $1`,
      [organizationId],
    ),
    getLimit(organizationId, 'cost_cents').catch(() => null),
    // Per-minute buckets over the look-back horizon: enough resolution to
    // chain discrete sessions, bounded regardless of traffic volume.
    pool.query<{ minute: Date; cost: string; tokens: string }>(
      `SELECT date_trunc('minute', created_at) AS minute,
              COALESCE(SUM(cost_cents), 0) AS cost,
              COALESCE(SUM(tokens_used), 0) AS tokens
         FROM api_usage_logs
        WHERE organization_id = $1
          AND created_at >= $2
        GROUP BY 1
        ORDER BY 1`,
      [organizationId, new Date(now.getTime() - SESSION_LOOKBACK_HOURS * 3_600_000)],
    ),
  ]);

  const tier = orgRes.rows[0]?.tier && PLAN_USAGE_BUDGETS[orgRes.rows[0].tier]
    ? (orgRes.rows[0].tier as string)
    : 'standard';
  const budgets = PLAN_USAGE_BUDGETS[tier];
  const weeklyBudget = configured?.enabled && configured.weeklyLimit > 0
    ? configured.weeklyLimit
    : budgets.weeklyCostCents;
  const weekStartDow = configured?.weekStartDow ?? 1;

  // Discrete session: chain minute buckets into sessions; only usage inside
  // the CURRENT (unexpired) session window counts — at resetsAt the meter
  // honestly returns to 0 until the next call starts a new session.
  const buckets = minuteRes.rows.map(r => ({
    at: new Date(r.minute),
    cost: Number(r.cost),
    tokens: Number(r.tokens),
  }));
  const session = currentSessionWindow(buckets.map(b => b.at), now);
  let sessionUsed = 0;
  let sessionTokens = 0;
  if (session.start && session.resetsAt) {
    for (const b of buckets) {
      if (b.at >= session.start && b.at < session.resetsAt) {
        sessionUsed += b.cost;
        sessionTokens += b.tokens;
      }
    }
  }

  // Weekly: all-models + premium bucket in one pass over the current window.
  const { start: weekStart, end: weekEnd } = currentWeekWindow(weekStartDow, now);
  const weeklyRes = await pool.query<{
    cost: string;
    tokens: string;
    premium_cost: string;
    premium_tokens: string;
  }>(
    `SELECT COALESCE(SUM(cost_cents), 0) AS cost,
            COALESCE(SUM(tokens_used), 0) AS tokens,
            COALESCE(SUM(cost_cents)  FILTER (WHERE model ILIKE $3), 0) AS premium_cost,
            COALESCE(SUM(tokens_used) FILTER (WHERE model ILIKE $3), 0) AS premium_tokens
       FROM api_usage_logs
      WHERE organization_id = $1
        AND created_at >= $2`,
    [organizationId, weekStart, PREMIUM_MODEL_PATTERN],
  );
  const weeklyRow = weeklyRes.rows[0];
  const weeklyUsed = Number(weeklyRow?.cost ?? 0);
  const premiumUsed = Number(weeklyRow?.premium_cost ?? 0);

  return {
    plan: tier,
    planLabel: PLAN_LABELS[tier] ?? tier,
    session: {
      id: 'session',
      label: 'Current session',
      windowHours: SESSION_WINDOW_HOURS,
      usedCostCents: sessionUsed,
      usedTokens: sessionTokens,
      budgetCostCents: budgets.sessionCostCents,
      pctUsed: percentUsed(sessionUsed, budgets.sessionCostCents),
      resetsAt: session.resetsAt ? session.resetsAt.toISOString() : null,
    },
    weekly: [
      {
        id: 'all-models',
        label: 'All models',
        usedCostCents: weeklyUsed,
        usedTokens: Number(weeklyRow?.tokens ?? 0),
        budgetCostCents: weeklyBudget,
        pctUsed: percentUsed(weeklyUsed, weeklyBudget),
        resetsAt: weekEnd.toISOString(),
      },
      {
        id: 'premium-models',
        label: PREMIUM_BUCKET_LABEL,
        usedCostCents: premiumUsed,
        usedTokens: Number(weeklyRow?.premium_tokens ?? 0),
        budgetCostCents: budgets.weeklyPremiumCostCents,
        pctUsed: percentUsed(premiumUsed, budgets.weeklyPremiumCostCents),
        resetsAt: weekEnd.toISOString(),
      },
    ],
    lastUpdated: now.toISOString(),
  };
}

/** Per-model weekly usage rows for drill-down beneath the bucket bars. */
export async function getWeeklyUsageByModel(
  organizationId: number,
  now: Date = new Date(),
): Promise<Array<{ model: string; usedCostCents: number; usedTokens: number; requests: number }>> {
  try {
    const configured = await getLimit(organizationId, 'cost_cents').catch(() => null);
    const { start } = currentWeekWindow(configured?.weekStartDow ?? 1, now);
    const res = await pool.query<{
      model: string | null;
      cost: string;
      tokens: string;
      requests: string;
    }>(
      `SELECT model,
              COALESCE(SUM(cost_cents), 0) AS cost,
              COALESCE(SUM(tokens_used), 0) AS tokens,
              COALESCE(SUM(request_count), 0) AS requests
         FROM api_usage_logs
        WHERE organization_id = $1 AND created_at >= $2
        GROUP BY model
        ORDER BY SUM(cost_cents) DESC`,
      [organizationId, start],
    );
    return res.rows.map(r => ({
      model: r.model ?? 'unattributed',
      usedCostCents: Number(r.cost),
      usedTokens: Number(r.tokens),
      requests: Number(r.requests),
    }));
  } catch (err) {
    logger.error('getWeeklyUsageByModel failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
