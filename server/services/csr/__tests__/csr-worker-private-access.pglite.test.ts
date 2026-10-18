import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import express, { type NextFunction, type Request, type Response } from 'express';
import httpRequest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CSRBuildRequest } from '../../csr-builder';

const state = vi.hoisted(() => ({
  database: null as unknown,
  queries: [] as string[],
  draft: vi.fn(),
}));
vi.mock('../../../db', () => ({ get db() { return state.database; } }));
vi.mock('../../csr-builder', async () => {
  const actual = await vi.importActual<typeof import('../../csr-builder')>('../../csr-builder');
  return { ...actual, draftCSRSectionWithProvenance: state.draft };
});

import { enqueueCSRBuildJob, runCSRBuildJob } from '../csr-job-runner';
import { loadCsrInputsForProject } from '../load-csr-inputs-for-project';
import csrJobsRouter from '../../../routes/csr-jobs';

let database: PGlite;
const studyInfo: CSRBuildRequest['studyInfo'] = {
  protocolNumber: 'PRIVATE-STUDY-11', title: 'Private study', phase: '1',
  indication: 'Recorded indication', sponsor: 'Recorded sponsor',
  investigationalProduct: 'Recorded investigational product',
  studyDesign: 'Recorded design', primaryEndpoint: 'Recorded endpoint',
};
function request(userId: number): CSRBuildRequest {
  return { organizationId: 7, userId, projectId: 11, studyInfo, sectionsToGenerate: ['13'] };
}
async function enqueue(userId: number) {
  return enqueueCSRBuildJob(request(userId), { organizationId: 7, projectId: 11, requestedBy: userId });
}
async function readJob(jobId: number) {
  return (await database.query<{ status: string; progress: number; error: unknown }>(
    'SELECT status,progress,error FROM csr_build_jobs WHERE id=$1', [jobId],
  )).rows[0];
}
function appForActor(userId: number) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { id: userId, organizationId: 7, role: 'member' } });
    next();
  });
  app.use('/api/csr/jobs', csrJobsRouter);
  return app;
}
function assertNoSectionReads() {
  expect(state.queries.some(sql => /select\b[\s\S]*\bcsr_section_outputs\b/i.test(sql))).toBe(false);
}
async function assertBlockedWorker(jobId: number, reason = 'project_access_refused') {
  state.queries.length = 0;
  await runCSRBuildJob(jobId);
  expect(await readJob(jobId)).toMatchObject({ status: 'failed', progress: 0 });
  expect((await readJob(jobId)).error).toMatchObject({ reason,
    ...(reason === 'project_access_refused' ? { code: 'CSR_PROJECT_ACCESS_DENIED' } : {}),
  });
  expect(state.draft).not.toHaveBeenCalled();
  // Refusal precedes reading retained CSR section content, not just the AI call.
  assertNoSectionReads();
  expect((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM csr_section_outputs')).rows[0]?.n).toBe(0);
}

beforeAll(async () => {
  database = new PGlite();
  state.database = drizzle(database, { logger: { logQuery(sql) { state.queries.push(sql); } } });
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      status text, regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text,
      persona text, permissions jsonb, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
    CREATE TABLE csr_build_jobs (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer,
      study_id text NOT NULL, status text NOT NULL, progress integer NOT NULL,
      sections_to_generate text[], study_info_snapshot jsonb, error jsonb, requested_by integer,
      started_at timestamp, completed_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    CREATE TABLE csr_section_outputs (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer,
      job_id integer NOT NULL, section_number text NOT NULL, content text NOT NULL, content_hash text NOT NULL,
      ai_generated boolean NOT NULL DEFAULT false, model text, token_cost integer DEFAULT 0,
      lineage jsonb, generated_at timestamp DEFAULT now(), UNIQUE(job_id,section_number));
    INSERT INTO client_workspaces VALUES (71,7);
  `);
});

beforeEach(async () => {
  state.draft.mockReset();
  state.draft.mockResolvedValue({ number: '13', content: 'Recorded discussion awaiting scientific review.',
    source: 'ai', model: 'test-drafter', tokenCost: 0, lineage: null });
  await database.exec(`
    TRUNCATE csr_build_jobs,csr_section_outputs,projects,organization_users,
      project_visibility_settings,project_members,concept2cure_review_assignments,concept2cure_artifacts RESTART IDENTITY;
    INSERT INTO organization_users (organization_id,user_id,role) VALUES
      (7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member');
    INSERT INTO projects VALUES (11,7,71,'active',NULL,6,5,
      '{"projectSharing":{"visibility":"private","members":[{"userId":7,"role":"use","status":"active"}]}}');
    INSERT INTO project_members VALUES (11,7,7,'use','active');
  `);
  state.queries.length = 0;
});
afterAll(async () => { await database?.close(); });

describe('CSR job HTTP reads and cancellation enforce current private-project permission', () => {
  it.each(['', '/sections'])('refuses unrelated organization member access to retained jobs%s before any section read', async suffix => {
    const { jobId } = await enqueue(5);
    await runCSRBuildJob(jobId);
    state.queries.length = 0;

    const response = await httpRequest(appForActor(8)).get(`/api/csr/jobs/${jobId}${suffix}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED' });
    expect(JSON.stringify(response.body)).not.toContain('Recorded discussion');
    assertNoSectionReads();
    expect(await readJob(jobId)).toMatchObject({ status: 'complete', progress: 100 });
  });

  it('refuses cancellation by an unrelated member before section reads or changing the queued job', async () => {
    const { jobId } = await enqueue(5);
    state.queries.length = 0;

    const response = await httpRequest(appForActor(8)).post(`/api/csr/jobs/${jobId}/cancel`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED' });
    assertNoSectionReads();
    expect(await readJob(jobId)).toMatchObject({ status: 'queued', progress: 0, error: null });
    expect(state.draft).not.toHaveBeenCalled();
  });

  it('checks the current share on every retained read after an authorized member is revoked', async () => {
    const { jobId } = await enqueue(7);
    await runCSRBuildJob(jobId);
    const app = appForActor(7);
    expect((await httpRequest(app).get(`/api/csr/jobs/${jobId}/sections`)).status).toBe(200);

    await database.query('UPDATE project_members SET status=$1 WHERE project_id=$2 AND user_id=$3', ['revoked', 11, 7]);
    for (const suffix of ['', '/sections']) {
      state.queries.length = 0;
      const response = await httpRequest(app).get(`/api/csr/jobs/${jobId}${suffix}`);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'CSR_PROJECT_ACCESS_DENIED' });
      assertNoSectionReads();
    }
    expect((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM csr_section_outputs WHERE job_id=$1', [jobId])).rows[0]?.n).toBe(1);
  });

  it('keeps completed status and content readable to an authorized member after project archival', async () => {
    const { jobId } = await enqueue(7);
    await runCSRBuildJob(jobId);
    await database.query('UPDATE projects SET status=$1 WHERE id=$2', ['archived', 11]);
    const app = appForActor(7);

    const status = await httpRequest(app).get(`/api/csr/jobs/${jobId}`);
    const sections = await httpRequest(app).get(`/api/csr/jobs/${jobId}/sections`);

    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ status: 'complete', progress: 100, sectionsComplete: 1, error: null });
    expect(sections.status).toBe(200);
    expect(sections.body.sections).toHaveLength(1);
    expect(sections.body.sections[0]).toMatchObject({ organizationId: 7, projectId: 11, jobId,
      sectionNumber: '13', content: 'Recorded discussion awaiting scientific review.' });
  });

  it('guards submission-summary CSR source reads and allows retained content only to a currently authorized actor', async () => {
    const { jobId } = await enqueue(7);
    await runCSRBuildJob(jobId);
    await database.query('UPDATE projects SET status=$1 WHERE id=$2', ['archived', 11]);
    state.queries.length = 0;

    await expect(loadCsrInputsForProject(7, 11, { actorUserId: 8 })).rejects
      .toMatchObject({ status: 403, code: 'CSR_PROJECT_ACCESS_DENIED' });
    assertNoSectionReads();

    const inputs = await loadCsrInputsForProject(7, 11, { actorUserId: 7 });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ studyId: 'PRIVATE-STUDY-11', protocolNumber: 'PRIVATE-STUDY-11',
      sampleSize: null, csrSections: [{ number: '13', content: 'Recorded discussion awaiting scientific review.' }] });
    expect(state.draft).toHaveBeenCalledOnce();
    expect((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM csr_section_outputs WHERE job_id=$1', [jobId])).rows[0]?.n).toBe(1);
  });
});

describe('CSR worker rechecks current private-project permission', () => {
  it('allows a current organization member who created the private project without an explicit share entry', async () => {
    const { jobId } = await enqueue(5);
    await runCSRBuildJob(jobId);
    expect(await readJob(jobId)).toMatchObject({ status: 'complete', progress: 100, error: null });
    expect(state.draft).toHaveBeenCalledOnce();
    expect(state.draft.mock.calls[0][1]).toMatchObject({ organizationId: 7, projectId: 11, userId: 5 });
    expect((await database.query('SELECT organization_id,project_id,job_id,section_number FROM csr_section_outputs')).rows)
      .toEqual([{ organization_id: 7, project_id: 11, job_id: jobId, section_number: '13' }]);
  });

  it('allows the private project member with current use permission and preserves the requester', async () => {
    const { jobId } = await enqueue(7);
    await runCSRBuildJob(jobId);
    expect(await readJob(jobId)).toMatchObject({ status: 'complete', progress: 100 });
    expect(state.draft).toHaveBeenCalledOnce();
    expect(state.draft.mock.calls[0][2]).toMatchObject({ organizationId: 7, projectId: 11, userId: 7 });
  });

  it('refuses a private project to an unrelated organization member before enqueue', async () => {
    await expect(enqueue(8)).rejects.toMatchObject({ status: 403, code: 'CSR_PROJECT_ACCESS_DENIED' });
    expect((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM csr_build_jobs')).rows[0]?.n).toBe(0);
    expect(state.draft).not.toHaveBeenCalled();
  });

  it('persists failure before source access when the project share is revoked after enqueue', async () => {
    const { jobId } = await enqueue(7);
    // The old JSON snapshot still grants access; normalized current membership
    // must win so a queued job cannot restore a revoked share.
    await database.query('UPDATE project_members SET status=$1 WHERE project_id=$2 AND user_id=$3', ['revoked', 11, 7]);
    await assertBlockedWorker(jobId);
  });

  it('persists failure when the private project creator leaves the organization after enqueue', async () => {
    const { jobId } = await enqueue(5);
    await database.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [7, 5]);
    await assertBlockedWorker(jobId);
  });

  it('uses the current role when an organization administrator is downgraded after enqueue', async () => {
    await database.query('INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,$3)', [7, 9, 'admin']);
    const { jobId } = await enqueue(9);
    await database.query('UPDATE organization_users SET role=$1 WHERE organization_id=$2 AND user_id=$3', ['member', 7, 9]);

    await assertBlockedWorker(jobId);
  });

  it('fails closed and persists failure when current membership cannot be read', async () => {
    const { jobId } = await enqueue(5);
    await database.exec('ALTER TABLE organization_users RENAME TO inaccessible_organization_users');
    try {
      await assertBlockedWorker(jobId, 'project_access_verification_failed');
    } finally {
      await database.exec('ALTER TABLE inaccessible_organization_users RENAME TO organization_users');
    }
  });
});
