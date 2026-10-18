/**
 * Special-designations eligibility expert — orphan + pediatric across markets.
 *
 * Sponsors of rare-disease and pediatric programs can qualify for special
 * regulatory designations that unlock incentives (fee waivers, market
 * exclusivity, scientific advice) and/or carry obligations (pediatric study
 * plans). The eligibility tests are statutory and market-specific. This service
 * encodes the genuine criteria for orphan and pediatric designations per market
 * and assesses a product's profile against them — deterministically, so the same
 * inputs always yield the same eligibility verdict and rationale.
 *
 * Markets: FDA (US), EMA (EU centralised), PMDA (JP). The criteria capture the
 * core statutory thresholds; sponsor regulatory affairs and the agency remain
 * the authority for edge cases (this is a readiness aid, honest-by-construction).
 * Where a fact a market's orphan screen needs is not supplied, the assessor
 * declines to guess: the screen is 'not_assessed' and names the missing facts.
 * A criterion no input carries (the FDA cost-recovery prong, the EU
 * insufficient-return limb, the PMDA criteria besides prevalence) is named in
 * `notAssessedCriteria`, and a screen that waits on it is 'not_assessed' too.
 *
 * Pure / deterministic — no DB, no IO.
 *
 * References:
 *  - FDA Orphan Drug Designation: Orphan Drug Act; 21 CFR Part 316 — disease/
 *    condition affecting fewer than 200,000 persons in the US (or no expectation
 *    of recovering development/marketing costs from US sales).
 *  - FDA Pediatric: PREA (21 USC 355c) — pediatric assessment required for most
 *    NDAs/BLAs, Pediatric Study Plan (PSP) due by end of Phase 2; BPCA
 *    (21 USC 355a) — written-request pediatric exclusivity incentive.
 *  - EMA Orphan: Regulation (EC) No 141/2000 — prevalence not more than 5 in
 *    10,000 in the EU, life-threatening or chronically debilitating, and either
 *    no satisfactory method exists or significant benefit over existing methods.
 *  - EMA Pediatric: Regulation (EC) No 1901/2006 — a Paediatric Investigation
 *    Plan (PIP) is required for a marketing-authorisation application unless
 *    waived or deferred.
 *  - PMDA Orphan and Pediatric: the criteria, the paediatric development plan
 *    duty and their bases are read from the one Japanese programmes record,
 *    server/services/ind/ctd/jp-programs.ts (`pmda-orphan-drug`,
 *    `jp-pediatric-development-plan`). The 50,000-patient threshold applied in
 *    assessOrphan is the predicate for the record's first orphan criterion.
 *
 * @module server/services/global-ri/special-designations
 */

import { getJpProgram, jpProgramBasisLabel, jpProgramCriteriaText } from '../ind/ctd/jp-programs';

export type Market = 'FDA' | 'EMA' | 'PMDA';

const JP_ORPHAN = getJpProgram('pmda-orphan-drug');
const JP_PEDIATRIC_PLAN = getJpProgram('jp-pediatric-development-plan');

export interface DesignationCriteria {
  /** Orphan program name for the market. */
  orphanProgram: string;
  /** Plain-language statement of the orphan eligibility threshold. */
  orphanCriteria: string;
  /** Pediatric program / framework name for the market. */
  pediatricProgram: string;
  /** Plain-language statement of the pediatric requirement. */
  pediatricCriteria: string;
  /** Legal citation(s). */
  citation: string;
}

/** Encoded orphan + pediatric eligibility criteria, by market. */
export const DESIGNATION_REFERENCE: Record<Market, DesignationCriteria> = {
  FDA: {
    orphanProgram: 'FDA Orphan Drug Designation (ODD)',
    orphanCriteria:
      'Disease or condition affecting fewer than 200,000 persons in the US, or no reasonable expectation of recovering development and marketing costs from US sales.',
    pediatricProgram: 'Pediatric Research Equity Act (PREA) / Best Pharmaceuticals for Children Act (BPCA)',
    pediatricCriteria:
      'PREA requires a pediatric assessment for most NDAs/BLAs; an initial Pediatric Study Plan (PSP) is due by the end of Phase 2. BPCA offers written-request pediatric exclusivity incentives.',
    citation: 'Orphan Drug Act; 21 CFR Part 316; PREA (21 USC 355c); BPCA (21 USC 355a)',
  },
  EMA: {
    orphanProgram: 'EMA Orphan Medicinal Product Designation',
    orphanCriteria:
      'Prevalence not more than 5 in 10,000 in the EU and the condition is life-threatening or chronically debilitating (or, alternatively, insufficient return on investment under Art 3(1)(a)), and either no satisfactory authorised method exists or the product offers significant benefit over existing methods.',
    pediatricProgram: 'Paediatric Investigation Plan (PIP)',
    pediatricCriteria:
      'A Paediatric Investigation Plan (PIP) is required for a marketing-authorisation application unless a waiver or deferral applies.',
    citation: 'Regulation (EC) No 141/2000 (orphan); Regulation (EC) No 1901/2006 (paediatric)',
  },
  PMDA: {
    orphanProgram: 'PMDA / MHLW Orphan Drug Designation',
    orphanCriteria: `${jpProgramCriteriaText(JP_ORPHAN)}.`,
    pediatricProgram: `${JP_PEDIATRIC_PLAN.name} (${JP_PEDIATRIC_PLAN.nameJa})`,
    pediatricCriteria: `${JP_PEDIATRIC_PLAN.description} In force from ${JP_PEDIATRIC_PLAN.effectiveFrom}.`,
    citation: `${jpProgramBasisLabel(JP_ORPHAN)}; ${jpProgramBasisLabel(JP_PEDIATRIC_PLAN)}`,
  },
};

export interface DesignationInput {
  market: Market;
  /** Estimated US prevalence (number of persons). */
  usPrevalence?: number;
  /** Estimated EU prevalence per 10,000 persons. */
  euPrevalencePer10k?: number;
  /** Estimated Japan prevalence (number of patients). */
  jpPrevalence?: number;
  /** Whether the condition is life-threatening / seriously debilitating. */
  seriousOrLifeThreatening?: boolean;
  /** Whether no satisfactory authorised treatment exists. */
  noSatisfactoryTreatment?: boolean;
  /** Whether the product offers significant benefit over existing methods. */
  significantBenefit?: boolean;
  /** Whether the program includes pediatric development. */
  pediatricDevelopment?: boolean;
}

export interface OrphanAssessment {
  /**
   * The orphan screen on the stated facts (not a designation, which only the
   * agency grants): true when met, false when a stated fact fails it,
   * 'not_assessed' when it waits on a fact not stated (see `missing`) or on a
   * criterion it does not assess (see `notAssessedCriteria`).
   */
  eligible: boolean | 'not_assessed';
  program: string;
  rationale: string;
  /** The inputs the screen needed that were not stated. Empty when none. */
  missing: (keyof DesignationInput)[];
  /** Criteria the verdict waits on that no input carries, so they were not assessed. Empty when none. */
  notAssessedCriteria: string[];
}

/** FDA's alternative to the prevalence prong (the reference's own wording); no input carries it. */
const FDA_COST_RECOVERY_PRONG =
  'No reasonable expectation of recovering development and marketing costs from US sales (the alternative to the prevalence threshold)';
/** Regulation (EC) No 141/2000's alternative to the prevalence limb; no input carries it and its text is not held here. */
const EMA_INSUFFICIENT_RETURN_LIMB =
  'Insufficient return on investment (Regulation (EC) No 141/2000 Art 3(1)(a), the alternative to the prevalence limb)';
/** The record's first PMDA orphan criterion is the prevalence threshold; the others have no input. */
const [JP_ORPHAN_PREVALENCE_CRITERION, ...JP_ORPHAN_UNASSESSED_CRITERIA] = JP_ORPHAN.criteria;

export interface PediatricAssessment {
  applicable: boolean;
  requirement: string;
  obligation: string;
}

export interface DesignationResult {
  market: Market;
  orphan: OrphanAssessment;
  pediatric?: PediatricAssessment;
  /** Names of designations the product appears eligible for, sorted. */
  designations: string[];
  /** Deterministic, ordered advisory notes. */
  notes: string[];
}

/**
 * Assess orphan + pediatric designation eligibility for a market.
 *
 * Orphan eligibility applies the market's statutory threshold. A criterion fails
 * only when a stated fact fails it; when a fact the screen needs is not supplied
 * (and none fails), orphan is 'not_assessed' with the missing inputs named,
 * rather than guessed. Pediatric assessment is produced when pediatricDevelopment
 * is true.
 *
 * Pure / deterministic. Designations and notes are sorted for stable output.
 */
export function assessDesignationEligibility(input: DesignationInput): DesignationResult {
  const ref = DESIGNATION_REFERENCE[input.market];
  const notes: string[] = [];
  const designations: string[] = [];

  const orphan = assessOrphan(input, ref, notes);
  if (orphan.eligible === true) {
    designations.push(orphan.program);
  }

  let pediatric: PediatricAssessment | undefined;
  if (input.pediatricDevelopment) {
    pediatric = assessPediatric(input.market, ref);
    designations.push(ref.pediatricProgram);
    notes.push(
      `Pediatric development declared: ${ref.pediatricProgram} obligations apply for ${input.market}.`,
    );
  }

  designations.sort((a, b) => a.localeCompare(b));
  notes.sort((a, b) => a.localeCompare(b));

  return {
    market: input.market,
    orphan,
    pediatric,
    designations,
    notes,
  };
}

function assessOrphan(
  input: DesignationInput,
  ref: DesignationCriteria,
  notes: string[],
): OrphanAssessment {
  const program = ref.orphanProgram;

  // 2026-10-15: a missing prevalence returned eligible:false (a "no" for a screen
  // that was never run), and the EMA criteria were read with `=== true`, so an
  // unstated fact was reported as unmet ("not life-threatening/seriously
  // debilitating"). A criterion is now unmet only when a stated fact fails it.
  if (input.market === 'FDA') {
    if (input.usPrevalence != null && input.usPrevalence < 200000) {
      return {
        eligible: true,
        program,
        rationale: `US prevalence ${input.usPrevalence} is fewer than 200,000 — meets the FDA Orphan Drug Designation threshold.`,
        missing: [],
        notAssessedCriteria: [],
      };
    }
    // 2026-10-15: 200,000 or more returned eligible:false while the note below said
    // the cost-recovery prong may still qualify; that prong is not assessed here.
    if (input.usPrevalence != null) {
      notes.push('FDA orphan status may still be possible via the cost-recovery prong if US sales cannot recover development/marketing costs.');
    }
    const prevalence = input.usPrevalence == null
      ? 'US prevalence not supplied'
      : `US prevalence ${input.usPrevalence} is not fewer than 200,000`;
    return {
      eligible: 'not_assessed',
      program,
      rationale: `${prevalence}, and the cost-recovery prong is not assessed; orphan eligibility cannot be assessed.`,
      missing: input.usPrevalence == null ? ['usPrevalence'] : [],
      notAssessedCriteria: [FDA_COST_RECOVERY_PRONG],
    };
  }

  if (input.market === 'EMA') return assessEmaOrphan(input, program);

  // PMDA: the record's criteria all apply; only the first (prevalence) has an input.
  if (input.jpPrevalence != null && input.jpPrevalence >= 50000) {
    return {
      eligible: false,
      program,
      rationale: `Japan prevalence ${input.jpPrevalence} is not fewer than 50,000 — does not meet the PMDA orphan criterion "${JP_ORPHAN_PREVALENCE_CRITERION}".`,
      missing: [],
      notAssessedCriteria: [],
    };
  }
  // 2026-10-15: under 50,000 returned eligible:true and listed the designation,
  // with a note to "confirm qualitatively" the criteria nothing assessed.
  const prevalence = input.jpPrevalence == null
    ? 'Japan prevalence not supplied'
    : `Japan prevalence ${input.jpPrevalence} is fewer than 50,000`;
  return {
    eligible: 'not_assessed',
    program,
    rationale: `${prevalence}; not assessed: ${JP_ORPHAN_UNASSESSED_CRITERIA.join('; ')}.`,
    missing: input.jpPrevalence == null ? ['jpPrevalence'] : [],
    notAssessedCriteria: [...JP_ORPHAN_UNASSESSED_CRITERIA],
  };
}

/** The EMA prevalence limb (≤ 5 in 10,000 AND serious): the stated facts that fail it, and those not stated. */
function emaPrevalenceLimb(input: DesignationInput): { unmet: string[]; missing: (keyof DesignationInput)[] } {
  const unmet: string[] = [];
  const missing: (keyof DesignationInput)[] = [];
  if (input.euPrevalencePer10k == null) missing.push('euPrevalencePer10k');
  else if (input.euPrevalencePer10k > 5) unmet.push(`prevalence ${input.euPrevalencePer10k} per 10,000 exceeds 5`);
  if (input.seriousOrLifeThreatening === false) unmet.push('not life-threatening/seriously debilitating');
  else if (input.seriousOrLifeThreatening !== true) missing.push('seriousOrLifeThreatening');
  return { unmet, missing };
}

/**
 * EMA orphan screen, Regulation (EC) No 141/2000 Art 3(1): (a) the prevalence limb
 * or the insufficient-return limb, which is not assessed, AND (b) no satisfactory
 * method OR significant benefit.
 */
function assessEmaOrphan(input: DesignationInput, program: string): OrphanAssessment {
  const { unmet: limbUnmet, missing: limbMissing } = emaPrevalenceLimb(input);
  // (b): either prong satisfies it; it fails only when both are stated false.
  const needMet = input.noSatisfactoryTreatment === true || input.significantBenefit === true;
  if (input.noSatisfactoryTreatment === false && input.significantBenefit === false) {
    return {
      eligible: false,
      program,
      rationale: 'Does not meet EMA orphan criteria: neither "no satisfactory method" nor "significant benefit" is established.',
      missing: [],
      notAssessedCriteria: [],
    };
  }
  const limbMet = limbUnmet.length === 0 && limbMissing.length === 0;
  if (limbMet && needMet) {
    return {
      eligible: true,
      program,
      rationale: `EU prevalence ${input.euPrevalencePer10k} per 10,000 (≤ 5), condition is life-threatening/seriously debilitating, and (no satisfactory method or significant benefit) — meets EMA orphan criteria.`,
      missing: [],
      notAssessedCriteria: [],
    };
  }
  // 2026-10-15: a failed prevalence limb (over 5 in 10,000, or stated not serious)
  // returned eligible:false, though the alternative insufficient-return limb of
  // Art 3(1)(a) was never assessed. The screen now waits on it.
  const needMissing = needMet
    ? []
    : (['noSatisfactoryTreatment', 'significantBenefit'] as const).filter((k) => typeof input[k] !== 'boolean');
  const missing = [...(limbUnmet.length > 0 ? [] : limbMissing), ...needMissing];
  const reasons = [
    ...(limbUnmet.length > 0 ? [`prevalence limb not met (${limbUnmet.join('; ')})`] : []),
    ...(missing.length > 0 ? [`not supplied: ${missing.join(', ')}`] : []),
    ...(limbMet ? [] : ['the insufficient-return limb of Art 3(1)(a) is not assessed']),
  ];
  return {
    eligible: 'not_assessed',
    program,
    rationale: `EMA orphan criteria cannot be assessed: ${reasons.join('; ')}.`,
    missing,
    notAssessedCriteria: limbMet ? [] : [EMA_INSUFFICIENT_RETURN_LIMB],
  };
}

function assessPediatric(market: Market, ref: DesignationCriteria): PediatricAssessment {
  if (market === 'FDA') {
    return {
      applicable: true,
      requirement: 'PREA pediatric assessment; initial Pediatric Study Plan (PSP) due by end of Phase 2.',
      obligation: 'Submit a PSP and conduct required pediatric studies under PREA; BPCA written-request incentives may be available.',
    };
  }
  if (market === 'EMA') {
    return {
      applicable: true,
      requirement: 'Paediatric Investigation Plan (PIP) required for the marketing-authorisation application unless waived/deferred.',
      obligation: 'Agree a PIP with the EMA Paediatric Committee (PDCO), or obtain a waiver/deferral, before MAA validation.',
    };
  }
  const consultation = getJpProgram('pmda-consultation-pediatric-plan');
  return {
    applicable: true,
    requirement: `${JP_PEDIATRIC_PLAN.name}: ${jpProgramCriteriaText(JP_PEDIATRIC_PLAN)}. Basis: ${jpProgramBasisLabel(JP_PEDIATRIC_PLAN)}.`,
    obligation: `${JP_PEDIATRIC_PLAN.timing ?? ''} PMDA confirms the plan through the ${consultation.name} (${consultation.nameJa}).`.trim(),
  };
}

/** Return the encoded designation criteria for a market (for a checklist UI). */
export function getDesignationCriteria(market: Market): DesignationCriteria {
  return DESIGNATION_REFERENCE[market];
}
