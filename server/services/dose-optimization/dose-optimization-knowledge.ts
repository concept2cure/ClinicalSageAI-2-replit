/**
 * Oncology Dose Optimization (Project Optimus) — Deterministic Knowledge Engine
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pure, closed-form, reproducible knowledge base for oncology dose
 * optimization. NO LLM, NO network, NO database; it imports only the shared
 * stated-input readers and refusal. Identical input always yields identical output. An
 * unanswered boolean is not_stated, never true or false (Rule 2 S5a).
 *
 * GROUNDING / PRIMARY SOURCES
 * ───────────────────────────
 *  - FDA Oncology Center of Excellence (OCE) **Project Optimus** — initiative
 *    to reform the dose-optimization and dose-selection paradigm in oncology
 *    drug development (launched 2021).
 *  - FDA Draft Guidance for Industry, "Optimizing the Dosage of Human
 *    Prescription Drugs and Biological Products for the Treatment of Oncologic
 *    Diseases" (January 2023). [Hereafter "FDA Optimus Dosage Guidance 2023".]
 *  - FDA OCE **Project FrontRunner** — moving development of new cancer
 *    therapies to earlier clinical settings (advanced/metastatic → earlier
 *    lines), which raises the bar on tolerability and dose optimization.
 *  - ICH E4 — Dose-Response Information to Support Drug Registration (1994).
 *  - ICH S9 — Nonclinical Evaluation for Anticancer Pharmaceuticals (2010) and
 *    ICH S9 Q&A (2018).
 *  - ICH E11A / general exposure-response principles; FDA Exposure-Response
 *    Relationships Guidance (2003).
 *  - ASCO/AACR/Friends of Cancer Research dose-optimization workstreams and
 *    "Optimal Dosing" recommendations.
 *  - Model-based / model-assisted dose-finding literature: O'Quigley CRM
 *    (1990); Liu & Yuan BOIN (2015); Ji et al. mTPI / Guo et al. mTPI-2 (2017);
 *    Yan et al. Keyboard (2017); Wages/Tighiouart partial-order & TITE designs.
 *  - FDA Project Optimus public workshops (2022–2023) and the ASCO/FDA
 *    "Getting the Dose Right" discourse.
 *
 * IMPORTANT DETERMINISM CONTRACT
 * ──────────────────────────────
 * Every exported function is a pure function of its inputs. All thresholds,
 * citations, and recommendations are encoded as static tables. The engine does
 * NOT invent regulatory positions: where guidance is silent it says so.
 *
 * @module server/services/dose-optimization/dose-optimization-knowledge
 */

import { ComputationRefusal } from '../ana-biostats/computation-engine';
import { booleanInputStates, statedBoolean, statedNumber, statedOneOf } from '../immunogenicity/immunogenicity-reference';

/** Read a list by index: a non-list, or an empty or malformed entry, is refused, never dropped. */
function statedList<T>(field: string, list: unknown, read: (at: string, value: unknown) => T | undefined): T[] {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new ComputationRefusal('invalid_input', `${field} must be a list.`, field);
  return list.map((value, i) => {
    const at = `${field}[${i}]`;
    if (value === undefined || value === null) throw new ComputationRefusal('invalid_input', `${at} is empty.`, at);
    return read(at, value) as T;
  });
}
const positiveDose = (at: string, dose: unknown) => statedNumber(at, dose, n => n > 0, 'a positive number');
const statedDoses = (field: string, list: unknown) =>
  Array.from(new Set(statedList(field, list, positiveDose))).sort((a, b) => a - b);

/* eslint-disable @typescript-eslint/no-magic-numbers */

// ════════════════════════════════════════════════════════════════════════════
// SECTION 0 — SHARED TYPES
// ════════════════════════════════════════════════════════════════════════════

/** A regulatory or scientific citation rendered verbatim into outputs. */
export interface Citation {
  /** Short label, e.g. "FDA Optimus Dosage Guidance 2023". */
  source: string;
  /** Specific locator: section, page, or principle. */
  locator: string;
  /** One-line description of the cited content. */
  detail: string;
}

/** Severity of a finding / gap. */
export type Severity = 'critical' | 'major' | 'minor' | 'informational';

/** A single assessment finding. */
export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  recommendation: string;
  citations: Citation[];
}

/** Drug modality — drives PK/PD and dose-response expectations. */
export type Modality =
  | 'cytotoxic'
  | 'small_molecule_targeted'
  | 'monoclonal_antibody'
  | 'antibody_drug_conjugate'
  | 'bispecific'
  | 'cell_therapy'
  | 'immune_checkpoint_inhibitor'
  | 'radioligand'
  | 'other';

/** Mechanism class influencing the shape of the dose-toxicity curve. */
export type MechanismClass =
  | 'classical_cytotoxic'
  | 'molecularly_targeted'
  | 'immunomodulatory'
  | 'other';

/** The stated boolean answers: true, false, or not_stated when unanswered (never false). */
export type InputStates = Record<string, boolean | 'not_stated'>;

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CITATION LIBRARY (single source of truth)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Canonical citations. Functions pull from here so a citation string is never
 * fabricated or drifts between functions.
 */
interface CitationTable {
  readonly [key: string]: Citation;
}

const CITATIONS: CitationTable = {
  OPTIMUS_INITIATIVE: {
    source: 'FDA OCE Project Optimus',
    locator: 'Initiative overview (2021)',
    detail:
      'FDA Oncology Center of Excellence initiative to reform the dose-optimization ' +
      'and dose-selection paradigm in oncology drug development so that the dosage ' +
      'taken forward is optimized rather than defaulting to the maximum tolerated dose.',
  },
  OPTIMUS_GUIDANCE_PURPOSE: {
    source: 'FDA Optimus Dosage Guidance 2023',
    locator: 'Section I (Introduction) / Section III',
    detail:
      'Draft guidance "Optimizing the Dosage of Human Prescription Drugs and ' +
      'Biological Products for the Treatment of Oncologic Diseases" (Jan 2023) — ' +
      'recommends dosage optimization prior to and during registration trials.',
  },
  OPTIMUS_DOSE_RESPONSE: {
    source: 'FDA Optimus Dosage Guidance 2023',
    locator: 'Section III.A — Dose- and exposure-response characterization',
    detail:
      'Sponsors should characterize dose/exposure-response for both efficacy and ' +
      'safety, not rely on MTD alone; identify the dosage that optimizes benefit-risk.',
  },
  OPTIMUS_RANDOMIZED: {
    source: 'FDA Optimus Dosage Guidance 2023',
    locator: 'Section III.B — Randomized, parallel dose-response',
    detail:
      'A randomized, parallel dose-response trial evaluating more than one dosage ' +
      'is a recommended approach to compare activity, safety, and tolerability.',
  },
  OPTIMUS_TOTALITY: {
    source: 'FDA Optimus Dosage Guidance 2023',
    locator: 'Section III — Totality of data',
    detail:
      'Dosage selection should integrate nonclinical, clinical pharmacology (PK), ' +
      'pharmacodynamics, safety/tolerability over time, and anti-tumor activity.',
  },
  OPTIMUS_LONGITUDINAL_TOLERABILITY: {
    source: 'FDA Optimus Dosage Guidance 2023',
    locator: 'Section III — Safety and tolerability over time',
    detail:
      'Acute DLTs in cycle 1 are insufficient; assess low-grade, chronic, and ' +
      'cumulative toxicity, dose modifications, and PRO-CTCAE over multiple cycles.',
  },
  OPTIMUS_PREMARKET: {
    source: 'FDA Optimus Dosage Guidance 2023',
    locator: 'Section IV — Timing',
    detail:
      'Dosage optimization is best conducted prior to submitting a marketing ' +
      'application; post-marketing dose optimization is difficult and discouraged.',
  },
  FRONTRUNNER: {
    source: 'FDA OCE Project FrontRunner',
    locator: 'Initiative overview',
    detail:
      'Initiative to support development of cancer drugs in earlier clinical ' +
      'settings; earlier-line use heightens the need for tolerable, optimized doses.',
  },
  ICH_E4: {
    source: 'ICH E4',
    locator: 'Dose-Response Information to Support Drug Registration (1994)',
    detail:
      'Knowledge of dose-response for both effectiveness and adverse effects is ' +
      'integral to drug development; supports use of multiple doses and randomization.',
  },
  ICH_S9: {
    source: 'ICH S9',
    locator: 'Nonclinical Evaluation for Anticancer Pharmaceuticals (2010)',
    detail:
      'Nonclinical data (toxicology, PK/PD) inform starting dose and dose escalation ' +
      'for serious/life-threatening malignancies; supports HNSTD/STD10-based starts.',
  },
  ICH_S9_QA: {
    source: 'ICH S9 Q&A',
    locator: 'Questions & Answers (2018)',
    detail:
      'Clarifies starting-dose selection, use of HNSTD for biologics, and the role ' +
      'of nonclinical data in supporting dose for advanced cancer.',
  },
  FDA_EXPOSURE_RESPONSE: {
    source: 'FDA Exposure-Response Guidance 2003',
    locator: 'Exposure-Response Relationships — Study Design, Data Analysis',
    detail:
      'Exposure-response (E-R) analyses for effectiveness and safety inform dose ' +
      'selection, dose individualization, and benefit-risk.',
  },
  ASCO_FCR: {
    source: 'ASCO / Friends of Cancer Research — Optimal Dosing',
    locator: 'Dose-optimization recommendations',
    detail:
      'Multistakeholder recommendations to move beyond MTD: incorporate PK/PD, ' +
      'randomized dose comparisons, patient-reported tolerability.',
  },
  CRM: {
    source: "O'Quigley et al. (Biometrics 1990)",
    locator: 'Continual Reassessment Method',
    detail:
      'Model-based Bayesian dose-finding targeting a specified toxicity probability; ' +
      'more efficient and accurate at identifying the MTD than 3+3.',
  },
  BOIN: {
    source: 'Liu & Yuan (JRSS-C 2015)',
    locator: 'Bayesian Optimal Interval (BOIN) design',
    detail:
      'Model-assisted design with pre-tabulated escalation/de-escalation boundaries ' +
      'minimizing incorrect decisions; simple to implement, strong operating chars.',
  },
  MTPI2: {
    source: 'Guo et al. (Contemp Clin Trials 2017)',
    locator: 'Modified Toxicity Probability Interval-2 (mTPI-2)',
    detail:
      'Model-assisted interval design correcting mTPI; uses equivalence interval ' +
      'around the target toxicity rate with a decision table.',
  },
  KEYBOARD: {
    source: 'Yan, Mandrekar & Yuan (Clin Cancer Res 2017)',
    locator: 'Keyboard design',
    detail:
      'Model-assisted design using a "strongest key" toxicity interval; equivalent ' +
      'to mTPI-2 with intuitive graphical decision rule.',
  },
  THREE_PLUS_THREE: {
    source: 'Storer (Biometrics 1989) / historical 3+3',
    locator: 'Rule-based 3+3 escalation',
    detail:
      'Algorithmic design escalating in cohorts of 3; simple but imprecise, targets ' +
      'an implicit ~25-33% DLT rate and tends to under-identify the true MTD.',
  },
  TITE: {
    source: 'Cheung & Chappell (Biometrics 2000)',
    locator: 'Time-to-Event (TITE) dose-finding',
    detail:
      'Extends CRM/BOIN to use partial follow-up, enabling late-onset toxicity ' +
      '(common with immunotherapy/ADCs) to inform escalation without long pauses.',
  },
  BACKFILL: {
    source: 'Project Optimus practice / dose-expansion literature',
    locator: 'Backfill cohorts during escalation',
    detail:
      'Enrolling additional patients at previously cleared (lower) dose levels to ' +
      'enrich PK, PD, biomarker, and preliminary activity data across the dose range.',
  },
};

/** Pull a citation by key; deterministic and total. */
function cite(...keys: string[]): Citation[] {
  const out: Citation[] = [];
  for (const k of keys) {
    const c = CITATIONS[k];
    if (c) out.push(c);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — DOSE-FINDING DESIGN SELECTION
// ════════════════════════════════════════════════════════════════════════════

/** Family of dose-escalation design. */
export type DesignFamily = 'rule_based' | 'model_assisted' | 'model_based';

/** Specific dose-escalation design identifier. */
export type DesignName =
  | '3+3'
  | 'CRM'
  | 'BOIN'
  | 'mTPI-2'
  | 'Keyboard'
  | 'TITE-CRM'
  | 'TITE-BOIN';

export interface DesignProfile {
  name: DesignName;
  family: DesignFamily;
  /** Plain-language summary. */
  summary: string;
  /** Strengths relative to alternatives. */
  strengths: string[];
  /** Limitations / cautions. */
  limitations: string[];
  /** Typical operating characteristics (qualitative, deterministic). */
  operatingCharacteristics: {
    accuracyOfMtdSelection: 'low' | 'moderate' | 'high';
    patientsTreatedAtOrNearMtd: 'low' | 'moderate' | 'high';
    implementationComplexity: 'low' | 'moderate' | 'high';
    requiresStatisticianRealTime: boolean;
    handlesLateOnsetToxicity: boolean;
  };
  citations: Citation[];
}

interface DesignProfileTable {
  readonly [key: string]: DesignProfile;
}

/**
 * Static catalogue of dose-escalation designs. Annotated with an explicit
 * interface (NOT `as const`) per the TS-strictness contract.
 */
const DESIGN_PROFILES: DesignProfileTable = {
  '3+3': {
    name: '3+3',
    family: 'rule_based',
    summary:
      'Algorithmic escalation in cohorts of 3; de-escalate/expand on observed DLTs. ' +
      'Targets an implicit DLT rate near 25-33% and stops near the dose below which ' +
      '>= 2/6 patients experience a DLT.',
    strengths: [
      'Simple, transparent, requires no real-time statistical modeling.',
      'Familiar to investigators and IRBs; minimal infrastructure.',
    ],
    limitations: [
      'Imprecise estimation of the MTD; cannot target a pre-specified toxicity rate.',
      'Tends to treat many patients at sub-therapeutic doses and to stop below the true MTD.',
      'Poorly suited to molecularly targeted agents and immunotherapies where the ' +
        'optimal biological dose may lie below the MTD.',
      'Not aligned with Project Optimus expectations for rigorous dose characterization.',
    ],
    operatingCharacteristics: {
      accuracyOfMtdSelection: 'low',
      patientsTreatedAtOrNearMtd: 'low',
      implementationComplexity: 'low',
      requiresStatisticianRealTime: false,
      handlesLateOnsetToxicity: false,
    },
    citations: cite('THREE_PLUS_THREE', 'OPTIMUS_DOSE_RESPONSE'),
  },
  CRM: {
    name: 'CRM',
    family: 'model_based',
    summary:
      'Bayesian model-based design that continually updates a dose-toxicity curve and ' +
      'assigns each cohort to the dose whose estimated DLT probability is closest to a ' +
      'pre-specified target toxicity rate (e.g., 0.25 or 0.30).',
    strengths: [
      'Targets an explicit toxicity probability; high accuracy in identifying the MTD.',
      'Treats more patients at therapeutic doses than 3+3.',
      'Flexible: can incorporate prior information and skeleton.',
    ],
    limitations: [
      'Requires a pre-specified dose-toxicity model (skeleton) and prior calibration.',
      'Requires real-time statistical support and a trial statistician engaged throughout.',
      'Model misspecification can degrade performance if skeleton is poorly chosen.',
    ],
    operatingCharacteristics: {
      accuracyOfMtdSelection: 'high',
      patientsTreatedAtOrNearMtd: 'high',
      implementationComplexity: 'high',
      requiresStatisticianRealTime: true,
      handlesLateOnsetToxicity: false,
    },
    citations: cite('CRM', 'OPTIMUS_DOSE_RESPONSE'),
  },
  BOIN: {
    name: 'BOIN',
    family: 'model_assisted',
    summary:
      'Bayesian Optimal Interval design: escalate/de-escalate by comparing the observed ' +
      'DLT rate at the current dose with pre-tabulated boundaries derived from the target ' +
      'toxicity rate; decisions can be pre-computed before the trial starts.',
    strengths: [
      'Operating characteristics approaching CRM with the simplicity of an algorithm.',
      'Decision table fixed in advance — no real-time modeling required at the bedside.',
      'Transparent, easy for sites and IRBs; recommended as a modern default.',
    ],
    limitations: [
      'Still primarily a toxicity-driven MTD finder unless extended for OBD.',
      'Standard form does not natively use efficacy/PD; pair with backfill or BOIN12 for OBD.',
    ],
    operatingCharacteristics: {
      accuracyOfMtdSelection: 'high',
      patientsTreatedAtOrNearMtd: 'high',
      implementationComplexity: 'moderate',
      requiresStatisticianRealTime: false,
      handlesLateOnsetToxicity: false,
    },
    citations: cite('BOIN', 'OPTIMUS_DOSE_RESPONSE'),
  },
  'mTPI-2': {
    name: 'mTPI-2',
    family: 'model_assisted',
    summary:
      'Modified Toxicity Probability Interval-2: uses an equivalence interval around the ' +
      'target toxicity rate and a pre-computed decision table to escalate, stay, or de-escalate.',
    strengths: [
      'Corrects the original mTPI selection bias; simple decision table.',
      'No real-time modeling; strong operating characteristics.',
    ],
    limitations: [
      'Requires specification of the equivalence interval half-width.',
      'Toxicity-focused; needs augmentation for optimal biological dose.',
    ],
    operatingCharacteristics: {
      accuracyOfMtdSelection: 'high',
      patientsTreatedAtOrNearMtd: 'high',
      implementationComplexity: 'moderate',
      requiresStatisticianRealTime: false,
      handlesLateOnsetToxicity: false,
    },
    citations: cite('MTPI2', 'OPTIMUS_DOSE_RESPONSE'),
  },
  Keyboard: {
    name: 'Keyboard',
    family: 'model_assisted',
    summary:
      'Keyboard design: places a target "key" (toxicity interval) and moves toward the dose ' +
      'whose strongest key aligns with the target; graphically intuitive, equivalent to mTPI-2.',
    strengths: [
      'Intuitive graphical decision rule; pre-tabulated, no real-time modeling.',
      'Operating characteristics comparable to BOIN/mTPI-2.',
    ],
    limitations: [
      'Toxicity-driven by default; pair with PK/PD/efficacy for OBD selection.',
    ],
    operatingCharacteristics: {
      accuracyOfMtdSelection: 'high',
      patientsTreatedAtOrNearMtd: 'high',
      implementationComplexity: 'moderate',
      requiresStatisticianRealTime: false,
      handlesLateOnsetToxicity: false,
    },
    citations: cite('KEYBOARD', 'OPTIMUS_DOSE_RESPONSE'),
  },
  'TITE-CRM': {
    name: 'TITE-CRM',
    family: 'model_based',
    summary:
      'Time-to-event CRM: weights partially-followed patients by their observed follow-up so ' +
      'late-onset toxicities (common with immunotherapy and ADCs) inform escalation without ' +
      'pausing accrual for full DLT windows.',
    strengths: [
      'Handles late-onset / cumulative toxicity and long DLT windows.',
      'Maintains accuracy of CRM while shortening trial duration.',
    ],
    limitations: [
      'Requires modeling expertise and real-time statistical support.',
      'Assumptions about toxicity time distribution affect performance.',
    ],
    operatingCharacteristics: {
      accuracyOfMtdSelection: 'high',
      patientsTreatedAtOrNearMtd: 'high',
      implementationComplexity: 'high',
      requiresStatisticianRealTime: true,
      handlesLateOnsetToxicity: true,
    },
    citations: cite('TITE', 'CRM', 'OPTIMUS_DOSE_RESPONSE'),
  },
  'TITE-BOIN': {
    name: 'TITE-BOIN',
    family: 'model_assisted',
    summary:
      'Time-to-event BOIN: extends BOIN with a weighted likelihood for partial follow-up, ' +
      'retaining the pre-tabulated simplicity of BOIN while accommodating late-onset toxicity.',
    strengths: [
      'Handles late-onset toxicity with minimal added complexity.',
      'Pre-computable boundaries; no real-time modeling required.',
    ],
    limitations: [
      'Toxicity-focused unless extended; assumptions on toxicity timing matter.',
    ],
    operatingCharacteristics: {
      accuracyOfMtdSelection: 'high',
      patientsTreatedAtOrNearMtd: 'high',
      implementationComplexity: 'moderate',
      requiresStatisticianRealTime: false,
      handlesLateOnsetToxicity: true,
    },
    citations: cite('TITE', 'BOIN', 'OPTIMUS_DOSE_RESPONSE'),
  },
};

export interface SelectDoseFindingDesignParams {
  /** Drug modality. */
  modality: Modality;
  /** Mechanism class shaping the dose-toxicity relationship. */
  mechanismClass?: MechanismClass;
  /** Number of pre-specified dose levels to evaluate. */
  numberOfDoseLevels?: number;
  /** Target toxicity rate (probability, 0-1). Default 0.25 if unspecified. */
  targetToxicityRate?: number;
  /** Expected DLT window in days. Long windows favor TITE designs. */
  dltWindowDays?: number;
  /** Whether late-onset/cumulative toxicity is anticipated. */
  lateOnsetToxicityExpected?: boolean;
  /** Whether a trial statistician can support real-time adaptation. */
  realTimeStatisticianAvailable?: boolean;
  /** Whether the program intends to characterize an optimal biological dose (OBD). */
  optimalBiologicalDoseSought?: boolean;
  /** Anticipated maximum accrual for the dose-escalation portion. */
  anticipatedEscalationSampleSize?: number;
}

export interface SelectDoseFindingDesignResult {
  /** not_assessed while a fact that decides between designs is not stated. */
  recommendedDesign: DesignName | 'not_assessed';
  recommendedDesignProfile: DesignProfile | null;
  designFamily: DesignFamily | null;
  inputStates: InputStates;
  /** Ranked alternatives with one-line rationale; empty when no design is recommended. */
  rankedAlternatives: Array<{ name: DesignName; rationale: string }>;
  /** Target toxicity rate applied. */
  targetToxicityRate: number;
  /** Whether the standard 3+3 is explicitly discouraged for this context. */
  threePlusThreeDiscouraged: boolean;
  rationale: string[];
  operatingCharacteristicTradeoffs: string[];
  warnings: string[];
  citations: Citation[];
}

/**
 * Choose a dose-escalation design. Rule-based, deterministic. Encodes the
 * modern (Project Optimus-era) preference for model-assisted/model-based
 * designs over the rule-based 3+3, and routes to TITE variants when late-onset
 * toxicity is expected. Late onset or real-time statistical support left
 * unanswered recommends no design: each answer selects a different one.
 */
export function selectDoseFindingDesign(
  params: SelectDoseFindingDesignParams,
): SelectDoseFindingDesignResult {
  const warnings: string[] = [];
  const rationale: string[] = [];

  // A stated rate outside (0, 1) is refused, never replaced; only an unstated one takes the disclosed 0.25.
  const statedTargetToxicityRate = statedNumber('targetToxicityRate', params.targetToxicityRate,
    n => n > 0 && n < 1, 'a probability strictly between 0 and 1');
  const targetToxicityRate = statedTargetToxicityRate ?? 0.25;

  if (statedTargetToxicityRate === undefined) {
    rationale.push(
      'No target toxicity rate supplied; defaulting to 0.25, a common target ' +
        'for cytotoxic/targeted oncology dose-finding (often 0.20-0.35).',
    );
  } else if (statedTargetToxicityRate < 0.1 || statedTargetToxicityRate > 0.4) {
    warnings.push(
      `Target toxicity rate ${statedTargetToxicityRate} is outside the usual ` +
        '0.10-0.40 range for oncology dose-finding; confirm it is clinically justified.',
    );
  }

  const inputStates = booleanInputStates(params, ['lateOnsetToxicityExpected',
    'realTimeStatisticianAvailable', 'optimalBiologicalDoseSought']);
  // The flag, a DLT window > 28 days or the modality indicates late onset; when none does, only a stated false rules it out.
  const lateOnsetIndicated =
    inputStates.lateOnsetToxicityExpected === true ||
    (typeof params.dltWindowDays === 'number' && params.dltWindowDays > 28) ||
    params.modality === 'immune_checkpoint_inhibitor' ||
    params.modality === 'antibody_drug_conjugate' ||
    params.modality === 'cell_therapy';
  const lateOnset: boolean | 'not_stated' = lateOnsetIndicated || inputStates.lateOnsetToxicityExpected;

  if (lateOnset === true) {
    rationale.push(
      'Late-onset, cumulative, or delayed toxicity is anticipated (by modality, ' +
        'DLT window > 28 days, or explicit flag); a time-to-event (TITE) design is ' +
        'preferred so partial follow-up informs escalation without pausing accrual.',
    );
  }

  const statistician = inputStates.realTimeStatisticianAvailable;

  // Decision logic — deterministic cascade. An unanswered deciding fact selects no design.
  let recommended: DesignName | 'not_assessed';
  if (lateOnset === 'not_stated' || statistician === 'not_stated') {
    recommended = 'not_assessed';
    rationale.push(
      `No design is recommended (late-onset toxicity: ${lateOnset}; real-time statistician: ` +
        `${statistician}). Late onset selects TITE-CRM or TITE-BOIN, otherwise CRM or BOIN, by that support.`,
    );
  } else if (lateOnset && statistician) {
    recommended = 'TITE-CRM';
    rationale.push(
      'Real-time statistical support is available, so a fully model-based TITE-CRM is ' +
        'recommended for maximal accuracy with late-onset toxicity.',
    );
  } else if (lateOnset && !statistician) {
    recommended = 'TITE-BOIN';
    rationale.push(
      'Late-onset toxicity is expected but real-time modeling support is limited; ' +
        'TITE-BOIN retains pre-tabulated decision boundaries while accommodating ' +
        'delayed events.',
    );
  } else if (statistician) {
    recommended = 'CRM';
    rationale.push(
      'A trial statistician can support continuous reassessment; CRM maximizes ' +
        'accuracy of MTD identification and treats more patients at therapeutic doses.',
    );
  } else {
    recommended = 'BOIN';
    rationale.push(
      'BOIN is recommended as a modern default: operating characteristics approaching ' +
        'CRM with pre-tabulated, transparent decision rules and no real-time modeling.',
    );
  }

  // 3+3 is essentially never the affirmative recommendation in the Optimus era.
  const threePlusThreeDiscouraged = true;
  warnings.push(
    'The rule-based 3+3 design is discouraged: it cannot target a pre-specified ' +
      'toxicity rate, imprecisely estimates the MTD, and is misaligned with Project ' +
      'Optimus expectations.' + (recommended === 'not_assessed' ? '' :
      ' It is listed only as a fallback for resource-constrained contexts.'),
  );

  if (params.optimalBiologicalDoseSought === true) {
    rationale.push(
      'The program seeks an optimal biological dose (OBD), not merely an MTD.' + (recommended === 'not_assessed' ? '' :
        ' The chosen toxicity-finding design should be paired with backfill cohorts and ' +
        'integration of PK/PD and efficacy (e.g., BOIN12/uTPI-style OBD extensions, ' +
        'and/or a downstream randomized dose comparison).'),
    );
    warnings.push(
      'OBD characterization requires more than a toxicity-driven escalation design; ' +
        'plan a randomized multi-dose comparison and a totality-of-evidence RP2D step.',
    );
  }

  if (
    typeof params.numberOfDoseLevels === 'number' &&
    params.numberOfDoseLevels < 3
  ) {
    warnings.push(
      `Only ${params.numberOfDoseLevels} dose level(s) specified; characterizing a ` +
        'dose-response relationship typically requires >= 3 levels spanning the ' +
        'anticipated active and tolerable range.',
    );
  }

  if (
    typeof params.anticipatedEscalationSampleSize === 'number' &&
    params.anticipatedEscalationSampleSize < 15
  ) {
    warnings.push(
      'Anticipated escalation sample size is small (< 15); model-assisted/model-based ' +
        'designs still outperform 3+3 but precision of MTD/OBD estimation will be limited.',
    );
  }

  const profile = recommended === 'not_assessed' ? null : DESIGN_PROFILES[recommended];

  const rankedAlternatives: Array<{ name: DesignName; rationale: string }> = [];
  if (recommended !== 'BOIN') {
    rankedAlternatives.push({
      name: 'BOIN',
      rationale:
        'Strong operating characteristics with pre-tabulated, simple decision rules; ' +
        'good fallback if real-time modeling is unavailable.',
    });
  }
  if (recommended !== 'CRM' && lateOnset !== true) {
    rankedAlternatives.push({
      name: 'CRM',
      rationale:
        'Highest accuracy when a statistician supports continuous reassessment.',
    });
  }
  if ((recommended as DesignName) !== 'mTPI-2') {
    rankedAlternatives.push({
      name: 'mTPI-2',
      rationale: 'Decision-table model-assisted alternative to BOIN/Keyboard.',
    });
  }
  if ((recommended as DesignName) !== 'Keyboard') {
    rankedAlternatives.push({
      name: 'Keyboard',
      rationale: 'Graphically intuitive model-assisted alternative equivalent to mTPI-2.',
    });
  }
  rankedAlternatives.push({
    name: '3+3',
    rationale:
      'Fallback only — discouraged; use when no statistical infrastructure exists ' +
      'and the program accepts imprecise MTD estimation.',
  });

  const operatingCharacteristicTradeoffs: string[] = profile === null ? [] : [
    `MTD-selection accuracy: ${profile.operatingCharacteristics.accuracyOfMtdSelection}.`,
    `Proportion of patients treated at/near the MTD: ${profile.operatingCharacteristics.patientsTreatedAtOrNearMtd}.`,
    `Implementation complexity: ${profile.operatingCharacteristics.implementationComplexity}.`,
    profile.operatingCharacteristics.requiresStatisticianRealTime
      ? 'Requires a trial statistician engaged throughout escalation.'
      : 'Decision rules can be pre-tabulated; no real-time modeling needed.',
    profile.operatingCharacteristics.handlesLateOnsetToxicity
      ? 'Natively accommodates late-onset/cumulative toxicity via partial follow-up.'
      : 'Assumes toxicity is observable within a fixed DLT window; not ideal for ' +
        'delayed toxicity unless a TITE variant is used.',
  ];

  return {
    recommendedDesign: recommended,
    recommendedDesignProfile: profile,
    designFamily: profile ? profile.family : null,
    inputStates,
    rankedAlternatives: profile ? rankedAlternatives : [],
    targetToxicityRate,
    threePlusThreeDiscouraged,
    rationale,
    operatingCharacteristicTradeoffs,
    warnings,
    citations: cite(
      'OPTIMUS_DOSE_RESPONSE',
      'OPTIMUS_INITIATIVE',
      'ICH_E4',
      'CRM',
      'BOIN',
    ),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3 — PROJECT OPTIMUS ALIGNMENT ASSESSMENT
// ════════════════════════════════════════════════════════════════════════════

export interface AssessProjectOptimusAlignmentParams {
  /** Drug modality. */
  modality: Modality;
  /** Stage of development. */
  developmentStage:
    | 'preclinical'
    | 'phase1'
    | 'phase1_2'
    | 'phase2'
    | 'phase3'
    | 'pre_nda_bla'
    | 'post_marketing';
  /** Was dose selected solely by MTD / 3+3? */
  doseSelectedByMtdAlone: boolean;
  /** Were >= 2 doses studied in a randomized fashion? */
  randomizedDoseComparisonConducted: boolean;
  /** Number of doses carried into the randomized comparison (if any). */
  dosesInRandomizedComparison?: number;
  /** Was dose-/exposure-response for efficacy characterized? */
  exposureResponseEfficacyCharacterized: boolean;
  /** Was dose-/exposure-response for safety characterized? */
  exposureResponseSafetyCharacterized: boolean;
  /** Were PK data adequate to characterize exposure? */
  pkCharacterized: boolean;
  /** Were PD / target-engagement / biomarker data collected? */
  pdOrTargetEngagementCharacterized: boolean;
  /** Was longitudinal (multi-cycle) tolerability assessed (low-grade/chronic/cumulative)? */
  longitudinalTolerabilityAssessed: boolean;
  /** Were patient-reported outcomes (e.g., PRO-CTCAE) collected? */
  patientReportedOutcomesCollected?: boolean;
  /** Is dose optimization planned/completed before the marketing application? */
  optimizationBeforeMarketingApplication: boolean;
  /** Intended treatment setting (earlier-line raises tolerability bar — FrontRunner). */
  intendedSetting?: 'advanced_refractory' | 'earlier_line' | 'adjuvant_or_curative';
}

export interface AssessProjectOptimusAlignmentResult {
  /** 0-100 deterministic alignment score; null while any scored pillar is not stated. */
  alignmentScore: number | null;
  alignmentTier: 'strong' | 'moderate' | 'weak' | 'non_aligned' | 'not_assessed';
  inputStates: InputStates;
  gaps: Finding[];
  strengths: string[];
  recommendations: string[];
  /** Summary of how each Optimus pillar is met; not_stated when its fact was not answered. */
  pillarStatus: Array<{
    pillar: string;
    status: 'met' | 'partial' | 'not_met' | 'not_stated';
    note: string;
  }>;
  citations: Citation[];
}

/**
 * Evaluate a development program against Project Optimus expectations.
 * Deterministic scoring: each pillar contributes a fixed weight; gaps are
 * generated from unmet pillars. An unanswered pillar is not_stated: it is
 * neither met nor a gap, and the score and tier are not assessed until every
 * scored pillar is stated.
 */
export function assessProjectOptimusAlignment(
  params: AssessProjectOptimusAlignmentParams,
): AssessProjectOptimusAlignmentResult {
  const gaps: Finding[] = [];
  const strengths: string[] = [];
  const recommendations: string[] = [];
  const pillarStatus: AssessProjectOptimusAlignmentResult['pillarStatus'] = [];
  const inputStates = booleanInputStates(params, ['doseSelectedByMtdAlone', 'randomizedDoseComparisonConducted',
    'exposureResponseEfficacyCharacterized', 'exposureResponseSafetyCharacterized', 'pkCharacterized',
    'pdOrTargetEngagementCharacterized', 'longitudinalTolerabilityAssessed', 'patientReportedOutcomesCollected',
    'optimizationBeforeMarketingApplication']);
  const dosesInRandomizedComparison = statedNumber('dosesInRandomizedComparison', params.dosesInRandomizedComparison,
    n => Number.isInteger(n) && n >= 0, 'a whole number of doses');
  // An unanswered pillar is named, scores nothing and is not a gap.
  const unstated: string[] = [];
  const notStated = (pillar: string, field: string): void => {
    unstated.push(field);
    pillarStatus.push({ pillar, status: 'not_stated', note: `${field} was not stated; this pillar is not assessed.` });
  };

  let score = 0;

  // Pillar 1 — Beyond MTD (weight 20)
  if (inputStates.doseSelectedByMtdAlone === 'not_stated') {
    notStated('Selection beyond MTD', 'doseSelectedByMtdAlone');
  } else if (!inputStates.doseSelectedByMtdAlone) {
    score += 20;
    strengths.push('Dose was not selected by MTD alone — central Optimus expectation.');
    pillarStatus.push({
      pillar: 'Selection beyond MTD',
      status: 'met',
      note: 'Program does not default to the maximum tolerated dose.',
    });
  } else {
    pillarStatus.push({
      pillar: 'Selection beyond MTD',
      status: 'not_met',
      note: 'Dose appears to be selected by MTD/3+3 alone.',
    });
    gaps.push({
      id: 'OPT-MTD-ALONE',
      severity: 'critical',
      title: 'Dose selected by MTD alone',
      detail:
        'Project Optimus expects the dosage taken into registration trials to optimize ' +
        'benefit-risk, not to default to the maximum tolerated dose. For many targeted ' +
        'and immuno-oncology agents the optimal dose lies below the MTD.',
      recommendation:
        'Characterize dose-/exposure-response for efficacy and safety and select the ' +
        'dose by totality of evidence, not the highest tolerated dose.',
      citations: cite('OPTIMUS_DOSE_RESPONSE', 'OPTIMUS_GUIDANCE_PURPOSE'),
    });
  }

  // Pillar 2 — Randomized dose comparison (weight 20). The question itself asks for >= 2 doses,
  // so a stated true needs no count; a stated count below 2 is partial.
  const adequateRandomized =
    inputStates.randomizedDoseComparisonConducted === true &&
    (dosesInRandomizedComparison === undefined || dosesInRandomizedComparison >= 2);
  if (inputStates.randomizedDoseComparisonConducted === 'not_stated') {
    notStated('Randomized multi-dose comparison', 'randomizedDoseComparisonConducted');
  } else if (adequateRandomized) {
    score += 20;
    strengths.push(
      'A randomized comparison of >= 2 dosages was conducted — the approach the ' +
        'guidance highlights for dose optimization.',
    );
    pillarStatus.push({
      pillar: 'Randomized multi-dose comparison',
      status: 'met',
      note: 'Two or more dosages compared in a randomized fashion.',
    });
  } else {
    pillarStatus.push({
      pillar: 'Randomized multi-dose comparison',
      status: params.randomizedDoseComparisonConducted ? 'partial' : 'not_met',
      note: params.randomizedDoseComparisonConducted
        ? 'A randomized comparison was conducted but fewer than 2 dosages were compared.'
        : 'No randomized dose comparison was conducted.',
    });
    gaps.push({
      id: 'OPT-NO-RANDOMIZED',
      severity: 'major',
      title: 'No adequate randomized dose comparison',
      detail:
        'The guidance recommends a randomized, parallel dose-response evaluation of ' +
        'more than one dosage to compare activity, safety, and tolerability and to ' +
        'support dosage selection.',
      recommendation:
        'Conduct a randomized comparison of at least two dosages (e.g., the MTD and a ' +
        'lower candidate dose) before the registration trial reads out.',
      citations: cite('OPTIMUS_RANDOMIZED', 'ICH_E4'),
    });
  }

  // Pillar 3 — Exposure-response efficacy (weight 12)
  if (inputStates.exposureResponseEfficacyCharacterized === 'not_stated') {
    notStated('Exposure-response (efficacy)', 'exposureResponseEfficacyCharacterized');
  } else if (inputStates.exposureResponseEfficacyCharacterized) {
    score += 12;
    strengths.push('Exposure-response for efficacy was characterized.');
    pillarStatus.push({
      pillar: 'Exposure-response (efficacy)',
      status: 'met',
      note: 'E-R for efficacy available to inform dose selection.',
    });
  } else {
    pillarStatus.push({
      pillar: 'Exposure-response (efficacy)',
      status: 'not_met',
      note: 'E-R for efficacy not characterized.',
    });
    gaps.push({
      id: 'OPT-NO-ER-EFF',
      severity: 'major',
      title: 'Exposure-response for efficacy not characterized',
      detail:
        'Without an efficacy E-R analysis it is difficult to know whether the response ' +
        'has plateaued (flat E-R), which would support a lower dose with comparable activity.',
      recommendation:
        'Perform an exposure-response analysis for efficacy across the studied dose range.',
      citations: cite('FDA_EXPOSURE_RESPONSE', 'OPTIMUS_DOSE_RESPONSE'),
    });
  }

  // Pillar 4 — Exposure-response safety (weight 12)
  if (inputStates.exposureResponseSafetyCharacterized === 'not_stated') {
    notStated('Exposure-response (safety)', 'exposureResponseSafetyCharacterized');
  } else if (inputStates.exposureResponseSafetyCharacterized) {
    score += 12;
    strengths.push('Exposure-response for safety was characterized.');
    pillarStatus.push({
      pillar: 'Exposure-response (safety)',
      status: 'met',
      note: 'E-R for safety available to inform dose selection.',
    });
  } else {
    pillarStatus.push({
      pillar: 'Exposure-response (safety)',
      status: 'not_met',
      note: 'E-R for safety not characterized.',
    });
    gaps.push({
      id: 'OPT-NO-ER-SAFETY',
      severity: 'major',
      title: 'Exposure-response for safety not characterized',
      detail:
        'A safety E-R analysis is needed to understand whether toxicity rises with ' +
        'exposure across the dose range, informing the therapeutic window.',
      recommendation:
        'Perform an exposure-response analysis for key safety endpoints across doses.',
      citations: cite('FDA_EXPOSURE_RESPONSE', 'OPTIMUS_DOSE_RESPONSE'),
    });
  }

  // Pillar 5 — PK characterization (weight 8)
  if (inputStates.pkCharacterized === 'not_stated') {
    notStated('PK / exposure', 'pkCharacterized');
  } else if (inputStates.pkCharacterized) {
    score += 8;
    strengths.push('PK / exposure was adequately characterized.');
    pillarStatus.push({
      pillar: 'PK / exposure',
      status: 'met',
      note: 'Exposure metrics available across doses.',
    });
  } else {
    pillarStatus.push({
      pillar: 'PK / exposure',
      status: 'not_met',
      note: 'PK not adequately characterized.',
    });
    gaps.push({
      id: 'OPT-NO-PK',
      severity: 'major',
      title: 'PK / exposure not adequately characterized',
      detail:
        'Exposure metrics (Cmax, Cmin, AUC) at steady state across doses are the ' +
        'backbone of exposure-response and dose-individualization analyses.',
      recommendation:
        'Collect rich PK across dose levels; develop a popPK model where feasible.',
      citations: cite('OPTIMUS_TOTALITY', 'FDA_EXPOSURE_RESPONSE'),
    });
  }

  // Pillar 6 — PD / target engagement (weight 8)
  if (inputStates.pdOrTargetEngagementCharacterized === 'not_stated') {
    notStated('PD / target engagement', 'pdOrTargetEngagementCharacterized');
  } else if (inputStates.pdOrTargetEngagementCharacterized) {
    score += 8;
    strengths.push('PD / target-engagement / biomarker data were collected.');
    pillarStatus.push({
      pillar: 'PD / target engagement',
      status: 'met',
      note: 'PD or biomarker data inform the biologically active dose range.',
    });
  } else {
    pillarStatus.push({
      pillar: 'PD / target engagement',
      status: 'not_met',
      note: 'PD / target-engagement data not collected.',
    });
    gaps.push({
      id: 'OPT-NO-PD',
      severity: 'minor',
      title: 'PD / target-engagement data not collected',
      detail:
        'For molecularly targeted and immuno-oncology agents, PD/target-engagement ' +
        'biomarkers help define the biologically active dose range below the MTD.',
      recommendation:
        'Incorporate PD/target-engagement biomarkers, ideally with serial sampling ' +
        'at multiple doses (consider backfill cohorts).',
      citations: cite('OPTIMUS_TOTALITY', 'ASCO_FCR'),
    });
  }

  // Pillar 7 — Longitudinal tolerability (weight 12)
  if (inputStates.longitudinalTolerabilityAssessed === 'not_stated') {
    notStated('Longitudinal tolerability', 'longitudinalTolerabilityAssessed');
  } else if (inputStates.longitudinalTolerabilityAssessed) {
    score += 12;
    strengths.push(
      'Longitudinal (multi-cycle) tolerability — low-grade, chronic, cumulative ' +
        'toxicity and dose modifications — was assessed.',
    );
    pillarStatus.push({
      pillar: 'Longitudinal tolerability',
      status: 'met',
      note: 'Tolerability assessed beyond cycle-1 DLTs.',
    });
  } else {
    pillarStatus.push({
      pillar: 'Longitudinal tolerability',
      status: 'not_met',
      note: 'Tolerability appears limited to cycle-1 DLTs.',
    });
    gaps.push({
      id: 'OPT-NO-LONGITUDINAL',
      severity: 'major',
      title: 'Longitudinal tolerability not assessed',
      detail:
        'Cycle-1 DLTs alone understate the patient experience. The guidance emphasizes ' +
        'low-grade, chronic, and cumulative toxicity, dose interruptions/reductions, and ' +
        'discontinuations over multiple cycles.',
      recommendation:
        'Analyze dose intensity, dose modifications, and AE trajectories over time; ' +
        'collect PRO-CTCAE to capture tolerability from the patient perspective.',
      citations: cite('OPTIMUS_LONGITUDINAL_TOLERABILITY', 'OPTIMUS_TOTALITY'),
    });
  }

  // Pillar 8 — Timing / pre-marketing optimization (weight 8)
  if (inputStates.optimizationBeforeMarketingApplication === 'not_stated') {
    notStated('Pre-marketing timing', 'optimizationBeforeMarketingApplication');
  } else if (inputStates.optimizationBeforeMarketingApplication) {
    score += 8;
    strengths.push('Dose optimization is planned/completed before the marketing application.');
    pillarStatus.push({
      pillar: 'Pre-marketing timing',
      status: 'met',
      note: 'Optimization occurs before submission, as recommended.',
    });
  } else {
    pillarStatus.push({
      pillar: 'Pre-marketing timing',
      status: 'not_met',
      note: 'Optimization deferred to post-marketing.',
    });
    gaps.push({
      id: 'OPT-TIMING',
      severity: 'critical',
      title: 'Dose optimization deferred to post-marketing',
      detail:
        'The guidance states dosage optimization is best done before the marketing ' +
        'application; post-marketing optimization (e.g., via PMR/PMC) is difficult, ' +
        'slow, and may not be feasible once a dose is approved and marketed.',
      recommendation:
        'Front-load dose-optimization activities so an optimized dosage is selected ' +
        'before the registration trial and the marketing application.',
      citations: cite('OPTIMUS_PREMARKET'),
    });
  }

  // PRO-CTCAE bonus consideration (informational, no score weight beyond pillar 7).
  if (params.patientReportedOutcomesCollected === false) {
    recommendations.push(
      'Add PRO-CTCAE / patient-reported tolerability instruments; they materially ' +
        'strengthen the tolerability narrative the guidance asks for.',
    );
  }

  // Setting-based caution (Project FrontRunner).
  if (
    params.intendedSetting === 'earlier_line' ||
    params.intendedSetting === 'adjuvant_or_curative'
  ) {
    recommendations.push(
      'Intended use in an earlier-line/adjuvant/curative setting (Project FrontRunner ' +
        'context) raises the tolerability bar: patients may be on therapy longer and ' +
        'have competing curative-intent options, so an optimized, well-tolerated dose ' +
        'is especially important.',
    );
    if (params.doseSelectedByMtdAlone) {
      // Earlier-line + MTD-alone is a particularly poor combination.
      gaps.push({
        id: 'OPT-FRONTRUNNER-MTD',
        severity: 'critical',
        title: 'MTD-based dosing in an earlier-line/curative setting',
        detail:
          'Carrying an MTD-based dose into an earlier-line, adjuvant, or curative-intent ' +
          'setting is high-risk: long treatment durations magnify chronic/cumulative ' +
          'toxicity and undermine adherence and benefit-risk.',
        recommendation:
          'Prioritize dose optimization before expanding into earlier-line settings.',
        citations: cite('FRONTRUNNER', 'OPTIMUS_LONGITUDINAL_TOLERABILITY'),
      });
    }
  }

  // Stage-based caution.
  if (
    (params.developmentStage === 'phase3' ||
      params.developmentStage === 'pre_nda_bla') &&
    inputStates.randomizedDoseComparisonConducted !== 'not_stated' &&
    !adequateRandomized
  ) {
    recommendations.push(
      'At phase 3 / pre-NDA-BLA stage without a randomized dose comparison, engage FDA ' +
        '(e.g., Type B/C meeting) early; the Agency increasingly requests dose ' +
        'optimization data to support the registration dose.',
    );
  }

  if (params.developmentStage === 'post_marketing') {
    recommendations.push(
      'Post-marketing dose optimization is constrained; if a PMR for dose optimization ' +
        'is in place, design it as a randomized comparison with adequate power for ' +
        'tolerability and activity endpoints.',
    );
  }

  // Clamp & tier.
  if (score > 100) score = 100;
  if (score < 0) score = 0;

  let alignmentTier: AssessProjectOptimusAlignmentResult['alignmentTier'];
  if (unstated.length > 0) alignmentTier = 'not_assessed';
  else if (score >= 80) alignmentTier = 'strong';
  else if (score >= 55) alignmentTier = 'moderate';
  else if (score >= 30) alignmentTier = 'weak';
  else alignmentTier = 'non_aligned';
  if (unstated.length > 0) {
    recommendations.push(
      `State ${unstated.join(', ')}: no alignment score or tier is given while a scored pillar is unanswered.`,
    );
  }

  recommendations.push(
    'Document the totality-of-evidence rationale (nonclinical, PK, PD, safety over ' +
      'time, efficacy) for the selected dosage in a dose-justification narrative.',
  );

  return {
    alignmentScore: unstated.length > 0 ? null : score,
    alignmentTier,
    inputStates,
    gaps,
    strengths,
    recommendations,
    pillarStatus,
    citations: cite(
      'OPTIMUS_INITIATIVE',
      'OPTIMUS_GUIDANCE_PURPOSE',
      'OPTIMUS_DOSE_RESPONSE',
      'OPTIMUS_RANDOMIZED',
      'OPTIMUS_TOTALITY',
      'OPTIMUS_PREMARKET',
      'FRONTRUNNER',
    ),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4 — RANDOMIZED DOSE-COMPARISON DESIGN
// ════════════════════════════════════════════════════════════════════════════

export interface DesignRandomizedDoseComparisonParams {
  /** Candidate doses to compare (mg or mg/kg, label only). Must be >= 2 entries. */
  candidateDoses: number[];
  /** Unit label for the doses (e.g., "mg", "mg/kg", "mg QD"). */
  doseUnit?: string;
  /** Primary activity endpoint type. */
  primaryActivityEndpoint?:
    | 'ORR'
    | 'PFS'
    | 'OS'
    | 'pCR'
    | 'DoR'
    | 'biomarker_response'
    | 'other';
  /** Anticipated response rate at the higher dose (0-1), for ORR-type endpoints. */
  anticipatedResponseRateHighDose?: number;
  /** Whether the comparison is intended to demonstrate non-inferior activity at a lower dose. */
  goalNonInferiorActivityLowerDose?: boolean;
  /** Total feasible randomized sample size, if constrained. */
  feasibleSampleSize?: number;
  /** Timing relative to registration. */
  timing?: 'pre_registration' | 'within_registration' | 'post_marketing';
  /** Whether the program also wants a tolerability/PRO primary or co-primary. */
  tolerabilityCoPrimary?: boolean;
}

export interface DesignRandomizedDoseComparisonResult {
  numberOfArms: number;
  recommendedDoses: number[];
  doseUnit: string;
  inputStates: InputStates;
  /** Recommended allocation ratio across arms (e.g., "1:1"). */
  allocationRatio: string;
  endpointStrategy: {
    primary: string;
    coPrimaryOrKey: string[];
    rationale: string;
  };
  sampleSizeConsiderations: string[];
  /** Deterministic illustrative per-arm size; null while goalNonInferiorActivityLowerDose is not stated. */
  illustrativePerArmSize: number | null;
  illustrativeTotalSize: number | null;
  timingRecommendation: string;
  designNotes: string[];
  warnings: string[];
  citations: Citation[];
}

/**
 * Design a randomized multi-dose comparison for dose optimization.
 * Estimation-oriented (not a hypothesis-testing superiority trial by default):
 * the goal is to compare activity/safety/tolerability across >= 2 doses. An
 * unanswered non-inferiority goal gives no illustrative size, and an unanswered
 * tolerability co-primary leaves that endpoint's role not assessed.
 */
export function designRandomizedDoseComparison(
  params: DesignRandomizedDoseComparisonParams,
): DesignRandomizedDoseComparisonResult {
  const warnings: string[] = [];
  const designNotes: string[] = [];
  const sampleSizeConsiderations: string[] = [];

  const doseUnit = params.doseUnit && params.doseUnit.trim() ? params.doseUnit : 'mg';

  const cleaned = statedDoses('candidateDoses', params.candidateDoses);
  if (cleaned.length < 2) {
    throw new ComputationRefusal('missing_input', 'candidateDoses must list at least 2 distinct positive ' +
      'doses to compare: a higher (e.g., MTD-anchored) and a lower one.', 'candidateDoses');
  }
  const recommendedDoses = cleaned;
  if (cleaned.length > 3) {
    warnings.push(
      `${cleaned.length} candidate doses supplied; 2-3 arms are typically most feasible ` +
        'for a randomized dose comparison. Consider narrowing to the most informative doses.',
    );
    designNotes.push(
      'If >3 doses are scientifically necessary, consider a small multi-arm design or ' +
        'sequential dropping of inferior/intolerable arms.',
    );
  }

  const numberOfArms = recommendedDoses.length;

  // Endpoint strategy.
  const primaryEndpoint = params.primaryActivityEndpoint || 'ORR';
  const inputStates = booleanInputStates(params, ['goalNonInferiorActivityLowerDose', 'tolerabilityCoPrimary']);
  const coPrimaryOrKey: string[] = [];
  if (inputStates.tolerabilityCoPrimary === 'not_stated') {
    coPrimaryOrKey.push(
      'Tolerability endpoint role not assessed: tolerabilityCoPrimary was not stated. Longitudinal ' +
        'tolerability (dose modifications, chronic/cumulative toxicity, PRO-CTCAE) is integral either way.',
    );
  } else if (inputStates.tolerabilityCoPrimary) {
    coPrimaryOrKey.push(
      'Tolerability co-primary: dose intensity, Grade >= 3 AE rate, dose ' +
        'modifications/discontinuations, and PRO-CTCAE over multiple cycles.',
    );
  } else {
    coPrimaryOrKey.push(
      'Key secondary: longitudinal tolerability (dose modifications, chronic/cumulative ' +
        'toxicity, PRO-CTCAE).',
    );
  }
  coPrimaryOrKey.push('Exposure-response (PK/PD) supportive analyses across arms.');

  const endpointStrategy = {
    primary:
      `Comparative anti-tumor activity (primary: ${primaryEndpoint}). The comparison ` +
      'is estimation-oriented — characterize the activity of each dose rather than power ' +
      'a strict superiority test, unless a confirmatory claim is intended.',
    coPrimaryOrKey,
    rationale:
      'Per the guidance, a randomized parallel dose-response trial should compare ' +
      'activity, safety, and tolerability so the dosage with the best benefit-risk can ' +
      'be selected. Tolerability and PK/PD are integral, not afterthoughts.',
  };

  // Deterministic illustrative per-arm sizing.
  // This is an ESTIMATION-oriented heuristic, not a powered superiority calculation.
  // Rationale encoded: randomized dose-optimization arms in oncology are commonly
  // ~20-50 patients/arm to estimate ORR and tolerability with reasonable precision.
  const statedResponseRate = statedNumber('anticipatedResponseRateHighDose', params.anticipatedResponseRateHighDose,
    n => n > 0 && n < 1, 'a probability strictly between 0 and 1');
  let illustrativePerArmSize: number | null;
  if (inputStates.goalNonInferiorActivityLowerDose === 'not_stated') {
    illustrativePerArmSize = null;
    sampleSizeConsiderations.push(
      'No illustrative size is given: goalNonInferiorActivityLowerDose was not stated, and a ' +
        'non-inferiority goal on activity is sized differently from an estimation-oriented comparison.',
    );
  } else if (inputStates.goalNonInferiorActivityLowerDose) {
    // Non-inferiority on activity needs more patients than pure estimation.
    illustrativePerArmSize = 60;
    sampleSizeConsiderations.push(
      'Goal is to show non-inferior activity at a lower dose: non-inferiority on an ' +
        'activity endpoint requires a pre-specified margin and is sample-size intensive; ' +
        'a larger per-arm size (illustratively ~60) is used here.',
    );
  } else if (statedResponseRate !== undefined) {
    // Width of a 95% CI on a proportion ~ 1.96*sqrt(p(1-p)/n). Target half-width ~0.13.
    const p = statedResponseRate;
    const targetHalfWidth = 0.13;
    const n = Math.ceil((1.96 * 1.96 * p * (1 - p)) / (targetHalfWidth * targetHalfWidth));
    illustrativePerArmSize = Math.max(20, Math.min(80, n));
    sampleSizeConsiderations.push(
      `Per-arm size sized to estimate ${primaryEndpoint} with a ~+/-${(
        targetHalfWidth * 100
      ).toFixed(0)}% 95% CI half-width at an assumed response of ${(p * 100).toFixed(
        0,
      )}% (illustrative).`,
    );
  } else {
    illustrativePerArmSize = 30;
    sampleSizeConsiderations.push(
      'No anticipated response rate supplied; an illustrative ~30 patients/arm gives ' +
        'reasonable precision for activity and tolerability estimation in dose optimization.',
    );
  }

  let illustrativeTotalSize = illustrativePerArmSize === null ? null : illustrativePerArmSize * numberOfArms;

  // Honor a feasibility cap if provided.
  if (
    typeof params.feasibleSampleSize === 'number' &&
    params.feasibleSampleSize > 0 &&
    illustrativeTotalSize !== null &&
    illustrativeTotalSize > params.feasibleSampleSize
  ) {
    const cappedPerArm = Math.floor(params.feasibleSampleSize / numberOfArms);
    illustrativePerArmSize = Math.max(cappedPerArm, 1);
    illustrativeTotalSize = illustrativePerArmSize * numberOfArms;
    warnings.push(
      `Feasible total sample size (${params.feasibleSampleSize}) constrains the design to ` +
        `~${illustrativePerArmSize}/arm; precision of activity/tolerability estimates is reduced.`,
    );
  }

  sampleSizeConsiderations.push(
    'These figures are illustrative and estimation-focused. Confirm with a formal ' +
      'power/precision calculation tied to the chosen primary endpoint and margins.',
    'If a confirmatory non-inferiority or superiority claim is intended, sample size ' +
      'must be derived from the pre-specified margin, alpha, and power, and may be much larger.',
  );

  // Allocation.
  const allocationRatio = recommendedDoses.map(() => '1').join(':');
  designNotes.push(
    `Balanced ${allocationRatio} randomization across arms supports unbiased ` +
      'between-dose comparison of activity and tolerability.',
    'Stratify randomization by prognostic factors (e.g., prior therapy, performance ' +
      'status, key biomarker) to reduce confounding of the dose comparison.',
    'Collect rich PK and PD/biomarker data in every arm to enable exposure-response ' +
      'analyses that complement the randomized comparison.',
  );

  // Timing.
  const timing = params.timing || 'pre_registration';
  let timingRecommendation: string;
  if (timing === 'pre_registration') {
    timingRecommendation =
      'Pre-registration timing is preferred: complete the randomized dose comparison ' +
      'before (or early within) the registration program so the optimized dose is the ' +
      'one studied confirmatorily. Aligns with the guidance preference for pre-marketing ' +
      'optimization.';
  } else if (timing === 'within_registration') {
    timingRecommendation =
      'Embedding the randomized dose comparison within the registration program (e.g., a ' +
      'randomized dose-finding lead-in or a multi-dose stage) is acceptable; pre-specify ' +
      'the dose-selection rule and ensure the confirmatory portion uses the selected dose.';
  } else {
    timingRecommendation =
      'Post-marketing dose comparison is the least preferred option (difficult to enroll, ' +
      'slow, and may not change practice). If unavoidable (e.g., a PMR), power it ' +
      'adequately for tolerability and activity and pre-specify decision criteria.';
    warnings.push(
      'Post-marketing timing is discouraged; the guidance favors optimizing dosage before ' +
        'the marketing application.',
    );
  }

  return {
    numberOfArms,
    recommendedDoses,
    doseUnit,
    inputStates,
    allocationRatio,
    endpointStrategy,
    sampleSizeConsiderations,
    illustrativePerArmSize,
    illustrativeTotalSize,
    timingRecommendation,
    designNotes,
    warnings,
    citations: cite(
      'OPTIMUS_RANDOMIZED',
      'OPTIMUS_DOSE_RESPONSE',
      'OPTIMUS_PREMARKET',
      'ICH_E4',
      'FDA_EXPOSURE_RESPONSE',
    ),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5 — RP2D SELECTION (totality of evidence)
// ════════════════════════════════════════════════════════════════════════════

export interface DoseLevelEvidence {
  /** Dose value (label only). */
  dose: number;
  /** Observed/estimated DLT or relevant toxicity probability at this dose (0-1). */
  toxicityProbability?: number;
  /** Whether target steady-state exposure was achieved at/above this dose. */
  targetExposureAchieved?: boolean;
  /** Target engagement / PD effect saturated at/above this dose? */
  targetEngagementSaturated?: boolean;
  /** Observed response rate or activity signal (0-1) at this dose. */
  activitySignal?: number;
  /** Longitudinal tolerability acceptable at this dose (multi-cycle)? */
  longitudinalTolerabilityAcceptable?: boolean;
}

export interface SelectRP2DParams {
  /** Dose unit label. */
  doseUnit?: string;
  /** Evidence per dose level (>= 1). */
  doseLevels: DoseLevelEvidence[];
  /** The MTD, if defined (label value). */
  mtd?: number;
  /** Modality. */
  modality: Modality;
  /** Mechanism class. */
  mechanismClass?: MechanismClass;
  /** Whether efficacy/activity appears to plateau across the upper dose range. */
  activityPlateauObserved?: boolean;
}

export interface SelectRP2DResult {
  recommendedRP2D?: number;
  doseUnit: string;
  inputStates: InputStates;
  /** Why this dose (integrates MTD, PK, PD, tolerability, efficacy). */
  selectionRationale: string[];
  /** Doses considered and why each was or was not selected. */
  doseEvaluations: Array<{
    dose: number;
    verdict: 'selected' | 'viable' | 'too_toxic' | 'sub_therapeutic' | 'insufficient_data';
    note: string;
    inputStates: InputStates;
  }>;
  /** Explicit statement on MTD-vs-RP2D relationship. */
  mtdVersusRp2dStatement: string;
  warnings: string[];
  recommendations: string[];
  citations: Citation[];
}

/** One dose row as stated. */
interface StatedDoseEvidence {
  dose: number;
  toxicityProbability?: number;
  activitySignal?: number;
  inputStates: Record<
    'targetExposureAchieved' | 'targetEngagementSaturated' | 'longitudinalTolerabilityAcceptable',
    boolean | 'not_stated'
  >;
}

/** Read one row: a malformed value is refused by its input index; an unanswered one is not_stated. */
function statedDoseEvidence(l: DoseLevelEvidence, index: number): StatedDoseEvidence {
  const field = (name: string): string => `doseLevels[${index}].${name}`;
  const probability = (name: 'toxicityProbability' | 'activitySignal'): number | undefined =>
    statedNumber(field(name), l[name], n => n >= 0 && n <= 1, 'a probability between 0 and 1');
  const state = (name: keyof StatedDoseEvidence['inputStates']): boolean | 'not_stated' =>
    statedBoolean(field(name), l[name]) ?? 'not_stated';
  return {
    dose: positiveDose(field('dose'), l.dose) as number,
    toxicityProbability: probability('toxicityProbability'),
    activitySignal: probability('activitySignal'),
    inputStates: {
      targetExposureAchieved: state('targetExposureAchieved'),
      targetEngagementSaturated: state('targetEngagementSaturated'),
      longitudinalTolerabilityAcceptable: state('longitudinalTolerabilityAcceptable'),
    },
  };
}

/**
 * Recommend a Phase 2 dose (RP2D) by integrating MTD, PK exposure, target
 * engagement/PD, longitudinal safety/tolerability, and efficacy — explicitly
 * NOT simply the MTD. Deterministic selection cascade. A dose not too toxic or
 * sub-therapeutic on its stated evidence, and without stated toxicity (or an MTD
 * it does not exceed) or stated longitudinal tolerability, is insufficient_data;
 * no RP2D is selected without stated effect evidence.
 */
export function selectRP2D(params: SelectRP2DParams): SelectRP2DResult {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const selectionRationale: string[] = [];

  const doseUnit = params.doseUnit && params.doseUnit.trim() ? params.doseUnit : 'mg';

  const inputStates = booleanInputStates(params, ['activityPlateauObserved']);
  // Rows are read in input order, so a refusal names the row as it was sent.
  const levels = Array.from(params.doseLevels || []).flatMap((l: DoseLevelEvidence, index: number) =>
    l && typeof l.dose === 'number' && isFinite(l.dose) ? [statedDoseEvidence(l, index)] : [],
  );
  // Ascending by dose for deterministic evaluation.
  levels.sort((a: StatedDoseEvidence, b: StatedDoseEvidence) => a.dose - b.dose);

  const doseEvaluations: SelectRP2DResult['doseEvaluations'] = [];
  const evaluate = (
    l: StatedDoseEvidence,
    verdict: SelectRP2DResult['doseEvaluations'][number]['verdict'],
    note: string,
  ): void => {
    doseEvaluations.push({ dose: l.dose, verdict, note, inputStates: l.inputStates });
  };

  if (levels.length === 0) {
    warnings.push('No valid dose-level evidence supplied; cannot recommend an RP2D.');
    return {
      recommendedRP2D: undefined,
      doseUnit,
      inputStates,
      selectionRationale: [
        'Insufficient data: provide per-dose toxicity, PK exposure, PD/target ' +
          'engagement, tolerability, and activity to select an RP2D.',
      ],
      doseEvaluations,
      mtdVersusRp2dStatement:
        'The RP2D should be selected on totality of evidence and may be at or below the ' +
        'MTD; it should not default to the MTD.',
      warnings,
      recommendations,
      citations: cite('OPTIMUS_TOTALITY', 'OPTIMUS_DOSE_RESPONSE'),
    };
  }

  // Toxicity ceiling: a dose is "too toxic" if toxicityProbability > 0.33,
  // OR it exceeds a defined MTD.
  const toxicityCeiling = 0.33;
  const mtdDefined = typeof params.mtd === 'number' && isFinite(params.mtd);

  // Classify each dose. Tolerable needs stated toxicity (or an MTD the dose does not exceed) and
  // stated longitudinal tolerability; an unanswered one never makes a dose viable.
  const viableDoses: StatedDoseEvidence[] = [];
  for (const l of levels) {
    const aboveMtd = mtdDefined && l.dose > (params.mtd as number);
    const tooToxicByProb =
      l.toxicityProbability !== undefined && l.toxicityProbability > toxicityCeiling;
    const tolerabilityBad = l.inputStates.longitudinalTolerabilityAcceptable === false;

    if (aboveMtd) {
      evaluate(l, 'too_toxic', `Above the defined MTD (${params.mtd} ${doseUnit}); excluded.`);
      continue;
    }
    if (tooToxicByProb) {
      evaluate(l, 'too_toxic', `Toxicity probability ${(l.toxicityProbability as number).toFixed(
        2,
      )} exceeds the ${toxicityCeiling} ceiling.`);
      continue;
    }
    if (tolerabilityBad) {
      evaluate(l, 'too_toxic', 'Longitudinal (multi-cycle) tolerability deemed unacceptable.');
      continue;
    }

    // Sub-therapeutic if target exposure not achieved AND no meaningful activity.
    const exposureMissing = l.inputStates.targetExposureAchieved === false;
    const activityAbsent = l.activitySignal !== undefined && l.activitySignal <= 0.0;
    const engagementAbsent = l.inputStates.targetEngagementSaturated === false;
    if (exposureMissing && (activityAbsent || engagementAbsent)) {
      evaluate(l, 'sub_therapeutic',
        'Target exposure not achieved and no/low activity or target engagement; ' +
          'likely below the active range.');
      continue;
    }

    // Acute toxicity is stated as a probability, or bounded by a stated MTD this dose does not exceed.
    const unstated = [
      ...(l.toxicityProbability === undefined && !mtdDefined ? ['toxicityProbability (or an MTD)'] : []),
      ...(l.inputStates.longitudinalTolerabilityAcceptable === 'not_stated' ? ['longitudinalTolerabilityAcceptable'] : []),
    ];
    if (unstated.length > 0) {
      evaluate(l, 'insufficient_data', `${unstated.join(' and ')} not stated; tolerability at this dose is not assessed.`);
      continue;
    }

    viableDoses.push(l);
    evaluate(l, 'viable', `Tolerable on the stated ${l.toxicityProbability === undefined ? 'MTD' : 'toxicity'} and ` +
      'longitudinal-tolerability evidence; candidate RP2D.');
  }

  let recommendedRP2D: number | undefined;

  if (viableDoses.length === 0) {
    warnings.push(
      doseEvaluations.some(e => e.verdict === 'insufficient_data')
        ? 'No RP2D is selected: no dose level is shown tolerable and plausibly therapeutic on ' +
            'the stated evidence; each insufficient_data row names what was not stated.'
        : 'No dose level is simultaneously tolerable and plausibly therapeutic in the ' +
            'supplied evidence; reconsider the dose range or collect more data.',
    );
  } else {
    // Selection principle: prefer the LOWEST viable dose that still achieves target
    // exposure / target engagement / activity — i.e., the minimum effective dose
    // within the tolerable set, consistent with selecting below the MTD when the
    // dose-response/E-R has plateaued.
    const plateauState = inputStates.activityPlateauObserved;
    const plateau =
      plateauState === true ||
      params.mechanismClass === 'molecularly_targeted' ||
      params.mechanismClass === 'immunomodulatory' ||
      params.modality === 'monoclonal_antibody' ||
      params.modality === 'immune_checkpoint_inhibitor' ||
      params.modality === 'bispecific';

    // Find the lowest viable dose that reaches target exposure or engagement or shows activity.
    const effective = viableDoses.filter(
      (l: StatedDoseEvidence) =>
        l.inputStates.targetExposureAchieved === true ||
        l.inputStates.targetEngagementSaturated === true ||
        (l.activitySignal !== undefined && l.activitySignal > 0),
    );

    if (effective.length === 0) {
      selectionRationale.push(
        'No RP2D is selected: no tolerable dose has stated target exposure, target engagement ' +
          'or activity evidence, so the active range is not established.',
      );
      warnings.push(
        'State target exposure, target engagement or activity at the tolerable doses before an ' +
          'RP2D is selected.',
      );
    } else if (plateau) {
      recommendedRP2D = effective[0].dose; // lowest effective (ascending sorted)
      selectionRationale.push(
        'Mechanism/modality and/or an observed activity plateau indicate the dose-response ' +
          'likely flattens below the MTD; the lowest tolerable dose that achieves target ' +
          'exposure/engagement/activity is selected to optimize benefit-risk.',
      );
    } else if (plateauState === false) {
      // Cytotoxic-like: activity may rise with dose; choose the highest tolerable effective dose.
      recommendedRP2D = effective[effective.length - 1].dose;
      selectionRationale.push(
        'For this mechanism the dose-response may continue to rise; the highest tolerable ' +
          'dose that achieves target exposure/engagement/activity is selected, but still ' +
          'integrating tolerability over time rather than defaulting to the raw MTD.',
      );
    } else if (effective.length === 1) {
      recommendedRP2D = effective[0].dose;
      selectionRationale.push(
        'One tolerable dose has stated target exposure, engagement or activity evidence and is ' +
          'selected; activityPlateauObserved was not stated and would not change the choice.',
      );
    } else {
      selectionRationale.push(
        'No RP2D is selected: activityPlateauObserved was not stated and the mechanism/modality ' +
          'does not indicate a plateau, so the choice between the lowest effective tolerable dose ' +
          '(plateau) and the highest (rising dose-response) is not assessed.',
      );
    }

    // Mark the chosen dose in evaluations.
    for (const e of doseEvaluations) {
      if (e.dose === recommendedRP2D && e.verdict === 'viable') {
        e.verdict = 'selected';
        e.note = 'Selected RP2D by totality of evidence (see rationale).';
      }
    }
  }

  // Universal rationale points.
  selectionRationale.push(
    'Selection integrates MTD (toxicity ceiling), PK exposure (target attainment), ' +
      'PD/target engagement, longitudinal safety/tolerability, and efficacy/activity — ' +
      'not the MTD alone.',
  );

  let mtdVersusRp2dStatement: string;
  if (recommendedRP2D !== undefined && mtdDefined && recommendedRP2D < (params.mtd as number)) {
    mtdVersusRp2dStatement =
      `The recommended RP2D (${recommendedRP2D} ${doseUnit}) is BELOW the MTD ` +
      `(${params.mtd} ${doseUnit}), consistent with Project Optimus when the ` +
      'benefit-risk is optimized at a sub-MTD dose.';
  } else if (recommendedRP2D !== undefined && mtdDefined && recommendedRP2D === params.mtd) {
    mtdVersusRp2dStatement =
      `The recommended RP2D equals the MTD (${params.mtd} ${doseUnit}); ensure this is ` +
      'justified by exposure-response and longitudinal tolerability, not chosen by default.';
  } else {
    mtdVersusRp2dStatement =
      'The RP2D should be selected on totality of evidence and may be at or below the ' +
      'MTD; it must not default to the MTD without supporting PK/PD/tolerability/efficacy data.';
  }

  if (recommendedRP2D !== undefined) recommendations.push(
    'Confirm the selected RP2D with a randomized dose comparison where feasible, and ' +
      'document a totality-of-evidence dose-justification narrative.',
    'Continue to monitor longitudinal tolerability (dose modifications, chronic/cumulative ' +
      'toxicity, PRO-CTCAE) at the RP2D in expansion/registration.',
  );

  return {
    recommendedRP2D,
    doseUnit,
    inputStates,
    selectionRationale,
    doseEvaluations,
    mtdVersusRp2dStatement,
    warnings,
    recommendations,
    citations: cite(
      'OPTIMUS_TOTALITY',
      'OPTIMUS_DOSE_RESPONSE',
      'OPTIMUS_LONGITUDINAL_TOLERABILITY',
      'FDA_EXPOSURE_RESPONSE',
      'ASCO_FCR',
    ),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 6 — BACKFILL / DOSE-EXPANSION STRATEGY
// ════════════════════════════════════════════════════════════════════════════

export interface DesignBackfillStrategyParams {
  /** Cleared dose levels eligible for backfill (label values). */
  clearedDoseLevels: number[];
  /** Dose unit label. */
  doseUnit?: string;
  /** Data objectives to enrich at lower doses. */
  objectives?: Array<
    'pk' | 'pd' | 'biomarker' | 'target_engagement' | 'preliminary_activity' | 'tolerability'
  >;
  /** Modality (drives whether PD/target-engagement backfill is high value). */
  modality?: Modality;
  /** Whether a tumor biopsy (paired/on-treatment) is feasible. */
  biopsyFeasible?: boolean;
  /** Maximum additional patients available for backfill. */
  maxBackfillPatients?: number;
  /** Whether escalation is ongoing concurrently. */
  escalationOngoing?: boolean;
}

export interface BackfillCohortPlan {
  dose: number;
  /** null while biopsyFeasible decides the size and is not stated. */
  recommendedPatients: number | null;
  dataToCollect: string[];
  note: string;
}

export interface DesignBackfillStrategyResult {
  doseUnit: string;
  /** Per-dose backfill cohort plan. */
  cohortPlans: BackfillCohortPlan[];
  /** null while biopsyFeasible decides the size and is not stated. */
  totalBackfillPatients: number | null;
  inputStates: InputStates;
  objectivesAddressed: string[];
  operationalConsiderations: string[];
  warnings: string[];
  citations: Citation[];
}

/**
 * Design a dose-expansion/backfill strategy to enrich PK/PD/biomarker and
 * preliminary-activity data at lower (already cleared) dose levels during
 * escalation. Deterministic allocation. With a PD, target-engagement or
 * biomarker objective and biopsy feasibility unanswered, the cohort sizes are
 * not assessed, and the plan does not say a biopsy is infeasible.
 */
export function designBackfillStrategy(
  params: DesignBackfillStrategyParams,
): DesignBackfillStrategyResult {
  const warnings: string[] = [];
  const operationalConsiderations: string[] = [];

  const doseUnit = params.doseUnit && params.doseUnit.trim() ? params.doseUnit : 'mg';

  const cleared = statedDoses('clearedDoseLevels', params.clearedDoseLevels);
  const statedObjectives = statedList('objectives', params.objectives, (at, o) =>
    statedOneOf(at, o, ['pk', 'pd', 'biomarker', 'target_engagement', 'preliminary_activity', 'tolerability'] as const));
  const objectives = statedObjectives.length > 0 ? statedObjectives
    : (['pk', 'pd', 'biomarker', 'preliminary_activity'] as typeof statedObjectives);

  const objectiveLabels: Record<string, string> = {
    pk: 'Pharmacokinetics (rich sampling for exposure metrics across doses)',
    pd: 'Pharmacodynamics (PD marker modulation vs. dose)',
    biomarker: 'Biomarkers (predictive/pharmacodynamic, tumor and/or blood)',
    target_engagement: 'Target engagement (receptor occupancy / pathway inhibition)',
    preliminary_activity: 'Preliminary anti-tumor activity at lower doses',
    tolerability: 'Tolerability over time at lower doses',
  };

  const objectivesAddressed = objectives.map(
    (o: string) => objectiveLabels[o] || o,
  );

  const cohortPlans: BackfillCohortPlan[] = [];

  if (cleared.length === 0) {
    warnings.push(
      'No cleared dose levels supplied; backfill enrolls only at dose levels already ' +
        'shown to be safe during escalation.',
    );
  }

  // Deterministic per-dose backfill size: base of 6, +4 if biopsy-driven PD/target
  // engagement objectives are in play (more patients needed for paired biopsies),
  // +2 if preliminary activity is an objective. Capped by maxBackfillPatients.
  const inputStates = booleanInputStates(params, ['biopsyFeasible', 'escalationOngoing']);
  const pdObjective =
    objectives.includes('pd') ||
    objectives.includes('target_engagement') ||
    objectives.includes('biomarker');
  const wantsPdBiopsy = pdObjective && inputStates.biopsyFeasible === true;
  const wantsActivity = objectives.includes('preliminary_activity');
  // Paired biopsies add 4 per dose, so an unanswered biopsy fact leaves the size unassessed.
  const sizeAssessed = !pdObjective || inputStates.biopsyFeasible !== 'not_stated';

  let perDose = 6;
  if (wantsPdBiopsy) perDose += 4;
  if (wantsActivity) perDose += 2;

  let totalBackfillPatients: number | null = sizeAssessed ? 0 : null;
  for (const dose of cleared) {
    const dataToCollect: string[] = [];
    if (objectives.includes('pk')) {
      dataToCollect.push('Rich PK sampling (define exposure: Cmax, Cmin, AUC at steady state).');
    }
    if (objectives.includes('pd') || objectives.includes('target_engagement')) {
      dataToCollect.push(
        inputStates.biopsyFeasible === 'not_stated'
          ? 'PD / target engagement: biopsyFeasible was not stated, so the choice between paired ' +
              'tumor biopsies and peripheral markers is not assessed.'
          : inputStates.biopsyFeasible
            ? 'Paired (baseline + on-treatment) tumor biopsies for PD / target engagement.'
            : 'Peripheral PD / target-engagement markers (biopsy not feasible).',
      );
    }
    if (objectives.includes('biomarker')) {
      dataToCollect.push('Predictive and pharmacodynamic biomarkers (blood and/or tumor).');
    }
    if (objectives.includes('preliminary_activity')) {
      dataToCollect.push('Investigator-assessed response (e.g., RECIST) for activity signal.');
    }
    if (objectives.includes('tolerability')) {
      dataToCollect.push('Longitudinal tolerability incl. PRO-CTCAE and dose modifications.');
    }

    const recommendedPatients = sizeAssessed ? perDose : null;
    cohortPlans.push({
      dose,
      recommendedPatients,
      dataToCollect,
      note:
        'Backfill enrolls at this already-cleared dose in parallel with ongoing ' +
        'escalation to enrich the dose-response dataset below the MTD.',
    });
    if (totalBackfillPatients !== null) totalBackfillPatients += perDose;
  }

  if (!sizeAssessed && cohortPlans.length > 0) {
    warnings.push(
      'Cohort sizes are not assessed: state biopsyFeasible. Paired biopsies for PD, ' +
        'target-engagement or biomarker objectives add 4 patients per dose.',
    );
  }

  // Apply max cap proportionally if needed.
  if (
    typeof params.maxBackfillPatients === 'number' &&
    params.maxBackfillPatients > 0 &&
    totalBackfillPatients !== null &&
    totalBackfillPatients > params.maxBackfillPatients &&
    cohortPlans.length > 0
  ) {
    const perDoseCapped = Math.max(
      1,
      Math.floor(params.maxBackfillPatients / cohortPlans.length),
    );
    totalBackfillPatients = 0;
    for (const plan of cohortPlans) {
      plan.recommendedPatients = perDoseCapped;
      totalBackfillPatients += perDoseCapped;
    }
    warnings.push(
      `Backfill capacity (${params.maxBackfillPatients}) constrains cohorts to ` +
        `~${perDoseCapped}/dose; prioritize the doses most informative for the active range.`,
    );
  }

  // Operational considerations.
  operationalConsiderations.push(
    'Pre-specify backfill in the protocol with explicit dose-level caps, the data to be ' +
      'collected, and that backfill patients do not gate escalation decisions unless ' +
      'designed to contribute toxicity data.',
  );
  if (params.escalationOngoing) {
    operationalConsiderations.push(
      'Escalation is ongoing: ensure backfill enrollment at cleared doses does not slow ' +
        'escalation accrual; define independent slots so the two run concurrently.',
    );
  }
  if (wantsPdBiopsy) {
    operationalConsiderations.push(
      'Paired biopsies require feasibility review (accessible lesions, patient consent, ' +
        'site capability); size cohorts to account for evaluable-biopsy attrition.',
    );
  }
  operationalConsiderations.push(
    'Backfill directly supports the totality-of-evidence and exposure-response analyses ' +
      'that Project Optimus expects for dose optimization, enabling sub-MTD dose ' +
      'characterization without a separate study.',
  );
  if (
    params.modality === 'small_molecule_targeted' ||
    params.modality === 'monoclonal_antibody' ||
    params.modality === 'antibody_drug_conjugate' ||
    params.modality === 'bispecific'
  ) {
    operationalConsiderations.push(
      'For this modality, sub-MTD doses are frequently biologically active; backfill at ' +
        'lower doses is especially valuable to find the minimally effective/optimal dose.',
    );
  }

  return {
    doseUnit,
    cohortPlans,
    totalBackfillPatients,
    inputStates,
    objectivesAddressed,
    operationalConsiderations,
    warnings,
    citations: cite(
      'BACKFILL',
      'OPTIMUS_DOSE_RESPONSE',
      'OPTIMUS_TOTALITY',
      'FDA_EXPOSURE_RESPONSE',
    ),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 7 — EXPOSURE-RESPONSE ASSESSMENT
// ════════════════════════════════════════════════════════════════════════════

export interface ExposureResponsePoint {
  /** Exposure metric value (e.g., AUC or Cmin). */
  exposure: number;
  /** Response/probability (0-1) for the corresponding endpoint at this exposure. */
  response: number;
}

export interface AssessDoseExposureResponseParams {
  /** Exposure metric used (label). */
  exposureMetric?: 'AUC' | 'Cmax' | 'Cmin' | 'Cavg' | 'other';
  /** Efficacy E-R points (ordered or unordered; engine sorts by exposure). */
  efficacyExposureResponse: ExposureResponsePoint[];
  /** Safety E-R points (response = probability of the safety event). */
  safetyExposureResponse: ExposureResponsePoint[];
  /** Optional: exposure at the proposed/registration dose, to locate it on the curves. */
  exposureAtProposedDose?: number;
}

export interface AssessDoseExposureResponseResult {
  exposureMetric: string;
  /** Is the efficacy E-R effectively flat? not_assessed with fewer than 2 distinct efficacy exposures. */
  efficacyResponseFlat: boolean | 'not_assessed';
  /** Is safety rising with exposure? not_assessed with fewer than 2 distinct safety exposures. */
  safetyRisesWithExposure: boolean | 'not_assessed';
  /** Qualitative therapeutic window/index assessment. */
  therapeuticWindow: 'wide' | 'moderate' | 'narrow' | 'indeterminate';
  /** Quantitative deltas used (deterministic); null or not_assessed where a curve has fewer than 2 distinct exposures. */
  metrics: {
    efficacyResponseRangeAbsolute: number | null;
    efficacyRelativeGainAcrossRange: number | null;
    safetyResponseRangeAbsolute: number | null;
    efficacySlopeSign: 'positive' | 'flat' | 'negative' | 'not_assessed';
    safetySlopeSign: 'positive' | 'flat' | 'negative' | 'not_assessed';
  };
  interpretation: string[];
  doseImplications: string[];
  warnings: string[];
  citations: Citation[];
}

/** One E-R point per exposure at its mean response, ascending, whatever the input order; a finite response outside 0-1 is refused. */
function sortByExposure(points: ExposureResponsePoint[], curve: string): ExposureResponsePoint[] {
  const byExposure = new Map<number, number[]>();
  Array.from(points || []).forEach((p, i) => {
    if (p && Number.isFinite(p.exposure) && Number.isFinite(p.response)) {
      statedNumber(`${curve}[${i}].response`, p.response, n => n >= 0 && n <= 1, 'a probability between 0 and 1');
      byExposure.set(p.exposure, [...(byExposure.get(p.exposure) ?? []), p.response]);
    }
  });
  return Array.from(byExposure, ([exposure, rs]) => ({ exposure, response: rs.sort((a, b) => a - b).reduce((s, r) => s + r) / rs.length }))
    .sort((a, b) => a.exposure - b.exposure);
}

/** Deterministic sign of the overall slope across the exposure range. */
function overallSlopeSign(
  points: ExposureResponsePoint[],
): 'positive' | 'flat' | 'negative' {
  if (points.length < 2) return 'flat';
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.response - first.response;
  if (delta > 0.05) return 'positive';
  if (delta < -0.05) return 'negative';
  return 'flat';
}

/**
 * Exposure-response assessment for dose selection. Evaluates whether the
 * efficacy E-R is flat (supporting a lower dose) and whether safety rises with
 * exposure, and synthesizes a therapeutic-window verdict. Deterministic. A curve with fewer
 * than 2 distinct exposures has its flags and slope signs not_assessed and its range metrics
 * null, never false, flat or 0.
 */
export function assessDoseExposureResponse(
  params: AssessDoseExposureResponseParams,
): AssessDoseExposureResponseResult {
  const warnings: string[] = [];
  const interpretation: string[] = [];
  const doseImplications: string[] = [];

  const exposureMetric = params.exposureMetric || 'AUC';

  const eff = sortByExposure(params.efficacyExposureResponse, 'efficacyExposureResponse');
  const saf = sortByExposure(params.safetyExposureResponse, 'safetyExposureResponse');

  if (eff.length < 2) {
    warnings.push(
      'Fewer than 2 valid efficacy points at distinct exposures; flatness of the efficacy ' +
        'curve cannot be assessed. Provide >= 3 points spanning the dose range.',
    );
  }
  if (saf.length < 2) {
    warnings.push(
      'Fewer than 2 valid safety points at distinct exposures; the safety E-R trend cannot ' +
        'be assessed. Provide >= 3 points spanning the dose range.',
    );
  }

  // Efficacy metrics.
  const effFirst = eff.length > 0 ? eff[0].response : 0;
  const effLast = eff.length > 0 ? eff[eff.length - 1].response : 0;
  const efficacyResponseRangeAbsolute = Math.abs(effLast - effFirst);
  const efficacyRelativeGainAcrossRange =
    effFirst > 0 ? (effLast - effFirst) / effFirst : effLast > 0 ? 1 : 0;
  const efficacySlopeSign = overallSlopeSign(eff);

  // Safety metrics.
  const safFirst = saf.length > 0 ? saf[0].response : 0;
  const safLast = saf.length > 0 ? saf[saf.length - 1].response : 0;
  const safetyResponseRangeAbsolute = Math.abs(safLast - safFirst);
  const safetySlopeSign = overallSlopeSign(saf);

  // Flatness: absolute change <= 0.10 AND relative gain <= 0.20 across the range.
  const efficacyResponseFlat =
    eff.length >= 2 &&
    efficacyResponseRangeAbsolute <= 0.1 &&
    Math.abs(efficacyRelativeGainAcrossRange) <= 0.2;

  const safetyRisesWithExposure = saf.length >= 2 && safetySlopeSign === 'positive';

  // Therapeutic window verdict — deterministic decision table.
  let therapeuticWindow: 'wide' | 'moderate' | 'narrow' | 'indeterminate';
  if (eff.length < 2 || saf.length < 2) {
    therapeuticWindow = 'indeterminate';
  } else if (efficacyResponseFlat && safetyRisesWithExposure) {
    // Flat efficacy but rising toxicity => clear case for the lowest effective dose; window is narrow at higher exposures.
    therapeuticWindow = 'narrow';
  } else if (!efficacyResponseFlat && !safetyRisesWithExposure) {
    // Efficacy improves while safety stays flat => favorable.
    therapeuticWindow = 'wide';
  } else {
    therapeuticWindow = 'moderate';
  }

  // Interpretation.
  if (efficacyResponseFlat) {
    interpretation.push(
      `Efficacy exposure-response is effectively FLAT across the studied range ` +
        `(absolute change ${(efficacyResponseRangeAbsolute * 100).toFixed(0)} percentage ` +
        'points), indicating the response has plateaued — higher exposure does not buy ' +
        'meaningfully more efficacy.',
    );
    doseImplications.push(
      'A flat efficacy E-R supports selecting a LOWER dose that still achieves the ' +
        'plateau exposure, reducing toxicity without sacrificing activity.',
    );
  } else if (efficacySlopeSign === 'positive') {
    interpretation.push(
      'Efficacy increases with exposure across the studied range; the response has not ' +
        'clearly plateaued, so a lower dose may sacrifice activity. Confirm the upper end ' +
        'of the active range.',
    );
  } else if (efficacySlopeSign === 'negative') {
    interpretation.push(
      'Efficacy appears to DECREASE at higher exposure (possible inverted-U / overdosing ' +
        'effect); investigate before selecting a high dose.',
    );
    warnings.push(
      'A negative efficacy exposure-response slope is unusual; verify data quality and ' +
        'consider confounding (e.g., disease severity correlated with clearance).',
    );
  }

  if (safetyRisesWithExposure) {
    interpretation.push(
      `Safety-event probability RISES with exposure (absolute change ` +
        `${(safetyResponseRangeAbsolute * 100).toFixed(0)} percentage points); toxicity ` +
        'is exposure-dependent.',
    );
    doseImplications.push(
      'Rising safety E-R argues against the highest tolerated exposure and favors the ' +
        'lowest exposure that retains efficacy.',
    );
  } else if (saf.length >= 2) {
    interpretation.push(
      'Safety-event probability does not clearly rise with exposure over the studied ' +
        'range; the upper dose is not obviously more toxic on this metric (confirm with ' +
        'longitudinal/low-grade tolerability, which E-R on serious events can miss).',
    );
  }

  // Combined window narrative.
  if (therapeuticWindow === 'narrow') {
    doseImplications.push(
      'Narrow therapeutic window: flat efficacy with exposure-dependent toxicity is the ' +
        'archetypal Project Optimus scenario for selecting a dose BELOW the MTD.',
    );
  } else if (therapeuticWindow === 'wide') {
    doseImplications.push(
      'Wide therapeutic window: efficacy improves while toxicity stays flat; a higher ' +
        'dose may be justified, but still confirm longitudinal tolerability.',
    );
  } else if (therapeuticWindow === 'moderate') {
    doseImplications.push(
      'Moderate window: both efficacy and safety move with exposure; dose selection ' +
        'should weigh the incremental efficacy against incremental toxicity at each dose.',
    );
  } else {
    doseImplications.push(
      'Therapeutic window indeterminate from the supplied data; collect more E-R points ' +
        'across the dose range before finalizing dose selection.',
    );
  }

  // Locate proposed dose if provided.
  if (
    typeof params.exposureAtProposedDose === 'number' &&
    isFinite(params.exposureAtProposedDose) &&
    eff.length >= 2
  ) {
    const minExp = eff[0].exposure;
    const maxExp = eff[eff.length - 1].exposure;
    if (params.exposureAtProposedDose > maxExp) {
      interpretation.push(
        'The proposed-dose exposure is above the highest studied exposure; the E-R ' +
          'relationship there is extrapolated and uncertain.',
      );
      warnings.push('Proposed-dose exposure exceeds the studied E-R range (extrapolation).');
    } else if (params.exposureAtProposedDose < minExp) {
      interpretation.push(
        'The proposed-dose exposure is below the lowest studied exposure; efficacy at ' +
          'that exposure is not directly supported by the data.',
      );
      warnings.push('Proposed-dose exposure is below the studied E-R range.');
    } else {
      interpretation.push(
        'The proposed-dose exposure falls within the studied E-R range, supporting ' +
          'interpolation of efficacy and safety at that exposure.',
      );
    }
  }

  const efficacyAssessed = eff.length >= 2;
  const safetyAssessed = saf.length >= 2;
  return {
    exposureMetric,
    efficacyResponseFlat: efficacyAssessed ? efficacyResponseFlat : 'not_assessed',
    safetyRisesWithExposure: safetyAssessed ? safetyRisesWithExposure : 'not_assessed',
    therapeuticWindow,
    metrics: {
      efficacyResponseRangeAbsolute: efficacyAssessed ? efficacyResponseRangeAbsolute : null,
      efficacyRelativeGainAcrossRange: efficacyAssessed ? efficacyRelativeGainAcrossRange : null,
      safetyResponseRangeAbsolute: safetyAssessed ? safetyResponseRangeAbsolute : null,
      efficacySlopeSign: efficacyAssessed ? efficacySlopeSign : 'not_assessed',
      safetySlopeSign: safetyAssessed ? safetySlopeSign : 'not_assessed',
    },
    interpretation,
    doseImplications,
    warnings,
    citations: cite(
      'FDA_EXPOSURE_RESPONSE',
      'OPTIMUS_DOSE_RESPONSE',
      'ICH_E4',
      'OPTIMUS_TOTALITY',
    ),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION 8 — REFERENCE NOTES (documentation block, no runtime effect)
// ════════════════════════════════════════════════════════════════════════════

/**
 * REFERENCE NOTES — Project Optimus & dose optimization
 * ─────────────────────────────────────────────────────
 *
 * Why the MTD paradigm is being retired in oncology
 *   The maximum tolerated dose (MTD) paradigm was developed for classical
 *   cytotoxic chemotherapy, where efficacy and toxicity both tend to increase
 *   with dose ("more is better, up to tolerability"). For many molecularly
 *   targeted agents, immunotherapies, antibody-drug conjugates, and bispecifics,
 *   the efficacy exposure-response can plateau well below the MTD, while toxicity
 *   continues to rise. Dosing such agents at the MTD therefore exposes patients
 *   to excess toxicity with no incremental benefit. Project Optimus and the
 *   Jan-2023 draft guidance ask sponsors to characterize dose-/exposure-response
 *   and select the dose that optimizes benefit-risk.
 *
 * The Project Optimus pillars encoded in this module
 *   1. Selection beyond MTD — do not default to the MTD.
 *   2. Randomized, parallel comparison of >= 2 dosages.
 *   3. Exposure-response for both efficacy and safety.
 *   4. Totality of evidence — nonclinical, PK, PD/target engagement,
 *      longitudinal tolerability, and activity.
 *   5. Pre-marketing timing — optimize before the marketing application.
 *
 * Modern dose-finding designs (replacing 3+3)
 *   - Model-based: CRM, TITE-CRM, EWOC, partial-order CRM.
 *   - Model-assisted: BOIN, mTPI-2, Keyboard, and their OBD extensions
 *     (BOIN12, uTPI, TITE variants).
 *   These target a pre-specified toxicity rate, estimate the MTD more
 *   accurately, and treat more patients at therapeutic doses than the 3+3.
 *
 * Optimal Biological Dose (OBD) vs. MTD
 *   The OBD is the dose that best balances efficacy, safety, PK, and PD — it may
 *   be at or below the MTD. Selecting the OBD typically requires integrating
 *   toxicity-finding with PK/PD and (preferably) a randomized dose comparison.
 *
 * Backfill cohorts
 *   Backfilling already-cleared (lower) dose levels during escalation enriches
 *   PK, PD, biomarker, and preliminary-activity data across the dose range,
 *   enabling sub-MTD dose characterization without a separate study and feeding
 *   the totality-of-evidence and exposure-response analyses.
 *
 * Project FrontRunner interaction
 *   Moving therapies into earlier lines and curative-intent settings (where
 *   patients may be treated longer and have competing options) raises the
 *   tolerability bar and makes dose optimization even more consequential.
 *
 * Citations are encoded in the CITATIONS table above and surfaced verbatim by
 * each function. This module performs no network or LLM calls and is fully
 * deterministic.
 */
export const DOSE_OPTIMIZATION_KNOWLEDGE_VERSION = '1.0.0';
