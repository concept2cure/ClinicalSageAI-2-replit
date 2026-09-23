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
 * 2026-09-22 (W5/D7) — every rule says whether it ran. Every byte-level fact
 * (size, encryption) was optional and each rule was "check only if present", so
 * "assessed, none found" and "never run" were the same object: `{errors: 0}`.
 * In production the facts were typed by a model (validate_market_formatting) —
 * a verdict resting on a figure the model supplied (CLAUDE.md RULE 2) — and the
 * eSTAR build, which holds the real bytes, threw them away.
 *
 * Now: facts come from BYTES (measureLeafFile) or they are claims. A claimed
 * violation is reported; a claimed clean value never makes a rule assessed. A
 * rule that could not be judged for a file is listed in `notAssessed`, and the
 * verdict is 'not_assessed' rather than conformant.
 *
 * validateLeavesAgainstMarketSpec is PURE + DETERMINISTIC: no DB, no network,
 * no LLM. measureLeafFile reads the vendored FDA form registry (for the FDA
 * forms-as-issued exception in leaf-pdf-security), nothing else.
 *
 * @module server/services/market-specs/market-formatting-validator
 */

import type { MarketSubmissionSpec } from './market-submission-specs';
import { hasPdfHeader } from '../ectd/pdfa-detect';
import { assessLeafPdfSecurity } from '../ectd/leaf-pdf-security';

/** Facts read from a file's own bytes (measureLeafFile). Never supplied by a caller's say-so. */
export interface MeasuredFileFacts {
  sizeBytes: number;
  isPdf: boolean;
  /** leaf-pdf-security's verdict for a PDF; null for a non-PDF. */
  security: 'unsecured' | 'agency-form-as-issued' | 'secured' | null;
}

export interface LeafFileDescriptor {
  /** The file's base name, e.g. "overview.pdf". */
  fileName: string;
  /** Full relative path within the package, e.g. "m1/us/cover.pdf". */
  filePath?: string;
  /** DECLARED file size in bytes — a claim; see `measured`. */
  fileSizeBytes?: number;
  /** Format hint, e.g. "PDF". Inferred from the extension when omitted. */
  fileFormat?: string;
  /** DECLARED encryption — a claim; see `measured`. */
  encrypted?: boolean;
  /** Facts measured from the bytes. When present, the declared ones are ignored. */
  measured?: MeasuredFileFacts;
}

/** The agency key leaf-pdf-security uses for a market-spec market. */
const MARKET_TO_REGION: Record<string, string> = { us: 'fda', eu: 'ema', jp: 'pmda' };

/** Measure a file's facts from its bytes, for `validateLeavesAgainstMarketSpec`. */
export async function measureLeafFile(
  file: { fileName: string; filePath?: string; fileFormat?: string; bytes: Uint8Array },
  market: string,
): Promise<LeafFileDescriptor> {
  const isPdf = hasPdfHeader(file.bytes);
  let security: MeasuredFileFacts['security'] = null;
  if (isPdf) {
    const v = await assessLeafPdfSecurity(file.bytes, MARKET_TO_REGION[market] ?? null);
    security = v.verdict === 'fda-form-as-issued' ? 'agency-form-as-issued' : v.verdict;
  }
  return {
    fileName: file.fileName,
    ...(file.filePath ? { filePath: file.filePath } : {}),
    ...(file.fileFormat ? { fileFormat: file.fileFormat } : {}),
    measured: { sizeBytes: file.bytes.byteLength, isPdf, security },
  };
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

/** A rule that applies to these files but could not be judged for some of them. */
export interface RuleNotAssessed {
  rule: FormattingRule;
  /** The files it could not be judged for (empty for a package-level rule). */
  leaves: string[];
  reason: string;
}

export type FormattingVerdict = 'conformant' | 'conformant_with_warnings' | 'nonconformant' | 'not_assessed';

export interface FormattingReport {
  specId: string;
  market: string;
  family: string;
  errors: number;
  warnings: number;
  findings: FormattingFinding[];
  /** Rules that apply but were not judged, and for which files. Empty only when every applicable rule ran on every file. */
  notAssessed: RuleNotAssessed[];
  /**
   * nonconformant when any error was found; otherwise not_assessed when any
   * applicable rule did not run; otherwise conformant(_with_warnings).
   */
  verdict: FormattingVerdict;
}

const MB = 1024 * 1024;

/** Extract a lowercase extension token (without the dot), or '' when none. */
function ext(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

/** The leaf's format token: declared, else the extension, else 'pdf' when the bytes are a PDF. */
function formatToken(leaf: LeafFileDescriptor): string {
  return (leaf.fileFormat || ext(leaf.fileName) || (leaf.measured?.isPdf ? 'pdf' : '')).toLowerCase();
}

/** Is the leaf a PDF — by its bytes when measured, else by its declared format or name. */
function isPdfLeaf(leaf: LeafFileDescriptor): boolean {
  if (leaf.measured) return leaf.measured.isPdf;
  return formatToken(leaf) === 'pdf';
}

/**
 * Validate a set of file descriptors against a market spec's formatting rules.
 * Deterministic; reports every violation it can establish, and every applicable
 * rule it could not judge. Size limits and patterns apply only when the spec
 * defines them.
 */
export function validateLeavesAgainstMarketSpec(
  spec: MarketSubmissionSpec,
  leaves: LeafFileDescriptor[]
): FormattingReport {
  const f = spec.formatting;
  const findings: FormattingFinding[] = [];
  const unjudged = new Map<FormattingRule, { leaves: string[]; reason: string }>();
  const notJudged = (rule: FormattingRule, leaf: string | null, reason: string) => {
    const entry = unjudged.get(rule) ?? { leaves: [], reason };
    if (leaf !== null) entry.leaves.push(leaf);
    unjudged.set(rule, entry);
  };
  let knownBytes = 0;
  let allSizesMeasured = true;

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

    if (f.maxPathLength) {
      if (!leaf.filePath) {
        notJudged('PATH_LENGTH', name, 'no path within the package was given');
      } else if (leaf.filePath.length > f.maxPathLength) {
        findings.push({
          severity: 'error',
          rule: 'PATH_LENGTH',
          leaf: name,
          message: `Path "${leaf.filePath}" is ${leaf.filePath.length} chars; the limit is ${f.maxPathLength}.`,
        });
      }
    }

    const token = formatToken(leaf);
    if (!token) {
      notJudged('ACCEPTED_FILE_TYPES', name, 'the file has no extension or declared format');
    } else if (!f.fileFormats.some((a) => a.toLowerCase().includes(token))) {
      findings.push({
        severity: 'warning',
        rule: 'ACCEPTED_FILE_TYPES',
        leaf: name,
        message: `File "${name}" (${leaf.fileFormat || ext(name) || token}) is not among the accepted formats: ${f.fileFormats.join(', ')}.`,
      });
    }

    // Size: measured, or a claim. A claimed size over the limit is reported; a
    // claimed size under it does not make the rule assessed.
    const measuredSize = leaf.measured?.sizeBytes;
    const size = measuredSize ?? leaf.fileSizeBytes;
    if (typeof size === 'number') knownBytes += size;
    if (measuredSize === undefined) allSizesMeasured = false;
    if (f.maxFileSizeMb) {
      if (typeof size === 'number' && size > f.maxFileSizeMb * MB) {
        findings.push({
          severity: 'error',
          rule: 'FILE_SIZE',
          leaf: name,
          message:
            `File "${name}" is ${(size / MB).toFixed(1)} MB${measuredSize === undefined ? ' (as declared)' : ''}; ` +
            `the per-file limit is ${f.maxFileSizeMb} MB.`,
        });
      } else if (measuredSize === undefined) {
        notJudged('FILE_SIZE', name, 'the size was not measured from the file');
      }
    }

    // Security: measured from a PDF's bytes, or a claim.
    if (!f.encryptionAllowed) {
      const security = leaf.measured?.security;
      if (security === 'secured' || (leaf.measured === undefined && leaf.encrypted === true)) {
        findings.push({
          severity: 'error',
          rule: 'PDF_NO_SECURITY',
          leaf: name,
          message:
            `File "${name}" is encrypted / permission-restricted${leaf.measured ? '' : ' (as declared)'}, ` +
            `which ${spec.authority} does not accept.`,
        });
      } else if (leaf.measured === undefined && isPdfLeaf(leaf)) {
        notJudged('PDF_NO_SECURITY', name, 'the PDF was not read, so its security settings are unknown');
      }
    }
  }

  if (f.maxSubmissionSizeMb) {
    if (knownBytes > f.maxSubmissionSizeMb * MB) {
      findings.push({
        severity: 'error',
        rule: 'SUBMISSION_SIZE',
        message:
          `Total size ${(knownBytes / MB).toFixed(0)} MB${allSizesMeasured ? '' : ' (including declared sizes)'} ` +
          `exceeds the ${spec.authority} ${f.maxSubmissionSizeMb} MB limit.`,
      });
    } else if (!allSizesMeasured) {
      notJudged('SUBMISSION_SIZE', null, 'not every file size was measured');
    }
  }

  const errors = findings.filter((x) => x.severity === 'error').length;
  const warnings = findings.filter((x) => x.severity === 'warning').length;
  const notAssessed: RuleNotAssessed[] = [...unjudged.entries()].map(([rule, v]) => ({ rule, leaves: v.leaves, reason: v.reason }));
  if (leaves.length === 0) {
    notAssessed.push({ rule: 'FILE_NAMING', leaves: [], reason: 'no files were given' });
  }
  const verdict: FormattingVerdict =
    errors > 0 ? 'nonconformant' : notAssessed.length > 0 ? 'not_assessed' : warnings > 0 ? 'conformant_with_warnings' : 'conformant';

  return {
    specId: spec.id,
    market: spec.market,
    family: spec.family,
    errors,
    warnings,
    findings,
    notAssessed,
    verdict,
  };
}

export default { validateLeavesAgainstMarketSpec, measureLeafFile };
