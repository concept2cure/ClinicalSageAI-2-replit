/**
 * Statistical Methods — canonical domain vocabulary.
 *
 * 18 statistical-method entries covering parametric and non-parametric
 * tests, survival analysis, Bayesian methods, adaptive designs, and
 * sensitivity analyses. Used by the intelligence question engine,
 * statistical analysis plan design, and protocol planning workflows.
 *
 * @module shared/constants/domain/statistical-methods
 */

import type { QuestionOption } from '../../types/intelligence-questions.js';
import { toQuestionOptions as sharedToQuestionOptions, type DomainEntry } from './types.js';

export type StatisticalMethod =
  | 'ancova'
  | 'anova'
  | 'mmrm'
  | 'cox_ph'
  | 'kaplan_meier'
  | 'log_rank'
  | 'logistic_regression'
  | 'chi_square'
  | 'wilcoxon'
  | 'bayesian_adaptive'
  | 'group_sequential'
  | 'win_ratio'
  | 'propensity_score'
  | 'meta_analysis'
  | 'responder_analysis'
  | 'subgroup_analysis'
  | 'missing_data_sensitivity'
  | 'other';

export const STATISTICAL_METHODS: DomainEntry<StatisticalMethod>[] = [
  {
    value: 'ancova',
    label: 'ANCOVA',
    description: 'Analysis of covariance for continuous endpoints with baseline adjustment.',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'anova',
    label: 'ANOVA',
    description: 'Analysis of variance for comparing means across treatment groups.',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'mmrm',
    label: 'Mixed Model Repeated Measures (MMRM)',
    description: 'Likelihood-based repeated measures analysis handling missing data under MAR.',
    regulatoryRefs: ['ICH E9(R1)'],
  },
  {
    value: 'cox_ph',
    label: 'Cox Proportional Hazards',
    description: 'Semi-parametric regression for time-to-event data with covariates.',
  },
  {
    value: 'kaplan_meier',
    label: 'Kaplan-Meier Estimation',
    description: 'Non-parametric survival function estimation with censored observations.',
  },
  {
    value: 'log_rank',
    label: 'Log-Rank Test',
    description: 'Non-parametric comparison of survival distributions between treatment groups.',
  },
  {
    value: 'logistic_regression',
    label: 'Logistic Regression',
    description: 'Regression model for binary endpoint analysis with covariate adjustment.',
  },
  {
    value: 'chi_square',
    label: 'Chi-Square / Fisher\'s Exact',
    description: 'Tests of association for categorical data in contingency tables.',
  },
  {
    value: 'wilcoxon',
    label: 'Wilcoxon Rank Sum / Mann-Whitney',
    description: 'Non-parametric rank-based comparison for ordinal or non-normal continuous data.',
  },
  {
    value: 'bayesian_adaptive',
    label: 'Bayesian Adaptive Design',
    description: 'Bayesian framework for adaptive dose-finding, response-adaptive randomization, or seamless designs.',
    regulatoryRefs: ['FDA Bayesian Guidance'],
  },
  {
    value: 'group_sequential',
    label: 'Group Sequential Methods',
    description: 'Pre-planned interim analyses with alpha-spending functions (e.g., O\'Brien-Fleming).',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'win_ratio',
    label: 'Win Ratio / Generalized Pairwise',
    description: 'Pairwise comparison method for hierarchical composite endpoints.',
  },
  {
    value: 'propensity_score',
    label: 'Propensity Score Methods',
    description: 'Matching, weighting, or stratification to reduce confounding in observational data.',
  },
  {
    value: 'meta_analysis',
    label: 'Meta-Analysis (Fixed/Random Effects)',
    description: 'Quantitative synthesis of effect estimates across multiple studies.',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'responder_analysis',
    label: 'Responder Analysis',
    description: 'Dichotomization of a continuous endpoint at a clinically meaningful threshold.',
  },
  {
    value: 'subgroup_analysis',
    label: 'Subgroup / Interaction Analysis',
    description: 'Pre-specified subgroup analyses with treatment-by-subgroup interaction tests.',
    regulatoryRefs: ['ICH E9'],
  },
  {
    value: 'missing_data_sensitivity',
    label: 'Missing Data Sensitivity Analysis',
    description: 'Sensitivity analyses under MNAR assumptions aligned with the estimand framework.',
    regulatoryRefs: ['ICH E9(R1)'],
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Statistical method not covered by the predefined categories.',
  },
];

/** Convert STATISTICAL_METHODS to QuestionOption[] for use in intelligence question flows. */
export function toQuestionOptions(): QuestionOption[] {
  return sharedToQuestionOptions(STATISTICAL_METHODS);
}
