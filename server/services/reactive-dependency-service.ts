/**
 * Reactive Dependency Service — Sprint 3
 *
 * Turns the governed operating-system layer from passive to reactive.
 * When upstream objects change, downstream objects are marked stale/impacted
 * and consequences auto-trigger when confidence and authority allow.
 *
 * Core capabilities:
 * 1. Dependency registration and querying
 * 2. Staleness propagation on upstream changes
 * 3. Auto-consequence triggering with confidence gating
 * 4. Impact state management for governed objects
 * 5. Propagation audit trail
 *
 * @module server/services/reactive-dependency-service
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('reactive-dependency');

// ─── Types ───────────────────────────────────────────────────────────────────

export type ObjectType = 'assumption' | 'decision' | 'artifact' | 'contradiction' | 'review_thread' | 'workflow_run';
export type LinkType = 'informs' | 'governs' | 'derived_from' | 'depends_on' | 'triggers_update' | 'blocks' | 'invalidates';
export type ImpactLevel = 'critical' | 'high' | 'medium' | 'low';
export type ImpactState = 'unaffected' | 'impacted' | 'stale' | 'requires_review' | 'requires_reapproval' | 'blocked_by_contradiction';

export type TriggerType =
  | 'assumption_created' | 'assumption_updated' | 'assumption_superseded'
  | 'assumption_challenged' | 'assumption_withdrawn'
  | 'decision_approved' | 'decision_rejected' | 'decision_executed'
  | 'decision_escalated' | 'decision_superseded'
  | 'contradiction_created' | 'contradiction_resolved'
  | 'artifact_promoted' | 'artifact_locked';

export type ActionTaken =
  | 'marked_stale' | 'marked_impacted' | 'marked_requires_review'
  | 'marked_requires_reapproval' | 'auto_created_review_thread'
  | 'auto_created_contradiction_memo' | 'auto_superseded_assumption'
  | 'auto_created_risk_signal' | 'notification_sent'
  | 'no_downstream_impact';

export interface GoverningDependency {
  id: string;
  organizationId: number;
  projectId: number;
  sourceType: string;
  sourceId: string;
  sourceLabel: string | null;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  linkType: LinkType;
  impactLevel: ImpactLevel;
  isStale: boolean;
  staleSince: string | null;
  staleReason: string | null;
  staleSourceEvent: string | null;
  targetImpactState: ImpactState;
  resolvedAt: string | null;
  resolvedBy: string | null;
  detectionMethod: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropagationResult {
  triggerType: TriggerType;
  triggerObjectId: string;
  downstreamImpacted: number;
  actions: { objectType: string; objectId: string; action: ActionTaken; autoTriggered: boolean }[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ReactiveDependencyService {

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPENDENCY REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  async registerDependency(input: {
    organizationId: number;
    projectId: number;
    sourceType: string;
    sourceId: string;
    sourceLabel?: string;
    targetType: string;
    targetId: string;
    targetLabel?: string;
    linkType: LinkType;
    impactLevel?: ImpactLevel;
  }): Promise<GoverningDependency> {
    // Avoid duplicates
    const existing = await pool!.query(`
      SELECT id FROM governed_dependencies
      WHERE organization_id = $1 AND source_type = $2 AND source_id = $3
        AND target_type = $4 AND target_id = $5
      LIMIT 1
    `, [input.organizationId, input.sourceType, input.sourceId, input.targetType, input.targetId]);

    if (existing.rows.length > 0) {
      return this.getById(existing.rows[0].id, input.organizationId);
    }

    const result = await pool!.query(`
      INSERT INTO governed_dependencies (
        organization_id, project_id, source_type, source_id, source_label,
        target_type, target_id, target_label, link_type, impact_level
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      input.organizationId, input.projectId, input.sourceType, input.sourceId,
      input.sourceLabel ?? null, input.targetType, input.targetId,
      input.targetLabel ?? null, input.linkType, input.impactLevel ?? 'medium'
    ]);

    return this.mapDep(result.rows[0]);
  }

  async getById(id: string, organizationId: number): Promise<GoverningDependency> {
    const result = await pool!.query(
      'SELECT * FROM governed_dependencies WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return this.mapDep(result.rows[0]);
  }

  /**
   * Find all downstream objects that depend on a given source object
   */
  async getDownstream(organizationId: number, sourceType: string, sourceId: string): Promise<GoverningDependency[]> {
    const result = await pool!.query(`
      SELECT * FROM governed_dependencies
      WHERE organization_id = $1 AND source_type = $2 AND source_id = $3
      ORDER BY impact_level ASC
    `, [organizationId, sourceType, sourceId]);
    return result.rows.map(this.mapDep);
  }

  /**
   * Find all upstream objects that a given target depends on
   */
  async getUpstream(organizationId: number, targetType: string, targetId: string): Promise<GoverningDependency[]> {
    const result = await pool!.query(`
      SELECT * FROM governed_dependencies
      WHERE organization_id = $1 AND target_type = $2 AND target_id = $3
      ORDER BY impact_level ASC
    `, [organizationId, targetType, targetId]);
    return result.rows.map(this.mapDep);
  }

  /**
   * Get all stale dependencies for a project
   */
  async getStale(organizationId: number, projectId: number): Promise<GoverningDependency[]> {
    const result = await pool!.query(`
      SELECT * FROM governed_dependencies
      WHERE organization_id = $1 AND project_id = $2 AND is_stale = true
      ORDER BY CASE impact_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    `, [organizationId, projectId]);
    return result.rows.map(this.mapDep);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STALENESS PROPAGATION (The reactive core)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Propagate impact when an upstream object changes.
   * Marks all downstream dependencies as stale and logs the propagation.
   */
  async propagateChange(input: {
    organizationId: number;
    projectId: number;
    triggerType: TriggerType;
    sourceType: string;
    sourceId: string;
    sourceLabel?: string;
    reason: string;
    triggeredBy?: string;
  }): Promise<PropagationResult> {
    log.info('Propagating change', { trigger: input.triggerType, source: `${input.sourceType}:${input.sourceId}` });

    const downstream = await this.getDownstream(input.organizationId, input.sourceType, input.sourceId);
    const actions: PropagationResult['actions'] = [];

    if (downstream.length === 0) {
      // Log no-impact event
      await this.logPropagation({
        organizationId: input.organizationId,
        projectId: input.projectId,
        triggerType: input.triggerType,
        triggerObjectType: input.sourceType,
        triggerObjectId: input.sourceId,
        triggerObjectLabel: input.sourceLabel,
        actionTaken: 'no_downstream_impact',
        triggeredBy: input.triggeredBy ?? 'system',
      });

      return { triggerType: input.triggerType, triggerObjectId: input.sourceId, downstreamImpacted: 0, actions };
    }

    // Determine impact state based on trigger type
    const impactState = this.determineImpactState(input.triggerType);
    const actionTaken = this.determineAction(impactState);

    for (const dep of downstream) {
      // Mark dependency as stale
      await pool!.query(`
        UPDATE governed_dependencies
        SET is_stale = true, stale_since = NOW(), stale_reason = $1,
            stale_source_event = $2, target_impact_state = $3, updated_at = NOW()
        WHERE id = $4
      `, [input.reason, input.triggerType, impactState, dep.id]);

      actions.push({
        objectType: dep.targetType,
        objectId: dep.targetId,
        action: actionTaken,
        autoTriggered: true,
      });

      // Log each impact
      await this.logPropagation({
        organizationId: input.organizationId,
        projectId: input.projectId,
        triggerType: input.triggerType,
        triggerObjectType: input.sourceType,
        triggerObjectId: input.sourceId,
        triggerObjectLabel: input.sourceLabel,
        actionTaken,
        impactedObjectType: dep.targetType,
        impactedObjectId: dep.targetId,
        impactedObjectLabel: dep.targetLabel,
        dependencyId: dep.id,
        autoTriggered: true,
        triggeredBy: input.triggeredBy ?? 'system',
      });
    }

    return {
      triggerType: input.triggerType,
      triggerObjectId: input.sourceId,
      downstreamImpacted: downstream.length,
      actions,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-CONSEQUENCE TRIGGERING (Part E)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Auto-trigger consequences for contradiction findings when:
   * - confidence is high/definitive
   * - authority state is requires_review or higher
   * - consequence path exists and is supported
   */
  async autoTriggerConsequence(input: {
    organizationId: number;
    projectId: number;
    findingId: string;
    confidenceLevel: string;
    authorityState: string;
    consequenceType: string;
    triggeredBy?: string;
  }): Promise<{ triggered: boolean; reason: string; action?: ActionTaken }> {
    // Confidence gating — only auto-trigger on high+ confidence
    const autoTriggerThreshold = ['definitive', 'high'];
    if (!autoTriggerThreshold.includes(input.confidenceLevel)) {
      return { triggered: false, reason: `Confidence too low for auto-trigger: ${input.confidenceLevel}` };
    }

    // Authority gating — only auto-trigger for actionable states
    const autoTriggerAuthority = ['requires_review', 'requires_approval', 'blocks_promotion', 'requires_escalation'];
    if (!autoTriggerAuthority.includes(input.authorityState)) {
      return { triggered: false, reason: `Authority state is advisory only: ${input.authorityState}` };
    }

    // Execute the consequence
    let action: ActionTaken;
    switch (input.consequenceType) {
      case 'review_thread':
        action = 'auto_created_review_thread';
        break;
      case 'assumption_supersession':
        action = 'auto_superseded_assumption';
        break;
      case 'contradiction_memo':
        action = 'auto_created_contradiction_memo';
        break;
      default:
        return { triggered: false, reason: `No auto-trigger path for consequence type: ${input.consequenceType}` };
    }

    // Log the auto-trigger
    await this.logPropagation({
      organizationId: input.organizationId,
      projectId: input.projectId,
      triggerType: 'contradiction_created',
      triggerObjectType: 'contradiction',
      triggerObjectId: input.findingId,
      actionTaken: action,
      autoTriggered: true,
      confidenceLevel: input.confidenceLevel,
      triggeredBy: input.triggeredBy ?? 'system',
    });

    log.info('Auto-triggered consequence', { findingId: input.findingId, action });
    return { triggered: true, reason: `Auto-triggered: ${action}`, action };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOLVE STALENESS
  // ═══════════════════════════════════════════════════════════════════════════

  async resolveStale(dependencyId: string, organizationId: number, resolvedBy: string): Promise<GoverningDependency | null> {
    const result = await pool!.query(`
      UPDATE governed_dependencies
      SET is_stale = false, target_impact_state = 'unaffected',
          resolved_at = NOW(), resolved_by = $1, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `, [resolvedBy, dependencyId, organizationId]);

    return result.rows.length ? this.mapDep(result.rows[0]) : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECT IMPACT SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  async getProjectImpactSummary(organizationId: number, projectId: number): Promise<{
    totalDependencies: number;
    staleDependencies: number;
    byImpactState: Record<string, number>;
    byObjectType: Record<string, number>;
    recentPropagations: { triggerType: string; triggerObjectId: string; actionTaken: string; createdAt: string }[];
  }> {
    const [depsResult, staleResult, stateResult, typeResult, logResult] = await Promise.all([
      pool!.query('SELECT COUNT(*)::int as count FROM governed_dependencies WHERE organization_id = $1 AND project_id = $2', [organizationId, projectId]),
      pool!.query('SELECT COUNT(*)::int as count FROM governed_dependencies WHERE organization_id = $1 AND project_id = $2 AND is_stale = true', [organizationId, projectId]),
      pool!.query(`
        SELECT target_impact_state, COUNT(*)::int as count
        FROM governed_dependencies WHERE organization_id = $1 AND project_id = $2 AND target_impact_state != 'unaffected'
        GROUP BY target_impact_state
      `, [organizationId, projectId]),
      pool!.query(`
        SELECT target_type, COUNT(*)::int as count
        FROM governed_dependencies WHERE organization_id = $1 AND project_id = $2 AND is_stale = true
        GROUP BY target_type
      `, [organizationId, projectId]),
      pool!.query(`
        SELECT trigger_type, trigger_object_id, action_taken, created_at
        FROM impact_propagation_log WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC LIMIT 10
      `, [organizationId, projectId]),
    ]);

    const byImpactState: Record<string, number> = {};
    for (const row of stateResult.rows) byImpactState[row.target_impact_state] = row.count;

    const byObjectType: Record<string, number> = {};
    for (const row of typeResult.rows) byObjectType[row.target_type] = row.count;

    return {
      totalDependencies: depsResult.rows[0]?.count ?? 0,
      staleDependencies: staleResult.rows[0]?.count ?? 0,
      byImpactState,
      byObjectType,
      recentPropagations: logResult.rows.map(r => ({
        triggerType: r.trigger_type,
        triggerObjectId: r.trigger_object_id,
        actionTaken: r.action_taken,
        createdAt: (r.created_at as Date)?.toISOString() ?? '',
      })),
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private determineImpactState(triggerType: TriggerType): ImpactState {
    switch (triggerType) {
      case 'assumption_superseded':
      case 'assumption_withdrawn':
      case 'decision_rejected':
      case 'decision_superseded':
        return 'stale';

      case 'assumption_updated':
      case 'assumption_challenged':
      case 'decision_escalated':
        return 'requires_review';

      case 'contradiction_created':
        return 'blocked_by_contradiction';

      case 'assumption_created':
      case 'decision_approved':
      case 'decision_executed':
      case 'contradiction_resolved':
        return 'impacted';

      default:
        return 'impacted';
    }
  }

  private determineAction(impactState: ImpactState): ActionTaken {
    switch (impactState) {
      case 'stale': return 'marked_stale';
      case 'requires_review': return 'marked_requires_review';
      case 'requires_reapproval': return 'marked_requires_reapproval';
      case 'blocked_by_contradiction': return 'marked_impacted';
      case 'impacted': return 'marked_impacted';
      default: return 'marked_impacted';
    }
  }

  private async logPropagation(input: {
    organizationId: number;
    projectId: number;
    triggerType: TriggerType;
    triggerObjectType: string;
    triggerObjectId: string;
    triggerObjectLabel?: string;
    actionTaken: ActionTaken;
    impactedObjectType?: string;
    impactedObjectId?: string;
    impactedObjectLabel?: string;
    dependencyId?: string;
    confidenceLevel?: string;
    autoTriggered?: boolean;
    triggeredBy: string;
  }): Promise<void> {
    await pool!.query(`
      INSERT INTO impact_propagation_log (
        organization_id, project_id, trigger_type,
        trigger_object_type, trigger_object_id, trigger_object_label,
        action_taken, impacted_object_type, impacted_object_id,
        impacted_object_label, dependency_id, confidence_level,
        auto_triggered, triggered_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [
      input.organizationId, input.projectId, input.triggerType,
      input.triggerObjectType, input.triggerObjectId, input.triggerObjectLabel ?? null,
      input.actionTaken, input.impactedObjectType ?? null, input.impactedObjectId ?? null,
      input.impactedObjectLabel ?? null, input.dependencyId ?? null,
      input.confidenceLevel ?? null, input.autoTriggered ?? false, input.triggeredBy
    ]);
  }

  private mapDep(row: Record<string, unknown>): GoverningDependency {
    return {
      id: row.id as string,
      organizationId: row.organization_id as number,
      projectId: row.project_id as number,
      sourceType: row.source_type as string,
      sourceId: row.source_id as string,
      sourceLabel: row.source_label as string | null,
      targetType: row.target_type as string,
      targetId: row.target_id as string,
      targetLabel: row.target_label as string | null,
      linkType: row.link_type as LinkType,
      impactLevel: row.impact_level as ImpactLevel,
      isStale: (row.is_stale as boolean) ?? false,
      staleSince: (row.stale_since as Date)?.toISOString() ?? null,
      staleReason: row.stale_reason as string | null,
      staleSourceEvent: row.stale_source_event as string | null,
      targetImpactState: row.target_impact_state as ImpactState,
      resolvedAt: (row.resolved_at as Date)?.toISOString() ?? null,
      resolvedBy: row.resolved_by as string | null,
      detectionMethod: row.detection_method as string,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const reactiveDependencyService = new ReactiveDependencyService();
