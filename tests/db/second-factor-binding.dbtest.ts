/**
 * An enrolled authenticator is replaced only by its owner, with a current code
 * (VSR-001 F-26).
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * POST /api/auth/mfa/setup issued a new TOTP secret to any signed-in session
 * and wrote it over the stored one. Two-step verification stayed on, and the
 * route handed the new secret back. So whoever held a session (a token lifted
 * from a browser, a workstation left signed in) became the holder of the
 * account's second factor:
 *   - the owner's authenticator stopped working, at sign-in and at signing;
 *   - a code from the new secret satisfied the second factor for the sign-in
 *     and for every electronic signature (reverifySigner), so session plus
 *     password was enough to sign as the owner.
 * Nothing was recorded. §11.300 requires the controls on identification codes
 * and passwords to ensure that no one but their genuine owner can use them;
 * §11.200(a)(1) requires every signing component to be the owner's.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As one-time-credentials.dbtest.ts: production's registerPlatformRoutes, a
 * freshly minted NOSUPERUSER NOBYPASSRLS runtime role through APP_DATABASE_URL,
 * RLS_ENFORCE=on, dev-login closed. Nothing in mfaService is stubbed; the
 * clock (Date only) is set, so each case presents the step it names.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbsfb": organisation 92050 (range 92050–92099); every email starts
 * `dbsfb-`. Audit rows are removed through the documented archive door.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { totp } from '../validation/lib/totp.mjs';

type Runtime = typeof import('../../server/db/runtime');
type Mfa = typeof import('../../server/services/mfaService');

const ORG = 92050;
const TAG = 'dbsfb';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbsfb-second-factor-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbsfb_rt_${RUN}` });
const PASSWORD = 'Dbsfb-Second-Factor-2026!';
const EXTERNAL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

// 5 s into a step, so "the step the clock is in" is never at an edge.
const T0 = Math.floor(Date.now() / 30_000) * 30_000 + 5_000;
/** Move the (faked) clock to `n` steps after T0. */
const at = (n: number) => vi.setSystemTime(T0 + n * 30_000);

interface Member {
  id: number;
  email: string;
  secret: string;
}
/** A secret's code for step n after T0. */
const codeFor = (secret: string, n: number) => totp(secret, T0 + n * 30_000);

let owner: Pool;
let runtime: Runtime;
let mfa: Mfa;
let app: express.Express;
const members: Record<'owner' | 'rotating' | 'fresh' | 'pending', Member> = {} as never;

const inScope = <T>(caller: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: `dbsfb:${caller}` }, fn);

/** A signed-in session for the member: a live access token, as /mfa/verify issues. */
async function session(m: Member): Promise<{ Authorization: string }> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const token = jwt.sign(
    { userId: String(m.id), email: m.email, organizationId: String(ORG), role: 'admin', type: 'access' },
    activeJwtSecret(),
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

async function stored(m: Member): Promise<{ secret: string | null; enabled: boolean | null }> {
  const { rows } = await owner.query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [m.id]);
  return { secret: rows[0].mfa_secret, enabled: rows[0].mfa_enabled };
}

/** The member's recorded second-factor changes, in the order the tenant's chain holds them. */
async function recorded(m: Member): Promise<string[]> {
  const { rows } = await owner.query(
    `SELECT action, new_values->>'outcome' AS outcome, coalesce(new_values->>'reason', '') AS reason
       FROM audit_logs
      WHERE tenant_id = $1 AND record_id = $2 AND action LIKE 'user_mfa_%'
      ORDER BY chain_seq`,
    [ORG, String(m.id)],
  );
  return rows.map((r) => `${r.action}|${r.outcome}|${r.reason}`);
}

async function signIn(m: Member, code: string) {
  const login = await request(app).post('/api/auth/login').send({ email: m.email, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  expect(login.body.mfaRequired).toBe(true);
  return request(app).post('/api/auth/mfa/verify').send({ challengeId: login.body.challengeId, code, method: 'totp' });
}

const signWith = (m: Member, code: string) =>
  inScope('sign', async () => {
    const { reverifySigner } = await import('../../server/services/part11/reverify-signer');
    const { signerReverificationDeps } = await import('../../server/services/part11/reverify-signer-deps');
    return reverifySigner(m.id, { password: PASSWORD, mfaToken: code }, signerReverificationDeps());
  });

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    // audit_logs is append-only on the deploy path; this is its documented door.
    await client.query("SET LOCAL app.audit_archive_bypass = 'on'");
    await client.query('DELETE FROM audit_logs WHERE tenant_id = $1', [ORG]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const orgs = (
    await owner.query(`SELECT id, uuid::text AS uuid FROM organizations WHERE id = $1 OR slug LIKE $2`, [
      ORG,
      `${TAG}-%`,
    ])
  ).rows as Array<{ id: number; uuid: string }>;
  await owner.query('DELETE FROM organization_users WHERE organization_id = ANY($1::int[])', [orgs.map((o) => o.id)]);
  await owner.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}-%@example.invalid`]);
  await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [orgs.map((o) => o.id)]);
  if (orgs.length > 0) {
    // trg_sync_org_to_identity mirrors every organizations INSERT.
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [
        orgs.map((o) => o.uuid),
      ])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

async function addMember(key: string, enrolTotp: boolean): Promise<Member> {
  const email = `${TAG}-${key}-${RUN}@example.invalid`;
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, `Lane Binding ${key}`, await bcrypt.hash(PASSWORD, 4), ORG],
  );
  const id = user.rows[0].id as number;
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [ORG, id]);
  let secret = '';
  if (enrolTotp) {
    // Through the functions the enrolment routes call, in the member's scope.
    // Enabling presents step 0's code, which is thereby used.
    await inScope(`enrol-${key}`, async () => {
      secret = (await mfa.generateSecret(id, email)).secret;
      const enabled = await mfa.enableMfa(id, codeFor(secret, 0));
      if (!enabled.success) throw new Error(`[dbsfb] TOTP enrolment of ${key} was refused`);
    });
  }
  return { id, email, secret };
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();

  let provisioned: { skipped: boolean } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      provisioned = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  if (provisioned!.skipped) throw new Error('[dbsfb] provisionAppServiceRole skipped — no runtime role.');

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbsfb-mfa-encryption-key-at-least-32-chars';
  for (const key of EXTERNAL_KEYS) delete process.env[key];

  runtime = await import('../../server/db/runtime');
  mfa = await import('../../server/services/mfaService');

  const { registerPlatformRoutes } = await import('../../server/bootstrap/register-platform-routes');
  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.use(express.json());
  await registerPlatformRoutes({
    app,
    pool: runtime.getPool(),
    // Production's global /api gate (server/startup/routes.ts), except that
    // /api/auth must never reach it: the auth routes run pre-auth.
    authMiddleware: (req, res, next) => {
      if (/^\/api\/(v1\/)?auth(\/|$)/.test(req.originalUrl)) {
        res.status(401).json({ error: 'dbsfb: the global gate was reached; /api/auth must not reach it' });
        return;
      }
      return authMiddleware(req, res, next);
    },
  });

  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
     VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [ORG, `${TAG}-${ORG}-${RUN}`],
  );

  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  members.owner = await addMember('owner', true);
  members.rotating = await addMember('rotating', true);
  members.fresh = await addMember('fresh', false);
  members.pending = await addMember('pending', false);
}, 180_000);

afterAll(async () => {
  vi.useRealTimers();
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbsfb] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbsfb] runtime role left behind:', (err as Error).message);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

describe('the posture is the one production runs in', () => {
  it('connects as a non-superuser runtime role with RLS enforcing', async () => {
    const { rows } = await inScope('posture', () =>
      runtime.getPool().query(
        `SELECT current_user AS role, r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce', true) AS rls
           FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    expect(rows[0]).toMatchObject({ role: runtimeRole, rolsuper: false, rolbypassrls: false, rls: 'on' });
  });
});

describe('a signed-in session cannot take over an enrolled second factor (POST /api/auth/mfa/setup)', () => {
  it('is refused, hands out no secret, and leaves the stored one as it was', async () => {
    at(1);
    const m = members.owner;
    const before = await stored(m);
    const res = await request(app).post('/api/auth/mfa/setup').set(await session(m)).send({});
    const issued: unknown = res.body?.secret;
    // What a session holder could do with what it was handed, had it been handed one.
    const takeover = typeof issued === 'string' ? await signIn(m, codeFor(issued, 1)) : null;

    expect({
      status: res.status,
      secretHandedOut: typeof issued === 'string',
      storedSecretChanged: (await stored(m)).secret !== before.secret,
      signInWithHandedOutSecret: takeover?.status ?? null,
    }).toEqual({ status: 409, secretHandedOut: false, storedSecretChanged: false, signInWithHandedOutSecret: null });
    expect(res.body.error?.code).toBe('MFA_ALREADY_ENABLED');
    expect((await stored(m)).enabled).toBe(true);
  });

  it("leaves the owner's own authenticator signing them in", async () => {
    at(2);
    const m = members.owner;
    const res = await signIn(m, codeFor(m.secret, 2));
    expect(res.status, "the owner's authenticator no longer verified").toBe(200);
  });

  it("leaves the owner's own authenticator signing for them", async () => {
    at(3);
    const m = members.owner;
    expect(await signWith(m, codeFor(m.secret, 3))).toMatchObject({ ok: true, authenticationMethod: 'password+mfa' });
  });

  it('records the refused attempt against the account', async () => {
    expect(await recorded(members.owner)).toContain('user_mfa_setup|failure|already_enrolled');
  });
});

describe('enrolment and rotation, by the owner', () => {
  it('a member without two-step verification can enrol, and the enrolment is recorded', async () => {
    at(1);
    const m = members.fresh;
    const auth = await session(m);
    const setup = await request(app).post('/api/auth/mfa/setup').set(auth).send({});
    expect(setup.status, JSON.stringify(setup.body)).toBe(200);
    expect(typeof setup.body.secret).toBe('string');
    const enable = await request(app).post('/api/auth/mfa/enable').set(auth).send({ code: codeFor(setup.body.secret, 1) });
    expect(enable.status, JSON.stringify(enable.body)).toBe(200);
    expect((await stored(m)).enabled).toBe(true);
    expect(await recorded(m)).toEqual(['user_mfa_setup|success|secret_issued', 'user_mfa_enable|success|']);
  });

  it('once enrolled, that member is refused a new secret too', async () => {
    at(2);
    const res = await request(app).post('/api/auth/mfa/setup').set(await session(members.fresh)).send({});
    expect(res.status).toBe(409);
  });

  it('an enrolment not yet confirmed can be restarted: nothing is switched on until a code confirms it', async () => {
    at(1);
    const m = members.pending;
    const auth = await session(m);
    const first = await request(app).post('/api/auth/mfa/setup').set(auth).send({});
    const second = await request(app).post('/api/auth/mfa/setup').set(auth).send({});
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.secret).not.toBe(first.body.secret);
    expect((await stored(m)).enabled).not.toBe(true);
  });

  it('the owner rotates by turning it off with a current code, then enrolling again', async () => {
    at(1);
    const m = members.rotating;
    const auth = await session(m);
    const wrong = await request(app).post('/api/auth/mfa/disable').set(auth).send({ code: '000000' });
    expect(wrong.status).toBe(401);
    const off = await request(app).post('/api/auth/mfa/disable').set(auth).send({ code: codeFor(m.secret, 1) });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const setup = await request(app).post('/api/auth/mfa/setup').set(auth).send({});
    expect(setup.status, JSON.stringify(setup.body)).toBe(200);
    expect(await recorded(m)).toEqual([
      'user_mfa_disable|failure|invalid_code',
      'user_mfa_disable|success|',
      'user_mfa_setup|success|secret_issued',
    ]);
  });
});
