/**
 * CMC (Chemistry, Manufacturing, and Controls) Specification flow definition
 * for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive CMC questionnaire
 * covering drug substance/product characterization, manufacturing process,
 * analytical methods, stability, impurities, process validation, and
 * specifications per ICH Q1-Q12 and 21 CFR 211.
 *
 * 22 nodes · 90+ fields · 8 sections · 16 issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/cmc-specification
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createCmcSpecificationFlow(): FlowDefinition {
  return {
    id: 'cmc-specification-v1',
    category: 'cmc_specification',
    name: 'CMC Specification',
    description:
      'Chemistry, Manufacturing, and Controls questionnaire covering drug substance/product characterization, manufacturing process, analytical methods, stability, and specifications per ICH Q1-Q12 and 21 CFR 211.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'cmc_overview',
    estimatedMinutes: 45,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'cmc_overview_section',
        label: 'CMC Overview',
        nodeIds: ['cmc_overview', 'regulatory_context'],
      },
      {
        id: 'drug_substance_section',
        label: 'Drug Substance (3.2.S)',
        nodeIds: ['ds_nomenclature', 'ds_manufacturing', 'ds_characterization'],
      },
      {
        id: 'drug_product_section',
        label: 'Drug Product (3.2.P)',
        nodeIds: ['dp_formulation', 'dp_manufacturing', 'dp_container_closure'],
      },
      {
        id: 'analytical_methods_section',
        label: 'Analytical Methods',
        nodeIds: ['method_development', 'reference_standards'],
      },
      {
        id: 'stability_section',
        label: 'Stability',
        nodeIds: ['stability_protocol', 'stability_data', 'shelf_life_proposal'],
      },
      {
        id: 'impurities_section',
        label: 'Impurities',
        nodeIds: ['impurity_identification', 'genotoxic_elemental'],
      },
      {
        id: 'process_validation_section',
        label: 'Process Validation',
        nodeIds: ['validation_strategy', 'control_strategy'],
      },
      {
        id: 'specifications_control_section',
        label: 'Specifications & Control',
        nodeIds: ['specification_setting', 'comparability'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — CMC Overview                                        */
      /* ================================================================ */

      {
        id: 'cmc_overview',
        section: 'cmc_overview_section',
        question:
          'Let\'s begin with an overview of your product. Please provide the product type, drug substance identity, and development stage so we can tailor the CMC questionnaire appropriately.',
        guidance:
          'Per ICH M4Q (CTD Module 3), CMC information is organized by drug substance (3.2.S) and drug product (3.2.P). The depth of CMC data required depends on the development stage: early-phase INDs (FDA Guidance for Industry: INDs for Phase 2 and Phase 3 Studies, 2003) require less detail than NDA/BLA submissions (21 CFR 314.50 / 21 CFR 601.2). Product type (small molecule vs. biologic) determines which ICH quality guidelines apply.',
        fields: [
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule' },
              { value: 'biologic', label: 'Biologic (mAb, Fusion Protein, etc.)' },
              { value: 'peptide', label: 'Peptide' },
              { value: 'oligonucleotide', label: 'Oligonucleotide (ASO/siRNA)' },
              { value: 'adc', label: 'Antibody-Drug Conjugate (ADC)' },
              { value: 'cell_therapy', label: 'Cell Therapy' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
            ],
            helpText: 'Product type determines applicable ICH guidelines: Q6A for chemical substances, Q6B for biotechnological/biological products.',
          },
          {
            id: 'drug_substance_name',
            label: 'Drug Substance Name (INN/USAN)',
            type: 'text',
            placeholder: 'e.g., pembrolizumab, remdesivir',
            required: true,
            helpText: 'International Nonproprietary Name (INN) or United States Adopted Name (USAN) as assigned.',
          },
          {
            id: 'proprietary_name',
            label: 'Proprietary / Brand Name',
            type: 'text',
            placeholder: 'e.g., Keytruda, Veklury',
            helpText: 'Leave blank if not yet assigned.',
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'text',
            placeholder: 'e.g., Oncology, Immunology, Infectious Disease',
            required: true,
          },
          {
            id: 'development_stage',
            label: 'Development Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'preclinical', label: 'Preclinical' },
              { value: 'phase_1', label: 'Phase I' },
              { value: 'phase_2', label: 'Phase II' },
              { value: 'phase_3', label: 'Phase III' },
              { value: 'nda_bla', label: 'NDA/BLA Submission' },
            ],
            helpText: 'CMC data depth requirements increase with development stage per FDA Guidance for Industry: INDs for Phase 2 and Phase 3 Studies (2003) and ICH M4Q.',
          },
        ],
        defaultNext: 'regulatory_context',
        provideExpertFeedback: true,
      },

      {
        id: 'regulatory_context',
        section: 'cmc_overview_section',
        question:
          'Provide the regulatory filing context. This determines the level of CMC detail required and the applicable regulatory framework.',
        guidance:
          'The regulatory filing type determines the structure and depth of CMC documentation: IND (21 CFR 312.23(a)(7)), NDA (21 CFR 314.50(d)(1)), BLA (21 CFR 601.2), ANDA (21 CFR 314.94), or MAA (EU CTD Module 3). ICH Q8(R2) "Pharmaceutical Development" encourages a Quality by Design (QbD) approach that links product quality to the manufacturing process through a systematic understanding of critical quality attributes (CQAs) and critical process parameters (CPPs).',
        fields: [
          {
            id: 'filing_type',
            label: 'Regulatory Filing Type',
            type: 'select',
            required: true,
            options: [
              { value: 'ind', label: 'IND (Investigational New Drug)' },
              { value: 'nda', label: 'NDA (New Drug Application)' },
              { value: 'bla', label: 'BLA (Biologics License Application)' },
              { value: 'anda', label: 'ANDA (Abbreviated New Drug Application)' },
              { value: 'maa', label: 'MAA (Marketing Authorisation Application, EU)' },
            ],
          },
          {
            id: 'target_regulatory_agency',
            label: 'Target Regulatory Agency',
            type: 'agency_select',
            required: true,
            helpText: 'Select the primary regulatory agency for this submission.',
          },
          {
            id: 'qbd_approach_used',
            label: 'Is a Quality by Design (QbD) approach being used per ICH Q8(R2)?',
            type: 'yes_no',
            required: true,
            helpText: 'QbD per ICH Q8(R2) involves systematic process understanding, design space definition, and risk-based control strategies. While not mandatory, FDA and EMA strongly encourage this approach.',
          },
          {
            id: 'design_space_established',
            label: 'Has a design space been established per ICH Q8(R2)?',
            type: 'yes_no',
            visibleWhen: { field: 'qbd_approach_used', operator: 'eq', value: true },
            helpText: 'A design space is the multidimensional combination of input variables and process parameters demonstrated to provide quality assurance (ICH Q8(R2) Section 3.1).',
          },
          {
            id: 'prior_regulatory_submissions',
            label: 'Prior Regulatory Submissions Related to This Product',
            type: 'textarea',
            placeholder: 'e.g., IND 123456 filed 2023-01-15; Type B Pre-IND meeting 2022-09-20',
            helpText: 'List any prior INDs, pre-IND meetings, Type A/B/C meetings, or international filings.',
          },
        ],
        defaultNext: 'ds_nomenclature',
        issueChecks: [
          {
            id: 'no_qbd_approach',
            condition: { field: 'qbd_approach_used', operator: 'eq', value: false },
            severity: 'info',
            title: 'No QbD Approach Used',
            message:
              'A Quality by Design approach per ICH Q8(R2) is strongly encouraged by FDA and EMA. While not mandatory, QbD facilitates post-approval manufacturing changes and demonstrates enhanced process understanding. Consider adopting QbD principles for critical process parameters and quality attributes.',
            reference: 'ICH Q8(R2) "Pharmaceutical Development"; FDA Process Validation Guidance (2011)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 2 — Drug Substance (3.2.S)                              */
      /* ================================================================ */

      {
        id: 'ds_nomenclature',
        section: 'drug_substance_section',
        question:
          'Describe the drug substance identity: chemical or molecular structure, nomenclature, and physical form. This corresponds to CTD Section 3.2.S.1.',
        guidance:
          'Per ICH M4Q and 21 CFR 314.50(d)(1)(i), the drug substance section must include nomenclature (INN, USAN, chemical name, CAS number), structure (molecular formula, molecular weight, structural formula including stereochemistry), and general properties. For biologics, describe the amino acid sequence, post-translational modifications, and higher-order structure per ICH Q6B.',
        fields: [
          {
            id: 'structure_description',
            label: 'Chemical / Molecular Structure Description',
            type: 'textarea',
            placeholder: 'e.g., Small molecule tyrosine kinase inhibitor with a pyrimidine core scaffold; IgG1 kappa monoclonal antibody targeting PD-1',
            required: true,
            validation: { minLength: 30 },
            helpText: 'For small molecules, describe the chemical class and key structural features. For biologics, describe the protein class, isotype, and target per ICH Q6B.',
          },
          {
            id: 'molecular_formula',
            label: 'Molecular Formula',
            type: 'text',
            placeholder: 'e.g., C22H24ClN3O4',
            required: true,
          },
          {
            id: 'molecular_weight',
            label: 'Molecular Weight (Da)',
            type: 'number',
            required: true,
            validation: { min: 1 },
            helpText: 'In Daltons (Da). For biologics, provide the theoretical molecular weight of the protein backbone.',
          },
          {
            id: 'cas_number',
            label: 'CAS Registry Number',
            type: 'text',
            placeholder: 'e.g., 1234567-89-0',
            validation: {
              pattern: '^\\d{2,7}-\\d{2}-\\d$',
              patternMessage: 'CAS number format: digits-digits-digit (e.g., 1234567-89-0).',
            },
          },
          {
            id: 'stereochemistry',
            label: 'Stereochemistry',
            type: 'select',
            options: [
              { value: 'achiral', label: 'Achiral' },
              { value: 'single_enantiomer', label: 'Single Enantiomer' },
              { value: 'racemate', label: 'Racemate' },
              { value: 'diastereomers', label: 'Mixture of Diastereomers' },
              { value: 'not_applicable', label: 'Not Applicable (Biologic)' },
            ],
            helpText: 'Per ICH Q6A, stereochemistry must be controlled and specified. For chiral molecules, identify the absolute configuration (R/S or D/L).',
          },
          {
            id: 'polymorphic_forms',
            label: 'Polymorphic Forms',
            type: 'textarea',
            placeholder: 'e.g., Form I (thermodynamically stable), Form II (metastable); amorphous form identified',
            helpText: 'Per ICH Q6A Decision Tree #4, polymorphism should be investigated. Describe known polymorphs and the form used in the drug product.',
          },
          {
            id: 'salt_form',
            label: 'Salt / Free Base / Free Acid Form',
            type: 'text',
            placeholder: 'e.g., Hydrochloride salt, Sodium salt, Free base',
            helpText: 'Specify the salt form selected for development and rationale for selection.',
          },
        ],
        defaultNext: 'ds_manufacturing',
      },

      {
        id: 'ds_manufacturing',
        section: 'drug_substance_section',
        question:
          'Describe the drug substance manufacturing process. This corresponds to CTD Section 3.2.S.2.',
        guidance:
          'Per ICH Q11 "Development and Manufacture of Drug Substances," the manufacturing process must be described with sufficient detail including synthetic route (for chemical entities) or cell culture/fermentation process (for biologics), starting materials and their specifications, critical process parameters (CPPs), in-process controls, and process validation strategy. ICH Q7 "Good Manufacturing Practice for Active Pharmaceutical Ingredients" applies to all drug substance manufacturing.',
        fields: [
          {
            id: 'synthesis_route',
            label: 'Synthesis Route / Manufacturing Method',
            type: 'select',
            required: true,
            options: [
              { value: 'chemical_synthesis', label: 'Chemical Synthesis' },
              { value: 'fermentation', label: 'Fermentation' },
              { value: 'cell_culture', label: 'Cell Culture (Mammalian)' },
              { value: 'microbial_expression', label: 'Microbial Expression (E. coli, yeast)' },
              { value: 'semi_synthesis', label: 'Semi-Synthesis' },
              { value: 'extraction', label: 'Extraction from Natural Source' },
              { value: 'solid_phase_synthesis', label: 'Solid-Phase Synthesis (Peptide/Oligo)' },
            ],
            helpText: 'Per ICH Q11, the manufacturing process description should include all steps from starting materials to the final drug substance.',
          },
          {
            id: 'synthesis_description',
            label: 'Manufacturing Process Summary',
            type: 'textarea',
            placeholder: 'Provide a high-level summary of the manufacturing process including key transformations, purification steps, and isolation.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'number_of_steps',
            label: 'Number of Synthetic / Purification Steps',
            type: 'number',
            validation: { min: 1, max: 100 },
          },
          {
            id: 'critical_process_parameters',
            label: 'Critical Process Parameters (CPPs) Identified',
            type: 'textarea',
            placeholder: 'e.g., Reaction temperature at Step 3 (65-75 °C), pH control at purification step (6.8-7.2), column chromatography conditions',
            required: true,
            helpText: 'Per ICH Q8(R2) and Q11, CPPs are process parameters whose variability has an impact on a critical quality attribute (CQA) and should be monitored or controlled.',
          },
          {
            id: 'starting_materials_controls',
            label: 'Starting Materials and Their Controls',
            type: 'textarea',
            placeholder: 'e.g., Starting material A sourced from qualified suppliers; controlled per ICH Q11 starting material criteria with specifications for identity, purity, and impurities.',
            required: true,
            helpText: 'Per ICH Q11 Section 5, the selection and justification of starting materials must be provided. Starting material specifications should include tests for identity, assay, and impurities.',
          },
          {
            id: 'process_controls',
            label: 'In-Process Controls at Critical Steps',
            type: 'textarea',
            placeholder: 'e.g., HPLC monitoring of reaction completion at Step 2 (>98% conversion), moisture content after drying (<0.5% w/w)',
          },
          {
            id: 'yield_information',
            label: 'Overall Yield',
            type: 'text',
            placeholder: 'e.g., 25-30% overall yield from starting material',
            helpText: 'Typical overall yield from starting materials to final drug substance.',
          },
        ],
        defaultNext: 'ds_characterization',
        provideExpertFeedback: true,
      },

      {
        id: 'ds_characterization',
        section: 'drug_substance_section',
        question:
          'Provide characterization data for the drug substance including physicochemical properties and impurity profile. This corresponds to CTD Sections 3.2.S.3 and 3.2.S.4.',
        guidance:
          'Per ICH Q6A (chemical entities) and Q6B (biologics), the drug substance must be fully characterized for physicochemical properties. Impurity profiling must follow ICH Q3A(R2) "Impurities in New Drug Substances" with thresholds for reporting (0.05%), identification (0.10% or 1.0 mg/day), and qualification (0.15% or 1.0 mg/day). Residual solvents are controlled per ICH Q3C(R8) and genotoxic impurities per ICH M7(R2).',
        fields: [
          {
            id: 'solubility',
            label: 'Aqueous Solubility',
            type: 'text',
            placeholder: 'e.g., 0.5 mg/mL at pH 7.4; freely soluble at pH 2.0',
            helpText: 'Per ICH Q6A and BCS classification, solubility across physiological pH range (1.0-7.5) is required.',
          },
          {
            id: 'pka',
            label: 'pKa Value(s)',
            type: 'text',
            placeholder: 'e.g., pKa1 = 4.2, pKa2 = 8.7',
          },
          {
            id: 'partition_coefficient',
            label: 'Partition Coefficient (Log P / Log D)',
            type: 'text',
            placeholder: 'e.g., Log P = 2.3, Log D7.4 = 1.8',
          },
          {
            id: 'melting_point',
            label: 'Melting Point / Decomposition Temperature',
            type: 'text',
            placeholder: 'e.g., 185-188 °C',
          },
          {
            id: 'hygroscopicity',
            label: 'Hygroscopicity',
            type: 'select',
            options: [
              { value: 'non_hygroscopic', label: 'Non-Hygroscopic' },
              { value: 'slightly_hygroscopic', label: 'Slightly Hygroscopic' },
              { value: 'hygroscopic', label: 'Hygroscopic' },
              { value: 'very_hygroscopic', label: 'Very Hygroscopic / Deliquescent' },
              { value: 'not_tested', label: 'Not Yet Tested' },
            ],
            helpText: 'Per ICH Q6A, hygroscopicity classification should follow European Pharmacopoeia definitions and influences packaging/storage requirements.',
          },
          {
            id: 'impurity_profile_summary',
            label: 'Impurity Profile Summary',
            type: 'textarea',
            placeholder: 'e.g., Three specified impurities identified (Impurity A: process-related, 0.15%; Impurity B: degradation product, 0.08%; Impurity C: starting material carry-over, 0.05%)',
            required: true,
            helpText: 'Per ICH Q3A(R2), list all specified impurities with their origin (process-related, degradation, starting material carry-over) and observed levels.',
            validation: { minLength: 30 },
          },
          {
            id: 'specified_impurities',
            label: 'Number of Specified Impurities',
            type: 'number',
            validation: { min: 0, max: 100 },
          },
          {
            id: 'unspecified_impurity_threshold',
            label: 'Unspecified Impurity Threshold (%)',
            type: 'number',
            helpText: 'Per ICH Q3A(R2): reporting threshold 0.05%, identification threshold 0.10% (or 1.0 mg/day for max daily dose >2 g), qualification threshold 0.15% (or 1.0 mg/day for max daily dose >2 g).',
            validation: { min: 0, max: 5 },
          },
          {
            id: 'residual_solvents',
            label: 'Residual Solvents Identified (per ICH Q3C)',
            type: 'textarea',
            placeholder: 'e.g., Methanol (Class 2, limit 3000 ppm), Ethyl acetate (Class 3, limit 5000 ppm)',
            helpText: 'Per ICH Q3C(R8), classify all solvents used in the synthesis as Class 1 (avoid), Class 2 (limit), or Class 3 (low toxic potential) and set appropriate limits.',
          },
          {
            id: 'genotoxic_assessment_ds',
            label: 'Has a genotoxic impurity assessment been performed per ICH M7(R2)?',
            type: 'yes_no',
            helpText: 'ICH M7(R2) requires assessment of potential mutagenic impurities (PMIs) in drug substances. This includes structure-activity relationship (SAR) analysis using (Q)SAR models and Ames test data.',
          },
        ],
        defaultNext: 'dp_formulation',
        provideExpertFeedback: true,
      },

      /* ================================================================ */
      /*  Section 3 — Drug Product (3.2.P)                                */
      /* ================================================================ */

      {
        id: 'dp_formulation',
        section: 'drug_product_section',
        question:
          'Describe the drug product formulation. This corresponds to CTD Section 3.2.P.1 (Description and Composition) and 3.2.P.2 (Pharmaceutical Development).',
        guidance:
          'Per ICH Q8(R2) "Pharmaceutical Development," the formulation should be developed with a systematic understanding of how formulation variables affect drug product CQAs. Excipient selection should be justified with reference to the FDA Inactive Ingredient Guide (IIG) for precedent of use. Excipient compatibility studies (e.g., binary mixtures, stress testing) are expected to support the formulation rationale.',
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
              { value: 'lyophilized', label: 'Lyophilized Powder for Reconstitution' },
              { value: 'suspension', label: 'Suspension' },
              { value: 'cream_ointment', label: 'Cream / Ointment' },
              { value: 'inhaler', label: 'Inhaler (MDI/DPI)' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'suppository', label: 'Suppository' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'select',
            required: true,
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'iv', label: 'Intravenous (IV)' },
              { value: 'sc', label: 'Subcutaneous (SC)' },
              { value: 'im', label: 'Intramuscular (IM)' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhaled', label: 'Inhaled' },
              { value: 'intrathecal', label: 'Intrathecal' },
              { value: 'transdermal', label: 'Transdermal' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'strengths',
            label: 'Strength(s)',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg tablets; 10 mg/mL injection',
            required: true,
          },
          {
            id: 'excipient_list',
            label: 'Excipient List (with Function)',
            type: 'textarea',
            placeholder: 'e.g., Microcrystalline cellulose (diluent), Croscarmellose sodium (disintegrant), Magnesium stearate (lubricant), Opadry II (film coat)',
            required: true,
            helpText: 'List all excipients with their function. Reference the FDA Inactive Ingredient Guide (IIG) for precedent of use at the proposed concentration and route.',
            validation: { minLength: 20 },
          },
          {
            id: 'excipient_compatibility_completed',
            label: 'Has an excipient compatibility study been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Excipient compatibility studies (e.g., binary/ternary mixtures under stressed conditions) are expected per ICH Q8(R2) to demonstrate that the drug substance is compatible with proposed excipients.',
          },
          {
            id: 'formulation_development_summary',
            label: 'Formulation Development Summary',
            type: 'textarea',
            placeholder: 'Describe the formulation development rationale, key decisions, and supporting studies.',
            helpText: 'Per ICH Q8(R2), summarize the formulation development strategy including rationale for component selection, optimization studies, and any design of experiments (DoE) performed.',
            validation: { minLength: 30 },
          },
        ],
        defaultNext: 'dp_manufacturing',
        issueChecks: [
          {
            id: 'no_excipient_compatibility',
            condition: { field: 'excipient_compatibility_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Excipient Compatibility Study',
            message:
              'An excipient compatibility study has not been completed. Per ICH Q8(R2), drug-excipient compatibility should be systematically evaluated to support formulation selection and identify potential incompatibilities that could affect product quality.',
            reference: 'ICH Q8(R2) Section 2.1.5 "Excipients"',
          },
        ],
      },

      {
        id: 'dp_manufacturing',
        section: 'drug_product_section',
        question:
          'Describe the drug product manufacturing process. This corresponds to CTD Section 3.2.P.3.',
        guidance:
          'Per ICH Q8(R2) and 21 CFR 211.100, the drug product manufacturing process must be described in sufficient detail to ensure reproducibility. Include unit operations, critical process parameters (CPPs), in-process controls (IPCs), and process flow. Manufacturing must comply with cGMP per 21 CFR Parts 210-211. Process validation per FDA Guidance "Process Validation: General Principles and Practices" (2011) is required.',
        fields: [
          {
            id: 'manufacturing_process_description',
            label: 'Manufacturing Process Description',
            type: 'textarea',
            placeholder: 'Describe the drug product manufacturing process including key unit operations.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'unit_operations',
            label: 'Unit Operations',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'blending', label: 'Blending / Mixing' },
              { value: 'granulation', label: 'Granulation (Wet/Dry)' },
              { value: 'compression', label: 'Tablet Compression' },
              { value: 'encapsulation', label: 'Encapsulation' },
              { value: 'coating', label: 'Film Coating' },
              { value: 'filling', label: 'Filling (Liquid/Sterile)' },
              { value: 'lyophilization', label: 'Lyophilization' },
              { value: 'sterilization', label: 'Sterilization (Terminal/Aseptic)' },
              { value: 'packaging', label: 'Packaging / Labeling' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'batch_size',
            label: 'Batch Size (Clinical and/or Commercial)',
            type: 'text',
            placeholder: 'e.g., Clinical: 10,000 tablets; Commercial: 500,000 tablets',
            required: true,
          },
          {
            id: 'dp_critical_process_parameters',
            label: 'Critical Process Parameters (CPPs)',
            type: 'textarea',
            placeholder: 'e.g., Blending time (15-25 min), compression force (8-12 kN), coating spray rate',
            helpText: 'Per ICH Q8(R2), CPPs for drug product manufacturing should be identified through risk assessment and process development studies.',
          },
          {
            id: 'in_process_controls',
            label: 'In-Process Controls',
            type: 'textarea',
            placeholder: 'e.g., Blend uniformity (RSD <5%), tablet weight variation (±5%), hardness (8-14 kP)',
            helpText: 'Per 21 CFR 211.110, in-process controls must be established to monitor the output and validate the performance of manufacturing processes.',
          },
          {
            id: 'gmp_compliant',
            label: 'Is the manufacturing site cGMP compliant per 21 CFR 211?',
            type: 'yes_no',
            required: true,
            helpText: 'All drug product manufacturing must comply with Current Good Manufacturing Practice per 21 CFR Parts 210-211. The site must be registered with FDA per 21 CFR 207.',
          },
          {
            id: 'process_flow_diagram',
            label: 'Is a process flow diagram available?',
            type: 'yes_no',
            helpText: 'A process flow diagram showing all unit operations, CPPs, and in-process controls is expected in CTD Section 3.2.P.3.3.',
          },
          {
            id: 'manufacturing_sites',
            label: 'Manufacturing Site(s)',
            type: 'textarea',
            placeholder: 'e.g., Drug product: ABC Pharma Manufacturing, Springfield, IL (FEI 1234567); Packaging: XYZ Contract Services, Chicago, IL',
            required: true,
            helpText: 'List all manufacturing, testing, and packaging sites with FEI numbers. Sites must be listed on Form FDA 356h.',
          },
        ],
        defaultNext: 'dp_container_closure',
        issueChecks: [
          {
            id: 'gmp_noncompliance',
            condition: { field: 'gmp_compliant', operator: 'eq', value: false },
            severity: 'critical',
            title: 'GMP Non-Compliance',
            message:
              'The manufacturing site is not cGMP compliant. Per 21 CFR Parts 210-211 and FDA enforcement policy, drug products must be manufactured in facilities that comply with Current Good Manufacturing Practice regulations. Non-compliance will result in application refusal or regulatory action.',
            reference: '21 CFR Parts 210-211; Section 501(a)(2)(B) of the FD&C Act',
          },
        ],
      },

      {
        id: 'dp_container_closure',
        section: 'drug_product_section',
        question:
          'Describe the container closure system for the drug product. This corresponds to CTD Section 3.2.P.7.',
        guidance:
          'Per 21 CFR 211.94 and ICH Q8(R2), the container closure system must be suitable for its intended use and must protect the drug product throughout its shelf life. Compatibility and safety studies (extractables and leachables per USP <1663>, <1664>) are required to demonstrate that the container does not interact adversely with the drug product.',
        fields: [
          {
            id: 'container_closure_description',
            label: 'Container Closure System Description',
            type: 'textarea',
            placeholder: 'e.g., 60cc HDPE bottle with 38mm polypropylene child-resistant cap and induction seal; 2R Type I glass vial with 13mm bromobutyl rubber stopper and aluminum flip-off seal',
            required: true,
            validation: { minLength: 20 },
          },
          {
            id: 'material_of_construction',
            label: 'Material of Construction',
            type: 'multi_select',
            options: [
              { value: 'hdpe', label: 'HDPE (High-Density Polyethylene)' },
              { value: 'glass_type_i', label: 'Type I Borosilicate Glass' },
              { value: 'glass_type_ii', label: 'Type II Treated Soda-Lime Glass' },
              { value: 'polypropylene', label: 'Polypropylene' },
              { value: 'cyclic_olefin', label: 'Cyclic Olefin Polymer/Copolymer' },
              { value: 'rubber_stopper', label: 'Elastomeric (Bromobutyl/Chlorobutyl) Stopper' },
              { value: 'aluminum', label: 'Aluminum Seal/Crimp' },
              { value: 'pvc_pvdc', label: 'PVC/PVDC Blister' },
              { value: 'alu_alu', label: 'Alu-Alu Cold-Form Blister' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'compatibility_study_completed',
            label: 'Has a container closure compatibility study been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 211.94, containers must not be reactive, additive, or absorptive so as to alter the safety, identity, strength, quality, or purity of the drug product.',
          },
          {
            id: 'extractables_leachables_completed',
            label: 'Have extractables and leachables (E&L) studies been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Extractables and leachables studies per USP <1663> and <1664> are required for parenteral, ophthalmic, and inhaled products, and recommended for oral solid dosage forms in plastic containers.',
          },
          {
            id: 'child_resistant_closure',
            label: 'Is a child-resistant closure required?',
            type: 'yes_no',
            helpText: 'Per the Poison Prevention Packaging Act (PPPA, 16 CFR 1700), most oral prescription drugs require child-resistant packaging unless an exemption applies.',
          },
          {
            id: 'container_closure_compliance',
            label: 'Container Closure Compliance Statement',
            type: 'textarea',
            placeholder: 'e.g., Container closure system complies with 21 CFR 211.94, USP <661>, and USP <671>. E&L studies completed per PQRI recommendations.',
            helpText: 'Per 21 CFR 211.94, provide evidence that the container closure system meets applicable compendial standards (USP <661>, <670>, <671>).',
          },
        ],
        defaultNext: 'method_development',
        issueChecks: [
          {
            id: 'no_extractables_leachables',
            condition: { field: 'extractables_leachables_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Extractables/Leachables Study',
            message:
              'Extractables and leachables studies have not been completed. Per USP <1663> and <1664>, E&L assessment is required for parenteral, ophthalmic, and inhalation products and strongly recommended for other dosage forms in plastic containers. Leachables can affect product safety and quality.',
            reference: 'USP <1663>, <1664>; 21 CFR 211.94; PQRI E&L Recommendations',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 4 — Analytical Methods                                  */
      /* ================================================================ */

      {
        id: 'method_development',
        section: 'analytical_methods_section',
        question:
          'Describe the analytical methods used for drug substance and drug product testing. This corresponds to CTD Section 3.2.S.4.2 / 3.2.P.5.2.',
        guidance:
          'Per ICH Q2(R2) "Validation of Analytical Procedures," all analytical methods used for release and stability testing must be validated for specificity, linearity, range, accuracy, precision (repeatability, intermediate precision), detection limit, quantitation limit, and robustness as applicable. Compendial methods (USP, EP, JP) may be used with verification per USP <1226>.',
        fields: [
          {
            id: 'analytical_methods_list',
            label: 'Analytical Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'assay_hplc', label: 'Assay (HPLC/UPLC)' },
              { value: 'impurities_hplc', label: 'Related Substances / Impurities (HPLC)' },
              { value: 'dissolution', label: 'Dissolution' },
              { value: 'content_uniformity', label: 'Content Uniformity (USP <905>)' },
              { value: 'residual_solvents', label: 'Residual Solvents (GC)' },
              { value: 'water_content', label: 'Water Content (Karl Fischer)' },
              { value: 'particle_size', label: 'Particle Size Distribution' },
              { value: 'sterility', label: 'Sterility (USP <71>)' },
              { value: 'endotoxin', label: 'Bacterial Endotoxins (USP <85>)' },
              { value: 'microbial_limits', label: 'Microbial Limits (USP <61>/<62>)' },
              { value: 'identification', label: 'Identification (IR, UV, MS)' },
              { value: 'potency', label: 'Potency / Bioassay' },
              { value: 'elemental_impurities', label: 'Elemental Impurities (ICP-MS/ICP-OES)' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Select all analytical test methods used for release and/or stability testing.',
          },
          {
            id: 'methods_validated_ichq2',
            label: 'Have all analytical methods been validated per ICH Q2(R2)?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q2(R2) requires validation of analytical procedures for specificity, linearity, range, accuracy, precision, DL, QL, and robustness as applicable to the method type (quantitative, limit test, identification).',
          },
          {
            id: 'compendial_methods_used',
            label: 'Are compendial methods (USP/EP/JP) used?',
            type: 'yes_no',
            helpText: 'Per USP <1226>, compendial methods require verification (not full validation) when used for the specific drug substance or product.',
          },
          {
            id: 'non_compendial_methods',
            label: 'Non-Compendial Method Descriptions',
            type: 'textarea',
            placeholder: 'Describe any non-compendial analytical methods including method principle, detection, and performance characteristics.',
            visibleWhen: { field: 'compendial_methods_used', operator: 'eq', value: false },
          },
          {
            id: 'method_transfer_completed',
            label: 'Has method transfer to the QC laboratory been completed?',
            type: 'yes_no',
            helpText: 'Per USP <1224> "Transfer of Analytical Procedures," methods must be successfully transferred from the development laboratory to the receiving QC laboratory with a documented transfer protocol and acceptance criteria.',
          },
          {
            id: 'system_suitability_criteria',
            label: 'System Suitability Criteria Defined',
            type: 'textarea',
            placeholder: 'e.g., Resolution >2.0 between drug peak and nearest impurity; %RSD of replicate injections <2.0%; tailing factor <2.0',
            helpText: 'Per USP <621> and ICH Q2(R2), system suitability tests ensure that the analytical system is performing adequately at the time of use.',
          },
        ],
        defaultNext: 'reference_standards',
        issueChecks: [
          {
            id: 'no_ichq2_validation',
            condition: { field: 'methods_validated_ichq2', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Analytical Methods Not Validated per ICH Q2(R2)',
            message:
              'Analytical methods have not been validated per ICH Q2(R2). Method validation is a regulatory requirement for NDA/BLA submissions. For IND applications, method qualification (partial validation) may be acceptable for early-phase studies, but full validation is expected by Phase 3.',
            reference: 'ICH Q2(R2) "Validation of Analytical Procedures"',
          },
        ],
      },

      {
        id: 'reference_standards',
        section: 'analytical_methods_section',
        question:
          'Describe the reference standards used for analytical testing. This corresponds to CTD Section 3.2.S.5 / 3.2.P.6.',
        guidance:
          'Per ICH Q6A/Q6B and USP General Chapter <11>, reference standards are highly characterized specimens used as comparison standards in analytical procedures. Primary reference standards should be obtained from pharmacopoeial authorities (USP, EP, WHO) when available, or characterized in-house to pharmacopoeial-grade quality. Working standards must be qualified against the primary reference standard.',
        fields: [
          {
            id: 'primary_reference_standard',
            label: 'Primary Reference Standard Source',
            type: 'select',
            required: true,
            options: [
              { value: 'usp', label: 'USP Reference Standard' },
              { value: 'ep', label: 'European Pharmacopoeia (EP/CRS)' },
              { value: 'who', label: 'WHO International Standard' },
              { value: 'in_house', label: 'In-House Primary Reference Standard' },
              { value: 'none', label: 'None Established Yet' },
            ],
            helpText: 'Per USP <11>, a pharmacopoeial reference standard is preferred. If unavailable, an in-house standard must be characterized for identity, purity, potency, and impurity content.',
          },
          {
            id: 'reference_standard_characterization',
            label: 'Reference Standard Characterization',
            type: 'textarea',
            placeholder: 'e.g., Primary reference standard characterized by NMR, MS, elemental analysis, HPLC purity (>99.5%), DSC. Certificate of Analysis available.',
            helpText: 'Provide a summary of characterization tests performed on the primary reference standard.',
          },
          {
            id: 'working_standard_qualification',
            label: 'Working Standard Qualification',
            type: 'textarea',
            placeholder: 'e.g., Working standards qualified against primary reference standard by HPLC assay comparison with acceptance criterion of 98.0-102.0% of primary standard value.',
            helpText: 'Per USP <11>, working standards used for routine testing must be qualified against the primary reference standard.',
          },
          {
            id: 'reference_standard_storage',
            label: 'Reference Standard Storage and Retest',
            type: 'textarea',
            placeholder: 'e.g., Stored at 2-8 °C protected from light and moisture; retest interval 24 months per stability trending data.',
            helpText: 'Describe storage conditions and retest/re-characterization interval for reference standards.',
          },
        ],
        defaultNext: 'stability_protocol',
        issueChecks: [
          {
            id: 'no_reference_standard',
            condition: { field: 'primary_reference_standard', operator: 'eq', value: 'none' },
            severity: 'warning',
            title: 'No Reference Standard Established',
            message:
              'No primary reference standard has been established. Per USP <11> and ICH Q6A/Q6B, a well-characterized reference standard is essential for reliable analytical testing. Establish and characterize a primary reference standard before proceeding to pivotal stability and release testing.',
            reference: 'USP <11>; ICH Q6A Section 3.3; ICH Q6B Section 6',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 5 — Stability                                           */
      /* ================================================================ */

      {
        id: 'stability_protocol',
        section: 'stability_section',
        question:
          'Describe the stability program and protocol. This corresponds to CTD Section 3.2.S.7 / 3.2.P.8.',
        guidance:
          'Per ICH Q1A(R2) "Stability Testing of New Drug Substances and Drug Products," a stability protocol must define storage conditions (long-term: 25°C/60%RH, intermediate: 30°C/65%RH, accelerated: 40°C/75%RH), testing intervals, attributes tested, and acceptance criteria. Photostability testing per ICH Q1B is required on at least one batch. A minimum of three batches should be placed on formal stability for registration applications.',
        fields: [
          {
            id: 'stability_protocol_established',
            label: 'Has a stability protocol per ICH Q1A(R2) been established?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1A(R2) requires a documented stability protocol defining storage conditions, testing intervals, tests, and acceptance criteria.',
          },
          {
            id: 'long_term_conditions',
            label: 'Long-Term Storage Conditions',
            type: 'select',
            options: [
              { value: '25_60', label: '25°C / 60% RH (Zone I/II)' },
              { value: '30_65', label: '30°C / 65% RH (Zone III/IVa)' },
              { value: '30_75', label: '30°C / 75% RH (Zone IVb)' },
              { value: '5_ambient', label: '5°C ± 3°C (Refrigerated)' },
              { value: 'minus20', label: '-20°C ± 5°C (Frozen)' },
            ],
            helpText: 'Per ICH Q1A(R2) and Q1F, storage conditions depend on the intended market climatic zone.',
          },
          {
            id: 'intermediate_conditions',
            label: 'Intermediate Storage Conditions',
            type: 'select',
            options: [
              { value: '30_65', label: '30°C / 65% RH' },
              { value: 'not_applicable', label: 'Not Applicable (refrigerated/frozen products)' },
            ],
          },
          {
            id: 'accelerated_conditions',
            label: 'Accelerated Storage Conditions',
            type: 'select',
            options: [
              { value: '40_75', label: '40°C / 75% RH' },
              { value: '25_60', label: '25°C / 60% RH (for refrigerated products)' },
              { value: '5_ambient', label: '5°C ± 3°C (for frozen products)' },
            ],
          },
          {
            id: 'photostability_completed',
            label: 'Has photostability testing per ICH Q1B been completed?',
            type: 'yes_no',
            helpText: 'ICH Q1B "Photostability Testing of New Drug Substances and Products" requires confirmatory photostability testing on at least one batch of drug substance and drug product.',
          },
          {
            id: 'batches_on_stability',
            label: 'Number of Batches on Stability',
            type: 'number',
            required: true,
            validation: { min: 0, max: 100 },
            helpText: 'ICH Q1A(R2) recommends a minimum of three batches for registration applications. For INDs, at least one batch on stability is expected.',
          },
          {
            id: 'batch_type_stability',
            label: 'Batch Type(s) on Stability',
            type: 'multi_select',
            options: [
              { value: 'pilot', label: 'Pilot Scale' },
              { value: 'registration', label: 'Registration / Exhibit Batch' },
              { value: 'commercial', label: 'Commercial Scale' },
              { value: 'clinical', label: 'Clinical Batch' },
            ],
            helpText: 'Per ICH Q1A(R2), registration batches should be manufactured at a minimum of pilot scale using representative manufacturing processes.',
          },
        ],
        defaultNext: 'stability_data',
        issueChecks: [
          {
            id: 'no_stability_protocol',
            condition: { field: 'stability_protocol_established', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Stability Protocol Established',
            message:
              'A stability protocol per ICH Q1A(R2) has not been established. A documented stability protocol is a fundamental regulatory requirement for all drug substance and drug product submissions. The protocol must define storage conditions, testing intervals, attributes, and acceptance criteria.',
            reference: 'ICH Q1A(R2) "Stability Testing of New Drug Substances and Products"',
          },
        ],
      },

      {
        id: 'stability_data',
        section: 'stability_section',
        question:
          'Provide information on the stability data generated to date. This supports shelf-life determination per ICH Q1E.',
        guidance:
          'Per ICH Q1E "Evaluation of Stability Data," stability data are used to establish retest periods (drug substance) and shelf lives (drug product). The stability-indicating analytical method must be validated per ICH Q2(R2) to detect degradation products. Any out-of-specification (OOS) results must be investigated per 21 CFR 211.192. Forced degradation studies support method development and degradation pathway understanding per ICH Q1A(R2).',
        fields: [
          {
            id: 'stability_data_duration_months',
            label: 'Duration of Available Stability Data (Months)',
            type: 'number',
            required: true,
            validation: { min: 0, max: 120 },
            helpText: 'Enter the longest available stability time point (in months) at long-term conditions.',
          },
          {
            id: 'oos_results',
            label: 'Any Out-of-Specification (OOS) Stability Results?',
            type: 'yes_no',
            helpText: 'Per 21 CFR 211.192, any OOS result must be investigated. Confirmed OOS results may affect shelf-life assignment.',
          },
          {
            id: 'oos_details',
            label: 'OOS Details',
            type: 'textarea',
            placeholder: 'Describe the OOS result(s), investigation outcome, and corrective actions.',
            visibleWhen: { field: 'oos_results', operator: 'eq', value: true },
          },
          {
            id: 'degradation_products_identified',
            label: 'Degradation Products Identified',
            type: 'textarea',
            placeholder: 'e.g., Degradation Product A (oxidation, 0.3% at 6M/40°C/75%RH), Degradation Product B (hydrolysis, 0.1% at 12M/25°C/60%RH)',
            helpText: 'Per ICH Q1A(R2) and Q3B(R2), degradation products above identification and qualification thresholds must be characterized.',
          },
          {
            id: 'stability_indicating_method_validated',
            label: 'Has a stability-indicating analytical method been validated?',
            type: 'yes_no',
            helpText: 'Per ICH Q2(R2) and Q1A(R2), the analytical method used for stability must be demonstrated to be stability-indicating through forced degradation (stress testing) studies.',
          },
          {
            id: 'forced_degradation_completed',
            label: 'Have forced degradation (stress testing) studies been completed?',
            type: 'yes_no',
            helpText: 'Per ICH Q1A(R2) Section 2.1.2, stress testing helps identify likely degradation products and establishes degradation pathways. Conditions include acid, base, oxidative, thermal, and photolytic stress.',
          },
          {
            id: 'significant_change_accelerated',
            label: 'Has significant change been observed at accelerated conditions?',
            type: 'yes_no',
            helpText: 'Per ICH Q1A(R2), significant change at accelerated conditions (e.g., 5% loss of potency, exceeding specification for degradation products) requires evaluation of intermediate data and may limit extrapolation for shelf-life assignment per ICH Q1E.',
          },
        ],
        defaultNext: 'shelf_life_proposal',
        issueChecks: [
          {
            id: 'no_stability_data',
            condition: { field: 'stability_data_duration_months', operator: 'lt', value: 1 },
            severity: 'critical',
            title: 'Insufficient Stability Data',
            message:
              'No stability data (or less than 1 month) is available. Per ICH Q1A(R2), stability data are required to support storage conditions and shelf-life/retest period assignment. At minimum, accelerated stability data should be initiated before regulatory submission.',
            reference: 'ICH Q1A(R2); ICH Q1E "Evaluation of Stability Data"',
          },
          {
            id: 'no_forced_degradation',
            condition: { field: 'forced_degradation_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Forced Degradation Studies Not Completed',
            message:
              'Forced degradation (stress testing) studies have not been completed. Per ICH Q1A(R2) Section 2.1.2, stress testing of the drug substance helps identify degradation pathways, validate analytical method specificity, and demonstrate the stability-indicating nature of the method.',
            reference: 'ICH Q1A(R2) Section 2.1.2 "Stress Testing"',
          },
        ],
      },

      {
        id: 'shelf_life_proposal',
        section: 'stability_section',
        question:
          'Provide the proposed shelf life, storage conditions, and post-approval commitments.',
        guidance:
          'Per ICH Q1E "Evaluation of Stability Data," the proposed shelf life should be supported by available stability data and, where appropriate, statistical analysis (e.g., regression analysis). Extrapolation beyond the observed data may be justified per ICH Q1E when no significant change is observed at accelerated conditions. Post-approval stability commitments per ICH Q1A(R2) Section 2.5 are expected.',
        fields: [
          {
            id: 'proposed_shelf_life',
            label: 'Proposed Shelf Life (Months)',
            type: 'number',
            required: true,
            validation: { min: 1, max: 120 },
            helpText: 'Per ICH Q1E, proposed shelf life should be supported by real-time data or justified extrapolation. Extrapolation should not exceed twice the available long-term data or 12 months beyond, whichever is less.',
          },
          {
            id: 'proposed_storage_conditions',
            label: 'Proposed Storage Conditions',
            type: 'select',
            required: true,
            options: [
              { value: 'room_temp', label: 'Store at 20-25°C (Room Temperature); excursions 15-30°C' },
              { value: 'controlled_room', label: 'Store at 25°C; excursions permitted to 15-30°C (USP Controlled Room Temperature)' },
              { value: 'refrigerated', label: 'Store at 2-8°C (Refrigerated)' },
              { value: 'frozen', label: 'Store at -20°C (Frozen)' },
              { value: 'below_minus60', label: 'Store below -60°C (Ultra-Cold)' },
              { value: 'protect_light', label: 'Store at 20-25°C; protect from light' },
            ],
          },
          {
            id: 'post_approval_stability_commitment',
            label: 'Post-Approval Stability Commitment',
            type: 'textarea',
            placeholder: 'e.g., First three commercial production batches will be placed on long-term (25°C/60%RH) and accelerated (40°C/75%RH) stability per ICH Q1A(R2). Annual stability batches thereafter.',
            helpText: 'Per ICH Q1A(R2) Section 2.5, a post-approval stability protocol and commitment must be submitted. At least one production batch per year should be added to the stability program.',
          },
          {
            id: 'in_use_stability',
            label: 'In-Use Stability Data (if applicable)',
            type: 'textarea',
            placeholder: 'e.g., Multi-dose vial: in-use stability for 28 days at 2-8°C after first puncture. Reconstituted solution: stable for 24 hours at 25°C.',
            helpText: 'For multi-dose products, reconstituted/diluted solutions, or products requiring an in-use period, in-use stability data are required per ICH Q1A(R2) and product-specific guidance.',
          },
          {
            id: 'shipping_validation_completed',
            label: 'Has shipping validation been completed?',
            type: 'yes_no',
            helpText: 'Shipping validation demonstrates that the drug product maintains quality during transportation under expected and worst-case conditions. Per 21 CFR 211.150, distribution procedures must be designed to ensure product quality.',
          },
        ],
        defaultNext: 'impurity_identification',
        issueChecks: [
          {
            id: 'no_shipping_validation',
            condition: { field: 'shipping_validation_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Shipping Validation Not Completed',
            message:
              'Shipping validation has not been completed. Per 21 CFR 211.150 and WHO Technical Report Series No. 961, shipping studies should demonstrate that the drug product maintains its quality during transportation under representative conditions, including temperature excursions.',
            reference: '21 CFR 211.150; WHO TRS 961 Annex 10',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 6 — Impurities                                          */
      /* ================================================================ */

      {
        id: 'impurity_identification',
        section: 'impurities_section',
        question:
          'Provide details on impurity identification, classification, and control per ICH Q3A/Q3B. This corresponds to CTD Sections 3.2.S.3.2 and 3.2.P.5.5.',
        guidance:
          'Per ICH Q3A(R2) for drug substances and ICH Q3B(R2) for drug products, impurities must be reported, identified, and qualified according to threshold-based criteria that depend on the maximum daily dose. Reporting threshold: 0.05% (drug substance) / 0.1% (drug product for dose ≤1 g/day). Identification threshold: 0.10% (or 1.0 mg/day for max daily dose >2 g/day for drug substance). Qualification threshold: 0.15% (or 1.0 mg/day). Impurity fate and purge studies support the control strategy.',
        fields: [
          {
            id: 'impurity_framework',
            label: 'Impurity Framework Applied',
            type: 'select',
            required: true,
            options: [
              { value: 'ichq3a', label: 'ICH Q3A(R2) — Drug Substance Impurities' },
              { value: 'ichq3b', label: 'ICH Q3B(R2) — Drug Product Impurities' },
              { value: 'both', label: 'Both ICH Q3A(R2) and Q3B(R2)' },
              { value: 'ichq6b', label: 'ICH Q6B — Biological Products' },
            ],
            helpText: 'ICH Q3A applies to drug substance impurities; Q3B applies to degradation products in drug products. ICH Q6B applies to biotechnological products.',
          },
          {
            id: 'reporting_threshold',
            label: 'Reporting Threshold (%)',
            type: 'number',
            validation: { min: 0, max: 5 },
            helpText: 'Per ICH Q3A(R2): ≤0.05% for drug substance; per ICH Q3B(R2): ≤0.1% for drug product (dose ≤1 g/day).',
          },
          {
            id: 'identification_threshold',
            label: 'Identification Threshold (%)',
            type: 'number',
            validation: { min: 0, max: 5 },
            helpText: 'Per ICH Q3A(R2): 0.10% or 1.0 mg/day (whichever is lower) for drug substance. Per ICH Q3B(R2): threshold depends on maximum daily dose.',
          },
          {
            id: 'qualification_threshold',
            label: 'Qualification Threshold (%)',
            type: 'number',
            validation: { min: 0, max: 5 },
            helpText: 'Per ICH Q3A(R2): 0.15% or 1.0 mg/day (whichever is lower) for drug substance. Impurities above this threshold require toxicological qualification.',
          },
          {
            id: 'specified_impurities_list',
            label: 'Specified Impurities (Name, Origin, Limit)',
            type: 'textarea',
            placeholder: 'e.g., Impurity A (process-related, ≤0.15%), Impurity B (degradation product, ≤0.20%), Impurity C (starting material, ≤0.10%)',
            required: true,
            validation: { minLength: 20 },
            helpText: 'Per ICH Q3A(R2)/Q3B(R2), list all specified impurities with their names, origin (process-related, degradation, starting material), and acceptance limits.',
          },
          {
            id: 'total_impurities_limit',
            label: 'Total Impurities Limit (%)',
            type: 'number',
            validation: { min: 0, max: 10 },
            helpText: 'The total impurities limit is the maximum sum of all individual impurities (specified and unspecified).',
          },
          {
            id: 'impurities_above_threshold',
            label: 'Are any impurities present above ICH identification or qualification thresholds that have not been identified or qualified?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q3A(R2)/Q3B(R2), impurities above the identification threshold must be structurally characterized; those above the qualification threshold must be toxicologically qualified.',
          },
          {
            id: 'impurity_fate_purge',
            label: 'Impurity Fate and Purge Studies',
            type: 'textarea',
            placeholder: 'e.g., Impurity A is purged in the crystallization step (purge factor >1000). Spike-and-purge studies demonstrate >99.9% removal across Steps 3-5.',
            helpText: 'Impurity fate and purge studies, often used in conjunction with ICH M7 assessments, demonstrate the ability of the process to remove or control impurities at each synthetic step.',
          },
        ],
        defaultNext: 'genotoxic_elemental',
        issueChecks: [
          {
            id: 'impurities_above_ich_threshold',
            condition: { field: 'impurities_above_threshold', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Impurities Above ICH Threshold Not Addressed',
            message:
              'One or more impurities are present above ICH identification or qualification thresholds and have not been fully characterized or qualified. Per ICH Q3A(R2)/Q3B(R2), impurities above the identification threshold must be structurally elucidated, and those above the qualification threshold require toxicological qualification or justification.',
            reference: 'ICH Q3A(R2); ICH Q3B(R2)',
          },
        ],
      },

      {
        id: 'genotoxic_elemental',
        section: 'impurities_section',
        question:
          'Address genotoxic impurities (ICH M7), elemental impurities (ICH Q3D), and residual solvents (ICH Q3C).',
        guidance:
          'ICH M7(R2) "Assessment and Control of DNA Reactive (Mutagenic) Impurities in Pharmaceuticals" requires assessment of all potential mutagenic impurities (PMIs) using (Q)SAR prediction models and/or Ames test data. Control options include Option 1 (specification in drug substance), Option 2 (process control at an intermediate), and Option 3 (purge-based argument). ICH Q3D(R2) "Guideline for Elemental Impurities" requires a risk-based assessment of 24 elemental impurities. ICH Q3C(R8) classifies residual solvents into Class 1-3.',
        fields: [
          {
            id: 'ich_m7_assessment_completed',
            label: 'Has a genotoxic impurity assessment per ICH M7(R2) been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH M7(R2) requires assessment of mutagenic potential for all actual and potential impurities in the drug substance synthesis. (Q)SAR analysis using two complementary models (expert rule-based and statistical) is the standard approach.',
          },
          {
            id: 'gti_identified',
            label: 'Have any genotoxic impurities (GTIs) been identified?',
            type: 'yes_no',
            visibleWhen: { field: 'ich_m7_assessment_completed', operator: 'eq', value: true },
          },
          {
            id: 'gti_class',
            label: 'ICH M7 Class of Each GTI',
            type: 'textarea',
            placeholder: 'e.g., Impurity X: Class 2 (known mutagen, no carcinogenicity data); Impurity Y: Class 3 (alerting structure, no mutagenicity data — Ames test planned)',
            visibleWhen: { field: 'gti_identified', operator: 'eq', value: true },
            helpText: 'ICH M7 classifies mutagens as: Class 1 (known carcinogenic), Class 2 (known mutagen, unknown carcinogenicity), Class 3 (alerting structure, no mutagenicity data), Class 4 (alerting structure but no mutagenic activity), Class 5 (no structural alert).',
          },
          {
            id: 'gti_control_strategy',
            label: 'GTI Control Strategy',
            type: 'select',
            visibleWhen: { field: 'gti_identified', operator: 'eq', value: true },
            options: [
              { value: 'option1', label: 'Option 1 — Specification in Drug Substance' },
              { value: 'option2', label: 'Option 2 — Process Control at Intermediate' },
              { value: 'option3', label: 'Option 3 — Purge-Based Argument' },
              { value: 'option4', label: 'Option 4 — Controlled in Drug Product' },
              { value: 'combination', label: 'Combination of Options' },
            ],
            helpText: 'Per ICH M7(R2) Section 8, the control strategy should be based on the Threshold of Toxicological Concern (TTC) of 1.5 mcg/day for lifetime exposure, with allowances for shorter-than-lifetime exposure per Haber\'s rule (Table 2).',
          },
          {
            id: 'ichq3d_assessment_completed',
            label: 'Has an elemental impurities assessment per ICH Q3D(R2) been completed?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q3D(R2) requires a risk assessment for 24 elemental impurities (Cd, Pb, As, Hg, and others) considering all potential sources: drug substance synthesis, excipients, container closure, manufacturing equipment, and water systems.',
          },
          {
            id: 'elemental_impurity_method',
            label: 'Elemental Impurity Risk Assessment Method',
            type: 'select',
            visibleWhen: { field: 'ichq3d_assessment_completed', operator: 'eq', value: true },
            options: [
              { value: 'component_based', label: 'Component-Based Summation' },
              { value: 'process_based', label: 'Process-Based Assessment' },
              { value: 'finished_product', label: 'Finished Product Testing (ICP-MS/OES)' },
              { value: 'combination', label: 'Combination Approach' },
            ],
            helpText: 'Per ICH Q3D(R2) Section 5, the risk assessment may use a component-based approach (summing contributions from each source) or direct finished product testing.',
          },
          {
            id: 'residual_solvents_ichq3c',
            label: 'Residual Solvents Identified per ICH Q3C(R8)',
            type: 'textarea',
            placeholder: 'e.g., Class 2: Dichloromethane (limit 600 ppm), Methanol (limit 3000 ppm); Class 3: Ethanol, Ethyl acetate (limit 5000 ppm each)',
            helpText: 'Per ICH Q3C(R8), classify all solvents used in the last three synthetic steps as Class 1 (to be avoided), Class 2 (limit required), or Class 3 (limit 5000 ppm or 50 mg/day).',
          },
        ],
        defaultNext: 'validation_strategy',
        issueChecks: [
          {
            id: 'gti_not_assessed',
            condition: { field: 'ich_m7_assessment_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Genotoxic Impurity Assessment Not Completed',
            message:
              'A genotoxic impurity assessment per ICH M7(R2) has not been completed. This is a regulatory requirement for all drug substance submissions. Failure to assess and control mutagenic impurities can result in clinical hold (IND) or refusal to file (NDA/BLA). The assessment should include (Q)SAR analysis of all intermediates, reagents, and potential impurities.',
            reference: 'ICH M7(R2) "Assessment and Control of DNA Reactive (Mutagenic) Impurities"',
          },
          {
            id: 'elemental_impurities_not_assessed',
            condition: { field: 'ichq3d_assessment_completed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Elemental Impurities Assessment Not Completed',
            message:
              'An elemental impurities assessment per ICH Q3D(R2) has not been completed. This risk assessment is required for NDA/BLA/ANDA submissions and must consider all potential sources of elemental impurities including drug substance, excipients, container closure materials, manufacturing equipment, and water.',
            reference: 'ICH Q3D(R2) "Guideline for Elemental Impurities"',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 7 — Process Validation                                  */
      /* ================================================================ */

      {
        id: 'validation_strategy',
        section: 'process_validation_section',
        question:
          'Describe the process validation approach and key elements. This corresponds to CTD Section 3.2.P.3.5.',
        guidance:
          'Per FDA Guidance "Process Validation: General Principles and Practices" (2011) and ICH Q8(R2), process validation follows a lifecycle approach with three stages: Stage 1 (Process Design), Stage 2 (Process Qualification — PPQ), and Stage 3 (Continued Process Verification). ICH Q8(R2) encourages establishing a design space linking CPPs to CQAs. Process Analytical Technology (PAT) per FDA PAT Guidance (2004) enables real-time monitoring and control.',
        fields: [
          {
            id: 'validation_approach',
            label: 'Process Validation Approach',
            type: 'select',
            required: true,
            options: [
              { value: 'traditional', label: 'Traditional (Three Consecutive PPQ Batches)' },
              { value: 'continuous', label: 'Continuous Process Verification' },
              { value: 'hybrid', label: 'Hybrid (Traditional + Continuous Elements)' },
            ],
            helpText: 'Per FDA Process Validation Guidance (2011), traditional validation uses a defined number of qualification batches, while continuous verification uses ongoing data collection and statistical analysis.',
          },
          {
            id: 'process_development_stage',
            label: 'Process Development Stage',
            type: 'select',
            options: [
              { value: 'stage1', label: 'Stage 1 — Process Design (Lab/Pilot Scale)' },
              { value: 'stage2', label: 'Stage 2 — Process Qualification (PPQ)' },
              { value: 'stage3', label: 'Stage 3 — Continued Process Verification' },
            ],
            helpText: 'Per FDA Process Validation Guidance (2011), the validation lifecycle includes three stages.',
          },
          {
            id: 'cqas_identified',
            label: 'Critical Quality Attributes (CQAs) Identified',
            type: 'textarea',
            placeholder: 'e.g., Assay (98.0-102.0%), Related substances (total ≤1.0%), Dissolution (Q=80% in 30 min), Content uniformity (AV ≤15.0)',
            required: true,
            helpText: 'Per ICH Q8(R2), a CQA is a physical, chemical, biological, or microbiological property that should be within an appropriate limit to ensure product quality.',
            validation: { minLength: 20 },
          },
          {
            id: 'design_space_established',
            label: 'Has a design space per ICH Q8(R2) been established?',
            type: 'yes_no',
            helpText: 'Per ICH Q8(R2), a design space is the multidimensional combination of input variables and process parameters demonstrated to provide quality assurance. Working within the design space is not considered a change and does not require regulatory approval.',
          },
          {
            id: 'pat_used',
            label: 'Is Process Analytical Technology (PAT) used?',
            type: 'yes_no',
            helpText: 'Per FDA "Guidance for Industry: PAT — A Framework for Innovative Pharmaceutical Development, Manufacturing, and Quality Assurance" (2004), PAT enables real-time monitoring and control of CPPs and CQAs.',
          },
          {
            id: 'pat_description',
            label: 'PAT Tools and Applications',
            type: 'textarea',
            placeholder: 'e.g., NIR for blend uniformity monitoring, Raman for polymorph identification during crystallization, in-line pH and DO monitoring during fermentation',
            visibleWhen: { field: 'pat_used', operator: 'eq', value: true },
          },
          {
            id: 'validation_batches_completed',
            label: 'Number of Validation (PPQ) Batches Completed',
            type: 'number',
            validation: { min: 0, max: 100 },
            helpText: 'Per FDA Process Validation Guidance (2011), the number of PPQ batches should be based on process understanding and product knowledge. Traditionally, a minimum of three consecutive successful batches is expected.',
          },
        ],
        defaultNext: 'control_strategy',
        issueChecks: [
          {
            id: 'no_process_validation',
            condition: { field: 'validation_batches_completed', operator: 'lt', value: 1 },
            severity: 'warning',
            title: 'No Process Validation Batches Completed',
            message:
              'No process validation (PPQ) batches have been completed. Per FDA Process Validation Guidance (2011), process performance qualification requires a sufficient number of successful batches manufactured under commercial conditions to demonstrate process reproducibility. For NDA/BLA submissions, PPQ data should be available.',
            reference: 'FDA Guidance "Process Validation: General Principles and Practices" (2011)',
          },
          {
            id: 'no_design_space',
            condition: { field: 'design_space_established', operator: 'eq', value: false },
            severity: 'info',
            title: 'No Design Space Established',
            message:
              'A design space per ICH Q8(R2) has not been established. While not mandatory, establishing a design space provides regulatory flexibility by allowing movement within the space without requiring prior approval. Consider a QbD approach with Design of Experiments (DoE) to define the design space.',
            reference: 'ICH Q8(R2) Section 3.1 "Design Space"',
          },
        ],
      },

      {
        id: 'control_strategy',
        section: 'process_validation_section',
        question:
          'Describe the overall control strategy for the drug product. This integrates elements from ICH Q8, Q9, Q10, and Q11.',
        guidance:
          'Per ICH Q10 "Pharmaceutical Quality System" and ICH Q8(R2), the control strategy is a planned set of controls derived from current product and process understanding that ensures process performance and product quality. It includes material attributes, process parameters, in-process controls, specifications, and monitoring. Real-time release testing (RTRT) per ICH Q8(R2) may replace traditional end-product testing when justified.',
        fields: [
          {
            id: 'control_strategy_described',
            label: 'Has an overall control strategy per ICH Q10 been described?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q10, the control strategy should describe how material attributes, process controls, and specifications work together to ensure consistent quality.',
          },
          {
            id: 'specification_based_controls',
            label: 'Specification-Based Controls',
            type: 'textarea',
            placeholder: 'e.g., Drug substance specifications (assay, impurities, water content, residual solvents); Drug product specifications (assay, CU, dissolution, degradation products)',
            helpText: 'Per ICH Q6A/Q6B, specifications are a list of tests, references to analytical procedures, and appropriate acceptance criteria.',
          },
          {
            id: 'in_process_controls_strategy',
            label: 'In-Process Controls',
            type: 'textarea',
            placeholder: 'e.g., Blend uniformity (RSD <5%), moisture content at granulation (<2.5%), tablet weight (±3%), hardness (8-14 kP), friability (<1.0%)',
            helpText: 'Per 21 CFR 211.110, in-process specifications must be established and followed to ensure conformance during manufacturing.',
          },
          {
            id: 'rtrt_used',
            label: 'Is real-time release testing (RTRT) used?',
            type: 'yes_no',
            helpText: 'Per ICH Q8(R2) Section 4.1, RTRT is the ability to evaluate and ensure product quality based on process data, including valid combination of measured material attributes and process controls.',
          },
          {
            id: 'rtrt_description',
            label: 'Real-Time Release Testing Description',
            type: 'textarea',
            placeholder: 'e.g., NIR-based blend uniformity prediction model replacing traditional HPLC content uniformity testing. Model validated per ICH Q2(R2) and ASTM E2810.',
            visibleWhen: { field: 'rtrt_used', operator: 'eq', value: true },
          },
          {
            id: 'cpv_plan',
            label: 'Continued Process Verification Plan',
            type: 'textarea',
            placeholder: 'e.g., Statistical trending of CQAs from each commercial batch using control charts (X-bar/R, CUSUM). Annual Product Quality Review per 21 CFR 211.180(e).',
            helpText: 'Per FDA Process Validation Guidance (2011) Stage 3, continued process verification ensures the process remains in a state of control during commercial manufacturing.',
          },
          {
            id: 'process_capability_assessment',
            label: 'Process Capability Assessment',
            type: 'textarea',
            placeholder: 'e.g., Assay: Cpk = 1.8; Dissolution: Cpk = 2.1; Content Uniformity: Cpk = 1.5. All CQAs demonstrate Cpk >1.33.',
            helpText: 'Process capability indices (Cpk, Ppk) quantify the ability of the process to consistently produce within specification limits. Cpk >1.33 is generally considered capable.',
          },
        ],
        defaultNext: 'specification_setting',
      },

      /* ================================================================ */
      /*  Section 8 — Specifications & Control                            */
      /* ================================================================ */

      {
        id: 'specification_setting',
        section: 'specifications_control_section',
        question:
          'Describe the approach to specification setting for the drug substance and drug product. This corresponds to CTD Sections 3.2.S.4.5 and 3.2.P.5.6.',
        guidance:
          'Per ICH Q6A "Specifications: Test Procedures and Acceptance Criteria for New Drug Substances and New Drug Products" (chemical entities) and ICH Q6B (biological/biotechnological products), specifications are justified based on manufacturing experience, stability data, clinical data, and compendial standards. Release and shelf-life specifications may differ. BCS classification (per FDA Guidance "Waiver of In Vivo Bioavailability and Bioequivalence Studies") informs dissolution specification requirements.',
        fields: [
          {
            id: 'specification_approach',
            label: 'Specification Setting Approach',
            type: 'select',
            required: true,
            options: [
              { value: 'ichq6a', label: 'ICH Q6A (Chemical Entities)' },
              { value: 'ichq6b', label: 'ICH Q6B (Biotechnological/Biological Products)' },
            ],
            helpText: 'ICH Q6A applies to chemical drug substances/products; ICH Q6B applies to biotechnological/biological products including proteins, peptides, and nucleic acids.',
          },
          {
            id: 'release_specs_defined',
            label: 'Have release specifications been defined?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q6A/Q6B, release specifications define the quality that the drug substance or drug product must meet at the time of release.',
          },
          {
            id: 'shelf_life_specs_defined',
            label: 'Have shelf-life specifications been defined?',
            type: 'yes_no',
            required: true,
            helpText: 'Shelf-life (expiry) specifications may differ from release specifications to accommodate expected changes during storage (e.g., wider impurity limits per ICH Q3A/Q3B).',
          },
          {
            id: 'specification_justification',
            label: 'Specification Justification Basis',
            type: 'multi_select',
            options: [
              { value: 'compendial', label: 'Compendial Standards (USP/EP/JP)' },
              { value: 'clinical', label: 'Clinical Experience / Safety Data' },
              { value: 'manufacturing', label: 'Manufacturing Capability / Batch History' },
              { value: 'stability', label: 'Stability Data' },
              { value: 'regulatory_precedent', label: 'Regulatory Precedent' },
            ],
            helpText: 'Per ICH Q6A, specifications should be justified using a combination of manufacturing data, stability data, clinical data, and compendial requirements.',
          },
          {
            id: 'acceptance_criteria_basis',
            label: 'Acceptance Criteria Basis Summary',
            type: 'textarea',
            placeholder: 'e.g., Assay: 95.0-105.0% based on manufacturing capability (±2%) and analytical variability; Impurities: based on ICH Q3A(R2) qualification thresholds and batch history',
            helpText: 'Describe how acceptance criteria were derived for key quality attributes.',
          },
          {
            id: 'bcs_classification',
            label: 'BCS Classification (if applicable for oral dosage forms)',
            type: 'select',
            options: [
              { value: 'bcs_1', label: 'BCS Class I (High Solubility / High Permeability)' },
              { value: 'bcs_2', label: 'BCS Class II (Low Solubility / High Permeability)' },
              { value: 'bcs_3', label: 'BCS Class III (High Solubility / Low Permeability)' },
              { value: 'bcs_4', label: 'BCS Class IV (Low Solubility / Low Permeability)' },
              { value: 'not_applicable', label: 'Not Applicable (Non-Oral Route)' },
            ],
            helpText: 'Per FDA Guidance "Waiver of In Vivo Bioavailability and Bioequivalence Studies for Immediate-Release Solid Oral Dosage Forms" and ICH M9, BCS classification determines dissolution specification requirements and biowaiver eligibility.',
          },
          {
            id: 'dissolution_specification',
            label: 'Dissolution Specification',
            type: 'textarea',
            placeholder: 'e.g., USP Apparatus II (paddle), 50 rpm, 900 mL 0.1N HCl, Q=80% in 30 minutes',
            visibleWhen: { field: 'bcs_classification', operator: 'neq', value: 'not_applicable' },
            helpText: 'Per ICH Q6A, dissolution testing is required for solid oral dosage forms. The specification should be based on BCS classification, formulation factors, and clinical performance.',
          },
        ],
        defaultNext: 'comparability',
        provideExpertFeedback: true,
      },

      {
        id: 'comparability',
        section: 'specifications_control_section',
        question:
          'Describe any process change history and comparability assessments. For biologics, address comparability per ICH Q5E.',
        guidance:
          'Per ICH Q5E "Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process," any significant change to the manufacturing process of a biological product requires a comparability assessment demonstrating that the pre-change and post-change product are comparable in quality, safety, and efficacy. For chemical entities, 21 CFR 314.70 defines post-approval change categories (annual report, CBE-30, prior approval). Annual Product Quality Reviews per 21 CFR 211.180(e) / ICH Q7 Section 2.5 support ongoing quality assessment.',
        fields: [
          {
            id: 'process_change_history',
            label: 'Process Change History',
            type: 'textarea',
            placeholder: 'e.g., Scale-up from 10L to 200L bioreactor (2024-Q2); Change of drug product manufacturing site (2024-Q4); Introduction of new resin for purification (2025-Q1)',
            helpText: 'Document all significant process changes made during development, including scale-up, site changes, process parameter modifications, and raw material/component changes.',
          },
          {
            id: 'comparability_completed',
            label: 'Has a comparability assessment per ICH Q5E been completed?',
            type: 'yes_no',
            visibleWhen: { field: 'product_type', operator: 'in', value: ['biologic', 'peptide', 'adc'] },
            helpText: 'ICH Q5E requires comparability assessment when a manufacturing process change could affect the quality of a biotechnological/biological product. The assessment typically includes analytical (physicochemical, biological), nonclinical, and clinical comparability data.',
          },
          {
            id: 'comparability_protocol',
            label: 'Comparability Protocol Summary',
            type: 'textarea',
            placeholder: 'e.g., Comparability protocol includes side-by-side analytical testing of pre-change (n=5) and post-change (n=5) batches for primary structure, higher-order structure, purity, potency, and CQAs. Statistical equivalence criteria defined for each attribute.',
            visibleWhen: { field: 'comparability_completed', operator: 'eq', value: true },
            helpText: 'Per ICH Q5E, the comparability protocol should define the analytical, nonclinical, and/or clinical studies to be conducted, along with acceptance criteria for demonstrating comparability.',
          },
          {
            id: 'annual_product_review',
            label: 'Has an Annual Product Quality Review been conducted?',
            type: 'yes_no',
            helpText: 'Per 21 CFR 211.180(e) and ICH Q7 Section 2.5, an annual review of product quality should include batch analysis results, OOS investigations, complaints, deviations, process changes, and trending data.',
          },
          {
            id: 'trending_data_available',
            label: 'Is trending data available for key quality attributes?',
            type: 'yes_no',
            helpText: 'Per ICH Q10 and 21 CFR 211.180(e), trending of CQA data across batches supports process understanding and early detection of process drift. Statistical process control (SPC) charts are recommended.',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
        issueChecks: [
          {
            id: 'no_comparability_biologics',
            condition: { field: 'comparability_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Comparability Assessment for Biologic Product',
            message:
              'A comparability assessment per ICH Q5E has not been completed for this biological product. Any significant manufacturing process change for a biological product requires a comparability exercise to demonstrate that the change does not adversely affect product quality, safety, or efficacy. Failure to demonstrate comparability may require additional clinical studies.',
            reference: 'ICH Q5E "Comparability of Biotechnological/Biological Products"',
          },
        ],
      },
    ],
  };
}
