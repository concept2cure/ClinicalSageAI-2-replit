/**
 * Neurology therapeutic-area profile (Feature 2.7).
 *
 * Covers:
 *   - CNS PK challenges (BBB penetration, CSF dosimetry)
 *   - Patient-reported outcomes for cognitive / functional endpoints
 *   - Slowly-progressive disease endpoint considerations
 *   - Biomarker-stratified populations (e.g. amyloid PET, NfL)
 *   - REMS for psychotropics with abuse potential
 *
 * @module server/services/ana/therapeutic-area-profiles/neurology
 */
import type { TherapeuticAreaProfile } from './types.js';

export const neurologyProfile: TherapeuticAreaProfile = {
  id: 'neurology',
  displayName: 'Neurology',
  description:
    'Adapts AnA for CNS submissions: BBB penetration analysis, ' +
    'cognitive/functional endpoint scrutiny, biomarker-stratified populations, ' +
    'and abuse-potential / REMS awareness.',

  contextRules: [
    {
      id: 'neuro-bbb-penetration',
      scope: 'module',
      appliesTo: '4',
      triggerKeywords: ['BBB', 'blood-brain barrier', 'CSF', 'CNS penetration'],
      instruction:
        'For CNS-targeted indications, nonclinical Module 4 must document BBB penetration (radiolabeled distribution or CSF/plasma ratio in animals) AND clinical Module 5 should include CSF dosimetry where feasible. Inadequate BBB characterization is a common reviewer flag.',
      severity: 'major',
      guidanceRef: 'FDA Guidance: Drug Development for Alzheimer\'s Disease (2018)',
    },
    {
      id: 'neuro-cognitive-endpoint-validity',
      scope: 'section',
      appliesTo: '11.4',
      triggerKeywords: ['cognitive', 'ADAS-Cog', 'CDR-SB', 'MMSE'],
      instruction:
        'Cognitive endpoints (ADAS-Cog, CDR-SB, MMSE, MoCA) require: validated scoring + rater training documentation, ceiling/floor effect analysis for the enrolled population, MID (minimum important difference) justification with literature support.',
      severity: 'major',
      guidanceRef: 'FDA Guidance: Alzheimer\'s + Cognitive Impairment',
    },
    {
      id: 'neuro-slow-progression-design',
      scope: 'always',
      triggerKeywords: ['progression', 'natural history', 'CDR', 'time to event'],
      instruction:
        'Slowly-progressive CNS diseases (e.g. AD, ALS, PD, HD) require either (a) very long follow-up to detect clinical progression, or (b) biomarker-supported earlier readouts. The clinical strategy should justify which approach + a confirmatory endpoint plan.',
      severity: 'major',
    },
    {
      id: 'neuro-biomarker-stratification',
      scope: 'section',
      appliesTo: '2.5',
      triggerKeywords: ['amyloid', 'tau', 'NfL', 'biomarker', 'enrichment'],
      instruction:
        'Biomarker-stratified populations (amyloid+, tau+, NfL responders) require: validated assay + cutoff documented, expected response heterogeneity in non-stratified populations addressed, companion-diagnostic strategy aligned with FDA CDx guidance.',
      severity: 'major',
      guidanceRef: 'FDA In Vitro Companion Diagnostic Devices Guidance (2014)',
    },
    {
      id: 'neuro-abuse-potential',
      scope: 'module',
      appliesTo: '4',
      triggerKeywords: ['abuse', 'dependence', 'controlled substance', 'CSA'],
      instruction:
        'Psychotropics, opioids, and any drug crossing the BBB with reinforcing properties require an Abuse Potential Assessment (Module 4 nonclinical + dedicated human abuse potential study, HAP). Required by FDA before scheduling determination by DEA.',
      severity: 'critical',
      guidanceRef: 'FDA Guidance: Assessment of Abuse Potential of Drugs (2017)',
    },
    {
      id: 'neuro-suicidality-monitoring',
      scope: 'module',
      appliesTo: '5',
      triggerKeywords: ['suicidality', 'C-SSRS', 'depression'],
      instruction:
        'CNS-active agents (anti-epileptics, anti-depressants, anti-psychotics, smoking cessation) require systematic suicidality monitoring during clinical trials (C-SSRS) with pre-specified analysis. FDA box warning consequences if not documented.',
      severity: 'critical',
      guidanceRef:
        'FDA Guidance: Suicidal Ideation and Behavior: Prospective Assessment of Occurrence in Clinical Trials (2012)',
    },
  ],

  riskFactors: [
    'Placebo response in psychiatric / chronic-pain trials commonly 30-50% — large samples needed',
    'Cognitive endpoints have known ceiling/floor effects in mild and severe populations',
    'Slow disease progression makes traditional pivotal trial duration impractical',
    'Biomarker-population enrichment limits generalizability',
    'CNS PK heterogeneity (genetic polymorphisms, CSF clearance) creates exposure variability',
    'Patient cognitive impairment may compromise informed-consent capacity → assent + caregiver framework needed',
    'Long-duration trial → high attrition; missing-data sensitivity analyses essential',
    'Abuse-potential signal may emerge late → systematic monitoring from FIH',
  ],

  commonGaps: [
    {
      ctdSection: '4.2.2',
      prefix: true,
      patterns: ['BBB', 'CNS distribution', 'CSF', 'brain'],
      description: 'Nonclinical PK missing CNS distribution / BBB penetration data',
      severity: 'major',
      guidanceRef: 'ICH M3(R2)',
    },
    {
      ctdSection: '5.3.3',
      prefix: true,
      patterns: ['CSF', 'cerebrospinal', 'sampling'],
      description: 'Clinical PK missing CSF sampling for CNS-targeted indication',
      severity: 'minor',
    },
    {
      ctdSection: '11.4',
      prefix: true,
      patterns: ['cognitive', 'ADAS', 'MMSE', 'CDR'],
      description:
        'Cognitive endpoint analysis missing ceiling/floor effect assessment or MID justification',
      severity: 'major',
    },
    {
      ctdSection: '12',
      prefix: true,
      patterns: ['suicidality', 'C-SSRS', 'suicidal ideation'],
      description: 'Safety analysis missing systematic suicidality monitoring (C-SSRS)',
      severity: 'critical',
      guidanceRef: 'FDA Suicidality Guidance',
    },
    {
      ctdSection: '4.2.3',
      prefix: true,
      patterns: ['abuse', 'dependence', 'reinforcement'],
      description:
        'Abuse-potential assessment missing for CNS-active or controlled-substance candidate',
      severity: 'critical',
      guidanceRef: 'FDA Abuse Potential Guidance',
    },
  ],

  guidanceRefs: [
    {
      code: 'FDA Alzheimer\'s Drug Development',
      authority: 'FDA',
      title: 'Early Alzheimer\'s Disease: Developing Drugs for Treatment (2018)',
      why: 'Endpoint framework + biomarker-stratified design for AD; canonical CNS slow-progression reference',
    },
    {
      code: 'FDA Suicidality Guidance',
      authority: 'FDA',
      title: 'Suicidal Ideation and Behavior: Prospective Assessment in Clinical Trials',
      why: 'Mandatory systematic monitoring for CNS-active drugs',
    },
    {
      code: 'FDA Abuse Potential',
      authority: 'FDA',
      title: 'Assessment of Abuse Potential of Drugs (2017)',
      why: 'Required for any CNS-penetrant drug with reinforcing potential',
    },
    {
      code: 'ICH M3(R2)',
      authority: 'ICH',
      title: 'Nonclinical Safety Studies for the Conduct of Human Clinical Trials',
      why: 'Includes CNS distribution requirements',
    },
    {
      code: 'EMA Alzheimer\'s Guideline',
      authority: 'EMA',
      title: 'Guideline on the Clinical Investigation of Medicines for Treatment of Alzheimer\'s Disease',
      why: 'EU equivalent of FDA AD guidance with subtle endpoint differences',
    },
  ],

  reviewerExpectations: [
    'BBB penetration documented (nonclinical) and CSF dosimetry where feasible (clinical)',
    'Cognitive endpoint validity defended (rater training, MID, ceiling/floor)',
    'Systematic suicidality monitoring (C-SSRS) in trials',
    'Abuse potential assessed for CNS-penetrant candidates',
    'Biomarker-stratified design has companion diagnostic strategy',
    'Long-term follow-up plan with attrition + missing-data handling',
    'Caregiver-informed consent framework when patient cognition is impaired',
    'PRO instrument validated for CNS population (not adapted from general)',
  ],

  pathwayHints: [
    {
      pathway: 'fast_track',
      applicability: 'Serious CNS condition + unmet medical need (most neurodegenerative + psych)',
      impactedSections: ['1.7'],
      reviewerNotes: 'Common in CNS — combined with rolling review.',
    },
    {
      pathway: 'breakthrough_therapy',
      applicability:
        'Preliminary evidence of substantial improvement on a clinically significant endpoint over existing therapies',
      impactedSections: ['1.7', '2.5'],
      reviewerNotes:
        'CNS examples: lecanemab, aducanumab — disease-modifying agents in AD have used this pathway.',
    },
    {
      pathway: 'accelerated_approval',
      applicability:
        'Surrogate endpoint reasonably likely to predict clinical benefit + serious condition + unmet need',
      impactedSections: ['2.5', '5.3.5.1'],
      reviewerNotes:
        'Biomarker surrogates (e.g. amyloid clearance) used for AA in AD; reviewer expects confirmatory cognitive endpoint trial commitment.',
    },
  ],

  statisticalConsiderations: [
    'Mixed-effects model for repeated measures (MMRM) for longitudinal cognitive endpoints',
    'Pattern-mixture model or tipping-point analysis for missing data in long-duration trials',
    'Stratified analysis by biomarker status (when stratification is at randomization)',
    'Pre-specified subgroup analyses by APOE genotype, baseline severity, biomarker subgroup',
    'Composite endpoints (e.g. CDR-SB) require component-level analysis for interpretation',
    'Time-varying treatment effect modeling when disease progression rate varies',
  ],

  endpointConsiderations: [
    'Cognitive: ADAS-Cog (AD), CDR-SB (composite), MoCA (MCI screening), Mini-Mental State Exam',
    'Functional: ADCS-ADL, IADL — caregiver-reported activities of daily living',
    'Biomarker: amyloid PET, tau PET, NfL, CSF Aβ42, CSF p-tau (AD); UHDRS for HD',
    'Motor: UPDRS for Parkinson\'s; ALSFRS-R for ALS',
    'PRO: condition-specific (e.g. NeuroQoL) preferred over generic SF-36',
    'Time to event: time to clinically meaningful decline, time to nursing-home placement',
  ],

  retrievalKeywords: [
    'neurology',
    'CNS',
    'Alzheimer',
    'Parkinson',
    'ALS',
    'Huntington',
    'multiple sclerosis',
    'epilepsy',
    'depression',
    'schizophrenia',
    'BBB',
    'blood-brain barrier',
    'CSF',
    'amyloid',
    'tau',
    'NfL',
    'ADAS-Cog',
    'CDR-SB',
    'MMSE',
    'C-SSRS',
    'suicidality',
    'abuse potential',
    'companion diagnostic',
    'biomarker',
    'PRO',
  ],
};
