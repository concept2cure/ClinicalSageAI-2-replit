/**
 * Clinical Pharmacology deterministic knowledge base.
 * Pure TypeScript — no LLM, no network, no database.
 * @module server/services/clinical-pharmacology/clinical-pharmacology-knowledge
 */

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface DDIRiskParams {
  perpetratorCmax_uM: number;
  perpetratorKi_uM?: number;
  perpetratorGutConcentration_uM?: number;
  cyp_enzyme?: string;
  victimFractionMetabolized?: number;
  victimTherapeuticIndex: string;
  isInducer?: boolean;
  transporterTarget?: string;
  perpetratorIC50_transporter_uM?: number;
}

export interface DDIRiskResult {
  riskCategory: string;
  R1_value: number | null;
  R1_interpretation: string;
  gutInteractionRatio: number | null;
  recommendedStudyDesign: string;
  acceptanceCriteria: string;
  labelingRecommendation: string;
  regulatoryBasis: string[];
  mechanisticDetail: string;
}

export interface QTcRiskParams {
  hergIC50_uM: number;
  therapeuticCmax_uM: number;
  freefractionPercent?: number;
  drugClass?: string;
  clinicalQTcData?: boolean;
  ionChannelPanel?: boolean;
}

export interface QTcRiskResult {
  riskCategory: string;
  safetyMargin: number;
  safetyMarginInterpretation: string;
  recommendedApproach: string;
  cipaApplicable: boolean;
  requiredStudies: string[];
  ionChannelAssessment: { channel: string; requirement: string }[];
  regulatoryBasis: string[];
}

export interface OrganImpairmentParams {
  eliminationPathway: string;
  fractionExcretedUnchanged: number;
  proteinBinding?: number;
  therapeuticIndex: string;
  primaryMetabolicPathway?: string;
}

export interface OrganImpairmentResult {
  studyType: string;
  studyDesignRationale: string;
  groups: { name: string; criteria: string; n: number }[];
  pkParametersToEvaluate: string[];
  doseAdjustmentFramework: string;
  dialysisAssessment: string | null;
  proteinBindingAssessment: string | null;
  regulatoryBasis: string[];
}

export interface CYPPhenotypeParams {
  gene: string;
  diplotype?: string;
  activityScore?: number;
}

export interface CYPPhenotypeResult {
  phenotype: string;
  activityScore: number | null;
  metabolizerStatus: string;
  populationFrequencies: { population: string; frequency: string }[];
  clinicalImplications: string;
  dosingGuidance: string;
  cpicRecommendation: string;
  labelingStatus: string;
  regulatoryBasis: string[];
}

export interface BioanalyticalMethodParams {
  analyteType: string;
  matrix: string;
  intendedUse: string;
  sensitivityRequired_ngPerMl?: number;
  isADA?: boolean;
}

export interface BioanalyticalMethodResult {
  recommendedPlatform: string;
  platformRationale: string;
  validationParameters: { parameter: string; requirement: string; acceptanceCriteria: string }[];
  runAcceptanceCriteria: string[];
  isrRequirements: { criterion: string; threshold: string }[];
  stabilityRequirements: { type: string; condition: string; minimumDuration: string }[];
  regulatoryBasis: string[];
}

export interface FoodEffectParams {
  bcsClass: string;
  dosageForm: string;
  logP?: number;
  solubilityPHDependent?: boolean;
  modifiedRelease?: boolean;
}

export interface FoodEffectResult {
  studyRequired: boolean;
  studyRequiredRationale: string;
  predictedEffect: string;
  studyDesign: { type: string; arms: string[]; sampleSize: number; washout: string } | null;
  mealComposition: { description: string; calories: string; fatContent: string };
  labelingImplication: string;
  bcsRationale: string;
  regulatoryBasis: string[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const REGULATORY_CITATIONS = {
  fda_ddi_2020: 'FDA Guidance: "In Vitro Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions" (January 2020)',
  ich_m12_2024: 'ICH M12: "Drug Interaction Studies" (May 2024)',
  ich_e14_2005: 'ICH E14: "The Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs" (2005)',
  ich_e14_qna_r3: 'ICH E14/S7B Q&A (R3): "Questions and Answers — Clinical and Nonclinical Evaluation of QT/QTc Interval Prolongation" (2023)',
  ich_s7b: 'ICH S7B: "The Nonclinical Evaluation of the Potential for Delayed Ventricular Repolarization" (2005)',
  fda_renal_2020: 'FDA Guidance: "Pharmacokinetics in Patients with Impaired Renal Function — Study Design, Data Analysis, and Impact on Dosing" (September 2020)',
  fda_hepatic_2003: 'FDA Guidance: "Pharmacokinetics in Patients with Impaired Hepatic Function — Study Design, Data Analysis, and Impact on Dosing and Labeling" (May 2003, updated 2020)',
  fda_food_2002: 'FDA Guidance: "Food-Effect Bioavailability and Fed Bioequivalence Studies" (December 2002)',
  ich_m10_2022: 'ICH M10: "Bioanalytical Method Validation and Study Sample Analysis" (May 2022)',
  cpic_2023: 'Clinical Pharmacogenetics Implementation Consortium (CPIC) Guidelines (2019-2023)',
  dpwg_2023: 'Dutch Pharmacogenetics Working Group (DPWG) Guidelines (2023)',
  fda_pgx_table: 'FDA Table of Pharmacogenomic Biomarkers in Drug Labeling (updated 2024)',
} as const;

const CYP_SENSITIVE_SUBSTRATES = {
  CYP1A2: { sensitive: ['tizanidine', 'caffeine', 'melatonin', 'ramelteon', 'alosetron', 'duloxetine', 'theophylline'], moderate: ['clozapine', 'pirfenidone', 'riluzole'] },
  CYP2B6: { sensitive: ['bupropion', 'efavirenz'], moderate: ['cyclophosphamide', 'ifosfamide', 'methadone'] },
  CYP2C8: { sensitive: ['repaglinide', 'dasabuvir'], moderate: ['montelukast', 'pioglitazone', 'rosiglitazone', 'loperamide'] },
  CYP2C9: { sensitive: ['warfarin (S)', 'celecoxib'], moderate: ['tolbutamide', 'glimepiride', 'glipizide'] },
  CYP2C19: { sensitive: ['omeprazole', 'lansoprazole', 'esomeprazole (S)', 'clobazam (N-desmethyl)'], moderate: ['voriconazole', 'clopidogrel (activation)', 'diazepam'] },
  CYP2D6: { sensitive: ['dextromethorphan', 'atomoxetine', 'eliglustat', 'nebivolol', 'perphenazine', 'pimozide', 'thioridazine', 'tolterodine', 'venlafaxine'], moderate: ['codeine (activation)', 'tamoxifen (activation)', 'tramadol (activation)', 'metoprolol', 'nortriptyline', 'desipramine'] },
  CYP3A4: { sensitive: ['midazolam', 'triazolam', 'alfentanil', 'buspirone', 'felodipine', 'lovastatin', 'simvastatin', 'sildenafil', 'vardenafil', 'darifenacin', 'everolimus', 'ibrutinib', 'naloxegol', 'nisoldipine', 'tipranavir'], moderate: ['alprazolam', 'aprepitant', 'atorvastatin', 'budesonide', 'ciclesonide', 'colchicine', 'eletriptan', 'eplerenone', 'maraviroc', 'quetiapine', 'tolvaptan'] },
} as const;

const CYP_INDEX_INHIBITORS = {
  CYP1A2: { strong: ['fluvoxamine'], moderate: ['ciprofloxacin', 'mexiletine', 'vemurafenib'] },
  CYP2B6: { strong: ['ticlopidine'], moderate: ['clopidogrel'] },
  CYP2C8: { strong: ['gemfibrozil', 'clopidogrel glucuronide'], moderate: ['trimethoprim'] },
  CYP2C9: { strong: ['fluconazole (high dose)'], moderate: ['fluconazole (low dose)', 'amiodarone', 'miconazole'] },
  CYP2C19: { strong: ['fluconazole', 'fluvoxamine', 'ticlopidine'], moderate: ['omeprazole', 'voriconazole', 'fluoxetine'] },
  CYP2D6: { strong: ['paroxetine', 'fluoxetine', 'quinidine', 'bupropion'], moderate: ['duloxetine', 'terbinafine', 'abiraterone', 'cinacalcet'] },
  CYP3A4: { strong: ['itraconazole', 'ketoconazole', 'clarithromycin', 'ritonavir', 'cobicistat', 'posaconazole', 'voriconazole'], moderate: ['diltiazem', 'erythromycin', 'fluconazole', 'verapamil', 'aprepitant', 'crizotinib', 'dronedarone', 'grapefruit juice'] },
} as const;

const CYP_INDUCERS = {
  CYP1A2: { strong: ['smoking (PAH)'], moderate: ['phenytoin', 'rifampin'] },
  CYP2B6: { strong: ['rifampin', 'efavirenz'], moderate: ['carbamazepine'] },
  CYP2C8: { strong: ['rifampin'], moderate: ['carbamazepine'] },
  CYP2C9: { strong: ['rifampin'], moderate: ['carbamazepine', 'enzalutamide'] },
  CYP2C19: { strong: ['rifampin'], moderate: ['efavirenz', 'enzalutamide'] },
  CYP3A4: { strong: ['rifampin', 'phenytoin', 'carbamazepine', 'St. John\'s wort', 'enzalutamide', 'mitotane', 'apalutamide'], moderate: ['bosentan', 'efavirenz', 'etravirine', 'modafinil'] },
} as const;

const TRANSPORTER_CUTOFFS = {
  'P-gp': { clinicalCutoff_IC50_uM: 'IC50 ≤ [I]1 / 0.1 threshold or [I]2,gut / IC50 ≥ 10', referenceInhibitors: ['cyclosporine', 'verapamil', 'quinidine', 'ritonavir', 'itraconazole'], substrates: ['digoxin', 'dabigatran', 'fexofenadine', 'loperamide', 'talinolol'] },
  BCRP: { clinicalCutoff_IC50_uM: '[I]1 / IC50 ≥ 0.1 or [I]gut / IC50 ≥ 10', referenceInhibitors: ['curcumin', 'eltrombopag', 'cyclosporine'], substrates: ['rosuvastatin', 'sulfasalazine', 'topotecan'] },
  OATP1B1: { clinicalCutoff_IC50_uM: 'R value ≥ 1.25 where R = 1 + (fu,p × Cmax,ss,u / IC50)', referenceInhibitors: ['rifampin', 'cyclosporine', 'gemfibrozil'], substrates: ['pitavastatin', 'pravastatin', 'rosuvastatin', 'atorvastatin', 'repaglinide'] },
  OATP1B3: { clinicalCutoff_IC50_uM: 'R value ≥ 1.25', referenceInhibitors: ['rifampin', 'cyclosporine'], substrates: ['telmisartan', 'valsartan', 'olmesartan', 'docetaxel'] },
  OAT1: { clinicalCutoff_IC50_uM: 'Cmax,u / IC50 ≥ 0.1', referenceInhibitors: ['probenecid'], substrates: ['adefovir', 'cidofovir', 'methotrexate', 'furosemide'] },
  OAT3: { clinicalCutoff_IC50_uM: 'Cmax,u / IC50 ≥ 0.1', referenceInhibitors: ['probenecid'], substrates: ['pravastatin', 'benzylpenicillin', 'furosemide', 'methotrexate'] },
  OCT2: { clinicalCutoff_IC50_uM: 'Cmax,u / IC50 ≥ 0.1', referenceInhibitors: ['cimetidine', 'trimethoprim'], substrates: ['metformin', 'oxaliplatin'] },
  MATE1: { clinicalCutoff_IC50_uM: 'Cmax,u / IC50 ≥ 0.1', referenceInhibitors: ['pyrimethamine', 'cimetidine', 'trimethoprim'], substrates: ['metformin'] },
  MATE2K: { clinicalCutoff_IC50_uM: 'Cmax,u / IC50 ≥ 0.1', referenceInhibitors: ['pyrimethamine', 'cimetidine'], substrates: ['metformin'] },
} as const;

const CYP2D6_ALLELE_ACTIVITY: Record<string, number> = {
  '*1': 1, '*2': 1, '*33': 1, '*35': 1,
  '*9': 0.5, '*10': 0.25, '*17': 0.5, '*29': 0.5, '*41': 0.5,
  '*3': 0, '*4': 0, '*5': 0, '*6': 0, '*7': 0, '*8': 0, '*11': 0,
  '*12': 0, '*13': 0, '*14': 0, '*15': 0, '*16': 0, '*18': 0, '*19': 0,
  '*20': 0, '*21': 0, '*36': 0, '*38': 0, '*40': 0, '*42': 0, '*44': 0,
};

const CYP2C19_ALLELE_ACTIVITY: Record<string, number> = {
  '*1': 1, '*17': 1.5,
  '*2': 0, '*3': 0, '*4': 0, '*5': 0, '*6': 0, '*7': 0, '*8': 0,
};

const CYP2C9_ALLELE_ACTIVITY: Record<string, number> = {
  '*1': 1,
  '*2': 0.5, '*5': 0.5, '*8': 0.5, '*11': 0.5,
  '*3': 0.25, '*6': 0, '*7': 0,
};

const CYP_POPULATION_FREQUENCIES: Record<string, Record<string, Record<string, string>>> = {
  CYP2D6: {
    poor: { Caucasian: '5-10%', African_American: '2-5%', Asian: '1-2%', Hispanic: '3-7%' },
    intermediate: { Caucasian: '10-17%', African_American: '20-35%', Asian: '35-50%', Hispanic: '2-5%' },
    normal: { Caucasian: '65-80%', African_American: '50-65%', Asian: '45-60%', Hispanic: '75-85%' },
    ultrarapid: { Caucasian: '1-10%', African_American: '2-5%', Asian: '1-2%', Hispanic: '1-3%' },
  },
  CYP2C19: {
    poor: { Caucasian: '2-5%', African_American: '2-5%', Asian: '12-23%', Hispanic: '2-5%' },
    intermediate: { Caucasian: '18-28%', African_American: '18-25%', Asian: '30-50%', Hispanic: '15-20%' },
    normal: { Caucasian: '35-45%', African_American: '40-50%', Asian: '35-50%', Hispanic: '40-50%' },
    rapid: { Caucasian: '25-35%', African_American: '20-30%', Asian: '2-8%', Hispanic: '20-30%' },
    ultrarapid: { Caucasian: '2-5%', African_American: '1-4%', Asian: '<1%', Hispanic: '1-3%' },
  },
  CYP2C9: {
    poor: { Caucasian: '1-3%', African_American: '<1%', Asian: '<1%', Hispanic: '1%' },
    intermediate: { Caucasian: '15-25%', African_American: '5-10%', Asian: '3-5%', Hispanic: '8-15%' },
    normal: { Caucasian: '70-85%', African_American: '85-95%', Asian: '95-98%', Hispanic: '80-90%' },
  },
};

const BCS_FOOD_EFFECT_PREDICTIONS = {
  I: { prediction: 'Unlikely clinically significant food effect', rationale: 'High solubility, high permeability — dissolution and absorption not expected to be rate-limiting. Food may slightly delay Tmax but AUC typically unaffected.', studyWaiver: true },
  II: { prediction: 'Positive food effect likely (increased absorption)', rationale: 'Low solubility, high permeability — fat content increases solubilization via bile salts and micelle formation. Lipophilic compounds (logP >2) especially susceptible.', studyWaiver: false },
  III: { prediction: 'Negative food effect possible (decreased absorption)', rationale: 'High solubility, low permeability — food may delay gastric emptying and alter GI transit, reducing window for absorption. Excipients may affect permeability.', studyWaiver: false },
  IV: { prediction: 'Unpredictable — food effect study essential', rationale: 'Low solubility, low permeability — food may increase (solubility enhancement) or decrease (permeability effects) absorption. Highly formulation-dependent.', studyWaiver: false },
} as const;

const FDA_HIGH_FAT_MEAL = {
  description: 'FDA standard high-fat, high-calorie test meal',
  calories: '800-1000 kcal',
  fatContent: '~50% of total caloric content from fat (~500 kcal from fat)',
  composition: '2 eggs fried in butter, 2 strips of bacon, 2 slices of toast with butter, 4 oz hash browns, 8 oz whole milk',
  timing: 'Meal consumed within 30 minutes; drug administered within 30 minutes after start of meal',
} as const;

// ── Functions ───────────────────────────────────────────────────────────────

export function classifyDDIRisk(params: DDIRiskParams): DDIRiskResult {
  const {
    perpetratorCmax_uM,
    perpetratorKi_uM,
    perpetratorGutConcentration_uM,
    cyp_enzyme = 'CYP3A4',
    victimFractionMetabolized,
    victimTherapeuticIndex,
    isInducer = false,
    transporterTarget,
    perpetratorIC50_transporter_uM,
  } = params;

  const isNTI = victimTherapeuticIndex === 'narrow';

  let R1_value: number | null = null;
  let R1_interpretation = 'Not applicable';
  let gutRatio: number | null = null;
  let riskCategory = 'low';
  let mechanisticDetail = '';

  if (transporterTarget && perpetratorIC50_transporter_uM) {
    const ratio = perpetratorCmax_uM / perpetratorIC50_transporter_uM;
    const transporterInfo = TRANSPORTER_CUTOFFS[transporterTarget as keyof typeof TRANSPORTER_CUTOFFS];
    if (ratio >= 0.1) {
      riskCategory = ratio >= 1.0 ? 'high' : 'moderate';
      mechanisticDetail = `Transporter ${transporterTarget} inhibition: Cmax,u/IC50 = ${ratio.toFixed(2)}. FDA threshold for clinical study is ≥0.1. ${transporterInfo ? `Clinical substrates: ${transporterInfo.substrates.join(', ')}` : ''}`;
    } else {
      riskCategory = 'low';
      mechanisticDetail = `Transporter ${transporterTarget}: Cmax,u/IC50 = ${ratio.toFixed(2)} (<0.1 threshold). Clinical DDI study not warranted.`;
    }
  } else if (isInducer) {
    riskCategory = 'moderate';
    mechanisticDetail = `CYP induction assessment required. FDA recommends in vitro induction study in human hepatocytes for CYP1A2, CYP2B6, CYP3A4. Positive if mRNA increase ≥2-fold at clinically relevant concentrations or ≥20% of positive control (rifampin) response.`;
    if (cyp_enzyme === 'CYP3A4') {
      mechanisticDetail += ' For CYP3A4 induction, clinical study with midazolam as index substrate recommended if positive in vitro.';
    }
  } else if (perpetratorKi_uM) {
    R1_value = 1 + (perpetratorCmax_uM / perpetratorKi_uM);

    if (R1_value >= 1.02) {
      if (perpetratorGutConcentration_uM) {
        gutRatio = perpetratorGutConcentration_uM / perpetratorKi_uM;
      }

      if (R1_value >= 5 || (gutRatio !== null && gutRatio >= 10)) {
        riskCategory = 'high';
      } else if (R1_value >= 1.25) {
        riskCategory = 'moderate';
      } else {
        riskCategory = 'low';
      }

      R1_interpretation = R1_value >= 1.02
        ? `R1 = ${R1_value.toFixed(3)} ≥ 1.02: clinical DDI study warranted per FDA basic static model`
        : `R1 = ${R1_value.toFixed(3)} < 1.02: clinical DDI study may not be necessary`;

      const fm = victimFractionMetabolized ?? 0.5;
      const predictedAUCR = 1 / (fm / R1_value + (1 - fm));
      mechanisticDetail = `Basic static model: R1 = 1 + [I]max,u/Ki = ${R1_value.toFixed(3)}. Predicted AUCR = ${predictedAUCR.toFixed(2)}. `;
      if (gutRatio !== null) {
        mechanisticDetail += `Gut interaction: [I]gut/Ki = ${gutRatio.toFixed(2)}${gutRatio >= 10 ? ' (≥10, strong gut inhibition expected)' : ''}. `;
      }
    } else {
      riskCategory = 'no_interaction_expected';
      R1_interpretation = `R1 = ${R1_value.toFixed(3)} < 1.02: no clinically meaningful interaction expected`;
      mechanisticDetail = 'R1 value below FDA threshold. No clinical DDI study needed for this CYP pathway.';
    }
  }

  if (isNTI && riskCategory !== 'no_interaction_expected') {
    if (riskCategory === 'low') riskCategory = 'moderate';
    else if (riskCategory === 'moderate') riskCategory = 'high';
    mechanisticDetail += ' Narrow therapeutic index victim: risk upgraded per FDA guidance.';
  }

  const enzymeInfo = CYP_SENSITIVE_SUBSTRATES[cyp_enzyme as keyof typeof CYP_SENSITIVE_SUBSTRATES];
  const studyDesign = riskCategory === 'high'
    ? `Dedicated clinical DDI study with sensitive ${cyp_enzyme} substrate${enzymeInfo ? ` (e.g., ${enzymeInfo.sensitive[0]})` : ''}`
    : riskCategory === 'moderate'
      ? `Clinical DDI study recommended; may use population PK approach if dedicated study not feasible`
      : 'No dedicated clinical DDI study required; monitor via population PK if applicable';

  const acceptanceCriteria = isNTI
    ? '90% CI of geometric mean ratios for AUC and Cmax should be within 80-125% (narrower bounds may apply for NTI drugs)'
    : '90% CI of geometric mean ratios for AUC and Cmax; ≥2-fold change = strong, 1.25-2-fold = moderate, <1.25 = weak';

  const labelingRec = riskCategory === 'high'
    ? 'Contraindication or strong warning against concomitant use; dose adjustment with specific magnitude recommended'
    : riskCategory === 'moderate'
      ? 'Caution advised; dose adjustment may be needed. Include in Drug Interactions section (Section 7) and Clinical Pharmacology (Section 12.3)'
      : 'No specific labeling language required for this interaction';

  return {
    riskCategory,
    R1_value,
    R1_interpretation,
    gutInteractionRatio: gutRatio,
    recommendedStudyDesign: studyDesign,
    acceptanceCriteria,
    labelingRecommendation: labelingRec,
    regulatoryBasis: [REGULATORY_CITATIONS.fda_ddi_2020, REGULATORY_CITATIONS.ich_m12_2024],
    mechanisticDetail,
  };
}

export function assessQTcRisk(params: QTcRiskParams): QTcRiskResult {
  const {
    hergIC50_uM,
    therapeuticCmax_uM,
    freefractionPercent = 100,
    drugClass,
    clinicalQTcData = false,
    ionChannelPanel = false,
  } = params;

  const freeFraction = freefractionPercent / 100;
  const freeCmax = therapeuticCmax_uM * freeFraction;
  const safetyMargin = hergIC50_uM / freeCmax;

  let riskCategory: string;
  let safetyMarginInterpretation: string;

  if (safetyMargin > 30) {
    riskCategory = 'low';
    safetyMarginInterpretation = `hERG safety margin ${safetyMargin.toFixed(1)}-fold (>30-fold). Low proarrhythmic risk based on nonclinical data.`;
  } else if (safetyMargin >= 10) {
    riskCategory = 'moderate';
    safetyMarginInterpretation = `hERG safety margin ${safetyMargin.toFixed(1)}-fold (10-30 range). Moderate concern — additional characterization recommended.`;
  } else {
    riskCategory = 'high';
    safetyMarginInterpretation = `hERG safety margin ${safetyMargin.toFixed(1)}-fold (<10-fold). High proarrhythmic concern — comprehensive cardiac assessment required.`;
  }

  const classHighRisk = ['antiarrhythmic', 'antihistamine', 'antimalarial', 'fluoroquinolone', 'antipsychotic', 'macrolide'].includes(drugClass ?? '');
  if (classHighRisk && riskCategory === 'low') {
    riskCategory = 'moderate';
    safetyMarginInterpretation += ` Drug class (${drugClass}) has known QT liability — risk elevated despite favorable margin.`;
  }

  const cipaApplicable = !clinicalQTcData && riskCategory !== 'high';

  let recommendedApproach: string;
  if (clinicalQTcData) {
    recommendedApproach = 'Concentration-QTc (C-QTc) analysis from existing clinical data per ICH E14 Q&A R3. Dedicated TQT study may not be needed if C-QTc analysis is adequately powered and designed.';
  } else if (riskCategory === 'high') {
    recommendedApproach = 'Dedicated thorough QT (TQT) study required per ICH E14. Positive control (moxifloxacin 400 mg). Consider concentration-QTc analysis as primary with TQT as confirmatory.';
  } else if (cipaApplicable) {
    recommendedApproach = 'CiPA (Comprehensive in vitro Proarrhythmia Assay) paradigm may be applicable: (1) multi-ion-channel assessment, (2) in silico AP modeling, (3) human stem cell cardiomyocyte assay. May support C-QTc approach instead of TQT per E14/S7B Q&A R3.';
  } else {
    recommendedApproach = 'Concentration-QTc analysis from Phase 1/2 data recommended. Include supratherapeutic exposure if possible. TQT study as fallback.';
  }

  const ionChannelAssessment = [
    { channel: 'hERG (IKr)', requirement: 'Mandatory — primary repolarization channel. IC50 determination at physiological temperature (35-37°C). Manual or automated patch clamp.' },
    { channel: 'Nav1.5 (INa)', requirement: riskCategory === 'high' ? 'Required — assess peak and late sodium current. Late INa inhibition can be protective; peak INa inhibition proarrhythmic at high concentrations.' : 'Recommended if hERG safety margin <30-fold.' },
    { channel: 'Cav1.2 (ICaL)', requirement: riskCategory === 'high' ? 'Required — L-type calcium channel. Combined hERG + Cav1.2 inhibition may modify proarrhythmic risk.' : 'Recommended for CiPA assessment.' },
    { channel: 'Kv4.3/KChIP2 (Ito)', requirement: 'Optional — for comprehensive CiPA ion channel panel.' },
    { channel: 'KCNQ1/KCNE1 (IKs)', requirement: 'Optional — slow delayed rectifier. Relevant for compounds with multi-channel block.' },
    { channel: 'Kir2.1 (IK1)', requirement: 'Optional — inward rectifier. CiPA panel component.' },
  ];

  const requiredStudies: string[] = [];
  if (riskCategory === 'high') {
    requiredStudies.push('hERG assay (manual patch clamp preferred)', 'Multi-ion-channel panel (Nav1.5, Cav1.2 minimum)', 'In vivo QTc study in non-rodent (dog or NHP telemetry)', 'Thorough QT (TQT) study or C-QTc with adequate justification', 'Cardiovascular safety pharmacology per ICH S7A/S7B');
  } else if (riskCategory === 'moderate') {
    requiredStudies.push('hERG assay', 'In vivo QTc study in non-rodent (ICH S7B)', 'C-QTc analysis from clinical trials', 'Consider multi-ion-channel panel for CiPA');
  } else {
    requiredStudies.push('hERG assay', 'In vivo cardiovascular safety pharmacology (ICH S7A)', 'C-QTc analysis from clinical trials if data available');
  }

  return {
    riskCategory,
    safetyMargin,
    safetyMarginInterpretation,
    recommendedApproach,
    cipaApplicable,
    requiredStudies,
    ionChannelAssessment,
    regulatoryBasis: [REGULATORY_CITATIONS.ich_e14_2005, REGULATORY_CITATIONS.ich_e14_qna_r3, REGULATORY_CITATIONS.ich_s7b],
  };
}

export function designOrganImpairmentStudy(params: OrganImpairmentParams): OrganImpairmentResult {
  const {
    eliminationPathway,
    fractionExcretedUnchanged,
    proteinBinding,
    therapeuticIndex,
    primaryMetabolicPathway,
  } = params;

  const isNTI = therapeuticIndex === 'narrow';
  const isHighPB = (proteinBinding ?? 0) > 80;

  let studyType: string;
  let studyDesignRationale: string;
  let groups: { name: string; criteria: string; n: number }[];
  let doseAdjustmentFramework: string;
  let dialysisAssessment: string | null = null;
  let proteinBindingAssessment: string | null = null;

  if (eliminationPathway === 'renal' || fractionExcretedUnchanged >= 0.3) {
    studyType = fractionExcretedUnchanged >= 0.5
      ? 'Dedicated renal impairment PK study (reduced design with all groups)'
      : (isNTI ? 'Dedicated renal impairment PK study' : 'Reduced renal impairment study or PopPK approach');

    studyDesignRationale = `Drug is ${fractionExcretedUnchanged >= 0.5 ? 'predominantly' : 'partially'} renally eliminated (fe = ${(fractionExcretedUnchanged * 100).toFixed(0)}%). ${isNTI ? 'Narrow therapeutic index requires dedicated study with all impairment groups.' : 'FDA 2020 guidance allows reduced design.'} Renal function assessed by eGFR (CKD-EPI 2021 equation, race-free).`;

    groups = [
      { name: 'Normal renal function', criteria: 'eGFR ≥90 mL/min/1.73m²', n: 8 },
      { name: 'Mild impairment', criteria: 'eGFR 60-89 mL/min/1.73m²', n: 8 },
      { name: 'Moderate impairment', criteria: 'eGFR 30-59 mL/min/1.73m²', n: 8 },
      { name: 'Severe impairment', criteria: 'eGFR 15-29 mL/min/1.73m²', n: 8 },
      { name: 'ESRD (not on dialysis)', criteria: 'eGFR <15 mL/min/1.73m²', n: 8 },
    ];

    if (!isNTI && fractionExcretedUnchanged < 0.5) {
      groups = groups.filter(g => g.name !== 'Mild impairment');
      studyDesignRationale += ' Reduced design: mild impairment group may be omitted if fe <50% and not NTI.';
    }

    dialysisAssessment = fractionExcretedUnchanged >= 0.5
      ? 'Dialysis study recommended: assess drug removal during hemodialysis (pre-, during, and post-dialysis PK sampling). Include both HD and non-HD days.'
      : 'Dialysis assessment may not be needed if drug is not primarily renally eliminated.';

    doseAdjustmentFramework = 'Dose adjustment recommendations based on AUC ratio relative to normal function. If AUC ratio >2-fold in any group, dose reduction recommended. For NTI drugs, any statistically significant change warrants dose adjustment.';

  } else if (eliminationPathway === 'hepatic' || eliminationPathway === 'mixed') {
    studyType = 'Dedicated hepatic impairment PK study';
    studyDesignRationale = `Drug is hepatically ${eliminationPathway === 'mixed' ? 'partially ' : ''}metabolized${primaryMetabolicPathway ? ` (primary: ${primaryMetabolicPathway})` : ''}. Hepatic function assessed by Child-Pugh classification. FDA recommends parallel group design.`;

    groups = [
      { name: 'Normal hepatic function', criteria: 'Child-Pugh score 5-6, Class A negative', n: 8 },
      { name: 'Mild impairment (Child-Pugh A)', criteria: 'Child-Pugh score 5-6', n: 8 },
      { name: 'Moderate impairment (Child-Pugh B)', criteria: 'Child-Pugh score 7-9', n: 8 },
      { name: 'Severe impairment (Child-Pugh C)', criteria: 'Child-Pugh score 10-15', n: 8 },
    ];

    if (!isNTI) {
      studyDesignRationale += ' Reduced design: may start with mild and moderate groups, then add severe if significant changes observed.';
    }

    doseAdjustmentFramework = 'Dose adjustment based on AUC ratio. Child-Pugh A: usually no adjustment needed unless AUC >2-fold. Child-Pugh B: dose reduction if AUC >1.5-2-fold. Child-Pugh C: often contraindicated or significant dose reduction.';
  } else {
    studyType = 'Population PK analysis may suffice';
    studyDesignRationale = 'Drug elimination pathway does not appear to be significantly dependent on renal or hepatic function. Population PK with organ function covariates from clinical trials may provide adequate information.';
    groups = [
      { name: 'Normal organ function', criteria: 'eGFR ≥90, Child-Pugh negative', n: 0 },
    ];
    doseAdjustmentFramework = 'Evaluate organ function as covariate in population PK model. If significant effect identified, dedicated study may be warranted.';
  }

  const pkParametersToEvaluate = [
    'AUC0-inf (primary)',
    'AUCss (if multiple dose)',
    'Cmax',
    'CL/F or CLr',
    't1/2',
  ];

  if (isHighPB) {
    pkParametersToEvaluate.push('Unbound fraction (fu)');
    pkParametersToEvaluate.push('Unbound AUC');
    proteinBindingAssessment = `Protein binding >80% (${proteinBinding}%). Unbound drug concentrations must be measured. In organ impairment, altered protein levels (albumin, AAG) may change fu, making total drug levels misleading. Report both total and unbound PK parameters.`;
  }

  return {
    studyType,
    studyDesignRationale,
    groups,
    pkParametersToEvaluate,
    doseAdjustmentFramework,
    dialysisAssessment,
    proteinBindingAssessment,
    regulatoryBasis: [REGULATORY_CITATIONS.fda_renal_2020, REGULATORY_CITATIONS.fda_hepatic_2003],
  };
}

export function classifyCYPPhenotype(params: CYPPhenotypeParams): CYPPhenotypeResult {
  const { gene, diplotype, activityScore: providedAS } = params;

  const geneUpper = gene.toUpperCase();
  let activityScore: number | null = providedAS ?? null;
  let phenotype = 'unknown';
  let metabolizerStatus = 'unknown';
  let clinicalImplications = '';
  let dosingGuidance = '';
  let cpicRecommendation = '';
  let labelingStatus = '';

  if (diplotype && activityScore === null) {
    const alleles = diplotype.split('/').map(a => a.trim());
    if (geneUpper === 'CYP2D6') {
      const scores = alleles.map(a => CYP2D6_ALLELE_ACTIVITY[a] ?? null);
      if (scores.every(s => s !== null)) {
        activityScore = (scores[0] as number) + (scores[1] as number);
      }
    } else if (geneUpper === 'CYP2C19') {
      const scores = alleles.map(a => CYP2C19_ALLELE_ACTIVITY[a] ?? null);
      if (scores.every(s => s !== null)) {
        activityScore = (scores[0] as number) + (scores[1] as number);
      }
    } else if (geneUpper === 'CYP2C9') {
      const scores = alleles.map(a => CYP2C9_ALLELE_ACTIVITY[a] ?? null);
      if (scores.every(s => s !== null)) {
        activityScore = (scores[0] as number) + (scores[1] as number);
      }
    }
  }

  if (geneUpper === 'CYP2D6') {
    if (activityScore !== null) {
      if (activityScore > 2.0) { phenotype = 'ultrarapid_metabolizer'; metabolizerStatus = 'Ultra-rapid'; }
      else if (activityScore >= 1.25) { phenotype = 'normal_metabolizer'; metabolizerStatus = 'Normal (extensive)'; }
      else if (activityScore >= 0.25) { phenotype = 'intermediate_metabolizer'; metabolizerStatus = 'Intermediate'; }
      else { phenotype = 'poor_metabolizer'; metabolizerStatus = 'Poor'; }
    }
    clinicalImplications = phenotype === 'poor_metabolizer'
      ? 'Significantly reduced CYP2D6 activity. Prodrug activation impaired (codeine, tamoxifen). Active drug accumulation risk (atomoxetine, SSRIs).'
      : phenotype === 'ultrarapid_metabolizer'
        ? 'Increased CYP2D6 activity. Prodrugs may have exaggerated effect (codeine → morphine toxicity reported). Active drugs may require higher doses.'
        : phenotype === 'intermediate_metabolizer'
          ? 'Moderately reduced CYP2D6 activity. May need dose adjustment for sensitive CYP2D6 substrates.'
          : 'Normal CYP2D6 activity expected. Standard dosing appropriate for CYP2D6 substrates.';
    cpicRecommendation = 'CPIC guidelines available for: codeine, tramadol, tamoxifen, ondansetron, tropisetron, atomoxetine, tricyclic antidepressants, SSRIs (paroxetine, fluvoxamine, vortioxetine).';
    labelingStatus = 'FDA labeling includes CYP2D6 pharmacogenomic information for >50 drugs.';
    dosingGuidance = phenotype === 'poor_metabolizer'
      ? 'Avoid codeine/tramadol (prodrugs). Reduce dose of atomoxetine, nortriptyline, perphenazine. Consider alternative to tamoxifen (aromatase inhibitor).'
      : phenotype === 'ultrarapid_metabolizer'
        ? 'Avoid codeine (risk of morphine toxicity, especially in pediatrics — FDA boxed warning). Consider dose increase for active drugs metabolized by CYP2D6.'
        : 'Standard dosing for CYP2D6 substrates. Monitor clinically.';
  } else if (geneUpper === 'CYP2C19') {
    if (activityScore !== null) {
      if (activityScore > 2.0) { phenotype = 'ultrarapid_metabolizer'; metabolizerStatus = 'Ultra-rapid'; }
      else if (activityScore >= 1.5) { phenotype = 'rapid_metabolizer'; metabolizerStatus = 'Rapid'; }
      else if (activityScore >= 1.0) { phenotype = 'normal_metabolizer'; metabolizerStatus = 'Normal (extensive)'; }
      else if (activityScore > 0) { phenotype = 'intermediate_metabolizer'; metabolizerStatus = 'Intermediate'; }
      else { phenotype = 'poor_metabolizer'; metabolizerStatus = 'Poor'; }
    }
    clinicalImplications = phenotype === 'poor_metabolizer'
      ? 'No CYP2C19 activity. Clopidogrel activation severely impaired (FDA boxed warning). PPIs: increased exposure, improved acid suppression. Voriconazole: increased exposure, dose reduction needed.'
      : phenotype === 'ultrarapid_metabolizer' || phenotype === 'rapid_metabolizer'
        ? 'Increased CYP2C19 activity. Clopidogrel: enhanced activation, improved antiplatelet effect. PPIs: reduced exposure, potentially suboptimal acid suppression. Voriconazole: reduced exposure, dose increase needed.'
        : 'Normal CYP2C19 activity. Standard dosing for CYP2C19 substrates.';
    cpicRecommendation = 'CPIC guidelines available for: clopidogrel, voriconazole, PPIs (omeprazole, lansoprazole, pantoprazole, dexlansoprazole), SSRIs (citalopram, escitalopram, sertraline), tricyclics (amitriptyline, imipramine).';
    labelingStatus = 'FDA boxed warning on clopidogrel for CYP2C19 poor metabolizers. Pharmacogenomic information in >30 drug labels.';
    dosingGuidance = phenotype === 'poor_metabolizer'
      ? 'Avoid clopidogrel (use prasugrel or ticagrelor). Reduce voriconazole dose by 50%. Standard PPI dosing adequate (increased exposure is beneficial).'
      : 'Standard dosing. For clopidogrel: CYP2C19 UM/RM status confirms adequate activation.';
  } else if (geneUpper === 'CYP2C9') {
    if (activityScore !== null) {
      if (activityScore >= 1.5) { phenotype = 'normal_metabolizer'; metabolizerStatus = 'Normal'; }
      else if (activityScore >= 1.0) { phenotype = 'intermediate_metabolizer'; metabolizerStatus = 'Intermediate'; }
      else { phenotype = 'poor_metabolizer'; metabolizerStatus = 'Poor'; }
    }
    clinicalImplications = phenotype === 'poor_metabolizer'
      ? 'Significantly reduced CYP2C9 activity. Warfarin sensitivity — major bleeding risk. NSAIDs: increased exposure. Phenytoin: reduced clearance.'
      : phenotype === 'intermediate_metabolizer'
        ? 'Moderately reduced CYP2C9 activity. Warfarin dose reduction typically needed (20-40% lower than normal metabolizers).'
        : 'Normal CYP2C9 activity. Standard dosing for CYP2C9 substrates.';
    cpicRecommendation = 'CPIC guidelines available for warfarin (combined CYP2C9 + VKORC1 dosing algorithm), phenytoin, NSAIDs (celecoxib, flurbiprofen, ibuprofen, meloxicam, piroxicam).';
    labelingStatus = 'FDA pharmacogenomic information in warfarin, celecoxib, phenytoin labels.';
    dosingGuidance = phenotype === 'poor_metabolizer'
      ? 'Warfarin: reduce initial dose by 50-70% (use CPIC/IWPC dosing algorithm incorporating CYP2C9 + VKORC1). Celecoxib: reduce dose by 50%. Phenytoin: reduce dose, monitor levels closely.'
      : 'Standard initial dosing with standard therapeutic drug monitoring.';
  } else {
    clinicalImplications = `CYP phenotyping for ${gene} is not well-characterized in CPIC guidelines.`;
    dosingGuidance = 'No CPIC dosing recommendations available for this gene.';
    cpicRecommendation = 'No CPIC guideline published for this gene.';
    labelingStatus = 'Check FDA Table of Pharmacogenomic Biomarkers for specific drug labeling.';
  }

  const populationFrequencies = CYP_POPULATION_FREQUENCIES[geneUpper]?.[phenotype.replace('_metabolizer', '')]
    ? Object.entries(CYP_POPULATION_FREQUENCIES[geneUpper][phenotype.replace('_metabolizer', '')]).map(
        ([pop, freq]) => ({ population: pop.replace('_', ' '), frequency: freq })
      )
    : [{ population: 'Data not available', frequency: 'N/A' }];

  return {
    phenotype,
    activityScore,
    metabolizerStatus,
    populationFrequencies,
    clinicalImplications,
    dosingGuidance,
    cpicRecommendation,
    labelingStatus,
    regulatoryBasis: [REGULATORY_CITATIONS.cpic_2023, REGULATORY_CITATIONS.dpwg_2023, REGULATORY_CITATIONS.fda_pgx_table],
  };
}

export function designBioanalyticalMethod(params: BioanalyticalMethodParams): BioanalyticalMethodResult {
  const {
    analyteType,
    matrix,
    intendedUse,
    sensitivityRequired_ngPerMl,
    isADA = false,
  } = params;

  let recommendedPlatform: string;
  let platformRationale: string;

  if (isADA || intendedUse === 'immunogenicity') {
    recommendedPlatform = 'Ligand binding assay (LBA) — bridging ELISA or electrochemiluminescence (ECL/MSD)';
    platformRationale = 'ADA assays require multi-tiered approach per FDA 2019 immunogenicity guidance: screening (high sensitivity, ~5% false positive rate), confirmatory (drug competition), titer, and neutralizing antibody (NAb) characterization. ECL/MSD preferred for drug tolerance.';
  } else if (analyteType === 'small_molecule') {
    recommendedPlatform = 'LC-MS/MS (liquid chromatography-tandem mass spectrometry)';
    platformRationale = 'Gold standard for small molecule quantitation. Superior specificity, sensitivity (sub-ng/mL), and throughput. Stable isotope-labeled internal standard (SIL-IS) recommended.';
  } else if (analyteType === 'peptide' && (sensitivityRequired_ngPerMl ?? 100) < 1) {
    recommendedPlatform = 'Hybrid LBA-LC-MS/MS (immunocapture followed by LC-MS/MS)';
    platformRationale = 'Combines LBA enrichment for sensitivity with LC-MS/MS specificity. Suitable for peptides requiring sub-ng/mL quantitation in complex matrices.';
  } else if (['monoclonal_antibody', 'fusion_protein', 'large_molecule', 'adc'].includes(analyteType)) {
    recommendedPlatform = 'Ligand binding assay (LBA) — ELISA or ECL/MSD';
    platformRationale = 'Standard for large molecule quantitation. Target-capture or anti-idiotypic antibody format. LC-MS/MS (hybrid or surrogate peptide) as orthogonal method for total antibody measurement.';
  } else if (analyteType === 'biomarker') {
    recommendedPlatform = intendedUse === 'pharmacodynamic' ? 'Validated LBA or LC-MS/MS depending on biomarker nature' : 'Fit-for-purpose LBA with appropriate characterization';
    platformRationale = 'Biomarker assays follow tiered approach per FDA/EMA: exploratory (fit-for-purpose) → validated (if used for dose selection or regulatory decision). ICH M10 Section 5 applies.';
  } else {
    recommendedPlatform = 'LC-MS/MS';
    platformRationale = 'Default platform for PK quantitation. Assess fit-for-purpose for specific analyte characteristics.';
  }

  const isChromatographic = recommendedPlatform.includes('LC-MS');

  const validationParameters: { parameter: string; requirement: string; acceptanceCriteria: string }[] = [
    { parameter: 'Selectivity', requirement: 'Test in ≥6 individual blank matrix lots (including hemolyzed, lipemic if applicable)', acceptanceCriteria: isChromatographic ? 'Interference at RT of analyte/IS <20% LLOQ' : 'Signal in blank matrix <screening cut-point' },
    { parameter: 'Calibration curve / Linearity', requirement: isChromatographic ? 'Minimum 6 non-zero calibration standards + blank + zero standard' : 'Minimum 6 standards, 4-parameter or 5-parameter logistic fit', acceptanceCriteria: isChromatographic ? '≥75% of standards within ±15% (±20% at LLOQ). At least 6 of 8 standards must meet criteria.' : 'R² ≥0.98, back-calculated concentrations within ±20% (±25% at LLOQ)' },
    { parameter: 'Accuracy', requirement: 'QC samples at LLOQ, Low (≤3×LLOQ), Medium (~50% range), High (≥75% range), minimum 5 replicates per level', acceptanceCriteria: isChromatographic ? 'Mean within ±15% of nominal (±20% at LLOQ)' : 'Mean within ±20% of nominal (±25% at LLOQ)' },
    { parameter: 'Precision (within-run)', requirement: 'Same run, ≥5 replicates at each QC level', acceptanceCriteria: isChromatographic ? 'CV ≤15% (≤20% at LLOQ)' : 'CV ≤20% (≤25% at LLOQ)' },
    { parameter: 'Precision (between-run)', requirement: '≥3 runs on ≥2 days, ≥5 replicates per QC level per run', acceptanceCriteria: isChromatographic ? 'CV ≤15% (≤20% at LLOQ)' : 'CV ≤20% (≤25% at LLOQ)' },
    { parameter: 'Carry-over', requirement: 'Blank sample immediately after ULOQ', acceptanceCriteria: isChromatographic ? '≤20% of LLOQ for analyte, ≤5% for IS' : 'Not typically assessed for LBA' },
    { parameter: 'Dilution integrity', requirement: 'Dilute samples above ULOQ (at least 2 dilution factors, ≥5 replicates)', acceptanceCriteria: isChromatographic ? 'Within ±15% accuracy, CV ≤15%' : 'Within ±20% accuracy, CV ≤20%' },
    { parameter: 'Matrix effect', requirement: isChromatographic ? 'Post-extraction spike vs neat solution in ≥6 lots (including special matrices)' : 'Not applicable', acceptanceCriteria: isChromatographic ? 'IS-normalized matrix factor CV ≤15% across lots' : 'N/A' },
    { parameter: 'Recovery', requirement: isChromatographic ? 'Pre-extraction spike vs post-extraction spike at 3 levels' : 'Not applicable', acceptanceCriteria: isChromatographic ? 'Consistent recovery (CV ≤15%). No minimum recovery required if precision/accuracy met.' : 'N/A' },
  ];

  const runAcceptanceCriteria = isChromatographic
    ? [
        '≥2/3 of total QC samples within ±15% of nominal',
        '≥50% of QCs at each level within ±15%',
        '≥75% of calibration standards within ±15% (±20% at LLOQ)',
        'At least 6 acceptable calibration points',
        'LLOQ standard must be acceptable',
      ]
    : [
        '≥2/3 of total QC samples within ±20% of nominal',
        '≥50% of QCs at each level within ±20%',
        'Calibration curve R² ≥0.98',
        'Standards back-calculated within ±20% (±25% at anchor points)',
      ];

  const isrRequirements = [
    { criterion: 'Sample selection', threshold: '≥10% of total study samples (minimum 30 per study, across Cmax and elimination phase)' },
    { criterion: 'Acceptance', threshold: isChromatographic ? '≥67% of ISR samples within ±20% of original result' : '≥67% of ISR samples within ±30% of original result' },
    { criterion: 'Timing', threshold: 'Report ISR results in bioanalytical study report; investigate and document failures' },
  ];

  const stabilityRequirements = [
    { type: 'Bench-top (short-term)', condition: `Room temperature (ambient) in ${matrix}`, minimumDuration: 'Duration covering expected sample processing time (typically 4-24 hours)' },
    { type: 'Freeze-thaw', condition: `Minimum 3 freeze-thaw cycles at storage temperature to RT`, minimumDuration: '3 cycles minimum (match study sample handling)' },
    { type: 'Long-term', condition: `Storage temperature (-20°C or -70°C as applicable) in ${matrix}`, minimumDuration: 'Must cover the entire sample storage duration from first sample to last analysis' },
    { type: 'Processed sample', condition: 'Autosampler/plate conditions (4°C or RT)', minimumDuration: 'Duration of longest expected analytical run (typically 24-72 hours)' },
    { type: 'Stock solution', condition: 'Storage conditions for stock/working solutions', minimumDuration: '≥6 hours at RT; duration matching storage period at refrigerated/frozen conditions' },
    { type: 'Whole blood', condition: 'If applicable: storage in collection tubes at RT/on ice', minimumDuration: 'Duration from collection to centrifugation (per protocol)' },
  ];

  return {
    recommendedPlatform,
    platformRationale,
    validationParameters: validationParameters.filter(v => v.acceptanceCriteria !== 'N/A' && v.acceptanceCriteria !== 'Not applicable'),
    runAcceptanceCriteria,
    isrRequirements,
    stabilityRequirements,
    regulatoryBasis: [REGULATORY_CITATIONS.ich_m10_2022],
  };
}

export function assessFoodEffect(params: FoodEffectParams): FoodEffectResult {
  const {
    bcsClass,
    dosageForm,
    logP,
    solubilityPHDependent = false,
    modifiedRelease = false,
  } = params;

  const bcsKey = bcsClass.toUpperCase().replace('CLASS ', '').replace('BCS ', '') as keyof typeof BCS_FOOD_EFFECT_PREDICTIONS;
  const bcsInfo = BCS_FOOD_EFFECT_PREDICTIONS[bcsKey] ?? BCS_FOOD_EFFECT_PREDICTIONS.IV;

  let studyRequired: boolean;
  let studyRequiredRationale: string;
  let predictedEffect: string;
  let labelingImplication: string;

  if (modifiedRelease) {
    studyRequired = true;
    studyRequiredRationale = 'Modified-release formulations always require food effect assessment. Dose dumping risk must be evaluated — both high-fat and alcohol-induced dose dumping (for certain formulations).';
    predictedEffect = 'Food effect unpredictable for modified-release formulations. May alter release mechanism, cause dose dumping, or change rate/extent of absorption.';
    labelingImplication = 'Specific dosing instructions relative to food required in Section 2 (Dosage and Administration).';
  } else if (dosageForm === 'oral_solution' || dosageForm === 'injectable') {
    studyRequired = dosageForm === 'oral_solution' && bcsKey !== 'I';
    studyRequiredRationale = dosageForm === 'injectable'
      ? 'Injectable formulations do not require food effect studies.'
      : `Oral solutions: dissolution is not rate-limiting, but absorption may still be affected by food-related changes in GI physiology (transit time, pH, bile secretion). ${bcsInfo.studyWaiver ? 'BCS Class I: waiver may be possible.' : 'Study recommended.'}`;
    predictedEffect = dosageForm === 'injectable' ? 'Not applicable' : bcsInfo.prediction;
    labelingImplication = dosageForm === 'injectable' ? 'Not applicable' : 'Based on food effect study results.';
  } else {
    studyRequired = !bcsInfo.studyWaiver;
    studyRequiredRationale = bcsInfo.studyWaiver
      ? `BCS Class ${bcsKey}: high solubility and high permeability. Food effect study may be waived per FDA guidance if rapidly dissolving (≥85% in 30 min at all pH). ${solubilityPHDependent ? 'However, pH-dependent solubility noted — food effect study recommended despite BCS I classification.' : ''}`
      : `BCS Class ${bcsKey}: food effect study required. ${bcsInfo.rationale}`;

    if (solubilityPHDependent && bcsKey === 'I') {
      studyRequired = true;
      studyRequiredRationale += ' pH-dependent solubility overrides BCS Class I waiver eligibility.';
    }

    predictedEffect = bcsInfo.prediction;
    if (logP !== undefined) {
      if (logP > 4 && (bcsKey === 'II' || bcsKey === 'IV')) {
        predictedEffect += ` Highly lipophilic (logP = ${logP}) — positive food effect (increased absorption) expected from bile salt solubilization and lymphatic transport.`;
      } else if (logP < 0) {
        predictedEffect += ` Hydrophilic compound (logP = ${logP}) — food effect more likely related to GI transit changes than solubilization.`;
      }
    }

    labelingImplication = bcsInfo.studyWaiver
      ? 'No specific food-related dosing instructions needed if waiver justified.'
      : 'Labeling must specify relationship to meals based on study results (Section 2 and Section 12.3).';
  }

  const studyDesign = studyRequired
    ? {
        type: 'Randomized, balanced, single-dose, two-treatment, two-period, two-sequence crossover',
        arms: ['Fasted (overnight fast ≥10 hours, no food ≥4 hours post-dose)', 'Fed (FDA standard high-fat, high-calorie meal)'],
        sampleSize: 12,
        washout: '≥5 elimination half-lives between periods (minimum 7 days for most drugs)',
      }
    : null;

  return {
    studyRequired,
    studyRequiredRationale,
    predictedEffect,
    studyDesign,
    mealComposition: { ...FDA_HIGH_FAT_MEAL },
    labelingImplication,
    bcsRationale: bcsInfo.rationale,
    regulatoryBasis: [REGULATORY_CITATIONS.fda_food_2002],
  };
}
