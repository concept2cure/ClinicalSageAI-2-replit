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
// Contract tests exercise route logic, not rate limiting; pass-through the limiter
// so the volume of requests in this suite doesn't trip a 429.
vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

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

  it('POST /sequence/lifecycle-validate → 200 allows original first; blocks amendment-first', async () => {
    const ok = await request(app).post('/api/ind-lifecycle/sequence/lifecycle-validate').send({ existingSequenceTypes: [], proposedType: 'original' });
    expect(ok.status).toBe(200);
    expect(ok.body.allowed).toBe(true);
    const bad = await request(app).post('/api/ind-lifecycle/sequence/lifecycle-validate').send({ existingSequenceTypes: [], proposedType: 'amendment' });
    expect(bad.body.allowed).toBe(false);
    expect(bad.body.reasons.map((r: any) => r.code)).toContain('NO_ORIGINAL_FIRST');
  });

  it('POST /sequence/lifecycle-validate → 400 without required fields', async () => {
    const res = await request(app).post('/api/ind-lifecycle/sequence/lifecycle-validate').send({ proposedType: 'amendment' });
    expect(res.status).toBe(400);
  });

  it('POST /sequence/history-audit → 200 valid history vs flagged amendment-first', async () => {
    const ok = await request(app).post('/api/ind-lifecycle/sequence/history-audit').send({ sequenceTypes: ['original', 'amendment', 'annual'] });
    expect(ok.status).toBe(200);
    expect(ok.body.valid).toBe(true);
    const bad = await request(app).post('/api/ind-lifecycle/sequence/history-audit').send({ sequenceTypes: ['amendment', 'original'] });
    expect(bad.body.valid).toBe(false);
    expect(bad.body.violations[0].index).toBe(0);
  });

  it('POST /sequence/history-audit → 400 without sequenceTypes', async () => {
    const res = await request(app).post('/api/ind-lifecycle/sequence/history-audit').send({});
    expect(res.status).toBe(400);
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

  it('POST /safety-report/icsr → 200 E2B(R3) elements + completeness', async () => {
    const res = await request(app).post('/api/ind-lifecycle/safety-report/icsr').send({ event: reportableEvent() });
    expect(res.status).toBe(200);
    expect(res.body.icsr).toHaveProperty('caseAdmin');
    expect(res.body.icsr.narrative.id).toBe('H.1');
    expect(res.body).toHaveProperty('completeness');
    expect(Array.isArray(res.body.gaps)).toBe(true);
  });

  it('POST /safety-report/icsr?format=xml → 200 application/xml', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/safety-report/icsr?format=xml')
      .send({ event: reportableEvent() });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('standard="E2B(R3)"');
    expect(res.text).toContain('id="H.1"');
  });

  it('POST /safety-report/icsr → 400 without an event', async () => {
    const res = await request(app).post('/api/ind-lifecycle/safety-report/icsr').send({});
    expect(res.status).toBe(400);
  });

  it('POST /safety-report/icsr/message → 200 transmittable message + readiness', async () => {
    const res = await request(app).post('/api/ind-lifecycle/safety-report/icsr/message').send({
      event: reportableEvent(),
      gateway: 'FDA_FAERS',
      senderId: 'C2C',
      messageNumber: 'MSG-0001',
      icsr: { worldwideUniqueId: 'US-C2C-2026-000123', senderType: 'sponsor' },
    });
    expect(res.status).toBe(200);
    expect(res.body.gateway).toBe('FDA_FAERS');
    expect(res.body.receiverId).toBe('ZZFDA');
    expect(typeof res.body.transmitReady).toBe('boolean');
    expect(res.body.message).toContain('<ichicsrMessage');
  });

  it('POST /safety-report/icsr/message?format=xml → 200 application/xml', async () => {
    const res = await request(app).post('/api/ind-lifecycle/safety-report/icsr/message?format=xml').send({
      event: reportableEvent(), gateway: 'EMA_EUDRAVIGILANCE', senderId: 'C2C', messageNumber: 'MSG-0002',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('<ichicsrMessage');
  });

  it('POST /safety-report/icsr/message → 400 without gateway/senderId/messageNumber', async () => {
    const res = await request(app).post('/api/ind-lifecycle/safety-report/icsr/message').send({ event: reportableEvent() });
    expect(res.status).toBe(400);
  });

  it('POST /annual-report/line-listing → 200 with rows + tabulation', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/annual-report/line-listing')
      .send({ events: [reportableEvent()], periodStart: '2026-01-01', periodEnd: '2026-12-31' });
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(1);
    expect(res.body.tabulation.totalSerious).toBe(1);
  });

  it('POST /annual-report/line-listing?format=csv → 200 text/csv attachment', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/annual-report/line-listing?format=csv')
      .send({ events: [reportableEvent()], periodStart: '2026-01-01', periodEnd: '2026-12-31' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.split('\n')[0]).toContain('adverse_event_id');
  });

  it('POST /annual-report/line-listing → 400 without events/period', async () => {
    const res = await request(app).post('/api/ind-lifecycle/annual-report/line-listing').send({ events: [] });
    expect(res.status).toBe(400);
  });

  it('POST /loa → 200 with the LOA model + m1.4.1 leaf intent', async () => {
    const res = await request(app).post('/api/ind-lifecycle/loa').send({
      referencedFileType: 'DMF', referencedFileNumber: '012345', holderName: 'Excipient Co.', authorizedPartyName: 'Acme', subjectName: 'C2C-001', signatoryName: 'Dana Holder',
    });
    expect(res.status).toBe(200);
    expect(res.body.model.documentType).toBe('LETTER_OF_AUTHORIZATION');
    expect(res.body.leafIntent.sectionCode).toBe('m1.4.1');
  });

  it('POST /loa → 400 without the required identifiers', async () => {
    const res = await request(app).post('/api/ind-lifecycle/loa').send({ referencedFileType: 'DMF' });
    expect(res.status).toBe(400);
  });

  it('POST /loa/pdf → 200 application/pdf', async () => {
    const res = await request(app).post('/api/ind-lifecycle/loa/pdf').send({
      referencedFileType: 'DMF', referencedFileNumber: '012345', holderName: 'Excipient Co.', authorizedPartyName: 'Acme', subjectName: 'C2C-001', signatoryName: 'Dana Holder',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('POST /right-of-reference → 200 with the m1.4.2 model', async () => {
    const res = await request(app).post('/api/ind-lifecycle/right-of-reference').send({
      sponsorName: 'Acme', referencedFileType: 'DMF', referencedFileNumber: '012345', subjectName: 'C2C-001', signatoryName: 'Dana',
    });
    expect(res.status).toBe(200);
    expect(res.body.leafIntent.sectionCode).toBe('m1.4.2');
  });

  it('POST /authorized-persons/pdf → 200 application/pdf', async () => {
    const res = await request(app).post('/api/ind-lifecycle/authorized-persons/pdf').send({ sponsorName: 'Acme', persons: [{ name: 'Pat Smith' }] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('POST /cross-reference-register → 200 not ready when an LOA is missing', async () => {
    const res = await request(app).post('/api/ind-lifecycle/cross-reference-register').send({
      references: [
        { referencedFileType: 'DMF', referencedFileNumber: '111', subjectName: 'Substance', loaOnFile: true },
        { referencedFileType: 'DMF', referencedFileNumber: '222', subjectName: 'Excipient', loaOnFile: false },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.counts.missingLoa).toBe(1);
  });

  it('POST /cross-reference-register → 400 without references[]', async () => {
    const res = await request(app).post('/api/ind-lifecycle/cross-reference-register').send({});
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

describe('API discovery', () => {
  it('GET /openapi.json → 200 with a generated OpenAPI 3.1 spec', async () => {
    const res = await request(app).get('/api/ind-lifecycle/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths).length).toBeGreaterThanOrEqual(30);
    expect(res.body.paths['/api/ind-lifecycle/readiness']?.post).toBeTruthy();
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

  it('POST /safety-report/file with an ICSR → 201 also files a checksummed m5.3.5 leaf', async () => {
    const res = await request(app)
      .post('/api/ind-lifecycle/safety-report/file')
      .send({
        submissionId: seededSubmissionId,
        sequenceNumber: '0004',
        event: reportableEvent(),
        icsr: { worldwideUniqueId: 'US-C2C-2026-000999', senderType: 'sponsor' },
      });
    expect(res.status).toBe(201);
    const m535 = res.body.leaves.find((l: any) => l.sectionCode === 'm5.3.5');
    expect(m535).toBeTruthy();
    expect(typeof m535.checksum).toBe('string');
    expect(m535.checksum.length).toBe(32); // md5 hex
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
    expect(res.body.crossReferences).toHaveProperty('missingLoa');
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

describe('persisted cross-references (eCTD m1.4)', () => {
  let crossRefId: string;

  it('POST /submission/:id/cross-references → 201', async () => {
    const res = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references`)
      .send({ referencedFileType: 'DMF', referencedFileNumber: '012345', subjectName: 'C2C-001 drug substance' });
    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(1); // from session, not body
    expect(res.body.loaOnFile).toBe(false);
    crossRefId = res.body.id;
  });

  it('POST /submission/:id/cross-references → 400 on a bad file type', async () => {
    const res = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references`)
      .send({ referencedFileType: 'XYZ', referencedFileNumber: '1', subjectName: 's' });
    expect(res.status).toBe(400);
  });

  it('GET /submission/:id/cross-references → 200 includes the record', async () => {
    const res = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toContain(crossRefId);
  });

  it('register is NOT ready while the LOA is not on file, then ready after PATCH', async () => {
    const before = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-reference-register`);
    expect(before.status).toBe(200);
    expect(before.body.ready).toBe(false);
    expect(before.body.counts.missingLoa).toBeGreaterThanOrEqual(1);

    const patch = await request(app).patch(`/api/ind-lifecycle/cross-references/${crossRefId}`).send({ loaOnFile: true, loaLeafSection: 'm1.4.1' });
    expect(patch.status).toBe(200);
    expect(patch.body.loaOnFile).toBe(true);

    const after = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-reference-register`);
    expect(after.body.ready).toBe(true);
    expect(after.body.counts.withLoa).toBeGreaterThanOrEqual(1);
  });

  it('POST …/cross-references/:id/file-loa → 201 files the m1.4.1 leaf and authorizes it', async () => {
    // New, unauthorized dependency.
    const created = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references`)
      .send({ referencedFileType: 'DMF', referencedFileNumber: '099999', subjectName: 'Excipient X' });
    const id = created.body.id;

    const filed = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references/${id}/file-loa`)
      .send({ sequenceNumber: '0007', holderName: 'Excipient Co.', authorizedPartyName: 'Acme', signatoryName: 'Dana Holder' });
    expect(filed.status).toBe(201);
    expect(filed.body.sequence.type).toBe('amendment');
    const loaLeaf = filed.body.leaves.find((l: any) => l.sectionCode === 'm1.4.1');
    expect(loaLeaf).toBeTruthy();
    expect(typeof loaLeaf.checksum).toBe('string');
    expect(filed.body.crossReference.loaOnFile).toBe(true);
    expect(filed.body.crossReference.loaLeafSection).toBe('m1.4.1');
  });

  it('POST …/file-loa → 400 without a 4-digit sequenceNumber', async () => {
    const created = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references`)
      .send({ referencedFileType: 'DMF', referencedFileNumber: '088888', subjectName: 'Excipient Y' });
    const res = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references/${created.body.id}/file-loa`)
      .send({ sequenceNumber: '7', holderName: 'H', authorizedPartyName: 'A', signatoryName: 'S' });
    expect(res.status).toBe(400);
  });

  it('POST …/file-loa → 404 for an unknown cross-reference', async () => {
    const res = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references/00000000-0000-0000-0000-000000000000/file-loa`)
      .send({ sequenceNumber: '0008', holderName: 'H', authorizedPartyName: 'A', signatoryName: 'S' });
    expect(res.status).toBe(404);
  });

  it('does not leak another org\'s cross-references', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references`);
    expect(res.body.map((r: any) => r.id)).not.toContain(crossRefId);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('PATCH unknown id → 404', async () => {
    const res = await request(app).patch('/api/ind-lifecycle/cross-references/00000000-0000-0000-0000-000000000000').send({ loaOnFile: true });
    expect(res.status).toBe(404);
  });

  it('DELETE /cross-references/:id → 204 then absent', async () => {
    const del = await request(app).delete(`/api/ind-lifecycle/cross-references/${crossRefId}`);
    expect(del.status).toBe(204);
    const list = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/cross-references`);
    expect(list.body.map((r: any) => r.id)).not.toContain(crossRefId);
  });
});

describe('persisted IND safety reports (21 CFR 312.32)', () => {
  let draftId: string;

  it('POST /submission/:id/safety-reports → 201 drafts a tracked report', async () => {
    const res = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/safety-reports`)
      .send({ event: reportableEvent() });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.obligation).toBe('SEVEN_DAY');
    expect(res.body.organizationId).toBe(1);
    draftId = res.body.id;
  });

  it('POST /safety-reports → 422 for a non-reportable event', async () => {
    const notReportable = { ...reportableEvent(), id: 'ae-2', causality: 'unrelated', expectedness: 'expected (listed in IB)' };
    const res = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/safety-reports`)
      .send({ event: notReportable });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_REPORTABLE');
  });

  it('GET /safety-reports → 200 lists the draft', async () => {
    const res = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/safety-reports`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toContain(draftId);
  });

  it('GET /safety-reports/overdue → 200 includes the unfiled past-deadline draft', async () => {
    // The reportable event's deadline is in Jan 2026; "now" is well past it.
    const res = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/safety-reports/overdue`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toContain(draftId);
  });

  it('filing with draftId marks it filed and drops it from overdue', async () => {
    const filed = await request(app)
      .post('/api/ind-lifecycle/safety-report/file')
      .send({ submissionId: seededSubmissionId, sequenceNumber: '0011', event: reportableEvent(), draftId });
    expect(filed.status).toBe(201);
    expect(filed.body.draft.status).toBe('filed');
    expect(filed.body.draft.sequenceId).toBe(filed.body.sequence.id);

    const overdue = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/safety-reports/overdue`);
    expect(overdue.body.map((r: any) => r.id)).not.toContain(draftId);
  });

  it('does not leak another org\'s safety reports', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/safety-reports`);
    expect(res.body.map((r: any) => r.id)).not.toContain(draftId);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});

describe('persisted IND annual reports (21 CFR 312.33)', () => {
  let draftId: string;
  const report = () => ({
    projectId: 'proj-1',
    indNumber: '123456',
    productName: 'C2C-001',
    reportingPeriodStart: '2026-01-01T00:00:00.000Z',
    reportingPeriodEnd: '2026-12-31T00:00:00.000Z',
    studyStatuses: [],
    safetyReportsInPeriod: [],
    ibChanges: [],
  });

  it('POST /submission/:id/annual-reports → 201 drafts a tracked report with a due date', async () => {
    const res = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/annual-reports`)
      .send({ report: report(), indEffectiveDate: '2026-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.indNumber).toBe('123456');
    expect(res.body.dueDate).toBeTruthy();
    expect(typeof res.body.gapCount).toBe('number');
    draftId = res.body.id;
  });

  it('POST /annual-reports → 400 without indNumber/productName', async () => {
    const res = await request(app).post(`/api/ind-lifecycle/submission/${seededSubmissionId}/annual-reports`).send({ report: { indNumber: '1' } });
    expect(res.status).toBe(400);
  });

  it('GET /annual-reports → 200 lists the draft', async () => {
    const res = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/annual-reports`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toContain(draftId);
  });

  it('overdue with a far-future asOf includes it; filing then drops it', async () => {
    const before = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/annual-reports/overdue?asOf=2030-01-01`);
    expect(before.body.map((r: any) => r.id)).toContain(draftId);

    const filed = await request(app)
      .post('/api/ind-lifecycle/annual-report/file')
      .send({ submissionId: seededSubmissionId, sequenceNumber: '0012', draftId });
    expect(filed.status).toBe(201);
    expect(filed.body.draft.status).toBe('filed');
    expect(filed.body.draft.sequenceId).toBe(filed.body.sequence.id);

    const after = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/annual-reports/overdue?asOf=2030-01-01`);
    expect(after.body.map((r: any) => r.id)).not.toContain(draftId);
  });
});

describe('persisted IND amendments (21 CFR 312.30/.31)', () => {
  let draftId: string;
  const amendment = () => ({
    indNumber: '123456',
    projectId: 'proj-1',
    changedDocuments: [
      { documentId: 'doc-1', title: 'Revised Protocol v2', category: 'protocol_amendment_summary', changeKind: 'revised', replacesLeafGuid: 'guid-1' },
    ],
  });

  it('POST /submission/:id/amendments → 201 drafts a tracked amendment', async () => {
    const res = await request(app).post(`/api/ind-lifecycle/submission/${seededSubmissionId}/amendments`).send(amendment());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.indNumber).toBe('123456');
    expect(res.body.leafCount).toBeGreaterThanOrEqual(1);
    draftId = res.body.id;
  });

  it('POST /amendments → 400 without indNumber/changedDocuments', async () => {
    const res = await request(app).post(`/api/ind-lifecycle/submission/${seededSubmissionId}/amendments`).send({ indNumber: '1' });
    expect(res.status).toBe(400);
  });

  it('GET /amendments → 200 lists the draft', async () => {
    const res = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/amendments`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toContain(draftId);
  });

  it('filing with draftId marks the amendment filed + links its sequence', async () => {
    const filed = await request(app)
      .post('/api/ind-lifecycle/amendment/file')
      .send({ submissionId: seededSubmissionId, sequenceNumber: '0013', ...amendment(), draftId });
    expect(filed.status).toBe(201);
    expect(filed.body.draft.status).toBe('filed');
    expect(filed.body.draft.sequenceId).toBe(filed.body.sequence.id);
  });
});

describe('persisted ICSR transmissions (E2B(R3) → FAERS/EudraVigilance)', () => {
  it('prepare → transmit → acknowledge lifecycle (ready case)', async () => {
    const prep = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/icsr-transmissions`)
      .send({
        event: { ...reportableEvent(), suspectProduct: 'C2C-001', reactionPt: 'Hepatic failure' },
        gateway: 'FDA_FAERS',
        senderId: 'C2C',
        messageNumber: 'MSG-1001',
        icsr: { worldwideUniqueId: 'US-C2C-2026-000123', senderType: 'sponsor' },
      });
    expect(prep.status).toBe(201);
    expect(prep.body.status).toBe('prepared');
    expect(prep.body.receiverId).toBe('ZZFDA');
    expect(prep.body.transmitReady).toBe(true);
    const txId = prep.body.id;

    const list = await request(app).get(`/api/ind-lifecycle/submission/${seededSubmissionId}/icsr-transmissions`);
    expect(list.body.map((t: any) => t.id)).toContain(txId);

    const tx = await request(app).post(`/api/ind-lifecycle/icsr-transmissions/${txId}/transmit`);
    expect(tx.status).toBe(200);
    expect(tx.body.status).toBe('transmitted');

    const ack = await request(app)
      .post(`/api/ind-lifecycle/icsr-transmissions/${txId}/acknowledge`)
      .send({ ackXml: '<ack><messagenumb>MSG-1001</messagenumb><transmissionacknowledgmentcode>AA</transmissionacknowledgmentcode></ack>' });
    expect(ack.status).toBe(200);
    expect(ack.body.status).toBe('acknowledged');
    expect(ack.body.ackCode).toBe('AA');
  });

  it('rejects transmit when the ICSR is not transmit-ready (422)', async () => {
    // No worldwide id + no suspect product → mandatory gaps → not ready.
    const evt = { ...reportableEvent(), id: 'ae-notready', suspectProduct: null };
    const prep = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/icsr-transmissions`)
      .send({ event: evt, gateway: 'FDA_FAERS', senderId: 'C2C', messageNumber: 'MSG-1002' });
    expect(prep.body.transmitReady).toBe(false);
    const tx = await request(app).post(`/api/ind-lifecycle/icsr-transmissions/${prep.body.id}/transmit`);
    expect(tx.status).toBe(422);
    expect(tx.body.error.code).toBe('NOT_READY');
  });

  it('an AR acknowledgment marks the transmission rejected with errors', async () => {
    const prep = await request(app)
      .post(`/api/ind-lifecycle/submission/${seededSubmissionId}/icsr-transmissions`)
      .send({ event: reportableEvent(), gateway: 'EMA_EUDRAVIGILANCE', senderId: 'C2C', messageNumber: 'MSG-1003', icsr: { worldwideUniqueId: 'EU-1', senderType: 'sponsor' } });
    const ack = await request(app)
      .post(`/api/ind-lifecycle/icsr-transmissions/${prep.body.id}/acknowledge`)
      .send({ ackXml: '<ack><reportacknowledgmentcode>AR</reportacknowledgmentcode><error>Invalid MedDRA version</error></ack>' });
    expect(ack.body.status).toBe('rejected');
    expect(ack.body.ackCode).toBe('AR');
    expect(ack.body.errors).toContain('Invalid MedDRA version');
  });

  it('400 without gateway; 404 transmitting an unknown id', async () => {
    const bad = await request(app).post(`/api/ind-lifecycle/submission/${seededSubmissionId}/icsr-transmissions`).send({ event: reportableEvent(), senderId: 'C2C', messageNumber: 'X' });
    expect(bad.status).toBe(400);
    const missing = await request(app).post('/api/ind-lifecycle/icsr-transmissions/00000000-0000-0000-0000-000000000000/transmit');
    expect(missing.status).toBe(404);
  });
});
