/**
 * External eCTD validator — seam types (P0-4: external eValidator dry-run gate).
 *
 * This seam can run a configured external adapter, an internal criteria subset,
 * or no validator. These have different coverage: a subset never satisfies the
 * external-engine requirement. An external report is not agency acceptance or
 * proof of licensed/qualified coverage. See EVALIDATOR_INTEGRATION_SPEC.md.
 *
 * @module server/services/ectd/external-validator/types
 */

export type ValidationSeverity = 'error' | 'warning' | 'info';

/** Server-selected adapter classification, never authority supplied by a report. */
export type ExternalValidatorKind = 'external_engine' | 'internal_subset' | 'unavailable' | 'unknown';

export type EctdRegion = 'fda' | 'ema' | 'pmda';

export interface ExternalValidationFinding {
  /** Agency rule id, e.g. 'FDA-1734'. */
  ruleId: string;
  severity: ValidationSeverity;
  message: string;
  /** Package-relative path the finding is about. */
  leafHref?: string;
  /** Citation into the agency criteria document. */
  criterion?: string;
}

export interface ExternalValidationReport {
  /** Reported id, e.g. 'lorenz-evalidator' | 'noop' | 'fda-criteria-subset'; not authority. */
  validator: string;
  /** Validation profile / region, e.g. 'FDA eCTD 3.2.2'. */
  profile: string;
  ranAt: Date;
  /** True when the engine actually executed (false ⇒ not configured / skipped). */
  ran: boolean;
  findings: ExternalValidationFinding[];
  /** Findings with severity 'error'. */
  errorCount: number;
  warningCount: number;
  /** Declared run result: errorCount === 0 AND ran; not qualified coverage or acceptance. */
  passed: boolean;
}

export interface ValidateArgs {
  /** Unzipped package directory (emitUnzipped output from the packager). */
  packageDir: string;
  region: EctdRegion;
  /** Validation profile id; defaults per region from config. */
  profile?: string;
}

export interface ExternalValidator {
  readonly name: string;
  readonly kind: ExternalValidatorKind;
  /** A path/endpoint or subset option is available; not proof of licence or qualification. */
  isConfigured(): Promise<boolean>;
  /** Validate an unzipped package directory against a region profile. */
  validate(args: ValidateArgs): Promise<ExternalValidationReport>;
}

/** Count findings of each severity → {errorCount, warningCount}. Authoritative
 *  mapping: only 'error' increments the count that blocks dispatch. */
export function tallyFindings(findings: ExternalValidationFinding[]): {
  errorCount: number;
  warningCount: number;
} {
  let errorCount = 0;
  let warningCount = 0;
  for (const f of findings) {
    if (f.severity === 'error') errorCount += 1;
    else if (f.severity === 'warning') warningCount += 1;
  }
  return { errorCount, warningCount };
}
