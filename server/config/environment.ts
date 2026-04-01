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

const getJwtSecret = (): string => {
  const suffix = ENV_MAP[ENV];
  const envVar = `JWT_SECRET_${suffix}`;
  const secret = process.env[envVar];

  // If the environment-specific secret is set, use it
  if (secret) {
    return secret;
  }

  // Fall back to generic JWT_SECRET
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  throw new Error(
    `[FATAL] Missing required JWT secret. ` +
      `Set ${envVar} or JWT_SECRET to a secure random string of at least 32 characters.`
  );
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
};

export default config;
