/**
 * A delegated credential opens only what it was granted, on every write route
 * of every launch app (security audit 2026-09-24 IAM-02, plan item P0-2 part
 * (b), "requireScope does not read scope"; D6 tranche 4).
 *
 * ── The two delegated credentials ───────────────────────────────────────────
 *   · A connector (MCP) token: `type: 'access'`, `token_use: 'mcp'`, carrying
 *     the OAuth scope its holder consented to (c2c:read / c2c:draft / c2c:file).
 *   · An API key (X-API-Key): an organisation's key with the scopes it was minted
 *     for. Every scope a key can carry is a `:read` scope (shared/schema/api-keys.ts).
 * Neither may write through the general /api surface.
 *
 * ── What HEAD answered (2026-10-01) ─────────────────────────────────────────
 * The connector token is refused outright on /api: D8 (3bdb5045) made
 * middleware/tokenType.ts refuse any `token_use` outside the connector. That is
 * stronger than a scope limit, and this suite holds it to every write route of
 * every launch app. On /mcp itself the scope is read per tool (mcp/tools/
 * runtime.ts; mcp-connector.dbtest.ts, mcp-auth-contract.test.ts).
 *
 * The canonical requireScope (middleware/enterprise-security.ts) does read an
 * API key's scopes; that is pinned below. A key presented alone is refused by
 * the /api boundary, which takes Bearer sessions only. But validateApiKey is
 * mounted app-wide AHEAD of the boundary. On any path it validated the key and
 * ran the rest of the request inside the KEY's tenant scope, and the boundary's
 * tenant step keeps a real scope it finds already open (establishRequestTenant
 * Scope: "idempotent"). So a request carrying a read-only key of organisation A
 * and a session of organisation B reached every launch write handler as B's
 * user, under A's row-level security, with req.tenantId = A. Every handler
 * that relies on RLS, or reads req.tenantId, then read and wrote A's rows for
 * B. The key's scopes limited nothing. That was the remaining defect.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As the D8 connector suites: a freshly minted NOSUPERUSER NOBYPASSRLS runtime
 * role through APP_DATABASE_URL, RLS_ENFORCE=on. The middleware is production's,
 * in production's order (server/index.ts): validateApiKey app-wide
 * (applySecurityMiddleware), then createAuthBoundary on /api (applyAuthBoundary).
 * Behind them sits one probe per launch-app API prefix, taken from the launch
 * catalog (shared/constants/launch-scope.ts) through the surface registry's
 * apiPrefixes. The probe stands in for a launch write handler: it records that it
 * ran, and reads and writes a row of organisation A's through the pool, as an
 * RLS-reliant handler does. /api/v1 is outside the boundary; its one write route
 * (pyramid PATCH, routes/pyramid.routes.ts) is mirrored with its own chain.
 *
 * Isolation: lane "p02b". Every organisation slug, e-mail and row id starts `p02b-`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../../../tests/setup.db';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../../scripts/db/provision-app-role.mjs';
import { LAUNCH_APPS } from '../../../shared/constants/launch-scope';
import { UI_SURFACES } from '../../../shared/constants/ui-surface-registry';

const TAG = 'p02b';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'p02b-delegated-credential-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `p02b_rt_${RUN}` });
const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const PYRAMID_PROBE = '/api/v1/p02b-pyramid/progress/task-1';

interface Account { id: number; email: string; orgId: number; session: string }
interface Arrival { method: string; path: string; user: string | null; reqTenantId: unknown; scopeTenant: string | null; visible: number; updated: number }

let owner: Pool;
let server: http.Server;
let baseUrl: string;
let runtimePool: { query: Pool['query']; end: () => Promise<void> } | null = null;
let orgA: { id: number; uuid: string };
let orgB: { id: number; uuid: string };
let alice: Account; // admin of A
let bob: Account; // admin of B
let connectorToken: string; // c2c:read, alice in A, minted by the connector's own issuer
let readKey: string; // A's API key, scope documents:read
let threadA: string; // a row only organisation A may see
const arrivals: Arrival[] = [];

/** Every API prefix of every launch app, from the catalog — not a hand-picked list. */
function launchPrefixes(): Array<{ app: string; prefixes: string[] }> {
  return LAUNCH_APPS.map((app) => {
    const prefixes = new Set<string>();
    for (const id of app.surfaces) {
      const surface = UI_SURFACES.find((s) => s.id === id) as { apiPrefixes?: readonly string[] } | undefined;
      for (const p of surface?.apiPrefixes ?? []) if (p.startsWith('/api/')) prefixes.add(p);
    }
    return { app: app.id, prefixes: [...prefixes] };
  });
}

interface Outcome { method: string; path: string; status: number; code: string | null; reached: boolean }

async function send(method: string, path: string, headers: Record<string, string>): Promise<Outcome> {
  const before = arrivals.length;
  const res = await fetch(new URL(path, baseUrl), {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ title: 'p02b' }),
  });
  const body = (await res.json().catch(() => null)) as { code?: string; error?: { code?: string } | string } | null;
  const code = body?.code ?? (typeof body?.error === 'object' ? body?.error?.code ?? null : null);
  return { method, path, status: res.status, code: code ?? null, reached: arrivals.length > before };
}

/** Every write method on every prefix of one launch app. */
async function sweep(prefixes: string[], headers: Record<string, string>): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const prefix of prefixes) for (const m of WRITES) out.push(await send(m, `${prefix}/p02b-probe`, headers));
  return out;
}

const admitted = (outcomes: Outcome[]) =>
  outcomes.filter((o) => o.reached || o.status < 400).map((o) => `${o.method} ${o.path} → ${o.status}${o.reached ? ' (handler ran)' : ''}`);

// ── The probe: what a launch write handler is handed ────────────────────────

async function probe(req: express.Request, res: express.Response): Promise<void> {
  const { getTenantScope } = await import('../../db/tenantStore');
  const scope = getTenantScope();
  // As an RLS-reliant handler: no organisation predicate of its own.
  const seen = await runtimePool!.query('SELECT count(*)::int AS n FROM chat_threads WHERE id = $1', [threadA]);
  const upd = await runtimePool!.query('UPDATE chat_threads SET title = $2 WHERE id = $1', [threadA, `${TAG} written by ${req.user?.id ?? '?'}`]);
  const arrival: Arrival = {
    method: req.method,
    path: req.originalUrl,
    user: req.user?.id != null ? String(req.user.id) : null,
    reqTenantId: (req as { tenantId?: unknown }).tenantId ?? null,
    scopeTenant: scope?.tenantId ?? null,
    visible: Number(seen.rows[0].n),
    updated: upd.rowCount ?? 0,
  };
  arrivals.push(arrival);
  res.json(arrival);
}

// ── Fixture ──────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  const orgs = (await owner.query(`SELECT id, uuid::text AS uuid FROM organizations WHERE slug LIKE $1`, [`${TAG}-%`])).rows as Array<{ id: number; uuid: string }>;
  const ids = orgs.map((o) => o.id);
  await owner.query('DELETE FROM chat_threads WHERE id LIKE $1', [`${TAG}-%`]);
  if (ids.length > 0) {
    await owner.query('DELETE FROM api_keys WHERE organization_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM organization_users WHERE organization_id = ANY($1::int[])', [ids]);
  }
  // tenant-isolation-safe: removes only this suite's fixture users, matched by the suite-unique TAG
  await owner.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}-%@example.invalid`]);
  if (ids.length > 0) {
    await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ids]);
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [orgs.map((o) => o.uuid)])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

async function provisionRuntime(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const provisioned = await provisionAppServiceRole(owner, { env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD } });
      if (provisioned.skipped) throw new Error('[p02b] provisionAppServiceRole skipped — no runtime role.');
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.AUTH_BOUNDARY_MODE = 'enforce';
}

async function organisation(label: string): Promise<{ id: number; uuid: string }> {
  const r = await owner.query(
    `INSERT INTO organizations (name, slug, tier, industry_mode, status) VALUES ($1, $1, 'free', 'biotech', 'active') RETURNING id, uuid::text AS uuid`,
    [`${TAG}-${label}-${RUN}`],
  );
  return { id: Number(r.rows[0].id), uuid: String(r.rows[0].uuid) };
}

/** An admin of `org` with a sign-in session, as POST /api/auth/login issues it (openSession claims). */
async function account(label: string, org: { id: number; uuid: string }): Promise<Account> {
  const email = `${TAG}-${label}-${RUN}@example.invalid`;
  // tenant-isolation-safe: fixture user in a throw-away test database; `users` is global and tenancy is the organization_users row below
  const u = await owner.query(`INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, $2, 'not-a-real-hash', $3) RETURNING id`, [email, `P0-2b ${label}`, org.id]);
  const id = Number(u.rows[0].id);
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [org.id, id]);
  const { openSession } = await import('../../services/session-inactivity');
  const { activeJwtSecret } = await import('../../utils/jwtVerify');
  const claims = await openSession(id);
  const session = jwt.sign(
    { userId: String(id), email, organizationId: String(org.id), organizationUuid: org.uuid, role: 'admin', type: 'access', ...claims },
    activeJwtSecret(),
    { expiresIn: '1h', algorithm: 'HS256' },
  );
  return { id, email, orgId: org.id, session };
}

/** An API key of organisation A, stored as services/api-key-service.ts generateApiKey stores one. */
async function apiKey(scopes: string[]): Promise<string> {
  const raw = `csai_${randomBytes(32).toString('base64url')}`;
  await owner.query(
    `INSERT INTO api_keys (organization_id, name, key_hash, key_prefix, scopes, status, rate_limit, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, 'active', 600, $6, NOW())`,
    [orgA.id, `${TAG}-key-${RUN}`, createHash('sha256').update(raw).digest('hex'), raw.substring(0, 12), JSON.stringify(scopes), alice.id],
  );
  return raw;
}

async function buildApp(): Promise<void> {
  const app = express();
  app.use(express.json());
  const { validateApiKey, requireScope } = await import('../enterprise-security');
  const { createAuthBoundary } = await import('../authBoundary');
  const { authMiddleware } = await import('../../auth');
  const { enforceTenantLifecycle } = await import('../tenantLifecycleGuard');
  app.use(validateApiKey); // applySecurityMiddleware: app-wide, ahead of the boundary
  // The public API's own chain (routes/public-api.ts): the canonical requireScope.
  app.get('/api/v1/p02b-documents', requireScope('documents:read'), (_req, res) => res.json({ ok: true }));
  app.get('/api/v1/p02b-precedents', requireScope('precedent:read'), (_req, res) => res.json({ ok: true }));
  // The /api/v1 pyramid PATCH's chain (routes/pyramid.routes.ts): outside the boundary.
  app.patch(PYRAMID_PROBE, authMiddleware, enforceTenantLifecycle, probe);
  app.use('/api', createAuthBoundary()); // applyAuthBoundary
  app.all('/api/*splat', probe);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[p02b] unhandled route error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'server_error' });
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();
  await provisionRuntime();
  orgA = await organisation('a');
  orgB = await organisation('b');
  alice = await account('alice', orgA);
  bob = await account('bob', orgB);
  threadA = `${TAG}-${RUN}-thread-a`;
  await owner.query(`INSERT INTO chat_threads (id, organization_id, title) VALUES ($1, $2, 'organisation A only')`, [threadA, orgA.id]);
  readKey = await apiKey(['documents:read']);

  const { mintAccessToken } = await import('../../mcp/auth/platform-token');
  connectorToken = (
    await mintAccessToken({
      membership: { membershipId: 0, organizationId: orgA.id, userId: alice.id, role: 'admin', organizationUuid: orgA.uuid, email: alice.email },
      clientId: `${TAG}-client`,
      scopes: ['c2c:read'],
      resource: 'http://127.0.0.1/mcp',
      ttlSeconds: 3600,
    })
  ).token;

  await buildApp();
  const { getPool } = await import('../../db');
  runtimePool = getPool() as unknown as typeof runtimePool;
}, 180_000);

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (runtimePool) await runtimePool.end().catch(() => {});
  if (!owner) return;
  await cleanup().catch((err) => console.warn('[p02b] cleanup left rows:', err?.message));
  for (let attempt = 1; ; attempt++) {
    try {
      await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
      await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
      break;
    } catch (err) {
      if (attempt >= 5) { console.warn('[p02b] runtime role left behind:', (err as Error).message); break; }
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  await owner.end();
});

// ── The cases ────────────────────────────────────────────────────────────────

describe('posture and controls (every refusal below is read against these)', () => {
  it('connects as a non-superuser runtime role with RLS enforcing', async () => {
    const { runWithPreAuthScope } = await import('../../db/tenantStore');
    const { rows } = await runWithPreAuthScope('p02b:posture', () =>
      runtimePool!.query(`SELECT current_user AS role, r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce', true) AS rls FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(rows[0]).toMatchObject({ role: runtimeRole, rolsuper: false, rolbypassrls: false, rls: 'on' });
  });

  it('the catalog yields API prefixes for all seven launch apps, none on the public allowlist', async () => {
    const { isPublicApiPath } = await import('../public-api-allowlist');
    const apps = launchPrefixes();
    expect(apps.map((a) => a.app)).toEqual(['projects', 'vault', 'authoring', 'submission-center', 'submission-readiness', 'qms', 'reporting']);
    for (const a of apps) expect(a.prefixes.length, a.app).toBeGreaterThan(0);
    expect(apps.flatMap((a) => a.prefixes).filter((p) => isPublicApiPath(`${p}/p02b-probe`))).toEqual([]);
  });

  it("A's own session reaches a launch write handler in A's scope and sees A's row", async () => {
    const o = await send('PATCH', '/api/projects/p02b-probe', { Authorization: `Bearer ${alice.session}` });
    expect(o.status).toBe(200);
    expect(arrivals.at(-1)).toMatchObject({ user: String(alice.id), scopeTenant: String(orgA.id), visible: 1, updated: 1 });
  });

  it("B's own session reaches it in B's scope and cannot see or touch A's row", async () => {
    const o = await send('PATCH', '/api/projects/p02b-probe', { Authorization: `Bearer ${bob.session}` });
    expect(o.status).toBe(200);
    expect(arrivals.at(-1)).toMatchObject({ user: String(bob.id), scopeTenant: String(orgB.id), visible: 0, updated: 0 });
  });
});

describe('a c2c:read connector token writes nowhere on /api', () => {
  it('is the connector issuer\'s own token: type access, token_use mcp, scope c2c:read', () => {
    expect(jwt.decode(connectorToken)).toMatchObject({ type: 'access', token_use: 'mcp', scope: 'c2c:read', userId: String(alice.id) });
  });

  for (const { app, prefixes } of launchPrefixes()) {
    it(`${app}: every write method on every API prefix is refused before a handler runs`, async () => {
      const outcomes = await sweep(prefixes, { Authorization: `Bearer ${connectorToken}` });
      expect(admitted(outcomes)).toEqual([]);
      expect(new Set(outcomes.map((o) => `${o.status} ${o.code}`))).toEqual(new Set(['401 AUTH_008']));
    });
  }

  it('the /api/v1 pyramid write, outside the boundary, refuses it too', async () => {
    const o = await send('PATCH', PYRAMID_PROBE, { Authorization: `Bearer ${connectorToken}` });
    expect(o).toMatchObject({ status: 401, reached: false });
  });
});

describe('an API key is limited to its scopes', () => {
  it('requireScope reads the key\'s scopes: granted passes, not granted is 403 INSUFFICIENT_SCOPE', async () => {
    const granted = await send('GET', '/api/v1/p02b-documents', { 'X-API-Key': readKey });
    expect(granted.status).toBe(200);
    const res = await fetch(new URL('/api/v1/p02b-precedents', baseUrl), { headers: { 'X-API-Key': readKey } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'INSUFFICIENT_SCOPE', missing: ['precedent:read'] });
  });

  for (const { app, prefixes } of launchPrefixes()) {
    it(`${app}: the key alone is refused on every write route, before a handler runs`, async () => {
      const outcomes = await sweep(prefixes, { 'X-API-Key': readKey });
      expect(admitted(outcomes)).toEqual([]);
      expect(outcomes.every((o) => o.status === 401)).toBe(true);
    });
  }

  it('off the public API the key opens no tenant scope, even on a path that takes no session', async () => {
    // /api/csp-report is on the public allowlist: browsers post there with no credentials.
    const o = await send('POST', '/api/csp-report/p02b-probe', { 'X-API-Key': readKey });
    const ran = o.reached ? arrivals.at(-1) : null;
    expect(ran?.scopeTenant ?? null, "the key's tenant scope was opened off the public API").toBeNull();
    expect(o).toMatchObject({ status: 401, code: 'API_KEY_NOT_ACCEPTED', reached: false });
  });

  it('nor on the session alias under /api/v1, in any letter case Express routes', async () => {
    for (const path of ['/api/v1/auth/p02b-probe', '/api/v1/Auth/p02b-probe']) {
      expect(await send('POST', path, { 'X-API-Key': readKey }), path).toMatchObject({ status: 401, code: 'API_KEY_NOT_ACCEPTED', reached: false });
    }
  });
});

describe("an API key does not carry a session into the key's organisation", () => {
  for (const { app, prefixes } of launchPrefixes()) {
    it(`${app}: A's read-only key with B's session is refused on every write route`, async () => {
      const from = arrivals.length;
      const outcomes = await sweep(prefixes, { 'X-API-Key': readKey, Authorization: `Bearer ${bob.session}` });
      const org = (id: unknown) => (String(id) === String(orgA.id) ? 'A' : String(id) === String(orgB.id) ? 'B' : String(id));
      const crossed = arrivals
        .slice(from)
        .filter((a) => a.user === String(bob.id) && a.scopeTenant === String(orgA.id))
        .map((a) => `${a.method} ${a.path}: B's user, RLS scope ${org(a.scopeTenant)}, req.tenantId ${org(a.reqTenantId)}; A's row visible ${a.visible}, updated ${a.updated}`);
      expect(crossed.slice(0, 4), "B's user ran inside A's tenant scope").toEqual([]);
      expect(admitted(outcomes)).toEqual([]);
      expect(new Set(outcomes.map((o) => `${o.status} ${o.code}`))).toEqual(new Set(['401 API_KEY_NOT_ACCEPTED']));
    });
  }

  it('the /api/v1 pyramid write refuses the pair too', async () => {
    const o = await send('PATCH', PYRAMID_PROBE, { 'X-API-Key': readKey, Authorization: `Bearer ${bob.session}` });
    expect(o).toMatchObject({ status: 401, code: 'AMBIGUOUS_CREDENTIALS', reached: false });
  });

  it("A's row was never written by B", async () => {
    const { rows } = await owner.query('SELECT title FROM chat_threads WHERE id = $1', [threadA]);
    expect(rows[0].title).not.toBe(`${TAG} written by ${bob.id}`);
  });
});
