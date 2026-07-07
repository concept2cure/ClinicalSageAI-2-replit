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

export const GI_PROGRAM: GiProgram = {
  projectId: 204, code: 'BX-204', name: 'Bextrelimab',
  app: 'NDA 212345', filing: 'NDA', stage: 'Pre-submission assembly',
  indication: 'Oncology -- RTK-X solid tumors',
};

/* ── Sample findings — mapped to contradiction_findings columns ── */

export const GI_FINDINGS: GiFinding[] = [
  {
    id: 'CF-1', projectId: 204, contradictionType: 'dosage_conflict', severity: 'critical',
    title: 'Dosage mismatch between Protocol v2 and SAP v1',
    objectA: { type: 'document', id: 'PROTO-v2', label: 'Clinical Protocol v2 -- S6 Dosage' },
    objectB: { type: 'document', id: 'SAP-v1', label: 'SAP v1 -- S3 Analysis populations' },
    sourceClassification: 'structured_record_conflict', truthHierarchyLevel: 1, llmRole: 'none',
    confidenceScore: 0.98, confidenceLevel: 'high',
    description: 'Protocol specifies 10 mg/kg Q3W; the SAP exposure-response analysis assumes 8 mg/kg Q3W. The two governed records disagree on the administered dose.',
    deterministicRule: 'DOSE-XREF-01 -- administered dose must match across Protocol, SAP and CSR.',
    consequenceType: 'dossier_review_attachment', reviewState: 'unresolved', detectedBy: 'AnA',
    factId: null,
  },
  {
    id: 'CF-2', projectId: 204, contradictionType: 'assumption_drift', severity: 'medium',
    title: 'Dropout-rate assumption drift (clinical)',
    objectA: { type: 'assumption', id: 'ASM-dropout-proto', label: 'Protocol dropout -- 15%' },
    objectB: { type: 'assumption', id: 'ASM-dropout-sap', label: 'SAP dropout -- 25%' },
    sourceClassification: 'structured_record_conflict', truthHierarchyLevel: 2, llmRole: 'none',
    confidenceScore: 0.91, confidenceLevel: 'high',
    description: 'Category "dropout", domain "clinical": the Protocol assumes 15% and the SAP assumes 25%. Same category and domain, different assumed value -- a drift.',
    deterministicRule: 'DRIFT-01 -- assumptions sharing category+domain must share a value.',
    consequenceType: 'review_thread', reviewState: 'unresolved', detectedBy: 'AnA', factId: null,
  },
  {
    id: 'CF-3', projectId: 204, contradictionType: 'specification_conflict', severity: 'high',
    title: 'Moisture specification vs stability data',
    objectA: { type: 'section', id: '3.2.S.4.1', label: 'S3.2.S.4.1 Specification -- NMT 0.3% w/w' },
    objectB: { type: 'data', id: '3.2.S.7', label: 'S3.2.S.7 Stability -- 0.35% at 25C/60%RH (6 mo)' },
    sourceClassification: 'deterministic_rule_conflict', truthHierarchyLevel: 2, llmRole: 'none',
    confidenceScore: 0.95, confidenceLevel: 'high',
    description: 'Moisture spec in 3.2.S.4.1 (NMT 0.3% w/w) conflicts with 6-month stability data (3.2.S.7) showing 0.35% at 25C/60%RH. Acceptance criterion requires revision.',
    deterministicRule: 'SPEC-STAB-01 -- release/shelf spec must bound observed stability results.',
    consequenceType: 'review_thread', reviewState: 'unresolved', detectedBy: 'AnA', factId: 'shelf',
  },
  {
    id: 'CF-4', projectId: 204, contradictionType: 'batch_record_discordance', severity: 'medium',
    title: 'Batch-yield discordance -- BX204-DS-009',
    objectA: { type: 'section', id: '3.2.S.2', label: 'S3.2.S.2 Manufacture -- 68.4% yield' },
    objectB: { type: 'record', id: 'QC-BR-009', label: 'QC release batch record -- 71.2%' },
    sourceClassification: 'structured_record_conflict', truthHierarchyLevel: 3, llmRole: 'none',
    confidenceScore: 0.88, confidenceLevel: 'medium',
    description: 'Batch BX204-DS-009 yield in 3.2.S.2 (68.4%) differs from the QC release batch record (71.2%). Calculation-method inconsistency.',
    deterministicRule: 'YIELD-XREF-01 -- reported yield must reconcile with the QC batch record.',
    consequenceType: 'review_thread', reviewState: 'unresolved', detectedBy: 'AnA', factId: null,
  },
  {
    id: 'CF-5', projectId: 204, contradictionType: 'nomenclature', severity: 'low',
    title: 'Inconsistent excipient nomenclature',
    objectA: { type: 'section', id: '3.2.P.4', label: 'S3.2.P.4 -- "Polysorbate 80"' },
    objectB: { type: 'section', id: '3.2.P.5', label: 'S3.2.P.5 -- "Tween 80"' },
    sourceClassification: 'llm_assisted_semantic_conflict', truthHierarchyLevel: 4, llmRole: 'explanation_only',
    confidenceScore: 0.72, confidenceLevel: 'medium',
    description: '"Polysorbate 80" and "Tween 80" are used interchangeably across S3.2.P.4 and S3.2.P.5. Standardise to the INN.',
    deterministicRule: null, consequenceType: 'review_thread', reviewState: 'unresolved', detectedBy: 'AnA', factId: null,
  },
];

/* ── Per-segment binding ── */

const GI_BY_SEG: Record<string, GiSegmentBinding> = {
  biotech: {
    program: { projectId: 301, code: 'BX-301', name: 'anti-BCMA mAb', app: 'BLA -- 351(a)', filing: 'BLA', stage: 'Clinical -> CMC assembly', indication: 'Relapsed multiple myeloma' },
    findings: GI_FINDINGS.filter(f => f.id === 'CF-1' || f.id === 'CF-2'),
    checks: [],
  },
  pharma: {
    program: GI_PROGRAM,
    findings: GI_FINDINGS.filter(f => f.id === 'CF-3' || f.id === 'CF-4' || f.id === 'CF-5'),
    checks: [],
  },
  medtech: {
    program: { projectId: 0, code: 'Aurora CGM', name: 'Continuous glucose monitor', app: '510(k) -- eSTAR', filing: '510(k)', stage: 'Substantial-equivalence assembly', indication: 'CGM' },
    findings: [],
    checks: [
      { k: 'Accuracy (MARD)', detail: 'Subject MARD 8.2% is cited identically in S11 Substantial Equivalence, the 510(k) Summary, and the IFU.' },
      { k: 'Predicate comparison', detail: 'Predicate MARD 8.7% is consistent across the comparison table and the SE discussion.' },
      { k: 'Labeling claim', detail: 'The IFU accuracy claim matches the pivotal-study result -- no over-statement of performance.' },
    ],
  },
  diagnostics: {
    program: { projectId: 0, code: 'IVD', name: 'In-vitro diagnostic dossier', app: '510(k) for IVD -- eSTAR', filing: 'IVD 510(k)', stage: 'Performance evaluation', indication: 'IVD' },
    findings: [],
    checks: [
      { k: 'Analytical performance vs claim', detail: 'Reported analytical performance is consistent with the labeled intended-use claim.' },
      { k: 'Precision vs acceptance', detail: 'Precision and reproducibility results sit within the pre-specified acceptance criteria.' },
      { k: 'LoD / LoQ consistency', detail: 'Limit of detection and quantitation are stated consistently across the performance report and the labeling.' },
    ],
  },
};

export function giForSeg(seg: string): GiSegmentBinding {
  return GI_BY_SEG[seg] || GI_BY_SEG.pharma;
}

/* ── Assumption registry summary (test: drift origin) ── */

export const GI_ASSUMPTIONS: GiAssumption[] = [
  { id: 'ASM-1', category: 'dropout', domainTrack: 'clinical', assumedValue: '15%', status: 'active', title: 'Protocol dropout', source: 'Clinical Protocol v2 -- S9.2' },
  { id: 'ASM-2', category: 'dropout', domainTrack: 'clinical', assumedValue: '25%', status: 'active', title: 'SAP dropout', source: 'SAP v1 -- S5 Sample size' },
  { id: 'ASM-3', category: 'effect_size', domainTrack: 'clinical', assumedValue: 'ORR 38.6%', status: 'active', title: 'Primary effect size', source: 'CSR-201 -- locked dataset' },
];

/* ── Decision records (test: proposed -> approved -> executed traceability) ── */

export const GI_DECISIONS: GiDecision[] = [
  {
    id: 'DEC-1', title: 'Adopt 10 mg/kg Q3W as the governed dose', actionState: 'proposed',
    executedArtifactId: null, executedArtifactVersion: null, decidedBy: '--',
    rationale: 'Reconcile Protocol and SAP to the Protocol-specified dose; update SAP exposure-response.',
  },
  {
    id: 'DEC-2', title: 'Set governed dropout assumption to 20% (blended)', actionState: 'approved',
    executedArtifactId: null, executedArtifactVersion: null, decidedBy: 'J. Chen',
    rationale: 'Split the difference pending DSMB read; document in SAP amendment.',
  },
  {
    id: 'DEC-3', title: 'Widen moisture acceptance to NMT 0.4% w/w', actionState: 'executed',
    executedArtifactId: 42, executedArtifactVersion: 3, decidedBy: 'CMC lead',
    rationale: 'Align S3.2.S.4.1 with observed stability; justified by ICH Q6A.',
  },
];

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
