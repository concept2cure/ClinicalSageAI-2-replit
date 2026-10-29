/**
 * Every write under /api/concept2cure/projects admits the project before it
 * runs (D6, role and project access; docs/evidence/D6-PROJECT-WRITE-GATES/2026-10-29/).
 *
 * ── The question, asked of every write ────────────────────────────────────────
 * Row-Level Security separates organizations and nothing inside one. So inside
 * an organization the application decides who may change a project, and each
 * of these is a write it must refuse:
 *   - an organization viewer;
 *   - a member of the project with use, not edit, permission;
 *   - an organization reviewer who is not an edit member;
 *   - a member who is not on a private project;
 *   - an approver (who may edit every project) on an archived project;
 *   - and, with RLS off as in every environment but production, a caller in
 *     another organization.
 * The project's owner is the positive control: the same request is admitted.
 * Six writes are review acts (a thread, a review task, a comment, its
 * resolution, a review decision, an artifact's status change). They are
 * admitted in review mode: a viewer and an archived project are refused, and a
 * member and the reviewer an assignment admits are not (reviews.ts lets a
 * member comment on purpose, the assigned reviewer is not an edit member, and an
 * approver is often deliberately not an editor of what they approve: the status
 * route's own ceremony decides who may approve). Three POSTs change no project
 * record (an export, a package manifest, an assessment) and are admitted in
 * read mode.
 *
 * ── How it is decided here ────────────────────────────────────────────────────
 * By running it. The routers are mounted exactly as production mounts them, by
 * calling registerConcept2CureRoutes itself; the census fails when a write is
 * registered that this file gives no verdict. Each request runs against PGlite
 * (a real PostgreSQL) holding every public table shared/schema declares, as
 * `drizzle-kit push` creates them. "Nothing was written" is the database's own
 * answer: no INSERT, UPDATE or DELETE that changed a row was sent while the
 * request ran, committed or not.
 *
 * Stubbed: authentication, the rate limiter and the tenant-context middleware
 * pass through, and the request carries the identity a verified session does
 * (the organization role is the membership's, as server/auth.ts resolves it).
 * The request's tenant scope and lazy database client are the real
 * establishRequestTenantScope. RLS_ENFORCE is off throughout: inside one
 * organization RLS cannot decide (11624b268's negative control shows it), and
 * off is the database that lets another organization's row through, so a
 * cross-organization refusal here is the application's.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import {
  A_APPROVER, A_ARCHIVED, A_COLLEAGUE, A_OWNER, A_PRIVATE, A_PROJECT, A_REVIEWER, A_VIEWER, ADMISSION_CODES,
  ARCHIVED_ANSWERS, ART, AUDIT_CHAIN_MIGRATIONS, B_PROJECT, CASES, IND, ORG_A, P, REFUSED, REVIEWER_PASSWORD, ROOT,
  WRITES, key, publicSchemaDeclarations, refusedByProjectAccess, routeOf, seedSql, urlFor,
  type Actor, type Case, type Outcome, type WriteRoute, type Written,
} from './support/project-write-gates-fixture';

type QueryConfig = string | { text: string; rowMode?: string; values?: unknown[] };
type PgResult = { rows: unknown[]; affectedRows?: number; fields?: unknown[] };

const h = vi.hoisted(() => {
  const state = {
    pg: null as unknown as {
      query: (text: string, params: unknown[], options: unknown) => Promise<PgResult>;
      exec: (sql: string) => Promise<PgResult[]>;
    },
    /** Rows a request's statements changed and kept (committed, or outside a transaction). */
    written: [] as Written[],
    /** Rows a request's statements changed, kept or later rolled back. */
    attempted: [] as Written[],
    /** Changes inside the open transaction, kept only if it commits. */
    tx: null as Written[] | null,
    /** Every statement a request sent, in order. */
    statements: [] as string[],
    /** Tables changed since the fixture was last seeded. */
    dirty: new Set<string>(),
  };
  const identity = (value: string) => value;
  // node-postgres hands these types over as text; PGlite would parse them.
  const parsers = { 20: identity, 1082: identity, 1114: identity, 1184: identity, 1186: identity };
  const WRITE = /^\s*(?:with\b[\s\S]*?\)\s*)?(?:insert\s+into|update|delete\s+from)\s+"?(?:public"?\."?)?([a-z_0-9]+)"?/i;
  const execute = async (text: string, params: unknown[], rowMode?: string): Promise<PgResult> => {
    try {
      return await state.pg.query(text, params, { rowMode: rowMode === 'array' ? 'array' : 'object', parsers });
    } catch (error) {
      // node-postgres sends an unparameterised string over the simple-query
      // protocol, which takes several statements; PGlite's query takes one.
      if (params.length || !/multiple commands/i.test(String((error as Error).message))) throw error;
      return (await state.pg.exec(text)).at(-1) ?? { rows: [] };
    }
  };
  const track = (text: string, result: PgResult) => {
    if (/^\s*(?:begin|start\s+transaction)\b/i.test(text)) state.tx = [];
    else if (/^\s*commit\b/i.test(text)) { state.written.push(...(state.tx ?? [])); state.tx = null; }
    else if (/^\s*rollback\s*;?\s*$/i.test(text)) state.tx = null;
    const target = WRITE.exec(text)?.[1]?.toLowerCase();
    const rows = result.affectedRows ?? 0;
    if (!target || rows === 0) return;
    state.attempted.push({ table: target, rows });
    (state.tx ?? state.written).push({ table: target, rows });
    state.dirty.add(target);
  };
  const run = async (config: QueryConfig, values?: unknown[]) => {
    const text = typeof config === 'string' ? config : config.text;
    const params = values ?? (typeof config === 'string' ? [] : config.values ?? []);
    state.statements.push(text);
    const result = await execute(text, params, typeof config === 'string' ? undefined : config.rowMode);
    track(text, result);
    return { rows: result.rows, rowCount: result.affectedRows || result.rows.length, fields: result.fields ?? [], command: '' };
  };
  const client = { query: run, release: () => undefined };
  const pool = {
    connect: async () => client,
    query: run,
    on() { return pool; },
    end: async () => undefined,
    totalCount: 0, idleCount: 0, waitingCount: 0,
  };
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };
  return { state, pool, pass, silent };
});

vi.mock('../../../db/runtime', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { instrumentPool } = await import('../../../db/poolInstrumentation');
  const pool = instrumentPool(h.pool as never);
  const db = drizzle(pool as never, { schema });
  return {
    pool, db, getPool: () => pool, getDb: () => db,
    query: (text: string, params: unknown[] = []) => (pool as unknown as typeof h.pool).query(text, params),
    transaction: async <T>(callback: (client: unknown) => Promise<T>) => {
      const client = await h.pool.connect();
      await client.query('BEGIN');
      try { const out = await callback(client); await client.query('COMMIT'); return out; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    },
    healthCheck: async () => true,
    runMigrations: async () => undefined,
  };
});
vi.mock('../../../db', async () => import('../../../db/runtime'));
vi.mock('../shared', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared')>()),
  concept2cureRateLimiter: h.pass,
}));
vi.mock('../../../auth', async importOriginal => ({ ...(await importOriginal<Record<string, unknown>>()), authMiddleware: h.pass }));
vi.mock('../../../middleware/auth.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  authenticateToken: h.pass,
}));
vi.mock('../../../middleware/tenantContext', () => ({ tenantContextMiddleware: h.pass, requireOrganizationContext: h.pass }));
vi.mock('../../../middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => h.pass }));
vi.mock('../../../utils/logger', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createScopedLogger: () => h.silent,
}));

import * as schema from '../../../../shared/schema';
import { establishRequestTenantScope } from '../../../middleware/establishRequestTenantScope';
import { registerConcept2CureRoutes } from '../../../bootstrap/register-concept2cure-routes';
import createArtifactsCenterRoutes from '../../artifacts-center-routes';
import { contradictionEngineService } from '../../../services/contradiction-engine-service';

const outcomes: Array<{ route: string; case: Case } & Outcome> = [];

const apps = new Map<number, Express>();
function app(actor: Actor): Express {
  const cached = apps.get(actor.userId);
  if (cached) return cached;
  const mounts: Array<{ path: string; handlers: RequestHandler[] }> = [];
  registerConcept2CureRoutes({ use: (path: string, ...handlers: RequestHandler[]) => { mounts.push({ path, handlers }); } } as unknown as Express);
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
  for (const mount of mounts) a.use(mount.path, ...mount.handlers);
  // The governed-artifact export, mounted as register-regulatory-routes mounts it (authenticateToken is the pass-through above).
  a.use('/api/artifacts-center', createArtifactsCenterRoutes());
  apps.set(actor.userId, a);
  return a;
}

async function send(method: string, url: string, actor: Actor, body?: Record<string, unknown>): Promise<Outcome & { body: unknown }> {
  h.state.written.length = 0;
  h.state.attempted.length = 0;
  h.state.statements.length = 0;
  h.state.tx = null;
  const res = await request(app(actor))[method.toLowerCase() as 'post'](url)
    .set('Authorization', 'Bearer verified-session').send(body ?? {});
  const error = res.body?.error;
  return {
    status: res.status,
    code: (typeof error === 'object' && error?.code) || res.body?.code || null,
    message: String((typeof error === 'object' ? error?.message : error) ?? res.body?.message ?? '').slice(0, 120),
    wrote: [...h.state.written],
    attempted: [...h.state.attempted],
    body: res.body,
  };
}
async function call(route: WriteRoute, actor: Actor, projectId: number): Promise<Outcome> {
  const { status, code, message, wrote, attempted } = await send(route.method, urlFor(route.path, projectId), actor, route.body);
  return { status, code, message, wrote, attempted };
}

// ── The database ─────────────────────────────────────────────────────────────

let tables: string[] = [];
beforeAll(async () => {
  h.state.pg = new PGlite() as unknown as typeof h.state.pg;
  const declared = publicSchemaDeclarations(schema as unknown as Record<string, unknown>);
  const kit = createRequire(import.meta.url)('drizzle-kit/api') as typeof import('drizzle-kit/api');
  for (const statement of await kit.generateMigration(kit.generateDrizzleJson({}), kit.generateDrizzleJson(declared))) {
    await h.state.pg.exec(statement).catch(() => undefined);
  }
  // The tamper-evident audit chain a signed act writes: shared/schema declares
  // audit_logs without it, and these migrations (on the deploy set) add it.
  expect(AUDIT_CHAIN_MIGRATIONS).toHaveLength(4);
  for (const file of AUDIT_CHAIN_MIGRATIONS) await h.state.pg.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const { rows } = await h.state.pg.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`, [], {});
  tables = (rows as Array<{ tablename: string }>).map(r => r.tablename);
  await h.state.pg.exec(seedSql());
}, 300_000);

beforeEach(async () => {
  process.env.RLS_ENFORCE = 'off';
  if (!h.state.dirty.size) return;
  // A request changed rows: restore the fixture before the next one.
  await h.state.pg.exec(`TRUNCATE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await h.state.pg.exec(seedSql());
  h.state.dirty.clear();
}, 60_000);

afterAll(async () => {
  const report = process.env.PROJECT_WRITE_GATES_OUTCOMES;
  if (report) fs.writeFileSync(report, JSON.stringify(outcomes, null, 1));
  await (h.state.pg as unknown as PGlite | null)?.close();
});

// ── The census ───────────────────────────────────────────────────────────────

type RouteLayer = { route?: { path: string; methods: Record<string, boolean> } };

/** 'METHOD /full/path' for every route production mounts, read from the routers' own stacks. */
function registeredRoutes(): string[] {
  const mounts: Array<{ path: string; handlers: RequestHandler[] }> = [];
  registerConcept2CureRoutes({ use: (path: string, ...handlers: RequestHandler[]) => { mounts.push({ path, handlers }); } } as unknown as Express);
  return [...new Set(mounts.flatMap(({ path, handlers }) => handlers.flatMap(handler =>
    ((handler as unknown as { stack?: RouteLayer[] }).stack ?? []).flatMap(layer => layer.route
      ? Object.keys(layer.route.methods).map(m => `${m.toUpperCase()} ${path}${layer.route!.path}`)
      : []))))];
}
const underProjects = (r: string) => r.slice(r.indexOf(' ') + 1).startsWith('/api/concept2cure/projects/');

describe('the routers production mounts at /api/concept2cure', () => {
  it('register exactly these writes under /projects, so a new one cannot arrive without a verdict', () => {
    const writes = registeredRoutes().filter(r => underProjects(r) && !/^(GET|HEAD) /.test(r));
    expect(writes.sort()).toEqual(WRITES.map(key).sort());
  });
});

// ── Every write, every case ──────────────────────────────────────────────────

describe.each(WRITES.map(route => [key(route), route] as const))('%s', (_name, route) => {
  const refused = REFUSED[route.mode];
  const admitted = (Object.keys(CASES) as Case[]).filter(c => !refused.includes(c));

  it.each(refused)('refuses %s and writes nothing', async c => {
    const { actor, project } = CASES[c];
    const outcome = await call(route, actor, project);
    outcomes.push({ route: key(route), case: c, ...outcome });
    // The whole answer, so a failure shows what head did and what it wrote.
    expect({ refused: refusedByProjectAccess(outcome), named: outcome.code !== null, attempted: outcome.attempted },
      JSON.stringify(outcome)).toEqual({ refused: true, named: true, attempted: [] });
    if (c === 'archived') expect(ARCHIVED_ANSWERS).toContain(`${outcome.status} ${outcome.code}`);
  });

  it.each(admitted)('admits %s', async c => {
    const { actor, project } = CASES[c];
    const outcome = await call(route, actor, project);
    outcomes.push({ route: key(route), case: c, ...outcome });
    expect(refusedByProjectAccess(outcome), JSON.stringify(outcome)).toBe(false);
    // A check that could not run is not an admission either.
    expect(outcome.code, JSON.stringify(outcome)).not.toBe('PROJECT_ACCESS_UNAVAILABLE');
  });
});

// ── The review acts, in both directions ──────────────────────────────────────

describe('the review acts', () => {
  const REVIEW_ACTS = WRITES.filter(r => r.mode === 'review');
  const STATUS = `PUT ${ART}/status`;

  it('are exactly the thread, the review task, the status change, the comment, its resolution and the decision', () => {
    expect(REVIEW_ACTS.map(key)).toEqual([
      `POST ${ART}/review-threads`, `POST ${ART}/review-tasks`, STATUS, `POST ${ART}/comments`,
      `PUT ${ART}/comments/:commentId/resolve`, `POST ${ART}/reviews/submit`,
    ]);
  });

  // The status change is pinned on its own below: approving is its ceremony's decision.
  it.each(REVIEW_ACTS.filter(r => key(r) !== STATUS).map(r => [key(r), r] as const))(
    'an assigned reviewer who is not an edit member of the private project completes %s', async (_name, route) => {
      const outcome = await call(route, A_REVIEWER, A_PRIVATE);
      expect(outcome.status, JSON.stringify(outcome)).toBeGreaterThanOrEqual(200);
      expect(outcome.status, JSON.stringify(outcome)).toBeLessThan(300);
      expect(outcome.wrote.length, JSON.stringify(outcome)).toBeGreaterThan(0);
    });

  it.each(REVIEW_ACTS.map(r => [key(r), r] as const))('a viewer is refused %s', async (_name, route) => {
    const outcome = await call(route, A_VIEWER, A_PROJECT);
    expect(`${outcome.status} ${outcome.code}`, JSON.stringify(outcome)).toBe('403 PROJECT_WRITE_PERMISSION_DENIED');
    expect(outcome.attempted).toEqual([]);
  });

  it('the same reviewer is refused a write that is not a review act (editing the artifact)', async () => {
    const outcome = await call(routeOf('PUT', ART), A_REVIEWER, A_PRIVATE);
    expect(`${outcome.status} ${outcome.code}`, JSON.stringify(outcome)).toBe('403 PROJECT_WRITE_PERMISSION_DENIED');
    expect(outcome.attempted).toEqual([]);
  });
});

// ── Approving: the gate admits the reviewer, the ceremony decides the signature ──

describe('approving an artifact through PUT …/status', () => {
  /** An artifact of the open project, in review, with no review round outstanding. */
  const IN_REVIEW = 'art_in_review';
  const APPROVE = {
    status: 'approved',
    reason: 'Reviewed against the protocol; approved for filing.',
    attestation: { meaning: 'approval', attestationText: 'I approve this document as reviewed.' },
    reauth: { password: REVIEWER_PASSWORD },
    ...IND,
  };
  const approveAs = (actor: Actor) =>
    send('PUT', urlFor(`${ART}/status`, A_PROJECT, { artifactId: IN_REVIEW }), actor, APPROVE);
  const statusOf = async () =>
    ((await h.state.pg.query(`SELECT status FROM concept2cure_artifacts WHERE artifact_id = $1`, [IN_REVIEW], {})).rows[0] as { status: string }).status;

  beforeEach(async () => {
    // The contradiction engine is not part of the act and reads tables this
    // fixture lacks; as in artifact-approval-ceremony.pglite, it answers
    // "nothing blocks". The role table, signing authority, the real bcrypt
    // re-authentication and the signed act's transaction all run.
    vi.spyOn(contradictionEngineService, 'checkPromotionBlocked')
      .mockResolvedValue({ blocked: false, blockingFindings: [], warningFindings: [] } as never);
    await h.state.pg.exec(`
      INSERT INTO concept2cure_artifacts (id, organization_id, project_id, artifact_id, title, content, category, type, status, created_by_id)
        VALUES (4099, ${ORG_A}, ${A_PROJECT}, '${IN_REVIEW}', 'Artifact in review', '<h1>Scope</h1>', 'document', 'document', 'review', 10);
      INSERT INTO concept2cure_artifact_versions (organization_id, artifact_id, version, content, content_hash, created_by_id)
        VALUES (${ORG_A}, 4099, 1, '<h1>Scope</h1>', '${createHash('sha256').update('<h1>Scope</h1>').digest('hex')}', 10);
      INSERT INTO concept2cure_artifacts (id, organization_id, project_id, artifact_id, title, content, category, type, status, created_by_id)
        VALUES (4098, ${ORG_A}, ${A_ARCHIVED}, '${IN_REVIEW}_archived', 'Archived artifact in review', '<h1>Scope</h1>', 'document', 'document', 'review', 10);
      INSERT INTO concept2cure_artifact_versions (organization_id, artifact_id, version, content, content_hash, created_by_id)
        VALUES (${ORG_A}, 4098, 1, '<h1>Scope</h1>', '${createHash('sha256').update('<h1>Scope</h1>').digest('hex')}', 10);`);
    h.state.dirty.add('concept2cure_artifacts');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('an organization reviewer who is not an edit member, and holds signing authority, approves: the signed act commits', async () => {
    const outcome = await approveAs(A_REVIEWER);
    expect(outcome.status, JSON.stringify({ ...outcome, body: undefined })).toBe(200);
    expect(await statusOf()).toBe('approved');
    // The signature the ceremony wrote: the reviewer's own, re-authenticated by password.
    const { rows } = await h.state.pg.query(
      `SELECT signer_id, signer_role, signature_meaning, authentication_method FROM concept2cure_signatures WHERE artifact_id = 4099`, [], {});
    expect(rows).toEqual([expect.objectContaining({ signer_id: A_REVIEWER.userId, signer_role: 'reviewer', signature_meaning: 'approval' })]);
    expect((rows[0] as { authentication_method: string }).authentication_method).not.toBe('session_jwt');
  });

  it('an archived project takes no approval, even from an approver who may sign: the gate answers before the ceremony', async () => {
    const outcome = await send('PUT', urlFor(`${ART}/status`, A_ARCHIVED, { artifactId: `${IN_REVIEW}_archived` }), A_APPROVER, APPROVE);
    expect(`${outcome.status} ${outcome.code}`, JSON.stringify(outcome)).toBe('409 PROJECT_ARCHIVED');
    expect(outcome.attempted).toEqual([]);
  });

  it('a viewer is refused by the gate, and nothing is signed', async () => {
    const outcome = await approveAs(A_VIEWER);
    expect(`${outcome.status} ${outcome.code}`, JSON.stringify(outcome)).toBe('403 PROJECT_WRITE_PERMISSION_DENIED');
    expect(outcome.attempted).toEqual([]);
    expect(await statusOf()).toBe('review');
  });

  it('a member without signing authority is admitted by the gate and refused by the ceremony, and nothing is signed', async () => {
    const outcome = await approveAs(A_COLLEAGUE);
    expect(outcome.status, JSON.stringify(outcome)).toBe(403);
    // Not the admission's refusal: the route's own role table, which runs before the password is asked for.
    expect(ADMISSION_CODES.has(String(outcome.code)), JSON.stringify(outcome)).toBe(false);
    expect(outcome.message, JSON.stringify(outcome)).toMatch(/not permitted to perform transition/i);
    expect(outcome.attempted).toEqual([]);
    expect(await statusOf()).toBe('review');
  });
});

// ── A row of another project is not reached through this project's URL ───────

describe('the admitted project is the one the row belongs to', () => {
  it.each([
    ['PUT', `${P}/tasks/:taskId`],
    ['DELETE', `${P}/tasks/:taskId`],
  ] as const)('%s %s: the private project’s task, through the open project’s URL, is not found and not changed', async (method, path) => {
    const route = routeOf(method, path);
    const outcome = await send(method, urlFor(path, A_PROJECT, { taskId: `${A_PRIVATE}1` }), A_OWNER, route.body);
    expect(`${outcome.status} ${outcome.message}`, JSON.stringify(outcome)).toBe('404 Task not found');
    expect(outcome.attempted).toEqual([]);
  });

  it.each([`${ART}/review-threads`, `${ART}/review-tasks`])(
    'POST %s: the private project’s artifact, through the open project’s URL, is not found', async path => {
      const route = routeOf('POST', path);
      const outcome = await send('POST', urlFor(path, A_PROJECT, { artifactId: `art_${A_PRIVATE}` }), A_OWNER, route.body);
      expect(`${outcome.status} ${outcome.message}`, JSON.stringify(outcome)).toBe('404 Artifact not found');
      expect(outcome.attempted).toEqual([]);
    });

  describe('the review reads', () => {
    const SECRETS = { 'review-threads': 'Private review thread 402', 'review-tasks': 'Private review task 402' };
    beforeEach(async () => {
      await h.state.pg.exec(`
        INSERT INTO concept2cure_review_threads (thread_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title)
          VALUES ('thr_402', ${ORG_A}, ${A_PRIVATE}, ${A_PRIVATE}, 10, 'A owner', '${SECRETS['review-threads']}');
        INSERT INTO concept2cure_review_tasks (task_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title)
          VALUES ('rtk_402', ${ORG_A}, ${A_PRIVATE}, ${A_PRIVATE}, 10, 'A owner', '${SECRETS['review-tasks']}');`);
      h.state.dirty.add('concept2cure_review_threads');
    });

    it.each(Object.entries(SECRETS))(
      'GET …/%s: the private project’s review record, through the open project’s URL, is not readable', async (tail, secret) => {
        const res = await send('GET', `/api/concept2cure/projects/${A_PROJECT}/artifacts/art_${A_PRIVATE}/${tail}`, A_COLLEAGUE);
        expect(JSON.stringify(res.body)).not.toContain(secret);
        expect(`${res.status} ${res.message}`, JSON.stringify(res.body)).toBe('404 Artifact not found');
      });

    it.each(Object.entries(SECRETS))('GET …/%s: through its own project’s URL, its owner reads it (the control)', async (tail, secret) => {
      const res = await send('GET', `/api/concept2cure/projects/${A_PRIVATE}/artifacts/art_${A_PRIVATE}/${tail}`, A_OWNER);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(JSON.stringify(res.body)).toContain(secret);
    });

    it('GET …/review-record/export: another project’s artifact, through this project’s URL, is not found (an audit reader)', async () => {
      const res = await send('GET', `/api/concept2cure/projects/${A_PROJECT}/artifacts/art_${A_PRIVATE}/review-record/export`, A_APPROVER);
      expect(`${res.status} ${res.message}`, JSON.stringify(res.body)).toBe('404 Artifact not found');
      expect(res.attempted).toEqual([]);
    });
  });

  it('the task writes carry the organization and the project in their predicate', async () => {
    for (const method of ['PUT', 'DELETE'] as const) {
      const route = routeOf(method, `${P}/tasks/:taskId`);
      const outcome = await send(method, urlFor(route.path, A_PROJECT), A_OWNER, route.body);
      expect(outcome.status, JSON.stringify(outcome)).toBe(200);
      const statement = h.state.statements.find(s => new RegExp(`^\\s*${method === 'PUT' ? 'update' : 'delete from'} "project_tasks"`, 'i').test(s));
      expect(statement, method).toMatch(/"project_tasks"\."organization_id" = \$\d+/);
      expect(statement, method).toMatch(/"project_tasks"\."project_id" = \$\d+/);
    }
  });
});

// ── GET /api/concept2cure/artifacts, the organization gallery ────────────────

describe('GET /api/concept2cure/artifacts', () => {
  const titles = async (actor: Actor) => {
    const res = await send('GET', '/api/concept2cure/artifacts', actor);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as { data: Array<{ title: string; projectName: string }> }).data;
  };

  it('lists only the projects the caller may use: a member not on the private project does not see its artifact', async () => {
    const colleague = (await titles(A_COLLEAGUE)).map(a => a.title);
    expect(colleague).not.toContain(`Artifact ${A_PRIVATE}`);
    expect(colleague).toEqual(expect.arrayContaining([`Artifact ${A_PROJECT}`, `Artifact ${A_ARCHIVED}`]));
    const owner = (await titles(A_OWNER)).map(a => a.title);
    expect(owner).toEqual(expect.arrayContaining([`Artifact ${A_PROJECT}`, `Artifact ${A_PRIVATE}`, `Artifact ${A_ARCHIVED}`]));
    expect(owner).not.toContain(`Artifact ${B_PROJECT}`);
  });

  it('names each artifact’s project, and never another organization’s project', async () => {
    // A row of this organization whose project_id names org B's project: the
    // key PF-03 found, which only a same-organization foreign key prevents.
    await h.state.pg.exec(`INSERT INTO concept2cure_artifacts (organization_id, project_id, artifact_id, title, content, category, type)
      VALUES (${ORG_A}, ${B_PROJECT}, 'art_miskeyed', 'Mis-keyed artifact', '<p>x</p>', 'document', 'document')`);
    h.state.dirty.add('concept2cure_artifacts');
    const rows = await titles(A_OWNER);
    expect(JSON.stringify(rows)).not.toContain('Org B confidential');
    expect(rows.find(a => a.title === `Artifact ${A_PROJECT}`)?.projectName).toBe('A program');
  });

  it('its projects join is held to the caller’s organization', async () => {
    await titles(A_OWNER);
    const statement = h.state.statements.find(s => /join "projects"/i.test(s));
    expect(statement).toMatch(/join "projects" on \([^)]*"projects"\."organization_id" = \$\d+/i);
  });
});

// ── GET /api/artifacts-center/:artifactId/export, the governed DOCX ──────────

describe('GET /api/artifacts-center/:artifactId/export', () => {
  const exportAs = (actor: Actor, projectId: number) => send('GET', `/api/artifacts-center/art_${projectId}/export`, actor);

  it('a member who is not on the private project is not given its artifact’s file, and no export is recorded', async () => {
    const res = await exportAs(A_COLLEAGUE, A_PRIVATE);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(String((res.body as { error?: string }).error)).toMatch(/not found/i);
    expect(res.attempted).toEqual([]);
  });

  it('the same member is given the open project’s artifact (read mode: the gate is project access, not edit permission)', async () => {
    const res = await exportAs(A_COLLEAGUE, A_PROJECT);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.attempted.length).toBeGreaterThan(0);
  });

  it('the private project’s owner is given its artifact, and the download is recorded (the control)', async () => {
    const res = await exportAs(A_OWNER, A_PRIVATE);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.attempted.length).toBeGreaterThan(0);
  });

  it('another organization’s artifact is not found', async () => {
    const res = await exportAs(A_OWNER, B_PROJECT);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.attempted).toEqual([]);
  });
});

// ── Every read under /projects/:projectId, with its project access ──────────

const READS = registeredRoutes()
  .filter(r => underProjects(r) && /^GET /.test(r) && /\/:(projectId|id)(\/|$)/.test(r))
  .map(r => r.slice(4));

describe.each(READS)('GET %s', path => {
  it.each(['not-on-private', 'other-org'] as const)('refuses %s', async c => {
    const { actor, project } = CASES[c];
    const outcome = await send('GET', urlFor(path, project), actor);
    outcomes.push({ route: `GET ${path}`, case: c, ...outcome });
    expect(refusedByProjectAccess(outcome), JSON.stringify({ ...outcome, body: undefined })).toBe(true);
    expect(JSON.stringify(outcome.body)).not.toMatch(/A private program|Task 402|Artifact 402|Org B confidential|Task 501|Artifact 501/);
  });

  it.each(['viewer', 'owner'] as const)('admits %s', async c => {
    const { actor, project } = CASES[c];
    const outcome = await send('GET', urlFor(path, project), actor);
    outcomes.push({ route: `GET ${path}`, case: c, ...outcome });
    expect(refusedByProjectAccess(outcome), JSON.stringify({ ...outcome, body: undefined })).toBe(false);
  });
});
