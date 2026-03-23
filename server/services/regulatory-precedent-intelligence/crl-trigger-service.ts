/**
 * CRL Trigger Pattern Library & Trajectory Analysis
 *
 * Identifies Complete Response Letter trigger patterns from FDA submissions,
 * tracks CRL trajectories across cycles, and provides resolution guidance.
 *
 * @module server/services/regulatory-precedent-intelligence/crl-trigger-service
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('crl-trigger-service');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CRLTriggerPattern {
  id: string;
  organizationId: string;
  patternCode: string;
  patternName: string;
  category: CRLCategory;
  triggerDescription: string;
  deficiencySignals: DeficiencySignal[];
  typicalFdaLanguage: string[];
  frequencyRate: number;
  resolutionDifficulty: 'low' | 'moderate' | 'high' | 'very_high';
  avgCyclesToResolve: number;
  resolutionSuccessRate: number;
  therapeuticAreas: string[];
  submissionTypes: string[];
  applicableDivisions: string[];
  createdAt: string;
  updatedAt: string;
}

export type CRLCategory =
  | 'clinical_efficacy' | 'clinical_safety' | 'clinical_design'
  | 'cmc_quality' | 'cmc_manufacturing' | 'cmc_stability'
  | 'nonclinical' | 'biostatistics' | 'labeling'
  | 'pharmacology' | 'rems' | 'pediatric' | 'postmarket';

export interface DeficiencySignal {
  signalType: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  description: string;
}

export interface CRLTrajectoryRecord {
  id: string;
  organizationId: string;
  applicationNumber: string | null;
  applicant: string | null;
  productName: string | null;
  submissionType: string;
  therapeuticArea: string | null;
  indication: string | null;
  crlCycleNumber: number;
  crlIssueDate: string | null;
  resubmissionDate: string | null;
  deficiencyCategories: string[];
  deficiencyDetails: DeficiencyDetail[];
  triggerPatternIds: string[];
  resolutionStatus: string;
  resolutionStrategy: string | null;
  finalOutcome: string | null;
  totalCycles: number | null;
  totalDurationDays: number | null;
}

export interface DeficiencyDetail {
  category: string;
  description: string;
  severity: string;
  resolved: boolean;
}

export interface CRLRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  matchedPatterns: CRLTriggerPattern[];
  trajectoryPrediction: TrajectoryPrediction;
  mitigationStrategies: MitigationStrategy[];
}

export interface TrajectoryPrediction {
  likelyCrlProbability: number;
  expectedCycles: number;
  expectedResolutionDays: number;
  mostLikelyDeficiencies: string[];
  confidenceScore: number;
}

export interface MitigationStrategy {
  pattern: string;
  strategy: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  effortLevel: string;
  expectedImpact: string;
}

export interface CRLSearchInput {
  organizationId: string;
  category?: CRLCategory;
  therapeuticArea?: string;
  submissionType?: string;
  minFrequency?: number;
  limit?: number;
}

export interface TrajectorySearchInput {
  organizationId: string;
  applicationNumber?: string;
  submissionType?: string;
  therapeuticArea?: string;
  resolutionStatus?: string;
  limit?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class CRLTriggerService {

  /**
   * Search CRL trigger patterns by criteria
   */
  async searchPatterns(input: CRLSearchInput): Promise<CRLTriggerPattern[]> {
    log.info('Searching CRL trigger patterns', { category: input.category, therapeuticArea: input.therapeuticArea });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.category) {
      conditions.push(`category = $${paramIdx++}`);
      params.push(input.category);
    }
    if (input.therapeuticArea) {
      conditions.push(`$${paramIdx++} = ANY(therapeutic_areas)`);
      params.push(input.therapeuticArea);
    }
    if (input.submissionType) {
      conditions.push(`$${paramIdx++} = ANY(submission_types)`);
      params.push(input.submissionType);
    }
    if (input.minFrequency !== undefined) {
      conditions.push(`frequency_rate >= $${paramIdx++}`);
      params.push(input.minFrequency);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const query = `
      SELECT * FROM regulatory_intel.crl_trigger_patterns
      WHERE ${conditions.join(' AND ')}
      ORDER BY frequency_rate DESC NULLS LAST
      LIMIT $${paramIdx}
    `;

    const result = await pool!.query(query, params);
    return result.rows.map(this.mapTriggerPattern);
  }

  /**
   * Get a specific trigger pattern by ID
   */
  async getPattern(id: string, organizationId: string): Promise<CRLTriggerPattern | null> {
    const result = await pool!.query(
      'SELECT * FROM regulatory_intel.crl_trigger_patterns WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.mapTriggerPattern(result.rows[0]) : null;
  }

  /**
   * Create a new CRL trigger pattern
   */
  async createPattern(pattern: Omit<CRLTriggerPattern, 'id' | 'createdAt' | 'updatedAt'>): Promise<CRLTriggerPattern> {
    log.info('Creating CRL trigger pattern', { code: pattern.patternCode, category: pattern.category });

    const result = await pool!.query(`
      INSERT INTO regulatory_intel.crl_trigger_patterns (
        organization_id, pattern_code, pattern_name, category,
        trigger_description, deficiency_signals, typical_fda_language,
        frequency_rate, resolution_difficulty, avg_cycles_to_resolve,
        resolution_success_rate, therapeutic_areas, submission_types, applicable_divisions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      pattern.organizationId, pattern.patternCode, pattern.patternName, pattern.category,
      pattern.triggerDescription, JSON.stringify(pattern.deficiencySignals), pattern.typicalFdaLanguage,
      pattern.frequencyRate, pattern.resolutionDifficulty, pattern.avgCyclesToResolve,
      pattern.resolutionSuccessRate, pattern.therapeuticAreas, pattern.submissionTypes, pattern.applicableDivisions
    ]);

    return this.mapTriggerPattern(result.rows[0]);
  }

  /**
   * Search CRL trajectory records
   */
  async searchTrajectories(input: TrajectorySearchInput): Promise<CRLTrajectoryRecord[]> {
    log.info('Searching CRL trajectories', { applicationNumber: input.applicationNumber });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.applicationNumber) {
      conditions.push(`application_number = $${paramIdx++}`);
      params.push(input.applicationNumber);
    }
    if (input.submissionType) {
      conditions.push(`submission_type = $${paramIdx++}`);
      params.push(input.submissionType);
    }
    if (input.therapeuticArea) {
      conditions.push(`therapeutic_area = $${paramIdx++}`);
      params.push(input.therapeuticArea);
    }
    if (input.resolutionStatus) {
      conditions.push(`resolution_status = $${paramIdx++}`);
      params.push(input.resolutionStatus);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.crl_trajectory_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY crl_issue_date DESC NULLS LAST
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapTrajectoryRecord);
  }

  /**
   * Record a new CRL trajectory entry
   */
  async recordTrajectory(record: Omit<CRLTrajectoryRecord, 'id'>): Promise<CRLTrajectoryRecord> {
    log.info('Recording CRL trajectory', { applicationNumber: record.applicationNumber, cycle: record.crlCycleNumber });

    const result = await pool!.query(`
      INSERT INTO regulatory_intel.crl_trajectory_records (
        organization_id, application_number, applicant, product_name,
        submission_type, therapeutic_area, indication,
        crl_cycle_number, crl_issue_date, resubmission_date,
        deficiency_categories, deficiency_details, trigger_pattern_ids,
        resolution_status, resolution_strategy, final_outcome,
        total_cycles, total_duration_days
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      record.organizationId, record.applicationNumber, record.applicant, record.productName,
      record.submissionType, record.therapeuticArea, record.indication,
      record.crlCycleNumber, record.crlIssueDate, record.resubmissionDate,
      record.deficiencyCategories, JSON.stringify(record.deficiencyDetails), record.triggerPatternIds,
      record.resolutionStatus, record.resolutionStrategy, record.finalOutcome,
      record.totalCycles, record.totalDurationDays
    ]);

    return this.mapTrajectoryRecord(result.rows[0]);
  }

  /**
   * Assess CRL risk for a given submission context
   */
  async assessCRLRisk(input: {
    organizationId: string;
    submissionType: string;
    therapeuticArea?: string;
    indication?: string;
    deficiencySignals?: string[];
  }): Promise<CRLRiskAssessment> {
    log.info('Assessing CRL risk', { submissionType: input.submissionType, therapeuticArea: input.therapeuticArea });

    // Find matching trigger patterns
    const patterns = await this.searchPatterns({
      organizationId: input.organizationId,
      submissionType: input.submissionType,
      therapeuticArea: input.therapeuticArea,
      limit: 50,
    });

    // Calculate aggregate risk score
    let riskScore = 0;
    const matchedPatterns: CRLTriggerPattern[] = [];

    for (const pattern of patterns) {
      const relevance = this.calculatePatternRelevance(pattern, input);
      if (relevance > 0.3) {
        matchedPatterns.push(pattern);
        riskScore += pattern.frequencyRate * relevance * this.difficultyWeight(pattern.resolutionDifficulty);
      }
    }

    // Normalize risk score to 0-100
    riskScore = Math.min(100, riskScore * 100);

    // Get historical trajectory data for prediction
    const trajectories = await this.searchTrajectories({
      organizationId: input.organizationId,
      submissionType: input.submissionType,
      therapeuticArea: input.therapeuticArea,
      limit: 100,
    });

    const trajectoryPrediction = this.predictTrajectory(trajectories, matchedPatterns);
    const mitigationStrategies = this.generateMitigationStrategies(matchedPatterns);

    return {
      overallRisk: this.riskLevel(riskScore),
      riskScore,
      matchedPatterns,
      trajectoryPrediction,
      mitigationStrategies,
    };
  }

  /**
   * Get CRL statistics by category
   */
  async getStatsByCategory(organizationId: string): Promise<Record<string, { count: number; avgFrequency: number; avgCycles: number }>> {
    const result = await pool!.query(`
      SELECT
        category,
        COUNT(*)::int as count,
        AVG(frequency_rate)::numeric(5,4) as avg_frequency,
        AVG(avg_cycles_to_resolve)::numeric(3,1) as avg_cycles
      FROM regulatory_intel.crl_trigger_patterns
      WHERE organization_id = $1
      GROUP BY category
      ORDER BY avg_frequency DESC
    `, [organizationId]);

    const stats: Record<string, { count: number; avgFrequency: number; avgCycles: number }> = {};
    for (const row of result.rows) {
      stats[row.category] = {
        count: row.count,
        avgFrequency: parseFloat(row.avg_frequency) || 0,
        avgCycles: parseFloat(row.avg_cycles) || 0,
      };
    }
    return stats;
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private calculatePatternRelevance(
    pattern: CRLTriggerPattern,
    input: { submissionType: string; therapeuticArea?: string; indication?: string }
  ): number {
    let relevance = 0.5; // base relevance

    if (pattern.submissionTypes.includes(input.submissionType)) {
      relevance += 0.2;
    }
    if (input.therapeuticArea && pattern.therapeuticAreas.includes(input.therapeuticArea)) {
      relevance += 0.2;
    }
    if (pattern.frequencyRate > 0.3) {
      relevance += 0.1;
    }

    return Math.min(1.0, relevance);
  }

  private difficultyWeight(difficulty: string): number {
    const weights: Record<string, number> = {
      low: 0.5,
      moderate: 1.0,
      high: 1.5,
      very_high: 2.0,
    };
    return weights[difficulty] ?? 1.0;
  }

  private riskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score < 25) return 'low';
    if (score < 50) return 'medium';
    if (score < 75) return 'high';
    return 'critical';
  }

  private predictTrajectory(
    trajectories: CRLTrajectoryRecord[],
    matchedPatterns: CRLTriggerPattern[]
  ): TrajectoryPrediction {
    if (trajectories.length === 0 && matchedPatterns.length === 0) {
      return {
        likelyCrlProbability: 0.1,
        expectedCycles: 1,
        expectedResolutionDays: 180,
        mostLikelyDeficiencies: [],
        confidenceScore: 0.2,
      };
    }

    // Calculate from historical trajectories
    const resolvedTrajectories = trajectories.filter(t => t.finalOutcome === 'approved');
    const avgCycles = resolvedTrajectories.length > 0
      ? resolvedTrajectories.reduce((sum, t) => sum + (t.totalCycles ?? 1), 0) / resolvedTrajectories.length
      : matchedPatterns.reduce((sum, p) => sum + p.avgCyclesToResolve, 0) / Math.max(matchedPatterns.length, 1);

    const avgDays = resolvedTrajectories.length > 0
      ? resolvedTrajectories.reduce((sum, t) => sum + (t.totalDurationDays ?? 365), 0) / resolvedTrajectories.length
      : avgCycles * 300;

    // Aggregate deficiency categories
    const deficiencyCounts: Record<string, number> = {};
    for (const t of trajectories) {
      for (const cat of t.deficiencyCategories) {
        deficiencyCounts[cat] = (deficiencyCounts[cat] ?? 0) + 1;
      }
    }
    const sortedDeficiencies = Object.entries(deficiencyCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat]) => cat);

    const crlProbability = matchedPatterns.length > 0
      ? Math.min(0.95, matchedPatterns.reduce((sum, p) => sum + p.frequencyRate, 0) / matchedPatterns.length * 1.5)
      : 0.15;

    const confidenceScore = Math.min(0.95, 0.3 + trajectories.length * 0.02 + matchedPatterns.length * 0.05);

    return {
      likelyCrlProbability: crlProbability,
      expectedCycles: Math.round(avgCycles * 10) / 10,
      expectedResolutionDays: Math.round(avgDays),
      mostLikelyDeficiencies: sortedDeficiencies,
      confidenceScore,
    };
  }

  private generateMitigationStrategies(patterns: CRLTriggerPattern[]): MitigationStrategy[] {
    const strategies: MitigationStrategy[] = [];

    for (const pattern of patterns) {
      const priority = pattern.resolutionDifficulty === 'very_high' ? 'immediate'
        : pattern.resolutionDifficulty === 'high' ? 'high'
        : pattern.resolutionDifficulty === 'moderate' ? 'medium'
        : 'low';

      strategies.push({
        pattern: pattern.patternName,
        strategy: `Address ${pattern.category} deficiency: ${pattern.triggerDescription}. ` +
          `Historical success rate: ${(pattern.resolutionSuccessRate * 100).toFixed(0)}%. ` +
          `Average ${pattern.avgCyclesToResolve} cycles to resolve.`,
        priority,
        effortLevel: pattern.resolutionDifficulty,
        expectedImpact: pattern.frequencyRate > 0.3 ? 'High frequency pattern - critical to address'
          : pattern.frequencyRate > 0.15 ? 'Moderate frequency - recommended to address'
          : 'Lower frequency but still relevant',
      });
    }

    return strategies.sort((a, b) => {
      const order = { immediate: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });
  }

  private mapTriggerPattern(row: Record<string, unknown>): CRLTriggerPattern {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      patternCode: row.pattern_code as string,
      patternName: row.pattern_name as string,
      category: row.category as CRLCategory,
      triggerDescription: row.trigger_description as string,
      deficiencySignals: (row.deficiency_signals as DeficiencySignal[]) ?? [],
      typicalFdaLanguage: (row.typical_fda_language as string[]) ?? [],
      frequencyRate: parseFloat(row.frequency_rate as string) || 0,
      resolutionDifficulty: row.resolution_difficulty as 'low' | 'moderate' | 'high' | 'very_high',
      avgCyclesToResolve: parseFloat(row.avg_cycles_to_resolve as string) || 1,
      resolutionSuccessRate: parseFloat(row.resolution_success_rate as string) || 0,
      therapeuticAreas: (row.therapeutic_areas as string[]) ?? [],
      submissionTypes: (row.submission_types as string[]) ?? [],
      applicableDivisions: (row.applicable_divisions as string[]) ?? [],
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }

  private mapTrajectoryRecord(row: Record<string, unknown>): CRLTrajectoryRecord {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      applicationNumber: row.application_number as string | null,
      applicant: row.applicant as string | null,
      productName: row.product_name as string | null,
      submissionType: row.submission_type as string,
      therapeuticArea: row.therapeutic_area as string | null,
      indication: row.indication as string | null,
      crlCycleNumber: row.crl_cycle_number as number,
      crlIssueDate: row.crl_issue_date as string | null,
      resubmissionDate: row.resubmission_date as string | null,
      deficiencyCategories: (row.deficiency_categories as string[]) ?? [],
      deficiencyDetails: (row.deficiency_details as DeficiencyDetail[]) ?? [],
      triggerPatternIds: (row.trigger_pattern_ids as string[]) ?? [],
      resolutionStatus: row.resolution_status as string,
      resolutionStrategy: row.resolution_strategy as string | null,
      finalOutcome: row.final_outcome as string | null,
      totalCycles: row.total_cycles as number | null,
      totalDurationDays: row.total_duration_days as number | null,
    };
  }
}

export const crlTriggerService = new CRLTriggerService();
