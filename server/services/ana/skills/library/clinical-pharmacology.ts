/**
 * Clinical pharmacology skills: PK characterization and dose selection, drug
 * interactions (ICH M12), QT assessment (ICH E14/S7B), special populations,
 * bioequivalence and biowaivers, model-informed development and the
 * immunogenicity of therapeutic proteins.
 *
 * @module server/services/ana/skills/library/clinical-pharmacology
 */

import { skill, type LibrarySkillSource } from '../types.js';

export const CLINICAL_PHARMACOLOGY_SKILLS: LibrarySkillSource[] = [
  skill({
    key: 'clinical-pharmacology',
    name: 'Clinical pharmacology',
    description:
      'Planning and interpreting the clinical pharmacology of a drug or biologic: the first-in-human starting dose, PK characterization (dose proportionality, accumulation), dose selection and the studies that complete the package, routed to the platform pharmacology engines.',
    disciplines: ['clinical-pharmacology', 'clinical'],
    useCases: ['strategy', 'study-design', 'analysis', 'review'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'clinical pharmacology',
      'clin pharm',
      'pharmacokinetics',
      'pharmacokinetic',
      'pk study',
      'pk parameters',
      'pk profile',
      'dose proportionality',
      'accumulation ratio',
      'steady state',
      'first-in-human dose',
      'fih dose',
      'starting dose',
      'mrsd',
      'mabel',
      'dose selection',
      'single ascending dose',
      'multiple ascending dose',
      'mass balance',
      'module 2.7.2',
    ],
    tools: [
      'compute_fih_dose',
      'select_dose',
      'characterize_pk',
      'advise_midd',
      'search_drug_labels',
      'lookup_ich_guideline',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E4' },
      { kind: 'ich', id: 'M3(R2)' },
      { kind: 'ich', id: 'M10' },
    ],
    instructions: `
## When this applies
Questions about a product's pharmacokinetics and dose across development: the first-in-human starting dose, characterizing exposure, choosing doses, and what the clinical pharmacology package must contain. The sub-skills hold drug interactions, QT, special populations, bioequivalence, modelling and immunogenicity.

## Method
1. Establish the modality, route, development stage, the nonclinical and clinical PK data in hand (analytes, matrices, units) and the question asked. Every PK figure in an answer comes from the program's data or an engine.
2. First-in-human starting dose: \`compute_fih_dose\` derives the maximum recommended starting dose from the species NOAELs (body-surface scaling and a safety factor) and, for higher-risk molecules, the minimal anticipated biological effect level, and says which one limits. \`select_dose\` gives the wider framework from first-in-human through dose optimization. Never calculate a human equivalent dose or a starting dose by hand. The nonclinical support needed for each trial's duration follows ICH M3(R2) (biologics and oncology have their own S guidelines).
3. PK characterization: \`characterize_pk\` judges dose proportionality by the power model and computes accumulation and time to steady state; report the slope, its confidence interval, the verdict and the ratio as returned. PK data rest on a bioanalytical method validated for its purpose (ICH M10).
4. Dose selection: dose-response information supports the doses taken into confirmatory trials (ICH E4). Use \`select_dose\` for the framework; exposure-response modelling follows the model-informed development skill, and oncology dosage the oncology dose optimization skill.
5. Plan the package from the product's properties, not by default: human ADME and mass balance, bioavailability and food effect, drug interactions, renal and hepatic impairment, QT assessment, population PK and exposure-response, and immunogenicity for therapeutic proteins. \`advise_midd\` identifies which of these questions modelling can answer and which studies it can inform or replace.
6. Labeling: the findings feed section 12, Clinical Pharmacology, of the PLR format, and the dosing and specific-populations sections (21 CFR 201.57). Compare with precedent in the class with \`search_drug_labels\`.
7. Confirm ICH content with \`lookup_ich_guideline\`. Name FDA's clinical pharmacology guidances by topic and confirm them with \`lookup_fda_guidance\`; engines cite guidance by year, and some have since been revised, so confirm before citing a version.

## Pitfalls reviewers raise
- A starting dose justified from one species without addressing the most sensitive or most pharmacologically relevant one.
- Dose proportionality claimed from overlapping means rather than a power-model analysis.
- Units or analytes that differ between the nonclinical, clinical and summary documents.
- Major metabolites not characterized in humans.

## Before answering
- Every dose, exposure, ratio and verdict is an engine output or the program's data, with units and the species or population it refers to.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- The starting dose and the doses carried forward are the sponsor's decisions, reviewed by the agency and the IRB/IEC; the safety factor is the sponsor's choice to justify.
- AnA does not sign or submit dose justifications.
`,
  }),

  skill({
    key: 'clinical-pharmacology.drug-interactions',
    name: 'Drug-drug interactions (ICH M12)',
    description:
      'Planning and interpreting a drug interaction program under ICH M12: in vitro enzyme and transporter studies, reaction phenotyping, static and PBPK predictions, clinical studies with index drugs, pharmacogenomic phenotypes and the labeling that follows.',
    disciplines: ['clinical-pharmacology'],
    useCases: ['study-design', 'analysis', 'strategy', 'drafting'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'drug interaction',
      'drug interactions',
      'drug-drug interaction',
      'drug-drug interactions',
      'ddi',
      'ddi study',
      'ddi risk',
      'ich m12',
      'cyp inhibition',
      'cyp induction',
      'time-dependent inhibition',
      'transporter inhibition',
      'index substrate',
      'index inhibitor',
      'perpetrator',
      'victim drug',
      'reaction phenotyping',
      'fraction metabolized',
      'poor metabolizer',
      'cyp3a4',
      'cyp2d6',
      'pharmacogenomic',
    ],
    tools: [
      'lookup_ich_guideline',
      'design_reaction_phenotyping',
      'assess_ddi_risk',
      'classify_ddi_risk',
      'evaluate_pbpk_model',
      'classify_cyp_phenotype',
      'search_drug_labels',
      'lookup_fda_guidance',
    ],
    references: [{ kind: 'ich', id: 'M12' }],
    instructions: `
## When this applies
Deciding whether and how a drug's interaction potential must be studied, as a victim (its exposure changed by other drugs) or as a perpetrator (it changes the exposure of others), and turning the results into protocol restrictions and labeling.

## Method
1. Establish the elimination pathways and transporters known so far, the co-medications expected in the target population, clinical concentrations (total and unbound, with units), active or major metabolites, and the therapeutic index. ICH M12 is the harmonised framework; confirm its content with \`lookup_ich_guideline\` before citing it.
2. Victim potential: \`design_reaction_phenotyping\` plans in vitro phenotyping with orthogonal approaches to estimate the fraction metabolized by each enzyme, and flags clinically meaningful pathways from supplied values.
3. Perpetrator potential: \`assess_ddi_risk\` applies the basic static models for reversible inhibition, time-dependent inhibition, induction and transporter inhibition. Each mechanism is evaluated only on inputs supplied, and concentrations and constants must share units. \`classify_ddi_risk\` classifies risk per pathway and lists the clinical studies it suggests. Report R-values, classifications and recommendations as returned.
4. Refinement: where a mechanistic static or PBPK model is used to predict an interaction or to support not running a clinical study, \`evaluate_pbpk_model\` assesses whether the model is qualified for that use.
5. Clinical studies: dedicated studies with index perpetrators or substrates, studies with the co-medications expected in practice, or evaluation nested in later trials with population PK. Engine recommendations are inputs to the sponsor's plan, not the plan.
6. Pharmacogenomics: when a polymorphic enzyme matters, \`classify_cyp_phenotype\` returns the phenotype for a genotype or activity score; plan genotyping in trials where it changes exposure.
7. Protocol: restrictions on concomitant medications follow the in vitro and clinical findings available at the time, and are revisited as data arrive.
8. Labeling: results feed the Drug Interactions section (PLR section 7) and the Clinical Pharmacology section; compare with precedent in the class with \`search_drug_labels\`.
9. The engines cite FDA's in vitro and clinical DDI guidances. Confirm FDA's current position on M12 and on those guidances with \`lookup_fda_guidance\` before citing a specific document.

## Pitfalls reviewers raise
- Total instead of unbound concentrations in a static model, or mismatched units.
- Time-dependent inhibition or induction not tested.
- Major or active metabolites not evaluated.
- A PBPK model used to avoid a clinical study without verification for that mechanism.
- Labeling advice that no clinical result or verified model supports.

## Before answering
- Every ratio, fraction and classification is an engine output, with the inputs and units it used.
- Victim and perpetrator conclusions are stated separately, per pathway.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether a clinical DDI study can be omitted, and the labeling that results, are agreed between the sponsor and the agency.
- The study plan is the sponsor's decision.
`,
  }),

  skill({
    key: 'clinical-pharmacology.qt-assessment',
    name: 'QT/QTc assessment (ICH E14 and S7B)',
    description:
      'Planning and interpreting the integrated QT/QTc risk assessment: hERG and other nonclinical data under ICH S7B, concentration-QTc modelling from early clinical studies, when a dedicated QT study is still needed, and how the conclusion is reported.',
    disciplines: ['clinical-pharmacology', 'safety'],
    useCases: ['study-design', 'analysis', 'strategy'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'qt prolongation',
      'qtc',
      'qtc prolongation',
      'qt assessment',
      'qt/qtc',
      'thorough qt',
      'thorough qt study',
      'tqt',
      'tqt waiver',
      'concentration-qtc',
      'c-qtc',
      'exposure-qtc',
      'ich e14',
      'e14/s7b',
      's7b',
      'herg',
      'proarrhythmic risk',
      'torsade de pointes',
    ],
    tools: ['assess_qtc_risk', 'assess_concentration_qtc', 'lookup_ich_guideline', 'lookup_fda_guidance'],
    references: [
      { kind: 'ich', id: 'E14(R3)' },
      { kind: 'ich', id: 'S7A/S7B' },
    ],
    instructions: `
## When this applies
Deciding how a new drug's effect on the QT/QTc interval will be assessed, whether early clinical data can replace a dedicated QT study, and interpreting nonclinical and clinical QT results together.

## Method
1. Establish the inputs: hERG IC50 and how the assay was run, in vivo nonclinical QT data and other ion-channel data (ICH S7B); the therapeutic exposure and the highest clinically relevant exposure, including what raises it (interactions, organ impairment, food); ECG quality and timing in the single and multiple ascending dose studies; effects on heart rate; metabolites; and whether the drug can be given to healthy volunteers.
2. Integrated risk: \`assess_qtc_risk\` combines the hERG margin, clinical QTc data where available and multichannel data into a risk category and a recommended nonclinical and clinical strategy. Report it as returned.
3. Concentration-QTc: from the sponsor's fitted model, \`assess_concentration_qtc\` computes the predicted effect at the high clinical exposure, the upper confidence bound and whether the regulatory threshold is excluded, and flags inadequate exposure coverage or an uninformative interval. Report the bound and verdict verbatim; never judge the QT question by eye. The model itself (pre-specified, with heart-rate correction and hysteresis examined) is the sponsor's pharmacometric work.
4. Exposure coverage: the conclusion holds only as far as the studied exposures cover the high clinical exposure scenario. When they do not, say what is missing.
5. The ICH E14/S7B questions and answers describe how an integrated nonclinical and clinical assessment can support the conclusion, including where high exposures cannot be studied clinically. Confirm the conditions with \`lookup_ich_guideline\` before relying on them.
6. When the concentration-QTc approach cannot support a conclusion, a dedicated QT study is planned under ICH E14, including how assay sensitivity is shown.
7. For drugs studied only in patients (many oncology drugs), plan ECG collection matched in time to PK sampling in patient studies, with a concentration-QTc analysis, following the strategy from \`assess_qtc_risk\`.
8. The conclusion is reported consistently in the study report, the clinical pharmacology summary and the labeling. FDA's E14 questions-and-answers guidance is named by topic and confirmed with \`lookup_fda_guidance\`.

## Pitfalls reviewers raise
- High clinical exposure not covered by the studied doses.
- A heart-rate correction that does not suit a drug that changes heart rate.
- Delay between concentration and QTc effect (hysteresis) not examined.
- ECGs not matched in time to PK samples.
- Metabolites with their own QT effect ignored.

## Before answering
- Margins, predicted effects, bounds and categories are engine outputs, quoted as returned with the inputs used.
- The exposure the conclusion covers is stated.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether a dedicated QT study can be waived is agreed with the agency.
- The modelling choices and the clinical interpretation belong to the sponsor's pharmacometric and cardiac safety experts.
`,
  }),

  skill({
    key: 'clinical-pharmacology.special-populations',
    name: 'Special populations: organ impairment, food and older adults',
    description:
      'Deciding and designing studies of the factors that change exposure: renal and hepatic impairment, food effect, older adults under ICH E7, ethnic factors under ICH E5(R1), and how results become dosing recommendations.',
    disciplines: ['clinical-pharmacology'],
    useCases: ['study-design', 'analysis', 'drafting'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'renal impairment',
      'hepatic impairment',
      'organ impairment',
      'renal impairment study',
      'hepatic impairment study',
      'child-pugh',
      'dialysis',
      'hemodialysis',
      'food effect',
      'food-effect study',
      'fed and fasted',
      'high-fat meal',
      'geriatric',
      'older adults',
      'elderly patients',
      'ich e7',
      'ethnic factors',
      'e5(r1)',
      'bridging study',
      'intrinsic factors',
      'extrinsic factors',
      'special populations',
    ],
    tools: [
      'design_organ_impairment_study',
      'design_popk_study',
      'assess_food_effect',
      'select_dose',
      'lookup_ich_guideline',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E7' },
      { kind: 'ich', id: 'E5(R1)' },
      { kind: 'ich', id: 'E17' },
    ],
    instructions: `
## When this applies
Questions about how organ function, food, age or ethnicity change a drug's exposure or response, which studies are needed to find out, and how the results become dosing recommendations. Pediatric development follows the pediatrics skill.

## Method
1. Establish the elimination pathways (fraction excreted unchanged in urine, hepatic metabolism, biliary excretion), protein binding, therapeutic index, half-life and dialyzability; for food, the BCS class, dosage form and formulation; and the ages, organ function and regions of the population expected to use the drug.
2. Renal and hepatic impairment: \`design_organ_impairment_study\` returns a full or reduced design, the impairment groups, sampling, the dialysis question and the dose-adjustment framework. For highly bound drugs, unbound concentrations matter. Population PK across patient trials can complement or, in some cases, support these questions; \`design_popk_study\` plans the covariate analysis.
3. Food: \`assess_food_effect\` predicts the risk and designs the study. The study uses the formulation intended for marketing, and the result decides the administration instructions.
4. Older adults: ICH E7 expects older patients, including the oldest, in trials in numbers that allow differences to be detected, with PK in older adults from a dedicated study or population PK.
5. Ethnic factors: ICH E5(R1) frames whether data from one region apply to another and when a bridging study is needed; ICH E17 covers designing one multi-regional trial. Confirm their content with \`lookup_ich_guideline\`.
6. Dosing recommendations: \`select_dose\` gives the special-population adjustment framework. A recommendation rests on the observed exposure change and the exposure-response relationship, not on class assumptions.
7. Labeling: results feed Dosage and Administration, Use in Specific Populations and Clinical Pharmacology in the PLR format.
8. FDA's guidances on PK in renal impairment, PK in hepatic impairment and food-effect studies are named by topic and confirmed with \`lookup_fda_guidance\`; the engines cite specific years, some since revised, so confirm before citing a version.

## Pitfalls reviewers raise
- No renal or hepatic impairment data for a drug whose elimination depends on that organ.
- A labeling recommendation for a degree of impairment that was not studied.
- A food-effect study run on a formulation other than the one to be marketed.
- Older adults underrepresented relative to the population that will use the drug.
- Total concentrations only, for a highly protein-bound drug.

## Before answering
- Study designs, group definitions and dose adjustments are engine outputs or program data, quoted as returned.
- Each recommendation names the population and degree of impairment it covers.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether a dedicated study can be replaced by population PK or modelling is agreed with the agency.
- Dosing recommendations and labeling are the sponsor's proposal and the agency's decision.
`,
  }),

  skill({
    key: 'clinical-pharmacology.bioequivalence',
    name: 'Bioequivalence and biowaivers',
    description:
      'Designing and judging bioequivalence: study design and acceptance criteria, BCS-based biowaivers under ICH M9, ICH M13A for immediate-release oral products, dissolution profile similarity, and the generic pathway questions an ANDA raises.',
    disciplines: ['clinical-pharmacology', 'regulatory-strategy'],
    useCases: ['study-design', 'analysis', 'strategy', 'lifecycle-change'],
    segments: ['pharma'],
    triggers: [
      'bioequivalence',
      'bioequivalence study',
      'be study',
      'be studies',
      'bioavailability',
      'relative bioavailability',
      'biowaiver',
      'biowaivers',
      'bcs',
      'bcs class',
      'ich m9',
      'ich m13a',
      'm13a',
      'dissolution similarity',
      'dissolution profile',
      'f2 similarity',
      'f2 factor',
      'anda',
      'reference listed drug',
      'highly variable drug',
      'narrow therapeutic index',
      'replicate design',
      'part 320',
    ],
    tools: [
      'guidance_for_anda',
      'classify_bcs',
      'global_ri_bcs_biowaiver',
      'assess_biowaiver',
      'design_be_study',
      'global_ri_bioequivalence_criteria',
      'compare_recorded_dissolution',
      'assess_dissolution_similarity',
      'lookup_ich_guideline',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'M9' },
      { kind: 'ich', id: 'M13A' },
      { kind: 'ich', id: 'M13B' },
      { kind: 'ich', id: 'M10' },
      { kind: 'standard', id: 'cfr_314' },
    ],
    instructions: `
## When this applies
Showing that two formulations deliver the same exposure: a generic against its reference product, a clinical-trial formulation against the commercial one, or a product after a manufacturing change; and deciding when an in vivo study can be waived.

## Method
1. Establish the purpose (ANDA, 505(b)(2), bridging formulations within an NDA program, a post-approval change), the dosage form and release type, the strengths, the reference product for each region, whether the drug has a narrow therapeutic index, its within-subject variability and half-life, and the solubility and permeability data.
2. Generic pathway: \`guidance_for_anda\` decides between an ANDA under 505(j), a 505(b)(2) application or a suitability petition, and sets the bioequivalence strategy. FDA's product-specific guidances for generic drugs recommend the approach for many products; name them by topic and confirm with \`lookup_fda_guidance\`.
3. Biowaiver: \`classify_bcs\` assigns the BCS class from the data; \`global_ri_bcs_biowaiver\` returns ICH M9 eligibility for that class; \`assess_biowaiver\` makes the full decision, including dissolution, excipient sameness and narrow-therapeutic-index exclusions. US waiver criteria sit in 21 CFR 320.22.
4. In vivo study: \`design_be_study\` recommends the design (crossover, replicate, parallel), conditions (fasting, fed) and a sample size; \`global_ri_bioequivalence_criteria\` returns the region's acceptance criteria and its approach to highly variable drugs. ICH M13A harmonises the design for immediate-release solid oral products; ICH M13B covers waivers for additional strengths. Confirm their content and status with \`lookup_ich_guideline\`.
5. Dissolution similarity: when the profiles are on file in the CMC dissolution register, use \`compare_recorded_dissolution\`; otherwise \`assess_dissolution_similarity\` with the profiles supplied. Both refuse when eligibility conditions fail; relay the refusal and never re-run with typed-in numbers to get past it.
6. Pre-specify analytes, PK parameters, handling of outliers and of subjects who vomit or drop out. Concentrations come from a bioanalytical method validated under ICH M10.
7. Regions differ on the reference product, highly variable drug approaches and narrow-therapeutic-index criteria. Name the region for every criterion.

## Pitfalls reviewers raise
- A reference product that is not the one the region requires.
- Scaled criteria for a highly variable drug claimed where the region does not accept them, or without the replicate design they need.
- An f2 computed outside its eligibility conditions.
- A fed study omitted where one is expected.
- Subjects excluded after the data were seen.

## Before answering
- Classes, criteria, sample sizes, f2 values and waiver decisions are engine outputs, quoted as returned with the region.
- Refusals and missing inputs are relayed, not worked around.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Bioequivalence and therapeutic equivalence are the agency's determinations; patent certifications and exclusivity are legal questions for the sponsor's counsel.
- The choice of pathway is the sponsor's.
`,
  }),

  skill({
    key: 'clinical-pharmacology.model-informed-development',
    name: 'Model-informed drug development',
    description:
      'Using quantitative models to answer development questions: population PK, PBPK, exposure-response and dose justification, with the question, context of use and model credibility made explicit, and the regulatory interactions that support them.',
    disciplines: ['clinical-pharmacology', 'biostatistics'],
    useCases: ['analysis', 'study-design', 'strategy', 'agency-interaction'],
    segments: ['pharma', 'biotech'],
    triggers: [
      'model-informed drug development',
      'midd',
      'population pk',
      'population pharmacokinetics',
      'poppk',
      'pop pk',
      'pbpk',
      'pbpk model',
      'pbpk modeling',
      'exposure-response',
      'exposure response',
      'e-r analysis',
      'pk/pd modeling',
      'pkpd',
      'quantitative systems pharmacology',
      'qsp',
      'pharmacometrics',
      'covariate analysis',
      'clinical trial simulation',
      'dose justification',
    ],
    tools: [
      'advise_midd',
      'design_popk_study',
      'evaluate_pbpk_model',
      'analyze_exposure_response',
      'select_exposure_response_dose',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'ich', id: 'E4' },
      { kind: 'ich', id: 'E11A' },
      { kind: 'ich', id: 'M12' },
    ],
    instructions: `
## When this applies
A program using or planning models to inform a decision: dose selection, an interaction or special-population question, pediatric extrapolation, trial design, or whether a study can be informed or replaced by modelling.

## Method
1. Establish the question of interest, the decision the model informs, the context of use and the data available. The evidence a model needs grows with its influence on the decision and the consequence of a wrong decision. These ideas frame ICH's general principles for model-informed drug development (M15) and FDA's MIDD program; M15 is not in the platform's ICH corpus, so confirm its current step before citing it.
2. Strategy: \`advise_midd\` maps the question to a modelling approach (population PK, PBPK, exposure-response, disease progression, trial simulation) and to the studies that modelling can inform, optimize or replace.
3. Population PK: \`design_popk_study\` plans sampling, covariates, model evaluation and reporting for the modality and population.
4. PBPK: \`evaluate_pbpk_model\` assesses the model's qualification for the specific application (interactions under ICH M12, pediatric, organ impairment, food), separating system parameters from drug parameters and checking verification against observed data.
5. Exposure-response: \`analyze_exposure_response\` sets the analysis framework for efficacy and safety; \`select_exposure_response_dose\` computes the dose the relationship supports with the platform's deterministic engine. Never estimate a dose by hand (ICH E4).
6. Pediatric use: model-based extrapolation is central to ICH E11A; the pediatrics skill holds the method.
7. Pre-specify the modelling analysis plan before the data it uses are unblinded or final, and report development, diagnostics, sensitivity and limits.
8. Regulatory interaction: FDA's MIDD paired meeting program and EMA scientific advice or qualification are the routes to agreement. Name FDA's population PK, PBPK and exposure-response guidances by topic and confirm them with \`lookup_fda_guidance\`.

## Pitfalls reviewers raise
- Exposure-response confounded by disease severity, as when sicker patients clear a monoclonal antibody faster.
- Predictions outside the range of the covariates or exposures studied.
- A PBPK model applied to a population or mechanism it was not verified for.
- A model used beyond the context of use it was built for.

## Before answering
- The question of interest and context of use are stated before any model result.
- Every predicted exposure, dose or effect is an engine output or the sponsor's model output, with its assumptions.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- Whether a model is credible enough for its use, and whether it can replace a study, is agreed with the agency.
- Model building and validation are the sponsor's pharmacometricians' work.
`,
  }),

  skill({
    key: 'clinical-pharmacology.immunogenicity',
    name: 'Immunogenicity of therapeutic proteins',
    description:
      'Assessing and managing the immunogenicity of a therapeutic protein or other biologic: risk assessment, the tiered anti-drug antibody and neutralizing antibody assay strategy, sampling, incidence and clinical impact, comparability after changes and labeling.',
    disciplines: ['clinical-pharmacology', 'safety'],
    useCases: ['study-design', 'analysis', 'strategy', 'lifecycle-change'],
    segments: ['biotech'],
    triggers: [
      'immunogenicity risk',
      'immunogenicity risk assessment',
      'immunogenicity assessment',
      'immunogenicity testing',
      'anti-drug antibody',
      'anti-drug antibodies',
      'ada',
      'ada assay',
      'ada incidence',
      'ada sampling',
      'treatment-emergent ada',
      'nab assay',
      'neutralizing antibody assay',
      'neutralizing antibodies',
      'assay cut point',
      'drug tolerance',
      'immunogenicity sampling',
      'immunogenicity comparability',
    ],
    tools: [
      'assess_immunogenicity_risk',
      'design_ada_assay_strategy',
      'design_nab_assay',
      'plan_immunogenicity_sampling',
      'assess_immunogenicity',
      'classify_immunogenicity_clinical_impact',
      'assess_immunogenicity_comparability',
      'lookup_fda_guidance',
    ],
    references: [
      { kind: 'standard', id: 'phs_351' },
      { kind: 'ich', id: 'Q5E' },
      { kind: 'ich', id: 'S6(R1)' },
    ],
    instructions: `
## When this applies
A therapeutic protein or other biologic program planning or interpreting immunogenicity: how likely and how consequential an immune response is, which assays and samples are needed, what the results mean clinically, and what a manufacturing change or biosimilar comparison requires. Vaccine immune responses as endpoints follow the vaccines skill.

## Method
1. Establish the product factors (type, foreignness, endogenous counterpart and whether it is non-redundant, aggregation, glycosylation, impurities, formulation) and the patient and treatment factors (route, frequency, duration, immune status, concomitant immunosuppression). Pass only stated factors; an unstated one is listed as not assessed. Nonclinical antibody responses do not predict human immunogenicity (ICH S6(R1)), though they help interpret animal data.
2. Risk: \`assess_immunogenicity_risk\` returns per-factor contributions and a tier, which stays undetermined until all factors are stated. The weights and tier are a platform heuristic, not an FDA or EMA scale; say so when reporting them.
3. Assays: \`design_ada_assay_strategy\` sets the tiered approach (screening, confirmatory, titer, with neutralizing activity downstream), cut points, sensitivity and drug tolerance; \`design_nab_assay\` chooses a cell-based or competitive ligand-binding format from the mechanism. These assays are validated for their own purpose (cut points, sensitivity, drug tolerance); they are not PK assays.
4. Sampling: \`plan_immunogenicity_sampling\` builds the schedule (baseline, on-treatment at trough, end of treatment, follow-up after washout) from stated half-life, risk tier, dosing and duration; when it refuses for missing inputs, relay what is missing.
5. Results: \`assess_immunogenicity\` computes ADA and neutralizing antibody incidence with confidence intervals per arm and the between-arm comparison. Define treatment-emergent and treatment-boosted responses in the analysis plan, and analyse PK, efficacy and safety by ADA status.
6. Clinical impact: \`classify_immunogenicity_clinical_impact\` grades consequences for exposure, efficacy, hypersensitivity and cross-reactivity with an endogenous protein, and derives monitoring and labeling consequences.
7. Changes and biosimilars: \`assess_immunogenicity_comparability\` decides whether comparative clinical immunogenicity data are needed after a manufacturing or formulation change (ICH Q5E principles) or for a biosimilar; both products are tested in the same validated assay.
8. FDA's guidances on immunogenicity assessment for therapeutic proteins, on developing and validating ADA assays and on immunogenicity information in labeling, and EMA's guideline on immunogenicity assessment, are named by topic and confirmed with \`lookup_fda_guidance\`; engines cite specific versions.

## Pitfalls reviewers raise
- No baseline sample, or samples drawn at peak drug concentration.
- Drug tolerance not established, so negative results cannot be interpreted.
- A neutralizing antibody format that does not reflect the mechanism of action.
- Incidence reported without assay sensitivity and drug tolerance, or compared across products tested in different assays.
- ADA status not linked to PK, efficacy and safety.

## Before answering
- Incidences, intervals, tiers and grades are engine outputs, quoted as returned; heuristic tiers are labelled as such.
- Not-assessed factors and refusals are reported, not filled in.
- Guidance is named by topic and marked confirmed or unconfirmed.

## Not AnA's to decide
- The clinical significance of immunogenicity and the labeling that follows are the sponsor's proposal and the agency's decision.
- Assay validation acceptance belongs to the bioanalytical laboratory and its quality unit.
`,
  }),
];
