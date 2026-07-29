/**
 * Standard of evidence for efficacy ("substantial evidence") — FDA & EU.
 *
 * Before a program is designed, RA/clinical leads must know the legal standard
 * the efficacy package must meet: how many adequate, controlled trials, what
 * makes a trial "adequate and well-controlled", and when a single pivotal trial
 * can carry the claim. That standard differs between the FDA and the EU and is
 * the foundation of every clinical-development plan and end-of-Phase-2 / scientific-
 * advice discussion.
 *
 * This service encodes that standard per region — the default study requirement,
 * whether a single study is acceptable and on what conditions, the features of an
 * adequate and well-controlled study, and the governing citation — deterministically.
 * It also exposes the region-neutral catalog of acceptable control types.
 *
 * Regions: FDA (US), EU (centralised / Directive 2001/83/EC + CHMP guidance).
 *
 * Pure / deterministic — no DB, no IO. This is an indicative reference aid; the
 * evidentiary bar is indication- and context-specific (surrogate endpoints,
 * accelerated/conditional approval, rare disease, unmet need) and is confirmed
 * with the agency at scientific advice / a pre-submission meeting.
 *
 * References:
 *  - FDA: FD&C Act §505(d) (21 USC 355(d)) — "substantial evidence" of
 *    effectiveness from adequate and well-controlled investigations; 21 CFR
 *    314.126 (characteristics of an adequate and well-controlled study, and the
 *    permitted concurrent/external control types in 314.126(b)(2)); FDAMA 1997
 *    §115 (one adequate and well-controlled study plus confirmatory evidence may
 *    suffice in some cases); FDA Guidance for Industry, "Demonstrating Substantial
 *    Evidence of Effectiveness for Human Drug and Biological Products" (Dec 2019).
 *  - EU: Directive 2001/83/EC Annex I (efficacy demonstrated by adequately
 *    designed, controlled clinical trials); CHMP "Points to consider on
 *    application with 1. meta-analyses; 2. one pivotal study"
 *    (CPMP/EWP/2330/99) — a single pivotal trial may be acceptable given strong
 *    statistical persuasiveness, internal/external consistency, and clinical
 *    relevance.
 *
 * @module server/services/global-ri/clinical-evidence-standards
 */

export type EvidenceRegion = 'FDA' | 'EU';

/** The regions for which an efficacy evidentiary standard is modeled. */
export const EVIDENCE_REGIONS: readonly EvidenceRegion[] = ['FDA', 'EU'] as const;

export interface EvidenceStandard {
  region: EvidenceRegion;
  /** The named legal/regulatory standard (e.g. "substantial evidence of effectiveness"). */
  standard: string;
  /** The default (historical / customary) number and type of studies expected. */
  defaultStudyRequirement: string;
  /** Whether a single adequate/pivotal study may, in some cases, suffice. */
  singleStudyAcceptable: boolean;
  /** The conditions under which a single study may be accepted. */
  singleStudyCriteria: string[];
  /** Features that make a study "adequate and well-controlled" / pivotal. */
  wellControlledFeatures: string[];
  /** Governing citation. */
  citation: string;
  notes: string[];
}

/**
 * Caveat shared by both regions: the evidentiary standard is not a fixed count —
 * it is indication- and context-specific and is confirmed with the agency.
 */
const CONTEXT_CAVEAT =
  'Evidentiary standards are indication- and context-specific (e.g. surrogate endpoints, accelerated/conditional approval, rare/orphan disease, serious unmet need) — confirm the required evidence package with the agency at scientific advice / a pre-submission (e.g. end-of-Phase-2 / pre-NDA-BLA) meeting.';

/**
 * Features of an "adequate and well-controlled investigation" per 21 CFR 314.126(a)/(b).
 * Shared as the canonical FDA list; the EU pivotal-trial list mirrors the same
 * scientific principles under Directive 2001/83/EC Annex I / ICH E6 & E9.
 */
const ADEQUATE_WELL_CONTROLLED_FEATURES: readonly string[] = [
  'A clear statement of the study objective(s) and a protocol/method of analysis fixed in advance',
  'A valid comparison with a control to provide a quantitative assessment of drug effect',
  'Adequate methods of patient selection, assignment, and randomization to minimize bias',
  'Adequate measures (e.g. blinding/masking) taken to minimize bias on the part of subjects, observers, and analysts',
  'Well-defined and reliable methods of assessing subjects\' response (the endpoints)',
  'Adequate analysis of the results to assess the effect of the drug',
] as const;

const EVIDENCE_STANDARDS: Record<EvidenceRegion, EvidenceStandard> = {
  FDA: {
    region: 'FDA',
    standard: 'Substantial evidence of effectiveness — evidence from adequate and well-controlled investigations',
    defaultStudyRequirement:
      'Historically two adequate and well-controlled clinical investigations, each independently establishing effectiveness (replication of the finding).',
    singleStudyAcceptable: true,
    singleStudyCriteria: [
      'Since FDAMA 1997 §115 and the 2019 FDA guidance, one adequate and well-controlled clinical investigation PLUS confirmatory evidence may, in some cases, suffice.',
      'The single trial is itself adequate and well-controlled, with statistically very persuasive, internally consistent, and clinically meaningful results (e.g. a robust p-value, effect on a clinically important endpoint such as mortality).',
      'Confirmatory evidence supports the single trial — e.g. mechanistic/pharmacologic data, evidence from a related indication, a compelling natural-history comparison, or supportive data from the same trial.',
      'Reliance on a single study is most defensible where a second trial is impractical or unethical (e.g. large mortality trial, rare disease).',
    ],
    wellControlledFeatures: [...ADEQUATE_WELL_CONTROLLED_FEATURES],
    citation: 'FD&C Act §505(d) (21 USC 355(d)); 21 CFR 314.126; FDAMA 1997 §115; FDA Guidance "Demonstrating Substantial Evidence of Effectiveness" (Dec 2019)',
    notes: [CONTEXT_CAVEAT],
  },
  EU: {
    region: 'EU',
    standard: 'Efficacy demonstrated by adequately designed, controlled clinical trials (confirmatory/pivotal trials)',
    defaultStudyRequirement:
      'Typically confirmatory (pivotal) clinical trials — efficacy is normally demonstrated by more than one adequately designed, controlled pivotal trial.',
    singleStudyAcceptable: true,
    singleStudyCriteria: [
      'Per the CHMP points-to-consider (CPMP/EWP/2330/99), one pivotal trial may be acceptable on an exceptional basis.',
      'The single pivotal trial shows strong statistical persuasiveness (e.g. a compelling p-value beyond conventional thresholds).',
      'Results show internal consistency (across key subgroups, endpoints, and centres) and external consistency (biological plausibility, agreement with the wider evidence base).',
      'The treatment effect is clinically relevant and the trial is of high quality and free from substantial flaws.',
    ],
    wellControlledFeatures: [...ADEQUATE_WELL_CONTROLLED_FEATURES],
    citation: 'Directive 2001/83/EC Annex I; CHMP "Points to consider on application with 1. meta-analyses; 2. one pivotal study" (CPMP/EWP/2330/99)',
    notes: [CONTEXT_CAVEAT],
  },
};

/**
 * Get the efficacy evidentiary standard ("substantial evidence" of effectiveness)
 * for a region. Pure / deterministic. Throws for an unmodeled region.
 */
export function getEvidenceStandard(region: EvidenceRegion): EvidenceStandard {
  const standard = EVIDENCE_STANDARDS[region];
  if (!standard) {
    throw new Error(`No efficacy evidence standard modeled for region "${region}".`);
  }
  return standard;
}

export interface ControlType {
  /** Stable identifier for the control type. */
  id:
    | 'placebo_concurrent'
    | 'active_concurrent'
    | 'dose_comparison'
    | 'no_treatment_concurrent'
    | 'historical_external';
  name: string;
  description: string;
}

export interface ControlTypesCatalog {
  controlTypes: ControlType[];
  citation: string;
  notes: string[];
}

const CONTROL_TYPES: ControlType[] = [
  {
    id: 'placebo_concurrent',
    name: 'Placebo concurrent control',
    description: 'Subjects are randomized concurrently to the test treatment or to a placebo; the design isolates the drug effect against no active treatment.',
  },
  {
    id: 'active_concurrent',
    name: 'Active (positive) treatment concurrent control',
    description: 'Subjects are randomized concurrently to the test treatment or to a known effective therapy — used for superiority or non-inferiority comparisons.',
  },
  {
    id: 'dose_comparison',
    name: 'Dose-comparison concurrent control',
    description: 'Subjects are randomized concurrently to two or more doses of the test drug; effectiveness is inferred from a dose-response relationship.',
  },
  {
    id: 'no_treatment_concurrent',
    name: 'No-treatment concurrent control',
    description: 'Subjects are randomized concurrently to the test treatment or to no treatment, where objective endpoints make blinding unnecessary.',
  },
  {
    id: 'historical_external',
    name: 'Historical (external) control',
    description: 'The treated group is compared with experience external to the study (historical or other patients) — generally the weakest design, acceptable mainly where the disease course is highly predictable and the effect is dramatic.',
  },
];

/**
 * Get the region-neutral catalog of acceptable control types for an adequate and
 * well-controlled study, per 21 CFR 314.126(b)(2). Pure / deterministic.
 */
export function getControlTypes(): ControlTypesCatalog {
  return {
    controlTypes: CONTROL_TYPES,
    citation: '21 CFR 314.126(b)(2)',
    notes: [
      'Control types are enumerated by FDA (21 CFR 314.126(b)(2)); the same scientific designs underpin EU controlled trials under Directive 2001/83/EC Annex I.',
      'The choice of control is indication-specific; placebo control may be unethical where effective therapy exists, in which case an active-control (non-inferiority) or add-on design is used.',
    ],
  };
}
