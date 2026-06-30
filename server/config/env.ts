/**
 * Typed environment variable validation (Zod).
 *
 * Validates the ~25 most critical env vars at startup, providing clear
 * error messages for missing or malformed values.  Unknown env vars
 * pass through untouched (`.passthrough()`), so this module can be
 * adopted incrementally without breaking anything.
 *
 * Import this file as early as possible in the boot sequence -- after
 * dotenv loads but before any module that reads process.env.
 *
 * Usage:
 *   import { env } from './config/env';
 *   // env.DATABASE_URL  -- typed, validated, with defaults applied
 *
 * The module also exposes `loadConfig()` for test scenarios that need
 * to re-parse a modified process.env.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce common boolean-like env-var strings to a real boolean.
 * Accepts: true, false, 1, 0, yes, no (case-insensitive).
 * Returns `undefined` for missing/empty values so Zod `.default()` still works.
 */
const booleanEnv = z
  .string()
  .optional()
  .transform((val) => {
    if (val === undefined || val === '') return undefined;
    const lower = val.toLowerCase();
    if (['true', '1', 'yes'].includes(lower)) return true;
    if (['false', '0', 'no'].includes(lower)) return false;
    // Unrecognised value -- treat as undefined rather than crashing
    return undefined;
  });

/**
 * Coerce a string to a positive integer.  Returns undefined when the
 * source string is empty or missing so `.default()` chains work.
 */
const portEnv = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  });

/**
 * Optional string that also accepts an empty string (coerced to undefined).
 */
const optionalString = z.string().optional().transform((v) => (v === '' ? undefined : v));

/**
 * Optional URL string.  Accepts an empty string (treated as "not set")
 * alongside valid URLs.
 */
const optionalUrl = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v))
  .pipe(z.string().url().optional());

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * All fields are individually optional at the Zod level.  Cross-field
 * requirements (e.g. "need at least one of DATABASE_URL or
 * DATABASE_NEON_NEW_SECRET") are enforced via `.superRefine()`.
 */
const envSchema = z
  .object({
    // -- Core / database ------------------------------------------------
    DATABASE_URL: optionalString,
    DATABASE_NEON_NEW_SECRET: optionalString,
    DATABASE_URL_DEV: optionalString,

    // -- JWT ------------------------------------------------------------
    JWT_SECRET: optionalString,
    JWT_SECRET_DEV: optionalString,
    JWT_SECRET_STAGING: optionalString,
    JWT_SECRET_PROD: optionalString,
    JWT_SECRET_PREVIOUS: optionalString,

    // -- Server ---------------------------------------------------------
    NODE_ENV: z
      .enum(['development', 'staging', 'production', 'test'])
      .default('development'),
    PORT: portEnv.default('5000'),
    APP_URL: optionalUrl,
    DEBUG: optionalString,

    // -- AI providers ---------------------------------------------------
    OPENAI_API_KEY: optionalString,
    OPENAI_MODEL: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    LOCAL_AI_BASE_URL: optionalUrl,

    // -- Security -------------------------------------------------------
    AUDIT_HMAC_KEY: optionalString,
    MFA_ENCRYPTION_KEY: optionalString,
    REFRESH_TOKEN_SECRET: optionalString,
    REVIEW_ADMIN_TOKEN: optionalString,
    SESSION_SECRET: optionalString,

    // -- Infrastructure -------------------------------------------------
    REDIS_URL: optionalString,
    SENTRY_DSN: optionalString,
    SHADOW_SERVICE_URL: optionalUrl,
    FHIR_BASE_URL: optionalUrl,

    // -- ClamAV ---------------------------------------------------------
    CLAMAV_HOST: optionalString,
    CLAMAV_PORT: portEnv,

    // -- Billing / Stripe -----------------------------------------------
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_API_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_DISABLED: booleanEnv,

    // -- Feature flags / toggles ----------------------------------------
    SKIP_DB_STARTUP_TEST: booleanEnv,
    AUDIT_TRAIL_ENABLED: booleanEnv,
    ENABLE_DRIFT_SENTINEL: booleanEnv,
    ENABLE_CORPUS_INGESTION: booleanEnv,
    ENABLE_REGULATORY_HORIZON_SCAN: booleanEnv,
    ENABLE_EXTERNAL_INTELLIGENCE: booleanEnv,
    ENABLE_EXPERIMENTAL_ROUTES: booleanEnv,
    ENABLE_DEMO_ROUTES: booleanEnv,
    ENABLE_TEST_ROUTES: booleanEnv,
    STRICT_STARTUP_INVARIANTS: booleanEnv,
    SECURITY_HEALTH_DISABLE_SCHEDULER: booleanEnv,
    ALLOW_DEV_AUTH: booleanEnv,
    SEED_DEMO_USER: booleanEnv,
    SINGLE_TENANT_MODE: booleanEnv,
  })
  // Let every other env var pass through without failing validation.
  .passthrough()
  // Cross-field validation rules.
  .superRefine((data, ctx) => {
    // At least one database connection string must be present.
    const hasDbUrl = Boolean(data.DATABASE_URL || data.DATABASE_NEON_NEW_SECRET);
    if (!hasDbUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message:
          'At least one of DATABASE_URL or DATABASE_NEON_NEW_SECRET must be set',
      });
    }

    // At least one JWT signing secret must be present.
    const hasJwt = Boolean(
      data.JWT_SECRET || data.JWT_SECRET_DEV || data.JWT_SECRET_STAGING || data.JWT_SECRET_PROD,
    );
    if (!hasJwt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'At least one of JWT_SECRET, JWT_SECRET_DEV, JWT_SECRET_STAGING, or JWT_SECRET_PROD must be set',
      });
    }

    // When JWT_SECRET is the one being used, enforce minimum length.
    if (data.JWT_SECRET && data.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 32,
        type: 'string',
        inclusive: true,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be at least 32 characters for HS256 security',
      });
    }
  });

// ---------------------------------------------------------------------------
// Exported type
// ---------------------------------------------------------------------------

/** The validated + transformed shape of process.env. */
export type Env = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Parse and validate `process.env` through the Zod schema.
 *
 * Returns the validated config on success.  On failure, prints a
 * developer-friendly summary to stderr and exits with code 1.
 *
 * Call this at most once per process lifecycle.  For tests that
 * need to re-validate after mutating process.env, call `loadConfig()`
 * directly instead of relying on the singleton.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    console.error(
      [
        '',
        '='.repeat(70),
        'ENVIRONMENT VALIDATION FAILED',
        '='.repeat(70),
        ...lines,
        '',
        'Fix the variables above and restart the server.',
        '='.repeat(70),
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  return result.data as Env;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Validated environment config singleton.
 *
 * Parsed eagerly on first import so downstream code can trust the
 * values without re-checking.  The `loadConfig` export exists for
 * test code that needs to re-parse a modified `process.env`.
 */
export const env: Env = loadConfig();
