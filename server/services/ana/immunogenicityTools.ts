/**
 * Immunogenicity tools — exposes the deterministic knowledge engines in
 * `server/services/immunogenicity/immunogenicity-knowledge` to AnA as
 * first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   assess_immunogenicity_risk             — risk-based classification + mitigations + studies
 *   design_ada_assay_strategy              — multi-tiered ADA assay strategy + cut points
 *   classify_immunogenicity_clinical_impact — clinical consequence + labeling implications
 *   design_nab_assay                       — neutralizing antibody assay design
 *   plan_immunogenicity_sampling           — ADA/NAb sampling schedule
 *   assess_immunogenicity_comparability     — comparability for biosimilars / mfg changes
 *
 * @module server/services/ana/immunogenicityTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. assess_immunogenicity_risk
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_IMMUNOGENICITY_RISK: AnaTool = {
  name: 'assess_immunogenicity_risk',
  description:
    'Classify the immunogenicity risk of a therapeutic protein product using the FDA risk-based ' +
    'framework (FDA 2014 "Immunogenicity Assessment for Therapeutic Protein Products", Section IV) ' +
    'and the EMA risk-based immunogenicity programme (EMEA/CHMP/BMWP/14327/2006 Rev 1). Aggregates ' +
    'product-intrinsic factors (sequence foreignness, aggregation/particle burden, glycosylation, ' +
    'formulation, process-related impurities, endogenous-counterpart cross-reactivity) and ' +
    'patient/treatment factors (route, dose frequency/duration, immune status, concomitant ' +
    'immunosuppression) into an overall risk tier (low/moderate/high) with a normalized score, ' +
    'per-factor contributions, recommended mitigations, and the required immunogenicity studies. ' +
    'Use when the user asks how immunogenic a biologic is likely to be, which risk factors dominate, ' +
    'what to do about them, or what studies the program must include. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: [
          'human_recombinant',
          'humanized_mab',
          'chimeric_mab',
          'murine_mab',
          'fusion_protein',
          'pegylated_protein',
          'enzyme_replacement',
          'coagulation_factor',
          'non_human_protein',
          'peptide',
        ],
        description:
          'Therapeutic-protein product class. Drives the baseline sequence-foreignness contribution ' +
          '(e.g., murine_mab and non_human_protein are highest; human_recombinant is lowest).',
      },
      foreignness: {
        type: 'string',
        enum: ['fully_human', 'humanized', 'chimeric', 'non_human'],
        description:
          'Explicit sequence foreignness relative to the human proteome (optional). If omitted, it is ' +
          'inferred from productType.',
      },
      hasEndogenousCounterpart: {
        type: 'boolean',
        description:
          'Whether the product has a human endogenous counterpart with which ADA could cross-react.',
      },
      endogenousNonRedundant: {
        type: 'boolean',
        description:
          'Whether the endogenous counterpart is non-redundant / life-sustaining (e.g., EPO, ' +
          'thrombopoietin). Cross-reactive neutralization of such a protein is the most severe outcome.',
      },
      aggregationLevel: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'Aggregate / subvisible-particle burden. Aggregates present multivalent repetitive epitopes ' +
          'that can break B-cell tolerance — one of the strongest product-intrinsic risk factors.',
      },
      glycosylation: {
        type: 'string',
        enum: ['human_like', 'non_human_glycans', 'aglycosylated', 'not_applicable'],
        description:
          'Glycosylation status. non_human_glycans (e.g., galactose-α-1,3-galactose, NGNA) can trigger ' +
          'hypersensitivity via pre-existing antibodies.',
      },
      hasImmunogenicImpurities: {
        type: 'boolean',
        description:
          'Whether process-related impurities (host-cell protein, residual DNA, leachables) are present ' +
          'and may act as adjuvants.',
      },
      formulationRisk: {
        type: 'boolean',
        description:
          'Whether the formulation/container-closure is prone to particle formation or contains ' +
          'adjuvant-like components (e.g., polysorbate degradation, silicone-oil microdroplets).',
      },
      route: {
        type: 'string',
        enum: ['intravenous', 'subcutaneous', 'intramuscular', 'intravitreal', 'inhaled', 'topical', 'oral'],
        description:
          'Route of administration. Subcutaneous is the highest-risk route (dermal antigen-presenting ' +
          'cells); intravenous is comparatively tolerogenic.',
      },
      doseFrequency: {
        type: 'string',
        enum: ['single', 'intermittent', 'chronic_weekly', 'chronic_daily', 'continuous'],
        description:
          'Dosing frequency / duration. Chronic and frequent dosing increases cumulative antigen ' +
          'exposure and ADA development opportunity.',
      },
      immuneStatus: {
        type: 'string',
        enum: ['immunocompetent', 'immunosuppressed', 'autoimmune', 'mixed'],
        description:
          'Immune status of the intended population. Autoimmune patients may show higher ADA incidence; ' +
          'immunosuppressed patients generally show lower incidence (a mitigating factor).',
      },
      concomitantImmunosuppression: {
        type: 'boolean',
        description:
          'Whether the regimen includes concomitant immunosuppression (e.g., methotrexate with a TNF ' +
          'inhibitor), a recognized ADA-mitigation factor.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the product (optional). Echoed in the output for traceability.',
      },
    },
    required: ['productType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. design_ada_assay_strategy
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_ADA_ASSAY_STRATEGY: AnaTool = {
  name: 'design_ada_assay_strategy',
  description:
    'Specify a multi-tiered anti-drug antibody (ADA) assay strategy per the FDA 2019 guidance ' +
    '("Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for ' +
    'Anti-Drug Antibody Detection"): screening → confirmatory → titer, with neutralizing-antibody as ' +
    'a downstream tier. Returns the recommended detection platform (bridging ECL/ELISA, SPR) with ' +
    'rationale and alternatives, the tier-by-tier method and cut-point approach, cut-point statistics ' +
    '(screening ~5% false-positive ≈ mean + 1.645·SD; confirmatory ~1% ≈ mean + 2.33·SD), the drug-' +
    'tolerance strategy (acid-dissociation, bead extraction, trough sampling), the ≤ 100 ng/mL ' +
    'sensitivity target, validation parameters, and matrix-interference controls (USP <1106>, ' +
    'Shankar 2008). Use when the user needs to design or justify an ADA assay, set cut points, or ' +
    'meet sensitivity/drug-tolerance expectations. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: [
          'human_recombinant',
          'humanized_mab',
          'chimeric_mab',
          'murine_mab',
          'fusion_protein',
          'pegylated_protein',
          'enzyme_replacement',
          'coagulation_factor',
          'non_human_protein',
          'peptide',
        ],
        description: 'Modality of the therapeutic protein. Informs platform and interference considerations.',
      },
      expectedCirculatingDrug_ug_per_mL: {
        type: 'number',
        description:
          'Highest expected circulating drug concentration at the ADA sampling time, in µg/mL. ' +
          'Drives the required drug tolerance of the assay.',
      },
      highSolubleTarget: {
        type: 'boolean',
        description:
          'Whether a high soluble target / shed receptor is expected in the matrix that could interfere ' +
          'with a bridging assay (requires target-tolerance evaluation and possible acid-dissociation).',
      },
      isMonoclonalAntibody: {
        type: 'boolean',
        description:
          'Whether the product is a monoclonal antibody. If omitted, inferred from productType. ' +
          'Affects rheumatoid-factor / heterophilic-antibody interference handling.',
      },
      phase: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase2', 'phase3', 'post_marketing'],
        description: 'Development phase (optional). Drives the expected validation rigor.',
      },
      preferredPlatform: {
        type: 'string',
        enum: ['ELISA', 'ECL', 'SPR', 'RIA', 'bridging_ELISA', 'bridging_ECL'],
        description:
          'Preferred detection platform, if any. The engine validates suitability and notes strengths/' +
          'limitations; bridging ECL is the default screening recommendation.',
      },
      targetSensitivity_ng_per_mL: {
        type: 'number',
        description:
          'Target assay sensitivity in ng/mL of a positive-control antibody. Default 100 (FDA 2019 ' +
          'recommends ≤ 100 ng/mL).',
      },
      drugName: {
        type: 'string',
        description: 'Name of the product (optional). Echoed in the output.',
      },
    },
    required: ['productType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. classify_immunogenicity_clinical_impact
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_IMMUNOGENICITY_CLINICAL_IMPACT: AnaTool = {
  name: 'classify_immunogenicity_clinical_impact',
  description:
    'Classify the clinical consequence of an immune response across the four FDA 2014 consequence ' +
    'domains (Section II): pharmacokinetic (altered exposure), efficacy (neutralization / loss of ' +
    'response), safety (hypersensitivity / infusion reactions / anaphylaxis, including IgE-mediated ' +
    'Type I reactions), and cross-reactivity with a non-redundant endogenous protein (deficiency ' +
    'syndromes such as anti-EPO pure red cell aplasia). Returns an overall severity (none/low/moderate/' +
    'high/critical), per-domain severity and description, labeling implications by label section, and ' +
    'monitoring recommendations. Use when the user has observed or anticipated ADA effects and needs ' +
    'to grade clinical impact or derive labeling/monitoring consequences. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      pkImpact: {
        type: 'boolean',
        description: 'Whether ADA alter drug PK (typically increased clearance / lower trough).',
      },
      exposureReductionFraction: {
        type: 'number',
        description:
          'Magnitude of PK impact as a fraction reduction in exposure (0 to 1), if known. ' +
          '≥ 0.5 is graded high, ≥ 0.2 moderate.',
      },
      neutralizingEfficacyLoss: {
        type: 'boolean',
        description: 'Whether neutralizing ADA reduce or abolish pharmacological activity (loss of efficacy).',
      },
      hypersensitivity: {
        type: 'boolean',
        description: 'Whether hypersensitivity / infusion reactions are observed or expected.',
      },
      igeMediated: {
        type: 'boolean',
        description:
          'Whether reactions are IgE-mediated (Type I) — raises anaphylaxis risk (graded critical).',
      },
      endogenousCrossReactivity: {
        type: 'boolean',
        description: 'Whether ADA cross-react with an endogenous counterpart.',
      },
      endogenousLifeSustaining: {
        type: 'boolean',
        description:
          'Whether the endogenous counterpart is life-sustaining (e.g., EPO, TPO). ' +
          'Cross-reactive neutralization is graded critical.',
      },
      persistentADA: {
        type: 'boolean',
        description: 'Whether ADA are persistent (vs transient).',
      },
      highTiter: {
        type: 'boolean',
        description: 'Whether the ADA titer is high.',
      },
      lifeThreateningIndication: {
        type: 'boolean',
        description:
          'Whether the indication is life-threatening, which modulates the benefit-risk interpretation.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the product (optional). Echoed in the output.',
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. design_nab_assay
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_NAB_ASSAY: AnaTool = {
  name: 'design_nab_assay',
  description:
    'Design a neutralizing-antibody (NAb) assay per FDA 2019 (Section VI) and Shankar 2014. ' +
    'Determines whether a cell-based functional assay is required (preferred when the mechanism is ' +
    'mediated through a cell-surface receptor or when the endogenous counterpart is non-redundant) or ' +
    'whether a competitive ligand-binding (CLB) format is acceptable (soluble-target binding ' +
    'mechanisms, or when a cell-based assay is not technically feasible — with a documented rationale ' +
    'that the format reflects neutralization). Returns the recommended format, a cell-based-required ' +
    'flag, format rationale, fallback/complementary format with justification, validation parameters, ' +
    'drug-tolerance approach, and matrix-interference controls (USP <1106.1>). Use when the user needs ' +
    'to choose between cell-based and ligand-binding NAb formats or design NAb validation. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      mechanismClass: {
        type: 'string',
        enum: [
          'receptor_agonist',
          'receptor_antagonist',
          'ligand_neutralizer',
          'enzyme',
          'cell_depleting',
          'soluble_target_binder',
        ],
        description:
          'Mechanism class of the therapeutic. receptor_agonist/antagonist favor cell-based assays; ' +
          'soluble_target_binder favors competitive ligand-binding; enzyme favors an enzymatic-activity ' +
          'neutralization assay.',
      },
      actsThroughCellReceptor: {
        type: 'boolean',
        description:
          'Whether the drug acts via direct cell-surface receptor signaling. If omitted, inferred from ' +
          'mechanismClass. When true, a cell-based functional NAb assay is generally required.',
      },
      cellBasedFeasible: {
        type: 'boolean',
        description:
          'Whether a robust, reproducible cell-based bioassay is technically feasible (responsive cell ' +
          'line, acceptable variability). Default true. If false and cell-based is mechanistically ' +
          'preferred, a justified CLB alternative is recommended.',
      },
      endogenousNonRedundant: {
        type: 'boolean',
        description:
          'Whether the endogenous counterpart is non-redundant. Drives the need for a sensitive ' +
          'cell-based NAb assay regardless of feasibility considerations.',
      },
      expectedCirculatingDrug_ug_per_mL: {
        type: 'number',
        description:
          'Expected circulating drug at NAb sampling, in µg/mL. Sets the NAb drug-tolerance target.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the product (optional). Echoed in the output.',
      },
    },
    required: ['mechanismClass'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. plan_immunogenicity_sampling
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_IMMUNOGENICITY_SAMPLING: AnaTool = {
  name: 'plan_immunogenicity_sampling',
  description:
    'Build an ADA/NAb sampling schedule (baseline, on-treatment, end-of-treatment, follow-up) per ' +
    'FDA 2019 / FDA 2014 / EMA 2017. Scales the washout/trough basis and follow-up duration to the ' +
    'product half-life (washout ≈ 5 half-lives; follow-up extended to ≥ 8 half-lives for high-risk ' +
    'products and ≥ 12 half-lives for products with a non-redundant endogenous counterpart), sets ' +
    'on-treatment frequency from dosing frequency and treatment duration, samples at trough to ' +
    'minimize drug interference, and computes nominal draw count and total blood volume. Returns the ' +
    'timepoints with timing relative to dosing, sampling principles, and citations. Use when the user ' +
    'needs an immunogenicity sampling schedule, follow-up duration, or blood-volume estimate. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      halfLife_days: {
        type: 'number',
        description:
          'Terminal elimination half-life of the product in days. Sets the washout (5 half-lives) and ' +
          'follow-up duration.',
      },
      doseFrequency: {
        type: 'string',
        enum: ['single', 'intermittent', 'chronic_weekly', 'chronic_daily', 'continuous'],
        description: 'Dosing frequency. Drives the number and spacing of on-treatment draws.',
      },
      treatmentDuration_weeks: {
        type: 'number',
        description: 'Planned treatment duration in weeks (0 = single dose / acute). Default 12.',
      },
      route: {
        type: 'string',
        enum: ['intravenous', 'subcutaneous', 'intramuscular', 'intravitreal', 'inhaled', 'topical', 'oral'],
        description: 'Route of administration (optional). Provides context for onset/persistence.',
      },
      riskTier: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'Overall immunogenicity risk tier (from assess_immunogenicity_risk). High tier extends ' +
          'follow-up and adds an on-treatment draw.',
      },
      endogenousNonRedundant: {
        type: 'boolean',
        description:
          'Whether the product has a non-redundant endogenous counterpart. Extends follow-up to detect ' +
          'delayed/persistent cross-reactive responses.',
      },
      drawVolume_mL: {
        type: 'number',
        description: 'Blood volume per ADA draw in mL. Default 5 mL.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the product (optional). Echoed in the output.',
      },
    },
    required: ['halfLife_days'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_immunogenicity_comparability
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_IMMUNOGENICITY_COMPARABILITY: AnaTool = {
  name: 'assess_immunogenicity_comparability',
  description:
    'Assess immunogenicity comparability after a manufacturing/formulation change (ICH Q5E) or for a ' +
    'biosimilar (FDA 2015 "Scientific Considerations in Demonstrating Biosimilarity" / EMA 2017). ' +
    'Categorizes the change impact (minor/moderate/major) from immunogenicity-relevant triggers ' +
    '(aggregation, glycosylation/PTMs, formulation/container-closure, impurities, analytical ' +
    'comparability status, product risk tier), determines whether a comparative clinical ' +
    'immunogenicity study is warranted, and returns the study recommendation, analytical expectations, ' +
    'bridging-data needs (a single validated ADA assay applied to both products), triggered risk ' +
    'factors, and the decision rationale. Use when the user has a process/formulation change or a ' +
    'biosimilar and needs to know what immunogenicity comparability data are required. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        enum: ['biosimilar', 'manufacturing_change', 'formulation_change', 'site_transfer', 'scale_up'],
        description:
          'What triggered the comparability evaluation. biosimilar carries an inherent comparative ' +
          'immunogenicity expectation (totality-of-evidence).',
      },
      analyticalComparable: {
        type: 'boolean',
        description:
          'Whether analytical/structural comparability (primary structure, PTMs, charge/size variants, ' +
          'aggregates) has been demonstrated. If false, the change impact escalates.',
      },
      affectsAggregation: {
        type: 'boolean',
        description: 'Whether the change could alter aggregate / subvisible-particle levels.',
      },
      affectsGlycosylation: {
        type: 'boolean',
        description: 'Whether the change could alter glycosylation / post-translational modifications.',
      },
      affectsFormulation: {
        type: 'boolean',
        description:
          'Whether the change affects the formulation or container-closure system (leachables, ' +
          'silicone oil, particle formation).',
      },
      affectsImpurities: {
        type: 'boolean',
        description: 'Whether the change introduces new or different process-related impurities.',
      },
      productRiskTier: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'The product\'s intrinsic immunogenicity risk tier. High tier escalates the change impact.',
      },
      comparativeClinicalStudyPlanned: {
        type: 'boolean',
        description:
          'For biosimilars: whether a comparative clinical immunogenicity study is planned. Typically ' +
          'expected unless justified by a robust analytical / clinical-pharmacology package.',
      },
      drugName: {
        type: 'string',
        description: 'Name of the product (optional). Echoed in the output.',
      },
    },
    required: ['context'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Immunogenicity tools, spread into ALL_ANA_TOOLS. */
export const IMMUNOGENICITY_TOOLS: AnaTool[] = [
  ASSESS_IMMUNOGENICITY_RISK,
  DESIGN_ADA_ASSAY_STRATEGY,
  CLASSIFY_IMMUNOGENICITY_CLINICAL_IMPACT,
  DESIGN_NAB_ASSAY,
  PLAN_IMMUNOGENICITY_SAMPLING,
  ASSESS_IMMUNOGENICITY_COMPARABILITY,
];
