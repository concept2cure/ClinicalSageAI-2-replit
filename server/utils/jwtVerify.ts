/**
 * JWT verification with zero-downtime rotation support.
 *
 * Wraps jsonwebtoken.verify(). Tries the current secret first; on a
 * signature-mismatch error, falls back to the previous secret if one
 * is configured. This lets operators rotate the JWT secret without
 * invalidating every active session — both old and new tokens
 * validate during the rotation window.
 *
 * Algorithm pinned to HS256. Anything else means a forged token
 * attempting an algorithm-confusion attack — refuse.
 *
 * Signing always uses the CURRENT secret (jwt.sign sites continue
 * to read `config.jwt.secret` directly; this helper is only for
 * verification).
 *
 * Implementation note: reads `process.env` directly (NOT
 * `config.jwt`) so callers in test contexts that deliberately set
 * bad envs to exercise failure paths don't trigger full config
 * validation at import time. The same pattern as
 * `isJwtRotationInProgress` below.
 */

import jwt, { type VerifyOptions } from 'jsonwebtoken';

export type JwtVerifyOptions = Omit<VerifyOptions, 'algorithms'>;

const ENV_SUFFIX_MAP: Record<string, string> = {
  production: 'PROD',
  staging: 'STAGING',
  development: 'DEV',
  test: 'DEV',
};

function envSuffix(): string {
  const env = process.env.NODE_ENV ?? 'development';
  return ENV_SUFFIX_MAP[env] ?? 'DEV';
}

function currentSecret(): string {
  const suffix = envSuffix();
  const secret = process.env[`JWT_SECRET_${suffix}`] ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      `[FATAL] JWT secret not configured. Set JWT_SECRET_${suffix} or JWT_SECRET.`,
    );
  }
  return secret;
}

function previousSecret(): string | undefined {
  const suffix = envSuffix();
  return process.env[`JWT_SECRET_PREVIOUS_${suffix}`] ?? process.env.JWT_SECRET_PREVIOUS;
}

/** True iff the error indicates "right shape, wrong signature" — the
 *  only error class we should retry against the previous secret. */
function isSignatureMismatch(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // jsonwebtoken's JsonWebTokenError covers "invalid signature".
  // We do NOT retry on TokenExpiredError (token structurally valid
  // but past its exp; retrying would just produce the same error)
  // or NotBeforeError.
  return err.name === 'JsonWebTokenError' && /signature/i.test(err.message);
}

/**
 * Verify a JWT, trying the current secret first and the previous
 * secret on signature mismatch. Returns the decoded payload typed
 * as T (caller is responsible for the cast — same posture as
 * jsonwebtoken's verify).
 *
 * Throws the original error from the FIRST attempt when both fail,
 * so callers see (e.g.) TokenExpiredError rather than the previous-
 * secret signature-mismatch.
 */
export function verifyJwtWithRotation<T = unknown>(
  token: string,
  options: JwtVerifyOptions = {},
): T {
  const opts: VerifyOptions = { ...options, algorithms: ['HS256'] };
  const current = currentSecret();

  try {
    return jwt.verify(token, current, opts) as T;
  } catch (primaryErr) {
    const previous = previousSecret();
    if (previous && isSignatureMismatch(primaryErr)) {
      try {
        return jwt.verify(token, previous, opts) as T;
      } catch {
        // Fall through to throw the primary error so the caller
        // gets a consistent failure mode regardless of rotation state.
      }
    }
    throw primaryErr;
  }
}

/** True iff a rotation is in progress (the previous secret is set). */
export function isJwtRotationInProgress(): boolean {
  return Boolean(previousSecret());
}
