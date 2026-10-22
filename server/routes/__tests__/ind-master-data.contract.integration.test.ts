/**
 * IND master-data router HTTP contract — sponsor/agent/investigator CRUD over
 * the mounted router (supertest), db pointed at in-process PGlite, faked auth.
 * Validates auth/RBAC, the CRUD lifecycle, tenant isolation, and 404s.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, audit: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) }));
vi.mock('../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../services/auditService', () => ({ default: { logAction: holder.audit } }));

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
const REASON = 'Record reviewed applicant master data';
beforeEach(() => {
  currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  holder.audit.mockClear();
  holder.audit.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
});

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
  let revision: string;

  it('POST /sponsors → 201', async () => {
    const res = await request(app).post('/api/ind-master-data/sponsors').send({ name: 'Acme Therapeutics', contactEmail: 'ra@acme.example', reason: REASON });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme Therapeutics');
    expect(res.body.organizationId).toBe(1);
    sponsorId = res.body.id;
    revision = res.body.revision;
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
    const res = await request(app).patch(`/api/ind-master-data/sponsors/${sponsorId}`).send({ city: 'Boston', reason: REASON, expectedRevision: revision });
    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Boston');
  });

  it('GET /sponsors/:id → 404 for an unknown id', async () => {
    const res = await request(app).get('/api/ind-master-data/sponsors/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('cannot identity-spoof organizationId via the body', async () => {
    const res = await request(app).post('/api/ind-master-data/sponsors').send({ name: 'Spoof Co', organizationId: 999, reason: REASON });
    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(1); // from the session, not the body
  });
});

describe('tenant isolation', () => {
  it('does not return another org\'s records', async () => {
    const mine = await request(app).post('/api/ind-master-data/sponsors').send({ name: 'Org1 Sponsor', reason: REASON });
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


const create = (fields: Record<string, unknown> = {}) => request(app).post('/api/ind-master-data/sponsors')
  .send({ name: 'Recorded Applicant', reason: REASON, ...fields });

describe('sponsor governed input and exact receipt', () => {

  it('requires a stated reason before creating a sponsor', async () => {
    const res = await create({ reason: undefined });
    expect(res.status).toBe(400);
    expect(holder.audit).not.toHaveBeenCalled();
  });

  it.each(['short', 'x'.repeat(2001)])('refuses an out-of-range reason', async (reason) => {
    expect((await create({ reason })).status).toBe(400);
  });

  it('refuses unknown business fields but keeps the trusted identity strip', async () => {
    expect((await create({ inventedContact: 'shadow data' })).status).toBe(400);
    const res = await create({ id: 'foreign', organizationId: 999, createdBy: 777, updatedAt: '1999-01-01' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ organizationId: 1, createdBy: 9 });
    expect(res.body.id).not.toBe('foreign');
  });

  it.each([
    { name: null }, { name: '   ' }, { name: 'Applicant\u0001' }, { name: 'x'.repeat(201) },
    { duns: '12-345-6789' }, { duns: '12345678' }, { contactPhone: 'call tomorrow' },
    { contactEmail: 'not email' }, { contactName: 'Contact\u0001' }, { city: 22 },
  ])('refuses a malformed supplied field %j', async (fields) => {
    expect((await create(fields)).status).toBe(400);
    expect(holder.audit).not.toHaveBeenCalled();
  });

  it('saves incomplete drafts, trims values and returns the full raw row plus audit and revision', async () => {
    const res = await create({ name: '  Recorded Applicant  ', duns: ' ', contactName: null, contactPhone: '', contactEmail: ' ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Recorded Applicant', duns: null, contactName: null, contactPhone: null, contactEmail: null, auditTrail: { persisted: true, chained: true } });
    expect(res.body.revision).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect(res.body).toHaveProperty('addressLine1', null);
    expect(res.body).toHaveProperty('signatoryTitle', null);
    const listed = await request(app).get('/api/ind-master-data/sponsors');
    expect(listed.body.find((s: any) => s.id === res.body.id).revision).toBe(res.body.revision);
  });

  it('keeps all microseconds in reads and compares exactly on update', async () => {
    const created = await create();
    await harness.pglite.query("UPDATE ind_sponsors SET updated_at='2026-10-21 01:02:03.123456+00' WHERE id=$1", [created.body.id]);
    const read = await request(app).get(`/api/ind-master-data/sponsors/${created.body.id}`);
    expect(read.body.revision).toBe('2026-10-21T01:02:03.123456Z');
    const stale = await request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`)
      .send({ city: 'Wrong version', reason: REASON, expectedRevision: '2026-10-21T01:02:03.123000Z' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('SPONSOR_REVISION_CHANGED');
    const saved = await request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`)
      .send({ city: 'Boston', reason: REASON, expectedRevision: read.body.revision });
    expect(saved.status).toBe(200);
    expect(saved.body.revision).not.toBe(read.body.revision);
    expect(saved.body.city).toBe('Boston');
  });

});

describe('sponsor CAS, tenant and audit receipts', () => {
  it('requires a revision, a reason and a business change on PATCH', async () => {
    const created = await create();
    for (const body of [
      { city: 'Boston', reason: REASON },
      { city: 'Boston', expectedRevision: created.body.revision },
      { reason: REASON, expectedRevision: created.body.revision },
    ]) {
      expect((await request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`).send(body)).status).toBe(400);
    }
  });

  it('admits only one concurrent update using the same revision', async () => {
    const created = await create();
    const results = await Promise.all(['Boston', 'Cambridge'].map((city) =>
      request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`)
        .send({ city, expectedRevision: created.body.revision, reason: REASON })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const changed = results.find((r) => r.status === 200)!;
    const read = await request(app).get(`/api/ind-master-data/sponsors/${created.body.id}`);
    expect(read.body.city).toBe(changed.body.city);
    expect(read.body.revision).toBe(changed.body.revision);
  });

  it('does not leak another tenant through get or CAS update', async () => {
    const created = await create();
    currentUser = { id: 10, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`)
      .send({ city: 'Foreign', expectedRevision: created.body.revision, reason: REASON });
    expect(res.status).toBe(404);
    expect((await request(app).get(`/api/ind-master-data/sponsors/${created.body.id}`)).status).toBe(404);
  });

  it('records the reason and bounded before/after facts without governance fields in sponsor columns', async () => {
    const created = await create({ duns: '123456789' });
    const saved = await request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`)
      .send({ contactName: 'Regulatory Lead', expectedRevision: created.body.revision, reason: REASON });
    expect(saved.status).toBe(200);
    expect(holder.audit.mock.calls.at(-1)?.[0]).toMatchObject({
      action: 'IND_SPONSOR_UPDATED', reason: REASON,
      details: { before: { contactName: null }, after: { contactName: 'Regulatory Lead' } },
    });
    expect(saved.body).not.toHaveProperty('reason');
    expect(saved.body).not.toHaveProperty('expectedRevision');
  });

  it('bounds oversized legacy facts in the audit without inventing a shortened prior value', async () => {
    const created = await create();
    await harness.pglite.query('UPDATE ind_sponsors SET address_line1=$1 WHERE id=$2', ['x'.repeat(5000), created.body.id]);
    const saved = await request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`)
      .send({ city: 'Boston', expectedRevision: created.body.revision, reason: REASON });
    expect(saved.status).toBe(200);
    const prior = holder.audit.mock.calls.at(-1)?.[0].details.before.addressLine1;
    expect(prior).toMatchObject({ omitted: 'exceeds-audit-limit', characters: 5000 });
    expect(prior.sha256).toBe(createHash('sha256').update('x'.repeat(5000)).digest('hex'));
    expect(JSON.stringify(holder.audit.mock.calls.at(-1)?.[0].details)).not.toContain('x'.repeat(1001));
  });

  it('reports a committed sponsor mutation when the ancillary audit receipt fails', async () => {
    const created = await create();
    holder.audit.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false });
    const saved = await request(app).patch(`/api/ind-master-data/sponsors/${created.body.id}`)
      .send({ city: 'Boston', expectedRevision: created.body.revision, reason: REASON });
    expect(saved.status).toBe(200);
    expect(saved.body.city).toBe('Boston');
    expect(saved.body.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    const read = await request(app).get(`/api/ind-master-data/sponsors/${created.body.id}`);
    expect(read.body.city).toBe('Boston');
    expect(read.body.revision).toBe(saved.body.revision);
  });
});
