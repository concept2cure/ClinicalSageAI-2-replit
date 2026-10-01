/**
 * A session minted before the account's password changed is over.
 *
 * Security audit 2026-09-24, IAM-04 (High): password reset and password change
 * both stamp `users.password_changed_at`, and nothing read it on the request
 * path, so every token issued before the change kept working for the rest of
 * its life — the one moment an account holder most needs other sessions to end.
 * Plan P0-4b (2026-10-01): `users.sessions_ended_at` is the same kind of stamp
 * for a sign-out everywhere and for the account leaving 'active'; the session
 * is measured from its start (`sst`, kept through every rotation), against the
 * later of the two stamps (sessionEndedByStanding). The full posture, the routes
 * and the trigger are pinned by tests/db/session-termination.dbtest.ts.
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
  // floor(extract(epoch FROM sessions_ended_at))::bigint, likewise (P0-4b).
  sessionsEndedAtSeconds: null as string | number | null,
  // floor(extract(epoch FROM organization_users.created_at))::bigint for the organisation asked about (P0-4b R1).
  membershipBeganAtSeconds: null as string | number | null,
  queries: [] as string[],
  params: [] as unknown[][],
}));

const poolDouble = vi.hoisted(() => ({
  pool: {
    query: async (sql: string, params: unknown[] = []) => {
      state.queries.push(sql);
      state.params.push(params);
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM users/i.test(sql)) {
        return {
          rows: [
            {
              status: state.status,
              password_changed_at_seconds: state.passwordChangedAtSeconds,
              sessions_ended_at_seconds: state.sessionsEndedAtSeconds,
              ...(/FROM organization_users/i.test(sql) ? { membership_began_at_seconds: state.membershipBeganAtSeconds } : {}),
            },
          ],
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
  endingStampOf,
  isAccountActive,
  isSessionCurrent,
  issuedAtOfClaims,
  readAccountStanding,
  sessionEndedByStanding,
  sessionPredatesPasswordChange,
  sessionsEndedBeforeSecondsOf,
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
  state.sessionsEndedAtSeconds = null;
  state.membershipBeganAtSeconds = null;
  state.queries.length = 0;
  state.params.length = 0;
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

describe('sessionEndedByStanding — both stamps, measured from the session start (P0-4b)', () => {
  const standing = (changed: number | null, ended: number | null) => ({
    active: true,
    passwordChangedAtSeconds: changed,
    sessionsEndedAtSeconds: ended,
  });

  it('the later of the password change and the end of every session is the one that counts', () => {
    expect(sessionsEndedBeforeSecondsOf(standing(null, null))).toBeNull();
    expect(sessionsEndedBeforeSecondsOf(standing(2_000, null))).toBe(2_000);
    expect(sessionsEndedBeforeSecondsOf(standing(null, 3_000))).toBe(3_000);
    expect(sessionsEndedBeforeSecondsOf(standing(2_000, 3_000))).toBe(3_000);
    expect(sessionsEndedBeforeSecondsOf(standing(4_000, 3_000))).toBe(4_000);
    // A double that predates the column answers without it: no end of every session.
    expect(sessionsEndedBeforeSecondsOf({ active: true, passwordChangedAtSeconds: 2_000 } as never)).toBe(2_000);
  });

  it('a session that began before a sign-out everywhere is over, whenever its token was minted', () => {
    // Rotated in the stamp's own second: iat equals the stamp, the session began long before.
    expect(sessionEndedByStanding({ iat: 3_000, sst: 1_000 }, standing(null, 3_000))).toBe(true);
    expect(sessionEndedByStanding({ iat: 3_000, sst: 1_000 }, standing(3_000, null))).toBe(true);
    // A sign-in that follows the stamp in the same second, and one after it, are current.
    expect(sessionEndedByStanding({ iat: 3_000, sst: 3_000 }, standing(null, 3_000))).toBe(false);
    expect(sessionEndedByStanding({ iat: 3_500, sst: 3_400 }, standing(2_000, 3_000))).toBe(false);
  });

  it('a token without a session start is measured from its iat, as before', () => {
    expect(sessionEndedByStanding({ iat: 1_000 }, standing(null, 2_000))).toBe(true);
    expect(sessionEndedByStanding({ iat: 2_000 }, standing(null, 2_000))).toBe(false);
  });
});

describe('a membership begun after the session ended it in that organisation (P0-4b R1)', () => {
  const standing = (began: number | null) => ({
    active: true,
    passwordChangedAtSeconds: null,
    sessionsEndedAtSeconds: null,
    membershipBeganAtSeconds: began,
  });

  it('the start of the membership counts with the other stamps', () => {
    expect(sessionsEndedBeforeSecondsOf(standing(5_000))).toBe(5_000);
    expect(sessionsEndedBeforeSecondsOf({ ...standing(5_000), passwordChangedAtSeconds: 6_000 })).toBe(6_000);
    expect(sessionsEndedBeforeSecondsOf({ ...standing(5_000), sessionsEndedAtSeconds: 4_000 })).toBe(5_000);
  });

  it('a session older than the membership (removed and re-added) is over; the one the membership began with is current', () => {
    expect(sessionEndedByStanding({ iat: 6_000, sst: 1_000 }, standing(5_000))).toBe(true);
    // Sign-up, SSO provisioning and first-run setup create the membership and begin the session in one request.
    expect(sessionEndedByStanding({ iat: 5_000, sst: 5_000 }, standing(5_000))).toBe(false);
    expect(sessionEndedByStanding({ iat: 6_000, sst: 6_000 }, standing(5_000))).toBe(false);
  });

  it('readAccountStanding reads the membership in the same statement when an organisation is named, and only then', async () => {
    state.membershipBeganAtSeconds = '1700000900';
    expect(await readAccountStanding(42, 7)).toEqual({
      active: true,
      passwordChangedAtSeconds: null,
      sessionsEndedAtSeconds: null,
      membershipBeganAtSeconds: 1_700_000_900,
    });
    expect(state.queries.at(-1)).toMatch(/SELECT status FROM users[\s\S]*FROM organization_users/);
    expect(state.params.at(-1)).toEqual([42, 7]);
    await readAccountStanding(42);
    expect(state.queries.at(-1)).not.toMatch(/organization_users/);
    expect(state.params.at(-1)).toEqual([42]);
  });

  it('verifyLiveToken refuses an access token of a session older than its organisation membership', async () => {
    state.membershipBeganAtSeconds = String(nowSeconds() - 60);
    const outcome = await verifyLiveToken(accessTokenIssuedAt(nowSeconds() - 600)).then(
      () => 'admitted',
      (err: unknown) => (err instanceof SessionEndedError ? `refused:${err.reason}` : `error:${String(err)}`),
    );
    expect(outcome).toBe('refused:password-changed');
    expect(state.params.some((p) => p.length === 2 && p[0] === 42 && p[1] === 7)).toBe(true);
    await expect(verifyLiveToken<{ userId: string }>(accessTokenIssuedAt(nowSeconds() - 30))).resolves.toMatchObject({ userId: '42' });
  });
});

/*
 * R3 (plan P0-4b fix round): a token records its session's start to the whole
 * second, so the stamp an ending event writes is the first whole second after
 * it. Every session begun in the event's second, before it, is then before the
 * stamp; the writer answers once that second has begun, so the session that
 * follows it is not. tests/db/session-termination.dbtest.ts (6) runs both arms.
 */
describe('endingStampOf: the first whole second after an ending event (R3)', () => {
  it('rounds every instant up to the next whole second, even one exactly on a second', () => {
    expect(endingStampOf(1_700_000_000_600).getTime()).toBe(1_700_000_001_000);
    expect(endingStampOf(1_700_000_000_001).getTime()).toBe(1_700_000_001_000);
    expect(endingStampOf(1_700_000_000_000).getTime()).toBe(1_700_000_001_000);
  });

  it('ends a session begun in the event\'s own second and admits one begun in the stamp\'s', () => {
    const stamp = Math.floor(endingStampOf(2_000_600).getTime() / 1000);
    const standing = { active: true, passwordChangedAtSeconds: stamp, sessionsEndedAtSeconds: null };
    expect(sessionEndedByStanding({ iat: 2_000, sst: 2_000 }, standing)).toBe(true);
    expect(sessionEndedByStanding({ iat: 2_001, sst: 2_001 }, standing)).toBe(false);
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
    expect(await readAccountStanding(42)).toEqual({ active: true, passwordChangedAtSeconds: 1_700_000_000, sessionsEndedAtSeconds: null, membershipBeganAtSeconds: null });
    state.passwordChangedAtSeconds = 1_700_000_001;
    state.sessionsEndedAtSeconds = '1700000500';
    expect(await readAccountStanding(42)).toEqual({ active: true, passwordChangedAtSeconds: 1_700_000_001, sessionsEndedAtSeconds: 1_700_000_500, membershipBeganAtSeconds: null });
    state.passwordChangedAtSeconds = null;
    state.sessionsEndedAtSeconds = null;
    state.status = 'suspended';
    expect(await readAccountStanding(42)).toEqual({ active: false, passwordChangedAtSeconds: null, sessionsEndedAtSeconds: null, membershipBeganAtSeconds: null });
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

  it('refuses a session begun before a sign-out everywhere, even through a token rotated after it', async () => {
    const ended = nowSeconds() - 60;
    state.sessionsEndedAtSeconds = String(ended);
    const rotated = jwt.sign(
      { userId: '42', email: 'holder@example.com', organizationId: '7', role: 'user', type: 'access', iat: ended + 30, sid: 'sid-rotated', sst: ended - 600, idl: 24 * 3600 },
      secret,
      { expiresIn: '30d' },
    );
    const outcome = await verifyLiveToken(rotated).then(
      () => 'admitted',
      (err: unknown) => (err instanceof SessionEndedError ? `refused:${err.reason}` : `error:${String(err)}`),
    );
    expect(outcome).toBe('refused:password-changed');
    await expect(verifyLiveToken<{ userId: string }>(accessTokenIssuedAt(ended + 30))).resolves.toMatchObject({ userId: '42' });
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
