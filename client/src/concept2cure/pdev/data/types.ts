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
