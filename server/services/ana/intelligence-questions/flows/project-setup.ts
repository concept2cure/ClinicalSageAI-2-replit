/**
 * Project Setup flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through initial project configuration and regulatory
 * strategy definition, covering project identification, product type,
 * target indications, regulatory pathway selection, target markets,
 * development phase, key milestones, and team structure.
 *
 * 8 nodes, 4 sections, 50+ fields with branching for product type
 * (drug, biologic, device, combination) and regulatory pathway.
 *
 * @module server/services/ana/intelligence-questions/flows/project-setup
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createProjectSetupFlow(): FlowDefinition {
  return {
    id: 'project-setup-v1',
    category: 'project_setup',
    name: 'Project Setup',
    description:
      'Initial project configuration and regulatory strategy definition covering project identification, product classification, target indications, regulatory pathway, target markets, development phase, milestones, and team structure.',
    clientTypes: [],
    entryNode: 'project_identification',
    estimatedMinutes: 25,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'project_info',
        label: 'Project Information',
        nodeIds: ['project_identification', 'product_classification'],
      },
      {
        id: 'regulatory_strategy',
        label: 'Regulatory Strategy',
        nodeIds: [
          'target_indications',
          'regulatory_pathway',
          'drug_pathway_details',
          'device_pathway_details',
          'biologic_pathway_details',
        ],
      },
      {
        id: 'markets_phase',
        label: 'Markets & Development',
        nodeIds: ['target_markets'],
      },
      {
        id: 'planning',
        label: 'Milestones & Team',
        nodeIds: ['milestones', 'team_structure'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 1 — Project Information                                 */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'project_identification',
        section: 'Project Information',
        question:
          'Let\'s set up this project. What is the project name, internal code, and a brief description of the product being developed?',
        guidance:
          'A clear project name and description help align all team members on the product vision and scope. The internal code is used for tracking across systems. The therapeutic area and product description should capture enough detail to guide downstream regulatory and development decisions.',
        fields: [
          {
            id: 'project_name',
            label: 'Project Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. Project Atlas — Atorvastatin Extended-Release',
          },
          {
            id: 'project_code',
            label: 'Internal Project Code',
            type: 'text',
            placeholder: 'e.g. ATL-2025-001',
          },
          {
            id: 'project_description',
            label: 'Product / Project Description',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the product being developed, its intended use, and the unmet medical need it addresses',
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            required: true,
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'cardiology', label: 'Cardiology' },
              { value: 'neurology', label: 'Neurology' },
              { value: 'immunology', label: 'Immunology / Inflammation' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'endocrinology', label: 'Endocrinology / Metabolic' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'gastroenterology', label: 'Gastroenterology' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
              { value: 'rare_disease', label: 'Rare Disease / Orphan' },
              { value: 'gene_cell_therapy', label: 'Gene / Cell Therapy' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'sponsor_organization',
            label: 'Sponsor Organization',
            type: 'text',
            required: true,
            placeholder: 'Legal name of the sponsoring organization',
          },
          {
            id: 'project_start_date',
            label: 'Project Start Date',
            type: 'date',
          },
        ],
        defaultNext: 'product_classification',
      },

      {
        id: 'product_classification',
        section: 'Project Information',
        question:
          'What type of product is being developed? This determines the applicable regulatory framework and submission requirements.',
        guidance:
          'Product classification is fundamental to regulatory strategy. Drugs follow 21 CFR 314 (NDA) or 505(b)(2) pathways. Biologics follow 21 CFR 601 (BLA). Medical devices follow 21 CFR 807 (510(k)) or 21 CFR 814 (PMA). Combination products are assigned to a primary mode of action (PMOA) center per 21 CFR 3.2. The classification determines which FDA center has jurisdiction and which regulations apply.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'drug', label: 'Drug (Small Molecule)' },
              { value: 'biologic', label: 'Biologic (Protein, Antibody, Vaccine)' },
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'combination', label: 'Combination Product' },
              { value: 'cell_therapy', label: 'Cell Therapy' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
              { value: 'diagnostic', label: 'In Vitro Diagnostic (IVD)' },
            ],
          },
          {
            id: 'drug_substance_type',
            label: 'Drug Substance Type',
            type: 'select',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'drug' },
            options: [
              { value: 'nce', label: 'New Chemical Entity (NCE)' },
              { value: 'known_substance', label: 'Known Active Substance' },
              { value: 'generic', label: 'Generic (ANDA)' },
              { value: 'otc_switch', label: 'Rx-to-OTC Switch' },
            ],
          },
          {
            id: 'biologic_type',
            label: 'Biologic Type',
            type: 'select',
            visibleWhen: { field: 'product_type', operator: 'in', value: ['biologic', 'cell_therapy', 'gene_therapy'] },
            options: [
              { value: 'monoclonal_antibody', label: 'Monoclonal Antibody' },
              { value: 'recombinant_protein', label: 'Recombinant Protein' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'blood_product', label: 'Blood / Plasma Product' },
              { value: 'biosimilar', label: 'Biosimilar' },
              { value: 'aav_vector', label: 'AAV Vector (Gene Therapy)' },
              { value: 'car_t', label: 'CAR-T Cell Therapy' },
              { value: 'mrna', label: 'mRNA Therapeutic' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'device_class',
            label: 'Device Classification',
            type: 'select',
            visibleWhen: { field: 'product_type', operator: 'in', value: ['medical_device', 'diagnostic'] },
            options: [
              { value: 'class_i', label: 'Class I (General Controls)' },
              { value: 'class_ii', label: 'Class II (Special Controls)' },
              { value: 'class_iii', label: 'Class III (Premarket Approval)' },
            ],
          },
          {
            id: 'combination_pmoa',
            label: 'Primary Mode of Action (PMOA)',
            type: 'select',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'combination' },
            helpText: 'The PMOA determines which FDA center has primary jurisdiction per 21 CFR 3.2.',
            options: [
              { value: 'drug', label: 'Drug PMOA (CDER Lead)' },
              { value: 'biologic', label: 'Biologic PMOA (CBER Lead)' },
              { value: 'device', label: 'Device PMOA (CDRH Lead)' },
            ],
          },
          {
            id: 'innovation_designation',
            label: 'Innovation / Expedited Designations Sought',
            type: 'multi_select',
            helpText: 'Select any expedited programs or special designations being pursued.',
            options: [
              { value: 'fast_track', label: 'Fast Track' },
              { value: 'breakthrough', label: 'Breakthrough Therapy' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'orphan_drug', label: 'Orphan Drug Designation' },
              { value: 'rmat', label: 'RMAT (Regenerative Medicine)' },
              { value: 'prime', label: 'PRIME (EMA)' },
              { value: 'sakigake', label: 'SAKIGAKE (Japan)' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'product_type', operator: 'eq', value: 'drug' },
            goto: 'target_indications',
          },
          {
            when: { field: 'product_type', operator: 'in', value: ['biologic', 'cell_therapy', 'gene_therapy'] },
            goto: 'target_indications',
          },
          {
            when: { field: 'product_type', operator: 'in', value: ['medical_device', 'diagnostic'] },
            goto: 'target_indications',
          },
          {
            when: { field: 'product_type', operator: 'eq', value: 'combination' },
            goto: 'target_indications',
          },
        ],
        defaultNext: 'target_indications',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 2 — Regulatory Strategy                                 */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'target_indications',
        section: 'Regulatory Strategy',
        question:
          'What are the target indications and patient population for this product?',
        guidance:
          'Clearly defining the target indication(s) and patient population is critical for regulatory strategy, clinical trial design, and commercial planning. The primary indication drives the initial filing, while secondary indications may support lifecycle management. Patient population details (age, disease stage, biomarker status) influence trial design, labeling, and post-market requirements.',
        fields: [
          {
            id: 'primary_indication',
            label: 'Primary Indication',
            type: 'text',
            required: true,
            placeholder: 'e.g. Treatment of HER2-positive metastatic breast cancer',
          },
          {
            id: 'secondary_indications',
            label: 'Secondary / Future Indications',
            type: 'textarea',
            placeholder: 'List additional indications planned for lifecycle management',
          },
          {
            id: 'target_population',
            label: 'Target Patient Population',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. Adult patients (18+) with confirmed HER2-positive status who have failed prior trastuzumab therapy',
          },
          {
            id: 'population_age_group',
            label: 'Age Group',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'neonatal', label: 'Neonatal (0-28 days)' },
              { value: 'pediatric', label: 'Pediatric (1 month - 17 years)' },
              { value: 'adult', label: 'Adult (18-64 years)' },
              { value: 'geriatric', label: 'Geriatric (65+ years)' },
            ],
          },
          {
            id: 'unmet_medical_need',
            label: 'Unmet Medical Need',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the current treatment landscape and the unmet need this product addresses',
            helpText: 'This supports expedited designation requests and regulatory interactions.',
          },
          {
            id: 'companion_diagnostic',
            label: 'Companion Diagnostic Required',
            type: 'yes_no',
            helpText: 'Will a companion diagnostic (CDx) be required for patient selection?',
          },
          {
            id: 'companion_diagnostic_details',
            label: 'Companion Diagnostic Details',
            type: 'textarea',
            visibleWhen: { field: 'companion_diagnostic', operator: 'eq', value: true },
            placeholder: 'Describe the CDx (biomarker, test type, development partner)',
          },
        ],
        defaultNext: 'regulatory_pathway',
      },

      {
        id: 'regulatory_pathway',
        section: 'Regulatory Strategy',
        question:
          'What regulatory pathway will be used for the initial submission? This determines the data package requirements.',
        guidance:
          'The regulatory pathway defines the type and extent of data required for approval. For drugs: 505(b)(1) requires full NDA with complete clinical data; 505(b)(2) allows reliance on published literature or FDA findings of safety/efficacy. For devices: 510(k) requires substantial equivalence to a predicate; PMA requires full safety and effectiveness data. For biologics: BLA (351(a)) or biosimilar (351(k)). The choice of pathway significantly impacts development timelines, costs, and data requirements.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'primary_pathway',
            label: 'Primary Regulatory Pathway',
            type: 'select',
            required: true,
            options: [
              { value: '505b1', label: '505(b)(1) — Full NDA' },
              { value: '505b2', label: '505(b)(2) — NDA with Literature Reference' },
              { value: 'anda', label: 'ANDA — Abbreviated NDA (Generic)' },
              { value: '510k', label: '510(k) — Premarket Notification' },
              { value: 'de_novo', label: 'De Novo Classification' },
              { value: 'pma', label: 'PMA — Premarket Approval' },
              { value: 'bla_351a', label: 'BLA 351(a) — Original Biologic' },
              { value: 'bla_351k', label: 'BLA 351(k) — Biosimilar' },
              { value: 'eua', label: 'EUA — Emergency Use Authorization' },
            ],
          },
          {
            id: 'fda_center',
            label: 'FDA Center',
            type: 'select',
            required: true,
            options: [
              { value: 'cder', label: 'CDER (Center for Drug Evaluation and Research)' },
              { value: 'cber', label: 'CBER (Center for Biologics Evaluation and Research)' },
              { value: 'cdrh', label: 'CDRH (Center for Devices and Radiological Health)' },
              { value: 'ocp', label: 'OCP (Office of Combination Products)' },
            ],
          },
          {
            id: 'pre_submission_meetings',
            label: 'Pre-Submission Meetings Planned',
            type: 'multi_select',
            helpText: 'Select all planned FDA interactions.',
            options: [
              { value: 'pre_ind', label: 'Pre-IND Meeting' },
              { value: 'eop1', label: 'End-of-Phase 1 Meeting' },
              { value: 'eop2', label: 'End-of-Phase 2 Meeting' },
              { value: 'pre_nda', label: 'Pre-NDA / Pre-BLA Meeting' },
              { value: 'pre_sub', label: 'Pre-Submission (Device)' },
              { value: 'type_a', label: 'Type A Meeting' },
              { value: 'type_b', label: 'Type B Meeting' },
              { value: 'type_c', label: 'Type C Meeting' },
            ],
          },
          {
            id: 'reference_product',
            label: 'Reference Listed Drug / Predicate Device',
            type: 'text',
            placeholder: 'e.g. Lipitor (NDA 020702) or Predicate Device K123456',
            helpText: 'Required for 505(b)(2), ANDA, 510(k), and biosimilar applications.',
          },
          {
            id: 'pediatric_requirements',
            label: 'Pediatric Study Requirements',
            type: 'select',
            required: true,
            helpText: 'PREA requires pediatric studies unless a waiver or deferral is granted.',
            options: [
              { value: 'psp_required', label: 'Pediatric Study Plan (PSP) Required' },
              { value: 'waiver', label: 'Pediatric Waiver Sought' },
              { value: 'deferral', label: 'Pediatric Deferral Sought' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'primary_pathway', operator: 'in', value: ['505b1', '505b2', 'anda'] },
            goto: 'drug_pathway_details',
          },
          {
            when: { field: 'primary_pathway', operator: 'in', value: ['510k', 'de_novo', 'pma'] },
            goto: 'device_pathway_details',
          },
          {
            when: { field: 'primary_pathway', operator: 'in', value: ['bla_351a', 'bla_351k'] },
            goto: 'biologic_pathway_details',
          },
        ],
        defaultNext: 'target_markets',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Branch nodes — Pathway-specific details                         */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'drug_pathway_details',
        section: 'Regulatory Strategy',
        question:
          'Let\'s capture the drug-specific regulatory details for this submission pathway.',
        guidance:
          'Drug submissions under 505(b)(1) require complete reports of safety and effectiveness studies. 505(b)(2) applications can rely on FDA findings of safety and effectiveness for the reference listed drug (RLD) and may require bridging studies. ANDA submissions require bioequivalence data. Consider whether any special protocol assessments (SPAs) are needed for pivotal trials.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'nda_type',
            label: 'NDA Type',
            type: 'select',
            required: true,
            options: [
              { value: 'original', label: 'Original NDA' },
              { value: 'efficacy_supplement', label: 'Efficacy Supplement (sNDA)' },
              { value: 'new_formulation', label: 'New Formulation' },
              { value: 'new_indication', label: 'New Indication' },
            ],
          },
          {
            id: 'rld_information',
            label: 'Reference Listed Drug (RLD)',
            type: 'textarea',
            placeholder: 'Name, NDA number, applicant, approved indications',
            helpText: 'Required for 505(b)(2) and ANDA pathways.',
          },
          {
            id: 'bridging_studies',
            label: 'Bridging Studies Required',
            type: 'multi_select',
            helpText: 'Select studies needed to bridge to the RLD.',
            options: [
              { value: 'bioequivalence', label: 'Bioequivalence Study' },
              { value: 'comparative_pk', label: 'Comparative PK Study' },
              { value: 'clinical_efficacy', label: 'Clinical Efficacy Study' },
              { value: 'clinical_safety', label: 'Clinical Safety Study' },
              { value: 'nonclinical_bridge', label: 'Nonclinical Bridging Study' },
              { value: 'none', label: 'None Required' },
            ],
          },
          {
            id: 'spa_planned',
            label: 'Special Protocol Assessment (SPA)',
            type: 'yes_no',
            helpText: 'Will an SPA be sought for the pivotal trial design, endpoints, or statistical analysis?',
          },
          {
            id: 'patent_exclusivity',
            label: 'Patent / Exclusivity Considerations',
            type: 'multi_select',
            helpText: 'Select applicable exclusivity provisions.',
            options: [
              { value: 'nce_5year', label: '5-Year NCE Exclusivity' },
              { value: 'clinical_3year', label: '3-Year Clinical Investigation Exclusivity' },
              { value: 'orphan_7year', label: '7-Year Orphan Drug Exclusivity' },
              { value: 'pediatric_6month', label: '6-Month Pediatric Exclusivity' },
              { value: 'patent_challenge', label: 'Patent Challenge (PIV)' },
              { value: 'none', label: 'None / Not Assessed' },
            ],
          },
        ],
        defaultNext: 'target_markets',
      },

      {
        id: 'device_pathway_details',
        section: 'Regulatory Strategy',
        question:
          'Let\'s capture the device-specific regulatory details for this submission pathway.',
        guidance:
          '510(k) submissions require demonstration of substantial equivalence to a legally marketed predicate device. PMA applications require valid scientific evidence of safety and effectiveness. De Novo classification is for novel devices with no predicate that present low-to-moderate risk. Design controls (21 CFR 820.30) and risk management (ISO 14971) apply to all device pathways.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'predicate_device',
            label: 'Predicate Device (for 510(k))',
            type: 'textarea',
            placeholder: 'Device name, 510(k) number, manufacturer',
            helpText: 'Identify the predicate device and basis for substantial equivalence.',
          },
          {
            id: 'device_classification_panel',
            label: 'Classification Panel',
            type: 'text',
            placeholder: 'e.g. Cardiovascular, Orthopedic',
            helpText: 'FDA classification panel and product code (21 CFR 862-892).',
          },
          {
            id: 'product_code',
            label: 'FDA Product Code',
            type: 'text',
            placeholder: 'e.g. DXY, QAS',
          },
          {
            id: 'performance_standards',
            label: 'Applicable Standards',
            type: 'multi_select',
            helpText: 'Select consensus standards to be used in the submission.',
            options: [
              { value: 'iso_13485', label: 'ISO 13485 (QMS)' },
              { value: 'iso_14971', label: 'ISO 14971 (Risk Management)' },
              { value: 'iec_60601', label: 'IEC 60601 (Electrical Safety)' },
              { value: 'iec_62304', label: 'IEC 62304 (Software Lifecycle)' },
              { value: 'iso_10993', label: 'ISO 10993 (Biocompatibility)' },
              { value: 'iec_62366', label: 'IEC 62366 (Usability)' },
            ],
          },
          {
            id: 'clinical_data_required',
            label: 'Clinical Data Required',
            type: 'select',
            required: true,
            options: [
              { value: 'yes_pivotal', label: 'Yes — Pivotal Clinical Study' },
              { value: 'yes_literature', label: 'Yes — Clinical Literature' },
              { value: 'bench_only', label: 'No — Bench Testing Only' },
              { value: 'tbd', label: 'To Be Determined' },
            ],
          },
          {
            id: 'software_level_of_concern',
            label: 'Software Level of Concern',
            type: 'select',
            helpText: 'If the device includes software, specify the level of concern per FDA guidance.',
            options: [
              { value: 'minor', label: 'Minor' },
              { value: 'moderate', label: 'Moderate' },
              { value: 'major', label: 'Major' },
              { value: 'not_applicable', label: 'Not Applicable (No Software)' },
            ],
          },
        ],
        defaultNext: 'target_markets',
      },

      {
        id: 'biologic_pathway_details',
        section: 'Regulatory Strategy',
        question:
          'Let\'s capture the biologic-specific regulatory details for this BLA submission.',
        guidance:
          'BLA submissions under 351(a) require full reports of clinical investigation. Biosimilar applications under 351(k) require demonstration of biosimilarity (analytical, functional, animal, and clinical studies) to the reference product. CBER regulates most biologics, though some therapeutic proteins are regulated by CDER. Consider lot release requirements, post-marketing commitments, and REMS obligations.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'reference_biologic',
            label: 'Reference Biologic (for 351(k))',
            type: 'textarea',
            placeholder: 'Product name, BLA number, applicant',
            helpText: 'Required for biosimilar applications. Identify the reference product.',
          },
          {
            id: 'manufacturing_platform',
            label: 'Manufacturing Platform',
            type: 'select',
            required: true,
            options: [
              { value: 'cho', label: 'CHO Cell Culture' },
              { value: 'e_coli', label: 'E. coli Expression' },
              { value: 'yeast', label: 'Yeast Expression' },
              { value: 'insect_cell', label: 'Insect Cell / Baculovirus' },
              { value: 'human_cell', label: 'Human Cell Line' },
              { value: 'plant_based', label: 'Plant-Based' },
              { value: 'cell_free', label: 'Cell-Free Synthesis' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'comparability_studies',
            label: 'Comparability Studies Needed',
            type: 'multi_select',
            helpText: 'Select studies required for demonstrating comparability or biosimilarity.',
            options: [
              { value: 'analytical', label: 'Analytical Characterization' },
              { value: 'functional', label: 'Functional Assays' },
              { value: 'animal_pk', label: 'Animal PK Studies' },
              { value: 'animal_tox', label: 'Animal Toxicology' },
              { value: 'clinical_pk', label: 'Clinical PK/PD Study' },
              { value: 'clinical_efficacy', label: 'Clinical Efficacy Study' },
              { value: 'immunogenicity', label: 'Immunogenicity Assessment' },
            ],
          },
          {
            id: 'interchangeability',
            label: 'Interchangeability Designation Sought',
            type: 'yes_no',
            helpText: 'Will interchangeability be sought (requires switching study data)?',
          },
          {
            id: 'lot_release',
            label: 'CBER Lot Release Required',
            type: 'yes_no',
            helpText: 'Some biologics require CBER lot release testing before distribution.',
          },
          {
            id: 'rems_required',
            label: 'REMS Required',
            type: 'select',
            helpText: 'Risk Evaluation and Mitigation Strategy requirements.',
            options: [
              { value: 'yes', label: 'Yes — REMS Required' },
              { value: 'under_evaluation', label: 'Under Evaluation' },
              { value: 'no', label: 'No' },
            ],
          },
        ],
        defaultNext: 'target_markets',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 3 — Markets & Development                               */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'target_markets',
        section: 'Markets & Development',
        question:
          'Which markets are targeted for this product, and what is the current development phase?',
        guidance:
          'Target markets determine which regulatory agencies will review the application and influence the development strategy. Global development programs may leverage ICH guidelines for harmonized submissions. The development phase indicates the maturity of the program and determines near-term milestones. Consider whether simultaneous submissions or rolling reviews are planned.',
        fields: [
          {
            id: 'target_regulatory_markets',
            label: 'Target Regulatory Markets',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'us_fda', label: 'United States (FDA)' },
              { value: 'eu_ema', label: 'European Union (EMA)' },
              { value: 'japan_pmda', label: 'Japan (PMDA)' },
              { value: 'china_nmpa', label: 'China (NMPA)' },
              { value: 'canada_hc', label: 'Canada (Health Canada)' },
              { value: 'uk_mhra', label: 'United Kingdom (MHRA)' },
              { value: 'australia_tga', label: 'Australia (TGA)' },
              { value: 'brazil_anvisa', label: 'Brazil (ANVISA)' },
              { value: 'india_cdsco', label: 'India (CDSCO)' },
              { value: 'korea_mfds', label: 'South Korea (MFDS)' },
              { value: 'who_pq', label: 'WHO Prequalification' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'filing_strategy',
            label: 'Filing Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'sequential', label: 'Sequential Filing (US First)' },
              { value: 'simultaneous', label: 'Simultaneous Global Filing' },
              { value: 'rolling', label: 'Rolling Submission (US)' },
              { value: 'phased', label: 'Phased Regional Filing' },
            ],
          },
          {
            id: 'development_phase',
            label: 'Current Development Phase',
            type: 'select',
            required: true,
            options: [
              { value: 'discovery', label: 'Discovery / Lead Optimization' },
              { value: 'preclinical', label: 'Preclinical / IND-Enabling' },
              { value: 'phase_1', label: 'Phase 1' },
              { value: 'phase_1_2', label: 'Phase 1/2' },
              { value: 'phase_2', label: 'Phase 2' },
              { value: 'phase_2_3', label: 'Phase 2/3' },
              { value: 'phase_3', label: 'Phase 3' },
              { value: 'nda_bla_filing', label: 'NDA/BLA Filing' },
              { value: 'under_review', label: 'Under Regulatory Review' },
              { value: 'approved', label: 'Approved (Lifecycle Management)' },
            ],
          },
          {
            id: 'global_development_plan',
            label: 'Global Development Plan (GDP)',
            type: 'select',
            helpText: 'Is there a unified global development plan or separate regional strategies?',
            options: [
              { value: 'unified', label: 'Unified Global Plan' },
              { value: 'regional', label: 'Separate Regional Plans' },
              { value: 'hybrid', label: 'Hybrid (Core + Regional Adaptations)' },
              { value: 'not_established', label: 'Not Yet Established' },
            ],
          },
          {
            id: 'market_exclusivity_strategy',
            label: 'Market Exclusivity Strategy',
            type: 'textarea',
            placeholder: 'Describe the IP and market exclusivity strategy (patents, data exclusivity, orphan designation)',
          },
        ],
        defaultNext: 'milestones',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Section 4 — Milestones & Team                                   */
      /* ────────────────────────────────────────────────────────────────── */

      {
        id: 'milestones',
        section: 'Milestones & Team',
        question:
          'What are the key development and regulatory milestones for this project?',
        guidance:
          'Defining milestones early ensures alignment between development, regulatory, and commercial teams. Key milestones typically include IND/CTA filing, first patient enrolled, database lock, NDA/BLA/MAA submission, and target approval date. For devices, milestones include 510(k)/PMA submission, IDE approval, and design freeze. Include go/no-go decision points.',
        fields: [
          {
            id: 'ind_cta_target',
            label: 'IND / CTA Filing Target',
            type: 'date',
            helpText: 'Target date for Investigational New Drug or Clinical Trial Application.',
          },
          {
            id: 'fpi_target',
            label: 'First Patient In (FPI) Target',
            type: 'date',
            helpText: 'Target date for first patient enrolled in the pivotal study.',
          },
          {
            id: 'database_lock_target',
            label: 'Database Lock Target',
            type: 'date',
          },
          {
            id: 'submission_target',
            label: 'NDA / BLA / 510(k) Submission Target',
            type: 'date',
            required: true,
            helpText: 'Target date for regulatory submission.',
          },
          {
            id: 'approval_target',
            label: 'Target Approval Date',
            type: 'date',
            helpText: 'Expected approval date based on review timelines (standard or priority).',
          },
          {
            id: 'launch_target',
            label: 'Commercial Launch Target',
            type: 'date',
          },
          {
            id: 'go_no_go_decisions',
            label: 'Go / No-Go Decision Points',
            type: 'textarea',
            placeholder: 'Describe key decision gates (e.g., Phase 2 futility analysis, interim analysis)',
            helpText: 'Identify decision points where the program could advance, pivot, or terminate.',
          },
          {
            id: 'critical_path_risks',
            label: 'Critical Path Risks',
            type: 'textarea',
            placeholder: 'Identify major risks that could delay the timeline',
            helpText: 'e.g., CMC scale-up challenges, enrollment delays, regulatory hold risks',
          },
        ],
        issueChecks: [
          {
            id: 'no_submission_date',
            condition: { field: 'submission_target', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Submission Target Date',
            message:
              'A target submission date is essential for project planning, resource allocation, and alignment with commercial objectives. Define a realistic submission target based on the development phase and anticipated data availability.',
          },
        ],
        defaultNext: 'team_structure',
      },

      {
        id: 'team_structure',
        section: 'Milestones & Team',
        question:
          'Define the core project team structure, key roles, and external partnerships.',
        guidance:
          'A well-defined team structure ensures accountability and clear communication channels. For regulatory submissions, identify the regulatory lead, medical monitor, CMC lead, and project manager at minimum. External partnerships (CROs, CMOs, regulatory consultants) should be documented. The governance structure should define escalation paths and decision-making authority.',
        fields: [
          {
            id: 'project_lead',
            label: 'Project Lead / Program Director',
            type: 'text',
            required: true,
            placeholder: 'Name and title',
          },
          {
            id: 'regulatory_lead',
            label: 'Regulatory Affairs Lead',
            type: 'text',
            required: true,
            placeholder: 'Name and title',
          },
          {
            id: 'medical_lead',
            label: 'Medical / Clinical Lead',
            type: 'text',
            placeholder: 'Name and title',
          },
          {
            id: 'cmc_lead',
            label: 'CMC / Manufacturing Lead',
            type: 'text',
            placeholder: 'Name and title',
          },
          {
            id: 'core_team_functions',
            label: 'Core Team Functions Represented',
            type: 'multi_select',
            required: true,
            helpText: 'Select all functional areas represented on the core project team.',
            options: [
              { value: 'regulatory_affairs', label: 'Regulatory Affairs' },
              { value: 'clinical_development', label: 'Clinical Development' },
              { value: 'clinical_operations', label: 'Clinical Operations' },
              { value: 'medical_affairs', label: 'Medical Affairs' },
              { value: 'cmc', label: 'CMC / Manufacturing' },
              { value: 'quality', label: 'Quality Assurance' },
              { value: 'nonclinical', label: 'Nonclinical / Toxicology' },
              { value: 'biostatistics', label: 'Biostatistics' },
              { value: 'data_management', label: 'Data Management' },
              { value: 'pharmacovigilance', label: 'Pharmacovigilance' },
              { value: 'commercial', label: 'Commercial / Marketing' },
              { value: 'legal_ip', label: 'Legal / IP' },
              { value: 'finance', label: 'Finance' },
            ],
          },
          {
            id: 'external_partners',
            label: 'External Partners',
            type: 'multi_select',
            helpText: 'Select types of external partnerships supporting this project.',
            options: [
              { value: 'cro', label: 'CRO (Contract Research Organization)' },
              { value: 'cmo', label: 'CMO (Contract Manufacturing Organization)' },
              { value: 'cdmo', label: 'CDMO (Contract Development & Manufacturing)' },
              { value: 'regulatory_consultant', label: 'Regulatory Consultant' },
              { value: 'central_lab', label: 'Central Laboratory' },
              { value: 'bioanalytical_lab', label: 'Bioanalytical Laboratory' },
              { value: 'packaging', label: 'Packaging / Labeling' },
              { value: 'medical_writing', label: 'Medical Writing' },
              { value: 'none', label: 'None' },
            ],
          },
          {
            id: 'governance_structure',
            label: 'Governance Structure',
            type: 'select',
            required: true,
            helpText: 'Define the governance and decision-making framework.',
            options: [
              { value: 'steering_committee', label: 'Steering Committee + Project Team' },
              { value: 'matrix', label: 'Matrix Organization' },
              { value: 'dedicated', label: 'Dedicated Project Team' },
              { value: 'alliance', label: 'Alliance Management (Co-Development)' },
            ],
          },
          {
            id: 'meeting_cadence',
            label: 'Core Team Meeting Cadence',
            type: 'select',
            options: [
              { value: 'weekly', label: 'Weekly' },
              { value: 'biweekly', label: 'Biweekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'as_needed', label: 'As Needed' },
            ],
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
