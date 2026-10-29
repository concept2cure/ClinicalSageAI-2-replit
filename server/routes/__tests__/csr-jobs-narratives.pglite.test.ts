/**
 * CSR slice 7, off the request path since 2026-10-30: POST
 * /api/csr/jobs/:jobId/narratives queues the build and returns 202 with its run
 * id; the worker composes the narratives from the approved ADaM bundle the
 * bound run pins, as the user, and lands §14.3.3 and §12.3.2; GET …/status
 * reports queued / running with subjects done of total / complete /
 * incomplete / failed, and GET returns the QC list. A build with no bound run
 * is refused at once; a hand-built (non-ADaM) source and an unreadable ADaM row
 * are recorded on the run by code. The job tables are the real migration in PGlite; the Vault and run
 * readers are stubbed with SYNTHETIC ADaM (support/adam-narrative-synthetic.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown, client: null as unknown, tables: vi.fn(), adam: vi.fn() }));
vi.mock('../../db', () => ({ get db() { return h.database; } }));
// The worker's tenant connection is the test database (one connection, as withTenantConnection gives).
vi.mock('../../db/withTenantConnection.js', () => ({ withTenantConnection: async (_o: unknown, fn: (c: unknown) => Promise<unknown>) => fn(h.client) }));
vi.mock('../../services/csr-builder.js', () => ({ launchCSRBuildAsync: vi.fn() }));
vi.mock('../../services/csr/saved-clinical-tables.js', () => ({ readSavedClinicalTables: h.tables }));
vi.mock('../../services/csr/vault-source-input.js', () => ({ readCsrAdamDatasets: h.adam }));
vi.mock('../../services/csr/project-scope', async (original) => ({
  ...(await original<typeof import('../../services/csr/project-scope')>()),
  requireCsrJobAccess: async () => true,
  resolveCsrScope: async () => ({ projectId: 11 }),
}));
import router from '../csr-jobs';
import { CsrSourceInputError } from '../../services/csr/source-access';
import { adaeRows, narrativeBundle, narrativeDatasets } from '../../services/csr/__tests__/support/adam-narrative-synthetic';

const PROTOCOL = 'SYN-LMN201-PROTOCOL';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const receipt = { documentId: '11111111-2222-4333-8444-000000000099', sha256: 'e'.repeat(64), studyId: 'SYN-NARR', protocolNumber: PROTOCOL };

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5 }; next(); });
app.use('/api/csr/jobs', router);

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  h.database = drizzle(pg);
  h.client = { query: (text: string, params?: unknown[]) => pg.query(text, params as never[]) };
  await pg.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO projects VALUES (11); INSERT INTO users VALUES (5);`);
  await pg.exec(readFileSync(path.resolve(__dirname, '../../../migrations/20260628_csr_job_state.sql'), 'utf8'));
  const bound = JSON.stringify({ studyInfo: { protocolNumber: PROTOCOL }, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'SYN-NARR' } });
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (1, 7, 11, $1, 'complete', $2, 5), (2, 7, 11, $1, 'complete', '{"studyInfo":{}}', 5)`, [PROTOCOL, bound]);
});
afterAll(async () => { await pg?.close(); });
beforeEach(() => {
  h.tables.mockReset().mockResolvedValue({ runId: RUN, programId: PROGRAM, studies: [{ source: receipt, tables: {} }] });
  h.adam.mockReset().mockResolvedValue({ bundle: narrativeBundle(), datasets: narrativeDatasets(80), componentsApproved: true });
});

/** Poll the status the board reads until the run leaves queued/running. */
async function settled(jobId: number) {
  for (let i = 0; i < 400; i++) {
    const res = await request(app).get(`/api/csr/jobs/${jobId}/narratives/status`);
    expect(res.status).toBe(200);
    if (res.body.run && !['queued', 'running'].includes(res.body.run.status)) return res.body.run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('the narrative run did not settle');
}

describe('POST /api/csr/jobs/:jobId/narratives (SYNTHETIC data)', () => {
  it('returns 202 with a run id at once; the worker composes as the user and lands §14.3.3 and §12.3.2', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.tables.mockImplementationOnce(async () => { await gate; return { runId: RUN, programId: PROGRAM, studies: [{ source: receipt, tables: {} }] }; });
    const res = await request(app).post('/api/csr/jobs/1/narratives').send({});
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ runId: expect.any(Number), status: 'queued', resumed: false });
    const during = await request(app).get('/api/csr/jobs/1/narratives/status');
    expect(during.body.run).toMatchObject({ id: res.body.runId, status: expect.stringMatching(/^(queued|running)$/) });
    const again = await request(app).post('/api/csr/jobs/1/narratives').send({});
    expect(again).toMatchObject({ status: 409, body: { code: 'CSR_NARRATIVE_BUILD_IN_PROGRESS', runId: res.body.runId } });
    release();
    const run = await settled(1);
    expect(run).toMatchObject({ status: 'complete', subjectsDone: run.subjectsTotal, error: null,
      result: { status: 'complete', refused: 0, sections: { written: ['14.3.3', '12.3.2'], kept: [] } } });
    expect(run.subjectsTotal).toBeGreaterThan(0);
    expect(h.tables).toHaveBeenCalledWith(h.client, { organizationId: 7, userId: 5, programId: PROGRAM }, RUN);
    expect(h.adam).toHaveBeenCalledWith(expect.objectContaining({ connect: expect.any(Function) }), { organizationId: 7, userId: 5, programId: PROGRAM }, { documentId: receipt.documentId, expectedSha256: receipt.sha256 });
    const { rows } = await pg.query<{ section_number: string; lineage: Record<string, unknown> }>(`SELECT section_number, lineage FROM csr_section_outputs WHERE job_id = 1 ORDER BY section_number`);
    expect(rows.map(r => r.section_number)).toEqual(['12.3.2', '14.3.3']);
    expect(rows[1].lineage).toMatchObject({ composer: 'csr-narrative-job', runId: RUN, manifestSha256: receipt.sha256 });
    const qc = await request(app).get('/api/csr/jobs/1/narratives');
    expect(qc.status).toBe(200);
    expect(qc.body.subjects.length).toBe(run.subjectsTotal);
  });

  it('refuses a build with no bound run at once, and queues nothing', async () => {
    const res = await request(app).post('/api/csr/jobs/2/narratives').send({});
    expect(res).toMatchObject({ status: 409, body: { code: 'CSR_NARRATIVE_RUN_REQUIRED' } });
    expect((await request(app).get('/api/csr/jobs/2/narratives/status')).body).toEqual({ run: null });
  });

  it('records a hand-built source on the run by name, as the Vault reader states it', async () => {
    h.adam.mockRejectedValueOnce(new CsrSourceInputError(422, 'CSR_NARRATIVE_ADAM_REQUIRED', 'Patient narratives are composed from subject-level ADaM data. No narratives were composed.'));
    expect((await request(app).post('/api/csr/jobs/1/narratives').send({})).status).toBe(202);
    expect(await settled(1)).toMatchObject({ status: 'failed', error: { code: 'CSR_NARRATIVE_ADAM_REQUIRED', message: expect.stringMatching(/subject-level ADaM data/) } });
  });

  it('records a refusal by its code when the reader states one without the CSR_ prefix (access lost, Vault bytes unavailable)', async () => {
    h.tables.mockRejectedValueOnce(new CsrSourceInputError(403, 'PROJECT_PERMISSION_DENIED', 'You cannot author this project with your current access.'));
    expect((await request(app).post('/api/csr/jobs/1/narratives').send({})).status).toBe(202);
    expect(await settled(1)).toMatchObject({ status: 'failed', error: { code: 'PROJECT_PERMISSION_DENIED', message: 'You cannot author this project with your current access.' } });
  });

  it('records an ADAE row that does not establish seriousness, naming the row', async () => {
    const adae = adaeRows(30, (row, i, ae) => (i === 3 && ae.term === 'Pneumonia' ? row.map((v, c) => (c === 8 ? null : v)) : row));
    h.adam.mockResolvedValueOnce({ bundle: narrativeBundle(), datasets: narrativeDatasets(30, { adae }), componentsApproved: true });
    expect((await request(app).post('/api/csr/jobs/1/narratives').send({})).status).toBe(202);
    const run = await settled(1);
    expect(run).toMatchObject({ status: 'failed', error: { code: 'CSR_ADAM_VALUE_MISSING' } });
    expect(run.error.issues[0].path).toMatch(/^ADAE\[\d+\]\.AESER$/);
  });
});
