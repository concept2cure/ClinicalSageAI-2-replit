/**
 * Kernel decision records — the audit trail was org-optional.
 *
 * `GET /api/ana-ri/kernel/decisions` read the org off the request and appended
 * its tenant clause only `if (orgId)`. A request carrying no tenant therefore
 * listed the kernel DECISION RECORDS — the audit trail itself — for every
 * organization at once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const poolQuery = vi.fn();
vi.mock('../../db.js', () => ({ getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }) }));
vi.mock('../../services/kernel-observability.js', () => ({ getKernelMetrics: vi.fn() }));
vi.mock('../../services/kernel-beta-readiness.js', () => ({ getKernelBetaReadiness: vi.fn() }));

import { mountKernelRoutes } from '../ana-ri/kernel';

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
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('GET /api/ana-ri/kernel/decisions', () => {
  it('403s without organization context instead of listing every tenant’s decisions', async () => {
    const res = await request(appWith(null)).get('/api/ana-ri/kernel/decisions');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('scopes to the caller organization, unconditionally', async () => {
    await request(appWith(7)).get('/api/ana-ri/kernel/decisions');

    const [sql, params] = poolQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('organization_id = $1');
    expect(params[0]).toBe(7);
  });
});
