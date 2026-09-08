/**
 * Section 4 — Literature Search & Appraisal — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/literature-appraisal-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const literatureAppraisalNodes: QuestionNode[] = [
  {
    id: 'literature_search',
    section: 'literature_appraisal',
    question:
      'Describe the literature search strategy and results.',
    guidance:
      'MEDDEV 2.7/1 Rev 4 Section 8 requires a systematic literature review. The search strategy must be documented, reproducible, and comprehensive. Include the databases searched, search terms (using PICO framework: Population, Intervention, Comparison, Outcome), date range, and the screening/appraisal methodology. Multiple databases should be searched to ensure comprehensive coverage — MEDDEV 2.7/1 Rev 4 explicitly recommends searching at minimum PubMed/MEDLINE and Embase. The literature search protocol should be finalized before conducting the search. A PRISMA flow diagram is strongly recommended to document the screening process. ISO 14155:2020 Annex A provides guidance on literature search methodology for clinical investigations.',
    fields: [
      {
        id: 'literature_search_protocol',
        label: 'Literature Search Protocol Documented',
        type: 'yes_no',
        required: true,
        helpText: 'A written protocol should be finalized before conducting the search',
      },
      {
        id: 'pico_framework_used',
        label: 'PICO Framework Used for Search Strategy',
        type: 'yes_no',
        required: true,
        helpText: 'Population, Intervention, Comparison, Outcome — the recommended framework for structuring clinical questions and search terms',
      },
      {
        id: 'pico_population',
        label: 'PICO — Population',
        type: 'textarea',
        visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
        helpText: 'Target patient population and clinical condition',
      },
      {
        id: 'pico_intervention',
        label: 'PICO — Intervention',
        type: 'textarea',
        visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
        helpText: 'The device or procedure under evaluation',
      },
      {
        id: 'pico_comparison',
        label: 'PICO — Comparison',
        type: 'textarea',
        visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
        helpText: 'Alternative treatments, standard of care, or competing devices',
      },
      {
        id: 'pico_outcome',
        label: 'PICO — Outcome',
        type: 'textarea',
        visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
        helpText: 'Clinical endpoints: safety (adverse events, complications) and performance (efficacy, success rates)',
      },
      {
        id: 'literature_search_strategy',
        label: 'Literature Search Strategy',
        type: 'textarea',
        required: true,
        helpText: 'Describe search terms, Boolean operators, MeSH/EMTREE terms, inclusion/exclusion criteria, and date range',
        validation: { minLength: 50 },
      },
      {
        id: 'databases_searched',
        label: 'Databases Searched',
        type: 'multi_select',
        required: true,
        options: [
          { value: 'pubmed', label: 'PubMed / MEDLINE' },
          { value: 'embase', label: 'Embase' },
          { value: 'cochrane', label: 'Cochrane Library' },
          { value: 'scopus', label: 'Scopus' },
          { value: 'web_of_science', label: 'Web of Science' },
          { value: 'google_scholar', label: 'Google Scholar' },
          { value: 'clinicaltrials_gov', label: 'ClinicalTrials.gov' },
          { value: 'who_ictrp', label: 'WHO ICTRP' },
          { value: 'eudamed', label: 'EUDAMED (when available)' },
        ],
      },
      {
        id: 'search_date_range',
        label: 'Literature Search Date Range',
        type: 'text',
        required: true,
        placeholder: 'e.g. January 2010 — December 2025',
      },
      {
        id: 'search_last_conducted',
        label: 'Date Search Was Last Conducted',
        type: 'date',
        required: true,
        helpText: 'The literature search should be updated before each CER revision',
      },
      {
        id: 'total_articles_identified',
        label: 'Total Articles Identified',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'articles_after_duplicate_removal',
        label: 'Articles After Duplicate Removal',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'articles_after_title_abstract_screening',
        label: 'Articles After Title/Abstract Screening',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'articles_after_full_text_screening',
        label: 'Articles After Full-Text Screening',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'articles_included_after_screening',
        label: 'Total Articles Included in Evaluation',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'articles_pivotal',
        label: 'Number of Pivotal Articles',
        type: 'number',
        validation: { min: 0 },
        helpText: 'Articles directly relevant to the subject or equivalent device that form the core evidence base',
      },
      {
        id: 'articles_supportive',
        label: 'Number of Supportive Articles',
        type: 'number',
        validation: { min: 0 },
        helpText: 'Articles providing background or contextual information (state of the art, benchmarks)',
      },
      {
        id: 'prisma_flow_diagram',
        label: 'PRISMA Flow Diagram Prepared',
        type: 'yes_no',
        helpText: 'Strongly recommended to document the screening and selection process per PRISMA 2020 guidelines',
      },
      {
        id: 'grey_literature_searched',
        label: 'Grey Literature Searched',
        type: 'yes_no',
        helpText: 'Conference proceedings, regulatory reports, registries, device-specific databases — MEDDEV 2.7/1 Rev 4 recommends including non-peer-reviewed sources',
      },
    ],
    issueChecks: [
      {
        id: 'literature_search_fewer_than_2_databases_check',
        condition: { field: 'databases_searched', operator: 'eq', value: ['pubmed'] },
        severity: 'warning',
        title: 'Literature Search < 2 Databases',
        message:
          'MEDDEV 2.7/1 Rev 4 requires a comprehensive literature search. Searching only a single database may miss relevant publications. At minimum, PubMed/MEDLINE and Embase should be searched. Notified Bodies routinely cite single-database searches as a deficiency.',
        reference: 'MEDDEV 2.7/1 Rev 4, Section 8',
      },
    ],
    defaultNext: 'literature_appraisal_method',
  },

  {
    id: 'literature_appraisal_method',
    section: 'literature_appraisal',
    question:
      'Describe the methodology used to appraise the quality and relevance of clinical data from the literature.',
    guidance:
      'Per MEDDEV 2.7/1 Rev 4 Section 9, each piece of clinical data must be appraised for methodological quality (suitability of the study design, statistical methods, and conduct) and scientific relevance (to the subject device\'s intended purpose, target population, and clinical conditions). The appraisal must be documented for each included study. The evaluator should assess study design, sample size, bias, confounding factors, and statistical methods. Each study should be assigned a level of evidence and its contribution to the overall evidence base weighted accordingly. The appraisal criteria must be defined before the appraisal is conducted.',
    fields: [
      {
        id: 'appraisal_method_documented',
        label: 'Appraisal Method Documented',
        type: 'yes_no',
        required: true,
        helpText: 'The appraisal methodology must be defined and documented per MEDDEV 2.7/1 Rev 4 Section 9',
      },
      {
        id: 'appraisal_method',
        label: 'Evidence Appraisal Method',
        type: 'select',
        required: true,
        options: [
          { value: 'oxford_levels', label: 'Oxford Levels of Evidence' },
          { value: 'grade', label: 'GRADE (Grading of Recommendations Assessment)' },
          { value: 'jadad', label: 'Jadad Score (for RCTs)' },
          { value: 'newcastle_ottawa', label: 'Newcastle-Ottawa Scale (for observational studies)' },
          { value: 'rob2', label: 'Cochrane Risk of Bias (RoB 2)' },
          { value: 'robins_i', label: 'ROBINS-I (for non-randomized studies)' },
          { value: 'custom', label: 'Custom Appraisal Framework' },
        ],
      },
      {
        id: 'quality_assessment_criteria',
        label: 'Study Quality Assessment Criteria',
        type: 'textarea',
        required: true,
        helpText: 'Describe the specific criteria and scales used to assess the quality of individual studies (study design, randomization, blinding, sample size, follow-up, statistical analysis)',
      },
      {
        id: 'relevance_assessment',
        label: 'Relevance Assessment Criteria',
        type: 'textarea',
        required: true,
        helpText: 'Describe how relevance to the subject device was assessed: direct relevance (same device), indirect relevance (equivalent device), or contextual relevance (device category)',
      },
      {
        id: 'data_weighting_approach',
        label: 'Data Weighting Approach',
        type: 'textarea',
        required: true,
        helpText: 'Describe how different data sources and studies are weighted in the overall clinical evaluation. Higher-quality, more relevant studies should carry more weight.',
      },
      {
        id: 'bias_assessment',
        label: 'Bias Assessment Conducted',
        type: 'yes_no',
        required: true,
        helpText: 'Assessment of selection bias, performance bias, detection bias, attrition bias, and reporting bias for each included study',
      },
      {
        id: 'number_pivotal_studies',
        label: 'Number of Pivotal Studies',
        type: 'number',
        validation: { min: 0 },
        helpText: 'Studies with the highest relevance and quality forming the core evidence base for the device',
      },
      {
        id: 'number_supportive_studies',
        label: 'Number of Supportive Studies',
        type: 'number',
        validation: { min: 0 },
      },
      {
        id: 'data_extraction_standardized',
        label: 'Standardized Data Extraction Form Used',
        type: 'yes_no',
        helpText: 'Use of a standardized form ensures consistent data extraction across studies',
      },
    ],
    issueChecks: [
      {
        id: 'appraisal_method_not_documented_check',
        condition: { field: 'appraisal_method_documented', operator: 'eq', value: false },
        severity: 'warning',
        title: 'Appraisal Method Not Documented',
        message:
          'The appraisal methodology must be documented per MEDDEV 2.7/1 Rev 4 Section 9. Without a documented appraisal method, the clinical evaluation cannot demonstrate that data quality and relevance were systematically assessed. This is a common deficiency cited by Notified Bodies.',
        reference: 'MEDDEV 2.7/1 Rev 4, Section 9',
      },
    ],
    defaultNext: 'data_analysis',
  },

  {
    id: 'data_analysis',
    section: 'literature_appraisal',
    question:
      'Describe the data analysis and synthesis methodology.',
    guidance:
      'The CER should describe how clinical data from different sources is analyzed and synthesized to reach conclusions on safety and performance per MEDDEV 2.7/1 Rev 4 Section 10. Where appropriate, quantitative methods (meta-analysis) may be used. The analysis should address heterogeneity between studies, publication bias, and the robustness of conclusions. Separate analyses should be conducted for safety and performance endpoints. The analysis must be traceable — each conclusion must be linked to the underlying evidence.',
    fields: [
      {
        id: 'statistical_methods',
        label: 'Statistical Methods for Data Synthesis',
        type: 'textarea',
        required: true,
        helpText: 'Describe the statistical methods used to analyze and synthesize clinical data from different sources',
      },
      {
        id: 'meta_analysis_performed',
        label: 'Meta-Analysis Performed',
        type: 'yes_no',
      },
      {
        id: 'meta_analysis_method',
        label: 'Meta-Analysis Method',
        type: 'select',
        visibleWhen: { field: 'meta_analysis_performed', operator: 'eq', value: true },
        options: [
          { value: 'fixed_effects', label: 'Fixed Effects Model' },
          { value: 'random_effects', label: 'Random Effects Model' },
          { value: 'bayesian', label: 'Bayesian Meta-Analysis' },
        ],
      },
      {
        id: 'heterogeneity_assessment',
        label: 'Heterogeneity Assessment',
        type: 'textarea',
        visibleWhen: { field: 'meta_analysis_performed', operator: 'eq', value: true },
        helpText: 'Describe how heterogeneity between studies was assessed (e.g. I-squared statistic, Cochran Q test)',
      },
      {
        id: 'sensitivity_analysis',
        label: 'Sensitivity Analysis Performed',
        type: 'yes_no',
        helpText: 'To test the robustness of conclusions by excluding individual studies or using different statistical models',
      },
      {
        id: 'publication_bias_assessment',
        label: 'Publication Bias Assessment',
        type: 'yes_no',
        helpText: 'e.g. Funnel plot, Egger\'s test, Begg\'s test',
      },
      {
        id: 'safety_data_summary',
        label: 'Safety Data Summary',
        type: 'textarea',
        required: true,
        helpText: 'Summarize the overall safety profile from all data sources: adverse events, complications, device-related incidents, mortality, reoperation rates',
      },
      {
        id: 'performance_data_summary',
        label: 'Performance/Efficacy Data Summary',
        type: 'textarea',
        required: true,
        helpText: 'Summarize the overall performance and clinical effectiveness from all data sources: primary endpoints, success rates, patient-reported outcomes',
      },
      {
        id: 'data_consistency_assessment',
        label: 'Data Consistency Assessment',
        type: 'textarea',
        helpText: 'Assess whether findings from different data sources (literature, clinical investigations, post-market) are consistent with each other',
      },
    ],
    defaultNext: 'clinical_investigation_detail',
  },
];
