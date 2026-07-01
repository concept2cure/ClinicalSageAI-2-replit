/**
 * CMC (Chemistry, Manufacturing, and Controls) Specification flow definition
 * for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive CMC questionnaire
 * covering drug substance characterization, synthetic route & controls,
 * impurity profiling, drug product formulation, manufacturing process,
 * analytical methods, container closure, and stability per ICH Q1–Q12.
 *
 * 20 nodes · 85+ fields · 7 sections · 14 issue checks
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
      'Comprehensive Chemistry, Manufacturing, and Controls questionnaire covering drug substance characterization, synthetic route, impurity profiling, drug product formulation, manufacturing process, analytical methods, container closure systems, and stability studies per ICH Q1–Q12 and FDA process validation guidance.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'substance_overview',
    estimatedMinutes: 45,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'drug_substance_overview',
        label: 'Drug Substance Overview',
        nodeIds: ['substance_overview', 'substance_classification', 'substance_physicochemical'],
      },
      {
        id: 'synthetic_route_controls',
        label: 'Synthetic Route & Controls',
        nodeIds: ['synthesis_route', 'critical_process_params', 'starting_materials'],
      },
      {
        id: 'characterization_impurities',
        label: 'Characterization & Impurities',
        nodeIds: ['structural_elucidation', 'impurity_profile', 'genotoxic_impurities'],
      },
      {
        id: 'drug_product_formulation',
        label: 'Drug Product Formulation',
        nodeIds: ['dosage_form', 'excipient_selection', 'novel_excipient_characterization'],
      },
      {
        id: 'manufacturing_process',
        label: 'Manufacturing Process',
        nodeIds: ['process_description', 'sterile_manufacturing', 'process_validation'],
      },
      {
        id: 'analytical_methods_specifications',
        label: 'Analytical Methods & Specifications',
        nodeIds: ['analytical_procedures', 'specification_limits', 'reference_standards'],
      },
      {
        id: 'container_closure_stability',
        label: 'Container Closure & Stability',
        nodeIds: ['container_closure', 'stability_program', 'peptide_oligo_special'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Drug Substance Overview                            */
      /* ================================================================ */

      {
        id: 'substance_overview',
        section: 'drug_substance_overview',
        question:
          'Let\'s begin with the drug substance. Please provide a high-level overview of the compound, including its nomenclature, molecular classification, and intended therapeutic use per ICH Q6A/Q6B.',
        guidance:
          'ICH Q6A (for chemical substances) and Q6B (for biotechnological/biological products) require a complete description of the drug substance including nomenclature, structure, and general properties. This information corresponds to CTD Module 3.2.S.1. Provide the INN/USAN if assigned.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'substance_name_inn',
            label: 'Drug Substance Name (INN/USAN)',
            type: 'text',
            placeholder: 'e.g., remdesivir',
            required: true,
            helpText: 'International Nonproprietary Name or United States Adopted Name if assigned.',
          },
          {
            id: 'substance_code',
            label: 'Internal Compound Code',
            type: 'text',
            placeholder: 'e.g., GS-5734',
            required: true,
          },
          {
            id: 'cas_number',
            label: 'CAS Registry Number',
            type: 'text',
            placeholder: 'e.g., 1809249-37-3',
            helpText: 'Chemical Abstracts Service registry number, if assigned.',
          },
          {
            id: 'molecular_formula',
            label: 'Molecular Formula',
            type: 'text',
            placeholder: 'e.g., C27H35N6O8P',
            required: true,
          },
          {
            id: 'molecular_weight',
            label: 'Molecular Weight (Da)',
            type: 'number',
            placeholder: 'e.g., 602.58',
            required: true,
            validation: { min: 1, max: 5000000 },
            helpText: 'For biologics, provide the theoretical molecular weight of the primary sequence.',
          },
          {
            id: 'molecule_type',
            label: 'Molecule Type',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule', description: 'Chemical entity, MW typically < 1000 Da — ICH Q6A applies' },
              { value: 'protein_mab', label: 'Protein / Monoclonal Antibody', description: 'Recombinant protein or mAb — ICH Q6B applies' },
              { value: 'peptide', label: 'Peptide', description: 'Synthetic or recombinant peptide (typically 2–100 amino acids)' },
              { value: 'oligonucleotide', label: 'Oligonucleotide (ASO/siRNA/mRNA)', description: 'Antisense, siRNA, or mRNA therapeutic' },
              { value: 'adc', label: 'Antibody-Drug Conjugate', description: 'Conjugated biologic — dual ICH Q6A + Q6B considerations' },
              { value: 'gene_therapy', label: 'Gene Therapy Vector', description: 'Viral or non-viral gene therapy product' },
              { value: 'cell_therapy', label: 'Cell Therapy', description: 'Autologous or allogeneic cell therapy product' },
            ],
          },
          {
            id: 'therapeutic_indication',
            label: 'Proposed Therapeutic Indication',
            type: 'textarea',
            placeholder: 'e.g., Treatment of chronic hepatitis C genotype 1 infection in adults',
            required: true,
            validation: { minLength: 20, maxLength: 500 },
          },
        ],
        branches: [
          {
            when: { field: 'molecule_type', operator: 'in', value: ['protein_mab', 'adc', 'gene_therapy', 'cell_therapy'] },
            goto: 'substance_classification',
          },
          {
            when: { field: 'molecule_type', operator: 'in', value: ['peptide', 'oligonucleotide'] },
            goto: 'substance_classification',
          },
        ],
        defaultNext: 'substance_classification',
      },

      {
        id: 'substance_classification',
        section: 'drug_substance_overview',
        question:
          'Classify the drug substance regulatory pathway and provide structural details. For biologics, describe the expression system and cell line per ICH Q6B. For small molecules, describe the chemical class and stereochemistry per ICH Q6A.',
        guidance:
          'ICH Q6A Section 3 requires complete structural characterization for new chemical entities including stereochemistry, polymorphism, and salt form. ICH Q6B Section 3 requires description of the expression construct, host cell line, cell banking system, and post-translational modifications for biologics.',
        fields: [
          {
            id: 'regulatory_classification',
            label: 'Regulatory Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'nce', label: 'New Chemical Entity (NCE)' },
              { value: 'new_biologic', label: 'New Biologic (BLA pathway)' },
              { value: 'biosimilar', label: 'Biosimilar (351(k) pathway)' },
              { value: 'generic', label: 'Generic (ANDA pathway)' },
              { value: 'hybrid_505b2', label: 'Hybrid 505(b)(2)' },
            ],
          },
          {
            id: 'stereo_chirality',
            label: 'Stereochemistry / Chirality',
            type: 'select',
            visibleWhen: { field: 'molecule_type', operator: 'in', value: ['small_molecule'] },
            options: [
              { value: 'achiral', label: 'Achiral' },
              { value: 'single_enantiomer', label: 'Single Enantiomer' },
              { value: 'racemate', label: 'Racemate' },
              { value: 'diastereomer', label: 'Diastereomeric Mixture' },
            ],
          },
          {
            id: 'salt_form',
            label: 'Salt / Polymorph Form',
            type: 'text',
            placeholder: 'e.g., hydrochloride salt, Form A polymorph',
            visibleWhen: { field: 'molecule_type', operator: 'in', value: ['small_molecule'] },
            helpText: 'Identify the specific salt form and crystalline polymorph selected for development (ICH Q6A, Decision Tree #4).',
          },
          {
            id: 'expression_system',
            label: 'Expression System / Cell Line',
            type: 'select',
            visibleWhen: { field: 'molecule_type', operator: 'in', value: ['protein_mab', 'adc', 'gene_therapy'] },
            options: [
              { value: 'cho', label: 'CHO (Chinese Hamster Ovary)' },
              { value: 'hek293', label: 'HEK293' },
              { value: 'e_coli', label: 'E. coli' },
              { value: 'yeast', label: 'Yeast (Pichia / S. cerevisiae)' },
              { value: 'insect', label: 'Insect Cell / Baculovirus' },
              { value: 'plant', label: 'Plant-based' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Per ICH Q6B, the cell substrate used for manufacturing must be fully described including origin and history.',
          },
          {
            id: 'cell_bank_system',
            label: 'Cell Bank System Description',
            type: 'textarea',
            placeholder: 'Describe the master cell bank (MCB) and working cell bank (WCB) system...',
            visibleWhen: { field: 'molecule_type', operator: 'in', value: ['protein_mab', 'adc', 'gene_therapy', 'cell_therapy'] },
            helpText: 'ICH Q5B and Q5D require characterization of cell banks including identity, purity, stability, and adventitious agent testing.',
            validation: { minLength: 50 },
          },
        ],
        defaultNext: 'substance_physicochemical',
      },

      {
        id: 'substance_physicochemical',
        section: 'drug_substance_overview',
        question:
          'Describe the key physicochemical properties of the drug substance. These properties inform formulation strategy, stability behavior, and specification setting per ICH Q6A/Q6B.',
        guidance:
          'ICH Q6A requires characterization of physicochemical properties including appearance, solubility, hygroscopicity, melting point, and partition coefficient. These data support specification setting (ICH Q6A Decision Trees) and inform the BCS classification for oral products. For biologics per ICH Q6B, describe higher-order structure, charge variants, and aggregation propensity.',
        fields: [
          {
            id: 'physical_appearance',
            label: 'Physical Appearance',
            type: 'text',
            placeholder: 'e.g., White to off-white crystalline powder',
            required: true,
          },
          {
            id: 'solubility_profile',
            label: 'Solubility Profile',
            type: 'textarea',
            placeholder: 'e.g., Freely soluble in DMSO; slightly soluble in water (0.1 mg/mL at pH 7.4); soluble in ethanol',
            required: true,
            helpText: 'Describe aqueous and organic solubility. For oral products, pH-dependent solubility data are critical for BCS classification.',
          },
          {
            id: 'bcs_class',
            label: 'BCS Classification (oral products)',
            type: 'select',
            visibleWhen: { field: 'molecule_type', operator: 'eq', value: 'small_molecule' },
            options: [
              { value: 'bcs_i', label: 'BCS Class I — High Solubility / High Permeability' },
              { value: 'bcs_ii', label: 'BCS Class II — Low Solubility / High Permeability' },
              { value: 'bcs_iii', label: 'BCS Class III — High Solubility / Low Permeability' },
              { value: 'bcs_iv', label: 'BCS Class IV — Low Solubility / Low Permeability' },
              { value: 'not_determined', label: 'Not Yet Determined' },
              { value: 'not_applicable', label: 'Not Applicable (non-oral route)' },
            ],
          },
          {
            id: 'polymorphism_screening',
            label: 'Polymorphism Screening Completed?',
            type: 'yes_no',
            visibleWhen: { field: 'molecule_type', operator: 'eq', value: 'small_molecule' },
            helpText: 'ICH Q6A Decision Tree #4 requires evaluation of polymorphism. Unexpected polymorph conversions can impact bioavailability and stability.',
          },
          {
            id: 'aggregation_propensity',
            label: 'Aggregation Propensity Assessment',
            type: 'select',
            visibleWhen: { field: 'molecule_type', operator: 'in', value: ['protein_mab', 'adc'] },
            options: [
              { value: 'low', label: 'Low (< 1% HMW by SEC)' },
              { value: 'moderate', label: 'Moderate (1–5% HMW)' },
              { value: 'high', label: 'High (> 5% HMW)' },
              { value: 'not_assessed', label: 'Not Yet Assessed' },
            ],
            helpText: 'Protein aggregates can trigger immunogenicity (ICH Q6B). Aggregation propensity informs formulation and hold-time studies.',
          },
        ],
        defaultNext: 'synthesis_route',
      },

      /* ================================================================ */
      /*  Section 2 — Synthetic Route & Controls                         */
      /* ================================================================ */

      {
        id: 'synthesis_route',
        section: 'synthetic_route_controls',
        question:
          'Describe the synthetic route or manufacturing process for the drug substance. Per ICH Q11, the manufacturing process description should include all steps from starting materials to the final drug substance.',
        guidance:
          'ICH Q11 provides guidance on the description of the drug substance manufacturing process, including selection and justification of starting materials, description of the process, and process controls. For biologics, describe the upstream (cell culture/fermentation) and downstream (purification) process per ICH Q5A–Q5E.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'synthesis_type',
            label: 'Manufacturing Process Type',
            type: 'select',
            required: true,
            options: [
              { value: 'chemical_synthesis', label: 'Chemical Synthesis' },
              { value: 'semi_synthesis', label: 'Semi-Synthesis (natural product derivative)' },
              { value: 'fermentation', label: 'Fermentation' },
              { value: 'recombinant', label: 'Recombinant DNA Technology' },
              { value: 'spps', label: 'Solid-Phase Peptide Synthesis (SPPS)' },
              { value: 'oligonucleotide_synthesis', label: 'Oligonucleotide Synthesis (phosphoramidite)' },
              { value: 'cell_processing', label: 'Cell Processing / Ex Vivo Manipulation' },
              { value: 'extraction', label: 'Extraction from Natural Source' },
            ],
          },
          {
            id: 'number_of_steps',
            label: 'Number of Synthetic Steps (from registered starting materials)',
            type: 'number',
            placeholder: 'e.g., 7',
            validation: { min: 1, max: 100 },
            visibleWhen: { field: 'synthesis_type', operator: 'in', value: ['chemical_synthesis', 'semi_synthesis'] },
          },
          {
            id: 'process_description_text',
            label: 'High-Level Process Description',
            type: 'textarea',
            placeholder: 'Describe the overall synthetic strategy, key transformations, and purification approach...',
            required: true,
            validation: { minLength: 100, maxLength: 5000 },
            helpText: 'Include key transformations, critical reagents, solvents, and purification steps. For biologics, describe cell culture conditions, harvest, and purification train.',
          },
          {
            id: 'process_development_stage',
            label: 'Process Development Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'lab_scale', label: 'Lab Scale (< 1 kg)' },
              { value: 'pilot_scale', label: 'Pilot Scale (1–100 kg)' },
              { value: 'commercial_scale', label: 'Commercial Scale (> 100 kg)' },
              { value: 'tech_transfer', label: 'Technology Transfer in Progress' },
            ],
          },
          {
            id: 'qbd_approach',
            label: 'Quality by Design (QbD) Approach Applied?',
            type: 'yes_no',
            helpText: 'ICH Q8(R2), Q9, and Q10 promote a systematic QbD approach including design space, risk assessment, and control strategy.',
          },
        ],
        defaultNext: 'critical_process_params',
      },

      {
        id: 'critical_process_params',
        section: 'synthetic_route_controls',
        question:
          'Identify the critical process parameters (CPPs) and critical quality attributes (CQAs) per ICH Q8(R2). How have these been linked through risk assessment and design of experiments?',
        guidance:
          'ICH Q8(R2) defines CPPs as process parameters whose variability has an impact on a CQA and therefore should be monitored or controlled. CQAs are physical, chemical, biological, or microbiological properties that should be within an appropriate limit, range, or distribution. ICH Q9 (Quality Risk Management) guides the identification and ranking of CPPs through tools such as FMEA or risk ranking.',
        fields: [
          {
            id: 'cqa_identified',
            label: 'Have Critical Quality Attributes (CQAs) Been Identified?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cqa_list',
            label: 'List Key CQAs',
            type: 'textarea',
            placeholder: 'e.g., Assay (potency), Related substances (impurities), Chiral purity, Particle size distribution, Water content...',
            visibleWhen: { field: 'cqa_identified', operator: 'eq', value: true },
            validation: { minLength: 20 },
          },
          {
            id: 'cpp_identified',
            label: 'Have Critical Process Parameters (CPPs) Been Identified?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cpp_list',
            label: 'List Key CPPs',
            type: 'textarea',
            placeholder: 'e.g., Reaction temperature (Step 3), pH during crystallization, Filtration pressure, Hold time...',
            visibleWhen: { field: 'cpp_identified', operator: 'eq', value: true },
            validation: { minLength: 20 },
          },
          {
            id: 'risk_assessment_tool',
            label: 'Risk Assessment Methodology Used',
            type: 'multi_select',
            options: [
              { value: 'fmea', label: 'FMEA (Failure Mode and Effects Analysis)' },
              { value: 'ishikawa', label: 'Ishikawa / Fishbone Diagram' },
              { value: 'risk_ranking', label: 'Risk Ranking and Filtering' },
              { value: 'doe', label: 'Design of Experiments (DoE)' },
              { value: 'fta', label: 'Fault Tree Analysis' },
              { value: 'none_yet', label: 'Not Yet Performed' },
            ],
            helpText: 'ICH Q9 recommends structured risk assessment. Common tools include FMEA, Ishikawa diagrams, and risk ranking/filtering.',
          },
          {
            id: 'design_space_established',
            label: 'Has a Design Space Been Established?',
            type: 'yes_no',
            helpText: 'ICH Q8(R2) defines design space as the multidimensional combination of input variables and process parameters demonstrated to provide assurance of quality. Working within the design space is not considered a change.',
          },
        ],
        defaultNext: 'starting_materials',
        issueChecks: [
          {
            id: 'no_cqa_identified',
            condition: { field: 'cqa_identified', operator: 'eq', value: false },
            severity: 'warning',
            title: 'CQAs Not Yet Identified',
            message: 'Critical Quality Attributes have not been identified. ICH Q8(R2) requires CQA identification as the foundation of the control strategy. Without defined CQAs, specification setting and process validation cannot be properly justified.',
            reference: 'ICH Q8(R2) Section 2.2 — Critical Quality Attributes',
          },
        ],
      },

      {
        id: 'starting_materials',
        section: 'synthetic_route_controls',
        question:
          'Define the starting materials and their specifications per ICH Q11. What controls are in place for starting material quality and supply chain integrity?',
        guidance:
          'ICH Q11 Section 5 provides guidance on the selection and justification of starting materials. The starting material should be a compound of defined chemical properties and structure that is incorporated as a significant structural fragment into the drug substance. Per ICH Q7, appropriate specifications and supplier qualification are required.',
        fields: [
          {
            id: 'num_starting_materials',
            label: 'Number of Registered Starting Materials',
            type: 'number',
            placeholder: 'e.g., 3',
            required: true,
            validation: { min: 0, max: 50 },
          },
          {
            id: 'starting_material_specs',
            label: 'Do All Starting Materials Have Written Specifications?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'supplier_qualification',
            label: 'Supplier Qualification Status',
            type: 'select',
            required: true,
            options: [
              { value: 'all_qualified', label: 'All Suppliers Qualified (audited)' },
              { value: 'partial', label: 'Some Suppliers Qualified' },
              { value: 'none_qualified', label: 'No Supplier Qualification Completed' },
              { value: 'single_source', label: 'Single-Source — Risk Mitigation Planned' },
            ],
          },
          {
            id: 'gmp_compliance',
            label: 'Starting Material GMP Compliance',
            type: 'select',
            required: true,
            options: [
              { value: 'ich_q7_full', label: 'Full ICH Q7 GMP from Starting Material Onward' },
              { value: 'ich_q7_partial', label: 'ICH Q7 GMP Applied from Intermediate Stage' },
              { value: 'non_gmp', label: 'Non-GMP Starting Materials with Incoming Testing' },
            ],
            helpText: 'ICH Q7 requires GMP principles to be applied at appropriate stages of manufacture. The point at which GMP begins should be justified.',
          },
        ],
        defaultNext: 'structural_elucidation',
      },

      /* ================================================================ */
      /*  Section 3 — Characterization & Impurities                      */
      /* ================================================================ */

      {
        id: 'structural_elucidation',
        section: 'characterization_impurities',
        question:
          'Describe the structural characterization strategy. What analytical techniques have been used to confirm the identity and structure of the drug substance?',
        guidance:
          'ICH Q6A requires structural confirmation by at least two independent analytical techniques (e.g., NMR, mass spectrometry, IR, X-ray crystallography). For biologics, ICH Q6B requires primary structure confirmation, post-translational modification analysis, higher-order structure assessment, and biological activity determination.',
        fields: [
          {
            id: 'characterization_techniques',
            label: 'Structural Characterization Techniques Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'nmr_1h', label: '¹H NMR' },
              { value: 'nmr_13c', label: '¹³C NMR' },
              { value: 'mass_spec', label: 'Mass Spectrometry (MS)' },
              { value: 'ir', label: 'Infrared Spectroscopy (IR/FTIR)' },
              { value: 'uv_vis', label: 'UV-Vis Spectroscopy' },
              { value: 'xrpd', label: 'X-Ray Powder Diffraction (XRPD)' },
              { value: 'single_crystal_xrd', label: 'Single Crystal X-Ray Diffraction' },
              { value: 'elemental_analysis', label: 'Elemental Analysis' },
              { value: 'peptide_mapping', label: 'Peptide Mapping (LC-MS/MS)' },
              { value: 'edman_sequencing', label: 'Edman Sequencing / N-terminal Analysis' },
              { value: 'cd', label: 'Circular Dichroism (CD)' },
              { value: 'dsc', label: 'Differential Scanning Calorimetry (DSC)' },
              { value: 'sec_mals', label: 'SEC-MALS (Size Exclusion with Multi-Angle Light Scattering)' },
              { value: 'glycan_analysis', label: 'Glycan Mapping / Glycosylation Analysis' },
            ],
          },
          {
            id: 'structure_confirmed',
            label: 'Has the Structure Been Unambiguously Confirmed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'absolute_configuration',
            label: 'Absolute Configuration Determined?',
            type: 'yes_no',
            visibleWhen: { field: 'molecule_type', operator: 'eq', value: 'small_molecule' },
          },
          {
            id: 'post_translational_mods',
            label: 'Post-Translational Modifications Characterized?',
            type: 'multi_select',
            visibleWhen: { field: 'molecule_type', operator: 'in', value: ['protein_mab', 'adc'] },
            options: [
              { value: 'glycosylation', label: 'Glycosylation' },
              { value: 'disulfide_bonds', label: 'Disulfide Bond Mapping' },
              { value: 'deamidation', label: 'Deamidation Sites' },
              { value: 'oxidation', label: 'Oxidation Sites' },
              { value: 'c_terminal_lysine', label: 'C-terminal Lysine Clipping' },
              { value: 'charge_variants', label: 'Charge Variant Analysis' },
            ],
          },
        ],
        defaultNext: 'impurity_profile',
      },

      {
        id: 'impurity_profile',
        section: 'characterization_impurities',
        question:
          'Describe the impurity profile of the drug substance per ICH Q3A (for chemical entities) or ICH Q6B (for biologics). Have all impurities above the identification and qualification thresholds been addressed?',
        guidance:
          'ICH Q3A(R2) sets reporting, identification, and qualification thresholds for organic impurities based on maximum daily dose. For a drug substance with a max daily dose ≤ 2 g/day, impurities ≥ 0.10% must be reported, ≥ 0.10% identified, and ≥ 0.15% qualified. ICH Q3B(R2) addresses impurities in the drug product. For biologics, process-related impurities (host cell proteins, DNA, leached Protein A) and product-related impurities (aggregates, fragments, charge variants) must be characterized per ICH Q6B.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'impurity_strategy_type',
            label: 'Impurity Control Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'ich_q3a', label: 'ICH Q3A — Chemical Drug Substance Impurities' },
              { value: 'ich_q6b', label: 'ICH Q6B — Biological Product Impurities' },
              { value: 'ich_q3a_q3b', label: 'ICH Q3A + Q3B — Substance and Product Combined' },
            ],
          },
          {
            id: 'known_impurities_identified',
            label: 'Number of Specified Identified Impurities',
            type: 'number',
            placeholder: 'e.g., 5',
            required: true,
            validation: { min: 0, max: 100 },
          },
          {
            id: 'unidentified_impurities',
            label: 'Any Unidentified Impurities Above ICH Identification Threshold?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'impurity_qualification',
            label: 'Are All Impurities Above the Qualification Threshold Toxicologically Qualified?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q3A(R2), impurities above the qualification threshold must be qualified through toxicological studies or literature justification.',
          },
          {
            id: 'residual_solvents',
            label: 'Residual Solvents Tested per ICH Q3C?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q3C(R8) classifies residual solvents by toxicity (Class 1–3) and sets permitted daily exposure limits.',
          },
          {
            id: 'forced_degradation_performed',
            label: 'Forced Degradation Studies Performed?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH Q1A(R2) and Q2(R2) recommend forced degradation (stress testing) to identify degradation pathways and demonstrate analytical method specificity.',
          },
        ],
        defaultNext: 'genotoxic_impurities',
        issueChecks: [
          {
            id: 'unidentified_impurities_above_threshold',
            condition: { field: 'unidentified_impurities', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Unidentified Impurities Above ICH Threshold',
            message: 'One or more impurities above the ICH Q3A(R2) identification threshold remain unidentified. All specified impurities must be structurally identified. Failure to identify can result in a Refuse to File or clinical hold.',
            reference: 'ICH Q3A(R2) Table 1 — Thresholds for Impurities',
          },
          {
            id: 'no_forced_degradation',
            condition: { field: 'forced_degradation_performed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Forced Degradation Studies',
            message: 'Forced degradation (stress testing) studies have not been performed. These are essential to identify degradation pathways, establish mass balance, and demonstrate that analytical methods are stability-indicating. This is a common FDA deficiency.',
            reference: 'ICH Q1A(R2) Section 2.1.2 — Stress Testing; ICH Q2(R2) — Analytical Validation',
          },
          {
            id: 'impurities_not_qualified',
            condition: { field: 'impurity_qualification', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Impurities Not Toxicologically Qualified',
            message: 'Impurities above the qualification threshold have not been toxicologically qualified. Per ICH Q3A(R2), qualification can be via standalone toxicology studies, literature-based justification, or demonstration that the impurity is a known metabolite.',
            reference: 'ICH Q3A(R2) Section 5 — Qualification of Impurities',
          },
        ],
      },

      {
        id: 'genotoxic_impurities',
        section: 'characterization_impurities',
        question:
          'Address mutagenic (genotoxic) impurities per ICH M7(R2) and elemental impurities per ICH Q3D(R2). These are critical safety-related assessments required for all drug substances.',
        guidance:
          'ICH M7(R2) requires identification and control of mutagenic impurities using a risk-based approach. The Threshold of Toxicological Concern (TTC) is 1.5 μg/day for lifetime exposure (lower for shorter durations per Staged TTC). ICH Q3D(R2) requires a risk assessment for elemental impurities from all sources (drug substance, excipients, container closure, equipment, utilities).',
        fields: [
          {
            id: 'ich_m7_assessment',
            label: 'ICH M7(R2) Mutagenic Impurity Assessment Completed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'mutagenic_impurities_identified',
            label: 'Number of Mutagenic/Potentially Mutagenic Impurities Identified',
            type: 'number',
            placeholder: 'e.g., 2',
            visibleWhen: { field: 'ich_m7_assessment', operator: 'eq', value: true },
            validation: { min: 0, max: 50 },
          },
          {
            id: 'genotox_above_ttc',
            label: 'Are Any Mutagenic Impurities Above the TTC (1.5 μg/day)?',
            type: 'yes_no',
            visibleWhen: { field: 'ich_m7_assessment', operator: 'eq', value: true },
            helpText: 'ICH M7(R2) Staged TTC: 120 μg/day (≤ 1 month), 20 μg/day (1–12 months), 10 μg/day (1–10 years), 1.5 μg/day (> 10 years / lifetime).',
          },
          {
            id: 'genotox_control_strategy',
            label: 'Mutagenic Impurity Control Strategy',
            type: 'select',
            visibleWhen: { field: 'ich_m7_assessment', operator: 'eq', value: true },
            options: [
              { value: 'option_1', label: 'Option 1 — Specification with acceptance criterion at or below TTC' },
              { value: 'option_2', label: 'Option 2 — Specification at or above TTC with periodic testing' },
              { value: 'option_3', label: 'Option 3 — No specification; process understanding shows < 30% TTC' },
              { value: 'option_4', label: 'Option 4 — No specification; not detected above LOD' },
              { value: 'option_5', label: 'Option 5 — No specification; purge-justified (spike & purge)' },
            ],
            helpText: 'ICH M7(R2) defines 5 control options. Option 1 is the most conservative; Options 3–5 leverage process understanding.',
          },
          {
            id: 'elemental_impurity_assessment',
            label: 'ICH Q3D(R2) Elemental Impurity Risk Assessment Completed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'elemental_impurity_sources',
            label: 'Elemental Impurity Sources Assessed',
            type: 'multi_select',
            visibleWhen: { field: 'elemental_impurity_assessment', operator: 'eq', value: true },
            options: [
              { value: 'drug_substance', label: 'Drug Substance (catalysts, reagents)' },
              { value: 'excipients', label: 'Excipients' },
              { value: 'container_closure', label: 'Container Closure System' },
              { value: 'equipment', label: 'Manufacturing Equipment' },
              { value: 'utilities', label: 'Utilities (water, gases)' },
            ],
          },
        ],
        defaultNext: 'dosage_form',
        issueChecks: [
          {
            id: 'genotoxic_above_ttc',
            condition: { field: 'genotox_above_ttc', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Genotoxic Impurity Above TTC',
            message: 'One or more mutagenic impurities exceed the Threshold of Toxicological Concern (TTC). This requires immediate attention — either additional purification, process optimization, or a clinical justification with lifetime risk calculation per ICH M7(R2) Section 7.',
            reference: 'ICH M7(R2) — Assessment and Control of DNA Reactive (Mutagenic) Impurities',
          },
          {
            id: 'no_elemental_impurity_assessment',
            condition: { field: 'elemental_impurity_assessment', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Elemental Impurity Assessment per ICH Q3D',
            message: 'An elemental impurity risk assessment per ICH Q3D(R2) has not been completed. This is a mandatory requirement for all drug products and must address all potential sources (drug substance, excipients, container closure, equipment, and utilities). PDEs are route-specific (oral, parenteral, inhalation).',
            reference: 'ICH Q3D(R2) — Guideline for Elemental Impurities',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 4 — Drug Product Formulation                           */
      /* ================================================================ */

      {
        id: 'dosage_form',
        section: 'drug_product_formulation',
        question:
          'Describe the drug product dosage form and its composition per ICH Q8(R2). What is the target product profile (TPP) from a formulation perspective?',
        guidance:
          'ICH Q8(R2) Section 2.1 addresses the quality target product profile (QTPP), which forms the basis for drug product design. The QTPP includes dosage form, route of administration, dosage strength, pharmacokinetic characteristics, and quality criteria. The dosage form description corresponds to CTD Module 3.2.P.1.',
        fields: [
          {
            id: 'dosage_form_type',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet (Immediate Release)' },
              { value: 'tablet_mr', label: 'Tablet (Modified Release)' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'oral_solution', label: 'Oral Solution / Suspension' },
              { value: 'iv_solution', label: 'IV Solution for Infusion' },
              { value: 'lyophilized', label: 'Lyophilized Powder for Reconstitution' },
              { value: 'prefilled_syringe', label: 'Prefilled Syringe' },
              { value: 'autoinjector', label: 'Autoinjector' },
              { value: 'topical', label: 'Topical Cream / Ointment / Gel' },
              { value: 'inhaler', label: 'Inhaler (MDI / DPI)' },
              { value: 'ophthalmic', label: 'Ophthalmic Solution / Suspension' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'implant', label: 'Implant / Depot' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'dose_strengths',
            label: 'Dose Strength(s)',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg tablets',
            required: true,
          },
          {
            id: 'is_sterile_product',
            label: 'Is This a Sterile Drug Product?',
            type: 'yes_no',
            required: true,
            helpText: 'Sterile products require aseptic processing or terminal sterilization and must comply with FDA guidance on sterile drug products produced by aseptic processing.',
          },
          {
            id: 'drug_loading',
            label: 'Drug Loading (% w/w in final product)',
            type: 'number',
            placeholder: 'e.g., 25',
            validation: { min: 0.001, max: 100 },
            helpText: 'High drug loading (> 50%) may present formulation challenges including content uniformity and flow properties.',
          },
          {
            id: 'target_shelf_life',
            label: 'Target Shelf Life (months)',
            type: 'number',
            placeholder: 'e.g., 24',
            required: true,
            validation: { min: 1, max: 120 },
            helpText: 'Per ICH Q1A(R2), shelf life is determined from long-term stability data. A minimum of 12 months data at the long-term condition is typically needed for initial filing.',
          },
        ],
        branches: [
          {
            when: { field: 'is_sterile_product', operator: 'eq', value: true },
            goto: 'excipient_selection',
          },
        ],
        defaultNext: 'excipient_selection',
      },

      {
        id: 'excipient_selection',
        section: 'drug_product_formulation',
        question:
          'Describe the excipients used in the drug product formulation. Are there any novel excipients that require additional safety data per FDA guidance?',
        guidance:
          'ICH Q8(R2) requires justification of each excipient and its concentration in the formulation. Per 21 CFR 314.50(d)(1), excipients should be well-characterized and of compendial grade (USP-NF, Ph. Eur.) where possible. Novel excipients not previously used in an approved product require a complete safety package per FDA guidance for industry on Nonclinical Studies for the Safety Evaluation of Pharmaceutical Excipients (2005).',
        fields: [
          {
            id: 'number_of_excipients',
            label: 'Number of Excipients in Formulation',
            type: 'number',
            placeholder: 'e.g., 6',
            required: true,
            validation: { min: 0, max: 50 },
          },
          {
            id: 'all_compendial',
            label: 'Are All Excipients of Compendial Grade (USP-NF / Ph. Eur.)?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'contains_novel_excipient',
            label: 'Does the Formulation Contain a Novel Excipient?',
            type: 'yes_no',
            required: true,
            helpText: 'A novel excipient is one not previously used in an FDA-approved drug product for the proposed route of administration.',
          },
          {
            id: 'excipient_compatibility',
            label: 'Drug-Excipient Compatibility Studies Completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Binary and multicomponent compatibility studies (accelerated conditions) should demonstrate no adverse interactions.',
          },
          {
            id: 'functional_excipient_types',
            label: 'Functional Excipient Categories Present',
            type: 'multi_select',
            options: [
              { value: 'filler', label: 'Filler / Diluent' },
              { value: 'binder', label: 'Binder' },
              { value: 'disintegrant', label: 'Disintegrant' },
              { value: 'lubricant', label: 'Lubricant' },
              { value: 'surfactant', label: 'Surfactant / Wetting Agent' },
              { value: 'preservative', label: 'Preservative' },
              { value: 'buffer', label: 'Buffer System' },
              { value: 'tonicity', label: 'Tonicity Agent' },
              { value: 'stabilizer', label: 'Stabilizer (antioxidant, chelator)' },
              { value: 'coating', label: 'Film Coat / Enteric Coat' },
              { value: 'cryoprotectant', label: 'Cryoprotectant / Lyoprotectant' },
              { value: 'solubilizer', label: 'Solubilizer (cyclodextrin, co-solvent)' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'contains_novel_excipient', operator: 'eq', value: true },
            goto: 'novel_excipient_characterization',
          },
        ],
        defaultNext: 'process_description',
        issueChecks: [
          {
            id: 'novel_excipient_not_characterized',
            condition: { field: 'contains_novel_excipient', operator: 'eq', value: true },
            severity: 'warning',
            title: 'Novel Excipient Requires Additional Characterization',
            message: 'The formulation contains a novel excipient. Per FDA guidance, novel excipients require a complete safety evaluation package including toxicology data, impurity profile, and specifications. This data is submitted as a separate section in the application.',
            reference: 'FDA Guidance: Nonclinical Studies for the Safety Evaluation of Pharmaceutical Excipients (2005)',
          },
        ],
      },

      {
        id: 'novel_excipient_characterization',
        section: 'drug_product_formulation',
        question:
          'Since your formulation contains a novel excipient, please provide additional characterization details per FDA guidance for novel excipients.',
        guidance:
          'FDA requires that novel excipients be supported by a comprehensive characterization and safety package. This includes chemical characterization, manufacturing description, specifications, stability data, and a toxicological evaluation appropriate for the route and duration of drug product use. The excipient data may be submitted as a Type IV Drug Master File (DMF) or included in the application.',
        fields: [
          {
            id: 'novel_excipient_name',
            label: 'Novel Excipient Name',
            type: 'text',
            placeholder: 'e.g., Sulfobutylether-β-cyclodextrin sodium',
            required: true,
          },
          {
            id: 'novel_excipient_function',
            label: 'Function in Formulation',
            type: 'text',
            placeholder: 'e.g., Solubilizer for poorly water-soluble active',
            required: true,
          },
          {
            id: 'novel_excipient_tox_data',
            label: 'Toxicological Data Available?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'novel_excipient_dmf',
            label: 'Drug Master File (DMF) Filed?',
            type: 'select',
            options: [
              { value: 'type_iv_filed', label: 'Type IV DMF Filed with FDA' },
              { value: 'planned', label: 'DMF Filing Planned' },
              { value: 'included_in_app', label: 'Data Included Directly in Application' },
              { value: 'no', label: 'No DMF Filed' },
            ],
          },
        ],
        defaultNext: 'process_description',
      },

      /* ================================================================ */
      /*  Section 5 — Manufacturing Process                              */
      /* ================================================================ */

      {
        id: 'process_description',
        section: 'manufacturing_process',
        question:
          'Describe the drug product manufacturing process per ICH Q8(R2). Include the key unit operations, in-process controls, and manufacturing site information.',
        guidance:
          'ICH Q8(R2) and ICH Q10 require a comprehensive description of the manufacturing process. Per ICH Q7, each significant step should be described with appropriate in-process controls. FDA Process Validation Guidance (2011) describes a lifecycle approach with Stage 1 (Process Design), Stage 2 (Process Qualification), and Stage 3 (Continued Process Verification).',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'manufacturing_site',
            label: 'Manufacturing Site(s)',
            type: 'textarea',
            placeholder: 'List all drug product manufacturing sites with addresses...',
            required: true,
            helpText: 'All manufacturing sites must be listed with complete addresses. Sites manufacturing for the US market must be registered with FDA.',
          },
          {
            id: 'batch_formula',
            label: 'Batch Size (target commercial)',
            type: 'text',
            placeholder: 'e.g., 100,000 tablets (50 kg batch)',
            required: true,
          },
          {
            id: 'unit_operations',
            label: 'Key Unit Operations',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'blending', label: 'Blending / Mixing' },
              { value: 'granulation_wet', label: 'Wet Granulation' },
              { value: 'granulation_dry', label: 'Dry Granulation / Roller Compaction' },
              { value: 'direct_compression', label: 'Direct Compression' },
              { value: 'tableting', label: 'Tablet Compression' },
              { value: 'encapsulation', label: 'Encapsulation' },
              { value: 'coating', label: 'Film Coating' },
              { value: 'filling_liquid', label: 'Liquid Filling' },
              { value: 'lyophilization', label: 'Lyophilization (Freeze-Drying)' },
              { value: 'sterile_filtration', label: 'Sterile Filtration' },
              { value: 'aseptic_fill', label: 'Aseptic Fill-Finish' },
              { value: 'terminal_sterilization', label: 'Terminal Sterilization' },
              { value: 'mixing_compounding', label: 'Compounding / Formulation Mixing' },
              { value: 'milling', label: 'Milling / Particle Size Reduction' },
            ],
          },
          {
            id: 'process_validation_approach',
            label: 'Process Validation Approach',
            type: 'select',
            required: true,
            options: [
              { value: 'traditional', label: 'Traditional (3 consecutive conformance batches)' },
              { value: 'continuous', label: 'Continuous Process Verification (ICH Q8/Q10)' },
              { value: 'hybrid', label: 'Hybrid (traditional + enhanced elements)' },
              { value: 'not_started', label: 'Process Validation Not Yet Initiated' },
            ],
            helpText: 'FDA Process Validation Guidance (2011) recommends a lifecycle approach: Stage 1 — Process Design, Stage 2 — Process Qualification (PPQ), Stage 3 — Continued Process Verification.',
          },
          {
            id: 'process_validation_protocol',
            label: 'Process Validation Protocol Approved?',
            type: 'yes_no',
            required: true,
          },
        ],
        branches: [
          {
            when: { field: 'is_sterile_product', operator: 'eq', value: true },
            goto: 'sterile_manufacturing',
          },
        ],
        defaultNext: 'process_validation',
        issueChecks: [
          {
            id: 'no_process_validation_protocol',
            condition: { field: 'process_validation_protocol', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Process Validation Protocol',
            message: 'A process validation protocol has not been approved. Per FDA Process Validation Guidance (2011), Stage 2 (Process Qualification) requires an approved protocol defining acceptance criteria before PPQ batches are manufactured. Without this, commercial manufacturing cannot begin.',
            reference: 'FDA Guidance for Industry: Process Validation — General Principles and Practices (2011)',
          },
        ],
      },

      {
        id: 'sterile_manufacturing',
        section: 'manufacturing_process',
        question:
          'Since this is a sterile drug product, describe the sterilization strategy and aseptic processing controls per FDA guidance on sterile drug products.',
        guidance:
          'FDA Guidance for Industry: Sterile Drug Products Produced by Aseptic Processing (2004) requires a comprehensive contamination control strategy. EU Annex 1 (2022 revision) provides updated requirements for sterile manufacturing. The sterilization method must be justified and validated, with environmental monitoring, media fills, and container closure integrity testing.',
        fields: [
          {
            id: 'sterilization_method',
            label: 'Sterilization Method',
            type: 'select',
            required: true,
            options: [
              { value: 'aseptic', label: 'Aseptic Processing (sterile filtration + aseptic fill)' },
              { value: 'terminal_steam', label: 'Terminal Sterilization — Moist Heat (Autoclave)' },
              { value: 'terminal_radiation', label: 'Terminal Sterilization — Gamma Irradiation' },
              { value: 'terminal_eto', label: 'Terminal Sterilization — Ethylene Oxide' },
            ],
            helpText: 'Per decision tree in PDA TR-1 / FDA guidance, terminal sterilization should be chosen when feasible. Aseptic processing requires more extensive validation.',
          },
          {
            id: 'media_fill_completed',
            label: 'Media Fill (Aseptic Process Simulation) Completed?',
            type: 'yes_no',
            visibleWhen: { field: 'sterilization_method', operator: 'eq', value: 'aseptic' },
            helpText: 'FDA requires media fills at least semi-annually for each aseptic fill line. Initial qualification requires a minimum of three successful runs.',
          },
          {
            id: 'environmental_monitoring',
            label: 'Environmental Monitoring Program Established?',
            type: 'yes_no',
            required: true,
            helpText: 'Viable and non-viable particulate monitoring of classified areas per EU GMP Annex 1 / FDA guidance. Includes Grade A/B/C/D (EU) or ISO 5/7/8 (FDA) cleanroom classifications.',
          },
          {
            id: 'container_closure_integrity_method',
            label: 'Container Closure Integrity Test (CCIT) Method',
            type: 'select',
            options: [
              { value: 'helium_leak', label: 'Helium Leak Testing' },
              { value: 'vacuum_decay', label: 'Vacuum Decay' },
              { value: 'high_voltage_leak', label: 'High Voltage Leak Detection (HVLD)' },
              { value: 'dye_ingress', label: 'Dye Ingress (Blue Dye Test)' },
              { value: 'headspace_analysis', label: 'Headspace Gas Analysis' },
              { value: 'not_selected', label: 'Method Not Yet Selected' },
            ],
            helpText: 'USP <1207> recommends deterministic (physicochemical) methods over probabilistic methods. FDA expects transition from blue dye to deterministic CCIT.',
          },
          {
            id: 'endotoxin_control',
            label: 'Endotoxin Control Strategy Defined?',
            type: 'yes_no',
            required: true,
            helpText: 'USP <85> Bacterial Endotoxins Test and USP <1085> provide limits (e.g., ≤ 5 EU/kg/hr for IV products). Depyrogenation of components must be validated.',
          },
        ],
        defaultNext: 'process_validation',
      },

      {
        id: 'process_validation',
        section: 'manufacturing_process',
        question:
          'Provide details on the process validation lifecycle per FDA Process Validation Guidance (2011). What stage of validation has been reached, and what are the critical acceptance criteria?',
        guidance:
          'FDA Process Validation Guidance (2011) describes a three-stage lifecycle: Stage 1 — Process Design (develop process knowledge through DoE and lab/pilot studies); Stage 2 — Process Qualification (PPQ protocol with pre-defined acceptance criteria, typically 3+ conformance batches); Stage 3 — Continued Process Verification (ongoing monitoring via statistical trending and control charts).',
        fields: [
          {
            id: 'validation_stage',
            label: 'Current Validation Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'stage_1', label: 'Stage 1 — Process Design (pre-PPQ)' },
              { value: 'stage_2_planning', label: 'Stage 2 — PPQ Planning (protocol in development)' },
              { value: 'stage_2_execution', label: 'Stage 2 — PPQ Execution (batches in progress)' },
              { value: 'stage_2_complete', label: 'Stage 2 — PPQ Complete (all batches conforming)' },
              { value: 'stage_3', label: 'Stage 3 — Continued Process Verification' },
            ],
          },
          {
            id: 'ppq_batches_planned',
            label: 'Number of PPQ Batches Planned / Completed',
            type: 'text',
            placeholder: 'e.g., 3 planned, 2 completed',
          },
          {
            id: 'hold_time_studies',
            label: 'In-Process Hold-Time Studies Completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Hold-time studies demonstrate that intermediates and in-process materials remain within specification during expected holds between manufacturing steps.',
          },
          {
            id: 'shipping_validation',
            label: 'Shipping / Transportation Validation Performed?',
            type: 'yes_no',
            helpText: 'Temperature-controlled products require shipping qualification studies to demonstrate the drug product remains within specified temperature ranges during distribution.',
          },
        ],
        defaultNext: 'analytical_procedures',
        issueChecks: [
          {
            id: 'no_hold_time_studies',
            condition: { field: 'hold_time_studies', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No In-Process Hold-Time Studies',
            message: 'In-process hold-time studies have not been completed. These studies are necessary to justify maximum hold times between manufacturing steps and are frequently requested by FDA during pre-approval inspections.',
            reference: 'FDA Guidance for Industry: Process Validation (2011), Section V.B',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 6 — Analytical Methods & Specifications                */
      /* ================================================================ */

      {
        id: 'analytical_procedures',
        section: 'analytical_methods_specifications',
        question:
          'Describe the analytical methods used for drug substance and drug product testing. Have these methods been validated per ICH Q2(R2)?',
        guidance:
          'ICH Q2(R2) (Validation of Analytical Procedures) requires validation of analytical methods for specificity, linearity, accuracy, precision (repeatability and intermediate precision), detection limit, quantitation limit, range, and robustness. Methods should be stability-indicating, meaning they can distinguish the drug substance/product from its degradation products.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'analytical_methods_list',
            label: 'Key Analytical Methods',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'hplc_assay', label: 'HPLC — Assay (Potency)' },
              { value: 'hplc_impurities', label: 'HPLC — Related Substances / Impurities' },
              { value: 'uplc', label: 'UPLC Methods' },
              { value: 'gc', label: 'Gas Chromatography (Residual Solvents)' },
              { value: 'kf', label: 'Karl Fischer (Water Content)' },
              { value: 'dissolution', label: 'Dissolution Testing' },
              { value: 'content_uniformity', label: 'Content Uniformity (USP <905>)' },
              { value: 'particle_size', label: 'Particle Size Analysis' },
              { value: 'microbial', label: 'Microbial Limits / Sterility' },
              { value: 'endotoxin', label: 'Bacterial Endotoxins (LAL / rFC)' },
              { value: 'potency_bioassay', label: 'Potency Bioassay (biologics)' },
              { value: 'sec', label: 'SEC — Size Variants (aggregates/fragments)' },
              { value: 'cief_icief', label: 'cIEF / icIEF — Charge Variants' },
              { value: 'ce_sds', label: 'CE-SDS — Purity' },
              { value: 'icp_ms', label: 'ICP-MS — Elemental Impurities' },
              { value: 'id_tests', label: 'Identification Tests (IR, UV, Specific Rotation)' },
            ],
          },
          {
            id: 'methods_validated',
            label: 'Have All Analytical Methods Been Validated per ICH Q2(R2)?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'stability_indicating',
            label: 'Has the Assay Method Been Demonstrated to Be Stability-Indicating?',
            type: 'yes_no',
            required: true,
            helpText: 'A stability-indicating method specifically measures the analyte in the presence of its degradation products. This is typically demonstrated through forced degradation studies.',
          },
          {
            id: 'method_transfer',
            label: 'Analytical Method Transfer Status',
            type: 'select',
            options: [
              { value: 'single_lab', label: 'Methods at Single Lab (originating)' },
              { value: 'transfer_planned', label: 'Transfer Planned but Not Initiated' },
              { value: 'transfer_in_progress', label: 'Transfer In Progress' },
              { value: 'transfer_complete', label: 'Transfer Complete (receiving lab qualified)' },
            ],
          },
        ],
        defaultNext: 'specification_limits',
        issueChecks: [
          {
            id: 'no_validated_analytical_method',
            condition: { field: 'methods_validated', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Analytical Methods Not Validated',
            message: 'Analytical methods have not been validated per ICH Q2(R2). Validated methods are a prerequisite for release testing, stability studies, and regulatory filing. Without validated methods, batch release and specification setting cannot be scientifically justified.',
            reference: 'ICH Q2(R2) — Validation of Analytical Procedures',
          },
          {
            id: 'no_stability_indicating_method',
            condition: { field: 'stability_indicating', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Stability-Indicating Analytical Method',
            message: 'The assay method has not been demonstrated to be stability-indicating. A stability-indicating method is required to detect degradation and support shelf-life assignment. FDA frequently cites lack of stability-indicating methodology as a 483 observation.',
            reference: 'ICH Q1A(R2) Section 2.1.2; ICH Q2(R2) — Specificity for Stability-Indicating Methods',
          },
        ],
      },

      {
        id: 'specification_limits',
        section: 'analytical_methods_specifications',
        question:
          'Describe the proposed specification limits for the drug substance and drug product. How have these limits been justified per ICH Q6A/Q6B?',
        guidance:
          'ICH Q6A (chemical entities) and Q6B (biologics) provide decision trees for setting specifications. Specifications should be based on: (1) pharmacopeial standards, (2) manufacturing capability (batch data), (3) stability data, and (4) clinical/safety considerations. ICH Q3A/Q3B set impurity limits. Specification ranges should not be wider than the range qualified in clinical studies.',
        fields: [
          {
            id: 'spec_basis',
            label: 'Basis for Specification Limits',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'batch_data', label: 'Manufacturing Batch Data (process capability)' },
              { value: 'stability_data', label: 'Stability Data (end-of-shelf-life projection)' },
              { value: 'pharmacopeial', label: 'Pharmacopeial Standards (USP/Ph. Eur.)' },
              { value: 'clinical_qualification', label: 'Clinical Qualification (batches used in clinical trials)' },
              { value: 'toxicological', label: 'Toxicological Qualification' },
              { value: 'compendial_general', label: 'Compendial General Chapters (e.g., USP <905>, <711>)' },
            ],
          },
          {
            id: 'specs_justified',
            label: 'Are Specification Limits Formally Justified?',
            type: 'yes_no',
            required: true,
            helpText: 'FDA expects a written justification for each specification acceptance criterion, explaining why the proposed limit is appropriate.',
          },
          {
            id: 'dissolution_spec',
            label: 'Dissolution Specification Approach',
            type: 'select',
            visibleWhen: { field: 'dosage_form_type', operator: 'in', value: ['tablet', 'tablet_mr', 'capsule'] },
            options: [
              { value: 'single_point', label: 'Single-Point (Q value, e.g., Q ≥ 80% in 30 min)' },
              { value: 'multi_point', label: 'Multi-Point Profile (modified release)' },
              { value: 'two_tier', label: 'Two-Tier (with tightened in-process limit)' },
              { value: 'not_set', label: 'Not Yet Established' },
            ],
          },
          {
            id: 'number_of_batches_for_specs',
            label: 'Number of Batches Used to Set Specifications',
            type: 'number',
            placeholder: 'e.g., 6',
            validation: { min: 1, max: 500 },
            helpText: 'FDA typically expects data from at least 3–6 representative batches (including clinical and PPQ batches) to set meaningful specifications.',
          },
        ],
        defaultNext: 'reference_standards',
        issueChecks: [
          {
            id: 'specs_not_justified',
            condition: { field: 'specs_justified', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Specification Limits Not Justified',
            message: 'Specification limits have not been formally justified. ICH Q6A/Q6B requires that each acceptance criterion be supported by batch data, stability data, and/or clinical qualification. Unjustified limits are a common Information Request from FDA.',
            reference: 'ICH Q6A Decision Trees; ICH Q6B Section 5 — Justification of Specification',
          },
        ],
      },

      {
        id: 'reference_standards',
        section: 'analytical_methods_specifications',
        question:
          'Describe the reference standard strategy. What primary and working reference standards are in place?',
        guidance:
          'ICH Q6A and Q6B require qualified reference standards for identity, assay, and impurity testing. Primary reference standards should be of the highest available purity and fully characterized. Working (secondary) standards are qualified against the primary standard. Pharmacopeial reference standards (e.g., USP RS) should be used when available.',
        fields: [
          {
            id: 'primary_ref_standard',
            label: 'Primary Reference Standard Source',
            type: 'select',
            required: true,
            options: [
              { value: 'in_house', label: 'In-House (fully characterized)' },
              { value: 'usp', label: 'USP Reference Standard' },
              { value: 'pheur', label: 'Ph. Eur. Chemical Reference Substance' },
              { value: 'who', label: 'WHO International Standard' },
              { value: 'commercial', label: 'Commercial Supplier (with CoA)' },
            ],
          },
          {
            id: 'ref_standard_characterization',
            label: 'Reference Standard Characterization Data Available?',
            type: 'yes_no',
            required: true,
            helpText: 'In-house primary reference standards require full characterization including purity assessment, structural confirmation, and assigned potency.',
          },
          {
            id: 'impurity_ref_standards',
            label: 'Are Reference Standards Available for All Specified Impurities?',
            type: 'yes_no',
            helpText: 'Synthetic impurity reference standards are needed for method validation (specificity, accuracy) and routine impurity quantification.',
          },
          {
            id: 'ref_standard_requalification',
            label: 'Reference Standard Requalification Program Established?',
            type: 'yes_no',
            helpText: 'Reference standards should be periodically requalified against the primary standard or replaced. Define requalification intervals and criteria.',
          },
        ],
        defaultNext: 'container_closure',
      },

      /* ================================================================ */
      /*  Section 7 — Container Closure & Stability                      */
      /* ================================================================ */

      {
        id: 'container_closure',
        section: 'container_closure_stability',
        question:
          'Describe the container closure system and its compatibility with the drug product per USP <661>, <661.1>, <661.2>, and ICH Q1A(R2).',
        guidance:
          'The container closure system must protect the drug product throughout its shelf life. USP <661.1> and <661.2> require extractable/leachable studies for plastic and elastomeric components. ICH Q1A(R2) requires that stability studies use the market-image container closure. For parenteral products, container closure integrity testing (CCIT) per USP <1207> is critical.',
        fields: [
          {
            id: 'primary_container',
            label: 'Primary Container Type',
            type: 'select',
            required: true,
            options: [
              { value: 'hdpe_bottle', label: 'HDPE Bottle' },
              { value: 'glass_bottle', label: 'Glass Bottle (Type I / Type III)' },
              { value: 'blister', label: 'Blister Pack (PVC/Alu, PVC/PVDC/Alu, Alu/Alu)' },
              { value: 'glass_vial', label: 'Glass Vial (Type I)' },
              { value: 'prefilled_syringe_glass', label: 'Prefilled Syringe (Glass)' },
              { value: 'prefilled_syringe_cop', label: 'Prefilled Syringe (COP/COC Polymer)' },
              { value: 'iv_bag', label: 'IV Bag (PVC / non-PVC)' },
              { value: 'ampoule', label: 'Glass Ampoule' },
              { value: 'tube', label: 'Tube (aluminum / laminate)' },
              { value: 'sachet', label: 'Sachet / Stick Pack' },
              { value: 'cartridge', label: 'Cartridge (for pen injector)' },
            ],
          },
          {
            id: 'closure_type',
            label: 'Closure / Stopper Material',
            type: 'text',
            placeholder: 'e.g., bromobutyl rubber stopper with fluoropolymer coating',
          },
          {
            id: 'extractables_leachables',
            label: 'Extractable/Leachable (E&L) Studies Completed?',
            type: 'yes_no',
            required: true,
            helpText: 'USP <1663>, <1664>, <1665> and PQRI guidance require E&L studies for components in contact with the drug product, particularly for parenteral, ophthalmic, and inhalation products.',
          },
          {
            id: 'container_compatibility',
            label: 'Container Closure Compatibility Study Completed?',
            type: 'yes_no',
            required: true,
            helpText: 'Compatibility studies demonstrate that the container closure does not interact adversely with the drug product (e.g., sorption, leaching, permeation).',
          },
          {
            id: 'photostability_needed',
            label: 'Is Photostability Protection Required?',
            type: 'yes_no',
            helpText: 'ICH Q1B requires photostability testing. If the product is photosensitive, light-protective packaging (amber glass, aluminum overpouch) must be specified.',
          },
        ],
        defaultNext: 'stability_program',
        issueChecks: [
          {
            id: 'no_container_closure_compatibility',
            condition: { field: 'container_compatibility', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Container Closure Compatibility Study',
            message: 'Container closure compatibility has not been demonstrated. Without compatibility data, drug-container interactions (sorption, leaching, permeation) may go undetected, potentially compromising product quality and patient safety. This is frequently requested in FDA Information Requests.',
            reference: 'USP <661.1>, <661.2>; ICH Q1A(R2) Section 2.1.7 — Container Closure System',
          },
        ],
      },

      {
        id: 'stability_program',
        section: 'container_closure_stability',
        question:
          'Describe the stability program per ICH Q1A–Q1F. What long-term, accelerated, and stress condition data are available, and what shelf life is proposed?',
        guidance:
          'ICH Q1A(R2) defines the conditions and duration for stability studies: Long-term (25°C/60% RH or 30°C/65% RH), Accelerated (40°C/75% RH), and Intermediate (30°C/65% RH). ICH Q1E provides guidance on statistical evaluation and shelf-life extrapolation. ICH Q1C covers requirements for new dosage forms of existing drugs. ICH Q1D addresses bracketing and matrixing designs. ICH Q1F (withdrawn but informative) covered Zone III/IV conditions (30°C/75% RH).',
        fields: [
          {
            id: 'stability_conditions',
            label: 'Stability Conditions Studied',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'long_term_25_60', label: '25°C / 60% RH (Long-Term, Zone I/II)' },
              { value: 'long_term_30_65', label: '30°C / 65% RH (Long-Term, Zone III/IVa)' },
              { value: 'long_term_30_75', label: '30°C / 75% RH (Long-Term, Zone IVb)' },
              { value: 'accelerated', label: '40°C / 75% RH (Accelerated)' },
              { value: 'intermediate', label: '30°C / 65% RH (Intermediate)' },
              { value: 'refrigerated_lt', label: '5°C ± 3°C (Long-Term, Refrigerated)' },
              { value: 'refrigerated_acc', label: '25°C / 60% RH (Accelerated, Refrigerated)' },
              { value: 'frozen_lt', label: '-20°C ± 5°C (Long-Term, Frozen)' },
              { value: 'photostability', label: 'ICH Q1B Photostability (confirmatory)' },
            ],
          },
          {
            id: 'months_long_term_data',
            label: 'Months of Long-Term Stability Data Available',
            type: 'number',
            placeholder: 'e.g., 18',
            required: true,
            validation: { min: 0, max: 120 },
          },
          {
            id: 'months_accelerated_data',
            label: 'Months of Accelerated Stability Data Available',
            type: 'number',
            placeholder: 'e.g., 6',
            required: true,
            validation: { min: 0, max: 12 },
          },
          {
            id: 'proposed_shelf_life',
            label: 'Proposed Shelf Life (months)',
            type: 'number',
            placeholder: 'e.g., 24',
            required: true,
            validation: { min: 1, max: 120 },
            helpText: 'Per ICH Q1E, shelf life can be set to the available long-term data period, or extrapolated to 2x the long-term data period (but not more than 12 months beyond) if supported by accelerated data and statistical analysis.',
          },
          {
            id: 'stability_batches',
            label: 'Number of Batches on Stability',
            type: 'number',
            placeholder: 'e.g., 3',
            required: true,
            validation: { min: 1, max: 50 },
            helpText: 'ICH Q1A(R2) requires a minimum of 3 batches for initial filing. At least 2 should be pilot scale or larger.',
          },
          {
            id: 'bracketing_matrixing',
            label: 'Bracketing or Matrixing Design Used?',
            type: 'select',
            options: [
              { value: 'full', label: 'Full Design (all strengths, all time points)' },
              { value: 'bracketing', label: 'Bracketing Design per ICH Q1D' },
              { value: 'matrixing', label: 'Matrixing Design per ICH Q1D' },
              { value: 'bracket_matrix', label: 'Combined Bracketing + Matrixing' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'molecule_type', operator: 'in', value: ['peptide', 'oligonucleotide'] },
            goto: 'peptide_oligo_special',
          },
        ],
        defaultNext: null,
      },

      {
        id: 'peptide_oligo_special',
        section: 'container_closure_stability',
        question:
          'Since this is a peptide or oligonucleotide product, please address the special characterization requirements that apply to these modalities.',
        guidance:
          'Peptides and oligonucleotides present unique CMC challenges not fully addressed by standard ICH Q6A/Q6B guidance. Peptides require assessment of stereoisomeric purity (D/L-amino acid analysis), potential for aggregation and fibrillation, and chemical modifications (e.g., PEGylation characterization). Oligonucleotides require assessment of sequence integrity, full-length product vs. truncated sequences (n-1, n-2), stereochemistry of phosphorothioate linkages, and secondary structure characterization. FDA has issued specific guidance for antisense oligonucleotides and synthetic peptides.',
        fields: [
          {
            id: 'sequence_confirmation',
            label: 'Full Sequence Confirmation Completed?',
            type: 'yes_no',
            required: true,
            helpText: 'For peptides: Edman degradation or LC-MS/MS sequencing. For oligonucleotides: LC-MS with fragmentation or enzymatic sequencing.',
          },
          {
            id: 'peptide_purity_method',
            label: 'Purity Assessment Method(s)',
            type: 'multi_select',
            options: [
              { value: 'rp_hplc', label: 'RP-HPLC (primary purity method)' },
              { value: 'iec', label: 'Ion-Exchange Chromatography' },
              { value: 'sec', label: 'Size-Exclusion Chromatography (aggregation)' },
              { value: 'ce', label: 'Capillary Electrophoresis' },
              { value: 'amino_acid_analysis', label: 'Amino Acid Analysis (peptides)' },
              { value: 'chiral_hplc', label: 'Chiral HPLC / D-amino acid analysis (peptides)' },
              { value: 'ip_rp_hplc', label: 'IP-RP-HPLC (oligonucleotides)' },
              { value: 'aex_hplc', label: 'AEX-HPLC (oligonucleotides)' },
              { value: 'lc_ms', label: 'LC-MS (intact mass analysis)' },
            ],
          },
          {
            id: 'chemical_modifications',
            label: 'Chemical Modifications Present',
            type: 'multi_select',
            options: [
              { value: 'pegylation', label: 'PEGylation' },
              { value: 'lipid_conjugation', label: 'Lipid Conjugation (e.g., GalNAc)' },
              { value: 'phosphorothioate', label: 'Phosphorothioate Backbone (oligos)' },
              { value: '2_ome', label: '2\'-O-Methyl Modification (oligos)' },
              { value: '2_moe', label: '2\'-MOE Modification (oligos)' },
              { value: 'lna', label: 'Locked Nucleic Acid (LNA) (oligos)' },
              { value: 'cyclization', label: 'Cyclization (peptides)' },
              { value: 'unnatural_aa', label: 'Unnatural Amino Acids (peptides)' },
              { value: 'none', label: 'No Chemical Modifications' },
            ],
          },
          {
            id: 'truncated_sequences',
            label: 'Truncated Sequence Control Strategy (n-1, n-2)',
            type: 'select',
            visibleWhen: { field: 'molecule_type', operator: 'eq', value: 'oligonucleotide' },
            options: [
              { value: 'spec_limit', label: 'Specification Limit Set (e.g., ≤ 10% total shortmers)' },
              { value: 'purification_control', label: 'Controlled via Purification Process' },
              { value: 'both', label: 'Both Specification and Process Control' },
              { value: 'not_addressed', label: 'Not Yet Addressed' },
            ],
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
