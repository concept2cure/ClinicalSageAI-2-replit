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
import { hasPdfHeader, isPdfLeaf } from '../ectd/pdfa-detect';
import { assessLeafPdfSecurity } from '../ectd/leaf-pdf-security';

/** Facts read from a file's own bytes (measureLeafFile). Never supplied by a caller's say-so. */
export interface MeasuredFileFacts {
  sizeBytes: number;
  /** The bytes are a PDF (%PDF- header in the first 1 KB, hasPdfHeader). */
  isPdf: boolean;
  /**
   * leaf-pdf-security's verdict for a PDF leaf (pdfa-detect isPdfLeaf: name
   * .pdf OR header); null for a leaf that is neither.
   */
  security: 'unsecured' | 'agency-form-as-issued' | 'secured' | null;
}

export interface LeafFileDescriptor {
  /** The file's base name, e.g. "overview.pdf". */
  fileName: string;
  /** Full relative path within the package, e.g. "m1/us/cover.pdf". */
  filePath?: string;
  /** DECLARED file size in bytes — a claim; see `measured`. */
  fileSizeBytes?: number;
  /**
   * DECLARED format, e.g. "PDF" — a claim. The file's extension decides its
   * type when it has one (the agency reads the name); a declared format that
   * disagrees with the extension is flagged. Used for the type only when the
   * name has no extension.
   */
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
  /* 2026-09-23 (W5/D7, round-2 review): security is judged whenever the one
     PDF-leaf predicate holds (isPdfLeaf: name .pdf OR header) — the packager's
     and transmit guard's rule. It was header-only here, so a .pdf whose header
     sits past 1 KB came back unjudged and 'conformant' where both refuse it.
     `isPdf` still records what the bytes are, so a .pdf whose bytes are not a
     PDF is reported under ACCEPTED_FILE_TYPES. */
  const isPdf = hasPdfHeader(file.bytes);
  let security: MeasuredFileFacts['security'] = null;
  if (isPdfLeaf(file.fileName, file.bytes)) {
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

/**
 * Extract a lowercase extension token (without the dot), or '' when none.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): whatever followed the last
 * dot was the extension, so 'Cover letter v1.2' had the extension '2' and a
 * real PDF declared PDF drew a mismatch and a not-accepted warning. A suffix is
 * an extension only when it looks like one — 1–10 letters/digits, at least one
 * a letter ('exe', 'mp4', '7z', 'sas7bdat'); otherwise the name has none and the
 * declared format is used.
 * 2026-09-23 (W5/D7, residual repair): the limit was 5, so a real longer
 * extension ('dm.sas7bdat', 'report.numbers') read as none and the type was
 * judged from the declaration instead of the name the agency reads.
 */
function ext(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return '';
  const suffix = fileName.slice(i + 1).toLowerCase();
  return /^(?=[a-z0-9]*[a-z])[a-z0-9]{1,10}$/.test(suffix) ? suffix : '';
}

/**
 * Where a leaf's type is judged from: its extension when it has one, else its
 * declared format, else 'pdf' when its measured bytes are a PDF.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic): the declared format came FIRST, so a
 * declaration overrode the name the agency reads — payload.exe declared 'PDF'
 * was 'conformant'. The extension now decides; the declaration is checked
 * against it by the caller.
 */
function leafFormat(leaf: LeafFileDescriptor): { format: string; from: 'extension' | 'declared' | 'bytes' | null } {
  const e = ext(leaf.fileName);
  if (e) return { format: e, from: 'extension' };
  if (leaf.fileFormat) return { format: leaf.fileFormat, from: 'declared' };
  if (leaf.measured?.isPdf) return { format: 'pdf', from: 'bytes' };
  return { format: '', from: null };
}

/** The name half of the one PDF-leaf predicate (pdfa-detect isPdfLeaf), for a leaf whose header is already known absent. */
const NO_BYTES = new Uint8Array(0);

/**
 * The canonical token of a format string — a spec's accepted-format entry or a
 * leaf's declared format / extension: its leading alphanumeric run, lowercased.
 * 'PDF', 'PDF (eSTAR form)', 'PDF attachments', 'PDF/A-1b', 'pdf' → 'pdf';
 * 'XPT' → 'xpt'; 'eSTAR' → 'estar'.
 *
 * 2026-09-23 (W5/D7, round-2 review): a type was accepted when it was a
 * SUBSTRING of an accepted format, so 'estar', 'form', 'a' and 'pd' were
 * accepted formats. Tokens must now be equal.
 */
function canonicalFormat(format: string): string {
  const m = /^\.?([a-z0-9]+)/.exec(format.trim().toLowerCase());
  return m ? m[1] : '';
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
  const acceptedFormats = new Set(f.fileFormats.map(canonicalFormat).filter(Boolean));

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

    /* 2026-09-23 (W5/D7, round-2 skeptic): the type is judged from the file's
       extension when it has one, and a declared format is a claim checked
       against it — it no longer decides the type (payload.exe declared 'PDF'
       was 'conformant') nor narrows the not-a-PDF check (report.pdf declared
       'DOCX' with ZIP bytes was a warning, undeclared it was an error). A type
       judged only from a declaration, with no byte read, is not assessed. */
    const { format, from } = leafFormat(leaf);
    const token = canonicalFormat(format);
    const declaredToken = leaf.fileFormat ? canonicalFormat(leaf.fileFormat) : '';
    if (leaf.measured && !leaf.measured.isPdf && (isPdfLeaf(name, NO_BYTES) || declaredToken === 'pdf')) {
      /* 2026-09-23 (W5/D7, round-2 review): a leaf named or declared PDF whose
         bytes were read and are not a PDF was accepted by its extension. It is
         an error, not the rule's usual warning: the warning covers a type the
         datasheet may simply not list, whereas this file is not what it says
         and will not open as one. Named .pdf (the name half of isPdfLeaf) OR
         declared PDF — whatever else is declared. */
      findings.push({
        severity: 'error',
        rule: 'ACCEPTED_FILE_TYPES',
        leaf: name,
        message: `File "${name}" is ${isPdfLeaf(name, NO_BYTES) ? 'named as a PDF' : `declared ${leaf.fileFormat}`} but its bytes are not a PDF (no %PDF- header in the first 1 KB).`,
      });
    }
    if (from === 'extension' && leaf.fileFormat && declaredToken !== token) {
      findings.push({
        severity: 'warning',
        rule: 'ACCEPTED_FILE_TYPES',
        leaf: name,
        message: `File "${name}" is declared ${leaf.fileFormat} but its extension is .${format}; the agency reads the extension.`,
      });
    }
    if (!format) {
      notJudged('ACCEPTED_FILE_TYPES', name, 'the file has no extension or declared format');
    } else if (!acceptedFormats.has(token)) {
      findings.push({
        severity: 'warning',
        rule: 'ACCEPTED_FILE_TYPES',
        leaf: name,
        message: `File "${name}" (${format}) is not among the accepted formats: ${f.fileFormats.join(', ')}.`,
      });
    } else if (from === 'declared' && !leaf.measured) {
      // An accepted declared format on a file with no extension and no byte
      // read is a claimed clean value: it never makes the rule assessed.
      notJudged('ACCEPTED_FILE_TYPES', name, 'the file has no extension and was not read; only its declared format was checked');
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

    // Security: measured from a PDF leaf's bytes, or a claim.
    /* 2026-09-23 (W5/D7, round-2 review): an unread leaf is never exempt. The
       rule was listed as not assessed only when the declared format was exactly
       'pdf', so a declared 'PDF attachments' (us-estar's own vocabulary),
       'PDF/A-1b' or 'XPT' skipped it silently and could come back 'conformant'
       with no byte read. Unread, a file may be PDF bytes under any name or
       format — the packager judges by header too — so only its measured bytes
       take it out of the rule; a declared format never narrows it. */
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
      } else if (leaf.measured === undefined) {
        notJudged('PDF_NO_SECURITY', name, 'the file was not read, so whether it is a secured PDF is unknown');
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
