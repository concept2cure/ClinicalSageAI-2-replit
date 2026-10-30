/**
 * CSR slice 3 (docs/design/CSR_END_TO_END_2026-10-29.md): POST /api/csr/jobs
 * from the CSR card binds the retained run and refuses, by name and before a
 * job exists, a run whose tables cannot be read for this study; a section
 * review decision is recorded as the signed-in reviewer. The job tables are
 * the real migrations/20260628_csr_job_state.sql in PGlite.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  database: null as unknown,
  launch: vi.fn(async () => ({ jobId: 41, status: 'queued' })),
  evidence: vi.fn(),
}));
vi.mock('../../db', () => ({ get db() { return h.database; } }));
vi.mock('../../db/requestDb.js', () => ({ requestPgClient: () => ({}) }));
vi.mock('../../services/csr-builder.js', async (original) => ({
  ...(await original<typeof import('../../services/csr-builder.js')>()), launchCSRBuildAsync: h.launch,
}));
vi.mock('../../services/csr/cortex-authoring-reader.js', () => ({ loadCsrAuthoringEvidence: h.evidence }));
vi.mock('../../services/csr/project-scope', async (original) => ({
  ...(await original<typeof import('../../services/csr/project-scope')>()),
  requireCsrJobAccess: async () => true,
  resolveCsrScope: async () => ({ projectId: 11 }),
}));
import router from '../csr-jobs';
import { CsrSourceInputError } from '../../services/csr/source-access';
import { CsrAuthoringContextError } from '../../services/csr/cortex-authoring-context';
import { flattenICHE3Sections, getICHE3Structure } from '../../services/csr-builder.js';

const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const studyInfo = { title: 'LMN-201 Phase 2/3', protocolNumber: 'NCT05330182', phase: '2/3', indication: 'Recurrent C. difficile infection',
  sponsor: 'Lumen', investigationalProduct: 'LMN-201', studyDesign: 'Randomized 1:1, placebo-controlled', primaryEndpoint: 'Global cure' };
const TEXT = '§11.4.1 Global cure: 10/12 (83.3%) LMN-201 vs 4/11 (36.4%) placebo.';
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: unknown }).user = { organizationId: 7, id: Number(req.header('x-test-user') ?? 5) };
  next();
});
app.use('/api/csr/jobs', router);

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  h.database = drizzle(pg);
  await pg.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO projects VALUES (11);
    INSERT INTO users VALUES (5), (6);`);
  await pg.exec(readFileSync(path.resolve(__dirname, '../../../migrations/20260628_csr_job_state.sql'), 'utf8'));
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (1, 7, 11, 'NCT05330182', 'complete', $1, 5)`, [JSON.stringify({ studyInfo, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' } })]);
  // A build bound to another run, and one in another organization bound to this run: neither is this run's build.
  await pg.query(`INSERT INTO organizations VALUES (8)`);
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (2, 7, 11, 'NCT05330182', 'queued', $1, 5), (3, 8, 11, 'NCT05330182', 'complete', $2, 5)`, [
    JSON.stringify({ studyInfo, evidenceSource: { programId: PROGRAM, runId: '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b99', studyId: 'LMN-201-201' } }),
    JSON.stringify({ studyInfo, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' } })]);
  // A later build of the same run in this organization: the list reads newest first, and the card falls back to builds[0].
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by, updated_at)
    VALUES (4, 7, 11, 'NCT05330182', 'drafting', $1, 5, now() + interval '1 day')`, [
    JSON.stringify({ studyInfo, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' } })]);
  await pg.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash)
    VALUES (7, 11, 1, '11.4.1', $1, $2)`, [TEXT, sha(TEXT)]);
});
afterAll(async () => { await pg?.close(); });
beforeEach(() => { h.launch.mockClear(); h.evidence.mockReset(); });

const build = (over: Record<string, unknown> = {}) => request(app).post('/api/csr/jobs')
  .send({ programId: PROGRAM, studyInfo, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' }, ...over });

describe('POST /api/csr/jobs bound to a retained run', () => {
  it('queues a build bound to the run once its tables read for this protocol', async () => {
    h.evidence.mockResolvedValue({ source: { protocolNumber: 'NCT05330182' } });
    const res = await build();
    expect(res.status).toBe(202);
    expect(h.evidence).toHaveBeenCalledWith({}, { organizationId: 7, userId: 5 }, expect.objectContaining({ runId: RUN, sectionNumber: '2' }));
    expect(h.launch).toHaveBeenCalledWith(expect.objectContaining({ evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'LMN-201-201' }, userId: 5 }),
      expect.objectContaining({ programId: PROGRAM, requestedBy: 5 }));
  });

  it('refuses, by name and before any job, a run with no retained tables or tables for another protocol', async () => {
    h.evidence.mockRejectedValue(new CsrSourceInputError(404, 'CSR_RUN_INPUTS_NOT_FOUND', 'This saved run has no retained source inputs in the selected project.'));
    const missing = await build();
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ code: 'CSR_RUN_INPUTS_NOT_FOUND', error: 'This saved run has no retained source inputs in the selected project. No job was created.' });
    h.evidence.mockResolvedValue({ source: { protocolNumber: 'OTHER-1' } });
    const other = await build();
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('CSR_EVIDENCE_STUDY_MISMATCH');
    h.evidence.mockRejectedValue(new Error('pool exhausted'));
    expect((await build()).body.code).toBe('CSR_EVIDENCE_UNAVAILABLE');
    expect(h.launch).not.toHaveBeenCalled();
  });

  it('refuses a run retained under another program than the build, before reading it', async () => {
    h.evidence.mockResolvedValue({ source: { protocolNumber: 'NCT05330182' } });
    const res = await build({ evidenceSource: { programId: '11111111-2222-4333-8444-000000000099', runId: RUN, studyId: 'LMN-201-201' } });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CSR_EVIDENCE_PROGRAM_MISMATCH');
    expect(h.evidence).not.toHaveBeenCalled();
    expect(h.launch).not.toHaveBeenCalled();
  });

  it('preserves the typed refusal from canonical pre-quota evidence parsing', async () => {
    h.evidence.mockResolvedValue({ source: { protocolNumber: 'NCT05330182' } });
    h.launch.mockRejectedValueOnce(new CsrAuthoringContextError('CSR_EVIDENCE_SELECTION_INVALID', 400));
    const res = await build();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'CSR_EVIDENCE_SELECTION_INVALID', code: 'CSR_EVIDENCE_SELECTION_INVALID' });
    expect(h.launch).toHaveBeenCalledOnce();
  });
});

describe('POST /api/csr/jobs/:jobId/sections/:sectionNumber/review', () => {
  const review = (user: number, body: Record<string, unknown>) => request(app)
    .post('/api/csr/jobs/1/sections/11.4.1/review').set('x-test-user', String(user)).send({ expectedContentHash: sha(TEXT), ...body });

  it('records each decision as the signed-in reviewer, never a body-supplied one', async () => {
    const submitted = await review(5, { decision: 'submit', reviewerId: 6 });
    expect(submitted.status).toBe(200);
    expect(submitted.body.review).toMatchObject({ state: 'in_review', reviewerId: 5 });
    const own = await review(5, { decision: 'approve' });
    expect(own.status).toBe(409);
    expect(own.body.code).toBe('CSR_REVIEWER_IS_REQUESTER');
    const approved = await review(6, { decision: 'approve' });
    expect(approved.body.review).toMatchObject({ state: 'approved', reviewerId: 6, contentHash: sha(TEXT) });
    const listed = await request(app).get('/api/csr/jobs/1/sections');
    expect(listed.body.sections[0]).toMatchObject({ sectionNumber: '11.4.1', reviewerId: 6, review: { state: 'approved', staleApproval: false } });
  });

  it('refuses a send-back without a reason and a malformed section number', async () => {
    expect((await review(6, { decision: 'send_back' })).body.code).toBe('CSR_REVIEW_REASON_REQUIRED');
    expect((await request(app).post('/api/csr/jobs/1/sections/x/review').send({ decision: 'submit' })).status).toBe(400);
  });
});

describe('GET /api/csr/jobs?programId&runId — the builds bound to one retained run (the CSR card, 2026-10-30)', () => {
  it('lists only this organization\'s builds bound to the run, newest first', async () => {
    const res = await request(app).get(`/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs.map((j: { jobId: number }) => j.jobId)).toEqual([4, 1]);
    expect(res.body.jobs).toEqual([expect.objectContaining({ jobId: 4, status: 'drafting' }),
      expect.objectContaining({ jobId: 1, studyId: 'NCT05330182', status: 'complete' })]);
    expect(typeof res.body.jobs[0].updatedAt).toBe('string');
  });

  it('refuses a missing or malformed run and a missing program, never an empty list', async () => {
    expect((await request(app).get(`/api/csr/jobs?programId=${PROGRAM}`)).body.code).toBe('CSR_RUN_REQUIRED');
    expect((await request(app).get(`/api/csr/jobs?programId=${PROGRAM}&runId=x`)).status).toBe(400);
    expect((await request(app).get(`/api/csr/jobs?runId=${RUN}`)).body.code).toBe('CSR_PROJECT_REQUIRED');
  });
});

describe('GET /api/csr/jobs/:jobId/headings — the build\'s ICH E3 tree for review on the CSR card (D2/W1, 2026-10-30)', () => {
  const DRAFT = '§12.2 Adverse events: 3 of 12 subjects.';
  beforeAll(async () => {
    await pg.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash)
      VALUES (7, 11, 4, '12.2', $1, $2)`, [DRAFT, sha(DRAFT)]);
    await pg.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash)
      VALUES (8, 11, 3, '12.2', 'other tenant', $1)`, [sha('other tenant')]);
  });

  it('returns every heading of the canonical tree with each output\'s state and content hash', async () => {
    const res = await request(app).get('/api/csr/jobs/4/headings');
    expect(res.status).toBe(200);
    const tree = flattenICHE3Sections(getICHE3Structure());
    expect(tree.length).toBeGreaterThan(100);
    expect(res.body.headings.map((x: { num: string }) => x.num)).toEqual(tree.map(node => node.number));
    const byNum = new Map(res.body.headings.map((x: { num: string }) => [x.num, x]));
    expect(byNum.get('12.2')).toMatchObject({ label: tree.find(n => n.number === '12.2')!.title, depth: 2, state: 'draft', contentHash: sha(DRAFT) });
    expect(byNum.get('9.1')).toEqual(expect.objectContaining({ state: 'not_drafted' }));
    expect(byNum.get('9.1')).not.toHaveProperty('contentHash');
    expect(byNum.get('16.1.1')).toMatchObject({ manual: true, depth: 3 });
  });

  it('refuses another organization\'s build as not found, never its headings', async () => {
    const res = await request(app).get('/api/csr/jobs/3/headings');
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('headings');
    expect((await request(app).get('/api/csr/jobs/x/headings')).status).toBe(400);
  });
});
