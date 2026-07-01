/**
 * Protocol Development flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through a comprehensive clinical trial protocol design,
 * covering study identity, design, population, endpoints, statistics,
 * safety monitoring, and regulatory strategy. Branching logic adapts the
 * flow based on design type (adaptive), phase, and enrollment size.
 *
 * @module server/services/ana/intelligence-questions/flows/protocol-development
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createProtocolDevelopmentFlow(): FlowDefinition {
  return {
    id: 'protocol-development-v1',
    category: 'protocol_development',
    name: 'Protocol Development',
    description:
      'Comprehensive protocol development questionnaire covering study design, population, endpoints, statistics, safety, and regulatory strategy for clinical trials.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'study_basics',
    estimatedMinutes: 25,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'study_identity',
        label: 'Study Identity',
        nodeIds: ['study_basics', 'sponsor_info'],
      },
      {
        id: 'study_design',
        label: 'Study Design',
        nodeIds: ['design_type', 'adaptive_design_details', 'blinding_randomization', 'treatment_arms'],
      },
      {
        id: 'study_population',
        label: 'Study Population',
        nodeIds: ['population_criteria', 'sample_size'],
      },
      {
        id: 'endpoints',
        label: 'Endpoints',
        nodeIds: ['primary_endpoint', 'secondary_endpoints'],
      },
      {
        id: 'statistical_design',
        label: 'Statistical Design',
        nodeIds: ['stats_approach'],
      },
      {
        id: 'safety_monitoring',
        label: 'Safety Monitoring',
        nodeIds: ['safety_plan', 'dsmb'],
      },
      {
        id: 'regulatory_strategy',
        label: 'Regulatory Strategy',
        nodeIds: ['regulatory_path', 'review_summary'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── Study Identity ─────────────────────────────────────────────── */

      {
        id: 'study_basics',
        section: 'Study Identity',
        question:
          'Let\'s begin with the study identity. What is the working title, therapeutic area, and target indication for this trial?',
        guidance:
          'Per ICH E6(R2) Section 6.1, the protocol should include a descriptive title. A good title conveys the intervention, condition, study phase, and design at a glance.',
        fields: [
          {
            id: 'study_title',
            label: 'Study Title',
            type: 'text',
            placeholder: 'e.g., A Phase 3, Randomized, Double-Blind Study of Drug X vs. Placebo in Adults with Moderate-to-Severe Condition Y',
            required: true,
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            required: false,
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'cardiology', label: 'Cardiology' },
              { value: 'neurology', label: 'Neurology' },
              { value: 'immunology', label: 'Immunology' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'rare_disease', label: 'Rare Disease' },
              { value: 'metabolic', label: 'Metabolic' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'indication',
            label: 'Indication',
            type: 'text',
            placeholder: 'e.g., Non-small cell lung cancer (NSCLC) with EGFR exon 19 deletion',
            required: true,
          },
        ],
        defaultNext: 'sponsor_info',
      },

      {
        id: 'sponsor_info',
        section: 'Study Identity',
        question:
          'Who is the sponsor of this study, and what phase of development are you in?',
        guidance:
          'ICH E6(R2) Section 5.1 requires clear identification of the sponsor. The study phase determines many downstream design requirements and regulatory expectations.',
        fields: [
          {
            id: 'sponsor_name',
            label: 'Sponsor Name',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
          },
          {
            id: 'ind_number',
            label: 'IND Number',
            type: 'text',
            placeholder: 'e.g., IND 123456',
            required: false,
            helpText: 'The FDA Investigational New Drug application number, if one has been assigned.',
          },
          {
            id: 'phase',
            label: 'Phase',
            type: 'select',
            required: true,
            options: [
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_1b_2a', label: 'Phase 1b/2a' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_2b_3', label: 'Phase 2b/3' },
              { value: 'phase_3', label: 'Phase 3' },
              { value: 'phase_3b_4', label: 'Phase 3b/4' },
            ],
          },
        ],
        defaultNext: 'design_type',
      },

      /* ── Study Design ───────────────────────────────────────────────── */

      {
        id: 'design_type',
        section: 'Study Design',
        question:
          'What study design are you planning, and what type of control will be used?',
        guidance:
          'ICH E9(R1) addresses estimands and sensitivity analyses for different designs. ICH E10 provides a framework for selecting the appropriate control group. The design should align with study objectives and the disease natural history.',
        fields: [
          {
            id: 'design_type',
            label: 'Design Type',
            type: 'select',
            required: true,
            options: [
              { value: 'parallel', label: 'Parallel Group' },
              { value: 'crossover', label: 'Crossover' },
              { value: 'factorial', label: 'Factorial' },
              { value: 'adaptive', label: 'Adaptive' },
              { value: 'basket', label: 'Basket Trial' },
              { value: 'umbrella', label: 'Umbrella Trial' },
              { value: 'platform', label: 'Platform Trial' },
            ],
          },
          {
            id: 'control_type',
            label: 'Control Type',
            type: 'select',
            required: true,
            options: [
              { value: 'placebo', label: 'Placebo' },
              { value: 'active_comparator', label: 'Active Comparator' },
              { value: 'standard_of_care', label: 'Standard of Care' },
              { value: 'no_control', label: 'No Control' },
              { value: 'historical', label: 'Historical Control' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'design_type', operator: 'eq', value: 'adaptive' },
            goto: 'adaptive_design_details',
          },
        ],
        defaultNext: 'blinding_randomization',
      },

      {
        id: 'adaptive_design_details',
        section: 'Study Design',
        question:
          'You selected an adaptive design. Tell me more about the planned adaptations and whether interim analyses are planned.',
        guidance:
          'FDA Guidance on Adaptive Designs (2019) and ICH E20 require that all adaptations be pre-specified in the protocol and the statistical analysis plan. The type-I error rate must be controlled across adaptations. An independent DMC should oversee unblinded interim results.',
        fields: [
          {
            id: 'adaptation_type',
            label: 'Adaptation Type',
            type: 'multi_select',
            required: false,
            options: [
              { value: 'sample_size_re_estimation', label: 'Sample Size Re-estimation' },
              { value: 'dose_finding', label: 'Dose Finding' },
              { value: 'population_enrichment', label: 'Population Enrichment' },
              { value: 'treatment_switching', label: 'Treatment Switching' },
              { value: 'seamless_phase', label: 'Seamless Phase' },
              { value: 'response_adaptive', label: 'Response Adaptive Randomization' },
            ],
          },
          {
            id: 'interim_analysis_planned',
            label: 'Interim Analysis Planned',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'blinding_randomization',
      },

      {
        id: 'blinding_randomization',
        section: 'Study Design',
        question:
          'What level of blinding will the study use, and how will subjects be randomized?',
        guidance:
          'ICH E9 Section 2.3 discusses the importance of blinding for reducing bias. Double-blind is the gold standard for confirmatory trials. The randomization scheme should ensure balance across treatment arms and key prognostic factors.',
        fields: [
          {
            id: 'blinding_type',
            label: 'Blinding',
            type: 'select',
            required: true,
            options: [
              { value: 'open_label', label: 'Open-Label' },
              { value: 'single_blind', label: 'Single-Blind' },
              { value: 'double_blind', label: 'Double-Blind' },
              { value: 'triple_blind', label: 'Triple-Blind' },
            ],
          },
          {
            id: 'randomization_ratio',
            label: 'Randomization Ratio',
            type: 'text',
            placeholder: 'e.g. 1:1, 2:1',
            required: false,
          },
          {
            id: 'stratification_factors',
            label: 'Stratification Factors',
            type: 'textarea',
            required: false,
          },
        ],
        issueChecks: [
          {
            id: 'open_label_bias_check',
            condition: { field: 'blinding_type', operator: 'eq', value: 'open_label' },
            severity: 'info',
            title: 'Open-Label Design',
            message:
              'Open-label designs may introduce bias; consider whether blinding is feasible.',
          },
        ],
        defaultNext: 'treatment_arms',
      },

      {
        id: 'treatment_arms',
        section: 'Study Design',
        question:
          'How many treatment arms will the study have, and what is the planned treatment duration?',
        guidance:
          'The number of arms and treatment duration affect sample size calculations, study logistics, and regulatory review. Ensure each arm is adequately powered if formal comparisons are planned.',
        fields: [
          {
            id: 'number_of_arms',
            label: 'Number of Arms',
            type: 'number',
            required: true,
            validation: { min: 1, max: 10 },
          },
          {
            id: 'comparator_drug',
            label: 'Comparator Drug',
            type: 'text',
            required: false,
            visibleWhen: { field: 'control_type', operator: 'neq', value: 'no_control' },
          },
          {
            id: 'treatment_duration',
            label: 'Treatment Duration',
            type: 'text',
            placeholder: 'e.g. 12 weeks, 6 months',
            required: true,
          },
        ],
        defaultNext: 'population_criteria',
      },

      /* ── Study Population ───────────────────────────────────────────── */

      {
        id: 'population_criteria',
        section: 'Study Population',
        question:
          'Describe the target population, including age range and key eligibility criteria.',
        guidance:
          'ICH E8(R1) emphasizes that the study population should reflect the intended therapeutic indication. ICH E6(R2) Section 6.5.1 requires clearly defined eligibility criteria. Consider FDA guidance on broadening eligibility criteria (2020) to improve enrollment diversity.',
        fields: [
          {
            id: 'target_population_description',
            label: 'Target Population Description',
            type: 'textarea',
            required: true,
          },
          {
            id: 'age_range_min',
            label: 'Minimum Age (years)',
            type: 'number',
            required: false,
            validation: { min: 0, max: 120 },
          },
          {
            id: 'age_range_max',
            label: 'Maximum Age (years)',
            type: 'number',
            required: false,
            validation: { min: 0, max: 120 },
          },
          {
            id: 'key_inclusion_criteria',
            label: 'Key Inclusion Criteria',
            type: 'textarea',
            required: true,
          },
          {
            id: 'key_exclusion_criteria',
            label: 'Key Exclusion Criteria',
            type: 'textarea',
            required: true,
          },
        ],
        defaultNext: 'sample_size',
      },

      {
        id: 'sample_size',
        section: 'Study Population',
        question:
          'What is the planned enrollment, number of sites, and geographic scope?',
        guidance:
          'ICH E9 Section 3.5 requires that the sample size be justified. Multi-regional trials must consider ICH E17 requirements for consistency assessment across regions.',
        fields: [
          {
            id: 'planned_enrollment',
            label: 'Planned Enrollment',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'number_of_sites',
            label: 'Number of Sites',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'countries',
            label: 'Countries',
            type: 'textarea',
            placeholder: 'List countries separated by commas',
            required: false,
          },
        ],
        issueChecks: [
          {
            id: 'large_trial_check',
            condition: { field: 'planned_enrollment', operator: 'gt', value: 5000 },
            severity: 'warning',
            title: 'Large Trial',
            message:
              'Trials over 5,000 subjects require additional safety monitoring infrastructure.',
          },
        ],
        defaultNext: 'primary_endpoint',
      },

      /* ── Endpoints ──────────────────────────────────────────────────── */

      {
        id: 'primary_endpoint',
        section: 'Endpoints',
        question:
          'What is the primary efficacy endpoint, and how will treatment effect be assessed?',
        guidance:
          'ICH E9 Section 2.2 requires a clearly defined primary variable that provides the most clinically relevant and convincing evidence related to the primary objective.',
        fields: [
          {
            id: 'primary_endpoint_description',
            label: 'Primary Endpoint',
            type: 'textarea',
            required: true,
            helpText: 'Define the primary efficacy endpoint precisely',
          },
          {
            id: 'endpoint_type',
            label: 'Endpoint Type',
            type: 'select',
            required: true,
            options: [
              { value: 'superiority', label: 'Superiority' },
              { value: 'non_inferiority', label: 'Non-Inferiority' },
              { value: 'equivalence', label: 'Equivalence' },
            ],
          },
          {
            id: 'clinically_meaningful_difference',
            label: 'Clinically Meaningful Difference',
            type: 'text',
            required: true,
            placeholder: 'e.g. 15% reduction in HbA1c',
          },
        ],
        defaultNext: 'secondary_endpoints',
        provideExpertFeedback: true,
      },

      {
        id: 'secondary_endpoints',
        section: 'Endpoints',
        question:
          'What secondary, exploratory, and biomarker endpoints will the study evaluate?',
        guidance:
          'ICH E9 Section 2.2.2 addresses secondary variables. Secondary endpoints should support the primary endpoint and provide additional evidence of benefit. Consider including patient-reported outcomes per FDA PRO Guidance (2009).',
        fields: [
          {
            id: 'secondary_endpoints_description',
            label: 'Secondary Endpoints',
            type: 'textarea',
            required: true,
          },
          {
            id: 'exploratory_endpoints',
            label: 'Exploratory Endpoints',
            type: 'textarea',
            required: false,
          },
          {
            id: 'biomarker_endpoints',
            label: 'Biomarker Endpoints',
            type: 'textarea',
            required: false,
            helpText: 'List any pharmacodynamic or predictive biomarker endpoints',
          },
        ],
        defaultNext: 'stats_approach',
      },

      /* ── Statistical Design ─────────────────────────────────────────── */

      {
        id: 'stats_approach',
        section: 'Statistical Design',
        question:
          'What is the planned statistical analysis approach for the primary endpoint?',
        guidance:
          'ICH E9(R1) introduced the estimand framework, requiring sponsors to precisely define the treatment effect of interest. The analysis method must align with the estimand. Multiplicity adjustment is required when there are multiple primary endpoints or key secondary endpoints used for labeling claims.',
        fields: [
          {
            id: 'primary_analysis_method',
            label: 'Primary Analysis Method',
            type: 'select',
            required: true,
            options: [
              { value: 'anova', label: 'ANOVA' },
              { value: 'ancova', label: 'ANCOVA' },
              { value: 'mixed_model', label: 'Mixed Model (MMRM)' },
              { value: 'cox_regression', label: 'Cox Regression' },
              { value: 'logistic_regression', label: 'Logistic Regression' },
              { value: 'kaplan_meier', label: 'Kaplan-Meier' },
              { value: 'chi_square', label: 'Chi-Square' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'alpha_level',
            label: 'Alpha Level',
            type: 'select',
            required: true,
            defaultValue: '0.05',
            options: [
              { value: '0.05', label: '0.05' },
              { value: '0.025', label: '0.025' },
              { value: '0.01', label: '0.01' },
              { value: '0.001', label: '0.001' },
            ],
          },
          {
            id: 'statistical_power',
            label: 'Power',
            type: 'select',
            required: true,
            defaultValue: '80',
            options: [
              { value: '80', label: '80%' },
              { value: '85', label: '85%' },
              { value: '90', label: '90%' },
              { value: '95', label: '95%' },
            ],
          },
          {
            id: 'multiplicity_adjustment',
            label: 'Multiplicity Adjustment',
            type: 'select',
            required: true,
            options: [
              { value: 'bonferroni', label: 'Bonferroni' },
              { value: 'holm', label: 'Holm' },
              { value: 'hochberg', label: 'Hochberg' },
              { value: 'gatekeeping', label: 'Gatekeeping' },
              { value: 'graphical', label: 'Graphical' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'alpha_one_vs_two_sided_check',
            condition: { field: 'alpha_level', operator: 'eq', value: '0.05' },
            severity: 'info',
            title: 'One-Sided vs Two-Sided',
            message:
              'Confirm whether the alpha is one-sided (0.025) or two-sided (0.05) for the superiority hypothesis.',
          },
        ],
        defaultNext: 'safety_plan',
      },

      /* ── Safety Monitoring ──────────────────────────────────────────── */

      {
        id: 'safety_plan',
        section: 'Safety Monitoring',
        question:
          'What is the planned approach for safety monitoring and adverse event reporting?',
        guidance:
          'ICH E6(R2) Section 6.5.3 and 6.5.4 require protocols to specify how adverse events and serious adverse events are collected, classified, and reported. FDA and ICH E6 require initial SAE reports within 24 hours for fatal or life-threatening events.',
        fields: [
          {
            id: 'sae_reporting_timeline',
            label: 'SAE Reporting Timeline',
            type: 'select',
            required: true,
            defaultValue: '24_hours',
            options: [
              { value: '24_hours', label: 'Within 24 Hours' },
              { value: '72_hours', label: 'Within 72 Hours' },
              { value: '7_days', label: 'Within 7 Days' },
            ],
          },
          {
            id: 'dlt_criteria',
            label: 'Dose-Limiting Toxicity Criteria',
            type: 'textarea',
            required: false,
            visibleWhen: { field: 'phase', operator: 'in', value: ['phase_1', 'phase_1b_2a'] },
          },
          {
            id: 'safety_run_in_planned',
            label: 'Safety Run-In Planned',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'dsmb',
      },

      {
        id: 'dsmb',
        section: 'Safety Monitoring',
        question:
          'Will an independent Data Safety Monitoring Board (DSMB) oversee this study?',
        guidance:
          'FDA Guidance on Establishment and Operation of Clinical Trial DSMBs (2006) recommends DMCs for controlled trials with mortality or major morbidity endpoints and for trials with interim efficacy analyses. Phase 3 trials almost always require a DSMB.',
        fields: [
          {
            id: 'dsmb_required',
            label: 'DSMB Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'dsmb_charter_available',
            label: 'DSMB Charter Available',
            type: 'yes_no',
            required: false,
            visibleWhen: { field: 'dsmb_required', operator: 'eq', value: true },
          },
        ],
        issueChecks: [
          {
            id: 'dsmb_required_phase3_check',
            condition: { field: 'dsmb_required', operator: 'eq', value: false },
            severity: 'critical',
            title: 'DSMB Required',
            message:
              'Phase 3+ trials typically require a Data Safety Monitoring Board per FDA guidance.',
            reference:
              'FDA Guidance: Establishment and Operation of Clinical Trial Data Monitoring Committees (2006)',
          },
        ],
        defaultNext: 'regulatory_path',
      },

      /* ── Regulatory Strategy ────────────────────────────────────────── */

      {
        id: 'regulatory_path',
        section: 'Regulatory Strategy',
        question:
          'What regulatory pathway and target regions are you planning for this program?',
        guidance:
          'Consider whether the study design will support submissions to multiple agencies simultaneously. ICH guidelines are accepted across FDA, EMA, and PMDA, but each agency may have specific requirements. Early interaction with agencies (Pre-IND meetings, Scientific Advice) is recommended per ICH E8(R1).',
        fields: [
          {
            id: 'regulatory_pathway',
            label: 'Regulatory Pathway',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'standard', label: 'Standard' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'breakthrough_therapy', label: 'Breakthrough Therapy' },
              { value: 'fast_track', label: 'Fast Track' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'orphan_drug', label: 'Orphan Drug' },
              { value: 'rmat', label: 'RMAT (Regenerative Medicine Advanced Therapy)' },
            ],
          },
          {
            id: 'target_regions',
            label: 'Target Regions',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'us_fda', label: 'US FDA' },
              { value: 'eu_ema', label: 'EU EMA' },
              { value: 'uk_mhra', label: 'UK MHRA' },
              { value: 'japan_pmda', label: 'Japan PMDA' },
              { value: 'china_nmpa', label: 'China NMPA' },
              { value: 'health_canada', label: 'Health Canada' },
            ],
          },
          {
            id: 'planned_pre_ind_meeting',
            label: 'Planned Pre-IND Meeting',
            type: 'yes_no',
            required: false,
          },
        ],
        defaultNext: 'review_summary',
      },

      {
        id: 'review_summary',
        section: 'Regulatory Strategy',
        question:
          'Are there any additional notes, key risks, or concerns you would like to capture for the protocol?',
        guidance:
          'This is an opportunity to flag any residual risks, outstanding questions, or strategic considerations that should be addressed during protocol finalization.',
        fields: [
          {
            id: 'additional_notes',
            label: 'Additional Notes',
            type: 'textarea',
            required: false,
          },
          {
            id: 'key_risks_or_concerns',
            label: 'Key Risks or Concerns',
            type: 'textarea',
            required: false,
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
