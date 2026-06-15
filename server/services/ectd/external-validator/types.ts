/**
 * Vendor-neutral external eCTD validator SEAM (EVALIDATOR_INTEGRATION_SPEC.md).
 *
 * The proprietary agency validators (FDA eValidator / LORENZ, EMA technical
 * validation, PMDA pre-check) require vendor tooling + licences we do not have
 * in this environment. Rather than stub a fake green, this module defines a
 * SMALL, vendor-neutral interface every external validator (real or internal)
 * conforms to, plus the normalized report shape the dispatch path consumes.
 *
 * An adapter (e.g. internal-criteria-validator.ts) implements `ExternalValidator`
 * and projects whatever it computed into an `ExternalValidationReport`. The
 * report is persisted (validation-report-persistence.ts) and its `errorCount`
 * is folded into the deterministic dispatch gate (evaluate-external-validation.ts).
 *
 * @module server/services/ectd/external-validator/types
 */

/** A single finding from an external validator run. */
export interface ExternalValidationFinding {
  severity: 'error' | 'warning' | 'info';
  /** Stable rule identifier (vendor rule code, or our internal finding code). */
  ruleId: string;
  message: string;
  /** Where the finding applies (section code, file path, leaf title, …). */
  location?: string;
}

/** The normalized result of one external validation run over a package/report. */
export interface ExternalValidationReport {
  /** Validator that produced this report (e.g. 'internal-criteria'). */
  validatorName: string;
  /** Validator version/build (so a stale report is identifiable). */
  validatorVersion: string;
  findings: ExternalValidationFinding[];
  /** Count of error-severity findings — the value the dispatch gate enforces. */
  errorCount: number;
  /** Count of warning-severity findings (non-blocking, for visibility). */
  warningCount: number;
  /** When the run executed (ISO 8601). */
  ranAt: string;
}

/**
 * The package/report payload an `ExternalValidator` validates. Vendor-neutral:
 * a real adapter would receive the bundle zip bytes; the internal adapter
 * receives the canonical leaves it re-checks. Kept open so adapters can accept
 * whatever input they need without coupling the seam to one vendor protocol.
 */
export interface ExternalValidationInput {
  /** The eCTD region (us/eu/jp/…). */
  region?: string;
  /** The four-digit sequence number (e.g. '0000'). */
  sequenceNumber?: string;
  /** Raw bundle bytes, when a real (zip-consuming) validator is wired. */
  bundle?: Uint8Array;
  /** Adapter-specific structured input (the internal adapter reads leaves here). */
  payload?: unknown;
}

/** The vendor-neutral interface every external validator conforms to. */
export interface ExternalValidator {
  /** Stable validator name (matches the persisted `validator_name`). */
  readonly name: string;
  /** Validator version/build. */
  readonly version: string;
  /** True when the validator can run in the current environment. */
  isConfigured(): boolean;
  /** Validate a package/report and return a normalized report. */
  validate(input: ExternalValidationInput): Promise<ExternalValidationReport>;
}
