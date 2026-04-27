/**
 * @fileoverview Regional eCTD gateway rules — FDA ESG, EMA CESP, PMDA
 * @module server/services/ectd/ectd-regional-rules
 *
 * Encodes the gateway-specific conformance rules that an eCTD package
 * must satisfy before it can be transmitted. These are NOT ICH M8 rules
 * (those live in ectd4-validator.ts) — they are agency-specific constraints
 * that cause rejection at the gateway *before* human review.
 *
 * Sources:
 *  - FDA ESG Technical Conformance Guide (2024)
 *  - EMA CESP / PSUR Repository submission guidance
 *  - PMDA Notification 0926 (Electronic Submission of CTD)
 *  - Health Canada Regulatory Enrolment Process (REP)
 */

export type RegulatoryRegion = 'US' | 'EU' | 'JP' | 'CA';
export type RegionalSeverity = 'error' | 'warning' | 'info';

export interface RegionalRule {
  /** Stable rule identifier */
  id: string;
  /** Which gateway enforces this rule */
  region: RegulatoryRegion;
  /** Plain-English description */
  description: string;
  /** Severity if violated */
  severity: RegionalSeverity;
  /** Citation (regulation / technical conformance guide section) */
  citation: string;
}

export interface RegionalContext {
  region: RegulatoryRegion;
  /** Application number (e.g., IND 123456, NDA 215789, EMEA/H/C/005012) */
  applicationNumber: string;
  /** Sequence number (4-digit zero-padded) */
  sequenceNumber: string;
  /** Submission type (initial, supplement, amendment, etc.) */
  submissionType: string;
  /** Total uncompressed size in bytes */
  totalSizeBytes?: number;
  /** Number of files in the package */
  fileCount?: number;
}

export interface RegionalLeafRef {
  sectionCode: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  studyId?: string;
  language?: string;
}

export interface RegionalFinding {
  ruleId: string;
  region: RegulatoryRegion;
  severity: RegionalSeverity;
  message: string;
  fix: string;
  scope: 'package' | 'leaf' | 'sequence';
  leafPath?: string;
}

// ── Rule catalog ─────────────────────────────────────────────────────────────

export const REGIONAL_RULES: RegionalRule[] = [
  // --- FDA ESG ---
  {
    id: 'FDA-ESG-001',
    region: 'US',
    description: 'Sequence number must be 4-digit zero-padded (e.g., 0000, 0001)',
    severity: 'error',
    citation: 'FDA ESG Technical Conformance Guide §3.2',
  },
  {
    id: 'FDA-ESG-002',
    region: 'US',
    description: 'Application number prefix must match valid FDA series (IND/NDA/BLA/ANDA/DMF)',
    severity: 'error',
    citation: 'FDA ESG Technical Conformance Guide §3.1',
  },
  {
    id: 'FDA-ESG-003',
    region: 'US',
    description: 'Total package size must not exceed 4 GB compressed (gateway limit)',
    severity: 'error',
    citation: 'FDA ESG Technical Conformance Guide §4.5',
  },
  {
    id: 'FDA-ESG-004',
    region: 'US',
    description: 'Module 1 must contain us-regional.xml at /m1/us/us-regional.xml',
    severity: 'error',
    citation: 'FDA Specifications for eCTD §2.3',
  },
  {
    id: 'FDA-ESG-005',
    region: 'US',
    description: 'Study-tagging files (STF) required for Modules 4 and 5 leaves with study data',
    severity: 'warning',
    citation: 'FDA Study Tagging File (STF) Specification',
  },
  {
    id: 'FDA-ESG-006',
    region: 'US',
    description: 'PDF files must be PDF/A-1b or PDF 1.4-1.7 (no PDF 2.0)',
    severity: 'error',
    citation: 'FDA Portable Document Format Specifications §1.2',
  },

  // --- EMA CESP ---
  {
    id: 'EMA-CESP-001',
    region: 'EU',
    description: 'EU regional file required at /m1/eu/eu-regional.xml',
    severity: 'error',
    citation: 'EU eCTD Specification v3.2.2 §2.3',
  },
  {
    id: 'EMA-CESP-002',
    region: 'EU',
    description: 'Application number must follow EU format: EMEA/H/C/[5-digit] or [country]/H/[5-digit]/[year]',
    severity: 'error',
    citation: 'EU eCTD Specification v3.2.2 §3.1',
  },
  {
    id: 'EMA-CESP-003',
    region: 'EU',
    description: 'M1.3.1 SmPC, labeling, and PIL must be included for procedures requiring product information',
    severity: 'warning',
    citation: 'EU eCTD Specification v3.2.2 §M1.3',
  },
  {
    id: 'EMA-CESP-004',
    region: 'EU',
    description: 'CESP gateway compressed package limit is 600 MB per submission unit',
    severity: 'warning',
    citation: 'CESP User Guide v3.0 §4.2',
  },
  {
    id: 'EMA-CESP-005',
    region: 'EU',
    description: 'Filenames must use only lowercase a-z, 0-9, hyphens, and periods (max 64 chars)',
    severity: 'error',
    citation: 'EU eCTD Specification v3.2.2 §4.1',
  },

  // --- PMDA ---
  {
    id: 'PMDA-001',
    region: 'JP',
    description: 'JP regional file required at /m1/jp/jp-regional.xml',
    severity: 'error',
    citation: 'PMDA Notification 0926 §2.3',
  },
  {
    id: 'PMDA-002',
    region: 'JP',
    description: 'Application number must follow PMDA format (8-digit reception number for original applications)',
    severity: 'error',
    citation: 'PMDA Notification 0926 §3.1',
  },
  {
    id: 'PMDA-003',
    region: 'JP',
    description: 'PMDA gateway compressed package limit is 1 GB per submission unit',
    severity: 'warning',
    citation: 'PMDA eCTD Submission Manual v2.0 §4.2',
  },
  {
    id: 'PMDA-004',
    region: 'JP',
    description: 'Japanese-language summaries required for M1.13 (Japanese clinical experience)',
    severity: 'warning',
    citation: 'PMDA Notification 0926 §M1.13',
  },

  // --- Health Canada (REP) ---
  {
    id: 'HC-REP-001',
    region: 'CA',
    description: 'CA regional file required at /m1/ca/ca-regional.xml',
    severity: 'error',
    citation: 'HC Guidance Document — Preparation of Drug Submissions in eCTD §2.3',
  },
  {
    id: 'HC-REP-002',
    region: 'CA',
    description: 'Bilingual (English/French) labeling required for Canadian submissions',
    severity: 'warning',
    citation: 'HC Plain Language Labelling Initiative',
  },
];

const RULES_BY_REGION = new Map<RegulatoryRegion, RegionalRule[]>();
for (const rule of REGIONAL_RULES) {
  const existing = RULES_BY_REGION.get(rule.region) || [];
  existing.push(rule);
  RULES_BY_REGION.set(rule.region, existing);
}

// ── Pattern validators ──────────────────────────────────────────────────────

const FDA_APPLICATION_PREFIX = /^(IND|NDA|BLA|ANDA|DMF|DDT)-?\d{4,6}$/i;
const EU_APPLICATION_PREFIX = /^(EMEA\/H\/C\/\d{5}|[A-Z]{2}\/H\/\d{5}\/\d{4})/;
const PMDA_APPLICATION_PREFIX = /^\d{8}$/;
const HC_APPLICATION_PREFIX = /^(SNDS|NDS|ANDS|DIN)-?\d+/i;
const SEQUENCE_PATTERN = /^\d{4}$/;
const FILENAME_PATTERN = /^[a-z0-9][a-z0-9.\-]{0,63}$/;

const FDA_GATEWAY_LIMIT_BYTES = 4 * 1024 * 1024 * 1024;
const EMA_CESP_LIMIT_BYTES = 600 * 1024 * 1024;
const PMDA_LIMIT_BYTES = 1024 * 1024 * 1024;

// ── Validators ──────────────────────────────────────────────────────────────

/**
 * Validate package-level regional rules.
 */
export function validateRegionalPackage(
  context: RegionalContext,
  leaves: RegionalLeafRef[]
): RegionalFinding[] {
  const findings: RegionalFinding[] = [];

  // Sequence number format (universal — all eCTD regions require 4-digit)
  if (!SEQUENCE_PATTERN.test(context.sequenceNumber)) {
    findings.push({
      ruleId: 'FDA-ESG-001',
      region: context.region,
      severity: 'error',
      message: `Sequence number "${context.sequenceNumber}" is not a 4-digit zero-padded value`,
      fix: 'Use sequence numbers in the format 0000, 0001, 0002, etc.',
      scope: 'sequence',
    });
  }

  switch (context.region) {
    case 'US':
      validateFDAPackage(context, leaves, findings);
      break;
    case 'EU':
      validateEMAPackage(context, leaves, findings);
      break;
    case 'JP':
      validatePMDAPackage(context, leaves, findings);
      break;
    case 'CA':
      validateHCPackage(context, leaves, findings);
      break;
  }

  return findings;
}

function validateFDAPackage(
  context: RegionalContext,
  leaves: RegionalLeafRef[],
  findings: RegionalFinding[]
): void {
  if (!FDA_APPLICATION_PREFIX.test(context.applicationNumber)) {
    findings.push({
      ruleId: 'FDA-ESG-002',
      region: 'US',
      severity: 'error',
      message: `Application number "${context.applicationNumber}" does not match valid FDA prefix (IND/NDA/BLA/ANDA/DMF/DDT + 4-6 digits)`,
      fix: 'Use a valid FDA application number, e.g., IND123456, NDA215789, BLA125742',
      scope: 'package',
    });
  }

  if (context.totalSizeBytes && context.totalSizeBytes > FDA_GATEWAY_LIMIT_BYTES) {
    findings.push({
      ruleId: 'FDA-ESG-003',
      region: 'US',
      severity: 'error',
      message: `Package size ${(context.totalSizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB exceeds FDA ESG 4 GB gateway limit`,
      fix: 'Split the submission into multiple sequences',
      scope: 'package',
    });
  }

  const hasUSRegional = leaves.some(l => l.filePath.endsWith('m1/us/us-regional.xml'));
  if (!hasUSRegional) {
    findings.push({
      ruleId: 'FDA-ESG-004',
      region: 'US',
      severity: 'error',
      message: 'us-regional.xml is missing from /m1/us/',
      fix: 'Generate and include the US regional XML at /m1/us/us-regional.xml',
      scope: 'package',
    });
  }

  // STF check for M4/M5 study leaves
  const studyLeaves = leaves.filter(
    l => /^m[45]\./.test(l.sectionCode) && (l.sectionCode.includes('5.3.5') || l.sectionCode.includes('4.2'))
  );
  for (const leaf of studyLeaves) {
    if (!leaf.studyId) {
      findings.push({
        ruleId: 'FDA-ESG-005',
        region: 'US',
        severity: 'warning',
        message: `Study leaf ${leaf.filePath} (${leaf.sectionCode}) is missing study-id tag`,
        fix: 'Add a study-id attribute to the leaf or include it in a Study Tagging File (STF)',
        scope: 'leaf',
        leafPath: leaf.filePath,
      });
    }
  }
}

function validateEMAPackage(
  context: RegionalContext,
  leaves: RegionalLeafRef[],
  findings: RegionalFinding[]
): void {
  if (!EU_APPLICATION_PREFIX.test(context.applicationNumber)) {
    findings.push({
      ruleId: 'EMA-CESP-002',
      region: 'EU',
      severity: 'error',
      message: `Application number "${context.applicationNumber}" does not match EU format`,
      fix: 'Use centralised (EMEA/H/C/12345) or national (XX/H/12345/2024) format',
      scope: 'package',
    });
  }

  if (context.totalSizeBytes && context.totalSizeBytes > EMA_CESP_LIMIT_BYTES) {
    findings.push({
      ruleId: 'EMA-CESP-004',
      region: 'EU',
      severity: 'warning',
      message: `Package size ${(context.totalSizeBytes / 1024 / 1024).toFixed(0)} MB exceeds CESP 600 MB recommended limit`,
      fix: 'Consider splitting the submission across multiple CESP transmissions',
      scope: 'package',
    });
  }

  const hasEURegional = leaves.some(l => l.filePath.endsWith('m1/eu/eu-regional.xml'));
  if (!hasEURegional) {
    findings.push({
      ruleId: 'EMA-CESP-001',
      region: 'EU',
      severity: 'error',
      message: 'eu-regional.xml is missing from /m1/eu/',
      fix: 'Generate and include the EU regional XML at /m1/eu/eu-regional.xml',
      scope: 'package',
    });
  }

  // Filename strictness
  for (const leaf of leaves) {
    const filename = leaf.filePath.split('/').pop() || '';
    if (!FILENAME_PATTERN.test(filename)) {
      findings.push({
        ruleId: 'EMA-CESP-005',
        region: 'EU',
        severity: 'error',
        message: `Filename "${filename}" violates EU naming rules (lowercase a-z, 0-9, hyphens, periods only; max 64 chars)`,
        fix: 'Rename to match EU eCTD specification §4.1',
        scope: 'leaf',
        leafPath: leaf.filePath,
      });
    }
  }
}

function validatePMDAPackage(
  context: RegionalContext,
  leaves: RegionalLeafRef[],
  findings: RegionalFinding[]
): void {
  if (!PMDA_APPLICATION_PREFIX.test(context.applicationNumber)) {
    findings.push({
      ruleId: 'PMDA-002',
      region: 'JP',
      severity: 'error',
      message: `Application number "${context.applicationNumber}" does not match PMDA 8-digit format`,
      fix: 'Use the 8-digit PMDA reception number',
      scope: 'package',
    });
  }

  if (context.totalSizeBytes && context.totalSizeBytes > PMDA_LIMIT_BYTES) {
    findings.push({
      ruleId: 'PMDA-003',
      region: 'JP',
      severity: 'warning',
      message: `Package size ${(context.totalSizeBytes / 1024 / 1024).toFixed(0)} MB exceeds PMDA 1 GB recommended limit`,
      fix: 'Consider splitting across multiple submissions',
      scope: 'package',
    });
  }

  const hasJPRegional = leaves.some(l => l.filePath.endsWith('m1/jp/jp-regional.xml'));
  if (!hasJPRegional) {
    findings.push({
      ruleId: 'PMDA-001',
      region: 'JP',
      severity: 'error',
      message: 'jp-regional.xml is missing from /m1/jp/',
      fix: 'Generate and include the JP regional XML at /m1/jp/jp-regional.xml',
      scope: 'package',
    });
  }

  const hasJpClinical = leaves.some(l => l.sectionCode.startsWith('m1.13'));
  const submissionRequiresJpClinical = context.submissionType.toLowerCase().includes('nda') ||
    context.submissionType.toLowerCase().includes('jnda');
  if (submissionRequiresJpClinical && !hasJpClinical) {
    findings.push({
      ruleId: 'PMDA-004',
      region: 'JP',
      severity: 'warning',
      message: 'Japanese clinical experience summary (M1.13) not found',
      fix: 'Include Japanese-language summary of clinical experience for J-NDA/PMDA submissions',
      scope: 'package',
    });
  }
}

function validateHCPackage(
  context: RegionalContext,
  leaves: RegionalLeafRef[],
  findings: RegionalFinding[]
): void {
  if (!HC_APPLICATION_PREFIX.test(context.applicationNumber)) {
    findings.push({
      ruleId: 'HC-REP-001',
      region: 'CA',
      severity: 'error',
      message: `Application number "${context.applicationNumber}" does not match HC format (NDS/SNDS/ANDS/DIN)`,
      fix: 'Use a valid Health Canada application identifier',
      scope: 'package',
    });
  }

  const hasCARegional = leaves.some(l => l.filePath.endsWith('m1/ca/ca-regional.xml'));
  if (!hasCARegional) {
    findings.push({
      ruleId: 'HC-REP-001',
      region: 'CA',
      severity: 'error',
      message: 'ca-regional.xml is missing from /m1/ca/',
      fix: 'Generate and include the CA regional XML at /m1/ca/ca-regional.xml',
      scope: 'package',
    });
  }
}

/**
 * Get all rules that apply to a given region (for documentation / UI display).
 */
export function getRulesForRegion(region: RegulatoryRegion): RegionalRule[] {
  return RULES_BY_REGION.get(region) || [];
}

/**
 * Get the gateway size limit (bytes) for a region.
 */
export function getGatewaySizeLimit(region: RegulatoryRegion): number {
  switch (region) {
    case 'US': return FDA_GATEWAY_LIMIT_BYTES;
    case 'EU': return EMA_CESP_LIMIT_BYTES;
    case 'JP': return PMDA_LIMIT_BYTES;
    case 'CA': return FDA_GATEWAY_LIMIT_BYTES;
  }
}
