/**
 * Required Artifact Matrix — Maps registry entries to their expected
 * artifact types for readiness evaluation.
 *
 * Each application type has a set of required and optional artifacts.
 * The readiness evaluator compares this matrix against actual governed
 * artifacts to determine submission readiness.
 *
 * Section codes follow the FDA eCTD Module 1 Specification v2.3 for US entries
 * (forms under 1.1, cover letter 1.2, brochure 1.14.4.1, prescribing information
 * under 1.14.1) — held to the FDA heading list by
 * tests/regulatory/fda-module1-numbering.test.ts.
 *
 * @module server/services/regulatory/requiredArtifactMatrix
 */

import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArtifactRequirement {
  /** Artifact type identifier */
  artifactType: string;
  /** Human-readable label */
  label: string;
  /** Whether this is required for initial submission */
  required: boolean;
  /** Whether this is required for amendment/supplement */
  requiredForAmendment: boolean;
  /** CTD section code(s) this artifact maps to */
  sectionCodes: string[];
  /** Typical document format */
  format: 'pdf' | 'xml' | 'docx' | 'xpt' | 'any';
  /** Whether this can be AI-drafted */
  aiDraftable: boolean;
  /** Typical responsible role */
  assigneeRole: string;
  /** Validation rules for this artifact */
  validationRules: string[];
}

// ─── Artifact Matrices ────────────────────────────────────────────────────────

const US_IND_ARTIFACTS: ArtifactRequirement[] = [
  { artifactType: 'form_1571', label: 'Form FDA 1571', required: true, requiredForAmendment: true, sectionCodes: ['m1.1'], format: 'pdf', aiDraftable: false, assigneeRole: 'regulatory_lead', validationRules: ['signature_required', 'form_complete'] },
  { artifactType: 'form_1572', label: 'Form FDA 1572', required: true, requiredForAmendment: false, sectionCodes: ['m1.1'], format: 'pdf', aiDraftable: false, assigneeRole: 'regulatory_lead', validationRules: ['signature_required'] },
  { artifactType: 'form_3674', label: 'Form FDA 3674', required: true, requiredForAmendment: false, sectionCodes: ['m1.1'], format: 'pdf', aiDraftable: false, assigneeRole: 'regulatory_lead', validationRules: ['form_complete'] },
  { artifactType: 'cover_letter', label: 'Cover Letter', required: true, requiredForAmendment: true, sectionCodes: ['m1.2'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
  // No 'toc' artifact: in eCTD the XML backbone is the table of contents; FDA
  // Module 1 v2.3 has no heading for one (the former 'm1.5' is Application Status).
  { artifactType: 'general_investigational_plan', label: 'Introductory Statement and General Investigational Plan', required: true, requiredForAmendment: false, sectionCodes: ['m1.20'], format: 'pdf', aiDraftable: true, assigneeRole: 'clinical_lead', validationRules: ['content_present'] },
  { artifactType: 'clinical_overview', label: 'Clinical Overview', required: true, requiredForAmendment: false, sectionCodes: ['m2.5'], format: 'pdf', aiDraftable: true, assigneeRole: 'clinical_lead', validationRules: ['content_present', 'references_complete'] },
  { artifactType: 'quality_overall_summary', label: 'Quality Overall Summary', required: true, requiredForAmendment: false, sectionCodes: ['m2.3'], format: 'pdf', aiDraftable: true, assigneeRole: 'cmc_lead', validationRules: ['content_present'] },
  { artifactType: 'nonclinical_overview', label: 'Nonclinical Overview', required: true, requiredForAmendment: false, sectionCodes: ['m2.4'], format: 'pdf', aiDraftable: true, assigneeRole: 'nonclinical_lead', validationRules: ['content_present'] },
  { artifactType: 'protocol', label: 'Clinical Protocol', required: true, requiredForAmendment: false, sectionCodes: ['m5.3.5.1'], format: 'pdf', aiDraftable: false, assigneeRole: 'clinical_lead', validationRules: ['content_present', 'irb_approval'] },
  { artifactType: 'investigator_brochure', label: 'Investigator Brochure', required: true, requiredForAmendment: false, sectionCodes: ['m1.14.4.1'], format: 'pdf', aiDraftable: false, assigneeRole: 'clinical_lead', validationRules: ['content_present'] },
];

const US_NDA_ARTIFACTS: ArtifactRequirement[] = [
  { artifactType: 'form_356h', label: 'Form FDA 356h', required: true, requiredForAmendment: true, sectionCodes: ['m1.1'], format: 'pdf', aiDraftable: false, assigneeRole: 'regulatory_lead', validationRules: ['signature_required', 'form_complete'] },
  { artifactType: 'cover_letter', label: 'Cover Letter', required: true, requiredForAmendment: true, sectionCodes: ['m1.2'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
  { artifactType: 'clinical_overview', label: 'Clinical Overview', required: true, requiredForAmendment: false, sectionCodes: ['m2.5'], format: 'pdf', aiDraftable: true, assigneeRole: 'clinical_lead', validationRules: ['content_present'] },
  { artifactType: 'quality_overall_summary', label: 'Quality Overall Summary', required: true, requiredForAmendment: false, sectionCodes: ['m2.3'], format: 'pdf', aiDraftable: true, assigneeRole: 'cmc_lead', validationRules: ['content_present'] },
  { artifactType: 'nonclinical_overview', label: 'Nonclinical Overview', required: true, requiredForAmendment: false, sectionCodes: ['m2.4'], format: 'pdf', aiDraftable: true, assigneeRole: 'nonclinical_lead', validationRules: ['content_present'] },
  { artifactType: 'csr', label: 'Clinical Study Reports', required: true, requiredForAmendment: false, sectionCodes: ['m5.3'], format: 'pdf', aiDraftable: false, assigneeRole: 'clinical_lead', validationRules: ['content_present'] },
  { artifactType: 'prescribing_info', label: 'Prescribing Information', required: true, requiredForAmendment: false, sectionCodes: ['m1.14.1.3'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
];

const US_510K_ARTIFACTS: ArtifactRequirement[] = [
  { artifactType: 'cover_letter', label: 'Cover Letter', required: true, requiredForAmendment: false, sectionCodes: ['1'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
  { artifactType: 'device_description', label: 'Device Description', required: true, requiredForAmendment: false, sectionCodes: ['3'], format: 'pdf', aiDraftable: true, assigneeRole: 'engineering_lead', validationRules: ['content_present'] },
  { artifactType: 'predicate_comparison', label: 'Predicate Device Comparison', required: true, requiredForAmendment: false, sectionCodes: ['4'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
  { artifactType: 'performance_testing', label: 'Performance Testing', required: true, requiredForAmendment: false, sectionCodes: ['5'], format: 'pdf', aiDraftable: false, assigneeRole: 'engineering_lead', validationRules: ['content_present'] },
  { artifactType: 'labeling', label: 'Labeling', required: true, requiredForAmendment: false, sectionCodes: ['8'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
];

const EU_MAA_ARTIFACTS: ArtifactRequirement[] = [
  { artifactType: 'cover_letter', label: 'Cover Letter', required: true, requiredForAmendment: true, sectionCodes: ['1.0'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
  { artifactType: 'application_form', label: 'Application Form', required: true, requiredForAmendment: false, sectionCodes: ['1.2'], format: 'pdf', aiDraftable: false, assigneeRole: 'regulatory_lead', validationRules: ['form_complete'] },
  { artifactType: 'smpc', label: 'Summary of Product Characteristics', required: true, requiredForAmendment: false, sectionCodes: ['1.3.1'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present', 'qrd_compliant'] },
  { artifactType: 'pil', label: 'Package Leaflet', required: true, requiredForAmendment: false, sectionCodes: ['1.3.2'], format: 'pdf', aiDraftable: true, assigneeRole: 'regulatory_lead', validationRules: ['content_present', 'qrd_compliant'] },
  { artifactType: 'clinical_overview', label: 'Clinical Overview', required: true, requiredForAmendment: false, sectionCodes: ['2.5'], format: 'pdf', aiDraftable: true, assigneeRole: 'clinical_lead', validationRules: ['content_present'] },
  { artifactType: 'rmp', label: 'Risk Management Plan', required: true, requiredForAmendment: false, sectionCodes: ['1.5'], format: 'pdf', aiDraftable: false, assigneeRole: 'safety_lead', validationRules: ['content_present'] },
];

// ─── Matrix Registry ──────────────────────────────────────────────────────────

const ARTIFACT_MATRICES: Record<string, ArtifactRequirement[]> = {
  US_IND: US_IND_ARTIFACTS,
  US_IND_AMENDMENT: US_IND_ARTIFACTS.filter(a => a.requiredForAmendment),
  US_NDA: US_NDA_ARTIFACTS,
  US_BLA: US_NDA_ARTIFACTS, // BLA uses same artifact structure as NDA
  US_510K: US_510K_ARTIFACTS,
  US_PMA: US_510K_ARTIFACTS.map(a => ({ ...a, required: true })), // PMA requires everything
  US_DE_NOVO: US_510K_ARTIFACTS,
  EU_MAA: EU_MAA_ARTIFACTS,
  EU_CTA: [
    { artifactType: 'protocol', label: 'Clinical Protocol', required: true, requiredForAmendment: true, sectionCodes: [], format: 'pdf', aiDraftable: false, assigneeRole: 'clinical_lead', validationRules: ['content_present'] },
    { artifactType: 'investigator_brochure', label: 'Investigator Brochure', required: true, requiredForAmendment: false, sectionCodes: [], format: 'pdf', aiDraftable: false, assigneeRole: 'clinical_lead', validationRules: ['content_present'] },
    { artifactType: 'impd', label: 'IMPD', required: true, requiredForAmendment: false, sectionCodes: [], format: 'pdf', aiDraftable: false, assigneeRole: 'regulatory_lead', validationRules: ['content_present'] },
  ],
};

// ─── Query Functions ──────────────────────────────────────────────────────────

/**
 * Get the artifact requirements for a registry entry.
 */
export function getRequiredArtifacts(registryIdOrLegacy: string): ArtifactRequirement[] {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  return ARTIFACT_MATRICES[registryId] ?? [];
}

/**
 * Get only the required artifacts (not optional).
 */
export function getMandatoryArtifacts(registryIdOrLegacy: string): ArtifactRequirement[] {
  return getRequiredArtifacts(registryIdOrLegacy).filter(a => a.required);
}

/**
 * Get AI-draftable artifacts.
 */
export function getAIDraftableArtifacts(registryIdOrLegacy: string): ArtifactRequirement[] {
  return getRequiredArtifacts(registryIdOrLegacy).filter(a => a.aiDraftable);
}

/**
 * Check if a specific artifact type is required for a given registry entry.
 */
export function isArtifactRequired(registryIdOrLegacy: string, artifactType: string): boolean {
  const artifacts = getRequiredArtifacts(registryIdOrLegacy);
  return artifacts.some(a => a.artifactType === artifactType && a.required);
}
