/**
 * Regulatory Intelligence Model (RIM) — Orchestrator (Hardened)
 *
 * The central orchestrator for Concept2Cure's proprietary intelligence layer.
 *
 * Hardening guarantees:
 *   1. Every run has a unique runId — traceable, replayable
 *   2. Every signal carries provenance (framework version, pattern version, runId)
 *   3. Persistence failures are surfaced, never silent
 *   4. Runs are marked 'degraded' if persistence fails
 *   5. Artifact + version linkage is explicit
 *   6. Trend detection is grounded (min sample, version-compatible only)
 *
 * @module server/services/intelligence/rim
 */

import {
  computeReadinessScore,
  type ReadinessScore,
} from './readiness-scoring-engine.js';

import {
  generateRecommendations,
  type Recommendation,
} from './recommendation-engine.js';

import {
  buildEvidenceChain,
  type EvidenceChain,
} from './evidence-confidence-model.js';

import {
  analyzeCrossModuleRelationships,
  type CrossModuleReport,
} from './cross-module-intelligence.js';

import {
  generateJudgmentReport,
  JUDGMENT_FRAMEWORK_VERSION,
  type JudgmentReport,
  type JudgmentContext,
  type JudgmentInput,
} from './judgment-framework.js';

import {
  patternRegistry,
  type PatternMatch,
  type PatternSearchCriteria,
} from './pattern-registry.js';

import {
  captureJudgmentSignals,
  capturePatternSignals,
  getSignalSummary,
  getSectionHistory,
  getRecurringPatterns,
  persistSignals,
  type SignalSummary,
  type SignalProvenance,
  type PersistenceResult,
} from './signal-capture.js';

import {
  getProjectIntelligence,
} from './project-intelligence-service.js';

import {
  getFeedbackSummary,
  type FeedbackSummary,
} from './learning-loop-service.js';

// ═══════════════════════════════════════════════════════════════════════════════
// RIM VERSION
// ═══════════════════════════════════════════════════════════════════════════════

export const RIM_VERSION = '1.1.0';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RIMContext {
  readonly organizationId: number;
  readonly projectId: number;
  readonly userId?: number;
  readonly sectionCode?: string;
  readonly submissionType?: string;
  readonly targetAgency?: string;
  readonly textToScan?: string;
  readonly artifactId?: string;
  readonly artifactVersionId?: string;
}

export type RIMRunStatus = 'complete' | 'degraded' | 'partial';

export interface RIMRun {
  readonly runId: string;
  readonly rimVersion: string;
  readonly status: RIMRunStatus;
  readonly degradedReason?: string;
  readonly persistenceResult: PersistenceResult | null;
}

export interface RIMAssessment {
  readonly run: RIMRun;
  readonly context: RIMContext;
  readonly judgment: JudgmentReport;
  readonly patternMatches: readonly PatternMatch[];
  readonly signalSummary: SignalSummary;
  readonly crossModuleReport: CrossModuleReport | null;
  readonly feedbackSummary: FeedbackSummary | null;
  readonly priorSectionSignals: number;
  readonly recurringPatterns: readonly { patternId: string; occurrences: number }[];
  readonly rimScore: number; // 0-100 unified RIM score
  readonly rimVerdict: string;
  readonly topActions: readonly string[];
  readonly assessedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

let runCounter = 0;

function generateRunId(): string {
  runCounter++;
  return `rim_${Date.now()}_${runCounter}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIM ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a full RIM assessment for a project.
 *
 * Every run:
 *   1. Gets a unique runId
 *   2. Gathers context from existing services
 *   3. Runs all judgment models
 *   4. Scans for regulatory patterns
 *   5. Captures signals with full provenance
 *   6. Persists signals — surfaces failure, marks run degraded if needed
 *   7. Checks for recurring patterns and section history
 *   8. Returns unified assessment with run status
 */
export async function runRIMAssessment(ctx: RIMContext): Promise<RIMAssessment> {
  const runId = generateRunId();
  const { organizationId, projectId, userId, sectionCode, submissionType, targetAgency, textToScan, artifactId, artifactVersionId } = ctx;

  // Build provenance — attached to every signal this run produces
  const provenance: SignalProvenance = {
    judgmentFrameworkVersion: JUDGMENT_FRAMEWORK_VERSION,
    patternRegistryVersion: patternRegistry.version,
    runId,
    runType: 'full_assessment',
  };

  // ── Step 1: Gather existing intelligence (parallel, fault-tolerant) ──
  const [readiness, recommendations, crossModule, intelligence, feedbackSummary] = await Promise.allSettled([
    computeReadinessScore({ organizationId, projectId, submissionType, targetAgency }),
    generateRecommendations({ organizationId, projectId, triggeredBy: 'rim_assessment' }),
    analyzeCrossModuleRelationships({ organizationId, projectId }),
    getProjectIntelligence(projectId, organizationId),
    getFeedbackSummary(projectId, organizationId),
  ]);

  const readinessResult = readiness.status === 'fulfilled' ? readiness.value : null;
  const recsResult = recommendations.status === 'fulfilled'
    ? recommendations.value.recommendations
    : [];
  const crossModuleResult = crossModule.status === 'fulfilled' ? crossModule.value : null;
  const feedbackResult = feedbackSummary.status === 'fulfilled' ? feedbackSummary.value : null;

  // ── Step 2: Build evidence chains from recommendations ──
  const evidenceChains: EvidenceChain[] = recsResult
    .filter(r => r.evidence.length > 0)
    .map(r => buildEvidenceChain(
      r.evidence.map(e => ({
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        sourceTitle: e.sourceTitle,
        relevance: e.relevance,
      })),
      r.sourceType,
    ));

  // ── Step 3: Run judgment models ──
  const judgmentCtx: JudgmentContext = {
    organizationId,
    projectId,
    sectionCode,
    submissionType,
    targetAgency,
  };

  const judgmentInput: JudgmentInput = {
    readiness: readinessResult,
    gaps: readinessResult?.gaps ?? [],
    recommendations: recsResult,
    evidenceChains,
  };

  const judgment = generateJudgmentReport(judgmentCtx, judgmentInput);

  // ── Step 4: Scan for regulatory patterns ──
  let patternMatches: PatternMatch[] = [];

  if (textToScan) {
    const criteria: PatternSearchCriteria = {};
    if (targetAgency) {
      (criteria as { agency?: string }).agency = targetAgency;
    }
    if (submissionType) {
      (criteria as { submissionType?: string }).submissionType = submissionType;
    }
    if (sectionCode) {
      const modulePrefix = sectionCode.split('.')[0];
      (criteria as { ctdModule?: string }).ctdModule = modulePrefix;
    }

    patternMatches = patternRegistry.scanText(
      textToScan,
      sectionCode ?? 'unknown',
      Object.keys(criteria).length > 0 ? criteria : undefined,
    );
  }

  // ── Step 5: Capture intelligence signals with provenance ──
  captureJudgmentSignals(
    organizationId, projectId, judgment, provenance,
    userId, artifactId, artifactVersionId,
  );

  if (patternMatches.length > 0) {
    capturePatternSignals(
      organizationId, projectId, patternMatches, provenance,
      sectionCode, userId, artifactId, artifactVersionId,
    );
  }

  const signalSummary = getSignalSummary(organizationId, projectId);

  // ── Step 6: Persist signals — NEVER silent ──
  const persistenceResult = await persistSignals(organizationId, projectId, runId);

  let runStatus: RIMRunStatus = 'complete';
  let degradedReason: string | undefined;

  if (!persistenceResult.success) {
    runStatus = 'degraded';
    degradedReason = `Persistence failed: ${persistenceResult.error}`;
    console.warn(`[RIM] Run ${runId} degraded — ${degradedReason}`);
  }

  // ── Step 7: Check section history + recurring patterns ──
  const priorSectionSignals = sectionCode
    ? getSectionHistory(organizationId, projectId, sectionCode).length
    : 0;

  const recurringPatterns = getRecurringPatterns(
    organizationId, projectId, sectionCode,
  );

  // ── Step 8: Compute unified RIM score ──
  const rimScore = computeRIMScore(judgment, patternMatches, feedbackResult);
  const topActions = generateTopActions(judgment, patternMatches, recsResult);

  const run: RIMRun = {
    runId,
    rimVersion: RIM_VERSION,
    status: runStatus,
    degradedReason,
    persistenceResult,
  };

  return {
    run,
    context: ctx,
    judgment,
    patternMatches,
    signalSummary,
    crossModuleReport: crossModuleResult,
    feedbackSummary: feedbackResult,
    priorSectionSignals,
    recurringPatterns,
    rimScore,
    rimVerdict: rimScoreToVerdict(rimScore),
    topActions,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Quick scan: run only the pattern registry against text.
 * Lightweight, fast, no DB queries. Still produces provenance.
 */
export function quickPatternScan(
  text: string,
  location: string,
  criteria?: PatternSearchCriteria,
): PatternMatch[] {
  return patternRegistry.scanText(text, location, criteria);
}

/**
 * Get the current signal summary for a project without running a full assessment.
 */
export function getProjectSignals(
  organizationId: number,
  projectId: number,
): SignalSummary {
  return getSignalSummary(organizationId, projectId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL SCORING
// ═══════════════════════════════════════════════════════════════════════════════

function computeRIMScore(
  judgment: JudgmentReport,
  patternMatches: readonly PatternMatch[],
  feedback: FeedbackSummary | null,
): number {
  let score = judgment.overallRisk;

  const criticalPatterns = patternMatches.filter(m => m.pattern.severity === 'critical');
  const highPatterns = patternMatches.filter(m => m.pattern.severity === 'high');
  score -= criticalPatterns.length * 8;
  score -= highPatterns.length * 4;

  if (feedback && feedback.totalFeedback >= 5) {
    if (feedback.acceptanceRate > 0.7) score += 5;
    if (feedback.resolutionRate > 0.5) score += 3;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function rimScoreToVerdict(score: number): string {
  if (score >= 85) return 'Submission Ready — low regulatory risk';
  if (score >= 70) return 'Acceptable — minor issues to address before submission';
  if (score >= 50) return 'Needs Attention — moderate regulatory risk, address findings before submission';
  if (score >= 25) return 'At Risk — significant issues that must be resolved';
  return 'Not Ready — critical deficiencies blocking submission';
}

function generateTopActions(
  judgment: JudgmentReport,
  patternMatches: readonly PatternMatch[],
  recommendations: readonly Recommendation[],
): string[] {
  const actions: Array<{ priority: number; action: string }> = [];

  for (const finding of judgment.topFindings) {
    const priority = finding.severity === 'critical' ? 0 : finding.severity === 'high' ? 1 : 2;
    actions.push({ priority, action: finding.remediation });
  }

  for (const match of patternMatches) {
    const priority = match.pattern.severity === 'critical' ? 0 : match.pattern.severity === 'high' ? 1 : 2;
    actions.push({ priority, action: match.pattern.remediation });
  }

  for (const rec of recommendations.filter(r => r.status === 'active' && (r.severity === 'critical' || r.severity === 'high'))) {
    const priority = rec.severity === 'critical' ? 0 : 1;
    actions.push({ priority, action: rec.suggestedAction });
  }

  const seen = new Set<string>();
  return actions
    .sort((a, b) => a.priority - b.priority)
    .filter(a => {
      if (seen.has(a.action)) return false;
      seen.add(a.action);
      return true;
    })
    .slice(0, 7)
    .map(a => a.action);
}
