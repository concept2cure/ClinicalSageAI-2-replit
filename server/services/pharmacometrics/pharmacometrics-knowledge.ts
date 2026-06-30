/**
 * Pharmacometrics Intelligence — deterministic knowledge base.
 *
 * Covers PopPK study design, PBPK model evaluation, exposure-response analysis,
 * MIDD strategy, and dose selection frameworks.
 *
 * NO LLM, NO network. Pure registry lookup.
 *
 * @module server/services/pharmacometrics/pharmacometrics-knowledge
 */

// ── PopPK Study Design ──────────────────────────────────────────────────────

interface SamplingStrategy {
  name: string;
  description: string;
  samplesPerSubject: string;
  whenToUse: string;
  advantages: string[];
  limitations: string[];
}

const SAMPLING_STRATEGIES: Record<string, SamplingStrategy> = {
  rich: {
    name: 'Rich (intensive) sampling',
    description: 'Full PK profile: 8-15 samples per subject capturing absorption, distribution, and elimination phases.',
    samplesPerSubject: '8-15',
    whenToUse: 'Phase 1 healthy volunteer studies, dedicated PK studies, first-in-human studies.',
    advantages: ['Precise individual parameter estimation', 'Supports structural model development', 'Gold standard for PK characterization'],
    limitations: ['High blood volume requirements', 'Not feasible in vulnerable populations', 'Expensive and burdensome'],
  },
  sparse: {
    name: 'Sparse sampling',
    description: '2-4 samples per subject at optimally designed time windows, analyzed with population approach.',
    samplesPerSubject: '2-4',
    whenToUse: 'Phase 2/3 clinical trials, pediatric studies, elderly patients, patients with limited venous access.',
    advantages: ['Low patient burden', 'Can be embedded in efficacy trials', 'Large population coverage'],
    limitations: ['Requires prior PK knowledge for optimal design', 'Cannot estimate all individual parameters', 'Needs larger N'],
  },
  optimal: {
    name: 'D-optimal sampling',
    description: 'Mathematically optimized time points that maximize information content for parameter estimation.',
    samplesPerSubject: '3-6',
    whenToUse: 'When balancing information gain with practical constraints. Standard for PopPK in Phase 2/3.',
    advantages: ['Maximizes Fisher information', 'Efficient parameter estimation', 'Can be computed with PFIM/PopED/POPED'],
    limitations: ['Requires structural model assumption', 'Sensitive to model misspecification', 'May yield impractical time windows'],
  },
};

const POPK_MODEL_EVALUATION = {
  diagnostics: [
    { name: 'Objective Function Value (OFV)', description: '-2LL; used for nested model comparison via LRT (Δ OFV > 3.84 for df=1, p<0.05)', category: 'statistical' },
    { name: 'Goodness-of-Fit plots', description: 'DV vs PRED, DV vs IPRED, CWRES vs TIME, CWRES vs PRED; systematic trends indicate model misspecification', category: 'graphical' },
    { name: 'Visual Predictive Check (VPC)', description: '500-1000 simulations; observed 5th/50th/95th percentiles within simulated 90% CI', category: 'simulation' },
    { name: 'Normalized Prediction Distribution Errors (NPDE)', description: 'Should follow N(0,1) if model is adequate; formal tests for mean, variance, distribution', category: 'simulation' },
    { name: 'Bootstrap', description: '200-1000 resamples; parameter estimates within 95% CI of bootstrap distribution', category: 'simulation' },
    { name: 'Condition number', description: 'Eigenvalue ratio of covariance matrix; >1000 suggests overparameterization', category: 'statistical' },
    { name: 'Shrinkage', description: 'ETA (η) shrinkage >30% indicates individual estimates unreliable for that parameter; EPS (ε) shrinkage >20% limits diagnostic utility', category: 'statistical' },
  ],
  covariateAnalysis: {
    methods: ['Stepwise covariate model (SCM)', 'Full random effects model (FREM)', 'Lasso', 'Machine learning pre-screening'],
    significance: { forward: 'p < 0.05 (ΔOFV > 3.84, df=1)', backward: 'p < 0.01 (ΔOFV > 6.63, df=1)' },
    standardCovariates: ['Body weight', 'Age', 'Sex', 'Race/ethnicity', 'Renal function (eGFR/CrCL)', 'Hepatic function (Child-Pugh)', 'Albumin', 'Concomitant medications', 'Genetic polymorphisms (CYP2D6, CYP2C19)'],
  },
  software: [
    { name: 'NONMEM', version: '7.5+', strengths: 'FDA gold standard, FOCE-I, Laplacian', regulatory: 'Most accepted by FDA/EMA' },
    { name: 'Monolix', version: '2024R1+', strengths: 'SAEM algorithm, user-friendly, fast convergence', regulatory: 'Accepted by FDA/EMA' },
    { name: 'nlmixr2', version: '2.0+', strengths: 'Open source (R), FOCEI/SAEM, free', regulatory: 'Increasingly accepted, validation needed' },
    { name: 'Phoenix NLME', version: '8.3+', strengths: 'Integrated with WinNonlin, FOCE-ELS', regulatory: 'Accepted by FDA/EMA' },
  ],
  references: [
    'FDA Guidance: Population Pharmacokinetics (2022)',
    'EMA Guideline on Reporting the Results of Population PK Analyses (2007)',
    'ICH E4: Dose-Response Information to Support Drug Registration (1994)',
  ],
};

// ── PBPK Model Evaluation ────────────────────────────────────────────────────

interface PBPKApplication {
  name: string;
  description: string;
  regulatoryAcceptance: string;
  validationCriteria: string;
  references: string[];
}

const PBPK_APPLICATIONS: Record<string, PBPKApplication> = {
  ddi_prediction: {
    name: 'Drug-Drug Interaction prediction',
    description: 'Predict magnitude of DDI as perpetrator or victim; may replace dedicated clinical DDI studies when model is qualified.',
    regulatoryAcceptance: 'FDA/EMA accept PBPK for DDI labeling language when model passes qualification criteria.',
    validationCriteria: 'Predicted/observed AUC ratio within 0.8–1.25 for ≥80% of verification DDI scenarios. Guest criteria: 2-fold error for all, 1.5-fold for ≥50%.',
    references: ['FDA Guidance: PBPK Analyses — Format and Content (2018)', 'EMA Guideline on Qualification and Reporting of PBPK Modelling (2018)'],
  },
  pediatric_extrapolation: {
    name: 'Pediatric dose prediction',
    description: 'Predict pediatric PK from adult data using age-dependent physiology (organ volumes, enzyme ontogeny, GFR maturation).',
    regulatoryAcceptance: 'FDA/EMA accept PBPK for pediatric dose selection when model verified in adults and maturation functions validated.',
    validationCriteria: 'Adult model verified first; then predicted pediatric PK within 2-fold of observed; age-appropriate physiology validated.',
    references: ['FDA Guidance: General Clinical Pharmacology Considerations for Pediatric Studies (2014)', 'ICH E11(R1)'],
  },
  organ_impairment: {
    name: 'Hepatic/renal impairment prediction',
    description: 'Predict PK changes in organ impairment; may replace dedicated organ impairment studies.',
    regulatoryAcceptance: 'FDA accepts PBPK for hepatic impairment when model verified with clinical data in at least one impairment category.',
    validationCriteria: 'Predicted AUC ratio (impaired/normal) within 0.5–2.0 of observed for verification scenarios.',
    references: ['FDA Guidance: Pharmacokinetics in Patients with Impaired Hepatic Function (2020)', 'FDA Guidance: PK in Patients with Impaired Renal Function (2020)'],
  },
  food_effect: {
    name: 'Food effect prediction',
    description: 'Predict food effect on oral bioavailability using mechanistic absorption models.',
    regulatoryAcceptance: 'Supportive; dedicated food-effect study still generally required unless strong PBPK justification.',
    validationCriteria: 'Predicted fed/fasted AUC and Cmax ratios within 0.8–1.25 of observed.',
    references: ['FDA Guidance: Food-Effect BA and Fed BE Studies (2002)'],
  },
  formulation_bridging: {
    name: 'Formulation bridging',
    description: 'Predict PK of new formulations using mechanistic absorption models; support bridging strategy.',
    regulatoryAcceptance: 'Supportive; usually requires confirmatory PK study but can reduce scope.',
    validationCriteria: 'Model predicts original formulation PK within 0.8–1.25; new formulation prediction used for study design.',
    references: ['FDA Guidance: PBPK Analyses (2018)'],
  },
};

const PBPK_PLATFORMS = [
  { name: 'Simcyp (Certara)', strengths: 'Largest population library, regulatory track record, DDI prediction', regulatory: 'Most FDA submissions' },
  { name: 'GastroPlus (Simulations Plus)', strengths: 'Mechanistic absorption (ACAT), formulation development, food effect', regulatory: 'Strong FDA acceptance' },
  { name: 'PK-Sim/MoBi (Open Systems Pharmacology)', strengths: 'Open source, transparent, customizable', regulatory: 'Increasing acceptance, requires validation' },
];

// ── Exposure-Response Analysis ───────────────────────────────────────────────

const ER_ANALYSIS_TYPES = {
  efficacy: {
    description: 'Relationship between drug exposure (AUC, Cmin, Cmax, Cavg) and efficacy endpoints.',
    approaches: ['Graphical (exposure quartiles vs response)', 'Logistic regression (binary endpoint)', 'Linear/nonlinear regression (continuous)', 'Emax/sigmoid-Emax model', 'Time-to-event (Cox regression with exposure)'],
    exposureMetrics: ['AUC₀₋τ (steady state)', 'Cmin,ss', 'Cmax,ss', 'Cavg,ss', 'Time above threshold'],
    regulatoryExpectation: 'FDA expects E-R analysis for dose justification in NDA/BLA. Must show that approved dose is on the favorable portion of the E-R curve.',
  },
  safety: {
    description: 'Relationship between drug exposure and adverse events (QTc, liver injury, neutropenia, etc.).',
    approaches: ['Concentration-QTc (linear mixed effects per ICH E14/S7B Q&A)', 'Logistic regression for binary AEs', 'Exposure-safety margin assessment', 'Time-course analysis for cumulative toxicity'],
    exposureMetrics: ['Cmax (for acute events)', 'AUC (for cumulative toxicity)', 'Cmin (for trough-related events)'],
    regulatoryExpectation: 'FDA guidance on E-R for QTc: concentration-QTc analysis can replace TQT study if adequate. Safety E-R informs dose modification and labeling.',
  },
  immunogenicity: {
    description: 'Relationship between drug exposure and anti-drug antibody (ADA) development for biologics.',
    approaches: ['ADA incidence vs exposure quartiles', 'Impact of ADA on PK (clearance increase)', 'Impact of ADA on efficacy (loss of response)', 'Neutralizing antibody analysis'],
    exposureMetrics: ['Trough concentration', 'AUC', 'ADA titer'],
    regulatoryExpectation: 'Required for all therapeutic proteins. Must assess impact of immunogenicity on PK, efficacy, and safety.',
  },
};

// ── MIDD Framework ───────────────────────────────────────────────────────────

const MIDD_APPLICATIONS = [
  { application: 'Inform dose selection for first-in-human', msApproach: 'PK/PD modeling from preclinical data', canReplaceStudy: false, references: ['ICH M3(R2)'] },
  { application: 'Optimize dose in Phase 2', msApproach: 'Population PK/PD + E-R + simulation', canReplaceStudy: false, references: ['FDA MIDD Pilot Program'] },
  { application: 'Justify Phase 3 dose without Phase 2 dose-ranging', msApproach: 'E-R modeling with adaptive design', canReplaceStudy: true, references: ['FDA Guidance on Adaptive Designs'] },
  { application: 'Support pediatric dose selection', msApproach: 'PBPK pediatric + adult E-R extrapolation', canReplaceStudy: true, references: ['ICH E11(R1)', 'FDA Pediatric Extrapolation'] },
  { application: 'Waive hepatic impairment study', msApproach: 'PBPK hepatic impairment prediction', canReplaceStudy: true, references: ['FDA PBPK Guidance (2018)'] },
  { application: 'Waive clinical DDI study', msApproach: 'PBPK DDI prediction with qualified model', canReplaceStudy: true, references: ['FDA Clinical DDI Guidance (2020)'] },
  { application: 'Waive food-effect study', msApproach: 'PBPK absorption modeling', canReplaceStudy: false, references: ['FDA PBPK Guidance (2018)'] },
  { application: 'Support label dose adjustment', msApproach: 'PopPK subgroup analysis + simulation', canReplaceStudy: false, references: ['FDA PopPK Guidance (2022)'] },
  { application: 'Bridge formulation change', msApproach: 'PBPK + IVIVC', canReplaceStudy: false, references: ['FDA IVIVC Guidance (1997)'] },
  { application: 'Support biosimilar totality of evidence', msApproach: 'PK similarity + E-R bridging', canReplaceStudy: false, references: ['FDA Biosimilar Guidance'] },
];

// ── Dose Selection Framework ─────────────────────────────────────────────────

interface FIHDoseMethod {
  name: string;
  calculation: string;
  safetyFactor: number;
  whenToUse: string;
  references: string[];
}

const FIH_DOSE_METHODS: Record<string, FIHDoseMethod> = {
  noael: {
    name: 'NOAEL-based (standard)',
    calculation: 'MRSD = NOAEL (mg/kg) × (animal Km / human Km) / safety factor. Km: mouse=3, rat=6, rabbit=12, dog=20, NHP=12, human=37.',
    safetyFactor: 10,
    whenToUse: 'Standard approach for small molecules. Use the most sensitive species NOAEL from GLP toxicology studies.',
    references: ['FDA Guidance: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials (2005)', 'ICH M3(R2)'],
  },
  mabel: {
    name: 'MABEL (Minimum Anticipated Biological Effect Level)',
    calculation: 'Based on in vitro potency data (EC10-EC20), receptor occupancy models, PK/PD modeling of expected biological effect at various doses.',
    safetyFactor: 10,
    whenToUse: 'Required for high-risk biologics (immune agonists, cell-engaging therapies, novel MoA with no clinical experience). Per EMA ICH S9 guideline and post-TGN1412 guidance.',
    references: ['EMA Guideline on FIH Clinical Trials (2017)', 'ICH S6(R1)', 'ICH S9'],
  },
  pad: {
    name: 'PAD (Pharmacologically Active Dose)',
    calculation: 'Dose achieving target pharmacological effect in the most relevant animal model, allometrically scaled to human.',
    safetyFactor: 10,
    whenToUse: 'When pharmacological activity data are available and the target is well characterized. Common for oncology.',
    references: ['FDA Guidance: Maximum Safe Starting Dose (2005)', 'ICH S9'],
  },
};

const BODY_SURFACE_AREA_CONVERSION: Record<string, number> = {
  mouse: 3, rat: 6, hamster: 5, guinea_pig: 8, rabbit: 12,
  dog: 20, nhp: 12, minipig: 27, human: 37,
};

// ── Exported Functions ───────────────────────────────────────────────────────

export function designPopPKStudy(params: {
  drugClass: string;
  route: string;
  eliminationPathway: string;
  targetPopulation: string;
  studyPhase: string;
  samplingApproach?: string;
  covariatesOfInterest?: string[];
}) {
  const phase = params.studyPhase.toLowerCase();
  const recommendedSampling = phase.includes('1') ? 'rich' : (phase.includes('2') ? 'optimal' : 'sparse');
  const sampling = SAMPLING_STRATEGIES[params.samplingApproach ?? recommendedSampling] ?? SAMPLING_STRATEGIES[recommendedSampling];

  return {
    samplingStrategy: sampling,
    covariateAnalysis: {
      ...POPK_MODEL_EVALUATION.covariateAnalysis,
      priorityCovariates: params.covariatesOfInterest ?? POPK_MODEL_EVALUATION.covariateAnalysis.standardCovariates,
    },
    modelEvaluation: POPK_MODEL_EVALUATION.diagnostics,
    software: POPK_MODEL_EVALUATION.software,
    regulatoryRequirements: POPK_MODEL_EVALUATION.references,
    reportingGuidance: [
      'Include population and individual predicted vs observed plots',
      'Report parameter estimates with RSE% and 95% CI from bootstrap',
      'Show VPC stratified by key covariates',
      'Report η-shrinkage for all random effects',
      'Provide simulation-based dose recommendations if applicable',
    ],
  };
}

export function evaluatePBPKModel(params: {
  application: string;
  drugProperties: { molecularWeight?: number; logP?: number; pKa?: number; fup?: number; clint?: number };
  platform?: string;
  regulatoryContext?: string;
}) {
  const app = PBPK_APPLICATIONS[params.application] ?? PBPK_APPLICATIONS['ddi_prediction'];

  return {
    application: app,
    platforms: PBPK_PLATFORMS,
    qualificationCriteria: app.validationCriteria,
    documentationChecklist: [
      'Model structure and parameterization justification',
      'Input parameter sources and sensitivity analysis',
      'Model verification with clinical PK data',
      'Model qualification with relevant scenarios',
      'Prediction uncertainty quantification',
      'Platform and version documentation',
    ],
    regulatoryGuidance: app.references,
  };
}

export function analyzeExposureResponse(params: {
  analysisType: 'efficacy' | 'safety' | 'immunogenicity';
  endpointType: string;
  exposureMetric?: string;
}) {
  const erType = ER_ANALYSIS_TYPES[params.analysisType];

  return {
    analysisType: erType,
    recommendedApproaches: erType.approaches,
    exposureMetrics: erType.exposureMetrics,
    regulatoryExpectation: erType.regulatoryExpectation,
    reportingRequirements: [
      'Graphical exploration of exposure-response relationship',
      'Model selection justification and diagnostics',
      'Covariate effects on exposure and response',
      'Simulations for dose recommendation if applicable',
      'Discussion of confounding (dose-exposure-response triad)',
    ],
    references: [
      'FDA Guidance: Exposure-Response Relationships — Study Design, Data Analysis, and Regulatory Applications (2003)',
      'ICH E4: Dose-Response Information (1994)',
      'FDA Guidance: E14/S7B Q&As on Concentration-QTc Modeling (2017)',
    ],
  };
}

export function adviseMIDD(params: {
  developmentQuestion: string;
  developmentPhase: string;
  availableData?: string[];
  drugClass?: string;
}) {
  const applicable = MIDD_APPLICATIONS.filter(a =>
    a.application.toLowerCase().includes(params.developmentQuestion.toLowerCase().slice(0, 15)) ||
    params.developmentPhase.toLowerCase().includes('all')
  );

  return {
    matchingApplications: applicable.length > 0 ? applicable : MIDD_APPLICATIONS,
    studiesSupportableByMS: MIDD_APPLICATIONS.filter(a => a.canReplaceStudy),
    regulatoryInteractionStrategy: [
      'Pre-IND meeting: present M&S plan and seek agreement on study waiver',
      'End-of-Phase 2 meeting: present E-R and PopPK results for Phase 3 dose justification',
      'Pre-NDA/BLA meeting: present integrated M&S package supporting label claims',
    ],
    references: [
      'FDA MIDD Paired Meeting Program',
      'FDA Guidance: Population Pharmacokinetics (2022)',
      'FDA Guidance: PBPK Analyses (2018)',
      'ICH M12: Drug Interaction Studies (2024)',
    ],
  };
}

export function selectDose(params: {
  context: 'first_in_human' | 'therapeutic' | 'special_population';
  drugClass: string;
  route: string;
  indication?: string;
  preclinicalData?: { species: string; noael: number; noaelUnit: string }[];
  specialPopulation?: string;
}) {
  if (params.context === 'first_in_human') {
    const methods = FIH_DOSE_METHODS;
    let hedCalculations: { species: string; hed: number; mrsd: number }[] = [];

    if (params.preclinicalData) {
      hedCalculations = params.preclinicalData.map(d => {
        const animalKm = BODY_SURFACE_AREA_CONVERSION[d.species.toLowerCase()] ?? 6;
        const humanKm = BODY_SURFACE_AREA_CONVERSION['human'];
        const hed = d.noael * (animalKm / humanKm);
        return { species: d.species, hed: Math.round(hed * 1000) / 1000, mrsd: Math.round((hed / 10) * 1000) / 1000 };
      });
    }

    return {
      methods,
      hedCalculations,
      recommendation: hedCalculations.length > 0
        ? `Use the lowest MRSD across species: ${Math.min(...hedCalculations.map(h => h.mrsd))} ${params.preclinicalData?.[0]?.noaelUnit ?? 'mg/kg'}`
        : 'Provide preclinical NOAEL data for HED calculation.',
      bsaConversionFactors: BODY_SURFACE_AREA_CONVERSION,
      references: Object.values(methods).flatMap(m => m.references),
    };
  }

  return {
    specialPopulationAdjustments: {
      renal: 'Dose adjustment based on eGFR/CrCL per FDA Renal Impairment Guidance (2020)',
      hepatic: 'Dose adjustment based on Child-Pugh score per FDA Hepatic Impairment Guidance (2020)',
      pediatric: 'Allometric scaling with maturation factors; consider PBPK-based dose prediction',
      elderly: 'Generally no dose adjustment unless PK significantly altered; monitor renal/hepatic function',
      obese: 'Consider weight-based dosing; evaluate E-R in obese subgroup; PK bridging may be needed',
    },
    references: [
      'FDA Guidance: PK in Patients with Impaired Renal Function (2020)',
      'FDA Guidance: PK in Patients with Impaired Hepatic Function (2020)',
      'ICH E7: Studies in Support of Special Populations: Geriatrics (1993)',
    ],
  };
}
