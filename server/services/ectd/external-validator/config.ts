/**
 * External-validator configuration (env-driven, like the PDF/A and DTD gates).
 *
 * @module server/services/ectd/external-validator/config
 */

import type { EctdRegion } from './types';

/** Path/endpoint to the licensed engine (LORENZ eValidator). Absent ⇒ not configured. */
export function evalidatorBinary(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.EVALIDATOR_BINARY || env.EVALIDATOR_ENDPOINT || undefined;
}

/** Per-region validation profile id (tracks the agency's quarterly criteria refreshes). */
export function evalidatorProfile(
  region: EctdRegion,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[`EVALIDATOR_PROFILE_${region.toUpperCase()}`];
}

/** Opt-in production enforcement: block dispatch when the agency validator can't run. */
export function evalidatorRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ECTD_REQUIRE_EVALIDATOR ?? '').toLowerCase() === 'true';
}
