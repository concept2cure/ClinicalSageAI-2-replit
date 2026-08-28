/**
 * GMP Quality Systems & Data Integrity — Deterministic Knowledge Engine
 * ─────────────────────────────────────────────────────────────────────
 *
 * Pure, closed-form, reproducible regulatory-science engine. NO LLM, NO
 * network, NO database, NO imports from other services. Every output is a
 * deterministic function of its inputs and the citation-backed knowledge
 * tables encoded in this module and its sibling citation registry
 * (`gmp-quality-systems-citations.ts`, same service, same purity contract).
 *
 * Domain coverage:
 *   - Data integrity (ALCOA+) assessment and audit-trail review
 *   - CAPA design (root-cause method selection, correction vs CAPA)
 *   - GMP deviation classification (critical / major / minor)
 *   - API GMP expectations by manufacturing step (ICH Q7)
 *   - Sterile manufacturing contamination control (EU GMP Annex 1, 2022)
 *   - Computer system validation (GAMP 5, CSA, 21 CFR Part 11)
 *
 * Primary regulatory sources encoded here:
 *   - ICH Q7  — Good Manufacturing Practice Guide for Active Pharmaceutical
 *               Ingredients (2000, current Q&A 2015)
 *   - ICH Q9(R1) — Quality Risk Management (Step 4, 2023 revision)
 *   - ICH Q10 — Pharmaceutical Quality System (2008)
 *   - 21 CFR Part 210 — cGMP in Manufacturing, Processing, Packing, Holding
 *   - 21 CFR Part 211 — cGMP for Finished Pharmaceuticals
 *   - 21 CFR Part 11 — Electronic Records; Electronic Signatures
 *   - EU GMP Annex 1 — Manufacture of Sterile Medicinal Products (2022, in
 *               force 25 Aug 2023; lyophilizer provisions 25 Aug 2024)
 *   - EU GMP Annex 11 — Computerised Systems
 *   - FDA "Data Integrity and Compliance With Drug CGMP" Guidance (Dec 2018)
 *   - MHRA "GxP Data Integrity Guidance and Definitions" (Mar 2018)
 *   - PIC/S PI 041-1 — Good Practices for Data Management and Integrity in
 *               Regulated GMP/GDP Environments (Jul 2021)
 *   - GAMP 5 — A Risk-Based Approach to Compliant GxP Computerized Systems
 *               (Second Edition, 2022, ISPE)
 *
 * @module server/services/gmp-quality-systems/gmp-quality-systems-knowledge
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

import { cite, cites } from './gmp-quality-systems-citations.js';
import type { Citation } from './gmp-quality-systems-citations.js';

// ════════════════════════════════════════════════════════════════════════════
// SECTION 0 — SHARED TYPES & CITATION REGISTRY
// ════════════════════════════════════════════════════════════════════════════

// The `Citation` type, the central citation registry, and its `cite`/`cites`
// accessors live in the sibling module `gmp-quality-systems-citations.ts`.
// `Citation` is re-exported here so this module's public surface is unchanged.
export type { Citation } from './gmp-quality-systems-citations.js';

/** Severity / risk band used across several engines. */
export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

/** Generic recommendation with rationale and supporting citations. */
export interface Recommendation {
  recommendation: string;
  rationale: string;
  citations: Citation[];
}

/** Deterministic rounding to a fixed number of decimals. */
function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/** Clamp a number into [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — DATA INTEGRITY (ALCOA+) ASSESSMENT
// ════════════════════════════════════════════════════════════════════════════

/** The nine ALCOA+ attributes. */
export type AlcoaAttribute =
  | 'attributable'
  | 'legible'
  | 'contemporaneous'
  | 'original'
  | 'accurate'
  | 'complete'
  | 'consistent'
  | 'enduring'
  | 'available';

/** Stage of the data lifecycle per MHRA / PIC/S. */
export type DataLifecycleStage =
  | 'generation'
  | 'processing'
  | 'review'
  | 'reporting'
  | 'retention'
  | 'retrieval'
  | 'destruction';

/** How the record is captured / stored. */
export type RecordFormat = 'paper' | 'hybrid' | 'electronic';

/** Whether the electronic record is static or dynamic (FDA DI guidance Q2). */
export type RecordType = 'static' | 'dynamic';

/** Per-attribute control state supplied by the caller. */
export interface AlcoaControlState {
  /** Each user has a unique attributable identity (no shared logins). */
  uniqueUserAttribution?: boolean;
  /** Records are permanently legible / human-readable. */
  legibleAndPermanent?: boolean;
  /** Records are made at the time the activity is performed. */
  contemporaneousEntry?: boolean;
  /** Original record (or certified true copy) is retained. */
  originalOrTrueCopyRetained?: boolean;
  /** Data are accurate, error-checked, and free of unjustified edits. */
  accuracyControls?: boolean;
  /** All data including repeats, reprocessing and metadata retained. */
  completeWithMetadata?: boolean;
  /** Data are consistent across systems and chronologically ordered. */
  consistentAndSequenced?: boolean;
  /** Records are durable/enduring for the full retention period. */
  enduringMedia?: boolean;
  /** Records are retrievable/available for review and inspection. */
  readilyAvailable?: boolean;
  /** A computer-generated, secure, time-stamped audit trail exists. */
  auditTrailEnabled?: boolean;
  /** The audit trail is reviewed at a frequency matching data criticality. */
  auditTrailReviewed?: boolean;
}

export interface AssessDataIntegrityParams {
  /** Short name of the data / record being assessed. */
  dataDescription: string;
  /** Format of the record. */
  recordFormat: RecordFormat;
  /** For electronic records, static or dynamic. */
  recordType?: RecordType;
  /** Lifecycle stages in scope (defaults to the full lifecycle). */
  lifecycleStages?: DataLifecycleStage[];
  /** Whether the data directly impacts a batch-release / safety decision. */
  impactsBatchRelease?: boolean;
  /** Whether the data directly impacts patient safety. */
  impactsPatientSafety?: boolean;
  /** Control state per attribute / audit trail. */
  controls?: AlcoaControlState;
  /** GxP area (defaults to GMP). */
  gxpArea?: 'gmp' | 'glp' | 'gcp' | 'gdp' | 'gvp';
}

export interface AlcoaAttributeFinding {
  attribute: AlcoaAttribute;
  label: string;
  satisfied: boolean | 'unknown';
  expectation: string;
  gap: string | null;
  citations: Citation[];
}

export interface AuditTrailFinding {
  required: boolean;
  enabled: boolean | 'unknown';
  reviewExpectation: string;
  reviewFrequency: string;
  reviewed: boolean | 'unknown';
  gaps: string[];
  citations: Citation[];
}

export interface DataLifecycleRisk {
  stage: DataLifecycleStage;
  inherentRisk: RiskBand;
  keyControls: string[];
  citations: Citation[];
}

export interface DataIntegrityAssessment {
  dataDescription: string;
  recordFormat: RecordFormat;
  recordType: RecordType | 'n/a';
  dataCriticality: RiskBand;
  criticalityRationale: string;
  alcoaFindings: AlcoaAttributeFinding[];
  attributesSatisfied: number;
  attributesAtRisk: AlcoaAttribute[];
  auditTrail: AuditTrailFinding;
  lifecycleRisks: DataLifecycleRisk[];
  overallDataIntegrityRisk: RiskBand;
  recommendations: Recommendation[];
  citations: Citation[];
  determinismNote: string;
}

interface AlcoaSpec {
  attribute: AlcoaAttribute;
  label: string;
  expectation: string;
  controlKey: keyof AlcoaControlState;
  citationKeys: string[];
}

const ALCOA_SPECS: AlcoaSpec[] = [
  {
    attribute: 'attributable',
    label: 'Attributable',
    expectation:
      'Every record is traceable to the person who generated it and when; unique user ' +
      'accounts and no shared logins.',
    controlKey: 'uniqueUserAttribution',
    citationKeys: ['mhra_alcoa_plus', 'fda_di_shared_login', 'part11_10g'],
  },
  {
    attribute: 'legible',
    label: 'Legible',
    expectation: 'Records are readable and permanent throughout the retention period.',
    controlKey: 'legibleAndPermanent',
    citationKeys: ['mhra_alcoa_plus', 'fda_di_alcoa'],
  },
  {
    attribute: 'contemporaneous',
    label: 'Contemporaneous',
    expectation: 'Data are recorded at the time the activity is performed.',
    controlKey: 'contemporaneousEntry',
    citationKeys: ['mhra_alcoa_plus', 'fda_di_alcoa'],
  },
  {
    attribute: 'original',
    label: 'Original',
    expectation:
      'The original record, or a verified true copy, is preserved; for dynamic records the ' +
      'data are retained in dynamic form.',
    controlKey: 'originalOrTrueCopyRetained',
    citationKeys: ['mhra_alcoa_plus', 'fda_di_static_dynamic'],
  },
  {
    attribute: 'accurate',
    label: 'Accurate',
    expectation:
      'Data are correct, truthful, complete, and free from unjustified alteration; second ' +
      'checks / system controls assure accuracy.',
    controlKey: 'accuracyControls',
    citationKeys: ['mhra_alcoa_plus', 'cfr211_68'],
  },
  {
    attribute: 'complete',
    label: 'Complete (+)',
    expectation:
      'All data including repeat/reprocessed analyses, original results, and metadata are ' +
      'retained; nothing is selectively deleted.',
    controlKey: 'completeWithMetadata',
    citationKeys: ['mhra_alcoa_plus', 'cfr211_194'],
  },
  {
    attribute: 'consistent',
    label: 'Consistent (+)',
    expectation:
      'Data are consistent across all records and systems and applied in expected ' +
      'chronological sequence with date/time stamps.',
    controlKey: 'consistentAndSequenced',
    citationKeys: ['mhra_alcoa_plus', 'pics_pi041_governance'],
  },
  {
    attribute: 'enduring',
    label: 'Enduring (+)',
    expectation:
      'Records are durable and maintained on appropriate media for the entire retention ' +
      'period (not transient notes).',
    controlKey: 'enduringMedia',
    citationKeys: ['mhra_alcoa_plus', 'mhra_data_lifecycle'],
  },
  {
    attribute: 'available',
    label: 'Available (+)',
    expectation:
      'Records are accessible and retrievable for review, audit, and inspection throughout ' +
      'the lifecycle.',
    controlKey: 'readilyAvailable',
    citationKeys: ['mhra_alcoa_plus', 'annex11_audit_trail'],
  },
];

/** Inherent integrity risk per lifecycle stage, modulated by format. */
interface LifecycleRiskSpec {
  stage: DataLifecycleStage;
  baseRisk: RiskBand;
  keyControls: string[];
  citationKeys: string[];
}

const LIFECYCLE_RISK_SPECS: LifecycleRiskSpec[] = [
  {
    stage: 'generation',
    baseRisk: 'high',
    keyControls: [
      'Unique user authentication at point of capture',
      'Instrument time synchronisation and configuration lock-down',
      'Prevention of pre-dating / back-dating',
    ],
    citationKeys: ['mhra_data_lifecycle', 'cfr211_68', 'fda_di_shared_login'],
  },
  {
    stage: 'processing',
    baseRisk: 'high',
    keyControls: [
      'Audit-trailed reprocessing with reason for change',
      'Locked processing methods and integration parameters',
      'Prohibition of unofficial / "trial" injections without justification',
    ],
    citationKeys: ['fda_di_static_dynamic', 'part11_10e', 'annex11_audit_trail'],
  },
  {
    stage: 'review',
    baseRisk: 'high',
    keyControls: [
      'Second-person review of result AND audit trail',
      'Audit-trail review frequency tied to data criticality',
      'Independent quality-unit oversight',
    ],
    citationKeys: ['fda_di_audit_trail', 'cfr211_22', 'cfr211_194'],
  },
  {
    stage: 'reporting',
    baseRisk: 'medium',
    keyControls: [
      'Reports generated from validated source, not transcribed',
      'No manual override of calculated values without justification',
      'Linkage of e-signature to the reported record',
    ],
    citationKeys: ['part11_70', 'part11_50', 'cfr211_192'],
  },
  {
    stage: 'retention',
    baseRisk: 'medium',
    keyControls: [
      'Backup, restore, and archival validated',
      'Retention period defined and enforced',
      'Protection against deletion/overwrite',
    ],
    citationKeys: ['gamp5_dataintegrity', 'cfr211_180e', 'mhra_data_lifecycle'],
  },
  {
    stage: 'retrieval',
    baseRisk: 'low',
    keyControls: [
      'Readable reconstruction including metadata/audit trail',
      'Migration validation if formats change',
    ],
    citationKeys: ['annex11_audit_trail', 'mhra_data_lifecycle'],
  },
  {
    stage: 'destruction',
    baseRisk: 'low',
    keyControls: [
      'Controlled, authorised, documented destruction after retention period',
      'No premature destruction of records under investigation',
    ],
    citationKeys: ['mhra_data_lifecycle', 'pics_pi041_governance'],
  },
];

const RISK_ORDER: RiskBand[] = ['low', 'medium', 'high', 'critical'];

function riskIndex(r: RiskBand): number {
  return RISK_ORDER.indexOf(r);
}

function maxRisk(a: RiskBand, b: RiskBand): RiskBand {
  return riskIndex(a) >= riskIndex(b) ? a : b;
}

function escalateRisk(r: RiskBand, steps: number): RiskBand {
  const idx = clamp(riskIndex(r) + steps, 0, RISK_ORDER.length - 1);
  return RISK_ORDER[idx];
}

/**
 * Assess data integrity against ALCOA+, review audit-trail expectations, and
 * map inherent integrity risk across the data lifecycle.
 */
export function assessDataIntegrity(
  params: AssessDataIntegrityParams,
): DataIntegrityAssessment {
  const controls: AlcoaControlState = params.controls ?? {};
  const recordType: RecordType | 'n/a' =
    params.recordFormat === 'electronic' ? params.recordType ?? 'dynamic' : 'n/a';

  // ── Data criticality (MHRA §4) ───────────────────────────────────────────
  let criticality: RiskBand = 'low';
  const reasons: string[] = [];
  if (params.impactsPatientSafety === true) {
    criticality = maxRisk(criticality, 'critical');
    reasons.push('directly impacts patient safety');
  }
  if (params.impactsBatchRelease === true) {
    criticality = maxRisk(criticality, 'high');
    reasons.push('supports a batch-release / disposition decision');
  }
  if (reasons.length === 0) {
    criticality = 'medium';
    reasons.push(
      'no direct safety/release impact specified — treated as medium pending confirmation',
    );
  }
  // Hybrid and paper records carry higher inherent integrity risk than fully
  // validated electronic records (PIC/S PI 041 maturity model).
  if (params.recordFormat === 'hybrid') {
    reasons.push('hybrid record format increases transcription / reconciliation risk');
  } else if (params.recordFormat === 'paper') {
    reasons.push('paper record format lacks system-enforced attribution and audit trail');
  }

  // ── ALCOA+ per-attribute findings ────────────────────────────────────────
  const alcoaFindings: AlcoaAttributeFinding[] = ALCOA_SPECS.map(
    (spec: AlcoaSpec): AlcoaAttributeFinding => {
      const raw = controls[spec.controlKey];
      const satisfied: boolean | 'unknown' = raw === undefined ? 'unknown' : raw;
      const gap =
        satisfied === false
          ? `Control "${spec.label}" is not in place: ${spec.expectation}`
          : satisfied === 'unknown'
            ? `Control "${spec.label}" state not provided — verify and document.`
            : null;
      return {
        attribute: spec.attribute,
        label: spec.label,
        satisfied,
        expectation: spec.expectation,
        gap,
        citations: cites(spec.citationKeys),
      };
    },
  );

  const attributesSatisfied = alcoaFindings.filter(
    (f: AlcoaAttributeFinding): boolean => f.satisfied === true,
  ).length;
  const attributesAtRisk: AlcoaAttribute[] = alcoaFindings
    .filter((f: AlcoaAttributeFinding): boolean => f.satisfied === false)
    .map((f: AlcoaAttributeFinding): AlcoaAttribute => f.attribute);

  // ── Audit-trail review (FDA DI Q7 / Annex 11 cl.9) ───────────────────────
  const auditTrailRequired = params.recordFormat !== 'paper';
  const atEnabled: boolean | 'unknown' =
    controls.auditTrailEnabled === undefined ? 'unknown' : controls.auditTrailEnabled;
  const atReviewed: boolean | 'unknown' =
    controls.auditTrailReviewed === undefined ? 'unknown' : controls.auditTrailReviewed;
  const reviewFrequency =
    criticality === 'critical' || criticality === 'high'
      ? 'With each record and prior to final approval (e.g. at batch release)'
      : 'Periodic review on a risk-based frequency defined in procedure';
  const atGaps: string[] = [];
  if (auditTrailRequired && atEnabled === false) {
    atGaps.push(
      'No secure, computer-generated, time-stamped audit trail — required for electronic ' +
        'CGMP records (21 CFR Part 11 §11.10(e); EU GMP Annex 11 cl.9).',
    );
  }
  if (auditTrailRequired && atEnabled === 'unknown') {
    atGaps.push('Audit-trail capability not confirmed — verify configuration.');
  }
  if (auditTrailRequired && atReviewed === false) {
    atGaps.push(
      'Audit trail not reviewed at a frequency matching data criticality (FDA DI Q7).',
    );
  }

  const auditTrail: AuditTrailFinding = {
    required: auditTrailRequired,
    enabled: auditTrailRequired ? atEnabled : false,
    reviewExpectation:
      'Audit trails capturing changes to critical data should be reviewed with the record ' +
      'and before final approval; routine review frequency is based on data criticality.',
    reviewFrequency,
    reviewed: atReviewed,
    gaps: atGaps,
    citations: cites(['fda_di_audit_trail', 'part11_10e', 'annex11_audit_trail']),
  };

  // ── Lifecycle risk mapping ───────────────────────────────────────────────
  const stagesInScope: DataLifecycleStage[] =
    params.lifecycleStages ??
    LIFECYCLE_RISK_SPECS.map((s: LifecycleRiskSpec): DataLifecycleStage => s.stage);

  const lifecycleRisks: DataLifecycleRisk[] = LIFECYCLE_RISK_SPECS.filter(
    (s: LifecycleRiskSpec): boolean => stagesInScope.includes(s.stage),
  ).map((s: LifecycleRiskSpec): DataLifecycleRisk => {
    let risk = s.baseRisk;
    if (params.recordFormat === 'paper' || params.recordFormat === 'hybrid') {
      risk = escalateRisk(risk, 1);
    }
    if (criticality === 'critical') {
      risk = escalateRisk(risk, 1);
    }
    return {
      stage: s.stage,
      inherentRisk: risk,
      keyControls: s.keyControls,
      citations: cites(s.citationKeys),
    };
  });

  // ── Overall data integrity risk ──────────────────────────────────────────
  let overall: RiskBand = criticality;
  if (attributesAtRisk.length > 0) {
    overall = escalateRisk(overall, attributesAtRisk.length >= 3 ? 2 : 1);
  }
  if (atGaps.length > 0) {
    overall = escalateRisk(overall, 1);
  }
  overall = clampRisk(overall);

  // ── Recommendations ──────────────────────────────────────────────────────
  const recommendations: Recommendation[] = [];
  if (attributesAtRisk.length > 0) {
    recommendations.push({
      recommendation:
        'Remediate failing ALCOA+ attributes: ' + attributesAtRisk.join(', ') + '.',
      rationale:
        'Each failing attribute is a data-integrity deficiency that can invalidate the ' +
        'record and any decision it supports.',
      citations: cites(['mhra_alcoa_plus', 'fda_di_alcoa']),
    });
  }
  if (params.recordFormat === 'hybrid') {
    recommendations.push({
      recommendation:
        'Define which record (paper or electronic) is the raw/original record, and control ' +
        'reconciliation between them; plan migration to a fully electronic, audit-trailed system.',
      rationale:
        'Hybrid systems are higher-risk because attribution and audit trail may live in ' +
        'different places; raw data must be unambiguously defined.',
      citations: cites(['pics_pi041_maturity', 'fda_di_static_dynamic']),
    });
  }
  if (auditTrailRequired && (atEnabled !== true || atReviewed !== true)) {
    recommendations.push({
      recommendation:
        'Enable and routinely review the audit trail; for critical data review it with each ' +
        'record and before batch release.',
      rationale:
        'Audit-trail review is the principal detective control for unauthorised or ' +
        'unjustified changes to critical GMP data.',
      citations: cites(['fda_di_audit_trail', 'annex11_audit_trail']),
    });
  }
  recommendations.push({
    recommendation:
      'Document data ownership and controls across the full data lifecycle within the data ' +
      'governance system, scaling controls to data criticality.',
    rationale:
      'A data governance system commensurate with QRM is the expected framework for ' +
      'sustained data integrity.',
    citations: cites(['pics_pi041_governance', 'mhra_data_lifecycle', 'q9_principles']),
  });

  return {
    dataDescription: params.dataDescription,
    recordFormat: params.recordFormat,
    recordType,
    dataCriticality: criticality,
    criticalityRationale: reasons.join('; ') + '.',
    alcoaFindings,
    attributesSatisfied,
    attributesAtRisk,
    auditTrail,
    lifecycleRisks,
    overallDataIntegrityRisk: overall,
    recommendations,
    citations: cites([
      'fda_di_alcoa',
      'mhra_alcoa_plus',
      'mhra_data_criticality',
      'pics_pi041_governance',
      'part11_10e',
      'annex11_audit_trail',
    ]),
    determinismNote:
      'Deterministic ALCOA+ / data-integrity assessment. Identical inputs yield identical ' +
      'output. Citations are paraphrased from the named sources and must be reported verbatim.',
  };
}

function clampRisk(r: RiskBand): RiskBand {
  return RISK_ORDER[clamp(riskIndex(r), 0, RISK_ORDER.length - 1)];
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — CAPA DESIGN (ICH Q10)
// ════════════════════════════════════════════════════════════════════════════

export type CapaSourceType =
  | 'deviation'
  | 'complaint'
  | 'oos'
  | 'recall'
  | 'audit_finding'
  | 'inspection_observation'
  | 'nonconformance'
  | 'trend'
  | 'change'
  | 'near_miss';

export type RootCauseMethod = '5-whys' | 'ishikawa' | 'fmea' | 'fault-tree' | 'is-is-not';

export type CapaActionType = 'correction' | 'corrective' | 'preventive';

export interface DesignCapaParams {
  /** Concise description of the problem / event. */
  problemDescription: string;
  /** Source / trigger of the CAPA. */
  source: CapaSourceType;
  /** Risk to product quality / patient (drives formality & timeline). */
  severity?: RiskBand;
  /** Whether the issue is recurring (recurrence escalates to preventive focus). */
  recurring?: boolean;
  /** Number of contributing factors believed to be involved. */
  contributingFactorCount?: number;
  /** Whether the failure is systemic (process/system) vs isolated (single event). */
  systemic?: boolean;
  /** Whether distributed product is potentially affected. */
  productImpact?: boolean;
  /** Optional caller-suggested root-cause method (overrides default selection). */
  preferredRootCauseMethod?: RootCauseMethod;
}

export interface CapaAction {
  type: CapaActionType;
  description: string;
  intent: string;
  citations: Citation[];
}

export interface RootCausePlan {
  method: RootCauseMethod;
  methodLabel: string;
  whenToUse: string;
  steps: string[];
  citations: Citation[];
}

export interface EffectivenessCheck {
  metric: string;
  method: string;
  timing: string;
  acceptanceCriterion: string;
}

export interface CapaPlan {
  problemStatement: string;
  source: CapaSourceType;
  severity: RiskBand;
  formality: 'streamlined' | 'standard' | 'formal';
  qrmFormalityRationale: string;
  rootCause: RootCausePlan;
  alternativeRootCauseMethods: RootCauseMethod[];
  actions: CapaAction[];
  effectivenessChecks: EffectivenessCheck[];
  recommendedTargetDays: number;
  closureConditions: string[];
  citations: Citation[];
  determinismNote: string;
}

interface RootCauseSpec {
  method: RootCauseMethod;
  label: string;
  whenToUse: string;
  steps: string[];
  citationKeys: string[];
}

const ROOT_CAUSE_SPECS: RootCauseSpec[] = [
  {
    method: '5-whys',
    label: '5 Whys',
    whenToUse:
      'Single, relatively simple problem with a likely linear causal chain and a small ' +
      'number of contributing factors.',
    steps: [
      'State the problem precisely (what, where, when, magnitude).',
      'Ask "why did this happen?" and record the immediate cause.',
      'Iterate "why?" on each answer until a controllable systemic cause is reached.',
      'Validate each cause against objective evidence (records, audit trail, samples).',
      'Confirm the terminal cause is actionable and would prevent recurrence if corrected.',
    ],
    citationKeys: ['q10_capa', 'q9_principles'],
  },
  {
    method: 'ishikawa',
    label: 'Ishikawa (fishbone) / cause-and-effect',
    whenToUse:
      'Multiple plausible contributing factors across categories (Man, Machine, Method, ' +
      'Material, Measurement, Environment) needing structured brainstorming.',
    steps: [
      'Define the effect (problem) at the head of the diagram.',
      'Enumerate categories (6M): Man, Machine, Method, Material, Measurement, Mother-nature/Environment.',
      'Brainstorm potential causes under each category with a cross-functional team.',
      'Prioritise candidate causes by likelihood and evidence.',
      'Test the highest-priority causes empirically before assigning root cause.',
    ],
    citationKeys: ['q10_capa', 'q9_tools', 'q9_subjectivity'],
  },
  {
    method: 'fmea',
    label: 'FMEA / FMECA',
    whenToUse:
      'Systemic or complex failures, or where you must rank multiple failure modes by ' +
      'Severity × Occurrence × Detectability (RPN) to prioritise actions.',
    steps: [
      'Map the process and list failure modes for each step.',
      'For each mode, assess Severity, Occurrence, and Detectability on defined scales.',
      'Compute Risk Priority Number (RPN = S × O × D) or use a risk matrix.',
      'Prioritise mitigation for high-RPN / high-severity modes.',
      'Re-score residual risk after corrective/preventive actions to confirm reduction.',
    ],
    citationKeys: ['q9_tools', 'q9_formality', 'q10_capa'],
  },
  {
    method: 'fault-tree',
    label: 'Fault Tree Analysis (FTA)',
    whenToUse:
      'A single high-severity top event with combinations of contributing conditions ' +
      '(AND/OR logic), e.g. a sterility failure or critical equipment failure.',
    steps: [
      'Define the undesired top event precisely.',
      'Deductively decompose into contributing events using AND/OR gates.',
      'Identify minimal cut sets (combinations sufficient to cause the top event).',
      'Assess and address the most credible cut sets.',
      'Verify barriers/defences for each cut set after remediation.',
    ],
    citationKeys: ['q9_tools', 'q9_formality'],
  },
  {
    method: 'is-is-not',
    label: 'Is / Is-Not (Kepner-Tregoe problem analysis)',
    whenToUse:
      'Sporadic problems where bounding what IS and IS-NOT affected sharpens the search ' +
      'for distinguishing change/cause.',
    steps: [
      'Specify the deviation along What, Where, When, Extent dimensions.',
      'For each dimension, record what IS and what could be but IS-NOT affected.',
      'Identify distinctions and recent changes between IS and IS-NOT.',
      'Develop and test the most probable cause against the specification.',
      'Confirm the cause explains all the IS and none of the IS-NOT observations.',
    ],
    citationKeys: ['q10_capa', 'q9_principles'],
  },
];

function selectRootCauseMethod(params: DesignCapaParams): RootCauseMethod {
  if (params.preferredRootCauseMethod !== undefined) {
    return params.preferredRootCauseMethod;
  }
  const factors = params.contributingFactorCount ?? (params.systemic === true ? 4 : 1);
  const highSeverity = params.severity === 'high' || params.severity === 'critical';
  if (params.systemic === true || params.recurring === true || factors >= 4) {
    return 'fmea';
  }
  if (highSeverity && (params.source === 'recall' || params.source === 'oos')) {
    return 'fault-tree';
  }
  if (factors >= 2) {
    return 'ishikawa';
  }
  return '5-whys';
}

/**
 * Design a CAPA plan: problem statement, root-cause method selection,
 * correction/corrective/preventive actions, and effectiveness checks per ICH Q10.
 */
export function designCAPA(params: DesignCapaParams): CapaPlan {
  const severity: RiskBand = params.severity ?? (params.productImpact === true ? 'high' : 'medium');

  // QRM-proportionate formality (ICH Q9(R1) §5.2)
  const formality: 'streamlined' | 'standard' | 'formal' =
    severity === 'critical' || severity === 'high' || params.systemic === true
      ? 'formal'
      : severity === 'medium'
        ? 'standard'
        : 'streamlined';

  const method = selectRootCauseMethod(params);
  const spec =
    ROOT_CAUSE_SPECS.find((s: RootCauseSpec): boolean => s.method === method) ??
    ROOT_CAUSE_SPECS[0];

  const rootCause: RootCausePlan = {
    method: spec.method,
    methodLabel: spec.label,
    whenToUse: spec.whenToUse,
    steps: spec.steps,
    citations: cites(spec.citationKeys),
  };

  const alternativeRootCauseMethods: RootCauseMethod[] = ROOT_CAUSE_SPECS.filter(
    (s: RootCauseSpec): boolean => s.method !== method,
  ).map((s: RootCauseSpec): RootCauseMethod => s.method);

  // Build problem statement (objective, measurable, no embedded cause/solution)
  const problemStatement =
    `Problem: ${params.problemDescription} (source: ${params.source}). ` +
    `Severity assessed as ${severity}` +
    (params.recurring === true ? '; event is RECURRING' : '') +
    (params.systemic === true ? '; failure appears SYSTEMIC' : '; failure appears isolated') +
    (params.productImpact === true
      ? '; potential impact to distributed/in-process product.'
      : '; no product impact identified at this stage.');

  // Actions: correction (immediate), corrective (eliminate root cause),
  // preventive (prevent occurrence elsewhere). ICH Q10 §3.2.2.
  const actions: CapaAction[] = [
    {
      type: 'correction',
      description:
        'Immediate fix / containment of the specific nonconformity (e.g. correct the record, ' +
        'quarantine/segregate affected material, stop the affected operation).',
      intent: 'Remedy the immediate problem; does NOT address the underlying cause.',
      citations: cites(['q10_capa', 'cfr211_100']),
    },
    {
      type: 'corrective',
      description:
        'Action to eliminate the identified ROOT CAUSE so the specific problem does not ' +
        'recur (e.g. revise procedure, re-train, engineering change, system reconfiguration).',
      intent: 'Prevent recurrence of THIS problem by removing its cause.',
      citations: cites(['q10_capa', 'q10_effectiveness']),
    },
    {
      type: 'preventive',
      description:
        'Action to prevent occurrence of a potential or similar problem elsewhere ' +
        '(e.g. extend the fix to analogous processes/lines/products; update risk assessments).',
      intent: 'Prevent occurrence of similar problems that have not yet happened.',
      citations: cites(['q10_capa', 'q10_change_mgmt']),
    },
  ];

  // Effectiveness checks (ICH Q10 — actions not closed until effectiveness confirmed)
  const effectivenessChecks: EffectivenessCheck[] = [
    {
      metric: 'Recurrence of the same deviation/nonconformity',
      method: 'Trend review of the relevant event category after implementation.',
      timing:
        formality === 'formal'
          ? 'Review at 3 and 6 months post-implementation.'
          : 'Review at the next periodic trend review (within ~3 months).',
      acceptanceCriterion: 'Zero recurrences of the same root-caused failure in the review window.',
    },
    {
      metric: 'Compliance with the revised control (procedure / system change)',
      method: 'Targeted audit / monitoring of the changed step and training records.',
      timing: 'Within one production cycle of implementation.',
      acceptanceCriterion: 'Documented adherence; training completed and verified for affected staff.',
    },
  ];
  if (params.systemic === true || params.recurring === true) {
    effectivenessChecks.push({
      metric: 'Effectiveness of preventive action across analogous areas',
      method: 'Verification that the change was deployed to all identified similar processes.',
      timing: 'At 6 months post-implementation.',
      acceptanceCriterion: 'All analogous processes updated; no related events in similar areas.',
    });
  }

  // Recommended timeline (commensurate with risk)
  const recommendedTargetDays =
    severity === 'critical' ? 30 : severity === 'high' ? 45 : severity === 'medium' ? 60 : 90;

  const closureConditions: string[] = [
    'Root cause identified and supported by objective evidence.',
    'All correction, corrective and preventive actions implemented and documented.',
    'Effectiveness checks completed and acceptance criteria met.',
    'Quality unit review and approval of CAPA closure.',
  ];

  return {
    problemStatement,
    source: params.source,
    severity,
    formality,
    qrmFormalityRationale:
      'Formality, effort and documentation are scaled to risk per ICH Q9(R1): ' +
      `severity=${severity}` +
      (params.systemic === true ? ', systemic failure' : '') +
      (params.recurring === true ? ', recurring' : '') +
      ` → ${formality} CAPA.`,
    rootCause,
    alternativeRootCauseMethods,
    actions,
    effectivenessChecks,
    recommendedTargetDays,
    closureConditions,
    citations: cites([
      'q10_capa',
      'q10_effectiveness',
      'q10_change_mgmt',
      'q9_formality',
      'cfr211_192',
    ]),
    determinismNote:
      'Deterministic CAPA design. Identical inputs yield identical output. Root-cause method ' +
      'is selected by rule, not by an LLM. Citations must be reported verbatim.',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3 — GMP DEVIATION CLASSIFICATION
// ════════════════════════════════════════════════════════════════════════════

export type DeviationClass = 'critical' | 'major' | 'minor';

export type DeviationArea =
  | 'sterility_assurance'
  | 'cross_contamination'
  | 'mix_up_mislabeling'
  | 'specification_failure'
  | 'process_parameter'
  | 'documentation'
  | 'environmental_monitoring'
  | 'equipment'
  | 'utilities'
  | 'training'
  | 'other';

export interface ClassifyDeviationParams {
  /** Description of the deviation event. */
  description: string;
  /** Functional area of the deviation. */
  area: DeviationArea;
  /** Whether the affected batch has been distributed. */
  batchDistributed?: boolean;
  /** Whether the product is sterile / parenteral. */
  sterileProduct?: boolean;
  /** Whether a specification (CQA) was confirmed out of limits. */
  outOfSpecConfirmed?: boolean;
  /** Whether there is potential patient-safety impact. */
  patientSafetyImpact?: boolean;
  /** Whether the deviation is recurring. */
  recurring?: boolean;
  /** Whether the affected product is marketed in the US (field-alert relevance). */
  usMarketed?: boolean;
  /** Number of batches potentially affected. */
  batchesAffected?: number;
}

export interface ProductImpactAssessment {
  potentiallyImpacted: boolean;
  rationale: string;
  dispositionGuidance: string;
  citations: Citation[];
}

export interface RegulatoryReportingTrigger {
  fieldAlertReportEvaluation: boolean;
  fieldAlertRationale: string;
  recallEvaluation: boolean;
  recallRationale: string;
  citations: Citation[];
}

export interface DeviationClassification {
  description: string;
  area: DeviationArea;
  classification: DeviationClass;
  classificationRationale: string;
  initialResponseHours: number;
  investigationTargetDays: number;
  productImpact: ProductImpactAssessment;
  reporting: RegulatoryReportingTrigger;
  requiresCapa: boolean;
  qualityUnitDispositionRequired: boolean;
  citations: Citation[];
  determinismNote: string;
}

interface DeviationAreaSpec {
  area: DeviationArea;
  /** Baseline class for this area absent escalation. */
  baseClass: DeviationClass;
  /** Whether this area inherently touches sterility/safety. */
  safetyCritical: boolean;
}

const DEVIATION_AREA_SPECS: DeviationAreaSpec[] = [
  { area: 'sterility_assurance', baseClass: 'critical', safetyCritical: true },
  { area: 'cross_contamination', baseClass: 'critical', safetyCritical: true },
  { area: 'mix_up_mislabeling', baseClass: 'critical', safetyCritical: true },
  { area: 'specification_failure', baseClass: 'major', safetyCritical: false },
  { area: 'process_parameter', baseClass: 'major', safetyCritical: false },
  { area: 'environmental_monitoring', baseClass: 'major', safetyCritical: false },
  { area: 'equipment', baseClass: 'major', safetyCritical: false },
  { area: 'utilities', baseClass: 'major', safetyCritical: false },
  { area: 'documentation', baseClass: 'minor', safetyCritical: false },
  { area: 'training', baseClass: 'minor', safetyCritical: false },
  { area: 'other', baseClass: 'minor', safetyCritical: false },
];

const CLASS_ORDER: DeviationClass[] = ['minor', 'major', 'critical'];

function classIndex(c: DeviationClass): number {
  return CLASS_ORDER.indexOf(c);
}

function escalateClass(c: DeviationClass, steps: number): DeviationClass {
  return CLASS_ORDER[clamp(classIndex(c) + steps, 0, CLASS_ORDER.length - 1)];
}

function maxClass(a: DeviationClass, b: DeviationClass): DeviationClass {
  return classIndex(a) >= classIndex(b) ? a : b;
}

/**
 * Classify a GMP deviation (critical / major / minor), assign a handling
 * timeline, assess product impact, and determine whether a field alert /
 * recall evaluation is triggered.
 */
export function classifyGMPDeviation(
  params: ClassifyDeviationParams,
): DeviationClassification {
  const areaSpec =
    DEVIATION_AREA_SPECS.find((s: DeviationAreaSpec): boolean => s.area === params.area) ??
    DEVIATION_AREA_SPECS[DEVIATION_AREA_SPECS.length - 1];

  let classification: DeviationClass = areaSpec.baseClass;
  const rationale: string[] = [`Area "${params.area}" baseline classification: ${areaSpec.baseClass}.`];

  if (params.patientSafetyImpact === true) {
    classification = maxClass(classification, 'critical');
    rationale.push('Potential patient-safety impact → critical.');
  }
  if (params.outOfSpecConfirmed === true) {
    classification = maxClass(classification, 'major');
    rationale.push('Confirmed out-of-specification of a quality attribute → at least major.');
  }
  if (params.sterileProduct === true && areaSpec.safetyCritical) {
    classification = maxClass(classification, 'critical');
    rationale.push('Sterile product with safety-critical area → critical.');
  }
  if (params.recurring === true) {
    classification = escalateClass(classification, 1);
    rationale.push('Recurring deviation escalated one class.');
  }
  if (params.batchDistributed === true && classification === 'critical') {
    rationale.push('Affected batch already distributed — heightens urgency of disposition.');
  }
  classification = clampClass(classification);

  // Handling timeline
  const initialResponseHours =
    classification === 'critical' ? 24 : classification === 'major' ? 48 : 72;
  const investigationTargetDays =
    classification === 'critical' ? 30 : classification === 'major' ? 30 : 30;
  // Note: 21 CFR 211.192 investigations are generally expected to close within 30 days,
  // with documented justification/extension for complex critical investigations.

  // Product impact
  const potentiallyImpacted =
    params.outOfSpecConfirmed === true ||
    params.patientSafetyImpact === true ||
    classification === 'critical' ||
    (params.sterileProduct === true && areaSpec.safetyCritical);
  const productImpact: ProductImpactAssessment = {
    potentiallyImpacted,
    rationale: potentiallyImpacted
      ? 'Deviation may affect a CQA / safety of the affected batch(es); a documented product ' +
        'impact assessment and disposition by the quality unit is required.'
      : 'No direct CQA / safety impact identified; document the rationale and trend the event.',
    dispositionGuidance: potentiallyImpacted
      ? 'Quarantine affected and associated batches pending investigation; the quality unit ' +
        'must approve or reject based on the completed investigation (21 CFR 211.192).'
      : 'Batch may proceed subject to routine release controls; record the justified deviation.',
    citations: cites(['cfr211_192', 'cfr211_22', 'cfr211_100']),
  };

  // Reporting triggers
  const usMarketed = params.usMarketed !== false; // default to true (conservative)
  const fieldAlert =
    usMarketed &&
    (params.batchDistributed === true || params.outOfSpecConfirmed === true) &&
    (classification === 'critical' ||
      params.outOfSpecConfirmed === true ||
      params.patientSafetyImpact === true);
  const recall =
    (params.batchDistributed === true && classification === 'critical') ||
    params.patientSafetyImpact === true;

  const reporting: RegulatoryReportingTrigger = {
    fieldAlertReportEvaluation: fieldAlert,
    fieldAlertRationale: fieldAlert
      ? 'A distributed batch with a confirmed/potential quality or safety problem triggers ' +
        'evaluation of a Field Alert Report for an NDA/ANDA product (21 CFR 314.81(b)(1)) — ' +
        'submit within 3 working days of becoming aware if criteria are met.'
      : 'Field Alert Report not triggered on the current information (not distributed and/or no ' +
        'confirmed quality defect); reassess if new information emerges.',
    recallEvaluation: recall,
    recallRationale: recall
      ? 'A distributed, critically deviating or safety-impacting batch requires a documented ' +
        'recall (health-hazard) evaluation; classify and notify per the recall procedure / FDA ' +
        '21 CFR Part 7 if a recall is warranted.'
      : 'Recall evaluation not triggered on the current information; document the rationale.',
    citations: cites(['cfr211_198', 'cfr211_192', 'q10_capa']),
  };

  const requiresCapa = classification === 'critical' || classification === 'major' || params.recurring === true;

  return {
    description: params.description,
    area: params.area,
    classification,
    classificationRationale: rationale.join(' '),
    initialResponseHours,
    investigationTargetDays,
    productImpact,
    reporting,
    requiresCapa,
    qualityUnitDispositionRequired: potentiallyImpacted || classification !== 'minor',
    citations: cites([
      'cfr211_100',
      'cfr211_192',
      'cfr211_22',
      'q10_capa',
      'q9_formality',
    ]),
    determinismNote:
      'Deterministic deviation classification. Identical inputs yield identical output. ' +
      'Field-alert and recall triggers are conservative rule-based evaluations, not legal ' +
      'determinations; confirm against your procedures and the applicable regulation.',
  };
}

function clampClass(c: DeviationClass): DeviationClass {
  return CLASS_ORDER[clamp(classIndex(c), 0, CLASS_ORDER.length - 1)];
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4 — API GMP EXPECTATIONS BY STEP (ICH Q7)
// ════════════════════════════════════════════════════════════════════════════

export type ApiStepType =
  | 'starting_material_production'
  | 'starting_material_introduction'
  | 'intermediate_production'
  | 'isolation_purification'
  | 'final_api'
  | 'physical_processing_packaging';

export interface AssessApiGmpParams {
  /** Manufacturing step under assessment. */
  step: ApiStepType;
  /** Name of the API / intermediate (optional, for context). */
  apiName?: string;
  /** Whether the step is identified as a critical process step. */
  isCriticalStep?: boolean;
  /** Whether the API is sterile (additional Annex 1 / Q7 §18 considerations). */
  sterileApi?: boolean;
  /** Whether the change being evaluated is significant (drives change control). */
  changeIsSignificant?: boolean;
}

export interface GmpStringencyProfile {
  step: ApiStepType;
  stepLabel: string;
  gmpStringency: 'minimal_gmp' | 'partial_gmp' | 'full_gmp' | 'full_gmp_enhanced';
  stringencyLevel: number; // 1..4 increasing
  expectation: string;
  citations: Citation[];
}

export interface ProcessControlExpectation {
  control: string;
  expectation: string;
  citations: Citation[];
}

export interface ChangeControlGuidance {
  classification: 'significant' | 'minor';
  requiresRevalidation: boolean;
  requiresRegulatoryNotification: boolean;
  steps: string[];
  citations: Citation[];
}

export interface ApiGmpAssessment {
  step: ApiStepType;
  apiName: string | null;
  stringency: GmpStringencyProfile;
  increasingStringencyPrinciple: string;
  criticalProcessControls: ProcessControlExpectation[];
  changeControl: ChangeControlGuidance;
  qualityUnitExpectation: string;
  citations: Citation[];
  determinismNote: string;
}

interface ApiStepSpec {
  step: ApiStepType;
  label: string;
  stringency: 'minimal_gmp' | 'partial_gmp' | 'full_gmp' | 'full_gmp_enhanced';
  level: number;
  expectation: string;
}

const API_STEP_SPECS: ApiStepSpec[] = [
  {
    step: 'starting_material_production',
    label: 'Production of API starting material',
    stringency: 'minimal_gmp',
    level: 1,
    expectation:
      'Steps before introduction of the defined API starting material are generally outside ' +
      'the full scope of ICH Q7; appropriate GMP controls and good science apply, but the ' +
      'full Q7 expectations begin at starting-material introduction.',
  },
  {
    step: 'starting_material_introduction',
    label: 'Introduction of API starting material into process',
    stringency: 'partial_gmp',
    level: 2,
    expectation:
      'This is the point at which full GMP coverage under ICH Q7 begins. The API starting ' +
      'material should be defined, its quality controlled, and its introduction documented.',
  },
  {
    step: 'intermediate_production',
    label: 'Production of intermediate(s)',
    stringency: 'full_gmp',
    level: 3,
    expectation:
      'GMP applies with increasing stringency: defined process controls, in-process testing, ' +
      'documented batch records, and quality-unit oversight of intermediates.',
  },
  {
    step: 'isolation_purification',
    label: 'Isolation and purification',
    stringency: 'full_gmp',
    level: 3,
    expectation:
      'Increasing GMP rigor for steps that determine impurity profiles; critical parameters ' +
      'and in-process controls should be validated and monitored.',
  },
  {
    step: 'final_api',
    label: 'Production of final API (final isolation/purification)',
    stringency: 'full_gmp_enhanced',
    level: 4,
    expectation:
      'Highest GMP stringency. Full process validation of critical steps, complete batch ' +
      'records, release testing against the API specification, and stability support are ' +
      'expected before the API is released.',
  },
  {
    step: 'physical_processing_packaging',
    label: 'Physical processing and packaging of API',
    stringency: 'full_gmp_enhanced',
    level: 4,
    expectation:
      'Full GMP stringency for milling/micronisation/blending and packaging that can affect ' +
      'API quality (e.g. particle size); controls to prevent mix-ups, contamination, and ' +
      'labelling errors.',
  },
];

/**
 * Assess ICH Q7 GMP expectations for an API manufacturing step, applying the
 * increasing-stringency principle and providing critical-process-control and
 * change-control guidance.
 */
export function assessAPIGMP(params: AssessApiGmpParams): ApiGmpAssessment {
  const spec =
    API_STEP_SPECS.find((s: ApiStepSpec): boolean => s.step === params.step) ??
    API_STEP_SPECS[0];

  let level = spec.level;
  let stringency = spec.stringency;
  let expectation = spec.expectation;
  if (params.isCriticalStep === true && level < 4) {
    level = clamp(level + 1, 1, 4);
    stringency = level >= 4 ? 'full_gmp_enhanced' : 'full_gmp';
    expectation +=
      ' This step is identified as a CRITICAL process step, warranting enhanced control, ' +
      'tighter in-process limits, and validation emphasis.';
  }
  if (params.sterileApi === true) {
    expectation +=
      ' For a sterile API, additional ICH Q7 §18 / Annex 1 contamination-control and ' +
      'sterility-assurance expectations apply to the relevant steps.';
  }

  const stringencyProfile: GmpStringencyProfile = {
    step: spec.step,
    stepLabel: spec.label,
    gmpStringency: stringency,
    stringencyLevel: level,
    expectation,
    citations: cites(['q7_intro_gmp_increases', 'q7_table1']),
  };

  // Critical process controls scale with stringency level.
  const criticalProcessControls: ProcessControlExpectation[] = [];
  criticalProcessControls.push({
    control: 'Definition of API starting material',
    expectation:
      'Clearly define and justify the API starting material; full GMP begins at its introduction.',
    citations: cites(['q7_intro_gmp_increases', 'q7_table1']),
  });
  if (level >= 3) {
    criticalProcessControls.push(
      {
        control: 'Critical process parameters (CPPs) & in-process controls (IPCs)',
        expectation:
          'Identify, monitor, and control critical process parameters and in-process controls; ' +
          'establish limits from development and historical data.',
        citations: cites(['q7_critical_steps', 'q7_process_validation']),
      },
      {
        control: 'Process validation of critical steps',
        expectation:
          'Validate that the process operated within established parameters consistently yields ' +
          'material meeting predetermined quality attributes.',
        citations: cites(['q7_process_validation']),
      },
      {
        control: 'Impurity / carryover control',
        expectation:
          'Control and monitor the impurity profile across isolation/purification; assess ' +
          'carryover and cleaning between campaigns.',
        citations: cites(['q7_critical_steps', 'q7_quality_unit']),
      },
    );
  }
  if (level >= 4) {
    criticalProcessControls.push(
      {
        control: 'Release testing against API specification',
        expectation:
          'Test the final API against its specification (identity, assay, impurities, etc.) and ' +
          'release only by the independent quality unit.',
        citations: cites(['q7_quality_unit', 'cfr211_165']),
      },
      {
        control: 'Stability support',
        expectation:
          'Establish a stability programme to support retest/expiry dates for the released API.',
        citations: cites(['q7_quality_unit']),
      },
    );
  }

  // Change control
  const significant =
    params.changeIsSignificant === true || params.isCriticalStep === true || level >= 4;
  const changeControl: ChangeControlGuidance = {
    classification: significant ? 'significant' : 'minor',
    requiresRevalidation: significant,
    requiresRegulatoryNotification: significant,
    steps: [
      'Initiate a formal change control and define the change, scope, and justification.',
      'Assess impact on product quality and the control strategy using quality risk management.',
      'Classify the change (minor vs significant) and determine revalidation needs.',
      significant
        ? 'For significant changes affecting registered details, evaluate regulatory ' +
          'notification/approval before implementation.'
        : 'For minor changes, document the assessment; regulatory notification may not be required.',
      'Quality-unit review and approval before implementation; verify effectiveness afterwards.',
    ],
    citations: cites(['q7_change_control', 'q10_change_mgmt', 'q9_formality']),
  };

  return {
    step: params.step,
    apiName: params.apiName ?? null,
    stringency: stringencyProfile,
    increasingStringencyPrinciple:
      'ICH Q7 applies GMP with increasing stringency from early intermediate steps toward the ' +
      'final API and packaging; full GMP begins at introduction of the API starting material ' +
      'and the highest rigor applies to the final isolation/purification and packaging steps.',
    criticalProcessControls,
    changeControl,
    qualityUnitExpectation:
      'An independent quality unit reviews and approves quality-related documents and ' +
      'releases/rejects intermediates and APIs (ICH Q7 §2.2).',
    citations: cites([
      'q7_intro_gmp_increases',
      'q7_table1',
      'q7_critical_steps',
      'q7_process_validation',
      'q7_change_control',
      'q7_quality_unit',
    ]),
    determinismNote:
      'Deterministic ICH Q7 step assessment. Identical inputs yield identical output. ' +
      'Citations must be reported verbatim.',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5 — STERILE CONTAMINATION CONTROL (EU GMP ANNEX 1, 2022)
// ════════════════════════════════════════════════════════════════════════════

export type SterilisationApproach =
  | 'terminal_moist_heat'
  | 'terminal_other'
  | 'sterile_filtration_aseptic'
  | 'aseptic_processing';

export type AsepticBarrier = 'open_cleanroom' | 'rabs' | 'isolator';

export interface DesignSterileControlsParams {
  /** Product / process description. */
  productDescription: string;
  /** Whether the product can withstand terminal moist-heat sterilisation. */
  heatStable?: boolean;
  /** Whether the product can be sterile filtered (0.22 µm). */
  filterable?: boolean;
  /** Barrier technology in use / planned. */
  barrier?: AsepticBarrier;
  /** Whether lyophilisation (freeze-drying) is part of the process. */
  lyophilised?: boolean;
  /** Annual number of aseptic filling lines/shifts (context for APS scheduling). */
  fillingLines?: number;
  /** Number of operators requiring qualification (context for APS). */
  operatorCount?: number;
}

export interface CleanroomGrade {
  grade: 'A' | 'B' | 'C' | 'D';
  use: string;
  particleAtRest: string;
  particleInOperation: string;
  microbialExpectation: string;
  citations: Citation[];
}

export interface EnvironmentalMonitoringPlan {
  element: string;
  expectation: string;
  citations: Citation[];
}

export interface MediaFillPlan {
  target: string;
  frequency: string;
  scope: string;
  acceptanceCriteria: string;
  citations: Citation[];
}

export interface SterilisationDecision {
  selectedApproach: SterilisationApproach;
  approachLabel: string;
  rationale: string;
  sterilityAssuranceLevel: string;
  citations: Citation[];
}

export interface SterileControlStrategy {
  productDescription: string;
  contaminationControlStrategySummary: string;
  sterilisation: SterilisationDecision;
  grades: CleanroomGrade[];
  recommendedBarrier: AsepticBarrier;
  barrierRationale: string;
  environmentalMonitoring: EnvironmentalMonitoringPlan[];
  mediaFill: MediaFillPlan;
  lyophilisationNote: string | null;
  recommendations: Recommendation[];
  citations: Citation[];
  determinismNote: string;
}

const CLEANROOM_GRADES: CleanroomGrade[] = [
  {
    grade: 'A',
    use: 'Critical zone for high-risk operations: aseptic filling, stopper bowls, open primary containers, aseptic connections.',
    particleAtRest: '≤ 3 520 /m³ at ≥0.5 µm; ≤ 20 /m³ at ≥5 µm',
    particleInOperation: '≤ 3 520 /m³ at ≥0.5 µm; ≤ 20 /m³ at ≥5 µm',
    microbialExpectation: 'No growth target (action limit effectively <1 CFU); continuous viable & total particle monitoring.',
    citations: cites(['annex1_grades', 'annex1_grade_a_limits', 'annex1_emonitoring']),
  },
  {
    grade: 'B',
    use: 'Background environment for the Grade A zone in aseptic preparation and filling (for non-isolator operations).',
    particleAtRest: '≤ 3 520 /m³ at ≥0.5 µm; ≤ 29 /m³ at ≥5 µm',
    particleInOperation: '≤ 352 000 /m³ at ≥0.5 µm; ≤ 2 930 /m³ at ≥5 µm',
    microbialExpectation: 'Low microbial action limits (e.g. ~10 CFU/m³ air, settle/contact plate limits per Annex 1 Table 6).',
    citations: cites(['annex1_grades', 'annex1_emonitoring']),
  },
  {
    grade: 'C',
    use: 'Clean area for less critical stages of manufacture of sterile products (e.g. solution preparation prior to filtration).',
    particleAtRest: '≤ 352 000 /m³ at ≥0.5 µm; ≤ 2 930 /m³ at ≥5 µm',
    particleInOperation: '≤ 3 520 000 /m³ at ≥0.5 µm; ≤ 29 300 /m³ at ≥5 µm',
    microbialExpectation: 'Higher action limits than Grade B; monitored per the EM programme.',
    citations: cites(['annex1_grades']),
  },
  {
    grade: 'D',
    use: 'Clean area for least critical stages (e.g. handling of components after washing, certain packaging).',
    particleAtRest: '≤ 3 520 000 /m³ at ≥0.5 µm; ≤ 29 300 /m³ at ≥5 µm',
    particleInOperation: 'Not predefined (define from risk assessment / CCS).',
    microbialExpectation: 'Highest action limits among graded areas; risk-based monitoring.',
    citations: cites(['annex1_grades']),
  },
];

function selectSterilisation(params: DesignSterileControlsParams): SterilisationDecision {
  // Annex 1 §8: terminal moist heat is the method of choice where feasible.
  if (params.heatStable === true) {
    return {
      selectedApproach: 'terminal_moist_heat',
      approachLabel: 'Terminal sterilisation by moist heat (autoclave)',
      rationale:
        'Product/container withstands moist heat, so terminal moist-heat sterilisation is the ' +
        'method of choice and provides the greatest sterility assurance.',
      sterilityAssuranceLevel: 'SAL ≤ 10⁻⁶ (terminal sterilisation target).',
      citations: cites(['annex1_sterilisation']),
    };
  }
  if (params.filterable === true) {
    return {
      selectedApproach: 'sterile_filtration_aseptic',
      approachLabel: 'Sterilising-grade filtration (0.22 µm) followed by aseptic processing',
      rationale:
        'Product cannot withstand terminal heat but can be sterile filtered; filtration plus ' +
        'aseptic processing is justified by documented risk assessment, with filter integrity ' +
        'testing (pre- and post-use) and aseptic safeguards.',
      sterilityAssuranceLevel:
        'No terminal SAL; sterility assurance derived from validated filtration + aseptic ' +
        'processing and contamination controls.',
      citations: cites(['annex1_sterilisation', 'annex1_ccs']),
    };
  }
  return {
    selectedApproach: 'aseptic_processing',
    approachLabel: 'Aseptic processing (no terminal sterilisation, non-filterable)',
    rationale:
      'Neither terminal heat nor sterile filtration is feasible; full aseptic processing is ' +
      'required with the most robust contamination controls and barrier technology, justified ' +
      'in the Contamination Control Strategy.',
    sterilityAssuranceLevel:
      'No terminal SAL; reliance on validated aseptic process and CCS effectiveness.',
    citations: cites(['annex1_sterilisation', 'annex1_ccs', 'annex1_barrier']),
  };
}

function selectBarrier(
  params: DesignSterileControlsParams,
  approach: SterilisationApproach,
): { barrier: AsepticBarrier; rationale: string } {
  if (params.barrier !== undefined) {
    return {
      barrier: params.barrier,
      rationale:
        `Caller-specified barrier "${params.barrier}". Annex 1 expects barrier selection to be ` +
        'justified in the CCS; isolators provide the highest separation of operator from product.',
    };
  }
  if (approach === 'terminal_moist_heat') {
    return {
      barrier: 'open_cleanroom',
      rationale:
        'Terminally sterilised product is typically prepared in graded cleanrooms (e.g. Grade C ' +
        'background, Grade A for any open critical steps); advanced barriers are less critical ' +
        'because sterility is assured terminally.',
    };
  }
  // Aseptic processing — Annex 1 strongly favours isolators / RABS.
  return {
    barrier: 'isolator',
    rationale:
      'For aseptic processing, Annex 1 (2022) expects barrier technology to reduce human ' +
      'intervention risk; an isolator is recommended as the highest-assurance option, with RABS ' +
      'as a justified alternative.',
  };
}

/**
 * Design an EU GMP Annex 1 (2022) contamination control strategy: grades A–D,
 * environmental monitoring, aseptic process simulation, and sterilisation
 * approach selection.
 */
export function designSterileControls(
  params: DesignSterileControlsParams,
): SterileControlStrategy {
  const sterilisation = selectSterilisation(params);
  const barrierSel = selectBarrier(params, sterilisation.selectedApproach);

  const environmentalMonitoring: EnvironmentalMonitoringPlan[] = [
    {
      element: 'Continuous Grade A monitoring',
      expectation:
        'Continuous viable and total (non-viable) particle monitoring of the Grade A zone for ' +
        'the full duration of critical processing and filling.',
      citations: cites(['annex1_emonitoring', 'annex1_grade_a_limits']),
    },
    {
      element: 'Viable monitoring (air, settle plates, contact plates, gloves)',
      expectation:
        'QRM-based viable monitoring with action/alert limits per grade (Annex 1 Table 6); ' +
        'finger-dab/glove and gown monitoring for aseptic operators.',
      citations: cites(['annex1_emonitoring', 'annex1_grades']),
    },
    {
      element: 'Non-viable particle monitoring',
      expectation:
        'Classification and routine monitoring against Grade A–D particulate limits at rest and ' +
        'in operation.',
      citations: cites(['annex1_grades', 'annex1_grade_a_limits']),
    },
    {
      element: 'Trending and CCS feedback',
      expectation:
        'Trend EM data and feed results back into the Contamination Control Strategy and QRM; ' +
        'investigate excursions.',
      citations: cites(['annex1_ccs', 'annex1_emonitoring']),
    },
  ];

  const mediaFill: MediaFillPlan = {
    target: 'Zero contaminated units (any contaminated unit triggers investigation).',
    frequency:
      'Initial qualification typically three consecutive successful runs per line; routine ' +
      'requalification at least every 6 months per shift per filling line, and per operator.',
    scope:
      'Simulate the routine aseptic process including worst-case activities, the maximum number ' +
      'and type of interventions, hold times, and operator participation; fill size sufficient ' +
      'to detect low-incidence contamination.',
    acceptanceCriteria:
      'Annex 1 target is zero contaminated units; any contamination is investigated and, ' +
      'depending on outcome, may invalidate qualification and require corrective action and ' +
      'requalification.',
    citations: cites(['annex1_apsmediafill']),
  };

  const lyophilisationNote =
    params.lyophilised === true
      ? 'Lyophilised product: partially stoppered vials are exposed; transfer to and loading of ' +
        'the freeze-dryer must occur under Grade A protection with validated loading/unloading, ' +
        'and the lyophiliser sterilisation and integrity must be controlled (Annex 1 2022 ' +
        'lyophiliser provisions, applicable from 25 Aug 2024). Media fills should simulate the ' +
        'lyophilisation cycle (including vacuum/partial-stopper steps).'
      : null;

  const recommendations: Recommendation[] = [
    {
      recommendation:
        'Document a holistic Contamination Control Strategy (CCS) covering all critical control ' +
        'points and the effectiveness of design, technical, procedural, and organisational controls.',
      rationale:
        'Annex 1 (2022) requires a facility-wide CCS underpinned by QRM as the integrating ' +
        'framework for sterility assurance.',
      citations: cites(['annex1_ccs', 'q9_principles']),
    },
  ];
  if (sterilisation.selectedApproach !== 'terminal_moist_heat' && params.heatStable !== true) {
    recommendations.push({
      recommendation:
        'Document the justification for not using terminal sterilisation (the method of choice) ' +
        'via a risk assessment.',
      rationale:
        'Annex 1 expects terminal moist-heat sterilisation wherever feasible; departure must be ' +
        'justified.',
      citations: cites(['annex1_sterilisation']),
    });
  }
  if (
    (sterilisation.selectedApproach === 'aseptic_processing' ||
      sterilisation.selectedApproach === 'sterile_filtration_aseptic') &&
    barrierSel.barrier === 'open_cleanroom'
  ) {
    recommendations.push({
      recommendation:
        'Reconsider barrier technology: for aseptic processing Annex 1 favours isolators or RABS ' +
        'to minimise human intervention.',
      rationale:
        'Open cleanroom aseptic filling carries higher intervention/contamination risk than ' +
        'isolator/RABS configurations.',
      citations: cites(['annex1_barrier']),
    });
  }

  return {
    productDescription: params.productDescription,
    contaminationControlStrategySummary:
      `Sterilisation approach: ${sterilisation.approachLabel}. Barrier: ${barrierSel.barrier}. ` +
      'Graded cleanrooms A–D with continuous Grade A monitoring, QRM-based environmental ' +
      'monitoring, and semi-annual aseptic process simulations form the contamination control ' +
      'strategy.',
    sterilisation,
    grades: CLEANROOM_GRADES,
    recommendedBarrier: barrierSel.barrier,
    barrierRationale: barrierSel.rationale,
    environmentalMonitoring,
    mediaFill,
    lyophilisationNote,
    recommendations,
    citations: cites([
      'annex1_ccs',
      'annex1_grades',
      'annex1_grade_a_limits',
      'annex1_sterilisation',
      'annex1_apsmediafill',
      'annex1_emonitoring',
      'annex1_barrier',
    ]),
    determinismNote:
      'Deterministic Annex 1 (2022) contamination-control assessment. Identical inputs yield ' +
      'identical output. Limits and frequencies are paraphrased; verify exact Table values ' +
      'against the current Annex 1 text.',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 6 — COMPUTER SYSTEM VALIDATION (GAMP 5, CSA, 21 CFR Part 11)
// ════════════════════════════════════════════════════════════════════════════

export type GampCategory = '1' | '3' | '4' | '5';

export type SystemNovelty = 'standard' | 'configured' | 'custom';

export interface AssessCsvParams {
  /** System name / description. */
  systemDescription: string;
  /** Type/category indication of the software. */
  softwareType: 'infrastructure' | 'non_configured' | 'configured' | 'custom';
  /** GxP / patient-safety / product-quality impact of the system. */
  gxpImpact?: RiskBand;
  /** Whether the system creates/maintains electronic records subject to Part 11. */
  electronicRecords?: boolean;
  /** Whether the system applies electronic signatures. */
  electronicSignatures?: boolean;
  /** Whether the system directly impacts product quality or patient safety. */
  directImpact?: boolean;
  /** Whether a documented supplier assessment exists (allows leveraging). */
  supplierAssessed?: boolean;
}

export interface GampClassification {
  category: GampCategory;
  categoryLabel: string;
  novelty: SystemNovelty;
  description: string;
  citations: Citation[];
}

export interface AssuranceApproach {
  approach: 'csa_unscripted' | 'csa_risk_based_scripted' | 'traditional_scripted_csv';
  approachLabel: string;
  rationale: string;
  testingEmphasis: string;
  documentationBurden: 'low' | 'moderate' | 'high';
  citations: Citation[];
}

export interface Part11Control {
  control: string;
  applicable: boolean;
  expectation: string;
  citations: Citation[];
}

export interface ValidationDeliverable {
  deliverable: string;
  whenRequired: string;
  citations: Citation[];
}

export interface CsvAssessment {
  systemDescription: string;
  gampClassification: GampClassification;
  assurance: AssuranceApproach;
  part11Controls: Part11Control[];
  validationDeliverables: ValidationDeliverable[];
  riskBasedScalingNote: string;
  citations: Citation[];
  determinismNote: string;
}

interface GampCategorySpec {
  softwareType: 'infrastructure' | 'non_configured' | 'configured' | 'custom';
  category: GampCategory;
  label: string;
  novelty: SystemNovelty;
  description: string;
}

const GAMP_CATEGORY_SPECS: GampCategorySpec[] = [
  {
    softwareType: 'infrastructure',
    category: '1',
    label: 'Category 1 — Infrastructure software',
    novelty: 'standard',
    description:
      'Layered/infrastructure software (operating systems, database engines, middleware). ' +
      'Validated indirectly through qualification of the infrastructure and the applications ' +
      'that run on it.',
  },
  {
    softwareType: 'non_configured',
    category: '3',
    label: 'Category 3 — Non-configured (off-the-shelf) product',
    novelty: 'standard',
    description:
      'Commercial off-the-shelf software used as installed (no configuration of business ' +
      'logic). Risk and effort focus on intended-use verification.',
  },
  {
    softwareType: 'configured',
    category: '4',
    label: 'Category 4 — Configured product',
    novelty: 'configured',
    description:
      'Commercial product configured to the user’s business process (e.g. LIMS, MES, EDMS, ' +
      'configured chromatography data systems). Configuration must be specified and verified.',
  },
  {
    softwareType: 'custom',
    category: '5',
    label: 'Category 5 — Custom / bespoke application',
    novelty: 'custom',
    description:
      'Custom-developed software (bespoke code, custom macros/scripts). Highest inherent risk; ' +
      'requires full lifecycle specification, design review, and code/structural verification.',
  },
];

/**
 * Assess computer system validation per GAMP 5 (2nd ed): determine the GAMP
 * category, recommend a CSV-vs-CSA risk-based assurance approach, map the
 * applicable 21 CFR Part 11 controls, and list validation deliverables.
 */
export function assessComputerSystemValidation(params: AssessCsvParams): CsvAssessment {
  const spec =
    GAMP_CATEGORY_SPECS.find(
      (s: GampCategorySpec): boolean => s.softwareType === params.softwareType,
    ) ?? GAMP_CATEGORY_SPECS[1];

  const gampClassification: GampClassification = {
    category: spec.category,
    categoryLabel: spec.label,
    novelty: spec.novelty,
    description: spec.description,
    citations: cites(['gamp5_categories', 'gamp5_riskbased']),
  };

  // Assurance approach — CSA critical thinking (GAMP 5 2nd ed / FDA CSA draft).
  const gxpImpact: RiskBand = params.gxpImpact ?? (params.directImpact === true ? 'high' : 'medium');
  const isDirect = params.directImpact === true || gxpImpact === 'critical' || gxpImpact === 'high';

  let assurance: AssuranceApproach;
  if (!isDirect && (spec.category === '1' || spec.category === '3')) {
    assurance = {
      approach: 'csa_unscripted',
      approachLabel: 'CSA — unscripted / exploratory testing, leverage supplier activities',
      rationale:
        'Indirect-impact, low-risk standard software: focus assurance on intended use using ' +
        'unscripted/ad-hoc/exploratory testing and leverage validated supplier development and ' +
        'testing where a supplier assessment supports it.',
      testingEmphasis: 'Unscripted/exploratory testing of intended use; record results, not exhaustive scripts.',
      documentationBurden: 'low',
      citations: cites(['gamp5_csa', 'gamp5_riskbased']),
    };
  } else if (spec.category === '5' || gxpImpact === 'critical') {
    assurance = {
      approach: 'traditional_scripted_csv',
      approachLabel: 'Risk-based scripted CSV (full lifecycle, custom/high-risk)',
      rationale:
        'Custom (Category 5) and/or critical direct-impact systems warrant full-lifecycle, ' +
        'scripted verification with design review and (for custom code) structural testing.',
      testingEmphasis: 'Scripted/robust testing of high-risk, direct-impact functions plus design review.',
      documentationBurden: 'high',
      citations: cites(['gamp5_riskbased', 'gamp5_csa', 'annex11_validation']),
    };
  } else {
    assurance = {
      approach: 'csa_risk_based_scripted',
      approachLabel: 'CSA — risk-based mix of scripted (direct-impact features) and unscripted',
      rationale:
        'Configured (Category 4) or direct-impact system: apply scripted/robust testing to ' +
        'features with direct patient-safety/product-quality impact and lighter unscripted ' +
        'testing for indirect-impact features; leverage supplier activity where assessed.',
      testingEmphasis: 'Scripted testing for high-risk/direct-impact functions; unscripted for the rest.',
      documentationBurden: 'moderate',
      citations: cites(['gamp5_csa', 'gamp5_riskbased']),
    };
  }

  // Part 11 controls
  const hasERecords = params.electronicRecords !== false;
  const hasESig = params.electronicSignatures === true;
  const part11Controls: Part11Control[] = [
    {
      control: 'Validation of the computerised system',
      applicable: hasERecords,
      expectation:
        'Validate closed systems to ensure accuracy, reliability, consistent intended ' +
        'performance, and the ability to discern invalid/altered records.',
      citations: cites(['part11_10a', 'annex11_validation']),
    },
    {
      control: 'Secure, time-stamped audit trail',
      applicable: hasERecords,
      expectation:
        'Computer-generated, time-stamped audit trail of create/modify/delete actions that does ' +
        'not obscure prior values; reviewed at a frequency based on data criticality.',
      citations: cites(['part11_10e', 'annex11_audit_trail', 'fda_di_audit_trail']),
    },
    {
      control: 'Access controls / authority checks',
      applicable: hasERecords,
      expectation:
        'Limit access to authorised individuals with unique accounts (no shared logins) and ' +
        'role-based authority checks for record creation, signing, and alteration.',
      citations: cites(['part11_10d', 'part11_10g', 'fda_di_shared_login']),
    },
    {
      control: 'Electronic signature manifestation & uniqueness',
      applicable: hasESig,
      expectation:
        'Signed records display the signer’s printed name, date/time, and meaning; non-biometric ' +
        'e-signatures use at least two distinct components and are used only by their owner.',
      citations: cites(['part11_50', 'part11_200']),
    },
    {
      control: 'Signature/record linking',
      applicable: hasESig,
      expectation:
        'Electronic signatures are permanently linked to their records so they cannot be excised, ' +
        'copied, or transferred to falsify a record.',
      citations: cites(['part11_70', 'annex11_esig']),
    },
    {
      control: 'Predicate-rule / risk-based scoping',
      applicable: true,
      expectation:
        'Scope Part 11 controls to records required by predicate rules using a risk-based ' +
        'approach to the extent of validation, audit trail, and retention controls.',
      citations: cites(['part11_scope_2003', 'gamp5_riskbased']),
    },
  ];

  // Validation deliverables scaled to category/approach
  const validationDeliverables: ValidationDeliverable[] = [
    {
      deliverable: 'Validation plan & risk assessment (GxP impact, GAMP category)',
      whenRequired: 'All GxP systems.',
      citations: cites(['gamp5_riskbased', 'annex11_validation']),
    },
    {
      deliverable: 'User Requirements Specification (URS)',
      whenRequired: 'All GxP systems.',
      citations: cites(['gamp5_riskbased', 'annex11_validation']),
    },
    {
      deliverable: 'Functional / configuration specification',
      whenRequired: 'Category 4 (configured) and Category 5 (custom) systems.',
      citations: cites(['gamp5_categories']),
    },
    {
      deliverable: 'Design specification & design review',
      whenRequired: 'Category 5 (custom) systems.',
      citations: cites(['gamp5_categories', 'gamp5_riskbased']),
    },
    {
      deliverable: 'Supplier assessment / audit',
      whenRequired:
        params.supplierAssessed === true
          ? 'Performed — leverage supplier development & testing to reduce duplication.'
          : 'Recommended to enable leveraging of supplier activities (esp. Category 3/4).',
      citations: cites(['gamp5_riskbased', 'gamp5_csa']),
    },
    {
      deliverable: 'Test specification & evidence (IQ/OQ/PQ or risk-based assurance records)',
      whenRequired: 'All GxP systems; rigor scaled to risk/category per the assurance approach.',
      citations: cites(['gamp5_riskbased', 'gamp5_csa', 'annex11_validation']),
    },
    {
      deliverable: 'Data integrity controls verification (access, audit trail, backup/restore/archive)',
      whenRequired: 'Systems holding GxP electronic records.',
      citations: cites(['gamp5_dataintegrity', 'part11_10e', 'part11_10d']),
    },
    {
      deliverable: 'Traceability matrix (requirements → tests)',
      whenRequired: 'All GxP systems.',
      citations: cites(['gamp5_riskbased']),
    },
    {
      deliverable: 'Validation summary report & release for use',
      whenRequired: 'All GxP systems.',
      citations: cites(['annex11_validation', 'gamp5_riskbased']),
    },
  ];

  return {
    systemDescription: params.systemDescription,
    gampClassification,
    assurance,
    part11Controls,
    validationDeliverables,
    riskBasedScalingNote:
      'GAMP 5 (2nd ed) and CSA scale assurance effort to system risk, complexity, and novelty: ' +
      `GAMP Category ${spec.category}, GxP impact ${gxpImpact} → ${assurance.approachLabel}. ` +
      'Critical-thinking and supplier leveraging reduce duplicated effort on lower-risk features.',
    citations: cites([
      'gamp5_categories',
      'gamp5_riskbased',
      'gamp5_csa',
      'part11_10a',
      'part11_10e',
      'part11_scope_2003',
      'annex11_validation',
    ]),
    determinismNote:
      'Deterministic GAMP 5 / CSA / Part 11 assessment. Identical inputs yield identical output. ' +
      'Citations must be reported verbatim.',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// END OF MODULE
// ════════════════════════════════════════════════════════════════════════════
