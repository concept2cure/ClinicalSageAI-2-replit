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
 * @module server/services/bioequivalence/bioequivalence-knowledge
 */

/* f2 and every eligibility condition around it live in services/cmc/
   dissolution-comparison, which the CMC dissolution register calls too. */
import { compareDissolutionProfiles } from '../cmc/dissolution-comparison';

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
      'BCS Class II is NOT eligible for biowaiver under FDA guidance',
      'ICH M9 allows biowaiver for BCS Class IIa (weak acids) under specific conditions',
      'EMA may grant biowaiver for BCS Class IIa when dose/solubility ratio is <= 250 mL at pH 6.8',
      'ICH M9 Class IIa condition: pH-dependent solubility with high solubility at pH 6.8',
    ],
    regulatoryImplications: [
      'In vivo BE study generally required',
      'Dissolution is the rate-limiting step for absorption',
      'Formulation differences can significantly affect bioavailability',
      'Product-specific guidances often require additional dissolution testing or in vivo studies',
      'BCS Class IIa (weak acids): ICH M9 permits biowaiver if very rapidly dissolving at pH 6.8',
      'BCS Class IIb (weak bases, neutral compounds): in vivo BE required',
    ],
    fdaGuidance: [
      'FDA does not grant biowaivers for BCS Class II (as of 2024 guidance)',
      'Product-specific guidances (PSGs) may specify dissolution method and media',
      '21 CFR 320.22 — BCS Class II not listed for biowaiver eligibility',
    ],
    emaGuidance: [
      'EMA/CHMP/QWP/428693/2017 — Limited biowaiver for Class IIa weak acids',
      'Requires demonstration of pH-dependent solubility profile',
    ],
    ichM9Notes: [
      'ICH M9 Step 4 (2019): BCS Class IIa eligible if dose/solubility ratio <= 250 mL at pH 6.8',
      'IIa: weak acids with high solubility at intestinal pH; must be very rapidly dissolving',
      'IIb: not eligible; solubility-limited across physiological pH range',
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
      'ICH M9: rapidly dissolving (>= 85% in 30 min) with f2 >= 50 acceptable',
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
      'ICH M9: BCS Class III eligible; very rapidly dissolving preferred, rapidly dissolving with f2 >= 50 acceptable',
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

const BE_STUDY_DESIGNS: Record<BEStudyDesignName, BEStudyDesign> = {
  crossover_2x2: {
    designName: 'crossover_2x2',
    displayName: '2x2 Crossover (Standard)',
    description:
      'Two-sequence, two-period crossover design. Each subject receives both test (T) and reference (R) in randomized order. The gold standard for average BE.',
    sequences: 2,
    periods: 2,
    designNotation: 'TR|RT',
    whenToUse: [
      'Standard design for most immediate-release oral formulations',
      'Drug has moderate intra-subject variability (CVw <= 30%)',
      'Adequate washout period can be established (>= 5 half-lives)',
      'Drug is not an endogenous substance or has a stable baseline',
    ],
    advantages: [
      'Each subject serves as own control — reduces inter-subject variability',
      'Most efficient design for drugs with low-to-moderate variability',
      'Widely accepted by all regulatory agencies globally',
      'Simpler logistics than replicate designs',
    ],
    disadvantages: [
      'Cannot estimate within-subject variability for reference product',
      'May require large sample sizes for highly variable drugs (CVw > 30%)',
      'Period effects and carryover effects are confounded',
      'Not suitable for drugs with very long half-lives (washout impractical)',
    ],
    acceptanceCriteria: [
      {
        parameter: 'AUC0-t',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'AUC0-inf',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
    ],
    regulatoryBasis: [
      '21 CFR 320.26 — General design requirements for BA/BE studies',
      'FDA Guidance: Statistical Approaches to Establishing Bioequivalence (2001)',
      'EMA/CHMP/QWP/428693/2017 — Guideline on the Investigation of Bioequivalence',
      'ICH M13A (draft) — Bioequivalence for IR Solid Oral Dosage Forms',
    ],
    minSubjectsGuidance:
      'Minimum 12 evaluable subjects per EMA; FDA recommends sample size based on power calculation (typically 24-36 for CVw ~25%)',
    statisticalModel:
      'ANOVA on ln-transformed data: Sequence + Subject(Sequence) + Period + Formulation. 90% CI for geometric mean ratio T/R.',
    washoutGuidance:
      'Minimum 5 elimination half-lives between periods. For drugs with active metabolites, consider metabolite half-life.',
  },
  crossover_3x3: {
    designName: 'crossover_3x3',
    displayName: '3x3 Crossover (Williams)',
    description:
      'Three-sequence, three-period Williams design. Typically used when comparing three formulations (e.g., T1, T2, R) or for higher-order crossover efficiency.',
    sequences: 3,
    periods: 3,
    designNotation: 'T1-R-T2 | R-T2-T1 | T2-T1-R (Williams balanced)',
    whenToUse: [
      'Comparing two test formulations against a single reference',
      'Dose-proportionality assessment across three dose strengths',
      'Fasted/fed/reference three-way comparison',
    ],
    advantages: [
      'Allows simultaneous comparison of multiple formulations',
      'Each pair of treatments appears equally often in each period (Williams balanced)',
      'Efficient use of subjects for multi-formulation comparisons',
    ],
    disadvantages: [
      'Longer study duration (three periods with washouts)',
      'Higher dropout risk due to extended duration',
      'More complex logistics and statistical analysis',
    ],
    acceptanceCriteria: [
      {
        parameter: 'AUC0-t',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
    ],
    regulatoryBasis: [
      'FDA Guidance: Statistical Approaches to Establishing Bioequivalence (2001)',
      'EMA/CHMP/QWP/428693/2017 Section 4.1.8 — Higher-order crossover designs',
    ],
    minSubjectsGuidance:
      'Sample size calculated per comparison; minimum 12 evaluable per EMA guidance.',
    statisticalModel:
      'Mixed-effects ANOVA on ln-transformed PK parameters: Sequence + Subject(Sequence) + Period + Treatment. Pairwise 90% CIs.',
    washoutGuidance:
      'Minimum 5 elimination half-lives between each period.',
  },
  crossover_4x4: {
    designName: 'crossover_4x4',
    displayName: '4x4 Crossover (Williams)',
    description:
      'Four-sequence, four-period Williams design for comparing four formulations or four treatments simultaneously.',
    sequences: 4,
    periods: 4,
    designNotation: 'ABDC | BCAD | CDBA | DACB (Williams balanced)',
    whenToUse: [
      'Comparing three test formulations against one reference',
      'Complex multi-strength dose-proportionality studies',
      'Rarely used for standard BE — typically for formulation development',
    ],
    advantages: [
      'Maximum information per subject for multi-formulation comparisons',
      'Balanced for first-order carryover effects',
    ],
    disadvantages: [
      'Very long study duration — high dropout risk',
      'Complex logistics and significant subject burden',
      'Rarely required by regulatory agencies for standard ANDA filings',
    ],
    acceptanceCriteria: [
      {
        parameter: 'AUC0-t',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
    ],
    regulatoryBasis: [
      'FDA Guidance: Statistical Approaches to Establishing Bioequivalence (2001)',
      'EMA/CHMP/QWP/428693/2017 Section 4.1.8',
    ],
    minSubjectsGuidance:
      'Minimum 12 evaluable subjects; power calculation drives sample size.',
    statisticalModel:
      'Mixed-effects ANOVA on ln-transformed data with Williams-design fixed effects.',
    washoutGuidance:
      'Minimum 5 elimination half-lives between each of the four periods.',
  },
  replicate_3_period: {
    designName: 'replicate_3_period',
    displayName: 'Three-Period Replicate Crossover',
    description:
      'Three-period, three-sequence replicate design (TRR|RTR|RRT or TRT|RTR). The reference is administered twice to estimate within-subject variability for reference-scaled average bioequivalence (RSABE).',
    sequences: 3,
    periods: 3,
    designNotation: 'TRR | RTR | RRT',
    whenToUse: [
      'Highly variable drugs (CVw > 30%) where scaled average BE is planned',
      'When reference-scaled average bioequivalence (RSABE) is the regulatory approach',
      'FDA recommends for HVDs when using the RSABE approach',
    ],
    advantages: [
      'Enables estimation of within-subject variance for reference product (sWR)',
      'Permits reference-scaled average BE approach for HVDs',
      'Fewer periods than 4-period replicate — lower dropout risk',
    ],
    disadvantages: [
      'Unbalanced for test product (T given once, R given twice)',
      'Cannot estimate within-subject variance for test product',
      'More complex analysis than standard 2x2 crossover',
    ],
    acceptanceCriteria: [
      {
        parameter: 'AUC0-t (unscaled)',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax (unscaled)',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax (RSABE, if sWR >= 0.294)',
        lowerBound: -Infinity,
        upperBound: Infinity,
        confidenceLevel: 95,
        scalingApplied: true,
        scalingDetails:
          'Upper bound of 95% CI for (muT - muR)^2 - theta * sWR^2 <= 0, where theta = (ln 1.25)^2 / sW0^2 and sW0 = 0.25. Point estimate constraint: 80.00-125.00%.',
      },
    ],
    regulatoryBasis: [
      'FDA Guidance: Statistical Approaches to Establishing Bioequivalence (2001)',
      'FDA Draft Guidance: Bioequivalence Studies with Pharmacokinetic Endpoints for Drugs Submitted Under an ANDA (2021)',
      'FDA Progesterone capsules PSG — pioneered RSABE approach',
      '21 CFR 320.23(b) — In vivo BE requirement for ANDAs',
    ],
    minSubjectsGuidance:
      'Typically 24-48 subjects; power depends on expected CVw and true T/R ratio.',
    statisticalModel:
      'Mixed-effects model with unstructured covariance: Sequence + Subject(Sequence) + Period + Treatment. Estimates sWR from replicated reference arms.',
    washoutGuidance:
      'Minimum 5 elimination half-lives between each period; identical to 2x2 design.',
  },
  replicate_4_period: {
    designName: 'replicate_4_period',
    displayName: 'Four-Period Full Replicate Crossover',
    description:
      'Four-period, two-sequence replicate design (TRTR|RTRT). Both test and reference are administered twice, enabling estimation of within-subject variability for both products. The most information-rich replicate design.',
    sequences: 2,
    periods: 4,
    designNotation: 'TRTR | RTRT',
    whenToUse: [
      'Highly variable drugs (CVw > 30%) requiring RSABE or scaled average BE',
      'When within-subject variability estimates for BOTH T and R are needed',
      'Individual bioequivalence (IBE) assessments (historical — largely superseded)',
      'EMA and FDA both accept for reference-scaled approaches',
    ],
    advantages: [
      'Estimates within-subject variability for both test and reference products',
      'Most powerful replicate design — highest statistical efficiency',
      'Supports RSABE, SABE, and IBE analyses',
      'Balanced design — equal exposure to T and R',
    ],
    disadvantages: [
      'Four periods with washouts — longest study duration',
      'Highest dropout risk among replicate designs',
      'Greater subject burden and study cost',
    ],
    acceptanceCriteria: [
      {
        parameter: 'AUC0-t (unscaled)',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax (RSABE, if sWR >= 0.294)',
        lowerBound: -Infinity,
        upperBound: Infinity,
        confidenceLevel: 95,
        scalingApplied: true,
        scalingDetails:
          'Scaled criterion: upper 95% CI for (muT - muR)^2 - theta * sWR^2 <= 0, theta = (ln 1.25)^2 / 0.25^2. Point estimate constraint: 80.00-125.00%. If sWR < 0.294, use unscaled 80.00-125.00% criterion.',
      },
    ],
    regulatoryBasis: [
      'FDA Guidance: Statistical Approaches to Establishing Bioequivalence (2001)',
      'EMA/CHMP/QWP/428693/2017 Section 4.1.10 — Highly variable drug products',
      'EMA uses expanded limits approach: 69.84-143.19% if CVw > 30%, capped at CVw = 50%',
      'FDA uses RSABE (reference-scaled average BE) with sWR switching criterion',
    ],
    minSubjectsGuidance:
      'Typically 24-36 subjects; lower than 2x2 for same power because each subject contributes twice.',
    statisticalModel:
      'Mixed-effects model: Sequence + Subject(Sequence) + Period(Sequence) + Treatment. Separate within-subject variances for T and R estimable.',
    washoutGuidance:
      'Minimum 5 elimination half-lives between each of the four periods.',
  },
  partial_replicate: {
    designName: 'partial_replicate',
    displayName: 'Partial Replicate (3-Period, 3-Sequence)',
    description:
      'TRR|RTR|RRT partial replicate design where reference is replicated but test is not. A compromise between 2x2 simplicity and full-replicate power for scaled average BE.',
    sequences: 3,
    periods: 3,
    designNotation: 'TRR | RTR | RRT',
    whenToUse: [
      'Highly variable drugs where RSABE is needed but 4-period design is impractical',
      'When only reference within-subject variability is needed for scaling',
      'Preferred by EMA as an alternative to full replicate for HVDs',
    ],
    advantages: [
      'Fewer periods than full replicate (3 vs. 4)',
      'Estimates reference within-subject variability (sWR)',
      'Lower dropout risk than 4-period design',
    ],
    disadvantages: [
      'Cannot estimate test within-subject variability',
      'Unbalanced exposure to T and R',
      'Slightly less efficient than full replicate for RSABE',
    ],
    acceptanceCriteria: [
      {
        parameter: 'AUC0-t (unscaled)',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax (scaled, EMA approach if CVw > 30%)',
        lowerBound: -Infinity,
        upperBound: Infinity,
        confidenceLevel: 90,
        scalingApplied: true,
        scalingDetails:
          'EMA expanded acceptance: [L, U] where L = 100 * exp(-k * sWR), U = 100 * exp(k * sWR), k = 0.760. Limits expand from 80-125% up to max 69.84-143.19% at CVw >= 50%.',
      },
    ],
    regulatoryBasis: [
      'EMA/CHMP/QWP/428693/2017 Section 4.1.10',
      'EMA CPMP/EWP/QWP/1401/98 Rev. 1',
      'FDA Draft Guidance: BE Studies with PK Endpoints for Drugs Under ANDA (2021)',
    ],
    minSubjectsGuidance:
      'Typically 24-48 subjects depending on expected CVw.',
    statisticalModel:
      'Mixed-effects model with replicate R data: Sequence + Subject(Sequence) + Period + Treatment. sWR estimated from within-subject R variance.',
    washoutGuidance:
      'Minimum 5 elimination half-lives between each period.',
  },
  parallel: {
    designName: 'parallel',
    displayName: 'Parallel Group Design',
    description:
      'Two independent groups receive either test or reference. Each subject receives only one formulation. Used when crossover designs are impractical.',
    sequences: 2,
    periods: 1,
    designNotation: 'T || R',
    whenToUse: [
      'Drugs with very long half-lives (e.g., > 2 weeks) where washout is impractical',
      'Drugs with irreversible pharmacodynamic effects',
      'Studies in patients (not healthy volunteers) where repeated dosing is unethical',
      'Steady-state studies for modified-release formulations with long half-lives',
    ],
    advantages: [
      'No carryover or period effects',
      'Shorter study duration per subject (single period)',
      'Suitable for drugs with very long half-lives',
    ],
    disadvantages: [
      'No within-subject comparison — much higher variability',
      'Requires substantially larger sample sizes (2-4x crossover)',
      'Less powerful than crossover designs for same sample size',
      'Inter-subject variability is not controlled',
    ],
    acceptanceCriteria: [
      {
        parameter: 'AUC0-t',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
      {
        parameter: 'Cmax',
        lowerBound: 80.00,
        upperBound: 125.00,
        confidenceLevel: 90,
        scalingApplied: false,
      },
    ],
    regulatoryBasis: [
      '21 CFR 320.26(b) — Parallel design acceptable when crossover impractical',
      'FDA Guidance: Statistical Approaches to Establishing Bioequivalence (2001) — Section V',
      'EMA/CHMP/QWP/428693/2017 Section 4.1.3 — Parallel design',
    ],
    minSubjectsGuidance:
      'Sample size typically 2-4 times that of crossover design. Minimum 12 per group per EMA.',
    statisticalModel:
      'Two-sample t-test on ln-transformed PK parameters. ANOVA: Treatment. 90% CI for geometric mean ratio T/R.',
    washoutGuidance:
      'Not applicable — single-period design.',
  },
};

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
      '- BCS-based biowaiver is applicable (Class I, III, or IIa per ICH M9)',
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
  biowaiverEligible: boolean;
  isNTI: boolean;
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
  const isNTI = drugName
    ? NTI_DRUGS.some(n => n.toLowerCase() === drugName.toLowerCase())
    : false;

  const biowaiverRationale: string[] = [];
  let biowaiverEligible = classData.biowaiverEligible;

  if (isNTI) {
    biowaiverEligible = false;
    biowaiverRationale.push(
      'Drug "' + (drugName ?? '') + '" is classified as a Narrow Therapeutic Index (NTI) drug. ' +
        'BCS-based biowaivers are NOT permitted for NTI drugs per FDA and ICH M9 guidance.',
    );
  }

  const irForms = ['tablet', 'capsule', 'ir tablet', 'ir capsule', 'immediate-release tablet', 'immediate-release capsule'];
  if (dosageForm && !irForms.some(f => dosageForm.toLowerCase().includes(f))) {
    biowaiverEligible = false;
    biowaiverRationale.push(
      'Dosage form "' + dosageForm + '" is not an immediate-release solid oral dosage form. ' +
        'BCS-based biowaivers apply only to IR solid oral dosage forms (tablets, capsules).',
    );
  }

  if (biowaiverEligible) {
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

  const requiredDissolutionConditions = biowaiverEligible
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
    isNTI,
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
  recommendedDesign: BEStudyDesign;
  alternativeDesigns: BEStudyDesignName[];
  acceptanceCriteria: BEAcceptanceCriteria[];
  isHighlyVariable: boolean;
  isNTI: boolean;
  scaledApproachApplicable: boolean;
  estimatedSampleSize: { perGroup: number; total: number; basis: string };
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
  const {
    withinSubjectCV,
    halfLife_hours,
    drugName,
    expectedGMR = 100,
    targetPower = 0.80,
    dosageForm,
    fedStudyRequired = false,
    formulationsToCompare = 2,
  } = params;

  let isNTI = params.isNTI ?? false;
  if (!isNTI && drugName) {
    isNTI = NTI_DRUGS.some(n => n.toLowerCase() === drugName.toLowerCase());
  }

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
  const zBeta = targetPower >= 0.90 ? 1.282 : targetPower >= 0.80 ? 0.842 : 0.524;

  let nPerGroup: number;
  if (theta - delta <= 0) {
    nPerGroup = 9999; // GMR outside acceptance range; cannot achieve BE
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
  if (designName.includes('replicate')) {
    nPerGroup = Math.max(Math.ceil(nPerGroup * 0.75), 6);
  }

  const seqCount = design.sequences;
  const total = nPerGroup * seqCount;

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
  if (dosageForm && (dosageForm.toLowerCase().includes('modified') || dosageForm.toLowerCase().includes('extended'))) {
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
      basis: 'Closed-form estimate: CVw=' + withinSubjectCV + '%, GMR=' + expectedGMR + '%, power=' + (targetPower * 100).toFixed(0) + '%, alpha=0.05 (two one-sided tests). Actual sample size should be confirmed via simulation.',
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
  f2: number;
  f2Pass: boolean;
  f1: number;
  f1Pass: boolean;
  interpretation: string;
  f2Formula: string;
  f1Formula: string;
  conditions: string[];
  timePointsUsed: number;
  warnings: string[];
  regulatoryInterpretation: string[];
  citations: string[];
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
      f2: Number.NaN,
      f2Pass: false,
      f1: Number.NaN,
      f1Pass: false,
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
  /** Is the drug substance a weak acid? (relevant for BCS Class IIa). */
  isWeakAcid?: boolean;
  /** Dose/solubility ratio at pH 6.8 in mL (relevant for BCS Class IIa). */
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

export interface BiowaiverResult {
  eligible: boolean;
  decision: 'BIOWAIVER_GRANTED' | 'BIOWAIVER_CONDITIONAL' | 'BIOWAIVER_DENIED';
  rationale: string[];
  requiredDissolutionConditions: string[];
  outstandingRequirements: string[];
  regulatoryFramework: string;
  citations: string[];
}

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
  const {
    bcsClass,
    drugName,
    dosageForm,
    isWeakAcid = false,
    doseSolubilityRatioAtPH6_8_mL,
    veryRapidlyDissolving = false,
    rapidlyDissolving = false,
    referenceVeryRapidlyDissolving = false,
    f2,
    excipientsQualitativelySame,
    excipientsQuantitativelySimilar,
    framework = 'ich_m9',
  } = params;

  let isNTI = params.isNTI ?? false;
  if (!isNTI && drugName) {
    isNTI = NTI_DRUGS.some(n => n.toLowerCase() === drugName.toLowerCase());
  }

  const rationale: string[] = [];
  const outstandingRequirements: string[] = [];
  const requiredDissolutionConditions: string[] = [];

  // Gate 1: NTI check
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
  );
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

      if (veryRapidlyDissolving) {
        rationale.push('Test product is very rapidly dissolving (>= 85% in 15 min): f2 comparison not required.');
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
      rationale.push('BCS Class II (low solubility, high permeability): generally NOT eligible for biowaiver.');

      // ICH M9 Class IIa exception
      if (framework === 'ich_m9' || framework === 'ema') {
        if (isWeakAcid && doseSolubilityRatioAtPH6_8_mL !== undefined && doseSolubilityRatioAtPH6_8_mL <= 250) {
          rationale.push(
            'BCS Class IIa (weak acid): dose/solubility ratio at pH 6.8 = ' + doseSolubilityRatioAtPH6_8_mL + ' mL (<= 250 mL).',
            'ICH M9 permits biowaiver for BCS Class IIa weak acids with high solubility at pH 6.8.',
          );
          requiredDissolutionConditions.push(
            'Very rapidly dissolving (>= 85% in 15 min) at pH 6.8 phosphate buffer',
            'Test in 0.1N HCl (pH 1.2), acetate buffer (pH 4.5), phosphate buffer (pH 6.8)',
          );
          if (veryRapidlyDissolving) {
            return {
              eligible: true,
              decision: 'BIOWAIVER_GRANTED',
              rationale,
              requiredDissolutionConditions,
              outstandingRequirements: [],
              regulatoryFramework: framework.toUpperCase(),
              citations: [
                'ICH M9 Step 4 (2019) — BCS Class IIa weak acid biowaiver',
                'EMA/CHMP/QWP/428693/2017',
              ],
            };
          }
          outstandingRequirements.push('Demonstrate very rapidly dissolving (>= 85% in 15 min) at pH 6.8');
          return {
            eligible: false,
            decision: 'BIOWAIVER_CONDITIONAL',
            rationale: [...rationale, 'Very rapid dissolution at pH 6.8 required for IIa biowaiver.'],
            requiredDissolutionConditions,
            outstandingRequirements,
            regulatoryFramework: framework.toUpperCase(),
            citations: ['ICH M9 Step 4 (2019) — BCS Class IIa'],
          };
        }
      }

      return {
        eligible: false,
        decision: 'BIOWAIVER_DENIED',
        rationale: [
          ...rationale,
          'FDA does not grant BCS-based biowaivers for Class II drugs.',
          'ICH M9 allows biowaiver only for Class IIa (weak acids with high solubility at pH 6.8).',
          'An in vivo BE study is required.',
        ],
        requiredDissolutionConditions: [],
        outstandingRequirements: ['Conduct in vivo bioequivalence study'],
        regulatoryFramework: framework.toUpperCase(),
        citations: [
          'FDA Guidance: Waiver of In Vivo BA/BE Studies for IR SODF Based on BCS (2017)',
          'ICH M9 Step 4 (2019) — BCS Class II/IIb: biowaiver not applicable',
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

      // Excipient check
      const excipientOK =
        excipientsQualitativelySame !== false && excipientsQuantitativelySimilar !== false;
      if (!excipientOK) {
        rationale.push(
          'BCS Class III requires excipients to be qualitatively the same and quantitatively similar (+/- 10%) to the RLD.',
        );
        if (excipientsQualitativelySame === false) {
          outstandingRequirements.push('Excipients must be qualitatively the same as the RLD');
        }
        if (excipientsQuantitativelySimilar === false) {
          outstandingRequirements.push('Excipient quantities must be within +/- 10% of the RLD');
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

      // ICH M9 also accepts rapidly dissolving with f2 >= 50 for Class III
      if (framework === 'ich_m9' && rapidlyDissolving && f2 !== undefined && f2 >= 50 && excipientOK) {
        rationale.push(
          'ICH M9: BCS Class III rapidly dissolving (>= 85% in 30 min) with f2 >= 50 is acceptable.',
        );
        return {
          eligible: true,
          decision: 'BIOWAIVER_GRANTED',
          rationale,
          requiredDissolutionConditions,
          outstandingRequirements: [],
          regulatoryFramework: framework.toUpperCase(),
          citations: [
            'ICH M9 Step 4 (2019) — BCS Class III rapidly dissolving with f2 >= 50',
          ],
        };
      }

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
  /** Proposed route of administration. */
  routeOfAdministration: string;
  /** Proposed strength(s). */
  strengths: string[];
  /** Is the product the same dosage form as the RLD? */
  sameDosageFormAsRLD: boolean;
  /** Is the product the same route as the RLD? */
  sameRouteAsRLD: boolean;
  /** Is the product the same strength as the RLD? */
  sameStrengthAsRLD: boolean;
  /** Is this a combination product? */
  isCombinationProduct?: boolean;
  /** BCS class, if known. */
  bcsClass?: BCSClass;
  /** Is the drug an NTI drug? */
  isNTI?: boolean;
}

export interface ANDAGuidanceResult {
  recommendedPathway: RegulatoryPathway;
  pathwayGuidance: PathwayGuidance;
  suitabilityPetitionRequired: boolean;
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
  const {
    activeIngredient,
    dosageForm,
    routeOfAdministration,
    strengths,
    sameDosageFormAsRLD,
    sameRouteAsRLD,
    sameStrengthAsRLD,
    isCombinationProduct = false,
    bcsClass,
    isNTI = false,
  } = params;

  // Suppress unused-variable lint for values used only in output strings
  void routeOfAdministration;

  let recommendedPathway: RegulatoryPathway;
  let suitabilityPetitionRequired = false;
  let suitabilityPetitionReason: string | undefined;

  // ── Pathway determination ──
  const isPharmEquivalent = sameDosageFormAsRLD && sameRouteAsRLD && sameStrengthAsRLD;
  const hasMinorDifference =
    (!sameDosageFormAsRLD || !sameStrengthAsRLD) && sameRouteAsRLD;

  if (isPharmEquivalent) {
    recommendedPathway = 'anda_505j';
  } else if (hasMinorDifference) {
    // Suitability petition may allow ANDA despite dosage form or strength difference
    recommendedPathway = 'suitability_petition';
    suitabilityPetitionRequired = true;
    const reasons: string[] = [];
    if (!sameDosageFormAsRLD) reasons.push('different dosage form (proposed: ' + dosageForm + ')');
    if (!sameStrengthAsRLD) reasons.push('different strength(s) (proposed: ' + strengths.join(', ') + ')');
    suitabilityPetitionReason =
      'Suitability petition required because the proposed product has ' + reasons.join(' and ') + ' compared to the RLD. ' +
      'FDA must determine that the change does not require new safety/efficacy data.';
  } else {
    // Different route — cannot be ANDA, must be 505(b)(2)
    recommendedPathway = '505b2';
  }

  const pathwayGuidance = PATHWAY_REGISTRY[recommendedPathway];

  // ── BE strategy ──
  const beStrategyRecommendation: string[] = [];

  if (recommendedPathway === 'anda_505j' || recommendedPathway === 'suitability_petition') {
    if (bcsClass === 'I' || bcsClass === 'III') {
      beStrategyRecommendation.push(
        'BCS Class ' + bcsClass + ': evaluate biowaiver eligibility (in vitro dissolution comparison may suffice).',
        'Conduct dissolution testing in three media (pH 1.2, 4.5, 6.8) per FDA BCS Guidance.',
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
    } else if (lowerForm.includes('extended') || lowerForm.includes('modified') || lowerForm.includes('controlled')) {
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
    if (!sameRouteAsRLD) {
      additionalStudies.push(
        'New route of administration requires safety evaluation (local tolerance, PK bridging)',
      );
    }
    if (!sameDosageFormAsRLD) {
      additionalStudies.push(
        'Different dosage form may require relative bioavailability study and dissolution method development',
      );
    }
  }

  return {
    recommendedPathway,
    pathwayGuidance,
    suitabilityPetitionRequired,
    suitabilityPetitionReason,
    beStrategyRecommendation,
    orangeBookConsiderations,
    patentCertificationGuidance,
    additionalStudies,
    citations: [
      ...pathwayGuidance.regulatoryCitations,
      '21 CFR 314.92-314.99 — ANDA filing requirements',
      '21 CFR 320.21-320.25 — BA/BE requirements for ANDAs',
      'FDA Orange Book — Approved Drug Products with Therapeutic Equivalence Evaluations',
      'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    ],
  };
}
