/**
 * Stability Study flow definition for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through stability study design and reporting
 * per ICH Q1A-Q1F, covering product and formulation overview, study design and
 * conditions, testing schedule and parameters, data analysis and shelf-life
 * determination, and post-approval commitments.
 *
 * ~14 nodes · 60+ fields · 5 sections · 10+ issue checks
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
      'Stability study design and reporting questionnaire per ICH Q1A-Q1F, covering product and formulation overview, study design and conditions, testing schedule and parameters, data analysis and shelf-life determination, and commitments and post-approval obligations.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'product_formulation',
    estimatedMinutes: 35,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'product_formulation_overview',
        label: 'Product & Formulation Overview',
        nodeIds: ['product_formulation', 'batch_selection', 'container_closure'],
      },
      {
        id: 'study_design_conditions',
        label: 'Study Design & Conditions',
        nodeIds: ['storage_conditions', 'climatic_zone_branching', 'biologics_stability'],
      },
      {
        id: 'testing_schedule_parameters',
        label: 'Testing Schedule & Parameters',
        nodeIds: ['testing_schedule', 'analytical_methods', 'photostability'],
      },
      {
        id: 'data_analysis_shelf_life',
        label: 'Data Analysis & Shelf Life',
        nodeIds: ['statistical_analysis', 'shelf_life_determination', 'forced_degradation'],
      },
      {
        id: 'commitments_post_approval',
        label: 'Commitments & Post-Approval',
        nodeIds: ['post_approval_stability', 'protocol_changes', 'stability_failures'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Product & Formulation Overview                      */
      /* ================================================================ */

      {
        id: 'product_formulation',
        section: 'product_formulation_overview',
        question:
          'Let\'s begin your stability study design. Tell me about the product, its formulation, and the current development stage. The product type and dosage form will determine the scope of the stability program required under ICH Q1A(R2).',
        guidance:
          'ICH Q1A(R2) Section 1 establishes that stability testing is required for drug substances and drug products to determine their retest period or shelf life under defined storage conditions. The scope of the stability program depends on the development stage: early clinical studies may use abbreviated protocols, while registration applications require formal, long-term data on at least three primary batches. ICH Q1A(R2) Section 2.1 further distinguishes requirements for drug substances versus drug products. For biological/biotechnological products, ICH Q5C imposes additional requirements including potency, aggregation, and higher-order structure monitoring.',
        provideExpertFeedback: true,
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
            helpText: 'Biologics are subject to additional requirements under ICH Q5C "Quality of Biotechnological Products: Stability Testing." These include potency bioassays and considerations for protein aggregation, deamidation, oxidation, and higher-order structure changes.',
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
            id: 'formulation_description',
            label: 'Formulation Description',
            type: 'textarea',
            placeholder: 'e.g., Immediate-release film-coated tablet containing 50 mg active with microcrystalline cellulose, croscarmellose sodium, magnesium stearate, and Opadry II coating.',
            required: true,
            helpText: 'Provide a brief description of the formulation including key excipients. Excipient compatibility data should inform the stability-indicating test program.',
          },
        ],
        branches: [
          {
            when: { field: 'product_type', operator: 'eq', value: 'drug_substance' },
            goto: 'batch_selection',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'drug_product' },
            goto: 'batch_selection',
          },
        ],
        defaultNext: 'batch_selection',
      },

      {
        id: 'batch_selection',
        section: 'product_formulation_overview',
        question:
          'Now let\'s discuss batch selection. ICH Q1A(R2) Section 2.2.1 requires stability data on at least three primary batches for registration. Tell me about the batches you plan to place on stability and their manufacturing representativeness.',
        guidance:
          'ICH Q1A(R2) Section 2.2.1 specifies that data from stability studies should be provided on at least three primary batches of the drug substance or drug product. For drug substances, the primary batches should be at least pilot scale. For drug products, two of the three batches should be at least pilot scale; the third batch can be smaller if justified. The manufacturing process used for these batches should simulate that to be used at production scale and provide product of the same quality and meeting the same specification as intended for marketing.',
        provideExpertFeedback: true,
        fields: [
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
            id: 'batch_composition_representative',
            label: 'Are the stability batches representative of the proposed commercial formulation and manufacturing process?',
            type: 'yes_no',
            required: true,
            helpText: 'Batches should use the same synthetic route, method of manufacture, and container closure system as intended for production. Differences must be justified.',
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
          {
            id: 'reduced_design_used',
            label: 'Are you using a reduced testing design (matrixing or bracketing)?',
            type: 'select',
            required: true,
            options: [
              { value: 'none', label: 'No — Full testing at all time points' },
              { value: 'matrixing', label: 'Matrixing Design (ICH Q1D)', description: 'Fractional factorial testing at each time point' },
              { value: 'bracketing', label: 'Bracketing Design (ICH Q1D)', description: 'Testing only extremes of strength/pack size' },
              { value: 'both', label: 'Combined Matrixing and Bracketing' },
            ],
            helpText: 'ICH Q1D describes matrixing and bracketing approaches that can reduce the total number of samples tested while maintaining statistical validity. These designs should generally NOT be applied to accelerated studies.',
          },
        ],
        issueChecks: [
          {
            id: 'insufficient_batches',
            condition: { field: 'number_of_batches', operator: 'lt', value: 3 },
            severity: 'critical',
            title: 'Insufficient Batches for Registration Filing',
            message:
              'ICH Q1A(R2) Section 2.2.1 requires stability data on at least three primary batches for registration applications. Fewer than three batches is only acceptable for early-phase development. Regulatory agencies (FDA, EMA, PMDA) may refuse to file an application with insufficient stability batch data.',
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
        defaultNext: 'container_closure',
      },

      {
        id: 'container_closure',
        section: 'product_formulation_overview',
        question:
          'Describe the container closure system used for the stability studies. ICH Q1A(R2) Section 2.2.2 requires that stability testing be conducted in the container closure system proposed for marketing.',
        guidance:
          'The container closure system is integral to the stability profile of the product. ICH Q1A(R2) Section 2.2.2 requires stability testing in the marketed container closure system. For semi-permeable containers (e.g., LDPE bags for parenterals), additional studies at low humidity may be needed per FDA Guidance for Industry "Container Closure System Guidance for Human Drug Products." Container closure integrity testing (CCIT) per USP <1207> is critical for sterile products and should be part of the stability protocol.',
        fields: [
          {
            id: 'container_closure_description',
            label: 'Container Closure System Description',
            type: 'textarea',
            placeholder: 'e.g., HDPE bottles with child-resistant closure and induction seal; 30 mL Type I glass vials with 20 mm Flurotec-coated butyl rubber stoppers and aluminum flip-off seals',
            required: true,
            helpText: 'ICH Q1A(R2) Section 2.2.2 requires that stability testing be conducted in the container closure system proposed for marketing.',
          },
          {
            id: 'ccit_included',
            label: 'Is container closure integrity testing (CCIT) included in the stability protocol?',
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
            label: 'Are extractables/leachables studies planned or completed?',
            type: 'yes_no',
            helpText: 'Extractables and leachables from the container closure system should be evaluated, especially for inhalation products, parenteral products, and ophthalmic preparations per FDA and PQRI guidelines.',
          },
          {
            id: 'multiple_container_sizes',
            label: 'Are multiple container sizes being marketed?',
            type: 'yes_no',
            helpText: 'If yes, stability testing on all sizes or a bracketing design per ICH Q1D should be considered.',
          },
        ],
        issueChecks: [
          {
            id: 'no_ccit',
            condition: { field: 'ccit_included', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Container Closure Integrity Not Tested',
            message:
              'Container closure integrity testing (CCIT) per USP <1207> is expected as part of the stability program, particularly for sterile products. Absence of CCIT data may lead to a deficiency letter during regulatory review. For non-sterile products, CCIT may still be warranted to demonstrate protection from moisture or oxygen ingress.',
            reference: 'USP <1207>; ICH Q1A(R2) Section 2.2.2',
          },
        ],
        defaultNext: 'storage_conditions',
      },

      /* ================================================================ */
      /*  Section 2 — Study Design & Conditions                           */
      /* ================================================================ */

      {
        id: 'storage_conditions',
        section: 'study_design_conditions',
        question:
          'What storage conditions are included in your stability protocol? ICH Q1A(R2) defines standard conditions for long-term, intermediate, and accelerated studies. The choice depends on the product type and the climatic zones where you intend to market.',
        guidance:
          'ICH Q1A(R2) Section 2.2.7 specifies the following standard conditions:\n\n' +
          '- Long-term: 25 +/- 2 C / 60% +/- 5% RH (Zone I-II) or 30 +/- 2 C / 65% +/- 5% RH (Zone III-IVa) or 30 +/- 2 C / 75% +/- 5% RH (Zone IVb per ICH Q1F)\n' +
          '- Intermediate: 30 +/- 2 C / 65% +/- 5% RH\n' +
          '- Accelerated: 40 +/- 2 C / 75% +/- 5% RH\n\n' +
          'Additional conditions apply for refrigerated products (5 +/- 3 C), frozen products (-20 +/- 5 C), and products stored below -20 C. ICH Q5C provides supplementary conditions for biologics.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'climatic_zone',
            label: 'Target Climatic Zone(s)',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'zone_i', label: 'Zone I — Temperate (21 C / 45% RH)', description: 'Northern Europe, Canada, Russia' },
              { value: 'zone_ii', label: 'Zone II — Subtropical/Mediterranean (25 C / 60% RH)', description: 'USA, Japan, Southern Europe' },
              { value: 'zone_iii', label: 'Zone III — Hot/Dry (30 C / 35% RH)', description: 'Iraq, Sudan' },
              { value: 'zone_iva', label: 'Zone IVa — Hot/Humid (30 C / 65% RH)', description: 'Brazil, Ghana, Philippines' },
              { value: 'zone_ivb', label: 'Zone IVb — Hot/Very Humid (30 C / 75% RH)', description: 'ASEAN countries per ICH Q1F' },
            ],
            helpText: 'ICH Q1F "Stability Data Package for Registration Applications in Climatic Zones III and IV" defines long-term storage conditions by climatic zone. Selecting Zone IVb requires 30 C/75% RH long-term testing.',
          },
          {
            id: 'long_term_condition',
            label: 'Long-Term Storage Condition',
            type: 'select',
            required: true,
            options: [
              { value: '25_60', label: '25 C +/- 2 C / 60% RH +/- 5% RH', description: 'Standard for Zone I-II countries' },
              { value: '30_65', label: '30 C +/- 2 C / 65% RH +/- 5% RH', description: 'Zone III-IVa countries' },
              { value: '30_75', label: '30 C +/- 2 C / 75% RH +/- 5% RH', description: 'Zone IVb (ASEAN) countries' },
              { value: '5', label: '5 C +/- 3 C', description: 'Refrigerated products' },
              { value: '-20', label: '-20 C +/- 5 C', description: 'Frozen products' },
              { value: 'below_-20', label: 'Below -20 C', description: 'Ultra-cold storage (e.g., mRNA products)' },
            ],
          },
          {
            id: 'has_accelerated_data',
            label: 'Is accelerated stability testing (40 C +/- 2 C / 75% RH +/- 5% RH) included?',
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
            helpText: 'ICH Q1A(R2) defines "significant change" as: >=5% potency loss; exceeding degradation product limits; failing pH, dissolution (12 units), or appearance specifications. Significant change at accelerated triggers the intermediate condition requirement.',
          },
          {
            id: 'intermediate_condition_included',
            label: 'Is an intermediate condition (30 C / 65% RH) included?',
            type: 'yes_no',
            required: true,
            helpText: 'This condition is required if significant change occurs during accelerated testing per ICH Q1A(R2) Section 2.2.7.2. At minimum 12 months at the intermediate condition is expected when significant change is observed.',
          },
          {
            id: 'additional_conditions',
            label: 'Additional Storage Conditions',
            type: 'multi_select',
            options: [
              { value: 'in_use', label: 'In-Use Stability (after first opening)', description: 'Required for multi-dose containers per FDA Guidance' },
              { value: 'freeze_thaw', label: 'Freeze-Thaw Cycling' },
              { value: 'thermal_cycling', label: 'Thermal Cycling / Transportation Simulation' },
              { value: 'open_dish', label: 'Open Dish / Stress (humidity sensitivity)' },
              { value: 'reconstituted', label: 'After Reconstitution / Dilution', description: 'Required for lyophilized or concentrated products' },
            ],
            helpText: 'Additional conditions may be warranted based on the dosage form, container closure system, and intended use.',
          },
        ],
        issueChecks: [
          {
            id: 'no_accelerated_data',
            condition: { field: 'has_accelerated_data', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Accelerated Stability Data',
            message:
              'ICH Q1A(R2) Section 2.2.7 requires six months of accelerated stability data (40 C/75% RH) at the time of submission. Absence of accelerated data is a significant deficiency that will likely result in a Refuse-to-File or information request from regulatory authorities.',
            reference: 'ICH Q1A(R2) Section 2.2.7',
          },
          {
            id: 'accelerated_failure_not_addressed',
            condition: { field: 'accelerated_significant_change', operator: 'eq', value: 'significant_change' },
            severity: 'warning',
            title: 'Accelerated Condition Failure Not Addressed',
            message:
              'When significant change occurs during 6 months of accelerated testing, ICH Q1A(R2) Section 2.2.7.2 requires data from the intermediate condition (30 C/65% RH) with a minimum 12-month study duration. Ensure intermediate testing is included and the shelf-life claim is supported by intermediate and long-term data. The proposed shelf life may need to be reduced based on the intermediate data.',
            reference: 'ICH Q1A(R2) Section 2.2.7.2',
          },
          {
            id: 'no_in_use_stability',
            condition: { field: 'additional_conditions', operator: 'not_in', value: ['in_use'] },
            severity: 'warning',
            title: 'No In-Use Stability Data',
            message:
              'For multi-dose products or products requiring reconstitution/dilution prior to use, in-use stability data are expected by FDA and EMA to support labeled in-use storage conditions and hold times. If the product is a single-dose presentation, this may not apply.',
            reference: 'FDA Guidance for Industry: Stability Testing; EMA Guideline CPMP/QWP/609/96',
          },
        ],
        branches: [
          {
            when: { field: 'climatic_zone', operator: 'contains', value: 'zone_ivb' },
            goto: 'climatic_zone_branching',
          },
          {
            when: { field: 'climatic_zone', operator: 'contains', value: 'zone_iva' },
            goto: 'climatic_zone_branching',
          },
          {
            when: { field: 'climatic_zone', operator: 'contains', value: 'zone_iii' },
            goto: 'climatic_zone_branching',
          },
        ],
        defaultNext: 'climatic_zone_branching',
      },

      {
        id: 'climatic_zone_branching',
        section: 'study_design_conditions',
        question:
          'Based on your target climatic zones, let\'s verify the specific storage conditions and data package requirements. ICH Q1F provides guidance for registration in Climatic Zones III and IV, while WHO Technical Report Series No. 953 defines the zone classification system.',
        guidance:
          'ICH Q1F was withdrawn from the ICH process in 2006 but remains adopted by WHO and several national regulatory authorities. The WHO Stability Guidance (TRS 953, Annex 2) classifies zones I through IVb with specific long-term conditions for each. For global filings, the most stringent condition (typically Zone IVb: 30 C/75% RH) covers all zones. For Zone I-II only submissions, 25 C/60% RH is standard. When filing in multiple zones, consider whether a single condition covers all targets or if separate data sets are needed.',
        fields: [
          {
            id: 'zone_specific_conditions',
            label: 'Are you using a single global long-term condition or zone-specific conditions?',
            type: 'select',
            required: true,
            options: [
              { value: 'global_30_75', label: 'Single Global Condition: 30 C / 75% RH (covers all zones)' },
              { value: 'global_30_65', label: 'Single Condition: 30 C / 65% RH (covers Zones I-IVa)' },
              { value: 'zone_i_ii_only', label: '25 C / 60% RH (Zone I-II only)' },
              { value: 'multiple_conditions', label: 'Multiple Zone-Specific Conditions', description: 'Separate long-term studies for different target markets' },
            ],
            helpText: 'A single condition at 30 C/75% RH satisfies all climatic zones but may show more degradation. Using 25 C/60% RH limits marketing to Zone I-II countries without additional data.',
          },
          {
            id: 'who_prequalification',
            label: 'Is WHO Prequalification targeted?',
            type: 'yes_no',
            helpText: 'WHO Prequalification requires stability data per WHO Technical Report Series No. 953, Annex 2. Long-term conditions of 30 C/75% RH for Zone IVb are typically required.',
          },
          {
            id: 'zone_regulatory_authorities',
            label: 'Target Regulatory Authorities',
            type: 'multi_select',
            options: [
              { value: 'fda', label: 'US FDA' },
              { value: 'ema', label: 'European Medicines Agency (EMA)' },
              { value: 'pmda', label: 'Japan PMDA' },
              { value: 'health_canada', label: 'Health Canada' },
              { value: 'tga', label: 'Australia TGA' },
              { value: 'anvisa', label: 'Brazil ANVISA' },
              { value: 'asean', label: 'ASEAN (ACTD format)' },
              { value: 'who_pq', label: 'WHO Prequalification' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Different regulatory authorities may have specific stability data expectations beyond ICH Q1A(R2). Identify all target markets to ensure the stability data package is sufficient.',
          },
          {
            id: 'zone_specific_notes',
            label: 'Additional Notes on Climatic Zone Strategy',
            type: 'textarea',
            placeholder: 'e.g., Initial filing in US and EU using 25 C/60% RH data; separate 30 C/75% RH data will support subsequent ASEAN filings within 18 months.',
          },
        ],
        branches: [
          {
            when: { field: 'is_biologic', operator: 'eq', value: true },
            goto: 'biologics_stability',
          },
        ],
        defaultNext: 'testing_schedule',
      },

      {
        id: 'biologics_stability',
        section: 'study_design_conditions',
        question:
          'For biological/biotechnological products, ICH Q5C imposes additional stability requirements beyond those in ICH Q1A(R2). Let\'s discuss the biologic-specific aspects of your stability program, including protein aggregation, potency, and structural integrity monitoring.',
        guidance:
          'ICH Q5C "Quality of Biotechnological Products: Stability Testing of Biotechnological/Biological Products" requires evaluation of:\n\n' +
          '- Potency: Bioassay or binding assay at every stability time point\n' +
          '- Purity/Molecular Variants: Size variants (aggregation, fragmentation via SEC/CE-SDS), charge variants (IEC/iCIEF), post-translational modifications (peptide mapping, glycan analysis)\n' +
          '- Protein concentration: UV A280 or equivalent\n' +
          '- Particulate matter: Sub-visible (USP <787>/<788>) and visible particle inspection\n\n' +
          'Additional stress conditions unique to biologics include agitation/shaking, freeze-thaw cycling, and light exposure. Protein aggregation is a critical quality attribute linked to immunogenicity risk.',
        fields: [
          {
            id: 'biologic_potency_assay',
            label: 'Potency Assay Type',
            type: 'select',
            required: true,
            options: [
              { value: 'cell_based_bioassay', label: 'Cell-Based Bioassay' },
              { value: 'binding_assay', label: 'Binding Assay (ELISA, SPR)' },
              { value: 'enzyme_activity', label: 'Enzyme Activity Assay' },
              { value: 'receptor_assay', label: 'Receptor-Based Assay' },
              { value: 'not_yet_established', label: 'Not Yet Established', flagsIssue: true },
            ],
            helpText: 'ICH Q5C requires potency testing at every stability time point. The assay should be validated and stability-indicating.',
          },
          {
            id: 'aggregation_monitoring',
            label: 'Protein Aggregation Monitoring Methods',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'sec_hplc', label: 'Size-Exclusion Chromatography (SEC-HPLC)' },
              { value: 'dls', label: 'Dynamic Light Scattering (DLS)' },
              { value: 'af4', label: 'Asymmetric Flow Field-Flow Fractionation (AF4)' },
              { value: 'auc', label: 'Analytical Ultracentrifugation (AUC)' },
              { value: 'micro_flow_imaging', label: 'Micro-Flow Imaging (MFI)' },
              { value: 'usp_788', label: 'Sub-Visible Particles (USP <788>)' },
            ],
            helpText: 'Protein aggregation is a critical quality attribute linked to immunogenicity. SEC is the standard release and stability method; orthogonal methods (DLS, MFI, AUC) provide complementary information on aggregate populations.',
          },
          {
            id: 'charge_variant_analysis',
            label: 'Charge Variant Analysis Method',
            type: 'select',
            options: [
              { value: 'iec', label: 'Ion-Exchange Chromatography (IEC)' },
              { value: 'icief', label: 'Imaged Capillary Isoelectric Focusing (iCIEF)' },
              { value: 'cze', label: 'Capillary Zone Electrophoresis (CZE)' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
            helpText: 'Charge variants (acidic/basic species) can result from deamidation, oxidation, or other modifications that accumulate during storage.',
          },
          {
            id: 'biologic_stress_conditions',
            label: 'Biologic-Specific Stress Conditions Evaluated',
            type: 'multi_select',
            options: [
              { value: 'agitation', label: 'Agitation / Shaking Stress' },
              { value: 'freeze_thaw', label: 'Freeze-Thaw Cycling' },
              { value: 'light_exposure', label: 'Light Exposure (ICH Q1B)' },
              { value: 'low_ph', label: 'Low pH Stress' },
              { value: 'high_ph', label: 'High pH Stress' },
              { value: 'oxidative', label: 'Oxidative Stress (H2O2, metal ions)' },
              { value: 'thermal', label: 'Elevated Temperature Stress' },
            ],
            helpText: 'ICH Q5C requires evaluation of stress conditions relevant to protein stability. Agitation and freeze-thaw are particularly important for liquid formulations.',
          },
          {
            id: 'lyophilized_specific',
            label: 'Lyophilized Product Considerations',
            type: 'multi_select',
            visibleWhen: {
              field: 'dosage_form',
              operator: 'eq',
              value: 'lyophilized',
            },
            options: [
              { value: 'cake_appearance', label: 'Lyophilized Cake Appearance (collapse, shrinkage, meltback)' },
              { value: 'reconstitution_time', label: 'Reconstitution Time' },
              { value: 'residual_moisture', label: 'Residual Moisture Content' },
              { value: 'glass_transition', label: 'Glass Transition Temperature (Tg)' },
              { value: 'post_reconstitution_stability', label: 'Post-Reconstitution Stability (in-use)' },
            ],
            helpText: 'Lyophilized biologics require monitoring of cake integrity, reconstitution behavior, and residual moisture. Tg should remain above the storage temperature to prevent collapse.',
          },
        ],
        defaultNext: 'testing_schedule',
      },

      /* ================================================================ */
      /*  Section 3 — Testing Schedule & Parameters                       */
      /* ================================================================ */

      {
        id: 'testing_schedule',
        section: 'testing_schedule_parameters',
        question:
          'Let\'s define the study duration and testing intervals. ICH Q1A(R2) specifies minimum durations and recommended time points for each storage condition. What are your planned durations and testing schedules?',
        guidance:
          'ICH Q1A(R2) Section 2.2.7 recommends the following minimum durations at the time of submission:\n\n' +
          '- Long-term: 12 months minimum at time of filing (data through 24-36 months expected for full shelf-life claim)\n' +
          '- Intermediate (if needed): 12 months minimum\n' +
          '- Accelerated: 6 months\n\n' +
          'Standard testing intervals per ICH Q1A(R2) Section 2.2.7.1: every 3 months over the first year, every 6 months over the second year, and annually thereafter (e.g., 0, 3, 6, 9, 12, 18, 24, 36 months).',
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
            id: 'long_term_data_available_months',
            label: 'Months of long-term data currently available',
            type: 'number',
            required: true,
            placeholder: 'e.g., 24',
            validation: {
              min: 0,
              max: 120,
            },
            helpText: 'At least 12 months of long-term data at the time of submission is required per ICH Q1A(R2) Section 2.2.7.',
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
            id: 'insufficient_long_term_data',
            condition: { field: 'long_term_data_available_months', operator: 'lt', value: 12 },
            severity: 'critical',
            title: 'Insufficient Long-Term Stability Data for Filing',
            message:
              'ICH Q1A(R2) Section 2.2.7 requires a minimum of 12 months of long-term stability data at the time of submission. Without sufficient long-term data, a shelf life cannot be established and the application may be considered incomplete. Consider delaying submission until the minimum 12-month data are available.',
            reference: 'ICH Q1A(R2) Section 2.2.7',
          },
        ],
        defaultNext: 'analytical_methods',
      },

      {
        id: 'analytical_methods',
        section: 'testing_schedule_parameters',
        question:
          'What analytical methods and test parameters are included in your stability-indicating testing program? The stability-indicating assay method is the cornerstone of any stability program. Describe your approach to assay, degradation product monitoring, and dosage-form-specific testing.',
        guidance:
          'ICH Q1A(R2) Section 2.2.4 requires that testing should cover those features susceptible to change during storage and likely to influence quality, safety, and/or efficacy. A validated, stability-indicating analytical procedure per ICH Q2(R1) must be used, capable of detecting changes in the active ingredient and distinguishing degradation products from the parent compound. Degradation product limits must comply with ICH Q3A(R2) for drug substances and ICH Q3B(R2) for drug products.',
        fields: [
          {
            id: 'stability_indicating_method',
            label: 'Is a validated stability-indicating method (SIM) available?',
            type: 'yes_no',
            required: true,
            helpText: 'A stability-indicating method resolves the drug from its degradation products. This is typically demonstrated by subjecting the drug to stress conditions (acid, base, oxidation, heat, light) and showing adequate separation.',
          },
          {
            id: 'assay_method',
            label: 'Primary Assay Method',
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
            id: 'degradation_product_monitoring',
            label: 'Degradation Product Monitoring Approach',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'specified_identified', label: 'Specified Identified Degradation Products' },
              { value: 'specified_unidentified', label: 'Specified Unidentified Degradation Products' },
              { value: 'unspecified', label: 'Unspecified Degradation Products' },
              { value: 'total_impurities', label: 'Total Impurities / Total Degradation Products' },
            ],
            helpText: 'ICH Q3B(R2) requires monitoring of degradation products above reporting thresholds. Thresholds depend on maximum daily dose: reporting >=0.1% (dose <=1g/day) or >=0.05% (dose >1g/day).',
          },
          {
            id: 'physical_tests_included',
            label: 'Physical Tests Included',
            type: 'multi_select',
            options: [
              { value: 'appearance', label: 'Appearance (color, clarity, form)' },
              { value: 'dissolution', label: 'Dissolution / Drug Release' },
              { value: 'hardness', label: 'Hardness / Breaking Force' },
              { value: 'moisture_content', label: 'Moisture Content (Karl Fischer / LOD)' },
              { value: 'ph', label: 'pH' },
              { value: 'particle_size', label: 'Particle Size Distribution' },
              { value: 'viscosity', label: 'Viscosity' },
              { value: 'particulate_matter', label: 'Particulate Matter (USP <788>)' },
              { value: 'polymorphic_form', label: 'Polymorphic Form (XRPD/DSC)' },
              { value: 'delivered_dose', label: 'Delivered Dose Uniformity (inhalers)' },
              { value: 'aerodynamic_psd', label: 'Aerodynamic Particle Size (inhalers)' },
            ],
            helpText: 'Select all physical tests relevant to your product. Dissolution is required for solid oral dosage forms. Inhalation products require delivered dose and aerodynamic particle size.',
          },
          {
            id: 'microbial_testing_included',
            label: 'Is microbiological testing included?',
            type: 'yes_no',
            helpText: 'Non-sterile products: microbial limits per USP <61>/<62>. Sterile products: sterility testing per USP <71>. Preserved products: antimicrobial effectiveness per USP <51>.',
          },
        ],
        issueChecks: [
          {
            id: 'no_stability_indicating_method',
            condition: { field: 'stability_indicating_method', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Stability-Indicating Method Available',
            message:
              'ICH Q1A(R2) Section 2.2.4 requires that a validated, stability-indicating analytical procedure be used for all stability studies. Without a stability-indicating method, the analytical data cannot reliably distinguish between the intact drug and its degradation products, rendering the stability data of limited regulatory value. Method development and validation should be prioritized.',
            reference: 'ICH Q1A(R2) Section 2.2.4; ICH Q2(R1)',
          },
        ],
        defaultNext: 'photostability',
      },

      {
        id: 'photostability',
        section: 'testing_schedule_parameters',
        question:
          'Has a photostability study been conducted per ICH Q1B? Photostability testing is required for new drug substances and drug products to evaluate inherent photosensitivity and determine whether light-protective packaging or storage conditions are needed.',
        guidance:
          'ICH Q1B "Photostability Testing of New Drug Substances and Products" requires a two-part approach:\n\n' +
          '1. Forced degradation (stress) testing to evaluate the inherent photostability of the drug substance.\n' +
          '2. Confirmatory testing to verify that the overall exposure (including packaging) is acceptable.\n\n' +
          'The confirmatory study must use either Option 1 (xenon or metal halide lamp simulating indoor daylight) or Option 2 (cool white fluorescent lamp + near-UV lamp). The minimum exposure is 1.2 million lux hours of visible light and 200 W-h/m2 of near-UV energy. Dark controls wrapped in aluminum foil must be included.',
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
            helpText: 'Both options require exposure to not less than 1.2 million lux hours of visible light and an integrated near-UV energy of not less than 200 W-h/m2.',
          },
          {
            id: 'photostability_result',
            label: 'Overall Photostability Result',
            type: 'select',
            visibleWhen: {
              field: 'photostability_conducted',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'stable', label: 'Photostable — No significant change observed' },
              { value: 'protected_by_packaging', label: 'Photolabile but adequately protected by packaging' },
              { value: 'requires_protection', label: 'Photolabile — Requires light-protective measures' },
            ],
          },
          {
            id: 'light_protection_measures',
            label: 'Light Protection Measures Implemented',
            type: 'multi_select',
            visibleWhen: {
              field: 'photostability_result',
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
        ],
        issueChecks: [
          {
            id: 'no_photostability',
            condition: { field: 'photostability_conducted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Photostability Study Conducted',
            message:
              'ICH Q1B requires photostability testing for new drug substances and drug products. Without photostability data, regulators cannot assess whether light-protective packaging or storage conditions are needed. This is a common deficiency cited in FDA Complete Response Letters and EMA Day 120 questions.',
            reference: 'ICH Q1B',
          },
        ],
        defaultNext: 'statistical_analysis',
      },

      /* ================================================================ */
      /*  Section 4 — Data Analysis & Shelf Life                          */
      /* ================================================================ */

      {
        id: 'statistical_analysis',
        section: 'data_analysis_shelf_life',
        question:
          'How are you analyzing your stability data? ICH Q1E provides a systematic approach to evaluating stability data, including batch poolability assessment, regression analysis, and criteria for extrapolation. Tell me about your statistical approach.',
        guidance:
          'ICH Q1E "Evaluation of Stability Data" outlines a systematic approach:\n\n' +
          '1. Assess whether data from multiple batches can be pooled using analysis of covariance (ANCOVA) to test for differences in slopes and intercepts (alpha = 0.25).\n' +
          '2. If batches can be pooled, estimate the shelf life from the combined data. If not, use the shortest individual batch estimate.\n' +
          '3. Regression analysis: determine the time at which the 95% one-sided confidence limit for the mean curve intersects the acceptance criterion.\n' +
          '4. Extrapolation beyond the period covered by long-term data may be possible if supported by accelerated data showing no significant change.\n\n' +
          'The proposed shelf life should generally not exceed 2x the period covered by long-term data when extrapolation is used.',
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
            id: 'statistical_model_justified',
            label: 'Has the statistical model been justified with goodness-of-fit data?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1E requires justification for the selected regression model. Residual analysis and goodness-of-fit metrics should support the choice of linear, quadratic, or other models.',
          },
          {
            id: 'regression_model',
            label: 'Regression Model',
            type: 'select',
            options: [
              { value: 'linear', label: 'Linear (attribute = a + b x time)' },
              { value: 'quadratic', label: 'Quadratic (attribute = a + b x time + c x time^2)' },
              { value: 'log_linear', label: 'Log-Linear (ln(attribute) = a + b x time)' },
              { value: 'square_root', label: 'Square Root (attribute = a + b x sqrt(time))' },
            ],
            helpText: 'ICH Q1E states that the relationship between the attribute and time may be linear or nonlinear. Select the model that best fits the observed data.',
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
            helpText: 'ICH Q1E Section 3.1: Use ANCOVA to test equality of slopes and intercepts at alpha = 0.25. If p > 0.25 for both, data can be pooled.',
          },
          {
            id: 'significant_change_criteria',
            label: 'Significant Change Criteria Applied',
            type: 'textarea',
            placeholder: 'e.g., >=5% change in assay from initial value; any specified degradation product exceeding its limit; failure to meet dissolution specification (Q); pH change >0.5 unit.',
            helpText: 'ICH Q1A(R2) Section 2.2.7 defines "significant change" criteria used to evaluate accelerated data and determine if intermediate testing is triggered.',
            validation: {
              minLength: 20,
            },
          },
        ],
        issueChecks: [
          {
            id: 'statistical_model_not_justified',
            condition: { field: 'statistical_model_justified', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Statistical Model Not Justified',
            message:
              'ICH Q1E requires that the statistical model used for shelf-life estimation be scientifically justified. Without goodness-of-fit data, residual analysis, or other model-selection criteria, the proposed shelf life may be challenged during regulatory review. Consider performing residual plots and comparing model fits before finalizing the shelf-life claim.',
            reference: 'ICH Q1E Section 3',
          },
        ],
        defaultNext: 'shelf_life_determination',
      },

      {
        id: 'shelf_life_determination',
        section: 'data_analysis_shelf_life',
        question:
          'How is the proposed shelf life or retest period being determined? ICH Q1E allows extrapolation beyond available long-term data under specific circumstances. Let me understand your approach to shelf-life assignment and whether extrapolation is being used.',
        guidance:
          'ICH Q1E Section 4 addresses extrapolation:\n\n' +
          '- Extrapolation may be used when long-term data show little to no change or variability, and accelerated data show no significant change.\n' +
          '- The proposed shelf life should not exceed the available long-term data by more than 2x (e.g., 12 months data allows a maximum 24-month shelf-life claim).\n' +
          '- For drug substances, a retest period rather than an expiration date is assigned per ICH Q1A(R2) Section 2.1.4.\n' +
          '- For drug products, an expiration date is assigned.',
        fields: [
          {
            id: 'extrapolation_used',
            label: 'Is extrapolation beyond available long-term data being used?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1E permits limited extrapolation when justified by the stability profile. The extrapolated period should generally not exceed 2x the period covered by long-term data.',
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
            id: 'shelf_life_exceeds_data',
            label: 'Does the proposed shelf life exceed the period covered by long-term data?',
            type: 'select',
            required: true,
            options: [
              { value: 'within_data', label: 'No — Shelf life within data coverage' },
              { value: '1_to_1.5x', label: 'Yes — 1-1.5x available data' },
              { value: '1.5_to_2x', label: 'Yes — 1.5-2x available data' },
              { value: 'over_2x', label: 'Yes — >2x available data', flagsIssue: true },
            ],
          },
          {
            id: 'retest_vs_expiry',
            label: 'Assignment Type',
            type: 'select',
            required: true,
            options: [
              { value: 'retest_period', label: 'Retest Period (drug substance)', description: 'The period during which the drug substance can be considered to remain within specification' },
              { value: 'expiration_date', label: 'Expiration Date / Shelf Life (drug product)', description: 'The date beyond which the drug product should not be used' },
            ],
            helpText: 'ICH Q1A(R2) distinguishes between retest periods (drug substances) and shelf lives / expiration dates (drug products).',
          },
          {
            id: 'storage_label_statement',
            label: 'Proposed Storage Condition Label Statement',
            type: 'text',
            placeholder: 'e.g., Store at 25 C (77 F); excursions permitted to 15-30 C (59-86 F). Protect from light.',
            helpText: 'The label storage statement should be consistent with the stability data and the long-term storage condition.',
          },
        ],
        issueChecks: [
          {
            id: 'shelf_life_exceeds_data_issue',
            condition: { field: 'shelf_life_exceeds_data', operator: 'eq', value: 'over_2x' },
            severity: 'critical',
            title: 'Proposed Shelf Life Exceeds Available Data by >2x',
            message:
              'ICH Q1E Section 4 limits extrapolation to generally no more than twice the period covered by long-term data. A proposed shelf life exceeding this threshold requires exceptional justification and is likely to be challenged by FDA, EMA, and other regulatory authorities. Consider either reducing the proposed shelf life or generating additional long-term data before filing.',
            reference: 'ICH Q1E Section 4',
          },
        ],
        defaultNext: 'forced_degradation',
      },

      {
        id: 'forced_degradation',
        section: 'data_analysis_shelf_life',
        question:
          'Have forced degradation (stress testing) studies been completed? These studies are essential for understanding degradation pathways, demonstrating the stability-indicating nature of the analytical method, and identifying potential degradation products.',
        guidance:
          'ICH Q1A(R2) Section 2.1.2 (drug substances) and Section 2.2.3 (drug products) describe stress testing requirements. Forced degradation studies typically include:\n\n' +
          '- Acid hydrolysis (0.1N HCl)\n' +
          '- Base hydrolysis (0.1N NaOH)\n' +
          '- Oxidation (3% H2O2)\n' +
          '- Thermal stress (60-80 C)\n' +
          '- Photolysis (ICH Q1B conditions)\n' +
          '- Humidity stress (75% RH open dish)\n\n' +
          'The goal is to achieve 10-30% degradation under each condition, demonstrating that the analytical method can resolve the parent compound from all degradation products. Mass balance should be within 90-110%.',
        fields: [
          {
            id: 'forced_degradation_completed',
            label: 'Have forced degradation / stress testing studies been completed?',
            type: 'yes_no',
            required: true,
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
              { value: 'thermal', label: 'Thermal Stress (e.g., 60-80 C)' },
              { value: 'photolysis', label: 'Photolysis (ICH Q1B conditions)' },
              { value: 'humidity', label: 'Humidity Stress (e.g., 75% RH open dish)' },
            ],
          },
          {
            id: 'mass_balance_achieved',
            label: 'Was acceptable mass balance achieved (90-110%)?',
            type: 'yes_no',
            visibleWhen: {
              field: 'forced_degradation_completed',
              operator: 'eq',
              value: true,
            },
            helpText: 'Mass balance confirms that the analytical method accounts for all degradation products. Poor mass balance may indicate unknown degradation pathways or co-elution.',
          },
          {
            id: 'degradation_pathways_identified',
            label: 'Have the major degradation pathways been identified?',
            type: 'yes_no',
            visibleWhen: {
              field: 'forced_degradation_completed',
              operator: 'eq',
              value: true,
            },
            helpText: 'Understanding degradation pathways informs specification limits, packaging decisions, and formulation development. Structural characterization of significant degradation products may be required per ICH Q3A(R2)/Q3B(R2).',
          },
        ],
        issueChecks: [
          {
            id: 'no_forced_degradation',
            condition: { field: 'forced_degradation_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Forced Degradation Study Completed',
            message:
              'Forced degradation studies are essential for understanding degradation pathways, establishing the stability-indicating nature of the analytical method, and identifying potential degradation products. ICH Q1A(R2) Sections 2.1.2 and 2.2.3 describe stress testing requirements. Without forced degradation data, regulators may question the ability of the analytical method to detect stability-related changes.',
            reference: 'ICH Q1A(R2) Sections 2.1.2, 2.2.3',
          },
        ],
        defaultNext: 'post_approval_stability',
      },

      /* ================================================================ */
      /*  Section 5 — Commitments & Post-Approval                         */
      /* ================================================================ */

      {
        id: 'post_approval_stability',
        section: 'commitments_post_approval',
        question:
          'What post-approval stability commitments are planned? Regulatory authorities expect ongoing stability monitoring after approval to confirm the shelf life throughout the product lifecycle. ICH Q1A(R2) Section 2.2.8 outlines the expected commitment.',
        guidance:
          'ICH Q1A(R2) Section 2.2.8 states that a post-approval stability protocol and commitment should be provided in the registration application. The commitment typically includes placing at least one production batch per year (or per strength, per manufacturing site) on long-term stability through the approved shelf life. For FDA, 21 CFR 211.166 requires a written testing program for assessing the stability characteristics of drug products. Annual stability data are reviewed during cGMP inspections.',
        fields: [
          {
            id: 'post_approval_protocol_submitted',
            label: 'Is a post-approval stability protocol included in the submission?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1A(R2) Section 2.2.8 expects the post-approval stability protocol to be described in CTD Module 3.2.P.8.3 (drug product) or 3.2.S.7.3 (drug substance).',
          },
          {
            id: 'annual_batches',
            label: 'Number of annual stability batches committed',
            type: 'number',
            placeholder: 'e.g., 1',
            helpText: 'A commitment of at least one batch per year per strength per manufacturing site is standard. Some markets (EMA, PMDA) may require more.',
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
          {
            id: 'oot_monitoring_program',
            label: 'Is an out-of-trend (OOT) monitoring program in place?',
            type: 'yes_no',
            helpText: 'Proactive OOT monitoring (regression-based limits, control charts) can identify stability issues before OOS results occur. This is an FDA expectation for commercial products.',
          },
        ],
        issueChecks: [
          {
            id: 'no_post_approval_commitment',
            condition: { field: 'post_approval_protocol_submitted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Post-Approval Stability Commitment',
            message:
              'ICH Q1A(R2) Section 2.2.8 expects a post-approval stability protocol and stability commitment to be included in the registration application. Absence of a post-approval commitment may result in an information request from reviewers and is considered a significant gap in the quality overall summary.',
            reference: 'ICH Q1A(R2) Section 2.2.8; 21 CFR 211.166',
          },
        ],
        defaultNext: 'protocol_changes',
      },

      {
        id: 'protocol_changes',
        section: 'commitments_post_approval',
        question:
          'Are there any anticipated post-approval changes that would require additional stability studies? Changes in manufacturing process, formulation, container closure system, or manufacturing site may require comparability stability data.',
        guidance:
          'Post-approval changes are governed by FDA SUPAC guidance series, ICH Q5E (Comparability of Biotechnological/Biological Products), and regional regulatory requirements. Changes are categorized by risk level (minor, moderate, major), and each category has specific stability data requirements. A Prior Approval Supplement (PAS) typically requires stability data on at least one to three batches, while a Changes Being Effected (CBE-30) supplement may require data to be generated post-submission.',
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
            placeholder: 'e.g., Three batches from the new manufacturing site will be placed on 6-month accelerated and 12-month long-term stability studies. Results will be compared to historical data.',
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
        section: 'commitments_post_approval',
        question:
          'Finally, let\'s address stability failure notification and contingency planning. Confirmed stability failures can trigger regulatory actions including field alerts, recalls, and revisions to the approved shelf life. Do you have processes in place to handle these events?',
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
            label: 'Is a process in place for FDA Field Alert Reports (21 CFR 314.81(b)(1))?',
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
            placeholder: 'e.g., One pilot batch (Batch P-003) failed dissolution specification at 36 months at long-term conditions. Root cause: excipient incompatibility leading to cross-linked film coat. Reformulation implemented.',
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
      },
    ],
  };
}
