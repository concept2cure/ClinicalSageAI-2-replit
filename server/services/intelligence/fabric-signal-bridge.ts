/**
 * Fabric ↔ RIM Signal Bridge — Bidirectional Integration
 *
 * Connects the governed document decision fabric to the Regulatory
 * Intelligence Model (RIM) in both directions:
 *
 *   A. Fabric → RIM: Intercept governed fabric decisions and emit them
 *      as RIM intelligence signals (cross_module type).
 *
 *   B. RIM → Fabric: Build compact RIM context that the fabric evaluator
 *      can consume for enriched governance decisions.
 *
 * Design principles:
 *   - Non-blocking, fire-and-forget (matches existing interceptor pattern)
 *   - No circular imports — only imports from sibling RIM files
 *   - Uses existing SignalType ('cross_module') and RIMRunType ('manual_capture')
 *   - Fabric-specific metadata stored in the signal's metadata field
 *
 * @module server/services/intelligence/fabric-signal-bridge
 */

import {
  integrateSignal,
  type RIMIntegrationContext,
  type RIMIntegrationResult,
} from './rim-integration.js';

import {
  querySignals,
  getSignalSummary,
  getRecurringPatterns,
  type SignalSummary,
  type TrendConfidence,
} from './signal-capture.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input for intercepting a governed fabric decision and emitting it as a RIM signal.
 */
export interface FabricDecisionInterceptInput {
  readonly organizationId: number;
  readonly projectId: number;
  readonly userId?: number;
  readonly artifactId?: string;
  readonly sectionCode?: string;
  readonly decisionId: string;
  readonly intent: string;
  readonly outcome: string; // allow | block | review | degraded
  readonly readinessLevel: string;
  readonly readinessScore: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly blockerCategories: string[];
  readonly exportGateOutcome: string;
  readonly publishGateOutcome: string;
  readonly consequenceTypes: string[];
}

/**
 * Compact RIM context for fabric evaluation enrichment.
 */
export interface RIMFabricContext {
  readonly signalSummary: {
    readonly totalSignals: number;
    readonly byRiskLevel: Record<string, number>;
    readonly averageScore: number;
    readonly overallTrend: 'improving' | 'stable' | 'declining';
    readonly trendConfidence: TrendConfidence;
  };
  readonly topPatternIds: string[];
  readonly recentBlockerHistory: number;
  readonly recurringPatterns: Array<{ patternId: string; occurrences: number }>;
  readonly hasHighRiskSignals: boolean;
  readonly hasCriticalPatterns: boolean;
  readonly compactSummary: string;
}

/**
 * Learning event emitted when a governed fabric decision produces
 * intelligence worth feeding back into the RIM learning loop.
 */
export interface GovernedFabricLearningEvent {
  readonly organizationId: number;
  readonly projectId: number;
  readonly artifactId?: string;
  readonly decisionRef: string;
  readonly readinessState: string;
  readonly blockerCodes: string[];
  readonly warningCodes: string[];
  readonly promotionOutcome?: string;
  readonly exportOutcome: string;
  readonly publishOutcome: string;
  readonly placementOutcome: string;
  readonly downstreamConsequenceTypes: string[];
  readonly routeSurface?: string;
  readonly regulatorScope?: string;
  readonly documentClass?: string;
  readonly sourceModule: string;
  readonly timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. FABRIC → RIM: Intercept fabric decisions as RIM signals
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map fabric decision outcome to RIM risk level.
 */
function outcomeToRiskLevel(
  outcome: string,
  blockerCount: number,
  readinessScore: number,
): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  if (outcome === 'block' && blockerCount > 0) return 'critical';
  if (outcome === 'block') return 'high';
  if (outcome === 'review') return 'medium';
  if (outcome === 'degraded') return 'high';
  // allow — risk depends on readiness score
  if (readinessScore >= 80) return 'none';
  if (readinessScore >= 60) return 'low';
  return 'medium';
}

/**
 * Map fabric decision to a defensibility verdict.
 */
function outcomeToVerdict(
  outcome: string,
  readinessScore: number,
): 'pass' | 'acceptable' | 'needs_attention' | 'at_risk' | 'fail' {
  if (outcome === 'block') return 'fail';
  if (outcome === 'degraded') return 'at_risk';
  if (outcome === 'review') return 'needs_attention';
  // allow
  if (readinessScore >= 80) return 'pass';
  if (readinessScore >= 60) return 'acceptable';
  return 'needs_attention';
}

/**
 * Map fabric decision to reviewer sensitivity.
 */
function outcomeToSensitivity(
  outcome: string,
  blockerCount: number,
): 'likely_question' | 'possible_question' | 'unlikely_question' {
  if (outcome === 'block' || blockerCount > 0) return 'likely_question';
  if (outcome === 'review') return 'possible_question';
  return 'unlikely_question';
}

/**
 * Build the recommended action string from fabric decision context.
 */
function buildActionFromDecision(input: FabricDecisionInterceptInput): string {
  if (input.outcome === 'block' && input.blockerCategories.length > 0) {
    return `Resolve ${input.blockerCount} blocker(s) before proceeding: ${input.blockerCategories.slice(0, 3).join(', ')}`;
  }
  if (input.outcome === 'block') {
    return `Governance blocked intent "${input.intent}" — resolve blockers before retry`;
  }
  if (input.outcome === 'review') {
    return `Manual review required for "${input.intent}" — ${input.warningCount} warning(s) flagged`;
  }
  if (input.outcome === 'degraded') {
    return `Governance evaluation degraded — proceed with caution, re-evaluate when system recovers`;
  }
  // allow
  if (input.warningCount > 0) {
    return `Allowed with ${input.warningCount} warning(s) — readiness ${input.readinessScore}%`;
  }
  return `Governance approved "${input.intent}" — readiness ${input.readinessScore}%`;
}

/**
 * Compute a signal confidence based on the fabric evaluation quality.
 * Higher confidence when the evaluation is clean (not degraded) with
 * clear outcomes.
 */
function computeFabricConfidence(input: FabricDecisionInterceptInput): number {
  if (input.outcome === 'degraded') return 40;
  // Block/review decisions are high confidence — the fabric is certain
  if (input.outcome === 'block') return 90;
  if (input.outcome === 'review') return 80;
  // Allow decisions — confidence scales with readiness
  return Math.min(95, 60 + Math.round(input.readinessScore * 0.3));
}

/**
 * Intercept a governed fabric decision and emit it as a RIM signal.
 * Non-blocking, fire-and-forget pattern (matches existing interceptors).
 */
export function interceptFabricDecision(input: FabricDecisionInterceptInput): void {
  try {
    const ctx: RIMIntegrationContext = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      userId: input.userId,
      artifactId: input.artifactId,
      sectionCode: input.sectionCode,
      runType: 'manual_capture',
    };

    const riskLevel = outcomeToRiskLevel(input.outcome, input.blockerCount, input.readinessScore);
    const verdict = outcomeToVerdict(input.outcome, input.readinessScore);
    const sensitivity = outcomeToSensitivity(input.outcome, input.blockerCount);
    const action = buildActionFromDecision(input);
    const confidence = computeFabricConfidence(input);

    // Normalize score: fabric readinessScore is 0-100 already
    const score = input.readinessScore;

    integrateSignal(ctx, {
      type: 'cross_module',
      riskLevel,
      reviewerSensitivity: sensitivity,
      defensibilityVerdict: verdict,
      score,
      confidence,
      action,
      patternIds: [],
      metadata: {
        source: 'fabric_decision_interceptor',
        decisionId: input.decisionId,
        intent: input.intent,
        outcome: input.outcome,
        readinessLevel: input.readinessLevel,
        readinessScore: input.readinessScore,
        blockerCount: input.blockerCount,
        warningCount: input.warningCount,
        blockerCategories: input.blockerCategories,
        exportGateOutcome: input.exportGateOutcome,
        publishGateOutcome: input.publishGateOutcome,
        consequenceTypes: input.consequenceTypes,
      },
    });
  } catch (err) {
    console.warn(
      '[RIM] Fabric decision interceptor failed (non-blocking):',
      err instanceof Error ? err.message : err,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// B. RIM → FABRIC: Build RIM context for fabric evaluation enrichment
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build compact RIM context for fabric evaluation enrichment.
 * Returns structured signal summary that the fabric evaluator can consume.
 *
 * This is a synchronous read from working memory — no DB calls,
 * no async overhead. Safe to call inline during fabric evaluation.
 */
export function buildRIMContextForFabric(
  organizationId: number,
  projectId: number,
  artifactId?: string,
  sectionCode?: string,
): RIMFabricContext {
  try {
    // Get the overall project signal summary
    const summary: SignalSummary = getSignalSummary(organizationId, projectId);

    // Query recent fabric-decision signals that resulted in blocks
    const recentBlockSignals = querySignals({
      organizationId,
      projectId,
      type: 'cross_module',
      limit: 50,
    }).filter(
      (s) =>
        s.metadata?.source === 'fabric_decision_interceptor' &&
        s.metadata?.outcome === 'block',
    );

    // Get recurring patterns, optionally scoped to section
    const recurring = getRecurringPatterns(organizationId, projectId, sectionCode);

    // Check for high-risk and critical signals
    const highRiskSignals = querySignals({
      organizationId,
      projectId,
      minRisk: 'high',
      limit: 10,
    });

    // If artifact scoped, also check artifact-specific signals
    let artifactHighRisk = false;
    if (artifactId) {
      const artifactSignals = querySignals({
        organizationId,
        projectId,
        limit: 100,
      }).filter((s) => s.artifactId === artifactId);

      artifactHighRisk = artifactSignals.some(
        (s) => s.riskLevel === 'critical' || s.riskLevel === 'high',
      );
    }

    const hasHighRiskSignals =
      highRiskSignals.length > 0 || artifactHighRisk;

    const hasCriticalPatterns = highRiskSignals.some(
      (s) => s.riskLevel === 'critical' && s.patternIds.length > 0,
    );

    // Build compact summary string
    const compactSummary = buildCompactSummary(
      summary,
      recentBlockSignals.length,
      recurring.length,
      hasHighRiskSignals,
    );

    return {
      signalSummary: {
        totalSignals: summary.totalSignals,
        byRiskLevel: summary.byRiskLevel,
        averageScore: summary.averageScore,
        overallTrend: summary.overallTrend,
        trendConfidence: summary.trendConfidence,
      },
      topPatternIds: summary.topPatternIds,
      recentBlockerHistory: recentBlockSignals.length,
      recurringPatterns: recurring.map((r) => ({
        patternId: r.patternId,
        occurrences: r.occurrences,
      })),
      hasHighRiskSignals,
      hasCriticalPatterns,
      compactSummary,
    };
  } catch (err) {
    console.warn(
      '[RIM] Failed to build fabric context (returning empty):',
      err instanceof Error ? err.message : err,
    );

    // Return safe empty context — fabric evaluation should not fail
    // because RIM context was unavailable
    return {
      signalSummary: {
        totalSignals: 0,
        byRiskLevel: {},
        averageScore: 0,
        overallTrend: 'stable',
        trendConfidence: 'insufficient',
      },
      topPatternIds: [],
      recentBlockerHistory: 0,
      recurringPatterns: [],
      hasHighRiskSignals: false,
      hasCriticalPatterns: false,
      compactSummary: 'No RIM intelligence available',
    };
  }
}

/**
 * Build a one-line human-readable summary for fabric context.
 */
function buildCompactSummary(
  summary: SignalSummary,
  recentBlocks: number,
  recurringCount: number,
  hasHighRisk: boolean,
): string {
  if (summary.totalSignals === 0) {
    return 'No RIM intelligence available';
  }

  const parts: string[] = [];

  parts.push(`${summary.totalSignals} signals`);
  parts.push(`avg score ${summary.averageScore}`);
  parts.push(`trend ${summary.overallTrend}`);

  if (hasHighRisk) {
    const critCount = summary.byRiskLevel['critical'] ?? 0;
    const highCount = summary.byRiskLevel['high'] ?? 0;
    parts.push(`${critCount + highCount} high/critical risk`);
  }

  if (recentBlocks > 0) {
    parts.push(`${recentBlocks} recent blocks`);
  }

  if (recurringCount > 0) {
    parts.push(`${recurringCount} recurring patterns`);
  }

  return parts.join(' | ');
}
