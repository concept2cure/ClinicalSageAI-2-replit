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
import { DataRoomQueryError, parseDataRoomQuery } from '../../../services/clinical-regulatory-evidence/data-room-search.js';
import { getCurrentReadableSourceScope } from '../../../services/clinical-regulatory-evidence/source-read-access';

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

  it('lists the Vault\'s documents beside the captures, page by page, with one count per facet value', async () => {
    catalogProgramIds.mockResolvedValue([P, OTHER]);
    searchDataRoom.mockResolvedValue({ total: 1, sources: [src(1)], facets: { project: [], study: [], kind: [], ctd: [], folder: [{ value: 'module-5', label: 'Module 5', count: 1 }] } });
    listVaultForCatalog.mockResolvedValue({ total: 2, documents: [{ documentId: 'd1', title: 'Protocol' }, { documentId: 'd2', title: 'SAP' }],
      facets: { project: [], kind: [], ctd: [], folder: [{ value: 'module-5', label: 'Module 5 · Clinical', count: 2 }, { value: 'corresp', label: 'Agency correspondence', count: 1 }] } });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?scope=catalog`);
    expect(res.status).toBe(200);
    expect(listVaultForCatalog.mock.calls[0][1]).toMatchObject({ programIds: [P, OTHER] });
    expect(res.body.vault).toMatchObject({ total: 2, documents: [{ documentId: 'd1' }, { documentId: 'd2' }] });
    expect(res.body.facets.folder).toEqual([{ value: 'module-5', label: 'Module 5', count: 3 }, { value: 'corresp', label: 'Agency correspondence', count: 1 }]);
    // Paged with the captures, and never for the one project's own room.
    listVaultForCatalog.mockClear();
    expect((await request(app()).get(`/api/c2c/projects/${P}/sources?scope=catalog&offset=50&limit=50`)).body.vault.total).toBe(2);
    expect(listVaultForCatalog.mock.calls[0][1]).toMatchObject({ offset: 50, limit: 50 });
    expect((await request(app()).get(`/api/c2c/projects/${P}/sources`)).body.vault).toBeUndefined();
    expect(listVaultForCatalog).toHaveBeenCalledTimes(1);
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

describe('exact project source selection query', () => {
  it('retains one through twenty PostgreSQL integer identities instead of an ordinary list', () => {
    expect(parseDataRoomQuery(P, { sourceIds: '2147483647' })).toMatchObject({ programId: P, sourceIds: [2147483647] });
    const ids = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(parseDataRoomQuery(P, { sourceIds: ids.join(',') })).toMatchObject({ sourceIds: ids });
  });

  const malformed: unknown[] = [undefined, null, [], ['11'], ['11', '22'], { id: '11' }, 11,
    '', ' ', '0', '-1', '+1', '1.5', '1e2', '0x10', '1,,2', ',1', '1,', '1, 2',
    '11,11', '1,01', '2147483648', '9007199254740993', Array.from({ length: 21 }, (_, index) => index + 1).join(',')];
  it.each(malformed.map((value, index) => ({ value, index })))('refuses malformed exact source identity input $index', ({ value }) => {
    expect(() => parseDataRoomQuery(P, { sourceIds: value })).toThrow(DataRoomQueryError);
  });

  const exclusions = ['q', 'status', 'kind', 'from', 'to', 'current', 'scope', 'project', 'study', 'ctd', 'folder', 'limit', 'offset', 'includeUnscoped'];
  it.each(exclusions)('refuses a simultaneously present %s filter even when blank', name => {
    expect(() => parseDataRoomQuery(P, { sourceIds: '11,22', [name]: '' })).toThrow(DataRoomQueryError);
  });

  it('keeps ordinary search/paging behavior without claiming exact admission', () => {
    expect(parseDataRoomQuery(P, { q: 'protocol', limit: '25', offset: '50' })).toMatchObject({ q: 'protocol', limit: 25, offset: 50 });
    expect(parseDataRoomQuery(P, {})).not.toHaveProperty('sourceIds');
  });
});

describe('GET /:id/sources verifies the entire explicit selection', () => {
  const exactSource = (id: number, over: Record<string, unknown> = {}) => ({ ...src(id), clientProgramId: P,
    checksum: String(id).padStart(64, 'a'), dataEligible: true, textAvailable: true, ...over });
  const admitted = (sourceIds: number[]) => ({ scope: 'verified-accessible-sources', sourceIds });

  beforeAll(async () => {
    // This suite also runs alone by test name. Its source rows support the real
    // late canonical access check, independently of the mocked page projection.
    await authorityDb.exec(`CREATE TABLE IF NOT EXISTS cre_evidence_sources
      (id int PRIMARY KEY,organization_id int,client_program_id uuid,is_current boolean,checksum text,deleted_at timestamptz);
      ALTER TABLE cre_evidence_sources ADD COLUMN IF NOT EXISTS visibility_class text,
        ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'client_document',
        ADD COLUMN IF NOT EXISTS client_workspace_id int,
        ADD COLUMN IF NOT EXISTS provenance jsonb DEFAULT '{}', ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';`);
    for (const id of [11, 22]) await authorityDb.query(`INSERT INTO cre_evidence_sources
      (id,organization_id,client_program_id,is_current,checksum) VALUES($1,7,$2,true,$3) ON CONFLICT(id) DO NOTHING`,
    [id, P, String(id).padStart(64, 'a')]);
  });

  it('returns the canonical complete admission and checked project with every selected row', async () => {
    searchDataRoom.mockResolvedValue({ total: 2, currentTotal: 2, sources: [exactSource(22), exactSource(11)], selection: admitted([11, 22]) });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?sourceIds=22,11`);
    expect(res.status).toBe(200);
    expect(searchDataRoom).toHaveBeenCalledWith(7, expect.objectContaining({ programId: P, sourceIds: [22, 11] }), { userId: 3 });
    expect(res.body).toMatchObject({ projectId: P, selection: admitted([11, 22]), total: 2, window: { shown: 2, truncated: false } });
    expect(res.body.sources.map((row: { id: number }) => row.id).sort((a: number, b: number) => a - b)).toEqual([11, 22]);
    expect(res.body.sources.every((row: { projectId: string }) => row.projectId === P)).toBe(true);
    expect(catalogProgramIds).not.toHaveBeenCalled();
    expect(listClientDocuments).not.toHaveBeenCalled();
    expect(listVaultForCatalog).not.toHaveBeenCalled();
  });

  it('retains readable data facts when the original file is unavailable', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, currentTotal: 1, sources: [exactSource(11, { originalFileAvailable: false })], selection: admitted([11]) });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?sourceIds=11`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ selection: admitted([11]), sources: [{ id: 11, dataEligible: true, textAvailable: true, originalFileAvailable: false }] });
  });

  it('does not hide a retired selected row behind a current-only list filter', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, currentTotal: 0, sources: [exactSource(11, { isCurrent: false, dataEligible: false })], selection: admitted([11]) });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?sourceIds=11`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ selection: admitted([11]), sources: [{ id: 11, isCurrent: false, dataEligible: false }] });
  });

  it('refuses exact source delivery when membership is revoked while delayed grading completes', async () => {
    expect(await getCurrentReadableSourceScope({ query: queryMock }, { organizationId: 7, userId: 3, programId: P, sourceIds: [11] }))
      .toMatchObject(admitted([11]));
    searchDataRoom.mockResolvedValue({ total: 1, currentTotal: 1, sources: [exactSource(11)], selection: admitted([11]) });
    gradeSources.mockImplementation(async () => {
      await authorityDb.exec('DELETE FROM organization_users WHERE organization_id=7 AND user_id=3');
      return new Map();
    });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?sourceIds=11`);
    expect(gradeSources).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
    expect(res.body.selection).toBeUndefined();
    expect(res.body.sources).toBeUndefined();
  });

  it.each([
    { name: 'missing row', sources: [exactSource(11)], selection: admitted([11, 22]) },
    { name: 'duplicate row', sources: [exactSource(11), exactSource(11)], selection: admitted([11, 22]) },
    { name: 'unrelated row', sources: [exactSource(11), exactSource(33)], selection: admitted([11, 22]) },
    { name: 'wrong-project row', sources: [exactSource(11), exactSource(22, { clientProgramId: '22222222-2222-4222-8222-222222222222' })], selection: admitted([11, 22]) },
    { name: 'missing admission', sources: [exactSource(11), exactSource(22)], selection: undefined },
    { name: 'partial admission', sources: [exactSource(11), exactSource(22)], selection: admitted([11]) },
    { name: 'duplicate admission', sources: [exactSource(11), exactSource(22)], selection: admitted([11, 11]) },
    { name: 'unrelated admission', sources: [exactSource(11), exactSource(22)], selection: admitted([11, 33]) },
    { name: 'unverified admission', sources: [exactSource(11), exactSource(22)], selection: { scope: 'unverified', sourceIds: [11, 22] } },
  ])('refuses a malformed canonical projection: $name', async ({ sources, selection }) => {
    searchDataRoom.mockResolvedValue({ total: 2, currentTotal: 2, sources, selection });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?sourceIds=11,22`);
    expect(res.status).toBe(503);
    expect(res.body.selection).toBeUndefined();
    expect(res.body.sources).toBeUndefined();
  });

  it('rejects repeated HTTP parameters before any source read', async () => {
    searchDataRoom.mockResolvedValue({ total: 0, sources: [] });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources?sourceIds=11&sourceIds=22`);
    expect(res.status).toBe(400);
    expect(searchDataRoom).not.toHaveBeenCalled();
  });

  it('does not mark an ordinary page as an exact selection', async () => {
    searchDataRoom.mockResolvedValue({ total: 1, sources: [exactSource(11)] });
    const res = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(res.status).toBe(200);
    expect(res.body.selection).toBeUndefined();
  });
});
