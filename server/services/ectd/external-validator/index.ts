/**
 * External eCTD validator seam — barrel + resolver.
 *
 * Resolves the active validator: the licensed LORENZ adapter when configured,
 * else the fail-closed no-op. The dispatch-readiness wrapper calls
 * `resolveExternalValidator()`, runs `validate()` on the unzipped package, and
 * feeds the result through `evaluateExternalValidationGate` (see gate.ts).
 *
 * @module server/services/ectd/external-validator
 */

export * from './types';
export * from './config';
export * from './gate';
export { NoopExternalValidator } from './noop-validator';
export { LorenzEValidatorAdapter } from './lorenz-adapter';
export { FdaCriteriaValidatorAdapter, validateFdaCriteria, fdaCriteriaFallbackEnabled } from './fda-criteria-adapter';

import type { ExternalValidator } from './types';
import { NoopExternalValidator } from './noop-validator';
import { LorenzEValidatorAdapter } from './lorenz-adapter';
import { FdaCriteriaValidatorAdapter } from './fda-criteria-adapter';

/**
 * The active external validator, in preference order:
 *   1. licensed LORENZ engine when configured (the real agency-grade validator);
 *   2. the opt-in, license-free FDA-criteria subset (EVALIDATOR_USE_FDA_CRITERIA_FALLBACK)
 *      — raises the floor but is explicitly NOT a substitute for the agency validator;
 *   3. the fail-closed no-op (honest about not having run; keeps the dispatch gate
 *      fail-closed under ECTD_REQUIRE_EVALIDATOR).
 */
export async function resolveExternalValidator(): Promise<ExternalValidator> {
  const lorenz = new LorenzEValidatorAdapter();
  if (await lorenz.isConfigured()) return lorenz;
  const fdaCriteria = new FdaCriteriaValidatorAdapter();
  if (await fdaCriteria.isConfigured()) return fdaCriteria;
  return new NoopExternalValidator();
}

export default { resolveExternalValidator };
