/**
 * EMA Question Pattern Taxonomy Service
 *
 * Manages EMA Day 80/120/150/180 question patterns, CHMP language analysis,
 * clock stop prediction, and major objection escalation risk assessment.
 *
 * @module server/services/regulatory-precedent-intelligence/ema-question-taxonomy-service
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('ema-question-taxonomy');

// ─── Types ───────────────────────────────────────────────────────────────────

export type EMAProcedurePhase =
  | 'day_80' | 'day_120' | 'day_150' | 'day_180'
  | 'clock_stop_1' | 'clock_stop_2'
  | 'oral_explanation' | 'post_opinion';

export type EMAQuestionCategory =
  | 'clinical_efficacy' | 'clinical_safety' | 'clinical_pharmacology'
  | 'quality_cmc' | 'nonclinical' | 'biostatistics'
  | 'risk_management' | 'pharmacovigilance' | 'labeling_spc'
  | 'environmental_risk' | 'gmp_compliance' | 'pediatric'
  | 'conditional_approval' | 'biosimilarity';

export type EMAQuestionType = 'major_objection' | 'other_concern' | 'recommendation' | 'point_to_consider';

export interface EMAQuestionPattern {
  id: string;
  organizationId: string;
  patternCode: string;
  patternName: string;
  procedurePhase: EMAProcedurePhase;
  procedureType: string | null;
  questionCategory: EMAQuestionCategory;
  questionType: EMAQuestionType | null;
  typicalChmpLanguage: string[];
  questionTemplate: string | null;
  expectedResponseFormat: string | null;
  frequencyRate: number;
  escalationRisk: number;
  clockStopProbability: number;
  therapeuticAreas: string[];
  rapporteurCountries: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EMAPreparationReport {
  procedurePhase: EMAProcedurePhase;
  totalPatternsFound: number;
  majorObjectionRisk: number;
  clockStopRisk: number;
  questionsByCategory: Record<string, EMAQuestionPattern[]>;
  preparationGuidance: PreparationGuidanceItem[];
  highRiskPatterns: EMAQuestionPattern[];
}

export interface PreparationGuidanceItem {
  category: EMAQuestionCategory;
  expectedQuestionCount: number;
  majorObjectionProbability: number;
  clockStopProbability: number;
  recommendedPreparation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface EMASearchInput {
  organizationId: string;
  procedurePhase?: EMAProcedurePhase;
  questionCategory?: EMAQuestionCategory;
  questionType?: EMAQuestionType;
  therapeuticArea?: string;
  rapporteurCountry?: string;
  limit?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class EMAQuestionTaxonomyService {

  /**
   * Search EMA question patterns
   */
  async searchPatterns(input: EMASearchInput): Promise<EMAQuestionPattern[]> {
    log.info('Searching EMA question patterns', { phase: input.procedurePhase, category: input.questionCategory });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.procedurePhase) {
      conditions.push(`procedure_phase = $${paramIdx++}`);
      params.push(input.procedurePhase);
    }
    if (input.questionCategory) {
      conditions.push(`question_category = $${paramIdx++}`);
      params.push(input.questionCategory);
    }
    if (input.questionType) {
      conditions.push(`question_type = $${paramIdx++}`);
      params.push(input.questionType);
    }
    if (input.therapeuticArea) {
      conditions.push(`$${paramIdx++} = ANY(therapeutic_areas)`);
      params.push(input.therapeuticArea);
    }
    if (input.rapporteurCountry) {
      conditions.push(`$${paramIdx++} = ANY(rapporteur_countries)`);
      params.push(input.rapporteurCountry);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.ema_question_patterns
      WHERE ${conditions.join(' AND ')}
      ORDER BY escalation_risk DESC NULLS LAST, frequency_rate DESC NULLS LAST
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapPattern);
  }

  /**
   * Get a specific pattern
   */
  async getPattern(id: string, organizationId: string): Promise<EMAQuestionPattern | null> {
    const result = await pool!.query(
      'SELECT * FROM regulatory_intel.ema_question_patterns WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.mapPattern(result.rows[0]) : null;
  }

  /**
   * Create a new EMA question pattern
   */
  async createPattern(pattern: Omit<EMAQuestionPattern, 'id' | 'createdAt' | 'updatedAt'>): Promise<EMAQuestionPattern> {
    log.info('Creating EMA question pattern', { code: pattern.patternCode, phase: pattern.procedurePhase });

    const result = await pool!.query(`
      INSERT INTO regulatory_intel.ema_question_patterns (
        organization_id, pattern_code, pattern_name,
        procedure_phase, procedure_type, question_category, question_type,
        typical_chmp_language, question_template, expected_response_format,
        frequency_rate, escalation_risk, clock_stop_probability,
        therapeutic_areas, rapporteur_countries
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      pattern.organizationId, pattern.patternCode, pattern.patternName,
      pattern.procedurePhase, pattern.procedureType, pattern.questionCategory, pattern.questionType,
      pattern.typicalChmpLanguage, pattern.questionTemplate, pattern.expectedResponseFormat,
      pattern.frequencyRate, pattern.escalationRisk, pattern.clockStopProbability,
      pattern.therapeuticAreas, pattern.rapporteurCountries
    ]);

    return this.mapPattern(result.rows[0]);
  }

  /**
   * Generate preparation report for a specific procedure phase
   */
  async generatePreparationReport(input: {
    organizationId: string;
    procedurePhase: EMAProcedurePhase;
    therapeuticArea?: string;
    rapporteurCountry?: string;
  }): Promise<EMAPreparationReport> {
    log.info('Generating EMA preparation report', { phase: input.procedurePhase });

    const patterns = await this.searchPatterns({
      organizationId: input.organizationId,
      procedurePhase: input.procedurePhase,
      therapeuticArea: input.therapeuticArea,
      rapporteurCountry: input.rapporteurCountry,
      limit: 100,
    });

    // Group by category
    const byCategory: Record<string, EMAQuestionPattern[]> = {};
    for (const p of patterns) {
      if (!byCategory[p.questionCategory]) byCategory[p.questionCategory] = [];
      byCategory[p.questionCategory].push(p);
    }

    // Identify high-risk patterns (major objection risk > 0.3 or clock stop > 0.4)
    const highRiskPatterns = patterns.filter(
      p => p.escalationRisk > 0.3 || p.clockStopProbability > 0.4
    );

    // Calculate aggregate risks
    const majorObjectionRisk = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.escalationRisk, 0) / patterns.length
      : 0;
    const clockStopRisk = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.clockStopProbability, 0) / patterns.length
      : 0;

    // Generate preparation guidance per category
    const guidance: PreparationGuidanceItem[] = Object.entries(byCategory).map(([category, catPatterns]) => {
      const avgEscalation = catPatterns.reduce((s, p) => s + p.escalationRisk, 0) / catPatterns.length;
      const avgClockStop = catPatterns.reduce((s, p) => s + p.clockStopProbability, 0) / catPatterns.length;

      return {
        category: category as EMAQuestionCategory,
        expectedQuestionCount: catPatterns.length,
        majorObjectionProbability: avgEscalation,
        clockStopProbability: avgClockStop,
        recommendedPreparation: this.generatePreparationAdvice(category as EMAQuestionCategory, avgEscalation),
        priority: avgEscalation > 0.5 ? 'critical'
          : avgEscalation > 0.3 ? 'high'
          : avgEscalation > 0.15 ? 'medium'
          : 'low',
      };
    }).sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });

    return {
      procedurePhase: input.procedurePhase,
      totalPatternsFound: patterns.length,
      majorObjectionRisk,
      clockStopRisk,
      questionsByCategory: byCategory,
      preparationGuidance: guidance,
      highRiskPatterns,
    };
  }

  /**
   * Predict clock stop likelihood for a submission
   */
  async predictClockStop(input: {
    organizationId: string;
    therapeuticArea?: string;
    questionCategories: EMAQuestionCategory[];
  }): Promise<{
    overallProbability: number;
    contributingFactors: { category: string; probability: number }[];
    recommendation: string;
  }> {
    const patterns = await this.searchPatterns({
      organizationId: input.organizationId,
      therapeuticArea: input.therapeuticArea,
      limit: 100,
    });

    const relevant = patterns.filter(p =>
      input.questionCategories.includes(p.questionCategory)
    );

    const contributingFactors = input.questionCategories.map(cat => {
      const catPatterns = relevant.filter(p => p.questionCategory === cat);
      const prob = catPatterns.length > 0
        ? catPatterns.reduce((s, p) => s + p.clockStopProbability, 0) / catPatterns.length
        : 0;
      return { category: cat, probability: prob };
    }).sort((a, b) => b.probability - a.probability);

    const overallProbability = contributingFactors.length > 0
      ? 1 - contributingFactors.reduce((prod, f) => prod * (1 - f.probability), 1)
      : 0;

    const recommendation = overallProbability > 0.7
      ? 'High clock stop risk. Proactively address all major objection areas before Day 120.'
      : overallProbability > 0.4
      ? 'Moderate clock stop risk. Prepare detailed responses for key question categories.'
      : 'Low clock stop risk. Standard preparation should suffice.';

    return { overallProbability, contributingFactors, recommendation };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private generatePreparationAdvice(category: EMAQuestionCategory, escalationRisk: number): string {
    const adviceMap: Record<string, string> = {
      clinical_efficacy: 'Prepare robust efficacy data package with sensitivity analyses and subgroup breakdowns.',
      clinical_safety: 'Compile comprehensive safety database with long-term follow-up and signal detection analysis.',
      clinical_pharmacology: 'Ensure PK/PD modeling is complete with dose-response justification.',
      quality_cmc: 'Verify all manufacturing data, specifications, and stability results are current.',
      nonclinical: 'Review all nonclinical study reports for completeness and regulatory alignment.',
      biostatistics: 'Validate SAP adherence, multiplicity adjustments, and missing data handling.',
      risk_management: 'Update RMP with latest safety data and risk minimization measures.',
      pharmacovigilance: 'Ensure PSUR/PBRER data is integrated and safety monitoring plan is robust.',
      labeling_spc: 'Align SmPC/PIL with latest clinical data and EMA labeling guidance.',
      environmental_risk: 'Complete ERA per CHMP/SWP guidelines.',
      gmp_compliance: 'Confirm GMP inspection readiness for all manufacturing sites.',
      pediatric: 'Verify PIP compliance and pediatric data submissions.',
      conditional_approval: 'Prepare comprehensive benefit-risk assessment for unmet medical need.',
      biosimilarity: 'Ensure totality of evidence approach with analytical, PK, and clinical comparability.',
    };

    let advice = adviceMap[category] ?? 'Prepare comprehensive response documentation.';
    if (escalationRisk > 0.5) {
      advice += ' HIGH PRIORITY: This category has elevated major objection risk.';
    }
    return advice;
  }

  private mapPattern(row: Record<string, unknown>): EMAQuestionPattern {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      patternCode: row.pattern_code as string,
      patternName: row.pattern_name as string,
      procedurePhase: row.procedure_phase as EMAProcedurePhase,
      procedureType: row.procedure_type as string | null,
      questionCategory: row.question_category as EMAQuestionCategory,
      questionType: row.question_type as EMAQuestionType | null,
      typicalChmpLanguage: (row.typical_chmp_language as string[]) ?? [],
      questionTemplate: row.question_template as string | null,
      expectedResponseFormat: row.expected_response_format as string | null,
      frequencyRate: parseFloat(row.frequency_rate as string) || 0,
      escalationRisk: parseFloat(row.escalation_risk as string) || 0,
      clockStopProbability: parseFloat(row.clock_stop_probability as string) || 0,
      therapeuticAreas: (row.therapeutic_areas as string[]) ?? [],
      rapporteurCountries: (row.rapporteur_countries as string[]) ?? [],
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const emaQuestionTaxonomyService = new EMAQuestionTaxonomyService();
