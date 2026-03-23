/**
 * AnA Continuous Evaluation Loop — Real-Time Quality Monitoring
 *
 * Provides continuous quality monitoring during document authoring:
 * - Real-time quality score tracking as content changes
 * - Regression detection (score drops below threshold)
 * - Progress tracking toward submission readiness
 * - Quality trend analysis across editing sessions
 * - Alert generation for quality regressions
 *
 * Integration points:
 * - Called by editor on save/autosave events
 * - Feeds into VALIDATE-COMPLETENESS readiness assessment
 * - Triggers ESCALATE when quality drops below critical threshold
 *
 * @module server/services/ana-continuous-eval
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import { goldStandardEngine } from './ana-gold-standard';

const log = createScopedLogger('ana-continuous-eval');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvalCheckpoint {
  id: string;
  sectionId: string;
  submissionType: string;
  timestamp: string;
  overallScore: number;
  grade: string;
  dimensionScores: Record<string, number>;
  findingCount: number;
  criticalGapCount: number;
  wordCount: number;
}

export interface QualityTrend {
  sectionId: string;
  checkpoints: EvalCheckpoint[];
  currentScore: number;
  previousScore: number | null;
  delta: number;
  trend: 'improving' | 'stable' | 'declining' | 'new';
  readinessProgress: number;
}

export interface QualityAlert {
  id: string;
  type: 'regression' | 'critical_gap_introduced' | 'below_threshold' | 'readiness_blocked';
  severity: 'warning' | 'error' | 'critical';
  sectionId: string;
  message: string;
  previousScore: number;
  currentScore: number;
  recommendation: string;
  timestamp: string;
}

export interface ContinuousEvalInput {
  sectionId: string;
  content: string;
  submissionType: string;
  targetAgency?: string;
  projectId?: string;
  /** If true, saves checkpoint to DB */
  persist?: boolean;
}

export interface ContinuousEvalResult {
  checkpoint: EvalCheckpoint;
  trend: QualityTrend;
  alerts: QualityAlert[];
  readiness: {
    ready: boolean;
    score: number;
    blockers: string[];
    nextMilestone: string;
  };
}

export interface ProjectQualitySummary {
  projectId: string;
  sections: QualityTrend[];
  overallReadiness: number;
  alerts: QualityAlert[];
  lastEvaluated: string;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class ContinuousEvalEngine {

  // In-memory checkpoint store (per-section, last 20 checkpoints)
  private checkpointStore = new Map<string, EvalCheckpoint[]>();

  async evaluate(input: ContinuousEvalInput): Promise<ContinuousEvalResult> {
    log.info(`Continuous eval: section=${input.sectionId}, type=${input.submissionType}`);

    // Run Gold Standard evaluation
    const gsResult = await goldStandardEngine.evaluate({
      content: input.content,
      sectionId: input.sectionId,
      submissionType: input.submissionType,
      targetAgency: input.targetAgency,
    });

    // Build checkpoint
    const checkpoint: EvalCheckpoint = {
      id: `CP-${Date.now().toString(36)}`,
      sectionId: input.sectionId,
      submissionType: input.submissionType,
      timestamp: new Date().toISOString(),
      overallScore: gsResult.overallScore,
      grade: gsResult.overallGrade,
      dimensionScores: Object.fromEntries(
        gsResult.dimensions.map(d => [d.dimension, d.score])
      ),
      findingCount: gsResult.findings.length,
      criticalGapCount: gsResult.findings.filter(f => f.type === 'critical_gap').length,
      wordCount: input.content.split(/\s+/).length,
    };

    // Store checkpoint
    const key = `${input.projectId || 'default'}:${input.sectionId}`;
    const history = this.checkpointStore.get(key) || [];
    history.push(checkpoint);
    if (history.length > 20) history.shift(); // Keep last 20
    this.checkpointStore.set(key, history);

    // Persist to DB if requested
    if (input.persist) {
      await this.persistCheckpoint(checkpoint, input.projectId);
    }

    // Calculate trend
    const trend = this.calculateTrend(input.sectionId, history);

    // Generate alerts
    const alerts = this.generateAlerts(checkpoint, history);

    // Readiness assessment
    const readiness = {
      ready: gsResult.readinessAssessment.ready,
      score: gsResult.overallScore,
      blockers: gsResult.readinessAssessment.blockers,
      nextMilestone: this.getNextMilestone(gsResult.overallScore),
    };

    return { checkpoint, trend, alerts, readiness };
  }

  async getProjectSummary(projectId: string): Promise<ProjectQualitySummary> {
    const sections: QualityTrend[] = [];
    const allAlerts: QualityAlert[] = [];

    for (const [key, history] of this.checkpointStore) {
      if (!key.startsWith(`${projectId}:`)) continue;
      const sectionId = key.split(':')[1];
      const trend = this.calculateTrend(sectionId, history);
      sections.push(trend);

      const latest = history[history.length - 1];
      if (latest) {
        allAlerts.push(...this.generateAlerts(latest, history));
      }
    }

    // Also try loading from DB
    if (sections.length === 0) {
      const dbSections = await this.loadFromDB(projectId);
      sections.push(...dbSections);
    }

    const overallReadiness = sections.length > 0
      ? Math.round(sections.reduce((s, t) => s + t.currentScore, 0) / sections.length)
      : 0;

    return {
      projectId,
      sections,
      overallReadiness,
      alerts: allAlerts,
      lastEvaluated: sections.length > 0
        ? sections.reduce((latest, s) => {
            const cp = s.checkpoints[s.checkpoints.length - 1];
            return cp && cp.timestamp > latest ? cp.timestamp : latest;
          }, '')
        : new Date().toISOString(),
    };
  }

  private calculateTrend(sectionId: string, history: EvalCheckpoint[]): QualityTrend {
    const current = history[history.length - 1];
    const previous = history.length >= 2 ? history[history.length - 2] : null;

    const currentScore = current?.overallScore || 0;
    const previousScore = previous?.overallScore || null;
    const delta = previousScore !== null ? currentScore - previousScore : 0;

    let trend: QualityTrend['trend'];
    if (previousScore === null) trend = 'new';
    else if (delta > 3) trend = 'improving';
    else if (delta < -3) trend = 'declining';
    else trend = 'stable';

    // Readiness progress: percentage toward score of 80 (B+ threshold)
    const readinessProgress = Math.min(100, Math.round((currentScore / 80) * 100));

    return {
      sectionId,
      checkpoints: history.slice(-10), // Last 10 for trend display
      currentScore,
      previousScore,
      delta,
      trend,
      readinessProgress,
    };
  }

  private generateAlerts(checkpoint: EvalCheckpoint, history: EvalCheckpoint[]): QualityAlert[] {
    const alerts: QualityAlert[] = [];
    const previous = history.length >= 2 ? history[history.length - 2] : null;

    // Score regression alert
    if (previous && checkpoint.overallScore < previous.overallScore - 5) {
      alerts.push({
        id: `ALT-${Date.now().toString(36)}-reg`,
        type: 'regression',
        severity: checkpoint.overallScore < previous.overallScore - 15 ? 'critical' : 'warning',
        sectionId: checkpoint.sectionId,
        message: `Quality score dropped ${previous.overallScore - checkpoint.overallScore} points (${previous.overallScore} → ${checkpoint.overallScore})`,
        previousScore: previous.overallScore,
        currentScore: checkpoint.overallScore,
        recommendation: 'Review recent changes — something may have been removed or broken. Check HARMONIZE for consistency.',
        timestamp: checkpoint.timestamp,
      });
    }

    // Critical gap introduced
    if (previous && checkpoint.criticalGapCount > previous.criticalGapCount) {
      alerts.push({
        id: `ALT-${Date.now().toString(36)}-gap`,
        type: 'critical_gap_introduced',
        severity: 'error',
        sectionId: checkpoint.sectionId,
        message: `${checkpoint.criticalGapCount - previous.criticalGapCount} new critical gap(s) detected`,
        previousScore: previous.overallScore,
        currentScore: checkpoint.overallScore,
        recommendation: 'Critical gaps must be resolved before submission. Run Gold Standard evaluation for details.',
        timestamp: checkpoint.timestamp,
      });
    }

    // Below minimum threshold
    if (checkpoint.overallScore < 50) {
      alerts.push({
        id: `ALT-${Date.now().toString(36)}-thr`,
        type: 'below_threshold',
        severity: 'critical',
        sectionId: checkpoint.sectionId,
        message: `Section score ${checkpoint.overallScore}/100 is below minimum submission threshold (50)`,
        previousScore: previous?.overallScore || 0,
        currentScore: checkpoint.overallScore,
        recommendation: 'This section requires significant rework before it can be included in a submission.',
        timestamp: checkpoint.timestamp,
      });
    }

    return alerts;
  }

  private getNextMilestone(score: number): string {
    if (score >= 90) return 'A grade achieved — ready for final review';
    if (score >= 80) return 'B+ grade — address remaining findings for A grade';
    if (score >= 70) return 'B- grade — improve to 80+ for submission confidence';
    if (score >= 60) return 'C grade — significant improvement needed (target: 70+)';
    if (score >= 50) return 'D grade — major rework required (target: 60+)';
    return 'Below minimum — section needs fundamental restructuring';
  }

  private async persistCheckpoint(checkpoint: EvalCheckpoint, projectId?: string): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO precedent.quality_checkpoints (
          section_id, submission_type, overall_score, grade,
          dimension_scores, finding_count, critical_gap_count,
          word_count, project_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          checkpoint.sectionId,
          checkpoint.submissionType,
          checkpoint.overallScore,
          checkpoint.grade,
          JSON.stringify(checkpoint.dimensionScores),
          checkpoint.findingCount,
          checkpoint.criticalGapCount,
          checkpoint.wordCount,
          projectId || null,
        ]
      );
    } catch (err: any) {
      // Table might not exist — graceful degradation
      log.warn(`Failed to persist checkpoint: ${err.message}`);
    }
  }

  private async loadFromDB(projectId: string): Promise<QualityTrend[]> {
    try {
      const result = await pool.query(
        `SELECT section_id, overall_score, grade, dimension_scores,
                finding_count, critical_gap_count, word_count, created_at
         FROM precedent.quality_checkpoints
         WHERE project_id = $1
         ORDER BY section_id, created_at DESC`,
        [projectId]
      );

      const grouped = new Map<string, EvalCheckpoint[]>();
      for (const row of result.rows) {
        const checkpoints = grouped.get(row.section_id) || [];
        checkpoints.push({
          id: `DB-${row.created_at}`,
          sectionId: row.section_id,
          submissionType: '',
          timestamp: row.created_at.toISOString(),
          overallScore: row.overall_score,
          grade: row.grade,
          dimensionScores: row.dimension_scores || {},
          findingCount: row.finding_count,
          criticalGapCount: row.critical_gap_count,
          wordCount: row.word_count,
        });
        grouped.set(row.section_id, checkpoints);
      }

      return Array.from(grouped.entries()).map(([sectionId, history]) =>
        this.calculateTrend(sectionId, history)
      );
    } catch {
      return [];
    }
  }
}

export const continuousEvalEngine = new ContinuousEvalEngine();
