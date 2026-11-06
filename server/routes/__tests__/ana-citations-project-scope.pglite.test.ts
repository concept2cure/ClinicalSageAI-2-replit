/**
 * AnA's citation routes hold to the projects the person can open (F1, 2026-11-05).
 *
 * Every route under /api/ana/citations read with the organization as its only filter. A member of the organization
 * therefore read another project's governed-artifact citations by id (each sentence's text and its sources), its run
 * history, its exports and its project rollups: a private project's, and another sponsor's. A member who could not
 * edit a project ran citations on it, and anyone pruned every project's run history.
 *
 * Each route now admits the project it reaches before its handler runs: the project it names, its artifact's, or
 * its runs' artifact's. The access policy is the real one (readCurrentProgramActor, canAccessReportProject), on
 * PostgreSQL. Only the engine's run and batch (retrieval and a model; their own suites), the DOCX ledger export (its
 * own suites; here it answers a file for any artifact of the organization, as its own read does) and the pruner's
 * DELETE are recorded calls, so this suite sees only who may reach them.
 *
 * Evidence: docs/evidence/F1/2026-11-05-ana-citations-scope/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failWhen: null as RegExp | null,
}));
const dbDouble = vi.hoisted(() => {
  const query = async (sql: string, params?: unknown[]) => {
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return h.pg.query(sql, params as unknown[]);
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../db', () => dbDouble);
vi.mock('../../db/runtime.js', () => dbDouble);

const pass = vi.hoisted(() => (_q: unknown, _s: unknown, n: () => void) => n());
vi.mock('../../middleware/auth', () => ({ authenticateToken: pass }));
vi.mock('../../middleware/tenantContext', () => ({ requireOrganizationContext: pass, requireTenantContext: pass }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => pass }));
vi.mock('../../db/currentTenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db/currentTenant')>()),
  currentTenantOrgUuid: async () => '00000000-0000-4000-8000-000000000001',
}));

const calls = vi.hoisted(() => ({ run: vi.fn(), batch: vi.fn(), prune: vi.fn(), docx: vi.fn() }));
vi.mock('../../services/ana/citation-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ana/citation-engine')>()),
  runCitationEngine: (...args: unknown[]) => calls.run(...args),
  runCitationEngineForProject: (...args: unknown[]) => calls.batch(...args),
}));
vi.mock('../../services/export/docx-ledger-export', () => ({
  exportArtifactWithLedger: (...args: unknown[]) => calls.docx(...args),
}));
vi.mock('../../services/ana/citation-run-pruner', () => ({
  pruneOldCitationRuns: (...args: unknown[]) => calls.prune(...args),
}));

import anaFeaturesRouter from '../ana-features';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORG = 1;
const ADMIN = 6;
const MEMBER = 7;
const EDITOR = 8;
const FORMER = 5;
const RUN_OPEN = '0a000000-0000-4000-8000-000000000001';
const RUN_PRIV = '0b000000-0000-4000-8000-000000000001';
const RUN_PRIV_2 = '0b000000-0000-4000-8000-000000000002';
const RUN_THEIRS = '0c000000-0000-4000-8000-000000000001';
const RUN_MISSING = '0d000000-0000-4000-8000-000000000001';
const RUN_MISSING_2 = '0d000000-0000-4000-8000-000000000002';

const sentence = (text: string, status: string) =>
  JSON.stringify([{ sentenceIndex: 0, paragraphIndex: 0, charStart: 0, charEnd: text.length, text, contentHash: 'h',
    status, gap: null, flags: [], sources: [{ artifactId: 'src-1', sectionCode: '2.5', relationship: 'supports',
      passageSnippet: `${text} (source)`, relevanceScore: 0.9 }] }]);

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer NOT NULL, name text);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, name text, client_workspace_id integer,
      status text DEFAULT 'active', owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}');
    CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
    CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text NOT NULL UNIQUE, organization_id integer NOT NULL,
      project_id integer NOT NULL, title text, ctd_section text, content text DEFAULT 'body', content_hash text DEFAULT 'h',
      citations jsonb NOT NULL DEFAULT '[]', citation_run_id uuid, citations_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now());
    CREATE TABLE ana_artifact_citation_runs (id uuid PRIMARY KEY, artifact_id text NOT NULL, artifact_pk integer NOT NULL,
      organization_id integer NOT NULL, project_id integer NOT NULL, ctd_section text, artifact_content_hash text NOT NULL,
      total_sentences integer NOT NULL, supported_count integer NOT NULL, contradicted_count integer NOT NULL,
      gap_count integer NOT NULL, total_readiness_delta integer NOT NULL DEFAULT 0,
      filing_blocked boolean NOT NULL DEFAULT false, citations jsonb NOT NULL, run_metadata jsonb, created_by integer,
      created_at timestamptz NOT NULL DEFAULT now());

    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (5), (6), (7), (8), (9);
    -- 5 has left the organization: a user row, no membership.
    INSERT INTO organization_users VALUES (1, 6, 'admin'), (1, 7, 'member'), (1, 8, 'member'), (1, 9, 'member'), (2, 9, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio'), (101, 1, 'Contoso Pharma'), (200, 2, 'Their client');
    INSERT INTO projects (id, organization_id, name, client_workspace_id, owner_id, created_by_id) VALUES
      (10, 1, 'Northwind oncology IND', 100, 9, 9),
      (12, 1, 'Northwind private program', 100, 9, 9),
      (13, 1, 'Contoso device study', 101, 9, 9),
      (20, 2, 'Their program', 200, 9, 9);
    INSERT INTO project_visibility_settings VALUES (1, 10, 'org_public'), (1, 12, 'private'), (1, 13, 'org_public'), (2, 20, 'org_public');
    INSERT INTO project_members VALUES (1, 10, 8, 'edit', 'active'), (1, 12, 9, 'owner', 'active');
  `);
  const artifact = 'INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id, title, ctd_section, citations, citation_run_id) VALUES ($1, $2, $3, $4, $5, $6, $7)';
  await h.pg.query(artifact, ['a-open', 1, 10, 'Open clinical overview', '2.5', sentence('Open claim sentence.', 'supported'), RUN_OPEN]);
  await h.pg.query(artifact, ['a-priv', 1, 12, 'Private clinical overview', '2.5', sentence('Private claim sentence.', 'gap'), RUN_PRIV_2]);
  await h.pg.query(artifact, ['a-contoso', 1, 13, 'Contoso device overview', '2.5', sentence('Contoso claim sentence.', 'supported'), null]);
  await h.pg.query(artifact, ['a-theirs', 2, 20, 'Their clinical overview', '2.5', sentence('Their claim sentence.', 'supported'), RUN_THEIRS]);
  const run = `INSERT INTO ana_artifact_citation_runs (id, artifact_id, artifact_pk, organization_id, project_id, ctd_section,
      artifact_content_hash, total_sentences, supported_count, contradicted_count, gap_count, citations, created_at)
    SELECT $1, a.artifact_id, a.id, a.organization_id, a.project_id, a.ctd_section, 'h', 1, 1, 0, 0, a.citations, now() - ($3 || ' minutes')::interval
      FROM concept2cure_artifacts a WHERE a.artifact_id = $2`;
  await h.pg.query(run, [RUN_OPEN, 'a-open', '1']);
  await h.pg.query(run, [RUN_PRIV, 'a-priv', '2']);
  await h.pg.query(run, [RUN_PRIV_2, 'a-priv', '1']);
  await h.pg.query(run, [RUN_THEIRS, 'a-theirs', '1']);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => {
  h.failWhen = null;
  calls.run.mockReset().mockImplementation(async (artifactId: string) => ({ ran: artifactId }));
  calls.batch.mockReset().mockImplementation(async (projectId: number) => ({ ran: projectId }));
  calls.prune.mockReset().mockImplementation(async () => ({ prunedRunCount: 0, prunedArtifactCount: 0, keepLastN: 10, scope: 'org' }));
  // The exporter's own filter: the artifact id and the organization, nothing else.
  calls.docx.mockReset().mockImplementation(async (artifactId: string, organizationId: unknown) => {
    const { rows } = await h.pg.query('SELECT 1 FROM concept2cure_artifacts WHERE artifact_id = $1 AND organization_id = $2',
      [artifactId, Number(organizationId)]);
    return rows.length === 0 ? null
      : { buffer: Buffer.from('PK docx'), filename: `${artifactId}.docx`, ledgerXmlByteLength: 1, ledger: { schemaVersion: '1' } };
  });
});

function app(userId: number) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    // The tenant context carries the organization as a string, as middleware/tenantContext.ts sets it.
    Object.assign(req, { user: { id: userId, organizationId: ORG }, tenantContext: { organizationId: String(ORG) } });
    next();
  });
  a.use('/api/ana', anaFeaturesRouter);
  return a;
}
const as = (userId: number) => request(app(userId));

/** The answer with the asked-for id taken out, so two answers can be compared word for word. */
const without = (body: unknown, id: string) => JSON.stringify(body).split(id).join('<id>');
const PRIVATE_TEXT = /Private claim|Private clinical|a-priv|Their claim|Their clinical/;

type Send = (id: string) => request.Test;
const ARTIFACT_ROUTES: Array<[string, Send]> = [
  ['GET /citations/:artifactId', (id) => as(MEMBER).get(`/api/ana/citations/${id}`)],
  ['GET /citations/:artifactId/gaps', (id) => as(MEMBER).get(`/api/ana/citations/${id}/gaps`)],
  ['GET /citations/:artifactId/expectations', (id) => as(MEMBER).get(`/api/ana/citations/${id}/expectations`)],
  ['GET /citations/:artifactId/runs', (id) => as(MEMBER).get(`/api/ana/citations/${id}/runs`)],
  ['GET /citations/:artifactId/export', (id) => as(MEMBER).get(`/api/ana/citations/${id}/export`)],
  ['GET /citations/:artifactId/export?format=csv', (id) => as(MEMBER).get(`/api/ana/citations/${id}/export?format=csv`)],
  ['POST /citations/:artifactId/export.docx', (id) => as(MEMBER).post(`/api/ana/citations/${id}/export.docx`).send({})],
  ['POST /citations/run', (id) => as(MEMBER).post('/api/ana/citations/run').send({ artifactId: id })],
];

const PROJECT_ROUTES: Array<[string, (projectId: number) => request.Test]> = [
  ['rollup', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/rollup`)],
  ['stale', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/stale`)],
  ['trends', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/trends`)],
  ['section-coverage', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/section-coverage`)],
  ['graph', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/graph`)],
  ['search', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/search?q=claim`)],
  ['gaps-by-rule', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/gaps-by-rule`)],
  ['export', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/export`)],
  ['export?format=csv', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/export?format=csv`)],
  ['snapshot', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/snapshot`)],
  ['diff', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/diff?from=2026-01-01`)],
  ['readiness-impact', (p) => as(MEMBER).get(`/api/ana/citations/projects/${p}/readiness-impact`)],
  ['POST batch-run', (p) => as(MEMBER).post(`/api/ana/citations/projects/${p}/batch-run`).send({})],
];

describe('an artifact route answers an artifact of a project the person cannot open as a missing artifact', () => {
  for (const [name, send] of ARTIFACT_ROUTES) {
    it(`${name}: a private project's artifact, and another organization's, read as no artifact`, async () => {
      const missing = await send('no-such-artifact');
      for (const hiddenId of ['a-priv', 'a-theirs']) {
        const hidden = await send(hiddenId);
        expect(hidden.status, `${name} ${hiddenId}: ${JSON.stringify(hidden.body)}`).toBe(missing.status);
        expect(without(hidden.body, hiddenId), name).toBe(without(missing.body, 'no-such-artifact'));
        // A route echoes the id it was asked for, as it does for an id of nothing; nothing else of the artifact.
        expect(without(hidden.body, hiddenId), name).not.toMatch(PRIVATE_TEXT);
      }
      const reached = [...calls.run.mock.calls, ...calls.docx.mock.calls].map((args) => args[0]);
      expect(reached, 'no run or export reaches an artifact the person cannot open').not.toContain('a-priv');
      expect(reached).not.toContain('a-theirs');
    });
  }

  it('the not-found answers are the routes’ own: 404 for a read, an empty history for the run list', async () => {
    const read = await as(MEMBER).get('/api/ana/citations/a-priv');
    expect(read.status).toBe(404);
    expect(read.body).toEqual({ error: 'Artifact not found', code: 'ARTIFACT_NOT_FOUND' });
    const runs = await as(MEMBER).get('/api/ana/citations/a-priv/runs');
    expect(runs.status).toBe(200);
    expect(runs.body).toEqual({ artifactId: 'a-priv', total: 0, runs: [] });
    const run = await as(MEMBER).post('/api/ana/citations/run').send({ artifactId: 'a-priv' });
    expect(run.status).toBe(404);
    expect(run.body).toEqual({ error: 'Artifact not found: a-priv', code: 'ARTIFACT_NOT_FOUND' });
  });
});

describe('an artifact of a project the person can open still reads', () => {
  it('its citations, with each sentence and its sources', async () => {
    const res = await as(MEMBER).get('/api/ana/citations/a-open');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ artifactId: 'a-open', citationRunId: RUN_OPEN });
    expect(res.body.citations[0].text).toBe('Open claim sentence.');
  });

  it('another sponsor’s project the person can open: the route names one artifact, so it reads', async () => {
    const res = await as(MEMBER).get('/api/ana/citations/a-contoso');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.citations[0].text).toBe('Contoso claim sentence.');
  });

  it('its run history, and one run', async () => {
    const list = await as(MEMBER).get('/api/ana/citations/a-open/runs');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.runs.map((r: { runId: string }) => r.runId)).toEqual([RUN_OPEN]);
    const one = await as(MEMBER).get(`/api/ana/citations/runs/${RUN_OPEN}`);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body.citations[0].text).toBe('Open claim sentence.');
  });

  it('the private project’s owner reads its artifact and diffs its runs', async () => {
    const res = await as(9).get('/api/ana/citations/a-priv');
    expect(res.status).toBe(200);
    expect(res.body.citations[0].text).toBe('Private claim sentence.');
    const diff = await as(9).get(`/api/ana/citations/runs/${RUN_PRIV}/diff?against=${RUN_PRIV_2}`);
    expect(diff.status, JSON.stringify(diff.body)).toBe(200);
  });
});

describe('a run route answers a run of a project the person cannot open as a missing run', () => {
  it('GET /citations/runs/:runId', async () => {
    const missing = await as(MEMBER).get(`/api/ana/citations/runs/${RUN_MISSING}`);
    expect(missing.status).toBe(404);
    for (const hiddenId of [RUN_PRIV, RUN_THEIRS]) {
      const hidden = await as(MEMBER).get(`/api/ana/citations/runs/${hiddenId}`);
      expect(hidden.status, JSON.stringify(hidden.body)).toBe(404);
      expect(hidden.body).toEqual(missing.body);
      expect(hidden.text).not.toMatch(PRIVATE_TEXT);
    }
  });

  it('GET /citations/runs/:runId/diff', async () => {
    const missing = await as(MEMBER).get(`/api/ana/citations/runs/${RUN_MISSING}/diff?against=${RUN_MISSING_2}`);
    expect(missing.status).toBe(404);
    for (const [from, to] of [[RUN_PRIV, RUN_PRIV_2], [RUN_OPEN, RUN_PRIV]]) {
      const hidden = await as(MEMBER).get(`/api/ana/citations/runs/${from}/diff?against=${to}`);
      expect(hidden.status, JSON.stringify(hidden.body)).toBe(404);
      expect(hidden.body).toEqual(missing.body);
      expect(hidden.text).not.toMatch(PRIVATE_TEXT);
    }
  });

  it('a malformed run id is still the route’s own 400', async () => {
    const res = await as(MEMBER).get('/api/ana/citations/runs/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });
});

describe('a project route admits only a project the person can open', () => {
  for (const [name, send] of PROJECT_ROUTES) {
    it(`${name}: a private project, and another organization's, are refused as a project that does not exist`, async () => {
      const missing = await send(999);
      expect(missing.status, `${name}: ${JSON.stringify(missing.body)}`).toBe(404);
      expect(missing.body).toEqual({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
      for (const hidden of [12, 20]) {
        const res = await send(hidden);
        expect(res.status, `${name} ${hidden}: ${JSON.stringify(res.body)}`).toBe(404);
        expect(res.body).toEqual(missing.body);
        expect(res.text).not.toMatch(PRIVATE_TEXT);
      }
      expect(calls.batch).not.toHaveBeenCalled();
    });
  }

  it('a project the person can open reads: rollup, graph, search, export and gaps-by-rule', async () => {
    for (const path of ['rollup', 'graph', 'search?q=claim', 'export', 'gaps-by-rule']) {
      const res = await as(MEMBER).get(`/api/ana/citations/projects/10/${path}`);
      expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.text).not.toMatch(PRIVATE_TEXT);
    }
    const search = await as(MEMBER).get('/api/ana/citations/projects/10/search?q=claim');
    expect(search.body.total).toBe(1);
    const rollup = await as(MEMBER).get('/api/ana/citations/projects/10/rollup');
    expect(JSON.stringify(rollup.body)).toContain('Open clinical overview');
  });

  it('a malformed project id is still the route’s own 400', async () => {
    const res = await as(MEMBER).get('/api/ana/citations/projects/abc/graph');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });
});

describe('a write needs the project’s edit right', () => {
  it('POST /citations/run: a member who can read the project but not edit it is refused, and nothing runs', async () => {
    const res = await as(MEMBER).post('/api/ana/citations/run').send({ artifactId: 'a-open' });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code).toBe('PROJECT_WRITE_PERMISSION_DENIED');
    expect(calls.run).not.toHaveBeenCalled();
  });

  it('POST /citations/run: the project’s editor runs it', async () => {
    const res = await as(EDITOR).post('/api/ana/citations/run').send({ artifactId: 'a-open' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(calls.run).toHaveBeenCalledTimes(1);
    expect(calls.run.mock.calls[0][0]).toBe('a-open');
  });

  it('POST /citations/projects/:projectId/batch-run: refused without the edit right, run with it', async () => {
    const refused = await as(MEMBER).post('/api/ana/citations/projects/10/batch-run').send({});
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.code).toBe('PROJECT_WRITE_PERMISSION_DENIED');
    expect(calls.batch).not.toHaveBeenCalled();
    const ran = await as(EDITOR).post('/api/ana/citations/projects/10/batch-run').send({});
    expect(ran.status, JSON.stringify(ran.body)).toBe(200);
    expect(calls.batch.mock.calls[0][0]).toBe(10);
  });

  it('POST /citations/runs/prune removes every project’s run history: a member is refused, an administrator prunes', async () => {
    const refused = await as(MEMBER).post('/api/ana/citations/runs/prune').send({});
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.code).toBe('PROJECT_WRITE_PERMISSION_DENIED');
    expect(calls.prune).not.toHaveBeenCalled();
    const pruned = await as(ADMIN).post('/api/ana/citations/runs/prune').send({});
    expect(pruned.status, JSON.stringify(pruned.body)).toBe(200);
    expect(calls.prune).toHaveBeenCalledTimes(1);
  });
});

describe('a check that cannot run is an error with a code, never an answer', () => {
  const cases: Array<[string, RegExp, Send]> = [
    ['the sharing policy', /project_visibility_settings/, (id) => as(MEMBER).get(`/api/ana/citations/${id}`)],
    ['the current membership', /FROM organization_users/, (id) => as(MEMBER).get(`/api/ana/citations/${id}`)],
    ['the artifact’s project', /SELECT project_id\s+FROM concept2cure_artifacts/, (id) => as(MEMBER).get(`/api/ana/citations/${id}`)],
    ['the run’s project', /FROM ana_artifact_citation_runs r\s+JOIN concept2cure_artifacts/, () => as(MEMBER).get(`/api/ana/citations/runs/${RUN_OPEN}`)],
    ['the project policy on a project route', /project_members/, () => as(MEMBER).get('/api/ana/citations/projects/10/graph')],
  ];
  for (const [what, failWhen, send] of cases) {
    it(`${what} unreadable: 503 PROJECT_ACCESS_UNAVAILABLE, and no citation`, async () => {
      h.failWhen = failWhen;
      const res = await send('a-open');
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body.code).toBe('PROJECT_ACCESS_UNAVAILABLE');
      expect(res.text).not.toMatch(/Open claim|Open clinical/);
    });
  }

  it('a person who is no longer a member is refused before any artifact is looked up, whether it exists or not', async () => {
    const existing = await as(FORMER).get('/api/ana/citations/a-open');
    const missing = await as(FORMER).get('/api/ana/citations/no-such-artifact');
    expect(existing.status, JSON.stringify(existing.body)).toBe(403);
    expect(existing.body.code).toBe('PROJECT_ACTOR_ACCESS_DENIED');
    expect(existing.body).toEqual(missing.body);
    expect(existing.text).not.toMatch(/Open claim/);
  });
});
