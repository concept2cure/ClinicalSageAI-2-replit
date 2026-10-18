/**
 * Governed Intelligence display vocabulary — labels and tones for the enums
 * the contradiction engine records (server/services/contradiction-engine-service.ts:
 * ContradictionType, Severity, AuthorityState, SourceClassification, LLMRole),
 * and the board's row types. Nothing here decides anything.
 *
 * REMOVED 2026-10-15: GI_OVERLAYS, giApplyOverlay, giPromotionGate and
 * GI_META.DEFAULT_AUTHORITY. They re-scored every finding in the browser: the
 * authority the engine had recorded was replaced by a five-entry copy of the
 * server's default map (so a finding of any other type read "Advisory" whatever
 * the engine said), and an FDA/EMA toggle applied two hard-coded overlay rules,
 * one of which — "EMA treats the same conflict as requiring approval" — exists
 * in no organisation's contradiction_overlay_rules. The gate was then counted
 * from that re-scoring over the first page of findings. The board now carries
 * the gate the server counts over every finding (ProjectGate) and each
 * finding's recorded authority and overlay; the surface renders them.
 */

/* ── Types ── */

export interface GiAuthorityMeta {
  label: string;
  tone: string;
  blocks: boolean;
  rank: number;
}

export interface GiSeverityMeta {
  label: string;
  s: string;
}

export interface GiMeta {
  authority: Record<string, GiAuthorityMeta>;
  severity: Record<string, GiSeverityMeta>;
  source: Record<string, string>;
  llmRole: Record<string, string>;
  type: Record<string, string>;
}

export interface GiObjectRef {
  type: string;
  id: string;
  label: string;
}

/** One finding as the board returns it (governed-intelligence-inconsistency-routes.ts). */
export interface GiFinding {
  id: string;
  projectId: number;
  contradictionType: string;
  /** As recorded — after any overlay rule the engine applied at detection. */
  severity: string;
  title: string;
  objectA: GiObjectRef;
  objectB: GiObjectRef;
  sourceClassification: string;
  truthHierarchyLevel: number;
  llmRole: string;
  confidenceScore: number;
  confidenceLevel: string;
  description: string;
  deterministicRule: string | null;
  consequenceType: string | null;
  reviewState: string;
  detectedBy: string | null;
  factId: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  /** The authority the engine recorded; the one checkPromotionBlocked enforces. */
  authorityState: string;
  /** The regulator body the finding was detected against, as stored. */
  regulatorBody?: string | null;
  /** The overlay rule applied at detection, or null when none was. */
  overlayRuleId?: string | null;
}

/** The project's submission gate, counted by the server over every finding (ProjectGate). */
export interface GiGate {
  total: number;
  open: number;
  resolved: number;
  superseded: number;
  blocking: number;
  needApproval: number;
  needEscalation: number;
  needReview: number;
  advisory: number;
  unrecognized: number;
  blocked: boolean;
}

export interface GiCheck {
  k: string;
  detail: string;
}

export interface GiAssumption {
  id: string;
  category: string;
  domainTrack: string;
  assumedValue: string;
  status: string;
  title: string;
  source: string;
}

export interface GiDecision {
  id: string;
  title: string;
  actionState: string;
  executedArtifactId: number | null;
  executedArtifactVersion: number | null;
  decidedBy: string;
  rationale: string;
}

/* ── Enum labels (one per value the engine records) ── */

export const GI_META: GiMeta = {
  authority: {
    advisory_only:       { label: 'Advisory',            tone: 'idle', blocks: false, rank: 0 },
    requires_review:     { label: 'Requires review',     tone: 'warn', blocks: false, rank: 1 },
    requires_approval:   { label: 'Requires approval',   tone: 'warn', blocks: false, rank: 2 },
    requires_escalation: { label: 'Requires escalation', tone: 'warn', blocks: false, rank: 2 },
    blocks_promotion:    { label: 'Blocks promotion',    tone: 'bad',  blocks: true,  rank: 3 },
  },
  severity: {
    critical: { label: 'Critical', s: 'crit' },
    high:     { label: 'High',     s: 'high' },
    medium:   { label: 'Medium',   s: 'med' },
    low:      { label: 'Low',      s: 'low' },
  },
  source: {
    structured_record_conflict:     'Structured record conflict',
    deterministic_rule_conflict:    'Deterministic rule',
    overlay_rule_conflict:          'Regulator overlay',
    llm_assisted_semantic_conflict: 'AI-assisted semantic',
    hybrid_conflict:                'Hybrid',
  },
  llmRole: {
    none: 'Deterministic -- no LLM',
    explanation_only: 'LLM -- explanation only',
    refinement: 'LLM -- refinement',
    primary_detection: 'LLM -- primary detection',
  },
  type: {
    assumption_drift: 'Assumption drift',
    summary_body_tension: 'Summary / body tension',
    recommendation_action_inconsistency: 'Recommendation / action mismatch',
    parameter_mismatch: 'Parameter mismatch',
    factual_contradiction: 'Factual contradiction',
    temporal_inconsistency: 'Temporal inconsistency',
    regulatory_discrepancy: 'Regulatory discrepancy',
    dosage_conflict: 'Dosage conflict',
    outcome_divergence: 'Outcome divergence',
    procedural_conflict: 'Procedural conflict',
    superseded_information: 'Superseded information',
    cross_jurisdictional_divergence: 'Cross-jurisdictional divergence',
    protocol_sap_inconsistency: 'Protocol / SAP inconsistency',
    decision_action_inconsistency: 'Decision / action mismatch',
    status_conflict: 'Status conflict',
  },
};

/* The per-segment binding (GI_BY_SEG / giForSeg) is deleted.

   Its biotech entry was the invented programme `BX-301 · anti-BCMA mAb ·
   BLA 351(a) · relapsed multiple myeloma`, paired with two sample findings.
   Inconsistency.tsx moved to the live governed-intelligence board and stopped
   importing it; nothing else referenced it, in the app or in the tests. Deleted
   rather than left dormant — a sample programme sitting in an exported const is
   one import away from being rendered again. */
