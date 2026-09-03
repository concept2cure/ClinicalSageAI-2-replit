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

import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge.js';

export type RegulatoryRegion = 'US' | 'EU' | 'JP' | 'CA' | 'CN' | 'KR' | 'UK' | 'AU' | 'CH' | 'BR' | 'IN' | 'SG';
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
    description: 'Application number must follow EU format: EMEA/H/C/[6-digit] for the centralised procedure, or [country]/H/[number]/[year] for MRP/DCP',
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
    description: 'Filenames must use only lowercase a-z, 0-9, hyphens and periods (max 64 chars incl. extension); the total folder path must not exceed 180 characters',
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
  {
    id: 'PMDA-005',
    region: 'JP',
    description: 'Risk Management Plan (J-RMP / 医薬品リスク管理計画) required for new drug applications; the J-RMP draft is submitted at CTD Module 1.11',
    severity: 'warning',
    citation: 'MHLW Risk Management Plan Guidance (April 2012); JP CTD Module 1 structure',
  },

  // --- NMPA (CDE) ---
  {
    id: 'NMPA-CDE-001',
    region: 'CN',
    description: 'eCTD submission must conform to the NMPA eCTD specification (XML backbone v1.0/v1.1), including the M1 regional backbone file',
    severity: 'error',
    citation: 'NMPA eCTD技术规范 V1.0 (2019); eCTD验证标准 V1.0',
  },
  {
    id: 'NMPA-CDE-002',
    region: 'CN',
    description: 'All PDFs must be PDF/A, text-searchable, with working bookmarks and hyperlinks and embedded fonts (including Simplified Chinese fonts)',
    severity: 'error',
    citation: 'NMPA eCTD技术规范 V1.0 (2019)',
  },
  {
    id: 'NMPA-CDE-003',
    region: 'CN',
    description: 'Dossier must be in Simplified Chinese: Module 1 administrative/product-information documents and Module 3 quality and manufacturing content require Chinese; English may be included only as a secondary copy',
    severity: 'error',
    citation: 'NMPA M4 Module 1 (2019 No. 17); NMPA eCTD技术规范 V1.0',
  },
  {
    id: 'NMPA-CDE-004',
    region: 'CN',
    description: 'The eCTD must include the NMPA stylesheet (ectd-2-0.xsl for Modules 2–5) and the valid-value definition files defined by the NMPA eCTD specification',
    severity: 'warning',
    citation: 'NMPA eCTD技术规范 V1.0 (2019)',
  },
  {
    id: 'NMPA-CDE-005',
    region: 'CN',
    description: 'File and folder names must follow the NMPA regional naming conventions defined in the eCTD technical specification',
    severity: 'warning',
    citation: 'NMPA eCTD技术规范 V1.0 (2019)',
  },

  // --- MFDS (Korea) — KR eCTD v1.0 ---
  {
    id: 'MFDS-KR-001',
    region: 'KR',
    description: 'eCTD must conform to the KR eCTD specification (KR eCTD v1.0 DTD / KR v1.0 Validation Criteria), including the M1 regional backbone file',
    severity: 'error',
    citation: 'MFDS KR eCTD v1.0 Validation Criteria',
  },
  {
    id: 'MFDS-KR-002',
    region: 'KR',
    description: 'Module 1 administrative and product-information documents must be in Korean (K-CTD)',
    severity: 'error',
    citation: 'MFDS K-CTD guidance (의약품 국제공통기술문서)',
  },
  {
    id: 'MFDS-KR-003',
    region: 'KR',
    description: 'Clinical study datasets should be CDISC-compliant per the MFDS adoption of CDISC standards',
    severity: 'warning',
    citation: 'MFDS CDISC adoption (2021 regulatory amendment)',
  },
  {
    id: 'MFDS-KR-004',
    region: 'KR',
    description: 'File and folder names must follow the KR eCTD ASCII naming convention (Korean belongs in document content, not file names)',
    severity: 'warning',
    citation: 'MFDS KR eCTD v1.0 Validation Criteria',
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
  {
    id: 'HC-REP-003',
    region: 'CA',
    description: 'Application number must match a valid HC identifier (NDS/SNDS/ANDS/DIN)',
    severity: 'error',
    citation: 'HC Guidance Document — Regulatory Enrolment Process (REP)',
  },

  // --- ICH-aligned regions without a fully encoded rule pack yet ---
  // (UK/AU/CH/BR/IN/SG). Until a region-specific pack is added,
  // validateRegionalPackage enforces only the universal eCTD invariants:
  // M1 regional-backbone presence ({REGION}-REG-001) and the ASCII
  // file-naming convention ({REGION}-REG-002). Application-number prefix,
  // gateway size limit, language requirements, and labeling rules remain
  // unchecked for these regions and should be encoded as proper validator
  // packs (MHRA / TGA / Swissmedic / ANVISA / CDSCO / HSA) when their
  // specifications are landed.
  ...(['UK', 'AU', 'CH', 'BR', 'IN', 'SG'] as const).flatMap<RegionalRule>((region) => [
    {
      id: `${region}-REG-001`,
      region,
      description: `M1 regional file required at /m1/${region.toLowerCase()}/${region.toLowerCase()}-regional.xml`,
      severity: 'error',
      citation: 'eCTD specification — universal M1 regional backbone requirement',
    },
    {
      id: `${region}-REG-002`,
      region,
      description: 'Filenames must follow the eCTD ASCII naming convention (lowercase a-z, 0-9, hyphens, periods; max 64 chars)',
      severity: 'warning',
      citation: 'eCTD specification — universal file-naming convention',
    },
  ]),
];

const RULES_BY_REGION = new Map<RegulatoryRegion, RegionalRule[]>();
for (const rule of REGIONAL_RULES) {
  const existing = RULES_BY_REGION.get(rule.region) || [];
  existing.push(rule);
  RULES_BY_REGION.set(rule.region, existing);
}

// ── Pattern validators ──────────────────────────────────────────────────────

const FDA_APPLICATION_PREFIX = /^(IND|NDA|BLA|ANDA|DMF|DDT)-?\d{4,6}$/i;
// Centralised procedure: EMEA/H/C/NNNNNN (canonically 6 digits, e.g. EMEA/H/C/005012);
// older/short fixtures use 4–5. National (MRP/DCP): [country]/H/[number]/[year].
// Anchored at both ends so trailing characters do not slip through as conformant.
const EU_APPLICATION_PREFIX = /^(EMEA\/H\/C\/\d{4,6}|[A-Z]{2}\/H\/\d{4,6}\/\d{4})$/;
const PMDA_APPLICATION_PREFIX = /^\d{8}$/;
// Anchored at both ends (like the FDA/EU/PMDA patterns) so a valid-looking prefix
// followed by garbage does not slip through as a conformant identifier.
const HC_APPLICATION_PREFIX = /^(SNDS|NDS|ANDS|DIN)-?\d+$/i;
const SEQUENCE_PATTERN = /^\d{4}$/;
/** eCTD leaf file name: lowercase, [a-z0-9.-], at most 64 characters including
 *  the extension (ICH eCTD v3.2.2 Appendix; EMA-CESP-005). Exported so the
 *  assemble path composes names to it and the structural validator refuses
 *  names that break it — one rule, not three spellings of it. */
export const FILENAME_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

const FDA_GATEWAY_LIMIT_BYTES = 4 * 1024 * 1024 * 1024;
const EMA_CESP_LIMIT_BYTES = 600 * 1024 * 1024;
const PMDA_LIMIT_BYTES = 1024 * 1024 * 1024;
// NMPA does not publish a single eCTD gateway package-size limit in the accessible
// technical specification; use a conservative 1 GB default pending verification.
const NMPA_LIMIT_BYTES = 1024 * 1024 * 1024;
// MFDS does not publish a single eCTD gateway package-size limit in the accessible
// guidance; use a conservative 1 GB default pending verification.
const MFDS_LIMIT_BYTES = 1024 * 1024 * 1024;

// Region → its M1 regional backbone path. Every eCTD region requires a
// {code}-regional.xml backbone under /m1/{code}/; centralised here so the
// per-region validators don't each hard-code the path.
const REGIONAL_BACKBONE: Record<RegulatoryRegion, string> = {
  US: 'm1/us/us-regional.xml',
  EU: 'm1/eu/eu-regional.xml',
  JP: 'm1/jp/jp-regional.xml',
  CA: 'm1/ca/ca-regional.xml',
  CN: 'm1/cn/cn-regional.xml',
  KR: 'm1/kr/kr-regional.xml',
  UK: 'm1/uk/uk-regional.xml',
  AU: 'm1/au/au-regional.xml',
  CH: 'm1/ch/ch-regional.xml',
  BR: 'm1/br/br-regional.xml',
  IN: 'm1/in/in-regional.xml',
  SG: 'm1/sg/sg-regional.xml',
};

/**
 * Push an error finding when the region's M1 regional backbone file is absent.
 * The message is derived from the region's backbone path; the agency-specific
 * remediation text is supplied by the caller via `fix`.
 */
function requireBackbone(
  leaves: RegionalLeafRef[],
  region: RegulatoryRegion,
  ruleId: string,
  fix: string,
  findings: RegionalFinding[]
): void {
  const path = REGIONAL_BACKBONE[region];
  if (!leaves.some((l) => l.filePath.endsWith(path))) {
    const file = path.split('/').pop();
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    findings.push({
      ruleId,
      region,
      severity: 'error',
      message: `${file} is missing from /${dir}`,
      fix,
      scope: 'package',
    });
  }
}

/**
 * Push a finding for every leaf whose file name violates the eCTD ASCII
 * naming convention. Severity and the message/remediation text vary by region,
 * so they are supplied by the caller.
 */
function checkAsciiFilenames(
  leaves: RegionalLeafRef[],
  region: RegulatoryRegion,
  findings: RegionalFinding[],
  opts: { ruleId: string; severity: RegionalSeverity; makeMessage: (filename: string) => string; fix: string }
): void {
  for (const leaf of leaves) {
    const filename = leaf.filePath.split('/').pop() || '';
    if (!FILENAME_PATTERN.test(filename)) {
      findings.push({
        ruleId: opts.ruleId,
        region,
        severity: opts.severity,
        message: opts.makeMessage(filename),
        fix: opts.fix,
        scope: 'leaf',
        leafPath: leaf.filePath,
      });
    }
  }
}

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
    case 'CN':
      validateNMPAPackage(context, leaves, findings);
      break;
    case 'KR':
      validateMFDSPackage(context, leaves, findings);
      break;
    case 'UK':
    case 'AU':
    case 'CH':
    case 'BR':
    case 'IN':
    case 'SG':
      // These ICH-aligned regions do not yet have full rule packs (no
      // application-number prefix regex, no gateway-size limit constant, no
      // language/labeling requirements). To prevent the switch from silently
      // no-oping past every gateway check — which would let
      // validateRegionalPackage return only FDA-ESG-001 (sequence format)
      // for a submission targeting these regions — at minimum enforce the
      // M1 regional backbone file presence rule that REGIONAL_BACKBONE has
      // a path for. See GENERIC-REG-001.
      validateGenericRegionPackage(context, leaves, findings);
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

  if (context.totalSizeBytes == null) {
    // Do not silently skip the gateway size rule when the size is unknown —
    // "unverified" must not read as "conformant".
    findings.push({
      ruleId: 'FDA-ESG-003',
      region: 'US',
      severity: 'warning',
      message: 'Package size could not be verified against the FDA ESG 4 GB gateway limit (totalSizeBytes not supplied)',
      fix: 'Supply totalSizeBytes so the gateway size limit can be checked',
      scope: 'package',
    });
  } else if (context.totalSizeBytes > FDA_GATEWAY_LIMIT_BYTES) {
    findings.push({
      ruleId: 'FDA-ESG-003',
      region: 'US',
      severity: 'error',
      message: `Package size ${(context.totalSizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB exceeds FDA ESG 4 GB gateway limit`,
      fix: 'Split the submission into multiple sequences',
      scope: 'package',
    });
  }

  requireBackbone(leaves, 'US', 'FDA-ESG-004', 'Generate and include the US regional XML at /m1/us/us-regional.xml', findings);

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

  if (context.totalSizeBytes == null) {
    findings.push({
      ruleId: 'EMA-CESP-004',
      region: 'EU',
      severity: 'warning',
      message: 'Package size could not be verified against the CESP 600 MB recommended limit (totalSizeBytes not supplied)',
      fix: 'Supply totalSizeBytes so the CESP size limit can be checked',
      scope: 'package',
    });
  } else if (context.totalSizeBytes > EMA_CESP_LIMIT_BYTES) {
    findings.push({
      ruleId: 'EMA-CESP-004',
      region: 'EU',
      severity: 'warning',
      message: `Package size ${(context.totalSizeBytes / 1024 / 1024).toFixed(0)} MB exceeds CESP 600 MB recommended limit`,
      fix: 'Consider splitting the submission across multiple CESP transmissions',
      scope: 'package',
    });
  }

  requireBackbone(leaves, 'EU', 'EMA-CESP-001', 'Generate and include the EU regional XML at /m1/eu/eu-regional.xml', findings);

  // Filename strictness (EU treats violations as errors)
  checkAsciiFilenames(leaves, 'EU', findings, {
    ruleId: 'EMA-CESP-005',
    severity: 'error',
    makeMessage: (filename) =>
      `Filename "${filename}" violates EU naming rules (lowercase a-z, 0-9, hyphens, periods only; max 64 chars)`,
    fix: 'Rename to match EU eCTD specification §4.1',
  });
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

  if (context.totalSizeBytes == null) {
    findings.push({
      ruleId: 'PMDA-003',
      region: 'JP',
      severity: 'warning',
      message: 'Package size could not be verified against the PMDA 1 GB recommended limit (totalSizeBytes not supplied)',
      fix: 'Supply totalSizeBytes so the PMDA size limit can be checked',
      scope: 'package',
    });
  } else if (context.totalSizeBytes > PMDA_LIMIT_BYTES) {
    findings.push({
      ruleId: 'PMDA-003',
      region: 'JP',
      severity: 'warning',
      message: `Package size ${(context.totalSizeBytes / 1024 / 1024).toFixed(0)} MB exceeds PMDA 1 GB recommended limit`,
      fix: 'Consider splitting across multiple submissions',
      scope: 'package',
    });
  }

  requireBackbone(leaves, 'JP', 'PMDA-001', 'Generate and include the JP regional XML at /m1/jp/jp-regional.xml', findings);

  const hasJpClinical = leaves.some(l => l.sectionCode.startsWith('m1.13'));
  const bridgeEntry = resolveToRegistryEntry(context.submissionType);
  const resolvedType = bridgeEntry?.applicationType?.toLowerCase() ?? context.submissionType.toLowerCase();
  const submissionRequiresJpClinical = resolvedType.includes('nda') ||
    resolvedType.includes('jnda') || resolvedType.includes('marketing approval');
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
      ruleId: 'HC-REP-003',
      region: 'CA',
      severity: 'error',
      message: `Application number "${context.applicationNumber}" does not match HC format (NDS/SNDS/ANDS/DIN)`,
      fix: 'Use a valid Health Canada application identifier',
      scope: 'package',
    });
  }

  requireBackbone(leaves, 'CA', 'HC-REP-001', 'Generate and include the CA regional XML at /m1/ca/ca-regional.xml', findings);
}

function validateNMPAPackage(
  _context: RegionalContext,
  leaves: RegionalLeafRef[],
  findings: RegionalFinding[]
): void {
  // NMPA-CDE-001: the M1 regional backbone file must be present.
  requireBackbone(leaves, 'CN', 'NMPA-CDE-001', 'Generate and include the NMPA M1 regional XML at /m1/cn/cn-regional.xml', findings);

  // NMPA-CDE-005: file/folder names follow the eCTD ASCII naming convention. The
  // dossier content is Simplified Chinese, but eCTD file names remain ASCII.
  checkAsciiFilenames(leaves, 'CN', findings, {
    ruleId: 'NMPA-CDE-005',
    severity: 'warning',
    makeMessage: (filename) =>
      `Filename "${filename}" does not follow the NMPA eCTD ASCII naming convention (lowercase a-z, 0-9, hyphens, periods)`,
    fix: 'Rename to ASCII per the NMPA eCTD技术规范 file-naming rules (Chinese belongs in document content, not file names)',
  });
}

function validateMFDSPackage(
  _context: RegionalContext,
  leaves: RegionalLeafRef[],
  findings: RegionalFinding[]
): void {
  // MFDS-KR-001: the M1 regional backbone file must be present.
  requireBackbone(leaves, 'KR', 'MFDS-KR-001', 'Generate and include the KR eCTD M1 regional XML at /m1/kr/kr-regional.xml', findings);

  // MFDS-KR-004: file/folder names follow the KR eCTD ASCII naming convention. The
  // dossier content is Korean (K-CTD), but eCTD file names remain ASCII.
  checkAsciiFilenames(leaves, 'KR', findings, {
    ruleId: 'MFDS-KR-004',
    severity: 'warning',
    makeMessage: (filename) =>
      `Filename "${filename}" does not follow the KR eCTD ASCII naming convention (lowercase a-z, 0-9, hyphens, periods)`,
    fix: 'Rename to ASCII per the KR eCTD v1.0 file-naming rules (Korean belongs in document content, not file names)',
  });
}

/**
 * Minimum-viable validator for ICH-aligned regions whose full rule pack has
 * not yet been encoded in REGIONAL_RULES (UK/AU/CH/BR/IN/SG). Without this
 * stub the `switch` in validateRegionalPackage would silently no-op for
 * these regions — backbone file presence, ASCII file names, application
 * number format, gateway size limit — all skipped. The stub at minimum
 * enforces M1 regional-backbone presence (the universal eCTD invariant
 * available from REGIONAL_BACKBONE) and the eCTD ASCII file-naming
 * convention. Region-specific rules (app-number prefix, gateway size limit,
 * language requirements, labeling) should be added as full validator
 * functions when those specifications are encoded. The rule IDs follow the
 * `{REGION}-REG-NNN` pattern (e.g., UK-REG-001) so they remain unique in
 * REGIONAL_RULES.
 */
function validateGenericRegionPackage(
  context: RegionalContext,
  leaves: RegionalLeafRef[],
  findings: RegionalFinding[]
): void {
  requireBackbone(
    leaves,
    context.region,
    `${context.region}-REG-001`,
    `Generate and include the ${context.region} M1 regional XML at /${REGIONAL_BACKBONE[context.region]}`,
    findings,
  );

  checkAsciiFilenames(leaves, context.region, findings, {
    ruleId: `${context.region}-REG-002`,
    severity: 'warning',
    makeMessage: (filename) =>
      `Filename "${filename}" does not follow the eCTD ASCII naming convention (lowercase a-z, 0-9, hyphens, periods)`,
    fix: 'Rename per the eCTD file-naming rules (ASCII only, max 64 chars, no spaces)',
  });
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
    case 'CN': return NMPA_LIMIT_BYTES;
    case 'KR': return MFDS_LIMIT_BYTES;
    // ICH-aligned agencies: conservative 1 GB default pending published specs
    default: return PMDA_LIMIT_BYTES;
  }
}
