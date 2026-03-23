/**
 * Precedent Application Rules & Confidence Calibration
 *
 * Manages rules for applying regulatory precedents with Bayesian confidence scoring,
 * recency decay, backtesting validation, and Brier score calibration.
 *
 * @module server/services/regulatory-precedent-intelligence/confidence-calibration-service
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('confidence-calibration');

// ─── Types ───────────────────────────────────────────────────────────────────

export type RuleType =
  | 'direct_precedent' | 'analogous_precedent' | 'negative_precedent'
  | 'procedural_precedent' | 'scientific_precedent' | 'policy_precedent';

export interface PrecedentApplicationRule {
  id: string;
  organizationId: string;
  ruleCode: string;
  ruleName: string;
  ruleType: RuleType;
  description: string;
  applicabilityCriteria: Record<string, unknown>;
  weightFactors: Record<string, unknown>;
  baseConfidence: number;
  confidenceModifiers: ConfidenceModifier[];
  minimumPrecedentCount: number;
  recencyDecayHalflifeDays: number;
  applicableAgencies: string[];
  crossJurisdictional: boolean;
  backtestedAccuracy: number | null;
  lastValidated: string | null;
  validationSampleSize: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfidenceModifier {
  condition: string;
  modifier: number;
  direction: 'increase' | 'decrease';
}

export interface ConfidenceCalibrationEntry {
  id: string;
  organizationId: string;
  ruleId: string;
  predictionId: string | null;
  predictedOutcome: string;
  predictedConfidence: number;
  actualOutcome: string | null;
  outcomeDate: string | null;
  brierScore: number | null;
  calibrationBucket: string | null;
  createdAt: string;
}

export interface ConfidenceScore {
  score: number;
  adjustedScore: number;
  appliedModifiers: AppliedModifier[];
  recencyFactor: number;
  precedentCount: number;
  calibrationQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'uncalibrated';
}

export interface AppliedModifier {
  condition: string;
  direction: 'increase' | 'decrease';
  modifier: number;
  applied: boolean;
  reason: string;
}

export interface CalibrationReport {
  totalPredictions: number;
  resolvedPredictions: number;
  averageBrierScore: number;
  calibrationByBucket: Record<string, { predicted: number; actual: number; count: number }>;
  overconfidenceBias: number;
  recommendation: string;
}

export interface RuleSearchInput {
  organizationId: string;
  ruleType?: RuleType;
  agency?: string;
  crossJurisdictional?: boolean;
  limit?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ConfidenceCalibrationService {

  /**
   * Search precedent application rules
   */
  async searchRules(input: RuleSearchInput): Promise<PrecedentApplicationRule[]> {
    log.info('Searching precedent rules', { type: input.ruleType });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number | boolean)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.ruleType) {
      conditions.push(`rule_type = $${paramIdx++}`);
      params.push(input.ruleType);
    }
    if (input.agency) {
      conditions.push(`$${paramIdx++} = ANY(applicable_agencies)`);
      params.push(input.agency);
    }
    if (input.crossJurisdictional !== undefined) {
      conditions.push(`cross_jurisdictional = $${paramIdx++}`);
      params.push(input.crossJurisdictional);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.precedent_application_rules
      WHERE ${conditions.join(' AND ')}
      ORDER BY base_confidence DESC
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapRule);
  }

  /**
   * Get a specific rule
   */
  async getRule(id: string, organizationId: string): Promise<PrecedentApplicationRule | null> {
    const result = await pool!.query(
      'SELECT * FROM regulatory_intel.precedent_application_rules WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.mapRule(result.rows[0]) : null;
  }

  /**
   * Create a new precedent application rule
   */
  async createRule(rule: Omit<PrecedentApplicationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<PrecedentApplicationRule> {
    log.info('Creating precedent rule', { code: rule.ruleCode, type: rule.ruleType });

    const result = await pool!.query(`
      INSERT INTO regulatory_intel.precedent_application_rules (
        organization_id, rule_code, rule_name, rule_type,
        description, applicability_criteria, weight_factors,
        base_confidence, confidence_modifiers, minimum_precedent_count,
        recency_decay_halflife_days, applicable_agencies, cross_jurisdictional,
        backtested_accuracy, last_validated, validation_sample_size
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      rule.organizationId, rule.ruleCode, rule.ruleName, rule.ruleType,
      rule.description, JSON.stringify(rule.applicabilityCriteria), JSON.stringify(rule.weightFactors),
      rule.baseConfidence, JSON.stringify(rule.confidenceModifiers), rule.minimumPrecedentCount,
      rule.recencyDecayHalflifeDays, rule.applicableAgencies, rule.crossJurisdictional,
      rule.backtestedAccuracy, rule.lastValidated, rule.validationSampleSize
    ]);

    return this.mapRule(result.rows[0]);
  }

  /**
   * Calculate confidence score for a prediction using a specific rule
   */
  async calculateConfidence(input: {
    organizationId: string;
    ruleId: string;
    context: Record<string, unknown>;
    precedentCount: number;
    oldestPrecedentDays: number;
  }): Promise<ConfidenceScore> {
    const rule = await this.getRule(input.ruleId, input.organizationId);
    if (!rule) throw new Error(`Rule ${input.ruleId} not found`);

    // Check minimum precedent count
    if (input.precedentCount < rule.minimumPrecedentCount) {
      return {
        score: rule.baseConfidence * 0.5,
        adjustedScore: rule.baseConfidence * 0.5,
        appliedModifiers: [],
        recencyFactor: 1,
        precedentCount: input.precedentCount,
        calibrationQuality: 'uncalibrated',
      };
    }

    // Apply recency decay
    const recencyFactor = Math.pow(0.5, input.oldestPrecedentDays / rule.recencyDecayHalflifeDays);

    // Apply confidence modifiers
    let adjustedConfidence = rule.baseConfidence;
    const appliedModifiers: AppliedModifier[] = [];

    for (const mod of rule.confidenceModifiers) {
      const conditionMet = this.evaluateCondition(mod.condition, input.context);
      const modifier: AppliedModifier = {
        condition: mod.condition,
        direction: mod.direction,
        modifier: mod.modifier,
        applied: conditionMet,
        reason: conditionMet ? 'Condition met' : 'Condition not met',
      };
      appliedModifiers.push(modifier);

      if (conditionMet) {
        if (mod.direction === 'increase') {
          adjustedConfidence = Math.min(0.99, adjustedConfidence + mod.modifier);
        } else {
          adjustedConfidence = Math.max(0.01, adjustedConfidence - mod.modifier);
        }
      }
    }

    // Apply recency decay
    adjustedConfidence *= recencyFactor;

    // Determine calibration quality from backtest data
    const calibrationQuality = this.assessCalibrationQuality(rule);

    return {
      score: rule.baseConfidence,
      adjustedScore: Math.round(adjustedConfidence * 10000) / 10000,
      appliedModifiers,
      recencyFactor: Math.round(recencyFactor * 10000) / 10000,
      precedentCount: input.precedentCount,
      calibrationQuality,
    };
  }

  /**
   * Record a prediction for future calibration
   */
  async recordPrediction(entry: Omit<ConfidenceCalibrationEntry, 'id' | 'createdAt'>): Promise<ConfidenceCalibrationEntry> {
    const bucket = this.confidenceBucket(entry.predictedConfidence);

    const result = await pool!.query(`
      INSERT INTO regulatory_intel.confidence_calibration_log (
        organization_id, rule_id, prediction_id,
        predicted_outcome, predicted_confidence,
        actual_outcome, outcome_date, brier_score, calibration_bucket
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      entry.organizationId, entry.ruleId, entry.predictionId,
      entry.predictedOutcome, entry.predictedConfidence,
      entry.actualOutcome, entry.outcomeDate, entry.brierScore, bucket
    ]);

    return this.mapCalibrationEntry(result.rows[0]);
  }

  /**
   * Resolve a prediction with actual outcome and compute Brier score
   */
  async resolvePrediction(input: {
    id: string;
    organizationId: string;
    actualOutcome: string;
    outcomeDate: string;
  }): Promise<ConfidenceCalibrationEntry> {
    // Get existing prediction
    const existing = await pool!.query(
      'SELECT * FROM regulatory_intel.confidence_calibration_log WHERE id = $1 AND organization_id = $2',
      [input.id, input.organizationId]
    );
    if (existing.rows.length === 0) throw new Error('Prediction not found');

    const prediction = existing.rows[0];
    const outcomeMatch = prediction.predicted_outcome === input.actualOutcome ? 1 : 0;
    const brierScore = Math.pow(prediction.predicted_confidence - outcomeMatch, 2);

    const result = await pool!.query(`
      UPDATE regulatory_intel.confidence_calibration_log
      SET actual_outcome = $1, outcome_date = $2, brier_score = $3
      WHERE id = $4 AND organization_id = $5
      RETURNING *
    `, [input.actualOutcome, input.outcomeDate, brierScore, input.id, input.organizationId]);

    return this.mapCalibrationEntry(result.rows[0]);
  }

  /**
   * Generate calibration report
   */
  async getCalibrationReport(organizationId: string, ruleId?: string): Promise<CalibrationReport> {
    log.info('Generating calibration report', { ruleId });

    const conditions = ['organization_id = $1'];
    const params: string[] = [organizationId];
    if (ruleId) {
      conditions.push('rule_id = $2');
      params.push(ruleId);
    }

    const result = await pool!.query(`
      SELECT
        calibration_bucket,
        COUNT(*)::int as total,
        COUNT(actual_outcome)::int as resolved,
        AVG(predicted_confidence)::numeric(5,4) as avg_predicted,
        AVG(CASE WHEN predicted_outcome = actual_outcome THEN 1.0 ELSE 0.0 END)::numeric(5,4) as avg_actual,
        AVG(brier_score)::numeric(7,6) as avg_brier
      FROM regulatory_intel.confidence_calibration_log
      WHERE ${conditions.join(' AND ')}
      GROUP BY calibration_bucket
      ORDER BY calibration_bucket
    `, params);

    let totalPredictions = 0;
    let resolvedPredictions = 0;
    let brierSum = 0;
    let brierCount = 0;
    const calibrationByBucket: Record<string, { predicted: number; actual: number; count: number }> = {};

    for (const row of result.rows) {
      totalPredictions += row.total;
      resolvedPredictions += row.resolved;
      if (row.avg_brier !== null) {
        brierSum += parseFloat(row.avg_brier) * row.resolved;
        brierCount += row.resolved;
      }
      if (row.calibration_bucket) {
        calibrationByBucket[row.calibration_bucket] = {
          predicted: parseFloat(row.avg_predicted) || 0,
          actual: parseFloat(row.avg_actual) || 0,
          count: row.total,
        };
      }
    }

    const averageBrierScore = brierCount > 0 ? brierSum / brierCount : 0;
    const overconfidenceBias = this.calculateOverconfidenceBias(calibrationByBucket);

    const recommendation = averageBrierScore < 0.1 ? 'Excellent calibration. Maintain current approach.'
      : averageBrierScore < 0.2 ? 'Good calibration. Minor adjustments may improve accuracy.'
      : averageBrierScore < 0.3 ? 'Fair calibration. Consider recalibrating confidence modifiers.'
      : 'Poor calibration. Rules require significant recalibration.';

    return {
      totalPredictions,
      resolvedPredictions,
      averageBrierScore: Math.round(averageBrierScore * 1000000) / 1000000,
      calibrationByBucket,
      overconfidenceBias,
      recommendation,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
    // Simple key-based condition evaluation
    // Format: "key=value" or "key>value" or "key_exists"
    if (condition.includes('=')) {
      const [key, value] = condition.split('=');
      return String(context[key.trim()]) === value.trim();
    }
    if (condition.includes('>')) {
      const [key, value] = condition.split('>');
      return Number(context[key.trim()]) > Number(value.trim());
    }
    if (condition.endsWith('_exists')) {
      const key = condition.replace('_exists', '');
      return context[key] !== undefined && context[key] !== null;
    }
    return context[condition] !== undefined;
  }

  private assessCalibrationQuality(rule: PrecedentApplicationRule): ConfidenceScore['calibrationQuality'] {
    if (!rule.backtestedAccuracy || !rule.validationSampleSize) return 'uncalibrated';
    if (rule.validationSampleSize < 10) return 'poor';
    if (rule.backtestedAccuracy > 0.85) return 'excellent';
    if (rule.backtestedAccuracy > 0.7) return 'good';
    if (rule.backtestedAccuracy > 0.5) return 'fair';
    return 'poor';
  }

  private confidenceBucket(confidence: number): string {
    const lower = Math.floor(confidence * 10) / 10;
    const upper = lower + 0.1;
    return `${lower.toFixed(1)}-${upper.toFixed(1)}`;
  }

  private calculateOverconfidenceBias(
    buckets: Record<string, { predicted: number; actual: number; count: number }>
  ): number {
    let biasSum = 0;
    let totalCount = 0;
    for (const bucket of Object.values(buckets)) {
      biasSum += (bucket.predicted - bucket.actual) * bucket.count;
      totalCount += bucket.count;
    }
    return totalCount > 0 ? Math.round((biasSum / totalCount) * 10000) / 10000 : 0;
  }

  private mapRule(row: Record<string, unknown>): PrecedentApplicationRule {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      ruleCode: row.rule_code as string,
      ruleName: row.rule_name as string,
      ruleType: row.rule_type as RuleType,
      description: row.description as string,
      applicabilityCriteria: (row.applicability_criteria as Record<string, unknown>) ?? {},
      weightFactors: (row.weight_factors as Record<string, unknown>) ?? {},
      baseConfidence: parseFloat(row.base_confidence as string) || 0.5,
      confidenceModifiers: (row.confidence_modifiers as ConfidenceModifier[]) ?? [],
      minimumPrecedentCount: (row.minimum_precedent_count as number) ?? 3,
      recencyDecayHalflifeDays: (row.recency_decay_halflife_days as number) ?? 730,
      applicableAgencies: (row.applicable_agencies as string[]) ?? [],
      crossJurisdictional: (row.cross_jurisdictional as boolean) ?? false,
      backtestedAccuracy: row.backtested_accuracy ? parseFloat(row.backtested_accuracy as string) : null,
      lastValidated: row.last_validated as string | null,
      validationSampleSize: row.validation_sample_size as number | null,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }

  private mapCalibrationEntry(row: Record<string, unknown>): ConfidenceCalibrationEntry {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      ruleId: row.rule_id as string,
      predictionId: row.prediction_id as string | null,
      predictedOutcome: row.predicted_outcome as string,
      predictedConfidence: parseFloat(row.predicted_confidence as string) || 0,
      actualOutcome: row.actual_outcome as string | null,
      outcomeDate: row.outcome_date as string | null,
      brierScore: row.brier_score ? parseFloat(row.brier_score as string) : null,
      calibrationBucket: row.calibration_bucket as string | null,
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
    };
  }
}

export const confidenceCalibrationService = new ConfidenceCalibrationService();
