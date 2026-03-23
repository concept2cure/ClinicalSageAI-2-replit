/**
 * RIM Change Impact Enrichment
 *
 * Enhances version impact review with RIM intelligence:
 *   - historical trend for this section
 *   - recurring risk patterns detected
 *   - previously flagged issues that persist
 *
 * This is the ONE place where RIM signals become operational.
 * No dashboards. No broad exposure. Signal-backed insight inside
 * an existing workflow.
 *
 * Usage:
 *   After analyzeChangeImpact() in submission-twin-service,
 *   call enrichChangeImpact() to append RIM intelligence.
 *
 * @module server/services/intelligence/rim-change-impact
 */

import {
  getSectionHistory,
  getRecurringPatterns,
  getSignalSummary,
  type IntelligenceSignal,
  type TrendConfidence,
} from './signal-capture.js';

import { patternRegistry } from './pattern-registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RIMChangeInsight {
  readonly type: 'section_trend' | 'recurring_pattern' | 'persisting_issue';
  readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  readonly title: string;
  readonly detail: string;
  readonly confidence: TrendConfidence;
  readonly signalCount: number;
  readonly firstSeen?: string;
  readonly lastSeen?: string;
  readonly patternId?: string;
}

export interface RIMChangeEnrichment {
  readonly sectionCode: string;
  readonly insights: readonly RIMChangeInsight[];
  readonly sectionTrend: 'improving' | 'stable' | 'declining' | null;
  readonly sectionTrendConfidence: TrendConfidence;
  readonly priorSignalCount: number;
  readonly recurringPatternCount: number;
  readonly enrichedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENRICHMENT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enrich a version impact review with accumulated RIM intelligence.
 *
 * Call this after `analyzeChangeImpact()` to add:
 *   - historical trend for the affected section
 *   - recurring risk patterns
 *   - previously flagged issues that persist
 */
export function enrichChangeImpact(
  organizationId: number,
  projectId: number,
  sectionCode: string,
): RIMChangeEnrichment {
  const insights: RIMChangeInsight[] = [];

  // ── 1. Section history & trend ──
  const sectionHistory = getSectionHistory(organizationId, projectId, sectionCode);
  const sectionTrend = computeSectionTrend(sectionHistory);

  if (sectionTrend.trend !== 'stable' || sectionHistory.length > 0) {
    if (sectionTrend.trend === 'declining') {
      insights.push({
        type: 'section_trend',
        severity: 'high',
        title: `Section ${sectionCode} trending downward`,
        detail: `Risk scores for this section have been declining across ${sectionTrend.sampleSize} evaluations. This change may compound existing issues.`,
        confidence: sectionTrend.confidence,
        signalCount: sectionTrend.sampleSize,
      });
    } else if (sectionTrend.trend === 'improving') {
      insights.push({
        type: 'section_trend',
        severity: 'info',
        title: `Section ${sectionCode} trending upward`,
        detail: `Risk scores for this section have been improving across ${sectionTrend.sampleSize} evaluations. Verify this change maintains the positive trajectory.`,
        confidence: sectionTrend.confidence,
        signalCount: sectionTrend.sampleSize,
      });
    }
  }

  // ── 2. Recurring patterns ──
  const recurring = getRecurringPatterns(organizationId, projectId, sectionCode);

  for (const rec of recurring) {
    const pattern = patternRegistry.getPattern(rec.patternId);
    if (!pattern) continue;

    insights.push({
      type: 'recurring_pattern',
      severity: pattern.severity,
      title: `Recurring: ${pattern.name}`,
      detail: `This pattern has been detected ${rec.occurrences} times across separate evaluations. ${pattern.reviewerQuestion}`,
      confidence: rec.occurrences >= 3 ? 'high' : 'moderate',
      signalCount: rec.occurrences,
      firstSeen: rec.firstSeen,
      lastSeen: rec.lastSeen,
      patternId: rec.patternId,
    });
  }

  // ── 3. Persisting issues (high/critical signals that keep appearing) ──
  const persistingIssues = detectPersistingIssues(sectionHistory);

  for (const issue of persistingIssues) {
    insights.push({
      type: 'persisting_issue',
      severity: issue.riskLevel === 'critical' ? 'critical' : 'high',
      title: `Unresolved: ${issue.action}`,
      detail: `This issue was first flagged on ${new Date(issue.firstSeen).toLocaleDateString()} and has appeared in ${issue.occurrences} evaluation(s). It remains unresolved.`,
      confidence: issue.occurrences >= 3 ? 'high' : 'moderate',
      signalCount: issue.occurrences,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
    });
  }

  // Sort: critical first, then high, etc.
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    sectionCode,
    insights,
    sectionTrend: sectionHistory.length > 0 ? sectionTrend.trend : null,
    sectionTrendConfidence: sectionTrend.confidence,
    priorSignalCount: sectionHistory.length,
    recurringPatternCount: recurring.length,
    enrichedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const MIN_SECTION_TREND_SAMPLE = 6;
const SECTION_TREND_THRESHOLD = 8;

function computeSectionTrend(
  signals: IntelligenceSignal[],
): { trend: 'improving' | 'stable' | 'declining'; confidence: TrendConfidence; sampleSize: number } {
  // Only use judgment signals for trend (stable scoring definition)
  const judgmentSignals = signals.filter(s => s.type === 'judgment');
  const sampleSize = judgmentSignals.length;

  if (sampleSize < MIN_SECTION_TREND_SAMPLE) {
    return { trend: 'stable', confidence: 'insufficient', sampleSize };
  }

  const midpoint = Math.floor(sampleSize / 2);
  const older = judgmentSignals.slice(0, midpoint);
  const recent = judgmentSignals.slice(midpoint);

  const olderAvg = older.reduce((s, sig) => s + sig.score, 0) / older.length;
  const recentAvg = recent.reduce((s, sig) => s + sig.score, 0) / recent.length;

  const delta = recentAvg - olderAvg;
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (delta > SECTION_TREND_THRESHOLD) trend = 'improving';
  else if (delta < -SECTION_TREND_THRESHOLD) trend = 'declining';

  let confidence: TrendConfidence;
  if (sampleSize >= 20) confidence = 'high';
  else if (sampleSize >= 10) confidence = 'moderate';
  else confidence = 'low';

  return { trend, confidence, sampleSize };
}

interface PersistingIssue {
  riskLevel: string;
  action: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

function detectPersistingIssues(sectionHistory: IntelligenceSignal[]): PersistingIssue[] {
  // Group by action string — if the same remediation keeps appearing, it's unresolved
  const actionGroups = new Map<string, {
    riskLevel: string;
    runIds: Set<string>;
    firstSeen: string;
    lastSeen: string;
  }>();

  for (const signal of sectionHistory) {
    if (signal.riskLevel !== 'critical' && signal.riskLevel !== 'high') continue;

    const key = signal.action;
    const existing = actionGroups.get(key);
    if (existing) {
      existing.runIds.add(signal.provenance.runId);
      if (signal.createdAt < existing.firstSeen) existing.firstSeen = signal.createdAt;
      if (signal.createdAt > existing.lastSeen) existing.lastSeen = signal.createdAt;
      // Keep the worst risk level
      if (signal.riskLevel === 'critical') existing.riskLevel = 'critical';
    } else {
      actionGroups.set(key, {
        riskLevel: signal.riskLevel,
        runIds: new Set([signal.provenance.runId]),
        firstSeen: signal.createdAt,
        lastSeen: signal.createdAt,
      });
    }
  }

  // Only report issues that appeared in 2+ different runs
  return Array.from(actionGroups.entries())
    .filter(([, data]) => data.runIds.size >= 2)
    .map(([action, data]) => ({
      riskLevel: data.riskLevel,
      action,
      occurrences: data.runIds.size,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 5);
}
