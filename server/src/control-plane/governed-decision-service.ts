/**
 * Governed Decision Service
 *
 * Persists and provides inspectability for governed document decisions.
 * Extends the existing kernel decision log pattern to support document-level
 * decisions, not just request-level policy decisions.
 *
 * Decisions are stored in-memory with optional database persistence.
 * Supports querying by project, artifact, intent, outcome, and time window.
 *
 * Part of the Governed Document Decision Fabric.
 */

import { randomUUID } from 'crypto';
import type {
  GovernedDocumentContext,
  GovernedDocumentEvaluation,
  GovernedDecisionSummary,
  GovernedDecisionReference,
  GovernedDecisionOutcome,
  GovernedMutationIntent,
} from '../../../shared/types/governed-document-fabric';

export const GOVERNED_DECISION_SERVICE_VERSION = '1.0.0';

// === In-Memory Decision Store ===

export interface GovernedDecisionRecord {
  decisionId: string;
  projectId: string;
  organizationId: string;
  artifactId?: string;
  intent: GovernedMutationIntent;
  outcome: GovernedDecisionOutcome;
  rationale: string;
  blockerCount: number;
  warningCount: number;
  consequenceCount: number;
  readinessLevel: string;
  readinessScore: number;
  placementOutcome: string;
  exportGateOutcome: string;
  publishGateOutcome: string;
  actorId: string;
  actorRole?: string;
  originSurface?: string;
  regulatorBody?: string;
  submissionType?: string;
  ctdSection?: string;
  timestamp: string;
  fabricVersion: string;
}

const MAX_GOVERNED_DECISIONS = Number(process.env.ANA_GOVERNED_DECISION_CAP || 5000);
const governedDecisionLog: GovernedDecisionRecord[] = [];

/**
 * Record a governed document decision from a full evaluation.
 */
export function recordGovernedDecision(
  evaluation: GovernedDocumentEvaluation
): GovernedDecisionReference {
  const decisionId = randomUUID();
  const timestamp = new Date().toISOString();

  const record: GovernedDecisionRecord = {
    decisionId,
    projectId: evaluation.context.projectId,
    organizationId: evaluation.context.organizationId,
    artifactId: evaluation.context.artifactId,
    intent: evaluation.context.intendedAction,
    outcome: evaluation.decision.outcome,
    rationale: evaluation.decision.rationale,
    blockerCount: evaluation.decision.blockerCount,
    warningCount: evaluation.decision.warningCount,
    consequenceCount: evaluation.decision.consequenceCount,
    readinessLevel: evaluation.readiness.level,
    readinessScore: evaluation.readiness.score,
    placementOutcome: evaluation.placement.outcome,
    exportGateOutcome: evaluation.exportGate.outcome,
    publishGateOutcome: evaluation.publishGate.outcome,
    actorId: evaluation.context.actorId,
    actorRole: evaluation.context.actorRole,
    originSurface: evaluation.context.originSurface,
    regulatorBody: evaluation.context.regulatorBody,
    submissionType: evaluation.context.submissionType,
    ctdSection: evaluation.context.ctdSection,
    timestamp,
    fabricVersion: GOVERNED_DECISION_SERVICE_VERSION,
  };

  governedDecisionLog.push(record);

  // Sliding window
  if (governedDecisionLog.length > MAX_GOVERNED_DECISIONS) {
    governedDecisionLog.splice(0, governedDecisionLog.length - MAX_GOVERNED_DECISIONS);
  }

  return {
    decisionId,
    projectId: evaluation.context.projectId,
    artifactId: evaluation.context.artifactId,
    intent: evaluation.context.intendedAction,
    outcome: evaluation.decision.outcome,
    actorId: evaluation.context.actorId,
    timestamp,
  };
}

// === Query Functions ===

/**
 * Get recent governed decisions, optionally filtered.
 */
export function getRecentGovernedDecisions(options: {
  limit?: number;
  organizationId?: string;
  projectId?: string;
  artifactId?: string;
  intent?: GovernedMutationIntent;
  outcome?: GovernedDecisionOutcome;
  since?: string;
} = {}): GovernedDecisionRecord[] {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
  let filtered = governedDecisionLog;

  // Tenant scoping — filter by organization first (multi-tenant isolation)
  if (options.organizationId) {
    filtered = filtered.filter(d => d.organizationId === options.organizationId);
  }
  if (options.projectId) {
    filtered = filtered.filter(d => d.projectId === options.projectId);
  }
  if (options.artifactId) {
    filtered = filtered.filter(d => d.artifactId === options.artifactId);
  }
  if (options.intent) {
    filtered = filtered.filter(d => d.intent === options.intent);
  }
  if (options.outcome) {
    filtered = filtered.filter(d => d.outcome === options.outcome);
  }
  if (options.since) {
    filtered = filtered.filter(d => d.timestamp >= options.since!);
  }

  return filtered.slice(-limit);
}

/**
 * Get a summary of governed decisions.
 */
export function getGovernedDecisionSummary(options: {
  organizationId?: string;
  projectId?: string;
  since?: string;
} = {}): GovernedDecisionSummaryReport {
  let filtered = governedDecisionLog;

  // Tenant scoping — filter by organization first (multi-tenant isolation)
  if (options.organizationId) {
    filtered = filtered.filter(d => d.organizationId === options.organizationId);
  }
  if (options.projectId) {
    filtered = filtered.filter(d => d.projectId === options.projectId);
  }
  if (options.since) {
    filtered = filtered.filter(d => d.timestamp >= options.since!);
  }

  const summary: GovernedDecisionSummaryReport = {
    total: filtered.length,
    byOutcome: { allow: 0, block: 0, review: 0, degraded: 0 },
    byIntent: {},
    byReadinessLevel: {},
    averageReadinessScore: 0,
    blockedCount: 0,
    exportBlockedCount: 0,
    publishBlockedCount: 0,
    uniqueProjects: new Set(filtered.map(d => d.projectId)).size,
    uniqueArtifacts: new Set(filtered.filter(d => d.artifactId).map(d => d.artifactId!)).size,
    windowStart: filtered[0]?.timestamp || null,
    windowEnd: filtered[filtered.length - 1]?.timestamp || null,
  };

  let totalScore = 0;
  for (const d of filtered) {
    summary.byOutcome[d.outcome] = (summary.byOutcome[d.outcome] || 0) + 1;
    summary.byIntent[d.intent] = (summary.byIntent[d.intent] || 0) + 1;
    summary.byReadinessLevel[d.readinessLevel] = (summary.byReadinessLevel[d.readinessLevel] || 0) + 1;
    totalScore += d.readinessScore;
    if (d.outcome === 'block') summary.blockedCount++;
    if (d.exportGateOutcome === 'blocked') summary.exportBlockedCount++;
    if (d.publishGateOutcome === 'blocked') summary.publishBlockedCount++;
  }

  summary.averageReadinessScore = filtered.length > 0
    ? Math.round(totalScore / filtered.length)
    : 0;

  return summary;
}

export interface GovernedDecisionSummaryReport {
  total: number;
  byOutcome: Record<GovernedDecisionOutcome, number>;
  byIntent: Record<string, number>;
  byReadinessLevel: Record<string, number>;
  averageReadinessScore: number;
  blockedCount: number;
  exportBlockedCount: number;
  publishBlockedCount: number;
  uniqueProjects: number;
  uniqueArtifacts: number;
  windowStart: string | null;
  windowEnd: string | null;
}

/**
 * Get a single governed decision by ID.
 */
export function getGovernedDecision(decisionId: string): GovernedDecisionRecord | undefined {
  return governedDecisionLog.find(d => d.decisionId === decisionId);
}

/**
 * Get decision trace for a specific artifact — all decisions ever made for it.
 */
export function getArtifactDecisionTrace(
  projectId: string,
  artifactId: string
): GovernedDecisionRecord[] {
  return governedDecisionLog.filter(
    d => d.projectId === projectId && d.artifactId === artifactId
  );
}

/**
 * Clear governed decision log (for testing).
 */
export function clearGovernedDecisionLog(): void {
  governedDecisionLog.length = 0;
}
