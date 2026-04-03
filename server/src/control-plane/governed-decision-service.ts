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

  // Durable persistence bridge — non-blocking, fire-and-forget
  // Bridges governed fabric decisions into the formal decision_records table
  // via the existing decisionRecordService infrastructure.
  persistGovernedDecisionDurably(record).catch(() => {
    // Persistence failure is non-blocking — in-memory log is still authoritative for hot queries
  });

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
    filtered = filtered.filter(d => options.since ? d.timestamp >= options.since : true);
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
    filtered = filtered.filter(d => options.since ? d.timestamp >= options.since : true);
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

// ═══════════════════════════════════════════════════════════════════════
// Durable Query Functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Map a decision_records row back to GovernedDecisionRecord shape.
 * Handles both snake_case (DB row) and camelCase (mapped JS object) field names.
 */
function mapDecisionRecordToGovernedDecision(record: Record<string, unknown>): GovernedDecisionRecord {
  // Parse JSON fields safely — handle string, object, null
  const rawNotes = record.notes ?? '';
  const notes: Record<string, unknown> = typeof rawNotes === 'string'
    ? (() => { try { return JSON.parse(rawNotes) as Record<string, unknown>; } catch { return {}; } })()
    : (rawNotes && typeof rawNotes === 'object' ? rawNotes as Record<string, unknown> : {});

  const rawCtx = record.decision_context ?? record.decisionContext ?? '';
  const ctx: Record<string, unknown> = typeof rawCtx === 'string'
    ? (() => { try { return JSON.parse(rawCtx) as Record<string, unknown>; } catch { return {}; } })()
    : (rawCtx && typeof rawCtx === 'object' ? rawCtx as Record<string, unknown> : {});

  return {
    decisionId: String(ctx.governedDecisionId ?? record.id ?? ''),
    projectId: String(record.project_id ?? record.projectId ?? ''),
    organizationId: String(record.organization_id ?? record.organizationId ?? ''),
    artifactId: notes.artifactId != null ? String(notes.artifactId) : undefined,
    intent: String(ctx.intent ?? notes.intent ?? 'unknown'),
    outcome: String(ctx.outcome ?? notes.outcome ?? 'degraded') as GovernedDecisionOutcome,
    rationale: String(record.recommendation_summary ?? record.recommendationSummary ?? ''),
    blockerCount: Number(notes.blockerCount ?? 0),
    warningCount: Number(notes.warningCount ?? 0),
    consequenceCount: Number(notes.consequenceCount ?? 0),
    readinessLevel: String(ctx.readinessLevel ?? notes.readinessLevel ?? 'draft'),
    readinessScore: Number(notes.readinessScore ?? 0),
    placementOutcome: String(notes.placementOutcome ?? 'insufficient_context'),
    exportGateOutcome: String(notes.exportGateOutcome ?? 'insufficient_context'),
    publishGateOutcome: String(notes.publishGateOutcome ?? 'insufficient_context'),
    actorId: String(record.decided_by ?? record.decidedBy ?? 'system'),
    timestamp: String(record.created_at ?? record.createdAt ?? new Date().toISOString()),
    fabricVersion: String(notes.fabricVersion ?? '1.0.0'),
  };
}

/**
 * Query governed decisions from durable storage (decision_records table).
 * Falls back to in-memory if durable storage is unavailable.
 */
export async function getRecentGovernedDecisionsDurable(options: {
  organizationId?: string;
  projectId?: string;
  limit?: number;
} = {}): Promise<GovernedDecisionRecord[]> {
  try {
    const { decisionRecordService } = await import('../../services/decision-record-service.js');
    const limit = Math.max(1, Math.min(options.limit ?? 50, 500));

    const records = await decisionRecordService.search({
      organizationId: options.organizationId ? Number(options.organizationId) : 1,
      projectId: options.projectId ? Number(options.projectId) : undefined,
      recommendationType: 'governed_fabric_decision',
      limit,
    });

    return records.map((r: Record<string, unknown>) => mapDecisionRecordToGovernedDecision(r));
  } catch {
    // Durable storage unavailable — fall back to in-memory
    return getRecentGovernedDecisions(options);
  }
}

/**
 * Get governed decision summary from durable storage.
 * Falls back to in-memory if durable storage is unavailable.
 */
export async function getGovernedDecisionSummaryDurable(options: {
  organizationId?: string;
  projectId?: string;
  since?: string;
} = {}): Promise<GovernedDecisionSummaryReport> {
  try {
    const decisions = await getRecentGovernedDecisionsDurable({
      organizationId: options.organizationId,
      projectId: options.projectId,
      limit: 500,
    });

    let filtered = decisions;
    if (options.since) {
      filtered = filtered.filter(d => options.since ? d.timestamp >= options.since : true);
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
  } catch {
    // Durable storage unavailable — fall back to in-memory
    return getGovernedDecisionSummary(options);
  }
}

/**
 * Get durable decision trace for a specific artifact — all governed decisions for it.
 * Falls back to in-memory if durable storage is unavailable.
 */
export async function getArtifactDecisionTraceDurable(
  projectId: string,
  artifactId: string
): Promise<GovernedDecisionRecord[]> {
  try {
    const decisions = await getRecentGovernedDecisionsDurable({
      projectId,
      limit: 500,
    });
    return decisions.filter(d => d.artifactId === artifactId);
  } catch {
    // Durable storage unavailable — fall back to in-memory
    return getArtifactDecisionTrace(projectId, artifactId);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Durable Persistence Bridge
// ═══════════════════════════════════════════════════════════════════════

/**
 * Persist a governed decision durably via the existing decisionRecordService.
 * Non-blocking — failures are logged but do not break the evaluation flow.
 * Uses the existing `decision_records` table from shared/schema/operating-system.ts.
 */
async function persistGovernedDecisionDurably(record: GovernedDecisionRecord): Promise<boolean> {
  try {
    const { decisionRecordService } = await import('../../services/decision-record-service.js');
    if (!decisionRecordService?.create) return false;

    await decisionRecordService.create({
      organizationId: Number(record.organizationId) || 1,
      projectId: Number(record.projectId) || 0,
      decisionCode: `governed-fabric:${record.decisionId}`,
      title: `Governed ${record.intent}: ${record.outcome}`.slice(0, 200),
      domainTrack: 'governance',
      recommendationType: 'governed_fabric_decision',
      recommendationSummary: record.rationale.slice(0, 500),
      recommendationRationale: record.rationale,
      confidenceLevel: record.readinessScore >= 75 ? 'high' : record.readinessScore >= 40 ? 'moderate' : 'low',
      decidedBy: record.actorId || 'system',
      notes: JSON.stringify({
        fabricVersion: record.fabricVersion,
        intent: record.intent,
        outcome: record.outcome,
        readinessLevel: record.readinessLevel,
        readinessScore: record.readinessScore,
        blockerCount: record.blockerCount,
        warningCount: record.warningCount,
        consequenceCount: record.consequenceCount,
        placementOutcome: record.placementOutcome,
        exportGateOutcome: record.exportGateOutcome,
        publishGateOutcome: record.publishGateOutcome,
        originSurface: record.originSurface,
        regulatorBody: record.regulatorBody,
        submissionType: record.submissionType,
        ctdSection: record.ctdSection,
        artifactId: record.artifactId,
      }),
      decisionContext: {
        governedDecisionId: record.decisionId,
        kind: 'governed-fabric-decision',
        intent: record.intent,
        outcome: record.outcome,
        readinessLevel: record.readinessLevel,
        regulatorBody: record.regulatorBody,
        submissionType: record.submissionType,
      },
    });

    return true;
  } catch (err) {
    console.warn('[governed-decision-service] Durable persistence failed (non-blocking)', {
      decisionId: record.decisionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
