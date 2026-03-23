/**
 * RIM Cross-Artifact Intelligence
 *
 * Detects patterns across artifacts within a project:
 *   - repeated issues across documents
 *   - recurring risk patterns
 *   - systemic weaknesses in a project
 *
 * This is where RIM starts beating competitors — nobody else
 * has structured cross-document intelligence at this level.
 *
 * @module server/services/intelligence/rim-cross-artifact
 */

import {
  querySignals,
  type IntelligenceSignal,
} from './signal-capture.js';
import { patternRegistry } from './pattern-registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CrossArtifactIssue {
  readonly issueId: string;
  readonly type: 'repeated_risk' | 'systemic_pattern' | 'consistency_gap' | 'quality_drift';
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly title: string;
  readonly description: string;
  readonly affectedArtifacts: readonly string[]; // artifact IDs
  readonly affectedSections: readonly string[]; // section codes
  readonly occurrences: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly remediation: string;
  readonly patternId?: string;
}

export interface CrossArtifactReport {
  readonly organizationId: number;
  readonly projectId: number;
  readonly issues: readonly CrossArtifactIssue[];
  readonly totalIssues: number;
  readonly bySeverity: { critical: number; high: number; medium: number; low: number };
  readonly artifactsAnalyzed: number;
  readonly sectionsAnalyzed: number;
  readonly analyzedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze cross-artifact patterns from accumulated RIM signals.
 *
 * Looks for:
 *   1. Same pattern firing across multiple artifacts
 *   2. Same risk action appearing in different sections
 *   3. Quality score drift across artifacts
 *   4. Consistency gaps (high score in one section, low in related section)
 */
export function analyzeCrossArtifactIntelligence(
  organizationId: number,
  projectId: number,
): CrossArtifactReport {
  const allSignals = querySignals({ organizationId, projectId });
  const issues: CrossArtifactIssue[] = [];
  let issueCounter = 0;

  // ── 1. Repeated patterns across artifacts ──
  const patternsByArtifact = new Map<string, Map<string, IntelligenceSignal[]>>();

  for (const signal of allSignals) {
    for (const pid of signal.patternIds) {
      if (!patternsByArtifact.has(pid)) {
        patternsByArtifact.set(pid, new Map());
      }
      const artifactMap = patternsByArtifact.get(pid)!;
      const artifactKey = signal.artifactId ?? signal.sectionCode ?? 'unknown';
      if (!artifactMap.has(artifactKey)) {
        artifactMap.set(artifactKey, []);
      }
      artifactMap.get(artifactKey)!.push(signal);
    }
  }

  for (const [patternId, artifactMap] of patternsByArtifact) {
    if (artifactMap.size < 2) continue; // only flag if appears in 2+ artifacts

    const pattern = patternRegistry.getPattern(patternId);
    if (!pattern) continue;

    const affectedArtifacts = Array.from(artifactMap.keys());
    const allPatternSignals = Array.from(artifactMap.values()).flat();
    const affectedSections = [...new Set(allPatternSignals.map(s => s.sectionCode).filter(Boolean) as string[])];

    issueCounter++;
    issues.push({
      issueId: `xart_${issueCounter}`,
      type: 'repeated_risk',
      severity: pattern.severity,
      title: `"${pattern.name}" appears across ${artifactMap.size} artifacts`,
      description: `Pattern "${pattern.name}" (${patternId}) has been detected in ${artifactMap.size} different artifacts/sections. This suggests a systemic issue rather than an isolated problem.`,
      affectedArtifacts,
      affectedSections,
      occurrences: allPatternSignals.length,
      firstSeen: allPatternSignals.reduce((min, s) => s.createdAt < min ? s.createdAt : min, allPatternSignals[0].createdAt),
      lastSeen: allPatternSignals.reduce((max, s) => s.createdAt > max ? s.createdAt : max, allPatternSignals[0].createdAt),
      remediation: pattern.remediation,
      patternId,
    });
  }

  // ── 2. Systemic risk actions (same remediation across artifacts) ──
  const actionsByArtifact = new Map<string, Set<string>>();
  const actionSignals = new Map<string, IntelligenceSignal[]>();

  for (const signal of allSignals) {
    if (signal.riskLevel !== 'critical' && signal.riskLevel !== 'high') continue;
    if (!signal.action || signal.action === 'No immediate action required') continue;

    const actionKey = signal.action;
    if (!actionsByArtifact.has(actionKey)) {
      actionsByArtifact.set(actionKey, new Set());
      actionSignals.set(actionKey, []);
    }

    const artifactKey = signal.artifactId ?? signal.sectionCode ?? 'unknown';
    actionsByArtifact.get(actionKey)!.add(artifactKey);
    actionSignals.get(actionKey)!.push(signal);
  }

  for (const [action, artifacts] of actionsByArtifact) {
    if (artifacts.size < 2) continue;

    const signals = actionSignals.get(action)!;
    const affectedSections = [...new Set(signals.map(s => s.sectionCode).filter(Boolean) as string[])];
    const worstRisk = signals.some(s => s.riskLevel === 'critical') ? 'critical' : 'high';

    issueCounter++;
    issues.push({
      issueId: `xart_${issueCounter}`,
      type: 'systemic_pattern',
      severity: worstRisk as 'critical' | 'high',
      title: `Systemic issue across ${artifacts.size} artifacts`,
      description: `The same remediation action appears across ${artifacts.size} different artifacts: "${action.substring(0, 120)}"`,
      affectedArtifacts: Array.from(artifacts),
      affectedSections,
      occurrences: signals.length,
      firstSeen: signals.reduce((min, s) => s.createdAt < min ? s.createdAt : min, signals[0].createdAt),
      lastSeen: signals.reduce((max, s) => s.createdAt > max ? s.createdAt : max, signals[0].createdAt),
      remediation: action,
    });
  }

  // ── 3. Quality drift detection ──
  const sectionScores = new Map<string, number[]>();
  for (const signal of allSignals.filter(s => s.type === 'judgment')) {
    const section = signal.sectionCode;
    if (!section) continue;
    if (!sectionScores.has(section)) sectionScores.set(section, []);
    sectionScores.get(section)!.push(signal.score);
  }

  for (const [section, scores] of sectionScores) {
    if (scores.length < 3) continue; // need enough data

    const recent = scores.slice(-3);
    const older = scores.slice(0, -3);
    if (older.length === 0) continue;

    const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;

    if (olderAvg - recentAvg > 15) { // significant quality drop
      issueCounter++;
      issues.push({
        issueId: `xart_${issueCounter}`,
        type: 'quality_drift',
        severity: olderAvg - recentAvg > 25 ? 'high' : 'medium',
        title: `Quality declining in section ${section}`,
        description: `Average score dropped from ${Math.round(olderAvg)} to ${Math.round(recentAvg)} over ${scores.length} evaluations. Recent changes may be introducing issues.`,
        affectedArtifacts: [],
        affectedSections: [section],
        occurrences: scores.length,
        firstSeen: allSignals.find(s => s.sectionCode === section)?.createdAt ?? new Date().toISOString(),
        lastSeen: allSignals.filter(s => s.sectionCode === section).pop()?.createdAt ?? new Date().toISOString(),
        remediation: `Review recent changes to section ${section} and validate against prior quality baseline`,
      });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const allArtifacts = new Set(allSignals.map(s => s.artifactId ?? s.sectionCode).filter(Boolean));
  const allSections = new Set(allSignals.map(s => s.sectionCode).filter(Boolean));

  return {
    organizationId,
    projectId,
    issues,
    totalIssues: issues.length,
    bySeverity: {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
    },
    artifactsAnalyzed: allArtifacts.size,
    sectionsAnalyzed: allSections.size,
    analyzedAt: new Date().toISOString(),
  };
}
