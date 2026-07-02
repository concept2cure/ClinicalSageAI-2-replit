/**
 * Risk Management flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through a comprehensive risk management questionnaire
 * covering product scope, hazard identification, risk analysis &
 * evaluation, risk control, residual risk & benefit-risk assessment,
 * and risk management review per ISO 14971:2019 (medical devices) and
 * ICH Q9 (pharmaceuticals).
 *
 * @module server/services/ana/intelligence-questions/flows/risk-management
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createRiskManagementFlow(): FlowDefinition {
  return {
    id: 'risk-management-v1',
    category: 'risk_management',
    name: 'Risk Management',
    description:
      'Comprehensive risk management questionnaire aligned with ISO 14971:2019 and ICH Q9(R1), covering hazard identification, risk analysis, risk evaluation, risk control, residual risk assessment, benefit-risk analysis, and post-production monitoring for medical devices and pharmaceuticals.',
    clientTypes: [],
    entryNode: 'product_scope',
    estimatedMinutes: 55,

    /* ================================================================ */
    /*  Sections                                                        */
    /* ================================================================ */

    sections: [
      {
        id: 'product_scope_section',
        label: 'Product & Scope',
        nodeIds: ['product_scope', 'regulatory_context', 'product_type_branching'],
      },
      {
        id: 'hazard_identification',
        label: 'Hazard Identification',
        nodeIds: ['device_hazards', 'pharma_hazards', 'samd_hazards'],
      },
      {
        id: 'risk_analysis',
        label: 'Risk Analysis & Evaluation',
        nodeIds: ['risk_estimation', 'risk_evaluation', 'risk_acceptability'],
      },
      {
        id: 'risk_control',
        label: 'Risk Control',
        nodeIds: ['risk_controls', 'control_verification', 'control_implementation'],
      },
      {
        id: 'residual_risk',
        label: 'Residual Risk & Benefit-Risk',
        nodeIds: ['residual_risk', 'benefit_risk_analysis'],
      },
      {
        id: 'risk_review',
        label: 'Risk Management Review',
        nodeIds: ['risk_management_review', 'post_production_monitoring'],
      },
    ],

    /* ================================================================ */
    /*  Nodes                                                           */
    /* ================================================================ */

    nodes: [
      /* ── Product & Scope ───────────────────────────────────────── */

      {
        id: 'product_scope',
        section: 'product_scope_section',
        question:
          'Let’s begin by identifying the product under risk management. What is the product name, its description, intended use, and the intended patient population?',
        guidance:
          'ISO 14971:2019 Section 4.1 requires top management to ensure that adequate resources are provided for the risk management process. The intended use and reasonably foreseeable misuse must be clearly documented as the foundation for hazard identification.',
        fields: [
          {
            id: 'product_name',
            label: 'Product Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. CardioStim Pulse Generator Model X',
          },
          {
            id: 'product_description',
            label: 'Product Description',
            type: 'textarea',
            required: true,
            placeholder: 'Provide a concise description of the product, its technology, and key components',
          },
          {
            id: 'intended_use',
            label: 'Intended Use',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the intended medical purpose, clinical indication, and conditions of use',
          },
          {
            id: 'patient_population',
            label: 'Intended Patient Population',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the target patient population including age, condition, and any contraindications',
          },
          {
            id: 'product_lifecycle_stage',
            label: 'Product Lifecycle Stage',
            type: 'select',
            options: [
              { value: 'concept', label: 'Concept' },
              { value: 'design_development', label: 'Design & Development' },
              { value: 'verification_validation', label: 'Verification & Validation' },
              { value: 'production', label: 'Production' },
              { value: 'post_production', label: 'Post-Production' },
            ],
          },
        ],
        defaultNext: 'regulatory_context',
      },

      {
        id: 'regulatory_context',
        section: 'product_scope_section',
        question:
          'What are the target regulatory markets, applicable standards, and does a prior risk management file exist for this product?',
        guidance:
          'The applicable regulatory framework varies by market. ISO 14971:2019 is the international standard for medical device risk management. ICH Q9(R1) governs quality risk management for pharmaceuticals. IEC 62366 addresses usability engineering. Identifying all applicable standards upfront ensures comprehensive coverage.',
        fields: [
          {
            id: 'target_markets',
            label: 'Target Regulatory Markets',
            type: 'multi_select',
            options: [
              { value: 'us', label: 'United States (FDA)' },
              { value: 'eu', label: 'European Union (MDR/IVDR)' },
              { value: 'japan', label: 'Japan (PMDA)' },
              { value: 'china', label: 'China (NMPA)' },
              { value: 'canada', label: 'Canada (Health Canada)' },
              { value: 'australia', label: 'Australia (TGA)' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'applicable_standards',
            label: 'Applicable Standards',
            type: 'multi_select',
            options: [
              { value: 'iso_14971', label: 'ISO 14971:2019 — Risk Management for Medical Devices' },
              { value: 'ich_q9', label: 'ICH Q9(R1) — Quality Risk Management' },
              { value: 'iec_62366', label: 'IEC 62366 — Usability Engineering' },
              { value: 'iso_13485', label: 'ISO 13485 — Quality Management Systems' },
              { value: 'iec_60601', label: 'IEC 60601 — Medical Electrical Equipment' },
              { value: 'iso_10993', label: 'ISO 10993 — Biological Evaluation' },
              { value: 'other_standard', label: 'Other Standard' },
            ],
          },
          {
            id: 'prior_risk_file_exists',
            label: 'Does a prior risk management file exist for this product?',
            type: 'yes_no',
          },
          {
            id: 'prior_risk_file_date',
            label: 'Date of Prior Risk Management File',
            type: 'date',
            visibleWhen: { field: 'prior_risk_file_exists', operator: 'eq', value: true },
          },
          {
            id: 'product_category',
            label: 'Product Category',
            type: 'select',
            options: [
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'pharmaceutical', label: 'Pharmaceutical' },
              { value: 'combination_product', label: 'Combination Product' },
              { value: 'samd', label: 'Software as a Medical Device (SaMD)' },
            ],
          },
        ],
        defaultNext: 'product_type_branching',
      },

      {
        id: 'product_type_branching',
        section: 'product_scope_section',
        question:
          'Provide additional product characteristics that will determine the appropriate hazard identification approach.',
        guidance:
          'The device class, drug formulation type, SaMD classification, or combination product lead constituent determines which regulatory requirements and hazard identification methods are most relevant.',
        fields: [
          {
            id: 'device_class',
            label: 'Device Classification',
            type: 'select',
            visibleWhen: { field: 'product_category', operator: 'in', value: ['medical_device', 'combination_product', 'samd'] },
            options: [
              { value: 'class_i', label: 'Class I' },
              { value: 'class_ii', label: 'Class II' },
              { value: 'class_iii', label: 'Class III' },
            ],
          },
          {
            id: 'drug_formulation_type',
            label: 'Drug Formulation Type',
            type: 'select',
            visibleWhen: { field: 'product_category', operator: 'eq', value: 'pharmaceutical' },
            options: [
              { value: 'oral_solid', label: 'Oral Solid' },
              { value: 'injectable', label: 'Injectable' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhaled', label: 'Inhaled' },
              { value: 'implant', label: 'Implant' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'samd_classification',
            label: 'SaMD Classification (IMDRF)',
            type: 'select',
            visibleWhen: { field: 'product_category', operator: 'eq', value: 'samd' },
            options: [
              { value: 'class_a', label: 'Class A' },
              { value: 'class_b', label: 'Class B' },
              { value: 'class_c', label: 'Class C' },
            ],
          },
          {
            id: 'combination_product_lead',
            label: 'Combination Product Lead Constituent',
            type: 'select',
            visibleWhen: { field: 'product_category', operator: 'eq', value: 'combination_product' },
            options: [
              { value: 'device_led', label: 'Device-Led' },
              { value: 'drug_led', label: 'Drug-Led' },
              { value: 'biologic_led', label: 'Biologic-Led' },
            ],
          },
          {
            id: 'has_software_component',
            label: 'Does the product contain a software component?',
            type: 'yes_no',
          },
          {
            id: 'has_sterile_component',
            label: 'Does the product contain a sterile component?',
            type: 'yes_no',
          },
        ],
        branches: [
          {
            when: { field: 'product_category', operator: 'eq', value: 'samd' },
            goto: 'samd_hazards',
          },
          {
            when: { field: 'product_category', operator: 'eq', value: 'pharmaceutical' },
            goto: 'pharma_hazards',
          },
        ],
        defaultNext: 'device_hazards',
      },

      /* ── Hazard Identification ─────────────────────────────────── */

      {
        id: 'device_hazards',
        section: 'hazard_identification',
        question:
          'Identify hazards for this medical device. Which hazard identification methods were used and what hazard categories were identified?',
        guidance:
          'ISO 14971:2019 Annex C provides a comprehensive list of example hazards and hazardous situations to consider, organized by energy type, biological, environmental, and use-related categories. Systematic identification should cover both normal and fault conditions.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'hazard_identification_methods',
            label: 'Hazard Identification Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'preliminary_hazard_analysis', label: 'Preliminary Hazard Analysis (PHA)' },
              { value: 'fmea', label: 'Failure Mode and Effects Analysis (FMEA)' },
              { value: 'fault_tree', label: 'Fault Tree Analysis (FTA)' },
              { value: 'hazop', label: 'Hazard and Operability Study (HAZOP)' },
              { value: 'use_related_risk_analysis', label: 'Use-Related Risk Analysis' },
              { value: 'iec_60601_analysis', label: 'IEC 60601 Series Analysis' },
              { value: 'other_method', label: 'Other Method' },
            ],
          },
          {
            id: 'energy_hazards',
            label: 'Energy Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'electrical', label: 'Electrical' },
              { value: 'thermal', label: 'Thermal' },
              { value: 'mechanical', label: 'Mechanical' },
              { value: 'radiation', label: 'Radiation' },
              { value: 'chemical', label: 'Chemical' },
              { value: 'biological', label: 'Biological' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'information_hazards',
            label: 'Information Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'labeling_errors', label: 'Labeling Errors' },
              { value: 'incorrect_ifu', label: 'Incorrect Instructions for Use' },
              { value: 'software_display_errors', label: 'Software Display Errors' },
              { value: 'alarm_failures', label: 'Alarm Failures' },
              { value: 'training_gaps', label: 'Training Gaps' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'biological_hazards',
            label: 'Biological Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'biocompatibility', label: 'Biocompatibility' },
              { value: 'infection_risk', label: 'Infection Risk' },
              { value: 'pyrogens', label: 'Pyrogens' },
              { value: 'degradation_products', label: 'Degradation Products' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'use_error_hazards',
            label: 'Use Error Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'incorrect_assembly', label: 'Incorrect Assembly' },
              { value: 'misuse', label: 'Misuse' },
              { value: 'use_without_training', label: 'Use Without Training' },
              { value: 'off_label_use', label: 'Off-Label Use' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'hazard_count_estimate',
            label: 'Total Number of Hazards Identified',
            type: 'number',
            helpText: 'Enter the total number of individual hazards identified across all categories',
            validation: { min: 1 },
          },
        ],
        issueChecks: [
          {
            id: 'incomplete_hazard_energy',
            condition: { field: 'energy_hazards', operator: 'contains', value: 'none_identified' },
            severity: 'warning',
            title: 'No Energy Hazards Identified',
            message:
              'Most medical devices involve at least one energy hazard. Please verify this is accurate.',
            reference: 'ISO 14971:2019 Annex C.2',
          },
        ],
        defaultNext: 'risk_estimation',
      },

      {
        id: 'pharma_hazards',
        section: 'hazard_identification',
        question:
          'Identify hazards for this pharmaceutical product. Which quality risk management methods were used and what hazard categories were identified?',
        guidance:
          'ICH Q9(R1) provides a framework for quality risk management in the pharmaceutical lifecycle. Annex I of ICH Q9 describes risk management methods including FMEA, FTA, HACCP, and preliminary hazard analysis. Hazards should be categorized across quality, patient safety, manufacturing, and supply chain dimensions.',
        fields: [
          {
            id: 'hazard_identification_methods',
            label: 'Hazard Identification Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'ich_q9_tools', label: 'ICH Q9 Risk Management Tools' },
              { value: 'fmea', label: 'Failure Mode and Effects Analysis (FMEA)' },
              { value: 'fta', label: 'Fault Tree Analysis (FTA)' },
              { value: 'haccp', label: 'Hazard Analysis and Critical Control Points (HACCP)' },
              { value: 'what_if_analysis', label: 'What-If Analysis' },
              { value: 'other_method', label: 'Other Method' },
            ],
          },
          {
            id: 'quality_hazards',
            label: 'Quality Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'impurities', label: 'Impurities' },
              { value: 'degradation', label: 'Degradation' },
              { value: 'contamination', label: 'Contamination' },
              { value: 'cross_contamination', label: 'Cross-Contamination' },
              { value: 'potency_variation', label: 'Potency Variation' },
              { value: 'sterility_failure', label: 'Sterility Failure' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'patient_safety_hazards',
            label: 'Patient Safety Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'adverse_drug_reactions', label: 'Adverse Drug Reactions' },
              { value: 'drug_interactions', label: 'Drug Interactions' },
              { value: 'dosing_errors', label: 'Dosing Errors' },
              { value: 'medication_errors', label: 'Medication Errors' },
              { value: 'abuse_potential', label: 'Abuse Potential' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'manufacturing_hazards',
            label: 'Manufacturing Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'process_deviations', label: 'Process Deviations' },
              { value: 'equipment_failure', label: 'Equipment Failure' },
              { value: 'raw_material_variability', label: 'Raw Material Variability' },
              { value: 'environmental_factors', label: 'Environmental Factors' },
              { value: 'human_error', label: 'Human Error' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'supply_chain_hazards',
            label: 'Supply Chain Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'supplier_failure', label: 'Supplier Failure' },
              { value: 'cold_chain_breach', label: 'Cold Chain Breach' },
              { value: 'counterfeit_risk', label: 'Counterfeit Risk' },
              { value: 'shortage_risk', label: 'Shortage Risk' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
        ],
        defaultNext: 'risk_estimation',
      },

      {
        id: 'samd_hazards',
        section: 'hazard_identification',
        question:
          'Identify hazards for this Software as a Medical Device (SaMD). Which hazard identification methods were used and what hazard categories were identified?',
        guidance:
          'SaMD hazard identification should follow IEC 62304 for software lifecycle processes and incorporate FDA guidance on SaMD clinical evaluation. Hazards unique to SaMD include algorithm errors, cybersecurity threats, interoperability failures, and clinical decision support risks. Threat modeling per AAMI TIR57 should be considered.',
        fields: [
          {
            id: 'hazard_identification_methods',
            label: 'Hazard Identification Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'software_fmea', label: 'Software FMEA' },
              { value: 'threat_modeling', label: 'Threat Modeling' },
              { value: 'use_case_analysis', label: 'Use Case Analysis' },
              { value: 'data_flow_analysis', label: 'Data Flow Analysis' },
              { value: 'other_method', label: 'Other Method' },
            ],
          },
          {
            id: 'algorithm_hazards',
            label: 'Algorithm Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'incorrect_output', label: 'Incorrect Output' },
              { value: 'delayed_output', label: 'Delayed Output' },
              { value: 'false_positive', label: 'False Positive' },
              { value: 'false_negative', label: 'False Negative' },
              { value: 'bias_in_training_data', label: 'Bias in Training Data' },
              { value: 'model_drift', label: 'Model Drift' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'cybersecurity_hazards',
            label: 'Cybersecurity Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'unauthorized_access', label: 'Unauthorized Access' },
              { value: 'data_breach', label: 'Data Breach' },
              { value: 'ransomware', label: 'Ransomware' },
              { value: 'denial_of_service', label: 'Denial of Service' },
              { value: 'data_integrity_loss', label: 'Data Integrity Loss' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'interoperability_hazards',
            label: 'Interoperability Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'ehr_integration_errors', label: 'EHR Integration Errors' },
              { value: 'data_format_mismatch', label: 'Data Format Mismatch' },
              { value: 'network_failure', label: 'Network Failure' },
              { value: 'api_failures', label: 'API Failures' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
          {
            id: 'clinical_decision_hazards',
            label: 'Clinical Decision Hazards Identified',
            type: 'multi_select',
            options: [
              { value: 'over_reliance_on_algorithm', label: 'Over-Reliance on Algorithm' },
              { value: 'alert_fatigue', label: 'Alert Fatigue' },
              { value: 'delayed_treatment', label: 'Delayed Treatment' },
              { value: 'incorrect_diagnosis', label: 'Incorrect Diagnosis' },
              { value: 'none_identified', label: 'None Identified' },
            ],
          },
        ],
        defaultNext: 'risk_estimation',
      },

      /* ── Risk Analysis & Evaluation ────────────────────────────── */

      {
        id: 'risk_estimation',
        section: 'risk_analysis',
        question:
          'Describe the risk estimation methodology. How are severity and probability of harm determined?',
        guidance:
          'ISO 14971:2019 Section 5 requires estimation of risk(s) for each identified hazardous situation using the probability of occurrence of harm and the severity of that harm. The estimation may be qualitative, semi-quantitative, or quantitative depending on available data.',
        fields: [
          {
            id: 'severity_scale',
            label: 'Severity Scale',
            type: 'select',
            options: [
              { value: 'three_level', label: '3-Level Scale' },
              { value: 'five_level', label: '5-Level Scale' },
              { value: 'custom', label: 'Custom Scale' },
            ],
          },
          {
            id: 'probability_scale',
            label: 'Probability Scale',
            type: 'select',
            options: [
              { value: 'qualitative_3', label: 'Qualitative (3 levels)' },
              { value: 'qualitative_5', label: 'Qualitative (5 levels)' },
              { value: 'semi_quantitative', label: 'Semi-Quantitative' },
              { value: 'quantitative', label: 'Quantitative' },
            ],
          },
          {
            id: 'risk_matrix_type',
            label: 'Risk Matrix Type',
            type: 'select',
            options: [
              { value: '3x3', label: '3×3 Matrix' },
              { value: '5x5', label: '5×5 Matrix' },
              { value: 'custom_matrix', label: 'Custom Matrix' },
            ],
          },
          {
            id: 'highest_severity_identified',
            label: 'Highest Severity Level Identified',
            type: 'select',
            required: true,
            options: [
              { value: 'negligible', label: 'Negligible' },
              { value: 'minor', label: 'Minor' },
              { value: 'serious', label: 'Serious' },
              { value: 'critical', label: 'Critical' },
              { value: 'catastrophic', label: 'Catastrophic' },
            ],
          },
          {
            id: 'highest_probability_identified',
            label: 'Highest Probability Level Identified',
            type: 'select',
            required: true,
            options: [
              { value: 'incredible', label: 'Incredible' },
              { value: 'improbable', label: 'Improbable' },
              { value: 'remote', label: 'Remote' },
              { value: 'occasional', label: 'Occasional' },
              { value: 'probable', label: 'Probable' },
              { value: 'frequent', label: 'Frequent' },
            ],
          },
          {
            id: 'number_of_risks_analyzed',
            label: 'Number of Risks Analyzed',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'risk_estimation_method',
            label: 'Risk Estimation Method Description',
            type: 'textarea',
            placeholder: 'Describe how severity and probability were estimated, including data sources and rationale',
          },
        ],
        defaultNext: 'risk_evaluation',
      },

      {
        id: 'risk_evaluation',
        section: 'risk_analysis',
        question:
          'How were risks evaluated against acceptability criteria? What is the threshold for acceptable risk?',
        guidance:
          'ISO 14971:2019 Section 6 requires each estimated risk to be evaluated using the criteria for risk acceptability defined in the risk management plan. Risks that are not acceptable require risk control measures. The ALARP (As Low As Reasonably Practicable) principle is commonly applied.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'risk_acceptability_criteria',
            label: 'Risk Acceptability Criteria',
            type: 'select',
            required: true,
            options: [
              { value: 'iso_14971_annex_d', label: 'ISO 14971 Annex D Guidance' },
              { value: 'ich_q9_alarp', label: 'ICH Q9 ALARP Principle' },
              { value: 'custom_criteria', label: 'Custom Criteria' },
            ],
          },
          {
            id: 'acceptable_risk_threshold',
            label: 'Acceptable Risk Threshold',
            type: 'textarea',
            required: true,
            placeholder: 'Define the boundary between acceptable and unacceptable risk, including severity/probability combinations',
          },
          {
            id: 'number_of_unacceptable_risks',
            label: 'Number of Unacceptable Risks',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'risk_benefit_analysis_needed',
            label: 'Is a risk-benefit analysis needed for any risks?',
            type: 'yes_no',
          },
          {
            id: 'benefit_risk_methodology',
            label: 'Benefit-Risk Methodology',
            type: 'textarea',
            visibleWhen: { field: 'risk_benefit_analysis_needed', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'risk_acceptability',
      },

      {
        id: 'risk_acceptability',
        section: 'risk_analysis',
        question:
          'Are all risks acceptable after evaluation? Provide ALARP demonstration and residual risk justification details.',
        guidance:
          'ISO 14971:2019 Section 7.4 requires that residual risks be evaluated and that the ALARP principle be demonstrated. If risks remain unacceptable, the manufacturer must either implement further risk controls or perform a benefit-risk analysis.',
        fields: [
          {
            id: 'all_risks_acceptable_after_eval',
            label: 'Are all risks acceptable after evaluation?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'unacceptable_risk_list',
            label: 'List of Unacceptable Risks',
            type: 'textarea',
            visibleWhen: { field: 'all_risks_acceptable_after_eval', operator: 'eq', value: false },
            placeholder: 'List each unacceptable risk with its hazard, severity, probability, and current risk level',
          },
          {
            id: 'alarp_demonstration',
            label: 'ALARP Demonstration',
            type: 'textarea',
            helpText: 'Demonstrate that risks have been reduced As Low As Reasonably Practicable. Describe the analysis showing further risk reduction is impracticable or disproportionate.',
          },
          {
            id: 'residual_risk_justification_approach',
            label: 'Residual Risk Justification Approach',
            type: 'select',
            options: [
              { value: 'benefit_risk_analysis', label: 'Benefit-Risk Analysis' },
              { value: 'state_of_art_comparison', label: 'State of the Art Comparison' },
              { value: 'standards_compliance', label: 'Standards Compliance' },
              { value: 'combination_approach', label: 'Combination Approach' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'alarp_not_demonstrated',
            condition: { field: 'alarp_demonstration', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'ALARP Not Demonstrated',
            message:
              'The ALARP principle requires documentation that risks have been reduced as far as reasonably practicable. Please provide this justification.',
            reference: 'ISO 14971:2019 Section 7.4',
          },
        ],
        defaultNext: 'risk_controls',
      },

      /* ── Risk Control ──────────────────────────────────────────── */

      {
        id: 'risk_controls',
        section: 'risk_control',
        question:
          'Describe the risk control measures identified. How were risk control options analyzed per the ISO 14971 priority order?',
        guidance:
          'ISO 14971:2019 Section 7 specifies the priority order for risk control options: (a) inherent safety by design, (b) protective measures in the medical device itself or in the manufacturing process, and (c) information for safety. Each risk control measure must be verified for implementation and effectiveness.',
        fields: [
          {
            id: 'control_option_analysis',
            label: 'Risk Control Option Analysis',
            type: 'textarea',
            required: true,
            placeholder: 'Describe how risk control options were analyzed per the priority order: inherent safety by design, protective measures, information for safety',
          },
          {
            id: 'inherent_safety_measures',
            label: 'Inherent Safety by Design Measures',
            type: 'textarea',
            helpText: 'Describe design changes that eliminate or reduce hazards at the source (highest priority per ISO 14971)',
          },
          {
            id: 'protective_measures',
            label: 'Protective Measures',
            type: 'textarea',
            helpText: 'Describe guards, barriers, alarms, interlocks, or process controls implemented',
          },
          {
            id: 'information_for_safety',
            label: 'Information for Safety',
            type: 'textarea',
            helpText: 'Describe warnings, contraindications, precautions, and training materials provided',
          },
          {
            id: 'number_of_controls_identified',
            label: 'Number of Risk Control Measures Identified',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'controls_introduce_new_risks',
            label: 'Do any risk control measures introduce new risks?',
            type: 'yes_no',
          },
        ],
        issueChecks: [
          {
            id: 'no_inherent_safety',
            condition: { field: 'inherent_safety_measures', operator: 'eq', value: '' },
            severity: 'info',
            title: 'No Inherent Safety Measures',
            message:
              'ISO 14971 prioritizes inherent safety by design as the most effective risk control. Consider whether design changes could eliminate hazards.',
            reference: 'ISO 14971:2019 Section 7.1',
          },
        ],
        defaultNext: 'control_verification',
      },

      {
        id: 'control_verification',
        section: 'risk_control',
        question:
          'How were risk control measures verified for implementation and effectiveness?',
        guidance:
          'ISO 14971:2019 Section 7.3 requires verification that each risk control measure has been implemented in the final design and is effective in reducing risk. Verification should include testing, inspection, analysis, or review of design history. A traceability matrix linking hazards to controls to verification evidence is best practice.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'verification_methods',
            label: 'Verification Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'testing', label: 'Testing' },
              { value: 'inspection', label: 'Inspection' },
              { value: 'analysis', label: 'Analysis' },
              { value: 'review_of_design_history', label: 'Review of Design History' },
              { value: 'clinical_evaluation', label: 'Clinical Evaluation' },
              { value: 'usability_testing', label: 'Usability Testing' },
            ],
          },
          {
            id: 'all_controls_verified',
            label: 'Have all risk control measures been verified?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'unverified_controls',
            label: 'List of Unverified Controls',
            type: 'textarea',
            visibleWhen: { field: 'all_controls_verified', operator: 'eq', value: false },
          },
          {
            id: 'verification_evidence_documented',
            label: 'Is verification evidence documented?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'traceability_matrix_exists',
            label: 'Does a traceability matrix exist (hazard → control → verification)?',
            type: 'yes_no',
          },
        ],
        issueChecks: [
          {
            id: 'no_control_verification',
            condition: { field: 'all_controls_verified', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Unverified Risk Controls',
            message:
              'All risk control measures must be verified for implementation and effectiveness before the product is released. Unverified controls represent uncontrolled risks.',
            reference: 'ISO 14971:2019 Section 7.3',
          },
          {
            id: 'no_verification_evidence',
            condition: { field: 'verification_evidence_documented', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Verification Evidence Not Documented',
            message:
              'Verification activities must be documented in the risk management file. Ensure test reports and analysis records are maintained.',
            reference: 'ISO 14971:2019 Section 7.3',
          },
        ],
        defaultNext: 'control_implementation',
      },

      {
        id: 'control_implementation',
        section: 'risk_control',
        question:
          'What is the current implementation status of the risk control measures?',
        guidance:
          'Tracking implementation status ensures that all identified risk controls are actually incorporated into the product design, manufacturing process, or labeling before release. Any required design or manufacturing changes must be managed through the design control process.',
        fields: [
          {
            id: 'implementation_status',
            label: 'Implementation Status',
            type: 'select',
            required: true,
            options: [
              { value: 'not_started', label: 'Not Started' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'partially_implemented', label: 'Partially Implemented' },
              { value: 'fully_implemented', label: 'Fully Implemented' },
            ],
          },
          {
            id: 'implementation_timeline',
            label: 'Implementation Timeline',
            type: 'text',
            placeholder: 'e.g., Q3 2025',
          },
          {
            id: 'responsible_person',
            label: 'Responsible Person',
            type: 'text',
            required: true,
            placeholder: 'Name and title of person responsible for implementation',
          },
          {
            id: 'design_changes_required',
            label: 'Are design changes required?',
            type: 'yes_no',
          },
          {
            id: 'design_change_description',
            label: 'Design Change Description',
            type: 'textarea',
            visibleWhen: { field: 'design_changes_required', operator: 'eq', value: true },
          },
          {
            id: 'manufacturing_changes_required',
            label: 'Are manufacturing changes required?',
            type: 'yes_no',
          },
          {
            id: 'manufacturing_change_description',
            label: 'Manufacturing Change Description',
            type: 'textarea',
            visibleWhen: { field: 'manufacturing_changes_required', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'residual_risk',
      },

      /* ── Residual Risk & Benefit-Risk ──────────────────────────── */

      {
        id: 'residual_risk',
        section: 'residual_risk',
        question:
          'Assess the overall residual risk. Are all individual residual risks documented and acceptable?',
        guidance:
          'ISO 14971:2019 Section 8 requires evaluation of the overall residual risk, taking into account contributions from all individual residual risks. Residual risks that cannot be further reduced must be communicated through labeling, instructions for use, training materials, or contraindications.',
        fields: [
          {
            id: 'overall_residual_risk_acceptable',
            label: 'Is the overall residual risk acceptable?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'residual_risk_summary',
            label: 'Residual Risk Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Summarize the overall residual risk, including the basis for the acceptability determination',
          },
          {
            id: 'individual_residual_risks_documented',
            label: 'Are all individual residual risks documented?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'highest_residual_risk_level',
            label: 'Highest Residual Risk Level',
            type: 'select',
            required: true,
            options: [
              { value: 'negligible', label: 'Negligible' },
              { value: 'acceptable', label: 'Acceptable' },
              { value: 'tolerable_with_benefit', label: 'Tolerable with Benefit' },
              { value: 'unacceptable', label: 'Unacceptable' },
            ],
          },
          {
            id: 'number_of_residual_risks',
            label: 'Number of Residual Risks',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'residual_risk_communication',
            label: 'Residual Risk Communication Methods',
            type: 'multi_select',
            options: [
              { value: 'ifu_warnings', label: 'IFU Warnings' },
              { value: 'labeling', label: 'Labeling' },
              { value: 'training_materials', label: 'Training Materials' },
              { value: 'contraindications', label: 'Contraindications' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'unacceptable_residual_risk',
            condition: { field: 'highest_residual_risk_level', operator: 'eq', value: 'unacceptable' },
            severity: 'critical',
            title: 'Unacceptable Residual Risk',
            message:
              'Products with unacceptable residual risk cannot be released to market. Additional risk control measures must be identified, or a benefit-risk analysis must demonstrate that benefits outweigh the residual risks.',
            reference: 'ISO 14971:2019 Section 8',
          },
        ],
        defaultNext: 'benefit_risk_analysis',
      },

      {
        id: 'benefit_risk_analysis',
        section: 'residual_risk',
        question:
          'Provide the benefit-risk analysis. What clinical benefits does the product offer and how do they compare to the residual risks?',
        guidance:
          'ISO 14971:2019 Section 8 requires that when the overall residual risk is not initially judged acceptable, a benefit-risk analysis must demonstrate that the medical benefits outweigh the residual risks. The analysis should be based on clinical data, literature, and comparison with comparable products.',
        fields: [
          {
            id: 'benefits_identified',
            label: 'Clinical Benefits Identified',
            type: 'textarea',
            required: true,
            placeholder: 'List all clinical benefits of the product',
          },
          {
            id: 'benefit_risk_methodology_used',
            label: 'Benefit-Risk Methodology Used',
            type: 'select',
            required: true,
            options: [
              { value: 'qualitative_comparison', label: 'Qualitative Comparison' },
              { value: 'quantitative_analysis', label: 'Quantitative Analysis' },
              { value: 'structured_framework', label: 'Structured Framework' },
              { value: 'published_literature', label: 'Published Literature' },
            ],
          },
          {
            id: 'benefit_risk_conclusion',
            label: 'Benefit-Risk Conclusion',
            type: 'select',
            required: true,
            options: [
              { value: 'benefits_outweigh_risks', label: 'Benefits Outweigh Risks' },
              { value: 'risks_outweigh_benefits', label: 'Risks Outweigh Benefits' },
              { value: 'inconclusive', label: 'Inconclusive' },
            ],
          },
          {
            id: 'supporting_clinical_data',
            label: 'Supporting Clinical Data',
            type: 'textarea',
            placeholder: 'Describe the clinical data supporting the benefit-risk conclusion, including study references and key endpoints',
          },
          {
            id: 'comparable_products_considered',
            label: 'Were comparable products considered?',
            type: 'yes_no',
          },
          {
            id: 'comparable_product_risk_profile',
            label: 'Comparable Product Risk Profile',
            type: 'textarea',
            visibleWhen: { field: 'comparable_products_considered', operator: 'eq', value: true },
          },
        ],
        issueChecks: [
          {
            id: 'risks_outweigh_benefits',
            condition: { field: 'benefit_risk_conclusion', operator: 'eq', value: 'risks_outweigh_benefits' },
            severity: 'critical',
            title: 'Negative Benefit-Risk Conclusion',
            message:
              'A determination that risks outweigh benefits prevents product release. The risk management process must be revisited to identify additional risk controls.',
            reference: 'ISO 14971:2019 Section 8',
          },
        ],
        defaultNext: 'risk_management_review',
      },

      /* ── Risk Management Review ────────────────────────────────── */

      {
        id: 'risk_management_review',
        section: 'risk_review',
        question:
          'Provide details on the risk management review. Is the risk management plan and file complete?',
        guidance:
          'ISO 14971:2019 Section 9 requires that the risk management process be reviewed before the product is released. The review must confirm that the risk management plan has been appropriately implemented, the overall residual risk is acceptable, and methods are in place to collect post-production information.',
        fields: [
          {
            id: 'risk_management_plan_complete',
            label: 'Is the risk management plan complete?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'risk_management_file_complete',
            label: 'Is the risk management file complete?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'review_participants',
            label: 'Review Participants',
            type: 'textarea',
            required: true,
            placeholder: 'List names, titles, and qualifications of review team members',
          },
          {
            id: 'review_date',
            label: 'Review Date',
            type: 'date',
            required: true,
          },
          {
            id: 'all_planned_activities_completed',
            label: 'Have all planned risk management activities been completed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'outstanding_actions',
            label: 'Outstanding Actions',
            type: 'textarea',
            visibleWhen: { field: 'all_planned_activities_completed', operator: 'eq', value: false },
          },
          {
            id: 'risk_management_report_generated',
            label: 'Has the risk management report been generated?',
            type: 'yes_no',
          },
        ],
        issueChecks: [
          {
            id: 'incomplete_rm_file',
            condition: { field: 'risk_management_file_complete', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Incomplete Risk Management File',
            message:
              'The risk management file must be complete before the risk management review. Ensure all required documents (risk management plan, risk analysis, risk evaluation, risk control records, residual risk evaluation, risk management report) are included.',
            reference: 'ISO 14971:2019 Section 3, ISO/TR 24971:2020',
          },
        ],
        defaultNext: 'post_production_monitoring',
      },

      {
        id: 'post_production_monitoring',
        section: 'risk_review',
        question:
          'Describe the post-production monitoring process. How will production and post-production information be collected and reviewed?',
        guidance:
          'ISO 14971:2019 Section 10 requires establishment and maintenance of a process to collect and review production and post-production information relevant to the safety of the product. This includes complaint handling, vigilance reporting, literature review, and post-market clinical follow-up.',
        fields: [
          {
            id: 'post_production_process_established',
            label: 'Has a post-production monitoring process been established?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'monitoring_sources',
            label: 'Post-Production Information Sources',
            type: 'multi_select',
            options: [
              { value: 'complaint_handling', label: 'Complaint Handling' },
              { value: 'vigilance_reporting', label: 'Vigilance Reporting' },
              { value: 'literature_review', label: 'Literature Review' },
              { value: 'post_market_clinical_follow_up', label: 'Post-Market Clinical Follow-Up' },
              { value: 'real_world_evidence', label: 'Real-World Evidence' },
              { value: 'registry_data', label: 'Registry Data' },
              { value: 'not_yet_established', label: 'Not Yet Established' },
            ],
          },
          {
            id: 'feedback_loop_to_risk_management',
            label: 'Is there a feedback loop from post-production to risk management?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'post_production_review_frequency',
            label: 'Post-Production Review Frequency',
            type: 'select',
            required: true,
            options: [
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'semi_annual', label: 'Semi-Annual' },
              { value: 'annual', label: 'Annual' },
              { value: 'event_driven', label: 'Event-Driven' },
            ],
          },
          {
            id: 'trend_analysis_planned',
            label: 'Is trend analysis planned?',
            type: 'yes_no',
          },
          {
            id: 'capa_integration',
            label: 'Is CAPA integrated with the risk management process?',
            type: 'yes_no',
          },
        ],
        issueChecks: [
          {
            id: 'no_post_production',
            condition: { field: 'post_production_process_established', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Post-Production Information Process',
            message:
              'ISO 14971:2019 Section 10 requires establishment and maintenance of a process to collect and review post-production information. This is mandatory and must be in place before product release.',
            reference: 'ISO 14971:2019 Section 10',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
