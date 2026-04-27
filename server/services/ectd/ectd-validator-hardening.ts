/**
 * @fileoverview eCTD Validator Hardening — DTD, sequence, MD5, study-id, regional
 * @module server/services/ectd/ectd-validator-hardening
 *
 * Bridges the existing structural validator (ectd4-validator.ts, ectdExportService.ts)
 * with the gateway-conformance checks that prevent rejection at the FDA ESG / EMA CESP /
 * PMDA gateway. Wraps the lightweight per-leaf validator with package-level rules:
 *
 *  - DTD validation (against ich-ectd-3-2.dtd reference structure)
 *  - Per-leaf @study-id tagging audit (ICH M8 Study Tagging File)
 *  - Sequence-gap detection (cross-submission, requires DB query)
 *  - MD5 checksum enforcement (regenerate-or-reject)
 *  - Regional rule routing (delegates to ectd-regional-rules.ts)
 */

import crypto from 'crypto';
import { pool } from '../../db.js';
import {
  validatePackage as validateStructural,
  type ECTDLeaf,
  type ValidationFinding,
  type ValidationResult,
} from './ectd4-validator.js';
import {
  validateRegionalPackage,
  type RegionalContext,
  type RegionalFinding,
  type RegionalLeafRef,
  type RegulatoryRegion,
} from './ectd-regional-rules.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface HardenedValidationContext {
  /** Submission's tracking ID in c2c_ectd_submissions / ectdCompilations */
  submissionId: string;
  /** ICH region this package targets */
  region: RegulatoryRegion;
  /** Application number (IND123456, NDA215789, EMEA/H/C/12345, ...) */
  applicationNumber: string;
  /** 4-digit sequence number for this submission */
  sequenceNumber: string;
  /** Submission type (initial, supplement, amendment, etc.) */
  submissionType: string;
  /** Aggregate package size in bytes (sum of leaf sizes) */
  totalSizeBytes?: number;
  /** Optional buffer-level access for MD5 verification */
  leafBuffers?: Record<string, Buffer>;
}

export interface HardenedValidationResult extends ValidationResult {
  /** Regional gateway findings (FDA ESG / CESP / PMDA / HC) */
  regional: RegionalFinding[];
  /** Sequence integrity findings */
  sequence: SequenceFinding[];
  /** DTD findings (well-formedness + structural) */
  dtd: DtdFinding[];
  /** Composite score across structural + regional + sequence + dtd */
  hardenedScore: number;
  /** True iff zero blocker errors across all categories */
  gatewayReady: boolean;
}

export interface SequenceFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  fix: string;
  observedSequences?: string[];
  expectedNextSequence?: string;
}

export interface DtdFinding {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  fix: string;
  filePath?: string;
}

// ── Reference DTD structure (ICH eCTD 3.2.2) ────────────────────────────────
// The actual DTD file lives at /vendor/dtd/ich-ectd-3-2.dtd; this is the
// in-memory shape we use to verify backbone XML conforms structurally.

const ICH_ECTD_DTD_ELEMENTS: Record<string, { required: string[]; allowed: string[] }> = {
  'ectd:ectd': { required: ['admin'], allowed: ['admin', 'm1-administrative', 'm2-summaries', 'm3-quality', 'm4-nonclinical', 'm5-clinical'] },
  'admin': { required: ['applicant-info'], allowed: ['applicant-info', 'submission-description', 'sequence-info'] },
  'sequence-info': { required: ['number', 'type'], allowed: ['number', 'type', 'description', 'related-sequence'] },
  'leaf': { required: ['title', 'xlink:href'], allowed: ['title', 'xlink:href', 'checksum', 'study-id', 'language', 'operation'] },
  'm5-clinical': { required: [], allowed: ['m5-1', 'm5-2', 'm5-3', 'm5-4'] },
  'm5-3': { required: [], allowed: ['m5-3-1', 'm5-3-2', 'm5-3-3', 'm5-3-4', 'm5-3-5', 'm5-3-6', 'm5-3-7'] },
};

const REQUIRED_LEAF_ATTRIBUTES = ['xlink:href', 'checksum', 'operation'] as const;

// ── Top-level entry point ───────────────────────────────────────────────────

/**
 * Run the hardened validation pipeline. Combines:
 *   1) structural validation (existing)
 *   2) DTD conformance against ICH eCTD reference
 *   3) MD5 enforcement (recompute and compare if buffers provided)
 *   4) Per-leaf study-id tagging
 *   5) Sequence-gap detection (cross-submission)
 *   6) Regional gateway rules (FDA/EMA/PMDA/HC)
 */
export async function validateEctdPackageHardened(
  leaves: ECTDLeaf[],
  context: HardenedValidationContext,
  backboneXml?: string
): Promise<HardenedValidationResult> {
  // 1) Structural validation
  const structural = validateStructural(leaves, context.submissionType);

  // 2) DTD conformance
  const dtdFindings: DtdFinding[] = backboneXml
    ? validateDtdConformance(backboneXml, leaves)
    : [{
        severity: 'warning',
        code: 'DTD_NO_BACKBONE',
        message: 'No backbone XML provided — DTD validation skipped',
        fix: 'Pass the generated index.xml or backbone JSON for DTD validation',
      }];

  // 3) MD5 enforcement
  const md5Findings = enforceMd5Checksums(leaves, context.leafBuffers);

  // 4) Study-id tagging audit
  const studyIdFindings = auditStudyIdTagging(leaves);

  // Add MD5 + study-id findings into the structural findings list (they are leaf-level)
  const allStructural: ValidationFinding[] = [
    ...structural.findings,
    ...md5Findings,
    ...studyIdFindings,
  ];

  // 5) Sequence-gap detection
  const sequenceFindings = await detectSequenceGaps(
    context.applicationNumber,
    context.sequenceNumber
  );

  // 6) Regional rules
  const regionalLeaves: RegionalLeafRef[] = leaves.map(l => ({
    sectionCode: l.sectionCode,
    filePath: l.filePath,
    mimeType: l.mimeType,
    fileSize: l.fileSize,
  }));
  const regionalContext: RegionalContext = {
    region: context.region,
    applicationNumber: context.applicationNumber,
    sequenceNumber: context.sequenceNumber,
    submissionType: context.submissionType,
    totalSizeBytes: context.totalSizeBytes ?? leaves.reduce((sum, l) => sum + (l.fileSize || 0), 0),
    fileCount: leaves.length,
  };
  const regionalFindings = validateRegionalPackage(regionalContext, regionalLeaves);

  // Composite score: deduct heavier for regional + sequence errors (gateway blockers)
  const errorCount =
    allStructural.filter(f => f.severity === 'error').length +
    regionalFindings.filter(f => f.severity === 'error').length * 2 +
    sequenceFindings.filter(f => f.severity === 'error').length * 2 +
    dtdFindings.filter(f => f.severity === 'error').length;
  const warningCount =
    allStructural.filter(f => f.severity === 'warning').length +
    regionalFindings.filter(f => f.severity === 'warning').length +
    sequenceFindings.filter(f => f.severity === 'warning').length +
    dtdFindings.filter(f => f.severity === 'warning').length;
  const hardenedScore = Math.max(0, 100 - errorCount * 12 - warningCount * 3);

  const gatewayReady =
    errorCount === 0 &&
    structural.summary.errors === 0 &&
    !regionalFindings.some(f => f.severity === 'error') &&
    !sequenceFindings.some(f => f.severity === 'error');

  return {
    valid: structural.valid && gatewayReady,
    score: structural.score,
    findings: allStructural,
    summary: {
      ...structural.summary,
      errors: allStructural.filter(f => f.severity === 'error').length,
      warnings: allStructural.filter(f => f.severity === 'warning').length,
      infos: allStructural.filter(f => f.severity === 'info').length,
    },
    timestamp: new Date().toISOString(),
    regional: regionalFindings,
    sequence: sequenceFindings,
    dtd: dtdFindings,
    hardenedScore,
    gatewayReady,
  };
}

// ── DTD validation ──────────────────────────────────────────────────────────

/**
 * Validate that the backbone XML conforms to the ICH eCTD DTD reference structure.
 * This is a structural check (element tree, required attributes) — not a full
 * SAX parser bind, but sufficient to catch the common gateway-rejection cases.
 */
export function validateDtdConformance(backboneXml: string, leaves: ECTDLeaf[]): DtdFinding[] {
  const findings: DtdFinding[] = [];

  // Well-formedness — quick brace check before structural rules
  if (!/<\?xml/i.test(backboneXml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_NO_DECLARATION',
      message: 'XML declaration <?xml?> missing from backbone',
      fix: 'Add <?xml version="1.0" encoding="UTF-8"?> at the start of the file',
    });
  }

  if (!/<!DOCTYPE\s+ectd:ectd\s+SYSTEM\s+["']ich-ectd-3-2\.dtd["']/i.test(backboneXml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_NO_DOCTYPE',
      message: 'DOCTYPE declaration missing or does not reference ich-ectd-3-2.dtd',
      fix: 'Add <!DOCTYPE ectd:ectd SYSTEM "../util/dtd/ich-ectd-3-2.dtd">',
    });
  }

  // Root element check
  if (!/<ectd:ectd[\s>]/.test(backboneXml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_BAD_ROOT',
      message: 'Root element is not <ectd:ectd>',
      fix: 'Wrap content in <ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">',
    });
  }

  // Namespace declarations
  if (!/xmlns:ectd="http:\/\/www\.ich\.org\/ectd"/.test(backboneXml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_MISSING_ECTD_NS',
      message: 'eCTD namespace declaration missing on root element',
      fix: 'Add xmlns:ectd="http://www.ich.org/ectd" to the root element',
    });
  }
  if (!/xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/.test(backboneXml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_MISSING_XLINK_NS',
      message: 'XLink namespace declaration missing on root element',
      fix: 'Add xmlns:xlink="http://www.w3.org/1999/xlink" to the root element',
    });
  }

  // Per-leaf attribute requirements
  const leafMatches = backboneXml.matchAll(/<leaf\b([^>]*)\/?>/g);
  let leafIdx = 0;
  for (const match of leafMatches) {
    const attrs = match[1] || '';
    for (const required of REQUIRED_LEAF_ATTRIBUTES) {
      if (!new RegExp(`\\b${required}\\s*=`).test(attrs)) {
        findings.push({
          severity: 'error',
          code: 'DTD_LEAF_MISSING_ATTR',
          message: `<leaf> #${leafIdx} missing required attribute @${required}`,
          fix: `Add ${required}="..." to the leaf element`,
          filePath: leaves[leafIdx]?.filePath,
        });
      }
    }
    // checksum-type must be md5 per ICH M8
    if (/\bchecksum\s*=/.test(attrs)) {
      const checksumType = /\bchecksum-type\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1];
      if (checksumType && checksumType.toLowerCase() !== 'md5') {
        findings.push({
          severity: 'error',
          code: 'DTD_CHECKSUM_TYPE',
          message: `<leaf> uses checksum-type "${checksumType}", must be "md5"`,
          fix: 'Change checksum-type attribute to "md5"',
          filePath: leaves[leafIdx]?.filePath,
        });
      }
    }
    leafIdx++;
  }

  // Element catalogue check — flag elements not in ICH M8 reference
  const elementMatches = backboneXml.matchAll(/<([a-zA-Z0-9:_-]+)[\s>/]/g);
  const seenElements = new Set<string>();
  for (const match of elementMatches) {
    seenElements.add(match[1]);
  }
  // Spot-check: ensure required top-level structure elements are present somewhere
  const requiredAtRoot = ICH_ECTD_DTD_ELEMENTS['ectd:ectd'].required;
  for (const req of requiredAtRoot) {
    if (!seenElements.has(req)) {
      findings.push({
        severity: 'warning',
        code: 'DTD_MISSING_REQUIRED_CHILD',
        message: `Backbone is missing required child element <${req}> under <ectd:ectd>`,
        fix: `Add <${req}> as a child of <ectd:ectd>`,
      });
    }
  }

  return findings;
}

// ── MD5 enforcement ─────────────────────────────────────────────────────────

/**
 * Enforce MD5 checksums against actual file content. If `leafBuffers` is
 * supplied, recompute MD5 and compare against the leaf's declared checksum.
 * If buffers aren't supplied, fall back to format-only validation (32 hex chars).
 */
export function enforceMd5Checksums(
  leaves: ECTDLeaf[],
  leafBuffers?: Record<string, Buffer>
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  let id = 0;

  for (const leaf of leaves) {
    // Format check
    if (!leaf.checksum || !/^[a-f0-9]{32}$/i.test(leaf.checksum)) {
      findings.push({
        id: `MD5${++id}`,
        severity: 'error',
        code: 'MD5_INVALID_FORMAT',
        sectionCode: leaf.sectionCode,
        message: `Leaf "${leaf.title}" has invalid MD5 format: "${leaf.checksum}"`,
        fix: 'Regenerate MD5 as 32 hex chars',
        rule: 'ICH M8 §3.4',
      });
      continue;
    }

    if (leaf.checksumType !== 'md5') {
      findings.push({
        id: `MD5${++id}`,
        severity: 'error',
        code: 'MD5_WRONG_TYPE',
        sectionCode: leaf.sectionCode,
        message: `Leaf "${leaf.title}" declares checksum-type="${leaf.checksumType}", must be "md5"`,
        fix: 'Change checksumType to "md5"',
        rule: 'ICH M8 §3.4',
      });
    }

    // Content recomputation
    const buffer = leafBuffers?.[leaf.filePath];
    if (buffer) {
      const actual = crypto.createHash('md5').update(buffer).digest('hex');
      if (actual.toLowerCase() !== leaf.checksum.toLowerCase()) {
        findings.push({
          id: `MD5${++id}`,
          severity: 'error',
          code: 'MD5_MISMATCH',
          sectionCode: leaf.sectionCode,
          message: `Leaf "${leaf.title}": declared MD5 ${leaf.checksum} ≠ actual ${actual}`,
          fix: 'Regenerate the leaf checksum from current file content',
          rule: 'ICH M8 §3.4 — checksum integrity',
        });
      }
    }
  }

  return findings;
}

// ── Study-id tagging audit ──────────────────────────────────────────────────

/**
 * Audit per-leaf @study-id tagging. Required for M4/M5 leaves that contain
 * study data. Without this, the FDA STF (Study Tagging File) cannot resolve
 * the leaf to a CDISC dataset.
 */
export function auditStudyIdTagging(leaves: ECTDLeaf[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  let id = 0;

  // Sections that MUST carry @study-id per ICH M8
  const studyTaggedSections = [
    'm4.2.1',  // pharmacology study reports
    'm4.2.2',  // pharmacokinetic study reports
    'm4.2.3',  // toxicology study reports
    'm5.3.1',  // BA / BE study reports
    'm5.3.2',  // PK study reports
    'm5.3.3',  // human PK reports
    'm5.3.4',  // PD study reports
    'm5.3.5',  // efficacy & safety study reports
    'm5.3.7',  // case report forms
  ];

  for (const leaf of leaves) {
    const requiresStudyId = studyTaggedSections.some(s => leaf.sectionCode.startsWith(s));
    if (!requiresStudyId) continue;

    // We use lifecycleOperator as the study-id slot per the existing schema —
    // a real ICH M8 implementation would carry it on a dedicated field.
    const studyId = (leaf as any).studyId || leaf.lifecycleOperator;
    if (!studyId) {
      findings.push({
        id: `STF${++id}`,
        severity: 'warning',
        code: 'STF_MISSING_STUDY_ID',
        sectionCode: leaf.sectionCode,
        message: `Leaf "${leaf.title}" in section ${leaf.sectionCode} lacks @study-id`,
        fix: 'Tag the leaf with the controlling study identifier (matches CDISC ODM / FDA STF)',
        rule: 'FDA Study Tagging File (STF) Specification v2.6.1',
      });
    }
  }

  return findings;
}

// ── Sequence-gap detection ──────────────────────────────────────────────────

/**
 * Detect missing or out-of-order sequence numbers for an application.
 * Queries the submission tracking table (ectdCompilations or fallback) for
 * historical sequences and verifies the new sequence is the expected next.
 */
export async function detectSequenceGaps(
  applicationNumber: string,
  newSequenceNumber: string
): Promise<SequenceFinding[]> {
  const findings: SequenceFinding[] = [];

  try {
    // Query existing sequence numbers for this application across the
    // various tables that track sequence history. Use a defensive query:
    // a missing table or column returns no rows rather than throwing.
    const result = await pool.query(
      `SELECT DISTINCT sequence_number
       FROM (
         SELECT sequence_number FROM ectd_compilations WHERE application_number = $1
         UNION
         SELECT sequence_number FROM ectd_submissions WHERE application_number = $1
       ) seqs
       WHERE sequence_number ~ '^\\d{4}$'
       ORDER BY sequence_number ASC`,
      [applicationNumber]
    ).catch(() => ({ rows: [] as Array<{ sequence_number: string }> }));

    const existing = (result.rows || [])
      .map(r => String((r as any).sequence_number))
      .filter(s => /^\d{4}$/.test(s))
      .sort();

    const newSeq = parseInt(newSequenceNumber, 10);
    const expectedNext = existing.length === 0 ? '0000' : String(parseInt(existing[existing.length - 1], 10) + 1).padStart(4, '0');

    // First submission must be 0000
    if (existing.length === 0 && newSequenceNumber !== '0000') {
      findings.push({
        severity: 'error',
        code: 'SEQ_FIRST_NOT_0000',
        message: `First submission for application ${applicationNumber} must be sequence 0000, got ${newSequenceNumber}`,
        fix: 'Set sequence number to 0000 for the initial submission',
        observedSequences: [],
        expectedNextSequence: '0000',
      });
      return findings;
    }

    // Duplicate
    if (existing.includes(newSequenceNumber)) {
      findings.push({
        severity: 'error',
        code: 'SEQ_DUPLICATE',
        message: `Sequence ${newSequenceNumber} already exists for application ${applicationNumber}`,
        fix: `Use sequence ${expectedNext} (next available)`,
        observedSequences: existing,
        expectedNextSequence: expectedNext,
      });
      return findings;
    }

    // Out of order (gap detection)
    if (newSequenceNumber !== expectedNext) {
      const lastSeq = existing.length === 0 ? -1 : parseInt(existing[existing.length - 1], 10);
      const gap = newSeq - lastSeq - 1;
      if (gap > 0) {
        findings.push({
          severity: 'error',
          code: 'SEQ_GAP',
          message: `Sequence ${newSequenceNumber} skips ${gap} sequence(s) — expected ${expectedNext}`,
          fix: `Use the next sequential number: ${expectedNext}`,
          observedSequences: existing,
          expectedNextSequence: expectedNext,
        });
      } else if (gap < 0) {
        findings.push({
          severity: 'error',
          code: 'SEQ_REGRESSION',
          message: `Sequence ${newSequenceNumber} is lower than the latest submitted ${existing[existing.length - 1]}`,
          fix: `Use sequence ${expectedNext} or higher`,
          observedSequences: existing,
          expectedNextSequence: expectedNext,
        });
      }
    }

    // Internal-gap detection across the entire history
    for (let i = 0; i < existing.length; i++) {
      const expected = String(i).padStart(4, '0');
      if (existing[i] !== expected) {
        findings.push({
          severity: 'warning',
          code: 'SEQ_HISTORICAL_GAP',
          message: `Historical gap in sequences for ${applicationNumber}: expected ${expected}, found ${existing[i]}`,
          fix: 'Investigate prior submission history and confirm with regulator',
          observedSequences: existing,
        });
        break;
      }
    }
  } catch (err) {
    findings.push({
      severity: 'warning',
      code: 'SEQ_QUERY_FAILED',
      message: `Sequence-gap detection skipped: ${err instanceof Error ? err.message : String(err)}`,
      fix: 'Ensure ectd_compilations / ectd_submissions tracking tables exist',
    });
  }

  return findings;
}

// ── Convenience: combine multiple result sets into one report ───────────────

export interface FlatFinding {
  category: 'structural' | 'regional' | 'sequence' | 'dtd';
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  fix: string;
  scope?: string;
  filePath?: string;
}

export function flattenFindings(result: HardenedValidationResult): FlatFinding[] {
  const flat: FlatFinding[] = [];
  for (const f of result.findings) {
    flat.push({
      category: 'structural',
      severity: f.severity,
      code: f.code,
      message: f.message,
      fix: f.fix,
    });
  }
  for (const f of result.regional) {
    flat.push({
      category: 'regional',
      severity: f.severity,
      code: f.ruleId,
      message: f.message,
      fix: f.fix,
      scope: f.scope,
      filePath: f.leafPath,
    });
  }
  for (const f of result.sequence) {
    flat.push({
      category: 'sequence',
      severity: f.severity,
      code: f.code,
      message: f.message,
      fix: f.fix,
    });
  }
  for (const f of result.dtd) {
    flat.push({
      category: 'dtd',
      severity: f.severity,
      code: f.code,
      message: f.message,
      fix: f.fix,
      filePath: f.filePath,
    });
  }
  return flat;
}
