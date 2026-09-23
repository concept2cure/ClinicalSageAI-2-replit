/**
 * D6 / VSR-001 §13.3 item 4: what a session says about the account is what the
 * account is.
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * GET /api/auth/session — the call the browser makes to learn who is signed
 * in, also mounted at /api/v1/auth/session — answered `mfaEnabled: false,
 * mfaMethods: []` and `mustChangePassword: false` for every account, whatever
 * the account was. A user who had just signed in WITH an authenticator was told
 * they had none. /mfa/verify answered `mfaEnabled: true` for every account, and
 * named as the method whatever the request had sent. /api/users/me read
 * mfa_enabled but always answered `mfaMethods: []`.
 *
 * The fix derives all of them from one reading of the account
 * (server/services/mfa-enrolment.ts), the same one the sign-in challenge uses.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As sign-in-audit-trail.dbtest.ts: production's registerPlatformRoutes and
 * global gate, a freshly minted NOSUPERUSER NOBYPASSRLS runtime role,
 * RLS_ENFORCE=on, dev-login closed. Only `Date` is faked, so TOTP steps are
 * chosen rather than read off the wall clock.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtsp": organisation 91950 (range 91950–91999); every email starts
 * `dbtsp-`. Audit rows are removed through the documented archive door.
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

const ORG = 91950;
const TAG = 'dbtsp';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtsp-sign-in-posture-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtsp_rt_${RUN}` });
const PASSWORD = 'Dbtsp-Sign-In-Posture-2026!';
const EXTERNAL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

const T0 = Math.floor(Date.now() / 30_000) * 30_000 + 5_000;
const at = (n: number) => vi.setSystemTime(T0 + n * 30_000);

interface Member {
  id: number;
  email: string;
  secret: string;
}
const code = (m: Member, n: number) => totp(m.secret, T0 + n * 30_000);

let owner: Pool;
let runtime: Runtime;
let mfa: Mfa;
let app: express.Express;
const members: Record<'totp' | 'email' | 'disabled' | 'guarded', Member> = {} as never;

const inScope = <T>(caller: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: `dbtsp:${caller}` }, fn);

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
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
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [
        orgs.map((o) => o.uuid),
      ])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

async function addMember(key: string, factor: 'totp' | 'email' | 'disabled' | 'guarded'): Promise<Member> {
  const email = `${TAG}-${key}-${RUN}@example.invalid`;
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, `Lane Posture ${key}`, await bcrypt.hash(PASSWORD, 4), ORG],
  );
  const id = user.rows[0].id as number;
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [ORG, id]);
  let secret = '';
  if (factor !== 'email') {
    // Through the functions /api/auth/mfa/setup, /enable and /disable call.
    await inScope(`enrol-${key}`, async () => {
      secret = (await mfa.generateSecret(id, email)).secret;
      if (!(await mfa.enableMfa(id, totp(secret, T0))).success) throw new Error(`[dbtsp] enrolment of ${key} refused`);
      if (factor === 'disabled' && !(await mfa.disableMfa(id, totp(secret, T0 + 30_000)))) {
        throw new Error(`[dbtsp] disabling ${key} refused`);
      }
    });
  }
  return { id, email, secret };
}

/** Sign in the way the browser does: password, then the factor it is asked for. */
async function signIn(m: Member, factorCode: () => Promise<string>, method: 'totp' | 'email') {
  const login = await request(app).post('/api/auth/login').send({ email: m.email, password: PASSWORD });
  expect(login.status, JSON.stringify(login.body)).toBe(200);
  const verify = await request(app)
    .post('/api/auth/mfa/verify')
    .send({ challengeId: login.body.challengeId, code: await factorCode(), method });
  expect(verify.status, JSON.stringify(verify.body)).toBe(200);
  return { login: login.body, verify: verify.body, bearer: { Authorization: `Bearer ${verify.body.accessToken}` } };
}

/** The emailed code, as the inbox would receive it: re-issued for the pending challenge. */
const emailedCode = (m: Member) => () =>
  inScope('email-code', async () => (await import('../../server/services/emailOtpService')).createEmailOtp(m.id));

/** The account-state fields a payload's `user` carries. */
const stateOf = (u: Record<string, unknown>) => ({
  mfaEnabled: u.mfaEnabled,
  mfaMethods: u.mfaMethods,
  mustChangePassword: u.mustChangePassword,
});

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
  if (provisioned!.skipped) throw new Error('[dbtsp] provisionAppServiceRole skipped — no runtime role.');

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbtsp-mfa-encryption-key-at-least-32-chars';
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
    authMiddleware: (req, res, next) => {
      if (/^\/api\/(v1\/)?auth(\/|$)/.test(req.originalUrl)) {
        res.status(401).json({ error: 'dbtsp: the global gate was reached; /api/auth must not reach it' });
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
  members.totp = await addMember('totp', 'totp');
  members.email = await addMember('email', 'email');
  members.disabled = await addMember('disabled', 'disabled');
  members.guarded = await addMember('guarded', 'guarded');
}, 180_000);

afterAll(async () => {
  vi.useRealTimers();
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbtsp] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbtsp] runtime role left behind:', (err as Error).message);
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

  it('the three accounts are what their names say', async () => {
    const { rows } = await owner.query(
      'SELECT email, mfa_enabled, mfa_method FROM users WHERE email LIKE $1 ORDER BY id',
      [`${TAG}-%@example.invalid`],
    );
    expect(rows.map((r) => [r.email.split('-')[1], r.mfa_enabled === true, r.mfa_method])).toEqual([
      ['totp', true, 'totp'],
      ['email', false, expect.anything()],
      // disableMfa leaves mfa_method 'totp': why it is not read on its own.
      ['disabled', false, 'totp'],
      ['guarded', true, 'totp'],
    ]);
  });
});

describe('an account with an authenticator is told it has one (VSR-001 §13.3 item 4)', () => {
  const TOTP = { mfaEnabled: true, mfaMethods: [{ type: 'totp', isEnabled: true, isPrimary: true }], mustChangePassword: false };
  let bearer: { Authorization: string };

  it('the challenge, the verified sign-in, the session and /api/users/me all say so', async () => {
    at(0);
    const m = members.totp;
    const s = await signIn(m, async () => code(m, 1), 'totp');
    bearer = s.bearer;
    expect(s.login.mfaMethods).toEqual(TOTP.mfaMethods);
    expect(stateOf(s.verify.user)).toEqual(TOTP);

    const session = await request(app).get('/api/auth/session').set(bearer);
    expect(session.status, JSON.stringify(session.body)).toBe(200);
    expect(stateOf(session.body.user), 'the session denies the authenticator the user just signed in with').toEqual(TOTP);

    const v1 = await request(app).get('/api/v1/auth/session').set(bearer);
    expect(stateOf(v1.body.user)).toEqual(TOTP);

    const me = await request(app).get('/api/users/me').set(bearer);
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(stateOf(me.body)).toEqual(TOTP);
  });
});

describe('an account without one is told it signs in with an emailed code', () => {
  const EMAIL = { mfaEnabled: false, mfaMethods: [{ type: 'email', isEnabled: true, isPrimary: true }], mustChangePassword: false };

  it.each(['email', 'disabled'] as const)('%s: the verified sign-in, the session and /api/users/me agree', async (key) => {
    at(1);
    const m = members[key];
    const s = await signIn(m, emailedCode(m), 'email');
    expect(s.login.mfaMethods).toEqual(EMAIL.mfaMethods);
    expect(stateOf(s.verify.user), '/mfa/verify reported an authenticator the account does not have').toEqual(EMAIL);
    expect(stateOf((await request(app).get('/api/auth/session').set(s.bearer)).body.user)).toEqual(EMAIL);
    expect(stateOf((await request(app).get('/api/users/me').set(s.bearer)).body)).toEqual(EMAIL);
  });

  it('a password change the account owes is reported, not overwritten with false', async () => {
    at(1);
    const m = members.email;
    await owner.query('UPDATE users SET must_change_password = true WHERE id = $1', [m.id]);
    try {
      const s = await signIn(m, emailedCode(m), 'email');
      expect(s.verify.user.mustChangePassword).toBe(true);
      expect((await request(app).get('/api/auth/session').set(s.bearer)).body.user.mustChangePassword).toBe(true);
    } finally {
      await owner.query('UPDATE users SET must_change_password = false WHERE id = $1', [m.id]);
    }
  });
});

describe('before any credential, every address gets the same answer', () => {
  it('enterprise check-email does not tell an enrolled account from an unknown address', async () => {
    const ask = async (email: string) => {
      const res = await request(app).post('/api/auth/enterprise/check-email').send({ email });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const { email: _echoed, ...rest } = res.body;
      return rest;
    };
    const unknown = await ask(`${TAG}-nobody-${RUN}@example.invalid`);
    expect(await ask(members.email.email)).toEqual(unknown);
    expect(await ask(members.totp.email), 'check-email singled out the account with an authenticator').toEqual(unknown);
    // And what it says is true of every sign-in: a second factor follows the password.
    expect(unknown).toEqual({ authFlow: 'password', mfaRequired: true });
  });
});

describe('the enterprise router refuses setup over an enrolled authenticator, and says so (F-26)', () => {
  // mfaService.generateSecret refuses while a factor is enrolled (F-26,
  // 0c912e67e; the password router's route and rotation are pinned by
  // tests/db/second-factor-binding.dbtest.ts). The enterprise router's
  // /mfa/setup reaches the same guard, and answered its refusal with a 500.
  let bearer: { Authorization: string };

  beforeAll(async () => {
    const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
    const jwt = (await import('jsonwebtoken')).default;
    const g = members.guarded;
    bearer = {
      Authorization: `Bearer ${jwt.sign(
        { userId: String(g.id), email: g.email, organizationId: String(ORG), role: 'admin', type: 'access' },
        activeJwtSecret(),
        { algorithm: 'HS256', expiresIn: '1h' },
      )}`,
    };
  });

  it('409 MFA_ALREADY_ENABLED, no secret handed out, the enrolled secret untouched', async () => {
    at(1);
    const stored = async () =>
      (await owner.query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [members.guarded.id])).rows[0];
    const before = await stored();
    const res = await request(app).post('/api/auth/enterprise/mfa/setup').set(bearer).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('MFA_ALREADY_ENABLED');
    expect(JSON.stringify(res.body)).not.toMatch(/otpauth|"secret"/);
    expect(await stored()).toEqual(before);
  });
});
