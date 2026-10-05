/**
 * The pre-auth scope reaches one account, not the whole of public.users (D3,
 * 2026-10-04; evidence docs/evidence/D3/2026-10-04-pre-auth-narrowing/).
 *
 * Until this change the users policy admitted the pre-auth scope (tenant '0',
 * no role) to every row, credentials included: only application code kept a
 * sign-in or token handler from another person's row
 * (docs/evidence/D3/2026-09-29-pre-auth-scope/). Now that scope reaches no row
 * until the request is bound to the one account it has established
 * (tenantStore.bindPreAuthAccount): by a verified token, or by an email or
 * reset token resolved to an id through a definer function
 * (services/auth/pre-auth-account.ts). A handler steered to another id reads
 * nothing, at the database.
 *
 * As app_service with RLS enforcing (asserted by the fixture), through the
 * production scope helpers, token verifier and definer functions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { getPool } from '../../server/db';
import { bindPreAuthAccount, runAsAccount, runWithPreAuthScope } from '../../server/db/tenantStore';
import { bindAccountByEmail, bindAccountByResetToken } from '../../server/services/auth/pre-auth-account';
import { verifyLiveToken } from '../../server/services/token-revocation';
import auditService from '../../server/services/auditService';
import {
  ORG_A,
  owner,
  userA,
  userB,
  accessToken,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const CREDENTIALS = 'id, password_hash, mfa_secret, reset_token, email_otp_hash';
let emailA = '';
let emailB = '';
const resetHashB = createHash('sha256').update(`pre-auth-narrowing-${process.pid}-${Date.now()}`).digest('hex');

const preAuth = <T>(fn: () => Promise<T>) => runWithPreAuthScope('pre-auth-narrowing.dbtest', fn);
const q = (sql: string, params: unknown[] = []) => getPool().query(sql, params);

beforeAll(async () => {
  await provisionTwoTenantFixture();
  emailA = (await owner.query('SELECT email FROM users WHERE id = $1', [userA])).rows[0].email;
  emailB = (await owner.query('SELECT email FROM users WHERE id = $1', [userB])).rows[0].email;
  await owner.query(
    "UPDATE users SET reset_token = $2, reset_token_expires_at = now() + interval '1 hour' WHERE id = $1",
    [userB, resetHashB]
  );
  // B acts once in tenant 0's trail, as a sign-in event would.
  const acted = await runAsAccount(userB, 'pre-auth-narrowing.dbtest', () =>
    auditService.logAction({
      tenantId: 0,
      userId: userB,
      action: 'user_login',
      resourceType: 'pre_auth_narrowing_contract',
      resourceId: String(userB),
      details: { description: 'a sign-in, audited under tenant 0' },
    })
  );
  expect(acted.persisted).toBe(true);
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query('UPDATE users SET reset_token = NULL, reset_token_expires_at = NULL WHERE id = $1', [userB]);
  }
  await teardownTwoTenantFixture();
});

describe('an unbound pre-auth scope reaches no account (D3)', () => {
  it('reads no row by email, by id, or by scanning', async () => {
    const [byEmail, byId, scan] = await preAuth(async () => [
      await q(`SELECT ${CREDENTIALS} FROM users WHERE email = $1`, [emailB]),
      await q(`SELECT ${CREDENTIALS} FROM users WHERE id = $1`, [userB]),
      await q('SELECT count(*)::int AS n FROM users'),
    ]);
    expect(byEmail.rows).toEqual([]);
    expect(byId.rows).toEqual([]);
    expect(scan.rows[0].n).toBe(0);
  });

  it("writes no account: B's password hash and reset token stay as they were", async () => {
    const res = await preAuth(() =>
      q("UPDATE users SET password_hash = 'x', reset_token = NULL WHERE id = $1", [userB])
    );
    expect(res.rowCount).toBe(0);
    const after = await owner.query('SELECT reset_token FROM users WHERE id = $1', [userB]);
    expect(after.rows[0].reset_token).toBe(resetHashB);
  });

  it("actor_name names nobody in a tenant-less scope, though B acted in tenant 0's trail", async () => {
    const res = await preAuth(() => q('SELECT name, email FROM public.actor_name($1)', [userB]));
    expect(res.rows).toEqual([]);
  });
});

describe('a bound pre-auth scope reaches its one account and no other (D3)', () => {
  it('a sign-in by email binds the account it names, and reads and writes that row only', async () => {
    const r = await preAuth(async () => {
      const id = await bindAccountByEmail(emailA);
      return {
        id,
        own: (await q(`SELECT ${CREDENTIALS} FROM users WHERE id = $1`, [userA])).rows.length,
        other: (await q(`SELECT ${CREDENTIALS} FROM users WHERE id = $1`, [userB])).rows.length,
        otherByEmail: (await q('SELECT id FROM users WHERE email = $1', [emailB])).rows.length,
        ownWrite: (await q('UPDATE users SET failed_login_attempts = failed_login_attempts WHERE id = $1', [userA])).rowCount,
        otherWrite: (await q('UPDATE users SET failed_login_attempts = failed_login_attempts WHERE id = $1', [userB])).rowCount,
      };
    });
    expect(r).toEqual({ id: userA, own: 1, other: 0, otherByEmail: 0, ownWrite: 1, otherWrite: 0 });
  });

  it("a verified access token binds its account: the request cannot then read another's row", async () => {
    const r = await preAuth(async () => {
      await verifyLiveToken(accessToken(userA, ORG_A, 'member'));
      return {
        own: (await q('SELECT id FROM users WHERE id = $1', [userA])).rows.length,
        other: (await q(`SELECT ${CREDENTIALS} FROM users WHERE id = $1`, [userB])).rows.length,
      };
    });
    expect(r).toEqual({ own: 1, other: 0 });
  });

  it('a request bound to one account cannot be rebound to another', async () => {
    await expect(
      preAuth(async () => {
        bindPreAuthAccount(userA);
        bindPreAuthAccount(userB);
      })
    ).rejects.toThrow(/already bound to another account/);
  });

  it('a reset finds the account holding the token, and only by its hash', async () => {
    const r = await preAuth(async () => ({
      unknown: await runWithPreAuthScope('pre-auth-narrowing.dbtest', () => bindAccountByResetToken('0'.repeat(64))),
      holder: await bindAccountByResetToken(resetHashB),
      row: (await q('SELECT id FROM users WHERE id = $1', [userB])).rows.length,
    }));
    expect(r).toEqual({ unknown: null, holder: userB, row: 1 });
  });
});
