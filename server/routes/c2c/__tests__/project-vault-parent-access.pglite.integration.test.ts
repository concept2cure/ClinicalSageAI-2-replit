import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const h = vi.hoisted(() => ({ pg: null as unknown as PGlite, failAccessRead: false }));
const query = (sql: string, params?: unknown[]) => {
  if (h.failAccessRead && /organization_users|project_visibility_settings/.test(sql)) throw new Error('QA access verification unavailable');
  return h.pg.query<Record<string, unknown>>(sql, params);
};
vi.mock('../../../db.js', () => ({ pool: {
  query: (sql: string, params?: unknown[]) => query(sql, params),
  connect: async () => ({ query: (sql: string, params?: unknown[]) => query(sql, params), release: () => undefined }),
} }));

import projectsRouter from '../../../routes/c2c/projects';
import projectVaultRoutes from '../../../routes/c2c/project-vault';
import dispositionRoutes from '../../../routes/c2c/document-data-dispositions';
import { canAccessReportProject, getAccessibleReportProjectIds } from '../../../services/report-os/project-access';
import { readCsrProjectActor } from '../../../services/csr/project-scope';

const PRIVATE = '11111111-1111-4111-8111-111111111111';
const PUBLIC = '22222222-2222-4222-8222-222222222222';
const PRIVATE_DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PUBLIC_DOC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function app(userId = 20, role = 'member') {
  const application = express();
  application.use(express.json());
  application.use((req, _res, next) => {
    Object.assign(req, { organizationId: 7, userRole: role, user: { id: userId, organizationId: 7, role }, dbClient: { query } });
    next();
  });
  application.use('/api/c2c/projects', dispositionRoutes(), projectsRouter);
  application.use('/api/c2c/project-vault', projectVaultRoutes());
  return application;
}

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, name text, status text, uuid uuid DEFAULT gen_random_uuid());
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    INSERT INTO organizations(id,name,status) VALUES (7,'Fixture sponsor','active');
    INSERT INTO users VALUES (5,'Owner','owner@example.test','active'),(20,'Unassigned reader','reader@example.test','active');
    CREATE FUNCTION public.actor_name(integer) RETURNS TABLE(name text,email text)
      LANGUAGE sql STABLE AS 'SELECT name,email FROM users WHERE id=$1';
    CREATE TABLE regulatory_programs (
      id uuid PRIMARY KEY, organization_id integer, code text, name text, program_type text,
      status text, phase text, priority text, description text, product_name text, indication text,
      intended_use text, primary_agency text, target_agencies jsonb, target_submission_date date,
      actual_submission_date date, approval_date date, lead_user_id integer, team_members jsonb,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), application_number text,
      product_type text, device_class text, regulatory_path text, product_code text, predicate_devices jsonb,
      metadata jsonb DEFAULT '{}', deleted_at timestamptz, progress_percent integer
    );
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
      owner_id integer, created_by_id integer, settings jsonb, status text, client_workspace_id integer);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE c2c_documents (id uuid, project_id uuid, org_id integer);
    CREATE TABLE c2c_document_sections (document_id uuid, status text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid, organization_id integer,
      document_code text,document_title text,file_name text,document_type text,file_size bigint,folder_id text,ctd_section text,
      placement_status text,version text,extracted_text text,content_hash text,supersedes_id uuid,
      deleted_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE document_data_dispositions (id integer, organization_id integer, program_id uuid,
      captured_source_id integer, vault_document_id uuid, source_sha256 text, linked_ids jsonb,
      choice text, disposition_sequence integer, created_at timestamptz);
    INSERT INTO regulatory_programs (id,organization_id,name,program_type,status,product_type,lead_user_id,updated_at)
      VALUES ('${PRIVATE}',7,'Private study metadata','ind','active','drug',5,now()),
             ('${PUBLIC}',7,'Public study metadata','ind','active','drug',5,now()-interval '1 day');
    INSERT INTO projects VALUES (11,7,'${PRIVATE}',5,5,'{}','active',71),(12,7,'${PUBLIC}',5,5,'{}','active',71);
    INSERT INTO vault.documents (id,program_id,organization_id,document_title,file_name,document_type,extracted_text,created_at)
      VALUES ('${PRIVATE_DOC}','${PRIVATE}',7,'Stability private evidence','private.pdf','REPORT','Confidential stability results',now()),
             ('${PUBLIC_DOC}','${PUBLIC}',7,'Stability public evidence','public.pdf','REPORT','Public stability results',now()-interval '1 day');
  `);
  await h.pg.exec(fs.readFileSync('migrations/20260906_vault_documents_fulltext.sql', 'utf8'));
});

beforeEach(async () => {
  h.failAccessRead = false;
  await h.pg.exec(`TRUNCATE organization_users,project_visibility_settings,project_members,concept2cure_artifacts,concept2cure_review_assignments;
    INSERT INTO organization_users VALUES (7,5,'member'),(7,20,'member');
    INSERT INTO project_visibility_settings VALUES (11,7,'private'),(12,7,'org_public');
    DELETE FROM projects WHERE id>12;
    UPDATE projects SET regulatory_program_id='${PRIVATE}' WHERE id=11;
    UPDATE projects SET status='active';
    UPDATE users SET status='active';
    UPDATE organizations SET status='active';`);
});
afterAll(async () => { await h.pg?.close(); });

describe('canonical sharing controls prove this fixture is genuinely private', () => {
  it('denies the unassigned active member while admitting owner/public/explicit member/pending reviewer', async () => {
    const actor = await readCsrProjectActor({ query }, 7, 20);
    expect(await getAccessibleReportProjectIds(7, actor, { query })).toEqual([12]);
    expect(await canAccessReportProject(7, { userId: 5, role: 'member' }, 11, { query })).toBe(true);
    await h.pg.exec("INSERT INTO project_members VALUES (11,7,20,'use','active')");
    expect(await canAccessReportProject(7, actor, 11, { query })).toBe(true);
    await h.pg.exec("DELETE FROM project_members; INSERT INTO concept2cure_artifacts VALUES (101,7,11); INSERT INTO concept2cure_review_assignments VALUES (101,20,7,'pending')");
    expect(await canAccessReportProject(7, actor, 11, { query })).toBe(true);
    expect((await request(app()).get(`/api/c2c/projects/${PRIVATE}`)).status).toBe(200);
  });
  it('serves the public program through the actual detail and search endpoints', async () => {
    expect((await request(app()).get(`/api/c2c/projects/${PUBLIC}`)).status).toBe(200);
    const search = await request(app()).get(`/api/c2c/project-vault/${PUBLIC}/search?q=stability`);
    expect(search.status).toBe(200);
    expect(search.body.data.results.map((row: { id: string }) => row.id)).toEqual([PUBLIC_DOC]);
  });
});

describe('current parent privacy through actual HTTP and SQL', () => {
  it('refuses private project metadata for an unassigned same-organization member', async () => {
    const response = await request(app()).get(`/api/c2c/projects/${PRIVATE}`);
    expect(response.status, JSON.stringify(response.body)).toBe(404);
  });
  it('refuses private Vault content search before any count, snippet, or document identity', async () => {
    const response = await request(app()).get(`/api/c2c/project-vault/${PRIVATE}/search?q=stability`);
    expect(response.status, JSON.stringify(response.body)).toBe(404);
  });
  it('applies sharing before the portfolio page so private newest rows cannot consume public slots', async () => {
    const response = await request(app()).get('/api/c2c/projects?limit=1');
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([PUBLIC]);
    expect(response.body.meta.hasMore).toBe(false);
  });
  it('bounds library search count and page by accessible programs before ranking/pagination', async () => {
    const response = await request(app()).get('/api/c2c/project-vault/search?q=stability&limit=1');
    expect(response.status).toBe(200);
    expect(response.body.data.total, JSON.stringify(response.body)).toBe(1);
    expect(response.body.data.results.map((row: { id: string }) => row.id)).toEqual([PUBLIC_DOC]);
  });
  it('refuses project detail after organization membership is revoked even with a stale request role', async () => {
    await h.pg.exec('DELETE FROM organization_users WHERE user_id=20');
    const response = await request(app()).get(`/api/c2c/projects/${PUBLIC}`);
    expect(response.status, JSON.stringify(response.body)).toBe(404);
    expect(response.body).toMatchObject({ error: 'PROJECT_NOT_FOUND' });
  });
  it('requires explicit program-to-project reconciliation for a missing anchor', async () => {
    await h.pg.exec('UPDATE projects SET regulatory_program_id=NULL WHERE id=11');
    const response = await request(app(5)).get(`/api/c2c/projects/${PRIVATE}`);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
  });
  it('requires explicit reconciliation for two live anchors rather than reading the lowest project', async () => {
    await h.pg.exec(`INSERT INTO projects VALUES (13,7,'${PRIVATE}',5,5,'{}','active',71)`);
    const response = await request(app(5)).get(`/api/c2c/projects/${PRIVATE}`);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
  });
});

describe('every existing read family and current actor boundary', () => {
  const projectSuffixes = ['', '/dossier', '/drafts', '/team', '/evidence', '/activity', '/records',
    '/conversation-files', '/vault-structure', '/sources', '/source-changes',
    '/document-dispositions/preview?targetType=vault_document&targetId='+PRIVATE_DOC];
  it.each(projectSuffixes)('protects private project %s before child content queries', async suffix => {
    const denied = await request(app()).get(`/api/c2c/projects/${PRIVATE}${suffix}`);
    expect(denied.status, JSON.stringify(denied.body)).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain('Private study metadata');
  });
  const documentSuffixes = ['/versions', '/compare', '/history', '/download', '/catalog', '/relationships', '/annotations', '/text'];
  it.each(documentSuffixes)('protects private Vault document %s before child content or bytes', async suffix => {
    const extra = suffix === '/compare' ? `?against=${PRIVATE_DOC}` : '';
    const denied = await request(app()).get(`/api/c2c/project-vault/${PRIVATE}/documents/${PRIVATE_DOC}${suffix}${extra}`);
    expect(denied.status, JSON.stringify(denied.body)).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain('Stability private evidence');
  });
  it('keeps an unrelated missing private anchor out of the evaluated public page', async () => {
    await h.pg.exec('UPDATE projects SET regulatory_program_id=NULL WHERE id=11');
    const page = await request(app()).get('/api/c2c/projects?limit=1');
    expect(page.status, JSON.stringify(page.body)).toBe(200);
    expect(page.body.data.map((row: {id:string})=>row.id)).toEqual([PUBLIC]);
    expect(page.body.meta.hasMore).toBe(false);
    expect(JSON.stringify(page.body)).not.toContain(PRIVATE);
  });
  it('requires reconciliation for a deleted anchor while retaining an archived readable anchor', async () => {
    await h.pg.exec("UPDATE projects SET status='deleted' WHERE id=11");
    const deleted = await request(app(5)).get(`/api/c2c/projects/${PRIVATE}`);
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(409);
    await h.pg.exec("UPDATE projects SET status='archived' WHERE id=11");
    const archived = await request(app(5)).get(`/api/c2c/projects/${PRIVATE}`);
    expect(archived.status, JSON.stringify(archived.body)).toBe(200);
  });
  it.each(['user', 'organization'])('refuses an inactive %s despite a stale request role', async subject => {
    await h.pg.exec(subject === 'user' ? "UPDATE users SET status='inactive' WHERE id=20" : "UPDATE organizations SET status='inactive' WHERE id=7");
    const denied = await request(app()).get(`/api/c2c/projects/${PUBLIC}`);
    expect(denied.status, JSON.stringify(denied.body)).toBe(404);
    expect(denied.body).toMatchObject({ error: 'PROJECT_NOT_FOUND' });
  });
  it('reports failed verification as unavailable instead of an empty portfolio', async () => {
    h.failAccessRead = true;
    const failed = await request(app()).get('/api/c2c/projects');
    expect(failed.status, JSON.stringify(failed.body)).toBe(503);
    expect(failed.body.pendingStore).not.toBe(true);
  });
  it('keeps public viewer reads while denying a now-viewer lead mutation', async () => {
    await h.pg.exec("UPDATE organization_users SET role='viewer' WHERE user_id=5");
    const publicRead = await request(app(5,'member')).get(`/api/c2c/projects/${PUBLIC}`);
    expect(publicRead.status, JSON.stringify(publicRead.body)).toBe(200);
    const denied = await request(app(5,'member')).post(`/api/c2c/projects/${PRIVATE}/archive`).send({});
    expect(denied.status, JSON.stringify(denied.body)).toBe(403);
    expect((await query('SELECT status FROM regulatory_programs WHERE id=$1',[PRIVATE])).rows[0].status).toBe('active');
  });
});
