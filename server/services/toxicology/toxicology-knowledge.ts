/**
 * Preclinical Toxicology Knowledge Base Service
 *
 * Deterministic, citation-backed knowledge base covering the core regulatory
 * toxicology disciplines required for IND/CTA-enabling nonclinical programs.
 * Every function returns structured output grounded in ICH, FDA, and EMA
 * guidance — NO LLM calls, NO network requests.
 *
 * Covered domains:
 *   1. Species selection (ICH M3(R2), S6(R1), S7A/B, S9)
 *   2. Repeat-dose study design (ICH M3(R2) Table 1, S6(R1), S9)
 *   3. Safety margin / first-in-human dose calculation (FDA 2005 Guidance, ICH S9)
 *   4. Genotoxicity battery (ICH S2(R1))
 *   5. Carcinogenicity assessment (ICH S1A, S1B, S1C(R2))
 *   6. Reproductive/developmental toxicology (ICH S5(R3))
 *
 * @module server/services/toxicology/toxicology-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────────────────────────────────────

export type MoleculeType = 'small_molecule' | 'biologic' | 'antibody' | 'peptide' | 'oligonucleotide' | 'adc' | 'cell_therapy' | 'gene_therapy';
export type ClinicalPhase = 'phase1' | 'phase1b' | 'phase2' | 'phase3' | 'marketing';
export type SpeciesClass = 'rodent' | 'non_rodent';
export type TherapeuticArea = 'oncology' | 'anti_infective' | 'cns' | 'cardiovascular' | 'metabolic' | 'immunology' | 'rare_disease' | 'dermatology' | 'ophthalmology' | 'general';
export type StudyType = 'acute' | 'repeat_dose' | 'carcinogenicity' | 'genotoxicity' | 'reproductive' | 'safety_pharmacology' | 'immunotoxicity' | 'juvenile';

export interface Citation {
  guideline: string;
  section?: string;
  title: string;
  year: number;
  url?: string;
}

export interface SpeciesRecommendation {
  species: string;
  class: SpeciesClass;
  rationale: string[];
  considerations: string[];
  contraindications: string[];
  citations: Citation[];
}

export interface StudyDesign {
  studyType: string;
  duration: string;
  species: string;
  groupDesign: GroupDesign;
  endpoints: string[];
  tkDesign: TKDesign;
  recoveryGroup: RecoveryGroupDesign;
  regulatoryJustification: string;
  citations: Citation[];
}

export interface GroupDesign {
  numberOfGroups: number;
  groupDescriptions: string[];
  animalsPerSexPerGroup: number;
  totalAnimals: number;
  doseSelectionPrinciples: string[];
}

export interface TKDesign {
  required: boolean;
  animalsPerSexPerGroup: number;
  timepoints: string[];
  analytes: string[];
  rationale: string;
}

export interface RecoveryGroupDesign {
  included: boolean;
  duration: string;
  animalsPerSexPerGroup: number;
  rationale: string;
}

export interface SafetyMarginResult {
  hed: number;
  hedMethod: string;
  mrsd: number;
  mrsdUnit: string;
  safetyFactor: number;
  safetyMargin: number;
  aucMargin?: number;
  cmaxMargin?: number;
  interpretation: string;
  warnings: string[];
  calculations: CalculationStep[];
  citations: Citation[];
}

export interface CalculationStep {
  step: string;
  formula: string;
  values: Record<string, number | string>;
  result: number | string;
}

export interface GenotoxBatteryResult {
  standardBattery: GenotoxAssay[];
  modifications: string[];
  followUpRequired: boolean;
  followUpStudies: GenotoxAssay[];
  weightOfEvidence: string;
  regulatoryJustification: string;
  citations: Citation[];
}

export interface GenotoxAssay {
  name: string;
  type: 'in_vitro' | 'in_vivo';
  endpoint: string;
  guideline: string;
  description: string;
  required: boolean;
}

export interface CarcinogenicityAssessment {
  required: boolean;
  triggers: string[];
  triggersMet: string[];
  triggersNotMet: string[];
  recommendedDesign?: CarcinogenicityDesign;
  alternativeApproach?: string;
  regulatoryJustification: string;
  citations: Citation[];
}

export interface CarcinogenicityDesign {
  model: string;
  duration: string;
  species: string;
  groupDesign: string;
  doseSelection: string;
  statisticalApproach: string;
  endpoints: string[];
}

export interface ReproToxDesign {
  studyType: string;
  segment: string;
  species: string;
  speciesJustification: string;
  timing: string;
  timingRelativeToClinical: string;
  designElements: ReproDesignElement[];
  endpoints: string[];
  specialConsiderations: string[];
  citations: Citation[];
}

export interface ReproDesignElement {
  element: string;
  description: string;
  groupSizes: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants — Regulatory Reference Tables
// ─────────────────────────────────────────────────────────────────────────────

/** ICH M3(R2) Table 1: Recommended Duration of Repeat-Dose Toxicity Studies */
const REPEAT_DOSE_DURATION_MAP: Record<ClinicalPhase, { rodent: string; nonRodent: string; maxClinicalDuration: string }> = {
  phase1:    { rodent: '2 weeks',   nonRodent: '2 weeks',   maxClinicalDuration: 'up to 14 days' },
  phase1b:   { rodent: '1 month',   nonRodent: '1 month',   maxClinicalDuration: 'up to 1 month' },
  phase2:    { rodent: '3 months',  nonRodent: '3 months',  maxClinicalDuration: 'up to 3 months' },
  phase3:    { rodent: '6 months',  nonRodent: '9 months',  maxClinicalDuration: '>3 months' },
  marketing: { rodent: '6 months',  nonRodent: '9 months',  maxClinicalDuration: '>6 months' },
};

/** FDA Guidance (2005) — Km factors for body surface area conversion */
const KM_FACTORS: Record<string, number> = {
  mouse:   3,
  rat:     6,
  hamster: 5,
  guinea_pig: 8,
  rabbit: 12,
  dog:    20,
  nhp:    12,   // Non-human primate (cynomolgus/rhesus ~ 3 kg)
  minipig: 27,
  human:  37,
};

/** Safety factors for MRSD calculation (FDA 2005 Guidance) */
const SAFETY_FACTORS: Record<string, number> = {
  mouse:   12.3,
  rat:     6.2,
  hamster: 7.4,
  guinea_pig: 4.6,
  rabbit:  3.1,
  dog:     1.8,
  nhp:     3.1,
  minipig: 1.4,
  human:   1.0,
};

/** Default group sizes per species */
const DEFAULT_GROUP_SIZES: Record<string, { rodent: number; nonRodent: number }> = {
  '2 weeks':  { rodent: 10, nonRodent: 3 },
  '1 month':  { rodent: 10, nonRodent: 3 },
  '3 months': { rodent: 15, nonRodent: 4 },
  '6 months': { rodent: 20, nonRodent: 4 },
  '9 months': { rodent: 20, nonRodent: 4 },
};

/** ICH S2(R1) Standard Genotoxicity Battery */
const STANDARD_GENOTOX_BATTERY: GenotoxAssay[] = [
  {
    name: 'Bacterial Reverse Mutation Test (Ames Test)',
    type: 'in_vitro',
    endpoint: 'Gene mutation in bacteria',
    guideline: 'OECD TG 471',
    description: 'Tests 5 strains of S. typhimurium (TA98, TA100, TA1535, TA1537 or TA97, and E. coli WP2 uvrA or S. typhimurium TA102) with and without metabolic activation (S9 mix). Detects frameshift and base-pair substitution mutations. Positive results trigger follow-up studies.',
    required: true,
  },
  {
    name: 'In Vitro Mammalian Chromosome Aberration Test',
    type: 'in_vitro',
    endpoint: 'Chromosomal damage in mammalian cells',
    guideline: 'OECD TG 473',
    description: 'Evaluates structural chromosome aberrations in cultured mammalian cells (e.g., CHO, CHL, human lymphocytes) with and without S9 metabolic activation. Short (3-6 h) and long (18-24 h without S9) exposure periods. Alternative: In Vitro Mammalian Cell Micronucleus Test (OECD TG 487).',
    required: true,
  },
  {
    name: 'In Vivo Mammalian Erythrocyte Micronucleus Test',
    type: 'in_vivo',
    endpoint: 'Chromosomal damage (clastogenicity and aneugenicity) in bone marrow erythrocytes',
    guideline: 'OECD TG 474',
    description: 'Assesses micronucleus formation in polychromatic erythrocytes of rodent bone marrow (typically mouse or rat). Detects both clastogenic and aneugenic effects. Can be integrated into repeat-dose toxicity studies per ICH S2(R1) Option 2.',
    required: true,
  },
];

/** Follow-up genotoxicity assays for equivocal or positive results */
const FOLLOWUP_GENOTOX_ASSAYS: GenotoxAssay[] = [
  {
    name: 'In Vivo Comet Assay (Alkaline Single-Cell Gel Electrophoresis)',
    type: 'in_vivo',
    endpoint: 'DNA strand breaks in target tissues',
    guideline: 'OECD TG 489',
    description: 'Detects DNA strand breaks in specific tissues (liver, stomach/duodenum, other target organs). Useful follow-up when in vitro clastogenicity is positive but mechanism may not be relevant in vivo. Can assess tissue-specific genotoxicity.',
    required: false,
  },
  {
    name: 'In Vivo Transgenic Rodent Gene Mutation Assay',
    type: 'in_vivo',
    endpoint: 'Gene mutation in somatic tissues',
    guideline: 'OECD TG 488',
    description: 'Detects gene mutations in vivo using transgenic rodents (e.g., Muta Mouse, Big Blue). Useful when Ames-positive compounds need in vivo follow-up for gene mutation endpoint. Requires 28-day dosing + 3-day expression period.',
    required: false,
  },
  {
    name: 'In Vitro Mammalian Cell Gene Mutation Test (HPRT or TK)',
    type: 'in_vitro',
    endpoint: 'Gene mutation in mammalian cells',
    guideline: 'OECD TG 476 / 490',
    description: 'Mouse lymphoma assay (MLA, TK locus) or HPRT assay in CHO/V79 cells. Detects point mutations and small deletions. MLA also detects clastogenic events at the TK locus (large-colony vs small-colony mutants).',
    required: false,
  },
];

/** ICH S1A — Triggers for Carcinogenicity Assessment */
const CARCINOGENICITY_TRIGGERS = {
  duration: 'Clinical use for ≥6 months (continuously or intermittently with repeated use over the patient\'s lifetime)',
  genotoxPositive: 'Positive findings in the genotoxicity assessment battery that raise concern for carcinogenic potential',
  structuralAlert: 'Structural alerts: compound belongs to a chemical class with known carcinogenic members',
  preneoplastic: 'Preneoplastic lesions observed in repeat-dose toxicity studies',
  longTermRetention: 'Long-term tissue retention of parent compound or metabolites resulting in local tissue reactions or other pathophysiological responses',
  photoCarcinogenicity: 'Phototoxicity of dermally applied compounds intended for chronic use (potential photo-carcinogenicity)',
  endocrine: 'Endocrine-mediated mechanisms that could lead to tumors in rodents (requires mechanistic evaluation)',
  immunosuppressive: 'Immunosuppressive agents used in non-life-threatening indications for ≥6 months',
};

/** ICH S5(R3) Reproductive Toxicity Study Segments */
const REPRO_STUDY_SEGMENTS = {
  fertility: {
    segment: 'Segment I / Study 4.1.1',
    name: 'Fertility and Early Embryonic Development',
    species: 'rat',
    maleDosingPeriod: '4 weeks prior to mating through mating (minimum 28 days to cover a full spermatogenic cycle)',
    femaleDosingPeriod: '2 weeks prior to mating through implantation (GD 7)',
    keyEndpoints: [
      'Mating behavior and fertility indices',
      'Estrous cyclicity (females)',
      'Sperm parameters: count, motility, morphology (males)',
      'Reproductive organ weights and histopathology',
      'Preimplantation loss',
      'Number of corpora lutea, implantation sites',
    ],
    groupSize: '22-24 females; 22-24 males per group',
  },
  efd: {
    segment: 'Segment II / Study 4.1.3',
    name: 'Embryo-Fetal Development (EFD)',
    species: ['rat', 'rabbit'],
    dosingPeriod: 'Implantation through closure of the hard palate (rat: GD 6-17; rabbit: GD 6-18)',
    keyEndpoints: [
      'Maternal toxicity (body weight, food consumption, clinical signs)',
      'Cesarean section parameters (corpora lutea, implantations, resorptions)',
      'Fetal body weight',
      'External, visceral, and skeletal malformations and variations',
      'Sex ratio',
    ],
    groupSize: 'Rat: 22-24 litters/group; Rabbit: 18-20 litters/group',
  },
  ppnd: {
    segment: 'Segment III / Study 4.1.2',
    name: 'Pre- and Postnatal Development (PPND)',
    species: 'rat',
    dosingPeriod: 'Implantation (GD 6) through lactation day 20',
    keyEndpoints: [
      'Maternal parameters (parturition, lactation, maternal behavior)',
      'Offspring survival, body weight, developmental landmarks',
      'Physical development (pinna unfolding, incisor eruption, eye opening, etc.)',
      'Behavioral assessment (motor activity, learning and memory)',
      'Sexual maturation',
      'F1 fertility assessment',
    ],
    groupSize: '22-24 litters/group',
  },
};

/** Core ICH citations used across multiple functions */
const ICH_CITATIONS: Record<string, Citation> = {
  M3R2: {
    guideline: 'ICH M3(R2)',
    title: 'Guidance on Nonclinical Safety Studies for the Conduct of Human Clinical Trials and Marketing Authorization for Pharmaceuticals',
    year: 2009,
    url: 'https://database.ich.org/sites/default/files/M3_R2__Guideline.pdf',
  },
  S1A: {
    guideline: 'ICH S1A',
    title: 'Guideline on the Need for Carcinogenicity Studies of Pharmaceuticals',
    year: 1995,
    url: 'https://database.ich.org/sites/default/files/S1A_Guideline.pdf',
  },
  S1B: {
    guideline: 'ICH S1B(R1)',
    title: 'Testing for Carcinogenicity of Pharmaceuticals',
    year: 2022,
    url: 'https://database.ich.org/sites/default/files/S1B-R1_FinalGuideline_2022_1117.pdf',
  },
  S1C: {
    guideline: 'ICH S1C(R2)',
    title: 'Dose Selection for Carcinogenicity Studies of Pharmaceuticals',
    year: 2008,
    url: 'https://database.ich.org/sites/default/files/S1C_R2_Guideline.pdf',
  },
  S2R1: {
    guideline: 'ICH S2(R1)',
    title: 'Guidance on Genotoxicity Testing and Data Interpretation for Pharmaceuticals Intended for Human Use',
    year: 2011,
    url: 'https://database.ich.org/sites/default/files/S2%28R1%29_Guideline.pdf',
  },
  S5R3: {
    guideline: 'ICH S5(R3)',
    title: 'Detection of Reproductive and Developmental Toxicity for Human Pharmaceuticals',
    year: 2020,
    url: 'https://database.ich.org/sites/default/files/S5-R3_Step4_Guideline_2020_0218.pdf',
  },
  S6R1: {
    guideline: 'ICH S6(R1)',
    title: 'Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals',
    year: 2011,
    url: 'https://database.ich.org/sites/default/files/S6_R1_Guideline.pdf',
  },
  S7A: {
    guideline: 'ICH S7A',
    title: 'Safety Pharmacology Studies for Human Pharmaceuticals',
    year: 2000,
    url: 'https://database.ich.org/sites/default/files/S7A_Guideline.pdf',
  },
  S7B: {
    guideline: 'ICH S7B',
    title: 'The Nonclinical Evaluation of the Potential for Delayed Ventricular Repolarization (QT Interval Prolongation) by Human Pharmaceuticals',
    year: 2005,
    url: 'https://database.ich.org/sites/default/files/S7B_Guideline.pdf',
  },
  S9: {
    guideline: 'ICH S9',
    title: 'Nonclinical Evaluation for Anticancer Pharmaceuticals',
    year: 2009,
    url: 'https://database.ich.org/sites/default/files/S9_Guideline.pdf',
  },
  FDA_FIH: {
    guideline: 'FDA Guidance',
    title: 'Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers',
    year: 2005,
    url: 'https://www.fda.gov/media/72309/download',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Species Selection
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectSpeciesInput {
  moleculeType: MoleculeType;
  therapeuticArea?: TherapeuticArea;
  routeOfAdministration?: string;
  targetOrgan?: string;
  knownMetabolismSimilarity?: string;
  pharmacologicallyRelevantIn?: string[];
  isOncology?: boolean;
}

export interface SelectSpeciesResult {
  rodent: SpeciesRecommendation;
  nonRodent: SpeciesRecommendation;
  specialConsiderations: string[];
  regulatorySummary: string;
  citations: Citation[];
}

export function selectSpecies(params: SelectSpeciesInput): SelectSpeciesResult {
  const { moleculeType, therapeuticArea, routeOfAdministration, pharmacologicallyRelevantIn } = params;
  const isOncology = params.isOncology || therapeuticArea === 'oncology';
  const isBiologic = ['biologic', 'antibody', 'peptide', 'adc'].includes(moleculeType);
  const isOligonucleotide = moleculeType === 'oligonucleotide';
  const isCellOrGeneTherapy = ['cell_therapy', 'gene_therapy'].includes(moleculeType);
  const specialConsiderations: string[] = [];

  // --- Rodent selection ---
  let rodent: SpeciesRecommendation;
  if (isBiologic) {
    // ICH S6(R1): only pharmacologically relevant species
    const relevantRodent = pharmacologicallyRelevantIn?.some(s => ['rat', 'mouse'].includes(s.toLowerCase()));
    if (relevantRodent) {
      const chosenSpecies = pharmacologicallyRelevantIn!.find(s => ['rat', 'mouse'].includes(s.toLowerCase()))!.toLowerCase();
      rodent = {
        species: chosenSpecies,
        class: 'rodent',
        rationale: [
          `${chosenSpecies} identified as pharmacologically relevant species`,
          'ICH S6(R1): use of relevant species where the biologic is pharmacologically active is mandatory',
          'Cross-reactivity or transgenic expression confirmed for the target',
        ],
        considerations: [
          'Confirm pharmacological relevance via binding assay, functional assay, or tissue cross-reactivity (TCR)',
          'Anti-drug antibody (ADA) assessment required — may limit study duration',
          'If only one species is relevant, a single-species program may be scientifically justified per ICH S6(R1)',
        ],
        contraindications: [
          'Do not use a non-relevant species — results are uninterpretable and may be misleading',
        ],
        citations: [ICH_CITATIONS.S6R1, ICH_CITATIONS.M3R2],
      };
    } else {
      rodent = {
        species: 'mouse (transgenic or surrogate may be needed)',
        class: 'rodent',
        rationale: [
          'No standard rodent species identified as pharmacologically relevant',
          'ICH S6(R1): transgenic models expressing the human target or surrogate molecules may be acceptable',
          'A scientific justification for species choice must be included in regulatory submissions',
        ],
        considerations: [
          'Consider transgenic mouse expressing the human target',
          'A surrogate molecule (rodent analogue) may be used if validated',
          'Hazard identification with surrogate may not fully represent clinical molecule',
        ],
        contraindications: [
          'Testing in a non-relevant species solely to fulfill a two-species requirement is not recommended',
        ],
        citations: [ICH_CITATIONS.S6R1],
      };
      specialConsiderations.push('Biologic lacks confirmed rodent pharmacological relevance — transgenic model or surrogate molecule may be required. Provide scientific justification in Module 2.4.');
    }
  } else if (isOligonucleotide) {
    rodent = {
      species: 'mouse',
      class: 'rodent',
      rationale: [
        'Mouse commonly used for oligonucleotides due to well-characterized pharmacology',
        'Sequence homology with target mRNA should be confirmed',
        'Adequate target knockdown in mouse can be verified',
      ],
      considerations: [
        'Verify sequence complementarity to the mouse orthologue of the target mRNA',
        'Consider species-specific off-target analysis (hybridization-based)',
        'Pro-inflammatory effects (class effect) should be monitored via cytokine panels',
      ],
      contraindications: [
        'Lack of sequence homology with mouse target makes the species non-relevant',
      ],
      citations: [ICH_CITATIONS.M3R2],
    };
  } else {
    // Small molecule: rat is the default rodent
    rodent = {
      species: 'rat',
      class: 'rodent',
      rationale: [
        'Rat is the standard rodent species per ICH M3(R2) for small molecules',
        'Extensive historical control data available for most endpoints',
        'Well-characterized metabolic enzyme (CYP) profile allows ADME comparison with human',
        'Suitable for all standard toxicology study types including carcinogenicity (2-year bioassay)',
      ],
      considerations: [
        'Confirm metabolite profile is qualitatively similar to human (MIST analysis, ICH M3(R2) Note 3)',
        'Consider strain selection: Sprague-Dawley (outbred) for general toxicology, Wistar for some EU studies',
        'If a unique human metabolite represents >10% of total drug-related exposure, additional species evaluation may be needed',
      ],
      contraindications: [
        'Known poor metabolic concordance with human CYP profile',
        'Target not expressed or not functional in rat',
      ],
      citations: [ICH_CITATIONS.M3R2],
    };
  }

  // --- Non-rodent selection ---
  let nonRodent: SpeciesRecommendation;
  if (isBiologic) {
    const relevantNonRodent = pharmacologicallyRelevantIn?.some(s => ['dog', 'nhp', 'cynomolgus', 'monkey', 'rabbit', 'minipig'].includes(s.toLowerCase()));
    if (relevantNonRodent) {
      const found = pharmacologicallyRelevantIn!.find(s => ['dog', 'nhp', 'cynomolgus', 'monkey', 'rabbit', 'minipig'].includes(s.toLowerCase()))!.toLowerCase();
      const mappedSpecies = ['nhp', 'cynomolgus', 'monkey'].includes(found) ? 'non-human primate (cynomolgus monkey)' : found;
      nonRodent = {
        species: mappedSpecies,
        class: 'non_rodent',
        rationale: [
          `${mappedSpecies} confirmed as pharmacologically relevant non-rodent species`,
          'ICH S6(R1): toxicity studies should be conducted in pharmacologically relevant species',
          'Cross-reactivity/functional activity confirmed',
        ],
        considerations: [
          'ADA assessment essential — may impact exposure and limit study duration',
          'If NHP: enhanced pre-study health screening, ethological behavioral observations recommended',
          'Recovery period important for assessing reversibility of immunological effects',
        ],
        contraindications: [],
        citations: [ICH_CITATIONS.S6R1, ICH_CITATIONS.M3R2],
      };
    } else {
      nonRodent = {
        species: 'non-human primate (cynomolgus monkey)',
        class: 'non_rodent',
        rationale: [
          'NHP is the most common non-rodent for biologics due to high target homology with human',
          'ICH S6(R1) requires pharmacological relevance — NHP often the only relevant non-rodent',
          'If only NHP is relevant, a single-species program in NHP alone is acceptable per ICH S6(R1) Section 3',
        ],
        considerations: [
          'Tissue cross-reactivity (TCR) study with human and NHP tissues to confirm binding pattern concordance',
          'In vitro functional assays comparing NHP and human target engagement',
          'NHP use requires 3Rs justification and ethical review',
        ],
        contraindications: [
          'Lack of target expression or pharmacological activity in NHP',
        ],
        citations: [ICH_CITATIONS.S6R1],
      };
      specialConsiderations.push('Biologic: confirm NHP pharmacological relevance with TCR and functional assays before committing to GLP studies.');
    }
  } else if (isCellOrGeneTherapy) {
    nonRodent = {
      species: 'species selection requires case-by-case scientific justification',
      class: 'non_rodent',
      rationale: [
        'Cell and gene therapies often require disease-relevant animal models rather than standard toxicology species',
        'Immunocompetent vs immunocompromised models must be evaluated',
        'Biodistribution, persistence, and integration studies may substitute for standard tox in some cases',
      ],
      considerations: [
        'Consult FDA CBER or EMA CAT for species-specific advice',
        'Tumorigenicity studies for stem-cell-based products',
        'Insertional mutagenesis assessment for integrating gene therapy vectors',
      ],
      contraindications: [],
      citations: [ICH_CITATIONS.M3R2],
    };
    specialConsiderations.push('Cell/gene therapy: standard two-species toxicology paradigm may not apply. Engage regulatory authorities early (Pre-IND meeting / CBER / CAT scientific advice).');
  } else {
    // Small molecule: dog is the default non-rodent
    const useDog = routeOfAdministration !== 'dermal' && routeOfAdministration !== 'inhalation';
    if (useDog) {
      nonRodent = {
        species: 'dog (beagle)',
        class: 'non_rodent',
        rationale: [
          'Dog (beagle) is the standard non-rodent species per ICH M3(R2)',
          'Well-characterized cardiovascular physiology supports safety pharmacology integration (ICH S7A/S7B)',
          'Extensive historical control databases available',
          'Practical advantages: size, temperament, ease of repeated blood sampling for TK',
        ],
        considerations: [
          'Dog may be the preferred non-rodent for cardiovascular safety assessment (hERG homology, QTc evaluation)',
          'Consider emesis potential — dogs vomit readily, which can affect oral dosing and exposure',
          'CYP2D6 polymorphism: dogs lack functional CYP2D6 — confirm relevance if CYP2D6 is a major human metabolic pathway',
          'If the dog is not pharmacologically relevant, NHP or minipig should be considered',
        ],
        contraindications: [
          'Target not expressed or functional in dog',
          'Major human metabolite formed predominantly by CYP2D6',
        ],
        citations: [ICH_CITATIONS.M3R2, ICH_CITATIONS.S7A, ICH_CITATIONS.S7B],
      };
    } else {
      nonRodent = {
        species: 'minipig (Gottingen or Yucatan)',
        class: 'non_rodent',
        rationale: [
          'Minipig skin closely resembles human skin (histology, vascularity, turnover rate)',
          'Preferred non-rodent for dermal and transdermal formulations',
          'Acceptable cardiovascular model for safety pharmacology',
        ],
        considerations: [
          'Minipig GI physiology differs from human (hindgut fermenter) — oral bioavailability may differ',
          'Limited historical control data compared to dog',
          'Strain selection: Gottingen (smaller, purpose-bred), Yucatan (larger)',
        ],
        contraindications: [
          'Limited supplier availability in some regions',
        ],
        citations: [ICH_CITATIONS.M3R2],
      };
    }
  }

  // --- Oncology-specific considerations (ICH S9) ---
  if (isOncology) {
    specialConsiderations.push(
      'ICH S9: For anticancer pharmaceuticals for advanced disease, a single relevant species may be sufficient for general toxicology.',
      'ICH S9: Rodent-only programs may be acceptable if the second species adds no value (e.g., lack of pharmacological relevance).',
      'ICH S9: Recovery groups are not considered essential for oncology indications with serious morbidity.',
    );
  }

  // --- Route-specific considerations ---
  if (routeOfAdministration === 'intrathecal' || routeOfAdministration === 'intravitreal') {
    specialConsiderations.push(
      `${routeOfAdministration} route: local tolerance and CNS/ocular safety endpoints must be included. Consider species anatomy compatibility with clinical delivery device.`,
    );
  }

  const regulatorySummary = buildSpeciesRegulatorySummary(rodent, nonRodent, moleculeType, isBiologic, isOncology);

  return {
    rodent,
    nonRodent,
    specialConsiderations,
    regulatorySummary,
    citations: [ICH_CITATIONS.M3R2, ...(isBiologic ? [ICH_CITATIONS.S6R1] : []), ...(isOncology ? [ICH_CITATIONS.S9] : [])],
  };
}

function buildSpeciesRegulatorySummary(
  rodent: SpeciesRecommendation,
  nonRodent: SpeciesRecommendation,
  moleculeType: MoleculeType,
  isBiologic: boolean,
  isOncology: boolean,
): string {
  const parts: string[] = [
    `Recommended rodent: ${rodent.species}; non-rodent: ${nonRodent.species}.`,
  ];
  if (isBiologic) {
    parts.push('Per ICH S6(R1), only pharmacologically relevant species should be used. A single-species program is acceptable if only one relevant species exists.');
  }
  if (isOncology) {
    parts.push('Per ICH S9, a reduced nonclinical program may be acceptable for anticancer agents in patients with advanced disease.');
  }
  parts.push(`Molecule type: ${moleculeType}. Species selection should be justified in Module 2.4 (Nonclinical Overview) with supporting data from pharmacology, PK, and tissue cross-reactivity studies.`);
  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Repeat-Dose Toxicity Study Design
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignRepeatDoseInput {
  species: string;
  phase: ClinicalPhase;
  moleculeType: MoleculeType;
  routeOfAdministration: string;
  therapeuticArea?: TherapeuticArea;
  isOncology?: boolean;
  maxClinicalDoseMgKg?: number;
  includeRecovery?: boolean;
  includeImmunotoxicity?: boolean;
}

export function designRepeatDoseStudy(params: DesignRepeatDoseInput): StudyDesign {
  const { species, phase, moleculeType, routeOfAdministration } = params;
  const isOncology = params.isOncology || params.therapeuticArea === 'oncology';
  const isBiologic = ['biologic', 'antibody', 'peptide', 'adc'].includes(moleculeType);
  const speciesLower = species.toLowerCase();
  const isRodent = ['rat', 'mouse'].includes(speciesLower);
  const speciesClass: SpeciesClass = isRodent ? 'rodent' : 'non_rodent';

  // Duration from ICH M3(R2) Table 1
  const durationEntry = REPEAT_DOSE_DURATION_MAP[phase];
  let duration = isRodent ? durationEntry.rodent : durationEntry.nonRodent;

  // ICH S9 exception for oncology
  if (isOncology && (phase === 'phase1' || phase === 'phase1b')) {
    duration = '2 weeks';
  }

  // Group sizes
  const groupSizeEntry = DEFAULT_GROUP_SIZES[duration] ?? DEFAULT_GROUP_SIZES['1 month'];
  const animalsPerSex = isRodent ? groupSizeEntry.rodent : groupSizeEntry.nonRodent;

  // Dose groups: vehicle control + 3 dose levels (low, mid, high)
  const numberOfGroups = 4;
  const doseSelectionPrinciples = buildDoseSelectionPrinciples(moleculeType, isOncology);
  const groupDescriptions = [
    'Group 1: Vehicle/placebo control',
    'Group 2: Low dose — intended to be at or near the pharmacologically active dose; ideally a NOAEL candidate',
    'Group 3: Mid dose — geometric mean of low and high; dose-response characterization',
    'Group 4: High dose — selected to produce frank toxicity (MTD) or the limit dose (1000 mg/kg/day for small molecules, 100 mg/kg/day for proteins per ICH M3(R2))',
  ];

  const totalAnimals = numberOfGroups * animalsPerSex * 2; // 2 sexes
  const groupDesign: GroupDesign = {
    numberOfGroups,
    groupDescriptions,
    animalsPerSexPerGroup: animalsPerSex,
    totalAnimals,
    doseSelectionPrinciples,
  };

  // TK satellite design
  const tkDesign = buildTKDesign(isRodent, speciesLower, isBiologic, duration);

  // Recovery group
  const includeRecovery = params.includeRecovery !== false && !isOncology;
  const recoveryDuration = duration === '2 weeks' ? '2 weeks' : duration === '1 month' ? '2 weeks' : '4 weeks';
  const recoveryGroup: RecoveryGroupDesign = {
    included: includeRecovery,
    duration: includeRecovery ? recoveryDuration : 'N/A',
    animalsPerSexPerGroup: includeRecovery ? (isRodent ? 5 : 2) : 0,
    rationale: includeRecovery
      ? 'Recovery groups assess reversibility, persistence, or delayed occurrence of toxic effects. Required per ICH M3(R2) unless justified (e.g., oncology per ICH S9).'
      : isOncology
        ? 'ICH S9: Recovery groups are not considered essential for anti-cancer pharmaceuticals for advanced disease.'
        : 'Recovery groups omitted per sponsor decision — justification required in study protocol.',
  };

  // Standard endpoints
  const endpoints = buildRepeatDoseEndpoints(isRodent, speciesLower, routeOfAdministration, isBiologic, params.includeImmunotoxicity);

  const regulatoryJustification = [
    `Study duration (${duration}) selected per ICH M3(R2) Table 1 to support ${phase} clinical trials with dosing up to ${durationEntry.maxClinicalDuration}.`,
    isOncology ? 'ICH S9 abbreviated program applied for anticancer pharmaceutical.' : '',
    isBiologic ? 'Dosing frequency aligned with proposed clinical regimen per ICH S6(R1). ADA assessment included.' : '',
    `Route of administration: ${routeOfAdministration}, matched to the intended clinical route.`,
  ].filter(Boolean).join(' ');

  const citations: Citation[] = [ICH_CITATIONS.M3R2];
  if (isBiologic) citations.push(ICH_CITATIONS.S6R1);
  if (isOncology) citations.push(ICH_CITATIONS.S9);

  return {
    studyType: 'Repeat-Dose Toxicity',
    duration,
    species,
    groupDesign,
    endpoints,
    tkDesign,
    recoveryGroup,
    regulatoryJustification,
    citations,
  };
}

function buildDoseSelectionPrinciples(moleculeType: MoleculeType, isOncology: boolean): string[] {
  const principles: string[] = [
    'High dose: MTD or limit dose (1000 mg/kg/day for small molecules, or a dose producing a 50-fold exposure margin over clinical AUC, whichever is lower)',
    'Low dose: pharmacologically active dose or anticipated clinical exposure, whichever provides adequate NOAEL assessment',
    'Mid dose: geometric mean of low and high doses for dose-response characterization',
    'Dose spacing: typically 3-fold to 10-fold between groups to characterize the dose-response curve',
  ];
  if (isOncology) {
    principles.push('ICH S9: STD10 (severely toxic dose in 10% of animals) acceptable as high dose for oncology');
    principles.push('ICH S9: High dose may also be the highest dose that can reasonably be given based on clinical formulation considerations');
  }
  if (['biologic', 'antibody', 'peptide'].includes(moleculeType)) {
    principles.push('ICH S6(R1): High dose should provide 10× the anticipated clinical exposure (AUC) where feasible');
    principles.push('Consider clinical dosing regimen — dosing frequency in animals should reflect clinical dosing (e.g., weekly for weekly biologics)');
  }
  return principles;
}

function buildTKDesign(isRodent: boolean, species: string, isBiologic: boolean, duration: string): TKDesign {
  const tkAnimals = isRodent ? 3 : 0; // Non-rodent: TK from main study animals
  const timepoints = isBiologic
    ? ['Pre-dose, 1h, 6h, 24h, 48h, 168h post-dose (Day 1 and last dosing day)']
    : ['Pre-dose, 0.5h, 1h, 2h, 4h, 8h, 24h post-dose (Day 1 and last dosing day)'];

  return {
    required: true,
    animalsPerSexPerGroup: tkAnimals,
    timepoints,
    analytes: isBiologic
      ? ['Parent compound (ELISA/ligand binding assay)', 'Anti-drug antibodies (ADA, neutralizing antibodies)']
      : ['Parent compound and major metabolites (LC-MS/MS)'],
    rationale: isRodent
      ? 'Satellite TK group used for rodent studies to avoid potential impact of serial blood draws on main study animals.'
      : `TK samples collected from main study animals (${species}) — adequate blood volume for serial sampling.`,
  };
}

function buildRepeatDoseEndpoints(isRodent: boolean, species: string, route: string, isBiologic: boolean, includeImmunotox?: boolean): string[] {
  const endpoints: string[] = [
    // In-life observations
    'Clinical observations (daily detailed, weekly comprehensive)',
    'Body weight (weekly) and body weight change',
    'Food consumption (weekly)',
    'Ophthalmologic examination (pre-study and terminal)',
    // Clinical pathology
    'Hematology: CBC with differential, reticulocyte count, platelet count',
    'Coagulation: PT, aPTT, fibrinogen',
    'Clinical chemistry: ALT, AST, ALP, GGT, total bilirubin, BUN, creatinine, glucose, total protein, albumin, globulin, cholesterol, triglycerides, electrolytes (Na, K, Cl, Ca, P)',
    'Urinalysis: volume, specific gravity, pH, protein, glucose, ketones, bilirubin, blood/occult blood, microscopic sediment',
    // Anatomic pathology
    'Gross pathology: complete necropsy with organ weights (absolute and relative to body weight and brain weight)',
    'Histopathology: comprehensive tissue list per OECD recommendations (≥40 tissues for rodent, ≥35 for non-rodent)',
  ];

  // Safety pharmacology endpoints (may be integrated)
  if (!isRodent) {
    endpoints.push(
      'Cardiovascular safety pharmacology: ECG (lead II, QT/QTc, HR, rhythm), blood pressure (systolic, diastolic, mean arterial)',
      'Respiratory: respiratory rate (may be integrated or standalone per ICH S7A)',
    );
  }

  if (isBiologic) {
    endpoints.push(
      'Immunogenicity assessment: ADA incidence, titer, neutralizing antibody characterization',
      'Cytokine panel (if mechanism warrants): TNF-alpha, IL-6, IL-1beta, IFN-gamma',
      'Immunophenotyping by flow cytometry: T cells (CD3/CD4/CD8), B cells, NK cells',
    );
  }

  if (includeImmunotox) {
    endpoints.push(
      'Immunotoxicity assessment per ICH S8: T-cell-dependent antibody response (TDAR, e.g., anti-KLH IgG)',
      'NK cell activity assay (if warranted by mechanism)',
      'Immunophenotyping panel if not already included',
    );
  }

  if (route === 'inhalation') {
    endpoints.push(
      'Bronchoalveolar lavage (BAL): cell counts, differential, total protein, LDH',
      'Respiratory function: tidal volume, respiratory rate, minute volume (plethysmography)',
    );
  }

  if (route === 'dermal' || route === 'topical') {
    endpoints.push(
      'Dermal scoring (Draize scale): erythema, edema at application site',
      'Application site histopathology with dermal thickness measurement',
    );
  }

  if (route === 'intravitreal' || route === 'ocular') {
    endpoints.push(
      'Ophthalmic examination: slit-lamp biomicroscopy, indirect ophthalmoscopy, IOP, ERG',
      'Ocular histopathology: retina, vitreous, lens, optic nerve',
    );
  }

  return endpoints;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Safety Margin / First-in-Human Dose Calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculateSafetyMarginInput {
  noaelMgKg: number;
  species: string;
  animalBodyWeightKg?: number;
  humanBodyWeightKg?: number;
  method?: 'body_surface_area' | 'auc_based' | 'cmax_based' | 'pharmacological';
  animalAuc?: number;
  humanProjectedAuc?: number;
  animalCmax?: number;
  humanProjectedCmax?: number;
  additionalSafetyFactor?: number;
  isOncology?: boolean;
  moleculeType?: MoleculeType;
}

export function calculateSafetyMargin(params: CalculateSafetyMarginInput): SafetyMarginResult {
  const {
    noaelMgKg,
    species,
    humanBodyWeightKg = 60,
    method = 'body_surface_area',
    animalAuc,
    humanProjectedAuc,
    animalCmax,
    humanProjectedCmax,
    additionalSafetyFactor = 10,
    isOncology = false,
  } = params;

  const speciesKey = normalizeSpeciesKey(species);
  const animalKm = KM_FACTORS[speciesKey];
  const humanKm = KM_FACTORS.human;
  const safetyFactor = SAFETY_FACTORS[speciesKey];
  const calculations: CalculationStep[] = [];
  const warnings: string[] = [];

  if (!animalKm) {
    return {
      hed: 0,
      hedMethod: 'error',
      mrsd: 0,
      mrsdUnit: 'mg/kg',
      safetyFactor: 0,
      safetyMargin: 0,
      interpretation: `Unknown species "${species}". Supported species: ${Object.keys(KM_FACTORS).join(', ')}.`,
      warnings: [`Species "${species}" not found in Km factor table.`],
      calculations: [],
      citations: [ICH_CITATIONS.FDA_FIH],
    };
  }

  // Step 1: Calculate HED using body surface area (FDA 2005 Guidance)
  const hed = noaelMgKg * (animalKm / humanKm);
  calculations.push({
    step: 'Human Equivalent Dose (HED) via body surface area',
    formula: 'HED = NOAEL (mg/kg) x (animal Km / human Km)',
    values: { noaelMgKg, animalKm, humanKm, species: speciesKey },
    result: Math.round(hed * 10000) / 10000,
  });

  // Step 2: Apply safety factor to get MRSD
  const effectiveSafetyFactor = additionalSafetyFactor;
  const mrsd = hed / effectiveSafetyFactor;
  calculations.push({
    step: 'Maximum Recommended Starting Dose (MRSD)',
    formula: 'MRSD = HED / safety factor',
    values: { hed: Math.round(hed * 10000) / 10000, safetyFactor: effectiveSafetyFactor },
    result: Math.round(mrsd * 10000) / 10000,
  });

  // Step 3: Convert to total mg for a 60 kg human
  const mrsdTotalMg = mrsd * humanBodyWeightKg;
  calculations.push({
    step: 'MRSD as total dose',
    formula: 'MRSD (total mg) = MRSD (mg/kg) x human body weight (kg)',
    values: { mrsdMgKg: Math.round(mrsd * 10000) / 10000, humanBodyWeightKg },
    result: Math.round(mrsdTotalMg * 100) / 100,
  });

  // AUC-based margin if data provided
  let aucMargin: number | undefined;
  if (animalAuc && humanProjectedAuc && humanProjectedAuc > 0) {
    aucMargin = animalAuc / humanProjectedAuc;
    calculations.push({
      step: 'AUC-based safety margin',
      formula: 'AUC margin = Animal AUC at NOAEL / Human projected AUC at MRSD',
      values: { animalAuc, humanProjectedAuc },
      result: Math.round(aucMargin * 100) / 100,
    });
    if (aucMargin < 10 && !isOncology) {
      warnings.push(`AUC-based safety margin (${Math.round(aucMargin * 100) / 100}x) is below the typically recommended 10x margin. Consider a lower starting dose.`);
    }
  }

  // Cmax-based margin if data provided
  let cmaxMargin: number | undefined;
  if (animalCmax && humanProjectedCmax && humanProjectedCmax > 0) {
    cmaxMargin = animalCmax / humanProjectedCmax;
    calculations.push({
      step: 'Cmax-based safety margin',
      formula: 'Cmax margin = Animal Cmax at NOAEL / Human projected Cmax at MRSD',
      values: { animalCmax, humanProjectedCmax },
      result: Math.round(cmaxMargin * 100) / 100,
    });
    if (cmaxMargin < 10 && !isOncology) {
      warnings.push(`Cmax-based safety margin (${Math.round(cmaxMargin * 100) / 100}x) is below 10x. Relevant for compounds with Cmax-driven toxicity (e.g., cardiovascular, CNS effects).`);
    }
  }

  // Build interpretation
  const interpretation = buildSafetyMarginInterpretation(
    hed, mrsd, mrsdTotalMg, aucMargin, cmaxMargin, speciesKey, effectiveSafetyFactor, isOncology, method, humanBodyWeightKg,
  );

  // Add method-specific warnings
  if (method === 'body_surface_area') {
    warnings.push(
      'BSA-based HED conversion is the default FDA approach but may not be appropriate for all compound types. For biologics, pharmacokinetic scaling or PAD (pharmacologically active dose) approaches may be more appropriate (ICH S6(R1)).',
    );
  }

  if (isOncology) {
    warnings.push(
      'ICH S9: For anticancer agents in patients with advanced disease, the MRSD may be 1/10 the STD10 (in mg/m2) in rodent or 1/6 the HNSTD in non-rodent rather than using the 10x safety factor.',
    );
  }

  return {
    hed: Math.round(hed * 10000) / 10000,
    hedMethod: 'body_surface_area (Km factor)',
    mrsd: Math.round(mrsd * 10000) / 10000,
    mrsdUnit: 'mg/kg',
    safetyFactor: effectiveSafetyFactor,
    safetyMargin: safetyFactor,
    aucMargin: aucMargin ? Math.round(aucMargin * 100) / 100 : undefined,
    cmaxMargin: cmaxMargin ? Math.round(cmaxMargin * 100) / 100 : undefined,
    interpretation,
    warnings,
    calculations,
    citations: [ICH_CITATIONS.FDA_FIH, ICH_CITATIONS.M3R2, ...(isOncology ? [ICH_CITATIONS.S9] : [])],
  };
}

function normalizeSpeciesKey(species: string): string {
  const s = species.toLowerCase().trim();
  if (s.includes('cynomolgus') || s.includes('rhesus') || s.includes('monkey') || s === 'nhp' || s === 'primate') return 'nhp';
  if (s.includes('beagle') || s === 'dog') return 'dog';
  if (s.includes('minipig') || s.includes('micropig') || s.includes('gottingen') || s.includes('yucatan')) return 'minipig';
  if (s.includes('rabbit')) return 'rabbit';
  if (s.includes('guinea')) return 'guinea_pig';
  if (s.includes('hamster')) return 'hamster';
  if (s.includes('mouse')) return 'mouse';
  if (s.includes('rat') || s.includes('sprague') || s.includes('wistar')) return 'rat';
  return s;
}

function buildSafetyMarginInterpretation(
  hed: number, mrsd: number, mrsdTotalMg: number,
  aucMargin: number | undefined, cmaxMargin: number | undefined,
  species: string, safetyFactor: number, isOncology: boolean,
  method: string, humanBW: number,
): string {
  const parts: string[] = [];
  parts.push(
    `Based on the ${species} NOAEL, the Human Equivalent Dose (HED) is ${(Math.round(hed * 10000) / 10000).toFixed(4)} mg/kg using the body surface area (Km factor) method per FDA 2005 Guidance.`,
  );
  parts.push(
    `Applying a ${safetyFactor}x safety factor yields a Maximum Recommended Starting Dose (MRSD) of ${(Math.round(mrsd * 10000) / 10000).toFixed(4)} mg/kg (${(Math.round(mrsdTotalMg * 100) / 100).toFixed(2)} mg total for a ${humanBW} kg adult).`,
  );

  if (aucMargin !== undefined) {
    parts.push(
      `AUC-based safety margin: ${(Math.round(aucMargin * 100) / 100).toFixed(1)}x. ${aucMargin >= 10 ? 'This exceeds the recommended 10x margin.' : 'This is below the recommended 10x margin — consider dose adjustment or additional pharmacology review.'}`,
    );
  }
  if (cmaxMargin !== undefined) {
    parts.push(
      `Cmax-based safety margin: ${(Math.round(cmaxMargin * 100) / 100).toFixed(1)}x. Cmax margins are particularly relevant for compounds with acute, peak-concentration-driven toxicities (e.g., cardiovascular, infusion reactions).`,
    );
  }

  if (isOncology) {
    parts.push('For oncology indications (ICH S9), a 1/10 STD10 or 1/6 HNSTD approach may also be considered for dose selection.');
  }

  parts.push('The MRSD should be the lowest value derived from all relevant species and methods. Additional factors (novelty of target, steep dose-response, non-monitorable toxicity, irreversible toxicity) may warrant a larger safety factor.');

  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Genotoxicity Battery Design
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignGenotoxBatteryInput {
  moleculeType: MoleculeType;
  therapeuticArea?: TherapeuticArea;
  isOncology?: boolean;
  knownStructuralAlerts?: string[];
  integrateIntoRepeatDose?: boolean;
  previousResults?: { assay: string; result: 'positive' | 'negative' | 'equivocal' }[];
}

export function designGenotoxBattery(params: DesignGenotoxBatteryInput): GenotoxBatteryResult {
  const { moleculeType, previousResults, knownStructuralAlerts } = params;
  const isOncology = params.isOncology || params.therapeuticArea === 'oncology';
  const isBiologic = ['biologic', 'antibody', 'peptide', 'adc'].includes(moleculeType);
  const integrateIntoRepeatDose = params.integrateIntoRepeatDose ?? false;
  const modifications: string[] = [];
  let followUpRequired = false;
  const followUpStudies: GenotoxAssay[] = [];

  // ICH S6(R1): Standard genotoxicity battery not required for biologics
  if (isBiologic && moleculeType !== 'adc') {
    return {
      standardBattery: [],
      modifications: [
        'ICH S6(R1) Section 6: Standard genotoxicity studies are not applicable to biotechnology-derived pharmaceuticals (proteins, peptides, antibodies) as they do not interact directly with DNA or chromosomal material.',
        'Genotoxicity testing is not warranted unless there is cause for concern (e.g., novel conjugated compound, organic linker, or non-protein component).',
      ],
      followUpRequired: false,
      followUpStudies: [],
      weightOfEvidence: 'Not applicable for biologics per ICH S6(R1). No genotoxicity testing required unless specific structural concern exists.',
      regulatoryJustification: 'Per ICH S6(R1) Section 6, the standard battery of genotoxicity tests is not needed for biotechnology-derived pharmaceuticals. This applies to recombinant proteins, monoclonal antibodies, and peptides. The scientific rationale is that large molecular weight biologics do not penetrate cells to interact with DNA.',
      citations: [ICH_CITATIONS.S6R1, ICH_CITATIONS.S2R1],
    };
  }

  // Standard battery for small molecules (and ADCs — the small-molecule payload requires testing)
  let standardBattery = [...STANDARD_GENOTOX_BATTERY];

  // ADC special handling
  if (moleculeType === 'adc') {
    modifications.push(
      'ADC: Genotoxicity testing required for the cytotoxic payload/linker component (small molecule) per ICH S6(R1) and ICH S9.',
      'Test the unconjugated payload (warhead) and any novel linker-payload intermediate in the standard battery.',
      'The intact ADC generally does not require genotoxicity testing.',
    );
  }

  // ICH S2(R1) Option 2: Integration of in vivo micronucleus into repeat-dose study
  if (integrateIntoRepeatDose) {
    modifications.push(
      'ICH S2(R1) Option 2 applied: In vivo micronucleus assessment integrated into a repeat-dose toxicity study. Bone marrow sampling at terminal sacrifice from the repeat-dose study.',
      'This approach reduces animal use (3Rs) and is accepted by FDA, EMA, and PMDA.',
      'Ensure the repeat-dose study uses adequate dose levels (up to MTD or limit dose) and appropriate duration (≥28 days preferred for integration).',
    );
  }

  // ICH S9: Reduced battery for oncology
  if (isOncology) {
    modifications.push(
      'ICH S9: For anticancer pharmaceuticals, a reduced genotoxicity assessment may be acceptable to support initial clinical trials.',
      'Ames test and in vivo micronucleus (or integration into repeat-dose study) may be sufficient pre-Phase 1.',
      'Complete battery should be available before Phase 3 / marketing authorization.',
    );
  }

  // Evaluate previous results for follow-up
  if (previousResults && previousResults.length > 0) {
    const positiveOrEquivocal = previousResults.filter(r => r.result !== 'negative');

    if (positiveOrEquivocal.length > 0) {
      followUpRequired = true;

      for (const result of positiveOrEquivocal) {
        if (result.assay.toLowerCase().includes('ames') || result.assay.toLowerCase().includes('bacterial')) {
          // Positive Ames — needs in vivo follow-up for gene mutation
          followUpStudies.push(FOLLOWUP_GENOTOX_ASSAYS[1]); // Transgenic rodent
          modifications.push(
            `Positive/equivocal result in ${result.assay}: In vivo transgenic rodent gene mutation assay (OECD TG 488) recommended as follow-up to assess in vivo relevance.`,
          );
        }
        if (result.assay.toLowerCase().includes('chromosome') || result.assay.toLowerCase().includes('micronucleus') && result.assay.toLowerCase().includes('vitro')) {
          // Positive in vitro clastogenicity — in vivo comet
          followUpStudies.push(FOLLOWUP_GENOTOX_ASSAYS[0]); // In vivo comet
          modifications.push(
            `Positive/equivocal result in ${result.assay}: In vivo comet assay (OECD TG 489) recommended to assess in vivo relevance of in vitro clastogenicity finding. Target tissues should include liver and a site-of-contact tissue.`,
          );
        }
      }
    }
  }

  // Structural alerts
  if (knownStructuralAlerts && knownStructuralAlerts.length > 0) {
    modifications.push(
      `Structural alerts identified (${knownStructuralAlerts.join(', ')}): Consider additional mechanistic studies and weight-of-evidence assessment. Structural alerts alone do not mandate additional testing but should be factored into the overall genotoxicity risk assessment.`,
    );
  }

  // Weight of evidence assessment
  const weightOfEvidence = buildWeightOfEvidence(previousResults, knownStructuralAlerts, followUpRequired);

  const regulatoryJustification = [
    'Standard genotoxicity battery designed per ICH S2(R1) (2011):',
    'Option 1 (standard): Bacterial reverse mutation test (OECD TG 471) + in vitro chromosomal aberration or micronucleus (OECD TG 473/487) + in vivo micronucleus (OECD TG 474).',
    integrateIntoRepeatDose ? 'Option 2 applied: in vivo micronucleus integrated into repeat-dose study.' : '',
    'All studies should be conducted under GLP (21 CFR Part 58 / OECD GLP Principles).',
    'Complete battery required before first-in-human dosing for non-oncology indications.',
  ].filter(Boolean).join(' ');

  return {
    standardBattery,
    modifications,
    followUpRequired,
    followUpStudies,
    weightOfEvidence,
    regulatoryJustification,
    citations: [ICH_CITATIONS.S2R1, ...(isBiologic ? [ICH_CITATIONS.S6R1] : []), ...(isOncology ? [ICH_CITATIONS.S9] : [])],
  };
}

function buildWeightOfEvidence(
  previousResults?: { assay: string; result: 'positive' | 'negative' | 'equivocal' }[],
  structuralAlerts?: string[],
  followUpRequired?: boolean,
): string {
  if (!previousResults || previousResults.length === 0) {
    return 'No prior genotoxicity data available. Standard battery to be conducted. Weight-of-evidence assessment will be performed after completion of all studies per ICH S2(R1) Section 6.';
  }

  const negativeCount = previousResults.filter(r => r.result === 'negative').length;
  const positiveCount = previousResults.filter(r => r.result === 'positive').length;
  const equivocalCount = previousResults.filter(r => r.result === 'equivocal').length;
  const totalCount = previousResults.length;

  if (positiveCount === 0 && equivocalCount === 0) {
    return `All ${totalCount} completed genotoxicity assay(s) negative. ${structuralAlerts && structuralAlerts.length > 0 ? 'Structural alerts noted but negative test results provide reassurance.' : 'No structural alerts.'} Low genotoxic risk.`;
  }

  if (positiveCount > 0) {
    return `${positiveCount} of ${totalCount} assay(s) positive. ${followUpRequired ? 'Follow-up in vivo study(ies) required to assess in vivo relevance.' : ''} Weight-of-evidence assessment per ICH S2(R1) Section 6 must consider: (1) reproducibility, (2) dose-response, (3) cytotoxicity at positive doses, (4) metabolic activation conditions, (5) relevance of bacterial/in vitro findings to in vivo genotoxic risk. A positive in vivo result generally indicates genotoxic potential requiring regulatory discussion.`;
  }

  return `${equivocalCount} equivocal result(s) out of ${totalCount} assay(s). Consider repeat testing with protocol modifications (e.g., extended exposure, additional dose levels) before follow-up in vivo studies. Document the rationale for the equivocal classification.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Carcinogenicity Assessment
// ─────────────────────────────────────────────────────────────────────────────

export interface AssessCarcinogenicityInput {
  clinicalDurationMonths: number;
  moleculeType: MoleculeType;
  therapeuticArea?: TherapeuticArea;
  indication?: string;
  isLifeThreatening?: boolean;
  isOncology?: boolean;
  genotoxicityResults?: { assay: string; result: 'positive' | 'negative' | 'equivocal' }[];
  hasStructuralAlert?: boolean;
  hasPreneoplasticLesions?: boolean;
  hasEndocrineActivity?: boolean;
  isImmunosuppressive?: boolean;
  patientPopulation?: string;
}

export function assessCarcinogenicityNeed(params: AssessCarcinogenicityInput): CarcinogenicityAssessment {
  const {
    clinicalDurationMonths,
    moleculeType,
    isLifeThreatening = false,
    genotoxicityResults,
    hasStructuralAlert = false,
    hasPreneoplasticLesions = false,
    hasEndocrineActivity = false,
    isImmunosuppressive = false,
  } = params;
  const isOncology = params.isOncology || params.therapeuticArea === 'oncology';
  const isBiologic = ['biologic', 'antibody', 'peptide'].includes(moleculeType);
  const triggersMet: string[] = [];
  const triggersNotMet: string[] = [];

  // Evaluate each ICH S1A trigger
  // 1. Duration of use
  if (clinicalDurationMonths >= 6) {
    triggersMet.push(CARCINOGENICITY_TRIGGERS.duration);
  } else {
    triggersNotMet.push(`Clinical duration (${clinicalDurationMonths} months) is below the 6-month threshold per ICH S1A`);
  }

  // 2. Genotoxicity concerns
  const hasPositiveGenotox = genotoxicityResults?.some(r => r.result === 'positive') ?? false;
  if (hasPositiveGenotox) {
    triggersMet.push(CARCINOGENICITY_TRIGGERS.genotoxPositive);
  } else {
    triggersNotMet.push('No positive genotoxicity findings');
  }

  // 3. Structural alerts
  if (hasStructuralAlert) {
    triggersMet.push(CARCINOGENICITY_TRIGGERS.structuralAlert);
  }

  // 4. Preneoplastic lesions in repeat-dose studies
  if (hasPreneoplasticLesions) {
    triggersMet.push(CARCINOGENICITY_TRIGGERS.preneoplastic);
  }

  // 5. Endocrine activity
  if (hasEndocrineActivity) {
    triggersMet.push(CARCINOGENICITY_TRIGGERS.endocrine);
  }

  // 6. Immunosuppression in non-life-threatening indication
  if (isImmunosuppressive && !isLifeThreatening) {
    triggersMet.push(CARCINOGENICITY_TRIGGERS.immunosuppressive);
  }

  // Determine if carcinogenicity studies are required
  const required = triggersMet.length > 0 && !isOncology && !(isLifeThreatening && clinicalDurationMonths < 6);

  // ICH S1A: Not required for oncology or life-threatening indications with short life expectancy
  if (isOncology) {
    triggersNotMet.push('ICH S9/S1A: Carcinogenicity studies are generally not required for anticancer agents intended to treat patients with advanced cancer and limited life expectancy');
  }

  // ICH S6(R1): Biologics considerations
  if (isBiologic) {
    triggersNotMet.push('ICH S6(R1) Section 8: Standard 2-year rodent carcinogenicity bioassays are generally not appropriate for biologics. Weight-of-evidence approach recommended.');
  }

  // Build recommended design if required
  let recommendedDesign: CarcinogenicityDesign | undefined;
  let alternativeApproach: string | undefined;

  if (required && !isBiologic) {
    // ICH S1B(R1): Updated approach allows weight-of-evidence + one study
    recommendedDesign = {
      model: 'Tg.rasH2 transgenic mouse (6-month) — ICH S1B(R1) preferred alternative to 2-year mouse bioassay',
      duration: '6 months (26 weeks)',
      species: 'CByB6F1-Tg(HRAS)2Jic hemizygous mouse',
      groupDesign: '15 males + 15 females per group; 4 groups (vehicle, low, mid, high) + positive control (urethane or NMU)',
      doseSelection: 'Per ICH S1C(R2): High dose = MTD or limit dose (1000 mg/kg/day, or 1500 mg/kg/day if no genotoxic concern). Mid and low doses at appropriate multiples of clinical exposure.',
      statisticalApproach: 'Peto mortality-prevalence method for tumors observed at necropsy; Poly-3 adjusted trend test (Bieler-Williams); Fischer exact test for pairwise comparisons; historical control comparison for rare tumors',
      endpoints: [
        'Survival and cause of death analysis',
        'Body weight and food consumption (weekly for first 13 weeks, then biweekly)',
        'Clinical observations and palpable masses',
        'Complete gross necropsy with organ weights',
        'Comprehensive histopathology of all tissues (>40 tissues)',
        'Tumor incidence, multiplicity, latency, and type classification',
        'Statistical analysis of tumor rates with trend tests',
      ],
    };

    alternativeApproach = [
      'ICH S1B(R1) 2022 update: A weight-of-evidence (WoE) approach may be used to determine the need for and design of carcinogenicity studies.',
      'WoE factors include: genotoxicity data, pharmacological mechanism, target biology, structural alerts, chronic toxicity findings, hormonal perturbation, immunosuppression, clinical data.',
      'One rodent bioassay (traditionally the 2-year rat study) combined with the Tg.rasH2 6-month transgenic mouse model is the standard two-study approach.',
      'The 2-year rat bioassay may be waived if the WoE assessment provides sufficient evidence, per ICH S1B(R1) revision.',
    ].join(' ');
  }

  if (required && isBiologic) {
    alternativeApproach = [
      'ICH S6(R1): Standard 2-year carcinogenicity bioassays in rodents are generally inappropriate for biologics due to species specificity and immunogenicity.',
      'Alternative approaches include: (1) evaluation of the scientific literature on the target/pathway, (2) mechanistic studies (e.g., cell proliferation assays, tumor promotion studies), (3) monitoring in clinical trials with long-term follow-up.',
      'For biologics with immunosuppressive mechanisms, post-marketing pharmacovigilance for malignancy incidence is typically required.',
    ].join(' ');
  }

  const regulatoryJustification = required
    ? `Carcinogenicity assessment recommended based on ${triggersMet.length} trigger(s) per ICH S1A. ${isBiologic ? 'Weight-of-evidence approach per ICH S6(R1) instead of standard bioassay.' : 'Standard testing per ICH S1B(R1) and S1C(R2).'} Studies should be completed before NDA/MAA submission and are typically not required before Phase 3.`
    : `Carcinogenicity studies are not required at this time. ${triggersNotMet.join('; ')}.`;

  return {
    required,
    triggers: Object.values(CARCINOGENICITY_TRIGGERS),
    triggersMet,
    triggersNotMet,
    recommendedDesign,
    alternativeApproach,
    regulatoryJustification,
    citations: [ICH_CITATIONS.S1A, ICH_CITATIONS.S1B, ICH_CITATIONS.S1C, ...(isBiologic ? [ICH_CITATIONS.S6R1] : []), ...(isOncology ? [ICH_CITATIONS.S9] : [])],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Reproductive / Developmental Toxicology
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignReproToxInput {
  studyType: 'fertility' | 'embryo_fetal_development' | 'prenatal_postnatal' | 'all';
  moleculeType: MoleculeType;
  species?: string;
  phase: ClinicalPhase;
  therapeuticArea?: TherapeuticArea;
  isOncology?: boolean;
  patientPopulation?: 'men_only' | 'women_of_childbearing_potential' | 'both' | 'postmenopausal';
  includeJuvenile?: boolean;
  knownTeratogenicConcern?: boolean;
}

export function designReproToxStudy(params: DesignReproToxInput): ReproToxDesign[] {
  const { studyType, moleculeType, phase } = params;
  const isOncology = params.isOncology || params.therapeuticArea === 'oncology';
  const isBiologic = ['biologic', 'antibody', 'peptide', 'adc'].includes(moleculeType);
  const patientPopulation = params.patientPopulation ?? 'both';
  const results: ReproToxDesign[] = [];

  const studyTypes = studyType === 'all'
    ? ['fertility', 'embryo_fetal_development', 'prenatal_postnatal'] as const
    : [studyType] as const;

  for (const st of studyTypes) {
    switch (st) {
      case 'fertility':
        results.push(buildFertilityStudy(moleculeType, phase, isBiologic, isOncology, patientPopulation));
        break;
      case 'embryo_fetal_development':
        results.push(...buildEFDStudy(moleculeType, phase, isBiologic, isOncology, patientPopulation, params.knownTeratogenicConcern));
        break;
      case 'prenatal_postnatal':
        results.push(buildPPNDStudy(moleculeType, phase, isBiologic, isOncology, patientPopulation));
        break;
    }
  }

  return results;
}

function buildFertilityStudy(
  moleculeType: MoleculeType, phase: ClinicalPhase, isBiologic: boolean, isOncology: boolean, patientPop: string,
): ReproToxDesign {
  const segment = REPRO_STUDY_SEGMENTS.fertility;
  const specialConsiderations: string[] = [];

  // Timing relative to clinical development
  let timingRelativeToClinical: string;
  if (patientPop === 'men_only') {
    timingRelativeToClinical = 'ICH M3(R2): Male fertility study should be completed before initiation of large-scale or long-duration clinical trials (Phase 3). Preliminary information (e.g., histopathology of male reproductive organs from repeat-dose studies) is usually available earlier.';
  } else if (isOncology) {
    timingRelativeToClinical = 'ICH S9: Fertility studies are not required pre-approval for anticancer agents intended for patients with advanced cancer. Assessment of reproductive organs from repeat-dose studies can provide preliminary information. Dedicated fertility studies may be requested post-approval if the drug is subsequently developed for non-life-threatening indications.';
  } else {
    timingRelativeToClinical = 'ICH M3(R2): Fertility studies should be completed before Phase 3 initiation. For women of childbearing potential (WOCBP), male and female fertility data should be available before including WOCBP in clinical trials of >3 months duration without adequate contraception requirements.';
  }

  if (isBiologic) {
    specialConsiderations.push(
      'ICH S6(R1): Fertility studies in a pharmacologically relevant species. If only NHP is relevant, assessment of fertility may rely on reproductive organ evaluation from repeat-dose toxicity studies.',
      'For biologics, alternative study designs may be acceptable (e.g., histopathological evaluation of reproductive organs from chronic toxicity studies) when standard fertility studies are not feasible.',
    );
  }

  if (isOncology) {
    specialConsiderations.push(
      'ICH S9: Dedicated fertility studies not required for initial marketing approval of anticancer agents for advanced disease.',
      'Reproductive organ histopathology from repeat-dose studies may suffice.',
    );
  }

  return {
    studyType: segment.name,
    segment: segment.segment,
    species: isBiologic ? 'Pharmacologically relevant species (typically rat; NHP if only relevant species)' : segment.species,
    speciesJustification: isBiologic
      ? 'ICH S6(R1): Fertility assessment must be in a pharmacologically relevant species. Rat preferred if relevant; NHP fertility endpoints assessed from repeat-dose study reproductive organ histopathology.'
      : 'Rat is the standard species for fertility studies per ICH S5(R3). Extensive historical control data and well-characterized reproductive biology.',
    timing: `Male: dosing ${segment.maleDosingPeriod}. Female: dosing ${segment.femaleDosingPeriod}.`,
    timingRelativeToClinical,
    designElements: [
      { element: 'Male dosing', description: segment.maleDosingPeriod, groupSizes: segment.groupSize },
      { element: 'Female dosing', description: segment.femaleDosingPeriod, groupSizes: segment.groupSize },
      { element: 'Dose groups', description: 'Vehicle control + 3 dose levels. High dose: MTD or dose producing minimal maternal toxicity.', groupSizes: '4 groups' },
      { element: 'Mating', description: '1:1 mating ratio, 2-week mating period', groupSizes: 'N/A' },
      { element: 'Terminal sacrifice', description: 'Males: after mating confirmation. Females: GD 13-15 (Cesarean section).', groupSizes: 'All animals' },
    ],
    endpoints: segment.keyEndpoints,
    specialConsiderations,
    citations: [ICH_CITATIONS.S5R3, ICH_CITATIONS.M3R2, ...(isBiologic ? [ICH_CITATIONS.S6R1] : []), ...(isOncology ? [ICH_CITATIONS.S9] : [])],
  };
}

function buildEFDStudy(
  moleculeType: MoleculeType, phase: ClinicalPhase, isBiologic: boolean, isOncology: boolean,
  patientPop: string, knownTeratogenicConcern?: boolean,
): ReproToxDesign[] {
  const segment = REPRO_STUDY_SEGMENTS.efd;
  const results: ReproToxDesign[] = [];
  const specialConsiderations: string[] = [];

  // Timing relative to clinical phase
  let timingRelativeToClinical: string;
  if (isOncology) {
    timingRelativeToClinical = 'ICH S9: EFD studies are not required before Phase 1-2 for anticancer agents in patients with advanced disease if WOCBP employ adequate contraception. EFD studies should be available before inclusion of WOCBP without contraception or before marketing approval.';
  } else if (patientPop === 'men_only') {
    timingRelativeToClinical = 'ICH M3(R2): If the patient population is exclusively male, EFD studies are typically required before Phase 3 but not before early clinical trials. Male-mediated developmental toxicity is rare but should be considered.';
  } else {
    timingRelativeToClinical = 'ICH M3(R2): EFD studies in two species (rodent + rabbit) should be completed before including WOCBP in Phase 3 or large-scale Phase 2 trials, unless WOCBP are using highly effective contraception and pregnancy testing is performed. In the US (FDA), EFD studies are required before any WOCBP are enrolled, even with contraception.';
  }

  if (knownTeratogenicConcern) {
    specialConsiderations.push(
      'Known teratogenic concern: enhanced EFD study design recommended — additional dose levels, expanded fetal examination, satellite groups for maternal TK, and potential for prenatal/postnatal extension.',
    );
  }

  if (isBiologic) {
    specialConsiderations.push(
      'ICH S6(R1): EFD assessment in pharmacologically relevant species only. If antibody does not cross-react with rabbit target, only one species (rat) may be used if relevant.',
      'For monoclonal antibodies: IgG transfer across the placenta is minimal in rodents during organogenesis but significant in the 3rd trimester. Consider enhanced pre/postnatal assessment.',
      'ICH S6(R1) allows alternative EFD designs for biologics, including assessment in NHP using a modified study design with smaller group sizes.',
    );
  }

  // Rat EFD study
  results.push({
    studyType: segment.name,
    segment: segment.segment,
    species: isBiologic ? 'Rat (if pharmacologically relevant)' : 'Rat (Sprague-Dawley or equivalent)',
    speciesJustification: 'Rat is the standard rodent for EFD per ICH S5(R3). Well-characterized background malformation rates and extensive historical control databases.',
    timing: `Dosing GD 6-17 (rat). Cesarean section on GD 20-21.`,
    timingRelativeToClinical,
    designElements: [
      { element: 'Dosing period', description: 'GD 6 through GD 17 (period of organogenesis)', groupSizes: segment.groupSize },
      { element: 'Dose groups', description: 'Vehicle control + 3 dose levels. High dose should produce minimal maternal toxicity.', groupSizes: '4 groups' },
      { element: 'Cesarean section', description: 'GD 20-21. Uterine contents examined.', groupSizes: 'All females' },
      { element: 'Fetal examination', description: 'All live fetuses: external exam. 50% visceral (Wilson), 50% skeletal (Alizarin red S staining).', groupSizes: 'All fetuses' },
    ],
    endpoints: segment.keyEndpoints,
    specialConsiderations,
    citations: [ICH_CITATIONS.S5R3, ICH_CITATIONS.M3R2, ...(isBiologic ? [ICH_CITATIONS.S6R1] : [])],
  });

  // Rabbit EFD study (second species)
  if (!isBiologic || (isBiologic && moleculeType !== 'antibody')) {
    results.push({
      studyType: segment.name,
      segment: segment.segment,
      species: 'Rabbit (New Zealand White)',
      speciesJustification: 'Rabbit is the standard non-rodent for EFD per ICH S5(R3). High sensitivity to teratogens (e.g., thalidomide), different metabolic profile from rat, and established historical control data.',
      timing: `Dosing GD 6-18 (rabbit). Cesarean section on GD 28-29.`,
      timingRelativeToClinical,
      designElements: [
        { element: 'Dosing period', description: 'GD 6 through GD 18 (period of organogenesis)', groupSizes: segment.groupSize },
        { element: 'Dose groups', description: 'Vehicle control + 3 dose levels. Note: rabbits are sensitive to GI disturbance — dose selection must account for this.', groupSizes: '4 groups' },
        { element: 'Cesarean section', description: 'GD 28-29. Uterine contents examined.', groupSizes: 'All females' },
        { element: 'Fetal examination', description: 'All live fetuses: external, visceral (fresh dissection or Staples method), and skeletal (Alizarin red S).', groupSizes: 'All fetuses' },
      ],
      endpoints: segment.keyEndpoints,
      specialConsiderations: [
        'Rabbits are obligate nasal breathers — oral gavage requires experienced staff',
        'Rabbits are highly susceptible to GI flora disruption — antibiotics and some antimicrobials may cause fatal enteritis',
        'Food consumption monitoring is critical — inappetence is a common sign of toxicity in rabbits',
        ...(isBiologic ? ['Confirm pharmacological relevance of rabbit for the biologic — if target is not conserved, rabbit EFD may not be informative'] : []),
      ],
      citations: [ICH_CITATIONS.S5R3, ICH_CITATIONS.M3R2],
    });
  } else {
    // For monoclonal antibodies, rabbit may not be relevant
    results.push({
      studyType: segment.name,
      segment: segment.segment,
      species: 'Second species: NHP or alternative (if antibody does not cross-react with rabbit)',
      speciesJustification: 'ICH S6(R1): For monoclonal antibodies that do not bind the rabbit target, a second species EFD is only required if a second pharmacologically relevant species exists. NHP may be used with modified study design (smaller groups, enhanced pre/postnatal monitoring).',
      timing: 'NHP EFD: dosing GD 20-50 (period of organogenesis). Delivery at term or Cesarean section near term.',
      timingRelativeToClinical,
      designElements: [
        { element: 'Dosing period', description: 'GD 20 through GD 50 (organogenesis in cynomolgus monkey)', groupSizes: '12-16 females/group' },
        { element: 'Dose groups', description: 'Vehicle control + 2-3 dose levels.', groupSizes: '3-4 groups' },
        { element: 'Delivery', description: 'Natural delivery preferred for postnatal assessment. Cesarean section near term if needed for fetal evaluation.', groupSizes: 'All females' },
      ],
      endpoints: [
        'Maternal parameters (body weight, clinical signs, TK)',
        'Pregnancy outcome (abortions, stillbirths)',
        'Fetal/infant growth, external malformations',
        'Skeletal evaluation by radiography (if Cesarean) or physical examination',
        'Immunophenotyping of neonates (for immunomodulatory biologics)',
      ],
      specialConsiderations: [
        'NHP EFD studies are resource-intensive and have small group sizes — statistical power is limited',
        'Enhanced pre/postnatal assessment (ePPND) combining EFD and PPND endpoints in a single NHP study is increasingly accepted',
        'For monoclonal antibodies, placental transfer in NHP occurs primarily in the 3rd trimester — consider extending dosing through GD 140',
      ],
      citations: [ICH_CITATIONS.S5R3, ICH_CITATIONS.S6R1],
    });
  }

  return results;
}

function buildPPNDStudy(
  moleculeType: MoleculeType, phase: ClinicalPhase, isBiologic: boolean, isOncology: boolean, patientPop: string,
): ReproToxDesign {
  const segment = REPRO_STUDY_SEGMENTS.ppnd;
  const specialConsiderations: string[] = [];

  let timingRelativeToClinical: string;
  if (isOncology) {
    timingRelativeToClinical = 'ICH S9: PPND studies are typically not required for anticancer agents in advanced disease. If needed, they may be required post-approval if the indication expands to non-life-threatening conditions.';
  } else {
    timingRelativeToClinical = 'ICH M3(R2): PPND study should be submitted as part of the marketing application. Not required before Phase 3 initiation, but should be completed before NDA/MAA submission.';
  }

  if (isBiologic) {
    specialConsiderations.push(
      'ICH S6(R1): For monoclonal antibodies, consider an enhanced pre/postnatal development (ePPND) study in NHP that combines EFD and PPND endpoints in a single study.',
      'ePPND design: dose from GD 20 through parturition (or GD 140), allow natural delivery, assess offspring through 6-12 months of age.',
      'Include immunological assessment of offspring: immunophenotyping, vaccine response (TDAR), lymphoid tissue histopathology.',
    );
  }

  return {
    studyType: segment.name,
    segment: segment.segment,
    species: isBiologic ? 'Rat or NHP (pharmacologically relevant species)' : 'Rat',
    speciesJustification: isBiologic
      ? 'ICH S6(R1): PPND assessment should be in a pharmacologically relevant species. For antibodies, NHP ePPND design preferred to capture 3rd-trimester placental transfer.'
      : 'Rat is the standard species for PPND per ICH S5(R3). Allows assessment of F1 generation development through sexual maturity.',
    timing: segment.dosingPeriod,
    timingRelativeToClinical,
    designElements: [
      { element: 'Dosing period (F0 dams)', description: 'GD 6 through lactation day 20', groupSizes: segment.groupSize },
      { element: 'Dose groups', description: 'Vehicle control + 3 dose levels', groupSizes: '4 groups' },
      { element: 'F1 assessment', description: 'Physical development, behavioral/functional observations, learning/memory, reproductive assessment', groupSizes: '1 pup/sex/litter selected for behavioral assessment, all pups for physical development' },
      { element: 'F1 mating', description: 'F1 animals mated to assess fertility, pregnancy outcome, and F2 viability', groupSizes: '1 male + 1 female per litter' },
    ],
    endpoints: segment.keyEndpoints,
    specialConsiderations,
    citations: [ICH_CITATIONS.S5R3, ICH_CITATIONS.M3R2, ...(isBiologic ? [ICH_CITATIONS.S6R1] : []), ...(isOncology ? [ICH_CITATIONS.S9] : [])],
  };
}
