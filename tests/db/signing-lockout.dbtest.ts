/**
 * A wrong password or code at signing counts against the account, as it does
 * at sign-in (VSR-001 F-27).
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * Sign-in locks an account for 30 minutes after five wrong passwords
 * (auth-security-service: isAccountLocked / recordFailedLogin). Every signing
 * path re-verifies the signer through reverifySigner, which neither consulted
 * nor fed that count. So a signing endpoint was an unmetered oracle for the
 * account's password, and then for its second factor, to whoever held a
 * session: guesses there never locked anything, and a locked account could
 * still sign. The Authoring PIN it is to replace locked after three.
 * §11.300(d) requires safeguards against unauthorized use of passwords and
 * identification codes, and their detection.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As one-time-credentials.dbtest.ts: production's registerPlatformRoutes, a
 * freshly minted NOSUPERUSER NOBYPASSRLS runtime role through APP_DATABASE_URL,
 * RLS_ENFORCE=on, dev-login closed. Signing is reverifySigner with the
 * production wiring (signerReverificationDeps), which every signing route
 * uses. Only Date is faked.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbslk": organisation 92000 (range 92000–92049); every email starts
 * `dbslk-`. Audit rows are removed through the documented archive door.
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

const ORG = 92000;
const TAG = 'dbslk';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbslk-signing-lockout-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbslk_rt_${RUN}` });
const PASSWORD = 'Dbslk-Signing-Lockout-2026!';
const EXTERNAL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
/** auth-security-service's LOCKOUT_THRESHOLD: the sign-in's allowance. */
const THRESHOLD = 5;

// 5 s into a step, so "the step the clock is in" is never at an edge.
const T0 = Math.floor(Date.now() / 30_000) * 30_000 + 5_000;
/** Move the (faked) clock to `n` steps after T0. */
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
const members: Record<'password' | 'code' | 'below' | 'precheck' | 'precheckCode', Member> = {} as never;

const inScope = <T>(caller: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: `dbslk:${caller}` }, fn);

/** A signing re-verification, as every signing route runs it. */
const sign = (m: Member, credentials: { password: string; mfaToken?: string }) =>
  inScope('sign', async () => {
    const { reverifySigner } = await import('../../server/services/part11/reverify-signer');
    const { signerReverificationDeps } = await import('../../server/services/part11/reverify-signer-deps');
    return reverifySigner(m.id, credentials, signerReverificationDeps());
  });

async function account(m: Member): Promise<{ failed: number; locked: boolean }> {
  const { rows } = await owner.query('SELECT failed_login_attempts, locked_until FROM users WHERE id = $1', [m.id]);
  const until = rows[0].locked_until as Date | null;
  return { failed: Number(rows[0].failed_login_attempts ?? 0), locked: until !== null && until.getTime() > Date.now() };
}

const signIn = (m: Member) => request(app).post('/api/auth/login').send({ email: m.email, password: PASSWORD });

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

async function addMember(key: string, enrolTotp: boolean): Promise<Member> {
  const email = `${TAG}-${key}-${RUN}@example.invalid`;
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, `Lane Lockout ${key}`, await bcrypt.hash(PASSWORD, 4), ORG],
  );
  const id = user.rows[0].id as number;
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [ORG, id]);
  let secret = '';
  if (enrolTotp) {
    // Through the functions the enrolment routes call, in the member's scope.
    await inScope(`enrol-${key}`, async () => {
      secret = (await mfa.generateSecret(id, email)).secret;
      const enabled = await mfa.enableMfa(id, totp(secret, T0));
      if (!enabled.success) throw new Error(`[dbslk] TOTP enrolment of ${key} was refused`);
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
  if (provisioned!.skipped) throw new Error('[dbslk] provisionAppServiceRole skipped — no runtime role.');

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbslk-mfa-encryption-key-at-least-32-chars';
  for (const key of EXTERNAL_KEYS) delete process.env[key];

  runtime = await import('../../server/db/runtime');
  mfa = await import('../../server/services/mfaService');

  const { registerPlatformRoutes } = await import('../../server/bootstrap/register-platform-routes');
  const { authMiddleware } = await import('../../server/auth');
  const { default: esignatureRouter } = await import('../../server/routes/esignature');
  app = express();
  app.use(express.json());
  await registerPlatformRoutes({
    app,
    pool: runtime.getPool(),
    // Production's global /api gate (server/startup/routes.ts), except that
    // /api/auth must never reach it: the sign-in routes run pre-auth.
    authMiddleware: (req, res, next) => {
      if (/^\/api\/(v1\/)?auth(\/|$)/.test(req.originalUrl)) {
        res.status(401).json({ error: 'dbslk: the global gate was reached; /api/auth must not reach it' });
        return;
      }
      return authMiddleware(req, res, next);
    },
  });
  // Behind that gate, as register-inline-routes mounts it: the signing dialog's checks.
  app.use('/api/esignature', esignatureRouter);

  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
     VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [ORG, `${TAG}-${ORG}-${RUN}`],
  );

  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  members.password = await addMember('password', false);
  members.code = await addMember('code', true);
  members.below = await addMember('below', false);
  members.precheck = await addMember('precheck', false);
  members.precheckCode = await addMember('precheck-code', true);
}, 180_000);

afterAll(async () => {
  vi.useRealTimers();
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbslk] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbslk] runtime role left behind:', (err as Error).message);
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

describe('wrong passwords at signing', () => {
  it('count against the account, and the fifth locks it', async () => {
    at(1);
    const m = members.password;
    for (let i = 1; i <= THRESHOLD; i++) {
      expect(await sign(m, { password: `wrong-${i}` })).toMatchObject({ ok: false, code: 'PASSWORD_VERIFICATION_FAILED' });
    }
    expect(await account(m), 'five wrong passwords at signing left the account unlocked').toEqual({ failed: THRESHOLD, locked: true });
  });

  it('lock the sign-in too: the account has one password and one allowance', async () => {
    at(1);
    const res = await signIn(members.password);
    expect(res.status, 'sign-in accepted the password of an account locked at signing').toBe(423);
  });

  it('while locked, refuse a signature even with the right password, without comparing it', async () => {
    at(1);
    const m = members.password;
    expect(await sign(m, { password: PASSWORD })).toMatchObject({ ok: false, status: 423, code: 'ACCOUNT_LOCKED' });
    expect((await account(m)).failed, 'a guess against a locked account was compared and counted').toBe(THRESHOLD);
  });

  it('unlock when the lockout has run out', async () => {
    vi.setSystemTime(T0 + 31 * 60_000);
    expect(await sign(members.password, { password: PASSWORD })).toMatchObject({ ok: true, authenticationMethod: 'password' });
  });
});

describe('wrong codes at signing', () => {
  it('count against the account once the password is right, and the fifth locks it', async () => {
    at(1);
    const m = members.code;
    for (let i = 1; i <= THRESHOLD; i++) {
      // A code is six digits; 000000 is not this member's for any step near now.
      expect(await sign(m, { password: PASSWORD, mfaToken: '000000' })).toMatchObject({ ok: false, code: 'MFA_VERIFICATION_FAILED' });
    }
    expect(await account(m), 'five wrong codes at signing left the account unlocked').toEqual({ failed: THRESHOLD, locked: true });
    expect(await sign(m, { password: PASSWORD, mfaToken: codeFor(m, 1) })).toMatchObject({ ok: false, code: 'ACCOUNT_LOCKED' });
  });
});

describe('below the allowance', () => {
  it('a signer who mistypes and then gets it right signs', async () => {
    at(1);
    const m = members.below;
    for (let i = 1; i < THRESHOLD; i++) {
      expect(await sign(m, { password: `wrong-${i}` })).toMatchObject({ ok: false });
    }
    expect(await sign(m, { password: PASSWORD })).toMatchObject({ ok: true });
    expect((await account(m)).locked).toBe(false);
  });

  it('a successful sign-in clears the count, as it always has', async () => {
    at(1);
    const m = members.below;
    const res = await signIn(m);
    expect(res.status, JSON.stringify(res.body)).not.toBe(423);
    expect(await account(m)).toEqual({ failed: 0, locked: false });
  });
});

describe("the signing dialog's checks (POST /api/esignature/verify-password, /verify-mfa)", () => {
  it('count a wrong password, and the fifth locks the account', async () => {
    at(1);
    const m = members.precheck;
    const auth = await session(m);
    for (let i = 1; i <= THRESHOLD; i++) {
      const res = await request(app).post('/api/esignature/verify-password').set(auth).send({ password: `wrong-${i}` });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.valid).toBe(false);
    }
    expect(await account(m), "five wrong passwords at the dialog's check left the account unlocked").toEqual({
      failed: THRESHOLD,
      locked: true,
    });
  });

  it("say the account is locked, and do not compare the password", async () => {
    at(1);
    const m = members.precheck;
    const res = await request(app).post('/api/esignature/verify-password').set(await session(m)).send({ password: PASSWORD });
    expect(res.status, 'a locked account passed the password check').toBe(423);
    expect(res.body).toMatchObject({ valid: false, error: 'ACCOUNT_LOCKED' });
    expect((await account(m)).failed).toBe(THRESHOLD);
  });

  it('count a wrong code, and the fifth locks the account', async () => {
    at(1);
    const m = members.precheckCode;
    const auth = await session(m);
    for (let i = 1; i <= THRESHOLD; i++) {
      const res = await request(app).post('/api/esignature/verify-mfa').set(auth).send({ token: '000000' });
      expect(res.body.valid, JSON.stringify(res.body)).toBe(false);
    }
    expect(await account(m), "five wrong codes at the dialog's check left the account unlocked").toEqual({
      failed: THRESHOLD,
      locked: true,
    });
    const right = await request(app).post('/api/esignature/verify-mfa').set(auth).send({ token: codeFor(m, 1) });
    expect(right.status).toBe(423);
  });
});
