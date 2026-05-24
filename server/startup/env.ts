/**
 * Environment validation, debug logging, and feature flags.
 *
 * Extracted from server/index.ts as part of the composition-root refactor.
 * Behavior preserved: same required-var rules, same JWT lookup, same
 * warnings, same hard-exit on missing critical vars.
 */

import { assertNoStaticDataFlagsInProduction } from '../middleware/staticDataGuard';

export interface StartupFlags {
  /** Resolved listen port (PORT env, default 5000). */
  port: number;
  /** Debug logging enabled in dev / when DEBUG is set. */
  debug: boolean;
  /** Experimental route families allowed to mount (non-prod only). */
  experimentalRoutesEnabled: boolean;
  /** Demo route families allowed to mount (non-prod only). */
  demoRoutesEnabled: boolean;
}

export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const required: string[] = ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET'].some(k => process.env[k])
    ? []
    : ['DATABASE_URL'];

  const jwtEnvByNodeEnv: Record<string, string> = {
    development: 'JWT_SECRET_DEV',
    staging: 'JWT_SECRET_STAGING',
    production: 'JWT_SECRET_PROD',
  };
  const envSpecificJwt = jwtEnvByNodeEnv[process.env.NODE_ENV || 'development'];
  const hasJwtSecret = Boolean(
    process.env.JWT_SECRET || (envSpecificJwt && process.env[envSpecificJwt])
  );
  if (!hasJwtSecret) {
    required.push('JWT_SECRET');
  }

  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    assertNoStaticDataFlagsInProduction(process.env.NODE_ENV, process.env);
  } catch (error: any) {
    console.error(`[FATAL] ${error?.message || 'Invalid static-data route configuration'}`);
    process.exit(1);
  }

  // Production posture gate. The dev-only / mock / demo route families gate
  // non-durable and fabricated handlers (e.g. the in-memory ana-features
  // memory store and the static change-impact response). Their handlers also
  // re-check NODE_ENV, but a flag flipped on in a production deploy is a
  // misconfiguration we want to catch at boot — not silently tolerate. Refuse
  // to start rather than serve a dev surface to paying customers.
  if (isProduction) {
    const PROD_FORBIDDEN_FLAGS = [
      'ENABLE_ANA_FEATURES_MOCK_ROUTES',
      'ENABLE_EXPERIMENTAL_ROUTES',
      'ENABLE_DEMO_ROUTES',
    ];
    const enabled = PROD_FORBIDDEN_FLAGS.filter(k => process.env[k] === 'true');
    if (enabled.length > 0) {
      console.error(
        `[FATAL] Dev/mock route flags must not be enabled in production: ${enabled.join(', ')}`,
      );
      process.exit(1);
    }
  }

  if (isProduction) {
    const recommended = ['SENTRY_DSN', 'REDIS_URL'];
    const missingRecommended = recommended.filter(k => !process.env[k]);
    if (missingRecommended.length > 0) {
      console.warn(`⚠️  Recommended env vars not set: ${missingRecommended.join(', ')}`);
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('');
    console.warn('='.repeat(70));
    console.warn('⚠️  ANTHROPIC_API_KEY not set — AI features will be unavailable');
    console.warn('   Set ANTHROPIC_API_KEY in your environment to enable AI capabilities.');
    console.warn('='.repeat(70));
    console.warn('');
  }
}

export function resolveStartupFlags(): StartupFlags {
  const debug =
    process.env.NODE_ENV !== 'production' &&
    Boolean(process.env.DEBUG || process.env.NODE_ENV === 'development');
  return {
    port: Number(process.env.PORT || 5000),
    debug,
    experimentalRoutesEnabled:
      process.env.ENABLE_EXPERIMENTAL_ROUTES === 'true' && process.env.NODE_ENV !== 'production',
    demoRoutesEnabled:
      process.env.ENABLE_DEMO_ROUTES === 'true' && process.env.NODE_ENV !== 'production',
  };
}

export function createDebugLogger(debug: boolean) {
  return (message: string, data?: any) => {
    if (debug) {
      console.log(`[DEBUG ${new Date().toISOString()}] ${message}`, data || '');
    }
  };
}
