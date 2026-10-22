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
  /**
   * Test/QA-only route families (test-assembly, integration-test) allowed to
   * mount. Never in production: ENABLE_TEST_ROUTES=true, once an escape hatch
   * for production smoke tests, is refused there at boot (MR-03 OPS-28).
   */
  testRoutesEnabled: boolean;
}

/**
 * Production refuses the dev/mock/test route flags, AUTH_BOUNDARY_MODE=warn and
 * SECURITY_SELF_TEST_NONBLOCKING=true at boot: a flag flipped on in a production
 * deploy is a misconfiguration to catch before a dev surface is served to
 * customers (security audit 2026-09-24, IAM-16), or before a process with a
 * failing security self-test serves anyone (MR-08). The hosted deployment also
 * refuses every operator override (P-43; refuseHostedOverrides below).
 */
function refuseForbiddenProductionPosture(): void {
  const PROD_FORBIDDEN_FLAGS = [
    'ENABLE_ANA_FEATURES_MOCK_ROUTES',
    'ENABLE_EXPERIMENTAL_ROUTES',
    'ENABLE_DEMO_ROUTES',
    // Test-assembly and integration-test routes (MR-03 OPS-28). Nothing sets
    // it, and test routes have no production use.
    'ENABLE_TEST_ROUTES',
  ];
  const enabled = PROD_FORBIDDEN_FLAGS.filter(k => process.env[k] === 'true');
  if (enabled.length > 0) {
    console.error(
      `[FATAL] Dev/mock route flags must not be enabled in production: ${enabled.join(', ')}`,
    );
    process.exit(1);
  }

  // The /api boundary is default-deny in production. `warn` mode (log the
  // unauthenticated request and let it through) exists for the staging soak;
  // an explicit AUTH_BOUNDARY_MODE=warn in a production deploy is a
  // misconfiguration that would turn default-deny off with an info log, so it
  // is refused at boot like the flags above (security audit 2026-09-24,
  // IAM-16). resolveAuthBoundaryMode() also coerces it to enforce, for any
  // entry point that mounts the boundary without passing through here.
  const boundaryMode = (process.env.AUTH_BOUNDARY_MODE || '').trim().toLowerCase();
  if (boundaryMode === 'warn') {
    console.error(
      '[FATAL] AUTH_BOUNDARY_MODE=warn is not permitted in production: the /api boundary is ' +
        'default-deny there. Unset the variable or set AUTH_BOUNDARY_MODE=enforce.',
    );
    process.exit(1);
  }

  // The boot security self-test (startup/security-self-test.ts) exits a
  // production process on a critical failure: no virus scanner, a weak JWT
  // secret, a broken audit chain. SECURITY_SELF_TEST_NONBLOCKING=true skipped
  // that exit, so one environment line let production boot with every critical
  // failure at once, the scanner MR-08 requires included. Nothing in the
  // repository sets it for production (docs/evidence/MR-08/2026-10-18/stage-1/
  // fix-round/nonblocking-grep.txt). Refused here like the flags above; outside
  // production it is accepted, and there the self-test never blocks boot.
  const nonblocking = (process.env.SECURITY_SELF_TEST_NONBLOCKING || '').trim().toLowerCase();
  if (nonblocking === 'true') {
    console.error(
      '[FATAL] SECURITY_SELF_TEST_NONBLOCKING=true is not permitted in production: a critical ' +
        'security self-test failure must stop the boot. Unset the variable and fix the failing check.',
    );
    process.exit(1);
  }

  refuseHostedOverrides(process.env);
  refuseHostedOwnerCredential(process.env);
}

/** Set by the ECS agent in every task; a task definition cannot remove it. */
function isEcsTask(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.ECS_CONTAINER_METADATA_URI_V4 || env.ECS_CONTAINER_METADATA_URI);
}

/**
 * The hosted deployment refuses every operator override (decision P-43,
 * docs/LAUNCH_DEFINITION_OF_DONE.md; MR-03 SEC-18).
 *
 * Each *_ACCEPT_* variable switches a production refusal off on the operator's
 * written word: an unsealed audit chain, a permissive AI gate, vault documents
 * on local disk, an HMAC signer, fixed AI responses. A self-hosted install (the
 * compose install SKU) needs some of them and keeps them. The hosted stack
 * needs none, and until this check only the deploy preflight kept them out
 * (deploy-aws.yml), so a revision registered or edited outside the pipeline
 * booted with one. The rule is the name's shape, so a later override is
 * covered too; any value but `false` is an acceptance. AUDIT_REQUIRE_ENFORCE=false
 * is the same kind of statement and is refused with them.
 */
function refuseHostedOverrides(env: NodeJS.ProcessEnv): void {
  if (!isEcsTask(env)) return;
  const accepted = Object.keys(env)
    .filter(k => /^[A-Z0-9_]+_ACCEPT_[A-Z0-9_]+$/.test(k))
    .filter(k => {
      const v = (env[k] ?? '').trim().toLowerCase();
      return v !== '' && v !== 'false';
    })
    .sort();
  if ((env.AUDIT_REQUIRE_ENFORCE ?? '').trim().toLowerCase() === 'false') {
    accepted.push('AUDIT_REQUIRE_ENFORCE=false');
  }
  if (accepted.length > 0) {
    console.error(
      `[FATAL] Operator overrides are not permitted on the hosted deployment (an ECS task): ` +
        `${accepted.join(', ')}. Each switches a production refusal off. Remove it from the ` +
        'task definition (terraform/stack); a self-hosted install may keep it.',
    );
    process.exit(1);
  }
}

/**
 * Every name a production process reads a database owner's URL from, and the
 * password app_service is minted with (MR-03 Stage 3, OPS-16; MR-05 DATA-03).
 * The owner role owns every table and bypasses RLS. The hosted API serves as
 * app_service (APP_DATABASE_URL) and creates no schema, and only the one-off
 * database task carries these (terraform/modules/ecs-fargate). deploy-aws.yml's
 * preflight refuses the same names on the API task definition;
 * env-hosted-owner-credential.test.ts holds the two lists together.
 */
export const HOSTED_OWNER_CREDENTIAL_NAMES = [
  'DATABASE_URL',
  'DATABASE_URL_PROD',
  'DATABASE_NEON_NEW_SECRET',
  'NEON_DATABASE_URL',
  'DATABASE_OWNER_URL',
  'APP_SERVICE_DB_PASSWORD',
] as const;

/**
 * On the hosted deployment the API refuses to boot holding the owner's
 * credential. The deploy preflight keeps it out of every revision the pipeline
 * rolls; this keeps it out of one registered or edited outside the pipeline,
 * as refuseHostedOverrides does for the overrides (P-43). A self-hosted install
 * keeps its owner URL: it migrates from the same host.
 */
function refuseHostedOwnerCredential(env: NodeJS.ProcessEnv): void {
  if (!isEcsTask(env)) return;
  const held = HOSTED_OWNER_CREDENTIAL_NAMES.filter(k => (env[k] ?? '').trim() !== '');
  if (held.length > 0) {
    console.error(
      `[FATAL] The database owner's credential is not permitted in the API on the hosted deployment ` +
        `(an ECS task): ${held.join(', ')}. That role owns every table and bypasses RLS; the API ` +
        'serves as app_service (APP_DATABASE_URL), and only the one-off database task holds it. ' +
        'Remove it from the API task definition (terraform/stack).',
    );
    process.exit(1);
  }
}

export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  // Production serves from the runtime role (APP_DATABASE_URL, NOSUPERUSER
  // NOBYPASSRLS) and needs nothing else: the owner credential is the deploy's,
  // and the boot creates no schema (MR-03 Stage 3, OPS-16). Elsewhere any one
  // database URL will do, as before.
  const required: string[] = isProduction
    ? ['APP_DATABASE_URL']
    : ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'APP_DATABASE_URL'].some(k => process.env[k])
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
  if (isProduction) refuseForbiddenProductionPosture();

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
    testRoutesEnabled: process.env.NODE_ENV !== 'production',
  };
}

export function createDebugLogger(debug: boolean) {
  return (message: string, data?: any) => {
    if (debug) {
      console.log(`[DEBUG ${new Date().toISOString()}] ${message}`, data || '');
    }
  };
}
