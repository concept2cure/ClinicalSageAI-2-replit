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

import type { ExternalValidator } from './types';
import { NoopExternalValidator } from './noop-validator';
import { LorenzEValidatorAdapter } from './lorenz-adapter';

/**
 * The active external validator. Returns the licensed engine adapter when it is
 * configured; otherwise the no-op (which is honest about not having run, keeping
 * the dispatch gate fail-closed under ECTD_REQUIRE_EVALIDATOR).
 */
export async function resolveExternalValidator(): Promise<ExternalValidator> {
  const lorenz = new LorenzEValidatorAdapter();
  if (await lorenz.isConfigured()) return lorenz;
  return new NoopExternalValidator();
}

export default { resolveExternalValidator };
