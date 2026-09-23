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
  status: 400 | 401 | 423;
  code:
    | 'PASSWORD_REQUIRED'
    | 'PASSWORD_VERIFICATION_FAILED'
    | 'MFA_TOKEN_REQUIRED'
    | 'MFA_VERIFICATION_FAILED'
    | 'MFA_STATE_UNKNOWN'
    | 'ACCOUNT_LOCKED'
    | 'ACCOUNT_STATE_UNKNOWN';
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
  /**
   * Whether the account is locked after repeated failed attempts: the sign-in's
   * lockout (auth-security-service), so the account has one allowance.
   */
  isAccountLocked: (userId: number) => Promise<boolean>;
  /** Count one wrong factor against the account. The count may lock it. */
  recordFailedAttempt: (userId: number) => Promise<void>;
  /** Where refusals are noted. Defaults to console.warn. */
  warn?: (message: string) => void;
}

export interface SignerCredentials {
  password?: unknown;
  mfaToken?: unknown;
}

const SIX_DIGITS = /^\d{6}$/;

/**
 * The first factor, under the account's allowance: the password check every
 * signature starts with, and the one the signing dialog runs on its own before
 * it asks for a code (POST /api/esignature/verify-password). One implementation,
 * so a guess counts the same wherever it is made (F-27).
 *
 * Checks the lockout before comparing anything: a locked account's guesses are
 * neither compared nor counted.
 */
export async function verifySignerPassword(
  userId: number,
  password: unknown,
  deps: Pick<
    ReverifySignerDeps,
    'loadPasswordHash' | 'comparePassword' | 'isAccountLocked' | 'recordFailedAttempt' | 'warn'
  >,
): Promise<{ ok: true } | SignerRefused> {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  if (typeof password !== 'string' || password.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'PASSWORD_REQUIRED',
      error: 'password is required to sign (21 CFR Part 11 §11.200).',
    };
  }

  // ── The account's allowance, before anything is compared ──────────────────
  let locked: boolean;
  try {
    locked = await deps.isAccountLocked(userId);
  } catch (err: unknown) {
    warn(`[part11] account lockout check failed during sign: ${errText(err)}`);
    return {
      ok: false,
      status: 401,
      code: 'ACCOUNT_STATE_UNKNOWN',
      error: 'Signature rejected: unable to verify the account (§11.200).',
    };
  }
  if (locked) {
    return {
      ok: false,
      status: 423,
      code: 'ACCOUNT_LOCKED',
      error:
        'Signature rejected: the account is locked after repeated failed attempts. Try again later (§11.300).',
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
    await countFailure(deps, userId, warn);
    return {
      ok: false,
      status: 401,
      code: 'PASSWORD_VERIFICATION_FAILED',
      error: 'Signature rejected: password verification failed (§11.200).',
    };
  }
  return { ok: true };
}

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
 *
 * A wrong password or code counts against the account, and a locked account
 * cannot sign (VSR-001 F-27). Sign-in locks an account for 30 minutes after
 * five wrong passwords; this check neither consulted nor fed that count, so
 * every signing endpoint was an unmetered oracle for the password, and then the
 * code, to whoever held a session, and a locked account could still sign
 * (tests/db/signing-lockout.dbtest.ts). §11.300(d). The count is the sign-in's
 * own, so the account has one allowance wherever its password is guessed. A
 * missing or malformed factor is not a guess and is not counted.
 */
export async function reverifySigner(
  userId: number,
  credentials: SignerCredentials,
  deps: ReverifySignerDeps,
): Promise<SignerReverification> {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const { password, mfaToken } = credentials;

  // ── First factor ──────────────────────────────────────────────────────────
  const first = await verifySignerPassword(userId, password, deps);
  if (!first.ok) return first;

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

  /* No initializer: both arms below assign it, and a default of `false` here
     would be a value no statement can read — the kind of dead default that
     hides a missing arm rather than guarding against one. */
  let secondFactorVerified: boolean;
  try {
    secondFactorVerified = await deps.verifyMfaToken(userId, mfaToken);
  } catch (err: unknown) {
    warn(`[part11] MFA verification failed during sign: ${errText(err)}`);
    secondFactorVerified = false;
  }
  if (!secondFactorVerified) {
    await countFailure(deps, userId, warn);
    return {
      ok: false,
      status: 401,
      code: 'MFA_VERIFICATION_FAILED',
      error:
        'Signature rejected: second-factor verification failed (§11.200). Each code is accepted once; if this one was just used, wait for the next.',
    };
  }

  return { ok: true, authenticationMethod: 'password+mfa', secondFactorVerified: true };
}

/** Count a wrong factor. A failure to count is noted; the refusal stands either way. */
async function countFailure(
  deps: Pick<ReverifySignerDeps, 'recordFailedAttempt'>,
  userId: number,
  warn: (message: string) => void,
): Promise<void> {
  try {
    await deps.recordFailedAttempt(userId);
  } catch (err: unknown) {
    warn(`[part11] failed signing attempt was not counted: ${errText(err)}`);
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
