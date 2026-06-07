/**
 * Tenant-isolation contract test — Intelligent Reports family.
 *
 * Regression guard for a cross-tenant IDOR on immutable regulated reports:
 * server/routes/intelligent-reports.ts took the org from req.body (/generate)
 * or the :organizationId path (/list) and fetched every /:reportId record with
 * no tenant check. Reads must scope to the JWT org, writes must force it, and
 * record-level handlers must 404 on a report owned by another org.
 *
 * The router relies on the global /api auth gate, so auth is injected here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, TARGET_ORG, engine, authState } = vi.hoisted(() => ({
  ORG_A: 7,
  TARGET_ORG: 999,
  engine: {
    listReports: vi.fn(async (_org?: any, _filters?: any) => [] as any[]),
    generateReport: vi.fn(async (_req?: any) => ({
      record: { id: 10 },
      verificationCode: 'v',
      provenanceEntries: [],
      attestations: [],
    })),
    getReport: vi.fn(async () => undefined as any),
    getReportProvenance: vi.fn(async () => []),
    getReportSealEvents: vi.fn(async () => []),
    getReportAttestations: vi.fn(async () => []),
    sealReport: vi.fn(async () => ({})),
  },
  authState: { orgId: 7 as number | null },
}));

vi.mock('../../services/intelligent-report-engine', () => ({
  intelligentReportEngine: engine,
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.orgId = ORG_A;
  engine.getReport.mockResolvedValue(undefined as any);
  const router = (await import('../../routes/intelligent-reports')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api/intelligent-reports', router);
});

describe('Tenant isolation — report reads', () => {
  it('GET /list ignores the path org and scopes to the JWT org', async () => {
    const res = await request(app).get(`/api/intelligent-reports/list/${TARGET_ORG}`);
    expect(res.status).toBe(200);
    expect(engine.listReports).toHaveBeenCalledTimes(1);
    expect(engine.listReports.mock.calls[0][0]).toBe(ORG_A);
  });

  it('GET /:reportId 404s on a report owned by another org', async () => {
    engine.getReport.mockResolvedValue({ id: 5, organizationId: TARGET_ORG } as any);
    const res = await request(app).get('/api/intelligent-reports/5');
    expect(res.status).toBe(404);
  });

  it('GET /:reportId returns a report owned by the caller', async () => {
    engine.getReport.mockResolvedValue({ id: 5, organizationId: ORG_A } as any);
    const res = await request(app).get('/api/intelligent-reports/5');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 5, organizationId: ORG_A });
  });

  it('GET /:reportId/provenance 404s across tenants without querying provenance', async () => {
    engine.getReport.mockResolvedValue({ id: 5, organizationId: TARGET_ORG } as any);
    await request(app).get('/api/intelligent-reports/5/provenance').expect(404);
    expect(engine.getReportProvenance).not.toHaveBeenCalled();
  });
});

describe('Tenant isolation — report writes', () => {
  it('POST /generate forces the JWT org over a spoofed body org', async () => {
    const res = await request(app)
      .post('/api/intelligent-reports/generate')
      .send({ organizationId: TARGET_ORG, domain: 'cmc', title: 'x' });
    expect(res.status).toBe(200);
    expect(engine.generateReport.mock.calls[0][0].organizationId).toBe(ORG_A);
  });

  it('POST /:reportId/seal 404s on a foreign report and never seals', async () => {
    engine.getReport.mockResolvedValue({ id: 5, organizationId: TARGET_ORG } as any);
    await request(app)
      .post('/api/intelligent-reports/5/seal')
      .send({ justification: 'x' })
      .expect(404);
    expect(engine.sealReport).not.toHaveBeenCalled();
  });
});

describe('Tenant isolation — report auth', () => {
  it('403s without an authenticated org', async () => {
    authState.orgId = null;
    await request(app).get(`/api/intelligent-reports/list/${ORG_A}`).expect(403);
    await request(app).get('/api/intelligent-reports/5').expect(403);
    await request(app)
      .post('/api/intelligent-reports/generate')
      .send({ domain: 'cmc', title: 'x' })
      .expect(403);
    expect(engine.listReports).not.toHaveBeenCalled();
    expect(engine.generateReport).not.toHaveBeenCalled();
  });
});
