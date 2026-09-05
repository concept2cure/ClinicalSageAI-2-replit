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
  // Never fabricate tenant attribution. The in-memory store remains the source
  // of truth for the session; this DB bridge is best-effort and tenant-scoped.
  if (decision.organizationId == null) {
    console.warn(
      `[decision-lifecycle] Skipping DB persistence for decision ${decision.id}: ` +
      'no organizationId on decision (caller did not supply tenant context). In-memory record retained.'
    );
    return false;
  }

  try {
    const { decisionRecordService } = await import('./decision-record-service.js');
    if (!decisionRecordService) return false;

    await decisionRecordService.create({
      organizationId: decision.organizationId,
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
    organizationId?: number;
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
    organizationId?: number;
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

    // Persist receipt to DB (non-blocking)
    this.persistReceipt(receipt).catch((err: unknown) => {
      log.warn('Receipt persistence failed (in-memory retained)', {
        receiptId: receipt.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return receipt;
  }

  /** Persist receipt to decision_receipts table (non-blocking bridge) */
  private async persistReceipt(receipt: DecisionReceipt): Promise<boolean> {
    try {
      const { pool } = await import('../db.js');
      if (!pool) return false;

      await pool.query(`
        INSERT INTO decision_receipts (
          id, decision_id, project_id,
          recommendation_summary, recommendation_action_ids, recommendation_rationale,
          confirmation_accepted, confirmed_by_id, confirmed_at, rejection_reason,
          execution_executed, executed_at, executed_by_id, execution_method, execution_error,
          affected_objects, pending_approvals, provisional_items
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO NOTHING
      `, [
        receipt.id,
        receipt.decisionId,
        receipt.projectId,
        receipt.recommendation?.summary,
        JSON.stringify(receipt.recommendation?.actionIds ?? []),
        receipt.recommendation?.rationale,
        receipt.confirmation?.accepted ?? false,
        receipt.confirmation?.confirmedById,
        receipt.confirmation?.confirmedAt,
        receipt.confirmation?.rejectionReason,
        receipt.execution?.executed ?? false,
        receipt.execution?.executedAt,
        receipt.execution?.executedById,
        receipt.execution?.executionMethod,
        receipt.execution?.error,
        JSON.stringify(receipt.affectedObjects ?? []),
        JSON.stringify(receipt.pendingApprovals ?? []),
        JSON.stringify(receipt.provisionalItems ?? []),
      ]);

      log.info('Receipt persisted to DB', { receiptId: receipt.id });
      return true;
    } catch (err: unknown) {
      // Table may not exist yet — degrade gracefully
      log.debug('Receipt persistence skipped (table may not exist)', {
        receiptId: receipt.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
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

  /* TENANT SCOPING ON THE READ PATH.
     decisionStore and receiptStore are in-memory Maps, so there is no database
     row-level security behind them — the RLS that protects concept2cure_artifacts
     cannot help here. These accessors took an id and returned whatever was under
     it, and the three HTTP routes that call them never resolved a tenant at all,
     so any authenticated caller could read another organization's governed
     decisions and receipts by supplying an id.

     `organizationId` was optional so the five internal service callers could
     compile unchanged. All of them now pass it, so the optionality is no longer
     load-bearing — and an absent tenant no longer means "no filter". It means
     no records. Passing the tenant at every call site is a convention, and a
     convention only holds until the next call site; a caller that omits the
     tenant now reads nothing instead of reading every organization.

     The match is strict in both directions: a record whose organizationId is
     undefined does not match a numeric one either. recordDecision already warns
     when a decision is stored without tenant context, and an unattributed
     record must not be handed to a specific tenant. */
  getDecision(id: string, organizationId?: number): FormalDecisionRecord | undefined {
    if (organizationId == null) return undefined;
    const decision = decisionStore.get(id);
    if (!decision) return undefined;
    if (decision.organizationId !== organizationId) return undefined;
    return decision;
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
      /** See getDecision — strict when supplied, absent for internal callers. */
      organizationId?: number;
      kind?: DecisionKind;
      status?: DecisionStatus;
      sectionCode?: string;
      moduleCode?: string;
      limit?: number;
    }
  ): FormalDecisionRecord[] {
    /* No tenant, no records. See getDecision: this is the whole boundary. */
    if (filters?.organizationId == null) return [];

    const ids = projectIndex.get(projectId);
    if (!ids) return [];

    let decisions = Array.from(ids)
      .map(id => decisionStore.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    /* Applied before every other filter and before the limit, so a caller can
       never page through another tenant's records. */
    decisions = decisions.filter(d => d.organizationId === filters.organizationId);
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
    opts?: {
      /** See getDecision — strict when supplied. */
      organizationId?: number;
      sectionCode?: string;
      moduleCode?: string;
      limit?: number;
    }
  ): Array<{
    decision: FormalDecisionRecord;
    receipt?: DecisionReceipt;
  }> {
    const decisions = this.getProjectDecisions(projectId, {
      organizationId: opts?.organizationId,
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
    organizationId?: number;
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
      organizationId: opts.organizationId,
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
    scope: {
      moduleCode?: string;
      dossierId?: string;
      /** See getDecision — strict when supplied, absent for internal callers. */
      organizationId?: number;
    }
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
      organizationId: scope.organizationId,
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
  // ── Pass 8: Contradiction↔Decision bidirectional linkage ──────

  /**
   * Find all decisions linked to a specific contradiction.
   */
  getDecisionsForContradiction(contradictionId: string): FormalDecisionRecord[] {
    const results: FormalDecisionRecord[] = [];
    for (const decision of decisionStore.values()) {
      if (decision.linkedContradictionIds?.includes(contradictionId)) {
        results.push(decision);
      }
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Find all contradictions linked to a specific decision.
   */
  getContradictionIdsForDecision(decisionId: string): string[] {
    const decision = decisionStore.get(decisionId);
    return decision?.linkedContradictionIds || [];
  }

  /**
   * Build contradiction-enriched decision context for AnA explanation grounding.
   * Includes contradiction details alongside decision records.
   */
  getContradictionDecisionContext(
    projectId: string,
    opts?: {
      /** See getDecision — strict when supplied. */
      organizationId?: number;
      sectionCode?: string;
      moduleCode?: string;
      limit?: number;
    }
  ): Array<{
    decision: FormalDecisionRecord;
    receipt?: DecisionReceipt;
    contradictionIds: string[];
    isContradictionDecision: boolean;
  }> {
    const decisions = this.getProjectDecisions(projectId, {
      organizationId: opts?.organizationId,
      sectionCode: opts?.sectionCode,
      moduleCode: opts?.moduleCode,
      limit: opts?.limit ?? 15,
    });

    return decisions.map(decision => ({
      decision,
      receipt: this.getReceiptForDecision(decision.id),
      contradictionIds: decision.linkedContradictionIds || [],
      isContradictionDecision: decision.kind === 'contradiction-resolution-decision',
    }));
  }

  /**
   * Compute contradiction-aware preflight verdict enrichment.
   * Integrates contradiction findings into the decision-aware status.
   */
  async computeContradictionAwareStatus(
    projectId: string,
    scope: { moduleCode?: string; dossierId?: string; regulatorBody?: string; submissionType?: string }
  ): Promise<{
    hasUnresolvedContradictions: boolean;
    hasProvisionalDecisions: boolean;
    needsReapproval: boolean;
    needsEscalation: boolean;
    pendingConfirmations: number;
    pendingApprovals: number;
    blockedDecisions: FormalDecisionRecord[];
    contradictionCount: number;
    contradictionBlockingCount: number;
    overlayActiveCount: number;
    summary: string;
  }> {
    // Base decision-aware status
    const baseStatus = this.computeDecisionAwareStatus(projectId, scope);

    // Enrich with contradiction context
    let contradictionCount = 0;
    let contradictionBlockingCount = 0;
    let overlayActiveCount = 0;

    try {
      const { contradictionEngineService } = await import('./contradiction-engine-service.js');
      const contradictionContext = await contradictionEngineService.buildPreflightContradictionContext(
        1, // Default org — real multi-tenant uses req context
        Number(projectId),
        {
          moduleCode: scope.moduleCode,
          regulatorBody: scope.regulatorBody,
          submissionType: scope.submissionType,
        }
      );
      contradictionCount = contradictionContext.unresolvedCount;
      contradictionBlockingCount = contradictionContext.blockingCount;
      overlayActiveCount = contradictionContext.overlayActiveCount;
    } catch {
      // Contradiction engine unavailable
    }

    const parts: string[] = [];
    if (baseStatus.summary !== 'No pending decisions') {
      parts.push(baseStatus.summary);
    }
    if (contradictionCount > 0) {
      parts.push(`${contradictionCount} contradiction(s) (${contradictionBlockingCount} blocking)`);
    }
    if (overlayActiveCount > 0) {
      parts.push(`${overlayActiveCount} regulator overlay(s) active`);
    }

    return {
      ...baseStatus,
      contradictionCount,
      contradictionBlockingCount,
      overlayActiveCount,
      summary: parts.length > 0 ? parts.join('; ') : 'No pending decisions or contradictions',
    };
  }
}

export const decisionLifecycleService = new DecisionLifecycleService();
