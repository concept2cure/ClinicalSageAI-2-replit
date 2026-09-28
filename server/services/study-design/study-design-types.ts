/**
 * Study Design object model — the design-as-data spine (USDM / ICH M11-aligned).
 *
 * The study is a structured object, not a document. The protocol, synopsis, SAP
 * skeleton, Schedule of Activities, eligibility list, registration record and CRF
 * shell are all *projections* of this object. Editing the design once is what makes
 * "the value agrees everywhere" true from inception.
 *
 * This module is the canonical TypeScript shape of that object. It deliberately
 * carries no persistence and no AI: it is the contract that the schema mirrors, the
 * gates validate, and every projection renders from. The estimand shape is reused
 * verbatim from the estimand→SAP renderer so an estimand captured here maps onto the
 * SAP section with no translation.
 *
 * Object graph (per the module spec §0):
 *   StudyDesign → Objectives → Estimands → Endpoints → DesignType → Population →
 *   Arms/Interventions → Randomization → ScheduleOfActivities → StatisticalPlan →
 *   SafetyDesign — each node provenance-linked to its evidence.
 *
 * @module server/services/study-design/study-design-types
 */

import type { EstimandInput, EstimandStrategy } from '../estimand-sap-section';
import type { SoaActivityLocation } from './dct-profile';

export type { EstimandInput, EstimandStrategy, IntercurrentEventInput } from '../estimand-sap-section';

// ─── Vocabularies ────────────────────────────────────────────────────────────

/** Development phase. FIH = first-in-human; phases align with ICH/registry usage. */
export type StudyPhase = 'FIH' | '1' | '1b' | '2' | '2b' | '3' | '3b' | '4';

/** Inferential frame (ICH E9). Non-inferiority and equivalence carry extra obligations. */
export type InferentialFrame = 'superiority' | 'non_inferiority' | 'equivalence';

/** Structural design family. */
export type StructuralDesign =
  | 'parallel_group'
  | 'crossover'
  | 'factorial'
  | 'dose_ranging'
  | 'single_arm'
  | 'adaptive'
  | 'platform'
  | 'basket'
  | 'umbrella'
  | 'mams';

/** Control choice per ICH E10. */
export type ControlType =
  | 'placebo'
  | 'active'
  | 'dose_response'
  | 'external'
  | 'historical'
  | 'none';

/** Objective tier; each objective ties to an endpoint and an estimand. */
export type ObjectiveLevel = 'primary' | 'secondary' | 'exploratory';

/** Endpoint role within the testing hierarchy. */
export type EndpointRole = 'primary' | 'key_secondary' | 'secondary' | 'exploratory' | 'safety';

/** Endpoint measurement family — drives method–endpoint matching in the SAP. */
export type EndpointType =
  | 'continuous'
  | 'binary'
  | 'time_to_event'
  | 'ordinal'
  | 'count'
  | 'composite'
  | 'patient_reported';

/**
 * Regulatory-acceptance status of an endpoint for the indication/agency. Drives
 * the §3 endpoint red-flags: a surrogate that still needs qualification, or a novel
 * endpoint without prior agreement, is a defensibility risk.
 */
export type RegulatoryAcceptance =
  | 'accepted_precedent'
  | 'novel_needs_agreement'
  | 'surrogate_needs_qualification'
  | 'unspecified';

/** Analysis population kinds, defined once and reused across the design. */
export type AnalysisPopulationKind = 'ITT' | 'mITT' | 'PP' | 'Safety' | 'PK';

/** Allocation method for randomization. */
export type AllocationMethod = 'simple' | 'block' | 'stratified' | 'minimization' | 'none';

/** Blinding level. */
export type BlindingLevel = 'open' | 'single' | 'double' | 'triple';

// ─── Provenance ──────────────────────────────────────────────────────────────

/**
 * A provenance link from a design node to the evidence that justifies it. Every
 * substantive design decision should carry at least one. Ungrounded decisions are
 * not fabricated away — they are surfaced by the gates.
 */
export interface EvidenceRef {
  /** Kind of evidence: prior trial, TPP, guidance, precedent, assumption, literature. */
  kind: 'prior_data' | 'tpp' | 'guidance' | 'precedent' | 'assumption' | 'literature';
  /** Free-text description of the source. */
  source: string;
  /** Optional stable identifier (NCT id, guidance code, DOI, internal id). */
  ref?: string;
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

export interface Objective {
  level: ObjectiveLevel;
  /** Ordering within its level (drives the testing hierarchy for key secondaries). */
  order: number;
  text: string;
  /** Endpoint this objective is measured by (by endpoint name). */
  endpointName: string;
  /** Estimand this objective targets (by endpoint name; one estimand per endpoint). */
  estimandEndpointName?: string;
}

export interface Endpoint {
  name: string;
  role: EndpointRole;
  type: EndpointType;
  /** What is measured, e.g. "change from baseline in HbA1c". */
  definition: string;
  /** Measurement method / instrument. */
  measurementMethod?: string;
  /** Assessment timepoint, e.g. "week 24". */
  timepoint?: string;
  /** Responder definition (for responder endpoints). */
  responderDefinition?: string;
  /** Direction of benefit: higher or lower is better. */
  direction?: 'increase' | 'decrease' | 'either';
  /** True if this endpoint is a surrogate for clinical benefit. */
  isSurrogate?: boolean;
  /** For time_to_event endpoints: the event definition. Absent ⇒ §3 red flag. */
  eventDefinition?: string;
  /** For patient_reported endpoints: the validated instrument for the population. */
  validatedInstrument?: string;
  /** For composite endpoints: the components. */
  compositeComponents?: string[];
  regulatoryAcceptance?: RegulatoryAcceptance;
  evidence?: EvidenceRef[];
}

export interface DesignFramework {
  inferentialFrame: InferentialFrame;
  structuralDesign: StructuralDesign;
  controlType: ControlType;
  /** Non-inferiority / equivalence margin (required when the frame demands one). */
  margin?: number;
  /** Justification for the NI margin or the equivalence bounds. */
  marginJustification?: string;
  /** Justification for the control choice per ICH E10 (required for external/historical). */
  controlJustification?: string;
  /** Adaptive features in play, when structuralDesign is adaptive/platform/etc. */
  adaptiveFeatures?: Array<
    'group_sequential' | 'sample_size_reestimation' | 'seamless_2_3' | 'arm_dropping' | 'response_adaptive'
  >;
  /** MRCT (ICH E17) regional-consistency considerations, when multi-regional. */
  mrct?: { regions: string[]; poolingStrategy?: string; consistencyApproach?: string };
}

export interface AnalysisPopulation {
  kind: AnalysisPopulationKind;
  /** Exact definition of the population. */
  definition: string;
  /** True when this population is (co-)primary for the primary analysis. */
  isPrimaryAnalysisSet?: boolean;
}

export interface EligibilityCriterion {
  type: 'inclusion' | 'exclusion';
  text: string;
  /** Controlled-vocabulary codes (MedDRA, SNOMED, LOINC, lab thresholds). */
  codes?: Array<{ system: string; code: string; label?: string }>;
}

export interface Population {
  targetDescription: string;
  analysisPopulations: AnalysisPopulation[];
  eligibility: EligibilityCriterion[];
  /** Pediatric (ICH E11(R1)) considerations, where applicable. */
  pediatric?: { applicable: boolean; ageRange?: string; rationale?: string };
}

export interface Intervention {
  name: string;
  /** 'investigational' | 'comparator' | 'placebo' | 'standard_of_care' | 'device'. */
  role: 'investigational' | 'comparator' | 'placebo' | 'standard_of_care' | 'device';
  dose?: string;
  regimen?: string;
  route?: string;
  duration?: string;
}

export interface Arm {
  name: string;
  interventions: Intervention[];
  /** Dose-modification / titration / rescue rules, where applicable. */
  doseModificationRules?: string;
}

export interface Randomization {
  /** Allocation ratio across arms, e.g. [1, 1] or [2, 1]. */
  ratio: number[];
  allocationMethod: AllocationMethod;
  stratificationFactors?: string[];
  blinding: BlindingLevel;
  blindingRationale?: string;
  emergencyUnblindingProcedure?: string;
}

/** A single planned analysis bound to an endpoint and (transitively) an estimand. */
export interface PlannedAnalysis {
  endpointName: string;
  /** Statistical method, e.g. "MMRM", "Cox PH", "CMH", "log-rank". */
  method: string;
  /** Estimand the analysis targets (by endpoint name). */
  estimandEndpointName?: string;
}

export interface MultiplicityStrategy {
  /** 'fixed_sequence' | 'gatekeeping' | 'holm' | 'hochberg' | 'graphical' | 'alpha_spending' | 'none'. */
  method:
    | 'fixed_sequence'
    | 'gatekeeping'
    | 'holm'
    | 'hochberg'
    | 'graphical'
    | 'alpha_spending'
    | 'none';
  /** Explicit alpha-allocation trace across the hierarchy. */
  alphaAllocation?: Array<{ endpointName: string; alpha: number }>;
}

export interface InterimDesign {
  informationFractions: number[];
  spendingFunction?: 'obrien_fleming' | 'pocock' | 'lan_demets' | 'linear';
  efficacyBoundaries?: number[];
  futilityBoundaries?: (number | null)[];
  dmcRole?: string;
}

/**
 * The sponsor's planning assumptions for an MMRM-analysed continuous
 * endpoint — the inputs an MMRM sample size needs and the design cannot infer.
 * See mmrm-sizing.ts; every value is a sponsor assumption, none is defaulted.
 */
export interface MmrmAssumptions {
  /** The design endpoint the MMRM analyses (by name). */
  endpointName: string;
  /** Post-baseline visits in the model. */
  visits: number;
  covariance: 'compound_symmetry' | 'ar1';
  /** Within-subject correlation, 0 ≤ ρ < 1 (CS: common; AR(1): lag-1). */
  rho: number;
  /** SD of the response at each visit, same units as `delta`. */
  sigma: number;
  /** Between-arm difference in mean at the target visit. */
  delta: number;
  /** Fraction still observed at each visit, monotone non-increasing, length = visits. */
  retention: number[];
  /** 1-based visit the contrast is tested at; the final visit when absent. */
  targetVisit?: number;
  /** n₂/n₁; 1 when absent. */
  allocationRatio?: number;
  /** Where the assumptions came from (prior study, literature). */
  source?: string;
}

export interface StatisticalPlan {
  /** One/two-sided alpha for the primary test. */
  alpha?: number;
  oneSided?: boolean;
  /** Target power for the primary endpoint (and key secondaries via the hierarchy). */
  power?: number;
  /** Planned sample size (total). */
  plannedSampleSize?: number;
  /** Assumed dropout rate (0–1). */
  dropoutRate?: number;
  plannedAnalyses: PlannedAnalysis[];
  multiplicity?: MultiplicityStrategy;
  /** Missing-data strategy; must align with the estimand (no LOCF-as-primary). */
  missingDataStrategy?: string;
  interim?: InterimDesign;
  /** Planning assumptions for an MMRM-analysed endpoint. See mmrm-sizing.ts. */
  mmrmAssumptions?: MmrmAssumptions;
  /** Whether sensitivity analyses across assumption ranges were specified. */
  sensitivityAnalysesSpecified?: boolean;
  /** Power assumptions, with provenance, feeding the §6 red-flags. */
  powerAssumptions?: {
    effectSize?: number;
    /** Effect size actually observed in the prior phase, when known (optimism-bias check). */
    priorPhaseObservedEffect?: number;
    /** Historical dropout for the indication/population, when known. */
    historicalDropoutRate?: number;
    eventRate?: number;
    variance?: number;
    evidence?: EvidenceRef[];
  };
}

/**
 * The dose-escalation design of a dose-finding study. Only BOIN (Liu & Yuan
 * 2015) is modelled because it is the method this repository has a
 * deterministic engine for (`stats/dose-finding-boin.ts`); a design using
 * another method records none of this and the projection says so.
 */
export interface DoseEscalationDesign {
  method: 'boin';
  /** Target DLT rate φ, strictly between 0 and 1. */
  targetToxicity: number;
  /** Ordered dose levels, lowest first. */
  doseLevels: Array<{ label: string; dose?: string }>;
  /** Patients per cohort. */
  cohortSize: number;
  /** Maximum number of patients in the escalation. */
  maxSampleSize: number;
  /** 0-based index into `doseLevels` of the starting dose. */
  startingDoseIndex?: number;
  /** Stop once this many patients have been treated at the current dose. */
  stopWhenAtDoseN?: number;
  /** BOIN neighbourhood; the engine's defaults are 0.6φ and 1.4φ when absent. */
  phi1?: number;
  phi2?: number;
  /** Posterior P(p > φ) above which a dose is eliminated; engine default 0.95 when absent. */
  eliminationThreshold?: number;
}

export interface SafetyDesign {
  aeDefinitions?: string;
  /** Stopping rules (individual and study-level). */
  stoppingRules?: string;
  /** Dose-limiting toxicity logic for early phase. */
  dltDefinition?: string;
  /** The dose-escalation rules a dose-finding study follows (FDA dosage-optimization guidance, 2024). */
  doseEscalation?: DoseEscalationDesign;
  /** DSMB/DMC charter summary. */
  dmcCharter?: {
    present: boolean;
    composition?: string;
    meetingCadence?: string;
    hasStatisticalMember?: boolean;
    unblindingProcedure?: string;
  };
}

// ─── Schedule of Activities (ICH M11 §1.3 / USDM ScheduleOfActivities / CDISC) ───

/** Trial epoch a visit belongs to (ICH M11 / CDISC SDTM epoch). */
export type SoaEpochKind = 'screening' | 'run_in' | 'treatment' | 'follow_up' | 'unscheduled';

/** Cell state at an (activity × visit) intersection. */
export type SoaCellState = 'performed' | 'conditional' | 'optional';

/** Activity grouping; drives row ordering and the §7 category roll-up. */
export type SoaActivityCategory =
  | 'administrative'
  | 'eligibility'
  | 'drug_administration'
  | 'efficacy'
  | 'safety'
  | 'pk'
  | 'pd'
  | 'biomarker'
  | 'patient_reported';

/** A study epoch (screening, treatment, follow-up). Visits group under epochs. */
export interface SoaEpoch {
  id: string;
  name: string;
  kind: SoaEpochKind;
  /** Column-group order, left to right. */
  order: number;
}

/** A scheduled visit — one column of the time-and-events grid. */
export interface SoaVisit {
  id: string;
  name: string;
  /** Epoch this visit belongs to (by epoch id). */
  epochId: string;
  /** Planned study day relative to first dose (day 1). Screening days are negative. */
  studyDay?: number;
  /** Visit window in days; e.g. 3 means ±3 days. */
  windowDays?: number;
  /** The baseline / randomization / first-dose anchor visit. */
  isBaseline?: boolean;
  /** Unscheduled / as-needed visit (e.g. early termination). */
  unscheduled?: boolean;
  /** Column order within the grid. */
  order: number;
}

/** A procedure or assessment — one row of the grid. */
export interface SoaActivity {
  id: string;
  name: string;
  category: SoaActivityCategory;
  /** Endpoint(s) whose measurement this activity collects (by endpoint name). */
  endpointNames?: string[];
  /** Footnotes attached to the whole activity row. */
  footnoteIds?: string[];
  /** Row order within the grid. */
  order: number;
  /**
   * The specimen this activity collects, when it collects one. Optional and
   * additive: absent means the design does not say; the biospecimen profile
   * reports a sampling activity without one as unspecified. See
   * biospecimen-profile.ts.
   */
  specimen?: SoaSpecimen;
  /**
   * Where the activity is performed (FDA decentralized-elements guidance, 2024).
   * Optional and additive: ABSENT means the design does not say — the DCT
   * profile reports it `unstated`, never `site` — so every design persisted
   * before this field existed reads exactly as it did. See dct-profile.ts.
   */
  location?: SoaActivityLocation;
}

/** A specimen an SoA activity collects: what the lab manual and the consent are written from. */
export interface SoaSpecimen {
  type: 'blood' | 'urine' | 'tissue' | 'csf' | 'saliva' | 'stool' | 'swab' | 'other';
  /** Volume per collection in mL (required for blood to total draw volumes). */
  volumeMl?: number;
  /** Processing (e.g. "centrifuge within 30 min, aliquot 2 × 1 mL plasma"). */
  processing?: string;
  /** Storage and shipping (e.g. "−80 °C, batch-shipped on dry ice"). */
  storage?: string;
  /** How long it is kept and for what; future research use needs consent. */
  retention?: string;
}

/** One filled intersection of the (activity × visit) grid. The grid is sparse. */
export interface SoaCell {
  activityId: string;
  visitId: string;
  state: SoaCellState;
  footnoteIds?: string[];
}

/** A footnote referenced by cells or activity rows. */
export interface SoaFootnote {
  id: string;
  text: string;
}

/**
 * The Schedule of Activities — the time-and-events grid. Visits are columns
 * (grouped by epoch), activities are rows (grouped by category), and the grid is
 * sparse: only the performed/conditional/optional intersections are listed as cells.
 * This is a design node in its own right; it round-trips on the design object.
 */
export interface ScheduleOfActivities {
  id?: string;
  epochs: SoaEpoch[];
  visits: SoaVisit[];
  activities: SoaActivity[];
  /** Sparse: only the cells that are performed/conditional/optional are present. */
  cells: SoaCell[];
  footnotes?: SoaFootnote[];
}

// ─── The root object ─────────────────────────────────────────────────────────

/**
 * The full structured Study Design. Every projection (protocol, SAP, SoA,
 * registration, CRF shell) renders from this. Fields are optional where a design
 * may legitimately be a work-in-progress; the gates decide whether a partial design
 * is allowed to advance.
 */
/**
 * Regulatory-strategy attributes that the regional rule engine
 * (`server/services/region-design-rules.ts`) reads and that no other node on
 * this object carries.
 *
 * Added 2026-09-22. `region-rules-adapter.ts` measured the cost of their
 * absence: for a design without these fields, ELEVEN OF ELEVEN region rules
 * come back not-assessed — ICH E5 bridging, ICH E14 thorough QT, post-Brexit
 * UK separation, Swiss and Brazilian local submission, Project Orbis and the
 * FDA diversity action plan could not be decided at all. Its unmapped ledger
 * named each missing field and this node is that list, made recordable.
 *
 * Every field is OPTIONAL and absence is load-bearing: absent means "not
 * recorded", which the adapter reports as not-assessed. A recorded `false` is
 * a statement the sponsor made; an absent field is not, and the two must never
 * collapse into one another.
 *
 * These are strategy attributes, not design structure. They live here because
 * the rules that read them are evaluated against the design, and because a
 * design that cannot state whether an ethnic-sensitivity assessment exists
 * cannot be assessed against ICH E5.
 */
export interface RegulatoryStrategy {
  /** An ICH E5 intrinsic/extrinsic ethnic-factor assessment has been performed. */
  ethnicSensitivityAssessed?: boolean;
  /** A thorough QT/QTc study is part of the programme (ICH E14). */
  thoroughQt?: boolean;
  /** That QT assessment includes the regional population. */
  qtInRegionalPopulation?: boolean;
  /**
   * An FDA diversity action plan with enrollment goals by demographic subgroup
   * exists for this trial (FDORA 2022 §3601).
   */
  diversityPlan?: boolean;
  /**
   * A local legal representative is appointed, keyed by agency code
   * ('FDA', 'EMA', 'PMDA', 'MHRA', 'NMPA', 'Swissmedic', 'ANVISA'). Keyed by
   * string rather than by the engine's `Agency` union so this module stays
   * free of a dependency on the rule engine.
   */
  localSponsorRepresentative?: Record<string, boolean>;
  /**
   * A reliance pathway is planned (Access Consortium, Project Orbis, or
   * another recognition route).
   */
  usesReliancePathway?: boolean;
  /**
   * The trial is in oncology. Recorded rather than inferred: `indication` is
   * free text with no coded therapeutic area, and keyword-matching it to
   * decide Project Orbis eligibility would be a guess.
   */
  oncology?: boolean;
}

/**
 * The sponsor's planned accrual — the input an enrollment forecast needs and
 * the design cannot infer. Every rate is a SPONSOR input (site feasibility,
 * prior studies); nothing on the platform assumes one.
 */
export interface AccrualPlan {
  /** The unit every rate and activation time is expressed in. */
  timeUnit: 'week' | 'month';
  sites: Array<{
    id: string;
    country?: string;
    /** Mean patients recruited per time unit once the site is active. */
    meanRate: number;
    /** Between-site coefficient of variation of the rate (Gamma); 0 ⇒ a fixed rate. */
    rateCv?: number;
    /** Time units after study start at which the site begins recruiting. */
    activationTime?: number;
  }>;
  /** Where the rates came from, e.g. "site feasibility questionnaires, 2026-08". */
  rateSource?: string;
  /** Fixed Monte Carlo seed; when absent the engine derives one from the inputs. */
  seed?: number;
}

/**
 * A pre-specified plan to borrow from an external (historical / real-world)
 * control. Every value is the sponsor's; see external-control-plan.ts.
 */
export interface ExternalControlPlan {
  /** Where the external control comes from (named study, registry, RWD source). */
  source: string;
  /** The design endpoint the borrowing is for. */
  endpointName: string;
  /** Summary of the external control on that endpoint. */
  historical: { n: number; mean: number; se: number };
  /** How strength is borrowed. */
  method: 'power_prior' | 'commensurate';
  /** Power-prior discount, 0 ≤ a0 ≤ 1 (power_prior only). */
  a0?: number;
  /** Commensurability variance τ² ≥ 0 (commensurate only). */
  tau2?: number;
  /** Planned concurrent (randomised) control size; 0 for a fully external control. */
  plannedConcurrentControlN: number;
  /** Assumed SD of the endpoint, to express the planned concurrent control's precision. */
  assumedSd?: number;
  /** A tipping-point sensitivity analysis is pre-specified. */
  tippingPointAnalysisPlanned?: boolean;
  /** Covariate balance between the populations is pre-specified (e.g. SMDs, weighting). */
  covariateBalancePlanned?: boolean;
}

/**
 * The structure of a master protocol (platform, basket, umbrella, MAMS): its
 * sub-studies and the rules that govern them. Every value is the sponsor's;
 * see master-protocol.ts.
 */
export interface MasterProtocolPlan {
  subStudies: Array<{
    id: string;
    name: string;
    /** The population or disease the sub-study enrols. */
    population: string;
    /** The biomarker that assigns participants to it (basket / umbrella). */
    biomarker?: string;
    /** The assay that measures the biomarker, and its validation status. */
    biomarkerAssay?: string;
    /** Arm names (design `arms`) this sub-study randomises between. */
    arms: string[];
    /** Its own statistical hypothesis and decision rule, stated. */
    decisionRule?: string;
  }>;
  /**
   * The arm several sub-studies share as control. `null` states there is none;
   * absent means the plan does not say.
   */
  sharedControlArm?: string | null;
  /** Whether comparisons use controls enrolled before a treatment arm opened. */
  nonConcurrentControls?: 'not_used' | 'used_with_time_adjustment' | 'used';
  /** How a new arm or sub-study is added (amendment, IRB, randomisation update). */
  armAdditionProcedure?: string;
  /** When an arm is dropped for futility or efficacy. */
  armDroppingRules?: string;
  /** How type I error is handled across sub-studies. */
  multiplicityAcrossSubStudies?: string;
}

export interface StudyDesign {
  /** Stable id (set once persisted; optional for an in-memory/proposed design). */
  id?: string;
  programId?: string;
  organizationId?: number;

  /** The official (scientific) title — the title of the protocol. */
  title: string;
  /**
   * The lay-language title registries publish for the public: the
   * ClinicalTrials.gov Brief Title, WHO TRDS item 9 Public Title, the EU CTIS
   * public title. Recorded by a person; never derived from `title`, and a
   * projection never shows `title` in its place as if it were one.
   */
  publicTitle?: string;
  /** The acronym the study is publicly known by, if it has one (ClinicalTrials.gov Acronym; WHO TRDS item 10). */
  acronym?: string;
  phase: StudyPhase;
  indication: string;
  /** Product type — drug/biologic/device/ivd drive domain-specific rules. */
  productType?: 'drug' | 'biologic' | 'device' | 'ivd' | 'combination';
  targetRegions?: string[];

  objectives: Objective[];
  estimands: EstimandInput[];
  endpoints: Endpoint[];
  framework: DesignFramework;
  population: Population;
  arms: Arm[];
  randomization?: Randomization;
  /** Schedule of Activities is modeled in a dedicated slice; referenced here by id. */
  scheduleOfActivitiesId?: string;
  /** The inline Schedule of Activities, when carried on the object. Round-trips via persistence. */
  scheduleOfActivities?: ScheduleOfActivities;
  statisticalPlan: StatisticalPlan;
  safety?: SafetyDesign;
  /** The planned site accrual an enrollment forecast runs on. See enrollment-projection.ts. */
  accrualPlan?: AccrualPlan;
  /** A pre-specified external-control borrowing plan. See external-control-plan.ts. */
  externalControlPlan?: ExternalControlPlan;
  /** The sub-studies and governing rules of a master protocol. See master-protocol.ts. */
  masterProtocol?: MasterProtocolPlan;

  /**
   * Regulatory-strategy attributes the regional rules read. Absent fields are
   * reported as not-assessed by `region-rules-adapter.ts`, never as `false`.
   */
  regulatoryStrategy?: RegulatoryStrategy;

  /** Lifecycle status; advancing past `draft` is gated by §17/§20. */
  status?: 'draft' | 'in_review' | 'qc' | 'approved';
  version?: number;
  evidence?: EvidenceRef[];
}

/** Endpoint roles that require a complete estimand before the design can advance. */
export const ESTIMAND_REQUIRED_ROLES: readonly EndpointRole[] = ['primary', 'key_secondary'] as const;

/** Convenience: the primary endpoint(s) of a design. */
export function primaryEndpoints(design: StudyDesign): Endpoint[] {
  return (design.endpoints ?? []).filter(e => e.role === 'primary');
}
