/**
 * GET /api/c2c/projects/:id/sources — the window, and which sources are current.
 *
 * The route read listClientDocuments with its default 200-row cap and said
 * nothing past it, and it gave its readers no way to tell a source a re-upload
 * had retired (is_current = false) from its successor — so Project home counted
 * one re-uploaded file as two. The route stays inclusive (the authoring canvas
 * and sources rail read it too); it now reports the window and each source's
 * currency, and its readers decide what to count.
 *
 * Since 2026-10-08 (Data Room catalog S2) the route reads searchDataRoom, which
 * returns the real total and pages; a "full window" is a page with more after
 * it. The SQL is proven on PostgreSQL in tests/db/data-room-processing.dbtest.ts.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
const { listClientDocuments, searchDataRoom, catalogProgramIds, gradeSources, listVaultForCatalog } = vi.hoisted(() => ({
  listClientDocuments: vi.fn(), searchDataRoom: vi.fn(), catalogProgramIds: vi.fn(), gradeSources: vi.fn(), listVaultForCatalog: vi.fn(),
}));
vi.mock('../../../services/clinical-regulatory-evidence/data-room-vault.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/clinical-regulatory-evidence/data-room-vault.js')>()),
  listVaultForCatalog,
}));
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({ listClientDocuments }));
vi.mock('../../../services/clinical-regulatory-evidence/data-room-search.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/clinical-regulatory-evidence/data-room-search.js')>()),
  searchDataRoom,
  catalogProgramIds,
}));
vi.mock('../../../services/clinical-regulatory-evidence/data-room-grade.js', () => ({ gradeSources }));
vi.mock('../../../services/clinical-regulatory-evidence/source-usage.service.js', () => ({
  summarizeSourceUsage: async () => new Map(),
}));

import router from '../projects';

const P = '11111111-1111-1111-1111-111111111111';
let authorityDb: PGlite;
function app(options: { userId?: number; withClient?: boolean; claimedRole?: string } = {}) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = 7;
    req.user = { id: options.userId ?? 3, organizationId: 7, role: options.claimedRole ?? 'member' };
    if (options.withClient !== false) req.dbClient = { query: queryMock };
    next();
  });
  a.use('/api/c2c/projects', router);
  return a;
}
const src = (id: number, isCurrent?: boolean) => ({
  id, title: `s${id}`, checksum: `h${id}`, ingestionStatus: 'ingested', extractionStatus: 'extracted',
  createdAt: '2026-09-01', updatedAt: '2026-09-01', metadata: {}, provenance: {},
  ...(isCurrent === undefined ? {} : { isCurrent }),
});

beforeAll(async () => {
  authorityDb = new PGlite();
  await authorityDb.exec(`
    CREATE TABLE organizations (id int PRIMARY KEY,status text);
    CREATE TABLE users (id int PRIMARY KEY,status text);
    CREATE TABLE organization_users (organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects (id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,
      owner_id int,created_by_id int,settings jsonb,status text,client_workspace_id int);
    CREATE TABLE project_visibility_settings (project_id int,organization_id int,visibility text);
    CREATE TABLE project_members (project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts (id int,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments (artifact_id int,organization_id int,reviewer_id int,status text);
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO users VALUES (3,'active'),(99,'active');
    INSERT INTO regulatory_programs VALUES ('${P}',7,NULL);
    INSERT INTO projects VALUES (42,7,'${P}',3,3,'{}','active',NULL);
    INSERT INTO project_visibility_settings VALUES (42,7,'private');
  `);
});
afterAll(async () => { await authorityDb?.close(); });

beforeEach(async () => {
  await authorityDb.exec("TRUNCATE organization_users; INSERT INTO organization_users VALUES (7,3,'member');");
  queryMock.mockReset();
  // Real current actor, unique parent and private-sharing SQL; only the source
  // page/usage projection is mocked in this window contract file.
  queryMock.mockImplementation((sql: string, params?: unknown[]) => authorityDb.query(sql, params));
  listClientDocuments.mockReset();
  searchDataRoom.mockReset();
  catalogProgramIds.mockReset();
  listVaultForCatalog.mockReset(); listVaultForCatalog.mockResolvedValue({ total: 0, documents: [], facets: { project: [], kind: [], ctd: [], folder: [] } });
  gradeSources.mockReset();
  gradeSources.mockResolvedValue(new Map());
});

describe('what a project uses from the catalog (GET and POST /:id/evidence)', () => {
  const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  beforeAll(async () => {
    await authorityDb.exec(`
      ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS name text;
      CREATE TABLE c2c_project_pinned_evidence (id serial PRIMARY KEY, project_id uuid, evidence_kind text, evidence_ref text, title text,
        meta text, pinned_by int, pinned_at timestamptz DEFAULT now(), reason text);
      CREATE TABLE cre_evidence_sources (id int PRIMARY KEY, organization_id int, client_program_id uuid, is_current boolean, checksum text,
        grade text, grade_score int, graded_at timestamptz, extraction_status text, deleted_at timestamptz);
      CREATE SCHEMA vault;
      CREATE TABLE vault.documents (id uuid PRIMARY KEY, organization_id int, program_id uuid, content_hash char(64), document_code text,
        supersedes_id uuid, deleted_at timestamptz);
      UPDATE regulatory_programs SET name = 'Open project';
      INSERT INTO cre_evidence_sources VALUES (5, 7, '${P}', true, 'c5', 'B', 80, now(), 'extracted', NULL);
      INSERT INTO vault.documents VALUES ('${DOC}', 7, '${P}', '${'d'.repeat(64)}', 'PROT', NULL, NULL);
      INSERT INTO c2c_project_pinned_evidence (project_id, evidence_kind, evidence_ref, title) VALUES
        ('${P}', 'data_room', '5', 'Capture five'), ('${P}', 'vault_doc', '${DOC}', 'Protocol'), ('${P}', 'artifact', 'art-77', 'An artifact');
    `);
  });

  it('answers every kind in one read: a capture with its facts, a Vault document with its, and a reference of another kind as it is', async () => {
    const res = await request(app()).get(`/api/c2c/projects/${P}/evidence`);
    expect(res.status).toBe(200);
    const by = Object.fromEntries(res.body.evidence.map((e: any) => [e.evidence_kind, e]));
    expect(by.data_room.data_room).toMatchObject({ sourceId: 5, projectName: 'Open project', isCurrent: true, grade: 'B' });
    expect(by.data_room.vault).toBeNull();
    expect(by.vault_doc.vault).toMatchObject({ documentId: DOC, projectId: P, projectName: 'Open project', checksum: 'd'.repeat(64), isCurrent: true });
    expect(by.vault_doc.data_room).toBeNull();
    // A uuid or a word cast to an integer failed this whole read (22P02) until the casts sat inside CASE.
    expect(by.artifact).toMatchObject({ evidence_ref: 'art-77', data_room: null, vault: null });
  });

  it('says a Vault document a later version replaced is no longer current', async () => {
    await authorityDb.exec(`INSERT INTO vault.documents VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 7, '${P}', '${'e'.repeat(64)}', 'PROT', '${DOC}', NULL)`);
    const res = await request(app()).get(`/api/c2c/projects/${P}/evidence`);
    expect(res.body.evidence.find((e: any) => e.evidence_kind === 'vault_doc').vault.isCurrent).toBe(false);
  });
  // POST's refusals for a Vault document are vaultDocumentForUse's (data-room-vault.test.ts); the walk uses and removes one in the app.
});

describe('GET /:id/sources: the catalog and its grades (S2, 2026-11-06)', () => {
  const OTHER = '22222222-2222-4222-8222-222222222222';
  const grade = { grade: 'B', score: 80, basis: [], cap: null, engine: 'data-room-grade v1', gradedAt: '2026-11-06T00:00:00.000Z' };

  it('carries each row\'s grade from the engine', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(1)] });
    gradeSources.mockResolvedValue(new Map([[1, grade]]));
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(200);
    expect(res.body.sources[0].grade).toEqual(grade);
    expect(res.body.gradesUnavailable).toBeUndefined();
  });

  it('keeps the room readable when grading fails, and says the grades are unavailable', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(1)] });
    gradeSources.mockRejectedValue(new Error('down'));
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gradesUnavailable: true, sources: [{ id: 1, grade: null }] });
  });

  it('reads the catalog over the projects the server resolves, never ones the request names', async () => {
    catalogProgramIds.mockResolvedValue([P, OTHER]);
    searchDataRoom.mockResolvedValue({ total: 0, sources: [], facets: { project: [], study: [], kind: [], ctd: [], folder: [] } });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?scope=catalog&programIds=${OTHER}`);
    expect(res.status).toBe(200);
    expect(catalogProgramIds).toHaveBeenCalledWith({ organizationId: 7, userId: 3 }, P);
    expect(searchDataRoom.mock.calls[0][1]).toMatchObject({ programIds: [P, OTHER] });
    expect(res.body).toMatchObject({ scope: 'catalog', catalogProjects: 2 });
  });

  it('lists the Vault\'s documents beside the captures on the catalog\'s first page, with one count per facet value', async () => {
    catalogProgramIds.mockResolvedValue([P, OTHER]);
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(1)], facets: { project: [], study: [], kind: [], ctd: [], folder: [{ value: 'module-5', label: 'Module 5', count: 1 }] } });
    listVaultForCatalog.mockResolvedValue({ total: 2, documents: [{ documentId: 'd1', title: 'Protocol' }, { documentId: 'd2', title: 'SAP' }],
      facets: { project: [], kind: [], ctd: [], folder: [{ value: 'module-5', label: 'Module 5 · Clinical', count: 2 }, { value: 'corresp', label: 'Agency correspondence', count: 1 }] } });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?scope=catalog`);
    expect(res.status).toBe(200);
    expect(listVaultForCatalog.mock.calls[0][1]).toMatchObject({ programIds: [P, OTHER] });
    expect(res.body.vault).toMatchObject({ total: 2, documents: [{ documentId: 'd1' }, { documentId: 'd2' }] });
    expect(res.body.facets.folder).toEqual([{ value: 'module-5', label: 'Module 5', count: 3 }, { value: 'corresp', label: 'Agency correspondence', count: 1 }]);
    // Not on a later page, and never for the one project's own room.
    listVaultForCatalog.mockClear();
    expect((await request(app()).get(`/api/c2c/projects/${P}/sources?scope=catalog&offset=50`)).body.vault).toBeUndefined();
    expect((await request(app()).get(`/api/c2c/projects/${P}/sources`)).body.vault).toBeUndefined();
    expect(listVaultForCatalog).not.toHaveBeenCalled();
  });

  it('keeps the captures readable when the Vault\'s documents cannot be listed, and says so', async () => {
    catalogProgramIds.mockResolvedValue([P]);
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(1)], facets: { project: [], study: [], kind: [], ctd: [], folder: [] } });
    listVaultForCatalog.mockRejectedValue(new Error('down'));
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?scope=catalog`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ vaultUnavailable: true, sources: [{ id: 1 }] });
    expect(res.body.vault).toBeUndefined();
  });

  it('refuses a catalog narrowing to a project outside the person\'s set', async () => {
    catalogProgramIds.mockResolvedValue([P]);
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?scope=catalog&project=${OTHER}`);
    expect(res.status).toBe(404);
    expect(searchDataRoom).not.toHaveBeenCalled();
  });
});

describe('GET /:id/sources', () => {
  it('refuses a private parent without persisted sharing despite a claimed admin role', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(1)] });
    await authorityDb.exec("INSERT INTO organization_users VALUES (7,99,'viewer')");
    const res = await request(app({ userId: 99, claimedRole: 'super_admin' })).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(404);
    expect(searchDataRoom).not.toHaveBeenCalled();
  });

  it('fails closed when the authenticated request lacks its database client', async () => {
    const res = await request(app({ withClient: false })).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(503);
    expect(searchDataRoom).not.toHaveBeenCalled();
  });

  it('asks for the newest 200 by default and reports a page with more after it as truncated, with the total', async () => {
    searchDataRoom.mockResolvedValue({ total: 250, sources: Array.from({ length: 200 }, (_, i) => src(i + 1)) });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(200);
    expect(searchDataRoom.mock.calls[0][1]).toMatchObject({ programId: P, limit: 200, offset: 0, q: null });
    expect(res.body.sources).toHaveLength(200);
    expect(res.body.total).toBe(250);
    expect(res.body.window).toEqual({ shown: 200, truncated: true });
  });

  it('passes a search and a page through, and refuses an unreadable filter with 400', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(9)] });
    await request(app()).get(`/api/c2c/projects/${P}/sources`).query({ q: 'stability', limit: '25', offset: '50' });
    expect(searchDataRoom.mock.calls[0][1]).toMatchObject({ q: 'stability', limit: 25, offset: 50 });
    const bad = await request(app()).get(`/api/c2c/projects/${P}/sources`).query({ limit: '9999' });
    expect(bad.status).toBe(400);
    expect(searchDataRoom).toHaveBeenCalledTimes(1);
  });

  it('says which sources a re-upload retired; a row older than the column is current', async () => {
    searchDataRoom.mockResolvedValue({ total: 3, sources: [src(1, false), src(2, true), src(3)] });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    const cur = Object.fromEntries(res.body.sources.map((s: { id: number; isCurrent: boolean }) => [s.id, s.isCurrent]));
    expect(cur).toEqual({ 1: false, 2: true, 3: true });
    expect(res.body.window).toEqual({ shown: 3, truncated: false });
  });
});
