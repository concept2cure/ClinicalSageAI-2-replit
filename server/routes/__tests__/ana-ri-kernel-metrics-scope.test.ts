/**
 * Kernel metrics — the second door beside the decision-audit one.
 *
 * `GET /api/ana-ri/kernel/decisions` was repaired (ana-ri-kernel-decisions-scope.test.ts)
 * with the sentence that names the rule: *a conditional tenant predicate is
 * not a predicate; it is a default.* Its sibling on the same router kept the
 * default. `/kernel/metrics` read the org off the request and passed
 * `organizationId: orgId ? Number(orgId) : null` into `getKernelMetrics`,
 * whose four statements each read
 * `WHERE ($1::int IS NULL OR organization_id = $1)` — so a request carrying no
 * resolvable tenant returned PLATFORM-WIDE aggregates: every organization's
 * kernel decision count and success rate, its policy outcomes and average
 * quality score, its goal-plan runs, its agent-protocol events. The test file
 * that proves the decisions fix mocks `getKernelMetrics` away, so nothing
 * covered this.
 *
 * The scope is in the route and in the SQL: the route refuses before the read,
 * and the organisation is required at the service boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const poolQuery = vi.fn();
vi.mock('../../db.js', () => ({
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
}));
vi.mock('../../services/kernel-beta-readiness.js', () => ({ getKernelBetaReadiness: vi.fn(async () => ({})) }));

import { mountKernelRoutes } from '../ana-ri/kernel';

/** `appWith(org)`: a request whose tenant is `org`, or none at all when null. */
function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).tenantId = org;
    next();
  });
  const router = Router();
  mountKernelRoutes(router);
  app.use('/api/ana-ri', router);
  return app;
}

beforeEach(() => {
  poolQuery.mockReset();
  // One row per aggregate, as each statement returns. The numbers are only
  // here to be recognisable if they ever reach a caller that asked for no
  // organisation — the proof is the refusal and the absent read.
  poolQuery.mockResolvedValue({
    rows: [{ total: 99, success_rate: 1, avg_latency_ms: 1, total_outcomes: 99, avg_quality_score: 1, total_runs: 99, completed_runs: 99, total_events: 99, decisions: 99 }],
  });
});

describe('GET /api/ana-ri/kernel/metrics', () => {
  it('refuses without organization context instead of aggregating every tenant, and reads nothing', async () => {
    const res = await request(appWith(null)).get('/api/ana-ri/kernel/metrics');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('scopes every statement to the caller organization, unconditionally', async () => {
    const res = await request(appWith(7)).get('/api/ana-ri/kernel/metrics');

    expect(res.status).toBe(200);
    expect(poolQuery.mock.calls.length).toBeGreaterThan(0);
    for (const [sql, params] of poolQuery.mock.calls as unknown as Array<[string, unknown[]]>) {
      expect(sql).toContain('organization_id = $1');
      expect(sql, 'a conditional tenant predicate is not a predicate').not.toMatch(/IS\s+NULL\s+OR\s+organization_id/i);
      expect(params[0]).toBe(7);
    }
  });
});

describe('getKernelMetrics requires an organization at the service boundary', () => {
  it('refuses rather than reading every tenant: no statement runs', async () => {
    const { getKernelMetrics } = await import('../../services/kernel-observability');
    for (const organizationId of [null, undefined, 0, -1, 1.5, Number.NaN]) {
      await expect(
        getKernelMetrics({ organizationId: organizationId as number | null | undefined }),
        String(organizationId),
      ).rejects.toThrow();
    }
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
