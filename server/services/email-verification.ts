/**
 * E-mail verification at sign-up (security audit 2026-09-24, IAM-17; plan P1-2;
 * 21 CFR 11.100(b), NIST SP 800-63A: the address an account is bound to is
 * shown to be the holder's before the account can act).
 *
 * Until 2026-09-26 POST /api/auth/signup answered with a 24-hour administrator
 * session for whatever address it was given. A sign-up now creates the account
 * in `pending_verification`; the account can act (sign in, refresh, hold a
 * session) only once the link mailed to the address is opened. The link
 * carries a signed, single-purpose token: the account id and the address it
 * was created with, `type: 'email_verification'`, valid for 24 hours. No
 * authenticator admits that class (middleware/tokenType.ts requires
 * `type: 'access'`), and verifying it moves the account to `active` only from
 * `pending_verification`, so a link used twice does nothing the second time.
 *
 * The token travels in the URL fragment, which browsers never send to a server
 * (as the single sign-on hand-off does, IAM-18 item 6); the page posts it.
 */
import jwt from 'jsonwebtoken';

import { config } from '../config/environment';
import { verifyJwtWithRotation } from '../utils/jwtVerify';

export const EMAIL_VERIFICATION_TTL = '24h';
export const EMAIL_VERIFICATION_TOKEN_TYPE = 'email_verification';
export const VERIFY_EMAIL_PATH = '/concept2cure/verify-email';

/** Said to whoever has shown the account's password: the account exists and is waiting on its link. */
export const EMAIL_UNVERIFIED_MESSAGE =
  'Confirm your e-mail address to finish creating your account. Open the link we sent you, or request a new one.';
export const VERIFICATION_LINK_INVALID_MESSAGE = 'This link is not valid or has expired. Request a new one.';

export interface EmailVerificationSubject {
  userId: number;
  email: string;
}

/** The link's token: this account, this address, this purpose, one day. */
export function mintEmailVerificationToken(userId: number | string, email: string, secret: string = config.jwt.secret): string {
  return jwt.sign({ userId: String(userId), email: email.trim().toLowerCase(), type: EMAIL_VERIFICATION_TOKEN_TYPE }, secret, {
    algorithm: 'HS256',
    expiresIn: EMAIL_VERIFICATION_TTL,
  });
}

/** The account a verification token names, or null for anything else: unsigned, expired, another class, no subject. */
export function readEmailVerificationToken(token: unknown): EmailVerificationSubject | null {
  if (typeof token !== 'string' || !token) return null;
  let decoded: { userId?: unknown; email?: unknown; type?: unknown };
  try {
    decoded = verifyJwtWithRotation<{ userId?: unknown; email?: unknown; type?: unknown }>(token);
  } catch {
    return null;
  }
  if (decoded.type !== EMAIL_VERIFICATION_TOKEN_TYPE) return null;
  const userId = Number.parseInt(String(decoded.userId ?? ''), 10);
  const email = typeof decoded.email === 'string' ? decoded.email : '';
  if (!Number.isInteger(userId) || userId <= 0 || !email) return null;
  return { userId, email };
}

/** The link mailed at sign-up: the sign-in shell's verify page, the token in the fragment. */
export function emailVerificationUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${VERIFY_EMAIL_PATH}#token=${encodeURIComponent(token)}`;
}
