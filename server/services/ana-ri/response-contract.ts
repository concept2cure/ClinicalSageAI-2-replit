/**
 * AnA Canonical Response Contract
 *
 * Single source of truth for the response metadata shape that all AnA paths
 * (chat, stream, fallback) must produce. Eliminates envelope drift between
 * competing runtime paths.
 *
 * @module server/services/ana-ri/response-contract
 */

import type { AnswerCheck } from '../ana/answer-grounding.js';

// ── Evidence Verdict ──────────────────────────────────────────────────────────

/**
 * A specific claim the evidence validator flagged, carried so the client can
 * show *which* claims are weak — not just a count. `kind` explains why it was
 * flagged; `text` is the offending sentence/phrase (trimmed).
 */
export interface FlaggedClaim {
  kind: 'ungrounded' | 'overclaim' | 'contradiction';
  text: string;
}

export interface EvidenceVerdict {
  /** Whether evidence validation was attempted */
  attempted: boolean;
  /** Whether evidence passed validation */
  validated: boolean;
  /**
   * [KNOWN] and [INFERRED] labels in the answer. These are AnA's own labels,
   * not sources anything read: the sources a claim was compared with are in
   * the answer check (services/ana/answer-grounding.ts).
   */
  source_count: number;
  /** The kinds of support the labels claim ('regulatory_reference', 'analytical_inference') */
  source_types: string[];
  /** The labels AnA wrote, by kind. */
  label_counts?: { known: number; inferred: number; missing: number };
  /** Claims with a [KNOWN] or [INFERRED] label nearby */
  grounded_claim_count: number;
  /** Claims with no label nearby, and overclaims */
  weak_or_ungrounded_claim_count: number;
  /** Claims AnA herself marked [MISSING]: support she says is absent */
  missing_support_count: number;
  /** Evidence provider used */
  provider: 'ana-ri' | 'enterprise-bridge' | 'none' | 'fallback';
  /** Error if validation failed */
  error?: string;
  /** Reviewer risk summary */
  reviewer_risk_summary?: string;
  /**
   * The specific claims behind `weak_or_ungrounded_claim_count` — so the client
   * can let a reviewer see *which* claims are weak and why, rather than only a
   * number. Bounded (the validator caps the list); omitted when nothing flagged.
   */
  flagged_claims?: FlaggedClaim[];
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
    /** Human-readable one-line reliability summary derived from the verdict. */
    trust_summary?: string;
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

/** "1 claim" / "2 claims". */
const claimsWord = (n: number) => `${n} claim${n === 1 ? '' : 's'}`;

/** The engine's check, in one sentence. */
function checkSentence(check: AnswerCheck): string {
  let line: string;
  if (check.basis === 'no_sources') {
    line =
      check.unchecked.length > 0
        ? `No source consulted this turn: ${claimsWord(check.unchecked.length)} unchecked.`
        : 'No source consulted this turn.';
  } else if (check.claims === 0) {
    line = "No specific claims to check against this turn's sources.";
  } else if (check.notFound.length === 0) {
    line = `Checked against this turn's sources: all ${claimsWord(check.claims)} found.`;
  } else {
    line = `⚠ Checked against this turn's sources: ${check.notFound.length} of ${claimsWord(check.claims)} not found.`;
  }
  if (check.verdicts.length > 0) {
    line += ` States ${check.verdicts.length === 1 ? 'a verdict' : `${check.verdicts.length} verdicts`}; verdicts come from engines.`;
  }
  return line;
}

/**
 * Pure: one human-readable line saying what was checked about an answer, so a
 * person can gauge its reliability at a glance (21 CFR Part 11
 * verifiability). Honest by construction: it restates the check's and the
 * labels' own counts and never upgrades confidence.
 *
 * The check (the engine's comparison with what AnA consulted) leads. The
 * labels follow as hers: a [KNOWN] label is the model describing its own
 * claim, so a clean set of labels is not "Verified", and a label is not a
 * source (2026-10-04, AnA reasoning).
 */
export function buildTrustSummary(verdict?: EvidenceVerdict, check?: AnswerCheck | null): string {
  const lead = check ? checkSentence(check) : null;
  if (!verdict || !verdict.attempted) {
    return lead ?? 'Evidence check not run for this response — verify any regulatory claims before relying on them.';
  }
  const labelled = verdict.grounded_claim_count;
  const weak = verdict.weak_or_ungrounded_claim_count;
  const missing = verdict.missing_support_count;
  const clean = verdict.validated && weak === 0 && missing === 0;
  let line = `${clean ? '' : '⚠ '}AnA's labels: ${labelled} labelled · ${weak} unlabelled or overclaimed · ${missing} marked missing`;
  if (verdict.reviewer_risk_summary && verdict.reviewer_risk_summary.trim()) {
    line += `. ${verdict.reviewer_risk_summary.trim()}`;
  } else if (weak > 0) {
    line += `. ${weak} claim${weak === 1 ? '' : 's'} need${weak === 1 ? 's' : ''} verification before reviewer-facing use.`;
  }
  return lead ? `${lead} ${line}` : line;
}
