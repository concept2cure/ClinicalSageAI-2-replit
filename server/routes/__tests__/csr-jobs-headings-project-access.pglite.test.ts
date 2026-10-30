/**
 * GET /api/csr/jobs/:jobId/headings checks project access against real
 * project rows (D2/W1, 2026-10-30). The org check alone is not enough: a
 * member of the same organization without access to a private project must
 * not read that project's CSR headings, labels, content hashes or reviewer ids.
 * requireCsrJobAccess, resolveCsrScope and canAccessReportProject run
 * unmocked, over the real migrations/20260628_csr_job_state.sql in PGlite,
 * the way csr-workflow-program-scope.pglite.test.ts runs the board's scope.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.database; } }));
import router from '../csr-jobs';

const app = express();
app.use((req, _res, next) => {
  (req as unknown as { user: unknown }).user = { organizationId: 7, id: Number(req.header('x-test-user') ?? 5) };
  next();
});
app.use('/api/csr/jobs', router);

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  h.database = drizzle(pg);
  // 11 is visible to the organization; 12 is private to its owner (9) and one
  // project member (6). User 5 is an ordinary member of organization 7; user 8 is not in it.
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer, status text,
      regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    INSERT INTO organizations (id) VALUES (7);
    INSERT INTO users (id) VALUES (5), (6), (8), (9);
    INSERT INTO projects (id, organization_id, status, owner_id, created_by_id) VALUES (11, 7, 'active', 9, 9), (12, 7, 'active', 9, 9);
    INSERT INTO organization_users VALUES (7, 5, 'member'), (7, 6, 'member'), (7, 9, 'member');
    INSERT INTO project_visibility_settings VALUES (11, 7, 'org_public'), (12, 7, 'private');
    INSERT INTO project_members VALUES (12, 7, 6, 'use', 'active');
  `);
  await pg.exec(readFileSync(path.resolve(__dirname, '../../../migrations/20260628_csr_job_state.sql'), 'utf8'));
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (1, 7, 11, 'STUDY-11', 'complete', '{}', 9), (2, 7, 12, 'STUDY-12', 'complete', '{}', 9)`);
  await pg.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash)
    VALUES (7, 11, 1, '12.2', 'open project text', 'a'), (7, 12, 2, '12.2', 'private project text', 'b')`);
});
afterAll(async () => { await pg?.close(); });

const headings = (jobId: number, user: number) => request(app).get(`/api/csr/jobs/${jobId}/headings`).set('x-test-user', String(user));

describe('GET /api/csr/jobs/:jobId/headings — project access, not only the organization', () => {
  it('serves an organization-visible project\'s headings to an ordinary member', async () => {
    const res = await headings(1, 5);
    expect(res.status).toBe(200);
    expect(res.body.headings.find((x: { num: string }) => x.num === '12.2')).toMatchObject({ state: 'draft', contentHash: 'a' });
  });

  it('refuses a same-organization member without access to a private project, with no headings', async () => {
    const res = await headings(2, 5);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSR_PROJECT_ACCESS_DENIED');
    expect(res.body).not.toHaveProperty('headings');
    expect(JSON.stringify(res.body)).not.toContain('"b"');
  });

  it('serves the private project to its member, so the refusal is the project policy and not the job', async () => {
    const res = await headings(2, 6);
    expect(res.status).toBe(200);
    expect(res.body.headings.find((x: { num: string }) => x.num === '12.2')).toMatchObject({ contentHash: 'b' });
  });

  it('refuses a user who is not in the organization at all', async () => {
    const res = await headings(1, 8);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSR_PROJECT_ACCESS_DENIED');
    expect(res.body).not.toHaveProperty('headings');
  });

  it('gives 404 when the access check finds no job in this organization', async () => {
    const res = await headings(99, 5);
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('headings');
  });
});
