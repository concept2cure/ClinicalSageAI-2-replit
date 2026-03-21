/**
 * Project Intelligence Service — Continuity Object Manager
 *
 * Maintains and enriches the projectIntelligenceProfiles table — the single
 * source of truth for what the system has learned about a project.
 *
 * Operations:
 *   - Get or create profile for a project
 *   - Append learned insights, decisions, risks, open questions
 *   - Record document ingestion metadata
 *   - Retrieve enriched summary for AI context injection
 *
 * @module server/services/intelligence/project-intelligence-service
 */

import { db } from '../../db.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  projectIntelligenceProfiles,
  projectMemoryEntries,
} from '../../../shared/schema.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProjectIntelligenceSummary {
  readonly profileId: number;
  readonly projectId: number;
  readonly organizationId: number;
  readonly regulatoryStrategy: string | null;
  readonly targetIndication: string | null;
  readonly targetPopulation: string | null;
  readonly riskFactors: readonly RiskFactor[];
  readonly openQuestions: readonly OpenQuestion[];
  readonly keyDecisions: readonly KeyDecision[];
  readonly learnedInsights: readonly LearnedInsight[];
  readonly documentStats: {
    readonly totalIngested: number;
    readonly totalTokens: number;
    readonly lastIngestedAt: string | null;
  };
  readonly memoryEntryCount: number;
  readonly profileStatus: string;
  readonly lastEnrichedAt: string | null;
}

export interface RiskFactor {
  risk: string;
  likelihood: string;
  impact: string;
  mitigation?: string;
}

export interface OpenQuestion {
  question: string;
  context?: string;
  priority?: string;
}

export interface KeyDecision {
  decision: string;
  rationale: string;
  date: string;
  source?: string;
}

export interface LearnedInsight {
  insight: string;
  source: string;
  confidence: number;
  extractedAt: string;
}

export interface IntelligenceUpdatePayload {
  risks?: RiskFactor[];
  openQuestions?: OpenQuestion[];
  keyDecisions?: KeyDecision[];
  learnedInsights?: LearnedInsight[];
  regulatoryStrategy?: string;
  targetIndication?: string;
  targetPopulation?: string;
  customInstructions?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get or create the intelligence profile for a project.
 */
export async function getOrCreateProfile(
  projectId: number,
  organizationId: number,
): Promise<number> {
  const [existing] = await db
    .select({ id: projectIntelligenceProfiles.id })
    .from(projectIntelligenceProfiles)
    .where(and(
      eq(projectIntelligenceProfiles.projectId, projectId),
      eq(projectIntelligenceProfiles.organizationId, organizationId),
    ))
    .limit(1);

  if (existing) return existing.id;

  // Create new profile
  const values: Record<string, unknown> = {
    projectId,
    organizationId,
    profileStatus: 'active',
    riskFactors: [],
    openQuestions: [],
    keyDecisions: [],
    learnedInsights: [],
  };

  const [created] = await db
    .insert(projectIntelligenceProfiles)
    .values(values as any)
    .returning({ id: projectIntelligenceProfiles.id });

  return created.id;
}

/**
 * Get the full intelligence summary for a project.
 */
export async function getProjectIntelligence(
  projectId: number,
  organizationId: number,
): Promise<ProjectIntelligenceSummary | null> {
  const [profile] = await db
    .select()
    .from(projectIntelligenceProfiles)
    .where(and(
      eq(projectIntelligenceProfiles.projectId, projectId),
      eq(projectIntelligenceProfiles.organizationId, organizationId),
    ))
    .limit(1);

  if (!profile) return null;

  // Count memory entries
  const [memCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(projectMemoryEntries)
    .where(eq(projectMemoryEntries.projectProfileId, profile.id));

  const risks = Array.isArray(profile.riskFactors) ? profile.riskFactors as unknown as RiskFactor[] : [];
  const questions = Array.isArray(profile.openQuestions) ? profile.openQuestions as unknown as OpenQuestion[] : [];
  const decisions = Array.isArray(profile.keyDecisions) ? profile.keyDecisions as unknown as KeyDecision[] : [];
  const insights = Array.isArray(profile.learnedInsights) ? profile.learnedInsights as unknown as LearnedInsight[] : [];

  return {
    profileId: profile.id,
    projectId: profile.projectId,
    organizationId: profile.organizationId,
    regulatoryStrategy: profile.regulatoryStrategy,
    targetIndication: profile.targetIndication,
    targetPopulation: profile.targetPopulation,
    riskFactors: risks,
    openQuestions: questions,
    keyDecisions: decisions,
    learnedInsights: insights,
    documentStats: {
      totalIngested: profile.totalDocumentsIngested ?? 0,
      totalTokens: profile.totalTokensProcessed ?? 0,
      lastIngestedAt: profile.lastDocumentIngestedAt?.toISOString() ?? null,
    },
    memoryEntryCount: Number(memCount?.count ?? 0),
    profileStatus: profile.profileStatus ?? 'active',
    lastEnrichedAt: profile.lastEnrichedAt?.toISOString() ?? null,
  };
}

/**
 * Append intelligence data to a project profile (additive merge, not replace).
 */
export async function enrichProjectIntelligence(
  projectId: number,
  organizationId: number,
  payload: IntelligenceUpdatePayload,
  enrichedBy?: number,
): Promise<void> {
  const profileId = await getOrCreateProfile(projectId, organizationId);

  // Fetch current state to merge
  const [current] = await db
    .select()
    .from(projectIntelligenceProfiles)
    .where(eq(projectIntelligenceProfiles.id, profileId))
    .limit(1);

  if (!current) return;

  const updates: Record<string, unknown> = {
    lastEnrichedAt: new Date(),
    updatedAt: new Date(),
  };

  if (enrichedBy) {
    updates.lastEnrichedBy = enrichedBy;
  }

  // Merge arrays (append new, deduplicate by key field)
  if (payload.risks && payload.risks.length > 0) {
    const existing = Array.isArray(current.riskFactors) ? current.riskFactors as unknown as RiskFactor[] : [];
    const existingKeys = new Set(existing.map(r => r.risk));
    const newRisks = payload.risks.filter(r => !existingKeys.has(r.risk));
    updates.riskFactors = [...existing, ...newRisks];
  }

  if (payload.openQuestions && payload.openQuestions.length > 0) {
    const existing = Array.isArray(current.openQuestions) ? current.openQuestions as unknown as OpenQuestion[] : [];
    const existingKeys = new Set(existing.map(q => q.question));
    const newQuestions = payload.openQuestions.filter(q => !existingKeys.has(q.question));
    updates.openQuestions = [...existing, ...newQuestions];
  }

  if (payload.keyDecisions && payload.keyDecisions.length > 0) {
    const existing = Array.isArray(current.keyDecisions) ? current.keyDecisions as unknown as KeyDecision[] : [];
    const existingKeys = new Set(existing.map(d => d.decision));
    const newDecisions = payload.keyDecisions.filter(d => !existingKeys.has(d.decision));
    updates.keyDecisions = [...existing, ...newDecisions];
  }

  if (payload.learnedInsights && payload.learnedInsights.length > 0) {
    const existing = Array.isArray(current.learnedInsights) ? current.learnedInsights as unknown as LearnedInsight[] : [];
    const existingKeys = new Set(existing.map(i => i.insight));
    const newInsights = payload.learnedInsights.filter(i => !existingKeys.has(i.insight));
    updates.learnedInsights = [...existing, ...newInsights];
  }

  // Scalar fields (overwrite if provided)
  if (payload.regulatoryStrategy !== undefined) updates.regulatoryStrategy = payload.regulatoryStrategy;
  if (payload.targetIndication !== undefined) updates.targetIndication = payload.targetIndication;
  if (payload.targetPopulation !== undefined) updates.targetPopulation = payload.targetPopulation;
  if (payload.customInstructions !== undefined) updates.customInstructions = payload.customInstructions;

  await db
    .update(projectIntelligenceProfiles)
    .set(updates as any)
    .where(eq(projectIntelligenceProfiles.id, profileId));
}

/**
 * Get recent memory entries for a project (for AI context injection).
 */
export async function getProjectMemory(
  projectId: number,
  organizationId: number,
  options?: { category?: string; limit?: number },
): Promise<Array<{
  id: number;
  category: string;
  title: string;
  content: string;
  confidence: number;
  source: string | null;
}>> {
  const limit = options?.limit ?? 20;

  let query = db
    .select({
      id: projectMemoryEntries.id,
      category: projectMemoryEntries.category,
      title: projectMemoryEntries.title,
      content: projectMemoryEntries.content,
      confidence: projectMemoryEntries.confidenceScore,
      source: projectMemoryEntries.sourceDocumentName,
    })
    .from(projectMemoryEntries)
    .where(and(
      eq(projectMemoryEntries.projectId, projectId),
      eq(projectMemoryEntries.organizationId, organizationId),
      eq(projectMemoryEntries.status, 'active'),
      ...(options?.category ? [eq(projectMemoryEntries.category, options.category)] : []),
    ))
    .orderBy(desc(projectMemoryEntries.createdAt))
    .limit(limit);

  const rows = await query;

  return rows.map(r => ({
    id: r.id,
    category: r.category,
    title: r.title,
    content: r.content,
    confidence: r.confidence ?? 0.8,
    source: r.source,
  }));
}
