/**
 * The re-authentication every high-risk governed action runs — the release
 * signature on an eCTD sequence, CMC batch release, Module 3 approval, 510(k)
 * eSTAR filing, gateway transmittal — must require the signer's second factor
 * when one is enrolled, as the QMS approval and /api/esignature/sign already do.
 *
 * verifyReauth checked the password and verified a TOTP only when the caller
 * chose to send one, so a signer who had enrolled an authenticator could sign
 * with the password alone. Found by the OQ run in which the second signer had a
 * TOTP factor enrolled (as every production signer signs in with one): the QMS
 * approval refused the password-only signature with MFA_TOKEN_REQUIRED, while
 * POST /api/c2c/actions/sign accepted it.
 *
 * Five callers record the Part 11 row's factors from the request ("password+totp"
 * whenever a code is present), so a code that is presented must also verify —
 * even for a signer with no factor enrolled, where the canonical re-verification
 * does not look at it. Both rules are pinned here.
 */
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  hash: '' as string | null,
  mfaEnabled: false as boolean | Error,
  validCode: '246810',
  /** users.status: 'active', or how the account was taken out of use. */
  status: 'active',
}));

vi.mock('../../../db.js', () => ({
  pool: {
    query: async (sql: string) =>
      /password_hash/.test(sql)
        ? { rows: h.hash ? [{ password_hash: h.hash }] : [] }
        : /SELECT status FROM users/.test(sql)
          ? { rows: [{ status: h.status }] }
          : { rows: [] },
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
  },
}));
// The account's lockout (auth-security-service). Before F-30 an unreadable
// lockout read as "not locked", so this file never had to model it; the
// lockout itself is pinned by tests/db/signing-lockout.dbtest.ts.
vi.mock('../../../services/auth-security-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/auth-security-service.js')>()),
  isAccountLocked: async () => ({ locked: false }),
  recordFailedLogin: async () => ({ locked: false, remainingAttempts: 5 }),
}));
vi.mock('../../../services/mfaService.js', () => ({
  verifyToken: vi.fn(async (_userId: number, code: string) => code === h.validCode),
  isMfaEnabled: vi.fn(async () => {
    if (h.mfaEnabled instanceof Error) throw h.mfaEnabled;
    return h.mfaEnabled;
  }),
}));

import { verifyReauth } from '../actions.js';

const PASSWORD = 'correct horse battery staple';

beforeEach(() => {
  h.hash = bcrypt.hashSync(PASSWORD, 4);
  h.mfaEnabled = false;
  h.status = 'active';
});

describe('an account taken out of use (VSR-001 F-28)', () => {
  it('cannot sign a governed action, with the right password and code', async () => {
    h.mfaEnabled = true;
    for (const status of ['suspended', 'inactive']) {
      h.status = status;
      expect(await verifyReauth(7, { password: PASSWORD, totp: h.validCode })).toEqual({
        ok: false,
        error: 'REAUTH_ACCOUNT_INACTIVE',
      });
    }
  });
});

describe('a signer with a second factor enrolled', () => {
  beforeEach(() => {
    h.mfaEnabled = true;
  });

  it('cannot sign with the password alone', async () => {
    expect(await verifyReauth(7, { password: PASSWORD })).toEqual({ ok: false, error: 'REAUTH_TOTP_REQUIRED' });
  });

  it('signs with the password and a current code', async () => {
    expect(await verifyReauth(7, { password: PASSWORD, totp: h.validCode })).toEqual({ ok: true });
  });

  it('is refused with a wrong code', async () => {
    expect(await verifyReauth(7, { password: PASSWORD, totp: '000000' })).toEqual({ ok: false, error: 'REAUTH_TOTP_INVALID' });
  });

  it('is refused, not waved through, when the enrolment state cannot be read', async () => {
    h.mfaEnabled = new Error('users table unreachable');
    expect(await verifyReauth(7, { password: PASSWORD, totp: h.validCode })).toEqual({
      ok: false,
      error: 'REAUTH_MFA_STATE_UNKNOWN',
    });
  });
});

describe('a signer with no second factor enrolled', () => {
  it('signs with the password alone', async () => {
    expect(await verifyReauth(7, { password: PASSWORD })).toEqual({ ok: true });
  });

  it('is refused when it presents a code that does not verify — callers record a present code as verified', async () => {
    expect(await verifyReauth(7, { password: PASSWORD, totp: '000000' })).toEqual({ ok: false, error: 'REAUTH_TOTP_INVALID' });
  });
});

describe('the first factor', () => {
  it('is required', async () => {
    expect(await verifyReauth(7, {})).toEqual({ ok: false, error: 'REAUTH_PASSWORD_REQUIRED' });
    expect(await verifyReauth(7, undefined)).toEqual({ ok: false, error: 'REAUTH_PASSWORD_REQUIRED' });
  });

  it('must verify', async () => {
    expect(await verifyReauth(7, { password: 'wrong' })).toEqual({ ok: false, error: 'REAUTH_PASSWORD_INVALID' });
  });

  it('is refused the same way when the signer has no stored password', async () => {
    h.hash = null;
    expect(await verifyReauth(7, { password: PASSWORD })).toEqual({ ok: false, error: 'REAUTH_PASSWORD_INVALID' });
  });
});
