/**
 * The tenant directory (/api/tenants) on the runtime role, with no owner
 * credential in reach (MR-03 Stage 3, OPS-16; MR-05 Stage 1, ARCH-08).
 *
 * server/routes/tenants-simple.ts served its four directory handlers through a
 * module-level `postgres` client on DATABASE_URL, the RDS master credential: a
 * role that owns every table and bypasses RLS, on the request path. Here
 * DATABASE_URL points at a closed port, as it would in a process that no longer
 * holds the owner credential. The route must still answer, through the
 * non-superuser runtime role with RLS enforcing, under the system scope its
 * mount applies, and its authorization must hold: a member sees their own
 * organisations and their own directory, nobody else's; a platform admin sees
 * every organisation.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';

const { authState } = vi.hoisted(() => ({ authState: { user: null as any } }));
// Authentication only: the real requirePlatformAdmin / resolvePlatformAdmin run.
vi.mock('../../server/auth', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'unauthorized' });
    (req as any).user = authState.user;
    (req as any).userId = authState.user.id;
    next();
  },
}));

const TAG = 'dbttd';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
/** Slugs allow lowercase, digits and hyphens only (the route's own rule). */
const SLUG_RUN = RUN.replace(/_/g, '-');
const ORG_MEMBER = 91800;
const ORG_OTHER = 91801;
const RUNTIME_PASSWORD = 'dbttd-tenants-directory-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbttd_rt_${RUN}` });
const OWNER_EMAIL = `${TAG}-owner-${RUN}@example.invalid`;
/** Where the owner credential points in this test: a port nothing listens on. */
const NOWHERE = 'postgresql://owner@127.0.0.1:1/no_owner_credential';

let owner: Pool;
let runtime: typeof import('../../server/db/runtime');
let app: express.Express;
let memberId = 0;
let otherId = 0;

async function cleanup(): Promise<void> {
  const ids = (await owner.query(
    `SELECT id FROM organizations WHERE id = ANY($1::int[]) OR slug LIKE $2`,
    [[ORG_MEMBER, ORG_OTHER], `${TAG}-%`],
  )).rows.map((r) => Number(r.id));
  if (ids.length) {
    await owner.query('DELETE FROM module_subscriptions WHERE organization_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM organization_users WHERE organization_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM client_workspaces WHERE organization_id = ANY($1::int[])', [ids]);
  }
  await owner.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}-%@example.invalid`]);
  if (ids.length) await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ids]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup();
  const provisioned = await provisionAppServiceRole(owner, {
    env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
  });
  if (provisioned.skipped) throw new Error('[dbttd] provisionAppServiceRole skipped — no runtime role.');

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.DATABASE_URL = NOWHERE;
  process.env.RLS_ENFORCE = 'on';
  process.env.PLATFORM_ADMIN_EMAILS = OWNER_EMAIL;

  for (const id of [ORG_MEMBER, ORG_OTHER]) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, tier, status) VALUES ($1, $2, $2, 'free', 'active')`,
      [id, `${TAG}-${id}-${SLUG_RUN}`],
    );
  }
  memberId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Member', 'dbttd-no-login', 'active') RETURNING id`,
    [`${TAG}-member-${RUN}@example.invalid`],
  )).rows[0].id);
  otherId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Other', 'dbttd-no-login', 'active') RETURNING id`,
    [`${TAG}-other-${RUN}@example.invalid`],
  )).rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member'), ($3, $4, 'admin')`,
    [ORG_MEMBER, memberId, ORG_OTHER, otherId],
  );

  runtime = await import('../../server/db/runtime');
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const router = (await import('../../server/routes/tenants-simple')).default;
  app = express();
  app.use(express.json());
  // The mount as production has it: /api/tenants is a system-scoped prefix.
  app.use('/api/tenants', establishRequestTenantScope, router);
}, 120_000);

afterAll(async () => {
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbttd] cleanup left rows:', err?.message));
    await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`).catch(() => {});
    await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`).catch(() => {});
    await owner.end();
  }
});

const ours = (rows: Array<{ slug: string }>) => rows.map((r) => r.slug).filter((s) => s.startsWith(`${TAG}-`)).sort();
const member = () => ({ id: memberId, organizationId: ORG_MEMBER, role: 'member', roles: ['member'], email: `${TAG}-member-${RUN}@example.invalid` });
const platformOwner = () => ({ id: otherId, organizationId: ORG_OTHER, role: 'admin', roles: ['admin'], email: OWNER_EMAIL, provider: 'local-jwt' });

describe('the runtime role serves the directory', () => {
  it('is a non-superuser role without BYPASSRLS, and RLS is enforcing', async () => {
    const { rows } = await owner.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [runtimeRole],
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
    expect(process.env.DATABASE_URL).toBe(NOWHERE);
  });

  it('a member lists only their own organisation', async () => {
    authState.user = member();
    const res = await request(app).get('/api/tenants');
    expect(res.status).toBe(200);
    expect(ours(res.body)).toEqual([`${TAG}-${ORG_MEMBER}-${SLUG_RUN}`]);
  });

  it("a member reads their own organisation's directory", async () => {
    authState.user = member();
    const res = await request(app).get(`/api/tenants/${ORG_MEMBER}/users`);
    expect(res.status).toBe(200);
    expect(res.body.map((u: { id: number }) => Number(u.id))).toEqual([memberId]);
  });

  it("a member is refused another organisation's directory", async () => {
    authState.user = member();
    const res = await request(app).get(`/api/tenants/${ORG_OTHER}/users`);
    expect(res.status).toBe(403);
  });

  it('a platform admin lists every organisation, and reads any directory', async () => {
    authState.user = platformOwner();
    const list = await request(app).get('/api/tenants');
    expect(list.status).toBe(200);
    expect(ours(list.body)).toEqual([`${TAG}-${ORG_MEMBER}-${SLUG_RUN}`, `${TAG}-${ORG_OTHER}-${SLUG_RUN}`]);
    const users = await request(app).get(`/api/tenants/${ORG_MEMBER}/users`);
    expect(users.status).toBe(200);
    expect(users.body.map((u: { id: number }) => Number(u.id))).toEqual([memberId]);
  });

  it('a platform admin renames an organisation, and a taken slug is a 409', async () => {
    authState.user = platformOwner();
    const renamed = await request(app).patch(`/api/tenants/${ORG_MEMBER}`).send({ name: `${TAG} renamed ${RUN}` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe(`${TAG} renamed ${RUN}`);
    expect(renamed.body.slug).toBe(`${TAG}-${ORG_MEMBER}-${SLUG_RUN}`);
    const taken = await request(app).patch(`/api/tenants/${ORG_MEMBER}`).send({ slug: `${TAG}-${ORG_OTHER}-${SLUG_RUN}` });
    expect(taken.status).toBe(409);
  });

  it('a platform admin creates an organisation', async () => {
    authState.user = platformOwner();
    const res = await request(app).post('/api/tenants').send({ name: `${TAG} created ${RUN}`, slug: `${TAG}-created-${SLUG_RUN}` });
    expect(res.status).toBe(201);
    const { rows } = await owner.query('SELECT id FROM organizations WHERE id = $1', [res.body.id]);
    expect(rows).toHaveLength(1);
  });
});
