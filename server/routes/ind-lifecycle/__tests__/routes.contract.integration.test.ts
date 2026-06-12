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
let seededSubmissionId: number;

// Mutable "current user" so we can flip auth state per request.
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };

const reportableEvent = () => ({
  id: 'ae-1',
  organizationId: 'org-1',
  projectId: 'proj-1',
  eventType: 'SAE',
  patientId: 'subj-001',
  eventDescription: 'Acute hepatic failure.',
  onsetDate: '2026-01-01T00:00:00.000Z',
  reportDate: '2026-01-01T00:00:00.000Z',
  seriousnessCriteria: 'life_threatening',
  causality: 'probable',
  outcome: 'not_recovered',
  reporterType: 'investigator',
  countryOfOccurrence: 'US',
  regulatoryReportingDeadline: '2026-01-01T00:00:00.000Z',
  reportedToAuthorities: false,
  expeditedReportRequired: true,
  expectedness: 'unexpected',
  createdAt: '2026-01-01T00:00:00.000Z',
});

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
  seededSubmissionId = sub.id;
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

describe('DB-write + program surface (full HTTP flow)', () => {
  let filedSequenceId: number;

  it('POST /safety-report/file → 201 creates an amendment sequence', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/safety-report/file')
      .send({ submissionId: seededSubmissionId, sequenceNumber: '0003', event: reportableEvent() });
    expect(res.status).toBe(201);
    expect(res.body.sequence.type).toBe('amendment');
    expect(res.body.leaves.length).toBeGreaterThanOrEqual(1);
    filedSequenceId = res.body.sequence.id;
  });

  it('POST /safety-report/file → 400 without a 4-digit sequenceNumber', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/safety-report/file')
      .send({ submissionId: seededSubmissionId, sequenceNumber: '3', event: reportableEvent() });
    expect(res.status).toBe(400);
  });

  it('GET /sequence/:id/manifest → 200 with the filed leaf', async () => {
    const res = await request(app).get(`/api/ind-lifecycle/sequence/${filedSequenceId}/manifest`);
    expect(res.status).toBe(200);
    expect(res.body.totalLeaves).toBeGreaterThanOrEqual(1);
    expect(res.body.modules.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /sequence/:id/dispatch-gate → 200 with a verdict', async () => {
    const res = await request(app).post(`/api/ind-lifecycle/sequence/${filedSequenceId}/dispatch-gate`).send({});
    expect(res.status).toBe(200);
    expect(res.body.verdict).toHaveProperty('canDispatch');
  });

  it('POST /sequence/:id/dispatch-gate/snapshot → 201 then GET /snapshots → 200', async () => {
    const snap = await request(app).post(`/api/ind-lifecycle/sequence/${filedSequenceId}/dispatch-gate/snapshot`).send({});
    expect(snap.status).toBe(201);
    expect(snap.body.snapshot).toHaveProperty('id');

    const hist = await request(app).get(`/api/ind-lifecycle/sequence/${filedSequenceId}/snapshots`);
    expect(hist.status).toBe(200);
    expect(Array.isArray(hist.body)).toBe(true);
    expect(hist.body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /submission/:id/cockpit → 200 with per-sequence gates', async () => {
    const res = await request(app).post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cockpit`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dashboard');
    expect(Array.isArray(res.body.sequenceGates)).toBe(true);
    expect(res.body.summary).toHaveProperty('dispatchReady');
  });

  it('POST /submission/:id/dashboard → 200', async () => {
    const res = await request(app).post(`/api/ind-lifecycle/submission/${seededSubmissionId}/dashboard`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('headline');
  });

  it('POST /submission/:id/drift → 200 with a digest', async () => {
    const res = await request(app).post(`/api/ind-lifecycle/submission/${seededSubmissionId}/drift`).send({});
    expect(res.status).toBe(200);
    expect(res.body.summary).toHaveProperty('total');
  });
});
