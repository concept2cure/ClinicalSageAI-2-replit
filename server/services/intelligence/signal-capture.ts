/**
 * Signal Capture — Intelligence Signal Accumulation (Hardened)
 *
 * Two-layer architecture:
 *   Layer 1 — Working Memory (fast, volatile, bounded)
 *     In-memory signal store used for immediate reasoning + aggregation.
 *   Layer 2 — Intelligence Record (persistent, authoritative)
 *     Persisted to projectMemoryEntries. Source of truth.
 *
 * Rule: If it matters, it must exist in persistence.
 *
 * Every signal includes provenance:
 *   - judgment_framework_version
 *   - pattern_registry_version
 *   - run_id (ties signal to the RIM run that produced it)
 *
 * Persistence failures are NEVER silent. Runs are marked degraded
 * if persistence fails.
 *
 * @module server/services/intelligence/signal-capture
 */

// DB imports are lazy — only loaded inside persistSignals() to avoid
// failing module load in test environments without a database.
import type { JudgmentScore, JudgmentReport, JudgmentVerdict } from './judgment-framework.js';
import type { PatternMatch } from './pattern-registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SignalType =
  | 'judgment' // From judgment framework evaluation
  | 'pattern_match' // From pattern registry scan
  | 'recommendation' // From recommendation engine
  | 'feedback' // From user feedback on AnA output
  | 'artifact_change' // From artifact versioning
  | 'compliance_scan' // From compliance engine
  | 'cross_module'; // From cross-module intelligence

/**
 * Provenance: records which version of the intelligence system produced this signal.
 * Without this, you cannot tell if a score changed because the document changed
 * or because the brain changed.
 */
export interface SignalProvenance {
  readonly judgmentFrameworkVersion: string;
  readonly patternRegistryVersion: string;
  readonly runId: string;
  readonly runType: 'full_assessment' | 'pattern_scan' | 'manual_capture';
}

export interface IntelligenceSignal {
  readonly signalId: string;
  readonly type: SignalType;
  readonly provenance: SignalProvenance;
  readonly organizationId: number;
  readonly projectId: number;
  readonly userId?: number;
  readonly sectionCode?: string;
  readonly artifactId?: string;
  readonly artifactVersionId?: string;
  readonly riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  readonly reviewerSensitivity: 'likely_question' | 'possible_question' | 'unlikely_question';
  readonly defensibilityVerdict: JudgmentVerdict;
  readonly score: number; // 0-100
  readonly confidence: number; // 0-100
  readonly action: string; // recommended action
  readonly patternIds: readonly string[]; // matched pattern IDs
  readonly metadata: Record<string, unknown>;
  readonly persisted: boolean; // whether this signal has been durably stored
  readonly createdAt: string;
}

export type TrendConfidence = 'high' | 'moderate' | 'low' | 'insufficient';

export interface SignalSummary {
  readonly totalSignals: number;
  readonly byType: Record<SignalType, number>;
  readonly byRiskLevel: Record<string, number>;
  readonly averageScore: number;
  readonly averageConfidence: number;
  readonly topPatternIds: string[];
  readonly overallTrend: 'improving' | 'stable' | 'declining';
  readonly trendConfidence: TrendConfidence;
  readonly trendSampleSize: number;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface SignalQuery {
  readonly organizationId: number;
  readonly projectId: number;
  readonly type?: SignalType;
  readonly minRisk?: 'critical' | 'high' | 'medium' | 'low';
  readonly sectionCode?: string;
  readonly limit?: number;
}

/**
 * Result of a persistence operation. Never silent.
 */
export interface PersistenceResult {
  readonly success: boolean;
  readonly signalCount: number;
  readonly runId: string;
  readonly error?: string;
  readonly persistedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — WORKING MEMORY (fast, volatile, bounded)
//
// In-memory cache for immediate reasoning. NOT source of truth.
// Bounded to MAX_SIGNALS_PER_PROJECT. Oldest signals evicted first.
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_SIGNALS_PER_PROJECT = 500;
const signalStore = new Map<string, IntelligenceSignal[]>();

function projectKey(orgId: number, projectId: number): string {
  return `${orgId}:${projectId}`;
}

let signalCounter = 0;

function generateSignalId(): string {
  signalCounter++;
  return `sig_${Date.now()}_${signalCounter}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MINIMUM TREND REQUIREMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const MIN_TREND_SAMPLE_SIZE = 10;
const MIN_TREND_COMPARISON_SIZE = 5;
const TREND_THRESHOLD = 5; // score delta to be considered improving/declining

// ═══════════════════════════════════════════════════════════════════════════════
// CAPTURE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Capture signals from a judgment report.
 */
export function captureJudgmentSignals(
  organizationId: number,
  projectId: number,
  report: JudgmentReport,
  provenance: SignalProvenance,
  userId?: number,
  artifactId?: string,
  artifactVersionId?: string
): IntelligenceSignal[] {
  const signals: IntelligenceSignal[] = [];

  for (const score of report.scores) {
    const signal = captureSignal({
      type: 'judgment',
      provenance,
      organizationId,
      projectId,
      userId,
      sectionCode: report.context.sectionCode,
      artifactId,
      artifactVersionId,
      riskLevel: verdictToRisk(score.verdict),
      reviewerSensitivity: scoreToSensitivity(score.score),
      defensibilityVerdict: score.verdict,
      score: score.score,
      confidence: score.confidence,
      action:
        score.findings.length > 0 ? score.findings[0].remediation : 'No immediate action required',
      patternIds: [],
      metadata: {
        model: score.model,
        factorCount: score.factors.length,
        findingCount: score.findings.length,
      },
    });
    signals.push(signal);
  }

  return signals;
}

/**
 * Capture signals from pattern matches.
 */
export function capturePatternSignals(
  organizationId: number,
  projectId: number,
  matches: readonly PatternMatch[],
  provenance: SignalProvenance,
  sectionCode?: string,
  userId?: number,
  artifactId?: string,
  artifactVersionId?: string
): IntelligenceSignal[] {
  const signals: IntelligenceSignal[] = [];

  for (const match of matches) {
    const signal = captureSignal({
      type: 'pattern_match',
      provenance,
      organizationId,
      projectId,
      userId,
      sectionCode,
      artifactId,
      artifactVersionId,
      riskLevel: match.pattern.severity,
      reviewerSensitivity:
        match.pattern.category === 'reviewer_trigger'
          ? 'likely_question'
          : match.pattern.severity === 'critical'
          ? 'likely_question'
          : 'possible_question',
      defensibilityVerdict: severityToVerdict(match.pattern.severity),
      score:
        100 -
        (match.pattern.severity === 'critical'
          ? 80
          : match.pattern.severity === 'high'
          ? 60
          : match.pattern.severity === 'medium'
          ? 30
          : 10),
      confidence: match.matchConfidence,
      action: match.pattern.remediation,
      patternIds: [match.patternId],
      metadata: {
        category: match.pattern.category,
        matchedText: match.matchedText.substring(0, 200),
        matchLocation: match.matchLocation,
        agency: match.pattern.agency,
        reviewerQuestion: match.pattern.reviewerQuestion,
      },
    });
    signals.push(signal);
  }

  return signals;
}

/**
 * Capture a generic intelligence signal into working memory.
 */
export function captureSignal(
  input: Omit<IntelligenceSignal, 'signalId' | 'createdAt' | 'persisted'>
): IntelligenceSignal {
  const signal: IntelligenceSignal = {
    ...input,
    signalId: generateSignalId(),
    persisted: false,
    createdAt: new Date().toISOString(),
  };

  const key = projectKey(input.organizationId, input.projectId);
  const existing = signalStore.get(key) ?? [];
  existing.push(signal);

  // Trim to max size (keep newest)
  if (existing.length > MAX_SIGNALS_PER_PROJECT) {
    existing.splice(0, existing.length - MAX_SIGNALS_PER_PROJECT);
  }

  signalStore.set(key, existing);

  return signal;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query captured signals from working memory.
 */
export function querySignals(query: SignalQuery): IntelligenceSignal[] {
  const key = projectKey(query.organizationId, query.projectId);
  let signals = [...(signalStore.get(key) ?? [])];

  if (query.type) {
    signals = signals.filter(s => s.type === query.type);
  }
  if (query.sectionCode) {
    signals = signals.filter(s => s.sectionCode === query.sectionCode);
  }
  if (query.minRisk) {
    const riskOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
    const minOrder = riskOrder[query.minRisk];
    signals = signals.filter(s => riskOrder[s.riskLevel] <= minOrder);
  }

  // Sort newest first
  signals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (query.limit) {
    signals = signals.slice(0, query.limit);
  }

  return signals;
}

/**
 * Get prior signals for a specific section — enables "historical trend for this section"
 * and "previously flagged issue persists" detection.
 */
export function getSectionHistory(
  organizationId: number,
  projectId: number,
  sectionCode: string
): IntelligenceSignal[] {
  const key = projectKey(organizationId, projectId);
  const signals = signalStore.get(key) ?? [];
  return signals
    .filter(s => s.sectionCode === sectionCode)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Detect recurring patterns for a section — patterns that have fired
 * multiple times across different runs.
 */
export function getRecurringPatterns(
  organizationId: number,
  projectId: number,
  sectionCode?: string
): Array<{ patternId: string; occurrences: number; firstSeen: string; lastSeen: string }> {
  const key = projectKey(organizationId, projectId);
  let signals = signalStore.get(key) ?? [];

  if (sectionCode) {
    signals = signals.filter(s => s.sectionCode === sectionCode);
  }

  // Only count patterns from different runs
  const patternRuns = new Map<
    string,
    { runIds: Set<string>; firstSeen: string; lastSeen: string }
  >();

  for (const signal of signals) {
    for (const pid of signal.patternIds) {
      const existing = patternRuns.get(pid);
      if (existing) {
        existing.runIds.add(signal.provenance.runId);
        if (signal.createdAt < existing.firstSeen) existing.firstSeen = signal.createdAt;
        if (signal.createdAt > existing.lastSeen) existing.lastSeen = signal.createdAt;
      } else {
        patternRuns.set(pid, {
          runIds: new Set([signal.provenance.runId]),
          firstSeen: signal.createdAt,
          lastSeen: signal.createdAt,
        });
      }
    }
  }

  return Array.from(patternRuns.entries())
    .filter(([, data]) => data.runIds.size > 1)
    .map(([patternId, data]) => ({
      patternId,
      occurrences: data.runIds.size,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Get a summary of signals for a project.
 * Trend detection is grounded: requires minimum sample size and only
 * compares same-type signals.
 */
export function getSignalSummary(organizationId: number, projectId: number): SignalSummary {
  const key = projectKey(organizationId, projectId);
  const signals = signalStore.get(key) ?? [];

  const byType: Record<string, number> = {};
  const byRiskLevel: Record<string, number> = {};
  const patternCounts: Record<string, number> = {};
  let totalScore = 0;
  let totalConfidence = 0;

  for (const signal of signals) {
    byType[signal.type] = (byType[signal.type] ?? 0) + 1;
    byRiskLevel[signal.riskLevel] = (byRiskLevel[signal.riskLevel] ?? 0) + 1;
    totalScore += signal.score;
    totalConfidence += signal.confidence;

    for (const pid of signal.patternIds) {
      patternCounts[pid] = (patternCounts[pid] ?? 0) + 1;
    }
  }

  const topPatternIds = Object.entries(patternCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id);

  // ── Grounded trend detection ──
  // Only compare judgment signals (stable scoring definition)
  // Require minimum sample sizes before declaring a trend
  const judgmentSignals = signals.filter(s => s.type === 'judgment');
  const { trend, trendConfidence, sampleSize } = computeTrend(judgmentSignals);

  return {
    totalSignals: signals.length,
    byType: byType as Record<SignalType, number>,
    byRiskLevel,
    averageScore: signals.length > 0 ? Math.round(totalScore / signals.length) : 0,
    averageConfidence: signals.length > 0 ? Math.round(totalConfidence / signals.length) : 0,
    topPatternIds,
    overallTrend: trend,
    trendConfidence,
    trendSampleSize: sampleSize,
    periodStart: signals.length > 0 ? signals[0].createdAt : new Date().toISOString(),
    periodEnd:
      signals.length > 0 ? signals[signals.length - 1].createdAt : new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2 — INTELLIGENCE RECORD (persistent, authoritative)
//
// Writes to projectMemoryEntries. Failures are NEVER silent.
// Returns PersistenceResult so callers can act on failure.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persist signals to durable storage. Returns result — never swallows errors.
 */
export async function persistSignals(
  organizationId: number,
  projectId: number,
  runId: string
): Promise<PersistenceResult> {
  const key = projectKey(organizationId, projectId);
  const signals = signalStore.get(key) ?? [];

  if (signals.length === 0) {
    return { success: true, signalCount: 0, runId };
  }

  try {
    // Lazy imports — avoids failing module load in test environments
    const { db } = await import('../../db.js');
    const { eq, and } = await import('drizzle-orm');
    const { projectIntelligenceProfiles, projectMemoryEntries } = await import(
      '../../../shared/schema.js'
    );

    // Get the project intelligence profile
    const [profile] = await db
      .select({ id: projectIntelligenceProfiles.id })
      .from(projectIntelligenceProfiles)
      .where(
        and(
          eq(projectIntelligenceProfiles.projectId, projectId),
          eq(projectIntelligenceProfiles.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!profile) {
      return {
        success: false,
        signalCount: signals.length,
        runId,
        error: `No intelligence profile found for project ${projectId}`,
      };
    }

    const summary = getSignalSummary(organizationId, projectId);

    // Persist the summary + top signals as an intelligence record
    await db.insert(projectMemoryEntries).values({
      projectProfileId: profile.id,
      projectId,
      organizationId,
      category: 'intelligence_signal_summary',
      subcategory: 'signal_capture',
      title: `RIM Signal Summary ${runId}`,
      content: JSON.stringify({
        ...summary,
        runId,
        signals: signals
          .filter(s => s.riskLevel === 'critical' || s.riskLevel === 'high')
          .slice(0, 20)
          .map(s => ({
            signalId: s.signalId,
            type: s.type,
            provenance: s.provenance,
            riskLevel: s.riskLevel,
            score: s.score,
            confidence: s.confidence,
            sectionCode: s.sectionCode,
            artifactId: s.artifactId,
            artifactVersionId: s.artifactVersionId,
            action: s.action,
            patternIds: s.patternIds,
            createdAt: s.createdAt,
          })),
        topRisks: signals
          .filter(s => s.riskLevel === 'critical' || s.riskLevel === 'high')
          .slice(0, 5)
          .map(s => ({
            type: s.type,
            risk: s.riskLevel,
            action: s.action,
            section: s.sectionCode,
            artifactId: s.artifactId,
          })),
      }),
      sourceDocumentName: runId,
      sourceDocumentType: 'system',
      confidenceScore: 0.95,
      importanceLevel: summary.averageScore < 50 ? 'high' : 'medium',
      extractedBy: 'system',
    });

    // Mark in-memory signals as persisted
    const updated = signals.map(s => ({ ...s, persisted: true }));
    signalStore.set(key, updated);

    const now = new Date().toISOString();
    return { success: true, signalCount: signals.length, runId, persistedAt: now };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown persistence error';
    console.error(`[RIM] Persistence failure for run ${runId}, project ${projectId}: ${errorMsg}`);
    return {
      success: false,
      signalCount: signals.length,
      runId,
      error: errorMsg,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TREND COMPUTATION — Grounded, disciplined
// ═══════════════════════════════════════════════════════════════════════════════

function computeTrend(signals: IntelligenceSignal[]): {
  trend: 'improving' | 'stable' | 'declining';
  trendConfidence: TrendConfidence;
  sampleSize: number;
} {
  const sampleSize = signals.length;

  // Not enough data — don't pretend to know
  if (sampleSize < MIN_TREND_SAMPLE_SIZE) {
    return { trend: 'stable', trendConfidence: 'insufficient', sampleSize };
  }

  // Split into recent half and older half
  const midpoint = Math.floor(sampleSize / 2);
  const olderHalf = signals.slice(0, midpoint);
  const recentHalf = signals.slice(midpoint);

  // Both halves must have minimum comparison size
  if (
    olderHalf.length < MIN_TREND_COMPARISON_SIZE ||
    recentHalf.length < MIN_TREND_COMPARISON_SIZE
  ) {
    return { trend: 'stable', trendConfidence: 'insufficient', sampleSize };
  }

  // Only compare signals produced by the same framework version (like-for-like)
  const recentVersion = recentHalf[recentHalf.length - 1]?.provenance?.judgmentFrameworkVersion;
  const compatibleRecent = recentHalf.filter(
    s => s.provenance?.judgmentFrameworkVersion === recentVersion
  );
  const compatibleOlder = olderHalf.filter(
    s => s.provenance?.judgmentFrameworkVersion === recentVersion
  );

  // If version changed mid-stream, we can still compute but with lower confidence
  const versionConsistent =
    compatibleRecent.length === recentHalf.length && compatibleOlder.length === olderHalf.length;

  const recentAvg =
    compatibleRecent.length > 0
      ? compatibleRecent.reduce((sum, s) => sum + s.score, 0) / compatibleRecent.length
      : null;
  const olderAvg =
    compatibleOlder.length > 0
      ? compatibleOlder.reduce((sum, s) => sum + s.score, 0) / compatibleOlder.length
      : null;

  // Can't compute if either side is empty after version filtering
  if (recentAvg === null || olderAvg === null) {
    return { trend: 'stable', trendConfidence: 'low', sampleSize };
  }

  const delta = recentAvg - olderAvg;
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (delta > TREND_THRESHOLD) trend = 'improving';
  else if (delta < -TREND_THRESHOLD) trend = 'declining';

  // Confidence based on sample size and version consistency
  let trendConfidence: TrendConfidence;
  if (sampleSize >= 40 && versionConsistent) {
    trendConfidence = 'high';
  } else if (sampleSize >= 20 && versionConsistent) {
    trendConfidence = 'moderate';
  } else {
    trendConfidence = 'low';
  }

  return { trend, trendConfidence, sampleSize };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function verdictToRisk(verdict: JudgmentVerdict): IntelligenceSignal['riskLevel'] {
  switch (verdict) {
    case 'fail':
      return 'critical';
    case 'at_risk':
      return 'high';
    case 'needs_attention':
      return 'medium';
    case 'acceptable':
      return 'low';
    case 'pass':
      return 'none';
  }
}

function scoreToSensitivity(score: number): IntelligenceSignal['reviewerSensitivity'] {
  if (score < 40) return 'likely_question';
  if (score < 70) return 'possible_question';
  return 'unlikely_question';
}

function severityToVerdict(severity: 'critical' | 'high' | 'medium' | 'low'): JudgmentVerdict {
  switch (severity) {
    case 'critical':
      return 'fail';
    case 'high':
      return 'at_risk';
    case 'medium':
      return 'needs_attention';
    case 'low':
      return 'acceptable';
  }
}
