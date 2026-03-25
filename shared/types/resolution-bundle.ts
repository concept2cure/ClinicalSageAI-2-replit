/**
 * Resolution Bundle Types — Contradiction-aware multi-object correction planning,
 * execution, and receipt generation for the Concept2Cure operating system.
 *
 * A ResolutionBundlePlan is the canonical object for resolving one or more
 * contradictions through governed, auditable, multi-object correction.
 *
 * Integrates with:
 * - shared/types/decision-architecture.ts (authority boundaries, receipts)
 * - server/services/contradiction-engine-service.ts (findings, overlays)
 * - server/services/decision-lifecycle-service.ts (decision records)
 * - server/services/reactive-dependency-service.ts (staleness propagation)
 * - shared/types/authoring-context.ts (preflight refresh)
 *
 * @module shared/types/resolution-bundle
 */

import type { AuthorityRequirement, DecisionReceiptAffectedObject } from './decision-architecture.js';

// ─── Bundle Action Kinds ────────────────────────────────────────────────────

export type BundleActionKind =
  | 'prepare-correction-draft'
  | 'apply-harmonization'
  | 'supersede-assumption'
  | 'create-review-thread'
  | 'attach-contradiction-memo'
  | 'mark-needs-reapproval'
  | 'escalate'
  | 'gather-evidence'
  | 'other';

export type BundleActionStatus = 'planned' | 'confirmed' | 'skipped' | 'executed' | 'blocked' | 'failed';

// ─── Bundle Action ──────────────────────────────────────────────────────────

export interface BundleAction {
  id: string;
  kind: BundleActionKind;
  targetObjectType: string;
  targetObjectId: string;
  targetObjectLabel?: string;
  targetVersionId?: string;
  sectionCode?: string;

  requiresConfirmation: boolean;
  requiresApproval: boolean;
  requiresEscalation: boolean;

  status: BundleActionStatus;
  blockedReason?: string;
  executionResult?: string;
  resultObjectId?: string;
}

// ─── Expected Consequence ───────────────────────────────────────────────────

export interface BundleExpectedConsequence {
  kind: string;
  summary: string;
  targetObjectType?: string;
  targetObjectId?: string;
}

// ─── Resolution Bundle Plan ─────────────────────────────────────────────────

export interface ResolutionBundlePlan {
  id: string;
  projectId: string;
  organizationId: number;

  /** Contradiction finding IDs this bundle resolves */
  contradictionIds: string[];

  /** Regulatory context */
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;
  moduleCode?: string;
  sectionCode?: string;

  /** Plan content */
  summary: string;
  rationale: string;

  /** Ordered list of governed actions */
  actions: BundleAction[];

  /** Aggregate authority requirement for the whole bundle */
  authority: AuthorityRequirement;

  /** What the system expects to change if the bundle is fully executed */
  expectedConsequences: BundleExpectedConsequence[];

  /** Overlay context that influenced this plan */
  overlayInfluence?: {
    ruleIds: string[];
    regulatorBody: string;
    modifications: string[];
  };

  /** Lifecycle */
  status: 'planned' | 'confirmed' | 'partially-executed' | 'executed' | 'rejected' | 'failed';
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  confirmedById?: string;
  confirmedAt?: string;
  rejectedReason?: string;
}

// ─── Bundle Execution Receipt ───────────────────────────────────────────────

export interface BundleExecutionReceipt {
  id: string;
  bundleId: string;
  projectId: string;
  decisionId: string;

  /** What the plan contained */
  plan: {
    summary: string;
    contradictionIds: string[];
    actionCount: number;
    rationale: string;
  };

  /** Confirmation state */
  confirmation: {
    accepted: boolean;
    confirmedById?: string;
    confirmedAt?: string;
    rejectionReason?: string;
  };

  /** Action-level execution results */
  actionResults: Array<{
    actionId: string;
    kind: BundleActionKind;
    status: BundleActionStatus;
    targetObjectType: string;
    targetObjectId: string;
    resultObjectId?: string;
    error?: string;
  }>;

  /** Aggregate execution state */
  execution: {
    totalActions: number;
    executed: number;
    blocked: number;
    failed: number;
    skipped: number;
    executedAt?: string;
    executedById?: string;
  };

  /** What changed */
  affectedObjects: DecisionReceiptAffectedObject[];

  /** What still requires approval */
  pendingApprovals: Array<{
    requiredRole: string;
    reason: string;
    actionId: string;
    status: 'pending' | 'approved' | 'rejected';
  }>;

  /** What remained provisional */
  provisionalItems: Array<{
    objectType: string;
    objectId: string;
    reason: string;
    actionId: string;
  }>;

  /** Preflight refresh state */
  preflightRefresh: {
    triggered: boolean;
    refreshedAt?: string;
    newStatus?: string;
    blockersCleared?: number;
    blockersRemaining?: number;
  };

  createdAt: string;
}

// ─── Bundle Plan Request ────────────────────────────────────────────────────

export interface BundlePlanRequest {
  organizationId: number;
  projectId: string;
  contradictionIds: string[];
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;
  moduleCode?: string;
  sectionCode?: string;
  requestedById?: string;
}

// ─── Bundle Execution Request ───────────────────────────────────────────────

export interface BundleExecutionRequest {
  bundleId: string;
  organizationId: number;
  confirmedById: string;
  actorRole?: string;
  /** Specific action IDs to execute (if omitted, executes all confirmable) */
  actionIds?: string[];
  /** Whether to skip actions that require higher authority */
  skipBlockedActions?: boolean;
}

// ─── AnA Bundle Action Types (Wave 3) ───────────────────────────────────────

export type AuthoringActionWave3Id =
  | 'plan_resolution_bundle'
  | 'execute_resolution_bundle'
  | 'explain_resolution_receipt'
  | 'explain_blocked_actions'
  | 'safest_correction_path';

export const WAVE3_REQUIRED_CONTEXT: Record<AuthoringActionWave3Id, string[]> = {
  plan_resolution_bundle: ['projectId'],
  execute_resolution_bundle: ['projectId'],
  explain_resolution_receipt: ['projectId'],
  explain_blocked_actions: ['projectId'],
  safest_correction_path: ['projectId'],
};
