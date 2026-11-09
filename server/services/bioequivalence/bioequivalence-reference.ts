/**
 * Bioequivalence & Generic Drug Intelligence — reference tables
 * ==============================================================
 *
 * The BE study design registry of the bioequivalence knowledge engine. It moved
 * here unchanged from `bioequivalence-knowledge.ts` on 2026-11-09 (Rule 2 S5d),
 * when the engine's stated-input readers would have carried it past the
 * repository's 100,000-byte ceiling. The engine imports it; its types stay in
 * the engine.
 *
 * @module server/services/bioequivalence/bioequivalence-reference
 */

import type { BEStudyDesign, BEStudyDesignName } from './bioequivalence-knowledge';

export const BE_STUDY_DESIGNS: Record<BEStudyDesignName, BEStudyDesign> = {
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
