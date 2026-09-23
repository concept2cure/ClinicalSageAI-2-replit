/**
 * mfaEnrolmentOf — the one reading of an account's second factor that the
 * sign-in challenge, the session, /mfa/verify and /api/users/me all report
 * (VSR-001 §13.3 item 4). The route-level proof, on real PostgreSQL, is
 * tests/db/sign-in-posture.dbtest.ts.
 */
import { describe, expect, it } from 'vitest';
import { mfaEnrolmentOf, sessionMfaFields } from '../mfa-enrolment';

const TOTP = [{ type: 'totp', isEnabled: true, isPrimary: true }];
const EMAIL = [{ type: 'email', isEnabled: true, isPrimary: true }];

describe('mfaEnrolmentOf', () => {
  it('an enrolled, confirmed authenticator: sign-in asks for it, and the account says so', () => {
    expect(mfaEnrolmentOf({ mfaEnabled: true, mfaMethod: 'totp' })).toEqual({
      mfaEnabled: true,
      signInFactor: 'totp',
      mfaMethods: TOTP,
    });
  });

  it.each([
    ['never enrolled (column default email)', { mfaEnabled: false, mfaMethod: 'email' }],
    ['setup started, not confirmed (generateSecret sets totp first)', { mfaEnabled: false, mfaMethod: 'totp' }],
    ['disabled (disableMfa leaves totp)', { mfaEnabled: false, mfaMethod: 'totp' }],
    ['enrolment state unread', {}],
    ['enabled with no method recorded', { mfaEnabled: true, mfaMethod: null }],
    ['enabled with a method that is not the authenticator', { mfaEnabled: true, mfaMethod: 'email' }],
  ])('%s: the emailed code, and no authenticator claimed', (_what, row) => {
    expect(mfaEnrolmentOf(row)).toEqual({ mfaEnabled: false, signInFactor: 'email', mfaMethods: EMAIL });
  });

  it('only a literal true enables: a truthy non-boolean does not', () => {
    expect(mfaEnrolmentOf({ mfaEnabled: 'true' as unknown as boolean, mfaMethod: 'totp' }).mfaEnabled).toBe(false);
  });

  it('sessionMfaFields carries exactly the two payload fields', () => {
    expect(sessionMfaFields({ mfaEnabled: true, mfaMethod: 'totp' })).toEqual({ mfaEnabled: true, mfaMethods: TOTP });
  });
});
