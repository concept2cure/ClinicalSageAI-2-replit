/**
 * The platform owner can see enterprise onboarding requests — and nobody else can.
 *
 * Launch rows D2 / D10. Onboarding's "Request Enterprise onboarding" writes a
 * `license_requests` row (tests/db/enterprise-onboarding-intake.dbtest.ts). Until
 * GET /api/admin/master/enterprise-requests, nothing read that table: a prospect
 * could ask and no one would learn of it. This pins the read.
 *
 * ── Posture: production's ──────────────────────────────────────────────────
 *   - The REAL Master Administration router (server/routes/admin/master-admin.ts)
 *     is mounted at /api/admin/master with its own authMiddleware and
 *     requirePlatformAdmin, exactly as tests/db/module-access-requests.dbtest.ts
 *     mounts it. /api/admin/master is in SYSTEM_SCOPE_PREFIXES, so the read runs
 *     under the system scope — the only scope license_requests' policy admits.
 *   - server/db connects as a NON-SUPERUSER, NOBYPASSRLS runtime role minted by
 *     the real scripts/db/provision-app-role.mjs, with RLS_ENFORCE=on.
 *   - Tokens are signed with the secret the verifier resolves.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbter": organisations 91850–91859, emails `dbter-…`. Only those rows go.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';

const TAG = 'dbter';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const ORG_OWNER = 91850;
const ORG_CUSTOMER = 91851;
const MASTER = '/api/admin/master';
const RUNTIME_PASSWORD = 'dbter-enterprise-requests-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbter_rt_${RUN}` });

type Person = { id: number; token: string };
const people: Record<'owner' | 'customerAdmin', Person> = {} as never;

const PENDING = { name: 'Pending Prospect', email: `${TAG}-pending-${RUN}@example.invalid`, organization: `${TAG} Biologics` };
const REVIEWED = { name: 'Reviewed Prospect', email: `${TAG}-reviewed-${RUN}@example.invalid`, organization: `${TAG} Devices` };

let owner: Pool;
let app: express.Express;
let serverPool: { end: () => Promise<void> } | null = null;
let savedMasterEmails: string | undefined;

const auth = (p: Person) => ({ Authorization: `Bearer ${p.token}` });

async function cleanup() {
  await owner.query(`DELETE FROM license_requests WHERE email LIKE $1`, [`${TAG}-%@example.invalid`]);
  await owner.query(`DELETE FROM organization_users WHERE organization_id BETWEEN $1 AND $2`, [ORG_OWNER, ORG_OWNER + 9]);
  await owner.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}-%@example.invalid`]);
  await owner.query(`DELETE FROM organizations WHERE id BETWEEN $1 AND $2`, [ORG_OWNER, ORG_OWNER + 9]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup();

  for (let attempt = 1; ; attempt++) {
    try {
      const p = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      if (p.skipped) throw new Error('[dbter] provisionAppServiceRole skipped');
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
  savedMasterEmails = process.env.MASTER_ADMIN_EMAILS;
  process.env.MASTER_ADMIN_EMAILS = `${TAG}-nobody@example.invalid`;

  for (const [id, label] of [[ORG_OWNER, 'owner'], [ORG_CUSTOMER, 'customer']] as const) {
    await owner.query(`INSERT INTO organizations (id, name, slug, status) VALUES ($1, $2, $3, 'active')`, [
      id, `${TAG} ${label}`, `${TAG}-${label}-${RUN}`,
    ]);
  }

  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  for (const [key, org, role] of [
    ['owner', ORG_OWNER, 'super_admin'],
    ['customerAdmin', ORG_CUSTOMER, 'admin'],
  ] as const) {
    const email = `${TAG}-${key.toLowerCase()}-${RUN}@example.invalid`;
    const u = await owner.query(
      `INSERT INTO users (email, name, password_hash, default_organization_id)
       VALUES ($1, $2, 'not-a-real-password', $3) RETURNING id`,
      [email, `${TAG} ${key}`, org],
    );
    const id = Number(u.rows[0].id);
    await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)`, [org, id, role]);
    const token = jwt.sign(
      { type: 'access', userId: id, organizationId: String(org), role, email, name: `${TAG} ${key}` },
      activeJwtSecret(),
      { expiresIn: '15m' },
    );
    people[key] = { id, token };
  }

  await owner.query(
    `INSERT INTO license_requests (name, email, organization, message, status)
     VALUES ($1, $2, $3, 'Enterprise onboarding request — 25 seats.', 'pending'),
            ($4, $5, $6, 'Already contacted.', 'reviewed')`,
    [PENDING.name, PENDING.email, PENDING.organization, REVIEWED.name, REVIEWED.email, REVIEWED.organization],
  );

  const { invalidateOrgMembershipCache } = await import('../../server/middleware/orgMembership');
  invalidateOrgMembershipCache();
  const masterAdminRouter = (await import('../../server/routes/admin/master-admin')).default;
  const db = await import('../../server/db');
  serverPool = db.getPool() as unknown as { end: () => Promise<void> };

  app = express();
  app.use(express.json());
  app.use(MASTER, masterAdminRouter);
}, 180_000);

afterAll(async () => {
  if (savedMasterEmails === undefined) delete process.env.MASTER_ADMIN_EMAILS;
  else process.env.MASTER_ADMIN_EMAILS = savedMasterEmails;
  if (serverPool) await serverPool.end().catch(() => {});
  if (owner) {
    await owner.query(`GRANT SELECT ON license_requests TO ${runtimeRole}`).catch(() => {});
    await cleanup().catch((e) => console.warn('[dbter] cleanup left rows:', e?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        const m = (err as Error).message;
        if (/does not exist/.test(m)) break;
        if (attempt >= 5 || !/tuple concurrently updated/.test(m)) break;
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

const mine = (rows: Array<{ email: string }>) => rows.filter((r) => r.email.startsWith(`${TAG}-`)).map((r) => r.email);

describe('GET /api/admin/master/enterprise-requests — the platform owner', () => {
  it('lists pending requests by default, and not reviewed ones', async () => {
    const res = await request(app).get(`${MASTER}/enterprise-requests`).set(auth(people.owner));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(mine(res.body.requests)).toEqual([PENDING.email]);
    const row = res.body.requests.find((r: { email: string }) => r.email === PENDING.email);
    expect(row).toMatchObject({
      name: PENDING.name,
      organization: PENDING.organization,
      message: 'Enterprise onboarding request — 25 seats.',
      status: 'pending',
    });
  });

  it('lists reviewed ones too with ?status=all', async () => {
    const res = await request(app).get(`${MASTER}/enterprise-requests?status=all`).set(auth(people.owner));
    expect(res.status).toBe(200);
    expect(mine(res.body.requests).sort()).toEqual([PENDING.email, REVIEWED.email].sort());
  });

  it('refuses an unknown status filter rather than guessing', async () => {
    const res = await request(app).get(`${MASTER}/enterprise-requests?status=open`).set(auth(people.owner));
    expect(res.status).toBe(400);
  });
});

describe('everyone else', () => {
  it("a customer's organisation admin is refused — other companies' contact details", async () => {
    const res = await request(app).get(`${MASTER}/enterprise-requests`).set(auth(people.customerAdmin));
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(PENDING.email);
  });

  it('no token is refused', async () => {
    const res = await request(app).get(`${MASTER}/enterprise-requests`);
    expect(res.status).toBe(401);
  });
});

describe('a read that fails is never shown as "no requests"', () => {
  it('answers 500 with no list when the store cannot be read', async () => {
    await owner.query(`REVOKE SELECT ON license_requests FROM ${runtimeRole}`);
    try {
      const res = await request(app).get(`${MASTER}/enterprise-requests`).set(auth(people.owner));
      expect(res.status).toBe(500);
      expect(res.body.requests).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/permission denied|license_requests/);
    } finally {
      await owner.query(`GRANT SELECT ON license_requests TO ${runtimeRole}`);
    }
  });
});
