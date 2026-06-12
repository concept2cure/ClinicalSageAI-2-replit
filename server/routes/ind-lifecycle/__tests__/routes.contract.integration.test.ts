/**
 * IND lifecycle HTTP route contract — integration tests against the mounted
 * router (supertest), with `db` pointed at in-process PGlite and a faked auth
 * middleware. Validates the HTTP layer itself: auth gating (401), RBAC (403),
 * input validation (400), success shapes/status, and content-types — across the
 * route categories (pure compute, DB read, DB write/file, PDF, CSV).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../../services/auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));

import indLifecycleRouter from '../../ind-lifecycle.routes';
import { createSubmission } from '../../../services/submission-service/submission-service';
import { persistAnnualReport } from '../../../services/ind-lifecycle/ind-lifecycle-persistence';

let harness: IndPgliteDb;

// Mutable "current user" so we can flip auth state per request.
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    if (currentUser) (req as any).user = currentUser;
    next();
  });
  app.use('/api/ind-lifecycle', indLifecycleRouter);
  return app;
}
let app: express.Express;

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true });
  holder.db = harness.db;
  app = makeApp();
  // Seed: one IND submission with a filed annual sequence (org 1).
  const sub = await createSubmission(
    { title: 'C2C-001 IND', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda' },
    { organizationId: 1, userId: 9 },
  );
  await persistAnnualReport(sub.id, '0000', { organizationId: 1, userId: 9 }, 'cs');
});
afterAll(async () => {
  await harness.close();
});

describe('auth + RBAC gating', () => {
  it('401 when unauthenticated (no user)', async () => {
    currentUser = null;
    const res = await request(app).post('/api/ind-lifecycle/readiness').send({ filingType: 'initial' });
    expect(res.status).toBe(401);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('403 when the user lacks the regulatory-author role', async () => {
    currentUser = { id: 9, organizationId: 1, roles: ['viewer'] };
    const res = await request(app).post('/api/ind-lifecycle/readiness').send({ filingType: 'initial' });
    expect(res.status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('admin role is allowed through', async () => {
    currentUser = { id: 9, organizationId: 1, roles: ['admin'] };
    const res = await request(app).post('/api/ind-lifecycle/readiness').send({ filingType: 'initial' });
    expect(res.status).toBe(200);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});

describe('pure compute routes', () => {
  it('POST /readiness → 200 with a verdict', async () => {
    const res = await request(app).post('/api/ind-lifecycle/readiness').send({ filingType: 'initial', sectionStatus: {} });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ready');
    expect(res.body).toHaveProperty('blockers');
  });

  it('POST /readiness → 400 on a bad filingType', async () => {
    const res = await request(app).post('/api/ind-lifecycle/readiness').send({ filingType: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('POST /clock → 400 without receiptDate', async () => {
    const res = await request(app).post('/api/ind-lifecycle/clock').send({});
    expect(res.status).toBe(400);
  });

  it('POST /clock → 200 with receiptDate', async () => {
    const res = await request(app).post('/api/ind-lifecycle/clock').send({ receiptDate: '2026-01-01', asOf: '2026-02-15' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('safe_to_proceed');
  });
});

describe('DB-backed routes', () => {
  it('GET /portfolio → 200 listing the seeded IND submission', async () => {
    const res = await request(app).get('/api/ind-lifecycle/portfolio');
    expect(res.status).toBe(200);
    expect(res.body.totals.submissions).toBeGreaterThanOrEqual(1);
    expect(res.body.entries[0]).toHaveProperty('sequenceSummary');
  });

  it('GET /portfolio/drift/csv → 200 text/csv attachment', async () => {
    const res = await request(app).get('/api/ind-lifecycle/portfolio/drift/csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.split('\n')[0]).toContain('submission_id');
  });

  it('GET /submission/:id/overview → 400 on a non-numeric id', async () => {
    const res = await request(app).get('/api/ind-lifecycle/submission/abc/overview');
    expect(res.status).toBe(400);
  });

  it('GET /submission/:id/overview → 404 for a missing submission', async () => {
    const res = await request(app).get('/api/ind-lifecycle/submission/999999/overview');
    expect(res.status).toBe(404);
  });
});

describe('document routes', () => {
  it('POST /cover-letter/pdf → 200 application/pdf', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/cover-letter/pdf')
      .send({ sponsorName: 'Acme', drugName: 'C2C-001', submissionType: 'original' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('POST /cover-letter/pdf → 400 without required fields', async () => {
    const res = await request(app).post('/api/ind-lifecycle/cover-letter/pdf').send({});
    expect(res.status).toBe(400);
  });

  it('POST /envelope → 200 application/xml', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/envelope')
      .send({ applicationNumber: '123456', sequenceNumber: '0001', submissionType: 'amendment', sponsorName: 'Acme' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('<number>IND123456</number>');
  });
});
