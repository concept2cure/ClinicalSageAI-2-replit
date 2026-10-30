import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ database: null as unknown, sections: vi.fn(async () => [{ sectionNumber: '11' }]) }));
vi.mock('../../db', () => ({ get db() { return h.database; } }));
vi.mock('../../services/csr-builder.js', () => ({ getICHE3Structure: () => [{ number: '11', title: 'Efficacy Results', required: true }],
  flattenICHE3Sections: (sections: Array<{ childSections?: unknown[] }>) => sections }));
vi.mock('../../services/csr/csr-job-runner.js', () => ({ getCSRSectionOutputs: h.sections }));
import createCsrWorkflowRoutes from '../csr-workflow-routes';
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const FOREIGN = '11111111-2222-4333-8444-000000000021';
const app = express();
app.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5 }; next(); });
app.use('/api/csr-workflow', createCsrWorkflowRoutes());
let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  h.database = drizzle(database);
  await database.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer, status text, regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}'::jsonb);
    INSERT INTO projects (id,organization_id,client_workspace_id,status,regulatory_program_id) VALUES (11,7,71,'active','${PROGRAM}'),(12,7,72,'active',NULL),(13,7,71,'archived',NULL),(21,8,81,'active','${FOREIGN}');
    CREATE TABLE users (id integer PRIMARY KEY,status text); INSERT INTO users VALUES (5,'active');
    CREATE TABLE organizations (id integer PRIMARY KEY,status text); INSERT INTO organizations VALUES (7,'active'),(8,'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    INSERT INTO organization_users VALUES (7,5,'member');
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE csr_build_jobs (id integer PRIMARY KEY, organization_id integer, project_id integer, study_id text, status text, progress integer, study_info_snapshot jsonb, updated_at timestamp);
    INSERT INTO csr_build_jobs VALUES (1,7,11,'STUDY-11','drafting',45,'{"studyInfo":{"title":"Selected program study"}}','2026-10-01'),
      (2,7,12,'STUDY-12','complete',100,'{"studyInfo":{"title":"Sibling project study"}}','2026-10-12'),
      (3,8,21,'STUDY-21','complete',100,'{"studyInfo":{"title":"Foreign tenant study"}}','2026-10-13');
  `);
});
afterAll(async () => { await database?.close(); });
describe('CSR board follows its actual program in PostgreSQL', () => {
  it('reads the selected program, even when a sibling and foreign tenant have newer builds', async () => {
    const res = await request(app).get(`/api/csr-workflow/board?programId=${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(res.body.data.program.title).toBe('Selected program study');
    expect(res.body.data.meta).toMatchObject({ projectId: 11, programId: PROGRAM, computedScope: 'project', jobId: 1 });
    expect(h.sections).toHaveBeenCalledWith(1, 7);
  });
  it('refuses a foreign/unanchored program and conflicting or malformed scope instead of falling back to a sibling', async () => {
    expect((await request(app).get(`/api/csr-workflow/board?programId=${FOREIGN}`)).status).toBe(409);
    expect((await request(app).get(`/api/csr-workflow/board?programId=${PROGRAM}&projectId=12`)).status).toBe(400);
    expect((await request(app).get('/api/csr-workflow/board?projectId=0')).status).toBe(400);
    expect((await request(app).get('/api/csr-workflow/board?programId=garbage')).status).toBe(400);
    expect((await request(app).get('/api/csr-workflow/board?projectId=21')).status).toBe(404);
  });
  it('returns honest empty retained history for an archived project and preserves explicitly unscoped organization boards', async () => {
    const archived = await request(app).get('/api/csr-workflow/board?projectId=13');
    expect(archived.status).toBe(200);
    expect(archived.body.data).toMatchObject({ program: null, meta: { projectId: 13, computedScope: 'project' } });
    const organization = await request(app).get('/api/csr-workflow/board');
    expect(organization.body.data.program.title).toBe('Sibling project study');
    expect(organization.body.data.meta.computedScope).toBe('organization');
  });
});
