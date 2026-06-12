/**
 * IND master-data router HTTP contract — sponsor/agent/investigator CRUD over
 * the mounted router (supertest), db pointed at in-process PGlite, faked auth.
 * Validates auth/RBAC, the CRUD lifecycle, tenant isolation, and 404s.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));

import masterDataRouter from '../ind-master-data.routes';

let harness: IndPgliteDb;
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (currentUser) (req as any).user = currentUser;
    next();
  });
  app.use('/api/ind-master-data', masterDataRouter);
  return app;
}
let app: express.Express;

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
  app = makeApp();
});
afterAll(async () => {
  await harness.close();
});

describe('auth + RBAC', () => {
  it('401 when unauthenticated', async () => {
    currentUser = null;
    const res = await request(app).get('/api/ind-master-data/sponsors');
    expect(res.status).toBe(401);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('403 with the wrong role', async () => {
    currentUser = { id: 9, organizationId: 1, roles: ['viewer'] };
    const res = await request(app).get('/api/ind-master-data/sponsors');
    expect(res.status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});

describe('sponsor CRUD lifecycle', () => {
  let sponsorId: string;

  it('POST /sponsors → 201', async () => {
    const res = await request(app).post('/api/ind-master-data/sponsors').send({ name: 'Acme Therapeutics', contactEmail: 'ra@acme.example' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme Therapeutics');
    expect(res.body.organizationId).toBe(1);
    sponsorId = res.body.id;
  });

  it('GET /sponsors → 200 includes the created sponsor', async () => {
    const res = await request(app).get('/api/ind-master-data/sponsors');
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.id)).toContain(sponsorId);
  });

  it('GET /sponsors/:id → 200', async () => {
    const res = await request(app).get(`/api/ind-master-data/sponsors/${sponsorId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Therapeutics');
  });

  it('PATCH /sponsors/:id → 200 updates', async () => {
    const res = await request(app).patch(`/api/ind-master-data/sponsors/${sponsorId}`).send({ city: 'Boston' });
    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Boston');
  });

  it('GET /sponsors/:id → 404 for an unknown id', async () => {
    const res = await request(app).get('/api/ind-master-data/sponsors/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('cannot identity-spoof organizationId via the body', async () => {
    const res = await request(app).post('/api/ind-master-data/sponsors').send({ name: 'Spoof Co', organizationId: 999 });
    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(1); // from the session, not the body
  });
});

describe('tenant isolation', () => {
  it('does not return another org\'s records', async () => {
    const mine = await request(app).post('/api/ind-master-data/sponsors').send({ name: 'Org1 Sponsor' });
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const others = await request(app).get('/api/ind-master-data/sponsors');
    expect(others.body.map((s: any) => s.id)).not.toContain(mine.body.id);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});

describe('agents + investigators', () => {
  it('POST /agents → 201', async () => {
    const res = await request(app).post('/api/ind-master-data/agents').send({ name: 'US Agent LLC' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('US Agent LLC');
  });

  it('POST /investigators → 201', async () => {
    const res = await request(app).post('/api/ind-master-data/investigators').send({ firstName: 'Pat', lastName: 'Smith', credentials: 'MD' });
    expect(res.status).toBe(201);
    expect(res.body.firstName).toBe('Pat');
    expect(res.body.lastName).toBe('Smith');
  });
});
