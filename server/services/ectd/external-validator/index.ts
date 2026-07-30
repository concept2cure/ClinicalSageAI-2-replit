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

import type { ExternalValidator, ExternalValidationReport, ValidateArgs } from './types';
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

/**
 * Resolve the active external validator, run it against an unzipped package, and
 * return its report. A configured engine that THROWS (spawn/parse failure) is
 * caught and reported as a fail-closed un-run report (ran:false, passed:false) —
 * never a fabricated pass — so the dispatch gate blocks under
 * ECTD_REQUIRE_EVALIDATOR. Callers feed this into evaluateExternalValidationGate.
 */
export async function runExternalValidation(args: ValidateArgs): Promise<ExternalValidationReport> {
  const validator = await resolveExternalValidator();
  try {
    return await validator.validate(args);
  } catch (err) {
    return {
      validator: validator.name,
      profile: args.profile ?? args.region,
      ranAt: new Date(),
      ran: false,
      findings: [{
        ruleId: 'EVALIDATOR-RUN-FAILED',
        severity: 'error',
        message: `External validator "${validator.name}" failed to run: ${err instanceof Error ? err.message : String(err)}`,
      }],
      errorCount: 0, // un-run: not counted as content errors, but ran:false blocks when required
      warningCount: 0,
      passed: false,
    };
  }
}

export default { resolveExternalValidator, runExternalValidation };
