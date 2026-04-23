/**
 * RIM Integration Helper — Reusable entry point for all RIM invocations
 *
 * This is the ONE place that knows how to:
 *   1. Build provenance metadata
 *   2. Invoke RIM (pattern scan, full assessment, or signal capture)
 *   3. Attempt persistence
 *   4. Return a structured RIMIntegrationResult
 *
 * All interceptors and orchestrators use this instead of building
 * provenance or invoking persistence independently.
 *
 * @module server/services/intelligence/rim-integration
 */

import { JUDGMENT_FRAMEWORK_VERSION } from './judgment-framework.js';
import { patternRegistry, persistPatternRegistry } from './pattern-registry.js';
import {
  captureSignal,
  capturePatternSignals,
  captureJudgmentSignals,
  persistSignals,
  type SignalProvenance,
  type IntelligenceSignal,
  type PersistenceResult,
} from './signal-capture.js';
import type { JudgmentReport } from './judgment-framework.js';
import type { PatternMatch } from './pattern-registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type RIMRunType =
  | 'full_assessment'
  | 'pattern_scan'
  | 'chat_intercept'
  | 'compliance_intercept'
  | 'artifact_intercept'
  | 'feedback_intercept'
  | 'manual_capture';

export interface RIMIntegrationResult {
  readonly runId: string;
  readonly status: 'completed' | 'degraded' | 'failed' | 'skipped';
  readonly signalsGenerated: number;
  readonly persistenceStatus: 'persisted' | 'failed' | 'partial' | 'not_attempted';
  readonly trendContextIncluded: boolean;
  readonly warnings: string[];
}

export interface RIMIntegrationContext {
  readonly organizationId: number;
  readonly projectId: number;
  readonly userId?: number;
  readonly sectionCode?: string;
  readonly artifactId?: string;
  readonly artifactVersionId?: string;
  readonly runType: RIMRunType;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE BUILDER — single source of truth for provenance construction
// ═══════════════════════════════════════════════════════════════════════════════

let integrationCounter = 0;

export function buildProvenance(runType: RIMRunType): SignalProvenance {
  integrationCounter++;
  return {
    judgmentFrameworkVersion: JUDGMENT_FRAMEWORK_VERSION,
    patternRegistryVersion: patternRegistry.version,
    runId: `rim_${Date.now()}_${integrationCounter}`,
    runType: runType === 'chat_intercept' || runType === 'compliance_intercept'
      || runType === 'artifact_intercept' || runType === 'feedback_intercept'
      ? 'pattern_scan'
      : runType,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Capture pattern scan signals and return structured result.
 * Used by chat, compliance, and artifact interceptors.
 */
export function integratePatternScan(
  ctx: RIMIntegrationContext,
  text: string,
  location: string,
): RIMIntegrationResult {
  const provenance = buildProvenance(ctx.runType);
  const warnings: string[] = [];
  let signalsGenerated = 0;

  try {
    if (!text || text.length < 20) {
      return {
        runId: provenance.runId,
        status: 'skipped',
        signalsGenerated: 0,
        persistenceStatus: 'not_attempted',
        trendContextIncluded: false,
        warnings: ['Text too short for pattern scan'],
      };
    }

    const matches = patternRegistry.scanText(text, location);

    if (matches.length > 0) {
      capturePatternSignals(
        ctx.organizationId, ctx.projectId, matches, provenance,
        ctx.sectionCode, ctx.userId, ctx.artifactId, ctx.artifactVersionId,
      );
      signalsGenerated += matches.length;
    } else if (
      ctx.organizationId > 0 &&
      ctx.projectId > 0 &&
      patternRegistry.looksLikeUnregisteredDeficiency(text)
    ) {
      // Auto-mining: text reads like a regulatory deficiency but no registered
      // pattern caught it. Nominate as a candidate for human review so the
      // registry can grow from real project experience instead of static seeds.
      void (async () => {
        try {
          const { nominateCandidatePattern } = await import('./pattern-registry.js');
          await nominateCandidatePattern({
            organizationId: ctx.organizationId,
            projectId: ctx.projectId,
            text,
            sectionCode: ctx.sectionCode,
            sourceContext: location,
          });
        } catch (nominateErr) {
          console.warn(
            '[RIM] candidate pattern nomination failed (non-blocking):',
            nominateErr instanceof Error ? nominateErr.message : nominateErr,
          );
        }
      })();
    }

    return {
      runId: provenance.runId,
      status: 'completed',
      signalsGenerated,
      persistenceStatus: 'not_attempted', // interceptors don't persist immediately
      trendContextIncluded: false,
      warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    warnings.push(`Pattern scan failed: ${msg}`);
    console.warn(`[RIM] Integration ${ctx.runType} failed (non-blocking): ${msg}`);
    return {
      runId: provenance.runId,
      status: 'failed',
      signalsGenerated,
      persistenceStatus: 'not_attempted',
      trendContextIncluded: false,
      warnings,
    };
  }
}

/**
 * Capture a judgment report and persist signals. Used by full assessments.
 */
export async function integrateJudgmentReport(
  ctx: RIMIntegrationContext,
  report: JudgmentReport,
): Promise<RIMIntegrationResult> {
  const provenance = buildProvenance(ctx.runType);
  const warnings: string[] = [];

  try {
    const signals = captureJudgmentSignals(
      ctx.organizationId, ctx.projectId, report, provenance,
      ctx.userId, ctx.artifactId, ctx.artifactVersionId,
    );

    // Persist
    const persistResult = await persistSignals(
      ctx.organizationId, ctx.projectId, provenance.runId,
    );

    if (!persistResult.success) {
      warnings.push(`Persistence degraded: ${persistResult.error}`);
      console.warn(`[RIM] Run ${provenance.runId} degraded — ${persistResult.error}`);
    }

    return {
      runId: provenance.runId,
      status: persistResult.success ? 'completed' : 'degraded',
      signalsGenerated: signals.length,
      persistenceStatus: persistResult.success ? 'persisted' : 'failed',
      trendContextIncluded: false,
      warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    warnings.push(`Judgment integration failed: ${msg}`);
    return {
      runId: provenance.runId,
      status: 'failed',
      signalsGenerated: 0,
      persistenceStatus: 'failed',
      trendContextIncluded: false,
      warnings,
    };
  }
}

/**
 * Capture a single signal with full context. Used by interceptors for
 * non-pattern signals (claim quality, compliance results, feedback).
 */
export function integrateSignal(
  ctx: RIMIntegrationContext,
  signal: Omit<IntelligenceSignal, 'signalId' | 'createdAt' | 'persisted' | 'provenance' | 'organizationId' | 'projectId' | 'userId' | 'artifactId' | 'artifactVersionId' | 'sectionCode'>,
): RIMIntegrationResult {
  const provenance = buildProvenance(ctx.runType);

  try {
    captureSignal({
      ...signal,
      provenance,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      userId: ctx.userId,
      artifactId: ctx.artifactId,
      artifactVersionId: ctx.artifactVersionId,
      sectionCode: ctx.sectionCode,
    });

    return {
      runId: provenance.runId,
      status: 'completed',
      signalsGenerated: 1,
      persistenceStatus: 'not_attempted',
      trendContextIncluded: false,
      warnings: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      runId: provenance.runId,
      status: 'failed',
      signalsGenerated: 0,
      persistenceStatus: 'not_attempted',
      trendContextIncluded: false,
      warnings: [`Signal capture failed: ${msg}`],
    };
  }
}

/**
 * Persist pattern registry (learned patterns + hit counts).
 * Call periodically or when significant patterns are learned.
 */
export async function persistPatterns(organizationId: number): Promise<{ success: boolean; error?: string }> {
  return persistPatternRegistry(organizationId);
}
