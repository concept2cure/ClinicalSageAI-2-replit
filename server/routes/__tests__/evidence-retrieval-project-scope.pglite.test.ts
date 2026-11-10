/**
 * Evidence retrieval holds to the projects the person can open (F1, 2026-11-05).
 *
 * `searchHybrid` and `searchSimilar` (services/enhancedEmbeddingService.ts) ranked every atom in the organization when
 * no project was given, and trusted one when it was. So `POST /api/evidence/ask` (whose project check was only "is it
 * this organization's"), `POST /api/cortex/query` (search and graph, which ignored context.projectId) and
 * `POST /api/deep-research/document/generate` returned or grounded a model on a private project's evidence. The
 * founder's rule: a CRO works across authorized sponsor projects "without mixing sponsor data or permissions".
 *
 * The access policy is the real one (readCurrentProgramActor, getAccessibleReportProjectIds, canAccessReportProject,
 * getCurrentAccessibleProgramScope) and so is the search SQL, on PostgreSQL (PGlite). This build has no pgvector, so
 * `vector` is a domain over text and search_atoms_hybrid and `<=>` are stand-ins that rank the candidates they are
 * given (the stand-in ranks the newest atom first, so a private atom would outrank the open ones). The model, the
 * embedding provider, the Vault RAG router and the auth/licence gates are stubs.
 *
 * Evidence: docs/evidence/F1/2026-11-05-evidence-retrieval-scope/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failWhen: null as RegExp | null,
  sql: [] as string[],
  route: vi.fn(),
  chat: vi.fn(),
  ragQuery: vi.fn(),
  ragRetrieve: vi.fn(),
  pass: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../db.js', () => {
  const query = async (sql: string, params?: unknown[]) => {
    h.sql.push(sql);
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return h.pg.query(sql, params as unknown[]);
  };
  const pool = { query };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../services/ai-gateway/index.js', () => ({
  getGateway: () => ({ getEnabledProviders: () => ['anthropic'], route: h.route }),
}));
vi.mock('../../services/ai-gateway/embeddings/embedding-provider', () => ({
  getEmbeddingProvider: () => ({ embed: async () => ({ embeddings: [[0.1, 0.2, 0.3]], inputTokens: 3 }) }),
}));
vi.mock('../../services/document-data-disposition/eligibility.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/document-data-disposition/eligibility')>()),
  atomDataEligibleSql: () => 'TRUE',
  atomOriginalFileAvailableSql: () => 'TRUE',
}));
vi.mock('../../services/ragRouter.js', () => ({ ragRouter: { query: h.ragQuery, retrieve: h.ragRetrieve } }));
vi.mock('../../middleware/auth.js', () => ({ authenticateToken: h.pass }));
vi.mock('../../services/license-manager.js', () => ({ loadLicense: () => h.pass, requireTier: () => h.pass }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { chat: h.chat } }));

import { pool } from '../../db.js';
import { runWithTenantScope } from '../../db/tenantStore';
import { EnhancedEmbeddingService } from '../../services/enhancedEmbeddingService';
import evidenceAskRouter from '../evidence-ask';
import cortexRouter, { initializeCortexAPI } from '../cortexQueryRoutes';
import deepResearchRouter from '../deep-research';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORG_UUID = '0a0a0a0a-0000-4000-8000-000000000001';
const P_A1 = '11111111-1111-4111-8111-111111111111';
const P_A2 = '22222222-2222-4222-8222-222222222222';
const P_B = '33333333-3333-4333-8333-333333333333';
const P_PRIV = '44444444-4444-4444-8444-444444444444';
const OPEN_TITLES = ['Contoso device memo', 'Northwind oncology memo', 'Northwind protocol memo'];
const HIDDEN = /Private memo|private-body|Their memo|Organization guidance note/;

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE DOMAIN vector AS text;
    CREATE FUNCTION stub_distance(text, text) RETURNS float8 LANGUAGE sql IMMUTABLE AS 'SELECT 0.1::float8';
    CREATE OPERATOR <=> (LEFTARG = text, RIGHTARG = text, FUNCTION = stub_distance);
    CREATE TABLE organizations (id integer PRIMARY KEY, uuid uuid, status text DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer NOT NULL, name text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, name text, code text,
      description text, status text DEFAULT 'active', deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text,
      regulatory_program_id uuid, client_workspace_id integer, status text DEFAULT 'active',
      owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}');
    CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
    CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id integer, project_id integer);
    CREATE TABLE lumen_data_atoms (id serial PRIMARY KEY, organization_id integer, source_type text, source_id text,
      atom_type text DEFAULT 'finding', title text, content text, embedding vector DEFAULT '[0.1,0.2,0.3]');
    CREATE TABLE lumen_knowledge_graph_edges (source_atom_id integer, target_atom_id integer, relationship_type text);
    CREATE FUNCTION search_atoms_hybrid(query_text text, query_embedding vector, semantic_weight float,
      keyword_weight float, match_count integer, filter_atom_type text, filter_atom_ids integer[])
    RETURNS TABLE (id integer, atom_type text, title text, content text, semantic_score float, keyword_score float,
      combined_score float)
    LANGUAGE sql STABLE AS $$
      SELECT a.id, a.atom_type, a.title, a.content, 0.9::float, 0.5::float, (0.9 * semantic_weight + 0.5 * keyword_weight)::float
        FROM lumen_data_atoms a WHERE filter_atom_ids IS NULL OR a.id = ANY(filter_atom_ids) ORDER BY a.id DESC LIMIT match_count
    $$;
    CREATE TABLE ai_retrieval_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id bigint, project_id text,
      user_id text, scope text, embedding_model text, query_text text, query_hash_sha256 text, snapshot_hash_sha256 text,
      top_k integer, threshold numeric, result_count integer);
    CREATE TABLE ai_retrieval_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), retrieval_run_id uuid, rank integer,
      source_type text, atom_id text, title text, excerpt_hash_sha256 text, excerpt_preview text, score numeric);
    CREATE TABLE ai_threads (id text PRIMARY KEY, organization_id integer, project_id text, created_by text);
    CREATE TABLE ai_generation_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), retrieval_run_id uuid, thread_id text,
      model text, provider text, answer_hash_sha256 text, prompt_tokens integer, completion_tokens integer,
      total_tokens integer, latency_ms integer, is_demo boolean);

    INSERT INTO organizations VALUES (1, '${ORG_UUID}'), (2, '0b0b0b0b-0000-4000-8000-000000000002');
    INSERT INTO users VALUES (7, 'C. Consultant', 'c@cro', 'active'), (9, 'P. Owner', 'p@cro', 'active');
    INSERT INTO organization_users VALUES (1, 7, 'member'), (1, 9, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio'), (101, 1, 'Contoso Pharma');
    INSERT INTO regulatory_programs (id, organization_id, name, code) VALUES
      ('${P_A1}', 1, 'Northwind oncology IND', 'NW-1'), ('${P_A2}', 1, 'Northwind second IND', 'NW-2'),
      ('${P_B}', 1, 'Contoso device study', 'CT-1'), ('${P_PRIV}', 1, 'Northwind private program', 'NW-PRIV');
    INSERT INTO projects (id, organization_id, code, name, regulatory_program_id, client_workspace_id, owner_id, created_by_id) VALUES
      (10, 1, 'NW-1', 'Northwind oncology IND', '${P_A1}', 100, 9, 9), (11, 1, 'NW-2', 'Northwind second IND', '${P_A2}', 100, 9, 9),
      (12, 1, 'NW-PRIV', 'Northwind private program', '${P_PRIV}', 100, 9, 9), (13, 1, 'CT-1', 'Contoso device study', '${P_B}', 101, 9, 9),
      (20, 2, 'THEIRS-1', 'Their program', NULL, NULL, 9, 9);
    INSERT INTO project_visibility_settings VALUES (1, 10, 'org_public'), (1, 11, 'org_public'), (1, 12, 'private'), (1, 13, 'org_public');
    INSERT INTO project_members VALUES (1, 12, 9, 'owner', 'active');
    INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id) VALUES
      ('a-a1', 1, 10), ('a-a2', 1, 11), ('a-b', 1, 13), ('a-priv', 1, 12), ('a-theirs', 2, 20);
    INSERT INTO lumen_data_atoms (organization_id, source_type, source_id, title, content) VALUES
      (1, 'artifact', 'a-a1', 'Northwind oncology memo', 'memo body A1'),
      (1, 'data_room_upload', 'a-a2', 'Northwind protocol memo', 'memo body A2'),
      (1, 'artifact', 'a-b', 'Contoso device memo', 'memo body B'),
      (1, 'artifact', 'a-priv', 'Private memo', 'private-body memo'),
      (1, 'document', 'org-guidance', 'Organization guidance note', 'memo guidance'),
      (2, 'artifact', 'a-theirs', 'Their memo', 'memo theirs');
    INSERT INTO lumen_knowledge_graph_edges VALUES (1, 3, 'supports'), (1, 4, 'references'), (4, 3, 'contradicts');
  `);
  initializeCortexAPI(pool as never);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => {
  h.failWhen = null;
  h.sql = [];
  h.route.mockReset().mockResolvedValue({ content: 'Answered [SRC-1].', provider: 'anthropic', model: 'stub',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 });
  h.chat.mockReset().mockResolvedValue({ content: 'Section text that is long enough to count as a drafted section body.' });
  const context = { processingTimeMs: 0, tokensUsed: 0, retrievalStrategy: 'advanced', documents: [] };
  h.ragQuery.mockReset().mockResolvedValue({ answer: 'stub', sources: [], context });
  h.ragRetrieve.mockReset().mockResolvedValue(context);
});

/** The person: user 7, a member of organization 1, in a tenant-scoped request. */
function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantId: 1, userId: 7, user: { id: 7, userId: 7, organizationId: 1 },
      tenantContext: { organizationId: 1, userId: 7, organizationUuid: ORG_UUID } });
    runWithTenantScope({ tenantId: '1', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'scope.test' }, () => next());
  });
  a.use('/api/evidence', evidenceAskRouter);
  a.use('/api/cortex/query', cortexRouter);
  a.use('/api/deep-research', deepResearchRouter);
  return a;
}
const ask = (body: Record<string, unknown>) => request(app()).post('/api/evidence/ask').send({ message: 'memo', ...body });
const cortex = (body: Record<string, unknown>) => request(app()).post('/api/cortex/query/query').send({ query: 'memo', ...body });
const generate = () => request(app()).post('/api/deep-research/document/generate')
  .send({ documentType: 'csr', studyInfo: { title: 'Study 101' } });
const titles = (sources: Array<{ title: string }> = []) => [...new Set(sources.map((s) => s.title))].sort();
const atomSearchRan = () => h.sql.some((sql) => /search_atoms_hybrid|FROM lumen_data_atoms/.test(sql));
const promptsSent = () => JSON.stringify([...h.route.mock.calls, ...h.chat.mock.calls]);
const svc = () => new EnhancedEmbeddingService(pool as never);
const asTenant = <T>(fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: '1', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'scope.test' }, fn);

describe('the shared search takes a required project scope', () => {
  it('searchHybrid ranks only the scope projects\' atoms', async () => {
    const rows = await asTenant(() => svc().searchHybrid('memo', { limit: 10, organizationUuid: ORG_UUID, projectIds: [10, 13] }));
    expect(titles(rows)).toEqual(['Contoso device memo', 'Northwind oncology memo']);
  });

  it('an empty scope ranks nothing and does not embed; no scope is refused', async () => {
    const service = svc();
    const embed = vi.spyOn(service, 'embed');
    expect(await asTenant(() => service.searchHybrid('memo', { limit: 10, organizationUuid: ORG_UUID, projectIds: [] }))).toEqual([]);
    expect(await service.searchSimilar('memo', 5, 0.5, { organizationUuid: ORG_UUID, projectIds: [] })).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
    await expect(asTenant(() => service.searchHybrid('memo', { limit: 10, organizationUuid: ORG_UUID } as never)))
      .rejects.toThrow(/no project scope/);
  });

  it('searchSimilar ranks only the scope projects\' atoms', async () => {
    const rows = await svc().searchSimilar('memo', 10, 0.5, { organizationUuid: ORG_UUID, projectIds: [12] });
    expect(titles(rows)).toEqual(['Private memo']);
  });
});

describe('POST /api/evidence/ask', () => {
  it('with no project: every project the person can open, never a private one', async () => {
    const res = await ask({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(titles(res.body.sources)).toEqual(OPEN_TITLES);
    expect(JSON.stringify(res.body) + promptsSent()).not.toMatch(HIDDEN);
  });

  it('a named project the person can open: that project only', async () => {
    const res = await ask({ projectId: 13 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(titles(res.body.sources)).toEqual(['Contoso device memo']);
  });

  it('a named private project is answered as a missing one, before any search', async () => {
    const hidden = await ask({ projectId: 12 });
    const missing = await ask({ projectId: 999 });
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
    expect(hidden.body).toEqual({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    expect(atomSearchRan()).toBe(false);
    expect(h.route).not.toHaveBeenCalled();
  });

  it('an access check that cannot run is an error, not an empty search', async () => {
    h.failWhen = /FROM project_members/;
    const res = await ask({});
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROJECT_ACCESS_UNAVAILABLE');
    expect(atomSearchRan()).toBe(false);
    expect(h.route).not.toHaveBeenCalled();
  });
});

describe('POST /api/cortex/query: search and graph', () => {
  it('search: every project the person can open, never a private one', async () => {
    const res = await cortex({ mode: 'search' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(titles(res.body.results.sources)).toEqual(OPEN_TITLES);
    expect(JSON.stringify(res.body)).not.toMatch(HIDDEN);
  });

  it('search: context.projectId is honoured when the person can open it', async () => {
    const res = await cortex({ mode: 'search', context: { projectId: '10' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(titles(res.body.results.sources)).toEqual(['Northwind oncology memo']);
  });

  it('graph: neither a node nor an edge names an atom of a private project', async () => {
    const res = await cortex({ mode: 'graph' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { nodes, edges } = res.body.results.graph;
    expect(titles(nodes)).toEqual(['Contoso device memo', 'Northwind oncology memo']);
    expect(edges.map((e: { relationship: string }) => e.relationship)).toEqual(['supports']);
    expect(titles(res.body.results.sources)).toEqual(OPEN_TITLES);
    expect(JSON.stringify(res.body)).not.toMatch(HIDDEN);
  });

  it.each(['search', 'graph'])('%s: a named private project is answered as a missing one', async (mode) => {
    const hidden = await cortex({ mode, context: { projectId: '12' } });
    const missing = await cortex({ mode, context: { projectId: '999' } });
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
    expect(atomSearchRan()).toBe(false);
  });

  it.each(['search', 'graph'])('%s: an access check that cannot run is an error', async (mode) => {
    h.failWhen = /FROM project_members/;
    const res = await cortex({ mode });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROJECT_ACCESS_UNAVAILABLE');
    expect(atomSearchRan()).toBe(false);
  });
});

describe('POST /api/cortex/query: generate and advisory read the Vault of the person\'s programs', () => {
  it('generate binds the open projects\' programs, and a named project its own', async () => {
    expect((await cortex({ mode: 'generate' })).status).toBe(200);
    expect(h.ragQuery.mock.calls[0][0].filters.allowedProgramIds).toEqual([P_A1, P_A2, P_B]);
    expect((await cortex({ mode: 'generate', context: { projectId: '13' } })).status).toBe(200);
    expect(h.ragQuery.mock.calls[1][0].filters.allowedProgramIds).toEqual([P_B]);
  });

  it('advisory binds them too, and a private project is refused before the Vault is read', async () => {
    expect((await cortex({ mode: 'advisory' })).status).toBe(200);
    expect(h.ragRetrieve.mock.calls[0][0].filters.allowedProgramIds).toEqual([P_A1, P_A2, P_B]);
    expect((await cortex({ mode: 'advisory', context: { projectId: '12' } })).status).toBe(404);
    expect(h.ragRetrieve).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/deep-research/document/generate', () => {
  it('grounds sections only in the projects the person can open', async () => {
    const res = await generate();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.retrievalStatus).toBe('ok');
    const sent = promptsSent();
    for (const title of OPEN_TITLES) expect(sent).toContain(title);
    expect(sent).not.toMatch(HIDDEN);
  });

  it('an access check that cannot run is an error, and nothing is generated', async () => {
    h.failWhen = /FROM project_members/;
    const res = await generate();
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROJECT_ACCESS_UNAVAILABLE');
    expect(atomSearchRan()).toBe(false);
    expect(h.chat).not.toHaveBeenCalled();
  });
});
