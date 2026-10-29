/**
 * GET/POST /api/csr-workflow/pivotal — the sponsor declares, per study, whether
 * it is pivotal (D5, founder's decision of 2026-10-29).
 *
 * The real CSR scope and the real migration, on PGlite. A declaration needs a
 * writing role and a project the person may read that is not archived; every
 * refusal records nothing.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown, role: 'admin' }));
vi.mock('../../db', () => ({ get db() { return h.database; } }));

import csrStudyPivotalRouter from '../csr-study-pivotal';

const PROGRAM = '11111111-2222-4333-8444-000000000011';
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5, role: h.role }; next(); });
app.use('/api/csr-workflow/pivotal', csrStudyPivotalRouter());

let database: PGlite;
const count = async () => (await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM study_pivotal_declarations')).rows[0].n;

beforeAll(async () => {
  database = new PGlite();
  h.database = drizzle(database);
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer, status text, regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}'::jsonb);
    INSERT INTO projects (id,organization_id,client_workspace_id,status,regulatory_program_id) VALUES (11,7,71,'active','${PROGRAM}'),(13,7,71,'archived',NULL),(21,8,81,'active',NULL);
    CREATE FUNCTION public.actor_name(p_user_id integer) RETURNS TABLE (name text, email text) LANGUAGE sql AS $f$ SELECT 'Rena Author'::text, 'rena@example.test'::text WHERE p_user_id = 5 $f$;
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    INSERT INTO organization_users VALUES (7,5,'member');
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE csr_build_jobs (id integer PRIMARY KEY, organization_id integer, project_id integer, study_id text, status text, study_info_snapshot jsonb, created_at timestamp);
    INSERT INTO csr_build_jobs VALUES
      (1,7,11,'LMN-201-PART-B','complete','{"studyInfo":{"protocolNumber":"LMN-201-CDI02","phase":"Phase 2/3","title":"RePreve Part B"}}','2026-10-01'),
      (2,7,13,'ARCHIVED-STUDY','complete','{"studyInfo":{"protocolNumber":"Z-1"}}','2026-10-01'),
      (3,8,21,'FOREIGN-STUDY','complete','{"studyInfo":{"protocolNumber":"F-1"}}','2026-10-01');
  `);
  await database.exec(readFileSync(path.join(process.cwd(), 'migrations/20261029e_study_pivotal_declarations.sql'), 'utf8'));
});
afterAll(async () => { await database?.close(); });
beforeEach(() => { h.role = 'admin'; });

const declare = (body: Record<string, unknown>) => request(app).post('/api/csr-workflow/pivotal').send({
  programId: PROGRAM, studyId: 'LMN-201-PART-B', pivotal: true, reason: 'Agreed with FDA at the Type B meeting', ...body,
});

describe('/api/csr-workflow/pivotal', () => {
  it('lists the project’s studies, undeclared until the sponsor declares, then with the declaration', async () => {
    const before = await request(app).get(`/api/csr-workflow/pivotal?programId=${PROGRAM}`);
    expect(before.status).toBe(200);
    expect(before.body.studies).toEqual([{ studyId: 'LMN-201-PART-B', protocolNumber: 'LMN-201-CDI02', title: 'RePreve Part B', phase: 'Phase 2/3', declaration: null }]);
    const made = await declare({});
    expect(made.status).toBe(201);
    expect(made.body.declaration).toMatchObject({ studyId: 'LMN-201-PART-B', pivotal: true, reason: 'Agreed with FDA at the Type B meeting', declaredBy: 5 });
    const after = await request(app).get('/api/csr-workflow/pivotal?projectId=11');
    expect(after.body.studies[0].declaration).toMatchObject({ pivotal: true, declaredBy: 5, declaredByName: 'Rena Author' });
  });

  it.each([
    ['a role that may not write', () => { h.role = 'viewer'; }, {}, 403, undefined],
    ['an archived project', () => undefined, { programId: undefined, projectId: 13, studyId: 'ARCHIVED-STUDY' }, 409, 'CSR_PROJECT_ARCHIVED'],
    ['another organization’s project', () => undefined, { programId: undefined, projectId: 21, studyId: 'FOREIGN-STUDY' }, 404, 'CSR_PROJECT_NOT_FOUND'],
    ['a study the project has no CSR for', () => undefined, { studyId: 'NOT-A-STUDY' }, 404, 'STUDY_NOT_IN_PROJECT'],
    ['a reason under eight characters', () => undefined, { reason: 'Agreed' }, 400, 'PIVOTAL_REASON_REQUIRED'],
    ['no choice', () => undefined, { pivotal: undefined }, 400, 'PIVOTAL_CHOICE_REQUIRED'],
    ['no project', () => undefined, { programId: undefined }, 400, 'PROJECT_REQUIRED'],
  ])('refuses %s, and records nothing', async (_label, arrange, body, status, code) => {
    arrange();
    const before = await count();
    const res = await declare(body);
    expect(res.status).toBe(status);
    if (code) expect(res.body.code).toBe(code);
    expect(await count()).toBe(before);
  });

  it('a reader without a writing role may still see the declarations', async () => {
    h.role = 'viewer';
    const res = await request(app).get(`/api/csr-workflow/pivotal?programId=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(res.body.studies).toHaveLength(1);
  });
});
