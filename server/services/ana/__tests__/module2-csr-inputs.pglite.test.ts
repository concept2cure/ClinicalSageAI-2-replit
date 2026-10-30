/**
 * AnA's 2.5 and 2.7 composers read the open project's completed CSRs as the
 * person asking (3b Slice 1, 2026-10-26).
 *
 * loadModule2CsrInputs called loadCsrInputsForProject with no actor, and the CSR
 * scope refuses a read it cannot attribute (readCsrProjectActor, 403). It also
 * read only ctx.projectId, which the v2 shell leaves null: the open project
 * arrives as a regulatory_programs uuid in ctx.projectRef. So for every real
 * project the composers either threw or said no project was open, and the tests
 * that mocked the loader never saw it. Here the loader and the scope run against
 * a database.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return h.database; } }));

import { loadModule2CsrInputs } from '../module2-csr-inputs';

const PROGRAM = '7d1c2f0e-5b7a-4c1e-9a43-0f2b6d1e8c55';
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  h.database = drizzle(database);
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer, status text,
      owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}'::jsonb, regulatory_program_id text);
    INSERT INTO projects VALUES (11,7,NULL,'active',NULL,NULL,'{}','${PROGRAM}'), (12,7,NULL,'active',NULL,NULL,'{}',NULL);
    CREATE TABLE users (id integer PRIMARY KEY,status text); INSERT INTO users VALUES (5,'active');
    CREATE TABLE organizations (id integer PRIMARY KEY,status text); INSERT INTO organizations VALUES (7,'active'),(8,'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    INSERT INTO organization_users VALUES (7,5,'member');
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE client_workspaces (id integer, organization_id integer);
    CREATE TABLE csr_build_jobs (id integer PRIMARY KEY, organization_id integer, project_id integer,
      study_id text, status text, study_info_snapshot jsonb, created_at timestamp, source_run_id text GENERATED ALWAYS AS ((study_info_snapshot -> 'evidenceSource' ->> 'runId')) STORED);
    CREATE TABLE csr_section_outputs (id serial PRIMARY KEY, organization_id integer, project_id integer, job_id integer,
      section_number text, content text, content_hash text, ai_generated boolean, model text, token_cost integer, lineage jsonb,
      generated_at timestamp DEFAULT now(), review_status text NOT NULL DEFAULT 'draft', reviewer_id integer, review_decided_at timestamptz, review_reason text, reviewed_content_hash text);
    INSERT INTO csr_build_jobs VALUES
      (1,7,11,'STUDY-A','complete','{"studyInfo":{"protocolNumber":"BX-301","phase":"3","sampleSize":600}}','2026-10-01');
  `);
  // The CSR loader reads each study's pivotal declaration (2026-10-29).
  await database.exec(readFileSync(path.join(process.cwd(), 'migrations/20261029e_study_pivotal_declarations.sql'), 'utf8'));
});
afterAll(async () => { await database?.close(); });

const ORG = 7;

describe('loadModule2CsrInputs reads the open project as the person asking', () => {
  it('a v2 project (a program uuid in projectRef) is composed from', async () => {
    const out = await loadModule2CsrInputs({}, { organizationId: ORG, userId: 5, projectId: null, projectRef: PROGRAM }, '2.5');
    expect(out).toMatchObject({ ok: true, projectId: 11 });
  });

  it('a numeric open project is composed from, with the actor passed to the CSR scope', async () => {
    const out = await loadModule2CsrInputs({}, { organizationId: ORG, userId: 5, projectId: 11 }, '2.7');
    expect(out).toMatchObject({ ok: true, projectId: 11 });
    if (out.ok) expect(out.csrs).toHaveLength(1);
  });

  it('another project named while one is open is refused, never read', async () => {
    const out = await loadModule2CsrInputs({ project_id: 12 }, { organizationId: ORG, userId: 5, projectId: 11 }, '2.5');
    expect(out).toMatchObject({ ok: false, status: 'cross_project' });
  });

  it('a project with no completed CSR says so', async () => {
    const out = await loadModule2CsrInputs({}, { organizationId: ORG, userId: 5, projectId: 12 }, '2.7');
    expect(out).toMatchObject({ ok: false, status: 'needs_data', projectId: 12 });
  });

  it('a person who is not a member is refused as such, not as a missing project and not by a throw', async () => {
    const out = await loadModule2CsrInputs({}, { organizationId: ORG, userId: 99, projectId: 11 }, '2.5');
    expect(out).toMatchObject({ ok: false, status: 'access_denied', code: 'CSR_PROJECT_ACCESS_DENIED' });
  });

  it('no open project and none named asks for one', async () => {
    const out = await loadModule2CsrInputs({}, { organizationId: ORG, userId: 5 }, '2.5');
    expect(out).toMatchObject({ ok: false, status: 'needs_project' });
  });
});
