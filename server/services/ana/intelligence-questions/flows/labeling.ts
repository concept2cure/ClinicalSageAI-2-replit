/**
 * Labeling flow definition for the AnA Intelligence Questioning system.
 *
 * Guides the user through comprehensive FDA-regulated product labeling
 * development and review, covering Highlights of Prescribing Information,
 * Full Prescribing Information (PLR format per 21 CFR 201.56-57), Use in
 * Specific Populations (PLLR), device labeling (21 CFR 801, IFU, UDI),
 * patient labeling (Medication Guide per 21 CFR 208), safety communications,
 * and regulatory review readiness including promotional consistency.
 *
 * 20 nodes · 8 sections · 90+ fields · 14 issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/labeling
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createLabelingFlow(): FlowDefinition {
  return {
    id: 'labeling-v1',
    category: 'labeling',
    name: 'Product Labeling',
    description:
      'Comprehensive questionnaire for developing or reviewing FDA-regulated product labeling per 21 CFR 201.56-57 (PLR format), 21 CFR 801 (device labeling), and ICH M4 (CTD Module 1.3). Covers Highlights, Full Prescribing Information, Use in Specific Populations (PLLR), device labeling (IFU/UDI), patient labeling (Medication Guide), safety communications, and regulatory review readiness.',
    clientTypes: [],
    entryNode: 'labeling_overview',
    estimatedMinutes: 40,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'labeling_overview_section',
        label: 'Labeling Overview',
        nodeIds: ['labeling_overview', 'labeling_format'],
      },
      {
        id: 'highlights_section',
        label: 'Highlights of Prescribing Information',
        nodeIds: ['highlights_header', 'highlights_safety'],
      },
      {
        id: 'fpi_section',
        label: 'Full Prescribing Information',
        nodeIds: [
          'fpi_indications',
          'fpi_dosage',
          'fpi_clinical_pharmacology',
          'fpi_safety',
          'fpi_drug_interactions',
          'fpi_clinical_studies',
        ],
      },
      {
        id: 'specific_populations_section',
        label: 'Use in Specific Populations',
        nodeIds: ['pregnancy_lactation', 'other_populations'],
      },
      {
        id: 'device_labeling_section',
        label: 'Device Labeling',
        nodeIds: ['device_label_content', 'device_ifu'],
      },
      {
        id: 'patient_labeling_section',
        label: 'Patient Labeling',
        nodeIds: ['medication_guide', 'patient_counseling'],
      },
      {
        id: 'safety_communication_section',
        label: 'Safety Communications',
        nodeIds: ['safety_labeling_changes', 'risk_communication'],
      },
      {
        id: 'regulatory_review_section',
        label: 'Regulatory Review',
        nodeIds: ['regulatory_review_status', 'promotional_consistency'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ══════════════════════════════════════════════════════════════════
       *  Section 1 — Labeling Overview
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 1 — labeling_overview                                      */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'labeling_overview',
        section: 'labeling_overview_section',
        question:
          'Let\'s begin the labeling process. What is the product, its regulatory pathway, and the purpose of this labeling activity?',
        guidance:
          'Per 21 CFR 201.56(a), the Physician Labeling Rule (PLR) format applies to all prescription drug and biological product labeling submitted to FDA. For devices, 21 CFR 801.1 defines the scope of device labeling as all written, printed, or graphic matter on the device or its containers or wrappers. FDA Guidance "Labeling for Human Prescription Drug and Biological Products — Implementing the PLR Content and Format Requirements" (2013) provides detailed instructions for structuring each section. ICH M4 Module 1.3.1 specifies the regional administrative information for labeling in the Common Technical Document. Accurate identification of the product type, regulatory pathway, and labeling purpose is essential to selecting the correct format and ensuring all required elements are addressed from the outset.',
        fields: [
          {
            id: 'proprietary_name',
            label: 'Proprietary (Brand) Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. Keytruda',
          },
          {
            id: 'established_name',
            label: 'Established (Generic) Name',
            type: 'text',
            required: true,
            placeholder: 'e.g. pembrolizumab',
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule_drug', label: 'Small Molecule Drug' },
              { value: 'biologic', label: 'Biologic' },
              { value: 'biosimilar', label: 'Biosimilar' },
              { value: 'generic_drug', label: 'Generic Drug' },
              { value: 'otc_drug', label: 'OTC Drug' },
              { value: 'combination_product', label: 'Combination Product' },
              { value: 'medical_device', label: 'Medical Device' },
              { value: 'ivd', label: 'In Vitro Diagnostic (IVD)' },
            ],
          },
          {
            id: 'dosage_form_route',
            label: 'Dosage Form and Route of Administration',
            type: 'text',
            required: true,
            placeholder: 'e.g. Injection, 100 mg/4 mL for intravenous infusion',
          },
          {
            id: 'application_number',
            label: 'Application Number',
            type: 'text',
            placeholder: 'e.g. NDA 209092, BLA 125514, 510(k) K201234',
          },
          {
            id: 'regulatory_status',
            label: 'Regulatory Status',
            type: 'select',
            required: true,
            options: [
              { value: 'initial_approval', label: 'Initial Approval' },
              { value: 'supplement_new_indication', label: 'Supplement — New Indication' },
              { value: 'safety_labeling_change', label: 'Safety Labeling Change' },
              { value: 'annual_report_update', label: 'Annual Report Update' },
              { value: 'plr_conversion', label: 'PLR Format Conversion' },
              { value: 'postmarket_requirement', label: 'Post-Marketing Requirement' },
            ],
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'text',
            placeholder: 'e.g. Oncology — Non-Small Cell Lung Cancer',
          },
          {
            id: 'labeling_history_summary',
            label: 'Labeling History Summary',
            type: 'textarea',
            placeholder: 'Brief history of prior labeling revisions, if any',
          },
        ],
        branches: [
          {
            when: {
              field: 'product_type',
              operator: 'in',
              value: ['medical_device', 'ivd'],
            },
            goto: 'device_label_content',
          },
          {
            when: {
              field: 'product_type',
              operator: 'eq',
              value: 'otc_drug',
            },
            goto: 'fpi_indications',
          },
        ],
        defaultNext: 'labeling_format',
        issueChecks: [
          {
            id: 'otc_format_warning',
            condition: {
              field: 'product_type',
              operator: 'eq',
              value: 'otc_drug',
            },
            severity: 'info',
            title: 'OTC Drug Facts Format Required',
            message:
              'OTC drug products use the Drug Facts labeling format per 21 CFR 201.66 rather than the PLR format. Ensure the correct template is applied. The Drug Facts format includes Active Ingredient, Uses, Warnings, Directions, Other Information, and Inactive Ingredients sections in a standardized order.',
            reference: '21 CFR 201.66, FDA Guidance on OTC Drug Facts Labeling',
          },
        ],
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 2 — labeling_format                                        */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'labeling_format',
        section: 'labeling_overview_section',
        question:
          'Which labeling format(s) and geographic regions apply to this product?',
        guidance:
          'Labeling format is determined by the product type and target market. In the US, prescription drugs must follow the PLR format per 21 CFR 201.56-57 (Sections 1-17 with standardized headings and content). In the EU, the Quality Review of Documents (QRD) template governs SmPC and Package Leaflet format. ICH M4 defines the CTD Module 1 regional administrative information including labeling. Device labeling follows 21 CFR 801 in the US and EU MDR 2017/745 Annex I Chapter III in Europe. The FDA Structured Product Labeling (SPL) format uses HL7 XML for electronic submission per FDA Guidance "Providing Regulatory Submissions in Electronic Format — Certain Human Pharmaceutical Product Applications and Related Submissions Using the eCTD Specifications" (2023). REMS-required products per 21 USC 355-1 must incorporate additional labeling elements including Medication Guides, communication plans, and Elements to Assure Safe Use (ETASU).',
        fields: [
          {
            id: 'primary_format',
            label: 'Primary Labeling Format',
            type: 'select',
            required: true,
            options: [
              { value: 'uspi_plr', label: 'USPI — PLR Format (21 CFR 201.56-57)' },
              { value: 'smpc_eu', label: 'SmPC — EU QRD Template' },
              { value: 'otc_drug_facts', label: 'OTC Drug Facts (21 CFR 201.66)' },
              { value: 'device_label_21cfr801', label: 'Device Label (21 CFR 801)' },
              { value: 'ifu_mdr', label: 'IFU — EU MDR Annex I' },
              { value: 'medication_guide', label: 'Medication Guide (21 CFR 208)' },
            ],
          },
          {
            id: 'additional_documents',
            label: 'Additional Labeling Documents',
            type: 'multi_select',
            options: [
              { value: 'uspi', label: 'USPI (Full Prescribing Information)' },
              { value: 'smpc', label: 'SmPC (Summary of Product Characteristics)' },
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'patient_package_insert', label: 'Patient Package Insert' },
              { value: 'ifu', label: 'Instructions for Use' },
              { value: 'patient_wallet_card', label: 'Patient Wallet Card' },
              { value: 'rems_materials', label: 'REMS Materials' },
              { value: 'dear_hcp_letter', label: 'Dear Healthcare Provider Letter' },
            ],
          },
          {
            id: 'geographic_regions',
            label: 'Geographic Regions',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'us', label: 'United States' },
              { value: 'eu', label: 'European Union' },
              { value: 'japan', label: 'Japan' },
              { value: 'china', label: 'China' },
              { value: 'canada', label: 'Canada' },
              { value: 'australia', label: 'Australia' },
              { value: 'global', label: 'Global / Multi-Region' },
            ],
          },
          {
            id: 'applicable_regulations',
            label: 'Applicable Regulations',
            type: 'multi_select',
            required: true,
            options: [
              { value: '21_cfr_201_56_57', label: '21 CFR 201.56-57 (PLR Rule)' },
              { value: '21_cfr_801', label: '21 CFR 801 (Device Labeling)' },
              { value: 'plr_rule', label: 'PLR Final Rule (71 FR 3922)' },
              { value: 'eu_qrd_template', label: 'EU QRD Template' },
              { value: 'eu_mdr_annex_i', label: 'EU MDR 2017/745 Annex I' },
              { value: 'ich_m4', label: 'ICH M4 (CTD Module 1)' },
              { value: 'fda_spl', label: 'FDA SPL (HL7 XML)' },
            ],
          },
          {
            id: 'spl_submission',
            label: 'SPL Submission Planned',
            type: 'yes_no',
            helpText:
              'FDA requires labeling submission in Structured Product Labeling (SPL) XML format via the FDA Electronic Submissions Gateway. SPL uses HL7 RIM-based XML and is required for all NDA/BLA/ANDA labeling submissions per FDA Guidance on SPL.',
          },
          {
            id: 'rems_required',
            label: 'REMS Required',
            type: 'yes_no',
            helpText:
              'A Risk Evaluation and Mitigation Strategy (REMS) per 21 USC 355-1 may require a Medication Guide, communication plan, Elements to Assure Safe Use (ETASU), or an implementation system. REMS elements must be reflected in multiple labeling sections.',
          },
        ],
        defaultNext: 'highlights_header',
        issueChecks: [
          {
            id: 'boxed_warning_rems_check',
            condition: {
              field: 'rems_required',
              operator: 'eq',
              value: true,
            },
            severity: 'warning',
            title: 'REMS Affects Multiple Labeling Sections',
            message:
              'Products with a REMS require cross-referencing REMS elements in the Boxed Warning, Warnings and Precautions, and Patient Counseling Information sections. The Medication Guide is often a component of the REMS. Ensure all REMS-related labeling elements are consistent across sections per FDA Guidance "Format and Content of a REMS Document" (2017).',
            reference: '21 USC 355-1, FDA REMS Guidance (2017)',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 2 — Highlights of Prescribing Information
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 3 — highlights_header                                      */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'highlights_header',
        section: 'highlights_section',
        question:
          'Let\'s build the Highlights of Prescribing Information. What are the key elements for the Highlights header?',
        guidance:
          'Per 21 CFR 201.57(a), the Highlights of Prescribing Information must appear as the first section of the USPI. It serves as a summary of the most critical prescribing information and must not exceed one full page in length. The Highlights header includes the product name, initial US approval year, and—if applicable—a Boxed Warning per 21 CFR 201.57(a)(4). FDA Guidance "Labeling for Human Prescription Drug and Biological Products — Implementing the PLR Content and Format Requirements" (2013) specifies that Recent Major Changes must list section titles and dates of substantive labeling changes within the past year. The PLR Final Rule (71 FR 3922, January 24, 2006) established the current format. Each Highlights subheading must follow the exact order specified in 21 CFR 201.57(a)(1)-(14).',
        fields: [
          {
            id: 'initial_us_approval_year',
            label: 'Initial U.S. Approval Year',
            type: 'text',
            required: true,
            placeholder: 'e.g. 2014',
          },
          {
            id: 'boxed_warning_required',
            label: 'Boxed Warning Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'boxed_warning_text',
            label: 'Boxed Warning Text',
            type: 'textarea',
            visibleWhen: {
              field: 'boxed_warning_required',
              operator: 'eq',
              value: true,
            },
            placeholder: 'Full text of the Boxed Warning',
          },
          {
            id: 'recent_major_changes',
            label: 'Recent Major Changes',
            type: 'textarea',
            placeholder: 'List sections with recent major changes and effective dates',
          },
          {
            id: 'indications_summary',
            label: 'Indications and Usage Summary',
            type: 'textarea',
            required: true,
            placeholder: 'One-sentence summary of approved indication(s) for Highlights',
          },
          {
            id: 'dosage_summary',
            label: 'Dosage and Administration Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Brief dosage and administration summary for Highlights',
          },
          {
            id: 'dosage_forms_strengths',
            label: 'Dosage Forms and Strengths',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. Injection: 100 mg/4 mL (25 mg/mL) solution in a single-dose vial',
          },
        ],
        defaultNext: 'highlights_safety',
        issueChecks: [
          {
            id: 'boxed_warning_present',
            condition: {
              field: 'boxed_warning_required',
              operator: 'eq',
              value: true,
            },
            severity: 'critical',
            title: 'Boxed Warning Requires Special Formatting',
            message:
              'A Boxed Warning must appear in the Highlights section within a box and must be repeated in the full Warnings and Precautions section. Per 21 CFR 201.57(c)(1), the boxed warning must describe the serious risk, the population at risk, and any required monitoring or REMS. FDA\'s Office of Prescription Drug Promotion (OPDP) requires all promotional materials to include the Boxed Warning.',
            reference: '21 CFR 201.57(a)(4), 21 CFR 201.57(c)(1), OPDP Guidance',
          },
        ],
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 4 — highlights_safety                                      */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'highlights_safety',
        section: 'highlights_section',
        question:
          'What safety and interaction highlights should appear in the Highlights section?',
        guidance:
          'Per 21 CFR 201.57(a)(5)-(11), the Highlights section must include brief summaries of Contraindications, Warnings and Precautions, Adverse Reactions, Drug Interactions, and Use in Specific Populations. The Adverse Reactions summary must state the most common adverse reactions above a predefined incidence threshold (typically ≥ 5% or ≥ 10%) and direct prescribers to the full Adverse Reactions section (Section 6) for additional detail. The Highlights section must also include a reference to Patient Counseling Information (Section 17) and any FDA-approved patient labeling such as a Medication Guide per the PLR Final Rule content requirements.',
        fields: [
          {
            id: 'contraindications_summary',
            label: 'Contraindications Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Brief contraindications for Highlights',
          },
          {
            id: 'warnings_summary',
            label: 'Warnings and Precautions Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Key warnings and precautions for Highlights',
          },
          {
            id: 'adverse_reactions_summary',
            label: 'Adverse Reactions Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Most common adverse reactions for Highlights (include incidence threshold)',
          },
          {
            id: 'drug_interactions_summary',
            label: 'Drug Interactions Summary',
            type: 'textarea',
            placeholder: 'Key drug interactions for Highlights',
          },
          {
            id: 'specific_populations_summary',
            label: 'Use in Specific Populations Summary',
            type: 'textarea',
            placeholder: 'Key specific populations information for Highlights (e.g. pregnancy category)',
          },
          {
            id: 'patient_counseling_reference',
            label: 'Patient Counseling Information Reference',
            type: 'yes_no',
            helpText:
              'Highlights must reference Section 17 Patient Counseling Information and any Medication Guide. Per 21 CFR 201.57(a)(14), the Highlights must include a statement advising prescribers to see the full prescribing information and any FDA-approved patient labeling.',
          },
        ],
        defaultNext: 'fpi_indications',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 3 — Full Prescribing Information
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 5 — fpi_indications                                        */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'fpi_indications',
        section: 'fpi_section',
        question:
          'What are the full Indications and Usage details for Section 1 of the FPI?',
        guidance:
          'Per 21 CFR 201.57(c)(2), the Indications and Usage section must state each approved indication, the specific patient population (including age ranges and biomarker requirements), and any limitations of use. For products with accelerated approval per 21 CFR 314.510 or 21 CFR 601.41, the indication statement must include the accelerated approval limitation and the requirement for confirmatory trials per FDA Guidance "Expedited Programs for Serious Conditions — Drugs and Biologics" (2014). ICH E3 Section 11 provides context on how clinical study results support the indication statement. If a companion diagnostic is required, the diagnostic must be identified by name and FDA clearance/approval number per FDA Guidance "In Vitro Companion Diagnostic Devices" (2014).',
        fields: [
          {
            id: 'primary_indication',
            label: 'Primary Indication Statement',
            type: 'textarea',
            required: true,
            placeholder: 'e.g. KEYTRUDA is indicated for the treatment of patients with unresectable or metastatic melanoma.',
          },
          {
            id: 'additional_indications',
            label: 'Additional Indications',
            type: 'textarea',
          },
          {
            id: 'therapeutic_class',
            label: 'Therapeutic Class',
            type: 'text',
            required: true,
            placeholder: 'e.g. Programmed death receptor-1 (PD-1)-blocking antibody',
          },
          {
            id: 'patient_population',
            label: 'Patient Population',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'adults', label: 'Adults (≥ 18 years)' },
              { value: 'adolescents_12_17', label: 'Adolescents (12-17 years)' },
              { value: 'pediatric_under_12', label: 'Pediatric (< 12 years)' },
              { value: 'geriatric_65_plus', label: 'Geriatric (≥ 65 years)' },
              { value: 'all_ages', label: 'All Ages' },
            ],
          },
          {
            id: 'line_of_therapy',
            label: 'Line of Therapy',
            type: 'select',
            options: [
              { value: 'first_line', label: 'First-Line' },
              { value: 'second_line', label: 'Second-Line' },
              { value: 'third_line_plus', label: 'Third-Line or Later' },
              { value: 'adjuvant', label: 'Adjuvant' },
              { value: 'neoadjuvant', label: 'Neoadjuvant' },
              { value: 'maintenance', label: 'Maintenance' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'companion_diagnostic_required',
            label: 'Companion Diagnostic Required',
            type: 'yes_no',
          },
          {
            id: 'limitations_of_use',
            label: 'Limitations of Use',
            type: 'textarea',
          },
        ],
        defaultNext: 'fpi_dosage',
        issueChecks: [
          {
            id: 'single_study_efficacy',
            condition: {
              field: 'line_of_therapy',
              operator: 'eq',
              value: 'first_line',
            },
            severity: 'info',
            title: 'First-Line Indication — Confirm Adequate Evidence',
            message:
              'First-line indications typically require substantial evidence of efficacy from adequate and well-controlled studies per 21 CFR 314.126. For accelerated approval indications, the indication statement must include the accelerated approval limitation and requirement for confirmatory trials per FDA Guidance "Expedited Programs for Serious Conditions" (2014).',
            reference: '21 CFR 314.126, 21 CFR 314.510, FDA Expedited Programs Guidance (2014)',
          },
        ],
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 6 — fpi_dosage                                             */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'fpi_dosage',
        section: 'fpi_section',
        question:
          'What are the Dosage and Administration details for Section 2 of the FPI?',
        guidance:
          'Per 21 CFR 201.57(c)(3), the Dosage and Administration section must provide the recommended dosage, available dosage forms and strengths, preparation and administration instructions, and any dose modifications for adverse reactions or organ impairment. FDA expects dose modification tables for products with dose-limiting toxicities, particularly in oncology per FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018). The section should include instructions specific to the dosage form (e.g., reconstitution for lyophilized products, infusion rates for IV products, injection site rotation for subcutaneous products). For products with renal or hepatic dose adjustments, cross-reference Section 8 and Section 12 as applicable.',
        fields: [
          {
            id: 'recommended_dosage',
            label: 'Recommended Dosage',
            type: 'textarea',
            required: true,
          },
          {
            id: 'available_strengths',
            label: 'Available Strengths',
            type: 'text',
            required: true,
          },
          {
            id: 'dosing_schedule',
            label: 'Dosing Schedule',
            type: 'select',
            required: true,
            options: [
              { value: 'once_daily', label: 'Once Daily' },
              { value: 'twice_daily', label: 'Twice Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'every_2_weeks', label: 'Every 2 Weeks' },
              { value: 'every_3_weeks', label: 'Every 3 Weeks' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'single_dose', label: 'Single Dose' },
              { value: 'as_needed', label: 'As Needed (PRN)' },
              { value: 'custom', label: 'Custom / Other' },
            ],
          },
          {
            id: 'dose_modifications',
            label: 'Dose Modifications',
            type: 'textarea',
            placeholder: 'Dose modification tables for adverse reactions, organ impairment, or drug interactions',
          },
          {
            id: 'preparation_instructions',
            label: 'Preparation and Handling Instructions',
            type: 'textarea',
          },
          {
            id: 'administration_instructions',
            label: 'Administration Instructions',
            type: 'textarea',
            required: true,
          },
          {
            id: 'renal_hepatic_adjustments',
            label: 'Renal and Hepatic Dose Adjustments',
            type: 'textarea',
          },
        ],
        defaultNext: 'fpi_clinical_pharmacology',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 7 — fpi_clinical_pharmacology                              */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'fpi_clinical_pharmacology',
        section: 'fpi_section',
        question:
          'What Clinical Pharmacology information should appear in Section 12 of the FPI?',
        guidance:
          'Per 21 CFR 201.57(c)(13), the Clinical Pharmacology section must describe the mechanism of action, pharmacodynamic properties, and pharmacokinetic parameters (absorption, distribution, metabolism, and excretion). ICH E4 provides guidance on dose-response information to support drug registration. ICH E5 addresses ethnic factors in the acceptability of foreign clinical data and their impact on clinical pharmacology labeling. FDA Guidance "Clinical Pharmacology Labeling for Human Prescription Drug and Biological Products — Content and Format" (2016) specifies that the section should include PK parameters in tabular form, food effect results, and CYP enzyme substrate/inhibitor/inducer characterization. The section must also describe pharmacokinetics in special populations (renal impairment, hepatic impairment, pediatric, geriatric) with cross-references to Dosage and Administration (Section 2) and Use in Specific Populations (Section 8) as appropriate.',
        fields: [
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action',
            type: 'textarea',
            required: true,
          },
          {
            id: 'pharmacodynamics',
            label: 'Pharmacodynamics',
            type: 'textarea',
          },
          {
            id: 'pharmacokinetics_summary',
            label: 'Pharmacokinetics Summary',
            type: 'textarea',
            required: true,
          },
          {
            id: 'cyp_metabolism',
            label: 'CYP Enzyme and Transporter Characterization',
            type: 'multi_select',
            options: [
              { value: 'cyp3a4_substrate', label: 'CYP3A4 Substrate' },
              { value: 'cyp3a4_inhibitor', label: 'CYP3A4 Inhibitor' },
              { value: 'cyp3a4_inducer', label: 'CYP3A4 Inducer' },
              { value: 'cyp2d6_substrate', label: 'CYP2D6 Substrate' },
              { value: 'cyp2d6_inhibitor', label: 'CYP2D6 Inhibitor' },
              { value: 'cyp2c9_substrate', label: 'CYP2C9 Substrate' },
              { value: 'cyp2c19_substrate', label: 'CYP2C19 Substrate' },
              { value: 'pgp_substrate', label: 'P-gp Substrate' },
              { value: 'none_significant', label: 'None Significant' },
            ],
          },
          {
            id: 'food_effect',
            label: 'Food Effect',
            type: 'select',
            options: [
              { value: 'no_effect', label: 'No Clinically Significant Effect' },
              { value: 'take_with_food', label: 'Take With Food' },
              { value: 'empty_stomach', label: 'Take on Empty Stomach' },
              { value: 'high_fat_meal_effect', label: 'High-Fat Meal Effect (describe in PK summary)' },
              { value: 'not_applicable_non_oral', label: 'Not Applicable (Non-Oral Route)' },
            ],
          },
          {
            id: 'special_pk_populations',
            label: 'Special PK Populations Studied',
            type: 'multi_select',
            options: [
              { value: 'renal_impairment', label: 'Renal Impairment' },
              { value: 'hepatic_impairment', label: 'Hepatic Impairment' },
              { value: 'pediatric', label: 'Pediatric' },
              { value: 'geriatric', label: 'Geriatric' },
              { value: 'obese', label: 'Obese' },
              { value: 'gender', label: 'Gender' },
              { value: 'race_ethnicity', label: 'Race / Ethnicity' },
            ],
          },
        ],
        defaultNext: 'fpi_safety',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 8 — fpi_safety                                             */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'fpi_safety',
        section: 'fpi_section',
        question:
          'What are the key safety sections for the FPI — Contraindications, Warnings and Precautions, and Adverse Reactions?',
        guidance:
          'Per 21 CFR 201.57(c)(4), Contraindications must list situations where the drug should not be used because the risk clearly outweighs any benefit. Per 21 CFR 201.57(c)(6), Warnings and Precautions must describe clinically significant adverse reactions, other potential safety hazards, and steps to prevent or mitigate them. Per 21 CFR 201.57(c)(7), Adverse Reactions must list adverse reactions from clinical trials (organized by frequency and severity) and post-marketing experience. MedDRA preferred terms should be used for adverse reaction coding per ICH E2B(R3). ICH E2C(R2) provides guidance on periodic safety reporting that may trigger labeling updates. The safety database size should meet ICH E1 recommendations (at least 300-600 patients for non-life-threatening conditions, 1500 for chronic-use products). For biologics, immunogenicity data including anti-drug antibody (ADA) rates must be reported per FDA Guidance "Immunogenicity Testing of Therapeutic Protein Products" (2014).',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'contraindication_list',
            label: 'Contraindications',
            type: 'textarea',
            required: true,
          },
          {
            id: 'warning_categories',
            label: 'Warning Categories',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'hepatotoxicity', label: 'Hepatotoxicity' },
              { value: 'cardiotoxicity_qt', label: 'Cardiotoxicity / QT Prolongation' },
              { value: 'nephrotoxicity', label: 'Nephrotoxicity' },
              { value: 'immunosuppression', label: 'Immunosuppression' },
              { value: 'hemorrhage', label: 'Hemorrhage' },
              { value: 'embryo_fetal_toxicity', label: 'Embryo-Fetal Toxicity' },
              { value: 'hypersensitivity', label: 'Hypersensitivity / Anaphylaxis' },
              { value: 'cns_effects', label: 'CNS Effects' },
              { value: 'gi_perforation', label: 'GI Perforation' },
              { value: 'dermatologic', label: 'Dermatologic Reactions' },
              { value: 'endocrinopathies', label: 'Endocrinopathies' },
              { value: 'infusion_reactions', label: 'Infusion Reactions' },
              { value: 'cytopenias', label: 'Cytopenias' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'key_warnings_text',
            label: 'Key Warnings and Precautions Text',
            type: 'textarea',
            required: true,
          },
          {
            id: 'monitoring_recommendations',
            label: 'Monitoring Recommendations',
            type: 'textarea',
          },
          {
            id: 'safety_database_size',
            label: 'Safety Database Size (Number of Patients Exposed)',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'serious_adverse_reactions',
            label: 'Serious Adverse Reactions',
            type: 'textarea',
            required: true,
          },
          {
            id: 'common_adverse_reactions',
            label: 'Common Adverse Reactions',
            type: 'textarea',
            required: true,
            placeholder: 'List adverse reactions with ≥ 10% incidence in the treatment group (or appropriate threshold)',
          },
          {
            id: 'postmarket_experience',
            label: 'Post-Marketing Experience',
            type: 'textarea',
          },
          {
            id: 'immunogenicity_data',
            label: 'Immunogenicity Data',
            type: 'textarea',
            helpText:
              'For biologic products, report anti-drug antibody (ADA) incidence and neutralizing antibody rates per FDA Guidance "Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibody Detection" (2019). Include the impact of ADA on pharmacokinetics, safety, and efficacy.',
          },
        ],
        defaultNext: 'fpi_drug_interactions',
        issueChecks: [
          {
            id: 'small_safety_db',
            condition: {
              field: 'safety_database_size',
              operator: 'lt',
              value: 300,
            },
            severity: 'warning',
            title: 'Limited Safety Database',
            message:
              'ICH E1 recommends at least 300-600 patients exposed for non-life-threatening conditions and 1500 for chronic-use products to characterize the adverse reaction profile. A safety database below 300 may result in FDA requests for additional safety data or post-marketing requirements per 21 CFR 314.80.',
            reference: 'ICH E1, 21 CFR 314.80, FDA Safety Reporting Guidance',
          },
          {
            id: 'drug_interactions_warning',
            condition: {
              field: 'warning_categories',
              operator: 'contains',
              value: 'cardiotoxicity_qt',
            },
            severity: 'warning',
            title: 'QT Prolongation Requires Drug Interaction Section Review',
            message:
              'Products with QT prolongation warnings must include corresponding Drug Interactions information per FDA Guidance "E14 Clinical Evaluation of QT/QTc Interval Prolongation" (2005, updated 2017). The Warnings section must cross-reference concomitant drugs that prolong QT. Consider whether a dedicated QT study (ICH E14 thorough QT study) has been conducted.',
            reference: 'ICH E14, FDA QT Guidance (2005/2017), 21 CFR 201.57(c)(7)',
          },
        ],
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 9 — fpi_drug_interactions                                  */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'fpi_drug_interactions',
        section: 'fpi_section',
        question:
          'What Drug Interactions information should be included in Section 7 of the FPI?',
        guidance:
          'Per 21 CFR 201.57(c)(8), the Drug Interactions section must describe clinically significant interactions that have been studied or predicted based on in vitro data, along with management recommendations (dose adjustment, monitoring, or avoidance). FDA Guidance "Clinical Drug Interaction Studies — Cytochrome P450 Enzyme- and Transporter-Mediated Drug Interactions" (2020) outlines the study expectations for CYP-mediated and transporter-mediated interactions. ICH E14 and E15 address cardiac safety interactions and pharmacogenomic considerations, respectively. ICH E16 provides guidance on biomarkers related to drug interactions. The section should include in vitro CYP and transporter data, results of dedicated clinical DDI studies, population PK analyses, and physiologically-based PK (PBPK) modeling predictions where applicable. Food and laboratory test interactions must also be described per 21 CFR 201.57(c)(8).',
        fields: [
          {
            id: 'clinically_significant_interactions',
            label: 'Clinically Significant Drug Interactions',
            type: 'textarea',
            required: true,
          },
          {
            id: 'interaction_study_types',
            label: 'Interaction Study Types Conducted',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'in_vitro_cyp', label: 'In Vitro CYP Studies' },
              { value: 'in_vitro_transporter', label: 'In Vitro Transporter Studies' },
              { value: 'dedicated_clinical_ddi', label: 'Dedicated Clinical DDI Studies' },
              { value: 'population_pk', label: 'Population PK Analysis' },
              { value: 'pbpk_modeling', label: 'PBPK Modeling' },
            ],
          },
          {
            id: 'concomitant_contraindicated',
            label: 'Concomitant Drugs Contraindicated',
            type: 'textarea',
          },
          {
            id: 'dose_adjustment_interactions',
            label: 'Interactions Requiring Dose Adjustment',
            type: 'textarea',
          },
          {
            id: 'food_interactions',
            label: 'Food Interactions',
            type: 'textarea',
          },
          {
            id: 'lab_test_interactions',
            label: 'Drug-Laboratory Test Interactions',
            type: 'textarea',
          },
        ],
        defaultNext: 'fpi_clinical_studies',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 10 — fpi_clinical_studies                                  */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'fpi_clinical_studies',
        section: 'fpi_section',
        question:
          'What Clinical Studies information should be included in Section 14 of the FPI?',
        guidance:
          'Per 21 CFR 201.57(c)(15), the Clinical Studies section must describe the clinical studies that support the approved indications, including study design, patient population, endpoints, and results. The description should be sufficient for a healthcare provider to understand the basis for the indication without needing to review the full Clinical Study Report. ICH E3 provides the overall structure and content expectations for reporting clinical study results. FDA Guidance "Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics" (2018) specifies acceptable endpoints for oncology products. Key efficacy tables and figures (e.g., Kaplan-Meier curves, forest plots for subgroup analyses) should be referenced or included directly in the labeling. All pivotal studies must be described; supportive studies may be summarized more briefly.',
        fields: [
          {
            id: 'pivotal_study_design',
            label: 'Pivotal Study Design',
            type: 'textarea',
            required: true,
          },
          {
            id: 'primary_endpoint',
            label: 'Primary Endpoint',
            type: 'text',
            required: true,
          },
          {
            id: 'primary_efficacy_results',
            label: 'Primary Efficacy Results',
            type: 'textarea',
            required: true,
          },
          {
            id: 'secondary_endpoints',
            label: 'Secondary Endpoints and Results',
            type: 'textarea',
          },
          {
            id: 'subgroup_analyses',
            label: 'Subgroup Analyses',
            type: 'textarea',
          },
          {
            id: 'clinical_study_tables_figures',
            label: 'Key Tables and Figures',
            type: 'textarea',
            placeholder: 'Describe key tables and figures to include (e.g., Kaplan-Meier curves, forest plots, waterfall plots)',
          },
        ],
        defaultNext: 'pregnancy_lactation',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 4 — Use in Specific Populations
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 11 — pregnancy_lactation                                   */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'pregnancy_lactation',
        section: 'specific_populations_section',
        question:
          'What information should appear in Section 8.1 (Pregnancy) and Section 8.2 (Lactation) per the PLLR?',
        guidance:
          'Per 21 CFR 201.57(c)(9)(i)-(ii), the Pregnancy subsection must include a Risk Summary, Clinical Considerations, and Data. The Pregnancy and Lactation Labeling Rule (PLLR) Final Rule (79 FR 72064, December 4, 2014) eliminated the legacy pregnancy categories (A/B/C/D/X) and replaced them with descriptive subsections that provide more clinically useful information. FDA Guidance "Pregnancy, Lactation, and Reproductive Potential: Labeling for Human Prescription Drug and Biological Products — Content and Format" (2020) provides detailed implementation guidance. The Pregnancy Risk Summary must include the known or predicted risk based on available data, the background risk of major birth defects and miscarriage for the indicated population, and animal data with relevant dose multiples. The Lactation subsection must address whether the drug is present in human milk, effects on the breastfed infant, and effects on milk production.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'pregnancy_risk_summary',
            label: 'Pregnancy Risk Summary',
            type: 'textarea',
            required: true,
          },
          {
            id: 'pregnancy_clinical_considerations',
            label: 'Pregnancy Clinical Considerations',
            type: 'textarea',
          },
          {
            id: 'pregnancy_data_source',
            label: 'Pregnancy Data Source',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'human_prospective', label: 'Human Prospective Study' },
              { value: 'human_retrospective', label: 'Human Retrospective Study' },
              { value: 'pregnancy_registry', label: 'Pregnancy Registry' },
              { value: 'animal_data_only', label: 'Animal Data Only' },
              { value: 'mechanism_based', label: 'Mechanism-Based Assessment' },
              { value: 'no_data', label: 'No Data Available' },
            ],
          },
          {
            id: 'lactation_risk_summary',
            label: 'Lactation Risk Summary',
            type: 'textarea',
            required: true,
          },
          {
            id: 'lactation_data_available',
            label: 'Lactation Data Available',
            type: 'yes_no',
          },
          {
            id: 'reproductive_potential_contraception',
            label: 'Reproductive Potential — Contraception Requirements',
            type: 'textarea',
          },
          {
            id: 'reproductive_potential_infertility',
            label: 'Reproductive Potential — Infertility',
            type: 'textarea',
          },
        ],
        defaultNext: 'other_populations',
        issueChecks: [
          {
            id: 'pllr_compliance',
            condition: {
              field: 'pregnancy_data_source',
              operator: 'contains',
              value: 'no_data',
            },
            severity: 'warning',
            title: 'PLLR Requires Risk Summary Even Without Data',
            message:
              'Under the PLLR (effective June 2015), pregnancy labeling must include a Risk Summary even when no human or animal data are available. The summary must state the absence of data, describe the background risk of major birth defects and miscarriage for the indicated population, and provide general guidance. Old pregnancy categories (A/B/C/D/X) are no longer acceptable for new labeling.',
            reference: '21 CFR 201.57(c)(9)(i), PLLR Final Rule 79 FR 72064, FDA PLLR Guidance (2020)',
          },
        ],
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 12 — other_populations                                     */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'other_populations',
        section: 'specific_populations_section',
        question:
          'What additional specific populations information is needed — Pediatric Use, Geriatric Use, Renal Impairment, Hepatic Impairment?',
        guidance:
          'Per 21 CFR 201.57(c)(9)(iv), the Pediatric Use subsection must describe whether safety and effectiveness have been established in pediatric patients, the age groups studied, and any approved pediatric indications. The Pediatric Research Equity Act (PREA, 21 USC 355c) requires pediatric studies for all new drugs and biologics unless a waiver or deferral has been granted. FDA Guidance "Pediatric Information Incorporated Into Human Prescription Drug and Biological Products Labeling" (2019) provides detailed expectations. Per 21 CFR 201.57(c)(9)(v), the Geriatric Use subsection must describe any differences in safety or effectiveness observed in patients ≥ 65 years. Per 21 CFR 201.57(c)(9)(vi)-(vii), Renal and Hepatic Impairment subsections should describe dose adjustments with cross-references to Clinical Pharmacology (Section 12) and Dosage and Administration (Section 2).',
        fields: [
          {
            id: 'pediatric_use',
            label: 'Pediatric Use',
            type: 'textarea',
            required: true,
          },
          {
            id: 'pediatric_studies_status',
            label: 'Pediatric Studies Status',
            type: 'select',
            required: true,
            options: [
              { value: 'completed_approved', label: 'Completed — Pediatric Indication Approved' },
              { value: 'ongoing', label: 'Ongoing' },
              { value: 'waived', label: 'Waived' },
              { value: 'deferred', label: 'Deferred' },
              { value: 'not_applicable', label: 'Not Applicable' },
            ],
          },
          {
            id: 'geriatric_use',
            label: 'Geriatric Use',
            type: 'textarea',
            required: true,
          },
          {
            id: 'renal_impairment',
            label: 'Renal Impairment',
            type: 'textarea',
          },
          {
            id: 'hepatic_impairment',
            label: 'Hepatic Impairment',
            type: 'textarea',
          },
          {
            id: 'pharmacogenomic_populations',
            label: 'Pharmacogenomic Populations',
            type: 'textarea',
            placeholder: 'e.g. CYP2D6 poor metabolizers, HLA-B*5701 positive patients, G6PD-deficient patients',
          },
        ],
        defaultNext: 'medication_guide',
        issueChecks: [
          {
            id: 'pediatric_incomplete',
            condition: {
              field: 'pediatric_studies_status',
              operator: 'in',
              value: ['ongoing', 'deferred'],
            },
            severity: 'info',
            title: 'Pediatric Studies Incomplete — Post-Marketing Requirement Expected',
            message:
              'Under PREA (21 USC 355c), products with deferred or ongoing pediatric studies must include a statement in the Pediatric Use section that safety and effectiveness have not been established. A post-marketing requirement (PMR) for pediatric studies should be tracked per 21 CFR 314.81(b)(2)(vii). The labeling must be updated when pediatric data become available.',
            reference: 'PREA (21 USC 355c), 21 CFR 314.81(b)(2)(vii), FDA Pediatric Labeling Guidance',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 5 — Device Labeling
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 13 — device_label_content                                  */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'device_label_content',
        section: 'device_labeling_section',
        question:
          'Let\'s capture the device labeling content. What are the device identification, intended use, and performance details?',
        guidance:
          'Per 21 CFR 801 (General Device Labeling), all medical device labeling must include adequate directions for use, warnings, and contraindications. 21 CFR 801.109 provides an exemption from adequate directions for use for prescription devices when the device is restricted to use under the supervision of a licensed healthcare professional. EU MDR 2017/745 Annex I Chapter III specifies additional labeling requirements for devices marketed in the European Union, including Annex I Section 23 requirements for Information Supplied by the Manufacturer. Per 21 CFR 830 (Unique Device Identification), most medical devices must bear a UDI on the device label and packaging. FDA Guidance "Unique Device Identification System" (2013) and the UDI Final Rule (78 FR 58786) require the UDI-DI to be obtained from an FDA-accredited issuing agency (GS1, HIBCC, ICCBBA, or ISBT 128) and submitted to the GUDID database.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'device_description',
            label: 'Device Description',
            type: 'textarea',
            required: true,
          },
          {
            id: 'device_classification',
            label: 'Device Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'class_i', label: 'Class I' },
              { value: 'class_ii', label: 'Class II' },
              { value: 'class_iii', label: 'Class III' },
            ],
          },
          {
            id: 'intended_use_statement',
            label: 'Intended Use Statement',
            type: 'textarea',
            required: true,
          },
          {
            id: 'indications_for_use',
            label: 'Indications for Use',
            type: 'textarea',
            required: true,
          },
          {
            id: 'performance_characteristics',
            label: 'Performance Characteristics',
            type: 'textarea',
            required: true,
          },
          {
            id: 'udi_di',
            label: 'UDI-DI (Unique Device Identifier — Device Identifier)',
            type: 'text',
            placeholder: 'UDI-DI from an FDA-accredited issuing agency (GS1, HIBCC, ICCBBA, or ISBT 128)',
          },
          {
            id: 'sterilization_method',
            label: 'Sterilization Method',
            type: 'select',
            options: [
              { value: 'eto', label: 'Ethylene Oxide (EtO)' },
              { value: 'gamma', label: 'Gamma Irradiation' },
              { value: 'steam', label: 'Steam (Autoclave)' },
              { value: 'non_sterile', label: 'Non-Sterile' },
              { value: 'user_sterilize', label: 'User Sterilization Required' },
            ],
          },
          {
            id: 'shelf_life_storage',
            label: 'Shelf Life and Storage Conditions',
            type: 'textarea',
          },
        ],
        defaultNext: 'device_ifu',
        issueChecks: [
          {
            id: 'device_udi_missing',
            condition: {
              field: 'udi_di',
              operator: 'eq',
              value: '',
            },
            severity: 'warning',
            title: 'UDI-DI Not Provided',
            message:
              'Per 21 CFR 830 and the FDA UDI Final Rule, most medical devices must bear a Unique Device Identifier (UDI) on the label and device packaging. Class III devices had the earliest compliance date. Ensure the UDI-DI has been obtained from an FDA-accredited issuing agency (GS1, HIBCC, ICCBBA, or ISBT 128). The GUDID database submission must also be completed.',
            reference: '21 CFR 830, FDA UDI Final Rule 78 FR 58786, FDA GUDID Guidance',
          },
        ],
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 14 — device_ifu                                            */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'device_ifu',
        section: 'device_labeling_section',
        question:
          'What Instructions for Use (IFU) content is needed for this device?',
        guidance:
          'Per 21 CFR 801.5, device labeling must include adequate directions for use that enable a layperson to use the device safely and for its intended purposes. EU MDR 2017/745 Annex I Section 23 specifies comprehensive IFU requirements including performance characteristics, residual risks, installation instructions, and verification/calibration procedures. IEC 62366-1:2015 (Usability Engineering) requires that the IFU be developed through a human factors engineering process and validated through usability testing. FDA Guidance "Applying Human Factors and Usability Engineering to Medical Devices" (2016) provides detailed expectations for human factors validation testing, particularly for devices intended for use by patients or laypersons. The IFU format (printed, electronic, or both) should be appropriate for the intended user population and use environment.',
        fields: [
          {
            id: 'ifu_user_type',
            label: 'Intended IFU User',
            type: 'select',
            required: true,
            options: [
              { value: 'healthcare_professional', label: 'Healthcare Professional' },
              { value: 'patient_layperson', label: 'Patient / Layperson' },
              { value: 'both', label: 'Both Professional and Patient' },
              { value: 'lab_personnel', label: 'Laboratory Personnel' },
            ],
          },
          {
            id: 'step_by_step_instructions',
            label: 'Step-by-Step Instructions',
            type: 'textarea',
            required: true,
          },
          {
            id: 'contraindications_warnings',
            label: 'Contraindications and Warnings',
            type: 'textarea',
            required: true,
          },
          {
            id: 'troubleshooting',
            label: 'Troubleshooting',
            type: 'textarea',
          },
          {
            id: 'cleaning_maintenance',
            label: 'Cleaning and Maintenance',
            type: 'textarea',
          },
          {
            id: 'human_factors_tested',
            label: 'Human Factors Validation Testing Completed',
            type: 'yes_no',
            helpText:
              'Per IEC 62366-1:2015 and FDA Guidance "Applying Human Factors and Usability Engineering to Medical Devices" (2016), usability validation testing should confirm that the intended user can safely and effectively use the device based on the IFU. This is especially critical for home-use devices.',
          },
        ],
        defaultNext: 'patient_counseling',
        issueChecks: [
          {
            id: 'home_use_literacy',
            condition: {
              field: 'ifu_user_type',
              operator: 'in',
              value: ['patient_layperson', 'both'],
            },
            severity: 'warning',
            title: 'Patient/Layperson IFU — Readability Requirements',
            message:
              'Instructions for Use intended for patients or laypersons must be written at an appropriate literacy level (FDA recommends 6th-8th grade reading level). Per FDA Guidance "Applying Human Factors and Usability Engineering to Medical Devices" (2016), human factors validation testing should confirm that the intended user can safely and effectively use the device based on the IFU alone. Consider plain language review and pictographic aids.',
            reference: '21 CFR 801.4, FDA Human Factors Guidance (2016), IEC 62366-1:2015',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 6 — Patient Labeling
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 15 — medication_guide                                      */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'medication_guide',
        section: 'patient_labeling_section',
        question:
          'Is a Medication Guide required, and what content should it include?',
        guidance:
          'Per 21 CFR 208, a Medication Guide is required when FDA determines that certain information is necessary to prevent serious adverse effects, patient adherence to directions for use is essential to efficacy, or the product has a REMS with an approved Medication Guide component. 21 CFR 201.57(c)(18) requires the Patient Counseling Information section to reference any FDA-approved patient labeling. FDA Guidance "Useful Written Consumer Medication Information" (2006) provides recommendations for content, format, and readability of patient-directed labeling. Medication Guides must be written at an appropriate literacy level (6th-8th grade reading level recommended), use a standardized format with specific headings (What is the most important information I should know about [Drug]?, What is [Drug]?, etc.), and be reviewed and approved by FDA prior to distribution.',
        fields: [
          {
            id: 'medication_guide_required',
            label: 'Medication Guide Required',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'medication_guide_reason',
            label: 'Reason for Medication Guide',
            type: 'select',
            visibleWhen: {
              field: 'medication_guide_required',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'serious_risk_mitigation', label: 'Serious Risk Mitigation' },
              { value: 'adherence_critical', label: 'Patient Adherence Critical to Efficacy' },
              { value: 'rems_component', label: 'REMS Component' },
              { value: 'fda_required', label: 'FDA Required (Other Reason)' },
            ],
          },
          {
            id: 'medication_guide_key_messages',
            label: 'Medication Guide Key Messages',
            type: 'textarea',
            visibleWhen: {
              field: 'medication_guide_required',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'patient_package_insert',
            label: 'Patient Package Insert Included',
            type: 'yes_no',
          },
          {
            id: 'literacy_level',
            label: 'Target Literacy Level',
            type: 'select',
            required: true,
            options: [
              { value: '6th_grade', label: '6th Grade' },
              { value: '8th_grade_recommended', label: '8th Grade (Recommended)' },
              { value: '10th_grade', label: '10th Grade' },
              { value: 'professional', label: 'Professional Level' },
            ],
          },
          {
            id: 'languages_required',
            label: 'Languages Required',
            type: 'multi_select',
            options: [
              { value: 'english', label: 'English' },
              { value: 'spanish', label: 'Spanish' },
              { value: 'french', label: 'French' },
              { value: 'mandarin', label: 'Mandarin' },
              { value: 'japanese', label: 'Japanese' },
              { value: 'other', label: 'Other' },
            ],
          },
        ],
        defaultNext: 'patient_counseling',
        issueChecks: [
          {
            id: 'med_guide_rems',
            condition: {
              field: 'medication_guide_required',
              operator: 'eq',
              value: true,
            },
            severity: 'info',
            title: 'Medication Guide Distribution Requirements',
            message:
              'Per 21 CFR 208.24, a Medication Guide must be provided to the patient with each dispensing of the drug product. If the Medication Guide is part of a REMS, additional distribution requirements may apply per 21 USC 355-1. The pharmacist or dispenser is responsible for ensuring the Medication Guide accompanies the product. Content must be reviewed and approved by FDA before distribution.',
            reference: '21 CFR 208.24, 21 USC 355-1, FDA REMS Guidance',
          },
        ],
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 16 — patient_counseling                                    */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'patient_counseling',
        section: 'patient_labeling_section',
        question:
          'What Patient Counseling Information should healthcare providers communicate to patients?',
        guidance:
          'Per 21 CFR 201.57(c)(18), the Patient Counseling Information section (Section 17 of the FPI) must include information to help healthcare providers counsel patients about the safe and effective use of the product. This section should include counseling points derived from the Warnings and Precautions, Adverse Reactions, Drug Interactions, and Dosage and Administration sections. FDA expects actionable, patient-relevant counseling points rather than a restatement of the full prescribing information. If a Medication Guide or Patient Package Insert has been approved, this section must reference it by title and advise the prescriber to provide it to the patient. The section should also reference the MedWatch reporting number (1-800-FDA-1088) for patients to report adverse reactions.',
        fields: [
          {
            id: 'key_counseling_points',
            label: 'Key Counseling Points',
            type: 'textarea',
            required: true,
          },
          {
            id: 'when_to_seek_medical_attention',
            label: 'When to Seek Immediate Medical Attention',
            type: 'textarea',
            required: true,
          },
          {
            id: 'adherence_instructions',
            label: 'Adherence Instructions',
            type: 'textarea',
          },
          {
            id: 'disposal_instructions',
            label: 'Disposal Instructions',
            type: 'textarea',
          },
          {
            id: 'fda_hotline_reference',
            label: 'FDA MedWatch Hotline Reference',
            type: 'yes_no',
            helpText:
              'Section 17 should reference 1-800-FDA-1088 for MedWatch adverse reaction reporting. This is standard practice per FDA labeling conventions and allows patients and providers to report suspected adverse reactions directly to FDA.',
          },
        ],
        defaultNext: 'safety_labeling_changes',
        issueChecks: [
          {
            id: 'patient_counseling_incomplete',
            condition: {
              field: 'when_to_seek_medical_attention',
              operator: 'eq',
              value: '',
            },
            severity: 'warning',
            title: 'Missing Emergency Contact Guidance',
            message:
              'Per 21 CFR 201.57(c)(18), Patient Counseling Information should include situations where the patient must seek immediate medical attention. This is particularly important for products with Boxed Warnings, serious hypersensitivity risks, or dose-limiting toxicities. Omitting this guidance may result in an FDA refuse-to-file or complete response letter.',
            reference: '21 CFR 201.57(c)(18), FDA PLR Guidance',
          },
        ],
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 7 — Safety Communications
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 17 — safety_labeling_changes                               */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'safety_labeling_changes',
        section: 'safety_communication_section',
        question:
          'Are there any safety labeling changes (SLCs) or safety-related supplements being proposed?',
        guidance:
          'Per 21 CFR 314.70, labeling supplements vary by urgency and type. A Changes Being Effected in 0 days (CBE-0) supplement per 21 CFR 314.70(c)(6)(iii) allows immediate implementation of safety labeling changes to add or strengthen a contraindication, warning, precaution, or adverse reaction. A CBE-30 supplement per 21 CFR 314.70(c) requires 30 days\' notice before implementation. Prior Approval Supplements per 21 CFR 314.70(b) require FDA approval before implementation and are typically used for efficacy-related labeling changes. FDA Guidance "Safety Labeling Changes — Implementation of Section 505(o)(4) of the FD&C Act" (2013) provides detailed guidance on the CBE process. The MedWatch process per 21 CFR 314.80 and 314.98 governs the reporting of adverse events that may trigger safety labeling changes.',
        fields: [
          {
            id: 'slc_proposed',
            label: 'Safety Labeling Change Proposed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'slc_type',
            label: 'Supplement Type',
            type: 'select',
            visibleWhen: {
              field: 'slc_proposed',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'cbe_0', label: 'CBE-0 (Changes Being Effected — 0 Days)' },
              { value: 'cbe_30', label: 'CBE-30 (Changes Being Effected — 30 Days)' },
              { value: 'prior_approval', label: 'Prior Approval Supplement' },
              { value: 'annual_report', label: 'Annual Report' },
            ],
          },
          {
            id: 'slc_sections_affected',
            label: 'Labeling Sections Affected',
            type: 'multi_select',
            visibleWhen: {
              field: 'slc_proposed',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'boxed_warning', label: 'Boxed Warning' },
              { value: 'contraindications', label: 'Contraindications' },
              { value: 'warnings_precautions', label: 'Warnings and Precautions' },
              { value: 'adverse_reactions', label: 'Adverse Reactions' },
              { value: 'drug_interactions', label: 'Drug Interactions' },
              { value: 'specific_populations', label: 'Use in Specific Populations' },
              { value: 'patient_counseling', label: 'Patient Counseling Information' },
              { value: 'medication_guide', label: 'Medication Guide' },
            ],
          },
          {
            id: 'slc_rationale',
            label: 'Rationale for Safety Labeling Change',
            type: 'textarea',
            visibleWhen: {
              field: 'slc_proposed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'new_safety_signal_source',
            label: 'Source of New Safety Signal',
            type: 'multi_select',
            visibleWhen: {
              field: 'slc_proposed',
              operator: 'eq',
              value: true,
            },
            options: [
              { value: 'clinical_trial', label: 'Clinical Trial Data' },
              { value: 'postmarket_spontaneous', label: 'Post-Market Spontaneous Reports' },
              { value: 'epidemiologic_study', label: 'Epidemiologic Study' },
              { value: 'literature', label: 'Published Literature' },
              { value: 'foreign_regulatory', label: 'Foreign Regulatory Authority Action' },
              { value: 'signal_detection', label: 'Signal Detection / Data Mining' },
            ],
          },
        ],
        defaultNext: 'risk_communication',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 18 — risk_communication                                    */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'risk_communication',
        section: 'safety_communication_section',
        question:
          'What risk communication activities are planned or required alongside the labeling changes?',
        guidance:
          'FDA Drug Safety Communications (DSCs) are issued by the Office of Surveillance and Epidemiology (OSE) to inform the public about new safety information. The DSC process includes an initial communication, updates as new information becomes available, and a final summary. REMS communication plan requirements per 21 USC 355-1(e)(3) may mandate specific outreach to healthcare providers. Dear Healthcare Provider (DHCP) letters per FDA Guidance "Dear Health Care Provider Letters: Improving Communication of Important Safety Information" (2014) are used for urgent safety communications and must be submitted to FDA for review. The risk communication strategy should identify the target audience, key messages, communication channels, and timing relative to the labeling change effective date.',
        fields: [
          {
            id: 'dear_hcp_letter_planned',
            label: 'Dear Healthcare Provider Letter Planned',
            type: 'yes_no',
          },
          {
            id: 'drug_safety_communication',
            label: 'FDA Drug Safety Communication Expected',
            type: 'yes_no',
          },
          {
            id: 'risk_communication_channels',
            label: 'Risk Communication Channels',
            type: 'multi_select',
            options: [
              { value: 'medwatch_alert', label: 'MedWatch Safety Alert' },
              { value: 'dear_hcp_letter', label: 'Dear Healthcare Provider Letter' },
              { value: 'press_release', label: 'Press Release' },
              { value: 'safety_labeling_supplement', label: 'Safety Labeling Supplement' },
              { value: 'fda_drug_safety_podcast', label: 'FDA Drug Safety Podcast' },
              { value: 'rems_notification', label: 'REMS Notification' },
            ],
          },
          {
            id: 'key_safety_messages',
            label: 'Key Safety Messages',
            type: 'textarea',
          },
          {
            id: 'target_audience',
            label: 'Target Audience',
            type: 'multi_select',
            options: [
              { value: 'prescribers', label: 'Prescribers' },
              { value: 'pharmacists', label: 'Pharmacists' },
              { value: 'patients', label: 'Patients' },
              { value: 'payers', label: 'Payers / Health Plans' },
              { value: 'specialty_societies', label: 'Specialty Societies' },
            ],
          },
        ],
        defaultNext: 'regulatory_review_status',
      },

      /* ══════════════════════════════════════════════════════════════════
       *  Section 8 — Regulatory Review
       * ══════════════════════════════════════════════════════════════════ */

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 19 — regulatory_review_status                              */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'regulatory_review_status',
        section: 'regulatory_review_section',
        question:
          'What is the current regulatory review status and timeline for this labeling?',
        guidance:
          'Per 21 CFR 314.70, the supplement type determines the review timeline and process. PDUFA (Prescription Drug User Fee Act) goal dates establish the target review completion date for original applications and efficacy supplements. Labeling negotiations between the sponsor and FDA review division typically occur during the review cycle and may involve multiple rounds of comments and responses. Pre-approval labeling meetings may be requested per FDA Guidance "Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products" (2017). For safety labeling changes, the CBE-0 mechanism allows immediate implementation while the supplement is under review. The review stage, outstanding FDA comments, and target effective date should be tracked to ensure timely implementation of the approved labeling.',
        fields: [
          {
            id: 'review_stage',
            label: 'Current Review Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'pre_submission', label: 'Pre-Submission' },
              { value: 'under_review', label: 'Under Review' },
              { value: 'labeling_negotiations', label: 'Labeling Negotiations' },
              { value: 'approval_pending', label: 'Approval Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'post_approval_supplement', label: 'Post-Approval Supplement' },
            ],
          },
          {
            id: 'pdufa_goal_date',
            label: 'PDUFA Goal Date',
            type: 'text',
            placeholder: 'e.g. 2025-03-15',
          },
          {
            id: 'labeling_negotiation_status',
            label: 'Labeling Negotiation Status',
            type: 'select',
            options: [
              { value: 'not_started', label: 'Not Started' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'fda_comments_received', label: 'FDA Comments Received' },
              { value: 'sponsor_response_submitted', label: 'Sponsor Response Submitted' },
              { value: 'agreement_reached', label: 'Agreement Reached' },
            ],
          },
          {
            id: 'outstanding_fda_comments',
            label: 'Outstanding FDA Comments',
            type: 'textarea',
          },
          {
            id: 'advisory_committee_date',
            label: 'Advisory Committee Date',
            type: 'text',
            placeholder: 'If applicable',
          },
          {
            id: 'target_labeling_effective_date',
            label: 'Target Labeling Effective Date',
            type: 'text',
          },
        ],
        defaultNext: 'promotional_consistency',
      },

      /* ────────────────────────────────────────────────────────────────── */
      /*  Node 20 — promotional_consistency                               */
      /* ────────────────────────────────────────────────────────────────── */
      {
        id: 'promotional_consistency',
        section: 'regulatory_review_section',
        question:
          'Is the labeling consistent with promotional materials, and are there any OPDP considerations?',
        guidance:
          'Per 21 CFR 202.1, prescription drug advertising must be consistent with approved labeling and present a fair balance of efficacy and risk information. FDA\'s Office of Prescription Drug Promotion (OPDP) enforces these requirements and can issue Warning Letters or Untitled Letters for materials that are false, lacking in fair balance, or that make claims beyond the approved indications. FDA Guidance "Presenting Risk Information in Prescription Drug and Medical Device Promotion" (2009) provides detailed expectations for risk presentation in promotional materials. The Lanham Act Section 43(a) (15 USC 1125(a)) provides an additional legal basis for competitors to challenge false or misleading promotional claims. All promotional materials — including digital and social media content — must be updated to reflect the current approved labeling before distribution. Materials disseminated before labeling approval may constitute pre-approval promotion, which is prohibited under FDCA Section 301.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'promotional_materials_reviewed',
            label: 'Promotional Materials Reviewed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'promotional_consistency_confirmed',
            label: 'Promotional Consistency Confirmed',
            type: 'yes_no',
            visibleWhen: {
              field: 'promotional_materials_reviewed',
              operator: 'eq',
              value: true,
            },
          },
          {
            id: 'off_label_promotion_risk',
            label: 'Off-Label Promotion Risk Assessment',
            type: 'textarea',
          },
          {
            id: 'fair_balance_assessment',
            label: 'Fair Balance Assessment',
            type: 'textarea',
            helpText:
              'OPDP requires that promotional materials present a fair balance of efficacy and risk information. Risk information must be presented with a prominence and readability reasonably comparable to the efficacy claims per 21 CFR 202.1(e)(5). Consider both print/digital and broadcast/social media materials.',
          },
          {
            id: 'social_media_labeling_considerations',
            label: 'Social Media and Digital Labeling Considerations',
            type: 'textarea',
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'promotional_inconsistency',
            condition: {
              field: 'promotional_consistency_confirmed',
              operator: 'eq',
              value: false,
            },
            severity: 'critical',
            title: 'Promotional Materials Inconsistent with Labeling',
            message:
              'Per 21 CFR 202.1 and FDCA Section 502(a), promotional materials must be consistent with approved labeling and may not make claims beyond the approved indications. OPDP can issue Warning Letters or Untitled Letters for promotional materials that are false or misleading, or that omit material facts from the labeling. Ensure all promotional materials are updated to reflect the current approved labeling before distribution.',
            reference: '21 CFR 202.1, FDCA Section 502(a), OPDP Regulatory Letters Database',
          },
        ],
      },
    ],
  };
}
