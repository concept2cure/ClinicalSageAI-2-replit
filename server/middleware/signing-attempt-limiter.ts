/**
 * A per-signer limit on credential checks at signing.
 *
 * Every route that takes a password (and a second factor) to sign is a guessing
 * oracle for whoever holds the session, which is exactly the person §11.200
 * re-authentication exists to stop (21 CFR 11.300(d): unauthorized attempts are
 * detected and limited). The limit is per signer, not per IP: behind the load
 * balancer callers share addresses, and the signer is the thing being guessed
 * for. 10 attempts per 5 minutes is several per signature with room for typos.
 *
 * Extracted from routes/esignature.ts (its verify-password and verify-mfa
 * pre-checks) when the protocol signing routes needed the same limit, so there
 * is one limiter, not two.
 *
 * @module server/middleware/signing-attempt-limiter
 */
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

function signerId(req: Request): string {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? String(n) : 'anonymous';
}

// One limiter per scope. express-rate-limit keeps its counts in the instance's
// own store, so two instances under one scope name would each allow the full
// budget: the protocol finalize and disposition routers, built separately,
// gave a signer 20 guesses per window where the scope promised 10.
const byScope = new Map<string, ReturnType<typeof rateLimit>>();

/**
 * @param scope   keys the budget, so one surface's attempts do not spend another's;
 *                every caller naming the same scope shares one budget (and the
 *                first caller's message)
 * @param message the body a refused attempt receives, in the caller's own vocabulary
 */
export function signingAttemptLimiter(scope: string, message: Record<string, unknown>) {
  const existing = byScope.get(scope);
  if (existing) return existing;
  const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `${scope}:user:${signerId(req)}`,
    message,
  });
  byScope.set(scope, limiter);
  return limiter;
}
