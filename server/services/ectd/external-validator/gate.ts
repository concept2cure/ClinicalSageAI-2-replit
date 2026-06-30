/**
 * External-validation dispatch gate (pure) — the fail-closed decision logic.
 *
 * Folds an external (agency-grade) validation report into the dispatch decision,
 * mirroring the PDF/A and DTD gates. Two effects:
 *   1. `externalErrorCount` is the number the caller adds to the existing
 *      `evaluateDispatchGate` `validationErrors` total (error ⇒ hard block, the
 *      agency model).
 *   2. A `requireEvalidator` production build whose validation could NOT run
 *      (engine unconfigured, or it threw) is itself a blocker — you cannot prove
 *      the package passes the agency validator, so you must not transmit.
 *
 * Staging / flag-unset is advisory: errors are surfaced for visibility but this
 * gate adds no blocker (consistent with PDF/A and DTD defaults).
 *
 * @module server/services/ectd/external-validator/gate
 */

import type { ExternalValidationReport } from './types';

export interface ExternalValidationGateInput {
  /** The report, or null when validation was not attempted / the engine threw. */
  report: ExternalValidationReport | null;
  /** Whether a licensed engine is configured (isConfigured()). */
  configured: boolean;
  /** Wired from ECTD_REQUIRE_EVALIDATOR. */
  requireEvalidator: boolean;
  environment: 'staging' | 'production';
}

export interface ExternalValidationGateResult {
  /** Error count to fold into the dispatch gate's `validationErrors`. */
  externalErrorCount: number;
  /** True when the external engine actually executed. */
  ran: boolean;
  /** True when a licensed engine is configured. */
  configured: boolean;
  blockers: string[];
  /** True when this gate adds no blocker. */
  cleared: boolean;
}

export function evaluateExternalValidationGate(
  input: ExternalValidationGateInput,
): ExternalValidationGateResult {
  const ran = !!input.report?.ran;
  const externalErrorCount = input.report?.errorCount ?? 0;
  const blockers: string[] = [];

  const enforced = input.requireEvalidator && input.environment === 'production';

  if (enforced && (!input.configured || !ran)) {
    blockers.push(
      'External agency-grade eValidator is required for a production dispatch but did not run ' +
        `(configured=${input.configured}, ran=${ran}). Configure EVALIDATOR_BINARY/EVALIDATOR_ENDPOINT ` +
        'and a region profile, or clear ECTD_REQUIRE_EVALIDATOR for non-production builds. ' +
        'See docs/legacy/EVALIDATOR_INTEGRATION_SPEC.md.',
    );
  }

  if (enforced && ran && externalErrorCount > 0) {
    blockers.push(
      `External eValidator reported ${externalErrorCount} error-severity finding(s); ` +
        'the agency would reject this package. Resolve them before dispatch.',
    );
  }

  return {
    externalErrorCount,
    ran,
    configured: input.configured,
    blockers,
    cleared: blockers.length === 0,
  };
}
