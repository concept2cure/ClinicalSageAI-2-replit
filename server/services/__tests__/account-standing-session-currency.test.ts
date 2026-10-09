/**
 * A session minted before the account's password changed is over.
 *
 * Security audit 2026-09-24, IAM-04 (High): password reset and password change
 * both stamp `users.password_changed_at`, and nothing read it on the request
 * path, so every token issued before the change kept working for the rest of
 * its life — the one moment an account holder most needs other sessions to end.
 * There is no session-version column (plan P0-4b); the token's `iat` against
 * `password_changed_at` is the versioning the schema already carries.
 *
 * The rule lives beside the account-standing read (services/account-standing.ts)
 * so the one statement that answers "can this account act?" also answers "is
 * this session still the account's?". The pool is a double keyed on the
 * statement, as every request-path test double in this repository keys on it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const state = vi.hoisted(() => ({
  status: 'active' as string,
  // What PostgreSQL returns for floor(extract(epoch FROM password_changed_at))::bigint:
  // a string (pg leaves bigint as text), or null when never changed.
  passwordChangedAtSeconds: null as string | number | null,
  queries: [] as string[],
}));

const poolDouble = vi.hoisted(() => ({
  pool: {
    query: async (sql: string) => {
      state.queries.push(sql);
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM users/i.test(sql)) {
        return {
          rows: [{ status: state.status, password_changed_at_seconds: state.passwordChangedAtSeconds }],
          rowCount: 1,
        };
      }
      throw new Error(`unmodelled pool query: ${sql}`);
    },
  },
}));
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);

import {
  isAccountActive,
  isSessionCurrent,
  issuedAtOfClaims,
  readAccountStanding,
  sessionPredatesPasswordChange,
} from '../account-standing';
import { verifyLiveToken, SessionEndedError } from '../token-revocation';

const secret = process.env.JWT_SECRET as string;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const accessTokenIssuedAt = (iat: number) =>
  // exp is measured from the iat given, so a session issued long ago needs a
  // long life to still be valid on signature: what is under test is the rule,
  // not expiry.
  // The session claims (P1-1) give the token the widest idle window, so the idle rule does not answer before the rule under test.
  jwt.sign({ userId: '42', email: 'holder@example.com', organizationId: '7', role: 'user', type: 'access', iat, sid: `sid-${iat}-${Math.random()}`, sst: iat, idl: 24 * 3600 }, secret, {
    expiresIn: '30d',
  });

beforeEach(() => {
  state.status = 'active';
  state.passwordChangedAtSeconds = null;
  state.queries.length = 0;
});

describe('sessionPredatesPasswordChange — the rule', () => {
  it('a session issued before the change predates it; at or after does not', () => {
    expect(sessionPredatesPasswordChange(1_000, 2_000)).toBe(true);
    expect(sessionPredatesPasswordChange(2_000, 2_000)).toBe(false); // same second: the sign-in that follows the change
    expect(sessionPredatesPasswordChange(3_000, 2_000)).toBe(false);
  });

  it('an account that never changed its password ends no session', () => {
    expect(sessionPredatesPasswordChange(1_000, null)).toBe(false);
    expect(sessionPredatesPasswordChange(null, null, 'development')).toBe(false);
  });

  it('a token with no iat is refused in production only (no first-party issuer omits it; test fixtures do)', () => {
    expect(sessionPredatesPasswordChange(null, 2_000, 'production')).toBe(true);
    expect(sessionPredatesPasswordChange(null, null, 'production')).toBe(true);
    expect(sessionPredatesPasswordChange(null, 2_000, 'development')).toBe(false);
    expect(sessionPredatesPasswordChange(null, 2_000, 'test')).toBe(false);
  });
});

describe('issuedAtOfClaims', () => {
  it('reads a numeric iat as whole seconds and nothing else', () => {
    expect(issuedAtOfClaims({ iat: 1_700_000_000 })).toBe(1_700_000_000);
    expect(issuedAtOfClaims({ iat: 1_700_000_000.9 })).toBe(1_700_000_000);
    expect(issuedAtOfClaims({ iat: '1700000000' })).toBeNull();
    expect(issuedAtOfClaims({})).toBeNull();
    expect(issuedAtOfClaims(null)).toBeNull();
  });
});

describe('readAccountStanding — one statement, both answers', () => {
  it('returns the status and the password-change second, parsing the bigint pg hands back as text', async () => {
    state.passwordChangedAtSeconds = '1700000000';
    expect(await readAccountStanding(42)).toEqual({ active: true, passwordChangedAtSeconds: 1_700_000_000 });
    state.passwordChangedAtSeconds = 1_700_000_001;
    expect(await readAccountStanding(42)).toEqual({ active: true, passwordChangedAtSeconds: 1_700_000_001 });
    state.passwordChangedAtSeconds = null;
    state.status = 'suspended';
    expect(await readAccountStanding(42)).toEqual({ active: false, passwordChangedAtSeconds: null });
  });

  it('keeps the statement the request-path doubles recognise, and isAccountActive stays a boolean', async () => {
    expect(await isAccountActive(42)).toBe(true);
    expect(state.queries.some(sql => /SELECT status FROM users/.test(sql))).toBe(true);
  });
});

describe('isSessionCurrent', () => {
  it('is false for a session issued before the password change and true after', async () => {
    const changed = nowSeconds() - 60;
    state.passwordChangedAtSeconds = String(changed);
    expect(await isSessionCurrent(42, changed - 3600)).toBe(false);
    expect(await isSessionCurrent(42, changed + 1)).toBe(true);
  });
});

describe('verifyLiveToken refuses a session the password change ended', () => {
  it('throws SessionEndedError for an access token whose iat precedes password_changed_at', async () => {
    const changed = nowSeconds() - 60;
    state.passwordChangedAtSeconds = String(changed);
    const stale = accessTokenIssuedAt(changed - 3600);

    const outcome = await verifyLiveToken(stale).then(
      () => 'admitted',
      (err: unknown) => (err instanceof SessionEndedError ? `refused:${err.reason}` : `error:${String(err)}`),
    );

    expect(outcome).toBe('refused:password-changed');
  });

  it('admits an access token issued after the change, and one for an account that never changed its password', async () => {
    const changed = nowSeconds() - 3600;
    state.passwordChangedAtSeconds = String(changed);
    await expect(verifyLiveToken<{ userId: string }>(accessTokenIssuedAt(changed + 60))).resolves.toMatchObject({ userId: '42' });

    state.passwordChangedAtSeconds = null;
    // Within the 12-hour session lifetime (P1-1); the age is not what this case is about.
    await expect(verifyLiveToken<{ userId: string }>(accessTokenIssuedAt(nowSeconds() - 3600))).resolves.toMatchObject({ userId: '42' });
  });

  it('still refuses an account out of use, whichever way its session was issued (F-29 unchanged)', async () => {
    state.status = 'inactive';
    const outcome = await verifyLiveToken(accessTokenIssuedAt(nowSeconds())).then(
      () => 'admitted',
      (err: unknown) => (err instanceof SessionEndedError ? `refused:${err.reason}` : `error:${String(err)}`),
    );
    expect(outcome).toBe('refused:account-inactive');
  });
});
