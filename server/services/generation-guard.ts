/**
 * Generation Guard — enforces LAW 1 and LAW 3 of the product laws.
 *
 * LAW 1: All meaningful AI work must follow:
 * Intent -> Orchestration -> Governed Artifact -> Editor -> Project/Dossier -> Lifecycle -> Audit/Provenance
 *
 * LAW 3: No preview-only generation. No export-only generation.
 *
 * This module provides:
 * 1. A guard that validates generation produces an artifact
 * 2. Runtime tracing for the generation -> artifact -> editor pipeline
 * 3. Error logging when generation bypasses artifact creation
 */

import type {
  CanonicalDocumentContract,
  GenerationGuardResult,
  ArtifactSourceSystem,
} from '../../shared/types/document-contract.js';
import { validateDocumentContract } from '../../shared/types/document-contract.js';

// ─── Runtime trace events ─────────────────────────────────────────────────────

export interface GenerationTraceEvent {
  traceId: string;
  timestamp: string;
  event:
    | 'generation_start'
    | 'artifact_created'
    | 'editor_loaded'
    | 'project_placed'
    | 'lifecycle_transition'
    | 'export_success'
    | 'export_failure'
    | 'guard_violation';
  sourceSystem: ArtifactSourceSystem;
  projectId?: number;
  artifactId?: string;
  userId?: number;
  metadata?: Record<string, unknown>;
}

const traceLog: GenerationTraceEvent[] = [];
const MAX_TRACE_LOG = 1000;

/**
 * Emit a trace event for the generation pipeline.
 * Traceable path: user action -> AnA -> artifact -> editor -> project
 */
export function emitTraceEvent(event: GenerationTraceEvent): void {
  traceLog.push(event);
  if (traceLog.length > MAX_TRACE_LOG) {
    traceLog.splice(0, traceLog.length - MAX_TRACE_LOG);
  }

  // Log to console for runtime observability
  const level = event.event === 'guard_violation' ? 'error' : 'info';
  console[level](
    `[GenerationGuard] ${event.event} | source=${event.sourceSystem} project=${event.projectId ?? 'none'} artifact=${event.artifactId ?? 'none'} trace=${event.traceId}`
  );
}

/**
 * Get recent trace events (for debugging/observability endpoints).
 */
export function getRecentTraces(limit = 50): GenerationTraceEvent[] {
  return traceLog.slice(-limit);
}

/**
 * Create a trace ID for tracking a generation through the full pipeline.
 */
export function createTraceId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Contract validation guard ───────────────────────────────────────────────

/**
 * Validate a document contract before persistence.
 * Returns validation result. On failure, logs a guard violation.
 */
export function guardArtifactCreation(
  contract: CanonicalDocumentContract,
  traceId: string
): GenerationGuardResult {
  const result = validateDocumentContract(contract);

  if (!result.valid) {
    emitTraceEvent({
      traceId,
      timestamp: new Date().toISOString(),
      event: 'guard_violation',
      sourceSystem: contract.sourceSystem,
      projectId: contract.projectId,
      metadata: {
        errors: result.errors,
        warnings: result.warnings,
        documentType: contract.documentType,
      },
    });
  }

  if (result.warnings.length > 0) {
    console.warn(
      `[GenerationGuard] Warnings for ${contract.documentType}: ${result.warnings.join('; ')}`
    );
  }

  return result;
}

/**
 * Log when a generation path produces output without creating an artifact.
 * This is a LAW 3 violation — all generation must produce governed artifacts.
 */
export function logOrphanGeneration(params: {
  sourceSystem: ArtifactSourceSystem;
  endpoint: string;
  projectId?: number;
  userId?: number;
  reason: string;
}): void {
  const traceId = createTraceId();
  emitTraceEvent({
    traceId,
    timestamp: new Date().toISOString(),
    event: 'guard_violation',
    sourceSystem: params.sourceSystem,
    projectId: params.projectId,
    userId: params.userId,
    metadata: {
      endpoint: params.endpoint,
      reason: params.reason,
      violation: 'orphan_generation',
    },
  });
  console.error(
    `[GenerationGuard] ORPHAN GENERATION at ${params.endpoint}: ${params.reason} (source=${params.sourceSystem})`
  );
}
