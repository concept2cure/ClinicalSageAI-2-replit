/**
 * CTD Ingestion Service
 *
 * Manages the client CTD onboarding pipeline: project creation, document
 * upload/tracking, section detection, and completeness validation with
 * compliance gap analysis.
 *
 * @module server/services/ctd-ingestion-service
 */

import { pool } from '../db.js';
import { soleModule1Placement, type ApplicationKind, type DocumentRole } from '../../shared/regulatory/regional-module1';

/**
 * The US Module 1 heading the record files `role` under, or null when it holds none.
 *
 * A null is an answer: `detectCTDSection` returns the module with a null section, the shape it
 * already uses when only the module is named, and the caller asks what the document is instead of
 * being handed a number. Never a nearest match — a number that looks close is how a risk-management
 * plan came to be proposed for the heading that means "withdrawal of an IND".
 */
function m1Section(role: DocumentRole, kind: ApplicationKind = 'ind'): string | null {
  return soleModule1Placement(role, 'US', kind)?.code ?? null;
}

export interface CTDDocumentUpload {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  ctdModule: number;
  ctdSection: string;
  sectionTitle: string;
  documentType: string;
}

export interface ComplianceGap {
  ctdModule: number;
  ctdSection: string;
  requirementType: string;
  severity: string;
  description: string;
  recommendation: string;
}

// ============================================================================
// REQUIRED SECTIONS BY REGION
// ============================================================================

const REQUIRED_SECTIONS: Record<string, Array<{ module: number; section: string; title: string; severity: string }>> = {
  FDA: [
    /* FDA regional Module 1: 1.1 is FORMS, 1.2 is the COVER LETTER
    (shared/regulatory/regional-module1.ts; gate: tests/regulatory/m1-placement-repo-wide.test.ts).
    The table of contents has no US Module 1 heading at all — the eCTD XML backbone IS the table
    of contents — so the row for it is gone rather than renumbered. */
    /* This table was missed when SECTION_PATTERNS below was put on the record on 2026-10-12:
       the same file held the same swapped pair twice, and only one copy was fixed. Patent
       information and certification are 1.3.5 (1.3.5.1 / 1.3.5.2); FDA 1.3.2 is FIELD COPY
       certification, which is a different document. */
    { module: 1, section: '1.1', title: 'Forms (FDA Form 356h)', severity: 'critical' },
    { module: 1, section: '1.2', title: 'Cover Letter', severity: 'critical' },
    { module: 1, section: '1.3.5.1', title: 'Patent Information', severity: 'major' },
    { module: 1, section: '1.3.5.2', title: 'Patent Certification', severity: 'major' },
    { module: 2, section: '2.2', title: 'Introduction to CTD', severity: 'critical' },
    { module: 2, section: '2.3', title: 'Quality Overall Summary', severity: 'critical' },
    { module: 2, section: '2.4', title: 'Nonclinical Overview', severity: 'critical' },
    { module: 2, section: '2.5', title: 'Clinical Overview', severity: 'critical' },
    { module: 2, section: '2.6', title: 'Nonclinical Written/Tabulated Summaries', severity: 'major' },
    { module: 2, section: '2.7', title: 'Clinical Summaries', severity: 'major' },
    { module: 3, section: '3.2.S', title: 'Drug Substance', severity: 'critical' },
    { module: 3, section: '3.2.P', title: 'Drug Product', severity: 'critical' },
    { module: 4, section: '4.2.1', title: 'Pharmacology', severity: 'major' },
    { module: 4, section: '4.2.3', title: 'Toxicology', severity: 'critical' },
    { module: 5, section: '5.3.1', title: 'Biopharmaceutic Studies', severity: 'major' },
    { module: 5, section: '5.3.5', title: 'Efficacy and Safety Studies', severity: 'critical' },
  ],
  EMA: [
    { module: 1, section: '1.0', title: 'Cover Letter', severity: 'critical' },
    { module: 1, section: '1.2', title: 'Application Form', severity: 'critical' },
    { module: 1, section: '1.3.1', title: 'SPC, Labeling, Package Leaflet', severity: 'critical' },
    { module: 1, section: '1.5.1', title: 'RMP (Risk Management Plan)', severity: 'critical' },
    { module: 1, section: '1.5.2', title: 'PSUR', severity: 'major' },
    { module: 2, section: '2.2', title: 'Introduction to CTD', severity: 'critical' },
    { module: 2, section: '2.3', title: 'Quality Overall Summary', severity: 'critical' },
    { module: 2, section: '2.4', title: 'Nonclinical Overview', severity: 'critical' },
    { module: 2, section: '2.5', title: 'Clinical Overview', severity: 'critical' },
    { module: 3, section: '3.2.S', title: 'Drug Substance', severity: 'critical' },
    { module: 3, section: '3.2.P', title: 'Drug Product', severity: 'critical' },
    { module: 4, section: '4.2.3', title: 'Toxicology', severity: 'critical' },
    { module: 5, section: '5.3.5', title: 'Clinical Studies', severity: 'critical' },
  ],
  PMDA: [
    { module: 1, section: '1.1', title: 'Cover Letter (Japanese)', severity: 'critical' },
    { module: 1, section: '1.2', title: 'Application Form (CTD-J)', severity: 'critical' },
    { module: 1, section: '1.12', title: 'Japanese Bridging Data', severity: 'critical' },
    { module: 2, section: '2.3', title: 'Quality Overall Summary', severity: 'critical' },
    { module: 2, section: '2.5', title: 'Clinical Overview', severity: 'critical' },
    { module: 3, section: '3.2.S', title: 'Drug Substance', severity: 'critical' },
    { module: 3, section: '3.2.P', title: 'Drug Product', severity: 'critical' },
    { module: 5, section: '5.3.5', title: 'Clinical Studies', severity: 'critical' },
  ],
  NMPA: [
    { module: 1, section: '1.1', title: 'Cover Letter (Chinese)', severity: 'critical' },
    { module: 1, section: '1.2', title: 'Application Form', severity: 'critical' },
    { module: 2, section: '2.3', title: 'Quality Overall Summary', severity: 'critical' },
    { module: 2, section: '2.5', title: 'Clinical Overview', severity: 'critical' },
    { module: 3, section: '3.2.S', title: 'Drug Substance', severity: 'critical' },
    { module: 3, section: '3.2.P', title: 'Drug Product', severity: 'critical' },
    { module: 5, section: '5.3.5', title: 'Clinical Studies', severity: 'critical' },
  ],
};

// Default for agencies not explicitly listed
const DEFAULT_REQUIRED = REQUIRED_SECTIONS.FDA;

export async function listCTDProjects(organizationId: number) {
  const result = await pool.query(
    `SELECT id, uuid, name, regulatory_region, submission_type, product_name,
            product_type, therapeutic_area, indication, status,
            completion_percentage, created_at, updated_at
     FROM ctd_onboarding_projects
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  );
  return result.rows;
}

export async function getCTDProjectStatus(ctdProjectId: number, organizationId: number) {
  const projectResult = await pool.query(
    `SELECT * FROM ctd_onboarding_projects WHERE id = $1 AND organization_id = $2`,
    [ctdProjectId, organizationId]
  );

  if (projectResult.rows.length === 0) return null;

  const docsResult = await pool.query(
    `SELECT id, uuid, file_name, file_size, ctd_module, ctd_section,
            section_title, document_type, status, extraction_confidence, created_at
     FROM ctd_onboarding_documents
     WHERE ctd_project_id = $1 AND organization_id = $2
     ORDER BY ctd_module, ctd_section`,
    [ctdProjectId, organizationId]
  );

  const gapsResult = await pool.query(
    `SELECT id, ctd_module, ctd_section, requirement_type, severity,
            description, recommendation, resolved, resolved_at
     FROM ctd_compliance_gaps
     WHERE ctd_project_id = $1 AND organization_id = $2
     ORDER BY severity DESC, ctd_module, ctd_section`,
    [ctdProjectId, organizationId]
  );

  return {
    project: projectResult.rows[0],
    documents: docsResult.rows,
    gaps: gapsResult.rows,
  };
}

// ============================================================================
// DOCUMENT UPLOAD
// ============================================================================

export async function uploadCTDDocument(
  ctdProjectId: number,
  organizationId: number,
  doc: CTDDocumentUpload
) {
  const projectResult = await pool.query(
    `SELECT id FROM ctd_onboarding_projects WHERE id = $1 AND organization_id = $2`,
    [ctdProjectId, organizationId]
  );
  if (projectResult.rows.length === 0) {
    throw new Error('CTD project not found for organization');
  }

  const result = await pool.query(
    `INSERT INTO ctd_onboarding_documents (
      ctd_project_id, organization_id, file_name, file_size, mime_type,
      storage_path, ctd_module, ctd_section, section_title, document_type,
      status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'uploaded', NOW(), NOW())
    RETURNING id, uuid`,
    [
      ctdProjectId, organizationId, doc.fileName, doc.fileSize, doc.mimeType,
      doc.storagePath, doc.ctdModule, doc.ctdSection, doc.sectionTitle,
      doc.documentType,
    ]
  );

  // Mark matching compliance gaps as resolved
  await pool.query(
    `UPDATE ctd_compliance_gaps
     SET resolved = TRUE, resolved_at = NOW()
     WHERE ctd_project_id = $1 AND organization_id = $2
       AND ctd_section = $3 AND resolved = FALSE`,
    [ctdProjectId, organizationId, doc.ctdSection]
  );

  // Recalculate completion percentage
  await recalculateCompletion(ctdProjectId, organizationId);

  return result.rows[0];
}

// ============================================================================
// SECTION DETECTION
// ============================================================================

/*
 * VR-04 (row D4, docs/evidence/D4/2026-09-29-vault-classifier-anchoring/).
 * Every pattern is anchored on word boundaries: unanchored, 'Permission' was
 * ISS and 'Otherwise' was ISE. First match wins, so the specific patterns come
 * before the generic ones (ISS/ISE before efficacy and safety, clinical
 * pharmacology before pharmacology). A generic safety word alone is a
 * medium-confidence signal, and a safety data sheet is not a CTD document.
 */
export const SECTION_PATTERNS: Array<{
  pattern: RegExp;
  module: number;
  /** Null where the record holds no single heading for the document: the caller asks. */
  section: string | null;
  title: string;
  docType: string;
  confidence?: number;
}> = [
  /* Module 1 placements come from the record (m1Section below), not from this table: the three
     rows here each named the wrong heading — the cover letter at 1.1 and the application form at
     1.2 are swapped (US 1.1 is Forms, 1.2 is the Cover Letter), and patent information at 1.3.1,
     which is Contact/Sponsor/Applicant Information, belongs at 1.3.5. */
  { pattern: /\bcover ?letter\b/, module: 1, section: m1Section('cover_letter'), title: 'Cover Letter', docType: 'cover_letter' },
  { pattern: /\b(application ?form|356h|form ?1571)\b/, module: 1, section: m1Section('application_form'), title: 'Application Form', docType: 'form' },
  { pattern: /\bpatent\b/, module: 1, section: m1Section('patent', 'nda'), title: 'Patent Information', docType: 'patent_info' },
  { pattern: /\b(quality ?overall ?summary|qos)\b/, module: 2, section: '2.3', title: 'Quality Overall Summary', docType: 'summary' },
  { pattern: /\bnonclinical ?overview\b/, module: 2, section: '2.4', title: 'Nonclinical Overview', docType: 'summary' },
  { pattern: /\bclinical ?overview\b/, module: 2, section: '2.5', title: 'Clinical Overview', docType: 'summary' },
  { pattern: /\b(drug ?substance|api ?characterization)\b/, module: 3, section: '3.2.S', title: 'Drug Substance', docType: 'specification' },
  { pattern: /\b(drug ?product|formulation)\b/, module: 3, section: '3.2.P', title: 'Drug Product', docType: 'specification' },
  { pattern: /\bstability\b/, module: 3, section: '3.2.P.8', title: 'Stability', docType: 'study_report' },
  /* 5.3.3 is Reports of Human Pharmacokinetic (PK) Studies (ICH M4E(R2)). "Clinical pharmacology"
     is broader than that heading — PD reports file at 5.3.4 — so the row keeps the record's title
     and the filename heuristic stays a proposal, not a determination. */
  { pattern: /\b(pk ?report|clinical ?pharmacology)\b/, module: 5, section: '5.3.3', title: 'Reports of Human Pharmacokinetic (PK) Studies', docType: 'study_report' },
  { pattern: /\bpharmacology\b/, module: 4, section: '4.2.1', title: 'Pharmacology', docType: 'study_report' },
  { pattern: /\b(toxicology|tox ?study|carcinogenicity|genotox\w*)\b/, module: 4, section: '4.2.3', title: 'Toxicology', docType: 'study_report' },
  { pattern: /\b(pk ?study|pharmacokinetics?|adme)\b/, module: 4, section: '4.2.2', title: 'Pharmacokinetics', docType: 'study_report' },
  { pattern: /\b(biopharmaceutics?|bioavailability|bioequivalence)\b/, module: 5, section: '5.3.1', title: 'Biopharmaceutic Studies', docType: 'study_report' },
  { pattern: /\b(iss|integrated ?summary ?(of ?)?safety)\b/, module: 5, section: '5.3.5.3', title: 'Integrated Summary of Safety', docType: 'summary' },
  { pattern: /\b(ise|integrated ?summary ?(of ?)?efficacy)\b/, module: 5, section: '5.3.5.3', title: 'Integrated Summary of Efficacy', docType: 'summary' },
  { pattern: /\b(efficacy|pivotal|phase ?(3|iii))\b/, module: 5, section: '5.3.5', title: 'Efficacy and Safety Studies', docType: 'study_report' },
  { pattern: /\bcsr\b/, module: 5, section: '5.3.5', title: 'Clinical Study Report', docType: 'study_report' },
  { pattern: /\b(safety|adverse)\b/, module: 5, section: '5.3.5', title: 'Efficacy and Safety Studies', docType: 'study_report', confidence: 0.6 },
  /* A risk-management document names NO US Module 1 section. FDA has REMS (1.16) and risk
     management that is not a REMS; it has no node called an RMP, so `m1Section('rmp')` is null and
     this row proposes the module and asks. It used to assert 1.5.1 — US 1.5 is Application Status
     ("withdrawal, inactivation, reactivation and reinstatement requests") with no child sections at
     all, so the platform was proposing that a sponsor file their risk-management plan under the
     heading whose controlled meaning is that they are withdrawing the IND. */
  { pattern: /\b(risk ?management|rmp)\b/, module: 1, section: m1Section('rmp'), title: 'Risk Management Plan', docType: 'risk_management' },
];

/** Names that look like CTD content and are not: a chemical safety data sheet. */
const NOT_CTD = /\b(safety ?data ?sheet|m?sds)\b/;

/**
 * Propose a CTD placement from a file name.
 *
 * `section` is null when only the module is named ('Module 3 notes.pdf',
 * 'M4 summary.pdf'): a bare module is a container, not a place a document can
 * go (validateSectionCode). It used to be the invented section 'N.0'.
 */
export function detectCTDSection(fileName: string): {
  module: number;
  section: string | null;
  title: string;
  documentType: string;
  confidence: number;
} | null {
  // Hyphens, underscores and dots separate words in file names; '_' is a word
  // character to \b, so they become spaces before the anchored patterns run.
  const name = fileName.toLowerCase().replace(/[-_.]+/g, ' ');
  if (NOT_CTD.test(name)) return null;

  for (const { pattern, module, section, title, docType, confidence } of SECTION_PATTERNS) {
    if (pattern.test(name)) {
      return { module, section, title, documentType: docType, confidence: confidence ?? 0.8 };
    }
  }

  const moduleMatch = name.match(/\bmodule ?(\d)\b|\bm(\d)\b/);
  if (moduleMatch) {
    const mod = parseInt(moduleMatch[1] || moduleMatch[2], 10);
    if (mod >= 1 && mod <= 5) {
      return { module: mod, section: null, title: `Module ${mod} Document`, documentType: 'general', confidence: 0.4 };
    }
  }

  return null;
}

// ============================================================================
// VALIDATION
// ============================================================================

export async function validateCTDCompleteness(ctdProjectId: number, organizationId: number) {
  const project = await pool.query(
    `SELECT regulatory_region FROM ctd_onboarding_projects WHERE id = $1 AND organization_id = $2`,
    [ctdProjectId, organizationId]
  );

  if (project.rows.length === 0) return null;

  const region = project.rows[0].regulatory_region;
  const docs = await pool.query(
    `SELECT ctd_section FROM ctd_onboarding_documents WHERE ctd_project_id = $1 AND organization_id = $2`,
    [ctdProjectId, organizationId]
  );

  const uploadedSections = new Set(docs.rows.map((d: { ctd_section: string }) => d.ctd_section));
  const required = REQUIRED_SECTIONS[region] || DEFAULT_REQUIRED;

  // Rebuild the required section set from current uploads to avoid stale rows
  // and keep completion math stable over repeated validation runs.
  await pool.query(
    `DELETE FROM ctd_compliance_gaps WHERE ctd_project_id = $1 AND organization_id = $2`,
    [ctdProjectId, organizationId]
  );

  const newGaps: ComplianceGap[] = [];
  for (const req of required) {
    const isResolved = uploadedSections.has(req.section);
    const gap: ComplianceGap = {
      ctdModule: req.module,
      ctdSection: req.section,
      requirementType: 'missing_section',
      severity: req.severity,
      description: isResolved
        ? `Required section satisfied: ${req.section} - ${req.title}`
        : `Missing required section: ${req.section} - ${req.title}`,
      recommendation: isResolved
        ? `Section ${req.section} has been uploaded for ${region} submission readiness.`
        : `Upload ${req.title} documentation for ${region} submission compliance.`,
    };

    await pool.query(
      `INSERT INTO ctd_compliance_gaps (
        ctd_project_id, organization_id, ctd_module, ctd_section,
        requirement_type, severity, description, recommendation, resolved, resolved_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        ctdProjectId,
        organizationId,
        gap.ctdModule,
        gap.ctdSection,
        gap.requirementType,
        gap.severity,
        gap.description,
        gap.recommendation,
        isResolved,
        isResolved ? new Date() : null,
      ]
    );

    if (!isResolved) {
      newGaps.push(gap);
    }
  }

  // Update project status
  await pool.query(
    `UPDATE ctd_onboarding_projects
     SET status = 'validating', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [ctdProjectId, organizationId]
  );

  await recalculateCompletion(ctdProjectId, organizationId);

  return {
    totalRequired: required.length,
    fulfilled: required.length - newGaps.length,
    gaps: newGaps,
    completionPercentage: Math.round(((required.length - newGaps.length) / required.length) * 100),
  };
}

async function recalculateCompletion(ctdProjectId: number, organizationId: number) {
  const totalResult = await pool.query(
    `SELECT COUNT(*) as total
     FROM ctd_compliance_gaps
     WHERE ctd_project_id = $1 AND organization_id = $2`,
    [ctdProjectId, organizationId]
  );
  const resolvedResult = await pool.query(
    `SELECT COUNT(*) as resolved
     FROM ctd_compliance_gaps
     WHERE ctd_project_id = $1 AND organization_id = $2 AND resolved = TRUE`,
    [ctdProjectId, organizationId]
  );

  const total = parseInt(totalResult.rows[0].total, 10);
  const resolved = parseInt(resolvedResult.rows[0].resolved, 10);
  const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

  await pool.query(
    `UPDATE ctd_onboarding_projects
     SET completion_percentage = $1, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3`,
    [pct, ctdProjectId, organizationId]
  );
}
