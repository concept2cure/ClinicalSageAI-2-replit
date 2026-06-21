/**
 * @fileoverview Weekly Usage Limits & Overage Caps
 * @module server/services/weekly-usage-limits
 *
 * Per-organization, per-metric WEEKLY usage limits with overage caps, modeled
 * after Anthropic/Claude's API usage-limit + overage controls. Complements the
 * existing MONTHLY credit quotas (usage-metering.ts) and budgets (billing).
 *
 * A limit meters one of five metrics over a rolling weekly window:
 *   - cost_cents : AI/API spend in cents      (SUM api_usage_logs.cost_cents)
 *   - requests   : metered API/tool calls     (SUM api_usage_logs.request_count)
 *   - tokens     : LLM tokens                  (SUM api_usage_logs.tokens_used)
 *   - documents  : documents/submissions       (SUM request_count over doc modules)
 *   - seats      : distinct active users/week  (COUNT DISTINCT api_usage_logs.user_id)
 *
 * Overage model: usage is ALLOWED past the weekly limit up to an effective cap,
 * then BLOCKED — the span between limit and cap is billable overage. The cap is
 * an absolute `overageHardCap` when set, else `floor(limit * (1 + capPct/100))`.
 * `capPct = 0` (and no hard cap) means a hard block exactly at the limit.
 *
 * The decision + window math live in PURE functions (evaluateLimit,
 * currentWeekWindow, validateLimitConfig) so they are unit-testable without a
 * DB; the DB/persistence wrappers are thin. Limit changes are governed: the
 * setter validates, persists who/why, and writes a 21 CFR Part 11 audit event.
 */

import { pool } from '../db.js';
import { logAuditEvent } from './audit/auditLogger.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('weekly-usage-limits');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export const WEEKLY_METRICS = ['cost_cents', 'requests', 'tokens', 'documents', 'seats'] as const;
export type WeeklyMetric = (typeof WEEKLY_METRICS)[number];

/** Modules whose request_count is counted toward the `documents` metric. */
const DOCUMENT_MODULES = ['510k', 'cer', 'ectd', 'cmc', 'documents', 'csr', 'ind', 'nda', 'bla'];

export interface WeeklyLimitConfig {
  metric: WeeklyMetric;
  weeklyLimit: number;
  /** Allow usage up to limit*(1+capPct/100) before blocking. 0 = hard block at limit. */
  overageCapPct: number;
  /** Absolute ceiling; overrides capPct when set. Must be >= weeklyLimit. */
  overageHardCap: number | null;
  /** Emit a 'warn' state at this % of the limit. */
  warnThresholdPct: number;
  /** Weekly reset day: 0=Sun..6=Sat. */
  weekStartDow: number;
  enabled: boolean;
}

export interface WeeklyLimitRow extends WeeklyLimitConfig {
  organizationId: number;
  updatedBy: number | null;
  reason: string | null;
  updatedAt: Date;
}

export type LimitState = 'ok' | 'warn' | 'overage' | 'blocked' | 'disabled';

export interface LimitDecision {
  metric: WeeklyMetric;
  state: LimitState;
  /** Whether the request that triggered this check should be permitted. */
  allowed: boolean;
  used: number;
  increment: number;
  weeklyLimit: number;
  /** The hard ceiling at which requests are blocked (limit + overage allowance). */
  effectiveCap: number;
  /** Headroom to the effective cap, after current usage. */
  remaining: number;
  /** Billable overage already accrued this window (usage above the limit). */
  overageUsed: number;
  /** Usage as a percentage of the weekly limit (0 when limit is 0). */
  pct: number;
  /** The configured warn threshold (% of limit) carried for alerting. */
  warnThresholdPct: number;
  /** When the current weekly window resets. */
  resetAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURE CORE — window math, decision, validation (no I/O; unit-tested directly)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the current weekly window [start, end) for a configurable reset day.
 * Boundaries are UTC midnight on the reset day; the window is exactly 7 days.
 */
export function currentWeekWindow(weekStartDow: number, now: Date = new Date()): { start: Date; end: Date } {
  const dow = ((weekStartDow % 7) + 7) % 7;
  // Midnight UTC today.
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const delta = (todayUtc.getUTCDay() - dow + 7) % 7; // days since the most recent reset day
  const start = new Date(todayUtc);
  start.setUTCDate(start.getUTCDate() - delta);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/** The effective hard ceiling: absolute cap when set, else limit grown by capPct. */
export function effectiveCap(weeklyLimit: number, overageCapPct: number, overageHardCap: number | null): number {
  if (overageHardCap != null) return Math.max(weeklyLimit, overageHardCap);
  return Math.floor(weeklyLimit * (1 + Math.max(0, overageCapPct) / 100));
}

/**
 * Decide whether an increment is permitted given current usage and a limit
 * config. Pure — the caller supplies `used` (already aggregated) and the window.
 */
export function evaluateLimit(args: {
  metric: WeeklyMetric;
  used: number;
  increment: number;
  config: Pick<WeeklyLimitConfig, 'weeklyLimit' | 'overageCapPct' | 'overageHardCap' | 'warnThresholdPct' | 'enabled'>;
  resetAt: Date;
}): LimitDecision {
  const { metric, used, increment, config, resetAt } = args;
  const cap = effectiveCap(config.weeklyLimit, config.overageCapPct, config.overageHardCap);
  const projected = used + increment;
  const overageUsed = Math.max(0, used - config.weeklyLimit);
  const pct = config.weeklyLimit > 0 ? (used / config.weeklyLimit) * 100 : (used > 0 ? Infinity : 0);
  const base = {
    metric,
    used,
    increment,
    weeklyLimit: config.weeklyLimit,
    effectiveCap: cap,
    remaining: Math.max(0, cap - used),
    overageUsed,
    pct,
    warnThresholdPct: config.warnThresholdPct,
    resetAt,
  };

  if (!config.enabled) {
    return { ...base, state: 'disabled', allowed: true };
  }
  if (projected > cap) {
    return { ...base, state: 'blocked', allowed: false };
  }
  if (projected > config.weeklyLimit) {
    return { ...base, state: 'overage', allowed: true };
  }
  if (config.weeklyLimit > 0 && projected >= config.weeklyLimit * (config.warnThresholdPct / 100)) {
    return { ...base, state: 'warn', allowed: true };
  }
  return { ...base, state: 'ok', allowed: true };
}

/** Validate a proposed limit config. Returns the list of human-readable errors (empty = valid). */
export function validateLimitConfig(input: Partial<WeeklyLimitConfig>): string[] {
  const errors: string[] = [];
  if (!input.metric || !WEEKLY_METRICS.includes(input.metric)) {
    errors.push(`metric must be one of: ${WEEKLY_METRICS.join(', ')}`);
  }
  if (typeof input.weeklyLimit !== 'number' || !Number.isFinite(input.weeklyLimit) || input.weeklyLimit < 0) {
    errors.push('weeklyLimit must be a non-negative number');
  }
  if (typeof input.overageCapPct !== 'number' || !Number.isFinite(input.overageCapPct) || input.overageCapPct < 0) {
    errors.push('overageCapPct must be a non-negative number');
  }
  if (input.overageHardCap != null) {
    if (typeof input.overageHardCap !== 'number' || !Number.isFinite(input.overageHardCap) || input.overageHardCap < 0) {
      errors.push('overageHardCap must be a non-negative number when set');
    } else if (typeof input.weeklyLimit === 'number' && input.overageHardCap < input.weeklyLimit) {
      errors.push('overageHardCap must be >= weeklyLimit');
    }
  }
  if (input.warnThresholdPct != null && (typeof input.warnThresholdPct !== 'number' || input.warnThresholdPct < 0 || input.warnThresholdPct > 100)) {
    errors.push('warnThresholdPct must be between 0 and 100');
  }
  if (input.weekStartDow != null && (!Number.isInteger(input.weekStartDow) || input.weekStartDow < 0 || input.weekStartDow > 6)) {
    errors.push('weekStartDow must be an integer 0..6 (0=Sunday)');
  }
  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB WRAPPERS (thin)
// ═══════════════════════════════════════════════════════════════════════════════

function rowToLimit(r: any): WeeklyLimitRow {
  return {
    organizationId: Number(r.organization_id),
    metric: r.metric,
    weeklyLimit: Number(r.weekly_limit),
    overageCapPct: Number(r.overage_cap_pct),
    overageHardCap: r.overage_hard_cap == null ? null : Number(r.overage_hard_cap),
    warnThresholdPct: Number(r.warn_threshold_pct),
    weekStartDow: Number(r.week_start_dow),
    enabled: r.enabled !== false,
    updatedBy: r.updated_by == null ? null : Number(r.updated_by),
    reason: r.reason ?? null,
    updatedAt: r.updated_at,
  };
}

/** Fetch the configured limit for an org+metric, or null if none. */
export async function getLimit(organizationId: number, metric: WeeklyMetric): Promise<WeeklyLimitRow | null> {
  const res = await pool.query(
    `SELECT * FROM weekly_usage_limits WHERE organization_id = $1 AND metric = $2`,
    [organizationId, metric],
  );
  return res.rows.length ? rowToLimit(res.rows[0]) : null;
}

/** All configured limits for an org. */
export async function listLimits(organizationId: number): Promise<WeeklyLimitRow[]> {
  const res = await pool.query(
    `SELECT * FROM weekly_usage_limits WHERE organization_id = $1 ORDER BY metric`,
    [organizationId],
  );
  return res.rows.map(rowToLimit);
}

/** Aggregate usage for a metric over [windowStart, now). */
export async function getWeeklyUsage(organizationId: number, metric: WeeklyMetric, windowStart: Date): Promise<number> {
  let expr: string;
  let extra = '';
  const params: unknown[] = [organizationId, windowStart];
  switch (metric) {
    case 'cost_cents': expr = 'COALESCE(SUM(cost_cents), 0)'; break;
    case 'requests':   expr = 'COALESCE(SUM(request_count), 0)'; break;
    case 'tokens':     expr = 'COALESCE(SUM(tokens_used), 0)'; break;
    case 'seats':      expr = 'COUNT(DISTINCT user_id)'; break;
    case 'documents':
      expr = 'COALESCE(SUM(request_count), 0)';
      extra = ' AND module = ANY($3)';
      params.push(DOCUMENT_MODULES);
      break;
    default: expr = '0';
  }
  const res = await pool.query(
    `SELECT ${expr} AS total FROM api_usage_logs
     WHERE organization_id = $1 AND created_at >= $2${extra}`,
    params,
  );
  return Number(res.rows[0]?.total ?? 0);
}

/**
 * Check whether `increment` units of `metric` may be consumed now. Fails OPEN
 * when no limit is configured for the metric (returns an allowed 'disabled'
 * decision) so enforcement is strictly opt-in per org.
 */
export async function checkWeeklyLimit(
  organizationId: number,
  metric: WeeklyMetric,
  increment = 1,
): Promise<LimitDecision> {
  const limit = await getLimit(organizationId, metric);
  if (!limit || !limit.enabled) {
    const { end } = currentWeekWindow(limit?.weekStartDow ?? 1);
    return {
      metric, state: 'disabled', allowed: true, used: 0, increment,
      weeklyLimit: limit?.weeklyLimit ?? 0, effectiveCap: Infinity, remaining: Infinity,
      overageUsed: 0, pct: 0, warnThresholdPct: limit?.warnThresholdPct ?? 80, resetAt: end,
    };
  }
  const { start, end } = currentWeekWindow(limit.weekStartDow);
  const used = await getWeeklyUsage(organizationId, metric, start);
  return evaluateLimit({ metric, used, increment, config: limit, resetAt: end });
}

/**
 * Create or update a weekly limit. GOVERNED: validates, persists who/why, and
 * writes a 21 CFR Part 11 audit event capturing the before/after values.
 * Throws on invalid config (caller maps to a 400).
 */
export async function setWeeklyLimit(
  organizationId: number,
  config: WeeklyLimitConfig,
  actor: { userId: number },
  reason: string,
): Promise<WeeklyLimitRow> {
  const errors = validateLimitConfig(config);
  if (errors.length) {
    const err = new Error(`Invalid weekly limit config: ${errors.join('; ')}`);
    (err as any).validation = errors;
    throw err;
  }
  if (!reason || !reason.trim()) {
    const err = new Error('A reason-for-change is required to set a weekly usage limit');
    (err as any).validation = ['reason is required'];
    throw err;
  }

  const previous = await getLimit(organizationId, config.metric);

  const res = await pool.query(
    `INSERT INTO weekly_usage_limits
       (organization_id, metric, weekly_limit, overage_cap_pct, overage_hard_cap,
        warn_threshold_pct, week_start_dow, enabled, updated_by, reason, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
     ON CONFLICT (organization_id, metric) DO UPDATE SET
       weekly_limit = EXCLUDED.weekly_limit,
       overage_cap_pct = EXCLUDED.overage_cap_pct,
       overage_hard_cap = EXCLUDED.overage_hard_cap,
       warn_threshold_pct = EXCLUDED.warn_threshold_pct,
       week_start_dow = EXCLUDED.week_start_dow,
       enabled = EXCLUDED.enabled,
       updated_by = EXCLUDED.updated_by,
       reason = EXCLUDED.reason,
       updated_at = NOW()
     RETURNING *`,
    [
      organizationId, config.metric, config.weeklyLimit, config.overageCapPct,
      config.overageHardCap, config.warnThresholdPct, config.weekStartDow,
      config.enabled, actor.userId, reason.trim(),
    ],
  );
  const saved = rowToLimit(res.rows[0]);

  // Governed-action audit trail (reason-for-change + before/after).
  try {
    await logAuditEvent({
      category: 'compliance',
      severity: 'info',
      action: previous ? 'weekly_usage_limit.update' : 'weekly_usage_limit.create',
      userId: String(actor.userId),
      organizationId: String(organizationId),
      resourceType: 'weekly_usage_limit',
      resourceId: config.metric,
      previousValue: previous ?? null,
      newValue: saved,
      metadata: { reason: reason.trim() },
      success: true,
    });
  } catch (e) {
    // Audit-trail outage must not break the governed action it records.
    logger.error('weekly_usage_limit audit write failed', { err: e instanceof Error ? e.message : String(e) });
  }

  return saved;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THRESHOLD ALERTS (usage monitoring)
// ═══════════════════════════════════════════════════════════════════════════════

export type WeeklyAlertKind = 'weekly_warning' | 'weekly_overage' | 'weekly_blocked';

export interface WeeklyAlert {
  kind: WeeklyAlertKind;
  /** Percent-of-limit threshold this alert represents (warn% / 100 / cap%). */
  threshold: number;
  message: string;
}

/**
 * PURE: which threshold alerts the current standing qualifies for. Escalating —
 * once usage reaches the cap, all three (warning/overage/blocked) qualify and
 * form a complete trail; the recorder dedups each to once-per-window. A decision
 * with increment 0 (a monitor snapshot) describes the standing precisely.
 */
export function alertsForDecision(d: LimitDecision): WeeklyAlert[] {
  if (!Number.isFinite(d.weeklyLimit) || d.weeklyLimit <= 0) return [];
  const alerts: WeeklyAlert[] = [];
  const warnAt = d.weeklyLimit * (d.warnThresholdPct / 100);
  if (d.used >= warnAt) {
    alerts.push({
      kind: 'weekly_warning',
      threshold: Math.round((warnAt / d.weeklyLimit) * 100),
      message: `Weekly ${d.metric} usage reached ${d.used} of ${d.weeklyLimit} (${Math.round(d.pct)}%).`,
    });
  }
  if (d.used >= d.weeklyLimit) {
    alerts.push({
      kind: 'weekly_overage',
      threshold: 100,
      message: `Weekly ${d.metric} limit (${d.weeklyLimit}) reached — now in billable overage up to ${d.effectiveCap}.`,
    });
  }
  if (d.used >= d.effectiveCap) {
    alerts.push({
      kind: 'weekly_blocked',
      threshold: d.weeklyLimit > 0 ? Math.round((d.effectiveCap / d.weeklyLimit) * 100) : 100,
      message: `Weekly ${d.metric} overage cap (${d.effectiveCap}) reached — further usage is blocked until reset.`,
    });
  }
  return alerts;
}

/**
 * Idempotently record the threshold alerts implied by a decision into
 * billing_alerts (dedup_key = metric:windowStart:kind). Returns the kinds newly
 * recorded this window. Best-effort: never throws into the caller.
 */
export async function recordWeeklyAlerts(
  organizationId: number,
  decision: LimitDecision,
): Promise<WeeklyAlertKind[]> {
  try {
    // Window start = resetAt - 7d (the decision already carries the window end).
    const windowStart = new Date(decision.resetAt);
    windowStart.setUTCDate(windowStart.getUTCDate() - 7);
    const alerts = alertsForDecision(decision);
    const recorded: WeeklyAlertKind[] = [];
    for (const a of alerts) {
      const dedupKey = `${decision.metric}:${windowStart.toISOString()}:${a.kind}`;
      const res = await pool.query(
        `INSERT INTO billing_alerts (organization_id, type, threshold, message, metadata, dedup_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          organizationId, a.kind, a.threshold, a.message,
          JSON.stringify({ metric: decision.metric, used: decision.used, limit: decision.weeklyLimit, cap: decision.effectiveCap, windowStart: windowStart.toISOString() }),
          dedupKey,
        ],
      );
      if (res.rows.length) recorded.push(a.kind);
    }
    return recorded;
  } catch (e) {
    logger.error('recordWeeklyAlerts failed', { err: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

/** A point-in-time snapshot of every configured limit for monitoring/dashboards. */
export async function getWeeklyMonitor(organizationId: number): Promise<LimitDecision[]> {
  const limits = await listLimits(organizationId);
  const out: LimitDecision[] = [];
  for (const limit of limits) {
    const { start, end } = currentWeekWindow(limit.weekStartDow);
    const used = await getWeeklyUsage(organizationId, limit.metric, start);
    // increment 0 → reports the current standing without projecting a new call.
    out.push(evaluateLimit({ metric: limit.metric, used, increment: 0, config: limit, resetAt: end }));
  }
  return out;
}
