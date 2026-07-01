/**
 * Clinical Study Report (CSR) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through the key sections of a CSR aligned with ICH E3,
 * covering study identification, design summary, efficacy results, safety
 * results, statistical methods, and conclusions. Branching logic and issue
 * checks flag regulatory considerations as answers are collected.
 *
 * @module server/services/ana/intelligence-questions/flows/csr-report
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createCsrReportFlow(): FlowDefinition {
  return {
    id: 'csr-report-v1',
    category: 'csr_report',
    name: 'Clinical Study Report',
    description:
      'Structured questionnaire for assembling a Clinical Study Report (CSR) per ICH E3, covering study identification, design, efficacy and safety results, statistical methods, and conclusions.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'study_id',
    estimatedMinutes: 30,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'study_identification',
        label: 'Study Identification',
        nodeIds: ['study_id', 'study_dates'],
      },
      {
        id: 'design_summary',
        label: 'Study Design Summary',
        nodeIds: ['design_overview', 'study_drug_info'],
      },
      {
        id: 'efficacy_results',
        label: 'Efficacy Results',
        nodeIds: ['primary_results', 'secondary_results'],
      },
      {
        id: 'safety_results',
        label: 'Safety Results',
        nodeIds: ['safety_overview', 'serious_events'],
      },
      {
        id: 'stat_methods',
        label: 'Statistical Methods',
        nodeIds: ['analysis_sets', 'stat_summary'],
      },
      {
        id: 'conclusions',
        label: 'Conclusions',
        nodeIds: ['study_conclusions'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── Study Identification ──────────────────────────────────────── */

      {
        id: 'study_id',
        section: 'study_identification',
        question:
          'Let\'s identify the study. Please provide the protocol number, title, and sponsor details.',
        guidance:
          'Per ICH E3 Section 1, the CSR must clearly identify the study by protocol number, title, IND/IDE number (if applicable), sponsor name, and development phase.',
        fields: [
          {
            id: 'protocol_number',
            label: 'Protocol Number',
            type: 'text',
            placeholder: 'e.g., ABC-2025-001',
            required: true,
          },
          {
            id: 'study_title',
            label: 'Study Title',
            type: 'text',
            placeholder: 'e.g., A Phase 3, Randomized, Double-Blind Study of...',
            required: true,
          },
          {
            id: 'ind_ide_number',
            label: 'IND/IDE Number',
            type: 'text',
            placeholder: 'e.g., IND 123456',
          },
          {
            id: 'sponsor',
            label: 'Sponsor',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
          },
          {
            id: 'study_phase',
            label: 'Phase',
            type: 'select',
            required: true,
            options: [
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_3', label: 'Phase 3' },
              { value: 'phase_4', label: 'Phase 4' },
            ],
          },
        ],
        defaultNext: 'study_dates',
      },

      {
        id: 'study_dates',
        section: 'study_identification',
        question:
          'What are the key dates for this study?',
        guidance:
          'ICH E3 Section 2 requires the CSR to document the dates of first enrollment, last subject last visit, database lock, and clinical cutoff. These dates establish the reporting period and data currency.',
        fields: [
          {
            id: 'first_subject_enrolled',
            label: 'First Subject Enrolled Date',
            type: 'date',
            required: true,
          },
          {
            id: 'last_subject_last_visit',
            label: 'Last Subject Last Visit Date',
            type: 'date',
            required: true,
          },
          {
            id: 'database_lock_date',
            label: 'Database Lock Date',
            type: 'date',
          },
          {
            id: 'clinical_cutoff_date',
            label: 'Clinical Cutoff Date',
            type: 'date',
          },
        ],
        defaultNext: 'design_overview',
      },

      /* ── Study Design Summary ──────────────────────────────────────── */

      {
        id: 'design_overview',
        section: 'design_summary',
        question:
          'Summarize the study design as it was actually conducted.',
        guidance:
          'ICH E3 Section 9 requires a synopsis of the study design, objectives, planned and actual enrollment, and number of sites. This section sets the context for interpreting the results.',
        fields: [
          {
            id: 'design_description',
            label: 'Study Design Description',
            type: 'textarea',
            helpText: 'Brief description of the study design as it was conducted',
            required: true,
          },
          {
            id: 'study_objective',
            label: 'Study Objective',
            type: 'select',
            required: true,
            options: [
              { value: 'efficacy_and_safety', label: 'Efficacy and Safety' },
              { value: 'safety_only', label: 'Safety Only' },
              { value: 'pharmacokinetics', label: 'Pharmacokinetics' },
              { value: 'dose_finding', label: 'Dose Finding' },
              { value: 'bioequivalence', label: 'Bioequivalence' },
            ],
          },
          {
            id: 'subjects_planned',
            label: 'Number of Subjects Planned',
            type: 'number',
            required: true,
          },
          {
            id: 'subjects_enrolled',
            label: 'Number of Subjects Enrolled',
            type: 'number',
            required: true,
          },
          {
            id: 'number_of_sites',
            label: 'Number of Sites',
            type: 'number',
            required: true,
          },
        ],
        defaultNext: 'study_drug_info',
      },

      {
        id: 'study_drug_info',
        section: 'design_summary',
        question:
          'Provide details about the investigational product studied.',
        guidance:
          'ICH E3 Section 9.4 requires documentation of the investigational product, including name, dose(s), route of administration, and comparator details. This information is essential for interpreting the benefit-risk profile.',
        fields: [
          {
            id: 'investigational_product_name',
            label: 'Investigational Product Name',
            type: 'text',
            placeholder: 'e.g., Drug X (generic name)',
            required: true,
          },
          {
            id: 'doses_studied',
            label: 'Dose(s) Studied',
            type: 'textarea',
            placeholder: 'e.g., 100 mg once daily, 200 mg once daily',
            required: true,
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'select',
            required: true,
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'intravenous', label: 'Intravenous' },
              { value: 'subcutaneous', label: 'Subcutaneous' },
              { value: 'intramuscular', label: 'Intramuscular' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhaled', label: 'Inhaled' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'comparator',
            label: 'Comparator',
            type: 'text',
            placeholder: 'e.g., Placebo, Standard of Care',
            visibleWhen: {
              field: 'study_objective',
              operator: 'neq',
              value: 'pharmacokinetics',
            },
          },
        ],
        defaultNext: 'primary_results',
      },

      /* ── Efficacy Results ──────────────────────────────────────────── */

      {
        id: 'primary_results',
        section: 'efficacy_results',
        question:
          'What were the primary efficacy results?',
        guidance:
          'ICH E3 Section 11.4 requires a detailed presentation of primary endpoint results, including whether the endpoint was met, the point estimate, confidence interval, and p-value. A clear statement of whether the primary objective was achieved is essential.',
        fields: [
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'primary_endpoint_result_summary',
            label: 'Primary Endpoint Result Summary',
            type: 'textarea',
            placeholder: 'Summarize the primary efficacy result, including treatment difference and clinical interpretation.',
            required: true,
          },
          {
            id: 'p_value',
            label: 'P-value',
            type: 'text',
            placeholder: 'e.g. p=0.003',
          },
          {
            id: 'effect_size',
            label: 'Effect Size',
            type: 'text',
            placeholder: 'e.g. HR=0.72, 95% CI 0.58-0.89',
          },
        ],
        defaultNext: 'secondary_results',
        issueChecks: [
          {
            id: 'primary_endpoint_not_met',
            condition: {
              field: 'primary_endpoint_met',
              operator: 'eq',
              value: false,
            },
            severity: 'info',
            title: 'Primary Endpoint Not Met',
            message:
              'Consider discussing implications for the development program.',
          },
        ],
      },

      {
        id: 'secondary_results',
        section: 'efficacy_results',
        question:
          'What were the key secondary efficacy results?',
        guidance:
          'ICH E3 Section 11.4 also requires secondary endpoint results. Document whether key secondary endpoints were met and summarize any subgroup analyses performed.',
        fields: [
          {
            id: 'key_secondary_endpoints_met',
            label: 'Key Secondary Endpoints Met',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'all_met', label: 'All Met' },
              { value: 'some_met', label: 'Some Met' },
              { value: 'none_met', label: 'None Met' },
            ],
          },
          {
            id: 'secondary_results_summary',
            label: 'Secondary Results Summary',
            type: 'textarea',
            placeholder: 'Summarize the key secondary endpoint results.',
            required: true,
          },
          {
            id: 'subgroup_analyses_performed',
            label: 'Subgroup Analyses Performed',
            type: 'yes_no',
          },
        ],
        defaultNext: 'safety_overview',
      },

      /* ── Safety Results ────────────────────────────────────────────── */

      {
        id: 'safety_overview',
        section: 'safety_results',
        question:
          'Provide an overview of the safety results.',
        guidance:
          'ICH E3 Section 12 requires a comprehensive safety summary including the total number of AEs, drug-related AEs, discontinuations due to AEs, and the most common adverse events. This forms the basis of the benefit-risk assessment.',
        fields: [
          {
            id: 'total_aes_reported',
            label: 'Total AEs Reported',
            type: 'number',
            required: true,
          },
          {
            id: 'drug_related_aes',
            label: 'Drug-Related AEs',
            type: 'number',
            required: true,
          },
          {
            id: 'discontinuations_due_to_aes',
            label: 'Discontinuations Due to AEs',
            type: 'number',
            required: true,
          },
          {
            id: 'most_common_aes',
            label: 'Most Common AEs',
            type: 'textarea',
            helpText: 'List AEs occurring in ≥5% of subjects',
            required: true,
          },
        ],
        defaultNext: 'serious_events',
      },

      {
        id: 'serious_events',
        section: 'safety_results',
        question:
          'Provide details on serious adverse events and deaths.',
        guidance:
          'ICH E3 Section 12.2 and 12.3 require individual SAE listings and death narratives. All deaths must be individually narrativized regardless of causality assessment. Drug-related SAEs require special attention in the benefit-risk discussion.',
        fields: [
          {
            id: 'total_saes',
            label: 'Total SAEs',
            type: 'number',
            required: true,
          },
          {
            id: 'drug_related_saes',
            label: 'Drug-Related SAEs',
            type: 'number',
          },
          {
            id: 'deaths',
            label: 'Deaths',
            type: 'number',
            required: true,
          },
          {
            id: 'deaths_drug_related',
            label: 'Deaths Drug-Related',
            type: 'number',
          },
        ],
        defaultNext: 'analysis_sets',
        issueChecks: [
          {
            id: 'deaths_reported',
            condition: {
              field: 'deaths',
              operator: 'gt',
              value: 0,
            },
            severity: 'critical',
            title: 'Deaths Reported',
            message:
              'All deaths must be individually narrativized per ICH E3 §12.3.2.',
            reference: 'ICH E3: Structure and Content of Clinical Study Reports',
          },
        ],
      },

      /* ── Statistical Methods ───────────────────────────────────────── */

      {
        id: 'analysis_sets',
        section: 'stat_methods',
        question:
          'What were the analysis population sizes?',
        guidance:
          'ICH E3 Section 11.1 requires documentation of all analysis populations. The ITT, mITT, per-protocol (PP), and safety populations should be clearly defined with the number of subjects in each and the reasons for exclusion from each set.',
        fields: [
          {
            id: 'itt_population_size',
            label: 'ITT Population Size',
            type: 'number',
            required: true,
          },
          {
            id: 'mitt_population_size',
            label: 'mITT Population Size',
            type: 'number',
          },
          {
            id: 'pp_population_size',
            label: 'PP Population Size',
            type: 'number',
            required: true,
          },
          {
            id: 'safety_population_size',
            label: 'Safety Population Size',
            type: 'number',
            required: true,
          },
        ],
        defaultNext: 'stat_summary',
      },

      {
        id: 'stat_summary',
        section: 'stat_methods',
        question:
          'Summarize the statistical methods used in the study.',
        guidance:
          'ICH E3 Section 11.4 and ICH E9 require a clear description of the primary analysis method, how missing data were handled, whether interim analyses were performed, and any protocol deviations that may have impacted the analysis.',
        fields: [
          {
            id: 'primary_analysis_method',
            label: 'Primary Analysis Method',
            type: 'text',
            placeholder: 'e.g., Cox proportional hazards model stratified by region and prior therapy',
            required: true,
          },
          {
            id: 'handling_of_missing_data',
            label: 'Handling of Missing Data',
            type: 'select',
            required: true,
            options: [
              { value: 'locf', label: 'Last Observation Carried Forward (LOCF)' },
              { value: 'mmrm', label: 'Mixed Model for Repeated Measures (MMRM)' },
              { value: 'multiple_imputation', label: 'Multiple Imputation' },
              { value: 'complete_case', label: 'Complete Case Analysis' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'interim_analyses_performed',
            label: 'Interim Analyses Performed',
            type: 'yes_no',
          },
          {
            id: 'protocol_deviations_impacting_analysis',
            label: 'Protocol Deviations Impacting Analysis',
            type: 'yes_no',
          },
        ],
        defaultNext: 'study_conclusions',
      },

      /* ── Conclusions ───────────────────────────────────────────────── */

      {
        id: 'study_conclusions',
        section: 'conclusions',
        question:
          'What are the overall conclusions and next steps?',
        guidance:
          'ICH E3 Section 13 requires an overall interpretation of the study results, including a benefit-risk assessment and implications for the development program. The CSR format should follow ICH E3 conventions.',
        fields: [
          {
            id: 'overall_conclusion',
            label: 'Overall Conclusion',
            type: 'textarea',
            placeholder: 'Summarize the overall study conclusions based on the efficacy and safety results.',
            required: true,
          },
          {
            id: 'benefit_risk_assessment',
            label: 'Benefit-Risk Assessment',
            type: 'textarea',
            placeholder: 'Provide an integrated assessment of the benefit-risk profile of the investigational product.',
            required: true,
          },
          {
            id: 'implications_for_next_steps',
            label: 'Implications for Next Steps',
            type: 'textarea',
            placeholder: 'e.g., Proceed to NDA filing, initiate confirmatory study, modify dosing regimen.',
          },
          {
            id: 'csr_format',
            label: 'CSR Format',
            type: 'select',
            required: true,
            defaultValue: 'ich_e3_full',
            options: [
              { value: 'ich_e3_full', label: 'ICH E3 Full Report' },
              { value: 'ich_e3_abbreviated', label: 'ICH E3 Abbreviated Report' },
              { value: 'synoptic', label: 'Synoptic Report' },
            ],
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
