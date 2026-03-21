/**
 * Readiness Scoring Engine — Deterministic, Transparent, Unified
 *
 * Wraps the existing SubmissionReadinessTwinService into a unified scoring
 * interface that the intelligence layer consumes. Does NOT rebuild readiness
 * logic — delegates to the twin service and normalizes the output.
 *
 * Every score includes:
 *   - breakdown by dimension (completeness, quality, consistency, compliance)
 *   - module-level detail
 *   - trend direction
 *   - gap list with remediation suggestions
 *
 * @module server/services/intelligence/readiness-scoring-engine
 */

import { db } from '../../db.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  projectIntelligenceProfiles,
  projects,
} from '../../../shared/schema.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReadinessScore {
  readonly overallScore: number; // 0-100
  readonly dimensions: ReadinessDimensions;
  readonly moduleBreakdown: readonly ModuleScore[];
  readonly gaps: readonly ReadinessGap[];
  readonly trend: TrendInfo;
  readonly predictions: ReadinessPredictions;
  readonly scoredAt: string;
}

export interface ReadinessDimensions {
  readonly completeness: number; // 0-100
  readonly quality: number;
  readonly consistency: number;
  readonly compliance: number;
}

export interface ModuleScore {
  readonly modulePath: string;
  readonly moduleName: string;
  readonly score: number;
  readonly gapCount: number;
  readonly status: 'complete' | 'in_progress' | 'not_started' | 'at_risk';
}

export interface ReadinessGap {
  readonly id: string;
  readonly module: string;
  readonly description: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly remediation: string;
  readonly estimatedEffortHours: number | null;
}

export interface TrendInfo {
  readonly direction: 'improving' | 'stable' | 'declining';
  readonly delta: number;
  readonly dataPoints: number;
}

export interface ReadinessPredictions {
  readonly approvalProbability: number; // 0-100
  readonly estimatedReviewDays: number;
  readonly estimatedDeficiencies: number;
}

export interface ReadinessContext {
  readonly organizationId: number;
  readonly projectId: number;
  readonly programId?: string;
  readonly submissionType?: string;
  readonly targetAgency?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a unified readiness score for a project.
 *
 * Strategy:
 * 1. Query the intelligence profile for risk factors and open questions
 * 2. Query document status for completeness metrics
 * 3. If a twin assessment exists (via raw SQL to innovation schema), incorporate it
 * 4. Compute composite score deterministically
 */
export async function computeReadinessScore(
  ctx: ReadinessContext,
): Promise<ReadinessScore> {
  const now = new Date().toISOString();

  // ── Gather signals ──────────────────────────────────────────────────────

  const [profileSignal, documentSignal, milestoneSignal, twinSignal] = await Promise.allSettled([
    gatherProfileSignal(ctx),
    gatherDocumentSignal(ctx),
    gatherMilestoneSignal(ctx),
    gatherTwinAssessment(ctx),
  ]);

  const profile = profileSignal.status === 'fulfilled' ? profileSignal.value : null;
  const docs = documentSignal.status === 'fulfilled' ? documentSignal.value : null;
  const milestones = milestoneSignal.status === 'fulfilled' ? milestoneSignal.value : null;
  const twin = twinSignal.status === 'fulfilled' ? twinSignal.value : null;

  // ── Compute dimensions ──────────────────────────────────────────────────

  // Completeness: based on document status distribution
  const completeness = computeCompleteness(docs);

  // Quality: from twin assessment if available, else estimate from profile
  const quality = twin?.qualityScore ?? estimateQuality(profile);

  // Consistency: from twin if available, else neutral
  const consistency = twin?.consistencyScore ?? 70;

  // Compliance: from twin if available, else estimate from risk count
  const compliance = twin?.complianceScore ?? estimateCompliance(profile);

  // ── Overall score (weighted average) ────────────────────────────────────
  const overallScore = Math.round(
    completeness * 0.35 +
    quality * 0.25 +
    consistency * 0.20 +
    compliance * 0.20,
  );

  // ── Build module breakdown ──────────────────────────────────────────────
  const moduleBreakdown: ModuleScore[] = twin?.moduleScores
    ? Object.entries(twin.moduleScores as Record<string, number>).map(([path, score]) => ({
        modulePath: path,
        moduleName: path.replace(/^module_/, 'Module ').replace(/_/g, '.'),
        score: Math.round(score),
        gapCount: score < 50 ? 3 : score < 75 ? 1 : 0,
        status: score >= 90 ? 'complete' as const
          : score >= 50 ? 'in_progress' as const
          : score > 0 ? 'at_risk' as const
          : 'not_started' as const,
      }))
    : [];

  // ── Build gaps ──────────────────────────────────────────────────────────
  const gaps: ReadinessGap[] = [];
  let gapIdx = 0;

  if (profile?.risks) {
    for (const risk of profile.risks) {
      gaps.push({
        id: `gap-risk-${gapIdx++}`,
        module: 'project',
        description: risk.risk,
        severity: risk.impact === 'critical' ? 'critical'
          : risk.impact === 'high' ? 'high'
          : 'medium',
        remediation: risk.mitigation ?? 'Address identified risk',
        estimatedEffortHours: null,
      });
    }
  }

  if (docs?.staleDrafts) {
    for (const doc of docs.staleDrafts) {
      gaps.push({
        id: `gap-doc-${gapIdx++}`,
        module: 'documents',
        description: `Document "${doc.title}" stale in draft status`,
        severity: 'medium',
        remediation: `Complete and advance "${doc.title}" through review`,
        estimatedEffortHours: null,
      });
    }
  }

  if (milestones?.overdue) {
    for (const ms of milestones.overdue) {
      gaps.push({
        id: `gap-ms-${gapIdx++}`,
        module: 'milestones',
        description: `Milestone "${ms.name}" is overdue`,
        severity: 'critical',
        remediation: `Prioritize completion of "${ms.name}"`,
        estimatedEffortHours: null,
      });
    }
  }

  // ── Trend ───────────────────────────────────────────────────────────────
  const trend: TrendInfo = twin?.trend ?? {
    direction: 'stable' as const,
    delta: 0,
    dataPoints: 0,
  };

  // ── Predictions ─────────────────────────────────────────────────────────
  const predictions: ReadinessPredictions = {
    approvalProbability: twin?.approvalProbability ?? Math.min(overallScore + 10, 100),
    estimatedReviewDays: twin?.reviewTimeDays ?? 180,
    estimatedDeficiencies: twin?.deficiencyCount ?? Math.max(0, Math.round((100 - overallScore) / 10)),
  };

  return {
    overallScore,
    dimensions: { completeness, quality, consistency, compliance },
    moduleBreakdown,
    gaps,
    trend,
    predictions,
    scoredAt: now,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL GATHERERS
// ═══════════════════════════════════════════════════════════════════════════════

interface ProfileSignal {
  risks: Array<{ risk: string; impact: string; mitigation?: string }>;
  openQuestionCount: number;
  decisionCount: number;
}

async function gatherProfileSignal(ctx: ReadinessContext): Promise<ProfileSignal> {
  const [profile] = await db
    .select()
    .from(projectIntelligenceProfiles)
    .where(and(
      eq(projectIntelligenceProfiles.projectId, ctx.projectId),
      eq(projectIntelligenceProfiles.organizationId, ctx.organizationId),
    ))
    .limit(1);

  if (!profile) {
    return { risks: [], openQuestionCount: 0, decisionCount: 0 };
  }

  const risks = Array.isArray(profile.riskFactors) ? profile.riskFactors as ProfileSignal['risks'] : [];
  const questions = Array.isArray(profile.openQuestions) ? profile.openQuestions as unknown[] : [];
  const decisions = Array.isArray(profile.keyDecisions) ? profile.keyDecisions as unknown[] : [];

  return {
    risks,
    openQuestionCount: questions.length,
    decisionCount: decisions.length,
  };
}

interface DocumentSignal {
  total: number;
  approved: number;
  inReview: number;
  draft: number;
  staleDrafts: Array<{ id: number; title: string }>;
}

async function gatherDocumentSignal(ctx: ReadinessContext): Promise<DocumentSignal> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'approved' OR status = 'published') as approved,
        COUNT(*) FILTER (WHERE status = 'in_review') as in_review,
        COUNT(*) FILTER (WHERE status = 'draft') as draft
      FROM documents
      WHERE project_id = ${ctx.projectId}
        AND organization_id = ${ctx.organizationId}
    `);

    const row = (result.rows[0] ?? {}) as Record<string, unknown>;

    // Get stale drafts
    const staleResult = await db.execute(sql`
      SELECT id, title FROM documents
      WHERE project_id = ${ctx.projectId}
        AND organization_id = ${ctx.organizationId}
        AND status = 'draft'
        AND updated_at < NOW() - INTERVAL '7 days'
      ORDER BY updated_at ASC
      LIMIT 5
    `);

    return {
      total: Number(row.total ?? 0),
      approved: Number(row.approved ?? 0),
      inReview: Number(row.in_review ?? 0),
      draft: Number(row.draft ?? 0),
      staleDrafts: (staleResult.rows as Array<Record<string, unknown>>).map(r => ({
        id: Number(r.id),
        title: String(r.title ?? 'Untitled'),
      })),
    };
  } catch {
    return { total: 0, approved: 0, inReview: 0, draft: 0, staleDrafts: [] };
  }
}

interface MilestoneSignal {
  total: number;
  completed: number;
  overdue: Array<{ id: number; name: string }>;
  upcoming: Array<{ id: number; name: string; daysUntil: number }>;
}

async function gatherMilestoneSignal(ctx: ReadinessContext): Promise<MilestoneSignal> {
  try {
    const result = await db.execute(sql`
      SELECT id, name, target_date, status
      FROM program_milestones
      WHERE program_id IN (
        SELECT id FROM regulatory_programs
        WHERE project_id = ${ctx.projectId}
          AND organization_id = ${ctx.organizationId}
      )
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    const now = new Date();

    const completed = rows.filter(r => r.status === 'completed').length;
    const overdue = rows
      .filter(r => r.target_date && new Date(r.target_date as string) < now && r.status !== 'completed' && r.status !== 'cancelled')
      .map(r => ({ id: Number(r.id), name: String(r.name) }));

    const upcoming = rows
      .filter(r => {
        if (!r.target_date || r.status === 'completed' || r.status === 'cancelled') return false;
        const targetDate = new Date(r.target_date as string);
        const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 30;
      })
      .map(r => ({
        id: Number(r.id),
        name: String(r.name),
        daysUntil: Math.ceil((new Date(r.target_date as string).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }));

    return { total: rows.length, completed, overdue, upcoming };
  } catch {
    return { total: 0, completed: 0, overdue: [], upcoming: [] };
  }
}

interface TwinSignal {
  overallScore: number;
  qualityScore: number;
  consistencyScore: number;
  complianceScore: number;
  moduleScores: Record<string, number>;
  approvalProbability: number;
  reviewTimeDays: number;
  deficiencyCount: number;
  trend: TrendInfo;
}

async function gatherTwinAssessment(ctx: ReadinessContext): Promise<TwinSignal | null> {
  if (!ctx.programId) return null;

  try {
    const result = await db.execute(sql`
      SELECT * FROM innovation.readiness_twin_assessments
      WHERE program_id = ${ctx.programId}
      ORDER BY assessed_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Record<string, unknown>;

    // Get trend
    const trendResult = await db.execute(sql`
      SELECT overall_score FROM innovation.readiness_trends
      WHERE program_id = ${ctx.programId}
      ORDER BY trend_date DESC
      LIMIT 5
    `);

    const trendRows = trendResult.rows as Array<Record<string, unknown>>;
    let direction: 'improving' | 'stable' | 'declining' = 'stable';
    let delta = 0;

    if (trendRows.length >= 2) {
      const latest = Number(trendRows[0].overall_score);
      const previous = Number(trendRows[1].overall_score);
      delta = latest - previous;
      if (delta > 2) direction = 'improving';
      else if (delta < -2) direction = 'declining';
    }

    return {
      overallScore: Number(row.overall_readiness_score ?? 0),
      qualityScore: Number(row.quality_score ?? 70),
      consistencyScore: Number(row.consistency_score ?? 70),
      complianceScore: Number(row.compliance_score ?? 70),
      moduleScores: (row.module_scores as Record<string, number>) ?? {},
      approvalProbability: Number(row.predicted_approval_probability ?? 0),
      reviewTimeDays: Number(row.predicted_review_time_days ?? 180),
      deficiencyCount: Number(row.predicted_deficiency_count ?? 0),
      trend: { direction, delta, dataPoints: trendRows.length },
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIMENSION ESTIMATORS (when twin data unavailable)
// ═══════════════════════════════════════════════════════════════════════════════

function computeCompleteness(docs: DocumentSignal | null): number {
  if (!docs || docs.total === 0) return 0;
  const approved = docs.approved;
  const inReview = docs.inReview * 0.7;
  const draft = docs.draft * 0.3;
  return Math.round(((approved + inReview + draft) / docs.total) * 100);
}

function estimateQuality(profile: ProfileSignal | null): number {
  if (!profile) return 50;
  // More decisions made → higher quality signal; more open questions → lower
  const decisionBoost = Math.min(profile.decisionCount * 5, 20);
  const questionPenalty = Math.min(profile.openQuestionCount * 3, 15);
  return Math.max(40, Math.min(90, 65 + decisionBoost - questionPenalty));
}

function estimateCompliance(profile: ProfileSignal | null): number {
  if (!profile) return 50;
  // Each risk factor reduces compliance estimate
  const riskPenalty = Math.min(profile.risks.length * 5, 25);
  const criticalRisks = profile.risks.filter(r => r.impact === 'critical').length;
  return Math.max(30, Math.min(90, 80 - riskPenalty - criticalRisks * 10));
}
