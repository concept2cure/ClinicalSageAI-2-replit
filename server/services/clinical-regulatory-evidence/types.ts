/**
 * Clinical Regulatory Evidence — the shared, source-agnostic analytical contract.
 *
 * One evidence model spanning CSR, protocol/SAP, FDA CRL, review memos, approval
 * packages, trial registries, publications and client documents (§3). The tables
 * are cre_* (migration 20260724_clinical_regulatory_evidence_spine.sql); this
 * module is the typed interface every consumer — the CSR adapter (Phase 2), the
 * studyDesignEvidenceService (Phase 3), CRL ingestion (Phase 4) and the AnA tools
 * (Phase 5) — programs against, so nothing hard-codes a CRL-only worldview.
 *
 * Value sets are TEXT (not Postgres enums) so new source types drop in without a
 * migration; they are enumerated here and validated in the service.
 *
 * @module server/services/clinical-regulatory-evidence/types
 */

// ─── Value sets (documented, service-validated) ───────────────────────────────

/** Original source document / official record types (§3). CSR + FDA_CRL are the
 *  two required in the first work order; the rest are reserved, not hard-coded. */
export const SOURCE_TYPES = [
  'csr', 'protocol', 'sap', 'fda_crl', 'fda_review_memo',
  'fda_approval_package', 'trial_registry', 'publication', 'client_document',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** §13 evidence visibility. GLOBAL_PUBLIC = the shared FDA CRL corpus (org NULL);
 *  TENANT_PRIVATE = a client's own evidence; PROJECT_PRIVATE = scoped further to a
 *  client workspace. */
export const VISIBILITY_CLASSES = ['global_public', 'tenant_private', 'project_private'] as const;
export type VisibilityClass = (typeof VISIBILITY_CLASSES)[number];

export const INGESTION_STATUSES = ['pending', 'ingested', 'failed'] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export const EXTRACTION_STATUSES = ['pending', 'extracted', 'reconciled', 'verified', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** FDA review disciplines / finding domains (§4.5). */
export const FINDING_DOMAINS = [
  'clinical', 'cmc', 'nonclinical', 'biostatistics', 'clinical_pharmacology',
  'labeling', 'safety', 'facility', 'other',
] as const;
export type FindingDomain = (typeof FINDING_DOMAINS)[number];

export const EXPLICIT_OR_INFERRED = ['explicit', 'inferred'] as const;
export type ExplicitOrInferred = (typeof EXPLICIT_OR_INFERRED)[number];

export const VERIFICATION_STATUSES = ['unverified', 'verified', 'disputed'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Normalized regulatory outcome types (§4.6). Never derived from trial completion. */
export const OUTCOME_TYPES = [
  'application_submitted', 'refuse_to_file', 'information_request', 'major_amendment',
  'crl', 'resubmission', 'approval', 'withdrawal', 'discontinuation', 'unresolved',
] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

/** Typed evidence relationships (§4.7). potentially_related MUST be inferred. */
export const RELATIONSHIP_TYPES = [
  'describes_study', 'reports_result', 'supports_application', 'reviewed_in_application',
  'deficiency_applies_to_study', 'deficiency_applies_to_design_feature',
  'deficiency_applies_to_endpoint', 'deficiency_applies_to_analysis',
  'requests_additional_study', 'requests_reanalysis', 'requests_safety_data',
  'requests_cmc_remediation', 'resolved_by_evidence', 'potentially_related',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const ENTITY_TYPES = [
  'source', 'study', 'finding', 'outcome', 'design_feature',
  'result_observation', 'design_lesson', 'atom',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const HUMAN_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type HumanReviewStatus = (typeof HUMAN_REVIEW_STATUSES)[number];

// ─── Entity row shapes (camelCase; adapters map from snake_case) ───────────────

export interface EvidenceSource {
  id: number;
  organizationId: number | null;          // null = GLOBAL_PUBLIC
  visibilityClass: VisibilityClass;
  clientWorkspaceId: number | null;
  sourceType: SourceType;
  agency: string | null;
  sourceRecordIdentifier: string | null;
  title: string | null;
  sponsor: string | null;
  product: string | null;
  indication: string | null;
  therapeuticArea: string | null;
  phase: string | null;
  applicationType: string | null;
  applicationNumber: string | null;
  trialRegistryIdentifier: string | null;
  documentDate: string | null;
  officialUrl: string | null;
  storedArtifactRef: string | null;
  checksum: string | null;
  version: string | null;
  provenance: Record<string, unknown>;
  ingestionStatus: IngestionStatus;
  extractionStatus: ExtractionStatus;
  linkedCsrReportId: number | null;
  linkedPrecedentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalStudy {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  clientWorkspaceId: number | null;
  canonicalStudyKey: string;
  nctId: string | null;
  registryIds: unknown[];
  sponsorStudyId: string | null;
  protocolNumber: string | null;
  indication: string | null;
  phase: string | null;
  product: string | null;
  modality: string | null;
  sponsor: string | null;
  studyStatus: string | null;
  provenanceConfidence: number | null;
  linkedCsrStudyId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryFinding {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  sourceId: number;
  applicationIdentifier: string | null;
  relatedStudyIds: number[];
  findingDomain: FindingDomain | null;
  findingCategory: string | null;
  findingSubcategory: string | null;
  fdaReviewDiscipline: string | null;
  findingText: string | null;
  normalizedSummary: string | null;
  requestedAction: string | null;
  severity: string | null;
  affectedCtdSection: string | null;
  affectedIchE3Section: string | null;
  affectedProtocolElement: string | null;
  affectedSapElement: string | null;
  affectedStudyDesignFeature: string | null;
  sourcePage: number | null;
  sourceExcerpt: string | null;
  explicitOrInferred: ExplicitOrInferred;
  extractionConfidence: number | null;
  verificationStatus: VerificationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryOutcome {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  sourceId: number | null;
  applicationIdentifier: string | null;
  outcomeType: OutcomeType;
  outcomeDate: string | null;
  approvalDate: string | null;
  timeToResolutionDays: number | null;
  evidenceNote: string | null;
  verificationStatus: VerificationStatus;
  linkedSubmissionOutcomeId: string | null;
  linkedPrecedentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRelationship {
  id: number;
  organizationId: number | null;
  fromEntityType: EntityType;
  fromEntityId: string;
  toEntityType: EntityType;
  toEntityId: string;
  relationshipType: RelationshipType;
  isInferred: boolean;
  confidence: number | null;
  provenance: Record<string, unknown>;
  createdAt: string;
}

export interface DesignLesson {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  lessonStatement: string;
  applicablePopulation: string | null;
  applicablePhase: string | null;
  modality: string | null;
  endpointType: string | null;
  supportingSourceIds: number[];
  contradictingSourceIds: number[];
  minimumEvidenceCount: number | null;
  evidenceQualityScore: number | null;
  confidenceInterval: unknown | null;
  derivationMethod: string | null;
  modelVersion: string | null;
  humanReviewStatus: HumanReviewStatus;
  lastRecalculatedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Read-adapter shapes (§4.3/§4.4) — NOT tables; Phase 2 maps these from the
//     existing csr_* corpus so we never duplicate it. ───────────────────────────

/** A normalized study-design feature with mandatory provenance (§4.3). */
export interface StudyDesignFeature {
  studyId: number | null;
  featureKey: string;                     // e.g. 'primary_endpoint', 'randomization_ratio'
  value: string | number | null;
  sourceId: number | null;
  sourceLocation: string | null;
  extractionMethod: string | null;
  extractionConfidence: number | null;
  explicitOrInferred: ExplicitOrInferred;
  verificationStatus: VerificationStatus;
}

/** A normalized quantitative/qualitative result observation (§4.4). Effect is
 *  never collapsed to one generic number without its measure + scale. */
export interface StudyResultObservation {
  studyId: number | null;
  endpoint: string;
  endpointRole: string | null;            // primary | secondary | exploratory | safety
  estimand: string | null;
  analysisPopulation: string | null;      // ITT | mITT | PP | safety
  effectMeasure: string | null;           // mean_difference | odds_ratio | hazard_ratio | ...
  effectValue: number | null;
  standardError: number | null;
  ciLower: number | null;
  ciUpper: number | null;
  pValue: number | null;
  directionOfBenefit: string | null;
  timepoint: string | null;
  sampleSize: number | null;
  missingness: number | null;
  subgroup: string | null;
  multiplicityStatus: string | null;
  sourceLocation: string | null;
}

/** The §14 evidentiary envelope every reported metric must carry. */
export interface MetricProvenance {
  numerator: number | null;
  denominator: number | null;
  missingCount: number | null;
  inclusionCriteria: string | null;
  filters: Record<string, unknown>;
  extractionMethod: string | null;
  verificationStatus: VerificationStatus;
  dateRange: { from: string | null; to: string | null } | null;
}
