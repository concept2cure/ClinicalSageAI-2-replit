/**
 * Module access requests — member → org admin → platform owner — against real
 * PostgreSQL, the way production runs them.
 *
 * ── Posture ──────────────────────────────────────────────────────────────────
 *   - The server's own pool (server/db/runtime.ts) connects as a NON-superuser,
 *     NOBYPASSRLS runtime role minted by the REAL scripts/db/provision-app-role.mjs
 *     (through tests/db/harness.ts), via APP_DATABASE_URL — the variable
 *     production uses for the request pool. `app.rls_enforce=on` rides in the
 *     startup packet. The first block asserts that from INSIDE a request.
 *   - The REAL router is mounted at /api/module-access-requests with nothing in
 *     front of it: its own `router.use(authenticateToken)` runs the production
 *     JWT check, the organization-membership re-check against real
 *     organization_users rows, and establishRequestTenantScope — which, because
 *     that prefix is NOT in SYSTEM_SCOPE_PREFIXES, opens the CALLER'S org scope.
 *   - The REAL Master Administration router (server/routes/admin/master-admin.ts)
 *     is mounted at /api/admin/master with nothing in front of it: its own
 *     authMiddleware (membership + role read from organization_users) and
 *     requirePlatformAdmin run, and because /api/admin/master IS in
 *     SYSTEM_SCOPE_PREFIXES, establishRequestTenantScope opens the system scope
 *     (tenantId '0', app_super_admin) — decided by the production middleware
 *     from the path, not by this file.
 *   - Tokens are signed with the secret the verifier resolves (activeJwtSecret),
 *     for users that exist, with memberships that exist. Nothing about identity
 *     is stubbed.
 *
 * ── What this file found (2026-09-22) ────────────────────────────────────────
 *   H1  The owner's all-workspaces queue was `GET /api/module-access-requests
 *       ?scope=all`. Under the owner's per-user scope RLS narrowed it to the
 *       owner's own workspace: HTTP 200, `scope: 'all'`, and only the owner's
 *       own request — every other workspace read as empty.
 *   H2  Approving another workspace's request through
 *       `POST /api/module-access-requests/:id/decision` returned 404: the row is
 *       invisible under the owner's scope, so nothing was granted or recorded.
 *   Fixed by serving both from /api/admin/master/access-requests (the same
 *   handlers) and refusing `scope=all` on the per-user route. Section 4 pins
 *   the fix; its per-user assertions pin that members and org admins stay
 *   confined to their own workspace.
 *   H3  A decline racing an approval: both read `open`, the approval wrote its
 *       grant, lost the UPDATE and was told 409 — leaving a DECLINED request,
 *       an enabled module_subscriptions row, and no approval in the audit
 *       trail. Fixed by holding the request's row lock (SELECT … FOR UPDATE in
 *       one transaction) from the status check to the decision write; pinned
 *       by the two forced-race cases in section 3.
 *
 *   Section 5 (independent review, 2026-09-22) closes what the rest of the file
 *   let through. Each of these source mutations survived all 30 cases above
 *   and is now caught: the org queue's `status=approved|declined` filter
 *   collapsed to `open`; open requests no longer sorted ahead of answered
 *   ones, so a long queue cut them off; `truncated` hard-wired false; the
 *   2000-character note limit dropped; the "no workspace" refusal in
 *   `denyCreate` removed; and `decidedByMasterAdmin` set for every owner
 *   decision, including one in the owner's own workspace. It also replays the
 *   migration onto the deployed table the way deploy does (Rule 1).
 *
 * ── Isolation from the other lanes sharing this database ─────────────────────
 * Organizations 91400–91449 only; module ids start `dbtd_`, slugs and emails
 * carry `dbtd`. The 111 real catalog rows are never touched. audit_logs is
 * append-only and hash-chained, so audit rows are never deleted; each decision
 * carries a reason unique to this run, which is how they are found again.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, type ScratchSchema } from './harness';

// ─── Lane constants ──────────────────────────────────────────────────────────

const ORG_LO = 91400;
const ORG_HI = 91449;
const ORG_A = 91400;
const ORG_B = 91401;
/** The platform owner's home workspace. Holds one request of its own. */
const ORG_OWNER = 91402;

const RUN = `dbtd-${process.pid}-${Date.now().toString(36)}`;
const why = (what: string) => `${RUN} ${what}`;

const M = {
  alpha: 'dbtd_mod_alpha',
  beta: 'dbtd_mod_beta',
  gamma: 'dbtd_mod_gamma',
  delta: 'dbtd_mod_delta',
  eps: 'dbtd_mod_eps',
  zeta: 'dbtd_mod_zeta',
  eta: 'dbtd_mod_eta',
  theta: 'dbtd_mod_theta',
} as const;

const BASE = '/api/module-access-requests';
const MASTER = '/api/admin/master';

// ─── State ───────────────────────────────────────────────────────────────────

let owner: Pool;
let scratch: ScratchSchema;
let app: express.Express;
let serverPool: { end: () => Promise<void> } | null = null;
let savedAppDatabaseUrl: string | undefined;
let savedMasterEmails: string | undefined;
let activeJwtSecret: () => string;

type Person = { id: number; org: number; role: string; email: string; token: string };
const people: Record<string, Person> = {};

function auth(p: Person) {
  return { Authorization: `Bearer ${p.token}` };
}

async function rowsFor(org: number, moduleId: string) {
  const { rows } = await owner.query(
    `SELECT id, organization_id, module_id, requested_by, note, status, decided_by,
            decided_by_email, decision_reason
       FROM module_access_requests
      WHERE organization_id = $1 AND module_id = $2
      ORDER BY id`,
    [org, moduleId],
  );
  return rows;
}

async function grantFor(org: number, moduleId: string) {
  const { rows } = await owner.query(
    `SELECT organization_id, module_id, enabled, expires_at, enabled_by
       FROM module_subscriptions WHERE organization_id = $1 AND module_id = $2`,
    [org, moduleId],
  );
  return rows[0] ?? null;
}

async function auditFor(requestId: number) {
  const { rows } = await owner.query(
    `SELECT tenant_id, user_id, action, table_name, record_id, new_values::jsonb AS details
       FROM audit_logs
      WHERE table_name = 'module_access_request' AND record_id = $1
        AND tenant_id BETWEEN $2 AND $3
      ORDER BY occurred_at`,
    [String(requestId), ORG_LO, ORG_HI],
  );
  return rows;
}

/** Insert an open request directly, as the owner — the way an earlier ask left it. */
async function seedOpen(org: number, moduleId: string, by: Person, note = 'seeded'): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO module_access_requests
       (organization_id, module_id, requested_by, requester_email, note, status)
     VALUES ($1, $2, $3, $4, $5, 'open') RETURNING id`,
    [org, moduleId, by.id, by.email, note],
  );
  return Number(rows[0].id);
}

async function cleanupLaneRows(): Promise<void> {
  await owner.query(
    `DELETE FROM module_access_requests
      WHERE organization_id BETWEEN $1 AND $2 OR module_id LIKE 'dbtd\\_%'`,
    [ORG_LO, ORG_HI],
  );
  await owner.query(
    `DELETE FROM module_subscriptions
      WHERE organization_id BETWEEN $1 AND $2 OR module_id LIKE 'dbtd\\_%'`,
    [ORG_LO, ORG_HI],
  );
  await owner.query(`DELETE FROM available_modules WHERE module_id LIKE 'dbtd\\_%'`);
  await owner.query(`DELETE FROM organization_users WHERE organization_id BETWEEN $1 AND $2`, [
    ORG_LO,
    ORG_HI,
  ]);
  await owner.query(
    `DELETE FROM platform_role_grants
      WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'dbtd-%@example.invalid')`,
  );
  await owner.query(`DELETE FROM users WHERE email LIKE 'dbtd-%@example.invalid'`);
  await owner.query(`DELETE FROM organizations WHERE id BETWEEN $1 AND $2`, [ORG_LO, ORG_HI]);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  scratch = await createScratchSchema(databaseUrl);
  const runtimePool = await scratch.connectAsRuntimeRole();
  const runtimeUrl = (runtimePool as unknown as { options: { connectionString: string } }).options
    .connectionString;

  // The server's request pool is built at import time from APP_DATABASE_URL,
  // so this precedes every server import below.
  savedAppDatabaseUrl = process.env.APP_DATABASE_URL;
  process.env.APP_DATABASE_URL = runtimeUrl;
  // The owner is identified by the super_admin role below; the default
  // allowlist entry must not make any fixture identity the owner by accident.
  savedMasterEmails = process.env.MASTER_ADMIN_EMAILS;
  process.env.MASTER_ADMIN_EMAILS = 'dbtd-nobody@example.invalid';

  await cleanupLaneRows();

  for (const [id, label] of [
    [ORG_A, 'a'],
    [ORG_B, 'b'],
    [ORG_OWNER, 'owner'],
  ] as const) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $3, 'active')`,
      [id, `dbtd workspace ${label}`, `dbtd-${label}-${RUN}`],
    );
  }
  for (const [i, id] of Object.values(M).entries()) {
    await owner.query(
      `INSERT INTO available_modules (module_id, name, category, sort_order, metadata)
       VALUES ($1, $2, 'dbtd', $3, '{"tiers":["enterprise"],"industries":[]}'::json)`,
      [id, `dbtd ${id}`, 9950 + i],
    );
  }

  const jwtVerify = await import('../../server/utils/jwtVerify');
  activeJwtSecret = jwtVerify.activeJwtSecret;

  const cast: Array<[key: string, org: number, role: string]> = [
    ['memberA', ORG_A, 'member'],
    ['memberA2', ORG_A, 'member'],
    ['adminA', ORG_A, 'admin'],
    ['adminA2', ORG_A, 'admin'],
    ['memberB', ORG_B, 'member'],
    ['adminB', ORG_B, 'admin'],
    ['owner', ORG_OWNER, 'super_admin'],
    ['support', ORG_OWNER, 'support'],
    // An org admin of A whom the owner has ALSO designated platform staff: the
    // console guard admits them, so only the pure rules stand between them
    // and another workspace's requests on the system-scoped mount.
    ['staffA', ORG_A, 'admin'],
  ];
  for (const [key, org, role] of cast) {
    const email = `dbtd-${key.toLowerCase()}-${process.pid}@example.invalid`;
    const u = await owner.query(
      `INSERT INTO users (email, name, password_hash, default_organization_id)
       VALUES ($1, $2, 'not-a-real-password', $3) RETURNING id`,
      [email, `dbtd ${key}`, org],
    );
    const id = Number(u.rows[0].id);
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)`,
      [org, id, role],
    );
    const token = jwt.sign(
      { type: 'access', userId: id, organizationId: String(org), role, email, name: `dbtd ${key}` },
      activeJwtSecret(),
      { expiresIn: '15m' },
    );
    people[key] = { id, org, role, email, token };
  }
  await owner.query(
    `INSERT INTO platform_role_grants (user_id, role, granted_by, reason)
     VALUES ($1, 'support', 'dbtd-fixture', $2)`,
    [people.staffA.id, why('fixture staff designation')],
  );

  // Only now load the server.
  const { invalidateOrgMembershipCache } = await import('../../server/middleware/orgMembership');
  invalidateOrgMembershipCache();
  const { authenticateToken } = await import('../../server/middleware/auth');
  const { authMiddleware } = await import('../../server/auth');
  const { requirePlatformAdmin } = await import('../../server/middleware/requirePlatformAdmin');
  const accessRequestsRouter = (await import('../../server/routes/module-access-requests')).default;
  const masterAdminRouter = (await import('../../server/routes/admin/master-admin')).default;
  const db = await import('../../server/db');
  serverPool = db.getPool() as unknown as { end: () => Promise<void> };

  /** Reports the connection a request's queries run on. Test-owned, read-only. */
  const posture: express.RequestHandler = async (_req, res) => {
    const r = await db.query(
      `SELECT current_user AS role,
              current_setting('is_superuser')::boolean AS superuser,
              (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls,
              current_setting('app.rls_enforce', true) AS rls_enforce,
              current_setting('app.current_tenant_id', true) AS tenant,
              current_setting('app.current_user_role', true) AS scope_role`,
    );
    res.json(r.rows[0]);
  };

  app = express();
  app.use(express.json());
  // Same prefix, same scope decision, same auth chain as each real router.
  app.get(`${BASE}/__dbtd_posture`, authenticateToken, posture);
  app.get(`${MASTER}/__dbtd_posture`, authMiddleware, requirePlatformAdmin, posture);
  app.use(BASE, accessRequestsRouter);
  app.use(MASTER, masterAdminRouter);
}, 180_000);

afterAll(async () => {
  try {
    if (owner) await cleanupLaneRows();
  } finally {
    if (serverPool) await serverPool.end().catch(() => {});
    if (scratch) await scratch.destroy();
    if (owner) await owner.end().catch(() => {});
    if (savedAppDatabaseUrl === undefined) delete process.env.APP_DATABASE_URL;
    else process.env.APP_DATABASE_URL = savedAppDatabaseUrl;
    if (savedMasterEmails === undefined) delete process.env.MASTER_ADMIN_EMAILS;
    else process.env.MASTER_ADMIN_EMAILS = savedMasterEmails;
  }
}, 120_000);

// ─── 0. The posture is the production posture ────────────────────────────────

describe('posture', () => {
  it('a member request runs as the non-superuser runtime role, RLS on, scoped to their org', async () => {
    const res = await request(app).get(`${BASE}/__dbtd_posture`).set(auth(people.memberA));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      role: scratch.runtimeRole,
      superuser: false,
      bypassrls: false,
      rls_enforce: 'on',
      tenant: String(ORG_A),
      scope_role: 'member',
    });
  });

  it("the platform owner on this prefix is scoped to the owner's own org, not the system scope", async () => {
    const res = await request(app).get(`${BASE}/__dbtd_posture`).set(auth(people.owner));
    expect(res.status).toBe(200);
    expect(res.body.tenant).toBe(String(ORG_OWNER));
    expect(res.body.scope_role).toBe('super_admin');
    expect(res.body.scope_role).not.toBe('app_super_admin');
  });

  it("the platform owner on the Master Administration prefix runs under the system scope, still as the runtime role", async () => {
    const res = await request(app).get(`${MASTER}/__dbtd_posture`).set(auth(people.owner));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      role: scratch.runtimeRole,
      superuser: false,
      bypassrls: false,
      rls_enforce: 'on',
      tenant: '0',
      scope_role: 'app_super_admin',
    });
  });

  it('the table is RLS enabled + FORCED with the tenant policy, and the partial unique index is deployed', async () => {
    const t = await owner.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE oid = 'public.module_access_requests'::regclass`,
    );
    expect(t.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const p = await owner.query(
      `SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'module_access_requests'`,
    );
    expect(p.rows.map((r) => r.policyname)).toContain('tenant_isolation_policy');
    const i = await owner.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'module_access_requests_open_uniq'`,
    );
    expect(i.rows[0]?.indexdef).toMatch(/UNIQUE INDEX .* \(organization_id, module_id, requested_by\) WHERE \(status = 'open'::text\)/);
  });
});

// ─── 1. A member asks; asking again does not stack a second row ──────────────

describe('member creates a request (per-user scope A)', () => {
  it('first ask inserts one row; a repeat updates the SAME open row via the partial unique index', async () => {
    const first = await request(app)
      .post(BASE)
      .set(auth(people.memberA))
      .send({ moduleId: M.alpha, note: 'first ask' });
    expect(first.status).toBe(201);
    expect(first.body.alreadyOpen).toBe(false);
    expect(first.body.request.organizationId).toBe(ORG_A);
    expect(first.body.request.moduleName).toBe(`dbtd ${M.alpha}`);
    expect(first.body.request.organizationName).toBe('dbtd workspace a');

    const again = await request(app)
      .post(BASE)
      .set(auth(people.memberA))
      .send({ moduleId: M.alpha, note: 'second ask' });
    expect(again.status).toBe(200);
    expect(again.body.alreadyOpen).toBe(true);
    expect(again.body.request.id).toBe(first.body.request.id);

    const rows = await rowsFor(ORG_A, M.alpha);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('open');
    expect(rows[0].note).toBe('second ask');
    expect(Number(rows[0].requested_by)).toBe(people.memberA.id);

    const audit = await auditFor(first.body.request.id);
    expect(audit.map((a) => a.details.accessRequestAction)).toEqual([
      'request.opened',
      'request.repeated',
    ]);
    expect(audit.every((a) => Number(a.tenant_id) === ORG_A)).toBe(true);
  });

  it('five concurrent asks for one module leave exactly one open row, exactly one reported as new', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, n) =>
        request(app)
          .post(BASE)
          .set(auth(people.memberA))
          .send({ moduleId: M.beta, note: `click ${n}` }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.request.id)).size).toBe(1);
    expect(await rowsFor(ORG_A, M.beta)).toHaveLength(1);
  });

  it('a different member of the same org asking for the same module is a separate request', async () => {
    const res = await request(app).post(BASE).set(auth(people.memberA2)).send({ moduleId: M.beta });
    expect(res.status).toBe(201);
    expect(await rowsFor(ORG_A, M.beta)).toHaveLength(2);
  });

  it('once answered, a fresh ask creates a NEW open row beside the answered one', async () => {
    const opened = await request(app).post(BASE).set(auth(people.memberA)).send({ moduleId: M.eps });
    expect(opened.status).toBe(201);
    const declined = await request(app)
      .post(`${BASE}/${opened.body.request.id}/decision`)
      .set(auth(people.adminA))
      .send({ decision: 'declined', reason: why('decline before re-ask') });
    expect(declined.status).toBe(200);

    const reask = await request(app)
      .post(BASE)
      .set(auth(people.memberA))
      .send({ moduleId: M.eps, note: 'plan changed' });
    expect(reask.status).toBe(201);
    expect(reask.body.alreadyOpen).toBe(false);
    expect(reask.body.request.id).not.toBe(opened.body.request.id);

    const rows = await rowsFor(ORG_A, M.eps);
    expect(rows.map((r) => r.status)).toEqual(['declined', 'open']);
  });

  it('the organization comes from the caller, never from the body', async () => {
    const res = await request(app)
      .post(BASE)
      .set(auth(people.memberA))
      .send({ moduleId: M.zeta, organizationId: ORG_B, organization_id: ORG_B });
    expect(res.status).toBe(201);
    expect(res.body.request.organizationId).toBe(ORG_A);
    expect(await rowsFor(ORG_B, M.zeta)).toHaveLength(0);
    expect(await rowsFor(ORG_A, M.zeta)).toHaveLength(1);
  });

  it('an unknown module is refused and writes nothing', async () => {
    const res = await request(app)
      .post(BASE)
      .set(auth(people.memberA))
      .send({ moduleId: 'dbtd_mod_does_not_exist' });
    expect(res.status).toBe(404);
    expect(await rowsFor(ORG_A, 'dbtd_mod_does_not_exist')).toHaveLength(0);
  });

  it("/mine returns the caller's own requests in their workspace only", async () => {
    const res = await request(app).get(`${BASE}/mine`).set(auth(people.memberA));
    expect(res.status).toBe(200);
    const mods = res.body.requests.map((r: any) => r.moduleId);
    expect(mods).toEqual(expect.arrayContaining([M.alpha, M.beta, M.eps, M.zeta]));
    expect(res.body.requests.every((r: any) => r.requestedBy === people.memberA.id)).toBe(true);
    expect(res.body.requests.every((r: any) => r.organizationId === ORG_A)).toBe(true);
  });
});

// ─── 2. Org admins see and decide only their own workspace ───────────────────

describe('tenant isolation under the runtime role', () => {
  let requestB: number;

  beforeAll(async () => {
    const res = await request(app)
      .post(BASE)
      .set(auth(people.memberB))
      .send({ moduleId: M.gamma, note: 'org B needs gamma' });
    expect(res.status).toBe(201);
    requestB = res.body.request.id;
  });

  it("org admin A's queue holds org A's requests and none of org B's", async () => {
    const res = await request(app).get(`${BASE}?status=all`).set(auth(people.adminA));
    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBeGreaterThan(0);
    expect(res.body.requests.every((r: any) => r.organizationId === ORG_A)).toBe(true);
    expect(res.body.requests.map((r: any) => r.id)).not.toContain(requestB);
  });

  it("org admin A cannot decide org B's request, and nothing is granted to B", async () => {
    const res = await request(app)
      .post(`${BASE}/${requestB}/decision`)
      .set(auth(people.adminA))
      .send({ decision: 'approved', reason: why('cross-tenant attempt') });
    expect([403, 404]).toContain(res.status);
    const [row] = await rowsFor(ORG_B, M.gamma);
    expect(row.status).toBe('open');
    expect(await grantFor(ORG_B, M.gamma)).toBeNull();
  });

  it("org admin B sees org B's request and none of A's", async () => {
    const res = await request(app).get(`${BASE}?status=all`).set(auth(people.adminB));
    expect(res.status).toBe(200);
    expect(res.body.requests.map((r: any) => r.id)).toContain(requestB);
    expect(res.body.requests.every((r: any) => r.organizationId === ORG_B)).toBe(true);
  });

  it('a member cannot read the queue or answer a request', async () => {
    const q = await request(app).get(BASE).set(auth(people.memberA));
    expect(q.status).toBe(403);
    const [row] = await rowsFor(ORG_A, M.alpha);
    const d = await request(app)
      .post(`${BASE}/${row.id}/decision`)
      .set(auth(people.memberA2))
      .send({ decision: 'approved', reason: why('member tries') });
    expect(d.status).toBe(403);
    expect(await grantFor(ORG_A, M.alpha)).toBeNull();
  });

  it('an unauthenticated call is refused before any read', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(401);
  });
});

// ─── 3. Approve grants the canonical way; decline grants nothing ─────────────

describe('decisions by the org admin', () => {
  it('approve writes an enabled, unbounded module_subscriptions row for org A, records the decision and audits it', async () => {
    const [row] = await rowsFor(ORG_A, M.alpha);
    const reason = why('approve alpha');
    const res = await request(app)
      .post(`${BASE}/${row.id}/decision`)
      .set(auth(people.adminA))
      .send({ decision: 'approved', reason });
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(true);
    expect(res.body.request.status).toBe('approved');
    expect(res.body.request.decisionReason).toBe(reason);

    const grant = await grantFor(ORG_A, M.alpha);
    expect(grant).toMatchObject({ enabled: true, expires_at: null, enabled_by: people.adminA.email });

    const [after] = await rowsFor(ORG_A, M.alpha);
    expect(after).toMatchObject({
      status: 'approved',
      decided_by: people.adminA.id,
      decided_by_email: people.adminA.email,
      decision_reason: reason,
    });

    const audit = (await auditFor(row.id)).filter(
      (a) => a.details.accessRequestAction === 'request.approved',
    );
    expect(audit).toHaveLength(1);
    expect(Number(audit[0].tenant_id)).toBe(ORG_A);
    expect(audit[0].details).toMatchObject({
      reason,
      granted: true,
      moduleId: M.alpha,
      organizationId: ORG_A,
      decidedByMasterAdmin: false,
    });
  });

  it('approve clears a lapsed trial date instead of re-enabling an already-expired grant', async () => {
    await owner.query(
      `INSERT INTO module_subscriptions (organization_id, module_id, enabled, expires_at)
       VALUES ($1, $2, false, now() - interval '30 days')`,
      [ORG_A, M.delta],
    );
    const id = await seedOpen(ORG_A, M.delta, people.memberA);
    const res = await request(app)
      .post(`${BASE}/${id}/decision`)
      .set(auth(people.adminA))
      .send({ decision: 'approved', reason: why('approve delta') });
    expect(res.status).toBe(200);
    expect(await grantFor(ORG_A, M.delta)).toMatchObject({ enabled: true, expires_at: null });
  });

  it('decline records the reason, grants nothing, and audits it', async () => {
    const [row] = await rowsFor(ORG_A, M.zeta);
    const reason = why('decline zeta');
    const res = await request(app)
      .post(`${BASE}/${row.id}/decision`)
      .set(auth(people.adminA))
      .send({ decision: 'declined', reason });
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(false);
    expect(await grantFor(ORG_A, M.zeta)).toBeNull();
    const [after] = await rowsFor(ORG_A, M.zeta);
    expect(after).toMatchObject({ status: 'declined', decision_reason: reason });
    const audit = (await auditFor(row.id)).filter(
      (a) => a.details.accessRequestAction === 'request.declined',
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ reason, granted: false });
  });

  it('an answered request cannot be answered again, and a reason under the floor is refused', async () => {
    const [row] = await rowsFor(ORG_A, M.alpha);
    const again = await request(app)
      .post(`${BASE}/${row.id}/decision`)
      .set(auth(people.adminA))
      .send({ decision: 'declined', reason: why('second answer') });
    expect(again.status).toBe(409);
    const [still] = await rowsFor(ORG_A, M.alpha);
    expect(still.status).toBe('approved');

    const id = await seedOpen(ORG_A, M.theta, people.memberA);
    const short = await request(app)
      .post(`${BASE}/${id}/decision`)
      .set(auth(people.adminA))
      .send({ decision: 'approved', reason: '  x ' });
    expect(short.status).toBe(400);
    expect(await grantFor(ORG_A, M.theta)).toBeNull();
  });

  /* A GENUINE race, forced rather than hoped for. Two requests fired together
     usually do not overlap — the second reads the row after the first has
     answered and is refused by the status pre-check — so a test that merely
     fires two requests passed with the `AND status = 'open'` guard deleted
     (observed: that mutation survived one run in two). Here the owner
     connection holds the request's row lock while both decisions are sent, so
     both are genuinely in flight and parked on it; the FIRST one parked is the
     first one granted the lock when it is released (row-lock waiters queue in
     order), which is what lets each case below choose the winner. */
  async function raceDecisions(
    id: number,
    first: { who: Person; decision: 'approved' | 'declined' },
    second: { who: Person; decision: 'approved' | 'declined' },
  ): Promise<[request.Response, request.Response]> {
    const parkedCount = async () =>
      Number(
        (
          await owner.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE usename = $1 AND wait_event_type = 'Lock'`,
            [scratch.runtimeRole],
          )
        ).rows[0].n,
      );
    const waitParked = async (n: number) => {
      for (let i = 0; i < 400; i += 1) {
        if ((await parkedCount()) >= n) return;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`only ${await parkedCount()} of ${n} decisions reached the row lock`);
    };
    const send = (s: { who: Person; decision: string }) =>
      request(app)
        .post(`${BASE}/${id}/decision`)
        .set(auth(s.who))
        .send({ decision: s.decision, reason: why(`race ${s.decision}`) })
        // `.then` is what starts a supertest request.
        .then((r) => r);

    const lock = await owner.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM module_access_requests WHERE id = $1 FOR UPDATE', [id]);
      const p1 = send(first);
      await waitParked(1);
      const p2 = send(second);
      await waitParked(2);
      await lock.query('COMMIT');
      return await Promise.all([p1, p2]);
    } finally {
      await lock.query('ROLLBACK').catch(() => {});
      lock.release();
    }
  }

  it('two administrators answering at once produce one decision; the loser is told so', async () => {
    const id = await seedOpen(ORG_A, M.eta, people.memberA2);
    const [a, b] = await raceDecisions(
      id,
      { who: people.adminA, decision: 'approved' },
      { who: people.adminA2, decision: 'declined' },
    );
    expect([a.status, b.status]).toEqual([200, 409]);
    const [row] = await rowsFor(ORG_A, M.eta);
    expect(row.status).toBe('approved');
    expect(await grantFor(ORG_A, M.eta)).toMatchObject({ enabled: true, expires_at: null });
  });

  /* The race the other way round. A decline that wins must leave NO grant: the
     losing approval is told the request was already answered, so a grant it
     wrote on its way there would be a module switched on for a request the
     queue says was declined, with no approval anywhere in the audit trail. */
  it('a decline that wins a race against an approval leaves no grant behind', async () => {
    const id = await seedOpen(ORG_A, M.gamma, people.memberA2);
    const [d, a] = await raceDecisions(
      id,
      { who: people.adminA2, decision: 'declined' },
      { who: people.adminA, decision: 'approved' },
    );
    expect([d.status, a.status]).toEqual([200, 409]);
    const [row] = await rowsFor(ORG_A, M.gamma);
    expect(row.status).toBe('declined');
    expect(await grantFor(ORG_A, M.gamma)).toBeNull();
    const approvals = (await auditFor(id)).filter(
      (x) => x.details.accessRequestAction === 'request.approved',
    );
    expect(approvals).toHaveLength(0);
  });
});

// ─── 4. The platform owner across workspaces ─────────────────────────────────

describe('platform owner across workspaces (system-scoped mount)', () => {
  let requestB2: number;
  let requestB3: number;
  let requestB4: number;
  let ownRequest: number;

  beforeAll(async () => {
    requestB2 = await seedOpen(ORG_B, M.delta, people.memberB, 'org B wants delta');
    requestB3 = await seedOpen(ORG_B, M.eps, people.memberB, 'org B wants eps');
    requestB4 = await seedOpen(ORG_B, M.theta, people.memberB, 'org B wants theta');
    ownRequest = await seedOpen(ORG_OWNER, M.alpha, people.support, 'owner org wants alpha');
  });

  // H1, fixed — the all-workspaces view the Access Requests tab reads.
  it("H1: the owner's queue holds every workspace's open requests, not only the owner's own", async () => {
    const res = await request(app).get(`${MASTER}/access-requests?status=open`).set(auth(people.owner));
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('all');
    const ids = res.body.requests.map((r: any) => r.id);
    expect(ids).toEqual(expect.arrayContaining([requestB2, requestB3, requestB4, ownRequest]));
    const orgs = new Set(res.body.requests.map((r: any) => r.organizationId));
    for (const org of [ORG_A, ORG_B, ORG_OWNER]) expect(orgs.has(org)).toBe(true);
    const b2 = res.body.requests.find((r: any) => r.id === requestB2);
    expect(b2).toMatchObject({
      organizationName: 'dbtd workspace b',
      moduleName: `dbtd ${M.delta}`,
      status: 'open',
    });
    expect(res.body.requests.every((r: any) => r.status === 'open')).toBe(true);
    // The count the console shows is the count of what it holds.
    expect(res.body.openCount).toBe(res.body.requests.length);
  });

  it('the per-user route refuses the every-workspace read outright instead of narrowing it', async () => {
    for (const who of [people.owner, people.adminA]) {
      const res = await request(app).get(`${BASE}?scope=all`).set(auth(who));
      expect(res.status).toBe(400);
      expect(res.body.requests).toBeUndefined();
    }
    // Without the parameter the owner reads their OWN workspace there — which is
    // what that mount is for, and is labelled as such.
    const own = await request(app).get(`${BASE}?status=open`).set(auth(people.owner));
    expect(own.status).toBe(200);
    expect(own.body.scope).toBe('organization');
    expect(own.body.requests.map((r: any) => r.id)).toEqual([ownRequest]);
  });

  // H2, fixed — the owner answering another workspace's request.
  it("H2: the owner approving org B's request writes org B's grant, records it and audits it under org B", async () => {
    const reason = why('owner approves B delta');
    const res = await request(app)
      .post(`${MASTER}/access-requests/${requestB2}/decision`)
      .set(auth(people.owner))
      .send({ decision: 'approved', reason });
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(true);
    expect(res.body.request).toMatchObject({ organizationId: ORG_B, status: 'approved' });

    expect(await grantFor(ORG_B, M.delta)).toMatchObject({
      enabled: true,
      expires_at: null,
      enabled_by: people.owner.email,
    });
    const [row] = (await rowsFor(ORG_B, M.delta)).filter((r) => r.id === requestB2);
    expect(row).toMatchObject({
      status: 'approved',
      decided_by: people.owner.id,
      decided_by_email: people.owner.email,
      decision_reason: reason,
    });

    const audit = (await auditFor(requestB2)).filter(
      (a) => a.details.accessRequestAction === 'request.approved',
    );
    expect(audit).toHaveLength(1);
    expect(Number(audit[0].tenant_id)).toBe(ORG_B);
    expect(Number(audit[0].user_id)).toBe(people.owner.id);
    expect(audit[0].details).toMatchObject({
      reason,
      granted: true,
      organizationId: ORG_B,
      decidedByMasterAdmin: true,
    });
  });

  it("the owner declining org B's request records the reason and grants nothing", async () => {
    const reason = why('owner declines B eps');
    const res = await request(app)
      .post(`${MASTER}/access-requests/${requestB3}/decision`)
      .set(auth(people.owner))
      .send({ decision: 'declined', reason });
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(false);
    expect(await grantFor(ORG_B, M.eps)).toBeNull();
    const [row] = (await rowsFor(ORG_B, M.eps)).filter((r) => r.id === requestB3);
    expect(row).toMatchObject({ status: 'declined', decision_reason: reason });
    const audit = (await auditFor(requestB3)).filter(
      (a) => a.details.accessRequestAction === 'request.declined',
    );
    expect(audit).toHaveLength(1);
    expect(Number(audit[0].tenant_id)).toBe(ORG_B);
  });

  it("the per-user route still cannot reach org B's request for the owner — members stay scoped", async () => {
    const res = await request(app)
      .post(`${BASE}/${requestB4}/decision`)
      .set(auth(people.owner))
      .send({ decision: 'approved', reason: why('owner via per-user route') });
    expect(res.status).toBe(404);
    const [row] = (await rowsFor(ORG_B, M.theta)).filter((r) => r.id === requestB4);
    expect(row.status).toBe('open');
    expect(await grantFor(ORG_B, M.theta)).toBeNull();
  });

  it('platform staff without the owner grant are admitted to the console but refused the queue and the decision', async () => {
    const q = await request(app).get(`${MASTER}/access-requests`).set(auth(people.support));
    expect(q.status).toBe(403);
    expect(q.body.requests).toBeUndefined();
    const d = await request(app)
      .post(`${MASTER}/access-requests/${requestB4}/decision`)
      .set(auth(people.support))
      .send({ decision: 'approved', reason: why('support tries') });
    expect(d.status).toBe(403);
    const [row] = (await rowsFor(ORG_B, M.theta)).filter((r) => r.id === requestB4);
    expect(row.status).toBe('open');
    expect(await grantFor(ORG_B, M.theta)).toBeNull();
  });

  /* On this mount RLS no longer confines anybody to a workspace — the system
     scope is the point of it — so the tenant boundary in `denyDecision` is the
     ONLY thing between a console-admitted org admin and another workspace's
     requests. Without this case, deleting that boundary went unnoticed
     (observed: the mutation survived the rest of this file). */
  it('an org admin who is also platform staff may answer only their own workspace on the console mount', async () => {
    const q = await request(app).get(`${MASTER}/access-requests`).set(auth(people.staffA));
    expect(q.status).toBe(403);
    expect(q.body.requests).toBeUndefined();

    const cross = await request(app)
      .post(`${MASTER}/access-requests/${requestB4}/decision`)
      .set(auth(people.staffA))
      .send({ decision: 'approved', reason: why('staff org admin crosses') });
    expect(cross.status).toBe(403);
    expect(cross.body.error).toMatch(/another workspace/i);
    const [row] = (await rowsFor(ORG_B, M.theta)).filter((r) => r.id === requestB4);
    expect(row.status).toBe('open');
    expect(await grantFor(ORG_B, M.theta)).toBeNull();

    const ownId = await seedOpen(ORG_A, M.delta, people.memberA2, 'own workspace, console mount');
    const own = await request(app)
      .post(`${MASTER}/access-requests/${ownId}/decision`)
      .set(auth(people.staffA))
      .send({ decision: 'declined', reason: why('staff org admin answers own') });
    expect(own.status).toBe(200);
    expect(own.body.request).toMatchObject({ organizationId: ORG_A, status: 'declined' });
  });

  it('an org administrator cannot reach the console mount at all', async () => {
    const q = await request(app).get(`${MASTER}/access-requests`).set(auth(people.adminA));
    expect(q.status).toBe(403);
    expect(q.body.requests).toBeUndefined();
    const d = await request(app)
      .post(`${MASTER}/access-requests/${requestB4}/decision`)
      .set(auth(people.adminB))
      .send({ decision: 'approved', reason: why('org admin via console') });
    expect(d.status).toBe(403);
    expect(await grantFor(ORG_B, M.theta)).toBeNull();
  });
});

// ─── 5. Filters, a long queue, input limits, the owner's own workspace ───────
//
// Added by the independent review (2026-09-22). Each case here is the one that
// catches a source mutation which survived sections 0–4; the mutation is named
// on the case. Runs last, and only in org B and the owner's org, so nothing it
// seeds is visible to an earlier case.

describe('queue filters, a long queue, input limits and the owner in their own workspace', () => {
  // Mutation caught: the queue's status filter collapsed to 'open' for every
  // value (`toStatus('open')`), so asking for answered requests showed the
  // open ones under an "approved" heading.
  it("status=approved and status=declined return exactly the workspace's rows in that state", async () => {
    const { rows } = await owner.query(
      `SELECT id, status FROM module_access_requests WHERE organization_id = $1`,
      [ORG_B],
    );
    const idsIn = (s: string) =>
      rows
        .filter((r) => r.status === s)
        .map((r) => Number(r.id))
        .sort((a, b) => a - b);
    // Section 4 left one approved (delta) and one declined (eps) request in B.
    expect(idsIn('approved').length).toBeGreaterThan(0);
    expect(idsIn('declined').length).toBeGreaterThan(0);

    for (const s of ['approved', 'declined'] as const) {
      const res = await request(app).get(`${BASE}?status=${s}`).set(auth(people.adminB));
      expect(res.status).toBe(200);
      expect(res.body.scope).toBe('organization');
      expect(res.body.requests.map((r: any) => r.id).sort((a: number, b: number) => a - b)).toEqual(
        idsIn(s),
      );
      expect(res.body.requests.every((r: any) => r.status === s)).toBe(true);
      expect(res.body.openCount).toBe(0);
      expect(res.body.truncated).toBe(false);
    }
  });

  // Mutations caught: (a) `ORDER BY (r.status = 'open') DESC` dropped, so a
  // workspace with more than a page of answered requests lost its OPEN ones
  // off the end of the page; (b) `truncated` hard-wired false, so a cut-short
  // queue presented itself as the whole queue.
  it('a queue longer than one page keeps every open request on the page, first, and says it was cut short', async () => {
    const { rows: oldRows } = await owner.query(
      `INSERT INTO module_access_requests
         (organization_id, module_id, requested_by, requester_email, note, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'an old open ask', 'open', now() - interval '1 day', now() - interval '1 day')
       RETURNING id`,
      [ORG_B, M.eta, people.memberB.id, people.memberB.email],
    );
    const oldOpen = Number(oldRows[0].id);
    // More answered requests than one page holds, all NEWER than every open one.
    await owner.query(
      `INSERT INTO module_access_requests
         (organization_id, module_id, requested_by, status, decided_by, decided_at, decision_reason)
       SELECT $1, $2, $3, 'declined', $4, now(), $5 FROM generate_series(1, 205)`,
      [ORG_B, M.zeta, people.memberB.id, people.adminB.id, why('bulk declined')],
    );
    const openIds = (
      await owner.query(
        `SELECT id FROM module_access_requests WHERE organization_id = $1 AND status = 'open'`,
        [ORG_B],
      )
    ).rows
      .map((r) => Number(r.id))
      .sort((a, b) => a - b);
    expect(openIds).toContain(oldOpen);
    expect(openIds.length).toBeGreaterThan(1);

    const res = await request(app).get(`${BASE}?status=all`).set(auth(people.adminB));
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(200);
    expect(res.body.truncated).toBe(true);
    expect(res.body.requests.every((r: any) => r.organizationId === ORG_B)).toBe(true);
    const statuses: string[] = res.body.requests.map((r: any) => r.status);
    const firstAnswered = statuses.findIndex((s) => s !== 'open');
    expect(firstAnswered).toBe(openIds.length);
    expect(statuses.slice(firstAnswered).every((s) => s !== 'open')).toBe(true);
    expect(
      res.body.requests
        .filter((r: any) => r.status === 'open')
        .map((r: any) => r.id)
        .sort((a: number, b: number) => a - b),
    ).toEqual(openIds);
    expect(res.body.openCount).toBe(openIds.length);

    const open = await request(app).get(`${BASE}?status=open`).set(auth(people.adminB));
    expect(open.status).toBe(200);
    expect(open.body.truncated).toBe(false);
    expect(open.body.requests.map((r: any) => r.id).sort((a: number, b: number) => a - b)).toEqual(
      openIds,
    );
  });

  // Mutation caught: the MAX_NOTE_CHARS refusal removed from normalizeNote, so
  // an over-long note was stored. The limit is refused whole, never truncated.
  it('a note over 2000 characters is refused and records nothing; one at the limit is kept whole', async () => {
    const over = await request(app)
      .post(BASE)
      .set(auth(people.memberB))
      .send({ moduleId: M.alpha, note: 'x'.repeat(2001) });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/too long/i);
    expect(await rowsFor(ORG_B, M.alpha)).toHaveLength(0);

    const atLimit = 'y'.repeat(2000);
    const ok = await request(app)
      .post(BASE)
      .set(auth(people.memberB))
      .send({ moduleId: M.alpha, note: `  ${atLimit}  ` });
    expect(ok.status).toBe(201);
    const rows = await rowsFor(ORG_B, M.alpha);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe(atLimit);
  });

  // Mutation caught: the "no workspace" refusal removed from denyCreate. The
  // real middleware lets such a token through to the handler, so without it
  // the create reached SQL with no tenant scope and answered 500 "Please try
  // again" instead of saying what is wrong.
  it('a real token with no workspace is refused with 401 and records nothing', async () => {
    const p = people.memberB;
    const token = jwt.sign(
      { type: 'access', userId: p.id, role: 'member', email: p.email, name: 'dbtd memberB' },
      activeJwtSecret(),
      { expiresIn: '15m' },
    );
    const created = await request(app)
      .post(BASE)
      .set({ Authorization: `Bearer ${token}` })
      .send({ moduleId: M.beta, note: 'no workspace' });
    expect(created.status).toBe(401);
    expect(created.body.error).toMatch(/not attached to a workspace/i);
    const mine = await request(app).get(`${BASE}/mine`).set({ Authorization: `Bearer ${token}` });
    expect(mine.status).toBe(401);
    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM module_access_requests WHERE requested_by = $1 AND module_id = $2`,
      [p.id, M.beta],
    );
    expect(rows[0].n).toBe(0);
  });

  // Mutation caught: `decidedByMasterAdmin: actor.isMasterAdmin`, which marks
  // the owner's answer in their OWN workspace as a cross-workspace decision.
  it("the owner answering their own workspace's request is not audited as a cross-workspace decision", async () => {
    const id = await seedOpen(ORG_OWNER, M.gamma, people.support, 'owner org wants gamma');
    const reason = why('owner declines own gamma');
    const res = await request(app)
      .post(`${MASTER}/access-requests/${id}/decision`)
      .set(auth(people.owner))
      .send({ decision: 'declined', reason });
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ organizationId: ORG_OWNER, status: 'declined' });
    const audit = (await auditFor(id)).filter(
      (a) => a.details.accessRequestAction === 'request.declined',
    );
    expect(audit).toHaveLength(1);
    expect(Number(audit[0].tenant_id)).toBe(ORG_OWNER);
    expect(Number(audit[0].user_id)).toBe(people.owner.id);
    expect(audit[0].details).toMatchObject({
      reason,
      organizationId: ORG_OWNER,
      decidedByMasterAdmin: false,
    });
  });

  // Rule 1: every deploy re-executes this file against the live table. Run it
  // exactly as scripts/db/migration-set.mjs does (BEGIN; <file>; COMMIT),
  // twice, as the owner, on the deployed table, and roll back instead of
  // committing so the shared database is left as it was.
  it('the migration replays onto the deployed table as a no-op (Rule 1), and the status CHECK holds', async () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../db/migrations/20260824_module_access_requests.sql'),
      'utf8',
    );
    const c = await owner.connect();
    try {
      const count = async () =>
        Number(
          (
            await c.query(
              `SELECT count(*)::int AS n FROM module_access_requests
                WHERE organization_id BETWEEN $1 AND $2`,
              [ORG_LO, ORG_HI],
            )
          ).rows[0].n,
        );
      const before = await count();
      expect(before).toBeGreaterThan(0);
      await c.query('BEGIN');
      await c.query(sql);
      await c.query(sql);
      expect(await count()).toBe(before);

      const ck = await c.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'public.module_access_requests'::regclass
            AND conname = 'module_access_requests_status_ck'`,
      );
      expect(ck.rows).toHaveLength(1);
      expect(ck.rows[0].def).toMatch(/'open'.*'approved'.*'declined'/);
      const idx = await c.query(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'module_access_requests'
          ORDER BY indexname`,
      );
      expect(idx.rows.map((r) => r.indexname)).toEqual(
        expect.arrayContaining([
          'module_access_requests_open_uniq',
          'module_access_requests_org_status_idx',
          'module_access_requests_requester_idx',
        ]),
      );

      await c.query('SAVEPOINT bad_status');
      await expect(
        c.query(
          `INSERT INTO module_access_requests (organization_id, module_id, requested_by, status)
           VALUES ($1, $2, $3, 'pending')`,
          [ORG_A, M.alpha, people.memberA.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await c.query('ROLLBACK TO SAVEPOINT bad_status');
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });
});
