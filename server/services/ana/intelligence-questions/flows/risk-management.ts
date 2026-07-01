/**
 * Risk Management Plan flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through a comprehensive risk management questionnaire
 * covering hazard identification, risk analysis, risk evaluation, risk
 * control, residual risk assessment, production & post-production
 * monitoring, and risk management review per ISO 14971:2019 (devices)
 * and ICH Q9 (pharmaceuticals).
 *
 * @module server/services/ana/intelligence-questions/flows/risk-management
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createRiskManagementFlow(): FlowDefinition {
  return {
    id: 'risk-management-v1',
    category: 'risk_management',
    name: 'Risk Management Plan',
    description:
      'Risk management questionnaire covering hazard identification, risk analysis, risk evaluation, risk control, and residual risk assessment per ISO 14971:2019 (devices) and ICH Q9 (pharmaceuticals).',
    clientTypes: [],
    entryNode: 'rm_overview',
    estimatedMinutes: 35,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'rm_overview_section',
        label: 'Risk Management Overview',
        nodeIds: ['rm_overview', 'rm_plan_scope'],
      },
      {
        id: 'hazard_identification_section',
        label: 'Hazard Identification',
        nodeIds: ['hazard_identification_device', 'hazard_identification_pharma', 'hazard_identification_common'],
      },
      {
        id: 'risk_analysis_section',
        label: 'Risk Analysis',
        nodeIds: ['risk_estimation', 'risk_matrix_definition'],
      },
      {
        id: 'risk_evaluation_section',
        label: 'Risk Evaluation',
        nodeIds: ['individual_risk_eval', 'overall_risk_eval'],
      },
      {
        id: 'risk_control_section',
        label: 'Risk Control',
        nodeIds: ['risk_control_measures', 'risk_control_verification', 'residual_risk_assessment'],
      },
      {
        id: 'production_postproduction_section',
        label: 'Production & Post-Production',
        nodeIds: ['production_monitoring', 'post_production_info', 'capa_integration'],
      },
      {
        id: 'rm_review_section',
        label: 'Risk Management Review',
        nodeIds: ['rm_report', 'rm_file_review', 'management_approval'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── 1. Risk Management Overview ─────────────────────────────── */

      {
        id: 'rm_overview',
        section: 'Risk Management Overview',
        question:
          'Let\'s begin the risk management plan. What type of product is this, and who is leading the risk management activities?',
        guidance:
          'ISO 14971:2019 clause 4.1 requires top management to ensure a risk management process is established. ICH Q9 Section 1 defines risk management as a systematic process for the assessment, control, communication, and review of risks to quality. The applicable standard depends on product type: ISO 14971:2019 for medical devices and IVDs, ICH Q9 for pharmaceuticals, and both for combination products.',
        fields: [
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'pharmaceutical', label: 'Pharmaceutical' },
              { value: 'combination_product', label: 'Combination Product' },
              { value: 'IVD', label: 'In Vitro Diagnostic (IVD)' },
            ],
          },
          {
            id: 'product_name',
            label: 'Product Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. CardioStim Pulse Generator',
          },
          {
            id: 'applicable_standard',
            label: 'Applicable Risk Management Standard',
            type: 'select',
            required: true,
            options: [
              { value: 'iso_14971', label: 'ISO 14971:2019 — Application of Risk Management to Medical Devices' },
              { value: 'ich_q9', label: 'ICH Q9 — Quality Risk Management' },
              { value: 'both', label: 'Both ISO 14971:2019 and ICH Q9' },
            ],
          },
          {
            id: 'rm_plan_established',
            label: 'Has a risk management plan been established?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 4.4, a risk management plan shall be established for each medical device',
          },
          {
            id: 'rm_team_lead',
            label: 'Risk Management Team Lead',
            type: 'text',
            required: true,
            placeholder: 'Name and title of the responsible individual',
          },
          {
            id: 'team_composition',
            label: 'Team Composition Description',
            type: 'textarea',
            required: true,
            helpText: 'Describe the cross-functional team members including their roles and expertise (e.g., engineering, clinical, quality, regulatory)',
            validation: { minLength: 20 },
          },
        ],
        branches: [
          {
            when: { field: 'product_type', operator: 'eq', value: 'medical_device' },
            goto: 'rm_plan_scope',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'IVD' },
            goto: 'rm_plan_scope',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'pharmaceutical' },
            goto: 'rm_plan_scope',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'combination_product' },
            goto: 'rm_plan_scope',
          },
        ],
        defaultNext: 'rm_plan_scope',
      },

      {
        id: 'rm_plan_scope',
        section: 'Risk Management Overview',
        question:
          'Define the scope and risk acceptability approach for this risk management plan.',
        guidance:
          'ISO 14971:2019 clause 4.4 requires the risk management plan to include the scope, assignment of responsibilities, criteria for risk acceptability, verification activities, and activities for collection and review of production and post-production information. ICH Q9 Section 4 emphasizes that the level of effort, formality, and documentation should be commensurate with the level of risk.',
        fields: [
          {
            id: 'rm_plan_scope_description',
            label: 'Risk Management Plan Scope',
            type: 'textarea',
            required: true,
            helpText: 'Describe the scope of the risk management plan including product boundaries, lifecycle phases covered, and exclusions',
            validation: { minLength: 30 },
          },
          {
            id: 'lifecycle_stage',
            label: 'Product Lifecycle Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'design', label: 'Design' },
              { value: 'development', label: 'Development' },
              { value: 'production', label: 'Production' },
              { value: 'post_production', label: 'Post-Production' },
            ],
          },
          {
            id: 'risk_acceptability_approach',
            label: 'Risk Acceptability Criteria Approach',
            type: 'select',
            required: true,
            options: [
              {
                value: 'ALARP',
                label: 'ALARP (As Low As Reasonably Practicable)',
                description: 'Risks reduced to a level as low as reasonably practicable, commonly used in ISO 14971',
              },
              {
                value: 'risk_matrix',
                label: 'Risk Matrix',
                description: 'Probability x severity matrix with defined acceptability regions',
              },
              {
                value: 'risk_benefit',
                label: 'Risk-Benefit Analysis',
                description: 'Risks weighed against expected clinical benefits',
              },
            ],
          },
          {
            id: 'risk_matrix_defined',
            label: 'Has a risk acceptability matrix been defined?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 4.4 (c), the risk management plan shall include criteria for risk acceptability based on the manufacturer\'s policy',
          },
          {
            id: 'intended_use_statement',
            label: 'Intended Use / Intended Purpose Statement',
            type: 'textarea',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 5.2, the manufacturer shall document the intended use and reasonably foreseeable misuse of the medical device',
            validation: { minLength: 20 },
          },
        ],
        issueChecks: [
          {
            id: 'no_risk_acceptability_criteria',
            condition: { field: 'risk_matrix_defined', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Risk Acceptability Criteria Defined',
            message:
              'ISO 14971:2019 clause 4.4 (c) requires the risk management plan to include criteria for risk acceptability. Without defined acceptability criteria, risk evaluation cannot be performed consistently. This is a mandatory element of the risk management plan.',
            reference: 'ISO 14971:2019, Clause 4.4 (c)',
          },
        ],
        branches: [
          {
            when: { field: 'product_type', operator: 'in', value: ['medical_device', 'IVD'] },
            goto: 'hazard_identification_device',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'pharmaceutical' },
            goto: 'hazard_identification_pharma',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'combination_product' },
            goto: 'hazard_identification_device',
          },
        ],
        defaultNext: 'hazard_identification_device',
        provideExpertFeedback: true,
      },

      /* ── 2. Hazard Identification ────────────────────────────────── */

      {
        id: 'hazard_identification_device',
        section: 'Hazard Identification',
        question:
          'Describe the hazard identification process for this device. Which methods were used and what hazard categories were identified?',
        guidance:
          'ISO 14971:2019 clause 5.4 requires systematic identification of hazards in both normal and fault conditions. IEC 62366-1 use error analysis should be included for devices with a user interface. FMEA per IEC 60812 and FTA per IEC 61025 are the most commonly used analytical methods. Annex C of ISO 14971:2019 provides example hazards and hazardous situations to consider.',
        fields: [
          {
            id: 'hazard_methods',
            label: 'Hazard Identification Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'fmea', label: 'FMEA (Failure Mode and Effects Analysis)' },
              { value: 'fta', label: 'FTA (Fault Tree Analysis)' },
              { value: 'hazop', label: 'HAZOP (Hazard and Operability Study)' },
              { value: 'pha', label: 'PHA (Preliminary Hazard Analysis)' },
              { value: 'drbfm', label: 'DRBFM (Design Review Based on Failure Mode)' },
              { value: 'use_error_analysis', label: 'Use Error Analysis (per IEC 62366-1)' },
            ],
          },
          {
            id: 'number_hazards_identified',
            label: 'Number of Hazards Identified',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'top_hazard_categories',
            label: 'Top Hazard Categories Identified',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'energy', label: 'Energy Hazards (electrical, thermal, mechanical, radiation)' },
              { value: 'biological', label: 'Biological Hazards (biocompatibility, infection, bioburden)' },
              { value: 'chemical', label: 'Chemical Hazards (residues, degradation products, leachables)' },
              { value: 'operational', label: 'Operational Hazards (use errors, maintenance, deployment)' },
              { value: 'information', label: 'Information Hazards (labeling, instructions, warnings)' },
            ],
            helpText: 'Per ISO 14971:2019 Annex C — examples of hazards and contributing factors',
          },
          {
            id: 'foreseeable_misuse_described',
            label: 'Have foreseeable misuse scenarios been described?',
            type: 'yes_no',
            required: true,
            helpText: 'ISO 14971:2019 clause 5.2 requires consideration of reasonably foreseeable misuse',
          },
          {
            id: 'use_environment_considerations',
            label: 'Use Environment Considerations',
            type: 'textarea',
            required: true,
            helpText: 'Describe environmental factors that could contribute to hazardous situations (e.g., EMI, temperature, humidity, lighting)',
            validation: { minLength: 15 },
          },
          {
            id: 'patient_population_vulnerabilities',
            label: 'Have patient population vulnerabilities been described?',
            type: 'textarea',
            required: true,
            helpText: 'Consider pediatric, geriatric, immunocompromised, or other vulnerable populations per ISO 14971:2019 clause 5.2',
            validation: { minLength: 15 },
          },
        ],
        issueChecks: [
          {
            id: 'no_fmea_device',
            condition: { field: 'hazard_methods', operator: 'not_in', value: ['fmea'] },
            severity: 'warning',
            title: 'FMEA Not Included in Hazard Identification',
            message:
              'FMEA is the most widely expected hazard analysis method for medical devices. While ISO 14971:2019 does not mandate a specific method, regulatory reviewers (FDA, Notified Bodies) routinely expect FMEA as a primary risk analysis technique. Consider including FMEA or documenting the rationale for using alternative methods.',
            reference: 'ISO 14971:2019, Clause 5.4; IEC 60812',
          },
        ],
        defaultNext: 'hazard_identification_common',
      },

      {
        id: 'hazard_identification_pharma',
        section: 'Hazard Identification',
        question:
          'Describe the hazard identification process for this pharmaceutical product. Which quality risk management methods were used?',
        guidance:
          'ICH Q9 Section 5 outlines risk management tools applicable to pharmaceutical operations. FMEA, HACCP, and Fishbone diagrams are commonly used for manufacturing process risks. ICH Q9 Annex I provides a detailed overview of risk management methods. The distinction between patient safety hazards and product quality hazards should be clearly documented.',
        fields: [
          {
            id: 'pharma_hazard_methods',
            label: 'Hazard Identification Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'fmea', label: 'FMEA (Failure Mode and Effects Analysis)' },
              { value: 'haccp', label: 'HACCP (Hazard Analysis and Critical Control Points)' },
              { value: 'pha', label: 'PHA (Preliminary Hazard Analysis)' },
              { value: 'fishbone_diagram', label: 'Fishbone (Ishikawa) Diagram' },
              { value: 'what_if_analysis', label: 'What-If Analysis' },
            ],
            helpText: 'Per ICH Q9 Annex I — overview of risk management methods',
          },
          {
            id: 'quality_risk_areas',
            label: 'Quality Risk Areas Identified',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'supply_chain', label: 'Supply Chain' },
              { value: 'manufacturing', label: 'Manufacturing Process' },
              { value: 'distribution', label: 'Distribution and Storage' },
              { value: 'clinical', label: 'Clinical / Patient Safety' },
            ],
          },
          {
            id: 'critical_quality_attributes',
            label: 'Critical Quality Attributes (CQAs) at Risk',
            type: 'textarea',
            required: true,
            helpText: 'Per ICH Q8, identify CQAs that could be impacted by identified hazards (e.g., potency, purity, dissolution, sterility)',
            validation: { minLength: 15 },
          },
          {
            id: 'process_parameters_affecting_cqas',
            label: 'Process Parameters Affecting CQAs',
            type: 'textarea',
            required: true,
            helpText: 'Describe critical process parameters (CPPs) linked to CQAs per ICH Q8/Q9/Q10 framework',
            validation: { minLength: 15 },
          },
          {
            id: 'patient_safety_vs_quality_hazards',
            label: 'Patient Safety Hazards vs Product Quality Hazards',
            type: 'textarea',
            required: true,
            helpText: 'ICH Q9 Section 1 distinguishes risks to the patient from risks to product quality; document both categories',
            validation: { minLength: 15 },
          },
        ],
        defaultNext: 'hazard_identification_common',
      },

      {
        id: 'hazard_identification_common',
        section: 'Hazard Identification',
        question:
          'Summarize the identified hazards, hazardous situations, and potential harms.',
        guidance:
          'ISO 14971:2019 clause 5.5 requires identification of hazardous situations arising from each hazard. The sequence of events leading from a hazard through a hazardous situation to harm must be documented. Literature review and field experience data should be used to support hazard identification completeness per ISO 14971:2019 clause 5.4.',
        fields: [
          {
            id: 'identified_hazards_summary',
            label: 'Identified Hazards Summary',
            type: 'textarea',
            required: true,
            helpText: 'Provide a summary of all identified hazards organized by category',
            validation: { minLength: 30 },
          },
          {
            id: 'hazardous_situations',
            label: 'Hazardous Situations Derived from Hazards',
            type: 'textarea',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 5.5, describe the hazardous situations that can arise from each hazard, including combinations of hazards',
            validation: { minLength: 30 },
          },
          {
            id: 'harm_descriptions',
            label: 'Harm Descriptions for Each Hazardous Situation',
            type: 'textarea',
            required: true,
            helpText: 'Document the potential harms that could result from each hazardous situation, including severity estimates',
            validation: { minLength: 30 },
          },
          {
            id: 'sequence_of_events_analysis',
            label: 'Sequence of Events Analysis',
            type: 'textarea',
            required: true,
            helpText: 'Describe the foreseeable sequence of events from hazard → hazardous situation → harm per ISO 14971:2019 Figure 1',
            validation: { minLength: 20 },
          },
          {
            id: 'literature_field_data_used',
            label: 'Was published literature or field data used for hazard identification?',
            type: 'yes_no',
            required: true,
            helpText: 'ISO 14971:2019 clause 5.4 recommends use of available data including predicate device experience, complaint databases, and published literature',
          },
        ],
        defaultNext: 'risk_estimation',
        provideExpertFeedback: true,
      },

      /* ── 3. Risk Analysis ────────────────────────────────────────── */

      {
        id: 'risk_estimation',
        section: 'Risk Analysis',
        question:
          'Describe the risk estimation methodology and how probability and severity of harm are determined.',
        guidance:
          'ISO 14971:2019 clause 5.5 requires estimation of risk(s) for each identified hazardous situation using the probability of occurrence of harm and the severity of that harm. ICH Q9 Section 4.2 similarly requires risk estimation as part of risk assessment. The estimation may be qualitative, semi-quantitative, or quantitative depending on available data and the nature of the risk.',
        fields: [
          {
            id: 'estimation_methodology',
            label: 'Risk Estimation Methodology',
            type: 'select',
            required: true,
            options: [
              { value: 'qualitative', label: 'Qualitative (descriptive categories)' },
              { value: 'semi_quantitative', label: 'Semi-Quantitative (ordinal scales / RPN)' },
              { value: 'quantitative', label: 'Quantitative (probabilistic / numerical)' },
            ],
          },
          {
            id: 'probability_basis',
            label: 'Probability Estimation Basis',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'field_data', label: 'Field Data / Post-Market Experience' },
              { value: 'literature', label: 'Published Literature' },
              { value: 'expert_judgment', label: 'Expert Judgment' },
              { value: 'testing', label: 'Testing / Experimental Data' },
            ],
          },
          {
            id: 'probability_categories',
            label: 'Number of Probability Categories Defined',
            type: 'number',
            required: true,
            helpText: 'Typically 4-6 levels (e.g., Incredible, Remote, Occasional, Probable, Frequent)',
            validation: { min: 2, max: 10 },
          },
          {
            id: 'severity_categories',
            label: 'Number of Severity Categories Defined',
            type: 'number',
            required: true,
            helpText: 'Typically 4-5 levels (e.g., Negligible, Minor, Serious, Critical, Catastrophic)',
            validation: { min: 2, max: 10 },
          },
          {
            id: 'rpn_used',
            label: 'Is a Risk Priority Number (RPN) used?',
            type: 'yes_no',
            visibleWhen: { field: 'estimation_methodology', operator: 'in', value: ['semi_quantitative', 'quantitative'] },
            helpText: 'RPN = Severity x Occurrence x Detection; commonly used in FMEA but not required by ISO 14971',
          },
          {
            id: 'systematic_random_failure',
            label: 'Has analysis distinguished between systematic and random failures?',
            type: 'yes_no',
            visibleWhen: { field: 'product_type', operator: 'in', value: ['medical_device', 'IVD'] },
            helpText: 'ISO 14971:2019 clause 5.5 Note 3 — probability estimation should consider both systematic and random failure modes',
          },
        ],
        defaultNext: 'risk_matrix_definition',
      },

      {
        id: 'risk_matrix_definition',
        section: 'Risk Analysis',
        question:
          'Define the risk matrix structure and acceptability regions.',
        guidance:
          'ISO 14971:2019 clause 4.4 (c) requires criteria for risk acceptability to be defined in the risk management plan. The risk matrix should clearly delineate acceptable, ALARP (as low as reasonably practicable), and unacceptable risk regions. ISO/TR 24971:2020 provides guidance on risk matrix design and common pitfalls.',
        fields: [
          {
            id: 'risk_matrix_dimensions',
            label: 'Risk Matrix Dimensions',
            type: 'text',
            required: true,
            placeholder: 'e.g. 5x5 (5 probability levels x 5 severity levels)',
          },
          {
            id: 'num_probability_levels',
            label: 'Number of Probability Levels',
            type: 'number',
            required: true,
            validation: { min: 2, max: 10 },
          },
          {
            id: 'num_severity_levels',
            label: 'Number of Severity Levels',
            type: 'number',
            required: true,
            validation: { min: 2, max: 10 },
          },
          {
            id: 'acceptable_region_defined',
            label: 'Acceptable Risk Region Defined',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'alarp_region_defined',
            label: 'ALARP (As Low As Reasonably Practicable) Region Defined',
            type: 'yes_no',
            helpText: 'Per ISO 14971:2019 clause 7.4, risks in the ALARP region require further risk-benefit analysis',
          },
          {
            id: 'unacceptable_region_defined',
            label: 'Unacceptable Risk Region Defined',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'risk_matrix_described',
            label: 'Has the risk matrix been uploaded or documented?',
            type: 'yes_no',
            required: true,
            helpText: 'The risk matrix with all regions should be documented in the risk management plan',
          },
          {
            id: 'detectability_included',
            label: 'Is detectability included (for RPN calculation)?',
            type: 'yes_no',
            helpText: 'Detectability is used in FMEA-style RPN calculations but is not part of ISO 14971 risk estimation',
          },
        ],
        issueChecks: [
          {
            id: 'risk_matrix_not_documented',
            condition: { field: 'risk_matrix_described', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Risk Matrix Not Documented',
            message:
              'The risk evaluation matrix is a fundamental element of the risk management plan. Without a documented risk matrix, risk evaluation decisions cannot be consistently applied across the product lifecycle. ISO 14971:2019 clause 4.4 (c) requires documented criteria for risk acceptability.',
            reference: 'ISO 14971:2019, Clause 4.4 (c); ISO/TR 24971:2020, Clause 5.4',
          },
        ],
        defaultNext: 'individual_risk_eval',
      },

      /* ── 4. Risk Evaluation ──────────────────────────────────────── */

      {
        id: 'individual_risk_eval',
        section: 'Risk Evaluation',
        question:
          'Summarize the results of individual risk evaluation. How many risks fall into each acceptability region?',
        guidance:
          'ISO 14971:2019 clause 5.5 requires each risk to be evaluated against the established acceptability criteria. Risks in the unacceptable region must be reduced through risk control measures. ISO 14971:2019 clause 5.4 requires comparison with the state of the art when determining risk acceptability.',
        fields: [
          {
            id: 'total_risks_evaluated',
            label: 'Total Number of Risks Evaluated',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'risks_in_acceptable_region',
            label: 'Risks in Acceptable Region',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'risks_in_alarp_region',
            label: 'Risks in ALARP Region',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'risks_in_unacceptable_region',
            label: 'Risks in Unacceptable Region',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'risk_benefit_analysis_required',
            label: 'Is individual risk-benefit analysis required for any risks?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 7.4, risk-benefit analysis is required when residual risk exceeds acceptability criteria after all practicable risk controls',
          },
          {
            id: 'state_of_art_comparison',
            label: 'Has comparison with the state of the art been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'ISO 14971:2019 clause 5.4 — risk acceptability should consider the generally acknowledged state of the art',
          },
        ],
        issueChecks: [
          {
            id: 'risk_benefit_required_not_done',
            condition: { field: 'risk_benefit_analysis_required', operator: 'eq', value: true },
            severity: 'warning',
            title: 'Individual Risk-Benefit Analysis Required',
            message:
              'When individual risks exceed the acceptability criteria and cannot be further reduced, ISO 14971:2019 clause 7.4 requires a risk-benefit analysis. Ensure that each risk requiring risk-benefit analysis is documented with the clinical benefits that outweigh the residual risk.',
            reference: 'ISO 14971:2019, Clause 7.4',
          },
        ],
        defaultNext: 'overall_risk_eval',
      },

      {
        id: 'overall_risk_eval',
        section: 'Risk Evaluation',
        question:
          'Assess the overall residual risk for the product.',
        guidance:
          'ISO 14971:2019 clause 8 requires evaluation of the overall residual risk taking into account contributions from all individual residual risks. If the overall residual risk is not judged acceptable, a benefit-risk analysis shall determine if the medical benefits outweigh the overall residual risk. ICH Q9 Section 4.3 similarly requires overall risk evaluation.',
        fields: [
          {
            id: 'overall_residual_risk_method',
            label: 'Overall Residual Risk Evaluation Method',
            type: 'select',
            required: true,
            options: [
              { value: 'qualitative_review', label: 'Qualitative Review by Expert Panel' },
              { value: 'aggregate_analysis', label: 'Aggregate Risk Analysis / Risk Index' },
              { value: 'fault_tree', label: 'Fault Tree / Event Tree Analysis' },
              { value: 'clinical_evidence', label: 'Clinical Evidence Review' },
              { value: 'combined', label: 'Combined Methods' },
            ],
          },
          {
            id: 'overall_risk_acceptable',
            label: 'Is the overall residual risk acceptable?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 8 — the overall residual risk must be evaluated and judged acceptable',
          },
          {
            id: 'overall_benefit_risk_analysis',
            label: 'Has a benefit-risk analysis been performed for the overall residual risk?',
            type: 'yes_no',
            required: true,
            helpText: 'ISO 14971:2019 clause 8 — required when overall residual risk is not initially judged acceptable',
          },
          {
            id: 'benefit_risk_summary',
            label: 'Benefit-Risk Analysis Summary',
            type: 'textarea',
            visibleWhen: { field: 'overall_benefit_risk_analysis', operator: 'eq', value: true },
            helpText: 'Summarize the medical benefits that outweigh the overall residual risk',
            validation: { minLength: 20 },
          },
          {
            id: 'risk_communication_plan',
            label: 'Risk Communication Plan',
            type: 'textarea',
            required: true,
            helpText: 'Per ICH Q9 Section 4.4 and ISO 14971:2019 clause 9, describe how risk information is communicated to stakeholders',
            validation: { minLength: 15 },
          },
        ],
        issueChecks: [
          {
            id: 'overall_risk_not_acceptable',
            condition: { field: 'overall_risk_acceptable', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Overall Residual Risk Not Acceptable',
            message:
              'ISO 14971:2019 clause 8 requires that the overall residual risk be judged acceptable. If the overall residual risk is not acceptable, a benefit-risk analysis must demonstrate that the medical benefits outweigh the residual risk. Without acceptable overall risk or a favorable benefit-risk determination, the product cannot proceed to market.',
            reference: 'ISO 14971:2019, Clause 8',
          },
        ],
        defaultNext: 'risk_control_measures',
        provideExpertFeedback: true,
      },

      /* ── 5. Risk Control ─────────────────────────────────────────── */

      {
        id: 'risk_control_measures',
        section: 'Risk Control',
        question:
          'Describe the risk control measures implemented. What priority order was followed?',
        guidance:
          'ISO 14971:2019 clause 7.1 specifies the priority order for risk control options: (a) inherent safety by design, (b) protective measures in the medical device itself or in the manufacturing process, and (c) information for safety. Risk control measures shall be implemented and each measure shall be verified. New hazards or hazardous situations introduced by risk controls must be identified and analyzed.',
        fields: [
          {
            id: 'risk_control_priority',
            label: 'Risk Control Option Priority Applied',
            type: 'multi_select',
            required: true,
            options: [
              {
                value: 'inherent_safety_by_design',
                label: '(a) Inherent Safety by Design',
                description: 'Eliminate hazards or reduce associated risks by design choices',
              },
              {
                value: 'protective_measures',
                label: '(b) Protective Measures',
                description: 'Guards, barriers, alarms, interlocks in the device or manufacturing process',
              },
              {
                value: 'information_for_safety',
                label: '(c) Information for Safety',
                description: 'Labeling, instructions for use, training materials, warnings',
              },
            ],
            helpText: 'Per ISO 14971:2019 clause 7.1, these options shall be used in the priority order listed',
          },
          {
            id: 'num_risk_controls',
            label: 'Number of Risk Control Measures Implemented',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'design_changes',
            label: 'Design Changes for Inherent Safety',
            type: 'textarea',
            helpText: 'Describe design modifications made to eliminate hazards or reduce risks at the source',
          },
          {
            id: 'protective_measures_added',
            label: 'Protective Measures Added',
            type: 'textarea',
            helpText: 'Describe protective measures such as guards, barriers, alarms, interlocks, or process controls',
          },
          {
            id: 'information_for_safety_measures',
            label: 'Information for Safety (Labeling, Training, IFU)',
            type: 'textarea',
            helpText: 'Describe safety information provided through labeling, training materials, and instructions for use',
          },
          {
            id: 'new_hazards_from_controls',
            label: 'Have new hazards been introduced by risk control measures?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 7.3, the risk management process shall determine whether new hazards or hazardous situations are introduced by each risk control measure',
          },
        ],
        issueChecks: [
          {
            id: 'new_hazards_introduced',
            condition: { field: 'new_hazards_from_controls', operator: 'eq', value: true },
            severity: 'warning',
            title: 'New Hazards Introduced by Risk Control Measures',
            message:
              'ISO 14971:2019 clause 7.3 requires that when risk control measures introduce new hazards or hazardous situations, the associated risks shall be estimated and evaluated. Ensure all newly introduced hazards have been analyzed and added to the risk management file with their own risk controls.',
            reference: 'ISO 14971:2019, Clause 7.3',
          },
        ],
        defaultNext: 'risk_control_verification',
      },

      {
        id: 'risk_control_verification',
        section: 'Risk Control',
        question:
          'Describe the verification of risk control measure implementation and effectiveness.',
        guidance:
          'ISO 14971:2019 clause 7.2 requires verification that risk control measures have been implemented as planned and are effective. This includes both implementation verification (was the control put in place?) and effectiveness verification (does the control actually reduce risk?). Traceability from hazard to control to verification should be maintained.',
        fields: [
          {
            id: 'verification_completed',
            label: 'Has risk control verification been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 7.2, each risk control measure shall be verified',
          },
          {
            id: 'verification_method',
            label: 'Verification Method',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'testing', label: 'Testing (bench, simulated use, clinical)' },
              { value: 'inspection', label: 'Inspection / Review' },
              { value: 'analysis', label: 'Analysis (analytical models, FMEA re-evaluation)' },
            ],
          },
          {
            id: 'effectiveness_confirmed',
            label: 'Risk control effectiveness confirmed?',
            type: 'yes_no',
            required: true,
            helpText: 'Has objective evidence demonstrated that the risk controls reduce risk as intended?',
          },
          {
            id: 'traceability_matrix_available',
            label: 'Is a traceability matrix (risk → control → verification) available?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 4.4 (d), verification activities for risk control measures shall be planned',
          },
          {
            id: 'implementation_verification_completed',
            label: 'Implementation verification completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Confirm that each risk control measure has been correctly implemented in the design, manufacturing process, or labeling',
          },
        ],
        issueChecks: [
          {
            id: 'risk_controls_not_verified',
            condition: { field: 'verification_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Risk Control Measures Not Verified',
            message:
              'ISO 14971:2019 clause 7.2 requires verification that each risk control measure has been implemented and is effective. Unverified risk controls cannot be relied upon to reduce risk. This is a mandatory element that must be completed before the risk management report can be finalized.',
            reference: 'ISO 14971:2019, Clause 7.2',
          },
        ],
        defaultNext: 'residual_risk_assessment',
      },

      {
        id: 'residual_risk_assessment',
        section: 'Risk Control',
        question:
          'Assess the residual risks remaining after implementation of all risk control measures.',
        guidance:
          'ISO 14971:2019 clause 7.4 requires evaluation of residual risk after risk control measures have been applied. Each residual risk shall be evaluated against the risk acceptability criteria. If any residual risk or the overall residual risk is not judged acceptable, a risk-benefit analysis shall be performed. Residual risks that remain must be disclosed through appropriate labeling per ISO 14971:2019 clause 7.4.',
        fields: [
          {
            id: 'all_residual_risks_identified',
            label: 'Have all residual risks been identified?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'residual_risks_within_limits',
            label: 'Are all residual risks within acceptable limits?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 7.4 — each residual risk must meet the acceptability criteria',
          },
          {
            id: 'residual_risk_benefit_analysis',
            label: 'Has a residual risk-benefit analysis been conducted?',
            type: 'yes_no',
            required: true,
            helpText: 'Required per ISO 14971:2019 clause 7.4 when residual risks exceed the acceptability criteria',
          },
          {
            id: 'residual_risks_in_labeling',
            label: 'Have residual risks been disclosed in product labeling?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 7.4 Note 2 — information for safety about significant residual risks should be included in the accompanying documentation',
          },
          {
            id: 'cumulative_residual_risk_acceptable',
            label: 'Is the cumulative residual risk acceptable?',
            type: 'yes_no',
            required: true,
            helpText: 'The aggregate effect of all individual residual risks must be considered per ISO 14971:2019 clause 8',
          },
        ],
        issueChecks: [
          {
            id: 'residual_risks_not_identified',
            condition: { field: 'all_residual_risks_identified', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Residual Risks Not Fully Identified',
            message:
              'ISO 14971:2019 clause 7.4 requires that residual risk associated with each hazardous situation be evaluated. Incomplete identification of residual risks means the risk management file is not complete and the overall residual risk evaluation (clause 8) cannot be reliably performed.',
            reference: 'ISO 14971:2019, Clause 7.4',
          },
        ],
        defaultNext: 'production_monitoring',
        provideExpertFeedback: true,
      },

      /* ── 6. Production & Post-Production ─────────────────────────── */

      {
        id: 'production_monitoring',
        section: 'Production & Post-Production',
        question:
          'Describe the production risk monitoring plan and trending activities.',
        guidance:
          'ISO 14971:2019 clause 9 requires the manufacturer to establish, document, implement, and maintain a system for collecting and reviewing production and post-production information. ICH Q9 Section 4.4 emphasizes continuous review and monitoring of risk management outputs throughout the product lifecycle.',
        fields: [
          {
            id: 'production_monitoring_plan',
            label: 'Has a production risk monitoring plan been established?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 9, a process for collecting and reviewing production information relevant to safety shall be established',
          },
          {
            id: 'process_monitoring_parameters',
            label: 'Process Monitoring Parameters',
            type: 'textarea',
            required: true,
            helpText: 'Identify key process parameters monitored for risk-related deviations (e.g., dimensional checks, functional tests, environmental monitoring)',
            validation: { minLength: 15 },
          },
          {
            id: 'trend_analysis_performed',
            label: 'Is trend analysis performed?',
            type: 'yes_no',
            required: true,
            helpText: 'Systematic trending of non-conformances, deviations, and quality data to detect emerging risk signals',
          },
          {
            id: 'risk_based_sampling',
            label: 'Risk-Based Sampling Plan',
            type: 'textarea',
            helpText: 'Describe how risk levels inform inspection and testing sample sizes during production',
          },
          {
            id: 'production_nonconformance_tracking',
            label: 'Production Non-Conformance Tracking',
            type: 'textarea',
            required: true,
            helpText: 'Describe the system for tracking and evaluating production non-conformances for risk management impact',
            validation: { minLength: 15 },
          },
        ],
        issueChecks: [
          {
            id: 'no_production_monitoring',
            condition: { field: 'production_monitoring_plan', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Production Risk Monitoring Plan',
            message:
              'ISO 14971:2019 clause 9 requires a system for collecting and reviewing production and post-production information relevant to the safety of the medical device. The absence of production monitoring could result in undetected emerging risks during manufacturing.',
            reference: 'ISO 14971:2019, Clause 9',
          },
        ],
        defaultNext: 'post_production_info',
      },

      {
        id: 'post_production_info',
        section: 'Production & Post-Production',
        question:
          'Describe the post-production information collection and review process.',
        guidance:
          'ISO 14971:2019 clause 9 requires systematic collection and review of post-production information including complaints, vigilance reports, recalls, and literature. For devices, 21 CFR 803 (Medical Device Reporting) defines mandatory adverse event reporting. For pharmaceuticals, ICH E2 series defines pharmacovigilance reporting requirements.',
        fields: [
          {
            id: 'post_production_sources',
            label: 'Post-Production Information Sources',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'complaints', label: 'Customer Complaints' },
              { value: 'vigilance', label: 'Vigilance / Adverse Event Reports' },
              { value: 'literature', label: 'Published Literature Monitoring' },
              { value: 'recalls', label: 'Recall and Field Safety Corrective Action Data' },
            ],
          },
          {
            id: 'complaint_analysis_integration',
            label: 'Is complaint analysis integrated with risk management?',
            type: 'yes_no',
            required: true,
            helpText: 'Complaints should be evaluated for risk management impact per ISO 14971:2019 clause 9',
          },
          {
            id: 'signal_detection_methodology',
            label: 'Signal Detection Methodology',
            type: 'textarea',
            required: true,
            helpText: 'Describe the methods used to detect safety signals from post-production data (e.g., statistical trending, threshold-based alerts)',
            validation: { minLength: 15 },
          },
          {
            id: 'fsca_threshold',
            label: 'Field Safety Corrective Action (FSCA) Threshold',
            type: 'textarea',
            required: true,
            helpText: 'Define criteria that would trigger a field safety corrective action or product recall',
            validation: { minLength: 15 },
          },
          {
            id: 'regulatory_reporting_met',
            label: 'Are regulatory reporting requirements met?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 803 for devices (MDR) or ICH E2 series for pharmaceuticals (ICSR, PSUR/PBRER)',
          },
        ],
        defaultNext: 'capa_integration',
      },

      {
        id: 'capa_integration',
        section: 'Production & Post-Production',
        question:
          'Describe how CAPA (Corrective and Preventive Action) integrates with risk management activities.',
        guidance:
          'ISO 14971:2019 clause 9 requires that post-production information be evaluated for relevance to safety and that the risk management file be updated accordingly. The CAPA system (per ISO 13485 clause 8.5.2/8.5.3 for devices, or ICH Q10 Section 3 for pharmaceuticals) should be tightly integrated with risk management to ensure that new risks trigger reassessment and that risk controls are updated.',
        fields: [
          {
            id: 'capa_integrated',
            label: 'Is the CAPA system integrated with risk management?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 13485:2016 clause 8.5.2 — corrective actions should include risk management updates',
          },
          {
            id: 'risk_reassessment_triggers',
            label: 'Are risk reassessment triggers defined?',
            type: 'yes_no',
            required: true,
            helpText: 'Define events that trigger a re-evaluation of the risk management file (e.g., design changes, new complaint trends, regulatory changes)',
          },
          {
            id: 'rm_file_update_frequency',
            label: 'Risk Management File Update Frequency',
            type: 'select',
            required: true,
            options: [
              { value: 'event_driven', label: 'Event-Driven (upon triggers)' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'semi_annual', label: 'Semi-Annual' },
              { value: 'annual', label: 'Annual' },
              { value: 'event_plus_periodic', label: 'Event-Driven + Periodic Review' },
            ],
          },
          {
            id: 'new_risk_identification_process',
            label: 'New Risk Identification Process',
            type: 'textarea',
            required: true,
            helpText: 'Describe the process for identifying and documenting newly discovered risks from post-market experience',
            validation: { minLength: 15 },
          },
          {
            id: 'management_of_change',
            label: 'Management of Change Procedure',
            type: 'textarea',
            required: true,
            helpText: 'Describe how changes to the product, process, or use conditions trigger risk management updates per ISO 14971:2019 clause 9',
            validation: { minLength: 15 },
          },
        ],
        issueChecks: [
          {
            id: 'no_capa_integration',
            condition: { field: 'capa_integrated', operator: 'eq', value: false },
            severity: 'warning',
            title: 'CAPA System Not Integrated with Risk Management',
            message:
              'ISO 13485:2016 clause 8.5.2 requires that corrective actions be appropriate to the effects of the nonconformities encountered, and ICH Q10 Section 3 requires a CAPA system linked to quality risk management. Without CAPA-risk management integration, corrective actions may not adequately address underlying risks.',
            reference: 'ISO 13485:2016, Clause 8.5.2; ICH Q10, Section 3',
          },
        ],
        defaultNext: 'rm_report',
      },

      /* ── 7. Risk Management Review ───────────────────────────────── */

      {
        id: 'rm_report',
        section: 'Risk Management Review',
        question:
          'Describe the status and completeness of the risk management report.',
        guidance:
          'ISO 14971:2019 clause 8 requires a risk management report that documents the results of the risk management process. The report shall confirm that the risk management plan has been appropriately implemented, the overall residual risk is acceptable, appropriate methods are in place to collect relevant production and post-production information, and the risk management file is complete.',
        fields: [
          {
            id: 'rm_report_complete',
            label: 'Is the risk management report complete?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 8, the risk management report shall review the risk management file',
          },
          {
            id: 'report_covers_requirements',
            label: 'Does the report cover all applicable standard requirements?',
            type: 'yes_no',
            required: true,
            helpText: 'Confirm that the report addresses all requirements of ISO 14971:2019 clause 8 and/or ICH Q9 as applicable',
          },
          {
            id: 'rm_plan_objectives_met',
            label: 'Have risk management plan objectives been met?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'residual_risk_acceptability_statement',
            label: 'Residual Risk Acceptability Statement',
            type: 'textarea',
            required: true,
            helpText: 'Provide the formal statement on acceptability of the overall residual risk per ISO 14971:2019 clause 8',
            validation: { minLength: 20 },
          },
          {
            id: 'production_postproduction_provisions',
            label: 'Are production and post-production monitoring provisions confirmed?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 8, the report shall confirm that methods for obtaining relevant production and post-production information are in place',
          },
        ],
        issueChecks: [
          {
            id: 'rm_report_incomplete',
            condition: { field: 'rm_report_complete', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Risk Management Report Incomplete',
            message:
              'ISO 14971:2019 clause 8 requires a completed risk management report before the product can be released to market. The report must confirm that the risk management plan has been appropriately implemented and the overall residual risk is acceptable. An incomplete report indicates the risk management process has not been finalized.',
            reference: 'ISO 14971:2019, Clause 8',
          },
        ],
        defaultNext: 'rm_file_review',
      },

      {
        id: 'rm_file_review',
        section: 'Risk Management Review',
        question:
          'Review the risk management file for completeness. Which elements are present?',
        guidance:
          'ISO 14971:2019 clause 4.5 defines the risk management file as the set of records and documents produced by the risk management process. The file shall be traceable to each hazard, hazardous situation, risk estimate, risk control measure, and verification. A gap analysis identifies any missing elements that must be completed before the file can be considered ready for regulatory submission or audit.',
        fields: [
          {
            id: 'rm_file_contents',
            label: 'Risk Management File Contents',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'rm_plan', label: 'Risk Management Plan' },
              { value: 'risk_analysis_records', label: 'Risk Analysis Records' },
              { value: 'risk_evaluation_records', label: 'Risk Evaluation Records' },
              { value: 'risk_control_records', label: 'Risk Control Records' },
              { value: 'residual_risk_evaluation', label: 'Residual Risk Evaluation' },
              { value: 'production_monitoring_plan', label: 'Production and Post-Production Monitoring Plan' },
            ],
          },
          {
            id: 'file_completeness',
            label: 'File Completeness Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'complete', label: 'Complete — all elements present and finalized' },
              { value: 'partial', label: 'Partial — some elements still in progress' },
              { value: 'not_started', label: 'Not Started — file assembly not yet begun' },
            ],
          },
          {
            id: 'gap_analysis_performed',
            label: 'Has a gap analysis been performed?',
            type: 'yes_no',
            required: true,
            helpText: 'Identify any missing or incomplete elements required by ISO 14971:2019 or ICH Q9',
          },
        ],
        issueChecks: [
          {
            id: 'file_completeness_not_assessed',
            condition: { field: 'file_completeness', operator: 'in', value: ['partial', 'not_started'] },
            severity: 'warning',
            title: 'Risk Management File Not Complete',
            message:
              'The risk management file is not fully complete. ISO 14971:2019 clause 4.5 requires a complete risk management file that provides traceability for each identified hazard to risk analysis, risk evaluation, risk control implementation and verification, and assessment of residual risk. Ensure all elements are finalized before regulatory submission.',
            reference: 'ISO 14971:2019, Clause 4.5',
          },
        ],
        defaultNext: 'management_approval',
      },

      {
        id: 'management_approval',
        section: 'Risk Management Review',
        question:
          'Provide details on management review and approval of the risk management activities.',
        guidance:
          'ISO 14971:2019 clause 4.1 requires top management to ensure adequate resources and assign qualified personnel for risk management. ISO 14971:2019 clause 4.2 requires management to define and document a policy for determining acceptable risk. Regular management review of risk management effectiveness ensures continued suitability and identifies opportunities for improvement.',
        fields: [
          {
            id: 'management_review_conducted',
            label: 'Has a management review of risk management been conducted?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ISO 14971:2019 clause 4.1, top management shall ensure the adequacy of the risk management process',
          },
          {
            id: 'management_review_date',
            label: 'Management Review Date',
            type: 'date',
            visibleWhen: { field: 'management_review_conducted', operator: 'eq', value: true },
          },
          {
            id: 'approval_authority',
            label: 'Approval Authority',
            type: 'text',
            required: true,
            helpText: 'Name and title of the individual with authority to approve the risk management report',
          },
          {
            id: 'periodic_review_schedule',
            label: 'Periodic Review Schedule',
            type: 'select',
            required: true,
            options: [
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'semi_annual', label: 'Semi-Annual' },
              { value: 'annual', label: 'Annual' },
              { value: 'biennial', label: 'Biennial (Every 2 Years)' },
            ],
          },
          {
            id: 'next_review_date',
            label: 'Next Scheduled Review Date',
            type: 'date',
            required: true,
          },
          {
            id: 'rm_effectiveness_metrics',
            label: 'Are risk management effectiveness metrics defined?',
            type: 'yes_no',
            required: true,
            helpText: 'Metrics to evaluate the effectiveness of the risk management process (e.g., risk reduction trends, time to risk control implementation, post-market risk event rates)',
          },
        ],
        issueChecks: [
          {
            id: 'no_management_review',
            condition: { field: 'management_review_conducted', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Management Review Conducted',
            message:
              'ISO 14971:2019 clause 4.1 requires top management to ensure the suitability and effectiveness of the risk management process. A management review provides documented evidence of top management engagement and is routinely verified during regulatory audits and inspections.',
            reference: 'ISO 14971:2019, Clause 4.1; ISO 13485:2016, Clause 5.6',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
