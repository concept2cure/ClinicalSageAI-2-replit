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

export interface SafetyDesign {
  aeDefinitions?: string;
  /** Stopping rules (individual and study-level). */
  stoppingRules?: string;
  /** Dose-limiting toxicity logic for early phase. */
  dltDefinition?: string;
  /** DSMB/DMC charter summary. */
  dmcCharter?: {
    present: boolean;
    composition?: string;
    meetingCadence?: string;
    hasStatisticalMember?: boolean;
    unblindingProcedure?: string;
  };
}

// ─── Schedule of Activities (ICH M11 §7 / USDM ScheduleOfActivities / CDISC) ───

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
export interface StudyDesign {
  /** Stable id (set once persisted; optional for an in-memory/proposed design). */
  id?: string;
  programId?: string;
  organizationId?: number;

  title: string;
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
