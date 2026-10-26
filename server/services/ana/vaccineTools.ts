/**
 * Vaccine Development tools — exposes the deterministic knowledge engines in
 * `server/services/vaccine/vaccine-knowledge` to AnA as first-class, selectable
 * tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   design_vaccine_cmc                — Platform-tailored CMC (DS/DP, adjuvant, potency, stability, ICH Q5)
 *   assess_correlate_of_protection    — Mechanistic vs non-mechanistic CoP, threshold, surrogate/bridging
 *   design_vaccine_clinical_program   — Phased program, immunogenicity endpoints, efficacy vs immunobridging
 *   assess_lot_consistency            — 3-lot equivalence design, GMT-ratio margins, sample size
 *   assess_vaccine_platform           — Platform assessment, prior-knowledge leverage, platform master file
 *   plan_vaccine_special_populations  — Pediatric/pregnancy/elderly/immunocompromised strategy
 *
 * @module server/services/ana/vaccineTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic stated-input worksheet for the project’s clinical and CMC workflows; no source records are read. ' +
  'Unanswered booleans stay not_stated and dependent conclusions stay not_assessed or null. ' +
  'Reference profiles do not establish product evidence, eligibility or accepted endpoints. Ask for missing facts. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation. Disclose any defaultsApplied as engine planning assumptions.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. design_vaccine_cmc
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_VACCINE_CMC: AnaTool = {
  name: 'design_vaccine_cmc',
  description:
    'Build a platform-tailored vaccine CMC development plan. Given the technology platform ' +
    '(mRNA, viral vector, protein subunit, live-attenuated, inactivated, conjugate, VLP, or DNA) ' +
    'and product attributes, returns the drug-substance and drug-product definitions, adjuvant ' +
    'strategy and constituent-material controls (21 CFR 610.15), the potency-assay paradigm and ' +
    'release tests (21 CFR 610.10/.12/.13/.14), the ICH Q5C stability program, reference-standard ' +
    'strategy, cell-substrate (ICH Q5D) and viral-safety (ICH Q5A(R2)) expectations, key CMC ' +
    'risks, and ICH Q5E comparability guidance. Use when the user needs to plan vaccine chemistry, ' +
    'manufacturing, and controls, choose a potency assay, design a stability program, or understand ' +
    'platform-specific CMC risks. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        description:
          'Vaccine technology platform. Accepts free text mapped to one of: mrna, viral_vector, ' +
          'protein_subunit, live_attenuated, inactivated, conjugate, vlp, dna ' +
          '(e.g. "mRNA-LNP", "adenovirus vector", "recombinant protein subunit", "glycoconjugate").',
      },
      antigenName: {
        type: 'string',
        description: 'Name of the target antigen or organism (optional, for context).',
      },
      indication: {
        type: 'string',
        description:
          'Target indication / pathogen (e.g. "seasonal influenza", "pneumococcal disease"). ' +
          'Influenza triggers SRID HA potency reference-standard guidance.',
      },
      multivalent: {
        type: 'boolean',
        description: 'Stated multivalent status. Omitted/null remains not_stated; no monovalent product is assumed.',
      },
      numberOfValences: {
        type: 'number',
        description: 'Stated positive integer valence count. No count is invented when multivalent is true; a count above 1 contradicts multivalent:false.',
      },
      adjuvanted: {
        type: 'boolean',
        description:
          'Stated added-adjuvant status. Omitted/null remains not_stated regardless of platform; no self-adjuvancy is inferred.',
      },
      adjuvantName: {
        type: 'string',
        description:
          'Specific adjuvant if known (e.g. "aluminium hydroxide", "AS01", "MF59", "CpG 1018"). ' +
          'If omitted, the actual adjuvant name stays unknown; platform examples remain references. A name contradicts adjuvanted:false.',
      },
      lyophilized: {
        type: 'boolean',
        description:
          'Whether the drug product is lyophilized (affects residual-moisture control and in-use ' +
          'stability). If omitted, presentation-dependent controls remain unassessed; cold-chain references do not fill the fact.',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'who', 'ich'],
        description: 'Regulatory framework to emphasize in citations (default "fda").',
      },
    },
    required: ['platform'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. assess_correlate_of_protection
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_CORRELATE_OF_PROTECTION: AnaTool = {
  name: 'assess_correlate_of_protection',
  description:
    'Classify the stated mechanism/protection flags for an immune correlate and show separate known-correlate references. ' +
    'Missing flags leave classification unassessed; reference entries do not supply the actual marker, threshold or efficacy linkage. ' +
    'Returns the stated marker/threshold, Prentice validation requirements and conditional bridging-use guidance. ' +
    'Surrogate validation, product eligibility and agency acceptance are not determined. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      pathogen: {
        type: 'string',
        description:
          'Target pathogen/disease (e.g. "influenza", "hepatitis B", "pneumococcal", "meningococcal"). ' +
          'Used to match against the built-in known-correlate registry.',
      },
      immuneMarker: {
        type: 'string',
        description:
          'Proposed immune marker (e.g. "HAI titer", "neutralizing antibody", "SBA", "OPA", "anti-HBs"). ' +
          'If omitted, the actual marker remains unknown; a pathogen reference does not supply it.',
      },
      proposedThreshold: {
        type: 'string',
        description: 'Proposed protective threshold, free text (e.g. "HAI >= 1:40", "10 mIU/mL").',
      },
      protectionMechanismKnown: {
        type: 'boolean',
        description:
          'Whether the marker is the causal protective effector (mechanistic). Combined with ' +
          'markerDirectlyProtective to classify the stated CoP. If either flag is omitted, classification stays not_assessed.',
      },
      markerDirectlyProtective: {
        type: 'boolean',
        description:
          'Whether a defined threshold of the marker predicts protection in an individual (absolute) ' +
          'rather than only on a population continuum (relative).',
      },
      hasEfficacyDataLinkingMarker: {
        type: 'boolean',
        description:
          'Whether an efficacy dataset links the marker to clinical protection (supports Prentice ' +
          'criteria). If omitted, stays not_stated; a known-correlate match is reference information, not product efficacy evidence.',
      },
      intendedUse: {
        type: 'string',
        enum: ['accelerated_approval', 'immunobridging', 'lot_release', 'strain_change'],
        description: 'Stated intended use; if omitted, no intended-use assessment is selected. Returned guidance is conditional reference information.',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'who', 'ich'],
        description: 'Regulatory framework to emphasize in citations (default "fda").',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. design_vaccine_clinical_program
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_VACCINE_CLINICAL_PROGRAM: AnaTool = {
  name: 'design_vaccine_clinical_program',
  description:
    'Lay out a phased vaccine clinical development program (Phase 1-3). Returns the efficacy-vs-' +
    'immunobridging decision based on whether a validated correlate exists and whether a field-' +
    'efficacy trial is feasible, the reference efficacy success criterion (FDA COVID-19 paradigm: ' +
    'point estimate >= 50% with the CI lower bound > 30%), per-phase objectives and sample sizes, ' +
    'immunogenicity endpoint definitions (seroconversion, seroresponse, seroprotection, GMT/GMC, ' +
    'GMR), the safety database size and follow-up duration, the >=3 consecutive-lot consistency ' +
    'reference expectation, and unassessed accelerated-approval eligibility with conditional guidance. Use when the user ' +
    'needs to plan a vaccine clinical program, define immunogenicity endpoints, decide between an ' +
    'efficacy trial and immunobridging, or size the safety database. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      pathogen: {
        type: 'string',
        description: 'Target pathogen/disease (optional, for context).',
      },
      platform: {
        type: 'string',
        description:
          'Vaccine technology platform (mrna, viral_vector, protein_subunit, live_attenuated, ' +
          'inactivated, conjugate, vlp, dna; free text accepted).',
      },
      hasEstablishedCorrelate: {
        type: 'boolean',
        description:
          'Stated validated-correlate availability. Omitted/null remains not_stated; it cannot select a pathway or endpoint.',
      },
      efficacyFeasible: {
        type: 'boolean',
        description:
          'Stated field-efficacy feasibility (incidence, ethics, logistics). Omitted/null remains not_stated. Explicit false must not select an efficacy Phase 3.',
      },
      targetPopulation: {
        type: 'string',
        enum: ['adults', 'pediatric', 'elderly', 'maternal', 'all_ages'],
        description: 'Primary target population (optional).',
      },
      noveltyIsHigh: {
        type: 'boolean',
        description:
          'Whether the platform/product is high-novelty (triggers extended safety follow-up and AESI monitoring recommendations).',
      },
      diseaseSeriousness: {
        type: 'string',
        enum: ['routine', 'serious', 'pandemic'],
        description:
          'Stated disease seriousness. If omitted, seriousness-dependent safety sizing remains unassessed. Reference ranges do not establish a project sample size.',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'who', 'ich'],
        description: 'Regulatory framework to emphasize in citations (default "fda").',
      },
    },
    required: ['platform'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_lot_consistency
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_LOT_CONSISTENCY: AnaTool = {
  name: 'assess_lot_consistency',
  description:
    'Design a manufacturing lot-to-lot consistency (equivalence) study. Returns the equivalence ' +
    'design across the (default 3) consecutive lots, the equivalence margin on the GMT ratio ' +
    '(default 0.5-2.0, i.e. two-fold), the full set of pairwise two-one-sided-test (TOST) ' +
    'comparisons, a closed-form per-group and total sample-size estimate (from the assumed log-' +
    'titer SD, target power, and margin), the potency-consistency expectation (21 CFR 610.10), the ' +
    'immunogenicity readout, the acceptance logic (every pairwise CI within the margin), and the ' +
    'stated assumptions. Use when the user needs to plan a 3-lot consistency study, choose ' +
    'equivalence margins, or estimate the sample size for demonstrating lot consistency. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      numberOfLots: {
        type: 'number',
        description:
          'Planned number of consecutive lots (integer 2–5; illustrative default 3, disclosed in defaultsApplied). Invalid values are refused. ' +
          'The conventional pre-licensure expectation is >= 3.',
      },
      immunogenicityMarker: {
        type: 'string',
        description:
          'Primary functional immunogenicity marker for the readout (e.g. "neutralizing antibody GMT", ' +
          '"SBA", "OPA", "HAI"). If omitted, a generic functional marker is described.',
      },
      expectedGMT: {
        type: 'number',
        description: 'Expected geometric mean titer (optional context; does not change the equivalence sizing under a true ratio of 1).',
      },
      assumedSdLog: {
        type: 'number',
        description:
          'Assumed within-group standard deviation of natural-log-transformed titers (default 0.75). Drives sample size.',
      },
      equivalenceMarginLower: {
        type: 'number',
        description: 'Lower equivalence margin on the GMT ratio (default 0.5).',
      },
      equivalenceMarginUpper: {
        type: 'number',
        description: 'Upper ratio margin above 1 (illustrative default 2). This approximation supports reciprocal log-symmetric bounds only; lower must equal 1 / upper.',
      },
      targetPower: {
        type: 'number',
        description: 'Target planning power per comparison (supported 0.5–0.99; illustrative default 0.90). Invalid values are refused, not clamped.',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'who', 'ich'],
        description: 'Regulatory framework to emphasize in citations (default "fda").',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_vaccine_platform
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_VACCINE_PLATFORM: AnaTool = {
  name: 'assess_vaccine_platform',
  description:
    'Assess a vaccine technology platform and how to leverage prior platform knowledge. Returns the ' +
    'platform development implications, the strength of platform prior knowledge (high/moderate/' +
    'emerging), specific prior-knowledge leverage points (licensed-product reference, same-backbone/' +
    'new-antigen abbreviated package, Vaccine/Platform Master File eligibility), nonclinical and CMC ' +
    'leverage (WHO TRS 927, ICH Q5E), population suitability with replicating-platform cautions, and ' +
    'the key platform risks. Covers mRNA, viral vector, protein subunit, live-attenuated, ' +
    'inactivated, conjugate, VLP, and DNA. Use when the user is choosing a platform, asking how much ' +
    'prior knowledge transfers to a new antigen, or whether a platform master file applies. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        description:
          'Vaccine technology platform (mrna, viral_vector, protein_subunit, live_attenuated, ' +
          'inactivated, conjugate, vlp, dna; free text accepted).',
      },
      priorLicensedProductOnPlatform: {
        type: 'boolean',
        description:
          'Stated prior licensing status; omitted/null stays not_stated. The existence and reuse of accessible supporting evidence still need assessment.',
      },
      sameBackboneDifferentAntigen: {
        type: 'boolean',
        description:
          'Whether this product uses the same platform backbone with a new antigen/transgene/sequence ' +
          '(may support evidence-based reuse). Omitted/null stays not_stated and cannot select a full or abbreviated product package.',
      },
      intendedPopulation: {
        type: 'string',
        enum: ['general', 'immunocompromised', 'pregnant', 'pediatric', 'elderly'],
        description:
          'Stated intended population. If omitted, suitability remains unassessed. Viral-vector replication properties are not determined by this broad platform category.',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'who', 'ich'],
        description: 'Regulatory framework to emphasize in citations (default "fda").',
      },
    },
    required: ['platform'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. plan_vaccine_special_populations
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_VACCINE_SPECIAL_POPULATIONS: AnaTool = {
  name: 'plan_vaccine_special_populations',
  description:
    'Build a special-population vaccine development strategy. For pediatric, pregnancy/maternal, ' +
    'elderly, or immunocompromised populations (or all), returns the per-population strategy, dosing ' +
    'approach, endpoint, and safety considerations, plus the age de-escalation approach (PREA / ' +
    '21 CFR 601.27 — start in older children and step down to infants), the maternal-immunization ' +
    'approach (DART first, gestational-age window, transplacental transfer endpoint), the bridging ' +
    'approach, and platform/population safety cautions (e.g. live-attenuated contraindicated in ' +
    'immunocompromised/pregnant populations). Use when the user needs a pediatric, maternal, ' +
    'elderly, or immunocompromised vaccine strategy, age de-escalation plan, or dosing approach for ' +
    'a special population. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      population: {
        type: 'string',
        enum: ['pediatric', 'pregnancy', 'elderly', 'immunocompromised', 'all'],
        description: 'Target special population (use "all" to generate strategies for every population).',
      },
      platform: {
        type: 'string',
        description:
          'Vaccine technology platform (mrna, viral_vector, protein_subunit, live_attenuated, ' +
          'inactivated, conjugate, vlp, dna; free text accepted). Drives replicating-platform cautions. ' +
          'If omitted, platform-specific safety/dosing remains unassessed; no protein-subunit platform is assumed.',
      },
      adultDataAvailable: {
        type: 'boolean',
        description:
          'Stated adult/adolescent source-data availability. Omitted/null stays not_stated; pediatric bridging requires actual adequate source evidence.',
      },
      hasCorrelate: {
        type: 'boolean',
        description:
          'Stated validated-correlate availability. Omitted/null stays not_stated; no population bridge or correlate-based endpoint is selected from an unanswered flag.',
      },
      diseaseSeriousness: {
        type: 'string',
        enum: ['routine', 'serious', 'pandemic'],
        description: 'Seriousness of the target disease (optional context).',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'who', 'ich'],
        description: 'Regulatory framework to emphasize in citations (default "fda").',
      },
    },
    required: ['population'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Vaccine development tools, spread into ALL_ANA_TOOLS. */
export const VACCINE_TOOLS: AnaTool[] = [
  DESIGN_VACCINE_CMC,
  ASSESS_CORRELATE_OF_PROTECTION,
  DESIGN_VACCINE_CLINICAL_PROGRAM,
  ASSESS_LOT_CONSISTENCY,
  ASSESS_VACCINE_PLATFORM,
  PLAN_VACCINE_SPECIAL_POPULATIONS,
];
