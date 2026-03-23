/**
 * Assumption Registry Service
 *
 * Part 1: Makes critical assumptions explicit, structured, project-bound,
 * reviewable, traceable, and reusable across the platform.
 *
 * Assumptions are first-class governed objects with:
 * - Project binding and artifact linkage
 * - Source attribution and confidence
 * - Domain track and regulator compatibility
 * - Status lifecycle: active → under_review → superseded/withdrawn/challenged
 * - Multi-tenant enforcement via organization_id
 *
 * @module server/services/assumption-registry-service
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('assumption-registry');

// ─── Types ───────────────────────────────────────────────────────────────────

export type DomainTrack = 'clinical' | 'nonclinical' | 'cmc' | 'biostatistics' | 'regulatory'
  | 'pharmacology' | 'safety' | 'labeling' | 'commercial';

export type AssumptionCategory =
  | 'efficacy' | 'safety' | 'statistical' | 'design' | 'population'
  | 'endpoint' | 'dosing' | 'manufacturing' | 'regulatory_pathway'
  | 'comparator' | 'dropout' | 'missing_data' | 'effect_size'
  | 'prevalence' | 'enrollment' | 'timeline' | 'cost';

export type ConfidenceLevel = 'definitive' | 'high' | 'moderate' | 'low' | 'speculative';

export type AssumptionStatus = 'active' | 'under_review' | 'superseded' | 'withdrawn' | 'challenged';

export type SourceType = 'protocol' | 'sap' | 'literature' | 'precedent' | 'expert_opinion'
  | 'regulatory_guidance' | 'historical_data' | 'modeling' | 'sponsor_decision';

export interface AssumptionRecord {
  id: string;
  organizationId: number;
  projectId: number;
  assumptionCode: string;
  title: string;
  domainTrack: DomainTrack;
  category: AssumptionCategory;
  assumedValue: string;
  unit: string | null;
  rationale: string;
  sourceType: SourceType;
  sourceReference: string | null;
  confidenceLevel: ConfidenceLevel;
  applicableRegulators: string[];
  linkedArtifactId: number | null;
  linkedArtifactVersion: number | null;
  linkedSectionCode: string | null;
  status: AssumptionStatus;
  supersededBy: string | null;
  supersessionReason: string | null;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssumptionInput {
  organizationId: number;
  projectId: number;
  assumptionCode: string;
  title: string;
  domainTrack: DomainTrack;
  category: AssumptionCategory;
  assumedValue: string;
  unit?: string;
  rationale: string;
  sourceType: SourceType;
  sourceReference?: string;
  confidenceLevel?: ConfidenceLevel;
  applicableRegulators?: string[];
  linkedArtifactId?: number;
  linkedArtifactVersion?: number;
  linkedSectionCode?: string;
  createdBy: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class AssumptionRegistryService {

  async create(input: CreateAssumptionInput): Promise<AssumptionRecord> {
    log.info('Creating assumption', { code: input.assumptionCode, project: input.projectId });

    const result = await pool!.query(`
      INSERT INTO assumption_records (
        organization_id, project_id, assumption_code, title, domain_track,
        category, assumed_value, unit, rationale,
        source_type, source_reference, confidence_level,
        applicable_regulators, linked_artifact_id, linked_artifact_version,
        linked_section_code, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      input.organizationId, input.projectId, input.assumptionCode, input.title,
      input.domainTrack, input.category, input.assumedValue, input.unit ?? null,
      input.rationale, input.sourceType, input.sourceReference ?? null,
      input.confidenceLevel ?? 'moderate', input.applicableRegulators ?? [],
      input.linkedArtifactId ?? null, input.linkedArtifactVersion ?? null,
      input.linkedSectionCode ?? null, input.createdBy
    ]);

    const record = this.map(result.rows[0]);

    // Auto-detect assumption drift after creation
    // Runs async — does not block the create response
    this.triggerDriftDetection(input.organizationId, input.projectId).catch(err => {
      log.warn('Assumption drift detection failed (non-blocking)', { error: err instanceof Error ? err.message : String(err) });
    });

    return record;
  }

  /**
   * Trigger assumption drift detection for a project.
   * Called automatically after assumption creation/update.
   */
  private async triggerDriftDetection(organizationId: number, projectId: number): Promise<void> {
    try {
      const { contradictionEngineService } = await import('./contradiction-engine-service');
      const findings = await contradictionEngineService.detectAssumptionDrift(organizationId, projectId);
      if (findings.length > 0) {
        log.info('Assumption drift detected', { projectId, count: findings.length });
      }
    } catch {
      // Contradiction engine may not have tables yet — silently skip
    }
  }

  async search(input: {
    organizationId: number;
    projectId?: number;
    domainTrack?: DomainTrack;
    category?: AssumptionCategory;
    status?: AssumptionStatus;
    linkedArtifactId?: number;
    limit?: number;
  }): Promise<AssumptionRecord[]> {
    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let idx = 2;

    if (input.projectId) { conditions.push(`project_id = $${idx++}`); params.push(input.projectId); }
    if (input.domainTrack) { conditions.push(`domain_track = $${idx++}`); params.push(input.domainTrack); }
    if (input.category) { conditions.push(`category = $${idx++}`); params.push(input.category); }
    if (input.status) { conditions.push(`status = $${idx++}`); params.push(input.status); }
    if (input.linkedArtifactId) { conditions.push(`linked_artifact_id = $${idx++}`); params.push(input.linkedArtifactId); }

    const limit = input.limit ?? 50;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM assumption_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${idx}
    `, params);

    return result.rows.map(this.map);
  }

  async getById(id: string, organizationId: number): Promise<AssumptionRecord | null> {
    const result = await pool!.query(
      'SELECT * FROM assumption_records WHERE id = $1 AND organization_id = $2', [id, organizationId]
    );
    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async supersede(id: string, input: {
    organizationId: number;
    replacementId: string;
    reason: string;
    performedBy: string;
  }): Promise<AssumptionRecord | null> {
    log.info('Superseding assumption', { id, replacementId: input.replacementId });

    const result = await pool!.query(`
      UPDATE assumption_records
      SET status = 'superseded', superseded_by = $1, supersession_reason = $2, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `, [input.replacementId, input.reason, id, input.organizationId]);

    const record = result.rows.length ? this.map(result.rows[0]) : null;

    // Reactive propagation: mark downstream objects stale
    if (record) {
      this.propagateChange(record, 'assumption_superseded', input.reason).catch(err => {
        log.warn('Reactive propagation failed (non-blocking)', { error: err instanceof Error ? err.message : String(err) });
      });
    }

    return record;
  }

  /**
   * Propagate assumption change to downstream dependencies.
   * Marks linked artifacts/decisions as stale.
   */
  private async propagateChange(assumption: AssumptionRecord, triggerType: 'assumption_superseded' | 'assumption_updated' | 'assumption_challenged' | 'assumption_withdrawn', reason: string): Promise<void> {
    try {
      const { reactiveDependencyService } = await import('./reactive-dependency-service');
      await reactiveDependencyService.propagateChange({
        organizationId: assumption.organizationId,
        projectId: assumption.projectId,
        triggerType,
        sourceType: 'assumption',
        sourceId: assumption.id,
        sourceLabel: assumption.title,
        reason,
      });
    } catch {
      // Reactive service may not have tables yet — silently skip
    }
  }

  async updateStatus(id: string, organizationId: number, status: AssumptionStatus, reviewedBy?: string): Promise<AssumptionRecord | null> {
    const result = await pool!.query(`
      UPDATE assumption_records
      SET status = $1, reviewed_by = $2, reviewed_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE reviewed_at END, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `, [status, reviewedBy ?? null, id, organizationId]);

    return result.rows.length ? this.map(result.rows[0]) : null;
  }

  async getByProject(organizationId: number, projectId: number): Promise<{
    total: number;
    byDomain: Record<string, number>;
    byStatus: Record<string, number>;
    active: AssumptionRecord[];
  }> {
    const all = await this.search({ organizationId, projectId, limit: 200 });
    const byDomain: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const a of all) {
      byDomain[a.domainTrack] = (byDomain[a.domainTrack] ?? 0) + 1;
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    }

    return {
      total: all.length,
      byDomain,
      byStatus,
      active: all.filter(a => a.status === 'active'),
    };
  }

  private map(row: Record<string, unknown>): AssumptionRecord {
    return {
      id: row.id as string,
      organizationId: row.organization_id as number,
      projectId: row.project_id as number,
      assumptionCode: row.assumption_code as string,
      title: row.title as string,
      domainTrack: row.domain_track as DomainTrack,
      category: row.category as AssumptionCategory,
      assumedValue: row.assumed_value as string,
      unit: row.unit as string | null,
      rationale: row.rationale as string,
      sourceType: row.source_type as SourceType,
      sourceReference: row.source_reference as string | null,
      confidenceLevel: row.confidence_level as ConfidenceLevel,
      applicableRegulators: (row.applicable_regulators as string[]) ?? [],
      linkedArtifactId: row.linked_artifact_id as number | null,
      linkedArtifactVersion: row.linked_artifact_version as number | null,
      linkedSectionCode: row.linked_section_code as string | null,
      status: row.status as AssumptionStatus,
      supersededBy: row.superseded_by as string | null,
      supersessionReason: row.supersession_reason as string | null,
      createdBy: row.created_by as string,
      reviewedBy: row.reviewed_by as string | null,
      reviewedAt: (row.reviewed_at as Date)?.toISOString() ?? null,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const assumptionRegistryService = new AssumptionRegistryService();
