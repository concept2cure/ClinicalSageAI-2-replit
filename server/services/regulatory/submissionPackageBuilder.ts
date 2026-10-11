/**
 * Submission Package Builder — Registry-aware submission package assembly.
 *
 * Builds a submission package manifest that includes all required
 * documents, forms, and metadata for a given application type.
 * Used for eCTD packaging, export, and submission readiness.
 *
 * @module server/services/regulatory/submissionPackageBuilder
 */

import { evidenceIsApproved, evidenceIsRetired, groupSubmissionEvidence, submissionEvidenceState } from './submissionEvidenceStatus.js';
import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import { getResolvedSectionBlueprint, getSectionBlueprintContext, requiresSectionApplicabilityAssessment } from './sectionBlueprintCatalog.js';
import { getRegionProfile } from '../../../shared/regulatory/region-profiles.js';
import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import { getRequiredArtifacts, hasArtifactMatrix } from './requiredArtifactMatrix.js';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageManifest {
  /** Scope/provenance limits of the authoring scaffold, when present. */
  outlineLimitations?: string[];
  /** Registry entry ID */
  registryId: string;
  /** Application display name */
  applicationName: string;
  /** Dossier standard */
  dossierStandard: string;
  /** Target agency */
  agency: string;
  /** Region/country */
  region: string;
  country: string;
  /** Submission gateway info */
  submissionGateway: string | null;
  /** Expected sections in the package */
  sections: PackageSection[];
  /** Expected artifacts */
  artifacts: PackageArtifact[];
  /** Package-level validation rules */
  validationRules: string[];
  /** Package metadata */
  metadata: PackageMetadata;
}

export interface PackageSection {
  code: string;
  title: string;
  module: number;
  required: boolean;
  status: 'missing' | 'present' | 'approved' | 'locked';
  documentIds: string[];
}

export interface PackageArtifact {
  artifactType: string;
  label: string;
  required: boolean;
  status: 'missing' | 'present' | 'approved' | 'locked';
  documentId?: string;
  /** All current source documents in this requirement group. */
  documentIds?: string[];
  validationRules: string[];
}

export interface PackageMetadata {
  artifactRequirementsAssessed?: boolean;
  /** Every requirement carries an explicit source identity; this does not verify it. */
  sourceIdentitiesPresent?: boolean;
  /** Approved required artifact groups, separate from presence. */
  approvedArtifacts?: number;
  sectionApplicabilityAssessed?: boolean;
  generatedAt: string;
  projectId: string;
  totalSections: number;
  requiredSections: number;
  completedSections: number;
  totalArtifacts: number;
  requiredArtifacts: number;
  presentArtifacts: number;
  packageComplete: boolean;
}

// ─── Actual Project Data Types ────────────────────────────────────────────────

export interface ProjectSectionData {
  code: string;
  status: string;
  documentIds: string[];
}

export interface ProjectArtifactData {
  type: string;
  status: string;
  documentId?: string;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a submission package manifest for a project.
 */
export function buildPackageManifest(
  registryIdOrLegacy: string,
  projectId: string,
  projectSections: ProjectSectionData[],
  projectArtifacts: ProjectArtifactData[]
): PackageManifest | null {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  const entry = getApplicationType(registryId);

  if (!entry) return null;

  const sectionBlueprint = getResolvedSectionBlueprint(entry);
  const requiredArtifacts = getRequiredArtifacts(registryId);

  // Map actual data
  const sectionMap = groupSubmissionEvidence(projectSections, s => s.code);
  const artifactMap = groupSubmissionEvidence(projectArtifacts, a => a.type);

  // Build section list
  const sections: PackageSection[] = sectionBlueprint.sections.map(s => {
    const actual = (sectionMap.get(s.code) ?? []).filter(r => !evidenceIsRetired(r.status));
    return {
      code: s.code,
      title: s.title,
      module: s.module,
      required: s.required,
      status: submissionEvidenceState(actual.map(r => (r.documentIds ?? []).some(id => typeof id === 'string' && id.trim()) ? r.status : 'missing')),
      documentIds: [...new Set(actual.flatMap(r => r.documentIds ?? []).filter(id => typeof id === 'string' && id.trim()))],
    };
  });

  // Build artifact list
  const artifacts: PackageArtifact[] = requiredArtifacts.map(a => {
    const actual = (artifactMap.get(a.artifactType) ?? []).filter(r => !evidenceIsRetired(r.status));
    return {
      artifactType: a.artifactType,
      label: a.label,
      required: a.required,
      status: submissionEvidenceState(actual.map(r => r.status)),
      documentId: actual.length === 1 ? actual[0].documentId : undefined,
      documentIds: [...new Set(actual.map(r => r.documentId).filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))],
      validationRules: a.validationRules,
    };
  });

  // Validation rules
  const validationRules = getPackageValidationRules(entry);

  // Metadata
  const requiredSectionsList = sections.filter(s => s.required);
  const completedSections = requiredSectionsList.filter(s => ['approved', 'locked'].includes(s.status));
  const requiredArtifactsList = artifacts.filter(a => a.required);
  const presentArtifacts = requiredArtifactsList.filter(a => a.status !== 'missing');
  const approvedArtifacts = requiredArtifactsList.filter(a => evidenceIsApproved(a.status));
  const sourceIdentitiesPresent = hasArtifactMatrix(registryId) && requiredArtifactsList.every(a => {
    const current = (artifactMap.get(a.artifactType) ?? []).filter(r => !evidenceIsRetired(r.status));
    return current.length > 0 && current.every(r => Boolean(r.documentId?.trim()));
  }) && requiredSectionsList.every(s => s.documentIds.length > 0);

  return {
    outlineLimitations: [...getSectionBlueprintContext(entry.id).limitations,
      ...(requiresSectionApplicabilityAssessment(entry.id) ? ['Artifact rows are baseline template expectations; conditional content and permitted alternatives have not been assessed.'] : [])],
    registryId: entry.id,
    applicationName: entry.displayName,
    dossierStandard: entry.dossierStandard,
    agency: entry.agency,
    region: entry.region,
    country: entry.country,
    submissionGateway: packageSubmissionGateway(entry),
    sections,
    artifacts,
    validationRules,
    metadata: {
      artifactRequirementsAssessed: hasArtifactMatrix(registryId) && !requiresSectionApplicabilityAssessment(registryId),
      ...(requiresSectionApplicabilityAssessment(registryId) ? { sectionApplicabilityAssessed: false } : {}),
      sourceIdentitiesPresent,
      approvedArtifacts: approvedArtifacts.length,
      generatedAt: new Date().toISOString(),
      projectId,
      totalSections: sections.length,
      requiredSections: requiredSectionsList.length,
      completedSections: completedSections.length,
      totalArtifacts: artifacts.length,
      requiredArtifacts: requiredArtifactsList.length,
      presentArtifacts: presentArtifacts.length,
      packageComplete:
        hasArtifactMatrix(registryId) && !requiresSectionApplicabilityAssessment(registryId) &&
        completedSections.length === requiredSectionsList.length &&
        sourceIdentitiesPresent && approvedArtifacts.length === requiredArtifactsList.length,
    },
  };
}

// ─── Validation Rules ─────────────────────────────────────────────────────────

function packageSubmissionGateway(entry: RegulatoryApplicationType): string | null {
  if (entry.id === 'EU_CTA') return 'CTIS';
  if (['CA_CTA', 'CA_CTA_A', 'JP_CTN', 'US_IND_SR'].includes(entry.id) || entry.region === 'GLOBAL') return null;
  return getRegionProfile(entry.region)?.submissionGateway ?? null;
}

function getPackageValidationRules(entry: RegulatoryApplicationType): string[] {
  const rules: string[] = ['all_required_sections_present', 'all_required_artifacts_present', 'all_required_content_approved', 'saved_source_identities_required'];
  if (!hasArtifactMatrix(entry.id)) rules.push('artifact_requirements_not_modelled');
  if (requiresSectionApplicabilityAssessment(entry.id)) rules.push('section_applicability_not_assessed');
  if (entry.id === 'US_IND_SR') return [...rules, 'ind_safety_subtype_and_commercial_status_not_assessed', 'e2b_aems_or_ectd_route_review_required'];
  if (entry.id === 'EU_CTA') return [...rules, 'ctis_form_and_part_i_ii_validation_required', 'msc_language_and_disclosure_review_required'];
  if (entry.id === 'CA_CTA' || entry.id === 'CA_CTA_A') return [...rules, 'canadian_trial_modules_1_to_3_review_required', 'trial_format_and_delivery_not_assessed'];
  if (entry.id === 'JP_CTN') return [...rules, 'pmda_notification_pdf_xml_validation_required', 'notification_category_timing_and_attachments_review_required'];
  if (entry.region === 'GLOBAL') return [...rules, 'receiving_agency_and_document_placement_not_assessed'];

  if (entry.dossierStandard === 'eCTD') {
    rules.push('ectd_structure_valid', 'ectd_checksums_valid', 'ectd_xml_valid');
  }

  if (entry.region === 'US') {
    rules.push('fda_forms_signed', 'ectd_us_regional_valid');
  }

  if (entry.region === 'EU') {
    rules.push('eu_module1_complete', 'smpc_qrd_compliant');
  }

  if (['US_IND', 'US_NDA', 'US_BLA'].includes(entry.id)) {
    rules.push('part11_signatures_valid');
  }

  return rules;
}
