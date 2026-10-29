/**
 * Vault saved views through the real Vault router (D2, P-46;
 * docs/design/VAULT_SAVED_VIEWS_2026-10-29.md R2, test T5).
 *
 * The parent-access harness (org 7; PRIVATE owned by user 5 and private;
 * PUBLIC organisation-wide), with the real store (the one saved-query creator,
 * as amended) and current roles read from organization_users. It proves:
 *  - a personal view is its owner's alone, and its existence is not disclosed;
 *  - an organisation view is listed to members, changed by its creator, and
 *    renamed or deleted (not re-parameterised) by a manager;
 *  - a viewer saves for themselves only; a demoted creator can still withdraw;
 *  - a project view is listed and saved only behind that project's admission;
 *  - a view's filters are refused exactly as the search refuses them;
 *  - a stored view that no longer applies says so, with the search's refusal;
 *  - the database holds parameters only; a failed read is never an empty list.
 */
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

import projectVaultRoutes from '../../../routes/c2c/project-vault';

const PRIVATE = '11111111-1111-4111-8111-111111111111';
const PUBLIC = '22222222-2222-4222-8222-222222222222';
const OWNER = 5;      // member, owns both projects
const READER = 20;    // member, not assigned to PRIVATE
const MANAGER = 30;   // manager
const VIEWER = 40;    // viewer

function app(userId: number, role = 'member') {
  const application = express();
  application.use(express.json());
  application.use((req, _res, next) => {
    Object.assign(req, { organizationId: 7, userRole: role, user: { id: userId, organizationId: 7, role }, dbClient: { query } });
    next();
  });
  application.use('/api/c2c/project-vault', projectVaultRoutes());
  return application;
}
const as = (userId: number) => app(userId);
const view = (over: Record<string, unknown> = {}) => ({
  label: 'My CSRs', visibility: 'private', programId: null, q: '', filters: { documentType: ['CSR'] }, includeSuperseded: false, ...over,
});
const list = async (userId: number, program = PUBLIC) => request(as(userId)).get(`/api/c2c/project-vault/${program}/saved-views`);
const labels = (res: request.Response) => (res.body.data?.views ?? []).map((v: { label: string }) => v.label).sort();

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, name text, status text, uuid uuid DEFAULT gen_random_uuid());
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    INSERT INTO organizations(id,name,status) VALUES (7,'Fixture sponsor','active'), (8,'Other sponsor','active');
    INSERT INTO users VALUES (5,'Owner','owner@example.test','active'),(20,'Reader','reader@example.test','active'),
      (30,'Manager','manager@example.test','active'),(40,'Viewer','viewer@example.test','active');
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
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer, name text, status text);
    INSERT INTO client_workspaces VALUES (71,7,'Workspace','active');
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
      owner_id integer, created_by_id integer, settings jsonb, status text, client_workspace_id integer);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    INSERT INTO regulatory_programs (id,organization_id,name,program_type,status,product_type,lead_user_id,updated_at)
      VALUES ('${PRIVATE}',7,'Private study','ind','active','drug',5,now()),
             ('${PUBLIC}',7,'Public study','ind','active','drug',5,now()-interval '1 day');
    INSERT INTO projects VALUES (11,7,'${PRIVATE}',5,5,'{}','active',71),(12,7,'${PUBLIC}',5,5,'{}','active',71);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid, organization_id integer,
      document_code text,document_title text,file_name text,document_type text,file_size bigint,folder_id text,ctd_section text,
      placement_status text,version text,extracted_text text,content_hash text,supersedes_id uuid,
      classification text DEFAULT 'INTERNAL',evidence_kind text,
      deleted_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE document_data_dispositions (id integer, organization_id integer, program_id uuid,
      captured_source_id integer, vault_document_id uuid, source_sha256 text, linked_ids jsonb,
      choice text, disposition_sequence integer, created_at timestamptz);
  `);
  await h.pg.exec(fs.readFileSync('migrations/20260906_vault_documents_fulltext.sql', 'utf8'));
  await h.pg.exec(fs.readFileSync('migrations/20260905_document_catalog.sql', 'utf8'));
  await h.pg.exec(fs.readFileSync('migrations/20260731c_canonical_documents.sql', 'utf8'));
  await h.pg.exec(fs.readFileSync('migrations/20260505_saved_precedent_queries.sql', 'utf8'));
}, 60_000);

beforeEach(async () => {
  h.failAccessRead = false;
  await h.pg.exec(`TRUNCATE organization_users,project_visibility_settings,project_members,concept2cure_artifacts,concept2cure_review_assignments;
    TRUNCATE saved_precedent_queries RESTART IDENTITY;
    INSERT INTO organization_users VALUES (7,5,'member'),(7,20,'member'),(7,30,'manager'),(7,40,'viewer');
    INSERT INTO project_visibility_settings VALUES (11,7,'private'),(12,7,'org_public');
    UPDATE regulatory_programs SET product_type='drug';`);
});
afterAll(async () => { await h.pg?.close(); });

describe('a personal view is its owner\'s alone', () => {
  it('is listed to its owner only; another member cannot see, change or delete it, and is not told it exists', async () => {
    const saved = await request(as(OWNER)).post('/api/c2c/project-vault/saved-views').send(view());
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    expect(saved.body.data).toMatchObject({ label: 'My CSRs', visibility: 'private', programId: null, mine: true, applies: true, filters: { documentType: ['CSR'] } });
    expect(labels(await list(OWNER))).toEqual(['My CSRs']);
    expect(labels(await list(READER))).toEqual([]);
    const id = saved.body.data.id;
    for (const res of [
      await request(as(READER)).patch(`/api/c2c/project-vault/saved-views/${id}`).send({ label: 'Mine now' }),
      await request(as(READER)).delete(`/api/c2c/project-vault/saved-views/${id}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('SAVED_VIEW_NOT_FOUND');
    }
    const renamed = await request(as(OWNER)).patch(`/api/c2c/project-vault/saved-views/${id}`).send({ label: 'CSRs' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ label: 'CSRs', updatedBy: { userId: OWNER, name: 'Owner' } });
    expect((await request(as(OWNER)).delete(`/api/c2c/project-vault/saved-views/${id}`)).status).toBe(200);
    expect(labels(await list(OWNER))).toEqual([]);
  });
});

describe('an organisation view', () => {
  async function shared() {
    const res = await request(as(OWNER)).post('/api/c2c/project-vault/saved-views').send(view({ label: 'Team CSRs', visibility: 'org_public' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as number;
  }

  it('is listed to every member; a member who did not save it can change nothing', async () => {
    const id = await shared();
    const seen = (await list(READER)).body.data.views[0];
    expect(seen).toMatchObject({ label: 'Team CSRs', mine: false, canEdit: false, canRename: false, canShare: false, canDelete: false, createdBy: { userId: OWNER, name: 'Owner' } });
    const res = await request(as(READER)).patch(`/api/c2c/project-vault/saved-views/${id}`).send({ label: 'Hijacked' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SAVED_VIEW_NOT_YOURS');
  });

  it('a manager may rename or delete it, but not change what it selects', async () => {
    const id = await shared();
    const renamed = await request(as(MANAGER)).patch(`/api/c2c/project-vault/saved-views/${id}`).send({ label: 'QA: CSRs' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.updatedBy).toEqual({ userId: MANAGER, name: 'Manager' });
    const replaced = await request(as(MANAGER)).patch(`/api/c2c/project-vault/saved-views/${id}`).send({ q: 'x', filters: {}, includeSuperseded: false });
    expect(replaced.status).toBe(403);
    expect((await request(as(MANAGER)).delete(`/api/c2c/project-vault/saved-views/${id}`)).status).toBe(200);
  });

  it('a viewer saves for themselves only, and cannot publish', async () => {
    const pub = await request(as(VIEWER)).post('/api/c2c/project-vault/saved-views').send(view({ visibility: 'org_public' }));
    expect(pub.status).toBe(403);
    expect(pub.body.error).toBe('SAVED_VIEW_PUBLISH_DENIED');
    expect((await h.pg.query(`SELECT count(*)::int AS n FROM saved_precedent_queries`)).rows[0]).toEqual({ n: 0 });
    const own = await request(as(VIEWER)).post('/api/c2c/project-vault/saved-views').send(view());
    expect(own.status).toBe(201);
    const share = await request(as(VIEWER)).patch(`/api/c2c/project-vault/saved-views/${own.body.data.id}`).send({ visibility: 'org_public' });
    expect(share.status).toBe(403);
    expect(share.body.error).toBe('SAVED_VIEW_PUBLISH_DENIED');
  });

  it('a creator demoted to viewer can no longer rename it, but can still make it personal or delete it', async () => {
    const id = await shared();
    await h.pg.exec(`UPDATE organization_users SET role='viewer' WHERE user_id=5`);
    expect((await request(as(OWNER)).patch(`/api/c2c/project-vault/saved-views/${id}`).send({ label: 'Renamed' })).status).toBe(403);
    expect((await request(as(OWNER)).patch(`/api/c2c/project-vault/saved-views/${id}`).send({ visibility: 'private' })).status).toBe(200);
    expect((await request(as(OWNER)).delete(`/api/c2c/project-vault/saved-views/${id}`)).status).toBe(200);
  });
});

describe('a project view lives behind that project\'s admission', () => {
  it('cannot be listed or saved on a project the reader cannot open, and nothing about it is disclosed', async () => {
    const secret = await request(as(OWNER)).post('/api/c2c/project-vault/saved-views')
      .send(view({ label: 'Secret module 3', visibility: 'org_public', programId: PRIVATE, filters: { folderId: ['module-3'] } }));
    expect(secret.status, JSON.stringify(secret.body)).toBe(201);
    const listed = await list(READER, PRIVATE);
    expect(listed.status).toBe(404);
    expect(JSON.stringify(listed.body)).not.toContain('Secret');
    const saved = await request(as(READER)).post('/api/c2c/project-vault/saved-views').send(view({ programId: PRIVATE }));
    expect(saved.status).toBe(404);
    // PUBLIC's list holds the library views and PUBLIC's own, never PRIVATE's.
    await request(as(READER)).post('/api/c2c/project-vault/saved-views').send(view({ label: 'Public filed', visibility: 'org_public', programId: PUBLIC, filters: { placementStatus: ['confirmed'] } }));
    await request(as(READER)).post('/api/c2c/project-vault/saved-views').send(view({ label: 'Library CSRs', visibility: 'org_public' }));
    expect(labels(await list(READER, PUBLIC))).toEqual(['Library CSRs', 'Public filed']);
  });
});

describe('a view holds only what the search accepts', () => {
  it.each([
    [{ classification: ['BOGUS'] }, PUBLIC],
    [{ ctdSection: ['abc'] }, PUBLIC],
    [{ placementStatus: ['x'] }, PUBLIC],
    // 21 distinct values (the parser drops duplicates before its cap of 20).
    [{ ctdSection: Array.from({ length: 21 }, (_, i) => `3.2.${i + 1}`) }, PUBLIC],
    [{ processingStatus: ['INDEXED'] }, PUBLIC],
    [{ folderId: ['module-9'] }, PUBLIC],
    [{ folderId: ['module-3'] }, null],
  ])('refuses %j exactly as the search does', async (filters, programId) => {
    const saved = await request(as(OWNER)).post('/api/c2c/project-vault/saved-views').send(view({ programId, filters }));
    const qs = new URLSearchParams();
    for (const [k, vs] of Object.entries(filters)) for (const v of vs as string[]) qs.append(k, v);
    qs.set('q', 'x');
    const searched = await request(as(OWNER)).get(programId ? `/api/c2c/project-vault/${programId}/search?${qs}` : `/api/c2c/project-vault/search?${qs}`);
    expect(saved.status).toBe(searched.status);
    const pick = (b: Record<string, unknown>) => ({ error: b.error, parameter: b.parameter, allowed: b.allowed, message: b.message });
    expect(pick(saved.body)).toEqual(pick(searched.body));
  });

  it('refuses a project list, an empty view, a stored count and a missing visibility', async () => {
    const post = (body: object) => request(as(OWNER)).post('/api/c2c/project-vault/saved-views').send(body);
    const programs = await post(view({ filters: { programId: [PUBLIC] } }));
    expect(programs.status).toBe(400);
    expect(programs.body).toMatchObject({ error: 'UNSUPPORTED_PARAMETER', parameter: 'programId' });
    const empty = await post(view({ filters: {} }));
    expect(empty.status).toBe(422);
    expect(empty.body.error).toBe('EMPTY_VIEW');
    expect((await post({ ...view(), hits: 12 })).status).toBe(422);
    const noVisibility: Record<string, unknown> = { ...view() };
    delete noVisibility.visibility;
    expect((await post(noVisibility)).status).toBe(422);
  });

  it('normalises as the search does, and stores parameters only', async () => {
    const saved = await request(as(OWNER)).post('/api/c2c/project-vault/saved-views').send(view({ filters: { ctdSection: ['m3.2.p', '3.2.P'] } }));
    expect(saved.status).toBe(201);
    expect(saved.body.data.filters).toEqual({ ctdSection: ['3.2.P'] });
    const row = (await h.pg.query(`SELECT hits, last_run_at, scope FROM saved_precedent_queries WHERE id = $1`, [saved.body.data.id])).rows[0];
    expect(row).toEqual({ hits: -1, last_run_at: null, scope: { v: 1, filters: { ctdSection: ['3.2.P'] }, includeSuperseded: false } });
  });
});

describe('a stored view is re-checked when it is listed', () => {
  it('says it no longer applies when its folder left the project\'s cabinet, and the search refuses it the same way', async () => {
    const saved = await request(as(OWNER)).post('/api/c2c/project-vault/saved-views')
      .send(view({ label: 'Module 3', programId: PUBLIC, filters: { folderId: ['module-3'] } }));
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    await h.pg.exec(`UPDATE regulatory_programs SET product_type='device' WHERE id='${PUBLIC}'`);
    const v = (await list(OWNER)).body.data.views.find((x: { label: string }) => x.label === 'Module 3');
    expect(v.applies).toBe(false);
    expect(v.refusal).toMatchObject({ error: 'INVALID_FILTER', parameter: 'folderId' });
    const searched = await request(as(OWNER)).get(`/api/c2c/project-vault/${PUBLIC}/search?q=x&folderId=module-3`);
    expect(searched.status).toBe(400);
  });

  it('a failed read is an error, never an empty list', async () => {
    h.failAccessRead = true;
    const res = await list(OWNER);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.data?.views).toBeUndefined();
  });
});
