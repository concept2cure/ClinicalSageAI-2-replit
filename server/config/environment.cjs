/**
 * CommonJS environment config shim
 *
 * The main implementation is TypeScript/ESM in `environment.ts`, but several legacy
 * CommonJS modules use `require()` and cannot import TS/ESM directly.
 *
 * Keep this minimal and safe: do not throw on missing DATABASE_URL.
 */

const getCurrentEnvironment = () => {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (env === 'development' || env === 'staging' || env === 'production') return env;
  return 'development';
};

const ENV = getCurrentEnvironment();

const ENV_MAP = {
  development: 'DEV',
  staging: 'STAGING',
  production: 'PROD',
};

const getJwtSecret = () => {
  const suffix = ENV_MAP[ENV];
  const envVar = `JWT_SECRET_${suffix}`;
  const secret = process.env[envVar];

  if (!secret) {
    if (ENV === 'development') {
      return 'dev-secret-key-for-local-development-only-2024';
    }
    // In production/staging, prefer to fail closed.
    throw new Error(`Missing required environment variable: ${envVar}`);
  }

  return secret;
};

const config = {
  env: ENV,
  isProduction: ENV === 'production',
  isStaging: ENV === 'staging',
  isDevelopment: ENV === 'development',
  jwt: {
    secret: getJwtSecret(),
    expiresIn: '1d',
  },
};

module.exports = { config };
