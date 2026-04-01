/**
 * Advisory Committee Risk Factor Engine
 *
 * Models FDA Advisory Committee dynamics: voting patterns, panelist sensitivities,
 * question prediction, and preparation strategies for ODAC, CRDAC, etc.
 *
 * @module server/services/regulatory-precedent-intelligence/advisory-committee-service
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('advisory-committee-service');

// ─── Types ───────────────────────────────────────────────────────────────────

export type ACRiskCategory =
  | 'safety_signal'
  | 'efficacy_uncertainty'
  | 'benefit_risk_balance'
  | 'surrogate_endpoint'
  | 'single_trial'
  | 'subgroup_effects'
  | 'comparator_choice'
  | 'missing_data'
  | 'unmet_need'
  | 'pediatric_extrapolation'
  | 'real_world_evidence'
  | 'accelerated_conversion'
  | 'biosimilar_interchangeability'
  | 'labeling_scope';

export interface AdvisoryCommitteePattern {
  id: string;
  organizationId: string;
  patternCode: string;
  patternName: string;
  committeeType: string;
  riskCategory: ACRiskCategory;
  typicalQuestions: string[];
  votingQuestionTemplates: string[];
  historicalFrequency: number;
  negativeVoteCorrelation: number;
  fdaOverrideRate: number;
  panelistSensitivity: Record<string, number>;
  consumerRepImpact: number;
  statisticianFocusAreas: string[];
  mitigationStrategies: string[];
  recommendedPresentations: string[];
  counterargumentFrameworks: CounterargumentFramework[];
  createdAt: string;
  updatedAt: string;
}

export interface CounterargumentFramework {
  concern: string;
  counterargument: string;
  supportingEvidence: string;
  effectivenessRating: number;
}

export interface ACRiskAssessment {
  committeeType: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  favorableVoteProbability: number;
  riskFactors: ACRiskFactor[];
  preparationPlan: ACPreparationItem[];
  fdaOverrideLikelihood: number;
  keyQuestions: string[];
}

export interface ACRiskFactor {
  category: ACRiskCategory;
  pattern: string;
  negativeVoteCorrelation: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
}

export interface ACPreparationItem {
  area: string;
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  presentationType: string;
  estimatedPrepDays: number;
}

export interface ACSearchInput {
  organizationId: string;
  committeeType?: string;
  riskCategory?: ACRiskCategory;
  limit?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class AdvisoryCommitteeService {
  /**
   * Search advisory committee patterns
   */
  async searchPatterns(input: ACSearchInput): Promise<AdvisoryCommitteePattern[]> {
    log.info('Searching AC patterns', {
      committee: input.committeeType,
      category: input.riskCategory,
    });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.committeeType) {
      conditions.push(`committee_type = $${paramIdx++}`);
      params.push(input.committeeType);
    }
    if (input.riskCategory) {
      conditions.push(`risk_category = $${paramIdx++}`);
      params.push(input.riskCategory);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(
      `
      SELECT * FROM regulatory_intel.advisory_committee_patterns
      WHERE ${conditions.join(' AND ')}
      ORDER BY negative_vote_correlation DESC NULLS LAST
      LIMIT $${paramIdx}
    `,
      params
    );

    return result.rows.map(this.mapPattern);
  }

  /**
   * Get a specific pattern
   */
  async getPattern(id: string, organizationId: string): Promise<AdvisoryCommitteePattern | null> {
    const result = await pool!.query(
      'SELECT * FROM regulatory_intel.advisory_committee_patterns WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.mapPattern(result.rows[0]) : null;
  }

  /**
   * Create a new advisory committee pattern
   */
  async createPattern(
    pattern: Omit<AdvisoryCommitteePattern, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AdvisoryCommitteePattern> {
    log.info('Creating AC pattern', {
      code: pattern.patternCode,
      committee: pattern.committeeType,
    });

    const result = await pool!.query(
      `
      INSERT INTO regulatory_intel.advisory_committee_patterns (
        organization_id, pattern_code, pattern_name, committee_type,
        risk_category, typical_questions, voting_question_templates,
        historical_frequency, negative_vote_correlation, fda_override_rate,
        panelist_sensitivity, consumer_rep_impact, statistician_focus_areas,
        mitigation_strategies, recommended_presentations, counterargument_frameworks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `,
      [
        pattern.organizationId,
        pattern.patternCode,
        pattern.patternName,
        pattern.committeeType,
        pattern.riskCategory,
        pattern.typicalQuestions,
        pattern.votingQuestionTemplates,
        pattern.historicalFrequency,
        pattern.negativeVoteCorrelation,
        pattern.fdaOverrideRate,
        JSON.stringify(pattern.panelistSensitivity),
        pattern.consumerRepImpact,
        pattern.statisticianFocusAreas,
        pattern.mitigationStrategies,
        pattern.recommendedPresentations,
        JSON.stringify(pattern.counterargumentFrameworks),
      ]
    );

    return this.mapPattern(result.rows[0]);
  }

  /**
   * Generate full AC risk assessment for a product
   */
  async assessRisk(input: {
    organizationId: string;
    committeeType: string;
    riskCategories?: ACRiskCategory[];
    therapeuticArea?: string;
  }): Promise<ACRiskAssessment> {
    log.info('Assessing AC risk', { committee: input.committeeType });

    const patterns = await this.searchPatterns({
      organizationId: input.organizationId,
      committeeType: input.committeeType,
      limit: 50,
    });

    const relevant = input.riskCategories
      ? patterns.filter(p => input.riskCategories!.includes(p.riskCategory))
      : patterns;

    // Calculate risk factors
    const riskFactors: ACRiskFactor[] = relevant.map(p => ({
      category: p.riskCategory,
      pattern: p.patternName,
      negativeVoteCorrelation: p.negativeVoteCorrelation,
      impact:
        p.negativeVoteCorrelation > 0.6
          ? 'critical'
          : p.negativeVoteCorrelation > 0.4
          ? 'high'
          : p.negativeVoteCorrelation > 0.2
          ? 'medium'
          : 'low',
      mitigation:
        p.mitigationStrategies[0] ?? 'Prepare comprehensive response addressing this concern.',
    }));

    // Estimate favorable vote probability
    const avgNegCorrelation =
      relevant.length > 0
        ? relevant.reduce((s, p) => s + p.negativeVoteCorrelation, 0) / relevant.length
        : 0;
    const favorableVoteProbability = Math.max(0.1, 1 - avgNegCorrelation * 1.2);

    // FDA override likelihood
    const fdaOverrideLikelihood =
      relevant.length > 0
        ? relevant.reduce((s, p) => s + p.fdaOverrideRate, 0) / relevant.length
        : 0;

    // Collect key questions
    const keyQuestions = relevant.flatMap(p => p.typicalQuestions.slice(0, 2)).slice(0, 10);

    // Generate preparation plan
    const preparationPlan: ACPreparationItem[] = relevant
      .map(p => ({
        area: p.patternName,
        recommendation:
          p.recommendedPresentations[0] ?? `Prepare response for ${p.riskCategory} concerns`,
        priority: (p.negativeVoteCorrelation > 0.5
          ? 'critical'
          : p.negativeVoteCorrelation > 0.3
          ? 'high'
          : p.negativeVoteCorrelation > 0.15
          ? 'medium'
          : 'low') as 'critical' | 'high' | 'medium' | 'low',
        presentationType: this.recommendPresentationType(p.riskCategory),
        estimatedPrepDays: p.negativeVoteCorrelation > 0.4 ? 14 : 7,
      }))
      .sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      });

    const overallRisk =
      avgNegCorrelation > 0.5
        ? 'critical'
        : avgNegCorrelation > 0.35
        ? 'high'
        : avgNegCorrelation > 0.2
        ? 'medium'
        : 'low';

    return {
      committeeType: input.committeeType,
      overallRisk,
      favorableVoteProbability,
      riskFactors,
      preparationPlan,
      fdaOverrideLikelihood,
      keyQuestions,
    };
  }

  /**
   * Get available committee types
   */
  async getCommitteeTypes(
    organizationId: string
  ): Promise<{ type: string; patternCount: number }[]> {
    const result = await pool!.query(
      `
      SELECT committee_type as type, COUNT(*)::int as pattern_count
      FROM regulatory_intel.advisory_committee_patterns
      WHERE organization_id = $1
      GROUP BY committee_type
      ORDER BY pattern_count DESC
    `,
      [organizationId]
    );

    return result.rows;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private recommendPresentationType(category: ACRiskCategory): string {
    const types: Record<string, string> = {
      safety_signal: 'Safety data presentation with Kaplan-Meier and forest plots',
      efficacy_uncertainty: 'Efficacy data with subgroup analyses and sensitivity analyses',
      benefit_risk_balance: 'Structured benefit-risk framework presentation',
      surrogate_endpoint: 'Surrogate-clinical outcome correlation data',
      single_trial: 'Comprehensive single-trial evidence with external validation',
      subgroup_effects: 'Subgroup analysis with interaction tests and forest plots',
      comparator_choice: 'Comparator justification with indirect comparison data',
      missing_data: 'Missing data analysis with multiple imputation sensitivity',
      unmet_need: 'Unmet medical need landscape with patient perspectives',
      pediatric_extrapolation: 'Pediatric extrapolation framework with PK bridging',
      real_world_evidence: 'Real-world evidence analysis with data quality assessment',
      accelerated_conversion: 'Confirmatory trial results with clinical endpoint data',
      biosimilar_interchangeability: 'Switching study data with immunogenicity analysis',
      labeling_scope: 'Labeling proposal with risk communication framework',
    };
    return types[category] ?? 'Comprehensive data presentation';
  }

  private mapPattern(row: Record<string, unknown>): AdvisoryCommitteePattern {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      patternCode: row.pattern_code as string,
      patternName: row.pattern_name as string,
      committeeType: row.committee_type as string,
      riskCategory: row.risk_category as ACRiskCategory,
      typicalQuestions: (row.typical_questions as string[]) ?? [],
      votingQuestionTemplates: (row.voting_question_templates as string[]) ?? [],
      historicalFrequency: parseFloat(row.historical_frequency as string) || 0,
      negativeVoteCorrelation: parseFloat(row.negative_vote_correlation as string) || 0,
      fdaOverrideRate: parseFloat(row.fda_override_rate as string) || 0,
      panelistSensitivity: (row.panelist_sensitivity as Record<string, number>) ?? {},
      consumerRepImpact: parseFloat(row.consumer_rep_impact as string) || 0,
      statisticianFocusAreas: (row.statistician_focus_areas as string[]) ?? [],
      mitigationStrategies: (row.mitigation_strategies as string[]) ?? [],
      recommendedPresentations: (row.recommended_presentations as string[]) ?? [],
      counterargumentFrameworks:
        (row.counterargument_frameworks as CounterargumentFramework[]) ?? [],
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const advisoryCommitteeService = new AdvisoryCommitteeService();
