/**
 * A tenant scope sees, and writes, only its own organization's users
 * (D3, 2026-09-28; evidence docs/evidence/D3/2026-09-28-users-rls/).
 *
 * public.users holds every account's password_hash, mfa_secret,
 * mfa_backup_codes, reset_token and email_otp_hash. It carried no row-level
 * security, so any statement running as app_service in tenant A's request scope
 * read tenant B's credentials, and could rewrite them.
 *
 * The policy reads membership (public.organization_users), the row that already
 * decides tenancy: a tenant scope reaches a user only through a membership in
 * its own organization. The two tenant-less scopes keep the whole table, because
 * the work they do precedes any tenant: the pre-auth scope (sign-in by email,
 * password reset, email OTP, token refresh) and the system scope (SCIM,
 * platform user administration).
 *
 * Every statement runs through the application pool (app_service, RLS
 * enforcing, asserted by the fixture). The route cases go through production's
 * own mounts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// tenant-users mails the invitation: observed here, never sent.
vi.mock('../../server/services/emailService', async importOriginal => ({
  ...(await importOriginal<typeof import('../../server/services/emailService')>()),
  isEmailConfigured: () => false,
}));
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { bindAccountByEmail } from '../../server/services/auth/pre-auth-account';
import {
  runWithPreAuthScope,
  runWithSystemTenantScope,
  runWithTenantScope,
} from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import tenantUsers from '../../server/routes/tenant-users';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  userA,
  userB,
  accessToken,
  auth,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const CREDENTIALS =
  'id, email, password_hash, mfa_secret, mfa_backup_codes, reset_token, email_otp_hash';

let emailB = '';
let unaffiliated = 0; // a user with no membership anywhere yet
let adminA = 0; // an administrator of A
let app: express.Express;

beforeAll(async () => {
  await provisionTwoTenantFixture();
  emailB = (await owner.query('SELECT email FROM users WHERE id = $1', [userB])).rows[0].email;
  // Something worth stealing on B's row.
  await owner.query(
    `UPDATE users SET mfa_secret = 'B-TOTP-SECRET', reset_token = 'B-RESET-TOKEN',
            email_otp_hash = 'B-OTP-HASH', mfa_backup_codes = '["B-BACKUP"]'::json
      WHERE id = $1`,
    [userB]
  );
  const u = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'users-rls unaffiliated', 'x')
     RETURNING id`,
    [`${TAG}-unaffiliated@example.invalid`]
  );
  unaffiliated = Number(u.rows[0].id);
  adminA = await provisionMember(ORG_A, 'admin', 'users-rls-admin-a');

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/tenant-users', tenantUsers);
}, 60_000);

afterAll(async () => {
  if (owner && unaffiliated) {
    await owner.query('DELETE FROM organization_users WHERE user_id = $1', [unaffiliated]);
    await owner.query('DELETE FROM users WHERE id = $1', [unaffiliated]);
  }
  await teardownTwoTenantFixture();
});

/** One statement in tenant A's request scope, as a plain member. */
function asA(sql: string, params: unknown[] = []) {
  return runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'users-rls.dbtest' },
    () => getPool().query(sql, params)
  );
}
function asPreAuth(sql: string, params: unknown[] = []) {
  return runWithPreAuthScope('users-rls.dbtest', () => getPool().query(sql, params));
}
function asPlatform(sql: string, params: unknown[] = []) {
  return runWithSystemTenantScope('users-rls.dbtest', () => getPool().query(sql, params));
}

/**
 * rowCount of a write, a refusal counted as nothing written. A foreign-key
 * refusal (23503) counts as one: the row was reached, and only a reference
 * held elsewhere kept it.
 */
async function written(run: () => Promise<{ rowCount: number | null }>): Promise<number> {
  try {
    return (await run()).rowCount ?? 0;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42501') return 0;
    if (code === '23503') return 1;
    throw err;
  }
}

describe("tenant A's scope cannot reach tenant B's users (D3)", () => {
  it("reads none of B's user rows, by id, by email, or by scanning", async () => {
    const byId = await asA(`SELECT ${CREDENTIALS} FROM users WHERE id = $1`, [userB]);
    const byEmail = await asA(`SELECT ${CREDENTIALS} FROM users WHERE email = $1`, [emailB]);
    const scan = await asA(`SELECT ${CREDENTIALS} FROM users WHERE mfa_secret = 'B-TOTP-SECRET'`);
    expect(
      { byId: byId.rows, byEmail: byEmail.rows, scan: scan.rows },
      "A's scope read B's credentials"
    ).toEqual({ byId: [], byEmail: [], scan: [] });
  });

  it("cannot rewrite B's password hash, MFA secret or reset token, nor delete B's user", async () => {
    const updated = await written(() =>
      asA(
        `UPDATE users SET password_hash = 'attacker', mfa_secret = NULL, reset_token = 'known'
          WHERE id = $1`,
        [userB]
      )
    );
    const deleted = await written(() => asA('DELETE FROM users WHERE id = $1', [userB]));
    expect({ updated, deleted }).toEqual({ updated: 0, deleted: 0 });
    const { rows } = await owner.query(
      'SELECT password_hash, mfa_secret, reset_token FROM users WHERE id = $1',
      [userB]
    );
    expect(rows[0]).toEqual({
      password_hash: 'not-a-real-password',
      mfa_secret: 'B-TOTP-SECRET',
      reset_token: 'B-RESET-TOKEN',
    });
  });
});

describe('what a tenant scope still reaches (D3)', () => {
  it("reads its own organization's members, the caller included", async () => {
    const { rows } = await asA('SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id', [
      [userA, userB],
    ]);
    expect(rows.map(r => Number(r.id))).toEqual([userA]);
  });

  it("updates its own member's profile", async () => {
    expect(
      await written(() => asA("UPDATE users SET title = 'users-rls' WHERE id = $1", [userA]))
    ).toBe(1);
  });

  it('INSERT … RETURNING of a non-member is refused, so tenant-users takes the id first', async () => {
    // RETURNING is held to the SELECT policy, and the new row has no membership
    // yet. atomicCreateUser therefore draws the id from the sequence and
    // inserts it explicitly (server/services/atomicQuotaService.js).
    const email = `${TAG}-returning@example.invalid`;
    try {
      await expect(
        asA(
          `INSERT INTO users (email, name, password_hash) VALUES ($1, 'returning', 'x') RETURNING id`,
          [email]
        )
      ).rejects.toMatchObject({ code: '42501' });
      expect((await owner.query('SELECT 1 FROM users WHERE email = $1', [email])).rows).toEqual([]);
    } finally {
      await owner.query('DELETE FROM users WHERE email = $1', [email]);
    }
  });

  it('user_id_for_email answers an existing account’s id, and nothing else', async () => {
    const { rows } = await asA('SELECT * FROM public.user_id_for_email($1)', [emailB]);
    expect(rows).toEqual([{ user_id_for_email: userB }]);
    const none = await asA('SELECT public.user_id_for_email($1) AS id', [
      `${TAG}-nobody@example.invalid`,
    ]);
    expect(none.rows).toEqual([{ id: null }]);
  });
});

describe('the tenant-less scopes: pre-auth reaches only its bound account, the system scope the whole table (D3)', () => {
  // Until 2026-10-04 the pre-auth scope read and wrote every row here. It now
  // reaches none until the request is bound to one account
  // (tenantStore.bindPreAuthAccount; docs/evidence/D3/2026-10-04-pre-auth-narrowing/,
  // whose own contract is tests/db/pre-auth-narrowing.dbtest.ts).
  it('pre-auth, unbound: no account is read or written, by email or by id', async () => {
    const { rows } = await asPreAuth(`SELECT ${CREDENTIALS} FROM users WHERE email = $1`, [emailB]);
    expect(rows).toEqual([]);
    expect(
      await written(() =>
        asPreAuth('UPDATE users SET failed_login_attempts = failed_login_attempts WHERE id = $1', [userB])
      )
    ).toBe(0);
  });

  it('pre-auth, bound: the sign-in finds its account by email and writes its counters', async () => {
    const { rows, n } = await runWithPreAuthScope('users-rls.dbtest', async () => {
      const id = await bindAccountByEmail(emailB);
      const read = await getPool().query(`SELECT ${CREDENTIALS} FROM users WHERE id = $1`, [id]);
      const w = await written(() =>
        getPool().query('UPDATE users SET failed_login_attempts = failed_login_attempts WHERE id = $1', [userB])
      );
      return { rows: read.rows, n: w };
    });
    expect(rows.map(r => Number(r.id))).toEqual([userB]);
    expect(n).toBe(1);
  });

  it('system: SCIM and platform administration read and write every tenant’s users', async () => {
    const { rows } = await asPlatform(
      'SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id',
      [[userA, userB, unaffiliated]]
    );
    expect(rows.map(r => Number(r.id))).toEqual([userA, userB, unaffiliated].sort((a, b) => a - b));
    expect(
      await written(() => asPlatform("UPDATE users SET status = 'active' WHERE id = $1", [userB]))
    ).toBe(1);
  });
});

describe('user administration through tenant-users, in the tenant scope (D3)', () => {
  /** Everything a create left behind for this address. */
  async function removeCreated(email: string): Promise<void> {
    const ids = `(SELECT id FROM users WHERE email = $1)`;
    await owner.query(`DELETE FROM organization_users WHERE user_id IN ${ids}`, [email]);
    await owner
      .query(`DELETE FROM user_invitation_tokens WHERE user_id IN ${ids}`, [email])
      .catch(() => undefined);
    await owner
      .query('DELETE FROM organization_invitations WHERE lower(email) = lower($1)', [email])
      .catch(() => undefined);
    await owner.query('DELETE FROM users WHERE email = $1', [email]).catch(() => undefined);
  }

  it('an administrator creates a new member, and the setup token is stored on the account', async () => {
    const email = `${TAG}-new-member@example.invalid`;
    try {
      const res = await request(app)
        .post('/api/tenant-users')
        .set(auth(accessToken(adminA, ORG_A, 'admin')))
        .send({ organizationId: ORG_A, email, name: 'New member', role: 'member' });
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(201);
      const { rows } = await owner.query(
        `SELECT ou.organization_id, ou.role, u.reset_token IS NOT NULL AS has_setup_token
           FROM users u JOIN organization_users ou ON ou.user_id = u.id WHERE u.email = $1`,
        [email]
      );
      expect(rows).toEqual([{ organization_id: ORG_A, role: 'member', has_setup_token: true }]);
      expect(res.body.invitation?.delivery).toBe('link');
    } finally {
      await removeCreated(email);
    }
  });

  it("adding another tenant's account asks for its consent instead of failing or duplicating it", async () => {
    try {
      const res = await request(app)
        .post('/api/tenant-users')
        .set(auth(accessToken(adminA, ORG_A, 'admin')))
        .send({ organizationId: ORG_A, email: emailB, name: 'B, invited', role: 'member' });
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(202);
      expect(res.body.pendingInvitation).toBe(true);
      // The response names no credential and no other column of B's account.
      expect(JSON.stringify(res.body)).not.toMatch(/B-TOTP-SECRET|B-RESET-TOKEN|B-OTP-HASH/);
      const { rows } = await owner.query(
        'SELECT user_id, status FROM organization_invitations WHERE organization_id = $1 AND lower(email) = lower($2)',
        [ORG_A, emailB]
      );
      expect(rows).toEqual([{ user_id: userB, status: 'pending' }]);
    } finally {
      await owner
        .query(
          'DELETE FROM organization_invitations WHERE organization_id = $1 AND lower(email) = lower($2)',
          [ORG_A, emailB]
        )
        .catch(() => undefined);
    }
  });

  it('an administrator of both organizations lists and invites into the one they are not signed into', async () => {
    const email = `${TAG}-added-to-b@example.invalid`;
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [ORG_B, adminA]
    );
    try {
      const list = await request(app)
        .get(`/api/tenant-users/${ORG_B}`)
        .set(auth(accessToken(adminA, ORG_A, 'admin')));
      expect(list.status).toBe(200);
      expect((list.body as Array<{ id: number }>).map(r => Number(r.id)).sort()).toEqual(
        [userB, adminA].sort((a, b) => a - b)
      );

      const res = await request(app)
        .post('/api/tenant-users')
        .set(auth(accessToken(adminA, ORG_A, 'admin')))
        .send({ organizationId: ORG_B, email, name: 'Added to B', role: 'member' });
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(201);
      // SMTP is off here, so a stored token is handed back as a link; 'failed'
      // is what the session organization's scope produced (nothing stored).
      expect(res.body.invitation?.delivery).toBe('link');
      const { rows } = await owner.query(
        `SELECT ou.organization_id, u.reset_token IS NOT NULL AS has_setup_token
           FROM users u JOIN organization_users ou ON ou.user_id = u.id WHERE u.email = $1`,
        [email]
      );
      expect(rows).toEqual([{ organization_id: ORG_B, has_setup_token: true }]);
    } finally {
      await removeCreated(email);
      await owner.query(
        'DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2',
        [ORG_B, adminA]
      );
    }
  });
});
