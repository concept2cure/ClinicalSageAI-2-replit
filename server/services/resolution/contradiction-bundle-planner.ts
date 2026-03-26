/**
 * Contradiction Bundle Planner — Pass 9
 *
 * Maps ContradictionFinding[] → ResolutionBundlePlan with:
 *   - contradiction-type-aware action mapping
 *   - overlay-aware planning (FDA vs EMA → different bundles)
 *   - authority-aware execution gating
 *   - deterministic, auditable, no LLM decisions
 *
 * Supports 8 contradiction types with typed action mapping:
 *   assumption_drift, summary_body_inconsistency, protocol_sap_inconsistency,
 *   decision_action_inconsistency, regulator_overlay_conflict,
 *   body_specific_expectation_conflict, approved_vs_working_inconsistency,
 *   status_conflict
 *
 * Hard rule: Returns a real bundle plan that feeds execution, not prose.
 *
 * @module server/services/resolution/contradiction-bundle-planner
 */

import { randomUUID } from 'crypto';
import type {
  ResolutionBundlePlan,
  ResolutionBundlePlanAction,
  ContradictionBundleActionKind,
} from '../../../shared/types/resolution';
import type {
  ContradictionFinding,
  AuthorityState,
  ConsequenceType,
  Severity,
  OverlayRule,
} from '../contradiction-engine-service';

// ═══════════════════════════════════════════════════════════════════════════════
// PLANNER INPUT
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContradictionBundlePlannerInput {
  organizationId: number;
  projectId: number;
  findings: ContradictionFinding[];
  overlayRules?: OverlayRule[];
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRADICTION TYPE → ACTION MAPPING
//
// Each contradiction type maps to a primary action sequence.
// Overlay rules can modify this mapping.
// ═══════════════════════════════════════════════════════════════════════════════

interface ActionTemplate {
  primary: ContradictionBundleActionKind;
  secondary?: ContradictionBundleActionKind;
  alwaysReview: boolean;
  alwaysMemo: boolean;
}

const CONTRADICTION_ACTION_MAP: Record<string, ActionTemplate> = {
  assumption_drift: {
    primary: 'supersede-assumption',
    secondary: 'create-review-thread',
    alwaysReview: false,
    alwaysMemo: true,
  },
  summary_body_tension: {
    primary: 'apply-harmonization',
    secondary: 'create-review-thread',
    alwaysReview: true,
    alwaysMemo: false,
  },
  summary_body_inconsistency: {
    primary: 'apply-harmonization',
    secondary: 'create-review-thread',
    alwaysReview: true,
    alwaysMemo: false,
  },
  protocol_sap_inconsistency: {
    primary: 'create-review-thread',
    secondary: 'attach-contradiction-memo',
    alwaysReview: true,
    alwaysMemo: true,
  },
  decision_action_inconsistency: {
    primary: 'prepare-correction-draft',
    secondary: 'create-review-thread',
    alwaysReview: true,
    alwaysMemo: true,
  },
  regulator_overlay_conflict: {
    primary: 'escalate',
    secondary: 'attach-contradiction-memo',
    alwaysReview: true,
    alwaysMemo: true,
  },
  regulatory_discrepancy: {
    primary: 'escalate',
    secondary: 'attach-contradiction-memo',
    alwaysReview: true,
    alwaysMemo: true,
  },
  body_specific_expectation_conflict: {
    primary: 'prepare-correction-draft',
    secondary: 'attach-contradiction-memo',
    alwaysReview: true,
    alwaysMemo: true,
  },
  cross_jurisdictional_divergence: {
    primary: 'prepare-correction-draft',
    secondary: 'attach-contradiction-memo',
    alwaysReview: true,
    alwaysMemo: true,
  },
  approved_vs_working_inconsistency: {
    primary: 'mark-needs-reapproval',
    secondary: 'prepare-correction-draft',
    alwaysReview: true,
    alwaysMemo: false,
  },
  status_conflict: {
    primary: 'create-review-thread',
    secondary: 'mark-needs-reapproval',
    alwaysReview: true,
    alwaysMemo: true,
  },
  // Fallback for remaining types
  parameter_mismatch: {
    primary: 'create-review-thread',
    alwaysReview: true,
    alwaysMemo: true,
  },
  factual_contradiction: {
    primary: 'prepare-correction-draft',
    secondary: 'create-review-thread',
    alwaysReview: true,
    alwaysMemo: true,
  },
  dosage_conflict: {
    primary: 'escalate',
    secondary: 'attach-contradiction-memo',
    alwaysReview: true,
    alwaysMemo: true,
  },
  temporal_inconsistency: {
    primary: 'create-review-thread',
    alwaysReview: false,
    alwaysMemo: true,
  },
  outcome_divergence: {
    primary: 'create-review-thread',
    secondary: 'prepare-correction-draft',
    alwaysReview: true,
    alwaysMemo: true,
  },
  procedural_conflict: {
    primary: 'create-review-thread',
    alwaysReview: true,
    alwaysMemo: true,
  },
  superseded_information: {
    primary: 'supersede-assumption',
    alwaysReview: false,
    alwaysMemo: false,
  },
  recommendation_action_inconsistency: {
    primary: 'escalate',
    secondary: 'create-review-thread',
    alwaysReview: true,
    alwaysMemo: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORITY → GATING RULES
// ═══════════════════════════════════════════════════════════════════════════════

function authorityToGating(authority: AuthorityState): {
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  requiresEscalation: boolean;
} {
  switch (authority) {
    case 'advisory_only':
      return { requiresConfirmation: false, requiresApproval: false, requiresEscalation: false };
    case 'requires_review':
      return { requiresConfirmation: true, requiresApproval: false, requiresEscalation: false };
    case 'requires_approval':
      return { requiresConfirmation: true, requiresApproval: true, requiresEscalation: false };
    case 'blocks_promotion':
      return { requiresConfirmation: true, requiresApproval: true, requiresEscalation: false };
    case 'requires_escalation':
      return { requiresConfirmation: true, requiresApproval: true, requiresEscalation: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAY-AWARE ACTION ESCALATION
//
// Overlays can escalate actions beyond the default mapping:
// - stricter body → prepare draft escalates to requires review thread + approval
// - body-specific expectation → evidence-gather + memo instead of direct change
// ═══════════════════════════════════════════════════════════════════════════════

function applyOverlayToAction(
  action: ContradictionBundleActionKind,
  finding: ContradictionFinding,
  overlayRules: OverlayRule[],
): { action: ContradictionBundleActionKind; escalated: boolean; reason?: string } {
  const matchingRule = overlayRules.find(r =>
    r.contradictionType === finding.contradictionType &&
    r.active &&
    (!finding.regulatorBody || r.regulatorBody === finding.regulatorBody)
  );

  if (!matchingRule) return { action, escalated: false };

  // Authority escalation changes the action
  if (matchingRule.authorityOverride === 'requires_escalation') {
    return {
      action: 'escalate',
      escalated: true,
      reason: `Overlay ${matchingRule.ruleCode}: ${matchingRule.regulatorBody} requires escalation for ${finding.contradictionType}`,
    };
  }

  if (matchingRule.authorityOverride === 'blocks_promotion' || matchingRule.authorityOverride === 'requires_approval') {
    // Escalate from auto-preparable to requires-approval
    if (action === 'prepare-correction-draft' || action === 'apply-harmonization') {
      return {
        action: 'create-review-thread',
        escalated: true,
        reason: `Overlay ${matchingRule.ruleCode}: ${matchingRule.regulatorBody} escalates ${action} to review thread + approval`,
      };
    }
  }

  // Consequence override changes the action
  if (matchingRule.consequenceOverride) {
    const mapped = consequenceToActionKind(matchingRule.consequenceOverride);
    if (mapped !== action) {
      return {
        action: mapped,
        escalated: true,
        reason: `Overlay ${matchingRule.ruleCode}: ${matchingRule.regulatorBody} overrides consequence to ${matchingRule.consequenceOverride}`,
      };
    }
  }

  return { action, escalated: false };
}

function consequenceToActionKind(consequence: ConsequenceType): ContradictionBundleActionKind {
  switch (consequence) {
    case 'assumption_supersession': return 'supersede-assumption';
    case 'harmonization_rewrite': return 'apply-harmonization';
    case 'review_thread': return 'create-review-thread';
    case 'contradiction_memo': return 'attach-contradiction-memo';
    case 'escalation': return 'escalate';
    case 'dossier_review_attachment': return 'attach-contradiction-memo';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a ResolutionBundlePlan from contradiction findings.
 *
 * Deterministic. No LLM. Returns a real plan that feeds execution.
 */
export function buildContradictionBundlePlan(
  input: ContradictionBundlePlannerInput
): ResolutionBundlePlan {
  const { organizationId, projectId, findings, overlayRules, regulatorBody, submissionType, workflowStage } = input;

  if (findings.length === 0) {
    throw new Error('Cannot build bundle plan: no contradiction findings provided');
  }

  const planId = `cbp_${randomUUID().slice(0, 12)}`;
  const actions: ResolutionBundlePlanAction[] = [];
  const expectedConsequences: Array<{ kind: string; summary: string }> = [];
  const overlayContext = buildOverlayContext(findings, overlayRules ?? []);

  // Track highest authority across all findings
  let highestAuthority: AuthorityState = 'advisory_only';
  const authorityOrder: AuthorityState[] = ['advisory_only', 'requires_review', 'requires_approval', 'blocks_promotion', 'requires_escalation'];

  for (const finding of findings) {
    const template = CONTRADICTION_ACTION_MAP[finding.contradictionType]
      ?? { primary: 'create-review-thread', alwaysReview: true, alwaysMemo: true };

    // Track highest authority
    const findingIdx = authorityOrder.indexOf(finding.authorityState);
    const currentIdx = authorityOrder.indexOf(highestAuthority);
    if (findingIdx > currentIdx) highestAuthority = finding.authorityState;

    const gating = authorityToGating(finding.authorityState);

    // Primary action — overlay-aware
    const primaryResult = applyOverlayToAction(template.primary, finding, overlayRules ?? []);
    actions.push({
      id: `act_${randomUUID().slice(0, 8)}`,
      kind: primaryResult.action,
      targetObjectType: finding.objectAType,
      targetObjectId: finding.objectAId,
      targetObjectTitle: finding.objectALabel ?? undefined,
      description: buildActionDescription(primaryResult.action, finding, primaryResult.reason),
      requiresConfirmation: gating.requiresConfirmation || primaryResult.escalated,
      requiresApproval: gating.requiresApproval || primaryResult.escalated,
      requiresEscalation: gating.requiresEscalation,
      status: 'planned',
    });

    // Secondary action on object B if applicable and different from object A
    if (template.secondary && finding.objectBId !== 'none') {
      const secondaryResult = applyOverlayToAction(template.secondary, finding, overlayRules ?? []);
      actions.push({
        id: `act_${randomUUID().slice(0, 8)}`,
        kind: secondaryResult.action,
        targetObjectType: finding.objectBType,
        targetObjectId: finding.objectBId,
        targetObjectTitle: finding.objectBLabel ?? undefined,
        description: buildActionDescription(secondaryResult.action, finding, secondaryResult.reason),
        requiresConfirmation: gating.requiresConfirmation || secondaryResult.escalated,
        requiresApproval: gating.requiresApproval || secondaryResult.escalated,
        requiresEscalation: gating.requiresEscalation,
        status: 'planned',
      });
    }

    // Always-review: add review thread if not already primary/secondary
    if (template.alwaysReview && template.primary !== 'create-review-thread' && template.secondary !== 'create-review-thread') {
      actions.push({
        id: `act_${randomUUID().slice(0, 8)}`,
        kind: 'create-review-thread',
        targetObjectType: 'contradiction',
        targetObjectId: finding.id,
        targetObjectTitle: finding.title,
        description: `Create review thread for contradiction: ${finding.title}`,
        requiresConfirmation: false,
        requiresApproval: false,
        requiresEscalation: false,
        status: 'planned',
      });
    }

    // Always-memo: attach contradiction memo if not already action
    if (template.alwaysMemo && template.primary !== 'attach-contradiction-memo' && template.secondary !== 'attach-contradiction-memo') {
      actions.push({
        id: `act_${randomUUID().slice(0, 8)}`,
        kind: 'attach-contradiction-memo',
        targetObjectType: 'contradiction',
        targetObjectId: finding.id,
        targetObjectTitle: finding.title,
        description: `Attach contradiction memo documenting: ${finding.title}`,
        requiresConfirmation: false,
        requiresApproval: false,
        requiresEscalation: false,
        status: 'planned',
      });
    }

    // Expected consequences
    expectedConsequences.push({
      kind: finding.contradictionType,
      summary: `${finding.severity} ${finding.contradictionType}: ${finding.title}${finding.regulatorBody ? ` (${finding.regulatorBody})` : ''}`,
    });
  }

  // Deduplicate actions on the same target with the same kind
  const deduped = deduplicateActions(actions);

  // Aggregate authority
  const topGating = authorityToGating(highestAuthority);
  const anyBlocked = highestAuthority === 'requires_escalation'
    || deduped.some(a => a.requiresEscalation);

  const plan: ResolutionBundlePlan = {
    id: planId,
    projectId,
    organizationId,
    contradictionIds: findings.map(f => f.id),
    regulatorBody,
    submissionType,
    workflowStage,
    summary: buildPlanSummary(findings, deduped),
    rationale: buildPlanRationale(findings, overlayRules ?? []),
    actions: deduped,
    authority: {
      requiresHumanConfirmation: topGating.requiresConfirmation || deduped.some(a => a.requiresConfirmation),
      requiresReviewerApproval: topGating.requiresApproval || deduped.some(a => a.requiresApproval),
      requiresEscalation: topGating.requiresEscalation || anyBlocked,
      blockedReason: anyBlocked
        ? `Escalation required: highest authority state is ${highestAuthority}`
        : undefined,
    },
    expectedConsequences,
    overlayContext: overlayContext.appliedRuleIds.length > 0 ? overlayContext : undefined,
    createdAt: new Date().toISOString(),
  };

  return plan;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildActionDescription(
  kind: ContradictionBundleActionKind,
  finding: ContradictionFinding,
  overlayReason?: string,
): string {
  const prefix = overlayReason ? `[Overlay-escalated] ` : '';
  switch (kind) {
    case 'prepare-correction-draft':
      return `${prefix}Prepare correction draft for ${finding.objectALabel ?? finding.objectAType} to resolve ${finding.contradictionType}`;
    case 'apply-harmonization':
      return `${prefix}Harmonize ${finding.objectALabel ?? finding.objectAType} with ${finding.objectBLabel ?? finding.objectBType} to resolve ${finding.contradictionType}`;
    case 'supersede-assumption':
      return `${prefix}Supersede ${finding.objectALabel ?? finding.objectAType} — ${finding.contradictionType} detected`;
    case 'create-review-thread':
      return `${prefix}Create review thread for ${finding.title}`;
    case 'attach-contradiction-memo':
      return `${prefix}Attach contradiction memo: ${finding.title}`;
    case 'mark-needs-reapproval':
      return `${prefix}Mark ${finding.objectALabel ?? finding.objectAType} for reapproval — ${finding.contradictionType} affects approved content`;
    case 'escalate':
      return `${prefix}Escalate ${finding.title} — requires senior review (${finding.authorityState})`;
    case 'other':
      return `${prefix}Review required: ${finding.title}`;
  }
}

function buildPlanSummary(findings: ContradictionFinding[], actions: ResolutionBundlePlanAction[]): string {
  const types = [...new Set(findings.map(f => f.contradictionType))];
  const safe = actions.filter(a => !a.requiresConfirmation && !a.requiresApproval && !a.requiresEscalation).length;
  const needsApproval = actions.filter(a => a.requiresApproval).length;
  const needsEscalation = actions.filter(a => a.requiresEscalation).length;

  return `Resolution plan for ${findings.length} contradiction(s) [${types.join(', ')}]: ` +
    `${actions.length} actions (${safe} auto-preparable, ${needsApproval} need approval, ${needsEscalation} need escalation)`;
}

function buildPlanRationale(findings: ContradictionFinding[], overlayRules: OverlayRule[]): string {
  const parts: string[] = [];
  const bodies = [...new Set(findings.map(f => f.regulatorBody).filter(Boolean))];
  const appliedOverlays = overlayRules.filter(r => r.active);

  if (bodies.length > 0) {
    parts.push(`Regulator context: ${bodies.join(', ')}`);
  }
  if (appliedOverlays.length > 0) {
    parts.push(`${appliedOverlays.length} overlay rule(s) applied affecting severity/authority/consequence`);
  }

  for (const finding of findings) {
    parts.push(
      `${finding.contradictionType} (${finding.severity}): ${finding.description.slice(0, 200)}`
    );
  }

  return parts.join('. ');
}

function buildOverlayContext(
  findings: ContradictionFinding[],
  overlayRules: OverlayRule[],
): NonNullable<ResolutionBundlePlan['overlayContext']> {
  const appliedRuleIds: string[] = [];
  const severityOverrides: Record<string, string> = {};
  const authorityOverrides: Record<string, string> = {};
  const consequenceOverrides: Record<string, string> = {};
  const bodies = [...new Set(findings.map(f => f.regulatorBody).filter(Boolean) as string[])];

  for (const finding of findings) {
    if (finding.overlayRuleId) {
      appliedRuleIds.push(finding.overlayRuleId);
    }
    if (finding.regulatorSeverityOverride) {
      severityOverrides[finding.id] = finding.regulatorSeverityOverride;
    }
    // Track authority overrides from overlay-modified findings
    const rule = overlayRules.find(r => r.id === finding.overlayRuleId);
    if (rule?.authorityOverride) {
      authorityOverrides[finding.id] = rule.authorityOverride;
    }
    if (rule?.consequenceOverride) {
      consequenceOverrides[finding.id] = rule.consequenceOverride;
    }
  }

  return {
    regulatorBody: bodies.join(', ') || 'none',
    appliedRuleIds: [...new Set(appliedRuleIds)],
    severityOverrides,
    authorityOverrides,
    consequenceOverrides,
  };
}

function deduplicateActions(actions: ResolutionBundlePlanAction[]): ResolutionBundlePlanAction[] {
  const seen = new Set<string>();
  return actions.filter(a => {
    const key = `${a.kind}:${a.targetObjectType}:${a.targetObjectId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Classify which actions in a plan are safe to auto-prepare vs require human intervention.
 */
export function classifyPlanActions(plan: ResolutionBundlePlan): {
  autoPreparable: ResolutionBundlePlanAction[];
  requiresConfirmation: ResolutionBundlePlanAction[];
  requiresApproval: ResolutionBundlePlanAction[];
  requiresEscalation: ResolutionBundlePlanAction[];
  cannotExecute: ResolutionBundlePlanAction[];
} {
  const autoPreparable: ResolutionBundlePlanAction[] = [];
  const requiresConfirmation: ResolutionBundlePlanAction[] = [];
  const requiresApproval: ResolutionBundlePlanAction[] = [];
  const requiresEscalation: ResolutionBundlePlanAction[] = [];
  const cannotExecute: ResolutionBundlePlanAction[] = [];

  for (const action of plan.actions) {
    if (action.requiresEscalation) {
      requiresEscalation.push(action);
    } else if (action.requiresApproval) {
      requiresApproval.push(action);
    } else if (action.requiresConfirmation) {
      requiresConfirmation.push(action);
    } else if (action.kind === 'escalate') {
      cannotExecute.push(action);
    } else {
      autoPreparable.push(action);
    }
  }

  return { autoPreparable, requiresConfirmation, requiresApproval, requiresEscalation, cannotExecute };
}
