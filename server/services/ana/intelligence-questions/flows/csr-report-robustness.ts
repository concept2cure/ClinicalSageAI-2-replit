/** The existing CSR robustness question, composed into its single registered flow. */
import type { QuestionNode } from '../../../../../shared/types/intelligence-questions.js';

export function createCsrRobustnessNode(): QuestionNode {
  return {
    id: 'sensitivity_analyses',
    section: 'efficacy_results',
    question:
      'Describe the prespecified sensitivity analyses, any supplementary analyses and any post-hoc analyses, whether or not the primary endpoint was met.',
    guidance:
      'Using the retained SAP and analysis outputs, describe the main estimator and the sensitivity analyses that assess assumptions for the same estimand, regardless of whether the primary result met its criterion. Supplementary analyses target a different estimand and must be identified separately. State which analyses were prespecified and which were post-hoc; post-hoc results are exploratory and do not establish a confirmatory efficacy claim. If analyses were not performed or records are unavailable, record that fact and the source-supported rationale rather than invent a result. For an unmet primary objective, describe its observed result and limitations without inventing a reason for failure.',
    provideExpertFeedback: true,
    fields: [
      {
        id: 'sensitivity_analyses_performed',
        label: 'Were Pre-Specified Sensitivity Analyses Performed?',
        type: 'yes_no',
        required: true,
      },
      {
        id: 'sensitivity_analysis_summary',
        label: 'Sensitivity Analysis Results',
        type: 'textarea',
        placeholder: 'For each same-estimand sensitivity analysis, identify the assumption assessed, method, source output and whether it supports the robustness of the primary interpretation. Do not assume a per-protocol analysis targets the same estimand.',
        required: true,
        validation: { minLength: 50, maxLength: 5000 },
        visibleWhen: { field: 'sensitivity_analyses_performed', operator: 'eq', value: true },
      },
      {
        id: 'sensitivity_analysis_rationale',
        label: 'Source-supported rationale or missing records',
        type: 'textarea',
        placeholder: 'State why sensitivity analyses were not performed, or which SAP/analysis records are still needed. Do not create an analysis result.',
        required: true,
        validation: { minLength: 30, maxLength: 5000 },
        visibleWhen: { field: 'sensitivity_analyses_performed', operator: 'eq', value: false },
      },
      {
        id: 'supplementary_analyses_performed',
        label: 'Were supplementary analyses of a different estimand performed?',
        type: 'yes_no',
      },
      {
        id: 'supplementary_analysis_summary',
        label: 'Supplementary analysis estimand and results',
        type: 'textarea',
        placeholder: 'Name the different estimand, its source-defined methods and recorded outputs; distinguish these from sensitivity analyses of the main estimand.',
        required: true,
        validation: { minLength: 30, maxLength: 5000 },
        visibleWhen: { field: 'supplementary_analyses_performed', operator: 'eq', value: true },
      },
      {
        id: 'post_hoc_analyses_performed',
        label: 'Were Post-Hoc Analyses Performed?',
        type: 'yes_no',
      },
      {
        id: 'post_hoc_analysis_summary',
        label: 'Post-Hoc Analysis Summary',
        type: 'textarea',
        placeholder: 'Describe any post-hoc analyses, subgroup analyses, or responder analyses performed.',
        visibleWhen: {
          field: 'post_hoc_analyses_performed',
          operator: 'eq',
          value: true,
        },
      },
      {
        id: 'potential_reasons_for_failure',
        label: 'Interpretation of an unmet primary objective',
        type: 'textarea',
        placeholder: 'Describe the observed result, its uncertainty and source-supported limitations. Label unresolved explanations as hypotheses; do not assume a cause.',
        required: true,
        visibleWhen: { field: 'primary_endpoint_met', operator: 'eq', value: false },
      },
    ],
    defaultNext: 'secondary_results',
  };
}
