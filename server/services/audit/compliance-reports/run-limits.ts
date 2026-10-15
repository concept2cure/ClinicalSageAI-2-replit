/**
 * How often, and how many at once, an organisation runs compliance reports
 * (review round 1, security review).
 *
 * A report reads up to 50,000 rows per section on one snapshot, and the
 * integrity attestation walks the organisation's whole audit chain. Two limits:
 *
 *   - a rate limit per organisation and person, on the repository's limiter
 *     (express-rate-limit, as routes/cerv2-export-routes.ts limits its exports,
 *     keyed by organisation and verified user, never by a client claim);
 *   - one run at a time per organisation. The guard is per server process: on
 *     a deployment with several API tasks the bound is one run per
 *     organisation per task, with the rate limit as the second bound.
 *
 * Both refusals are 429 with the report envelope and say what to do.
 *
 * @module server/services/audit/compliance-reports/run-limits
 */
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { authedOrgId, usableOrgId } from '../../../utils/authedOrgId';

/** Runs per organisation and person per window. */
export const REPORT_RUN_RATE = Object.freeze({ windowMs: 60_000, limit: 12 });

/** The rate limiter for report runs; mount it after the reader gate, so only permitted requests count. */
export function createReportRunLimiter() {
  return rateLimit({
    windowMs: REPORT_RUN_RATE.windowMs,
    limit: REPORT_RUN_RATE.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const user = (req.user ?? {}) as { id?: unknown };
      const userId = (req as { userId?: unknown }).userId ?? user.id ?? 'unknown';
      return `compliance-report:${usableOrgId(authedOrgId(req)) ?? 'none'}:${String(userId)}`;
    },
    handler: (_req: Request, res: Response, _next: NextFunction) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'REPORT_RATE_LIMITED',
          message: `Reports can be run ${REPORT_RUN_RATE.limit} times a minute. Wait a minute and run it again.`,
        },
      });
    },
  });
}

/** One report run at a time per organisation, in this process. */
export class OrganisationRunGuard {
  private readonly running = new Set<number>();

  /** True when the organisation had no run in progress and now has this one. */
  tryAcquire(orgId: number): boolean {
    if (this.running.has(orgId)) return false;
    this.running.add(orgId);
    return true;
  }

  release(orgId: number): void {
    this.running.delete(orgId);
  }
}

export const REPORT_IN_PROGRESS_MESSAGE =
  'Another report is being produced for this organisation. Run this one when it has finished.';
