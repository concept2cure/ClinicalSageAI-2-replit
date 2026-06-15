/**
 * External eCTD validator — seam types (P0-4: external eValidator dry-run gate).
 *
 * Agencies validate eCTD packages with LORENZ eValidator (FDA's published
 * criteria), not our internal validators. This is the stable interface an external
 * validator engine drops in behind — mirroring the fail-closed pattern of the
 * PDF/A and DTD gates. See EVALIDATOR_INTEGRATION_SPEC.md.
 *
 * @module server/services/ectd/external-validator/types
 */

export type ValidationSeverity = 'error' | 'warning' | 'info';

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
  /** Engine id, e.g. 'lorenz-evalidator' | 'noop' | 'fda-criteria'. */
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
  /** errorCount === 0 AND the engine actually ran. */
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
  /** True when the engine binary/endpoint + license are configured. */
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
