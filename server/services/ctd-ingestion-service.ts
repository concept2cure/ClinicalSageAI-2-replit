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

// ============================================================================
// TYPES
// ============================================================================

export interface CreateCTDProjectParams {
  name: string;
  regulatoryRegion: string;
  submissionType: string;
  productName: string;
  productType: string;
  therapeuticArea?: string;
  indication?: string;
  createdBy: number;
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
    { module: 1, section: '1.1', title: 'Cover Letter', severity: 'critical' },
    { module: 1, section: '1.2', title: 'Application Form (FDA Form 356h)', severity: 'critical' },
    { module: 1, section: '1.3.1', title: 'Patent Information', severity: 'major' },
    { module: 1, section: '1.3.2', title: 'Patent Certification', severity: 'major' },
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

// ============================================================================
// PROJECT MANAGEMENT
// ============================================================================

export async function createCTDProject(
  organizationId: number,
  params: CreateCTDProjectParams
): Promise<{ projectId: number; gaps: ComplianceGap[] }> {
  const result = await pool.query(
    `INSERT INTO ctd_onboarding_projects (
      organization_id, name, regulatory_region, submission_type,
      product_name, product_type, therapeutic_area, indication,
      status, created_by, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'setup', $9, NOW(), NOW())
    RETURNING id`,
    [
      organizationId, params.name, params.regulatoryRegion, params.submissionType,
      params.productName, params.productType, params.therapeuticArea || null,
      params.indication || null, params.createdBy,
    ]
  );

  const projectId = result.rows[0].id;

  // Generate initial compliance gaps based on region
  const gaps = generateInitialGaps(params.regulatoryRegion);
  for (const gap of gaps) {
    await pool.query(
      `INSERT INTO ctd_compliance_gaps (
        ctd_project_id, organization_id, ctd_module, ctd_section,
        requirement_type, severity, description, recommendation, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        projectId, organizationId, gap.ctdModule, gap.ctdSection,
        gap.requirementType, gap.severity, gap.description, gap.recommendation,
      ]
    );
  }

  return { projectId, gaps };
}

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

const SECTION_PATTERNS: Array<{ pattern: RegExp; module: number; section: string; title: string; docType: string }> = [
  { pattern: /cover.?letter/i, module: 1, section: '1.1', title: 'Cover Letter', docType: 'cover_letter' },
  { pattern: /application.?form|356h|form.?1571/i, module: 1, section: '1.2', title: 'Application Form', docType: 'form' },
  { pattern: /patent/i, module: 1, section: '1.3.1', title: 'Patent Information', docType: 'patent_info' },
  { pattern: /quality.?overall|qos/i, module: 2, section: '2.3', title: 'Quality Overall Summary', docType: 'summary' },
  { pattern: /nonclinical.?overview/i, module: 2, section: '2.4', title: 'Nonclinical Overview', docType: 'summary' },
  { pattern: /clinical.?overview/i, module: 2, section: '2.5', title: 'Clinical Overview', docType: 'summary' },
  { pattern: /drug.?substance|api.?characterization/i, module: 3, section: '3.2.S', title: 'Drug Substance', docType: 'specification' },
  { pattern: /drug.?product|formulation/i, module: 3, section: '3.2.P', title: 'Drug Product', docType: 'specification' },
  { pattern: /stability/i, module: 3, section: '3.2.P.8', title: 'Stability', docType: 'study_report' },
  { pattern: /pharmacology/i, module: 4, section: '4.2.1', title: 'Pharmacology', docType: 'study_report' },
  { pattern: /toxicology|tox.?study|carcinogenicity|genotox/i, module: 4, section: '4.2.3', title: 'Toxicology', docType: 'study_report' },
  { pattern: /pk.?study|pharmacokinetic|adme/i, module: 4, section: '4.2.2', title: 'Pharmacokinetics', docType: 'study_report' },
  { pattern: /biopharmaceutic|bioavailability|bioequivalence/i, module: 5, section: '5.3.1', title: 'Biopharmaceutic Studies', docType: 'study_report' },
  { pattern: /pk.?report|clinical.?pharmacology/i, module: 5, section: '5.3.3', title: 'Clinical Pharmacology', docType: 'study_report' },
  { pattern: /efficacy|pivotal|phase.?3|phase.?iii/i, module: 5, section: '5.3.5', title: 'Efficacy and Safety Studies', docType: 'study_report' },
  { pattern: /safety|adverse|csr/i, module: 5, section: '5.3.5', title: 'Efficacy and Safety Studies', docType: 'study_report' },
  { pattern: /iss|integrated.?summary.?safety/i, module: 5, section: '5.3.5.3', title: 'Integrated Summary of Safety', docType: 'summary' },
  { pattern: /ise|integrated.?summary.?efficacy/i, module: 5, section: '5.3.5.3', title: 'Integrated Summary of Efficacy', docType: 'summary' },
  { pattern: /risk.?management|rmp/i, module: 1, section: '1.5.1', title: 'Risk Management Plan', docType: 'risk_management' },
];

export function detectCTDSection(fileName: string): {
  module: number;
  section: string;
  title: string;
  documentType: string;
  confidence: number;
} | null {
  const name = fileName.toLowerCase();

  for (const { pattern, module, section, title, docType } of SECTION_PATTERNS) {
    if (pattern.test(name)) {
      return {
        module,
        section,
        title,
        documentType: docType,
        confidence: 0.8,
      };
    }
  }

  // Fallback: try to detect module number from filename
  const moduleMatch = name.match(/module.?(\d)|m(\d)/);
  if (moduleMatch) {
    const mod = parseInt(moduleMatch[1] || moduleMatch[2], 10);
    if (mod >= 1 && mod <= 5) {
      return {
        module: mod,
        section: `${mod}.0`,
        title: `Module ${mod} Document`,
        documentType: 'general',
        confidence: 0.4,
      };
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

// ============================================================================
// HELPERS
// ============================================================================

function generateInitialGaps(region: string): ComplianceGap[] {
  const required = REQUIRED_SECTIONS[region] || DEFAULT_REQUIRED;
  return required.map((req) => ({
    ctdModule: req.module,
    ctdSection: req.section,
    requirementType: 'missing_section',
    severity: req.severity,
    description: `Required section: ${req.section} - ${req.title}`,
    recommendation: `Upload ${req.title} documentation for ${region} submission.`,
  }));
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
