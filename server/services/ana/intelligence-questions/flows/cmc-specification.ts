/**
 * CMC (Chemistry, Manufacturing, and Controls) Specification flow definition
 * for the AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive CMC questionnaire
 * covering drug substance identification, synthetic route & controls,
 * characterization & impurities, drug product formulation, manufacturing
 * process, analytical methods & specifications, and container closure &
 * stability per ICH Q1–Q12, M7, and FDA Process Validation Guidance.
 *
 * 20 nodes · 85+ fields · 7 sections · 14 issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/cmc-specification
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

import { createContainerClosureStabilityNodes } from './cmc-specification-container-closure-stability.js';

export function createCmcSpecificationFlow(): FlowDefinition {
  return {
    id: 'cmc-specification-v1',
    category: 'cmc_specification',
    name: 'CMC Specification',
    description:
      'Comprehensive Chemistry, Manufacturing, and Controls questionnaire covering drug substance identification, synthetic route, impurity profiling, drug product formulation, manufacturing process, analytical methods, container closure systems, and stability studies per ICH Q1–Q12 and FDA Process Validation Guidance.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'substance_identification',
    estimatedMinutes: 75,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'drug_substance_overview',
        label: 'Drug Substance Overview',
        nodeIds: [
          'substance_identification',
          'substance_classification',
          'physicochemical_properties',
        ],
      },
      {
        id: 'synthetic_route_controls',
        label: 'Synthetic Route & Controls',
        nodeIds: ['synthetic_route', 'critical_process_parameters', 'starting_materials'],
      },
      {
        id: 'characterization_impurities',
        label: 'Characterization & Impurities',
        nodeIds: [
          'structural_characterization',
          'impurity_profile',
          'genotoxic_impurities',
        ],
      },
      {
        id: 'drug_product_formulation',
        label: 'Drug Product Formulation',
        nodeIds: [
          'formulation_composition',
          'excipient_selection',
          'novel_excipient_characterization',
        ],
      },
      {
        id: 'manufacturing_process',
        label: 'Manufacturing Process',
        nodeIds: ['manufacturing_overview', 'process_validation', 'in_process_controls'],
      },
      {
        id: 'analytical_methods_specifications',
        label: 'Analytical Methods & Specifications',
        nodeIds: ['analytical_methods', 'specification_setting', 'reference_standards'],
      },
      {
        id: 'container_closure_stability',
        label: 'Container Closure & Stability',
        nodeIds: ['container_closure', 'stability_program'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── Section 1: Drug Substance Overview ───────────────────────────── */

      {
        id: 'substance_identification',
        section: 'Drug Substance Overview',
        question:
          'Let\'s start with the basics of your drug substance. What is the compound and how is it identified?',
        guidance:
          'Per ICH Q6A/Q6B, the drug substance should be fully identified by its chemical name, structure, and relevant nomenclature. This information anchors Module 3.2.S.1 of the CTD.',
        fields: [
          {
            id: 'inn_name',
            label: 'INN / Generic Name',
            type: 'text',
            placeholder: 'e.g., Pembrolizumab',
            helpText: 'International Nonproprietary Name or proposed generic name.',
            required: true,
            validation: { minLength: 2, maxLength: 200 },
          },
          {
            id: 'chemical_name',
            label: 'Chemical / IUPAC Name',
            type: 'textarea',
            placeholder:
              'e.g., (2S)-2-amino-3-(4-hydroxyphenyl)propanoic acid',
            helpText:
              'Full systematic chemical name per IUPAC nomenclature, or sequence descriptor for biologics.',
            required: true,
            validation: { minLength: 5, maxLength: 2000 },
          },
          {
            id: 'cas_number',
            label: 'CAS Registry Number',
            type: 'text',
            placeholder: 'e.g., 1374853-91-4',
            helpText: 'Chemical Abstracts Service registry number, if assigned.',
            required: false,
            validation: { pattern: '^[0-9]+-[0-9]+-[0-9]+$', patternMessage: 'Enter a valid CAS number (e.g., 1374853-91-4).' },
          },
          {
            id: 'molecular_formula',
            label: 'Molecular Formula',
            type: 'text',
            placeholder: 'e.g., C₆H₁₂O₆',
            helpText: 'Elemental composition of the drug substance.',
            required: true,
          },
          {
            id: 'molecular_weight',
            label: 'Molecular Weight (Da)',
            type: 'number',
            placeholder: 'e.g., 180.16',
            helpText: 'Molecular weight in Daltons.',
            required: true,
            validation: { min: 1, max: 5000000 },
          },
          {
            id: 'structural_diagram_upload',
            label: 'Structural Diagram',
            type: 'file_upload',
            helpText:
              'Upload a structural diagram (PNG, SVG, or PDF). For biologics, upload primary sequence or higher-order structure data.',
            required: false,
          },
        ],
        defaultNext: 'substance_classification',
      },

      {
        id: 'substance_classification',
        section: 'Drug Substance Overview',
        question:
          'What type of molecule is this drug substance, and what is its therapeutic context?',
        guidance:
          'ICH Q6A applies to chemically synthesized substances and Q6B to biotechnology-derived products. The molecule type drives the entire CMC strategy, including characterization methods, impurity qualification thresholds, and specification-setting approach.',
        fields: [
          {
            id: 'molecule_type',
            label: 'Molecule Type',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule', description: 'Chemically synthesized compound (MW < ~1000 Da).' },
              { value: 'peptide', label: 'Peptide', description: 'Peptide or modified peptide (MW ~500–5000 Da).' },
              { value: 'monoclonal_antibody', label: 'Monoclonal Antibody', description: 'Full-length mAb or antibody fragment.' },
              { value: 'adc', label: 'Antibody-Drug Conjugate', description: 'mAb conjugated to a cytotoxic payload.' },
              { value: 'oligonucleotide', label: 'Oligonucleotide', description: 'ASO, siRNA, mRNA, or other nucleic acid therapeutic.' },
              { value: 'cell_therapy', label: 'Cell Therapy', description: 'Living cell-based therapeutic product.' },
              { value: 'gene_therapy', label: 'Gene Therapy', description: 'Viral vector or non-viral gene therapy.' },
              { value: 'recombinant_protein', label: 'Recombinant Protein', description: 'Non-antibody recombinant protein or enzyme.' },
              { value: 'vaccine', label: 'Vaccine', description: 'Prophylactic or therapeutic vaccine.' },
              { value: 'other', label: 'Other', description: 'Other molecule type not listed above.' },
            ],
            helpText: 'Select the molecule type. This determines which ICH guidelines and characterization approaches apply.',
          },
          {
            id: 'molecule_type_other',
            label: 'Describe the molecule type',
            type: 'text',
            placeholder: 'e.g., radiopharmaceutical, PROTAC, bispecific T-cell engager',
            required: true,
            visibleWhen: { field: 'molecule_type', operator: 'eq', value: 'other' },
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            required: true,
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'immunology', label: 'Immunology / Inflammation' },
              { value: 'neurology', label: 'Neurology / CNS' },
              { value: 'cardiovascular', label: 'Cardiovascular' },
              { value: 'metabolic', label: 'Metabolic / Endocrine' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'rare_disease', label: 'Rare / Orphan Disease' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
              { value: 'hematology', label: 'Hematology' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Primary therapeutic area for the drug product.',
          },
          {
            id: 'development_phase',
            label: 'Current Development Phase',
            type: 'select',
            required: true,
            options: [
              { value: 'preclinical', label: 'Preclinical' },
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_3', label: 'Phase 3' },
              { value: 'nda_bla', label: 'NDA/BLA Submission' },
              { value: 'post_approval', label: 'Post-Approval / Supplement' },
            ],
            helpText: 'Current stage of clinical development. This determines the depth of CMC data expected by regulators.',
          },
          {
            id: 'is_sterile',
            label: 'Is the drug product sterile?',
            type: 'yes_no',
            required: true,
            helpText: 'Sterile products require additional manufacturing controls, container closure integrity testing, and process validation.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_late_phase_depth',
            condition: { field: 'development_phase', operator: 'in', value: ['phase_3', 'nda_bla', 'post_approval'] },
            severity: 'info',
            title: 'Late-Phase CMC Expectations',
            message:
              'At Phase 3 and beyond, regulators expect a fully characterized drug substance with validated analytical methods, qualified impurities, and process validation data. Ensure all sections are completed comprehensively.',
            reference: 'ICH Q8(R2) Pharmaceutical Development, ICH Q11 Development and Manufacture of Drug Substances',
          },
        ],
        branches: [
          {
            when: { field: 'molecule_type', operator: 'in', value: ['monoclonal_antibody', 'adc', 'recombinant_protein', 'cell_therapy', 'gene_therapy', 'vaccine'] },
            goto: 'physicochemical_properties',
          },
        ],
        defaultNext: 'physicochemical_properties',
      },

      {
        id: 'physicochemical_properties',
        section: 'Drug Substance Overview',
        question:
          'Describe the key physicochemical properties of the drug substance.',
        guidance:
          'Per ICH Q6A (Section 3) and Q6B (Section 3), characterize relevant physicochemical properties including physical form, solubility, polymorphism (for small molecules), and higher-order structure (for biologics). These properties directly impact formulation strategy and bioavailability.',
        fields: [
          {
            id: 'physical_form',
            label: 'Physical Form',
            type: 'select',
            required: true,
            options: [
              { value: 'crystalline', label: 'Crystalline Solid' },
              { value: 'amorphous', label: 'Amorphous Solid' },
              { value: 'liquid', label: 'Liquid' },
              { value: 'lyophilized', label: 'Lyophilized Powder' },
              { value: 'suspension', label: 'Suspension' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'The predominant physical form of the drug substance as manufactured.',
          },
          {
            id: 'polymorphic_forms',
            label: 'Polymorphic Forms Identified',
            type: 'yes_no',
            required: true,
            helpText:
              'Have polymorphic forms (including hydrates, solvates, or salt forms) been identified? Per ICH Q6A Decision Tree #4, polymorphism can affect dissolution and bioavailability.',
            visibleWhen: { field: 'physical_form', operator: 'in', value: ['crystalline', 'amorphous'] },
          },
          {
            id: 'polymorphic_form_details',
            label: 'Polymorphic Form Details',
            type: 'textarea',
            placeholder: 'Describe polymorphic forms, preferred form, and selection rationale.',
            helpText: 'List known polymorphs, describe the selected form, and explain why it was chosen (thermodynamic stability, bioavailability, manufacturability).',
            required: true,
            visibleWhen: { field: 'polymorphic_forms', operator: 'eq', value: true },
            validation: { minLength: 20, maxLength: 3000 },
          },
          {
            id: 'solubility_profile',
            label: 'Aqueous Solubility Profile',
            type: 'textarea',
            placeholder: 'e.g., pH 1.2: 5.2 mg/mL; pH 6.8: 0.03 mg/mL; pH 7.4: 0.01 mg/mL',
            helpText:
              'Provide solubility data across physiologically relevant pH values (1.2, 4.5, 6.8, 7.4) per ICH Q6A. Include BCS classification if known.',
            required: true,
            validation: { minLength: 10, maxLength: 2000 },
          },
          {
            id: 'bcs_class',
            label: 'BCS Classification',
            type: 'select',
            required: false,
            options: [
              { value: 'class_i', label: 'Class I — High Solubility / High Permeability' },
              { value: 'class_ii', label: 'Class II — Low Solubility / High Permeability' },
              { value: 'class_iii', label: 'Class III — High Solubility / Low Permeability' },
              { value: 'class_iv', label: 'Class IV — Low Solubility / Low Permeability' },
              { value: 'not_applicable', label: 'Not Applicable (biologic)' },
              { value: 'unknown', label: 'Not Yet Determined' },
            ],
            helpText: 'Biopharmaceutics Classification System class for oral solid dosage forms.',
          },
          {
            id: 'hygroscopicity',
            label: 'Hygroscopicity',
            type: 'select',
            required: false,
            options: [
              { value: 'non_hygroscopic', label: 'Non-Hygroscopic' },
              { value: 'slightly_hygroscopic', label: 'Slightly Hygroscopic' },
              { value: 'hygroscopic', label: 'Hygroscopic' },
              { value: 'very_hygroscopic', label: 'Very Hygroscopic / Deliquescent' },
              { value: 'not_tested', label: 'Not Yet Tested' },
            ],
            helpText: 'Moisture sorption behavior per European Pharmacopoeia classification.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_no_polymorphism_study',
            condition: { field: 'polymorphic_forms', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Polymorphism Screening Recommended',
            message:
              'If no polymorphic forms have been identified, confirm that appropriate screening studies (XRPD, DSC, polymorph screening) have been conducted. Unexpected polymorph transitions during manufacturing or storage can impact product quality.',
            reference: 'ICH Q6A Decision Tree #4',
          },
        ],
        defaultNext: 'synthetic_route',
      },

      /* ── Section 2: Synthetic Route & Controls ────────────────────────── */

      {
        id: 'synthetic_route',
        section: 'Synthetic Route & Controls',
        question:
          'Describe the synthetic or manufacturing route for the drug substance.',
        guidance:
          'Per ICH Q11, provide a description of the manufacturing process including the synthetic route, key intermediates, and critical steps. For biologics, describe the cell line, expression system, and purification process per ICH Q5A–Q5E.',
        fields: [
          {
            id: 'synthesis_overview',
            label: 'Manufacturing Process Overview',
            type: 'textarea',
            placeholder:
              'Describe the overall synthetic route or bioprocess, including key steps, intermediates, and critical transformations.',
            helpText:
              'Provide a high-level summary of the drug substance manufacturing process. For small molecules, include key synthetic steps and intermediates. For biologics, describe cell culture, harvest, and purification.',
            required: true,
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'number_of_steps',
            label: 'Number of Synthetic / Process Steps',
            type: 'number',
            placeholder: 'e.g., 7',
            helpText: 'Total number of steps from starting material(s) to final drug substance.',
            required: true,
            validation: { min: 1, max: 100 },
          },
          {
            id: 'manufacturing_sites',
            label: 'Drug Substance Manufacturing Site(s)',
            type: 'textarea',
            placeholder: 'e.g., Site A — Synthesis steps 1–4; Site B — Steps 5–7 + purification',
            helpText:
              'List all manufacturing sites, their roles, and which steps are performed at each site.',
            required: true,
            validation: { minLength: 10, maxLength: 2000 },
          },
          {
            id: 'manufacturing_scale',
            label: 'Current Manufacturing Scale',
            type: 'select',
            required: true,
            options: [
              { value: 'lab', label: 'Laboratory Scale (< 1 kg)' },
              { value: 'pilot', label: 'Pilot Scale (1–100 kg)' },
              { value: 'commercial', label: 'Commercial Scale (> 100 kg)' },
              { value: 'bioreactor_small', label: 'Bioreactor ≤ 200 L' },
              { value: 'bioreactor_medium', label: 'Bioreactor 200–2000 L' },
              { value: 'bioreactor_large', label: 'Bioreactor > 2000 L' },
            ],
            helpText: 'Current largest scale at which the process has been run successfully.',
          },
          {
            id: 'process_changes',
            label: 'Have there been significant process changes during development?',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH Q11, any significant changes to the route or process during development should be documented, including the rationale and impact assessment.',
          },
          {
            id: 'process_change_details',
            label: 'Process Change Details',
            type: 'textarea',
            placeholder: 'Describe changes, rationale, and comparability/bridging data.',
            helpText: 'Provide details of process changes and any bridging studies performed.',
            required: true,
            visibleWhen: { field: 'process_changes', operator: 'eq', value: true },
            validation: { minLength: 20, maxLength: 3000 },
          },
        ],
        defaultNext: 'critical_process_parameters',
      },

      {
        id: 'critical_process_parameters',
        section: 'Synthetic Route & Controls',
        question:
          'What are the critical process parameters (CPPs) and critical quality attributes (CQAs) for the drug substance manufacturing process?',
        guidance:
          'Per ICH Q8(R2) and Q11, identify CPPs that must be controlled to ensure consistent quality. Link each CPP to the CQA it impacts. A robust control strategy is built on understanding these relationships.',
        fields: [
          {
            id: 'cqas_identified',
            label: 'Critical Quality Attributes (CQAs)',
            type: 'textarea',
            placeholder:
              'e.g., Assay (≥ 98.0%), Total impurities (≤ 1.5%), Residual solvent (≤ ICH Q3C limit), Particle size (D90 < 50 µm)',
            helpText:
              'List all identified CQAs with acceptance criteria. CQAs are physical, chemical, biological, or microbiological properties that should be within appropriate limits to ensure product quality.',
            required: true,
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'cpps_identified',
            label: 'Critical Process Parameters (CPPs)',
            type: 'textarea',
            placeholder:
              'e.g., Reaction temperature Step 3 (65–75 °C), Crystallization cooling rate (0.5–1.0 °C/min), pH adjustment Step 5 (6.8–7.2)',
            helpText:
              'List all identified CPPs with proven acceptable ranges (PARs) or normal operating ranges (NORs). Include the process step each CPP belongs to.',
            required: true,
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'design_space_established',
            label: 'Has a design space been established?',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH Q8(R2), a design space is the multidimensional combination of input variables and process parameters demonstrated to provide assurance of quality. Movement within the design space is not considered a change.',
          },
          {
            id: 'design_space_description',
            label: 'Design Space Description',
            type: 'textarea',
            placeholder: 'Describe the design space boundaries and how it was established (DoE, multivariate analysis, etc.).',
            required: true,
            visibleWhen: { field: 'design_space_established', operator: 'eq', value: true },
            validation: { minLength: 20, maxLength: 3000 },
          },
          {
            id: 'risk_assessment_method',
            label: 'Risk Assessment Methodology',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'fmea', label: 'FMEA (Failure Mode & Effects Analysis)' },
              { value: 'haccp', label: 'HACCP' },
              { value: 'fishbone', label: 'Ishikawa / Fishbone Diagram' },
              { value: 'doe', label: 'Design of Experiments (DoE)' },
              { value: 'pca', label: 'PCA / Multivariate Analysis' },
              { value: 'risk_ranking', label: 'Risk Ranking & Filtering' },
              { value: 'none', label: 'Not Yet Performed' },
            ],
            helpText: 'Select all risk assessment tools used to identify CPPs and CQAs per ICH Q9.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_no_risk_assessment',
            condition: { field: 'risk_assessment_method', operator: 'contains', value: 'none' },
            severity: 'warning',
            title: 'Risk Assessment Not Performed',
            message:
              'A formal quality risk assessment is expected by regulators to justify the identification of CPPs and CQAs. Consider performing at least an FMEA or risk ranking and filtering exercise before submission.',
            reference: 'ICH Q9 Quality Risk Management, ICH Q8(R2) Section 2.6',
          },
        ],
        defaultNext: 'starting_materials',
      },

      {
        id: 'starting_materials',
        section: 'Synthetic Route & Controls',
        question:
          'Define the starting materials and their quality controls.',
        guidance:
          'Per ICH Q11, the selection of starting material(s) defines the regulatory starting point for the drug substance. Starting materials should be well-defined substances with appropriate specifications. The justification for starting material designation is a common deficiency in regulatory submissions.',
        fields: [
          {
            id: 'starting_material_list',
            label: 'Starting Material(s)',
            type: 'textarea',
            placeholder:
              'List each starting material with its chemical name, supplier, and quality standard (e.g., USP, Ph. Eur., in-house).',
            helpText:
              'Per ICH Q11, starting materials should be commercially available substances with well-defined specifications. Include chemical name, CAS number, and quality standard for each.',
            required: true,
            validation: { minLength: 10, maxLength: 5000 },
          },
          {
            id: 'starting_material_justification',
            label: 'Starting Material Designation Justification',
            type: 'textarea',
            placeholder:
              'Explain why these materials were selected as starting materials per ICH Q11 criteria (significant structural fragment, multiple steps to API, commercially available, etc.).',
            helpText:
              'The FDA and EMA frequently challenge starting material designations. Provide a robust justification per ICH Q11 Section 5.',
            required: true,
            validation: { minLength: 30, maxLength: 3000 },
          },
          {
            id: 'number_of_suppliers',
            label: 'Number of Qualified Suppliers (for key starting materials)',
            type: 'select',
            required: true,
            options: [
              { value: 'single', label: 'Single Source', flagsIssue: true },
              { value: 'dual', label: 'Dual Source' },
              { value: 'multiple', label: 'Multiple Sources (≥ 3)' },
            ],
            helpText:
              'Supply chain risk increases with single-source dependencies. Regulators may ask about contingency plans.',
          },
          {
            id: 'supplier_qualification',
            label: 'Supplier Qualification Approach',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'audit', label: 'On-Site Audit' },
              { value: 'questionnaire', label: 'Supplier Questionnaire' },
              { value: 'coa_testing', label: 'CoA Verification + Identity Testing' },
              { value: 'full_testing', label: 'Full Compendial Testing' },
              { value: 'qualification_batches', label: 'Qualification Batch Testing' },
            ],
            helpText: 'Select all approaches used to qualify starting material suppliers.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_single_source',
            condition: { field: 'number_of_suppliers', operator: 'eq', value: 'single' },
            severity: 'warning',
            title: 'Single-Source Supply Chain Risk',
            message:
              'A single-source starting material creates supply chain vulnerability. Consider qualifying a second supplier or documenting a robust contingency plan. Regulators may issue an information request on supply chain continuity.',
            reference: 'ICH Q11, FDA Guidance on Drug Shortages (2023)',
          },
        ],
        defaultNext: 'structural_characterization',
      },

      /* ── Section 3: Characterization & Impurities ─────────────────────── */

      {
        id: 'structural_characterization',
        section: 'Characterization & Impurities',
        question:
          'Describe the structural characterization studies performed on the drug substance.',
        guidance:
          'Per ICH Q6A (Section 3.1) for small molecules and Q6B (Section 3) for biologics, provide evidence confirming the molecular structure. For small molecules this includes spectroscopic data (NMR, MS, IR, UV); for biologics it includes primary, secondary, tertiary, and quaternary structure characterization.',
        fields: [
          {
            id: 'characterization_methods',
            label: 'Characterization Methods Used',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'nmr', label: '¹H / ¹³C NMR' },
              { value: 'mass_spec', label: 'Mass Spectrometry (MS / HRMS)' },
              { value: 'ir', label: 'Infrared Spectroscopy (IR / FTIR)' },
              { value: 'uv', label: 'UV-Vis Spectroscopy' },
              { value: 'xrpd', label: 'X-Ray Powder Diffraction (XRPD)' },
              { value: 'dsc', label: 'Differential Scanning Calorimetry (DSC)' },
              { value: 'elemental', label: 'Elemental Analysis' },
              { value: 'hplc', label: 'HPLC / UHPLC' },
              { value: 'cd', label: 'Circular Dichroism (CD)' },
              { value: 'sec', label: 'Size Exclusion Chromatography (SEC)' },
              { value: 'ce', label: 'Capillary Electrophoresis (CE / cIEF)' },
              { value: 'peptide_map', label: 'Peptide Mapping' },
              { value: 'glycan', label: 'Glycan Analysis' },
              { value: 'bioassay', label: 'Bioassay / Potency Assay' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Select all analytical methods used to confirm the drug substance structure and identity.',
          },
          {
            id: 'characterization_summary',
            label: 'Characterization Summary',
            type: 'textarea',
            placeholder: 'Summarize key findings from structural characterization studies.',
            helpText:
              'Provide a brief summary of the characterization data confirming the drug substance structure, including key spectral assignments and any unexpected findings.',
            required: true,
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'chirality',
            label: 'Does the drug substance have chiral centers?',
            type: 'yes_no',
            required: true,
            helpText:
              'If the drug substance contains chiral centers, describe stereochemistry control and enantiomeric purity assessment per ICH Q6A.',
          },
          {
            id: 'chirality_control',
            label: 'Chirality Control Strategy',
            type: 'textarea',
            placeholder: 'Describe how stereochemistry is controlled during synthesis and how enantiomeric purity is measured.',
            required: true,
            visibleWhen: { field: 'chirality', operator: 'eq', value: true },
            validation: { minLength: 20, maxLength: 2000 },
          },
        ],
        defaultNext: 'impurity_profile',
      },

      {
        id: 'impurity_profile',
        section: 'Characterization & Impurities',
        question:
          'Describe the impurity profile of the drug substance.',
        guidance:
          'Per ICH Q3A(R2), identify, quantify, and qualify impurities above reporting, identification, and qualification thresholds. For biologics, address process-related impurities (HCPs, DNA, leached Protein A) and product-related impurities (aggregates, fragments, charge variants) per ICH Q6B.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'organic_impurities',
            label: 'Organic / Process-Related Impurities',
            type: 'textarea',
            placeholder:
              'List known impurities with structure (if identified), origin (starting material, intermediate, degradant), and observed levels.',
            helpText:
              'Per ICH Q3A(R2): Reporting threshold ≥ 0.05% (dose ≤ 2g/day) or ≥ 0.03% (dose > 2g/day). Identification threshold ≥ 0.10% or ≥ 0.05%. Qualification threshold ≥ 0.15% or ≥ 0.05%. Provide structure or structural class for all identified impurities.',
            required: true,
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'inorganic_impurities',
            label: 'Inorganic / Elemental Impurities',
            type: 'textarea',
            placeholder: 'Describe residual metals, catalysts, and elemental impurity assessment per ICH Q3D.',
            helpText:
              'Per ICH Q3D(R2), perform a risk assessment for elemental impurities from all sources (catalysts, reagents, equipment, container closure). Report against PDEs for the intended route of administration.',
            required: true,
            validation: { minLength: 10, maxLength: 3000 },
          },
          {
            id: 'residual_solvents',
            label: 'Residual Solvents',
            type: 'textarea',
            placeholder: 'List solvents used in synthesis and purification with Class (1/2/3) and observed levels.',
            helpText:
              'Per ICH Q3C(R8), classify all solvents used in the process and report residual levels against PDEs. Class 1 solvents should be avoided; Class 2 solvents should be limited.',
            required: true,
            validation: { minLength: 10, maxLength: 3000 },
          },
          {
            id: 'max_daily_dose',
            label: 'Maximum Daily Dose (mg)',
            type: 'number',
            placeholder: 'e.g., 200',
            helpText:
              'Maximum daily dose in mg. This determines the ICH Q3A(R2) impurity thresholds: for doses ≤ 2g/day vs. > 2g/day.',
            required: true,
            validation: { min: 0.001, max: 100000 },
          },
          {
            id: 'unqualified_impurities',
            label: 'Are there any unqualified impurities above the qualification threshold?',
            type: 'yes_no',
            required: true,
            helpText:
              'If any impurity exceeds the ICH Q3A(R2) qualification threshold without toxicological qualification, a qualification study or justification is required.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_unqualified_impurities',
            condition: { field: 'unqualified_impurities', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Unqualified Impurities Detected',
            message:
              'Impurities above the ICH Q3A(R2) qualification threshold must be qualified through toxicological studies, literature justification, or clinical qualification before regulatory submission. This is a common Complete Response Letter (CRL) issue.',
            reference: 'ICH Q3A(R2) Impurities in New Drug Substances, Section 5',
          },
        ],
        defaultNext: 'genotoxic_impurities',
      },

      {
        id: 'genotoxic_impurities',
        section: 'Characterization & Impurities',
        question:
          'Address genotoxic and mutagenic impurity risk for this drug substance.',
        guidance:
          'Per ICH M7(R2), perform a hazard assessment for mutagenic impurities that may arise from the synthetic process. Apply the Threshold of Toxicological Concern (TTC) of 1.5 µg/day for lifetime exposure, with adjustments for less-than-lifetime use (Table 2 of ICH M7).',
        fields: [
          {
            id: 'mutagenic_impurity_assessment',
            label: 'Has a mutagenic impurity risk assessment been performed?',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH M7(R2), a comprehensive assessment of all actual and potential mutagenic impurities is required for marketing applications and should be available by Phase 2b/3.',
          },
          {
            id: 'alerting_structures_identified',
            label: 'Number of alerting structures identified',
            type: 'number',
            placeholder: 'e.g., 3',
            helpText:
              'Number of intermediates, reagents, or potential degradants with structural alerts for mutagenicity (using (Q)SAR prediction tools like DEREK, CASE Ultra, or Sarah Nexus).',
            required: true,
            visibleWhen: { field: 'mutagenic_impurity_assessment', operator: 'eq', value: true },
            validation: { min: 0, max: 500 },
          },
          {
            id: 'confirmed_mutagens',
            label: 'Confirmed mutagenic impurities (Class 1, 2, or 3)',
            type: 'textarea',
            placeholder: 'List confirmed mutagenic impurities with ICH M7 class, control strategy, and acceptance limit.',
            helpText:
              'Provide details for each confirmed or suspected mutagenic impurity including ICH M7 classification (Class 1–5), control strategy (Option 1–5 per ICH M7), and the justified acceptance limit.',
            required: false,
            visibleWhen: { field: 'mutagenic_impurity_assessment', operator: 'eq', value: true },
            validation: { maxLength: 5000 },
          },
          {
            id: 'genotox_control_strategy',
            label: 'Mutagenic Impurity Control Strategy',
            type: 'select',
            required: true,
            visibleWhen: { field: 'mutagenic_impurity_assessment', operator: 'eq', value: true },
            options: [
              { value: 'option_1', label: 'Option 1 — Avoid (eliminate from process)' },
              { value: 'option_2', label: 'Option 2 — Control at intermediate step' },
              { value: 'option_3', label: 'Option 3 — Control in drug substance spec' },
              { value: 'option_4', label: 'Option 4 — Demonstrate purge (spike & purge studies)' },
              { value: 'option_5', label: 'Option 5 — Wider limit (LTL, clinical trial)' },
              { value: 'multiple', label: 'Multiple strategies (per impurity)' },
            ],
            helpText: 'Primary control strategy for mutagenic impurities per ICH M7(R2) Table 1.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_no_mutagenic_assessment',
            condition: { field: 'mutagenic_impurity_assessment', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Mutagenic Impurity Assessment Missing',
            message:
              'A mutagenic impurity risk assessment per ICH M7(R2) is required for marketing applications and strongly recommended by late Phase 2. FDA and EMA have issued deficiency letters for missing or incomplete M7 assessments. This must be addressed before NDA/BLA submission.',
            reference: 'ICH M7(R2) Assessment and Control of DNA Reactive (Mutagenic) Impurities',
          },
        ],
        defaultNext: 'formulation_composition',
      },

      /* ── Section 4: Drug Product Formulation ──────────────────────────── */

      {
        id: 'formulation_composition',
        section: 'Drug Product Formulation',
        question:
          'Describe the drug product dosage form and formulation composition.',
        guidance:
          'Per ICH Q8(R2), describe the target product profile including dosage form, strength(s), and route of administration. Provide the quantitative composition per dosage unit, listing all active and inactive ingredients.',
        fields: [
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet (Immediate Release)' },
              { value: 'tablet_mr', label: 'Tablet (Modified Release)' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'solution_oral', label: 'Oral Solution' },
              { value: 'suspension_oral', label: 'Oral Suspension' },
              { value: 'injection_iv', label: 'Solution for Injection (IV)' },
              { value: 'injection_sc', label: 'Solution for Injection (SC)' },
              { value: 'injection_im', label: 'Solution for Injection (IM)' },
              { value: 'lyophilized', label: 'Lyophilized Powder for Injection' },
              { value: 'prefilled_syringe', label: 'Pre-filled Syringe' },
              { value: 'autoinjector', label: 'Autoinjector' },
              { value: 'infusion', label: 'Concentrate for Infusion' },
              { value: 'cream', label: 'Cream / Ointment' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'inhaler', label: 'Inhaler (MDI / DPI)' },
              { value: 'ophthalmic', label: 'Ophthalmic Solution / Suspension' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Select the intended commercial dosage form.',
          },
          {
            id: 'strengths',
            label: 'Available Strengths',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg',
            helpText: 'List all planned strengths for the drug product.',
            required: true,
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration',
            type: 'select',
            required: true,
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'intravenous', label: 'Intravenous (IV)' },
              { value: 'subcutaneous', label: 'Subcutaneous (SC)' },
              { value: 'intramuscular', label: 'Intramuscular (IM)' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhalation', label: 'Inhalation' },
              { value: 'ophthalmic', label: 'Ophthalmic' },
              { value: 'intrathecal', label: 'Intrathecal' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'Primary intended route of administration.',
          },
          {
            id: 'formulation_composition_detail',
            label: 'Quantitative Composition',
            type: 'textarea',
            placeholder:
              'List all components per unit dose:\n- Active: Drug Substance X — 50 mg\n- Filler: Microcrystalline Cellulose NF — 150 mg\n- Binder: ...',
            helpText:
              'Provide the complete quantitative composition per dosage unit, listing each ingredient with its function, quality standard (USP/NF, Ph. Eur., in-house), and amount per unit.',
            required: true,
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'formulation_rationale',
            label: 'Formulation Development Rationale',
            type: 'textarea',
            placeholder: 'Explain the rationale for the selected dosage form and composition.',
            helpText:
              'Per ICH Q8(R2), describe the rationale for the formulation approach, including how the formulation addresses drug substance properties (solubility, stability, bioavailability) and the target product profile.',
            required: false,
            validation: { maxLength: 3000 },
          },
        ],
        defaultNext: 'excipient_selection',
      },

      {
        id: 'excipient_selection',
        section: 'Drug Product Formulation',
        question:
          'Provide details on excipient selection and compatibility.',
        guidance:
          'Per ICH Q8(R2), justify the choice of excipients based on their functional roles, compatibility with the drug substance, and impact on drug product performance. Excipient-drug compatibility studies should demonstrate no adverse interactions.',
        fields: [
          {
            id: 'excipient_compatibility_studies',
            label: 'Have drug-excipient compatibility studies been performed?',
            type: 'yes_no',
            required: true,
            helpText:
              'Binary mixture studies, accelerated stability, or other compatibility assessments to confirm no adverse interactions between the drug substance and excipients.',
          },
          {
            id: 'compatibility_study_details',
            label: 'Compatibility Study Details',
            type: 'textarea',
            placeholder: 'Summarize study design, conditions, and key findings.',
            helpText: 'Describe the compatibility study approach (binary mixtures, DSC, accelerated stability) and summarize results.',
            required: true,
            visibleWhen: { field: 'excipient_compatibility_studies', operator: 'eq', value: true },
            validation: { minLength: 20, maxLength: 3000 },
          },
          {
            id: 'novel_excipients_used',
            label: 'Are any novel excipients used (not previously approved in this route/dosage form)?',
            type: 'yes_no',
            required: true,
            helpText:
              'A novel excipient is one that has not been previously used in a drug product approved by the relevant regulatory authority for the proposed route of administration and dosage form. Novel excipients require additional safety data.',
          },
          {
            id: 'functional_excipients',
            label: 'Critical Functional Excipients',
            type: 'textarea',
            placeholder:
              'List excipients with critical functional roles (e.g., surfactant for solubilization, pH buffer for stability, cryoprotectant for lyophilization).',
            helpText:
              'Identify excipients whose grade, source, or amount significantly impacts drug product quality attributes such as dissolution, stability, or bioavailability.',
            required: false,
            validation: { maxLength: 3000 },
          },
        ],
        branches: [
          {
            when: { field: 'novel_excipients_used', operator: 'eq', value: true },
            goto: 'novel_excipient_characterization',
          },
        ],
        defaultNext: 'manufacturing_overview',
      },

      {
        id: 'novel_excipient_characterization',
        section: 'Drug Product Formulation',
        question:
          'Provide details on the novel excipient(s) used in the formulation.',
        guidance:
          'Per FDA Guidance for Industry: "Nonclinical Studies for the Safety Evaluation of Pharmaceutical Excipients" and ICH M3(R2), novel excipients require a standalone safety evaluation. This typically includes toxicology studies (28-day repeated dose minimum), genotoxicity battery, and reproductive toxicity assessment depending on the clinical indication and patient population.',
        fields: [
          {
            id: 'novel_excipient_name',
            label: 'Novel Excipient Name(s)',
            type: 'textarea',
            placeholder: 'e.g., Soluplus® (polyvinyl caprolactam-polyvinyl acetate-polyethylene glycol graft copolymer)',
            helpText: 'Provide the full chemical name and any trade name for each novel excipient.',
            required: true,
            validation: { minLength: 3, maxLength: 2000 },
          },
          {
            id: 'novel_excipient_function',
            label: 'Functional Role',
            type: 'textarea',
            placeholder: 'e.g., Amorphous solid dispersion carrier for solubility enhancement',
            helpText: 'Describe the functional role of each novel excipient and why no approved alternative was suitable.',
            required: true,
            validation: { minLength: 10, maxLength: 2000 },
          },
          {
            id: 'novel_excipient_safety_data',
            label: 'Safety Data Available',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'acute_tox', label: 'Acute Toxicity Study' },
              { value: 'repeat_dose_28', label: '28-Day Repeat Dose Toxicity' },
              { value: 'repeat_dose_90', label: '90-Day Repeat Dose Toxicity' },
              { value: 'genotoxicity', label: 'Genotoxicity Battery' },
              { value: 'repro_tox', label: 'Reproductive Toxicity' },
              { value: 'carcinogenicity', label: 'Carcinogenicity' },
              { value: 'local_tolerance', label: 'Local Tolerance' },
              { value: 'immunotox', label: 'Immunotoxicity' },
              { value: 'clinical_experience', label: 'Prior Clinical Experience (other programs)' },
              { value: 'none', label: 'No Safety Data Available', flagsIssue: true },
            ],
            helpText:
              'Select all safety studies completed or available for the novel excipient.',
          },
          {
            id: 'novel_excipient_amount',
            label: 'Amount per Dose (mg)',
            type: 'number',
            placeholder: 'e.g., 200',
            helpText: 'Amount of the novel excipient per unit dose.',
            required: true,
            validation: { min: 0.001, max: 100000 },
          },
        ],
        issueChecks: [
          {
            id: 'cmc_novel_excipient_no_safety',
            condition: { field: 'novel_excipient_safety_data', operator: 'contains', value: 'none' },
            severity: 'critical',
            title: 'Novel Excipient Lacks Safety Data',
            message:
              'Novel excipients without any safety data will trigger a Refuse to File or Clinical Hold. At minimum, a 28-day repeat dose toxicity study and genotoxicity battery are required before first-in-human dosing. Plan for a standalone safety evaluation package.',
            reference: 'FDA Guidance: Nonclinical Studies for the Safety Evaluation of Pharmaceutical Excipients (2005), ICH M3(R2)',
          },
        ],
        defaultNext: 'manufacturing_overview',
      },

      /* ── Section 5: Manufacturing Process ─────────────────────────────── */

      {
        id: 'manufacturing_overview',
        section: 'Manufacturing Process',
        question:
          'Describe the drug product manufacturing process.',
        guidance:
          'Per ICH Q8(R2) and Q10, provide a description of the drug product manufacturing process including unit operations, in-process controls, and batch size. The process description should link to the CQAs identified during pharmaceutical development.',
        fields: [
          {
            id: 'dp_manufacturing_description',
            label: 'Manufacturing Process Description',
            type: 'textarea',
            placeholder:
              'Describe unit operations in sequence (e.g., weighing → granulation → blending → compression → coating → packaging) or (e.g., thawing → pooling → sterile filtration → aseptic fill → lyophilization → capping).',
            helpText:
              'Provide a step-by-step description of the drug product manufacturing process, including all unit operations from dispensing through final packaging.',
            required: true,
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'batch_formula',
            label: 'Batch Formula / Batch Size',
            type: 'textarea',
            placeholder: 'e.g., Clinical batch: 10,000 units; Commercial batch: 100,000 units. List component quantities at batch scale.',
            helpText:
              'Provide the batch formula and intended commercial batch size. Include overage amounts if applicable and justify any overages per ICH Q8.',
            required: true,
            validation: { minLength: 10, maxLength: 3000 },
          },
          {
            id: 'dp_manufacturing_site',
            label: 'Drug Product Manufacturing Site(s)',
            type: 'textarea',
            placeholder: 'e.g., Site C — Formulation, fill/finish, packaging',
            helpText: 'List all drug product manufacturing sites and the operations performed at each.',
            required: true,
            validation: { minLength: 5, maxLength: 2000 },
          },
          {
            id: 'equipment_type',
            label: 'Key Manufacturing Equipment',
            type: 'textarea',
            placeholder: 'e.g., Fluid bed granulator (Glatt), Rotary tablet press (Fette), Film coater (O\'Hara)',
            helpText: 'List critical manufacturing equipment with type/model and capacity.',
            required: false,
            validation: { maxLength: 3000 },
          },
          {
            id: 'sterile_manufacturing',
            label: 'Is aseptic processing or terminal sterilization used?',
            type: 'select',
            required: false,
            options: [
              { value: 'not_applicable', label: 'Not Applicable (non-sterile product)' },
              { value: 'aseptic', label: 'Aseptic Processing' },
              { value: 'terminal', label: 'Terminal Sterilization' },
              { value: 'both', label: 'Both (aseptic fill + terminal sterilization)' },
            ],
            helpText:
              'For sterile products, indicate the sterilization approach. Per FDA Guidance on Sterile Drug Products, aseptic processing requires extensive environmental monitoring and media fill validation.',
            visibleWhen: { field: 'is_sterile', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'process_validation',
      },

      {
        id: 'process_validation',
        section: 'Manufacturing Process',
        question:
          'Describe the process validation strategy for the drug product.',
        guidance:
          'Per FDA Process Validation Guidance (2011, updated 2021) and ICH Q8/Q10, process validation follows three stages: Stage 1 (Process Design), Stage 2 (Process Qualification — PPQ), and Stage 3 (Continued Process Verification). Commercial processes must be validated before NDA/BLA approval.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'validation_stage',
            label: 'Current Validation Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'stage_1', label: 'Stage 1 — Process Design (characterization ongoing)' },
              { value: 'stage_2_planning', label: 'Stage 2 — PPQ Protocol Being Drafted' },
              { value: 'stage_2_executing', label: 'Stage 2 — PPQ Execution In Progress' },
              { value: 'stage_2_complete', label: 'Stage 2 — PPQ Complete' },
              { value: 'stage_3', label: 'Stage 3 — Continued Process Verification' },
              { value: 'not_started', label: 'Not Yet Started' },
            ],
            helpText:
              'Indicate the current stage of process validation per FDA lifecycle approach.',
          },
          {
            id: 'ppq_batches',
            label: 'Number of PPQ Batches Planned / Completed',
            type: 'text',
            placeholder: 'e.g., 3 planned, 2 completed',
            helpText:
              'Per FDA guidance, a minimum of 3 consecutive PPQ batches at commercial scale is typically expected, though more may be needed based on process complexity and variability.',
            required: true,
          },
          {
            id: 'ppq_acceptance_criteria',
            label: 'PPQ Acceptance Criteria Summary',
            type: 'textarea',
            placeholder: 'Summarize key acceptance criteria for PPQ batches (CQAs, CPPs, in-process controls).',
            helpText:
              'List the critical acceptance criteria that must be met for PPQ batches to be considered successful.',
            required: false,
            validation: { maxLength: 5000 },
          },
          {
            id: 'process_validation_complete',
            label: 'Is process validation expected to be complete before submission?',
            type: 'yes_no',
            required: true,
            helpText:
              'FDA expects PPQ to be complete before NDA/BLA approval. If PPQ will not be complete, a robust justification and commitment are required.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_ppq_not_complete',
            condition: { field: 'process_validation_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Process Validation Incomplete at Submission',
            message:
              'FDA expects process performance qualification (PPQ) to be complete before NDA/BLA approval. If PPQ data will not be available, discuss with FDA pre-approval. Include a detailed validation plan with timeline and commitment to complete PPQ prior to commercial distribution.',
            reference: 'FDA Guidance for Industry: Process Validation — General Principles and Practices (2011, Rev. 2021)',
          },
          {
            id: 'cmc_validation_not_started',
            condition: { field: 'validation_stage', operator: 'eq', value: 'not_started' },
            severity: 'warning',
            title: 'Process Validation Not Initiated',
            message:
              'Process validation has not yet been initiated. For NDA/BLA submissions, begin Stage 1 process design activities early in development and plan Stage 2 PPQ well before the target submission date. Late initiation of validation is a common cause of submission delays.',
            reference: 'FDA Guidance for Industry: Process Validation (2011, Rev. 2021), ICH Q10',
          },
        ],
        defaultNext: 'in_process_controls',
      },

      {
        id: 'in_process_controls',
        section: 'Manufacturing Process',
        question:
          'Describe the in-process controls (IPCs) and process analytical technology (PAT) used during drug product manufacturing.',
        guidance:
          'Per ICH Q8(R2) and Q10, in-process controls monitor and control the manufacturing process in real-time. PAT (ICH Q8, FDA PAT Framework) enables real-time quality assurance. Effective IPCs reduce end-product testing burden and support real-time release testing (RTRT).',
        fields: [
          {
            id: 'ipc_list',
            label: 'In-Process Controls',
            type: 'textarea',
            placeholder:
              'List IPCs by unit operation:\n- Granulation: LOD ≤ 2.5%, granule size D50 100–300 µm\n- Blending: Blend uniformity RSD ≤ 5%\n- Compression: Individual tablet weight ± 5%, hardness 8–12 kP',
            helpText:
              'List all in-process tests with acceptance criteria for each unit operation. Distinguish between IPCs for monitoring vs. decision-making (pass/fail).',
            required: true,
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'pat_implemented',
            label: 'Is Process Analytical Technology (PAT) implemented?',
            type: 'yes_no',
            required: true,
            helpText:
              'PAT includes NIR, Raman, in-line particle sizing, and other real-time measurement tools that enable enhanced process understanding and control.',
          },
          {
            id: 'pat_details',
            label: 'PAT Tools and Applications',
            type: 'textarea',
            placeholder: 'e.g., NIR for blend uniformity, Raman for polymorph confirmation, in-line UV for concentration monitoring',
            helpText: 'Describe PAT tools deployed, what they measure, and how data is used for process control or RTRT.',
            required: true,
            visibleWhen: { field: 'pat_implemented', operator: 'eq', value: true },
            validation: { minLength: 10, maxLength: 3000 },
          },
          {
            id: 'rtrt_planned',
            label: 'Is Real-Time Release Testing (RTRT) planned?',
            type: 'yes_no',
            required: true,
            helpText:
              'RTRT can replace or supplement conventional end-product testing based on in-process data, PAT measurements, and process understanding per ICH Q8(R2).',
          },
        ],
        defaultNext: 'analytical_methods',
      },

      /* ── Section 6: Analytical Methods & Specifications ───────────────── */

      {
        id: 'analytical_methods',
        section: 'Analytical Methods & Specifications',
        question:
          'Describe the analytical methods used for drug substance and drug product testing.',
        guidance:
          'Per ICH Q2(R2), all analytical methods used for specification testing must be validated for their intended purpose. Key validation characteristics include accuracy, precision, specificity, linearity, range, detection limit, quantitation limit, and robustness.',
        fields: [
          {
            id: 'compendial_methods',
            label: 'Compendial Methods Used',
            type: 'multi_select',
            required: false,
            options: [
              { value: 'usp', label: 'USP General Chapters' },
              { value: 'ph_eur', label: 'European Pharmacopoeia' },
              { value: 'jp', label: 'Japanese Pharmacopoeia' },
              { value: 'who', label: 'WHO International Pharmacopoeia' },
              { value: 'none', label: 'No Compendial Methods Used' },
            ],
            helpText: 'Select compendial sources for standard test methods (e.g., dissolution, disintegration, particulate matter).',
          },
          {
            id: 'key_analytical_methods',
            label: 'Key Analytical Methods',
            type: 'textarea',
            placeholder:
              'List methods with purpose:\n- RP-HPLC (Assay, Related Substances)\n- Karl Fischer (Water Content)\n- GC-HS (Residual Solvents)\n- ICP-MS (Elemental Impurities)\n- DSC (Polymorphic Form)',
            helpText:
              'List all key analytical methods used for release and stability testing of drug substance and drug product, including the attribute each method measures.',
            required: true,
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'method_validation_status',
            label: 'Method Validation Status',
            type: 'select',
            required: true,
            options: [
              { value: 'all_validated', label: 'All Methods Fully Validated' },
              { value: 'most_validated', label: 'Most Methods Validated, Some Pending' },
              { value: 'partially_validated', label: 'Partially Validated (early development)' },
              { value: 'qualification_only', label: 'Methods Qualified but Not Yet Validated' },
              { value: 'not_started', label: 'Validation Not Yet Started' },
            ],
            helpText:
              'Per ICH Q2(R2), full method validation is required for NDA/BLA submissions. Method qualification may be acceptable for early-phase IND.',
          },
          {
            id: 'method_transfer_planned',
            label: 'Is method transfer to a QC lab planned?',
            type: 'yes_no',
            required: true,
            helpText:
              'If analytical methods will be transferred from R&D to a QC laboratory (or to a contract lab), describe the transfer protocol and acceptance criteria.',
          },
        ],
        issueChecks: [
          {
            id: 'cmc_methods_not_validated',
            condition: { field: 'method_validation_status', operator: 'in', value: ['not_started', 'qualification_only'] },
            severity: 'warning',
            title: 'Analytical Method Validation Incomplete',
            message:
              'For NDA/BLA submissions, all specification methods must be fully validated per ICH Q2(R2). Begin validation as soon as the method is finalized — late validation is a common cause of submission delays and deficiency letters.',
            reference: 'ICH Q2(R2) Validation of Analytical Procedures',
          },
        ],
        defaultNext: 'specification_setting',
      },

      {
        id: 'specification_setting',
        section: 'Analytical Methods & Specifications',
        question:
          'Describe the approach to setting drug substance and drug product specifications.',
        guidance:
          'Per ICH Q6A/Q6B, specifications are a list of tests, references to analytical procedures, and acceptance criteria. Specifications should be based on batch data, stability data, toxicological qualification, and compendial requirements. The specification-setting rationale is a critical part of Module 3.2.S.4 and 3.2.P.5.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'ds_specification_tests',
            label: 'Drug Substance Specification Tests',
            type: 'textarea',
            placeholder:
              'List tests and acceptance criteria:\n- Appearance: White to off-white powder\n- Identity (IR): Matches reference\n- Assay (HPLC): 98.0–102.0%\n- Total impurities: ≤ 1.5%\n- Any individual impurity: ≤ 0.15%',
            helpText:
              'Per ICH Q6A, universal tests include appearance, identity, assay, and impurities. Additional specific tests may include residual solvents, water content, particle size, polymorphic form, etc.',
            required: true,
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'dp_specification_tests',
            label: 'Drug Product Specification Tests',
            type: 'textarea',
            placeholder:
              'List tests and acceptance criteria:\n- Appearance: White, round, film-coated tablet\n- Assay (HPLC): 95.0–105.0%\n- Dissolution (USP): ≥ 80% in 30 min\n- Content Uniformity: Meets USP <905>\n- Degradation Products: ≤ 1.0% total',
            helpText:
              'Per ICH Q6A, universal tests include description, identification, assay, and impurities/degradation products. Dosage-form specific tests (e.g., dissolution, uniformity, sterility) as applicable.',
            required: true,
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'specification_justification',
            label: 'Specification Justification Approach',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'batch_data', label: 'Batch Analysis Data (manufacturing history)' },
              { value: 'stability', label: 'Stability Data' },
              { value: 'tox_qualification', label: 'Toxicological Qualification' },
              { value: 'compendial', label: 'Compendial Requirements' },
              { value: 'clinical', label: 'Clinical Experience / Relevance' },
              { value: 'pharmacopeial', label: 'Pharmacopeial Standards' },
              { value: 'statistical', label: 'Statistical Analysis (tolerance intervals)' },
            ],
            helpText:
              'Select all data sources used to justify acceptance criteria. A robust justification uses multiple data sources.',
          },
          {
            id: 'number_of_batches',
            label: 'Number of Batches Analyzed for Specification Setting',
            type: 'number',
            placeholder: 'e.g., 15',
            helpText:
              'Provide the number of batches with analytical data used to support specification setting. FDA/EMA typically expect data from clinical and registration batches.',
            required: true,
            validation: { min: 1, max: 1000 },
          },
        ],
        defaultNext: 'reference_standards',
      },

      {
        id: 'reference_standards',
        section: 'Analytical Methods & Specifications',
        question:
          'Describe the reference standards used for analytical testing.',
        guidance:
          'Per ICH Q6A/Q6B and relevant pharmacopeias, primary reference standards must be thoroughly characterized and qualified. Working standards should be calibrated against primary standards. For biologics, reference standards are especially critical for potency assays.',
        fields: [
          {
            id: 'primary_reference_standard',
            label: 'Primary Reference Standard',
            type: 'textarea',
            placeholder:
              'Describe the primary reference standard:\n- Source (in-house or pharmacopeial)\n- Characterization data (purity, identity)\n- Assignment of potency/purity value\n- Storage conditions',
            helpText:
              'The primary reference standard is used to qualify working standards and validate analytical methods. It must be fully characterized and assigned a value based on multiple analytical techniques.',
            required: true,
            validation: { minLength: 20, maxLength: 3000 },
          },
          {
            id: 'pharmacopeial_standards_available',
            label: 'Are pharmacopeial reference standards available (e.g., USP RS)?',
            type: 'yes_no',
            required: true,
            helpText:
              'If a pharmacopeial reference standard exists (USP, Ph. Eur., WHO), it is preferred for compendial testing. If not available, an in-house primary reference standard must be established.',
          },
          {
            id: 'reference_standard_requalification',
            label: 'Reference Standard Requalification Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'annual', label: 'Annual Requalification' },
              { value: 'biennial', label: 'Biennial Requalification' },
              { value: 'stability_based', label: 'Stability-Based (monitored)' },
              { value: 'single_use', label: 'Single-Use / Lot-Based' },
              { value: 'not_defined', label: 'Not Yet Defined' },
            ],
            helpText: 'Describe the requalification or replacement schedule for reference standards.',
          },
          {
            id: 'impurity_reference_standards',
            label: 'Impurity Reference Standards',
            type: 'textarea',
            placeholder:
              'List impurity reference standards available:\n- Impurity A: Synthesized in-house, characterized by NMR/MS, purity 98.5%\n- Impurity B: Purchased from USP (USP Cat# 12345)',
            helpText:
              'Per ICH Q3A(R2), reference standards for specified identified impurities should be available for release and stability testing. Describe source, characterization, and purity assignment.',
            required: false,
            validation: { maxLength: 3000 },
          },
        ],
        defaultNext: 'container_closure',
      },

      /* ── Section 7: Container Closure & Stability ─────────────────────── */
      // Section 7 nodes (container closure system + stability program) are
      // defined in the sibling module
      // `cmc-specification-container-closure-stability.ts` and composed here.
      ...createContainerClosureStabilityNodes(),
    ],
  };
}
