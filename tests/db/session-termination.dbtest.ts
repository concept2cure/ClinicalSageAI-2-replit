/**
 * Ending a person's sessions ends them: a password change or reset, a
 * sign-out everywhere, a suspension or deprovisioning, a removal from the
 * organisation; and a role change is read on the next request (security audit
 * 2026-09-24 IAM-04 (b), plan P0-4b; 21 CFR 11.300(c), HIPAA 164.312(a)(2)(iii)).
 *
 * ── The defects this pins (reproduced 2026-10-01, before the fix) ───────────
 *   · POST /api/auth/logout read `terminateAllSessions` from nobody: the client
 *     sends it (client/src/services/portal/authService.tsx logout(true)), the
 *     route revoked the presented pair and answered "Tokens invalidated.", and
 *     every other session of the account, access and refresh, carried on.
 *   · A suspension or deprovisioning only paused a session: the account's
 *     standing is read per request, so the session was refused while the
 *     account was out of use and admitted again, token unchanged, the moment
 *     an administrator reactivated it.
 *   · A password change ended the sessions issued in an EARLIER second only
 *     (iat against users.password_changed_at, whole seconds). A refresh token
 *     minted in the same second as the change, before it, outlived it and
 *     kept refreshing for the rest of its session's life.
 *
 * ── The fix (one mechanism, the one the schema already had) ────────────────
 * users.sessions_ended_at beside users.password_changed_at, read in the same
 * standing statement (services/account-standing.ts); a session that began
 * (`sst`) before the later of the two is over at every door
 * (sessionEndedByStanding). The sign-out everywhere stamps it; a trigger stamps
 * it when status leaves 'active' (migrations/20261001_users_sessions_ended_at.sql).
 *
 * ── Fix round, 2026-10-01 ───────────────────────────────────────────────────
 *   · (4) a router gate behind the global gate serves the role the global gate
 *     read on this request, not its 60-second membership cache.
 *   · R1, (3): a member removed and added back does not get the session they
 *     held back. The standing also reads when the membership in the session's
 *     organisation began, and a session older than its membership is over.
 *   · R3, (6): an ending stamp is the first whole second after its event, and
 *     the writer answers once that second has begun. A session begun in the
 *     event's own second, before it, ends. The sign-in that follows is current.
 *     A sign-in whose first factor was shown before the event is refused at its
 *     second factor.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * As account-standing.dbtest.ts: production's registerPlatformRoutes and global
 * gate, a NOSUPERUSER NOBYPASSRLS runtime role through APP_DATABASE_URL,
 * RLS_ENFORCE=on, dev-login closed, sign-in by password and TOTP. Accounts are
 * taken out of use, re-roled and removed by the statements the admin, SCIM and
 * membership routes run. Only Date is faked: it starts an hour behind the wall
 * clock, so a stamp the database writes with its own clock (a suspension)
 * falls after every session signed in before `pastTheWallClock()`.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbste": organisation 93330; every email starts `dbste-`. Audit rows are
 * removed as account-standing.dbtest.ts removes its own.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../scripts/db/provision-app-role.mjs';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { totp } from '../validation/lib/totp.mjs';

type Runtime = typeof import('../../server/db/runtime');

const ORG = 93330;
const TAG = 'dbste';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbste-session-termination-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbste_rt_${RUN}` });
const PASSWORD = 'Dbste-Session-Termination-2026!';
// Contains nothing of the account's name, e-mail or organisation: the password policy refuses those.
const NEW_PASSWORD = 'Quartz-Rotated-Passphrase-2026!q';
const EXTERNAL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

/** The wall clock, which fake timers on Date do not move. */
const wallClock = () => performance.timeOrigin + performance.now();
// An hour behind the wall clock, 5 s into a TOTP step.
const T0 = Math.floor((wallClock() - 3_600_000) / 30_000) * 30_000 + 5_000;
let step = 0;
/** The faked clock at `ms` into TOTP step `n`. */
const at = (n: number, ms = 0) => vi.setSystemTime(T0 + n * 30_000 + ms);
/** The next TOTP step: each code is accepted once per account. */
const nextStep = () => {
  step += 1;
  at(step);
  return step;
};
/** Jump the faked clock ten minutes past the wall clock, so a database-stamped end precedes what follows. */
const pastTheWallClock = () => {
  step = Math.max(step + 1, Math.ceil((wallClock() + 600_000 - T0) / 30_000));
  at(step);
};

interface Member {
  id: number;
  email: string;
  secret: string;
}
interface Session {
  bearer: { Authorization: string };
  accessToken: string;
  refreshToken: string;
}

let owner: Pool;
let runtime: Runtime;
let app: express.Express;
type MemberKey =
  | 'changer' | 'resetee' | 'looper' | 'everywhere' | 'stale' | 'suspendee' | 'deprovisionee' | 'removed' | 'demoted'
  | 'readded' | 'samesecond' | 'followed' | 'halfway';
const members = {} as Record<MemberKey, Member>;

const inScope = <T>(caller: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: `dbste:${caller}` }, fn);

/** A response body for an assertion message, every token in it redacted: evidence carries none. */
const shown = (body: unknown) => JSON.stringify(body).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>');

/** A sign-in at the start of the next TOTP step. */
const signIn = (m: Member, password = PASSWORD): Promise<Session> => signInAt(m, nextStep(), 0, password);
/** A sign-in completed at `ms` into the current second of TOTP step `n`: the session begins then. */
async function signInAt(m: Member, n: number, ms: number, password = PASSWORD): Promise<Session> {
  at(n, ms);
  const login = await request(app).post('/api/auth/login').send({ email: m.email, password });
  expect(login.status, shown(login.body)).toBe(200);
  const verify = await request(app)
    .post('/api/auth/mfa/verify')
    .send({ challengeId: login.body.challengeId, code: totp(m.secret, T0 + n * 30_000), method: 'totp' });
  expect(verify.status, shown(verify.body)).toBe(200);
  return {
    bearer: { Authorization: `Bearer ${verify.body.accessToken}` },
    accessToken: verify.body.accessToken as string,
    refreshToken: verify.body.refreshToken as string,
  };
}
/** Every door a session is answered at, and what each answered. */
async function doors(s: Session) {
  const gate = await request(app).get('/api/dbste/whoami').set(s.bearer);
  const routerGate = await request(app).get('/dbste/router-gate').set(s.bearer);
  const probe = await request(app).get('/api/auth/session').set(s.bearer);
  const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
  return { gate, routerGate, probe, refresh };
}

/** The enterprise door re-mints an access token from a live one; asked separately, because it spends the token. */
const enterpriseRefresh = (s: Session) => request(app).post('/api/auth/enterprise/refresh-token').set(s.bearer).send({});

function expectEnded(d: Awaited<ReturnType<typeof doors>>, what: string) {
  expect(d.gate.status, `${what}: the /api gate still admitted it: ${shown(d.gate.body)}`).toBe(401);
  expect(d.routerGate.status, `${what}: a router's own gate still admitted it: ${shown(d.routerGate.body)}`).toBe(401);
  expect(d.probe.status, `${what}: the session probe still reported it signed in: ${shown(d.probe.body)}`).toBe(401);
  expect(d.refresh.status, `${what}: its refresh token still minted a session: ${shown(d.refresh.body)}`).not.toBe(200);
  expect(d.refresh.body.accessToken).toBeUndefined();
}

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    // As account-standing.dbtest.ts: the owner, the DELETE trigger off for this transaction only.
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
    await owner.query(`SELECT id, uuid::text AS uuid FROM organizations WHERE id = $1 OR slug LIKE $2`, [ORG, `${TAG}-%`])
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

async function addMember(key: string, role: string): Promise<Member> {
  const email = `${TAG}-${key}-${RUN}@example.invalid`;
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, `Lane Termination ${key}`, await bcrypt.hash(PASSWORD, 4), ORG],
  );
  const id = user.rows[0].id as number;
  // The membership begins a minute before the suite's (faked) clock starts, as a
  // membership precedes every session in life. The database's own now() runs an
  // hour ahead of that clock here, and a membership begun after a session ends it
  // (plan P0-4b R1, account-standing.ts sessionEndedByStanding). Written as a
  // timestamptz, so the naive column holds it in this connection's zone, as its
  // default now() would, and the standing reads it in that zone.
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, $3, $4::timestamptz)`, [
    ORG,
    id,
    role,
    new Date(Date.now() - 60_000).toISOString(),
  ]);
  const mfa = await import('../../server/services/mfaService');
  let secret = '';
  await inScope(`enrol-${key}`, async () => {
    secret = (await mfa.generateSecret(id, email)).secret;
    const enabled = await mfa.enableMfa(id, totp(secret, T0));
    if (!enabled.success) throw new Error(`[dbste] TOTP enrolment of ${key} was refused`);
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
  if (provisioned!.skipped) throw new Error('[dbste] provisionAppServiceRole skipped — no runtime role.');

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbste-mfa-encryption-key-at-least-32-chars';
  for (const key of EXTERNAL_KEYS) delete process.env[key];

  runtime = await import('../../server/db/runtime');
  const { registerPlatformRoutes } = await import('../../server/bootstrap/register-platform-routes');
  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.use(express.json());
  await registerPlatformRoutes({
    app,
    pool: runtime.getPool(),
    // Production's global /api gate, which /api/auth must never reach.
    authMiddleware: (req, res, next) => {
      if (/^\/api\/(v1\/)?auth(\/|$)/.test(req.originalUrl)) {
        res.status(401).json({ error: 'dbste: the global gate was reached; /api/auth must not reach it' });
        return;
      }
      return authMiddleware(req, res, next);
    },
  });
  const whoami = (req: express.Request, res: express.Response) => {
    const user = (req as { user?: { id?: number; role?: string } }).user;
    res.json({ userId: user?.id ?? null, role: user?.role ?? null });
  };
  app.get('/api/dbste/whoami', whoami);
  // The per-router gate (authenticateToken), outside /api so the global gate cannot answer for it.
  const { authenticateToken, requireRole } = await import('../../server/middleware/auth');
  app.get('/dbste/router-gate', authenticateToken, whoami);
  // The same gate where production mounts it, behind the global gate, and a guard reading the role it serves.
  app.get('/api/dbste/router-gate', authenticateToken, whoami);
  app.get('/api/dbste/admin-only', authenticateToken, requireRole('admin'), whoami);

  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status) VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [ORG, `${TAG}-${ORG}-${RUN}`],
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
  const keys: MemberKey[] = [
    'changer', 'resetee', 'looper', 'everywhere', 'stale', 'suspendee', 'deprovisionee', 'removed', 'demoted',
    'readded', 'samesecond', 'followed', 'halfway',
  ];
  for (const key of keys) members[key] = await addMember(key, 'admin');
}, 240_000);

afterAll(async () => {
  vi.useRealTimers();
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbste] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbste] runtime role left behind:', (err as Error).message);
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

describe('(1) a password change or reset ends every other session at its next request', () => {
  it('a change from one session ends the other, access and refresh, at every door including the enterprise one', async () => {
    const m = members.changer;
    const mine = await signIn(m);
    const other = await signIn(m);
    expect((await request(app).get('/api/dbste/whoami').set(other.bearer)).status).toBe(200);
    nextStep();
    const change = await request(app)
      .post('/api/auth/password/change')
      .set(mine.bearer)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, terminateOtherSessions: true });
    expect(change.status, shown(change.body)).toBe(200);
    expectEnded(await doors(other), 'a session the password change should have ended');
    const ent = await enterpriseRefresh(other);
    expect(ent.status, `the enterprise door re-minted it: ${shown(ent.body)}`).toBe(401);
    expect(ent.body.token).toBeUndefined();
    // The new password opens a new session.
    const again = await signIn(m, NEW_PASSWORD);
    expect((await request(app).get('/api/dbste/whoami').set(again.bearer)).status).toBe(200);
  });

  it('a reset by emailed token ends the sessions the account held', async () => {
    const m = members.resetee;
    const held = await signIn(m);
    const { hashPasswordSetupToken } = await import('../../server/services/password-setup-token');
    const raw = `dbste-reset-${RUN}`;
    nextStep();
    await owner.query(`UPDATE users SET reset_token = $2, reset_token_expires_at = $3::timestamp WHERE id = $1`, [
      m.id,
      hashPasswordSetupToken(raw),
      new Date(Date.now() + 3_600_000).toISOString(),
    ]);
    const reset = await request(app).post('/api/auth/reset-password').send({ token: raw, newPassword: NEW_PASSWORD });
    expect(reset.status, shown(reset.body)).toBe(200);
    expectEnded(await doors(held), 'a session the password reset should have ended');
  });

  it('a refresh token minted in the same second as the change, before it, mints nothing after it', async () => {
    const m = members.looper;
    const thief = await signIn(m);
    const holder = await signIn(m);
    const s = nextStep();
    // The thief's client refreshes at .2 s, the holder changes the password at .7 s, of the same second.
    at(s, 200);
    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: thief.refreshToken });
    expect(rotated.status, shown(rotated.body)).toBe(200);
    at(s, 700);
    const change = await request(app)
      .post('/api/auth/password/change')
      .set(holder.bearer)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status, shown(change.body)).toBe(200);
    at(s, 5_000);
    const session: Session = {
      bearer: { Authorization: `Bearer ${rotated.body.accessToken}` },
      accessToken: rotated.body.accessToken,
      refreshToken: rotated.body.refreshToken,
    };
    expectEnded(await doors(session), 'a session rotated in the second of the password change');
  });
});

describe('(2) signing out everywhere ends every session of the account', () => {
  it('logout with terminateAllSessions ends the other sessions, access and refresh, at every door', async () => {
    const m = members.everywhere;
    const here = await signIn(m);
    const elsewhere = await signIn(m);
    expect((await request(app).get('/api/dbste/whoami').set(elsewhere.bearer)).status).toBe(200);
    nextStep();
    const out = await request(app)
      .post('/api/auth/logout')
      .set(here.bearer)
      .send({ terminateAllSessions: true, refreshToken: here.refreshToken });
    expect(out.status, shown(out.body)).toBe(200);
    expect(out.body.success).toBe(true);
    expectEnded(await doors(here), 'the session that signed out everywhere');
    expectEnded(await doors(elsewhere), 'a session a sign-out everywhere should have ended');
    const ent = await enterpriseRefresh(elsewhere);
    expect(ent.status, `the enterprise door re-minted it: ${shown(ent.body)}`).toBe(401);
    // A new sign-in is a new session.
    const after = await signIn(m);
    expect((await request(app).get('/api/dbste/whoami').set(after.bearer)).status).toBe(200);
  });

  it('a sign-out everywhere from a session that has already ended ends nothing, and says so', async () => {
    const m = members.stale;
    const ended = await signIn(m);
    const live = await signIn(m);
    nextStep();
    expect((await request(app).post('/api/auth/logout').set(ended.bearer).send({ refreshToken: ended.refreshToken })).status).toBe(200);
    const out = await request(app)
      .post('/api/auth/logout')
      .set(ended.bearer)
      .send({ terminateAllSessions: true });
    expect(out.status, `a signed-out token was answered as if every session had ended: ${shown(out.body)}`).toBe(401);
    expect(out.body.success).toBe(false);
    expect((await request(app).get('/api/dbste/whoami').set(live.bearer)).status).toBe(200);
  });
});

describe('(3) suspending, deprovisioning or removing an account ends its sessions', () => {
  /** The statement server/routes/admin/master-admin.ts runs. */
  const setStatus = (m: Member, status: string) =>
    owner.query(`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, [m.id, status]);

  it('a session suspended and then reactivated stays ended', async () => {
    const m = members.suspendee;
    const held = await signIn(m);
    expect((await request(app).get('/api/dbste/whoami').set(held.bearer)).status).toBe(200);
    await setStatus(m, 'suspended');
    const during = await request(app).get('/api/dbste/whoami').set(held.bearer);
    expect(during.status, shown(during.body)).toBe(401);
    expect(during.body.code).toBe('ACCOUNT_INACTIVE');
    await setStatus(m, 'active');
    expectEnded(await doors(held), 'a session held across a suspension');
  });

  it('a session deprovisioned by the identity provider and then reactivated stays ended', async () => {
    const m = members.deprovisionee;
    const held = await signIn(m);
    // The statement server/routes/scim.ts runs.
    await owner.query(`UPDATE users SET status = 'inactive', updated_at = now() WHERE id = $1`, [m.id]);
    await setStatus(m, 'active');
    expectEnded(await doors(held), 'a session held across a deprovisioning');
  });

  it('a reactivated account signs in afresh', async () => {
    pastTheWallClock();
    const s = await signIn(members.suspendee);
    const me = await request(app).get('/api/dbste/whoami').set(s.bearer);
    expect(me.status, shown(me.body)).toBe(200);
  });

  it('a member removed from the organisation is refused at the next request and mints nothing', async () => {
    const m = members.removed;
    const held = await signIn(m);
    expect((await request(app).get('/api/dbste/whoami').set(held.bearer)).status).toBe(200);
    // The statement removeMember runs, and the cache invalidation the DELETE route performs.
    await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [ORG, m.id]);
    const { invalidateOrgMembershipCache } = await import('../../server/middleware/orgMembership');
    invalidateOrgMembershipCache(m.id, ORG);
    const d = await doors(held);
    expect(d.gate.status, shown(d.gate.body)).toBe(401);
    expect([401, 403], shown(d.routerGate.body)).toContain(d.routerGate.status);
    expect(d.refresh.status, shown(d.refresh.body)).toBe(403);
    expect(d.refresh.body.accessToken).toBeUndefined();
    const ent = await enterpriseRefresh(held);
    expect(ent.status, shown(ent.body)).toBe(403);
    expect(ent.body.token).toBeUndefined();
  });

  it('a member removed and re-added holds nothing from before: the session is over at every door, and they sign in again (R1)', async () => {
    const m = members.readded;
    const held = await signIn(m);
    expect((await request(app).get('/api/dbste/whoami').set(held.bearer)).status).toBe(200);
    const { invalidateOrgMembershipCache } = await import('../../server/middleware/orgMembership');
    // Removed (the statement removeMember runs, and the DELETE route's cache invalidation)…
    await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [ORG, m.id]);
    invalidateOrgMembershipCache(m.id, ORG);
    expect((await request(app).get('/api/dbste/whoami').set(held.bearer)).status).toBe(401);
    // …and added back a second later (the statement the add-member route runs). The row's
    // created_at is the moment of the re-add on this suite's clock, after the session began.
    nextStep();
    await owner.query(`INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, 'admin', $3::timestamptz)`, [
      ORG,
      m.id,
      new Date(Date.now()).toISOString(),
    ]);
    invalidateOrgMembershipCache(m.id, ORG);
    expectEnded(await doors(held), 'a session held across a removal and a re-add');
    const ent = await enterpriseRefresh(held);
    expect(ent.status, `the enterprise door re-minted it: ${shown(ent.body)}`).not.toBe(200);
    expect(ent.body.token).toBeUndefined();
    // The router gate behind the global gate, where production mounts it, refuses too.
    expect((await request(app).get('/api/dbste/router-gate').set(held.bearer)).status).toBe(401);
    // A sign-in after the re-add is a new session in the organisation.
    const again = await signIn(m);
    const me = await request(app).get('/api/dbste/whoami').set(again.bearer);
    expect(me.status, shown(me.body)).toBe(200);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: again.refreshToken })).status).toBe(200);
  });
});

describe('(4) a role change is read on the next request', () => {
  it('a demotion is the role the global gate, a router gate behind it, and every successor token carry', async () => {
    const m = members.demoted;
    const held = await signIn(m);
    expect((await request(app).get('/api/dbste/whoami').set(held.bearer)).body.role).toBe('admin');
    // Warm this task's membership cache through both router gates, as earlier requests would have.
    expect((await request(app).get('/api/dbste/router-gate').set(held.bearer)).body.role).toBe('admin');
    expect((await request(app).get('/api/dbste/admin-only').set(held.bearer)).status).toBe(200);
    expect((await request(app).get('/dbste/router-gate').set(held.bearer)).body.role).toBe('admin');
    // The statement changeMemberRole runs, as another server task runs it: the
    // writer's cache invalidation reaches only the task that wrote, never this one.
    await owner.query(`UPDATE organization_users SET role = 'member', updated_at = NOW() WHERE organization_id = $1 AND user_id = $2`, [ORG, m.id]);
    const gate = await request(app).get('/api/dbste/whoami').set(held.bearer);
    expect(gate.status, shown(gate.body)).toBe(200);
    expect(gate.body.role, 'the global gate served the role minted at sign-in').toBe('member');
    const routerGate = await request(app).get('/api/dbste/router-gate').set(held.bearer);
    expect(routerGate.status, shown(routerGate.body)).toBe(200);
    expect.soft(routerGate.body.role, "a router's gate behind the global gate served the cached role").toBe('member');
    const adminOnly = await request(app).get('/api/dbste/admin-only').set(held.bearer);
    expect.soft(adminOnly.status, `requireRole('admin') admitted the demoted member: ${shown(adminOnly.body)}`).toBe(403);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: held.refreshToken });
    expect(refreshed.status, shown(refreshed.body)).toBe(200);
    const jwt = (await import('jsonwebtoken')).default;
    expect((jwt.decode(refreshed.body.accessToken) as { role?: string }).role).toBe('member');
    // On the task that wrote it, the writer's invalidation reaches even a gate the global gate does not precede.
    const { invalidateOrgMembershipCache } = await import('../../server/middleware/orgMembership');
    invalidateOrgMembershipCache(m.id, ORG);
    expect((await request(app).get('/dbste/router-gate').set(held.bearer)).body.role).toBe('member');
  });
});

/*
 * R3, decided by these cases (plan P0-4b fix round, 2026-10-01). A token records
 * when its session began to the whole second. The comparison has to end a
 * session begun in the same second as a password change but before it, and must
 * not end the session that follows the change.
 */
describe('(6) the second a password change lands in (R3)', () => {
  const stampOf = async (id: number) =>
    Number((await owner.query(`SELECT floor(date_part('epoch', password_changed_at))::bigint AS s FROM users WHERE id = $1`, [id])).rows[0].s);

  it('a session begun in the same second as the change, before it, is over at every door', async () => {
    const m = members.samesecond;
    const holder = await signIn(m);
    const n = nextStep();
    // The thief completes a sign-in at .1 s; the holder changes the password at .6 s of the same second.
    const thief = await signInAt(m, n, 100);
    expect((await request(app).get('/api/dbste/whoami').set(thief.bearer)).status).toBe(200);
    at(n, 600);
    const change = await request(app)
      .post('/api/auth/password/change')
      .set(holder.bearer)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status, shown(change.body)).toBe(200);
    at(n, 5_000);
    expectEnded(await doors(thief), 'a session begun in the second of the password change, before it');
    const ent = await enterpriseRefresh(thief);
    expect(ent.status, `the enterprise door re-minted it: ${shown(ent.body)}`).toBe(401);
  });

  it('the sign-in that follows the change is current: the change stamps the first whole second after it, and answers once that second has begun', async () => {
    const m = members.followed;
    const holder = await signIn(m);
    const n = nextStep();
    const changedAt = T0 + n * 30_000; // .0 s of its second: the longest the change can be made to wait
    at(n, 0);
    const started = performance.now();
    const change = await request(app)
      .post('/api/auth/password/change')
      .set(holder.bearer)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    // The holder signs in again the moment the answer arrives, on a clock that moved as the real one did.
    const answeredAfterMs = Math.ceil(performance.now() - started);
    expect(change.status, shown(change.body)).toBe(200);
    const after = await signInAt(m, n, answeredAfterMs, NEW_PASSWORD);
    const me = await request(app).get('/api/dbste/whoami').set(after.bearer);
    expect(me.status, `the sign-in that followed the change, ${answeredAfterMs} ms after it, was ended by it: ${shown(me.body)}`).toBe(200);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: after.refreshToken });
    expect(refreshed.status, shown(refreshed.body)).toBe(200);
    // How: the stamp names the first whole second after the change, and the change answers once it has begun.
    expect.soft(await stampOf(m.id), 'the stamp is not the first whole second after the change').toBe(Math.floor(changedAt / 1000) + 1);
    expect.soft(answeredAfterMs, 'the change answered before the second its stamp names had begun').toBeGreaterThanOrEqual(1_000);
  });

  it('a sign-in begun with the old password before the change and completed after it opens nothing', async () => {
    const m = members.halfway;
    const holder = await signIn(m);
    const n = nextStep();
    at(n, 100);
    const login = await request(app).post('/api/auth/login').send({ email: m.email, password: PASSWORD });
    expect(login.status, shown(login.body)).toBe(200);
    at(n, 600);
    const change = await request(app)
      .post('/api/auth/password/change')
      .set(holder.bearer)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status, shown(change.body)).toBe(200);
    // The second factor arrives a step later, inside the challenge's five minutes.
    const k = nextStep();
    const verify = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ challengeId: login.body.challengeId, code: totp(m.secret, T0 + k * 30_000), method: 'totp' });
    expect(verify.status, `a sign-in begun before the password change became a session after it: ${shown(verify.body)}`).toBe(401);
    expect(verify.body.accessToken).toBeUndefined();
    expect(verify.body.refreshToken).toBeUndefined();
  });
});

describe('(5) the stamp itself (migrations/20261001_users_sessions_ended_at.sql, endEverySessionOf)', () => {
  const stampOf = async (id: number) =>
    (await owner.query(`SELECT sessions_ended_at FROM users WHERE id = $1`, [id])).rows[0].sessions_ended_at as Date | null;

  it('a confirmed sign-up ends nothing, leaving active stamps it, and no writer moves it backwards', async () => {
    const { rows } = await owner.query(
      `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Lane Termination stamp', 'x', 'pending_verification') RETURNING id`,
      [`${TAG}-stamp-${RUN}@example.invalid`],
    );
    const id = rows[0].id as number;
    // The statement services/email-verification.ts runs when the link is followed.
    await owner.query(`UPDATE users SET status = 'active' WHERE id = $1`, [id]);
    expect(await stampOf(id), 'confirming a sign-up ended its sessions').toBeNull();
    await owner.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [id]);
    const suspended = await stampOf(id);
    expect(suspended, 'leaving active stamped nothing').not.toBeNull();
    const later = new Date(suspended!.getTime() + 86_400_000);
    await owner.query(`UPDATE users SET sessions_ended_at = $2, status = 'active' WHERE id = $1`, [id, later]);
    await owner.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [id]);
    expect((await stampOf(id))!.getTime(), 'the trigger moved the stamp backwards').toBe(later.getTime());
    const { endEverySessionOf } = await import('../../server/services/account-standing');
    const { runWithPreAuthScope } = await import('../../server/db/tenantStore');
    expect(await runWithPreAuthScope('dbste:stamp', () => endEverySessionOf(id, new Date(0)))).toBe(true);
    expect((await stampOf(id))!.getTime(), 'a sign-out everywhere moved the stamp backwards').toBe(later.getTime());
  });
});
