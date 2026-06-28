/**
 * @fileoverview eCTD 4.0 Package Validator & Backbone Generator (TypeScript)
 * @module server/services/ectd/ectd4-validator
 * @version 1.0.0
 *
 * @description
 * TypeScript service for validating eCTD 4.0 submission packages and generating
 * the ICH M8 JSON backbone. Works alongside the Python `ectd4_compiler.py` for
 * full compilation, but provides real-time validation and structure checks that
 * the frontend can call without a Python subprocess.
 *
 * Responsibilities:
 * - Validate that required CTD sections have documents
 * - Check document naming conventions (2-6-2 eCTD filename rules)
 * - Generate eCTD 4.0 backbone JSON per ICH M8 specification
 * - Compute package-level hashes for integrity verification
 * - Return validation results with actionable fix instructions
 *
 * @compliance ICH M8, FDA ESG Technical Conformance Guide, 21 CFR Part 11
 */

import crypto from 'crypto';
import { applyRegionalRules } from './regional-rules';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Severity of a validation finding */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** A single validation finding */
export interface ValidationFinding {
  id: string;
  severity: ValidationSeverity;
  code: string;
  sectionCode: string;
  message: string;
  fix: string;
  rule: string;
}

/** Complete validation result */
export interface ValidationResult {
  valid: boolean;
  score: number; // 0-100
  findings: ValidationFinding[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    sectionsPresent: number;
    sectionsRequired: number;
    sectionsMissing: string[];
  };
  timestamp: string;
}

/** A document leaf in the eCTD package */
export interface ECTDLeaf {
  /** eCTD section code (e.g., m3.2.S.1) */
  sectionCode: string;
  /** Document title */
  title: string;
  /** File checksum (MD5 per eCTD spec) */
  checksum: string;
  /** Checksum type */
  checksumType: 'md5';
  /** File operation for this sequence */
  operation: 'new' | 'append' | 'replace' | 'delete';
  /** Lifecycle operator ID */
  lifecycleOperator?: string;
  /** Relative file path within the eCTD package */
  filePath: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  fileSize: number;
  /** Optional raw file buffer — when provided, used for MD5 verification against declared checksum */
  buffer?: Buffer;
  /** Optional study identifier — required for M5 clinical leaves (m5.3.*) per ICH M8 v4.0 */
  studyId?: string;
  /** Optional lifecycle target leaf id — required for replace/append/delete operations */
  lifecycleTarget?: string;
}

/** eCTD 4.0 backbone context of use entry (ICH M8) */
export interface ContextOfUse {
  /** Heading code per ICH M8 (e.g., "m3-2-s-1") */
  code: string;
  /** Display title */
  title: string;
  /** Document references */
  documents: Array<{
    id: string;
    title: string;
    filePath: string;
    checksum: string;
    checksumType: string;
    operation: string;
  }>;
}

/** eCTD 4.0 JSON backbone structure */
export interface ECTD4Backbone {
  /** ICH M8 schema version */
  schemaVersion: '4.0';
  /** Submission metadata */
  submission: {
    type: string;
    id: string;
    sequenceNumber: string;
    applicationType: string;
    applicationNumber: string;
  };
  /** Regulatory activity details */
  regulatoryActivity: {
    type: string;
    effectiveDate: string;
  };
  /** Administrative metadata */
  admin: {
    applicant: {
      name: string;
      contactInfo?: string;
    };
    agency: string;
    submissionUnit: string;
  };
  /** Context of use entries — the section tree */
  contextOfUse: ContextOfUse[];
  /** Package integrity */
  integrity: {
    backboneHash: string;
    generatedAt: string;
    generatedBy: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILENAME VALIDATION (eCTD 2-6-2 Convention)
// ═══════════════════════════════════════════════════════════════════════════════

const ECTD_FILENAME_PATTERN = /^[a-z0-9]{2}-[a-z0-9]{1,6}-[a-z0-9]{2}\.(pdf|xml|xpt|jpg|svg)$/;

/**
 * Validate eCTD filename convention.
 * The 2-6-2 convention: xx-yyyyyy-zz.ext
 * - xx: module prefix (01-05)
 * - yyyyyy: section identifier (up to 6 chars)
 * - zz: sequence suffix
 */
export function validateFilename(filename: string): { valid: boolean; message?: string } {
  if (!filename) return { valid: false, message: 'Filename is empty' };

  // Check extension
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext || !['pdf', 'xml', 'xpt', 'jpg', 'svg'].includes(ext)) {
    return {
      valid: false,
      message: `Invalid file extension: .${ext}. Allowed: pdf, xml, xpt, jpg, svg`,
    };
  }

  // Check length (max 64 chars)
  if (filename.length > 64) {
    return { valid: false, message: `Filename exceeds 64 character limit: ${filename.length}` };
  }

  // Check for special characters
  if (/[^a-z0-9\-.]/.test(filename)) {
    return {
      valid: false,
      message:
        'Filename contains invalid characters. Use lowercase alphanumeric, hyphens, and periods only.',
    };
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUIRED SECTIONS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/** Sections required for an initial IND filing per 21 CFR 312.23(a) */
const IND_REQUIRED_SECTIONS = new Set([
  'm1.1', // FDA Forms
  'm1.2', // Cover Letter
  'm1.5', // Table of Contents
  'm1.6', // Introductory Statement & General Investigational Plan
  'm1.7', // Investigator's Brochure
  'm1.9', // Environmental Assessment
  'm2.3', // Quality Overall Summary
  'm2.4', // Nonclinical Overview
  'm2.6', // Nonclinical Summaries
  'm3.2.S', // Drug Substance
  'm3.2.P', // Drug Product
  'm4.2.1', // Pharmacology
  'm4.2.2', // Pharmacokinetics
  'm4.2.3', // Toxicology
  'm5.3.5', // Phase 1 Protocol
]);

/** Sections required for an NDA filing per 21 CFR 314.50 / ICH M4 */
const NDA_REQUIRED_SECTIONS: ReadonlySet<string> = new Set([
  'm1.1', // FDA Forms (356h)
  'm1.2', // Cover Letter
  'm1.3', // Administrative Information
  'm1.5', // Table of Contents
  'm1.14', // Labeling
  'm1.15', // Annotated Labeling
  'm2.2', // Introduction
  'm2.3', // Quality Overall Summary
  'm2.4', // Nonclinical Overview
  'm2.5', // Clinical Overview
  'm2.6', // Nonclinical Written & Tabulated Summaries
  'm2.7', // Clinical Summary
  'm3.2.S', // Drug Substance
  'm3.2.P', // Drug Product
  'm3.2.A', // Appendices (facilities, adventitious agents, excipients)
  'm3.2.R', // Regional Information
  'm4.2.1', // Pharmacology
  'm4.2.2', // Pharmacokinetics
  'm4.2.3', // Toxicology
  'm5.2', // Tabular Listing of Clinical Studies
  'm5.3.5', // Reports of Efficacy and Safety Studies (CSRs)
]);

/** Sections required for a BLA filing per 21 CFR 601 / ICH M4 */
const BLA_REQUIRED_SECTIONS: ReadonlySet<string> = new Set([
  'm1.1', // FDA Forms (356h)
  'm1.2', // Cover Letter
  'm1.3', // Administrative Information
  'm1.5', // Table of Contents
  'm1.14', // Labeling
  'm2.2', // Introduction
  'm2.3', // Quality Overall Summary (incl. characterization for biologics)
  'm2.4', // Nonclinical Overview
  'm2.5', // Clinical Overview
  'm2.6', // Nonclinical Written & Tabulated Summaries
  'm2.7', // Clinical Summary (incl. immunogenicity)
  'm3.2.S', // Drug Substance
  'm3.2.P', // Drug Product
  'm3.2.A', // Appendices (adventitious agents required for biologics)
  'm3.2.R', // Regional Information
  'm4.2.1', // Pharmacology
  'm4.2.3', // Toxicology
  'm5.2', // Tabular Listing of Clinical Studies
  'm5.3.5', // Reports of Efficacy and Safety Studies (CSRs)
]);

const EMPTY_REQUIRED_SECTIONS: ReadonlySet<string> = new Set();

/**
 * The required-section profile for a submission type. Unrecognized submission
 * types return an empty set so the completeness check does not falsely flag
 * IND-specific sections as "missing" on a non-IND submission. (Previously both
 * ternary branches were IND_REQUIRED_SECTIONS, so every type — including NDA
 * and BLA — was validated against IND's sections.)
 */
function requiredSectionsFor(submissionType: string): ReadonlySet<string> {
  const normalized = submissionType?.toUpperCase?.() ?? 'IND';
  switch (normalized) {
    case 'IND':
      return IND_REQUIRED_SECTIONS;
    case 'NDA':
      return NDA_REQUIRED_SECTIONS;
    case 'BLA':
      return BLA_REQUIRED_SECTIONS;
    default:
      return EMPTY_REQUIRED_SECTIONS;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate an eCTD 4.0 IND submission package.
 *
 * @param leaves - Array of document leaves in the package
 * @param submissionType - Type of submission (default: IND)
 * @param options - Optional validation context:
 *   - region: when set, applies regional rule pack (FDA/EMA/PMDA)
 *   - priorSequenceNumbers + sequenceNumber: enables sequence-gap detection
 *   - priorLeafIds: enables lifecycle-operation target-leaf reference check
 * @returns Validation result with findings and score
 */
export function validatePackage(
  leaves: ECTDLeaf[],
  submissionType: string = 'IND',
  options?: {
    region?: 'FDA' | 'EMA' | 'PMDA';
    priorSequenceNumbers?: string[];
    sequenceNumber?: string;
    priorLeafIds?: Set<string>;
  }
): ValidationResult {
  const findings: ValidationFinding[] = [];
  let findingId = 0;

  const presentSections = new Set(leaves.map(l => l.sectionCode));
  const requiredSections = requiredSectionsFor(submissionType);
  const missingSections: string[] = [];

  // 1. Check required sections
  for (const required of requiredSections) {
    if (!presentSections.has(required)) {
      missingSections.push(required);
      findings.push({
        id: `V${++findingId}`,
        severity: 'error',
        code: 'MISSING_REQUIRED_SECTION',
        sectionCode: required,
        message: `Required section ${required} has no document`,
        fix: `Add a document for eCTD section ${required}`,
        rule: '21 CFR 312.23(a)',
      });
    }
  }

  // 2. Validate each leaf
  for (const leaf of leaves) {
    // Filename validation
    const fnResult = validateFilename(leaf.filePath.split('/').pop() || '');
    if (!fnResult.valid) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'warning',
        code: 'INVALID_FILENAME',
        sectionCode: leaf.sectionCode,
        message: `File "${leaf.filePath}": ${fnResult.message}`,
        fix: 'Rename file to follow eCTD 2-6-2 naming convention (xx-yyyyyy-zz.ext)',
        rule: 'ICH M8 Filename Convention',
      });
    }

    // Checksum validation — MD5 must be exactly 32 hexadecimal characters.
    // Previously this only checked length, which let 32-character non-hex
    // strings (e.g., base64-like blobs) pass when no buffer was attached.
    if (!leaf.checksum) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'error',
        code: 'INVALID_CHECKSUM',
        sectionCode: leaf.sectionCode,
        message: `Document "${leaf.title}" has invalid or missing MD5 checksum`,
        fix: 'Regenerate MD5 checksum for the document file',
        rule: 'FDA ESG Technical Conformance Guide §3.3',
      });
    } else if (leaf.checksum.length !== 32) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'error',
        code: 'INVALID_CHECKSUM_LENGTH',
        sectionCode: leaf.sectionCode,
        message: `Document "${leaf.title}" MD5 checksum is ${leaf.checksum.length} characters; expected 32`,
        fix: 'Regenerate the MD5 hex digest — it must be exactly 32 characters',
        rule: 'FDA ESG Technical Conformance Guide §3.3',
      });
    } else if (!/^[a-f0-9]{32}$/i.test(leaf.checksum)) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'error',
        code: 'INVALID_CHECKSUM_FORMAT',
        sectionCode: leaf.sectionCode,
        message: `Document "${leaf.title}" MD5 checksum is not a valid hex digest`,
        fix: 'Regenerate the MD5 as a 32-character hexadecimal string ([0-9a-f])',
        rule: 'FDA ESG Technical Conformance Guide §3.3',
      });
    } else if (leaf.checksum !== leaf.checksum.toLowerCase()) {
      // FDA ESG TCG §3.3: MD5 digests SHOULD be lowercase. Flag uppercase/mixed
      // case so the team normalizes before submission rather than silently
      // accepting either case.
      findings.push({
        id: `V${++findingId}`,
        severity: 'warning',
        code: 'CHECKSUM_NOT_LOWERCASE',
        sectionCode: leaf.sectionCode,
        message: `Document "${leaf.title}" MD5 checksum is not lowercase`,
        fix: 'Normalize the MD5 hex digest to lowercase before submission',
        rule: 'FDA ESG Technical Conformance Guide §3.3',
      });
    }

    // MD5 buffer-vs-declared-checksum verification (only when buffer is provided)
    if (leaf.buffer) {
      const computed = computeChecksum(leaf.buffer);
      const declared = leaf.checksum ?? '';
      if (computed.toLowerCase() !== declared.toLowerCase()) {
        findings.push({
          id: `V${++findingId}`,
          severity: 'error',
          code: 'CHECKSUM_MISMATCH',
          sectionCode: leaf.sectionCode,
          message: `Declared MD5 does not match computed MD5 for "${leaf.title}"`,
          fix: 'Recompute MD5 with computeChecksum() and re-store on the leaf',
          rule: 'FDA ESG Technical Conformance Guide §3.3',
        });
      }
    }

    // M5 clinical study-id mandatory check (m5.3.* — not m5.3 alone)
    if (/^m5\.3\..+/i.test(leaf.sectionCode)) {
      if (!leaf.studyId || leaf.studyId.trim() === '') {
        findings.push({
          id: `V${++findingId}`,
          severity: 'error',
          code: 'MISSING_STUDY_ID',
          sectionCode: leaf.sectionCode,
          message: 'M5 clinical leaf has no studyId',
          fix: 'Set leaf.studyId to the study identifier (e.g., "NCT12345678" or sponsor study code)',
          rule: 'ICH M8 v4.0 study-tag attribute (M5 clinical)',
        });
      }
    }

    // Lifecycle-op target-leaf reference check (only when priorLeafIds is provided)
    if (options?.priorLeafIds !== undefined) {
      if (
        leaf.operation === 'replace' ||
        leaf.operation === 'append' ||
        leaf.operation === 'delete'
      ) {
        const target = leaf.lifecycleTarget;
        if (!target || !options.priorLeafIds.has(target)) {
          findings.push({
            id: `V${++findingId}`,
            severity: 'error',
            code: 'INVALID_LIFECYCLE_TARGET',
            sectionCode: leaf.sectionCode,
            message: 'Lifecycle operation references missing prior leaf',
            fix: 'Set leaf.lifecycleTarget to a valid prior-leaf id, or change operation to "new"',
            rule: 'ICH M8 Lifecycle Operations',
          });
        }
      }
    }

    // PDF-specific checks
    if (leaf.mimeType === 'application/pdf') {
      if (leaf.fileSize > 100 * 1024 * 1024) {
        findings.push({
          id: `V${++findingId}`,
          severity: 'warning',
          code: 'FILE_TOO_LARGE',
          sectionCode: leaf.sectionCode,
          message: `Document "${leaf.title}" exceeds 100MB recommended limit`,
          fix: 'Compress or split the PDF document',
          rule: 'FDA ESG Technical Conformance Guide',
        });
      }
    }

    // Operation validation
    if (!['new', 'append', 'replace', 'delete'].includes(leaf.operation)) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'error',
        code: 'INVALID_OPERATION',
        sectionCode: leaf.sectionCode,
        message: `Invalid lifecycle operation "${leaf.operation}" for "${leaf.title}"`,
        fix: 'Set operation to one of: new, append, replace, delete',
        rule: 'ICH M8 Lifecycle Operations',
      });
    }
  }

  // 3. Check for duplicates
  const sectionCounts = new Map<string, number>();
  for (const leaf of leaves) {
    sectionCounts.set(leaf.sectionCode, (sectionCounts.get(leaf.sectionCode) || 0) + 1);
  }
  for (const [code, count] of sectionCounts) {
    if (count > 1) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'info',
        code: 'MULTIPLE_DOCUMENTS',
        sectionCode: code,
        message: `Section ${code} has ${count} documents — ensure lifecycle operations are correct`,
        fix: 'Verify each document has the correct operation (new/append/replace)',
        rule: 'ICH M8 Multiple Documents per Context of Use',
      });
    }
  }

  // 4. Sequence-number gap detection
  if (options?.priorSequenceNumbers !== undefined && options?.sequenceNumber !== undefined) {
    const combined = [...options.priorSequenceNumbers, options.sequenceNumber];
    const gaps = detectSequenceGaps(combined);
    for (const missing of gaps) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'warning',
        code: 'SEQUENCE_GAP',
        sectionCode: '',
        message: `Sequence ${missing} is missing`,
        fix: 'Submit the missing sequence or document the skip',
        rule: 'eCTD sequence numbering',
      });
    }
  }

  // 5. Regional rule packs
  if (options?.region) {
    const regional = applyRegionalRules(leaves, options.region);
    for (const f of regional) {
      findings.push({ ...f, id: `V${++findingId}` });
    }
  }

  // Calculate score
  const errorCount = findings.filter(f => f.severity === 'error').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;
  const maxScore = 100;
  const score = Math.max(0, maxScore - errorCount * 15 - warningCount * 5 - infoCount * 1);

  return {
    valid: errorCount === 0,
    score,
    findings,
    summary: {
      errors: errorCount,
      warnings: warningCount,
      infos: infoCount,
      sectionsPresent: presentSections.size,
      sectionsRequired: requiredSections.size,
      sectionsMissing: missingSections,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Detect gaps in a list of 4-digit eCTD sequence numbers.
 * Inputs are zero-padded to 4 digits internally; the result lists any
 * missing 4-digit sequences between '0000' and the maximum submitted.
 *
 * Example: detectSequenceGaps(['0000', '0002']) → ['0001']
 */
export function detectSequenceGaps(submitted: string[]): string[] {
  if (!submitted || submitted.length === 0) return [];

  // Normalize: zero-pad to 4 digits, drop blanks/non-numerics
  const normalized = new Set<number>();
  for (const raw of submitted) {
    if (raw === undefined || raw === null) continue;
    const trimmed = String(raw).trim();
    if (trimmed === '') continue;
    if (!/^\d+$/.test(trimmed)) continue;
    normalized.add(parseInt(trimmed, 10));
  }
  if (normalized.size === 0) return [];

  const max = Math.max(...Array.from(normalized));
  const missing: string[] = [];
  for (let i = 0; i <= max; i++) {
    if (!normalized.has(i)) {
      missing.push(String(i).padStart(4, '0'));
    }
  }
  return missing;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKBONE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an eCTD 4.0 JSON backbone for the submission.
 * Follows ICH M8 specification for electronic Common Technical Document.
 *
 * @param params - Submission metadata and document leaves
 * @returns eCTD 4.0 backbone JSON
 */
export function generateBackbone(params: {
  applicantName: string;
  applicationNumber: string;
  submissionType: string;
  sequenceNumber: string;
  leaves: ECTDLeaf[];
}): ECTD4Backbone {
  const { applicantName, applicationNumber, submissionType, sequenceNumber, leaves } = params;

  // Group leaves by section code for context-of-use entries
  const sectionMap = new Map<string, ECTDLeaf[]>();
  for (const leaf of leaves) {
    const existing = sectionMap.get(leaf.sectionCode) || [];
    existing.push(leaf);
    sectionMap.set(leaf.sectionCode, existing);
  }

  // Build context-of-use entries
  const contextOfUse: ContextOfUse[] = Array.from(sectionMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sectionCode, sectionLeaves]) => ({
      code: sectionCode.replace(/\./g, '-').toLowerCase(),
      title: sectionLeaves[0].title,
      documents: sectionLeaves.map(leaf => ({
        id: crypto.randomUUID(),
        title: leaf.title,
        filePath: leaf.filePath,
        checksum: leaf.checksum,
        checksumType: leaf.checksumType,
        operation: leaf.operation,
      })),
    }));

  const backbone: ECTD4Backbone = {
    schemaVersion: '4.0',
    submission: {
      type: submissionType.toLowerCase(),
      id: `${applicationNumber}-${sequenceNumber}`,
      sequenceNumber,
      applicationType:
        submissionType === 'IND' ? 'investigational-new-drug' : submissionType.toLowerCase(),
      applicationNumber,
    },
    regulatoryActivity: {
      type: sequenceNumber === '0000' ? 'original-application' : 'supplement',
      effectiveDate: new Date().toISOString().split('T')[0],
    },
    admin: {
      applicant: { name: applicantName },
      agency: 'FDA',
      submissionUnit: 'CDER',
    },
    contextOfUse,
    integrity: {
      backboneHash: '',
      generatedAt: new Date().toISOString(),
      generatedBy: 'Concept2Cure eCTD 4.0 Engine v1.0.0',
    },
  };

  // Compute backbone hash (excluding the hash field itself)
  const hashContent = JSON.stringify({
    ...backbone,
    integrity: { ...backbone.integrity, backboneHash: '' },
  });
  backbone.integrity.backboneHash = crypto.createHash('sha256').update(hashContent).digest('hex');

  return backbone;
}

/**
 * Compute MD5 checksum for a file buffer (per eCTD specification).
 */
export function computeChecksum(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Quick validation: just check if required sections are present.
 * Lighter-weight than full validatePackage for real-time UI updates.
 */
export function quickValidate(
  presentSectionCodes: string[],
  submissionType: string = 'IND'
): { completeness: number; missing: string[] } {
  const required = requiredSectionsFor(submissionType);
  const present = new Set(presentSectionCodes);
  const missing: string[] = [];

  for (const req of required) {
    if (!present.has(req)) missing.push(req);
  }

  const completeness =
    required.size > 0 ? Math.round(((required.size - missing.length) / required.size) * 100) : 100;

  return { completeness, missing };
}
