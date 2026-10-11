/**
 * Password reset and invitation activation limits, per client address (QA
 * 2026-10-08, j9 finding 7).
 *
 * One limiter of five requests per hour per address guarded both asking for a
 * reset link and redeeming one, and counted every request. An invitee whose
 * first password the policy refused spent the budget retrying; a colleague at
 * the same office address spent it for them; and the refusal gave no time to
 * retry. The protection stays, in two buckets (numbers in
 * server/config/platform-limits.ts PASSWORD_RESET_LIMITS):
 *
 *   passwordResetLimits.request — asking for a link. Every request counts:
 *     each one can send mail.
 *   passwordResetLimits.confirm — redeeming a link (an invitation's setup link
 *     is the same token). Only a refused link counts — invalid, expired, already
 *     used, or none presented — marked by the handler with markResetLinkRefused.
 *     Setting the password, and a password the policy refused for a link that
 *     is valid, cost nothing.
 *
 * Each refusal says how long to wait.
 *
 * @module server/middleware/password-reset-limits
 */
import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { PASSWORD_RESET_LIMITS } from '../config/platform-limits';
import { clientIpKey } from '../utils/client-ip';

const REFUSED_LINK = 'passwordResetLinkRefused';

/** Count this redemption against the address: the link it presented was refused (or there was none). */
export function markResetLinkRefused(res: Response): void {
  res.locals[REFUSED_LINK] = true;
}

/** "Try again in N minutes." from the limiter's own reset time; one minute at least. */
export function retryAfterSentence(req: Request, now: number = Date.now()): string {
  const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const minutes = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - now) / 60_000)) : 60;
  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

function perAddress(
  limit: { windowMs: number; max: number },
  refusal: string,
  counts?: (res: Response) => boolean,
) {
  return rateLimit({
    windowMs: limit.windowMs,
    limit: limit.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `ip:${ipKeyGenerator(clientIpKey(req))}`,
    // A request the bucket does not count is treated as "successful" and skipped.
    ...(counts ? { skipSuccessfulRequests: true, requestWasSuccessful: (_req: Request, res: Response) => !counts(res) } : {}),
    handler: (req: Request, res: Response) => {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: `${refusal} ${retryAfterSentence(req)}` } });
    },
  });
}

export const passwordResetLimits = {
  request: perAddress(PASSWORD_RESET_LIMITS.requestsPerIp, 'Too many password reset requests from this network.'),
  confirm: perAddress(
    PASSWORD_RESET_LIMITS.refusedLinksPerIp,
    'Too many invalid or expired password links were tried from this network.',
    (res) => res.locals[REFUSED_LINK] === true,
  ),
};
