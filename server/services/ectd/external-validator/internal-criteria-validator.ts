/**
 * Deterministic, OFFLINE external-validator adapter.
 *
 * Implements the vendor-neutral `ExternalValidator` seam by running the
 * platform's EXISTING internal eCTD structural checks (`computeDispatchReadiness`
 * over the canonical leaves) and PROJECTING the result into the normalized
 * `ExternalValidationReport` shape. No network, no filesystem, no LLM — fully
 * testable offline, and the only external-validator exercised in CI.
 *
 * This is deliberately NOT a fake green: it reuses the same deterministic finding
 * computation that already feeds the dispatch gate, so a clean dossier projects an
 * empty report and a structurally broken one projects errors. It is the honest,
 * license-free stand-in for the proprietary agency validators until one is wired.
 *
 * PURE + DETERMINISTIC.
 *
 * @module server/services/ectd/external-validator/internal-criteria-validator
 */

import {
  computeDispatchReadiness,
  type ReadinessLeaf,
  type ReadinessFinding,
  type ComputeReadinessOptions,
} from '../dispatch-readiness';
import type {
  ExternalValidator,
  ExternalValidationInput,
  ExternalValidationReport,
  ExternalValidationFinding,
} from './types';

export const INTERNAL_VALIDATOR_NAME = 'internal-criteria';
export const INTERNAL_VALIDATOR_VERSION = '1.0.0';

/** The structured payload the internal adapter validates. */
export interface InternalCriteriaPayload {
  leaves: ReadinessLeaf[];
  options?: ComputeReadinessOptions;
}

/** Project a deterministic readiness finding into the vendor-neutral shape. */
function projectFinding(f: ReadinessFinding): ExternalValidationFinding {
  return {
    severity: f.severity,
    ruleId: f.code,
    message: f.message,
    ...(f.sectionCode ? { location: f.sectionCode } : {}),
  };
}

/**
 * Run the internal eCTD checks over the supplied leaves and project them into an
 * `ExternalValidationReport`. Pure: `ranAt` is the only non-deterministic field
 * and can be pinned via `now` for tests.
 */
export function runInternalCriteriaValidation(
  payload: InternalCriteriaPayload,
  now: Date = new Date(),
): ExternalValidationReport {
  const readiness = computeDispatchReadiness(payload.leaves ?? [], payload.options ?? {});
  const findings = readiness.findings.map(projectFinding);
  return {
    validatorName: INTERNAL_VALIDATOR_NAME,
    validatorVersion: INTERNAL_VALIDATOR_VERSION,
    findings,
    errorCount: readiness.errors,
    warningCount: readiness.warnings,
    ranAt: now.toISOString(),
  };
}

/**
 * The offline `ExternalValidator` adapter. Always configured (it has no external
 * dependency), so it is a dependable fallback wherever an external validation
 * report is required but no proprietary validator is wired.
 */
export class InternalCriteriaValidator implements ExternalValidator {
  readonly name = INTERNAL_VALIDATOR_NAME;
  readonly version = INTERNAL_VALIDATOR_VERSION;

  isConfigured(): boolean {
    return true;
  }

  async validate(input: ExternalValidationInput): Promise<ExternalValidationReport> {
    const payload = (input.payload as InternalCriteriaPayload | undefined) ?? { leaves: [] };
    const options: ComputeReadinessOptions = {
      ...(payload.options ?? {}),
      ...(input.sequenceNumber !== undefined && payload.options?.sequenceNumber === undefined
        ? { sequenceNumber: input.sequenceNumber }
        : {}),
    };
    return runInternalCriteriaValidation({ leaves: payload.leaves ?? [], options });
  }
}

export const internalCriteriaValidator = new InternalCriteriaValidator();

export default { runInternalCriteriaValidation, InternalCriteriaValidator, internalCriteriaValidator };
