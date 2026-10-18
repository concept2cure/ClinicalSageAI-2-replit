/**
 * Submission Readiness Twin Service
 *
 * Rule-based readiness scoring of a submission against criteria on file. It
 * checks whether content is present per criterion; it predicts no outcome and
 * judges no content quality, consistency or compliance (those dimensions are
 * recorded null).
 *
 * Features:
 * - Multi-criteria readiness evaluation (content presence; adequacy is not analysed)
 * - Module-level scoring and gap analysis
 * - Historical trend tracking
 */

import { Pool } from 'pg';
import {
  resolveToRegistryEntry,
  getSubmissionTypeContext,
  type SubmissionTypeContext,
} from '../../../shared/regulatory/submission-type-bridge.js';
import { releaseWithoutBypass } from './rlsBypassSession';

// Types
export interface ReadinessCriterion {
  id: string;
  submissionType: string;
  agency: string;
  modulePath?: string;
  criterionCode: string;
  criterionName: string;
  description: string;
  requirementType: 'mandatory' | 'conditional' | 'recommended';
  conditionExpression?: string;
  weight: number;
  impactOnRejection?: string;
  guidanceReference?: string;
  regulationReference?: string;
  isActive: boolean;
  effectiveDate?: Date;
}

export interface ReadinessTwinAssessment {
  id: string;
  programId: string;
  submissionId?: string;
  assessmentType: 'automated' | 'manual' | 'hybrid';
  submissionType: string;
  targetAgency: string;
  overallReadinessScore: number;
  moduleScores: Record<string, number>;
  completenessScore?: number;
  qualityScore?: number;
  consistencyScore?: number;
  complianceScore?: number;
  predictedApprovalProbability?: number;
  predictedReviewTimeDays?: number;
  predictedDeficiencyCount?: number;
  riskFactors?: Record<string, any>;
  status: string;
  assessedAt: Date;
}

export interface CriterionEvaluation {
  id: string;
  assessmentId: string;
  criterionId: string;
  /** 'applicability_undetermined': a conditional criterion with no content; never scored or stored as a row. */
  status: 'met' | 'partially_met' | 'not_met' | 'not_applicable' | 'applicability_undetermined';
  /** Null when the criterion was not scored. */
  score: number | null;
  evidenceSummary?: string;
  evidenceLocations?: string[];
  gapsIdentified?: string[];
  recommendations?: string[];
  estimatedEffortHours?: number;
}

export interface ReadinessTrend {
  id: string;
  programId: string;
  trendDate: Date;
  overallScore: number;
  moduleScores?: Record<string, number>;
  criteriaMet: number;
  criteriaTotal: number;
  scoreDelta?: number;
}

export interface ModuleReadiness {
  modulePath: string;
  moduleName: string;
  score: number;
  criteriaMet: number;
  criteriaTotal: number;
  gaps: string[];
  recommendations: string[];
  subModules?: ModuleReadiness[];
}

export interface ReadinessDashboard {
  overallScore: number;
  /** 'unknown' and a null delta with fewer than two recorded scores. */
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
  trendDelta: number | null;
  /**
   * Renamed from `predictedOutcome` on 2026-09-10. Nothing here is a
   * prediction: see calculatePredictions for what each field is and what the
   * previous three were computed from.
   */
  assessmentOutlook: {
    /** Null always — no approval-probability model exists. Kept so callers can say so. */
    approvalProbability: number | null;
    /** The agency's statutory review clock for the submission type, not a forecast. */
    reviewTimeDays: number | null;
    reviewClockBasis: string | null;
    /** Criteria scored not_met or partially_met by THIS assessment. */
    unmetCriteriaCount: number;
  };
  moduleReadiness: ModuleReadiness[];
  topRisks: Array<{
    risk: string;
    severity: string;
    impact: string;
    mitigation: string;
  }>;
  topRecommendations: Array<{
    priority: number;
    recommendation: string;
    effort: string;
    impact: string;
  }>;
  criteriaProgress: {
    met: number;
    partiallyMet: number;
    notMet: number;
    notApplicable: number;
    total: number;
  };
}

/** A stored number, or undefined when nothing was stored; a recorded 0 stays 0. */
const storedNumber = (v: unknown): number | undefined => (v == null ? undefined : Number(v));

export class SubmissionReadinessTwinService {
  private pool: Pool;
  private static tablesInitialized = false;

  constructor(pool: Pool, _openaiApiKey?: string) {
    this.pool = pool;
    this.ensureTables();
  }

  /**
   * Ensure all required DB tables exist (idempotent).
   * Uses the innovation schema to keep readiness twin data organized.
   */
  private async ensureTables(): Promise<void> {
    if (SubmissionReadinessTwinService.tablesInitialized) return;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(`CREATE SCHEMA IF NOT EXISTS innovation`);

        await client.query(`
          CREATE TABLE IF NOT EXISTS innovation.readiness_criteria (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            submission_type TEXT NOT NULL DEFAULT 'NDA',
            agency TEXT NOT NULL DEFAULT 'FDA',
            module_path TEXT,
            criterion_code TEXT NOT NULL,
            criterion_name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            requirement_type TEXT NOT NULL DEFAULT 'mandatory'
              CHECK (requirement_type IN ('mandatory','conditional','recommended')),
            condition_expression TEXT,
            weight NUMERIC NOT NULL DEFAULT 1.0,
            impact_on_rejection TEXT,
            guidance_reference TEXT,
            regulation_reference TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            effective_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (submission_type, agency, criterion_code)
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS innovation.readiness_twin_assessments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            program_id TEXT NOT NULL,
            submission_id TEXT,
            assessment_type TEXT NOT NULL DEFAULT 'automated',
            submission_type TEXT NOT NULL,
            target_agency TEXT NOT NULL,
            overall_readiness_score NUMERIC NOT NULL DEFAULT 0,
            module_scores JSONB DEFAULT '{}'::jsonb,
            completeness_score NUMERIC,
            quality_score NUMERIC,
            consistency_score NUMERIC,
            compliance_score NUMERIC,
            predicted_approval_probability NUMERIC,
            predicted_review_time_days INTEGER,
            predicted_deficiency_count INTEGER,
            risk_factors JSONB,
            status TEXT NOT NULL DEFAULT 'pending',
            assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS innovation.readiness_criterion_evaluations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            assessment_id UUID NOT NULL REFERENCES innovation.readiness_twin_assessments(id) ON DELETE CASCADE,
            criterion_id UUID NOT NULL,
            status TEXT NOT NULL DEFAULT 'not_met'
              CHECK (status IN ('met','partially_met','not_met','not_applicable')),
            score NUMERIC NOT NULL DEFAULT 0,
            evidence_summary TEXT,
            evidence_locations TEXT[],
            gaps_identified TEXT[],
            recommendations TEXT[],
            estimated_effort_hours NUMERIC,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS innovation.readiness_trends (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            program_id TEXT NOT NULL,
            trend_date DATE NOT NULL DEFAULT CURRENT_DATE,
            overall_score NUMERIC NOT NULL DEFAULT 0,
            module_scores JSONB,
            criteria_met_count INTEGER NOT NULL DEFAULT 0,
            criteria_total_count INTEGER NOT NULL DEFAULT 0,
            score_delta NUMERIC,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (program_id, trend_date)
          )
        `);

        // 2026-10-15: an empty criteria table used to be seeded here with 20 FDA
        // NDA criteria and invented weights — seed data outside the migration
        // set (CLAUDE.md RULE 1), keyed 'NDA' where getCriteria looks up
        // 'US_NDA', so nothing ever read them. Criteria come from
        // db/migrations/072 or createCriteria; with none on file an assessment
        // refuses.
        SubmissionReadinessTwinService.tablesInitialized = true;
        console.log('[ReadinessTwin] All tables initialized successfully');
      } finally {
        await releaseWithoutBypass(client);
      }
    } catch (err) {
      console.warn('[ReadinessTwin] Table initialization warning:', (err as Error).message);
    }
  }

  /**
   * Create readiness criteria using simplified input
   */
  async createCriteria(input: {
    programId: string;
    category: string;
    name: string;
    description: string;
    weight: number;
    evaluationMethod?: string;
    requiredDocuments?: string[];
  }): Promise<ReadinessCriterion> {
    const criterionCode = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40);
    const client = await this.pool.connect();
    try {
      await client.query("SET app.bypass_rls = 'true'");
      await client.query("SET app.is_admin = 'true'");
      // Resolve submission type through the canonical bridge
      const subTypeCtx = getSubmissionTypeContext('NDA');
      const resolvedSubType = subTypeCtx?.registryId ?? 'US_NDA';
      const resolvedAgency = subTypeCtx?.agency ?? 'FDA';

      const result = await client.query(
        `
        INSERT INTO innovation.readiness_criteria (
          submission_type, agency, module_path, criterion_code,
          criterion_name, description, requirement_type, weight,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        RETURNING *
      `,
        [
          resolvedSubType,
          resolvedAgency,
          input.category,
          criterionCode,
          input.name,
          input.description,
          'mandatory',
          input.weight,
        ]
      );

      const row = result?.rows?.[0];
      // 2026-10-15: no row used to return a criterion with a random id, kept
      // only in process memory, as if it had been stored.
      if (!row) throw new Error(`Readiness criterion "${input.name}" was not recorded: the INSERT returned no row.`);
      return this.mapCriterion(row);
    } finally {
      await releaseWithoutBypass(client);
    }
  }

  /**
   * Get all criteria for a submission type and agency
   */
  async getCriteria(
    submissionTypeOrProgramId: string,
    agency?: string
  ): Promise<ReadinessCriterion[]> {
    if (agency) {
      // Resolve submission type through the canonical bridge
      const entry = resolveToRegistryEntry(submissionTypeOrProgramId);
      const resolvedSubType = entry?.id ?? submissionTypeOrProgramId;

      const result = await this.pool.query(
        `
        SELECT * FROM innovation.readiness_criteria
        WHERE submission_type = $1
          AND agency = $2
          AND is_active = TRUE
          AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
        ORDER BY module_path, criterion_code
      `,
        [resolvedSubType, agency]
      );

      return result.rows.map(this.mapCriterion);
    }

    const result = await this.pool.query(`
      SELECT * FROM innovation.readiness_criteria
      WHERE is_active = TRUE
      ORDER BY module_path, criterion_code
    `);

    return result.rows.map(this.mapCriterion);
  }

  /**
   * Run a comprehensive readiness assessment
   */
  async runAssessment(
    programIdOrOptions:
      | string
      | {
          programId: string;
          submissionType: string;
          targetAgency: string;
        },
    submissionType?: string,
    targetAgency?: string,
    documentData?: Map<string, any>
  ): Promise<any> {
    if (typeof programIdOrOptions !== 'string') {
      const assessment = await this.runAssessmentInternal(
        programIdOrOptions.programId,
        programIdOrOptions.submissionType,
        programIdOrOptions.targetAgency,
        documentData
      );

      const categoryScores = Object.entries(assessment.moduleScores || {}).map(
        ([category, score]) => ({
          category,
          score,
        })
      );

      return {
        ...assessment,
        overallScore: assessment.overallReadinessScore,
        categoryScores,
      };
    }

    return this.runAssessmentInternal(
      programIdOrOptions,
      submissionType!,
      targetAgency!,
      documentData
    );
  }

  private async runAssessmentInternal(
    programId: string,
    submissionType: string,
    targetAgency: string,
    documentData?: Map<string, any>
  ): Promise<ReadinessTwinAssessment> {
    // Resolve submission type through the canonical bridge
    const entry = resolveToRegistryEntry(submissionType);
    const resolvedSubType = entry?.id ?? submissionType;
    if (entry && !targetAgency) {
      const ctx = getSubmissionTypeContext(resolvedSubType);
      if (ctx) targetAgency = ctx.agency;
    }

    const client = await this.pool.connect();

    try {
      await client.query("SET app.bypass_rls = 'true'");
      await client.query("SET app.is_admin = 'true'");
      await client.query('BEGIN');

      // Get applicable criteria
      const criteria = await this.getCriteria(resolvedSubType, targetAgency);
      // 2026-10-15: with no criteria this recorded a completed assessment
      // scoring 0 (completeness 100, consistency 100) for nothing assessed.
      if (criteria.length === 0) {
        throw new Error(
          `No readiness criteria on file for ${resolvedSubType} / ${targetAgency}: there is nothing to assess, so no readiness score is recorded.`
        );
      }

      // Evaluate each criterion. An unscored one (score null) is kept for the
      // risk list but contributes to no score and no denominator.
      const evaluations: CriterionEvaluation[] = [];
      const scored: CriterionEvaluation[] = [];
      let totalWeightedScore = 0;
      let totalWeight = 0;

      const moduleScores = new Map<string, { score: number; weight: number }>();

      for (const criterion of criteria) {
        const evaluation = await this.evaluateCriterion(criterion, documentData);
        evaluations.push(evaluation);
        if (evaluation.score === null) continue;
        scored.push(evaluation);

        // Accumulate scores
        const weightedScore = evaluation.score * criterion.weight;
        totalWeightedScore += weightedScore;
        totalWeight += criterion.weight;

        // Track module scores
        const module = criterion.modulePath || 'general';
        const existing = moduleScores.get(module) || { score: 0, weight: 0 };
        existing.score += weightedScore;
        existing.weight += criterion.weight;
        moduleScores.set(module, existing);
      }

      if (totalWeight === 0) {
        throw new Error(
          `None of the ${criteria.length} readiness criteria on file for ${resolvedSubType} / ${targetAgency} could be scored (the applicability of each was not determined), so no readiness score is recorded.`
        );
      }
      const overallScore = totalWeightedScore / totalWeight;

      // Calculate module-level scores
      const moduleScoreObj: Record<string, number> = {};
      for (const [module, data] of moduleScores) {
        if (data.weight > 0) moduleScoreObj[module] = data.score / data.weight;
      }

      // Calculate dimension scores
      const dimensionScores = this.calculateDimensionScores(scored, criteria);

      // Generate predictions
      const predictions = await this.calculatePredictions(
        overallScore,
        scored,
        submissionType,
        targetAgency
      );

      // Identify risk factors
      const riskFactors = this.identifyRiskFactors(evaluations, criteria);

      // Create assessment record
      const assessmentResult = await client.query(
        `
        INSERT INTO innovation.readiness_twin_assessments (
          program_id, assessment_type, submission_type, target_agency,
          overall_readiness_score, module_scores,
          completeness_score, quality_score, consistency_score, compliance_score,
          predicted_approval_probability, predicted_review_time_days,
          predicted_deficiency_count, risk_factors, status
        ) VALUES (
          $1, 'automated', $2, $3,
          $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, 'completed'
        )
        RETURNING *
      `,
        [
          programId,
          // The registry id getDashboard reads by; the type as typed ('NDA')
          // was filed where the dashboard looks for 'US_NDA' (2026-10-15).
          resolvedSubType,
          targetAgency,
          overallScore,
          JSON.stringify(moduleScoreObj),
          dimensionScores.completeness,
          dimensionScores.quality,
          dimensionScores.consistency,
          dimensionScores.compliance,
          // predicted_approval_probability is now written NULL rather than the
          // rescaled readiness score. The column stays (RULE 1: removing it
          // means amending its creator, and it is the right home for a real
          // model's output if one is ever built) but nothing fabricates a value
          // into it. Rows written before 2026-09-10 still hold the old
          // heuristic — getDashboard therefore ignores the stored value rather
          // than reading it back.
          predictions.approvalProbability,
          predictions.reviewTimeDays,
          predictions.unmetCriteriaCount,
          JSON.stringify(riskFactors),
        ]
      );

      const assessmentRow = assessmentResult?.rows?.[0];
      // 2026-10-15: no row used to COMMIT and return an assessment with a
      // random id, kept only in process memory, as if it had been stored.
      if (!assessmentRow) {
        throw new Error(`Readiness assessment for program ${programId} was not recorded: the INSERT returned no row.`);
      }

      const assessment = this.mapAssessment(assessmentRow);

      // Store criterion evaluations. An unscored criterion has no row (score is
      // NOT NULL); it is on the assessment's risk factors instead.
      for (const evaluation of scored) {
        await client.query(
          `
          INSERT INTO innovation.readiness_criterion_evaluations (
            assessment_id, criterion_id, status, score,
            evidence_summary, evidence_locations, gaps_identified,
            recommendations, estimated_effort_hours
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
          [
            assessment.id,
            evaluation.criterionId,
            evaluation.status,
            evaluation.score,
            evaluation.evidenceSummary,
            evaluation.evidenceLocations,
            evaluation.gapsIdentified,
            evaluation.recommendations,
            evaluation.estimatedEffortHours ?? null,
          ]
        );
      }

      // Record trend data
      await this.recordTrend(client, programId, overallScore, moduleScoreObj, scored);

      await client.query('COMMIT');

      console.log(`[ReadinessTwin] Assessment completed: score=${overallScore.toFixed(1)}`);
      return assessment;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[ReadinessTwin] Assessment failed:', error);
      throw error;
    } finally {
      await releaseWithoutBypass(client);
    }
  }

  /**
   * Evaluate a single criterion
   */
  private async evaluateCriterion(
    criterion: ReadinessCriterion,
    documentData?: Map<string, any>
  ): Promise<CriterionEvaluation> {
    // For now, use a rule-based evaluation
    // In production, this would integrate with actual document analysis

    // No effort estimate is attached: the 4 h / 16 h figures this carried until
    // 2026-10-15 were invented, and the AnA tool ranked recommendations by them.
    let status: CriterionEvaluation['status'];
    let score: number | null;
    const gaps: string[] = [];
    const recommendations: string[] = [];

    // Check if we have document data for this module
    const hasContent =
      documentData?.has(criterion.modulePath || '') || documentData?.has(criterion.criterionCode);

    if (hasContent) {
      // Content for this criterion is present, but automated content analysis
      // is not implemented (see note above). This previously drew a
      // Math.random() value and declared the criterion met/partially-met/not-met
      // with a 100/60/20 score — a fabricated readiness verdict that changed on
      // every run and could falsely report a criterion as fully satisfied.
      // Until real document analysis exists, report the conservative, honest
      // state: content is present but unverified, so treat it as partially met
      // and explicitly flag it for manual review rather than claim it satisfied.
      status = 'partially_met';
      score = 50;
      gaps.push(
        `Criterion "${criterion.criterionName}" has content present, but automated content analysis is not yet implemented; it requires manual review to confirm adequacy.`
      );
      recommendations.push(`Manually review content for: ${criterion.description}`);
    } else {
      // No content for this criterion
      if (criterion.requirementType === 'mandatory') {
        status = 'not_met';
        score = 0;
        gaps.push(`Missing mandatory content: ${criterion.criterionName}`);
        recommendations.push(`Create content for: ${criterion.description}`);
      } else if (criterion.requirementType === 'conditional') {
        // 2026-10-15: this was 'not_applicable' scoring 100, so every
        // unaddressed conditional requirement raised readiness. Nothing here
        // evaluates the condition, so whether it applies is undetermined.
        status = 'applicability_undetermined';
        score = null;
        gaps.push(
          `Applicability not determined: ${criterion.criterionName}. Its condition${criterion.conditionExpression ? ` (${criterion.conditionExpression})` : ''} is not evaluated here, and no content was found.`
        );
        recommendations.push(`Determine whether this applies: ${criterion.description}`);
      } else {
        status = 'not_met';
        score = 30;
        gaps.push(`Recommended content missing: ${criterion.criterionName}`);
        recommendations.push(`Consider adding: ${criterion.description}`);
      }
    }

    return {
      id: '', // Will be set by DB
      assessmentId: '', // Will be set by caller
      criterionId: criterion.id,
      status,
      score,
      evidenceSummary: hasContent
        ? 'Content found in submission documents'
        : 'No matching content found',
      evidenceLocations: hasContent ? [criterion.modulePath || 'general'] : [],
      gapsIdentified: gaps,
      recommendations,
    };
  }

  /**
   * Calculate dimension scores
   */
  private calculateDimensionScores(
    evaluations: CriterionEvaluation[],
    criteria: ReadinessCriterion[]
  ): {
    completeness: number | null;
    quality: null;
    consistency: null;
    compliance: null;
  } {
    /* 2026-10-15. This evaluator determines one thing per criterion: whether
       content is present. It used to report four dimensions anyway —
       completeness 100 with no mandatory criterion on file, and otherwise a
       share of criteria 'met', which only a review it does not perform could
       set, so 0 whatever was present; quality, the mean of the same criterion
       scores; consistency, 100 minus their spread (100 for an empty dossier);
       compliance, a gap-free share no automated run could raise above 0.
       Completeness is now what is measured — mandatory criteria with content
       present (presence, not adequacy), null when none is on file. The other
       three compare or judge content, which nothing here does: null. */
    const mandatory = criteria.filter(c => c.requirementType === 'mandatory');
    const present = evaluations.filter(
      e =>
        (e.status === 'met' || e.status === 'partially_met') &&
        mandatory.some(c => c.id === e.criterionId)
    );
    const completeness = mandatory.length > 0 ? (present.length / mandatory.length) * 100 : null;

    return { completeness, quality: null, consistency: null, compliance: null };
  }

  /**
   * Generate predictions based on assessment
   */
  private async calculatePredictions(
    overallScore: number,
    evaluations: CriterionEvaluation[],
    submissionType: string,
    agency: string
  ): Promise<{
    approvalProbability: null;
    reviewTimeDays: number | null;
    reviewClockBasis: string | null;
    unmetCriteriaCount: number;
  }> {
    /* ── 2026-09-10: this method used to return three "predictions" ───────────
       Its own comment read "Simple prediction model based on score. In
       production, this would use ML models trained on historical data." It was
       never replaced, and the three values were not equally wrong, so they are
       not treated equally here.

       1. approvalProbability was
              (overallScore / 100) * 0.8  -  criticalGaps * 0.05,
          clamped to [0.1, 0.95]. That is the readiness score rescaled. No
          approval outcome, no historical cohort and no comparator is consulted
          anywhere in this service, so there is nothing it could be a
          probability OF. It is removed rather than adjusted: there is no
          smaller true version of it. Callers get null.

       2. reviewTimeDays was a lookup on submission type plus `criticalGaps * 30`
          ("Each gap adds ~30 days"). The LOOKUP is real reference data — these
          are the statutory and user-fee review clocks, not estimates — but the
          per-gap addition is invented, and adding it to a statutory figure made
          the whole number look like a forecast. The clock is kept and labelled
          as a clock; the addition is gone.

       3. deficiencyCount was a count of criteria this assessment itself scored
          not_met or partially_met. That is an honest count of a present state
          and the only defensible number of the three — but "deficiency" is what
          an agency issues after review, so the name asserted a forecast the
          arithmetic never made. Renamed to unmetCriteriaCount. */

    // FDA review clocks by submission type. Keyed by both legacy and registry
    // IDs so any resolved form matches.
    //   IND      21 CFR 312.40 — 30-day safety review before a study may begin
    //   NDA/BLA  PDUFA standard review, ~10 months from the 60-day filing date
    //   510(k)   MDUFA — 90 FDA days
    //   PMA      FD&C Act 515(d)(1) — 180 days
    // These describe the AGENCY'S clock for the submission type. They are not a
    // prediction about this program, and nothing about this program's content
    // moves them.
    const statutoryReviewDays: Record<string, number> = {
      IND: 30,   US_IND: 30,
      NDA: 300,  US_NDA: 300,
      BLA: 300,  US_BLA: 300,
      '510k': 90, US_510K: 90,
      PMA: 180,  US_PMA: 180,
    };
    const entryForReview = resolveToRegistryEntry(submissionType);
    const resolvedKey = entryForReview?.id ?? submissionType;
    const reviewTimeDays =
      statutoryReviewDays[resolvedKey] ?? statutoryReviewDays[submissionType] ?? null;

    const unmetCriteriaCount = evaluations.filter(
      e => e.status === 'not_met' || e.status === 'partially_met'
    ).length;

    return {
      approvalProbability: null,
      reviewTimeDays,
      // An unrecognised submission type previously fell back to 180 — the PMA
      // clock — for anything unknown. Now it yields null and says so.
      reviewClockBasis:
        reviewTimeDays === null
          ? null
          : `statutory/user-fee review clock for ${resolvedKey}; not adjusted for this program`,
      unmetCriteriaCount,
    };
  }

  /**
   * The latest recorded overall readiness score — not a forecast; null when the
   * program has no assessment. Until 2026-10-15 this returned it as
   * `predictedScore` (0 when there was none) with an invented ±5 interval.
   */
  async generatePredictions(programId: string): Promise<{ latestRecordedScore: number | null }> {
    const result = await this.pool.query(
      `
      SELECT overall_readiness_score
      FROM innovation.readiness_twin_assessments
      WHERE program_id = $1
      ORDER BY assessed_at DESC
      LIMIT 1
    `,
      [programId]
    );

    return {
      latestRecordedScore:
        result.rows.length > 0 ? parseFloat(result.rows[0].overall_readiness_score) : null,
    };
  }

  /**
   * Analyze readiness trends
   */
  async analyzeTrends(
    programId: string,
    options?: { lookbackDays?: number }
  ): Promise<{ trendData: ReadinessTrend[] }> {
    const trendData = await this.getTrendData(programId, options?.lookbackDays || 30);
    return { trendData };
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(
    evaluations: CriterionEvaluation[],
    criteria: ReadinessCriterion[]
  ): Array<{
    risk: string;
    severity: string;
    impact: string;
    mitigation: string;
  }> {
    const risks: Array<{
      risk: string;
      severity: string;
      impact: string;
      mitigation: string;
    }> = [];
    // Conditional requirements nobody determined: listed in full, after the top gaps.
    const undetermined: typeof risks = [];

    for (const evaluation of evaluations) {
      if (evaluation.status === 'applicability_undetermined') {
        const criterion = criteria.find(c => c.id === evaluation.criterionId);
        if (!criterion) continue;
        undetermined.push({
          risk: `Applicability not determined: ${criterion.criterionName}`,
          severity: criterion.impactOnRejection || 'medium',
          impact: 'Unknown until someone determines whether this conditional requirement applies',
          mitigation: evaluation.recommendations?.[0] || `Determine whether ${criterion.criterionName} applies`,
        });
      } else if (evaluation.status === 'not_met' || evaluation.status === 'partially_met') {
        const criterion = criteria.find(c => c.id === evaluation.criterionId);
        if (!criterion) continue;

        const severity =
          criterion.impactOnRejection ||
          (criterion.requirementType === 'mandatory' ? 'high' : 'medium');

        risks.push({
          risk: `Gap in: ${criterion.criterionName}`,
          severity,
          impact:
            criterion.requirementType === 'mandatory'
              ? 'May result in refuse-to-file or complete response letter'
              : 'May result in information request',
          mitigation: evaluation.recommendations?.[0] || 'Address the identified gap',
        });
      }
    }

    // Sort by severity. `?? 2`, not `|| 2`: 'high' is 0, and `|| 2` sorted it
    // with 'low', below every 'medium' — so a mandatory gap could fall outside
    // the top ten (2026-10-15).
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    risks.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

    return [...risks.slice(0, 10), ...undetermined]; // Top 10 gaps, then every undetermined requirement
  }

  /**
   * Record trend data point
   */
  private async recordTrend(
    client: any,
    programId: string,
    overallScore: number,
    moduleScores: Record<string, number>,
    evaluations: CriterionEvaluation[]
  ): Promise<void> {
    const criteriaMet = evaluations.filter(e => e.status === 'met').length;
    const criteriaTotal = evaluations.length;

    // Get previous score for delta calculation
    const prevResult = await client.query(
      `
      SELECT overall_score FROM innovation.readiness_trends
      WHERE program_id = $1
      ORDER BY trend_date DESC
      LIMIT 1
    `,
      [programId]
    );

    const scoreDelta =
      prevResult.rows.length > 0
        ? overallScore - parseFloat(prevResult.rows[0].overall_score)
        : null;

    await client.query(
      `
      INSERT INTO innovation.readiness_trends (
        program_id, trend_date, overall_score, module_scores,
        criteria_met_count, criteria_total_count, score_delta
      ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6)
      ON CONFLICT (program_id, trend_date) DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        module_scores = EXCLUDED.module_scores,
        criteria_met_count = EXCLUDED.criteria_met_count,
        criteria_total_count = EXCLUDED.criteria_total_count,
        score_delta = EXCLUDED.score_delta
    `,
      [
        programId,
        overallScore,
        JSON.stringify(moduleScores),
        criteriaMet,
        criteriaTotal,
        scoreDelta,
      ]
    );
  }

  /**
   * Get full dashboard data
   */
  async getDashboard(
    programId: string,
    submissionType: string,
    agency: string
  ): Promise<ReadinessDashboard> {
    // Resolve submission type through the canonical bridge
    const entry = resolveToRegistryEntry(submissionType);
    const resolvedSubType = entry?.id ?? submissionType;

    // Get latest assessment
    const assessmentResult = await this.pool.query(
      `
      SELECT * FROM innovation.readiness_twin_assessments
      WHERE program_id = $1 AND submission_type = $2 AND target_agency = $3
      ORDER BY assessed_at DESC
      LIMIT 1
    `,
      [programId, resolvedSubType, agency]
    );

    if (assessmentResult.rows.length === 0) {
      // Return empty dashboard if no assessment exists
      return this.getEmptyDashboard();
    }

    const assessment = this.mapAssessment(assessmentResult.rows[0]);

    // Get evaluations
    const evalsResult = await this.pool.query(
      `
      SELECT ce.*, rc.criterion_name, rc.module_path, rc.requirement_type
      FROM innovation.readiness_criterion_evaluations ce
      JOIN innovation.readiness_criteria rc ON rc.id = ce.criterion_id
      WHERE ce.assessment_id = $1
    `,
      [assessment.id]
    );

    // Get trend data
    const trendResult = await this.pool.query(
      `
      SELECT * FROM innovation.readiness_trends
      WHERE program_id = $1
      ORDER BY trend_date DESC
      LIMIT 30
    `,
      [programId]
    );

    // Calculate trend direction. Fewer than two recorded scores is no trend:
    // until 2026-10-15 that read 'stable' with a delta of 0.
    const trends = trendResult.rows;
    let trendDirection: ReadinessDashboard['trend'] = 'unknown';
    let trendDelta: number | null = null;

    if (trends.length >= 2) {
      trendDirection = 'stable';
      const latestScore = parseFloat(trends[0].overall_score);
      const previousScore = parseFloat(trends[1].overall_score);
      trendDelta = latestScore - previousScore;

      if (trendDelta > 2) trendDirection = 'improving';
      else if (trendDelta < -2) trendDirection = 'declining';
    }

    // Build module readiness
    const moduleReadiness = this.buildModuleReadiness(evalsResult.rows);

    // Build criteria progress
    const criteriaProgress = {
      met: evalsResult.rows.filter((e: any) => e.status === 'met').length,
      partiallyMet: evalsResult.rows.filter((e: any) => e.status === 'partially_met').length,
      notMet: evalsResult.rows.filter((e: any) => e.status === 'not_met').length,
      notApplicable: evalsResult.rows.filter((e: any) => e.status === 'not_applicable').length,
      total: evalsResult.rows.length,
    };

    // Build top recommendations
    const recommendations = evalsResult.rows
      .filter((e: any) => e.recommendations && e.recommendations.length > 0)
      .sort((a: any, b: any) => {
        const aIsMandatory = a.requirement_type === 'mandatory';
        const bIsMandatory = b.requirement_type === 'mandatory';
        if (aIsMandatory && !bIsMandatory) return -1;
        if (!aIsMandatory && bIsMandatory) return 1;
        return (b.estimated_effort_hours || 0) - (a.estimated_effort_hours || 0);
      })
      .slice(0, 5)
      .map((e: any, i: number) => ({
        priority: i + 1,
        recommendation: e.recommendations[0],
        effort: e.estimated_effort_hours != null ? `${e.estimated_effort_hours} hours` : 'not estimated',
        impact: e.requirement_type === 'mandatory' ? 'High' : 'Medium',
      }));

    return {
      overallScore: assessment.overallReadinessScore,
      trend: trendDirection,
      trendDelta,
      assessmentOutlook: {
        // `|| 0` previously turned "never recorded" into a hard zero — a 0%
        // approval probability and a 0-day review clock, both indistinguishable
        // from measured values. Absent is now absent.
        approvalProbability: null,
        reviewTimeDays: assessment.predictedReviewTimeDays ?? null,
        reviewClockBasis:
          assessment.predictedReviewTimeDays == null
            ? null
            : 'statutory/user-fee review clock recorded with this assessment',
        // Counted from the evaluations read above. `predictedDeficiencyCount ?? 0`
        // turned a NULL stored count into "no unmet criteria" (2026-10-15).
        unmetCriteriaCount: criteriaProgress.notMet + criteriaProgress.partiallyMet,
      },
      moduleReadiness,
      topRisks: (assessment.riskFactors as any[]) || [],
      topRecommendations: recommendations,
      criteriaProgress,
    };
  }

  /**
   * Build module readiness hierarchy
   */
  private buildModuleReadiness(evaluations: any[]): ModuleReadiness[] {
    const moduleMap = new Map<
      string,
      {
        name: string;
        scores: number[];
        gaps: string[];
        recommendations: string[];
      }
    >();

    for (const eval_ of evaluations) {
      const module = eval_.module_path || 'general';
      const existing = moduleMap.get(module) || {
        name: this.getModuleName(module),
        scores: [],
        gaps: [],
        recommendations: [],
      };

      // Number(): a NUMERIC column arrives as text, and `+` concatenated it
      // ('50' and '0' averaged to 250) until 2026-10-15.
      existing.scores.push(Number(eval_.score));
      if (eval_.gaps_identified) {
        existing.gaps.push(...eval_.gaps_identified);
      }
      if (eval_.recommendations) {
        existing.recommendations.push(...eval_.recommendations);
      }

      moduleMap.set(module, existing);
    }

    const modules: ModuleReadiness[] = [];
    for (const [path, data] of moduleMap) {
      const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      modules.push({
        modulePath: path,
        moduleName: data.name,
        score: avgScore,
        criteriaMet: data.scores.filter(s => s >= 80).length,
        criteriaTotal: data.scores.length,
        gaps: [...new Set(data.gaps)].slice(0, 5),
        recommendations: [...new Set(data.recommendations)].slice(0, 5),
      });
    }

    // Sort by module path
    modules.sort((a, b) => a.modulePath.localeCompare(b.modulePath));

    return modules;
  }

  /**
   * Get human-readable module name
   */
  private getModuleName(path: string): string {
    const names: Record<string, string> = {
      m1: 'Module 1: Administrative',
      m2: 'Module 2: Summaries',
      'm2.3': 'Module 2.3: Quality Summary',
      'm2.4': 'Module 2.4: Nonclinical Overview',
      'm2.5': 'Module 2.5: Clinical Overview',
      'm2.6': 'Module 2.6: Nonclinical Summary',
      'm2.7': 'Module 2.7: Clinical Summary',
      m3: 'Module 3: Quality',
      'm3.2.s': 'Module 3.2.S: Drug Substance',
      'm3.2.p': 'Module 3.2.P: Drug Product',
      m4: 'Module 4: Nonclinical',
      m5: 'Module 5: Clinical',
      general: 'General Requirements',
    };
    return names[path] || path;
  }

  /**
   * Get empty dashboard structure
   */
  private getEmptyDashboard(): ReadinessDashboard {
    return {
      overallScore: 0,
      trend: 'unknown',
      trendDelta: null,
      // The empty dashboard: no assessment on record. The outlook figures are
      // null; overallScore and the counts are 0 only because their types are
      // numbers, and every reader detects this state by criteriaProgress.total
      // === 0 and refuses (AnaToolExecutor, report-os model-adapters) — a zero
      // here is "byte-identical to a genuinely terrible program".
      assessmentOutlook: {
        approvalProbability: null,
        reviewTimeDays: null,
        reviewClockBasis: null,
        unmetCriteriaCount: 0,
      },
      moduleReadiness: [],
      topRisks: [],
      topRecommendations: [],
      criteriaProgress: {
        met: 0,
        partiallyMet: 0,
        notMet: 0,
        notApplicable: 0,
        total: 0,
      },
    };
  }

  /**
   * Get assessment history
   */
  async getAssessmentHistory(
    programId: string,
    limit: number = 10
  ): Promise<ReadinessTwinAssessment[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM innovation.readiness_twin_assessments
      WHERE program_id = $1
      ORDER BY assessed_at DESC
      LIMIT $2
    `,
      [programId, limit]
    );

    return result.rows.map(this.mapAssessment);
  }

  /**
   * Get trend data for charts
   */
  async getTrendData(programId: string, days: number = 30): Promise<ReadinessTrend[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM innovation.readiness_trends
      WHERE program_id = $1
        AND trend_date > CURRENT_DATE - INTERVAL '1 day' * $2
      ORDER BY trend_date ASC
    `,
      [programId, days]
    );

    return result.rows.map(this.mapTrend);
  }

  /**
   * Map database row to criterion
   */
  private mapCriterion(row: any): ReadinessCriterion {
    return {
      id: row.id,
      submissionType: row.submission_type,
      agency: row.agency,
      modulePath: row.module_path,
      criterionCode: row.criterion_code,
      criterionName: row.criterion_name,
      description: row.description,
      requirementType: row.requirement_type,
      conditionExpression: row.condition_expression,
      weight: parseFloat(row.weight),
      impactOnRejection: row.impact_on_rejection,
      guidanceReference: row.guidance_reference,
      regulationReference: row.regulation_reference,
      isActive: row.is_active,
      effectiveDate: row.effective_date,
    };
  }

  /**
   * Map database row to assessment
   */
  private mapAssessment(row: any): ReadinessTwinAssessment {
    return {
      id: row.id,
      programId: row.program_id,
      submissionId: row.submission_id,
      assessmentType: row.assessment_type,
      submissionType: row.submission_type,
      targetAgency: row.target_agency,
      overallReadinessScore: parseFloat(row.overall_readiness_score),
      moduleScores: row.module_scores || {},
      // storedNumber, not a truthiness test, which read a recorded 0 as
      // absent (2026-10-15).
      completenessScore: storedNumber(row.completeness_score),
      qualityScore: storedNumber(row.quality_score),
      consistencyScore: storedNumber(row.consistency_score),
      complianceScore: storedNumber(row.compliance_score),
      predictedApprovalProbability: storedNumber(row.predicted_approval_probability),
      predictedReviewTimeDays: storedNumber(row.predicted_review_time_days),
      predictedDeficiencyCount: storedNumber(row.predicted_deficiency_count),
      riskFactors: row.risk_factors,
      status: row.status,
      assessedAt: row.assessed_at,
    };
  }

  /**
   * Map database row to trend
   */
  private mapTrend(row: any): ReadinessTrend {
    return {
      id: row.id,
      programId: row.program_id,
      trendDate: row.trend_date,
      overallScore: parseFloat(row.overall_score),
      moduleScores: row.module_scores,
      criteriaMet: parseInt(row.criteria_met_count),
      criteriaTotal: parseInt(row.criteria_total_count),
      scoreDelta: storedNumber(row.score_delta),
    };
  }
}

export default SubmissionReadinessTwinService;
