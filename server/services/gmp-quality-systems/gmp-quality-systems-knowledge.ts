/**
 * GMP Quality Systems & Data Integrity — Deterministic Knowledge Engine
 * ─────────────────────────────────────────────────────────────────────
 *
 * Pure, closed-form, reproducible regulatory-science engine. NO LLM, NO
 * network, NO database. Its imports from other services are the shared
 * stated-input readers, refuseUnlessStated and ComputationRefusal, thrown when
 * a required input is missing or any input is malformed, so that AnA relays it
 * as needs_parameters. A true/false fact left out stays not_stated (Rule 2
 * S5c). Every output is a
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

import { ComputationRefusal, refuseUnlessStated } from '../ana-biostats/computation-engine.js';
import {
  allOf,
  anyOf,
  booleanInputStates,
  statedBoolean,
  statedNumber,
  statedOneOf,
  unstated,
} from '../immunogenicity/immunogenicity-reference.js';
import { cites } from './gmp-quality-systems-citations.js';
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

/** Clamp a number into [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Whether a fact was left out (undefined or null). Absent and false are different facts. */
type BooleanState = boolean | 'not_stated';

/** Refuse, naming each, required text and enums missing or unknown; never a default. */
function requireStated(fn: string, params: object, text: string[], enums: Record<string, readonly string[]> = {}): void {
  const v = params as Record<string, unknown>;
  refuseUnlessStated(fn, [
    ...text.map((field) => ({
      field, value: v[field], ok: typeof v[field] === 'string' && (v[field] as string).trim() !== '', expected: 'non-empty text',
    })),
    ...Object.entries(enums).map(([field, allowed]) => ({
      field, value: v[field], ok: allowed.includes(v[field] as string), expected: `one of ${allowed.join(', ')}`,
    })),
  ], 'assessed');
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

const RECORD_FORMATS = ['paper', 'hybrid', 'electronic'] as const;
/** How the record is captured / stored. */
export type RecordFormat = (typeof RECORD_FORMATS)[number];

const RECORD_TYPES = ['static', 'dynamic'] as const;
/** Whether the electronic record is static or dynamic (FDA DI guidance Q2). */
export type RecordType = (typeof RECORD_TYPES)[number];

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
  /** For electronic records, static or dynamic; left out, not_stated. */
  recordType?: RecordType;
  /** Lifecycle stages in scope; left out, all seven are listed. */
  lifecycleStages?: DataLifecycleStage[];
  /** Whether the data directly impacts a batch-release / safety decision. */
  impactsBatchRelease?: boolean;
  /** Whether the data directly impacts patient safety. */
  impactsPatientSafety?: boolean;
  /** Control state per attribute / audit trail. */
  controls?: AlcoaControlState;
  /** GxP area. Not read: the assessment is the same for every area. */
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
  inherentRisk: RiskBand | 'not_assessed';
  keyControls: string[];
  citations: Citation[];
}

export interface DataIntegrityAssessment {
  dataDescription: string;
  recordFormat: RecordFormat;
  recordType: RecordType | 'n/a' | 'not_stated';
  dataCriticality: RiskBand | 'not_assessed';
  criticalityRationale: string;
  alcoaFindings: AlcoaAttributeFinding[];
  attributesSatisfied: number;
  attributesAtRisk: AlcoaAttribute[];
  auditTrail: AuditTrailFinding;
  lifecycleRisks: DataLifecycleRisk[];
  /** not_assessed unless every answer to the unstated facts gives one band (overallRiskRange). */
  overallDataIntegrityRisk: RiskBand | 'not_assessed';
  overallRiskRange: { min: RiskBand; max: RiskBand };
  inputStates: Record<string, BooleanState>;
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
  // 2026-11-02 (S5c): unstated impacts read as 'medium', an untyped electronic record as dynamic
  // and an unstated control as satisfied in the overall risk; an unknown stage was dropped.
  requireStated('assessDataIntegrity', params, ['dataDescription'], { recordFormat: RECORD_FORMATS });
  const stages = LIFECYCLE_RISK_SPECS.map((s) => s.stage);
  const scope: unknown = params.lifecycleStages;
  const ctl: unknown = params.controls;
  if (!unstated(scope) && !(Array.isArray(scope) && scope.every((s) => stages.includes(s)))) {
    throw new ComputationRefusal('invalid_input', `lifecycleStages must be a list of ${stages.join(', ')}.`, 'lifecycleStages');
  }
  if (!unstated(ctl) && (typeof ctl !== 'object' || Array.isArray(ctl))) {
    throw new ComputationRefusal('invalid_input', 'controls must be an object of true/false states.', 'controls');
  }
  const controls: AlcoaControlState = params.controls ?? {};
  const known = (k: keyof AlcoaControlState): boolean | 'unknown' => statedBoolean(`controls.${k}`, controls[k]) ?? 'unknown';
  const inputStates = booleanInputStates(params, ['impactsBatchRelease', 'impactsPatientSafety']);
  for (const k of [...ALCOA_SPECS.map((s) => s.controlKey), 'auditTrailEnabled', 'auditTrailReviewed'] as const) {
    const s = known(k);
    inputStates[`controls.${k}`] = s === 'unknown' ? 'not_stated' : s;
  }
  const statedType = statedOneOf('recordType', params.recordType, RECORD_TYPES);
  const recordType = params.recordFormat === 'electronic' ? statedType ?? 'not_stated' : 'n/a';

  // ── Data criticality (MHRA §4): a band only when the stated facts settle it ──
  const safety = statedBoolean('impactsPatientSafety', params.impactsPatientSafety);
  const release = statedBoolean('impactsBatchRelease', params.impactsBatchRelease);
  const band = (s: boolean, r: boolean): RiskBand => (s ? 'critical' : r ? 'high' : 'medium');
  const critFloor = band(safety === true, release === true);
  const critCeiling = band(safety !== false, release !== false);
  const criticality = critFloor === critCeiling ? critFloor : 'not_assessed';
  const reasons: string[] = [];
  if (safety === true) reasons.push('directly impacts patient safety');
  if (release === true) reasons.push('supports a batch-release / disposition decision');
  if (criticality === 'not_assessed') {
    const open = ['impactsPatientSafety', 'impactsBatchRelease'].filter((k) => inputStates[k] === 'not_stated');
    reasons.push(`not assessed (${critFloor} to ${critCeiling}): ${open.join(', ')} not stated`);
  } else if (reasons.length === 0) {
    reasons.push('stated not to support batch release or affect patient safety directly — rated medium');
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
      const satisfied = known(spec.controlKey);
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
  const atEnabled = known('auditTrailEnabled');
  const atReviewed = known('auditTrailReviewed');
  const direct = anyOf(safety, release);
  const reviewFrequency =
    direct === true
      ? 'With each record and prior to final approval (e.g. at batch release)'
      : direct === false
        ? 'Periodic review on a risk-based frequency defined in procedure'
        : 'Not assessed: batch-release and patient-safety impact not stated';
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
  const stagesInScope: DataLifecycleStage[] = params.lifecycleStages ?? stages;

  const lifecycleRisks: DataLifecycleRisk[] = LIFECYCLE_RISK_SPECS.filter(
    (s: LifecycleRiskSpec): boolean => stagesInScope.includes(s.stage),
  ).map((s: LifecycleRiskSpec): DataLifecycleRisk => {
    let risk = s.baseRisk;
    if (params.recordFormat === 'paper' || params.recordFormat === 'hybrid') {
      risk = escalateRisk(risk, 1);
    }
    // Stated patient-safety impact (critical data) raises each stage one band.
    const raised = escalateRisk(risk, 1);
    return {
      stage: s.stage,
      inherentRisk: safety === undefined && raised !== risk ? 'not_assessed' : safety ? raised : risk,
      keyControls: s.keyControls,
      citations: cites(s.citationKeys),
    };
  });

  // ── Overall risk: a band only when every reading of the unstated facts gives it ──
  const flip = (b: boolean | 'unknown'): boolean | undefined => (b === 'unknown' ? undefined : !b);
  const atDeficient = auditTrailRequired ? anyOf(flip(atEnabled), flip(atReviewed)) : false;
  const unknownAttributes = alcoaFindings.filter((f) => f.satisfied === 'unknown').length;
  const overallFor = (crit: RiskBand, atRisk: number, deficient: boolean): RiskBand =>
    escalateRisk(crit, (atRisk === 0 ? 0 : atRisk >= 3 ? 2 : 1) + (deficient ? 1 : 0));
  const overallRiskRange = {
    min: overallFor(critFloor, attributesAtRisk.length, atDeficient === true),
    max: overallFor(critCeiling, attributesAtRisk.length + unknownAttributes, atDeficient !== false),
  };
  const overall = overallRiskRange.min === overallRiskRange.max ? overallRiskRange.min : 'not_assessed';

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
  if (atDeficient !== false) {
    recommendations.push({
      recommendation: atDeficient
        ? 'Enable and routinely review the audit trail; for critical data review it with each ' +
          'record and before batch release.'
        : 'Confirm whether the audit trail is enabled and reviewed (not stated).',
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
    overallRiskRange,
    inputStates,
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

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — CAPA DESIGN (ICH Q10)
// ════════════════════════════════════════════════════════════════════════════

const CAPA_SOURCES = [
  'deviation', 'complaint', 'oos', 'recall', 'audit_finding',
  'inspection_observation', 'nonconformance', 'trend', 'change', 'near_miss',
] as const;
export type CapaSourceType = (typeof CAPA_SOURCES)[number];

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
  /** Optional caller-suggested root-cause method (overrides the rule-based selection). */
  preferredRootCauseMethod?: RootCauseMethod;
}

export interface CapaAction {
  type: CapaActionType;
  description: string;
  intent: string;
  citations: Citation[];
}

export interface RootCausePlan {
  /** 'undetermined' while an unstated fact could change the rule's pick. */
  method: RootCauseMethod | 'undetermined';
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
  /** 'not_assessed' unless supplied, or inferred as high from stated product impact (see severityBasis). */
  severity: RiskBand | 'not_assessed';
  severityBasis: 'stated' | 'inferred_from_product_impact' | 'not_assessed';
  /** 'undetermined' while an unstated severity or extent (systemic) could change it. */
  formality: 'streamlined' | 'standard' | 'formal' | 'undetermined';
  qrmFormalityRationale: string;
  rootCause: RootCausePlan;
  alternativeRootCauseMethods: RootCauseMethod[];
  actions: CapaAction[];
  effectivenessChecks: EffectivenessCheck[];
  /** null until severity is stated (an inferred high could be critical). */
  recommendedTargetDays: number | null;
  closureConditions: string[];
  /** Inputs the plan depends on that were not supplied. */
  notAssessed: Array<keyof DesignCapaParams>;
  inputStates: Record<string, BooleanState>;
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

/** 'undetermined' while an unstated fact could change the pick (until 2026-11-02 a count read as 1, systemic and recurring as false). */
function selectRootCauseMethod(params: DesignCapaParams): RootCauseMethod | 'undetermined' {
  if (!unstated(params.preferredRootCauseMethod)) return params.preferredRootCauseMethod as RootCauseMethod;
  const factors = params.contributingFactorCount as number;
  const fmea = anyOf(params.systemic, params.recurring, unstated(factors) ? undefined : factors >= 4);
  if (fmea !== false) return fmea ? 'fmea' : 'undetermined';
  if (params.source === 'recall' || params.source === 'oos') {
    if (unstated(params.severity)) return 'undetermined';
    if (params.severity === 'high' || params.severity === 'critical') return 'fault-tree';
  }
  return factors >= 2 ? 'ishikawa' : '5-whys';
}

/**
 * Design a CAPA plan: problem statement, root-cause method selection,
 * correction/corrective/preventive actions, and effectiveness checks per ICH Q10.
 */
export function designCAPA(params: DesignCapaParams): CapaPlan {
  // 2026-10-15: severity used to default to 'medium' and the problem statement
  // printed "failure appears isolated; no product impact identified" for facts
  // nobody supplied. Those are now said to be not assessed, and the formality
  // and target timeline they decide are left undetermined.
  requireStated('designCAPA', params, ['problemDescription'], { source: CAPA_SOURCES });
  const inputStates = booleanInputStates(params, ['recurring', 'systemic', 'productImpact']);
  statedOneOf('severity', params.severity, RISK_ORDER);
  statedOneOf('preferredRootCauseMethod', params.preferredRootCauseMethod, ROOT_CAUSE_SPECS.map((s) => s.method));
  statedNumber('contributingFactorCount', params.contributingFactorCount, (n) => Number.isInteger(n) && n >= 0, 'a whole number ≥ 0');
  const severityBasis: CapaPlan['severityBasis'] = !unstated(params.severity)
    ? 'stated'
    : params.productImpact === true
      ? 'inferred_from_product_impact'
      : 'not_assessed';
  const severity: RiskBand | 'not_assessed' = params.severity ?? (params.productImpact === true ? 'high' : 'not_assessed');
  const decidingFacts: Array<keyof DesignCapaParams> = ['severity', 'systemic', 'productImpact', 'recurring'];
  if (unstated(params.preferredRootCauseMethod)) decidingFacts.push('contributingFactorCount');
  const notAssessed = decidingFacts.filter((k) => unstated(params[k]));

  // QRM-proportionate formality (ICH Q9(R1) §5.2)
  const formality: CapaPlan['formality'] =
    severity === 'critical' || severity === 'high' || params.systemic === true
      ? 'formal'
      : severity === 'not_assessed' || unstated(params.systemic)
        ? 'undetermined'
        : severity === 'medium'
          ? 'standard'
          : 'streamlined';

  const method = selectRootCauseMethod(params);
  const spec = ROOT_CAUSE_SPECS.find((s: RootCauseSpec): boolean => s.method === method);

  const rootCause: RootCausePlan = spec
    ? { method: spec.method, methodLabel: spec.label, whenToUse: spec.whenToUse, steps: spec.steps, citations: cites(spec.citationKeys) }
    : {
        method: 'undetermined',
        methodLabel: 'Not determined',
        whenToUse: 'The rule needs facts not stated (notAssessed); state them or preferredRootCauseMethod.',
        steps: [],
        citations: cites(['q10_capa', 'q9_tools']),
      };

  const alternativeRootCauseMethods: RootCauseMethod[] = ROOT_CAUSE_SPECS.filter(
    (s: RootCauseSpec): boolean => s.method !== method,
  ).map((s: RootCauseSpec): RootCauseMethod => s.method);

  // Build problem statement (objective, measurable, no embedded cause/solution)
  const severityText =
    severityBasis === 'stated'
      ? `Severity assessed as ${severity}`
      : severityBasis === 'inferred_from_product_impact'
        ? 'Severity not assessed; inferred as high from potential product impact'
        : 'Severity not assessed';
  const extentText =
    params.systemic === true
      ? '; failure appears SYSTEMIC'
      : params.systemic === false
        ? '; failure appears isolated'
        : '; extent (isolated vs systemic) not determined';
  const productImpactText =
    params.productImpact === true
      ? '; potential impact to distributed/in-process product.'
      : params.productImpact === false
        ? '; no product impact identified at this stage.'
        : '; product impact not assessed.';
  const problemStatement =
    `Problem: ${params.problemDescription} (source: ${params.source}). ` +
    severityText +
    (params.recurring === true ? '; event is RECURRING' : unstated(params.recurring) ? '; recurrence not stated' : '') +
    extentText +
    productImpactText;

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
          : formality === 'undetermined'
            ? 'Set with the formality (undetermined): 3 and 6 months post-implementation if formal, else the next periodic trend review (within ~3 months).'
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
  const spreads = anyOf(params.systemic, params.recurring);
  if (spreads !== false) {
    effectivenessChecks.push({
      metric: 'Effectiveness of preventive action across analogous areas',
      method: 'Verification that the change was deployed to all identified similar processes.',
      timing: spreads
        ? 'At 6 months post-implementation.'
        : 'At 6 months post-implementation, if the failure is systemic or recurring (not stated).',
      acceptanceCriterion: 'All analogous processes updated; no related events in similar areas.',
    });
  }

  // Recommended timeline (commensurate with risk)
  const recommendedTargetDays =
    severityBasis !== 'stated' ? null : severity === 'critical' ? 30 : severity === 'high' ? 45 : severity === 'medium' ? 60 : 90;

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
    severityBasis,
    formality,
    qrmFormalityRationale:
      'Formality, effort and documentation are scaled to risk per ICH Q9(R1): ' +
      `severity=${severity === 'not_assessed' ? 'not assessed' : severity}` +
      (params.systemic === true ? ', systemic failure' : '') +
      (params.recurring === true ? ', recurring' : '') +
      (formality === 'undetermined'
        ? ' → formality undetermined until severity and extent (isolated vs systemic) are assessed.'
        : ` → ${formality} CAPA.`),
    rootCause,
    alternativeRootCauseMethods,
    actions,
    effectivenessChecks,
    recommendedTargetDays,
    closureConditions,
    notAssessed,
    inputStates,
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
  /** Number of batches potentially affected. Not read: the result is the same without it. */
  batchesAffected?: number;
}

export interface ProductImpactAssessment {
  /** null when not assessed: no stated fact establishes or rules out an impact. */
  potentiallyImpacted: boolean | null;
  rationale: string;
  dispositionGuidance: string;
  citations: Citation[];
}

export interface RegulatoryReportingTrigger {
  /** 'undetermined' while an unstated fact could trigger it. */
  fieldAlertReportEvaluation: boolean | 'undetermined';
  fieldAlertRationale: string;
  recallEvaluation: boolean | 'undetermined';
  recallRationale: string;
  citations: Citation[];
}

export interface DeviationClassification {
  description: string;
  area: DeviationArea;
  /** 'undetermined' while an unstated fact could still escalate it (see notAssessed). */
  classification: DeviationClass | 'undetermined';
  classificationRationale: string;
  /** null until the class is determined. */
  initialResponseHours: number | null;
  investigationTargetDays: number;
  productImpact: ProductImpactAssessment;
  reporting: RegulatoryReportingTrigger;
  requiresCapa: boolean | 'undetermined';
  qualityUnitDispositionRequired: boolean | 'undetermined';
  /** Facts the classification, impact and reporting depend on that were not stated. */
  notAssessed: Array<keyof ClassifyDeviationParams>;
  inputStates: Record<string, BooleanState>;
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
 * The class reached when `holds` says which escalating facts apply: "stated
 * true" gives the class the facts establish, "true or unstated" the highest
 * class still open.
 */
function deviationClassFor(
  params: ClassifyDeviationParams,
  spec: DeviationAreaSpec,
  holds: (fact: boolean | undefined) => boolean,
  rationale: string[] = [],
): DeviationClass {
  let classification: DeviationClass = spec.baseClass;
  if (holds(params.patientSafetyImpact)) {
    classification = maxClass(classification, 'critical');
    rationale.push('Potential patient-safety impact → critical.');
  }
  if (holds(params.outOfSpecConfirmed)) {
    classification = maxClass(classification, 'major');
    rationale.push('Confirmed out-of-specification of a quality attribute → at least major.');
  }
  if (spec.safetyCritical && holds(params.sterileProduct)) {
    classification = maxClass(classification, 'critical');
    rationale.push('Sterile product with safety-critical area → critical.');
  }
  if (holds(params.recurring)) {
    classification = escalateClass(classification, 1);
    rationale.push('Recurring deviation escalated one class.');
  }
  return clampClass(classification);
}

/** The product-impact block: "not assessed", and no release decision, while no stated fact settles it. */
function productImpactFor(impacted: boolean | undefined, notStated: string[]): ProductImpactAssessment {
  return {
    potentiallyImpacted: impacted ?? null,
    rationale:
      impacted === true
        ? 'Deviation may affect a CQA / safety of the affected batch(es); a documented product ' +
          'impact assessment and disposition by the quality unit is required.'
        : impacted === false
          ? 'No direct CQA / safety impact identified; document the rationale and trend the event.'
          : `Product impact not assessed: ${notStated.join(', ')} not stated. A documented product ` +
            'impact assessment by the quality unit is required.',
    dispositionGuidance:
      impacted === true
        ? 'Quarantine affected and associated batches pending investigation; the quality unit ' +
          'must approve or reject based on the completed investigation (21 CFR 211.192).'
        : impacted === false
          ? 'Batch may proceed subject to routine release controls; record the justified deviation.'
          : 'Disposition not determined: no release decision until the quality unit has assessed ' +
            'product impact and reviewed the investigation (21 CFR 211.192).',
    citations: cites(['cfr211_192', 'cfr211_22', 'cfr211_100']),
  };
}

/** Field-alert and recall triggers; 'undetermined' while an unstated fact could trigger them. */
function reportingFor(
  fieldAlert: boolean | undefined,
  recall: boolean | undefined,
  notStated: string[],
): RegulatoryReportingTrigger {
  const open = (facts: string[]): string => `${facts.join(', ')} not stated; reassess when they are known.`;
  return {
    fieldAlertReportEvaluation: fieldAlert ?? 'undetermined',
    fieldAlertRationale:
      fieldAlert === true
        ? 'A distributed batch with a confirmed/potential quality or safety problem triggers ' +
          'evaluation of a Field Alert Report for an NDA/ANDA product (21 CFR 314.81(b)(1)) — ' +
          'submit within 3 working days of becoming aware if criteria are met.'
        : fieldAlert === false
          ? 'Field Alert Report not triggered on the current information (not US-marketed, not distributed and/or no ' +
            'confirmed quality defect); reassess if new information emerges.'
          : `Field Alert Report evaluation undetermined: ${open(notStated)}`,
    recallEvaluation: recall ?? 'undetermined',
    recallRationale:
      recall === true
        ? 'A distributed, critically deviating or safety-impacting batch requires a documented ' +
          'recall (health-hazard) evaluation; classify and notify per the recall procedure / FDA ' +
          '21 CFR Part 7 if a recall is warranted.'
        : recall === false
          ? 'Recall evaluation not triggered on the current information; document the rationale.'
          : `Recall evaluation undetermined: ${open(notStated.filter((k) => k !== 'usMarketed'))}`,
    citations: cites(['cfr211_198', 'cfr211_192', 'q10_capa']),
  };
}

/**
 * Classify a GMP deviation (critical / major / minor), assign a handling
 * timeline, assess product impact, and determine whether a field alert /
 * recall evaluation is triggered.
 */
export function classifyGMPDeviation(
  params: ClassifyDeviationParams,
): DeviationClassification {
  // 2026-10-15: an area outside the enum used to be classified silently as
  // 'other', and every escalating fact was read with `=== true`, so a
  // deviation given only its area read as final at the area baseline, with "No
  // direct CQA / safety impact identified … Batch may proceed". An unknown area
  // is now refused; the class is 'undetermined' while an unstated fact could
  // escalate it, product impact is null until assessed, and notAssessed lists
  // the facts. 2026-11-02: an omitted usMarketed no longer reads as true.
  requireStated('classifyGMPDeviation', params, ['description'], { area: DEVIATION_AREA_SPECS.map((s) => s.area) });
  const inputStates = booleanInputStates(params, [
    'batchDistributed', 'sterileProduct', 'outOfSpecConfirmed', 'patientSafetyImpact', 'recurring', 'usMarketed']);
  const areaSpec = DEVIATION_AREA_SPECS.find((s: DeviationAreaSpec): boolean => s.area === params.area) as DeviationAreaSpec;
  const notAssessed = (['patientSafetyImpact', 'outOfSpecConfirmed', 'recurring', 'batchDistributed', 'usMarketed'] as const)
    .filter((k) => unstated(params[k]));

  // The unstated facts that can escalate the class (batchDistributed and usMarketed only bear on reporting).
  const escalators = notAssessed.filter((k) => k !== 'batchDistributed' && k !== 'usMarketed');

  const rationale: string[] = [`Area "${params.area}" baseline classification: ${areaSpec.baseClass}.`];
  const floor = deviationClassFor(params, areaSpec, (f) => f === true, rationale);
  const ceiling = deviationClassFor(params, areaSpec, (f) => f === true || unstated(f));
  const classification: DeviationClass | 'undetermined' = floor === ceiling ? floor : 'undetermined';
  if (classification === 'undetermined') {
    rationale.push(`Class undetermined: at least ${floor}; ${escalators.join(', ')} not stated and could escalate it.`);
  }
  if (params.batchDistributed === true && classification === 'critical') {
    rationale.push('Affected batch already distributed — heightens urgency of disposition.');
  }

  // Handling timeline
  const initialResponseHours =
    classification === 'critical' ? 24 : classification === 'major' ? 48 : classification === 'minor' ? 72 : null;
  const investigationTargetDays =
    classification === 'critical' ? 30 : classification === 'major' ? 30 : 30;
  // Note: 21 CFR 211.192 investigations are generally expected to close within 30 days,
  // with documented justification/extension for complex critical investigations.

  // Product impact
  const isCritical = floor === 'critical' ? true : ceiling === 'critical' ? undefined : false;
  const atLeastMajor = floor !== 'minor' ? true : ceiling !== 'minor' ? undefined : false;
  const potentiallyImpacted = anyOf(
    params.outOfSpecConfirmed,
    params.patientSafetyImpact,
    isCritical,
    allOf(areaSpec.safetyCritical, params.sterileProduct),
  );
  const productImpact = productImpactFor(potentiallyImpacted, escalators);

  // Reporting triggers
  const fieldAlert = allOf(
    params.usMarketed,
    anyOf(params.batchDistributed, params.outOfSpecConfirmed),
    anyOf(isCritical, params.outOfSpecConfirmed, params.patientSafetyImpact),
  );
  const recall = anyOf(allOf(params.batchDistributed, isCritical), params.patientSafetyImpact);
  const reporting = reportingFor(fieldAlert, recall, notAssessed);

  const requiresCapa = anyOf(atLeastMajor, params.recurring);

  return {
    description: params.description,
    area: params.area,
    classification,
    classificationRationale: rationale.join(' '),
    initialResponseHours,
    investigationTargetDays,
    productImpact,
    reporting,
    requiresCapa: requiresCapa ?? 'undetermined',
    qualityUnitDispositionRequired: anyOf(potentiallyImpacted, atLeastMajor) ?? 'undetermined',
    notAssessed,
    inputStates,
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
  /** not_assessed, the level null, while an unstated isCriticalStep could raise it. */
  gmpStringency: 'minimal_gmp' | 'partial_gmp' | 'full_gmp' | 'full_gmp_enhanced' | 'not_assessed';
  stringencyLevel: number | null; // 1..4 increasing
  expectation: string;
  citations: Citation[];
}

export interface ProcessControlExpectation {
  control: string;
  expectation: string;
  citations: Citation[];
}

export interface ChangeControlGuidance {
  /** not_assessed (the needs null) while an unstated fact could decide it. */
  classification: 'significant' | 'minor' | 'not_assessed';
  requiresRevalidation: boolean | null;
  requiresRegulatoryNotification: boolean | null;
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
  inputStates: Record<string, BooleanState>;
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
  // 2026-11-02 (S5c): an unknown or missing step was assessed as starting-material
  // production, and unstated critical-step or significance facts read as false.
  requireStated('assessAPIGMP', params, [], { step: API_STEP_SPECS.map((s: ApiStepSpec) => s.step) });
  const inputStates = booleanInputStates(params, ['isCriticalStep', 'sterileApi', 'changeIsSignificant']);
  const spec = API_STEP_SPECS.find((s: ApiStepSpec): boolean => s.step === params.step) as ApiStepSpec;

  // A critical step below level 4 rises one level; unstated there, the level is not assessed.
  const critical = statedBoolean('isCriticalStep', params.isCriticalStep);
  const raised = spec.level < 4 ? critical : false;
  const level = raised ? spec.level + 1 : spec.level;
  let expectation = spec.expectation;
  if (raised) {
    expectation +=
      ' This step is identified as a CRITICAL process step, warranting enhanced control, ' +
      'tighter in-process limits, and validation emphasis.';
  } else if (raised === undefined) {
    expectation += ' Whether it is a critical step is not stated (isCriticalStep); if it is, stringency rises one level.';
  }
  if (params.sterileApi === true) {
    expectation +=
      ' For a sterile API, additional ICH Q7 §18 / Annex 1 contamination-control and ' +
      'sterility-assurance expectations apply to the relevant steps.';
  } else if (unstated(params.sterileApi)) {
    expectation += ' Whether the API is sterile is not stated (sterileApi).';
  }

  const stringencyProfile: GmpStringencyProfile = {
    step: spec.step,
    stepLabel: spec.label,
    gmpStringency: raised === undefined ? 'not_assessed' : raised ? (level >= 4 ? 'full_gmp_enhanced' : 'full_gmp') : spec.stringency,
    stringencyLevel: raised === undefined ? null : level,
    expectation,
    citations: cites(['q7_intro_gmp_increases', 'q7_table1']),
  };

  // Critical process controls scale with stringency level.
  const controlsAt = (atLevel: number): ProcessControlExpectation[] => [
    {
      control: 'Definition of API starting material',
      expectation:
        'Clearly define and justify the API starting material; full GMP begins at its introduction.',
      citations: cites(['q7_intro_gmp_increases', 'q7_table1']),
    },
    ...(atLevel < 3 ? [] : [
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
    ]),
    ...(atLevel < 4 ? [] : [
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
    ]),
  ];
  const criticalProcessControls = controlsAt(level);
  if (raised === undefined) {
    for (const c of controlsAt(level + 1).slice(criticalProcessControls.length)) {
      criticalProcessControls.push({ ...c, expectation: `If this is a critical process step (not stated): ${c.expectation}` });
    }
  }

  // A critical or level-4 step makes a change significant; else changeIsSignificant decides.
  const changeControlFor = (significant: boolean | undefined): ChangeControlGuidance => ({
    classification: significant === undefined ? 'not_assessed' : significant ? 'significant' : 'minor',
    requiresRevalidation: significant ?? null,
    requiresRegulatoryNotification: significant ?? null,
    steps: [
      'Initiate a formal change control and define the change, scope, and justification.',
      'Assess impact on product quality and the control strategy using quality risk management.',
      'Classify the change (minor vs significant) and determine revalidation needs.',
      significant === undefined
        ? 'Significance not assessed: a fact that decides it is not stated (inputStates).'
        : significant
          ? 'For significant changes affecting registered details, evaluate regulatory ' +
            'notification/approval before implementation.'
          : 'For minor changes, document the assessment; regulatory notification may not be required.',
      'Quality-unit review and approval before implementation; verify effectiveness afterwards.',
    ],
    citations: cites(['q7_change_control', 'q10_change_mgmt', 'q9_formality']),
  });
  const changeControl = changeControlFor(anyOf(params.changeIsSignificant, critical, spec.level >= 4));

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
    inputStates,
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

const ASEPTIC_BARRIERS = ['open_cleanroom', 'rabs', 'isolator'] as const;
export type AsepticBarrier = (typeof ASEPTIC_BARRIERS)[number];

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
  /** Annual number of aseptic filling lines/shifts. Not read: the plan is the same without it. */
  fillingLines?: number;
  /** Number of operators requiring qualification. Not read: the plan is the same without it. */
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
  /** not_assessed while an unstated heatStable or filterable could change it. */
  selectedApproach: SterilisationApproach | 'not_assessed';
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
  recommendedBarrier: AsepticBarrier | 'not_assessed';
  barrierRationale: string;
  environmentalMonitoring: EnvironmentalMonitoringPlan[];
  mediaFill: MediaFillPlan;
  lyophilisationNote: string | null;
  inputStates: Record<string, BooleanState>;
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
  // 2026-11-02 (S5c): an unstated heatStable or filterable read as false.
  if (params.heatStable !== false || unstated(params.filterable)) {
    return {
      selectedApproach: 'not_assessed',
      approachLabel: 'Not assessed',
      rationale: `${params.heatStable === false ? 'filterable' : 'heatStable'} not stated; the approach follows from it.`,
      sterilityAssuranceLevel: 'Not assessed.',
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
  approach: SterilisationDecision['selectedApproach'],
): { barrier: AsepticBarrier | 'not_assessed'; rationale: string } {
  if (params.barrier) {
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
  if (params.heatStable !== false) {
    return { barrier: 'not_assessed', rationale: 'Not assessed: it follows the sterilisation approach (heatStable not stated).' };
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
  requireStated('designSterileControls', params, ['productDescription']);
  const inputStates = booleanInputStates(params, ['heatStable', 'filterable', 'lyophilised']);
  statedOneOf('barrier', params.barrier, ASEPTIC_BARRIERS);
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
      : unstated(params.lyophilised)
        ? 'Not assessed: lyophilised not stated.'
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
  if (params.heatStable === false) {
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
  // Not heat-stable: aseptic processing, with or without filtration.
  if (params.heatStable === false && barrierSel.barrier === 'open_cleanroom') {
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
    inputStates,
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
  /** 'undetermined' while the GxP / direct impact it depends on is not assessed. */
  approach: 'csa_unscripted' | 'csa_risk_based_scripted' | 'traditional_scripted_csv' | 'undetermined';
  approachLabel: string;
  rationale: string;
  testingEmphasis: string;
  documentationBurden: 'low' | 'moderate' | 'high' | null;
  citations: Citation[];
}

export interface Part11Control {
  control: string;
  /** 'undetermined' when the input that decides it was not stated. */
  applicable: boolean | 'undetermined';
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
  /** Inputs the assessment depends on that were not stated. */
  notAssessed: Array<keyof AssessCsvParams>;
  inputStates: Record<string, BooleanState>;
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
 * Assurance approach — CSA critical thinking (GAMP 5 2nd ed / FDA CSA draft) —
 * from the GAMP category, GxP impact and direct impact. 'undetermined' while
 * an unstated impact could change it.
 */
function assuranceFor(
  category: GampCategory,
  gxpImpact: RiskBand | undefined,
  directImpact: boolean | undefined,
): AssuranceApproach {
  const level = gxpImpact === undefined ? undefined : riskIndex(gxpImpact);
  const critical = level === undefined ? undefined : level === RISK_ORDER.indexOf('critical');
  const isDirect = anyOf(directImpact, level === undefined ? undefined : level >= RISK_ORDER.indexOf('high'));
  const standardSoftware = category === '1' || category === '3';

  if (category === '5' || critical === true) {
    return {
      approach: 'traditional_scripted_csv',
      approachLabel: 'Risk-based scripted CSV (full lifecycle, custom/high-risk)',
      rationale:
        'Custom (Category 5) and/or critical direct-impact systems warrant full-lifecycle, ' +
        'scripted verification with design review and (for custom code) structural testing.',
      testingEmphasis: 'Scripted/robust testing of high-risk, direct-impact functions plus design review.',
      documentationBurden: 'high',
      citations: cites(['gamp5_riskbased', 'gamp5_csa', 'annex11_validation']),
    };
  }
  if (standardSoftware && isDirect === false) {
    return {
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
  }
  if (critical === false && (!standardSoftware || isDirect === true)) {
    return {
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
  return {
    approach: 'undetermined',
    approachLabel: 'Not determined — GxP / direct impact not assessed',
    rationale:
      'For this GAMP category the assurance approach depends on whether the system has direct ' +
      'product-quality / patient-safety impact and whether its GxP impact is critical; state ' +
      'gxpImpact and directImpact to select it.',
    testingEmphasis: 'Set once GxP impact is assessed.',
    documentationBurden: null,
    citations: cites(['gamp5_riskbased', 'gamp5_csa']),
  };
}

/**
 * Assess computer system validation per GAMP 5 (2nd ed): determine the GAMP
 * category, recommend a CSV-vs-CSA risk-based assurance approach, map the
 * applicable 21 CFR Part 11 controls, and list validation deliverables.
 */
export function assessComputerSystemValidation(params: AssessCsvParams): CsvAssessment {
  // 2026-10-15: an unknown or missing softwareType used to fall back silently to
  // GAMP Category 3; an unstated gxpImpact (directImpact not true) became
  // 'medium', printed as "GxP impact medium" and used to pick the approach; and
  // an unstated electronicSignatures made the e-signature controls not
  // applicable. The first is now refused, the others are 'undetermined'.
  // 2026-11-02: so is an unstated electronicRecords, which read as true.
  requireStated('assessComputerSystemValidation', params, ['systemDescription'], {
    softwareType: GAMP_CATEGORY_SPECS.map((s: GampCategorySpec): string => s.softwareType),
  });
  const inputStates = booleanInputStates(params, ['electronicRecords', 'electronicSignatures', 'directImpact', 'supplierAssessed']);
  const statedImpact = statedOneOf('gxpImpact', params.gxpImpact, RISK_ORDER);
  const spec = GAMP_CATEGORY_SPECS.find((s: GampCategorySpec): boolean => s.softwareType === params.softwareType) as GampCategorySpec;

  const gampClassification: GampClassification = {
    category: spec.category,
    categoryLabel: spec.label,
    novelty: spec.novelty,
    description: spec.description,
    citations: cites(['gamp5_categories', 'gamp5_riskbased']),
  };

  // GxP impact as stated, or inferred as high from stated direct impact (documented); else not assessed.
  const gxpImpact: RiskBand | undefined = statedImpact ?? (params.directImpact === true ? 'high' : undefined);
  const gxpImpactText = statedImpact
    ? `${gxpImpact}`
    : gxpImpact === undefined
      ? 'not assessed'
      : 'high (inferred from direct impact; not assessed)';
  // The approach reads a stated impact only: an inferred high could be critical.
  const assurance = assuranceFor(spec.category, statedImpact, params.directImpact);
  const notAssessed = (['gxpImpact', 'directImpact', 'electronicSignatures', 'electronicRecords'] as const).filter(
    (k) => unstated(params[k]),
  );

  // Part 11 controls
  const hasERecords: boolean | 'undetermined' = unstated(params.electronicRecords)
    ? 'undetermined'
    : params.electronicRecords === true;
  const hasESig: boolean | 'undetermined' = unstated(params.electronicSignatures)
    ? 'undetermined'
    : params.electronicSignatures === true;
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
          : `${unstated(params.supplierAssessed) ? 'Not stated whether one exists. ' : ''}` +
            'Recommended to enable leveraging of supplier activities (esp. Category 3/4).',
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
      `GAMP Category ${spec.category}, GxP impact ${gxpImpactText} → ${assurance.approachLabel}. ` +
      'Critical-thinking and supplier leveraging reduce duplicated effort on lower-risk features.',
    notAssessed,
    inputStates,
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
