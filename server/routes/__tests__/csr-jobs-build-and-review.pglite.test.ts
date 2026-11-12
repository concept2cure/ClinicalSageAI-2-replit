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
  resume: vi.fn(),
  bound: vi.fn(),
}));
vi.mock('../../services/authoring/csr-import-into-document', () => ({ csrBuildOfDocument: h.bound }));
vi.mock('../../services/csr/csr-job-runner.js', async (original) => ({
  ...(await original<typeof import('../../services/csr/csr-job-runner.js')>()), resumeCSRBuildInBackground: h.resume,
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
beforeEach(() => { h.launch.mockClear(); h.evidence.mockReset(); h.resume.mockClear(); });

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

// Walked 2026-11-10: a CSR document takes its imported sections from one build. A build that stopped part-way
// (a rate limit, a key) could only be followed by a NEW build, whose sections that document then refuses
// ("This document holds sections imported from CSR build 1"). The runner has always been able to resume a failed
// build, keeping what it saved; nothing reached it.
describe('POST /api/csr/jobs/:jobId/resume — a stopped build is resumed as the same build', () => {
  const bound = JSON.stringify({ studyInfo, evidenceSource: { programId: PROGRAM, runId: '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b77', studyId: 'LMN-201-201' } });
  beforeAll(async () => {
    await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by, error)
      VALUES (61, 7, 11, 'NCT05330182', 'failed', $1, 5, $2), (62, 8, 11, 'NCT05330182', 'failed', $1, 5, NULL)`,
    [bound, JSON.stringify({ code: 'CSR_DRAFTING_RATE_LIMITED', message: 'CSR_DRAFTING_RATE_LIMITED', section: '9.8' })]);
  });

  it('hands a failed build back to the runner and answers with the same build', async () => {
    const res = await request(app).post('/api/csr/jobs/61/resume').send({});
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: 61, status: 'queued', resumed: true });
    expect(h.resume).toHaveBeenCalledExactlyOnceWith(61);
    expect(h.launch).not.toHaveBeenCalled();
  });

  it('refuses a build that did not fail, by name, and resumes nothing', async () => {
    for (const [id, status] of [[1, 'complete'], [4, 'drafting'], [2, 'queued']] as const) {
      const res = await request(app).post(`/api/csr/jobs/${id}/resume`).send({});
      expect(res.status, status).toBe(409);
      expect(res.body).toMatchObject({ code: 'CSR_BUILD_NOT_RESUMABLE', status });
    }
    expect(h.resume).not.toHaveBeenCalled();
  });

  /* Reach (R1), 2026-11-11: the page now stops a running build (POST …/cancel, recorded `cancelled`). A document
     takes its imported sections from one build, so a build a person stopped must be resumable as itself, or the
     rest of the report could never be imported. The runner takes a queued or failed build only, so the stopped
     build is queued again, in one statement, and then handed to it. */
  it('queues a build a person stopped again, as the same build, and hands it to the runner', async () => {
    await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, progress, study_info_snapshot, requested_by)
      VALUES (63, 7, 11, 'NCT05330182', 'drafting', 30, $1, 5)`, [bound]);
    expect((await request(app).post('/api/csr/jobs/63/cancel').send({})).status).toBe(204);
    expect((await pg.query('SELECT status FROM csr_build_jobs WHERE id = 63')).rows[0]).toEqual({ status: 'cancelled' });
    const res = await request(app).post('/api/csr/jobs/63/resume').send({});
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: 63, status: 'queued', resumed: true });
    const row = (await pg.query('SELECT status, progress FROM csr_build_jobs WHERE id = 63')).rows[0];
    expect(row).toMatchObject({ status: 'queued', progress: 30 });
    expect(h.resume).toHaveBeenCalledExactlyOnceWith(63);
    // Asked twice: it is queued now, not stopped, and is not handed over a second time.
    const again = await request(app).post('/api/csr/jobs/63/resume').send({});
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'CSR_BUILD_NOT_RESUMABLE', status: 'queued' });
    expect(h.resume).toHaveBeenCalledTimes(1);
  });

  it('does not find another organization\'s build, a build that does not exist, or a malformed id', async () => {
    expect((await request(app).post('/api/csr/jobs/62/resume').send({})).status).toBe(404);
    expect((await request(app).post('/api/csr/jobs/9999/resume').send({})).status).toBe(404);
    expect((await request(app).post('/api/csr/jobs/abc/resume').send({})).status).toBe(400);
    expect(h.resume).not.toHaveBeenCalled();
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

describe('GET /api/csr/jobs/:jobId/sections — inspect exact persisted CSR text before approval', () => {
  it('accepts a valid dotted ICH E3 section code and returns the saved bytes for human inspection', async () => {
    const result = await request(app).get('/api/csr/jobs/1/sections?sectionNumber=11.4.1');
    expect(result.status).toBe(200);
    expect(result.body.sections).toHaveLength(1);
    expect(result.body.sections[0]).toMatchObject({
      sectionNumber: '11.4.1', content: TEXT, contentHash: sha(TEXT),
    });
    expect(result.body.sections[0].review.integrityFailure).not.toBe(true);
  });

  it.each([
    'abc', '11-4-1', '11.4.', '11.4.1x', '11.4.1\\\\x',
  ])('refuses malformed section code %s instead of reading the wrong section', async code => {
    const result = await request(app).get('/api/csr/jobs/1/sections')
      .query({ sectionNumber: code });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('CSR_SECTION_NUMBER_INVALID');
  });

  it('refuses a missing selected heading and a foreign-tenant build', async () => {
    const missing = await request(app).get('/api/csr/jobs/1/sections?sectionNumber=11.4.99');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('CSR_SECTION_NOT_SAVED');
    const foreign = await request(app).get('/api/csr/jobs/3/sections?sectionNumber=11.4.1');
    expect(foreign.status).toBe(404);
    expect(foreign.body).not.toHaveProperty('sections');
  });

  it('blocks inspection of corrupted saved text, even if its approval hash still matches the stored hash', async () => {
    await pg.query(`UPDATE csr_section_outputs SET content = $1
      WHERE job_id = 1 AND section_number = '11.4.1'`, ['Tampered bytes without a new hash']);
    try {
      const result = await request(app).get('/api/csr/jobs/1/sections?sectionNumber=11.4.1');
      expect(result.status).toBe(409);
      expect(result.body.code).toBe('CSR_SECTION_INTEGRITY_FAILED');
      expect(result.body).not.toHaveProperty('sections');
      const completeList = await request(app).get('/api/csr/jobs/1/sections');
      expect(completeList.status).toBe(200);
      expect(completeList.body.sections[0].review).toMatchObject({
        state: 'draft', integrityFailure: true,
      });
    } finally {
      await pg.query(`UPDATE csr_section_outputs SET content = $1
        WHERE job_id = 1 AND section_number = '11.4.1'`, [TEXT]);
    }
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

  // 2026-11-12, the Lumen walk: the build section opened on the newest build, and a document takes its imported
  // sections from one build. Asked with the document, the list also says which build that is.
  it('names the build a document holds imported sections from, only when a document is named', async () => {
    const DOC = '11111111-2222-4333-8444-000000000099';
    h.bound.mockReset();
    h.bound.mockResolvedValueOnce(1);
    const res = await request(app).get(`/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}&documentId=${DOC}`);
    expect(res.status).toBe(200);
    expect(res.body.documentBuild).toBe(1);
    expect(res.body.jobs.map((j: { jobId: number }) => j.jobId)).toEqual([4, 1]);
    expect(h.bound).toHaveBeenCalledWith(expect.anything(), 7, PROGRAM, DOC);
    h.bound.mockResolvedValueOnce(null);
    expect((await request(app).get(`/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}&documentId=${DOC}`)).body.documentBuild).toBeNull();
    h.bound.mockClear();
    const plain = await request(app).get(`/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}`);
    expect(plain.body).not.toHaveProperty('documentBuild');
    const malformed = await request(app).get(`/api/csr/jobs?programId=${PROGRAM}&runId=${RUN}&documentId=not-a-document`);
    expect([malformed.status, malformed.body.code]).toEqual([400, 'CSR_DOCUMENT_INVALID']);
    expect(h.bound).not.toHaveBeenCalled();
  });

  // F10 of the 2026-11-02 demo walk: a failed build showed only "CSR build N · failed · NN%". The list now carries
  // the recorded reason, in plain words read from the receipt's typed reason or code, never its stored message text.
  describe('a failed build names why it stopped', () => {
    const FAILED_RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6bf0';
    const bound = JSON.stringify({ studyInfo, evidenceSource: { programId: PROGRAM, runId: FAILED_RUN, studyId: 'LMN-201-201' } });
    const failures: Array<[number, string, unknown]> = [
      [21, 'failed', { reason: 'unresolved_placeholders', sections: ['2', '5.1', '9.8'], at: '2026-11-02T03:10:00Z',
        message: 'CSR section(s) 2, 5.1, 9.8 still contain unresolved template placeholders (AI drafting fell back to template text); these sections are not submission-ready.' }],
      // A receipt written before the 2026-11-03 redaction: its message is a raw driver error with a path.
      [22, 'failed', { message: 'relation "csr_section_outputs" does not exist at Pool.query (/app/node_modules/pg/lib/client.js:526:17)', section: '11.4.1' }],
      [23, 'failed', { code: 'CSR_EVIDENCE_CHANGED', message: 'CSR_EVIDENCE_CHANGED', section: '12.2.1' }],
      [24, 'failed', { reason: 'missing_section_outputs', sections: ['10.1'] }],
      [25, 'complete', null],
    ];
    beforeAll(async () => {
      for (const [id, status, error] of failures) {
        await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by, error, updated_at)
          VALUES ($1, 7, 11, 'NCT05330182', $2, $3, 5, $4, now() - $5::interval)`,
        [id, status, bound, error === null ? null : JSON.stringify(error), `${id} minutes`]);
      }
    });

    it('returns each failed build’s reason in plain words, and none for a build that did not fail', async () => {
      const res = await request(app).get(`/api/csr/jobs?programId=${PROGRAM}&runId=${FAILED_RUN}`);
      expect(res.status).toBe(200);
      const failure = new Map(res.body.jobs.map((j: { jobId: number; failure?: string | null }) => [j.jobId, j.failure ?? null]));
      expect(failure.get(21)).toBe('Not complete: §2, §5.1 and §9.8 still hold a data placeholder (“[…]”) where the study’s data is missing.');
      expect(failure.get(22)).toBe('The build stopped while drafting §11.4.1. The sections already saved are kept.');
      expect(failure.get(23)).toMatch(/^The retained evidence changed while this CSR section was drafted\..*start a new CSR build\.$/);
      expect(failure.get(24)).toBe('Not complete: §10.1 has no saved text. The sections already saved are kept.');
      expect(failure.get(25)).toBeNull();
      // Never the stored message text, a driver error or a path.
      expect(JSON.stringify(res.body)).not.toMatch(/relation|node_modules|Pool\.query|AI drafting fell back/);
    });
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

  it('marks a template row, whose saved text still holds a data placeholder, as template text, not a draft (F2)', async () => {
    // What the builder's template fallback saves for §9.8 when no model drafted it (ai_generated = false).
    const TEMPLATE = '[DATA TO BE INSERTED]\n\nChanges to the conduct of the study after it began: [list each protocol amendment].';
    await pg.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash, ai_generated)
      VALUES (7, 11, 4, '9.8', $1, $2, false)`, [TEMPLATE, sha(TEMPLATE)]);
    try {
      const byNum = new Map((await request(app).get('/api/csr/jobs/4/headings')).body.headings.map((x: { num: string }) => [x.num, x]));
      expect(byNum.get('9.8')).toMatchObject({ state: 'draft', placeholder: true, contentHash: sha(TEMPLATE) });
      expect(byNum.get('12.2')).not.toHaveProperty('placeholder');
      // The same rule refuses it for review on the server (csr-section-review.ts).
      const submit = await request(app).post('/api/csr/jobs/4/sections/9.8/review').set('x-test-user', '6')
        .send({ decision: 'submit', expectedContentHash: sha(TEMPLATE) });
      expect(submit.status).toBe(409);
      expect(submit.body.code).toBe('CSR_SECTION_DATA_PLACEHOLDER');
    } finally {
      await pg.query(`DELETE FROM csr_section_outputs WHERE job_id = 4 AND section_number = '9.8'`);
    }
  });

  it('serves, for a heading, the saved text whose content hash the heading carries (F9: read before approving)', async () => {
    const heading = (await request(app).get('/api/csr/jobs/4/headings')).body.headings.find((x: { num: string }) => x.num === '12.2');
    const read = await request(app).get('/api/csr/jobs/4/sections?sectionNumber=12.2');
    expect(read.status).toBe(200);
    expect(read.body.sections).toHaveLength(1);
    expect(read.body.sections[0]).toMatchObject({ sectionNumber: '12.2', content: DRAFT, contentHash: heading.contentHash });
    expect(sha(read.body.sections[0].content)).toBe(heading.contentHash);
  });

  it('refuses another organization\'s build as not found, never its headings', async () => {
    const res = await request(app).get('/api/csr/jobs/3/headings');
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('headings');
    expect((await request(app).get('/api/csr/jobs/x/headings')).status).toBe(400);
  });
});
