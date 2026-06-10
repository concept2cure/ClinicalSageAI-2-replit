/**
 * Market formatting validator — deterministic ENFORCEMENT of the per-market
 * formatting datasheet (`market-submission-specs.ts`) against a set of file
 * descriptors.
 *
 * The market spec records, per market+format, the concrete formatting rules
 * (file-naming pattern, name/path length caps, accepted file formats, per-file and
 * total size limits, encryption ban). This turns that reference data into CHECKS:
 * given the files a packager/UI holds at assemble time, it reports every formatting
 * violation, with each finding's `rule` aligned to the validation-rule-corpus id so
 * the verdict is traceable.
 *
 * It generalizes formatting enforcement across ALL 12 markets and every submission
 * family (eCTD / eSTAR / MDR / IVDR / CTIS) from the single datasheet — complementing
 * the eCTD-package-specific `ectd-regional-rules.ts` (which covers only the four
 * eCTD regions and operates on an assembled package).
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/market-formatting-validator
 */

import type { MarketSubmissionSpec } from './market-submission-specs';

export interface LeafFileDescriptor {
  /** The file's base name, e.g. "overview.pdf". */
  fileName: string;
  /** Full relative path within the package, e.g. "m1/us/cover.pdf". */
  filePath?: string;
  /** File size in bytes. */
  fileSizeBytes?: number;
  /** Format hint, e.g. "PDF". Inferred from the extension when omitted. */
  fileFormat?: string;
  /** True if the file is encrypted / permission-restricted. */
  encrypted?: boolean;
}

export type FormattingRule =
  | 'FILE_NAMING'
  | 'FILE_NAME_LENGTH'
  | 'PATH_LENGTH'
  | 'ACCEPTED_FILE_TYPES'
  | 'FILE_SIZE'
  | 'SUBMISSION_SIZE'
  | 'PDF_NO_SECURITY';

export interface FormattingFinding {
  severity: 'error' | 'warning';
  /** Aligned to validation-rule-corpus ids where one exists. */
  rule: FormattingRule;
  leaf?: string;
  message: string;
}

export interface FormattingReport {
  specId: string;
  market: string;
  family: string;
  errors: number;
  warnings: number;
  findings: FormattingFinding[];
}

const MB = 1024 * 1024;

/** Extract a lowercase extension token (without the dot), or '' when none. */
function ext(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

/** Does the leaf's declared/inferred format match any accepted file format? */
function formatAccepted(leaf: LeafFileDescriptor, accepted: string[]): boolean {
  const token = (leaf.fileFormat || ext(leaf.fileName)).toLowerCase();
  if (!token) return true; // nothing to judge
  return accepted.some((a) => a.toLowerCase().includes(token));
}

/**
 * Validate a set of file descriptors against a market spec's formatting rules.
 * Deterministic; reports every violation. Size limits and patterns are only
 * applied when the spec defines them.
 */
export function validateLeavesAgainstMarketSpec(
  spec: MarketSubmissionSpec,
  leaves: LeafFileDescriptor[]
): FormattingReport {
  const f = spec.formatting;
  const findings: FormattingFinding[] = [];
  let totalBytes = 0;

  const namePattern = f.fileNamePattern ? new RegExp(f.fileNamePattern) : null;

  for (const leaf of leaves) {
    const name = leaf.fileName || '';

    if (namePattern && !namePattern.test(name)) {
      findings.push({
        severity: 'error',
        rule: 'FILE_NAMING',
        leaf: name,
        message: `File name "${name}" violates the ${spec.authority} naming convention (${f.fileNaming}).`,
      });
    }

    if (f.maxFileNameLength && name.length > f.maxFileNameLength) {
      findings.push({
        severity: 'error',
        rule: 'FILE_NAME_LENGTH',
        leaf: name,
        message: `File name "${name}" is ${name.length} chars; the limit is ${f.maxFileNameLength}.`,
      });
    }

    if (f.maxPathLength && leaf.filePath && leaf.filePath.length > f.maxPathLength) {
      findings.push({
        severity: 'error',
        rule: 'PATH_LENGTH',
        leaf: name,
        message: `Path "${leaf.filePath}" is ${leaf.filePath.length} chars; the limit is ${f.maxPathLength}.`,
      });
    }

    if (!formatAccepted(leaf, f.fileFormats)) {
      findings.push({
        severity: 'warning',
        rule: 'ACCEPTED_FILE_TYPES',
        leaf: name,
        message: `File "${name}" (${leaf.fileFormat || ext(name) || 'unknown'}) is not among the accepted formats: ${f.fileFormats.join(', ')}.`,
      });
    }

    if (typeof leaf.fileSizeBytes === 'number') {
      totalBytes += leaf.fileSizeBytes;
      if (f.maxFileSizeMb && leaf.fileSizeBytes > f.maxFileSizeMb * MB) {
        findings.push({
          severity: 'error',
          rule: 'FILE_SIZE',
          leaf: name,
          message: `File "${name}" is ${(leaf.fileSizeBytes / MB).toFixed(1)} MB; the per-file limit is ${f.maxFileSizeMb} MB.`,
        });
      }
    }

    if (leaf.encrypted && !f.encryptionAllowed) {
      findings.push({
        severity: 'error',
        rule: 'PDF_NO_SECURITY',
        leaf: name,
        message: `File "${name}" is encrypted / permission-restricted, which ${spec.authority} does not accept.`,
      });
    }
  }

  if (f.maxSubmissionSizeMb && totalBytes > f.maxSubmissionSizeMb * MB) {
    findings.push({
      severity: 'error',
      rule: 'SUBMISSION_SIZE',
      message: `Total size ${(totalBytes / MB).toFixed(0)} MB exceeds the ${spec.authority} ${f.maxSubmissionSizeMb} MB limit.`,
    });
  }

  return {
    specId: spec.id,
    market: spec.market,
    family: spec.family,
    errors: findings.filter((x) => x.severity === 'error').length,
    warnings: findings.filter((x) => x.severity === 'warning').length,
    findings,
  };
}

export default { validateLeavesAgainstMarketSpec };
