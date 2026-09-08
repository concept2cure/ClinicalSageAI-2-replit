/**
 * Recommendation Engine v1 — Structured, Explainable, Evidence-Based
 *
 * Centralized engine that generates recommendations from:
 *   - readiness gaps (via SubmissionReadinessTwinService)
 *   - validation findings (via realTimeValidationService)
 *   - document state (via project intelligence profiles)
 *   - historical activity (via project memory)
 *
 * Every recommendation includes:
 *   - evidence source chain
 *   - confidence level (if AI-inferred)
 *   - suggested action
 *   - approval flag
 *
 * @module server/services/intelligence/recommendation-engine
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  projectIntelligenceProfiles,
} from '../../../shared/schema.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Recommendation {
  readonly recommendationId: string;
  readonly type: RecommendationType;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly sourceType: 'rules_based' | 'validation_based' | 'ai_inferred';
  readonly targetObjectType: string;
  readonly targetObjectId: string;
  readonly reason: string;
  readonly evidence: readonly EvidenceRef[];
  readonly confidence: number | null; // 0-100, null for rules_based
  readonly suggestedAction: string;
  readonly requiresApproval: boolean;
  readonly status: 'active' | 'accepted' | 'dismissed' | 'resolved';
  readonly createdAt: string;
  readonly resolvedAt?: string;
  readonly resolvedBy?: string;
  readonly feedbackOutcome?: string;
}

export type RecommendationType =
  | 'missing_document'
  | 'incomplete_section'
  | 'validation_failure'
  | 'quality_gap'
  | 'cross_reference_issue'
  | 'readiness_blocker'
  | 'risk_mitigation'
  | 'workflow_optimization'
  | 'compliance_gap'
  | 'evidence_gap';

export interface EvidenceRef {
  readonly sourceType: 'readiness_criterion' | 'validation_result' | 'document_state' | 'historical_pattern' | 'regulatory_reference';
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly relevance: number; // 0-1
}

export interface RecommendationContext {
  readonly organizationId: number;
  readonly projectId: number;
  readonly programType?: string;
  readonly moduleScope?: string;
  readonly triggeredBy: string;
}

export interface RecommendationSet {
  readonly recommendations: Recommendation[];
  readonly generatedAt: string;
  readonly totalGenerated: number;
  readonly bySeverity: { critical: number; high: number; medium: number; low: number };
  readonly bySource: { rules_based: number; validation_based: number; ai_inferred: number };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECOMMENDATION GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

type RecommendationGenerator = (ctx: RecommendationContext) => Promise<Recommendation[]>;

const _generators: RecommendationGenerator[] = [];

function registerGenerator(gen: RecommendationGenerator): void {
  _generators.push(gen);
}

// ── Generator 1: Document completeness gaps ─────────────────────────────────

registerGenerator(async (ctx) => {
  const recs: Recommendation[] = [];

  try {
    // Check project intelligence profile for open questions and risk factors
    const [profile] = await db
      .select()
      .from(projectIntelligenceProfiles)
      .where(and(
        eq(projectIntelligenceProfiles.projectId, ctx.projectId),
        eq(projectIntelligenceProfiles.organizationId, ctx.organizationId),
      ))
      .limit(1);

    if (!profile) return recs;

    // Generate recommendations from risk factors
    const risks = profile.riskFactors as Array<{ risk: string; likelihood: string; impact: string; mitigation?: string }> | null;
    if (Array.isArray(risks)) {
      for (const risk of risks) {
        const severity = risk.impact === 'high' ? 'high' : risk.impact === 'critical' ? 'critical' : 'medium';
        recs.push({
          recommendationId: uuidv4(),
          type: 'risk_mitigation',
          severity: severity as Recommendation['severity'],
          sourceType: 'ai_inferred',
          targetObjectType: 'project',
          targetObjectId: String(ctx.projectId),
          reason: `Risk identified: ${risk.risk}`,
          evidence: [{
            sourceType: 'document_state',
            sourceId: String(profile.id),
            sourceTitle: 'Project Intelligence Profile',
            relevance: 0.85,
          }],
          confidence: 75,
          suggestedAction: risk.mitigation ?? `Address risk: ${risk.risk}`,
          requiresApproval: severity === 'critical',
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Generate recommendations from open questions
    const questions = profile.openQuestions as Array<{ question: string; context?: string; priority?: string }> | null;
    if (Array.isArray(questions)) {
      for (const q of questions.slice(0, 5)) { // Limit to top 5
        recs.push({
          recommendationId: uuidv4(),
          type: 'evidence_gap',
          severity: q.priority === 'high' ? 'high' : 'medium',
          sourceType: 'ai_inferred',
          targetObjectType: 'project',
          targetObjectId: String(ctx.projectId),
          reason: `Unresolved question: ${q.question}`,
          evidence: [{
            sourceType: 'document_state',
            sourceId: String(profile.id),
            sourceTitle: 'Project Intelligence Profile',
            relevance: 0.7,
          }],
          confidence: 65,
          suggestedAction: `Research and resolve: ${q.question}`,
          requiresApproval: false,
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn('[recommendation-engine] Document completeness generator failed:', err);
  }

  return recs;
});

// ── Generator 2: Document status gaps ───────────────────────────────────────

registerGenerator(async (ctx) => {
  const recs: Recommendation[] = [];

  try {
    // Look for documents stuck in draft or with stale reviews
    const result = await db.execute(sql`
      SELECT id, title, status, updated_at, document_type
      FROM documents
      WHERE project_id = ${ctx.projectId}
        AND organization_id = ${ctx.organizationId}
        AND status = 'draft'
        AND updated_at < NOW() - INTERVAL '7 days'
      ORDER BY updated_at ASC
      LIMIT 10
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    for (const row of rows) {
      recs.push({
        recommendationId: uuidv4(),
        type: 'incomplete_section',
        severity: 'medium',
        sourceType: 'rules_based',
        targetObjectType: 'document',
        targetObjectId: String(row.id),
        reason: `Document "${row.title}" has been in draft for over 7 days`,
        evidence: [{
          sourceType: 'document_state',
          sourceId: String(row.id),
          sourceTitle: String(row.title ?? 'Untitled'),
          relevance: 0.9,
        }],
        confidence: null,
        suggestedAction: `Review and complete document: ${row.title}`,
        requiresApproval: false,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    // Only a missing table is a genuine empty. A real read failure rejects so
    // generateRecommendations logs it (a swallowed [] was indistinguishable from
    // "nothing to recommend" on the advisory Next-Best-Actions surface).
    if ((e as { code?: string })?.code !== '42P01') throw e;
  }

  return recs;
});

// ── Generator 3: Milestone/deadline awareness ───────────────────────────────

registerGenerator(async (ctx) => {
  const recs: Recommendation[] = [];

  try {
    const result = await db.execute(sql`
      SELECT id, name, target_date, status, progress
      FROM program_milestones
      WHERE program_id IN (
        SELECT id FROM regulatory_programs
        WHERE project_id = ${ctx.projectId}
          AND organization_id = ${ctx.organizationId}
      )
      AND status NOT IN ('completed', 'cancelled')
      AND target_date IS NOT NULL
      AND target_date < NOW() + INTERVAL '14 days'
      ORDER BY target_date ASC
      LIMIT 5
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    for (const row of rows) {
      const targetDate = new Date(row.target_date as string);
      const isOverdue = targetDate < new Date();
      const progress = (row.progress as number) ?? 0;

      recs.push({
        recommendationId: uuidv4(),
        type: 'readiness_blocker',
        severity: isOverdue ? 'critical' : 'high',
        sourceType: 'rules_based',
        targetObjectType: 'milestone',
        targetObjectId: String(row.id),
        reason: isOverdue
          ? `Milestone "${row.name}" is overdue (${progress}% complete)`
          : `Milestone "${row.name}" due within 14 days (${progress}% complete)`,
        evidence: [{
          sourceType: 'document_state',
          sourceId: String(row.id),
          sourceTitle: String(row.name),
          relevance: 1.0,
        }],
        confidence: null,
        suggestedAction: `Prioritize completion of: ${row.name}`,
        requiresApproval: false,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    // Only a missing table is a genuine empty; a real failure rejects and is
    // logged by generateRecommendations rather than silently dropping the
    // overdue/upcoming milestone recommendations to [].
    if ((e as { code?: string })?.code !== '42P01') throw e;
  }

  return recs;
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE: Generate all recommendations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate recommendations for a project by running all registered generators.
 */
export async function generateRecommendations(
  ctx: RecommendationContext,
): Promise<RecommendationSet> {
  const allRecs: Recommendation[] = [];

  // Run all generators concurrently
  const results = await Promise.allSettled(
    _generators.map(gen => gen(ctx)),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allRecs.push(...result.value);
    } else {
      console.warn('[recommendation-engine] Generator failed:', result.reason);
    }
  }

  // Sort by severity (critical first)
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  allRecs.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

  const bySeverity = {
    critical: allRecs.filter(r => r.severity === 'critical').length,
    high: allRecs.filter(r => r.severity === 'high').length,
    medium: allRecs.filter(r => r.severity === 'medium').length,
    low: allRecs.filter(r => r.severity === 'low').length,
  };

  const bySource = {
    rules_based: allRecs.filter(r => r.sourceType === 'rules_based').length,
    validation_based: allRecs.filter(r => r.sourceType === 'validation_based').length,
    ai_inferred: allRecs.filter(r => r.sourceType === 'ai_inferred').length,
  };

  return {
    recommendations: allRecs,
    generatedAt: new Date().toISOString(),
    totalGenerated: allRecs.length,
    bySeverity,
    bySource,
  };
}
