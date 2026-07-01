/**
 * IND (Investigational New Drug) Submission flow definition for the
 * AnA Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through a comprehensive IND submission
 * questionnaire covering sponsor information, product details, preclinical
 * data, clinical plan, regulatory history, CMC deep dive, clinical
 * pharmacology, manufacturing & controls, and pediatric/special populations.
 *
 * 25 nodes · 120+ fields · 9 sections · 20+ issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/ind-submission
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createIndSubmissionFlow(): FlowDefinition {
  return {
    id: 'ind-submission-v1',
    category: 'ind_submission',
    name: 'IND Submission',
    description:
      'Comprehensive IND submission questionnaire covering sponsor information, product details, preclinical data, clinical plan, regulatory history, CMC, clinical pharmacology, manufacturing & controls, and pediatric/special populations for FDA Investigational New Drug applications.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'sponsor_details',
    estimatedMinutes: 75,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'sponsor_info',
        label: 'Sponsor Information',
        nodeIds: ['sponsor_details', 'ind_type'],
      },
      {
        id: 'product_info',
        label: 'Product Information',
        nodeIds: ['drug_info', 'biologic_characterization', 'formulation'],
      },
      {
        id: 'preclinical',
        label: 'Preclinical Data',
        nodeIds: ['nonclinical_summary', 'toxicology'],
      },
      {
        id: 'clinical_plan',
        label: 'Clinical Plan',
        nodeIds: ['proposed_study', 'starting_dose_justification', 'investigator_brochure', 'investigator_info', 'safety_reporting_plan'],
      },
      {
        id: 'reg_history',
        label: 'Regulatory History',
        nodeIds: ['prior_submissions', 'amendment_change_summary', 'ind_review'],
      },
      {
        id: 'cmc_deep_dive',
        label: 'CMC Deep Dive',
        nodeIds: ['drug_substance_characterization', 'drug_product_composition', 'stability_program'],
      },
      {
        id: 'clinical_pharmacology',
        label: 'Clinical Pharmacology',
        nodeIds: ['pk_pd_assessment', 'drug_drug_interactions', 'qtc_assessment'],
      },
      {
        id: 'manufacturing_controls',
        label: 'Manufacturing & Controls',
        nodeIds: ['manufacturing_process', 'analytical_methods'],
      },
      {
        id: 'special_populations',
        label: 'Pediatric & Special Populations',
        nodeIds: ['pediatric_study_plan', 'special_populations_assessment'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Sponsor Information                                 */
      /* ================================================================ */

      {
        id: 'sponsor_details',
        section: 'sponsor_info',
        question:
          'Let\'s begin with sponsor information. Per 21 CFR 312.23(a)(1), the IND application must identify the sponsor and a responsible contact person. Please provide those details.',
        guidance:
          'Per 21 CFR 312.23(a)(1), the IND application must include the name, address, and telephone number of the sponsor, the name of the contact person, and the date of the submission. The sponsor assumes responsibility for the entire IND program, including compliance with 21 CFR Part 312.',
        fields: [
          {
            id: 'sponsor_name',
            label: 'Sponsor Name (Legal Entity)',
            type: 'text',
            placeholder: 'e.g., Acme Therapeutics, Inc.',
            required: true,
            helpText: 'Full legal name as it will appear on Form FDA 1571.',
          },
          {
            id: 'sponsor_address',
            label: 'Sponsor Address',
            type: 'textarea',
            placeholder: '123 Pharma Blvd, Suite 400, Cambridge, MA 02142',
            required: true,
          },
          {
            id: 'contact_person',
            label: 'Contact Person (Regulatory Affairs Lead)',
            type: 'text',
            placeholder: 'e.g., Jane Smith, VP Regulatory Affairs',
            required: true,
          },
          {
            id: 'contact_phone',
            label: 'Contact Phone',
            type: 'text',
            placeholder: 'e.g., (617) 555-0100',
            required: true,
          },
          {
            id: 'contact_email',
            label: 'Contact Email',
            type: 'text',
            placeholder: 'e.g., jsmith@acmetherapeutics.com',
            required: true,
            validation: {
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
              patternMessage: 'Please enter a valid email address.',
            },
          },
          {
            id: 'sponsor_duns_number',
            label: 'DUNS Number',
            type: 'text',
            placeholder: 'e.g., 123456789',
            helpText: 'Dun & Bradstreet number required for FDA submissions per OMB guidance.',
            validation: {
              pattern: '^\\d{9}$',
              patternMessage: 'DUNS number must be exactly 9 digits.',
            },
          },
        ],
        defaultNext: 'ind_type',
      },

      {
        id: 'ind_type',
        section: 'sponsor_info',
        question:
          'What type of IND are you filing, and is this an original submission or an amendment? The submission type dictates the required content and review pathway.',
        guidance:
          'A Commercial IND (21 CFR 312.23) supports the full development program toward NDA/BLA approval. A Research (Investigator) IND (21 CFR 312.2(b)) is filed by a physician who both initiates and conducts the study. An Emergency IND (21 CFR 312.310) permits immediate use in a life-threatening situation before a standard IND is in effect. An amendment (21 CFR 312.31) modifies an existing IND and must describe what has changed.',
        fields: [
          {
            id: 'ind_type_selection',
            label: 'IND Type',
            type: 'select',
            required: true,
            options: [
              { value: 'commercial', label: 'Commercial IND', description: '21 CFR 312.23 — full development program toward marketing approval' },
              { value: 'research', label: 'Research / Investigator IND', description: '21 CFR 312.2(b) — physician-initiated, physician-conducted study' },
              { value: 'emergency', label: 'Emergency IND', description: '21 CFR 312.310 — life-threatening condition, no alternative therapy' },
            ],
          },
          {
            id: 'ind_application_type',
            label: 'Is this an original IND or an amendment?',
            type: 'select',
            required: true,
            options: [
              { value: 'original', label: 'Original IND' },
              { value: 'amendment', label: 'Amendment to existing IND' },
            ],
          },
          {
            id: 'previous_ind_number',
            label: 'Existing IND Number',
            type: 'text',
            placeholder: 'e.g., IND 123456',
            required: true,
            visibleWhen: {
              field: 'ind_application_type',
              operator: 'eq',
              value: 'amendment',
            },
          },
          {
            id: 'amendment_scope',
            label: 'Amendment Scope — what changed?',
            type: 'multi_select',
            visibleWhen: {
              field: 'ind_application_type',
              operator: 'eq',
              value: 'amendment',
            },
            options: [
              { value: 'protocol', label: 'Protocol Amendment' },
              { value: 'ib_update', label: 'Investigator Brochure Update' },
              { value: 'cmc_change', label: 'CMC Change (manufacturing, formulation)' },
              { value: 'safety_report', label: 'Safety Report / SUSAR' },
              { value: 'new_investigator', label: 'New Investigator / Site' },
              { value: 'annual_report', label: 'IND Annual Report (21 CFR 312.33)' },
              { value: 'info_amendment', label: 'Information Amendment (21 CFR 312.31)' },
            ],
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule (NME)' },
              { value: 'monoclonal_antibody', label: 'Monoclonal Antibody' },
              { value: 'adc', label: 'Antibody-Drug Conjugate (ADC)' },
              { value: 'gene_therapy', label: 'Gene Therapy' },
              { value: 'cell_therapy', label: 'Cell Therapy' },
              { value: 'peptide', label: 'Peptide' },
              { value: 'oligonucleotide', label: 'Oligonucleotide (ASO/siRNA)' },
              { value: 'vaccine', label: 'Vaccine' },
              { value: 'biosimilar', label: 'Biosimilar' },
              { value: 'other_biologic', label: 'Other Biologic' },
            ],
            helpText: 'Biologic products (mAbs, gene/cell therapy, vaccines) follow the BLA pathway under 42 USC 262 and require additional characterization data.',
          },
        ],
        branches: [
          {
            when: { field: 'ind_type_selection', operator: 'eq', value: 'emergency' },
            goto: 'drug_info',
          },
          {
            when: { field: 'ind_application_type', operator: 'eq', value: 'amendment' },
            goto: 'drug_info',
          },
        ],
        defaultNext: 'drug_info',
      },

      /* ================================================================ */
      /*  Section 2 — Product Information                                 */
      /* ================================================================ */

      {
        id: 'drug_info',
        section: 'product_info',
        question:
          'Provide details about the investigational drug product. These are required elements under 21 CFR 312.23(a)(7).',
        guidance:
          'Per 21 CFR 312.23(a)(7), the IND must include a description of the drug substance and drug product, including the name, chemical structure, mechanism of action, route of administration, and proposed indication. For biologics, describe the expression system and purification process at a high level. Include the USAN/INN if one has been assigned.',
        fields: [
          {
            id: 'drug_name_generic',
            label: 'Drug Name (Generic / INN / USAN)',
            type: 'text',
            placeholder: 'e.g., remdesivir',
            required: true,
          },
          {
            id: 'drug_code_number',
            label: 'Internal Drug Code / Compound Number',
            type: 'text',
            placeholder: 'e.g., ABC-1234',
            required: true,
          },
          {
            id: 'therapeutic_class',
            label: 'Therapeutic Class',
            type: 'text',
            placeholder: 'e.g., Kinase inhibitor, Monoclonal antibody, Gene therapy vector',
            required: true,
          },
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            placeholder:
              'e.g., Selective inhibitor of EGFR tyrosine kinase that blocks downstream RAS/RAF/MEK signaling, inducing apoptosis in EGFR-dependent tumor cells.',
            required: true,
            validation: { minLength: 50 },
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
              { value: 'intravitreal', label: 'Intravitreal' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'is_biologic',
            label: 'Is this product a biologic under 42 USC 262?',
            type: 'yes_no',
            required: true,
            helpText:
              'Biologic products (monoclonal antibodies, gene therapies, cell therapies, vaccines) are regulated under Section 351 of the PHS Act and require a BLA rather than an NDA for marketing approval.',
          },
          {
            id: 'orphan_designation',
            label: 'Has Orphan Drug Designation been granted or applied for?',
            type: 'select',
            options: [
              { value: 'granted', label: 'Yes — Orphan Designation Granted' },
              { value: 'applied', label: 'Applied — Pending Review' },
              { value: 'not_applicable', label: 'No / Not Applicable' },
            ],
            helpText: 'Orphan Drug Act (21 CFR 316) provides incentives for rare diseases (<200,000 US prevalence).',
          },
          {
            id: 'fast_track_status',
            label: 'Expedited Program Designations',
            type: 'multi_select',
            options: [
              { value: 'fast_track', label: 'Fast Track (21 CFR 312.300)', description: 'Serious condition with unmet need' },
              { value: 'breakthrough', label: 'Breakthrough Therapy', description: 'Substantial improvement over existing therapies' },
              { value: 'rmat', label: 'RMAT (Regenerative Medicine Advanced Therapy)', description: 'Cell/gene therapy for serious condition' },
              { value: 'none', label: 'None at this time' },
            ],
          },
        ],
        branches: [
          {
            when: { field: 'is_biologic', operator: 'eq', value: true },
            goto: 'biologic_characterization',
          },
        ],
        defaultNext: 'formulation',
        provideExpertFeedback: true,
      },

      {
        id: 'biologic_characterization',
        section: 'product_info',
        question:
          'Since this is a biologic product, provide additional characterization data required under 42 USC 262 and the BLA pathway. This includes expression system, purification, and higher-order structure characterization.',
        guidance:
          'Biologic products regulated under Section 351 of the PHS Act (42 USC 262) require extensive characterization beyond what is needed for small molecules. Per ICH Q6B "Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products," the sponsor must describe the expression system, purification process, post-translational modifications, higher-order structure, and biological activity assays. Gene therapy products must comply with FDA Guidance "Chemistry, Manufacturing, and Control (CMC) Information for Human Gene Therapy Investigational New Drug Applications (INDs)" (2020). Cell therapy products should follow FDA Guidance on "Potency Tests for Cellular and Gene Therapy Products" (2011).',
        fields: [
          {
            id: 'expression_system',
            label: 'Expression System',
            type: 'select',
            required: true,
            options: [
              { value: 'cho', label: 'CHO (Chinese Hamster Ovary)' },
              { value: 'hek293', label: 'HEK293' },
              { value: 'ecoli', label: 'E. coli' },
              { value: 'yeast', label: 'Yeast (Pichia, S. cerevisiae)' },
              { value: 'insect', label: 'Insect Cell / Baculovirus' },
              { value: 'plant', label: 'Plant-based' },
              { value: 'viral_vector', label: 'Viral Vector Production (AAV, Lentiviral, etc.)' },
              { value: 'cell_expansion', label: 'Autologous/Allogeneic Cell Expansion' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'purification_overview',
            label: 'Purification Process Overview',
            type: 'textarea',
            placeholder: 'e.g., Protein A affinity chromatography → low pH viral inactivation → cation exchange chromatography → nanofiltration → UF/DF. Overall yield: ~65%. HCP <100 ppm, DNA <10 pg/mg.',
            required: true,
          },
          {
            id: 'post_translational_modifications',
            label: 'Post-Translational Modifications Characterized',
            type: 'multi_select',
            options: [
              { value: 'glycosylation', label: 'Glycosylation (N-linked, O-linked)' },
              { value: 'disulfide_bonds', label: 'Disulfide Bond Mapping' },
              { value: 'charge_variants', label: 'Charge Variants (acidic/basic species)' },
              { value: 'aggregation', label: 'Aggregation Profile (SEC, DLS)' },
              { value: 'oxidation', label: 'Oxidation (Met, Trp)' },
              { value: 'deamidation', label: 'Deamidation (Asn)' },
              { value: 'c_terminal', label: 'C-terminal Lysine Clipping' },
              { value: 'not_applicable', label: 'Not applicable (non-protein biologic)' },
            ],
            helpText: 'Per ICH Q6B, post-translational modifications must be characterized and controlled as they can affect potency, PK, and immunogenicity.',
          },
          {
            id: 'potency_assay',
            label: 'Potency / Biological Activity Assay',
            type: 'textarea',
            placeholder: 'e.g., Cell-based ADCC assay using NK92 effector cells; target cell lysis EC50 = 0.5 nM. Binding ELISA to recombinant human [target] with KD = 2 nM by SPR.',
            required: true,
            helpText: 'Per ICH Q6B and FDA Guidance on Potency Tests (2011), a relevant biological activity assay must be developed. Potency is a critical quality attribute.',
          },
          {
            id: 'viral_safety',
            label: 'Viral Safety Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Viral clearance and safety studies completed per ICH Q5A(R2)' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'planned', label: 'Planned' },
              { value: 'na_non_mammalian', label: 'Not applicable (non-mammalian expression system)' },
            ],
            helpText: 'Per ICH Q5A(R2), cell lines of mammalian origin require viral safety evaluation including cell bank testing, in-process testing, and viral clearance validation studies.',
          },
        ],
        defaultNext: 'formulation',
        provideExpertFeedback: true,
      },

      {
        id: 'formulation',
        section: 'product_info',
        question:
          'Describe the formulation composition, dosage form, and manufacturing site for the investigational product.',
        guidance:
          'Per 21 CFR 312.23(a)(7)(iv)(a), the IND chemistry section must describe the drug product including its components, composition, and manufacturing. All excipients should be listed with their function. Novel excipients (not in the FDA Inactive Ingredients Database, IIG) require additional safety justification. Clinical supplies must be manufactured under cGMP per 21 CFR Parts 210 and 211.',
        fields: [
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'select',
            required: true,
            options: [
              { value: 'tablet', label: 'Tablet' },
              { value: 'capsule', label: 'Capsule' },
              { value: 'solution', label: 'Solution for Injection' },
              { value: 'suspension', label: 'Suspension' },
              { value: 'powder', label: 'Powder for Reconstitution' },
              { value: 'lyophilized', label: 'Lyophilized Powder' },
              { value: 'patch', label: 'Transdermal Patch' },
              { value: 'cream_ointment', label: 'Cream / Ointment' },
              { value: 'implant', label: 'Implant' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'strengths',
            label: 'Strength(s) / Concentration(s)',
            type: 'text',
            placeholder: 'e.g., 25 mg, 50 mg, 100 mg tablets; or 10 mg/mL solution',
            required: true,
          },
          {
            id: 'excipients_list',
            label: 'List of Excipients with Function',
            type: 'textarea',
            placeholder:
              'e.g., Microcrystalline cellulose (filler), Croscarmellose sodium (disintegrant), Magnesium stearate (lubricant), Polysorbate 80 (surfactant)',
            required: true,
          },
          {
            id: 'novel_excipient_used',
            label: 'Does the formulation contain any novel excipient not listed in the FDA IIG database?',
            type: 'yes_no',
            required: true,
            helpText:
              'Novel excipients not in the FDA Inactive Ingredients Guide (IIG) require a separate safety review package. FDA may request a Type IV DMF or standalone excipient safety data.',
          },
          {
            id: 'manufacturing_site',
            label: 'Manufacturing Site (Drug Product)',
            type: 'text',
            placeholder: 'e.g., Lonza AG, Basel, Switzerland',
            required: true,
          },
          {
            id: 'manufacturing_site_fda_inspected',
            label: 'Has this manufacturing site been inspected by FDA within the last 3 years?',
            type: 'yes_no',
            helpText: 'FDA conducts pre-approval inspections (PAI) per 21 CFR 211. A site without prior FDA inspection history may receive increased scrutiny.',
          },
          {
            id: 'gmp_compliance',
            label: 'cGMP Compliance Confirmed for Clinical Supply',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR Parts 210 and 211, all clinical trial material must be manufactured under current Good Manufacturing Practice (cGMP). Non-compliance is grounds for clinical hold per 21 CFR 312.42.',
          },
        ],
        defaultNext: 'nonclinical_summary',
        issueChecks: [
          {
            id: 'gmp_non_compliance',
            condition: { field: 'gmp_compliance', operator: 'eq', value: false },
            severity: 'critical',
            title: 'cGMP Non-Compliance',
            message:
              'Clinical trial material must be manufactured under cGMP. FDA will place a clinical hold (21 CFR 312.42(b)(1)(iv)) if cGMP compliance cannot be demonstrated.',
            reference: '21 CFR Parts 210, 211; 21 CFR 312.42',
          },
          {
            id: 'novel_excipient_flag',
            condition: { field: 'novel_excipient_used', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Novel Excipient Requires Additional Safety Data',
            message:
              'Use of a novel excipient (not in FDA IIG database) requires additional safety and toxicology data in the IND. The excipient may need its own nonclinical safety assessment. FDA may request a Type IV Drug Master File (DMF).',
            reference: 'FDA Guidance: Nonclinical Studies for Safety Evaluation of Pharmaceutical Excipients (2005)',
          },
          {
            id: 'manufacturing_site_not_inspected',
            condition: { field: 'manufacturing_site_fda_inspected', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Manufacturing Site Not Recently FDA-Inspected',
            message:
              'A manufacturing site without recent FDA inspection history may face a pre-approval inspection (PAI), which can delay clinical supply release. Consider proactive engagement with the FDA district office.',
            reference: '21 CFR 211; FDA Compliance Program Guidance Manual 7346.832',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 3 — Preclinical Data                                    */
      /* ================================================================ */

      {
        id: 'nonclinical_summary',
        section: 'preclinical',
        question:
          'Summarize the nonclinical pharmacology program supporting this IND. What in vitro and in vivo studies have been completed?',
        guidance:
          'Per ICH M3(R2) "Nonclinical Safety Studies for the Conduct of Human Clinical Trials," the nonclinical package supporting first-in-human dosing must include primary pharmacodynamics, secondary pharmacodynamics, safety pharmacology (ICH S7A/S7B), general toxicology, and genotoxicity. For biologics, also consider ICH S6(R1). Provide an integrated summary of both in vitro and in vivo findings, including target engagement, selectivity, and efficacy models.',
        fields: [
          {
            id: 'pharmacology_studies_completed',
            label: 'Primary Pharmacology Studies Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'in_vitro_studies_summary',
            label: 'In Vitro Studies Summary',
            type: 'textarea',
            placeholder:
              'e.g., Target binding assays demonstrated IC50 of 15 nM against [target]. Selectivity panel of 60+ receptors showed no significant off-target activity at 10 uM. Cell-based proliferation assays confirmed dose-dependent inhibition in [cell line] with EC50 of 45 nM.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'in_vivo_studies_summary',
            label: 'In Vivo Efficacy Studies Summary',
            type: 'textarea',
            placeholder:
              'e.g., Dose-dependent tumor growth inhibition in NSCLC xenograft models (60% TGI at 30 mg/kg QD). PK/PD modeling confirmed target coverage at projected human doses.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'species_used',
            label: 'Species Used in Nonclinical Program',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'mouse', label: 'Mouse' },
              { value: 'rat', label: 'Rat' },
              { value: 'rabbit', label: 'Rabbit' },
              { value: 'dog', label: 'Dog' },
              { value: 'cynomolgus_monkey', label: 'Cynomolgus Monkey' },
              { value: 'rhesus_monkey', label: 'Rhesus Monkey' },
              { value: 'minipig', label: 'Minipig' },
              { value: 'other', label: 'Other' },
            ],
            helpText: 'ICH M3(R2) requires toxicology in at least two species (one rodent, one non-rodent) for small molecules. For biologics (ICH S6(R1)), one pharmacologically relevant species may suffice.',
          },
          {
            id: 'safety_pharmacology_completed',
            label: 'ICH S7A Core Battery Safety Pharmacology Completed',
            type: 'yes_no',
            required: true,
            helpText: 'The ICH S7A core battery covers cardiovascular (including hERG per S7B), respiratory, and central nervous system endpoints.',
          },
          {
            id: 'immunogenicity_assessment_planned',
            label: 'Immunogenicity Assessment Plan in Place (biologics only)',
            type: 'yes_no',
            visibleWhen: { field: 'is_biologic', operator: 'eq', value: true },
            helpText: 'Per FDA Guidance on Immunogenicity Testing (2014) and ICH S6(R1), biologic products require an immunogenicity risk assessment and anti-drug antibody (ADA) assay strategy.',
          },
        ],
        defaultNext: 'toxicology',
        issueChecks: [
          {
            id: 'biologic_no_immunogenicity',
            condition: { field: 'immunogenicity_assessment_planned', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Biologic Product Missing Immunogenicity Assessment Plan',
            message:
              'Biologic products require an immunogenicity risk assessment and validated ADA assay strategy before Phase 1. FDA expects an immunogenicity assessment plan in the IND, including screening, confirmatory, and neutralizing antibody assays.',
            reference: 'FDA Guidance: Immunogenicity Testing of Therapeutic Protein Products (2014); ICH S6(R1)',
          },
        ],
      },

      {
        id: 'toxicology',
        section: 'preclinical',
        question:
          'Describe the toxicology program. What GLP-compliant studies have been completed, and what were the NOAEL and target organ findings?',
        guidance:
          'Per 21 CFR 312.23(a)(8) and ICH M3(R2), adequate nonclinical safety data must support the proposed first-in-human study. GLP-compliant pivotal toxicology studies (21 CFR Part 58) are required. The NOAEL from the most sensitive species is typically used to derive the maximum recommended starting dose (MRSD) per FDA Guidance for Industry: Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers (2005). Include duration of dosing adequate to support the proposed clinical duration per ICH M3(R2) Table 1.',
        fields: [
          {
            id: 'glp_tox_completed',
            label: 'GLP-Compliant Pivotal Toxicology Studies Completed',
            type: 'yes_no',
            required: true,
            helpText:
              'FDA requires GLP compliance (21 CFR Part 58) for pivotal safety studies. Non-GLP studies may support early development decisions but are insufficient for the IND safety package.',
          },
          {
            id: 'single_dose_tox_completed',
            label: 'Single-Dose Toxicology Completed',
            type: 'yes_no',
          },
          {
            id: 'repeat_dose_tox_completed',
            label: 'Repeat-Dose Toxicology Completed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'repeat_dose_duration',
            label: 'Duration of Repeat-Dose Studies',
            type: 'select',
            visibleWhen: { field: 'repeat_dose_tox_completed', operator: 'eq', value: true },
            options: [
              { value: '2_weeks', label: '2 Weeks' },
              { value: '4_weeks', label: '4 Weeks (28 Days)' },
              { value: '13_weeks', label: '13 Weeks' },
              { value: '26_weeks', label: '26 Weeks (6 Months)' },
              { value: '39_weeks', label: '39 Weeks (9 Months)' },
            ],
            helpText: 'Duration must support the proposed clinical dosing duration per ICH M3(R2) Table 1.',
          },
          {
            id: 'genetic_tox_completed',
            label: 'Genetic Toxicology (ICH S2(R1)) Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Standard battery: bacterial reverse mutation (Ames), in vitro chromosomal aberration or micronucleus, and in vivo micronucleus or equivalent.',
          },
          {
            id: 'noael_value',
            label: 'NOAEL (with species and units)',
            type: 'text',
            placeholder: 'e.g., 30 mg/kg/day in rat; 10 mg/kg/day in dog',
            required: true,
            helpText: 'No Observed Adverse Effect Level — this value drives the MRSD calculation for the proposed FIH dose.',
          },
          {
            id: 'target_organ_toxicity',
            label: 'Target Organ Toxicity Findings',
            type: 'textarea',
            placeholder: 'e.g., Dose-dependent hepatotoxicity (ALT elevation >3x ULN at ≥100 mg/kg in dog). Reversible bone marrow suppression in rat at 200 mg/kg.',
            helpText: 'Identify all target organs of toxicity and whether findings were reversible during recovery period.',
          },
          {
            id: 'carcinogenicity_needed',
            label: 'Are carcinogenicity studies needed per ICH S1A?',
            type: 'select',
            options: [
              { value: 'not_yet', label: 'Not yet — typically required before Phase 3 / NDA' },
              { value: 'completed', label: 'Completed' },
              { value: 'waived', label: 'Waived (with scientific justification)' },
            ],
            helpText: 'Per ICH S1A, carcinogenicity studies are generally required for drugs intended for continuous use ≥6 months or intermittent use for chronic conditions.',
          },
        ],
        defaultNext: 'proposed_study',
        issueChecks: [
          {
            id: 'glp_tox_required',
            condition: { field: 'glp_tox_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'GLP Toxicology Studies Required',
            message:
              'GLP-compliant pivotal toxicology studies (21 CFR Part 58) are required before initiating human studies. Absence of GLP tox data will result in a clinical hold per 21 CFR 312.42(b)(1)(ii).',
            reference: '21 CFR 312.23(a)(8); 21 CFR Part 58; ICH M3(R2)',
          },
          {
            id: 'genetic_tox_required',
            condition: { field: 'genetic_tox_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Genetic Toxicology Studies Required',
            message:
              'The ICH S2(R1) standard genotoxicity battery must be completed before first-in-human dosing. Missing genotoxicity data is grounds for clinical hold.',
            reference: 'ICH S2(R1); ICH M3(R2) Section 8',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 4 — Clinical Plan                                       */
      /* ================================================================ */

      {
        id: 'proposed_study',
        section: 'clinical_plan',
        question:
          'Describe the proposed clinical study. At minimum, one clinical protocol must accompany the initial IND per 21 CFR 312.23(a)(6).',
        guidance:
          'Per 21 CFR 312.23(a)(6), the IND must include a clinical protocol for each planned study. The protocol should describe objectives, design, dose, route, duration, monitoring plan, and statistical considerations. For first-in-human (FIH) studies, the starting dose rationale must be clearly justified from nonclinical data per FDA Guidance on Maximum Safe Starting Dose (2005). Include dose-limiting toxicity (DLT) definitions and escalation rules for Phase 1.',
        fields: [
          {
            id: 'proposed_indication',
            label: 'Proposed Indication',
            type: 'text',
            placeholder: 'e.g., Locally advanced or metastatic non-small cell lung cancer (NSCLC)',
            required: true,
          },
          {
            id: 'first_study_phase',
            label: 'Phase of First Study',
            type: 'select',
            required: true,
            options: [
              { value: 'phase_1_fih', label: 'Phase 1 — First-in-Human (FIH)' },
              { value: 'phase_1', label: 'Phase 1 — Not FIH (prior human experience)' },
              { value: 'phase_1b', label: 'Phase 1b (dose expansion / combination)' },
              { value: 'phase_2', label: 'Phase 2' },
            ],
          },
          {
            id: 'study_population',
            label: 'Study Population',
            type: 'select',
            required: true,
            options: [
              { value: 'healthy_volunteers', label: 'Healthy Volunteers' },
              { value: 'patients', label: 'Patients with Target Disease' },
              { value: 'both', label: 'Both (e.g., separate PK and efficacy cohorts)' },
            ],
          },
          {
            id: 'study_design_overview',
            label: 'Study Design Overview',
            type: 'textarea',
            placeholder:
              'e.g., Open-label, dose-escalation study using a 3+3 design followed by dose expansion cohorts in selected indications. DLT evaluation window of 28 days. Bayesian Optimal Interval (BOIN) design may be used.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'proposed_starting_dose',
            label: 'Proposed Starting Dose',
            type: 'text',
            placeholder: 'e.g., 1 mg once daily oral; or 0.1 mg/kg IV Q2W',
            required: true,
          },
          {
            id: 'dose_escalation_plan',
            label: 'Dose Escalation Plan',
            type: 'textarea',
            placeholder:
              'e.g., Modified Fibonacci scheme: 1 mg, 3 mg, 10 mg, 30 mg, 100 mg, 300 mg. DLT evaluation window of 28 days. CTCAE v5.0 grade ≥3 drug-related AE defines a DLT.',
            visibleWhen: {
              field: 'first_study_phase',
              operator: 'in',
              value: ['phase_1_fih', 'phase_1', 'phase_1b'],
            },
          },
          {
            id: 'planned_enrollment',
            label: 'Planned Enrollment (N)',
            type: 'number',
            placeholder: 'e.g., 30',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'primary_endpoints',
            label: 'Primary Endpoint(s)',
            type: 'textarea',
            placeholder: 'e.g., Safety and tolerability; maximum tolerated dose (MTD) determination; or ORR per RECIST v1.1',
            required: true,
          },
          {
            id: 'data_safety_monitoring',
            label: 'Data Safety Monitoring Plan',
            type: 'select',
            required: true,
            options: [
              { value: 'dsmb', label: 'Independent Data Safety Monitoring Board (DSMB)' },
              { value: 'src', label: 'Safety Review Committee (SRC)' },
              { value: 'sponsor_safety', label: 'Sponsor Internal Safety Review' },
              { value: 'not_defined', label: 'Not Yet Defined' },
            ],
            helpText: 'A structured safety monitoring plan is expected, especially for FIH studies. FDA may recommend a DSMB for certain high-risk trials.',
          },
        ],
        branches: [
          {
            when: { field: 'first_study_phase', operator: 'in', value: ['phase_1_fih'] },
            goto: 'starting_dose_justification',
          },
        ],
        defaultNext: 'investigator_brochure',
      },

      {
        id: 'starting_dose_justification',
        section: 'clinical_plan',
        question:
          'For this first-in-human study, how was the proposed starting dose derived? FDA expects a transparent dose justification linked to nonclinical data.',
        guidance:
          'Per FDA Guidance "Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers" (July 2005), the MRSD is typically calculated by applying a safety factor to the NOAEL converted to a human equivalent dose (HED) using body surface area (BSA) scaling. For biologics, the minimum anticipated biological effect level (MABEL) approach may be more appropriate, per EMA CHMP/SWP/28367/07 and FDA recommendations. The starting dose must provide an adequate safety margin.',
        fields: [
          {
            id: 'dose_derivation_method',
            label: 'Starting Dose Derivation Method',
            type: 'select',
            required: true,
            options: [
              { value: 'noael_hed', label: 'NOAEL-based HED (with BSA scaling per FDA 2005 guidance)' },
              { value: 'mabel', label: 'MABEL (Minimum Anticipated Biological Effect Level)' },
              { value: 'pad', label: 'Pharmacologically Active Dose (PAD) based' },
              { value: 'other', label: 'Other (explain below)' },
            ],
          },
          {
            id: 'safety_factor',
            label: 'Safety Factor Applied',
            type: 'text',
            placeholder: 'e.g., 1/10th the HED from NOAEL; 1/60th for MABEL-based',
            required: true,
            helpText: 'A standard safety factor of 1/10 the HED from the most sensitive species is typical per FDA guidance. Higher safety margins (1/20 to 1/60) may be needed for high-risk targets.',
          },
          {
            id: 'dose_calculation_narrative',
            label: 'Dose Calculation Narrative',
            type: 'textarea',
            placeholder:
              'e.g., NOAEL in dog = 10 mg/kg/day. HED = 10 mg/kg x (dog Km 20 / human Km 37) = 5.4 mg/kg. For 60 kg human: 324 mg. Safety factor 1/10 = 32 mg. Proposed starting dose = 25 mg (rounded down).',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'sentinel_dosing',
            label: 'Will sentinel dosing be used?',
            type: 'yes_no',
            helpText: 'Sentinel dosing (dosing 1-2 subjects before the remaining cohort) is recommended for FIH studies, especially for novel targets or high-risk mechanisms.',
          },
        ],
        defaultNext: 'investigator_brochure',
        provideExpertFeedback: true,
      },

      {
        id: 'investigator_brochure',
        section: 'clinical_plan',
        question:
          'Describe the status and content of the Investigator\'s Brochure (IB). Per 21 CFR 312.23(a)(5), the IB is a required component of the initial IND submission.',
        guidance:
          'Per 21 CFR 312.23(a)(5) and ICH E6(R2) Section 7, the Investigator\'s Brochure must contain all relevant nonclinical and clinical information known about the investigational product that is relevant to the study of the product in human subjects. The IB should be updated at least annually (21 CFR 312.55(a)) and whenever significant new information becomes available. The IB structure should follow ICH E6(R2) Section 7.4 and include: physical/chemical/pharmaceutical properties, nonclinical studies summary, clinical studies summary, marketing experience (if any), and a summary of data and guidance for the investigator.',
        fields: [
          {
            id: 'ib_version',
            label: 'Current IB Version / Edition',
            type: 'text',
            placeholder: 'e.g., IB Edition 1.0 (initial) or IB Edition 3.2 (updated)',
            required: true,
          },
          {
            id: 'ib_date',
            label: 'IB Date of Last Revision',
            type: 'date',
            required: true,
          },
          {
            id: 'ib_content_complete',
            label: 'Does the IB contain all required sections per ICH E6(R2) Section 7.4?',
            type: 'yes_no',
            required: true,
            helpText: 'Required sections: Title Page, Confidentiality Statement, Summary, Introduction, Physical/Chemical/Pharmaceutical Properties, Nonclinical Studies, Effects in Humans (if any), Summary of Data and Guidance for the Investigator.',
          },
          {
            id: 'ib_prior_human_experience',
            label: 'Does the IB include prior human experience with this compound (if any)?',
            type: 'select',
            options: [
              { value: 'no_prior', label: 'No prior human experience — first-in-human compound' },
              { value: 'included', label: 'Yes — prior human data included in IB' },
              { value: 'pending_inclusion', label: 'Prior data exists but not yet included' },
            ],
          },
          {
            id: 'ib_risk_summary',
            label: 'IB Risk Summary for Investigators',
            type: 'textarea',
            placeholder: 'e.g., Key risks identified from nonclinical studies include hepatotoxicity (reversible, dose-dependent in dog) and QTc prolongation (hERG IC50 margin of 30x). Monitoring plan: LFTs Q2W for first 3 months, ECG at screening and C1D15.',
            helpText: 'The IB should provide the investigator with clear guidance on anticipated risks and recommended monitoring. This drives the protocol safety monitoring plan.',
          },
        ],
        defaultNext: 'investigator_info',
      },

      {
        id: 'investigator_info',
        section: 'clinical_plan',
        question:
          'Provide details about the principal investigator(s) and planned clinical sites. Each site requires Form FDA 1572 and IRB approval.',
        guidance:
          'Per 21 CFR 312.53, each participating investigator must complete Form FDA 1572 (Statement of Investigator), which outlines qualifications, commitments, and the IRB overseeing the study. The PI must be qualified by training and experience as an appropriate expert per 21 CFR 312.53(c)(1). Institutional Review Board approval is required per 21 CFR Part 56 before any study activities can begin, including informed consent per 21 CFR Part 50.',
        fields: [
          {
            id: 'pi_name',
            label: 'Principal Investigator Name',
            type: 'text',
            placeholder: 'e.g., John Doe, MD, PhD',
            required: true,
          },
          {
            id: 'pi_institution',
            label: 'PI Institution',
            type: 'text',
            placeholder: 'e.g., Massachusetts General Hospital',
            required: true,
          },
          {
            id: 'pi_qualifications_summary',
            label: 'PI Qualifications Summary',
            type: 'textarea',
            placeholder:
              'e.g., Board-certified oncologist with 15 years of experience in NSCLC clinical trials. Has served as PI on 12 prior Phase 1-3 studies. Member of ASCO and ESMO.',
            required: true,
            validation: { minLength: 30 },
          },
          {
            id: 'number_of_planned_sites',
            label: 'Number of Planned Sites',
            type: 'number',
            placeholder: 'e.g., 5',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'fda_1572_status',
            label: 'Form FDA 1572 Status',
            type: 'select',
            required: true,
            options: [
              { value: 'signed', label: 'Signed and Ready' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'not_started', label: 'Not Started' },
            ],
            helpText: 'Form FDA 1572 must be signed by each investigator before they can participate in the study (21 CFR 312.53).',
          },
          {
            id: 'irb_status',
            label: 'IRB Approval Status',
            type: 'select',
            required: true,
            options: [
              { value: 'approved', label: 'Approved' },
              { value: 'pending', label: 'Pending Review' },
              { value: 'not_submitted', label: 'Not Yet Submitted' },
            ],
          },
          {
            id: 'central_irb_used',
            label: 'Using a Central / Commercial IRB?',
            type: 'yes_no',
            helpText: 'Per the 2018 Common Rule revision (45 CFR 46.114), single-IRB review is mandated for federally-funded multi-site studies. Many sponsors now use a central IRB to streamline the approval process.',
          },
          {
            id: 'informed_consent_status',
            label: 'Informed Consent Document Status',
            type: 'select',
            options: [
              { value: 'finalized', label: 'Finalized' },
              { value: 'draft', label: 'Draft Under Review' },
              { value: 'not_started', label: 'Not Started' },
            ],
            helpText: 'Informed consent must meet 21 CFR Part 50 requirements and must be IRB-approved before any subject enrollment.',
          },
        ],
        defaultNext: 'safety_reporting_plan',
        issueChecks: [
          {
            id: 'irb_not_submitted',
            condition: { field: 'irb_status', operator: 'eq', value: 'not_submitted' },
            severity: 'warning',
            title: 'IRB Submission Not Initiated',
            message:
              'IRB approval (21 CFR Part 56) is required before enrolling any subject. While not required for IND filing, IRB submission should begin promptly to avoid delays in study start after the 30-day review period.',
            reference: '21 CFR Part 56; 21 CFR 312.40',
          },
        ],
      },

      {
        id: 'safety_reporting_plan',
        section: 'clinical_plan',
        question:
          'Describe the safety reporting plan for the IND. FDA requires timely reporting of serious adverse events and annual reports.',
        guidance:
          'Per 21 CFR 312.32, the sponsor must report to FDA any suspected adverse reaction that is both serious and unexpected (SUSAR) within 15 calendar days of initial receipt (7 days for fatal or life-threatening events). IND Safety Reports must be submitted per 21 CFR 312.32(c) using Form FDA 3500A (MedWatch). The sponsor must also notify all participating investigators per 21 CFR 312.32(c)(1)(iii). Annual reports are due per 21 CFR 312.33 within 60 days of the IND anniversary date. Per ICH E2A, the sponsor must maintain a Development Safety Update Report (DSUR) framework.',
        fields: [
          {
            id: 'safety_reporting_sops',
            label: 'Safety Reporting SOPs in Place',
            type: 'yes_no',
            required: true,
            helpText: 'SOPs must cover: AE/SAE collection, causality assessment, expedited reporting (IND Safety Reports per 21 CFR 312.32), investigator notification, IRB notification, and annual reporting.',
          },
          {
            id: 'pharmacovigilance_system',
            label: 'Pharmacovigilance / Safety Database System',
            type: 'select',
            required: true,
            options: [
              { value: 'argus', label: 'Oracle Argus Safety' },
              { value: 'aris_g', label: 'ArisGlobal LifeSphere' },
              { value: 'veeva_vault', label: 'Veeva Vault Safety' },
              { value: 'other_validated', label: 'Other Validated Safety Database' },
              { value: 'manual', label: 'Manual / Spreadsheet-based (small sponsor)' },
              { value: 'not_established', label: 'Not Yet Established' },
            ],
          },
          {
            id: 'susar_reporting_timeline',
            label: 'Confirmed SUSAR Reporting Timeline Awareness',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 312.32: 7 calendar days for fatal/life-threatening SUSARs (with 8-day follow-up); 15 calendar days for all other SUSARs. Are these timelines built into your safety SOPs?',
          },
          {
            id: 'dsur_plan',
            label: 'Development Safety Update Report (DSUR) Plan',
            type: 'select',
            options: [
              { value: 'planned', label: 'DSUR planned per ICH E2F' },
              { value: 'annual_report_only', label: 'IND Annual Report (21 CFR 312.33) only' },
              { value: 'both', label: 'Both DSUR (ICH E2F) and IND Annual Report' },
            ],
            helpText: 'ICH E2F recommends annual DSURs for all investigational products. The FDA IND Annual Report (21 CFR 312.33) is separately required and due within 60 days of the IND anniversary.',
          },
          {
            id: 'safety_monitoring_plan_detail',
            label: 'Key Safety Monitoring Parameters in Protocol',
            type: 'textarea',
            placeholder: 'e.g., LFTs (AST, ALT, bilirubin, ALP) at baseline, C1D15, and Q4W thereafter. ECG at screening, C1D1 pre/post-dose, C1D15, C2D1. CBC with differential weekly for first 8 weeks.',
          },
        ],
        defaultNext: 'prior_submissions',
      },

      /* ================================================================ */
      /*  Section 5 — Regulatory History                                  */
      /* ================================================================ */

      {
        id: 'prior_submissions',
        section: 'reg_history',
        question:
          'Have you had any previous interactions with the FDA regarding this product? Pre-IND meetings and prior correspondence can significantly shape the IND strategy.',
        guidance:
          'Per 21 CFR 312.82 and the FDA Guidance "Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products" (2017), sponsors may request a Pre-IND (Type B) meeting to discuss IND content, nonclinical requirements, clinical trial design, and CMC strategy. FDA responses from Pre-IND meetings should be addressed in the IND submission. Include Type A, B, or C meeting minutes and any FDA written responses.',
        fields: [
          {
            id: 'previous_fda_interactions',
            label: 'Any Previous FDA Interactions Regarding This Product?',
            type: 'yes_no',
          },
          {
            id: 'pre_ind_meeting',
            label: 'Pre-IND Meeting Held',
            type: 'yes_no',
          },
          {
            id: 'pre_ind_meeting_date',
            label: 'Pre-IND Meeting Date',
            type: 'date',
            visibleWhen: { field: 'pre_ind_meeting', operator: 'eq', value: true },
          },
          {
            id: 'fda_feedback_summary',
            label: 'FDA Feedback Summary',
            type: 'textarea',
            placeholder:
              'Summarize key FDA recommendations from the Pre-IND meeting or written responses. Identify any outstanding FDA requests that must be addressed in the IND.',
            visibleWhen: { field: 'pre_ind_meeting', operator: 'eq', value: true },
            validation: { minLength: 30 },
          },
          {
            id: 'fda_division',
            label: 'FDA Review Division',
            type: 'text',
            placeholder: 'e.g., Division of Oncology Products 1, Office of New Drugs / CDER',
            helpText: 'Knowing the review division helps anticipate expectations and timing. You can find this from the Pre-IND meeting or FDA correspondence.',
          },
          {
            id: 'related_inds',
            label: 'Related INDs (if any)',
            type: 'textarea',
            placeholder: 'e.g., IND 123456 (predecessor compound), IND 789012 (combination partner)',
            helpText: 'Cross-reference any related IND submissions for the same compound, related compounds, or combination partners.',
          },
          {
            id: 'clinical_hold_history',
            label: 'Has this or a related compound ever been placed on clinical hold?',
            type: 'yes_no',
            helpText: 'If yes, address the resolution in your IND. FDA will review this history carefully (21 CFR 312.42).',
          },
        ],
        branches: [
          {
            when: { field: 'ind_application_type', operator: 'eq', value: 'amendment' },
            goto: 'amendment_change_summary',
          },
        ],
        defaultNext: 'ind_review',
      },

      {
        id: 'amendment_change_summary',
        section: 'reg_history',
        question:
          'Since this is an IND amendment, provide a detailed summary of what has changed since the last submission. FDA reviewers need a clear description of all modifications.',
        guidance:
          'Per 21 CFR 312.31 (Amendments to an IND), amendments must describe the nature and significance of each change. Protocol amendments (21 CFR 312.30) must describe the change, the rationale, and any effect on subject safety. CMC amendments must describe manufacturing changes and their impact on product quality. Safety reports (21 CFR 312.32) must be filed as IND Safety Reports. Information amendments (21 CFR 312.31(b)) cover all other changes. Ensure the amendment cover letter provides a clear summary of changes with cross-references to the affected sections.',
        fields: [
          {
            id: 'amendment_rationale',
            label: 'Amendment Rationale — Why is this amendment being submitted?',
            type: 'textarea',
            placeholder: 'e.g., Protocol amendment to add a new dose expansion cohort based on emerging efficacy signals at 100 mg. Also includes updated IB with 6-month toxicology data and revised CMC section reflecting manufacturing site transfer.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'protocol_changes_summary',
            label: 'Protocol Changes Summary (if applicable)',
            type: 'textarea',
            placeholder: 'e.g., Added expansion cohort C (NSCLC with EGFR exon 20 insertion). Modified inclusion criteria to allow prior immunotherapy. Updated DLT definition to exclude Grade 3 rash lasting <72 hours.',
            visibleWhen: { field: 'amendment_scope', operator: 'contains', value: 'protocol' },
          },
          {
            id: 'cmc_changes_summary',
            label: 'CMC Changes Summary (if applicable)',
            type: 'textarea',
            placeholder: 'e.g., Manufacturing site transfer from Site A to Site B. Updated drug substance specification (tightened impurity limits). New stability data supporting 24-month shelf life.',
            visibleWhen: { field: 'amendment_scope', operator: 'contains', value: 'cmc_change' },
          },
          {
            id: 'safety_impact_assessment',
            label: 'Impact of Changes on Subject Safety',
            type: 'textarea',
            placeholder: 'e.g., No new safety concerns identified. The additional dose expansion cohort will use the same dose range previously evaluated. Updated IB reflects no new safety signals.',
            required: true,
          },
          {
            id: 'irb_notification_status',
            label: 'IRB Notification of Amendment',
            type: 'select',
            required: true,
            options: [
              { value: 'approved', label: 'IRB has approved the amendment' },
              { value: 'submitted', label: 'Submitted to IRB — pending approval' },
              { value: 'not_submitted', label: 'Not yet submitted to IRB' },
            ],
            helpText: 'Per 21 CFR 56.108(a)(4), significant protocol amendments require IRB review and approval before implementation (except for safety-related changes that may be implemented immediately).',
          },
        ],
        defaultNext: 'ind_review',
        provideExpertFeedback: true,
      },

      {
        id: 'ind_review',
        section: 'reg_history',
        question:
          'Let\'s cover the submission timeline, environmental considerations, and final regulatory checklist.',
        guidance:
          'Per 21 CFR 312.40, the FDA has 30 calendar days to review an IND before clinical trials may proceed. If FDA does not place a clinical hold within 30 days, the IND goes into effect and studies may begin. A Special Protocol Assessment (SPA, 21 CFR 312.82 and FDA Guidance 2018) adds 45 days of FDA review for protocol agreement. Per 21 CFR 312.23(a)(7)(iv)(e), an Environmental Assessment (EA) or Categorical Exclusion (CE) per 21 CFR Part 25 must be included. REMS evaluation is required per 21 USC 355-1 (FDAAA Section 505-1).',
        fields: [
          {
            id: 'target_ind_submission_date',
            label: 'Target IND Submission Date',
            type: 'date',
            required: true,
          },
          {
            id: 'thirty_day_review_awareness',
            label: 'Aware of 30-Day FDA Review Period (21 CFR 312.40)',
            type: 'yes_no',
            required: true,
            helpText:
              'Confirm you understand that FDA has 30 calendar days to review the IND. If no clinical hold is issued, the IND is active and clinical trials may proceed.',
          },
          {
            id: 'spa_requested',
            label: 'Special Protocol Assessment (SPA) Requested',
            type: 'yes_no',
            helpText: 'An SPA (21 CFR 312.82) provides binding FDA agreement on trial design, endpoints, and statistical analysis. FDA has 45 days to respond.',
          },
          {
            id: 'environmental_assessment',
            label: 'Environmental Assessment or Categorical Exclusion',
            type: 'select',
            required: true,
            options: [
              { value: 'categorical_exclusion', label: 'Categorical Exclusion (21 CFR 25.31(a))', description: 'Most IND clinical investigations qualify' },
              { value: 'ea_prepared', label: 'Environmental Assessment Prepared (21 CFR Part 25)' },
              { value: 'not_addressed', label: 'Not Yet Addressed' },
            ],
            helpText: 'Per 21 CFR 25.31(a), most IND submissions qualify for a categorical exclusion from the requirement to prepare an environmental assessment.',
          },
          {
            id: 'rems_assessment',
            label: 'Has a REMS evaluation been performed?',
            type: 'select',
            options: [
              { value: 'rems_not_needed', label: 'REMS not anticipated at this stage' },
              { value: 'rems_likely', label: 'REMS likely required — preliminary plan prepared' },
              { value: 'not_assessed', label: 'Not yet assessed' },
            ],
            helpText: 'Per FDAAA Section 505-1 (21 USC 355-1), FDA may require a Risk Evaluation and Mitigation Strategy for products with known serious safety risks.',
          },
          {
            id: 'additional_notes',
            label: 'Additional Notes or Regulatory Considerations',
            type: 'textarea',
            placeholder:
              'Any additional information, concerns, or known regulatory risks for this IND submission...',
          },
        ],
        branches: [
          {
            when: { field: 'ind_type_selection', operator: 'eq', value: 'emergency' },
            goto: null,
          },
        ],
        defaultNext: 'drug_substance_characterization',
        issueChecks: [
          {
            id: 'spa_timeline_impact',
            condition: { field: 'spa_requested', operator: 'eq', value: true },
            severity: 'info',
            title: 'SPA Request — Additional Review Timeline',
            message:
              'A Special Protocol Assessment adds 45 days to the FDA review timeline. Ensure the protocol is finalized before SPA submission. FDA agreement is binding unless the sponsor fails to follow the agreed-upon protocol.',
            reference: '21 CFR 312.82; FDA Guidance: Special Protocol Assessment (2018)',
          },
          {
            id: 'environmental_not_addressed',
            condition: { field: 'environmental_assessment', operator: 'eq', value: 'not_addressed' },
            severity: 'warning',
            title: 'Environmental Assessment Not Addressed',
            message:
              'An environmental assessment or categorical exclusion claim (21 CFR Part 25) must be included in the IND. Most clinical investigations qualify for a categorical exclusion per 21 CFR 25.31(a), but the claim must be explicitly stated.',
            reference: '21 CFR Part 25; 21 CFR 312.23(a)(7)(iv)(e)',
          },
          {
            id: 'rems_not_assessed',
            condition: { field: 'rems_assessment', operator: 'eq', value: 'not_assessed' },
            severity: 'info',
            title: 'REMS Evaluation Not Performed',
            message:
              'While REMS is typically not required at the IND stage, it is prudent to assess REMS potential early. Known safety signals (e.g., QTc prolongation, hepatotoxicity, teratogenicity) may require a REMS plan during development.',
            reference: '21 USC 355-1 (FDAAA Section 505-1)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 6 — CMC Deep Dive                                       */
      /* ================================================================ */

      {
        id: 'drug_substance_characterization',
        section: 'cmc_deep_dive',
        question:
          'Provide detailed characterization of the drug substance. What is the molecular structure, physicochemical profile, and control strategy?',
        guidance:
          'Per 21 CFR 312.23(a)(7)(iv)(a) and ICH Q6A (Specifications: Test Procedures and Acceptance Criteria for New Drug Substances and New Drug Products: Chemical Substances), the IND must include a description of the drug substance, its physical and chemical characteristics, stability, and analytical controls. For chiral compounds, identify the stereochemistry and enantiomeric purity. Describe any known polymorphs (ICH Q6A Decision Tree #4) and their impact on bioavailability. Include stability-indicating analytical methods.',
        fields: [
          {
            id: 'molecular_formula',
            label: 'Molecular Formula and Weight',
            type: 'text',
            placeholder: 'e.g., C21H25ClFN3O5, MW = 453.9 g/mol',
            required: true,
          },
          {
            id: 'chemical_structure_description',
            label: 'Chemical Structure Description or Class',
            type: 'textarea',
            placeholder: 'e.g., Pyrimidine-based small molecule with a fluorophenyl moiety. Structure confirmed by NMR, MS, and X-ray crystallography.',
            required: true,
          },
          {
            id: 'physicochemical_properties',
            label: 'Key Physicochemical Properties',
            type: 'textarea',
            placeholder: 'e.g., pKa = 6.8, logP = 2.3, aqueous solubility = 0.5 mg/mL at pH 7.4, melting point = 185-188°C. BCS Class II (low solubility, high permeability).',
            required: true,
          },
          {
            id: 'polymorphism',
            label: 'Polymorphism Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'single_form', label: 'Single crystalline form identified' },
              { value: 'multiple_forms', label: 'Multiple polymorphs identified — form selection justified' },
              { value: 'amorphous', label: 'Amorphous material used' },
              { value: 'not_assessed', label: 'Polymorph screening not yet completed' },
            ],
            helpText: 'Per ICH Q6A Decision Tree #4, polymorphism must be assessed if it could affect drug product performance (solubility, dissolution, bioavailability).',
          },
          {
            id: 'chirality',
            label: 'Chirality Assessment',
            type: 'select',
            options: [
              { value: 'achiral', label: 'Achiral molecule' },
              { value: 'single_enantiomer', label: 'Single enantiomer — enantiomeric purity controlled' },
              { value: 'racemate', label: 'Racemic mixture — justified for development' },
              { value: 'na_biologic', label: 'Not applicable (biologic)' },
            ],
            helpText: 'Per FDA Policy Statement on Development of New Stereoisomeric Drugs (1992), single-enantiomer development is generally preferred. A racemate requires justification.',
          },
          {
            id: 'stability_indicating_methods',
            label: 'Are stability-indicating analytical methods developed and validated?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q2(R2), stability-indicating methods must be validated and capable of detecting degradation products. HPLC or UPLC gradient methods are typical.',
          },
        ],
        defaultNext: 'drug_product_composition',
        provideExpertFeedback: true,
      },

      {
        id: 'drug_product_composition',
        section: 'cmc_deep_dive',
        question:
          'Describe the drug product composition in detail, including excipient justification and container closure system.',
        guidance:
          'Per 21 CFR 312.23(a)(7)(iv)(a), the IND must describe the drug product composition, including all components and their amounts. Excipient selection should be justified by reference to the FDA Inactive Ingredients Guide (IIG) database with regard to route and maximum daily exposure. The container closure system must meet 21 CFR 211.94 requirements and be suitable for its intended use. Compatibility studies between drug product and container closure system should be summarized, especially for parenteral products (USP <661>, <381>).',
        fields: [
          {
            id: 'quantitative_composition',
            label: 'Quantitative Composition (per dosage unit)',
            type: 'textarea',
            placeholder:
              'e.g., Drug substance: 50 mg\nMicrocrystalline cellulose: 120 mg\nCroscarmellose sodium: 15 mg\nMagnesium stearate: 2 mg\nTotal tablet weight: 187 mg',
            required: true,
          },
          {
            id: 'excipient_iig_status',
            label: 'Are all excipients listed in the FDA IIG database for the proposed route and dose?',
            type: 'yes_no',
            required: true,
            helpText: 'Check the FDA Inactive Ingredients Guide (IIG) at https://www.accessdata.fda.gov/scripts/cder/iig/ to confirm each excipient is approved for the proposed route and does not exceed the established maximum potency.',
          },
          {
            id: 'container_closure_system',
            label: 'Container Closure System',
            type: 'textarea',
            placeholder: 'e.g., 30-count HDPE bottle with polypropylene child-resistant cap and heat-induction seal. Desiccant included. Or: 10 mL Type I borosilicate glass vial with 20 mm bromobutyl rubber stopper and aluminum flip-off seal.',
            required: true,
          },
          {
            id: 'container_closure_validated',
            label: 'Container closure compatibility/extractables & leachables (E&L) studies completed?',
            type: 'yes_no',
            helpText: 'Per 21 CFR 211.94 and USP <1663>/<1664>, container closure integrity and E&L studies are required, especially for parenteral and inhaled products.',
          },
          {
            id: 'compatibility_studies',
            label: 'Drug Product-Container Compatibility Studies Summary',
            type: 'textarea',
            placeholder: 'e.g., Accelerated stability samples stored in contact with proposed container showed no adsorption, no leachables above AET, no change in potency or degradation profile through 6 months.',
            visibleWhen: { field: 'container_closure_validated', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'stability_program',
        issueChecks: [
          {
            id: 'container_closure_not_validated',
            condition: { field: 'container_closure_validated', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Container Closure Compatibility Not Validated',
            message:
              'Container closure compatibility studies, including extractables and leachables (E&L) assessment, should be completed per 21 CFR 211.94 and USP <1663>/<1664>. This is especially critical for parenteral, ophthalmic, and inhaled products.',
            reference: '21 CFR 211.94; USP <1663>, <1664>; FDA Guidance: Container Closure Systems for Packaging Human Drugs and Biologics (1999)',
          },
        ],
      },

      {
        id: 'stability_program',
        section: 'cmc_deep_dive',
        question:
          'Describe the stability program for the drug substance and drug product. What data are available to support the proposed shelf life and storage conditions?',
        guidance:
          'Per ICH Q1A(R2) "Stability Testing of New Drug Substances and Drug Products," stability studies must include long-term (25°C/60% RH), accelerated (40°C/75% RH), and, where relevant, intermediate (30°C/65% RH) conditions. Forced degradation (stress testing) per ICH Q1A(R2) Section 2.1.2 should demonstrate specificity of the stability-indicating method. At the IND stage, sufficient stability data must support the proposed clinical trial duration. A minimum of 1-2 months accelerated data and available long-term data should be included per ICH Q1A(R2) and 21 CFR 312.23(a)(7)(iv)(b).',
        fields: [
          {
            id: 'long_term_stability_data',
            label: 'Long-Term Stability Data Available (25°C/60% RH)',
            type: 'select',
            required: true,
            options: [
              { value: 'none', label: 'No long-term data available yet' },
              { value: '1_month', label: '1 month' },
              { value: '3_months', label: '3 months' },
              { value: '6_months', label: '6 months' },
              { value: '9_months', label: '9 months' },
              { value: '12_months', label: '12 months' },
              { value: '18_months', label: '18+ months' },
            ],
          },
          {
            id: 'accelerated_stability_data',
            label: 'Accelerated Stability Data Available (40°C/75% RH)',
            type: 'select',
            required: true,
            options: [
              { value: 'none', label: 'No accelerated data available yet' },
              { value: '1_month', label: '1 month' },
              { value: '3_months', label: '3 months' },
              { value: '6_months', label: '6 months' },
            ],
          },
          {
            id: 'forced_degradation_completed',
            label: 'Forced Degradation / Stress Testing Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Stress testing per ICH Q1A(R2) Section 2.1.2 should include acid/base hydrolysis, oxidation, photolysis (ICH Q1B), and thermal degradation to demonstrate method specificity.',
          },
          {
            id: 'proposed_shelf_life',
            label: 'Proposed Shelf Life for Clinical Supply',
            type: 'text',
            placeholder: 'e.g., 24 months at 2-8°C; or 18 months at 25°C/60% RH',
            required: true,
          },
          {
            id: 'proposed_storage_conditions',
            label: 'Proposed Storage Conditions',
            type: 'select',
            required: true,
            options: [
              { value: 'room_temp', label: 'Room Temperature (15-30°C)' },
              { value: 'controlled_room', label: 'Controlled Room Temperature (20-25°C)' },
              { value: 'refrigerated', label: 'Refrigerated (2-8°C)' },
              { value: 'frozen', label: 'Frozen (-20°C or below)' },
              { value: 'ultra_cold', label: 'Ultra-Cold (-60°C to -80°C)' },
            ],
          },
          {
            id: 'photostability_tested',
            label: 'Photostability Testing Performed per ICH Q1B',
            type: 'yes_no',
            helpText: 'ICH Q1B requires confirmatory photostability testing to demonstrate that light exposure does not cause unacceptable change.',
          },
        ],
        defaultNext: 'pk_pd_assessment',
        issueChecks: [
          {
            id: 'no_stability_data',
            condition: { field: 'accelerated_stability_data', operator: 'eq', value: 'none' },
            severity: 'critical',
            title: 'No Stability Data Available',
            message:
              'ICH Q1A(R2) requires stability data at submission. At minimum, preliminary accelerated stability data (1-3 months at 40°C/75% RH) should be available for the IND. Absence of any stability data may result in a Refuse to File or clinical hold.',
            reference: 'ICH Q1A(R2); 21 CFR 312.23(a)(7)(iv)(b)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 7 — Clinical Pharmacology                               */
      /* ================================================================ */

      {
        id: 'pk_pd_assessment',
        section: 'clinical_pharmacology',
        question:
          'Describe the clinical pharmacology program. What PK/PD, ADME, and bioavailability data are available or planned?',
        guidance:
          'Per 21 CFR 312.23(a)(7)(ii), the IND must include a summary of the pharmacokinetic and pharmacodynamic properties of the drug, including ADME (absorption, distribution, metabolism, and excretion) characterization. For oral drugs, bioavailability and food effect assessment are expected per FDA Guidance "Food-Effect Bioavailability and Fed Bioequivalence Studies" (2002, revised 2022). PK/PD modeling to support dose selection is increasingly expected by FDA, especially for oncology (ICH E4).',
        fields: [
          {
            id: 'nonclinical_pk_summary',
            label: 'Nonclinical PK Summary (ADME)',
            type: 'textarea',
            placeholder: 'e.g., Oral bioavailability: 45% (rat), 62% (dog). t1/2: 4.5h (rat), 8.2h (dog). Primary metabolism via CYP3A4 with minor CYP2D6 contribution. Renal excretion: 25% unchanged drug. High protein binding (>99%).',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'dose_proportionality',
            label: 'Dose Proportionality Observed in Nonclinical Studies?',
            type: 'select',
            options: [
              { value: 'linear', label: 'Yes — Linear / dose-proportional PK' },
              { value: 'non_linear', label: 'No — Non-linear PK observed (describe below)' },
              { value: 'not_assessed', label: 'Not yet fully assessed' },
            ],
          },
          {
            id: 'pk_pd_modeling',
            label: 'PK/PD Modeling Performed',
            type: 'yes_no',
            helpText: 'PK/PD modeling to project human doses and exposures is highly recommended by FDA. Include population PK or PBPK modeling if available.',
          },
          {
            id: 'food_effect_study_planned',
            label: 'Food Effect Study Planned (oral products)?',
            type: 'yes_no',
            visibleWhen: { field: 'route_of_administration', operator: 'eq', value: 'oral' },
            helpText: 'Per FDA Guidance "Food-Effect Bioavailability and Fed Bioequivalence Studies" (2022), a food effect study is recommended early in development for oral products to determine whether administration with food significantly alters PK.',
          },
          {
            id: 'bioavailability_estimate',
            label: 'Estimated Human Bioavailability (if available)',
            type: 'text',
            placeholder: 'e.g., Predicted 35-50% based on allometric scaling from preclinical species',
          },
          {
            id: 'half_life_estimate',
            label: 'Projected Human Half-Life',
            type: 'text',
            placeholder: 'e.g., Projected t1/2 of 12-18 hours based on allometric scaling',
          },
        ],
        defaultNext: 'drug_drug_interactions',
        provideExpertFeedback: true,
      },

      {
        id: 'drug_drug_interactions',
        section: 'clinical_pharmacology',
        question:
          'What drug-drug interaction (DDI) assessments have been completed or are planned? In vitro CYP and transporter profiling are expected at the IND stage.',
        guidance:
          'Per FDA Guidance "In Vitro Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions" (January 2020) and "Clinical Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions" (January 2020), the sponsor must characterize the drug\'s metabolic pathway (CYP enzymes), assess whether it is a CYP inhibitor or inducer, and evaluate key transporter interactions (P-gp, BCRP, OATP1B1, OATP1B3, OCT2, OAT1, OAT3, MATE1, MATE2-K). The FDA DDI Decision Trees (Figure 1-7 of the 2020 guidance) dictate when clinical DDI studies are required.',
        fields: [
          {
            id: 'cyp450_profiling',
            label: 'CYP450 Metabolism Profiling Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA 2020 DDI Guidance, reaction phenotyping should identify all CYP enzymes contributing ≥25% to total metabolism. Major CYPs to evaluate: CYP1A2, 2B6, 2C8, 2C9, 2C19, 2D6, 3A4.',
          },
          {
            id: 'primary_cyp_enzymes',
            label: 'Primary CYP Enzyme(s) Responsible for Metabolism',
            type: 'multi_select',
            visibleWhen: { field: 'cyp450_profiling', operator: 'eq', value: true },
            options: [
              { value: 'cyp3a4', label: 'CYP3A4' },
              { value: 'cyp2d6', label: 'CYP2D6' },
              { value: 'cyp2c9', label: 'CYP2C9' },
              { value: 'cyp2c19', label: 'CYP2C19' },
              { value: 'cyp2c8', label: 'CYP2C8' },
              { value: 'cyp1a2', label: 'CYP1A2' },
              { value: 'cyp2b6', label: 'CYP2B6' },
              { value: 'non_cyp', label: 'Non-CYP (UGT, FMO, AO, etc.)' },
            ],
          },
          {
            id: 'cyp_inhibition_assessed',
            label: 'CYP Inhibition Potential Assessed (reversible and time-dependent)?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'cyp_induction_assessed',
            label: 'CYP Induction Potential Assessed (PXR/CAR activation)?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'transporter_studies_completed',
            label: 'Transporter Interaction Studies Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per FDA 2020 DDI Guidance, evaluate the drug as a substrate and inhibitor of: P-gp, BCRP, OATP1B1, OATP1B3, OCT2, OAT1, OAT3, MATE1, MATE2-K.',
          },
          {
            id: 'transporters_assessed',
            label: 'Transporters Evaluated',
            type: 'multi_select',
            visibleWhen: { field: 'transporter_studies_completed', operator: 'eq', value: true },
            options: [
              { value: 'pgp', label: 'P-glycoprotein (P-gp / MDR1)' },
              { value: 'bcrp', label: 'BCRP' },
              { value: 'oatp1b1', label: 'OATP1B1' },
              { value: 'oatp1b3', label: 'OATP1B3' },
              { value: 'oct2', label: 'OCT2' },
              { value: 'oat1', label: 'OAT1' },
              { value: 'oat3', label: 'OAT3' },
              { value: 'mate1', label: 'MATE1' },
              { value: 'mate2k', label: 'MATE2-K' },
            ],
          },
          {
            id: 'clinical_ddi_studies_planned',
            label: 'Clinical DDI Studies Planned',
            type: 'textarea',
            placeholder: 'e.g., Study with strong CYP3A4 inhibitor (itraconazole) planned for Phase 1 Part B. Strong inducer study (rifampin) planned if PK confirms CYP3A4 as major pathway.',
          },
        ],
        defaultNext: 'qtc_assessment',
        issueChecks: [
          {
            id: 'cyp3a4_substrate_no_ddi',
            condition: { field: 'primary_cyp_enzymes', operator: 'contains', value: 'cyp3a4' },
            severity: 'warning',
            title: 'CYP3A4 Substrate — Clinical DDI Studies Expected',
            message:
              'This drug is metabolized by CYP3A4. Per FDA DDI Guidance (2020) Figure 4, clinical studies with a strong CYP3A4 inhibitor (e.g., itraconazole, ketoconazole) and strong inducer (e.g., rifampin) are expected. Plan these studies early in development.',
            reference: 'FDA Guidance: Clinical Drug Interaction Studies (January 2020)',
          },
          {
            id: 'cyp450_not_profiled',
            condition: { field: 'cyp450_profiling', operator: 'eq', value: false },
            severity: 'warning',
            title: 'CYP450 Profiling Not Completed',
            message:
              'In vitro CYP reaction phenotyping is expected at the IND stage per FDA 2020 DDI Guidance. Without this data, FDA cannot assess DDI risk and may request it during the 30-day review.',
            reference: 'FDA Guidance: In Vitro Drug Interaction Studies (January 2020)',
          },
        ],
      },

      {
        id: 'qtc_assessment',
        section: 'clinical_pharmacology',
        question:
          'What is the QTc/cardiac safety assessment strategy? Has the drug\'s potential for QT prolongation been evaluated?',
        guidance:
          'Per ICH E14 "Clinical Evaluation of QT/QTc Interval Prolongation and Proarrhythmic Potential for Non-Antiarrhythmic Drugs" (R3, 2015) and ICH S7B "Nonclinical Evaluation of the Potential for Delayed Ventricular Repolarization," the sponsor must assess the drug\'s potential for QT prolongation. The traditional approach requires a dedicated Thorough QT (TQT) study. The ICH E14 Q&A (R3) allows an alternative concentration-QTc (C-QTc) modeling approach using ECG data from Phase 1. The nonclinical hERG assay (ICH S7B) should be completed before FIH dosing.',
        fields: [
          {
            id: 'herg_assay_completed',
            label: 'hERG Channel Assay Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH S7B, the in vitro hERG assay is required before first-in-human dosing. Report the IC50 and the therapeutic margin (IC50 / projected Cmax).',
          },
          {
            id: 'herg_ic50',
            label: 'hERG IC50 Value and Therapeutic Margin',
            type: 'text',
            placeholder: 'e.g., hERG IC50 = 15 uM; projected human Cmax = 0.5 uM; margin = 30x',
            visibleWhen: { field: 'herg_assay_completed', operator: 'eq', value: true },
          },
          {
            id: 'qtc_strategy',
            label: 'QTc Assessment Strategy',
            type: 'select',
            required: true,
            options: [
              { value: 'tqt_study', label: 'Dedicated Thorough QT (TQT) Study Planned', description: 'Traditional ICH E14 approach' },
              { value: 'c_qtc_modeling', label: 'Concentration-QTc (C-QTc) Modeling from Phase 1 ECGs', description: 'ICH E14 R3 Q&A alternative approach' },
              { value: 'low_risk', label: 'Low QT Risk — No Dedicated QTc Study Anticipated', description: 'Biologic with no systemic exposure concern' },
              { value: 'not_decided', label: 'Strategy Not Yet Decided' },
            ],
          },
          {
            id: 'ecg_monitoring_in_phase1',
            label: 'Intensive ECG Monitoring Planned in Phase 1?',
            type: 'yes_no',
            helpText: 'If using the C-QTc modeling approach per ICH E14 R3 Q&A, intensive time-matched PK and triplicate 12-lead ECG data collection is required in Phase 1.',
          },
          {
            id: 'in_vivo_cv_safety',
            label: 'In Vivo Cardiovascular Safety Pharmacology Completed (ICH S7A)?',
            type: 'yes_no',
            required: true,
            helpText: 'ICH S7A requires assessment of cardiovascular effects (blood pressure, heart rate, ECG including QT interval) in a non-rodent species, typically with telemetry.',
          },
        ],
        defaultNext: 'manufacturing_process',
      },

      /* ================================================================ */
      /*  Section 8 — Manufacturing & Controls                            */
      /* ================================================================ */

      {
        id: 'manufacturing_process',
        section: 'manufacturing_controls',
        question:
          'Describe the manufacturing process for the drug substance and drug product, including critical process parameters and in-process controls.',
        guidance:
          'Per 21 CFR 312.23(a)(7)(iv)(a) and ICH Q7 "Good Manufacturing Practice Guide for Active Pharmaceutical Ingredients," the IND must include a brief description of the manufacturing process, including a flow diagram. Identify critical process parameters (CPPs) and in-process controls (IPCs) per ICH Q8(R2) and Q11. For the IND stage, a detailed description with critical steps identified is expected, though full process validation (ICH Q7 Section 12) is not required until pre-NDA. Provide the batch formula for clinical supply batches.',
        fields: [
          {
            id: 'drug_substance_manufacturing',
            label: 'Drug Substance Manufacturing Process Description',
            type: 'textarea',
            placeholder: 'e.g., 5-step chemical synthesis with final crystallization. Starting materials: [list]. Critical steps: [specify]. Yield: ~65% overall.',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'drug_product_manufacturing',
            label: 'Drug Product Manufacturing Process Description',
            type: 'textarea',
            placeholder: 'e.g., Dry granulation (roller compaction) → blending → tableting → film coating. Batch size: 10 kg. Equipment: [list key equipment].',
            required: true,
            validation: { minLength: 50 },
          },
          {
            id: 'critical_process_parameters',
            label: 'Critical Process Parameters (CPPs) Identified',
            type: 'textarea',
            placeholder: 'e.g., Granulation roller pressure: 40-60 kN/cm. Compression force: 8-15 kN. Coating inlet temperature: 55-65°C.',
            helpText: 'Per ICH Q8(R2), CPPs are process parameters whose variability has an impact on a critical quality attribute (CQA) and therefore should be monitored or controlled.',
          },
          {
            id: 'in_process_controls',
            label: 'In-Process Controls (IPCs)',
            type: 'textarea',
            placeholder: 'e.g., Blend uniformity (RSD <5%), tablet weight (±5%), hardness (6-12 kP), friability (<1.0%), dissolution intermediate check.',
          },
          {
            id: 'batch_formula',
            label: 'Batch Formula for Clinical Supply',
            type: 'textarea',
            placeholder: 'e.g., Drug substance: 5.0 kg, MCC: 12.0 kg, Croscarmellose: 1.5 kg, Mg Stearate: 0.2 kg. Batch size: 18.7 kg (~100,000 tablets at 187 mg).',
            required: true,
          },
          {
            id: 'process_validation_status',
            label: 'Process Validation Status',
            type: 'select',
            options: [
              { value: 'not_required_yet', label: 'Not required at IND stage — development batches only' },
              { value: 'in_progress', label: 'Process validation in progress' },
              { value: 'completed', label: 'Process validation completed' },
            ],
            helpText: 'Full process validation per FDA Guidance "Process Validation: General Principles and Practices" (2011) is not required at IND stage but must be completed before NDA submission.',
          },
        ],
        defaultNext: 'analytical_methods',
      },

      {
        id: 'analytical_methods',
        section: 'manufacturing_controls',
        question:
          'Describe the analytical methods, release specifications, and impurity control strategy for the drug substance and drug product.',
        guidance:
          'Per 21 CFR 312.23(a)(7)(iv)(a) and ICH Q6A, the IND should include proposed specifications (test procedures and acceptance criteria) for both drug substance and drug product. Methods should be validated or at minimum qualified per ICH Q2(R2) "Validation of Analytical Procedures" (2023 revision). The impurity profile must be assessed per ICH Q3A(R2) "Impurities in New Drug Substances" and ICH Q3B(R2) "Impurities in New Drug Products." Impurities above ICH thresholds require identification and qualification.',
        fields: [
          {
            id: 'release_testing_summary',
            label: 'Release Testing Summary (Key Tests)',
            type: 'textarea',
            placeholder: 'e.g., Appearance, identification (HPLC RT, UV), assay (98.0-102.0% by HPLC), related substances (individual NMT 0.5%, total NMT 2.0%), dissolution (Q=80% at 30 min), content uniformity (USP <905>), microbial limits.',
            required: true,
          },
          {
            id: 'method_validation_status',
            label: 'Analytical Method Validation Status',
            type: 'select',
            required: true,
            options: [
              { value: 'fully_validated', label: 'Fully Validated per ICH Q2(R2)' },
              { value: 'partially_validated', label: 'Partially Validated (qualification only at IND stage)' },
              { value: 'in_development', label: 'Methods Still in Development' },
            ],
            helpText: 'Per ICH Q2(R2) (2023), methods must be validated for specificity, linearity, accuracy, precision, range, and robustness. At IND stage, partial validation (qualification) may be acceptable.',
          },
          {
            id: 'reference_standard',
            label: 'Reference Standard Characterization',
            type: 'textarea',
            placeholder: 'e.g., Primary reference standard characterized by NMR, MS, elemental analysis, HPLC purity (99.5%). Certificate of analysis on file. Working standard qualified against primary.',
          },
          {
            id: 'impurity_profile',
            label: 'Impurity Profile Summary',
            type: 'textarea',
            placeholder: 'e.g., Process-related impurities: Impurity A (0.15%), Impurity B (0.08%). Degradation products: Des-fluoro degradant (0.12%). All below ICH Q3A reporting threshold (0.10%) except Impurity A — identified and qualified.',
            required: true,
          },
          {
            id: 'impurity_above_threshold',
            label: 'Are any impurities above ICH Q3A/Q3B identification or qualification thresholds?',
            type: 'yes_no',
            required: true,
            helpText: 'Per ICH Q3A(R2), for a drug substance with max daily dose ≤2 g: reporting threshold 0.05%, identification threshold 0.10% (or 1.0 mg/day), qualification threshold 0.15% (or 1.0 mg/day). Impurities above these thresholds must be identified and qualified for safety.',
          },
          {
            id: 'residual_solvents',
            label: 'Residual Solvents Assessed per ICH Q3C(R8)?',
            type: 'yes_no',
            helpText: 'ICH Q3C(R8) classifies residual solvents by toxicity (Class 1 = avoid, Class 2 = limit, Class 3 = low toxic potential). All solvents used in the synthesis must be assessed.',
          },
          {
            id: 'elemental_impurities',
            label: 'Elemental Impurities Assessed per ICH Q3D(R2)?',
            type: 'yes_no',
            helpText: 'ICH Q3D(R2) requires assessment of elemental impurities (heavy metals) from all sources, including catalysts used in synthesis, excipients, and container closure.',
          },
          {
            id: 'nitrosamine_assessment',
            label: 'Nitrosamine Impurity Risk Assessment Completed?',
            type: 'yes_no',
            helpText: 'Per FDA Guidance "Control of Nitrosamine Impurities in Human Drugs" (2021), all sponsors must conduct a risk assessment for nitrosamine impurities (NDMA, NDEA, etc.) in their drug products.',
          },
        ],
        defaultNext: 'pediatric_study_plan',
        issueChecks: [
          {
            id: 'impurity_above_ich_threshold',
            condition: { field: 'impurity_above_threshold', operator: 'eq', value: true },
            severity: 'critical',
            title: 'Impurity Above ICH Threshold — Identification and Qualification Required',
            message:
              'One or more impurities exceed ICH Q3A(R2)/Q3B(R2) thresholds. These must be structurally identified and safety-qualified (either by reference to published data or through qualification studies). Unqualified impurities above threshold may result in a clinical hold.',
            reference: 'ICH Q3A(R2); ICH Q3B(R2); 21 CFR 312.23(a)(7)',
          },
          {
            id: 'nitrosamine_not_assessed',
            condition: { field: 'nitrosamine_assessment', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Nitrosamine Risk Assessment Not Completed',
            message:
              'FDA requires all drug product sponsors to complete a nitrosamine impurity risk assessment per the 2021 guidance. Nitrosamine contamination (NDMA, NDEA, etc.) has led to major drug recalls. Complete this assessment before IND submission.',
            reference: 'FDA Guidance: Control of Nitrosamine Impurities in Human Drugs (February 2021)',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 9 — Pediatric & Special Populations                     */
      /* ================================================================ */

      {
        id: 'pediatric_study_plan',
        section: 'special_populations',
        question:
          'What is the pediatric development strategy? PREA requirements must be addressed for most new drugs and biologics.',
        guidance:
          'Per the Pediatric Research Equity Act (PREA, as amended by FDARA 2017, 21 USC 355c) and FDA Guidance "Pediatric Study Plans: Content of and Process for Submitting Initial Pediatric Study Plans and Amended Initial Pediatric Study Plans" (2020), sponsors of new drugs and biologics must submit an initial Pediatric Study Plan (iPSP) no later than 60 days after the End-of-Phase 2 (EOP2) meeting request or at an equivalent timepoint. Orphan-designated drugs are exempt from PREA. Pediatric formulation development (age-appropriate dosage form per ICH E11(R1)) and juvenile animal studies should be considered early.',
        fields: [
          {
            id: 'prea_applicable',
            label: 'Is PREA Applicable to This Product?',
            type: 'select',
            required: true,
            options: [
              { value: 'yes', label: 'Yes — PREA applies (non-orphan drug for disease relevant to pediatrics)' },
              { value: 'orphan_exempt', label: 'No — Orphan Drug Designation exemption' },
              { value: 'waiver_planned', label: 'PREA waiver or deferral will be requested' },
              { value: 'not_determined', label: 'Not yet determined' },
            ],
          },
          {
            id: 'pediatric_development_timeline',
            label: 'Pediatric Development Timeline',
            type: 'textarea',
            placeholder: 'e.g., iPSP to be submitted with EOP2 meeting package. Pediatric Phase 1/2 study planned to initiate after adult dose confirmation in Phase 2. Age-appropriate formulation development to begin in Year 2.',
            visibleWhen: { field: 'prea_applicable', operator: 'eq', value: 'yes' },
          },
          {
            id: 'age_appropriate_formulation',
            label: 'Age-Appropriate Formulation Development Planned?',
            type: 'yes_no',
            visibleWhen: { field: 'prea_applicable', operator: 'eq', value: 'yes' },
            helpText: 'Per ICH E11(R1) and FDA Guidance on Pediatric Formulations, age-appropriate dosage forms (e.g., oral solution, dispersible tablets, mini-tabs) should be developed for the target pediatric population.',
          },
          {
            id: 'juvenile_animal_studies',
            label: 'Juvenile Animal Toxicology Studies Needed?',
            type: 'select',
            options: [
              { value: 'needed', label: 'Yes — juvenile animal studies will be needed' },
              { value: 'not_needed', label: 'No — adult animal data sufficient' },
              { value: 'completed', label: 'Already completed' },
              { value: 'not_assessed', label: 'Not yet assessed' },
            ],
            helpText: 'Per FDA Guidance "Nonclinical Safety Evaluation of Pediatric Drug Products" (2006) and ICH S11, juvenile animal studies may be required when the target population includes children in whom organ systems are still developing.',
          },
          {
            id: 'pediatric_exclusivity',
            label: 'Will Pediatric Exclusivity (505A) Be Pursued?',
            type: 'yes_no',
            helpText: 'Pediatric exclusivity (21 USC 355a) provides an additional 6 months of market exclusivity if FDA-requested pediatric studies are completed.',
          },
        ],
        defaultNext: 'special_populations_assessment',
        issueChecks: [
          {
            id: 'prea_not_addressed',
            condition: { field: 'prea_applicable', operator: 'eq', value: 'not_determined' },
            severity: 'warning',
            title: 'PREA Applicability Not Determined',
            message:
              'The Pediatric Research Equity Act (PREA) requires most sponsors to submit an initial Pediatric Study Plan (iPSP) by the EOP2 timepoint. Determine PREA applicability early to avoid delays. Non-orphan drugs for diseases relevant to pediatric populations are generally subject to PREA.',
            reference: 'PREA (21 USC 355c); FDARA 2017; FDA Guidance: Pediatric Study Plans (2020)',
          },
        ],
      },

      {
        id: 'special_populations_assessment',
        section: 'special_populations',
        question:
          'Address the development strategy for special populations: renal impairment, hepatic impairment, geriatric patients, and reproductive toxicity.',
        guidance:
          'Per ICH E7 "Studies in Support of Special Populations: Geriatrics" and FDA Guidances on Pharmacokinetics in Patients with Impaired Renal Function (2020) and Impaired Hepatic Function (2003), PK studies in organ-impaired populations are generally required during development. Reproductive and developmental toxicology per ICH S5(R3) must be completed before enrolling women of childbearing potential (WOCBP) in clinical trials. The FDA Pregnancy and Lactation Labeling Rule (PLLR, 21 CFR 201.57(c)(9)) requires structured safety information for these populations.',
        fields: [
          {
            id: 'renal_impairment_study',
            label: 'Renal Impairment Study Planned',
            type: 'select',
            options: [
              { value: 'planned', label: 'Yes — dedicated renal impairment PK study planned' },
              { value: 'not_needed', label: 'Not needed — minimal renal elimination (<30%)' },
              { value: 'pop_pk', label: 'Will be assessed via population PK analysis' },
              { value: 'not_decided', label: 'Not yet decided' },
            ],
            helpText: 'Per FDA Guidance "Pharmacokinetics in Patients with Impaired Renal Function" (2020), a dedicated study is recommended when renal clearance accounts for ≥30% of total clearance or the drug has a narrow therapeutic index.',
          },
          {
            id: 'hepatic_impairment_study',
            label: 'Hepatic Impairment Study Planned',
            type: 'select',
            options: [
              { value: 'planned', label: 'Yes — dedicated hepatic impairment PK study planned' },
              { value: 'not_needed', label: 'Not needed — minimal hepatic metabolism' },
              { value: 'pop_pk', label: 'Will be assessed via population PK analysis' },
              { value: 'not_decided', label: 'Not yet decided' },
            ],
            helpText: 'Per FDA Guidance "Pharmacokinetics in Patients with Impaired Hepatic Function" (2003), a dedicated study using the Child-Pugh classification is generally needed for hepatically metabolized drugs.',
          },
          {
            id: 'geriatric_considerations',
            label: 'Geriatric Population Considerations',
            type: 'textarea',
            placeholder: 'e.g., Patients ≥65 years will be enrolled in the Phase 1 expansion cohort. No specific dose adjustment anticipated based on nonclinical data. PK in elderly will be evaluated via population PK.',
            helpText: 'Per ICH E7, adequate representation of geriatric patients (≥65 years) in clinical trials is expected. Age-related PK differences (renal function, hepatic metabolism, body composition) should be addressed.',
          },
          {
            id: 'reproductive_tox_status',
            label: 'Reproductive and Developmental Toxicology Status',
            type: 'select',
            required: true,
            options: [
              { value: 'completed', label: 'Completed (embryo-fetal development studies per ICH S5(R3))' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'planned', label: 'Planned — timing per ICH M3(R2) Table 3' },
              { value: 'not_needed', label: 'Not needed — male-only study population initially' },
            ],
            helpText: 'Per ICH M3(R2) and ICH S5(R3), embryo-fetal development (EFD) studies must be completed before enrolling women of childbearing potential (WOCBP), unless adequate contraception requirements are in place.',
          },
          {
            id: 'wocbp_enrollment',
            label: 'Will Women of Childbearing Potential (WOCBP) Be Enrolled?',
            type: 'yes_no',
            helpText: 'If WOCBP will be enrolled, ensure: (1) adequate contraception requirements per ICH M3(R2) Note 5, (2) pregnancy testing protocol, (3) EFD studies timed appropriately.',
          },
          {
            id: 'pregnancy_lactation_plan',
            label: 'Pregnancy and Lactation Data Collection Plan',
            type: 'textarea',
            placeholder: 'e.g., Pregnancy registry will be established. Pregnancy is an exclusion criterion with required contraception per ICH M3(R2). Pregnancy reporting within 24 hours required. Lactation PK study planned post-approval.',
            visibleWhen: { field: 'wocbp_enrollment', operator: 'eq', value: true },
          },
          {
            id: 'sex_differences_assessment',
            label: 'Plan to Assess Sex-Based Differences in PK/PD',
            type: 'yes_no',
            helpText: 'Per FDA Guidance "Evaluation of Sex-Specific Data in Medical Device Clinical Studies" and ICH E1/E7, adequate enrollment of both sexes and analysis of sex-based differences is expected.',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
        issueChecks: [
          {
            id: 'repro_tox_wocbp_conflict',
            condition: { field: 'wocbp_enrollment', operator: 'eq', value: true },
            severity: 'info',
            title: 'WOCBP Enrollment — Ensure Reproductive Toxicology Coverage',
            message:
              'Enrollment of women of childbearing potential requires embryo-fetal development (EFD) studies to be completed per ICH M3(R2) Table 3, or adequate contraception requirements per ICH M3(R2) Note 5 must be in place. Ensure pregnancy testing and reporting protocols are included in the clinical protocol.',
            reference: 'ICH M3(R2) Section 11; ICH S5(R3)',
          },
        ],
      },
    ],
  };
}
