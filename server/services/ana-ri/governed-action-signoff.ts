/**
 * Governed-action sign-off — server-side credential verification for AnA's
 * Part 11 gated commands.
 *
 * When a governed AnA command is attempted under enforcement, the client must
 * re-authenticate (21 CFR Part 11 §11.200(a)(1)): a password (first factor) and,
 * when the signer has MFA enabled, a TOTP (second factor). This module verifies
 * those factors server-side and NEVER trusts a client-supplied "already
 * verified" flag — mirroring the discipline in routes/esignature.ts.
 *
 * The verifier takes its primitives as injected dependencies so it is unit
 * testable without bcrypt/MFA/DB; {@link defaultSignoffDeps} wires the real ones.
 */

import bcrypt from 'bcryptjs';
import { pool } from '../../db.js';
import { verifyToken as verifyMfaToken, isMfaEnabled } from '../mfaService.js';

export interface SignoffVerificationDeps {
  /** Load the user's bcrypt password hash, or null when absent. */
  loadPasswordHash: (userId: number) => Promise<string | null>;
  /** Compare a plaintext password against a stored hash. */
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  /** Whether the user has MFA enabled (second factor required). */
  isMfaEnabled: (userId: number) => Promise<boolean>;
  /** Verify a 6-digit TOTP for the user. */
  verifyMfaToken: (userId: number, token: string) => Promise<boolean>;
}

export interface SignoffVerificationInput {
  userId: number;
  password: string;
  mfaToken?: string;
}

export interface SignoffVerificationResult {
  verified: boolean;
  secondFactorVerified: boolean;
  /** Machine code for the failure mode, for the client to branch on. */
  code?:
    | 'PASSWORD_REQUIRED'
    | 'PASSWORD_INVALID'
    | 'MFA_STATE_UNKNOWN'
    | 'MFA_TOKEN_REQUIRED'
    | 'MFA_TOKEN_INVALID';
  error?: string;
}

/**
 * Verify a signer's re-authentication, fail-closed. Returns verified:true only
 * when the password matches AND (MFA is disabled OR a valid TOTP was supplied).
 * Any inability to determine MFA state fails closed (we never skip the factor).
 */
export async function verifySignerCredentials(
  deps: SignoffVerificationDeps,
  input: SignoffVerificationInput
): Promise<SignoffVerificationResult> {
  if (typeof input.password !== 'string' || input.password.length === 0) {
    return { verified: false, secondFactorVerified: false, code: 'PASSWORD_REQUIRED', error: 'A password is required to sign (Part 11 §11.200).' };
  }

  const hash = await deps.loadPasswordHash(input.userId);
  let passwordOk = false;
  if (hash) {
    try {
      passwordOk = await deps.comparePassword(input.password, hash);
    } catch {
      passwordOk = false;
    }
  }
  if (!passwordOk) {
    return { verified: false, secondFactorVerified: false, code: 'PASSWORD_INVALID', error: 'Password verification failed (§11.200).' };
  }

  let mfaRequired: boolean;
  try {
    mfaRequired = await deps.isMfaEnabled(input.userId);
  } catch {
    // Cannot determine second-factor state → fail closed.
    return { verified: false, secondFactorVerified: false, code: 'MFA_STATE_UNKNOWN', error: 'Unable to verify second factor (§11.200).' };
  }

  if (!mfaRequired) {
    return { verified: true, secondFactorVerified: false };
  }

  if (typeof input.mfaToken !== 'string' || !/^\d{6}$/.test(input.mfaToken)) {
    return { verified: false, secondFactorVerified: false, code: 'MFA_TOKEN_REQUIRED', error: 'A 6-digit MFA code is required; MFA is enabled for this account (§11.200).' };
  }
  let secondOk = false;
  try {
    secondOk = await deps.verifyMfaToken(input.userId, input.mfaToken);
  } catch {
    secondOk = false;
  }
  if (!secondOk) {
    return { verified: false, secondFactorVerified: false, code: 'MFA_TOKEN_INVALID', error: 'Second-factor verification failed (§11.200).' };
  }
  return { verified: true, secondFactorVerified: true };
}

/** Real-dependency wiring for {@link verifySignerCredentials}. */
export const defaultSignoffDeps: SignoffVerificationDeps = {
  loadPasswordHash: async (userId) => {
    try {
      // tenant-isolation-safe: re-auth self-lookup — userId is the signer's own id (verifySignerCredentials verifies the actor against their own credentials); users is a global identity.
      const result = await pool.query(`SELECT password_hash FROM users WHERE id = $1 LIMIT 1`, [userId]);
      return result.rows[0]?.password_hash || null;
    } catch {
      return null; // schema drift / missing table → fail closed
    }
  },
  comparePassword: (password, hash) => bcrypt.compare(password, hash),
  isMfaEnabled: (userId) => isMfaEnabled(userId),
  verifyMfaToken: (userId, token) => verifyMfaToken(userId, token),
};
