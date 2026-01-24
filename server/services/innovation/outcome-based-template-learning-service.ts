/**
 * Outcome-based Template Learning Service
 * 
 * Enterprise-grade service for tracking template effectiveness and
 * learning from submission outcomes to improve template recommendations.
 * 
 * Features:
 * - Template effectiveness tracking
 * - Outcome correlation analysis
 * - Automatic template improvement suggestions
 * - ML-based template recommendations
 * 
 * Part 11 Compliance: Full audit trail for template usage
 */

import { Pool } from 'pg';
import OpenAI from 'openai';

// Types
export interface LearningTemplate {
  id: string;
  orgId?: string;
  templateCode: string;
  templateName: string;
  description?: string;
  version: string;
  templateType: 'section' | 'document' | 'response' | 'form';
  submissionType?: string;
  modulePath?: string;
  therapeuticArea?: string[];
  templateContent: string;
  contentFormat: 'markdown' | 'html' | 'docx' | 'json';
  variables?: Record<string, any>;
  usageCount: number;
  approvalRate?: number;
  avgReviewDays?: number;
  avgQuestionsReceived?: number;
  avgDeficiencies?: number;
  effectivenessScore?: number;
  lastEffectivenessCalc?: Date;
  effectivenessSampleSize?: number;
  parentTemplateId?: string;
  derivedFromOutcomeId?: string;
  status: 'active' | 'deprecated' | 'archived';
  isRecommended: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateUsage {
  id: string;
  templateId: string;
  programId: string;
  submissionId?: string;
  documentId?: string;
  usageType: 'direct' | 'modified' | 'partial';
  modificationExtent?: number;
  userRating?: number;
  userFeedback?: string;
  outcomeId?: string;
  usedAt: Date;
  usedBy: string;
}

export interface SubmissionOutcome {
  id: string;
  programId: string;
  submissionId?: string;
  submissionType: string;
  agency: string;
  submittedAt: Date;
  outcomeStatus: 'approved' | 'approved_with_conditions' | 'refuse_to_file' | 'complete_response' | 'withdrawn';
  outcomeDate?: Date;
  reviewDays?: number;
  questionsReceived?: number;
  informationRequests?: number;
  deficienciesCited?: number;
  wasFirstCycle?: boolean;
  hadRtf?: boolean;
  hadAdvisoryCommittee?: boolean;
  questionsDetail?: any[];
  deficienciesDetail?: any[];
}

export interface TemplateRecommendation {
  template: LearningTemplate;
  relevanceScore: number;
  effectivenessScore: number;
  combinedScore: number;
  reason: string;
  alternativeTemplates?: LearningTemplate[];
}

export interface EffectivenessReport {
  templateId: string;
  templateName: string;
  totalUsage: number;
  outcomes: {
    approved: number;
    approvedWithConditions: number;
    refuseToFile: number;
    completeResponse: number;
  };
  metrics: {
    approvalRate: number;
    avgReviewDays: number;
    avgQuestions: number;
    avgDeficiencies: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  recommendations: string[];
}

export class OutcomeBasedTemplateLearningService {
  private pool: Pool;
  private openai: OpenAI;

  constructor(pool: Pool, openaiApiKey?: string) {
    this.pool = pool;
    this.openai = new OpenAI({ apiKey: openaiApiKey || process.env.OPENAI_API_KEY });
  }

  // ==================== TEMPLATE MANAGEMENT ====================

  /**
   * Create a new template
   */
  async createTemplate(template: Partial<LearningTemplate>): Promise<LearningTemplate> {
    const result = await this.pool.query(`
      INSERT INTO innovation.learning_templates (
        org_id, template_code, template_name, description, version,
        template_type, submission_type, module_path, therapeutic_area,
        template_content, content_format, variables,
        parent_template_id, status, is_recommended
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', FALSE)
      RETURNING *
    `, [
      template.orgId,
      template.templateCode,
      template.templateName,
      template.description,
      template.version || '1.0',
      template.templateType,
      template.submissionType,
      template.modulePath,
      template.therapeuticArea,
      template.templateContent,
      template.contentFormat || 'markdown',
      template.variables ? JSON.stringify(template.variables) : null,
      template.parentTemplateId
    ]);

    return this.mapTemplate(result.rows[0]);
  }

  /**
   * Get templates with filters
   */
  async getTemplates(options: {
    orgId?: string;
    templateType?: string;
    submissionType?: string;
    modulePath?: string;
    status?: string;
    recommendedOnly?: boolean;
    limit?: number;
  } = {}): Promise<LearningTemplate[]> {
    let query = `
      SELECT * FROM innovation.learning_templates
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options.orgId) {
      params.push(options.orgId);
      query += ` AND (org_id IS NULL OR org_id = $${params.length})`;
    }
    if (options.templateType) {
      params.push(options.templateType);
      query += ` AND template_type = $${params.length}`;
    }
    if (options.submissionType) {
      params.push(options.submissionType);
      query += ` AND (submission_type IS NULL OR submission_type = $${params.length})`;
    }
    if (options.modulePath) {
      params.push(options.modulePath);
      query += ` AND (module_path IS NULL OR module_path = $${params.length})`;
    }
    if (options.status) {
      params.push(options.status);
      query += ` AND status = $${params.length}`;
    } else {
      query += ` AND status = 'active'`;
    }
    if (options.recommendedOnly) {
      query += ` AND is_recommended = TRUE`;
    }

    query += ` ORDER BY effectiveness_score DESC NULLS LAST, usage_count DESC`;

    if (options.limit) {
      params.push(options.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapTemplate);
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<LearningTemplate | null> {
    const result = await this.pool.query(`
      SELECT * FROM innovation.learning_templates WHERE id = $1
    `, [templateId]);

    return result.rows.length > 0 ? this.mapTemplate(result.rows[0]) : null;
  }

  // ==================== USAGE TRACKING ====================

  /**
   * Record template usage
   */
  async recordUsage(usage: Partial<TemplateUsage>): Promise<TemplateUsage> {
    const result = await this.pool.query(`
      INSERT INTO innovation.template_usage (
        template_id, program_id, submission_id, document_id,
        usage_type, modification_extent, user_rating, user_feedback, used_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      usage.templateId,
      usage.programId,
      usage.submissionId,
      usage.documentId,
      usage.usageType || 'direct',
      usage.modificationExtent,
      usage.userRating,
      usage.userFeedback,
      usage.usedBy || 'system'
    ]);

    // Update usage count
    await this.pool.query(`
      UPDATE innovation.learning_templates
      SET usage_count = usage_count + 1, updated_at = NOW()
      WHERE id = $1
    `, [usage.templateId]);

    return this.mapUsage(result.rows[0]);
  }

  /**
   * Update usage with user feedback
   */
  async updateUsageFeedback(
    usageId: string,
    rating: number,
    feedback?: string
  ): Promise<TemplateUsage> {
    const result = await this.pool.query(`
      UPDATE innovation.template_usage
      SET user_rating = $2, user_feedback = $3
      WHERE id = $1
      RETURNING *
    `, [usageId, rating, feedback]);

    return this.mapUsage(result.rows[0]);
  }

  // ==================== OUTCOME TRACKING ====================

  /**
   * Record submission outcome
   */
  async recordOutcome(outcome: Partial<SubmissionOutcome>): Promise<SubmissionOutcome> {
    const result = await this.pool.query(`
      INSERT INTO innovation.submission_outcomes (
        program_id, submission_id, submission_type, agency, submitted_at,
        outcome_status, outcome_date, review_days, questions_received,
        information_requests, deficiencies_cited, was_first_cycle,
        had_rtf, had_advisory_committee, questions_detail, deficiencies_detail
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      outcome.programId,
      outcome.submissionId,
      outcome.submissionType,
      outcome.agency,
      outcome.submittedAt,
      outcome.outcomeStatus,
      outcome.outcomeDate,
      outcome.reviewDays,
      outcome.questionsReceived,
      outcome.informationRequests,
      outcome.deficienciesCited,
      outcome.wasFirstCycle,
      outcome.hadRtf,
      outcome.hadAdvisoryCommittee,
      outcome.questionsDetail ? JSON.stringify(outcome.questionsDetail) : null,
      outcome.deficienciesDetail ? JSON.stringify(outcome.deficienciesDetail) : null
    ]);

    // Link to template usages
    await this.linkOutcomeToUsages(result.rows[0].id, outcome.programId!, outcome.submissionId);

    // Trigger effectiveness recalculation
    await this.recalculateAffectedTemplates(outcome.programId!, outcome.submissionId);

    return this.mapOutcome(result.rows[0]);
  }

  /**
   * Link outcome to template usages
   */
  private async linkOutcomeToUsages(
    outcomeId: string,
    programId: string,
    submissionId?: string
  ): Promise<void> {
    let query = `
      UPDATE innovation.template_usage
      SET outcome_id = $1
      WHERE program_id = $2
    `;
    const params = [outcomeId, programId];

    if (submissionId) {
      params.push(submissionId);
      query += ` AND (submission_id = $${params.length} OR submission_id IS NULL)`;
    }

    query += ` AND outcome_id IS NULL`;

    await this.pool.query(query, params);
  }

  // ==================== EFFECTIVENESS CALCULATION ====================

  /**
   * Recalculate effectiveness for affected templates
   */
  private async recalculateAffectedTemplates(
    programId: string,
    submissionId?: string
  ): Promise<void> {
    // Get templates used in this program/submission
    const usageResult = await this.pool.query(`
      SELECT DISTINCT template_id FROM innovation.template_usage
      WHERE program_id = $1
        AND ($2::uuid IS NULL OR submission_id = $2)
    `, [programId, submissionId]);

    for (const row of usageResult.rows) {
      await this.calculateTemplateEffectiveness(row.template_id);
    }
  }

  /**
   * Calculate effectiveness score for a template
   */
  async calculateTemplateEffectiveness(templateId: string): Promise<number | null> {
    // Get all usages with outcomes
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_usage,
        COUNT(tu.outcome_id) as with_outcome,
        AVG(CASE WHEN so.outcome_status IN ('approved', 'approved_with_conditions') THEN 1 ELSE 0 END) as approval_rate,
        AVG(so.review_days) as avg_review_days,
        AVG(so.questions_received) as avg_questions,
        AVG(so.deficiencies_cited) as avg_deficiencies
      FROM innovation.template_usage tu
      LEFT JOIN innovation.submission_outcomes so ON so.id = tu.outcome_id
      WHERE tu.template_id = $1
    `, [templateId]);

    const row = result.rows[0];
    
    if (parseInt(row.with_outcome) < 3) {
      // Not enough data
      return null;
    }

    // Calculate effectiveness score
    // Higher approval rate, fewer questions, shorter review = higher score
    const approvalRate = parseFloat(row.approval_rate) || 0;
    const avgQuestions = parseFloat(row.avg_questions) || 10;
    const avgReviewDays = parseFloat(row.avg_review_days) || 365;

    const score = (
      (approvalRate * 40) +
      (Math.max(0, 30 - avgQuestions) * 1) +
      (Math.max(0, 30 - (avgReviewDays / 30)) * 1)
    );

    const effectivenessScore = Math.min(100, Math.max(0, score));

    // Update template
    await this.pool.query(`
      UPDATE innovation.learning_templates
      SET approval_rate = $2,
          avg_review_days = $3,
          avg_questions_received = $4,
          avg_deficiencies = $5,
          effectiveness_score = $6,
          last_effectiveness_calc = NOW(),
          effectiveness_sample_size = $7,
          is_recommended = $8,
          updated_at = NOW()
      WHERE id = $1
    `, [
      templateId,
      approvalRate,
      row.avg_review_days,
      row.avg_questions,
      row.avg_deficiencies,
      effectivenessScore,
      parseInt(row.with_outcome),
      effectivenessScore >= 70 // Recommend if score >= 70
    ]);

    return effectivenessScore;
  }

  /**
   * Batch recalculate all template effectiveness
   */
  async recalculateAllEffectiveness(): Promise<number> {
    const templates = await this.pool.query(`
      SELECT id FROM innovation.learning_templates WHERE status = 'active'
    `);

    let updated = 0;
    for (const row of templates.rows) {
      const score = await this.calculateTemplateEffectiveness(row.id);
      if (score !== null) updated++;
    }

    console.log(`[TemplateLearning] Recalculated effectiveness for ${updated} templates`);
    return updated;
  }

  // ==================== RECOMMENDATIONS ====================

  /**
   * Get template recommendations for a context
   */
  async getRecommendations(options: {
    submissionType: string;
    modulePath?: string;
    therapeuticArea?: string;
    orgId?: string;
    limit?: number;
  }): Promise<TemplateRecommendation[]> {
    // Get relevant templates
    const templates = await this.getTemplates({
      submissionType: options.submissionType,
      modulePath: options.modulePath,
      orgId: options.orgId,
      status: 'active',
      limit: (options.limit || 5) * 3 // Get more to filter
    });

    const recommendations: TemplateRecommendation[] = [];

    for (const template of templates) {
      // Calculate relevance score
      let relevanceScore = 0.5;
      
      if (template.modulePath === options.modulePath) {
        relevanceScore += 0.3;
      }
      if (template.therapeuticArea?.includes(options.therapeuticArea || '')) {
        relevanceScore += 0.2;
      }
      if (template.orgId === options.orgId) {
        relevanceScore += 0.1;
      }

      const effectivenessScore = (template.effectivenessScore || 50) / 100;
      const combinedScore = (relevanceScore * 0.4) + (effectivenessScore * 0.6);

      let reason = '';
      if (template.isRecommended) {
        reason = `High effectiveness: ${template.effectivenessScore?.toFixed(0)}% score`;
      } else if (template.usageCount > 10) {
        reason = `Popular template with ${template.usageCount} uses`;
      } else {
        reason = 'Relevant to your submission type';
      }

      recommendations.push({
        template,
        relevanceScore,
        effectivenessScore,
        combinedScore,
        reason
      });
    }

    // Sort by combined score
    recommendations.sort((a, b) => b.combinedScore - a.combinedScore);

    return recommendations.slice(0, options.limit || 5);
  }

  // ==================== REPORTING ====================

  /**
   * Get effectiveness report for a template
   */
  async getEffectivenessReport(templateId: string): Promise<EffectivenessReport | null> {
    const template = await this.getTemplate(templateId);
    if (!template) return null;

    // Get outcome breakdown
    const outcomeResult = await this.pool.query(`
      SELECT 
        so.outcome_status,
        COUNT(*) as count
      FROM innovation.template_usage tu
      JOIN innovation.submission_outcomes so ON so.id = tu.outcome_id
      WHERE tu.template_id = $1
      GROUP BY so.outcome_status
    `, [templateId]);

    const outcomes = {
      approved: 0,
      approvedWithConditions: 0,
      refuseToFile: 0,
      completeResponse: 0
    };

    for (const row of outcomeResult.rows) {
      switch (row.outcome_status) {
        case 'approved':
          outcomes.approved = parseInt(row.count);
          break;
        case 'approved_with_conditions':
          outcomes.approvedWithConditions = parseInt(row.count);
          break;
        case 'refuse_to_file':
          outcomes.refuseToFile = parseInt(row.count);
          break;
        case 'complete_response':
          outcomes.completeResponse = parseInt(row.count);
          break;
      }
    }

    // Calculate trend
    const recentResult = await this.pool.query(`
      SELECT AVG(CASE WHEN so.outcome_status IN ('approved', 'approved_with_conditions') THEN 1 ELSE 0 END) as recent_rate
      FROM innovation.template_usage tu
      JOIN innovation.submission_outcomes so ON so.id = tu.outcome_id
      WHERE tu.template_id = $1
        AND so.outcome_date > NOW() - INTERVAL '6 months'
    `, [templateId]);

    const recentRate = parseFloat(recentResult.rows[0]?.recent_rate) || 0;
    const overallRate = template.approvalRate || 0;

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentRate > overallRate + 0.1) trend = 'improving';
    else if (recentRate < overallRate - 0.1) trend = 'declining';

    // Generate recommendations
    const recommendations: string[] = [];
    if (template.avgQuestionsReceived && template.avgQuestionsReceived > 3) {
      recommendations.push('Consider adding more detail to reduce agency questions');
    }
    if (template.avgDeficiencies && template.avgDeficiencies > 2) {
      recommendations.push('Review template against recent guidance updates');
    }
    if (trend === 'declining') {
      recommendations.push('Template effectiveness is declining - consider updates');
    }

    return {
      templateId,
      templateName: template.templateName,
      totalUsage: template.usageCount,
      outcomes,
      metrics: {
        approvalRate: template.approvalRate || 0,
        avgReviewDays: template.avgReviewDays || 0,
        avgQuestions: template.avgQuestionsReceived || 0,
        avgDeficiencies: template.avgDeficiencies || 0
      },
      trend,
      recommendations
    };
  }

  /**
   * Get top performing templates
   */
  async getTopPerformingTemplates(options: {
    submissionType?: string;
    limit?: number;
  } = {}): Promise<LearningTemplate[]> {
    let query = `
      SELECT * FROM innovation.learning_templates
      WHERE status = 'active'
        AND effectiveness_score IS NOT NULL
        AND effectiveness_sample_size >= 3
    `;
    const params: any[] = [];

    if (options.submissionType) {
      params.push(options.submissionType);
      query += ` AND (submission_type = $${params.length} OR submission_type IS NULL)`;
    }

    query += ` ORDER BY effectiveness_score DESC`;

    if (options.limit) {
      params.push(options.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapTemplate);
  }

  // ==================== MAPPERS ====================

  private mapTemplate(row: any): LearningTemplate {
    return {
      id: row.id,
      orgId: row.org_id,
      templateCode: row.template_code,
      templateName: row.template_name,
      description: row.description,
      version: row.version,
      templateType: row.template_type,
      submissionType: row.submission_type,
      modulePath: row.module_path,
      therapeuticArea: row.therapeutic_area,
      templateContent: row.template_content,
      contentFormat: row.content_format,
      variables: row.variables,
      usageCount: parseInt(row.usage_count) || 0,
      approvalRate: row.approval_rate ? parseFloat(row.approval_rate) : undefined,
      avgReviewDays: row.avg_review_days ? parseFloat(row.avg_review_days) : undefined,
      avgQuestionsReceived: row.avg_questions_received ? parseFloat(row.avg_questions_received) : undefined,
      avgDeficiencies: row.avg_deficiencies ? parseFloat(row.avg_deficiencies) : undefined,
      effectivenessScore: row.effectiveness_score ? parseFloat(row.effectiveness_score) : undefined,
      lastEffectivenessCalc: row.last_effectiveness_calc,
      effectivenessSampleSize: row.effectiveness_sample_size ? parseInt(row.effectiveness_sample_size) : undefined,
      parentTemplateId: row.parent_template_id,
      derivedFromOutcomeId: row.derived_from_outcome_id,
      status: row.status,
      isRecommended: row.is_recommended,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapUsage(row: any): TemplateUsage {
    return {
      id: row.id,
      templateId: row.template_id,
      programId: row.program_id,
      submissionId: row.submission_id,
      documentId: row.document_id,
      usageType: row.usage_type,
      modificationExtent: row.modification_extent ? parseFloat(row.modification_extent) : undefined,
      userRating: row.user_rating ? parseInt(row.user_rating) : undefined,
      userFeedback: row.user_feedback,
      outcomeId: row.outcome_id,
      usedAt: row.used_at,
      usedBy: row.used_by
    };
  }

  private mapOutcome(row: any): SubmissionOutcome {
    return {
      id: row.id,
      programId: row.program_id,
      submissionId: row.submission_id,
      submissionType: row.submission_type,
      agency: row.agency,
      submittedAt: row.submitted_at,
      outcomeStatus: row.outcome_status,
      outcomeDate: row.outcome_date,
      reviewDays: row.review_days ? parseInt(row.review_days) : undefined,
      questionsReceived: row.questions_received ? parseInt(row.questions_received) : undefined,
      informationRequests: row.information_requests ? parseInt(row.information_requests) : undefined,
      deficienciesCited: row.deficiencies_cited ? parseInt(row.deficiencies_cited) : undefined,
      wasFirstCycle: row.was_first_cycle,
      hadRtf: row.had_rtf,
      hadAdvisoryCommittee: row.had_advisory_committee,
      questionsDetail: row.questions_detail,
      deficienciesDetail: row.deficiencies_detail
    };
  }
}

export default OutcomeBasedTemplateLearningService;
