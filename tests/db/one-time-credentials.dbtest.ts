/**
 * D6 / VSR-001 §13.3 item 1: a one-time credential is accepted once — the
 * authenticator code, the emailed sign-in code and the password-reset token.
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * mfaService accepted any TOTP code in its ±1-step window and recorded nothing
 * about the step it had accepted. A code that had verified was accepted again
 * until its window closed: the W3 observation signed user 17 in twice, 0.4 s
 * apart, with one code, and both sessions opened
 * (docs/evidence/W3/2026-09-23/observations/totp-replay.json). RFC 6238 §5.2:
 * "the verifier MUST NOT accept the second attempt of the OTP after the
 * successful validation has been issued for the first OTP".
 *
 * The same verifier serves the password sign-in (/api/auth/mfa/verify), the
 * enterprise sign-in (/api/auth/enterprise/verify-mfa) and every signing path
 * (reverifySigner), so one captured code also signed. The email one-time code
 * had the same flaw in a different form: read, compare and clear were separate
 * statements, so two concurrent requests could both pass, and concurrent wrong
 * guesses could each read the same attempt count and exceed the limit together.
 * The password-reset token was read, then cleared by account id alone, with a
 * bcrypt hash between the two: two requests carrying one token both succeeded,
 * and the later password silently won.
 *
 * ── The fix, and what only a real database can show ─────────────────────────
 * users.mfa_totp_last_step holds the step of the last code accepted
 * (migrations/20260923_users_mfa_totp_last_step.sql). A code is accepted only if
 * its step is LATER, compared and set in one UPDATE … WHERE … RETURNING, so of
 * two concurrent verifications exactly one gets the row. That last property is
 * about PostgreSQL's row locking under READ COMMITTED, which no mock can model,
 * hence this file.
 *
 * ── A frozen clock ──────────────────────────────────────────────────────────
 * Which codes are acceptable depends on the 30-second step the clock is in, so
 * the clock is set, not read: only `Date` is faked (sockets, pg and timers are
 * real), each test moves it to the step it needs, and no case depends on where
 * in a real step the suite happens to start.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As sign-in-audit-trail.dbtest.ts: production's registerPlatformRoutes, a
 * freshly minted NOSUPERUSER NOBYPASSRLS runtime role through APP_DATABASE_URL,
 * RLS_ENFORCE=on, dev-login closed, enrolment through the mfaService functions
 * /mfa/setup and /mfa/enable call. Nothing in the verifiers is stubbed.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtrp": organisation 91850 (range 91850–91899); every email starts
 * `dbtrp-`. Audit rows are removed through the documented archive door.
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
import { totp, timeStep } from '../validation/lib/totp.mjs';

type Runtime = typeof import('../../server/db/runtime');
type Mfa = typeof import('../../server/services/mfaService');

const ORG = 91850;
const TAG = 'dbtrp';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtrp-totp-replay-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtrp_rt_${RUN}` });
const PASSWORD = 'Dbtrp-Totp-Replay-2026!';
const EXTERNAL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

// 5 s into a step, so "the step the clock is in" is never at an edge.
const T0 = Math.floor(Date.now() / 30_000) * 30_000 + 5_000;
const S0 = timeStep(T0);
/** Move the (faked) clock to `n` steps after T0. */
const at = (n: number) => vi.setSystemTime(T0 + n * 30_000);

interface Member {
  id: number;
  email: string;
  secret: string;
}
/** The member's code for step S0 + n. */
const code = (m: Member, n: number) => totp(m.secret, T0 + n * 30_000);

let owner: Pool;
let runtime: Runtime;
let mfa: Mfa;
let app: express.Express;
const members: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g', Member> = {} as never;

const inScope = <T>(caller: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: `dbtrp:${caller}` }, fn);

async function lastStep(m: Member): Promise<number | null> {
  const { rows } = await owner.query('SELECT mfa_totp_last_step FROM users WHERE id = $1', [m.id]);
  return rows[0].mfa_totp_last_step === null ? null : Number(rows[0].mfa_totp_last_step);
}

/** Sessions /mfa/verify and the enterprise path recorded for the member. */
async function sessionsIssued(m: Member): Promise<number> {
  const { rows } = await owner.query(
    `SELECT count(*)::int AS n FROM audit_logs
      WHERE tenant_id = $1 AND action = 'user_login' AND record_id = $2
        AND new_values->>'outcome' = 'success' AND new_values->>'reason' = 'mfa_verified'`,
    [ORG, String(m.id)],
  );
  return rows[0].n;
}

async function challenge(m: Member): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email: m.email, password: PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body.mfaRequired).toBe(true);
  return res.body.challengeId;
}

const verify = (challengeId: string, c: string) =>
  request(app).post('/api/auth/mfa/verify').send({ challengeId, code: c, method: 'totp' });

async function enterprisePartial(m: Member): Promise<string> {
  const res = await request(app).post('/api/auth/enterprise/verify-password').send({ email: m.email, password: PASSWORD });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.partialToken;
}

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
    [email, `Lane Replay ${key}`, await bcrypt.hash(PASSWORD, 4), ORG],
  );
  const id = user.rows[0].id as number;
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [ORG, id]);
  let secret = '';
  if (enrolTotp) {
    // Through the functions /api/auth/mfa/setup and /enable call, in the
    // member's own scope, as those authenticated routes run. Enabling presents
    // step S0's code, which is thereby used.
    await inScope(`enrol-${key}`, async () => {
      secret = (await mfa.generateSecret(id, email)).secret;
      const enabled = await mfa.enableMfa(id, totp(secret, T0));
      if (!enabled.success) throw new Error(`[dbtrp] TOTP enrolment of ${key} was refused`);
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
  if (provisioned!.skipped) throw new Error('[dbtrp] provisionAppServiceRole skipped — no runtime role.');

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbtrp-mfa-encryption-key-at-least-32-chars';
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
        res.status(401).json({ error: 'dbtrp: the global gate was reached; /api/auth must not reach it' });
        return;
      }
      return authMiddleware(req, res, next);
    },
  });
  // Behind that gate, as register-inline-routes mounts it.
  app.use('/api/esignature', esignatureRouter);

  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
     VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [ORG, `${TAG}-${ORG}-${RUN}`],
  );

  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  members.a = await addMember('a', true);
  members.b = await addMember('b', true);
  members.c = await addMember('c', true);
  members.d = await addMember('d', true);
  members.e = await addMember('e', false);
  members.f = await addMember('f', false);
  members.g = await addMember('g', true);
}, 180_000);

afterAll(async () => {
  vi.useRealTimers();
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbtrp] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbtrp] runtime role left behind:', (err as Error).message);
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

  it('enrolment used the step it presented', async () => {
    for (const m of [members.a, members.b, members.c, members.d, members.g]) expect(await lastStep(m)).toBe(S0);
    expect(await lastStep(members.e)).toBeNull();
  });
});

describe('a code opens one session (POST /api/auth/mfa/verify)', () => {
  it('refuses the same code the second time', async () => {
    at(0);
    const a = members.a;
    const first = await verify(await challenge(a), code(a, 1));
    expect(first.status, JSON.stringify(first.body)).toBe(200);

    const second = await verify(await challenge(a), code(a, 1));
    expect(second.status, 'a code that had verified opened a second session').toBe(401);
    expect(second.body.error?.code).toBe('AUTH_004');
    expect(await sessionsIssued(a)).toBe(1);
    expect(await lastStep(a)).toBe(S0 + 1);
  });

  it('refuses a code from a step earlier than the last accepted, though that code was never used', async () => {
    at(0);
    const a = members.a;
    // Step S0-1 is inside the window at S0 and was never presented; S0+1 was accepted.
    const res = await verify(await challenge(a), code(a, -1));
    expect(res.status, 'a code older than one already accepted still verified').toBe(401);
    expect(await sessionsIssued(a)).toBe(1);
    expect(await lastStep(a)).toBe(S0 + 1);
  });

  it('accepts the next code: a refusal is per step, not a lockout', async () => {
    at(1);
    const a = members.a;
    const res = await verify(await challenge(a), code(a, 2));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await sessionsIssued(a)).toBe(2);
    expect(await lastStep(a)).toBe(S0 + 2);
  });
});

describe('concurrent verifications of one code', () => {
  it('two sign-ins racing one code: exactly one session', async () => {
    at(0);
    const b = members.b;
    const [c1, c2] = [await challenge(b), await challenge(b)];
    const results = await Promise.all([verify(c1, code(b, 1)), verify(c2, code(b, 1))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await sessionsIssued(b)).toBe(1);
  });

  it('eight verifiers racing one code: exactly one accepts it', async () => {
    // Below the routes, so the race is not bounded by the per-IP limiters, and
    // wide enough that the UPDATEs genuinely overlap on the pool.
    at(1);
    const b = members.b;
    const outcomes = await inScope('race', () =>
      Promise.all(Array.from({ length: 8 }, () => mfa.verifySecondFactor(b.id, code(b, 2)))),
    );
    expect(outcomes.filter((o) => o === 'totp')).toHaveLength(1);
    expect(await lastStep(b)).toBe(S0 + 2);
  });
});

describe('one record of used codes, whichever path verifies', () => {
  it('the enterprise sign-in refuses a code it already accepted', async () => {
    at(0);
    const c = members.c;
    const first = await request(app)
      .post('/api/auth/enterprise/verify-mfa')
      .send({ partialToken: await enterprisePartial(c), code: code(c, 1) });
    expect(first.status, JSON.stringify(first.body)).toBe(200);

    const second = await request(app)
      .post('/api/auth/enterprise/verify-mfa')
      .send({ partialToken: await enterprisePartial(c), code: code(c, 1) });
    expect(second.status, 'the enterprise path accepted a used code').toBe(401);
  });

  it('the password sign-in refuses a code the enterprise sign-in used', async () => {
    at(0);
    const c = members.c;
    const res = await verify(await challenge(c), code(c, 1));
    expect(res.status, 'a code used on one sign-in path opened a session on the other').toBe(401);
  });
});

describe('signing: the pre-check does not use the code, the signature does', () => {
  let bearer: { Authorization: string };

  beforeAll(async () => {
    const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
    const d = members.d;
    const token = jwt.sign(
      { userId: String(d.id), email: d.email, organizationId: String(ORG), role: 'admin', type: 'access' },
      activeJwtSecret(),
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    bearer = { Authorization: `Bearer ${token}` };
  });

  const precheck = (c: string) => request(app).post('/api/esignature/verify-mfa').set(bearer).send({ token: c });
  const sign = (c: string) =>
    inScope('sign', async () => {
      const { reverifySigner } = await import('../../server/services/part11/reverify-signer');
      const { signerReverificationDeps } = await import('../../server/services/part11/reverify-signer-deps');
      return reverifySigner(members.d.id, { password: PASSWORD, mfaToken: c }, signerReverificationDeps());
    });

  it('the modal can check a code, even twice, and it is still unused', async () => {
    at(0);
    const d = members.d;
    for (let i = 0; i < 2; i++) {
      const res = await precheck(code(d, 1));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual({ valid: true });
    }
    expect(await lastStep(d)).toBe(S0);
  });

  it('the signature then accepts that same code, and uses it', async () => {
    at(0);
    const d = members.d;
    expect(await sign(code(d, 1))).toMatchObject({ ok: true, authenticationMethod: 'password+mfa' });
    expect(await lastStep(d)).toBe(S0 + 1);
  });

  it('a used code neither checks nor signs again', async () => {
    at(0);
    const d = members.d;
    expect((await precheck(code(d, 1))).body).toEqual({ valid: false });
    expect(await sign(code(d, 1))).toMatchObject({ ok: false, code: 'MFA_VERIFICATION_FAILED' });
  });

  it('the pre-check is limited per signer, since it answers without using the code', async () => {
    at(0);
    // 3 checks so far (two above, one in the previous case); the limit is 10.
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await precheck('000000')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 429]);
  });

  it('the password pre-check is limited per signer too, on its own budget', async () => {
    at(0);
    const check = (password: string) =>
      request(app).post('/api/esignature/verify-password').set(bearer).send({ password });
    const first = await check(PASSWORD);
    expect(first.body).toEqual({ valid: true, mfaRequired: true });
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await check('not-the-password')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 429]);
  });
});

describe('the email one-time code is used once, and its attempts are counted once each', () => {
  const emailOtp = () => import('../../server/services/emailOtpService');

  it('eight verifiers racing one emailed code: exactly one accepts it', async () => {
    at(0);
    const { createEmailOtp, verifyEmailOtp } = await emailOtp();
    const e = members.e;
    const outcomes = await inScope('email-race', async () => {
      const sent = await createEmailOtp(e.id);
      return Promise.all(Array.from({ length: 8 }, () => verifyEmailOtp(e.id, sent)));
    });
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it.each([
    [4, true],
    [5, false],
  ])('after %i wrong guesses the right code is accepted: %s (the limit is exactly five)', async (wrongGuesses, accepted) => {
    at(0);
    const { createEmailOtp, verifyEmailOtp } = await emailOtp();
    const e = members.e;
    const outcome = await inScope('email-boundary', async () => {
      const sent = await createEmailOtp(e.id);
      const wrong = sent === '000000' ? '111111' : '000000';
      for (let i = 0; i < wrongGuesses; i++) await verifyEmailOtp(e.id, wrong);
      return verifyEmailOtp(e.id, sent);
    });
    expect(outcome).toBe(accepted);
  });

  it('twelve concurrent wrong guesses exhaust the five attempts, and the right code is then refused', async () => {
    at(0);
    const { createEmailOtp, verifyEmailOtp } = await emailOtp();
    const e = members.e;
    const accepted = await inScope('email-guesses', async () => {
      const sent = await createEmailOtp(e.id);
      const wrong = sent === '000000' ? '111111' : '000000';
      await Promise.all(Array.from({ length: 12 }, () => verifyEmailOtp(e.id, wrong)));
      return verifyEmailOtp(e.id, sent);
    });
    expect(accepted, 'concurrent guesses shared attempts, leaving the code open to more than five').toBe(false);
  });
});

describe('a password-reset token is used once', () => {
  it('two resets racing one token: exactly one succeeds, and its password is the one set', async () => {
    at(0);
    const f = members.f;
    const { mintPasswordSetupToken } = await import('../../server/services/password-setup-token');
    // The row /forgot-password writes; the plaintext is what its email carries.
    const { token, tokenHash, expiresAt } = mintPasswordSetupToken(60 * 60 * 1000);
    await owner.query('UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3', [
      tokenHash,
      expiresAt,
      f.id,
    ]);

    const passwords = ['Dbtrp-Reset-First-2026!', 'Dbtrp-Reset-Second-2026!'];
    const results = await Promise.all(
      passwords.map((newPassword) => request(app).post('/api/auth/reset-password').send({ token, newPassword })),
    );
    expect(results.map((r) => r.status).sort(), JSON.stringify(results.map((r) => r.body))).toEqual([200, 400]);

    const winner = passwords[results.findIndex((r) => r.status === 200)];
    const { rows } = await owner.query('SELECT password_hash, reset_token FROM users WHERE id = $1', [f.id]);
    expect(rows[0].reset_token).toBeNull();
    expect(await bcrypt.compare(winner, rows[0].password_hash), 'the reported password is not the one stored').toBe(true);
  });
});

describe('replay state belongs to one secret', () => {
  it("a new authenticator's first code is not refused for the old one's last step", async () => {
    at(0);
    const g = members.g;
    const fresh = await inScope('reenrol', async () => {
      // The owner removes the old authenticator with a current code (step S0+1 used)...
      if (!(await mfa.disableMfa(g.id, code(g, 1)))) throw new Error('[dbtrp] disable refused');
      // ...and enrols a new one inside the same 30 s. Its code for S0+1 has never been presented.
      const secret = (await mfa.generateSecret(g.id, g.email)).secret;
      return { secret, enabled: await mfa.enableMfa(g.id, totp(secret, T0 + 30_000)) };
    });
    expect(fresh.enabled.success, 'the new authenticator was refused a code it had never presented').toBe(true);
    expect(await lastStep(g)).toBe(S0 + 1);
  });
});
