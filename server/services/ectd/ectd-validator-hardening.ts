/**
 * @fileoverview eCTD Validator Hardening — DTD, sequence, MD5, study-id, regional
 * @module server/services/ectd/ectd-validator-hardening
 *
 * Bridges the existing structural validator (ectd4-validator.ts, ectd-structural-validator.ts)
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
import { createScopedLogger } from '../../utils/logger.js';
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
import {
  ICH_BACKBONE,
  allHeadingElements,
} from '../submission-gateways/ectd-packager/ich-headings.js';

const log = createScopedLogger('ectd-validator-hardening');

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
  /**
   * The sequence number the validator was about to verify when the
   * failure occurred. Populated on SEQ_QUERY_FAILED so an operator
   * triaging a blocked submission can identify which value was in
   * flight without consulting raw logs.
   */
  attemptedSequence?: string;
  /**
   * Structured error discriminator for diagnostic findings (e.g.
   * SEQ_QUERY_FAILED). Carries the Postgres SQLSTATE / driver error
   * code (e.g. 'ECONNREFUSED', '57P01', '42P01') or the error class
   * name, never the raw error message — that stays server-side only.
   */
  errorClass?: string;
}

export interface DtdFinding {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  fix: string;
  filePath?: string;
}

// ── Reference DTD structure (ICH eCTD v3.2.2) ───────────────────────────────
// The authoritative heading catalogue is the SHARED ich-headings module — the
// same tree both backbone generators emit — so the validator and the emitters
// can never diverge again. (The licensed ich-ectd-3-2.dtd, when vendored into
// assets/ectd-dtd/, is additionally enforced by xmllint in the qualification
// harness; this in-memory check is the always-available structural layer.)

/** Module 1 heading in index.xml (regional content itself lives in the
 *  regional backbone; the ICH DTD defines this element for m1 references). */
const ICH_M1_HEADING = 'm1-administrative-information-and-prescribing-information';

/** Every heading element the ICH backbone may contain (m1 + the m2–m5 tree). */
const ICH_HEADING_CATALOGUE = new Set<string>([ICH_M1_HEADING, ...allHeadingElements()]);

/** The valid direct children of the ectd:ectd root (the module elements). */
const ICH_ROOT_CHILDREN = new Set<string>([
  ICH_M1_HEADING,
  ...ICH_BACKBONE.map((h) => h.element),
]);

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
        // Fail closed: with no backbone, DTD conformance was NOT checked, so the
        // package cannot be declared gateway-ready. A 'warning' here left
        // gatewayReady:true over zero DTD structural checking — a caller could
        // omit the backbone (the route schema allows it) and be told the package
        // is ready when the index.xml that ships was never examined. This is an
        // error so it blocks gatewayReady; every production caller already passes
        // the assembled backboneXml, so only a genuinely backbone-less
        // validation (a dry-run, or an assembly that produced no backbone) trips
        // it — exactly the case that must not read as ready.
        severity: 'error',
        code: 'DTD_NO_BACKBONE',
        message: 'No backbone XML provided — DTD validation could not be performed; package is not gateway-ready.',
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

  // Strip XML comments before anything else: every check below scans the
  // backbone with regexes, and a comment's contents are prose, not markup.
  // Leaving them in cut both ways against the vendored fixtures —
  //   false positive: the `<leaf>` written in index-valid.xml's own header
  //     comment was scanned as leaf #0, raising three phantom
  //     DTD_LEAF_MISSING_ATTR findings (and shifting `leaves[leafIdx]`, so
  //     every later finding was attributed to the wrong file);
  //   false negative: index-invalid.xml omits <?xml?> deliberately, but the
  //     literal "<?xml ... ?>" in its comment satisfied the presence check, so
  //     a backbone genuinely missing its declaration passed.
  // Replace with a space, never '', so stripping cannot fuse adjacent tokens.
  const xml = backboneXml.replace(/<!--[\s\S]*?-->/g, ' ');

  // Well-formedness — quick brace check before structural rules
  if (!/<\?xml/i.test(xml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_NO_DECLARATION',
      message: 'XML declaration <?xml?> missing from backbone',
      fix: 'Add <?xml version="1.0" encoding="UTF-8"?> at the start of the file',
    });
  }

  // Accept both a bare filename and a package-relative path (the packager emits
  // SYSTEM "util/dtd/ich-ectd-3-2.dtd"); what matters is that the referenced
  // DTD is ich-ectd-3-2.dtd.
  if (!/<!DOCTYPE\s+ectd:ectd\s+SYSTEM\s+["'][^"']*ich-ectd-3-2\.dtd["']/i.test(xml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_NO_DOCTYPE',
      message: 'DOCTYPE declaration missing or does not reference ich-ectd-3-2.dtd',
      fix: 'Add <!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">',
    });
  }

  // Root element check
  if (!/<ectd:ectd[\s>]/.test(xml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_BAD_ROOT',
      message: 'Root element is not <ectd:ectd>',
      fix: 'Wrap content in <ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">',
    });
  }

  // Namespace declarations
  if (!/xmlns:ectd="http:\/\/www\.ich\.org\/ectd"/.test(xml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_MISSING_ECTD_NS',
      message: 'eCTD namespace declaration missing on root element',
      fix: 'Add xmlns:ectd="http://www.ich.org/ectd" to the root element',
    });
  }
  if (!/xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/.test(xml)) {
    findings.push({
      severity: 'error',
      code: 'DTD_MISSING_XLINK_NS',
      message: 'XLink namespace declaration missing on root element',
      fix: 'Add xmlns:xlink="http://www.w3.org/1999/xlink" to the root element',
    });
  }

  // Per-leaf attribute requirements
  const leafMatches = xml.matchAll(/<leaf\b([^>]*)\/?>/g);
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

  // Element catalogue check — every module/heading element must come from the
  // authoritative ICH v3.2.2 catalogue (the same shared tree the generators
  // emit). This is what retires the legacy conventions: a flat <m3> block or an
  // abbreviated <m2-summaries> heading is flagged here, with the authoritative
  // fix named.
  const elementMatches = xml.matchAll(/<([a-zA-Z0-9:_-]+)[\s>/]/g);
  const seenElements = new Set<string>();
  for (const match of elementMatches) {
    seenElements.add(match[1]);
  }
  for (const el of seenElements) {
    if (/^m\d/.test(el) && !ICH_HEADING_CATALOGUE.has(el)) {
      findings.push({
        severity: 'error',
        code: 'DTD_UNKNOWN_ELEMENT',
        message: `Backbone element <${el}> is not an ICH eCTD v3.2.2 heading element`,
        fix:
          'Use the authoritative heading names from the ICH backbone (e.g. m3-quality > ' +
          'm3-2-body-of-data > m3-2-s-drug-substance) — see ectd-packager/ich-headings',
      });
    }
  }
  // The backbone should carry at least one module content element.
  const hasModuleContent = [...seenElements].some((el) => ICH_ROOT_CHILDREN.has(el));
  if (seenElements.has('ectd:ectd') && !hasModuleContent) {
    findings.push({
      severity: 'warning',
      code: 'DTD_MISSING_REQUIRED_CHILD',
      message: 'Backbone contains no module content elements under <ectd:ectd>',
      fix: 'Add the module heading elements (m1…m5) with their leaf content',
    });
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

  // Query existing sequence numbers for this application across the
  // various tables that track sequence history. A DB outage must surface
  // as a gateway-blocking finding — NOT be swallowed as "no history",
  // because that would silently re-classify a non-0000 submission as a
  // first-ever submission (RECONCILIATION_AUDIT_2026-06-29 §A.3 / §D.1).
  // Two sources feed the history, with different durability. ectd_compilations
  // is the PRIMARY, always-present source (drizzle journal + the C-31 ALTER put
  // application_number / sequence_number on it). ectd_submissions
  // (db/migrations/082_ectd_submission_agent.sql) is a SEPARATE lifecycle
  // subsystem that is itself on no durable apply path — on a deploy that has not
  // stood it up the table does not exist. A single UNION naming both would throw
  // 42P01 (undefined_table) when it is absent and — via the catch below —
  // misreport that provisioning state as a DB OUTAGE, blocking every submission
  // with "database unreachable" (ledger C-16 recorded exactly this; C-31 fixes
  // it). So the two are queried separately: the primary must succeed, and the
  // optional one tolerates ONLY "table does not exist"; any other failure on
  // EITHER (a real outage, a permission error, a missing column on an unmigrated
  // primary) still blocks — the "an outage must never be swallowed as no-history"
  // invariant (RECONCILIATION_AUDIT_2026-06-29 §A.3 / §D.1) is preserved.
  const UNDEFINED_TABLE = '42P01';
  const sqlState = (err: unknown): string | undefined =>
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : undefined;

  let result: { rows: Array<{ sequence_number: string }> };
  try {
    const primary = await pool.query(
      `SELECT sequence_number FROM ectd_compilations WHERE application_number = $1`,
      [applicationNumber]
    );
    const rows = [...(primary.rows || [])];

    // Optional source: fold in ectd_submissions when it exists. A bare
    // "table does not exist" is the deploy-dead subsystem, not an outage — log it
    // and carry on with the primary history. Anything else re-throws to the outer
    // catch and blocks the gate.
    try {
      const secondary = await pool.query(
        `SELECT sequence_number FROM ectd_submissions WHERE application_number = $1`,
        [applicationNumber]
      );
      rows.push(...(secondary.rows || []));
    } catch (subErr) {
      if (sqlState(subErr) === UNDEFINED_TABLE) {
        log.warn('SEQ_SUBMISSIONS_ABSENT — ectd_submissions not provisioned; using ectd_compilations only', {
          applicationNumber,
        });
      } else {
        throw subErr;
      }
    }

    // DISTINCT + 4-digit filter + ascending order, previously done in SQL.
    const seen = new Set<string>();
    const deduped = rows
      .map(r => String((r as { sequence_number: unknown }).sequence_number))
      .filter(s => /^\d{4}$/.test(s))
      .filter(s => (seen.has(s) ? false : (seen.add(s), true)))
      .sort();
    result = { rows: deduped.map(sequence_number => ({ sequence_number })) };
  } catch (err) {
    // The raw err.message frequently leaks schema-level intel that an
    // unauthenticated caller should not see — table names, role names,
    // internal hostnames/IPs, SQLSTATE strings. We log the raw text on
    // the server (where ops can see it) and surface only a generic
    // operator-facing phrase plus a structured errorClass discriminator.
    const errName = err instanceof Error ? err.name : typeof err;
    const errCode =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : undefined;
    const errMessage = err instanceof Error ? err.message : String(err);
    const errorClass = errCode ?? errName;

    log.error('SEQ_QUERY_FAILED — sequence history query rejected', {
      applicationNumber,
      attemptedSequence: newSequenceNumber,
      errName,
      errCode,
      errMessage,
    });

    findings.push({
      severity: 'error',
      code: 'SEQ_QUERY_FAILED',
      message: `Sequence history for application ${applicationNumber} could not be verified (attempted sequence ${newSequenceNumber}): submission tracking database is unreachable.`,
      fix: 'Restore connectivity to the submission tracking database (ectd_compilations / ectd_submissions) and re-run validation. Submission cannot be marked gateway-ready until sequence history is confirmed.',
      attemptedSequence: newSequenceNumber,
      errorClass,
    });
    return findings;
  }

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
