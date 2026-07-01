/**
 * Stability Study flow definition for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through stability study design and reporting
 * per ICH Q1A-Q1F, covering study design, storage conditions, testing parameters,
 * data analysis, and shelf-life determination.
 *
 * ~16 nodes · 65+ fields · 6 sections · 10+ issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/stability-study
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createStabilityStudyFlow(): FlowDefinition {
  return {
    id: 'stability-study-v1',
    category: 'stability_study',
    name: 'Stability Study',
    description:
      'Stability study design and reporting questionnaire per ICH Q1A-Q1F, covering study design, storage conditions, testing parameters, data analysis, and shelf-life determination.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'stability_overview',
    estimatedMinutes: 30,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'stability_overview',
        label: 'Stability Overview',
        nodeIds: ['stability_overview', 'batch_selection'],
      },
      {
        id: 'study_design',
        label: 'Study Design',
        nodeIds: ['storage_conditions', 'study_duration', 'reduced_testing'],
      },
      {
        id: 'testing_parameters',
        label: 'Testing Parameters',
        nodeIds: ['physical_tests', 'chemical_tests', 'additional_tests'],
      },
      {
        id: 'photostability',
        label: 'Photostability',
        nodeIds: ['photostability_design', 'photostability_results'],
      },
      {
        id: 'data_analysis',
        label: 'Data Analysis',
        nodeIds: ['statistical_analysis', 'shelf_life_estimation', 'oos_investigation'],
      },
      {
        id: 'regulatory_submission',
        label: 'Regulatory Submission',
        nodeIds: ['post_approval_commitment', 'stability_protocol_changes', 'stability_failures'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Stability Overview                                  */
      /* ================================================================ */

      {
        id: 'stability_overview',
        section: 'stability_overview',
        question:
          'Let\'s begin your stability study design. First, tell me about the product and its development stage. The type of product and where you are in development will shape the scope and depth of the stability program required under ICH Q1A(R2).',
        guidance:
          'ICH Q1A(R2) Section 1 establishes that stability testing is required for drug substances and drug products to determine their retest period or shelf life under defined storage conditions. The scope of the stability program depends on the development stage: early clinical studies may use abbreviated protocols, while registration applications require formal, long-term data on at least three primary batches. ICH Q1A(R2) Section 2.1 further distinguishes requirements for drug substances versus drug products.',
        fields: [
          {
            id: 'product_name',
            label: 'Product Name / Identifier',
            type: 'text',
            placeholder: 'e.g., ABC-1234 Tablets, 50 mg',
            required: true,
            helpText: 'Enter the drug substance or drug product name and strength as it will appear in the stability protocol.',
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'drug_substance', label: 'Drug Substance (Active Ingredient)', description: 'Bulk active pharmaceutical ingredient (API) before formulation' },
              { value: 'drug_product', label: 'Drug Product (Finished Dosage Form)', description: 'Final formulated product in its container closure system' },
              { value: 'intermediate', label: 'Intermediate', description: 'In-process material that undergoes further molecular change or purification' },
            ],
            helpText: 'ICH Q1A(R2) Section 2 distinguishes stability requirements for drug substances and drug products. Intermediates may have separate holding-time studies.',
          },
          {
            id: 'is_biologic',
            label: 'Is this a biological or biotechnological product?',
            type: 'yes_no',
            required: true,
            helpText: 'Biologics are subject to additional requirements under ICH Q5C "Quality of Biotechnological Products: Stability Testing of Biotechnological/Biological Products." These include potency assays and considerations for protein degradation pathways.',
          },
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'oral_solution', label: 'Oral Solution / Suspension' },
              { value: 'injectable_solution', label: 'Injectable Solution' },
              { value: 'lyophilized', label: 'Lyophilized Powder for Reconstitution' },
              { value: 'cream_ointment', label: 'Cream / Ointment / Gel' },
              { value: 'inhalation', label: 'Inhalation Product (MDI / DPI / Nebulizer)' },
              { value: 'ophthalmic', label: 'Ophthalmic / Otic Preparation' },
              { value: 'transdermal', label: 'Transdermal Patch' },
              { value: 'suppository', label: 'Suppository' },
              { value: 'bulk_api', label: 'Bulk API (drug substance)' },
              { value: 'other', label: 'Other' },
            ],
            visibleWhen: {
              field: 'product_type',
              operator: 'neq',
              value: 'drug_substance',
            },
          },
          {
            id: 'is_sterile',
            label: 'Is the product sterile?',
            type: 'yes_no',
            required: true,
            helpText: 'Sterile products require container closure integrity testing (CCIT) as part of the stability protocol and may have unique degradation pathways.',
          },
          {
            id: 'development_stage',
            label: 'Development Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'preclinical', label: 'Preclinical / IND-Enabling' },
              { value: 'phase_1', label: 'Phase 1 (First-in-Human)' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_3', label: 'Phase 3 / Pivotal' },
              { value: 'registration', label: 'Registration / NDA-BLA Filing' },
              { value: 'post_approval', label: 'Post-Approval / Commercial' },
            ],
            helpText: 'The stage of development determines the minimum data required. ICH Q1A(R2) Section 2.2.7 specifies that at least 12 months of long-term data at the time of submission is necessary for registration.',
          },
          {
            id: 'climatic_zone',
            label: 'Target Climatic Zone(s)',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'zone_i', label: 'Zone I — Temperate (21°C / 45% RH)', description: 'Northern Europe, Canada, Russia' },
              { value: 'zone_ii', label: 'Zone II — Subtropical/Mediterranean (25°C / 60% RH)', description: 'USA, Japan, Southern Europe' },
              { value: 'zone_iii', label: 'Zone III — Hot/Dry (30°C / 35% RH)', description: 'Iraq, Sudan' },
              { value: 'zone_iva', label: 'Zone IVa — Hot/Humid (30°C / 65% RH)', description: 'Brazil, Ghana, Philippines' },
              { value: 'zone_ivb', label: 'Zone IVb — Hot/Very Humid (30°C / 75% RH)', description: 'ASEAN countries per ICH Q1F' },
            ],
            helpText: 'ICH Q1F "Stability Data Package for Registration Applications in Climatic Zones III and IV" defines long-term storage conditions by climatic zone. Selecting Zone IVb requires 30°C/75% RH long-term testing.',
          },
        ],
        defaultNext: 'batch_selection',
        provideExpertFeedback: true,
      },

      {
        id: 'batch_selection',
        section: 'stability_overview',
        question:
          'Now let\'s discuss batch selection. ICH Q1A(R2) Section 2.2.1 requires stability data on at least three primary batches for registration. Tell me about the batches you plan to place on stability.',
        guidance:
          'ICH Q1A(R2) Section 2.2.1 specifies that data from stability studies should be provided on at least three primary batches of the drug substance or drug product. For drug substances, the primary batches should be at least pilot scale. For drug products, two of the three batches should be at least pilot scale; the third batch can be smaller if justified. The manufacturing process used for these batches should be representative of the process to be used at production scale.',
        fields: [
          {
            id: 'batch_type',
            label: 'Batch Type',
            type: 'select',
            required: true,
            options: [
              { value: 'pilot', label: 'Pilot Scale', description: 'Typically 1/10th of production scale or 100,000 units, whichever is larger' },
              { value: 'production', label: 'Production / Commercial Scale' },
              { value: 'process_validation', label: 'Process Validation Batches' },
              { value: 'lab_scale', label: 'Laboratory Scale (early development only)' },
            ],
            helpText: 'ICH Q1A(R2) defines pilot scale as a minimum of 1/10th of full production scale, or 100,000 tablets/capsules for solid dosage forms.',
          },
          {
            id: 'number_of_batches',
            label: 'Number of Batches on Stability',
            type: 'number',
            required: true,
            placeholder: 'e.g., 3',
            helpText: 'ICH Q1A(R2) requires a minimum of three primary batches for registration applications. Fewer batches may be acceptable for early development.',
            validation: {
              min: 1,
              max: 50,
            },
          },
          {
            id: 'batch_composition_representative',
            label: 'Are the stability batches representative of the proposed commercial formulation and manufacturing process?',
            type: 'yes_no',
            required: true,
            helpText: 'Batches should use the same synthetic route, method of manufacture, and container closure system as intended for production. Differences must be justified.',
          },
          {
            id: 'container_closure_system',
            label: 'Container Closure System',
            type: 'textarea',
            placeholder: 'e.g., HDPE bottles with child-resistant closure and induction seal; 30 mL Type I glass vials with 20 mm Flurotec-coated butyl rubber stoppers and aluminum flip-off seals',
            required: true,
            helpText: 'ICH Q1A(R2) Section 2.2.2 requires that stability testing be conducted in the container closure system proposed for marketing.',
          },
          {
            id: 'multiple_strengths',
            label: 'Are multiple strengths being developed?',
            type: 'yes_no',
            helpText: 'If yes, matrixing or bracketing designs per ICH Q1D may be applied to reduce the testing burden.',
          },
          {
            id: 'strengths_list',
            label: 'List all strengths under development',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg',
            visibleWhen: {
              field: 'multiple_strengths',
              operator: 'eq',
              value: true,
            },
          },
        ],
        issueChecks: [
          {
            id: 'insufficient_batches',
            condition: { field: 'number_of_batches', operator: 'lt', value: 3 },
            severity: 'critical',
            title: 'Insufficient Batches for Registration',
            message:
              'ICH Q1A(R2) Section 2.2.1 requires stability data on at least three primary batches for registration applications. Fewer than three batches is only acceptable for early-phase development. Regulatory agencies may refuse to file an application with insufficient stability batch data.',
            reference: 'ICH Q1A(R2) Section 2.2.1',
          },
          {
            id: 'non_representative_batches',
            condition: { field: 'batch_composition_representative', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Stability Batches Not Representative of Commercial Process',
            message:
              'The stability batches should be manufactured using the same synthetic route, formulation, and process as the intended commercial product. Non-representative batches may require additional stability studies post-approval or lead to an information request from reviewers.',
            reference: 'ICH Q1A(R2) Section 2.2.1',
          },
        ],
        defaultNext: 'storage_conditions',
        provideExpertFeedback: true,
      },

      /* ================================================================ */
      /*  Section 2 — Study Design                                        */
      /* ================================================================ */

      {
        id: 'storage_conditions',
        section: 'study_design',
        question:
          'What storage conditions are included in your stability protocol? ICH Q1A(R2) defines standard conditions for long-term, intermediate, and accelerated studies. Let me know which conditions you are testing and any additional conditions specific to your product.',
        guidance:
          'ICH Q1A(R2) Section 2.2.7 specifies the following standard conditions:\n\n' +
          '• Long-term: 25°C ± 2°C / 60% RH ± 5% RH (Zone I-II) or 30°C ± 2°C / 65% RH ± 5% RH (Zone III-IVa) or 30°C ± 2°C / 75% RH ± 5% RH (Zone IVb)\n' +
          '• Intermediate: 30°C ± 2°C / 65% RH ± 5% RH\n' +
          '• Accelerated: 40°C ± 2°C / 75% RH ± 5% RH\n\n' +
          'Additional conditions may apply: refrigerated products (5°C ± 3°C), frozen products (-20°C ± 5°C), and products stored below -20°C should follow specific protocols. ICH Q5C provides additional requirements for biologics.',
        fields: [
          {
            id: 'long_term_condition',
            label: 'Long-Term Storage Condition',
            type: 'select',
            required: true,
            options: [
              { value: '25_60', label: '25°C ± 2°C / 60% RH ± 5% RH', description: 'Standard for Zone I-II countries' },
              { value: '30_65', label: '30°C ± 2°C / 65% RH ± 5% RH', description: 'Zone III-IVa countries' },
              { value: '30_75', label: '30°C ± 2°C / 75% RH ± 5% RH', description: 'Zone IVb (ASEAN) countries' },
              { value: '5', label: '5°C ± 3°C', description: 'Refrigerated products' },
              { value: '-20', label: '-20°C ± 5°C', description: 'Frozen products' },
              { value: 'below_-20', label: 'Below -20°C', description: 'Ultra-cold storage (e.g., mRNA vaccines)' },
            ],
          },
          {
            id: 'has_long_term_data',
            label: 'Do you have long-term stability data available?',
            type: 'yes_no',
            required: true,
            helpText: 'At least 12 months of long-term data at the time of submission is required per ICH Q1A(R2) Section 2.2.7.',
          },
          {
            id: 'long_term_data_months',
            label: 'Months of long-term data currently available',
            type: 'number',
            placeholder: 'e.g., 24',
            visibleWhen: {
              field: 'has_long_term_data',
              operator: 'eq',
              value: true,
            },
            validation: {
              min: 0,
              max: 120,
            },
          },
          {
            id: 'intermediate_condition_included',
            label: 'Is an intermediate condition included?',
            type: 'yes_no',
            required: true,
            helpText: '30°C ± 2°C / 65% RH ± 5% RH. This condition is required if significant change occurs during accelerated testing per ICH Q1A(R2) Section 2.2.7.2.',
          },
          {
            id: 'has_accelerated_data',
            label: 'Is accelerated stability testing (40°C ± 2°C / 75% RH ± 5% RH) included?',
            type: 'yes_no',
            required: true,
            helpText: 'Six months of accelerated data is required at the time of submission per ICH Q1A(R2) Section 2.2.7.',
          },
          {
            id: 'accelerated_significant_change',
            label: 'Was significant change observed at the accelerated condition?',
            type: 'select',
            options: [
              { value: 'no_change', label: 'No significant change observed' },
              { value: 'significant_change', label: 'Yes — significant change observed', flagsIssue: true },
              { value: 'not_yet_tested', label: 'Testing not yet completed' },
            ],
            visibleWhen: {
              field: 'has_accelerated_data',
              operator: 'eq',
              value: true,
            },
            helpText: 'ICH Q1A(R2) defines "significant change" as: ≥5% potency loss; exceeding degradation product limits; failing pH, dissolution (12 units), or appearance specifications. Significant change at accelerated triggers the intermediate condition requirement.',
          },
          {
            id: 'additional_conditions',
            label: 'Any additional storage conditions?',
            type: 'multi_select',
            options: [
              { value: 'in_use', label: 'In-Use Stability (after first opening)', description: 'Required for multi-dose containers' },
              { value: 'freeze_thaw', label: 'Freeze-Thaw Cycling' },
              { value: 'thermal_cycling', label: 'Thermal Cycling / Transportation Simulation' },
              { value: 'open_dish', label: 'Open Dish / Stress (humidity sensitivity)' },
              { value: 'reconstituted', label: 'After Reconstitution / Dilution', description: 'Required for lyophilized or concentrated products' },
            ],
            helpText: 'Additional conditions may be warranted based on the dosage form, container closure system, and intended use.',
          },
          {
            id: 'biologic_specific_conditions',
            label: 'Biologic-Specific Storage Considerations',
            type: 'textarea',
            placeholder: 'e.g., Protein aggregation monitoring at agitation/shaking conditions; freeze-thaw impact on higher-order structure; adsorption to container surfaces.',
            visibleWhen: {
              field: 'is_biologic',
              operator: 'eq',
              value: true,
            },
            helpText: 'ICH Q5C requires evaluation of additional stress conditions for biologics including agitation, freeze-thaw, and light exposure. Aggregation and particulate formation are critical quality attributes for protein therapeutics.',
          },
        ],
        issueChecks: [
          {
            id: 'no_accelerated_data',
            condition: { field: 'has_accelerated_data', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Accelerated Stability Data',
            message:
              'ICH Q1A(R2) Section 2.2.7 requires six months of accelerated stability data (40°C/75% RH) at the time of submission. Absence of accelerated data is a significant deficiency that will likely result in a Refuse-to-File or information request from regulatory authorities.',
            reference: 'ICH Q1A(R2) Section 2.2.7',
          },
          {
            id: 'no_long_term_data',
            condition: { field: 'has_long_term_data', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Long-Term Stability Data',
            message:
              'ICH Q1A(R2) Section 2.2.7 requires a minimum of 12 months of long-term stability data at the time of submission. Without long-term data, a shelf life cannot be established and the application will be considered incomplete.',
            reference: 'ICH Q1A(R2) Section 2.2.7',
          },
          {
            id: 'significant_change_at_accelerated',
            condition: { field: 'accelerated_significant_change', operator: 'eq', value: 'significant_change' },
            severity: 'warning',
            title: 'Significant Change at Accelerated Condition',
            message:
              'When significant change occurs during 6 months of accelerated testing, ICH Q1A(R2) Section 2.2.7.2 requires inclusion of data from the intermediate condition (30°C/65% RH) with a minimum 12-month study duration. The shelf-life claim may be limited based on the intermediate data. Ensure your protocol includes intermediate testing.',
            reference: 'ICH Q1A(R2) Section 2.2.7.2',
          },
        ],
        defaultNext: 'study_duration',
        provideExpertFeedback: true,
      },

      {
        id: 'study_duration',
        section: 'study_design',
        question:
          'Let\'s define the study duration and testing intervals. ICH Q1A(R2) specifies minimum durations and recommended time points for each storage condition. What are your planned durations and testing schedules?',
        guidance:
          'ICH Q1A(R2) Section 2.2.7 recommends the following minimum durations at the time of submission:\n\n' +
          '• Long-term: 12 months minimum at time of filing (data through 24-36 months expected for full shelf-life claim)\n' +
          '• Intermediate (if needed): 12 months minimum\n' +
          '• Accelerated: 6 months\n\n' +
          'Standard testing intervals per ICH Q1A(R2) Section 2.2.7.1: every 3 months over the first year, every 6 months over the second year, and annually thereafter through the proposed retest period or shelf life (e.g., 0, 3, 6, 9, 12, 18, 24, 36 months).',
        fields: [
          {
            id: 'long_term_duration_months',
            label: 'Planned Long-Term Study Duration (months)',
            type: 'number',
            required: true,
            placeholder: 'e.g., 36',
            validation: {
              min: 3,
              max: 120,
            },
            helpText: 'Typically 24-36 months for a full shelf-life claim. The proposed shelf life should not exceed the period covered by long-term data, except where extrapolation is justified per ICH Q1E.',
          },
          {
            id: 'accelerated_duration_months',
            label: 'Planned Accelerated Study Duration (months)',
            type: 'number',
            required: true,
            placeholder: 'e.g., 6',
            validation: {
              min: 1,
              max: 12,
            },
            helpText: 'Standard accelerated study duration is 6 months per ICH Q1A(R2).',
          },
          {
            id: 'testing_intervals',
            label: 'Testing Intervals (months)',
            type: 'multi_select',
            required: true,
            options: [
              { value: '0', label: '0 (Initial)' },
              { value: '1', label: '1 month' },
              { value: '2', label: '2 months' },
              { value: '3', label: '3 months' },
              { value: '6', label: '6 months' },
              { value: '9', label: '9 months' },
              { value: '12', label: '12 months' },
              { value: '18', label: '18 months' },
              { value: '24', label: '24 months' },
              { value: '36', label: '36 months' },
              { value: '48', label: '48 months' },
              { value: '60', label: '60 months' },
            ],
            helpText: 'ICH Q1A(R2) recommends: 0, 3, 6, 9, 12, 18, 24, 36 months for long-term studies. For accelerated: 0, 3, 6 months.',
          },
          {
            id: 'proposed_shelf_life_months',
            label: 'Proposed Shelf Life / Retest Period (months)',
            type: 'number',
            placeholder: 'e.g., 24',
            required: true,
            validation: {
              min: 1,
              max: 120,
            },
            helpText: 'For drug substances, this is the retest period. For drug products, this is the shelf life (expiration dating period). Must be supported by available stability data, with extrapolation justified per ICH Q1E if exceeding the period covered by data.',
          },
        ],
        issueChecks: [
          {
            id: 'testing_intervals_non_compliant',
            condition: { field: 'testing_intervals', operator: 'not_in', value: ['0', '3', '6', '9', '12'] },
            severity: 'warning',
            title: 'Testing Intervals May Not Meet ICH Requirements',
            message:
              'ICH Q1A(R2) Section 2.2.7.1 recommends testing at 0, 3, 6, 9, and 12 months for the first year. Deviations from these intervals should be justified in the stability protocol. Missing early time points may limit trend analysis per ICH Q1E.',
            reference: 'ICH Q1A(R2) Section 2.2.7.1',
          },
        ],
        defaultNext: 'reduced_testing',
      },

      {
        id: 'reduced_testing',
        section: 'study_design',
        question:
          'Are you employing any reduced testing designs? ICH Q1D describes matrixing and bracketing approaches that can reduce the total number of samples tested while maintaining statistical validity.',
        guidance:
          'ICH Q1D "Bracketing and Matrixing Designs for Stability Testing of New Drug Substances and Products" provides guidance on reduced designs:\n\n' +
          '• Bracketing: Testing only extreme levels of design factors (e.g., highest and lowest strengths, smallest and largest container sizes). Intermediates are assumed to be covered.\n' +
          '• Matrixing: A statistical fractional factorial design where a subset of all possible factor combinations is tested at each time point.\n\n' +
          'Both approaches require justification that the factors are not expected to interact in a way that would compromise stability assessment. They are generally applicable to long-term and intermediate studies but NOT to accelerated studies.',
        fields: [
          {
            id: 'reduced_design_used',
            label: 'Are you using a reduced testing design (matrixing or bracketing)?',
            type: 'select',
            required: true,
            options: [
              { value: 'none', label: 'No — Full testing at all time points' },
              { value: 'matrixing', label: 'Matrixing Design', description: 'Fractional factorial testing at each time point' },
              { value: 'bracketing', label: 'Bracketing Design', description: 'Testing only extremes of strength/pack size' },
              { value: 'both', label: 'Combined Matrixing and Bracketing' },
            ],
          },
          {
            id: 'reduced_design_factors',
            label: 'Which factors are included in the reduced design?',
            type: 'multi_select',
            visibleWhen: {
              field: 'reduced_design_used',
              operator: 'neq',
              value: 'none',
            },
            options: [
              { value: 'strength', label: 'Strength / Concentration' },
              { value: 'container_size', label: 'Container Size' },
              { value: 'fill_volume', label: 'Fill Volume' },
              { value: 'batch', label: 'Batch' },
              { value: 'time_point', label: 'Time Point (matrixing only)' },
            ],
          },
          {
            id: 'reduced_design_justification',
            label: 'Provide justification for the reduced design',
            type: 'textarea',
            placeholder: 'e.g., Strengths differ only in tablet weight with proportional composition; container closure system is identical across sizes; prior stability data show no interaction between factors.',
            visibleWhen: {
              field: 'reduced_design_used',
              operator: 'neq',
              value: 'none',
            },
            helpText: 'ICH Q1D requires a scientific rationale demonstrating that the factors included in the design are unlikely to interact. Include any prior knowledge or development data that supports the reduced design.',
            validation: {
              minLength: 50,
            },
          },
          {
            id: 'reduced_design_applies_accelerated',
            label: 'Is the reduced design applied to accelerated studies?',
            type: 'yes_no',
            visibleWhen: {
              field: 'reduced_design_used',
              operator: 'neq',
              value: 'none',
            },
            helpText: 'ICH Q1D states that reduced designs should generally NOT be applied to accelerated studies because of the critical nature of the data and the limited number of time points.',
          },
        ],
        defaultNext: 'physical_tests',
      },

      /* ================================================================ */
      /*  Section 3 — Testing Parameters                                  */
      /* ================================================================ */

      {
        id: 'physical_tests',
        section: 'testing_parameters',
        question:
          'What physical tests are included in your stability-indicating testing program? Physical attributes are often the first indicators of instability and should be evaluated at every time point.',
        guidance:
          'ICH Q1A(R2) Section 2.2.4 requires that testing should cover those features susceptible to change during storage and likely to influence quality, safety, and/or efficacy. Physical tests are generally qualitative or semi-quantitative assessments performed at every stability time point. For drug substances, appearance and physical form are primary. For drug products, the tests depend on the dosage form.',
        fields: [
          {
            id: 'appearance_testing',
            label: 'Appearance Testing',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'visual_description', label: 'Visual Description (color, clarity, form)' },
              { value: 'color_measurement', label: 'Instrumental Color Measurement' },
              { value: 'odor', label: 'Odor Assessment' },
              { value: 'particle_inspection', label: 'Particulate Inspection (visible)' },
              { value: 'sub_visible', label: 'Sub-Visible Particulate (USP <788>)' },
            ],
            helpText: 'Appearance should be evaluated at every time point. For injectable products, USP <788> sub-visible particulate testing is typically required.',
          },
          {
            id: 'physical_form_tests',
            label: 'Physical Form / Solid-State Tests',
            type: 'multi_select',
            options: [
              { value: 'xrpd', label: 'X-Ray Powder Diffraction (XRPD)' },
              { value: 'dsc', label: 'Differential Scanning Calorimetry (DSC)' },
              { value: 'polymorphic_form', label: 'Polymorphic Form Identification' },
              { value: 'particle_size', label: 'Particle Size Distribution' },
              { value: 'moisture_content', label: 'Moisture Content (Karl Fischer / LOD)' },
            ],
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['drug_substance', 'intermediate'],
            },
            helpText: 'Polymorphic changes during storage can affect dissolution and bioavailability. ICH Q6A Decision Tree #4 provides guidance on when polymorphic form testing is warranted.',
          },
          {
            id: 'dosage_form_physical_tests',
            label: 'Dosage Form Physical Tests',
            type: 'multi_select',
            options: [
              { value: 'hardness', label: 'Hardness / Breaking Force' },
              { value: 'friability', label: 'Friability' },
              { value: 'disintegration', label: 'Disintegration Time' },
              { value: 'weight_variation', label: 'Weight / Mass Uniformity' },
              { value: 'dissolution', label: 'Dissolution / Drug Release' },
              { value: 'viscosity', label: 'Viscosity' },
              { value: 'ph', label: 'pH' },
              { value: 'specific_gravity', label: 'Specific Gravity / Density' },
              { value: 'redispersibility', label: 'Redispersibility (suspensions)' },
              { value: 'delivered_dose', label: 'Delivered Dose Uniformity (inhalers)' },
              { value: 'aerodynamic_psd', label: 'Aerodynamic Particle Size Distribution (inhalers)' },
              { value: 'adhesion', label: 'Adhesion (transdermal)' },
            ],
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'drug_product',
            },
            helpText: 'Select all physical tests relevant to your dosage form. Dissolution testing is required for solid oral dosage forms. Inhalation products require delivered dose and aerodynamic particle size.',
          },
        ],
        defaultNext: 'chemical_tests',
      },

      {
        id: 'chemical_tests',
        section: 'testing_parameters',
        question:
          'What chemical and purity tests are included? The stability-indicating assay method is the cornerstone of any stability program. Tell me about your assay and degradation product monitoring strategy.',
        guidance:
          'ICH Q1A(R2) Section 2.2.4 emphasizes that a validated, stability-indicating analytical procedure must be used. This method should be capable of detecting changes in the active ingredient content and distinguishing degradation products from the parent compound. Degradation product limits must comply with ICH Q3A(R2) for drug substances and ICH Q3B(R2) for drug products. Reporting, identification, and qualification thresholds depend on maximum daily dose.',
        fields: [
          {
            id: 'assay_method',
            label: 'Assay Method',
            type: 'select',
            required: true,
            options: [
              { value: 'hplc', label: 'HPLC (High Performance Liquid Chromatography)' },
              { value: 'uhplc', label: 'UHPLC (Ultra-High Performance LC)' },
              { value: 'gc', label: 'GC (Gas Chromatography)' },
              { value: 'uv_vis', label: 'UV-Vis Spectrophotometry' },
              { value: 'potentiometric', label: 'Potentiometric Titration' },
              { value: 'ce', label: 'Capillary Electrophoresis' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'The assay method must be validated per ICH Q2(R1) and demonstrated to be stability-indicating through forced degradation studies.',
          },
          {
            id: 'assay_validated',
            label: 'Has the assay method been validated per ICH Q2(R1)?',
            type: 'yes_no',
            required: true,
            helpText: 'Method validation should include specificity, linearity, range, accuracy, precision, detection limit, quantitation limit, and robustness.',
          },
          {
            id: 'stability_indicating_demonstrated',
            label: 'Has the method been demonstrated to be stability-indicating through forced degradation?',
            type: 'yes_no',
            required: true,
            helpText: 'A stability-indicating method resolves the drug from its degradation products. This is typically demonstrated by subjecting the drug to stress conditions (acid, base, oxidation, heat, light) and showing adequate separation of degradants.',
          },
          {
            id: 'degradation_product_monitoring',
            label: 'Degradation Product Monitoring Approach',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'specified_identified', label: 'Specified Identified Degradation Products' },
              { value: 'specified_unidentified', label: 'Specified Unidentified Degradation Products' },
              { value: 'unspecified', label: 'Unspecified Degradation Products (total)' },
              { value: 'total_impurities', label: 'Total Impurities (sum of all degradation products)' },
            ],
            helpText: 'ICH Q3B(R2) requires monitoring of degradation products above reporting thresholds. Thresholds depend on maximum daily dose: reporting ≥0.1% (dose ≤1g/day) or ≥0.05% (dose >1g/day).',
          },
          {
            id: 'moisture_content_test',
            label: 'Is moisture content / water activity tested?',
            type: 'yes_no',
            helpText: 'Particularly important for solid oral dosage forms, lyophilized products, and hygroscopic drug substances.',
          },
          {
            id: 'ph_testing',
            label: 'Is pH tested?',
            type: 'yes_no',
            helpText: 'Required for liquid and semi-solid dosage forms. pH changes can indicate chemical degradation.',
          },
          {
            id: 'biologic_purity_tests',
            label: 'Biologic-Specific Purity Tests',
            type: 'multi_select',
            visibleWhen: {
              field: 'is_biologic',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'sec', label: 'Size-Exclusion Chromatography (SEC) — Aggregation' },
              { value: 'iec', label: 'Ion-Exchange Chromatography (IEC) — Charge Variants' },
              { value: 'ce_sds', label: 'CE-SDS — Fragmentation' },
              { value: 'peptide_mapping', label: 'Peptide Mapping — Post-Translational Modifications' },
              { value: 'glycan_analysis', label: 'Glycan Analysis' },
              { value: 'potency_bioassay', label: 'Potency / Bioassay' },
              { value: 'sub_visible_particles', label: 'Sub-Visible Particles (USP <787>)' },
            ],
            helpText: 'ICH Q5C requires that the stability program for biologics include tests for potency, purity (aggregation, fragmentation, charge variants), and molecular integrity. Potency testing is essential for biologics and must be included at every stability time point.',
          },
        ],
        defaultNext: 'additional_tests',
        provideExpertFeedback: true,
      },

      {
        id: 'additional_tests',
        section: 'testing_parameters',
        question:
          'Are there any additional tests in your stability program? Depending on the product type, microbiological testing, container closure integrity testing, and other specialized tests may be required.',
        guidance:
          'ICH Q1A(R2) Section 2.2.4 notes that the test program should reflect the specific attributes of the product. Microbiological testing is required for non-sterile products (preservative efficacy, microbial limits) and sterile products (sterility testing). Container closure integrity testing (CCIT) is critical for sterile products per USP <1207>. Additional tests may include preservative content, antioxidant levels, extractables/leachables, and reconstitution time.',
        fields: [
          {
            id: 'microbial_testing',
            label: 'Microbiological Testing',
            type: 'multi_select',
            options: [
              { value: 'total_aerobic', label: 'Total Aerobic Microbial Count (TAMC)' },
              { value: 'total_yeast_mold', label: 'Total Yeast and Mold Count (TYMC)' },
              { value: 'specified_organisms', label: 'Specified Organisms (E. coli, Salmonella, etc.)' },
              { value: 'preservative_efficacy', label: 'Preservative Efficacy (Antimicrobial Effectiveness)' },
              { value: 'sterility', label: 'Sterility Testing (USP <71>)' },
              { value: 'endotoxin', label: 'Bacterial Endotoxin (LAL / USP <85>)' },
            ],
            helpText: 'Non-sterile products: microbial limits per USP <61>/<62>. Sterile products: sterility testing per USP <71>. Preserved products: antimicrobial effectiveness per USP <51>.',
          },
          {
            id: 'ccit_included',
            label: 'Is container closure integrity testing (CCIT) included?',
            type: 'yes_no',
            required: true,
            helpText: 'USP <1207> provides guidance on CCIT methods. CCIT is especially critical for sterile products and is increasingly expected by regulators as part of the stability program.',
          },
          {
            id: 'ccit_method',
            label: 'CCIT Method',
            type: 'select',
            visibleWhen: {
              field: 'ccit_included',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'helium_leak', label: 'Helium Leak Detection' },
              { value: 'vacuum_decay', label: 'Vacuum Decay' },
              { value: 'high_voltage_leak', label: 'High Voltage Leak Detection (HVLD)' },
              { value: 'dye_ingress', label: 'Dye Ingress (microbial challenge)' },
              { value: 'headspace_analysis', label: 'Headspace Gas Analysis' },
              { value: 'other', label: 'Other Method' },
            ],
          },
          {
            id: 'extractables_leachables',
            label: 'Are extractables/leachables studies included?',
            type: 'yes_no',
            helpText: 'Extractables and leachables from the container closure system should be evaluated, especially for inhalation products, parenteral products, and ophthalmic preparations per FDA and PQRI guidelines.',
          },
          {
            id: 'preservative_content',
            label: 'Is preservative content monitored?',
            type: 'yes_no',
            helpText: 'Required for multi-dose products containing preservatives. Both preservative content and antimicrobial effectiveness may need to be evaluated.',
          },
          {
            id: 'reconstitution_time',
            label: 'Is reconstitution time evaluated?',
            type: 'yes_no',
            visibleWhen: {
              field: 'dosage_form',
              operator: 'in',
              value: ['lyophilized'],
            },
            helpText: 'For lyophilized products, reconstitution time at each stability time point should be monitored as an increase may indicate structural changes in the lyophilized cake.',
          },
          {
            id: 'forced_degradation_completed',
            label: 'Have forced degradation / stress testing studies been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Forced degradation studies (ICH Q1A(R2) Section 2.1.2 for drug substances; Section 2.2.3 for drug products) are essential for demonstrating the stability-indicating power of the analytical method and understanding degradation pathways.',
          },
          {
            id: 'forced_degradation_conditions',
            label: 'Forced Degradation Conditions Evaluated',
            type: 'multi_select',
            visibleWhen: {
              field: 'forced_degradation_completed',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'acid', label: 'Acid Hydrolysis (e.g., 0.1N HCl)' },
              { value: 'base', label: 'Base Hydrolysis (e.g., 0.1N NaOH)' },
              { value: 'oxidation', label: 'Oxidation (e.g., 3% H2O2)' },
              { value: 'thermal', label: 'Thermal Stress (e.g., 60-80°C)' },
              { value: 'photolysis', label: 'Photolysis (ICH Q1B conditions)' },
              { value: 'humidity', label: 'Humidity Stress (e.g., 75% RH open dish)' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_forced_degradation',
            condition: { field: 'forced_degradation_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Forced Degradation Studies Completed',
            message:
              'Forced degradation studies are essential for understanding degradation pathways, establishing the stability-indicating nature of the analytical method, and identifying potential degradation products. ICH Q1A(R2) Sections 2.1.2 and 2.2.3 describe stress testing requirements for drug substances and drug products, respectively.',
            reference: 'ICH Q1A(R2) Sections 2.1.2, 2.2.3',
          },
        ],
        defaultNext: 'photostability_design',
      },

      /* ================================================================ */
      /*  Section 4 — Photostability                                      */
      /* ================================================================ */

      {
        id: 'photostability_design',
        section: 'photostability',
        question:
          'Has a photostability study been conducted per ICH Q1B? Photostability testing is required for new drug substances and drug products to determine whether light exposure affects stability and whether light-protective packaging is needed.',
        guidance:
          'ICH Q1B "Photostability Testing of New Drug Substances and Products" requires a two-part approach:\n\n' +
          '1. Forced degradation (stress) testing to evaluate the inherent photostability of the drug substance.\n' +
          '2. Confirmatory testing to verify that the overall exposure (including packaging) is acceptable.\n\n' +
          'The confirmatory study must use either Option 1 (xenon or metal halide lamp simulating indoor daylight) or Option 2 (cool white fluorescent lamp + near-UV lamp). The minimum exposure is 1.2 million lux hours of visible light and 200 W·h/m² of near-UV energy.',
        fields: [
          {
            id: 'photostability_conducted',
            label: 'Has a photostability study per ICH Q1B been conducted?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'photostability_light_source',
            label: 'Light Source Used (Confirmatory Study)',
            type: 'select',
            visibleWhen: {
              field: 'photostability_conducted',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'option_1_xenon', label: 'Option 1 — Xenon Lamp', description: 'Simulates outdoor/indoor daylight; filter to remove wavelengths <320 nm' },
              { value: 'option_1_metal_halide', label: 'Option 1 — Metal Halide Lamp' },
              { value: 'option_2', label: 'Option 2 — Cool White Fluorescent + Near-UV Lamp', description: 'Fluorescent (ISO 10977) + UV-A lamp (320-400 nm)' },
            ],
            helpText: 'Both options require exposure to not less than 1.2 million lux hours of visible light and an integrated near-UV energy of not less than 200 W·h/m².',
          },
          {
            id: 'photostability_samples_tested',
            label: 'Which samples were tested?',
            type: 'multi_select',
            visibleWhen: {
              field: 'photostability_conducted',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'ds_exposed', label: 'Drug Substance — Directly Exposed' },
              { value: 'dp_exposed', label: 'Drug Product — Directly Exposed (no packaging)' },
              { value: 'dp_immediate', label: 'Drug Product — In Immediate Container' },
              { value: 'dp_marketing', label: 'Drug Product — In Marketing Package' },
            ],
            helpText: 'ICH Q1B Section IV recommends sequential testing: test first with the full marketing pack; if results are acceptable, no further testing is needed. If not, test with the immediate container, then directly exposed.',
          },
          {
            id: 'photostability_dark_control',
            label: 'Were dark controls (wrapped in aluminum foil) included alongside exposed samples?',
            type: 'yes_no',
            visibleWhen: {
              field: 'photostability_conducted',
              operator: 'eq',
              value: true,
            },
            helpText: 'ICH Q1B requires that dark controls be placed alongside the photostability samples to distinguish between thermal effects and light-induced changes.',
          },
        ],
        issueChecks: [
          {
            id: 'no_photostability',
            condition: { field: 'photostability_conducted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Photostability Study Conducted',
            message:
              'ICH Q1B requires photostability testing for new drug substances and drug products. Without photostability data, regulators cannot assess whether light-protective packaging or storage conditions are needed. This is a common deficiency cited in regulatory reviews.',
            reference: 'ICH Q1B',
          },
        ],
        defaultNext: 'photostability_results',
      },

      {
        id: 'photostability_results',
        section: 'photostability',
        question:
          'What were the results of the photostability study? Did the product demonstrate acceptable photostability, or is light-protective packaging required?',
        guidance:
          'ICH Q1B Section IV.C states that if significant change is observed in the directly exposed drug product, the confirmatory study should test the product in its immediate container and marketing package. If the product is photolabile, light-protective packaging (e.g., amber glass, opaque overwrap, aluminum foil) must be used and the labeled storage conditions must include a light-protection statement.',
        fields: [
          {
            id: 'photostability_result_summary',
            label: 'Overall Photostability Result',
            type: 'select',
            required: true,
            options: [
              { value: 'stable', label: 'Photostable — No significant change observed' },
              { value: 'protected_by_packaging', label: 'Photolabile but adequately protected by packaging' },
              { value: 'requires_protection', label: 'Photolabile — Requires light-protective packaging or labeling' },
              { value: 'not_tested', label: 'Not yet tested' },
            ],
          },
          {
            id: 'light_protection_measures',
            label: 'Light Protection Measures Implemented',
            type: 'multi_select',
            visibleWhen: {
              field: 'photostability_result_summary',
              operator: 'in',
              value: ['protected_by_packaging', 'requires_protection'],
            },
            options: [
              { value: 'amber_glass', label: 'Amber Glass Container' },
              { value: 'opaque_container', label: 'Opaque Container (HDPE, aluminum)' },
              { value: 'aluminum_overwrap', label: 'Aluminum Foil Overwrap' },
              { value: 'carton', label: 'Secondary Carton Packaging' },
              { value: 'label_statement', label: '"Protect from Light" Label Statement' },
            ],
          },
          {
            id: 'photostability_degradation_products',
            label: 'Were any unique photodegradation products identified?',
            type: 'yes_no',
            helpText: 'Unique photodegradation products not observed under other stress conditions may require qualification per ICH Q3B(R2) if present above qualification thresholds.',
          },
          {
            id: 'photostability_notes',
            label: 'Additional Photostability Observations',
            type: 'textarea',
            placeholder: 'e.g., Slight yellowing of tablets on direct exposure, fully prevented by blister and carton packaging. No new degradation products observed.',
          },
        ],
        defaultNext: 'statistical_analysis',
      },

      /* ================================================================ */
      /*  Section 5 — Data Analysis                                       */
      /* ================================================================ */

      {
        id: 'statistical_analysis',
        section: 'data_analysis',
        question:
          'How are you analyzing your stability data? ICH Q1E provides a systematic approach to evaluating stability data for shelf-life estimation, including poolability assessment, regression analysis, and criteria for statistical significance.',
        guidance:
          'ICH Q1E "Evaluation of Stability Data" outlines a systematic approach:\n\n' +
          '1. Assess whether data from multiple batches can be pooled using analysis of covariance (ANCOVA) to test for differences in slopes and intercepts.\n' +
          '2. If batches can be pooled, estimate the shelf life from the combined data. If not, use the shortest individual batch estimate.\n' +
          '3. Regression analysis: determine the time at which the 95% one-sided confidence limit for the mean curve intersects the acceptance criterion.\n' +
          '4. Extrapolation beyond the period covered by long-term data may be possible if supported by accelerated data showing no significant change.',
        fields: [
          {
            id: 'statistical_approach',
            label: 'Statistical Analysis Approach',
            type: 'select',
            required: true,
            options: [
              { value: 'ich_q1e', label: 'ICH Q1E Regression Analysis', description: 'Standard approach: ANCOVA for poolability, linear regression for shelf-life estimation' },
              { value: 'descriptive', label: 'Descriptive Statistics Only (early phase)', description: 'Summary statistics without formal regression — acceptable for Phase 1-2' },
              { value: 'advanced', label: 'Advanced Statistical Modeling', description: 'Random coefficient models, Bayesian approaches, or other advanced methods' },
            ],
            helpText: 'ICH Q1E is the standard approach for registration applications. Descriptive approaches may be acceptable for early-phase programs but insufficient for NDA/BLA submission.',
          },
          {
            id: 'pooling_assessment',
            label: 'Has batch poolability been assessed per ICH Q1E?',
            type: 'select',
            options: [
              { value: 'pooled', label: 'Yes — Batches can be pooled (no significant differences)' },
              { value: 'not_pooled', label: 'No — Batches show significant differences, analyzed individually' },
              { value: 'not_assessed', label: 'Not yet assessed' },
            ],
            helpText: 'ICH Q1E Section 3.1: Use ANCOVA to test equality of slopes and intercepts at α = 0.25. If p > 0.25 for both, data can be pooled.',
          },
          {
            id: 'regression_model',
            label: 'Regression Model',
            type: 'select',
            options: [
              { value: 'linear', label: 'Linear (attribute = a + b × time)' },
              { value: 'quadratic', label: 'Quadratic (attribute = a + b × time + c × time²)' },
              { value: 'log_linear', label: 'Log-Linear (ln(attribute) = a + b × time)' },
              { value: 'square_root', label: 'Square Root (attribute = a + b × √time)' },
            ],
            helpText: 'ICH Q1E states that the relationship between the attribute and time may be linear or nonlinear. Select the model that best fits the observed data. If in doubt, start with a linear model.',
          },
          {
            id: 'significant_change_criteria',
            label: 'Significant Change Criteria Applied',
            type: 'textarea',
            placeholder: 'e.g., ≥5% change in assay from initial value; any specified degradation product exceeding its limit; failure to meet dissolution specification (Q); pH change >0.5 unit.',
            helpText: 'ICH Q1A(R2) Section 2.2.7 defines "significant change" criteria. These criteria are used to determine whether accelerated data are acceptable and whether intermediate testing is triggered.',
            validation: {
              minLength: 20,
            },
          },
        ],
        defaultNext: 'shelf_life_estimation',
        provideExpertFeedback: true,
      },

      {
        id: 'shelf_life_estimation',
        section: 'data_analysis',
        question:
          'How is the proposed shelf life or retest period being determined? ICH Q1E allows extrapolation beyond available long-term data under specific circumstances. Let me understand your approach.',
        guidance:
          'ICH Q1E Section 4 addresses extrapolation:\n\n' +
          '• Extrapolation may be used when long-term data show little to no change or variability, and accelerated data show no significant change.\n' +
          '• The proposed shelf life should not exceed the available long-term data by more than 2× (e.g., 12 months data → maximum 24 months shelf-life claim).\n' +
          '• For drug substances, a retest period rather than an expiration date is assigned.\n' +
          '• For drug products, an expiration date is assigned.',
        fields: [
          {
            id: 'extrapolation_used',
            label: 'Is extrapolation beyond available long-term data being used?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1E permits limited extrapolation when justified by the stability profile. The extrapolated period should generally not exceed twice the period covered by long-term data.',
          },
          {
            id: 'extrapolation_justification',
            label: 'Justification for Extrapolation',
            type: 'textarea',
            placeholder: 'e.g., 18 months of long-term data show <1% assay decline with no trend; accelerated data (6 months) show no significant change; all degradation products well within limits; linear regression with 95% CI supports a 36-month shelf life.',
            visibleWhen: {
              field: 'extrapolation_used',
              operator: 'eq',
              value: true,
            },
            helpText: 'Provide a scientific rationale including: (1) the stability trend observed, (2) absence of significant change at accelerated conditions, (3) the statistical basis for the extrapolation, and (4) the proposed shelf life relative to available data.',
            validation: {
              minLength: 50,
            },
          },
          {
            id: 'extrapolation_ratio',
            label: 'Ratio of proposed shelf life to available long-term data',
            type: 'select',
            visibleWhen: {
              field: 'extrapolation_used',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'within_data', label: '≤1× (shelf life within data coverage)' },
              { value: '1_to_1.5x', label: '1-1.5× available data' },
              { value: '1.5_to_2x', label: '1.5-2× available data' },
              { value: 'over_2x', label: '>2× available data', flagsIssue: true },
            ],
            helpText: 'ICH Q1E limits extrapolation to generally no more than twice the period covered by long-term data. Extrapolation beyond 2× requires exceptional justification.',
          },
          {
            id: 'retest_vs_expiry',
            label: 'Assignment Type',
            type: 'select',
            required: true,
            options: [
              { value: 'retest_period', label: 'Retest Period (drug substance)', description: 'The period during which the drug substance can be considered to remain within specification if stored correctly, after which it should be re-examined' },
              { value: 'expiration_date', label: 'Expiration Date / Shelf Life (drug product)', description: 'The date beyond which the drug product should not be used' },
            ],
            helpText: 'ICH Q1A(R2) distinguishes between retest periods (drug substances) and shelf lives / expiration dates (drug products).',
          },
        ],
        issueChecks: [
          {
            id: 'extrapolation_without_justification',
            condition: { field: 'extrapolation_used', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Extrapolation Requires Justification per ICH Q1E',
            message:
              'Extrapolation beyond available long-term data must be scientifically justified per ICH Q1E Section 4. The proposed shelf life should generally not exceed twice the period covered by long-term data. Ensure adequate justification is documented, including statistical analysis showing minimal degradation trend, no significant change at accelerated conditions, and no changes in degradation profile.',
            reference: 'ICH Q1E Section 4',
          },
          {
            id: 'drug_substance_without_retest',
            condition: { field: 'retest_vs_expiry', operator: 'eq', value: 'expiration_date' },
            severity: 'warning',
            title: 'Drug Substance: Consider Retest Period Instead of Expiration Date',
            message:
              'ICH Q1A(R2) Section 2.1.4 states that a retest period, rather than an expiration date, should be assigned to drug substances. If your product is a drug substance, consider whether a retest period is more appropriate. A retest period allows the material to be retested and, if still within specifications, continued in use.',
            reference: 'ICH Q1A(R2) Section 2.1.4',
          },
        ],
        defaultNext: 'oos_investigation',
      },

      {
        id: 'oos_investigation',
        section: 'data_analysis',
        question:
          'Have there been any out-of-specification (OOS) or out-of-trend (OOT) results during the stability program? Stability failures and trend deviations require formal investigation and may have significant regulatory implications.',
        guidance:
          'FDA Guidance "Investigating Out-of-Specification (OOS) Test Results for Pharmaceutical Production" (2006) outlines the required investigation process. Stability OOS results are particularly consequential because they may trigger product recalls, require regulatory notification, and affect the approved shelf life. Out-of-trend (OOT) results, while not necessarily OOS, should be investigated to determine if they represent a true stability trend or an analytical artifact.',
        fields: [
          {
            id: 'oos_results_observed',
            label: 'Have any OOS results been observed in the stability program?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'oos_investigation_summary',
            label: 'OOS Investigation Summary',
            type: 'textarea',
            placeholder: 'e.g., One OOS result for dissolution at 24 months for Batch 3 (Q = 73% vs. specification ≥75%). Phase I investigation confirmed no laboratory error. Phase II investigation identified a trend in dissolution decline attributable to cross-linking of the film coating.',
            visibleWhen: {
              field: 'oos_results_observed',
              operator: 'eq',
              value: true,
            },
            validation: {
              minLength: 50,
            },
          },
          {
            id: 'oot_monitoring',
            label: 'Is out-of-trend (OOT) analysis performed?',
            type: 'yes_no',
            required: true,
            helpText: 'Proactive OOT monitoring (e.g., regression-based limits, control charts) can identify stability issues before OOS results occur.',
          },
          {
            id: 'oot_method',
            label: 'OOT Detection Method',
            type: 'select',
            visibleWhen: {
              field: 'oot_monitoring',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'regression_limits', label: 'Regression-Based Limits (prediction intervals)' },
              { value: 'control_charts', label: 'Control Charts (Shewhart / CUSUM)' },
              { value: 'tolerance_intervals', label: 'Tolerance Intervals' },
              { value: 'visual_trending', label: 'Visual Trending / Manual Review' },
              { value: 'other', label: 'Other Statistical Method' },
            ],
          },
          {
            id: 'trend_analysis_approach',
            label: 'Trend Analysis Approach',
            type: 'textarea',
            placeholder: 'e.g., All stability attributes are trended graphically and by regression analysis after each stability pull. Any result deviating from the predicted value by more than 2× the residual standard error triggers an OOT investigation.',
            helpText: 'Describe how stability data are routinely reviewed for trends and how deviations are identified and investigated.',
          },
        ],
        defaultNext: 'post_approval_commitment',
      },

      /* ================================================================ */
      /*  Section 6 — Regulatory Submission                               */
      /* ================================================================ */

      {
        id: 'post_approval_commitment',
        section: 'regulatory_submission',
        question:
          'What post-approval stability commitments are planned? Regulatory authorities expect ongoing stability monitoring after approval to confirm the shelf life throughout the product lifecycle.',
        guidance:
          'ICH Q1A(R2) Section 2.2.8 states that a post-approval stability protocol and commitment should be provided in the registration application. The commitment typically includes placing at least one production batch per year (or per strength, per manufacturing site) on long-term stability through the approved shelf life. For FDA, 21 CFR 211.166 requires a written testing program for assessing the stability characteristics of drug products. Annual stability data are reviewed during cGMP inspections.',
        fields: [
          {
            id: 'post_approval_protocol_submitted',
            label: 'Is a post-approval stability protocol included in the submission?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1A(R2) Section 2.2.8 expects the post-approval stability protocol to be described in the CTD Module 3.2.P.8.3 (drug product) or 3.2.S.7.3 (drug substance).',
          },
          {
            id: 'annual_batches',
            label: 'Number of annual stability batches committed',
            type: 'number',
            placeholder: 'e.g., 1',
            helpText: 'A commitment of at least one batch per year per strength per manufacturing site is standard. Some markets may require more.',
            validation: {
              min: 0,
              max: 20,
            },
          },
          {
            id: 'ongoing_stability_conditions',
            label: 'Storage conditions for ongoing stability',
            type: 'multi_select',
            options: [
              { value: 'long_term', label: 'Long-Term Condition (as approved)' },
              { value: 'accelerated', label: 'Accelerated Condition' },
              { value: 'intermediate', label: 'Intermediate Condition' },
            ],
            helpText: 'Post-approval stability is typically conducted at the long-term storage condition through the approved shelf life. Accelerated or intermediate conditions may be included based on risk.',
          },
          {
            id: 'stability_data_ctd_location',
            label: 'CTD Module Location for Stability Data',
            type: 'select',
            options: [
              { value: 'p_8', label: 'Module 3.2.P.8 — Stability (Drug Product)' },
              { value: 's_7', label: 'Module 3.2.S.7 — Stability (Drug Substance)' },
              { value: 'both', label: 'Both S.7 and P.8' },
            ],
            helpText: 'Stability data are filed in CTD Module 3 (Quality). Drug substance stability goes in S.7; drug product stability goes in P.8.',
          },
        ],
        issueChecks: [
          {
            id: 'no_post_approval_commitment',
            condition: { field: 'post_approval_protocol_submitted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Post-Approval Stability Commitment',
            message:
              'ICH Q1A(R2) Section 2.2.8 expects a post-approval stability protocol and stability commitment to be included in the registration application. Absence of a post-approval stability commitment may result in an information request from reviewers and is considered a significant gap in the quality overall summary.',
            reference: 'ICH Q1A(R2) Section 2.2.8; 21 CFR 211.166',
          },
        ],
        defaultNext: 'stability_protocol_changes',
      },

      {
        id: 'stability_protocol_changes',
        section: 'regulatory_submission',
        question:
          'Are there any anticipated changes to the stability protocol post-approval? Changes in manufacturing process, formulation, container closure system, or manufacturing site may require additional stability studies to demonstrate comparability.',
        guidance:
          'Post-approval changes are governed by FDA Guidance "Changes to an Approved NDA or ANDA" (SUPAC guidance series), ICH Q5E (Comparability of Biotechnological/Biological Products), and regional regulatory requirements. Changes are categorized by risk level (minor, moderate, major), and each category has specific stability data requirements. A Prior Approval Supplement (PAS) typically requires stability data on at least one batch, while a Changes Being Effected (CBE-30) supplement may require data to be generated post-submission.',
        fields: [
          {
            id: 'anticipated_changes',
            label: 'Are post-approval manufacturing or formulation changes anticipated?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'change_types',
            label: 'Types of Anticipated Changes',
            type: 'multi_select',
            visibleWhen: {
              field: 'anticipated_changes',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'site_change', label: 'Manufacturing Site Change' },
              { value: 'process_change', label: 'Manufacturing Process Change' },
              { value: 'formulation_change', label: 'Formulation Change (excipients)' },
              { value: 'container_change', label: 'Container Closure System Change' },
              { value: 'batch_size_change', label: 'Batch Size Change (scale-up/scale-down)' },
              { value: 'specification_change', label: 'Specification Change' },
              { value: 'analytical_method_change', label: 'Analytical Method Change' },
            ],
          },
          {
            id: 'comparability_protocol',
            label: 'Is a comparability protocol included?',
            type: 'yes_no',
            visibleWhen: {
              field: 'anticipated_changes',
              operator: 'eq',
              value: true,
            },
            helpText: 'A comparability protocol (21 CFR 314.70(a)) pre-defines the stability testing required for a future change, allowing streamlined regulatory review when the change is implemented.',
          },
          {
            id: 'comparability_stability_plan',
            label: 'Stability Testing Plan for Comparability',
            type: 'textarea',
            placeholder: 'e.g., Three batches from the new manufacturing site will be placed on 6-month accelerated and 12-month long-term stability studies. Results will be compared to historical stability data from the original site.',
            visibleWhen: {
              field: 'comparability_protocol',
              operator: 'eq',
              value: true,
            },
          },
        ],
        defaultNext: 'stability_failures',
      },

      {
        id: 'stability_failures',
        section: 'regulatory_submission',
        question:
          'Finally, let\'s address stability failure notification and contingency planning. Confirmed stability failures can trigger regulatory actions including field alerts, recalls, and revisions to the approved shelf life. Do you have processes in place?',
        guidance:
          'FDA Field Alert Reports (21 CFR 314.81(b)(1)) must be submitted within three working days when a distributed batch fails to meet its stability specifications. For biologics, 21 CFR 600.14 requires notification of any deviation that may affect product safety, purity, or potency. EMA requires notification of quality defects under Commission Delegated Regulation (EU) 2016/161. A confirmed stability failure at any time point within the approved shelf life is a critical quality event requiring immediate risk assessment, potential field action, and root cause investigation.',
        fields: [
          {
            id: 'stability_failure_sop',
            label: 'Is there an SOP for handling stability failures?',
            type: 'yes_no',
            required: true,
            helpText: 'An SOP should define roles and responsibilities, investigation timelines, decision trees for escalation, field alert report procedures, and communication with regulatory authorities.',
          },
          {
            id: 'field_alert_process',
            label: 'Is a process in place for FDA Field Alert Reports?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 314.81(b)(1), a field alert report must be submitted within 3 working days of a confirmed stability failure on a distributed batch.',
          },
          {
            id: 'prior_stability_failures',
            label: 'Have there been any stability failures in the development program?',
            type: 'yes_no',
          },
          {
            id: 'prior_failure_details',
            label: 'Details of Prior Stability Failures',
            type: 'textarea',
            placeholder: 'e.g., One pilot batch (Batch P-003) failed dissolution specification at 36 months at long-term conditions. Root cause: excipient incompatibility leading to cross-linked film coat. Reformulation implemented in registration batches.',
            visibleWhen: {
              field: 'prior_stability_failures',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'recall_contingency',
            label: 'Is a recall contingency plan in place for stability-related failures post-launch?',
            type: 'yes_no',
            helpText: 'A recall plan should be documented and tested through mock recalls. The plan should address risk classification (21 CFR 7.41), depth of recall, and communication to healthcare providers and patients.',
          },
          {
            id: 'shelf_life_reduction_strategy',
            label: 'What is the strategy if stability data require a shelf-life reduction?',
            type: 'textarea',
            placeholder: 'e.g., A shelf-life reduction will be communicated to regulators via a CBE-30 supplement and to downstream customers within 5 business days. Inventory impact assessment will be conducted.',
            helpText: 'Planning for potential shelf-life reductions ensures business continuity and regulatory compliance.',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
      },
    ],
  };
}
