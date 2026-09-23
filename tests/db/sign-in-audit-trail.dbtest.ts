/**
 * F-19: a sign-in reaches the audit trail under the only RLS posture production
 * accepts.
 *
 * ── The defect this pins (reproduced 2026-09-23, before the fix) ─────────────
 * Every /api/auth request runs in the pre-auth scope (tenant '0', no role;
 * server/bootstrap/register-platform-routes.ts). The authentication audit
 * helper wrote each event's row from that scope. audit_logs' tenant isolation
 * policy admits a row only for the scope's own tenant, so every event that
 * names the user's organisation was refused:
 *
 *     new row violates row-level security policy for table "audit_logs"
 *
 * The helper swallows a refusal by design, so an audit outage never locks a
 * user out. The events lost that way were:
 *   - `user_login_mfa_challenge`, issued on every password sign-in outside
 *     development (email OTP by default, TOTP when enrolled);
 *   - `user_login` failure for a wrong password on a real account;
 *   - `user_logout` for a session that ended.
 *
 * POST /api/auth/mfa/verify wrote no event at all: neither the wrong code nor
 * the session it issued. Under RLS_ENFORCE=on a sign-in therefore left no
 * audit record, although the helper's own docstring cites §11.10(e) for every
 * login attempt. The first OQ execution with production authentication found
 * it (VSR-001 §13, F-19): 6 of 6 challenge rows refused, 0 rows.
 *
 * Writing each row in the scope of the tenant it names is the fix, and it makes
 * the source of that name a security boundary. /logout read it from a token it
 * only decoded, so a forged token could have written into any organisation's
 * chain. Its claims now count only when the server signed the token.
 *
 * ── Posture: production's, not a copy of it ─────────────────────────────────
 * The same posture as signup-launch-catalog.dbtest.ts:
 *   - production's own registerPlatformRoutes mounts /api/auth behind its own
 *     pre-auth scope;
 *   - server/db connects as a freshly minted non-superuser, NOBYPASSRLS runtime
 *     role through APP_DATABASE_URL, with app.rls_enforce=on;
 *   - the user enrols TOTP through the mfaService functions that
 *     /api/auth/mfa/setup and /enable call;
 *   - nothing in the login or verify handlers is stubbed.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtsi": organisation 91800 (range 91800–91849); every email starts
 * `dbtsi-`. Every audit row this file causes belongs to tenant 91800, which
 * only this lane uses. They are removed through the documented archive door
 * (`app.audit_archive_bypass`), so no other tenant's chain is touched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const ORG = 91800;
const TAG = 'dbtsi';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtsi-sign-in-audit-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtsi_rt_${RUN}` });

const EMAIL = `${TAG}-user-${RUN}@example.invalid`;
const PASSWORD = 'Dbtsi-Sign-In-Audit-2026!';
const EXTERNAL_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

let owner: Pool;
let runtime: Runtime;
let app: express.Express;
let userId: number;
let secret: string;

/** The audit rows tenant ORG holds for `action`, oldest first. */
async function auditRows(action: string) {
  const { rows } = await owner.query(
    `SELECT action, tenant_id, record_id, new_values, sha256_chain
       FROM audit_logs WHERE tenant_id = $1 AND action = $2 ORDER BY chain_seq`,
    [ORG, action],
  );
  return rows as Array<{
    action: string;
    tenant_id: number;
    record_id: string;
    new_values: { outcome?: string; reason?: string } | null;
    sha256_chain: string | null;
  }>;
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

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();

  // 1. The non-superuser runtime role, minted by the real provisioning script.
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
  if (provisioned!.skipped) throw new Error('[dbtsi] provisionAppServiceRole skipped — no runtime role.');

  // 2. Route server/db through it before server/db/runtime.ts is first imported.
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  // Production signs in with MFA; the development shortcut must not be reachable.
  process.env.ALLOW_DEV_AUTH = '0';
  process.env.MFA_ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || 'dbtsi-mfa-encryption-key-at-least-32-chars';
  for (const key of EXTERNAL_KEYS) delete process.env[key];

  runtime = await import('../../server/db/runtime');

  // 3. The app, mounted by production's own route registration.
  const { registerPlatformRoutes } = await import('../../server/bootstrap/register-platform-routes');
  app = express();
  app.use(express.json());
  await registerPlatformRoutes({
    app,
    pool: runtime.getPool(),
    authMiddleware: (_req, res) => {
      res.status(401).json({ error: 'dbtsi: the global gate was reached; /api/auth must not reach it' });
    },
  });

  // 4. One organisation, one member, as a creating transaction would write them.
  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
     VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [ORG, `${TAG}-${ORG}-${RUN}`],
  );
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, default_organization_id)
     VALUES ($1, 'Lane Sign-In', $2, $3) RETURNING id`,
    [EMAIL, await bcrypt.hash(PASSWORD, 4), ORG],
  );
  userId = user.rows[0].id;
  await owner.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`, [
    ORG,
    userId,
  ]);

  // 5. TOTP enrolment through the functions /api/auth/mfa/setup and /enable call,
  //    in the member's own scope, as those authenticated routes run.
  const mfa = await import('../../server/services/mfaService');
  await runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: 'dbtsi:enrol' }, async () => {
    secret = (await mfa.generateSecret(userId, EMAIL)).secret;
    const enabled = await mfa.enableMfa(userId, totp(secret));
    if (!enabled.success) throw new Error('[dbtsi] TOTP enrolment was refused');
  });
}, 180_000);

afterAll(async () => {
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbtsi] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbtsi] runtime role left behind:', (err as Error).message);
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
    // Under RLS_ENFORCE=on the pool refuses a query with no scope, so this runs as a member would.
    const { rows } = await runWithTenantScope(
      { tenantId: String(ORG), role: 'admin', source: 'test', caller: 'dbtsi:posture' },
      () =>
        runtime.getPool().query(
          `SELECT current_user AS role, r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce', true) AS rls
             FROM pg_roles r WHERE r.rolname = current_user`,
        ),
    );
    expect(rows[0]).toMatchObject({ role: runtimeRole, rolsuper: false, rolbypassrls: false, rls: 'on' });
  });
});

describe('a sign-in reaches the audit trail under RLS', () => {
  let challengeId: string;
  let accessToken: string;

  it('records the MFA challenge a password sign-in issues, against the organisation', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    challengeId = res.body.challengeId;

    const rows = await auditRows('user_login_mfa_challenge');
    expect(rows, 'the challenge event was refused by the audit_logs policy and swallowed').toHaveLength(1);
    expect(rows[0]).toMatchObject({ record_id: String(userId), new_values: { outcome: 'success', reason: 'mfa_challenge_totp' } });
    expect(rows[0].sha256_chain).toBeTruthy();
  });

  it('records a wrong authenticator code', async () => {
    const good = totp(secret, Date.now() + 30_000);
    const wrong = good === '000000' ? '111111' : '000000';
    const res = await request(app).post('/api/auth/mfa/verify').send({ challengeId, code: wrong, method: 'totp' });
    expect(res.status).toBe(401);

    const rows = await auditRows('user_login_mfa_failed');
    expect(rows, '/mfa/verify recorded nothing for a wrong code').toHaveLength(1);
    expect(rows[0]).toMatchObject({ record_id: String(userId), new_values: { outcome: 'failure', reason: 'invalid_code' } });
  });

  it('records the session /mfa/verify issues', async () => {
    // The next step's code: inside the server's window, and never the code the
    // enrolment already presented (RFC 6238 §5.2).
    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ challengeId, code: totp(secret, Date.now() + 30_000), method: 'totp' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    accessToken = res.body.accessToken;

    const rows = (await auditRows('user_login')).filter((r) => r.new_values?.outcome === 'success');
    expect(rows, '/mfa/verify issued a session and recorded nothing').toHaveLength(1);
    expect(rows[0]).toMatchObject({ record_id: String(userId), new_values: { reason: 'mfa_verified' } });
  });

  it('records a wrong password on a real account, against its organisation', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'not-the-password' });
    expect(res.status).toBe(401);

    const rows = (await auditRows('user_login')).filter((r) => r.new_values?.outcome === 'failure');
    expect(rows, 'the failed attempt on a real account was refused by the audit_logs policy').toHaveLength(1);
    expect(rows[0]).toMatchObject({ record_id: String(userId), new_values: { reason: 'wrong_password' } });
  });

  it('does not let a token the server never signed write into the organisation chain', async () => {
    // The logout event is written in the scope of the tenant it names, so the
    // name must come from a token the server signed, not from whoever sent one.
    const forged = jwt.sign(
      { userId: String(userId), organizationId: String(ORG), email: EMAIL, type: 'access' },
      'not-this-server-secret-but-long-enough-to-sign',
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${forged}`).send({});
    expect(res.status).toBe(200);

    expect(await auditRows('user_logout'), 'a forged token wrote into the organisation audit chain').toHaveLength(0);
  });

  it('records the end of a session the server issued, against its organisation', async () => {
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(200);

    const rows = await auditRows('user_logout');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ record_id: String(userId), new_values: { outcome: 'success' } });
  });

  it('keeps the organisation chain verifiable end to end', async () => {
    // chain_seq orders the whole table, not one tenant: the anonymous logout
    // above is interleaved. The organisation's chain is its hash links, so the
    // product's own verifier walks them.
    const { verifyAuditChain } = await import('../../server/services/audit/chain');
    const client = await owner.connect();
    try {
      const verdict = await verifyAuditChain(client, { tenantId: ORG });
      expect(verdict).toMatchObject({ ok: true, rowsChecked: 5, sequencedRows: 5 });
    } finally {
      client.release();
    }
  });
});
