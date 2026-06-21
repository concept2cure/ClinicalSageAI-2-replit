/**
 * @fileoverview Weekly usage-limit enforcement middleware
 * @module server/middleware/enforceWeeklyLimit
 *
 * Express middleware factory that enforces a per-org weekly usage limit for a
 * metric (see services/weekly-usage-limits). Behavior mirrors Anthropic/Claude's
 * usage-limit + overage controls:
 *   - under limit            -> pass (state ok/warn), monitoring headers set
 *   - over limit, under cap  -> pass, `req.weeklyOverage` set so the caller can
 *                               meter billable overage; X-Weekly-State: overage
 *   - over the effective cap -> 429 with a structured body and Retry-After
 *
 * Enforcement is strictly OPT-IN: when no limit is configured for the org+metric
 * the check returns a 'disabled' decision and the request passes untouched.
 *
 * On an internal error (e.g. metering DB outage) the middleware FAILS OPEN by
 * default — a monitoring outage must not break the user action it guards. Pass
 * `failClosed: true` for surfaces where blocking on uncertainty is preferred.
 */

import type { Request, Response, NextFunction } from 'express';
import { getSecureOrgId } from '../utils/tenantContext.js';
import { checkWeeklyLimit, recordWeeklyAlerts, type WeeklyMetric, type LimitDecision } from '../services/weekly-usage-limits.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('enforceWeeklyLimit');

declare global {
  namespace Express {
    interface Request {
      /** Set when a request is permitted into billable overage (limit < usage <= cap). */
      weeklyOverage?: LimitDecision;
    }
  }
}

export interface EnforceWeeklyLimitOptions {
  /** How many units this request consumes. Default 1; ignored for the 'seats' metric. */
  getIncrement?: (req: Request) => number;
  /** Block (rather than pass) when the check itself errors. Default false (fail open). */
  failClosed?: boolean;
}

function setHeaders(res: Response, metric: WeeklyMetric, d: LimitDecision): void {
  res.setHeader('X-Weekly-Metric', metric);
  res.setHeader('X-Weekly-State', d.state);
  if (Number.isFinite(d.weeklyLimit)) res.setHeader('X-Weekly-Limit', String(d.weeklyLimit));
  res.setHeader('X-Weekly-Used', String(d.used));
  if (Number.isFinite(d.remaining)) res.setHeader('X-Weekly-Remaining', String(d.remaining));
  res.setHeader('X-Weekly-Reset', d.resetAt.toISOString());
}

export function enforceWeeklyLimit(metric: WeeklyMetric, options: EnforceWeeklyLimitOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = getSecureOrgId(req as any);
      const orgId = raw == null ? NaN : Number(raw);
      if (!Number.isFinite(orgId)) {
        // No tenant context — nothing org-scoped to enforce; let downstream auth decide.
        next();
        return;
      }

      const increment = metric === 'seats' ? 1 : Math.max(0, options.getIncrement?.(req) ?? 1);
      const decision = await checkWeeklyLimit(orgId, metric, increment);
      setHeaders(res, metric, decision);

      // Fire-and-forget threshold alerts (idempotent per window) on meaningful states.
      if (decision.state === 'warn' || decision.state === 'overage' || decision.state === 'blocked') {
        void recordWeeklyAlerts(orgId, decision);
      }

      if (!decision.allowed) {
        const retrySecs = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retrySecs));
        res.status(429).json({
          error: 'Weekly usage limit reached',
          code: 'WEEKLY_LIMIT_EXCEEDED',
          metric,
          used: decision.used,
          limit: decision.weeklyLimit,
          cap: decision.effectiveCap,
          resetAt: decision.resetAt.toISOString(),
          message:
            `This organization has reached its weekly ${metric} cap (${decision.used}/${decision.effectiveCap}). ` +
            `Raise the limit or wait until ${decision.resetAt.toISOString()}.`,
        });
        return;
      }

      if (decision.state === 'overage') {
        // Permitted into billable overage — expose to the handler for metering.
        req.weeklyOverage = decision;
      }
      next();
    } catch (err) {
      logger.error('weekly limit check failed', {
        metric,
        err: err instanceof Error ? err.message : String(err),
      });
      if (options.failClosed) {
        res.status(503).json({ error: 'Usage-limit check unavailable', code: 'WEEKLY_LIMIT_UNAVAILABLE', metric });
        return;
      }
      next(); // fail open
    }
  };
}

export default enforceWeeklyLimit;
