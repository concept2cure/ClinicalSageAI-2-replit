/**
 * Environment Configuration Manager
 *
 * This module manages environment-specific configuration by selecting the appropriate
 * secrets and settings based on the current NODE_ENV (development, staging, production).
 * It provides a centralized access point for environment variables to prevent hardcoding
 * across the application.
 */


type Environment = 'development' | 'staging' | 'production';

// Determine current environment with fallback to development
const getCurrentEnvironment = (): Environment => {
  const env = process.env.NODE_ENV?.toLowerCase() || 'development';
  if (['development', 'staging', 'production'].includes(env)) {
    return env as Environment;
  }
  console.warn(`Unknown environment "${env}", defaulting to "development"`);
  return 'development';
};

const ENV: Environment = getCurrentEnvironment();

// Map environment names to their corresponding secret suffixes
const ENV_MAP: Record<Environment, string> = {
  development: 'DEV',
  staging: 'STAGING',
  production: 'PROD',
};

/**
 * Clean a database URL by removing common wrapper artifacts
 * like `psql '...'` that can be accidentally copied from terminal commands
 */
function cleanDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let cleaned = url;

  // Remove psql command wrapper if present: psql 'postgresql://...' or psql "postgresql://..."
  if (cleaned.startsWith('psql ')) {
    cleaned = cleaned.substring(5); // Remove 'psql '
  }

  // Remove surrounding quotes (single or double)
  if (
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('"') && cleaned.endsWith('"'))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

// Centralize access to environment-specific secrets
const getDatabaseUrl = (): string => {
  // First priority: DATABASE_NEON_NEW_SECRET (new unified connection)
  if (process.env.DATABASE_NEON_NEW_SECRET) {
    return cleanDatabaseUrl(process.env.DATABASE_NEON_NEW_SECRET) || '';
  }

  const suffix = ENV_MAP[ENV];
  const envVar = `DATABASE_URL_${suffix}`;
  const url = process.env[envVar];

  if (!url) {
    // Fallback to the generic DATABASE_URL if environment-specific one is not available
    if (process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL) {
      console.warn(`${envVar} not found, using DATABASE_URL as fallback`);
      return process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
    }
    throw new Error(`Missing required environment variable: ${envVar}`);
  }

  return url;
};

// Minimum entropy for the HMAC secret used to sign JWTs. 32 bytes is the
// floor for HS256 — a shorter secret is brute-forceable. Enforced at
// config-load time so a misconfigured deployment fails fast rather than
// silently issuing weak tokens.
const JWT_SECRET_MIN_LENGTH = 32;

const getJwtSecret = (): string => {
  const suffix = ENV_MAP[ENV];
  const envVar = `JWT_SECRET_${suffix}`;
  const candidate = process.env[envVar] ?? process.env.JWT_SECRET;

  if (!candidate) {
    throw new Error(
      `[FATAL] Missing required JWT secret. ` +
        `Set ${envVar} or JWT_SECRET to a secure random string of at least ${JWT_SECRET_MIN_LENGTH} characters.`,
    );
  }

  if (candidate.length < JWT_SECRET_MIN_LENGTH) {
    // Don't echo the value or even the source env var in the message —
    // log messages flow to many destinations and the source var name
    // narrows where to look for the leak.
    throw new Error(
      `[FATAL] JWT secret too short: ${candidate.length} characters. ` +
        `Minimum is ${JWT_SECRET_MIN_LENGTH}. Use a cryptographically random value.`,
    );
  }

  return candidate;
};

/**
 * Previous JWT secret used during zero-downtime rotation.
 *
 * Rotation procedure:
 *   1. Operator sets JWT_SECRET_PREVIOUS (or _PREVIOUS_<ENV>) to the
 *      current secret.
 *   2. Operator sets JWT_SECRET (or _<ENV>) to a fresh random value.
 *   3. Deploy. From here, every NEW token is signed with the new
 *      secret; every EXISTING token still verifies because the
 *      verifier tries the current then falls back to the previous.
 *   4. After at least 24h (the access-token TTL — see
 *      server/routes/auth.ts JWT_EXPIRES_IN), clear
 *      JWT_SECRET_PREVIOUS. From there, only tokens signed with the
 *      new secret will verify.
 *
 * Without the previous-secret slot, a rotation invalidates every
 * active session simultaneously — a 401 storm with no graceful
 * transition. This is the operational tool that makes rotation
 * feasible.
 *
 * Returns undefined when rotation isn't in progress.
 */
const getJwtPreviousSecret = (): string | undefined => {
  const suffix = ENV_MAP[ENV];
  const envVar = `JWT_SECRET_PREVIOUS_${suffix}`;
  const candidate = process.env[envVar] ?? process.env.JWT_SECRET_PREVIOUS;

  if (!candidate) return undefined;

  if (candidate.length < JWT_SECRET_MIN_LENGTH) {
    // Same posture as the primary secret — too-short means
    // misconfigured rotation, fail loud.
    throw new Error(
      `[FATAL] JWT previous secret too short: ${candidate.length} characters. ` +
        `Minimum is ${JWT_SECRET_MIN_LENGTH}.`,
    );
  }

  return candidate;
};

// Export configuration for the current environment
export const config = {
  env: ENV,
  isProduction: ENV === 'production',
  isStaging: ENV === 'staging',
  isDevelopment: ENV === 'development',
  database: {
    url: getDatabaseUrl(),
  },
  jwt: {
    secret: getJwtSecret(),
    /** Active during zero-downtime rotation only — see getJwtPreviousSecret. */
    previousSecret: getJwtPreviousSecret(),
    expiresIn: '1d', // Default JWT expiration
  },
  api: {
    openai: {
      key: process.env.OPENAI_API_KEY || '',
    },
    pubmed: {
      key: process.env.PUBMED_API_KEY || '',
    },
  },
  storage: {
    s3VaultBucketKey: process.env.S3_VAULT_BUCKET_KEY || '',
  },
  // Safety limits to prevent abuse
  safety: {
    maxRequestSizeBytes: 10 * 1024 * 1024, // 10MB
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  },
  // DocuShare integration - lazy loaded only when configured
  // See .env.example for all 22 DocuShare configuration options
  docushare: process.env.DOCUSHARE_API_URL
    ? {
        enabled: true,
        apiUrl: process.env.DOCUSHARE_API_URL,
        apiVersion: process.env.DOCUSHARE_API_VERSION || '7.5',
        apiKey: process.env.DOCUSHARE_API_KEY || '',
        oemId: process.env.DOCUSHARE_OEM_ID || '',
        tenantIsolation: process.env.DOCUSHARE_TENANT_ISOLATION === 'true',
        maxFileSize: parseInt(process.env.DOCUSHARE_MAX_FILE_SIZE || '104857600', 10),
        connectionTimeout: parseInt(process.env.DOCUSHARE_CONNECTION_TIMEOUT || '30000', 10),
      }
    : {
        enabled: false,
      },
  // Single-tenant / private install controls.
  singleTenant: {
    enabled: process.env.SINGLE_TENANT_MODE === 'true',
    /**
     * Tier assigned to orgs created on a private install. Defaults to
     * 'enterprise' in single-tenant mode (all features on for the one tenant),
     * otherwise empty (multi-tenant signup keeps its own default).
     */
    defaultOrgTier:
      process.env.DEFAULT_ORG_TIER ||
      (process.env.SINGLE_TENANT_MODE === 'true' ? 'enterprise' : ''),
  },
  // Billing / Stripe. Treated as disabled when explicitly turned off via
  // STRIPE_DISABLED or when no Stripe key is configured at all.
  billing: {
    stripeDisabled:
      process.env.STRIPE_DISABLED === 'true' ||
      !(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY),
  },
};

export default config;
