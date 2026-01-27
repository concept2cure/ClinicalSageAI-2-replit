/**
 * LUMEN CORTEX - Atom Quality Assessment Service
 *
 * Automated quality scoring and assessment for knowledge atoms.
 * Computes and tracks quality metrics for audit and prioritization.
 *
 * @module server/services/atomQualityService
 * @version 1.0.0
 * @enterprise true
 */

import { Pool } from 'pg';

// ═══════════════════════════════════════════════════════════════════════════
//                         TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface QualityMetrics {
  completenessScore: number; // 0-1: How complete is the atom's data
  accuracyScore: number; // 0-1: Cross-verified accuracy
  timelinessScore: number; // 0-1: How recent/relevant
  sourceReliability: number; // 0-1: Source trustworthiness
  citationScore: number; // 0-1: Citation quality
  overallScore: number; // Weighted average
  assessedAt: Date;
}

export interface QualityReport {
  atomId: string;
  title: string;
  atomType: string;
  metrics: QualityMetrics;
  issues: QualityIssue[];
  recommendations: string[];
}

export interface QualityIssue {
  type: 'missing_field' | 'outdated' | 'low_confidence' | 'unverified_source' | 'no_citations';
  severity: 'low' | 'medium' | 'high';
  description: string;
  field?: string;
}

export interface QualityThresholds {
  minimumOverall: number;
  minimumCompleteness: number;
  minimumTimeliness: number;
  outdatedDays: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//                      QUALITY ASSESSMENT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class AtomQualityService {
  private pool: Pool;

  // Default quality thresholds
  private thresholds: QualityThresholds = {
    minimumOverall: 0.5,
    minimumCompleteness: 0.6,
    minimumTimeliness: 0.4,
    outdatedDays: 365, // 1 year
  };

  // Source reliability scores
  private sourceReliabilityMap: Record<string, number> = {
    // Primary regulatory sources
    fda_opendata: 0.95,
    fda_warning_letter: 0.95,
    fda_guidance: 0.98,
    ema_decision: 0.95,
    ema_guideline: 0.98,
    ich_guideline: 0.99,

    // Clinical data
    'clinicaltrials.gov': 0.9,
    pubmed: 0.85,
    pubmed_meta_analysis: 0.92,

    // Derived/secondary sources
    derived_analysis: 0.7,
    manual_entry: 0.6,
    web_scrape: 0.5,
    ai_generated: 0.65,

    // Unknown
    unknown: 0.4,
  };

  // Required fields by atom type
  private requiredFieldsByType: Record<string, string[]> = {
    rejection_pattern: ['title', 'content', 'rejection_reason', 'regulatory_pathway'],
    guidance: ['title', 'content', 'effective_date'],
    clinical_trial: ['title', 'content', 'phase', 'status'],
    drug_info: ['title', 'content', 'active_ingredient'],
    regulatory_decision: ['title', 'content', 'decision_type', 'agency'],
    default: ['title', 'content'],
  };

  // Weights for overall score calculation
  private weights = {
    completeness: 0.25,
    accuracy: 0.25,
    timeliness: 0.2,
    sourceReliability: 0.2,
    citation: 0.1,
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        QUALITY ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Assess quality of a single atom
   */
  async assessAtom(atomId: string): Promise<QualityReport> {
    const atomResult = await this.pool.query(
      `
      SELECT a.*,
             (SELECT COUNT(*) FROM lumen_atom_citations c WHERE c.atom_id = a.id) as citation_count,
             (SELECT COUNT(*) FROM lumen_knowledge_graph_edges e WHERE e.source_atom_id = a.id OR e.target_atom_id = a.id) as edge_count
      FROM lumen_data_atoms a
      WHERE a.id = $1
    `,
      [atomId]
    );

    if (atomResult.rows.length === 0) {
      throw new Error(`Atom ${atomId} not found`);
    }

    const atom = atomResult.rows[0];
    const issues: QualityIssue[] = [];
    const recommendations: string[] = [];

    // 1. Completeness Score
    const completenessScore = this.assessCompleteness(atom, issues);

    // 2. Accuracy Score (based on confidence and verification)
    const accuracyScore = this.assessAccuracy(atom, issues);

    // 3. Timeliness Score
    const timelinessScore = this.assessTimeliness(atom, issues);

    // 4. Source Reliability Score
    const sourceReliability = this.assessSourceReliability(atom, issues);

    // 5. Citation Score
    const citationScore = this.assessCitations(atom, issues);

    // Calculate overall score
    const overallScore =
      completenessScore * this.weights.completeness +
      accuracyScore * this.weights.accuracy +
      timelinessScore * this.weights.timeliness +
      sourceReliability * this.weights.sourceReliability +
      citationScore * this.weights.citation;

    // Generate recommendations
    if (completenessScore < this.thresholds.minimumCompleteness) {
      recommendations.push('Add missing required fields to improve completeness');
    }
    if (timelinessScore < this.thresholds.minimumTimeliness) {
      recommendations.push('Review and update atom content for currency');
    }
    if (citationScore < 0.3) {
      recommendations.push('Add source citations to improve traceability');
    }
    if (sourceReliability < 0.6) {
      recommendations.push('Verify content against primary sources');
    }
    if (parseInt(atom.edge_count) < 2) {
      recommendations.push('Build knowledge graph connections to related atoms');
    }

    const metrics: QualityMetrics = {
      completenessScore,
      accuracyScore,
      timelinessScore,
      sourceReliability,
      citationScore,
      overallScore,
      assessedAt: new Date(),
    };

    // Store the quality score
    await this.storeQualityScore(atomId, metrics);

    return {
      atomId,
      title: atom.title,
      atomType: atom.atom_type,
      metrics,
      issues,
      recommendations,
    };
  }

  /**
   * Assess completeness of an atom
   */
  private assessCompleteness(atom: any, issues: QualityIssue[]): number {
    const requiredFields =
      this.requiredFieldsByType[atom.atom_type] || this.requiredFieldsByType['default'];
    let presentCount = 0;

    for (const field of requiredFields) {
      const value = atom[field] || atom.metadata?.[field];
      if (value && value !== '' && value !== null) {
        presentCount++;
      } else {
        issues.push({
          type: 'missing_field',
          severity: field === 'title' || field === 'content' ? 'high' : 'medium',
          description: `Missing required field: ${field}`,
          field,
        });
      }
    }

    // Check optional but important fields
    const optionalFields = ['tags', 'source_url', 'effective_date'];
    let optionalPresent = 0;
    for (const field of optionalFields) {
      const value = atom[field] || atom.metadata?.[field];
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        optionalPresent++;
      }
    }

    // Base score from required fields
    const requiredScore = presentCount / requiredFields.length;
    // Bonus from optional fields (up to 10%)
    const optionalBonus = (optionalPresent / optionalFields.length) * 0.1;

    return Math.min(1.0, requiredScore + optionalBonus);
  }

  /**
   * Assess accuracy of an atom
   */
  private assessAccuracy(atom: any, issues: QualityIssue[]): number {
    // Start with the atom's confidence score if available
    let baseScore = atom.confidence || 0.5;

    // Check if content is substantive
    const contentLength = (atom.content || '').length;
    if (contentLength < 50) {
      issues.push({
        type: 'low_confidence',
        severity: 'high',
        description: 'Content is too brief to be useful',
      });
      baseScore *= 0.5;
    } else if (contentLength < 200) {
      baseScore *= 0.8;
    }

    // Check for verification markers in metadata
    if (atom.metadata?.verified === true) {
      baseScore = Math.min(1.0, baseScore + 0.1);
    }

    // Check for contradictions
    if (atom.metadata?.has_conflicts === true) {
      issues.push({
        type: 'low_confidence',
        severity: 'medium',
        description: 'Atom has known conflicts with other information',
      });
      baseScore *= 0.7;
    }

    return baseScore;
  }

  /**
   * Assess timeliness of an atom
   */
  private assessTimeliness(atom: any, issues: QualityIssue[]): number {
    const createdAt = new Date(atom.created_at);
    const effectiveDate = atom.metadata?.effective_date
      ? new Date(atom.metadata.effective_date)
      : null;
    const referenceDate = effectiveDate || createdAt;

    const now = new Date();
    const ageInDays = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);

    // Score decays over time
    if (ageInDays > this.thresholds.outdatedDays * 2) {
      issues.push({
        type: 'outdated',
        severity: 'high',
        description: `Information is over ${Math.round(ageInDays / 365)} years old`,
      });
      return 0.2;
    } else if (ageInDays > this.thresholds.outdatedDays) {
      issues.push({
        type: 'outdated',
        severity: 'medium',
        description: `Information is over ${Math.round(ageInDays / 30)} months old`,
      });
      return 0.5;
    } else if (ageInDays > this.thresholds.outdatedDays / 2) {
      return 0.7;
    } else if (ageInDays > 90) {
      return 0.85;
    }

    return 1.0;
  }

  /**
   * Assess source reliability
   */
  private assessSourceReliability(atom: any, issues: QualityIssue[]): number {
    const sourceType = atom.source_type?.toLowerCase() || 'unknown';

    // Find best matching reliability score
    let reliability = this.sourceReliabilityMap['unknown'];
    for (const [key, score] of Object.entries(this.sourceReliabilityMap)) {
      if (sourceType.includes(key)) {
        reliability = Math.max(reliability, score);
      }
    }

    // Check for source URL
    if (!atom.source_url && !atom.metadata?.source_url) {
      issues.push({
        type: 'unverified_source',
        severity: 'medium',
        description: 'No source URL provided for verification',
      });
      reliability *= 0.9;
    }

    // Boost for primary regulatory sources
    if (['fda', 'ema', 'ich', 'who'].some(agency => sourceType.includes(agency))) {
      reliability = Math.min(1.0, reliability + 0.05);
    }

    return reliability;
  }

  /**
   * Assess citation quality
   */
  private assessCitations(atom: any, issues: QualityIssue[]): number {
    const citationCount = parseInt(atom.citation_count) || 0;
    const edgeCount = parseInt(atom.edge_count) || 0;

    if (citationCount === 0 && edgeCount < 2) {
      issues.push({
        type: 'no_citations',
        severity: 'low',
        description: 'No citations or connections to other atoms',
      });
      return 0.2;
    }

    // Score based on citation count
    if (citationCount >= 5) return 1.0;
    if (citationCount >= 3) return 0.8;
    if (citationCount >= 1) return 0.6;

    // Fall back to edge count
    if (edgeCount >= 5) return 0.7;
    if (edgeCount >= 2) return 0.5;

    return 0.3;
  }

  /**
   * Store quality score in database
   */
  private async storeQualityScore(atomId: string, metrics: QualityMetrics): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO lumen_atom_quality_scores (
        atom_id, completeness_score, accuracy_score, timeliness_score,
        source_reliability, citation_score, overall_score, assessed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (atom_id) DO UPDATE SET
        completeness_score = $2,
        accuracy_score = $3,
        timeliness_score = $4,
        source_reliability = $5,
        citation_score = $6,
        overall_score = $7,
        assessed_at = $8
    `,
      [
        atomId,
        metrics.completenessScore,
        metrics.accuracyScore,
        metrics.timelinessScore,
        metrics.sourceReliability,
        metrics.citationScore,
        metrics.overallScore,
        metrics.assessedAt,
      ]
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                        BATCH ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Assess quality for atoms without scores
   */
  async assessUnscored(limit: number = 100): Promise<{ assessed: number; avgScore: number }> {
    const atomsResult = await this.pool.query(
      `
      SELECT a.id
      FROM lumen_data_atoms a
      LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      WHERE q.id IS NULL
      LIMIT $1
    `,
      [limit]
    );

    let totalScore = 0;
    let assessed = 0;

    for (const atom of atomsResult.rows) {
      try {
        const report = await this.assessAtom(atom.id);
        totalScore += report.metrics.overallScore;
        assessed++;
      } catch (error) {
        console.error(`Failed to assess atom ${atom.id}:`, error);
      }
    }

    return {
      assessed,
      avgScore: assessed > 0 ? totalScore / assessed : 0,
    };
  }

  /**
   * Reassess all atoms (for periodic quality review)
   */
  async reassessAll(batchSize: number = 50): Promise<{ assessed: number; avgScore: number }> {
    const countResult = await this.pool.query('SELECT COUNT(*) FROM lumen_data_atoms');
    const totalAtoms = parseInt(countResult.rows[0].count);

    let totalScore = 0;
    let assessed = 0;
    let offset = 0;

    while (offset < totalAtoms) {
      const atomsResult = await this.pool.query(
        `
        SELECT id FROM lumen_data_atoms ORDER BY id LIMIT $1 OFFSET $2
      `,
        [batchSize, offset]
      );

      for (const atom of atomsResult.rows) {
        try {
          const report = await this.assessAtom(atom.id);
          totalScore += report.metrics.overallScore;
          assessed++;
        } catch (error) {
          console.error(`Failed to assess atom ${atom.id}:`, error);
        }
      }

      offset += batchSize;
    }

    return {
      assessed,
      avgScore: assessed > 0 ? totalScore / assessed : 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //                           QUALITY QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get atoms below quality threshold
   */
  async getLowQualityAtoms(threshold: number = 0.5, limit: number = 50): Promise<QualityReport[]> {
    const result = await this.pool.query(
      `
      SELECT a.id, a.title, a.atom_type, q.*
      FROM lumen_data_atoms a
      JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      WHERE q.overall_score < $1
      ORDER BY q.overall_score ASC
      LIMIT $2
    `,
      [threshold, limit]
    );

    return result.rows.map(row => ({
      atomId: row.id,
      title: row.title,
      atomType: row.atom_type,
      metrics: {
        completenessScore: row.completeness_score,
        accuracyScore: row.accuracy_score,
        timelinessScore: row.timeliness_score,
        sourceReliability: row.source_reliability,
        citationScore: row.citation_score,
        overallScore: row.overall_score,
        assessedAt: row.assessed_at,
      },
      issues: [],
      recommendations: [],
    }));
  }

  /**
   * Get quality distribution statistics
   */
  async getQualityDistribution(): Promise<{
    excellent: number; // > 0.8
    good: number; // 0.6 - 0.8
    fair: number; // 0.4 - 0.6
    poor: number; // < 0.4
    unassessed: number;
    avgScore: number;
  }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE q.overall_score > 0.8) as excellent,
        COUNT(*) FILTER (WHERE q.overall_score BETWEEN 0.6 AND 0.8) as good,
        COUNT(*) FILTER (WHERE q.overall_score BETWEEN 0.4 AND 0.6) as fair,
        COUNT(*) FILTER (WHERE q.overall_score < 0.4) as poor,
        AVG(q.overall_score) as avg_score
      FROM lumen_atom_quality_scores q
    `);

    const unassessedResult = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM lumen_data_atoms a
      LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      WHERE q.id IS NULL
    `);

    const row = result.rows[0];
    return {
      excellent: parseInt(row.excellent) || 0,
      good: parseInt(row.good) || 0,
      fair: parseInt(row.fair) || 0,
      poor: parseInt(row.poor) || 0,
      unassessed: parseInt(unassessedResult.rows[0].count) || 0,
      avgScore: parseFloat(row.avg_score) || 0,
    };
  }

  /**
   * Get quality breakdown by atom type
   */
  async getQualityByType(): Promise<
    Array<{
      atomType: string;
      count: number;
      avgScore: number;
      minScore: number;
      maxScore: number;
    }>
  > {
    const result = await this.pool.query(`
      SELECT
        a.atom_type,
        COUNT(*) as count,
        AVG(q.overall_score) as avg_score,
        MIN(q.overall_score) as min_score,
        MAX(q.overall_score) as max_score
      FROM lumen_data_atoms a
      JOIN lumen_atom_quality_scores q ON a.id = q.atom_id
      GROUP BY a.atom_type
      ORDER BY avg_score DESC
    `);

    return result.rows.map(row => ({
      atomType: row.atom_type,
      count: parseInt(row.count),
      avgScore: parseFloat(row.avg_score),
      minScore: parseFloat(row.min_score),
      maxScore: parseFloat(row.max_score),
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                              FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createAtomQualityService(pool: Pool): AtomQualityService {
  return new AtomQualityService(pool);
}
