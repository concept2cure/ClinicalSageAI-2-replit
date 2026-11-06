/**
 * Four listing doors hold to the projects the person can open (F1, 2026-11-05).
 *
 *   - GET /api/mdx/search: the kit's global search. Every type that reads a project's records read the organization's,
 *     so a member found a private project's program, its artifacts by title and by content, its risks, and a
 *     colleague's AnA conversations.
 *   - /api/project-sections: every route that names a project returned, or changed, any project of the organization:
 *     its sections with their artifact counts, open comments, history, milestones and timeline.
 *   - GET /api/concept2cure/projects/all/artifacts-summary: the organization's artifact counts, a private project's in.
 *   - The MCP tool c2c_list_projects: every program of the organization.
 *
 * The founder's rule: a CRO works across authorized sponsor projects "without mixing sponsor data or permissions".
 * The access policy is the real one (readCurrentProgramActor, getAccessibleReportProjectIds, canAccessReportProject,
 * getCurrentAccessibleProgramScope), on PostgreSQL (PGlite), with no access stub. Only authentication, the rate limiter
 * and the tenant-context middleware pass through, and the request carries the identity a verified session does.
 *
 * Evidence: docs/evidence/F1/2026-11-05-listing-doors-scope/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  db: null as unknown,
  failWhen: null as RegExp | null,
  statements: [] as string[],
  pass: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../db', () => {
  const query = async (sql: string, params?: unknown[]) => {
    h.statements.push(sql);
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    const result = await h.pg.query(sql, (params ?? []) as unknown[]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, get db() { return h.db; } };
});
vi.mock('../c2c/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../c2c/shared')>()),
  concept2cureRateLimiter: h.pass,
}));
vi.mock('../../auth', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), authMiddleware: h.pass }));
vi.mock('../../middleware/tenantContext', () => ({ tenantContextMiddleware: h.pass, requireOrganizationContext: h.pass }));
vi.mock('../../middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => h.pass }));

import { regulatoryPrograms } from '../../../shared/schema/programs';
import mdxSearchRouter from '../mdx-search';
import projectSectionsRouter from '../project-sections';
import artifactsRouter from '../c2c/artifacts';
import { listProjects } from '../../mcp/tools/catalog';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const ORG = 1;
const MEMBER = 7; // a CRO consultant: an organization member on no project's team
const OWNER = 9; // the private project's owner: the positive control
const P_A1 = '11111111-1111-4111-8111-111111111111';
const P_B = '33333333-3333-4333-8333-333333333333';
const P_PRIV = '44444444-4444-4444-8444-444444444444';
const P_THEIRS = '55555555-5555-4555-8555-555555555555';
const OPEN = 10;
const PRIVATE = 12;
const MISSING = 999;

beforeAll(async () => {
  h.pg = new PGlite();
  h.db = drizzle(h.pg);
  // regulatory_programs as `drizzle-kit push` creates it: listPrograms selects every declared column.
  const kit = createRequire(import.meta.url)('drizzle-kit/api') as typeof import('drizzle-kit/api');
  for (const statement of await kit.generateMigration(kit.generateDrizzleJson({}), kit.generateDrizzleJson({ regulatoryPrograms }))) {
    try { await h.pg.exec(statement); } catch (error) { if (!/FOREIGN KEY/.test(statement)) throw error; }
  }
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer NOT NULL, name text);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text,
      regulatory_program_id uuid, client_workspace_id integer, status text DEFAULT 'active',
      owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}', progress integer, updated_at timestamptz);
    CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
    CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id integer, project_id integer,
      title text, content text, ctd_section text, status text, version integer DEFAULT 1, updated_at timestamptz DEFAULT now());
    CREATE TABLE risk_items (id serial PRIMARY KEY, organization_id integer, program_id uuid, ref_code text, hazard text,
      harm text, status text DEFAULT 'open', deleted_at timestamptz);
    CREATE TABLE chat_threads (id text PRIMARY KEY, user_id integer, project_id integer, organization_id integer,
      program_id uuid, title text, updated_at timestamp DEFAULT now());
    CREATE TABLE project_sections (id serial PRIMARY KEY, organization_id integer, project_id integer, section_code text,
      module text, title text, status text DEFAULT 'not_started', assigned_to integer, reviewer_id integer,
      deadline timestamptz, estimated_hours numeric, actual_hours numeric, priority text, metadata jsonb DEFAULT '{}',
      notes text, started_at timestamptz, completed_at timestamptz, locked_at timestamptz, locked_by integer,
      updated_at timestamptz DEFAULT now());
    CREATE TABLE section_comments (id serial PRIMARY KEY, organization_id integer, project_id integer, section_code text,
      author_id integer, content text, parent_id integer, resolved boolean DEFAULT false, created_at timestamptz DEFAULT now());
    CREATE TABLE section_dependencies (id serial PRIMARY KEY, organization_id integer, project_id integer, section_code text,
      depends_on_code text, dependency_type text, UNIQUE (project_id, section_code, depends_on_code));
    CREATE TABLE project_milestones (id serial PRIMARY KEY, organization_id integer, project_id integer, name text,
      description text, target_date timestamptz, linked_sections jsonb, created_by integer, completed_at timestamptz,
      updated_at timestamptz DEFAULT now());
    CREATE TABLE section_status_log (id serial PRIMARY KEY, organization_id integer, project_id integer, section_code text,
      old_status text, new_status text, changed_by integer, change_reason text, metadata jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE project_notifications (id serial PRIMARY KEY, organization_id integer, project_id integer, user_id integer,
      type text, title text, body text, message text, section_code text, action_url text, read boolean DEFAULT false,
      read_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE FUNCTION actor_name(uid integer) RETURNS TABLE(name text, email text) LANGUAGE sql
      AS 'SELECT u.name, u.email FROM users u WHERE u.id = uid';

    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (7, 'C. Consultant', 'c@cro', 'active'), (9, 'P. Owner', 'p@cro', 'active');
    INSERT INTO organization_users VALUES (1, 7, 'member'), (1, 9, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio'), (101, 1, 'Contoso Pharma'), (200, 2, 'Their client');
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, status) VALUES
      ('${P_A1}', 1, 'Northwind oncology IND', 'NW-1', 'IND', 'drug', 'FDA', 'NW-101', 'active'),
      ('${P_B}', 1, 'Contoso device study', 'CT-1', '510K', 'device', 'FDA', 'CT-Device', 'active'),
      ('${P_PRIV}', 1, 'Northwind private program', 'NW-PRIV', 'IND', 'drug', 'FDA', 'NW-SECRET', 'active'),
      ('${P_THEIRS}', 2, 'Their program', 'THEIRS-1', 'IND', 'drug', 'FDA', 'Theirs', 'active');
    INSERT INTO projects (id, organization_id, code, name, regulatory_program_id, client_workspace_id, owner_id, created_by_id) VALUES
      (10, 1, 'NW-1', 'Northwind oncology IND', '${P_A1}', 100, 9, 9),
      (12, 1, 'NW-PRIV', 'Northwind private program', '${P_PRIV}', 100, 9, 9),
      (13, 1, 'CT-1', 'Contoso device study', '${P_B}', 101, 9, 9),
      (20, 2, 'THEIRS-1', 'Their program', '${P_THEIRS}', 200, 9, 9);
    INSERT INTO project_visibility_settings VALUES (1, 10, 'org_public'), (1, 12, 'private'), (1, 13, 'org_public'), (2, 20, 'org_public');
    INSERT INTO project_members VALUES (1, 12, 9, 'owner', 'active');

    INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id, title, content, ctd_section, status) VALUES
      ('a-open',   1, 10, 'Northwind memo', 'zebra dosing rationale', 'm2.5', 'draft'),
      ('a-other',  1, 13, 'Contoso memo',   'zebra bench data',       'm2.5', 'approved'),
      ('a-priv',   1, 12, 'Private memo',   'zebra secret finding',   'm2.5', 'review'),
      ('a-theirs', 2, 20, 'Their memo',     'zebra theirs',           'm2.5', 'locked');
    INSERT INTO risk_items (organization_id, program_id, ref_code, hazard, harm) VALUES
      (1, '${P_A1}', 'R-OPEN', 'Hemolysis open', 'harm'),
      (1, '${P_PRIV}', 'R-PRIV', 'Hemolysis private', 'harm'),
      (1, NULL, 'R-ORG', 'Hemolysis organization', 'harm');
    INSERT INTO chat_threads (id, user_id, organization_id, program_id, title) VALUES
      ('t-mine',      7, 1, '${P_A1}', 'Dosing question mine'),
      ('t-mine-priv', 7, 1, '${P_PRIV}', 'Dosing question in a project I left'),
      ('t-colleague', 9, 1, '${P_A1}', 'Dosing question colleague');
    INSERT INTO project_sections (organization_id, project_id, section_code, module, title, status) VALUES
      (1, 10, 'm2.5', 'M2', 'Open clinical overview', 'drafting'),
      (1, 12, 'm2.5', 'M2', 'Private clinical overview', 'drafting');
    INSERT INTO section_comments (organization_id, project_id, section_code, author_id, content) VALUES
      (1, 12, 'm2.5', 9, 'private comment');
    INSERT INTO project_milestones (organization_id, project_id, name, target_date, created_by) VALUES
      (1, 12, 'Private milestone', now() + interval '30 days', 9),
      (1, 10, 'Open milestone', now() + interval '30 days', 9);
  `);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => { h.failWhen = null; h.statements.length = 0; });

/** What a verified session leaves on the request. */
function app(userId: number | undefined) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { user: { id: userId, organizationId: ORG, role: 'member' }, userId, organizationId: ORG });
    next();
  });
  a.use('/api/mdx', mdxSearchRouter);
  a.use('/api/project-sections', projectSectionsRouter);
  a.use('/api/concept2cure', artifactsRouter);
  return a;
}
const POLICY_READ = /FROM projects p LEFT JOIN project_visibility_settings/;

// ── 1. GET /api/mdx/search ───────────────────────────────────────────────────

describe('GET /api/mdx/search', () => {
  const search = (userId: number | undefined, q: string, type: string) =>
    request(app(userId)).get(`/api/mdx/search?q=${encodeURIComponent(q)}&type=${type}`);
  const ids = (body: { data?: Record<string, Array<{ id: unknown; title: string }>> }, type: string) =>
    (body.data?.[type] ?? []).map((hit) => hit.title).sort();

  it('lists the artifacts of the projects the member can open, of every sponsor, never a private project’s', async () => {
    const res = await search(MEMBER, 'memo', 'artifact');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res.body, 'artifact')).toEqual(['Contoso memo', 'Northwind memo']);
    expect(JSON.stringify(res.body)).not.toMatch(/Private memo|Their memo/);
  });

  it('a content-only match does not disclose what a private project holds', async () => {
    const res = await search(MEMBER, 'zebra', 'artifact');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res.body, 'artifact')).toEqual(['Contoso memo', 'Northwind memo']);
  });

  it('lists the programs the member can open, never the private program', async () => {
    const res = await search(MEMBER, 'Northwind', 'program');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res.body, 'program')).toEqual(['NW-1 · Northwind oncology IND']);
  });

  it('a program-keyed record of a private project is not found; an organization-level one still is', async () => {
    const res = await search(MEMBER, 'Hemolysis', 'risk');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res.body, 'risk')).toEqual(['R-OPEN · Hemolysis open', 'R-ORG · Hemolysis organization']);
  });

  it('finds only the person’s own conversations, in projects they can open', async () => {
    const res = await search(MEMBER, 'Dosing', 'thread');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res.body, 'thread')).toEqual(['Dosing question mine']);
  });

  it('the private project’s owner finds its program and artifact (the control)', async () => {
    const res = await search(OWNER, 'Private', 'artifact,program');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(ids(res.body, 'artifact')).toEqual(['Private memo']);
    expect(ids(res.body, 'program')).toEqual(['NW-PRIV · Northwind private program']);
  });

  it('a scope check that cannot run is an error with a code, and nothing is searched', async () => {
    h.failWhen = POLICY_READ;
    const res = await search(MEMBER, 'memo', 'artifact,program');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_UNAVAILABLE');
    expect(h.statements.some((s) => /FROM concept2cure_artifacts\s+WHERE/.test(s))).toBe(false);
  });

  it('a caller with no identified member is refused with a code, not answered empty', async () => {
    const res = await search(undefined, 'memo', 'artifact');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PROJECT_ACTOR_ACCESS_DENIED');
  });
});

// ── 2. /api/project-sections ─────────────────────────────────────────────────

describe('/api/project-sections', () => {
  const READS = ['', '/summary', '/dependencies', '/milestones', '/timeline', '/m2.5', '/m2.5/comments', '/m2.5/history'];
  const get = (userId: number, path: string, projectId: number) =>
    request(app(userId)).get(`/api/project-sections${path}?project_id=${projectId}`);

  it.each(READS)('GET %s answers a private project exactly as a project that does not exist', async (path) => {
    const hidden = await get(MEMBER, path, PRIVATE);
    const missing = await get(MEMBER, path, MISSING);
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(404);
    expect(hidden.body).toEqual({ error: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    expect({ status: missing.status, body: missing.body }).toEqual({ status: hidden.status, body: hidden.body });
    expect(JSON.stringify(hidden.body)).not.toMatch(/Private|a-priv/);
  });

  it('lists an open project’s sections with their artifact count', async () => {
    const res = await get(MEMBER, '', OPEN);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.sections.map((s: { title: string }) => s.title)).toEqual(['Open clinical overview']);
    expect(Number(res.body.sections[0].artifact_count)).toBe(1);
  });

  it('the private project’s owner reads its sections, artifacts and comments (the control)', async () => {
    const list = await get(OWNER, '', PRIVATE);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.sections[0]).toMatchObject({ title: 'Private clinical overview' });
    expect(Number(list.body.sections[0].open_comments)).toBe(1);
    const one = await get(OWNER, '/m2.5', PRIVATE);
    expect(one.body.artifacts.map((a: { artifact_id: string }) => a.artifact_id)).toEqual(['a-priv']);
  });

  it('a write naming a private project is refused as not found, and writes nothing', async () => {
    const comment = await request(app(MEMBER)).post('/api/project-sections/m2.5/comments')
      .send({ project_id: PRIVATE, content: 'a member who cannot open it' });
    expect({ status: comment.status, body: comment.body }).toEqual({ status: 404, body: { error: 'Project not found', code: 'PROJECT_NOT_FOUND' } });
    const status = await request(app(MEMBER)).patch('/api/project-sections/m2.5/status')
      .send({ project_id: PRIVATE, new_status: 'internal_review' });
    expect(status.status).toBe(404);
    const { rows } = await h.pg.query<{ n: number }>(`SELECT
      (SELECT COUNT(*) FROM section_comments WHERE project_id = 12)::int
      + (SELECT COUNT(*) FROM section_status_log)::int AS n`);
    expect(rows[0].n).toBe(1);
    expect((await h.pg.query<{ status: string }>(`SELECT status FROM project_sections WHERE project_id = 12`)).rows[0].status).toBe('drafting');
  });

  it('a private project’s milestone is answered as a missing one, and is neither changed nor deleted', async () => {
    const { rows } = await h.pg.query<{ id: number }>(`SELECT id FROM project_milestones WHERE project_id = 12`);
    const hidden = await request(app(MEMBER)).patch(`/api/project-sections/milestones/${rows[0].id}`).send({ name: 'renamed' });
    const missing = await request(app(MEMBER)).patch(`/api/project-sections/milestones/${MISSING}`).send({ name: 'renamed' });
    expect({ status: hidden.status, body: hidden.body }).toEqual({ status: 404, body: { error: 'Milestone not found' } });
    expect({ status: missing.status, body: missing.body }).toEqual({ status: hidden.status, body: hidden.body });
    const deleted = await request(app(MEMBER)).delete(`/api/project-sections/milestones/${rows[0].id}`);
    expect({ status: deleted.status, body: deleted.body }).toEqual({ status: 404, body: { error: 'Milestone not found' } });
    expect((await h.pg.query<{ name: string }>(`SELECT name FROM project_milestones WHERE project_id = 12`)).rows)
      .toEqual([{ name: 'Private milestone' }]);
  });

  it('a check that cannot run is an error with a code, never a list', async () => {
    h.failWhen = POLICY_READ;
    const res = await get(MEMBER, '', OPEN);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PROJECT_ACCESS_UNAVAILABLE');
    expect(h.statements.some((s) => /FROM project_sections ps/.test(s))).toBe(false);
  });
});

// ── 3. GET /api/concept2cure/projects/all/artifacts-summary ──────────────────

describe('GET /api/concept2cure/projects/all/artifacts-summary', () => {
  const summary = (userId: number) => request(app(userId)).get('/api/concept2cure/projects/all/artifacts-summary');

  it('counts the artifacts of the projects the member can open, of every sponsor, never a private project’s', async () => {
    const res = await summary(MEMBER);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ total: 2, draft: 1, review: 0, approved: 1 });
  });

  it('the private project’s owner counts its artifact too (the control)', async () => {
    const res = await summary(OWNER);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ total: 3, draft: 1, review: 1, approved: 1 });
  });

  it('a check that cannot run is an error with a code, never a zero', async () => {
    h.failWhen = POLICY_READ;
    const res = await summary(MEMBER);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toContain('PROJECT_ACCESS_UNAVAILABLE');
    expect(res.body.data).toBeUndefined();
  });
});

// ── 4. MCP c2c_list_projects ─────────────────────────────────────────────────

describe('MCP c2c_list_projects', () => {
  const pool = () => ({ query: async (sql: string, params?: unknown[]) => {
    h.statements.push(sql);
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return { rows: (await h.pg.query(sql, (params ?? []) as unknown[])).rows };
  } });
  const run = (userId: number, sqlClient: unknown = pool()) => listProjects.run({ limit: 50 } as never, {
    principal: { userId, organizationId: ORG },
    config: {},
    sqlClient,
    ana: { organizationId: ORG, userId, organizationUuid: null },
  } as never);
  const codes = (outcome: { kind: string; data?: Record<string, unknown> }) =>
    ((outcome.data?.projects ?? []) as Array<{ code: string }>).map((p) => p.code).sort();

  it('lists the programs the member can open, of every sponsor, never the private one or another organization’s', async () => {
    const outcome = await run(MEMBER);
    expect(outcome.kind, JSON.stringify(outcome)).toBe('ok');
    expect(codes(outcome)).toEqual(['CT-1', 'NW-1']);
    expect(outcome.kind === 'ok' && outcome.data.total).toBe(2);
    expect(JSON.stringify(outcome)).not.toMatch(/NW-PRIV|THEIRS/);
  });

  it('the private project’s owner lists it too (the control)', async () => {
    expect(codes(await run(OWNER))).toEqual(['CT-1', 'NW-1', 'NW-PRIV']);
  });

  it('a scope that cannot be read is a refusal with a code, never a list', async () => {
    h.failWhen = POLICY_READ;
    const outcome = await run(MEMBER);
    expect(outcome.kind).toBe('refused');
    expect(outcome.data).toMatchObject({ code: 'PROJECT_ACCESS_UNAVAILABLE' });
    expect(outcome.data?.projects).toBeUndefined();
  });

  it('without the call’s own connection, nothing is listed', async () => {
    const outcome = await run(MEMBER, null);
    expect(outcome).toMatchObject({ kind: 'refused', data: { code: 'REQUEST_DB_CONTEXT_REQUIRED' } });
  });
});
