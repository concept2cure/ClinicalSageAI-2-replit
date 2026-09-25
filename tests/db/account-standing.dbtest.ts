/**
 * An account that is not active cannot sign, cannot sign in, and a session it
 * already holds ends (VSR-001 F-28, F-29).
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * `users.status` is how an account is taken out of use. An administrator
 * suspends it (server/routes/admin/master-admin.ts, PATCH /users/:id/status →
 * 'suspended'); the identity provider deprovisions it (server/routes/scim.ts,
 * DELETE or active=false → 'inactive', "the user record is retained; access is
 * revoked"). Neither statement did anything else, and nothing read the column
 * at the moments that matter:
 *
 *   · the signing ceremony (services/part11/reverify-signer.ts) checked the
 *     lockout, the password and the code, so a suspended account signed on
 *     every surface. The one exception was the submission release, whose own
 *     password check refused an account that was not active; moving that route
 *     onto the ceremony would have deleted the only place the column was read
 *     at signing (F-28);
 *   · sign-in compared the password and issued the challenge, and the second
 *     factor then issued the session, for an account in any state;
 *   · the global /api gate verified the token, the revocation list and the
 *     membership row, so a session issued before the suspension kept working
 *     for its whole life, and its refresh token minted new ones (F-29).
 *
 * §11.10(d) limits system access to authorized individuals; §11.300(b) requires
 * that identification codes and passwords can be recalled. Suspension and
 * deprovisioning are the recall, and they recalled nothing.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As signing-lockout.dbtest.ts: production's registerPlatformRoutes and global
 * gate, a freshly minted NOSUPERUSER NOBYPASSRLS runtime role through
 * APP_DATABASE_URL, RLS_ENFORCE=on, dev-login closed. Signing is reverifySigner
 * with the production wiring (signerReverificationDeps), which every signing
 * route uses. An account is taken out of use by the statement the admin route
 * and the SCIM route each run. Only Date is faked.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbsas": organisation 92100 (range 92100–92149); every email starts
 * `dbsas-`. Audit rows are removed through the documented archive door.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
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

const ORG = 92100;
const TAG = 'dbsas';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbsas-account-standing-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbsas_rt_${RUN}` });
const PASSWORD = 'Dbsas-Account-Standing-2026!';
const EXTERNAL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

// 5 s into a step, so "the step the clock is in" is never at an edge.
const T0 = Math.floor(Date.now() / 30_000) * 30_000 + 5_000;
/** Move the (faked) clock to `n` steps after T0. Each code is accepted once. */
const at = (n: number) => vi.setSystemTime(T0 + n * 30_000);

interface Member {
  id: number;
  email: string;
  secret: string;
}
const codeFor = (m: Member, n: number) => totp(m.secret, T0 + n * 30_000);

let owner: Pool;
let runtime: Runtime;
let mfa: Mfa;
let app: express.Express;
const members: Record<'active' | 'suspended' | 'deprovisioned' | 'held', Member> = {} as never;

const inScope = <T>(caller: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: `dbsas:${caller}` }, fn);

/** A signing re-verification, as every signing route runs it. */
const sign = (m: Member, credentials: { password: string; mfaToken?: string }) =>
  inScope('sign', async () => {
    const { reverifySigner } = await import('../../server/services/part11/reverify-signer');
    const { signerReverificationDeps } = await import('../../server/services/part11/reverify-signer-deps');
    return reverifySigner(m.id, credentials, signerReverificationDeps());
  });

/** The statement server/routes/admin/master-admin.ts runs to suspend an account. */
const suspend = (m: Member) =>
  owner.query(`UPDATE users SET status = 'suspended', updated_at = now() WHERE id = $1`, [m.id]);
/** The statement server/routes/scim.ts runs when the identity provider deprovisions it. */
const deprovision = (m: Member) =>
  owner.query(`UPDATE users SET status = 'inactive', updated_at = now() WHERE id = $1`, [m.id]);

const failedAttempts = async (m: Member) =>
  Number((await owner.query('SELECT failed_login_attempts FROM users WHERE id = $1', [m.id])).rows[0].failed_login_attempts ?? 0);

/** A response body for an assertion message, every token in it redacted: evidence carries none. */
const shown = (body: unknown) => JSON.stringify(body).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>');

/** The sign-in refusals the audit trail holds for the member, by reason, oldest first. */
const refusalsRecorded = async (m: Member) =>
  (
    await owner.query(
      `SELECT new_values->>'reason' AS reason FROM audit_logs
        WHERE tenant_id = $1 AND action = 'user_login' AND record_id = $2
          AND new_values->>'outcome' = 'failure'
        ORDER BY chain_seq`,
      [ORG, String(m.id)],
    )
  ).rows.map((r) => r.reason as string);

const passwordStep = (m: Member) => request(app).post('/api/auth/login').send({ email: m.email, password: PASSWORD });

/** Sign in the way the browser does: the password, then the authenticator's code for step `n`. */
async function signIn(m: Member, n: number) {
  const login = await passwordStep(m);
  expect(login.status, shown(login.body)).toBe(200);
  const verify = await request(app)
    .post('/api/auth/mfa/verify')
    .send({ challengeId: login.body.challengeId, code: codeFor(m, n), method: 'totp' });
  expect(verify.status, shown(verify.body)).toBe(200);
  return {
    bearer: { Authorization: `Bearer ${verify.body.accessToken}` },
    refreshToken: verify.body.refreshToken as string,
  };
}

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    // audit_logs is append-only on the deploy path. A suite tears its own rows down as the
    // table owner with the DELETE trigger disabled for this transaction only: the archive door
    // (audit_logs_archive_delete(), P0-8a) refuses rows inside the 24-month hot window.
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('DELETE FROM audit_logs WHERE tenant_id = $1', [ORG]);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
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

async function addMember(key: string): Promise<Member> {
  const email = `${TAG}-${key}-${RUN}@example.invalid`;
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, `Lane Standing ${key}`, await bcrypt.hash(PASSWORD, 4), ORG],
  );
  const id = user.rows[0].id as number;
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [ORG, id]);
  let secret = '';
  // Through the functions the enrolment routes call, in the member's scope.
  await inScope(`enrol-${key}`, async () => {
    secret = (await mfa.generateSecret(id, email)).secret;
    const enabled = await mfa.enableMfa(id, totp(secret, T0));
    if (!enabled.success) throw new Error(`[dbsas] TOTP enrolment of ${key} was refused`);
  });
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
  if (provisioned!.skipped) throw new Error('[dbsas] provisionAppServiceRole skipped — no runtime role.');

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbsas-mfa-encryption-key-at-least-32-chars';
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
    // /api/auth must never reach it: the sign-in routes run pre-auth.
    authMiddleware: (req, res, next) => {
      if (/^\/api\/(v1\/)?auth(\/|$)/.test(req.originalUrl)) {
        res.status(401).json({ error: 'dbsas: the global gate was reached; /api/auth must not reach it' });
        return;
      }
      return authMiddleware(req, res, next);
    },
  });
  // Any route behind the gate: it answers who the gate let through.
  const whoami = (req: express.Request, res: express.Response) =>
    res.json({ userId: (req as { user?: { id?: number } }).user?.id ?? null });
  app.get('/api/dbsas/whoami', whoami);
  // The per-router gate (authenticateToken), which routers mount themselves.
  // Outside /api, so the global gate above cannot answer for it.
  const { authenticateToken } = await import('../../server/middleware/auth');
  app.get('/dbsas/router-gate', authenticateToken, whoami);

  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
     VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [ORG, `${TAG}-${ORG}-${RUN}`],
  );

  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  members.active = await addMember('active');
  members.suspended = await addMember('suspended');
  members.deprovisioned = await addMember('deprovisioned');
  members.held = await addMember('held');
  await suspend(members.suspended);
  await deprovision(members.deprovisioned);
}, 180_000);

afterAll(async () => {
  vi.useRealTimers();
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbsas] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbsas] runtime role left behind:', (err as Error).message);
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

  it('the accounts are in the states the admin route and SCIM leave them in', async () => {
    const { rows } = await owner.query(`SELECT email, status FROM users WHERE email LIKE $1 ORDER BY id`, [`${TAG}-%`]);
    expect(rows.map((r) => [String(r.email).split('-')[1], r.status])).toEqual([
      ['active', 'active'],
      ['suspended', 'suspended'],
      ['deprovisioned', 'inactive'],
      ['held', 'active'],
    ]);
  });
});

describe('signing (F-28)', () => {
  it('an active account signs', async () => {
    at(1);
    const m = members.active;
    expect(await sign(m, { password: PASSWORD, mfaToken: codeFor(m, 1) })).toMatchObject({
      ok: true,
      authenticationMethod: 'password+mfa',
    });
  });

  it('a suspended account cannot sign, with the right password and code', async () => {
    at(1);
    const m = members.suspended;
    const r = await sign(m, { password: PASSWORD, mfaToken: codeFor(m, 1) });
    expect(r, 'a suspended account signed').toMatchObject({ ok: false, status: 401, code: 'ACCOUNT_INACTIVE' });
  });

  it('a guess against a suspended account is neither compared nor counted', async () => {
    at(2);
    const m = members.suspended;
    expect(await sign(m, { password: 'not-the-password' })).toMatchObject({ ok: false, code: 'ACCOUNT_INACTIVE' });
    expect(await failedAttempts(m), 'a suspended account was an oracle for its password').toBe(0);
  });

  it('a deprovisioned account cannot sign', async () => {
    at(1);
    const m = members.deprovisioned;
    const r = await sign(m, { password: PASSWORD, mfaToken: codeFor(m, 1) });
    expect(r, 'an account the identity provider deprovisioned signed').toMatchObject({
      ok: false,
      status: 401,
      code: 'ACCOUNT_INACTIVE',
    });
  });
});

describe('sign-in (F-29)', () => {
  it('an active account signs in', async () => {
    at(3);
    const s = await signIn(members.active, 3);
    const me = await request(app).get('/api/dbsas/whoami').set(s.bearer);
    expect(me.status, shown(me.body)).toBe(200);
    expect(me.body.userId).toBe(members.active.id);
  });

  it('a suspended account is refused at the password, and no challenge is issued', async () => {
    at(3);
    const res = await passwordStep(members.suspended);
    expect(res.status, `a suspended account was issued a sign-in challenge: ${shown(res.body)}`).toBe(403);
    expect(res.body.error?.code).toBe('AUTH_ACCOUNT_INACTIVE');
    expect(res.body.challengeId).toBeUndefined();
    expect(await refusalsRecorded(members.suspended), 'the refusal is not in the audit trail').toEqual(['account_inactive']);
  });

  it('a deprovisioned account is refused at the password, and no challenge is issued', async () => {
    at(3);
    const res = await passwordStep(members.deprovisioned);
    expect(res.status, `a deprovisioned account was issued a sign-in challenge: ${shown(res.body)}`).toBe(403);
    expect(res.body.error?.code).toBe('AUTH_ACCOUNT_INACTIVE');
    expect(res.body.challengeId).toBeUndefined();
  });

  it('a challenge issued before the suspension does not become a session after it', async () => {
    at(4);
    const m = members.held;
    const login = await passwordStep(m);
    expect(login.status, shown(login.body)).toBe(200);
    await suspend(m);
    try {
      const verify = await request(app)
        .post('/api/auth/mfa/verify')
        .send({ challengeId: login.body.challengeId, code: codeFor(m, 4), method: 'totp' });
      expect(verify.status, `the second factor issued a session to a suspended account: ${shown(verify.body)}`).toBe(403);
      expect(verify.body.accessToken).toBeUndefined();
    } finally {
      await owner.query(`UPDATE users SET status = 'active' WHERE id = $1`, [m.id]);
    }
  });
});

describe('a session the account already holds (F-29)', () => {
  it('ends at the gate once the account is suspended, and says why', async () => {
    at(5);
    const m = members.held;
    const s = await signIn(m, 5);
    expect((await request(app).get('/api/dbsas/whoami').set(s.bearer)).status).toBe(200);
    expect((await request(app).get('/dbsas/router-gate').set(s.bearer)).status).toBe(200);

    await suspend(m);
    try {
      const after = await request(app).get('/api/dbsas/whoami').set(s.bearer);
      expect(after.status, `a suspended account's session still opened the API: ${shown(after.body)}`).toBe(401);
      expect(after.body.code).toBe('ACCOUNT_INACTIVE');

      const routed = await request(app).get('/dbsas/router-gate').set(s.bearer);
      expect(routed.status, `a suspended account's session still passed a router's own gate: ${shown(routed.body)}`).toBe(401);
      expect(routed.body.error?.code).toBe('ACCOUNT_INACTIVE');

      const probe = await request(app).get('/api/auth/session').set(s.bearer);
      expect(probe.status, `the session probe still reported a suspended account signed in: ${shown(probe.body)}`).toBe(401);

      const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
      expect(refreshed.status, `a suspended account's refresh token minted a session: ${shown(refreshed.body)}`).toBe(403);
      expect(refreshed.body.accessToken).toBeUndefined();
    } finally {
      await owner.query(`UPDATE users SET status = 'active' WHERE id = $1`, [m.id]);
    }
  });

  it('ends once the identity provider deprovisions the account', async () => {
    at(6);
    const m = members.held;
    const s = await signIn(m, 6);
    await deprovision(m);
    try {
      const after = await request(app).get('/api/dbsas/whoami').set(s.bearer);
      expect(after.status, `a deprovisioned account's session still opened the API: ${shown(after.body)}`).toBe(401);
      expect(after.body.code).toBe('ACCOUNT_INACTIVE');
    } finally {
      await owner.query(`UPDATE users SET status = 'active' WHERE id = $1`, [m.id]);
    }
  });

  it('works again when the account is reactivated', async () => {
    at(7);
    const s = await signIn(members.held, 7);
    const me = await request(app).get('/api/dbsas/whoami').set(s.bearer);
    expect(me.status, shown(me.body)).toBe(200);
  });
});
