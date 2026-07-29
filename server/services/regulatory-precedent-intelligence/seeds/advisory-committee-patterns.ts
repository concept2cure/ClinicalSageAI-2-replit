/**
 * Seed FDA Advisory Committee risk patterns. Each pattern reflects a
 * recurring concern across actual FDA advisory committees (ODAC, CRDAC,
 * AADPAC, EMDAC, PADAC, DSaRM, PCNS) drawn from published transcripts
 * and voting summaries.
 *
 * Frequencies and negative-vote correlations are conservative estimates
 * from published FDA AC histories through 2025; refine once internal
 * precedent records are loaded for specific therapeutic areas.
 */

import type { AdvisoryCommitteePattern } from '../advisory-committee-service';

export type AdvisoryCommitteeSeed = Omit<
  AdvisoryCommitteePattern,
  'id' | 'organizationId' | 'createdAt' | 'updatedAt'
>;

export const ADVISORY_COMMITTEE_PATTERNS: AdvisoryCommitteeSeed[] = [
  {
    patternCode: 'AC_SINGLE_TRIAL_CONFIRMATORY_EVIDENCE',
    patternName: 'Single pivotal trial — committee scrutiny on confirmatory evidence',
    committeeType: 'ODAC',
    riskCategory: 'single_trial',
    typicalQuestions: [
      'Has the sponsor provided confirmatory evidence beyond the single pivotal trial?',
      'Does the trial population support the proposed labeling?',
      'What is the plan if the post-marketing confirmatory trial fails?',
    ],
    votingQuestionTemplates: [
      'Has the sponsor provided sufficient evidence of effectiveness to support approval?',
      'Do the benefits of the drug outweigh the risks for the proposed indication?',
    ],
    historicalFrequency: 0.32,
    negativeVoteCorrelation: 0.55,
    fdaOverrideRate: 0.18,
    panelistSensitivity: { biostatistician: 0.85, clinician: 0.6, consumer_rep: 0.45 },
    consumerRepImpact: 0.4,
    statisticianFocusAreas: [
      'Trial replication mechanism',
      'Subgroup consistency',
      'Effect size relative to comparator uncertainty',
    ],
    mitigationStrategies: [
      'Present the FDA 2019 single-trial guidance criteria explicitly and show how the program meets them.',
      'Bring supportive Phase 2 and natural-history evidence to the panel.',
      'Pre-align a robust confirmatory trial design as a post-marketing requirement.',
    ],
    recommendedPresentations: [
      'Confirmatory evidence framework slide deck',
      'Real-world evidence supporting the pivotal results',
    ],
    counterargumentFrameworks: [
      {
        concern: 'A single trial cannot establish substantial evidence.',
        counterargument: 'The 2019 FDA guidance on substantial evidence permits a single adequate and well-controlled trial when accompanied by confirmatory evidence (mechanism, dose response, natural history, related products).',
        supportingEvidence: 'FDA Guidance for Industry: Demonstrating Substantial Evidence of Effectiveness (December 2019)',
        effectivenessRating: 0.7,
      },
    ],
  },
  {
    patternCode: 'AC_ACCELERATED_APPROVAL_CONFIRMATORY',
    patternName: 'Accelerated approval — confirmatory trial design and timing',
    committeeType: 'ODAC',
    riskCategory: 'accelerated_conversion',
    typicalQuestions: [
      'Is the confirmatory trial design adequate to verify clinical benefit?',
      'What is the timeline for completion and what happens if it fails?',
      'Is the surrogate endpoint reasonably likely to predict clinical benefit?',
    ],
    votingQuestionTemplates: [
      'Is the surrogate endpoint reasonably likely to predict clinical benefit?',
      'Should the drug be approved under the accelerated approval pathway?',
    ],
    historicalFrequency: 0.28,
    negativeVoteCorrelation: 0.5,
    fdaOverrideRate: 0.22,
    panelistSensitivity: { oncologist: 0.7, biostatistician: 0.75, patient_advocate: 0.3 },
    consumerRepImpact: 0.35,
    statisticianFocusAreas: [
      'Surrogate-clinical correlation strength',
      'Confirmatory trial sample size and power',
      'Withdrawal criteria if confirmatory trial fails',
    ],
    mitigationStrategies: [
      'Present surrogate validation evidence (FDA-NIH BEST framework).',
      'Pre-specify confirmatory trial endpoints and powering assumptions before the panel.',
      'Commit to firm enrollment milestones with public reporting.',
    ],
    recommendedPresentations: [
      'Surrogate endpoint validation summary',
      'Confirmatory trial enrollment progress to date',
    ],
    counterargumentFrameworks: [
      {
        concern: 'Confirmatory trials are often delayed or fail to confirm benefit.',
        counterargument: 'The sponsor has already initiated the confirmatory trial with [N] patients enrolled, and the FDA-aligned protocol includes pre-specified withdrawal criteria if benefit is not confirmed.',
        supportingEvidence: 'Confirmatory trial protocol filed under IND #XXXXXX',
        effectivenessRating: 0.65,
      },
    ],
  },
  {
    patternCode: 'AC_SAFETY_SIGNAL_CARDIOVASCULAR',
    patternName: 'Cardiovascular safety signal — MACE imbalance or QT prolongation',
    committeeType: 'EMDAC',
    riskCategory: 'safety_signal',
    typicalQuestions: [
      'Is the observed cardiovascular imbalance attributable to the drug?',
      'Is the MACE rate within acceptable bounds for the indication?',
      'Does the proposed labeling adequately communicate the risk?',
    ],
    votingQuestionTemplates: [
      'Do the cardiovascular safety findings warrant a contraindication?',
      'Is a boxed warning needed to communicate cardiovascular risk?',
    ],
    historicalFrequency: 0.18,
    negativeVoteCorrelation: 0.65,
    fdaOverrideRate: 0.15,
    panelistSensitivity: { cardiologist: 0.9, biostatistician: 0.7, consumer_rep: 0.55 },
    consumerRepImpact: 0.6,
    statisticianFocusAreas: [
      'CV outcomes meta-analysis methodology',
      'Time-to-event hazard ratios and confidence intervals',
      'Discontinuation-related bias',
    ],
    mitigationStrategies: [
      'Pre-specified MACE adjudication committee with public methodology.',
      'Subgroup analyses by baseline CV risk to identify higher-risk populations.',
      'Risk-mitigation plan: screening, monitoring, dose adjustment for at-risk patients.',
    ],
    recommendedPresentations: [
      'Adjudicated CV outcomes summary',
      'Benefit-risk modeling stratified by CV risk',
    ],
    counterargumentFrameworks: [
      {
        concern: 'The CV signal could increase population-level harm at scale.',
        counterargument: 'The signal is concentrated in a definable subgroup; labeling with screening, contraindications, and post-market surveillance limits net population risk.',
        supportingEvidence: 'Subgroup analysis with HR by baseline 10-year ASCVD risk',
        effectivenessRating: 0.55,
      },
    ],
  },
  {
    patternCode: 'AC_BENEFIT_RISK_UNMET_NEED',
    patternName: 'Benefit-risk in serious or life-threatening unmet need',
    committeeType: 'ODAC',
    riskCategory: 'benefit_risk_balance',
    typicalQuestions: [
      'Is the unmet medical need adequately characterized?',
      'Does the magnitude of benefit justify the observed risks?',
      'What patient population is most likely to benefit?',
    ],
    votingQuestionTemplates: [
      'Does the benefit of treatment outweigh the risks for [indication]?',
      'Should the drug be approved for the proposed indication?',
    ],
    historicalFrequency: 0.42,
    negativeVoteCorrelation: 0.35,
    fdaOverrideRate: 0.12,
    panelistSensitivity: { oncologist: 0.5, patient_advocate: 0.2, biostatistician: 0.65, consumer_rep: 0.3 },
    consumerRepImpact: 0.25,
    statisticianFocusAreas: [
      'OS vs PFS reliability',
      'Crossover-adjusted survival',
      'Quality of life endpoints',
    ],
    mitigationStrategies: [
      'Lead with the patient voice and natural-history context.',
      'Use FDA Benefit-Risk Framework table to structure the discussion.',
      'Position risks against the comparator (no treatment, current SOC).',
    ],
    recommendedPresentations: [
      'Benefit-Risk Framework summary',
      'Patient-reported outcome and QoL data',
      'Natural history of disease without treatment',
    ],
    counterargumentFrameworks: [
      {
        concern: 'Adverse event rate is substantial.',
        counterargument: 'Within an unmet-need population with [X]% mortality at 12 months, the observed AE profile is manageable and compares favorably to the natural history alternative.',
        supportingEvidence: 'FDA Benefit-Risk Framework analysis',
        effectivenessRating: 0.7,
      },
    ],
  },
  {
    patternCode: 'AC_SURROGATE_ENDPOINT_VALIDITY',
    patternName: 'Surrogate endpoint validity for proposed indication',
    committeeType: 'ODAC',
    riskCategory: 'surrogate_endpoint',
    typicalQuestions: [
      'Is the surrogate endpoint validated for the specific indication and population?',
      'What is the magnitude of surrogate effect required for clinical benefit?',
      'Does class precedent support the surrogate-clinical relationship?',
    ],
    votingQuestionTemplates: [
      'Is the surrogate endpoint reasonably likely to predict clinical benefit?',
      'Is the magnitude of effect on the surrogate clinically meaningful?',
    ],
    historicalFrequency: 0.24,
    negativeVoteCorrelation: 0.6,
    fdaOverrideRate: 0.18,
    panelistSensitivity: { biostatistician: 0.85, clinician: 0.7 },
    consumerRepImpact: 0.3,
    statisticianFocusAreas: [
      'Validation strength of surrogate-clinical correlation',
      'Class effect vs first-in-class consideration',
      'Sensitivity analyses with alternative surrogates',
    ],
    mitigationStrategies: [
      'Map the proposed surrogate to FDA-NIH BEST framework category.',
      'Pre-align with FDA on surrogate acceptance at end-of-Phase-2.',
      'Provide a meta-analysis of trial-level surrogate-clinical correlation.',
    ],
    recommendedPresentations: [
      'Surrogate validation evidence package',
      'Class effect evidence from approved analogues',
    ],
    counterargumentFrameworks: [
      {
        concern: 'The surrogate is not validated.',
        counterargument: 'Although not formally validated for this indication, the surrogate has well-established mechanistic linkage and class precedent (see [approved drug X, Y, Z]). Confirmatory data will follow under accelerated approval requirements.',
        supportingEvidence: 'Approved-drug surrogate-clinical correlation analysis',
        effectivenessRating: 0.5,
      },
    ],
  },
  {
    patternCode: 'AC_SUBGROUP_HETEROGENEITY',
    patternName: 'Subgroup heterogeneity — qualitative interaction concern',
    committeeType: 'EMDAC',
    riskCategory: 'subgroup_effects',
    typicalQuestions: [
      'Is the observed subgroup heterogeneity clinically meaningful?',
      'Does the overall effect persist after adjusting for the differential subgroup?',
      'Should the labeling restrict to the responsive subgroup?',
    ],
    votingQuestionTemplates: [
      'Should the indication be limited to the [responsive] subgroup?',
      'Is the overall trial result consistent across pre-specified subgroups?',
    ],
    historicalFrequency: 0.21,
    negativeVoteCorrelation: 0.42,
    fdaOverrideRate: 0.2,
    panelistSensitivity: { biostatistician: 0.9, clinician: 0.55 },
    consumerRepImpact: 0.35,
    statisticianFocusAreas: [
      'Pre-specification of subgroup analyses',
      'Interaction testing methodology',
      'Multiplicity adjustment for subgroup claims',
    ],
    mitigationStrategies: [
      'Distinguish quantitative from qualitative subgroup interactions explicitly.',
      'Use forest plots with pre-specified vs post-hoc tags.',
      'Provide biological rationale for any subgroup-restricted indication.',
    ],
    recommendedPresentations: [
      'Pre-specified subgroup forest plot',
      'Biological rationale for differential response',
    ],
    counterargumentFrameworks: [
      {
        concern: 'The drug only works in a subset of patients.',
        counterargument: 'All pre-specified subgroups show benefit in the same direction; the magnitude varies but no qualitative interaction is present. Indication need not be restricted.',
        supportingEvidence: 'Interaction p-values across pre-specified subgroups, all > 0.05',
        effectivenessRating: 0.65,
      },
    ],
  },
  {
    patternCode: 'AC_COMPARATOR_CHOICE',
    patternName: 'Comparator inadequate or non-current standard of care',
    committeeType: 'ODAC',
    riskCategory: 'comparator_choice',
    typicalQuestions: [
      'Is the comparator the current standard of care?',
      'How does the drug compare to recently approved therapies not included in the trial?',
      'Is a placebo control ethically justifiable in this indication?',
    ],
    votingQuestionTemplates: [
      'Is the comparator adequate to support the proposed indication?',
      'Is additional comparative effectiveness data required prior to approval?',
    ],
    historicalFrequency: 0.18,
    negativeVoteCorrelation: 0.48,
    fdaOverrideRate: 0.15,
    panelistSensitivity: { clinician: 0.85, biostatistician: 0.6 },
    consumerRepImpact: 0.4,
    statisticianFocusAreas: [
      'Effect size relative to historical comparator',
      'Network meta-analysis vs current SOC',
      'Active-controlled non-inferiority margin justification',
    ],
    mitigationStrategies: [
      'Provide network meta-analysis vs all current SOC options.',
      'Justify comparator selection with the time-of-design treatment landscape.',
      'Commit to post-approval head-to-head comparator study where SOC has shifted.',
    ],
    recommendedPresentations: [
      'Comparator-landscape evolution timeline',
      'Network meta-analysis vs current alternatives',
    ],
    counterargumentFrameworks: [
      {
        concern: 'The trial used an outdated comparator.',
        counterargument: 'The comparator reflected the standard of care at trial initiation. Indirect comparisons via network meta-analysis show consistent benefit vs newer approvals.',
        supportingEvidence: 'NMA report and time-of-design SOC documentation',
        effectivenessRating: 0.55,
      },
    ],
  },
  {
    patternCode: 'AC_LABELING_SCOPE_PEDIATRIC',
    patternName: 'Pediatric extrapolation — labeling scope and dose justification',
    committeeType: 'PCNS',
    riskCategory: 'pediatric_extrapolation',
    typicalQuestions: [
      'Is full pediatric extrapolation justified per the FDA pediatric extrapolation framework?',
      'Are the proposed pediatric doses supported by adult PK bridging?',
      'What pediatric-specific safety monitoring is required?',
    ],
    votingQuestionTemplates: [
      'Is the pediatric extrapolation framework adequately supported?',
      'Should pediatric labeling be limited to the studied age group?',
    ],
    historicalFrequency: 0.12,
    negativeVoteCorrelation: 0.5,
    fdaOverrideRate: 0.16,
    panelistSensitivity: { pediatrician: 0.9, pharmacologist: 0.7, biostatistician: 0.6 },
    consumerRepImpact: 0.5,
    statisticianFocusAreas: [
      'Adult-to-pediatric PK extrapolation modeling',
      'Pediatric-specific safety analyses',
      'Long-term growth and development monitoring',
    ],
    mitigationStrategies: [
      'Use modeling-and-simulation (M&S) to justify pediatric doses.',
      'Plan and commit to long-term pediatric follow-up.',
      'Stratify pediatric labeling by age band with explicit dose adjustment.',
    ],
    recommendedPresentations: [
      'Pediatric PK/PD modeling summary',
      'Long-term safety monitoring plan',
    ],
    counterargumentFrameworks: [
      {
        concern: 'Pediatric data are limited.',
        counterargument: 'Extrapolation from adults is supported by [shared disease pathway / PK similarity / class precedent], and the pediatric study is powered for the safety questions specific to this population.',
        supportingEvidence: 'FDA Pediatric Extrapolation Framework alignment minutes',
        effectivenessRating: 0.65,
      },
    ],
  },
];
