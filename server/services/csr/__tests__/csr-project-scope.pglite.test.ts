import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CSRBuildRequest } from '../../csr-builder';

const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return state.database; } }));
vi.mock('../../csr-builder', () => ({ csrSectionSelectionRefusal: () => null, resolveCSRDraftTargets: () => [], draftCSRSectionWithProvenance: vi.fn(), hasUnresolvedPlaceholders: () => false }));
import { enqueueCSRBuildJob } from '../csr-job-runner';
import { resolveCsrScope } from '../project-scope';

let database: PGlite;
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const FOREIGN = '11111111-2222-4333-8444-000000000021';
const request = { organizationId: 7, userId: 5, studyInfo: { protocolNumber: 'STUDY-11', title: 'Actual study', phase: '1', indication: 'Recorded indication', sponsor: 'Sponsor', investigationalProduct: 'Investigational product', studyDesign: 'Recorded design', primaryEndpoint: 'Recorded endpoint' } } as CSRBuildRequest;
beforeAll(async () => {
  database = new PGlite();
  state.database = drizzle(database);
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer, status text, regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer);
    INSERT INTO client_workspaces VALUES (71,7),(72,7),(81,8);
    INSERT INTO projects (id,organization_id,client_workspace_id,status,regulatory_program_id) VALUES (11,7,71,'active','${PROGRAM}'),(12,7,72,'active',NULL),(13,7,71,'archived',NULL),(21,8,81,'active','${FOREIGN}');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    INSERT INTO organization_users VALUES (7,5,'member');
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE csr_build_jobs (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer,
      study_id text NOT NULL, status text NOT NULL, progress integer NOT NULL,
      sections_to_generate text[], study_info_snapshot jsonb, error jsonb, requested_by integer,
      started_at timestamp, completed_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), source_run_id text GENERATED ALWAYS AS ((study_info_snapshot -> 'evidenceSource' ->> 'runId')) STORED);
  `);
});
beforeEach(async () => { await database.exec('TRUNCATE csr_build_jobs RESTART IDENTITY'); });
afterAll(async () => { await database?.close(); });
const rows = async () => (await database.query('SELECT organization_id,project_id FROM csr_build_jobs')).rows;

describe('CSR scope before persistence', () => {
  it('refuses a foreign or missing project before storing a build job', async () => {
    for (const projectId of [21, 999]) {
      await expect(enqueueCSRBuildJob(request, { organizationId: 7, projectId, requestedBy: 5 })).rejects.toMatchObject({ code: 'CSR_PROJECT_NOT_FOUND' });
    }
    expect(await rows()).toEqual([]);
  });
  it('refuses an archived project and malformed explicitly supplied project', async () => {
    await expect(enqueueCSRBuildJob(request, { organizationId: 7, projectId: 13 })).rejects.toMatchObject({ code: 'CSR_PROJECT_ARCHIVED' });
    await expect(enqueueCSRBuildJob(request, { organizationId: 7, projectId: 0 })).rejects.toMatchObject({ code: 'CSR_SCOPE_INVALID' });
    expect(await rows()).toEqual([]);
  });
  it('rejects a request/context mismatch instead of changing the target or tenant', async () => {
    await expect(enqueueCSRBuildJob({ ...request, projectId: 12 }, { organizationId: 7, projectId: 11 })).rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
    await expect(enqueueCSRBuildJob({ ...request, organizationId: 8 }, { organizationId: 7, projectId: 11 })).rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
    expect(await rows()).toEqual([]);
  });
  it('carries a real request project through when no separate context project was supplied', async () => {
    await enqueueCSRBuildJob({ ...request, projectId: 11 }, { organizationId: 7, requestedBy: 5 });
    expect(await rows()).toEqual([{ organization_id: 7, project_id: 11 }]);
  });
  // 6f57de780 (2026-10-27, "require resolved project anchor for regulated CSR
  // build jobs") deliberately ended organization-wide CSR builds.
  it('refuses a build with no project or program anchor before storing a job', async () => {
    await expect(enqueueCSRBuildJob(request, { organizationId: 7, requestedBy: 5 })).rejects.toMatchObject({ code: 'CSR_PROJECT_REQUIRED', status: 400 });
    expect(await rows()).toEqual([]);
  });
  it('resolves a real program through its own unique anchor and rejects a foreign program or conflicting project', async () => {
    const handle = state.database as Parameters<typeof resolveCsrScope>[0];
    expect(await resolveCsrScope(handle, 7, { programId: PROGRAM }, { actorUserId: 5 })).toMatchObject({ projectId: 11, programId: PROGRAM });
    await expect(resolveCsrScope(handle, 7, { programId: FOREIGN })).rejects.toMatchObject({ code: 'CSR_PROGRAM_NOT_ANCHORED' });
    await expect(resolveCsrScope(handle, 7, { programId: PROGRAM, projectId: 12 })).rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
  });
  it('checks actual workspace membership and keeps archived history readable', async () => {
    const handle = state.database as Parameters<typeof resolveCsrScope>[0];
    expect(await resolveCsrScope(handle, 7, { projectId: 11, clientWorkspaceId: 71 }, { actorUserId: 5 })).toMatchObject({ projectId: 11 });
    await expect(resolveCsrScope(handle, 7, { projectId: 11, clientWorkspaceId: 72 }, { actorUserId: 5 })).rejects.toMatchObject({ code: 'CSR_WORKSPACE_SCOPE_MISMATCH' });
    await expect(resolveCsrScope(handle, 7, { projectId: 11, clientWorkspaceId: 81 })).rejects.toMatchObject({ code: 'CSR_WORKSPACE_NOT_FOUND' });
    expect(await resolveCsrScope(handle, 7, { projectId: 13 }, { forWrite: false, actorUserId: 5 })).toMatchObject({ projectId: 13 });
  });
});
