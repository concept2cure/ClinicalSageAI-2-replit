/**
 * eTMF router HTTP contract — reference model + completeness assessment over the
 * mounted router (supertest), faked auth. The service is pure (no DB).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

import etmfRouter from '../etmf.routes';

let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    if (currentUser) (req as any).user = currentUser;
    next();
  });
  app.use('/api/etmf', etmfRouter);
});

describe('eTMF routes', () => {
  /* P-124 item 7 (2026-11-12): a viewer reads the trial master file, as it reads the Vault; it writes nothing. This case
     read "403 without the regulatory-author role" on a read. */
  it('a viewer reads; a session with neither role is refused; a viewer\'s write is refused', async () => {
    currentUser = { id: 9, organizationId: 1, roles: ['viewer'] };
    expect((await request(app).get('/api/etmf/reference-model')).status).toBe(200);
    expect((await request(app).post('/api/etmf/completeness').send({ providedArtifacts: [] })).status).toBe(403);
    expect((await request(app).post('/api/etmf/trials/S-1/artifacts').send({ artifactCode: 'protocol', reason: 'A reason long enough.' })).status).toBe(403);
    expect((await request(app).delete('/api/etmf/artifacts/1').send({ reason: 'A reason long enough.' })).status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['client_user'] };
    expect((await request(app).get('/api/etmf/reference-model')).status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('GET /reference-model → 200 with 11 zones', async () => {
    const res = await request(app).get('/api/etmf/reference-model');
    expect(res.status).toBe(200);
    expect(res.body.zones).toHaveLength(11);
  });

  it('POST /completeness → 200 not-ready for an empty TMF', async () => {
    const res = await request(app).post('/api/etmf/completeness').send({ providedArtifacts: [] });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.summary.totalMissing).toBeGreaterThan(0);
  });

  it('POST /completeness → 400 without providedArtifacts', async () => {
    const res = await request(app).post('/api/etmf/completeness').send({});
    expect(res.status).toBe(400);
  });
});
