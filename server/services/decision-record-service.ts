/**
 * Decision Record Service
 *
 * Part 2: Makes recommendation, confidence, action, approval, rejection,
 * provisional state, and escalation explicit platform objects.
 *
 * Extends DecisionLineageService by adding structured decision records with:
 * - Recommendation type and summary
 * - Confidence and evidence basis
 * - Action state: proposed → under_review → approved/rejected → executed
 * - Escalation state
 * - Executed artifact linkage (provisional vs executed distinction)
 * - Related assumption linkage
 *
 * @module server/services/decision-record-service
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('decision-record');

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecommendationType =
  | 'regulatory_strategy'
  | 'study_design'
  | 'endpoint_selection'
  | 'dose_selection'
  | 'comparator_selection'
  | 'statistical_method'
  | 'manufacturing_change'
  | 'labeling_change'
  | 'submission_timing'
  | 'risk_mitigation'
  | 'protocol_amendment'
  | 'data_package';

export type ActionState =
  | 'proposed'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'deferred'
  | 'escalated'
  | 'superseded';

export type EvidenceBasis =
  | 'rules_based'
  | 'validation_based'
  | 'ai_inferred'
  | 'expert_judgment'
  | 'precedent_based';

export interface DecisionRecord {
  id: string;
  organizationId: number;
  projectId: number;
  decisionCode: string;
  title: string;
  domainTrack: string;
  recommendationType: RecommendationType;
  recommendationSummary: string;
  recommendationRationale: string | null;
  confidenceLevel: string;
  evidenceBasis: EvidenceBasis | null;
  actionState: ActionState;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  executedArtifactId: number | null;
  executedArtifactVersion: number | null;
  executedWorkflowRunId: string | null;
  relatedAssumptionIds: string[];
  escalatedTo: string | null;
  escalationReason: string | null;
  notes: string | null;
  decisionContext: Record<string, unknown>;
  decidedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDecisionInput {
  organizationId: number;
  projectId: number;
  decisionCode: string;
  title: string;
  domainTrack: string;
  recommendationType: RecommendationType;
  recommendationSummary: string;
  recommendationRationale?: string;
  confidenceLevel?: string;
  evidenceBasis?: EvidenceBasis;
  relatedAssumptionIds?: string[];
  decidedBy: string;
  notes?: string;
  decisionContext?: Record<string, unknown>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DecisionRecordService {
  private static instance: DecisionRecordService;

  static getInstance(): DecisionRecordService {
    if (!DecisionRecordService.instance) {
      DecisionRecordService.instance = new DecisionRecordService();
    }
    return DecisionRecordService.instance;
  }

  /**
   * Pure gate that says whether a decision is allowed to execute given its
   * governance boundary, confidence level, and approval state. Used by
   * orchestration layers before performing any side-effect off a decision.
   */
  validateGovernanceBoundary(decision: {
    governanceBoundary?: string;
    confidence?: string;
    approvalState?: string;
  }): { canExecute: boolean; reason?: string } {
    const { governanceBoundary, confidence, approvalState } = decision;

    if (approvalState === 'rejected') {
      return { canExecute: false, reason: 'Decision was rejected' };
    }

    if (approvalState === 'pending_review') {
      return { canExecute: false, reason: 'Decision pending review' };
    }

    if (governanceBoundary === 'advisory'
        && (confidence === 'uncertain' || confidence === 'provisional')) {
      return { canExecute: false, reason: 'Advisory decision is provisional/uncertain' };
    }

    return { canExecute: true };
  }

  async createDecision(input: Record<string, unknown>): Promise<DecisionRecord> {
    return this.create({
      organizationId: Number(input.organizationId),
      projectId: Number(input.projectId),
      decisionCode: String(input.recommendationType || `DEC-${Date.now()}`),
      title: String(input.contextDescription || input.recommendationSummary || 'Decision'),
      domainTrack: String(input.domainTrack || 'regulatory'),
      recommendationType: (input.recommendationType as RecommendationType) || 'regulatory_strategy',
      recommendationSummary: String(input.recommendationSummary || ''),
      recommendationRationale: (input.recommendationDetail as string) || undefined,
      confidenceLevel: (input.confidence as string) || 'moderate',
      evidenceBasis: 'expert_judgment',
      relatedAssumptionIds: (input.relatedAssumptionIds as string[]) || [],
      decidedBy: String(input.createdById || 'system'),
      notes: (input.notes as string) || undefined,
      decisionContext: (input as Record<string, unknown>) || {},
    });
  }

  async create(input: CreateDecisionInput): Promise<DecisionRecord> {
    log.info('Creating decision record', { code: input.decisionCode, project: input.projectId });

    const result = await pool!.query(
      `
      INSERT INTO decision_records (
        organization_id, project_id, decision_code, title, domain_track,
        recommendation_type, recommendation_summary, recommendation_rationale,
        confidence_level, evidence_basis, related_assumption_ids,
        decided_by, notes, decision_context
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `,
      [
        input.organizationId,
        input.projectId,
        input.decisionCode,
        input.title,
        input.domainTrack,
        input.recommendationType,
        input.recommendationSummary,
        input.recommendationRationale ?? null,
        input.confidenceLevel ?? 'moderate',
        input.evidenceBasis ?? null,
        input.relatedAssumptionIds ?? [],
        input.decidedBy,
        input.notes ?? null,
        JSON.stringify(input.decisionContext ?? {}),
      ]
    );

    return this.map(result.rows[0]);
  }

  async search(input: {
    organizationId: number;
    projectId?: number;
    domainTrack?: string;
    actionState?: ActionState;
    recommendationType?: RecommendationType;
    limit?: number;
  }): Promise<DecisionRecord[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let idx = 2;

    if (input.projectId) {
      conditions.push(`project_id = $${idx++}`);
      params.push(input.projectId);
    }
    if (input.domainTrack) {
      conditions.push(`domain_track = $${idx++}`);
      params.push(input.domainTrack);
    }
    if (input.actionState) {
      conditions.push(`action_state = $${idx++}`);
      params.push(input.actionState);
    }
    if (input.recommendationType) {
      conditions.push(`recommendation_type = $${idx++}`);
      params.push(input.recommendationType);
    }

    const limit = input.limit ?? 50;
    params.push(limit);

    const result = await pool!.query(
      `
      SELECT * FROM decision_records WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC LIMIT $${idx}
    `,
      params
    );

    return result.rows.map(this.map);
  }

  async getById(id: string, organizationId: number): Promise<DecisionRecord | null> {
    const result = await pool!.query(
      'SELECT * FROM decision_records WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async transition(
    id: string,
    input: {
      organizationId: number;
      actionState: ActionState;
      performedBy: string;
      reason?: string;
      escalatedTo?: string;
      executedArtifactId?: number;
      executedArtifactVersion?: number;
      executedWorkflowRunId?: string;
    }
  ): Promise<DecisionRecord | null> {
    log.info('Transitioning decision', { id, newState: input.actionState });

    const sets: string[] = ['action_state = $1', 'updated_at = NOW()'];
    const params: (string | number | null)[] = [input.actionState];
    let idx = 2;

    if (input.actionState === 'approved') {
      sets.push(`approved_by = $${idx++}`);
      params.push(input.performedBy);
      sets.push(`approved_at = NOW()`);
    }
    if (input.actionState === 'rejected') {
      sets.push(`rejection_reason = $${idx++}`);
      params.push(input.reason ?? null);
    }
    if (input.actionState === 'escalated') {
      sets.push(`escalated_to = $${idx++}`);
      params.push(input.escalatedTo ?? input.performedBy);
      sets.push(`escalation_reason = $${idx++}`);
      params.push(input.reason ?? null);
    }
    if (input.executedArtifactId) {
      sets.push(`executed_artifact_id = $${idx++}`);
      params.push(input.executedArtifactId);
    }
    if (input.executedArtifactVersion) {
      sets.push(`executed_artifact_version = $${idx++}`);
      params.push(input.executedArtifactVersion);
    }
    if (input.executedWorkflowRunId) {
      sets.push(`executed_workflow_run_id = $${idx++}`);
      params.push(input.executedWorkflowRunId);
    }

    params.push(id, input.organizationId);

    const result = await pool!.query(
      `
      UPDATE decision_records SET ${sets.join(', ')}
      WHERE id = $${idx++} AND organization_id = $${idx}
      RETURNING *
    `,
      params
    );

    const record = result.rows.length ? this.map(result.rows[0]) : null;

    // Reactive propagation: mark downstream objects when decision changes materially
    if (record) {
      const triggerMap: Record<string, string> = {
        approved: 'decision_approved',
        rejected: 'decision_rejected',
        executed: 'decision_executed',
        escalated: 'decision_escalated',
        superseded: 'decision_superseded',
      };
      const triggerType = triggerMap[input.actionState];
      if (triggerType) {
        this.propagateDecisionChange(record, triggerType as any, input.reason).catch(err => {
          log.warn('Decision propagation failed (non-blocking)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    return record;
  }

  private async propagateDecisionChange(
    decision: DecisionRecord,
    triggerType: string,
    reason?: string
  ): Promise<void> {
    try {
      const { reactiveDependencyService } = await import('./reactive-dependency-service');
      await reactiveDependencyService.propagateChange({
        organizationId: decision.organizationId,
        projectId: decision.projectId,
        triggerType: triggerType as any,
        sourceType: 'decision',
        sourceId: decision.id,
        sourceLabel: decision.title,
        reason: reason ?? `Decision transitioned to ${decision.actionState}`,
      });
    } catch {
      // Silently skip if tables don't exist yet
    }
  }

  async queryDecisions(input: {
    organizationId: number;
    projectId?: number;
    contextType?: string;
    actionState?: ActionState;
    approvalState?: string;
    confidence?: string;
    governanceBoundary?: string;
    regulatorBody?: string;
    relatedArtifactId?: number;
    includeSuperseded?: boolean;
    limit?: number;
  }): Promise<DecisionRecord[]> {
    const records = await this.search({
      organizationId: input.organizationId,
      projectId: input.projectId,
      actionState: input.actionState,
      limit: input.limit,
    });
    return records.filter(r => {
      if (!input.includeSuperseded && r.actionState === 'superseded') return false;
      if (input.confidence && r.confidenceLevel !== input.confidence) return false;
      if (input.relatedArtifactId && r.executedArtifactId !== input.relatedArtifactId) return false;
      return true;
    });
  }

  async getDecision(id: string, organizationId: number): Promise<DecisionRecord | null> {
    return this.getById(id, organizationId);
  }

  async updateDecision(
    id: string,
    organizationId: number,
    input: Record<string, unknown>
  ): Promise<DecisionRecord | null> {
    const editable: Record<string, string> = {
      title: 'title',
      recommendationSummary: 'recommendation_summary',
      recommendationRationale: 'recommendation_rationale',
      confidenceLevel: 'confidence_level',
      notes: 'notes',
    };
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    let idx = 1;
    for (const [key, column] of Object.entries(editable)) {
      if (input[key] !== undefined) {
        sets.push(`${column} = $${idx++}`);
        params.push(input[key] as string);
      }
    }
    if (sets.length === 0) return this.getById(id, organizationId);
    sets.push('updated_at = NOW()');
    params.push(id, organizationId);
    const result = await pool!.query(
      `UPDATE decision_records SET ${sets.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx} RETURNING *`,
      params
    );
    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async supersedeDecision(
    id: string,
    organizationId: number,
    replacement: Record<string, unknown>,
    reason: string
  ): Promise<DecisionRecord | null> {
    await this.createDecision({ ...replacement, organizationId });
    return this.transition(id, {
      organizationId,
      actionState: 'superseded',
      performedBy: String(replacement.createdById ?? 'system'),
      reason,
    });
  }

  async executeDecision(
    id: string,
    organizationId: number,
    executedArtifactId: number,
    executedArtifactVersion?: number,
    userId?: number,
    _actionDescription?: string
  ): Promise<DecisionRecord | null> {
    return this.transition(id, {
      organizationId,
      actionState: 'executed',
      performedBy: String(userId ?? 'system'),
      executedArtifactId,
      executedArtifactVersion,
    });
  }

  async approveDecision(
    id: string,
    organizationId: number,
    userId: number
  ): Promise<DecisionRecord | null> {
    return this.transition(id, {
      organizationId,
      actionState: 'approved',
      performedBy: String(userId),
    });
  }

  async rejectDecision(
    id: string,
    organizationId: number,
    userId: number,
    reason: string
  ): Promise<DecisionRecord | null> {
    return this.transition(id, {
      organizationId,
      actionState: 'rejected',
      performedBy: String(userId),
      reason,
    });
  }

  async escalateDecision(
    id: string,
    organizationId: number,
    reason: string,
    userId?: number
  ): Promise<DecisionRecord | null> {
    return this.transition(id, {
      organizationId,
      actionState: 'escalated',
      performedBy: String(userId ?? 'system'),
      reason,
    });
  }

  validateGovernanceBoundary(decision: DecisionRecord): {
    decisionId: string;
    actionState: ActionState;
    requiresApproval: boolean;
    withinBoundary: boolean;
  } {
    // A decision is within its governance boundary once it has reached a
    // terminal approved/executed state; proposed/under-review decisions still
    // require human approval before they may act.
    const approvedStates: ActionState[] = ['approved', 'executed'];
    const withinBoundary = approvedStates.includes(decision.actionState);
    return {
      decisionId: decision.id,
      actionState: decision.actionState,
      requiresApproval: !withinBoundary,
      withinBoundary,
    };
  }

  private map(row: Record<string, unknown>): DecisionRecord {
    return {
      id: row.id as string,
      organizationId: row.organization_id as number,
      projectId: row.project_id as number,
      decisionCode: row.decision_code as string,
      title: row.title as string,
      domainTrack: row.domain_track as string,
      recommendationType: row.recommendation_type as RecommendationType,
      recommendationSummary: row.recommendation_summary as string,
      recommendationRationale: row.recommendation_rationale as string | null,
      confidenceLevel: row.confidence_level as string,
      evidenceBasis: row.evidence_basis as EvidenceBasis | null,
      actionState: row.action_state as ActionState,
      approvedBy: row.approved_by as string | null,
      approvedAt: (row.approved_at as Date)?.toISOString() ?? null,
      rejectionReason: row.rejection_reason as string | null,
      executedArtifactId: row.executed_artifact_id as number | null,
      executedArtifactVersion: row.executed_artifact_version as number | null,
      executedWorkflowRunId: row.executed_workflow_run_id as string | null,
      relatedAssumptionIds: (row.related_assumption_ids as string[]) ?? [],
      escalatedTo: row.escalated_to as string | null,
      escalationReason: row.escalation_reason as string | null,
      notes: row.notes as string | null,
      decisionContext: (row.decision_context as Record<string, unknown>) ?? {},
      decidedBy: row.decided_by as string,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const decisionRecordService = new DecisionRecordService();
