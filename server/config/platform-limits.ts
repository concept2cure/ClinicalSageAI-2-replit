/**
 * Platform-wide operational limits — single source of truth.
 *
 * Previously these numeric constants were duplicated inline across middleware
 * and route files (file-size caps, rate-limit windows/quotas, in-memory store
 * sizes, and Redis connection tuning). Centralizing them here removes drift and
 * makes the operational envelope auditable in one place.
 *
 * IMPORTANT: this module began as a pure refactor — every value was the EXACT
 * value that previously lived inline in the consuming file, and where the
 * original code read from an environment variable (e.g. NODE_ENV-dependent
 * auth limits) that branching is preserved. The identity-keyed ceilings below
 * are the one deliberate addition, dated and explained in the next note.
 *
 * NOTE: the memory-store and the (older) in-memory `rateLimiter.ts` middleware
 * were authored independently and use DIFFERENT quotas from the newer
 * Redis-backed `redisRateLimiter.ts`. Those differences are intentional and are
 * preserved verbatim — see `LEGACY_RATE_LIMITS` vs `RATE_LIMITS`.
 *
 * ── Identity-keyed ceilings (VSR-001 F-5, 2026-09-21) ────────────────────────
 * Both limiters keyed EVERY request by client IP. One browser session opening
 * two or three launch surfaces makes more than 60 calls a minute across the
 * routers that mount the legacy limiter (they share one store) and more than
 * 100 through the Redis limiter on /api, so a single user tripped both during
 * ordinary use, and an office behind one NAT address shares the bucket.
 *
 * Each bucket may now carry, beside `maxRequests` (the per-IP ceiling, which
 * still applies to every request that presents no identity):
 *
 *   maxRequestsAuthenticated       — the ceiling for ONE identity: a verified
 *                                    user id where the limiter runs after auth
 *                                    (legacy limiter), or the hash of the bearer
 *                                    credential where it runs before auth
 *                                    (Redis limiter on /api).
 *   maxRequestsPerIpAuthenticated  — Redis limiter only: the ceiling for all
 *                                    CREDENTIALED traffic from one IP. An
 *                                    unverified credential can be minted per
 *                                    request, so without this guard a client
 *                                    could escape the IP bucket by rotating
 *                                    tokens; with it, rotation is bounded at a
 *                                    NAT-sized number.
 *
 * Numbers: an interactive session was measured at 60–100 reads a minute while
 * surfaces load (VSR-001 F-5 evidence), so ONE identity gets 600/min — six
 * times that, room for a busy user, still a hard cap — and one address gets
 * 3,000/min of credentialed traffic, fifty such users. The resource-priced
 * buckets (ai, documents, validation) keep their ceilings: they exist for cost,
 * not for source attribution, and per-identity keying alone already stops one
 * user's quota from being consumed by a colleague. The upload bucket is the one
 * exception, raised per identity on 2026-10-08 (see RATE_LIMITS.upload), and the
 * Vault's document metadata reads moved out of `documents` into `vault_metadata`
 * the same day (still fail-closed).
 *
 * ── Sign-in (D6, 2026-09-29) ─────────────────────────────────────────────────
 * Sign-in was limited per client address at every layer, successes counted:
 * the `auth` bucket below held 20 requests per address per 15 minutes in
 * production (a sign-in is two — password, then second factor), routes/auth.ts
 * held 10 of each step, and the enterprise /api/auth limit refused an address
 * after 5 failures. So about ten colleagues behind one office address — or one
 * CloudFront edge, while the load balancer trusts one hop — signed in per
 * quarter hour, and five typos or expired-session 401s locked the address out.
 *
 * Now an ACCOUNT is what is protected, per account ({@link SIGN_IN_LIMITS}:
 * the failed-sign-in and wrong-second-factor limits beside the five-failure
 * lockout in auth-security-service), and an ADDRESS is limited only in what it
 * gets wrong ({@link SIGN_IN_LIMITS}.failuresPerIp) and in raw volume (the
 * `auth` bucket, sized for a shared address). No layer counts a successful
 * sign-in against the address it came from.
 *
 * @module server/config/platform-limits
 */

// ─────────────────────────────────────────────────────────────────────────────
// FILE LIMITS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File-size limits for uploads. 100 MB is the FDA ESG per-file ceiling used for
 * regulatory-submission uploads (document-routes.ts, since deleted as an
 * unreachable parallel path).
 */
export const FILE_LIMITS = {
  /** Maximum bytes accepted for a single document upload (100 MB, FDA ESG). */
  maxUploadBytes: 100 * 1024 * 1024,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITS — Redis-backed limiter (server/middleware/redisRateLimiter.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Common 1-minute window shared by most Redis-limiter buckets. */
const ONE_MINUTE_MS = 60 * 1000;
/** 15-minute window used for production authentication throttling. */
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** Whether the process is running in production (drives auth-limit branching). */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Default rate-limit rules for the Redis-backed distributed limiter.
 *
 * The `auth` bucket is environment-dependent exactly as the original code was:
 * stricter in production, relaxed in development to avoid local/demo lockouts.
 * Messages are kept alongside the numeric values since they were co-located in
 * the original DEFAULT_RULES.
 */
export const RATE_LIMITS = {
  /** Authentication endpoints — a VOLUME guard, every request counted; what
   *  guessing is allowed is SIGN_IN_LIMITS' business. Production: 600 anonymous
   *  requests per address per 15 minutes (about 300 sign-ins at one office
   *  address or edge — it was 20, about ten), 300 per session credential, and
   *  3,000 credentialed per address so rotating unverified credentials stays
   *  bounded. Development is unchanged. */
  auth: {
    windowMs: IS_PRODUCTION ? FIFTEEN_MINUTES_MS : ONE_MINUTE_MS,
    maxRequests: IS_PRODUCTION ? 600 : 300,
    maxRequestsAuthenticated: 300,
    maxRequestsPerIpAuthenticated: 3000,
    message: IS_PRODUCTION
      ? 'Too many authentication attempts. Please try again later.'
      : 'Too many authentication attempts. Please wait briefly and try again.',
  },

  /** General API endpoints. Per IP for anonymous traffic; per identity (600)
   *  and per credentialed IP (3,000) for authenticated traffic — see header. */
  api: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 100,
    maxRequestsAuthenticated: 600,
    maxRequestsPerIpAuthenticated: 3000,
    message: 'Too many requests. Please slow down.',
  },

  /** AI/ML endpoints (resource intensive); admins are exempted. */
  ai: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 30,
    message: 'Too many AI requests. Please wait before making more.',
    skipRoles: ['admin', 'super_admin'] as string[],
  },

  /** Document generation, export and download endpoints, and the Vault's document
   *  writes. The Vault's document METADATA reads are in `vault_metadata` instead. */
  documents: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 20,
    message: 'Too many document requests. Please wait.',
  },

  /** The Vault's document-scoped METADATA reads: versions, history, annotations
   *  and relationships. One document open makes four of them, so they cannot
   *  share the 20-a-minute `documents` bucket (QA 2026-10-08: five opens in a
   *  minute were refused). Per identity 600, the same ceiling as `api`. They stay
   *  FAIL-CLOSED on a limiter error, unlike `api`: annotations carry the quoted
   *  text of a document, which is content, not a navigation read. */
  vault_metadata: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 100,
    maxRequestsAuthenticated: 600,
    maxRequestsPerIpAuthenticated: 3000,
    message: 'Too many requests for this document. Please wait.',
  },

  /** Concept2Cure-specific API. Same shape as `api`: the launch surfaces
   *  (Vault, Projects, program reads) live under /api/c2c. */
  concept2cure: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 100,
    maxRequestsAuthenticated: 600,
    maxRequestsPerIpAuthenticated: 3000,
    message: 'Rate limit exceeded for Concept2Cure API.',
  },

  /** Heavy validation endpoints. */
  validation: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 10,
    message: 'Too many validation requests.',
  },

  /** File-upload endpoints. /api/chat/upload is one POST per file, and the Data
   *  room's drop starts them all at once. Per identity: 60 a minute, so a drop
   *  of up to sixty files is filed in one go. Dated 2026-10-08 (QA): at the old
   *  per-identity 10, a fifteen-file drop filed ten and refused five. Still a
   *  cost ceiling: each upload is OCR and a virus scan, and sixty a minute is the
   *  most one identity can make. Anonymous traffic keeps 10 a minute per address. */
  upload: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 10,
    maxRequestsAuthenticated: 60,
    message: 'Too many file uploads. Please wait.',
  },
} as const;

/**
 * Sign-in guessing limits (D6, 2026-09-29; see the header's "Sign-in" note).
 *
 *   failuresPerIp            — FAILED /api/auth requests from one address, any
 *                              account (enterprise-security.ts rateLimiters.auth).
 *                              Spraying across accounts from one address stops
 *                              here; an office's typos and expired sessions do
 *                              not reach it. Was 5 in production.
 *   loginFailuresPerAccount  — failed sign-ins for one address SIGNED IN WITH
 *                              (middleware/sign-in-limits.ts). Beside the
 *                              five-failure lockout, which counts only
 *                              addresses that have an account; this counts all.
 *   mfaFailuresPerAccount    — wrong second-factor codes for one account, keyed
 *                              by the verified challenge's account. Wrong
 *                              authenticator and recovery codes counted nothing
 *                              per account before: only the address's 10.
 *
 * Successful requests are never counted by any of the three.
 */
export const SIGN_IN_LIMITS = {
  failuresPerIp: { windowMs: FIFTEEN_MINUTES_MS, max: IS_PRODUCTION ? 50 : 100 },
  loginFailuresPerAccount: { windowMs: FIFTEEN_MINUTES_MS, max: 10 },
  mfaFailuresPerAccount: { windowMs: FIFTEEN_MINUTES_MS, max: 10 },
} as const;

/**
 * Categories that must FAIL CLOSED when the limiter itself errors. Preserved
 * from redisRateLimiter.ts; see that file's comment for the rationale (auth =
 * brute-force surface, documents and vault_metadata = data-exfiltration surfaces).
 */
export const RATE_LIMIT_FAIL_CLOSED_CATEGORIES = ['auth', 'documents', 'vault_metadata'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITS — legacy in-memory limiter (server/middleware/rateLimiter.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default rate-limit rules for the legacy in-memory limiter. These quotas are
 * INTENTIONALLY different from RATE_LIMITS above — the two middlewares were
 * written independently and are not interchangeable. Values preserved exactly.
 */
export const LEGACY_RATE_LIMITS = {
  /** Authentication APIs — 30 requests / 15 minutes. */
  auth: {
    windowMs: FIFTEEN_MINUTES_MS,
    maxRequests: 30,
    message: 'Too many authentication attempts, please try again later.',
  },

  /** General API endpoints — 60 requests / minute per IP for anonymous
   *  traffic; 600 / minute per verified user. Eleven routers mount this
   *  limiter and share ONE store, so this is the ceiling for a user's traffic
   *  across all of them (submissions, tasks, QMS, …), not per router. */
  api: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 60,
    maxRequestsAuthenticated: 600,
    message: 'Too many requests, please slow down.',
  },

  /** High-intensity validation endpoints — 10 requests / minute. */
  validation: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 10,
    message: 'Too many validation requests, please slow down.',
  },

  /** AI/ML endpoints — 20 requests / minute. */
  ai: {
    windowMs: ONE_MINUTE_MS,
    maxRequests: 20,
    message: 'Too many AI requests, please slow down.',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RATE-LIMIT STORE SIZING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard caps on the in-memory tracking structures, to bound memory growth under
 * a flood of unique keys/IPs.
 */
export const RATE_LIMIT_STORE = {
  /** Legacy limiter: max distinct client IPs tracked (rateLimiter.ts). */
  maxTrackedKeys: 10_000,
  /** Redis limiter in-memory fallback: max entries (redisRateLimiter.ts). */
  memoryStoreMaxSize: 10_000,
  /** Redis limiter fallback cleanup sweep interval, in milliseconds. */
  memoryStoreCleanupIntervalMs: 60_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// REDIS CONNECTION TUNING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redis client tuning for the distributed rate limiter. Defaults preserved from
 * redisRateLimiter.ts; the connection URL itself continues to be sourced from
 * REDIS_URL / REDIS_TLS_URL in the consuming module (not centralized here).
 */
export const REDIS = {
  /** Max retries ioredis attempts per request before erroring. */
  maxRetriesPerRequest: 3,
  /** TCP connection timeout in milliseconds. */
  connectTimeoutMs: 5000,
  /** Linear backoff step per retry attempt (times * step). */
  retryBackoffStepMs: 100,
  /** Upper bound on a single retry backoff delay. */
  retryBackoffCapMs: 2000,
} as const;

// Freeze nested objects so the exported config is deeply immutable at runtime.
// `as const` gives compile-time readonly guarantees; Object.freeze enforces it
// at runtime as well, so accidental mutation throws in strict mode.
Object.freeze(FILE_LIMITS);
Object.freeze(RATE_LIMITS);
Object.freeze(RATE_LIMITS.auth);
Object.freeze(RATE_LIMITS.api);
Object.freeze(RATE_LIMITS.ai);
Object.freeze(RATE_LIMITS.documents);
Object.freeze(RATE_LIMITS.vault_metadata);
Object.freeze(RATE_LIMITS.concept2cure);
Object.freeze(RATE_LIMITS.validation);
Object.freeze(RATE_LIMITS.upload);
Object.freeze(RATE_LIMIT_FAIL_CLOSED_CATEGORIES);
Object.freeze(SIGN_IN_LIMITS);
Object.freeze(SIGN_IN_LIMITS.failuresPerIp);
Object.freeze(SIGN_IN_LIMITS.loginFailuresPerAccount);
Object.freeze(SIGN_IN_LIMITS.mfaFailuresPerAccount);
Object.freeze(LEGACY_RATE_LIMITS);
Object.freeze(LEGACY_RATE_LIMITS.auth);
Object.freeze(LEGACY_RATE_LIMITS.api);
Object.freeze(LEGACY_RATE_LIMITS.validation);
Object.freeze(LEGACY_RATE_LIMITS.ai);
Object.freeze(RATE_LIMIT_STORE);
Object.freeze(REDIS);
