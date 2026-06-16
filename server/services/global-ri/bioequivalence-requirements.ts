/**
 * Bioequivalence (BE) requirements & BCS biowaiver expert — FDA & EMA.
 *
 * For generics (ANDA / EU Art 10(1)), hybrids (EU Art 10(3)) and 505(b)(2)
 * applications, bioequivalence stands in for an independent demonstration of
 * clinical efficacy: the applicant must show that the test product delivers the
 * same systemic exposure as the reference. This service encodes the two RA
 * decisions that drive that work — (1) the BE acceptance criteria / typical
 * study design per region, and (2) whether an in-vivo BE study can be waived
 * under the Biopharmaceutics Classification System (BCS) biowaiver. It pairs
 * with the dossier classifier, whose generic/hybrid/505(b)(2) routes all rely
 * on BE.
 *
 * Regions: FDA (US), EMA (EU).
 *
 * Pure / deterministic — no DB, no IO. The criteria are an indicative reference
 * aid; BE / biowaiver acceptance is product- and route-specific. Narrow-
 * therapeutic-index (NTI) drugs use tighter limits, and modified-release / fed
 * conditions vary — confirm against the current regional guidance and ICH M9.
 *
 * References:
 *  - FDA: Guidance for Industry "Bioequivalence Studies with Pharmacokinetic
 *    Endpoints for Drugs Submitted Under an ANDA"; 21 CFR Part 320.
 *  - EMA: "Guideline on the Investigation of Bioequivalence"
 *    (CPMP/EWP/QWP/1401/98 Rev.1).
 *  - ICH M9: "Biopharmaceutics Classification System-based Biowaivers"; and the
 *    FDA/EMA BCS-based biowaiver guidances.
 *
 * @module server/services/global-ri/bioequivalence-requirements
 */

export type BeRegion = 'FDA' | 'EMA';

export type BcsClass = 'I' | 'II' | 'III' | 'IV';

/** The set of modeled BE regions. */
export const BE_REGIONS: BeRegion[] = ['FDA', 'EMA'];

/** The set of modeled BCS classes. */
export const BCS_CLASSES: BcsClass[] = ['I', 'II', 'III', 'IV'];

export interface BioequivalenceCriteria {
  region: BeRegion;
  /** Primary PK parameters whose ratio CI must fall within the acceptance range. */
  parameters: string[];
  /** Confidence level of the interval evaluated against the acceptance range. */
  confidenceLevel: '90%';
  /** Acceptance range for the 90% CI of the test/reference geometric-mean ratio. */
  acceptanceRange: '80.00–125.00%';
  /** The default in-vivo study design. */
  typicalDesign: string;
  /** Approach for highly variable drugs (within-subject CV ≥ 30%). */
  highlyVariableApproach: string;
  citation: string;
  notes: string[];
}

const BE_CAVEAT =
  'BE acceptance is product- and route-specific: narrow-therapeutic-index drugs ' +
  'use tighter limits and modified-release / fed conditions vary — confirm against ' +
  'the current regional guidance and ICH M9.';

const BE_CRITERIA: Record<BeRegion, BioequivalenceCriteria> = {
  FDA: {
    region: 'FDA',
    parameters: ['Cmax', 'AUC0-t', 'AUC0-∞'],
    confidenceLevel: '90%',
    acceptanceRange: '80.00–125.00%',
    typicalDesign:
      'Single-dose, two-period, two-sequence crossover in healthy volunteers under fasting conditions ' +
      '(add a fed study for modified-release products or where the label directs administration with food).',
    highlyVariableApproach:
      'For highly variable drugs (within-subject CV ≥ 30%), a replicate (partial or full) crossover with ' +
      'reference-scaled average bioequivalence (RSABE) may widen the Cmax limits.',
    citation:
      'FDA Guidance "Bioequivalence Studies with Pharmacokinetic Endpoints for Drugs Submitted Under an ANDA"; 21 CFR Part 320',
    notes: [BE_CAVEAT],
  },
  EMA: {
    region: 'EMA',
    parameters: ['Cmax', 'AUC0-t', 'AUC0-∞'],
    confidenceLevel: '90%',
    acceptanceRange: '80.00–125.00%',
    typicalDesign:
      'Single-dose, two-period, two-sequence crossover in healthy volunteers under fasting conditions ' +
      '(add a fed study for modified-release products or where the SmPC directs administration with food).',
    highlyVariableApproach:
      'For highly variable drugs (within-subject CV ≥ 30%), a replicate (partial or full) crossover with ' +
      'the average bioequivalence with expanding limits (ABEL) approach may widen the Cmax limits.',
    citation: 'EMA "Guideline on the Investigation of Bioequivalence" (CPMP/EWP/QWP/1401/98 Rev.1)',
    notes: [BE_CAVEAT],
  },
};

/**
 * Get the bioequivalence acceptance criteria and typical study design for a
 * region. Pure / deterministic. Throws for an unmodeled region.
 */
export function getBioequivalenceCriteria(region: BeRegion): BioequivalenceCriteria {
  const criteria = BE_CRITERIA[region];
  if (!criteria) throw new Error(`No bioequivalence criteria modeled for region "${region}".`);
  return criteria;
}

export interface BcsBiowaiverEligibility {
  bcsClass: BcsClass;
  solubility: 'high' | 'low';
  permeability: 'high' | 'low';
  /** Whether an in-vivo BE study may be waived (subject to the stated conditions). */
  biowaiverEligible: boolean;
  /** Conditions that must be met for the biowaiver (or the reason it is unavailable). */
  conditions: string[];
  citation: string;
  notes: string[];
}

const ICH_M9_CIT = 'ICH M9 (BCS-based Biowaivers); FDA/EMA BCS-based biowaiver guidances';

const BCS_BIOWAIVER: Record<BcsClass, BcsBiowaiverEligibility> = {
  I: {
    bcsClass: 'I',
    solubility: 'high',
    permeability: 'high',
    biowaiverEligible: true,
    conditions: [
      'Both test and reference products are rapidly (or very rapidly) dissolving.',
      'Excipients do not affect the rate or extent of absorption.',
      'The drug substance is not a narrow-therapeutic-index drug; the product is an immediate-release, orally administered solid dosage form with systemic action.',
    ],
    citation: ICH_M9_CIT,
    notes: [BE_CAVEAT],
  },
  II: {
    bcsClass: 'II',
    solubility: 'low',
    permeability: 'high',
    biowaiverEligible: false,
    conditions: [
      'Not eligible — low solubility makes in-vitro dissolution an unreliable surrogate; an in-vivo BE study is generally required.',
      'Limited exceptions may apply for weak acids meeting specific dissolution conditions, per the governing guidance.',
    ],
    citation: ICH_M9_CIT,
    notes: [BE_CAVEAT],
  },
  III: {
    bcsClass: 'III',
    solubility: 'high',
    permeability: 'low',
    biowaiverEligible: true,
    conditions: [
      'Both test and reference products are VERY rapidly dissolving.',
      'Excipient considerations are met (qualitatively the same and quantitatively very similar excipients that could affect absorption).',
      'The product is an immediate-release, orally administered solid dosage form with systemic action.',
    ],
    citation: ICH_M9_CIT,
    notes: [BE_CAVEAT],
  },
  IV: {
    bcsClass: 'IV',
    solubility: 'low',
    permeability: 'low',
    biowaiverEligible: false,
    conditions: [
      'Not eligible — low solubility and low permeability preclude a BCS-based biowaiver; an in-vivo BE study is required.',
    ],
    citation: ICH_M9_CIT,
    notes: [BE_CAVEAT],
  },
};

/**
 * Determine BCS-based biowaiver eligibility for a drug substance's BCS class.
 * Pure / deterministic. Throws for an unmodeled BCS class.
 */
export function getBcsBiowaiverEligibility(bcsClass: BcsClass): BcsBiowaiverEligibility {
  const eligibility = BCS_BIOWAIVER[bcsClass];
  if (!eligibility) throw new Error(`No BCS biowaiver eligibility modeled for class "${bcsClass}".`);
  return eligibility;
}
