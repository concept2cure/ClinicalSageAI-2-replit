/**
 * Stability Study flow definition for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through stability study design and data
 * collection per ICH Q1A-Q1F, covering product and formulation overview,
 * study design and conditions, testing schedule and parameters, data
 * analysis and shelf life determination, and post-approval commitments.
 *
 * 14 nodes · 65+ fields · 5 sections · 10+ issue checks
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
      'Comprehensive questionnaire for stability studies per ICH Q1A(R2) through Q1F, covering product and formulation overview, study design and conditions, testing schedule and parameters, data analysis and shelf life determination, and commitments and post-approval stability requirements.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'product_formulation_overview',
    estimatedMinutes: 50,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'product_formulation',
        label: 'Product & Formulation Overview',
        nodeIds: ['product_formulation_overview', 'formulation_details', 'container_closure'],
      },
      {
        id: 'study_design',
        label: 'Study Design & Conditions',
        nodeIds: ['study_type_selection', 'storage_conditions', 'climatic_zone_selection'],
      },
      {
        id: 'testing_schedule',
        label: 'Testing Schedule & Parameters',
        nodeIds: ['testing_intervals', 'test_parameters', 'photostability', 'biologics_stability'],
      },
      {
        id: 'data_analysis',
        label: 'Data Analysis & Shelf Life',
        nodeIds: ['data_evaluation', 'shelf_life_determination', 'out_of_spec_handling'],
      },
      {
        id: 'commitments_post_approval',
        label: 'Commitments & Post-Approval',
        nodeIds: ['ongoing_stability', 'post_approval_commitments'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Product & Formulation Overview                      */
      /* ================================================================ */

      {
        id: 'product_formulation_overview',
        section: 'product_formulation',
        question:
          'Let\'s begin with the product information. Is this a stability study for a drug substance or drug product, and what are the key attributes?',
        guidance:
          'Per ICH Q1A(R2) Section 2, stability testing should cover the drug substance and drug product separately. The scope, design, and acceptance criteria differ. ICH Q1A(R2) applies to new molecular entities and new drug products. ICH Q1C covers new dosage forms, and ICH Q1D provides guidance on bracketing and matrixing. For biologics, ICH Q5C "Quality of Biotechnological Products: Stability Testing of Biotechnological/Biological Products" applies in addition to Q1A(R2).',
        fields: [
          {
            id: 'study_subject',
            label: 'Study Subject',
            type: 'select',
            required: true,
            options: [
              { value: 'drug_substance', label: 'Drug Substance', description: 'Active pharmaceutical ingredient (API)' },
              { value: 'drug_product', label: 'Drug Product', description: 'Finished dosage form' },
              { value: 'both', label: 'Both Drug Substance and Drug Product' },
            ],
          },
          {
            id: 'product_name',
            label: 'Product Name (Generic / INN)',
            type: 'text',
            placeholder: 'e.g., remdesivir',
            required: true,
          },
          {
            id: 'compound_code',
            label: 'Internal Compound Code',
            type: 'text',
            placeholder: 'e.g., ABC-1234',
          },
          {
            id: 'is_biologic',
            label: 'Is this a biologic product?',
            type: 'yes_no',
            required: true,
            helpText: 'Biologic products (proteins, monoclonal antibodies, vaccines) require additional stability considerations per ICH Q5C including potency testing, aggregation monitoring, and particulate matter assessment.',
          },
          {
            id: 'submission_stage',
            label: 'Regulatory Submission Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'ind', label: 'IND / CTA — Investigational Stage' },
              { value: 'nda_bla', label: 'NDA / BLA — Registration Stage' },
              { value: 'post_approval', label: 'Post-Approval — Variation / Supplement' },
              { value: 'development', label: 'Early Development (Pre-IND)' },
            ],
            helpText: 'The extent of stability data required depends on the submission stage. Per ICH Q1A(R2), NDA/BLA filing requires at least 12 months long-term and 6 months accelerated data on at least three primary (pilot or production) batches.',
          },
          {
            id: 'regulatory_markets',
            label: 'Target Regulatory Markets',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'us_fda', label: 'United States (FDA)' },
              { value: 'eu_ema', label: 'European Union (EMA)' },
              { value: 'japan_pmda', label: 'Japan (PMDA)' },
              { value: 'china_nmpa', label: 'China (NMPA)' },
              { value: 'who', label: 'WHO Prequalification' },
              { value: 'row', label: 'Rest of World' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'is_biologic', operator: 'eq', value: true },
            goto: 'formulation_details',
          },
        ],
        defaultNext: 'formulation_details',
      },

      {
        id: 'formulation_details',
        section: 'product_formulation',
        question:
          'Describe the formulation composition and key quality attributes relevant to stability.',
        guidance:
          'Per ICH Q1A(R2), the stability study design must be informed by the product\'s composition and known degradation pathways. Identify stability-indicating quality attributes — these are the critical quality attributes (CQAs) per ICH Q8(R2) that are susceptible to change during storage. For drug substances, describe physicochemical properties including polymorphism, hygroscopicity, and light sensitivity. For drug products, describe the formulation composition, excipient compatibility, and any known degradation products.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'solution_injection', label: 'Solution for Injection' },
              { value: 'lyophilized', label: 'Lyophilized Powder' },
              { value: 'suspension', label: 'Suspension' },
              { value: 'cream_ointment', label: 'Cream / Ointment' },
              { value: 'inhaler', label: 'Metered Dose Inhaler / Dry Powder Inhaler' },
              { value: 'ophthalmic', label: 'Ophthalmic Solution / Suspension' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'oral_solution', label: 'Oral Solution / Syrup' },
              { value: 'suppository', label: 'Suppository' },
              { value: 'api_only', label: 'API / Drug Substance Only' },
            ],
            visibleWhen: { field: 'study_subject', operator: 'neq', value: 'drug_substance' },
          },
          {
            id: 'strengths',
            label: 'Strength(s) Under Study',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg tablets; or 10 mg/mL solution',
            required: true,
          },
          {
            id: 'formulation_composition',
            label: 'Formulation Composition Summary',
            type: 'textarea',
            placeholder: 'e.g., Drug substance (5%), microcrystalline cellulose (60%), lactose monohydrate (25%), croscarmellose sodium (5%), magnesium stearate (1%), HPMC film coat (4%).',
            required: true,
            visibleWhen: { field: 'study_subject', operator: 'neq', value: 'drug_substance' },
          },
          {
            id: 'known_degradation_pathways',
            label: 'Known Degradation Pathways',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'hydrolysis', label: 'Hydrolysis' },
              { value: 'oxidation', label: 'Oxidation' },
              { value: 'photolysis', label: 'Photolysis' },
              { value: 'thermal', label: 'Thermal Degradation' },
              { value: 'racemization', label: 'Racemization' },
              { value: 'deamidation', label: 'Deamidation (proteins)' },
              { value: 'aggregation', label: 'Aggregation (proteins)' },
              { value: 'fragmentation', label: 'Fragmentation (proteins)' },
              { value: 'not_fully_characterized', label: 'Not Fully Characterized' },
            ],
          },
          {
            id: 'physicochemical_properties',
            label: 'Key Physicochemical Properties Relevant to Stability',
            type: 'textarea',
            placeholder: 'e.g., pKa 6.8, hygroscopic (>75% RH), light-sensitive, crystalline Form A. BCS Class II. Melting point 185-188°C.',
          },
          {
            id: 'excipient_compatibility_assessed',
            label: 'Excipient Compatibility Studies Completed?',
            type: 'yes_no',
            visibleWhen: { field: 'study_subject', operator: 'neq', value: 'drug_substance' },
            helpText: 'Excipient compatibility studies (e.g., binary mixture studies at stressed conditions) help identify potential drug-excipient interactions that could affect stability.',
          },
        ],
        defaultNext: 'container_closure',
      },

      {
        id: 'container_closure',
        section: 'product_formulation',
        question:
          'Describe the container closure system(s) used for stability studies. The container closure must be the same as or representative of the marketed product.',
        guidance:
          'Per ICH Q1A(R2) Section 2.2.7, stability studies should be conducted on the drug substance or product packaged in the container closure system proposed for marketing. If multiple sizes or configurations are proposed, bracketing per ICH Q1D may be applicable. For semi-permeable containers (e.g., LDPE bags for IV solutions), additional conditions may be needed per ICH Q1A(R2) to evaluate water loss. Container closure integrity and extractables/leachables (E&L) considerations per USP <1663>/<1664> should also be addressed.',
        fields: [
          {
            id: 'container_closure_description',
            label: 'Container Closure System Description',
            type: 'textarea',
            placeholder: 'e.g., 30-count HDPE bottle with PP child-resistant cap and heat-induction seal, with desiccant (1g silica gel). OR: 10 mL Type I borosilicate glass vial with 20mm bromobutyl rubber stopper and aluminum flip-off seal.',
            required: true,
          },
          {
            id: 'multiple_configurations',
            label: 'Are Multiple Container Sizes or Configurations Proposed?',
            type: 'yes_no',
            helpText: 'Per ICH Q1D, if multiple configurations are proposed, bracketing and matrixing designs may be used to reduce the number of stability samples.',
          },
          {
            id: 'configurations_detail',
            label: 'Container Configurations Under Study',
            type: 'textarea',
            placeholder: 'e.g., 30-count, 60-count, and 90-count HDPE bottles. Bracketing: test 30-count and 90-count at all time points.',
            visibleWhen: { field: 'multiple_configurations', operator: 'eq', value: true },
          },
          {
            id: 'semi_permeable_container',
            label: 'Is the Container Semi-Permeable?',
            type: 'yes_no',
            helpText: 'Semi-permeable containers (LDPE bags, certain blister packs) require additional stability testing at low humidity conditions (e.g., 25°C/40% RH) to evaluate water loss per ICH Q1A(R2).',
          },
          {
            id: 'el_studies_completed',
            label: 'Extractables and Leachables (E&L) Studies Completed?',
            type: 'yes_no',
            helpText: 'Per USP <1663>/<1664> and FDA guidance, E&L studies are expected for parenteral, ophthalmic, and inhaled products. E&L data should be correlated with stability data.',
          },
        ],
        defaultNext: 'study_type_selection',
      },

      /* ================================================================ */
      /*  Section 2 — Study Design & Conditions                           */
      /* ================================================================ */

      {
        id: 'study_type_selection',
        section: 'study_design',
        question:
          'What type of stability study is being designed? Select the study purpose and approach.',
        guidance:
          'Per ICH Q1A(R2), stability studies include: (1) Stress testing (forced degradation) to identify degradation pathways and demonstrate method specificity — per Section 2.1.2. (2) Accelerated studies at elevated conditions to predict shelf life — typically 6 months at 40°C/75% RH. (3) Long-term studies at the proposed storage conditions — per ICH Q1A(R2) Section 2.2.7, minimum 12 months at NDA/BLA filing, with 36 months to support full shelf life. (4) Intermediate studies at 30°C/65% RH — required if significant change occurs under accelerated conditions.',
        fields: [
          {
            id: 'study_types',
            label: 'Study Type(s)',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'stress', label: 'Stress Testing / Forced Degradation', description: 'ICH Q1A(R2) Section 2.1.2' },
              { value: 'accelerated', label: 'Accelerated Stability', description: '40°C/75% RH for 6 months' },
              { value: 'intermediate', label: 'Intermediate Stability', description: '30°C/65% RH' },
              { value: 'long_term', label: 'Long-Term Stability', description: 'Proposed storage condition' },
              { value: 'in_use', label: 'In-Use Stability', description: 'After opening / reconstitution' },
              { value: 'photostability', label: 'Photostability', description: 'Per ICH Q1B' },
              { value: 'freeze_thaw', label: 'Freeze-Thaw Cycling', description: 'For liquid formulations' },
            ],
          },
          {
            id: 'study_purpose',
            label: 'Primary Purpose of This Study',
            type: 'select',
            required: true,
            options: [
              { value: 'registration', label: 'Registration / Filing (NDA/BLA/MAA)' },
              { value: 'ind_support', label: 'IND / CTA Support' },
              { value: 'shelf_life_extension', label: 'Shelf-Life Extension' },
              { value: 'post_approval_change', label: 'Post-Approval Change (SUPAC)' },
              { value: 'development', label: 'Development / Formulation Optimization' },
              { value: 'annual_batch', label: 'Annual / Ongoing Stability Commitment' },
            ],
          },
          {
            id: 'bracketing_matrixing_used',
            label: 'Is Bracketing or Matrixing Being Used?',
            type: 'select',
            options: [
              { value: 'none', label: 'No — Full design at all time points' },
              { value: 'bracketing', label: 'Bracketing per ICH Q1D' },
              { value: 'matrixing', label: 'Matrixing per ICH Q1D' },
              { value: 'both', label: 'Both Bracketing and Matrixing' },
            ],
            helpText: 'Per ICH Q1D, bracketing tests only the extremes (e.g., lowest and highest strengths), while matrixing is a fractional factorial design that tests a subset of the full design at each time point.',
          },
          {
            id: 'bracketing_matrixing_justification',
            label: 'Bracketing/Matrixing Justification',
            type: 'textarea',
            visibleWhen: { field: 'bracketing_matrixing_used', operator: 'in', value: ['bracketing', 'matrixing', 'both'] },
            placeholder: 'e.g., Bracketing justified for 30-count and 90-count bottles as the 60-count uses identical material and has an intermediate surface-to-volume ratio.',
          },
        ],
        defaultNext: 'storage_conditions',
      },

      {
        id: 'storage_conditions',
        section: 'study_design',
        question:
          'Define the storage conditions for each study type. ICH Q1A(R2) specifies standard conditions based on climatic zone.',
        guidance:
          'Per ICH Q1A(R2) Table 1, the standard long-term conditions are: Zone I/II: 25°C ± 2°C / 60% RH ± 5% RH. Zone III: 30°C ± 2°C / 65% RH ± 5% RH. Zone IVa: 30°C ± 2°C / 65% RH ± 5% RH. Zone IVb: 30°C ± 2°C / 75% RH ± 5% RH. Accelerated: 40°C ± 2°C / 75% RH ± 5% RH (all zones). Intermediate: 30°C ± 2°C / 65% RH ± 5% RH. For refrigerated products: Long-term 5°C ± 3°C; Accelerated 25°C ± 2°C / 60% RH ± 5% RH. For frozen products: Long-term -20°C ± 5°C. Per ICH Q1F (withdrawn but informative), Zone III/IV conditions are used for global submissions.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'proposed_storage_condition',
            label: 'Proposed Commercial Storage Condition',
            type: 'select',
            required: true,
            options: [
              { value: 'room_temp', label: 'Room Temperature (25°C/60% RH)' },
              { value: 'controlled_room', label: 'Controlled Room Temperature (25°C/60% RH with excursions to 40°C)' },
              { value: 'intermediate', label: 'Intermediate (30°C/65% RH)' },
              { value: 'refrigerated', label: 'Refrigerated (5°C ± 3°C)' },
              { value: 'frozen', label: 'Frozen (-20°C ± 5°C)' },
              { value: 'below_minus_60', label: 'Ultra-Cold (-60°C to -80°C)' },
            ],
          },
          {
            id: 'long_term_conditions',
            label: 'Long-Term Study Conditions',
            type: 'text',
            placeholder: 'e.g., 25°C ± 2°C / 60% RH ± 5% RH',
            required: true,
          },
          {
            id: 'accelerated_conditions',
            label: 'Accelerated Study Conditions',
            type: 'text',
            placeholder: 'e.g., 40°C ± 2°C / 75% RH ± 5% RH',
            required: true,
          },
          {
            id: 'intermediate_conditions',
            label: 'Intermediate Study Conditions (if applicable)',
            type: 'text',
            placeholder: 'e.g., 30°C ± 2°C / 65% RH ± 5% RH',
            helpText: 'Intermediate conditions are required if significant change occurs during the 6-month accelerated study per ICH Q1A(R2) Section 2.2.7.',
          },
          {
            id: 'additional_conditions',
            label: 'Additional Study Conditions',
            type: 'textarea',
            placeholder: 'e.g., Low humidity: 25°C / 40% RH (semi-permeable containers). Light exposure: per ICH Q1B Option 2.',
          },
          {
            id: 'chamber_qualification',
            label: 'Are Stability Chambers Qualified and Monitored?',
            type: 'yes_no',
            required: true,
            helpText: 'Stability chambers must be qualified (IQ/OQ/PQ) and continuously monitored with calibrated sensors. Temperature and humidity mapping should demonstrate uniformity within ± specified tolerances.',
          },
        ],
        defaultNext: 'climatic_zone_selection',
        issueChecks: [
          {
            id: 'chamber_not_qualified',
            condition: { field: 'chamber_qualification', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Stability Chambers Not Qualified',
            message:
              'Stability chambers must be qualified (IQ/OQ/PQ) per GMP requirements and continuously monitored with calibrated instruments. Data from unqualified chambers may not be accepted by regulatory authorities and could jeopardize the stability filing.',
            reference: 'ICH Q1A(R2); 21 CFR 211.68; EU GMP Annex 15',
          },
        ],
      },

      {
        id: 'climatic_zone_selection',
        section: 'study_design',
        question:
          'What climatic zone(s) apply to the target markets? This determines the long-term storage conditions.',
        guidance:
          'The ICH climatic zone classification (based on WHO Technical Report Series) determines the long-term stability test conditions. Zone I (Temperate): 21°C / 45% RH. Zone II (Subtropical/Mediterranean): 25°C / 60% RH. Zone III (Hot/Dry): 30°C / 35% RH. Zone IVa (Hot/Humid): 30°C / 65% RH. Zone IVb (Hot/Very Humid): 30°C / 75% RH. ICH Q1F was withdrawn in 2006, but the Zone IVb conditions remain in use for tropical markets. For global submissions, testing at Zone IVb conditions covers all zones.',
        fields: [
          {
            id: 'climatic_zones',
            label: 'Target Climatic Zones',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'zone_i', label: 'Zone I — Temperate (Northern Europe, Canada)', description: '21°C / 45% RH' },
              { value: 'zone_ii', label: 'Zone II — Subtropical/Mediterranean (USA, Southern Europe, Japan)', description: '25°C / 60% RH' },
              { value: 'zone_iii', label: 'Zone III — Hot/Dry (Middle East, parts of Africa)', description: '30°C / 35% RH' },
              { value: 'zone_iva', label: 'Zone IVa — Hot/Humid (Southeast Asia, Brazil)', description: '30°C / 65% RH' },
              { value: 'zone_ivb', label: 'Zone IVb — Hot/Very Humid (Tropical regions)', description: '30°C / 75% RH' },
            ],
          },
          {
            id: 'global_conditions_strategy',
            label: 'Strategy for Multi-Zone Submissions',
            type: 'select',
            visibleWhen: { field: 'climatic_zones', operator: 'contains', value: 'zone_iva' },
            options: [
              { value: 'zone_ivb_covers_all', label: 'Test at Zone IVb conditions (covers all zones)' },
              { value: 'separate_studies', label: 'Separate studies for each zone' },
              { value: 'zone_ii_plus_zone_iv', label: 'Zone II long-term + Zone IVa/b long-term' },
            ],
            helpText: 'For global filings, testing at the most stringent conditions (Zone IVb: 30°C/75% RH) covers all lower zones. However, some regulatory authorities may require data at their specific conditions.',
          },
          {
            id: 'label_storage_statement',
            label: 'Proposed Label Storage Statement',
            type: 'text',
            placeholder: 'e.g., Store at 25°C (77°F); excursions permitted to 15-30°C (59-86°F). OR: Refrigerate at 2-8°C (36-46°F). Do not freeze.',
            required: true,
          },
        ],
        branches: [
          {
            when: { field: 'study_subject', operator: 'eq', value: 'drug_substance' },
            goto: 'testing_intervals',
          },
        ],
        defaultNext: 'testing_intervals',
      },

      /* ================================================================ */
      /*  Section 3 — Testing Schedule & Parameters                       */
      /* ================================================================ */

      {
        id: 'testing_intervals',
        section: 'testing_schedule',
        question:
          'Define the testing schedule. ICH Q1A(R2) specifies minimum testing intervals for each study type.',
        guidance:
          'Per ICH Q1A(R2) Section 2.2.7: Long-term studies: test at 0, 3, 6, 9, 12, 18, 24, 36 months (annually thereafter). Accelerated studies: test at 0, 1, 2, 3, and 6 months (minimum). Intermediate studies: test at 0, 6, 9, and 12 months (minimum). For NDA/BLA filing, at least 12 months long-term data and 6 months accelerated data on three primary batches are required. If matrixing is used per ICH Q1D, not all parameters need to be tested at every time point.',
        fields: [
          {
            id: 'long_term_intervals',
            label: 'Long-Term Testing Intervals',
            type: 'multi_select',
            required: true,
            options: [
              { value: '0', label: '0 months (initial)' },
              { value: '1', label: '1 month' },
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
          },
          {
            id: 'accelerated_intervals',
            label: 'Accelerated Testing Intervals',
            type: 'multi_select',
            required: true,
            options: [
              { value: '0', label: '0 months (initial)' },
              { value: '1', label: '1 month' },
              { value: '2', label: '2 months' },
              { value: '3', label: '3 months' },
              { value: '6', label: '6 months' },
            ],
          },
          {
            id: 'intermediate_intervals',
            label: 'Intermediate Testing Intervals (if applicable)',
            type: 'multi_select',
            options: [
              { value: '0', label: '0 months (initial)' },
              { value: '6', label: '6 months' },
              { value: '9', label: '9 months' },
              { value: '12', label: '12 months' },
            ],
          },
          {
            id: 'number_of_batches',
            label: 'Number of Batches on Stability',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'Per ICH Q1A(R2), a minimum of three primary (pilot-scale or production-scale) batches is required for NDA/BLA filing. For IND, one or two batches may be acceptable initially.',
          },
          {
            id: 'batch_type',
            label: 'Batch Type',
            type: 'select',
            required: true,
            options: [
              { value: 'pilot', label: 'Pilot Scale' },
              { value: 'production', label: 'Production Scale' },
              { value: 'mixed', label: 'Mix of Pilot and Production' },
              { value: 'lab', label: 'Laboratory Scale (development only)' },
            ],
            helpText: 'Per ICH Q1A(R2), pilot-scale batches should be at least 1/10th of production scale or 100,000 units (whichever is larger). Production-scale batches are preferred for registration.',
          },
          {
            id: 'batch_identifiers',
            label: 'Batch Identifiers',
            type: 'textarea',
            placeholder: 'e.g., Batch 001 (pilot, Jan 2024), Batch 002 (pilot, Mar 2024), Batch 003 (production, Jun 2024)',
          },
        ],
        defaultNext: 'test_parameters',
        issueChecks: [
          {
            id: 'insufficient_batches',
            condition: { field: 'number_of_batches', operator: 'lt', value: 3 },
            severity: 'critical',
            title: 'Insufficient Batches for Registration Filing',
            message:
              'Per ICH Q1A(R2), a minimum of three primary batches is required for NDA/BLA/MAA registration filing. If fewer than three batches are available, additional batches must be placed on stability and data provided as post-approval commitments. This is a frequent FDA review comment.',
            reference: 'ICH Q1A(R2) Section 2.2.1',
          },
        ],
      },

      {
        id: 'test_parameters',
        section: 'testing_schedule',
        question:
          'What stability-indicating parameters will be tested? Include all CQAs relevant to shelf life.',
        guidance:
          'Per ICH Q1A(R2) Section 2.2.6, the testing should cover physical, chemical, biological, and microbiological attributes susceptible to change during storage. For drug substances: appearance, assay, impurities (related substances), residual solvents (initially), and any substance-specific tests. For drug products: appearance, assay, degradation products, dissolution (oral solids), hardness, friability, moisture, pH (liquids), particulate matter (parenterals), sterility (sterile products), preservative content (multi-dose), and any dosage-form-specific tests. All analytical methods must be stability-indicating per ICH Q2(R2).',
        fields: [
          {
            id: 'physical_tests',
            label: 'Physical Tests',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'appearance', label: 'Appearance (color, form, clarity)' },
              { value: 'ph', label: 'pH' },
              { value: 'moisture_content', label: 'Moisture Content / Water Activity' },
              { value: 'hardness', label: 'Hardness (tablets)' },
              { value: 'friability', label: 'Friability (tablets)' },
              { value: 'particle_size', label: 'Particle Size Distribution' },
              { value: 'viscosity', label: 'Viscosity' },
              { value: 'weight_variation', label: 'Weight Variation' },
              { value: 'delivered_dose', label: 'Delivered Dose Uniformity (inhalers)' },
            ],
          },
          {
            id: 'chemical_tests',
            label: 'Chemical Tests',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'assay', label: 'Assay (content / potency)' },
              { value: 'related_substances', label: 'Related Substances / Degradation Products' },
              { value: 'dissolution', label: 'Dissolution' },
              { value: 'content_uniformity', label: 'Content Uniformity' },
              { value: 'preservative_content', label: 'Preservative Content' },
              { value: 'antioxidant_content', label: 'Antioxidant Content' },
              { value: 'residual_solvents', label: 'Residual Solvents (initial only)' },
              { value: 'extractables', label: 'Extractables' },
              { value: 'nitrosamines', label: 'Nitrosamine Impurities' },
            ],
          },
          {
            id: 'biological_tests',
            label: 'Biological Tests (Biologics)',
            type: 'multi_select',
            visibleWhen: { field: 'is_biologic', operator: 'eq', value: true },
            options: [
              { value: 'potency', label: 'Potency / Biological Activity' },
              { value: 'aggregation', label: 'Aggregation (SEC, DLS)' },
              { value: 'charge_variants', label: 'Charge Variants (iCIEF, CEX)' },
              { value: 'glycosylation', label: 'Glycosylation Profile' },
              { value: 'subvisible_particles', label: 'Subvisible Particulate Matter (USP <787>)' },
              { value: 'oxidation', label: 'Oxidation (Met, Trp)' },
              { value: 'fragmentation', label: 'Fragmentation (rCE-SDS)' },
            ],
          },
          {
            id: 'microbiological_tests',
            label: 'Microbiological Tests',
            type: 'multi_select',
            options: [
              { value: 'sterility', label: 'Sterility (USP <71>)' },
              { value: 'endotoxin', label: 'Bacterial Endotoxins (USP <85>)' },
              { value: 'microbial_limits', label: 'Microbial Limits (USP <61>/<62>)' },
              { value: 'preservative_effectiveness', label: 'Preservative Effectiveness (USP <51>)' },
              { value: 'container_closure_integrity', label: 'Container Closure Integrity (USP <1207>)' },
            ],
          },
          {
            id: 'stability_indicating_method_validated',
            label: 'Are All Analytical Methods Stability-Indicating and Validated per ICH Q2(R2)?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q2(R2) and ICH Q1A(R2), all stability test methods must be stability-indicating (capable of detecting degradation products) and validated for specificity, linearity, accuracy, precision, range, and robustness.',
          },
        ],
        branches: [
          {
            when: { field: 'is_biologic', operator: 'eq', value: true },
            goto: 'biologics_stability',
          },
        ],
        defaultNext: 'photostability',
        issueChecks: [
          {
            id: 'methods_not_validated',
            condition: { field: 'stability_indicating_method_validated', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Stability-Indicating Methods Not Validated',
            message:
              'All analytical methods used for stability testing must be stability-indicating and validated per ICH Q2(R2). Without validated methods, stability data may not be accepted by regulatory authorities. Forced degradation studies per ICH Q1A(R2) Section 2.1.2 are essential to demonstrate method specificity.',
            reference: 'ICH Q2(R2); ICH Q1A(R2) Section 2.1.2',
          },
        ],
      },

      {
        id: 'photostability',
        section: 'testing_schedule',
        question:
          'Has photostability testing been conducted per ICH Q1B? This is a required component of the stability package.',
        guidance:
          'ICH Q1B "Photostability Testing of New Drug Substances and Drug Products" (1996) requires confirmatory photostability testing. Two options are provided: Option 1 (sequential exposure to UV and visible light) or Option 2 (simultaneous exposure). Exposure conditions: not less than 1.2 million lux hours of visible light and not less than 200 watt hours/m² of UV light. Testing should be conducted on unprotected and protected (in marketed packaging) samples. If the product is photolabile, the labeling must include a "Protect from light" statement.',
        fields: [
          {
            id: 'photostability_completed',
            label: 'Has Photostability Testing Been Completed per ICH Q1B?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'photostability_option',
            label: 'ICH Q1B Option Used',
            type: 'select',
            visibleWhen: { field: 'photostability_completed', operator: 'eq', value: true },
            options: [
              { value: 'option_1', label: 'Option 1 — Sequential UV then Visible Light' },
              { value: 'option_2', label: 'Option 2 — Simultaneous UV and Visible Light' },
            ],
          },
          {
            id: 'photostability_results_summary',
            label: 'Photostability Results Summary',
            type: 'textarea',
            placeholder: 'e.g., Drug substance: no significant change on unprotected sample. Drug product in marketed packaging: no significant change. Protected by amber glass vial. Conclusion: Product is not photolabile in proposed packaging.',
            visibleWhen: { field: 'photostability_completed', operator: 'eq', value: true },
          },
          {
            id: 'light_protection_required',
            label: 'Is Light Protection Required in Labeling?',
            type: 'yes_no',
            visibleWhen: { field: 'photostability_completed', operator: 'eq', value: true },
            helpText: 'If unprotected samples show significant change, the label must include "Protect from Light" and the packaging must provide adequate light protection.',
          },
        ],
        defaultNext: 'data_evaluation',
        issueChecks: [
          {
            id: 'no_photostability',
            condition: { field: 'photostability_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Photostability Testing Not Completed',
            message:
              'Photostability testing per ICH Q1B is a mandatory component of the stability package for new drug substances and drug products. This is a common deficiency cited in FDA review. Complete photostability testing using Option 1 or Option 2 conditions before filing.',
            reference: 'ICH Q1B (1996); ICH Q1A(R2) Section 2.1.2',
          },
        ],
      },

      {
        id: 'biologics_stability',
        section: 'testing_schedule',
        question:
          'This is a biologic product. Provide additional stability information specific to biotechnological/biological products per ICH Q5C.',
        guidance:
          'ICH Q5C "Quality of Biotechnological Products: Stability Testing of Biotechnological/Biological Products" (1995) supplements ICH Q1A(R2) for biologics. Key additional requirements include: (1) Potency testing at each stability time point, (2) Aggregation monitoring by SEC and subvisible particle counts per USP <787>, (3) Charge variant analysis, (4) Glycosylation profile monitoring, (5) Oxidation assessment. For proteins, accelerated conditions may not follow Arrhenius kinetics — non-Arrhenius behavior should be documented. Freeze-thaw cycling studies are required for frozen products. In-use stability after first puncture is required for multi-dose vials.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'potency_testing_included',
            label: 'Is Potency Testing Included at All Stability Time Points?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q5C, potency (biological activity) must be monitored throughout the stability program. Use a validated potency assay — cell-based assays are preferred where applicable.',
          },
          {
            id: 'aggregation_monitoring',
            label: 'Aggregation Monitoring Methods',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'sec', label: 'Size Exclusion Chromatography (SEC)' },
              { value: 'dls', label: 'Dynamic Light Scattering (DLS)' },
              { value: 'auc', label: 'Analytical Ultracentrifugation (AUC)' },
              { value: 'fi', label: 'Flow Imaging (MFI / FlowCAM)' },
              { value: 'usp787', label: 'Subvisible Particles (USP <787>)' },
              { value: 'visual', label: 'Visual Inspection' },
            ],
          },
          {
            id: 'freeze_thaw_study',
            label: 'Freeze-Thaw Cycling Study Completed?',
            type: 'yes_no',
            helpText: 'Required for liquid formulations stored frozen. Typically 3-5 freeze-thaw cycles with testing for aggregation, potency, and appearance.',
          },
          {
            id: 'in_use_stability',
            label: 'In-Use Stability Study Completed?',
            type: 'yes_no',
            helpText: 'Required for multi-dose vials and products requiring reconstitution or dilution. In-use stability defines the usage period after first opening.',
          },
          {
            id: 'in_use_period',
            label: 'Proposed In-Use Period',
            type: 'text',
            placeholder: 'e.g., 28 days at 2-8°C after first puncture; or 24 hours at room temperature after reconstitution',
            visibleWhen: { field: 'in_use_stability', operator: 'eq', value: true },
          },
          {
            id: 'non_arrhenius_behavior',
            label: 'Has Non-Arrhenius Behavior Been Observed Under Accelerated Conditions?',
            type: 'yes_no',
            helpText: 'Biologics often do not follow Arrhenius kinetics at accelerated conditions (e.g., unfolding, aggregation at elevated temperature). Document this and use accelerated data for qualitative assessment only.',
          },
        ],
        defaultNext: 'data_evaluation',
        issueChecks: [
          {
            id: 'no_in_use_stability',
            condition: { field: 'in_use_stability', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No In-Use Stability Data',
            message:
              'In-use stability data is required for multi-dose products and products requiring reconstitution or dilution. Without in-use stability data, the labeling cannot specify an in-use period, which may limit clinical utility. FDA and EMA reviewers will request this data.',
            reference: 'ICH Q5C; EMA Guideline on Declaration of Storage Conditions (2007)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 4 — Data Analysis & Shelf Life                          */
      /* ================================================================ */

      {
        id: 'data_evaluation',
        section: 'data_analysis',
        question:
          'Describe how the stability data will be evaluated. ICH Q1E provides guidance on statistical evaluation and shelf life determination.',
        guidance:
          'Per ICH Q1E "Evaluation of Stability Data" (2003), the statistical approach to shelf life determination depends on the data pattern. For attributes expected to change with time (e.g., assay, degradation products), regression analysis is used. If data from multiple batches can be pooled (no significant batch-to-batch variability), the shelf life is estimated from the pooled regression. If batches cannot be pooled, the shortest individual batch shelf life applies. The proposed shelf life should not exceed the period supported by the available long-term data, unless extrapolation is justified per ICH Q1E Section 5.',
        fields: [
          {
            id: 'statistical_method',
            label: 'Statistical Method for Shelf Life Determination',
            type: 'select',
            required: true,
            options: [
              { value: 'regression', label: 'Regression Analysis (ICH Q1E)' },
              { value: 'ancova', label: 'ANCOVA (Analysis of Covariance)' },
              { value: 'worst_case', label: 'Worst-Case Batch Approach' },
              { value: 'pooled', label: 'Pooled Batch Analysis' },
              { value: 'not_determined', label: 'Not Yet Determined' },
            ],
            helpText: 'Per ICH Q1E, regression analysis of assay and degradation product data against time is the standard approach. ANCOVA is used to determine whether batch data can be pooled.',
          },
          {
            id: 'data_poolability',
            label: 'Can Batch Data Be Pooled?',
            type: 'select',
            options: [
              { value: 'yes', label: 'Yes — No significant batch-to-batch variability' },
              { value: 'no', label: 'No — Significant batch-to-batch differences' },
              { value: 'not_assessed', label: 'Not Yet Assessed' },
            ],
            helpText: 'Per ICH Q1E Section 4.1, use ANCOVA (p > 0.25) to test whether slopes and intercepts differ among batches. If they do not, data may be pooled for a single shelf life estimate.',
          },
          {
            id: 'significant_change_definition',
            label: 'Definition of Significant Change Used',
            type: 'textarea',
            placeholder: 'e.g., Per ICH Q1A(R2): ≥5% change in assay from initial; any specified degradant exceeding its specification; failure of pH limits; failure of dissolution for 12 units; failure to meet acceptance criteria for appearance.',
            required: true,
            helpText: 'ICH Q1A(R2) defines "significant change" for accelerated studies in Section 2.2.7. The definition drives whether intermediate condition testing is required.',
          },
          {
            id: 'accelerated_significant_change',
            label: 'Has Significant Change Occurred Under Accelerated Conditions?',
            type: 'select',
            required: true,
            options: [
              { value: 'no', label: 'No significant change at 6 months accelerated' },
              { value: 'yes', label: 'Yes — Significant change observed' },
              { value: 'data_pending', label: 'Data pending / study ongoing' },
            ],
          },
          {
            id: 'accelerated_failure_details',
            label: 'Details of Accelerated Condition Failure',
            type: 'textarea',
            placeholder: 'e.g., Assay decreased 7% at 6 months under accelerated conditions. Intermediate condition data initiated. Assay at 12 months intermediate: within specification.',
            visibleWhen: { field: 'accelerated_significant_change', operator: 'eq', value: 'yes' },
          },
        ],
        defaultNext: 'shelf_life_determination',
        issueChecks: [
          {
            id: 'accelerated_failure_not_addressed',
            condition: { field: 'accelerated_significant_change', operator: 'eq', value: 'yes' },
            severity: 'warning',
            title: 'Accelerated Condition Failure — Intermediate Data Required',
            message:
              'Per ICH Q1A(R2) Section 2.2.7, if significant change occurs during the 6-month accelerated study, intermediate condition data (30°C/65% RH) is required, and the proposed shelf life must be based on long-term data only (no extrapolation). Ensure intermediate condition studies are initiated and data is available for the filing.',
            reference: 'ICH Q1A(R2) Section 2.2.7',
          },
          {
            id: 'statistical_model_not_justified',
            condition: { field: 'statistical_method', operator: 'eq', value: 'not_determined' },
            severity: 'warning',
            title: 'Statistical Model Not Justified',
            message:
              'Per ICH Q1E, the statistical approach to shelf life determination must be pre-defined and scientifically justified. Determine the appropriate statistical method (regression, ANCOVA for poolability testing) before completing the stability evaluation. FDA reviewers frequently comment on inadequate statistical justification.',
            reference: 'ICH Q1E (2003)',
          },
        ],
      },

      {
        id: 'shelf_life_determination',
        section: 'data_analysis',
        question:
          'What is the proposed shelf life, and is extrapolation of stability data being used?',
        guidance:
          'Per ICH Q1E Section 5, extrapolation of stability data beyond the observed period may be acceptable if: (1) long-term data show no significant change, (2) the statistical analysis supports the extrapolated shelf life, and (3) the product is not expected to change non-linearly. Extrapolation should generally not exceed twice the long-term data period or 12 months beyond, whichever is shorter. For accelerated approval or IND, shorter datasets may be acceptable with commitments to provide additional data.',
        fields: [
          {
            id: 'proposed_shelf_life',
            label: 'Proposed Shelf Life',
            type: 'text',
            placeholder: 'e.g., 24 months at 25°C/60% RH; or 36 months at 5°C ± 3°C',
            required: true,
          },
          {
            id: 'available_long_term_data',
            label: 'Longest Available Long-Term Data Point',
            type: 'select',
            required: true,
            options: [
              { value: '3_months', label: '3 months' },
              { value: '6_months', label: '6 months' },
              { value: '9_months', label: '9 months' },
              { value: '12_months', label: '12 months' },
              { value: '18_months', label: '18 months' },
              { value: '24_months', label: '24 months' },
              { value: '36_months', label: '36 months' },
              { value: '48_months', label: '48+ months' },
            ],
          },
          {
            id: 'extrapolation_used',
            label: 'Is Extrapolation Being Used to Extend Shelf Life Beyond Available Data?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q1E, extrapolation may be justified based on the trend of long-term data, but should not exceed 2x the available data or 12 months beyond, whichever is shorter.',
          },
          {
            id: 'extrapolation_justification',
            label: 'Extrapolation Justification',
            type: 'textarea',
            placeholder: 'e.g., 24-month shelf life proposed based on 12 months of long-term data. Regression analysis shows linear degradation with 95% CI for assay remaining above 95.0% through 24 months. No significant change under accelerated conditions supports extrapolation.',
            visibleWhen: { field: 'extrapolation_used', operator: 'eq', value: true },
            validation: { minLength: 30 },
          },
          {
            id: 'retest_period_ds',
            label: 'Proposed Retest Period (Drug Substance)',
            type: 'text',
            placeholder: 'e.g., 24 months when stored at 2-8°C in double PE bags within fiber drum',
            visibleWhen: { field: 'study_subject', operator: 'in', value: ['drug_substance', 'both'] },
            helpText: 'Per ICH Q1A(R2), drug substances have a "retest period" rather than an "expiry date" unless a specific expiry date is justified.',
          },
        ],
        defaultNext: 'out_of_spec_handling',
      },

      {
        id: 'out_of_spec_handling',
        section: 'data_analysis',
        question:
          'How are out-of-specification (OOS) and out-of-trend (OOT) stability results handled?',
        guidance:
          'Per 21 CFR 211.165 and FDA Guidance "Investigating Out-of-Specification (OOS) Test Results for Pharmaceutical Production" (2006), all OOS results must be investigated. The investigation should follow a phased approach: Phase 1 (laboratory investigation) and Phase 2 (full-scale manufacturing investigation if warranted). Out-of-trend (OOT) results — results within specification but showing an unexpected trend — should also trigger investigation per FDA expectations. Document all investigations, root causes, and corrective actions.',
        fields: [
          {
            id: 'oos_procedure',
            label: 'OOS Investigation Procedure in Place?',
            type: 'yes_no',
            required: true,
            helpText: 'A validated OOS investigation procedure is a GMP requirement. FDA cites inadequate OOS investigation as a common 483 observation.',
          },
          {
            id: 'oot_procedure',
            label: 'OOT (Out-of-Trend) Monitoring Procedure in Place?',
            type: 'yes_no',
            required: true,
            helpText: 'Statistical trend analysis (e.g., control charts, regression monitoring) should be used proactively to identify OOT results before they become OOS.',
          },
          {
            id: 'oos_results_observed',
            label: 'Have Any OOS Results Been Observed During Stability Studies?',
            type: 'yes_no',
          },
          {
            id: 'oos_investigation_summary',
            label: 'OOS Investigation Summary',
            type: 'textarea',
            placeholder: 'e.g., OOS result at 12 months (Batch 002): assay 94.2% (spec: NLT 95.0%). Phase 1 investigation: analyst error excluded. Phase 2: root cause identified as elevated moisture ingress due to inadequate seal on one bottle. CAPA: seal verification test added to in-process controls.',
            visibleWhen: { field: 'oos_results_observed', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'ongoing_stability',
      },

      /* ================================================================ */
      /*  Section 5 — Commitments & Post-Approval                         */
      /* ================================================================ */

      {
        id: 'ongoing_stability',
        section: 'commitments_post_approval',
        question:
          'Describe the ongoing (annual) stability commitment. Per ICH Q1A(R2) and 21 CFR 211.166, ongoing stability is a post-approval GMP requirement.',
        guidance:
          'Per ICH Q1A(R2) Section 2.6 and 21 CFR 211.166, the ongoing stability program requires that at least one production batch per year per strength per container closure system be placed on long-term stability. This applies post-approval and is verified during FDA GMP inspections. The annual stability protocol should mirror the registration stability protocol. Results must be trended and any significant trends reported to regulatory authorities.',
        fields: [
          {
            id: 'annual_stability_protocol',
            label: 'Annual Stability Protocol Established?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 211.166 and ICH Q1A(R2), an ongoing stability program is required post-approval. At least one batch per year per strength must be placed on stability.',
          },
          {
            id: 'annual_batches_per_year',
            label: 'Number of Batches to Be Placed on Stability Annually',
            type: 'number',
            placeholder: 'e.g., 1',
            validation: { min: 1 },
          },
          {
            id: 'annual_testing_parameters',
            label: 'Parameters Tested in Annual Stability Program',
            type: 'textarea',
            placeholder: 'e.g., Same parameters as registration stability: appearance, assay, related substances, dissolution, moisture. Testing at 0, 12, 24, 36 months.',
          },
          {
            id: 'stability_trending',
            label: 'How Is Stability Data Trended?',
            type: 'select',
            options: [
              { value: 'manual_review', label: 'Manual Review' },
              { value: 'statistical_software', label: 'Statistical Software (SAS, JMP, Minitab)' },
              { value: 'lims_integrated', label: 'LIMS-Integrated Trending' },
              { value: 'not_defined', label: 'Not Yet Defined' },
            ],
          },
        ],
        defaultNext: 'post_approval_commitments',
      },

      {
        id: 'post_approval_commitments',
        section: 'commitments_post_approval',
        question:
          'What post-approval stability commitments are needed? This includes commitments to provide additional data to regulatory authorities.',
        guidance:
          'Post-approval stability commitments typically include: (1) Completion of ongoing long-term studies that were not finished at the time of filing, (2) Annual stability on production batches per 21 CFR 211.166, (3) Stability studies to support shelf-life extensions, (4) Studies to support post-approval changes (SUPAC), and (5) Stability protocol updates when manufacturing changes occur. FDA may also request specific stability commitments as post-marketing requirements (PMRs). Document all commitments and their timelines.',
        fields: [
          {
            id: 'ongoing_long_term_commitment',
            label: 'Commitment to Complete Ongoing Long-Term Studies',
            type: 'yes_no',
            required: true,
            helpText: 'If fewer than 36 months of long-term data are available at filing, a commitment to complete the studies through the proposed shelf life is required.',
          },
          {
            id: 'completion_timeline',
            label: 'Expected Completion Timeline for Ongoing Studies',
            type: 'text',
            placeholder: 'e.g., 36-month long-term data expected by Q4 2026 for all three registration batches',
            visibleWhen: { field: 'ongoing_long_term_commitment', operator: 'eq', value: true },
          },
          {
            id: 'supac_stability_needed',
            label: 'Are SUPAC-Related Stability Studies Needed?',
            type: 'yes_no',
            helpText: 'Per FDA SUPAC guidances (IR, MR, SS), manufacturing changes post-approval may require additional stability studies depending on the level of change.',
          },
          {
            id: 'shelf_life_extension_planned',
            label: 'Is a Shelf-Life Extension Planned?',
            type: 'yes_no',
            helpText: 'If the initial approved shelf life is shorter than desired, plan for a shelf-life extension supplement based on accumulating long-term data.',
          },
          {
            id: 'shelf_life_extension_target',
            label: 'Target Extended Shelf Life',
            type: 'text',
            placeholder: 'e.g., Extend from 24 months to 36 months based on 36-month long-term data',
            visibleWhen: { field: 'shelf_life_extension_planned', operator: 'eq', value: true },
          },
          {
            id: 'regulatory_commitments_summary',
            label: 'Summary of All Stability-Related Regulatory Commitments',
            type: 'textarea',
            placeholder: 'e.g., 1. Complete 36-month long-term studies for Batches 001-003 by Q4 2026.\n2. Annual stability: 1 batch/year/strength on long-term stability.\n3. Submit shelf-life extension supplement by Q2 2027.',
            required: true,
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
