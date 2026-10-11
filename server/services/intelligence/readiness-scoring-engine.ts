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

import { db, getPool } from '../../db.js';
import { programInOrganization } from '../c2c/program-access.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  projectIntelligenceProfiles,
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
  /** Which dimensions overallScore was computed from. See ReadinessScoreBasis. */
  readonly scoreBasis: ReadinessScoreBasis;
  readonly scoredAt: string;
}

export type ReadinessDimensionName = 'completeness' | 'quality' | 'consistency' | 'compliance';

/**
 * ── 2026-10-08 (ana-15): quality, consistency and compliance can be null ─────
 * Without a twin assessment the engine used to fill them in: consistency was
 * the constant 70, quality was 65 ± profile counts, compliance was 80 − 5 per
 * risk. None of the three was measured. Until ana-15 the engine threw on every
 * call (42703 on the milestone read), so those figures never reached anyone.
 * Fixing the read made them live, and context-enrichment renders the
 * dimensions to AnA as a score table. So, as with ReadinessPredictions: null
 * means "not measured" and must be rendered as such, never defaulted at the
 * point of use. Completeness is always measured (the documents table; an
 * empty project is 0).
 */
export interface ReadinessDimensions {
  readonly completeness: number; // 0-100
  readonly quality: number | null;
  readonly consistency: number | null;
  readonly compliance: number | null;
}

/**
 * overallScore is the weighted average of the MEASURED dimensions only, with
 * the weights re-normalised over them. With a twin assessment that backs all
 * four it is the original formula. Without one it is document completeness
 * alone, and `source` says so — a caller presenting overallScore as overall
 * readiness must say which dimensions it covers.
 */
export interface ReadinessScoreBasis {
  readonly source: 'twin_assessment' | 'no_assessment_on_record';
  readonly measured: readonly ReadinessDimensionName[];
  readonly notMeasured: readonly ReadinessDimensionName[];
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

/**
 * 'unknown' with a null delta when fewer than two recorded scores exist.
 * It used to read 'stable', delta 0, from no data at all (ana-15).
 */
export interface TrendInfo {
  readonly direction: 'improving' | 'stable' | 'declining' | 'unknown';
  readonly delta: number | null;
  readonly dataPoints: number;
}

/**
 * ── 2026-09-10: every field here used to be non-null and derived ─────────────
 * When no twin assessment existed the engine filled them in:
 *   approvalProbability:   Math.min(overallScore + 10, 100)
 *   estimatedReviewDays:   180
 *   estimatedDeficiencies: Math.round((100 - overallScore) / 10)
 * A readiness score plus ten is not a probability of approval, 180 was a
 * constant, and the deficiency count was a third rescaling of the same score.
 * They reached a user: ana-ri/context-enrichment.ts renders all three into the
 * assistant's prompt under "**Predictions:**" and then instructs it to
 * "Present these scores directly."
 *
 * Null now means "not computed" and must be rendered as such. It is never
 * replaced with a default at the point of use — that just moves the invention.
 */
export interface ReadinessPredictions {
  /** 0-100. Null unless a real model produced it — which nothing does today. */
  readonly approvalProbability: number | null;
  /** The agency's review clock for the pathway, not a forecast. Null if unknown. */
  readonly estimatedReviewDays: number | null;
  /** Criteria a twin assessment scored unmet. Null when no assessment exists. */
  readonly estimatedDeficiencies: number | null;
  /** Why the fields are null, for a caller that has to explain itself. */
  readonly basis: 'twin_assessment' | 'no_assessment_on_record';
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
 * 1. Query the intelligence profile for risk factors (gaps only)
 * 2. Query document status for completeness metrics
 * 3. Query the linked program's milestones (gaps only)
 * 4. If a twin assessment exists (via raw SQL to innovation schema), it
 *    supplies quality, consistency, compliance and the trend; otherwise they
 *    are null / unknown
 * 5. Compute the composite over the measured dimensions deterministically
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

  // Fail closed on a failed CRITICAL input read. profile / documents /
  // milestones drive the score AND the gaps list (milestones feed the critical
  // overdue-milestone gaps, profile the risk gaps); the gather* helpers now
  // reject on a real failure rather than swallowing it to empty. Computing a
  // ReadinessScore from a partial set would return a falsely-short gap list and
  // a score presented as authoritative — a manufactured "here are your gaps"
  // that dropped some because a read failed. gatherTwinAssessment stays
  // best-effort (it already degrades to a neutral score).
  for (const [name, settled] of [
    ['profile', profileSignal],
    ['documents', documentSignal],
    ['milestones', milestoneSignal],
  ] as const) {
    if (settled.status === 'rejected') {
      throw settled.reason instanceof Error
        ? settled.reason
        : new Error(`Readiness ${name} signal read failed: ${String(settled.reason)}`);
    }
  }

  const profile = profileSignal.status === 'fulfilled' ? profileSignal.value : null;
  const docs = documentSignal.status === 'fulfilled' ? documentSignal.value : null;
  const milestones = milestoneSignal.status === 'fulfilled' ? milestoneSignal.value : null;
  const twin = twinSignal.status === 'fulfilled' ? twinSignal.value : null;

  // ── Compute dimensions ──────────────────────────────────────────────────

  // Completeness: measured from the document status distribution.
  const completeness = computeCompleteness(docs);

  // Quality, consistency, compliance: only a recorded twin assessment measures
  // them. Without one they are null — see ReadinessDimensions. They used to be
  // 65 ± profile counts, the constant 70, and 80 − 5 per risk.
  const quality = twin?.qualityScore ?? null;
  const consistency = twin?.consistencyScore ?? null;
  const compliance = twin?.complianceScore ?? null;

  // ── Overall score: weighted average of the measured dimensions ──────────
  const { overallScore, measured, notMeasured } = weightMeasured({
    completeness, quality, consistency, compliance,
  });
  const scoreBasis: ReadinessScoreBasis = {
    source: twin ? 'twin_assessment' : 'no_assessment_on_record',
    measured,
    notMeasured,
  };

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
  // No recorded scores: unknown, not 'stable' with a delta of 0.
  const trend: TrendInfo = twin?.trend ?? {
    direction: 'unknown' as const,
    delta: null,
    dataPoints: 0,
  };

  // ── Predictions ─────────────────────────────────────────────────────────
  // No `??` fallbacks: see ReadinessPredictions. A missing twin assessment
  // yields nulls, not figures derived from overallScore.
  const predictions: ReadinessPredictions = {
    approvalProbability: twin?.approvalProbability ?? null,
    estimatedReviewDays: twin?.reviewTimeDays ?? null,
    estimatedDeficiencies: twin?.deficiencyCount ?? null,
    basis: twin ? 'twin_assessment' : 'no_assessment_on_record',
  };

  return {
    overallScore,
    dimensions: { completeness, quality, consistency, compliance },
    moduleBreakdown,
    gaps,
    trend,
    predictions,
    scoreBasis,
    scoredAt: now,
  };
}

const DIMENSION_WEIGHTS: Readonly<Record<ReadinessDimensionName, number>> = {
  completeness: 0.35,
  quality: 0.25,
  consistency: 0.20,
  compliance: 0.20,
};

/**
 * The weighted average over the dimensions that were measured, weights
 * re-normalised. All four measured: exactly the original formula.
 * Completeness alone: completeness. Exported for its test.
 */
export function weightMeasured(dims: ReadinessDimensions): {
  overallScore: number;
  measured: ReadinessDimensionName[];
  notMeasured: ReadinessDimensionName[];
} {
  const names = Object.keys(DIMENSION_WEIGHTS) as ReadinessDimensionName[];
  const measured = names.filter(n => dims[n] !== null);
  const notMeasured = names.filter(n => dims[n] === null);
  const totalWeight = measured.reduce((s, n) => s + DIMENSION_WEIGHTS[n], 0);
  const weighted = measured.reduce((s, n) => s + (dims[n] as number) * DIMENSION_WEIGHTS[n], 0);
  return { overallScore: Math.round(weighted / totalWeight), measured, notMeasured };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL GATHERERS
// ═══════════════════════════════════════════════════════════════════════════════

interface ProfileSignal {
  risks: Array<{ risk: string; impact: string; mitigation?: string }>;
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
    return { risks: [] };
  }

  // Risks feed the gap list. They no longer feed a dimension (ana-15).
  const risks = Array.isArray(profile.riskFactors) ? profile.riskFactors as ProfileSignal['risks'] : [];
  return { risks };
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
  } catch (e) {
    // A missing table (42P01) is a genuine "no documents" empty; any other error
    // is a real read failure and must propagate, so the readiness score is not
    // computed from — and its gap list not silently shortened by — a failed read.
    if ((e as { code?: string })?.code !== '42P01') throw e;
    return { total: 0, approved: 0, inReview: 0, draft: 0, staleDrafts: [] };
  }
}

interface MilestoneSignal {
  total: number;
  completed: number;
  // program_milestones.id is a uuid.
  overdue: Array<{ id: string; name: string }>;
  upcoming: Array<{ id: string; name: string; daysUntil: number }>;
}

async function gatherMilestoneSignal(ctx: ReadinessContext): Promise<MilestoneSignal> {
  try {
    // A project's milestones are those of its linked program:
    // projects.regulatory_program_id (uuid) -> regulatory_programs.id ->
    // program_milestones.program_id. regulatory_programs has no project_id
    // column; the earlier subquery on one raised 42703 on every estate, and
    // the fail-closed read below made every readiness score unavailable
    // (ana-15). A project with no linked program has no milestones: the
    // subquery is empty, which is an honest empty, not an error.
    // recommendation-engine.ts Generator 3 reads the same link.
    const result = await db.execute(sql`
      SELECT id, name, target_date, status
      FROM program_milestones
      WHERE program_id IN (
        SELECT rp.id
        FROM projects p
        JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id
        WHERE p.id = ${ctx.projectId}
          AND p.organization_id = ${ctx.organizationId}
          AND rp.organization_id = ${ctx.organizationId}
          AND rp.deleted_at IS NULL
      )
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    const now = new Date();

    const completed = rows.filter(r => r.status === 'completed').length;
    const overdue = rows
      .filter(r => r.target_date && new Date(r.target_date as string) < now && r.status !== 'completed' && r.status !== 'cancelled')
      .map(r => ({ id: String(r.id), name: String(r.name) }));

    const upcoming = rows
      .filter(r => {
        if (!r.target_date || r.status === 'completed' || r.status === 'cancelled') return false;
        const targetDate = new Date(r.target_date as string);
        const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 30;
      })
      .map(r => ({
        id: String(r.id),
        name: String(r.name),
        daysUntil: Math.ceil((new Date(r.target_date as string).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }));

    return { total: rows.length, completed, overdue, upcoming };
  } catch (e) {
    // See gatherDocumentSignal: only a missing table is a genuine empty. A real
    // failure here would otherwise drop overdue milestones — a critical gap that
    // feeds no numeric dimension — with zero trace on the score.
    if ((e as { code?: string })?.code !== '42P01') throw e;
    return { total: 0, completed: 0, overdue: [], upcoming: [] };
  }
}

// A column the assessment row leaves null is null here, not a default: the
// row used to read as quality/consistency/compliance 70, approval 0 and a
// 180-day review when those columns were empty (ana-15).
interface TwinSignal {
  overallScore: number | null;
  qualityScore: number | null;
  consistencyScore: number | null;
  complianceScore: number | null;
  moduleScores: Record<string, number>;
  approvalProbability: number | null;
  reviewTimeDays: number | null;
  deficiencyCount: number | null;
  trend: TrendInfo;
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function gatherTwinAssessment(ctx: ReadinessContext): Promise<TwinSignal | null> {
  if (!ctx.programId) return null;
  // The twin tables carry no organization column, and programId can come from
  // a query string (GET /api/intelligence/projects/:id/readiness). Read an
  // assessment only for this organization's live program; any other id has
  // none on record here (ana-15). A check that cannot run throws, and the
  // caller treats the twin as absent.
  if (!(await programInOrganization(getPool, ctx.programId, ctx.organizationId))) return null;

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
    // Fewer than two recorded scores: no trend to report.
    let direction: TrendInfo['direction'] = 'unknown';
    let delta: number | null = null;

    if (trendRows.length >= 2) {
      const latest = Number(trendRows[0].overall_score);
      const previous = Number(trendRows[1].overall_score);
      delta = latest - previous;
      direction = delta > 2 ? 'improving' : delta < -2 ? 'declining' : 'stable';
    }

    return {
      overallScore: numOrNull(row.overall_readiness_score),
      qualityScore: numOrNull(row.quality_score),
      consistencyScore: numOrNull(row.consistency_score),
      complianceScore: numOrNull(row.compliance_score),
      moduleScores: (row.module_scores as Record<string, number>) ?? {},
      approvalProbability: numOrNull(row.predicted_approval_probability),
      reviewTimeDays: numOrNull(row.predicted_review_time_days),
      deficiencyCount: numOrNull(row.predicted_deficiency_count),
      trend: { direction, delta, dataPoints: trendRows.length },
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEASURED DIMENSION
// ═══════════════════════════════════════════════════════════════════════════════
// estimateQuality (65 + 5 per decision − 3 per open question) and
// estimateCompliance (80 − 5 per risk − 10 per critical risk) were removed on
// 2026-10-08 (ana-15). Neither measured quality or compliance; their output
// was presented to AnA as a measured score. Without a twin assessment those
// dimensions are null. The risks still reach the gap list.

function computeCompleteness(docs: DocumentSignal | null): number {
  if (!docs || docs.total === 0) return 0;
  const approved = docs.approved;
  const inReview = docs.inReview * 0.7;
  const draft = docs.draft * 0.3;
  return Math.round(((approved + inReview + draft) / docs.total) * 100);
}
