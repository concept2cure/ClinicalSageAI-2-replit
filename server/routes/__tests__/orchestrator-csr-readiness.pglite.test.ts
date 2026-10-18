import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const m = vi.hoisted(() => ({ query: vi.fn(), start: vi.fn(), access: vi.fn(), cmc: vi.fn(), csr: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: m.query }, getPool: () => ({ query: m.query }), db: {} }));
vi.mock('../../services/submission-package-orchestrator.js', () => ({ runOrchestrator: m.start, loadSubmissionFkBySubmissionIdText: vi.fn(), getRun: vi.fn(), getRunAudit: vi.fn(), regenerateAffected: vi.fn() }));
vi.mock('../../services/submission-orchestrator-continuation.js', () => ({ continueOrchestratorRun: vi.fn(), requireOrchestratorProgramAccess: m.access, OrchestratorContinuationRefusal: class extends Error {} }));
vi.mock('../../services/cmc/submission-spine.js', () => ({ resolveSubmissionSpine: vi.fn(async () => ({ submissionId: 91, match: 'program', applicationType: 'ind', sequence: { id: 4, sequenceNumber: '0002', region: 'FDA' } })), resolveSequenceSpine: vi.fn() }));
vi.mock('../../services/ectd/package-identity.js', () => ({ readRecordedPackageIdentity: vi.fn(async () => ({ applicationNumber: 'IND-123' })), packageIdentityRefusal: vi.fn(() => null) }));
vi.mock('../../services/cmc/load-approved-cmc-sources-for-project.js', () => ({ loadApprovedCmcSourcesForProject: m.cmc }));
vi.mock('../../services/csr/load-csr-inputs-for-project.js', () => ({ loadCsrInputsForProject: m.csr }));
vi.mock('../../services/auditService.js', () => ({ default: { logAction: vi.fn() } }));
import router from '../submission-orchestrator';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const EMPTY = '11111111-2222-4333-8444-000000000012';
const FOREIGN = '11111111-2222-4333-8444-000000000021';
let database: PGlite;
function app(actor: { id: number; role: string; organizationId: number } | null = { id: 5, role: 'manager', organizationId: 7 }) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => { (req as any).user = actor; next(); });
  a.use('/api/submission-orchestrator', router); return a;
}
const readiness = (a = app(), programId = PROGRAM) => request(a).get(`/api/submission-orchestrator/csr/readiness?programId=${programId}`);
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamp);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE csr_build_jobs (id integer PRIMARY KEY, organization_id integer, project_id integer, study_id text, status text);
  `);
});
beforeEach(async () => {
  vi.clearAllMocks();
  m.query.mockImplementation((sql: string, params?: unknown[]) => database.query(sql, params));
  m.access.mockResolvedValue({ id: PROGRAM, program_type: 'ind', name: 'Recorded trial' });
  m.start.mockResolvedValue({ run: { runId: 'run-1', status: 'awaiting-signature', steps: [] } });
  m.cmc.mockResolvedValue({ gate: 'open', sources: [] }); m.csr.mockResolvedValue([{ studyId: 'COMPLETED' }]);
  await database.exec(`
    TRUNCATE organizations,users,organization_users,regulatory_programs,projects,project_visibility_settings,project_members,concept2cure_review_assignments,concept2cure_artifacts,csr_build_jobs;
    INSERT INTO organizations VALUES (7,'active'),(8,'active'); INSERT INTO users VALUES (5,'active'),(6,'active');
    INSERT INTO organization_users VALUES (7,5,'manager'),(7,6,'viewer');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL),('${EMPTY}',7,NULL),('${FOREIGN}',8,NULL);
    INSERT INTO projects (id,organization_id,regulatory_program_id,owner_id,created_by_id) VALUES (11,7,'${PROGRAM}',5,5),(21,8,'${FOREIGN}',5,5);
    INSERT INTO csr_build_jobs VALUES (1,7,11,'STUDY-A','complete'),(2,7,11,'STUDY-A','complete'),
      (3,7,11,'STUDY-A','failed'),(4,7,11,'STUDY-B','complete'),(5,7,11,'STUDY-C','needs_data'),
      (6,7,11,'STUDY-D','generating'),(7,8,21,'FOREIGN-STUDY','complete'),(8,7,NULL,'UNFILED','complete');
  `);
});
afterAll(async () => { await database?.close(); });

describe('program-scoped CSR source readiness', () => {
  it('counts completed studies once within the actual anchor and keeps unlinked tabulation unknown', async () => {
    const res = await readiness();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ programId: PROGRAM, projectLinked: true, completedSummaryCount: 2,
      rawTabulation: { status: 'not-linked', studyCount: null }, narrative: { available: false, code: 'CSR_NARRATIVE_INPUTS_REQUIRED' } });
    expect(res.body.requiredInputs.studyData.required).toEqual(['studyId', 'protocolNumber', 'treatmentArms', 'disposition', 'demographics', 'efficacy', 'adverseEvents']);
    expect(res.body.requiredInputs.studyInfo.required).toContain('sponsor');
    expect(res.body.recovery.map((r: { appId: string }) => r.appId)).toEqual(['vault', 'authoring']);
    expect(JSON.stringify(res.body)).not.toContain('FOREIGN-STUDY'); expect(JSON.stringify(res.body)).not.toContain('STUDY-A');
    expect(m.start).not.toHaveBeenCalled(); expect(m.csr).not.toHaveBeenCalled();
    expect(m.query.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
  });
  it('returns null rather than zero or an organization-wide count for a program without a unique anchor', async () => {
    let res = await readiness(app(), EMPTY);
    expect(res.status).toBe(200); expect(res.body).toMatchObject({ projectLinked: false, completedSummaryCount: null });
    await database.exec(`INSERT INTO projects (id,organization_id,regulatory_program_id) VALUES (12,7,'${PROGRAM}')`);
    res = await readiness();
    expect(res.status).toBe(200); expect(res.body.completedSummaryCount).toBeNull();
  });
  it('reports an actual zero for an accessible anchored program without a completed study', async () => {
    await database.exec("DELETE FROM csr_build_jobs WHERE organization_id=7 AND project_id=11 AND status='complete'");
    const res = await readiness();
    expect(res.status).toBe(200); expect(res.body).toMatchObject({ projectLinked: true, completedSummaryCount: 0, narrative: { available: false } });
    expect(res.body.rawTabulation.studyCount).toBeNull();
  });
  it('refuses foreign, missing and malformed program scopes before counting summaries', async () => {
    expect((await readiness(app(), FOREIGN)).status).toBe(404);
    expect((await readiness(app(), '11111111-2222-4333-8444-000000000099')).status).toBe(404);
    expect((await readiness(app(), '11')).status).toBe(400);
    expect(m.query.mock.calls.some(([sql]) => sql.includes('FROM csr_build_jobs'))).toBe(false);
  });
  it('uses fresh membership and canonical private-project policy, including a read-only share', async () => {
    await database.exec("UPDATE projects SET settings = '{\"projectSharing\":{\"visibility\":\"private\",\"members\":[]}}' WHERE id=11");
    const viewer = app({ id: 6, role: 'manager', organizationId: 7 }); // stale session role cannot override the persisted viewer
    expect((await readiness(viewer)).status).toBe(403);
    await database.exec("INSERT INTO project_members VALUES (11,7,6,'use','active')");
    expect((await readiness(viewer)).status).toBe(200);
    await database.exec("UPDATE project_members SET status='revoked' WHERE user_id=6");
    expect((await readiness(viewer)).status).toBe(403);
    await database.exec('DELETE FROM organization_users WHERE user_id=6');
    expect((await readiness(viewer)).status).toBe(403);
  });
  it('refuses inactive principals and anonymous requests', async () => {
    expect((await readiness(app(null))).status).toBe(401);
    await database.exec("UPDATE users SET status='disabled' WHERE id=5");
    expect((await readiness()).status).toBe(403);
  });
  it('refuses a deleted program and inactive organization rather than disclosing retained counts', async () => {
    await database.exec(`UPDATE regulatory_programs SET deleted_at=now() WHERE id='${PROGRAM}'`);
    expect((await readiness()).status).toBe(404);
    await database.exec('UPDATE regulatory_programs SET deleted_at=NULL');
    await database.exec("UPDATE organizations SET status='inactive' WHERE id=7");
    expect((await readiness()).status).toBe(403);
  });
  it('does not substitute an empty summary count when the store cannot be read', async () => {
    m.query.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM csr_build_jobs')) throw new Error('synthetic unavailable source store');
      return database.query(sql, params);
    });
    const res = await readiness(); expect(res.status).toBe(500); expect(res.body.completedSummaryCount).toBeUndefined();
  });
  it('refuses first-study narrative opt-in even when old completed summaries are reusable', async () => {
    const res = await request(app()).post('/api/submission-orchestrator/runs/for-program').send({ programId: PROGRAM, enableCSRNarrative: true });
    expect(res.status).toBe(409); expect(res.body.error).toBe('CSR_NARRATIVE_INPUTS_REQUIRED');
    expect(m.start).not.toHaveBeenCalled(); expect(m.csr).not.toHaveBeenCalled(); expect(m.cmc).not.toHaveBeenCalled();
  });
  it('keeps default package composition over completed accessible summaries without creating another narrative job', async () => {
    const res = await request(app()).post('/api/submission-orchestrator/runs/for-program').send({ programId: PROGRAM });
    expect(res.status).toBe(200);
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ csrInputs: [{ studyId: 'COMPLETED' }], clinicalStudyData: [], enableCSRNarrative: undefined }));
  });
});
