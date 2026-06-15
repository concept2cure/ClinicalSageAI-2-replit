/**
 * External-validation readiness gate (EVALIDATOR_INTEGRATION_SPEC.md, "fail closed").
 *
 * A real agency submission should not dispatch when an external validator reports
 * error-severity findings — and, when external validation is MANDATED for a
 * deployment, should not dispatch at all without a report. This module is the
 * provable, opt-in gate that enforces that, mirroring `pdfa-readiness.ts`:
 *
 *   - Enforcement is opt-in via `ECTD_REQUIRE_EVALIDATOR=true` (set only in
 *     deployments where external validation is guaranteed to run), so the DEFAULT
 *     (flag-off) behaviour is unchanged and existing dispatch tests stay green.
 *   - It blocks only when required AND the submission is for production AND the
 *     report is missing OR has error-severity findings. Staging and the flag-off
 *     default never block (they report for visibility).
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network, no LLM — same shape as
 * `dispatch-gate.ts` / `pdfa-readiness.ts`.
 *
 * @module server/services/ectd/external-validator/evaluate-external-validation
 */

import type { ExternalValidationReport } from './types';

export interface ExternalValidationGateInput {
  /** The latest external validation report, or null/undefined when none exists. */
  report: ExternalValidationReport | null | undefined;
  /**
   * Whether external validation is required for this package. Wire from
   * `ECTD_REQUIRE_EVALIDATOR`. When false the gate never blocks (it only reports),
   * preserving the default behaviour.
   */
  requireExternalValidation: boolean;
  /** 'production' = real agency submission; 'staging' = dry-run/pre-prod. */
  environment: 'staging' | 'production';
}

export interface ExternalValidationGateResult {
  /** True only when no hard blocker is present. */
  cleared: boolean;
  blockers: string[];
  /** Error count folded into the dispatch gate (0 when no report). */
  errorCount: number;
  /** Warning count, for visibility (never blocks). */
  warningCount: number;
  /** True when a report was supplied. */
  reportPresent: boolean;
}

/**
 * Evaluate the external-validation gate. It blocks only when external validation
 * is required AND the submission is for production AND (the report is missing OR
 * it has error-severity findings) — the precise "do not dispatch a production
 * submission that failed, or was never run through, external validation" rule.
 * Staging and `requireExternalValidation:false` never block.
 */
export function assessExternalValidationReadiness(
  input: ExternalValidationGateInput,
): ExternalValidationGateResult {
  const report = input.report ?? null;
  const reportPresent = report != null;
  const errorCount = report ? (Number.isFinite(report.errorCount) ? report.errorCount : 0) : 0;
  const warningCount = report ? (Number.isFinite(report.warningCount) ? report.warningCount : 0) : 0;
  const blockers: string[] = [];

  if (input.requireExternalValidation && input.environment === 'production') {
    if (!reportPresent) {
      blockers.push(
        'External eCTD validation is required for this production submission but no validation ' +
          'report is available. Run an external validator (or the internal-criteria adapter) and ' +
          'persist its report before dispatch, or clear ECTD_REQUIRE_EVALIDATOR only for non-submission builds.',
      );
    } else if (errorCount > 0) {
      blockers.push(
        `External validation reported ${errorCount} error-severity finding(s) ` +
          `(validator: ${report?.validatorName ?? 'unknown'} ${report?.validatorVersion ?? ''}). ` +
          'A production eCTD submission must resolve all external-validation errors before dispatch.',
      );
    }
  }

  return { cleared: blockers.length === 0, blockers, errorCount, warningCount, reportPresent };
}

/** Read the opt-in enforcement flag from the environment. */
export function externalValidationRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ECTD_REQUIRE_EVALIDATOR ?? '').toLowerCase() === 'true';
}

export default { assessExternalValidationReadiness, externalValidationRequiredFromEnv };
