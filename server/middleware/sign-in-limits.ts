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
 *
 * A request that names no account (no address, an invalid challenge) is keyed
 * by its client address, so it is limited no less than before. Guessing
 * across accounts from one address is the enterprise /api/auth limit's
 * (failures only, SIGN_IN_LIMITS.failuresPerIp). The numbers live in
 * server/config/platform-limits.ts.
 *
 * @module server/middleware/sign-in-limits
 */
import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { SIGN_IN_LIMITS } from '../config/platform-limits';
import { clientIpKey } from '../utils/client-ip';
import * as mfaService from '../services/mfaService';
import { verifyJwtWithRotation } from '../utils/jwtVerify';

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

function perAccount(
  limit: { windowMs: number; max: number },
  accountKey: (body: unknown) => string | null,
  message: string,
) {
  return rateLimit({
    windowMs: limit.windowMs,
    limit: limit.max,
    standardHeaders: true,
    legacyHeaders: false,
    // Guessing is what is limited: a right password or code costs nothing.
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => accountKey(req.body) ?? `ip:${ipKeyGenerator(clientIpKey(req))}`,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message } });
    },
  });
}

export const signInLimits = {
  login: perAccount(
    SIGN_IN_LIMITS.loginFailuresPerAccount,
    signInAccountKey,
    'Too many failed sign-in attempts for this account. Please try again later.',
  ),
  secondFactor: perAccount(
    SIGN_IN_LIMITS.mfaFailuresPerAccount,
    secondFactorAccountKey,
    'Too many incorrect verification codes for this account. Please sign in again later.',
  ),
};
