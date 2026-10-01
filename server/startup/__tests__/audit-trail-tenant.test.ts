/**
 * The mutation audit trail writes each request's VERIFIED tenant onto its
 * tamper-proof row (DP-28, plan P1-27;
 * docs/evidence/D6/2026-10-01-tranche-4/P1-7-P1-27-residuals/).
 *
 * applyAuditTrailMiddleware writes on res 'finish', which is not guaranteed to
 * run inside the request's tenant scope — so the tenant is taken from the
 * context the auth boundary published on the request
 * (middleware/establishRequestTenantScope.ts), never from a header, and a
 * request that had no tenant is an explicit platform row (NULL).
 */
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { logSpy } = vi.hoisted(() => ({ logSpy: vi.fn() }));

vi.mock('../../lib/tamper-proof-audit', () => ({
  getTamperProofAuditLog: () => ({ log: logSpy }),
}));

import { applyAuditTrailMiddleware } from '../audit-trail';

const prior = process.env.AUDIT_TRAIL_ENABLED;
beforeAll(() => {
  process.env.AUDIT_TRAIL_ENABLED = 'true';
});
afterAll(() => {
  if (prior === undefined) delete process.env.AUDIT_TRAIL_ENABLED;
  else process.env.AUDIT_TRAIL_ENABLED = prior;
});
beforeEach(() => {
  logSpy.mockReset();
  logSpy.mockResolvedValue('row-id');
});

function app(tenantContext?: Record<string, unknown>) {
  const a = express();
  applyAuditTrailMiddleware(a, {} as any, () => {});
  a.use('/api', (req: any, _res, next) => {
    if (tenantContext) {
      req.user = { id: 7, organizationId: Number(tenantContext.organizationId) };
      req.tenantContext = { ...tenantContext };
    }
    next();
  });
  a.post('/api/projects/:id', (_req, res) => res.status(201).json({ ok: true }));
  return a;
}

async function contextOfLoggedRow(): Promise<Record<string, unknown>> {
  for (let i = 0; i < 50 && logSpy.mock.calls.length === 0; i++) {
    await new Promise(r => setTimeout(r, 10));
  }
  expect(logSpy).toHaveBeenCalledTimes(1);
  return logSpy.mock.calls[0][3] as Record<string, unknown>;
}

describe('audit trail rows carry the request’s verified tenant', () => {
  it('names the tenant the auth boundary resolved, not the one a header claims', async () => {
    await request(app({ organizationId: '11', organizationUuid: 'u-11' }))
      .post('/api/projects/5')
      .set('x-organization-id', '12')
      .set('x-tenant-id', '12')
      .send({});
    expect(await contextOfLoggedRow()).toMatchObject({ organizationId: 11 });
  });

  it('a request with no tenant is an explicit platform row', async () => {
    await request(app()).post('/api/projects/5').set('x-tenant-id', '12').send({});
    expect(await contextOfLoggedRow()).toHaveProperty('organizationId', null);
  });
});
