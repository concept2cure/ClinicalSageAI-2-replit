/**
 * Decision Lifecycle Service — Wires formal decision records and receipts
 * into the existing preflight, promotion, correction, and harmonization flows.
 *
 * This service does NOT replace existing services. It sits alongside them,
 * capturing the decision trail that previously lived only in ephemeral
 * API responses and chat messages.
 *
 * Integration points:
 * - section-preflight → creates section-preflight-judgment decision
 * - module-preflight → creates module-preflight-judgment decision
 * - dossier-preflight → creates dossier-preflight-judgment decision
 * - promote-to-review → creates promotion-decision + receipt
 * - correction-draft → creates correction-decision + receipt
 * - harmonize-sections → creates harmonization-decision + receipt
 * - contradiction findings → creates contradiction-resolution-decision
 *
 * @module server/services/decision-lifecycle-service
 */

import { createScopedLogger } from '../utils/logger';
import type {
  FormalDecisionRecord,
  DecisionReceipt,
  DecisionStatus,
  DecisionKind,
  DecisionSourceSignal,
  GovernedActionType,
  DecisionReceiptAffectedObject,
} from '../../shared/types/decision-architecture.js';
import {
  buildPreflightDecision,
  buildGovernedActionDecision,
  buildDecisionReceipt,
  getAuthorityForAction,
  isActorAuthorized,
  isValidTransition,
  createDecisionId,
  createReceiptId,
} from '../../shared/types/decision-architecture.js';

const log = createScopedLogger('decision-lifecycle');

// ─── In-memory store (project-scoped) ────────────────────────────────────────
// Real persistence delegates to existing decision-record-service when available.
// This memory store is the fallback and the fast-read cache.

const decisionStore = new Map<string, FormalDecisionRecord>();
const receiptStore = new Map<string, DecisionReceipt>();
const projectIndex = new Map<string, Set<string>>(); // projectId → decision IDs

function indexDecision(decision: FormalDecisionRecord): void {
  decisionStore.set(decision.id, decision);
  if (!projectIndex.has(decision.projectId)) {
    projectIndex.set(decision.projectId, new Set());
  }
  projectIndex.get(decision.projectId)!.add(decision.id);
}

function indexReceipt(receipt: DecisionReceipt): void {
  receiptStore.set(receipt.id, receipt);
}

// ─── Persistence Bridge ──────────────────────────────────────────────────────

async function persistDecision(decision: FormalDecisionRecord): Promise<boolean> {
  try {
    const { decisionRecordService } = await import('./decision-record-service.js');
    if (!decisionRecordService) return false;

    await decisionRecordService.create({
      organizationId: 1, // Default org — real multi-tenant uses req context
      projectId: Number(decision.projectId) || 0,
      decisionCode: `${decision.kind}:${decision.id}`,
      title: decision.summary.slice(0, 200),
      domainTrack: 'regulatory',
      recommendationType: 'regulatory_strategy',
      recommendationSummary: decision.summary,
      recommendationRationale: decision.rationale,
      confidenceLevel: decision.sourceSignals.length > 2 ? 'high' : 'moderate',
      decidedBy: decision.createdById || decision.createdByType || 'system',
      notes: JSON.stringify({
        kind: decision.kind,
        status: decision.status,
        authority: decision.authority,
        sectionCode: decision.sectionCode,
        moduleCode: decision.moduleCode,
        dossierId: decision.dossierId,
        sourceSignals: decision.sourceSignals,
        recommendedActionIds: decision.recommendedActionIds,
        linkedContradictionIds: decision.linkedContradictionIds,
        linkedAssumptionIds: decision.linkedAssumptionIds,
      }),
      decisionContext: {
        formalDecisionId: decision.id,
        kind: decision.kind,
        workflowStage: decision.workflowStage,
        regulatorBody: decision.regulatorBody,
        submissionType: decision.submissionType,
      },
    });
    return true;
  } catch (err) {
    log.warn('Decision persistence failed (non-blocking)', {
      decisionId: decision.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class DecisionLifecycleService {

  // ── Create decisions from workflow events ────────────────────────

  /**
   * Record a preflight judgment as a formal decision.
   */
  recordPreflightDecision(opts: {
    projectId: string;
    kind: 'section-preflight-judgment' | 'module-preflight-judgment' | 'dossier-preflight-judgment';
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
    createdById?: string;
  }): FormalDecisionRecord {
    const decision = buildPreflightDecision({
      ...opts,
      createdByType: 'system',
    });

    indexDecision(decision);
    persistDecision(decision).then(ok => {
      if (!ok) {
        log.warn('Preflight decision persisted to memory only', { id: decision.id });
      }
    });

    log.info('Preflight decision recorded', {
      id: decision.id,
      kind: decision.kind,
      overall: opts.overall,
      signals: opts.sourceSignals.length,
    });

    return decision;
  }

  /**
   * Record a governed action (promotion, correction, harmonization) as a formal decision.
   */
  recordGovernedActionDecision(opts: {
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
    const decision = buildGovernedActionDecision(opts);

    indexDecision(decision);
    persistDecision(decision).then(ok => {
      if (!ok) {
        log.warn('Governed action decision persisted to memory only', { id: decision.id });
      }
    });

    log.info('Governed action decision recorded', {
      id: decision.id,
      kind: decision.kind,
      action: opts.governedAction,
      authority: decision.authority.level,
    });

    return decision;
  }

  // ── Transition decision status ──────────────────────────────────

  /**
   * Transition a decision to a new status with authority checking.
   */
  transitionDecision(
    decisionId: string,
    newStatus: DecisionStatus,
    opts: {
      actorId?: string;
      actorRole?: string;
      reason?: string;
      escalatedToRole?: string;
    } = {}
  ): { success: boolean; decision?: FormalDecisionRecord; error?: string } {
    const decision = decisionStore.get(decisionId);
    if (!decision) {
      return { success: false, error: `Decision ${decisionId} not found` };
    }

    if (!isValidTransition(decision.status, newStatus)) {
      return {
        success: false,
        error: `Invalid transition: ${decision.status} → ${newStatus}`,
      };
    }

    // Authority check for approval/escalation
    if (newStatus === 'approved' && decision.authority.requiresReviewerApproval) {
      const authCheck = isActorAuthorized(decision.authority, opts.actorRole);
      if (!authCheck.authorized) {
        return { success: false, error: authCheck.reason };
      }
    }

    const now = new Date().toISOString();
    decision.status = newStatus;
    decision.updatedAt = now;

    switch (newStatus) {
      case 'confirmed':
        decision.confirmedById = opts.actorId;
        decision.confirmedAt = now;
        break;
      case 'executed':
        decision.executedAt = now;
        break;
      case 'approved':
        decision.approvedById = opts.actorId;
        decision.approvedAt = now;
        break;
      case 'rejected':
        decision.rejectedById = opts.actorId;
        decision.rejectedAt = now;
        break;
      case 'escalated':
        decision.escalatedToRole = opts.escalatedToRole;
        decision.escalatedAt = now;
        break;
    }

    log.info('Decision transitioned', {
      id: decisionId,
      from: decision.status,
      to: newStatus,
      actor: opts.actorId,
    });

    return { success: true, decision };
  }

  // ── Create receipts ─────────────────────────────────────────────

  /**
   * Create a receipt after a decision is confirmed and/or executed.
   */
  createReceipt(opts: {
    decisionId: string;
    projectId: string;
    recommendation: { summary: string; actionIds: string[]; rationale: string };
    confirmation: { accepted: boolean; confirmedById?: string; rejectionReason?: string };
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
    const receipt = buildDecisionReceipt(opts);
    indexReceipt(receipt);

    // Link receipt to decision
    const decision = decisionStore.get(opts.decisionId);
    if (decision) {
      decision.linkedReceiptId = receipt.id;
    }

    log.info('Decision receipt created', {
      receiptId: receipt.id,
      decisionId: opts.decisionId,
      accepted: opts.confirmation.accepted,
      executed: opts.execution?.executed ?? false,
      affectedCount: opts.affectedObjects?.length ?? 0,
      pendingApprovals: opts.pendingApprovals?.length ?? 0,
    });

    return receipt;
  }

  // ── Authority checks ────────────────────────────────────────────

  /**
   * Check whether an action can proceed given actor role and authority requirements.
   */
  checkAuthority(
    action: GovernedActionType,
    actorRole?: string
  ): { allowed: boolean; authority: ReturnType<typeof getAuthorityForAction>; reason?: string } {
    const authority = getAuthorityForAction(action);
    const check = isActorAuthorized(authority, actorRole);
    return {
      allowed: check.authorized,
      authority,
      reason: check.reason,
    };
  }

  // ── Query decisions ─────────────────────────────────────────────

  getDecision(id: string): FormalDecisionRecord | undefined {
    return decisionStore.get(id);
  }

  getReceipt(id: string): DecisionReceipt | undefined {
    return receiptStore.get(id);
  }

  getReceiptForDecision(decisionId: string): DecisionReceipt | undefined {
    const decision = decisionStore.get(decisionId);
    if (decision?.linkedReceiptId) {
      return receiptStore.get(decision.linkedReceiptId);
    }
    // Search by decisionId
    for (const receipt of receiptStore.values()) {
      if (receipt.decisionId === decisionId) return receipt;
    }
    return undefined;
  }

  getProjectDecisions(
    projectId: string,
    filters?: {
      kind?: DecisionKind;
      status?: DecisionStatus;
      sectionCode?: string;
      moduleCode?: string;
      limit?: number;
    }
  ): FormalDecisionRecord[] {
    const ids = projectIndex.get(projectId);
    if (!ids) return [];

    let decisions = Array.from(ids)
      .map(id => decisionStore.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filters?.kind) decisions = decisions.filter(d => d.kind === filters.kind);
    if (filters?.status) decisions = decisions.filter(d => d.status === filters.status);
    if (filters?.sectionCode) decisions = decisions.filter(d => d.sectionCode === filters.sectionCode);
    if (filters?.moduleCode) decisions = decisions.filter(d => d.moduleCode === filters.moduleCode);

    return decisions.slice(0, filters?.limit ?? 50);
  }

  /**
   * Get recent decisions with their receipts for AnA explanation grounding.
   */
  getDecisionContext(
    projectId: string,
    opts?: { sectionCode?: string; moduleCode?: string; limit?: number }
  ): Array<{
    decision: FormalDecisionRecord;
    receipt?: DecisionReceipt;
  }> {
    const decisions = this.getProjectDecisions(projectId, {
      sectionCode: opts?.sectionCode,
      moduleCode: opts?.moduleCode,
      limit: opts?.limit ?? 10,
    });

    return decisions.map(decision => ({
      decision,
      receipt: this.getReceiptForDecision(decision.id),
    }));
  }

  // ── Contradiction consequence paths ─────────────────────────────

  /**
   * Create a decision from a contradiction finding that feeds the core workflow.
   * Returns the decision and the recommended consequence paths.
   */
  recordContradictionConsequence(opts: {
    projectId: string;
    contradictionId: string;
    severity: 'critical' | 'major' | 'minor';
    explanation: string;
    sectionCode?: string;
    moduleCode?: string;
    affectedSections?: string[];
    createdById?: string;
  }): {
    decision: FormalDecisionRecord;
    consequencePaths: Array<{
      action: GovernedActionType;
      label: string;
      authority: ReturnType<typeof getAuthorityForAction>;
    }>;
  } {
    // Determine consequence paths based on severity
    const consequencePaths: Array<{
      action: GovernedActionType;
      label: string;
      authority: ReturnType<typeof getAuthorityForAction>;
    }> = [];

    if (opts.severity === 'critical' || opts.severity === 'major') {
      consequencePaths.push({
        action: 'prepare-correction-draft',
        label: 'Prepare governed correction draft',
        authority: getAuthorityForAction('prepare-correction-draft'),
      });
    }
    if (opts.affectedSections && opts.affectedSections.length > 1) {
      consequencePaths.push({
        action: 'prepare-harmonization-suggestion',
        label: 'Harmonize affected sections',
        authority: getAuthorityForAction('prepare-harmonization-suggestion'),
      });
    }
    if (opts.severity === 'critical') {
      consequencePaths.push({
        action: 'create-contradiction-consequence',
        label: 'Escalate to reviewer',
        authority: getAuthorityForAction('create-contradiction-consequence'),
      });
    }

    const decision = this.recordGovernedActionDecision({
      projectId: opts.projectId,
      kind: 'contradiction-resolution-decision',
      governedAction: 'create-contradiction-consequence',
      sectionCode: opts.sectionCode,
      moduleCode: opts.moduleCode,
      summary: `Contradiction detected: ${opts.explanation.slice(0, 150)}`,
      rationale: `Severity: ${opts.severity}. ${consequencePaths.length} consequence path(s) available.`,
      sourceSignals: [{
        kind: 'contradiction',
        id: opts.contradictionId,
        summary: opts.explanation,
        severity: opts.severity,
      }],
      createdByType: 'system',
      createdById: opts.createdById,
      linkedContradictionIds: [opts.contradictionId],
    });

    return { decision, consequencePaths };
  }

  // ── Decision-aware gating ───────────────────────────────────────

  /**
   * Compute decision-aware status for a module or dossier.
   * Enriches a preflight overall verdict with decision state awareness.
   */
  computeDecisionAwareStatus(
    projectId: string,
    scope: { moduleCode?: string; dossierId?: string }
  ): {
    hasUnresolvedContradictions: boolean;
    hasProvisionalDecisions: boolean;
    needsReapproval: boolean;
    needsEscalation: boolean;
    pendingConfirmations: number;
    pendingApprovals: number;
    blockedDecisions: FormalDecisionRecord[];
    summary: string;
  } {
    const decisions = this.getProjectDecisions(projectId, {
      moduleCode: scope.moduleCode,
    });

    const unresolved = decisions.filter(
      d => d.kind === 'contradiction-resolution-decision' &&
        d.status !== 'executed' && d.status !== 'approved' && d.status !== 'superseded'
    );
    const provisional = decisions.filter(d => d.status === 'provisional');
    const needsReapproval = decisions.filter(
      d => d.kind === 'reapproval-decision' && d.status === 'recommended'
    );
    const escalated = decisions.filter(d => d.status === 'escalated');
    const pendingConfirmations = decisions.filter(
      d => d.status === 'recommended' && d.authority.requiresHumanConfirmation
    );
    const pendingApprovals = decisions.filter(
      d => (d.status === 'executed' || d.status === 'provisional') &&
        d.authority.requiresReviewerApproval
    );

    const blocked = decisions.filter(
      d => d.status === 'recommended' &&
        d.sourceSignals.some(s => s.severity === 'critical')
    );

    const parts: string[] = [];
    if (unresolved.length) parts.push(`${unresolved.length} unresolved contradiction(s)`);
    if (provisional.length) parts.push(`${provisional.length} provisional decision(s)`);
    if (needsReapproval.length) parts.push(`${needsReapproval.length} reapproval(s) needed`);
    if (escalated.length) parts.push(`${escalated.length} escalated decision(s)`);
    if (pendingConfirmations.length) parts.push(`${pendingConfirmations.length} pending confirmation(s)`);
    if (pendingApprovals.length) parts.push(`${pendingApprovals.length} pending approval(s)`);

    return {
      hasUnresolvedContradictions: unresolved.length > 0,
      hasProvisionalDecisions: provisional.length > 0,
      needsReapproval: needsReapproval.length > 0,
      needsEscalation: escalated.length > 0,
      pendingConfirmations: pendingConfirmations.length,
      pendingApprovals: pendingApprovals.length,
      blockedDecisions: blocked,
      summary: parts.length > 0
        ? parts.join('; ')
        : 'No pending decisions',
    };
  }
}

export const decisionLifecycleService = new DecisionLifecycleService();
