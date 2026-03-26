/**
 * Contradiction Architecture — Pass 8
 *
 * Cross-artifact contradiction detection, regulator/body overlay consequence,
 * and UI-facing context types for the Concept2Cure submission operating system.
 *
 * Extends the existing contradiction-engine-service types with:
 * - Cross-artifact contradiction finding enrichment (module/section anchoring)
 * - Regulator/body overlay consequence types
 * - Contradiction-aware preflight enrichment
 * - UI context types for thin-UI surfacing (no new screens)
 * - Decision-linked contradiction lifecycle
 *
 * @module shared/types/contradiction-architecture
 */

// ─── Re-export canonical contradiction types from engine ─────────────────────

export type {
  ContradictionType,
  Severity as ContradictionSeverity,
  AuthorityState as ContradictionAuthorityState,
  ReviewState as ContradictionReviewState,
  ConsequenceType,
  LLMRole,
  TruthLevel,
  SourceClassification,
} from '../../server/services/contradiction-engine-service.js';

// ─── Cross-Artifact Contradiction Types ──────────────────────────────────────

/**
 * Contradiction confidence — structured, not a vibe.
 */
export type ContradictionConfidence = 'strong' | 'moderate' | 'provisional' | 'uncertain';

/**
 * Maps a numeric confidence score to a structured level.
 */
export function toConfidenceLevel(score: number): ContradictionConfidence {
  if (score >= 0.85) return 'strong';
  if (score >= 0.65) return 'moderate';
  if (score >= 0.4) return 'provisional';
  return 'uncertain';
}

/**
 * Extended contradiction type taxonomy for Pass 8.
 * Adds types the engine already declares but doesn't yet detect.
 */
export type ExtendedContradictionType =
  | 'assumption_drift'
  | 'summary_body'
  | 'protocol_sap'
  | 'decision_action'
  | 'regulator_overlay'
  | 'body_specific_expectation'
  | 'parameter_mismatch'
  | 'status_conflict'
  | 'approved_vs_working'
  | 'cross_jurisdictional_divergence'
  | 'cross_section_inconsistency'
  | 'other';

/**
 * Contradiction detection source — how the engine found it.
 */
export type DetectionMethod =
  | 'deterministic_record_compare'    // Structured record field comparison
  | 'deterministic_status_check'      // Status/lifecycle rule violation
  | 'deterministic_version_compare'   // Approved vs working version diff
  | 'harmonize_engine_issue'          // HarmonizeEngine cross-section check
  | 'body_gap_analysis'              // Body-aware gap detection mismatch
  | 'overlay_rule_match'             // Regulator overlay rule fired
  | 'llm_semantic_analysis';         // LLM-assisted semantic comparison (last resort)

// ─── Overlay Consequence Types ───────────────────────────────────────────────

/**
 * What a regulator/body overlay changes about a contradiction finding.
 */
export interface OverlayConsequence {
  /** Which overlay rule fired */
  overlayRuleId: string;
  overlayRuleCode: string;

  /** Original values before overlay */
  originalSeverity: string;
  originalAuthorityState: string;
  originalConsequenceType: string | null;

  /** Overridden values */
  overriddenSeverity: string;
  overriddenAuthorityState: string;
  overriddenConsequenceType: string | null;

  /** Why the overlay changed things */
  regulatorBody: string;
  jurisdiction?: string;
  rationale: string;
  regulatoryReference?: string;
}

/**
 * Seed overlay rule definition — used by regulator-overlay-engine to bootstrap.
 */
export interface SeedOverlayRule {
  ruleCode: string;
  ruleName: string;
  regulatorBody: string;
  jurisdiction?: string;
  contradictionType: string;
  applicableDomains: string[];
  applicableProgramTypes: string[];
  severityOverride: string | null;
  authorityOverride: string | null;
  consequenceOverride: string | null;
  description: string;
  regulatoryReference?: string;
  rationale: string;
  priority: number;
}

// ─── Contradiction-Aware Preflight Enrichment ────────────────────────────────

/**
 * Contradiction context injected into section/module/dossier preflight results.
 */
export interface ContradictionPreflightContext {
  /** How many unresolved contradictions affect this scope */
  unresolvedCount: number;
  /** How many are blocking (blocks_promotion or requires_escalation) */
  blockingCount: number;
  /** How many have regulator/body overlay overrides active */
  overlayActiveCount: number;

  /** Summary of contradiction types found */
  byType: Record<string, number>;
  /** Summary by severity */
  bySeverity: Record<string, number>;

  /** The blocking findings (full detail for preflight consumers) */
  blockingFindings: ContradictionPreflightFinding[];
  /** Warning findings (non-blocking but relevant) */
  warningFindings: ContradictionPreflightFinding[];

  /** Whether any overlay rule changed severity from non-blocking to blocking */
  overlayEscalatedToBlocking: boolean;

  /** Decision linkage: IDs of FormalDecisionRecords linked to these contradictions */
  linkedDecisionIds: string[];
}

/**
 * Slimmed-down contradiction finding for preflight context.
 */
export interface ContradictionPreflightFinding {
  id: string;
  contradictionType: string;
  severity: string;
  confidenceLevel: string;
  title: string;
  description: string;

  /** What objects are in conflict */
  objectAType: string;
  objectAId: string;
  objectALabel: string | null;
  objectBType: string;
  objectBId: string;
  objectBLabel: string | null;

  /** Section/module anchoring */
  sectionCodeA?: string;
  sectionCodeB?: string;
  moduleCode?: string;

  /** Authority and consequence */
  authorityState: string;
  consequenceType: string | null;

  /** Overlay info (if applied) */
  overlayApplied: boolean;
  overlayRuleCode?: string;
  regulatorBody?: string;
  originalSeverity?: string;

  /** Detection provenance */
  detectionMethod: string;
  deterministicRule: string | null;
  llmRole: string;

  /** What action is recommended */
  recommendedAction: string | null;

  /** Linked decisions */
  linkedDecisionId?: string;
}

// ─── UI Context Types ────────────────────────────────────────────────────────
// These types define what the thin-UI surfaces consume.
// No new screens — injected into existing surfaces:
// - AnaPersistentPanel
// - SectionWorkspace issues/status area
// - GovernedDocumentPanel
// - Preflight explanation cards
// - Review thread / promotion affordances

/**
 * Contradiction summary for a governed object (section, module, dossier, artifact).
 * Used by UI components to show contradiction state without a full dashboard.
 */
export interface ContradictionObjectSummary {
  /** The governed object this summary is for */
  objectType: 'section' | 'module' | 'dossier' | 'artifact';
  objectId: string;
  objectLabel?: string;

  /** Contradiction state */
  hasContradictions: boolean;
  totalCount: number;
  blockingCount: number;
  warningCount: number;
  infoCount: number;

  /** Highest severity among unresolved */
  highestSeverity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  /** Whether any overlay is active */
  hasOverlayOverrides: boolean;

  /** Human-readable one-line summary */
  summaryLine: string;
  /** What regulator/body context changes about this */
  bodyContextNote?: string;

  /** Whether human confirmation / approval / escalation is required */
  requiresHumanAction: boolean;
  requiredActionType?: 'confirmation' | 'approval' | 'escalation';

  /** What happened after action (if any) */
  lastActionTaken?: string;
  lastActionAt?: string;
}

/**
 * Full contradiction detail for inline display in SectionWorkspace or AnaPersistentPanel.
 */
export interface ContradictionInlineDetail {
  id: string;
  contradictionType: ExtendedContradictionType;
  severity: string;
  confidence: ContradictionConfidence;

  /** Human-readable explanation */
  title: string;
  description: string;
  rationale: string;

  /** Affected objects */
  objectA: { type: string; id: string; label: string | null; sectionCode?: string };
  objectB: { type: string; id: string; label: string | null; sectionCode?: string };

  /** Regulator/body context */
  regulatorBody?: string;
  submissionType?: string;
  overlayApplied: boolean;
  overlayConsequence?: OverlayConsequence;

  /** What action is recommended */
  recommendedAction: {
    actionType: string;      // e.g., 'prepare-correction-draft', 'review_thread'
    label: string;           // Human-readable action label
    requiresConfirmation: boolean;
    requiresApproval: boolean;
    requiresEscalation: boolean;
  } | null;

  /** Decision linkage */
  linkedDecisionId?: string;
  decisionStatus?: string;

  /** Resolution state */
  reviewState: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

/**
 * Contradiction context for AnA to explain in conversation.
 * Injected into orchestrator system prompt.
 */
export interface ContradictionAnaContext {
  /** Project-level contradiction state */
  projectContradictionCount: number;
  unresolvedBlockingCount: number;
  overlayActiveCount: number;

  /** Current scope contradictions (section/module being discussed) */
  scopeContradictions: Array<{
    type: string;
    severity: string;
    title: string;
    objectA: string;
    objectB: string;
    authorityState: string;
    recommendedAction: string | null;
    overlayNote?: string;
  }>;

  /** Recent contradiction-linked decisions */
  recentDecisions: Array<{
    decisionId: string;
    kind: string;
    status: string;
    summary: string;
    contradictionId: string;
  }>;

  /** Body context active for this project */
  activeBodyContext?: {
    regulatorBody: string;
    submissionType: string;
    overlayRulesActive: number;
  };
}

// ─── Contradiction Lifecycle Events ──────────────────────────────────────────
// Used by reactive-dependency-service and decision-lifecycle-service.

export type ContradictionLifecycleEvent =
  | 'contradiction_detected'
  | 'contradiction_overlay_applied'
  | 'contradiction_consequence_recommended'
  | 'contradiction_consequence_confirmed'
  | 'contradiction_consequence_executed'
  | 'contradiction_resolved'
  | 'contradiction_dismissed'
  | 'contradiction_escalated'
  | 'contradiction_superseded';

export interface ContradictionLifecycleEntry {
  event: ContradictionLifecycleEvent;
  contradictionId: string;
  projectId: string;
  timestamp: string;
  actorId?: string;
  actorType: 'human' | 'ana' | 'system';
  details: Record<string, unknown>;
}

// ─── Consequence Path Definition ─────────────────────────────────────────────

/**
 * A concrete consequence path that can be offered to the user.
 */
export interface ConsequencePath {
  id: string;
  contradictionId: string;
  actionType: string;      // GovernedActionType or ConsequenceType
  label: string;
  description: string;

  /** Authority requirement for this path */
  authorityLevel: string;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  requiresEscalation: boolean;

  /** What objects will be affected */
  affectedObjectIds: string[];
  affectedSectionCodes: string[];

  /** Whether this path was auto-recommended by the engine */
  autoRecommended: boolean;

  /** Execution state */
  executed: boolean;
  executedAt?: string;
  executedById?: string;
  resultObjectId?: string;
  resultObjectType?: string;
}

// ─── Contradiction → Decision Linkage ────────────────────────────────────────

/**
 * Bidirectional linkage between contradiction and decision.
 */
export interface ContradictionDecisionLink {
  contradictionId: string;
  decisionId: string;
  linkType: 'created_by' | 'resolved_by' | 'escalated_to' | 'superseded_by';
  createdAt: string;
}
