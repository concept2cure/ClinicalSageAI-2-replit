/**
 * Reach of CSR assembly (2026-10-30): the jobs router serves the assembly
 * routes. POST queues (202) and starts the worker off the request; GET reads
 * the newest assembly; placement goes through the canonical leaf writer and is
 * refused for a frozen sequence before anything is written. The job tables are
 * the real migration in PGlite; the worker start and the submission service
 * are recorded stubs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown, start: vi.fn(), getSequence: vi.fn(), upsertLeaf: vi.fn(), removeLeaf: vi.fn(),
  // The job's current fingerprint, as the import computes it (workflow-source-import.ts); placement compares the assembly's to it.
  source: vi.fn(async () => ({ fingerprint: 'f'.repeat(64) })) }));
vi.mock('../../db', () => ({ get db() { return h.database; } }));
vi.mock('../../services/csr-builder.js', () => ({ launchCSRBuildAsync: vi.fn() }));
vi.mock('../../services/csr/csr-assembly-run.js', async (original) => ({
  ...(await original<typeof import('../../services/csr/csr-assembly-run.js')>()), startCsrAssembly: h.start,
}));
vi.mock('../../services/submission-service/submission-service.js', () => ({ getSequence: h.getSequence, upsertLeaf: h.upsertLeaf, removeLeaf: h.removeLeaf }));
vi.mock('../../services/authoring/workflow-source-import.js', () => ({ materializeCsrAssemblySource: h.source }));
vi.mock('../../services/csr/project-scope', async (original) => ({
  ...(await original<typeof import('../../services/csr/project-scope')>()),
  requireCsrJobAccess: async (_d: unknown, _o: number, jobId: number) => jobId !== 99,
  resolveCsrScope: async () => ({ projectId: 11 }),
}));
import router from '../csr-jobs';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5 }; next(); });
app.use('/api/csr/jobs', router);

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  h.database = drizzle(pg);
  await pg.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO projects VALUES (11); INSERT INTO users VALUES (5);
    CREATE TABLE submissions (id integer PRIMARY KEY, organization_id integer, program_id uuid, title text, deleted_at timestamptz);
    INSERT INTO submissions VALUES (3, 7, '${PROGRAM}', 'LMN-201 IND', NULL);
    CREATE TABLE ectd_sequences (id integer PRIMARY KEY, organization_id integer, submission_id integer, sequence_number text, deleted_at timestamptz);
    CREATE TABLE submission_leaves (id integer PRIMARY KEY, organization_id integer, sequence_id integer, section_code text, title text, lifecycle_op text,
      study_id text, stf_file_tag text, parent_leaf_id integer, document_table text, document_id integer, deleted_at timestamptz);
    INSERT INTO ectd_sequences VALUES (80, 7, 3, '0003', NULL), (90, 7, 3, '0004', NULL);`);
  await pg.exec(readFileSync(path.resolve(__dirname, '../../../migrations/20260628_csr_job_state.sql'), 'utf8'));
  const bound = JSON.stringify({ studyInfo: { protocolNumber: 'SYN-LMN201-B' }, evidenceSource: { programId: PROGRAM, runId: 'run-41', studyId: 'SYN-LMN201-B' } });
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (41, 7, 11, 'SYN-LMN201-B', 'complete', $1, 5)`, [bound]);
});
afterAll(async () => { await pg?.close(); });

it('queues an assembly off the request, records the declarations, and reads it back', async () => {
  const res = await request(app).post('/api/csr/jobs/41/assembly').send({ notApplicable: { '16.2.2': 'No protocol deviations were recorded.' } });
  expect(res.status).toBe(202);
  expect(res.body).toMatchObject({ status: 'queued' });
  expect(h.start).toHaveBeenCalledWith(res.body.assemblyId, 7);
  const read = await request(app).get('/api/csr/jobs/41/assembly');
  expect(read.status).toBe(200);
  expect(read.body.assembly).toMatchObject({ id: res.body.assemblyId, status: 'queued', notApplicable: { '16.2.2': { reason: 'No protocol deviations were recorded.', declaredBy: 5 } } });
  const again = await request(app).post('/api/csr/jobs/41/assembly').send({});
  expect(again.status).toBe(409);
  expect(again.body.code).toBe('CSR_ASSEMBLY_IN_PROGRESS');
});

it('refuses a short declaration and an unreachable job by status, not as an empty result', async () => {
  const short = await request(app).post('/api/csr/jobs/41/assembly').send({ notApplicable: { '16.1.1': 'n/a' } });
  expect(short.status).toBe(400);
  expect(short.body.code).toBe('CSR_ASSEMBLY_REASON_REQUIRED');
  expect((await request(app).get('/api/csr/jobs/99/assembly')).status).toBe(404);
});

it('refuses to place into a frozen sequence before the leaf writer is called', async () => {
  const result = { status: 'complete', leaves: [{ appendix: 'body', title: 'Body', fileName: 'csr-body.pdf', fileTag: 'study-report-body', origin: 'generated', ctdSection: '5.3.5.1',
    studyId: 'SYN-LMN201-B', pages: 3, bytes: 10, sha256: 'a'.repeat(64), md5: 'b'.repeat(32), renderedLeafFileId: 1 }], missing: [], notApplicable: [], bodyGaps: [],
    unresolvedReferences: [], placeholderSections: [], jobFingerprint: 'f'.repeat(64), structure: { ok: true, findings: [], bodyOutlineDepth: 4, linksChecked: 1 }, listings: [], stfWarnings: [], pdfa: '' };
  const { rows } = await pg.query<{ id: number }>(`UPDATE csr_assembly_runs SET status = 'assembled', progress = 100, result = $1::jsonb WHERE job_id = 41 RETURNING id`, [JSON.stringify(result)]);
  h.getSequence.mockResolvedValue({ id: 90, submissionId: 3, sequenceNumber: '0004', status: 'frozen', dispatchStatus: null });
  const res = await request(app).post(`/api/csr/jobs/41/assembly/${rows[0].id}/place`).send({ sequenceId: 90, reason: 'CSR for the Part B data cut' });
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ code: 'CSR_PLACEMENT_SEQUENCE_LOCKED', error: expect.stringMatching(/Sequence 0004 is frozen.*Nothing was placed\./) });
  expect(h.upsertLeaf).not.toHaveBeenCalled();

  h.getSequence.mockResolvedValue({ id: 90, submissionId: 3, sequenceNumber: '0004', status: 'draft', dispatchStatus: null });
  h.upsertLeaf.mockResolvedValue({ id: 501 });
  const placed = await request(app).post(`/api/csr/jobs/41/assembly/${rows[0].id}/place`).send({ sequenceId: 90, reason: 'CSR for the Part B data cut' });
  expect(placed.status).toBe(200);
  expect(h.upsertLeaf).toHaveBeenCalledWith(expect.objectContaining({ sequenceId: 90, sectionCode: 'm5.3.5.1', documentTable: 'rendered_leaf_files', documentId: 1,
    stfFileTag: 'study-report-body', studyId: 'SYN-LMN201-B' }), { organizationId: 7, userId: 5 });
  expect(placed.body.placement).toMatchObject({ state: 'placed', leaves: [{ appendix: 'body', leafId: 501 }] });
});

it('refuses to place an assembly whose body cites a table or listing it does not contain, or a build that is not complete', async () => {
  h.upsertLeaf.mockClear();
  h.getSequence.mockResolvedValue({ id: 90, submissionId: 3, sequenceNumber: '0004', status: 'draft', dispatchStatus: null });
  const leaf = { appendix: 'body', title: 'Body', fileName: 'csr-body.pdf', fileTag: 'study-report-body', origin: 'generated', ctdSection: '5.3.5.1',
    studyId: 'SYN-LMN201-B', pages: 3, bytes: 10, sha256: 'a'.repeat(64), md5: 'b'.repeat(32), renderedLeafFileId: 1 };
  const result = (unresolvedReferences: unknown[]) => JSON.stringify({ status: unresolvedReferences.length ? 'incomplete' : 'complete', leaves: [leaf], missing: [], notApplicable: [], bodyGaps: [],
    unresolvedReferences, placeholderSections: [], jobFingerprint: 'f'.repeat(64), structure: { ok: true, findings: [], bodyOutlineDepth: 4, linksChecked: 1 }, listings: [], stfWarnings: [], pdfa: '' });
  const unlinked = await pg.query<{ id: number }>(`INSERT INTO csr_assembly_runs (organization_id, job_id, requested_by, status, progress, result)
    VALUES (7, 41, 5, 'assembled', 100, $1::jsonb) RETURNING id`, [result([{ reference: 'Table 14.3.9', number: '14.3.9', section: '12.2' }])]);
  const res = await request(app).post(`/api/csr/jobs/41/assembly/${unlinked.rows[0].id}/place`).send({ sequenceId: 90, reason: 'CSR for the Part B data cut' });
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ code: 'CSR_PLACEMENT_UNRESOLVED_REFERENCE', error: expect.stringMatching(/Table 14\.3\.9.*Nothing was placed\./) });

  const bound = JSON.stringify({ studyInfo: { protocolNumber: 'SYN-LMN201-B' }, evidenceSource: { programId: PROGRAM, runId: 'run-43', studyId: 'SYN-LMN201-B' } });
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (43, 7, 11, 'SYN-LMN201-B', 'drafting', $1, 5)`, [bound]);
  const partial = await pg.query<{ id: number }>(`INSERT INTO csr_assembly_runs (organization_id, job_id, requested_by, status, progress, result)
    VALUES (7, 43, 5, 'assembled', 100, $1::jsonb) RETURNING id`, [result([])]);
  const drafting = await request(app).post(`/api/csr/jobs/43/assembly/${partial.rows[0].id}/place`).send({ sequenceId: 90, reason: 'CSR for the Part B data cut' });
  expect(drafting.status).toBe(409);
  expect(drafting.body).toMatchObject({ code: 'CSR_PLACEMENT_BUILD_INCOMPLETE', error: expect.stringMatching(/drafting.*Nothing was placed\./) });
  expect(h.upsertLeaf).not.toHaveBeenCalled();
});

it('shows and places a revised body as a replace of the study\'s earlier body, and refuses to withdraw a placement that is not partial (SYNTHETIC)', async () => {
  h.upsertLeaf.mockReset().mockResolvedValue({ id: 801 });
  h.getSequence.mockResolvedValue({ id: 90, submissionId: 3, sequenceNumber: '0004', status: 'draft', dispatchStatus: null });
  const leaf = { appendix: 'body', title: 'Body', fileName: 'csr-body.pdf', fileTag: 'study-report-body', origin: 'generated', ctdSection: '5.3.5.1',
    studyId: 'SYN-LMN201-B', pages: 3, bytes: 10, sha256: 'a'.repeat(64), md5: 'b'.repeat(32), renderedLeafFileId: 2 };
  const result = JSON.stringify({ status: 'complete', studyId: 'SYN-LMN201-B', leaves: [leaf], missing: [], notApplicable: [], bodyGaps: [], unresolvedReferences: [], placeholderSections: [],
    jobFingerprint: 'f'.repeat(64), structure: { ok: true, findings: [], bodyOutlineDepth: 4, linksChecked: 1 }, listings: [], stfWarnings: [], pdfa: '' });
  // Sequence 0003 retains the old role spelling; the new assembly replaces it without relabelling history.
  const earlierResult = JSON.stringify({ ...JSON.parse(result), leaves: [{ ...leaf, fileTag: 'study-report', renderedLeafFileId: 9 }] });
  await pg.exec(`INSERT INTO submission_leaves VALUES (700, 7, 80, 'm5.3.5.1', 'Earlier body', 'new', 'SYN-LMN201-B', 'study-report', NULL, 'rendered_leaf_files', 9, NULL);`);
  await pg.query(`INSERT INTO csr_assembly_runs (organization_id, job_id, requested_by, status, progress, result, placement)
    VALUES (7, 41, 5, 'assembled', 100, $1::jsonb, '{"state":"placed","sequenceId":80,"sequenceNumber":"0003","leaves":[{"appendix":"body","leafId":700,"fileName":"csr-body.pdf"}]}'::jsonb)`, [earlierResult]);
  const revised = await pg.query<{ id: number }>(`INSERT INTO csr_assembly_runs (organization_id, job_id, requested_by, status, progress, result)
    VALUES (7, 41, 5, 'assembled', 100, $1::jsonb) RETURNING id`, [result]);
  const id = revised.rows[0].id;

  const preview = await request(app).get(`/api/csr/jobs/41/assembly/${id}/lifecycle?sequenceId=90`);
  expect(preview.status).toBe(200);
  expect(preview.body.lifecycle).toMatchObject({ undecided: [], leaves: [{ appendix: 'body', operation: 'replace', parent: { leafId: 700, sequenceNumber: '0003' } }] });

  const placed = await request(app).post(`/api/csr/jobs/41/assembly/${id}/place`).send({ sequenceId: 90, reason: 'Revised CSR for the Part B data cut' });
  expect(placed.status).toBe(200);
  expect(h.upsertLeaf).toHaveBeenCalledWith(expect.objectContaining({ lifecycleOp: 'replace', parentLeafId: 700, documentId: 2 }), { organizationId: 7, userId: 5 });

  const withdraw = await request(app).post(`/api/csr/jobs/41/assembly/${id}/withdraw-placement`).send({ reason: 'Withdraw the placed CSR files.' });
  expect(withdraw.status).toBe(409);
  expect(withdraw.body).toMatchObject({ code: 'CSR_PLACEMENT_WITHDRAW_NOT_PARTIAL', error: expect.stringMatching(/placed in full in sequence 0004.*Nothing was withdrawn\./) });
  expect(h.removeLeaf).not.toHaveBeenCalled();
});
