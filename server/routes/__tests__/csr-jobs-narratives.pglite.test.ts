/**
 * CSR slice 7: POST /api/csr/jobs/:jobId/narratives composes a build's patient
 * safety narratives from the approved ADaM bundle its bound run pins, lands
 * §14.3.3 and §12.3.2, and GET returns the QC list. A build with no bound run,
 * a hand-built (non-ADaM) source and an unreadable ADaM row are refused by
 * name. The job tables are the real migration in PGlite; the Vault and run
 * readers are stubbed with SYNTHETIC ADaM (support/adam-narrative-synthetic.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown, tables: vi.fn(), adam: vi.fn() }));
vi.mock('../../db', () => ({ get db() { return h.database; } }));
vi.mock('../../db/requestDb.js', () => ({ requestPgClient: () => ({}), requestConnectable: () => ({}) }));
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

describe('POST /api/csr/jobs/:jobId/narratives (SYNTHETIC data)', () => {
  it('composes from the bound run’s ADaM bundle, as the user, and lands §14.3.3 and §12.3.2', async () => {
    const res = await request(app).post('/api/csr/jobs/1/narratives').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'complete', refused: 0, sections: { written: ['14.3.3', '12.3.2'], kept: [] } });
    expect(h.tables).toHaveBeenCalledWith({}, { organizationId: 7, userId: 5, programId: PROGRAM }, RUN);
    expect(h.adam).toHaveBeenCalledWith({}, { organizationId: 7, userId: 5, programId: PROGRAM }, { documentId: receipt.documentId, expectedSha256: receipt.sha256 });
    const { rows } = await pg.query<{ section_number: string; lineage: Record<string, unknown> }>(`SELECT section_number, lineage FROM csr_section_outputs WHERE job_id = 1 ORDER BY section_number`);
    expect(rows.map(r => r.section_number)).toEqual(['12.3.2', '14.3.3']);
    expect(rows[1].lineage).toMatchObject({ composer: 'csr-narrative-job', runId: RUN, manifestSha256: receipt.sha256 });
    const qc = await request(app).get('/api/csr/jobs/1/narratives');
    expect(qc.status).toBe(200);
    expect(qc.body.subjects.length).toBe(res.body.selected);
  });

  it('refuses a build with no bound run', async () => {
    const res = await request(app).post('/api/csr/jobs/2/narratives').send({});
    expect(res).toMatchObject({ status: 409, body: { code: 'CSR_NARRATIVE_RUN_REQUIRED' } });
  });

  it('refuses a hand-built source by name, as the Vault reader states it', async () => {
    h.adam.mockRejectedValueOnce(new CsrSourceInputError(422, 'CSR_NARRATIVE_ADAM_REQUIRED', 'Patient narratives are composed from subject-level ADaM data. No narratives were composed.'));
    const res = await request(app).post('/api/csr/jobs/1/narratives').send({});
    expect(res).toMatchObject({ status: 422, body: { code: 'CSR_NARRATIVE_ADAM_REQUIRED' } });
  });

  it('refuses an ADAE row that does not establish seriousness, naming the row', async () => {
    const adae = adaeRows(30, (row, i, ae) => (i === 3 && ae.term === 'Pneumonia' ? row.map((v, c) => (c === 8 ? null : v)) : row));
    h.adam.mockResolvedValueOnce({ bundle: narrativeBundle(), datasets: narrativeDatasets(30, { adae }), componentsApproved: true });
    const res = await request(app).post('/api/csr/jobs/1/narratives').send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CSR_ADAM_VALUE_MISSING');
    expect(res.body.issues[0].path).toMatch(/^ADAE\[\d+\]\.AESER$/);
  });
});
