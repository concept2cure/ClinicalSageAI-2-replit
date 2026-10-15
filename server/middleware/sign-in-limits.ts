/**
 * Sign-in limits per ACCOUNT (D6, 2026-09-29).
 *
 * routes/auth.ts limited its password and second-factor steps to 10 requests
 * per client address per 15 minutes, successes included. An office signs in
 * from one address — so does everyone behind one CloudFront edge while the
 * load balancer trusts one hop — and a sign-in is both steps, so the eleventh
 * colleague was refused at both for a quarter of an hour (validation package,
 * 2026-09-27, VSR-001 §18.4; reproduced in
 * server/routes/__tests__/auth-sign-in-limits.test.ts).
 *
 * What these limit is guessing at ONE account, counting failures only:
 *
 *   signInLimits.login — failed sign-ins for one address signed in with,
 *     normalised. Beside the five-failure lockout (auth-security-service),
 *     which counts only addresses that have an account.
 *   signInLimits.secondFactor — wrong second-factor codes for one account,
 *     keyed by the account the verified challenge names. Wrong authenticator
 *     and recovery codes were counted per address only; emailed codes are also
 *     capped per code and per challenge (emailOtpService). One limiter, one
 *     count, at both doors: the /api/auth challenge (`challengeId`) and the
 *     enterprise sign-in's partial token (`partialToken`, routes/authEnterprise.ts
 *     /verify-mfa; security review 2026-10-01, IAM-30), so guesses at one door
 *     are not a fresh allowance at the other.
 *   signInLimits.authenticatorChange — the same count, at the doors where a
 *     signed-in person confirms (`/mfa/enable`) or removes (`/mfa/disable`)
 *     their authenticator with a code (routes/auth.ts, the one enrolment
 *     implementation since 2026-10-08). Keyed by the account
 *     the request's access token names, never by anything in the body, so a
 *     session cannot move its guesses onto another account by naming that
 *     account's challenge. Until P-25 (2026-10-08) only the per-address
 *     failure bucket counted wrong codes there.
 *
 * A request that names no account (no address, an invalid challenge) is keyed
 * by its client address, so it is limited no less than before. Guessing
 * across accounts from one address is the enterprise /api/auth limit's
 * (failures only, SIGN_IN_LIMITS.failuresPerIp). The numbers live in
 * server/config/platform-limits.ts.
 *
 * @module server/middleware/sign-in-limits
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { SIGN_IN_LIMITS } from '../config/platform-limits';
import { clientIpKey } from '../utils/client-ip';
import * as mfaService from '../services/mfaService';
import { verifyJwtWithRotation } from '../utils/jwtVerify';
import { requireAccessTokenReason, type TokenClassClaims } from './tokenType';

/** The address signed in with, as an account key, or null when the body names none. */
export function signInAccountKey(body: unknown): string | null {
  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== 'string') return null;
  const normalised = email.trim().toLowerCase();
  return normalised ? `email:${normalised}` : null;
}

/** The account the enterprise sign-in's partial token names, when this server signed it as a challenge. */
function partialTokenUserId(partialToken: string): number {
  try {
    const claims = verifyJwtWithRotation<{ userId?: unknown; mfaPending?: unknown }>(partialToken);
    return claims?.mfaPending === true ? Number.parseInt(String(claims.userId), 10) : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

/** The account a second-factor request's VERIFIED challenge names, at either door, or null. */
export function secondFactorAccountKey(body: unknown): string | null {
  const { challengeId, partialToken } = (body ?? {}) as { challengeId?: unknown; partialToken?: unknown };
  let userId = Number.NaN;
  if (typeof challengeId === 'string' && challengeId) {
    const challenge = mfaService.verifyMfaChallengeToken(challengeId);
    userId = challenge ? Number.parseInt(String(challenge.userId), 10) : Number.NaN;
  } else if (typeof partialToken === 'string' && partialToken) {
    userId = partialTokenUserId(partialToken);
  }
  return Number.isInteger(userId) && userId > 0 ? `user:${userId}` : null;
}

/**
 * The account a signed-in request's access token names, or null. The signature
 * and the token class are checked here; whether the session is still live is
 * the route's own check, and its refusal is counted like any other.
 */
export function sessionAccountKey(authorization: unknown): string | null {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;
  try {
    const claims = verifyJwtWithRotation<TokenClassClaims & { userId?: unknown }>(authorization.slice('Bearer '.length));
    if (!claims || requireAccessTokenReason(claims)) return null;
    const userId = Number.parseInt(String(claims.userId), 10);
    return Number.isInteger(userId) && userId > 0 ? `user:${userId}` : null;
  } catch {
    return null;
  }
}

function perAccount(
  limit: { windowMs: number; max: number },
  accountKey: (req: Request) => string | null,
  message: (req: Request) => string,
) {
  return rateLimit({
    windowMs: limit.windowMs,
    limit: limit.max,
    standardHeaders: true,
    legacyHeaders: false,
    // Guessing is what is limited: a right password or code costs nothing.
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => accountKey(req) ?? `ip:${ipKeyGenerator(clientIpKey(req))}`,
    handler: (req: Request, res: Response) => {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: message(req) } });
    },
  });
}

/**
 * One count of wrong second-factor codes per account, whichever door the code
 * was entered at. Each door states which account its request is counted
 * against, and the words of the refusal, before the shared count runs.
 */
interface SecondFactorDoor {
  accountKey: (req: Request) => string | null;
  message: string;
}
const secondFactorDoorOf = new WeakMap<Request, SecondFactorDoor>();
const secondFactorCount = perAccount(
  SIGN_IN_LIMITS.mfaFailuresPerAccount,
  (req) => secondFactorDoorOf.get(req)?.accountKey(req) ?? null,
  (req) => secondFactorDoorOf.get(req)?.message ?? 'Too many incorrect verification codes for this account.',
);
function secondFactorDoor(door: SecondFactorDoor): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    secondFactorDoorOf.set(req, door);
    return secondFactorCount(req, res, next);
  };
}

export const signInLimits = {
  login: perAccount(
    SIGN_IN_LIMITS.loginFailuresPerAccount,
    (req) => signInAccountKey(req.body),
    () => 'Too many failed sign-in attempts for this account. Please try again later.',
  ),
  secondFactor: secondFactorDoor({
    accountKey: (req) => secondFactorAccountKey(req.body),
    message: 'Too many incorrect verification codes for this account. Please sign in again later.',
  }),
  authenticatorChange: secondFactorDoor({
    accountKey: (req) => sessionAccountKey(req.headers.authorization),
    message: 'Too many incorrect verification codes for this account. Try again later.',
  }),
};
