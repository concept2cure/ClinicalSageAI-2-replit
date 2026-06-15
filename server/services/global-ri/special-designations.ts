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
 * Where the inputs needed to judge a market's orphan threshold are not supplied,
 * the assessor declines to guess and reports "prevalence not supplied".
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
 *  - PMDA Orphan: Japan Pharmaceutical Affairs Act — fewer than 50,000 patients
 *    in Japan and high medical need (severe disease, no alternative therapy).
 *  - PMDA Pediatric: pediatric development encouraged; local requirements apply.
 *
 * @module server/services/global-ri/special-designations
 */

export type Market = 'FDA' | 'EMA' | 'PMDA';

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
      'Prevalence not more than 5 in 10,000 in the EU, the condition is life-threatening or chronically debilitating, and either no satisfactory authorised method exists or the product offers significant benefit over existing methods.',
    pediatricProgram: 'Paediatric Investigation Plan (PIP)',
    pediatricCriteria:
      'A Paediatric Investigation Plan (PIP) is required for a marketing-authorisation application unless a waiver or deferral applies.',
    citation: 'Regulation (EC) No 141/2000 (orphan); Regulation (EC) No 1901/2006 (paediatric)',
  },
  PMDA: {
    orphanProgram: 'PMDA / MHLW Orphan Drug Designation',
    orphanCriteria:
      'Disease affecting fewer than 50,000 patients in Japan and high medical need (severe disease with no satisfactory alternative therapy).',
    pediatricProgram: 'Pediatric development (MHLW)',
    pediatricCriteria:
      'Pediatric development is encouraged; confirm local pediatric data requirements and applicable incentives with PMDA.',
    citation: 'Pharmaceutical Affairs Act (Japan); MHLW orphan drug designation criteria',
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
  eligible: boolean;
  program: string;
  rationale: string;
}

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
 * Orphan eligibility applies the market's statutory threshold. When the
 * prevalence input required to judge that market is not supplied, orphan is
 * reported as not eligible with rationale "prevalence not supplied" rather than
 * guessing. Pediatric assessment is produced when pediatricDevelopment is true.
 *
 * Pure / deterministic. Designations and notes are sorted for stable output.
 */
export function assessDesignationEligibility(input: DesignationInput): DesignationResult {
  const ref = DESIGNATION_REFERENCE[input.market];
  const notes: string[] = [];
  const designations: string[] = [];

  const orphan = assessOrphan(input, ref, notes);
  if (orphan.eligible) {
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

  if (input.market === 'FDA') {
    if (input.usPrevalence == null) {
      return { eligible: false, program, rationale: 'US prevalence not supplied; orphan eligibility cannot be assessed.' };
    }
    if (input.usPrevalence < 200000) {
      return {
        eligible: true,
        program,
        rationale: `US prevalence ${input.usPrevalence} is fewer than 200,000 — meets the FDA Orphan Drug Designation threshold.`,
      };
    }
    notes.push('FDA orphan status may still be possible via the cost-recovery prong if US sales cannot recover development/marketing costs.');
    return {
      eligible: false,
      program,
      rationale: `US prevalence ${input.usPrevalence} is not fewer than 200,000 — does not meet the FDA Orphan Drug Designation prevalence threshold.`,
    };
  }

  if (input.market === 'EMA') {
    if (input.euPrevalencePer10k == null) {
      return { eligible: false, program, rationale: 'EU prevalence (per 10,000) not supplied; orphan eligibility cannot be assessed.' };
    }
    const meetsPrevalence = input.euPrevalencePer10k <= 5;
    const serious = input.seriousOrLifeThreatening === true;
    const benefitOrNeed = input.noSatisfactoryTreatment === true || input.significantBenefit === true;
    if (meetsPrevalence && serious && benefitOrNeed) {
      return {
        eligible: true,
        program,
        rationale: `EU prevalence ${input.euPrevalencePer10k} per 10,000 (≤ 5), condition is life-threatening/seriously debilitating, and (no satisfactory method or significant benefit) — meets EMA orphan criteria.`,
      };
    }
    const unmet: string[] = [];
    if (!meetsPrevalence) unmet.push(`prevalence ${input.euPrevalencePer10k} per 10,000 exceeds 5`);
    if (!serious) unmet.push('not life-threatening/seriously debilitating');
    if (!benefitOrNeed) unmet.push('neither "no satisfactory method" nor "significant benefit" is established');
    return {
      eligible: false,
      program,
      rationale: `Does not meet EMA orphan criteria: ${unmet.join('; ')}.`,
    };
  }

  // PMDA
  if (input.jpPrevalence == null) {
    return { eligible: false, program, rationale: 'Japan prevalence not supplied; orphan eligibility cannot be assessed.' };
  }
  if (input.jpPrevalence < 50000) {
    notes.push('PMDA orphan designation also requires high medical need (severe disease, no satisfactory alternative) — confirm qualitatively.');
    return {
      eligible: true,
      program,
      rationale: `Japan prevalence ${input.jpPrevalence} is fewer than 50,000 — meets the PMDA orphan prevalence threshold (high medical need also required).`,
    };
  }
  return {
    eligible: false,
    program,
    rationale: `Japan prevalence ${input.jpPrevalence} is not fewer than 50,000 — does not meet the PMDA orphan prevalence threshold.`,
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
  return {
    applicable: true,
    requirement: 'Pediatric development encouraged; confirm local pediatric data requirements with PMDA.',
    obligation: 'Discuss pediatric development plans and applicable incentives with PMDA.',
  };
}

/** Return the encoded designation criteria for a market (for a checklist UI). */
export function getDesignationCriteria(market: Market): DesignationCriteria {
  return DESIGNATION_REFERENCE[market];
}
