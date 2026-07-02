/**
 * BLA (Biologics License Application) Submission flow definition for the
 * AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive BLA submission
 * questionnaire covering biologic characterization, manufacturing process
 * controls, nonclinical studies, clinical pharmacology & immunogenicity,
 * clinical efficacy & safety, post-marketing & REMS, and biosimilar-specific
 * requirements per 42 USC 262(a), 42 USC 262(k), and 21 CFR 601.
 *
 * Flow structure:
 *   - 22 question nodes across 9 sections
 *   - 90+ fields with branching for 351(k) biosimilar pathway
 *   - Conditional nodes for vaccines (vaccine_lot_release) and cell
 *     therapies (cell_therapy_characterization)
 *   - Estimated completion: ~90 minutes
 *
 * Regulatory citations: 42 USC 262, 21 CFR 601, 21 CFR 610, ICH Q5A(R2),
 * ICH Q5B, ICH Q5D, ICH Q5E, ICH Q6B, ICH S6(R1), ICH E1, ICH E9,
 * ICH M3(R2), FDA Biosimilar Guidance (2015), BPCIA 42 USC 262(k)(4).
 *
 * @module server/services/ana/intelligence-questions/flows/bla-submission
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createBlaSubmissionFlow(): FlowDefinition {
  return {
    id: 'bla-submission-v1',
    category: 'bla_submission',
    name: 'BLA Submission',
    description:
      'Biologics License Application questionnaire covering biologic characterization, manufacturing process controls, nonclinical studies, clinical pharmacology & immunogenicity, clinical efficacy & safety, post-marketing & REMS, and biosimilar-specific requirements per 42 USC 262 and 21 CFR 601.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'app_type',
    estimatedMinutes: 90,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'app_overview',
        label: 'Application Overview',
        nodeIds: ['app_type', 'sponsor_info'],
      },
      {
        id: 'biologic_char',
        label: 'Biologic Characterization',
        nodeIds: ['product_description', 'structural_characterization', 'cell_therapy_characterization'],
      },
      {
        id: 'manufacturing',
        label: 'Manufacturing & Process Controls',
        nodeIds: ['cell_line_development', 'manufacturing_process', 'process_validation_comparability', 'vaccine_lot_release'],
      },
      {
        id: 'nonclinical',
        label: 'Nonclinical Studies',
        nodeIds: ['nonclinical_pharmacology', 'nonclinical_toxicology'],
      },
      {
        id: 'clinical_pharm',
        label: 'Clinical Pharmacology & Immunogenicity',
        nodeIds: ['pk_pd_summary', 'immunogenicity_assessment'],
      },
      {
        id: 'clinical_efficacy',
        label: 'Clinical Efficacy',
        nodeIds: ['efficacy_program', 'pivotal_study_results'],
      },
      {
        id: 'clinical_safety',
        label: 'Clinical Safety',
        nodeIds: ['safety_database', 'safety_profile'],
      },
      {
        id: 'post_marketing',
        label: 'Post-Marketing & REMS',
        nodeIds: ['post_marketing_plan', 'rems_evaluation'],
      },
      {
        id: 'biosimilar',
        label: 'Biosimilar-Specific',
        nodeIds: ['biosimilar_analytical', 'biosimilar_clinical', 'interchangeability'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [

      /* ================================================================
       * Section 1 — Application Overview
       * ================================================================ */

      {
        id: 'app_type',
        section: 'app_overview',
        question:
          'What BLA pathway are you pursuing, and what type of biologic product is this application for?',
        guidance:
          'Under 42 USC 262(a), a 351(a) BLA is submitted for a novel biological product with full chemistry, manufacturing, nonclinical, and clinical data. Under 42 USC 262(k), a 351(k) application is the abbreviated biosimilar pathway established by the Biologics Price Competition and Innovation Act (BPCIA). The pathway selection determines the overall structure, data requirements, and regulatory strategy for the entire BLA. Refer to 21 CFR 601 for general BLA requirements.',
        fields: [
          {
            id: 'bla_pathway',
            label: 'BLA Pathway',
            type: 'select',
            required: true,
            options: [
              {
                value: '351a_novel',
                label: '351(a) Novel Biologic',
                description: 'Full BLA with complete data package for a novel biological product under 42 USC 262(a).',
              },
              {
                value: '351k_biosimilar',
                label: '351(k) Biosimilar',
                description: 'Abbreviated pathway referencing an FDA-licensed biological product under BPCIA / 42 USC 262(k).',
              },
            ],
          },
          {
            id: 'product_class',
            label: 'Product Class',
            type: 'select',
            required: true,
            options: [
              { value: 'monoclonal_antibody', label: 'Monoclonal Antibody' },
              { value: 'fusion_protein', label: 'Fusion Protein' },
              { value: 'adc', label: 'Antibody-Drug Conjugate (ADC)' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
              { value: 'cell_therapy', label: 'Cell Therapy (e.g., CAR-T)' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'blood_product', label: 'Blood / Plasma-Derived Product' },
              { value: 'recombinant_protein', label: 'Recombinant Protein' },
              { value: 'enzyme_replacement', label: 'Enzyme Replacement Therapy' },
              { value: 'other', label: 'Other Biological Product' },
            ],
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'immunology', label: 'Immunology / Inflammation' },
              { value: 'rare_disease', label: 'Rare Disease' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'hematology', label: 'Hematology' },
              { value: 'neurology', label: 'Neurology' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
              { value: 'cardiovascular', label: 'Cardiovascular' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'accelerated_pathway',
            label: 'Expedited Regulatory Designations',
            type: 'multi_select',
            helpText:
              'Select all applicable FDA expedited programs. Priority Review shortens the review clock to 6 months. Accelerated Approval (21 CFR 601 Subpart E) allows approval based on a surrogate endpoint. RMAT designation under the 21st Century Cures Act applies to regenerative medicine therapies.',
            options: [
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'fast_track', label: 'Fast Track' },
              { value: 'breakthrough', label: 'Breakthrough Therapy' },
              { value: 'rmat', label: 'RMAT (Regenerative Medicine Advanced Therapy)' },
            ],
          },
          {
            id: 'orphan_designation',
            label: 'Orphan Drug Designation',
            type: 'yes_no',
            helpText:
              'Per the Orphan Drug Act (21 USC 360bb) and 21 CFR 316, orphan designation applies to products intended for conditions affecting fewer than 200,000 persons in the US. Provides 7 years of market exclusivity, tax credits, and waiver of PDUFA user fees.',
          },
        ],
        branches: [
          {
            when: { field: 'bla_pathway', operator: 'eq', value: '351k_biosimilar' },
            goto: 'biosimilar_analytical',
          },
        ],
        defaultNext: 'sponsor_info',
      },

      /* ── Sponsor Info ────────────────────────────────────────────────── */

      {
        id: 'sponsor_info',
        section: 'app_overview',
        question:
          'Please provide the sponsor and regulatory contact details for this BLA submission.',
        guidance:
          'Per 21 CFR 601.2, the BLA must identify the applicant (sponsor) and include contact information for all regulatory correspondence. Foreign sponsors must designate a US Agent per 21 CFR 600.4. PDUFA user fees (21 USC 379h) must be paid before the BLA will be received for filing. The biologics division (CBER vs CDER) is determined by the product type per the 2003 inter-center transfer agreement.',
        fields: [
          {
            id: 'sponsor_name',
            label: 'Sponsor Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., Acme Biologics, Inc.',
          },
          {
            id: 'sponsor_address',
            label: 'Sponsor Address',
            type: 'textarea',
            required: true,
            placeholder: 'Full mailing address including city, state/province, country, and postal code.',
          },
          {
            id: 'regulatory_contact',
            label: 'Regulatory Contact Person',
            type: 'text',
            required: true,
            placeholder: 'e.g., Dr. Jane Smith, VP Regulatory Affairs',
          },
          {
            id: 'contact_email',
            label: 'Contact Email',
            type: 'text',
            required: true,
            placeholder: 'e.g., regulatory@acmebiologics.com',
            validation: {
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
              patternMessage: 'Please enter a valid email address.',
            },
          },
          {
            id: 'us_agent',
            label: 'US Agent (for foreign sponsors)',
            type: 'text',
            helpText:
              'Per 21 CFR 600.4, each foreign establishment must designate a United States agent who resides or maintains a place of business in the US.',
          },
          {
            id: 'user_fee_paid',
            label: 'PDUFA User Fee Paid',
            type: 'yes_no',
            helpText:
              'Per 21 USC 379h (PDUFA), the application fee must be paid before the BLA will be received. The FY2026 application fee exceeds $4 million. Orphan products may qualify for a fee waiver.',
          },
          {
            id: 'pdufa_goal_date',
            label: 'PDUFA Goal Date',
            type: 'date',
            visibleWhen: { field: 'user_fee_paid', operator: 'eq', value: true },
            helpText:
              'Standard review target: 10 months from filing. Priority Review target: 6 months from filing.',
          },
          {
            id: 'biologics_division',
            label: 'Review Division',
            type: 'text',
            helpText:
              'CBER reviews vaccines, blood products, gene therapies, cell therapies, and certain therapeutic proteins. CDER reviews monoclonal antibodies and most therapeutic proteins per the 2003 inter-center transfer agreement.',
            placeholder: 'e.g., CDER — Division of Rheumatology and Transplant Medicine',
          },
        ],
        defaultNext: 'product_description',
        issueChecks: [
          {
            id: 'user_fee_not_paid',
            condition: { field: 'user_fee_paid', operator: 'eq', value: false },
            severity: 'critical',
            title: 'PDUFA User Fee Required',
            message:
              'Per 21 USC 379h, the BLA will not be received for filing until the PDUFA user fee is paid or a fee waiver is granted. Ensure payment is submitted before or contemporaneously with the BLA.',
            reference: 'PDUFA (21 USC 379h)',
          },
        ],
      },

      /* ================================================================
       * Section 2 — Biologic Characterization
       * ================================================================ */

      {
        id: 'product_description',
        section: 'biologic_char',
        question:
          'Describe the biological product, including its molecular characteristics, expression system, and mechanism of action.',
        guidance:
          'Per ICH Q6B (Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products) and 21 CFR 601.2, the BLA must include a thorough description of the biological product covering identity, purity, potency, molecular structure, and biological activity. The expression system and cell line origin directly impact post-translational modifications, glycosylation patterns, and immunogenicity risk. Comprehensive characterization of the mechanism of action is critical for establishing the pharmacological basis of efficacy.',
        fields: [
          {
            id: 'product_name_generic',
            label: 'Generic / Nonproprietary Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., trastuzumab, nivolumab',
          },
          {
            id: 'proposed_proprietary_name',
            label: 'Proposed Proprietary (Trade) Name',
            type: 'text',
            placeholder: 'e.g., Herceptin, Opdivo',
          },
          {
            id: 'inn_usan',
            label: 'INN / USAN Designation',
            type: 'text',
            required: true,
            helpText:
              'International Nonproprietary Name (INN) assigned by WHO or United States Adopted Name (USAN). Per FDA guidance on nonproprietary naming (2017), biosimilars include a distinguishing suffix.',
            placeholder: 'e.g., trastuzumab-dkst',
          },
          {
            id: 'molecular_weight',
            label: 'Molecular Weight',
            type: 'text',
            required: true,
            placeholder: 'e.g., ~148 kDa (intact IgG1)',
          },
          {
            id: 'expression_system',
            label: 'Expression System',
            type: 'select',
            required: true,
            options: [
              { value: 'cho', label: 'CHO (Chinese Hamster Ovary)' },
              { value: 'hek293', label: 'HEK293' },
              { value: 'ecoli', label: 'E. coli' },
              { value: 'yeast', label: 'Yeast (Pichia / Saccharomyces)' },
              { value: 'insect_baculo', label: 'Insect Cell / Baculovirus' },
              { value: 'plant', label: 'Plant-Based' },
              { value: 'viral_vector', label: 'Viral Vector Production System' },
              { value: 'autologous_cell', label: 'Patient-Derived Cells (Autologous)' },
              { value: 'allogeneic_cell', label: 'Donor-Derived Cells (Allogeneic)' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'cell_line_origin',
            label: 'Cell Line Origin and History',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Derived from CHO-K1 parental line. Transfected with linearized expression vector encoding heavy and light chains under CMV promoter. Single-cell cloned via limiting dilution.',
          },
          {
            id: 'post_translational_mods',
            label: 'Post-Translational Modifications',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'n_glycosylation', label: 'N-Linked Glycosylation' },
              { value: 'o_glycosylation', label: 'O-Linked Glycosylation' },
              { value: 'disulfide_bonds', label: 'Disulfide Bonds' },
              { value: 'pegylation', label: 'PEGylation' },
              { value: 'fc_engineering', label: 'Fc Engineering' },
              { value: 'none', label: 'None / Not Applicable' },
            ],
          },
          {
            id: 'higher_order_structure',
            label: 'Higher-Order Structure',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe secondary, tertiary, and quaternary structure characterization methods and results (e.g., CD spectroscopy, FTIR, X-ray crystallography, AUC, DLS).',
          },
          {
            id: 'biological_activity',
            label: 'Biological Activity',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe the biological activity assays and results (e.g., cell-based potency assay, receptor binding affinity by SPR, ADCC/CDC functional assays).',
          },
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe the molecular mechanism of action (e.g., binds HER2 extracellular domain IV, inhibits ligand-independent HER2/HER3 signaling, mediates ADCC via FcγRIIIa engagement).',
          },
        ],
        defaultNext: 'structural_characterization',
        provideExpertFeedback: true,
      },

      /* ── Structural Characterization ─────────────────────────────────── */

      {
        id: 'structural_characterization',
        section: 'biologic_char',
        question:
          'Provide the detailed analytical characterization of your biologic product, including potency assays, reference standards, and critical quality attributes.',
        guidance:
          'Per ICH Q6B and ICH Q2(R2) (Validation of Analytical Procedures), thorough structural and functional characterization is required for BLA approval. Primary structure must be confirmed by mass spectrometry and peptide mapping. Potency assays must be validated and reflect the mechanism of action per 21 CFR 610.10. A qualified reference standard must be established. Forced degradation studies inform stability-indicating method development and identification of critical quality attributes (CQAs).',
        fields: [
          {
            id: 'primary_structure_confirmed',
            label: 'Primary Structure Confirmed',
            type: 'yes_no',
            required: true,
            helpText: 'Complete amino acid sequence determination including N-/C-terminal sequencing, peptide mapping, and disulfide bond assignment.',
          },
          {
            id: 'mass_spec_characterization',
            label: 'Mass Spectrometry Characterization Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Intact mass, reduced/deglycosylated mass, and peptide-level LC-MS/MS to confirm sequence and identify modifications.',
          },
          {
            id: 'glycan_mapping',
            label: 'Glycan Mapping Complete',
            type: 'yes_no',
            helpText: 'N-linked and O-linked glycan profiling by HILIC, CE-LIF, or LC-MS. Identify major glycoforms and assess impact on function.',
          },
          {
            id: 'charge_variants_characterized',
            label: 'Charge Variants Characterized',
            type: 'yes_no',
            helpText: 'Charge heterogeneity analysis by cIEF, CEX-HPLC, or icIEF to assess acidic and basic variant populations.',
          },
          {
            id: 'size_variants_characterized',
            label: 'Size Variants Characterized',
            type: 'yes_no',
            helpText: 'Size heterogeneity analysis by SE-HPLC, CE-SDS, and AUC to quantify aggregates, fragments, and monomer content.',
          },
          {
            id: 'potency_assay_type',
            label: 'Potency Assay Type',
            type: 'select',
            required: true,
            options: [
              { value: 'cell_based', label: 'Cell-Based Bioassay' },
              { value: 'binding', label: 'Binding Assay (SPR, ELISA)' },
              { value: 'enzyme_activity', label: 'Enzymatic Activity Assay' },
              { value: 'functional', label: 'Other Functional Assay' },
              { value: 'multiple', label: 'Multiple Complementary Assays' },
            ],
            helpText: 'Per 21 CFR 610.10, a potency assay reflecting the mechanism of action is required for lot release.',
          },
          {
            id: 'potency_assay_validated',
            label: 'Potency Assay Validated',
            type: 'yes_no',
            required: true,
            helpText: 'Validation per ICH Q2(R2) for accuracy, precision, specificity, linearity, and range.',
          },
          {
            id: 'reference_standard_established',
            label: 'Reference Standard Established',
            type: 'yes_no',
            required: true,
            helpText: 'A qualified primary reference standard, representative of the commercial product, must be established and characterized by orthogonal methods per ICH Q6B.',
          },
          {
            id: 'forced_degradation_completed',
            label: 'Forced Degradation Studies Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Stress studies (thermal, oxidative, photolytic, pH extremes, mechanical) to identify degradation pathways and confirm stability-indicating capability of analytical methods.',
          },
          {
            id: 'critical_quality_attributes',
            label: 'Critical Quality Attributes (CQAs)',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'List the identified CQAs with their rationale (e.g., glycosylation pattern — impacts ADCC; aggregate level — impacts immunogenicity; charge variant profile — impacts potency).',
          },
        ],
        branches: [
          {
            when: { field: 'product_class', operator: 'eq', value: 'cell_therapy' },
            goto: 'cell_therapy_characterization',
          },
        ],
        defaultNext: 'cell_line_development',
        issueChecks: [
          {
            id: 'potency_assay_not_validated',
            condition: { field: 'potency_assay_validated', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Potency Assay Must Be Validated',
            message:
              'A validated potency assay is required for BLA lot release per 21 CFR 610.10 and ICH Q6B. Without a validated potency assay, the BLA cannot be approved. Complete validation per ICH Q2(R2) including accuracy, precision, specificity, linearity, and range.',
            reference: 'ICH Q6B, 21 CFR 610.10',
          },
          {
            id: 'no_reference_standard',
            condition: { field: 'reference_standard_established', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Reference Standard Required',
            message:
              'A qualified reference standard is essential for potency assay calibration, lot release, and stability studies. Establish a primary reference standard characterized by orthogonal methods per ICH Q6B.',
            reference: 'ICH Q6B',
          },
        ],
      },

      /* ── Cell Therapy Characterization (conditional) ─────────────────── */

      {
        id: 'cell_therapy_characterization',
        section: 'biologic_char',
        question:
          'Provide the cell therapy product characterization details, including cell source, identity markers, and potency assays.',
        guidance:
          'Per FDA Guidance on Chemistry, Manufacturing, and Control (CMC) Information for Human Gene Therapy Investigational New Drug Applications (INDs) (2020) and FDA Guidance on Considerations for the Design of Early-Phase Clinical Trials of Cellular and Gene Therapy Products (2015), cell therapy products require specialized characterization including cell source, identity markers, viability, potency, sterility, and for genetically modified cells, vector characterization and replication-competent testing. Refer also to 21 CFR 1271 for human cells, tissues, and cellular and tissue-based products (HCT/Ps).',
        fields: [
          {
            id: 'cell_source',
            label: 'Cell Source',
            type: 'select',
            required: true,
            options: [
              { value: 'autologous', label: 'Autologous (Patient-Derived)' },
              { value: 'allogeneic', label: 'Allogeneic (Donor-Derived)' },
            ],
          },
          {
            id: 'cell_type',
            label: 'Cell Type',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., CD19-directed CAR-T cells derived from autologous peripheral blood T lymphocytes.',
          },
          {
            id: 'identity_markers',
            label: 'Identity Markers',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., CD3+, CD19 CAR+, viability >70% by flow cytometry; transgene copy number by ddPCR.',
          },
          {
            id: 'viability_criteria',
            label: 'Viability Acceptance Criteria',
            type: 'text',
            required: true,
            placeholder: 'e.g., >70% viable cells by trypan blue exclusion',
          },
          {
            id: 'potency_assay_cell_based',
            label: 'Cell Therapy Potency Assay',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Cytotoxicity assay against CD19+ target cells at E:T ratio 10:1. IFN-gamma secretion by ELISA. CAR surface expression by flow cytometry.',
          },
          {
            id: 'sterility_at_release',
            label: 'Sterility Testing at Release',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 610.12, sterility testing is required. For cell therapy products with short shelf life, rapid sterility methods (e.g., BacT/ALERT) may be used with concurrent release pending final results.',
          },
          {
            id: 'genetic_modification',
            label: 'Genetic Modification',
            type: 'yes_no',
            helpText: 'Indicate whether the cells are genetically modified (e.g., CAR-T, TCR-T, gene-edited).',
          },
          {
            id: 'vector_description',
            label: 'Vector Description',
            type: 'textarea',
            visibleWhen: { field: 'genetic_modification', operator: 'eq', value: true },
            placeholder: 'e.g., Self-inactivating lentiviral vector encoding anti-CD19 scFv-CD28-CD3zeta CAR construct. Titer: 1x10^8 TU/mL.',
          },
          {
            id: 'replication_competent_testing',
            label: 'Replication-Competent Virus (RCL/RCR) Testing',
            type: 'yes_no',
            visibleWhen: { field: 'genetic_modification', operator: 'eq', value: true },
            helpText: 'Per FDA guidance, replication-competent lentivirus (RCL) or retrovirus (RCR) testing is required for products manufactured with integrating viral vectors.',
          },
          {
            id: 'lot_specific_release',
            label: 'Lot-Specific Release Testing Established',
            type: 'yes_no',
            required: true,
            helpText: 'For autologous cell therapies, each patient-specific lot requires individual release testing. Establish lot-specific release criteria and chain-of-identity/custody procedures.',
          },
        ],
        defaultNext: 'cell_line_development',
      },

      /* ================================================================
       * Section 3 — Manufacturing & Process Controls
       * ================================================================ */

      {
        id: 'cell_line_development',
        section: 'manufacturing',
        question:
          'Describe the cell line and cell bank characterization for your biological product.',
        guidance:
          'Per ICH Q5D (Derivation and Characterisation of Cell Substrates Used for Production of Biotechnological/Biological Products), ICH Q5B (Quality of Biotechnological Products: Analysis of the Expression Construct in Cells Used for Production), and ICH Q5A(R2) (Viral Safety Evaluation), cell substrates must be thoroughly characterized. A two-tiered cell bank system (MCB/WCB) is expected for commercial manufacturing. Cell banks must undergo identity testing, viability assessment, sterility and mycoplasma testing, adventitious agent screening, and genetic stability confirmation. Refer also to 9 CFR 113 for viral testing requirements.',
        fields: [
          {
            id: 'cell_line_name',
            label: 'Cell Line Name / Designation',
            type: 'text',
            required: true,
            placeholder: 'e.g., CHO-K1-mAb-Clone 42',
          },
          {
            id: 'cell_bank_system',
            label: 'Cell Bank System',
            type: 'select',
            required: true,
            options: [
              { value: 'mcb_wcb', label: 'Two-Tiered (MCB + WCB)' },
              { value: 'mcb_only', label: 'MCB Only' },
              { value: 'direct_culture', label: 'Direct Culture (no cell bank)' },
            ],
          },
          {
            id: 'cell_bank_characterization',
            label: 'Cell Bank Characterization Tests Completed',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'identity', label: 'Identity (isoenzyme, STR, karyotype)' },
              { value: 'viability', label: 'Viability and Growth Characteristics' },
              { value: 'sterility', label: 'Sterility (14-day USP <71>)' },
              { value: 'mycoplasma', label: 'Mycoplasma Testing (PCR + Culture)' },
              { value: 'adventitious_agents', label: 'Adventitious Agent Testing (in vitro + in vivo)' },
              { value: 'genetic_stability', label: 'Genetic Stability Assessment' },
              { value: 'tumorigenicity', label: 'Tumorigenicity Testing' },
            ],
          },
          {
            id: 'passage_limit',
            label: 'In Vitro Cell Age (Passage Limit)',
            type: 'number',
            required: true,
            placeholder: 'e.g., 45',
            helpText: 'Maximum passage or population doubling level validated for production use.',
          },
          {
            id: 'genetic_stability_confirmed',
            label: 'Genetic Stability Confirmed at Production Limit',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q5B, genetic stability of the expression construct must be demonstrated at or beyond the limit of in vitro cell age used for production.',
          },
          {
            id: 'viral_testing_completed',
            label: 'Viral Safety Testing Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q5A(R2), viral safety testing must include retrovirus testing (TEM, RT/PERT assay for rodent cell lines), broad-spectrum in vitro and in vivo assays, and species-specific virus panels.',
          },
          {
            id: 'adventitious_agent_testing',
            label: 'Adventitious Agent Testing Methods',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'in_vitro', label: 'In Vitro Adventitious Agent Assays' },
              { value: 'in_vivo', label: 'In Vivo Adventitious Agent Assays' },
              { value: 'pcr_based', label: 'PCR-Based Virus Panel' },
              { value: 'tem', label: 'Transmission Electron Microscopy (TEM)' },
            ],
          },
          {
            id: 'raw_materials_animal_origin',
            label: 'Raw Materials of Animal Origin Used',
            type: 'yes_no',
            helpText: 'Identify any animal-derived raw materials (e.g., bovine serum, porcine trypsin). These require TSE/BSE risk assessment and sourcing documentation.',
          },
          {
            id: 'tse_risk_assessment',
            label: 'TSE/BSE Risk Assessment Completed',
            type: 'yes_no',
            visibleWhen: { field: 'raw_materials_animal_origin', operator: 'eq', value: true },
            helpText: 'Per EMEA/410/01 Rev.3 and FDA guidance, a TSE risk assessment is required for all animal-derived raw materials.',
          },
        ],
        defaultNext: 'manufacturing_process',
        issueChecks: [
          {
            id: 'viral_testing_not_done',
            condition: { field: 'viral_testing_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Viral Safety Testing Required',
            message:
              'Viral safety testing is mandatory per ICH Q5A(R2) for all cell-line-derived biologics. Testing must include retrovirus evaluation, broad-spectrum adventitious agent assays, and species-specific virus panels on cell banks and end-of-production cells.',
            reference: 'ICH Q5A(R2)',
          },
          {
            id: 'genetic_stability_not_confirmed',
            condition: { field: 'genetic_stability_confirmed', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Genetic Stability Must Be Demonstrated',
            message:
              'Per ICH Q5B, genetic stability of the expression construct must be confirmed at or beyond the limit of in vitro cell age used for production. Demonstrate stability of the transgene, transcript levels, and product quality attributes over the production cell age range.',
            reference: 'ICH Q5B',
          },
        ],
        provideExpertFeedback: true,
      },

      /* ── Manufacturing Process ────────────────────────────────────────── */

      {
        id: 'manufacturing_process',
        section: 'manufacturing',
        question:
          'Describe the manufacturing process, including upstream production, downstream purification, and viral clearance.',
        guidance:
          'Per 21 CFR 601.2, 21 CFR 211 (cGMP), and 21 CFR 600 (Biological Products: General), the BLA must include a detailed description of the entire manufacturing process from cell thaw or inoculation through final formulated bulk. Viral clearance steps must be validated per ICH Q5A(R2) demonstrating effective removal/inactivation of enveloped and non-enveloped model viruses. Process-related impurities (HCP, residual DNA, leached Protein A) and product-related impurities (aggregates, fragments, charge variants) must be controlled within justified limits.',
        fields: [
          {
            id: 'upstream_process',
            label: 'Upstream Process Description',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
            placeholder: 'Describe the cell culture/fermentation process including mode (fed-batch, perfusion), scale, media composition, CPPs, and harvest criteria.',
          },
          {
            id: 'downstream_process',
            label: 'Downstream Purification Process Description',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
            placeholder: 'Describe the purification train including chromatography steps, viral inactivation, virus filtration, UF/DF, and formulation.',
          },
          {
            id: 'viral_clearance_studies',
            label: 'Viral Clearance Validation Status',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'planned', label: 'Planned' },
            ],
          },
          {
            id: 'viral_clearance_log_reduction',
            label: 'Overall Viral Clearance Log Reduction Value (LRV)',
            type: 'text',
            visibleWhen: { field: 'viral_clearance_studies', operator: 'eq', value: 'completed' },
            placeholder: 'e.g., >18 log10 for enveloped viruses (MuLV, PRV); >10 log10 for non-enveloped (MVM, Reo-3)',
          },
          {
            id: 'purification_steps',
            label: 'Purification Steps',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'affinity_chrom', label: 'Affinity Chromatography (Protein A/G)' },
              { value: 'ion_exchange', label: 'Ion Exchange Chromatography (CEX/AEX)' },
              { value: 'hydrophobic', label: 'Hydrophobic Interaction Chromatography (HIC)' },
              { value: 'size_exclusion', label: 'Size Exclusion Chromatography (SEC)' },
              { value: 'viral_filtration', label: 'Virus Filtration (20nm Nanofiltration)' },
              { value: 'uf_df', label: 'Ultrafiltration / Diafiltration (UF/DF)' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'process_related_impurities',
            label: 'Process-Related Impurities Controlled',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., HCP <100 ppm by ELISA; Residual DNA <10 ng/dose by qPCR; Residual Protein A <5 ppm.',
          },
          {
            id: 'product_related_impurities',
            label: 'Product-Related Impurities Characterized',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., HMW aggregates <2% by SE-HPLC; Fragments <5% by CE-SDS (non-reduced); Acidic variants <30% by cIEF.',
          },
          {
            id: 'manufacturing_scale',
            label: 'Manufacturing Scale',
            type: 'select',
            required: true,
            options: [
              { value: 'clinical', label: 'Clinical Scale Only' },
              { value: 'commercial', label: 'Commercial Scale' },
              { value: 'both', label: 'Both Clinical and Commercial Scale' },
            ],
          },
          {
            id: 'manufacturing_sites',
            label: 'Manufacturing Site(s)',
            type: 'textarea',
            required: true,
            placeholder: 'List all drug substance and drug product manufacturing sites with addresses and FEI numbers.',
          },
          {
            id: 'facility_fda_inspected',
            label: 'Manufacturing Facility FDA-Inspected',
            type: 'yes_no',
            helpText: 'Per 42 USC 262(c) and 21 CFR 600.21, FDA must inspect and approve the manufacturing facility before a BLA can be licensed.',
          },
        ],
        defaultNext: 'process_validation_comparability',
        issueChecks: [
          {
            id: 'viral_clearance_not_completed',
            condition: { field: 'viral_clearance_studies', operator: 'neq', value: 'completed' },
            severity: 'critical',
            title: 'Viral Clearance Studies Required for BLA',
            message:
              'Viral clearance validation must be completed before BLA submission per ICH Q5A(R2). The purification process must demonstrate effective removal/inactivation of relevant and model viruses covering different physicochemical properties (enveloped/non-enveloped, DNA/RNA, large/small).',
            reference: 'ICH Q5A(R2)',
          },
          {
            id: 'facility_not_fda_inspected',
            condition: { field: 'facility_fda_inspected', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Pre-Approval Inspection Likely',
            message:
              'Per 42 USC 262(c) and 21 CFR 600.21, the manufacturing facility must be inspected by FDA before the BLA can be approved. Plan for a pre-approval inspection (PAI) with at least 6 months lead time.',
            reference: '21 CFR 600.21',
          },
        ],
      },

      /* ── Process Validation & Comparability ──────────────────────────── */

      {
        id: 'process_validation_comparability',
        section: 'manufacturing',
        question:
          'Describe the process validation status and any comparability studies conducted during development.',
        guidance:
          'Per FDA Process Validation Guidance (2011), ICH Q5E (Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process), and 21 CFR 601.2, the BLA must demonstrate that the manufacturing process consistently produces product meeting predefined quality attributes. Process validation should follow the lifecycle approach: Stage 1 (Process Design), Stage 2 (Process Qualification), Stage 3 (Continued Process Verification). Any manufacturing process changes during development require comparability assessment per ICH Q5E.',
        fields: [
          {
            id: 'process_validation_status',
            label: 'Process Validation Status',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed' },
              { value: 'ongoing', label: 'Ongoing' },
              { value: 'planned', label: 'Planned' },
            ],
          },
          {
            id: 'validation_batches',
            label: 'Number of Process Validation Batches',
            type: 'number',
            placeholder: 'e.g., 3',
            helpText: 'Typically a minimum of 3 consecutive commercial-scale batches are required for process validation.',
          },
          {
            id: 'cpps_defined',
            label: 'Critical Process Parameters (CPPs) Defined',
            type: 'yes_no',
            required: true,
            helpText: 'CPPs are process parameters whose variability has an impact on CQAs and must be monitored and controlled.',
          },
          {
            id: 'cqas_defined',
            label: 'Critical Quality Attributes (CQAs) Defined',
            type: 'yes_no',
            required: true,
            helpText: 'CQAs are physical, chemical, biological, or microbiological properties that should be within an appropriate limit to ensure product quality.',
          },
          {
            id: 'control_strategy',
            label: 'Process Control Strategy',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe the overall control strategy linking CPPs to CQAs, including in-process controls, specification limits, and monitoring approach.',
          },
          {
            id: 'comparability_study_needed',
            label: 'Comparability Study Required (Process Changes During Development)',
            type: 'yes_no',
          },
          {
            id: 'comparability_protocol',
            label: 'Comparability Protocol / Study Summary',
            type: 'textarea',
            visibleWhen: { field: 'comparability_study_needed', operator: 'eq', value: true },
            placeholder: 'Describe the comparability assessment: analytical, functional, and/or clinical comparability per ICH Q5E.',
          },
          {
            id: 'scale_up_completed',
            label: 'Scale-Up to Commercial Scale Completed',
            type: 'yes_no',
          },
          {
            id: 'lot_release_testing',
            label: 'Lot Release Testing Established',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'lot_release_specs',
            label: 'Lot Release Specifications',
            type: 'textarea',
            visibleWhen: { field: 'lot_release_testing', operator: 'eq', value: true },
            placeholder: 'Summarize key lot release specifications: identity, purity, potency, safety tests, and acceptance criteria.',
          },
        ],
        branches: [
          {
            when: { field: 'product_class', operator: 'eq', value: 'vaccine' },
            goto: 'vaccine_lot_release',
          },
        ],
        defaultNext: 'nonclinical_pharmacology',
        issueChecks: [
          {
            id: 'process_validation_only_planned',
            condition: { field: 'process_validation_status', operator: 'eq', value: 'planned' },
            severity: 'warning',
            title: 'Process Validation Should Be Complete for BLA',
            message:
              'Per FDA Process Validation Guidance (2011), process validation (Stage 2 — Process Qualification) should be completed at commercial scale before BLA submission. FDA expects data from validated manufacturing runs to support the BLA.',
            reference: 'FDA Process Validation Guidance (2011)',
          },
          {
            id: 'comparability_needed_no_protocol',
            condition: { field: 'comparability_study_needed', operator: 'eq', value: true },
            severity: 'warning',
            title: 'Comparability Protocol Required',
            message:
              'Per ICH Q5E, any manufacturing process change that could affect product quality, safety, or efficacy requires a comparability assessment. Ensure a comprehensive comparability protocol covering analytical, functional, and where necessary, nonclinical and clinical comparability is in place.',
            reference: 'ICH Q5E',
          },
        ],
      },

      /* ── Vaccine Lot Release (conditional) ───────────────────────────── */

      {
        id: 'vaccine_lot_release',
        section: 'manufacturing',
        question:
          'Provide the vaccine lot release testing details required for CBER lot release.',
        guidance:
          'Per 21 CFR 610 (General Biological Products Standards) and 21 CFR 600.3, certain biological products including vaccines and blood products require CBER lot release. Manufacturers must submit samples and release protocols for each lot before distribution. Per 21 CFR 610.2, a lot release protocol must accompany each lot submitted for release. Testing must include potency, sterility, endotoxin, identity, and general safety (where required). Some tests may be waived under specific circumstances per 21 CFR 610.1(b).',
        fields: [
          {
            id: 'lot_release_protocol',
            label: 'Lot Release Protocol Description',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the lot release protocol including tests, methods, and acceptance criteria per 21 CFR 610.2.',
          },
          {
            id: 'cber_lot_release',
            label: 'CBER Lot Release Required',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 610.2, samples and protocols must be submitted to CBER for lot release before distribution of vaccines and blood products.',
          },
          {
            id: 'potency_testing_each_lot',
            label: 'Potency Testing Performed on Each Lot',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 610.10, potency of each lot must be determined before release.',
          },
          {
            id: 'sterility_testing',
            label: 'Sterility Testing on Each Lot',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 610.12, sterility testing is required for each lot using validated methods.',
          },
          {
            id: 'endotoxin_testing',
            label: 'Endotoxin Testing on Each Lot',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 610.13(b), endotoxin limits must be established and tested for each lot.',
          },
          {
            id: 'identity_testing',
            label: 'Identity Testing on Each Lot',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 610.14, each lot must be tested for identity using specific and appropriate methods.',
          },
          {
            id: 'general_safety_test',
            label: 'General Safety Test',
            type: 'select',
            required: true,
            options: [
              { value: 'required', label: 'Required (per 21 CFR 610.11)' },
              { value: 'waived', label: 'Waived (per 21 CFR 610.11(g))' },
            ],
            helpText: 'The general safety test (formerly abnormal toxicity test) may be waived if alternative methods provide equivalent assurance of safety.',
          },
        ],
        defaultNext: 'nonclinical_pharmacology',
      },

      /* ================================================================
       * Section 4 — Nonclinical Studies
       * ================================================================ */

      {
        id: 'nonclinical_pharmacology',
        section: 'nonclinical',
        question:
          'Describe the nonclinical pharmacology program, including species selection, pharmacodynamic studies, and nonclinical PK.',
        guidance:
          'Per ICH S6(R1) (Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals), the nonclinical program for biologics must use pharmacologically relevant species — species in which the product is pharmacologically active. For monoclonal antibodies, cynomolgus monkey is commonly the only relevant species due to target antigen homology. Tissue cross-reactivity studies (per ICH S6(R1) Section 3) are expected for mAbs to identify potential off-target binding. For oncology products, refer also to ICH S9 (Nonclinical Evaluation for Anticancer Pharmaceuticals). Nonclinical PK should characterize biodistribution, half-life, and receptor occupancy where relevant.',
        fields: [
          {
            id: 'pharmacology_summary',
            label: 'Pharmacology Summary',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
            placeholder: 'Summarize the primary pharmacodynamic studies demonstrating proof-of-concept, including in vitro binding/functional assays and in vivo efficacy models.',
          },
          {
            id: 'pharmacologically_relevant_species',
            label: 'Pharmacologically Relevant Species',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'cynomolgus', label: 'Cynomolgus Monkey' },
              { value: 'rhesus', label: 'Rhesus Monkey' },
              { value: 'mouse', label: 'Mouse (wild-type or transgenic)' },
              { value: 'rat', label: 'Rat' },
              { value: 'transgenic', label: 'Transgenic / Humanized Animal Model' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'species_selection_justification',
            label: 'Species Selection Justification',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'e.g., Cynomolgus monkey selected based on >95% amino acid homology of target antigen to human; confirmed binding by SPR and functional activity in cynomolgus PBMC assays.',
          },
          {
            id: 'tissue_cross_reactivity',
            label: 'Tissue Cross-Reactivity Study Completed',
            type: 'yes_no',
            helpText: 'Per ICH S6(R1), tissue cross-reactivity studies using human and animal tissues are expected for monoclonal antibodies to identify potential off-target binding.',
          },
          {
            id: 'tcr_findings',
            label: 'Tissue Cross-Reactivity Findings',
            type: 'textarea',
            visibleWhen: { field: 'tissue_cross_reactivity', operator: 'eq', value: true },
            placeholder: 'Summarize any unexpected or off-target tissue binding observed.',
          },
          {
            id: 'pk_nonclinical',
            label: 'Nonclinical PK Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Summarize nonclinical PK including half-life, Cmax, AUC, biodistribution, and any dose-dependent nonlinearity (TMDD).',
          },
          {
            id: 'receptor_occupancy',
            label: 'Receptor Occupancy Studies',
            type: 'textarea',
            placeholder: 'If applicable, describe receptor occupancy data and relationship to pharmacodynamic effect.',
          },
          {
            id: 'efficacy_models',
            label: 'In Vivo Efficacy Models',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe the in vivo efficacy models used to demonstrate proof-of-concept (e.g., xenograft, syngeneic, genetically engineered mouse models).',
          },
        ],
        defaultNext: 'nonclinical_toxicology',
      },

      /* ── Nonclinical Toxicology ──────────────────────────────────────── */

      {
        id: 'nonclinical_toxicology',
        section: 'nonclinical',
        question:
          'Describe the nonclinical toxicology program, including GLP studies, repeat-dose toxicity, and reproductive toxicology.',
        guidance:
          'Per ICH S6(R1), ICH M3(R2) (Guidance on Nonclinical Safety Studies for the Conduct of Human Clinical Trials), and ICH S5(R3) (Detection of Reproductive and Developmental Toxicity for Human Pharmaceuticals), the nonclinical toxicology program for biologics should be conducted in pharmacologically relevant species under GLP conditions (21 CFR 58). Study duration should be based on the intended clinical dosing duration. For biologics, standard carcinogenicity bioassays are generally not required (per ICH S6(R1)), but a weight-of-evidence assessment of carcinogenic risk is expected. Reproductive toxicology requirements follow ICH S6(R1) Section 4.4, which may allow alternative approaches (e.g., enhanced pre- and postnatal study) for biologics.',
        fields: [
          {
            id: 'glp_tox_completed',
            label: 'GLP Toxicology Studies Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 58, pivotal nonclinical safety studies must be conducted under Good Laboratory Practice (GLP) conditions.',
          },
          {
            id: 'tox_species',
            label: 'Species Used in Toxicology Program',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'cynomolgus', label: 'Cynomolgus Monkey' },
              { value: 'rhesus', label: 'Rhesus Monkey' },
              { value: 'rat', label: 'Rat' },
              { value: 'mouse', label: 'Mouse' },
              { value: 'rabbit', label: 'Rabbit' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'repeat_dose_duration',
            label: 'Longest Repeat-Dose Toxicology Study Duration',
            type: 'select',
            required: true,
            options: [
              { value: '4wk', label: '4 Weeks' },
              { value: '13wk', label: '13 Weeks (3 Months)' },
              { value: '26wk', label: '26 Weeks (6 Months)' },
              { value: '39wk', label: '39 Weeks (9 Months)' },
              { value: 'chronic', label: 'Chronic (>9 Months)' },
            ],
          },
          {
            id: 'noael_summary',
            label: 'NOAEL Summary',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., NOAEL: 100 mg/kg in cynomolgus (26-week study), providing ~10x exposure margin relative to the proposed clinical dose of 10 mg/kg Q3W.',
          },
          {
            id: 'target_organ_findings',
            label: 'Target Organ Findings',
            type: 'textarea',
            placeholder: 'Describe any target organ toxicities observed in nonclinical studies and their relevance to clinical safety.',
          },
          {
            id: 'immunotox_assessment',
            label: 'Immunotoxicology Assessment Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH S6(R1) and ICH S8, immunotoxicity assessment is especially important for immunomodulatory biologics.',
          },
          {
            id: 'reproductive_tox',
            label: 'Reproductive Toxicology Studies',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed (fertility + EFD + pre/postnatal)' },
              { value: 'planned', label: 'Planned' },
              { value: 'waived_ich_s6', label: 'Waived per ICH S6(R1) (alternative approach)' },
            ],
            helpText: 'Per ICH S6(R1), alternative approaches to reproductive toxicity testing may be acceptable for biologics (e.g., enhanced PPND study, surrogate molecule, genetically modified animals).',
          },
          {
            id: 'carcinogenicity_assessment',
            label: 'Carcinogenicity Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'standard_bioassay', label: 'Standard Carcinogenicity Bioassay' },
              { value: 'impurity_assessment', label: 'Impurity-Based Assessment Only' },
              { value: 'weight_of_evidence', label: 'Weight-of-Evidence Assessment (per ICH S6(R1))' },
              { value: 'not_needed', label: 'Not Needed (justified per ICH S6(R1))' },
            ],
            helpText: 'Per ICH S6(R1), standard 2-year carcinogenicity bioassays are generally not required for biologics. A scientific weight-of-evidence assessment is expected.',
          },
          {
            id: 'safety_pharmacology_approach',
            label: 'Safety Pharmacology Approach',
            type: 'select',
            required: true,
            options: [
              { value: 'standalone_ich_s7', label: 'Standalone Safety Pharmacology Studies (ICH S7A/S7B)' },
              { value: 'incorporated_in_tox', label: 'Incorporated into Repeat-Dose Toxicology Studies' },
              { value: 'not_applicable', label: 'Not Applicable (justified per ICH S6(R1))' },
            ],
            helpText: 'Per ICH S6(R1), safety pharmacology endpoints (cardiovascular, CNS, respiratory) for biologics may be incorporated into repeat-dose toxicology studies rather than conducted as standalone studies.',
          },
        ],
        defaultNext: 'pk_pd_summary',
        issueChecks: [
          {
            id: 'glp_tox_not_completed',
            condition: { field: 'glp_tox_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'GLP Toxicology Required',
            message:
              'GLP-compliant toxicology studies are required for BLA submission per ICH S6(R1) and 21 CFR 58. Pivotal nonclinical safety studies must be conducted under GLP to ensure data integrity and regulatory acceptance.',
            reference: 'ICH S6(R1), 21 CFR 58',
          },
        ],
        provideExpertFeedback: true,
      },

      /* ================================================================
       * Section 5 — Clinical Pharmacology & Immunogenicity
       * ================================================================ */

      {
        id: 'pk_pd_summary',
        section: 'clinical_pharm',
        question:
          'Describe the clinical pharmacology characterization of your biological product, including PK, PD, and dose selection.',
        guidance:
          'Per 21 CFR 601.2, ICH E4 (Dose Response Information to Support Drug Registration), and FDA Exposure-Response Guidance (2003), the BLA must include comprehensive PK/PD characterization. For biologics, PK is often nonlinear due to target-mediated drug disposition (TMDD) at lower concentrations. Population PK modeling integrating data across clinical studies is expected. Exposure-response analyses for both efficacy and safety should support the proposed dose and dosing regimen.',
        fields: [
          {
            id: 'human_pk_summary',
            label: 'Human PK Summary',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
            placeholder: 'Summarize key human PK parameters across clinical studies including absorption, distribution, metabolism, and elimination characteristics.',
          },
          {
            id: 'pk_linearity',
            label: 'PK Linearity',
            type: 'select',
            required: true,
            options: [
              { value: 'linear', label: 'Linear PK Across Dose Range' },
              { value: 'non_linear', label: 'Non-Linear PK (TMDD or Saturable Clearance)' },
              { value: 'mixed', label: 'Mixed (Linear at Higher Doses, Non-Linear at Lower Doses)' },
            ],
          },
          {
            id: 'half_life',
            label: 'Elimination Half-Life',
            type: 'text',
            required: true,
            placeholder: 'e.g., ~21 days (typical IgG1); 3.5 days at 1 mg/kg, 22 days at 10 mg/kg (TMDD)',
          },
          {
            id: 'volume_of_distribution',
            label: 'Volume of Distribution',
            type: 'text',
            placeholder: 'e.g., ~4.5 L (central compartment), consistent with plasma volume for a large molecule',
          },
          {
            id: 'clearance',
            label: 'Clearance',
            type: 'text',
            required: true,
            placeholder: 'e.g., Linear CL = 0.22 L/day; Vmax = 0.95 mg/day, Km = 2.1 mg/L (TMDD)',
          },
          {
            id: 'target_mediated_disposition',
            label: 'Target-Mediated Drug Disposition (TMDD) Observed',
            type: 'yes_no',
            helpText: 'TMDD is common for monoclonal antibodies and results in dose-dependent clearance at lower concentrations.',
          },
          {
            id: 'tmdd_description',
            label: 'TMDD Description',
            type: 'textarea',
            visibleWhen: { field: 'target_mediated_disposition', operator: 'eq', value: true },
            placeholder: 'Describe the TMDD characteristics and impact on dosing regimen selection.',
          },
          {
            id: 'exposure_response_efficacy',
            label: 'Exposure-Response Relationship (Efficacy)',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe the exposure-efficacy relationship (e.g., Ctrough vs ORR, AUC vs PFS, receptor occupancy vs clinical response).',
          },
          {
            id: 'exposure_response_safety',
            label: 'Exposure-Response Relationship (Safety)',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the exposure-safety relationship (e.g., Cmax vs infusion reactions, AUC vs hepatotoxicity, cumulative exposure vs infections).',
          },
          {
            id: 'dose_selection_rationale',
            label: 'Dose Selection Rationale',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Justify the proposed dose and dosing regimen based on PK/PD modeling, exposure-response analysis, and clinical data.',
          },
          {
            id: 'special_populations_pk',
            label: 'Special Populations PK',
            type: 'textarea',
            placeholder: 'Summarize PK in special populations (renal impairment, hepatic impairment, elderly, pediatric, body weight effects, race/ethnicity) via population PK analysis.',
          },
        ],
        defaultNext: 'immunogenicity_assessment',
      },

      /* ── Immunogenicity Assessment ───────────────────────────────────── */

      {
        id: 'immunogenicity_assessment',
        section: 'clinical_pharm',
        question:
          'Describe the immunogenicity assessment strategy and clinical ADA results for your biological product.',
        guidance:
          'Per FDA Guidance on Immunogenicity Assessment for Therapeutic Protein Products (2014) and FDA Guidance on Immunogenicity Testing — Developing and Validating Assays for Anti-Drug Antibodies (2019), a risk-based, multi-tiered ADA testing strategy is required: screening assay, confirmatory assay (drug competition), titer, and neutralizing antibody (NAb) assay. Per ICH S6(R1), immunogenicity is a key consideration for all biologics. Clinical immunogenicity data must include treatment-emergent ADA incidence, NAb rates, and analysis of ADA impact on PK, efficacy, and safety.',
        fields: [
          {
            id: 'ada_assay_strategy',
            label: 'ADA Assay Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'tiered_approach', label: 'Tiered Approach (Screen → Confirm → Titer → NAb)' },
              { value: 'integrated', label: 'Integrated Multi-Domain Assay' },
              { value: 'screening_only', label: 'Screening Assay Only' },
            ],
          },
          {
            id: 'ada_incidence',
            label: 'Treatment-Emergent ADA Incidence',
            type: 'text',
            required: true,
            placeholder: 'e.g., 5.2% (23/442 patients) treatment-emergent ADA-positive',
          },
          {
            id: 'neutralizing_antibody_incidence',
            label: 'Neutralizing Antibody (NAb) Incidence',
            type: 'text',
            required: true,
            placeholder: 'e.g., 2.1% (9/442 patients) NAb-positive among ADA-positive subjects',
          },
          {
            id: 'ada_impact_on_pk',
            label: 'ADA Impact on PK',
            type: 'select',
            required: true,
            options: [
              { value: 'significant', label: 'Significant Impact (>50% change in exposure)' },
              { value: 'modest', label: 'Modest Impact (20-50% change in exposure)' },
              { value: 'no_impact', label: 'No Clinically Meaningful Impact' },
              { value: 'not_assessed', label: 'Not Assessed' },
            ],
          },
          {
            id: 'ada_impact_on_efficacy',
            label: 'ADA Impact on Efficacy',
            type: 'select',
            required: true,
            options: [
              { value: 'significant', label: 'Significant Impact (reduced efficacy in ADA+ patients)' },
              { value: 'modest', label: 'Modest Impact' },
              { value: 'no_impact', label: 'No Impact' },
              { value: 'not_assessed', label: 'Not Assessed' },
            ],
          },
          {
            id: 'ada_impact_on_safety',
            label: 'ADA Impact on Safety',
            type: 'select',
            required: true,
            options: [
              { value: 'significant', label: 'Significant Impact (increased AEs in ADA+ patients)' },
              { value: 'modest', label: 'Modest Impact' },
              { value: 'no_impact', label: 'No Impact' },
              { value: 'not_assessed', label: 'Not Assessed' },
            ],
          },
          {
            id: 'immunogenicity_risk_factors',
            label: 'Immunogenicity Risk Factors Present',
            type: 'multi_select',
            options: [
              { value: 'route_sc', label: 'Subcutaneous Route of Administration' },
              { value: 'product_aggregates', label: 'Product Aggregate Propensity' },
              { value: 'novel_sequence', label: 'Non-Human / Novel Sequences' },
              { value: 'repeat_dosing', label: 'Chronic / Repeat Dosing' },
              { value: 'patient_population', label: 'Immunocompetent Patient Population' },
              { value: 'concomitant_immunosuppression', label: 'Concomitant Immunosuppression' },
            ],
          },
          {
            id: 'mitigation_strategies',
            label: 'Immunogenicity Mitigation Strategies',
            type: 'textarea',
            placeholder: 'e.g., Formulation optimization to minimize aggregates; premedication regimen; dose escalation protocol; fully human framework to reduce immunogenicity.',
          },
          {
            id: 'cross_reactive_antibodies',
            label: 'Cross-Reactive Antibodies to Endogenous Counterpart',
            type: 'yes_no',
            helpText: 'If the biologic has an endogenous counterpart (e.g., EPO, Factor VIII), assess whether ADA cross-react with and neutralize the endogenous protein.',
          },
          {
            id: 'assay_validation_complete',
            label: 'ADA Assay Validation Complete',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA ADA Guidance (2019), ADA assays must be validated for sensitivity, drug tolerance, specificity, precision, selectivity, and cut point determination.',
          },
        ],
        defaultNext: 'efficacy_program',
        issueChecks: [
          {
            id: 'ada_assay_not_validated',
            condition: { field: 'assay_validation_complete', operator: 'eq', value: false },
            severity: 'critical',
            title: 'ADA Assay Must Be Validated',
            message:
              'Per FDA Guidance on Immunogenicity Testing (2019), ADA screening, confirmatory, and neutralizing antibody assays must be validated before the data can support the BLA. Validation parameters include sensitivity, drug tolerance, specificity, precision, selectivity, and statistical cut point.',
            reference: 'FDA Guidance on Immunogenicity Assessment (2019)',
          },
          {
            id: 'ada_significant_efficacy_impact',
            condition: { field: 'ada_impact_on_efficacy', operator: 'eq', value: 'significant' },
            severity: 'warning',
            title: 'Significant ADA Impact on Efficacy Requires Analysis',
            message:
              'A significant impact of ADA on efficacy requires thorough analysis including dose-response, exposure-response in ADA+/ADA- subgroups, and discussion of risk mitigation strategies in the BLA.',
            reference: '21 CFR 601.2',
          },
        ],
        provideExpertFeedback: true,
      },

      /* ================================================================
       * Section 6 — Clinical Efficacy
       * ================================================================ */

      {
        id: 'efficacy_program',
        section: 'clinical_efficacy',
        question:
          'Provide an overview of the clinical efficacy program supporting this BLA, including all efficacy studies and the regulatory endpoint strategy.',
        guidance:
          'Per 21 CFR 601.2 and ICH E9 (Statistical Principles for Clinical Trials), the BLA must include adequate and well-controlled investigations demonstrating substantial evidence of effectiveness. For accelerated approval (21 CFR 601 Subpart E), efficacy may be based on a surrogate endpoint reasonably likely to predict clinical benefit. The totality of the efficacy evidence — including pivotal and supportive studies — should demonstrate a favorable benefit-risk profile for the proposed indication.',
        fields: [
          {
            id: 'total_efficacy_studies',
            label: 'Total Number of Efficacy Studies',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'study_phases',
            label: 'Study Phases Included',
            type: 'multi_select',
            options: [
              { value: 'phase1', label: 'Phase 1' },
              { value: 'phase2', label: 'Phase 2' },
              { value: 'phase3', label: 'Phase 3' },
            ],
          },
          {
            id: 'pivotal_study_count',
            label: 'Number of Pivotal Studies',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'indication',
            label: 'Proposed Indication Statement',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'e.g., For the treatment of adult patients with HER2-positive metastatic breast cancer who have received two or more prior anti-HER2-based regimens in the metastatic setting.',
          },
          {
            id: 'population_studied',
            label: 'Population Studied',
            type: 'textarea',
            required: true,
            validation: { minLength: 30 },
            placeholder: 'Describe the patient population including key inclusion/exclusion criteria, demographics, and disease characteristics.',
          },
          {
            id: 'comparator_used',
            label: 'Comparator Used',
            type: 'select',
            required: true,
            options: [
              { value: 'placebo', label: 'Placebo' },
              { value: 'active_comparator', label: 'Active Comparator' },
              { value: 'historical', label: 'Historical Control' },
              { value: 'soc_plus_placebo', label: 'Standard of Care + Placebo' },
              { value: 'none', label: 'None (Single-Arm Study)' },
            ],
          },
          {
            id: 'regulatory_endpoint_type',
            label: 'Regulatory Endpoint Type',
            type: 'select',
            required: true,
            options: [
              { value: 'os', label: 'Overall Survival (OS)' },
              { value: 'pfs', label: 'Progression-Free Survival (PFS)' },
              { value: 'orr', label: 'Objective Response Rate (ORR)' },
              { value: 'dfs', label: 'Disease-Free Survival (DFS)' },
              { value: 'clinical_response', label: 'Clinical Response Rate' },
              { value: 'biomarker', label: 'Biomarker Endpoint' },
              { value: 'composite', label: 'Composite Endpoint' },
              { value: 'patient_reported', label: 'Patient-Reported Outcome (PRO)' },
            ],
          },
          {
            id: 'surrogate_endpoint_used',
            label: 'Surrogate Endpoint Used (for Accelerated Approval)',
            type: 'yes_no',
          },
          {
            id: 'accelerated_approval_basis',
            label: 'Basis for Accelerated Approval',
            type: 'textarea',
            visibleWhen: { field: 'surrogate_endpoint_used', operator: 'eq', value: true },
            placeholder: 'Describe the surrogate endpoint and evidence that it is reasonably likely to predict clinical benefit per 21 CFR 601 Subpart E.',
          },
        ],
        defaultNext: 'pivotal_study_results',
      },

      /* ── Pivotal Study Results ───────────────────────────────────────── */

      {
        id: 'pivotal_study_results',
        section: 'clinical_efficacy',
        question:
          'Present the pivotal study design and results that form the primary basis for this BLA.',
        guidance:
          'Per 21 CFR 601.2, the BLA must include full reports of adequate and well-controlled investigations demonstrating effectiveness. The pivotal study should have a robust design (randomized controlled is preferred), adequate sample size, clinically meaningful primary endpoint, pre-specified statistical analysis plan, and results that meet the primary endpoint with statistical significance. Subgroup analyses should demonstrate consistency of treatment effect.',
        fields: [
          {
            id: 'pivotal_design',
            label: 'Pivotal Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'randomized_controlled', label: 'Randomized Controlled Trial' },
              { value: 'single_arm', label: 'Single-Arm Study' },
              { value: 'adaptive', label: 'Adaptive Design' },
              { value: 'enrichment', label: 'Enrichment Design' },
            ],
          },
          {
            id: 'pivotal_enrollment',
            label: 'Pivotal Study Enrollment',
            type: 'number',
            required: true,
            validation: { min: 10 },
            placeholder: 'e.g., 800',
          },
          {
            id: 'primary_endpoint_result',
            label: 'Primary Endpoint Result',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'e.g., Median PFS 14.8 months (treatment) vs 6.8 months (control), HR = 0.44 (95% CI: 0.36-0.55), p<0.0001 by stratified log-rank test.',
          },
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'hazard_ratio_or_effect',
            label: 'Hazard Ratio or Effect Size',
            type: 'text',
            required: true,
            placeholder: 'e.g., HR = 0.44 or ORR = 64.2% vs 31.8%',
          },
          {
            id: 'confidence_interval',
            label: 'Confidence Interval',
            type: 'text',
            required: true,
            placeholder: 'e.g., 95% CI: 0.36-0.55',
          },
          {
            id: 'p_value',
            label: 'P-Value',
            type: 'text',
            placeholder: 'e.g., p<0.0001',
          },
          {
            id: 'secondary_endpoints_results',
            label: 'Secondary Endpoint Results',
            type: 'textarea',
            placeholder: 'Summarize key secondary endpoint results including ORR, DoR, OS (if available), and PROs.',
          },
          {
            id: 'duration_of_response',
            label: 'Duration of Response',
            type: 'text',
            placeholder: 'e.g., Median DoR: 18.2 months (95% CI: 14.1-NE)',
          },
          {
            id: 'clinical_benefit_description',
            label: 'Clinical Benefit Description',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe the overall clinical benefit including impact on survival, symptoms, quality of life, and functional outcomes.',
          },
          {
            id: 'subgroup_consistency',
            label: 'Subgroup Analysis Consistent',
            type: 'yes_no',
            helpText: 'Were treatment effects consistent across pre-specified subgroups (age, sex, race, disease stage, biomarker status)?',
          },
        ],
        defaultNext: 'safety_database',
        issueChecks: [
          {
            id: 'primary_endpoint_not_met',
            condition: { field: 'primary_endpoint_met', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Primary Endpoint Not Met',
            message:
              'The pivotal study did not meet its primary endpoint. This is a critical concern for BLA approval. Without statistical significance on the primary endpoint, the BLA may not demonstrate substantial evidence of effectiveness per 21 CFR 601.2. Consider additional supportive data, secondary endpoints, or alternative regulatory strategies.',
            reference: '21 CFR 601.2',
          },
        ],
        provideExpertFeedback: true,
      },

      /* ================================================================
       * Section 7 — Clinical Safety
       * ================================================================ */

      {
        id: 'safety_database',
        section: 'clinical_safety',
        question:
          'Describe the safety database adequacy, including total patient exposure and duration of follow-up.',
        guidance:
          'Per ICH E1 (The Extent of Population Exposure to Assess Clinical Safety for Drugs Intended for Long-Term Treatment of Non-Life-Threatening Conditions) and 21 CFR 601.2, the safety database should generally include at least 1,500 patients exposed to the product, with at least 300-600 patients exposed for 6 months and at least 100 for 12 months for chronic use indications. An integrated safety analysis pooling data across all clinical studies is expected.',
        fields: [
          {
            id: 'total_exposed',
            label: 'Total Patients Exposed',
            type: 'number',
            required: true,
            validation: { min: 100 },
            placeholder: 'e.g., 2500',
          },
          {
            id: 'exposure_6_months',
            label: 'Patients with >= 6 Months Exposure',
            type: 'number',
            required: true,
            placeholder: 'e.g., 1800',
          },
          {
            id: 'exposure_12_months',
            label: 'Patients with >= 12 Months Exposure',
            type: 'number',
            required: true,
            placeholder: 'e.g., 1200',
          },
          {
            id: 'total_patient_years',
            label: 'Total Patient-Years of Exposure',
            type: 'number',
            placeholder: 'e.g., 3200',
          },
          {
            id: 'database_adequate_per_ich_e1',
            label: 'Safety Database Adequate per ICH E1',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH E1, at least 1,500 patients for non-life-threatening conditions; 300-600 for 6 months and 100 for 12 months for chronic use.',
          },
          {
            id: 'integrated_safety_analysis',
            label: 'Integrated Safety Analysis Completed',
            type: 'yes_no',
            required: true,
            helpText: 'An ISS pooling safety data across all clinical studies, with consistent coding (MedDRA), is expected in the BLA.',
          },
          {
            id: 'safety_update_cutoff',
            label: 'Safety Data Cutoff Date',
            type: 'date',
            required: true,
          },
          {
            id: 'long_term_extension_data',
            label: 'Long-Term Extension Study Data Available',
            type: 'yes_no',
          },
        ],
        defaultNext: 'safety_profile',
        issueChecks: [
          {
            id: 'safety_db_below_ich_e1',
            condition: { field: 'total_exposed', operator: 'lt', value: 1500 },
            severity: 'warning',
            title: 'Safety Database Below ICH E1',
            message:
              'ICH E1 recommends at least 1,500 patients in the safety database for non-life-threatening conditions. A smaller database may be acceptable for rare diseases, oncology, or unmet medical needs with appropriate justification, but FDA may request additional safety data.',
            reference: 'ICH E1',
          },
          {
            id: 'safety_db_inadequate',
            condition: { field: 'database_adequate_per_ich_e1', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Safety Database Adequacy Concern',
            message:
              'The safety database has been assessed as inadequate per ICH E1 standards. This may result in a Complete Response Letter or a requirement for additional safety studies before or after approval. Provide a detailed justification in the BLA.',
            reference: 'ICH E1',
          },
        ],
      },

      /* ── Safety Profile ──────────────────────────────────────────────── */

      {
        id: 'safety_profile',
        section: 'clinical_safety',
        question:
          'Describe the detailed safety profile of your biological product, including adverse events, serious AEs, and safety signals of special interest.',
        guidance:
          'Per 21 CFR 601.2 and ICH E2C(R2) (Periodic Benefit-Risk Evaluation Report), the BLA must include a comprehensive characterization of the safety profile. For biologics, particular attention should be given to immunogenicity-related AEs (infusion reactions, anaphylaxis, autoimmunity), infections (for immunomodulatory products), malignancies, and class-specific effects. If a boxed warning is anticipated, early engagement with FDA on labeling language is recommended per 21 CFR 201.57(c).',
        fields: [
          {
            id: 'most_common_aes',
            label: 'Most Common Adverse Events (>=10% incidence)',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
            placeholder: 'List the most common TEAEs with incidence rates in treatment vs control arms.',
          },
          {
            id: 'serious_aes',
            label: 'Serious Adverse Events',
            type: 'textarea',
            required: true,
            placeholder: 'Summarize SAEs by type, incidence, and relationship to treatment.',
          },
          {
            id: 'grade_3_plus_aes',
            label: 'Grade 3+ Adverse Events',
            type: 'textarea',
            required: true,
            placeholder: 'List Grade 3 and higher AEs with incidence rates.',
          },
          {
            id: 'infusion_reactions',
            label: 'Infusion / Injection Reactions',
            type: 'textarea',
            placeholder: 'Describe the incidence, severity, and management of infusion or injection site reactions.',
          },
          {
            id: 'infections',
            label: 'Infections',
            type: 'textarea',
            placeholder: 'Summarize infection types and rates, particularly for immunomodulatory biologics (opportunistic infections, TB reactivation, HBV reactivation).',
          },
          {
            id: 'malignancies',
            label: 'Malignancies',
            type: 'textarea',
            placeholder: 'Report any malignancies observed during the clinical program, including lymphomas and solid tumors.',
          },
          {
            id: 'autoimmune_events',
            label: 'Autoimmune Events',
            type: 'textarea',
            placeholder: 'Describe any autoimmune or immune-mediated adverse events observed.',
          },
          {
            id: 'deaths_total',
            label: 'Total Deaths in Clinical Program',
            type: 'number',
            required: true,
          },
          {
            id: 'deaths_drug_related',
            label: 'Drug-Related Deaths',
            type: 'number',
          },
          {
            id: 'discontinuation_rate',
            label: 'Treatment Discontinuation Rate Due to AEs',
            type: 'text',
            required: true,
            placeholder: 'e.g., 8.2% (treatment) vs 3.1% (control)',
          },
          {
            id: 'dose_modifications',
            label: 'Dose Modifications Due to AEs',
            type: 'text',
            placeholder: 'e.g., Dose delay: 22%; Dose reduction: 12%',
          },
          {
            id: 'special_safety_interests',
            label: 'Special Safety Interests',
            type: 'multi_select',
            options: [
              { value: 'hepatotox', label: 'Hepatotoxicity' },
              { value: 'cardiotox', label: 'Cardiotoxicity' },
              { value: 'pml', label: 'Progressive Multifocal Leukoencephalopathy (PML)' },
              { value: 'tb_reactivation', label: 'Tuberculosis Reactivation' },
              { value: 'hbv_reactivation', label: 'Hepatitis B Virus Reactivation' },
              { value: 'cytokine_release', label: 'Cytokine Release Syndrome (CRS)' },
              { value: 'immune_mediated', label: 'Immune-Mediated Adverse Events' },
              { value: 'infusion_related', label: 'Infusion-Related Reactions' },
              { value: 'immunogenicity_related', label: 'Immunogenicity-Related AEs' },
            ],
          },
          {
            id: 'boxed_warning_anticipated',
            label: 'Boxed Warning Anticipated',
            type: 'yes_no',
          },
          {
            id: 'pregnancy_outcomes',
            label: 'Pregnancy Outcomes',
            type: 'textarea',
            placeholder: 'Report any pregnancy exposures and outcomes during the clinical program.',
          },
        ],
        defaultNext: 'post_marketing_plan',
        issueChecks: [
          {
            id: 'boxed_warning_noted',
            condition: { field: 'boxed_warning_anticipated', operator: 'eq', value: true },
            severity: 'info',
            title: 'Boxed Warning Anticipated',
            message:
              'A boxed warning (per 21 CFR 201.57(c)) is anticipated for this product. Engage early with FDA on the proposed boxed warning language and ensure the REMS assessment addresses the underlying risk. Boxed warnings are reserved for the most serious risks and significantly impact labeling and risk communication.',
            reference: '21 CFR 201.57',
          },
        ],
      },

      /* ================================================================
       * Section 8 — Post-Marketing & REMS
       * ================================================================ */

      {
        id: 'post_marketing_plan',
        section: 'post_marketing',
        question:
          'Describe the post-marketing commitments, pharmacovigilance plan, and any confirmatory study requirements.',
        guidance:
          'Per 21 CFR 601.14 (Required Postmarketing Reports), 21 CFR 601.70 (Annual Reports for Biological Products), and 21 CFR 601.41 (Accelerated Approval — Requirement for Postmarketing Studies), the BLA holder must maintain ongoing pharmacovigilance. For accelerated approval products, a confirmatory study verifying clinical benefit is required per 21 CFR 601.41. The Accelerated Approval Integrity Act (2023) strengthens FDA authority to require and enforce timely completion of confirmatory studies. Periodic safety update reports (PSUR/PADER) are required per ICH E2C(R2).',
        fields: [
          {
            id: 'confirmatory_study_needed',
            label: 'Post-Marketing Confirmatory Study Needed',
            type: 'yes_no',
            helpText: 'Required for all products receiving accelerated approval per 21 CFR 601.41.',
          },
          {
            id: 'confirmatory_study_protocol',
            label: 'Confirmatory Study Protocol Summary',
            type: 'textarea',
            visibleWhen: { field: 'confirmatory_study_needed', operator: 'eq', value: true },
            placeholder: 'Describe the confirmatory study design, endpoints, sample size, and expected timeline.',
          },
          {
            id: 'phase_4_commitments',
            label: 'Phase 4 Study Commitments',
            type: 'textarea',
            placeholder: 'Describe any Phase 4 studies planned or committed to (e.g., long-term safety registry, real-world evidence studies).',
          },
          {
            id: 'pmc_list',
            label: 'Post-Marketing Commitments (PMCs)',
            type: 'textarea',
            placeholder: 'List agreed-upon or anticipated post-marketing commitments (studies or clinical trials the sponsor has agreed to conduct).',
          },
          {
            id: 'pme_list',
            label: 'Post-Marketing Requirements (PMRs)',
            type: 'textarea',
            placeholder: 'List FDA-required post-marketing studies or clinical trials under 21 CFR 601.14.',
          },
          {
            id: 'pharmacovigilance_plan',
            label: 'Pharmacovigilance Plan',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe the pharmacovigilance plan including safety specification, signal detection activities, spontaneous report monitoring, and active surveillance.',
          },
          {
            id: 'periodic_safety_reports',
            label: 'Periodic Safety Report Type',
            type: 'select',
            required: true,
            options: [
              { value: 'psur', label: 'PSUR (Periodic Safety Update Report)' },
              { value: 'pader', label: 'PADER (Periodic Adverse Drug Experience Report)' },
              { value: 'both', label: 'Both PSUR and PADER' },
            ],
          },
          {
            id: 'signal_detection_plan',
            label: 'Signal Detection Plan',
            type: 'textarea',
            required: true,
            placeholder: 'Describe signal detection activities: FAERS review, literature monitoring, Sentinel System queries, active surveillance studies.',
          },
          {
            id: 'pregnancy_registry',
            label: 'Pregnancy Registry Planned',
            type: 'yes_no',
            helpText: 'A pregnancy exposure registry may be required or recommended for biologics administered to women of childbearing potential.',
          },
          {
            id: 'long_term_safety_study',
            label: 'Long-Term Safety Study Planned',
            type: 'yes_no',
          },
        ],
        defaultNext: 'rems_evaluation',
        issueChecks: [
          {
            id: 'accelerated_no_confirmatory',
            condition: { field: 'confirmatory_study_needed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Confirmatory Study Required',
            message:
              'For products receiving accelerated approval, a confirmatory post-marketing study verifying clinical benefit is mandatory per 21 CFR 601.41. Under the Accelerated Approval Integrity Act (2023), FDA has enhanced authority to withdraw approval if the sponsor fails to conduct required confirmatory studies with due diligence.',
            reference: '21 CFR 601.41',
          },
        ],
      },

      /* ── REMS Evaluation ─────────────────────────────────────────────── */

      {
        id: 'rems_evaluation',
        section: 'post_marketing',
        question:
          'Assess whether a Risk Evaluation and Mitigation Strategy (REMS) is required, and provide final submission details.',
        guidance:
          'Per 21 USC 355-1 (as applied to biologics via 351(j) of the PHS Act), FDA may require a REMS if necessary to ensure the benefits of the product outweigh its risks. Common REMS elements include Medication Guides, Communication Plans, Elements to Assure Safe Use (ETASU), and Implementation Systems. The BLA must include Form FDA 356h (21 CFR 601.2) and either an environmental assessment or claim of categorical exclusion per 21 CFR 25. Final risk-benefit summary should synthesize the totality of evidence.',
        fields: [
          {
            id: 'rems_required',
            label: 'REMS Required',
            type: 'select',
            required: true,
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'likely', label: 'Likely' },
              { value: 'no', label: 'No' },
              { value: 'under_discussion', label: 'Under Discussion with FDA' },
            ],
          },
          {
            id: 'rems_elements',
            label: 'REMS Elements',
            type: 'multi_select',
            visibleWhen: { field: 'rems_required', operator: 'in', value: ['yes', 'likely'] },
            options: [
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'communication_plan', label: 'Communication Plan' },
              { value: 'etasu', label: 'Elements to Assure Safe Use (ETASU)' },
              { value: 'implementation_system', label: 'Implementation System' },
            ],
          },
          {
            id: 'etasu_description',
            label: 'ETASU Description',
            type: 'textarea',
            visibleWhen: { field: 'rems_elements', operator: 'contains', value: 'etasu' },
            placeholder: 'e.g., Certified prescriber program; certified pharmacy distribution; patient enrollment and monitoring requirements.',
          },
          {
            id: 'comparable_product_rems',
            label: 'Comparable Product REMS',
            type: 'textarea',
            placeholder: 'If a comparable product has a REMS, describe its structure and whether a shared REMS is being considered.',
          },
          {
            id: 'risk_benefit_summary',
            label: 'Risk-Benefit Summary',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
            placeholder: 'Provide a comprehensive risk-benefit summary addressing disease severity, unmet need, magnitude of efficacy benefit, safety profile, and overall benefit-risk conclusion.',
          },
          {
            id: 'final_submission_date',
            label: 'Target BLA Submission Date',
            type: 'date',
            required: true,
          },
          {
            id: 'form_fda_356h',
            label: 'Form FDA 356h Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'Form FDA 356h is the mandatory cover form for all BLA submissions per 21 CFR 601.2.',
          },
          {
            id: 'environmental_assessment',
            label: 'Environmental Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'categorical_exclusion', label: 'Categorical Exclusion Claimed (21 CFR 25.31)' },
              { value: 'ea_prepared', label: 'Environmental Assessment Prepared' },
            ],
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'form_356h_not_prepared',
            condition: { field: 'form_fda_356h', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Form FDA 356h Required',
            message:
              'Form FDA 356h (Application to Market a New Drug, Biologic, or Antibiotic Drug for Human Use) is the mandatory cover form for all BLA submissions. The BLA will be refused to file without this form.',
            reference: '21 CFR 601.2',
          },
        ],
      },

      /* ================================================================
       * Section 9 — Biosimilar-Specific
       * ================================================================ */

      {
        id: 'biosimilar_analytical',
        section: 'biosimilar',
        question:
          'Describe the analytical similarity assessment comparing your proposed biosimilar to the reference product.',
        guidance:
          'Per FDA Guidance for Industry: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015) and 42 USC 262(k), analytical similarity is the foundation of the 351(k) biosimilar application. The FDA statistical tiered approach includes: Tier 1 (equivalence testing for most critical attributes like potency and protein content), Tier 2 (quality range approach), and Tier 3 (raw data comparison). A fingerprint-like analytical similarity assessment using orthogonal state-of-the-art methods is expected. Multiple lots of the US-licensed reference product (typically 10+) should be analyzed to establish the reference product quality range.',
        fields: [
          {
            id: 'reference_product',
            label: 'Reference Product',
            type: 'text',
            required: true,
            placeholder: 'e.g., Herceptin (trastuzumab), BLA 103792',
          },
          {
            id: 'reference_product_approval',
            label: 'Reference Product Approval Information',
            type: 'text',
            required: true,
            placeholder: 'e.g., BLA 103792, first approved September 25, 1998',
          },
          {
            id: 'analytical_similarity_studies',
            label: 'Analytical Similarity Studies Description',
            type: 'textarea',
            required: true,
            validation: { minLength: 100 },
            placeholder: 'Describe the analytical similarity assessment including physicochemical characterization (primary structure, higher-order structure, glycosylation, charge variants, size variants) and functional assays.',
          },
          {
            id: 'functional_assays',
            label: 'Functional Assay Results',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Describe functional assay results including target binding (SPR, ELISA), Fc effector function (ADCC, CDC, ADCP), FcRn binding, and cell-based potency.',
          },
          {
            id: 'fingerprint_analysis',
            label: 'Fingerprint-Like Analysis Completed',
            type: 'yes_no',
            required: true,
            helpText: 'A comprehensive fingerprint-like analysis using multiple orthogonal analytical techniques is expected by FDA.',
          },
          {
            id: 'quality_range_analysis',
            label: 'Quality Range Analysis Completed',
            type: 'yes_no',
            required: true,
            helpText: 'The biosimilar should fall within the quality range established from multiple lots of the US-licensed reference product.',
          },
          {
            id: 'biosimilar_category',
            label: 'Analytical Similarity Assessment Conclusion',
            type: 'select',
            required: true,
            options: [
              { value: 'highly_similar', label: 'Highly Similar (no clinically meaningful differences)' },
              { value: 'similar_with_differences', label: 'Similar with Minor Residual Differences' },
              { value: 'not_similar', label: 'Not Similar (significant differences identified)' },
            ],
          },
          {
            id: 'residual_differences',
            label: 'Residual Differences',
            type: 'textarea',
            placeholder: 'If minor differences were identified, describe them and their potential clinical impact.',
          },
          {
            id: 'reference_product_lots_tested',
            label: 'Number of Reference Product Lots Tested',
            type: 'number',
            required: true,
            validation: { min: 10 },
            placeholder: 'e.g., 15',
          },
          {
            id: 'analytical_bridging',
            label: 'Analytical Bridging (Non-US Reference Product)',
            type: 'yes_no',
            helpText: 'If a non-US reference product was used in clinical studies, analytical bridging to the US-licensed reference product is required.',
          },
        ],
        defaultNext: 'biosimilar_clinical',
        issueChecks: [
          {
            id: 'biosimilar_not_similar',
            condition: { field: 'biosimilar_category', operator: 'eq', value: 'not_similar' },
            severity: 'critical',
            title: 'Analytical Dissimilarity — 351(k) Pathway May Not Be Viable',
            message:
              'Significant analytical differences between the proposed biosimilar and the reference product undermine the foundation of the 351(k) pathway. Per 42 USC 262(k), biosimilarity requires that the product be "highly similar" to the reference product notwithstanding minor differences in clinically inactive components. Consider whether a 351(a) BLA pathway is more appropriate.',
            reference: '42 USC 262(k)',
          },
          {
            id: 'insufficient_reference_lots',
            condition: { field: 'reference_product_lots_tested', operator: 'lt', value: 10 },
            severity: 'warning',
            title: 'More Reference Product Lots May Be Needed',
            message:
              'FDA expects analysis of multiple lots (typically 10+) of the US-licensed reference product to adequately characterize the reference product quality range. Fewer lots may not provide sufficient statistical power for the tiered analytical similarity assessment.',
            reference: 'FDA Guidance on Biosimilar Development (2015)',
          },
        ],
      },

      /* ── Biosimilar Clinical ─────────────────────────────────────────── */

      {
        id: 'biosimilar_clinical',
        section: 'biosimilar',
        question:
          'Describe the clinical studies conducted to demonstrate biosimilarity, including PK similarity, clinical efficacy, and immunogenicity comparison.',
        guidance:
          'Per FDA Guidance: Clinical Pharmacology Data to Support a Demonstration of Biosimilarity to a Reference Product (2014) and 42 USC 262(k), the clinical development program for a biosimilar typically includes a comparative PK similarity study (first clinical study), followed by at least one comparative clinical study in a sensitive patient population. PK equivalence must be demonstrated within 80-125% bioequivalence margins. Clinical similarity is assessed using equivalence or non-inferiority designs with pre-specified margins. Extrapolation of indications may be considered based on the totality of evidence.',
        fields: [
          {
            id: 'pk_similarity_study',
            label: 'Comparative PK Similarity Study Status',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed' },
              { value: 'ongoing', label: 'Ongoing' },
              { value: 'planned', label: 'Planned' },
            ],
          },
          {
            id: 'pk_equivalence_demonstrated',
            label: 'PK Equivalence Demonstrated (80-125%)',
            type: 'yes_no',
            visibleWhen: { field: 'pk_similarity_study', operator: 'eq', value: 'completed' },
          },
          {
            id: 'clinical_study_design',
            label: 'Comparative Clinical Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'equivalence', label: 'Equivalence Study' },
              { value: 'non_inferiority', label: 'Non-Inferiority Study' },
              { value: 'single_switch', label: 'Single-Switch Study' },
            ],
          },
          {
            id: 'clinical_endpoint',
            label: 'Clinical Study Endpoint',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., ACR20 at Week 24 with equivalence margin of +/-15% (RA study); ORR at Week 24 for oncology.',
          },
          {
            id: 'clinical_similarity_demonstrated',
            label: 'Clinical Similarity Demonstrated',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'sensitive_population',
            label: 'Sensitive Population Used',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., Treatment-naive RA patients (most sensitive population for detecting differences in clinical endpoints).',
          },
          {
            id: 'extrapolation_of_indications',
            label: 'Extrapolation of Indications Sought',
            type: 'yes_no',
          },
          {
            id: 'extrapolation_justification',
            label: 'Extrapolation Justification',
            type: 'textarea',
            visibleWhen: { field: 'extrapolation_of_indications', operator: 'eq', value: true },
            placeholder: 'Justify extrapolation based on totality of evidence: analytical similarity, functional assays, PK, clinical data, and mechanism of action in each indication.',
          },
          {
            id: 'switching_study_completed',
            label: 'Switching Study Completed',
            type: 'yes_no',
          },
          {
            id: 'immunogenicity_comparison',
            label: 'Comparative Immunogenicity Assessment',
            type: 'textarea',
            required: true,
            validation: { minLength: 50 },
            placeholder: 'Compare ADA incidence, NAb rates, and impact on PK/efficacy/safety between the biosimilar and reference product.',
          },
        ],
        defaultNext: 'interchangeability',
        issueChecks: [
          {
            id: 'clinical_similarity_not_demonstrated',
            condition: { field: 'clinical_similarity_demonstrated', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Clinical Similarity Not Demonstrated',
            message:
              'Clinical similarity has not been demonstrated. Per 42 USC 262(k), the totality of evidence must demonstrate that the proposed biosimilar product is biosimilar to the reference product. Without clinical similarity data, the 351(k) application may not be approvable.',
            reference: '42 USC 262(k)',
          },
          {
            id: 'pk_equivalence_failed',
            condition: { field: 'pk_equivalence_demonstrated', operator: 'eq', value: false },
            severity: 'critical',
            title: 'PK Equivalence Required',
            message:
              'PK equivalence (within 80-125% bioequivalence margins for AUC and Cmax) is a fundamental requirement for biosimilar development. Failure to demonstrate PK equivalence raises significant concerns about the biosimilarity of the proposed product.',
            reference: 'FDA Guidance on Biosimilar PK Studies',
          },
        ],
      },

      /* ── Interchangeability ──────────────────────────────────────────── */

      {
        id: 'interchangeability',
        section: 'biosimilar',
        question:
          'Is interchangeability designation being sought, and if so, describe the switching study data supporting this designation.',
        guidance:
          'Per the Biologics Price Competition and Innovation Act (BPCIA, 42 USC 262(k)(4)) and FDA Guidance: Considerations in Demonstrating Interchangeability With a Reference Product (2019), an interchangeable biosimilar may be substituted for the reference product without the intervention of the prescribing healthcare provider. To demonstrate interchangeability, the applicant must show that the product can be expected to produce the same clinical result in any given patient and, for products administered more than once, that switching between the interchangeable product and the reference product does not increase safety risk or diminish efficacy.',
        fields: [
          {
            id: 'interchangeability_sought',
            label: 'Interchangeability Designation Sought',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'switching_study_design',
            label: 'Switching Study Design',
            type: 'textarea',
            visibleWhen: { field: 'interchangeability_sought', operator: 'eq', value: true },
            placeholder: 'e.g., Randomized, double-blind, multiple-switch study with 3 switches between biosimilar and reference product over 12 months.',
          },
          {
            id: 'number_of_switches',
            label: 'Number of Switches',
            type: 'number',
            visibleWhen: { field: 'interchangeability_sought', operator: 'eq', value: true },
            placeholder: 'e.g., 3',
          },
          {
            id: 'switching_endpoints',
            label: 'Switching Study Endpoints',
            type: 'multi_select',
            visibleWhen: { field: 'interchangeability_sought', operator: 'eq', value: true },
            options: [
              { value: 'pk', label: 'Pharmacokinetics' },
              { value: 'pd', label: 'Pharmacodynamics' },
              { value: 'immunogenicity', label: 'Immunogenicity' },
              { value: 'safety', label: 'Safety' },
              { value: 'efficacy', label: 'Efficacy' },
            ],
          },
          {
            id: 'immunogenicity_switching_data',
            label: 'Immunogenicity Data from Switching Study',
            type: 'textarea',
            visibleWhen: { field: 'interchangeability_sought', operator: 'eq', value: true },
            placeholder: 'Compare ADA/NAb incidence between switched and non-switched groups.',
          },
          {
            id: 'no_diminished_efficacy',
            label: 'No Diminished Efficacy After Switching',
            type: 'yes_no',
            visibleWhen: { field: 'interchangeability_sought', operator: 'eq', value: true },
          },
          {
            id: 'no_increased_risk',
            label: 'No Increased Safety Risk After Switching',
            type: 'yes_no',
            visibleWhen: { field: 'interchangeability_sought', operator: 'eq', value: true },
          },
          {
            id: 'pharmacy_substitution_considerations',
            label: 'Pharmacy-Level Substitution Considerations',
            type: 'textarea',
            visibleWhen: { field: 'interchangeability_sought', operator: 'eq', value: true },
            placeholder: 'Describe considerations for pharmacy-level substitution including state pharmacy laws, notification requirements, and product traceability.',
          },
        ],
        defaultNext: 'post_marketing_plan',
        issueChecks: [
          {
            id: 'interchangeability_diminished_efficacy',
            condition: { field: 'no_diminished_efficacy', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Cannot Demonstrate Interchangeability',
            message:
              'Per BPCIA (42 USC 262(k)(4)), interchangeability requires a demonstration that switching between the interchangeable product and the reference product does not result in diminished efficacy or increased safety risk. Evidence of diminished efficacy after switching precludes interchangeability designation.',
            reference: 'BPCIA 42 USC 262(k)(4)',
          },
        ],
      },
    ],
  };
}
