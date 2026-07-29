/**
 * Mutagenic Impurity (ICH M7) Knowledge Base Service
 *
 * Deterministic, citation-backed knowledge base covering mutagenic impurity
 * assessment, classification, control strategy, and nitrosamine risk evaluation
 * per ICH M7(R2), FDA, and EMA guidances. Every function returns structured
 * output grounded in ICH M7(R2), ICH Q3A/Q3B, FDA 2021 Nitrosamine Guidance,
 * EMA 2023 Nitrosamine Guidance, and Teasdale (2019) purge factor methodology.
 *
 * NO LLM calls, NO network requests, NO database queries — PURE DETERMINISTIC.
 *
 * Covered domains:
 *   1. ICH M7(R2) 5-class classification (classifyMutagenicImpurity)
 *   2. TTC / LTL-TTC acceptable intake calculation (calculateTTC)
 *   3. (Q)SAR structural alert assessment (assessStructuralAlerts)
 *   4. Purge factor study design (designPurgeStudy)
 *   5. Nitrosamine risk assessment (assessNitrosamineRisk)
 *   6. Control strategy design (controlMutagenicImpurity)
 *
 * @module server/services/mutagenic-impurity/mutagenic-impurity-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export type AmesMutagenicity = 'positive' | 'negative' | 'not_tested';
export type StructuralAlertPresence = 'yes' | 'no' | 'unknown';
export type CarcinogenicityData = 'positive' | 'negative' | 'not_tested';
export type ImpurityRelationship = 'process_related' | 'degradation' | 'starting_material' | 'reagent' | 'byproduct' | 'solvent' | 'catalyst';
export type TreatmentDuration = 'single_dose' | 'up_to_1_month' | '1_to_12_months' | '1_to_10_years' | 'lifetime';
export type AdministrationRoute = 'oral' | 'parenteral' | 'dermal' | 'inhalation';
export type CohortOfConcern = 'not_coc' | 'CoC_aflatoxin_like' | 'CoC_nitrosamine' | 'CoC_alkyl_azoxy';
export type SyntheticStep = 'early' | 'intermediate' | 'late' | 'final';
export type DevelopmentPhase = 'clinical_phase1' | 'clinical_phase2' | 'clinical_phase3' | 'commercial';
export type ImpurityClass = 1 | 2 | 3 | 4 | 5;
export type NitrosamineRiskLevel = 'high' | 'medium' | 'low' | 'no_risk';

export interface Citation {
  guideline: string;
  section?: string;
  title: string;
  year: number;
  url?: string;
}

export interface DecisionStep {
  step: number;
  question: string;
  evaluation: string;
  outcome: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants — Regulatory Reference Data
// ─────────────────────────────────────────────────────────────────────────────

/** ICH M7(R2) Table 1: Known alerting functional groups */
const STRUCTURAL_ALERT_CATEGORIES: Record<string, { description: string; examples: string[]; mutagenicity_mechanism: string }> = {
  alkyl_halides: {
    description: 'Alkyl halides (alkyl chlorides, bromides, iodides)',
    examples: ['methyl chloride', 'ethyl bromide', 'benzyl chloride', 'allyl chloride', 'epichlorohydrin'],
    mutagenicity_mechanism: 'Direct alkylation of DNA bases (primarily N7-guanine and O6-guanine)',
  },
  michael_reactive_acceptors: {
    description: 'Michael reactive acceptors (alpha,beta-unsaturated carbonyls)',
    examples: ['acrolein', 'methyl vinyl ketone', 'acrylonitrile', 'methyl acrylate', 'ethyl acrylate'],
    mutagenicity_mechanism: '1,4-conjugate addition to nucleophilic sites on DNA bases',
  },
  epoxides: {
    description: 'Epoxides and aziridines',
    examples: ['ethylene oxide', 'propylene oxide', 'styrene oxide', 'glycidol', 'aziridine'],
    mutagenicity_mechanism: 'Ring opening by nucleophilic DNA bases, forming alkyl-DNA adducts',
  },
  aldehydes: {
    description: 'Aldehydes (aliphatic)',
    examples: ['formaldehyde', 'acetaldehyde', 'glutaraldehyde', 'chloroacetaldehyde'],
    mutagenicity_mechanism: 'Formation of Schiff bases and cyclic adducts with DNA bases (primarily deoxyguanosine)',
  },
  aromatic_amines: {
    description: 'Aromatic amines and aminobiphenyls',
    examples: ['aniline', '4-aminobiphenyl', '2-naphthylamine', 'benzidine', '4-chloroaniline', 'o-toluidine'],
    mutagenicity_mechanism: 'Metabolic activation to reactive N-hydroxy intermediates and nitrenium ions that form aminyl-DNA adducts',
  },
  aromatic_nitro: {
    description: 'Aromatic nitro compounds',
    examples: ['4-nitrobiphenyl', '2-nitrofluorene', '1-nitropyrene', '4-nitroquinoline N-oxide'],
    mutagenicity_mechanism: 'Nitroreduction to aromatic amines followed by N-hydroxylation to reactive electrophiles',
  },
  n_nitroso: {
    description: 'N-Nitroso compounds (nitrosamines, nitrosamides)',
    examples: ['NDMA', 'NDEA', 'NMBA', 'N-nitrosodiphenylamine', 'N-nitrosomorpholine', 'NIPEA'],
    mutagenicity_mechanism: 'Metabolic activation (CYP2E1) to alkyl diazonium ions that alkylate DNA at O6-guanine and N7-guanine',
  },
  azide: {
    description: 'Organic azides',
    examples: ['methyl azide', 'sodium azide (inorganic but tested)', 'phenyl azide'],
    mutagenicity_mechanism: 'Nitrene intermediate formation; direct DNA interaction or metabolic activation to reactive species',
  },
  hydrazine: {
    description: 'Hydrazines and hydrazides',
    examples: ['hydrazine', 'phenylhydrazine', '1,1-dimethylhydrazine', 'isoniazid (hydrazide)'],
    mutagenicity_mechanism: 'Oxidative metabolism to diazene and diazonium intermediates; DNA methylation',
  },
  acyl_halides: {
    description: 'Acyl halides',
    examples: ['acetyl chloride', 'benzoyl chloride', 'oxalyl chloride', 'thionyl chloride'],
    mutagenicity_mechanism: 'Rapid acylation of nucleophilic sites; generally hydrolyzed rapidly in aqueous conditions',
  },
  boronic_acids: {
    description: 'Boronic acids (process reagents in Suzuki coupling)',
    examples: ['phenylboronic acid', 'methylboronic acid'],
    mutagenicity_mechanism: 'Some boronic acids show structural alerts; typically evaluated on a case-by-case basis',
  },
  sulfonates: {
    description: 'Alkyl sulfonates and sulfonate esters',
    examples: ['methyl methanesulfonate (MMS)', 'ethyl methanesulfonate (EMS)', 'methyl p-toluenesulfonate', 'methyl benzenesulfonate'],
    mutagenicity_mechanism: 'Direct alkylation of DNA (SN2 mechanism); potent mutagens in Ames test',
  },
  n_oxides: {
    description: 'N-Oxides (aromatic N-oxides)',
    examples: ['pyridine N-oxide', '4-nitroquinoline N-oxide'],
    mutagenicity_mechanism: 'Reductive activation to reactive intermediates; some are direct-acting mutagens',
  },
  azo_compounds: {
    description: 'Azo compounds',
    examples: ['dimethylaminoazobenzene', 'methyl yellow', 'Sudan I-IV'],
    mutagenicity_mechanism: 'Azoreduction to aromatic amines; subsequent metabolic activation',
  },
  diazo_compounds: {
    description: 'Diazo and diazonium compounds',
    examples: ['diazomethane', 'phenyl diazonium salts'],
    mutagenicity_mechanism: 'Highly reactive electrophiles; direct alkylation and arylation of DNA bases',
  },
  propiolactone_sultone: {
    description: 'Beta-propiolactone, 1,3-propanesultone, and related strained ring electrophiles',
    examples: ['beta-propiolactone', '1,3-propanesultone', 'beta-butyrolactone'],
    mutagenicity_mechanism: 'Ring opening by nucleophilic DNA bases; direct alkylation',
  },
  nitrogen_mustards: {
    description: 'Nitrogen mustards and bis-electrophiles',
    examples: ['mechlorethamine', 'chlorambucil', 'cyclophosphamide (prodrug)', 'bis(2-chloroethyl)amine'],
    mutagenicity_mechanism: 'Interstrand and intrastrand DNA cross-linking via aziridinium ion intermediates',
  },
};

/** ICH M7(R2) Table 2: Acceptable Intake (AI) by treatment duration — LTL TTC */
const LTL_TTC_TABLE: Record<TreatmentDuration, { ai_ug_per_day: number; description: string; basis: string }> = {
  single_dose: {
    ai_ug_per_day: 120,
    description: 'Single dose (one day or less)',
    basis: 'ICH M7(R2) Table 2 — cumulative lifetime risk of 10^-5 pro-rated for single exposure',
  },
  up_to_1_month: {
    ai_ug_per_day: 120,
    description: '≤1 month continuous treatment',
    basis: 'ICH M7(R2) Table 2 — 120 μg/day for treatment duration up to and including 1 month',
  },
  '1_to_12_months': {
    ai_ug_per_day: 20,
    description: '>1 to 12 months continuous treatment',
    basis: 'ICH M7(R2) Table 2 — 20 μg/day for intermediate-duration treatment',
  },
  '1_to_10_years': {
    ai_ug_per_day: 10,
    description: '>1 to 10 years continuous treatment',
    basis: 'ICH M7(R2) Table 2 — 10 μg/day for longer-duration treatment',
  },
  lifetime: {
    ai_ug_per_day: 1.5,
    description: '>10 years to lifetime treatment',
    basis: 'ICH M7(R2) — 1.5 μg/day lifetime TTC based on 10^-5 excess cancer risk',
  },
};

/** Cohort of Concern limits */
const COC_LIMITS: Record<string, { ai_ug_per_day: number; description: string; basis: string; note: string }> = {
  CoC_aflatoxin_like: {
    ai_ug_per_day: 0.15,
    description: 'Aflatoxin-like compounds (polyhalogenated, some fused-ring)',
    basis: 'ICH M7(R2) Section 7.2 — Cohort of Concern: 10× lower than standard TTC',
    note: 'These are highly potent carcinogens; standard TTC is not sufficiently protective. Compound-specific risk assessment is strongly recommended.',
  },
  CoC_nitrosamine: {
    ai_ug_per_day: 0.018,
    description: 'N-Nitrosamines (default, when no compound-specific AI available)',
    basis: 'FDA 2021 Guidance — default AI for nitrosamines without sufficient TD50 data is 18 ng/day (0.018 μg/day)',
    note: 'Compound-specific AIs are available for many common nitrosamines (NDMA: 96 ng/day, NDEA: 26.5 ng/day). Use compound-specific AI when available.',
  },
  CoC_alkyl_azoxy: {
    ai_ug_per_day: 1.5,
    description: 'Alkyl-azoxy compounds',
    basis: 'ICH M7(R2) Section 7.2 — standard TTC applies for alkyl-azoxy compounds unless specific carcinogenicity data warrant lower limit',
    note: 'Generally treated at the standard TTC of 1.5 μg/day unless potency data suggest otherwise.',
  },
};

/** Compound-specific Acceptable Intakes for common nitrosamines (FDA 2021, EMA 2023) */
const NITROSAMINE_SPECIFIC_AI: Record<string, { name: string; ai_ng_per_day: number; basis: string; td50_mg_kg_day?: number }> = {
  NDMA: {
    name: 'N-Nitrosodimethylamine',
    ai_ng_per_day: 96,
    basis: 'FDA 2021 Table 1 — based on TD50 from chronic carcinogenicity studies',
    td50_mg_kg_day: 0.0959,
  },
  NDEA: {
    name: 'N-Nitrosodiethylamine',
    ai_ng_per_day: 26.5,
    basis: 'FDA 2021 Table 1 — based on TD50 from chronic carcinogenicity studies',
    td50_mg_kg_day: 0.0265,
  },
  NMBA: {
    name: 'N-Nitroso-N-methyl-4-aminobutyric acid',
    ai_ng_per_day: 96,
    basis: 'FDA 2021 Table 1 — based on TD50; same potency category as NDMA',
    td50_mg_kg_day: 0.0959,
  },
  NIPEA: {
    name: 'N-Nitrosoisopropylethylamine',
    ai_ng_per_day: 26.5,
    basis: 'FDA 2021 Table 1 — based on structural similarity and TD50 estimates',
    td50_mg_kg_day: 0.0265,
  },
  NDIPA: {
    name: 'N-Nitrosodiisopropylamine',
    ai_ng_per_day: 26.5,
    basis: 'EMA 2023 — based on available carcinogenicity data',
    td50_mg_kg_day: 0.0265,
  },
  NDBA: {
    name: 'N-Nitrosodibutylamine',
    ai_ng_per_day: 26.5,
    basis: 'FDA 2021 — based on TD50 estimate and structural analogy',
    td50_mg_kg_day: 0.0265,
  },
  NMPA: {
    name: 'N-Nitroso-N-methyl-4-aminophenol',
    ai_ng_per_day: 26.5,
    basis: 'EMA 2023 — conservative estimate based on structural class',
  },
  NMPhA: {
    name: 'N-Nitroso-N-methyl-phenylamine (N-Nitrosomethylphenylamine)',
    ai_ng_per_day: 26.5,
    basis: 'EMA 2023 — based on available carcinogenicity data',
  },
  NMOR: {
    name: 'N-Nitrosomorpholine',
    ai_ng_per_day: 127,
    basis: 'EMA 2023 — based on TD50 from chronic bioassay data',
    td50_mg_kg_day: 0.127,
  },
  NPIP: {
    name: 'N-Nitrosopiperidine',
    ai_ng_per_day: 26.5,
    basis: 'EMA 2023 — based on TD50 data',
    td50_mg_kg_day: 0.0265,
  },
  NPYR: {
    name: 'N-Nitrosopyrrolidine',
    ai_ng_per_day: 26.5,
    basis: 'EMA 2023 — based on available carcinogenicity data',
  },
  DEFAULT: {
    name: 'Default (no compound-specific data available)',
    ai_ng_per_day: 18,
    basis: 'FDA 2021 / EMA 2023 — default AI when no compound-specific carcinogenicity data available; 18 ng/day based on conservative potency assumption',
  },
};

/** Purge mechanism scoring per Teasdale (2019) */
const PURGE_SCORING_GUIDE: Record<string, { parameter: string; score_1: string; score_3: string; score_10: string; score_100?: string }> = {
  reactivity: {
    parameter: 'Chemical Reactivity',
    score_1: 'Unreactive under process conditions; impurity and product have similar chemical stability',
    score_3: 'Somewhat reactive; partial degradation expected but not complete removal',
    score_10: 'Reactive under process conditions; majority of impurity expected to degrade (e.g., base-labile impurity in basic conditions)',
    score_100: 'Highly reactive; complete destruction expected under process conditions (e.g., acid chloride in aqueous workup, reactive halide in protic solvent at elevated temperature)',
  },
  solubility: {
    parameter: 'Solubility / Partitioning',
    score_1: 'Similar solubility profile to API; co-crystallizes or co-precipitates',
    score_3: 'Moderately different solubility; partial removal expected during crystallization or extraction',
    score_10: 'Very different solubility from API; effectively removed by crystallization, extraction, or aqueous wash',
  },
  volatility: {
    parameter: 'Volatility',
    score_1: 'Similar volatility to API; not removed by drying or distillation',
    score_3: 'Moderately more volatile than API; partial removal during drying or concentration',
    score_10: 'Much more volatile than API (boiling point <150 °C); effectively removed during drying, vacuum distillation, or rotary evaporation',
  },
  ionizability: {
    parameter: 'Ionizability / pKa Difference',
    score_1: 'Similar pKa to API; not separated by pH-dependent extraction',
    score_3: 'Somewhat different pKa; partial separation by pH-adjusted washing',
    score_10: 'Very different pKa (>3 units from API); effectively separated by acid-base extraction or ion exchange',
  },
  chromatographic: {
    parameter: 'Chromatographic / Adsorption Behavior',
    score_1: 'Co-elutes with API; not removed by column chromatography or activated carbon',
    score_3: 'Partially separated from API by chromatography or adsorption',
    score_10: 'Completely separated from API; removed by column chromatography, activated carbon, or other adsorption methods',
  },
};

/** Core ICH M7 and related citations */
const CITATIONS: Record<string, Citation> = {
  M7R2: {
    guideline: 'ICH M7(R2)',
    section: 'All',
    title: 'Assessment and Control of DNA Reactive (Mutagenic) Impurities in Pharmaceuticals to Limit Potential Carcinogenic Risk',
    year: 2023,
    url: 'https://database.ich.org/sites/default/files/M7_R2_Guideline_Step4_2023_0216.pdf',
  },
  M7R1: {
    guideline: 'ICH M7(R1)',
    title: 'Assessment and Control of DNA Reactive (Mutagenic) Impurities in Pharmaceuticals to Limit Potential Carcinogenic Risk — Addendum',
    year: 2017,
    url: 'https://database.ich.org/sites/default/files/M7_R1_Addendum_Step4_2017_0331.pdf',
  },
  Q3A_R2: {
    guideline: 'ICH Q3A(R2)',
    title: 'Impurities in New Drug Substances',
    year: 2006,
    url: 'https://database.ich.org/sites/default/files/Q3A_R2_Guideline.pdf',
  },
  Q3B_R2: {
    guideline: 'ICH Q3B(R2)',
    title: 'Impurities in New Drug Products',
    year: 2006,
    url: 'https://database.ich.org/sites/default/files/Q3B_R2_Guideline.pdf',
  },
  Q3C_R8: {
    guideline: 'ICH Q3C(R8)',
    title: 'Residual Solvents',
    year: 2021,
    url: 'https://database.ich.org/sites/default/files/Q3C-R8_Guideline_Step4_2021_0422.pdf',
  },
  Q3D_R2: {
    guideline: 'ICH Q3D(R2)',
    title: 'Guideline for Elemental Impurities',
    year: 2022,
  },
  FDA_NITROSAMINE_2021: {
    guideline: 'FDA Guidance',
    title: 'Control of Nitrosamine Impurities in Human Drugs — Guidance for Industry',
    year: 2021,
    url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/control-nitrosamine-impurities-human-drugs',
  },
  EMA_NITROSAMINE_2023: {
    guideline: 'EMA/409815/2020 Rev.15',
    title: 'Questions and Answers for Marketing Authorisation Holders/Applicants on the CHMP Opinion for the Article 5(3) of Regulation (EC) No 726/2004 Referral on Nitrosamine Impurities in Human Medicinal Products',
    year: 2023,
    url: 'https://www.ema.europa.eu/en/documents/referral/nitrosamines-emea-h-a53-1490-assessment-report_en.pdf',
  },
  TEASDALE_2019: {
    guideline: 'Publication',
    title: 'Teasdale A. et al., "A Tool for the Semiquantitative Assessment of Potentially Mutagenic Impurity (PMI) Process-Related Purge," Org. Process Res. Dev. 2019, 23, 5, 961-970',
    year: 2019,
  },
  FDA_FIH: {
    guideline: 'FDA Guidance',
    title: 'Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers',
    year: 2005,
    url: 'https://www.fda.gov/media/72309/download',
  },
  EMEA_SWP: {
    guideline: 'EMEA/CHMP/SWP/5199/02',
    title: 'CHMP SWP — Guideline on the Limits of Genotoxic Impurities',
    year: 2006,
  },
  EMA_NITROSAMINE_STEP5: {
    guideline: 'EMA Procedure',
    title: 'Lessons Learnt from Presence of N-Nitrosamine Impurities in Sartan Medicines — Implementation Plan',
    year: 2019,
  },
  ICH_S2R1: {
    guideline: 'ICH S2(R1)',
    title: 'Guidance on Genotoxicity Testing and Data Interpretation for Pharmaceuticals Intended for Human Use',
    year: 2011,
    url: 'https://database.ich.org/sites/default/files/S2%28R1%29_Guideline.pdf',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// (Q)SAR System Reference Data
// ─────────────────────────────────────────────────────────────────────────────

interface QSARSystem {
  name: string;
  vendor: string;
  type: 'expert_rule_based' | 'statistical_based';
  description: string;
  endpoint: string;
  regulatory_acceptance: string;
}

const QSAR_SYSTEMS: QSARSystem[] = [
  {
    name: 'Derek Nexus',
    vendor: 'Lhasa Limited',
    type: 'expert_rule_based',
    description: 'Expert rule-based knowledge system using structural alerts and mechanistic reasoning. Rules are derived from published literature and expert review. Provides qualitative predictions with reasoning.',
    endpoint: 'Bacterial mutagenicity (Ames), in vitro chromosome damage, in vivo genotoxicity',
    regulatory_acceptance: 'Widely accepted by FDA, EMA, PMDA; explicitly referenced in ICH M7(R2) as an example of expert rule-based system',
  },
  {
    name: 'Sarah Nexus',
    vendor: 'Lhasa Limited',
    type: 'statistical_based',
    description: 'Statistical-based QSAR model using nearest-neighbor and random forest algorithms trained on curated Ames test data. Provides quantitative probability and confidence scores.',
    endpoint: 'Bacterial mutagenicity (Ames)',
    regulatory_acceptance: 'Widely accepted by FDA, EMA, PMDA; complementary statistical system to Derek Nexus per ICH M7(R2)',
  },
  {
    name: 'CASE Ultra (Expert Alerts)',
    vendor: 'MultiCASE Inc.',
    type: 'expert_rule_based',
    description: 'Expert alert system incorporating mechanistic structural alerts and toxicophore identification. Includes GT_EXPERT module for expert-rule predictions.',
    endpoint: 'Bacterial mutagenicity (Ames), in vitro and in vivo genotoxicity endpoints',
    regulatory_acceptance: 'Accepted by FDA, EMA, PMDA; FDA CDER has used CASE Ultra internally for regulatory review',
  },
  {
    name: 'CASE Ultra (Statistical Models)',
    vendor: 'MultiCASE Inc.',
    type: 'statistical_based',
    description: 'QSAR statistical models (GT1_BMUT, GT_BMUT2) trained on large curated Ames datasets using MCASE algorithm with biophore identification.',
    endpoint: 'Bacterial mutagenicity (Ames)',
    regulatory_acceptance: 'Accepted by FDA, EMA, PMDA; used as complementary statistical method',
  },
  {
    name: 'Leadscope Expert Alerts',
    vendor: 'Instem (Leadscope)',
    type: 'expert_rule_based',
    description: 'Expert-rule system based on published structural alerts for mutagenicity. Includes curated alert library with mechanistic annotations.',
    endpoint: 'Bacterial mutagenicity (Ames)',
    regulatory_acceptance: 'Referenced in ICH M7(R2) as an acceptable expert rule-based system',
  },
  {
    name: 'Leadscope Genetox Models',
    vendor: 'Instem (Leadscope)',
    type: 'statistical_based',
    description: 'Statistical QSAR models for Ames mutagenicity prediction using scaffold-based machine learning. Part of Leadscope Model Applier suite.',
    endpoint: 'Bacterial mutagenicity (Ames)',
    regulatory_acceptance: 'Referenced in ICH M7(R2) as an acceptable statistical-based system',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. ICH M7(R2) 5-Class Mutagenic Impurity Classification
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassifyInput {
  amesMutagenicity: AmesMutagenicity;
  structuralAlertsPresent: StructuralAlertPresence;
  carcinogenicityData: CarcinogenicityData;
  impurityRelationship: ImpurityRelationship;
  cohortOfConcernStructure?: boolean;
  specificStructuralAlerts?: string[];
}

export interface ClassificationResult {
  impurityClass: ImpurityClass;
  className: string;
  classDescription: string;
  controlApproach: string;
  acceptableIntakeBasis: string;
  decisionTree: DecisionStep[];
  requiredTestingToReclassify: string[];
  cohortOfConcernAssessment: {
    isCohortOfConcern: boolean;
    category?: string;
    additionalTestingRequired: string[];
    implication: string;
  };
  regulatorySummary: string;
  citations: Citation[];
}

/**
 * Classify a mutagenic impurity per ICH M7(R2) 5-class system.
 *
 * Decision tree follows ICH M7(R2) Section 5 flowchart:
 *   1. Is there carcinogenicity data showing positive result? → Class 1
 *   2. Is the compound Ames-positive (known mutagen) with no carcinogenicity data? → Class 2
 *   3. Does the compound have structural alerts but no Ames data? → Class 3
 *   4. Does the compound have structural alerts AND negative Ames? → Class 4
 *   5. No structural alerts, no Ames data? → Class 5
 */
export function classifyMutagenicImpurity(params: ClassifyInput): ClassificationResult {
  const {
    amesMutagenicity,
    structuralAlertsPresent,
    carcinogenicityData,
    impurityRelationship,
    cohortOfConcernStructure = false,
    specificStructuralAlerts = [],
  } = params;

  const decisionTree: DecisionStep[] = [];
  let impurityClass: ImpurityClass;
  let className: string;
  let classDescription: string;
  let controlApproach: string;
  let acceptableIntakeBasis: string;
  const requiredTestingToReclassify: string[] = [];

  // Step 1: Evaluate carcinogenicity + mutagenicity for Class 1
  decisionTree.push({
    step: 1,
    question: 'Is there positive carcinogenicity data AND positive mutagenicity data (or known mutagenic mechanism)?',
    evaluation: `Carcinogenicity: ${carcinogenicityData}, Ames mutagenicity: ${amesMutagenicity}`,
    outcome: carcinogenicityData === 'positive' && amesMutagenicity === 'positive'
      ? 'YES — Known mutagenic carcinogen → Class 1'
      : 'NO — Proceed to Step 2',
  });

  if (carcinogenicityData === 'positive' && amesMutagenicity === 'positive') {
    impurityClass = 1;
    className = 'Class 1: Known mutagenic carcinogen';
    classDescription = 'Compound has both positive carcinogenicity data and positive bacterial mutagenicity data. These are known mutagenic carcinogens with compound-specific risk and require compound-specific acceptable intake limits based on carcinogenicity potency data (TD50 or benchmark dose).';
    controlApproach = 'Compound-specific limit based on carcinogenicity potency data. The TTC-based limit (1.5 μg/day) is NOT applicable; a risk assessment using TD50 (tumorigenic dose for 50% incidence) or lower benchmark dose must be performed. For Class 1 impurities, the acceptable intake is calculated as AI = TD50 / 50,000 (for lifetime exposure, 10^-5 excess cancer risk).';
    acceptableIntakeBasis = 'Compound-specific AI derived from carcinogenicity potency (TD50 or benchmark dose)';
    requiredTestingToReclassify.push('Class 1 impurities cannot be reclassified — carcinogenicity and mutagenicity are established facts. Control at the compound-specific limit is mandatory.');
  } else {
    // Step 2: Evaluate for Class 2 (known mutagen, unknown carcinogenicity)
    decisionTree.push({
      step: 2,
      question: 'Is the compound Ames-positive (known mutagen) WITHOUT sufficient carcinogenicity data to classify as Class 1?',
      evaluation: `Ames mutagenicity: ${amesMutagenicity}, Carcinogenicity: ${carcinogenicityData}`,
      outcome: amesMutagenicity === 'positive' && carcinogenicityData !== 'positive'
        ? 'YES — Known mutagen, unknown carcinogenic potential → Class 2'
        : 'NO — Proceed to Step 3',
    });

    if (amesMutagenicity === 'positive' && carcinogenicityData !== 'positive') {
      impurityClass = 2;
      className = 'Class 2: Known mutagen with unknown carcinogenic potential';
      classDescription = 'Compound is Ames-positive (known bacterial mutagen) but does not have sufficient carcinogenicity data. Treated as potentially carcinogenic via a mutagenic mechanism. The default TTC of 1.5 μg/day (lifetime) applies, with less-than-lifetime (LTL) adjustments permitted for shorter treatment durations.';
      controlApproach = 'TTC-based limit applies: 1.5 μg/day for lifetime (>10 years) treatment. Less-than-lifetime staged TTC applies for shorter durations: 10 μg/day (1-10 years), 20 μg/day (1-12 months), 120 μg/day (≤1 month).';
      acceptableIntakeBasis = 'TTC (Threshold of Toxicological Concern) — 1.5 μg/day lifetime, with LTL adjustments per ICH M7(R2) Table 2';
      requiredTestingToReclassify.push(
        'To reclassify to Class 1: conduct carcinogenicity bioassay — positive result with mutagenic mechanism establishes Class 1 and requires compound-specific limit',
        'Class 2 impurities cannot be downgraded to Class 4 or 5 because they have positive Ames data',
        'If carcinogenicity bioassay is negative, the compound may remain Class 2 but with potential for a compound-specific limit that may be higher than TTC (conduct full risk assessment)',
      );
    } else {
      // Step 3: Evaluate structural alerts for Classes 3, 4, 5
      decisionTree.push({
        step: 3,
        question: 'Does the compound contain structural alerts for mutagenicity (based on (Q)SAR or known alerting structures)?',
        evaluation: `Structural alerts present: ${structuralAlertsPresent}`,
        outcome: structuralAlertsPresent === 'yes' || structuralAlertsPresent === 'unknown'
          ? 'YES/UNKNOWN — Compound has or may have alerting structure → Proceed to Step 4'
          : 'NO — No alerting structure → Class 5',
      });

      if (structuralAlertsPresent === 'no') {
        // Class 5: No alerts, no Ames data
        impurityClass = 5;
        className = 'Class 5: No structural alerts, no mutagenicity data';
        classDescription = 'Compound has no structural alerts identified by (Q)SAR assessment and no bacterial mutagenicity data. Treated as non-mutagenic. Control as an ordinary impurity per ICH Q3A(R2) (drug substance) or ICH Q3B(R2) (drug product) thresholds. No TTC-based limit is required.';
        controlApproach = 'No mutagenic impurity controls required. Manage as an ordinary (non-mutagenic) impurity under ICH Q3A(R2) or Q3B(R2). Identification and qualification thresholds per ICH Q3A/Q3B apply based on maximum daily dose.';
        acceptableIntakeBasis = 'ICH Q3A(R2)/Q3B(R2) identification and qualification thresholds for ordinary impurities';
        requiredTestingToReclassify.push(
          'No reclassification testing typically required',
          'If new structural information reveals alerts, reclassify to Class 3 and conduct (Q)SAR and/or Ames test',
        );
      } else {
        // Step 4: Has Ames test been conducted?
        decisionTree.push({
          step: 4,
          question: 'Has the bacterial mutagenicity (Ames) test been conducted for this compound?',
          evaluation: `Ames mutagenicity: ${amesMutagenicity}`,
          outcome: amesMutagenicity === 'not_tested'
            ? 'NOT TESTED — Alerting structure present but no mutagenicity data → Class 3'
            : amesMutagenicity === 'negative'
              ? 'NEGATIVE — Alerting structure present but Ames negative → Class 4'
              : 'POSITIVE — Alerting structure present and Ames positive → Class 2 (already covered above)',
        });

        if (amesMutagenicity === 'not_tested') {
          impurityClass = 3;
          className = 'Class 3: Alerting structure, unconfirmed mutagenicity';
          classDescription = 'Compound contains structural alerts for bacterial mutagenicity identified by (Q)SAR but has not been tested in an Ames assay. Treated as a potential mutagen with TTC-based limits applied unless and until a negative Ames test reclassifies it to Class 4. Two complementary (Q)SAR systems (one expert rule-based, one statistical-based) must be used per ICH M7(R2) Section 6.';
          controlApproach = 'TTC-based limit applies (same as Class 2): 1.5 μg/day for lifetime treatment, with LTL adjustments for shorter durations. Alternatively, a negative Ames test will downgrade to Class 4 (non-mutagenic).';
          acceptableIntakeBasis = 'TTC — 1.5 μg/day lifetime, with LTL adjustments; OR conduct Ames test to potentially reclassify to Class 4';
          requiredTestingToReclassify.push(
            'Conduct bacterial reverse mutation test (Ames test, OECD TG 471): negative result → reclassify to Class 4 (non-mutagenic, treat as ordinary impurity)',
            'Positive Ames result → reclassify to Class 2 (known mutagen, TTC applies)',
            '(Q)SAR assessment showing both complementary systems predict "negative" with adequate coverage may be used in lieu of Ames test per ICH M7(R2), subject to expert review and regulatory agreement',
          );
        } else {
          // amesMutagenicity === 'negative' and structuralAlertsPresent === 'yes'
          impurityClass = 4;
          className = 'Class 4: Alerting structure, but Ames-negative (non-mutagenic)';
          classDescription = 'Compound has structural alerts for mutagenicity but tested negative in a compliant Ames assay (OECD TG 471). Treated as non-mutagenic. No TTC-based limits apply. Control as an ordinary impurity per ICH Q3A(R2)/Q3B(R2).';
          controlApproach = 'No mutagenic impurity controls required. Manage as an ordinary impurity under ICH Q3A(R2) or Q3B(R2). The negative Ames result overrides the structural alert.';
          acceptableIntakeBasis = 'ICH Q3A(R2)/Q3B(R2) thresholds for ordinary impurities — mutagenicity concern resolved by negative Ames test';
          requiredTestingToReclassify.push(
            'No reclassification testing typically required',
            'If the compound is an isomer or closely related structural analogue of a known mutagenic carcinogen, additional chromosomal aberration or micronucleus testing may be warranted',
            'If the negative Ames test is questioned (e.g., due to cytotoxicity masking, inadequate metabolic activation, or insufficient test conditions), repeat under optimized conditions',
          );
        }
      }
    }
  }

  // Cohort of Concern assessment
  const cohortOfConcernAssessment = evaluateCohortOfConcern(
    cohortOfConcernStructure,
    specificStructuralAlerts,
    impurityClass,
  );

  // Final decision step
  decisionTree.push({
    step: decisionTree.length + 1,
    question: 'Final classification and Cohort of Concern assessment',
    evaluation: `Class ${impurityClass} assigned. CoC: ${cohortOfConcernAssessment.isCohortOfConcern ? 'YES — ' + cohortOfConcernAssessment.category : 'NO'}`,
    outcome: `Impurity classified as ${className}. ${cohortOfConcernAssessment.isCohortOfConcern ? 'Additional CoC considerations apply.' : 'Standard controls apply.'}`,
  });

  const regulatorySummary = buildClassificationSummary(
    impurityClass,
    className,
    controlApproach,
    impurityRelationship,
    cohortOfConcernAssessment,
  );

  return {
    impurityClass,
    className,
    classDescription,
    controlApproach,
    acceptableIntakeBasis,
    decisionTree,
    requiredTestingToReclassify,
    cohortOfConcernAssessment,
    regulatorySummary,
    citations: [CITATIONS.M7R2, CITATIONS.Q3A_R2, CITATIONS.Q3B_R2, CITATIONS.ICH_S2R1],
  };
}

function evaluateCohortOfConcern(
  isCoCStructure: boolean,
  specificAlerts: string[],
  impurityClass: ImpurityClass,
): ClassificationResult['cohortOfConcernAssessment'] {
  const lowerAlerts = specificAlerts.map(a => a.toLowerCase());
  const isNitroso = lowerAlerts.some(a =>
    a.includes('nitroso') || a.includes('nitrosamine') || a.includes('n-nitroso') || a.includes('n_nitroso'),
  );
  const isAflatoxinLike = lowerAlerts.some(a =>
    a.includes('aflatoxin') || a.includes('polyhalogenated') || a.includes('azacyclopropane'),
  );
  const isAlkylAzoxy = lowerAlerts.some(a =>
    a.includes('alkyl-azoxy') || a.includes('azoxy') || a.includes('alkylazoxy'),
  );

  if (!isCoCStructure && !isNitroso && !isAflatoxinLike && !isAlkylAzoxy) {
    return {
      isCohortOfConcern: false,
      implication: 'Compound is NOT in a Cohort of Concern category. Standard TTC (1.5 μg/day lifetime) applies for Class 2 and Class 3 impurities.',
      additionalTestingRequired: [],
    };
  }

  let category = 'Unknown CoC';
  const additionalTestingRequired: string[] = [];

  if (isNitroso) {
    category = 'Nitrosamine (N-Nitroso compound)';
    additionalTestingRequired.push(
      'Compound-specific acceptable intake (AI) based on TD50 from carcinogenicity bioassay data is required — see FDA 2021 Guidance Table 1',
      'If no compound-specific TD50 data available, default AI of 18 ng/day applies',
      'Ames test alone is NOT sufficient for CoC nitrosamines — additional in vivo genotoxicity data may be warranted',
      'Root cause analysis required per FDA 2021 and EMA 2023 nitrosamine guidance',
      'Validated analytical method with LOQ ≤10% of AI at maximum daily dose required',
    );
  } else if (isAflatoxinLike) {
    category = 'Aflatoxin-like (highly potent carcinogens)';
    additionalTestingRequired.push(
      'AI of 0.15 μg/day applies (10× lower than standard TTC)',
      'Compound-specific risk assessment strongly recommended',
      'Full genotoxicity battery (Ames + in vitro chromosomal aberration + in vivo micronucleus) recommended even if Class 3',
      'Expert toxicological evaluation of mechanism and potency required',
    );
  } else if (isAlkylAzoxy) {
    category = 'Alkyl-azoxy compound';
    additionalTestingRequired.push(
      'Standard TTC of 1.5 μg/day generally applies unless specific potency data warrant lower limit',
      'Full Ames test required to confirm mutagenicity class',
      'Consider compound-specific risk assessment if structurally related to known potent carcinogens',
    );
  } else {
    category = 'Cohort of Concern (specific category undetermined)';
    additionalTestingRequired.push(
      'Expert review required to determine specific CoC category',
      'Additional testing beyond Ames may be required',
      'Compound-specific risk assessment recommended',
    );
  }

  return {
    isCohortOfConcern: true,
    category,
    additionalTestingRequired,
    implication: `Compound belongs to the ${category} Cohort of Concern per ICH M7(R2) Section 7.2. ` +
      (impurityClass <= 3
        ? 'Lower acceptable intake limits and/or compound-specific risk assessment apply instead of or in addition to the standard TTC.'
        : 'Despite being Class 4 or 5 (non-mutagenic classification), the CoC structural features should be noted in the risk assessment documentation.'),
  };
}

function buildClassificationSummary(
  impurityClass: ImpurityClass,
  className: string,
  controlApproach: string,
  relationship: ImpurityRelationship,
  coc: ClassificationResult['cohortOfConcernAssessment'],
): string {
  const relationshipLabel: Record<ImpurityRelationship, string> = {
    process_related: 'Process-related impurity (formed during synthesis)',
    degradation: 'Degradation product (formed during storage or processing)',
    starting_material: 'Starting material or intermediate',
    reagent: 'Reagent, catalyst, or auxiliary',
    byproduct: 'Synthetic byproduct',
    solvent: 'Residual solvent',
    catalyst: 'Residual catalyst or metal',
  };

  let summary = `CLASSIFICATION: ${className}\n`;
  summary += `IMPURITY ORIGIN: ${relationshipLabel[relationship]}\n`;
  summary += `CONTROL APPROACH: ${controlApproach}\n`;

  if (coc.isCohortOfConcern) {
    summary += `\nCOHORT OF CONCERN: ${coc.category}\n`;
    summary += `IMPLICATION: ${coc.implication}\n`;
    summary += `ADDITIONAL TESTING:\n`;
    coc.additionalTestingRequired.forEach(t => {
      summary += `  - ${t}\n`;
    });
  }

  if (impurityClass === 1 || impurityClass === 2 || impurityClass === 3) {
    summary += `\nREGULATORY NOTE: Class ${impurityClass} impurities require control to mutagenic impurity limits. `;
    summary += `Include this impurity in the ICH M7 risk assessment document (Module 3.2.S.3.2 or Module 2.3/3.2.P.5.5). `;
    summary += `Analytical methods must be validated per ICH Q2(R2) with sensitivity adequate to quantitate at the specification limit.`;
  } else {
    summary += `\nREGULATORY NOTE: Class ${impurityClass} impurity — no mutagenic impurity control required. `;
    summary += `Manage under ordinary impurity limits per ICH Q3A(R2)/Q3B(R2).`;
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TTC / LTL-TTC Acceptable Intake Calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface TTCInput {
  treatmentDuration: TreatmentDuration;
  route: AdministrationRoute;
  compoundClass: CohortOfConcern;
  maxDailyDoseG?: number;
  numberOfMutagenicImpurities?: number;
  isOncologyIndication?: boolean;
  nitrosamineIdentity?: string;
}

export interface TTCResult {
  acceptableIntakeUgPerDay: number;
  acceptableIntakeNgPerDay: number;
  concentrationLimitPpm: number | null;
  calculationBasis: string;
  durationCategory: string;
  ltlAdjustment: string;
  cocConsiderations: string;
  multipleImpurityConsideration: string;
  oncologyConsideration: string;
  calculationSteps: CalculationStepTTC[];
  allDurationLimits: { duration: string; ai_ug_per_day: number }[];
  analyticalConsiderations: string[];
  regulatorySummary: string;
  citations: Citation[];
}

interface CalculationStepTTC {
  step: number;
  description: string;
  formula: string;
  values: Record<string, number | string>;
  result: number | string;
}

/**
 * Calculate Threshold of Toxicological Concern (TTC) and concentration limits.
 *
 * Implements ICH M7(R2) Section 7 TTC framework:
 *   - Lifetime TTC: 1.5 μg/day (>10 years continuous)
 *   - LTL staged TTC: adjusted for shorter treatment durations
 *   - CoC limits: aflatoxin-like (0.15 μg/day), nitrosamines (compound-specific or 18 ng/day)
 *   - Concentration limit = AI / MDD × 1000 (ppm)
 */
export function calculateTTC(params: TTCInput): TTCResult {
  const {
    treatmentDuration,
    route,
    compoundClass,
    maxDailyDoseG,
    numberOfMutagenicImpurities = 1,
    isOncologyIndication = false,
    nitrosamineIdentity,
  } = params;

  const calculationSteps: CalculationStepTTC[] = [];
  let acceptableIntakeUgPerDay: number;
  let calculationBasis: string;
  let cocConsiderations: string;

  // Step 1: Determine base AI based on compound class
  if (compoundClass === 'CoC_nitrosamine') {
    // Nitrosamines: compound-specific or default 18 ng/day
    const specificAI = nitrosamineIdentity
      ? NITROSAMINE_SPECIFIC_AI[nitrosamineIdentity.toUpperCase()] || NITROSAMINE_SPECIFIC_AI.DEFAULT
      : NITROSAMINE_SPECIFIC_AI.DEFAULT;

    acceptableIntakeUgPerDay = specificAI.ai_ng_per_day / 1000;
    calculationBasis = `Nitrosamine compound-specific AI: ${specificAI.name} — ${specificAI.ai_ng_per_day} ng/day (${specificAI.basis})`;
    cocConsiderations = `N-Nitrosamines are in the Cohort of Concern per ICH M7(R2). ` +
      `The standard TTC of 1.5 μg/day is NOT applicable. ` +
      `${nitrosamineIdentity ? `Compound-specific AI for ${nitrosamineIdentity}: ${specificAI.ai_ng_per_day} ng/day` : `Default AI of 18 ng/day applies (no compound-specific TD50 data available)`}. ` +
      `LTL adjustments per ICH M7(R2) Table 2 are generally NOT applied to nitrosamine AIs — the compound-specific AI is a fixed limit regardless of treatment duration per FDA 2021 Guidance. ` +
      `However, the FDA has noted that short-term higher limits may be considered in urgent situations (e.g., interim limits during recall responses).`;

    calculationSteps.push({
      step: 1,
      description: 'Determine nitrosamine-specific acceptable intake',
      formula: 'AI = compound-specific AI from TD50 data, or default 18 ng/day',
      values: {
        nitrosamine: nitrosamineIdentity || 'unspecified',
        ai_ng_per_day: specificAI.ai_ng_per_day,
        basis: specificAI.basis,
      },
      result: `${specificAI.ai_ng_per_day} ng/day (${acceptableIntakeUgPerDay} μg/day)`,
    });
  } else if (compoundClass === 'CoC_aflatoxin_like') {
    acceptableIntakeUgPerDay = COC_LIMITS.CoC_aflatoxin_like.ai_ug_per_day;
    calculationBasis = `Aflatoxin-like CoC limit: ${acceptableIntakeUgPerDay} μg/day (10× lower than standard TTC)`;
    cocConsiderations = `Aflatoxin-like compounds are in the Cohort of Concern per ICH M7(R2) Section 7.2. ` +
      `The AI is 0.15 μg/day (150 ng/day), which is 10-fold lower than the standard TTC. ` +
      `LTL adjustments may be applied but should be proportionally scaled from the CoC base limit. ` +
      `Compound-specific risk assessment is strongly recommended for aflatoxin-like structures.`;

    calculationSteps.push({
      step: 1,
      description: 'Determine aflatoxin-like CoC acceptable intake',
      formula: 'AI = 0.15 μg/day (10× lower than standard TTC)',
      values: { coc_category: 'aflatoxin-like', standard_ttc: 1.5, coc_factor: 10 },
      result: `${acceptableIntakeUgPerDay} μg/day`,
    });
  } else if (compoundClass === 'CoC_alkyl_azoxy') {
    acceptableIntakeUgPerDay = COC_LIMITS.CoC_alkyl_azoxy.ai_ug_per_day;
    calculationBasis = `Alkyl-azoxy CoC: standard TTC of ${acceptableIntakeUgPerDay} μg/day applies`;
    cocConsiderations = `Alkyl-azoxy compounds are in the Cohort of Concern per ICH M7(R2) but are generally controlled at the standard TTC of 1.5 μg/day. ` +
      `LTL adjustments per Table 2 apply. Compound-specific assessment may be warranted if structurally related to known potent carcinogens.`;

    // Apply LTL for alkyl-azoxy (standard TTC pathway)
    const ttcData = LTL_TTC_TABLE[treatmentDuration];
    acceptableIntakeUgPerDay = ttcData.ai_ug_per_day;

    calculationSteps.push({
      step: 1,
      description: 'Determine alkyl-azoxy CoC acceptable intake (standard TTC with LTL)',
      formula: 'AI = LTL-TTC per ICH M7(R2) Table 2',
      values: { duration: treatmentDuration, ai_ug_per_day: ttcData.ai_ug_per_day },
      result: `${acceptableIntakeUgPerDay} μg/day`,
    });
  } else {
    // Standard (non-CoC) mutagenic impurity
    const ttcData = LTL_TTC_TABLE[treatmentDuration];
    acceptableIntakeUgPerDay = ttcData.ai_ug_per_day;
    calculationBasis = `Standard TTC per ICH M7(R2) Table 2: ${ttcData.description} — ${acceptableIntakeUgPerDay} μg/day (${ttcData.basis})`;
    cocConsiderations = 'Compound is NOT in a Cohort of Concern. Standard TTC with LTL adjustments applies.';

    calculationSteps.push({
      step: 1,
      description: 'Determine standard TTC acceptable intake based on treatment duration',
      formula: 'AI = LTL-TTC from ICH M7(R2) Table 2',
      values: {
        duration_category: ttcData.description,
        ai_ug_per_day: ttcData.ai_ug_per_day,
        basis: ttcData.basis,
      },
      result: `${acceptableIntakeUgPerDay} μg/day`,
    });
  }

  // Step 2: Route-of-administration adjustment
  let routeAdjustmentFactor = 1.0;
  let routeNote = '';
  if (route === 'parenteral') {
    routeNote = 'Parenteral route: TTC is based on oral exposure; for parenteral products, the TTC applies directly as the oral bioavailability factor is assumed to be 1.0 (most conservative). No adjustment to the AI is applied per ICH M7(R2).';
  } else if (route === 'dermal') {
    routeNote = 'Dermal route: Limited systemic absorption may justify higher limits on a case-by-case basis. However, ICH M7(R2) does not provide specific dermal adjustment factors. The oral TTC is applied as a conservative default. For dermal products, consider local exposure and systemic bioavailability data if available.';
  } else if (route === 'inhalation') {
    routeNote = 'Inhalation route: Direct lung exposure may present additional risk compared to oral. ICH M7(R2) applies the oral TTC as default. Additional safety considerations for inhalation-specific local effects may be warranted. Note that some regulatory authorities (EMA) recommend applying the oral TTC without adjustment for inhalation products.';
  } else {
    routeNote = 'Oral route: TTC values in ICH M7(R2) Table 2 are derived from oral exposure data. No route adjustment needed.';
  }

  calculationSteps.push({
    step: 2,
    description: 'Route of administration assessment',
    formula: 'Route adjustment factor (standard approach: no adjustment per ICH M7)',
    values: { route, adjustment_factor: routeAdjustmentFactor },
    result: routeNote,
  });

  acceptableIntakeUgPerDay *= routeAdjustmentFactor;

  // Step 3: Concentration limit calculation
  let concentrationLimitPpm: number | null = null;
  if (maxDailyDoseG && maxDailyDoseG > 0) {
    concentrationLimitPpm = (acceptableIntakeUgPerDay / maxDailyDoseG) * 1000;
    // Round to appropriate precision
    concentrationLimitPpm = Math.round(concentrationLimitPpm * 100) / 100;

    calculationSteps.push({
      step: 3,
      description: 'Calculate concentration limit in drug substance (ppm)',
      formula: 'Concentration limit (ppm) = [AI (μg/day) / MDD (g/day)] × 1000',
      values: {
        ai_ug_per_day: acceptableIntakeUgPerDay,
        max_daily_dose_g: maxDailyDoseG,
      },
      result: `${concentrationLimitPpm} ppm`,
    });
  } else {
    calculationSteps.push({
      step: 3,
      description: 'Concentration limit calculation — MDD not provided',
      formula: 'Concentration limit (ppm) = [AI (μg/day) / MDD (g/day)] × 1000',
      values: { note: 'Maximum daily dose not provided — ppm limit cannot be calculated' },
      result: 'N/A — provide maxDailyDoseG to calculate ppm limit',
    });
  }

  // Step 4: Multiple impurity consideration
  let multipleImpurityConsideration: string;
  if (numberOfMutagenicImpurities > 1) {
    multipleImpurityConsideration = `Multiple mutagenic impurities (${numberOfMutagenicImpurities} identified): ` +
      `ICH M7(R2) Section 7.3 states that "the total daily intake of all Class 2 and Class 3 mutagenic impurities should not exceed the TTC." ` +
      `Approach 1 (conservative): Divide the TTC equally among all mutagenic impurities — each impurity limited to ${Math.round((acceptableIntakeUgPerDay / numberOfMutagenicImpurities) * 1000) / 1000} μg/day. ` +
      `Approach 2 (risk-based): Use purge factor data and process understanding to demonstrate that the combined total of all mutagenic impurities does not exceed the TTC. ` +
      `Approach 3 (staged): Assign individual limits to each impurity based on likelihood of co-occurrence, with the sum not exceeding TTC. ` +
      `Document the approach in the ICH M7 risk assessment.`;
  } else {
    multipleImpurityConsideration = 'Single mutagenic impurity — full TTC allocation applies to this impurity.';
  }

  // Step 5: Oncology consideration
  let oncologyConsideration: string;
  if (isOncologyIndication) {
    oncologyConsideration = 'ONCOLOGY / ADVANCED CANCER INDICATION: ' +
      'ICH M7(R2) Section 8 and ICH S9 provide flexibility for oncology indications. ' +
      'For drugs treating advanced cancer with limited life expectancy, higher limits may be justified: ' +
      '(1) ICH M7 allows less-than-lifetime TTC adjustments based on actual treatment duration. ' +
      '(2) ICH S9 Section 4 notes that clinical benefit in life-threatening conditions can justify higher impurity limits. ' +
      '(3) A risk-benefit assessment may support limits exceeding the standard TTC when the drug provides significant clinical benefit in a serious condition. ' +
      '(4) Phase-appropriate limits: during early-phase oncology trials (Phase 1, 2), higher staging limits are generally accepted. ' +
      'Document the risk-benefit justification in the ICH M7 assessment.';
  } else {
    oncologyConsideration = 'Non-oncology indication — standard ICH M7(R2) TTC framework applies without oncology-specific flexibility.';
  }

  // LTL adjustment explanation
  const ltlAdjustment = compoundClass === 'CoC_nitrosamine'
    ? 'LTL adjustments generally NOT applied to nitrosamine compound-specific AIs per FDA 2021 Guidance.'
    : `Less-than-lifetime (LTL) TTC adjustments per ICH M7(R2) Table 2 applied for treatment duration: ${treatmentDuration}. ` +
      `Basis: cumulative dose and cancer risk are proportional to duration of exposure; shorter exposures proportionally reduce cumulative risk.`;

  // All duration limits for reference
  const allDurationLimits = Object.entries(LTL_TTC_TABLE).map(([dur, data]) => ({
    duration: data.description,
    ai_ug_per_day: data.ai_ug_per_day,
  }));

  // Analytical considerations
  const analyticalConsiderations = [
    `Analytical method LOQ must be ≤30% of the specification limit (e.g., for ${acceptableIntakeUgPerDay} μg/day AI, LOQ ≤ ${Math.round(acceptableIntakeUgPerDay * 0.3 * 1000) / 1000} μg/day equivalent)`,
    `For nitrosamines: LOQ requirement is ≤10% of AI per maximum daily dose — more stringent than standard mutagenic impurities`,
    'Method validation per ICH Q2(R2): specificity, LOQ, LOD, linearity, accuracy, precision, robustness',
    'GC-MS/MS or LC-MS/MS typically required for low ng/day-level nitrosamine limits',
    'HPLC-UV may be adequate for standard mutagenic impurities at ppm-level specification limits',
    concentrationLimitPpm !== null
      ? `Specification limit: ${concentrationLimitPpm} ppm in drug substance (based on MDD of ${maxDailyDoseG} g/day)`
      : 'Provide maximum daily dose to calculate the ppm specification limit',
  ];

  const regulatorySummary = `ACCEPTABLE INTAKE: ${acceptableIntakeUgPerDay} μg/day (${acceptableIntakeUgPerDay * 1000} ng/day)\n` +
    `DURATION: ${LTL_TTC_TABLE[treatmentDuration].description}\n` +
    `COMPOUND CLASS: ${compoundClass === 'not_coc' ? 'Standard (not Cohort of Concern)' : compoundClass}\n` +
    (concentrationLimitPpm !== null ? `CONCENTRATION LIMIT: ${concentrationLimitPpm} ppm (based on MDD ${maxDailyDoseG} g/day)\n` : '') +
    `ROUTE: ${route}\n` +
    `BASIS: ${calculationBasis}`;

  return {
    acceptableIntakeUgPerDay,
    acceptableIntakeNgPerDay: acceptableIntakeUgPerDay * 1000,
    concentrationLimitPpm,
    calculationBasis,
    durationCategory: LTL_TTC_TABLE[treatmentDuration].description,
    ltlAdjustment,
    cocConsiderations,
    multipleImpurityConsideration,
    oncologyConsideration,
    calculationSteps,
    allDurationLimits,
    analyticalConsiderations,
    regulatorySummary,
    citations: [CITATIONS.M7R2, CITATIONS.FDA_NITROSAMINE_2021, CITATIONS.EMA_NITROSAMINE_2023, CITATIONS.EMEA_SWP],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. (Q)SAR Structural Alert Assessment
// ─────────────────────────────────────────────────────────────────────────────

export interface StructuralAlertInput {
  functionalGroupsPresent: string[];
  knownStructuralAlerts?: string[];
  intendedQSARMethodology?: string[];
  expertReviewConducted?: boolean;
}

export interface StructuralAlertResult {
  identifiedAlerts: {
    alertCategory: string;
    description: string;
    mechanism: string;
    examples: string[];
    matched: boolean;
    matchedGroup?: string;
  }[];
  overallAssessment: 'positive' | 'negative' | 'conflicting' | 'inconclusive';
  assessmentDescription: string;
  requiredQSARSystems: {
    expertRuleBased: QSARSystem[];
    statisticalBased: QSARSystem[];
    minimumRequirement: string;
  };
  possibleOutcomes: {
    outcome: string;
    description: string;
    nextStep: string;
  }[];
  expertReviewRequirements: string[];
  documentationRequirements: string[];
  experimentalTestingTriggers: string[];
  regulatorySummary: string;
  citations: Citation[];
}

/**
 * Assess structural alerts and provide (Q)SAR guidance per ICH M7(R2).
 *
 * ICH M7(R2) Section 6 requires:
 *   - Two complementary (Q)SAR systems: one expert rule-based, one statistical-based
 *   - Expert review of conflicting/inconclusive/out-of-domain results
 *   - Documentation of negative predictions with adequate justification
 */
export function assessStructuralAlerts(params: StructuralAlertInput): StructuralAlertResult {
  const {
    functionalGroupsPresent,
    knownStructuralAlerts = [],
    intendedQSARMethodology = [],
    expertReviewConducted = false,
  } = params;

  // Identify matching structural alerts
  const lowerFGs = functionalGroupsPresent.map(fg => fg.toLowerCase());
  const lowerKnown = knownStructuralAlerts.map(a => a.toLowerCase());
  const allInputAlerts = [...lowerFGs, ...lowerKnown];

  const identifiedAlerts = Object.entries(STRUCTURAL_ALERT_CATEGORIES).map(([key, category]) => {
    const categoryTerms = key.toLowerCase().split('_');
    const matched = allInputAlerts.some(input => {
      const lowerInput = input.toLowerCase();
      // Match against category key terms
      if (categoryTerms.some(term => lowerInput.includes(term))) return true;
      // Match against example compound names
      if (category.examples.some(ex => lowerInput.includes(ex.toLowerCase()))) return true;
      // Match against description terms
      if (lowerInput.includes(category.description.toLowerCase().split(' ')[0])) return true;
      return false;
    });

    const matchedGroup = matched
      ? allInputAlerts.find(input => {
          const li = input.toLowerCase();
          return categoryTerms.some(t => li.includes(t)) ||
            category.examples.some(ex => li.includes(ex.toLowerCase()));
        })
      : undefined;

    return {
      alertCategory: key,
      description: category.description,
      mechanism: category.mutagenicity_mechanism,
      examples: category.examples,
      matched,
      matchedGroup,
    };
  });

  const anyAlertMatched = identifiedAlerts.some(a => a.matched);

  // Determine overall assessment
  let overallAssessment: StructuralAlertResult['overallAssessment'];
  let assessmentDescription: string;

  if (anyAlertMatched) {
    overallAssessment = 'positive';
    const matchedCategories = identifiedAlerts.filter(a => a.matched).map(a => a.description);
    assessmentDescription = `Structural alert assessment: POSITIVE. ${matchedCategories.length} alerting structure category(ies) identified: ${matchedCategories.join('; ')}. ` +
      `Per ICH M7(R2) Section 6, two complementary (Q)SAR systems must be applied. ` +
      `If both (Q)SAR systems predict the compound as mutagenic (positive), the compound is classified as Class 3 (requires TTC-based control or Ames test to reclassify). ` +
      `An Ames test (OECD TG 471) should be considered to resolve the classification.`;
  } else if (functionalGroupsPresent.length === 0 && knownStructuralAlerts.length === 0) {
    overallAssessment = 'inconclusive';
    assessmentDescription = 'No functional groups or structural alerts provided for assessment. A proper (Q)SAR evaluation requires the compound structure or at minimum the functional groups present. Provide the structure or functional group information for a complete assessment.';
  } else {
    overallAssessment = 'negative';
    assessmentDescription = `Structural alert assessment: NEGATIVE. None of the provided functional groups (${functionalGroupsPresent.join(', ')}) match known ICH M7 alerting structures. ` +
      `Per ICH M7(R2), if both complementary (Q)SAR systems predict the compound as non-mutagenic (negative) with adequate coverage of the chemical space, the compound may be classified as Class 5 without the need for an Ames test. ` +
      `Documentation of the (Q)SAR predictions, model applicability domain, and expert review is required.`;
  }

  // Required (Q)SAR systems
  const expertRuleBased = QSAR_SYSTEMS.filter(s => s.type === 'expert_rule_based');
  const statisticalBased = QSAR_SYSTEMS.filter(s => s.type === 'statistical_based');

  const requiredQSARSystems = {
    expertRuleBased,
    statisticalBased,
    minimumRequirement: 'ICH M7(R2) Section 6 requires a minimum of TWO complementary (Q)SAR methodologies: ' +
      '(1) one expert rule-based system (e.g., Derek Nexus, CASE Ultra Expert Alerts, Leadscope Expert Alerts) AND ' +
      '(2) one statistical-based system (e.g., Sarah Nexus, CASE Ultra Statistical Models, Leadscope Genetox Models). ' +
      'Both systems must have adequate coverage of the chemical space relevant to the query compound. ' +
      'If either system reports the compound as "out of domain" or "inconclusive," expert review and/or experimental testing is required.',
  };

  // Possible outcomes from (Q)SAR assessment
  const possibleOutcomes = [
    {
      outcome: 'Both systems predict NEGATIVE (non-mutagenic)',
      description: 'Both the expert rule-based and statistical-based systems predict the compound as non-mutagenic with adequate coverage and confidence.',
      nextStep: 'Classify as Class 5 (no structural alerts, no mutagenicity data needed). No Ames test required. Document (Q)SAR predictions, model versions, applicability domain assessment, and expert review in the ICH M7 assessment.',
    },
    {
      outcome: 'Both systems predict POSITIVE (mutagenic)',
      description: 'Both complementary systems identify alerting structures and predict bacterial mutagenicity.',
      nextStep: 'Classify as Class 3 (alerting structure, unconfirmed mutagenicity). Apply TTC-based limits OR conduct Ames test (OECD TG 471) to resolve: negative → Class 4, positive → Class 2.',
    },
    {
      outcome: 'CONFLICTING predictions (one positive, one negative)',
      description: 'The expert rule-based system and statistical-based system disagree on the mutagenicity prediction.',
      nextStep: 'Expert review REQUIRED per ICH M7(R2) Section 6.1. The expert should evaluate: (a) chemical plausibility of the alert, (b) metabolic activation potential, (c) structural analogues with Ames data, (d) mechanistic considerations. If expert review cannot resolve, conduct Ames test. Document the expert review rationale regardless of outcome.',
    },
    {
      outcome: 'INCONCLUSIVE / Out of domain',
      description: 'One or both (Q)SAR systems report the compound as outside their applicability domain or the prediction is equivocal.',
      nextStep: 'Expert review REQUIRED. If the compound falls outside the chemical space of both models, the (Q)SAR assessment is insufficient and an Ames test is required. If only one model is out of domain and the other predicts negative with high confidence, expert review may support a Class 5 classification with appropriate documentation.',
    },
  ];

  // Expert review requirements
  const expertReviewRequirements = [
    'Expert review is MANDATORY for conflicting or inconclusive (Q)SAR predictions per ICH M7(R2) Section 6.1',
    'The expert reviewer should have competence in genetic toxicology, medicinal chemistry, or computational toxicology',
    'Expert review should consider: (a) chemical plausibility of the alert, (b) similarity to known mutagens/non-mutagens with Ames data, (c) metabolic considerations (does the alert require metabolic activation? Is activation plausible?), (d) physicochemical properties (molecular weight, reactivity), (e) any available experimental data for closely related analogues',
    'The expert review opinion should be documented in writing with a clear conclusion and rationale',
    'Regulatory authorities may request the expert review documentation during NDA/MAA review',
    expertReviewConducted
      ? 'Expert review has been conducted — ensure documentation is complete and archived'
      : 'Expert review has NOT yet been conducted — if (Q)SAR results are conflicting or inconclusive, expert review must be performed before finalizing the classification',
  ];

  // Documentation requirements
  const documentationRequirements = [
    '(Q)SAR prediction results for BOTH complementary systems, including: model name and version, prediction outcome (positive/negative/inconclusive/out-of-domain), confidence score (if available), alerting structural features identified',
    'Applicability domain assessment — confirmation that the query compound is within the training set chemical space of both models',
    'Expert review report (if conducted) — reviewer qualifications, data considered, conclusion with rationale',
    'Structure of the query compound (or a description adequate for reproducibility of the (Q)SAR assessment)',
    'List of all structural alerts identified and their mechanistic plausibility',
    'Cross-reference to the ICH M7 impurity risk assessment document',
    'Record of the (Q)SAR software validation status (21 CFR Part 11 compliance if applicable)',
    'If negative prediction is used to classify as Class 5: explicit statement that both systems predicted negative with adequate coverage',
  ];

  // Triggers for experimental testing despite negative (Q)SAR
  const experimentalTestingTriggers = [
    'Conflicting (Q)SAR predictions that cannot be resolved by expert review',
    'Both (Q)SAR systems report the compound as out of applicability domain',
    'The compound is structurally similar to a known Ames-positive mutagen (close analogue with positive Ames data)',
    'Regulatory authority request during pre-IND meeting, NDA review, or deficiency letter',
    'The impurity is expected to be present at levels significantly above the TTC (i.e., high exposure risk)',
    'The compound belongs to a Cohort of Concern structural class (e.g., N-nitroso, aflatoxin-like)',
    'The compound is a degradation product that may form under storage conditions and accumulate over shelf life',
    'The (Q)SAR prediction was generated with an outdated model version (>5 years old) that may lack adequate training data',
    'Novel structural features not well-represented in (Q)SAR model training sets',
  ];

  const regulatorySummary = `STRUCTURAL ALERT ASSESSMENT: ${overallAssessment.toUpperCase()}\n` +
    `ALERTS IDENTIFIED: ${identifiedAlerts.filter(a => a.matched).length} of ${identifiedAlerts.length} categories\n` +
    `${anyAlertMatched ? 'MATCHED CATEGORIES: ' + identifiedAlerts.filter(a => a.matched).map(a => a.description).join('; ') + '\n' : ''}` +
    `(Q)SAR REQUIREMENT: Two complementary systems (1 expert rule-based + 1 statistical-based) per ICH M7(R2) Section 6\n` +
    `EXPERT REVIEW: ${expertReviewConducted ? 'Completed' : 'Required if results are conflicting/inconclusive'}`;

  return {
    identifiedAlerts,
    overallAssessment,
    assessmentDescription,
    requiredQSARSystems,
    possibleOutcomes,
    expertReviewRequirements,
    documentationRequirements,
    experimentalTestingTriggers,
    regulatorySummary,
    citations: [CITATIONS.M7R2, CITATIONS.ICH_S2R1],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Purge Factor Study Design
// ─────────────────────────────────────────────────────────────────────────────

export interface PurgeStudyInput {
  impurityBoilingPointC?: number;
  impuritySolubility?: string;
  impurityPKa?: number;
  impurityReactivity?: string;
  syntheticStep: SyntheticStep;
  reactionType?: string;
  temperatureC?: number;
  pH?: number;
  solvent?: string;
  workupType?: string;
  numberOfDownstreamSteps?: number;
  apiBoilingPointC?: number;
  apiSolubility?: string;
  apiPKa?: number;
}

export interface PurgeStudyResult {
  purgeFactorConcept: string;
  purgeMechanisms: {
    mechanism: string;
    description: string;
    estimatedScore: number;
    scoreJustification: string;
    applicability: string;
  }[];
  overallPurgeFactorEstimate: number;
  overallPurgeFactorInterpretation: string;
  scoringSystemDescription: string;
  scoringGuide: typeof PURGE_SCORING_GUIDE;
  cumulativePurgeRequirements: string;
  acceptablePurgeFactorGuidance: string[];
  documentationRequirements: string[];
  spikingStudyRecommendation: {
    recommended: boolean;
    rationale: string;
    designGuidelines: string[];
  };
  processOptimizationSuggestions: string[];
  regulatorySummary: string;
  citations: Citation[];
}

/**
 * Design a purge factor study for mutagenic impurity removal.
 *
 * Implements the Teasdale (2019) semiquantitative scoring approach:
 *   - Reactivity: 1 (unreactive) to 100 (completely destroyed)
 *   - Solubility: 1 (same as API) to 10 (very different)
 *   - Volatility: 1 (same as API) to 10 (easily removed)
 *   - Overall purge = product of individual mechanism scores per step
 */
export function designPurgeStudy(params: PurgeStudyInput): PurgeStudyResult {
  const {
    impurityBoilingPointC,
    impuritySolubility,
    impurityPKa,
    impurityReactivity,
    syntheticStep,
    reactionType,
    temperatureC,
    pH,
    solvent,
    workupType,
    numberOfDownstreamSteps = 0,
    apiBoilingPointC,
    apiSolubility,
    apiPKa,
  } = params;

  // Estimate individual purge scores
  const purgeMechanisms: PurgeStudyResult['purgeMechanisms'] = [];

  // 1. Reactivity purge
  let reactivityScore = 1;
  let reactivityJustification = 'Default: no reactivity information provided; assumed unreactive under process conditions';
  let reactivityApplicability = 'Applicable when impurity is chemically reactive under downstream process conditions (high temperature, extreme pH, nucleophilic/electrophilic conditions)';

  if (impurityReactivity) {
    const lowerReactivity = impurityReactivity.toLowerCase();
    if (lowerReactivity.includes('highly reactive') || lowerReactivity.includes('very reactive') || lowerReactivity.includes('unstable')) {
      reactivityScore = 100;
      reactivityJustification = `Impurity described as highly reactive ("${impurityReactivity}"). Expected to be completely destroyed under process conditions.`;
    } else if (lowerReactivity.includes('reactive') || lowerReactivity.includes('labile')) {
      reactivityScore = 10;
      reactivityJustification = `Impurity described as reactive ("${impurityReactivity}"). Significant degradation expected under process conditions.`;
    } else if (lowerReactivity.includes('moderate') || lowerReactivity.includes('somewhat')) {
      reactivityScore = 3;
      reactivityJustification = `Impurity has moderate reactivity ("${impurityReactivity}"). Partial degradation expected.`;
    } else if (lowerReactivity.includes('unreactive') || lowerReactivity.includes('stable') || lowerReactivity.includes('inert')) {
      reactivityScore = 1;
      reactivityJustification = `Impurity described as unreactive/stable ("${impurityReactivity}"). No degradation expected under process conditions.`;
    }
  }

  // Adjust reactivity based on temperature and pH if provided
  if (temperatureC && temperatureC > 100) {
    if (reactivityScore < 10) reactivityScore = Math.max(reactivityScore, 3);
    reactivityJustification += ` Process temperature (${temperatureC} °C) is elevated, which may promote thermal degradation.`;
  }
  if (pH !== undefined && (pH < 2 || pH > 12)) {
    if (reactivityScore < 10) reactivityScore = Math.max(reactivityScore, 3);
    reactivityJustification += ` Process pH (${pH}) is extreme, which may promote acid/base-catalyzed degradation.`;
  }

  purgeMechanisms.push({
    mechanism: 'Chemical Reactivity',
    description: 'Degradation or transformation of the impurity under process conditions (temperature, pH, reagents)',
    estimatedScore: reactivityScore,
    scoreJustification: reactivityJustification,
    applicability: reactivityApplicability,
  });

  // 2. Solubility / Partitioning purge
  let solubilityScore = 1;
  let solubilityJustification = 'Default: no solubility comparison available; assumed similar to API';
  const solubilityApplicability = 'Applicable during crystallization, extraction (aqueous wash), and precipitation steps';

  if (impuritySolubility && apiSolubility) {
    const impSol = impuritySolubility.toLowerCase();
    const apiSol = apiSolubility.toLowerCase();
    const impWaterSoluble = impSol.includes('water') || impSol.includes('aqueous') || impSol.includes('polar');
    const apiWaterSoluble = apiSol.includes('water') || apiSol.includes('aqueous') || apiSol.includes('polar');
    const impOrgSoluble = impSol.includes('organic') || impSol.includes('nonpolar') || impSol.includes('lipophilic');
    const apiOrgSoluble = apiSol.includes('organic') || apiSol.includes('nonpolar') || apiSol.includes('lipophilic');

    if ((impWaterSoluble && apiOrgSoluble) || (impOrgSoluble && apiWaterSoluble)) {
      solubilityScore = 10;
      solubilityJustification = `Impurity and API have very different solubility profiles (impurity: ${impuritySolubility}, API: ${apiSolubility}). Effective separation expected during extraction or crystallization.`;
    } else if (impSol !== apiSol) {
      solubilityScore = 3;
      solubilityJustification = `Impurity and API have moderately different solubility profiles (impurity: ${impuritySolubility}, API: ${apiSolubility}). Partial separation expected.`;
    } else {
      solubilityScore = 1;
      solubilityJustification = `Impurity and API have similar solubility profiles. Co-crystallization or co-extraction is likely.`;
    }
  }

  if (workupType) {
    const lowerWorkup = workupType.toLowerCase();
    if (lowerWorkup.includes('extraction') || lowerWorkup.includes('wash')) {
      if (solubilityScore < 3) solubilityScore = 3;
      solubilityJustification += ` Workup includes extraction/wash step ("${workupType}"), providing an opportunity for partitioning-based removal.`;
    }
    if (lowerWorkup.includes('crystallization') || lowerWorkup.includes('recrystallization')) {
      if (solubilityScore < 3) solubilityScore = 3;
      solubilityJustification += ` Workup includes crystallization step ("${workupType}"), providing purification opportunity.`;
    }
  }

  purgeMechanisms.push({
    mechanism: 'Solubility / Partitioning',
    description: 'Differential solubility between impurity and API exploited during extraction, crystallization, or precipitation',
    estimatedScore: solubilityScore,
    scoreJustification: solubilityJustification,
    applicability: solubilityApplicability,
  });

  // 3. Volatility purge
  let volatilityScore = 1;
  let volatilityJustification = 'Default: no volatility data available; assumed similar to API';
  const volatilityApplicability = 'Applicable during drying, distillation, vacuum operations, or rotary evaporation steps';

  if (impurityBoilingPointC !== undefined) {
    if (impurityBoilingPointC < 80) {
      volatilityScore = 10;
      volatilityJustification = `Impurity boiling point (${impurityBoilingPointC} °C) is very low — readily removed by drying or vacuum operations.`;
    } else if (impurityBoilingPointC < 150) {
      volatilityScore = 3;
      volatilityJustification = `Impurity boiling point (${impurityBoilingPointC} °C) is moderately low — partial removal during drying expected.`;
    } else {
      volatilityScore = 1;
      volatilityJustification = `Impurity boiling point (${impurityBoilingPointC} °C) is relatively high — not readily removed by volatilization.`;
    }

    if (apiBoilingPointC !== undefined) {
      const bpDiff = apiBoilingPointC - impurityBoilingPointC;
      if (bpDiff > 100) {
        volatilityScore = Math.max(volatilityScore, 10);
        volatilityJustification += ` Large boiling point difference from API (${bpDiff} °C) — excellent volatility-based purge expected.`;
      } else if (bpDiff > 50) {
        volatilityScore = Math.max(volatilityScore, 3);
        volatilityJustification += ` Moderate boiling point difference from API (${bpDiff} °C).`;
      }
    }
  }

  purgeMechanisms.push({
    mechanism: 'Volatility',
    description: 'Removal of impurity by evaporation during drying, distillation, or concentration under vacuum',
    estimatedScore: volatilityScore,
    scoreJustification: volatilityJustification,
    applicability: volatilityApplicability,
  });

  // 4. Ionizability / pKa purge
  let ionizabilityScore = 1;
  let ionizabilityJustification = 'Default: no pKa data available; assumed similar ionization to API';
  const ionizabilityApplicability = 'Applicable during pH-dependent extraction, ion-exchange purification, or salt formation steps';

  if (impurityPKa !== undefined && apiPKa !== undefined) {
    const pkaDiff = Math.abs(impurityPKa - apiPKa);
    if (pkaDiff > 4) {
      ionizabilityScore = 10;
      ionizabilityJustification = `Large pKa difference (${pkaDiff.toFixed(1)} units) between impurity (pKa ${impurityPKa}) and API (pKa ${apiPKa}). Excellent separation by pH-adjusted extraction or salt formation.`;
    } else if (pkaDiff > 2) {
      ionizabilityScore = 3;
      ionizabilityJustification = `Moderate pKa difference (${pkaDiff.toFixed(1)} units) between impurity (pKa ${impurityPKa}) and API (pKa ${apiPKa}). Partial separation by pH adjustment may be achievable.`;
    } else {
      ionizabilityScore = 1;
      ionizabilityJustification = `Small pKa difference (${pkaDiff.toFixed(1)} units) between impurity (pKa ${impurityPKa}) and API (pKa ${apiPKa}). Not effectively separated by ionization-based methods.`;
    }
  }

  purgeMechanisms.push({
    mechanism: 'Ionizability / pKa Difference',
    description: 'Differential ionization between impurity and API used in pH-dependent extraction or salt formation',
    estimatedScore: ionizabilityScore,
    scoreJustification: ionizabilityJustification,
    applicability: ionizabilityApplicability,
  });

  // Calculate overall purge factor for a single step
  const singleStepPurge = reactivityScore * solubilityScore * volatilityScore * ionizabilityScore;

  // Estimate cumulative purge considering downstream steps
  let overallPurgeFactorEstimate: number;
  if (numberOfDownstreamSteps > 0) {
    // Conservative estimate: each additional downstream step provides at minimum a 3× purge
    const downstreamPurgeEstimate = Math.pow(3, numberOfDownstreamSteps);
    overallPurgeFactorEstimate = singleStepPurge * downstreamPurgeEstimate;
  } else {
    overallPurgeFactorEstimate = singleStepPurge;
  }

  // Step position multiplier concept
  const stepPositionNote: Record<SyntheticStep, string> = {
    early: 'Impurity introduced early in synthesis — multiple downstream purification opportunities available. Higher cumulative purge factor expected.',
    intermediate: 'Impurity introduced at an intermediate step — moderate number of downstream purification opportunities available.',
    late: 'Impurity introduced late in synthesis — limited downstream purification opportunities. Purge factor may be insufficient without dedicated removal steps.',
    final: 'Impurity formed or introduced at the final step — no downstream purification opportunities. Control must rely on final-step process parameters or release testing.',
  };

  const overallPurgeFactorInterpretation = `Estimated cumulative purge factor: ${overallPurgeFactorEstimate.toLocaleString()}× ` +
    `(single-step purge: ${singleStepPurge}×${numberOfDownstreamSteps > 0 ? `, downstream steps estimate: ${Math.pow(3, numberOfDownstreamSteps)}×` : ''}). ` +
    `${stepPositionNote[syntheticStep]} ` +
    (overallPurgeFactorEstimate >= 10000
      ? 'Purge factor is HIGH (≥10,000×) — this level of purge may justify control at the step of introduction rather than final API testing, provided it is supported by spiking study data.'
      : overallPurgeFactorEstimate >= 100
        ? 'Purge factor is MODERATE (100-9,999×) — additional process controls or confirmation by spiking study may be needed to demonstrate adequate purge.'
        : 'Purge factor is LOW (<100×) — testing of the API for this impurity is recommended. Process optimization to enhance purge should be considered.');

  // Acceptable purge factor guidance
  const acceptablePurgeFactorGuidance = [
    'The acceptable purge factor depends on the impurity level at the point of introduction relative to the specification limit at the API stage',
    'Formula: Required purge factor = [impurity level at introduction (ppm)] / [specification limit at API (ppm)]',
    'Example: If an impurity is present at 10,000 ppm (1%) at step 3 and the API spec is 1 ppm, the required purge factor is 10,000×',
    'Purge factor >10,000× for early-stage impurities is generally considered sufficient to justify Option 4 control (no testing at API) — per Teasdale (2019)',
    'Purge factor 1,000-10,000× may support Option 3 control (testing at an intermediate) with regulatory justification',
    'Purge factor <1,000× generally requires Option 1 or 2 control (testing at API or late intermediate)',
    'For final-step impurities, purge factor arguments are generally not applicable — testing of the API is required unless process parameters demonstrably prevent formation',
    'Cumulative purge factors are calculated as the PRODUCT of individual step purge factors across all downstream steps',
  ];

  // Documentation requirements
  const documentationRequirements = [
    'Impurity identity (name, structure, CAS number if available, molecular weight)',
    'Physical properties used for purge assessment (boiling point, solubility, pKa, reactivity)',
    'Process description for each relevant downstream step (reaction conditions, workup, purification)',
    'Individual purge factor scores per mechanism per step with scientific justification',
    'Cumulative purge factor calculation with step-by-step buildup',
    'Comparison of cumulative purge factor to the required purge factor (based on introduction level and API spec)',
    'Spiking study data (if available) to validate the theoretical purge factor estimate',
    'Risk assessment conclusion: which control option (1-5) is justified based on the purge factor',
    'Cross-reference to the overall ICH M7 risk assessment and analytical method validation',
  ];

  // Spiking study recommendation
  const spikingRecommended = syntheticStep === 'late' || syntheticStep === 'final' || overallPurgeFactorEstimate < 1000;
  const spikingStudyRecommendation = {
    recommended: spikingRecommended || overallPurgeFactorEstimate < 10000,
    rationale: spikingRecommended
      ? `Spiking study RECOMMENDED: ${syntheticStep === 'final' ? 'final-step impurity with no downstream purification' : syntheticStep === 'late' ? 'late-stage impurity with limited downstream steps' : 'estimated purge factor is low (<1,000×)'}. Experimental validation is needed to confirm theoretical purge.`
      : `Spiking study recommended but may not be strictly necessary: estimated cumulative purge factor (${overallPurgeFactorEstimate.toLocaleString()}×) is relatively high. However, experimental confirmation strengthens the regulatory justification.`,
    designGuidelines: [
      'Spike the impurity at a known concentration (typically 10-100× the specification limit) at the step of introduction',
      'Process the spiked material through all downstream steps under representative manufacturing conditions',
      'Analyze the final API for the spiked impurity using a validated method with LOQ ≤30% of the specification limit',
      'Calculate the experimental purge factor: [spike level] / [level found in API]',
      'If the impurity is not detected in the API, report the purge factor as ">[spike level] / [LOQ]" (minimum demonstrated purge)',
      'Conduct spiking studies at representative scale (lab or pilot scale with justified scale-down model)',
      'Report spiking study results in the process development section (Module 3.2.S.2.6 or equivalent)',
    ],
  };

  // Process optimization suggestions
  const processOptimizationSuggestions: string[] = [];
  if (reactivityScore <= 3) {
    processOptimizationSuggestions.push('Consider process modifications to increase impurity degradation: higher temperature, extended reaction time, or addition of reagents that react with the impurity');
  }
  if (solubilityScore <= 3) {
    processOptimizationSuggestions.push('Consider adding an aqueous wash or extraction step to exploit differential solubility');
    processOptimizationSuggestions.push('Evaluate crystallization solvent systems to minimize impurity incorporation into API crystal lattice');
  }
  if (volatilityScore <= 3 && impurityBoilingPointC !== undefined && impurityBoilingPointC < 200) {
    processOptimizationSuggestions.push('Consider vacuum drying or extended drying at elevated temperature to remove volatile impurity');
  }
  if (syntheticStep === 'final' || syntheticStep === 'late') {
    processOptimizationSuggestions.push('Evaluate whether the impurity can be avoided by modifying final-step process parameters (e.g., lower temperature, different reagent, alternative solvent)');
    processOptimizationSuggestions.push('Consider adding a recrystallization step to the final API purification');
  }
  processOptimizationSuggestions.push('Evaluate activated carbon treatment for adsorption-based removal');
  processOptimizationSuggestions.push('Consider chromatographic purification (e.g., column chromatography, simulated moving bed) for difficult-to-purge impurities');

  const regulatorySummary = `PURGE FACTOR ASSESSMENT\n` +
    `Synthetic step: ${syntheticStep}\n` +
    `Estimated single-step purge: ${singleStepPurge}×\n` +
    `Estimated cumulative purge: ${overallPurgeFactorEstimate.toLocaleString()}×\n` +
    `Spiking study: ${spikingStudyRecommendation.recommended ? 'RECOMMENDED' : 'Optional (high theoretical purge)'}\n` +
    `Individual scores — Reactivity: ${reactivityScore}, Solubility: ${solubilityScore}, Volatility: ${volatilityScore}, Ionizability: ${ionizabilityScore}`;

  return {
    purgeFactorConcept: 'The purge factor represents the ratio of a mutagenic impurity concentration at the input of a process step to its concentration at the output. ' +
      'A purge factor >1 indicates net removal of the impurity. Purge occurs through four primary mechanisms: chemical reactivity (degradation under process conditions), ' +
      'differential solubility (partitioning during extraction or crystallization), volatility (evaporative removal during drying or distillation), and ionizability/size-based separation. ' +
      'The overall purge factor for a single step is the product of individual mechanism scores. The cumulative purge factor across multiple steps is the product of individual step purge factors. ' +
      'Per Teasdale (2019), the purge factor approach provides a semiquantitative framework for demonstrating that process-related mutagenic impurities are adequately controlled by the manufacturing process.',
    purgeMechanisms,
    overallPurgeFactorEstimate,
    overallPurgeFactorInterpretation,
    scoringSystemDescription: 'Scoring system per Teasdale A. et al., Org. Process Res. Dev. 2019, 23, 961-970. ' +
      'Each purge mechanism is scored on a scale: Reactivity (1 = unreactive, 3 = somewhat reactive, 10 = reactive, 100 = highly reactive/completely destroyed); ' +
      'Solubility (1 = similar to API, 3 = moderately different, 10 = very different); ' +
      'Volatility (1 = similar to API, 3 = moderately volatile, 10 = very volatile/easily removed); ' +
      'Ionizability (1 = similar pKa, 3 = moderately different pKa, 10 = very different pKa). ' +
      'Overall purge per step = product of all mechanism scores.',
    scoringGuide: PURGE_SCORING_GUIDE,
    cumulativePurgeRequirements: 'Cumulative purge = product of individual step purge factors across all downstream steps from the point of impurity introduction to the final API. ' +
      'Required purge factor = [impurity level at introduction] / [specification limit at API]. ' +
      'The calculated cumulative purge must equal or exceed the required purge factor to justify the chosen control strategy.',
    acceptablePurgeFactorGuidance,
    documentationRequirements,
    spikingStudyRecommendation,
    processOptimizationSuggestions,
    regulatorySummary,
    citations: [CITATIONS.M7R2, CITATIONS.TEASDALE_2019, CITATIONS.Q3A_R2],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Nitrosamine Risk Assessment
// ─────────────────────────────────────────────────────────────────────────────

export interface NitrosamineRiskInput {
  drugSubstanceContainsAmines: boolean;
  amineType?: 'primary' | 'secondary' | 'tertiary' | 'none';
  nitriteReagentsUsed: boolean;
  specificNitriteReagents?: string[];
  synthesisUsesNitrosatingConditions: boolean;
  sharedEquipment: boolean;
  packagingContainsRubber: boolean;
  excipientsConcern?: string[];
  drugSubstanceDegradationRisk?: boolean;
  apiStructureDescription?: string;
  maxDailyDoseG?: number;
}

export interface NitrosamineRiskResult {
  overallRiskLevel: NitrosamineRiskLevel;
  riskAssessmentSteps: {
    step: number;
    title: string;
    description: string;
    finding: string;
    riskContribution: NitrosamineRiskLevel;
  }[];
  rootCauses: {
    rootCause: string;
    description: string;
    identified: boolean;
    mitigationStrategy: string;
  }[];
  commonNitrosamines: {
    abbreviation: string;
    name: string;
    ai_ng_per_day: number;
    commonSources: string[];
  }[];
  analyticalMethodRequirements: {
    technique: string;
    description: string;
    typicalLOQ: string;
    applicability: string;
  }[];
  regulatoryTimelines: {
    agency: string;
    requirement: string;
    deadline: string;
    details: string;
  }[];
  confirmationTestingRequirements: string[];
  regulatorySummary: string;
  citations: Citation[];
}

/**
 * Assess nitrosamine impurity risk per FDA 2021 and EMA 2023 guidances.
 *
 * Three-step risk assessment:
 *   Step 1: Identify root cause potential (vulnerable amines, nitrosating agents/conditions)
 *   Step 2: Risk ranking (high/medium/low)
 *   Step 3: Confirmatory testing requirements
 */
export function assessNitrosamineRisk(params: NitrosamineRiskInput): NitrosamineRiskResult {
  const {
    drugSubstanceContainsAmines,
    amineType = 'none',
    nitriteReagentsUsed,
    specificNitriteReagents = [],
    synthesisUsesNitrosatingConditions,
    sharedEquipment,
    packagingContainsRubber,
    excipientsConcern = [],
    drugSubstanceDegradationRisk = false,
    maxDailyDoseG,
  } = params;

  const riskAssessmentSteps: NitrosamineRiskResult['riskAssessmentSteps'] = [];

  // Step 1: Identify vulnerable amines
  let amineRisk: NitrosamineRiskLevel = 'no_risk';
  if (drugSubstanceContainsAmines && (amineType === 'secondary' || amineType === 'tertiary')) {
    amineRisk = amineType === 'secondary' ? 'high' : 'medium';
    riskAssessmentSteps.push({
      step: 1,
      title: 'Vulnerable Amine Assessment',
      description: 'Evaluate whether the drug substance or intermediates contain amine functionalities susceptible to nitrosation',
      finding: `Drug substance contains ${amineType} amine(s). ${amineType === 'secondary' ? 'Secondary amines are the most susceptible to N-nitrosamine formation (reaction with nitrous acid or nitrosating agents yields N-nitrosamines directly).' : 'Tertiary amines can undergo dealkylation to secondary amines under certain conditions, or form N-nitroso compounds via indirect mechanisms.'}`,
      riskContribution: amineRisk,
    });
  } else if (drugSubstanceContainsAmines && amineType === 'primary') {
    amineRisk = 'low';
    riskAssessmentSteps.push({
      step: 1,
      title: 'Vulnerable Amine Assessment',
      description: 'Evaluate whether the drug substance or intermediates contain amine functionalities susceptible to nitrosation',
      finding: 'Drug substance contains primary amine(s). Primary amines react with nitrous acid to form diazo compounds (not N-nitrosamines) via deamination. Risk of N-nitrosamine formation from primary amines is low, but diazo intermediates may have their own mutagenic potential.',
      riskContribution: 'low',
    });
  } else {
    riskAssessmentSteps.push({
      step: 1,
      title: 'Vulnerable Amine Assessment',
      description: 'Evaluate whether the drug substance or intermediates contain amine functionalities susceptible to nitrosation',
      finding: 'No amine functionalities identified in the drug substance. Primary root cause of N-nitrosamine formation (amine + nitrosating agent) is absent in the API structure.',
      riskContribution: 'no_risk',
    });
  }

  // Step 2: Identify nitrosating agents / conditions
  let nitrosatingRisk: NitrosamineRiskLevel = 'no_risk';
  if (nitriteReagentsUsed) {
    nitrosatingRisk = 'high';
    riskAssessmentSteps.push({
      step: 2,
      title: 'Nitrosating Agent / Conditions Assessment',
      description: 'Evaluate the presence of nitrite reagents, nitrosating conditions, or other sources of nitrosating species in the manufacturing process',
      finding: `Nitrite reagents used in synthesis${specificNitriteReagents.length > 0 ? ` (${specificNitriteReagents.join(', ')})` : ''}. Direct use of nitrite reagents (e.g., sodium nitrite, nitrous acid) is the highest risk factor for N-nitrosamine formation. Even if the nitrosation step is separated from amine-containing intermediates by multiple synthetic steps, cross-contamination and carryover of trace nitrite must be evaluated.`,
      riskContribution: 'high',
    });
  } else if (synthesisUsesNitrosatingConditions) {
    nitrosatingRisk = 'medium';
    riskAssessmentSteps.push({
      step: 2,
      title: 'Nitrosating Agent / Conditions Assessment',
      description: 'Evaluate the presence of nitrite reagents, nitrosating conditions, or other sources of nitrosating species in the manufacturing process',
      finding: 'Process uses conditions that may generate nitrosating species in situ (e.g., acidic conditions with trace nitrite from water or reagents, use of nitrogen oxides, reductive amination conditions that may generate trace nitrous acid). Risk is moderate — depends on the specific conditions and concentration of potential nitrosating species.',
      riskContribution: 'medium',
    });
  } else {
    riskAssessmentSteps.push({
      step: 2,
      title: 'Nitrosating Agent / Conditions Assessment',
      description: 'Evaluate the presence of nitrite reagents, nitrosating conditions, or other sources of nitrosating species in the manufacturing process',
      finding: 'No nitrite reagents or known nitrosating conditions identified in the manufacturing process. This significantly reduces the risk of process-related N-nitrosamine formation.',
      riskContribution: 'no_risk',
    });
  }

  // Step 3: Cross-contamination and packaging risks
  let crossContaminationRisk: NitrosamineRiskLevel = 'no_risk';
  const crossContaminationFindings: string[] = [];

  if (sharedEquipment) {
    crossContaminationRisk = 'medium';
    crossContaminationFindings.push('Shared manufacturing equipment: risk of cross-contamination with nitrite-containing processes or N-nitrosamine-containing products manufactured on the same equipment. Dedicated equipment or validated cleaning procedures with nitrosamine-specific limits are required.');
  }

  if (packagingContainsRubber) {
    crossContaminationRisk = crossContaminationRisk === 'medium' ? 'high' : 'medium';
    crossContaminationFindings.push('Rubber components in packaging (gaskets, stoppers, seals): natural and synthetic rubber may contain N-nitrosodimethylamine (NDMA) and other volatile nitrosamines leached from vulcanization accelerators. Evaluate extractables/leachables data for rubber components in contact with the drug product.');
  }

  if (excipientsConcern.length > 0) {
    crossContaminationRisk = crossContaminationRisk === 'no_risk' ? 'low' : crossContaminationRisk;
    crossContaminationFindings.push(`Excipient concerns identified (${excipientsConcern.join(', ')}): some excipients may contain trace nitrite (e.g., sodium starch glycolate, povidone, croscarmellose sodium) or amines that could participate in nitrosamine formation during drug product manufacturing or storage.`);
  }

  if (drugSubstanceDegradationRisk) {
    crossContaminationRisk = crossContaminationRisk === 'no_risk' ? 'medium' : crossContaminationRisk;
    crossContaminationFindings.push('Drug substance degradation risk identified: the drug substance or its degradation products may form nitrosamine-like compounds under stress conditions (heat, light, oxidative stress). Evaluate forced degradation study results for N-nitroso compound formation.');
  }

  if (crossContaminationFindings.length > 0) {
    riskAssessmentSteps.push({
      step: 3,
      title: 'Cross-Contamination, Packaging, and Degradation Risk',
      description: 'Evaluate risks from shared equipment, packaging materials, excipients, and degradation pathways',
      finding: crossContaminationFindings.join(' '),
      riskContribution: crossContaminationRisk,
    });
  } else {
    riskAssessmentSteps.push({
      step: 3,
      title: 'Cross-Contamination, Packaging, and Degradation Risk',
      description: 'Evaluate risks from shared equipment, packaging materials, excipients, and degradation pathways',
      finding: 'No shared equipment, rubber packaging components, excipient concerns, or degradation risks identified. Cross-contamination risk is low.',
      riskContribution: 'no_risk',
    });
  }

  // Determine overall risk level
  const riskLevels: NitrosamineRiskLevel[] = [amineRisk, nitrosatingRisk, crossContaminationRisk];
  let overallRiskLevel: NitrosamineRiskLevel;
  if (riskLevels.includes('high') && riskLevels.filter(r => r === 'high' || r === 'medium').length >= 2) {
    overallRiskLevel = 'high';
  } else if (riskLevels.includes('high')) {
    overallRiskLevel = 'medium';
  } else if (riskLevels.filter(r => r === 'medium').length >= 2) {
    overallRiskLevel = 'medium';
  } else if (riskLevels.includes('medium')) {
    overallRiskLevel = 'low';
  } else if (riskLevels.includes('low')) {
    overallRiskLevel = 'low';
  } else {
    overallRiskLevel = 'no_risk';
  }

  // Combine amine + nitrosating agent risk (both needed for formation)
  if (amineRisk !== 'no_risk' && nitrosatingRisk !== 'no_risk') {
    overallRiskLevel = 'high';
  }

  // Root causes
  const rootCauses: NitrosamineRiskResult['rootCauses'] = [
    {
      rootCause: 'Sodium nitrite or nitrous acid in synthesis',
      description: 'Direct use of sodium nitrite (NaNO2), nitrous acid (HNO2), or other nitrosating reagents (e.g., NOBF4, tert-butyl nitrite) in the API synthesis. This is the most common root cause identified in FDA recalls (valsartan, ranitidine).',
      identified: nitriteReagentsUsed,
      mitigationStrategy: 'Substitute alternative reagents when possible. If nitrite must be used, ensure it is consumed completely, add quenching agents (e.g., sulfamic acid, ammonium sulfamate), validate purge across downstream steps, and test for specific nitrosamines in API.',
    },
    {
      rootCause: 'Cross-contamination from shared equipment',
      description: 'N-Nitrosamines or nitrite-containing residues from other products manufactured on shared equipment. Particularly relevant in contract manufacturing facilities.',
      identified: sharedEquipment,
      mitigationStrategy: 'Implement dedicated equipment lines for products at risk. Validate cleaning procedures with nitrosamine-specific swab limits. Consider campaign manufacturing separation.',
    },
    {
      rootCause: 'Degradation of nitrosamide impurities',
      description: 'Some drug substances or process intermediates contain N-nitroso groups that can generate nitrosamines upon degradation or metabolism.',
      identified: drugSubstanceDegradationRisk,
      mitigationStrategy: 'Conduct forced degradation studies under ICH Q1A conditions with specific nitrosamine analysis. If degradation generates nitrosamines, establish shelf-life specifications and storage conditions to minimize formation.',
    },
    {
      rootCause: 'Interaction of nitrite impurity with secondary amines',
      description: 'Trace-level nitrite impurities in reagents, solvents, or water supplies reacting with secondary amine functionalities in the drug substance or intermediates during manufacturing or storage.',
      identified: drugSubstanceContainsAmines && (amineType === 'secondary'),
      mitigationStrategy: 'Specify nitrite limits in incoming raw materials (water, solvents, excipients). Avoid acidic conditions that promote nitrosation. Control process pH to minimize nitrosating conditions.',
    },
    {
      rootCause: 'Rubber gaskets, stoppers, and closures',
      description: 'Vulcanization accelerators (e.g., tetramethylthiuram disulfide, morpholine derivatives) in rubber components can release NDMA and other volatile nitrosamines into the drug product during storage.',
      identified: packagingContainsRubber,
      mitigationStrategy: 'Use nitrosamine-free elastomeric components (e.g., synthetic rubber formulations without amine-based vulcanization accelerators). Conduct extractables/leachables studies specific to nitrosamines. Consider fluoropolymer-coated stoppers or glass-only packaging.',
    },
    {
      rootCause: 'Excipient-drug interaction during product storage',
      description: 'Certain excipients (e.g., sodium starch glycolate, carboxymethyl cellulose) may contain trace nitrite that reacts with amine-containing drug substances during drug product shelf life, especially under elevated temperature and humidity.',
      identified: excipientsConcern.length > 0,
      mitigationStrategy: 'Specify nitrite limits in excipient specifications. Evaluate drug-excipient compatibility with nitrosamine-specific endpoints. Consider packaging with desiccant or nitrogen headspace to minimize oxidative formation pathways.',
    },
  ];

  // Common nitrosamines reference table
  const commonNitrosamines = [
    {
      abbreviation: 'NDMA',
      name: NITROSAMINE_SPECIFIC_AI.NDMA.name,
      ai_ng_per_day: NITROSAMINE_SPECIFIC_AI.NDMA.ai_ng_per_day,
      commonSources: ['Sodium nitrite + dimethylamine', 'Rubber stoppers (vulcanization)', 'Water treatment (chloramine + dimethylamine)', 'Valsartan synthesis (DMF + NaNO2)'],
    },
    {
      abbreviation: 'NDEA',
      name: NITROSAMINE_SPECIFIC_AI.NDEA.name,
      ai_ng_per_day: NITROSAMINE_SPECIFIC_AI.NDEA.ai_ng_per_day,
      commonSources: ['Sodium nitrite + diethylamine', 'Losartan and other sartan synthesis processes', 'Triethylamine reagent degradation'],
    },
    {
      abbreviation: 'NMBA',
      name: NITROSAMINE_SPECIFIC_AI.NMBA.name,
      ai_ng_per_day: NITROSAMINE_SPECIFIC_AI.NMBA.ai_ng_per_day,
      commonSources: ['Nitrosation of 4-methyl-4-aminobutyric acid', 'Related to gabapentin synthesis'],
    },
    {
      abbreviation: 'NIPEA',
      name: NITROSAMINE_SPECIFIC_AI.NIPEA.name,
      ai_ng_per_day: NITROSAMINE_SPECIFIC_AI.NIPEA.ai_ng_per_day,
      commonSources: ['Nitrosation of isopropylethylamine', 'Diisopropylethylamine (Hunig base) + nitrite'],
    },
    {
      abbreviation: 'NDIPA',
      name: NITROSAMINE_SPECIFIC_AI.NDIPA.name,
      ai_ng_per_day: NITROSAMINE_SPECIFIC_AI.NDIPA.ai_ng_per_day,
      commonSources: ['Nitrosation of diisopropylamine', 'Degradation of DIPA-containing intermediates'],
    },
    {
      abbreviation: 'NMOR',
      name: NITROSAMINE_SPECIFIC_AI.NMOR.name,
      ai_ng_per_day: NITROSAMINE_SPECIFIC_AI.NMOR.ai_ng_per_day,
      commonSources: ['Nitrosation of morpholine', 'Rubber accelerator degradation (morpholine-based accelerators)'],
    },
    {
      abbreviation: 'Default',
      name: NITROSAMINE_SPECIFIC_AI.DEFAULT.name,
      ai_ng_per_day: NITROSAMINE_SPECIFIC_AI.DEFAULT.ai_ng_per_day,
      commonSources: ['Applied when no compound-specific carcinogenicity data available'],
    },
  ];

  // Analytical method requirements
  const analyticalMethodRequirements = [
    {
      technique: 'GC-MS/MS (Gas Chromatography - Tandem Mass Spectrometry)',
      description: 'Preferred method for volatile nitrosamines (NDMA, NDEA, NMBA, NIPEA). Thermal desorption or headspace injection for enhanced sensitivity.',
      typicalLOQ: '1-10 ng/g (ppb level) in drug substance',
      applicability: 'Volatile and semi-volatile N-nitrosamines. Excellent sensitivity for small alkyl nitrosamines.',
    },
    {
      technique: 'LC-MS/MS (Liquid Chromatography - Tandem Mass Spectrometry)',
      description: 'Preferred for non-volatile or thermally labile nitrosamines. Electrospray ionization (ESI) or atmospheric pressure chemical ionization (APCI).',
      typicalLOQ: '2-20 ng/g (ppb level) in drug substance',
      applicability: 'Non-volatile nitrosamines, drug substance-related nitrosamines (e.g., N-nitroso impurities of amine-containing APIs). Wider applicability than GC-MS/MS.',
    },
    {
      technique: 'GC-TEA (Gas Chromatography - Thermal Energy Analyzer)',
      description: 'Selective detector for N-nitroso compounds. High specificity for N-N=O bond. Used as a confirmatory technique.',
      typicalLOQ: '10-50 ng/g in drug substance',
      applicability: 'Confirmatory analysis and screening for total N-nitroso compounds. Less common in routine testing but useful for unknown nitrosamine screening.',
    },
    {
      technique: 'HPLC-UV (for screening)',
      description: 'UV detection at 230-240 nm for screening. Generally insufficient sensitivity for ng/day-level nitrosamine limits but can be used for higher-level process intermediates.',
      typicalLOQ: '0.1-1 μg/g (ppm level)',
      applicability: 'Screening or limit tests for higher-concentration mutagenic impurities. NOT suitable for trace-level nitrosamine quantitation at ng/day limits.',
    },
  ];

  // Regulatory timelines
  const regulatoryTimelines = [
    {
      agency: 'FDA',
      requirement: 'Risk assessment completion for marketed products',
      deadline: 'Completed (original deadline March 2021, extended timelines per FDA guidance)',
      details: 'All MAHs must have completed nitrosamine risk assessments for marketed drug products per FDA September 2020 Guidance. Confirmatory testing required if risk assessment identifies potential for nitrosamine presence.',
    },
    {
      agency: 'FDA',
      requirement: 'Confirmatory testing and reporting',
      deadline: 'Within 6 months of risk assessment completion',
      details: 'If risk assessment identifies a potential for nitrosamine formation or presence, confirmatory testing with validated methods must be conducted. Results above AI require immediate notification to FDA via Field Alert Report (FAR) or equivalent.',
    },
    {
      agency: 'EMA',
      requirement: 'Step 1 risk evaluation (Article 5(3) referral)',
      deadline: 'Completed (September 2023 deadline for all marketing authorization holders)',
      details: 'All MAHs must have completed Step 1 risk evaluation per EMA/409815/2020. Step 2 (confirmatory testing) and Step 3 (variation submission) follow sequentially.',
    },
    {
      agency: 'EMA',
      requirement: 'Step 2 confirmatory testing',
      deadline: '3 years from Step 1 completion (product-dependent)',
      details: 'Confirmatory testing using validated GC-MS/MS or LC-MS/MS methods. Results must be compared against compound-specific AIs. Sharing of positive results across the supply chain is required.',
    },
    {
      agency: 'EMA',
      requirement: 'Step 3 variation submission if nitrosamines detected above AI',
      deadline: 'Within 6 months of confirmed positive results',
      details: 'If confirmatory testing identifies nitrosamines above AI: submit a Type II variation with root cause, mitigation strategy, updated specifications, and analytical methods.',
    },
    {
      agency: 'Health Canada',
      requirement: 'Risk assessment and testing for all marketed products',
      deadline: 'Aligned with FDA/EMA timelines — ongoing',
      details: 'Health Canada requires risk assessment consistent with FDA/EMA guidance. Notification required if nitrosamines detected above acceptable limits.',
    },
  ];

  // Confirmation testing requirements
  const confirmationTestingRequirements: string[] = [];
  if (overallRiskLevel === 'high') {
    confirmationTestingRequirements.push(
      'IMMEDIATE confirmatory testing required — high risk of nitrosamine formation identified',
      'Test at least 3 batches of drug substance and drug product using validated GC-MS/MS or LC-MS/MS method',
      'LOQ must be ≤10% of the applicable AI divided by the maximum daily dose',
      'Include all identified potential nitrosamines in the test panel',
      'If nitrosamines detected above AI: immediate notification to regulatory authorities (FDA Field Alert Report, EMA rapid alert)',
      'Develop and validate root cause elimination strategy and updated control strategy',
    );
  } else if (overallRiskLevel === 'medium') {
    confirmationTestingRequirements.push(
      'Confirmatory testing recommended within 6 months',
      'Test at least 2 batches of drug substance using validated analytical method',
      'LOQ must be ≤10% of the applicable AI divided by the maximum daily dose',
      'If results are negative (below LOQ), document in the risk assessment and monitor periodically',
      'If results are positive: escalate to high-risk protocol with immediate regulatory notification',
    );
  } else if (overallRiskLevel === 'low') {
    confirmationTestingRequirements.push(
      'Confirmatory testing is recommended but may be risk-justified to defer',
      'At minimum, test 1 batch of drug substance with a validated screening method',
      'Document the risk assessment conclusion and basis for the low-risk determination',
      'Re-evaluate the risk assessment if any process changes occur',
    );
  } else {
    confirmationTestingRequirements.push(
      'No confirmatory testing required based on the current risk assessment',
      'The risk assessment should be documented and maintained per ICH M7(R2) lifecycle requirements',
      'Re-evaluate if process changes occur (new reagents, new equipment, new route of synthesis)',
    );
  }

  if (maxDailyDoseG) {
    const defaultAI = NITROSAMINE_SPECIFIC_AI.DEFAULT.ai_ng_per_day;
    const loqTarget = (defaultAI / maxDailyDoseG) * 0.1;
    confirmationTestingRequirements.push(
      `For MDD of ${maxDailyDoseG} g/day and default AI of ${defaultAI} ng/day: target LOQ ≤ ${loqTarget.toFixed(1)} ng/g (ppb) in drug substance`,
    );
  }

  const regulatorySummary = `NITROSAMINE RISK ASSESSMENT\n` +
    `Overall risk level: ${overallRiskLevel.toUpperCase()}\n` +
    `Amine risk: ${amineRisk}${drugSubstanceContainsAmines ? ` (${amineType} amine)` : ' (no amines)'}\n` +
    `Nitrosating agent risk: ${nitrosatingRisk}\n` +
    `Cross-contamination/packaging risk: ${crossContaminationRisk}\n` +
    `Root causes identified: ${rootCauses.filter(r => r.identified).length} of ${rootCauses.length}\n` +
    `Confirmatory testing: ${overallRiskLevel === 'high' ? 'IMMEDIATELY REQUIRED' : overallRiskLevel === 'medium' ? 'Recommended within 6 months' : overallRiskLevel === 'low' ? 'Recommended' : 'Not required'}`;

  return {
    overallRiskLevel,
    riskAssessmentSteps,
    rootCauses,
    commonNitrosamines,
    analyticalMethodRequirements,
    regulatoryTimelines,
    confirmationTestingRequirements,
    regulatorySummary,
    citations: [CITATIONS.FDA_NITROSAMINE_2021, CITATIONS.EMA_NITROSAMINE_2023, CITATIONS.M7R2, CITATIONS.EMA_NITROSAMINE_STEP5],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Control Strategy Design
// ─────────────────────────────────────────────────────────────────────────────

export interface ControlStrategyInput {
  impurityClass: ImpurityClass;
  drugProductType: string;
  maxDailyDoseG: number;
  treatmentDuration: TreatmentDuration;
  developmentPhase: DevelopmentPhase;
  purgeFactorAvailable?: boolean;
  purgeFactorValue?: number;
  numberOfDownstreamSteps?: number;
  compoundClass?: CohortOfConcern;
  nitrosamineIdentity?: string;
  analyticalMethodValidated?: boolean;
}

export interface ControlStrategyResult {
  recommendedOption: number;
  optionName: string;
  optionDescription: string;
  allOptions: {
    option: number;
    name: string;
    description: string;
    applicable: boolean;
    applicabilityReason: string;
    requirements: string[];
  }[];
  specificationLimit: {
    ai_ug_per_day: number;
    concentrationLimitPpm: number;
    basis: string;
  };
  phaseSpecificConsiderations: {
    phase: string;
    description: string;
    limits: string;
    documentation: string;
  };
  analyticalMethodRequirements: string[];
  releaseVsShelfLife: {
    releaseTestingRequired: boolean;
    shelfLifeTestingRequired: boolean;
    rationale: string;
  };
  changeControlRequirements: string[];
  regulatorySummary: string;
  citations: Citation[];
}

/**
 * Design a control strategy for a mutagenic impurity.
 *
 * ICH M7(R2) Section 8 control options:
 *   Option 1: Test DS with acceptance criterion at TTC limit
 *   Option 2: Test intermediate with acceptance criterion at TTC limit
 *   Option 3: Test DS at higher limit (purge factor justified)
 *   Option 4: No test — validated purge through process parameters
 *   Option 5: No controls (Class 4 or 5 — non-mutagenic)
 */
export function controlMutagenicImpurity(params: ControlStrategyInput): ControlStrategyResult {
  const {
    impurityClass,
    drugProductType,
    maxDailyDoseG,
    treatmentDuration,
    developmentPhase,
    purgeFactorAvailable = false,
    purgeFactorValue = 0,
    numberOfDownstreamSteps = 0,
    compoundClass = 'not_coc',
    nitrosamineIdentity,
    analyticalMethodValidated = false,
  } = params;

  // Calculate specification limit
  let aiUgPerDay: number;
  if (compoundClass === 'CoC_nitrosamine') {
    const specificAI = nitrosamineIdentity
      ? NITROSAMINE_SPECIFIC_AI[nitrosamineIdentity.toUpperCase()] || NITROSAMINE_SPECIFIC_AI.DEFAULT
      : NITROSAMINE_SPECIFIC_AI.DEFAULT;
    aiUgPerDay = specificAI.ai_ng_per_day / 1000;
  } else if (compoundClass === 'CoC_aflatoxin_like') {
    aiUgPerDay = COC_LIMITS.CoC_aflatoxin_like.ai_ug_per_day;
  } else {
    aiUgPerDay = LTL_TTC_TABLE[treatmentDuration].ai_ug_per_day;
  }

  const concentrationLimitPpm = Math.round(((aiUgPerDay / maxDailyDoseG) * 1000) * 100) / 100;

  const specificationLimit = {
    ai_ug_per_day: aiUgPerDay,
    concentrationLimitPpm,
    basis: compoundClass === 'CoC_nitrosamine'
      ? `Nitrosamine-specific AI (${nitrosamineIdentity || 'default'}: ${aiUgPerDay * 1000} ng/day)`
      : compoundClass === 'CoC_aflatoxin_like'
        ? `Aflatoxin-like CoC limit (0.15 μg/day)`
        : `LTL-TTC per ICH M7(R2) Table 2 for ${LTL_TTC_TABLE[treatmentDuration].description}: ${aiUgPerDay} μg/day`,
  };

  // Define all control options
  const allOptions: ControlStrategyResult['allOptions'] = [
    {
      option: 1,
      name: 'Option 1: Test drug substance with acceptance criterion at TTC-derived limit',
      description: 'Release testing of the drug substance (API) for the mutagenic impurity with an acceptance criterion set at the TTC-derived concentration limit. This is the most conservative and straightforward approach.',
      applicable: impurityClass <= 3,
      applicabilityReason: impurityClass <= 3
        ? `Applicable for Class ${impurityClass} impurity. This is the default control strategy for mutagenic impurities when no purge factor data is available.`
        : `Not applicable — Class ${impurityClass} impurity does not require mutagenic impurity controls.`,
      requirements: [
        `Specification limit: ${concentrationLimitPpm} ppm (NMT ${concentrationLimitPpm} ppm) in drug substance`,
        `Based on AI of ${aiUgPerDay} μg/day and MDD of ${maxDailyDoseG} g/day`,
        'Validated analytical method with LOQ ≤30% of specification limit',
        `Required LOQ: ≤${Math.round(concentrationLimitPpm * 0.3 * 100) / 100} ppm`,
        'Method must be validated per ICH Q2(R2): specificity, LOQ, LOD, linearity, accuracy, precision',
        'Include in drug substance release specification (Module 3.2.S.4.1)',
        'Include in stability specification if degradation product (Module 3.2.S.7.1)',
      ],
    },
    {
      option: 2,
      name: 'Option 2: Test intermediate with acceptance criterion at TTC-derived limit',
      description: 'Release testing of a process intermediate for the mutagenic impurity, with the acceptance criterion set such that the TTC-derived limit would be met at the drug substance stage considering known purge from subsequent steps.',
      applicable: impurityClass <= 3 && numberOfDownstreamSteps >= 1,
      applicabilityReason: impurityClass <= 3 && numberOfDownstreamSteps >= 1
        ? `Applicable for Class ${impurityClass} impurity with ${numberOfDownstreamSteps} downstream step(s). Testing at an earlier intermediate reduces analytical complexity for the final API.`
        : impurityClass > 3
          ? `Not applicable — Class ${impurityClass} impurity does not require mutagenic impurity controls.`
          : 'Not applicable — no downstream steps available for intermediate testing.',
      requirements: [
        `Intermediate specification limit must account for known purge to API: intermediate limit = API limit × purge factor from intermediate to API`,
        `API-equivalent specification: ${concentrationLimitPpm} ppm`,
        'Demonstrate correlation between intermediate test result and API quality through process development data or spiking studies',
        'Validated analytical method at the intermediate stage',
        'Document the intermediate specification and its relationship to the API specification in the regulatory filing',
        'Include process validation data confirming the purge from intermediate to API',
      ],
    },
    {
      option: 3,
      name: 'Option 3: Test drug substance at higher limit with purge factor justification',
      description: 'Release testing of the drug substance with an acceptance criterion set at a level higher than the TTC-derived limit, justified by demonstrated process purge that ensures the TTC is met.',
      applicable: impurityClass <= 3 && purgeFactorAvailable && purgeFactorValue >= 100,
      applicabilityReason: impurityClass <= 3 && purgeFactorAvailable && purgeFactorValue >= 100
        ? `Applicable for Class ${impurityClass} impurity with demonstrated purge factor of ${purgeFactorValue}×. Higher testing limit reduces analytical method sensitivity requirements.`
        : impurityClass > 3
          ? `Not applicable — Class ${impurityClass} impurity does not require mutagenic impurity controls.`
          : !purgeFactorAvailable
            ? 'Not applicable — purge factor data not available. Conduct spiking studies to support this option.'
            : `Not applicable — purge factor (${purgeFactorValue}×) is insufficient to justify a higher testing limit.`,
      requirements: [
        'Purge factor must be experimentally demonstrated through spiking studies',
        `Current purge factor: ${purgeFactorValue}× — specification limit at intermediate: ${Math.round(concentrationLimitPpm * purgeFactorValue * 100) / 100} ppm`,
        'Spiking study protocol and results must be documented in Module 3.2.S.2.6',
        'Process validation must confirm consistent purge across multiple batches',
        'Change control procedures must ensure that process modifications do not compromise the validated purge',
      ],
    },
    {
      option: 4,
      name: 'Option 4: No test — control through validated process parameters',
      description: 'No routine testing of the drug substance for the mutagenic impurity. Control is achieved through validated process parameters that have been demonstrated to consistently purge the impurity to below the TTC-derived limit.',
      applicable: impurityClass <= 3 && purgeFactorAvailable && purgeFactorValue >= 10000,
      applicabilityReason: impurityClass <= 3 && purgeFactorAvailable && purgeFactorValue >= 10000
        ? `Applicable for Class ${impurityClass} impurity with high demonstrated purge factor of ${purgeFactorValue}× (≥10,000). Process controls alone are sufficient — no routine API testing required.`
        : impurityClass > 3
          ? `Not applicable — Class ${impurityClass} impurity does not require mutagenic impurity controls.`
          : !purgeFactorAvailable
            ? 'Not applicable — purge factor data not available.'
            : `Not applicable — purge factor (${purgeFactorValue}×) is below the 10,000× threshold typically needed to justify no testing.`,
      requirements: [
        'Purge factor ≥10,000× must be experimentally demonstrated through spiking studies at representative scale',
        'Critical process parameters (CPPs) that control the purge must be identified, controlled, and monitored',
        'Process validation (at least 3 consecutive batches) must confirm consistent purge',
        'Annual product quality review should assess impurity control effectiveness',
        'Change control procedures must require re-evaluation of purge factor for any process changes',
        'Periodic verification testing (e.g., 1 batch per year or per campaign) is recommended even for Option 4 as good manufacturing practice',
        'Full documentation of the purge factor justification must be available for regulatory inspection',
      ],
    },
    {
      option: 5,
      name: 'Option 5: No controls necessary',
      description: 'No mutagenic impurity controls are required. The impurity is classified as non-mutagenic (Class 4 — alerting structure but negative Ames test; or Class 5 — no alerting structure). Controlled as an ordinary impurity per ICH Q3A(R2)/Q3B(R2).',
      applicable: impurityClass >= 4,
      applicabilityReason: impurityClass >= 4
        ? `Applicable — Class ${impurityClass} impurity is classified as non-mutagenic. No TTC-based limits apply. Manage under ordinary impurity limits per ICH Q3A(R2)/Q3B(R2).`
        : `Not applicable — Class ${impurityClass} impurity requires mutagenic impurity controls.`,
      requirements: [
        'Manage under ICH Q3A(R2) (drug substance) or ICH Q3B(R2) (drug product) impurity limits',
        `For Class 4: document the negative Ames test result and (Q)SAR assessment in the ICH M7 risk assessment`,
        `For Class 5: document the (Q)SAR assessment (two complementary systems, both negative) in the ICH M7 risk assessment`,
        'Identification threshold per ICH Q3A(R2): 0.10% for MDD ≤2g, 0.05% for MDD >2g',
        'Qualification threshold per ICH Q3A(R2): 0.15% for MDD ≤2g, 0.05% for MDD >2g',
      ],
    },
  ];

  // Determine recommended option
  let recommendedOption: number;
  if (impurityClass >= 4) {
    recommendedOption = 5;
  } else if (purgeFactorAvailable && purgeFactorValue >= 10000) {
    recommendedOption = 4;
  } else if (purgeFactorAvailable && purgeFactorValue >= 100 && numberOfDownstreamSteps >= 2) {
    recommendedOption = 3;
  } else if (numberOfDownstreamSteps >= 2 && purgeFactorAvailable) {
    recommendedOption = 2;
  } else {
    recommendedOption = 1;
  }

  const selectedOption = allOptions.find(o => o.option === recommendedOption)!;

  // Phase-specific considerations
  const phaseConsiderations: Record<DevelopmentPhase, ControlStrategyResult['phaseSpecificConsiderations']> = {
    clinical_phase1: {
      phase: 'Clinical Phase 1',
      description: 'Phase 1 (first-in-human): ICH M7(R2) allows a staged approach for clinical development. Higher limits may be justified for limited-duration early clinical trials. The staging concept permits higher daily intakes for shorter exposure periods.',
      limits: `Phase 1 staging: For clinical trials lasting ≤1 month, the LTL-TTC of 120 μg/day applies. ` +
        `For the current treatment duration (${LTL_TTC_TABLE[treatmentDuration].description}), the applicable limit is ${aiUgPerDay} μg/day. ` +
        `A higher "Phase 1 limit" may be justified if the Phase 1 trial is truly limited in duration and patient numbers, ` +
        `but this must be documented with a clear risk-benefit assessment. ` +
        `The ICH M7(R2) staging approach allows: ≤1 month: 120 μg/day, >1-3 months: 60 μg/day (linear interpolation), >3-6 months: 20 μg/day, >6-12 months: 10 μg/day.`,
      documentation: 'Document staging justification in the IND/CTA application. Include the number of patients, treatment duration, and risk-benefit assessment. Provide a commitment to lower limits as development progresses.',
    },
    clinical_phase2: {
      phase: 'Clinical Phase 2',
      description: 'Phase 2: Limits per LTL-TTC for the intended clinical treatment duration. The staging approach from Phase 1 may still apply if the Phase 2 trial has a defined, limited treatment duration.',
      limits: `LTL-TTC for ${LTL_TTC_TABLE[treatmentDuration].description}: ${aiUgPerDay} μg/day (${concentrationLimitPpm} ppm at MDD ${maxDailyDoseG} g/day).`,
      documentation: 'Include the ICH M7 risk assessment in the IND annual report or as part of the Phase 2 protocol submission. Update specifications as needed.',
    },
    clinical_phase3: {
      phase: 'Clinical Phase 3',
      description: 'Phase 3 / Pivotal trials: Limits should closely approach commercial specifications. The LTL-TTC for the intended treatment duration applies. If the commercial product is intended for chronic use (>10 years), the lifetime TTC of 1.5 μg/day should be targeted.',
      limits: `LTL-TTC for ${LTL_TTC_TABLE[treatmentDuration].description}: ${aiUgPerDay} μg/day (${concentrationLimitPpm} ppm at MDD ${maxDailyDoseG} g/day). ` +
        'Phase 3 specifications should be consistent with proposed commercial specifications to avoid the need for post-approval specification tightening.',
      documentation: 'Full ICH M7 risk assessment required in NDA Module 3.2.S.3.2 (Impurities). Analytical method must be validated per ICH Q2(R2). Process validation data should support the chosen control option.',
    },
    commercial: {
      phase: 'Commercial (Post-Approval)',
      description: 'Full ICH M7(R2) compliance required. All mutagenic impurity specifications must be set at or below the TTC-derived limit for the intended commercial treatment duration.',
      limits: `LTL-TTC for ${LTL_TTC_TABLE[treatmentDuration].description}: ${aiUgPerDay} μg/day (${concentrationLimitPpm} ppm at MDD ${maxDailyDoseG} g/day). ` +
        'Commercial specifications are binding and require a post-approval supplement (PAS/Type II variation) to change.',
      documentation: 'Include in Module 3.2.S.4.1 (Specifications), Module 3.2.S.4.2 (Analytical Procedures), Module 3.2.S.4.3 (Validation of Analytical Procedures). Update Module 3.2.S.3.2 (Impurities) and Module 2.3 (Quality Overall Summary) with the complete ICH M7 risk assessment.',
    },
  };

  // Analytical method requirements
  const analyticalMethodRequirements = [
    `Validated method required per ICH Q2(R2) with the following key parameters:`,
    `  - LOQ: ≤30% of specification limit (≤${Math.round(concentrationLimitPpm * 0.3 * 100) / 100} ppm)`,
    `  - LOD: typically ~10% of specification limit`,
    `  - Linearity: LOQ to 150% of specification limit`,
    `  - Accuracy: 70-130% recovery at LOQ, 80-120% at specification limit`,
    `  - Precision: RSD ≤20% at LOQ, ≤10% at specification limit`,
    `  - Specificity: demonstrated against drug substance, other impurities, and degradation products`,
    compoundClass === 'CoC_nitrosamine'
      ? `  - For nitrosamines: LOQ ≤10% of AI per maximum daily dose = ${Math.round((aiUgPerDay * 1000 * 0.1 / maxDailyDoseG) * 1000) / 1000} ng/g`
      : `  - Standard LOQ requirement: ≤30% of specification limit`,
    `Method technique recommendation:`,
    concentrationLimitPpm >= 1
      ? `  - HPLC-UV may be adequate at this specification level (${concentrationLimitPpm} ppm)`
      : `  - LC-MS/MS or GC-MS/MS likely required for this low specification level (${concentrationLimitPpm} ppm)`,
    analyticalMethodValidated
      ? 'Analytical method has been validated — confirm validation parameters meet the requirements above'
      : 'Analytical method has NOT been validated — method development and validation should be completed before setting final specifications',
  ];

  // Release vs shelf-life testing
  const isFormationDuringStorage = drugProductType.toLowerCase().includes('tablet') ||
    drugProductType.toLowerCase().includes('capsule') ||
    drugProductType.toLowerCase().includes('solution');
  const shelfLifeTestingRequired = impurityClass <= 3 && isFormationDuringStorage;

  const releaseVsShelfLife = {
    releaseTestingRequired: impurityClass <= 3 && recommendedOption <= 3,
    shelfLifeTestingRequired,
    rationale: impurityClass >= 4
      ? 'Class 4/5 impurity — no mutagenic impurity testing required at release or on stability.'
      : recommendedOption === 4
        ? 'Option 4 control — no routine release testing. Periodic verification testing recommended. Stability testing may be needed if the impurity can form during storage (degradation product).'
        : shelfLifeTestingRequired
          ? `Release AND shelf-life testing required. Drug product type (${drugProductType}) may be subject to impurity formation during storage. Include the mutagenic impurity in the stability-indicating method and test at all stability time points per ICH Q1A(R2).`
          : `Release testing required. Shelf-life testing may not be necessary if the impurity is process-related only and does not form during storage. Confirm with forced degradation data.`,
  };

  // Change control requirements
  const changeControlRequirements = [
    'Any change to the drug substance manufacturing process (route, reagents, solvents, reaction conditions, workup, purification) must trigger a re-evaluation of the ICH M7 risk assessment',
    'Changes to raw material suppliers or specifications must be evaluated for impact on mutagenic impurity profiles',
    'Changes to the drug product formulation or manufacturing process must be assessed for potential nitrosamine formation',
    'If the control strategy relies on purge factor (Options 2-4): any change to downstream process steps must trigger re-validation of the purge factor',
    'Equipment changes (new reactors, driers, filters) may affect purge mechanisms — re-evaluate purge factor as needed',
    'Changes to packaging materials must be assessed for nitrosamine leaching potential',
    'Annual Product Quality Review (APQR) should include trending of mutagenic impurity data if testing is performed',
    'Post-approval changes affecting the mutagenic impurity control strategy require regulatory notification per ICH Q12 or applicable regional guidance',
    developmentPhase === 'commercial'
      ? 'Commercial-stage changes: file a Prior Approval Supplement (PAS) or Type II Variation for changes that affect the validated control strategy'
      : 'Clinical-stage changes: document in the IND annual report or as a protocol amendment, as applicable',
  ];

  const regulatorySummary = `CONTROL STRATEGY\n` +
    `Impurity class: ${impurityClass}\n` +
    `Recommended option: Option ${recommendedOption} — ${selectedOption.name}\n` +
    `Specification limit: ${concentrationLimitPpm} ppm (AI: ${aiUgPerDay} μg/day)\n` +
    `Development phase: ${developmentPhase}\n` +
    `Treatment duration: ${LTL_TTC_TABLE[treatmentDuration].description}\n` +
    `Purge factor: ${purgeFactorAvailable ? `${purgeFactorValue}×` : 'Not available'}\n` +
    `Release testing: ${releaseVsShelfLife.releaseTestingRequired ? 'Required' : 'Not required'}\n` +
    `Stability testing: ${releaseVsShelfLife.shelfLifeTestingRequired ? 'Required' : 'Not required'}`;

  return {
    recommendedOption,
    optionName: selectedOption.name,
    optionDescription: selectedOption.description,
    allOptions,
    specificationLimit,
    phaseSpecificConsiderations: phaseConsiderations[developmentPhase],
    analyticalMethodRequirements,
    releaseVsShelfLife,
    changeControlRequirements,
    regulatorySummary,
    citations: [CITATIONS.M7R2, CITATIONS.Q3A_R2, CITATIONS.Q3B_R2, CITATIONS.FDA_NITROSAMINE_2021],
  };
}
