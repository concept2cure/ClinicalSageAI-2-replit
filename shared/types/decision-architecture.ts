/**
 * Decision Architecture — Formal decision records, authority boundaries,
 * and decision receipts for the Concept2Cure operating system.
 *
 * This is the canonical typed layer that turns preflight checks, promotion
 * gates, correction drafts, and harmonization recommendations into
 * auditable, explicit decision objects.
 *
 * Integrates with:
 * - server/services/decision-record-service.ts (persistence)
 * - server/routes/authoring-actions.ts (preflight, promotion, correction)
 * - shared/types/authoring-context.ts (preflight results, action types)
 * - shared/schema/operating-system.ts (Drizzle tables)
 *
 * @module shared/types/decision-architecture
 */

// ─── Decision Status Lifecycle ───────────────────────────────────────────────

export type DecisionStatus =
  | 'recommended'      // AnA/system produced a recommendation
  | 'confirmed'        // Human confirmed the recommendation
  | 'rejected'         // Human rejected the recommendation
  | 'executed'         // Confirmed action was executed (state change happened)
  | 'approved'         // Reviewer/approver signed off on the executed result
  | 'provisional'      // Executed but pending full approval
  | 'escalated'        // Authority boundary requires higher-level review
  | 'superseded';      // Replaced by a newer decision

// ─── Decision Kind ───────────────────────────────────────────────────────────

export type DecisionKind =
  | 'section-preflight-judgment'
  | 'module-preflight-judgment'
  | 'dossier-preflight-judgment'
  | 'promotion-decision'
  | 'correction-decision'
  | 'harmonization-decision'
  | 'evidence-decision'
  | 'contradiction-resolution-decision'
  | 'reapproval-decision'
  | 'other';

// ─── Authority Requirements ──────────────────────────────────────────────────

export type AuthorityLevel =
  | 'autonomous-read'          // AnA can do freely — no state mutation
  | 'requires-confirmation'    // Needs human "yes" before executing
  | 'requires-reviewer-approval'  // Needs a reviewer-role sign-off after execution
  | 'requires-escalation'     // Must go to a higher authority (QA lead, RA head, etc.)
  | 'forbidden';              // AnA must never execute this directly

export interface AuthorityRequirement {
  level: AuthorityLevel;
  requiresHumanConfirmation: boolean;
  requiresReviewerApproval: boolean;
  requiresEscalation: boolean;
  allowedActorRoles?: string[];
  blockedReason?: string;
}

// ─── Source Signal (what fed this decision) ──────────────────────────────────

export interface DecisionSourceSignal {
  kind: 'preflight-check' | 'contradiction' | 'readiness-blocker' | 'body-gap'
    | 'cross-section-inconsistency' | 'approved-baseline-conflict' | 'assumption-drift'
    | 'harmonization-issue' | 'user-request' | 'system-rule';
  id?: string;
  summary: string;
  severity?: 'critical' | 'major' | 'minor' | 'info';
}

// ─── Formal Decision Record ─────────────────────────────────────────────────

export interface FormalDecisionRecord {
  id: string;
  projectId: string;
  kind: DecisionKind;
  status: DecisionStatus;

  // Regulatory context
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;

  // Object anchoring
  artifactId?: string;
  artifactVersionId?: string;
  moduleCode?: string;
  sectionCode?: string;
  dossierId?: string;

  // Decision content
  summary: string;
  rationale: string;
  sourceSignals: DecisionSourceSignal[];

  // Recommended actions from the decision
  recommendedActionIds?: string[];

  // Authority boundary
  authority: AuthorityRequirement;

  // Actor provenance
  createdByType: 'human' | 'ana' | 'system';
  createdById?: string;
  confirmedById?: string;
  approvedById?: string;
  rejectedById?: string;
  escalatedToRole?: string;

  // Linked objects
  linkedReceiptId?: string;
  linkedContradictionIds?: string[];
  linkedAssumptionIds?: string[];
  linkedDecisionIds?: string[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  executedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  escalatedAt?: string;
}

// ─── Decision Receipt ────────────────────────────────────────────────────────
// What happened after a decision was confirmed/executed.

export interface DecisionReceiptAffectedObject {
  objectType: 'artifact' | 'artifact-version' | 'section' | 'module' | 'dossier'
    | 'review-thread' | 'assumption' | 'contradiction-link';
  objectId: string;
  objectLabel?: string;
  previousState?: string;
  newState?: string;
  changeDescription?: string;
}

export interface DecisionReceipt {
  id: string;
  decisionId: string;
  projectId: string;

  // What AnA recommended
  recommendation: {
    summary: string;
    actionIds: string[];
    rationale: string;
  };

  // What the user accepted/rejected
  confirmation: {
    accepted: boolean;
    confirmedById?: string;
    confirmedAt?: string;
    rejectionReason?: string;
  };

  // What was executed
  execution: {
    executed: boolean;
    executedAt?: string;
    executedById?: string;
    executionMethod?: string;
    error?: string;
  };

  // What changed
  affectedObjects: DecisionReceiptAffectedObject[];

  // What still requires approval
  pendingApprovals: Array<{
    requiredRole: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
  }>;

  // What remained provisional
  provisionalItems: Array<{
    objectType: string;
    objectId: string;
    reason: string;
  }>;

  // Timestamps
  createdAt: string;
}

// ─── Authority Boundary Map ──────────────────────────────────────────────────
// Static classification of what AnA can/cannot do for each action type.

export type GovernedActionType =
  | 'run-section-preflight'
  | 'run-module-preflight'
  | 'run-dossier-preflight'
  | 'explain-preflight-results'
  | 'prepare-correction-draft'
  | 'prepare-harmonization-suggestion'
  | 'gather-evidence'
  | 'promote-to-review'
  | 'approve-artifact'
  | 'lock-artifact'
  | 'judge-module-ready'
  | 'judge-dossier-ready'
  | 'create-contradiction-consequence'
  | 'execute-multi-object-correction';

export interface AuthorityBoundaryEntry {
  action: GovernedActionType;
  authority: AuthorityRequirement;
  description: string;
}

/**
 * The canonical authority boundary map.
 * This is the source of truth for what AnA can and cannot do.
 */
export const AUTHORITY_BOUNDARY_MAP: AuthorityBoundaryEntry[] = [
  // ── Read-only / analysis actions — autonomous ──
  {
    action: 'run-section-preflight',
    authority: {
      level: 'autonomous-read',
      requiresHumanConfirmation: false,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Run section preflight checks (read-only analysis)',
  },
  {
    action: 'run-module-preflight',
    authority: {
      level: 'autonomous-read',
      requiresHumanConfirmation: false,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Run module preflight checks (read-only analysis)',
  },
  {
    action: 'run-dossier-preflight',
    authority: {
      level: 'autonomous-read',
      requiresHumanConfirmation: false,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Run dossier preflight checks (read-only analysis)',
  },
  {
    action: 'explain-preflight-results',
    authority: {
      level: 'autonomous-read',
      requiresHumanConfirmation: false,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Explain preflight results (read-only explanation)',
  },

  // ── Draft preparation — requires confirmation ──
  {
    action: 'prepare-correction-draft',
    authority: {
      level: 'requires-confirmation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Prepare a correction draft (human must confirm before applying)',
  },
  {
    action: 'prepare-harmonization-suggestion',
    authority: {
      level: 'requires-confirmation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Suggest harmonization changes (human must confirm before applying)',
  },
  {
    action: 'gather-evidence',
    authority: {
      level: 'requires-confirmation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Gather evidence for a section (human must confirm scope)',
  },
  {
    action: 'create-contradiction-consequence',
    authority: {
      level: 'requires-confirmation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Create workflow consequence from contradiction (human must confirm)',
  },

  // ── Status transitions — requires confirmation + reviewer approval ──
  {
    action: 'promote-to-review',
    authority: {
      level: 'requires-confirmation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: false,
      requiresEscalation: false,
    },
    description: 'Promote artifact from draft to review (human must confirm)',
  },
  {
    action: 'approve-artifact',
    authority: {
      level: 'requires-reviewer-approval',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: true,
      requiresEscalation: false,
      allowedActorRoles: ['reviewer', 'approver', 'ra_lead', 'qa_lead'],
    },
    description: 'Approve artifact (requires reviewer-role sign-off)',
  },
  {
    action: 'lock-artifact',
    authority: {
      level: 'requires-reviewer-approval',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: true,
      requiresEscalation: false,
      allowedActorRoles: ['approver', 'ra_lead', 'qa_lead', 'submission_lead'],
    },
    description: 'Lock artifact for submission (requires approver-role sign-off)',
  },

  // ── Higher-level judgments — requires escalation ──
  {
    action: 'judge-module-ready',
    authority: {
      level: 'requires-escalation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: true,
      requiresEscalation: true,
      allowedActorRoles: ['ra_lead', 'submission_lead', 'program_lead'],
    },
    description: 'Judge module ready for submission (requires RA/submission lead)',
  },
  {
    action: 'judge-dossier-ready',
    authority: {
      level: 'requires-escalation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: true,
      requiresEscalation: true,
      allowedActorRoles: ['submission_lead', 'program_lead', 'cro_head'],
    },
    description: 'Judge dossier ready for submission (requires submission/program lead)',
  },

  // ── Forbidden for AnA ──
  {
    action: 'execute-multi-object-correction',
    authority: {
      level: 'forbidden',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: true,
      requiresEscalation: true,
      blockedReason: 'Multi-object corrections must be executed by a human with full audit trail',
    },
    description: 'Execute corrections across multiple artifacts (forbidden for AnA)',
  },
];

// ─── Helper: look up authority for an action ────────────────────────────────

export function getAuthorityForAction(action: GovernedActionType): AuthorityRequirement {
  const entry = AUTHORITY_BOUNDARY_MAP.find(e => e.action === action);
  if (!entry) {
    // Unknown action → require escalation by default (fail-safe)
    return {
      level: 'requires-escalation',
      requiresHumanConfirmation: true,
      requiresReviewerApproval: true,
      requiresEscalation: true,
      blockedReason: `Unknown governed action: ${action}`,
    };
  }
  return entry.authority;
}

/**
 * Check if an actor role satisfies the authority requirement.
 */
export function isActorAuthorized(
  authority: AuthorityRequirement,
  actorRole?: string
): { authorized: boolean; reason?: string } {
  if (authority.level === 'forbidden') {
    return { authorized: false, reason: authority.blockedReason || 'Action is forbidden for automated execution' };
  }
  if (authority.level === 'autonomous-read') {
    return { authorized: true };
  }
  if (authority.allowedActorRoles && authority.allowedActorRoles.length > 0) {
    if (!actorRole || !authority.allowedActorRoles.includes(actorRole)) {
      return {
        authorized: false,
        reason: `Requires one of: ${authority.allowedActorRoles.join(', ')}. Current role: ${actorRole || 'unknown'}`,
      };
    }
  }
  return { authorized: true };
}

// ─── Decision Status Transitions ─────────────────────────────────────────────

const VALID_TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  recommended: ['confirmed', 'rejected', 'escalated', 'superseded'],
  confirmed: ['executed', 'rejected', 'escalated', 'superseded'],
  rejected: ['superseded'],
  executed: ['approved', 'provisional', 'escalated', 'superseded'],
  approved: ['superseded'],
  provisional: ['approved', 'rejected', 'escalated', 'superseded'],
  escalated: ['confirmed', 'rejected', 'approved', 'superseded'],
  superseded: [],
};

export function isValidTransition(from: DecisionStatus, to: DecisionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Factory helpers ─────────────────────────────────────────────────────────

let _decisionCounter = 0;

export function createDecisionId(): string {
  _decisionCounter++;
  return `dec_${Date.now()}_${_decisionCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createReceiptId(): string {
  return `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a FormalDecisionRecord from a preflight result + action context.
 */
export function buildPreflightDecision(opts: {
  projectId: string;
  kind: DecisionKind;
  sectionCode?: string;
  moduleCode?: string;
  dossierId?: string;
  artifactId?: string;
  artifactVersionId?: string;
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;
  overall: string;
  summary: string;
  sourceSignals: DecisionSourceSignal[];
  recommendedActionIds?: string[];
  createdByType?: 'human' | 'ana' | 'system';
  createdById?: string;
}): FormalDecisionRecord {
  const action = opts.kind === 'section-preflight-judgment'
    ? 'run-section-preflight'
    : opts.kind === 'module-preflight-judgment'
      ? 'run-module-preflight'
      : opts.kind === 'dossier-preflight-judgment'
        ? 'run-dossier-preflight'
        : 'explain-preflight-results';

  const authority = getAuthorityForAction(action as GovernedActionType);
  const now = new Date().toISOString();

  // Map preflight overall to decision status
  let status: DecisionStatus;
  switch (opts.overall) {
    case 'ready': status = 'recommended'; break;
    case 'blocked': status = 'recommended'; break;
    case 'provisional': status = 'provisional'; break;
    case 'needs-review': status = 'recommended'; break;
    case 'needs-reapproval': status = 'escalated'; break;
    default: status = 'recommended';
  }

  return {
    id: createDecisionId(),
    projectId: opts.projectId,
    kind: opts.kind,
    status,
    regulatorBody: opts.regulatorBody,
    submissionType: opts.submissionType,
    workflowStage: opts.workflowStage,
    artifactId: opts.artifactId,
    artifactVersionId: opts.artifactVersionId,
    moduleCode: opts.moduleCode,
    sectionCode: opts.sectionCode,
    dossierId: opts.dossierId,
    summary: opts.summary,
    rationale: `Preflight analysis: ${opts.overall}. ${opts.sourceSignals.length} signal(s) evaluated.`,
    sourceSignals: opts.sourceSignals,
    recommendedActionIds: opts.recommendedActionIds,
    authority,
    createdByType: opts.createdByType || 'system',
    createdById: opts.createdById,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build a FormalDecisionRecord for a governed action (promotion, correction, etc.)
 */
export function buildGovernedActionDecision(opts: {
  projectId: string;
  kind: DecisionKind;
  governedAction: GovernedActionType;
  artifactId?: string;
  artifactVersionId?: string;
  sectionCode?: string;
  moduleCode?: string;
  dossierId?: string;
  regulatorBody?: string;
  submissionType?: string;
  workflowStage?: string;
  summary: string;
  rationale: string;
  sourceSignals: DecisionSourceSignal[];
  createdByType: 'human' | 'ana' | 'system';
  createdById?: string;
  linkedContradictionIds?: string[];
  linkedAssumptionIds?: string[];
}): FormalDecisionRecord {
  const authority = getAuthorityForAction(opts.governedAction);
  const now = new Date().toISOString();

  return {
    id: createDecisionId(),
    projectId: opts.projectId,
    kind: opts.kind,
    status: 'recommended',
    regulatorBody: opts.regulatorBody,
    submissionType: opts.submissionType,
    workflowStage: opts.workflowStage,
    artifactId: opts.artifactId,
    artifactVersionId: opts.artifactVersionId,
    moduleCode: opts.moduleCode,
    sectionCode: opts.sectionCode,
    dossierId: opts.dossierId,
    summary: opts.summary,
    rationale: opts.rationale,
    sourceSignals: opts.sourceSignals,
    authority,
    createdByType: opts.createdByType,
    createdById: opts.createdById,
    linkedContradictionIds: opts.linkedContradictionIds,
    linkedAssumptionIds: opts.linkedAssumptionIds,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build a DecisionReceipt from the execution of a confirmed decision.
 */
export function buildDecisionReceipt(opts: {
  decisionId: string;
  projectId: string;
  recommendation: { summary: string; actionIds: string[]; rationale: string };
  confirmation: {
    accepted: boolean;
    confirmedById?: string;
    rejectionReason?: string;
  };
  execution?: {
    executed: boolean;
    executedById?: string;
    executionMethod?: string;
    error?: string;
  };
  affectedObjects?: DecisionReceiptAffectedObject[];
  pendingApprovals?: Array<{ requiredRole: string; reason: string; status: 'pending' | 'approved' | 'rejected' }>;
  provisionalItems?: Array<{ objectType: string; objectId: string; reason: string }>;
}): DecisionReceipt {
  const now = new Date().toISOString();
  return {
    id: createReceiptId(),
    decisionId: opts.decisionId,
    projectId: opts.projectId,
    recommendation: opts.recommendation,
    confirmation: {
      accepted: opts.confirmation.accepted,
      confirmedById: opts.confirmation.confirmedById,
      confirmedAt: now,
      rejectionReason: opts.confirmation.rejectionReason,
    },
    execution: opts.execution
      ? {
          executed: opts.execution.executed,
          executedAt: opts.execution.executed ? now : undefined,
          executedById: opts.execution.executedById,
          executionMethod: opts.execution.executionMethod,
          error: opts.execution.error,
        }
      : { executed: false },
    affectedObjects: opts.affectedObjects || [],
    pendingApprovals: opts.pendingApprovals || [],
    provisionalItems: opts.provisionalItems || [],
    createdAt: now,
  };
}
