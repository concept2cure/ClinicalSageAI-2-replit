/**
 * Submission Package Builder — Registry-aware submission package assembly.
 *
 * Builds a submission package manifest that includes all required
 * documents, forms, and metadata for a given application type.
 * Used for eCTD packaging, export, and submission readiness.
 *
 * @module server/services/regulatory/submissionPackageBuilder
 */

import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import { getSectionBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap.js';
import { getRegionProfile } from '../../../shared/regulatory/region-profiles.js';
import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import { getRequiredArtifacts, type ArtifactRequirement } from './requiredArtifactMatrix.js';
import type { RegulatoryApplicationType, SectionDefinition } from '../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageManifest {
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
  validationRules: string[];
}

export interface PackageMetadata {
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

  const sectionBlueprint = getSectionBlueprintForEntry(entry);
  const requiredArtifacts = getRequiredArtifacts(registryId);
  const regionProfile = getRegionProfile(entry.region);

  // Map actual data
  const sectionMap = new Map(projectSections.map(s => [s.code, s]));
  const artifactMap = new Map(projectArtifacts.map(a => [a.type, a]));

  // Build section list
  const sections: PackageSection[] = sectionBlueprint.sections.map(s => {
    const actual = sectionMap.get(s.code);
    return {
      code: s.code,
      title: s.title,
      module: s.module,
      required: s.required,
      status: actual
        ? (['approved', 'locked', 'signed'].includes(actual.status) ? (actual.status === 'locked' ? 'locked' : 'approved') : 'present')
        : 'missing',
      documentIds: actual?.documentIds ?? [],
    };
  });

  // Build artifact list
  const artifacts: PackageArtifact[] = requiredArtifacts.map(a => {
    const actual = artifactMap.get(a.artifactType);
    return {
      artifactType: a.artifactType,
      label: a.label,
      required: a.required,
      status: actual
        ? (['approved', 'locked', 'signed'].includes(actual.status) ? 'approved' : 'present')
        : 'missing',
      documentId: actual?.documentId,
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

  return {
    registryId: entry.id,
    applicationName: entry.displayName,
    dossierStandard: entry.dossierStandard,
    agency: entry.agency,
    region: entry.region,
    country: entry.country,
    submissionGateway: regionProfile?.submissionGateway ?? null,
    sections,
    artifacts,
    validationRules,
    metadata: {
      generatedAt: new Date().toISOString(),
      projectId,
      totalSections: sections.length,
      requiredSections: requiredSectionsList.length,
      completedSections: completedSections.length,
      totalArtifacts: artifacts.length,
      requiredArtifacts: requiredArtifactsList.length,
      presentArtifacts: presentArtifacts.length,
      packageComplete:
        completedSections.length === requiredSectionsList.length &&
        presentArtifacts.length === requiredArtifactsList.length,
    },
  };
}

// ─── Validation Rules ─────────────────────────────────────────────────────────

function getPackageValidationRules(entry: RegulatoryApplicationType): string[] {
  const rules: string[] = ['all_required_sections_present', 'all_required_artifacts_present'];

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
