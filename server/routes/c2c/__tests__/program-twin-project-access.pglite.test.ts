/**
 * The program-twin router admits the project before any handler reads or
 * writes it (D6, tenant isolation; docs/evidence/D6-CMC-TWIN-TENANT/2026-10-29/).
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * GET and PUT /api/concept2cure/projects/:projectId/cmc and GET …/context read
 * and wrote `projects` (and `project_tasks`) by integer id alone: no
 * organization predicate, no project-access check, no role gate on the write.
 * Authentication was the only thing in front of them. Whether a caller in one
 * organization could reach another's project then depended on Row-Level
 * Security alone:
 *   - RLS_ENFORCE=on (production refuses to boot otherwise): the pool applies
 *     the caller's tenant and the FORCEd tenant_isolation_policy hides the row,
 *     so the handler answered 404 and the UPDATE matched nothing;
 *   - RLS_ENFORCE unset or off (every environment that is not production): the
 *     policy passes every row, so org A read org B's CMC data and overwrote it.
 * And inside one organization RLS cannot help at all: a member who is not on a
 * private project read and wrote its CMC data, a viewer wrote it, and an
 * archived project took writes.
 *
 * GET and PUT …/cmc were retired on 2026-10-29 (decision P-62: a project's
 * CMC data has one home, the CMC / Module 3 register;
 * docs/evidence/CMC-M3-GA/2026-10-29/p62-one-cmc-home/). The router now serves
 * reads only. Its read cases are asked of …/context, which still reads the
 * project and its tasks. The PUT is asked once more, across tenants, to show
 * it is not served and writes nothing.
 *
 * ── What runs for real here ──────────────────────────────────────────────────
 * PGlite is a real PostgreSQL. The tables are the ones `drizzle-kit push`
 * creates from shared/schema (the deploy's first step), and their policies come
 * from the migration set's own tenant isolation sweep (the set's last file).
 * The runtime role is a NOSUPERUSER NOBYPASSRLS role that OWNS the tables, as
 * on a provisioned database, so it is FORCE that subjects it to the policy. The
 * pool is the production primitive — `instrumentPool` from
 * server/db/poolInstrumentation.ts wraps each statement with the caller's
 * tenant exactly as it does in production — and the request's tenant scope is
 * opened by the real `establishRequestTenantScope`. Drizzle is the same
 * node-postgres driver over that pool that server/db/runtime.ts builds. Only
 * authentication, the rate limiter and the tenant-context middleware are
 * pass-throughs: the request carries the identity a verified session would.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { TENANT_ISOLATION_SWEEP } from '../../../../scripts/db/migration-set.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const RUNTIME_ROLE = 'c2c_runtime';

type QueryConfig = string | { text: string; rowMode?: string; values?: unknown[] };

const h = vi.hoisted(() => {
  const state = {
    pg: null as unknown as {
      query: (text: string, params: unknown[], options: unknown) => Promise<{ rows: unknown[]; affectedRows?: number; fields?: unknown[] }>;
      exec: (sql: string) => Promise<unknown>;
    },
    /** Every statement the application sent, in order. */
    statements: [] as string[],
    /** A statement the database cannot run, to show a check that did not run is not a denial. */
    failOn: null as null | { pattern: RegExp; code: string },
    held: Promise.resolve(),
  };
  // node-postgres hands Drizzle these types as text; PGlite would parse them.
  const identity = (value: string) => value;
  const parsers = { 1082: identity, 1114: identity, 1184: identity, 1186: identity };
  const run = async (config: QueryConfig, values?: unknown[]) => {
    const text = typeof config === 'string' ? config : config.text;
    const rowMode = typeof config === 'string' ? undefined : config.rowMode;
    const params = values ?? (typeof config === 'string' ? [] : config.values ?? []);
    state.statements.push(text);
    if (state.failOn?.pattern.test(text)) {
      throw Object.assign(new Error('the database could not run this statement'), { code: state.failOn.code });
    }
    const result = await state.pg.query(text, params, { rowMode: rowMode === 'array' ? 'array' : 'object', parsers });
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, fields: result.fields ?? [], command: '' };
  };
  /** One connection at a time (PGlite is one session), as the runtime role. */
  const pool = {
    async connect() {
      let unlock!: () => void;
      const previous = state.held;
      state.held = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      try {
        // Module-load work (the audit log's initializer) reaches the pool
        // before the database is open; it is refused, never left holding it.
        if (!state.pg) throw new Error('the test database is not open yet');
        await state.pg.exec('SET ROLE c2c_runtime');
      } catch (error) {
        unlock();
        throw error;
      }
      return { query: run, release: () => { void state.pg.exec('RESET ROLE').finally(unlock); } };
    },
    async query(config: QueryConfig, values?: unknown[]) {
      const client = await pool.connect();
      try { return await client.query(config, values); } finally { client.release(); }
    },
    on() { return pool; },
  };
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { state, pool, pass };
});

vi.mock('../../../db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { instrumentPool } = await import('../../../db/poolInstrumentation');
  const pool = instrumentPool(h.pool as never);
  return { pool, getPool: () => pool, db: drizzle(pool as never, { schema }) };
});
// The context's CMC readiness resolves the project through the runtime module; it is the same pool here.
vi.mock('../../../db/runtime', async () => await import('../../../db'));
vi.mock('../shared', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared')>()),
  concept2cureRateLimiter: h.pass,
}));
vi.mock('../../../auth', () => ({ authMiddleware: h.pass }));
vi.mock('../../../middleware/tenantContext', () => ({ tenantContextMiddleware: h.pass, requireOrganizationContext: h.pass }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined }),
}));

import * as schema from '../../../../shared/schema';
import { establishRequestTenantScope } from '../../../middleware/establishRequestTenantScope';
import programTwinRoutes from '../program-twin';

const ORG_A = 1;
const ORG_B = 2;
/** Org A: owner of 401/402/403, a viewer, and a member who is on none of them. */
const A_OWNER = { userId: 10, orgId: ORG_A, role: 'member' };
const A_VIEWER = { userId: 11, orgId: ORG_A, role: 'viewer' };
const A_COLLEAGUE = { userId: 12, orgId: ORG_A, role: 'member' };
const B_PROJECT = 501;
const A_PROJECT = 401;
const A_PRIVATE = 402;
const A_ARCHIVED = 403;
const B_SECRET = 'Org B confidential';
/** What the retired PUT …/cmc took. */
const CMC_WRITE = { drugSubstance: { substanceName: 'written by org A' } };

type Actor = typeof A_OWNER;

function app(actor: Actor) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    // What authenticateToken leaves on the request for a verified session.
    Object.assign(req, {
      user: { id: actor.userId, userId: actor.userId, organizationId: actor.orgId, role: actor.role },
      userId: actor.userId,
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/concept2cure', programTwinRoutes);
  return a;
}

const url = (projectId: number, tail: string) => `/api/concept2cure/projects/${projectId}/${tail}`;
const getAs = (actor: Actor, projectId: number, tail: string) => request(app(actor)).get(url(projectId, tail));
const putCmcAs = (actor: Actor, projectId: number, body: object = CMC_WRITE) =>
  request(app(actor)).put(url(projectId, 'cmc')).send(body);

/** The row as the database holds it, read as the owner (no policy). */
async function metadataOf(projectId: number): Promise<Record<string, unknown>> {
  const { rows } = await h.state.pg.query('SELECT metadata FROM projects WHERE id = $1', [projectId], {});
  return (rows[0] as { metadata: Record<string, unknown> }).metadata;
}

const B_METADATA = { cmcDrugSubstance: { substanceName: `${B_SECRET} API` }, cmcLastUpdated: '2026-10-01T00:00:00.000Z' };

async function seed(): Promise<void> {
  await h.state.pg.exec(`
    TRUNCATE organizations, users, organization_users, client_workspaces, projects, project_visibility_settings,
      project_members, project_tasks, concept2cure_artifacts, concept2cure_review_assignments RESTART IDENTITY CASCADE;
    INSERT INTO organizations (id, name, slug) VALUES (${ORG_A}, 'Org A', 'org-a'), (${ORG_B}, 'Org B', 'org-b');
    INSERT INTO users (id, name, email, password_hash) VALUES
      (10, 'A owner', 'a-owner@example.test', 'x'), (11, 'A viewer', 'a-viewer@example.test', 'x'),
      (12, 'A colleague', 'a-colleague@example.test', 'x'), (20, 'B admin', 'b-admin@example.test', 'x');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (${ORG_A}, 10, 'member'), (${ORG_A}, 11, 'viewer'), (${ORG_A}, 12, 'member'), (${ORG_B}, 20, 'admin');
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES
      (100, ${ORG_A}, 'A workspace', 'a-ws'), (200, ${ORG_B}, 'B workspace', 'b-ws');
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, metadata) VALUES
      (${B_PROJECT}, ${ORG_B}, 200, '${B_SECRET} program', 'regulatory', 'active', 20, 20, '${JSON.stringify(B_METADATA)}'),
      (${A_PROJECT}, ${ORG_A}, 100, 'A program', 'regulatory', 'active', 10, 10, '{"cmcDrugProduct":{"productName":"A tablet"}}'),
      (${A_PRIVATE}, ${ORG_A}, 100, 'A private program', 'regulatory', 'active', 10, 10, '{"cmcDrugSubstance":{"substanceName":"A private API"}}'),
      (${A_ARCHIVED}, ${ORG_A}, 100, 'A archived program', 'regulatory', 'archived', 10, 10, '{}');
    INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES (${ORG_A}, ${A_PRIVATE}, 'private');
    INSERT INTO project_tasks (organization_id, project_id, name, status) VALUES
      (${ORG_B}, ${B_PROJECT}, '${B_SECRET} task', 'todo'),
      (${ORG_A}, ${A_PROJECT}, 'A task', 'todo'),
      (${ORG_A}, ${A_PRIVATE}, 'A private task', 'todo');
    INSERT INTO concept2cure_artifacts (organization_id, project_id, artifact_id, title, content, category, type) VALUES
      (${ORG_A}, ${A_PROJECT}, 'art_1', 'A artifact', '<h1>Scope</h1>', 'document', 'document');
  `);
}

let previousEnforcement: string | undefined;

beforeAll(async () => {
  previousEnforcement = process.env.RLS_ENFORCE;
  const pg = new PGlite();
  h.state.pg = pg as unknown as typeof h.state.pg;
  // The tables `drizzle-kit push` creates for the deploy, from shared/schema.
  const kit = createRequire(import.meta.url)('drizzle-kit/api') as typeof import('drizzle-kit/api');
  const declared = kit.generateDrizzleJson({
    organizations: schema.organizations, users: schema.users, organizationUsers: schema.organizationUsers,
    clientWorkspaces: schema.clientWorkspaces, projects: schema.projects,
    projectVisibilitySettings: schema.projectVisibilitySettings, projectMembers: schema.projectMembers,
    projectTasks: schema.projectTasks, concept2cureArtifacts: schema.concept2cureArtifacts,
    concept2cureProvenanceEvents: schema.concept2cureProvenanceEvents,
    concept2cureSignatures: schema.concept2cureSignatures,
    concept2cureReviewComments: schema.concept2cureReviewComments,
    concept2cureReviewAssignments: schema.concept2cureReviewAssignments,
  });
  for (const statement of await kit.generateMigration(kit.generateDrizzleJson({}), declared)) {
    try {
      await pg.exec(statement);
    } catch (error) {
      // Only a foreign key to a table outside this fixture may be left out.
      if (!/FOREIGN KEY/.test(statement)) throw error;
    }
  }
  // The migration set's own policy step, from disk.
  await pg.exec(fs.readFileSync(path.join(ROOT, TENANT_ISOLATION_SWEEP), 'utf8'));
  await pg.exec(`CREATE ROLE ${RUNTIME_ROLE} NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE};`);
  const { rows } = await pg.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  for (const { tablename } of rows) await pg.exec(`ALTER TABLE "${tablename}" OWNER TO ${RUNTIME_ROLE}`);
}, 120_000);

afterAll(async () => {
  if (previousEnforcement === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = previousEnforcement;
  await (h.state.pg as unknown as PGlite | null)?.close();
});

beforeEach(async () => {
  h.state.statements.length = 0;
  h.state.failOn = null;
  process.env.RLS_ENFORCE = 'on';
  await seed();
});

describe('the database layer this route sits on, as deployed', () => {
  it('projects and project_tasks are RLS-enabled, FORCEd and policied by the set, and the runtime role is not exempt', async () => {
    const { rows } = await h.state.pg.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) AS owner,
              (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation_policy') AS policies,
              r.rolsuper, r.rolbypassrls
         FROM pg_class c JOIN pg_roles r ON r.rolname = pg_get_userbyid(c.relowner)
        WHERE c.relname IN ('projects', 'project_tasks') ORDER BY c.relname`, [], {});
    expect(rows).toEqual(['project_tasks', 'projects'].map(relname => ({
      relname, relrowsecurity: true, relforcerowsecurity: true, owner: RUNTIME_ROLE, policies: 1, rolsuper: false, rolbypassrls: false,
    })));
  });

  it('is the layer that decides at head: on, org A cannot see org B’s project; off, it can (the negative control)', async () => {
    const { runWithTenantScope } = await import('../../../db/tenantStore');
    const { pool } = await import('../../../db');
    const visible = () => runWithTenantScope({ tenantId: String(ORG_A), role: 'member', source: 'test' },
      async () => (await (pool as unknown as typeof h.pool).query('SELECT id FROM projects WHERE id = $1', [B_PROJECT])).rows.length);
    expect(await visible()).toBe(0);
    process.env.RLS_ENFORCE = 'off';
    expect(await visible()).toBe(1);
  });
});

describe.each(['off', 'on'] as const)('another organization’s project, RLS_ENFORCE=%s', mode => {
  beforeEach(() => { process.env.RLS_ENFORCE = mode; });

  it('PUT …/cmc (retired, P-62) is not served and leaves its record exactly as it was', async () => {
    const res = await putCmcAs(A_OWNER, B_PROJECT);
    // The record first, so a failure shows what was written.
    expect(await metadataOf(B_PROJECT), `HTTP ${res.status}`).toEqual(B_METADATA);
    expect(res.status).toBe(404);
  });

  it('GET …/context answers 404 and names none of its tasks', async () => {
    const res = await getAs(A_OWNER, B_PROJECT, 'context');
    expect(JSON.stringify(res.body), `HTTP ${res.status}`).not.toContain(B_SECRET);
    expect(res.status).toBe(404);
  });

  it.each(['program-twin', 'change-impact', 'transform-context', 'artifacts/art_1/verification'])(
    'GET …/%s answers 404', async tail => {
      const res = await getAs(A_OWNER, B_PROJECT, tail);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(B_SECRET);
    });
});

describe('inside the organization, where RLS cannot decide (RLS_ENFORCE=on)', () => {
  it('a member who is not on a private project cannot read its context', async () => {
    const context = await getAs(A_COLLEAGUE, A_PRIVATE, 'context');
    expect(JSON.stringify(context.body), `HTTP ${context.status}`).not.toContain('A private task');
    expect(context.status).toBe(404);
    expect(context.body.error?.code).toBe('PROJECT_NOT_FOUND');
  });

  it('a viewer reads the context', async () => {
    const read = await getAs(A_VIEWER, A_PROJECT, 'context');
    expect(read.status).toBe(200);
    expect(read.body.data.project.id).toBe(A_PROJECT);
  });

  it('an archived project’s records stay readable', async () => {
    const read = await getAs(A_OWNER, A_ARCHIVED, 'context');
    expect(read.status).toBe(200);
    expect(read.body.data.project.id).toBe(A_ARCHIVED);
  });

  it('the project’s owner reads its context, and its CMC readiness is not project metadata', async () => {
    const context = await getAs(A_OWNER, A_PROJECT, 'context');
    expect(context.status).toBe(200);
    expect(context.body.data.project.id).toBe(A_PROJECT);
    expect(context.body.data.tasks.recent.map((t: { name: string }) => t.name)).toEqual(['A task']);
    // 401's metadata names "A tablet"; the context reads the register (P-62).
    expect(JSON.stringify(context.body.data.cmc)).not.toContain('A tablet');
    expect(['read', 'outside_composition_scope', 'unreadable']).toContain(context.body.data.cmc.state);
  });
});

describe('a check that could not run is not an answer', () => {
  it.each([
    ['the membership read', /FROM organization_users/i, '57014'],
    ['the project read', /from "projects"/i, '08006'],
  ])('when %s fails, the context answers 503 and nothing is supplied', async (_label, pattern, code) => {
    h.state.failOn = { pattern, code };
    const read = await getAs(A_OWNER, A_PROJECT, 'context');
    h.state.failOn = null;
    expect(read.status).toBe(503);
    expect(read.body.error?.code).toBe('PROJECT_ACCESS_UNAVAILABLE');
    expect(read.body.data).toBeUndefined();
  });
});

describe('every statement on a tenant table these routes read carries the organization predicate', () => {
  /** Statements that read or write `tables`, as the application sent them. */
  const on = (tables: string) => h.state.statements.filter(s =>
    new RegExp(`\\b(?:from|update|join)\\s+"?(?:${tables})"?(?![\\w])`, 'i').test(s));

  it.each([
    ['GET …/context', 'projects|project_tasks', () => getAs(A_OWNER, A_PROJECT, 'context')],
    ['GET …/program-twin', 'concept2cure_signatures|concept2cure_review_comments', () => getAs(A_OWNER, A_PROJECT, 'program-twin')],
    ['GET …/verification', 'concept2cure_signatures|concept2cure_review_comments', () => getAs(A_OWNER, A_PROJECT, 'artifacts/art_1/verification')],
  ])('%s (%s)', async (_label, tables, call) => {
    process.env.RLS_ENFORCE = 'off';
    const res = await call();
    expect(res.status).toBe(200);
    const statements = on(tables);
    // Every named table is read, so an empty list cannot pass for a scoped one.
    for (const table of tables.split('|')) expect(on(table).length, table).toBeGreaterThan(0);
    for (const statement of statements) expect(statement, statement).toMatch(/"?organization_id"?\s*=/);
  });

  it('a task row keyed to this project id under another organization is not in its context', async () => {
    process.env.RLS_ENFORCE = 'off';
    await h.state.pg.exec(`INSERT INTO project_tasks (organization_id, project_id, name, status)
      VALUES (${ORG_B}, ${A_PROJECT}, '${B_SECRET} mis-keyed task', 'todo')`);
    const res = await getAs(A_OWNER, A_PROJECT, 'context');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(B_SECRET);
  });
});
