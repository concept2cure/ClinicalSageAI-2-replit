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
  | 'regulatory_strategy' | 'study_design' | 'endpoint_selection'
  | 'dose_selection' | 'comparator_selection' | 'statistical_method'
  | 'manufacturing_change' | 'labeling_change' | 'submission_timing'
  | 'risk_mitigation' | 'protocol_amendment' | 'data_package';

export type ActionState =
  | 'proposed' | 'under_review' | 'approved' | 'rejected'
  | 'executed' | 'deferred' | 'escalated' | 'superseded';

export type EvidenceBasis =
  | 'rules_based' | 'validation_based' | 'ai_inferred' | 'expert_judgment' | 'precedent_based';

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

class DecisionRecordService {

  async create(input: CreateDecisionInput): Promise<DecisionRecord> {
    log.info('Creating decision record', { code: input.decisionCode, project: input.projectId });

    const result = await pool!.query(`
      INSERT INTO decision_records (
        organization_id, project_id, decision_code, title, domain_track,
        recommendation_type, recommendation_summary, recommendation_rationale,
        confidence_level, evidence_basis, related_assumption_ids,
        decided_by, notes, decision_context
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      input.organizationId, input.projectId, input.decisionCode, input.title,
      input.domainTrack, input.recommendationType, input.recommendationSummary,
      input.recommendationRationale ?? null, input.confidenceLevel ?? 'moderate',
      input.evidenceBasis ?? null, input.relatedAssumptionIds ?? [],
      input.decidedBy, input.notes ?? null, JSON.stringify(input.decisionContext ?? {})
    ]);

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

    if (input.projectId) { conditions.push(`project_id = $${idx++}`); params.push(input.projectId); }
    if (input.domainTrack) { conditions.push(`domain_track = $${idx++}`); params.push(input.domainTrack); }
    if (input.actionState) { conditions.push(`action_state = $${idx++}`); params.push(input.actionState); }
    if (input.recommendationType) { conditions.push(`recommendation_type = $${idx++}`); params.push(input.recommendationType); }

    const limit = input.limit ?? 50;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM decision_records WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC LIMIT $${idx}
    `, params);

    return result.rows.map(this.map);
  }

  async getById(id: string, organizationId: number): Promise<DecisionRecord | null> {
    const result = await pool!.query(
      'SELECT * FROM decision_records WHERE id = $1 AND organization_id = $2', [id, organizationId]
    );
    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async transition(id: string, input: {
    organizationId: number;
    actionState: ActionState;
    performedBy: string;
    reason?: string;
    executedArtifactId?: number;
    executedArtifactVersion?: number;
    executedWorkflowRunId?: string;
  }): Promise<DecisionRecord | null> {
    log.info('Transitioning decision', { id, newState: input.actionState });

    const sets: string[] = ['action_state = $1', 'updated_at = NOW()'];
    const params: (string | number | null)[] = [input.actionState];
    let idx = 2;

    if (input.actionState === 'approved') {
      sets.push(`approved_by = $${idx++}`); params.push(input.performedBy);
      sets.push(`approved_at = NOW()`);
    }
    if (input.actionState === 'rejected') {
      sets.push(`rejection_reason = $${idx++}`); params.push(input.reason ?? null);
    }
    if (input.actionState === 'escalated') {
      sets.push(`escalated_to = $${idx++}`); params.push(input.reason ?? null);
      sets.push(`escalation_reason = $${idx++}`); params.push(input.reason ?? null);
    }
    if (input.executedArtifactId) {
      sets.push(`executed_artifact_id = $${idx++}`); params.push(input.executedArtifactId);
    }
    if (input.executedArtifactVersion) {
      sets.push(`executed_artifact_version = $${idx++}`); params.push(input.executedArtifactVersion);
    }
    if (input.executedWorkflowRunId) {
      sets.push(`executed_workflow_run_id = $${idx++}`); params.push(input.executedWorkflowRunId);
    }

    params.push(id, input.organizationId);

    const result = await pool!.query(`
      UPDATE decision_records SET ${sets.join(', ')}
      WHERE id = $${idx++} AND organization_id = $${idx}
      RETURNING *
    `, params);

    return result.rows.length ? this.map(result.rows[0]) : null;
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
