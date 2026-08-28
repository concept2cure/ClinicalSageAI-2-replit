/**
 * eTMF artifact persistence HTTP contract — file/list/remove artifacts + trial
 * completeness from stored state, over the mounted router (PGlite, faked auth).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) } }));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

import etmfRouter from '../etmf.routes';

let harness: IndPgliteDb;
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
let app: express.Express;

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (currentUser) (req as any).user = currentUser; next(); });
  app.use('/api/etmf', etmfRouter);
});
afterAll(async () => { await harness.close(); });

describe('eTMF artifact persistence', () => {
  let artifactId: string;

  it('401 when unauthenticated', async () => {
    currentUser = null;
    const res = await request(app).get('/api/etmf/trials/T-1/artifacts');
    expect(res.status).toBe(401);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('POST file → 201 (org from session); 400 for an unknown artifact code', async () => {
    const ok = await request(app).post('/api/etmf/trials/T-1/artifacts').send({ artifactCode: 'protocol', documentRef: 'doc-1' });
    expect(ok.status).toBe(201);
    expect(ok.body.organizationId).toBe(1);
    expect(ok.body.zoneNumber).toBe(2); // protocol is Zone 2
    artifactId = ok.body.id;

    const bad = await request(app).post('/api/etmf/trials/T-1/artifacts').send({ artifactCode: 'not_a_real_artifact' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('UNKNOWN_ARTIFACT');
  });

  it('re-filing the same artifact is idempotent (updates, no duplicate)', async () => {
    await request(app).post('/api/etmf/trials/T-1/artifacts').send({ artifactCode: 'protocol', documentRef: 'doc-1-v2' });
    const list = await request(app).get('/api/etmf/trials/T-1/artifacts');
    expect(list.body.filter((a: any) => a.artifactCode === 'protocol')).toHaveLength(1);
  });

  it('GET completeness reflects stored artifacts (not ready until all essentials filed)', async () => {
    const res = await request(app).get('/api/etmf/trials/T-1/completeness');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.summary.totalMissing).toBeGreaterThan(0);
    // Zone 2 protocol is filed, so it should not be in zone 2's missing list.
    const zone2 = res.body.zones.find((z: any) => z.number === 2);
    expect(zone2.present).toContain('protocol');
  });

  it('does not leak another org\'s artifacts', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app).get('/api/etmf/trials/T-1/artifacts');
    expect(res.body.map((a: any) => a.id)).not.toContain(artifactId);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('DELETE → 204 then absent; unknown id → 404', async () => {
    const del = await request(app).delete(`/api/etmf/artifacts/${artifactId}`);
    expect(del.status).toBe(204);
    const list = await request(app).get('/api/etmf/trials/T-1/artifacts');
    expect(list.body.map((a: any) => a.id)).not.toContain(artifactId);
    expect((await request(app).delete('/api/etmf/artifacts/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});
