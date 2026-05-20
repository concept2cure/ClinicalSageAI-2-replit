/**
 * Seed EMA CHMP question patterns. Each pattern reflects a recurring
 * CHMP question observed across European Public Assessment Reports (EPARs)
 * for centralised procedures, with the typical CHMP language drawn from
 * published assessment reports.
 *
 * Frequencies and clock-stop probabilities are conservative estimates
 * from published EPARs through 2025; refine once internal precedent
 * records are loaded.
 */

import type { EMAQuestionPattern } from '../ema-question-taxonomy-service';

export type EmaQuestionSeed = Omit<
  EMAQuestionPattern,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt'
>;

export const EMA_QUESTION_PATTERNS: EmaQuestionSeed[] = [
  {
    patternCode: 'EMA_D120_PIVOTAL_TRIAL_DESIGN',
    patternName: 'Day 120 — Pivotal trial design and external validity',
    procedurePhase: 'day_120',
    procedureType: 'centralised',
    questionCategory: 'clinical_efficacy',
    questionType: 'major_objection',
    typicalChmpLanguage: [
      'The applicant is requested to justify the choice of comparator with respect to the European standard of care',
      'The external validity of the pivotal trial population to the European Union population should be discussed',
    ],
    questionTemplate: 'Justify the comparator and external validity of the pivotal trial for the EU patient population, with specific reference to current European standard of care.',
    expectedResponseFormat: 'Comparative narrative + literature evidence + subgroup analysis if regional differences exist.',
    frequencyRate: 0.34,
    escalationRisk: 0.45,
    clockStopProbability: 0.6,
    therapeuticAreas: ['oncology', 'cardiovascular', 'neurology', 'rare_disease'],
    rapporteurCountries: ['DE', 'FR', 'NL', 'SE', 'ES', 'IT'],
  },
  {
    patternCode: 'EMA_D120_CMC_SPECIFICATIONS',
    patternName: 'Day 120 — CMC specification justification per Ph. Eur. / ICH',
    procedurePhase: 'day_120',
    procedureType: 'centralised',
    questionCategory: 'quality_cmc',
    questionType: 'major_objection',
    typicalChmpLanguage: [
      'The acceptance criteria for [impurity / assay] should be tightened in line with batch data and Ph. Eur. requirements',
      'The justification of the proposed shelf life is insufficient',
    ],
    questionTemplate: 'Tighten the proposed acceptance criterion for [parameter] to reflect batch experience and align with Ph. Eur. / ICH Q6A; resubmit revised specifications and justification.',
    expectedResponseFormat: 'Revised spec table + statistical justification from batch data + Ph. Eur. monograph cross-reference.',
    frequencyRate: 0.28,
    escalationRisk: 0.35,
    clockStopProbability: 0.55,
    therapeuticAreas: ['biologics', 'small_molecule', 'sterile_injectables'],
    rapporteurCountries: ['DE', 'NL', 'SE', 'AT'],
  },
  {
    patternCode: 'EMA_D180_RESPONSES_PSI',
    patternName: 'Day 180 — Product Specific Information and SmPC harmonisation',
    procedurePhase: 'day_180',
    procedureType: 'centralised',
    questionCategory: 'labeling_spc',
    questionType: 'other_concern',
    typicalChmpLanguage: [
      'The SmPC sections 4.4 (warnings) and 4.8 (undesirable effects) should be updated to reflect the safety profile from the pivotal trial',
      'The proposed indication wording should be aligned with the demonstrated benefit',
    ],
    questionTemplate: 'Revise SmPC sections 4.1, 4.4, and 4.8 in track-changes to reflect the demonstrated benefit and safety profile, with cross-reference to PRAC recommendations.',
    expectedResponseFormat: 'Track-changes SmPC + PIL update + PRAC alignment statement.',
    frequencyRate: 0.42,
    escalationRisk: 0.25,
    clockStopProbability: 0.35,
    therapeuticAreas: ['oncology', 'neurology', 'cardiovascular', 'metabolic'],
    rapporteurCountries: ['DE', 'FR', 'IT', 'ES', 'NL'],
  },
  {
    patternCode: 'EMA_ORAL_EXPLANATION_BENEFIT_RISK',
    patternName: 'Oral explanation — Benefit-risk for restricted population',
    procedurePhase: 'oral_explanation',
    procedureType: 'centralised',
    questionCategory: 'clinical_efficacy',
    questionType: 'major_objection',
    typicalChmpLanguage: [
      'The applicant should clarify the magnitude of clinical benefit relative to the safety profile in the proposed target population',
      'Restriction of the indication to the demonstrated responsive subgroup should be considered',
    ],
    questionTemplate: 'Defend the benefit-risk for the broad proposed indication or accept a restricted indication to the demonstrated responsive subgroup.',
    expectedResponseFormat: 'Effects table (PROACT-URL or BRAT) + subgroup analysis + restricted-indication wording option.',
    frequencyRate: 0.18,
    escalationRisk: 0.7,
    clockStopProbability: 0.4,
    therapeuticAreas: ['oncology', 'rare_disease', 'cardiovascular'],
    rapporteurCountries: ['DE', 'FR', 'IT', 'NL'],
  },
  {
    patternCode: 'EMA_D120_NONCLINICAL_DART',
    patternName: 'Day 120 — DART package adequacy and ICH M3(R2) staging',
    procedurePhase: 'day_120',
    procedureType: 'centralised',
    questionCategory: 'nonclinical',
    questionType: 'other_concern',
    typicalChmpLanguage: [
      'The applicant should provide the embryo-fetal development study in a second species, or justify its absence per ICH M3(R2)',
      'The pre- and postnatal development study should be completed for the proposed indication',
    ],
    questionTemplate: 'Provide the missing DART study (or staged completion plan) and justify against ICH M3(R2) §11 for the proposed clinical population.',
    expectedResponseFormat: 'Updated DART table + ICH M3(R2) §11 alignment matrix + staged study commitment.',
    frequencyRate: 0.15,
    escalationRisk: 0.3,
    clockStopProbability: 0.4,
    therapeuticAreas: ['rare_disease', 'oncology', 'neurology'],
    rapporteurCountries: ['DE', 'SE', 'AT', 'NL'],
  },
  {
    patternCode: 'EMA_RSI_RISK_MANAGEMENT_PLAN',
    patternName: 'Response to Scientific Information — Risk Management Plan v2',
    procedurePhase: 'clock_stop_1',
    procedureType: 'centralised',
    questionCategory: 'risk_management',
    questionType: 'recommendation',
    typicalChmpLanguage: [
      'The Risk Management Plan should be updated to reflect the agreed pharmacovigilance activities and additional risk minimisation measures',
      'The Educational Materials should be aligned with the agreed safety messages',
    ],
    questionTemplate: 'Submit RMP v2 with the agreed routine and additional pharmacovigilance activities, including a draft of the educational materials.',
    expectedResponseFormat: 'RMP v2 + educational materials draft + dHCP letter draft if required.',
    frequencyRate: 0.32,
    escalationRisk: 0.2,
    clockStopProbability: 0.25,
    therapeuticAreas: ['oncology', 'psychiatry', 'pain', 'rare_disease'],
    rapporteurCountries: ['DE', 'FR', 'IT', 'NL', 'ES'],
  },
  {
    patternCode: 'EMA_D120_BIOSIMILAR_ANALYTICAL_TOTALITY',
    patternName: 'Day 120 — Analytical similarity totality of evidence (biosimilars)',
    procedurePhase: 'day_120',
    procedureType: 'centralised',
    questionCategory: 'biosimilarity',
    questionType: 'major_objection',
    typicalChmpLanguage: [
      'The analytical similarity package does not sufficiently demonstrate biosimilarity for higher-order structure',
      'The orthogonal methods to confirm post-translational modifications should be extended',
    ],
    questionTemplate: 'Strengthen the analytical similarity package with additional orthogonal methods for higher-order structure and PTMs; demonstrate totality-of-evidence per EMA biosimilar guideline (CHMP/437/04 Rev1).',
    expectedResponseFormat: 'Additional orthogonal characterization + side-by-side range plots + statistical similarity analysis.',
    frequencyRate: 0.16,
    escalationRisk: 0.55,
    clockStopProbability: 0.5,
    therapeuticAreas: ['biologics'],
    rapporteurCountries: ['DE', 'NL', 'SE', 'AT'],
  },
  {
    patternCode: 'EMA_PEDIATRIC_PIP_COMPLIANCE',
    patternName: 'Day 120 — PIP compliance and pediatric strategy alignment',
    procedurePhase: 'day_120',
    procedureType: 'centralised',
    questionCategory: 'pediatric',
    questionType: 'other_concern',
    typicalChmpLanguage: [
      'The applicant should confirm completion of the agreed Paediatric Investigation Plan (PIP) measures, or justify any deviations',
      'The pediatric extrapolation framework should be supported by relevant data',
    ],
    questionTemplate: 'Confirm PIP measure completion vs the EMA Paediatric Committee decision, and justify any pediatric extrapolation per EMA extrapolation guideline.',
    expectedResponseFormat: 'PIP compliance table + extrapolation framework + long-term safety monitoring plan.',
    frequencyRate: 0.13,
    escalationRisk: 0.3,
    clockStopProbability: 0.3,
    therapeuticAreas: ['rare_disease', 'oncology', 'cardiovascular'],
    rapporteurCountries: ['DE', 'FR', 'IT', 'ES'],
  },
];
