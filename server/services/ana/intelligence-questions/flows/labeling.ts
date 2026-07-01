/**
 * Labeling flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through comprehensive drug or device labeling development
 * and review, covering 21 CFR 201/801 compliance, PLR format prescribing
 * information, clinical pharmacology, indications, safety content, patient
 * labeling, OTC Drug Facts, biosimilar-specific labeling, and device-specific
 * labeling including UDI and IFU requirements.
 *
 * 18 nodes · 7 sections · 80+ fields
 *
 * @module server/services/ana/intelligence-questions/flows/labeling
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createLabelingFlow(): FlowDefinition {
  return {
    id: 'labeling-v1',
    category: 'labeling',
    name: 'Drug/Device Labeling',
    description:
      'Comprehensive drug and device labeling questionnaire covering 21 CFR 201 (drug labeling) and 21 CFR 801 (device labeling), PLR format prescribing information, clinical pharmacology, indications & usage, safety content, patient labeling, OTC Drug Facts, biosimilar labeling, and device-specific labeling including UDI and Instructions for Use.',
    clientTypes: [],
    entryNode: 'product_regulatory_context',
    estimatedMinutes: 65,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'product_context',
        label: 'Product & Regulatory Context',
        nodeIds: [
          'product_regulatory_context',
          'labeling_type_determination',
          'regulatory_history',
        ],
      },
      {
        id: 'prescribing_info',
        label: 'Prescribing Information Structure',
        nodeIds: ['highlights_section', 'full_prescribing_info_structure'],
      },
      {
        id: 'clinical_pharmacology',
        label: 'Clinical Pharmacology',
        nodeIds: ['clinical_pharmacology_section', 'pharmacokinetics_section'],
      },
      {
        id: 'indications_usage_section',
        label: 'Indications & Usage',
        nodeIds: ['indications_usage', 'contraindications_section'],
      },
      {
        id: 'warnings_precautions_section',
        label: 'Warnings & Precautions',
        nodeIds: [
          'warnings_precautions',
          'adverse_reactions_section',
          'drug_interactions_section',
          'use_specific_populations',
        ],
      },
      {
        id: 'patient_labeling',
        label: 'Patient Labeling',
        nodeIds: [
          'patient_labeling_section',
          'otc_labeling',
          'biosimilar_context',
        ],
      },
      {
        id: 'device_labeling',
        label: 'Device-Specific Labeling',
        nodeIds: [
          'device_labeling_context',
          'device_labeling_content',
          'device_ifu',
        ],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Product & Regulatory Context                        */
      /* ================================================================ */

      /* ── Product Regulatory Context ── */
      {
        id: 'product_regulatory_context',
        section: 'Product & Regulatory Context',
        question:
          'Let\'s start with the product identification and regulatory context. What product is this labeling for, and what is its regulatory status?',
        guidance:
          'Accurate product identification is the foundation of all labeling. Per 21 CFR 201.56-57, prescription drug labeling must follow the Physician Labeling Rule (PLR) format. The proprietary name, established name, dosage form, and strength must match the approved specifications exactly. REMS programs and SPL submission requirements influence labeling scope and format.',
        fields: [
          {
            id: 'product_name_proprietary',
            label: 'Proprietary (Brand) Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., KEYTRUDA',
          },
          {
            id: 'product_name_established',
            label: 'Established (Generic) Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., pembrolizumab',
            helpText: 'USAN or INN established name',
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'prescription_drug', label: 'Prescription Drug' },
              { value: 'otc_drug', label: 'OTC Drug' },
              { value: 'biologic', label: 'Biologic' },
              { value: 'biosimilar', label: 'Biosimilar' },
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'combination_product', label: 'Combination Product' },
            ],
          },
          {
            id: 'nda_bla_number',
            label: 'NDA/BLA Number',
            type: 'text',
            placeholder: 'e.g., NDA 012345 or BLA 125514',
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['prescription_drug', 'biologic', 'biosimilar', 'otc_drug'],
            },
          },
          {
            id: 'device_premarket_number',
            label: 'Device Premarket Number',
            type: 'text',
            placeholder: 'e.g., K123456 or P123456',
            visibleWhen: {
              field: 'product_type',
              operator: 'in',
              value: ['medical_device', 'combination_product'],
            },
          },
          {
            id: 'dosage_form',
            label: 'Dosage Form',
            type: 'text',
            required: true,
            placeholder: 'e.g., injection, for intravenous use',
          },
          {
            id: 'strength',
            label: 'Strength',
            type: 'text',
            required: true,
            placeholder: 'e.g., 100 mg/4 mL (25 mg/mL)',
          },
          {
            id: 'rems_required',
            label: 'REMS Program Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Does this product have an approved REMS program?',
          },
          {
            id: 'spl_format_required',
            label: 'SPL Format Required',
            type: 'yes_no',
            helpText:
              'Will the label be submitted in Structured Product Labeling (SPL) format?',
          },
        ],
        defaultNext: 'labeling_type_determination',
      },

      /* ── Labeling Type Determination ── */
      {
        id: 'labeling_type_determination',
        section: 'Product & Regulatory Context',
        question:
          'What type of labeling is being developed, and what components are included?',
        guidance:
          'The labeling category determines which regulatory framework applies and which sections are required. Prescription drug labeling follows PLR format (21 CFR 201.57), OTC drugs require Drug Facts format (21 CFR 201.66), biosimilar labeling follows FDA biosimilar labeling guidance, and device labeling follows 21 CFR 801. Boxed Warnings, Medication Guides, and Patient Package Inserts each have specific regulatory triggers.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'labeling_category',
            label: 'Labeling Category',
            type: 'select',
            required: true,
            options: [
              { value: 'drug_rx', label: 'Prescription Drug (Rx)' },
              { value: 'drug_otc', label: 'OTC Drug' },
              { value: 'biologic_original', label: 'Biologic (Original)' },
              { value: 'biosimilar_labeling', label: 'Biosimilar' },
              { value: 'device_labeling', label: 'Device Labeling' },
            ],
          },
          {
            id: 'submission_type',
            label: 'Submission Type',
            type: 'select',
            required: true,
            options: [
              { value: 'original', label: 'Original' },
              { value: 'supplement', label: 'Supplement' },
              { value: 'annual_report', label: 'Annual Report' },
            ],
          },
          {
            id: 'is_new_formulation',
            label: 'New Formulation',
            type: 'yes_no',
          },
          {
            id: 'is_new_indication',
            label: 'New Indication',
            type: 'yes_no',
          },
          {
            id: 'has_pediatric_indication',
            label: 'Pediatric Indication',
            type: 'yes_no',
          },
          {
            id: 'has_boxed_warning',
            label: 'Boxed Warning',
            type: 'yes_no',
          },
          {
            id: 'has_medication_guide',
            label: 'Medication Guide',
            type: 'yes_no',
          },
          {
            id: 'has_patient_package_insert',
            label: 'Patient Package Insert',
            type: 'yes_no',
          },
          {
            id: 'has_instructions_for_use',
            label: 'Instructions for Use',
            type: 'yes_no',
          },
        ],
        branches: [
          {
            when: { field: 'labeling_category', operator: 'eq', value: 'device_labeling' },
            goto: 'device_labeling_context',
          },
          {
            when: { field: 'labeling_category', operator: 'eq', value: 'drug_otc' },
            goto: 'otc_labeling',
          },
          {
            when: { field: 'labeling_category', operator: 'eq', value: 'biosimilar_labeling' },
            goto: 'biosimilar_context',
          },
        ],
        defaultNext: 'regulatory_history',
        issueChecks: [
          {
            id: 'rems_no_boxed_warning',
            condition: { field: 'rems_required', operator: 'eq', value: true },
            severity: 'critical',
            title: 'REMS Required — Verify Boxed Warning',
            message:
              'Products with REMS programs typically require a Boxed Warning. Verify that the labeling includes an appropriate Boxed Warning per 21 CFR 201.57(c)(1).',
            reference: '21 CFR 201.57(c)(1)',
          },
        ],
      },

      /* ── Regulatory History ── */
      {
        id: 'regulatory_history',
        section: 'Product & Regulatory Context',
        question:
          'What is the regulatory history for this product\'s labeling?',
        guidance:
          'Understanding the product\'s regulatory history is essential for ensuring labeling consistency and compliance. Previous label revisions, pending supplements, post-marketing commitments, and safety signals all influence the current labeling update. FDA expects labeling to reflect the most current safety and efficacy data.',
        fields: [
          {
            id: 'initial_approval_date',
            label: 'Initial Approval Date',
            type: 'date',
            placeholder: 'Date of original NDA/BLA/510(k) approval',
          },
          {
            id: 'number_of_label_revisions',
            label: 'Number of Label Revisions',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'most_recent_revision_date',
            label: 'Most Recent Revision Date',
            type: 'date',
          },
          {
            id: 'pending_supplements',
            label: 'Pending Supplements',
            type: 'textarea',
            placeholder:
              'List any pending sNDA/sBLA supplements that may affect labeling',
          },
          {
            id: 'post_marketing_commitments',
            label: 'Post-Marketing Commitments',
            type: 'textarea',
            placeholder:
              'Describe any PMR/PMC studies that may impact labeling',
          },
          {
            id: 'recent_safety_signals',
            label: 'Recent Safety Signals',
            type: 'textarea',
            placeholder:
              'Any new safety signals from post-marketing surveillance',
          },
        ],
        defaultNext: 'highlights_section',
      },

      /* ================================================================ */
      /*  Section 2 — Prescribing Information Structure                   */
      /* ================================================================ */

      /* ── Highlights Section ── */
      {
        id: 'highlights_section',
        section: 'Prescribing Information Structure',
        question:
          'Let\'s define the Highlights of Prescribing Information. What key information should appear in the Highlights section?',
        guidance:
          'The Highlights of Prescribing Information is the first section prescribers see. Per 21 CFR 201.57(a), it must include: the product name and initial US approval year, Boxed Warning (if any), Recent Major Changes, Indications and Usage summary, Dosage and Administration summary, Dosage Forms and Strengths, Contraindications, Warnings and Precautions, and Adverse Reactions. The Highlights must not exceed one page in length.',
        fields: [
          {
            id: 'highlights_limitations_statement',
            label: 'Limitations Statement',
            type: 'textarea',
            placeholder: 'e.g., Limitations of Use statement if applicable',
          },
          {
            id: 'recent_major_changes',
            label: 'Recent Major Changes',
            type: 'textarea',
            required: true,
            placeholder:
              'List sections with substantive changes in the past year with month/year',
            helpText:
              'Per 21 CFR 201.57(a)(4), list sections changed within the past year',
          },
          {
            id: 'boxed_warning_text',
            label: 'Boxed Warning Text',
            type: 'textarea',
            visibleWhen: {
              field: 'has_boxed_warning',
              operator: 'eq',
              value: true,
            },
            placeholder: 'Full text of boxed warning',
            validation: { minLength: 50 },
          },
          {
            id: 'indications_summary',
            label: 'Indications Summary',
            type: 'textarea',
            required: true,
            placeholder:
              'Brief summary of approved indications for Highlights section',
          },
          {
            id: 'dosage_summary',
            label: 'Dosage Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Brief dosage and administration summary',
          },
        ],
        defaultNext: 'full_prescribing_info_structure',
      },

      /* ── Full Prescribing Info Structure ── */
      {
        id: 'full_prescribing_info_structure',
        section: 'Prescribing Information Structure',
        question:
          'Which sections of the Full Prescribing Information are included, and is the labeling PLR-compliant?',
        guidance:
          'The Full Prescribing Information must follow the PLR section numbering per 21 CFR 201.57(c)-(d). Required sections include: 1 Indications and Usage, 2 Dosage and Administration, 3 Dosage Forms and Strengths, 4 Contraindications, 5 Warnings and Precautions, 6 Adverse Reactions, 7 Drug Interactions, 8 Use in Specific Populations, 10 Overdosage, 11 Description, 12 Clinical Pharmacology, 13 Nonclinical Toxicology, 14 Clinical Studies, 15 References, 16 How Supplied/Storage and Handling, and 17 Patient Counseling Information. Section 9 is reserved.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'sections_included',
            label: 'Sections Included',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'indications_usage', label: '1 — Indications and Usage' },
              { value: 'dosage_administration', label: '2 — Dosage and Administration' },
              { value: 'dosage_forms_strengths', label: '3 — Dosage Forms and Strengths' },
              { value: 'contraindications', label: '4 — Contraindications' },
              { value: 'warnings_precautions', label: '5 — Warnings and Precautions' },
              { value: 'adverse_reactions', label: '6 — Adverse Reactions' },
              { value: 'drug_interactions', label: '7 — Drug Interactions' },
              { value: 'use_specific_populations', label: '8 — Use in Specific Populations' },
              { value: 'overdosage', label: '10 — Overdosage' },
              { value: 'description', label: '11 — Description' },
              { value: 'clinical_pharmacology', label: '12 — Clinical Pharmacology' },
              { value: 'nonclinical_toxicology', label: '13 — Nonclinical Toxicology' },
              { value: 'clinical_studies', label: '14 — Clinical Studies' },
              { value: 'references', label: '15 — References' },
              { value: 'how_supplied', label: '16 — How Supplied/Storage and Handling' },
              { value: 'patient_counseling', label: '17 — Patient Counseling Information' },
            ],
          },
          {
            id: 'sections_not_applicable',
            label: 'Sections Not Applicable',
            type: 'multi_select',
            options: [
              { value: 'none', label: 'None (all sections applicable)' },
              { value: 'overdosage', label: '10 — Overdosage' },
              { value: 'nonclinical_toxicology', label: '13 — Nonclinical Toxicology' },
              { value: 'references', label: '15 — References' },
            ],
          },
          {
            id: 'plr_compliant',
            label: 'PLR Compliant',
            type: 'yes_no',
            required: true,
            helpText:
              'Does the full prescribing information follow the PLR format per 21 CFR 201.57?',
          },
        ],
        defaultNext: 'clinical_pharmacology_section',
      },

      /* ================================================================ */
      /*  Section 3 — Clinical Pharmacology                               */
      /* ================================================================ */

      /* ── Clinical Pharmacology Section ── */
      {
        id: 'clinical_pharmacology_section',
        section: 'Clinical Pharmacology',
        question:
          'What clinical pharmacology information should be included in the labeling?',
        guidance:
          'The Clinical Pharmacology section (Section 12) per 21 CFR 201.57(c)(13)(i) must describe the mechanism of action, pharmacodynamics (including dose-response and time course of pharmacodynamic response), and pharmacokinetics. For drugs with cardiac electrophysiology concerns, include ICH E14 thorough QT study results or an alternative assessment approach.',
        fields: [
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the mechanism of action',
          },
          {
            id: 'pharmacodynamics',
            label: 'Pharmacodynamics',
            type: 'textarea',
            required: true,
            placeholder:
              'Describe pharmacodynamic properties including dose-response and time course',
          },
          {
            id: 'cardiac_electrophysiology',
            label: 'Cardiac Electrophysiology',
            type: 'textarea',
            placeholder: 'QTc study results or integrated ECG analysis',
            helpText: 'ICH E14 thorough QT study results or alternative approach',
          },
          {
            id: 'exposure_response',
            label: 'Exposure-Response',
            type: 'textarea',
            placeholder:
              'Exposure-response relationships for efficacy and safety',
          },
        ],
        defaultNext: 'pharmacokinetics_section',
      },

      /* ── Pharmacokinetics Section ── */
      {
        id: 'pharmacokinetics_section',
        section: 'Clinical Pharmacology',
        question:
          'What pharmacokinetic data should be included in the labeling?',
        guidance:
          'The pharmacokinetics subsection per 21 CFR 201.57(c)(13)(ii) must describe absorption, distribution, metabolism (including CYP enzymes and active metabolites), and elimination. Include PK in special populations (renal/hepatic impairment, age, sex, race, weight) and results of drug interaction studies (both in vitro and clinical).',
        fields: [
          {
            id: 'absorption',
            label: 'Absorption',
            type: 'textarea',
            placeholder: 'Absorption characteristics, bioavailability, food effect',
          },
          {
            id: 'distribution',
            label: 'Distribution',
            type: 'textarea',
            placeholder: 'Volume of distribution, protein binding',
          },
          {
            id: 'metabolism',
            label: 'Metabolism',
            type: 'textarea',
            placeholder:
              'Metabolic pathways, CYP enzymes, active metabolites',
          },
          {
            id: 'elimination',
            label: 'Elimination',
            type: 'textarea',
            placeholder: 'Half-life, clearance, route of excretion',
          },
          {
            id: 'pk_special_populations',
            label: 'PK in Special Populations',
            type: 'textarea',
            placeholder:
              'PK in renal/hepatic impairment, age, sex, race, weight',
          },
          {
            id: 'drug_interaction_studies',
            label: 'Drug Interaction Studies',
            type: 'textarea',
            placeholder:
              'In vitro and clinical drug interaction study results',
          },
        ],
        defaultNext: 'indications_usage',
      },

      /* ================================================================ */
      /*  Section 4 — Indications & Usage                                 */
      /* ================================================================ */

      /* ── Indications & Usage ── */
      {
        id: 'indications_usage',
        section: 'Indications & Usage',
        question:
          'What are the approved indications and usage for this product?',
        guidance:
          'The Indications and Usage section (Section 1) per 21 CFR 201.57(c)(2) must state each indication, the specific patient population, line of therapy, and any required biomarker testing or companion diagnostic. For products with accelerated approval, the labeling must include the accelerated approval statement and describe the surrogate or intermediate clinical endpoint. Limitations of use should be clearly stated.',
        fields: [
          {
            id: 'indications_list',
            label: 'Indications',
            type: 'textarea',
            required: true,
            placeholder:
              'List all approved indications with specific patient populations, line of therapy, and any required biomarker testing',
            validation: { minLength: 50 },
          },
          {
            id: 'number_of_indications',
            label: 'Number of Indications',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'limitations_of_use',
            label: 'Limitations of Use',
            type: 'textarea',
            placeholder: 'Any limitations of use statements',
          },
          {
            id: 'accelerated_approval',
            label: 'Accelerated Approval',
            type: 'yes_no',
            helpText:
              'Is any indication based on accelerated approval?',
          },
          {
            id: 'accelerated_approval_statement',
            label: 'Accelerated Approval Statement',
            type: 'textarea',
            visibleWhen: {
              field: 'accelerated_approval',
              operator: 'eq',
              value: true,
            },
            placeholder: 'Accelerated approval statement text',
          },
          {
            id: 'companion_diagnostic_required',
            label: 'Companion Diagnostic Required',
            type: 'yes_no',
          },
          {
            id: 'companion_diagnostic_name',
            label: 'Companion Diagnostic Name',
            type: 'text',
            visibleWhen: {
              field: 'companion_diagnostic_required',
              operator: 'eq',
              value: true,
            },
            placeholder: 'Name of companion diagnostic test',
          },
        ],
        defaultNext: 'contraindications_section',
      },

      /* ── Contraindications Section ── */
      {
        id: 'contraindications_section',
        section: 'Indications & Usage',
        question:
          'What are the contraindications for this product?',
        guidance:
          'The Contraindications section (Section 4) per 21 CFR 201.57(c)(4) lists situations in which the drug should not be used because the risk of use clearly outweighs any possible therapeutic benefit. Contraindications must be based on clinical trial data, post-marketing experience, pharmacological basis, or class labeling. If there are no known contraindications, the section must state "None."',
        fields: [
          {
            id: 'contraindications_list',
            label: 'Contraindications',
            type: 'textarea',
            required: true,
            placeholder: 'List all contraindications with rationale',
          },
          {
            id: 'number_of_contraindications',
            label: 'Number of Contraindications',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'hypersensitivity_contraindication',
            label: 'Hypersensitivity Contraindication',
            type: 'yes_no',
            required: true,
            helpText:
              'Is hypersensitivity to active ingredient or excipients a contraindication?',
          },
          {
            id: 'contraindication_evidence_basis',
            label: 'Evidence Basis',
            type: 'select',
            required: true,
            options: [
              { value: 'clinical_trial_data', label: 'Clinical Trial Data' },
              { value: 'post_marketing_data', label: 'Post-Marketing Data' },
              { value: 'pharmacological_basis', label: 'Pharmacological Basis' },
              { value: 'class_labeling', label: 'Class Labeling' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'incomplete_contraindications',
            condition: {
              field: 'contraindications_list',
              operator: 'eq',
              value: '',
            },
            severity: 'critical',
            title: 'Incomplete Contraindications',
            message:
              'The Contraindications section must not be omitted. If there are no known contraindications, the section should state "None." per 21 CFR 201.57(c)(4).',
            reference: '21 CFR 201.57(c)(4)',
          },
        ],
        defaultNext: 'warnings_precautions',
      },

      /* ================================================================ */
      /*  Section 5 — Warnings & Precautions                              */
      /* ================================================================ */

      /* ── Warnings & Precautions ── */
      {
        id: 'warnings_precautions',
        section: 'Warnings & Precautions',
        question:
          'What warnings and precautions should be included in the labeling?',
        guidance:
          'The Warnings and Precautions section (Section 5) per 21 CFR 201.57(c)(6) describes clinically significant adverse reactions not included in other sections, other potential safety hazards (e.g., those related to misuse), and steps that can be taken to reduce or prevent those risks. Each warning should include the clinical basis, incidence, and management recommendations.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'warnings_list',
            label: 'Warnings and Precautions',
            type: 'textarea',
            required: true,
            placeholder:
              'List all warnings and precautions with clinical basis',
            validation: { minLength: 100 },
          },
          {
            id: 'number_of_warnings',
            label: 'Number of Warnings',
            type: 'number',
            required: true,
            validation: { min: 0 },
          },
          {
            id: 'laboratory_monitoring_required',
            label: 'Laboratory Monitoring Required',
            type: 'yes_no',
          },
          {
            id: 'monitoring_parameters',
            label: 'Monitoring Parameters',
            type: 'textarea',
            visibleWhen: {
              field: 'laboratory_monitoring_required',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'Specify laboratory tests, frequency, and thresholds',
          },
          {
            id: 'driving_operating_machinery',
            label: 'Effects on Driving/Operating Machinery',
            type: 'yes_no',
            helpText:
              'Are there effects on ability to drive or operate machinery?',
          },
          {
            id: 'abuse_dependence_potential',
            label: 'Abuse/Dependence Potential',
            type: 'yes_no',
            helpText:
              'Does the drug have abuse or dependence potential?',
          },
        ],
        defaultNext: 'adverse_reactions_section',
      },

      /* ── Adverse Reactions Section ── */
      {
        id: 'adverse_reactions_section',
        section: 'Warnings & Precautions',
        question:
          'What adverse reaction data should be included in the labeling?',
        guidance:
          'The Adverse Reactions section (Section 6) per 21 CFR 201.57(c)(7) must list adverse reactions from adequate and well-controlled clinical studies and post-marketing experience. Organize by frequency, including the total number of patients exposed, the most common adverse reactions with incidence rates, serious adverse reactions, and the rate of discontinuation due to adverse reactions.',
        fields: [
          {
            id: 'clinical_trials_experience',
            label: 'Clinical Trials Experience',
            type: 'textarea',
            required: true,
            placeholder:
              'Summarize adverse reactions from clinical trials with incidence rates',
          },
          {
            id: 'safety_database_size',
            label: 'Safety Database Size',
            type: 'number',
            required: true,
            helpText:
              'Number of patients exposed to the drug in clinical trials',
          },
          {
            id: 'most_common_adverse_reactions',
            label: 'Most Common Adverse Reactions',
            type: 'textarea',
            required: true,
            placeholder:
              'List most common adverse reactions (≥5% or ≥1%) with incidence',
          },
          {
            id: 'serious_adverse_reactions',
            label: 'Serious Adverse Reactions',
            type: 'textarea',
            placeholder:
              'List serious adverse reactions observed in clinical trials',
          },
          {
            id: 'discontinuation_rate',
            label: 'Discontinuation Rate',
            type: 'number',
            placeholder:
              'Percentage of patients who discontinued due to adverse reactions',
          },
          {
            id: 'post_marketing_experience',
            label: 'Post-Marketing Experience',
            type: 'textarea',
            placeholder: 'Adverse reactions from post-marketing reports',
          },
        ],
        defaultNext: 'drug_interactions_section',
      },

      /* ── Drug Interactions Section ── */
      {
        id: 'drug_interactions_section',
        section: 'Warnings & Precautions',
        question:
          'What drug interactions should be described in the labeling?',
        guidance:
          'The Drug Interactions section (Section 7) per 21 CFR 201.57(c)(8) must describe clinically significant drug interactions and provide management recommendations. Include CYP-mediated interactions, transporter-mediated interactions (P-gp, BCRP, OATP), food interactions, and drug-laboratory test interactions.',
        fields: [
          {
            id: 'drug_interactions_list',
            label: 'Drug Interactions',
            type: 'textarea',
            required: true,
            placeholder:
              'List clinically significant drug interactions',
          },
          {
            id: 'cyp_interactions',
            label: 'CYP-Mediated Interactions',
            type: 'textarea',
            placeholder:
              'CYP-mediated interactions: inhibitors, inducers, substrates',
          },
          {
            id: 'transporter_interactions',
            label: 'Transporter-Mediated Interactions',
            type: 'textarea',
            placeholder:
              'Transporter-mediated interactions: P-gp, BCRP, OATP, etc.',
          },
          {
            id: 'food_interactions',
            label: 'Food Interactions',
            type: 'textarea',
            placeholder: 'Clinically relevant food interactions',
          },
          {
            id: 'drug_lab_test_interactions',
            label: 'Drug-Laboratory Test Interactions',
            type: 'textarea',
            placeholder: 'Known interference with laboratory tests',
          },
        ],
        issueChecks: [
          {
            id: 'drug_interactions_not_addressed',
            condition: {
              field: 'drug_interactions_list',
              operator: 'eq',
              value: '',
            },
            severity: 'warning',
            title: 'Drug Interactions Not Addressed',
            message:
              'The Drug Interactions section is required per 21 CFR 201.57(c)(8). If there are no known interactions, this should be explicitly stated.',
            reference: '21 CFR 201.57(c)(8)',
          },
        ],
        defaultNext: 'use_specific_populations',
      },

      /* ── Use in Specific Populations ── */
      {
        id: 'use_specific_populations',
        section: 'Warnings & Precautions',
        question:
          'What information should be included for use in specific populations?',
        guidance:
          'Section 8 (Use in Specific Populations) per 21 CFR 201.57(c)(9) must address pregnancy, lactation, females and males of reproductive potential, pediatric use, geriatric use, and renal/hepatic impairment. The Pregnancy and Lactation Labeling Rule (PLLR, 79 FR 72064) replaced legacy pregnancy categories (A/B/C/D/X) with descriptive subsections including risk summary, clinical considerations, and data.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'pregnancy_subsection',
            label: 'Pregnancy',
            type: 'textarea',
            required: true,
            placeholder:
              'Pregnancy risk summary, clinical considerations, data',
          },
          {
            id: 'pregnancy_category_removed',
            label: 'Legacy Pregnancy Categories Removed',
            type: 'yes_no',
            helpText:
              'Have legacy pregnancy categories (A/B/C/D/X) been replaced with PLLR format?',
          },
          {
            id: 'lactation_subsection',
            label: 'Lactation',
            type: 'textarea',
            required: true,
            placeholder:
              'Risk summary for breastfeeding, clinical considerations',
          },
          {
            id: 'reproductive_potential',
            label: 'Females and Males of Reproductive Potential',
            type: 'textarea',
            placeholder:
              'Effects on fertility, pregnancy testing requirements, contraception recommendations',
          },
          {
            id: 'pediatric_use',
            label: 'Pediatric Use',
            type: 'textarea',
            required: true,
            placeholder:
              'Pediatric use information including ages studied, safety/efficacy data',
          },
          {
            id: 'geriatric_use',
            label: 'Geriatric Use',
            type: 'textarea',
            required: true,
            placeholder: 'Geriatric use information',
          },
          {
            id: 'renal_impairment',
            label: 'Renal Impairment',
            type: 'textarea',
            placeholder: 'Dosing in renal impairment',
          },
          {
            id: 'hepatic_impairment',
            label: 'Hepatic Impairment',
            type: 'textarea',
            placeholder: 'Dosing in hepatic impairment',
          },
        ],
        issueChecks: [
          {
            id: 'no_pregnancy_subsection',
            condition: {
              field: 'pregnancy_subsection',
              operator: 'eq',
              value: '',
            },
            severity: 'critical',
            title: 'Missing Pregnancy/Lactation Subsection',
            message:
              'The Pregnancy and Lactation Labeling Rule (PLLR, 79 FR 72064) requires all prescription drug labeling to include pregnancy and lactation subsections. Legacy pregnancy categories must be removed.',
            reference: '21 CFR 201.57(c)(9)(i)',
          },
        ],
        defaultNext: 'patient_labeling_section',
      },

      /* ================================================================ */
      /*  Section 6 — Patient Labeling                                    */
      /* ================================================================ */

      /* ── Patient Labeling Section ── */
      {
        id: 'patient_labeling_section',
        section: 'Patient Labeling',
        question:
          'What patient-facing labeling materials are required for this product?',
        guidance:
          'Patient labeling includes Medication Guides (21 CFR 208), Patient Package Inserts, and Instructions for Use for self-administered products. Section 17 (Patient Counseling Information) must reference any FDA-approved patient labeling. Medication Guides are required when the product has serious risks that patients should know about, when patient adherence is critical, or when the product has a REMS with an approved Medication Guide.',
        fields: [
          {
            id: 'medication_guide_required',
            label: 'Medication Guide Required',
            type: 'yes_no',
            required: true,
            helpText:
              'Per 21 CFR 208, a Medication Guide is required for products with serious risks that patients should know about',
          },
          {
            id: 'medication_guide_content',
            label: 'Medication Guide Content',
            type: 'textarea',
            visibleWhen: {
              field: 'medication_guide_required',
              operator: 'eq',
              value: true,
            },
            placeholder:
              'Key content areas of the Medication Guide',
          },
          {
            id: 'patient_package_insert',
            label: 'Patient Package Insert',
            type: 'textarea',
            placeholder:
              'Patient Package Insert content summary if applicable',
          },
          {
            id: 'instructions_for_use',
            label: 'Instructions for Use',
            type: 'textarea',
            placeholder:
              'Instructions for Use for self-administered products',
          },
          {
            id: 'patient_counseling_information',
            label: 'Patient Counseling Information',
            type: 'textarea',
            required: true,
            placeholder:
              'Key points for patient counseling per Section 17 of PLR',
          },
          {
            id: 'carton_container_labeling',
            label: 'Carton/Container Labeling',
            type: 'textarea',
            placeholder:
              'Principal display panel and container labeling text',
          },
        ],
        issueChecks: [
          {
            id: 'no_med_guide_when_required',
            condition: {
              field: 'medication_guide_required',
              operator: 'eq',
              value: false,
            },
            severity: 'warning',
            title: 'Confirm Medication Guide Not Required',
            message:
              'Per 21 CFR 208.1, a Medication Guide is required when the product has serious risks, patient adherence is critical, or it has REMS with an approved Medication Guide. Verify this determination.',
            reference: '21 CFR 208.1(c)',
          },
        ],
        defaultNext: null,
      },

      /* ── OTC Labeling ── */
      {
        id: 'otc_labeling',
        section: 'Patient Labeling',
        question:
          'Let\'s capture the OTC Drug Facts labeling information. What content is needed for the Drug Facts panel?',
        guidance:
          'OTC drug labeling must follow the Drug Facts format per 21 CFR 201.66. The Drug Facts label must include: Active Ingredient(s) and Purpose, Uses, Warnings (including Do Not Use, Ask a Doctor, When Using, Stop Use), Directions, Inactive Ingredients, and Other Information. The format, font size, and layout are strictly prescribed by regulation. Tamper-evident packaging statements are required for most OTC products.',
        fields: [
          {
            id: 'drug_facts_format',
            label: 'Drug Facts Format',
            type: 'yes_no',
            required: true,
            helpText:
              'OTC drugs must use the Drug Facts format per 21 CFR 201.66',
          },
          {
            id: 'active_ingredient_section',
            label: 'Active Ingredient(s) and Purpose',
            type: 'textarea',
            required: true,
            placeholder: 'Active ingredient(s) and purpose(s)',
          },
          {
            id: 'uses_section',
            label: 'Uses',
            type: 'textarea',
            required: true,
            placeholder: 'Indications (uses) in consumer-friendly language',
          },
          {
            id: 'warnings_section',
            label: 'Warnings',
            type: 'textarea',
            required: true,
            placeholder:
              'Warnings including Do Not Use, Ask a Doctor, When Using, Stop Use',
          },
          {
            id: 'directions_section',
            label: 'Directions',
            type: 'textarea',
            required: true,
            placeholder: 'Dosage directions by age group',
          },
          {
            id: 'inactive_ingredients',
            label: 'Inactive Ingredients',
            type: 'textarea',
            required: true,
            placeholder: 'List of inactive ingredients',
          },
          {
            id: 'other_information',
            label: 'Other Information',
            type: 'textarea',
            placeholder: 'Storage conditions and other information',
          },
          {
            id: 'tamper_evident_statement',
            label: 'Tamper-Evident Statement',
            type: 'text',
            placeholder: 'Tamper-evident packaging statement',
          },
        ],
        defaultNext: 'patient_labeling_section',
      },

      /* ── Biosimilar Context ── */
      {
        id: 'biosimilar_context',
        section: 'Patient Labeling',
        question:
          'Let\'s capture the biosimilar-specific labeling information. What is the reference product and interchangeability status?',
        guidance:
          'Biosimilar labeling must follow FDA biosimilar labeling guidance. The labeling must include a statement identifying the product as biosimilar to the reference product, describe the basis for biosimilarity, and list shared indications (including any extrapolated indications). Products designated as interchangeable under the BPCIA must include an interchangeability statement. Clinically meaningful differences from the reference product, if any, must be described.',
        fields: [
          {
            id: 'reference_product',
            label: 'Reference Product',
            type: 'text',
            required: true,
            placeholder: 'Reference product name and BLA number',
          },
          {
            id: 'interchangeable_designation',
            label: 'Interchangeable Designation',
            type: 'yes_no',
            required: true,
            helpText:
              'Has the product been designated as interchangeable per BPCIA?',
          },
          {
            id: 'biosimilar_statement',
            label: 'Biosimilar Statement',
            type: 'textarea',
            required: true,
            placeholder:
              'Required biosimilar statement per FDA biosimilar labeling guidance',
          },
          {
            id: 'reference_product_differences',
            label: 'Differences from Reference Product',
            type: 'textarea',
            placeholder:
              'Any clinically meaningful differences from reference product',
          },
          {
            id: 'shared_indications',
            label: 'Shared Indications',
            type: 'textarea',
            required: true,
            placeholder:
              'List indications shared with reference product, including any extrapolated indications',
          },
          {
            id: 'interchangeability_statement',
            label: 'Interchangeability Statement',
            type: 'textarea',
            visibleWhen: {
              field: 'interchangeable_designation',
              operator: 'eq',
              value: true,
            },
            placeholder: 'Interchangeability statement text',
          },
        ],
        defaultNext: 'regulatory_history',
      },

      /* ================================================================ */
      /*  Section 7 — Device-Specific Labeling                            */
      /* ================================================================ */

      /* ── Device Labeling Context ── */
      {
        id: 'device_labeling_context',
        section: 'Device-Specific Labeling',
        question:
          'Let\'s capture the device classification and identification details for labeling purposes.',
        guidance:
          'Device labeling must comply with 21 CFR 801. The device class, type, and Unique Device Identifier (UDI) per 21 CFR 801.20 determine labeling requirements. GUDID submission is required for most devices. Special controls guidance documents may impose additional labeling requirements for Class II devices. Language requirements vary by market and intended user population.',
        fields: [
          {
            id: 'device_class',
            label: 'Device Class',
            type: 'select',
            required: true,
            options: [
              { value: 'class_i', label: 'Class I' },
              { value: 'class_ii', label: 'Class II' },
              { value: 'class_iii', label: 'Class III' },
            ],
          },
          {
            id: 'device_type',
            label: 'Device Type',
            type: 'select',
            required: true,
            options: [
              { value: 'implantable', label: 'Implantable' },
              { value: 'reusable', label: 'Reusable' },
              { value: 'single_use', label: 'Single Use' },
              { value: 'in_vitro_diagnostic', label: 'In Vitro Diagnostic' },
              { value: 'software_device', label: 'Software Device' },
            ],
          },
          {
            id: 'unique_device_identifier',
            label: 'Unique Device Identifier (UDI-DI)',
            type: 'text',
            required: true,
            placeholder: 'UDI-DI',
            helpText: 'Unique Device Identifier per 21 CFR 801.20',
          },
          {
            id: 'gudid_submission_required',
            label: 'GUDID Submission Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'device_listed_in_fda_database',
            label: 'Listed in FDA Database',
            type: 'yes_no',
          },
          {
            id: 'labeling_language_requirements',
            label: 'Language Requirements',
            type: 'multi_select',
            options: [
              { value: 'english', label: 'English' },
              { value: 'spanish', label: 'Spanish' },
              { value: 'french', label: 'French' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'special_controls_applicable',
            label: 'Special Controls Applicable',
            type: 'yes_no',
            helpText:
              'Are there special controls guidance documents applicable to this device?',
          },
        ],
        defaultNext: 'device_labeling_content',
      },

      /* ── Device Labeling Content ── */
      {
        id: 'device_labeling_content',
        section: 'Device-Specific Labeling',
        question:
          'What content should be included in the device labeling?',
        guidance:
          'Device labeling content per 21 CFR 801 must include the intended use/indications for use statement, warnings, contraindications, and performance characteristics. MRI safety labeling per ASTM F2503 is required for implantable and metallic devices. Sterilization labeling, shelf life, and standardized symbol usage (per 21 CFR 801.15 and ISO 15223) must be addressed as applicable.',
        fields: [
          {
            id: 'intended_use_statement',
            label: 'Intended Use Statement',
            type: 'textarea',
            required: true,
            placeholder: 'Intended use/indications for use statement',
          },
          {
            id: 'device_warnings',
            label: 'Device Warnings',
            type: 'textarea',
            required: true,
            placeholder: 'Device-specific warnings and cautions',
          },
          {
            id: 'device_contraindications',
            label: 'Device Contraindications',
            type: 'textarea',
            required: true,
            placeholder: 'Contraindications for device use',
          },
          {
            id: 'performance_characteristics',
            label: 'Performance Characteristics',
            type: 'textarea',
            placeholder:
              'Key performance characteristics and specifications',
          },
          {
            id: 'mri_safety_labeling',
            label: 'MRI Safety Labeling',
            type: 'select',
            helpText: 'MRI safety labeling per ASTM F2503',
            options: [
              { value: 'mr_safe', label: 'MR Safe' },
              { value: 'mr_conditional', label: 'MR Conditional' },
              { value: 'mr_unsafe', label: 'MR Unsafe' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'sterilization_labeling',
            label: 'Sterilization Labeling',
            type: 'textarea',
            placeholder:
              'Sterilization method and instructions if applicable',
          },
          {
            id: 'shelf_life_expiration',
            label: 'Shelf Life / Expiration',
            type: 'text',
            placeholder: 'Shelf life and expiration dating',
          },
          {
            id: 'symbol_usage',
            label: 'Symbol Usage',
            type: 'multi_select',
            helpText:
              'Standardized symbols used on labeling per 21 CFR 801.15',
            options: [
              { value: 'iso_15223_symbols', label: 'ISO 15223 Symbols' },
              { value: 'astm_symbols', label: 'ASTM Symbols' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
        defaultNext: 'device_ifu',
      },

      /* ── Device IFU ── */
      {
        id: 'device_ifu',
        section: 'Device-Specific Labeling',
        question:
          'What Instructions for Use (IFU) content is needed for this device?',
        guidance:
          'Instructions for Use (IFU) must be clear, complete, and validated through human factors/usability testing per IEC 62366-1. The IFU should include setup/assembly, step-by-step operating instructions, maintenance and reprocessing (for reusable devices), troubleshooting, and disposal instructions. The IFU format (printed, electronic, or both) should be appropriate for the intended user and use environment.',
        fields: [
          {
            id: 'ifu_included',
            label: 'IFU Included',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'ifu_format',
            label: 'IFU Format',
            type: 'select',
            visibleWhen: {
              field: 'ifu_included',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'printed', label: 'Printed' },
              { value: 'electronic', label: 'Electronic' },
              { value: 'both', label: 'Both' },
            ],
          },
          {
            id: 'setup_instructions',
            label: 'Setup Instructions',
            type: 'textarea',
            placeholder: 'Device setup and assembly instructions',
          },
          {
            id: 'operating_instructions',
            label: 'Operating Instructions',
            type: 'textarea',
            required: true,
            placeholder: 'Step-by-step operating/use instructions',
          },
          {
            id: 'maintenance_instructions',
            label: 'Maintenance Instructions',
            type: 'textarea',
            placeholder:
              'Cleaning, maintenance, and reprocessing instructions',
          },
          {
            id: 'troubleshooting_guide',
            label: 'Troubleshooting Guide',
            type: 'textarea',
            placeholder: 'Common issues and troubleshooting steps',
          },
          {
            id: 'disposal_instructions',
            label: 'Disposal Instructions',
            type: 'textarea',
            placeholder: 'End-of-life and disposal instructions',
          },
          {
            id: 'human_factors_validated',
            label: 'Human Factors Validated',
            type: 'yes_no',
            required: true,
            helpText:
              'Has the IFU been validated through human factors/usability testing per IEC 62366-1?',
          },
        ],
        defaultNext: 'patient_labeling_section',
      },
    ],
  };
}
