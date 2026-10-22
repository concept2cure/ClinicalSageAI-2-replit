/** Actual durable business rows survive ancillary audit failures. The audit
 * boundary is controlled; the mounted routes and migration-shaped stores run. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import { expandRoleClaims } from '../../middleware/auth';

const state = vi.hoisted(() => ({ db: null as unknown, logAction: vi.fn() }));
vi.mock('../../db', () => ({ get db() { return state.db; } }));
vi.mock('../../services/auditService', () => ({ default: { logAction: state.logAction } }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
import tmfRouter from '../etmf.routes';
import assessmentsRouter from '../regulatory-assessments.routes';

const LOST = { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' };
const SENTINEL = 'SYNTHETIC secret database target and driver detail';
let harness: IndPgliteDb;
let app: express.Express;
let role = 'member';
let serial = 0;

beforeAll(async () => {
  harness = await createIndPgliteDb();
  state.db = harness.db;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 9, organizationId: 1, role, roles: expandRoleClaims(role, undefined) } as typeof req.user; next(); });
  app.use('/api/etmf', tmfRouter);
  app.use('/api/regulatory-assessments', assessmentsRouter);
});
beforeEach(() => { state.logAction.mockReset(); state.logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true }); role = 'member'; });
afterAll(async () => { await harness.close(); });

describe('TMF ancillary audit outcome transport', () => {
  const file = (trial: string, artifactCode = 'protocol') => request(app).post(`/api/etmf/trials/${trial}/artifacts`).send({ artifactCode, documentRef: 'external-archive-reference' });

  it.each(['lost', 'thrown', 'tamper-only'] as const)('preserves the actual filing and reports %s audit outcome', async mode => {
    if (mode === 'thrown') state.logAction.mockRejectedValueOnce(new Error(SENTINEL));
    else state.logAction.mockResolvedValueOnce(mode === 'lost'
      ? { persisted: false, chained: false, tamperProof: false, error: SENTINEL }
      : { persisted: true, chained: false, tamperProof: true });
    const trial = `audit-${++serial}`;
    const response = await file(trial);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ organizationId: 1, trialId: trial, artifactCode: 'protocol',
      meta: { auditTrail: mode === 'tamper-only' ? { persisted: true, chained: false } : LOST } });
    expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
    const stored = await request(app).get(`/api/etmf/trials/${trial}/artifacts`);
    expect(stored.body).toMatchObject([{ id: response.body.id, documentRef: 'external-archive-reference' }]);
    expect(stored.body[0]).not.toHaveProperty('auditTrail');
    // A retry is the same idempotent filing, not a second row or a fake rollback.
    const retried = await file(trial);
    expect(retried.body.id).toBe(response.body.id);
    expect(retried.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('carries removal failure on the 204 headers and the filing remains removed', async () => {
    const trial = `remove-${++serial}`;
    const created = await file(trial);
    state.logAction.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: SENTINEL });
    const removed = await request(app).delete(`/api/etmf/artifacts/${created.body.id}`);
    expect(removed.status).toBe(204);
    expect(removed.text).toBe('');
    expect(removed.headers['x-audit-row-persisted']).toBe('false');
    expect(removed.headers['x-audit-row-code']).toBe('AUDIT_ROW_NOT_PERSISTED');
    expect((await request(app).get(`/api/etmf/trials/${trial}/artifacts`)).body).toEqual([]);
    const calls = state.logAction.mock.calls.length;
    const retry = await request(app).delete(`/api/etmf/artifacts/${created.body.id}`);
    expect(retry.status).toBe(404);
    expect(retry.headers['x-audit-row-persisted']).toBeUndefined();
    expect(state.logAction.mock.calls).toHaveLength(calls);
  });

  it('combines only actual successful business writes in a partial bulk result', async () => {
    state.logAction.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false });
    const response = await request(app).post(`/api/etmf/trials/bulk-${++serial}/artifacts/bulk`).send({ artifacts: [
      { artifactCode: 'protocol' }, { artifactCode: 'invalid-artifact' }, { artifactCode: 'investigators_brochure' }, {},
    ] });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ filed: 2, total: 4, meta: { auditTrail: LOST }, results: [
      { artifactCode: 'protocol', ok: true, auditTrail: LOST },
      { artifactCode: 'invalid-artifact', ok: false, error: 'UNKNOWN_ARTIFACT' },
      { artifactCode: 'investigators_brochure', ok: true, auditTrail: { persisted: true, chained: true } },
      { artifactCode: '', ok: false },
    ] });
    expect(state.logAction).toHaveBeenCalledTimes(2);
  });

  it('does not fabricate an audit receipt for an all-invalid bulk request', async () => {
    const response = await request(app).post('/api/etmf/trials/invalid/artifacts/bulk').send({ artifacts: [{ artifactCode: 'unknown' }, {}] });
    expect(response.status).toBe(200);
    expect(response.body.filed).toBe(0);
    expect(response.body).not.toHaveProperty('meta');
    expect(state.logAction).not.toHaveBeenCalled();
  });

  it('does not attempt an audit when a filing is refused, or a viewer submits it', async () => {
    expect((await file('invalid', 'unknown')).status).toBe(400);
    role = 'viewer';
    expect((await file('viewer-refusal')).status).toBe(403);
    expect(state.logAction).not.toHaveBeenCalled();
  });
});

describe('assessment ancillary audit outcome transport', () => {
  it.each(['lost', 'thrown', 'healthy'] as const)('preserves the recorded snapshot and reports %s audit outcome', async mode => {
    if (mode === 'lost') state.logAction.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: SENTINEL });
    if (mode === 'thrown') state.logAction.mockRejectedValueOnce(new Error(SENTINEL));
    const submissionId = 1000 + ++serial;
    const response = await request(app).post('/api/regulatory-assessments').send({ submissionId, assessmentType: 'recorded-snapshot', ready: false, result: { source: 'synthetic contract proof' } });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ organizationId: 1, submissionId, ready: false,
      meta: { auditTrail: mode === 'healthy' ? { persisted: true, chained: true } : LOST } });
    expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
    const stored = await request(app).get(`/api/regulatory-assessments/${response.body.id}`);
    expect(stored.body).toMatchObject({ id: response.body.id, result: { source: 'synthetic contract proof' } });
    expect(stored.body).not.toHaveProperty('meta');
    expect(state.logAction).toHaveBeenCalledTimes(1);
  });

  it('does not audit malformed business input or viewer-denied creation', async () => {
    expect((await request(app).post('/api/regulatory-assessments').send({ submissionId: 1 })).status).toBe(400);
    role = 'viewer';
    expect((await request(app).post('/api/regulatory-assessments').send({ submissionId: 1, assessmentType: 'recorded', result: {} })).status).toBe(403);
    expect(state.logAction).not.toHaveBeenCalled();
  });
});
