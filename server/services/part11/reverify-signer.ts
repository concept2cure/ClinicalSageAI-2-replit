/**
 * 21 CFR Part 11 §11.200(a)(1) — re-verify the signer at the moment of signing.
 *
 * A signature is only a signature if the components that make it were checked
 * SERVER-SIDE when it was applied. The regulation is explicit that the
 * components are executed at signing, and the corresponding controls must
 * ensure they cannot be used by anyone but their genuine owner. A client-
 * supplied "already verified" flag satisfies none of that: it is an assertion by
 * the party being authenticated.
 *
 * ── Why this module exists ───────────────────────────────────────────────────
 * This logic was written once, correctly, inline in routes/esignature.ts, and
 * then NOT used by the other signing surface. POST
 * /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures took
 * `authenticationMethod` as a free string and `secondFactorVerified` as a
 * boolean straight from the request body and persisted both verbatim onto the
 * signature row, behind a role check alone — no password, no bcrypt, no TOTP.
 *
 * That is the exact defect POST /api/part11/signatures was DELETED for; the
 * rationale is still in the tree at routes/part11-compliance.ts:359-380 ("it
 * recorded mfa_verified from !!req.body.mfaToken — a client-asserted boolean,
 * never verified"). It survived on a different router because the logic that
 * replaced it was inline in one route rather than shared.
 *
 * So this is the extraction, not a third copy: both routes call it, and the
 * result it returns is what gets persisted — `authenticationMethod` and
 * `secondFactorVerified` are DERIVED from what was actually checked here and
 * are not accepted from callers at all.
 *
 * Dependencies are injected so the policy can be unit-tested without a database,
 * matching resolve-signer-identity.ts and signature-persistence.ts in this
 * directory.
 *
 * @compliance 21 CFR Part 11 §11.200(a)(1)(i)-(ii), §11.10(d)
 */

/** What was verified, for persistence onto the signature row. */
export interface SignerReverified {
  ok: true;
  /**
   * How identity was established, server-derived. 'password' when the signer has
   * no second factor enabled; 'password+mfa' when a TOTP was also verified.
   */
  authenticationMethod: 'password' | 'password+mfa';
  /** True only when a second factor was required AND verified here. */
  secondFactorVerified: boolean;
}

/** Why the signature was refused. `status` is the HTTP status to return. */
export interface SignerRefused {
  ok: false;
  status: 400 | 401;
  code:
    | 'PASSWORD_REQUIRED'
    | 'PASSWORD_VERIFICATION_FAILED'
    | 'MFA_TOKEN_REQUIRED'
    | 'MFA_VERIFICATION_FAILED'
    | 'MFA_STATE_UNKNOWN';
  error: string;
}

export type SignerReverification = SignerReverified | SignerRefused;

export interface ReverifySignerDeps {
  /** The signer's stored bcrypt hash, or null when there is none. */
  loadPasswordHash: (userId: number) => Promise<string | null>;
  /** bcrypt comparison. Injected so tests need no hashing round trip. */
  comparePassword: (plain: string, hash: string) => Promise<boolean>;
  /** Whether this signer has a second factor enrolled. */
  isMfaEnabled: (userId: number) => Promise<boolean>;
  /** Verify a TOTP/backup code for this signer. */
  verifyMfaToken: (userId: number, token: string) => Promise<boolean>;
  /** Where refusals are noted. Defaults to console.warn. */
  warn?: (message: string) => void;
}

export interface SignerCredentials {
  password?: unknown;
  mfaToken?: unknown;
}

const SIX_DIGITS = /^\d{6}$/;

/**
 * Re-verify a signer's credentials. Returns what was verified, or why it was
 * refused — never throws for a failed factor, so a caller cannot accidentally
 * turn a refusal into a 500 and lose the distinction between "wrong password"
 * and "the server broke".
 *
 * Fails closed at every branch, including the one that is easy to miss: if the
 * MFA-enrolment state cannot be READ, the signature is refused rather than
 * treated as "no second factor required". An unreachable MFA service must not
 * be a way to sign with one factor.
 */
export async function reverifySigner(
  userId: number,
  credentials: SignerCredentials,
  deps: ReverifySignerDeps,
): Promise<SignerReverification> {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const { password, mfaToken } = credentials;

  // ── First factor ──────────────────────────────────────────────────────────
  if (typeof password !== 'string' || password.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'PASSWORD_REQUIRED',
      error: 'password is required to sign (21 CFR Part 11 §11.200).',
    };
  }

  const hash = await deps.loadPasswordHash(userId);
  let passwordVerified = false;
  if (hash) {
    try {
      passwordVerified = await deps.comparePassword(password, hash);
    } catch (err: unknown) {
      warn(`[part11] password comparison failed during sign: ${errText(err)}`);
      passwordVerified = false;
    }
  }
  // A signer with no stored hash cannot be verified, and is refused with the
  // same message as a wrong password — the distinction is not the caller's to
  // learn.
  if (!passwordVerified) {
    return {
      ok: false,
      status: 401,
      code: 'PASSWORD_VERIFICATION_FAILED',
      error: 'Signature rejected: password verification failed (§11.200).',
    };
  }

  // ── Second factor, when enrolled ──────────────────────────────────────────
  let mfaRequired: boolean;
  try {
    mfaRequired = await deps.isMfaEnabled(userId);
  } catch (err: unknown) {
    warn(`[part11] MFA enrolment check failed during sign: ${errText(err)}`);
    return {
      ok: false,
      status: 401,
      code: 'MFA_STATE_UNKNOWN',
      error: 'Signature rejected: unable to verify second factor (§11.200).',
    };
  }

  if (!mfaRequired) {
    return { ok: true, authenticationMethod: 'password', secondFactorVerified: false };
  }

  if (typeof mfaToken !== 'string' || !SIX_DIGITS.test(mfaToken)) {
    return {
      ok: false,
      status: 400,
      code: 'MFA_TOKEN_REQUIRED',
      error:
        'mfaToken (6 digits) is required to sign; MFA is enabled for this account (§11.200).',
    };
  }

  let secondFactorVerified = false;
  try {
    secondFactorVerified = await deps.verifyMfaToken(userId, mfaToken);
  } catch (err: unknown) {
    warn(`[part11] MFA verification failed during sign: ${errText(err)}`);
    secondFactorVerified = false;
  }
  if (!secondFactorVerified) {
    return {
      ok: false,
      status: 401,
      code: 'MFA_VERIFICATION_FAILED',
      error: 'Signature rejected: second-factor verification failed (§11.200).',
    };
  }

  return { ok: true, authenticationMethod: 'password+mfa', secondFactorVerified: true };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
