/**
 * An account's second factor, read one way for every place that states it.
 *
 * Sign-in asks for the authenticator when the account has one enrolled and
 * confirmed, and for an emailed code otherwise. Until 2026-09-23 that rule was
 * written out at each sign-in route, while the session the browser reads said
 * something else entirely: GET /api/auth/session answered `mfaEnabled: false,
 * mfaMethods: []` for every user, an account with an enrolled authenticator
 * included, and /mfa/verify echoed whatever `method` the request had named
 * (VSR-001 §13.3 item 4, D6). Each of them now derives the answer here, so the
 * session and the challenge cannot disagree about the account.
 *
 * An authenticator is enrolled when users.mfa_enabled is true: enableMfa sets
 * it only after a code from the new secret verifies, and disableMfa clears it.
 * users.mfa_method is NOT an enrolment signal on its own. generateSecret sets
 * it to 'totp' before any code is confirmed, disableMfa leaves it 'totp', and
 * its column default differs between creators ('email' in shared/schema.ts,
 * 'totp' in the boot bootstrap). It is read only together with mfa_enabled,
 * exactly as the sign-in challenge has always read it.
 */

export type SignInFactor = 'totp' | 'email';

export interface MfaMethodEntry {
  type: SignInFactor;
  isEnabled: true;
  isPrimary: true;
}

export interface MfaEnrolment {
  /** An authenticator is enrolled and confirmed, and sign-in requires it. */
  mfaEnabled: boolean;
  /** The factor a sign-in challenge asks this account for. */
  signInFactor: SignInFactor;
  /** The same, in the shape the session and challenge payloads carry. */
  mfaMethods: MfaMethodEntry[];
}

/** The users columns this reads; any users row (or a select of these) will do. */
export interface MfaEnrolmentRow {
  mfaEnabled?: boolean | null;
  mfaMethod?: string | null;
}

export function mfaEnrolmentOf(row: MfaEnrolmentRow): MfaEnrolment {
  const authenticator = row.mfaEnabled === true && (row.mfaMethod || 'email') === 'totp';
  const signInFactor: SignInFactor = authenticator ? 'totp' : 'email';
  return {
    mfaEnabled: authenticator,
    signInFactor,
    mfaMethods: [{ type: signInFactor, isEnabled: true, isPrimary: true }],
  };
}

/** The two fields a session or sign-in payload's `user` carries about this. */
export function sessionMfaFields(row: MfaEnrolmentRow): Pick<MfaEnrolment, 'mfaEnabled' | 'mfaMethods'> {
  const { mfaEnabled, mfaMethods } = mfaEnrolmentOf(row);
  return { mfaEnabled, mfaMethods };
}
