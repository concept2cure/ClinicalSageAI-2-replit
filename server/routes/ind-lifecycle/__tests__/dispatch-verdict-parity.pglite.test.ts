/**
 * One dispatch verdict per sequence, at the HTTP boundary (decision P-33,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * The IND lifecycle routes answered "may this sequence be dispatched?" from
 * their own gate (ind-lifecycle/ind-dispatch-gate.ts), and Submit answered it
 * from assessSequenceDispatchReadiness. For one sequence the two could
 * disagree: the IND gate blocked a complete amendment because no clinical-hold
 * clock was in the request body (CLINICAL_HOLD_NOT_EVALUATED) and because the
 * governed leaf path never sets a checksum (MISSING_CHECKSUMS), while Submit
 * cleared it; and Submit cleared an amendment the IND gate blocked for a
 * missing cover letter or an unauthorized cross-reference.
 *
 * Both routers are mounted over one in-process PGlite database, and the same
 * sequence is asked both ways:
 *   POST /api/ind-lifecycle/sequence/:id/dispatch-gate      → verdict.canDispatch
 *   GET  /api/submissions/sequences/:id/dispatch-readiness  → gate.cleared
 * They must be equal, for a clean sequence and for each kind of block, and
 * the snapshot and cockpit routes must say the same.
 *
 * The release-signature resolver is stubbed (not required; its store is not in
 * this harness), and the signer-independence lookup with it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'dispatch-verdict-parity-test-secret-32ch';
});

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../../db.js', () => ({ get db() { return holder.db; } }));
vi.mock('../../../services/auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));
vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../../services/ectd/release-signature-status', async (importOriginal) => ({
  resolveReleaseSignatureStatus: async () => ({ verdict: 'unsigned', detail: 'stubbed: no release signature store in this harness' }),
  isReleaseSignatureRequired: () => false,
  signingNowResolvesRelease: (await importOriginal<typeof import('../../../services/ectd/release-signature-status')>()).signingNowResolvesRelease,
}));
vi.mock('../../../services/governance/separation-of-duties', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/governance/separation-of-duties')>()),
  signerIndependenceOf: async () => 'independent',
}));

import indLifecycleRouter from '../../ind-lifecycle.routes';
import submissionsRouter from '../../submissions';

let harness: IndPgliteDb;
let app: express.Express;
const ORG = 71;
const USER = 8;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const q = (text: string, params: unknown[] = []) => harness.pglite.query<any>(text, params);

async function seedSubmission(): Promise<number> {
  const r = await q(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('ABC-301 IND', 'ABC-301', 'ind', 'biotech', 'fda', $1, $2) RETURNING id`,
    [ORG, USER],
  );
  return Number(r.rows[0].id);
}

async function seedSequence(submissionId: number, sequenceNumber: string, type = 'amendment'): Promise<number> {
  const r = await q(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', $2, $3, 'assembling', $4, $5) RETURNING id`,
    [submissionId, sequenceNumber, type, ORG, USER],
  );
  const id = Number(r.rows[0].id);
  await q(`INSERT INTO shadow_review_runs (sequence_id, status, organization_id) VALUES ($1, 'complete', $2)`, [id, ORG]);
  return id;
}

async function placeLeaf(sequenceId: number, sectionCode: string, title: string): Promise<void> {
  const body = `${title} body ${sequenceId}`;
  const doc = await q(
    `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status) VALUES ($1, $2, $3, $4, 'approved') RETURNING id`,
    [ORG, title, body, sectionCode],
  );
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_content_sha256, organization_id, created_by)
     VALUES ($1, $2, $3, 'new', 'coauthor_documents', $4, $5, $6, $7)`,
    [sequenceId, sectionCode, title, Number(doc.rows[0].id), sha(body), ORG, USER],
  );
}

async function completeAmendment(sequenceId: number): Promise<void> {
  await placeLeaf(sequenceId, 'm1.1.1', 'Form FDA 1571');
  await placeLeaf(sequenceId, 'm1.2', 'Cover Letter');
  await placeLeaf(sequenceId, 'm5.3.5.1', 'Protocol amendment');
}

/** The same sequence, asked both ways. */
async function bothVerdicts(sequenceId: number): Promise<{ ind: boolean; submit: boolean; indBody: any; submitBody: any }> {
  const ind = await request(app).post(`/api/ind-lifecycle/sequence/${sequenceId}/dispatch-gate`).send({});
  const submit = await request(app).get(`/api/submissions/sequences/${sequenceId}/dispatch-readiness`);
  expect(ind.status, JSON.stringify(ind.body)).toBe(200);
  expect(submit.status, JSON.stringify(submit.body)).toBe(200);
  return { ind: ind.body.verdict.canDispatch, submit: submit.body.gate.cleared, indBody: ind.body, submitBody: submit.body };
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, shadowReview: true, programSpine: true });
  holder.db = harness.db;
  // The verdict reads the tenant's saved company legal requirements, and refuses a tenant it cannot find.
  await harness.pglite.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Sponsor organization')`, [ORG]);
  app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: USER, userId: USER, organizationId: ORG, role: 'regulatory-author', roles: ['regulatory-author'] };
    next();
  });
  app.use('/api/ind-lifecycle', indLifecycleRouter);
  app.use('/api/submissions', submissionsRouter);
});

afterAll(async () => {
  await harness?.close?.();
});

describe('the IND route and Submit give one verdict for one sequence', () => {
  it('a complete amendment: both clear it — no hold read from a body, no checksum the governed path cannot set', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0001');
    await completeAmendment(sequenceId);
    const v = await bothVerdicts(sequenceId);
    expect(v.ind).toBe(v.submit);
    expect(v.submit, JSON.stringify(v.submitBody.gate)).toBe(true);
    expect(v.indBody.verdict.source).toBe('assess-dispatch-readiness');
    // Cleared, and it says what it did not assess.
    expect(v.indBody.verdict.notAssessed.join(' ')).toMatch(/Clinical hold \(21 CFR 312\.42\) is not assessed/);
    expect(v.indBody.verdict.blockers).toEqual([]);
  });

  it('an amendment with only its 1571: both block it, for the same missing sections', async () => {
    const sequenceId = await seedSequence(await seedSubmission(), '0001');
    await placeLeaf(sequenceId, 'm1.1.1', 'Form FDA 1571');
    const v = await bothVerdicts(sequenceId);
    expect(v.ind).toBe(v.submit);
    expect(v.submit).toBe(false);
    const missing = (v.submitBody.readiness.findings as any[]).filter((f) => f.code === 'MISSING_REQUIRED_SECTION').map((f) => f.sectionCode);
    expect(missing).toEqual(['1.2', '5.3.5']);
    expect((v.indBody.verdict.blockers as any[]).map((b) => b.code)).toEqual(expect.arrayContaining(['MISSING_REQUIRED_SECTION']));
  });

  it('a cross-reference with no LOA: both block it', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0001');
    await completeAmendment(sequenceId);
    await q(
      `INSERT INTO ind_cross_references (organization_id, submission_id, referenced_file_type, referenced_file_number, subject_name, authorized_sections, loa_on_file)
       VALUES ($1, $2, 'DMF', '088001', 'ABC-301 drug substance', '[]'::jsonb, false)`,
      [ORG, submissionId],
    );
    const v = await bothVerdicts(sequenceId);
    expect(v.ind).toBe(v.submit);
    expect(v.submit).toBe(false);
    expect((v.indBody.verdict.blockers as any[]).map((b) => b.code)).toContain('CROSS_REFERENCE_LOA_MISSING');
  });

  it('the snapshot records that verdict and the gate that produced it; the cockpit agrees, sequence by sequence', async () => {
    const submissionId = await seedSubmission();
    const clean = await seedSequence(submissionId, '0001');
    await completeAmendment(clean);
    const blocked = await seedSequence(submissionId, '0002');
    await placeLeaf(blocked, 'm1.1.1', 'Form FDA 1571');

    const snap = await request(app).post(`/api/ind-lifecycle/sequence/${clean}/dispatch-gate/snapshot`).send({});
    expect(snap.status).toBe(201);
    expect(snap.body.snapshot.canDispatch).toBe(true);
    expect(snap.body.snapshot.verdict.source).toBe('assess-dispatch-readiness');

    const cockpit = await request(app).post(`/api/ind-lifecycle/submission/${submissionId}/cockpit`).send({});
    expect(cockpit.status).toBe(200);
    for (const g of cockpit.body.sequenceGates as any[]) {
      const submit = await request(app).get(`/api/submissions/sequences/${g.sequenceId}/dispatch-readiness`);
      expect(g.canDispatch, `sequence ${g.sequenceNumber}`).toBe(submit.body.gate.cleared);
    }
    const bySeq = Object.fromEntries((cockpit.body.sequenceGates as any[]).map((g) => [g.sequenceId, g]));
    expect(bySeq[clean]).toMatchObject({ canDispatch: true, drift: false, recordedUnderPreviousGate: false });
    expect(bySeq[blocked].canDispatch).toBe(false);
  });

  it('a snapshot recorded under the previous gate is reported as such, not as drift', async () => {
    const submissionId = await seedSubmission();
    const sequenceId = await seedSequence(submissionId, '0001');
    await completeAmendment(sequenceId);
    // A row the IND gate wrote before P-33: blocked, with no source.
    await q(
      `INSERT INTO ind_dispatch_snapshots (organization_id, submission_id, sequence_id, sequence_number, can_dispatch, blocker_count, warning_count, blocker_codes, verdict, created_by)
       VALUES ($1, $2, $3, '0001', false, 2, 0, '["MISSING_CHECKSUMS","CLINICAL_HOLD_NOT_EVALUATED"]'::jsonb, '{"canDispatch":false,"blockers":[],"warnings":[]}'::jsonb, $4)`,
      [ORG, submissionId, sequenceId, USER],
    );
    const drift = await request(app).post(`/api/ind-lifecycle/submission/${submissionId}/drift`).send({});
    expect(drift.status).toBe(200);
    expect(drift.body.summary).toMatchObject({ drifted: 0, recordedUnderPreviousGate: 1 });
    expect(drift.body.entries.map((e: any) => [e.sequenceId, e.reason])).toEqual([[sequenceId, 'recorded_under_previous_gate']]);
  });
});
