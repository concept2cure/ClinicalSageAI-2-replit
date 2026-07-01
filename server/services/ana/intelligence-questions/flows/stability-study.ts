/**
 * Stability Study flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through gathering the information needed to develop an
 * ICH Q1A/Q1B stability study protocol, covering product identification,
 * study type selection, storage conditions, testing intervals, container
 * closure systems, test parameters, acceptance criteria, photostability
 * considerations, reduced testing justification, and bracketing/matrixing
 * design.
 *
 * 10 nodes, 5 sections, 60+ fields with branching for study type,
 * photostability requirements, and reduced testing approaches.
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
      'ICH Q1A/Q1B stability study protocol development covering product identification, study design, storage conditions, testing intervals, container closure, test parameters, acceptance criteria, photostability, and bracketing/matrixing approaches.',
    clientTypes: [],
    entryNode: 'product_identification',
    estimatedMinutes: 35,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'product_info',
        label: 'Product Information',
        nodeIds: ['product_identification'],
      },
      {
        id: 'study_design',
        label: 'Study Design',
        nodeIds: ['study_type', 'storage_conditions', 'testing_intervals'],
      },
      {
        id: 'container_testing',
        label: 'Container & Testing',
        nodeIds: ['container_closure', 'test_parameters'],
      },
      {
        id: 'acceptance',
        label: 'Acceptance & Photostability',
        nodeIds: ['acceptance_criteria', 'photostability'],
      },
      {
        id: 'optimization',
        label: 'Study Optimization',
        nodeIds: ['reduced_testing', 'bracketing_matrixing'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 1 — Product Information                                 */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'product_identification',
        section: 'Product Information',
        question:
          'Let\'s identify the product for this stability study. What is the product name, dosage form, and formulation details?',
        guidance:
          'ICH Q1A(R2) requires stability testing on the dosage form as packaged for marketing. Accurate identification of the product, its formulation, and manufacturing details is essential for designing an appropriate stability protocol. The drug substance classification (new molecular entity vs. known substance) influences the extent of testing required.',
        fields: [
          {
            id: 'product_name',
            label: 'Product Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. Atorvastatin Calcium Tablets',
          },
          {
            id: 'drug_substance_name',
            label: 'Drug Substance (Active Ingredient)',
            type: 'text',
            required: true,
            placeholder: 'e.g. Atorvastatin Calcium Trihydrate',
          },
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'oral_solution', label: 'Oral Solution' },
              { value: 'oral_suspension', label: 'Oral Suspension' },
              { value: 'injectable', label: 'Injectable (Solution)' },
              { value: 'lyophilized', label: 'Lyophilized Powder' },
              { value: 'cream_ointment', label: 'Cream/Ointment' },
              { value: 'transdermal', label: 'Transdermal Patch' },
              { value: 'inhalation', label: 'Inhalation' },
              { value: 'suppository', label: 'Suppository' },
              { value: 'ophthalmic', label: 'Ophthalmic' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'strengths',
            label: 'Strengths',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. 10 mg, 20 mg, 40 mg, 80 mg',
            helpText: 'List all strengths to be included in the stability study.',
          },
          {
            id: 'batch_size',
            label: 'Batch Size',
            type: 'text',
            placeholder: 'e.g. Pilot scale (100,000 tablets) or Production scale',
            helpText: 'ICH Q1A requires at least pilot-scale batches for registration stability.',
          },
          {
            id: 'number_of_batches',
            label: 'Number of Batches',
            type: 'select',
            required: true,
            helpText: 'ICH Q1A requires stability data on at least 3 batches for registration.',
            options: [
              { value: '1', label: '1 Batch' },
              { value: '2', label: '2 Batches' },
              { value: '3', label: '3 Batches (ICH minimum)' },
              { value: '4_plus', label: '4 or More Batches' },
            ],
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'nme', label: 'New Molecular Entity' },
              { value: 'generic', label: 'Generic / Abbreviated Application' },
              { value: 'known_substance', label: 'Known Active Substance' },
              { value: 'biological', label: 'Biological / Biotechnology Product' },
            ],
          },
          {
            id: 'manufacturing_site',
            label: 'Manufacturing Site',
            type: 'text',
            placeholder: 'Name and location of the manufacturing facility',
          },
        ],
        issueChecks: [
          {
            id: 'insufficient_batches',
            condition: { field: 'number_of_batches', operator: 'eq', value: '1' },
            severity: 'critical',
            title: 'Insufficient Batches for Registration',
            message:
              'ICH Q1A(R2) requires stability data on a minimum of 3 batches for a registration application. A single batch may be acceptable only for early-phase development studies. Ensure batch numbers align with the intended regulatory submission.',
            reference: 'ICH Q1A(R2) Section 2.1.3',
          },
        ],
        defaultNext: 'study_type',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 2 — Study Design                                        */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'study_type',
        section: 'Study Design',
        question:
          'What type of stability study is being conducted? Select the study types and specify the climate zones for intended markets.',
        guidance:
          'ICH Q1A(R2) defines four study types: long-term, intermediate, accelerated, and stress testing. Long-term and accelerated studies are required for registration. Intermediate studies may be needed if significant change occurs at accelerated conditions. Stress testing (ICH Q1A Section 2.1.2) is used during development to identify degradation pathways. Climate zones (ICH Q1F) determine long-term storage conditions for different markets.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'study_types',
            label: 'Study Types',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'long_term', label: 'Long-Term' },
              { value: 'accelerated', label: 'Accelerated' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'stress', label: 'Stress Testing' },
            ],
          },
          {
            id: 'climate_zone',
            label: 'ICH Climate Zone',
            type: 'select',
            required: true,
            helpText: 'Determines the long-term storage condition requirements for the target market.',
            options: [
              { value: 'zone_i', label: 'Zone I — Temperate' },
              { value: 'zone_ii', label: 'Zone II — Subtropical/Mediterranean' },
              { value: 'zone_iii', label: 'Zone III — Hot/Dry' },
              { value: 'zone_iva', label: 'Zone IVa — Hot/Humid' },
              { value: 'zone_ivb', label: 'Zone IVb — Hot/Very Humid' },
            ],
          },
          {
            id: 'target_markets',
            label: 'Target Markets',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'us', label: 'United States (FDA)' },
              { value: 'eu', label: 'European Union (EMA)' },
              { value: 'japan', label: 'Japan (PMDA)' },
              { value: 'china', label: 'China (NMPA)' },
              { value: 'brazil', label: 'Brazil (ANVISA)' },
              { value: 'india', label: 'India (CDSCO)' },
              { value: 'who', label: 'WHO Prequalification' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'study_duration',
            label: 'Planned Study Duration',
            type: 'select',
            required: true,
            helpText: 'Long-term studies typically run 12-36 months; accelerated studies run 6 months.',
            options: [
              { value: '6_months', label: '6 Months (Accelerated Only)' },
              { value: '12_months', label: '12 Months' },
              { value: '18_months', label: '18 Months' },
              { value: '24_months', label: '24 Months' },
              { value: '36_months', label: '36 Months' },
              { value: '48_months', label: '48 Months' },
              { value: '60_months', label: '60 Months (5 Years)' },
            ],
          },
          {
            id: 'development_phase',
            label: 'Development Phase',
            type: 'select',
            required: true,
            options: [
              { value: 'preclinical', label: 'Preclinical' },
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_3', label: 'Phase 3 / Registration' },
              { value: 'post_approval', label: 'Post-Approval / Commitment' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'study_types', operator: 'contains', value: 'stress' },
            goto: 'storage_conditions',
          },
        ],
        defaultNext: 'storage_conditions',
      },

      {
        id: 'storage_conditions',
        section: 'Study Design',
        question:
          'Define the storage conditions for each study type. ICH Q1A specifies standard conditions, but product-specific conditions may apply.',
        guidance:
          'ICH Q1A(R2) specifies standard storage conditions: Long-term 25 C/60% RH (or 30 C/65% RH for Zone IVa), Intermediate 30 C/65% RH, and Accelerated 40 C/75% RH. For products requiring refrigeration (2-8 C) or freezing (-20 C), different conditions apply. Stress conditions typically include elevated temperature, humidity, oxidation, photolysis, and pH extremes.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'long_term_condition',
            label: 'Long-Term Condition',
            type: 'select',
            required: true,
            options: [
              { value: '25_60', label: '25 C / 60% RH (Zone I-II)' },
              { value: '30_65', label: '30 C / 65% RH (Zone III-IVa)' },
              { value: '30_75', label: '30 C / 75% RH (Zone IVb)' },
              { value: '5_na', label: '5 C (Refrigerated, no humidity control)' },
              { value: '-20_na', label: '-20 C (Frozen, no humidity control)' },
              { value: '-70_na', label: '-70 C (Deep Frozen)' },
            ],
          },
          {
            id: 'accelerated_condition',
            label: 'Accelerated Condition',
            type: 'select',
            required: true,
            options: [
              { value: '40_75', label: '40 C / 75% RH (Standard)' },
              { value: '25_60', label: '25 C / 60% RH (Refrigerated products)' },
              { value: '5_na', label: '5 C (Frozen products)' },
            ],
          },
          {
            id: 'intermediate_condition',
            label: 'Intermediate Condition',
            type: 'select',
            helpText: 'Required when significant change occurs at accelerated conditions.',
            options: [
              { value: '30_65', label: '30 C / 65% RH (Standard)' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'stress_conditions',
            label: 'Stress Testing Conditions',
            type: 'multi_select',
            helpText: 'Select all stress conditions to be evaluated (ICH Q1A Section 2.1.2).',
            options: [
              { value: 'elevated_temp', label: 'Elevated Temperature (50-60 C)' },
              { value: 'high_humidity', label: 'High Humidity (75-90% RH)' },
              { value: 'oxidation', label: 'Oxidation (H2O2, AIBN)' },
              { value: 'acid_hydrolysis', label: 'Acid Hydrolysis (0.1N HCl)' },
              { value: 'base_hydrolysis', label: 'Base Hydrolysis (0.1N NaOH)' },
              { value: 'photolysis', label: 'Photolysis (ICH Q1B)' },
              { value: 'thermal_cycling', label: 'Thermal Cycling (Freeze-Thaw)' },
            ],
          },
          {
            id: 'chamber_qualification',
            label: 'Stability Chamber Qualification',
            type: 'select',
            required: true,
            helpText: 'Stability chambers must be qualified and continuously monitored per ICH Q1A.',
            options: [
              { value: 'iq_oq_pq', label: 'IQ/OQ/PQ Completed' },
              { value: 'iq_oq', label: 'IQ/OQ Completed (PQ Planned)' },
              { value: 'not_qualified', label: 'Not Yet Qualified' },
            ],
          },
          {
            id: 'temperature_monitoring',
            label: 'Temperature/Humidity Monitoring',
            type: 'select',
            required: true,
            options: [
              { value: 'continuous', label: 'Continuous Electronic Monitoring' },
              { value: 'daily_manual', label: 'Daily Manual Checks' },
              { value: 'periodic', label: 'Periodic Manual Checks' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'chamber_not_qualified',
            condition: { field: 'chamber_qualification', operator: 'eq', value: 'not_qualified' },
            severity: 'critical',
            title: 'Stability Chambers Not Qualified',
            message:
              'ICH Q1A(R2) requires that stability chambers be qualified and temperature/humidity mapping performed. Studies conducted in unqualified chambers may not be accepted by regulatory agencies. Complete IQ/OQ/PQ before initiating the study.',
            reference: 'ICH Q1A(R2) Section 2.2',
          },
        ],
        defaultNext: 'testing_intervals',
      },

      {
        id: 'testing_intervals',
        section: 'Study Design',
        question:
          'Define the testing intervals for each study type. ICH Q1A provides minimum testing frequency requirements.',
        guidance:
          'ICH Q1A(R2) recommends testing frequency sufficient to establish stability profile: Long-term — every 3 months over the first year, every 6 months over the second year, and annually thereafter. Accelerated — minimum 3 time points including initial and 6 months. Reduced testing or matrixing/bracketing may reduce the number of tests at each interval.',
        fields: [
          {
            id: 'long_term_intervals',
            label: 'Long-Term Testing Intervals',
            type: 'multi_select',
            required: true,
            helpText: 'ICH minimum: 0, 3, 6, 9, 12, 18, 24, 36 months.',
            options: [
              { value: '0', label: '0 (Initial)' },
              { value: '1', label: '1 Month' },
              { value: '3', label: '3 Months' },
              { value: '6', label: '6 Months' },
              { value: '9', label: '9 Months' },
              { value: '12', label: '12 Months' },
              { value: '18', label: '18 Months' },
              { value: '24', label: '24 Months' },
              { value: '36', label: '36 Months' },
              { value: '48', label: '48 Months' },
              { value: '60', label: '60 Months' },
            ],
          },
          {
            id: 'accelerated_intervals',
            label: 'Accelerated Testing Intervals',
            type: 'multi_select',
            required: true,
            helpText: 'ICH minimum: 0, 3, 6 months (3 time points minimum).',
            options: [
              { value: '0', label: '0 (Initial)' },
              { value: '1', label: '1 Month' },
              { value: '2', label: '2 Months' },
              { value: '3', label: '3 Months' },
              { value: '6', label: '6 Months' },
            ],
          },
          {
            id: 'intermediate_intervals',
            label: 'Intermediate Testing Intervals',
            type: 'multi_select',
            helpText: 'ICH minimum: 0, 6, 9, 12 months (4 time points minimum).',
            options: [
              { value: '0', label: '0 (Initial)' },
              { value: '3', label: '3 Months' },
              { value: '6', label: '6 Months' },
              { value: '9', label: '9 Months' },
              { value: '12', label: '12 Months' },
            ],
          },
          {
            id: 'significant_change_criteria',
            label: 'Significant Change Criteria',
            type: 'multi_select',
            required: true,
            helpText: 'Define what constitutes "significant change" per ICH Q1A(R2) Section 2.2.3.',
            options: [
              { value: 'assay_5pct', label: 'Assay: 5% Change from Initial' },
              { value: 'degradation_limit', label: 'Any Degradation Product Exceeds Limit' },
              { value: 'appearance_change', label: 'Failure to Meet Appearance Criteria' },
              { value: 'hardness_change', label: 'Failure of Hardness Specification' },
              { value: 'dissolution_fail', label: 'Failure of Dissolution (12 units)' },
              { value: 'ph_change', label: 'pH Outside Specification' },
              { value: 'water_content', label: 'Water Content Exceeds Specification' },
            ],
          },
        ],
        defaultNext: 'container_closure',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 3 — Container & Testing                                 */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'container_closure',
        section: 'Container & Testing',
        question:
          'Describe the container closure system(s) for stability testing. ICH Q1A requires testing in the marketed packaging.',
        guidance:
          'Stability studies must be conducted on the drug product in the container closure system proposed for marketing (ICH Q1A Section 2.1.7). If multiple container sizes or materials are used, a justification for bracketing (testing only extremes) may be acceptable. Include details on closures, desiccants, and any secondary packaging if it provides a moisture barrier.',
        fields: [
          {
            id: 'primary_container',
            label: 'Primary Container Material',
            type: 'select',
            required: true,
            options: [
              { value: 'hdpe_bottle', label: 'HDPE Bottle' },
              { value: 'glass_bottle', label: 'Glass Bottle (Type I/II/III)' },
              { value: 'pvc_pvdc_blister', label: 'PVC/PVDC Blister' },
              { value: 'alu_alu_blister', label: 'Alu/Alu Blister' },
              { value: 'alu_pvc_blister', label: 'Alu/PVC Blister' },
              { value: 'sachets', label: 'Sachets/Pouches' },
              { value: 'prefilled_syringe', label: 'Pre-Filled Syringe' },
              { value: 'vial', label: 'Glass Vial' },
              { value: 'ampoule', label: 'Ampoule' },
              { value: 'tube', label: 'Tube (Aluminum/Plastic)' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'closure_system',
            label: 'Closure Type',
            type: 'select',
            required: true,
            options: [
              { value: 'crc_cap', label: 'Child-Resistant Cap' },
              { value: 'screw_cap', label: 'Screw Cap' },
              { value: 'flip_off', label: 'Flip-Off Seal' },
              { value: 'rubber_stopper', label: 'Rubber Stopper + Crimp Seal' },
              { value: 'heat_sealed', label: 'Heat-Sealed' },
              { value: 'tamper_evident', label: 'Tamper-Evident Seal' },
              { value: 'not_applicable', label: 'Not Applicable (e.g. Ampoule)' },
            ],
          },
          {
            id: 'desiccant_included',
            label: 'Desiccant Included',
            type: 'yes_no',
            helpText: 'Is a desiccant (e.g., silica gel, molecular sieve) included in the packaging?',
          },
          {
            id: 'container_sizes',
            label: 'Container Sizes',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. 30-count, 60-count, 90-count bottles',
            helpText: 'List all container sizes/counts to be studied. If bracketing, note which sizes represent the extremes.',
          },
          {
            id: 'orientation_testing',
            label: 'Orientation Testing',
            type: 'select',
            helpText: 'For semi-solids and liquids, is orientation testing (inverted/upright) performed?',
            options: [
              { value: 'upright_only', label: 'Upright Only' },
              { value: 'inverted_only', label: 'Inverted Only' },
              { value: 'both', label: 'Both Upright and Inverted' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'in_use_stability',
            label: 'In-Use Stability Required',
            type: 'yes_no',
            helpText: 'Is an in-use stability study needed (e.g., multi-dose containers, reconstituted products)?',
          },
        ],
        defaultNext: 'test_parameters',
      },

      {
        id: 'test_parameters',
        section: 'Container & Testing',
        question:
          'What analytical test parameters will be included in the stability protocol?',
        guidance:
          'ICH Q1A(R2) Section 2.2 lists recommended test parameters by dosage form. At minimum, tests should cover attributes susceptible to change during storage and likely to influence quality, safety, and efficacy. Validated stability-indicating methods must be used. Consider both physical and chemical parameters appropriate for the dosage form.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'physical_tests',
            label: 'Physical Tests',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'appearance', label: 'Appearance / Description' },
              { value: 'color', label: 'Color' },
              { value: 'odor', label: 'Odor' },
              { value: 'hardness', label: 'Hardness (Tablets)' },
              { value: 'friability', label: 'Friability (Tablets)' },
              { value: 'weight_variation', label: 'Weight Variation' },
              { value: 'ph', label: 'pH (Solutions)' },
              { value: 'viscosity', label: 'Viscosity' },
              { value: 'particle_size', label: 'Particle Size' },
              { value: 'clarity', label: 'Clarity (Solutions)' },
              { value: 'particulate_matter', label: 'Particulate Matter' },
              { value: 'reconstitution_time', label: 'Reconstitution Time' },
            ],
          },
          {
            id: 'chemical_tests',
            label: 'Chemical Tests',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'assay', label: 'Assay (Potency)' },
              { value: 'degradation_products', label: 'Degradation Products / Related Substances' },
              { value: 'content_uniformity', label: 'Content Uniformity' },
              { value: 'dissolution', label: 'Dissolution' },
              { value: 'disintegration', label: 'Disintegration' },
              { value: 'water_content', label: 'Water Content (Karl Fischer)' },
              { value: 'residual_solvents', label: 'Residual Solvents' },
              { value: 'preservative_content', label: 'Preservative Content' },
              { value: 'antioxidant_content', label: 'Antioxidant Content' },
            ],
          },
          {
            id: 'microbiological_tests',
            label: 'Microbiological Tests',
            type: 'multi_select',
            helpText: 'Select applicable microbiology tests. Required for non-sterile and sterile products.',
            options: [
              { value: 'sterility', label: 'Sterility Test' },
              { value: 'microbial_limits', label: 'Microbial Limits (TAMC/TYMC)' },
              { value: 'endotoxin', label: 'Bacterial Endotoxin (LAL)' },
              { value: 'preservative_efficacy', label: 'Preservative Efficacy (AET)' },
              { value: 'container_closure_integrity', label: 'Container Closure Integrity' },
            ],
          },
          {
            id: 'analytical_methods_validated',
            label: 'Analytical Methods Validated',
            type: 'select',
            required: true,
            helpText: 'ICH Q2(R1) requires validated stability-indicating analytical methods.',
            options: [
              { value: 'fully_validated', label: 'Fully Validated' },
              { value: 'partially_validated', label: 'Partially Validated' },
              { value: 'validation_planned', label: 'Validation Planned' },
              { value: 'not_validated', label: 'Not Validated' },
            ],
          },
          {
            id: 'reference_standard',
            label: 'Reference Standard',
            type: 'select',
            required: true,
            options: [
              { value: 'usp', label: 'USP Reference Standard' },
              { value: 'ep', label: 'EP Reference Standard' },
              { value: 'who', label: 'WHO International Standard' },
              { value: 'in_house', label: 'In-House Working Standard' },
              { value: 'primary_qualified', label: 'Primary Standard (Qualified)' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'methods_not_validated',
            condition: { field: 'analytical_methods_validated', operator: 'eq', value: 'not_validated' },
            severity: 'critical',
            title: 'Analytical Methods Not Validated',
            message:
              'ICH Q2(R1) requires validated stability-indicating methods that can quantitate the active ingredient and resolve degradation products. Using unvalidated methods may result in unreliable stability data and regulatory rejection. Complete method validation before initiating the stability study.',
            reference: 'ICH Q2(R1), ICH Q1A(R2) Section 2.2',
          },
        ],
        defaultNext: 'acceptance_criteria',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 4 — Acceptance & Photostability                         */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'acceptance_criteria',
        section: 'Acceptance & Photostability',
        question:
          'Define the acceptance criteria for each stability test parameter. These should align with the product specification.',
        guidance:
          'Acceptance criteria for stability testing should be derived from the product specification (ICH Q6A/Q6B) and justified based on batch data. Shelf-life specifications may differ from release specifications where scientifically justified. ICH Q1E provides guidance on statistical evaluation of stability data and shelf-life estimation. Degradation product limits should comply with ICH Q3B.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'assay_acceptance',
            label: 'Assay Acceptance Range',
            type: 'text',
            required: true,
            placeholder: 'e.g. 95.0% - 105.0% of label claim',
          },
          {
            id: 'degradation_product_limits',
            label: 'Individual Degradation Product Limit',
            type: 'text',
            required: true,
            placeholder: 'e.g. NMT 0.2% (identified), NMT 0.1% (unidentified)',
            helpText: 'Limits per ICH Q3B based on maximum daily dose.',
          },
          {
            id: 'total_degradation_limit',
            label: 'Total Degradation Products Limit',
            type: 'text',
            required: true,
            placeholder: 'e.g. NMT 2.0%',
          },
          {
            id: 'dissolution_criteria',
            label: 'Dissolution Acceptance Criteria',
            type: 'text',
            placeholder: 'e.g. Q = 80% in 30 minutes (USP Apparatus 2, 50 rpm)',
            helpText: 'Define the dissolution method, medium, apparatus, and acceptance threshold.',
          },
          {
            id: 'water_content_limit',
            label: 'Water Content Limit',
            type: 'text',
            placeholder: 'e.g. NMT 3.0% w/w',
          },
          {
            id: 'microbial_limits_criteria',
            label: 'Microbial Limits Criteria',
            type: 'text',
            placeholder: 'e.g. TAMC NMT 10^3 CFU/g, TYMC NMT 10^2 CFU/g',
          },
          {
            id: 'shelf_life_vs_release',
            label: 'Shelf-Life Specifications Differ from Release',
            type: 'yes_no',
            required: true,
            helpText: 'Do shelf-life (end-of-life) specifications differ from release specifications?',
          },
          {
            id: 'statistical_approach',
            label: 'Statistical Approach for Shelf-Life Estimation',
            type: 'select',
            required: true,
            helpText: 'ICH Q1E provides guidance on statistical evaluation of stability data.',
            options: [
              { value: 'pooled_regression', label: 'Pooled Linear Regression (ICH Q1E)' },
              { value: 'individual_batch', label: 'Individual Batch Analysis' },
              { value: 'worst_case', label: 'Worst-Case Batch Approach' },
              { value: 'other', label: 'Other Statistical Method' },
            ],
          },
        ],
        defaultNext: 'photostability',
      },

      {
        id: 'photostability',
        section: 'Acceptance & Photostability',
        question:
          'Does this product require photostability testing per ICH Q1B? Define the photostability study design.',
        guidance:
          'ICH Q1B requires photostability testing as an integral part of stability studies for new drug substances and products. The confirmatory study uses the ICH Q1B Option 1 (D65 lamp) or Option 2 (cool white fluorescent + near-UV lamp) to deliver at least 1.2 million lux hours and 200 W h/m2 integrated near-UV energy. If the product is photosensitive, protective packaging must be justified.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'photostability_required',
            label: 'Photostability Testing Required',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1B requires photostability testing for new drug substances and products.',
          },
          {
            id: 'light_source',
            label: 'Light Source (ICH Q1B Option)',
            type: 'select',
            visibleWhen: { field: 'photostability_required', operator: 'eq', value: true },
            options: [
              { value: 'option_1', label: 'Option 1 — D65 / ID65 Lamp' },
              { value: 'option_2', label: 'Option 2 — Cool White Fluorescent + Near-UV' },
            ],
          },
          {
            id: 'exposure_levels',
            label: 'Exposure Levels',
            type: 'textarea',
            visibleWhen: { field: 'photostability_required', operator: 'eq', value: true },
            placeholder: 'e.g. 1.2 million lux hours visible + 200 W h/m2 near-UV',
            helpText: 'ICH Q1B minimum: 1.2 million lux hours + 200 W h/m2 integrated near-UV energy.',
          },
          {
            id: 'photostability_samples',
            label: 'Sample Configuration',
            type: 'multi_select',
            visibleWhen: { field: 'photostability_required', operator: 'eq', value: true },
            helpText: 'Select all sample configurations to be tested.',
            options: [
              { value: 'exposed_direct', label: 'Directly Exposed (No Container)' },
              { value: 'in_container', label: 'In Marketing Container' },
              { value: 'dark_control', label: 'Dark Control (Wrapped in Foil)' },
              { value: 'secondary_packaging', label: 'In Secondary Packaging' },
            ],
          },
          {
            id: 'photosensitive',
            label: 'Product Known to Be Photosensitive',
            type: 'yes_no',
            helpText: 'Has previous testing or literature indicated photosensitivity?',
          },
          {
            id: 'protective_packaging',
            label: 'Protective Packaging Required',
            type: 'yes_no',
            visibleWhen: { field: 'photosensitive', operator: 'eq', value: true },
            helpText: 'If photosensitive, protective packaging (amber glass, overwrap, etc.) may be needed.',
          },
        ],
        issueChecks: [
          {
            id: 'no_photostability_nme',
            condition: { field: 'photostability_required', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Photostability Testing May Be Required',
            message:
              'ICH Q1B mandates photostability testing for new drug substances and products. If this is a new molecular entity, photostability testing is required unless justified otherwise. Ensure the decision to omit photostability testing is scientifically justified and documented.',
            reference: 'ICH Q1B',
          },
        ],
        defaultNext: 'reduced_testing',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 5 — Study Optimization                                  */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'reduced_testing',
        section: 'Study Optimization',
        question:
          'Is reduced testing being considered for this stability study? Provide the scientific justification.',
        guidance:
          'ICH Q1A(R2) Section 2.2.5 permits reduced testing where justified, meaning that at certain time points a subset of tests may be performed rather than the full panel. This must be scientifically justified based on knowledge of the degradation profile and results from accelerated/stress studies. The full panel must be performed at initial and final time points.',
        fields: [
          {
            id: 'reduced_testing_applied',
            label: 'Reduced Testing Applied',
            type: 'yes_no',
            required: true,
            helpText: 'Will a reduced testing schedule be used at any time point?',
          },
          {
            id: 'reduced_testing_justification',
            label: 'Scientific Justification',
            type: 'textarea',
            visibleWhen: { field: 'reduced_testing_applied', operator: 'eq', value: true },
            placeholder: 'Provide the scientific basis for reduced testing (e.g., prior stability data, degradation pathway knowledge)',
            helpText: 'Full testing is required at initial and final time points. Justify which tests can be omitted at intermediate intervals.',
          },
          {
            id: 'tests_at_reduced_intervals',
            label: 'Tests Performed at Reduced Intervals',
            type: 'multi_select',
            visibleWhen: { field: 'reduced_testing_applied', operator: 'eq', value: true },
            helpText: 'Select tests that will be performed at every time point even under reduced testing.',
            options: [
              { value: 'assay', label: 'Assay' },
              { value: 'degradation', label: 'Degradation Products' },
              { value: 'appearance', label: 'Appearance' },
              { value: 'dissolution', label: 'Dissolution' },
              { value: 'water_content', label: 'Water Content' },
              { value: 'microbial', label: 'Microbiological Testing' },
            ],
          },
          {
            id: 'tests_omitted_at_intervals',
            label: 'Tests Omitted at Intermediate Intervals',
            type: 'textarea',
            visibleWhen: { field: 'reduced_testing_applied', operator: 'eq', value: true },
            placeholder: 'List tests that will not be performed at intermediate time points and justify why',
          },
        ],
        defaultNext: 'bracketing_matrixing',
      },

      {
        id: 'bracketing_matrixing',
        section: 'Study Optimization',
        question:
          'Will bracketing or matrixing designs be used to reduce the testing burden? ICH Q1D provides guidance on these approaches.',
        guidance:
          'ICH Q1D allows bracketing (testing only the extremes of design factors such as container sizes or strengths) and matrixing (a fractional factorial design testing subsets at each time point). Both approaches must be pre-approved in the protocol and scientifically justified. Matrixing requires that all factors (time points, conditions, strengths) eventually be tested. These designs reduce cost and resource use but increase statistical complexity.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'design_approach',
            label: 'Study Design Approach',
            type: 'select',
            required: true,
            options: [
              { value: 'full', label: 'Full Design (No Reduction)' },
              { value: 'bracketing', label: 'Bracketing Design (ICH Q1D)' },
              { value: 'matrixing', label: 'Matrixing Design (ICH Q1D)' },
              { value: 'combined', label: 'Combined Bracketing + Matrixing' },
            ],
          },
          {
            id: 'bracketing_factors',
            label: 'Bracketing Factors',
            type: 'multi_select',
            visibleWhen: { field: 'design_approach', operator: 'in', value: ['bracketing', 'combined'] },
            helpText: 'Select the design factors where only extremes will be tested.',
            options: [
              { value: 'container_size', label: 'Container Size (Smallest & Largest)' },
              { value: 'strength', label: 'Strength (Lowest & Highest)' },
              { value: 'fill_volume', label: 'Fill Volume' },
            ],
          },
          {
            id: 'matrixing_factors',
            label: 'Matrixing Factors',
            type: 'multi_select',
            visibleWhen: { field: 'design_approach', operator: 'in', value: ['matrixing', 'combined'] },
            helpText: 'Select the factors included in the matrixing design.',
            options: [
              { value: 'time_points', label: 'Time Points' },
              { value: 'strengths', label: 'Strengths' },
              { value: 'container_sizes', label: 'Container Sizes' },
              { value: 'batches', label: 'Batches' },
            ],
          },
          {
            id: 'matrixing_coverage',
            label: 'Matrixing Coverage Target',
            type: 'select',
            visibleWhen: { field: 'design_approach', operator: 'in', value: ['matrixing', 'combined'] },
            helpText: 'ICH Q1D recommends at least 50% coverage for any factor/time point combination.',
            options: [
              { value: '50_pct', label: '50% Coverage (ICH Q1D Minimum)' },
              { value: '67_pct', label: '67% Coverage (Two-Thirds)' },
              { value: '75_pct', label: '75% Coverage' },
            ],
          },
          {
            id: 'design_justification',
            label: 'Design Justification',
            type: 'textarea',
            required: true,
            placeholder: 'Provide scientific justification for the chosen design approach',
            helpText: 'For bracketing/matrixing, justify that omitted combinations would not differ significantly from tested ones.',
          },
          {
            id: 'regulatory_agreement',
            label: 'Regulatory Agreement Obtained',
            type: 'select',
            helpText: 'Has the design been discussed with or agreed upon by the regulatory authority?',
            options: [
              { value: 'yes', label: 'Yes — Regulatory Agreement Obtained' },
              { value: 'planned', label: 'Planned — Will Seek Agreement' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
