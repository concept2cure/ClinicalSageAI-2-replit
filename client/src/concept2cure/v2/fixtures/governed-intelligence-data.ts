/**
 * Governed Intelligence data + pure logic (kit app/governed-intel-data.jsx).
 *
 * Contradiction engine metadata, overlay rules, sample findings, assumption
 * registry, decision records, and the per-segment binding. Every value is
 * verbatim from the kit data file which itself is grounded in:
 *   server/routes/assumption-decision-contradiction.ts
 *   migrations/20260524_contradiction_engine_schema.sql
 *   tests/unit/governed-intelligence.test.ts
 *   app/pharma-data.jsx
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
  DEFAULT_AUTHORITY: Record<string, string>;
  authority: Record<string, GiAuthorityMeta>;
  severity: Record<string, GiSeverityMeta>;
  source: Record<string, string>;
  llmRole: Record<string, string>;
  type: Record<string, string>;
  reviewState: Record<string, string>;
}

export interface GiOverlay {
  regulatorBody: string;
  contradictionType: string;
  severityOverride: string;
  authorityOverride: string;
  consequenceOverride: string;
  priority: number;
  active: boolean;
  rationale: string;
}

export interface GiProgram {
  projectId: number;
  code: string;
  name: string;
  app: string;
  filing: string;
  stage: string;
  indication?: string;
}

export interface GiObjectRef {
  type: string;
  id: string;
  label: string;
}

export interface GiFinding {
  id: string;
  projectId: number;
  contradictionType: string;
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
  consequenceType: string;
  reviewState: string;
  detectedBy: string;
  factId: string | null;
  /* runtime state added by the surface */
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  /* overlay-applied effective fields */
  authorityState?: string;
  overlayApplied?: GiOverlay | null;
}

export interface GiCheck {
  k: string;
  detail: string;
}

export interface GiSegmentBinding {
  program: GiProgram;
  findings: GiFinding[];
  checks: GiCheck[];
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

export interface GiPromotionGate {
  blocked: boolean;
  blocking: GiFinding[];
  needApproval: GiFinding[];
  needReview: GiFinding[];
  effective: GiFinding[];
  openCount: number;
}

/* ── Enum metadata (verbatim from test + schema) ── */

export const GI_META: GiMeta = {
  DEFAULT_AUTHORITY: {
    assumption_drift: 'requires_review',
    dosage_conflict: 'blocks_promotion',
    regulatory_discrepancy: 'requires_approval',
    temporal_inconsistency: 'advisory_only',
    recommendation_action_inconsistency: 'requires_approval',
  },
  authority: {
    advisory_only:     { label: 'Advisory',          tone: 'idle', blocks: false, rank: 0 },
    requires_review:   { label: 'Requires review',   tone: 'warn', blocks: false, rank: 1 },
    requires_approval: { label: 'Requires approval', tone: 'warn', blocks: false, rank: 2 },
    blocks_promotion:  { label: 'Blocks promotion',  tone: 'bad',  blocks: true,  rank: 3 },
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
    dosage_conflict: 'Dosage conflict',
    assumption_drift: 'Assumption drift',
    regulatory_discrepancy: 'Regulatory discrepancy',
    temporal_inconsistency: 'Temporal inconsistency',
    recommendation_action_inconsistency: 'Recommendation / action mismatch',
    specification_conflict: 'Specification conflict',
    batch_record_discordance: 'Batch-record discordance',
    nomenclature: 'Nomenclature',
  },
  reviewState: {
    unresolved: 'Unresolved',
    in_review: 'In review',
    approved_resolution: 'Resolved',
    superseded: 'Superseded',
  },
};

/* ── Regulator overlay rules (verbatim from test: Overlay Impact) ── */

export const GI_OVERLAYS: GiOverlay[] = [
  {
    regulatorBody: 'FDA', contradictionType: 'dosage_conflict', severityOverride: 'critical',
    authorityOverride: 'blocks_promotion', consequenceOverride: 'dossier_review_attachment',
    priority: 10, active: true, rationale: 'FDA escalates administered-dose conflicts to a filing block.',
  },
  {
    regulatorBody: 'EMA', contradictionType: 'dosage_conflict', severityOverride: 'high',
    authorityOverride: 'requires_approval', consequenceOverride: 'review_thread',
    priority: 10, active: true, rationale: 'EMA treats the same conflict as requiring approval, not a hard block.',
  },
];

/* ── Program context (canonical: BX-204 = NDA 212345, pharma) ── */


/* ── Sample findings — mapped to contradiction_findings columns ── */

/* The per-segment binding (GI_BY_SEG / giForSeg) is deleted.

   Its biotech entry was the invented programme `BX-301 · anti-BCMA mAb ·
   BLA 351(a) · relapsed multiple myeloma`, paired with two sample findings.
   Inconsistency.tsx moved to the live governed-intelligence board and stopped
   importing it; nothing else referenced it, in the app or in the tests. Deleted
   rather than left dormant — a sample programme sitting in an exported const is
   one import away from being rendered again. */

/* ── Decision records (test: proposed -> approved -> executed traceability) ── */

/* ════ Pure logic (verbatim behavior from the test) ════ */

/** Apply a regulator overlay to one finding -> effective severity/authority. */
export function giApplyOverlay(f: GiFinding, regulator: string): GiFinding {
  const ov = GI_OVERLAYS.find(
    o => o.active && o.regulatorBody === regulator && o.contradictionType === f.contradictionType,
  );
  const baseAuth = GI_META.DEFAULT_AUTHORITY[f.contradictionType] || 'advisory_only';
  if (ov) {
    return { ...f, severity: ov.severityOverride, authorityState: ov.authorityOverride, consequenceType: ov.consequenceOverride, overlayApplied: ov };
  }
  return { ...f, authorityState: baseAuth, overlayApplied: null };
}

/** checkPromotionBlocked: drop resolved/superseded, then any blocks_promotion. */
export function giPromotionGate(findings: GiFinding[], regulator: string): GiPromotionGate {
  const eff = (findings || [])
    .filter(f => f.reviewState !== 'approved_resolution' && f.reviewState !== 'superseded')
    .map(f => giApplyOverlay(f, regulator));
  const blocking = eff.filter(f => GI_META.authority[f.authorityState!]?.blocks);
  const needApproval = eff.filter(f => f.authorityState === 'requires_approval');
  const needReview = eff.filter(f => f.authorityState === 'requires_review');
  return { blocked: blocking.length > 0, blocking, needApproval, needReview, effective: eff, openCount: eff.length };
}
