/**
 * Decision Record Service
 *
 * Formal decision architecture: analysis → judgment → recommendation →
 * confidence → action → approval → supersession.
 *
 * Every material decision becomes queryable and auditable.
 * Supports regulatory flows, biostatistics flows, and governed artifact paths.
 *
 * @module server/services/decision-record-service
 */

import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  decisionRecords,
  assumptionRecords,
  contradictionLinks,
  type DecisionRecord,
} from '../../shared/schema/operating-system';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateDecisionInput {
  organizationId: number;
  projectId: number;
  contextType: DecisionRecord['contextType'];
  contextDescription?: string;
  relatedArtifactId?: number;
  relatedArtifactVersionId?: number;
  relatedRunId?: string;
  relatedAssumptionIds?: string[];
  recommendationType?: string;
  recommendationSummary: string;
  recommendationDetail?: string;
  confidence: DecisionRecord['confidence'];
  evidenceSources?: string[];
  actionState?: DecisionRecord['actionState'];
  actionDescription?: string;
  approvalState?: DecisionRecord['approvalState'];
  domainTrack?: DecisionRecord['domainTrack'];
  regulatorBody?: string;
  jurisdiction?: string;
  regulatoryReference?: string;
  governanceBoundary?: DecisionRecord['governanceBoundary'];
  linkedSectionCodes?: string[];
  linkedAssumptionIds?: string[];
  notes?: string;
  provenance?: Record<string, unknown>;
  createdById?: number;
}

export interface UpdateDecisionInput {
  actionState?: DecisionRecord['actionState'];
  actionDescription?: string;
  approvalState?: DecisionRecord['approvalState'];
  escalationState?: DecisionRecord['escalationState'];
  escalationReason?: string;
  executedArtifactId?: number;
  executedArtifactVersionId?: number;
  confidence?: DecisionRecord['confidence'];
  governanceBoundary?: DecisionRecord['governanceBoundary'];
  notes?: string;
  updatedById?: number;
}

export interface DecisionQueryOptions {
  organizationId: number;
  projectId: number;
  contextType?: DecisionRecord['contextType'];
  actionState?: DecisionRecord['actionState'];
  approvalState?: DecisionRecord['approvalState'];
  confidence?: DecisionRecord['confidence'];
  governanceBoundary?: DecisionRecord['governanceBoundary'];
  regulatorBody?: string;
  relatedArtifactId?: number;
  includeSuperseded?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class DecisionRecordService {
  private static instance: DecisionRecordService;

  static getInstance(): DecisionRecordService {
    if (!DecisionRecordService.instance) {
      DecisionRecordService.instance = new DecisionRecordService();
    }
    return DecisionRecordService.instance;
  }

  private getDb() {
    if (!db) throw new Error('Database unavailable');
    return db;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────

  async createDecision(input: CreateDecisionInput): Promise<DecisionRecord> {
    const database = this.getDb();

    if (!input.organizationId || !input.projectId) {
      throw new Error('organizationId and projectId are required');
    }
    if (!input.contextType || !input.recommendationSummary) {
      throw new Error('contextType and recommendationSummary are required');
    }

    const [record] = await database
      .insert(decisionRecords)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        contextType: input.contextType,
        contextDescription: input.contextDescription,
        relatedArtifactId: input.relatedArtifactId,
        relatedArtifactVersionId: input.relatedArtifactVersionId,
        relatedRunId: input.relatedRunId,
        relatedAssumptionIds: input.relatedAssumptionIds ?? [],
        recommendationType: input.recommendationType,
        recommendationSummary: input.recommendationSummary,
        recommendationDetail: input.recommendationDetail,
        confidence: input.confidence,
        evidenceSources: input.evidenceSources ?? [],
        actionState: input.actionState ?? 'recommended_only',
        actionDescription: input.actionDescription,
        approvalState: input.approvalState ?? 'not_required',
        domainTrack: input.domainTrack,
        regulatorBody: input.regulatorBody,
        jurisdiction: input.jurisdiction,
        regulatoryReference: input.regulatoryReference,
        governanceBoundary: input.governanceBoundary ?? 'advisory',
        linkedSectionCodes: input.linkedSectionCodes ?? [],
        linkedAssumptionIds: input.linkedAssumptionIds ?? [],
        notes: input.notes,
        provenance: input.provenance,
        createdById: input.createdById,
        updatedById: input.createdById,
      })
      .returning();

    // Cross-link related assumptions
    if (input.relatedAssumptionIds?.length) {
      for (const assumptionId of input.relatedAssumptionIds) {
        try {
          const [assumption] = await database
            .select()
            .from(assumptionRecords)
            .where(eq(assumptionRecords.id, assumptionId));

          if (assumption) {
            const currentDecisionIds = (assumption.linkedDecisionIds as string[]) ?? [];
            if (!currentDecisionIds.includes(record.id)) {
              currentDecisionIds.push(record.id);
              await database
                .update(assumptionRecords)
                .set({ linkedDecisionIds: currentDecisionIds, updatedAt: new Date() })
                .where(eq(assumptionRecords.id, assumptionId));
            }
          }
        } catch {
          // Non-fatal — assumption may not exist
        }
      }
    }

    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────────────────

  async getDecision(id: string, organizationId: number): Promise<DecisionRecord | null> {
    const database = this.getDb();
    const [record] = await database
      .select()
      .from(decisionRecords)
      .where(and(
        eq(decisionRecords.id, id),
        eq(decisionRecords.organizationId, organizationId)
      ));
    return record ?? null;
  }

  async queryDecisions(options: DecisionQueryOptions): Promise<DecisionRecord[]> {
    const database = this.getDb();

    const conditions = [
      eq(decisionRecords.organizationId, options.organizationId),
      eq(decisionRecords.projectId, options.projectId),
    ];

    if (options.contextType) {
      conditions.push(eq(decisionRecords.contextType, options.contextType));
    }
    if (options.actionState) {
      conditions.push(eq(decisionRecords.actionState, options.actionState));
    }
    if (options.approvalState) {
      conditions.push(eq(decisionRecords.approvalState, options.approvalState));
    }
    if (options.confidence) {
      conditions.push(eq(decisionRecords.confidence, options.confidence));
    }
    if (options.governanceBoundary) {
      conditions.push(eq(decisionRecords.governanceBoundary, options.governanceBoundary));
    }
    if (options.regulatorBody) {
      conditions.push(eq(decisionRecords.regulatorBody, options.regulatorBody));
    }
    if (options.relatedArtifactId) {
      conditions.push(eq(decisionRecords.relatedArtifactId, options.relatedArtifactId));
    }
    if (!options.includeSuperseded) {
      conditions.push(sql`${decisionRecords.actionState} != 'superseded'`);
    }

    return database
      .select()
      .from(decisionRecords)
      .where(and(...conditions))
      .orderBy(desc(decisionRecords.updatedAt));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  async executeDecision(
    id: string,
    organizationId: number,
    executedArtifactId: number,
    executedArtifactVersionId?: number,
    executorId?: number,
    actionDescription?: string
  ): Promise<DecisionRecord> {
    const database = this.getDb();
    const existing = await this.getDecision(id, organizationId);
    if (!existing) throw new Error(`Decision ${id} not found`);

    if (existing.actionState === 'executed') {
      throw new Error('Decision is already executed');
    }
    if (existing.actionState === 'superseded') {
      throw new Error('Cannot execute a superseded decision');
    }

    // Check approval gate
    if (existing.approvalState === 'pending_review') {
      throw new Error('Decision requires approval before execution. Approval state: pending_review');
    }
    if (existing.approvalState === 'rejected') {
      throw new Error('Decision was rejected and cannot be executed');
    }

    const [updated] = await database
      .update(decisionRecords)
      .set({
        actionState: 'executed',
        actionDescription: actionDescription ?? existing.actionDescription,
        executedArtifactId,
        executedArtifactVersionId,
        governanceBoundary: 'governed_draft',
        updatedById: executorId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(decisionRecords.id, id),
        eq(decisionRecords.organizationId, organizationId)
      ))
      .returning();

    return updated;
  }

  async approveDecision(
    id: string,
    organizationId: number,
    approverId: number
  ): Promise<DecisionRecord> {
    const database = this.getDb();
    const existing = await this.getDecision(id, organizationId);
    if (!existing) throw new Error(`Decision ${id} not found`);

    if (existing.approvalState !== 'pending_review') {
      throw new Error(`Cannot approve decision with approval state: ${existing.approvalState}`);
    }

    const [updated] = await database
      .update(decisionRecords)
      .set({
        approvalState: 'approved',
        approvedById: approverId,
        approvedAt: new Date(),
        updatedById: approverId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(decisionRecords.id, id),
        eq(decisionRecords.organizationId, organizationId)
      ))
      .returning();

    return updated;
  }

  async rejectDecision(
    id: string,
    organizationId: number,
    rejectorId: number,
    reason: string
  ): Promise<DecisionRecord> {
    const database = this.getDb();
    const existing = await this.getDecision(id, organizationId);
    if (!existing) throw new Error(`Decision ${id} not found`);

    const [updated] = await database
      .update(decisionRecords)
      .set({
        actionState: 'rejected',
        approvalState: 'rejected',
        rejectedById: rejectorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedById: rejectorId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(decisionRecords.id, id),
        eq(decisionRecords.organizationId, organizationId)
      ))
      .returning();

    return updated;
  }

  async escalateDecision(
    id: string,
    organizationId: number,
    reason: string,
    userId?: number
  ): Promise<DecisionRecord> {
    const database = this.getDb();
    const existing = await this.getDecision(id, organizationId);
    if (!existing) throw new Error(`Decision ${id} not found`);

    const [updated] = await database
      .update(decisionRecords)
      .set({
        escalationState: 'opened',
        escalationReason: reason,
        updatedById: userId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(decisionRecords.id, id),
        eq(decisionRecords.organizationId, organizationId)
      ))
      .returning();

    return updated;
  }

  async supersedeDecision(
    id: string,
    organizationId: number,
    newDecisionInput: CreateDecisionInput,
    reason: string
  ): Promise<{ superseded: DecisionRecord; replacement: DecisionRecord }> {
    const database = this.getDb();
    const existing = await this.getDecision(id, organizationId);
    if (!existing) throw new Error(`Decision ${id} not found`);

    // Create replacement
    const replacement = await this.createDecision(newDecisionInput);

    // Supersede old
    const [superseded] = await database
      .update(decisionRecords)
      .set({
        actionState: 'superseded',
        supersededById: replacement.id,
        supersessionReason: reason,
        updatedById: newDecisionInput.createdById,
        updatedAt: new Date(),
      })
      .where(and(
        eq(decisionRecords.id, id),
        eq(decisionRecords.organizationId, organizationId)
      ))
      .returning();

    return { superseded, replacement };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GOVERNANCE BOUNDARY ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check whether a decision's governance boundary allows execution.
   * advisory decisions can inform but not directly produce governed output.
   */
  validateGovernanceBoundary(decision: DecisionRecord): {
    canExecute: boolean;
    reason: string;
  } {
    if (decision.governanceBoundary === 'advisory') {
      if (decision.confidence === 'uncertain' || decision.confidence === 'provisional') {
        return {
          canExecute: false,
          reason: 'Advisory decision with provisional/uncertain confidence cannot be directly executed. Requires review upgrade.',
        };
      }
    }

    if (decision.approvalState === 'pending_review') {
      return {
        canExecute: false,
        reason: 'Decision is pending review and cannot be executed until approved.',
      };
    }

    if (decision.approvalState === 'rejected') {
      return {
        canExecute: false,
        reason: 'Decision has been rejected.',
      };
    }

    return { canExecute: true, reason: 'Decision meets governance requirements.' };
  }
}
