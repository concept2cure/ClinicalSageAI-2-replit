/**
 * Assumption Registry Service
 *
 * First-class operating service for structured, project-bound, reusable,
 * reviewable, version-aware assumptions. Every critical assumption becomes
 * queryable, linkable, and auditable.
 *
 * Supports: biostatistics flows, document generation, AnA analysis,
 * contradiction-readiness, and regulator/body overlay compatibility.
 *
 * @module server/services/assumption-registry-service
 */

import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  assumptionRecords,
  assumptionHistory,
  contradictionLinks,
  type AssumptionRecord,
} from '../../shared/schema/operating-system';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateAssumptionInput {
  organizationId: number;
  projectId: number;
  category: AssumptionRecord['category'];
  name: string;
  description?: string;
  valueType?: AssumptionRecord['valueType'];
  numericValue?: number;
  textValue?: string;
  jsonValue?: Record<string, unknown>;
  unit?: string;
  rationale?: string;
  sourceType?: AssumptionRecord['sourceType'];
  sourceArtifactId?: number;
  sourceArtifactVersionId?: number;
  sourceRunId?: string;
  sourceDescription?: string;
  domainTrack?: AssumptionRecord['domainTrack'];
  regulatorBody?: string;
  jurisdiction?: string;
  regulatoryReference?: string;
  confidence?: AssumptionRecord['confidence'];
  linkedArtifactIds?: number[];
  linkedSectionCodes?: string[];
  createdById?: number;
}

export interface UpdateAssumptionInput {
  name?: string;
  description?: string;
  numericValue?: number;
  textValue?: string;
  jsonValue?: Record<string, unknown>;
  unit?: string;
  rationale?: string;
  confidence?: AssumptionRecord['confidence'];
  status?: AssumptionRecord['status'];
  regulatorBody?: string;
  jurisdiction?: string;
  regulatoryReference?: string;
  linkedArtifactIds?: number[];
  linkedArtifactVersionIds?: number[];
  linkedSectionCodes?: string[];
  linkedDecisionIds?: string[];
  updatedById?: number;
  changeReason?: string;
}

export interface AssumptionQueryOptions {
  organizationId: number;
  projectId: number;
  category?: AssumptionRecord['category'];
  status?: AssumptionRecord['status'];
  confidence?: AssumptionRecord['confidence'];
  regulatorBody?: string;
  sourceArtifactId?: number;
  includeSuperseded?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class AssumptionRegistryService {
  private static instance: AssumptionRegistryService;

  static getInstance(): AssumptionRegistryService {
    if (!AssumptionRegistryService.instance) {
      AssumptionRegistryService.instance = new AssumptionRegistryService();
    }
    return AssumptionRegistryService.instance;
  }

  private getDb() {
    if (!db) throw new Error('Database unavailable');
    return db;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────

  async createAssumption(input: CreateAssumptionInput): Promise<AssumptionRecord> {
    const database = this.getDb();

    if (!input.organizationId || !input.projectId) {
      throw new Error('organizationId and projectId are required');
    }
    if (!input.category || !input.name?.trim()) {
      throw new Error('category and name are required');
    }

    const [record] = await database
      .insert(assumptionRecords)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        category: input.category,
        name: input.name,
        description: input.description,
        valueType: input.valueType ?? 'text',
        numericValue: input.numericValue,
        textValue: input.textValue,
        jsonValue: input.jsonValue,
        unit: input.unit,
        rationale: input.rationale,
        sourceType: input.sourceType ?? 'manual',
        sourceArtifactId: input.sourceArtifactId,
        sourceArtifactVersionId: input.sourceArtifactVersionId,
        sourceRunId: input.sourceRunId,
        sourceDescription: input.sourceDescription,
        domainTrack: input.domainTrack,
        regulatorBody: input.regulatorBody,
        jurisdiction: input.jurisdiction,
        regulatoryReference: input.regulatoryReference,
        confidence: input.confidence ?? 'provisional',
        status: 'draft',
        version: 1,
        linkedArtifactIds: input.linkedArtifactIds ?? [],
        linkedSectionCodes: input.linkedSectionCodes ?? [],
        createdById: input.createdById,
        updatedById: input.createdById,
      })
      .returning();

    // Record history
    await this.recordHistory(record, 'created', input.createdById);

    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────────────────

  async getAssumption(id: string, organizationId: number): Promise<AssumptionRecord | null> {
    const database = this.getDb();
    const [record] = await database
      .select()
      .from(assumptionRecords)
      .where(and(
        eq(assumptionRecords.id, id),
        eq(assumptionRecords.organizationId, organizationId)
      ));
    return record ?? null;
  }

  async queryAssumptions(options: AssumptionQueryOptions): Promise<AssumptionRecord[]> {
    const database = this.getDb();

    const conditions = [
      eq(assumptionRecords.organizationId, options.organizationId),
      eq(assumptionRecords.projectId, options.projectId),
    ];

    if (options.category) {
      conditions.push(eq(assumptionRecords.category, options.category));
    }
    if (options.status) {
      conditions.push(eq(assumptionRecords.status, options.status));
    }
    if (options.confidence) {
      conditions.push(eq(assumptionRecords.confidence, options.confidence));
    }
    if (options.regulatorBody) {
      conditions.push(eq(assumptionRecords.regulatorBody, options.regulatorBody));
    }
    if (options.sourceArtifactId) {
      conditions.push(eq(assumptionRecords.sourceArtifactId, options.sourceArtifactId));
    }
    if (!options.includeSuperseded) {
      conditions.push(sql`${assumptionRecords.status} != 'superseded'`);
    }

    return database
      .select()
      .from(assumptionRecords)
      .where(and(...conditions))
      .orderBy(desc(assumptionRecords.updatedAt));
  }

  async getAssumptionsByArtifact(
    artifactId: number,
    organizationId: number
  ): Promise<AssumptionRecord[]> {
    const database = this.getDb();
    return database
      .select()
      .from(assumptionRecords)
      .where(and(
        eq(assumptionRecords.organizationId, organizationId),
        eq(assumptionRecords.sourceArtifactId, artifactId),
        sql`${assumptionRecords.status} != 'superseded'`
      ))
      .orderBy(desc(assumptionRecords.updatedAt));
  }

  async getAssumptionHistory(assumptionId: string, organizationId: number) {
    const database = this.getDb();
    return database
      .select()
      .from(assumptionHistory)
      .where(and(
        eq(assumptionHistory.assumptionId, assumptionId),
        eq(assumptionHistory.organizationId, organizationId)
      ))
      .orderBy(desc(assumptionHistory.createdAt));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────

  async updateAssumption(
    id: string,
    organizationId: number,
    input: UpdateAssumptionInput
  ): Promise<AssumptionRecord> {
    const database = this.getDb();

    const existing = await this.getAssumption(id, organizationId);
    if (!existing) {
      throw new Error(`Assumption ${id} not found`);
    }
    if (existing.status === 'superseded') {
      throw new Error('Cannot update a superseded assumption');
    }
    if (existing.status === 'approved' && input.status !== 'superseded') {
      throw new Error('Cannot modify an approved assumption — supersede it instead');
    }

    // Separate non-DB fields from the update payload
    const { changeReason, ...dbFields } = input;

    const [updated] = await database
      .update(assumptionRecords)
      .set({
        ...dbFields,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(
        eq(assumptionRecords.id, id),
        eq(assumptionRecords.organizationId, organizationId)
      ))
      .returning();

    await this.recordHistory(updated, 'updated', input.updatedById, changeReason);

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  async reviewAssumption(
    id: string,
    organizationId: number,
    reviewerId: number
  ): Promise<AssumptionRecord> {
    const database = this.getDb();
    const existing = await this.getAssumption(id, organizationId);
    if (!existing) throw new Error(`Assumption ${id} not found`);
    if (existing.status !== 'draft') {
      throw new Error(`Cannot review assumption in status: ${existing.status}`);
    }

    const [updated] = await database
      .update(assumptionRecords)
      .set({
        status: 'review',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        updatedById: reviewerId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(assumptionRecords.id, id),
        eq(assumptionRecords.organizationId, organizationId)
      ))
      .returning();

    await this.recordHistory(updated, 'reviewed', reviewerId);
    return updated;
  }

  async approveAssumption(
    id: string,
    organizationId: number,
    approverId: number
  ): Promise<AssumptionRecord> {
    const database = this.getDb();
    const existing = await this.getAssumption(id, organizationId);
    if (!existing) throw new Error(`Assumption ${id} not found`);
    if (existing.status !== 'review') {
      throw new Error(`Cannot approve assumption in status: ${existing.status}. Must be in review.`);
    }

    const [updated] = await database
      .update(assumptionRecords)
      .set({
        status: 'approved',
        confidence: 'strong',
        approvedById: approverId,
        approvedAt: new Date(),
        updatedById: approverId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(assumptionRecords.id, id),
        eq(assumptionRecords.organizationId, organizationId)
      ))
      .returning();

    await this.recordHistory(updated, 'approved', approverId);
    return updated;
  }

  async rejectAssumption(
    id: string,
    organizationId: number,
    rejectorId: number,
    reason: string
  ): Promise<AssumptionRecord> {
    const database = this.getDb();
    const existing = await this.getAssumption(id, organizationId);
    if (!existing) throw new Error(`Assumption ${id} not found`);
    if (existing.status === 'superseded') {
      throw new Error('Cannot reject a superseded assumption');
    }
    if (existing.status === 'rejected') {
      throw new Error('Assumption is already rejected');
    }

    const [updated] = await database
      .update(assumptionRecords)
      .set({
        status: 'rejected',
        rejectedById: rejectorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedById: rejectorId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(assumptionRecords.id, id),
        eq(assumptionRecords.organizationId, organizationId)
      ))
      .returning();

    await this.recordHistory(updated, 'rejected', rejectorId, reason);
    return updated;
  }

  async supersedeAssumption(
    id: string,
    organizationId: number,
    newAssumptionInput: CreateAssumptionInput,
    reason: string
  ): Promise<{ superseded: AssumptionRecord; replacement: AssumptionRecord }> {
    const database = this.getDb();
    const existing = await this.getAssumption(id, organizationId);
    if (!existing) throw new Error(`Assumption ${id} not found`);
    if (existing.status === 'superseded') {
      throw new Error('Assumption is already superseded');
    }

    // Create replacement
    const replacement = await this.createAssumption({
      ...newAssumptionInput,
      linkedArtifactIds: existing.linkedArtifactIds as number[] ?? [],
      linkedSectionCodes: existing.linkedSectionCodes as string[] ?? [],
    });

    // Supersede the old one
    const [superseded] = await database
      .update(assumptionRecords)
      .set({
        status: 'superseded',
        supersededById: replacement.id,
        supersessionReason: reason,
        updatedAt: new Date(),
        updatedById: newAssumptionInput.createdById,
      })
      .where(and(
        eq(assumptionRecords.id, id),
        eq(assumptionRecords.organizationId, organizationId)
      ))
      .returning();

    await this.recordHistory(superseded, 'superseded', newAssumptionInput.createdById, reason);

    return { superseded, replacement };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LINKAGE
  // ─────────────────────────────────────────────────────────────────────────

  async linkToArtifact(
    assumptionId: string,
    organizationId: number,
    artifactId: number,
    artifactVersionId?: number
  ): Promise<AssumptionRecord> {
    const database = this.getDb();
    const existing = await this.getAssumption(assumptionId, organizationId);
    if (!existing) throw new Error(`Assumption ${assumptionId} not found`);

    const currentIds = (existing.linkedArtifactIds as number[]) ?? [];
    const currentVersionIds = (existing.linkedArtifactVersionIds as number[]) ?? [];

    if (!currentIds.includes(artifactId)) {
      currentIds.push(artifactId);
    }
    if (artifactVersionId && !currentVersionIds.includes(artifactVersionId)) {
      currentVersionIds.push(artifactVersionId);
    }

    const [updated] = await database
      .update(assumptionRecords)
      .set({
        linkedArtifactIds: currentIds,
        linkedArtifactVersionIds: currentVersionIds,
        updatedAt: new Date(),
      })
      .where(and(
        eq(assumptionRecords.id, assumptionId),
        eq(assumptionRecords.organizationId, organizationId)
      ))
      .returning();

    return updated;
  }

  async linkToDecision(
    assumptionId: string,
    organizationId: number,
    decisionId: string
  ): Promise<AssumptionRecord> {
    const database = this.getDb();
    const existing = await this.getAssumption(assumptionId, organizationId);
    if (!existing) throw new Error(`Assumption ${assumptionId} not found`);

    const currentDecisionIds = (existing.linkedDecisionIds as string[]) ?? [];
    if (!currentDecisionIds.includes(decisionId)) {
      currentDecisionIds.push(decisionId);
    }

    const [updated] = await database
      .update(assumptionRecords)
      .set({
        linkedDecisionIds: currentDecisionIds,
        updatedAt: new Date(),
      })
      .where(and(
        eq(assumptionRecords.id, assumptionId),
        eq(assumptionRecords.organizationId, organizationId)
      ))
      .returning();

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTRADICTION READINESS
  // ─────────────────────────────────────────────────────────────────────────

  async createContradictionLink(
    organizationId: number,
    projectId: number,
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string,
    comparisonType: string,
    options?: {
      sourceLabel?: string;
      targetLabel?: string;
      fieldPath?: string;
      domainTrack?: string;
      regulatorBody?: string;
      sectionCodes?: string[];
      createdById?: number;
    }
  ) {
    const database = this.getDb();
    const [link] = await database
      .insert(contradictionLinks)
      .values({
        organizationId,
        projectId,
        sourceType,
        sourceId,
        targetType,
        targetId,
        comparisonType,
        sourceLabel: options?.sourceLabel,
        targetLabel: options?.targetLabel,
        fieldPath: options?.fieldPath,
        domainTrack: options?.domainTrack as any,
        regulatorBody: options?.regulatorBody,
        sectionCodes: options?.sectionCodes ?? [],
        createdById: options?.createdById,
      })
      .returning();
    return link;
  }

  async getContradictionLinks(projectId: number, organizationId: number) {
    const database = this.getDb();
    return database
      .select()
      .from(contradictionLinks)
      .where(and(
        eq(contradictionLinks.organizationId, organizationId),
        eq(contradictionLinks.projectId, projectId),
        eq(contradictionLinks.isActive, true)
      ))
      .orderBy(desc(contradictionLinks.createdAt));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────────────────

  private async recordHistory(
    record: AssumptionRecord,
    action: string,
    userId?: number | null,
    reason?: string
  ) {
    const database = this.getDb();
    await database.insert(assumptionHistory).values({
      assumptionId: record.id,
      organizationId: record.organizationId,
      version: record.version,
      category: record.category,
      name: record.name,
      valueType: record.valueType,
      numericValue: record.numericValue,
      textValue: record.textValue,
      jsonValue: record.jsonValue as Record<string, unknown> | undefined,
      unit: record.unit,
      rationale: record.rationale,
      confidence: record.confidence,
      status: record.status,
      regulatorBody: record.regulatorBody,
      jurisdiction: record.jurisdiction,
      changeAction: action,
      changeReason: reason,
      changedById: userId,
    });
  }
}
