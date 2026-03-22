/**
 * Regulatory Intelligence Model (RIM) — Orchestrator
 *
 * The central orchestrator for Concept2Cure's proprietary intelligence layer.
 *
 * RIM is NOT an LLM. It is a structured, evolving system that sits on top
 * of LLMs and becomes more valuable over time through:
 *
 *   1. Judgment Models — codified scoring & reasoning (judgment-framework.ts)
 *   2. Pattern Registry — regulatory prior knowledge (pattern-registry.ts)
 *   3. Signal Capture — intelligence accumulation (signal-capture.ts)
 *   4. Existing services — readiness, recommendations, evidence, cross-module
 *
 * This orchestrator:
 *   - Gathers context from existing services
 *   - Runs judgment models
 *   - Scans for regulatory patterns
 *   - Captures intelligence signals
 *   - Returns a unified RIM assessment
 *
 * @module server/services/intelligence/rim
 */

import {
  computeReadinessScore,
  type ReadinessScore,
  type ReadinessContext,
} from './readiness-scoring-engine.js';

import {
  generateRecommendations,
  type Recommendation,
  type RecommendationContext,
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
  persistSignals,
  type SignalSummary,
} from './signal-capture.js';

import {
  getProjectIntelligence,
  type ProjectIntelligenceSummary,
} from './project-intelligence-service.js';

import {
  getFeedbackSummary,
  type FeedbackSummary,
} from './learning-loop-service.js';

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
}

export interface RIMAssessment {
  readonly context: RIMContext;
  readonly judgment: JudgmentReport;
  readonly patternMatches: readonly PatternMatch[];
  readonly signalSummary: SignalSummary;
  readonly crossModuleReport: CrossModuleReport | null;
  readonly feedbackSummary: FeedbackSummary | null;
  readonly rimScore: number; // 0-100 unified RIM score
  readonly rimVerdict: string;
  readonly topActions: readonly string[];
  readonly assessedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIM ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a full RIM assessment for a project.
 *
 * This is the main entry point. It:
 *   1. Gathers readiness, recommendations, evidence chains
 *   2. Runs all judgment models
 *   3. Scans for regulatory patterns
 *   4. Captures intelligence signals
 *   5. Returns a unified assessment
 */
export async function runRIMAssessment(ctx: RIMContext): Promise<RIMAssessment> {
  const { organizationId, projectId, userId, sectionCode, submissionType, targetAgency, textToScan } = ctx;

  // ── Step 1: Gather existing intelligence ──
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
      // Map section code to CTD module
      const modulePrefix = sectionCode.split('.')[0];
      (criteria as { ctdModule?: string }).ctdModule = modulePrefix;
    }

    patternMatches = patternRegistry.scanText(
      textToScan,
      sectionCode ?? 'unknown',
      Object.keys(criteria).length > 0 ? criteria : undefined,
    );
  }

  // ── Step 5: Capture intelligence signals ──
  captureJudgmentSignals(organizationId, projectId, judgment, userId);

  if (patternMatches.length > 0) {
    capturePatternSignals(organizationId, projectId, patternMatches, sectionCode, userId);
  }

  const signalSummary = getSignalSummary(organizationId, projectId);

  // ── Step 6: Persist signals (async, non-blocking) ──
  persistSignals(organizationId, projectId).catch(() => {
    // Non-critical — signals are still in memory
  });

  // ── Step 7: Compute unified RIM score ──
  const rimScore = computeRIMScore(judgment, patternMatches, feedbackResult);

  // ── Step 8: Generate top actions ──
  const topActions = generateTopActions(judgment, patternMatches, recsResult);

  return {
    context: ctx,
    judgment,
    patternMatches,
    signalSummary,
    crossModuleReport: crossModuleResult,
    feedbackSummary: feedbackResult,
    rimScore,
    rimVerdict: rimScoreToVerdict(rimScore),
    topActions,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Quick scan: run only the pattern registry against text.
 * Lightweight, fast, no DB queries.
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
  // Base: overall judgment risk score
  let score = judgment.overallRisk;

  // Pattern penalty: each critical pattern match reduces score
  const criticalPatterns = patternMatches.filter(m => m.pattern.severity === 'critical');
  const highPatterns = patternMatches.filter(m => m.pattern.severity === 'high');
  score -= criticalPatterns.length * 8;
  score -= highPatterns.length * 4;

  // Feedback bonus: high acceptance rate means our recommendations are useful
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

  // From judgment findings
  for (const finding of judgment.topFindings) {
    const priority = finding.severity === 'critical' ? 0 : finding.severity === 'high' ? 1 : 2;
    actions.push({ priority, action: finding.remediation });
  }

  // From pattern matches
  for (const match of patternMatches) {
    const priority = match.pattern.severity === 'critical' ? 0 : match.pattern.severity === 'high' ? 1 : 2;
    actions.push({ priority, action: match.pattern.remediation });
  }

  // From active critical/high recommendations
  for (const rec of recommendations.filter(r => r.status === 'active' && (r.severity === 'critical' || r.severity === 'high'))) {
    const priority = rec.severity === 'critical' ? 0 : 1;
    actions.push({ priority, action: rec.suggestedAction });
  }

  // Deduplicate and sort
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
