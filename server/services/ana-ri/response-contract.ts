/**
 * AnA Canonical Response Contract
 *
 * Single source of truth for the response metadata shape that all AnA paths
 * (chat, stream, fallback) must produce. Eliminates envelope drift between
 * competing runtime paths.
 *
 * @module server/services/ana-ri/response-contract
 */

// ── Evidence Verdict ──────────────────────────────────────────────────────────

export interface EvidenceVerdict {
  /** Whether evidence validation was attempted */
  attempted: boolean;
  /** Whether evidence passed validation */
  validated: boolean;
  /** Number of real evidence sources consulted */
  source_count: number;
  /** Types of sources (e.g., 'regulatory_reference', 'project_memory', 'persisted_evidence') */
  source_types: string[];
  /** Number of claims with grounded evidence */
  grounded_claim_count: number;
  /** Claims with weak or no evidence */
  weak_or_ungrounded_claim_count: number;
  /** Claims that need evidence but have none */
  missing_support_count: number;
  /** Evidence provider used */
  provider: 'ana-ri' | 'enterprise-bridge' | 'none' | 'fallback';
  /** Error if validation failed */
  error?: string;
  /** Reviewer risk summary */
  reviewer_risk_summary?: string;
}

// ── Memory Metadata ───────────────────────────────────────────────────────────

export interface MemoryMetadata {
  /** Number of memory atoms injected into context */
  atomCount: number;
  /** Diagnostics from memory assembly */
  diagnostics?: Record<string, unknown> | null;
  /** Whether memory was available */
  available: boolean;
}

// ── Queue Metadata ────────────────────────────────────────────────────────────

export interface QueueMeta {
  thread_id: string | null;
  handoff_ready: boolean;
  turn_status: 'completed' | 'blocked' | 'waiting_action';
  can_process_next: boolean;
  blocked_reason: string | null;
}

// ── Canonical Orchestration Metadata ──────────────────────────────────────────

export interface AnaOrchestrationMeta {
  detectedIntent: {
    lens: string;
    confidence: number;
    signals: string[];
  };
  detectedSubmissionType: string | null;
  appliedRole: string;
  activeWorkstream?: {
    stream: string;
    phase?: string;
    objective?: string;
  };
  workstreamHandoff?: {
    from: string;
    to: string;
    carryForward?: string[];
  };
  suggestedActions: string[];
  meta?: Record<string, unknown>;
  goalPlan?: unknown;
}

// ── Canonical AnA Response ────────────────────────────────────────────────────

export interface AnaCanonicalResponse {
  /** The assistant response text */
  response: string;
  /** Thread identifier for conversation continuity */
  thread_id: string | null;
  /** Orchestration metadata */
  orchestration: AnaOrchestrationMeta;
  /** Quality evaluation */
  evaluation: {
    grade: string;
    overallScore: number;
    maxScore: number;
  };
  /** Evidence discipline check */
  evidence: {
    compliant: boolean;
    labels: number;
    verdict?: EvidenceVerdict;
  };
  /** Structure validation */
  structure: {
    valid: boolean;
    score: number;
    maxScore: number;
  };
  /** AI provider used */
  provider: string;
  /** AI model used */
  model: string;
  /** Token usage */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  };
  /** Whether message persistence failed */
  persistenceFailed: boolean;
  /** Executed document actions */
  executedActions?: Array<{
    action: string;
    executed: boolean;
    result?: unknown;
  }>;
  /** Executed operational commands */
  executedCommands?: Array<{
    action: string;
    success: boolean;
    message?: string;
    data?: unknown;
  }>;
  /** Memory metadata */
  memory?: MemoryMetadata;
  /** Queue handoff metadata */
  queueMeta?: QueueMeta;
  /** Evidence usage for firecrawl etc. */
  evidenceUsage?: Record<string, unknown>;
  /** Enrichment sources used */
  enrichmentSources?: string[];
  /** Enrichment metadata */
  enrichmentMeta?: { sourcesFailed?: string[] };
  /** Grounding context */
  grounding?: Record<string, unknown>;
  /** Whether this response came from a fallback path */
  fallback?: {
    active: boolean;
    reason: string;
    original_path: string;
    degraded_capabilities: string[];
  };
  /** Internal metadata (correlation, etc.) */
  _meta?: Record<string, unknown>;
}

// ── Builder Helpers ───────────────────────────────────────────────────────────

export function buildQueueMeta(params: {
  threadId?: string | null;
  persistenceFailed?: boolean;
  blocked?: boolean;
  error?: string | null;
}): QueueMeta {
  const blocked = Boolean(params.blocked || params.persistenceFailed || params.error);
  return {
    thread_id: params.threadId || null,
    handoff_ready: !blocked,
    turn_status: blocked ? 'blocked' : 'completed',
    can_process_next: !blocked,
    blocked_reason:
      params.error || (params.persistenceFailed ? 'thread_persistence_failed' : null),
  };
}

export function buildFallbackMarker(reason: string, originalPath: string): AnaCanonicalResponse['fallback'] {
  return {
    active: true,
    reason,
    original_path: originalPath,
    degraded_capabilities: [
      'orchestration',
      'memory_injection',
      'rim_interception',
      'command_execution',
      'evidence_validation',
      'queue_metadata',
    ],
  };
}

export function buildEmptyEvidenceVerdict(): EvidenceVerdict {
  return {
    attempted: false,
    validated: false,
    source_count: 0,
    source_types: [],
    grounded_claim_count: 0,
    weak_or_ungrounded_claim_count: 0,
    missing_support_count: 0,
    provider: 'none',
  };
}
