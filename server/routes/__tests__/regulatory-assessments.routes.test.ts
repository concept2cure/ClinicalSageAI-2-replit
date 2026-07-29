/**
 * Regulatory assessments router HTTP contract — persist + retrieve verdict
 * snapshots over the mounted router (supertest), db pointed at PGlite, faked
 * auth. Validates auth/RBAC, create/list/latest/get, type filtering, and
 * tenant isolation.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

import assessmentsRouter from '../regulatory-assessments.routes';

let harness: IndPgliteDb;
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
let app: express.Express;

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (currentUser) (req as any).user = currentUser; next(); });
  app.use('/api/regulatory-assessments', assessmentsRouter);
});
afterAll(async () => { await harness.close(); });

describe('auth + validation', () => {
  it('401 when unauthenticated', async () => {
    currentUser = null;
    const res = await request(app).get('/api/regulatory-assessments?submissionId=1');
    expect(res.status).toBe(401);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('400 on a malformed create', async () => {
    const res = await request(app).post('/api/regulatory-assessments').send({ submissionId: 1 });
    expect(res.status).toBe(400);
  });
});

describe('assessment lifecycle', () => {
  let id: string;

  it('POST → 201 records a snapshot (org from session)', async () => {
    const res = await request(app).post('/api/regulatory-assessments').send({
      submissionId: 5, assessmentType: 'strategy_brief', ready: true, summary: { marketCount: 2 }, result: { markets: [] },
    });
    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(1);
    expect(res.body.assessmentType).toBe('strategy_brief');
    expect(res.body.ready).toBe(true);
    id = res.body.id;
  });

  it('records a second, different-type snapshot', async () => {
    const res = await request(app).post('/api/regulatory-assessments').send({ submissionId: 5, assessmentType: 'tmf_completeness', ready: false, result: { zones: [] } });
    expect(res.status).toBe(201);
  });

  it('GET list → 200 newest first; ?type= filters', async () => {
    const all = await request(app).get('/api/regulatory-assessments?submissionId=5');
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThanOrEqual(2);
    const filtered = await request(app).get('/api/regulatory-assessments?submissionId=5&type=strategy_brief');
    expect(filtered.body.every((r: any) => r.assessmentType === 'strategy_brief')).toBe(true);
  });

  it('GET /latest → 200 the most recent of a type', async () => {
    const res = await request(app).get('/api/regulatory-assessments/latest?submissionId=5&type=strategy_brief');
    expect(res.status).toBe(200);
    expect(res.body.assessmentType).toBe('strategy_brief');
  });

  it('GET /latest → 404 for a type never recorded', async () => {
    const res = await request(app).get('/api/regulatory-assessments/latest?submissionId=5&type=nope');
    expect(res.status).toBe(404);
  });

  it('GET /:id → 200; unknown id → 404', async () => {
    expect((await request(app).get(`/api/regulatory-assessments/${id}`)).status).toBe(200);
    expect((await request(app).get('/api/regulatory-assessments/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('does not leak another org\'s assessments', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app).get('/api/regulatory-assessments?submissionId=5');
    expect(res.body.map((r: any) => r.id)).not.toContain(id);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});
