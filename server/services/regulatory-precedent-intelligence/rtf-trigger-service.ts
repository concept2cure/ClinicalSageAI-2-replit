/**
 * RTF Trigger Pattern Library & Recovery Playbook
 *
 * Identifies Refuse to File trigger patterns, provides preventability assessment,
 * and generates recovery playbooks for RTF events.
 *
 * @module server/services/regulatory-precedent-intelligence/rtf-trigger-service
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('rtf-trigger-service');

// ─── Types ───────────────────────────────────────────────────────────────────

export type RTFCategory =
  | 'administrative' | 'content_completeness' | 'format_compliance'
  | 'scientific_adequacy' | 'gmp_compliance' | 'clinical_data'
  | 'nonclinical_data' | 'cmc_data' | 'bioequivalence'
  | 'environmental_assessment' | 'patent_certification' | 'user_fee';

export interface RTFTriggerPattern {
  id: string;
  organizationId: string;
  patternCode: string;
  patternName: string;
  category: RTFCategory;
  triggerDescription: string;
  typicalFdaLanguage: string[];
  frequencyRate: number;
  preventability: 'highly_preventable' | 'preventable' | 'partially_preventable' | 'difficult';
  recoveryTimelineDays: number;
  recoverySteps: RecoveryStep[];
  commonMistakes: string[];
  submissionTypes: string[];
  applicableCenters: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryStep {
  stepNumber: number;
  action: string;
  details: string;
  timelineDays: number;
}

export interface RTFPreventionReport {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  matchedPatterns: RTFTriggerPattern[];
  preventionChecklist: PreventionItem[];
  estimatedRecoveryDays: number;
}

export interface PreventionItem {
  pattern: string;
  category: string;
  checkDescription: string;
  preventability: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'not_checked' | 'pass' | 'fail' | 'warning';
}

export interface RTFSearchInput {
  organizationId: string;
  category?: RTFCategory;
  submissionType?: string;
  center?: string;
  preventability?: string;
  limit?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class RTFTriggerService {

  /**
   * Search RTF trigger patterns
   */
  async searchPatterns(input: RTFSearchInput): Promise<RTFTriggerPattern[]> {
    log.info('Searching RTF trigger patterns', { category: input.category });

    const conditions: string[] = ['organization_id = $1'];
    const params: (string | number)[] = [input.organizationId];
    let paramIdx = 2;

    if (input.category) {
      conditions.push(`category = $${paramIdx++}`);
      params.push(input.category);
    }
    if (input.submissionType) {
      conditions.push(`$${paramIdx++} = ANY(submission_types)`);
      params.push(input.submissionType);
    }
    if (input.center) {
      conditions.push(`$${paramIdx++} = ANY(applicable_centers)`);
      params.push(input.center);
    }
    if (input.preventability) {
      conditions.push(`preventability = $${paramIdx++}`);
      params.push(input.preventability);
    }

    const limit = input.limit ?? 25;
    params.push(limit);

    const result = await pool!.query(`
      SELECT * FROM regulatory_intel.rtf_trigger_patterns
      WHERE ${conditions.join(' AND ')}
      ORDER BY frequency_rate DESC NULLS LAST
      LIMIT $${paramIdx}
    `, params);

    return result.rows.map(this.mapPattern);
  }

  /**
   * Get a specific RTF pattern by ID
   */
  async getPattern(id: string, organizationId: string): Promise<RTFTriggerPattern | null> {
    const result = await pool!.query(
      'SELECT * FROM regulatory_intel.rtf_trigger_patterns WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows.length ? this.mapPattern(result.rows[0]) : null;
  }

  /**
   * Create a new RTF trigger pattern
   */
  async createPattern(pattern: Omit<RTFTriggerPattern, 'id' | 'createdAt' | 'updatedAt'>): Promise<RTFTriggerPattern> {
    log.info('Creating RTF trigger pattern', { code: pattern.patternCode });

    const result = await pool!.query(`
      INSERT INTO regulatory_intel.rtf_trigger_patterns (
        organization_id, pattern_code, pattern_name, category,
        trigger_description, typical_fda_language,
        frequency_rate, preventability, recovery_timeline_days,
        recovery_steps, common_mistakes, submission_types, applicable_centers
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      pattern.organizationId, pattern.patternCode, pattern.patternName, pattern.category,
      pattern.triggerDescription, pattern.typicalFdaLanguage,
      pattern.frequencyRate, pattern.preventability, pattern.recoveryTimelineDays,
      JSON.stringify(pattern.recoverySteps), pattern.commonMistakes,
      pattern.submissionTypes, pattern.applicableCenters
    ]);

    return this.mapPattern(result.rows[0]);
  }

  /**
   * Generate an RTF prevention report for a submission
   */
  async generatePreventionReport(input: {
    organizationId: string;
    submissionType: string;
    center?: string;
  }): Promise<RTFPreventionReport> {
    log.info('Generating RTF prevention report', { submissionType: input.submissionType });

    const patterns = await this.searchPatterns({
      organizationId: input.organizationId,
      submissionType: input.submissionType,
      center: input.center,
      limit: 50,
    });

    let riskScore = 0;
    const checklist: PreventionItem[] = [];

    for (const pattern of patterns) {
      const weight = this.preventabilityWeight(pattern.preventability);
      riskScore += pattern.frequencyRate * weight;

      checklist.push({
        pattern: pattern.patternName,
        category: pattern.category,
        checkDescription: pattern.triggerDescription,
        preventability: pattern.preventability,
        priority: pattern.frequencyRate > 0.2 ? 'critical'
          : pattern.frequencyRate > 0.1 ? 'high'
          : pattern.frequencyRate > 0.05 ? 'medium'
          : 'low',
        status: 'not_checked',
      });
    }

    riskScore = Math.min(100, riskScore * 100);

    const estimatedRecoveryDays = patterns.length > 0
      ? Math.round(patterns.reduce((sum, p) => sum + p.recoveryTimelineDays, 0) / patterns.length)
      : 0;

    return {
      overallRisk: riskScore < 25 ? 'low' : riskScore < 50 ? 'medium' : riskScore < 75 ? 'high' : 'critical',
      riskScore,
      matchedPatterns: patterns,
      preventionChecklist: checklist.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      }),
      estimatedRecoveryDays,
    };
  }

  /**
   * Get recovery playbook for a specific RTF pattern
   */
  async getRecoveryPlaybook(patternId: string, organizationId: string): Promise<{
    pattern: RTFTriggerPattern;
    playbook: RecoveryStep[];
    commonMistakes: string[];
    estimatedTimeline: number;
  } | null> {
    const pattern = await this.getPattern(patternId, organizationId);
    if (!pattern) return null;

    return {
      pattern,
      playbook: pattern.recoverySteps,
      commonMistakes: pattern.commonMistakes,
      estimatedTimeline: pattern.recoveryTimelineDays,
    };
  }

  /**
   * Get RTF statistics by center
   */
  async getStatsByCenter(organizationId: string): Promise<Record<string, { count: number; avgFrequency: number; avgRecoveryDays: number }>> {
    const result = await pool!.query(`
      SELECT
        unnest(applicable_centers) as center,
        COUNT(*)::int as count,
        AVG(frequency_rate)::numeric(5,4) as avg_frequency,
        AVG(recovery_timeline_days)::int as avg_recovery_days
      FROM regulatory_intel.rtf_trigger_patterns
      WHERE organization_id = $1
      GROUP BY center
      ORDER BY avg_frequency DESC
    `, [organizationId]);

    const stats: Record<string, { count: number; avgFrequency: number; avgRecoveryDays: number }> = {};
    for (const row of result.rows) {
      stats[row.center] = {
        count: row.count,
        avgFrequency: parseFloat(row.avg_frequency) || 0,
        avgRecoveryDays: row.avg_recovery_days || 0,
      };
    }
    return stats;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private preventabilityWeight(preventability: string): number {
    const weights: Record<string, number> = {
      highly_preventable: 0.5,
      preventable: 0.8,
      partially_preventable: 1.2,
      difficult: 1.8,
    };
    return weights[preventability] ?? 1.0;
  }

  private mapPattern(row: Record<string, unknown>): RTFTriggerPattern {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      patternCode: row.pattern_code as string,
      patternName: row.pattern_name as string,
      category: row.category as RTFCategory,
      triggerDescription: row.trigger_description as string,
      typicalFdaLanguage: (row.typical_fda_language as string[]) ?? [],
      frequencyRate: parseFloat(row.frequency_rate as string) || 0,
      preventability: row.preventability as RTFTriggerPattern['preventability'],
      recoveryTimelineDays: (row.recovery_timeline_days as number) ?? 0,
      recoverySteps: (row.recovery_steps as RecoveryStep[]) ?? [],
      commonMistakes: (row.common_mistakes as string[]) ?? [],
      submissionTypes: (row.submission_types as string[]) ?? [],
      applicableCenters: (row.applicable_centers as string[]) ?? [],
      createdAt: (row.created_at as Date)?.toISOString() ?? '',
      updatedAt: (row.updated_at as Date)?.toISOString() ?? '',
    };
  }
}

export const rtfTriggerService = new RTFTriggerService();
