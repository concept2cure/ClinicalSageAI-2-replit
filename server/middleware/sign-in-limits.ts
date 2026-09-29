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
 *     capped per code and per challenge (emailOtpService).
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

/** The address signed in with, as an account key, or null when the body names none. */
export function signInAccountKey(body: unknown): string | null {
  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== 'string') return null;
  const normalised = email.trim().toLowerCase();
  return normalised ? `email:${normalised}` : null;
}

/** The account a second-factor request's VERIFIED challenge names, or null. */
export function secondFactorAccountKey(body: unknown): string | null {
  const challengeId = (body as { challengeId?: unknown } | null)?.challengeId;
  if (typeof challengeId !== 'string' || !challengeId) return null;
  const challenge = mfaService.verifyMfaChallengeToken(challengeId);
  const userId = challenge ? Number.parseInt(String(challenge.userId), 10) : Number.NaN;
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
