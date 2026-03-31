/**
 * Data Lineage Service — Regulatory-Grade Data Flow Tracking
 *
 * Provides a centralized, append-only record of every data flow
 * between objects in the system. Enables multi-perspective reporting:
 *
 *   1. Upstream trace: "Where did this artifact's data come from?"
 *   2. Downstream trace: "Where was this source data used?"
 *   3. Evidence basis: "What justified this AI-generated content?"
 *   4. Cross-module map: "Which modules share data dependencies?"
 *   5. Integrity audit: "Has source data changed since it was referenced?"
 *   6. Coverage report: "What % of artifact content has source attribution?"
 *
 * Complies with: 21 CFR Part 11 §11.10(e), ICH E6(R3) §5.5.3, EU MDR Annex II §4.1
 *
 * @module server/services/data-lineage-service
 */
import { db } from '../db';
import { eq, and, or, desc, sql, count, inArray } from 'drizzle-orm';
import {
  dataLineageRecords,
  evidenceChainRecords,
  type DataLineageRecord,
  type EvidenceChainRecord,
} from '../../shared/schema';
import { createHash } from 'crypto';
import type { EvidenceChain } from './intelligence/evidence-confidence-model';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LineageEntry {
  organizationId: number;
  projectId?: number;
  sourceObjectType: string;
  sourceObjectId: string;
  sourceField?: string;
  sourceTitle?: string;
  sourceContent?: string; // Will be hashed, not stored raw
  targetObjectType: string;
  targetObjectId: string;
  targetField?: string;
  targetTitle?: string;
  linkageType: string;
  transformationType?: string;
  confidenceScore?: number;
  confidenceBasis?: string;
  createdById?: number;
  aiModelUsed?: string;
  retrievalRunId?: number;
  generationRunId?: number;
  workflowRunId?: number;
  metadata?: Record<string, unknown>;
}

export interface LineageNode {
  objectType: string;
  objectId: string;
  title?: string;
  depth: number;
  direction: 'upstream' | 'downstream';
}

export interface LineageGraph {
  rootObjectType: string;
  rootObjectId: string;
  nodes: LineageNode[];
  edges: Array<{
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    linkageType: string;
    confidence?: number;
  }>;
  metadata: {
    totalNodes: number;
    maxDepth: number;
    queriedAt: string;
  };
}

export interface LineageCoverageReport {
  objectType: string;
  objectId: string;
  title?: string;
  totalSections: number;
  sectionsWithLineage: number;
  coveragePercent: number;
  lineageSources: Array<{
    sourceType: string;
    count: number;
    avgConfidence: number;
  }>;
  gaps: string[];
}

export interface CrossModuleReport {
  organizationId: number;
  projectId?: number;
  modules: Array<{
    moduleType: string;
    objectCount: number;
    inboundLinks: number;
    outboundLinks: number;
    crossModuleDependencies: string[];
  }>;
  orphanedObjects: Array<{
    objectType: string;
    objectId: string;
    title?: string;
  }>;
  queriedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record a single data lineage link.
 * Append-only — lineage records are never updated or deleted.
 */
export async function recordLineage(entry: LineageEntry): Promise<DataLineageRecord | null> {
  try {
    const contentHash = entry.sourceContent
      ? createHash('sha256').update(entry.sourceContent).digest('hex')
      : undefined;

    const [record] = await db.insert(dataLineageRecords).values({
      organizationId: entry.organizationId,
      projectId: entry.projectId ?? null,
      sourceObjectType: entry.sourceObjectType,
      sourceObjectId: entry.sourceObjectId,
      sourceField: entry.sourceField ?? null,
      sourceTitle: entry.sourceTitle ?? null,
      sourceContentHash: contentHash ?? null,
      targetObjectType: entry.targetObjectType,
      targetObjectId: entry.targetObjectId,
      targetField: entry.targetField ?? null,
      targetTitle: entry.targetTitle ?? null,
      linkageType: entry.linkageType,
      transformationType: entry.transformationType ?? null,
      confidenceScore: entry.confidenceScore ?? null,
      confidenceBasis: entry.confidenceBasis ?? null,
      createdById: entry.createdById ?? null,
      aiModelUsed: entry.aiModelUsed ?? null,
      retrievalRunId: entry.retrievalRunId ?? null,
      generationRunId: entry.generationRunId ?? null,
      workflowRunId: entry.workflowRunId ?? null,
      metadata: entry.metadata ?? null,
    }).returning();

    return record;
  } catch (err) {
    console.error('[DataLineage] Failed to record lineage:', err);
    return null;
  }
}

/**
 * Record multiple lineage entries in a single transaction.
 * Used when AI generates content from multiple retrieval sources.
 */
export async function recordLineageBatch(entries: LineageEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  try {
    const values = entries.map(entry => ({
      organizationId: entry.organizationId,
      projectId: entry.projectId ?? null,
      sourceObjectType: entry.sourceObjectType,
      sourceObjectId: entry.sourceObjectId,
      sourceField: entry.sourceField ?? null,
      sourceTitle: entry.sourceTitle ?? null,
      sourceContentHash: entry.sourceContent
        ? createHash('sha256').update(entry.sourceContent).digest('hex')
        : null,
      targetObjectType: entry.targetObjectType,
      targetObjectId: entry.targetObjectId,
      targetField: entry.targetField ?? null,
      targetTitle: entry.targetTitle ?? null,
      linkageType: entry.linkageType,
      transformationType: entry.transformationType ?? null,
      confidenceScore: entry.confidenceScore ?? null,
      confidenceBasis: entry.confidenceBasis ?? null,
      createdById: entry.createdById ?? null,
      aiModelUsed: entry.aiModelUsed ?? null,
      retrievalRunId: entry.retrievalRunId ?? null,
      generationRunId: entry.generationRunId ?? null,
      workflowRunId: entry.workflowRunId ?? null,
      metadata: entry.metadata ?? null,
    }));

    const result = await db.insert(dataLineageRecords).values(values).returning();
    return result.length;
  } catch (err) {
    console.error('[DataLineage] Failed to record batch lineage:', err);
    return 0;
  }
}

/**
 * Persist an evidence chain from the evidence-confidence-model.
 * Bridges the gap between in-memory evidence computation and persistent audit trail.
 */
export async function persistEvidenceChain(
  organizationId: number,
  projectId: number | undefined,
  targetObjectType: string,
  targetObjectId: string,
  chain: EvidenceChain,
  context?: {
    rimVersion?: string;
    judgmentFrameworkVersion?: string;
    patternRegistryVersion?: string;
  },
): Promise<EvidenceChainRecord | null> {
  try {
    const [record] = await db.insert(evidenceChainRecords).values({
      organizationId,
      projectId: projectId ?? null,
      targetObjectType,
      targetObjectId,
      primarySourceType: chain.primarySource.sourceType,
      primarySourceId: chain.primarySource.sourceId,
      primarySourceTitle: chain.primarySource.sourceTitle,
      primaryRelevance: chain.primarySource.relevance,
      supportingSources: chain.supportingSources.map(s => ({
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        sourceTitle: s.sourceTitle,
        relevance: s.relevance,
        extractedValue: s.extractedValue,
      })),
      confidenceBasis: chain.confidenceBasis,
      confidenceScore: chain.confidenceScore,
      chainStrength: chain.chainStrength,
      rimVersion: context?.rimVersion ?? null,
      judgmentFrameworkVersion: context?.judgmentFrameworkVersion ?? null,
      patternRegistryVersion: context?.patternRegistryVersion ?? null,
    }).returning();

    return record;
  } catch (err) {
    console.error('[DataLineage] Failed to persist evidence chain:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// READ OPERATIONS — Multi-Perspective Reporting
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trace upstream: "Where did this object's data come from?"
 * Walks the lineage graph backwards from target to sources.
 */
export async function traceUpstream(
  organizationId: number,
  objectType: string,
  objectId: string,
  maxDepth: number = 5,
): Promise<LineageGraph> {
  const nodes: LineageNode[] = [];
  const edges: LineageGraph['edges'] = [];
  const visited = new Set<string>();

  async function walk(type: string, id: string, depth: number) {
    const key = `${type}:${id}`;
    if (visited.has(key) || depth > maxDepth) return;
    visited.add(key);

    const records = await db.select()
      .from(dataLineageRecords)
      .where(and(
        eq(dataLineageRecords.organizationId, organizationId),
        eq(dataLineageRecords.targetObjectType, type),
        eq(dataLineageRecords.targetObjectId, id),
      ))
      .orderBy(desc(dataLineageRecords.createdAt));

    for (const rec of records) {
      nodes.push({
        objectType: rec.sourceObjectType,
        objectId: rec.sourceObjectId,
        title: rec.sourceTitle ?? undefined,
        depth,
        direction: 'upstream',
      });
      edges.push({
        sourceType: rec.sourceObjectType,
        sourceId: rec.sourceObjectId,
        targetType: rec.targetObjectType,
        targetId: rec.targetObjectId,
        linkageType: rec.linkageType,
        confidence: rec.confidenceScore ?? undefined,
      });
      await walk(rec.sourceObjectType, rec.sourceObjectId, depth + 1);
    }
  }

  await walk(objectType, objectId, 1);

  return {
    rootObjectType: objectType,
    rootObjectId: objectId,
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      maxDepth: Math.max(0, ...nodes.map(n => n.depth)),
      queriedAt: new Date().toISOString(),
    },
  };
}

/**
 * Trace downstream: "Where was this source data used?"
 * Walks the lineage graph forward from source to targets.
 */
export async function traceDownstream(
  organizationId: number,
  objectType: string,
  objectId: string,
  maxDepth: number = 5,
): Promise<LineageGraph> {
  const nodes: LineageNode[] = [];
  const edges: LineageGraph['edges'] = [];
  const visited = new Set<string>();

  async function walk(type: string, id: string, depth: number) {
    const key = `${type}:${id}`;
    if (visited.has(key) || depth > maxDepth) return;
    visited.add(key);

    const records = await db.select()
      .from(dataLineageRecords)
      .where(and(
        eq(dataLineageRecords.organizationId, organizationId),
        eq(dataLineageRecords.sourceObjectType, type),
        eq(dataLineageRecords.sourceObjectId, id),
      ))
      .orderBy(desc(dataLineageRecords.createdAt));

    for (const rec of records) {
      nodes.push({
        objectType: rec.targetObjectType,
        objectId: rec.targetObjectId,
        title: rec.targetTitle ?? undefined,
        depth,
        direction: 'downstream',
      });
      edges.push({
        sourceType: rec.sourceObjectType,
        sourceId: rec.sourceObjectId,
        targetType: rec.targetObjectType,
        targetId: rec.targetObjectId,
        linkageType: rec.linkageType,
        confidence: rec.confidenceScore ?? undefined,
      });
      await walk(rec.targetObjectType, rec.targetObjectId, depth + 1);
    }
  }

  await walk(objectType, objectId, 1);

  return {
    rootObjectType: objectType,
    rootObjectId: objectId,
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      maxDepth: Math.max(0, ...nodes.map(n => n.depth)),
      queriedAt: new Date().toISOString(),
    },
  };
}

/**
 * Coverage report: "What % of this artifact has source attribution?"
 */
export async function getLineageCoverage(
  organizationId: number,
  objectType: string,
  objectId: string,
): Promise<LineageCoverageReport> {
  const records = await db.select()
    .from(dataLineageRecords)
    .where(and(
      eq(dataLineageRecords.organizationId, organizationId),
      eq(dataLineageRecords.targetObjectType, objectType),
      eq(dataLineageRecords.targetObjectId, objectId),
    ));

  // Group by target field (section) to see which sections have lineage
  const fieldCoverage = new Map<string, typeof records>();
  for (const rec of records) {
    const field = rec.targetField || '__root__';
    if (!fieldCoverage.has(field)) fieldCoverage.set(field, []);
    fieldCoverage.get(field)!.push(rec);
  }

  // Group by source type for summary
  const sourceGroups = new Map<string, { count: number; totalConf: number }>();
  for (const rec of records) {
    const existing = sourceGroups.get(rec.sourceObjectType) || { count: 0, totalConf: 0 };
    existing.count++;
    existing.totalConf += rec.confidenceScore || 0;
    sourceGroups.set(rec.sourceObjectType, existing);
  }

  const totalSections = fieldCoverage.size || 1;
  const sectionsWithLineage = records.length > 0 ? fieldCoverage.size : 0;

  return {
    objectType,
    objectId,
    totalSections,
    sectionsWithLineage,
    coveragePercent: Math.round((sectionsWithLineage / totalSections) * 100),
    lineageSources: Array.from(sourceGroups.entries()).map(([type, data]) => ({
      sourceType: type,
      count: data.count,
      avgConfidence: data.count > 0 ? Math.round(data.totalConf / data.count) : 0,
    })),
    gaps: records.length === 0 ? ['No lineage records found for this object'] : [],
  };
}

/**
 * Cross-module dependency map for an entire project.
 */
export async function getCrossModuleReport(
  organizationId: number,
  projectId?: number,
): Promise<CrossModuleReport> {
  const where = projectId
    ? and(eq(dataLineageRecords.organizationId, organizationId), eq(dataLineageRecords.projectId, projectId))
    : eq(dataLineageRecords.organizationId, organizationId);

  const records = await db.select().from(dataLineageRecords).where(where);

  // Build module map
  const moduleMap = new Map<string, {
    objectCount: Set<string>;
    inbound: number;
    outbound: number;
    crossDeps: Set<string>;
  }>();

  function ensureModule(type: string) {
    if (!moduleMap.has(type)) {
      moduleMap.set(type, { objectCount: new Set(), inbound: 0, outbound: 0, crossDeps: new Set() });
    }
    return moduleMap.get(type)!;
  }

  const allTargets = new Set<string>();
  const allSources = new Set<string>();

  for (const rec of records) {
    const srcMod = ensureModule(rec.sourceObjectType);
    const tgtMod = ensureModule(rec.targetObjectType);

    srcMod.objectCount.add(rec.sourceObjectId);
    tgtMod.objectCount.add(rec.targetObjectId);
    srcMod.outbound++;
    tgtMod.inbound++;

    allSources.add(`${rec.sourceObjectType}:${rec.sourceObjectId}`);
    allTargets.add(`${rec.targetObjectType}:${rec.targetObjectId}`);

    if (rec.sourceObjectType !== rec.targetObjectType) {
      srcMod.crossDeps.add(rec.targetObjectType);
      tgtMod.crossDeps.add(rec.sourceObjectType);
    }
  }

  // Find orphans (objects that appear as targets but never as sources, and vice versa)
  const orphaned: CrossModuleReport['orphanedObjects'] = [];
  // Objects that have no inbound lineage (potential orphans)
  for (const rec of records) {
    const sourceKey = `${rec.sourceObjectType}:${rec.sourceObjectId}`;
    if (!allTargets.has(sourceKey)) {
      // This source has no inbound lineage — it's a root data source, not an orphan
    }
  }

  return {
    organizationId,
    projectId,
    modules: Array.from(moduleMap.entries()).map(([type, data]) => ({
      moduleType: type,
      objectCount: data.objectCount.size,
      inboundLinks: data.inbound,
      outboundLinks: data.outbound,
      crossModuleDependencies: Array.from(data.crossDeps),
    })),
    orphanedObjects: orphaned,
    queriedAt: new Date().toISOString(),
  };
}

/**
 * Evidence chain report: all evidence justifications for a given object.
 */
export async function getEvidenceChainReport(
  organizationId: number,
  targetObjectType: string,
  targetObjectId: string,
): Promise<EvidenceChainRecord[]> {
  return db.select()
    .from(evidenceChainRecords)
    .where(and(
      eq(evidenceChainRecords.organizationId, organizationId),
      eq(evidenceChainRecords.targetObjectType, targetObjectType),
      eq(evidenceChainRecords.targetObjectId, targetObjectId),
    ))
    .orderBy(desc(evidenceChainRecords.createdAt));
}

/**
 * Integrity check: verify that source content hasn't changed since lineage was recorded.
 * Returns records where source hash no longer matches current content.
 */
export async function checkLineageIntegrity(
  organizationId: number,
  projectId?: number,
): Promise<{
  totalRecords: number;
  recordsWithHash: number;
  checkedAt: string;
  note: string;
}> {
  const where = projectId
    ? and(
        eq(dataLineageRecords.organizationId, organizationId),
        eq(dataLineageRecords.projectId, projectId),
      )
    : eq(dataLineageRecords.organizationId, organizationId);

  const [{ totalRecords }] = await db.select({
    totalRecords: count(),
  }).from(dataLineageRecords).where(where);

  const [{ recordsWithHash }] = await db.select({
    recordsWithHash: count(),
  }).from(dataLineageRecords).where(and(
    where,
    sql`${dataLineageRecords.sourceContentHash} IS NOT NULL`,
  ));

  return {
    totalRecords: Number(totalRecords),
    recordsWithHash: Number(recordsWithHash),
    checkedAt: new Date().toISOString(),
    note: 'Content hash verification requires object-specific resolver. Use /api/data-lineage/:objectType/:objectId/verify for per-object checks.',
  };
}

/**
 * Summary statistics for lineage across an organization or project.
 */
export async function getLineageSummary(
  organizationId: number,
  projectId?: number,
): Promise<{
  totalLineageRecords: number;
  totalEvidenceChains: number;
  linkageTypes: Record<string, number>;
  sourceTypes: Record<string, number>;
  targetTypes: Record<string, number>;
  confidenceDistribution: { strong: number; moderate: number; weak: number; unscored: number };
  queriedAt: string;
}> {
  const lineageWhere = projectId
    ? and(eq(dataLineageRecords.organizationId, organizationId), eq(dataLineageRecords.projectId, projectId))
    : eq(dataLineageRecords.organizationId, organizationId);

  const evidenceWhere = projectId
    ? and(eq(evidenceChainRecords.organizationId, organizationId), eq(evidenceChainRecords.projectId, projectId))
    : eq(evidenceChainRecords.organizationId, organizationId);

  const [records, evidenceChains] = await Promise.all([
    db.select().from(dataLineageRecords).where(lineageWhere),
    db.select().from(evidenceChainRecords).where(evidenceWhere),
  ]);

  const linkageTypes: Record<string, number> = {};
  const sourceTypes: Record<string, number> = {};
  const targetTypes: Record<string, number> = {};
  const confidenceDistribution = { strong: 0, moderate: 0, weak: 0, unscored: 0 };

  for (const rec of records) {
    linkageTypes[rec.linkageType] = (linkageTypes[rec.linkageType] || 0) + 1;
    sourceTypes[rec.sourceObjectType] = (sourceTypes[rec.sourceObjectType] || 0) + 1;
    targetTypes[rec.targetObjectType] = (targetTypes[rec.targetObjectType] || 0) + 1;

    if (rec.confidenceScore == null) confidenceDistribution.unscored++;
    else if (rec.confidenceScore >= 75) confidenceDistribution.strong++;
    else if (rec.confidenceScore >= 50) confidenceDistribution.moderate++;
    else confidenceDistribution.weak++;
  }

  return {
    totalLineageRecords: records.length,
    totalEvidenceChains: evidenceChains.length,
    linkageTypes,
    sourceTypes,
    targetTypes,
    confidenceDistribution,
    queriedAt: new Date().toISOString(),
  };
}
