/**
 * Contradiction → Resolution Bridge — Pass 9
 *
 * Bridges contradiction findings into the resolution orchestration layer
 * with overlay-aware authority mapping and decision receipt linkage.
 *
 * Responsibilities:
 * 1. Map contradiction findings to resolution triggers (with overlay awareness)
 * 2. Enforce authority boundary checks before resolution execution
 * 3. Create linked DecisionReceipts after bundle execution
 * 4. Refresh preflight after execution completes
 * 5. Expose Wave 3 AnA action handlers
 *
 * Source-of-truth hierarchy:
 *   1. Contradiction finding (structured record)
 *   2. Overlay rules (regulator/body-specific)
 *   3. Authority boundary map (Pass 7)
 *   4. Resolution orchestrator (Sprint 4/5)
 *   5. Decision lifecycle (Pass 7)
 *   — LLM is NEVER used for resolution decisions
 *
 * @module server/services/resolution/contradiction-resolution-bridge
 */

import { createScopedLogger } from '../../utils/logger';
import { orchestrateResolution } from './ana-resolution-orchestrator';
import { getResolutionPlan, getProjectResolutionPlans } from './resolution-planner';
import { getResolutionBundle, getProjectBundles } from './bundle-builder';
import { explainResolutionPlan, summarizeResolutionBundle } from './ana-resolution-support';
import type {
  OrchestratorTrigger,
  OrchestratorResult,
  ResolutionConfidence,
  AffectedObject,
  BundleExecutionReceipt,
} from '../../../shared/types/resolution';
import type {
  ContradictionFinding,
  AuthorityState,
  ConsequenceType,
  Severity,
  OverlayRule,
} from '../contradiction-engine-service';
import {
  getAuthorityForAction,
  isActorAuthorized,
  buildGovernedActionDecision,
  buildDecisionReceipt,
  type GovernedActionType,
  type FormalDecisionRecord,
  type DecisionReceipt,
} from '../../../shared/types/decision-architecture';

const log = createScopedLogger('contradiction-resolution-bridge');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContradictionResolutionRequest {
  organizationId: number;
  userId: number;
  projectId: number;
  findingId: string;
  finding: ContradictionFinding;
  overlayRules?: OverlayRule[];
  actorRole?: string;
}

export interface ContradictionResolutionResult {
  /** Authority check result */
  authorityCheck: {
    action: GovernedActionType;
    authorized: boolean;
    reason?: string;
    effectiveAuthorityState: AuthorityState;
    overlayApplied: boolean;
    overlayRuleCode?: string;
  };

  /** Resolution orchestration result (null if authority blocked) */
  orchestration: OrchestratorResult | null;

  /** Decision record created for this resolution */
  decision: FormalDecisionRecord;

  /** Decision receipt (present only if execution occurred) */
  receipt: DecisionReceipt | null;

  /** Whether preflight refresh was triggered */
  preflightRefreshTriggered: boolean;
}

export interface Wave3ActionResult {
  success: boolean;
  actionId: string;
  message: string;
  data?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRADICTION → RESOLUTION AUTHORITY MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map a contradiction finding's authority state to the appropriate governed action.
 * Overlay rules may escalate/modify the effective authority state.
 */
function mapContradictionToGovernedAction(
  finding: ContradictionFinding,
  overlayRules?: OverlayRule[]
): { action: GovernedActionType; effectiveAuthority: AuthorityState; overlayApplied: boolean; overlayRuleCode?: string } {
  let effectiveAuthority = finding.authorityState;
  let overlayApplied = false;
  let overlayRuleCode: string | undefined;

  // Apply overlay rules — overlays can escalate but NEVER downgrade authority
  if (overlayRules && overlayRules.length > 0) {
    for (const rule of overlayRules) {
      if (rule.authorityOverride) {
        const overrideLevel = authorityWeight(rule.authorityOverride as AuthorityState);
        const currentLevel = authorityWeight(effectiveAuthority);
        if (overrideLevel > currentLevel) {
          effectiveAuthority = rule.authorityOverride as AuthorityState;
          overlayApplied = true;
          overlayRuleCode = rule.ruleCode;
        }
      }
    }
  }

  // Map authority state → governed action type
  let action: GovernedActionType;
  switch (effectiveAuthority) {
    case 'advisory_only':
      // Advisory contradictions can be explained without confirmation
      action = 'explain-preflight-results';
      break;
    case 'requires_review':
      // Contradictions requiring review → prepare correction draft
      action = 'prepare-correction-draft';
      break;
    case 'requires_approval':
      // Contradictions requiring approval → prepare harmonization
      action = 'prepare-harmonization-suggestion';
      break;
    case 'blocks_promotion':
    case 'requires_escalation':
      // Blocking contradictions → create consequence (requires confirmation)
      action = 'create-contradiction-consequence';
      break;
    default:
      action = 'create-contradiction-consequence';
  }

  return { action, effectiveAuthority, overlayApplied, overlayRuleCode };
}

/** Weight authority states for comparison (higher = more restrictive) */
function authorityWeight(state: AuthorityState): number {
  switch (state) {
    case 'advisory_only': return 0;
    case 'requires_review': return 1;
    case 'requires_approval': return 2;
    case 'blocks_promotion': return 3;
    case 'requires_escalation': return 4;
    default: return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRADICTION → RESOLUTION CONFIDENCE MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map contradiction finding confidence to resolution confidence.
 * Uses structured data only — no LLM inference.
 */
function mapConfidence(finding: ContradictionFinding): ResolutionConfidence {
  if (finding.confidenceScore >= 0.9) return 'strong';
  if (finding.confidenceScore >= 0.7) return 'moderate';
  if (finding.confidenceScore >= 0.5) return 'provisional';
  return 'uncertain';
}

/**
 * Map contradiction finding to affected objects for the resolution plan.
 */
function mapAffectedObjects(finding: ContradictionFinding): AffectedObject[] {
  const objects: AffectedObject[] = [];

  // Object A — the first side of the contradiction
  objects.push({
    objectType: finding.objectAType,
    objectId: finding.objectAId,
    objectTitle: finding.objectALabel ?? undefined,
    impactState: 'direct',
    impactRationale: `Direct participant in ${finding.contradictionType} contradiction`,
  });

  // Object B — the second side
  objects.push({
    objectType: finding.objectBType,
    objectId: finding.objectBId,
    objectTitle: finding.objectBLabel ?? undefined,
    impactState: 'direct',
    impactRationale: `Direct participant in ${finding.contradictionType} contradiction`,
  });

  return objects;
}

/**
 * Map contradiction type + consequence type to resolution trigger description.
 */
function buildTriggerDescription(finding: ContradictionFinding): string {
  const parts = [
    `${finding.contradictionType} detected`,
    `between ${finding.objectAType}:${finding.objectAId}`,
    `and ${finding.objectBType}:${finding.objectBId}`,
  ];
  if (finding.severity === 'critical' || finding.severity === 'high') {
    parts.push(`(${finding.severity} severity)`);
  }
  if (finding.regulatorBody) {
    parts.push(`[${finding.regulatorBody}]`);
  }
  return parts.join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN BRIDGE: CONTRADICTION → RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Bridge a contradiction finding into the resolution orchestration layer.
 *
 * Flow:
 * 1. Map contradiction to governed action (with overlay awareness)
 * 2. Check authority boundary
 * 3. Build resolution trigger
 * 4. Call orchestrateResolution() (detect → decide → plan → execute → prove)
 * 5. Create linked DecisionRecord + DecisionReceipt
 * 6. Trigger preflight refresh if execution occurred
 */
export async function resolveContradiction(
  request: ContradictionResolutionRequest
): Promise<ContradictionResolutionResult> {
  const { organizationId, userId, projectId, findingId, finding, overlayRules, actorRole } = request;

  log.info('Bridging contradiction to resolution', {
    findingId,
    type: finding.contradictionType,
    severity: finding.severity,
    authorityState: finding.authorityState,
  });

  // ── STEP 1: Map to governed action with overlay awareness ──
  const { action, effectiveAuthority, overlayApplied, overlayRuleCode } =
    mapContradictionToGovernedAction(finding, overlayRules);

  // ── STEP 2: Authority boundary check ──
  const authority = getAuthorityForAction(action);
  const authCheck = isActorAuthorized(authority, actorRole);

  const authorityCheck = {
    action,
    authorized: authCheck.authorized,
    reason: authCheck.reason,
    effectiveAuthorityState: effectiveAuthority,
    overlayApplied,
    overlayRuleCode,
  };

  // ── STEP 3: Create decision record (always — even if blocked) ──
  const decision = buildGovernedActionDecision({
    projectId: String(projectId),
    kind: 'contradiction-resolution-decision',
    governedAction: action,
    summary: `Resolution for ${finding.contradictionType}: ${finding.title}`,
    rationale: authCheck.authorized
      ? `Authority check passed (${action}). Proceeding with resolution orchestration.`
      : `Authority check failed: ${authCheck.reason}. Resolution blocked.`,
    sourceSignals: [{
      kind: 'contradiction',
      sourceId: findingId,
      sourceLabel: finding.title,
      severity: finding.severity,
      detail: finding.description,
    }],
    createdByType: 'ana',
    createdById: String(userId),
    linkedContradictionIds: [findingId],
  });

  // If authority check fails → return blocked result with decision
  if (!authCheck.authorized) {
    log.warn('Authority check failed for contradiction resolution', {
      findingId, action, reason: authCheck.reason,
    });

    return {
      authorityCheck,
      orchestration: null,
      decision,
      receipt: null,
      preflightRefreshTriggered: false,
    };
  }

  // ── STEP 4: Build resolution trigger ──
  const trigger: OrchestratorTrigger = {
    projectId,
    triggerType: 'contradiction',
    triggerId: findingId,
    triggerDescription: buildTriggerDescription(finding),
    affectedObjects: mapAffectedObjects(finding),
    forceConfidence: mapConfidence(finding),
  };

  // ── STEP 5: Orchestrate resolution ──
  let orchestration: OrchestratorResult;
  try {
    orchestration = await orchestrateResolution(organizationId, userId, trigger);
  } catch (error: unknown) {
    log.error('Resolution orchestration failed', {
      findingId, error: error instanceof Error ? error.message : String(error),
    });

    // Return with failed orchestration — decision still recorded
    return {
      authorityCheck,
      orchestration: null,
      decision: { ...decision, status: 'rejected' as const },
      receipt: null,
      preflightRefreshTriggered: false,
    };
  }

  // ── STEP 6: Create decision receipt if execution occurred ──
  let receipt: DecisionReceipt | null = null;
  let preflightRefreshTriggered = false;

  if (orchestration.decision === 'execute' && orchestration.receipt) {
    receipt = buildDecisionReceipt({
      decisionId: decision.id,
      projectId: String(projectId),
      recommendation: {
        summary: decision.summary,
        actionIds: [action],
        rationale: orchestration.decisionRationale,
      },
      confirmation: {
        accepted: true,
        confirmedById: String(userId),
      },
      execution: {
        executed: true,
        executedById: String(userId),
        executionMethod: `resolution-bundle:${orchestration.receipt.bundleId}`,
      },
      affectedObjects: orchestration.receipt.executedSteps.map(step => ({
        objectType: step.targetType,
        objectId: step.targetId,
        changeType: step.stepType as 'created' | 'updated' | 'deleted' | 'status_changed',
        priorState: step.priorState,
        newState: step.newState,
      })),
      pendingApprovals: orchestration.receipt.requiresReview.map(ref => ({
        requiredRole: 'reviewer',
        reason: `Review required for ${ref} after contradiction resolution`,
        status: 'pending' as const,
      })),
      provisionalItems: orchestration.receipt.requiresReapproval.map(ref => ({
        objectType: ref.split(':')[0] || 'unknown',
        objectId: ref.split(':')[1] || ref,
        reason: 'Reapproval required after contradiction resolution',
      })),
    });

    // ── STEP 7: Trigger preflight refresh ──
    preflightRefreshTriggered = await triggerPreflightRefresh(
      organizationId, projectId, orchestration.receipt
    );
  }

  log.info('Contradiction resolution complete', {
    findingId,
    decision: orchestration.decision,
    executedSteps: orchestration.receipt?.summary?.executed ?? 0,
    preparedSteps: orchestration.receipt?.summary?.prepared ?? 0,
    blockedSteps: orchestration.receipt?.summary?.blocked ?? 0,
    preflightRefreshTriggered,
  });

  return {
    authorityCheck,
    orchestration,
    decision,
    receipt,
    preflightRefreshTriggered,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREFLIGHT REFRESH AFTER EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trigger a preflight refresh after resolution execution.
 * Non-blocking — logs but does not fail the resolution.
 */
async function triggerPreflightRefresh(
  organizationId: number,
  projectId: number,
  receipt: BundleExecutionReceipt
): Promise<boolean> {
  try {
    // Only refresh if there were actual executed steps
    if (receipt.summary.executed === 0) return false;

    // Import lazily to avoid circular dependencies
    const { reactiveDependencyService } = await import('../reactive-dependency-service');

    // Propagate change for each executed step
    for (const step of receipt.executedSteps) {
      try {
        await reactiveDependencyService.propagateChange({
          organizationId,
          projectId,
          triggerType: 'artifact_updated',
          triggerObjectType: step.targetType,
          triggerObjectId: step.targetId,
          triggerObjectLabel: step.targetTitle ?? `${step.targetType}:${step.targetId}`,
          reason: `Post-resolution update (bundle: ${receipt.bundleId})`,
        });
      } catch (innerErr: unknown) {
        log.warn('Failed to propagate change for executed step', {
          targetId: step.targetId,
          error: innerErr instanceof Error ? innerErr.message : String(innerErr),
        });
      }
    }

    log.info('Preflight refresh triggered', {
      projectId,
      bundleId: receipt.bundleId,
      executedSteps: receipt.summary.executed,
    });

    return true;
  } catch (error: unknown) {
    log.error('Failed to trigger preflight refresh', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WAVE 3 AnA AUTHORING ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Wave 3 action: Plan resolution for a specific contradiction.
 * Returns the resolution plan without executing.
 */
export async function planContradictionResolution(
  organizationId: number,
  userId: number,
  projectId: number,
  findingId: string,
  finding: ContradictionFinding,
  overlayRules?: OverlayRule[]
): Promise<Wave3ActionResult> {
  const { action, effectiveAuthority, overlayApplied } =
    mapContradictionToGovernedAction(finding, overlayRules);

  const authority = getAuthorityForAction(action);
  const confidence = mapConfidence(finding);
  const affectedObjects = mapAffectedObjects(finding);

  return {
    success: true,
    actionId: 'plan_contradiction_resolution',
    message: `Resolution plan created for ${finding.contradictionType} contradiction`,
    data: {
      findingId,
      contradictionType: finding.contradictionType,
      severity: finding.severity,
      governedAction: action,
      authorityLevel: authority.level,
      effectiveAuthorityState: effectiveAuthority,
      overlayApplied,
      confidence,
      affectedObjectCount: affectedObjects.length,
      affectedObjects,
      requiresHumanConfirmation: authority.requiresHumanConfirmation,
      requiresReviewerApproval: authority.requiresReviewerApproval,
      requiresEscalation: authority.requiresEscalation,
      recommendedPath: mapContradictionTypeToPath(finding.contradictionType),
    },
  };
}

/**
 * Wave 3 action: Execute a planned resolution (full orchestration).
 */
export async function executeContradictionResolution(
  organizationId: number,
  userId: number,
  projectId: number,
  findingId: string,
  finding: ContradictionFinding,
  overlayRules?: OverlayRule[],
  actorRole?: string
): Promise<Wave3ActionResult> {
  const result = await resolveContradiction({
    organizationId,
    userId,
    projectId,
    findingId,
    finding,
    overlayRules,
    actorRole,
  });

  if (!result.authorityCheck.authorized) {
    return {
      success: false,
      actionId: 'execute_contradiction_resolution',
      message: `Authority check failed: ${result.authorityCheck.reason}`,
      data: {
        authorityCheck: result.authorityCheck,
        decision: result.decision,
      },
    };
  }

  if (!result.orchestration) {
    return {
      success: false,
      actionId: 'execute_contradiction_resolution',
      message: 'Resolution orchestration failed',
      data: { decision: result.decision },
    };
  }

  return {
    success: result.orchestration.decision === 'execute',
    actionId: 'execute_contradiction_resolution',
    message: result.orchestration.decisionRationale,
    data: {
      orchestratorDecision: result.orchestration.decision,
      plan: result.orchestration.plan,
      bundle: result.orchestration.bundle,
      receipt: result.receipt
        ? {
            bundleId: result.receipt.decisionId,
            executedSteps: result.orchestration.receipt?.summary?.executed ?? 0,
            preparedSteps: result.orchestration.receipt?.summary?.prepared ?? 0,
            blockedSteps: result.orchestration.receipt?.summary?.blocked ?? 0,
          }
        : null,
      preflightRefreshTriggered: result.preflightRefreshTriggered,
    },
  };
}

/**
 * Wave 3 action: Explain a resolution plan for a contradiction.
 */
export async function explainContradictionResolution(
  organizationId: number,
  projectId: number,
  findingId: string,
  finding: ContradictionFinding,
  overlayRules?: OverlayRule[]
): Promise<Wave3ActionResult> {
  const { action, effectiveAuthority, overlayApplied, overlayRuleCode } =
    mapContradictionToGovernedAction(finding, overlayRules);

  const confidence = mapConfidence(finding);
  const affectedObjects = mapAffectedObjects(finding);

  // Build structured explanation (no LLM)
  const explanation: string[] = [];

  explanation.push(`**Contradiction**: ${finding.title}`);
  explanation.push(`**Type**: ${finding.contradictionType} | **Severity**: ${finding.severity}`);
  explanation.push(`**Between**: ${finding.objectAType}:${finding.objectALabel ?? finding.objectAId} ↔ ${finding.objectBType}:${finding.objectBLabel ?? finding.objectBId}`);

  if (finding.regulatorBody) {
    explanation.push(`**Regulator**: ${finding.regulatorBody}`);
  }

  explanation.push('');
  explanation.push(`**Authority State**: ${effectiveAuthority}`);
  explanation.push(`**Governed Action**: ${action}`);
  explanation.push(`**Resolution Confidence**: ${confidence}`);

  if (overlayApplied) {
    explanation.push(`**Overlay Applied**: ${overlayRuleCode} (escalated authority)`);
  }

  explanation.push('');
  explanation.push(`**Affected Objects**: ${affectedObjects.length}`);
  for (const obj of affectedObjects) {
    explanation.push(`  - ${obj.objectType}:${obj.objectId} (${obj.impactState})`);
  }

  explanation.push('');
  const path = mapContradictionTypeToPath(finding.contradictionType);
  explanation.push(`**Recommended Resolution Path**: ${path}`);

  return {
    success: true,
    actionId: 'explain_contradiction_resolution',
    message: explanation.join('\n'),
    data: {
      findingId,
      contradictionType: finding.contradictionType,
      severity: finding.severity,
      governedAction: action,
      effectiveAuthority,
      confidence,
      overlayApplied,
      overlayRuleCode,
      recommendedPath: path,
      affectedObjects,
    },
  };
}

/**
 * Wave 3 action: Get resolution status for a project.
 */
export async function getProjectResolutionStatus(
  organizationId: number,
  projectId: number
): Promise<Wave3ActionResult> {
  try {
    const plans = await getProjectResolutionPlans(organizationId, projectId);
    const bundles = await getProjectBundles(organizationId, projectId);

    const unresolvedPlans = plans.filter(p => p.state === 'unresolved' || p.state === 'proposed_resolution');
    const inProgressPlans = plans.filter(p => p.state === 'in_resolution');
    const resolvedPlans = plans.filter(p => p.state === 'resolved_pending_review' || p.state === 'resolved_approved');

    const activeBundles = bundles.filter(b => b.state === 'in_progress' || b.state === 'proposed');
    const pendingReviewBundles = bundles.filter(b => b.state === 'pending_review');

    return {
      success: true,
      actionId: 'project_resolution_status',
      message: `Project has ${unresolvedPlans.length} unresolved, ${inProgressPlans.length} in-progress, ${resolvedPlans.length} resolved plans`,
      data: {
        plans: {
          total: plans.length,
          unresolved: unresolvedPlans.length,
          inProgress: inProgressPlans.length,
          resolved: resolvedPlans.length,
        },
        bundles: {
          total: bundles.length,
          active: activeBundles.length,
          pendingReview: pendingReviewBundles.length,
        },
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      actionId: 'project_resolution_status',
      message: `Failed to get resolution status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map contradiction type to recommended resolution path.
 * Pure rule-based — no LLM.
 */
function mapContradictionTypeToPath(
  contradictionType: string
): string {
  switch (contradictionType) {
    case 'assumption_drift':
    case 'superseded_information':
      return 'supersede';
    case 'summary_body_tension':
    case 'parameter_mismatch':
    case 'factual_contradiction':
    case 'dosage_conflict':
      return 'rewrite';
    case 'cross_jurisdictional_divergence':
    case 'protocol_sap_inconsistency':
    case 'outcome_divergence':
      return 'harmonize';
    case 'decision_action_inconsistency':
    case 'recommendation_action_inconsistency':
      return 'review_only';
    case 'regulatory_discrepancy':
    case 'temporal_inconsistency':
    case 'status_conflict':
    case 'procedural_conflict':
      return 'escalate';
    default:
      return 'review_only';
  }
}
