/**
 * IVDR Pack Builder — Shared TypeScript Types
 *
 * Contains ManifestV1, SnapshotV1, audit event payloads, and all
 * supporting types for the Evidence Binder + Pack Builder system.
 *
 * These types are shared between server and client.
 *
 * @module shared/ivdr/manifest
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

export type UUID = string;
export type ISODateTime = string;
export type Sha256Hex = string;

export type PackType = 'IVDR_TECHDOC' | 'IVDR_NB_PRECHECK';

export type BinderStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'BLOCKED';

export type ArtifactType = 'MANIFEST_JSON' | 'TECHDOC_DOCX' | 'TECHDOC_PDF' | 'PACK_ZIP';

export type BiomarkerType =
  | 'genomic'
  | 'proteomic'
  | 'transcriptomic'
  | 'metabolomic'
  | 'immunologic'
  | 'other';

export type ThresholdOperator = 'lte' | 'gte' | 'range' | 'none';

export type PackStatus = 'SUCCEEDED' | 'REVOKED';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type OutputFormat = 'PDF' | 'DOCX' | 'ZIP' | 'MANIFEST';

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT REFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

export interface VaultRef {
  vaultFileId: UUID;
  vaultVersionId: UUID;
  title?: string;
}

export interface ExcerptRef {
  vaultFileId: UUID;
  vaultVersionId: UUID;
  startOffset: number;
  endOffset: number;
  excerptHashSha256: Sha256Hex;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT V1 (deterministic, hashable)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SnapshotV1 {
  snapshotVersion: '1.0';
  organizationId: number;
  projectId: string;
  packType: PackType;

  ivdrRecordIds: {
    classificationId?: UUID;
    pepId?: UUID;
    perId?: UUID;
    analyticalValidationIds: UUID[];
    clinicalEvidenceIds: UUID[];
    cdxWorkflowId?: UUID;
  };

  binder: {
    claimIds: UUID[];
    requiredClaimIds: UUID[];
    claimEvidenceIds: UUID[];
  };

  vault: {
    refs: VaultRef[];
    excerpts: ExcerptRef[];
  };

  buildOptions: {
    useLatestApprovedOnly: boolean;
    outputs: OutputFormat[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANIFEST V1 — SOURCE OF TRUTH
// ═══════════════════════════════════════════════════════════════════════════════

export interface ManifestArtifactFile {
  vaultFileId: UUID;
  vaultVersionId: UUID;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hashSha256: Sha256Hex;
}

export interface ManifestArtifact {
  artifactType: ArtifactType;
  file: ManifestArtifactFile;
}

export interface ManifestBuildInfo {
  buildId: UUID;
  buildStartedAt: ISODateTime;
  buildCompletedAt: ISODateTime;
  serverTimestamp: ISODateTime;
  environment: 'development' | 'staging' | 'production';
  app: { name: string; version: string; gitCommit: string };
  generator: { engine: string; engineVersion: string; templateSet: string };
  inputsSnapshot: { snapshotId: UUID; snapshotHashSha256: Sha256Hex; note?: string };
}

export interface AnnexVIIITrace {
  ruleNumber: number;
  ruleTitle: string;
  decisionPath: Array<{ step: number; question: string; answer: string }>;
  justification: string;
  overridden: boolean;
  effectiveDate: ISODateTime;
}

export interface AnalyticalMetric {
  metricKey: string;
  label: string;
  value: number | string;
  unit?: string;
  acceptance: { operator: ThresholdOperator; value?: number; min?: number; max?: number };
  pass: boolean;
  evidence: Array<{
    vaultFileId: UUID;
    vaultVersionId: UUID;
    excerpt?: {
      startOffset: number;
      endOffset: number;
      hashSha256: Sha256Hex;
      textPreview?: string;
    };
  }>;
}

export interface Clinical2x2 {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface WilsonCI {
  low: number;
  high: number;
}

export interface ManifestV1 {
  manifestVersion: '1.0';

  pack: {
    packId: UUID;
    packType: 'IVDR_TECHNICAL_DOCUMENTATION' | 'IVDR_NOTIFIED_BODY_PRECHECK';
    packVersion: number;
    status: 'SUCCEEDED' | 'FAILED' | 'REVOKED';
    createdAt: ISODateTime;
    createdBy: { userId: UUID; displayName: string; role: string };
    organization: { organizationId: number; organizationUuid: UUID; name: string };
    project: { projectId: UUID; projectName: string; submissionPathway: 'IVDR'; market: 'EU' };
  };

  build: ManifestBuildInfo;

  artifacts: ManifestArtifact[];

  ivdr: {
    classification?: {
      recordId: UUID;
      class: 'A' | 'B' | 'C' | 'D';
      annexViii: AnnexVIIITrace;
    };

    performanceEvaluation?: {
      pep?: { recordId: UUID; status: BinderStatus; vaultRefs: VaultRef[] };
      per?: { recordId: UUID; status: BinderStatus; vaultRefs: VaultRef[] };
    };

    analyticalPerformance?: {
      records: Array<{
        validationId: UUID;
        analyte: string;
        specimenType?: string;
        status: BinderStatus;
        metrics: AnalyticalMetric[];
      }>;
    };

    clinicalPerformance?: {
      studies: Array<{
        studyId: UUID;
        title: string;
        status: BinderStatus;
        populationDefinition?: string;
        inclusionCriteria?: string[];
        exclusionCriteria?: string[];
        contingency2x2?: Clinical2x2;
        derived?: {
          sensitivity?: { value: number; ci95: WilsonCI; method: 'Wilson' };
          specificity?: { value: number; ci95: WilsonCI; method: 'Wilson' };
        };
        evidence: VaultRef[];
      }>;
    };

    cdx?: {
      enabled: boolean;
      workflow?: {
        cdxId: UUID;
        status: BinderStatus | 'DRAFT' | 'IN_REVIEW';
        intendedUseStatement?: string;
        biomarkerType?: BiomarkerType;
        linkedClinicalEvidenceIds?: UUID[];
        evidence?: VaultRef[];
        statusTransitions?: Array<{
          from: string;
          to: string;
          at: ISODateTime;
          byUserId: UUID;
        }>;
      };
    };
  };

  evidenceBinder: {
    claims: Array<{
      claimId: UUID;
      claimKey: string;
      title: string;
      status: BinderStatus;
      requiredForPack: boolean;
      approvedAt?: ISODateTime;
      approvedBy?: UUID;
      evidenceLinks: Array<{
        vaultFileId: UUID;
        vaultVersionId: UUID;
        excerptHashSha256?: Sha256Hex;
        excerptOffsets?: { start: number; end: number };
      }>;
    }>;
  };

  audit: {
    auditChain: {
      enabled: boolean;
      packAuditEventId: UUID;
      auditSequenceNumber: number;
      auditRecordHashSha256: Sha256Hex;
      previousHashSha256?: Sha256Hex;
    };
    events: Array<{ eventType: string; eventId: UUID; at: ISODateTime }>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT EVENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AuditEventType =
  | 'BINDER_CLAIM_CREATED'
  | 'BINDER_CLAIM_UPDATED'
  | 'BINDER_EVIDENCE_ATTACHED'
  | 'BINDER_EVIDENCE_REMOVED'
  | 'BINDER_CLAIM_APPROVED'
  | 'BINDER_CLAIM_REVOKED'
  | 'PACK_BUILD_REQUESTED'
  | 'PACK_BUILD_STARTED'
  | 'PACK_BUILD_COMPLETED'
  | 'PACK_BUILD_FAILED'
  | 'PACK_DOWNLOADED'
  | 'PACK_SIGNED';

export interface AuditEventPayloadBase {
  event: AuditEventType;
  organizationId: number;
  projectId: string;
  userId: string;
  timestamp: ISODateTime;
}

export interface PackBuildRequestedPayload extends AuditEventPayloadBase {
  event: 'PACK_BUILD_REQUESTED';
  packType: PackType;
  requestedOutputs: OutputFormat[];
  useLatestApprovedOnly: boolean;
}

export interface PackBuildCompletedPayload extends AuditEventPayloadBase {
  event: 'PACK_BUILD_COMPLETED';
  packId: UUID;
  packVersion: number;
  manifestHashSha256: Sha256Hex;
  snapshotHashSha256: Sha256Hex;
  artifactCount: number;
}

export interface PackBuildFailedPayload extends AuditEventPayloadBase {
  event: 'PACK_BUILD_FAILED';
  jobId: UUID;
  errorCode: string;
  errorLabel: string;
}

export interface BinderClaimApprovedPayload extends AuditEventPayloadBase {
  event: 'BINDER_CLAIM_APPROVED';
  claimId: UUID;
  claimKey: string;
  reason?: string;
  evidenceCount: number;
}

export interface BinderEvidenceAttachedPayload extends AuditEventPayloadBase {
  event: 'BINDER_EVIDENCE_ATTACHED';
  claimId: UUID;
  evidenceId: UUID;
  vaultFileId: UUID;
  vaultVersionId: UUID;
  hasExcerpt: boolean;
}

export interface PackDownloadedPayload extends AuditEventPayloadBase {
  event: 'PACK_DOWNLOADED';
  packId: UUID;
  format: OutputFormat | 'manifest';
}

// ═══════════════════════════════════════════════════════════════════════════════
// API REQUEST / RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Binder APIs ──────────────────────────────────────────────────────────────

export interface BinderClaimRow {
  id: UUID;
  claimKey: string;
  title: string;
  description: string | null;
  status: BinderStatus;
  requiredForPack: boolean;
  packScope: string;
  ownerUserId: string | null;
  approvedAt: ISODateTime | null;
  approvedByUserId: string | null;
  approvalReason: string | null;
  updatedAt: ISODateTime;
  evidence: BinderEvidenceRow[];
}

export interface BinderEvidenceRow {
  id: UUID;
  vaultFileId: string;
  vaultVersionId: string;
  excerptStart: number | null;
  excerptEnd: number | null;
  excerptHashSha256: string | null;
  excerptPreview: string | null;
  notes: string | null;
  removedAt: ISODateTime | null;
}

export interface BinderListResponse {
  projectId: string;
  claims: BinderClaimRow[];
}

export interface CreateClaimRequest {
  projectId: string;
  claimKey: string;
  title: string;
  description?: string;
  requiredForPack?: boolean;
  packScope?: string;
  ownerUserId?: string;
  status?: BinderStatus;
}

export interface AttachEvidenceRequest {
  projectId: string;
  vaultFileId: string;
  vaultVersionId: string;
  excerptStart?: number;
  excerptEnd?: number;
  excerptHashSha256?: string;
  excerptPreview?: string;
  notes?: string;
}

export interface ApproveClaimRequest {
  projectId: string;
  reason?: string;
}

export interface RevokeClaimRequest {
  projectId: string;
  reason: string;
}

export interface RemoveEvidenceRequest {
  projectId: string;
  reason: string;
}

// ── Pack APIs ────────────────────────────────────────────────────────────────

export interface PackReadinessResponse {
  projectId: string;
  packType: PackType;
  ready: boolean;
  reasons: Array<{ code: string; claimKey: string }>;
  requiredClaims: { total: number; approved: number };
  blockedClaims: number;
}

export interface BuildPackRequest {
  projectId: string;
  packType: PackType;
  outputs: OutputFormat[];
  useLatestApprovedOnly: boolean;
  signBuild: boolean;
}

export interface PackListItem {
  packId: UUID;
  packType: PackType;
  packVersion: number;
  status: string;
  createdAt: ISODateTime;
  createdByUserId: string | null;
  manifestHashSha256: string;
  snapshotHashSha256: string;
  downloads: {
    manifest: boolean;
    pdf: boolean;
    docx: boolean;
    zip: boolean;
  };
}

export interface PackDetailResponse {
  packId: UUID;
  packType: PackType;
  packVersion: number;
  status: string;
  createdAt: ISODateTime;
  manifest: {
    vaultFileId: string | null;
    vaultVersionId: string | null;
    hashSha256: string;
  };
  artifacts: Array<{
    type: string;
    vaultFileId: string | null;
    vaultVersionId: string | null;
    hashSha256: string;
  }>;
  snapshot: {
    snapshotHashSha256: string;
    snapshotJson: Record<string, unknown>;
  } | null;
}

export interface JobStatusResponse {
  jobId: UUID;
  projectId: string;
  packType: PackType;
  status: JobStatus;
  requestedAt: ISODateTime;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  outputPackId: UUID | null;
  error: { code: string; label: string } | null;
}
