/**
 * Signal Capture — Intelligence Signal Accumulation
 *
 * Every AnA analysis produces signals. This module captures, stores,
 * and makes them queryable for future reasoning and pattern extraction.
 *
 * Captured signals:
 *   - change type
 *   - risk level
 *   - reviewer sensitivity
 *   - defensibility verdict
 *   - recommended action
 *   - pattern matches
 *   - judgment scores
 *
 * These signals are NOT for analytics dashboards — they're for:
 *   - future reasoning and pattern extraction
 *   - feedback loop into judgment framework
 *   - cross-artifact intelligence detection
 *
 * Storage: in-memory with project memory persistence via projectMemoryEntries.
 * In production, a dedicated table would replace the in-memory store.
 *
 * @module server/services/intelligence/signal-capture
 */

import { db } from '../../db.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import {
  projectMemoryEntries,
  projectIntelligenceProfiles,
} from '../../../shared/schema.js';
import type { JudgmentScore, JudgmentReport, JudgmentVerdict } from './judgment-framework.js';
import type { PatternMatch } from './pattern-registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SignalType =
  | 'judgment'          // From judgment framework evaluation
  | 'pattern_match'     // From pattern registry scan
  | 'recommendation'    // From recommendation engine
  | 'feedback'          // From user feedback on AnA output
  | 'artifact_change'   // From artifact versioning
  | 'compliance_scan'   // From compliance engine
  | 'cross_module';     // From cross-module intelligence

export interface IntelligenceSignal {
  readonly signalId: string;
  readonly type: SignalType;
  readonly organizationId: number;
  readonly projectId: number;
  readonly userId?: number;
  readonly sectionCode?: string;
  readonly artifactId?: string;
  readonly riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  readonly reviewerSensitivity: 'likely_question' | 'possible_question' | 'unlikely_question';
  readonly defensibilityVerdict: JudgmentVerdict;
  readonly score: number; // 0-100
  readonly confidence: number; // 0-100
  readonly action: string; // recommended action
  readonly patternIds: readonly string[]; // matched pattern IDs
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

export interface SignalSummary {
  readonly totalSignals: number;
  readonly byType: Record<SignalType, number>;
  readonly byRiskLevel: Record<string, number>;
  readonly averageScore: number;
  readonly averageConfidence: number;
  readonly topPatternIds: string[];
  readonly overallTrend: 'improving' | 'stable' | 'declining';
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

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY SIGNAL STORE
//
// Stores last N signals per project. Persists to projectMemoryEntries.
// In production, replace with a dedicated intelligence_signals table.
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
// CAPTURE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Capture a signal from a judgment report.
 */
export function captureJudgmentSignals(
  organizationId: number,
  projectId: number,
  report: JudgmentReport,
  userId?: number,
): IntelligenceSignal[] {
  const signals: IntelligenceSignal[] = [];

  for (const score of report.scores) {
    const signal = captureSignal({
      type: 'judgment',
      organizationId,
      projectId,
      userId,
      sectionCode: report.context.sectionCode,
      riskLevel: verdictToRisk(score.verdict),
      reviewerSensitivity: scoreToSensitivity(score.score),
      defensibilityVerdict: score.verdict,
      score: score.score,
      confidence: score.confidence,
      action: score.findings.length > 0
        ? score.findings[0].remediation
        : 'No immediate action required',
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
  sectionCode?: string,
  userId?: number,
): IntelligenceSignal[] {
  const signals: IntelligenceSignal[] = [];

  for (const match of matches) {
    const signal = captureSignal({
      type: 'pattern_match',
      organizationId,
      projectId,
      userId,
      sectionCode,
      riskLevel: match.pattern.severity,
      reviewerSensitivity: match.pattern.category === 'reviewer_trigger'
        ? 'likely_question'
        : match.pattern.severity === 'critical'
          ? 'likely_question'
          : 'possible_question',
      defensibilityVerdict: severityToVerdict(match.pattern.severity),
      score: 100 - (match.pattern.severity === 'critical' ? 80 : match.pattern.severity === 'high' ? 60 : match.pattern.severity === 'medium' ? 30 : 10),
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
 * Capture a generic intelligence signal.
 */
export function captureSignal(
  input: Omit<IntelligenceSignal, 'signalId' | 'createdAt'>,
): IntelligenceSignal {
  const signal: IntelligenceSignal = {
    ...input,
    signalId: generateSignalId(),
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
 * Query captured signals for a project.
 */
export function querySignals(query: SignalQuery): IntelligenceSignal[] {
  const key = projectKey(query.organizationId, query.projectId);
  let signals = signalStore.get(key) ?? [];

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
 * Get a summary of signals for a project.
 */
export function getSignalSummary(
  organizationId: number,
  projectId: number,
): SignalSummary {
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

  // Determine trend from recent signals
  const recentSignals = signals.slice(-20);
  const olderSignals = signals.slice(-40, -20);
  const recentAvg = recentSignals.length > 0
    ? recentSignals.reduce((s, sig) => s + sig.score, 0) / recentSignals.length
    : 50;
  const olderAvg = olderSignals.length > 0
    ? olderSignals.reduce((s, sig) => s + sig.score, 0) / olderSignals.length
    : 50;

  let overallTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentAvg - olderAvg > 5) overallTrend = 'improving';
  else if (olderAvg - recentAvg > 5) overallTrend = 'declining';

  return {
    totalSignals: signals.length,
    byType: byType as Record<SignalType, number>,
    byRiskLevel,
    averageScore: signals.length > 0 ? Math.round(totalScore / signals.length) : 0,
    averageConfidence: signals.length > 0 ? Math.round(totalConfidence / signals.length) : 0,
    topPatternIds,
    overallTrend,
    periodStart: signals.length > 0 ? signals[0].createdAt : new Date().toISOString(),
    periodEnd: signals.length > 0 ? signals[signals.length - 1].createdAt : new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE — Write signals to projectMemoryEntries for durable storage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Persist current signal store to project memory for a specific project.
 * Call periodically or on significant events.
 */
export async function persistSignals(
  organizationId: number,
  projectId: number,
): Promise<void> {
  const key = projectKey(organizationId, projectId);
  const signals = signalStore.get(key) ?? [];
  if (signals.length === 0) return;

  // Get or create the project intelligence profile
  const [profile] = await db
    .select({ id: projectIntelligenceProfiles.id })
    .from(projectIntelligenceProfiles)
    .where(and(
      eq(projectIntelligenceProfiles.projectId, projectId),
      eq(projectIntelligenceProfiles.organizationId, organizationId),
    ))
    .limit(1);

  if (!profile) return;

  const summary = getSignalSummary(organizationId, projectId);

  // Store summary as a project memory entry
  await db.insert(projectMemoryEntries).values({
    profileId: profile.id,
    organizationId,
    category: 'intelligence_signal_summary',
    content: JSON.stringify(summary),
    source: 'rim_signal_capture',
    importance: summary.averageScore < 50 ? 'high' : 'medium',
    metadata: {
      signalCount: signals.length,
      topRisks: signals
        .filter(s => s.riskLevel === 'critical' || s.riskLevel === 'high')
        .slice(0, 5)
        .map(s => ({
          type: s.type,
          risk: s.riskLevel,
          action: s.action,
          section: s.sectionCode,
        })),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function verdictToRisk(verdict: JudgmentVerdict): IntelligenceSignal['riskLevel'] {
  switch (verdict) {
    case 'fail': return 'critical';
    case 'at_risk': return 'high';
    case 'needs_attention': return 'medium';
    case 'acceptable': return 'low';
    case 'pass': return 'none';
  }
}

function scoreToSensitivity(score: number): IntelligenceSignal['reviewerSensitivity'] {
  if (score < 40) return 'likely_question';
  if (score < 70) return 'possible_question';
  return 'unlikely_question';
}

function severityToVerdict(severity: 'critical' | 'high' | 'medium' | 'low'): JudgmentVerdict {
  switch (severity) {
    case 'critical': return 'fail';
    case 'high': return 'at_risk';
    case 'medium': return 'needs_attention';
    case 'low': return 'acceptable';
  }
}
