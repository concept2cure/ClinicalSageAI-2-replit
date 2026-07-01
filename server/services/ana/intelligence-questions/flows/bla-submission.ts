/**
 * BLA (Biologics License Application) Submission flow definition for the
 * AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive BLA submission
 * questionnaire covering biological product characterization, manufacturing
 * process, analytical methods, viral safety, immunogenicity, clinical data,
 * biosimilar-specific requirements, labeling, post-marketing, and submission
 * strategy per 42 USC 262 and 21 CFR 601.
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
      'Biologics License Application questionnaire covering biological product characterization, manufacturing, analytical methods, immunogenicity, clinical data, and post-marketing requirements per 42 USC 262 and 21 CFR 601.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'bla_overview',
    estimatedMinutes: 55,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'bla_overview_section',
        label: 'BLA Overview',
        nodeIds: ['bla_overview', 'bla_designations'],
      },
      {
        id: 'product_characterization',
        label: 'Biological Product Characterization',
        nodeIds: ['molecular_characterization', 'cell_line_vector', 'comparability'],
      },
      {
        id: 'manufacturing_process',
        label: 'Manufacturing Process',
        nodeIds: ['upstream_process', 'downstream_process', 'facility_info'],
      },
      {
        id: 'analytical_methods',
        label: 'Analytical Methods & Specifications',
        nodeIds: ['release_testing', 'method_validation'],
      },
      {
        id: 'viral_safety',
        label: 'Viral Safety',
        nodeIds: ['adventitious_agents', 'viral_clearance'],
      },
      {
        id: 'immunogenicity_section',
        label: 'Immunogenicity',
        nodeIds: ['immunogenicity_risk', 'ada_strategy'],
      },
      {
        id: 'clinical_data',
        label: 'Clinical Data Package',
        nodeIds: ['clinical_efficacy', 'clinical_safety', 'clinical_pharmacology'],
      },
      {
        id: 'biosimilar_specific',
        label: 'Biosimilar-Specific',
        nodeIds: ['analytical_similarity', 'clinical_bridging'],
      },
      {
        id: 'labeling_rems',
        label: 'Labeling & REMS',
        nodeIds: ['biologic_labeling', 'rems_requirements'],
      },
      {
        id: 'post_marketing',
        label: 'Post-Marketing',
        nodeIds: ['post_marketing_commitments', 'pharmacovigilance'],
      },
      {
        id: 'submission_strategy',
        label: 'Submission Strategy',
        nodeIds: ['pre_bla_meeting', 'ectd_structure', 'review_timeline'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ── BLA Overview ─────────────────────────────────────────────── */

      {
        id: 'bla_overview',
        section: 'bla_overview_section',
        question:
          'Let\'s begin your Biologics License Application. What type of BLA are you filing and what is your biological product?',
        guidance:
          'BLAs are authorized under 42 USC 262 and regulated under 21 CFR 601. A 351(a) BLA is for an original biological product with full data. A 351(k) application under the Biologics Price Competition and Innovation Act (BPCIA) is for biosimilar and interchangeable products referencing an FDA-licensed biological product.',
        fields: [
          {
            id: 'bla_type',
            label: 'BLA Type',
            type: 'select',
            required: true,
            options: [
              {
                value: '351a_original',
                label: '351(a) Original BLA',
                description: 'Full BLA with complete chemistry, manufacturing, nonclinical, and clinical data.',
              },
              {
                value: '351k_biosimilar',
                label: '351(k) Biosimilar Application',
                description: 'Abbreviated pathway referencing an FDA-licensed biological product under BPCIA.',
              },
            ],
          },
          {
            id: 'product_type',
            label: 'Biological Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'monoclonal_antibody', label: 'Monoclonal Antibody' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
              { value: 'cell_therapy', label: 'Cell Therapy (e.g., CAR-T)' },
              { value: 'blood_product', label: 'Blood / Plasma-Derived Product' },
              { value: 'recombinant_protein', label: 'Recombinant Protein / Peptide' },
              { value: 'antibody_drug_conjugate', label: 'Antibody-Drug Conjugate (ADC)' },
              { value: 'fusion_protein', label: 'Fusion Protein' },
              { value: 'other_biologic', label: 'Other Biological Product' },
            ],
          },
          {
            id: 'product_name_proposed',
            label: 'Proposed Nonproprietary Name',
            type: 'text',
            placeholder: 'e.g., trastuzumab, nivolumab',
            required: true,
            helpText:
              'Per FDA guidance on nonproprietary naming of biological products (2017), biosimilars must include a distinguishing suffix.',
          },
          {
            id: 'product_trade_name',
            label: 'Proposed Trade Name',
            type: 'text',
            placeholder: 'e.g., Herceptin, Opdivo',
          },
          {
            id: 'proposed_indication',
            label: 'Proposed Indication(s)',
            type: 'textarea',
            placeholder:
              'e.g., Treatment of HER2-positive metastatic breast cancer in combination with chemotherapy.',
            required: true,
          },
          {
            id: 'review_division',
            label: 'FDA Review Division',
            type: 'select',
            required: true,
            helpText:
              'CBER reviews vaccines, blood products, gene therapies, cell therapies, and some therapeutic proteins. CDER reviews monoclonal antibodies and certain therapeutic proteins per the 2003 transfer agreement.',
            options: [
              { value: 'cber', label: 'CBER (Center for Biologics Evaluation and Research)' },
              { value: 'cder', label: 'CDER (Center for Drug Evaluation and Research)' },
            ],
          },
          {
            id: 'reference_product',
            label: 'Reference Product (for Biosimilar)',
            type: 'text',
            placeholder: 'e.g., Herceptin (trastuzumab), BLA 103792',
            visibleWhen: {
              field: 'bla_type',
              operator: 'eq',
              value: '351k_biosimilar',
            },
            helpText:
              'Per 42 USC 262(k)(2), a 351(k) application must identify a single reference product that is FDA-licensed under 42 USC 262(a).',
          },
          {
            id: 'reference_product_exclusivity_expiry',
            label: 'Reference Product Exclusivity Expiry Date',
            type: 'date',
            visibleWhen: {
              field: 'bla_type',
              operator: 'eq',
              value: '351k_biosimilar',
            },
            helpText:
              'Under BPCIA, 351(a) products receive 12 years of data exclusivity and 4 years of filing exclusivity from first licensure.',
          },
        ],
        defaultNext: 'bla_designations',
      },

      {
        id: 'bla_designations',
        section: 'bla_overview_section',
        question:
          'Does this product have any special FDA designations or expedited program status?',
        guidance:
          'Expedited programs can significantly affect BLA strategy and timeline. Breakthrough Therapy (21 CFR 312 Subpart E) provides intensive FDA guidance. RMAT designation under 21st Century Cures Act applies to regenerative medicine therapies including cell and gene therapies. Orphan designation (21 CFR 316) provides 7 years of market exclusivity.',
        fields: [
          {
            id: 'breakthrough_therapy',
            label: 'Breakthrough Therapy Designation',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'rmat_designation',
            label: 'RMAT (Regenerative Medicine Advanced Therapy) Designation',
            type: 'yes_no',
            required: true,
            helpText:
              'RMAT designation under Section 3033 of the 21st Century Cures Act is available for cell therapies, gene therapies, tissue engineered products, and combination products using such therapies.',
          },
          {
            id: 'orphan_designation',
            label: 'Orphan Drug Designation',
            type: 'yes_no',
            required: true,
            helpText:
              'Orphan designation per 21 CFR 316 applies to products intended for conditions affecting fewer than 200,000 persons in the US. Provides 7 years of market exclusivity.',
          },
          {
            id: 'fast_track',
            label: 'Fast Track Designation',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'accelerated_approval_pathway',
            label: 'Seeking Accelerated Approval',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 601 Subpart E, accelerated approval for biologics may be based on a surrogate endpoint that is reasonably likely to predict clinical benefit.',
          },
          {
            id: 'priority_review',
            label: 'Priority Review Expected',
            type: 'yes_no',
            helpText:
              'Priority Review provides a 6-month review target (vs. 10-month standard) for products that offer significant improvement over available therapy.',
          },
        ],
        defaultNext: 'molecular_characterization',
        provideExpertFeedback: true,
      },

      /* ── Biological Product Characterization ──────────────────────── */

      {
        id: 'molecular_characterization',
        section: 'product_characterization',
        question:
          'Describe the molecular characterization of your biological product.',
        guidance:
          'Per ICH Q6B and 21 CFR 610.13, biologics must be thoroughly characterized for identity, purity, and potency. Molecular characterization includes primary structure (amino acid sequence), higher-order structure, post-translational modifications (glycosylation, disulfide bonds), charge heterogeneity, and size variants. The extent of characterization should be commensurate with current scientific understanding.',
        fields: [
          {
            id: 'primary_structure_confirmed',
            label: 'Primary Structure Confirmed (amino acid sequence)',
            type: 'yes_no',
            required: true,
            helpText:
              'Complete amino acid sequence determination including N-/C-terminal sequencing and peptide mapping.',
          },
          {
            id: 'higher_order_structure',
            label: 'Higher-Order Structure Characterization',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'secondary_cd', label: 'Secondary Structure (CD Spectroscopy)' },
              { value: 'secondary_ftir', label: 'Secondary Structure (FTIR)' },
              { value: 'tertiary_nmr', label: 'Tertiary Structure (NMR)' },
              { value: 'tertiary_fluorescence', label: 'Tertiary Structure (Intrinsic Fluorescence)' },
              { value: 'xray', label: 'X-ray Crystallography' },
              { value: 'cryo_em', label: 'Cryo-EM' },
              { value: 'disulfide_mapping', label: 'Disulfide Bond Mapping' },
              { value: 'hdx_ms', label: 'HDX-MS' },
            ],
          },
          {
            id: 'glycosylation_profile',
            label: 'Glycosylation Profile Characterized',
            type: 'yes_no',
            required: true,
            helpText:
              'For glycoproteins, glycosylation can affect efficacy, safety, and immunogenicity. Include N-linked and O-linked glycan analysis per ICH Q6B.',
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['monoclonal_antibody', 'fusion_protein', 'recombinant_protein', 'antibody_drug_conjugate'],
            },
          },
          {
            id: 'glycosylation_impact_on_function',
            label: 'Impact of Glycosylation on Biological Function',
            type: 'textarea',
            placeholder:
              'e.g., Afucosylation enhances ADCC activity. Galactosylation affects CDC. High mannose affects PK.',
            visibleWhen: {
              field: 'glycosylation_profile',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'post_translational_modifications',
            label: 'Post-Translational Modifications Identified',
            type: 'multi_select',
            options: [
              { value: 'deamidation', label: 'Deamidation' },
              { value: 'oxidation', label: 'Oxidation' },
              { value: 'pyroglutamate', label: 'Pyroglutamate Formation' },
              { value: 'c_terminal_lysine', label: 'C-terminal Lysine Clipping' },
              { value: 'glycation', label: 'Glycation' },
              { value: 'isomerization', label: 'Isomerization' },
              { value: 'disulfide_scrambling', label: 'Disulfide Scrambling' },
            ],
          },
          {
            id: 'charge_variants_characterized',
            label: 'Charge Variants Characterized',
            type: 'yes_no',
            helpText: 'Charge heterogeneity analysis (e.g., IEF, cIEF, CEX-HPLC).',
          },
          {
            id: 'size_variants_characterized',
            label: 'Size Variants Characterized',
            type: 'yes_no',
            helpText: 'Size heterogeneity analysis (e.g., SE-HPLC, SDS-PAGE, AUC) including aggregates and fragments.',
          },
          {
            id: 'potency_assay_developed',
            label: 'Potency Assay Developed',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 610.10, potency of each lot must be determined. A relevant biological assay that reflects the mechanism of action is expected.',
          },
          {
            id: 'potency_assay_description',
            label: 'Potency Assay Description',
            type: 'textarea',
            placeholder:
              'e.g., Cell-based ADCC reporter bioassay using Jurkat effector cells and SK-BR-3 target cells. EC50 of reference standard = 0.5 nM.',
            visibleWhen: {
              field: 'potency_assay_developed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'fc_function_characterization',
            label: 'Fc Effector Function Characterization',
            type: 'multi_select',
            helpText:
              'For monoclonal antibodies, Fc-mediated effector functions are critical quality attributes that must be characterized.',
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['monoclonal_antibody', 'antibody_drug_conjugate', 'fusion_protein'],
            },
            options: [
              { value: 'adcc', label: 'ADCC (Antibody-Dependent Cellular Cytotoxicity)' },
              { value: 'cdc', label: 'CDC (Complement-Dependent Cytotoxicity)' },
              { value: 'adcp', label: 'ADCP (Antibody-Dependent Cellular Phagocytosis)' },
              { value: 'fcrn_binding', label: 'FcRn Binding (neonatal Fc receptor)' },
              { value: 'fc_gamma_binding', label: 'Fc-gamma Receptor Binding' },
              { value: 'c1q_binding', label: 'C1q Binding' },
            ],
          },
        ],
        defaultNext: 'cell_line_vector',
        issueChecks: [
          {
            id: 'no_potency_assay',
            condition: {
              field: 'potency_assay_developed',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'No Potency Assay',
            message:
              'A potency assay is required for BLA lot release per 21 CFR 610.10. Without a validated potency assay, the BLA cannot be approved. Develop a biological assay reflecting the mechanism of action.',
            reference: '21 CFR 610.10',
          },
        ],
        provideExpertFeedback: true,
      },

      {
        id: 'cell_line_vector',
        section: 'product_characterization',
        question:
          'Describe the cell line, expression system, or vector used to produce your biological product.',
        guidance:
          'Per ICH Q5B (Quality of Biotechnological Products: Analysis of the Expression Construct) and ICH Q5D (Derivation and Characterisation of Cell Substrates), the cell substrate and expression construct must be thoroughly characterized. For gene therapies, FDA guidance on Chemistry, Manufacturing, and Control (CMC) Information for Human Gene Therapy INDs (2020) requires detailed vector characterization.',
        fields: [
          {
            id: 'expression_system',
            label: 'Expression System',
            type: 'select',
            required: true,
            options: [
              { value: 'cho', label: 'CHO (Chinese Hamster Ovary)' },
              { value: 'hek293', label: 'HEK293' },
              { value: 'sp2_0', label: 'Sp2/0 (Mouse Myeloma)' },
              { value: 'ns0', label: 'NS0 (Mouse Myeloma)' },
              { value: 'e_coli', label: 'E. coli' },
              { value: 'yeast', label: 'Yeast (Pichia/Saccharomyces)' },
              { value: 'insect', label: 'Insect Cell / Baculovirus' },
              { value: 'plant', label: 'Plant-Based' },
              { value: 'viral_vector', label: 'Viral Vector Production System' },
              { value: 'patient_cells', label: 'Patient-Derived Cells (Autologous)' },
              { value: 'donor_cells', label: 'Donor-Derived Cells (Allogeneic)' },
              { value: 'other_expression', label: 'Other' },
            ],
          },
          {
            id: 'cell_bank_system',
            label: 'Cell Bank System Established',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH Q5D, a two-tiered cell bank system (Master Cell Bank and Working Cell Bank) is expected. Cell banks must be characterized for identity, purity, stability, and adventitious agent testing.',
            visibleWhen: {
              field: 'expression_system',
              operator: 'not_in',
              value: ['patient_cells', 'donor_cells'],
            },
          },
          {
            id: 'mcb_wcb_characterization',
            label: 'MCB/WCB Characterization Status',
            type: 'select',
            visibleWhen: {
              field: 'cell_bank_system',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'fully_characterized', label: 'Fully Characterized (identity, purity, adventitious agents)' },
              { value: 'partially_characterized', label: 'Partially Characterized' },
              { value: 'in_progress', label: 'Characterization In Progress' },
            ],
          },
          {
            id: 'cell_line_stability',
            label: 'Cell Line Stability Demonstrated',
            type: 'yes_no',
            helpText:
              'Per ICH Q5D, cell line stability must be demonstrated over the production cell age (in vitro cell age) used in manufacturing. Genetic stability testing should confirm consistent expression.',
          },
          {
            id: 'genetic_stability_testing',
            label: 'Genetic Stability Testing Performed',
            type: 'yes_no',
            helpText:
              'Per ICH Q5B, the integrity of the expression construct must be confirmed at the limit of in vitro cell age used for production.',
          },
          {
            id: 'vector_type',
            label: 'Vector Type',
            type: 'select',
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['gene_therapy', 'cell_therapy'],
            },
            options: [
              { value: 'aav', label: 'AAV (Adeno-Associated Virus)' },
              { value: 'lentivirus', label: 'Lentiviral Vector' },
              { value: 'retrovirus', label: 'Retroviral Vector (Gamma-retrovirus)' },
              { value: 'adenovirus', label: 'Adenoviral Vector' },
              { value: 'hsv', label: 'HSV (Herpes Simplex Virus)' },
              { value: 'non_viral', label: 'Non-Viral (lipid nanoparticle, plasmid)' },
              { value: 'mrna', label: 'mRNA (lipid nanoparticle encapsulated)' },
              { value: 'other_vector', label: 'Other' },
            ],
          },
          {
            id: 'vector_characterization',
            label: 'Vector Characterization Details',
            type: 'textarea',
            placeholder:
              'e.g., AAV9 serotype, CMV promoter, codon-optimized transgene, ITR integrity confirmed by restriction digest and sequencing. Vector genome titer determined by ddPCR.',
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['gene_therapy', 'cell_therapy'],
            },
          },
          {
            id: 'integration_analysis',
            label: 'Integration Site Analysis Performed',
            type: 'yes_no',
            helpText:
              'For integrating vectors (lentiviral, retroviral), integration site analysis is required per FDA Long Term Follow-Up After Administration of a Gene Therapy Product guidance (2020). Assess insertional mutagenesis risk.',
            visibleWhen: {
              field: 'vector_type',
              operator: 'in',
              value: ['lentivirus', 'retrovirus'],
            },
          },
          {
            id: 'chain_of_identity',
            label: 'Chain of Identity / Chain of Custody System',
            type: 'yes_no',
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'cell_therapy',
            },
            helpText:
              'For autologous cell therapies, a robust chain of identity system is critical to prevent patient mix-ups. Per FDA guidance on Considerations for the Design of Early-Phase Clinical Trials of Cellular and Gene Therapy Products (2015).',
          },
        ],
        defaultNext: 'comparability',
        issueChecks: [
          {
            id: 'cell_bank_not_characterized',
            condition: {
              field: 'cell_bank_system',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'Cell Bank System Not Established',
            message:
              'Per ICH Q5D, a qualified two-tiered cell bank system (MCB/WCB) is required for commercial biologics manufacturing. Without established cell banks, lot-to-lot consistency and product quality cannot be assured.',
            reference: 'ICH Q5B, ICH Q5D',
          },
        ],
        provideExpertFeedback: true,
      },

      {
        id: 'comparability',
        section: 'product_characterization',
        question:
          'Have there been any manufacturing process changes during development, and have comparability studies been conducted?',
        guidance:
          'Per ICH Q5E (Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process), any process change that could affect product quality, safety, or efficacy requires a comparability assessment. For biosimilars, analytical similarity assessment is the foundation of the 351(k) application per FDA Guidance for Industry: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015).',
        fields: [
          {
            id: 'process_changes_occurred',
            label: 'Manufacturing Process Changes During Development',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'number_of_process_changes',
            label: 'Number of Significant Process Changes',
            type: 'number',
            placeholder: 'e.g., 3',
            visibleWhen: {
              field: 'process_changes_occurred',
              operator: 'eq',
              value: true,
            },
            validation: { min: 1 },
          },
          {
            id: 'comparability_studies_conducted',
            label: 'Comparability Studies Conducted per ICH Q5E',
            type: 'yes_no',
            visibleWhen: {
              field: 'process_changes_occurred',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'comparability_scope',
            label: 'Comparability Assessment Scope',
            type: 'multi_select',
            visibleWhen: {
              field: 'comparability_studies_conducted',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'analytical', label: 'Analytical Comparability (physicochemical, biological)' },
              { value: 'functional', label: 'Functional Comparability (potency, binding)' },
              { value: 'nonclinical', label: 'Nonclinical Comparability (PK, toxicology)' },
              { value: 'clinical', label: 'Clinical Comparability (PK, efficacy, safety)' },
            ],
          },
          {
            id: 'biosimilar_analytical_similarity',
            label: 'Analytical Similarity Assessment Completed',
            type: 'yes_no',
            visibleWhen: {
              field: 'bla_type',
              operator: 'eq',
              value: '351k_biosimilar',
            },
            helpText:
              'Per FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity (2015), a comprehensive analytical similarity assessment using state-of-the-art techniques is the foundation of a 351(k) biosimilar application.',
          },
          {
            id: 'analytical_similarity_approach',
            label: 'Analytical Similarity Approach',
            type: 'textarea',
            placeholder:
              'e.g., Tier 1 (equivalence testing): potency, protein content. Tier 2 (quality range): glycosylation, charge variants. Tier 3 (raw data): SEC, peptide mapping.',
            visibleWhen: {
              field: 'biosimilar_analytical_similarity',
              operator: 'eq',
              value: true,
            },
          },
        ],
        defaultNext: 'upstream_process',
        issueChecks: [
          {
            id: 'no_comparability_after_change',
            condition: {
              field: 'comparability_studies_conducted',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'No Comparability Data After Process Change',
            message:
              'Per ICH Q5E, manufacturing process changes during development require a comparability exercise to demonstrate that pre-change and post-change product are comparable in quality, safety, and efficacy. The BLA must include comparability data.',
            reference: 'ICH Q5E',
          },
          {
            id: 'biosimilar_no_analytical_similarity',
            condition: {
              field: 'biosimilar_analytical_similarity',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'Biosimilar Without Analytical Similarity Assessment',
            message:
              'Analytical similarity is the foundation of a 351(k) biosimilar application. Per FDA guidance (2015), a robust analytical similarity assessment using orthogonal methods and the FDA tiered statistical approach is essential. Without this, the totality-of-evidence framework cannot be established.',
            reference: 'FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015)',
          },
        ],
      },

      /* ── Manufacturing Process ────────────────────────────────────── */

      {
        id: 'upstream_process',
        section: 'manufacturing_process',
        question:
          'Describe the upstream manufacturing process (cell culture / fermentation).',
        guidance:
          'Per 21 CFR 601.2 and ICH Q7, the BLA must provide a detailed description of the manufacturing process from cell thaw through harvest. Critical Process Parameters (CPPs) must be identified and controlled to ensure consistent product quality. Scale-up history and process development should demonstrate process understanding.',
        fields: [
          {
            id: 'culture_mode',
            label: 'Cell Culture / Fermentation Mode',
            type: 'select',
            required: true,
            options: [
              { value: 'fed_batch', label: 'Fed-Batch' },
              { value: 'perfusion', label: 'Perfusion' },
              { value: 'batch', label: 'Batch' },
              { value: 'continuous', label: 'Continuous Manufacturing' },
              { value: 'other_mode', label: 'Other' },
            ],
          },
          {
            id: 'production_scale',
            label: 'Production Scale (Bioreactor Volume)',
            type: 'text',
            placeholder: 'e.g., 2,000 L fed-batch bioreactor',
            required: true,
          },
          {
            id: 'media_composition',
            label: 'Media Composition',
            type: 'select',
            required: true,
            options: [
              { value: 'chemically_defined', label: 'Chemically Defined (serum-free)' },
              { value: 'serum_free', label: 'Serum-Free (with hydrolysates)' },
              { value: 'serum_containing', label: 'Serum-Containing' },
            ],
          },
          {
            id: 'animal_derived_materials',
            label: 'Animal-Derived Raw Materials Used',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH Q5A(R2) and 9 CFR 113, the use of animal-derived raw materials poses TSE and adventitious agent risks. Identify any animal-derived components and their sources.',
          },
          {
            id: 'critical_process_parameters',
            label: 'Critical Process Parameters (CPPs) Identified',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cpp_list',
            label: 'Key CPPs and Ranges',
            type: 'textarea',
            placeholder:
              'e.g., Temperature: 36.5-37.0 C, pH: 6.9-7.1, DO: 30-50%, Viable cell density at harvest: >5x10^6 cells/mL',
            visibleWhen: {
              field: 'critical_process_parameters',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'scale_up_history',
            label: 'Scale-Up History',
            type: 'textarea',
            placeholder:
              'e.g., Development from 2L to 200L to 2,000L. Comparability demonstrated at each scale per ICH Q5E.',
            required: true,
          },
          {
            id: 'process_controls_established',
            label: 'In-Process Controls Established',
            type: 'yes_no',
            required: true,
          },
        ],
        defaultNext: 'downstream_process',
        issueChecks: [
          {
            id: 'no_critical_process_parameters',
            condition: {
              field: 'critical_process_parameters',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Critical Process Parameters Not Identified',
            message:
              'Per ICH Q8(R2) and ICH Q11, critical process parameters (CPPs) must be identified through process development and characterization studies. CPPs directly impact critical quality attributes and must be controlled within defined ranges to ensure consistent product quality.',
            reference: 'ICH Q8(R2), ICH Q11',
          },
          {
            id: 'animal_derived_materials_risk',
            condition: {
              field: 'animal_derived_materials',
              operator: 'eq',
              value: true,
            },
            severity: 'warning',
            title: 'Animal-Derived Materials in Manufacturing',
            message:
              'Use of animal-derived raw materials requires TSE/BSE risk assessment per EMEA/410/01 Rev.3 and adventitious agent testing per ICH Q5A(R2). Consider replacing with non-animal-derived alternatives where feasible. Document sourcing, species, tissue type, and geographic origin.',
            reference: 'ICH Q5A(R2), 9 CFR 113',
          },
        ],
      },

      {
        id: 'downstream_process',
        section: 'manufacturing_process',
        question:
          'Describe the downstream purification process, including viral clearance steps.',
        guidance:
          'Per 21 CFR 601.2 and ICH Q7, the purification process must be described in sufficient detail to demonstrate that the drug substance meets predefined quality attributes. Viral clearance steps (dedicated or inherent) must be validated per ICH Q5A(R2). Hold times at each intermediate step must be validated.',
        fields: [
          {
            id: 'purification_steps',
            label: 'Purification Steps',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'protein_a', label: 'Protein A Affinity Chromatography' },
              { value: 'ion_exchange', label: 'Ion Exchange Chromatography (CEX/AEX)' },
              { value: 'hic', label: 'Hydrophobic Interaction Chromatography (HIC)' },
              { value: 'mixed_mode', label: 'Mixed-Mode Chromatography' },
              { value: 'sec', label: 'Size Exclusion Chromatography' },
              { value: 'ultrafiltration', label: 'Ultrafiltration / Diafiltration (UF/DF)' },
              { value: 'viral_inactivation', label: 'Dedicated Viral Inactivation (Low pH / Solvent-Detergent)' },
              { value: 'virus_filtration', label: 'Virus Filtration (Nanofiltration)' },
              { value: 'depth_filtration', label: 'Depth Filtration' },
              { value: 'tangential_flow', label: 'Tangential Flow Filtration (TFF)' },
            ],
          },
          {
            id: 'process_validation_completed',
            label: 'Process Validation Completed',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 211.100 and FDA Process Validation guidance (2011), process validation must demonstrate that the process consistently produces product meeting quality attributes.',
          },
          {
            id: 'process_validation_batches',
            label: 'Number of Process Validation Batches',
            type: 'number',
            placeholder: 'e.g., 3',
            visibleWhen: {
              field: 'process_validation_completed',
              operator: 'eq',
              value: true,
            },
            validation: { min: 1 },
          },
          {
            id: 'hold_times_validated',
            label: 'Intermediate Hold Times Validated',
            type: 'yes_no',
            helpText:
              'Hold time studies must demonstrate product stability at each intermediate step under defined storage conditions.',
          },
          {
            id: 'reprocessing_criteria_defined',
            label: 'Reprocessing Criteria Defined',
            type: 'yes_no',
            helpText:
              'Per 21 CFR 211.115, procedures for reprocessing must be documented and approved. Any reprocessed lots must meet all specifications.',
          },
          {
            id: 'lot_to_lot_consistency',
            label: 'Lot-to-Lot Consistency Demonstrated',
            type: 'yes_no',
            required: true,
            helpText:
              'Consistency of the manufacturing process across multiple lots should be demonstrated using key quality attributes.',
          },
        ],
        defaultNext: 'facility_info',
        issueChecks: [
          {
            id: 'insufficient_lot_consistency',
            condition: {
              field: 'lot_to_lot_consistency',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Insufficient Lot-to-Lot Consistency Data',
            message:
              'FDA expects demonstration of manufacturing consistency across multiple lots. Lot-to-lot variability data across critical quality attributes should be provided in the BLA to support process capability.',
            reference: '21 CFR 601.2',
          },
        ],
      },

      {
        id: 'facility_info',
        section: 'manufacturing_process',
        question:
          'Provide details about the manufacturing facility and its FDA inspection status.',
        guidance:
          'Per 21 CFR 600.11 and 42 USC 262(c), the FDA must inspect and approve the manufacturing facility before a BLA can be approved. The pre-approval inspection (PAI) verifies cGMP compliance, facility suitability, and data integrity. Environmental monitoring programs must comply with FDA Guidance for Industry: Sterile Drug Products Produced by Aseptic Processing (2004).',
        fields: [
          {
            id: 'manufacturing_facility_name',
            label: 'Manufacturing Facility Name',
            type: 'text',
            placeholder: 'e.g., Lonza Biologics Inc., Portsmouth, NH',
            required: true,
          },
          {
            id: 'facility_address',
            label: 'Facility Address',
            type: 'textarea',
            required: true,
          },
          {
            id: 'contract_manufacturer',
            label: 'Is This a Contract Manufacturing Organization (CMO)?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'fda_inspection_status',
            label: 'FDA Inspection Status',
            type: 'select',
            required: true,
            options: [
              { value: 'inspected_approved', label: 'Previously Inspected and Approved' },
              { value: 'inspected_pending', label: 'Inspected, Pending Resolution' },
              { value: 'not_inspected', label: 'Not Yet Inspected by FDA' },
              { value: 'pai_scheduled', label: 'Pre-Approval Inspection Scheduled' },
            ],
          },
          {
            id: 'manufacturing_suite_classification',
            label: 'Manufacturing Suite Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'iso_5', label: 'ISO 5 / Grade A (Aseptic Processing)' },
              { value: 'iso_7', label: 'ISO 7 / Grade B' },
              { value: 'iso_8', label: 'ISO 8 / Grade C/D' },
              { value: 'not_classified', label: 'Non-Classified (non-sterile)' },
            ],
          },
          {
            id: 'equipment_qualification',
            label: 'Equipment Qualification Completed (IQ/OQ/PQ)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'environmental_monitoring',
            label: 'Environmental Monitoring Program Established',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 211.42 and FDA Aseptic Processing guidance (2004), an environmental monitoring program for viable and non-viable particulates must be in place.',
          },
        ],
        defaultNext: 'release_testing',
        issueChecks: [
          {
            id: 'facility_not_inspected',
            condition: {
              field: 'fda_inspection_status',
              operator: 'eq',
              value: 'not_inspected',
            },
            severity: 'critical',
            title: 'Manufacturing Facility Not FDA-Inspected',
            message:
              'Per 42 USC 262(c), the FDA must inspect and approve the manufacturing facility before a BLA can be licensed. Pre-approval inspection (PAI) must be scheduled. Plan for at least 6 months lead time.',
            reference: '42 USC 262(c), 21 CFR 600.11',
          },
          {
            id: 'no_environmental_monitoring',
            condition: {
              field: 'environmental_monitoring',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'No Environmental Monitoring Program',
            message:
              'An environmental monitoring program is required for biological product manufacturing per 21 CFR 211.42. The program must include viable and non-viable particulate monitoring in classified areas.',
            reference: '21 CFR 211.42, FDA Aseptic Processing Guidance (2004)',
          },
        ],
      },

      /* ── Analytical Methods & Specifications ──────────────────────── */

      {
        id: 'release_testing',
        section: 'analytical_methods',
        question:
          'Describe your release testing panel and product specifications.',
        guidance:
          'Per 21 CFR 610 and ICH Q6B (Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products), the BLA must include a comprehensive testing panel covering identity, purity, potency, safety (sterility, endotoxin), and general tests. Specifications should be justified based on manufacturing experience, stability data, and clinical lot data.',
        fields: [
          {
            id: 'identity_tests',
            label: 'Identity Tests',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'peptide_map', label: 'Peptide Mapping' },
              { value: 'western_blot', label: 'Western Blot' },
              { value: 'elisa', label: 'ELISA' },
              { value: 'isoelectric_focusing', label: 'Isoelectric Focusing (IEF)' },
              { value: 'mass_spec', label: 'Mass Spectrometry' },
              { value: 'pcr', label: 'PCR-Based Identity' },
              { value: 'sequencing', label: 'DNA/RNA Sequencing' },
            ],
          },
          {
            id: 'purity_tests',
            label: 'Purity Tests',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'se_hplc', label: 'SE-HPLC (Aggregates)' },
              { value: 'ce_sds', label: 'CE-SDS (Fragments)' },
              { value: 'sds_page', label: 'SDS-PAGE' },
              { value: 'hcp', label: 'Host Cell Protein (HCP) ELISA' },
              { value: 'residual_dna', label: 'Residual Host Cell DNA (qPCR)' },
              { value: 'protein_a', label: 'Residual Protein A' },
              { value: 'endotoxin', label: 'Endotoxin (LAL)' },
            ],
          },
          {
            id: 'potency_release_test',
            label: 'Potency Test for Release',
            type: 'select',
            required: true,
            options: [
              { value: 'cell_based_bioassay', label: 'Cell-Based Bioassay' },
              { value: 'binding_assay', label: 'Binding Assay (SPR, ELISA)' },
              { value: 'enzyme_activity', label: 'Enzymatic Activity Assay' },
              { value: 'functional_assay', label: 'Other Functional Assay' },
              { value: 'not_yet_defined', label: 'Not Yet Defined' },
            ],
          },
          {
            id: 'sterility_testing',
            label: 'Sterility Testing Method',
            type: 'select',
            required: true,
            options: [
              { value: 'usp_71', label: 'USP <71> Compendial Sterility Test (14-day)' },
              { value: 'rapid_micro', label: 'Rapid Microbiological Method' },
              { value: 'bactec', label: 'BacT/ALERT or BACTEC' },
            ],
          },
          {
            id: 'reference_standard_program',
            label: 'Reference Standard Program Established',
            type: 'yes_no',
            required: true,
            helpText:
              'A qualified reference standard is required for assay calibration and lot release. The reference standard should be representative of the commercial product and characterized per ICH Q6B.',
          },
          {
            id: 'specification_justification',
            label: 'Specification Justification Approach',
            type: 'select',
            required: true,
            helpText:
              'Per ICH Q6B, specifications should be justified based on data from development, manufacturing, stability, and clinical experience.',
            options: [
              { value: 'clinical_experience', label: 'Clinical Experience (pivotal lot data)' },
              { value: 'manufacturing_capability', label: 'Manufacturing Capability (process data)' },
              { value: 'combination', label: 'Combination (clinical + manufacturing data)' },
              { value: 'not_finalized', label: 'Not Yet Finalized' },
            ],
          },
          {
            id: 'vaccine_lot_release',
            label: 'CBER Lot Release Protocol Prepared',
            type: 'yes_no',
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'vaccine',
            },
            helpText:
              'Per 21 CFR 610.2, certain biologics (vaccines, blood products) require CBER lot release. Samples and protocols must be submitted for each lot before distribution.',
          },
          {
            id: 'adjuvant_characterization',
            label: 'Adjuvant Characterization Complete',
            type: 'yes_no',
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'vaccine',
            },
            helpText:
              'Vaccine adjuvants must be characterized for composition, mechanism of action, and safety profile per FDA Guidance on Clinical Data for Licensure of Seasonal Inactivated Influenza Vaccines.',
          },
        ],
        defaultNext: 'method_validation',
        issueChecks: [
          {
            id: 'no_reference_standard',
            condition: {
              field: 'reference_standard_program',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'No Reference Standard Program',
            message:
              'A qualified reference standard is essential for lot release, stability studies, and method validation. Establish a primary reference standard characterized by orthogonal methods per ICH Q6B.',
            reference: 'ICH Q6B',
          },
        ],
      },

      {
        id: 'method_validation',
        section: 'analytical_methods',
        question:
          'What is the status of analytical method validation for your release and stability-indicating methods?',
        guidance:
          'Per ICH Q2(R2) (Validation of Analytical Procedures) and ICH Q14 (Analytical Procedure Development), all analytical methods used for release testing and stability must be validated for accuracy, precision, specificity, linearity, range, detection limit, quantitation limit, and robustness. Stability-indicating methods must demonstrate the ability to detect product degradation.',
        fields: [
          {
            id: 'method_validation_status',
            label: 'Method Validation Status',
            type: 'select',
            required: true,
            options: [
              { value: 'fully_validated', label: 'All Methods Fully Validated per ICH Q2(R2)' },
              { value: 'partially_validated', label: 'Partially Validated (some methods pending)' },
              { value: 'qualified', label: 'Methods Qualified but Not Yet Validated' },
              { value: 'in_progress', label: 'Validation In Progress' },
            ],
          },
          {
            id: 'stability_indicating_methods',
            label: 'Stability-Indicating Methods Identified',
            type: 'yes_no',
            required: true,
            helpText:
              'Stability-indicating methods must detect degradation pathways (aggregation, fragmentation, deamidation, oxidation) relevant to the product.',
          },
          {
            id: 'stability_study_design',
            label: 'Stability Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'ich_q5c', label: 'Per ICH Q5C (long-term, accelerated, stress)' },
              { value: 'ich_q1a_adapted', label: 'ICH Q1A adapted for biologics' },
              { value: 'in_design', label: 'Stability Program Under Design' },
            ],
            helpText:
              'Per ICH Q5C (Quality of Biotechnological Products: Stability Testing), stability studies for biologics should include real-time/real-condition studies, accelerated studies, and stress studies.',
          },
          {
            id: 'shelf_life_proposed',
            label: 'Proposed Shelf Life',
            type: 'text',
            placeholder: 'e.g., 24 months at 2-8 C',
            required: true,
          },
          {
            id: 'method_transfer_completed',
            label: 'Method Transfer to QC Lab Completed',
            type: 'yes_no',
            helpText:
              'If methods were developed by a different laboratory than the release testing QC lab, method transfer must be documented.',
          },
        ],
        defaultNext: 'adventitious_agents',
        issueChecks: [
          {
            id: 'stability_methods_not_identified',
            condition: {
              field: 'stability_indicating_methods',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Stability-Indicating Methods Not Identified',
            message:
              'Stability-indicating methods must be identified and validated to detect product degradation pathways (aggregation, fragmentation, deamidation, oxidation). Per ICH Q5C, the stability program for biologics must use methods demonstrated to be stability-indicating.',
            reference: 'ICH Q5C, ICH Q2(R2)',
          },
        ],
      },

      /* ── Viral Safety ─────────────────────────────────────────────── */

      {
        id: 'adventitious_agents',
        section: 'viral_safety',
        question:
          'Describe the adventitious agent testing program for your biological product.',
        guidance:
          'Per ICH Q5A(R2) (Viral Safety Evaluation of Biotechnology Products Derived from Cell Lines of Human or Animal Origin), a comprehensive adventitious agent testing strategy is required. This includes testing of cell banks, unprocessed bulk, and viral clearance validation. Testing must cover a broad panel of potential contaminants including retroviruses, non-enveloped and enveloped viruses.',
        fields: [
          {
            id: 'adventitious_agent_testing',
            label: 'Adventitious Agent Testing Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'testing_scope',
            label: 'Testing Scope',
            type: 'multi_select',
            required: true,
            visibleWhen: {
              field: 'adventitious_agent_testing',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'mcb_testing', label: 'Master Cell Bank (MCB) Testing' },
              { value: 'wcb_testing', label: 'Working Cell Bank (WCB) Testing' },
              { value: 'epc_testing', label: 'End of Production Cell (EPC) Testing' },
              { value: 'bulk_harvest', label: 'Unprocessed Bulk / Harvest Testing' },
              { value: 'in_vitro', label: 'In Vitro Adventitious Agent Assay' },
              { value: 'in_vivo', label: 'In Vivo Adventitious Agent Assay' },
              { value: 'pcr_panel', label: 'PCR-Based Virus Panel' },
              { value: 'ngs', label: 'Next-Generation Sequencing (NGS) for Viral Detection' },
            ],
          },
          {
            id: 'retroviral_testing',
            label: 'Retroviral Testing Performed',
            type: 'yes_no',
            required: true,
            helpText:
              'Per ICH Q5A(R2), retroviral testing is mandatory for cell lines of rodent origin (e.g., CHO, Sp2/0, NS0). Include transmission electron microscopy (TEM) and reverse transcriptase (RT) assay or PERT assay on MCB/WCB and EPC.',
          },
          {
            id: 'tse_risk_assessment',
            label: 'TSE/BSE Risk Assessment Completed',
            type: 'yes_no',
            required: true,
            helpText:
              'Per EMEA/410/01 Rev.3 and FDA guidance on Bovine-Derived Materials, assess the risk of Transmissible Spongiform Encephalopathy (TSE) from any animal-derived raw materials used in manufacturing.',
          },
          {
            id: 'animal_origin_materials',
            label: 'Raw Materials of Animal Origin',
            type: 'textarea',
            placeholder:
              'e.g., Bovine serum albumin (BSA) sourced from New Zealand; porcine trypsin used in cell dissociation.',
            helpText:
              'List all raw materials of animal origin with source country, species, and tissue type.',
          },
        ],
        defaultNext: 'viral_clearance',
        issueChecks: [
          {
            id: 'no_adventitious_agent_testing',
            condition: {
              field: 'adventitious_agent_testing',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'No Adventitious Agent Testing',
            message:
              'Adventitious agent testing is required per ICH Q5A(R2). Cell banks, unprocessed bulk, and raw materials must be tested for viral, mycoplasma, and other adventitious agents. This is a mandatory BLA requirement.',
            reference: 'ICH Q5A(R2)',
          },
        ],
      },

      {
        id: 'viral_clearance',
        section: 'viral_safety',
        question:
          'Describe the viral clearance validation studies for your purification process.',
        guidance:
          'Per ICH Q5A(R2), viral clearance validation must demonstrate that the manufacturing process can effectively remove and/or inactivate a range of viruses with different physicochemical properties (enveloped/non-enveloped, DNA/RNA, large/small). Studies should use relevant and model viruses. The overall viral clearance capacity should provide an adequate safety margin.',
        fields: [
          {
            id: 'viral_clearance_studies_completed',
            label: 'Viral Clearance Validation Studies Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'dedicated_viral_clearance_steps',
            label: 'Dedicated Viral Clearance Steps',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'low_ph_inactivation', label: 'Low pH Viral Inactivation' },
              { value: 'solvent_detergent', label: 'Solvent-Detergent Treatment' },
              { value: 'nanofiltration', label: 'Virus Filtration (20nm nanofiltration)' },
              { value: 'uv_inactivation', label: 'UV-C Inactivation' },
              { value: 'heat_inactivation', label: 'Heat Inactivation / Pasteurization' },
              { value: 'none', label: 'No Dedicated Viral Clearance Steps' },
            ],
          },
          {
            id: 'model_viruses_tested',
            label: 'Model Viruses Used in Clearance Studies',
            type: 'multi_select',
            visibleWhen: {
              field: 'viral_clearance_studies_completed',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'murine_leukemia', label: 'Murine Leukemia Virus (MuLV) - Enveloped retrovirus' },
              { value: 'pseudorabies', label: 'Pseudorabies Virus (PRV) - Large enveloped DNA' },
              { value: 'reovirus', label: 'Reovirus Type 3 - Non-enveloped RNA' },
              { value: 'mvm', label: 'Minute Virus of Mice (MVM) - Small non-enveloped DNA' },
              { value: 'porcine_parvo', label: 'Porcine Parvovirus (PPV)' },
              { value: 'sindbis', label: 'Sindbis Virus' },
              { value: 'xmulv', label: 'Xenotropic MuLV (XMuLV)' },
            ],
          },
          {
            id: 'overall_log_reduction',
            label: 'Overall Log Reduction Value (LRV)',
            type: 'text',
            placeholder: 'e.g., >18 log10 for enveloped viruses, >12 log10 for non-enveloped',
            visibleWhen: {
              field: 'viral_clearance_studies_completed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'virus_filtration_validated',
            label: 'Virus Filtration Step Validated',
            type: 'yes_no',
            helpText:
              'Per ICH Q5A(R2), virus filtration using 20nm filters should be validated for filter integrity, process parameters, and log reduction value. Demonstrate no impact on product quality.',
          },
        ],
        defaultNext: 'immunogenicity_risk',
        issueChecks: [
          {
            id: 'no_viral_clearance',
            condition: {
              field: 'viral_clearance_studies_completed',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'No Viral Clearance Validation Studies',
            message:
              'Viral clearance validation is required per ICH Q5A(R2). The purification process must demonstrate effective removal/inactivation of relevant and model viruses covering different physicochemical properties. This is a mandatory BLA requirement for products derived from cell lines.',
            reference: 'ICH Q5A(R2)',
          },
        ],
      },

      /* ── Immunogenicity ───────────────────────────────────────────── */

      {
        id: 'immunogenicity_risk',
        section: 'immunogenicity_section',
        question:
          'What is the immunogenicity risk profile of your biological product, and has a risk assessment been conducted?',
        guidance:
          'Per FDA Guidance: Immunogenicity Assessment for Therapeutic Protein Products (2014) and FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibodies (2019), a risk-based approach to immunogenicity assessment is expected. Risk factors include product-related (sequence, aggregates, glycosylation), patient-related (immune status, concomitant meds), and treatment-related (route, dose, duration) factors.',
        fields: [
          {
            id: 'immunogenicity_risk_assessment',
            label: 'Immunogenicity Risk Assessment Performed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'immunogenicity_risk_level',
            label: 'Immunogenicity Risk Level',
            type: 'select',
            required: true,
            visibleWhen: {
              field: 'immunogenicity_risk_assessment',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'low', label: 'Low (fully human, no endogenous counterpart concerns)' },
              { value: 'moderate', label: 'Moderate (humanized, some risk factors present)' },
              { value: 'high', label: 'High (chimeric, novel target, immunomodulatory)' },
            ],
          },
          {
            id: 'product_risk_factors',
            label: 'Product-Related Risk Factors',
            type: 'multi_select',
            options: [
              { value: 'non_human_sequences', label: 'Non-Human Sequences (chimeric/murine)' },
              { value: 'aggregation_propensity', label: 'Aggregation Propensity' },
              { value: 'novel_modifications', label: 'Novel Post-Translational Modifications' },
              { value: 'pegylation', label: 'PEGylation (anti-PEG antibodies)' },
              { value: 'novel_excipients', label: 'Novel Excipients' },
              { value: 'adc_linker', label: 'ADC Linker/Payload Immunogenicity' },
            ],
          },
          {
            id: 'endogenous_counterpart',
            label: 'Is There an Endogenous Counterpart?',
            type: 'yes_no',
            helpText:
              'Products with endogenous counterparts (e.g., erythropoietin, Factor VIII) pose additional risk of cross-reactive antibodies that can neutralize the endogenous protein, leading to serious clinical consequences.',
          },
          {
            id: 'immunogenicity_risk_mitigation',
            label: 'Risk Mitigation Strategies',
            type: 'multi_select',
            options: [
              { value: 'humanization', label: 'Humanization / Fully Human Framework' },
              { value: 'deimmunization', label: 'T-Cell Epitope Removal / Deimmunization' },
              { value: 'formulation', label: 'Formulation Optimization (minimize aggregates)' },
              { value: 'tolerization', label: 'Immune Tolerization Protocol' },
              { value: 'premedication', label: 'Premedication Regimen' },
              { value: 'sc_delivery', label: 'Optimized SC Delivery (reduced injection site reactions)' },
            ],
          },
        ],
        defaultNext: 'ada_strategy',
        issueChecks: [
          {
            id: 'no_immunogenicity_assessment',
            condition: {
              field: 'immunogenicity_risk_assessment',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'No Immunogenicity Risk Assessment',
            message:
              'An immunogenicity risk assessment is required per FDA Guidance on Immunogenicity Assessment for Therapeutic Protein Products (2014). Risk factors must be identified and a risk-based assay strategy developed. Immunogenicity data are a key component of the BLA clinical review.',
            reference: 'FDA Guidance: Immunogenicity Assessment for Therapeutic Protein Products (2014)',
          },
        ],
      },

      {
        id: 'ada_strategy',
        section: 'immunogenicity_section',
        question:
          'Describe your anti-drug antibody (ADA) assay strategy and clinical immunogenicity results.',
        guidance:
          'Per FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibodies (2019), a multi-tiered ADA testing strategy is required: screening assay, confirmatory assay, and neutralizing antibody (NAb) assay. Assays must be validated for sensitivity, specificity, drug tolerance, and cut point. Clinical immunogenicity data must include incidence, titers, and impact on PK, efficacy, and safety.',
        fields: [
          {
            id: 'ada_assay_format',
            label: 'ADA Screening Assay Format',
            type: 'select',
            required: true,
            options: [
              { value: 'bridging_ecl', label: 'Bridging ECL (MSD)' },
              { value: 'bridging_elisa', label: 'Bridging ELISA' },
              { value: 'spr', label: 'Surface Plasmon Resonance (SPR)' },
              { value: 'acidity_dissociation', label: 'Acid Dissociation ECL' },
              { value: 'other_format', label: 'Other' },
            ],
          },
          {
            id: 'confirmatory_assay',
            label: 'Confirmatory Assay Developed',
            type: 'yes_no',
            required: true,
            helpText:
              'A confirmatory assay (typically drug competition) must distinguish true ADA-positive from false-positive screening results.',
          },
          {
            id: 'nab_assay',
            label: 'Neutralizing Antibody (NAb) Assay Developed',
            type: 'yes_no',
            required: true,
            helpText:
              'Per FDA 2019 guidance, a NAb assay is required to determine if ADA neutralize the biological activity of the therapeutic protein. Cell-based NAb assays are preferred over competitive ligand-binding assays.',
          },
          {
            id: 'nab_assay_type',
            label: 'NAb Assay Type',
            type: 'select',
            visibleWhen: {
              field: 'nab_assay',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'cell_based', label: 'Cell-Based NAb Assay' },
              { value: 'competitive_ligand_binding', label: 'Competitive Ligand-Binding Assay' },
            ],
          },
          {
            id: 'ada_incidence',
            label: 'Clinical ADA Incidence',
            type: 'text',
            placeholder: 'e.g., Treatment-emergent ADA: 5.2% (23/442 patients)',
          },
          {
            id: 'nab_incidence',
            label: 'Clinical NAb Incidence',
            type: 'text',
            placeholder: 'e.g., NAb-positive among ADA-positive: 2.1% (9/442 patients)',
          },
          {
            id: 'ada_impact_on_pk',
            label: 'Impact of ADA on PK',
            type: 'textarea',
            placeholder:
              'e.g., NAb-positive patients showed 30% lower trough concentrations at steady state. No significant impact on exposure in ADA-positive/NAb-negative patients.',
          },
          {
            id: 'ada_impact_on_efficacy',
            label: 'Impact of ADA on Efficacy',
            type: 'textarea',
            placeholder:
              'e.g., No difference in ORR between ADA-positive and ADA-negative patients (p=0.72).',
          },
          {
            id: 'ada_impact_on_safety',
            label: 'Impact of ADA on Safety (Hypersensitivity, Infusion Reactions)',
            type: 'textarea',
            placeholder:
              'e.g., Higher rate of infusion-related reactions in ADA-positive patients (8.7% vs 2.1%).',
          },
        ],
        defaultNext: 'clinical_efficacy',
        provideExpertFeedback: true,
      },

      /* ── Clinical Data Package ────────────────────────────────────── */

      {
        id: 'clinical_efficacy',
        section: 'clinical_data',
        question:
          'Describe the pivotal clinical efficacy data supporting this BLA.',
        guidance:
          'Per 21 CFR 601.12 and ICH E9 (Statistical Principles for Clinical Trials), the BLA must include adequate and well-controlled studies demonstrating clinical efficacy. For accelerated approval under 21 CFR 601 Subpart E, efficacy may be based on a surrogate endpoint reasonably likely to predict clinical benefit, with a requirement for post-marketing confirmatory studies.',
        fields: [
          {
            id: 'number_of_pivotal_studies',
            label: 'Number of Pivotal Studies',
            type: 'number',
            required: true,
            validation: { min: 1 },
            placeholder: 'e.g., 2',
          },
          {
            id: 'pivotal_study_design',
            label: 'Pivotal Study Design(s)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Phase 3, randomized, double-blind, placebo-controlled, multicenter study in patients with HER2+ metastatic breast cancer. N=800, 1:1 randomization.',
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Endpoint(s)',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Overall Survival (OS); Progression-Free Survival (PFS) per RECIST 1.1 by independent central review.',
          },
          {
            id: 'primary_endpoint_met',
            label: 'Primary Endpoint Met',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'surrogate_endpoint_used',
            label: 'Surrogate Endpoint Used for Accelerated Approval',
            type: 'yes_no',
            visibleWhen: {
              field: 'accelerated_approval_pathway',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'surrogate_endpoint_justification',
            label: 'Surrogate Endpoint Justification',
            type: 'textarea',
            placeholder:
              'e.g., ORR is an established surrogate endpoint for accelerated approval in oncology per FDA Guidance on Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics (2018).',
            visibleWhen: {
              field: 'surrogate_endpoint_used',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'confirmatory_study_planned',
            label: 'Post-Marketing Confirmatory Study Planned',
            type: 'yes_no',
            visibleWhen: {
              field: 'surrogate_endpoint_used',
              operator: 'eq',
              value: true,
            },
            helpText:
              'Per 21 CFR 601 Subpart E, accelerated approval requires post-marketing confirmatory studies to verify clinical benefit. Under the Accelerated Approval Integrity Act (2023), FDA has enhanced authority to require and enforce these commitments.',
          },
          {
            id: 'gene_therapy_long_term_followup',
            label: 'Long-Term Follow-Up Plan (Gene Therapy)',
            type: 'select',
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'gene_therapy',
            },
            helpText:
              'Per FDA Guidance: Long Term Follow-Up After Administration of a Gene Therapy Product (2020), long-term follow-up of up to 15 years is recommended for integrating vectors and up to 5 years for non-integrating vectors.',
            options: [
              { value: '15_years', label: '15 Years (integrating vector)' },
              { value: '5_years', label: '5 Years (non-integrating vector)' },
              { value: 'not_planned', label: 'Not Yet Planned' },
            ],
          },
        ],
        defaultNext: 'clinical_safety',
        issueChecks: [
          {
            id: 'gene_therapy_no_followup',
            condition: {
              field: 'gene_therapy_long_term_followup',
              operator: 'eq',
              value: 'not_planned',
            },
            severity: 'critical',
            title: 'Gene Therapy Without Long-Term Follow-Up Plan',
            message:
              'Per FDA Guidance: Long Term Follow-Up After Administration of a Gene Therapy Product (2020), long-term follow-up is required: up to 15 years for integrating vectors (lentiviral, retroviral) and 5 years for non-integrating vectors (AAV). Failure to plan long-term follow-up will delay BLA approval.',
            reference: 'FDA Guidance: Long Term Follow-Up After Administration of a Gene Therapy Product (2020)',
          },
        ],
      },

      {
        id: 'clinical_safety',
        section: 'clinical_data',
        question:
          'Describe the integrated safety database and key safety findings for your biological product.',
        guidance:
          'Per ICH E1 (Extent of Population Exposure to Assess Clinical Safety) and FDA Pre-Marketing Risk Assessment guidance, the integrated safety database for a BLA should include exposure from all clinical studies. For biologics, particular attention should be paid to immunogenicity-related adverse events, infusion/injection reactions, autoimmunity signals, and infections (for immunomodulatory products).',
        fields: [
          {
            id: 'total_patients_exposed',
            label: 'Total Patients Exposed to Product',
            type: 'number',
            required: true,
            placeholder: 'e.g., 2500',
            validation: { min: 1 },
          },
          {
            id: 'patients_exposed_6months',
            label: 'Patients with 6+ Months Exposure',
            type: 'number',
            placeholder: 'e.g., 1800',
          },
          {
            id: 'patients_exposed_12months',
            label: 'Patients with 12+ Months Exposure',
            type: 'number',
            placeholder: 'e.g., 1200',
          },
          {
            id: 'immunogenicity_related_aes',
            label: 'Immunogenicity-Related AEs Observed',
            type: 'yes_no',
            required: true,
            helpText:
              'Include infusion reactions, injection site reactions, hypersensitivity, anaphylaxis, serum sickness, and autoimmune events potentially related to ADA.',
          },
          {
            id: 'immunogenicity_ae_description',
            label: 'Description of Immunogenicity-Related AEs',
            type: 'textarea',
            placeholder:
              'e.g., Infusion-related reactions occurred in 12% of patients (Grade 1-2: 10%, Grade 3: 2%). Anaphylaxis in 0.3% (3 events).',
            visibleWhen: {
              field: 'immunogenicity_related_aes',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'autoimmunity_signals',
            label: 'Autoimmunity Signals Detected',
            type: 'yes_no',
            helpText:
              'For immunomodulatory biologics, monitor for immune-related adverse events (irAEs) including autoimmune hepatitis, colitis, pneumonitis, endocrinopathies, and dermatologic events.',
          },
          {
            id: 'crs_management',
            label: 'Cytokine Release Syndrome (CRS) Management Plan',
            type: 'select',
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'cell_therapy',
            },
            helpText:
              'Per FDA Guidance: Considerations for the Development of Chimeric Antigen Receptor (CAR) T Cell Products (2022), a CRS grading scale (e.g., ASTCT consensus) and management algorithm are required.',
            options: [
              { value: 'astct_grading', label: 'ASTCT Consensus Grading with Tocilizumab/Corticosteroids' },
              { value: 'custom_algorithm', label: 'Custom Management Algorithm' },
              { value: 'not_developed', label: 'Not Yet Developed' },
            ],
          },
          {
            id: 'icans_management',
            label: 'ICANS (Immune Effector Cell-Associated Neurotoxicity) Management',
            type: 'yes_no',
            visibleWhen: {
              field: 'product_type',
              operator: 'eq',
              value: 'cell_therapy',
            },
            helpText:
              'ICANS grading per ASTCT consensus and management protocol (corticosteroids, supportive care) must be defined for CAR-T products.',
          },
          {
            id: 'long_term_safety_followup',
            label: 'Long-Term Safety Follow-Up Duration',
            type: 'text',
            placeholder: 'e.g., Minimum 2 years post-treatment for all pivotal study patients',
          },
        ],
        defaultNext: 'clinical_pharmacology',
        issueChecks: [
          {
            id: 'car_t_no_crs_management',
            condition: {
              field: 'crs_management',
              operator: 'eq',
              value: 'not_developed',
            },
            severity: 'critical',
            title: 'CAR-T Without CRS Management Plan',
            message:
              'Per FDA CAR-T guidance (2022), a CRS management plan using a validated grading scale (ASTCT consensus) with clear intervention thresholds for tocilizumab and corticosteroids is required. CRS is a life-threatening toxicity that must be proactively managed.',
            reference: 'FDA Guidance: Considerations for the Development of CAR T Cell Products (2022)',
          },
        ],
      },

      {
        id: 'clinical_pharmacology',
        section: 'clinical_data',
        question:
          'Describe the clinical pharmacology characterization of your biological product.',
        guidance:
          'Per FDA Guidance on Clinical Pharmacology Data to Support a Demonstration of Biosimilarity (2014) and ICH M3(R2), PK characterization for biologics differs from small molecules. Target-mediated drug disposition (TMDD), dose-dependent PK, and immunogenicity effects on PK are common. Drug-drug interaction (DDI) studies are generally not required for biologics unless the product modulates cytokine levels that could affect CYP enzymes (e.g., IL-6 inhibitors per FDA DDI guidance).',
        fields: [
          {
            id: 'pk_characterization',
            label: 'PK Characterization Status',
            type: 'select',
            required: true,
            options: [
              { value: 'fully_characterized', label: 'Fully Characterized (absorption, distribution, metabolism, elimination)' },
              { value: 'partially_characterized', label: 'Partially Characterized' },
              { value: 'in_progress', label: 'PK Studies In Progress' },
            ],
          },
          {
            id: 'target_mediated_disposition',
            label: 'Target-Mediated Drug Disposition (TMDD) Observed',
            type: 'yes_no',
            helpText:
              'TMDD is common for monoclonal antibodies and results in nonlinear PK at low doses. This affects dose selection and dosing regimen optimization.',
          },
          {
            id: 'dose_selection_rationale',
            label: 'Dose Selection Rationale',
            type: 'textarea',
            required: true,
            placeholder:
              'e.g., Exposure-response analysis identified EC90 at 10 mg/kg Q3W. Flat dose of 840 mg selected based on population PK modeling showing <30% variability in exposure.',
          },
          {
            id: 'exposure_response_analysis',
            label: 'Exposure-Response Analysis Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'special_populations',
            label: 'Special Population PK Assessed',
            type: 'multi_select',
            options: [
              { value: 'hepatic', label: 'Hepatic Impairment' },
              { value: 'renal', label: 'Renal Impairment' },
              { value: 'elderly', label: 'Elderly (>65 years)' },
              { value: 'pediatric', label: 'Pediatric' },
              { value: 'body_weight', label: 'Body Weight Effects' },
              { value: 'race_ethnicity', label: 'Race/Ethnicity' },
            ],
            helpText:
              'For biologics, hepatic and renal impairment studies are generally not required (unlike small molecules) unless the product is cleared through these organs. Population PK analysis is the preferred approach.',
          },
          {
            id: 'immunomodulatory_ddi',
            label: 'Immunomodulatory DDI Assessment Required',
            type: 'yes_no',
            helpText:
              'Per FDA DDI guidance, biologics that modulate cytokines (e.g., IL-6 inhibitors, TNF inhibitors) may affect CYP450 enzyme activity and require DDI assessment for co-administered narrow therapeutic index drugs (e.g., warfarin, cyclosporine).',
          },
        ],
        branches: [
          {
            when: { field: 'bla_type', operator: 'eq', value: '351k_biosimilar' },
            goto: 'analytical_similarity',
          },
        ],
        defaultNext: 'biologic_labeling',
      },

      /* ── Biosimilar-Specific ──────────────────────────────────────── */

      {
        id: 'analytical_similarity',
        section: 'biosimilar_specific',
        question:
          'Describe the analytical similarity assessment comparing your proposed biosimilar to the reference product.',
        guidance:
          'Per FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015) and FDA Guidance: Development of Therapeutic Protein Biosimilars: Comparative Analytical Assessment and Other Quality-Related Considerations (2019), analytical similarity is the foundation of the 351(k) application. The FDA statistical tiered approach includes: Tier 1 (equivalence testing for most critical attributes), Tier 2 (quality range approach), and Tier 3 (raw data comparison). A fingerprint-like analytical similarity assessment using orthogonal state-of-the-art methods is expected.',
        fields: [
          {
            id: 'reference_product_lots_analyzed',
            label: 'Number of Reference Product Lots Analyzed',
            type: 'number',
            required: true,
            placeholder: 'e.g., 10',
            validation: { min: 1 },
            helpText:
              'FDA expects analysis of multiple lots (typically 10+) of the reference product (US-licensed) to establish the variability range.',
          },
          {
            id: 'non_us_reference_used',
            label: 'Non-US Reference Product Included in Bridging',
            type: 'yes_no',
            helpText:
              'If a non-US reference product (EU or Japan) was used in clinical studies, analytical bridging to the US-licensed reference product is required per FDA guidance.',
          },
          {
            id: 'tier1_attributes',
            label: 'Tier 1 (Equivalence Testing) Attributes',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'potency', label: 'Potency / Biological Activity' },
              { value: 'protein_content', label: 'Protein Content' },
              { value: 'binding_affinity', label: 'Target Binding Affinity' },
              { value: 'fc_function', label: 'Fc Effector Function' },
              { value: 'glycosylation', label: 'Glycosylation Profile' },
            ],
          },
          {
            id: 'functional_assays',
            label: 'Functional Assays Performed',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'target_binding', label: 'Target Antigen Binding (SPR/ELISA)' },
              { value: 'receptor_binding', label: 'Receptor Binding Assays' },
              { value: 'adcc', label: 'ADCC Bioassay' },
              { value: 'cdc', label: 'CDC Bioassay' },
              { value: 'adcp', label: 'ADCP Bioassay' },
              { value: 'neutralization', label: 'Neutralization Assay' },
              { value: 'fcrn', label: 'FcRn Binding' },
              { value: 'apoptosis', label: 'Apoptosis Assay' },
            ],
          },
          {
            id: 'analytical_similarity_conclusion',
            label: 'Overall Analytical Similarity Conclusion',
            type: 'select',
            required: true,
            options: [
              { value: 'highly_similar', label: 'Highly Similar (no clinically meaningful differences)' },
              { value: 'similar_with_residual_uncertainty', label: 'Similar with Some Residual Uncertainty' },
              { value: 'differences_identified', label: 'Differences Identified Requiring Additional Data' },
            ],
          },
        ],
        defaultNext: 'clinical_bridging',
      },

      {
        id: 'clinical_bridging',
        section: 'biosimilar_specific',
        question:
          'Describe the clinical studies conducted to support biosimilarity.',
        guidance:
          'Per FDA Guidance: Clinical Pharmacology Data to Support a Demonstration of Biosimilarity to a Reference Product (2014), a comparative PK study is typically the first clinical study in the biosimilar development program. Depending on residual uncertainty from analytical and functional studies, additional clinical studies (efficacy/safety endpoints) may be needed. For interchangeability designation per 42 USC 262(k)(4), a switching study demonstrating no diminished safety or efficacy is required.',
        fields: [
          {
            id: 'pk_similarity_study',
            label: 'Comparative PK Similarity Study Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pk_similarity_design',
            label: 'PK Study Design',
            type: 'textarea',
            placeholder:
              'e.g., Single-dose, randomized, double-blind, two-way crossover PK study in healthy volunteers (N=200). Primary PK endpoints: AUC0-inf and Cmax with 80-125% equivalence margins.',
            visibleWhen: {
              field: 'pk_similarity_study',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'pk_equivalence_met',
            label: 'PK Equivalence Criteria Met (80-125% for AUC and Cmax)',
            type: 'yes_no',
            visibleWhen: {
              field: 'pk_similarity_study',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'clinical_endpoint_study',
            label: 'Comparative Clinical Endpoint Study Conducted',
            type: 'yes_no',
            helpText:
              'A clinical endpoint study may be needed if residual uncertainty remains from analytical, functional, and PK data. The study should use a sensitive clinical model and appropriate endpoints.',
          },
          {
            id: 'clinical_endpoint_study_design',
            label: 'Clinical Endpoint Study Design',
            type: 'textarea',
            placeholder:
              'e.g., Randomized, double-blind, parallel-group study in patients with RA (N=600). Primary endpoint: ACR20 at Week 24. Equivalence margin: +/-15%.',
            visibleWhen: {
              field: 'clinical_endpoint_study',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'immunogenicity_comparison',
            label: 'Comparative Immunogenicity Data Available',
            type: 'yes_no',
            required: true,
            helpText:
              'Immunogenicity comparison between the proposed biosimilar and the reference product is expected to be assessed in clinical studies.',
          },
          {
            id: 'interchangeability_sought',
            label: 'Seeking Interchangeability Designation',
            type: 'yes_no',
          },
          {
            id: 'switching_study_design',
            label: 'Switching Study Design',
            type: 'textarea',
            placeholder:
              'e.g., Randomized, double-blind, multiple-switch study. Patients switch 3 times between biosimilar and reference product over 12 months. Assess PK, safety, immunogenicity, and efficacy at each switch.',
            visibleWhen: {
              field: 'interchangeability_sought',
              operator: 'eq',
              value: true,
            },
            helpText:
              'Per 42 USC 262(k)(4) and FDA Guidance: Considerations in Demonstrating Interchangeability With a Reference Product (2019), interchangeability requires data from a switching study showing no diminished safety or efficacy.',
          },
        ],
        defaultNext: 'biologic_labeling',
        issueChecks: [
          {
            id: 'biosimilar_no_pk_similarity',
            condition: {
              field: 'pk_similarity_study',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Biosimilar Without PK Similarity Study',
            message:
              'A comparative PK similarity study is typically expected as part of the 351(k) clinical data package. While not always required if analytical similarity is exceptionally strong, FDA expects a justification for waiving PK studies per the totality-of-evidence framework.',
            reference: 'FDA Guidance: Clinical Pharmacology Data to Support a Demonstration of Biosimilarity (2014)',
          },
        ],
      },

      /* ── Labeling & REMS ──────────────────────────────────────────── */

      {
        id: 'biologic_labeling',
        section: 'labeling_rems',
        question:
          'Describe the proposed labeling for your biological product.',
        guidance:
          'Per 21 CFR 201 and 21 CFR 610.60-610.68, biologics labeling has specific requirements. For biosimilars, per FDA Guidance: Labeling for Biosimilar Products (2018), the label should reflect the reference product label with modifications specific to the biosimilar (e.g., nonproprietary name with suffix, biosimilar-specific statements). Interchangeable products receive additional labeling designations. Immunogenicity data presentation in labeling follows FDA recommendations.',
        fields: [
          {
            id: 'labeling_status',
            label: 'Labeling Development Status',
            type: 'select',
            required: true,
            options: [
              { value: 'draft_complete', label: 'Draft USPI Complete' },
              { value: 'in_development', label: 'In Development' },
              { value: 'fda_negotiation', label: 'In FDA Negotiation' },
              { value: 'not_started', label: 'Not Started' },
            ],
          },
          {
            id: 'biosimilar_suffix',
            label: 'Proposed Nonproprietary Name Suffix',
            type: 'text',
            placeholder: 'e.g., -xxxx (four lowercase letters)',
            visibleWhen: {
              field: 'bla_type',
              operator: 'eq',
              value: '351k_biosimilar',
            },
            helpText:
              'Per FDA Guidance: Nonproprietary Naming of Biological Products (2017), biosimilars must include a four-letter suffix appended to the core name (e.g., trastuzumab-dkst).',
          },
          {
            id: 'interchangeability_labeling',
            label: 'Interchangeability Statement Included',
            type: 'yes_no',
            visibleWhen: {
              field: 'interchangeability_sought',
              operator: 'eq',
              value: true,
            },
            helpText:
              'Per 42 USC 262(k)(4), interchangeable products may be substituted for the reference product without prescriber intervention. The label must include this designation.',
          },
          {
            id: 'immunogenicity_labeling',
            label: 'Immunogenicity Data Included in Label',
            type: 'yes_no',
            required: true,
            helpText:
              'Per FDA 2019 immunogenicity guidance, the Adverse Reactions section should include immunogenicity rates, and the Clinical Pharmacology section should discuss the impact of ADA on PK.',
          },
          {
            id: 'medication_guide_required',
            label: 'Medication Guide Required',
            type: 'yes_no',
            helpText:
              'Per 21 CFR 208, a Medication Guide is required when FDA determines the drug product poses a serious and significant public health concern.',
          },
        ],
        defaultNext: 'rems_requirements',
      },

      {
        id: 'rems_requirements',
        section: 'labeling_rems',
        question:
          'Does your biological product require a Risk Evaluation and Mitigation Strategy (REMS)?',
        guidance:
          'Per 21 CFR 314.520 and Section 505-1 of the FD&C Act (as applied to biologics via Section 351(j) of the PHS Act), FDA may require a REMS if necessary to ensure the benefits outweigh the risks. Common REMS elements for biologics include Medication Guides, communication plans, Elements to Assure Safe Use (ETASU), and implementation systems. For biosimilars, the REMS requirement must be evaluated independently from the reference product.',
        fields: [
          {
            id: 'rems_required',
            label: 'REMS Anticipated or Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'rems_elements',
            label: 'Proposed REMS Elements',
            type: 'multi_select',
            visibleWhen: {
              field: 'rems_required',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'communication_plan', label: 'Communication Plan' },
              { value: 'etasu', label: 'Elements to Assure Safe Use (ETASU)' },
              { value: 'implementation_system', label: 'Implementation System' },
              { value: 'timetable', label: 'Timetable for Assessment' },
            ],
          },
          {
            id: 'rems_for_high_risk',
            label: 'High-Risk Biologic Justification for No REMS',
            type: 'textarea',
            placeholder:
              'e.g., Risk is adequately managed through labeling, prescriber education, and existing clinical practice guidelines.',
            visibleWhen: {
              field: 'rems_required',
              operator: 'eq',
              value: false,
            },
            helpText:
              'For high-risk biologics (e.g., cell therapies, gene therapies), document why a REMS is not warranted if not proposed.',
          },
          {
            id: 'shared_rems',
            label: 'Shared REMS with Reference Product (Biosimilar)',
            type: 'yes_no',
            visibleWhen: {
              field: 'bla_type',
              operator: 'eq',
              value: '351k_biosimilar',
            },
            helpText:
              'Per BPCIA, biosimilar applicants may be required to participate in a shared REMS with the reference product holder.',
          },
        ],
        defaultNext: 'post_marketing_commitments',
        issueChecks: [
          {
            id: 'no_rems_high_risk',
            condition: {
              field: 'rems_required',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'No REMS for Potentially High-Risk Biologic',
            message:
              'For gene therapies, cell therapies (CAR-T), and other high-risk biologics, FDA commonly requires REMS with ETASU (e.g., certified healthcare facility, trained prescribers). Ensure you have documented justification for why REMS is not needed, or be prepared for FDA to mandate one during review.',
            reference: 'Section 505-1 of the FD&C Act, 351(j) PHS Act',
          },
        ],
      },

      /* ── Post-Marketing ───────────────────────────────────────────── */

      {
        id: 'post_marketing_commitments',
        section: 'post_marketing',
        question:
          'What post-marketing commitments and Phase 4 studies are planned or anticipated?',
        guidance:
          'Per 21 CFR 601.14 (post-marketing studies) and 21 CFR 601 Subpart E (accelerated approval post-marketing requirements), post-marketing commitments may include confirmatory studies, additional safety studies, pediatric studies (per Pediatric Research Equity Act), and manufacturing commitments. For biologics approved under accelerated approval, the Accelerated Approval Integrity Act (2023) strengthens FDA authority to require timely completion of confirmatory studies.',
        fields: [
          {
            id: 'post_marketing_commitments_planned',
            label: 'Post-Marketing Commitments Anticipated',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'phase_4_studies',
            label: 'Phase 4 Studies Planned',
            type: 'textarea',
            placeholder:
              'e.g., Long-term safety registry (5 years, 10,000 patients). Confirmatory Phase 4 study if accelerated approval. Pediatric study per PREA.',
            visibleWhen: {
              field: 'post_marketing_commitments_planned',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'lot_release_protocol',
            label: 'Lot Release Protocol Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 610.2, certain biologics (vaccines, blood products, allergenic products) require CBER lot release. Manufacturer must submit samples and release protocols for each lot before distribution.',
          },
          {
            id: 'annual_report',
            label: 'Annual Report Plan',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 601.12(f)(4) and 21 CFR 314.81(b)(2), BLA holders must submit annual reports including distribution data, labeling changes, and manufacturing changes within 60 days of the anniversary of the approval date.',
          },
          {
            id: 'pediatric_studies',
            label: 'Pediatric Studies Required (PREA)',
            type: 'yes_no',
            helpText:
              'Per the Pediatric Research Equity Act (PREA) codified at 21 USC 355c, BLA applicants must submit pediatric study plans unless a waiver or deferral is granted.',
          },
        ],
        defaultNext: 'pharmacovigilance',
      },

      {
        id: 'pharmacovigilance',
        section: 'post_marketing',
        question:
          'Describe the pharmacovigilance plan for post-marketing safety surveillance.',
        guidance:
          'Per 21 CFR 600.80 (expedited safety reports for biological products) and ICH E2E (Pharmacovigilance Planning), a pharmacovigilance plan must describe the safety specification, pharmacovigilance activities, and risk minimization activities. For biologics, the plan should address immunogenicity monitoring, product traceability (per FDA Guidance on Product Traceability for Biological Products, 2020), and signals specific to the biological product class.',
        fields: [
          {
            id: 'pharmacovigilance_plan',
            label: 'Pharmacovigilance Plan Developed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'safety_specification',
            label: 'Safety Specification Identified',
            type: 'multi_select',
            options: [
              { value: 'identified_risks', label: 'Identified Risks' },
              { value: 'potential_risks', label: 'Potential Risks' },
              { value: 'missing_information', label: 'Missing Information (populations, long-term)' },
            ],
          },
          {
            id: 'pbrer_psur_plan',
            label: 'PBRER/PSUR Submission Plan',
            type: 'yes_no',
            helpText:
              'Per ICH E2C(R2), Periodic Benefit-Risk Evaluation Reports (PBRERs) are expected for ongoing safety evaluation. DSUR is required during development.',
          },
          {
            id: 'product_traceability',
            label: 'Product Traceability System Established',
            type: 'yes_no',
            helpText:
              'Per FDA Guidance (2020), biologics must maintain traceability to the individual lot level to facilitate rapid safety signal investigation and recall if needed.',
          },
          {
            id: 'rems_assessment_schedule',
            label: 'REMS Assessment Schedule',
            type: 'text',
            placeholder: 'e.g., REMS assessment at 18 months, 3 years, and 7 years post-approval',
            visibleWhen: {
              field: 'rems_required',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'signal_detection_plan',
            label: 'Signal Detection Activities',
            type: 'multi_select',
            options: [
              { value: 'spontaneous_reports', label: 'Spontaneous Adverse Event Reports (FAERS)' },
              { value: 'registry', label: 'Patient Registry' },
              { value: 'sentinel', label: 'FDA Sentinel System Queries' },
              { value: 'literature', label: 'Literature Monitoring' },
              { value: 'active_surveillance', label: 'Active Post-Marketing Surveillance Study' },
            ],
          },
        ],
        defaultNext: 'pre_bla_meeting',
      },

      /* ── Submission Strategy ──────────────────────────────────────── */

      {
        id: 'pre_bla_meeting',
        section: 'submission_strategy',
        question:
          'Have you had a Pre-BLA meeting with FDA, and what is your overall submission strategy?',
        guidance:
          'Per 21 CFR 312.47 and FDA Guidance: Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products (2017), a Pre-BLA (Type B) meeting is strongly recommended to align on BLA content, data requirements, and review expectations. The meeting should be requested at least 60 days before the desired meeting date. Pre-BLA meetings are critical for resolving CMC, clinical, and regulatory questions before submission.',
        fields: [
          {
            id: 'pre_bla_meeting_held',
            label: 'Pre-BLA Meeting Held',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pre_bla_meeting_date',
            label: 'Pre-BLA Meeting Date',
            type: 'date',
            visibleWhen: {
              field: 'pre_bla_meeting_held',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'fda_feedback_from_pre_bla',
            label: 'Key FDA Feedback from Pre-BLA Meeting',
            type: 'textarea',
            placeholder:
              'e.g., FDA agreed with proposed potency assay. Requested additional comparability data for Process B. Recommended bridging study for PFS presentation.',
            visibleWhen: {
              field: 'pre_bla_meeting_held',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'rolling_submission',
            label: 'Rolling Submission Planned',
            type: 'yes_no',
            helpText:
              'Per 21 CFR 601.2(a), rolling review allows submission of completed sections of the BLA before the entire application is complete. Available for products with Breakthrough Therapy, Fast Track, or Priority Review designation.',
          },
          {
            id: 'advisory_committee',
            label: 'Advisory Committee Meeting Anticipated',
            type: 'yes_no',
            helpText:
              'FDA may convene an advisory committee (e.g., ODAC for oncology, VRBPAC for vaccines) to discuss the BLA. First-in-class biologics, novel mechanisms, and products with complex risk-benefit profiles typically warrant advisory committee review.',
          },
          {
            id: 'target_bla_submission_date',
            label: 'Target BLA Submission Date',
            type: 'date',
            required: true,
          },
        ],
        defaultNext: 'ectd_structure',
      },

      {
        id: 'ectd_structure',
        section: 'submission_strategy',
        question:
          'Describe the eCTD structure and content plan for your BLA.',
        guidance:
          'Per FDA Technical Requirements for eCTD submissions and ICH M4 (Common Technical Document), the BLA must be organized in eCTD format. For biologics, Module 3 (Quality) is particularly detailed and includes sections unique to biologics (3.2.S.1.3 General Properties, 3.2.S.2.3 Control of Materials for cell banks and raw materials). The eCTD must comply with FDA Comprehensive Table of Contents Headings and Hierarchy (January 2023 update).',
        fields: [
          {
            id: 'ectd_preparation_status',
            label: 'eCTD Preparation Status',
            type: 'select',
            required: true,
            options: [
              { value: 'ready_for_submission', label: 'Ready for Submission' },
              { value: 'final_assembly', label: 'In Final Assembly' },
              { value: 'modules_in_progress', label: 'Individual Modules in Progress' },
              { value: 'early_planning', label: 'Early Planning Stage' },
            ],
          },
          {
            id: 'module_3_completeness',
            label: 'Module 3 (Quality) Completeness',
            type: 'select',
            required: true,
            options: [
              { value: 'complete', label: 'Complete (Drug Substance + Drug Product + Appendices)' },
              { value: 'ds_complete_dp_pending', label: 'Drug Substance Complete, Drug Product Pending' },
              { value: 'in_progress', label: 'In Progress' },
            ],
            helpText:
              'Module 3 for biologics is typically the largest module and includes cell bank characterization, manufacturing process, analytical methods, specifications, stability, and container closure.',
          },
          {
            id: 'module_5_completeness',
            label: 'Module 5 (Clinical) Completeness',
            type: 'select',
            required: true,
            options: [
              { value: 'complete', label: 'Complete (CSRs, ISS, ISE finalized)' },
              { value: 'csr_finalization', label: 'CSRs Being Finalized' },
              { value: 'in_progress', label: 'In Progress' },
            ],
          },
          {
            id: 'ectd_publishing_vendor',
            label: 'eCTD Publishing Vendor/System',
            type: 'text',
            placeholder: 'e.g., Lorenz docuBridge, IQVIA RIM, Veeva Vault',
          },
        ],
        defaultNext: 'review_timeline',
      },

      {
        id: 'review_timeline',
        section: 'submission_strategy',
        question:
          'What are the expected review timeline, exclusivity considerations, and post-action commitments?',
        guidance:
          'Per PDUFA VII (FY 2023-2027 commitment letter), the standard BLA review timeline is 10 months (Standard Review) or 6 months (Priority Review) from the filing date. Under BPCIA (42 USC 262(k)(7)), reference product biologics receive 12 years of data exclusivity and 4 years of filing exclusivity from first licensure. Biosimilars cannot be submitted until 4 years after reference product licensure and cannot be approved until 12 years after.',
        fields: [
          {
            id: 'review_type_expected',
            label: 'Expected Review Type',
            type: 'select',
            required: true,
            options: [
              { value: 'standard', label: 'Standard Review (10-month target)' },
              { value: 'priority', label: 'Priority Review (6-month target)' },
            ],
          },
          {
            id: 'pdufa_goal_date',
            label: 'Expected PDUFA Goal Date',
            type: 'date',
            helpText:
              'The PDUFA goal date is set after FDA files the BLA. Standard review: 10 months from filing. Priority review: 6 months from filing. Filing decision typically occurs 60 days after submission.',
          },
          {
            id: 'exclusivity_strategy',
            label: 'Exclusivity Strategy',
            type: 'multi_select',
            options: [
              { value: 'bpcia_12year', label: '12-Year Data Exclusivity (BPCIA for 351(a))' },
              { value: 'orphan_7year', label: '7-Year Orphan Drug Exclusivity' },
              { value: 'pediatric_6month', label: '6-Month Pediatric Exclusivity Extension' },
              { value: 'patents', label: 'Patent Protection (Orange Book or Purple Book)' },
              { value: 'biosimilar_interchangeability', label: 'First Interchangeable Exclusivity (1 year)' },
            ],
            helpText:
              'Under BPCIA, 351(a) biological products receive 12 years of data exclusivity from first licensure. The first interchangeable biosimilar receives 1 year of marketing exclusivity per 42 USC 262(k)(6).',
          },
          {
            id: 'post_action_commitments',
            label: 'Anticipated Post-Action Commitments',
            type: 'textarea',
            placeholder:
              'e.g., Process validation of commercial-scale manufacturing. Post-marketing observational study (5,000 patients). Pediatric studies per PREA. Stability data on commercial lots.',
          },
          {
            id: 'launch_readiness',
            label: 'Commercial Launch Readiness Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'ready', label: 'Launch-Ready (supply chain, labeling, distribution in place)' },
              { value: 'on_track', label: 'On Track (6+ months pre-approval activities planned)' },
              { value: 'early_planning', label: 'Early Planning' },
            ],
          },
          {
            id: 'additional_strategy_notes',
            label: 'Additional Submission Strategy Notes',
            type: 'textarea',
            placeholder:
              'Any additional considerations, special circumstances, or strategic notes for this BLA...',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
      },
    ],
  };
}
