/** The retained program must identify the actual numeric CSR target, even when protocols coincide. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CSRBuildRequest } from '../../csr-builder';

const state = vi.hoisted(() => ({ database: null as unknown, duringAdmission: null as null | (() => Promise<void>) }));
vi.mock('../../../db', () => ({ get db() { return state.database; } }));
vi.mock('../project-scope', async original => {
  const actual = await original<typeof import('../project-scope')>();
  return { ...actual, resolveCsrScope: async (...args: Parameters<typeof actual.resolveCsrScope>) => {
    if (state.duringAdmission) await state.duringAdmission();
    return actual.resolveCsrScope(...args);
  } };
});
vi.mock('../../csr-builder', () => ({ csrSectionSelectionRefusal: () => null, resolveCSRDraftTargets: () => [],
  draftCSRSectionWithProvenance: vi.fn(), hasUnresolvedPlaceholders: () => false }));
import { enqueueCSRBuildJob, runCSRBuildJob } from '../csr-job-runner';
import { CsrScopeError } from '../project-scope';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const OTHER = '11111111-2222-4333-8444-000000000012';
const RUN = '11111111-2222-4333-8444-000000000033';
const request: CSRBuildRequest = { organizationId: 7, userId: 5, projectId: 11,
  studyInfo: { protocolNumber: 'SHARED-PROTOCOL', title: 'Recorded study', phase: '1', indication: 'Recorded indication',
    sponsor: 'Sponsor', investigationalProduct: 'Product', studyDesign: 'Recorded design', primaryEndpoint: 'Recorded endpoint' },
  evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'STUDY-1' } };
let database: PGlite;
beforeAll(async () => {
  database = new PGlite(); state.database = drizzle(database);
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      status text, regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}');
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text); INSERT INTO organizations VALUES (7,'active');
    CREATE TABLE users (id integer PRIMARY KEY, status text); INSERT INTO users VALUES (5,'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    INSERT INTO organization_users VALUES (7,5,'member');
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    INSERT INTO projects VALUES (11,7,NULL,'active','${PROGRAM}',5,5,'{}'),(12,7,NULL,'active','${OTHER}',5,5,'{}');
    CREATE TABLE csr_build_jobs (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer,
      study_id text NOT NULL, status text NOT NULL, progress integer NOT NULL, sections_to_generate text[],
      study_info_snapshot jsonb, error jsonb, requested_by integer, started_at timestamp, completed_at timestamp,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(),
      source_run_id text GENERATED ALWAYS AS ((study_info_snapshot -> 'evidenceSource' ->> 'runId')) STORED);
  `);
});
beforeEach(async () => { state.duringAdmission = null; await database.exec('TRUNCATE csr_build_jobs RESTART IDENTITY'); });
afterAll(async () => { await database?.close(); });

describe('CSR retained evidence numeric target', () => {
  it('retains the original program/run/study when it matches the actual target', async () => {
    const result = await enqueueCSRBuildJob(request, { organizationId: 7, projectId: 11, requestedBy: 5 });
    const rows = (await database.query('SELECT project_id,study_id,study_info_snapshot FROM csr_build_jobs WHERE id=$1', [result.jobId])).rows;
    expect(rows).toEqual([{ project_id: 11, study_id: 'SHARED-PROTOCOL', study_info_snapshot: { studyInfo: request.studyInfo, evidenceSource: request.evidenceSource } }]);
  });

  it('refuses a retained source from a different program before creating a job for the same protocol', async () => {
    await expect(enqueueCSRBuildJob({ ...request, evidenceSource: { ...request.evidenceSource!, programId: OTHER } },
      { organizationId: 7, projectId: 11, requestedBy: 5 })).rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
    expect((await database.query('SELECT id FROM csr_build_jobs')).rows).toEqual([]);
  });

  it('refuses a numeric target from another program even when no separate context program was supplied', async () => {
    await expect(enqueueCSRBuildJob({ ...request, projectId: 12 }, { organizationId: 7, projectId: 12, requestedBy: 5 }))
      .rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
    expect((await database.query('SELECT id FROM csr_build_jobs')).rows).toEqual([]);
  });

  it.each(['queued', 'failed'])('a late admission refusal cannot overwrite cancellation of a previously %s job', async status => {
    const { jobId } = await enqueueCSRBuildJob(request, { organizationId: 7, projectId: 11, requestedBy: 5 });
    await database.query('UPDATE csr_build_jobs SET status=$1 WHERE id=$2', [status, jobId]);
    state.duringAdmission = async () => {
      state.duringAdmission = null;
      await database.query("UPDATE csr_build_jobs SET status='cancelled' WHERE id=$1", [jobId]);
      throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'Access was revoked while cancellation completed.');
    };
    await runCSRBuildJob(jobId);
    expect((await database.query('SELECT status,error FROM csr_build_jobs WHERE id=$1', [jobId])).rows)
      .toEqual([{ status: 'cancelled', error: null }]);
  });
});
