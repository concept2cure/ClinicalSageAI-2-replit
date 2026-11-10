/**
 * Bioequivalence & Generic Drug Intelligence — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for bioequivalence study
 * design, BCS classification, dissolution similarity, biowaiver eligibility,
 * and ANDA/505(b)(2) pathway guidance.
 *
 * NO LLM, NO network, NO database. Every function is closed-form and
 * reproducible: identical input always yields identical output.
 *
 * Regulatory citations: 21 CFR 320, FDA Guidance for Industry (various),
 * ICH M9, EMA/CHMP/QWP/428693/2017, WHO TRS 1003 Annex 6.
 *
 * Rule 2 S5d (2026-11-09): a true/false input reads true, false or not_stated
 * (inputStates) and decides nothing an answer could change; NTI status taken
 * from the drug-name list, and a numeric default, are said in the result. A
 * required or malformed input is refused by field.
 *
 * @module server/services/bioequivalence/bioequivalence-knowledge
 */

/* f2 and every eligibility condition around it live in services/cmc/
   dissolution-comparison, which the CMC dissolution register calls too. */
import { compareDissolutionProfiles } from '../cmc/dissolution-comparison';
import { refuseUnlessStated, type RequiredInputCheck } from '../ana-biostats/computation-engine';
import {
  booleanInputStates, conclusions, decidingFacts, everyAnswer, listed, statedBoolean, statedNumber, statedOneOf, textInput,
} from '../immunogenicity/immunogenicity-reference';
import { normalQuantile } from '../stats/normal';
import { BE_STUDY_DESIGNS } from './bioequivalence-reference';

// ─────────────────────────────────────────────────────────────────────────────
// 1. BCS Classification System — Reference Data
// ─────────────────────────────────────────────────────────────────────────────

export type BCSClass = 'I' | 'II' | 'III' | 'IV';

export interface BCSCriteria {
  solubility: 'high' | 'low';
  permeability: 'high' | 'low';
}

export interface BCSClassification {
  bcsClass: BCSClass;
  solubility: 'high' | 'low';
  permeability: 'high' | 'low';
  biowaiverEligible: boolean;
  biowaiverConditions: string[];
  regulatoryImplications: string[];
  fdaGuidance: string[];
  emaGuidance: string[];
  ichM9Notes: string[];
}

const BCS_CLASS_REGISTRY: Record<BCSClass, Omit<BCSClassification, 'bcsClass'>> = {
  I: {
    solubility: 'high',
    permeability: 'high',
    biowaiverEligible: true,
    biowaiverConditions: [
      'Immediate-release solid oral dosage form',
      'Drug substance is not a narrow therapeutic index (NTI) drug',
      'Product is designed not to be absorbed in the oral cavity',
      'Excipients are well-characterized and do not affect absorption',
      'Very rapidly dissolving (>= 85% in 15 min) OR rapidly dissolving (>= 85% in 30 min) with f2 >= 50 vs. RLD',
    ],
    regulatoryImplications: [
      'Biowaiver eligible under FDA, EMA, WHO, and ICH M9 frameworks',
      'Dissolution in 0.1N HCl, pH 4.5 acetate buffer, pH 6.8 phosphate buffer required',
      'In vivo BE study may be waived if dissolution criteria met',
      'Rate-limiting step is gastric emptying, not dissolution or permeability',
    ],
    fdaGuidance: [
      'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
      '21 CFR 320.22(d)(3) — Criteria for BCS-based biowaivers',
    ],
    emaGuidance: [
      'EMA/CHMP/QWP/428693/2017 — Guideline on the Investigation of Bioequivalence',
      'EMA CPMP/EWP/QWP/1401/98 Rev. 1 — BCS-based biowaiver guideline',
    ],
    ichM9Notes: [
      'ICH M9 (2019): BCS Class I eligible for biowaiver; very rapidly dissolving criterion preferred',
      'ICH M9 harmonizes FDA/EMA/PMDA approaches for Class I biowaivers',
    ],
  },
  II: {
    solubility: 'low',
    permeability: 'high',
    biowaiverEligible: false,
    biowaiverConditions: [
      'BCS Class II is NOT eligible for a BCS-based biowaiver: ICH M9, which the FDA and the EMA apply, covers Class I and III only',
      'A weak acid highly soluble at pH 6.8 is not an exception under ICH M9',
    ],
    regulatoryImplications: [
      'In vivo BE study generally required',
      'Dissolution is the rate-limiting step for absorption',
      'Formulation differences can significantly affect bioavailability',
      'Product-specific guidances often require additional dissolution testing or in vivo studies',
    ],
    fdaGuidance: [
      'FDA does not grant biowaivers for BCS Class II (as of 2024 guidance)',
      'Product-specific guidances (PSGs) may specify dissolution method and media',
      '21 CFR 320.22 — BCS Class II not listed for biowaiver eligibility',
    ],
    emaGuidance: [
      'The EMA applies ICH M9: no BCS-based biowaiver for Class II',
    ],
    ichM9Notes: [
      'ICH M9 Step 4 (2019): BCS-based biowaivers cover Class I and III only; Class II is not eligible',
    ],
  },
  III: {
    solubility: 'high',
    permeability: 'low',
    biowaiverEligible: true,
    biowaiverConditions: [
      'Immediate-release solid oral dosage form',
      'Very rapidly dissolving (>= 85% in 15 min) for BOTH test and reference',
      'Excipients must be qualitatively the same and quantitatively similar to the RLD',
      'Drug substance is not a narrow therapeutic index (NTI) drug',
    ],
    regulatoryImplications: [
      'Biowaiver possible under ICH M9, EMA, and recent FDA guidance',
      'Permeability is the rate-limiting step, so excipient effects on GI transit/permeability are critical',
      'Stricter excipient similarity requirement compared to BCS Class I',
      'Very rapid dissolution required to minimize formulation-dependent GI exposure time',
    ],
    fdaGuidance: [
      'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
      '21 CFR 320.22(d)(3) — Added BCS Class III biowaivers in 2017 revision',
      'FDA requires very rapid dissolution (>= 85% in 15 min) for both test and reference',
    ],
    emaGuidance: [
      'EMA/CHMP/QWP/428693/2017 — BCS Class III biowaiver with strict excipient criteria',
      'CPMP/EWP/QWP/1401/98 Rev. 1 — Qualitative and quantitative excipient similarity',
    ],
    ichM9Notes: [
      'ICH M9: BCS Class III eligible only when both test and reference are very rapidly dissolving (>= 85% in 15 min)',
      'Excipient similarity: qualitatively the same, quantitatively within +/- 10% for excipient amounts',
      'Surfactants and sweeteners limited to <= 0.5% (w/w) change from RLD',
    ],
  },
  IV: {
    solubility: 'low',
    permeability: 'low',
    biowaiverEligible: false,
    biowaiverConditions: [
      'BCS Class IV is NOT eligible for biowaiver under any major regulatory framework',
      'In vivo BE study is always required',
      'Both dissolution and permeability are limiting — high formulation sensitivity',
    ],
    regulatoryImplications: [
      'In vivo BE study always required',
      'Highest formulation risk class — both dissolution and absorption are variable',
      'May require fed and fasted state BE studies',
      'Product-specific guidance should be consulted for study design details',
      'Often requires more subjects due to higher intra-subject variability',
    ],
    fdaGuidance: [
      'FDA: No biowaiver for BCS Class IV',
      '21 CFR 320.22 — BCS Class IV excluded from biowaiver provisions',
      'Product-specific guidances available for many Class IV drugs',
    ],
    emaGuidance: [
      'EMA/CHMP/QWP/428693/2017 — BCS Class IV: in vivo study required',
    ],
    ichM9Notes: [
      'ICH M9: BCS Class IV not eligible for biowaiver',
      'Both dissolution and permeability limitations preclude in vitro surrogate',
    ],
  },
};

/** Solubility threshold: highest dose strength dissolves in <= 250 mL across pH 1.2-6.8 at 37 +/- 1C. */
const SOLUBILITY_VOLUME_LIMIT_ML = 250;
/** Permeability threshold: >= 85% absorbed in humans (or comparable in vitro Caco-2/MDCK). */
const PERMEABILITY_ABSORPTION_THRESHOLD = 0.85;

// ─────────────────────────────────────────────────────────────────────────────
// 2. BE Study Design Registry
// ─────────────────────────────────────────────────────────────────────────────

export type BEStudyDesignName =
  | 'crossover_2x2'
  | 'crossover_3x3'
  | 'crossover_4x4'
  | 'replicate_3_period'
  | 'replicate_4_period'
  | 'partial_replicate'
  | 'parallel';

export interface BEAcceptanceCriteria {
  parameter: string;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
  scalingApplied: boolean;
  scalingDetails?: string;
}

export interface BEStudyDesign {
  designName: BEStudyDesignName;
  displayName: string;
  description: string;
  sequences: number;
  periods: number;
  designNotation: string;
  whenToUse: string[];
  advantages: string[];
  disadvantages: string[];
  acceptanceCriteria: BEAcceptanceCriteria[];
  regulatoryBasis: string[];
  minSubjectsGuidance: string;
  statisticalModel: string;
  washoutGuidance: string;
}

// BE_STUDY_DESIGNS is in bioequivalence-reference.ts (moved unchanged on 2026-11-09, Rule 2 S5d).

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dissolution Testing Knowledge
// ─────────────────────────────────────────────────────────────────────────────

export interface DissolutionConditions {
  apparatus: 'USP_I_basket' | 'USP_II_paddle' | 'USP_III_reciprocating' | 'USP_IV_flow';
  rpm: number;
  media: string;
  pH: number;
  volume_mL: number;
  temperature_C: number;
  timePoints_min: number[];
}

const STANDARD_DISSOLUTION_CONDITIONS: DissolutionConditions[] = [
  {
    apparatus: 'USP_I_basket',
    rpm: 100,
    media: '0.1N HCl (simulated gastric fluid without enzymes)',
    pH: 1.2,
    volume_mL: 900,
    temperature_C: 37,
    timePoints_min: [10, 15, 20, 30, 45, 60],
  },
  {
    apparatus: 'USP_II_paddle',
    rpm: 50,
    media: '0.1N HCl (simulated gastric fluid without enzymes)',
    pH: 1.2,
    volume_mL: 900,
    temperature_C: 37,
    timePoints_min: [10, 15, 20, 30, 45, 60],
  },
  {
    apparatus: 'USP_II_paddle',
    rpm: 50,
    media: 'Acetate buffer pH 4.5',
    pH: 4.5,
    volume_mL: 900,
    temperature_C: 37,
    timePoints_min: [10, 15, 20, 30, 45, 60],
  },
  {
    apparatus: 'USP_II_paddle',
    rpm: 50,
    media: 'Phosphate buffer pH 6.8',
    pH: 6.8,
    volume_mL: 900,
    temperature_C: 37,
    timePoints_min: [10, 15, 20, 30, 45, 60],
  },
];

/** BCS-based biowaiver dissolution requirements per FDA/EMA/ICH M9 */
const BIOWAIVER_DISSOLUTION_REQUIREMENTS = {
  media: ['0.1N HCl (pH 1.2)', 'Acetate buffer pH 4.5', 'Phosphate buffer pH 6.8'],
  apparatus: 'USP II paddle at 50 rpm OR USP I basket at 100 rpm',
  volume: '500 mL or 900 mL',
  temperature: '37 +/- 0.5 C',
  units: 12,
  veryRapidlyDissolving: '>= 85% dissolved in 15 minutes in each medium',
  rapidlyDissolving: '>= 85% dissolved in 30 minutes in each medium',
  f2Required: 'f2 >= 50 when comparing test vs. reference dissolution profiles',
  f2Exemption:
    'f2 not needed when both test and reference dissolve >= 85% in 15 min (very rapidly dissolving)',
  regulatoryCitations: [
    'FDA Guidance: Dissolution Testing and Acceptance Criteria for IR SODF (2018)',
    'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
    'ICH M9 Step 4 (2019) — Biopharmaceutics Classification System-Based Biowaivers',
    'EMA/CHMP/QWP/604223/2014 — Guideline on quality of oral modified release products',
    'USP <711> Dissolution',
  ],
};

// Suppress "declared but never read" for reference data consumed via re-exports
void STANDARD_DISSOLUTION_CONDITIONS;
void BIOWAIVER_DISSOLUTION_REQUIREMENTS;

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANDA / 505(b)(2) Pathway Knowledge
// ─────────────────────────────────────────────────────────────────────────────

export type RegulatoryPathway = 'anda_505j' | '505b2' | 'suitability_petition';

export interface PathwayGuidance {
  pathway: RegulatoryPathway;
  displayName: string;
  legalBasis: string;
  description: string;
  requirements: string[];
  rldRequirements: string[];
  beRequirements: string[];
  advantages: string[];
  limitations: string[];
  typicalTimeline: string;
  userFeeInfo: string;
  regulatoryCitations: string[];
}

const PATHWAY_REGISTRY: Record<RegulatoryPathway, PathwayGuidance> = {
  anda_505j: {
    pathway: 'anda_505j',
    displayName: 'ANDA — Section 505(j)',
    legalBasis: 'FD&C Act Section 505(j); 21 CFR Part 314 Subpart C',
    description:
      'Abbreviated New Drug Application for generic drugs that are pharmaceutical equivalents to an approved reference listed drug (RLD). Relies on the finding of bioequivalence to the RLD to demonstrate safety and efficacy.',
    requirements: [
      'Same active ingredient(s) as the RLD',
      'Same route of administration, dosage form, and strength',
      'Bioequivalent to the RLD (in vivo or BCS-based biowaiver)',
      'Meet same compendial or other applicable standards for identity, strength, quality, purity',
      'Adequate labeling — same as RLD labeling with minor differences',
      'Manufactured in compliance with cGMP (21 CFR Parts 210/211)',
      'DMF or ASMF for drug substance, if applicable',
    ],
    rldRequirements: [
      'RLD must be listed in the FDA Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations)',
      'RLD must have active marketing status (not withdrawn for safety/efficacy)',
      'If RLD is a single-source product, check patent and exclusivity listings',
      'For combination products, each active ingredient must have an approved RLD',
    ],
    beRequirements: [
      'In vivo BE study with PK endpoints (AUC, Cmax) in standard 2x2 crossover, unless:',
      '- BCS-based biowaiver is applicable (Class I or III per ICH M9)',
      '- Product-specific guidance (PSG) specifies alternative approach',
      '- Topical products: clinical endpoint or pharmacodynamic BE study',
      '- Locally acting drugs: clinical endpoint study or in vitro alternatives',
      'Fasting study required for all; fed study required if RLD labeling includes food-effect information',
    ],
    advantages: [
      'No preclinical or clinical safety/efficacy studies required',
      'Abbreviated review timeline (typically 15-20 months target GDUFA)',
      'Lower development cost compared to NDA ($1-5M vs. $100M+)',
      'Priority review available for first generics and competitive generic therapies (CGT)',
    ],
    limitations: [
      'Must be pharmaceutical equivalent (same active, route, form, strength)',
      'Cannot change dosage form, route, active ingredient, or strength without suitability petition',
      'Subject to 180-day exclusivity for first-to-file ANDA (Paragraph IV)',
      'Must address all listed patents — Paragraph I, II, III, or IV certification',
    ],
    typicalTimeline:
      'GDUFA II goal: 15-month median approval time for standard ANDAs. Priority review: 8 months.',
    userFeeInfo:
      'GDUFA user fees apply: ANDA filing fee, DMF fee, facility fee. See GDUFA Commitment Letter for current amounts.',
    regulatoryCitations: [
      'FD&C Act Section 505(j)',
      '21 CFR 314.92-314.99 — ANDA requirements',
      '21 CFR 320.21-320.25 — BA/BE requirements',
      'FDA Orange Book — Approved Drug Products with Therapeutic Equivalence Evaluations',
      'GDUFA II Commitment Letter — Performance goals and user fees',
    ],
  },
  '505b2': {
    pathway: '505b2',
    displayName: 'NDA — Section 505(b)(2)',
    legalBasis: 'FD&C Act Section 505(b)(2); 21 CFR Part 314',
    description:
      'New Drug Application that relies, in part, on FDA findings of safety and/or efficacy for a previously approved drug (the reference product). Allows for changes from the reference product that ANDAs cannot accommodate.',
    requirements: [
      'Right of reference to an approved listed drug OR published literature',
      'Bridge study (typically BE) linking the proposed product to the reference product',
      'Additional studies to support changes from the reference (new indication, route, form, etc.)',
      'Full pharmaceutical quality (CMC) data package',
      'Nonclinical studies as needed based on changes from reference',
      'Clinical studies as needed based on changes (may range from single PK study to full Phase 3)',
    ],
    rldRequirements: [
      'Reference listed drug (RLD) must be an approved drug under Section 505',
      'Applicant must provide a right of reference or published literature',
      'If relying on published literature, must establish relevance and bridge to proposed product',
      'Paragraph IV certifications may be required for listed patents',
    ],
    beRequirements: [
      'Bridge BE study to the reference product — demonstrates that the new formulation has similar PK',
      'Additional PK studies may be needed for new dosage forms or routes',
      'Food-effect study typically required',
      'If changing active moiety: clinical efficacy data required (cannot rely solely on BE)',
    ],
    advantages: [
      'Can make changes from the reference product (new form, route, indication, strength, combination)',
      'Can rely partially on published literature for safety/efficacy',
      'Data exclusivity provisions available (3 or 5 years)',
      'Patent term extension may be available',
      'Faster and less expensive than full 505(b)(1) NDA',
    ],
    limitations: [
      'More expensive and longer development than ANDA',
      'May require clinical trials depending on changes',
      'Subject to PDUFA user fees (higher than GDUFA)',
      'Must address listed patents of the reference product',
      'No 180-day generic exclusivity available',
    ],
    typicalTimeline:
      'Standard review: 12 months. Priority review: 8 months (if qualifying). Development: 2-5 years depending on required studies.',
    userFeeInfo:
      'PDUFA user fees apply (NDA application fee). Significantly higher than GDUFA fees.',
    regulatoryCitations: [
      'FD&C Act Section 505(b)(2)',
      '21 CFR 314.50-314.81 — NDA requirements',
      'FDA Draft Guidance: Applications Covered by Section 505(b)(2) (2023)',
      'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    ],
  },
  suitability_petition: {
    pathway: 'suitability_petition',
    displayName: 'Suitability Petition (ANDA w/ Petition)',
    legalBasis: 'FD&C Act Section 505(j)(2)(C); 21 CFR 314.93',
    description:
      'A petition to FDA to allow submission of an ANDA for a drug product that differs from the RLD in dosage form, route of administration, strength, or substitution of an active ingredient in a combination product. If granted, the ANDA can proceed with these differences.',
    requirements: [
      'Petition must demonstrate that the proposed change does NOT require new safety/efficacy data',
      'Must show that the change does not create a new clinical question',
      'FDA evaluates on a case-by-case basis',
      'If petition is denied, applicant may need to file 505(b)(2) NDA instead',
    ],
    rldRequirements: [
      'RLD must be listed in the Orange Book',
      'Proposed changes must be limited to dosage form, route, strength, or active ingredient substitution',
    ],
    beRequirements: [
      'BE study required to the RLD (or to the new dosage form/strength as appropriate)',
      'Study design depends on the nature of the change',
      'FDA may specify additional BE requirements in the petition response',
    ],
    advantages: [
      'Allows ANDA filing for products not identical to RLD',
      'Lower cost than 505(b)(2) if petition is granted',
      'Abbreviated review pathway maintained',
    ],
    limitations: [
      'FDA may deny the petition — no guarantee of approval',
      'Limited to specific types of changes',
      'If denied, must pursue 505(b)(2) NDA',
      'Response timeline from FDA is variable (often 6-12 months)',
    ],
    typicalTimeline:
      'Petition response: 6-12 months. If granted, ANDA review follows standard GDUFA timelines.',
    userFeeInfo:
      'No separate petition fee. If granted, standard GDUFA ANDA fees apply.',
    regulatoryCitations: [
      'FD&C Act Section 505(j)(2)(C)',
      '21 CFR 314.93 — Suitability petitions',
      'FDA Guidance: Suitability Petitions for ANDA Submissions (2020)',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. NTI Drug List & Additional Reference Data
// ─────────────────────────────────────────────────────────────────────────────

/** Non-exhaustive list of narrow therapeutic index drugs per FDA guidance */
const NTI_DRUGS: string[] = [
  'warfarin',
  'phenytoin',
  'carbamazepine',
  'lithium',
  'digoxin',
  'theophylline',
  'cyclosporine',
  'tacrolimus',
  'sirolimus',
  'everolimus',
  'levothyroxine',
  'aminophylline',
];

/**
 * NTI drug BE criteria: tighter limits (90.00-111.11%) per FDA guidance.
 * Reference: FDA Guidance for Industry "Statistical Approaches to
 * Establishing Bioequivalence" (2001), FDA Warfarin PSG.
 */
const NTI_ACCEPTANCE_CRITERIA: BEAcceptanceCriteria[] = [
  {
    parameter: 'AUC0-t',
    lowerBound: 90.00,
    upperBound: 111.11,
    confidenceLevel: 90,
    scalingApplied: false,
  },
  {
    parameter: 'Cmax',
    lowerBound: 90.00,
    upperBound: 111.11,
    confidenceLevel: 90,
    scalingApplied: false,
  },
];

/** Highly variable drug (HVD) switching criterion for RSABE */
const HVD_SWITCHING_CRITERION = {
  sWR_threshold: 0.294,
  description:
    'If within-subject standard deviation of the reference product (sWR) >= 0.294 (corresponding to CVw ~30%), the reference-scaled average bioequivalence (RSABE) approach may be used for Cmax.',
  scalingRegulator: 0.25,
  thetaFormula: '(ln 1.25)^2 / sW0^2, where sW0 = 0.25',
  pointEstimateConstraint: '80.00% - 125.00% for geometric mean ratio T/R',
  regulatoryCitation:
    'FDA Draft Guidance: BE Studies with PK Endpoints for Drugs Submitted Under an ANDA (2021)',
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Exported Functions — Deterministic Decision Engines
// ─────────────────────────────────────────────────────────────────────────────

// ────── Stated inputs (Rule 2 S5d) ──────

/** A true/false input as stated, or not_stated when it was left out. */
export type InputStates = Record<string, boolean | 'not_stated'>;

const BCS_CLASSES: readonly BCSClass[] = ['I', 'II', 'III', 'IV'];
const FRAMEWORKS = ['fda', 'ema', 'ich_m9', 'who'] as const;

/** A required number that satisfies `ok`, for refuseUnlessStated. */
function numberInput(field: string, value: unknown, ok: (n: number) => boolean, expected: string): RequiredInputCheck {
  return { field, value, ok: typeof value === 'number' && Number.isFinite(value) && ok(value), expected };
}
/** Optional text: text, or left out. */
function optionalText(field: string, value: unknown): RequiredInputCheck {
  return { field, value, ok: value === undefined || value === null || typeof value === 'string', expected: 'text, or left out' };
}

/**
 * A dosage form named as modified release (the words, enteric coating, or ER/XR/XL/SR/CR/DR/MR); it is not
 * immediate release whatever else it names.
 */
function isModifiedRelease(dosageForm: string): boolean {
  return /modified|extended|delayed|sustained|controlled|prolonged|enteric|\b(?:er|xr|xl|sr|cr|dr|mr)\b/.test(dosageForm.toLowerCase());
}

interface NTIStatus {
  /** undefined while NTI status is not settled: not stated with no drug name, or in conflict with the list. */
  isNTI: boolean | undefined;
  basis: string;
  /** Why it is not settled ('' when it is), to name in a result. */
  open: string;
}

/**
 * NTI status: a stated isNTI is kept; otherwise the drug name is looked up in NTI_DRUGS, a list that is not
 * exhaustive, and the basis says so. With neither, it is not assessed. A stated false for a listed drug is a
 * conflict of inputs: it is neither read as stated nor overridden by the list, so NTI status is not assessed and
 * the conflict is named (as the device engine treats a class III device stated 510(k)-exempt). Until 2026-11-09
 * an omitted isNTI with no name was read as false, and a stated false for a listed drug was silently read as true.
 */
function ntiStatus(stated: boolean | undefined, drugName: string | null | undefined): NTIStatus {
  const listedNTI = !!drugName && NTI_DRUGS.some((n) => n.toLowerCase() === drugName.toLowerCase());
  if (stated === false && listedNTI) {
    const open = `isNTI is stated false, but ${drugName} is on the platform's NTI list`;
    return { isNTI: undefined, open, basis: `${open}: the two conflict, so NTI status is not assessed. Confirm it and state isNTI.` };
  }
  if (stated !== undefined) return { isNTI: stated, basis: 'isNTI was stated.', open: '' };
  if (listedNTI) return { isNTI: true, basis: `isNTI was not stated; ${drugName} is on the platform's NTI list.`, open: '' };
  if (drugName) {
    return {
      isNTI: false,
      open: '',
      basis: `isNTI was not stated; ${drugName} is not on the platform's NTI list, which is not exhaustive, so it is treated as not NTI. State isNTI if it is.`,
    };
  }
  return { isNTI: undefined, open: 'isNTI is not stated', basis: 'isNTI was not stated and no drug name was given, so NTI status is not assessed.' };
}

/** "x is not stated", "x and y are not stated", with an NTI conflict named in its own words. */
function notSettled(keys: readonly string[], nti: NTIStatus): string {
  const conflict = keys.includes('isNTI') && nti.open !== 'isNTI is not stated';
  const unstated = conflict ? keys.filter((k) => k !== 'isNTI') : keys;
  return [
    ...(unstated.length > 0 ? [`${listed(unstated)} ${unstated.length > 1 ? 'are' : 'is'} not stated`] : []),
    ...(conflict ? [nti.open] : []),
  ].join('; ');
}

// ────── 6a. classifyBCS ──────

export interface ClassifyBCSParams {
  /** Highest single dose strength (mg). */
  highestDoseStrength_mg: number;
  /** Solubility at the LEAST favorable pH across 1.2, 4.5, 6.8 (mg/mL). */
  solubility_mg_per_mL: number;
  /** Fraction absorbed in humans (0-1). Use 0.85 as threshold. */
  fractionAbsorbed: number;
  /** Drug name (optional, for NTI lookup). */
  drugName?: string;
  /** Dosage form. */
  dosageForm?: string;
}

export interface ClassifyBCSResult {
  bcsClass: BCSClass;
  solubility: 'high' | 'low';
  permeability: 'high' | 'low';
  doseNumberVolume_mL: number;
  /** null while an unstated drug name or dosage form could change it. */
  biowaiverEligible: boolean | null;
  /** null when no drug name was given. */
  isNTI: boolean | null;
  /** Where NTI status came from: the platform's NTI list (not exhaustive), or not assessed. */
  ntiBasis: string;
  biowaiverRationale: string[];
  regulatoryImplications: string[];
  requiredDissolutionConditions: string[];
  citations: string[];
}

/**
 * Classify a drug substance according to the BCS and determine biowaiver eligibility.
 *
 * Solubility criterion: highest dose strength dissolves in <= 250 mL of aqueous
 * media across the physiological pH range (1.2-6.8) at 37 C.
 * Permeability criterion: >= 85% absorbed in humans.
 *
 * Deterministic — identical input always yields identical output.
 */
export function classifyBCS(params: ClassifyBCSParams): ClassifyBCSResult {
  const { highestDoseStrength_mg, solubility_mg_per_mL, fractionAbsorbed, drugName, dosageForm } = params;
  // S5d: a missing or non-numeric input used to classify as Class IV, and an omitted drug name or
  // dosage form was read as not NTI and immediate release.
  refuseUnlessStated('classify_bcs', [
    numberInput('highestDoseStrength_mg', highestDoseStrength_mg, (n) => n > 0, 'a positive dose in mg'),
    numberInput('solubility_mg_per_mL', solubility_mg_per_mL, (n) => n >= 0, 'a solubility of 0 mg/mL or more'),
    numberInput('fractionAbsorbed', fractionAbsorbed, (n) => n >= 0 && n <= 1, 'a fraction from 0 to 1'),
    optionalText('drugName', drugName),
    optionalText('dosageForm', dosageForm),
  ], 'classified');

  // Dose number calculation: D:S ratio = dose / (solubility * 250 mL)
  const doseNumberVolume_mL =
    solubility_mg_per_mL > 0 ? highestDoseStrength_mg / solubility_mg_per_mL : Infinity;
  const solubility: 'high' | 'low' = doseNumberVolume_mL <= SOLUBILITY_VOLUME_LIMIT_ML ? 'high' : 'low';
  const permeability: 'high' | 'low' = fractionAbsorbed >= PERMEABILITY_ABSORPTION_THRESHOLD ? 'high' : 'low';

  let bcsClass: BCSClass;
  if (solubility === 'high' && permeability === 'high') bcsClass = 'I';
  else if (solubility === 'low' && permeability === 'high') bcsClass = 'II';
  else if (solubility === 'high' && permeability === 'low') bcsClass = 'III';
  else bcsClass = 'IV';

  const classData = BCS_CLASS_REGISTRY[bcsClass];
  const nti = ntiStatus(undefined, drugName);
  const isNTI = nti.isNTI === true;

  const biowaiverRationale: string[] = [];
  let biowaiverEligible: boolean | null = classData.biowaiverEligible;

  if (isNTI) {
    biowaiverEligible = false;
    biowaiverRationale.push(
      'Drug "' + (drugName ?? '') + '" is classified as a Narrow Therapeutic Index (NTI) drug. ' +
        'BCS-based biowaivers are NOT permitted for NTI drugs per FDA and ICH M9 guidance.',
    );
  }

  const irForms = ['tablet', 'capsule', 'ir tablet', 'ir capsule', 'immediate-release tablet', 'immediate-release capsule'];
  if (dosageForm && (!irForms.some(f => dosageForm.toLowerCase().includes(f)) || isModifiedRelease(dosageForm))) {
    biowaiverEligible = false;
    biowaiverRationale.push(
      'Dosage form "' + dosageForm + '" is not an immediate-release solid oral dosage form. ' +
        'BCS-based biowaivers apply only to IR solid oral dosage forms (tablets, capsules).',
    );
  }

  const unstated = [
    ...(nti.isNTI === undefined ? ['drugName'] : []),
    ...(dosageForm === undefined || dosageForm === null || dosageForm === '' ? ['dosageForm'] : []),
  ];
  if (biowaiverEligible && unstated.length > 0) {
    biowaiverEligible = null;
    biowaiverRationale.push(
      'BCS Class ' + bcsClass + ' is eligible for a biowaiver only for an immediate-release solid oral dosage form of a drug that is not NTI; ' +
        listed(unstated) + (unstated.length > 1 ? ' are' : ' is') + ' not stated, so eligibility is not assessed.',
    );
    biowaiverRationale.push(...classData.biowaiverConditions);
  } else if (biowaiverEligible) {
    biowaiverRationale.push(
      'BCS Class ' + bcsClass + ': biowaiver eligible under FDA/EMA/ICH M9 guidance.',
    );
    biowaiverRationale.push(...classData.biowaiverConditions);
  } else if (!isNTI && classData.biowaiverEligible) {
    biowaiverRationale.push(
      'BCS Class ' + bcsClass + ' is generally eligible for biowaiver, but additional conditions are not met.',
    );
  } else {
    biowaiverRationale.push(...classData.biowaiverConditions);
  }

  const requiredDissolutionConditions = biowaiverEligible !== false
    ? [
        'Test dissolution in three media: 0.1N HCl (pH 1.2), acetate buffer (pH 4.5), phosphate buffer (pH 6.8)',
        'USP Apparatus II (paddle) at 50 rpm or USP Apparatus I (basket) at 100 rpm',
        '900 mL media volume, 37 +/- 0.5 C',
        '12 units per test',
        bcsClass === 'I'
          ? 'Very rapidly dissolving (>= 85% in 15 min) OR rapidly dissolving (>= 85% in 30 min) with f2 >= 50'
          : 'Very rapidly dissolving (>= 85% in 15 min) required for BOTH test and reference',
      ]
    : ['BCS-based biowaiver not applicable; in vivo BE study required.'];

  return {
    bcsClass,
    solubility,
    permeability,
    doseNumberVolume_mL: Math.round(doseNumberVolume_mL * 100) / 100,
    biowaiverEligible,
    isNTI: nti.isNTI ?? null,
    ntiBasis: nti.basis,
    biowaiverRationale,
    regulatoryImplications: classData.regulatoryImplications,
    requiredDissolutionConditions,
    citations: [
      ...classData.fdaGuidance,
      ...classData.emaGuidance,
      ...classData.ichM9Notes,
    ],
  };
}

// ────── 6b. designBEStudy ──────

export interface DesignBEStudyParams {
  /** Expected within-subject CV (%) for the PK parameter of interest. */
  withinSubjectCV: number;
  /** Elimination half-life (hours). */
  halfLife_hours: number;
  /** Is the drug an NTI drug? */
  isNTI?: boolean;
  /** Drug name (optional, for NTI lookup). */
  drugName?: string;
  /** Expected geometric mean ratio T/R (%). Default 100. */
  expectedGMR?: number;
  /** Target power (0-1). Default 0.80. */
  targetPower?: number;
  /** Dosage form type. */
  dosageForm?: string;
  /** Is a fed-state study required? */
  fedStudyRequired?: boolean;
  /** Number of formulations to compare (default 2: T vs R). */
  formulationsToCompare?: number;
}

export interface DesignBEStudyResult {
  inputStates: InputStates;
  /** null where an unstated NTI status could change it. */
  recommendedDesign: BEStudyDesign | null;
  alternativeDesigns: BEStudyDesignName[] | null;
  acceptanceCriteria: BEAcceptanceCriteria[] | null;
  isHighlyVariable: boolean;
  isNTI: boolean | null;
  ntiBasis: string;
  scaledApproachApplicable: boolean | null;
  /** null when it is not computable: an unstated NTI status, or a GMR outside the acceptance limits. */
  estimatedSampleSize: { perGroup: number | null; total: number | null; basis: string };
  /** The numeric inputs that were not stated and the value used for each. */
  defaultsApplied: string[];
  washoutPeriod: { minimum_hours: number; recommended_hours: number; basis: string };
  studyConditions: string[];
  additionalRequirements: string[];
  citations: string[];
}

/**
 * Recommend an optimal BE study design based on drug characteristics.
 *
 * Considers within-subject variability, half-life, NTI status, number of
 * formulations, and regulatory acceptance criteria. Returns the recommended
 * design with acceptance criteria, sample size estimate, and washout guidance.
 *
 * Deterministic — identical input always yields identical output.
 */
export function designBEStudy(params: DesignBEStudyParams): DesignBEStudyResult {
  // S5d: required numbers were not checked (a missing CV gave NaN subjects), an omitted isNTI with no
  // name and an omitted fedStudyRequired were read as false, a stated false NTI was overridden by the
  // list, and a power other than 0.70, 0.80 or 0.90 was sized at one of them.
  refuseUnlessStated('design_be_study', [
    numberInput('withinSubjectCV', params.withinSubjectCV, (n) => n > 0, 'a positive CV in %'),
    numberInput('halfLife_hours', params.halfLife_hours, (n) => n > 0, 'a positive half-life in hours'),
    optionalText('drugName', params.drugName),
    optionalText('dosageForm', params.dosageForm),
  ], 'designed');
  const gmr = statedNumber('expectedGMR', params.expectedGMR, (n) => n > 0, 'a positive GMR in %');
  const power = statedNumber('targetPower', params.targetPower, (n) => n > 0 && n < 1, 'a power between 0 and 1');
  const formulations = statedNumber('formulationsToCompare', params.formulationsToCompare, (n) => Number.isInteger(n) && n >= 2, 'a whole number of 2 or more');
  const inputStates = booleanInputStates(params, ['isNTI', 'fedStudyRequired']);
  const nti = ntiStatus(statedBoolean('isNTI', params.isNTI), params.drugName);
  const defaultsApplied = [
    ...(gmr === undefined ? ['expectedGMR not stated: 100% used.'] : []),
    ...(power === undefined ? ['targetPower not stated: 0.80 used.'] : []),
    ...(formulations === undefined ? ['formulationsToCompare not stated: 2 (test vs. reference) used.'] : []),
  ];
  const resolved = { ...params, expectedGMR: gmr ?? 100, targetPower: power ?? 0.8, formulationsToCompare: formulations ?? 2 };
  const base = { inputStates, ntiBasis: nti.basis, defaultsApplied };
  if (nti.isNTI !== undefined) return { ...beStudyFor(resolved, nti.isNTI), ...base };
  // NTI not stated: a field both answers give is kept; one they differ on is null and named.
  const notNTI = beStudyFor(resolved, false);
  const ifNTI = beStudyFor(resolved, true);
  const same = <T>(a: T, b: T): T | null => (JSON.stringify(a) === JSON.stringify(b) ? a : null);
  return {
    ...notNTI,
    ...base,
    recommendedDesign: same(notNTI.recommendedDesign, ifNTI.recommendedDesign),
    alternativeDesigns: same(notNTI.alternativeDesigns, ifNTI.alternativeDesigns),
    acceptanceCriteria: null,
    isNTI: null,
    scaledApproachApplicable: same(notNTI.scaledApproachApplicable, ifNTI.scaledApproachApplicable),
    estimatedSampleSize: {
      perGroup: null,
      total: null,
      basis: `Not computed: it depends on NTI status (${nti.open}): 90.00-111.11% limits if NTI, 80.00-125.00% if not.`,
    },
    additionalRequirements: [
      `${nti.open}: for an NTI drug, tighter acceptance criteria (90.00-111.11%) apply and a replicate design is considered.`,
      ...notNTI.additionalRequirements,
    ],
    citations: [...new Set([...notNTI.citations, ...ifNTI.citations])],
  };
}

/** The design for a stated (or name-listed) NTI status, with the numeric defaults already applied. */
function beStudyFor(
  params: DesignBEStudyParams & { expectedGMR: number; targetPower: number; formulationsToCompare: number },
  isNTI: boolean,
): Omit<DesignBEStudyResult, 'inputStates' | 'ntiBasis' | 'defaultsApplied'> {
  const {
    withinSubjectCV,
    halfLife_hours,
    expectedGMR,
    targetPower,
    dosageForm,
    formulationsToCompare,
  } = params;
  const fedStudyRequired = statedBoolean('fedStudyRequired', params.fedStudyRequired);

  const isHighlyVariable = withinSubjectCV > 30;
  const isVeryLongHalfLife = halfLife_hours > 72;

  // ── Design selection logic ──
  let designName: BEStudyDesignName;
  const alternativeDesigns: BEStudyDesignName[] = [];

  if (isVeryLongHalfLife) {
    designName = 'parallel';
    alternativeDesigns.push('crossover_2x2');
  } else if (formulationsToCompare >= 4) {
    designName = 'crossover_4x4';
    alternativeDesigns.push('crossover_3x3');
  } else if (formulationsToCompare === 3) {
    designName = 'crossover_3x3';
    alternativeDesigns.push('crossover_4x4');
  } else if (isHighlyVariable && !isNTI) {
    designName = 'replicate_4_period';
    alternativeDesigns.push('partial_replicate', 'replicate_3_period', 'crossover_2x2');
  } else {
    designName = 'crossover_2x2';
    if (isHighlyVariable) {
      alternativeDesigns.push('replicate_4_period', 'partial_replicate');
    }
  }

  const design = BE_STUDY_DESIGNS[designName];

  // ── Acceptance criteria ──
  let acceptanceCriteria: BEAcceptanceCriteria[];
  let scaledApproachApplicable = false;

  if (isNTI) {
    acceptanceCriteria = NTI_ACCEPTANCE_CRITERIA;
  } else if (isHighlyVariable && designName.includes('replicate')) {
    scaledApproachApplicable = true;
    acceptanceCriteria = design.acceptanceCriteria;
  } else {
    acceptanceCriteria = [
      { parameter: 'AUC0-t', lowerBound: 80.00, upperBound: 125.00, confidenceLevel: 90, scalingApplied: false },
      { parameter: 'AUC0-inf', lowerBound: 80.00, upperBound: 125.00, confidenceLevel: 90, scalingApplied: false },
      { parameter: 'Cmax', lowerBound: 80.00, upperBound: 125.00, confidenceLevel: 90, scalingApplied: false },
    ];
  }

  // ── Sample size estimation (closed-form, 2-sided t-test on log scale) ──
  const cv = withinSubjectCV / 100;
  const sigmaW = Math.sqrt(Math.log(1 + cv * cv));
  const gmrDecimal = expectedGMR / 100;
  const delta = Math.abs(Math.log(gmrDecimal));
  const theta = isNTI ? Math.log(111.11 / 100) : Math.log(125 / 100);
  const zAlpha = 1.645; // one-sided 5% (for 90% CI)
  // z for the stated power, to the table's 3 decimals (0.524, 0.842, 1.282 at 0.70, 0.80, 0.90). Before
  // 2026-11-09 any other power was sized at one of those three.
  const zBeta = Math.round(normalQuantile(targetPower) * 1000) / 1000;

  let nPerGroup: number | null;
  if (theta - delta <= 0) {
    nPerGroup = null; // GMR outside the acceptance range: no sample size achieves BE (it was 9999)
  } else {
    // Crossover: n per sequence = 2 * sigma^2 * (z_alpha + z_beta)^2 / (theta - delta)^2
    // Parallel: n per group = 2 * sigma_total^2 * (z_alpha + z_beta)^2 / (theta - delta)^2
    const varianceFactor = designName === 'parallel' ? 2 * sigmaW * sigmaW : sigmaW * sigmaW;
    nPerGroup = Math.ceil(
      (2 * varianceFactor * Math.pow(zAlpha + zBeta, 2)) / Math.pow(theta - delta, 2),
    );
    nPerGroup = Math.max(nPerGroup, 6); // regulatory minimum per group
  }

  // For replicate designs, reduce sample size by ~25% due to lower residual variance
  if (designName.includes('replicate') && nPerGroup !== null) {
    nPerGroup = Math.max(Math.ceil(nPerGroup * 0.75), 6);
  }

  const seqCount = design.sequences;
  const total = nPerGroup === null ? null : nPerGroup * seqCount;

  // ── Washout ──
  const minWashout = halfLife_hours * 5;
  const recommendedWashout = halfLife_hours * 7;

  // ── Study conditions ──
  const studyConditions: string[] = [
    'Healthy adult volunteers (18-55 years, BMI 18.5-30 kg/m2)',
    'Fasting condition: overnight fast >= 10 hours',
    'Standardized meals post-dose per FDA/EMA guidance',
    'Blood sampling: pre-dose and at sufficient time points to characterize AUC and Cmax',
  ];
  if (fedStudyRequired) {
    studyConditions.push(
      'Fed condition: FDA high-fat, high-calorie breakfast (800-1000 kcal, ~50% from fat)',
      'Dosing within 30 minutes of starting the meal',
    );
  } else if (fedStudyRequired === undefined) {
    studyConditions.push('fedStudyRequired is not stated: whether a fed-state study is also needed is not assessed.');
  }

  const additionalRequirements: string[] = [];
  if (isNTI) {
    additionalRequirements.push(
      'NTI drug: tighter acceptance criteria (90.00-111.11%) apply per FDA guidance',
      'Consider replicate design to demonstrate within-subject variability equivalence',
      'FDA may require scaled average BE with NTI-specific scaling factor',
    );
  }
  if (isHighlyVariable) {
    additionalRequirements.push(
      'Highly variable drug (CVw = ' + withinSubjectCV + '% > 30%): consider RSABE approach',
      'Replicate design recommended to estimate within-subject reference variability (sWR)',
      'If sWR >= 0.294, reference-scaled acceptance limits apply to Cmax',
    );
  }
  if (dosageForm && isModifiedRelease(dosageForm)) {
    additionalRequirements.push(
      'Modified-release product: both fasting and fed BE studies typically required',
      'Multi-dose (steady-state) study may be needed per product-specific guidance',
      'Additional PK parameters: Cmin, AUC0-tau, %Fluctuation',
    );
  }

  return {
    recommendedDesign: design,
    alternativeDesigns,
    acceptanceCriteria,
    isHighlyVariable,
    isNTI,
    scaledApproachApplicable,
    estimatedSampleSize: {
      perGroup: nPerGroup,
      total,
      basis: nPerGroup === null
        ? 'Not computed: the expected GMR (' + expectedGMR + '%) lies outside the acceptance limits, so no sample size achieves BE.'
        : 'Closed-form estimate: CVw=' + withinSubjectCV + '%, GMR=' + expectedGMR + '%, power=' + (targetPower * 100).toFixed(0) + '%, alpha=0.05 (two one-sided tests). Actual sample size should be confirmed via simulation.',
    },
    washoutPeriod: {
      minimum_hours: Math.round(minWashout),
      recommended_hours: Math.round(recommendedWashout),
      basis: 'Based on elimination half-life of ' + halfLife_hours + ' hours. Minimum = 5 x t1/2; Recommended = 7 x t1/2.',
    },
    studyConditions,
    additionalRequirements,
    citations: [
      ...design.regulatoryBasis,
      ...(isNTI
        ? [
            'FDA Guidance: Statistical Approaches to Establishing Bioequivalence (2001) — NTI provisions',
            '21 CFR 320.33 — Criteria for NTI drug BE',
          ]
        : []),
      ...(isHighlyVariable
        ? [
            HVD_SWITCHING_CRITERION.regulatoryCitation,
            'EMA/CHMP/QWP/428693/2017 Section 4.1.10 — HVDP expanded limits',
          ]
        : []),
    ],
  };
}

// ────── 6c. assessDissolutionSimilarity ──────

export interface DissolutionProfile {
  /** Time points (minutes). */
  timePoints_min: number[];
  /** Mean % dissolved at each time point (0-100). Must be same length as timePoints_min. */
  meanDissolved: number[];
  /** %RSD at each time point. Without it the CV eligibility conditions cannot be evaluated and f2 is refused. */
  rsdPercent?: number[];
  /** Absolute SD at each time point, as an alternative to rsdPercent. */
  sdPercent?: number[];
}

export interface AssessDissolutionSimilarityParams {
  /** Reference product dissolution profile. */
  reference: DissolutionProfile;
  /** Test product dissolution profile. */
  test: DissolutionProfile;
  /** Units tested per product. REQUIRED: it is never defaulted to 12. */
  unitsPerProduct?: number;
}

export interface DissolutionSimilarityResult {
  /** null when f2 was not computed. */
  f2: number | null;
  /** null when f2 was not computed: no similarity conclusion either way. */
  f2Pass: boolean | null;
  f1: number | null;
  f1Pass: boolean | null;
  interpretation: string;
  f2Formula: string;
  f1Formula: string;
  conditions: string[];
  timePointsUsed: number;
  warnings: string[];
  regulatoryInterpretation: string[];
  citations: string[];
}

/** A list of finite numbers (as long as timePoints_min where given), for refuseUnlessStated. */
function finiteList(field: string, value: unknown, required: boolean, length?: number): RequiredInputCheck {
  return {
    field, value,
    ok: (!required && (value === undefined || value === null)) ||
      (Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
        (length === undefined || value.length === length)),
    expected: `a list of numbers${length === undefined ? '' : ` as long as timePoints_min (${length})`}${required ? '' : ', or left out'}`,
  };
}
/** The checks on one typed profile. */
function profileChecks(role: 'reference' | 'test', p: unknown): RequiredInputCheck[] {
  if (!p || typeof p !== 'object') return [{ field: role, value: p, ok: false, expected: 'a profile with timePoints_min and meanDissolved' }];
  const q = p as Record<string, unknown>;
  const n = Array.isArray(q.timePoints_min) ? q.timePoints_min.length : undefined;
  return [
    finiteList(`${role}.timePoints_min`, q.timePoints_min, true),
    finiteList(`${role}.meanDissolved`, q.meanDissolved, true, n),
    finiteList(`${role}.rsdPercent`, q.rsdPercent, false, n),
    finiteList(`${role}.sdPercent`, q.sdPercent, false, n),
  ];
}

/**
 * Compute the f2 similarity factor and f1 difference factor for two dissolution
 * profiles and provide regulatory interpretation.
 *
 * f2 = 50 * log10{ [1 + (1/n) * SUM(Rt - Tt)^2]^(-0.5) * 100 }
 * f1 = { SUM|Rt - Tt| / SUM(Rt) } * 100
 *
 * FDA/EMA criterion: f2 >= 50 indicates similarity.
 * f1 <= 15 indicates acceptable difference (supplementary criterion).
 *
 * Deterministic — identical input always yields identical output.
 */
export function assessDissolutionSimilarity(
  params: AssessDissolutionSimilarityParams,
): DissolutionSimilarityResult {
  /* The statistic and every eligibility condition live in
     services/cmc/dissolution-comparison, which the CMC dissolution register and
     the AnA recorded twin call too. This adapter maps the typed-number input
     onto it and reports what it says.

     What that engine changed, and why this function no longer computes anything
     itself: it accepted profiles sampled at DIFFERENT times as long as the
     arrays matched in length (returning f2 = 100 "SIMILAR" for 10/20/30 min
     against 15/30/60 min with identical means); it graded f2 on as few as one
     surviving timepoint; it never excluded t = 0, where both profiles are 0 by
     construction; it defaulted the unit count to 12 and then printed "12 units
     tested per product" as a fact; it listed the 20%/10% coefficient-of-
     variation limits in `conditions` with no variability field in its input to
     evaluate them against; and it compared a rounded f2 against 50, so a true
     49.99973 was reported as similar. */
  const { reference, test, unitsPerProduct } = params;
  // S5d: a missing profile or a non-list crashed, and '45' was read as 45. Each is refused by field.
  refuseUnlessStated('assess_dissolution_similarity', [
    ...profileChecks('reference', reference),
    ...profileChecks('test', test),
    { field: 'unitsPerProduct', value: unitsPerProduct, expected: 'a whole number of units, or left out',
      ok: unitsPerProduct === undefined || unitsPerProduct === null || (Number.isInteger(unitsPerProduct) && unitsPerProduct > 0) },
  ], 'compared');
  const toPoints = (p: DissolutionProfile) =>
    p.timePoints_min.map((t, i) => ({
      timepointMin: t,
      meanPercent: p.meanDissolved[i],
      unitsTested: unitsPerProduct,
      rsdPercent: p.rsdPercent ? p.rsdPercent[i] : undefined,
      sdPercent: p.sdPercent ? p.sdPercent[i] : undefined,
    }));

  const outcome = compareDissolutionProfiles(
    { role: 'reference', points: toPoints(reference) },
    { role: 'test', points: toPoints(test) },
    { referenceUnits: unitsPerProduct, testUnits: unitsPerProduct },
  );

  const CITATIONS = [
    'FDA Guidance: Dissolution Testing of Immediate Release Solid Oral Dosage Forms (1997)',
    'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
    'FDA SUPAC-IR Guidance (1995) — f2 comparison for post-approval changes',
    'EMA/CHMP/QWP/428693/2017 Section 5.1.1 — Dissolution profile comparison',
    'ICH M9 Step 4 (2019) Section 2.2 — Dissolution similarity assessment',
    'Moore & Flanner (1996) — Mathematical comparison of dissolution profiles, Pharm Tech 20:64-74',
  ];
  const FORMULAE = {
    f2Formula: 'f2 = 50 * log10{ [1 + (1/n) * SUM(Rt - Tt)^2]^(-0.5) * 100 }',
    f1Formula: 'f1 = { SUM|Rt - Tt| / SUM(Rt) } * 100',
  };

  if (outcome.outcome === 'refused') {
    /* A refusal is reported AS a refusal. There is no f2 to report, so none is
       invented: the numbers stay NaN-free by being absent from the verdict, and
       `interpretation` carries the reason a reader has to act on. */
    return {
      f2: null,
      f2Pass: null,
      f1: null,
      f1Pass: null,
      interpretation: 'f2 was NOT computed. ' + outcome.message,
      ...FORMULAE,
      conditions: outcome.offending.map(
        (o) =>
          [o.role, o.timepointMin !== undefined ? o.timepointMin + ' min' : null, 'observed ' + (o.observed ?? 'nothing'), 'required ' + o.required]
            .filter(Boolean)
            .join(' — '),
      ),
      timePointsUsed: 0,
      warnings: [outcome.message],
      regulatoryInterpretation: [
        'No similarity conclusion is available from these profiles.',
        outcome.alternative ? 'Suggested route: ' + outcome.alternative : 'Record the missing inputs and re-run.',
      ],
      citations: CITATIONS,
    };
  }

  return {
    f2: Number(outcome.f2Reported),
    f2Pass: outcome.f2Similar,
    f1: Number(outcome.f1Reported),
    f1Pass: outcome.f1WithinBand,
    interpretation:
      'f2 = ' + outcome.f2Reported + (outcome.f2Similar ? ' (>= 50): the profiles are similar' : ' (< 50): the profiles are not similar') +
      ', over ' + outcome.inputsUsed.n + ' timepoint(s) at ' + outcome.inputsUsed.includedTimepointsMin.join(', ') + ' min. ' +
      outcome.scope,
    ...FORMULAE,
    // Every condition below was evaluated against the input, with its observed value.
    conditions: outcome.checksEvaluated.map(
      (c) => c.condition + ': required ' + c.required + ', observed ' + c.observed,
    ),
    timePointsUsed: outcome.inputsUsed.n,
    warnings: outcome.inputsUsed.above85Truncation.applied
      ? ['Timepoints after ' + outcome.inputsUsed.above85Truncation.atTimepointMin + ' min excluded: at most one point at or above 85% dissolution is included.']
      : [],
    regulatoryInterpretation: [
      'f2 >= 50: profiles are similar (FDA, EMA, WHO, ICH M9)',
      'f1 <= 15: supplementary criterion for acceptable difference',
      'f2 range: 0 (no similarity) to 100 (identical profiles)',
      'f2 = 50 corresponds to a mean 10% difference at all time points',
      'If both products dissolve >= 85% in 15 min: f2 not required (very rapidly dissolving)',
    ],
    citations: CITATIONS,
  };
}

// ────── 6d. assessBiowaiver ──────

export interface AssessBiowaiverParams {
  /** BCS class (I, II, III, IV). */
  bcsClass: BCSClass;
  /** Drug name (for NTI check). */
  drugName?: string;
  /** Is the drug a narrow therapeutic index drug? */
  isNTI?: boolean;
  /** Dosage form. */
  dosageForm: string;
  /** Is the drug substance a weak acid? Reported, not read: ICH M9 has no Class II weak-acid exception. */
  isWeakAcid?: boolean;
  /** Dose/solubility ratio at pH 6.8 in mL. Checked, not read: ICH M9 has no Class II weak-acid exception. */
  doseSolubilityRatioAtPH6_8_mL?: number;
  /** Does test product dissolve >= 85% in 15 min in all three media? */
  veryRapidlyDissolving?: boolean;
  /** Does test product dissolve >= 85% in 30 min in all three media? */
  rapidlyDissolving?: boolean;
  /** Does reference product dissolve >= 85% in 15 min in all three media? */
  referenceVeryRapidlyDissolving?: boolean;
  /** f2 similarity factor (if available). */
  f2?: number;
  /** Are excipients qualitatively the same as RLD? */
  excipientsQualitativelySame?: boolean;
  /** Are excipients quantitatively similar to RLD (within +/-10%)? */
  excipientsQuantitativelySimilar?: boolean;
  /** Regulatory framework to apply. */
  framework?: 'fda' | 'ema' | 'ich_m9' | 'who';
}

export type BiowaiverDecision = 'BIOWAIVER_GRANTED' | 'BIOWAIVER_CONDITIONAL' | 'BIOWAIVER_DENIED';

export interface BiowaiverResult {
  /** null while an unstated true/false input could change the decision. */
  eligible: boolean | null;
  decision: BiowaiverDecision | 'BIOWAIVER_NOT_ASSESSED';
  rationale: string[];
  requiredDissolutionConditions: string[];
  outstandingRequirements: string[];
  regulatoryFramework: string;
  citations: string[];
  inputStates: InputStates;
  ntiBasis: string;
  defaultsApplied: string[];
}

type BiowaiverOutcome = Omit<BiowaiverResult, 'inputStates' | 'ntiBasis' | 'defaultsApplied' | 'decision' | 'eligible'> & {
  eligible: boolean;
  decision: BiowaiverDecision;
};

/** The true/false facts a decision is searched over. isWeakAcid is reported in inputStates but decides nothing. */
const BIOWAIVER_FACTS = [
  'isNTI', 'veryRapidlyDissolving', 'rapidlyDissolving', 'referenceVeryRapidlyDissolving',
  'excipientsQualitativelySame', 'excipientsQuantitativelySimilar',
] as const;
type BiowaiverFact = (typeof BIOWAIVER_FACTS)[number];

/**
 * Evaluate biowaiver eligibility based on the BCS classification, dissolution
 * behavior, excipient similarity, and regulatory framework.
 *
 * Implements the decision tree from FDA BCS Guidance (2017), ICH M9 (2019),
 * and EMA BCS Guidance. NTI drugs are always excluded.
 *
 * Deterministic — identical input always yields identical output.
 */
export function assessBiowaiver(params: AssessBiowaiverParams): BiowaiverResult {
  // S5d: an omitted dissolution or NTI fact was read as false, so a decision one answer would change was
  // given; a missing class or form crashed, 'false' read as true, and a stated false NTI was silently
  // overridden by the list. The decision is now given only when every answer to the unstated facts gives it.
  const bcsClass = statedOneOf('bcsClass', params.bcsClass, BCS_CLASSES);
  refuseUnlessStated('assess_biowaiver', [
    { field: 'bcsClass', value: params.bcsClass, ok: bcsClass !== undefined, expected: `one of ${BCS_CLASSES.join(', ')}` },
    textInput('dosageForm', params.dosageForm),
    optionalText('drugName', params.drugName),
  ], 'assessed');
  const framework = statedOneOf('framework', params.framework, FRAMEWORKS);
  const f2 = statedNumber('f2', params.f2, (n) => n >= 0 && n <= 100, 'an f2 from 0 to 100');
  const ratio = statedNumber('doseSolubilityRatioAtPH6_8_mL', params.doseSolubilityRatioAtPH6_8_mL, (n) => n > 0, 'a positive volume in mL');
  const inputStates = booleanInputStates(params, [...BIOWAIVER_FACTS, 'isWeakAcid']);
  const nti = ntiStatus(statedBoolean('isNTI', params.isNTI), params.drugName);
  const facts = Object.fromEntries(
    BIOWAIVER_FACTS.map((k) => [k, k === 'isNTI' ? nti.isNTI : statedBoolean(k, params[k])]),
  ) as Record<BiowaiverFact, boolean | undefined>;
  const base = {
    ...params, bcsClass: bcsClass as BCSClass, framework: framework ?? 'ich_m9', f2, doseSolubilityRatioAtPH6_8_mL: ratio,
  };
  const extra = {
    inputStates,
    ntiBasis: nti.basis,
    defaultsApplied: framework === undefined ? ['framework not stated: ich_m9 used.'] : [],
  };
  const reading = biowaiverOutcome({ ...base, ...facts });
  const deciding = decidingFacts(facts, (a) => biowaiverOutcome({ ...base, ...a }).decision);
  if (deciding.length === 0) return { ...reading, ...extra };
  const answers = everyAnswer(facts).map((a) => biowaiverOutcome({ ...base, ...a }));
  const decisions = conclusions(facts, (a) => biowaiverOutcome({ ...base, ...a }).decision);
  // A rationale line or citation (which can name a decision) is kept only when every answer gives it, so none
  // speaks for one answer. The dissolution conditions are those any waiver would need, and the requirements
  // those of the reading in which an unstated fact is not established.
  const everyOne = (pick: (o: BiowaiverOutcome) => string[]) => pick(reading).filter((s) => answers.every((o) => pick(o).includes(s)));
  const citations = everyOne((o) => o.citations);
  return {
    ...extra,
    eligible: null,
    decision: 'BIOWAIVER_NOT_ASSESSED',
    rationale: [
      `Not assessed: ${notSettled(deciding, nti)}, and the decision turns on ` +
        `${deciding.length > 1 ? 'them' : 'it'}: on the possible answers it is ${listed(decisions)}.`,
      ...everyOne((o) => o.rationale),
    ],
    requiredDissolutionConditions: [...new Set(answers.flatMap((o) => o.requiredDissolutionConditions))],
    outstandingRequirements: [
      nti.open !== '' && nti.open !== 'isNTI is not stated' && deciding.includes('isNTI')
        ? `Confirm NTI status and state isNTI (${nti.open})${deciding.length > 1 ? `; state ${listed(deciding.filter((k) => k !== 'isNTI'))}` : ''}.`
        : `State ${listed(deciding)}.`,
      ...(reading.decision === 'BIOWAIVER_CONDITIONAL' ? reading.outstandingRequirements : []),
    ],
    regulatoryFramework: reading.regulatoryFramework,
    citations: citations.length > 0 ? citations : ['ICH M9 Step 4 (2019)', 'FDA Guidance: M9 Biopharmaceutics Classification System-Based Biowaivers (2021)'],
  };
}

/** The decision for one reading of the facts; an unstated (undefined) fact is not established. */
function biowaiverOutcome(
  params: Omit<AssessBiowaiverParams, 'framework'> & { framework: NonNullable<AssessBiowaiverParams['framework']> },
): BiowaiverOutcome {
  const {
    bcsClass,
    drugName,
    dosageForm,
    veryRapidlyDissolving = false,
    rapidlyDissolving = false,
    referenceVeryRapidlyDissolving = false,
    f2,
    excipientsQualitativelySame,
    excipientsQuantitativelySimilar,
    framework,
  } = params;
  const isNTI = params.isNTI === true;

  const rationale: string[] = [];
  const outstandingRequirements: string[] = [];
  const requiredDissolutionConditions: string[] = [];

  // Gate 1: NTI check. Denied on a stated or listed narrow-therapeutic-index drug: ICH M9 (2019), whose scope the
  // FDA (2021) and the EMA apply, excludes NTI drug products from BCS-based biowaivers.
  if (isNTI) {
    return {
      eligible: false,
      decision: 'BIOWAIVER_DENIED',
      rationale: [
        'Drug "' + (drugName ?? 'unspecified') + '" is a Narrow Therapeutic Index drug.',
        'NTI drugs are excluded from BCS-based biowaiver under all regulatory frameworks (FDA, EMA, ICH M9, WHO).',
        'An in vivo BE study is required.',
      ],
      requiredDissolutionConditions: [],
      outstandingRequirements: ['Conduct in vivo bioequivalence study per 21 CFR 320.21'],
      regulatoryFramework: framework.toUpperCase(),
      citations: [
        'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017) — Section IV.B',
        'ICH M9 Step 4 (2019) — Section 1.3: NTI drugs excluded',
      ],
    };
  }

  // Gate 2: Dosage form check
  const isIR = ['tablet', 'capsule', 'ir', 'immediate-release', 'immediate release'].some(
    kw => dosageForm.toLowerCase().includes(kw),
  ) && !isModifiedRelease(dosageForm);
  // Denied for a form that is not immediate release: ICH M9's scope is immediate-release, solid oral dosage forms.
  if (!isIR) {
    return {
      eligible: false,
      decision: 'BIOWAIVER_DENIED',
      rationale: [
        'Dosage form "' + dosageForm + '" is not an immediate-release solid oral dosage form.',
        'BCS-based biowaivers apply only to IR solid oral dosage forms (tablets, capsules).',
      ],
      requiredDissolutionConditions: [],
      outstandingRequirements: ['Conduct in vivo bioequivalence study'],
      regulatoryFramework: framework.toUpperCase(),
      citations: [
        'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017) — Scope',
        'ICH M9 Step 4 (2019) — Scope limited to IR oral dosage forms',
      ],
    };
  }

  // Gate 3: BCS class-specific logic
  switch (bcsClass) {
    case 'I': {
      rationale.push('BCS Class I (high solubility, high permeability): eligible for biowaiver.');
      requiredDissolutionConditions.push(
        'Test in 0.1N HCl (pH 1.2), acetate buffer (pH 4.5), phosphate buffer (pH 6.8)',
        'USP II paddle at 50 rpm or USP I basket at 100 rpm',
        '900 mL, 37 +/- 0.5 C, >= 12 units',
      );

      // ICH M9 (2019) 5.1 and the FDA 2017 BCS guidance waive the f2 profile
      // comparison only when BOTH the test AND the reference product are very
      // rapidly dissolving. This branch consulted the TEST product alone, so a
      // caller who stated the RLD is NOT very rapidly dissolving — or who never
      // characterised it at all — still received BIOWAIVER_GRANTED with an empty
      // outstandingRequirements. (The Class III branch below already states the
      // both-products rule verbatim in its required dissolution conditions.)
      if (veryRapidlyDissolving && referenceVeryRapidlyDissolving) {
        rationale.push(
          'Both test and reference products are very rapidly dissolving (>= 85% in 15 min): f2 comparison not required.',
        );
        return {
          eligible: true,
          decision: 'BIOWAIVER_GRANTED',
          rationale,
          requiredDissolutionConditions,
          outstandingRequirements: [],
          regulatoryFramework: framework.toUpperCase(),
          citations: [
            'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
            'ICH M9 Step 4 (2019) — BCS Class I very rapidly dissolving: biowaiver granted',
          ],
        };
      }

      if (veryRapidlyDissolving) {
        // Test is very rapidly dissolving but the reference is not established as
        // such. An f2 >= 50 against the RLD independently supports the waiver
        // (that comparison IS against the reference), so honour it; otherwise the
        // shortcut is unavailable and the gap must be named.
        if (f2 !== undefined && f2 >= 50) {
          rationale.push(
            'Test product is very rapidly dissolving (>= 85% in 15 min); the reference is not established as very rapidly dissolving, but f2 = ' +
              f2 +
              ' (>= 50) confirms dissolution profile similarity to the RLD.',
          );
          return {
            eligible: true,
            decision: 'BIOWAIVER_GRANTED',
            rationale,
            requiredDissolutionConditions,
            outstandingRequirements: [],
            regulatoryFramework: framework.toUpperCase(),
            citations: [
              'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
              'ICH M9 Step 4 (2019) — BCS Class I with f2 >= 50: biowaiver granted',
            ],
          };
        }
        rationale.push(
          'Test product is very rapidly dissolving (>= 85% in 15 min), but the REFERENCE product is not established as very rapidly dissolving, so the f2 comparison cannot be waived.',
        );
        outstandingRequirements.push(
          'Establish that the REFERENCE product is also very rapidly dissolving (>= 85% in 15 min), or demonstrate f2 >= 50 vs. the RLD',
        );
        return {
          eligible: false,
          decision: 'BIOWAIVER_CONDITIONAL',
          rationale,
          requiredDissolutionConditions,
          outstandingRequirements,
          regulatoryFramework: framework.toUpperCase(),
          citations: [
            'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
            'ICH M9 Step 4 (2019) — BCS Class I requires both products to be very rapidly dissolving to waive f2',
          ],
        };
      }

      if (rapidlyDissolving) {
        rationale.push('Test product is rapidly dissolving (>= 85% in 30 min).');
        if (f2 !== undefined && f2 >= 50) {
          rationale.push('f2 = ' + f2 + ' (>= 50): dissolution profile similarity confirmed.');
          return {
            eligible: true,
            decision: 'BIOWAIVER_GRANTED',
            rationale,
            requiredDissolutionConditions,
            outstandingRequirements: [],
            regulatoryFramework: framework.toUpperCase(),
            citations: [
              'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
              'ICH M9 Step 4 (2019) — BCS Class I rapidly dissolving with f2 >= 50: biowaiver granted',
            ],
          };
        }
        outstandingRequirements.push('Demonstrate f2 >= 50 vs. RLD in all three media');
        return {
          eligible: false,
          decision: 'BIOWAIVER_CONDITIONAL',
          rationale: [...rationale, 'f2 similarity data needed to confirm biowaiver eligibility.'],
          requiredDissolutionConditions,
          outstandingRequirements,
          regulatoryFramework: framework.toUpperCase(),
          citations: [
            'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
            'ICH M9 Step 4 (2019)',
          ],
        };
      }

      outstandingRequirements.push(
        'Demonstrate very rapidly dissolving (>= 85% in 15 min) OR rapidly dissolving (>= 85% in 30 min) with f2 >= 50',
      );
      return {
        eligible: false,
        decision: 'BIOWAIVER_CONDITIONAL',
        rationale: [...rationale, 'Dissolution rate data required to finalize biowaiver eligibility.'],
        requiredDissolutionConditions,
        outstandingRequirements,
        regulatoryFramework: framework.toUpperCase(),
        citations: [
          'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
          'ICH M9 Step 4 (2019)',
        ],
      };
    }

    case 'II': {
      rationale.push('BCS Class II (low solubility, high permeability): NOT eligible for a BCS-based biowaiver.');

      // ICH M9 admits Class I and III only; the FDA (2021) and the EMA apply it. Until 2026-11-09 a weak acid
      // with a pH 6.8 dose/solubility ratio <= 250 mL was granted a "Class IIa" waiver under ich_m9 and ema,
      // which ICH M9 does not contain; isWeakAcid and that ratio now decide nothing.
      return {
        eligible: false,
        decision: 'BIOWAIVER_DENIED',
        rationale: [
          ...rationale,
          'ICH M9, which the FDA and the EMA apply, permits a BCS-based biowaiver for Class I and III only; a weak acid is not an exception.',
          'An in vivo BE study is required.',
        ],
        requiredDissolutionConditions: [],
        outstandingRequirements: ['Conduct in vivo bioequivalence study'],
        regulatoryFramework: framework.toUpperCase(),
        citations: [
          'FDA Guidance: M9 Biopharmaceutics Classification System-Based Biowaivers (2021)',
          'ICH M9 Step 4 (2019) — BCS Class II: biowaiver not applicable',
          '21 CFR 320.22 — BCS Class II not listed for biowaiver',
        ],
      };
    }

    case 'III': {
      rationale.push('BCS Class III (high solubility, low permeability): eligible for biowaiver with stricter criteria.');
      requiredDissolutionConditions.push(
        'Test in 0.1N HCl (pH 1.2), acetate buffer (pH 4.5), phosphate buffer (pH 6.8)',
        'USP II paddle at 50 rpm or USP I basket at 100 rpm',
        '900 mL, 37 +/- 0.5 C, >= 12 units',
        'Both test AND reference must be very rapidly dissolving (>= 85% in 15 min)',
      );

      // Excipient check. Excipient sameness is THE criterion that separates a
      // Class III biowaiver from a Class I one, so it must be AFFIRMATIVELY
      // established. The test was `!== false`, which reads `undefined` — the
      // caller never assessed excipients — identically to an affirmative `true`
      // (both flags are optional, and neither is in the tool schema's `required`
      // list). That granted the biowaiver and printed 'Excipient similarity
      // criteria met.' over a comparison nobody performed.
      const excipientOK =
        excipientsQualitativelySame === true && excipientsQuantitativelySimilar === true;
      if (!excipientOK) {
        rationale.push(
          'BCS Class III requires excipients to be qualitatively the same and quantitatively similar (+/- 10%) to the RLD.',
        );
        if (excipientsQualitativelySame === false) {
          outstandingRequirements.push('Excipients must be qualitatively the same as the RLD');
        } else if (excipientsQualitativelySame === undefined) {
          outstandingRequirements.push(
            'Qualitative excipient comparison against the RLD was not provided — it must be established, not assumed',
          );
        }
        if (excipientsQuantitativelySimilar === false) {
          outstandingRequirements.push('Excipient quantities must be within +/- 10% of the RLD');
        } else if (excipientsQuantitativelySimilar === undefined) {
          outstandingRequirements.push(
            'Quantitative excipient comparison (+/- 10% of the RLD) was not provided — it must be established, not assumed',
          );
        }
      }

      if (veryRapidlyDissolving && referenceVeryRapidlyDissolving && excipientOK) {
        rationale.push(
          'Both test and reference are very rapidly dissolving (>= 85% in 15 min).',
          'Excipient similarity criteria met.',
        );
        return {
          eligible: true,
          decision: 'BIOWAIVER_GRANTED',
          rationale,
          requiredDissolutionConditions,
          outstandingRequirements: [],
          regulatoryFramework: framework.toUpperCase(),
          citations: [
            'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
            'ICH M9 Step 4 (2019) — BCS Class III very rapidly dissolving: biowaiver granted',
          ],
        };
      }

      // ICH M9 requires BOTH products to be very rapidly dissolving for Class III. Until 2026-11-09 a test
      // product that was only rapidly dissolving, with f2 >= 50, was granted under ich_m9, which ICH M9 does not allow.

      if (!veryRapidlyDissolving || !referenceVeryRapidlyDissolving) {
        outstandingRequirements.push(
          'Demonstrate very rapidly dissolving (>= 85% in 15 min) for BOTH test and reference',
        );
      }

      return {
        eligible: false,
        decision: outstandingRequirements.length > 0 ? 'BIOWAIVER_CONDITIONAL' : 'BIOWAIVER_DENIED',
        rationale: [...rationale, 'Additional data required to confirm biowaiver eligibility.'],
        requiredDissolutionConditions,
        outstandingRequirements,
        regulatoryFramework: framework.toUpperCase(),
        citations: [
          'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
          'ICH M9 Step 4 (2019) — BCS Class III criteria',
        ],
      };
    }

    case 'IV': {
      // Denied: ICH M9 admits BCS Class I and III drugs only; Class IV (low solubility, low permeability) is outside it.
      return {
        eligible: false,
        decision: 'BIOWAIVER_DENIED',
        rationale: [
          'BCS Class IV (low solubility, low permeability): NOT eligible for biowaiver.',
          'Both dissolution and permeability are rate-limiting. No regulatory framework permits a BCS-based biowaiver.',
          'An in vivo BE study is required.',
        ],
        requiredDissolutionConditions: [],
        outstandingRequirements: ['Conduct in vivo bioequivalence study per 21 CFR 320.21'],
        regulatoryFramework: framework.toUpperCase(),
        citations: [
          'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
          'ICH M9 Step 4 (2019) — BCS Class IV excluded',
          '21 CFR 320.22 — BCS Class IV not eligible for biowaiver',
        ],
      };
    }

    default: {
      const _exhaustive: never = bcsClass;
      throw new Error('Unknown BCS class: ' + _exhaustive);
    }
  }
}

// ────── 6e. guidanceForANDA ──────

export interface GuidanceForANDAParams {
  /** Active ingredient name. */
  activeIngredient: string;
  /** Proposed dosage form. */
  dosageForm: string;
  /** Proposed route of administration. Not read: the pathway reads sameRouteAsRLD. */
  routeOfAdministration?: string;
  /** Proposed strength(s). */
  strengths: string[];
  /** Is the product the same dosage form as the RLD? Omitted: not stated. */
  sameDosageFormAsRLD?: boolean;
  /** Is the product the same route as the RLD? Omitted: not stated. */
  sameRouteAsRLD?: boolean;
  /** Is the product the same strength as the RLD? Omitted: not stated. */
  sameStrengthAsRLD?: boolean;
  /** Is this a combination product? */
  isCombinationProduct?: boolean;
  /** BCS class, if known. */
  bcsClass?: BCSClass;
  /** Is the drug an NTI drug? */
  isNTI?: boolean;
}

export interface ANDAGuidanceResult {
  inputStates: InputStates;
  /** Where NTI status came from: stated, the active ingredient on the platform's NTI list, or not assessed. */
  ntiBasis: string;
  /** not_assessed while an unstated sameness fact could change it. */
  recommendedPathway: RegulatoryPathway | 'not_assessed';
  pathwayGuidance: PathwayGuidance | null;
  suitabilityPetitionRequired: boolean | null;
  suitabilityPetitionReason?: string;
  beStrategyRecommendation: string[];
  orangeBookConsiderations: string[];
  patentCertificationGuidance: string[];
  additionalStudies: string[];
  citations: string[];
}

/**
 * Provide pathway guidance for a generic drug application based on the proposed
 * product characteristics relative to the RLD.
 *
 * Determines whether an ANDA 505(j), 505(b)(2) NDA, or suitability petition
 * is the appropriate pathway, and provides BE strategy recommendations.
 *
 * Deterministic — identical input always yields identical output.
 */
export function guidanceForANDA(params: GuidanceForANDAParams): ANDAGuidanceResult {
  // S5d: an omitted sameness fact was read as false ({} gave a 505(b)(2)), an omitted BCS class, NTI or
  // combination fact as the answer that adds nothing, and a missing form or strength list crashed.
  const bcsClass = statedOneOf('bcsClass', params.bcsClass, BCS_CLASSES);
  refuseUnlessStated('guidance_for_anda', [
    textInput('activeIngredient', params.activeIngredient),
    textInput('dosageForm', params.dosageForm),
    {
      field: 'strengths', value: params.strengths, expected: 'a list of one or more strengths as text',
      ok: Array.isArray(params.strengths) && params.strengths.length > 0 && params.strengths.every((s) => typeof s === 'string'),
    },
  ], 'assessed');
  const inputStates = booleanInputStates(params, [
    'sameDosageFormAsRLD', 'sameRouteAsRLD', 'sameStrengthAsRLD', 'isCombinationProduct', 'isNTI',
  ]);
  const { activeIngredient, dosageForm, strengths } = params;
  const sameDosageFormAsRLD = statedBoolean('sameDosageFormAsRLD', params.sameDosageFormAsRLD);
  const sameRouteAsRLD = statedBoolean('sameRouteAsRLD', params.sameRouteAsRLD);
  const sameStrengthAsRLD = statedBoolean('sameStrengthAsRLD', params.sameStrengthAsRLD);
  const isCombinationProduct = statedBoolean('isCombinationProduct', params.isCombinationProduct);
  // NTI status as in the other worksheets: stated, or the active ingredient on the platform's NTI list.
  const nti = ntiStatus(statedBoolean('isNTI', params.isNTI), activeIngredient);
  const isNTI = nti.isNTI;

  // ── Pathway determination ──
  // A different route is a 505(b)(2); the same route with a different form or strength a suitability
  // petition; pharmaceutical equivalence an ANDA. Decided only when every answer to the unstated facts agrees.
  const sameness = { sameDosageFormAsRLD, sameRouteAsRLD, sameStrengthAsRLD };
  const pathwayOf = (a: Record<keyof typeof sameness, boolean>): RegulatoryPathway =>
    !a.sameRouteAsRLD ? '505b2' : a.sameDosageFormAsRLD && a.sameStrengthAsRLD ? 'anda_505j' : 'suitability_petition';
  const deciding = decidingFacts(sameness, pathwayOf);
  const candidates = conclusions(sameness, pathwayOf);
  const recommendedPathway: RegulatoryPathway | 'not_assessed' = deciding.length === 0 ? candidates[0] : 'not_assessed';
  const suitabilityPetitionRequired: boolean | null = candidates.every((p) => p === 'suitability_petition')
    ? true
    : candidates.includes('suitability_petition') ? null : false;
  let suitabilityPetitionReason: string | undefined;
  if (suitabilityPetitionRequired) {
    const reasons: string[] = [];
    if (sameDosageFormAsRLD === false) reasons.push('different dosage form (proposed: ' + dosageForm + ')');
    if (sameStrengthAsRLD === false) reasons.push('different strength(s) (proposed: ' + strengths.join(', ') + ')');
    const open = (['sameDosageFormAsRLD', 'sameStrengthAsRLD'] as const).filter((k) => sameness[k] === undefined);
    suitabilityPetitionReason =
      'Suitability petition required because the proposed product has ' + reasons.join(' and ') + ' compared to the RLD. ' +
      'FDA must determine that the change does not require new safety/efficacy data.' +
      (open.length > 0 ? ' ' + listed(open) + (open.length > 1 ? ' are' : ' is') + ' not stated.' : '');
  } else if (recommendedPathway === 'not_assessed') {
    suitabilityPetitionReason =
      'Not assessed: ' + listed(deciding) + (deciding.length > 1 ? ' are' : ' is') + ' not stated, and the pathway turns on ' +
      (deciding.length > 1 ? 'them' : 'it') + ' (' + listed(candidates) + ').';
  }

  const pathwayGuidance = recommendedPathway === 'not_assessed' ? null : PATHWAY_REGISTRY[recommendedPathway];

  // ── BE strategy ──
  const beStrategyRecommendation: string[] = [];
  const genericRoute = candidates.every((p) => p === 'anda_505j' || p === 'suitability_petition');

  if (recommendedPathway === 'not_assessed' && !genericRoute) {
    beStrategyRecommendation.push(
      'The BE strategy turns on the pathway, which is not assessed (' + listed(deciding) + ' not stated).',
      'For an ANDA or a suitability petition: an in vivo BE study with PK endpoints, or a BCS-based biowaiver where eligible.',
      'For a 505(b)(2): a bridging BE study to the reference product.',
    );
  } else if (genericRoute) {
    if (bcsClass === 'I' || bcsClass === 'III') {
      beStrategyRecommendation.push(
        'BCS Class ' + bcsClass + ': evaluate biowaiver eligibility (in vitro dissolution comparison may suffice).',
        'Conduct dissolution testing in three media (pH 1.2, 4.5, 6.8) per FDA BCS Guidance.',
      );
    } else if (bcsClass === undefined) {
      beStrategyRecommendation.push(
        'bcsClass is not stated: for BCS Class I or III, evaluate biowaiver eligibility; otherwise an in vivo BE study with PK endpoints (AUC, Cmax) is required.',
        'Consult product-specific guidance (PSG) on FDA website for specific study design requirements.',
      );
    } else {
      beStrategyRecommendation.push(
        'In vivo BE study required with PK endpoints (AUC, Cmax).',
        'Consult product-specific guidance (PSG) on FDA website for specific study design requirements.',
      );
    }

    // Dosage form-specific BE approaches
    const lowerForm = dosageForm.toLowerCase();
    if (lowerForm.includes('topical') || lowerForm.includes('cream') || lowerForm.includes('ointment')) {
      beStrategyRecommendation.push(
        'Topical product: clinical endpoint BE study or in vitro permeation testing (IVPT) may be required.',
        'Consult PSG for the specific topical drug product.',
      );
    } else if (lowerForm.includes('ophthalmic')) {
      beStrategyRecommendation.push(
        'Ophthalmic product: clinical endpoint study may be required.',
        'In vitro release testing may supplement clinical data.',
      );
    } else if (lowerForm.includes('inhala') || lowerForm.includes('nasal')) {
      beStrategyRecommendation.push(
        'Inhalation/nasal product: in vitro comparative testing (cascade impaction, spray pattern) plus PK and/or clinical endpoint study.',
        'FDA product-specific guidance provides detailed requirements.',
      );
    } else if (isModifiedRelease(dosageForm)) {
      beStrategyRecommendation.push(
        'Modified-release product: both fasting and fed BE studies required.',
        'Multi-dose steady-state study may be needed for certain products.',
        'Additional PK parameters: Cmin, AUC0-tau, %Fluctuation, %Swing.',
      );
    }

    if (isNTI) {
      beStrategyRecommendation.push(
        'NTI drug: tighter BE acceptance criteria (90.00-111.11%) may apply.',
        'Replicate design recommended to assess within-subject variability equivalence.',
      );
    } else if (isNTI === undefined) {
      beStrategyRecommendation.push(`${nti.open}: for an NTI drug, tighter BE acceptance criteria (90.00-111.11%) may apply.`);
    }
  } else {
    // 505(b)(2)
    beStrategyRecommendation.push(
      'Bridge BE study to the reference product recommended.',
      'Additional clinical studies may be needed depending on the nature and extent of changes from the RLD.',
      'Consult FDA pre-IND or pre-NDA meeting for specific study requirements.',
    );
  }

  // ── Orange Book considerations ──
  const orangeBookConsiderations = [
    'Verify the RLD is listed in the FDA Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations)',
    'Check for listed patents and determine required patent certifications (Paragraphs I-IV)',
    'Check for any exclusivity periods (new chemical entity, orphan drug, pediatric, CGT)',
    'Active ingredient: ' + activeIngredient + ' — verify correct active moiety listing',
  ];

  if (isCombinationProduct) {
    orangeBookConsiderations.push(
      'Combination product: verify that each active ingredient has an approved RLD',
      'Check whether a single RLD covers all active ingredients or multiple RLDs are needed',
    );
  } else if (isCombinationProduct === undefined) {
    orangeBookConsiderations.push('isCombinationProduct is not stated: for a combination product, verify that each active ingredient has an approved RLD');
  }

  // ── Patent certification guidance ──
  const patentCertificationGuidance = [
    'Paragraph I: No patent listed for the RLD in the Orange Book',
    'Paragraph II: Listed patent has expired',
    'Paragraph III: Listed patent will expire on a certain date (ANDA approval delayed until expiry)',
    'Paragraph IV: Listed patent is invalid, unenforceable, or will not be infringed — triggers 45-day notice to NDA holder, potential 30-month stay',
    'For Paragraph IV: consider First-to-File 180-day exclusivity implications',
    'All patent certifications must be included in the ANDA at filing',
  ];

  // ── Additional studies ──
  const additionalStudies: string[] = [];
  if (recommendedPathway !== 'anda_505j') {
    if (sameRouteAsRLD === false) {
      additionalStudies.push(
        'New route of administration requires safety evaluation (local tolerance, PK bridging)',
      );
    }
    if (sameDosageFormAsRLD === false) {
      additionalStudies.push(
        'Different dosage form may require relative bioavailability study and dissolution method development',
      );
    }
    const open = (['sameRouteAsRLD', 'sameDosageFormAsRLD'] as const).filter((k) => sameness[k] === undefined);
    if (open.length > 0) {
      additionalStudies.push(listed(open) + (open.length > 1 ? ' are' : ' is') + ' not stated: a new route or dosage form may require bridging or relative bioavailability studies');
    }
  }

  return {
    inputStates,
    ntiBasis: nti.basis,
    recommendedPathway,
    pathwayGuidance,
    suitabilityPetitionRequired,
    suitabilityPetitionReason,
    beStrategyRecommendation,
    orangeBookConsiderations,
    patentCertificationGuidance,
    additionalStudies,
    citations: [
      ...(pathwayGuidance ? pathwayGuidance.regulatoryCitations : []),
      '21 CFR 314.92-314.99 — ANDA filing requirements',
      '21 CFR 320.21-320.25 — BA/BE requirements for ANDAs',
      'FDA Orange Book — Approved Drug Products with Therapeutic Equivalence Evaluations',
      'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    ],
  };
}
