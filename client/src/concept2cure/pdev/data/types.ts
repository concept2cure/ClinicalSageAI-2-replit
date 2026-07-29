/**
 * Server response shapes for /api/pdev/* endpoints used by Phase 7.0 + 7.1.
 *
 * Mirror the orchestrator + readiness service types declared at
 *   server/services/pdev/pdev-orchestrator.ts
 *   server/services/pdev/pdev-readiness-service.ts
 *   server/services/pdev/pdev-activity-registry.ts
 *
 * Only the fields the read-only surfaces consume are typed — fields
 * relevant to mutations (notes, evidence linkage state, etc.) are
 * intentionally excluded until the sub-phases that need them ship.
 */

import type { PdevWorkstream, PdevStage, PdevActivityState } from './enums';

// ─── Registry (GET /api/pdev/registry) ──────────────────────────────────────

export type PdevEctdModule = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'none';

export interface PdevRequiredDocument {
  code: string;
  title: string;
  ectdModule: PdevEctdModule;
  ectdSection?: string;
  mandatoryForInd: boolean;
}

export interface PdevActivityDef {
  key: string;
  workstream: PdevWorkstream;
  stage: PdevStage;
  title: string;
  description: string;
  requiredDocuments: PdevRequiredDocument[];
  dependsOn: string[];
  blocksIndAssembly: boolean;
}

export interface PdevRegistryPayload {
  activities: readonly PdevActivityDef[];
  workstreams: readonly PdevWorkstream[];
  stages: readonly PdevStage[];
  states: readonly PdevActivityState[];
}

// ─── Program view (GET /api/pdev/programs/:id) ──────────────────────────────

/** Per-program runtime state for a single registry activity. Server type;
 *  the orchestrator returns null when the activity has never been touched
 *  for the program. */
export interface PdevProgramActivityRow {
  id: string;
  programId: string;
  activityKey: string;
  workstream: PdevWorkstream;
  stage: PdevStage;
  state: PdevActivityState;
  ownerUserId: number | null;
  reviewerUserId: number | null;
  notes: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  evidenceLinkCount: number;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Combined registry + per-program state. */
export interface PdevActivityView {
  registry: PdevActivityDef;
  state: PdevProgramActivityRow | null;
}

export interface PdevWorkstreamRollup {
  workstream: PdevWorkstream;
  totalActivities: number;
  completedActivities: number;
  inFlightActivities: number;
  blockedActivities: number;
  notStartedActivities: number;
  blockingActivities: number;
  blockingResolved: number;
  /** 0–100 weighted readiness score. */
  readinessScore: number;
}

export interface PdevReadinessSnapshotRow {
  id: string;
  programId: string;
  workstream: PdevWorkstream | 'overall';
  readinessScore: number;
  computedAt: string;
  triggeredBy: string | null;
}

export interface PdevProgramView {
  program: {
    id: string;
    name: string;
    code: string;
    productName: string;
    programType: string;
    primaryAgency: string;
    status: string;
    phase: string | null;
    targetSubmissionDate: string | null;
    progressPercent: number | null;
    metadata: Record<string, unknown> | null;
    updatedAt: string;
  };
  workstreams: PdevWorkstreamRollup[];
  activities: PdevActivityView[];
  latestSnapshots: PdevReadinessSnapshotRow[];
  qSubmissionCount: number;
  fdaCorrespondenceCount: number;
}

// ─── Workstream drill (GET /api/pdev/programs/:id/workstreams/:ws) ──────────

export interface PdevWorkstreamPayload {
  workstream: PdevWorkstream;
  rollup: PdevWorkstreamRollup | undefined;
  activities: PdevActivityView[];
}

// ─── Readiness (GET /api/pdev/programs/:id/readiness) ───────────────────────

export interface PdevReadinessReport {
  programId: string;
  overall: {
    readinessScore: number;
    completedActivities: number;
    totalActivities: number;
    blockingActivities: number;
    blockingResolved: number;
  };
  byWorkstream: PdevWorkstreamRollup[];
  computedAt: string;
}

// ─── Evidence (GET /api/pdev/programs/:id/activities/:key/evidence) ─────────

export type PdevEvidenceLinkType =
  | 'supports'
  | 'contradicts'
  | 'references'
  | 'supersedes';
export type PdevEvidenceStrength = 'strong' | 'moderate' | 'weak';

export interface PdevEvidenceLink {
  id: string;
  evidenceObjectId: string;
  title: string;
  type: string;
  category: string;
  source: string;
  linkType: PdevEvidenceLinkType;
  strength: PdevEvidenceStrength;
  rationale: string | null;
  attachedAt: string;
  attachedBy: number | null;
}

export interface PdevEvidencePayload {
  links: PdevEvidenceLink[];
}

// ─── Workflow (GET /api/pdev/programs/:id/activities/:key/workflow) ─────────

export type PdevWorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PdevApprovalCheckpointStatus =
  | 'proposed'
  | 'awaiting_review'
  | 'approved'
  | 'executed'
  | 'failed'
  | 'skipped';

export interface PdevApprovalRecord {
  id: string;
  approverUserId: number | null;
  approverDisplay: string;
  role: string;
  decidedAt: string;
  decision: 'approve' | 'reject';
  comment: string | null;
}

export interface PdevWorkflowCheckpoint {
  id: string;
  stepIndex: number;
  name: string;
  status: PdevApprovalCheckpointStatus;
  requiredRoles: string[];
  approvals: PdevApprovalRecord[];
}

export interface PdevWorkflowRun {
  runId: string;
  workflowType: string;
  activityKey: string;
  programId: string;
  targetState: PdevActivityState;
  status: PdevWorkflowRunStatus;
  checkpoints: PdevWorkflowCheckpoint[];
  createdAt: string;
}

export interface PdevWorkflowPayload {
  /** Null when no run is in flight for the activity. */
  run: PdevWorkflowRun | null;
}

// ─── Provenance (GET /api/pdev/programs/:id/activities/:key/provenance) ─────

export interface PdevProvenanceArtifact {
  id: string;
  title: string;
  type: string;
  status: string;
  version: string;
  ctdSection: string;
  contentHash: string;
  citationCount: number;
  createdAt: string;
}

export interface PdevProvenanceLineage {
  id: string;
  sourceObjectType: string;
  sourceTitle: string;
  linkageType: string;
  transformationType: string;
  confidenceScore: number;
  aiModelUsed: string | null;
  createdAt: string;
}

export interface PdevAuditEvent {
  id: string;
  when: string;
  actor: string;
  action: string;
  detail: string;
}

export interface PdevProvenancePayload {
  activity: {
    key: string;
    title: string;
    workstream: PdevWorkstream;
    stage: PdevStage;
    currentState: PdevActivityState;
    ownerUserId: number | null;
    reviewerUserId: number | null;
  };
  artifacts: PdevProvenanceArtifact[];
  evidence: PdevEvidenceLink[];
  lineage: PdevProvenanceLineage[];
  audit: PdevAuditEvent[];
}

// ─── IND assembly (GET /api/pdev/programs/:id/ind-assembly) ─────────────────

export interface PdevIndAssemblyModule {
  id: PdevEctdModule;
  label: string;
  readiness: number;
  mandatory: { present: number; total: number };
  total: { present: number; total: number };
  blockers: string[];
}

export interface PdevIndAssemblyPayload {
  overallReadiness: number;
  threshold: number;
  modules: PdevIndAssemblyModule[];
}

// ─── FDA interactions (GET /api/pdev/programs/:id/fda-interactions) ─────────

export type PdevFdaInteractionKind =
  | 'q_submission'
  | 'q_sub_commitment'
  | 'q_sub_meeting'
  | 'q_sub_question'
  | 'q_sub_timeline'
  | 'fda_communication';

export interface PdevFdaInteraction {
  id: string;
  when: string;
  kind: PdevFdaInteractionKind;
  title: string;
  summary: string;
  status: 'pending-rollup' | 'responded' | 'closed' | 'open';
  blocker: boolean;
  rolled: boolean;
  proposedKey: string | null;
  confidence: number | null;
}

export interface PdevFdaStreamPayload {
  interactions: PdevFdaInteraction[];
}

export interface PdevFdaProposalsPayload {
  proposals: PdevFdaInteraction[];
}

// ─── Contradictions (GET /api/pdev/programs/:id/contradictions) ─────────────

export type PdevContradictionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type PdevContradictionAuthorityState =
  | 'advisory_only'
  | 'requires_review'
  | 'requires_approval'
  | 'blocks_promotion'
  | 'requires_escalation';
export type PdevContradictionReviewState =
  | 'unresolved'
  | 'under_review'
  | 'reviewed'
  | 'approved_resolution'
  | 'superseded';

export interface PdevContradiction {
  id: string;
  severity: PdevContradictionSeverity;
  type: string;
  objectA: string;
  objectB: string;
  authorityState: PdevContradictionAuthorityState;
  reviewState: PdevContradictionReviewState;
  when: string;
  desc: string;
  regulatoryBody: string;
}

export interface PdevContradictionsPayload {
  contradictions: PdevContradiction[];
}

// ─── AI draft response ──────────────────────────────────────────────────────

export interface PdevAiDraftResult {
  /** Quality grade A / B / C from the drafting service. */
  grade: 'A' | 'B' | 'C' | null;
  model: string;
  citations: number;
  artifactId: string | null;
  preview: {
    title: string;
    sections: Array<{ num: string; label: string; preview: string }>;
  };
}
