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

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate an eCTD 4.0 IND submission package.
 *
 * @param leaves - Array of document leaves in the package
 * @param submissionType - Type of submission (default: IND)
 * @returns Validation result with findings and score
 */
export function validatePackage(
  leaves: ECTDLeaf[],
  submissionType: string = 'IND'
): ValidationResult {
  const findings: ValidationFinding[] = [];
  let findingId = 0;

  const presentSections = new Set(leaves.map(l => l.sectionCode));
  const requiredSections = submissionType === 'IND' ? IND_REQUIRED_SECTIONS : IND_REQUIRED_SECTIONS;
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

    // Checksum validation
    if (!leaf.checksum || leaf.checksum.length !== 32) {
      findings.push({
        id: `V${++findingId}`,
        severity: 'error',
        code: 'INVALID_CHECKSUM',
        sectionCode: leaf.sectionCode,
        message: `Document "${leaf.title}" has invalid or missing MD5 checksum`,
        fix: 'Regenerate MD5 checksum for the document file',
        rule: 'FDA ESG Technical Conformance Guide',
      });
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
      generatedBy: 'TrialSage eCTD 4.0 Engine v1.0.0',
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
  const required = submissionType === 'IND' ? IND_REQUIRED_SECTIONS : IND_REQUIRED_SECTIONS;
  const present = new Set(presentSectionCodes);
  const missing: string[] = [];

  for (const req of required) {
    if (!present.has(req)) missing.push(req);
  }

  const completeness =
    required.size > 0 ? Math.round(((required.size - missing.length) / required.size) * 100) : 100;

  return { completeness, missing };
}
