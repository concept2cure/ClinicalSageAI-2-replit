/**
 * Nonclinical-to-clinical phasing expert — ICH M3(R2).
 *
 * Before a drug can move into and through clinical development, the nonclinical
 * (animal / in vitro) safety package must keep pace with the clinical phase. ICH
 * M3(R2) harmonises, across regions, *what* nonclinical studies are generally
 * expected to support each stage of clinical development, and *how long* the
 * repeat-dose toxicity studies must run to support a given clinical-trial dosing
 * duration. This service encodes that guidance and answers two questions a
 * nonclinical / regulatory lead asks daily: (1) given the clinical phase, what is
 * the nonclinical package generally expected? and (2) given the intended clinical
 * dosing duration, what is the recommended minimum duration of repeat-dose
 * toxicity studies in rodent and non-rodent species?
 *
 * ICH M3(R2) is region-neutral guidance adopted by FDA, EMA and PMDA. The
 * recommendations here are general; the timing and content of any given study is
 * justified case-by-case and regional nuances apply. The detailed design and
 * scope of each study type is governed by the dedicated ICH safety guidances
 * (S7A safety pharmacology, S2(R1) genotoxicity, S5(R3) reproductive toxicity,
 * S1 carcinogenicity) — confirm against those before relying on this aid.
 *
 * Pure / deterministic — no DB, no IO. Throws on unmodeled input rather than
 * guessing.
 *
 * References:
 *  - ICH M3(R2): Guidance on Nonclinical Safety Studies for the Conduct of Human
 *    Clinical Trials and Marketing Authorization for Pharmaceuticals (2009).
 *    Table 1 — recommended duration of repeat-dose toxicity studies to support
 *    the conduct of clinical trials.
 *  - ICH S7A: Safety Pharmacology Studies for Human Pharmaceuticals.
 *  - ICH S2(R1): Genotoxicity Testing and Data Interpretation for Pharmaceuticals
 *    Intended for Human Use.
 *  - ICH S5(R3): Detection of Reproductive and Developmental Toxicity for Human
 *    Pharmaceuticals.
 *  - ICH S1A/S1B(R1)/S1C(R2): Need for / Testing for Carcinogenicity of
 *    Pharmaceuticals.
 *
 * @module server/services/global-ri/nonclinical-requirements
 */

export type NonclinicalPhase = 'first_in_human' | 'phase2' | 'phase3' | 'marketing';

/** The ordered set of modeled clinical phases. */
export const NONCLINICAL_PHASES: NonclinicalPhase[] = [
  'first_in_human',
  'phase2',
  'phase3',
  'marketing',
];

/** A single nonclinical study expectation for a clinical phase. */
export interface NonclinicalStudy {
  /** The nonclinical study area / domain. */
  area: string;
  /** What is generally expected at this phase. */
  expectation: string;
  /** Governing ICH guidance citation. */
  citation: string;
}

export interface NonclinicalRequirements {
  phase: NonclinicalPhase;
  studies: NonclinicalStudy[];
  notes: string[];
}

/** Honest, region-neutral caveat appended to every output. */
const M3_CAVEAT =
  'ICH M3(R2) general recommendations: study timing/content is justified case-by-case and regional nuances (FDA/EMA/PMDA) may apply; confirm against the relevant ICH safety guidances (S7A, S2(R1), S5(R3), S1).';

const PHASE_REQUIREMENTS: Record<NonclinicalPhase, NonclinicalStudy[]> = {
  first_in_human: [
    {
      area: 'Safety pharmacology',
      expectation:
        'Core safety pharmacology battery (cardiovascular, respiratory, central nervous system) before first administration in humans.',
      citation: 'ICH S7A; ICH M3(R2)',
    },
    {
      area: 'Genotoxicity (in vitro)',
      expectation:
        'In vitro genotoxicity assessment (gene mutation and chromosomal damage) generally completed before first-in-human dosing.',
      citation: 'ICH S2(R1); ICH M3(R2)',
    },
    {
      area: 'Repeat-dose toxicity (two species)',
      expectation:
        'Repeat-dose toxicity studies in two species (one rodent and one non-rodent) of a duration that supports the intended clinical-trial dosing duration.',
      citation: 'ICH M3(R2) Table 1',
    },
    {
      area: 'Toxicokinetics / ADME',
      expectation:
        'Toxicokinetic and absorption/distribution/metabolism/excretion (ADME) characterisation to support exposure interpretation.',
      citation: 'ICH M3(R2); ICH S3A',
    },
    {
      area: 'Local tolerance',
      expectation:
        'Local tolerance evaluation as relevant to the intended route of administration (may be assessed within repeat-dose studies).',
      citation: 'ICH M3(R2)',
    },
  ],
  phase2: [
    {
      area: 'Genotoxicity (full battery)',
      expectation:
        'Full standard genotoxicity battery completed before initiating Phase II clinical trials.',
      citation: 'ICH S2(R1); ICH M3(R2)',
    },
    {
      area: 'Repeat-dose toxicity',
      expectation:
        'Repeat-dose toxicity studies of a duration that supports the planned Phase II trial dosing duration.',
      citation: 'ICH M3(R2) Table 1',
    },
  ],
  phase3: [
    {
      area: 'Embryo-fetal development toxicity',
      expectation:
        'Embryo-fetal development (EFD) toxicity studies generally completed to support inclusion of women of childbearing potential without strict precautions.',
      citation: 'ICH S5(R3); ICH M3(R2)',
    },
    {
      area: 'Fertility / early embryonic development',
      expectation:
        'Fertility and early embryonic development study to support inclusion of the relevant population in Phase III.',
      citation: 'ICH S5(R3); ICH M3(R2)',
    },
    {
      area: 'Repeat-dose toxicity (longer duration)',
      expectation:
        'Longer-duration repeat-dose toxicity studies supporting the extended dosing duration of confirmatory trials.',
      citation: 'ICH M3(R2) Table 1',
    },
  ],
  marketing: [
    {
      area: 'Carcinogenicity',
      expectation:
        'Carcinogenicity studies for drugs administered continuously for at least 6 months, or used chronically/intermittently for chronic or recurrent conditions.',
      citation: 'ICH S1A / S1B(R1) / S1C(R2); ICH M3(R2)',
    },
    {
      area: 'Reproductive toxicity (complete)',
      expectation:
        'Complete reproductive toxicity package, including the pre- and postnatal development (PPND) study.',
      citation: 'ICH S5(R3); ICH M3(R2)',
    },
    {
      area: 'Juvenile animal studies',
      expectation:
        'Juvenile animal toxicity studies where a pediatric indication is pursued and existing data are insufficient.',
      citation: 'ICH M3(R2); ICH S11',
    },
  ],
};

/**
 * Return the nonclinical package generally expected at a clinical phase per
 * ICH M3(R2). Pure / deterministic. Throws for an unknown phase.
 */
export function getNonclinicalRequirements(phase: NonclinicalPhase): NonclinicalRequirements {
  const studies = PHASE_REQUIREMENTS[phase];
  if (!studies) {
    throw new Error(
      `Unknown clinical phase "${phase}". Expected one of: ${NONCLINICAL_PHASES.join(', ')}.`,
    );
  }
  return {
    phase,
    // Return a defensive copy so callers cannot mutate the encoded reference table.
    studies: studies.map((s) => ({ ...s })),
    notes: [
      'Nonclinical studies should keep pace with, and be completed in time to support, the corresponding clinical phase.',
      M3_CAVEAT,
    ],
  };
}

/** A repeat-dose toxicity duration tier per ICH M3(R2) Table 1. */
interface ToxDurationTier {
  /** Stable identifier for the tier. */
  tier: string;
  /** Inclusive upper bound of clinical dosing duration in days (Infinity = open-ended). */
  maxClinicalDays: number;
  /** Recommended minimum rodent repeat-dose toxicity study duration, in months. */
  rodentMonths: number;
  /** Recommended minimum non-rodent repeat-dose toxicity study duration, in months. */
  nonRodentMonths: number;
}

/**
 * ICH M3(R2) Table 1 tiers, approximated. The boundaries use the common
 * conventions of ~2 weeks ≈ 14 days, ~1 month ≈ 30 days, ~3 months ≈ 90 days,
 * ~6 months ≈ 180 days. Tiers are ordered by ascending clinical duration.
 */
const TOX_DURATION_TIERS: ToxDurationTier[] = [
  { tier: 'up to 2 weeks', maxClinicalDays: 14, rodentMonths: 0.5, nonRodentMonths: 0.5 },
  { tier: 'up to 1 month', maxClinicalDays: 30, rodentMonths: 1, nonRodentMonths: 1 },
  { tier: 'up to 3 months', maxClinicalDays: 90, rodentMonths: 3, nonRodentMonths: 3 },
  { tier: 'up to 6 months', maxClinicalDays: 180, rodentMonths: 6, nonRodentMonths: 6 },
  { tier: 'more than 6 months', maxClinicalDays: Infinity, rodentMonths: 6, nonRodentMonths: 9 },
];

export interface ToxDurationRecommendation {
  clinicalDurationDays: number;
  tier: string;
  rodentMonths: number;
  nonRodentMonths: number;
  citation: string;
  notes: string[];
}

/**
 * Map an intended clinical-trial dosing duration (in days) to the recommended
 * minimum duration of repeat-dose toxicity studies (rodent + non-rodent) per
 * ICH M3(R2) Table 1.
 *
 * Pure / deterministic. Throws for a non-finite or non-positive duration
 * (a zero or negative dosing duration is not a modelable clinical exposure).
 */
export function recommendToxDuration(clinicalDurationDays: number): ToxDurationRecommendation {
  if (!Number.isFinite(clinicalDurationDays) || clinicalDurationDays <= 0) {
    throw new Error(
      `clinicalDurationDays must be a finite number greater than 0; received ${clinicalDurationDays}.`,
    );
  }

  const match = TOX_DURATION_TIERS.find((t) => clinicalDurationDays <= t.maxClinicalDays);
  // The final tier has maxClinicalDays = Infinity, so a match is always found.
  const tier = match ?? TOX_DURATION_TIERS[TOX_DURATION_TIERS.length - 1];

  return {
    clinicalDurationDays,
    tier: tier.tier,
    rodentMonths: tier.rodentMonths,
    nonRodentMonths: tier.nonRodentMonths,
    citation: 'ICH M3(R2) Table 1',
    notes: [
      'Recommended minimum repeat-dose toxicity study durations to support the stated clinical dosing duration; the clinical trial duration should not exceed the duration of the supporting toxicity studies.',
      'Tier boundaries are approximations of ICH M3(R2) Table 1 (2 weeks ≈ 14 days, 1 month ≈ 30 days, 3 months ≈ 90 days, 6 months ≈ 180 days).',
      M3_CAVEAT,
    ],
  };
}
